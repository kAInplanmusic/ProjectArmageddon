/**
 * Kartenportal im Bild (Bodenobjektfassung 8, PORTAL-1): ein aufrechter violetter Ring mit Leuchten, leicht pulsierend.
 *
 * Reine Darstellung, ohne Zufall und ohne eigene Uhr (die Zeit kommt als `zeit`, Renderer-Takte). Bei Bewegungsreduktion steht der
 * Ring still. Mittelpunkt = Portalort aus dem Zustand (eine Figurenhöhe über dem Boden).
 */
const RING = '#b06cff';
const LICHT = 'rgba(190, 130, 255, 0.35)';
const KERN = 'rgba(40, 10, 70, 0.55)';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} portal
 * @param {number} zeit - Renderer-Zeit (Simulationstakte)
 * @param {boolean} reduziert - Bewegungsreduktion
 */
export function zeichnePortal(ctx, portal, zeit = 0, reduziert = false) {
  if (!portal || !Number.isFinite(portal.x) || !Number.isFinite(portal.y)) return;
  const puls = reduziert ? 0 : Math.sin(zeit / 18) * 0.08;
  const rx = 13 * (1 + puls);
  const ry = 20 * (1 + puls);
  ctx.save();
  ctx.translate(portal.x, portal.y);
  ctx.fillStyle = LICHT;
  ctx.beginPath(); ctx.ellipse(0, 0, rx + 8, ry + 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = KERN;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = RING;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  // Wirbel: zwei Bögen, die sich langsam drehen (stehen bei Bewegungsreduktion).
  const w = reduziert ? 0 : zeit / 40;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(230, 200, 255, 0.8)';
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.55, ry * 0.55, 0, w, w + Math.PI * 0.9); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.55, ry * 0.55, 0, w + Math.PI, w + Math.PI * 1.9); ctx.stroke();
  ctx.restore();
}
