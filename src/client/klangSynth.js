/**
 * Klangsynthese aus Profilen (`klangProfile.js`) und der gemeinsame Klanggraph.
 *
 * Alles hier nimmt einen `AudioContext` oder `OfflineAudioContext` entgegen und
 * nutzt nur Standardknoten; dieselbe Kette läuft im Spiel und in der
 * Offline-Auswertung (`tools/klang-auswertung.mjs`). Knoten, die ein Kontext
 * nicht kennt (Attrappen in Tests), werden übersprungen statt zu werfen.
 *
 * Graph: Stimme → Bus (schuss/treffer/umgebung/ui) → Ausgang (Effekt-Lautstärke)
 * → Kompressor → weicher Begrenzer (WaveShaper, Spitze ≤ 0,98) → Lautsprecher.
 * Der Hall ist ein gemeinsamer Faltungsknoten; jede Stimme schickt einen Teil
 * ihres Pegels dorthin. Das Rauschen ist ein einziger Puffer (braun + weiß).
 *
 * @module klangSynth
 */

import { BUSSE, HALL_DAUER, profilDauer, streue, mulberry } from './klangProfile.js';

/** Grundpegel der Busse. */
const BUS_PEGEL = Object.freeze({ schuss: 0.9, treffer: 1, umgebung: 0.85, ui: 0.7 });

/** Länge je Rauschart im gemeinsamen Puffer (s). */
const RAUSCH_TEIL = 2.5;

/** Linear bis hierher, danach weiche Sättigung bis 0,98. */
const KNIE = 0.7;
const SPITZE = 0.98;

/**
 * Ein einziger Rauschpuffer: erste Hälfte braun (wie `sound.js#erzeugeRauschen`),
 * zweite Hälfte weiß. So kostet das Rauschen genau eine Allokation.
 */
function erzeugeRauschSatz(ctx, zufall = Math.random) {
  const teil = Math.floor(ctx.sampleRate * RAUSCH_TEIL);
  const puffer = ctx.createBuffer(1, teil * 2, ctx.sampleRate);
  const daten = puffer.getChannelData(0);
  let letzter = 0;
  for (let i = 0; i < teil; i += 1) {
    letzter = (letzter + 0.02 * (zufall() * 2 - 1)) / 1.02;
    daten[i] = letzter * 3.5;
  }
  for (let i = teil; i < teil * 2; i += 1) daten[i] = zufall() * 2 - 1;
  return puffer;
}

/** Startversatz im Rauschpuffer für eine Schicht der Länge `laenge`. */
function rauschVersatz(farbe, laenge, zufall) {
  const frei = Math.max(0, RAUSCH_TEIL - laenge - 0.05);
  return (farbe === 'braun' ? 0 : RAUSCH_TEIL) + zufall() * frei;
}

/** Kennlinie des weichen Begrenzers: linear bis `KNIE`, dann Sättigung gegen `SPITZE`. */
export function weicheKennlinie(x) {
  const a = Math.abs(x);
  if (a <= KNIE) return x;
  const y = KNIE + (SPITZE - KNIE) * Math.tanh((a - KNIE) / (SPITZE - KNIE));
  return x < 0 ? -y : y;
}

function setze(param, wert) {
  if (param && 'value' in param) param.value = wert;
}

/** Impulsantwort des gemeinsamen Halls: abklingendes Rauschen, nach hinten dunkler. */
function erzeugeHall(ctx) {
  const laenge = Math.floor(ctx.sampleRate * HALL_DAUER);
  const puffer = ctx.createBuffer(2, laenge, ctx.sampleRate);
  const zufall = mulberry(7919);
  for (let k = 0; k < 2; k += 1) {
    const daten = puffer.getChannelData(k);
    let glatt = 0;
    for (let i = 0; i < laenge; i += 1) {
      const t = i / laenge;
      const koeff = 0.9 - 0.8 * t;
      glatt += (((zufall() * 2 - 1) - glatt)) * koeff;
      const ausblenden = Math.min(1, (laenge - i) / (0.05 * ctx.sampleRate));
      daten[i] = glatt * Math.exp(-6.9 * t) * ausblenden * 0.5;
    }
  }
  return puffer;
}

/**
 * Baut Busse, Ausgang, Begrenzer, Hall und Rauschen auf `ctx`.
 *
 * @param {BaseAudioContext} ctx
 * @param {{lautstaerke?: number, zufall?: () => number}} [optionen]
 */
export function baueKlangGraph(ctx, { lautstaerke = 0.8, zufall = Math.random } = {}) {
  const ausgang = ctx.createGain();
  ausgang.gain.value = lautstaerke;

  const busse = {};
  for (const name of BUSSE) {
    const g = ctx.createGain();
    g.gain.value = BUS_PEGEL[name];
    g.connect(ausgang);
    busse[name] = g;
  }

  let eingang = ctx.destination;
  const kette = [];
  const kompressor = ctx.createDynamicsCompressor?.();
  if (kompressor) {
    setze(kompressor.threshold, -12);
    setze(kompressor.knee, 6);
    setze(kompressor.ratio, 12);
    setze(kompressor.attack, 0.002);
    setze(kompressor.release, 0.15);
    kette.push(kompressor);
  }
  const formung = ctx.createWaveShaper?.();
  if (formung) {
    const punkte = 4097;
    const kurve = new Float32Array(punkte);
    for (let i = 0; i < punkte; i += 1) kurve[i] = weicheKennlinie((i / (punkte - 1)) * 2 - 1);
    // Eingang −1..+1 liegt auf der Kurve; Werte darüber klemmen auf das Ende (≤ SPITZE).
    formung.curve = kurve;
    formung.oversample = '2x';
    kette.push(formung);
  }
  // Eingang der Kette ist der Kompressor (die Musik hängt dort), danach der weiche Begrenzer.
  let weiter = ctx.destination;
  for (let i = kette.length - 1; i >= 0; i -= 1) {
    kette[i].connect(weiter);
    weiter = kette[i];
  }
  eingang = weiter;
  ausgang.connect(eingang);

  let halle = null;
  if (ctx.createConvolver) {
    const faltung = ctx.createConvolver();
    faltung.buffer = erzeugeHall(ctx);
    const eingangHalle = ctx.createGain();
    eingangHalle.gain.value = 1;
    const rueck = ctx.createGain();
    rueck.gain.value = 0.7;
    eingangHalle.connect(faltung);
    faltung.connect(rueck);
    rueck.connect(ausgang);
    halle = { eingang: eingangHalle };
  }

  return {
    ctx, ausgang, busse, halle, eingang, zufall, grundpegel: BUS_PEGEL, rauschen: erzeugeRauschSatz(ctx, zufall),
  };
}

function huellkurve(param, t, an, ab, spitze) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0001, spitze), t + an);
  param.exponentialRampToValueAtTime(0.0001, t + an + ab);
}

function baueRausch(ctx, graph, s, t, ziel, v, quellen) {
  const laenge = s.an + s.ab;
  const quelle = ctx.createBufferSource();
  quelle.buffer = graph.rauschen;
  const filter = ctx.createBiquadFilter();
  filter.type = s.filter;
  setze(filter.Q, s.q ?? 0.8);
  const f0 = s.f0 * v.filter;
  filter.frequency.setValueAtTime(f0, t + s.start);
  if (s.f1) filter.frequency.exponentialRampToValueAtTime(s.f1 * v.filter, t + s.start + (s.sweep ?? laenge));
  const huelle = ctx.createGain();
  huellkurve(huelle.gain, t + s.start, s.an, s.ab, s.pegel * v.pegel);
  let kette = quelle.connect(filter);
  if (s.hp) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = s.hp * v.filter;
    kette = kette.connect(hp);
  }
  kette.connect(huelle).connect(ziel);
  quelle.start(t + s.start, rauschVersatz(s.farbe, laenge, graph.zufall));
  quelle.stop(t + s.start + laenge + 0.02);
  quellen.push(quelle);
  return t + s.start + laenge;
}

function baueTon(ctx, s, t, ziel, v, quellen) {
  const laenge = s.an + s.ab;
  const huelle = ctx.createGain();
  huellkurve(huelle.gain, t + s.start, s.an, s.ab, s.pegel * v.pegel);
  let ausgangKnoten = huelle;
  if (s.zittern) {
    const am = ctx.createGain();
    setze(am.gain, 1 - s.zittern.tiefe / 2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = s.zittern.hz;
    const lfoPegel = ctx.createGain();
    lfoPegel.gain.value = s.zittern.tiefe / 2;
    lfo.connect(lfoPegel).connect(am.gain);
    lfo.start(t + s.start);
    lfo.stop(t + s.start + laenge + 0.02);
    quellen.push(lfo);
    huelle.connect(am);
    ausgangKnoten = am;
  }
  ausgangKnoten.connect(ziel);

  const stimmen = [[1, 1], ...(s.partiale ?? [])];
  for (const [verhaeltnis, pegel] of stimmen) {
    const osc = ctx.createOscillator();
    osc.type = s.welle;
    const f0 = s.f0 * v.ton * verhaeltnis;
    osc.frequency.setValueAtTime(f0, t + s.start);
    if (s.f1) osc.frequency.exponentialRampToValueAtTime(s.f1 * v.ton * verhaeltnis, t + s.start + (s.gleit ?? laenge));
    if (s.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = s.vibrato.hz;
      const tiefe = ctx.createGain();
      tiefe.gain.value = f0 * s.vibrato.tiefe;
      lfo.connect(tiefe).connect(osc.frequency);
      lfo.start(t + s.start);
      lfo.stop(t + s.start + laenge + 0.02);
      quellen.push(lfo);
    }
    if (pegel === 1) {
      osc.connect(huelle);
    } else {
      const g = ctx.createGain();
      g.gain.value = pegel;
      osc.connect(g).connect(huelle);
    }
    osc.start(t + s.start);
    osc.stop(t + s.start + laenge + 0.02);
    quellen.push(osc);
  }
  return t + s.start + laenge;
}

function baueKnistern(ctx, graph, s, t, ziel, v, quellen) {
  const quelle = ctx.createBufferSource();
  quelle.buffer = graph.rauschen;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  setze(filter.Q, s.q);
  const huelle = ctx.createGain();
  const breite = s.fenster / s.n;
  const ab = Math.min(s.ab, breite * 0.45);
  const z = graph.zufall;
  huelle.gain.setValueAtTime(0.0001, t + s.start);
  for (let i = 0; i < s.n; i += 1) {
    const ti = t + s.start + i * breite + z() * breite * 0.45;
    const f = (s.fmin * ((s.fmax / s.fmin) ** z())) * v.filter;
    filter.frequency.setValueAtTime(f, ti);
    huelle.gain.setValueAtTime(0.0001, ti);
    huelle.gain.exponentialRampToValueAtTime(Math.max(0.0001, s.pegel * v.pegel * (0.5 + 0.5 * z())), ti + 0.002);
    huelle.gain.exponentialRampToValueAtTime(0.0001, ti + 0.002 + ab);
  }
  const ende = t + s.start + s.fenster + s.ab;
  quelle.connect(filter).connect(huelle).connect(ziel);
  quelle.start(t + s.start, rauschVersatz(s.farbe, s.fenster + s.ab, z));
  quelle.stop(ende + 0.02);
  quellen.push(quelle);
  return ende;
}

/**
 * Spielt ein Profil auf dem Graphen.
 *
 * @param {object} graph aus `baueKlangGraph`
 * @param {object} profil Eintrag aus `ALLE_PROFILE`
 * @param {object} [optionen]
 * @param {number} [optionen.zeit] Startzeit im Kontext
 * @param {number} [optionen.pegel] Zusatzfaktor (Entfernung, Härte)
 * @param {number} [optionen.pan] −1..1
 * @param {number} [optionen.tiefpass] Grenzfrequenz in Hz, 0 = aus
 * @param {number} [optionen.tonhoehe] Zusatzfaktor auf alle Frequenzen
 * @returns {{ende:number, kappen:(zeit:number)=>void, start:number}}
 */
export function spieleProfil(graph, profil, {
  zeit, pegel = 1, pan = 0, tiefpass = 0, tonhoehe = 1,
} = {}) {
  const { ctx } = graph;
  const t = zeit ?? ctx.currentTime;
  const z = graph.zufall;
  const v = {
    ton: streue(z, profil.streuung.ton) * tonhoehe,
    filter: streue(z, profil.streuung.filter) * tonhoehe,
    pegel: streue(z, profil.streuung.pegel),
  };

  const stimme = ctx.createGain();
  stimme.gain.value = profil.pegel * pegel;
  let hinten = stimme;
  if (tiefpass > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tiefpass;
    hinten = hinten.connect(f);
  }
  if (Math.abs(pan) > 0.01 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    hinten = hinten.connect(p);
  }
  hinten.connect(graph.busse[profil.bus] ?? graph.busse.umgebung);
  if (graph.halle && profil.nachhall > 0) {
    const sende = ctx.createGain();
    sende.gain.value = profil.nachhall;
    hinten.connect(sende).connect(graph.halle.eingang);
    // Der Sendeweg hängt an `hinten` (nach Pegel/Pan); abgeschlossen wird er mit der Stimme.
  }

  const quellen = [];
  let ende = t;
  for (const s of profil.schichten) {
    let e;
    if (s.art === 'rausch') e = baueRausch(ctx, graph, s, t, stimme, v, quellen);
    else if (s.art === 'ton') e = baueTon(ctx, s, t, stimme, v, quellen);
    else e = baueKnistern(ctx, graph, s, t, stimme, v, quellen);
    if (e > ende) ende = e;
  }

  const kappen = (jetzt) => {
    const g = stimme.gain;
    g.cancelScheduledValues?.(jetzt);
    g.setValueAtTime?.(g.value ?? 0, jetzt);
    g.linearRampToValueAtTime?.(0, jetzt + 0.03);
    for (const q of quellen) {
      try { q.stop(jetzt + 0.04); } catch { /* war schon beendet */ }
    }
  };
  return {
    start: t, ende: ende + (profil.nachhall > 0 ? HALL_DAUER : 0.02), klangEnde: ende, kappen, dauer: profilDauer(profil),
  };
}
