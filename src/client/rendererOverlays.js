/**
 * Überlagerungen des Renderers (QV-5, aus `renderer.js` ausgezogen): Kisten, Günther, Heimdall, Mahlstrom,
 * Cookie und Wiederholungsanzeige.
 *
 * Der Code ist wortgleich übernommen; `this` heißt hier `r` (der Renderer). Was dort privat war
 * (`#zeichneTier`), kommt als Funktion herein. Reine Darstellung, keine Wirkung auf Motor oder Hash.
 *
 * @module rendererOverlays
 */
import { GUENTHER_IDENTITY } from '../shared/config/guenther.js';
import { cookieStufe, COOKIE_HUNGER } from '../shared/config/cookie.js';
import { zeichneKistenInhalt } from './kistenSichtAnzeige.js';
import { kistenFarbe, kistenMarke } from './rendererLogik.js';
import { KISTE_KANTE } from '../shared/config/kisten.js';

/**
 * Zeichnet Günther als Kleinspitz.
 *
 * Prozedural statt als Bild: Der Hund ist klein, bewegt sich und muss zu
 * jeder Kulisse passen. Ein Bild hätte eine feste Größe, einen festen
 * Blickwinkel und einen Hintergrund, der zu neun Wasser- und zehn Himmelarten
 * nicht passt.
 *
 * @param {object|null} guenther - Zustand aus `getState().guenther`
 */
export function zeichneGuenther(r, guenther, zeichneTier) {
  if (!guenther?.aktiv) return;
  // Fassung 2 trägt eine Pose: dann zeichnet das Sprite (geladen) — sonst der Hund unten.
  if (guenther.pose && zeichneTier('guenther', guenther)) return;
  const { coat, coatDark, belly, nose, height, length } = GUENTHER_IDENTITY;
  const richtung = guenther.richtung >= 0 ? 1 : -1;
  const x = guenther.x - length / 2;
  const y = guenther.y;

  r.ctx.save();
  r.ctx.translate(x, y);
  r.ctx.scale(richtung, 1);

    const h = height;
    const l = length;

    // Schatten
    r.ctx.fillStyle = 'rgba(0,0,0,0.28)';
    r.ctx.beginPath();
    r.ctx.ellipse(l * 0.5, 1, l * 0.55, 4, 0, 0, Math.PI * 2);
    r.ctx.fill();

    // Beine (vier kurze Striche)
    r.ctx.strokeStyle = `rgb(${coatDark.join(',')})`;
    r.ctx.lineWidth = 3;
    const lauf = Math.sin(r.time * 0.22) * 2;
    for (const [ox, phase] of [[l * 0.2, 1], [l * 0.32, -1], [l * 0.68, 1], [l * 0.8, -1]]) {
      r.ctx.beginPath();
      r.ctx.moveTo(ox, -h * 0.42);
      r.ctx.lineTo(ox + phase * lauf * 0.6, 0);
      r.ctx.stroke();
    }

    // Körper
    r.ctx.fillStyle = `rgb(${coat.join(',')})`;
    r.ctx.beginPath();
    r.ctx.ellipse(l * 0.5, -h * 0.62, l * 0.42, h * 0.34, 0, 0, Math.PI * 2);
    r.ctx.fill();

    // Brust (heller Bauch)
    r.ctx.fillStyle = `rgb(${belly.join(',')})`;
    r.ctx.beginPath();
    r.ctx.ellipse(l * 0.5, -h * 0.44, l * 0.3, h * 0.18, 0, 0, Math.PI * 2);
    r.ctx.fill();

    // Kopf
    r.ctx.fillStyle = `rgb(${coat.join(',')})`;
    r.ctx.beginPath();
    r.ctx.arc(l * 0.86, -h * 0.86, h * 0.3, 0, Math.PI * 2);
    r.ctx.fill();

    // Schnauze
    r.ctx.fillStyle = `rgb(${coatDark.join(',')})`;
    r.ctx.beginPath();
    r.ctx.ellipse(l * 1.02, -h * 0.8, h * 0.16, h * 0.11, 0, 0, Math.PI * 2);
    r.ctx.fill();

    // Nase
    r.ctx.fillStyle = `rgb(${nose.join(',')})`;
    r.ctx.beginPath();
    r.ctx.arc(l * 1.12, -h * 0.8, 1.8, 0, Math.PI * 2);
    r.ctx.fill();

    // Spitze Ohren — das Kennzeichen eines Kleinspitzes.
    r.ctx.fillStyle = `rgb(${coatDark.join(',')})`;
    for (const ohr of [-0.12, 0.12]) {
      r.ctx.beginPath();
      r.ctx.moveTo(l * (0.8 + ohr), -h * 1.02);
      r.ctx.lineTo(l * (0.82 + ohr), -h * 1.3);
      r.ctx.lineTo(l * (0.92 + ohr), -h * 1.04);
      r.ctx.closePath();
      r.ctx.fill();
    }

    // Auge
    r.ctx.fillStyle = '#2b2622';
    r.ctx.beginPath();
    r.ctx.arc(l * 0.9, -h * 0.9, 1.5, 0, Math.PI * 2);
    r.ctx.fill();

    // Schwanz: geringelt, wie beim Spitz, und wedelt.
    r.ctx.strokeStyle = `rgb(${coat.join(',')})`;
    r.ctx.lineWidth = 4;
    const wedeln = Math.sin(r.time * 0.3) * 4;
    r.ctx.beginPath();
    r.ctx.moveTo(l * 0.1, -h * 0.72);
    r.ctx.quadraticCurveTo(-l * 0.14, -h * 1.0 + wedeln, l * 0.04, -h * 1.2 + wedeln);
    r.ctx.stroke();

  r.ctx.restore();
}


export function zeichneKisten(r, crates) {
  for (const crate of crates) {
    const color = kistenFarbe(crate.rarity);
    const size = KISTE_KANTE;
    r.ctx.save();
    r.ctx.translate(crate.x, crate.y);
    r.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    r.ctx.fillRect(-size / 2 + 1, -size / 2 + 2, size, size);
    r.ctx.fillStyle = '#2b3540';
    r.ctx.fillRect(-size / 2, -size / 2, size, size);
    r.ctx.strokeStyle = color;
    r.ctx.lineWidth = 2;
    r.ctx.strokeRect(-size / 2, -size / 2, size, size);
    /*
     * DIE ART DER KISTE SICHTBAR MACHEN (FUND behoben, docs/verkabelung.md §B1).
     *
     * Hier stand NUR die Seltenheitsfarbe. Die Art (`crateType`) war die ganze
     * Zeit auf der Leitung und im Zustand, wurde aber nirgends gezeichnet —
     * eine SPENGFALLE sah damit aus wie eine Waffenkiste. Für den Spieler ist
     * das der Unterschied zwischen „holen" und „nicht anfassen".
     *
     * Die Marke ersetzt das X der alten Zeichnung, weil das X die einzige
     * Aussage war, die über jeder Kiste stand. Gefülltes Quadrat = Waffe,
     * Ring = Nachschub, leer = leer, Warndreieck = Falle.
     */
    r.ctx.strokeStyle = color;
    r.ctx.globalAlpha = 0.85;
    r.ctx.lineWidth = 2;
    const halb = size / 2;
    switch (kistenMarke(crate.crateType)) {
      case 'gefuellt':
        r.ctx.fillStyle = color;
        r.ctx.fillRect(-halb + 3, -halb + 3, size - 6, size - 6);
        break;
      case 'ring':
        r.ctx.beginPath();
        r.ctx.arc(0, 0, halb - 3, 0, Math.PI * 2);
        r.ctx.stroke();
        break;
      case 'streifen': for (const dx of [-3, 0, 3]) r.ctx.strokeRect(dx - 0.5, -halb + 3, 1, size - 6); break; // Patronen
      case 'dreieck': {
        // Warndreieck — die einzige Art, die man NICHT öffnen will.
        r.ctx.beginPath();
        r.ctx.moveTo(0, -halb + 2);
        r.ctx.lineTo(halb - 2, halb - 2);
        r.ctx.lineTo(-halb + 2, halb - 2);
        r.ctx.closePath();
        r.ctx.stroke();
        break;
      }
      default:
        // `leer` — die Kiste bleibt leer gezeichnet, das ist die Aussage.
        break;
    }
    r.ctx.restore();
    if (crate.inhalt) zeichneKistenInhalt(r.ctx, crate, r.waffenFassung); // Allsehendes Auge
  }
}

/**
 * Bifröst und Blitze — die Verwandlung zu Heimdall.
 *
 * Rein visuell und zeitlich begrenzt. Wird vom Client über `addHeimdall()`
 * ausgelöst, wenn das Ereignis eintrifft.
 */
export function zeichneHeimdall(r) {
  const effekt = r.effects.find(e => e.kind === 'heimdall');
  if (!effekt) return;

  const fortschritt = 1 - effekt.life;
  const staerke = Math.sin(fortschritt * Math.PI);

  r.ctx.save();
  // Regenbogenbrücke: sieben Streifen, die sich über das Feld legen.
  const farben = ['#e63946', '#f77f00', '#fcbf49', '#a7c957', '#4cc9f0', '#4361ee', '#9d4edd'];
  const hoehe = r.height * 0.5;
  for (let i = 0; i < farben.length; i++) {
    r.ctx.globalAlpha = 0.28 * staerke;
    r.ctx.fillStyle = farben[i];
    const y = r.height * 0.34 + i * (hoehe / farben.length) * 0.5;
    r.ctx.fillRect(0, y, r.width, (hoehe / farben.length) * 0.5);
  }

  // Blitze
  r.ctx.globalAlpha = staerke;
  r.ctx.strokeStyle = 'rgba(240,248,255,0.95)';
  r.ctx.lineWidth = 3;
  for (let b = 0; b < 5; b += 1) {
    const startX = (effekt.seed * 37 + b * 233) % r.width;
    r.ctx.beginPath();
    r.ctx.moveTo(startX, 0);
    let lx = startX;
    for (let seg = 1; seg <= 6; seg += 1) {
      lx += Math.sin(seg * 2.1 + b) * 26;
      r.ctx.lineTo(lx, (seg / 6) * r.height * 0.6);
    }
    r.ctx.stroke();
  }

  // Aufhellung
  r.ctx.globalAlpha = 0.35 * staerke;
  r.ctx.fillStyle = '#ffffff';
  r.ctx.fillRect(0, 0, r.width, r.height);
  r.ctx.restore();
}


export function zeichneMaelstrom(r, maelstrom) {
  if (!maelstrom?.active || maelstrom.inset <= 0) return;
  const { inset } = maelstrom;
  const gradientLeft = r.ctx.createLinearGradient(0, 0, inset * 2, 0);
  gradientLeft.addColorStop(0, 'rgba(255, 77, 0, 0.5)');
  gradientLeft.addColorStop(1, 'rgba(255, 77, 0, 0)');
  r.ctx.fillStyle = gradientLeft;
  r.ctx.fillRect(0, 0, inset * 2, r.height);

  const gradientRight = r.ctx.createLinearGradient(r.width, 0, r.width - inset * 2, 0);
  gradientRight.addColorStop(0, 'rgba(255, 77, 0, 0.5)');
  gradientRight.addColorStop(1, 'rgba(255, 77, 0, 0)');
  r.ctx.fillStyle = gradientRight;
  r.ctx.fillRect(r.width - inset * 2, 0, inset * 2, r.height);

  r.ctx.strokeStyle = 'rgba(255, 120, 40, 0.9)';
  r.ctx.lineWidth = 2;
  r.ctx.setLineDash([10, 8]);
  r.ctx.beginPath();
  r.ctx.moveTo(inset, 0);
  r.ctx.lineTo(inset, r.height);
  r.ctx.moveTo(r.width - inset, 0);
  r.ctx.lineTo(r.width - inset, r.height);
  r.ctx.stroke();
  r.ctx.setLineDash([]);
}

/** Cookie, der Kater des Weltuntergangs: Sprite je Pose, darüber Name und Hungerbalken. */
export function zeichneCookie(r, cookie, zeichneTier) {
  if (!cookie?.aktiv) return;
  const ctx = r.ctx;
  if (!zeichneTier('cookie', cookie)) {
    // Rückfall bis das Bild da ist: ein schlichter Körper.
    ctx.save();
    ctx.fillStyle = 'rgb(120,90,70)';
    ctx.beginPath();
    ctx.ellipse(cookie.x, cookie.y - 14, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const stufe = cookieStufe(cookie.hunger ?? 0);
  const breite = 46;
  const x = cookie.x - breite / 2;
  const y = cookie.y - 92;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, y - 1, breite + 2, 7);
  ctx.fillStyle = stufe === 'wut' ? '#e5484d' : stufe === 'laut' ? '#f0a020' : stufe === 'leise' ? '#d8c24a' : '#5aa86a';
  ctx.fillRect(x, y, breite * Math.min(1, (cookie.hunger ?? 0) / COOKIE_HUNGER.max), 5);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cookie', cookie.x, y - 4);
  ctx.restore();
}

/**
 * Wiederholung des letzten Schusses (Zugpause): verblassende Spur, leuchtender Kopf,
 * am Ende ein Einschlagring. Nur Anzeige; die Daten stammen aus `SchussAufnahme`.
 */
export function zeichneWiederholung(r, w) {
  if (!w?.spur?.length) return;
  const ctx = r.ctx;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 1; i < w.spur.length; i += 1) {
    const alter = i / w.spur.length;
    ctx.strokeStyle = `rgba(76, 201, 240, ${0.12 + 0.6 * alter})`;
    ctx.beginPath();
    ctx.moveTo(w.spur[i - 1][0], w.spur[i - 1][1]);
    ctx.lineTo(w.spur[i][0], w.spur[i][1]);
    ctx.stroke();
  }
  const [kx, ky] = w.kopf;
  const glut = ctx.createRadialGradient(kx, ky, 0, kx, ky, 12);
  glut.addColorStop(0, '#ffffff');
  glut.addColorStop(0.45, '#4cc9f0');
  glut.addColorStop(1, 'rgba(76,201,240,0)');
  ctx.fillStyle = glut;
  ctx.beginPath();
  ctx.arc(kx, ky, 12, 0, Math.PI * 2);
  ctx.fill();
  if (w.aufprall) {
    ctx.strokeStyle = 'rgba(244, 162, 97, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(kx, ky, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
