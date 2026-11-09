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
 *   - `tier`: kurzer Zoom auf Cookie oder Günther bei einem Auftritt (`tierBuehne.js`), nie während eines
 *     Geschosses, nie bei Bewegungsreduktion.
 *   - `knapp`: ein Geschoss geht knapp an einer Figur vorbei (KAMERA C2). Kurzer, engerer Zoom auf
 *     die Stelle des Vorbeiflugs, dann zurück zur Verfolgung. Nie bei Bewegungsreduktion und nie,
 *     wenn der Spieler die Kamera führt.
 *   - `sturz`: eine Figur geht unter Wasser (KAMERA C4). Die Regie holt den Auftrag aus
 *     `kameraEffekte.js` ab und hält kurz auf der Stelle, leicht unter der Oberfläche.
 *   - `einschlag`: kurzer Halt auf dem Einschlag mit sanftem Bildschub nach
 *     Radius und Waffenkategorie (nicht bei Bewegungsreduktion), dann zurück
 *     zur Übersicht.
 *
 * Der Einschlag hat Vorrang vor `knapp` und `sturz`: Sein Höhepunkt ist der
 * Moment, den der Schütze sehen will. `knapp` und `sturz` füllen die Pausen
 * dazwischen und laufen nie gleichzeitig.
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
  stossFuer, stossVersatz, naechsterVorbeiflug,
} from './kameraZiel.js';
import { kameraEffekte } from './kameraEffekte.js';

/** Sekunden, die die Kamera nach dem Einschlag auf ihm verweilt. */
export const HALTEN = 0.55;

/**
 * Knapp-vorbei-Zoom (KAMERA C2): Haltezeit, Zoomfaktor und Sperrzeit.
 *
 * Die Haltezeit ist kurz (0,4 s): Der Vorbeiflug ist ein Wimpernschlag, kein
 * eigener Höhepunkt. Der Faktor 1,25 ist bewusst klein — genug, um die Stelle
 * zu betonen, wenig genug, dass das fliegende Geschoss im Bild bleibt.
 * Die Sperre verhindert eine Zoom-Kette, wenn ein Geschoss mehrere Figuren
 * nacheinander knapp passiert.
 */
export const KNAPP = Object.freeze({ halten: 0.4, zoom: 1.25, sperre: 1.1 });

/** Wasser-Sturz (KAMERA C4): Haltezeit, Zoomfaktor und Blick unter die Oberfläche (Kartenpixel). */
export const STURZ = Object.freeze({ halten: 1.3, zoom: 1.4, unten: 30 });

/**
 * Mindestabstand des Vorbeiflugpunkts vom Abschussort (Kartenpixel).
 *
 * Der Schuss verlässt die Figur an ihrer eigenen Position. Ohne diese Schranke
 * wäre JEDER Schuss ein „knapper Vorbeiflug" am Schützen selbst. 60 px sind
 * rund vier Figurenbreiten — erst danach ist es ein Ereignis auf der Bahn.
 */
export const KNAPP_MINDESTWEG = 60;

/**
 * Größter Sprung zwischen zwei Geschosspunkten, der noch als dieselbe Bahn gilt
 * (Kartenpixel). Ein schnelles Geschoss legt je Bild rund 20 px zurück, online
 * mit 20-Hz-Snapshots bis ~50 px. Ein größerer Sprung ist ein ANDERES Geschoss
 * (Salve, Nachschuss); eine Strecke darüber würde quer über die Karte laufen
 * und an jeder Figur „knapp" vorbeikommen.
 */
export const KNAPP_SPRUNG_MAX = 200;

/** Zeitkonstanten (Sekunden) der Federn je Phase; ~0,25 ergibt rund 0,6 s Fahrzeit. */
export const ZEIT = Object.freeze({
  zugwechsel: 0.25, zielen: 0.35, verfolgung: 0.1, einschlag: 0.2, zoomRaus: 0.3, zoomRein: 0.5, zoomReinFlug: 0.9,
});
/** Zoomänderung (Logarithmus, ~35 %), ab der der festgehaltene Figurrand neu gemessen wird; das Aufschaukeln lag bei ~15 %. */
export const PAD_NEU_ZOOM = 0.3;
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
  #pad = null; // größter Figurrand seit Beginn der Übersicht (gegen Aufschaukeln, KAMERA-1)
  #padZoom = 1; // Zoom beim Festhalten des Randes
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
  #knapp = null; // {x, y, rest}: kurzer Zoom auf einen knappen Vorbeiflug
  #knappSperre = 0; // Sekunden bis zum nächsten möglichen Vorbeiflug-Zoom
  #sturz = null; // {x, y, rest}: kurzer Halt auf einem Wasser-Sturz
  #auftraege; // Warteschlange aus dem Ereigniszweig (Wasser-Sturz)

  /**
   * @param {object} [p]
   * @param {{nimm:() => Array<object>}} [p.auftraege] Warteschlange der Kameraaufträge (Tests: eigene)
   */
  constructor({ auftraege = kameraEffekte.auftraege } = {}) {
    this.#auftraege = auftraege && typeof auftraege.nimm === 'function' ? auftraege : kameraEffekte.auftraege;
  }

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
    this.#pad = null;
    this.#fliegt = false;
    this.#stoss = null;
    this.#uebersteuert = false;
    this.#hatAnsicht = false;
    this.#knapp = null;
    this.#knappSperre = 0;
    this.#sturz = null;
    this.#letzter = null;
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
   *   `krater {id,x,y,radius}|null`, `waffe {kategorie,radius}|null`, `ansicht`,
   *   `tier {x,y,zoom}|null` (Tierauftritt)
   * @returns {{x:number,y:number,zoom:number,stoss:{x:number,y:number}}|null}
   *   `null`, wenn die Automatik nichts setzt (Spieler führt oder nichts zu zeigen)
   */
  schritt(dt, e) {
    const zeit = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
    this.#bilder += 1;
    this.#knappSperre = Math.max(0, this.#knappSperre - zeit);
    const wechsel = e.aktivId !== this.#aktivId;
    if (wechsel) {
      this.#aktivId = e.aktivId;
      this.#uebersteuert = false;
      // Ein Zugwechsel beendet den Vorbeiflug-Zoom: Er gehört zum alten Schuss.
      this.#knapp = null;
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
        // Ein neuer Schuss löst einen laufenden Sturz-Halt ab; der Sturz gehört zum alten.
        this.#sturz = null;
      }
      const p = punkte[0];
      if (this.#letzter && zeit > 0) {
        const vx = (p.x - this.#letzter.x) / zeit;
        const vy = (p.y - this.#letzter.y) / zeit;
        this.#tempo = { x: this.#tempo.x * 0.65 + vx * 0.35, y: this.#tempo.y * 0.65 + vy * 0.35 };
      }
      /*
       * KAMERA C2: Ein Geschoss, das knapp an einer Figur vorbeigeht, bekommt
       * einen kurzen, engeren Zoom. Geprüft wird die STRECKE seit dem letzten
       * Bild — bei 60 Hz legt ein Geschoss bis zu ~20 px zurück, ein Vergleich
       * der Einzelpunkte würde den knappsten Punkt verfehlen.
       *
       * Nicht in der Wiederholung (dort läuft die Zugpause, kein echter
       * Schuss), nicht bei Bewegungsreduktion, nicht während des Einschlags
       * und nicht zweimal in Folge (Sperre).
       */
      if (!wdh && !this.#reduziert && kameraEffekte.knapp && this.fuehrt
        && this.#phase !== 'einschlag' && this.#phase !== 'knapp'
        && this.#knappSperre <= 0 && this.#letzter
        && Math.hypot(p.x - this.#letzter.x, p.y - this.#letzter.y) <= KNAPP_SPRUNG_MAX) {
        const figuren = e.aktiv ? [e.aktiv, ...(e.gegner ?? [])] : (e.gegner ?? []);
        const knapp = naechsterVorbeiflug({ von: this.#letzter, nach: p, figuren });
        // Direkt am Abschussort ist die eigene Figur — kein Vorbeiflug.
        if (knapp && (!this.#ursprung
          || Math.hypot(knapp.x - this.#ursprung.x, knapp.y - this.#ursprung.y) > KNAPP_MINDESTWEG)) {
          this.#knapp = { x: knapp.x, y: knapp.y, rest: KNAPP.halten };
          this.#phase = 'knapp';
          this.#knappSperre = KNAPP.sperre;
        }
      }
      this.#letzter = { x: p.x, y: p.y };
      if (neuerKrater && !wdh) this.#aufprall = { x: krater.x, y: krater.y, radius: krater.radius };
      if (this.#phase === 'knapp' && this.#knapp) {
        this.#knapp.rest -= zeit;
        if (this.#knapp.rest <= 0) { this.#knapp = null; this.#phase = 'verfolgung'; }
      } else {
        this.#phase = 'verfolgung';
      }
    } else if (this.#fliegt) {
      // Flug zu Ende: Halt auf dem Einschlag.
      this.#knapp = null;
      if (neuerKrater && !wdh) this.#aufprall = { x: krater.x, y: krater.y, radius: krater.radius };
      const ort = this.#aufprall ?? this.#letzter ?? (e.aktiv ?? null);
      const radius = this.#aufprall?.radius ?? this.#waffe?.radius ?? 0;
      this.#aufprall = ort ? { x: ort.x, y: ort.y, radius } : null;
      this.#phase = this.#aufprall ? 'einschlag' : 'uebersicht';
      this.#halten = 0;
      this.#stoss = null;
      if (this.#aufprall && !this.#reduziert && !wdh) {
        this.#stoss = stossFuer({ radius, kategorie: this.#waffe?.kategorie, beben: kameraEffekte.bebenFaktor });
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
    } else if (this.#phase === 'sturz' && this.#sturz) {
      this.#sturz.rest -= zeit;
      if (this.#sturz.rest <= 0) { this.#sturz = null; this.#phase = 'uebersicht'; this.#ziel = null; }
    } else if (this.#phase === 'verfolgung') {
      this.#phase = 'uebersicht';
    }
    this.#fliegt = fliegtJetzt;
    if (this.#phase !== 'einschlag') this.#stoss = null;
    // Der Vorbeiflug-Zoom läuft auch, wenn das Geschoss im nächsten Bild weg ist.
    if (this.#phase === 'knapp' && this.#knapp && !fliegtJetzt) {
      this.#knapp.rest -= zeit;
      if (this.#knapp.rest <= 0) { this.#knapp = null; this.#phase = 'uebersicht'; }
    }

    // Tierauftritt (Cookie tobt, Schockwelle, Günther erscheint): kurzer Zoom auf das Tier. Ein Geschoss
    // in der Luft, der Halt auf dem Einschlag, ein Vorbeiflug und ein Sturz haben Vorrang; bei
    // Bewegungsreduktion gibt es ihn nicht.
    const tier = !fliegtJetzt && this.#phase !== 'einschlag' && this.#phase !== 'knapp'
      && this.#phase !== 'sturz' && !this.#reduziert ? (e.tier ?? null) : null;
    if (tier) this.#phase = 'tier';
    else if (this.#phase === 'tier') { this.#phase = 'uebersicht'; this.#ziel = null; this.#zugwechsel = true; }

    if (!this.fuehrt) {
      // Der Spieler führt die Kamera: Aufträge sind für die Automatik gedacht und
      // würden später veraltet abgespielt. Verwerfen statt aufheben.
      this.#auftraege.leeren();
      return null;
    }
    if (!e.karte || !e.schirm || !e.rand) return null;

    /*
     * KAMERA C4: Wasser-Sturz. Der Ereigniszweig (`ereignisse.js`) legt beim
     * Übergang ins Untergetaucht-Sein einen Auftrag ab; hier wird er abgeholt.
     * Erst wenn kein Geschoss mehr fliegt und kein Einschlag läuft — sonst
     * verlöre der Einschlag seinen Halt. Bei Bewegungsreduktion entfällt die
     * Fahrt, der Auftrag wird trotzdem verbraucht (sonst staute er sich).
     */
    if (!fliegtJetzt && this.#phase !== 'einschlag') {
      for (const auftrag of this.#auftraege.nimm()) {
        if (auftrag?.art !== 'sturz' || this.#reduziert || !kameraEffekte.wasser) continue;
        if (!Number.isFinite(auftrag.x) || !Number.isFinite(auftrag.y)) continue;
        this.#sturz = { x: auftrag.x, y: auftrag.y, rest: STURZ.halten };
        this.#knapp = null;
        this.#phase = 'sturz';
        this.#aufprall = null;
        this.#stoss = null;
        this.#zugwechsel = false;
      }
    }

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
    } else if (this.#phase === 'knapp' && this.#knapp) {
      // Enger als die Verfolgung, aber so, dass das Geschoss im Bild bleibt:
      // Die Mitte liegt zwischen Vorbeiflugspunkt und aktuellem Geschosspunkt.
      const z0 = zoomBevorzugt(e.schirm, e.karte, { zoomMax: e.zoomMax });
      const z = Math.max(ganze, Math.min(e.zoomMax ?? 4, Math.max(this.#z, z0 * KNAPP.zoom)));
      const kopf = punkte[0];
      const mitte = kopf
        ? { x: (this.#knapp.x + kopf.x) / 2, y: (this.#knapp.y + kopf.y) / 2 }
        : { x: this.#knapp.x, y: this.#knapp.y };
      ziel = begrenzeAnsicht({ ...mitte, zoom: z }, e.karte, e.schirm, e.rand);
      glaettPos = ZEIT.verfolgung;
    } else if (this.#phase === 'sturz' && this.#sturz) {
      // Blick leicht unter die Oberfläche: Dort verschwindet die Figur, und der
      // Spieler sieht, wohin sie gefallen ist — nicht nur das Wasser obenauf.
      const z0 = zoomBevorzugt(e.schirm, e.karte, { zoomMax: e.zoomMax });
      const z = Math.max(ganze, Math.min(e.zoomMax ?? 4, z0 * STURZ.zoom));
      ziel = begrenzeAnsicht({ x: this.#sturz.x, y: this.#sturz.y + STURZ.unten, zoom: z },
        e.karte, e.schirm, e.rand);
      glaettPos = ZEIT.einschlag;
    } else if (this.#phase === 'tier' && tier) {
      const z = zoomBevorzugt(e.schirm, e.karte, { zoomMax: e.zoomMax });
      ziel = begrenzeAnsicht({ x: tier.x, y: tier.y - 24, zoom: Math.max(ganze, Math.min(e.zoomMax ?? 4, z * tier.zoom)) },
        e.karte, e.schirm, e.rand);
      glaettPos = ZEIT.zielen;
    } else if (e.aktiv) {
      // Der Figurrand kommt in Bildschirmpixeln und hängt damit vom Zoom ab: Zoom und
      // Rand schaukelten sich an einer Rundungsgrenze dauerhaft auf (KAMERA-1, Sprung
      // um rund 15 %). Während der Übersicht wächst er deshalb nur. Ändert sich der Zoom
      // seit dem Festhalten um mehr als PAD_NEU_ZOOM (Zielen auf ferne Gegner), wird
      // neu gemessen, damit kein Höchstwert eines ganz anderen Zooms stehen bleibt.
      // Neu gemessen wird außerdem nach Zugwechsel und Flug.
      const z = this.#z > 0 ? this.#z : 1;
      if (wechsel || !this.#pad || Math.abs(Math.log(z / this.#padZoom)) > PAD_NEU_ZOOM) {
        this.#pad = { halb: e.pad?.halb ?? 0, oben: e.pad?.oben ?? 0, unten: e.pad?.unten ?? 0 };
        this.#padZoom = z;
      } else {
        this.#pad = {
          halb: Math.max(this.#pad.halb, e.pad?.halb ?? 0),
          oben: Math.max(this.#pad.oben, e.pad?.oben ?? 0),
          unten: Math.max(this.#pad.unten, e.pad?.unten ?? 0),
        };
      }
      const pad = this.#pad;
      const kand = zielAusschnitt({ ...optionen, aktiv: e.aktiv, gegner: e.gegner, pad });
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
    if (this.#phase !== 'uebersicht') this.#pad = null;
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
    // Liegt das Ziel jenseits der Klemmung, erreicht die Fahrt es nie; steht die Kamera
    // still, ist der Zugwechsel trotzdem vorbei (sonst bliebe die Totzone abgeschaltet).
    if (this.#zugwechsel && this.#phase === 'uebersicht' && zeit > 0
      && Math.hypot(aus.x - this.#x, aus.y - this.#y) < 0.02
      && Math.abs(Math.log(aus.zoom / this.#z)) < 1e-4) this.#zugwechsel = false;
    this.#x = aus.x; this.#y = aus.y; this.#z = aus.zoom;

    let stoss = { x: 0, y: 0 };
    if (this.#stoss && !this.#reduziert) stoss = stossVersatz(this.#stoss, this.#stossZeit, this.#stossRichtung);
    return { ...aus, stoss };
  }
}

export default KameraRegie;
