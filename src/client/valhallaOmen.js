/**
 * Das Vorzeichen von Valhalla: Zwei Raben erscheinen in Blitzen am Himmel und schauen
 * auf das Schlachtfeld.
 *
 * Entscheidung des Auftraggebers (2026-10-13): Zufällig zwischen 60 und 1 Sekunde vor
 * dem Beginn des Mahlstroms. Der Zeitpunkt kommt vom Motor (Ereignis `valhalla_omen`,
 * aus dem Match-Seed gezogen); dieses Modul ist NUR die Darstellung.
 *
 * Aufteilung:
 *   - `omenZustand(alter, bildSeed, optionen)` — reine Funktion: aus der Zeit seit dem
 *     Ereignis wird beschrieben, was zu sehen ist (Blitze, Raben, Helligkeit). Kein
 *     Zeichnen, kein DOM, deshalb mit Unit-Tests prüfbar.
 *   - `zeichneOmen(ctx, breite, hoehe, zustand)` — malt diesen Zustand auf die Fläche.
 *
 * Zugänglichkeit: Bei `reducedMotion` gibt es KEIN Blitzlicht und kein Flackern (Blitze
 * sind das, was Menschen mit Anfallsleiden gefährdet). Die Raben erscheinen dann ruhig
 * per Einblenden, die Information "Valhalla naht" bleibt erhalten.
 *
 * @module valhallaOmen
 */

/** Gesamtdauer in Sekunden (Blitze, Verweilen, Ausblenden). */
export const OMEN_DAUER = 7;

/** Blitzfolge: Beginn und Länge in Sekunden, Stärke 0..1. Die Raben zeigen sich ab dem zweiten. */
const BLITZE = Object.freeze([
  Object.freeze({ t: 0.0, dauer: 0.1, staerke: 0.55 }),
  Object.freeze({ t: 0.55, dauer: 0.16, staerke: 0.8 }),
  Object.freeze({ t: 1.25, dauer: 0.12, staerke: 0.65 }),
  Object.freeze({ t: 2.4, dauer: 0.18, staerke: 1.0 }),
  Object.freeze({ t: 4.1, dauer: 0.1, staerke: 0.5 }),
]);

/** Nachleuchten eines Blitzes in Sekunden. */
const NACHLEUCHTEN = 0.22;

/** Kleiner, fester Zufallsgenerator (mulberry32): gleicher Bildseed = gleiche Blitze. */
function zufall(seed) {
  let z = seed >>> 0;
  return () => {
    z = (z + 0x6D2B79F5) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const begrenze = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sanft = x => { const t = begrenze(x, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Zackiger Blitzpfad in Bruchteilen der Fläche (0..1), von oben nach unten.
 * @returns {Array<[number, number]>}
 */
function blitzPfad(seed, index) {
  const r = zufall((seed ^ (index * 0x9E3779B1)) >>> 0);
  let x = 0.12 + r() * 0.76;
  const endeY = 0.32 + r() * 0.28;
  const schritte = 9;
  const pfad = [[x, 0]];
  for (let i = 1; i <= schritte; i += 1) {
    x = begrenze(x + (r() - 0.5) * 0.09, 0.03, 0.97);
    pfad.push([x, (endeY * i) / schritte]);
  }
  return pfad;
}

/**
 * Beschreibt, was `alter` Sekunden nach dem Ereignis zu sehen ist.
 *
 * @param {number} alter - Sekunden seit `valhalla_omen`
 * @param {number} bildSeed - aus dem Ereignis
 * @param {{reducedMotion?: boolean}} [optionen]
 * @returns {null | {
 *   blitzlicht: number,
 *   blitze: Array<{staerke:number, pfad:Array<[number,number]>}>,
 *   raben: {alpha:number, augen:number, flattern:number, kopf:number},
 * }} null, wenn nichts (mehr) zu sehen ist
 */
export function omenZustand(alter, bildSeed, { reducedMotion = false } = {}) {
  if (!Number.isFinite(alter) || alter < 0 || alter > OMEN_DAUER) return null;

  // Ein- und Ausblenden der Raben: ab 5,4 s weicht alles in 1,6 s.
  const ausblenden = 1 - sanft((alter - 5.4) / 1.6);

  if (reducedMotion) {
    const ein = sanft(alter / 1.2);
    return {
      blitzlicht: 0,
      blitze: [],
      raben: { alpha: 0.92 * ein * ausblenden, augen: 0.7, flattern: 0, kopf: 0 },
    };
  }

  // Wie hell ist es gerade? Jeder Blitz: harter Anstieg, kurzes Halten, Nachleuchten.
  let blitzlicht = 0;
  const sichtbareBlitze = [];
  BLITZE.forEach((b, index) => {
    const seit = alter - b.t;
    if (seit < 0 || seit > b.dauer + NACHLEUCHTEN) return;
    const staerke = seit <= b.dauer
      ? b.staerke
      : b.staerke * (1 - (seit - b.dauer) / NACHLEUCHTEN) ** 2;
    blitzlicht = Math.max(blitzlicht, staerke);
    if (seit <= b.dauer + NACHLEUCHTEN * 0.6) {
      sichtbareBlitze.push({ staerke, pfad: blitzPfad(bildSeed, index) });
    }
  });

  // Die Raben zeigen sich IN den Blitzen: im Blitz voll, dazwischen nur eine Ahnung,
  // ab dem dritten Blitz bleiben sie stehen.
  let alpha;
  if (alter < BLITZE[1].t) alpha = 0;
  else if (alter < BLITZE[2].t) alpha = Math.max(0.22 * sanft((alter - BLITZE[1].t) / 0.1), blitzlicht);
  else if (alter < BLITZE[3].t) alpha = Math.max(0.5, blitzlicht);
  else alpha = Math.max(0.92, blitzlicht);
  alpha = begrenze(alpha, 0, 1) * ausblenden;

  // Augen glimmen auf, sobald sie "erwacht" sind; Kopf dreht sich langsam zum Schlachtfeld.
  const augen = begrenze((alter - BLITZE[2].t) / 0.8, 0, 1) * (0.75 + 0.25 * Math.sin(alter * 6));
  const flattern = alter < BLITZE[2].t + 0.5 ? 1 - sanft((alter - BLITZE[1].t) / 1.2) : 0;
  const kopf = Math.sin(alter * 1.6) * 0.07;

  return { blitzlicht, blitze: sichtbareBlitze, raben: { alpha, augen, flattern, kopf } };
}

/**
 * Ein Rabe, von der Seite, schaut nach rechts-unten. Für den linken Raben wird gespiegelt.
 * Koordinaten in Rabenlängen (Körper ~2 lang), Ursprung im Brustbein.
 */
function zeichneRabe(ctx, { x, y, groesse, spiegeln, alpha, augen, flattern, kopf, lichtkante }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(spiegeln ? -groesse : groesse, groesse);
  ctx.globalAlpha = alpha;

  const koerper = '#0a0912';
  ctx.fillStyle = koerper;
  ctx.strokeStyle = `rgba(150, 110, 255, ${0.15 + 0.7 * lichtkante})`;
  ctx.lineWidth = 0.035;
  ctx.lineJoin = 'round';

  // Schwanz
  ctx.beginPath();
  ctx.moveTo(-0.9, 0.05);
  ctx.lineTo(-2.15, 0.62);
  ctx.lineTo(-1.95, 0.82);
  ctx.lineTo(-0.7, 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Flügel (angelegt; beim Erscheinen kurz abgespreizt)
  const heben = 0.55 * flattern;
  ctx.beginPath();
  ctx.moveTo(0.35, -0.3);
  ctx.bezierCurveTo(-0.3, -0.75 - heben, -1.3, -0.5 - heben * 1.3, -1.95, 0.25 - heben * 0.4);
  ctx.bezierCurveTo(-1.2, 0.2, -0.5, 0.35, 0.3, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Körper
  ctx.beginPath();
  ctx.ellipse(-0.1, 0.05, 1.05, 0.52, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Kopf: dreht sich leicht und schaut nach unten auf das Feld
  ctx.save();
  ctx.translate(0.95, -0.28);
  ctx.rotate(0.55 + kopf);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.36, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Schnabel
  ctx.beginPath();
  ctx.moveTo(0.22, -0.12);
  ctx.lineTo(0.92, 0.1);
  ctx.lineTo(0.2, 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Auge
  if (augen > 0.02) {
    ctx.shadowColor = 'rgba(0, 224, 255, 0.95)';
    ctx.shadowBlur = 0.35 * groesse;
    ctx.fillStyle = `rgba(170, 245, 255, ${begrenze(augen, 0, 1)})`;
    ctx.beginPath();
    ctx.ellipse(0.1, -0.06, 0.07, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

/**
 * Malt den Zustand aus `omenZustand` auf die Zeichenfläche (Bildschirmkoordinaten).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} breite
 * @param {number} hoehe
 * @param {ReturnType<typeof omenZustand>} zustand
 */
export function zeichneOmen(ctx, breite, hoehe, zustand) {
  if (!zustand) return;

  ctx.save();

  // Blitzlicht über dem ganzen Bild: kalt-bläulich, oben stärker als unten.
  if (zustand.blitzlicht > 0.01) {
    const verlauf = ctx.createLinearGradient(0, 0, 0, hoehe);
    verlauf.addColorStop(0, `rgba(210, 195, 255, ${0.55 * zustand.blitzlicht})`);
    verlauf.addColorStop(1, `rgba(136, 77, 255, ${0.18 * zustand.blitzlicht})`);
    ctx.fillStyle = verlauf;
    ctx.fillRect(0, 0, breite, hoehe);
  }

  // Blitzbahnen mit Leuchten.
  for (const blitz of zustand.blitze) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [breiteLinie, farbe, alphaFaktor] of [
      [7, 'rgba(136, 77, 255, 1)', 0.28],
      [3, 'rgba(0, 224, 255, 1)', 0.7],
      [1.4, 'rgba(255, 255, 255, 1)', 1],
    ]) {
      ctx.strokeStyle = farbe;
      ctx.globalAlpha = begrenze(blitz.staerke * alphaFaktor, 0, 1);
      ctx.lineWidth = breiteLinie;
      ctx.beginPath();
      blitz.pfad.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px * breite, py * hoehe);
        else ctx.lineTo(px * breite, py * hoehe);
      });
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Die beiden Raben: links und rechts oben, einander und dem Feld zugewandt.
  const r = zustand.raben;
  if (r.alpha > 0.01) {
    const groesse = Math.min(breite, hoehe) * 0.055;
    const kante = begrenze(zustand.blitzlicht, 0, 1);
    zeichneRabe(ctx, {
      x: breite * 0.37, y: hoehe * 0.15, groesse, spiegeln: false, alpha: r.alpha,
      augen: r.augen, flattern: r.flattern, kopf: r.kopf, lichtkante: kante,
    });
    zeichneRabe(ctx, {
      x: breite * 0.63, y: hoehe * 0.13, groesse: groesse * 1.06, spiegeln: true, alpha: r.alpha,
      augen: r.augen, flattern: r.flattern, kopf: -r.kopf, lichtkante: kante,
    });
  }

  ctx.restore();
}
