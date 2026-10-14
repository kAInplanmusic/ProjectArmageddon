/**
 * Optik der Zerstörung als RECHENKERN — ohne Canvas, nicht im Zustandshash.
 *
 * Trümmer, Staub, Kraterumriss und der Fall abgelöster Geländeinseln. Alles
 * hier ist reine Darstellung: Die Simulation (`engine/zerstoerung.js`) entscheidet,
 * was fällt und wo es landet; der Client zeigt nur, wie es aussah. Gezeichnet
 * wird in `effektStil.js` und im Renderer.
 *
 * Wie `effects.js` und `gefuehl.js` entsteht alles aus Zählern und Indizes, nicht
 * aus Zufall: dieselbe Szene ergibt dieselbe Wolke und ist damit prüfbar.
 *
 * @module zerstoerungOptik
 */
import { kraterForm, kraterInnen } from '../engine/terrain/collisionMask.js';
import { INSEL_GRAVITATION, INSEL_TEMPO_MAX } from '../shared/config/zerstoerung.js';

/** Obergrenze der Trümmerstücke je Ereignis. */
export const TRUEMMER_MAX = 22;
/** Alterung der Trümmer je Bild (1,0 = frisch). */
export const TRUEMMER_ABNAHME = 0.016;
/** Fallbeschleunigung der Trümmer je Bild. */
export const TRUEMMER_GRAVITATION = 0.22;
/** Staub: Lebensdauer in Bildern. */
export const STAUB_BILDER = 110;
/** Erst ab diesem Kraterradius entsteht Staub. */
export const STAUB_SCHWELLE = 8;

/**
 * Der Rand eines Kraters als Linienzug — dieselbe Form, die die Maske stanzt
 * (`kraterInnen`), entlang von Strahlen vom Mittelpunkt gesucht. Ohne `tiefe`
 * (Altfassung) ein Kreis.
 *
 * @returns {Array<{x:number,y:number}>} geschlossener Linienzug (letzter Punkt = erster)
 */
export function kraterUmriss(x, y, radius, tiefe = null, punkte = 48) {
  const form = tiefe === null || tiefe === undefined ? null : kraterForm(x, y, radius, tiefe);
  const grenze = radius * 1.25 * (form ? Math.max(1, form.tiefe) : 1) + 2;
  const liste = [];
  for (let i = 0; i <= punkte; i += 1) {
    const w = (i % punkte) / punkte * Math.PI * 2;
    const dx = Math.cos(w);
    const dy = Math.sin(w);
    let r = radius;
    if (form) {
      let innen = 0;
      let aussen = grenze;
      for (let s = 0; s < 14; s += 1) {
        const mitte = (innen + aussen) / 2;
        if (kraterInnen(form, dx * mitte, dy * mitte)) innen = mitte; else aussen = mitte;
      }
      r = innen;
    }
    liste.push({ x: x + dx * r, y: y + dy * r });
  }
  return liste;
}

/**
 * Trümmerstücke eines Einschlags: Erdbrocken, die aus dem Krater fliegen und
 * fallen. Mehr Stücke bei größerem Krater; je tiefer der Krater, desto steiler
 * fliegen sie.
 *
 * @returns {Array<{x:number,y:number,vx:number,vy:number,life:number,groesse:number,winkel:number,drall:number,ton:number}>}
 */
export function erzeugeTruemmer(x, y, radius, tiefe = null) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r < 4) return [];
  const anzahl = Math.min(TRUEMMER_MAX, 6 + Math.round(r / 4));
  const steil = tiefe ? Math.min(1.4, Math.max(0.7, tiefe / 100)) : 1;
  const liste = [];
  for (let i = 0; i < anzahl; i += 1) {
    // Fächer nach oben, aus dem Index verteilt.
    const anteil = (i + 0.5) / anzahl;
    const winkel = Math.PI * (1.08 + anteil * 0.84);
    const tempo = 2.2 + (i % 4) * 0.9 + r / 40;
    liste.push({
      x: x + Math.cos(winkel) * r * 0.5,
      y: y + Math.sin(winkel) * r * 0.3,
      vx: Math.cos(winkel) * tempo * 0.9,
      vy: Math.sin(winkel) * tempo * steil - 0.8,
      life: 1,
      groesse: 2 + (i % 3) + (r > 30 ? 1 : 0),
      winkel: (i * 0.9) % (Math.PI * 2),
      drall: ((i % 2) * 2 - 1) * (0.08 + (i % 3) * 0.05),
      ton: i % 3,
    });
  }
  return liste;
}

/** Ein Bild für die Trümmer: fliegen, drehen, fallen, altern, aufräumen. */
export function schreiteTruemmerFort(truemmer) {
  const uebrig = [];
  for (const t of truemmer) {
    const life = t.life - TRUEMMER_ABNAHME;
    if (life <= 0) continue;
    uebrig.push({
      ...t,
      x: t.x + t.vx,
      y: t.y + t.vy,
      vx: t.vx * 0.995,
      vy: t.vy + TRUEMMER_GRAVITATION,
      winkel: t.winkel + t.drall,
      life,
    });
  }
  return uebrig;
}

/**
 * Staubwolken eines Einschlags (Form wie `rauchWolke`, Farbe der Erde).
 *
 * @param {string} farbe - CSS-Farbe der Erde
 */
export function erzeugeStaub(x, y, radius, farbe) {
  const r = Number(radius);
  if (!Number.isFinite(r) || r < STAUB_SCHWELLE) return [];
  const anzahl = Math.min(7, 3 + Math.round(r / 16));
  const liste = [];
  for (let i = 0; i < anzahl; i += 1) {
    const anteil = (i + 0.5) / anzahl;
    const winkel = Math.PI * (1.05 + anteil * 0.9);
    liste.push({
      x: x + Math.cos(winkel) * r * 0.6,
      y: y + Math.sin(winkel) * r * 0.25,
      vx: Math.cos(winkel) * 0.55,
      vy: -0.22 - (i % 3) * 0.06,
      life: 1,
      decay: 1 / STAUB_BILDER,
      startRadius: Math.max(5, r * 0.3) * (0.75 + (i % 3) * 0.2),
      farbe,
    });
  }
  return liste;
}

/** Umschließendes Rechteck einer Insel aus ihren Spaltenläufen `[x, y0, y1, ...]`. */
export function inselGrenzen(runs) {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i + 2 < runs.length; i += 3) {
    if (runs[i] < x0) x0 = runs[i];
    if (runs[i] > x1) x1 = runs[i];
    if (runs[i + 1] < y0) y0 = runs[i + 1];
    if (runs[i + 2] > y1) y1 = runs[i + 2];
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1, breite: x1 - x0 + 1, hoehe: y1 - y0 + 1 };
}

/**
 * Anzeigefall einer Insel: derselbe Verlauf wie in der Simulation, aber um ein
 * Zehntel träger — die Anzeige soll hinter dem Server herhinken statt in den
 * Boden zu laufen; die endgültige Lage setzt `terrain_settled`.
 */
export function schreiteInselFort(insel) {
  const tempo = Math.min(INSEL_TEMPO_MAX, insel.tempo + INSEL_GRAVITATION * 0.9);
  return { ...insel, tempo, versatz: insel.versatz + tempo };
}

/** Staub am Fuß einer Insel (beim Aufsetzen) bzw. an ihrer Bruchstelle (beim Lösen). */
export function inselStaub(runs, farbe, anzahl = 6) {
  const g = inselGrenzen(runs);
  if (!g) return [];
  const liste = [];
  for (let i = 0; i < anzahl; i += 1) {
    const anteil = (i + 0.5) / anzahl;
    liste.push({
      x: g.x0 + anteil * g.breite,
      y: g.y1,
      vx: (anteil - 0.5) * 1.1,
      vy: -0.2 - (i % 3) * 0.05,
      life: 1,
      decay: 1 / STAUB_BILDER,
      startRadius: Math.max(5, Math.min(18, g.breite / 5)) * (0.8 + (i % 3) * 0.2),
      farbe,
    });
  }
  return liste;
}

/** Trümmer, die beim Lösen oder Aufsetzen einer Insel herabrieseln. */
export function inselTruemmer(runs, anzahl = 10) {
  const g = inselGrenzen(runs);
  if (!g) return [];
  const liste = [];
  for (let i = 0; i < anzahl; i += 1) {
    const anteil = (i + 0.5) / anzahl;
    liste.push({
      x: g.x0 + anteil * g.breite,
      y: g.y1 - (i % 3),
      vx: (anteil - 0.5) * 1.6,
      vy: -1.2 - (i % 4) * 0.5,
      life: 1,
      groesse: 2 + (i % 3),
      winkel: i * 0.7,
      drall: ((i % 2) * 2 - 1) * 0.1,
      ton: i % 3,
    });
  }
  return liste;
}

/** Höhenbereich der Insel je Spalte: Map x -> [oben, unten]. */
function spaltenBereiche(runs) {
  const spalten = new Map();
  for (let i = 0; i + 2 < runs.length; i += 3) {
    const alt = spalten.get(runs[i]);
    spalten.set(runs[i], alt ? [Math.min(alt[0], runs[i + 1]), Math.max(alt[1], runs[i + 2])] : [runs[i + 1], runs[i + 2]]);
  }
  return spalten;
}

/** Wurzelt die Pflanze auf der Insel? Die Wurzel liegt knapp unter der Oberfläche (`y + 2` beim Pflanzen). */
function wurzeltAuf(spalten, p) {
  const s = spalten.get(Math.round(p.x));
  return Boolean(s) && p.y >= s[0] - 6 && p.y <= s[1];
}

/**
 * Pflanzen, die auf der Insel wurzeln, aus der Liste nehmen (solange sie fällt)
 * und zurückgeben.
 */
export function nimmPflanzenDerInsel(pflanzen, runs) {
  const mitgenommen = [];
  if (!Array.isArray(pflanzen)) return mitgenommen;
  const spalten = spaltenBereiche(runs);
  for (let i = pflanzen.length - 1; i >= 0; i -= 1) {
    if (wurzeltAuf(spalten, pflanzen[i])) mitgenommen.push(...pflanzen.splice(i, 1));
  }
  return mitgenommen;
}

/**
 * Pflanzen, die auf einer gelandeten Insel wurzeln und noch in der Liste stehen
 * (die Anzeige hat sie nicht abgenommen), ziehen mit um `dy` nach unten.
 * @returns {boolean} true, wenn sich etwas bewegt hat
 */
export function verschiebePflanzenMitInsel(pflanzen, runs, dy) {
  if (!Array.isArray(pflanzen) || pflanzen.length === 0) return false;
  const spalten = spaltenBereiche(runs);
  let bewegt = false;
  for (const p of pflanzen) {
    if (wurzeltAuf(spalten, p)) { p.y += dy; bewegt = true; }
  }
  return bewegt;
}
