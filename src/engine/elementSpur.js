/**
 * Elemente der Versetzer und Flieger (Waffenfassung 11, Teil D).
 *
 * Wer sich versetzt (Zauberstiefel, Dimensionssprung, Dimensionskugel, Dimensionsriss) oder fliegt (Raketenrucksack, Düsenrucksack, Gleitschirm,
 * Enterhaken), kann ein Element mitnehmen. Die Wirkung steht im Feld `wirkung` der Fassungsschicht (`config/waffen-f11.js`):
 *
 *   - `element`: `fire`, `ice` oder `electric`
 *   - `spur`: wo es wirkt. `weg`: entlang des zurückgelegten Weges (Feuerspur), `start`: am Startpunkt, `ziel`: am Landepunkt.
 *   - `radius`: Reichweite in px um den Punkt bzw. um den Weg (sonst der Standard der Spur)
 *
 * Alles läuft über vorhandene Regeln, nichts Neues im Motor: Figuren in der Fläche (ohne den Schützen) bekommen den Malus des Elements
 * (`MaliRegeln.wende`: Feuer gleich Brand, Eis gleich Frost, Blitz gleich Schock, mit allen Wechselwirkungen von `config/schaden.js`).
 * Feuer entzündet zusätzlich brennbare Zellen auf dem Weg (`FeuerSystem.einschlag`, Gruppe `hitze`, nur mit Feuersystem), Eis löscht dort Brand
 * (Gruppe `kaelte`). Die Fläche ist rein geometrisch und deterministisch, ohne Zufall.
 *
 * @module engine/elementSpur
 */
import { SPECIAL_DEFAULTS } from './specials.js';

const MALUS = Object.freeze({ fire: 'brand', ice: 'frost', electric: 'schock' });
const GRUPPE = Object.freeze({ fire: 'hitze', ice: 'kaelte' });

/** Standardreichweite je Spur in px. */
export const SPUR_RADIUS = Object.freeze({ weg: 26, start: 34, ziel: 40 });

/** Abstand eines Punktes zur Strecke a-b. */
function abstandZurStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const quadrat = dx * dx + dy * dy;
  const t = quadrat === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / quadrat));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Wirkt das Element der Bewegung auf die Figuren in der Fläche.
 *
 * @param {object} quelle - Schussquelle (`world`, `players`, `mali`, `feuerSystem`)
 * @param {number} schuetzeId - die Figur, die sich bewegt hat (bleibt unberührt)
 * @param {{element?:string, spur?:string, radius?:number}} wirkung - Element und Spur der Waffe
 * @param {{x:number, y:number}} von - Startpunkt
 * @param {{x:number, y:number}} nach - Landepunkt
 * @returns {{element:string, spur:string, getroffen:number[]}|null}
 */
export function wendeElementAn(quelle, schuetzeId, wirkung, von, nach) {
  const malus = MALUS[wirkung?.element ?? ''];
  if (!malus) return null;
  const spur = wirkung.spur ?? 'ziel';
  const radius = wirkung.radius ?? SPUR_RADIUS[spur] ?? SPUR_RADIUS.ziel;
  // Der Mittelpunkt der Fläche: der Weg (Strecke), der Start oder das Ziel.
  const a = spur === 'ziel' ? nach : von;
  const b = spur === 'weg' ? nach : a;

  const feuer = quelle.feuerSystem?.() ?? null;
  const gruppe = GRUPPE[wirkung.element];
  if (feuer && gruppe) {
    const schritte = spur === 'weg' ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / radius)) : 0;
    for (let i = 0; i <= schritte; i += 1) {
      const t = schritte === 0 ? 0 : i / schritte;
      feuer.einschlag(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius, gruppe);
    }
  }

  const getroffen = [];
  if (!quelle.mali) return { element: wirkung.element, spur, getroffen };
  for (const eintrag of quelle.players ?? []) {
    if (!eintrag.alive || eintrag.entityId === schuetzeId) continue;
    const x = quelle.world.getComponent(eintrag.entityId, 'Position', 'x') ?? 0;
    const y = quelle.world.getComponent(eintrag.entityId, 'Position', 'y') ?? 0;
    if (abstandZurStrecke(x, y, a.x, a.y, b.x, b.y) > radius) continue;
    const ergebnis = quelle.mali.wende(eintrag.entityId, malus, {
      by: schuetzeId,
      ...(malus === 'brand' ? { dmg: SPECIAL_DEFAULTS.dotDamagePerTurn } : {}),
    });
    if (ergebnis) getroffen.push(eintrag.entityId);
  }
  return { element: wirkung.element, spur, getroffen };
}
