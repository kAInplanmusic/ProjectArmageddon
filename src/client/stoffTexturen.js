/**
 * Material-Texturen der Stoffe — reine Client-Optik, ohne Einfluss auf Maske, Hash oder Netz.
 *
 * Die nahtlosen Vorlagen (1024 px, `assets/material-texturen/`) liegen hier verkleinert als
 * 512-px-JPEG unter `assets/stoff-texturen/<name>.jpg`. `stoffOptik.tinteStoffe` multipliziert sie
 * beim Färben des Geländes auf die Stofffarbe: Pro Textur zählt nur das Verhältnis Pixel zu
 * Mittelwert (Detail), nicht ihre Grundfarbe — die Stofffarbe bleibt maßgeblich.
 *
 * Ohne geladene Texturen (Node, Tests, erster Frame) bleibt das Bild wie vorher.
 *
 * @module stoffTexturen
 */

/** Kantenlänge der Texturen in Pixeln (Zweierpotenz: Wiederholung per Maske). */
export const TEXTUR_GROESSE = 512;

/**
 * Stoff-Schlüssel (`config/stoffe.js`) → Textur. Stoffe ohne Eintrag behalten ihr Muster.
 * erde: Grundton des Geländes (Stoff 0), die Textur modelliert nur die Helligkeit.
 */
import { STOFFE } from '../shared/config/stoffe.js';

const STOFF_TEXTUR_BASIS = {
  erde: 'erde',
  sand: 'sand',
  schnee: 'schnee',
  eis: 'eis',
  pilz: 'pilz',
  holz: 'holz',
  fels: 'fels',
  grundgestein: 'fels',
  basalt: 'basalt',
  obsidian: 'obsidian',
  asche: 'kohle',
  regolith: 'regolith',
  beton: 'beton',
};

/** Dateinamen der Basisstoff-Texturen (`assets/stoff-texturen/*.jpg`); nur diese Namen gewinnen gegen gleichnamige neue Texturen. */
export const BASIS_TEXTUREN = Object.freeze([...new Set(Object.values(STOFF_TEXTUR_BASIS))]);

/**
 * Dazu die Biom-Materialien: Der Katalog nennt je Stoff seine Textur (`textur`, Dateiname in
 * `assets/stoff-texturen-neu/`); Basisstoffe behalten ihre feste Zuordnung oben.
 */
export const STOFF_TEXTUR = Object.freeze({
  ...Object.fromEntries(STOFFE.filter(s => s.textur && !(s.key in STOFF_TEXTUR_BASIS)).map(s => [s.key, s.textur])),
  ...STOFF_TEXTUR_BASIS,
});

/** Namen der Dateien (ohne Endung), die ausgeliefert werden. */
export const TEXTUR_NAMEN = Object.freeze([...new Set(Object.values(STOFF_TEXTUR))]);

const geladen = new Map();

/**
 * Meldet eine Textur an.
 * @param {string} name
 * @param {Uint8ClampedArray} rgba - TEXTUR_GROESSE² Pixel
 */
export function registriereStoffTextur(name, rgba) {
  const n = TEXTUR_GROESSE * TEXTUR_GROESSE;
  if (!rgba || rgba.length !== n * 4) return false;
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < rgba.length; i += 4) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
  const mittel = [Math.max(1, r / n), Math.max(1, g / n), Math.max(1, b / n)];
  const naht = nahtWert(rgba);
  geladen.set(name, { rgba, mittel, naht, spiegel: naht > NAHT_SCHWELLE || SPIEGEL_IMMER.has(name) });
  return true;
}

/** Fenster (Pixel) entlang der Kachelkante, in denen die Naht einzeln bewertet wird: Niete und Plattenkanten sind örtlich. */
const NAHT_FENSTER = 32;
/**
 * Ab diesem Nahtwert gilt eine Textur als nicht nahtlos und wird gespiegelt gekachelt (`stoffOptik`).
 * Gemessen an den 100 ausgelieferten Texturen (nach N-28 liegen die Kanten alle unter 4,5 außer den gewollten Fugen): darüber liegen die Fugenmuster
 * Keramik, Kristall, Metall, Eisader, Glas, Leuchtalgen, Tempelstein; sie werden gespiegelt gekachelt.
 */
export const NAHT_SCHWELLE = 6;
/**
 * Texturen mit örtlicher Naht, die der Nahtwert nicht fängt (Sichtprüfung am Kachelbild). Leer: Rostmetall hatte Niete und
 * Plattenstumpf an der Kachelkante, sie sind aus der Bilddatei entfernt (2026-11-10), Spiegeln war dafür nicht nötig.
 */
const SPIEGEL_IMMER = new Set();

/**
 * Nahtwert einer Textur: Sprung der Helligkeit über die Kachelkante (rechts an links, unten an oben) im Verhältnis zum
 * Sprung zwischen Nachbarpixeln im Inneren, im schlechtesten Fenster von `NAHT_FENSTER` Pixeln. Nahtlose Texturen
 * liegen bei etwa 1 bis 2, eine abgeschnittene Plattenkante oder ein halber Niet weit darüber.
 * @param {Uint8ClampedArray} rgba - TEXTUR_GROESSE² Pixel
 * @returns {number}
 */
export function nahtWert(rgba) {
  const n = TEXTUR_GROESSE;
  const lum = (i) => 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  let schlecht = 0;
  for (let achse = 0; achse < 2; achse += 1) {
    const at = (k, j) => (achse === 0 ? k * n + j : j * n + k); // k = Zeile/Spalte entlang der Kante, j = Lage quer dazu
    let innen = 0;
    for (let k = 0; k < n; k += 1) for (let j = 1; j < n; j += 1) innen += Math.abs(lum(at(k, j)) - lum(at(k, j - 1)));
    const innenMittel = innen / (n * (n - 1)) + 1;
    for (let k0 = 0; k0 < n; k0 += NAHT_FENSTER) {
      let sprung = 0;
      for (let k = k0; k < k0 + NAHT_FENSTER; k += 1) sprung += Math.abs(lum(at(k, n - 1)) - lum(at(k, 0)));
      schlecht = Math.max(schlecht, sprung / NAHT_FENSTER / innenMittel);
    }
  }
  return schlecht;
}

/** Zahl der geladenen Texturen (Renderer: Gelände nachfärben, wenn beim Aufbau welche fehlten). */
export function anzahlStoffTexturen() { return geladen.size; }

/** Verwirft alle Texturen und offenen Anfragen (Tests). */
export function leereStoffTexturen() { geladen.clear(); gewuenscht.clear(); versucht.clear(); }

/*
 * LADEZEIT (2026-11-09): Texturen laden NACH BEDARF.
 *
 * Vorher holte der Start alle rund 110 Texturen (gemessen 7,3 MB in 112 Anfragen), im Leerlauf
 * nach dem Menü — auch wenn nie ein Match begann, und obwohl eine Karte nur eine Handvoll davon
 * zeigt. Jetzt meldet `stoffTextur` jede Anfrage ohne Treffer als Wunsch; die Wünsche eines
 * Geländeaufbaus gehen gesammelt in EINEN Ladelauf, danach erfahren die Hörer davon (der Renderer
 * färbt das Gelände einmal nach). Ohne angemeldete Adressen (`node --test`, Werkzeuge) entsteht nie
 * ein Wunsch: `stoffTextur` bleibt dort ein reiner Nachschlag.
 */
let urlTabelle = {};
const gewuenscht = new Set();
const versucht = new Set();
const hoerer = new Set();
let geplant = false;
let lauf = Promise.resolve(0);

/**
 * Meldet die ausgelieferten Texturdateien an (Name → URL). Geladen wird dadurch nichts.
 * @param {Record<string,string>} urls
 */
export function setzeStoffTexturUrls(urls) { urlTabelle = { ...urls }; }

/**
 * Ruft `f(anzahl)` nach jedem Ladelauf, der mindestens eine Textur gebracht hat.
 * @param {(anzahl: number) => void} f
 * @returns {() => void} Abmelden
 */
export function beiNeuenStoffTexturen(f) { hoerer.add(f); return () => hoerer.delete(f); }

/** Zahl der Wünsche, die noch auf ihren Ladelauf warten. */
export function offeneStoffTexturen() { return gewuenscht.size; }

/**
 * Löst sich auf, sobald kein Wunsch mehr offen und kein Ladelauf mehr unterwegs ist
 * (Ladebild beim Matchstart). Schlägt nie fehl.
 * @returns {Promise<void>}
 */
export function stoffTexturenBereit() {
  return lauf.then(() => (geplant ? stoffTexturenBereit() : undefined));
}

function planeLadung() {
  if (geplant) return;
  geplant = true;
  // Der Lauf beginnt in einer Mikroaufgabe: alle Wünsche desselben Geländeaufbaus sind dann beisammen.
  lauf = lauf.then(async () => {
    geplant = false;
    const urls = {};
    for (const name of gewuenscht) { urls[name] = urlTabelle[name]; versucht.add(name); }
    gewuenscht.clear();
    const anzahl = await ladeStoffTexturen(urls).catch(() => 0);
    if (anzahl > 0) for (const f of hoerer) { try { f(anzahl); } catch { /* Hörer stört den Lauf nicht */ } }
    return anzahl;
  });
}

/**
 * Die Textur eines Namens oder `null`. Ein Fehlgriff auf eine angemeldete, noch nicht versuchte
 * Datei merkt sie zum Nachladen vor (einmal je Datei; eine fehlende Datei wird nicht erneut geholt).
 * @returns {{rgba: Uint8ClampedArray, mittel: number[]}|null}
 */
export function stoffTextur(name) {
  const t = geladen.get(name);
  if (t) return t;
  if (name !== undefined && urlTabelle[name] && !versucht.has(name)) { gewuenscht.add(name); planeLadung(); }
  return null;
}

/** Gleichzeitig geladene Texturbilder (LADEZEIT). */
const GLEICHZEITIG = 6;

/**
 * Lädt die Texturen im Browser (Bild → Canvas → Pixel). Fehler einzelner Dateien werden
 * verschluckt: Dann fehlt nur diese Textur.
 * @param {Record<string,string>} urls - Name → URL
 * @returns {Promise<number>} Zahl der geladenen Texturen
 */
export async function ladeStoffTexturen(urls) {
  let anzahl = 0;
  const leinwand = globalThis.document?.createElement?.('canvas');
  const ctx = leinwand?.getContext?.('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  leinwand.width = TEXTUR_GROESSE;
  leinwand.height = TEXTUR_GROESSE;
  /*
   * LADEZEIT: mehrere Bilder gleichzeitig unterwegs statt streng nacheinander (vorher ~90 Anfragen hintereinander,
   * gemessen 2,1 s). Die eine Leinwand reicht: Zeichnen und Auslesen laufen ohne `await` dazwischen am Stück.
   */
  const liste = Object.entries(urls);
  let naechste = 0;
  const arbeiter = async () => {
    while (naechste < liste.length) {
      const [name, url] = liste[naechste];
      naechste += 1;
      try {
        const bild = new globalThis.Image();
        bild.src = url;
        await bild.decode();
        ctx.drawImage(bild, 0, 0, TEXTUR_GROESSE, TEXTUR_GROESSE);
        if (registriereStoffTextur(name, ctx.getImageData(0, 0, TEXTUR_GROESSE, TEXTUR_GROESSE).data)) anzahl += 1;
      } catch { /* Textur fehlt: Stoff behält sein Muster. */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(GLEICHZEITIG, liste.length) }, arbeiter));
  return anzahl;
}
