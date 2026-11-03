/**
 * Zeichnet das Seil (Seilfassung 2): Linie vom Anker über alle Knicke bis zur Figur, Haken am Anker. Reine
 * Darstellung aus dem Zustand (`state.seil.punkte`, online aus den Ereignissen `seil_*`); die Figurlage kommt aus
 * `state.entities` (dieselbe, an der die Figur gezeichnet wird).
 *
 * @module seilZeichnen
 */

/**
 * @param {CanvasRenderingContext2D} ctx - im Weltkoordinatensystem
 * @param {{playerId:number, haengt:boolean, punkte:number[][]}|null|undefined} seil
 * @param {{entityId:number, x:number, y:number}[]} entities
 */
export function zeichneSeil(ctx, seil, entities) {
  if (!seil?.haengt || !Array.isArray(seil.punkte) || seil.punkte.length === 0) return;
  const figur = entities.find(e => e.entityId === seil.playerId);
  if (!figur) return;
  const [ax, ay] = seil.punkte[0];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Dunkle Kontur, darüber das helle Seil: auf hellem wie dunklem Gelände lesbar.
  for (const [farbe, breite] of [['rgba(20, 16, 12, 0.8)', 3.2], ['#d8c08a', 1.6]]) {
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < seil.punkte.length; i += 1) ctx.lineTo(seil.punkte[i][0], seil.punkte[i][1]);
    ctx.lineTo(figur.x, figur.y);
    ctx.stroke();
  }
  // Haken am Anker.
  ctx.fillStyle = '#9aa3ad';
  ctx.strokeStyle = 'rgba(20, 16, 12, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ax, ay, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export default zeichneSeil;
