/**
 * Kartenportal (Bodenobjektfassung 8, PORTAL-1, `docs/auftraege/portal.md`).
 *
 * Eine Ziehung beim Kartenaufbau aus dem eigenen Seed-Zweig `PORTAL`: In `PORTAL_REGEL.anteil` der Partien liegt ein Portal auf einem
 * trockenen Stand, mindestens `minAbstand` px von jedem Startplatz, bevorzugt erhöht (oberes Viertel der Standhöhen). Danach ändert
 * es sich nie (Explosionen zerstören es nicht). Gebeamt wird nur mit Gegenstück (`PORTAL_REGEL.waffen`, `shooting.js`).
 *
 * Rein: Zufall nur aus dem übergebenen Strom, keine Uhr.
 *
 * @module engine/portal
 */
import { PORTAL_REGEL } from '../shared/config/bodenobjekte.js';
import { WET_LEVEL } from '../shared/config/water.js';
import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';

const RAND = 40;
const SCHRITT = 16;

/**
 * Wählt das Portal einer Partie oder `null` (keines in dieser Partie, oder kein geeigneter Stand).
 * @param {{rng:{next:()=>number,nextIntBelow:(n:number)=>number}, breite:number, surfaceYAt:(x:number)=>number,
 *   waterLevelAt:(x:number,y:number)=>number, startplaetze:Array<{x:number,y:number}>}} q
 * @returns {{x:number,y:number}|null} Mittelpunkt des Portals (eine Figurenhöhe über dem Boden)
 */
export function waehlePortal({ rng, breite, surfaceYAt, waterLevelAt, startplaetze }) {
  if (rng.next() >= PORTAL_REGEL.anteil) return null;
  const staende = [];
  for (let x = RAND; x <= breite - RAND; x += SCHRITT) {
    const boden = surfaceYAt(x);
    if (!(boden > PLAYER_HALF_HEIGHT * 3)) continue;
    if (waterLevelAt(x, boden - 2) >= WET_LEVEL || waterLevelAt(x, boden - PLAYER_HALF_HEIGHT) >= WET_LEVEL) continue;
    const y = boden - PLAYER_HALF_HEIGHT - 2;
    if (startplaetze.some(p => Math.hypot(p.x - x, p.y - y) < PORTAL_REGEL.minAbstand)) continue;
    staende.push({ x, y });
  }
  if (staende.length === 0) return null;
  // Erhöht ist taktisch günstig: das obere Viertel der Stände (kleineres y = höher), bei Gleichstand nach x.
  const hoch = [...staende].sort((a, b) => a.y - b.y || a.x - b.x).slice(0, Math.max(1, Math.ceil(staende.length / 4)));
  return { ...hoch[rng.nextIntBelow(hoch.length)] };
}

/** Beamt eine Figur auf das Portal; liefert Start und Ziel. */
export function beameZumPortal(world, playerId, portal) {
  const von = { x: world.getComponent(playerId, 'Position', 'x') ?? 0, y: world.getComponent(playerId, 'Position', 'y') ?? 0 };
  world.setComponent(playerId, 'Position', 'x', portal.x);
  world.setComponent(playerId, 'Position', 'y', portal.y);
  world.setComponent(playerId, 'Velocity', 'x', 0);
  world.setComponent(playerId, 'Velocity', 'y', 0);
  return { von, nach: { x: portal.x, y: portal.y } };
}
