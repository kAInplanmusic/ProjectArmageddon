/**
 * Klassifikation eines Einschlags: EINE Funktion für Engine, Server und Client.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Einschlagklang hängt am Untergrund (Wasser platscht, Fels klackt, Erde
 * dumpft). Lokal kannte der Client das Wasserfeld des Matches, online nicht:
 * `Main#materialAn` las `this.water`, und das war online `null` — jeder Einschlag
 * klang nach Erde. Zwei Betriebsarten, zwei Antworten auf dieselbe Frage.
 *
 * Jetzt gibt es eine Frage und eine Antwort:
 *
 *   `klassifiziereEinschlag(terrain, wasser, x, y, { biomId })` → 'wasser' | 'fels' | 'erde'
 *
 * Wer sie ruft, liefert nur die Quellen:
 *   - Engine (Einschlag, VOR Krater und Wasserverdrängung): Maske und echtes `WaterField`.
 *     Das Ergebnis reist als optionales Feld `material` im Ereignis `explosion`
 *     (lokal wie zum Client; fehlt es, wird abgeleitet).
 *   - Client ohne Feld im Ereignis (älterer Server): Maske aus Seed + Ereignissen und die
 *     Wasserlinie der Karte (`wasserAusLinie`) — dieselbe Füllregel wie `Match#buildWater`.
 *
 * Reine Funktion, kein Zufall, keine Uhr (`src/shared` ist determinismusgeschützt).
 *
 * @module shared/einschlag
 */
import { materialAn } from './stoffkarte.js';

/** Kantenlänge einer Wasserzelle in Weltpixeln (gleich `WATER_SCALE` in `engine/match.js`; Test prüft das). */
export const WASSER_ZELLE = 4;

/** Ab diesem Füllstand zählt eine Zelle als Wasser (wie bisher im Client). */
export const WASSER_SCHWELLE = 0.3;

/**
 * Sonde über dem Einschlagpunkt (Weltpixel). Ein Geschoss, das im See auf dem
 * Grund einschlägt, trifft den Punkt in/auf der Sohle; das Wasser steht darüber.
 * Ein Einschlag auf trockenem Ufer hat auch über sich kein Wasser.
 */
export const EINSCHLAG_SONDE = WASSER_ZELLE;

/** Biome, deren Boden als Fels klingt. */
const FELS_BIOME = Object.freeze(['caverns', 'alpine']);

/**
 * Landmaterial eines Bioms (Klangbasis, wenn kein Wasser im Spiel ist).
 * @param {string|null|undefined} biomId
 * @returns {'fels'|'erde'}
 */
export function materialDesBioms(biomId) {
  return FELS_BIOME.includes(biomId) ? 'fels' : 'erde';
}

/**
 * Baut aus der Wasserlinie einer Karte ein Feld mit `levelAtWorld`, das die
 * Anfangsfüllung der Engine nachbildet (`Match#buildWater`): jede Zelle ab der
 * Wasserlinie, deren Eckpunkt nicht fest ist, ist voll.
 *
 * @param {{isSolid: function(number, number): boolean}|null} terrain Kollisionsmaske
 * @param {number|null|undefined} linie Wasserlinie (Weltpixel, y wächst nach unten); fehlt sie: kein Wasser
 * @returns {{levelAtWorld: function(number, number): number}}
 */
export function wasserAusLinie(terrain, linie) {
  const ersteZeile = Number.isFinite(linie) ? Math.floor(linie / WASSER_ZELLE) : Infinity;
  return {
    levelAtWorld(x, y) {
      const zx = Math.floor(x / WASSER_ZELLE);
      const zy = Math.floor(y / WASSER_ZELLE);
      if (zx < 0 || zy < 0 || zy < ersteZeile) return 0;
      return terrain?.isSolid?.(zx * WASSER_ZELLE, zy * WASSER_ZELLE) ? 0 : 1;
    },
  };
}

/** Steht an diesem Weltpunkt Wasser? (Feld mit `levelAtWorld` oder `getLevel`). */
function wasserAn(wasser, x, y) {
  if (!wasser) return false;
  const stand = typeof wasser.levelAtWorld === 'function'
    ? wasser.levelAtWorld(x, y)
    : (typeof wasser.getLevel === 'function' ? wasser.getLevel(Math.floor(x), Math.floor(y)) : 0);
  return stand > WASSER_SCHWELLE;
}

/**
 * Untergrund eines Einschlags.
 *
 * Wasser, wenn am Einschlagpunkt oder eine Sondenlänge darüber Wasser steht.
 * Sonst das Landmaterial des Bioms (`fels` / `erde`). Ungültige Koordinaten
 * (NaN, undefined) ergeben das Landmaterial: Der Klang ist Anzeige, er wirft nicht.
 *
 * @param {object|null} _terrain Kollisionsmaske (für Erweiterungen der Materialkarte reserviert; die Wasserfrage entscheidet das Feld)
 * @param {object|null} wasser Feld mit `levelAtWorld(x, y)` (echtes `WaterField` oder `wasserAusLinie`)
 * @param {number} x Einschlagpunkt (Weltpixel)
 * @param {number} y Einschlagpunkt (Weltpixel)
 * @param {{biomId?: string|null}} [optionen]
 * @returns {'wasser'|'fels'|'erde'}
 */
export function klassifiziereEinschlag(_terrain, wasser, x, y, optionen = {}) {
  if (Number.isFinite(x) && Number.isFinite(y)
    && (wasserAn(wasser, x, y) || wasserAn(wasser, x, y - EINSCHLAG_SONDE))) {
    return 'wasser';
  }
  return materialDesBioms(optionen?.biomId);
}

const GUELTIG = Object.freeze(['wasser', 'fels', 'erde']);

/** Übernimmt ein Materialfeld aus einem Ereignis, wenn es ein bekanntes Material ist; sonst `null` (= ableiten). */
export function materialAusEreignis(nutzlast) {
  const m = nutzlast?.material;
  return GUELTIG.includes(m) ? m : null;
}

/**
 * Einhaken der Stoffkarte (`shared/stoffkarte.js`): der Materialschlüssel am Einschlag
 * ('erde', 'fels', 'metall', ...) oder `null` ohne Karte. Der Schlüssel reist als Feld `stoff`
 * im Ereignis `explosion` (Zerstörungsfassung 6) bzw. wird im Client aus der eigenen Stoffkarte
 * abgeleitet; heute ändert nur `metall` den Klang (`klangProfile#einschlagProfil`).
 * `klassifiziereEinschlag` bleibt bei wasser/fels/erde.
 */
export function stoffSchluesselAmEinschlag(stoffkarte, x, y) {
  return stoffkarte?.feld ? (materialAn(stoffkarte, x, y)?.key ?? null) : null;
}
