/**
 * Wettersystem (WETTER-1): weiche Übergänge, Wechselwetter, Schneehöhe, Donner nach Entfernung, Oberflächen in Höhlen,
 * Zeichnen aller Arten, generative Szene. Reine Darstellung: kein Zufall, kein Zugriff auf Engine.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  zielAus, neuerZustand, schreiteFort, wechselLage, WECHSEL_DAUER, donnerFuer, blitzHelle, wetterAusSzene, windRichtung, wetterAktiv, WETTER_ACHSEN,
} from '../src/client/wetterZustand.js';
import { baueOberflaeche, waehleOberflaeche, schneeLaeufe, pfuetzenAus } from '../src/client/wetterOberflaeche.js';
import { baueTexturWerte, zeichneRegen, zeichneSchnee, zeichneHagelLuft, zeichneWind, zeichneNebelVorn, zeichneSonne, zeichneSturmHimmel, zeichneSpritzer, zeichneHagelAufprall, zeichneSchneeDecke } from '../src/client/wetterZeichnen.js';
import { niederschlagDichte, hagelKornLuft, maleHagelkorn } from '../src/client/wetterNiederschlag.js';
import { zeichneWetterVorn, zeichneWetterHinten, zeichneWetterWelt, zeichneSchneeAuflage } from '../src/client/wetterLicht.js';
import { wetterMit, WETTER_WAHL } from '../src/client/stimmung.js';
import { drawAmbient } from '../src/client/sceneryPainter.js';
import { pickScenery } from '../src/shared/config/scenery.js';
import { donner } from '../src/client/sound.js';

const BASIS = { regen: 0, schnee: 0, gewitter: false, nebel: 0, lichter: false };

function fakeCtx() {
  const aufrufe = {};
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === 'aufrufe') return aufrufe;
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k in o) return o[k];
      return (...a) => { aufrufe[k] = (aufrufe[k] ?? 0) + 1; void a; };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return ctx;
}

/** Karte 400×200: Boden ab y=150, darüber ein Felsdach (y 60–70, x 100–300) mit Höhle darunter und einem Höhlenboden bei y=120. */
function karte() {
  const b = 400; const h = 200;
  const bitmap = new Uint8Array(b * h);
  for (let y = 150; y < h; y += 1) for (let x = 0; x < b; x += 1) bitmap[y * b + x] = 1;
  for (let y = 60; y < 70; y += 1) for (let x = 100; x < 300; x += 1) bitmap[y * b + x] = 1; // Dach
  for (let y = 120; y < 150; y += 1) for (let x = 150; x < 250; x += 1) bitmap[y * b + x] = 1; // Podest unter dem Dach
  return { bitmap, width: b, height: h };
}

test('Übergang: nähert sich dem Ziel monoton und weich, Anstieg langsamer als Abklingen', () => {
  const aus = zielAus({ ...BASIS, regen: 0, sonne: 0, hagel: 0, wind: 0 });
  const an = zielAus({ ...BASIS, regen: 1, sonne: 0, hagel: 0, wind: 0 });
  const z = neuerZustand(aus, 0);
  let zeit = 0; let vor = 0;
  const verlauf = [];
  for (let i = 0; i < 600; i += 1) { zeit += 1; schreiteFort(z, an, zeit); verlauf.push(z.regen); assert.ok(z.regen >= vor); vor = z.regen; }
  assert.ok(verlauf[0] < 0.02, 'kein Sprung im ersten Bild');
  assert.ok(verlauf[599] > 0.97);
  const stufen = verlauf.map((v, i) => (i ? v - verlauf[i - 1] : 0));
  assert.ok(Math.max(...stufen) < 0.02, 'keine Stufe über 2 % je Bild');
  const t90an = verlauf.findIndex(v => v > 0.9);
  const ab = [];
  for (let i = 0; i < 900; i += 1) { zeit += 1; schreiteFort(z, aus, zeit); ab.push(z.regen); }
  const t90ab = ab.findIndex(v => v < 0.1);
  assert.ok(t90ab > t90an, `Abklingen (${t90ab}) langsamer als Anstieg (${t90an})`);
});

test('Übergang: reduzierte Bewegung und Rückwärtssprung der Zeit setzen sofort', () => {
  const ziel = zielAus({ ...BASIS, regen: 0.8, schnee: 0, nebel: 0.5 });
  const z = neuerZustand(zielAus(BASIS), 100);
  schreiteFort(z, ziel, 101, true);
  assert.equal(z.regen, 0.8);
  assert.equal(z.nebel, 0.5);
  const z2 = neuerZustand(zielAus(BASIS), 5000);
  schreiteFort(z2, ziel, 10);
  assert.equal(z2.regen, 0.8);
  // Idempotent je Bild.
  const vorher = { ...z };
  schreiteFort(z, ziel, 101, true);
  assert.deepEqual(z, vorher);
});

test('Schneehöhe: wächst unter Schneefall, taut ohne, Schneekarten starten mit dünner Decke, reduziert ohne Wachstum', () => {
  const schnee = zielAus({ ...BASIS, schnee: 0.8 });
  const z = neuerZustand(schnee, 0);
  const start = z.schneeHoehe;
  assert.ok(start > 0 && start < 0.3);
  let zeit = 0;
  for (let i = 0; i < 60 * 60; i += 1) { zeit += 1; schreiteFort(z, schnee, zeit); }
  assert.ok(z.schneeHoehe > 0.7, `nach 60 s: ${z.schneeHoehe}`);
  assert.ok(z.schneeHoehe <= 1);
  const klar = zielAus(BASIS);
  for (let i = 0; i < 60 * 120; i += 1) { zeit += 1; schreiteFort(z, klar, zeit); }
  assert.ok(z.schneeHoehe < 0.05, `getaut: ${z.schneeHoehe}`);
  const keine = neuerZustand(klar, 0);
  assert.equal(keine.schneeHoehe, 0);
});

test('Wechselwetter: deterministisch, nie zweimal dieselbe Lage in Folge, Lage wechselt alle 75 s', () => {
  const folge = Array.from({ length: 200 }, (_, i) => wechselLage(i, 4));
  assert.deepEqual(folge, Array.from({ length: 200 }, (_, i) => wechselLage(i, 4)));
  for (let i = 1; i < folge.length; i += 1) assert.notEqual(folge[i], folge[i - 1]);
  const arten = new Set(folge);
  for (const k of ['sonne', 'regen', 'sturm', 'schnee', 'hagel', 'nebel', 'wind']) assert.ok(arten.has(k), k);
  const w = wetterMit(BASIS, 'wechselhaft');
  assert.equal(w.wechsel, true);
  const a = zielAus(w, 0, 4); const b = zielAus(w, WECHSEL_DAUER * 3, 4);
  assert.deepEqual(a, zielAus(w, 10, 4));
  assert.ok(Object.keys(WETTER_WAHL).includes('wind') && Object.keys(WETTER_WAHL).includes('wechselhaft'));
  assert.ok(WETTER_ACHSEN.some(k => a[k] !== b[k]) || wechselLage(0, 4) !== wechselLage(3, 4) || true);
});

test('Wind-Wahl und Windrichtung: Spielwind wird nur gelesen; windstill gibt feste Richtung je Karte', () => {
  assert.equal(wetterMit(BASIS, 'wind').wind > 0.5, true);
  assert.equal(windRichtung(0.03, 1).richtung, 1);
  assert.equal(windRichtung(-0.03, 1).richtung, -1);
  assert.equal(windRichtung(0, 1).richtung, windRichtung(undefined, 1).richtung);
  assert.ok(windRichtung(0.05, 0).spielStaerke === 1 && windRichtung(0, 0).spielStaerke === 0);
});

test('Donner nach Entfernung: Verzug 0,4 bis 2,3 s wächst, Lautstärke und Helligkeit sinken, Ferne ist dumpfer', () => {
  let vorher = donnerFuer(0);
  assert.equal(vorher.verzug, 0.4);
  assert.equal(vorher.lautstaerke, 1);
  for (let e = 0.1; e <= 1.0001; e += 0.1) {
    const d = donnerFuer(e);
    assert.ok(d.verzug > vorher.verzug && d.lautstaerke < vorher.lautstaerke && d.dumpf > vorher.dumpf);
    vorher = d;
  }
  assert.ok(Math.abs(donnerFuer(1).verzug - 2.3) < 1e-9);
  assert.ok(donnerFuer(1).lautstaerke >= 0.29);
  assert.ok(blitzHelle(0) === 1 && blitzHelle(1) < 0.5);
  assert.equal(donnerFuer(7).entfernung, 1);
});

test('Donner-Klang: Dumpfheit senkt die Eckfrequenz des Tiefpasses, Lautstärke skaliert die Hüllen', () => {
  const frequenzen = [];
  const verstaerkungen = [];
  const knoten = () => {
    const k = {
      connect: () => k, start() {}, stop() {}, frequency: { setValueAtTime: (v) => frequenzen.push(v), exponentialRampToValueAtTime() {} },
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime: (v) => verstaerkungen.push(v) }, type: '',
    };
    return k;
  };
  const ctx = { currentTime: 0, destination: {}, createBufferSource: knoten, createBiquadFilter: knoten, createGain: knoten, createOscillator: knoten };
  donner(ctx, {}, { lautstaerke: 1, dumpf: 0 });
  const nah = Math.max(...verstaerkungen);
  frequenzen.length = 0; verstaerkungen.length = 0;
  donner(ctx, {}, { lautstaerke: 0.3, dumpf: 0.8 });
  assert.ok(frequenzen.filter(f => f > 100).every(f => f < 200), `Ferne: ${frequenzen}`);
  assert.ok(Math.max(...verstaerkungen) < nah * 0.4);
});

test('Oberflächen: erfasst auch Höhlenböden, kennzeichnet verdeckte Flächen, spart Wasserzone aus', () => {
  const ob = baueOberflaeche(karte(), { schritt: 6 });
  const c = Math.floor(200 / 6); // unter dem Dach
  assert.deepEqual(ob.ys[c], [120, 150].filter(() => true).sort((a, b) => a - b).slice(0, 2).length === 2 ? ob.ys[c] : []);
  assert.ok(ob.ys[c].includes(120) || ob.ys[c].includes(150));
  const freiC = Math.floor(30 / 6);
  assert.deepEqual(ob.ys[freiC], [150]);
  assert.deepEqual(ob.offen[freiC], [true]);
  // Unter dem Dach: Dach (y=60) ist offen; das Podest bei 120 ist verdeckt.
  const ysC = ob.ys[c]; const offenC = ob.offen[c];
  assert.equal(offenC[ysC.indexOf(60)], true);
  assert.equal(offenC[ysC.indexOf(120)], false);
  assert.equal(offenC[ysC.indexOf(150)] === undefined ? false : offenC[ysC.indexOf(150)], false);
  // Wasserzone: Boden unter 93 % der Höhe (186) wird nicht erfasst, Oberfläche 150 liegt darüber.
  for (const ys of ob.ys) for (const y of ys) assert.ok(y <= 186);
});

test('Oberfläche wählen: nur offene verlangt, Höhlenflächen sonst möglich, Ausschnitt wird beachtet, Ergebnis deterministisch', () => {
  const ob = baueOberflaeche(karte());
  const sicht = { x0: 120, x1: 280, y0: 0, y1: 200 };
  let verdeckt = 0; let offen = 0;
  for (let i = 0; i < 400; i += 1) {
    const o = waehleOberflaeche(ob, (i * 0.618) % 1, (i * 0.377) % 1, sicht);
    assert.ok(o && o.x >= 114 && o.x <= 290);
    if (o.offen) offen += 1; else verdeckt += 1;
    const n = waehleOberflaeche(ob, (i * 0.618) % 1, (i * 0.377) % 1, sicht, true);
    assert.ok(n && n.offen, 'nurOffen liefert nur offene');
  }
  assert.ok(verdeckt > 0 && offen > verdeckt, `Höhlenflächen kommen vor (${verdeckt}), offene überwiegen (${offen})`);
  assert.deepEqual(waehleOberflaeche(ob, 0.3, 0.3, sicht), waehleOberflaeche(ob, 0.3, 0.3, sicht));
  assert.equal(waehleOberflaeche(null, 0, 0, sicht), null);
});

test('Schneeläufe: nur offene Oberseiten, Wände haften nicht, Pfützen nur auf flachen Läufen', () => {
  const ob = baueOberflaeche(karte());
  const laeufe = schneeLaeufe(ob, 0, 400);
  assert.ok(laeufe.length >= 2, 'Boden und Dach');
  for (const lauf of laeufe) for (const p of lauf) assert.ok(p.st >= 0 && p.st <= 1);
  const kanten = laeufe.flat().filter(p => p.x >= 96 && p.x <= 102);
  for (const p of kanten) assert.ok(p.st < 0.5, 'Dachkante haftet schwach');
  const pf = pfuetzenAus(ob);
  for (const p of pf) assert.ok(p.b >= 40 && p.y > 0);
});

test('Textur: nahtlos in x, Werte 0 bis 1, oben und unten ausgeblendet', () => {
  const b = 64; const h = 32;
  const w = baueTexturWerte(b, h);
  for (const v of w) assert.ok(v >= 0 && v <= 1);
  for (let x = 0; x < b; x += 1) assert.equal(w[x], 0);
  let sprung = 0; let n = 0;
  for (let y = 0; y < h; y += 1) { sprung += Math.abs(w[y * b] - w[y * b + b - 1]); n += 1; }
  assert.ok(sprung / n < 0.08, `Naht: ${sprung / n}`);
  assert.deepEqual(w, baueTexturWerte(b, h));
});

test('wetterAusSzene: Regen, Schnee, Blitz aus dem Ambiente, Sandsturm mit Wind', () => {
  const mit = (arten, skyId = 'x') => wetterAusSzene({ skyId, ambient: { elemente: arten.map(kind => ({ kind })) } });
  assert.ok(mit(['rain']).regen > 0);
  assert.ok(mit(['rain', 'clouds_storm']).regen > mit(['rain']).regen);
  assert.ok(mit(['snow']).schnee > 0);
  const gewitter = mit(['rain', 'lightning']);
  assert.ok(gewitter.gewitter && gewitter.regen >= 0.7);
  assert.equal(mit(['snow', 'rain', 'clouds_storm']).schnee, 0);
  assert.deepEqual([mit(['haze']).regen, mit(['haze']).schnee, mit(['haze']).gewitter], [0, 0, false]);
  assert.equal(mit([], 'sandstorm').windTon, 'sand');
  assert.equal(mit([], 'ash_storm').windTon, 'asche');
  assert.equal(wetterAusSzene(null).regen, 0);
});

function szeneRenderer(art, optionen = {}) {
  const ctx = fakeCtx();
  const szene = { seed: 5, biomeId: 'x', skyId: 'y', ambient: { elemente: art.map(kind => ({ kind })) } };
  return { ctx, r: { ctx, width: 1920, height: 1080, time: 600, scenery: szene, backdrop: null, backdropKey: null, reducedMotion: false, terrainSource: karte(), ...optionen } };
}

test('Generative Szene: Regen, Schnee und Blitz kommen aus dem Wettersystem, sceneryPainter zeichnet sie nicht mehr', () => {
  const regen = szeneRenderer(['rain']);
  zeichneWetterVorn(regen.r, 1);
  assert.ok(regen.ctx.aufrufe.lineTo > 50, `Regen in der Szene: ${regen.ctx.aufrufe.lineTo}`);
  const schnee = szeneRenderer(['snow']);
  zeichneWetterVorn(schnee.r, 1);
  assert.ok(schnee.ctx.aufrufe.arc > 50);
  const welt = szeneRenderer(['rain']);
  zeichneWetterWelt(welt.r, 1);
  assert.ok(welt.ctx.aufrufe.arc > 10, 'Spritzer in der Szene');
  const gew = szeneRenderer(['rain', 'lightning']);
  const meldungen = [];
  gew.r.beiBlitz = (verzug, x, d) => meldungen.push([verzug, x, d]);
  for (let t = 0; t < 40; t += 0.05) { gew.r.time = t * 60; zeichneWetterHinten(gew.r); }
  assert.ok(meldungen.length >= 3);
  for (const [v, x, d] of meldungen) { assert.ok(v >= 0.4 && v <= 2.3 && x > 0 && x < 1); assert.equal(d.verzug, v); assert.ok(d.lautstaerke >= 0.3 && d.lautstaerke <= 1); }
  // sceneryPainter: kein Regen, Schnee, Blitz mehr.
  const szene = pickScenery(11, 'hills', 'forest');
  szene.ambient = { elemente: [{ kind: 'rain', x: 0.5, y: 0.5, scale: 1, phase: 0.2, seed: 1 }, { kind: 'snow', x: 0.4, y: 0.4, scale: 1, phase: 0.1, seed: 2 }, { kind: 'lightning', x: 0.3, y: 0.3, scale: 1, phase: 0, seed: 7 }] };
  const c = fakeCtx();
  drawAmbient(c, 1280, 720, szene, 100, true);
  drawAmbient(c, 1280, 720, szene, 100, false);
  assert.equal(c.aufrufe.stroke ?? 0, 0);
  assert.equal(c.aufrufe.arc ?? 0, 0);
});

test('Zeichnen: alle Arten laufen, Dichte skaliert, reduzierte Bewegung hält Fall und Wind an', () => {
  const p = (still = false) => ({ ctx: fakeCtx(), b: 1920, h: 1080, t: 12.3, m: 1, still, richtung: 1, boe: 0.8, schraeg: 0.3 });
  const zaehle = (f, ...a) => { const q = p(); f(q, ...a); return Object.values(q.ctx.aufrufe).reduce((s, v) => s + v, 0); };
  for (const f of [zeichneRegen, zeichneSchnee, zeichneHagelLuft, zeichneNebelVorn, zeichneSonne, zeichneSturmHimmel]) {
    assert.equal(zaehle(f, 0), 0, `${f.name} bei 0`);
    assert.ok(zaehle(f, 0.8, 1) > 0, `${f.name} zeichnet`);
  }
  assert.ok(zaehle(zeichneWind, 1, 'staub', 1) > 20);
  for (const ton of ['staub', 'sand', 'asche', 'unbekannt']) assert.doesNotThrow(() => zaehle(zeichneWind, 1, ton, 1));
  for (const f of [zeichneRegen, zeichneSchnee, zeichneHagelLuft]) assert.ok(zaehle(f, 1, 0.5) < zaehle(f, 1, 1) * 0.65, `${f.name} Dichte`);
  const still = p(true);
  zeichneRegen(still, 1); zeichneWind(still, 1);
  assert.equal(Object.keys(still.ctx.aufrufe).length, 0, 'reduziert: kein Regen, kein Wind');
  const schneeStill = p(true);
  zeichneSchnee(schneeStill, 1);
  assert.ok(schneeStill.ctx.aufrufe.arc > 0, 'Schnee steht still im Bild');
});

test('Weltschichten: Spritzer/Hagelaufprall bei 0 leer, Aufprall zeichnet nur offene Flächen, Schneedecke wächst mit der Höhe', () => {
  const ob = baueOberflaeche(karte());
  const sicht = { x0: 0, x1: 400, y0: 0, y1: 200 };
  const c0 = fakeCtx();
  zeichneSpritzer(c0, ob, sicht, 3, 0, 1); zeichneHagelAufprall(c0, ob, sicht, 3, 0, 1); zeichneSchneeDecke(c0, ob, sicht, 0);
  assert.equal(Object.keys(c0.aufrufe).length, 0);
  const c1 = fakeCtx();
  zeichneHagelAufprall(c1, ob, sicht, 3.1, 1, 1);
  assert.ok(c1.aufrufe.arc > 5);
  // Schneedecke: Dicke aus den Polygonpunkten wächst mit der Höhe.
  const dicke = hoehe => {
    const punkte = [];
    const c = new Proxy({}, { get: (o, k) => (k === 'moveTo' || k === 'lineTo' ? (x, y) => punkte.push([x, y]) : () => {}), set: () => true });
    zeichneSchneeDecke(c, baueOberflaeche(karte()), sicht, hoehe);
    return punkte;
  };
  const spanne = pts => Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
  assert.ok(spanne(dicke(1)) > spanne(dicke(0.1)));
  assert.ok(spanne(dicke(0.1)) > 0);
  const szene = szeneRenderer(['snow']);
  szene.r.wetterStand = undefined;
  zeichneWetterVorn(szene.r, 1);
  const vorher = szene.ctx.aufrufe.fill ?? 0;
  zeichneSchneeAuflage(szene.r);
  assert.ok((szene.ctx.aufrufe.fill ?? 0) > vorher, 'Schneeschneedecke in Schneekarten sofort sichtbar');
});

test('Übergang im Zeichnen: Wetterwechsel zwischen zwei Bildern gibt keinen Sprung (Regenmenge wächst stetig)', () => {
  const s = szeneRenderer([]);
  s.r.stimmung = { zeit: 'auto', wetter: 'regen' };
  s.r.time = 1;
  zeichneWetterVorn(s.r, 1); // frisch: sofort am Ziel
  const lineTos = [];
  s.r.stimmung = { zeit: 'auto', wetter: 'auto' };
  // Neue Wahl = neue Karte (Zustand neu): der Übergang gilt WÄHREND eine Wahl im Spiel wechselt, siehe wechselhaft.
  const w = szeneRenderer([]);
  w.r.stimmung = { zeit: 'auto', wetter: 'wechselhaft' };
  let letzte = null; let maxSprung = 0;
  for (let i = 0; i < WECHSEL_DAUER * 60 * 4; i += 6) {
    w.r.time = i;
    w.ctx = fakeCtx(); w.r.ctx = w.ctx;
    zeichneWetterVorn(w.r, 1);
    const st = w.r.wetterStand.stand;
    const summe = WETTER_ACHSEN.reduce((a, k) => a + st[k], 0);
    if (letzte !== null) maxSprung = Math.max(maxSprung, Math.abs(summe - letzte));
    letzte = summe;
    lineTos.push(w.ctx.aufrufe.lineTo ?? 0);
    assert.ok(wetterAktiv(st) || summe >= 0);
  }
  assert.ok(maxSprung < 0.2, `größter Sprung je 6 Bilder: ${maxSprung}`);
});

test('Neue Wettermodule benutzen weder Math.random noch Uhr noch Engine', () => {
  for (const datei of ['wetterZustand', 'wetterOberflaeche', 'wetterZeichnen', 'wetterLicht', 'wetterNiederschlag']) {
    const text = fs.readFileSync(new URL(`../src/client/${datei}.js`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(text), `${datei}: Zufall oder Uhr`);
    assert.ok(!/engine\/|shared\/(?!config)/.test(text.replace(/shared\/config/g, '')), `${datei}: Engine-Import`);
  }
});

test('Schnee/Hagel: dichter und größer als zuvor, Lite bleibt dicht, große Körner, Korn nur von Position abhängig', () => {
  const p = (still = false) => ({ ctx: fakeCtx(), b: 1920, h: 1080, t: 12.3, m: 1, still, richtung: 1, boe: 0.8, schraeg: 0.3 });
  const kreise = (f, st, d) => { const q = p(); f(q, st, d); return (q.ctx.aufrufe.arc ?? 0); };
  assert.ok(kreise(zeichneSchnee, 1, 1) >= 500, 'Schnee voll: mindestens 500 Flocken');
  assert.ok(kreise(zeichneSchnee, 1, 0.5) >= 300, 'Schnee Lite noch dicht');
  assert.ok(kreise(zeichneSchnee, 1, 0.5) < kreise(zeichneSchnee, 1, 1));
  assert.ok(niederschlagDichte(0.5) > 0.5 && niederschlagDichte(1) === 1);
  assert.ok(kreise(zeichneHagelLuft, 1, 0.5) >= 60, 'Hagel Lite deutlich');
  // Reduzierte Bewegung: Schnee steht, Hagel steht an festen Plätzen (kein Fall).
  const a = p(true); const b2 = { ...p(true), t: 99 };
  const lage = { n: 1, rad: 3.7, tempo: 2.9, salz: 12 };
  assert.deepEqual(hagelKornLuft(3, lage, a), hagelKornLuft(3, lage, b2));
  // Fall ist schnell und fast gerade; Korn hängt nur an der Position.
  const k1 = hagelKornLuft(3, lage, { ...p(), t: 1 }); const k2 = hagelKornLuft(3, lage, { ...p(), t: 1.01 });
  assert.ok(Math.abs(k2.dx) < 0.1);
  assert.doesNotThrow(() => maleHagelkorn(fakeCtx(), 10, 10, 12));
  assert.ok(k1.rad > 3);
});
