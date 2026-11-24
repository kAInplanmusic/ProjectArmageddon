import { ALLE_BIOMOBJEKTE } from '../shared/config/bodenobjekte.js';

/**
 * Zeichnet ein Biomobjekt (Bodenobjektfassung 5 und 7) im lokalen Koordinatensystem des Fasses (Fuß bei y = 0, etwa 24 px hoch).
 * Umriss in der Objektfarbe, darüber ein Leuchtzeichen in `licht`. Liefert `false`, wenn das Biom kein Objekt hat.
 */
export function zeichneBiomobjekt(ctx, biom) {
  const profil = ALLE_BIOMOBJEKTE[biom];
  if (!profil) return false;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#182932';
  ctx.fillStyle = profil.farbe;
  ctx.beginPath();
  if (biom === 'eiswueste') {
    ctx.moveTo(-12, 1); ctx.lineTo(-7, -12); ctx.lineTo(2, -22);
    ctx.lineTo(11, -7); ctx.lineTo(8, 1); ctx.closePath();
  } else if (biom === 'vulkan') {
    ctx.rect(-11, -5, 22, 7); ctx.rect(-5, -16, 10, 12); ctx.rect(-8, -19, 16, 4);
  } else if (biom === 'fabrik') {
    // Druckkessel: liegender Zylinder mit Füßen und Ventil.
    ctx.ellipse(0, -10, 13, 9, 0, 0, Math.PI * 2);
    ctx.rect(-10, -2, 4, 3); ctx.rect(6, -2, 4, 3); ctx.rect(-2, -22, 4, 4);
  } else if (biom === 'dschungel') {
    // Giftblüte: Stiel und fünf Blätter.
    ctx.rect(-1.5, -10, 3, 11);
    for (let i = 0; i < 5; i += 1) {
      const w = (i / 5) * Math.PI * 2;
      ctx.moveTo(0, -14); ctx.ellipse(Math.cos(w) * 6, -14 + Math.sin(w) * 6, 5, 3, w, 0, Math.PI * 2);
    }
  } else if (biom === 'pilzwald') {
    // Sporenbovist: runde Kugel auf kurzem Fuß.
    ctx.rect(-4, -4, 8, 5);
    ctx.moveTo(12, -12); ctx.arc(0, -12, 12, 0, Math.PI * 2);
  } else if (biom === 'tempelstadt') {
    // Runenstein: Stele mit schrägem Kopf.
    ctx.moveTo(-8, 1); ctx.lineTo(-7, -18); ctx.lineTo(0, -24); ctx.lineTo(7, -18); ctx.lineTo(8, 1); ctx.closePath();
  } else {
    ctx.rect(-11, -16, 22, 18); ctx.rect(-8, -21, 4, 5); ctx.rect(4, -21, 4, 5);
  }
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = profil.licht;
  ctx.beginPath();
  if (biom === 'vulkan') {
    ctx.moveTo(-4, -22); ctx.quadraticCurveTo(-8, -25, -3, -29);
    ctx.moveTo(3, -22); ctx.quadraticCurveTo(7, -26, 3, -31);
  } else if (biom === 'fabrik') {
    ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.moveTo(0, -22); ctx.lineTo(0, -28);
  } else if (biom === 'dschungel') {
    ctx.arc(0, -14, 2.5, 0, Math.PI * 2);
  } else if (biom === 'pilzwald') {
    for (const [x, y] of [[-5, -15], [3, -18], [5, -9], [-3, -7]]) { ctx.moveTo(x + 1.2, y); ctx.arc(x, y, 1.2, 0, Math.PI * 2); }
  } else if (biom === 'tempelstadt') {
    ctx.moveTo(-3, -16); ctx.lineTo(3, -12); ctx.lineTo(-3, -8); ctx.moveTo(0, -5); ctx.lineTo(0, -2);
  } else {
    ctx.moveTo(3, -16); ctx.lineTo(-3, -9); ctx.lineTo(2, -9); ctx.lineTo(-3, -2);
  }
  ctx.stroke();
  return true;
}
