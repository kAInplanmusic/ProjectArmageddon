/**
 * Comic-Soldaten und Namensschilder.
 *
 * Reine Darstellung: Die Figur ist ein Körper von 14 × 20 Pixeln (Kollision),
 * gezeichnet wird ein Soldat mit Helm, Gesicht, Körper in Teamfarbe, dicker
 * dunkler Kontur und einer Panzerfaust, die zum Zielwinkel zeigt. Der Ursprung
 * ist die Körpermitte der Figur.
 *
 * @module figuren
 */
import {
  PAL, hexRgb, mischeRgb, css,
} from './stil.js';
import { platziereSchild } from './sichtbereich.js';
import { zeichneMuendungsblitz } from './effektStil.js';

const KONTUR = PAL.kontur;
const HELM = [78, 88, 60];
const HAUT = [226, 176, 132];
const HOSE = [52, 58, 44];
const ROHR = [84, 98, 52];

function kontur(ctx, breite = 1.6) {
  ctx.strokeStyle = KONTUR;
  ctx.lineWidth = breite;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function rundRect(ctx, x, y, b, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + b - r, y);
  ctx.quadraticCurveTo(x + b, y, x + b, y + r);
  ctx.lineTo(x + b, y + h - r);
  ctx.quadraticCurveTo(x + b, y + h, x + b - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Die Panzerfaust: folgt dem Zielwinkel (im Weltraum, nicht gespiegelt).
 * Eigene Funktion, damit sie auch über einem Charakter-Sprite liegen kann.
 *
 * @param {CanvasRenderingContext2D} ctx - Ursprung = Körpermitte (Maßstab der prozeduralen Figur)
 * @param {object} p - `winkel`, `atem`, `rueck`, `aktiv`, `rohrLaenge`
 */
export function zeichneRohr(ctx, p) {
  const rechts = Math.cos(p.winkel) >= 0;
  const atem = p.atem;
  ctx.save();
  ctx.translate(0, -1.5 + atem * 0.5);
  ctx.rotate(-p.winkel);
  if (!rechts) ctx.scale(1, -1);
  const l = p.rohrLaenge + 5;
  const x0 = p.rueck - 4;
  ctx.fillStyle = css(ROHR);
  rundRect(ctx, x0, -2.7, l, 5.4, 1.6);
  ctx.fill(); kontur(ctx, 1.8);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x0 + 2, -2.2, l - 5, 1.1);
  // Mündungswulst und hintere Düse
  ctx.fillStyle = '#26301a';
  rundRect(ctx, x0 + l - 3.4, -3.5, 3.4, 7, 1.2);
  ctx.fill(); kontur(ctx, 1.5);
  ctx.fillStyle = p.aktiv ? PAL.orange : '#7d7a66';
  ctx.fillRect(x0 + l - 1.6, -2, 1.2, 4);
  rundRect(ctx, x0 - 1.6, -3.2, 3, 6.4, 1);
  ctx.fillStyle = '#1d2216';
  ctx.fill(); kontur(ctx, 1.3);
  // Haltegriff und Hand
  ctx.fillStyle = '#1d2216';
  ctx.fillRect(x0 + l * 0.42, 2.4, 1.8, 2.6);
  ctx.fillStyle = css(HAUT);
  ctx.beginPath();
  ctx.arc(x0 + l * 0.42 + 0.9, 3.2, 1.6, 0, Math.PI * 2);
  ctx.fill(); kontur(ctx, 1.2);
  ctx.restore();

}

/**
 * Zeichnet einen Soldaten.
 *
 * @param {CanvasRenderingContext2D} ctx - Ursprung = Körpermitte der Figur
 * @param {object} p
 * @param {string} p.team - Teamfarbe (`#rrggbb`)
 * @param {number} p.winkel - Zielwinkel im Bogenmaß (0 = rechts, π/2 = oben)
 * @param {number} p.atem - vertikaler Versatz von Kopf und Schultern (0 ohne Bewegung)
 * @param {number} p.rueck - Rückstoß des Rohrs in Pixeln
 * @param {boolean} p.aktiv - die Figur ist am Zug
 * @param {number} p.treffer - Aufhellung durch einen Treffer (0 bis 1)
 * @param {number} p.rohrLaenge - Länge des Rohrs bis zur Mündung
 */
export function zeichneSoldat(ctx, p) {
  const rechts = Math.cos(p.winkel) >= 0;
  const f = rechts ? 1 : -1;
  const team = hexRgb(p.team);
  const teamDunkel = css(mischeRgb(team, [10, 12, 14], 0.45));
  const teamHell = css(mischeRgb(team, [255, 255, 255], 0.22));
  const koerper = css(team);
  const atem = p.atem;

  ctx.save();
  ctx.scale(f, 1);

  // Beine und Stiefel
  ctx.fillStyle = css(HOSE);
  rundRect(ctx, -4.6, 2.5, 4.2, 6.5, 1);
  ctx.fill(); kontur(ctx);
  rundRect(ctx, 0.4, 2.5, 4.2, 6.5, 1);
  ctx.fill(); kontur(ctx);
  ctx.fillStyle = '#15181c';
  rundRect(ctx, -5.6, 7.6, 5.6, 3.2, 1.2);
  ctx.fill(); kontur(ctx, 1.3);
  rundRect(ctx, -0.2, 7.6, 5.8, 3.2, 1.2);
  ctx.fill(); kontur(ctx, 1.3);

  // Rumpf in Teamfarbe mit Gürtel
  ctx.fillStyle = koerper;
  rundRect(ctx, -5.8, -6 + atem * 0.5, 11.6, 10, 2.4);
  ctx.fill(); kontur(ctx, 1.9);
  ctx.fillStyle = teamHell;
  ctx.fillRect(-4.6, -5 + atem * 0.5, 4, 2);
  ctx.fillStyle = teamDunkel;
  ctx.fillRect(-5.2, 1.6, 10.4, 2);
  ctx.fillStyle = '#d8b44a';
  ctx.fillRect(-0.9, 1.6, 1.8, 2);

  // Kopf: Gesicht und Helm
  const ky = -9.2 + atem;
  ctx.fillStyle = css(HAUT);
  ctx.beginPath();
  ctx.arc(0.8, ky + 0.6, 3.5, 0, Math.PI * 2);
  ctx.fill(); kontur(ctx, 1.5);
  ctx.fillStyle = '#14171a';
  ctx.beginPath();
  ctx.arc(2.5, ky + 0.2, 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5440';
  ctx.fillRect(0.4, ky + 2.2, 3.6, 1.1);

  ctx.fillStyle = css(HELM);
  ctx.beginPath();
  ctx.arc(0.6, ky - 0.4, 4.8, Math.PI, Math.PI * 2);
  ctx.lineTo(5.4, ky - 0.4);
  ctx.lineTo(-4.2, ky - 0.4);
  ctx.closePath();
  ctx.fill(); kontur(ctx, 1.7);
  ctx.fillStyle = koerper;
  ctx.fillRect(-3.6, ky - 1.9, 8.4, 1.4);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.arc(-1.2, ky - 3.2, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  zeichneRohr(ctx, p);

  if (p.treffer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.treffer);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(0, -2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Basishöhe des Charakter-Sprites in Weltpixeln (Hitbox 20 px hoch, der Kopf ragt darüber). */
export const SPRITE_HOEHE = 52;
/** Abstand der Füße von der Figurmitte (PLAYER_HALF_HEIGHT). */
export const FUSS_ABSTAND = 10;
/** Höhe der Hand (Waffe, Mündung) relativ zur Figurmitte, vor der Skalierung. */
export const HAND_HOEHE = -7.25;
/** Sichtbare Bildschirmhöhe der Figur in Pixeln, die die Skalierung anstrebt. */
const ZIEL_PIXEL = 80;
/** Sichtbarer Anteil der Spritehöhe (Rand oben/unten im Bild). */
const INHALT_ANTEIL = 0.93;
const SKALA_MIN = 0.75;
const SKALA_MAX = 5.4;

/**
 * Darstellungsfaktor der Sprites für einen Kamerazoom: Die Figur bleibt etwa
 * `ZIEL_PIXEL` hoch auf dem Bildschirm, mit Unter- und Obergrenze (bei sehr
 * kleinem Zoom wächst sie nicht mehr weiter, bei großem Zoom schrumpft sie
 * nur bis zu einem Mindestfaktor). Reine Anzeige, die Hitbox bleibt gleich.
 *
 * @param {number} zoom - Bildschirmpixel je Weltpixel
 */
export function figurSkalaFuer(zoom) {
  const z = zoom > 0 ? zoom : 1;
  return Math.max(SKALA_MIN, Math.min(SKALA_MAX, ZIEL_PIXEL / (z * SPRITE_HOEHE * INHALT_ANTEIL)));
}
const NEUTRAL = Object.freeze({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0 });

/**
 * Zeichnet eine Fraktionsfigur als Sprite.
 *
 * Ursprung = Figurmitte (wie bei `zeichneSoldat`); die Füße stehen bei
 * y = +PLAYER_HALF_HEIGHT. Das Sprite blickt je Zielrichtung nach rechts oder
 * links (Spiegelung). Teamfarbe: Fußring statt Einfärbung. Keine Allokation je
 * Bild.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{bild: CanvasImageSource, anker: {fussY: number}}} fig - aus `holeFigur`
 * @param {object} p - `team`, `winkel`, `aktiv`, `zeit`, `reduziert`, `pose` (aus `FigurPosen`), `alpha`
 */
export function zeichneFigurSprite(ctx, fig, p) {
  const f = Math.cos(p.winkel) >= 0 ? 1 : -1;
  const h = SPRITE_HOEHE;
  const fuss = FUSS_ABSTAND;
  const pose = p.pose ?? NEUTRAL;

  // Fußring in Teamfarbe (die aktive Figur pulsiert, sofern Bewegung erlaubt ist)
  ctx.save();
  ctx.strokeStyle = p.team;
  ctx.globalAlpha = (p.aktiv ? 0.95 : 0.7) * (p.alpha ?? 1);
  ctx.lineWidth = p.aktiv ? 2.4 : 1.6;
  const puls = p.aktiv && !p.reduziert ? 1 + Math.sin(p.zeit * 5) * 0.06 : 1;
  ctx.beginPath();
  ctx.ellipse(0, fuss, 12 * puls, 3.4 * puls, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (p.aktiv) {
    // Die Figur am Zug: zweiter, limettenfarbener Ring außen, auch ohne Namensschild erkennbar.
    ctx.strokeStyle = PAL.limette;
    ctx.globalAlpha = 0.9 * (p.alpha ?? 1);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, fuss, 15.5 * puls, 4.8 * puls, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  if (p.alpha !== undefined && p.alpha < 1) ctx.globalAlpha = Math.max(0, p.alpha);
  // Alle Posen drehen/strecken um den Fußpunkt, damit die Füße am Boden bleiben.
  ctx.translate(pose.dx, fuss + pose.dy);
  if (pose.rot !== 0) ctx.rotate(pose.rot);
  ctx.scale(f * pose.sx, pose.sy);
  ctx.drawImage(fig.bild, -h / 2, -h * fig.anker.fussY, h, h);
  if (pose.flash > 0) {
    // Treffer-Blitz: weiße Silhouette über dem Sprite.
    ctx.globalAlpha = pose.flash * 0.85 * (p.alpha ?? 1);
    ctx.drawImage(fig.hell, -h / 2, -h * fig.anker.fussY, h, h);
  }
  ctx.restore();
}

/**
 * Zeichnet die gehaltene Waffe (Ikone) vor der Figur.
 *
 * Die Ikone liegt am Zielstrahl, dreht mit dem Zielwinkel (bei Blick nach links
 * gespiegelt, damit sie nie auf dem Kopf steht) und weicht beim Schuss zurück.
 * Nahkampfwaffen schwingen beim Einsatz um die Hand.
 *
 * @param {CanvasRenderingContext2D} ctx - Ursprung = Figurmitte (Weltpixel)
 * @param {CanvasImageSource} ikone
 * @param {object} p - `winkel`, `rueck` (negativ = zurück), `laenge` (Abstand der Spitze), `schwung` (rad)
 */
export function zeichneWaffeInHand(ctx, ikone, p) {
  const groesse = 17;
  const links = Math.cos(p.winkel) < 0;
  ctx.save();
  ctx.translate(0, HAND_HOEHE);
  ctx.rotate(-p.winkel);
  if (links) ctx.scale(1, -1);
  ctx.translate(p.laenge - groesse / 2 + p.rueck, 0);
  if (p.schwung) ctx.rotate(links ? -p.schwung : p.schwung);
  // Dunkler Schlagschatten hebt die Ikone vom Sprite ab.
  ctx.globalAlpha = 0.45;
  ctx.drawImage(ikone, -groesse / 2 + 0.8, -groesse / 2 + 0.8, groesse, groesse);
  ctx.globalAlpha = 1;
  ctx.drawImage(ikone, -groesse / 2, -groesse / 2, groesse, groesse);
  ctx.restore();
}

/**
 * Mittlere Körperfarbe an der Handhöhe einer Figur (Arm und Handschuh der Waffenhand).
 * Wird je Figur einmal aus dem Sprite gemessen und am Eintrag gemerkt.
 *
 * @param {{bild: CanvasImageSource, anker?: {fussY?: number}}} fig - aus `holeFigur`
 * @param {{handAnteil: number}} hand - aus `figurHand`
 * @returns {string} CSS-Farbe
 */
export function handFarbeFuer(fig, hand) {
  const schluessel = `_hand${hand.handAnteil}`;
  if (fig[schluessel]) return fig[schluessel];
  let farbe = '#c9a27e';
  try {
    const kante = fig.bild.width || 128;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(kante, kante) : Object.assign(document.createElement('canvas'), { width: kante, height: kante });
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(fig.bild, 0, 0);
    const fuss = fig.anker?.fussY ?? 0.96;
    const mitteY = Math.round((fuss - hand.handAnteil) * kante);
    const r = Math.round(kante * 0.07);
    const x0 = Math.round(kante * 0.4);
    const w = Math.round(kante * 0.2);
    const y0 = Math.max(0, mitteY - r);
    const daten = g.getImageData(x0, y0, w, Math.min(kante - y0, 2 * r)).data;
    let rs = 0; let gs = 0; let bs = 0; let n = 0;
    for (let i = 0; i < daten.length; i += 4) {
      if (daten[i + 3] > 200) { rs += daten[i]; gs += daten[i + 1]; bs += daten[i + 2]; n += 1; }
    }
    // Mit hellem Hautton gemischt, damit die Faust vor dem Körper lesbar bleibt.
    if (n > 12) farbe = `rgb(${Math.round(rs / n * 0.6 + 217 * 0.4)},${Math.round(gs / n * 0.6 + 179 * 0.4)},${Math.round(bs / n * 0.6 + 140 * 0.4)})`;
  } catch {
    // Messung nicht möglich (kein Lesezugriff): Standardfarbe
  }
  fig[schluessel] = farbe;
  return farbe;
}

/** Arm und Griffhand (Humanoide, Schweber) bzw. Halterung (Aufbau) der Waffe; Weltrahmen der Figur. */
function zeichneArm(ctx, p) {
  const f = p.figur;
  if (!f) return;
  const links = Math.cos(p.winkel) < 0;
  if (f.aufbau) {
    // Halterung: kleine dunkle Lafette unter dem Griffpunkt.
    ctx.fillStyle = '#20252b';
    ctx.strokeStyle = KONTUR;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(p.handX, p.handY + 2.2, 4.2, 1.7, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    return;
  }
  const farbe = p.handFarbe ?? '#c9a27e';
  const sx = links ? 1.2 : -1.2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = KONTUR;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(sx, p.handY - 4.5);
  ctx.lineTo(p.handX, p.handY);
  ctx.stroke();
  ctx.strokeStyle = farbe;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
}

/** Die greifende Faust am Griffpunkt (Waffenrahmen, Ursprung = Griff). */
function zeichneFaust(ctx, p) {
  if (!p.figur || p.figur.aufbau) return;
  ctx.fillStyle = p.handFarbe ?? '#c9a27e';
  ctx.strokeStyle = KONTUR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Daumenlinie: die Hand umgreift den Griff
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-1.2, -0.2); ctx.lineTo(1.4, -0.2);
  ctx.stroke();
}

const ORB_RADIUS = 6.2;

/**
 * Kachel-Waffe als Zauber-Darstellung: ein schwebender Orb vor der Hand mit Glühen, kreisenden
 * Funken (Partikelring) in der Blitzfarbe und dem Kachelbild als Mini-Icon. Ursprung = Griff
 * (Waffenrahmen); gibt über `aus` Mitte und Mündung des Orbs zurück.
 */
function zeichneOrb(ctx, sp, par, pose, p, aus) {
  const R = ORB_RADIUS * (1 + 0.08 * pose.glanz);
  const bob = p.reduziert ? 0 : Math.sin(p.zeit * 2.3) * 0.7;
  const ox = R + 3.5;
  const oy = -3.2 - bob;
  aus.mx = ox + R; aus.my = oy;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.65 + 0.25 * pose.glanz;
  ctx.drawImage(sp.glanz, ox - R * 2.1, oy - R * 2.1, R * 4.2, R * 4.2);
  // Partikelring
  ctx.fillStyle = sp.flashColor;
  const n = 6;
  const dreh = p.reduziert ? 0.4 : p.zeit * 1.5;
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < n; i += 1) {
    const w = dreh + (i * 2 * Math.PI) / n;
    const rr = R + 2.4 + Math.sin(w * 2 + i) * 0.5;
    ctx.beginPath();
    ctx.arc(ox + Math.cos(w) * rr, oy + Math.sin(w) * rr * 0.9, i % 2 ? 0.7 : 1.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Kugel mit Kachelbild
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0c0f14';
  ctx.beginPath(); ctx.arc(ox, oy, R + 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.clip();
  const q = 8; const qs = 64 - 2 * q;
  ctx.drawImage(sp.held, q, q, qs, qs, ox - R, oy - R, R * 2, R * 2);
  if (pose.dunkel > 0) {
    ctx.globalAlpha = pose.dunkel;
    ctx.drawImage(sp.dunkel, q, q, qs, qs, ox - R, oy - R, R * 2, R * 2);
  }
  if (pose.weiss > 0) {
    ctx.globalAlpha = Math.min(1, pose.weiss) * 0.85;
    ctx.drawImage(sp.silhouette, q, q, qs, qs, ox - R, oy - R, R * 2, R * 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = sp.flashColor;
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(ox, oy, R, 0, Math.PI * 2); ctx.stroke();
}

/**
 * Zeichnet die gehaltene Waffe als Sprite aus dem Atlas (`waffenSprites.js`).
 *
 * Der Griffanker der Waffe sitzt auf der Hand der Figur; die Waffe dreht um den
 * Griff mit dem Zielwinkel (bei Blick nach links gespiegelt, nie verkehrt). Auf
 * diesem Rahmen liegen die Pose (Rückstoß, Heben, Pendeln: `waffenAnimation.js`),
 * die Abdunkelung samt Füllband beim Nachladen, der weiße Treffer-/Aufnehm-Blitz
 * über der Silhouette, der Aufladeglanz und der Mündungsblitz am Mündungsanker.
 * Hand und Arm (Humanoide) bzw. Halterung (Aufbau) gehören dazu; Kachel-Waffen
 * erscheinen als Zauber-Orb (`kachel: 'orb'`) oder als herausgelöstes Motiv mit Glühen.
 * Keine Allokation je Bild.
 *
 * @param {CanvasRenderingContext2D} ctx - Ursprung = Figurmitte (Weltpixel)
 * @param {object} sp - Eintrag aus `holeWaffenSprite`
 * @param {object} par - Parametersatz aus `waffenParameter`
 * @param {object} pose - aus `waffenPose`
 * @param {{winkel:number, handX:number, handY:number, figur?:object, handFarbe?:string, zeit?:number, reduziert?:boolean}} p
 */
const ORB_TMP = { mx: 0, my: 0 };

export function zeichneWaffeSprite(ctx, sp, par, pose, p) {
  const links = Math.cos(p.winkel) < 0;
  const skalaFigur = p.figur?.skala ?? 1;
  const zelle = par.zelle * skalaFigur;
  const k = zelle / 128;
  const gx = (sp.grip.x + par.griff) * k;
  const gy = sp.grip.y * k;
  const orb = par.orb === true && sp.kachel === 'orb';
  zeichneArm(ctx, p);
  ctx.save();
  ctx.translate(p.handX, p.handY);
  ctx.rotate(-p.winkel);
  if (links) ctx.scale(1, -1);
  ctx.translate(pose.vor, -pose.hoch);
  if (pose.drehung !== 0) ctx.rotate(-pose.drehung);
  if (pose.skala !== 1) ctx.scale(pose.skala, pose.skala);
  // Achse Griff -> Mündung auf den Zielstrahl legen (geschätzte Anker sind oft leicht geneigt).
  if (sp.achse !== 0 && !orb) ctx.rotate(-sp.achse);

  let mx = (sp.mx - par.griff) * k;
  let my = sp.my * k;
  if (orb) {
    zeichneOrb(ctx, sp, par, pose, p, ORB_TMP);
    mx = ORB_TMP.mx; my = ORB_TMP.my;
  } else {
    if (sp.kachel === 'motiv') {
      // Herausgelöstes Motiv: weiches Glühen in der Blitzfarbe dahinter, damit es nicht als flache Karte wirkt.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.2 * pose.glanz;
      ctx.drawImage(sp.glanz, -gx + zelle * 0.1, -gy + zelle * 0.1, zelle * 0.8, zelle * 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Dunkler Schlagschatten hebt die Waffe vom Sprite ab.
    ctx.globalAlpha = 0.4;
    ctx.drawImage(sp.dunkel, -gx + 0.8, -gy + 0.8, zelle, zelle);
    ctx.globalAlpha = 1;
    ctx.drawImage(sp.held, -gx, -gy, zelle, zelle);

    if (pose.dunkel > 0) {
      ctx.globalAlpha = pose.dunkel;
      ctx.drawImage(sp.dunkel, -gx, -gy, zelle, zelle);
      // Füllband: Die Waffe füllt sich vom Griff zur Spitze in der Blitzfarbe.
      ctx.save();
      ctx.beginPath();
      ctx.rect(-gx, -gy, zelle * pose.ladung, zelle);
      ctx.clip();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(sp.farbig, -gx, -gy, zelle, zelle);
      ctx.restore();
    }
    if (pose.weiss > 0) {
      ctx.globalAlpha = Math.min(1, pose.weiss) * 0.85;
      ctx.drawImage(sp.silhouette, -gx, -gy, zelle, zelle);
    }
    ctx.globalAlpha = 1;
  }

  zeichneFaust(ctx, p);

  if (pose.glanz > 0 && !orb) {
    // Aufladeglanz: bei Selbstwirkung um die Waffenmitte, sonst an der Mündung.
    const selbst = par.art === 'selbst';
    const r = (selbst ? 11 : 7) * (0.7 + 0.5 * pose.glanz);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85 * pose.glanz;
    ctx.drawImage(sp.glanz, (selbst ? mx * 0.5 : mx) - r, (selbst ? my * 0.5 : my) - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (pose.blitz > 0) {
    ctx.translate(mx, my);
    zeichneMuendungsblitz(ctx, pose.blitzForm, pose.blitzGroesse, pose.blitz, sp.flashColor);
  }
  ctx.restore();
}

/**
 * Kurzer Aura-Ring für Selbstwirkungen (Heilung, Schild, Verstärkung …).
 *
 * @param {number} anteil - 1 = frisch, 0 = verklungen
 */
export function zeichneAuraRing(ctx, farbe, anteil) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, anteil) * 0.8;
  ctx.strokeStyle = farbe;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, -2, 10 + (1 - anteil) * 16, 14 + (1 - anteil) * 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Lebensbalken-Farbe nach Füllstand (Palette des Entwurfs). */
export function balkenFarbe(anteil) {
  return anteil > 0.6 ? PAL.limette : anteil > 0.3 ? PAL.orange : PAL.rotorange;
}

/**
 * Namensschild mit Lebensbalken: dunkle Plakette, heller Text (Kontrast über 12:1).
 *
 * @param {CanvasRenderingContext2D} ctx - in Kartenkoordinaten
 */
export function zeichneNamensschild(ctx, x, anker, label, anteil, teamFarbe, aktiv, s = 1, platz = null) {
  const text = String(label ?? '').slice(0, 12);
  ctx.save();
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const breite = Math.max(30, Math.ceil(ctx.measureText(text).width) + 10);
  /*
   * Liegt das Schild außerhalb des sicheren Bereichs (unter der Kopfleiste,
   * hinter der Seitenleiste), wird es versetzt: unter die Füße geklappt oder
   * hineingeschoben. Ohne `platz` (Replay, Tests) bleibt alles wie bisher.
   */
  const lage = platz?.grenzen
    ? platziereSchild({ x, anker, fuss: platz.fuss ?? anker, breite, s }, platz.grenzen)
    : { x, anker, unten: false };
  const aktivPfeil = aktiv && !lage.unten;
  // Das Schild wächst vom Anker nach oben; `s` skaliert das ganze Schild (Lesbarkeit bei kleinem Zoom).
  ctx.translate(Math.round(lage.x - (breite * s) / 2), Math.round(lage.anker - 22 * s));
  ctx.scale(s, s);

  ctx.fillStyle = 'rgba(13, 15, 18, 0.88)';
  rundRect(ctx, 0, 0, breite, 12, 3);
  ctx.fill();
  ctx.strokeStyle = aktiv ? PAL.limette : teamFarbe;
  ctx.lineWidth = aktiv ? 1.6 : 1.2;
  ctx.stroke();
  ctx.fillStyle = PAL.text;
  ctx.fillText(text, breite / 2, 6.5);

  const bb = breite - 4;
  ctx.fillStyle = PAL.kontur;
  ctx.fillRect(1, 13, bb + 2, 7);
  ctx.fillStyle = PAL.bg2;
  ctx.fillRect(2, 14, bb, 5);
  ctx.fillStyle = balkenFarbe(anteil);
  ctx.fillRect(2, 14, Math.max(0, bb * anteil), 5);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(2, 14, Math.max(0, bb * anteil), 1.5);

  if (aktivPfeil) {
    // Pfeil über dem Schild: die Figur am Zug.
    const mx = breite / 2;
    ctx.fillStyle = PAL.limette;
    ctx.strokeStyle = PAL.kontur;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx - 5, -8);
    ctx.lineTo(mx + 5, -8);
    ctx.lineTo(mx, -1.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}
