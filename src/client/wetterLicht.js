/**
 * Wetter und Licht auf den gemalten Kulissen — reine Darstellung, kein Spielzustand, kein Zufall der Engine.
 *
 * Aus dem Beschreibungstext (`backdrop.prompt`) und der Kennung wird abgeleitet, was in der Kulisse passiert:
 * leichter Regen im Regenwald, Platzregen im Monsun, Schnee im Winter, Gewitter mit hellem Blitz im Sturm, Nebelbänder im
 * Sumpf und im Nebelwald. Zusätzlich werden aus dem Bild selbst die hellen warmen Punkte gelesen (Fenster, Laternen, Feuer,
 * Neonschilder) und als flackerndes Licht über das Bild gelegt: die Fenster der Häuser im Hintergrund leuchten.
 *
 * Zwei Schichten: HINTEN (hinter dem Gelände): Blitzzacken, Nebel, Fensterlicht; VORN (über dem Geschehen): Regen, Schnee,
 * Blitzaufhellung. Alles folgt Zeit und Position (`hash2`), nichts würfelt. „Reduzierte Bewegung" zeigt nur stehende Lichter.
 *
 * @module wetterLicht
 */
import { hash2 } from './stil.js';
import { wetterMit, zeichneStimmung } from './stimmung.js';
import {
  zielAus, neuerZustand, schreiteFort, windRichtung, boe, donnerFuer, blitzHelle, wetterAusSzene, wetterAktiv,
} from './wetterZustand.js';
import { baueOberflaeche, pfuetzenAus } from './wetterOberflaeche.js';
import { bindeHagelZiel, zeichneHagelKoerner } from './hagelAnzeige.js'; // Engine-Hagel (Hagelfassung 2)
import {
  bildWerte, zeichneNebelHinten, zeichneNebelVorn, zeichneSturmHimmel, zeichneRegen, zeichneSchnee, zeichneHagelLuft,
  zeichneWind, zeichneSpritzer, zeichneHagelAufprall, zeichneSchneeDecke, zeichnePfuetzen,
} from './wetterZeichnen.js';

/** Kulissen ohne Himmel und Wetter (Höhle, Weltraum, Abstraktes). */
const OHNE_WETTER = /^(caverns|cosmos|abstract)$/;

/**
 * Was die Kulisse an Wetter zeigt.
 * @param {{key?:string, id?:string, biomeId?:string, prompt?:string}|null|undefined} kulisse
 * @returns {{regen:number, schnee:number, gewitter:boolean, nebel:number, lichter:boolean}} Stärken 0 bis 1
 */
export function wetterAus(kulisse) {
  const aus = { regen: 0, schnee: 0, gewitter: false, nebel: 0, lichter: false };
  if (!kulisse) return aus;
  const biom = kulisse.biomeId ?? String(kulisse.key ?? '').split('/')[0];
  const id = String(kulisse.id ?? String(kulisse.key ?? '').split('/')[1] ?? '');
  const text = String(kulisse.prompt ?? '').toLowerCase();
  // Beleuchtete Fenster und Laternen gibt es überall außer im Weltraum und in abstrakten Bildern.
  aus.lichter = !/^(cosmos|abstract)$/.test(biom);
  if (OHNE_WETTER.test(biom)) return aus;

  if (/rainforest|jungle/.test(text)) aus.regen = 0.3; // leichter Regen im Regenwald
  if (/\brain(?!forest)|monsoon|downpour|torrential|typhoon|drizzle/.test(text) || /rain|monsoon|typhoon/.test(id)) aus.regen = Math.max(aus.regen, /torrential|downpour|typhoon|violent|sheets of rain/.test(text) ? 1 : 0.6);
  if (/storm|thunder|typhoon|lightning|ragnar/.test(text + id)) {
    aus.gewitter = /storm|thunder|typhoon|lightning/.test(text + id);
    aus.regen = Math.max(aus.regen, 0.7);
  }
  if (/snow|winter|frontier|polar|arctic/.test(id) || /falling snow|snowfall|blizzard|deep snow|snow-laden|heavy snow|snow covering/.test(text)) {
    aus.schnee = /blizzard|heavy|deep/.test(text) ? 0.9 : 0.6;
    if (aus.regen > 0.4) aus.schnee = 0; // beides zugleich wäre unglaubwürdig
  }
  if (/fog|swamp|moor|heath|drowned/.test(id) || /\bfog|mist|vapour|haze|stagnant/.test(text)) aus.nebel = /fogbound|dense fog|thick/.test(text) ? 0.7 : 0.4;
  return aus;
}

/**
 * Helle warme Punkte im Bild (Fenster, Laternen, Feuer): lokale Maxima, die hell, warm und von Dunkel umgeben sind.
 * @param {{data:Uint8ClampedArray|number[], width:number, height:number}} bild RGBA, klein (etwa 192×108)
 * @param {number} [max=28]
 * @returns {{x:number, y:number, st:number, farbe:number[]}[]} Lage 0 bis 1, Stärke 0 bis 1
 */
export function findeLichter(bild, max = 28) {
  const { data, width: b, height: h } = bild;
  if (!data || b < 8 || h < 8) return [];
  const lum = new Float32Array(b * h);
  for (let i = 0; i < b * h; i += 1) lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  const kandidaten = [];
  for (let y = 4; y < h - 4; y += 1) {
    for (let x = 4; x < b - 4; x += 1) {
      const i = y * b + x;
      const l = lum[i];
      if (l < 0.72) continue;
      const r = data[i * 4]; const g = data[i * 4 + 1]; const bl = data[i * 4 + 2];
      if (!(r >= g - 4 && r - bl > 36)) continue; // warm: gelb, orange, rot
      let ring = 0;
      for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) ring += lum[(y + dy) * b + x + dx];
      ring /= 25;
      if (l - ring < 0.28) continue; // muss sich vom Umfeld abheben
      kandidaten.push({ x, y, l, ring, farbe: [r, g, bl] });
    }
  }
  kandidaten.sort((p, q) => (q.l - q.ring) - (p.l - p.ring));
  const punkte = [];
  for (const k of kandidaten) {
    if (punkte.length >= max) break;
    if (punkte.some(p => Math.hypot(p.px - k.x, p.py - k.y) < 5)) continue; // ein Licht je Fenster
    punkte.push({ px: k.x, py: k.y, x: k.x / b, y: k.y / h, st: Math.min(1, (k.l - k.ring) * 1.4), farbe: k.farbe });
  }
  return punkte.map(({ x, y, st, farbe }) => ({ x, y, st, farbe }));
}

/** Zeitpunkte der Blitze: alle 6 bis 14 s einer, aus dem Zeitfenster gerechnet (deterministisch). */
const BLITZ_FENSTER = 10;
const BLITZ_DAUER = 0.55;

/**
 * Der Blitz zur Zeit `t` (Sekunden): Aufhellung 0 bis 1 (zwei Pulse) und die Zacken (Lage 0 bis 1) während der ersten Pulse.
 * @returns {{hell:number, zacken:{x:number,y:number}[][]|null, id:number, entfernung:number}} `id` zählt die Blitze (Zeitfenster), `entfernung` 0 (nah) bis 1 (fern)
 */
export function blitzZustand(t, seed = 0) {
  const fenster = Math.floor(t / BLITZ_FENSTER);
  const start = fenster * BLITZ_FENSTER + 1 + hash2(fenster, 3, seed) * (BLITZ_FENSTER - 2 - BLITZ_DAUER);
  const d = t - start;
  if (d < 0 || d > BLITZ_DAUER) return { hell: 0, zacken: null, id: fenster, entfernung: hash2(fenster, 9, 1) };
  // Zwei Pulse: ein heller, ein schwächerer nach 0,22 s.
  const puls = d < 0.12 ? 1 - d / 0.12 * 0.4 : d < 0.22 ? 0.35 : d < 0.34 ? 0.8 - (d - 0.22) / 0.12 * 0.5 : Math.max(0, 0.3 - (d - 0.34));
  const x0 = 0.12 + hash2(fenster, 5, seed) * 0.76;
  const zacken = [];
  const hauptweg = [];
  let x = x0;
  for (let k = 0; k <= 9; k += 1) {
    hauptweg.push({ x, y: (k / 9) * 0.55 });
    x += (hash2(fenster, 20 + k, seed) - 0.5) * 0.07;
  }
  zacken.push(hauptweg);
  // Zwei Äste.
  for (let a = 0; a < 2; a += 1) {
    const von = hauptweg[2 + Math.floor(hash2(fenster, 40 + a, seed) * 5)];
    const ast = [{ ...von }];
    let ax = von.x; let ay = von.y;
    const richtung = hash2(fenster, 50 + a, seed) < 0.5 ? -1 : 1;
    for (let k = 0; k < 4; k += 1) {
      ax += richtung * (0.015 + hash2(fenster, 60 + a * 4 + k, seed) * 0.03);
      ay += 0.04 + hash2(fenster, 70 + a * 4 + k, seed) * 0.03;
      ast.push({ x: ax, y: ay });
    }
    zacken.push(ast);
  }
  return { hell: Math.max(0, Math.min(1, puls)), zacken, id: fenster, entfernung: hash2(fenster, 9, 1) };
}

const sekunden = r => (r.time ?? 0) / 60;

/** Schlüssel einer generativen Szene (die Szene hat keinen `backdropKey`). */
const szeneKey = s => (s ? `g:${s.seed}:${s.biomeId}:${s.skyId}` : null);

/**
 * Der Wetterzustand des Renderers (lazy): Auswahl aus Kulisse oder generativer Szene, die aus dem Bild gelesenen Lichter und der
 * weich überblendete Zustand. Wird je Bild einmal fortgeschrieben (mehrfaches Aufrufen im selben Bild ändert nichts).
 */
function zustand(r) {
  const key = r.backdropKey ?? szeneKey(r.scenery);
  const wahl = `${r.stimmung?.zeit ?? 'auto'}/${r.stimmung?.wetter ?? 'auto'}`;
  if (!r.wetterStand || r.wetterStand.key !== key || r.wetterStand.wahl !== wahl) {
    const basis = r.backdrop ? wetterAus(r.backdrop) : wetterAusSzene(r.scenery);
    r.wetterStand = {
      key,
      wahl,
      saat: r.backdropKey?.length ?? (r.scenery?.seed ?? 0),
      wetter: wetterMit(basis, r.stimmung?.wetter, r.stimmung?.zeit),
      lichter: null,
      stand: null,
    };
  }
  const z = r.wetterStand;
  const zeit = r.time ?? 0;
  const ziel = bindeHagelZiel(zielAus(z.wetter, zeit / 60, z.saat), r.hagel, zeit, Boolean(r.backdrop && OHNE_WETTER.test(r.backdrop.biomeId ?? String(r.backdrop.key ?? '').split('/')[0])));
  const { richtung, spielStaerke } = windRichtung(r.sichtWind, z.saat);
  if (!z.stand) { z.stand = neuerZustand(ziel, zeit); z.stand.richtung = richtung; }
  schreiteFort(z.stand, ziel, zeit, Boolean(r.reducedMotion), richtung);
  z.spielStaerke = spielStaerke;
  // Die Lichter stammen aus dem fertig zugeschnittenen Kulissenbild (`kulissenCache`), nicht aus der Rohdatei: Zuschnitt und
  // Verschiebung (Pan) der Stimmungsbilder gelten dann für Bild und Licht gleich. Neu gelesen wird bei jedem neuen Zuschnitt.
  const quelle = r.kulissenCache?.canvas ?? null;
  if (z.wetter.lichter && quelle && z.lichterVon !== quelle && typeof document !== 'undefined') {
    z.lichterVon = quelle;
    z.lichter = [];
    try {
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = Math.max(8, Math.round(192 * quelle.height / quelle.width));
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(quelle, 0, 0, c.width, c.height);
      z.lichter = findeLichter(cx.getImageData(0, 0, c.width, c.height));
      z.lichterBreite = quelle.width;
      z.lichterHoehe = quelle.height;
    } catch { z.lichter = []; }
  }
  return z;
}

const werte = (r, z) => bildWerte(r, z.stand, boe(sekunden(r)), z.stand.richtung, z.spielStaerke);

/** HINTEN: Nebelbänke, flackerndes Fensterlicht, Blitzzacken. Koordinaten wie das Kulissenbild (Bildgröße des Renderers). */
export function zeichneWetterHinten(r) {
  const ctx = r.ctx;
  if (!ctx || !(r.backdrop || r.scenery)) return;
  const z = zustand(r);
  const s = z.stand;
  const b = r.width;
  const h = r.height;
  const t = sekunden(r);
  const still = r.reducedMotion;
  zeichneNebelHinten(werte(r, z), s.nebel);

  if (z.wetter.lichter && z.lichter?.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sx = r.kulissenSx ?? 0; // Verschiebung des Ausschnitts (Stimmungsbilder)
    z.lichter.forEach((l, i) => {
      const flackern = still ? 1 : 0.8 + 0.2 * Math.sin(t * (2.2 + hash2(i, 2, 5) * 3) + hash2(i, 3, 5) * 6.28) + 0.06 * Math.sin(t * 11 + i);
      const x = l.x * (z.lichterBreite ?? b) - sx;
      const y = l.y * (z.lichterHoehe ?? h);
      if (x < -40 || x > b + 40) return;
      const rad = (10 + l.st * 22) * (b / 1920);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const [fr, fg, fb] = l.farbe;
      g.addColorStop(0, `rgba(${fr}, ${fg}, ${Math.min(255, fb + 30)}, ${0.55 * l.st * flackern})`);
      g.addColorStop(0.35, `rgba(${fr}, ${Math.round(fg * 0.8)}, ${Math.round(fb * 0.5)}, ${0.22 * l.st * flackern})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    });
    ctx.restore();
  }

  if (s.sturm > 0.5 && !still) {
    const bl = blitzZustand(t, z.saat);
    // Donner: jeder Blitz meldet sich einmal mit Verzug, Lautstärke und Dumpfheit nach seiner Entfernung (`donnerFuer`);
    // der Aufrufer (Main) lässt ihn nach `verzug` Sekunden grollen.
    if (bl.zacken && bl.id !== z.donnerId) {
      z.donnerId = bl.id;
      const donner = donnerFuer(bl.entfernung);
      r.beiBlitz?.(donner.verzug, bl.zacken[0][0].x, donner);
    }
    if (bl.zacken && bl.hell > 0.05) {
      const hell = bl.hell * blitzHelle(bl.entfernung);
      const dick = 1.3 - 0.5 * bl.entfernung;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      bl.zacken.forEach((weg, k) => {
        ctx.beginPath();
        weg.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * b, p.y * h) : ctx.lineTo(p.x * b, p.y * h)));
        ctx.strokeStyle = `rgba(190, 210, 255, ${0.35 * hell})`;
        ctx.lineWidth = (k === 0 ? 14 : 8) * dick * (b / 1920);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * hell})`;
        ctx.lineWidth = (k === 0 ? 3.5 : 2) * dick * (b / 1920);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
}

/** VORN: Sturmhimmel, Dunst, Sonne und Tönung (`zeichneStimmung`), Regen, Schnee, Hagel, Wind und die Aufhellung des Blitzes. */
export function zeichneWetterVorn(r, dichte = 1) {
  const ctx = r.ctx;
  if (!ctx) return;
  const z = zustand(r);
  const s = z.stand;
  if (wetterAktiv(s)) {
    const p = werte(r, z);
    zeichneSturmHimmel(p, s.sturm);
    zeichneNebelVorn(p, s.nebel);
    zeichneRegen(p, s.regen, dichte);
    zeichneSchnee(p, s.schnee, dichte);
    zeichneHagelLuft(p, s.hagel, dichte, Boolean(r.hagel?.gebunden));
    zeichneWind(p, Math.max(s.wind, 0.8 * s.sturm), z.wetter.windTon ?? 'staub', dichte);
    if (s.sturm > 0.5 && !r.reducedMotion) {
      const bl = blitzZustand(sekunden(r), z.saat);
      if (bl.hell > 0.02) {
        ctx.save();
        ctx.fillStyle = `rgba(210, 225, 255, ${0.34 * bl.hell * blitzHelle(bl.entfernung)})`;
        ctx.fillRect(0, 0, r.width, r.height);
        ctx.restore();
      }
    }
  }
  zeichneStimmung(r, { ...z.wetter, sonne: s.sonne, laub: s.laub }, dichte);
}

/** Sichtbarer Ausschnitt in Kartenpixeln (ohne Kamera: das ganze Bild). */
function sichtAus(r) {
  const k = r.kamera?.transformation?.();
  const skal = k && k.skalierung > 0 ? k.skalierung : 1;
  return {
    x0: k ? -k.versatzX / skal : 0,
    x1: k ? (r.width - k.versatzX) / skal : r.width,
    y0: k ? -k.versatzY / skal : 0,
    y1: k ? (r.height - k.versatzY) / skal : r.height,
  };
}

/** Oberflächen der Maske, neu erfasst bei neuem Krater (frühestens nach 15 Bildern) und sonst alle 5 s (fallende Inseln). */
function oberflaeche(r, z) {
  const src = r.terrainSource;
  if (!src?.bitmap) return null;
  const marke = `${r.terrainLayer ? 1 : 0}:${r.letzterKrater?.zeit ?? 0}:${src.width}x${src.height}`;
  const jetzt = r.time ?? 0;
  const alt = z.ob ? jetzt - z.obZeit : Infinity;
  if (!z.ob || (z.obMarke !== marke && (alt >= 15 || jetzt < z.obZeit)) || alt >= 300 || jetzt < z.obZeit) {
    z.ob = baueOberflaeche(src);
    z.pfuetzen = pfuetzenAus(z.ob);
    z.obMarke = marke;
    z.obZeit = jetzt;
  }
  return z.ob;
}

/**
 * WELT (innerhalb der Kamera): Regenspritzer und Pfützen, Hagelaufprall an allen Oberflächen (auch Höhlen). Nicht bei
 * reduzierter Bewegung.
 */
export function zeichneWetterWelt(r, dichte = 1) {
  const ctx = r.ctx;
  if (ctx && r.hagel?.gebunden) zeichneHagelKoerner(ctx, r.hagel, r.time ?? 0, Boolean(r.reducedMotion)); // Körner der Engine, auch ohne Kulisse
  if (!ctx || !(r.backdrop || r.scenery) || r.reducedMotion) return;
  const z = zustand(r);
  const s = z.stand;
  if (!(s.regen > 0.02 || s.hagel > 0.02) || !r.terrainSource?.bitmap) return;
  const ob = oberflaeche(r, z);
  const sicht = sichtAus(r);
  const t = sekunden(r);
  const schraeg = werte(r, z).schraeg;
  zeichnePfuetzen(ctx, z.pfuetzen, sicht, t, s.regen);
  zeichneSpritzer(ctx, ob, sicht, t, s.regen, dichte, schraeg);
  zeichneHagelAufprall(ctx, ob, sicht, t, s.hagel, dichte, schraeg, Boolean(r.hagel?.gebunden));
}

/** Schneedecke auf dem Gelände (Weltschicht, UNTER Figuren und Geschossen): wächst bei Schneefall, taut danach. */
export function zeichneSchneeAuflage(r) {
  const ctx = r.ctx;
  if (!ctx || !(r.backdrop || r.scenery) || !r.terrainSource?.bitmap) return;
  const z = zustand(r);
  if (!(z.stand.schneeHoehe > 0.01)) return;
  zeichneSchneeDecke(ctx, oberflaeche(r, z), sichtAus(r), z.stand.schneeHoehe);
}
