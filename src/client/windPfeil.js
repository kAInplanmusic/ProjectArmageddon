/**
 * Windanzeige als Pfeil im Spielfeld.
 *
 * Länge und Farbe skalieren mit der Windstärke, die Richtung mit dem Vorzeichen.
 * Ausgelagert aus `renderer.js`, damit die Klasse unter ihrem Zeilenbudget
 * bleibt; die Funktion braucht nur Kontext, Breite und Windwert.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} breite
 * @param {number} wind
 */
export function zeichneWindPfeil(ctx, breite, wind) {
  const magnitude = Math.abs(wind ?? 0);
  if (magnitude < 0.0005) return;

  const maxWind = 0.05;
  const strength = Math.min(1, magnitude / maxWind);
  const cx = breite / 2;
  const cy = 46;
  const halfLength = 20 + strength * 46;
  const direction = wind > 0 ? 1 : -1;
  const color = strength > 0.6 ? '#ef476f' : strength > 0.3 ? '#f4a261' : '#8ba0b4';

  // Drei Pfeile, versetzt — liest sich als "Strömung".
  ctx.save();
  for (let i = -1; i <= 1; i++) {
    const y = cy + i * 11;
    const alpha = i === 0 ? 1 : 0.35;
    const length = i === 0 ? halfLength : halfLength * 0.65;
    const startX = cx - direction * length * 0.5;
    const endX = cx + direction * length * 0.5;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = i === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    // Pfeilspitze
    ctx.beginPath();
    ctx.moveTo(endX - direction * 9, y - 6);
    ctx.lineTo(endX, y);
    ctx.lineTo(endX - direction * 9, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}
