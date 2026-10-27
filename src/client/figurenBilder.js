/**
 * Spielsprites der Fraktionsfiguren: lazy geladen, vorab verkleinert, gecacht.
 *
 * Reihenfolge der Quellen je Figur:
 *   1. Seitenansicht `assets/characters-side/<fraktion>/<datei>` (falls vorhanden,
 *      dazu optional `manifest.json` mit Ankerpunkten) — nach rechts blickend.
 *   2. Porträt `assets/characters/<fraktion>/<datei>` (256 px), im Spiel je
 *      Blickrichtung gespiegelt.
 *
 * Performance und Bildqualität: Das Bild liegt in einer Mip-Kette vorskalierter
 * Stufen (64/96/128/192 px und das 256er Original). Jede Stufe entsteht beim
 * ersten Gebrauch durch mehrstufiges Halbieren, wird leicht geschärft und von
 * Randsäumen befreit; `stufeFuer` wählt je Bildschirmgröße. Pro Bild kostet das
 * Zeichnen ein `drawImage` ohne Allokation. Bis ein Bild geladen ist, liefert `holeFigur` `null` — die
 * Zeichnung fällt dann auf die prozedurale Figur zurück.
 *
 * @module figurenBilder
 */

import { iconUrlFor } from '../shared/config/weapons.js';
import { spriteUrl } from './roster.js';
import { CACHE_KANTE, STUFEN, stufeBauen } from './figurStufen.js';
import { blattBauen, emotionBauen } from './figurSheets.js';
import { ladeBild } from './dom.js';

export { STUFEN, stufeFuer, tonung, verkleinere } from './figurStufen.js';

/*
 * Die Porträts kommen aus `roster.js` (dort EAGER per `import.meta.glob`), nicht
 * aus einem zweiten, lazily Glob hier.
 *
 * FUND (belegt, `npm run build`): Beide Globs zeigten auf dieselben 81 Dateien —
 * `roster.js` eager, diese Datei lazy. Vite kann ein Modul nicht gleichzeitig
 * statisch und dynamisch einbinden; der Build meldete das 81-mal als
 * `INEFFECTIVE_DYNAMIC_IMPORT` („dynamically imported by figurenBilder.js but
 * also statically imported by roster.js, dynamic import will not move module
 * into another chunk"). Das Lazy-Laden fand also NIE statt, kostete aber eine
 * zweite Glob-Definition derselben Dateimenge. Jetzt gibt es genau eine Quelle:
 * `spriteUrl()` liefert die fertige URL, `ladeBild` holt sie wie zuvor.
 */
const SEITEN = import.meta.glob('./assets/characters-side/*/*.png', { query: '?url', import: 'default' });
const MANIFEST = import.meta.glob('./assets/characters-side/manifest.json', { eager: true, import: 'default' });
// Sprite-Sheets (Gehzyklus, Aktionen): Manifest samt Rollen eager (klein), die Bilder lazy je Figur.
const BLATT_MANIFEST = import.meta.glob('./assets/sprite-sheets/manifest.json', { eager: true, import: 'default' });
const BLATT_BILDER = import.meta.glob('./assets/sprite-sheets/*/*.webp', { query: '?url', import: 'default' });
/** Emotions-Sheets (`<fraktion>/<figur>__emotion.webp`): kommen nach dem Hauptblatt dazu, ihr Fehlen ändert nichts. */
const EMOTION_BILDER = import.meta.glob('./assets/sprite-sheets-emotion/*/*.webp', { query: '?url', import: 'default' });
/** Prüfergebnis je Emotions-Sheet (`gueltig` = Zellen mit passender Identität). */
const EMOTION_MANIFEST = import.meta.glob('./assets/sprite-sheets-emotion/manifest.json', { eager: true, import: 'default' });

const STANDARD_ANKER = { fussY: 0.96, muendungX: 0.9, muendungY: 0.45 };

/** Ankerpunkte je Figur aus dem Manifest der Seitenansichten (Anteile 0..1). */
function ankerAusManifest(fraktion, datei) {
  const m = Object.values(MANIFEST)[0];
  const e = m?.figuren?.[`${fraktion}/${datei}`];
  return e ? { ...STANDARD_ANKER, ...e.anker } : STANDARD_ANKER;
}

// fraktion -> datei -> Eintrag | 'laedt' | 'fehlt' (zweistufig: Nachschlag je Bild ohne Zeichenkettenbau)
const bildCache = new Map();

async function lade(eintraege, charakter) {
  const datei = charakter.sprite;
  try {
    const seitenLader = SEITEN[`./assets/characters-side/${charakter.faction}/${charakter.sprite}`];
    // Porträt-URL kommt eager aus roster.js (siehe Kommentar bei SEITEN oben).
    const portraitUrl = seitenLader ? null : spriteUrl(charakter);
    if (!seitenLader && !portraitUrl) { eintraege.set(datei, 'fehlt'); return; }
    const img = await ladeBild(seitenLader ? await seitenLader() : portraitUrl);
    const fig = {
      quelle: img,
      stufen: new Array(STUFEN.length).fill(null),
      bild: null,
      hell: null,
      seite: Boolean(seitenLader),
      blatt: null,
      anker: seitenLader ? ankerAusManifest(charakter.faction, charakter.sprite) : STANDARD_ANKER,
    };
    const std = stufeBauen(fig, CACHE_KANTE);
    fig.stufen[STUFEN.indexOf(CACHE_KANTE)] = std;
    fig.bild = std.bild; fig.hell = std.hell;
    eintraege.set(datei, fig);
    ladeBlatt(fig, charakter);
  } catch {
    eintraege.set(datei, 'fehlt');
  }
}

/**
 * Lädt die Sheets einer Figur (nur der Figuren, die im Spiel vorkommen) und setzt `fig.blatt`.
 * Fehlt etwas oder schlägt das Laden fehl, bleibt `fig.blatt` `null` — das Seitenbild gilt weiter.
 */
async function ladeBlatt(fig, charakter) {
  try {
    const m = Object.values(BLATT_MANIFEST)[0];
    const e = m?.figuren?.[`${charakter.faction}/${charakter.sprite.replace(/\.png$/, '')}`];
    if (!e) return;
    const urls = [BLATT_BILDER[`./assets/sprite-sheets/${e.walk}`], BLATT_BILDER[`./assets/sprite-sheets/${e.aktion}`]];
    const [walk, aktion] = await Promise.all(urls.map(async (l) => (l ? ladeBild(await l()).catch(() => null) : null)));
    const blatt = blattBauen(e, walk, aktion);
    if (blatt.walk || blatt.idle) fig.blatt = blatt;
    // Nur Figuren mit Prüfergebnis im Manifest und mindestens einer gültigen Zelle bekommen Emotionen.
    const name = charakter.sprite.replace(/\.png$/, '');
    const pruefung = Object.values(EMOTION_MANIFEST)[0]?.figuren?.[`${charakter.faction}/${name}`];
    const emotion = EMOTION_BILDER[`./assets/sprite-sheets-emotion/${charakter.faction}/${name}__emotion.webp`];
    if (fig.blatt && emotion && pruefung?.gueltig?.length) {
      void emotion().then(ladeBild).then((bild) => { fig.blatt.emotion = emotionBauen(bild, undefined, pruefung.gueltig); }).catch(() => {});
    }
  } catch {
    fig.blatt = null;
  }
}

/**
 * Das Sprite einer Figur oder `null`, solange es nicht bereit ist (der erste
 * Aufruf stößt das Laden an).
 *
 * @param {object|null} charakter - Eintrag aus CHARACTERS
 * @returns {{bild: CanvasImageSource, hell: CanvasImageSource, seite: boolean, anker: object, blatt: object|null}|null}
 */
export function holeFigur(charakter) {
  if (!charakter) return null;
  let eintraege = bildCache.get(charakter.faction);
  if (!eintraege) { eintraege = new Map(); bildCache.set(charakter.faction, eintraege); }
  const e = eintraege.get(charakter.sprite);
  if (e === undefined) {
    eintraege.set(charakter.sprite, 'laedt');
    lade(eintraege, charakter);
    return null;
  }
  return typeof e === 'object' ? e : null;
}

/** Lädt die Sprites vor (z. B. beim Start eines Matches), ohne zu blockieren. */
export function ladeVor(charaktere) {
  for (const c of charaktere) holeFigur(c);
}

// ------------------------------------------------------------ Waffen-Ikonen


const ikonen = new Map();   // Waffen-ID -> Image (geladen) | 'laedt' | 'fehlt'

/**
 * Das Ikonenbild einer Waffe für die Darstellung in der Hand oder `null`, solange
 * es nicht geladen ist (der erste Aufruf stößt das Laden an). Die 64-px-Ikonen
 * werden unverändert gezeichnet.
 *
 * @param {object|null} waffe - Eintrag aus WEAPONS
 * @returns {HTMLImageElement|null}
 */
export function holeWaffenIkone(waffe) {
  if (!waffe) return null;
  const e = ikonen.get(waffe.id);
  if (e === undefined) {
    ikonen.set(waffe.id, 'laedt');
    const url = iconUrlFor(waffe);
    if (!url) { ikonen.set(waffe.id, 'fehlt'); return null; }
    ladeBild(url).then(img => ikonen.set(waffe.id, img), () => ikonen.set(waffe.id, 'fehlt'));
    return null;
  }
  return typeof e === 'object' ? e : null;
}
