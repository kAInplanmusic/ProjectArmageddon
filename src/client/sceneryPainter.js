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
 * Zeichnet den Himmel als Verlauf und setzt den Himmelskörper.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawSky(ctx, breite, hoehe, scenery, zeit) {
  const stufen = scenery.sky.colors;
  const verlauf = ctx.createLinearGradient(0, 0, 0, hoehe);
  stufen.forEach((farbe, i) => {
    verlauf.addColorStop(i / Math.max(1, stufen.length - 1), farbe);
  });
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, breite, hoehe);

  const koerper = scenery.celestial;
  if (!koerper) return;

  const x = koerper.x * breite;
  const y = koerper.y * hoehe;
  const r = koerper.size * Math.min(breite, hoehe);

  ctx.save();
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

/** Einzelne Ambientesorte zeichnen. */
function zeichneElement(ctx, element, breite, hoehe, scenery, zeit, imVordergrund) {
  const x = element.x * breite;
  const y = element.y * hoehe;
  const skala = element.scale;
  const bewegung = Math.sin((zeit * 0.02 + element.phase) * Math.PI * 2);
  const dunkel = luma(parseCss(scenery.sky.colors[0])) < 100;

  switch (element.kind) {
    case 'stars': {
      const funkeln = 0.45 + 0.55 * Math.abs(Math.sin((zeit * 0.03 + element.phase * 7) * Math.PI));
      ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.5 * funkeln) * element.scale})`;
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
      const hell = element.kind === 'clouds_storm' ? 0.32 : dunkel ? 0.28 : 0.75;
      const farbe = dunkel ? [120, 128, 140] : [255, 255, 255];

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
      const ton = element.kind === 'fog_banks' ? '210,216,222' : '190,180,150';
      verlauf.addColorStop(0, `rgba(${ton},${element.kind === 'fog_banks' ? 0.4 : 0.28})`);
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
      ctx.fillStyle = `rgba(190,255,140,${an * 0.85 * skala})`;
      ctx.beginPath();
      ctx.arc(x + bewegung * 8, y + bewegung * 4, Math.max(1, 1.7 * skala), 0, Math.PI * 2);
      ctx.fill();
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
      ctx.fillStyle = 'rgba(200,220,255,0.16)';
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
    'clouds_storm', 'haze', 'fog_banks', 'birds', 'lightning']);
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
  const farbe = rgb(mix(boden, [22, 24, 30], 0.55));
  const fern = rgb(mix(boden, [22, 24, 30], 0.35));

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
        const baeume = 9;
        for (let i = 0; i < baeume; i += 1) {
          const bx = x - breite_ / 2 + (i / (baeume - 1)) * breite_;
          const bh = hoehe * (0.4 + 0.6 * Math.abs(Math.sin(i * 2.1)));
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
    ctx.strokeStyle = fuellfarbe;
    ctx.lineWidth = versatz;
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
  if (!scenery.landmarks?.length) return;
  // Die Höhe wird für die Zeichenroutinen gebraucht; sie steckt nicht im
  // Kulissenobjekt, weil das netcode-tauglich bleiben soll.
  const mitHoehe = { ...scenery, __hoehe: hoehe };
  for (const landmarke of scenery.landmarks) {
    zeichneLandmarke(ctx, landmarke, breite, grundlinie, mitHoehe);
  }
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
 */
export function drawWaterSurface(ctx, breite, hoehe, scenery, zeit) {
  const art = scenery.water;
  if (!art) return;

  ctx.save();
  switch (art.surface) {
    case 'waves': {
      ctx.strokeStyle = `rgba(220,240,255,0.28)`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i += 1) {
        const y = hoehe * (0.62 + i * 0.055);
        const versatz = Math.sin(zeit * 0.02 + i) * 8;
        ctx.beginPath();
        for (let x = 0; x <= breite; x += 24) {
          const welle = Math.sin((x + versatz + i * 40) * 0.02) * 3.5;
          if (x === 0) ctx.moveTo(x, y + welle);
          else ctx.lineTo(x, y + welle);
        }
        ctx.stroke();
      }
      break;
    }
    case 'crust': {
      // Abgekühlte Kruste auf Lava: dunkle Platten mit glühenden Rissen.
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 26; i += 1) {
        const x = ((i * 137) % breite);
        const y = hoehe * (0.68 + ((i * 53) % 30) / 100);
        const r = 12 + ((i * 17) % 22);
        ctx.fillStyle = 'rgba(38,26,22,0.75)';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.42, (i % 5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,150,40,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i += 1) {
        const y = hoehe * (0.7 + i * 0.032);
        ctx.beginPath();
        for (let x = 0; x <= breite; x += 30) {
          const riss = Math.sin((x + i * 60) * 0.03) * 4;
          if (x === 0) ctx.moveTo(x, y + riss);
          else ctx.lineTo(x, y + riss);
        }
        ctx.stroke();
      }
      break;
    }
    case 'bubbles':
    case 'grain': {
      const istTreibsand = art.surface === 'grain';
      ctx.fillStyle = istTreibsand ? 'rgba(120,96,58,0.35)' : 'rgba(180,230,150,0.3)';
      for (let i = 0; i < 120; i += 1) {
        const x = (i * 211) % breite;
        const y = hoehe * (0.66 + ((i * 71) % 32) / 100);
        const r = istTreibsand ? 1.6 : 2.2 + Math.abs(Math.sin(zeit * 0.03 + i)) * 1.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stars': {
      for (let i = 0; i < 90; i += 1) {
        const x = (i * 173) % breite;
        const y = hoehe * (0.66 + ((i * 43) % 32) / 100);
        const funkeln = 0.3 + 0.7 * Math.abs(Math.sin(zeit * 0.02 + i * 1.3));
        ctx.fillStyle = `rgba(210,190,255,${funkeln * 0.7})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      break;
    }
    case 'ripples': {
      ctx.strokeStyle = 'rgba(240,255,250,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i += 1) {
        const x = (i * 97) % breite;
        const y = hoehe * (0.66 + ((i * 61) % 30) / 100);
        const rw = 8 + ((i * 13) % 16);
        ctx.beginPath();
        ctx.ellipse(x, y, rw, rw * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
