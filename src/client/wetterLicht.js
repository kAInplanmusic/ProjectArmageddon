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
 * @returns {{hell:number, zacken:{x:number,y:number}[][]|null, id:number}} `id` zählt die Blitze (Zeitfenster)
 */
export function blitzZustand(t, seed = 0) {
  const fenster = Math.floor(t / BLITZ_FENSTER);
  const start = fenster * BLITZ_FENSTER + 1 + hash2(fenster, 3, seed) * (BLITZ_FENSTER - 2 - BLITZ_DAUER);
  const d = t - start;
  if (d < 0 || d > BLITZ_DAUER) return { hell: 0, zacken: null, id: fenster };
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
  return { hell: Math.max(0, Math.min(1, puls)), zacken, id: fenster };
}

/** Der Wetterzustand des Renderers (lazy): Auswahl aus der Kulisse und die aus dem Bild gelesenen Lichter. */
function zustand(r) {
  const wahl = `${r.stimmung?.zeit ?? 'auto'}/${r.stimmung?.wetter ?? 'auto'}`;
  if (!r.wetterStand || r.wetterStand.key !== r.backdropKey || r.wetterStand.wahl !== wahl) {
    r.wetterStand = {
      key: r.backdropKey ?? null,
      wahl,
      wetter: wetterMit(wetterAus(r.backdrop), r.stimmung?.wetter, r.stimmung?.zeit),
      lichter: null,
    };
  }
  const z = r.wetterStand;
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

const sekunden = r => (r.time ?? 0) / 60;

/** HINTEN: Blitzzacken, Nebelbänder, flackerndes Fensterlicht. Koordinaten wie das Kulissenbild (Bildgröße des Renderers). */
export function zeichneWetterHinten(r) {
  const ctx = r.ctx;
  if (!ctx || !r.backdrop) return;
  const z = zustand(r);
  const b = r.width;
  const h = r.height;
  const t = sekunden(r);
  const still = r.reducedMotion;

  if (z.wetter.nebel > 0) {
    ctx.save();
    for (let k = 0; k < 3; k += 1) {
      const drift = still ? 0 : (t * (4 + k * 2.5) + hash2(k, 1, 9) * b) % (b * 1.6);
      const x = drift - b * 0.3;
      const y = h * (0.42 + k * 0.1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, b * 0.34);
      g.addColorStop(0, `rgba(190, 200, 210, ${0.17 * z.wetter.nebel})`);
      g.addColorStop(1, 'rgba(190, 200, 210, 0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.22);
      ctx.translate(-x, -y);
      ctx.fillRect(x - b * 0.34, y - b * 0.34, b * 0.68, b * 0.68);
      ctx.restore();
    }
    ctx.restore();
  }

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

  if (z.wetter.gewitter && !still) {
    const bl = blitzZustand(t, r.backdropKey?.length ?? 0);
    // Donner: jeder Blitz meldet sich einmal; der Aufrufer (Main) lässt ihn nach `verzug` Sekunden grollen (Entfernung des Einschlags).
    if (bl.zacken && bl.id !== z.donnerId) {
      z.donnerId = bl.id;
      r.beiBlitz?.(0.4 + hash2(bl.id, 9, 1) * 1.9, bl.zacken[0][0].x);
    }
    if (bl.zacken && bl.hell > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      bl.zacken.forEach((weg, k) => {
        ctx.beginPath();
        weg.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * b, p.y * h) : ctx.lineTo(p.x * b, p.y * h)));
        ctx.strokeStyle = `rgba(190, 210, 255, ${0.35 * bl.hell})`;
        ctx.lineWidth = (k === 0 ? 14 : 8) * (b / 1920);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * bl.hell})`;
        ctx.lineWidth = (k === 0 ? 3.5 : 2) * (b / 1920);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
}

/** VORN: Regen, Schnee und die Aufhellung des Blitzes über dem ganzen Bild. */
export function zeichneWetterVorn(r, dichte = 1) {
  const ctx = r.ctx;
  if (!ctx) return;
  const z = zustand(r);
  const w = z.wetter;
  zeichneVorn(r, w, dichte);
  zeichneStimmung(r, w, dichte);
}

function zeichneVorn(r, w, dichte) {
  const ctx = r.ctx;
  if (!(w.regen > 0 || w.schnee > 0 || w.gewitter)) return;
  const b = r.width;
  const h = r.height;
  const t = sekunden(r);
  const still = r.reducedMotion;
  const m = b / 1920;

  if (w.regen > 0 && !still) {
    const n = Math.round(160 * w.regen * dichte);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(190, 205, 225, ${0.16 + 0.14 * w.regen})`;
    ctx.lineWidth = 1.4 * m;
    ctx.beginPath();
    const neigung = 0.16 + 0.25 * (w.wind ?? 0);
    for (let i = 0; i < n; i += 1) {
      const lauf = 0.55 + hash2(i, 1, 3) * 0.45;
      const y = ((hash2(i, 2, 3) * h) + t * h * (0.9 + 0.6 * w.regen) * lauf) % (h + 60 * m) - 30 * m;
      const x = (hash2(i, 4, 3) * (b + 200 * m) - 100 * m) - y * neigung;
      const l = (14 + 16 * w.regen) * m * lauf;
      ctx.moveTo(x, y);
      ctx.lineTo(x - l * neigung, y + l);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (w.schnee > 0) {
    const n = Math.round(150 * w.schnee * dichte);
    ctx.save();
    ctx.fillStyle = 'rgba(245, 249, 255, 0.78)';
    for (let i = 0; i < n; i += 1) {
      const tiefe = 0.4 + hash2(i, 1, 7) * 0.6;
      const fall = still ? 0 : t * h * 0.07 * tiefe;
      const y = ((hash2(i, 2, 7) * h) + fall) % (h + 20) - 10;
      const wiegen = still ? 0 : Math.sin(t * (0.6 + hash2(i, 3, 7)) + i) * 18 * m;
      const x = hash2(i, 4, 7) * b + wiegen;
      const rad = (1 + tiefe * 2.2) * m;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (w.gewitter && !still) {
    const bl = blitzZustand(t, r.backdropKey?.length ?? 0);
    if (bl.hell > 0.02) {
      ctx.save();
      ctx.fillStyle = `rgba(210, 225, 255, ${0.34 * bl.hell})`;
      ctx.fillRect(0, 0, b, h);
      ctx.restore();
    }
  }
}

/** Oberste feste Zeile einer Spalte ab `ab` (oder -1). */
function obenBei(src, x, ab = 0) {
  const c = Math.round(x);
  if (c < 0 || c >= src.width) return -1;
  for (let y = Math.max(0, Math.floor(ab)); y < src.height; y += 1) if (src.bitmap[y * src.width + c]) return y;
  return -1;
}

/** Flache Stellen für Pfützen: Spalten mit fast gleicher Oberkante (±4 px) über mindestens 48 px (neu bei neuem Gelände oder Krater). */
function pfuetzen(r) {
  const src = r.terrainSource;
  if (!src?.bitmap) return [];
  const marke = `${r.terrainLayer ? 1 : 0}:${r.letzterKrater?.zeit ?? 0}:${src.width}`;
  const z = r.wetterStand;
  if (z.pfuetzenMarke === marke) return z.pfuetzen;
  const liste = [];
  const schritt = 8;
  let lauf = null;
  const schliesse = () => {
    if (lauf && lauf.x1 - lauf.x0 >= 48) liste.push({ x: (lauf.x0 + lauf.x1) / 2, y: lauf.y, b: Math.min(110, lauf.x1 - lauf.x0 - 8) });
    lauf = null;
  };
  for (let x = 0; x < src.width; x += schritt) {
    const y = obenBei(src, x);
    if (y < 0 || y > src.height * 0.93) { schliesse(); continue; }
    if (lauf && Math.abs(y - lauf.y) <= 4) lauf.x1 = x + schritt;
    else { schliesse(); lauf = { x0: x, x1: x + schritt, y }; }
  }
  schliesse();
  z.pfuetzen = liste.filter((p, i) => hash2(i, 1, 21) < 0.6).slice(0, 24);
  z.pfuetzenMarke = marke;
  return z.pfuetzen;
}

/**
 * WELT (innerhalb der Kamera): Regenspritzer und Pfützen am Gelände. Nur bei Regen; Pfützen mit Ringen, die sich ausbreiten.
 * Koordinaten sind Kartenpixel, gezeichnet wird nur im sichtbaren Ausschnitt.
 */
export function zeichneWetterWelt(r, dichte = 1) {
  const ctx = r.ctx;
  if (!ctx || !r.backdrop || r.reducedMotion) return;
  const z = zustand(r);
  const regen = z.wetter.regen;
  const src = r.terrainSource;
  if (!(regen > 0) || !src?.bitmap) return;
  const k = r.kamera?.transformation?.();
  const skal = k && k.skalierung > 0 ? k.skalierung : 1;
  const x0 = k ? -k.versatzX / skal : 0;
  const x1 = k ? (r.width - k.versatzX) / skal : r.width;
  const y0 = k ? -k.versatzY / skal : 0;
  const y1 = k ? (r.height - k.versatzY) / skal : r.height;
  const t = sekunden(r);

  // Pfützen: dunkle, spiegelnde Ellipse mit Rand und ausbreitenden Ringen.
  if (regen >= 0.3) {
    ctx.save();
    pfuetzen(r).forEach((p, i) => {
      if (p.x + p.b < x0 || p.x - p.b > x1 || p.y < y0 - 20 || p.y > y1 + 20) return;
      const tief = Math.min(1, regen * 1.2);
      ctx.fillStyle = `rgba(52, 70, 98, ${0.5 * tief})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.5, p.b / 2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(190, 215, 245, ${0.35 * tief})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.5, p.b / 2, 3.2, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      for (let n = 0; n < 2; n += 1) {
        const ph = ((t * (0.8 + 0.3 * n) + hash2(i, n, 31) * 3) % 1);
        ctx.strokeStyle = `rgba(210, 228, 250, ${0.4 * (1 - ph) * tief})`;
        ctx.beginPath();
        ctx.ellipse(p.x + (hash2(i, n + 5, 31) - 0.5) * p.b * 0.5, p.y + 1.5, 2 + ph * p.b * 0.22, 0.6 + ph * 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // Spritzer: kurze Krönchen aus Tropfen, an wechselnden Stellen im sichtbaren Ausschnitt.
  const anzahl = Math.round(34 * regen * dichte);
  if (anzahl > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(205, 222, 245, 0.75)';
    ctx.strokeStyle = 'rgba(205, 222, 245, 0.5)';
    ctx.lineWidth = 1;
    const periode = 0.32;
    for (let i = 0; i < anzahl; i += 1) {
      const takt = Math.floor(t / periode + hash2(i, 1, 41));
      const ph = (t / periode + hash2(i, 1, 41)) - takt; // 0 bis 1 im Takt
      const x = x0 + hash2(i, takt, 42) * (x1 - x0);
      const y = obenBei(src, x, y0 - 40);
      if (y < y0 - 10 || y > y1 || y > src.height * 0.93) continue;
      const hoehe = 6 + 9 * Math.sin(Math.PI * Math.min(1, ph * 1.4));
      const a = 1 - ph;
      ctx.globalAlpha = a;
      for (let d = -1; d <= 1; d += 1) {
        ctx.beginPath();
        ctx.arc(x + d * ph * 9, y - hoehe * (1 - Math.abs(d) * 0.35) + ph * ph * 7, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(x, y, ph * 9, ph * 2.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
