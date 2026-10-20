/**
 * Kameraregie: Zeitverhalten der Kameraführung (Phasen, weiche Fahrt, Eingriff).
 *
 * Die Rechnung „wohin" steht rein in `kameraZiel.js`; hier steht „wann und wie
 * weich". Die Regie kennt kein DOM und keine Uhr: Der Aufrufer gibt den
 * Zeitschritt `dt` mit (so ist sie testbar). Alles ist Darstellung — nichts
 * davon berührt Engine, Zustands-Hash oder Replay; online, im Replay und für
 * Zuschauer gilt dieselbe Logik, weil sie nur den Anzeigezustand liest.
 *
 * ## Phasen
 *
 *   - `uebersicht`: aktive Figur samt Zielrichtung und Gegnern im Schussweg,
 *     Figur im sicheren Bereich. Zugwechsel: weiche Fahrt (~0,6 s), bei großem
 *     Weg mit Zoom-Bogen. Bewegungsreduktion: harter Schnitt.
 *   - `verfolgung`: ein Geschoss fliegt (oder die Wiederholung der Zugpause
 *     zeigt eines): Kamera folgt mit Vorausschau, zoomt bei großer Flugweite heraus.
 *   - `einschlag`: kurzer Halt auf dem Einschlag mit sanftem Bildschub nach
 *     Radius und Waffenkategorie (nicht bei Bewegungsreduktion), dann zurück
 *     zur Übersicht.
 *
 * ## Spielerkontrolle
 *
 * `modus` `folgt` (Standard) oder `frei` (Taste C / Knopf). Mausrad, Pinch und
 * Ziehen setzen `uebersteuert`: Die Automatik schweigt bis zum nächsten Zugwechsel
 * (bei `frei` dauerhaft).
 *
 * @module kameraRegie
 */
import { begrenzeAnsicht } from './camera.js';
import {
  glaette, zielAusschnitt, flugAusschnitt, zoomBevorzugt, bogenZoom, imBild,
  stossFuer, stossVersatz,
} from './kameraZiel.js';

/** Sekunden, die die Kamera nach dem Einschlag auf ihm verweilt. */
export const HALTEN = 0.55;
/** Zeitkonstanten (Sekunden) der Federn je Phase; ~0,25 ergibt rund 0,6 s Fahrzeit. */
export const ZEIT = Object.freeze({
  zugwechsel: 0.25, zielen: 0.35, verfolgung: 0.1, einschlag: 0.2, zoomRaus: 0.3, zoomRein: 0.5, zoomReinFlug: 0.9,
});
/** Bilder nach einem Rücksetzen, in denen hart gesetzt wird (HUD wird erst gemessen). */
const SNAP_BILDER = 6;

export class KameraRegie {
  #phase = 'uebersicht';
  #modus = 'folgt';
  #uebersteuert = false;
  #reduziert = false;
  #aktivId = undefined;
  #bilder = 0;
  #x = 0; #y = 0; #z = 1;
  #vx = 0; #vy = 0; #vz = 0;
  #ziel = null; // letztes Übersichtsziel (Totzone)
  #zugwechsel = false;
  #fliegt = false;
  #ursprung = null;
  #letzter = null;
  #tempo = { x: 0, y: 0 };
  #waffe = null;
  #kraterId = null;
  #aufprall = null;
  #halten = 0;
  #stoss = null;
  #stossZeit = 0;
  #stossRichtung = { x: 0, y: 1 };
  #hatAnsicht = false;

  get phase() { return this.#phase; }

  get modus() { return this.#modus; }

  get uebersteuert() { return this.#uebersteuert; }

  /** Ob die Automatik gerade die Kamera führt. */
  get fuehrt() { return this.#modus === 'folgt' && !this.#uebersteuert; }

  setzeReduziert(wert) { this.#reduziert = Boolean(wert); }

  /** Neues Match / Replay: alles vergessen, nächste Bilder hart setzen. */
  reset() {
    this.#phase = 'uebersicht';
    this.#aktivId = undefined;
    this.#bilder = 0;
    this.#ziel = null;
    this.#fliegt = false;
    this.#stoss = null;
    this.#uebersteuert = false;
    this.#hatAnsicht = false;
    this.#vx = 0; this.#vy = 0; this.#vz = 0;
  }

  setzeModus(modus) {
    const neu = modus === 'frei' ? 'frei' : 'folgt';
    if (neu === this.#modus) return;
    this.#modus = neu;
    if (neu === 'folgt') { this.#uebersteuert = false; this.#ziel = null; }
  }

  schalteModus() { this.setzeModus(this.#modus === 'folgt' ? 'frei' : 'folgt'); return this.#modus; }

  /** Der Spieler greift ein (Mausrad, Ziehen, Pinch): Automatik schweigt. */
  uebersteuere() { this.#uebersteuert = true; }

  /** Gleicht den Zustand der Feder an die tatsächliche Kamera an (Geschwindigkeit bleibt). */
  uebernimm(ansicht) {
    if (!ansicht) return;
    this.#x = ansicht.x; this.#y = ansicht.y; this.#z = ansicht.zoom;
    this.#hatAnsicht = true;
  }

  /**
   * Ein Schritt je Bild.
   *
   * @param {number} dt Sekunden seit dem letzten Bild
   * @param {object} e Eingabe (siehe `main.js#kameraEingabe`):
   *   `karte`, `schirm`, `rand`, `pad`, `zoomMax`, `aktivId`, `aktiv {x,y,winkel}`,
   *   `gegner`, `geschosse`, `wiederholung {kopf, ursprung}|null`,
   *   `krater {id,x,y,radius}|null`, `waffe {kategorie,radius}|null`, `ansicht`
   * @returns {{x:number,y:number,zoom:number,stoss:{x:number,y:number}}|null}
   *   `null`, wenn die Automatik nichts setzt (Spieler führt oder nichts zu zeigen)
   */
  schritt(dt, e) {
    const zeit = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
    this.#bilder += 1;
    const wechsel = e.aktivId !== this.#aktivId;
    if (wechsel) {
      this.#aktivId = e.aktivId;
      this.#uebersteuert = false;
      if (!this.#fliegt && this.#phase !== 'einschlag') this.#zugwechsel = true;
    }
    if (e.ansicht && (!this.#hatAnsicht || !this.fuehrt)) this.uebernimm(e.ansicht);
    const krater = e.krater ?? null;
    const neuerKrater = krater && krater.id !== this.#kraterId;
    if (krater) this.#kraterId = krater.id;

    // Flugzustand: Geschosse oder Wiederholung der Zugpause.
    const wdh = e.wiederholung ?? null;
    const punkte = wdh ? [{ x: wdh.kopf[0], y: wdh.kopf[1] }] : (e.geschosse ?? []);
    const fliegtJetzt = punkte.length > 0;
    if (fliegtJetzt) {
      if (!this.#fliegt) {
        this.#ursprung = wdh ? { x: wdh.ursprung[0], y: wdh.ursprung[1] }
          : (e.aktiv ? { x: e.aktiv.x, y: e.aktiv.y } : { x: punkte[0].x, y: punkte[0].y });
        this.#waffe = e.waffe ?? null;
        this.#letzter = null;
        this.#tempo = { x: 0, y: 0 };
        this.#aufprall = null;
      }
      const p = punkte[0];
      if (this.#letzter && zeit > 0) {
        const vx = (p.x - this.#letzter.x) / zeit;
        const vy = (p.y - this.#letzter.y) / zeit;
        this.#tempo = { x: this.#tempo.x * 0.65 + vx * 0.35, y: this.#tempo.y * 0.65 + vy * 0.35 };
      }
      this.#letzter = { x: p.x, y: p.y };
      if (neuerKrater && !wdh) this.#aufprall = { x: krater.x, y: krater.y, radius: krater.radius };
      this.#phase = 'verfolgung';
    } else if (this.#fliegt) {
      // Flug zu Ende: Halt auf dem Einschlag.
      if (neuerKrater && !wdh) this.#aufprall = { x: krater.x, y: krater.y, radius: krater.radius };
      const ort = this.#aufprall ?? this.#letzter ?? (e.aktiv ?? null);
      const radius = this.#aufprall?.radius ?? this.#waffe?.radius ?? 0;
      this.#aufprall = ort ? { x: ort.x, y: ort.y, radius } : null;
      this.#phase = this.#aufprall ? 'einschlag' : 'uebersicht';
      this.#halten = 0;
      this.#stoss = null;
      if (this.#aufprall && !this.#reduziert && !wdh) {
        this.#stoss = stossFuer({ radius, kategorie: this.#waffe?.kategorie });
        this.#stossZeit = 0;
        const o = this.#ursprung ?? this.#aufprall;
        const dx = this.#aufprall.x - o.x; const dy = this.#aufprall.y - o.y;
        const l = Math.hypot(dx, dy);
        this.#stossRichtung = l > 1 ? { x: dx / l, y: dy / l } : { x: 0, y: 1 };
      }
      this.#zugwechsel = false;
    } else if (this.#phase === 'einschlag') {
      this.#halten += zeit;
      this.#stossZeit += zeit;
      if (this.#halten >= HALTEN) { this.#phase = 'uebersicht'; this.#ziel = null; this.#aufprall = null; this.#zugwechsel = true; }
    } else if (this.#phase === 'verfolgung') {
      this.#phase = 'uebersicht';
    }
    this.#fliegt = fliegtJetzt;
    if (this.#phase !== 'einschlag') this.#stoss = null;

    if (!this.fuehrt) return null;
    if (!e.karte || !e.schirm || !e.rand) return null;

    const optionen = { karte: e.karte, schirm: e.schirm, rand: e.rand, zoomMax: e.zoomMax };
    const ganze = Math.min(e.schirm.b / e.karte.b, e.schirm.h / e.karte.h);
    let ziel = null;
    let glaettPos = ZEIT.zielen;
    let glaettZoomRein = ZEIT.zoomRein;

    if (this.#phase === 'verfolgung') {
      ziel = flugAusschnitt({ ...optionen, geschosse: punkte, tempo: this.#tempo, ursprung: this.#ursprung });
      glaettPos = ZEIT.verfolgung;
      glaettZoomRein = ZEIT.zoomReinFlug;
    } else if (this.#phase === 'einschlag' && this.#aufprall) {
      const z = zoomBevorzugt(e.schirm, e.karte, { zoomMax: e.zoomMax });
      ziel = begrenzeAnsicht({ x: this.#aufprall.x, y: this.#aufprall.y, zoom: Math.max(ganze, Math.min(z, this.#z)) },
        e.karte, e.schirm, e.rand);
      glaettPos = ZEIT.einschlag;
    } else if (e.aktiv) {
      const kand = zielAusschnitt({ ...optionen, aktiv: e.aktiv, gegner: e.gegner, pad: e.pad });
      const sichtB = e.schirm.b / kand.zoom;
      const alt = this.#ziel;
      const weit = !alt || this.#zugwechsel
        || Math.hypot(kand.x - alt.x, kand.y - alt.y) > 0.025 * sichtB
        || Math.abs(Math.log(kand.zoom / alt.zoom)) > 0.08
        || !kand.sicher;
      if (weit) this.#ziel = kand;
      ziel = this.#ziel;
      if (this.#zugwechsel) glaettPos = ZEIT.zugwechsel;
    }
    if (!ziel) return null;

    // Erste Bilder und Bewegungsreduktion: harter Schnitt.
    const hart = this.#bilder <= SNAP_BILDER || !this.#hatAnsicht;
    let aus;
    if (hart || (this.#reduziert && this.#phase === 'uebersicht')) {
      aus = { x: ziel.x, y: ziel.y, zoom: ziel.zoom };
      this.#vx = 0; this.#vy = 0; this.#vz = 0;
      if (this.#zugwechsel) this.#zugwechsel = false;
    } else if (this.#reduziert) {
      // Geschoss: nur schneiden, wenn es den Bildbereich verlässt; kein Schub.
      const sichtbar = punkte.every(p => imBild(p, { x: this.#x, y: this.#y, zoom: this.#z }, e.karte, e.schirm, e.rand));
      aus = !sichtbar && this.#phase === 'verfolgung'
        ? { x: ziel.x, y: ziel.y, zoom: ziel.zoom }
        : { x: this.#x, y: this.#y, zoom: this.#z };
    } else {
      // Weg-Easing: bei großem Weg herauszoomen (nur beim Zugwechsel).
      let zoomZiel = ziel.zoom;
      if (this.#zugwechsel && this.#phase === 'uebersicht') {
        const rest = Math.hypot(ziel.x - this.#x, ziel.y - this.#y);
        zoomZiel = bogenZoom(zoomZiel, rest, e.schirm.b, ganze);
        if (rest < 4 && Math.abs(Math.log(ziel.zoom / this.#z)) < 0.02) this.#zugwechsel = false;
      }
      const sx = glaette(this.#x, this.#vx, ziel.x, glaettPos, zeit);
      const sy = glaette(this.#y, this.#vy, ziel.y, glaettPos, zeit);
      const lz = Math.log(this.#z);
      const lzZiel = Math.log(zoomZiel);
      const sz = glaette(lz, this.#vz, lzZiel, lzZiel < lz ? ZEIT.zoomRaus : glaettZoomRein, zeit);
      this.#vx = sx.tempo; this.#vy = sy.tempo; this.#vz = sz.tempo;
      aus = { x: sx.wert, y: sy.wert, zoom: Math.exp(sz.wert) };
    }
    aus = begrenzeAnsicht(aus, e.karte, e.schirm, e.rand);
    this.#x = aus.x; this.#y = aus.y; this.#z = aus.zoom;

    let stoss = { x: 0, y: 0 };
    if (this.#stoss && !this.#reduziert) stoss = stossVersatz(this.#stoss, this.#stossZeit, this.#stossRichtung);
    return { ...aus, stoss };
  }
}

export default KameraRegie;
