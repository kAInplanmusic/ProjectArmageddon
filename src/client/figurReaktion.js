/**
 * Reaktionen der Figuren (FIGUREN-B, nur Darstellung): Angst vor Einschlägen in der Nähe und Rückwärtssalto.
 *
 * Beides rechnet ausschließlich im Client und liest nur, was der Client ohnehin sieht (Einschlagsort aus dem
 * Ereignis `explosion`, Geschwindigkeit der Figur aus ihrer Bewegung von Bild zu Bild). Weder Engine noch RNG noch
 * Kollisionsform werden berührt (AGENTS §2); die Dauer je Figur kommt aus ihrer Kennung, nicht aus einem Zufall.
 *
 * @module figurReaktion
 */

/** Figuren innerhalb dieses Abstands (px) vom Einschlag ducken sich. */
export const ANGST_RADIUS = 150;
/** Die Angst dauert je Figur 1,0 bis 1,5 s. */
export const ANGST_MIN = 1.0;
export const ANGST_SPANNE = 0.5;
/** Es genügen wenige Einschläge im Gedächtnis (mehr als 1,5 s alte sind ohnehin abgelaufen). */
const MAX_GEFAHREN = 12;

/** @type {{x:number,y:number,t:number}[]} */
const gefahren = [];

/** Angstdauer einer Figur in Sekunden (1,0 bis 1,5 s, je Figur verschieden, ohne Zufall). */
export function angstDauer(id) {
  const f = ((id * 0.6180339887) % 1 + 1) % 1;
  return ANGST_MIN + ANGST_SPANNE * f;
}

/**
 * Ein Einschlag wurde gemeldet (Ereignis `explosion`).
 * @param {number} x
 * @param {number} y
 * @param {number} [jetzt] - Sekunden, gleiche Uhr wie die Figurenzeichnung (`performance.now() / 1000`)
 */
export function meldeGefahr(x, y, jetzt = performance.now() / 1000) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  gefahren.push({ x, y, t: jetzt });
  if (gefahren.length > MAX_GEFAHREN) gefahren.shift();
}

/** Vergisst alle Einschläge (Matchwechsel, Tests). */
export function vergesseGefahren() {
  gefahren.length = 0;
}

/**
 * Wie stark ist die Angst der Figur gerade?
 * @returns {{rest:number, weg:number}} `rest` 1..0 (verbleibender Anteil der Angstdauer, 0 = keine Angst),
 *   `weg` = Richtung vom Einschlag weg (−1/1)
 */
export function angstAn(x, y, id, jetzt, aus = { rest: 0, weg: 1 }) {
  const dauer = angstDauer(id);
  aus.rest = 0; aus.weg = 1;
  for (let i = 0; i < gefahren.length; i += 1) {
    const g = gefahren[i];
    const alter = jetzt - g.t;
    if (alter < 0 || alter >= dauer) continue;
    if (Math.hypot(x - g.x, y - g.y) > ANGST_RADIUS) continue;
    const rest = 1 - alter / dauer;
    if (rest > aus.rest) { aus.rest = rest; aus.weg = x >= g.x ? 1 : -1; }
  }
  return aus;
}

// ------------------------------------------------------------------ Rückwärtssalto

/**
 * Horizontalgeschwindigkeit (px/s) beim Absprung, ab der ein Sprung als Salto gilt. Der Motor gibt dem Normalsprung
 * 2,4 px/Takt Seitenimpuls (144 px/s, mit Gehtempo 1,2 und Klassenfaktor höchstens ~245 px/s), dem Salto das Doppelte
 * (4,8 px/Takt = 288 px/s). Dazwischen liegt die Schwelle. Das Ereignis `jumped` trägt kein Salto-Kennzeichen; die
 * Engine dafür zu ändern wäre ein Eingriff für reine Optik (AGENTS §2) — deshalb die Messung an der Bewegung.
 */
export const SALTO_VX = 264;

/** Ist der Absprung ein Rückwärtssalto? `vx` px/s, `blick` = ±1 (Blickrichtung der Figur). */
export function istSalto(vx, blick) {
  return Math.abs(vx) >= SALTO_VX && Math.sign(vx) === -blick;
}

/** Höhe des Drehpunkts über den Füßen (Körpermitte, px) im Figurrahmen. */
export const DREHPUNKT = 20;

/**
 * Drehwinkel des Salto (rad, mit Vorzeichen der Flugrichtung: nach links gegen den Uhrzeigersinn).
 * `u` = Flugfortschritt 0..1 (am Scheitel 0,5), die Drehung ist etwas vor der Landung fertig, damit eine Landung auf
 * höherem Gelände nicht aus einer halben Drehung springt.
 */
export function saltoWinkel(u, richtung) {
  const v = Math.min(1, Math.max(0, u) * 1.15);
  const glatt = v * v * (3 - 2 * v);
  return richtung * 2 * Math.PI * glatt;
}

/** Versatz, der die Körpermitte beim Drehen um den Fußpunkt an ihrem Platz hält (Ergebnis `{dx, dy}`). */
export function saltoVersatz(winkel, aus = { dx: 0, dy: 0 }) {
  aus.dx = -DREHPUNKT * Math.sin(winkel);
  aus.dy = -DREHPUNKT + DREHPUNKT * Math.cos(winkel);
  return aus;
}
