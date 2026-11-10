/**
 * Zeichnet laufende Feuerwesen (Waffenfassung 20, `pa_118`): ein kleiner Feuergnom mit trippelnden Beinen, dessen
 * Körper das Bild der Waffe im runden Rahmen trägt (dieselbe Orb-Darstellung wie die Kachel des Feuerwesens), dahinter
 * die Flammen aus dem Effekt-Sheet `feuerring`. Ein Ring um den Kopf zeigt die Restlaufzeit (die „Zündschnur").
 *
 * Reine Darstellung aus dem Zustand (`state.feuerwesen`, online aus den Ereignissen `feuerwesen_*`); keine neuen
 * Bilddateien. Ohne geladenes Bild oder Sheet fällt die Zeichnung auf Kreis und Glut zurück.
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
 * @param {{ikone:HTMLImageElement|null, sheets:object|null, zeit:number, reduziert:boolean}} optik
 * @returns {number} Anzahl gezeichneter Gnome
 */
export function zeichneFeuerwesen(ctx, liste, { ikone = null, sheets = null, zeit = 0, reduziert = false } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) return 0;
  let anzahl = 0;
  for (const g of liste) {
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
