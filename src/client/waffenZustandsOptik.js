/**
 * Zustandsanzeigen der Waffenwirkung (N-15), nur Darstellung ohne Einfluss auf Motor, Hash, Replay oder Netz:
 *
 *   - Minen: Absetzen (Fallen, Aufsetzen, Staub) und Scharfschalten (schnelles Blinken, dann der Takt),
 *   - Schild: Blase um die Figur, solange `statuses[id].shield > 0`, mit Treffer-Aufblitzen beim Absinken,
 *     Aufbau beim Anstieg und Zerplatzen beim Wegfall,
 *   - Nachladen: kurzer Bereit-Puls, sobald die Waffe wieder schussbereit ist,
 *   - Laser: die Strahlbreite folgt dem Abklingen (Entladung).
 *
 * Alle Zeiten kommen vom Aufrufer (Sekunden der Wanduhr, nicht des Simulationstakts): gleiche Eingabe, gleiche
 * Zahl, kein `Math.random`. `prefers-reduced-motion` entfernt die BEWEGUNG (Fallen, Staub, Wallen, Ausdehnen),
 * nicht die Aussage (Lämpchen, Blase, Aufblitzen als Helligkeit).
 *
 * @module waffenZustandsOptik
 */

const klemme = (v, a, b) => (v < a ? a : v > b ? b : v);

// ----------------------------------------------------------------- Minen

/** Dauer des Absetzens (Fall von oben bis zum Aufsetzen) in Sekunden. */
export const MINEN_FALL_DAUER = 0.28;
/** Nachfederung (Stauchen) und Staub nach dem Aufsetzen in Sekunden. */
export const MINEN_STAUB_DAUER = 0.3;
/** Dauer des Scharfschaltens (schnelles Blinken) nach dem Aufsetzen in Sekunden. */
export const MINEN_SCHARF_DAUER = 0.9;
/** Fallhöhe in Weltpixeln. */
export const MINEN_FALL_HOEHE = 26;

/**
 * Zustand einer Mine `alter` Sekunden nach dem Erscheinen.
 *
 * @param {number} alter - Sekunden seit dem ersten Bild; `Infinity` für Minen, die von Anfang an lagen
 * @param {boolean} reduziert
 * @returns {{hoehe:number, stauch:number, staub:number, scharfAnteil:number, lampeAn:(zeit:number)=>boolean}}
 *   `hoehe` Abstand über dem Boden (px), `stauch` Quetschung der Scheibe (0..1), `staub` Staubwolke (0..1, 0 = keine),
 *   `scharfAnteil` 1 = gerade scharf geworden, 0 = fertig; `lampeAn` Lämpchen zur Wanduhr `zeit`
 */
export function minenZustand(alter, reduziert = false) {
  const a = alter < 0 ? 0 : alter;
  const fertigScharf = a >= MINEN_FALL_DAUER + MINEN_SCHARF_DAUER;
  const scharfAnteil = fertigScharf ? 0 : clamp01(1 - (a - MINEN_FALL_DAUER) / MINEN_SCHARF_DAUER);
  // Blinktakt: während des Scharfschaltens 8 Hz, danach 2 Hz; bei reduzierter Bewegung steht das Lämpchen
  // nach dem Aufsetzen dauerhaft an (Information „scharf" bleibt, nichts blinkt).
  const lampeAn = zeit => {
    if (a < MINEN_FALL_DAUER) return false;
    if (reduziert) return true;
    return Math.floor(zeit * (scharfAnteil > 0 ? 16 : 4)) % 2 === 0;
  };
  if (reduziert || a >= MINEN_FALL_DAUER + MINEN_STAUB_DAUER) {
    return { hoehe: 0, stauch: 0, staub: 0, scharfAnteil, lampeAn };
  }
  if (a < MINEN_FALL_DAUER) {
    const u = a / MINEN_FALL_DAUER;
    return { hoehe: MINEN_FALL_HOEHE * (1 - u * u), stauch: 0, staub: 0, scharfAnteil, lampeAn };
  }
  const u = (a - MINEN_FALL_DAUER) / MINEN_STAUB_DAUER;
  return { hoehe: 0, stauch: Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.35 * (1 - u), staub: 1 - u, scharfAnteil, lampeAn };
}

const clamp01 = v => klemme(v, 0, 1);

/**
 * Merkt, wann eine Mine zum ersten Mal erscheint. Minen, die beim ersten Aufruf schon liegen (Kartenaufbau,
 * Wiedereinstieg), bekommen keine Absetz-Animation (`alter` = Infinity).
 */
export class MinenAlter {
  constructor() {
    this.gesehen = new Map();
    this.gestartet = false;
  }

  /** Alter der Mine in Sekunden; legt beim ersten Erscheinen den Zeitstempel an. */
  alter(id, jetzt) {
    let t = this.gesehen.get(id);
    if (t === undefined) {
      t = this.gestartet ? jetzt : -Infinity;
      this.gesehen.set(id, t);
    }
    return jetzt - t;
  }

  /** Nach jedem Bild: vergisst verschwundene Minen und schaltet vom Aufbau auf „neu" um. */
  abschluss(aktuelleIds) {
    this.gestartet = true;
    if (this.gesehen.size > aktuelleIds.size) {
      for (const id of this.gesehen.keys()) if (!aktuelleIds.has(id)) this.gesehen.delete(id);
    }
  }

  leere() {
    this.gesehen.clear();
    this.gestartet = false;
  }
}

/**
 * Staubwolke einer aufsetzenden Mine: vier Ballen, die nach außen und oben ziehen.
 * @param {number} staub - 1 → 0
 */
export function zeichneMinenStaub(ctx, staub) {
  if (staub <= 0) return;
  ctx.save();
  ctx.fillStyle = '#b8a98c';
  for (let i = 0; i < 4; i += 1) {
    const richtung = i < 2 ? -1 : 1;
    const weit = (i % 2 === 0 ? 1 : 0.55) * (1 - staub);
    ctx.globalAlpha = 0.45 * staub;
    ctx.beginPath();
    ctx.arc(richtung * (4 + 9 * weit), 2 - 4 * (1 - staub) * (i % 2 === 0 ? 1 : 1.6), 1.6 + 2.2 * (1 - staub), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Fuß der Mine im Mine-Ursprung (Bodenpunkt): Schatten (schrumpft mit der Fallhöhe), Staub und danach der
 * Versatz nach oben und die Stauchung für die Scheibe, die der Aufrufer anschließend zeichnet.
 */
export function zeichneMinenFuss(ctx, mz) {
  const k = 1 - mz.hoehe / 90;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9 * k, 3 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  zeichneMinenStaub(ctx, mz.staub);
  ctx.translate(0, -mz.hoehe);
  if (mz.stauch > 0) ctx.scale(1 + mz.stauch * 0.3, 1 - mz.stauch);
}

/**
 * Lämpchen der Mine: beim Absetzen und Scharfschalten nach `mz.lampeAn`, danach der bisherige Takt (zwei Hertz,
 * `tick` = Renderer-Zähler `time`, 30 je Halbperiode; bei reduzierter Bewegung dauerhaft an).
 */
export function minenLampe(mz, zeit, reduziert, tick) {
  if (mz.scharfAnteil > 0 || mz.hoehe > 0 || mz.stauch > 0) return mz.lampeAn(zeit);
  return reduziert || Math.floor(tick / 30) % 2 === 0;
}

// ----------------------------------------------------------------- Schild

/** Dauer des Aufblitzens bei einem Treffer ins Schild (Sekunden). */
export const SCHILD_TREFFER_DAUER = 0.4;
/** Dauer des Aufbaus (Blase wächst) bzw. des Zerplatzens (Sekunden). */
export const SCHILD_WECHSEL_DAUER = 0.35;

/**
 * Verfolgt je Figur den Schildwert und leitet Aufbau, Treffer und Zerplatzen aus seinen Änderungen ab
 * (kein zusätzliches Ereignis nötig: `statuses[id].shield` ist in beiden Betriebsarten vorhanden).
 */
export class SchildAnzeige {
  constructor() {
    this.stand = new Map();
  }

  /**
   * Führt die Figur fort und liefert, was zu zeichnen ist; `null`, wenn nichts (mehr) zu sehen ist.
   *
   * @param {number} id
   * @param {number} schild - aktueller Schildwert (≥ 0)
   * @param {number} jetzt - Sekunden
   * @returns {{staerke:number, aufbau:number, treffer:number, platzt:number}|null}
   *   `staerke` 0..1 (Deckkraft nach Restwert), `aufbau` 0..1 (1 = voll da), `treffer` 1 → 0, `platzt` 0..1 (0 = nicht, 1 = gerade zerplatzt)
   */
  fuehre(id, schild, jetzt) {
    const wert = Number.isFinite(schild) && schild > 0 ? schild : 0;
    let z = this.stand.get(id);
    if (!z) {
      // Erstes Bild: ein schon vorhandenes Schild steht einfach da, kein Aufbau, kein Treffer.
      z = { wert, max: wert, seit: -1e9, treffer: -1e9, platzt: -1e9 };
      this.stand.set(id, z);
    } else if (wert > z.wert) {
      if (z.wert === 0) { z.seit = jetzt; z.max = wert; } else z.max = Math.max(z.max, wert);
    } else if (wert < z.wert) {
      if (wert === 0) z.platzt = jetzt; else z.treffer = jetzt;
    }
    z.wert = wert;
    if (wert === 0 && jetzt - z.platzt >= SCHILD_WECHSEL_DAUER) {
      z.max = 0;
      if (jetzt - z.treffer >= SCHILD_TREFFER_DAUER) return null;
    }
    const platzt = clamp01(1 - (jetzt - z.platzt) / SCHILD_WECHSEL_DAUER);
    if (wert === 0 && platzt <= 0) return null;
    return {
      staerke: wert > 0 ? clamp01(wert / Math.max(40, z.max)) : 0,
      aufbau: clamp01((jetzt - z.seit) / SCHILD_WECHSEL_DAUER),
      treffer: clamp01(1 - (jetzt - z.treffer) / SCHILD_TREFFER_DAUER),
      platzt,
    };
  }

  /** Vergisst Figuren, die nicht mehr im Bild geführt werden (nach dem Tod, bei neuer Partie). */
  vergiss(id) {
    this.stand.delete(id);
  }

  leere() {
    this.stand.clear();
  }
}

/**
 * Zeichnet die Schildblase. Ursprung = Mitte der Blase (Weltkoordinaten).
 *
 * @param {{staerke:number, aufbau:number, treffer:number, platzt:number}} z - aus `SchildAnzeige.fuehre`
 * @param {number} breite - Halbbreite in Weltpixeln, `hoehe` Halbhöhe
 * @param {number} zeit - Wanduhr in Sekunden (Wandern des Glanzbogens)
 */
export function zeichneSchildBlase(ctx, z, breite, hoehe, zeit, reduziert = false, farbe = '124, 196, 255') {
  const wachs = reduziert ? 1 : 0.75 + 0.25 * z.aufbau;
  const platz = z.platzt > 0 && z.staerke === 0;
  const rx = breite * (platz && !reduziert ? 1 + 0.35 * (1 - z.platzt) : wachs);
  const ry = hoehe * (platz && !reduziert ? 1 + 0.35 * (1 - z.platzt) : wachs);
  const grund = platz ? 0.35 * z.platzt : 0.1 + 0.14 * z.staerke;
  const blitz = 0.5 * z.treffer;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const verlauf = ctx.createRadialGradient(0, 0, Math.min(rx, ry) * 0.45, 0, 0, Math.max(rx, ry));
  verlauf.addColorStop(0, `rgba(${farbe}, 0)`);
  verlauf.addColorStop(1, `rgba(${farbe}, ${Math.min(0.9, grund + blitz)})`);
  ctx.fillStyle = verlauf;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.2 + 1.6 * z.treffer;
  ctx.strokeStyle = `rgba(${farbe}, ${Math.min(1, 0.35 + 0.25 * z.staerke + 0.5 * z.treffer)})`;
  ctx.stroke();
  if (!platz) {
    // Glanzbogen: wandert langsam um die Blase; bei reduzierter Bewegung steht er schräg oben links.
    const w = reduziert ? -2.2 : zeit * 1.1;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + 0.35 * z.treffer})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, w, w + 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Zeichnet die Schildblase einer Figur und führt dabei deren Zustand fort.
 *
 * @param {SchildAnzeige} anzeige
 * @param {{id:number, x:number, y:number, hoehe:number, schild:number}} f - `x`/`y` Fußpunkt in Weltkoordinaten,
 *   `hoehe` Sprite-Höhe in Weltpixeln, `schild` aktueller Schildwert
 */
export function zeichneFigurSchild(ctx, anzeige, f, jetzt, reduziert) {
  const z = anzeige.fuehre(f.id, f.schild, jetzt);
  if (!z) return;
  ctx.save();
  ctx.translate(f.x, f.y - f.hoehe * 0.5);
  zeichneSchildBlase(ctx, z, f.hoehe * 0.46, f.hoehe * 0.62, jetzt, reduziert);
  ctx.restore();
}

// ----------------------------------------------------------------- Nachladen

/** Dauer des Bereit-Pulses, wenn die Waffe wieder schussbereit ist (Sekunden). */
export const BEREIT_PULS_DAUER = 0.3;

/**
 * Erkennt den Übergang „lädt nach → bereit" je Figur. Ein Wechsel der Waffe, ein Bild ohne Zeichnung
 * (Figur außerhalb des Bildes) oder ein Sprung über mehrere Bilder löst keinen Puls aus.
 */
export class BereitPuls {
  /**
   * @param {{waffeId:string, ladung:number, bild:number, seit:number}} z - vom Aufrufer je Figur gehaltener Zustand
   * @returns {number} Sekunden seit dem Bereitwerden (Infinity = kein Puls)
   */
  static pruefe(z, waffeId, ladung, bild, jetzt) {
    const zusammenhaengend = z.bild >= 0 && bild - z.bild <= 2 && z.waffeId === waffeId;
    if (zusammenhaengend && z.ladung < 1 && ladung >= 1) z.seit = jetzt;
    z.waffeId = waffeId;
    z.ladung = ladung;
    z.bild = bild;
    return jetzt - z.seit;
  }

  static neu() {
    return { waffeId: '', ladung: 1, bild: -1, seit: -Infinity };
  }
}

/** Gewicht des Bereit-Pulses 0..1 (1 im Augenblick des Bereitwerdens). */
export function bereitPuls(seit) {
  if (!(seit >= 0) || seit >= BEREIT_PULS_DAUER) return 0;
  const u = 1 - seit / BEREIT_PULS_DAUER;
  return u * u;
}

// ----------------------------------------------------------------- Laser

/**
 * Breitenfaktor eines Strahls beim Abklingen: Er bricht nicht nur aus, sondern zieht sich zusammen
 * („Entladung"). 1 bei `life` 1, 0,35 bei `life` 0; bei reduzierter Bewegung konstant 1.
 */
export function strahlBreite(life, reduziert = false) {
  return reduziert ? 1 : 0.35 + 0.65 * clamp01(life);
}
