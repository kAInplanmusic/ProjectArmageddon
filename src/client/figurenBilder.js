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
import { STUFEN, stufeBauen } from './figurStufen.js';
import { blattBauen } from './figurSheets.js';

export { STUFEN, stufeFuer, tonung, verkleinere } from './figurStufen.js';

const PORTRAETS = import.meta.glob('./assets/characters/*/*.png', { query: '?url', import: 'default' });
const SEITEN = import.meta.glob('./assets/characters-side/*/*.png', { query: '?url', import: 'default' });
const MANIFEST = import.meta.glob('./assets/characters-side/manifest.json', { eager: true, import: 'default' });
// Sprite-Sheets (Gehzyklus, Aktionen): Manifest samt Rollen eager (klein), die Bilder lazy je Figur.
const BLATT_MANIFEST = import.meta.glob('./assets/sprite-sheets/manifest.json', { eager: true, import: 'default' });
const BLATT_BILDER = import.meta.glob('./assets/sprite-sheets/*/*.webp', { query: '?url', import: 'default' });

/** Kantenlänge der Standardstufe (Quelle: 256 px). */
const CACHE_KANTE = 128;
const standard = { fussY: 0.96, muendungX: 0.9, muendungY: 0.45 };

/** Ankerpunkte je Figur aus dem Manifest der Seitenansichten (Anteile 0..1). */
function ankerAusManifest(fraktion, datei) {
  const m = Object.values(MANIFEST)[0];
  const e = m?.figuren?.[`${fraktion}/${datei}`];
  return e ? { ...standard, ...e.anker } : standard;
}

// fraktion -> datei -> Eintrag | 'laedt' | 'fehlt' (zweistufig: Nachschlag je Bild ohne Zeichenkettenbau)
const cache = new Map();

function ladeBild(url) {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('Bild nicht ladbar'));
    img.src = url;
  });
}

async function lade(eintraege, charakter) {
  const datei = charakter.sprite;
  try {
    const seitenLader = SEITEN[`./assets/characters-side/${charakter.faction}/${charakter.sprite}`];
    const lader = seitenLader ?? PORTRAETS[`./assets/characters/${charakter.faction}/${charakter.sprite}`];
    if (!lader) { eintraege.set(datei, 'fehlt'); return; }
    const img = await ladeBild(await lader());
    const fig = {
      quelle: img,
      stufen: new Array(STUFEN.length).fill(null),
      bild: null,
      hell: null,
      seite: Boolean(seitenLader),
      blatt: null,
      anker: seitenLader ? ankerAusManifest(charakter.faction, charakter.sprite) : standard,
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
  let eintraege = cache.get(charakter.faction);
  if (!eintraege) { eintraege = new Map(); cache.set(charakter.faction, eintraege); }
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
