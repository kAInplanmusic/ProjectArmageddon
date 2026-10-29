/**
 * Rückstoß des Direkttreffers (Waffenfassung 11).
 *
 * Bis Fassung 10 stieß nur eine Waffe mit Sprengradius (`projectileSystem.js`, radial vom Einschlag weg).
 * Ein Nahkampftreffer, ein Faustschlag oder ein Strahl ohne Radius schob das Ziel nie. Ab Fassung 11 trägt jede
 * Waffe der Tabelle `STOSS_RICHTUNG` einen Stoß mit Stärke (Katalogfeld `knockback`, Schicht `WAFFEN_F11_WERTE`) und
 * RICHTUNG (`stossRichtung`, Grad über der Waagerechten in Schussrichtung):
 *
 *     0 = waagerecht nach vorn (weg vom Schützen)   90 = nach oben   45 = schräg nach vorn und oben
 *   180 = zum Schützen hin (Haken, Peitsche, Magnet) 135 = zum Schützen hin und nach oben   negativ = schräg nach unten
 *
 * Die Geschwindigkeit wird auf die Figur addiert (px je Tick, wie der Sprengstoß: Stärke × 0,02, mit dem Sturm-Faktor
 * der Runde) und der Betrag auf `STOSS_MAX` gedeckelt. Das Gelände hält die Figur auf: Die Figurenphysik
 * (`characterSystem.js`) prüft jeden Schritt gegen das Terrain und deckelt die waagerechte Geschwindigkeit; ein Stoß
 * schiebt also nie durch Fels, wohl aber über eine Kante ins Wasser oder in den Absturz. Rein deterministisch: eine
 * Rechnung aus Stärke, Winkel und Seite, kein Zufall.
 *
 * @module engine/stoss
 */

/** Höchstbetrag der Stoßgeschwindigkeit in px je Tick (die waagerechte Figurengeschwindigkeit ist ohnehin auf 6 begrenzt). */
export const STOSS_MAX = 6;
/** px je Tick je Punkt Stärke; derselbe Maßstab wie beim Sprengstoß. */
export const STOSS_FAKTOR = 0.02;

const RAD = Math.PI / 180;
const rund = zahl => Math.round(zahl * 1e6) / 1e6;

/**
 * Stoßvektor (px je Tick) aus Stärke, Richtung und Seite.
 *
 * @param {number} staerke - Katalogfeld `knockback`
 * @param {number} grad - `stossRichtung`
 * @param {number} seite - +1 Schuss nach rechts, -1 nach links
 * @param {number} [vielfaches] - Faktor der Runde (Sturm)
 * @returns {{x:number, y:number}}
 */
export function stossVektor(staerke, grad, seite, vielfaches = 1) {
  const betrag = Math.min(STOSS_MAX, Math.max(0, staerke) * STOSS_FAKTOR * (vielfaches || 1));
  const w = grad * RAD;
  return { x: rund((seite < 0 ? -1 : 1) * Math.cos(w) * betrag), y: rund(-Math.sin(w) * betrag) };
}

/**
 * Stößt ein lebendes Ziel an: addiert den Stoß auf seine Geschwindigkeit, begrenzt auf `STOSS_MAX` je Achse.
 *
 * @returns {{x:number, y:number}|null} der angewendete Stoß, null wenn nichts geschah
 */
export function wendeStossAn(world, opferId, staerke, grad, seite, vielfaches = 1) {
  if (!(staerke > 0) || !world.isActive(opferId)) return null;
  if ((world.getComponent(opferId, 'Health', 'current') ?? 0) <= 0) return null;
  const s = stossVektor(staerke, grad, seite, vielfaches);
  const klemme = wert => Math.max(-STOSS_MAX, Math.min(STOSS_MAX, wert));
  world.setComponent(opferId, 'Velocity', 'x', klemme((world.getComponent(opferId, 'Velocity', 'x') || 0) + s.x));
  world.setComponent(opferId, 'Velocity', 'y', klemme((world.getComponent(opferId, 'Velocity', 'y') || 0) + s.y));
  return s;
}

/** Seite eines Treffers: nach der Flugrichtung, sonst vom Schützen zum Ziel, sonst rechts. */
export function stossSeite(flugX, schuetzeX, zielX) {
  if (flugX > 0) return 1;
  if (flugX < 0) return -1;
  return zielX < schuetzeX ? -1 : 1;
}
