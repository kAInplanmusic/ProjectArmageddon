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
import { KOLLISIONSANKER } from '../shared/config/factions.js';
import { spriteUrl } from './roster.js';
import { CACHE_KANTE, STUFEN, stufeBauen } from './figurStufen.js';
import { blattBauen, emotionBauen, emotionFreigabe, freigabeFuer, zustandHockeZelle } from './figurSheets.js';
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
/*
 * Adressen und Manifeste liegen in `figurenDaten.js` und kommen mit EINEM `import()`
 * beim ersten Figurenbild (siehe dort für die Messung). Das Startbündel enthält
 * davon nichts mehr.
 *
 * A5/ENG-12 gilt weiter: `node --test` kennt `import.meta.glob` nicht. Der Import
 * schlägt dort fehl; der Fang liefert leere Tabellen, statt den Import des Renderers
 * zu verhindern.
 */
const LEERE_DATEN = Object.freeze({
  seiten: {}, manifest: {}, blattManifest: {}, blattBilder: {}, emotionBilder: {}, emotionManifest: {},
});
let datenLadung = null;

/**
 * Die Figurendaten, einmal geladen und danach aus dem Speicher.
 *
 * @returns {Promise<typeof LEERE_DATEN>}
 */
function ladeDaten() {
  datenLadung ??= import('./figurenDaten.js').catch(() => LEERE_DATEN);
  return datenLadung;
}

const STANDARD_ANKER = Object.freeze({ fussY: KOLLISIONSANKER.fussY, muendungX: 0.9, muendungY: 0.45 });

/**
 * Der Anker einer Figur: Fußpunkt aus der EINEN Kollisionsform (A10),
 * Mündungspunkt optional je Figur.
 *
 * Der Fußpunkt ist bewusst NICHT aus dem Manifest: `characters-side/manifest.json`
 * führt je Figur einen pixelgenauen `anchor` (aus der Freistellung), und
 * `fussY` daraus würde für Vierbeiner, Kettenfahrzeuge und Schweber einen
 * anderen Aufsetzpunkt ergeben als für Zweibeiner. Optisch sähe das nach einer
 * anderen Trefferfläche aus, obwohl die Kollision für alle 81 gleich ist.
 * Der Mündungsanker ist keine Kollision und darf je Figur abweichen.
 */
function ankerAusManifest(daten, fraktion, datei) {
  const m = Object.values(daten.manifest)[0];
  const e = m?.figures?.[`${fraktion}/${datei}`];
  const anker = e?.anker ?? {};
  return {
    fussY: KOLLISIONSANKER.fussY,
    muendungX: Number.isFinite(anker.muendungX) ? anker.muendungX : STANDARD_ANKER.muendungX,
    muendungY: Number.isFinite(anker.muendungY) ? anker.muendungY : STANDARD_ANKER.muendungY,
  };
}

// fraktion -> datei -> Eintrag | 'laedt' | 'fehlt' (zweistufig: Nachschlag je Bild ohne Zeichenkettenbau)
const bildCache = new Map();

async function lade(eintraege, charakter) {
  const datei = charakter.sprite;
  try {
    const daten = await ladeDaten();
    const seitenUrl = daten.seiten[`./assets/characters-side/${charakter.faction}/${charakter.sprite}`];
    // Porträt-URL kommt eager aus roster.js (siehe Kommentar bei `bilderTabelle` oben).
    const portraitUrl = seitenUrl ? null : spriteUrl(charakter);
    if (!seitenUrl && !portraitUrl) { eintraege.set(datei, 'fehlt'); return; }
    const img = await ladeBild(seitenUrl ?? portraitUrl);
    const fig = {
      quelle: img,
      stufen: new Array(STUFEN.length).fill(null),
      bild: null,
      hell: null,
      seite: Boolean(seitenUrl),
      blatt: null,
      anker: seitenUrl ? ankerAusManifest(daten, charakter.faction, charakter.sprite) : STANDARD_ANKER,
    };
    const std = stufeBauen(fig, CACHE_KANTE);
    fig.stufen[STUFEN.indexOf(CACHE_KANTE)] = std;
    fig.bild = std.bild; fig.hell = std.hell;
    eintraege.set(datei, fig);
    ladeBlatt(fig, charakter, daten);
  } catch {
    eintraege.set(datei, 'fehlt');
  }
}

/**
 * Lädt die Sheets einer Figur (nur der Figuren, die im Spiel vorkommen) und setzt `fig.blatt`.
 * Fehlt etwas oder schlägt das Laden fehl, bleibt `fig.blatt` `null` — das Seitenbild gilt weiter.
 *
 * Die Rollen laufen durch `freigabeFuer`: Frames ohne Identitätsfreigabe oder mit
 * einem Bauplan, den die Figur nicht hat (Beinenzyklus am Kettenfahrzeug), werden
 * gar nicht erst gebaut. `fig.freigabe` hält das Ergebnis für Prüfwerkzeuge fest.
 *
 * `__zustand.webp` ist Quellmaterial (Anatomieabweichungen, eingebrannte Wasserspritzer) und wird
 * nur angefasst, wenn das Manifest eine Hocke-Zelle ausdrücklich freigegeben hat. Ohne Freigabe
 * entsteht kein Request — eine tote Datei wird so nicht als Animation ausgegeben (Audit A05).
 */
async function ladeBlatt(fig, charakter, daten) {
  try {
    const m = Object.values(daten.blattManifest)[0];
    const e = m?.figuren?.[`${charakter.faction}/${charakter.sprite.replace(/\.png$/, '')}`];
    if (!e) return;
    const freigabe = freigabeFuer(charakter, e);
    fig.freigabe = freigabe;
    const zustandZelle = zustandHockeZelle(e);
    const urls = [daten.blattBilder[`./assets/sprite-sheets/${e.walk}`], daten.blattBilder[`./assets/sprite-sheets/${e.aktion}`]];
    if (zustandZelle !== null) urls.push(daten.blattBilder[`./assets/sprite-sheets/${e.zustand}`]);
    const [walk, aktion, zustand] = await Promise.all(urls.map(async (url) => (url ? ladeBild(url).catch(() => null) : null)));
    const blatt = blattBauen({ ...e, gehen: freigabe.gehen ?? undefined, rollen: freigabe.rollen }, walk, aktion, undefined, zustand ?? null);
    if (blatt.walk || blatt.idle) fig.blatt = blatt;
    // Nur Figuren mit SICHTgeprüfter Freigabe im Manifest bekommen Emotionen; die
    // Farbnäherung (`gueltig`) allein ist kein Identitätsnachweis.
    const name = charakter.sprite.replace(/\.png$/, '');
    const pruefung = Object.values(daten.emotionManifest)[0]?.figuren?.[`${charakter.faction}/${name}`];
    const emotion = daten.emotionBilder[`./assets/sprite-sheets-emotion/${charakter.faction}/${name}__emotion.webp`];
    const zellen = emotionFreigabe(pruefung);
    if (fig.blatt && emotion && zellen) {
      void ladeBild(emotion).then((bild) => { fig.blatt.emotion = emotionBauen(bild, undefined, zellen); }).catch(() => {});
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
