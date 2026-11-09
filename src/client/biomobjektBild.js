import { BIOMOBJEKTE } from '../shared/config/bodenobjekte.js';

export function zeichneBiomobjekt(ctx, biom) {
  const profil = BIOMOBJEKTE[biom];
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
  } else {
    ctx.rect(-11, -16, 22, 18); ctx.rect(-8, -21, 4, 5); ctx.rect(4, -21, 4, 5);
  }
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = profil.licht;
  ctx.beginPath();
  if (biom === 'vulkan') {
    ctx.moveTo(-4, -22); ctx.quadraticCurveTo(-8, -25, -3, -29);
    ctx.moveTo(3, -22); ctx.quadraticCurveTo(7, -26, 3, -31);
  } else {
    ctx.moveTo(3, -16); ctx.lineTo(-3, -9); ctx.lineTo(2, -9); ctx.lineTo(-3, -2);
  }
  ctx.stroke();
  return true;
}
