/**
 * Zeichnet generative Kulissen auf ein Canvas.
 *
 * Getrennt vom Renderer, weil es eine eigene Aufgabe ist: Der Renderer zeichnet
 * das Spielgeschehen, dieses Modul die Landschaft dahinter. Die Trennung hält
 * beide lesbar — hier stecken zwei Dutzend Zeichenroutinen für Himmel, Wasser,
 * Ambiente und Landmarken.
 *
 * Alle Positionen kommen als ANTEIL (0–1) aus der Kulisse und werden hier mit der
 * tatsächlichen Canvas-Größe multipliziert. Damit füllt dieselbe Kulisse Quer-
 * und Hochformat, ohne neu erzeugt zu werden.
 *
 * Die Bewegung ist rein visuell und hängt an der Frame-Zahl plus der Phase des
 * Elements. Sie beeinflusst die Simulation nicht — ein Replay bleibt gleich,
 * auch wenn die Anzeige flüssiger läuft.
 *
 * @module sceneryPainter
 */

import { PAL, folge, rauschen1, hexRgb, hash2 } from './stil.js';
import { zeichnePflanze } from './pflanzen.js';
import { zeichnePlanetenHimmel } from './planetenKulisse.js';

const BG0 = hexRgb(PAL.bg0);
const BG1 = hexRgb(PAL.bg1);
const BG2 = hexRgb(PAL.bg2);
const BG3 = hexRgb(PAL.bg3);

/** Farbe aus einem RGB-Feld als CSS-Wert. */
function rgb([r, g, b], alpha = 1) {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mischt zwei Farben; `t` = 0 ergibt `a`, `t` = 1 ergibt `b`. */
function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Helligkeit einer Farbe (0–255). */
function luma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Kürzt eine Farbe auf einen CSS-Wert der Form „rgb(r,g,b)". */
function parseCss(css) {
  const treffer = /#([0-9a-f]{6})/i.exec(css);
  if (!treffer) return [128, 128, 128];
  const wert = parseInt(treffer[1], 16);
  return [(wert >> 16) & 255, (wert >> 8) & 255, wert & 255];
}

/**
 * Dunkelt eine Himmelsfarbe in Richtung der Palette ab: Der Entwurf ist nächtlich,
 * auch wenn das Biom einen hellen Tag vorsieht. Die Farbtönung bleibt erhalten.
 */
function naechtlich(farbe, tiefe) {
  const hell = luma(farbe) / 255;
  const menge = 0.5 + 0.38 * hell + 0.08 * tiefe;
  return mix(farbe, BG0, Math.min(0.92, menge));
}

/**
 * Zeichnet den Himmel als Verlauf und setzt den Himmelskörper.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawSky(ctx, breite, hoehe, scenery, zeit) {
  const stufen = scenery.sky.colors;
  const verlauf = ctx.createLinearGradient(0, 0, 0, hoehe);
  stufen.forEach((farbe, i) => {
    verlauf.addColorStop(i / Math.max(1, stufen.length - 1), rgb(naechtlich(parseCss(farbe), i / Math.max(1, stufen.length - 1))));
  });
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, breite, hoehe);

  // Planeten-Biom: Kosmos mit Exoplanet-Szene und Kugeln statt Dunst und Sonne (`planetenKulisse.js`).
  if (scenery.celestial?.kind === 'planet') {
    zeichnePlanetenHimmel(ctx, breite, hoehe, scenery);
    return;
  }

  const dunst = ctx.createLinearGradient(0, hoehe * 0.22, 0, hoehe * 0.62);
  dunst.addColorStop(0, 'rgba(60, 88, 92, 0)');
  dunst.addColorStop(0.7, 'rgba(60, 88, 92, 0.22)');
  dunst.addColorStop(1, 'rgba(60, 88, 92, 0)');
  ctx.fillStyle = dunst;
  ctx.fillRect(0, hoehe * 0.22, breite, hoehe * 0.4);

  const koerper = scenery.celestial;
  if (!koerper) return;

  const x = koerper.x * breite;
  const y = koerper.y * hoehe;
  const r = koerper.size * Math.min(breite, hoehe);

  ctx.save();
  ctx.globalAlpha = 0.6;
  if (koerper.kind === 'stars') {
    // Kein Einzelkörper: die Sterne kommen aus dem Ambiente.
  } else if (koerper.kind === 'dim_sun') {
    const schein = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    schein.addColorStop(0, 'rgba(255, 226, 170, 0.75)');
    schein.addColorStop(1, 'rgba(255, 226, 170, 0)');
    ctx.fillStyle = schein;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 236, 198, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const istMond = koerper.kind === 'moon';
    const kern = istMond ? '#e8eef5' : koerper.kind === 'setting_sun' ? '#ff9a4d' : '#fff6d5';
    const schein = ctx.createRadialGradient(x, y, 0, x, y, r * (istMond ? 3 : 5));
    schein.addColorStop(0, istMond ? 'rgba(220,232,245,0.55)' : 'rgba(255,240,190,0.6)');
    schein.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = schein;
    ctx.beginPath();
    ctx.arc(x, y, r * (istMond ? 3 : 5), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = kern;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Der Sonnenuntergang verliert an Höhe: der untere Teil verschwindet hinter
    // dem Gelände. Das ist nur eine Andeutung, kein echtes Verdecktwerden.
    if (koerper.kind === 'setting_sun') {
      ctx.fillStyle = 'rgba(240, 163, 94, 0.35)';
      ctx.fillRect(0, y + r * 0.6, breite, hoehe - (y + r * 0.6));
    }
  }
  ctx.restore();
  void zeit;
}

const DUNKEL_CACHE = new WeakMap();

/** Ist der Himmel dunkel? Je Kulisse einmal gerechnet (vorher je Element und Bild: parseCss + luma). */
function istDunkel(scenery) {
  let wert = DUNKEL_CACHE.get(scenery);
  if (wert === undefined) {
    wert = true;
    DUNKEL_CACHE.set(scenery, wert);
  }
  return wert;
}

/** Einzelne Ambientesorte zeichnen. */
function zeichneElement(ctx, element, breite, hoehe, scenery, zeit, imVordergrund) {
  const x = element.x * breite;
  const y = element.y * hoehe;
  const skala = element.scale;
  const bewegung = Math.sin((zeit * 0.02 + element.phase) * Math.PI * 2);
  const dunkel = istDunkel(scenery);

  switch (element.kind) {
    case 'stars': {
      const funkeln = 0.45 + 0.55 * Math.abs(Math.sin((zeit * 0.03 + element.phase * 7) * Math.PI));
      ctx.fillStyle = `rgba(217,222,231,${(0.3 + 0.45 * funkeln) * element.scale})`;
      const groesse = Math.max(1, Math.round(skala * 1.8));
      ctx.fillRect(x, y, groesse, groesse);
      break;
    }

    case 'nebula_glow': {
      const r = skala * Math.min(breite, hoehe) * 0.35;
      const farben = ['rgba(120,80,200,0.20)', 'rgba(60,160,190,0.18)', 'rgba(200,90,160,0.16)'];
      const verlauf = ctx.createRadialGradient(x, y, 0, x, y, r);
      verlauf.addColorStop(0, farben[element.seed % farben.length]);
      verlauf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = verlauf;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'aurora_bands': {
      const bandHoehe = hoehe * 0.06 * skala;
      ctx.save();
      ctx.globalAlpha = 0.32;
      for (let i = 0; i < 3; i += 1) {
        const versatz = (i - 1) * bandHoehe * 0.5 + bewegung * 6;
        const verlauf = ctx.createLinearGradient(0, y + versatz - bandHoehe, 0, y + versatz + bandHoehe);
        verlauf.addColorStop(0, 'rgba(90,255,180,0)');
        verlauf.addColorStop(0.5, i === 1 ? 'rgba(120,255,190,0.5)' : 'rgba(140,120,255,0.4)');
        verlauf.addColorStop(1, 'rgba(90,255,180,0)');
        ctx.fillStyle = verlauf;
        ctx.fillRect(0, y + versatz - bandHoehe, breite, bandHoehe * 2);
      }
      ctx.restore();
      break;
    }

    case 'clouds_few':
    case 'clouds_heavy':
    case 'clouds_storm': {
      // Drift verschiebt die Wolke mit der Zeit, aber gebunden an die Breite.
      const drift = ((zeit * 0.0006 * (element.kind === 'clouds_storm' ? 3 : 1)) + element.phase) % 1.2;
      const cx = ((element.x + drift) % 1.2 - 0.1) * breite;
      const rw = breite * 0.11 * skala;
      const rh = hoehe * 0.045 * skala;
      const hell = element.kind === 'clouds_storm' ? 0.3 : dunkel ? 0.2 : 0.75;
      const farbe = dunkel ? [74, 84, 96] : [255, 255, 255];

      ctx.save();
      ctx.globalAlpha = element.kind === 'clouds_storm' ? 0.75 : 0.6;
      ctx.fillStyle = rgb(mix(farbe, farbe, 0), hell);
      // Eine Wolke aus mehreren überlappenden Ellipsen.
      const teile = element.kind === 'clouds_few' ? 3 : 4;
      for (let i = 0; i < teile; i += 1) {
        const ox = (i - (teile - 1) / 2) * rw * 0.55;
        const oy = Math.sin(i * 1.7 + element.phase * 6) * rh * 0.35;
        ctx.beginPath();
        ctx.ellipse(cx + ox, y + oy, rw * (0.7 + 0.18 * Math.cos(i)), rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'haze':
    case 'fog_banks': {
      const rw = breite * 0.6 * skala;
      const rh = hoehe * 0.09 * skala;
      const drift = ((zeit * 0.0004 + element.phase) % 1.3 - 0.15) * breite;
      const verlauf = ctx.createRadialGradient(drift, y, 0, drift, y, rw);
      const ton = element.kind === 'fog_banks' ? '120,146,150' : '96,110,104';
      verlauf.addColorStop(0, `rgba(${ton},${element.kind === 'fog_banks' ? 0.34 : 0.22})`);
      verlauf.addColorStop(1, `rgba(${ton},0)`);
      ctx.fillStyle = verlauf;
      ctx.beginPath();
      ctx.ellipse(drift, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'birds': {
      const drift = ((zeit * 0.004 + element.phase) % 1.3 - 0.15) * breite;
      const groesse = 5 * skala;
      ctx.save();
      ctx.strokeStyle = `rgba(30,34,40,${0.55 * skala})`;
      ctx.lineWidth = Math.max(1, 1.4 * skala);
      ctx.beginPath();
      // Zwei Flügelstriche; der Flügelschlag ändert die Höhe der Enden.
      const hub = bewegung * groesse * 0.35;
      ctx.moveTo(drift - groesse, y + hub);
      ctx.lineTo(drift, y - hub * 0.6);
      ctx.lineTo(drift + groesse, y + hub);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'rain': {
      const fall = ((zeit * 0.06 + element.phase * 40) % 1.2);
      const ry = ((element.y + fall) % 1.2 - 0.1) * hoehe;
      const laenge = 14 * skala;
      ctx.strokeStyle = `rgba(180,200,225,${0.35 * skala})`;
      ctx.lineWidth = Math.max(1, skala);
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x - 2.5 * skala, ry + laenge);
      ctx.stroke();
      break;
    }

    case 'snow': {
      const fall = ((zeit * 0.008 + element.phase * 30) % 1.2);
      const ry = ((element.y + fall) % 1.2 - 0.1) * hoehe;
      const wanken = Math.sin((zeit * 0.02 + element.phase * 5) * Math.PI) * 6;
      ctx.fillStyle = `rgba(250,252,255,${0.8 * skala})`;
      ctx.beginPath();
      ctx.arc(x + wanken, ry, Math.max(1, 1.8 * skala), 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'embers': {
      const steig = ((element.phase - zeit * 0.006) % 1.2 + 1.2) % 1.2;
      const ry = (element.y - steig * 0.35) * hoehe;
      const wanken = Math.sin((zeit * 0.05 + element.phase * 9) * Math.PI) * 4;
      ctx.fillStyle = `rgba(255,${140 + Math.round(80 * element.phase)},60,${0.75 * skala})`;
      ctx.beginPath();
      ctx.arc(x + wanken, ry, Math.max(1, 1.6 * skala), 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'ash':
    case 'debris': {
      const drift = ((element.x + zeit * 0.0009 * (element.kind === 'ash' ? 1 : 2)) % 1.1);
      const fall = ((element.y + zeit * 0.004) % 1.1);
      ctx.fillStyle = element.kind === 'ash'
        ? `rgba(120,112,104,${0.6 * skala})`
        : `rgba(96,88,80,${0.7 * skala})`;
      const groesse = Math.max(1, 2 * skala);
      ctx.fillRect(drift * breite, fall * hoehe, groesse, groesse * 0.7);
      break;
    }

    case 'bubbles': {
      const steig = ((element.phase - zeit * 0.01) % 1.1 + 1.1) % 1.1;
      const ry = (element.y - steig * 0.3) * hoehe;
      ctx.strokeStyle = `rgba(230,255,230,${0.5 * skala})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, ry, Math.max(1, 2.4 * skala), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'fireflies': {
      const an = 0.35 + 0.65 * Math.abs(Math.sin((zeit * 0.025 + element.phase * 11) * Math.PI));
      ctx.fillStyle = `rgba(124,252,0,${an * 0.6 * skala})`;
      ctx.beginPath();
      ctx.arc(x + bewegung * 8, y + bewegung * 4, Math.max(1, 1.7 * skala), 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'spores': {
      const steig = ((element.phase - zeit * 0.004) % 1.1 + 1.1) % 1.1;
      const ry = (element.y - steig * 0.25) * hoehe;
      const wanken = Math.sin((zeit * 0.02 + element.phase * 9) * Math.PI) * 10;
      const an = 0.4 + 0.6 * Math.abs(Math.sin((zeit * 0.015 + element.phase * 7) * Math.PI));
      ctx.fillStyle = `rgba(214,170,255,${an * 0.55 * skala})`;
      ctx.beginPath();
      ctx.arc(x + wanken, ry, Math.max(1, 2.2 * skala), 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'glimmer': {
      const an = Math.abs(Math.sin((zeit * 0.03 + element.phase * 13) * Math.PI));
      ctx.fillStyle = `rgba(190,210,255,${an * 0.8 * skala})`;
      const g = Math.max(1, 2.4 * skala);
      ctx.fillRect(x - g / 2, y - g * 1.5, g, g * 3);
      ctx.fillRect(x - g * 1.5, y - g / 2, g * 3, g);
      break;
    }

    case 'lightning': {
      // Nur kurz sichtbar, in unregelmäßigen Abständen: ein Gewitter, das
      // dauerblitzt, wäre eine Lichtshow.
      const takt = Math.floor(zeit / 90);
      const imTakt = (takt * 7 + element.seed) % 11 === 0;
      if (!imTakt) break;
      const rest = zeit % 90;
      if (rest > 5) break;
      ctx.save();
      ctx.globalAlpha = (1 - rest / 5) * 0.9;
      ctx.strokeStyle = 'rgba(230,240,255,0.95)';
      ctx.lineWidth = 2 + skala;
      ctx.beginPath();
      let lx = x;
      ctx.moveTo(lx, 0);
      // Ein gezackter Blitz in mehreren Segmenten.
      for (let i = 1; i <= 6; i += 1) {
        lx += Math.sin(i * 2.3 + element.seed) * 24 * skala;
        ctx.lineTo(lx, (i / 6) * y);
      }
      ctx.stroke();
      // Der Himmel wird kurz hell.
      ctx.fillStyle = 'rgba(200,220,255,0.06)';
      ctx.fillRect(0, 0, breite, hoehe);
      ctx.restore();
      break;
    }

    default:
      break;
  }
  void imVordergrund;
}

/**
 * Zeichnet die Begleitelemente.
 * @param {boolean} imVordergrund - Regen, Schnee und Funken liegen VOR dem Spielfeld
 */
export function drawAmbient(ctx, breite, hoehe, scenery, zeit, imVordergrund) {
  const hinten = new Set(['stars', 'nebula_glow', 'aurora_bands', 'clouds_few', 'clouds_heavy',
    'clouds_storm', 'haze', 'fog_banks', 'birds', 'lightning', 'glimmer']);
  ctx.save();
  for (const element of scenery.ambient.elemente) {
    const gehoertNachHinten = hinten.has(element.kind);
    if (gehoertNachHinten === imVordergrund) continue;
    zeichneElement(ctx, element, breite, hoehe, scenery, zeit, imVordergrund);
  }
  ctx.restore();
}

/**
 * Zeichnet eine Landmarke als Silhouette.
 *
 * Die Silhouette wird aus der Bodenfarbe des Bioms abgeleitet und abgedunkelt: So
 * wirkt sie wie ein weit entferntes Stück derselben Landschaft. Eine feste
 * schwarze Silhouette hätte auf Schnee oder Sand wie ein Ausschnitt gewirkt.
 */
function zeichneLandmarke(ctx, landmarke, breite, grundlinie, scenery) {
  const boden = scenery.ground.surface;
  const farbe = rgb(mix(boden, BG0, 0.82));
  const fern = rgb(mix(boden, BG0, 0.7));

  const x = landmarke.x * breite;
  const hoehe = scenery.__hoehe * 0.3 * landmarke.scale;
  const breite_ = breite * 0.28 * landmarke.scale;
  const richtung = landmarke.flip ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = 0.92;

  const form = (fuellfarbe, versatz) => {
    ctx.fillStyle = fuellfarbe;
    ctx.beginPath();
    switch (landmarke.kind) {
      case 'mountain_ridge':
      case 'ice_peaks': {
        // Drei Gipfel, der mittlere am höchsten.
        const spitze = richtung > 0 ? 0.5 : 0.42;
        ctx.moveTo(x - breite_ / 2, grundlinie);
        ctx.lineTo(x - breite_ * 0.22, grundlinie - hoehe * 0.55);
        ctx.lineTo(x - breite_ * 0.05, grundlinie - hoehe * 0.4);
        ctx.lineTo(x + breite_ * spitze * 0.1, grundlinie - hoehe);
        ctx.lineTo(x + breite_ * 0.28, grundlinie - hoehe * 0.48);
        ctx.lineTo(x + breite_ * 0.5, grundlinie - hoehe * 0.62);
        ctx.lineTo(x + breite_ / 2, grundlinie);
        break;
      }
      case 'hill_soft':
      case 'dunes': {
        ctx.moveTo(x - breite_ / 2, grundlinie);
        ctx.quadraticCurveTo(x - breite_ * 0.15, grundlinie - hoehe * 0.9, x + breite_ * 0.12, grundlinie - hoehe * 0.35);
        ctx.quadraticCurveTo(x + breite_ * 0.32, grundlinie - hoehe * 0.75, x + breite_ / 2, grundlinie);
        break;
      }
      case 'cliff':
      case 'mesa': {
        ctx.moveTo(x - breite_ / 2, grundlinie);
        ctx.lineTo(x - breite_ * 0.42, grundlinie - hoehe * 0.75);
        ctx.lineTo(x - breite_ * 0.1, grundlinie - hoehe * 0.85);
        ctx.lineTo(x + breite_ * 0.14, grundlinie - hoehe * 0.72);
        ctx.lineTo(x + breite_ * 0.46, grundlinie - hoehe * 0.8);
        ctx.lineTo(x + breite_ / 2, grundlinie);
        break;
      }
      case 'city_skyline':
      case 'ruins': {
        // Gestaffelte Blöcke; bei Ruinen mit Lücken.
        const bloecke = 7;
        const blockBreite = breite_ / bloecke;
        let lauf = x - breite_ / 2;
        for (let i = 0; i < bloecke; i += 1) {
          const h = hoehe * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + landmarke.scale * 3)));
          const luecke = landmarke.kind === 'ruins' && i % 3 === 2;
          if (!luecke) {
            ctx.rect(lauf, grundlinie - h, blockBreite * 0.92, h);
          }
          lauf += blockBreite;
        }
        break;
      }
      case 'forest_line': {
        ctx.moveTo(x - breite_ / 2, grundlinie);
        const baeume = 18;
        for (let i = 0; i < baeume; i += 1) {
          const bx = x - breite_ / 2 + (i / (baeume - 1)) * breite_;
          const bh = hoehe * (0.16 + 0.3 * Math.abs(Math.sin(i * 2.1)));
          ctx.lineTo(bx - breite_ / (baeume * 2.2), grundlinie);
          ctx.lineTo(bx, grundlinie - bh);
          ctx.lineTo(bx + breite_ / (baeume * 2.2), grundlinie);
        }
        ctx.lineTo(x + breite_ / 2, grundlinie);
        break;
      }
      case 'palm_grove':
      case 'cactus_field': {
        const stiele = landmarke.kind === 'palm_grove' ? 5 : 6;
        for (let i = 0; i < stiele; i += 1) {
          const bx = x - breite_ / 2 + ((i + 0.5) / stiele) * breite_;
          const bh = hoehe * (0.5 + 0.5 * Math.abs(Math.cos(i * 1.3)));
          const stamm = breite_ * 0.012;
          ctx.moveTo(bx - stamm, grundlinie);
          ctx.rect(bx - stamm, grundlinie - bh, stamm * 2, bh);
          if (landmarke.kind === 'palm_grove') {
            // Palmwedel als flache Strahlen.
            for (let w = 0; w < 5; w += 1) {
              const winkel = -Math.PI / 2 + (w - 2) * 0.45;
              ctx.moveTo(bx, grundlinie - bh);
              ctx.lineTo(bx + Math.cos(winkel) * bh * 0.4, grundlinie - bh + Math.sin(winkel) * bh * 0.28);
            }
          } else {
            // Kaktusarme.
            ctx.rect(bx - stamm * 3.4, grundlinie - bh * 0.6, stamm * 2.4, stamm * 4);
            ctx.rect(bx + stamm, grundlinie - bh * 0.75, stamm * 2.4, stamm * 4);
          }
        }
        break;
      }
      case 'crystal_spires':
      case 'temple':
      case 'coral_reef': {
        const zacken = landmarke.kind === 'coral_reef' ? 7 : 5;
        for (let i = 0; i < zacken; i += 1) {
          const bx = x - breite_ / 2 + ((i + 0.5) / zacken) * breite_;
          const sh = hoehe * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.9 + 0.7)));
          const sb = breite_ / (zacken * 1.5);
          ctx.moveTo(bx - sb, grundlinie);
          ctx.lineTo(bx - sb * 0.35, grundlinie - sh * 0.75);
          ctx.lineTo(bx, grundlinie - sh);
          ctx.lineTo(bx + sb * 0.35, grundlinie - sh * 0.75);
          ctx.lineTo(bx + sb, grundlinie);
        }
        break;
      }
      case 'volcano': {
        // Kegel mit abgeflachtem Krater und Lavaschein an der Spitze.
        ctx.moveTo(x - breite_ * 0.5, grundlinie);
        ctx.lineTo(x - breite_ * 0.1, grundlinie - hoehe * 0.95);
        ctx.lineTo(x - breite_ * 0.03, grundlinie - hoehe * 0.88);
        ctx.lineTo(x + breite_ * 0.04, grundlinie - hoehe * 0.95);
        ctx.lineTo(x + breite_ * 0.5, grundlinie);
        break;
      }
      case 'floating_isles': {
        // Schwebende Brocken mit spitzer Unterseite, in verschiedener Höhe.
        for (let i = 0; i < 4; i += 1) {
          const bx = x - breite_ / 2 + ((i + 0.5) / 4) * breite_;
          const by = grundlinie - hoehe * (0.45 + 0.4 * Math.abs(Math.sin(i * 2.3 + 0.4)));
          const bb = breite_ * (0.07 + 0.04 * Math.abs(Math.cos(i * 1.7)));
          ctx.moveTo(bx - bb, by);
          ctx.quadraticCurveTo(bx, by - bb * 0.5, bx + bb, by);
          ctx.lineTo(bx + bb * 0.25, by + bb * 1.2);
          ctx.lineTo(bx - bb * 0.2, by + bb * 0.8);
        }
        break;
      }
      case 'mushroom_grove': {
        for (let i = 0; i < 5; i += 1) {
          const bx = x - breite_ / 2 + ((i + 0.5) / 5) * breite_;
          const bh = hoehe * (0.4 + 0.5 * Math.abs(Math.sin(i * 1.6 + 0.3)));
          const stiel = breite_ * 0.014;
          const hut = breite_ * (0.05 + 0.03 * Math.abs(Math.cos(i * 1.1)));
          ctx.rect(bx - stiel, grundlinie - bh, stiel * 2, bh);
          ctx.moveTo(bx - hut, grundlinie - bh + hut * 0.3);
          ctx.quadraticCurveTo(bx, grundlinie - bh - hut * 1.1, bx + hut, grundlinie - bh + hut * 0.3);
          ctx.closePath();
        }
        break;
      }
      case 'scrap_towers': {
        // Kranausleger, Tanks und schiefe Blöcke.
        ctx.rect(x - breite_ * 0.42, grundlinie - hoehe * 0.5, breite_ * 0.12, hoehe * 0.5);
        ctx.rect(x - breite_ * 0.22, grundlinie - hoehe * 0.8, breite_ * 0.05, hoehe * 0.8);
        ctx.rect(x - breite_ * 0.22, grundlinie - hoehe * 0.82, breite_ * 0.38, hoehe * 0.04);
        ctx.rect(x + breite_ * 0.1, grundlinie - hoehe * 0.82, breite_ * 0.015, hoehe * 0.3);
        ctx.rect(x + breite_ * 0.22, grundlinie - hoehe * 0.4, breite_ * 0.2, hoehe * 0.4);
        break;
      }
      case 'glacier_wall': {
        ctx.moveTo(x - breite_ / 2, grundlinie);
        for (let i = 0; i <= 12; i += 1) {
          const t = i / 12;
          ctx.lineTo(x - breite_ / 2 + t * breite_, grundlinie - hoehe * (0.55 + 0.25 * Math.abs(Math.sin(i * 2.7))));
        }
        ctx.lineTo(x + breite_ / 2, grundlinie);
        break;
      }
      case 'kelp_forest': {
        for (let i = 0; i < 9; i += 1) {
          const bx = x - breite_ / 2 + ((i + 0.5) / 9) * breite_;
          const bh = hoehe * (0.4 + 0.5 * Math.abs(Math.sin(i * 1.9)));
          ctx.moveTo(bx - 2, grundlinie);
          ctx.quadraticCurveTo(bx + 14, grundlinie - bh * 0.5, bx - 4, grundlinie - bh);
          ctx.quadraticCurveTo(bx + 20, grundlinie - bh * 0.5, bx + 4, grundlinie);
        }
        break;
      }
      case 'rock_arch': {
        ctx.moveTo(x - breite_ * 0.4, grundlinie);
        ctx.lineTo(x - breite_ * 0.34, grundlinie - hoehe * 0.85);
        ctx.quadraticCurveTo(x, grundlinie - hoehe * 1.15, x + breite_ * 0.34, grundlinie - hoehe * 0.85);
        ctx.lineTo(x + breite_ * 0.4, grundlinie);
        ctx.lineTo(x + breite_ * 0.24, grundlinie);
        ctx.quadraticCurveTo(x, grundlinie - hoehe * 0.8, x - breite_ * 0.24, grundlinie);
        break;
      }
      default:
        break;
    }
    ctx.fill();
    ctx.strokeStyle = rgb(BG0);
    ctx.lineWidth = 1.6 + versatz;
    ctx.stroke();
  };

  // Ein heller Rand an der Sonnenseite trennt die Landmarke vom Himmel.
  form(fern, 1.2);
  ctx.globalAlpha = 0.85;
  form(farbe, 0);
  ctx.restore();
}

/**
 * Zeichnet alle Landmarken.
 * @param {number} grundlinie - y der Horizontlinie in Pixeln
 */
export function drawLandmarks(ctx, breite, hoehe, scenery, grundlinie) {
  // Planeten-Kulisse: der Raum hat keinen Horizont, keine Berge und keine Hügel hinter dem Gelände.
  if (scenery.celestial?.kind === 'planet') return;
  zeichneHorizontLicht(ctx, breite, scenery, grundlinie);
  zeichneFelsmassive(ctx, breite, hoehe, scenery, grundlinie);
  if (scenery.landmarks?.length) {
    // Die Höhe wird für die Zeichenroutinen gebraucht; sie steckt nicht im
    // Kulissenobjekt, weil das netcode-tauglich bleiben soll.
    const mitHoehe = { ...scenery, __hoehe: hoehe };
    for (const landmarke of scenery.landmarks) {
      zeichneLandmarke(ctx, landmarke, breite, grundlinie, mitHoehe);
    }
  }
  zeichneHuegel(ctx, breite, hoehe, scenery, grundlinie);
}

/**
 * Lichtstimmung am Horizont: ein weicher Schein unter dem Himmelskörper (warm bei Sonne, kühl bei Mond oder
 * Gewitter). Liegt hinter allen Silhouetten und wird mit der übrigen Kulisse einmal gebacken.
 */
function zeichneHorizontLicht(ctx, breite, scenery, grundlinie) {
  const himmel = scenery.sky;
  if (!himmel?.colors?.length) return;
  const licht = himmel.light ?? 0.8;
  const kind = scenery.celestial?.kind;
  const kuehl = kind === 'moon' || (!kind && licht < 0.6);
  const farbe = kuehl ? [138, 168, 214] : kind === 'setting_sun' ? [255, 150, 84] : [255, 218, 156];
  const x = (scenery.celestial?.x ?? 0.5) * breite;
  const r = breite * 0.6;
  const schein = ctx.createRadialGradient(x, grundlinie, 0, x, grundlinie, r);
  const st = 0.1 + 0.2 * licht;
  schein.addColorStop(0, rgb(farbe, st));
  schein.addColorStop(0.4, rgb(farbe, st * 0.42));
  schein.addColorStop(1, rgb(farbe, 0));
  ctx.fillStyle = schein;
  ctx.fillRect(0, grundlinie - r * 0.6, breite, r * 0.8);
}

/** Graue Felsmassive mit Kanten und Facetten, aus dem Seed der Kulisse. */
function zeichneFelsmassive(ctx, breite, hoehe, scenery, grundlinie) {
  const zufall = folge((scenery.seed ?? 0) * 13 + 5);
  const anzahl = 3;
  ctx.save();
  ctx.lineJoin = 'round';
  for (let m = 0; m < anzahl; m += 1) {
    const mitte = ((m + 0.5) / anzahl + (zufall() - 0.5) * 0.14) * breite;
    const b = breite * (0.2 + zufall() * 0.12);
    const h = hoehe * (0.17 + zufall() * 0.15);
    const x0 = mitte - b / 2;
    const n = 9;
    const spitze = 3 + Math.floor(zufall() * 3);
    const punkte = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const huelle = Math.pow(Math.sin(Math.PI * t), 0.75);
      const kante = i === spitze ? 1 : 0.55 + 0.4 * zufall();
      punkte.push([x0 + b * t, grundlinie + 6 - h * huelle * kante]);
    }
    ctx.beginPath();
    ctx.moveTo(x0, grundlinie + 6);
    for (const [px, py] of punkte) ctx.lineTo(px, py);
    ctx.lineTo(x0 + b, grundlinie + 6);
    ctx.closePath();
    const fuell = ctx.createLinearGradient(0, grundlinie - h, 0, grundlinie + 6);
    fuell.addColorStop(0, rgb(mix(BG3, BG2, 0.35)));
    fuell.addColorStop(1, rgb(BG1));
    ctx.fillStyle = fuell;
    ctx.fill();
    // Sonnenseite: helle Facette von der Spitze nach links unten.
    const [sx, sy] = punkte[spitze];
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(punkte[Math.max(0, spitze - 1)][0], punkte[Math.max(0, spitze - 1)][1]);
    ctx.lineTo(x0 + b * (spitze / n) * 0.8, grundlinie - h * 0.25);
    ctx.lineTo(sx - 2, grundlinie - h * 0.35);
    ctx.closePath();
    ctx.fillStyle = 'rgba(150, 165, 185, 0.16)';
    ctx.fill();
    // Schattenseite rechts der Spitze.
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(punkte[Math.min(n, spitze + 1)][0], punkte[Math.min(n, spitze + 1)][1]);
    ctx.lineTo(x0 + b, grundlinie + 6);
    ctx.lineTo(sx + 4, grundlinie + 6);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7, 9, 11, 0.32)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0, grundlinie + 6);
    for (const [px, py] of punkte) ctx.lineTo(px, py);
    ctx.lineTo(x0 + b, grundlinie + 6);
    ctx.strokeStyle = rgb(BG0);
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

/** Nadelbaum als Silhouette: gestapelte Zacken, ein Pfad, keine Kontur. */
function zeichneTanne(ctx, x, y, h, b) {
  const stufen = 4;
  ctx.beginPath();
  ctx.moveTo(x - b * 0.07, y);
  ctx.lineTo(x - b * 0.07, y - h * 0.16);
  for (let i = 0; i < stufen; i += 1) {
    const unten = y - h * (0.12 + 0.8 * (i / stufen));
    const breite = b * (0.5 - 0.1 * i);
    ctx.lineTo(x - breite, unten);
    ctx.lineTo(x - breite * 0.3, unten - h * 0.03);
  }
  ctx.lineTo(x, y - h);
  for (let i = stufen - 1; i >= 0; i -= 1) {
    const unten = y - h * (0.12 + 0.8 * (i / stufen));
    const breite = b * (0.5 - 0.1 * i);
    ctx.lineTo(x + breite * 0.3, unten - h * 0.03);
    ctx.lineTo(x + breite, unten);
  }
  ctx.lineTo(x + b * 0.07, y - h * 0.16);
  ctx.lineTo(x + b * 0.07, y);
  ctx.closePath();
  ctx.fill();
}

/** Eckiger Felsklotz als ferne Silhouette (wie die grauen Felswände des Zielbilds). */
function zeichneFelswand(ctx, x, y, b, h, zufall, farbe, kante) {
  const n = 7;
  const spitze = 2 + Math.floor(zufall() * 3);
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const huelle = Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.6);
    const hoch = i === spitze ? 1 : 0.5 + 0.38 * zufall();
    pts.push([x + b * t, y - h * huelle * hoch]);
  }
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (const [px, py] of pts) ctx.lineTo(px, py);
  ctx.lineTo(x + b, y);
  ctx.closePath();
  ctx.fillStyle = farbe;
  ctx.fill();
  // Lichtseite links der Spitze als eine helle Facette.
  const [sx, sy] = pts[spitze];
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(pts[spitze - 1][0], pts[spitze - 1][1]);
  ctx.lineTo(x + b * (spitze / n) * 0.9, y - h * 0.15);
  ctx.lineTo(sx - 3, y - h * 0.3);
  ctx.closePath();
  ctx.fillStyle = kante;
  ctx.fill();
}

/**
 * Ferne Hügelketten in drei Tiefenstufen mit Baumsilhouetten, Felswänden und
 * Dunst dazwischen. Bei flachen Karten füllen sie den Raum zwischen Horizont und
 * Gelände: je ferner, desto heller und blauer (Luftperspektive), je näher, desto
 * dunkler. Alles statisch — gezeichnet wird einmal in die gecachte Kulissenebene.
 */
/** Kammbewuchs der fernen Hügel je Biom: Bäume gibt es nicht überall (Abnahme 2026-10-20: Palmen im Asteroidenfeld). */
const KAMM_ZACKEN = new Set(['kosmos', 'cosmos', 'surreal', 'abstract', 'caverns']);
const KAMM_MASTEN = new Set(['fabrik', 'urban', 'noir', 'hyperreal']);
const KAMM_TANNEN = new Set(['alpine', 'burg', 'fantasy']);
export function kammArt(biomeId) {
  if (KAMM_ZACKEN.has(biomeId)) return 'zacken';
  if (KAMM_MASTEN.has(biomeId)) return 'masten';
  if (KAMM_TANNEN.has(biomeId)) return 'tannen';
  return 'baeume';
}

function zeichneHuegel(ctx, breite, hoehe, scenery, grundlinie) {
  const kamm = kammArt(scenery.biomeId);
  const seed = scenery.seed ?? 0;
  const stufen = scenery.sky?.colors ?? [];
  const dunst = stufen.length ? mix(parseCss(stufen[stufen.length - 1]), [92, 112, 120], 0.45) : [80, 104, 112];
  const boden = scenery.ground.surface;
  const gruen = [30, 72, 30];
  const f0 = mix(dunst, BG0, 0.42);
  const f1 = mix(mix(boden, dunst, 0.4), BG0, 0.66);
  const f2 = mix(mix(boden, dunst, 0.15), BG0, 0.76);
  const f_1 = mix(dunst, BG0, 0.3);
  const lichtFarbe = mix(dunst, [255, 244, 220], 0.45);
  const ebenen = [
    // Fernste Kette: hell und dunstig, kleine Wälder, kaum Kontrast zum Himmel (Luftperspektive).
    { versatz: -hoehe * 0.04, amp: 0.1, farbe: f_1, baum: mix(f_1, BG0, 0.22), rausch: seed + 41, baumH: [9, 8], dicht: 30, felsen: 0 },
    { versatz: -4, amp: 0.075, farbe: f0, baum: mix(mix(f0, BG0, 0.5), gruen, 0.1), rausch: seed + 3, baumH: [24, 22], dicht: 52, felsen: 2 },
    { versatz: hoehe * 0.1, amp: 0.085, farbe: f1, baum: mix(mix(f1, BG0, 0.55), gruen, 0.14), rausch: seed + 17, baumH: [40, 30], dicht: 76, felsen: 1 },
    { versatz: hoehe * 0.2, amp: 0.07, farbe: f2, baum: mix(mix(f2, BG0, 0.6), gruen, 0.12), rausch: seed + 29, baumH: [62, 40], dicht: 110, felsen: 1 },
  ];
  ctx.save();
  ctx.lineJoin = 'round';
  ebenen.forEach((ebene, e) => {
    const basis = grundlinie + ebene.versatz;
    const profil = x => basis - hoehe * ebene.amp * (0.25 + 0.75 * rauschen1(x / (breite * (0.13 - e * 0.012)), ebene.rausch));
    const zufall = folge(seed * 7 + e * 101 + 1);

    // Felswände hinter der Kette (nur in den ferneren Ebenen).
    for (let f = 0; f < ebene.felsen; f += 1) {
      const fx = breite * (0.1 + 0.8 * zufall());
      const fb = breite * (0.1 + 0.1 * zufall());
      zeichneFelswand(ctx, fx - fb / 2, profil(fx) + 10, fb, hoehe * (0.11 + 0.09 * zufall()), zufall,
        rgb(mix(ebene.farbe, dunst, 0.12)), rgb(mix(ebene.farbe, dunst, 0.34), 0.5));
    }

    // Hügelkörper: oben die Ebenenfarbe, nach unten in die nächste Tiefe übergehend (nie flach schwarz).
    ctx.beginPath();
    ctx.moveTo(0, hoehe);
    for (let x = 0; x <= breite; x += 16) ctx.lineTo(x, profil(x));
    ctx.lineTo(breite, hoehe);
    ctx.closePath();
    const naechste = ebenen[e + 1] ? ebenen[e + 1].farbe : mix(boden, BG0, 0.9);
    const verlauf = ctx.createLinearGradient(0, basis - hoehe * ebene.amp, 0, basis + hoehe * 0.2);
    verlauf.addColorStop(0, rgb(ebene.farbe));
    verlauf.addColorStop(1, rgb(mix(ebene.farbe, naechste, 0.55)));
    ctx.fillStyle = verlauf;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= breite; x += 16) {
      if (x === 0) ctx.moveTo(x, profil(x)); else ctx.lineTo(x, profil(x));
    }
    ctx.strokeStyle = rgb(mix(ebene.farbe, dunst, 0.3));
    ctx.lineWidth = 3;
    ctx.stroke();
    // Kammlicht: ein heller Saum knapp über dem Kamm, nach vorn kräftiger (die ferne Kette liegt im Dunst).
    ctx.beginPath();
    for (let x = 0; x <= breite; x += 16) {
      if (x === 0) ctx.moveTo(x, profil(x) - 2); else ctx.lineTo(x, profil(x) - 2);
    }
    ctx.strokeStyle = rgb(lichtFarbe, 0.1 + 0.07 * e);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bäume auf dem Kamm: Tannen und Palmen gemischt, nahe Ebenen größer.
    const farbe = rgb(ebene.baum);
    ctx.fillStyle = farbe;
    let x = 10 + zufall() * ebene.dicht;
    while (x < breite - 6) {
      const h = ebene.baumH[0] + zufall() * ebene.baumH[1];
      const art = zufall();
      if (kamm === 'zacken') {
        // Kosmos, Surreal, Kristallhöhle: Kristall- und Felsspitzen statt Bäumen.
        ctx.beginPath();
        ctx.moveTo(x - h * 0.12, profil(x) + 3);
        ctx.lineTo(x + (art - 0.5) * h * 0.2, profil(x) - h * 0.9);
        ctx.lineTo(x + h * 0.12, profil(x) + 3);
        ctx.closePath();
        ctx.fill();
      } else if (kamm === 'masten') {
        // Fabrik, Stadt: Schornsteine und Masten.
        const b = 3 + art * 4;
        ctx.fillRect(x - b / 2, profil(x) - h * (0.7 + art * 0.6), b, h * (0.7 + art * 0.6) + 4);
      } else if (art < 0.5 || kamm === 'tannen') zeichneTanne(ctx, x, profil(x) + 3, h * 1.25, h * 0.55);
      else if (art < 0.8) {
        zeichnePflanze(ctx, { art: 'palme', x, y: profil(x) + 3, h, spiegel: zufall() < 0.5, seed: Math.floor(zufall() * 999) },
          { blatt: farbe, dunkel: farbe, hell: farbe, stamm: farbe, kontur: null });
      } else {
        zeichnePflanze(ctx, { art: 'busch', x, y: profil(x) + 4, h: h * 0.4, spiegel: false, seed: Math.floor(zufall() * 999) },
          { blatt: farbe, dunkel: farbe, hell: farbe, stamm: farbe, kontur: null });
      }
      x += ebene.dicht * (0.45 + zufall() * 0.9);
    }

    // Dunst unterhalb des Kamms dieser Ebene: trennt sie von der nächsten, nimmt die Tiefe zu.
    const nebel = ctx.createLinearGradient(0, basis - hoehe * 0.05, 0, basis + hoehe * 0.13);
    nebel.addColorStop(0, rgb(dunst, 0));
    nebel.addColorStop(0.5, rgb(dunst, 0.34 - e * 0.07));
    nebel.addColorStop(1, rgb(dunst, 0));
    ctx.fillStyle = nebel;
    ctx.fillRect(0, basis - hoehe * 0.05, breite, hoehe * 0.18);
  });
  // Bodennebel ganz unten: die Kulisse läuft weich in die Geländekante aus.
  const bodennebel = ctx.createLinearGradient(0, grundlinie + hoehe * 0.2, 0, hoehe);
  bodennebel.addColorStop(0, rgb(dunst, 0));
  bodennebel.addColorStop(0.6, rgb(dunst, 0.14));
  bodennebel.addColorStop(1, rgb(dunst, 0.06));
  ctx.fillStyle = bodennebel;
  ctx.fillRect(0, grundlinie + hoehe * 0.2, breite, hoehe);
  ctx.restore();
}

/**
 * Wasserarten: färbt die Wasserfläche ein.
 *
 * Der Renderer liefert die Wasserstände als Graustufen-alpha; hier kommt nur die
 * Farbe dazu. Deshalb getrennt: Die Simulation kennt keine Farben.
 */
export function waterColors(water) {
  if (!water) return { body: [42, 122, 176], shallow: [42, 122, 176], alpha: 1 };
  return water;
}

/**
 * Zeichnet die Oberfläche einer Wasserart (Wellen, Kruste, Blasen, Sterne).
 * Wird NACH der Wasserfläche gezeichnet, damit die Struktur sichtbar bleibt.
 *
 * Die Struktur ist an den tatsächlichen Wasserspiegel geheftet (`oberflaeche.oben` = erste Wasserzelle je
 * Spalte, -1 = kein Wasser; `skala` = Weltpixel je Zelle) und läuft deshalb nie über Land. Ohne diese Angabe
 * (Tests, Vorschau) steht ein gerader Spiegel bei zwei Dritteln der Höhe.
 *
 * @param {{oben:Int16Array, skala:number}|null} [oberflaeche]
 */
export function drawWaterSurface(ctx, breite, hoehe, scenery, zeit, oberflaeche = null) {
  const art = scenery.water;
  if (!art) return;
  const skala = oberflaeche?.skala ?? 4;
  let oben = oberflaeche?.oben;
  if (!oben) {
    oben = new Int16Array(Math.ceil(breite / skala)).fill(Math.round(hoehe * 0.66 / skala));
  }
  const n = oben.length;
  const seed = scenery.seed ?? 0;

  /** Zeichnet einen Linienzug entlang des Spiegels; `tiefer` verschiebt ihn nach unten, `welle` ist die Auslenkung. */
  const spiegelLinie = (tiefer, phase, amp, freq, schritt = 2) => {
    ctx.beginPath();
    let offen = false;
    for (let x = 0; x < n; x += schritt) {
      const y0 = oben[x];
      if (y0 < 0) { offen = false; continue; }
      const px = x * skala;
      const py = y0 * skala + tiefer + Math.sin(x * freq + phase) * amp;
      if (offen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); offen = true; }
    }
    ctx.stroke();
  };

  ctx.save();
  switch (art.surface) {
    case 'waves': {
      // Kammlinien parallel zum Spiegel, dazu helle Schaumkappen auf einzelnen Wellen.
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(232,246,255,0.5)';
      ctx.lineWidth = 2;
      spiegelLinie(1, zeit * 0.05, 2.2, 0.36);
      ctx.strokeStyle = 'rgba(200,228,248,0.22)';
      ctx.lineWidth = 1.5;
      spiegelLinie(14, zeit * 0.035 + 2, 2.6, 0.27);
      spiegelLinie(30, zeit * 0.025 + 4, 3, 0.19, 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let x = 2; x < n - 3; x += 3) {
        if (oben[x] < 0 || oben[x + 2] < 0 || hash2(x, 3, seed) < 0.78) continue;
        const px = x * skala;
        const py = oben[x] * skala + Math.sin(x * 0.36 + zeit * 0.05) * 2.2 - 1;
        ctx.moveTo(px, py);
        ctx.lineTo(px + 11, py + 0.8);
      }
      ctx.stroke();
      break;
    }
    case 'crust': {
      // Abgekühlte Kruste auf Lava: dunkle Platten auf dem Spiegel mit glühender Kante.
      ctx.strokeStyle = 'rgba(255,170,60,0.55)';
      ctx.lineWidth = 3;
      spiegelLinie(1, zeit * 0.03, 1.5, 0.3);
      ctx.strokeStyle = 'rgba(255,110,30,0.3)';
      ctx.lineWidth = 2;
      spiegelLinie(12, zeit * 0.02 + 1, 3, 0.2, 3);
      for (let x = 0; x < n - 4; x += 5) {
        if (oben[x] < 0 || hash2(x, 7, seed) < 0.45) continue;
        const r = 9 + hash2(x, 8, seed) * 18;
        const px = x * skala + Math.sin(zeit * 0.01 + x) * 3;
        const py = oben[x] * skala + 5 + hash2(x, 9, seed) * 18;
        ctx.fillStyle = 'rgba(38,26,22,0.78)';
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.38, (hash2(x, 10, seed) - 0.5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,150,40,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }
    case 'bubbles':
    case 'grain': {
      const istTreibsand = art.surface === 'grain';
      ctx.fillStyle = istTreibsand ? 'rgba(120,96,58,0.45)' : 'rgba(180,230,150,0.4)';
      ctx.strokeStyle = istTreibsand ? 'rgba(236,214,160,0.4)' : 'rgba(214,246,180,0.35)';
      ctx.lineWidth = 1.2;
      spiegelLinie(1, zeit * 0.02, 1.2, 0.25, 3);
      for (let x = 0; x < n; x += 2) {
        if (oben[x] < 0 || hash2(x, 11, seed) < 0.72) continue;
        // Blasen steigen vom Grund zum Spiegel und platzen dort; Treibsand-Körner zittern nur.
        const lauf = istTreibsand ? 0.3 : ((zeit * 0.012 + hash2(x, 12, seed)) % 1);
        const py = oben[x] * skala + 4 + (1 - lauf) * 40;
        const r = istTreibsand ? 1.6 : 1.4 + hash2(x, 13, seed) * 2.2;
        ctx.beginPath();
        ctx.arc(x * skala + Math.sin(zeit * 0.04 + x) * 2, py, r, 0, Math.PI * 2);
        if (istTreibsand) ctx.fill(); else ctx.stroke();
      }
      break;
    }
    case 'stars': {
      for (let x = 0; x < n; x += 2) {
        if (oben[x] < 0 || hash2(x, 14, seed) < 0.55) continue;
        const funkeln = 0.3 + 0.7 * Math.abs(Math.sin(zeit * 0.02 + x * 1.3));
        ctx.fillStyle = `rgba(210,190,255,${funkeln * 0.7})`;
        ctx.fillRect(x * skala, oben[x] * skala + 3 + hash2(x, 15, seed) * 60, 1.8, 1.8);
      }
      ctx.strokeStyle = 'rgba(196,170,255,0.4)';
      ctx.lineWidth = 1.5;
      spiegelLinie(1, zeit * 0.02, 1.4, 0.3, 3);
      break;
    }
    case 'ripples': {
      // Ringe, die sich am Spiegel ausbreiten und verblassen.
      ctx.strokeStyle = 'rgba(240,255,250,0.35)';
      ctx.lineWidth = 1.2;
      spiegelLinie(1, zeit * 0.03, 1, 0.3, 3);
      for (let x = 1; x < n; x += 4) {
        if (oben[x] < 0 || hash2(x, 16, seed) < 0.6) continue;
        /*
         * `% 1` allein ist kein Zyklus für negative Zahlen: Bei negativer Zeit
         * (FUND 2026-10-23, nach einem Zeitsprung von rund -670 ms) wurde
         * `alter` negativ, `rw` damit negativ, und die Canvas-API warf
         * `IndexSizeError` — das Wasser blieb an dieser Stelle ungezeichnet.
         * Der doppelte Rest (%) bildet auch negative Werte auf 0–1 ab.
         */
        const alter = (((zeit * 0.01 + hash2(x, 17, seed)) % 1) + 1) % 1;
        const rw = 4 + alter * 20;
        ctx.globalAlpha = 1 - alter;
        ctx.beginPath();
        ctx.ellipse(x * skala, oben[x] * skala + 3 + hash2(x, 18, seed) * 6, rw, rw * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
