/**
 * Zeichnet laufende Feuerwesen (Waffenfassung 20, `pa_118`): ein kleiner Feuergnom als Comic-Sprite
 * (`assets/feuerwesen`, Posen `lauf1`/`lauf2` im Wechsel, `sprung` in der Luft, `zerbirst` beim Zerbersten; geladen
 * über `tierBilder.js` wie Günther und Cookie). Kurz vor dem Ende der Laufzeit flackert er.
 *
 * Reine Darstellung aus dem Zustand (`state.feuerwesen`, online aus den Ereignissen `feuerwesen_*`). Bis das Sprite
 * geladen ist, fällt die Zeichnung auf den alten Orb (Waffenbild im runden Rahmen) zurück.
 *
 * @module feuerwesenZeichnen
 */

/** Halbe Körperhöhe des gezeichneten Gnoms (px); Körpermaß im Motor: 12 px hoch, 8 px breit. */
const KOERPER = 6;
/**
 * Zeichenmaßstab: Die Figurenbilder sind größer als ihr Trefferfeld gezeichnet; der Gnom wird im selben Verhältnis
 * vergrößert, sonst ist er neben den Figuren nur ein Punkt (Sichtprüfung am Bildschirmfoto der E2E-Probe).
 */
const SKALA = 1.8;

/**
 * @param {CanvasRenderingContext2D} ctx - im Weltkoordinatensystem
 * @param {{id:number, x:number, y:number, richtung:number, luft:boolean, alter:number, laufzeitTakte:number}[]} liste
 * @param {{ikone:HTMLImageElement|null, sheets:object|null, zeit:number, reduziert:boolean,
 *   pose:((name:string)=>({bild:CanvasImageSource, anker:{x:number,y:number}, kante:number}|null))|null}} optik
 * @returns {number} Anzahl gezeichneter Gnome
 */
export function zeichneFeuerwesen(ctx, liste, { ikone = null, sheets = null, zeit = 0, reduziert = false, pose = null } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) return 0;
  let anzahl = 0;
  for (const g of liste) {
    if (zeichneSprite(ctx, g, pose, zeit, reduziert)) { anzahl += 1; continue; }
    const blick = g.richtung < 0 ? -1 : 1;
    const phase = reduziert ? 0 : zeit * 16 + g.id;
    const hub = reduziert || g.luft ? 0 : Math.abs(Math.sin(phase)) * 1.5;
    const mitteY = -KOERPER - 3 - hub;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(SKALA, SKALA);

    // Schatten am Boden (in der Luft kleiner).
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 1, g.luft ? 3 : 5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glut und Flammen hinter dem Körper (Flammen aus dem Sheet, sobald es geladen ist).
    const flacker = reduziert ? 1 : 0.85 + 0.15 * Math.sin(zeit * 23 + g.id);
    const glut = ctx.createRadialGradient(0, mitteY, 1, 0, mitteY, 12 * flacker);
    glut.addColorStop(0, 'rgba(255, 210, 90, 0.8)');
    glut.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = glut;
    ctx.beginPath();
    ctx.arc(0, mitteY, 12 * flacker, 0, Math.PI * 2);
    ctx.fill();
    sheets?.zeichneFeuerring?.(ctx, 0, mitteY - 3, 22, Math.floor(zeit * 24) + g.id);

    // Beine: trippeln am Boden, angezogen in der Luft.
    ctx.strokeStyle = '#3a1608';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const schwung = g.luft ? 0.6 : Math.sin(phase) * 2.2;
    ctx.beginPath();
    ctx.moveTo(-1.5, mitteY + KOERPER - 1);
    ctx.lineTo(-1.5 + schwung * blick, g.luft ? -2 : 0);
    ctx.moveTo(1.5, mitteY + KOERPER - 1);
    ctx.lineTo(1.5 - schwung * blick, g.luft ? -2 : 0);
    ctx.stroke();

    // Körper: das Waffenbild im runden Rahmen, gespiegelt nach Laufrichtung.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, mitteY, KOERPER + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#c2410c';
    ctx.fill();
    if (ikone) {
      ctx.clip();
      ctx.scale(blick, 1);
      ctx.drawImage(ikone, -KOERPER - 2, mitteY - KOERPER - 2, (KOERPER + 2) * 2, (KOERPER + 2) * 2);
    }
    ctx.restore();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, mitteY, KOERPER + 1, 0, Math.PI * 2);
    ctx.stroke();

    // Restlaufzeit als Ring: voll beim Absetzen, leer beim Zerbersten.
    const rest = g.laufzeitTakte > 0 ? Math.max(0, 1 - g.alter / g.laufzeitTakte) : 0;
    if (rest > 0) {
      ctx.strokeStyle = rest < 0.25 ? '#ef476f' : '#fde68a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, mitteY, KOERPER + 3.5, -Math.PI / 2, -Math.PI / 2 + rest * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    anzahl += 1;
  }
  return anzahl;
}

/** Wechsel der Laufposen (s je Pose): passt zum Trippeln bei 1,6 px/Takt. */
const SCHRITT_S = 0.14;

/** Sprite-Darstellung eines Gnoms; `false`, solange die Pose nicht geladen ist. */
function zeichneSprite(ctx, g, pose, zeit, reduziert) {
  if (typeof pose !== 'function') return false;
  const name = g.luft ? 'sprung' : (reduziert || Math.floor((zeit + g.id * 0.07) / SCHRITT_S) % 2 === 0 ? 'lauf1' : 'lauf2');
  const e = pose(name);
  if (!e) return false;
  const k = e.kante / 256;
  const rest = g.laufzeitTakte > 0 ? Math.max(0, 1 - g.alter / g.laufzeitTakte) : 1;
  ctx.save();
  ctx.translate(g.x, g.y);
  // Schatten am Boden (in der Luft kleiner).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 1, e.kante * (g.luft ? 0.12 : 0.2), 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Kurz vor dem Zerbersten: flackern (die frühere „Zündschnur").
  if (!reduziert && rest < 0.2) ctx.globalAlpha = 0.65 + 0.35 * Math.abs(Math.sin(zeit * 18));
  ctx.scale(g.richtung < 0 ? -1 : 1, 1);
  ctx.drawImage(e.bild, -e.anker.x * k, -e.anker.y * k, 256 * k, 256 * k);
  ctx.restore();
  return true;
}

/** Dauer des Zerbersten-Bilds (s). */
export const ZERBIRST_DAUER_S = 0.35;

/**
 * Zerbersten-Bild an der Stelle, an der ein Gnom zerplatzt ist (`feuerwesen_zerbirst`); wächst kurz und blendet aus.
 * Die echten fünf Kugeln sind gewöhnliche Geschosse und werden davon unabhängig gezeichnet.
 *
 * @param {{x:number, y:number, richtung:number, start:number}[]} liste - wird von abgelaufenen Einträgen befreit
 * @returns {number} Anzahl gezeichneter Bilder
 */
export function zeichneFeuerwesenZerbersten(ctx, liste, { pose = null, zeit = 0 } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) return 0;
  for (let i = liste.length - 1; i >= 0; i -= 1) if (zeit - liste[i].start > ZERBIRST_DAUER_S) liste.splice(i, 1);
  const e = typeof pose === 'function' ? pose('zerbirst') : null;
  if (!e) return 0;
  for (const b of liste) {
    const t = Math.max(0, Math.min(1, (zeit - b.start) / ZERBIRST_DAUER_S));
    const k = (e.kante / 256) * (1 + 0.35 * t);
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.translate(b.x, b.y);
    ctx.scale(b.richtung < 0 ? -1 : 1, 1);
    ctx.drawImage(e.bild, -e.anker.x * k, -e.anker.y * k, 256 * k, 256 * k);
    ctx.restore();
  }
  return liste.length;
}
