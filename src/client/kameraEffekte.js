/**
 * Kameraeffekte: Einstellungen, Kettenzähler und Aufträge an die Kameraregie.
 *
 * ## Was hier steht — und was nicht
 *
 * Dieses Modul ist **ohne Browser ladbar**: Es kennt weder DOM noch Canvas und
 * benutzt keine Uhr, die es nicht als Zahl bekommt. Es trägt drei Dinge, die
 * mehrere Stellen brauchen, ohne dass eine die andere importieren müsste:
 *
 *   - die **Einstellungen** (Beben, Knapp-vorbei, Wasser-Sturz, Kettenzähler),
 *     mit denen `kameraZiel.js` (Bebenstärke) und `kameraRegie.js` (Phasen)
 *     rechnen. Gespeichert und bedient wird im Browser in
 *     `kameraEffekteBedienung.js` — dieses Modul hält nur den Stand und
 *     benachrichtigt Abonnenten.
 *   - den **Kettenzähler** (KAMERA C5): zählt, was EIN Schuss nacheinander
 *     auslöst — Figur, Fass, Mine. Ab zwei Gliedern ist das eine Kette und
 *     wird angezeigt. Die Zählung ist Darstellung; sie liest dieselben
 *     Ereignisse, die auch das Protokoll speisen.
 *   - die **Kameraaufträge** (KAMERA C4): Ein Wasser-Sturz entsteht im
 *     Ereigniszweig (`ereignisse.js`), die Kamera läuft aber in der Regie.
 *     Statt `main.js` (gemeinsame Datei, nur lesen) zu ändern, legt der Zweig
 *     einen Auftrag ab, den die Regie beim nächsten Bild abholt.
 *
 * ## Warum keine zweite Wahrheit
 *
 * Alle Werte sind Anzeige. Kein Auftrag, keine Zählung und keine Einstellung
 * erreicht Engine, Zustandshash oder Replay — dieselbe Grenze wie in
 * `kameraRegie.js` und `kameraZiel.js`. Der Kettenzähler zählt Ereignisse, er
 * erzeugt keine.
 *
 * ## Stufen des Bebens
 *
 * `aus` schaltet BEIDE Bildbewegungen ab (Einschlagsschub und Erdbeben-Ruck),
 * `leicht` halbiert sie, `stark` verstärkt mittlere Einschläge. Die
 * Lesbarkeitsgrenzen (`STOSS_MAX`, `RUCK_MAX`) bleiben in beiden Fällen
 * bestehen — „stark" darf das Zielkreuz nicht unter dem Auge wegziehen.
 *
 * @module kameraEffekte
 */
import { waterStateFor, WATER_STATE } from '../shared/config/water.js';

/** Speicherschlüssel im `localStorage` (ein Eintrag, JSON). */
export const KAMERA_EFFEKTE_SCHLUESSEL = 'pa.kameraeffekte';

/** Erlaubte Bebenstufen in der Reihenfolge des Menüs (Knopf schaltet weiter). */
export const BEBEN_STUFEN = Object.freeze(['aus', 'leicht', 'normal', 'stark']);

/** Verstärkung je Bebenstufe. `normal` = 1 ist der bisherige Stand. */
export const BEBEN_FAKTOR = Object.freeze({ aus: 0, leicht: 0.5, normal: 1, stark: 1.35 });

/** Vorgaben. Neue Partien und alte Speicherstände ohne Feld landen hier. */
export const KAMERA_EFFEKTE_STANDARD = Object.freeze({
  beben: 'normal',
  knapp: true,
  wasser: true,
  ketten: true,
});

/** Die schaltbaren Arten (Reihenfolge = Menü). */
export const KAMERA_EFFEKT_ARTEN = Object.freeze(['knapp', 'wasser', 'ketten']);

/**
 * Macht aus beliebigem Rohmaterial (JSON aus dem Speicher, Testdaten) einen
 * vollständigen, gültigen Stand.
 *
 * Unbekannte Werte fallen einzeln auf die Vorgabe zurück — ein kaputter
 * Speichereintrag darf nicht das ganze Menü lahmlegen, und ein falscher Typ
 * darf nicht als „an" durchgehen (`Boolean('false')` wäre `true`, deshalb
 * wird hier ausdrücklich nur `true`/`false` übernommen).
 *
 * @param {unknown} roh
 * @returns {{beben:string, knapp:boolean, wasser:boolean, ketten:boolean}}
 */
export function normalisiereKameraEffekte(roh) {
  const quelle = roh && typeof roh === 'object' ? roh : {};
  const beben = BEBEN_STUFEN.includes(quelle.beben) ? quelle.beben : KAMERA_EFFEKTE_STANDARD.beben;
  const flag = (wert, vorgabe) => (typeof wert === 'boolean' ? wert : vorgabe);
  return {
    beben,
    knapp: flag(quelle.knapp, KAMERA_EFFEKTE_STANDARD.knapp),
    wasser: flag(quelle.wasser, KAMERA_EFFEKTE_STANDARD.wasser),
    ketten: flag(quelle.ketten, KAMERA_EFFEKTE_STANDARD.ketten),
  };
}

/** Die nächste Bebenstufe im Menü (nach `stark` wieder `aus`). */
export function naechsteBebenStufe(stufe) {
  const i = BEBEN_STUFEN.indexOf(normalisiereKameraEffekte({ beben: stufe }).beben);
  return BEBEN_STUFEN[(i + 1) % BEBEN_STUFEN.length];
}

/** Anzeigename einer Bebenstufe (Menü, `aria-label`). */
export function bebenText(stufe) {
  return { aus: 'Aus', leicht: 'Leicht', normal: 'Normal', stark: 'Stark' }[stufe] ?? 'Normal';
}

/**
 * Der Kettenzähler (KAMERA C5).
 *
 * Ein „Glied" ist ein Ereignis, das sichtbar etwas zerstört: eine
 * ausgeschaltete Figur, eine explodierte Mine, ein explodiertes Fass. Gezählt
 * wird nur zwischen `schuss()` und `ende()`, also innerhalb EINES Schusses —
 * was danach im selben Zug passiert (Nachzügler, Ertrinken), ist keine Kette.
 *
 * Ab zwei Gliedern gilt die Kette als sichtbar. Das erste Glied wird bewusst
 * NICHT angezeigt: „Kette ×1" wäre nur ein anderer Name für einen normalen
 * Treffer und würde bei jedem Schuss aufblitzen.
 */
export class Kettenzaehler {
  #glieder = [];

  #offen = false;

  /** Ein neuer Schuss beginnt: alte Glieder verwerfen, Zählung öffnen. */
  schuss() {
    this.#glieder = [];
    this.#offen = true;
    return this.stand;
  }

  /**
   * Ein Glied der Kette.
   * @param {string} art Kurzname für die Anzeige („Figur", „Fass", „Mine")
   * @returns {object|null} der neue Stand, oder `null` außerhalb eines Schusses
   */
  glied(art) {
    if (!this.#offen) return null;
    this.#glieder.push(String(art ?? '·'));
    return this.stand;
  }

  /** Der Schuss ist vorbei (Zugende): nichts mehr zählen, Stand bleibt lesbar. */
  ende() {
    this.#offen = false;
    return this.stand;
  }

  zuruecksetzen() {
    this.#glieder = [];
    this.#offen = false;
  }

  get stand() {
    return {
      anzahl: this.#glieder.length,
      glieder: Object.freeze([...this.#glieder]),
      sichtbar: this.#glieder.length >= 2,
      offen: this.#offen,
    };
  }
}

/**
 * Aufträge an die Kameraregie, die aus dem Ereigniszweig kommen.
 *
 * Bewusst eine kleine Warteschlange mit Deckel: Fällt die Regie aus (kein
 * Bild, Test ohne Verbraucher), wächst sie nicht unbegrenzt. Mehr als vier
 * gleichzeitige Aufträge sind ohnehin nicht darstellbar — der letzte gewinnt
 * beim Abholen, weil die Regie nur einen Sturz gleichzeitig inszeniert.
 */
export class KameraAuftraege {
  #liste = [];

  #max;

  constructor({ max = 4 } = {}) {
    this.#max = Math.max(1, Number(max) || 4);
  }

  merke(auftrag) {
    if (!auftrag || typeof auftrag !== 'object') return false;
    this.#liste.push(auftrag);
    while (this.#liste.length > this.#max) this.#liste.shift();
    return true;
  }

  /** Alle wartenden Aufträge in Reihenfolge; die Warteschlange ist danach leer. */
  nimm() {
    const liste = this.#liste;
    this.#liste = [];
    return liste;
  }

  get anzahl() { return this.#liste.length; }

  leeren() { this.#liste = []; }
}

/**
 * Erkennt den ÜBERGANG ins Untergetaucht-Sein je Figur.
 *
 * `entity_in_water` meldet in jedem Takt, solange die Figur im Wasser steht
 * (bis zu 60-mal je Sekunde). Für die Kamera zählt nur der erste Moment — der
 * Sturz. Der Wächter merkt sich je Figur den letzten Zustand; kommt nach einer
 * Pause (`trockenMs`) wieder eine Meldung, gilt die Figur als neu im Wasser.
 * Die Pause ist nötig, weil im Online-Betrieb gedrosselt gemeldet wird und ein
 * „trocken" nie ankommt.
 *
 * `sperreMs` verhindert, dass ein auf- und abschwankender Pegel (Wellen,
 * Verdrängung) mehrere Stürze hintereinander auslöst.
 */
export class Wasserwaechter {
  #stand = new Map();

  #trockenMs;

  #sperreMs;

  constructor({ trockenMs = 1200, sperreMs = 4000 } = {}) {
    this.#trockenMs = Math.max(0, Number(trockenMs) || 0);
    this.#sperreMs = Math.max(0, Number(sperreMs) || 0);
  }

  /**
   * @param {number} entityId
   * @param {number} level Füllstand 0..1
   * @param {number} [jetzt] Zeit in Millisekunden (Tests geben sie mit)
   * @returns {boolean} true nur beim Übergang ins Untergetaucht-Sein
   */
  melde(entityId, level, jetzt = jetztMs()) {
    const stufe = waterStateFor(level);
    const vor = this.#stand.get(entityId);
    const vorher = !vor || jetzt - vor.zeit > this.#trockenMs ? WATER_STATE.DRY : vor.stufe;
    const letzterSturz = vor?.letzterSturz ?? -Infinity;
    const eintrag = { stufe, zeit: jetzt, letzterSturz };
    let neu = false;
    if (stufe === WATER_STATE.SUBMERGED
      && vorher !== WATER_STATE.SUBMERGED
      && jetzt - letzterSturz >= this.#sperreMs) {
      eintrag.letzterSturz = jetzt;
      neu = true;
    }
    this.#stand.set(entityId, eintrag);
    return neu;
  }

  zuruecksetzen() { this.#stand.clear(); }
}

/** Millisekunden-Uhr der Anzeige; in Tests wird die Zeit ausdrücklich übergeben. */
function jetztMs() {
  const jetzt = globalThis.performance?.now?.();
  return Number.isFinite(jetzt) ? jetzt : Date.now();
}

/**
 * Der gemeinsame Stand für Kamera, Ereigniszweig und Bedienung.
 *
 * `abonniere` meldet JEDE Änderung (Einstellung, Kettenglied). Die Bedienung
 * hängt daran und schreibt Menü und Kettenanzeige nach; die Kamera liest die
 * Werte direkt in jedem Bild (kein Zwischenspeicher, damit ein Umschalten
 * sofort wirkt).
 */
class KameraEffekte {
  #stand = { ...KAMERA_EFFEKTE_STANDARD };

  #hoerer = new Set();

  #kette = new Kettenzaehler();

  #wasser = new Wasserwaechter();

  #auftraege = new KameraAuftraege();

  get beben() { return this.#stand.beben; }

  get knapp() { return this.#stand.knapp; }

  get wasser() { return this.#stand.wasser; }

  get ketten() { return this.#stand.ketten; }

  /** Verstärkung des Bildbebens (0 = aus, 1 = normal). */
  get bebenFaktor() { return BEBEN_FAKTOR[this.#stand.beben] ?? 1; }

  get stand() { return { ...this.#stand }; }

  get kette() { return this.#kette.stand; }

  get auftraege() { return this.#auftraege; }

  /**
   * Eine Einstellung setzen. Ungültige Arten/Werte werden verworfen, ohne den
   * übrigen Stand zu berühren.
   * @returns {boolean} ob der Wert übernommen wurde
   */
  setze(art, wert) {
    const vorher = this.#stand[art];
    if (art === 'beben') {
      if (!BEBEN_STUFEN.includes(wert)) return false;
      this.#stand.beben = wert;
    } else if (KAMERA_EFFEKT_ARTEN.includes(art)) {
      if (typeof wert !== 'boolean') return false;
      this.#stand[art] = wert;
    } else {
      return false;
    }
    if (vorher !== this.#stand[art]) this.#melde();
    return true;
  }

  /** Ganzes Bündel setzen (Speicher laden, Profilwechsel). */
  setzeAlles(roh) {
    this.#stand = normalisiereKameraEffekte(roh);
    this.#melde();
    return this.stand;
  }

  /** Nächste Bebenstufe (Menüknopf); gibt den neuen Wert zurück. */
  schalteBeben() {
    this.setze('beben', naechsteBebenStufe(this.#stand.beben));
    return this.#stand.beben;
  }

  /**
   * Ein Schuss beginnt: Kettenzähler öffnen.
   * @returns {object} der neue Kettenstand
   */
  schuss() {
    const stand = this.#kette.schuss();
    this.#melde();
    return stand;
  }

  /** Ein zerstörtes Glied im laufenden Schuss (Figur, Mine, Fass). */
  ketteGlied(art) {
    const stand = this.#kette.glied(art);
    if (stand) this.#melde();
    return stand;
  }

  ketteEnde() {
    const stand = this.#kette.ende();
    this.#melde();
    return stand;
  }

  ketteZuruecksetzen() {
    this.#kette.zuruecksetzen();
    this.#melde();
  }

  /**
   * Meldung aus dem Ereigniszweig `entity_in_water`. Legt beim Übergang ins
   * Untergetaucht-Sein einen Sturz-Auftrag für die Regie ab.
   *
   * @param {{entityId:number, x:number, y:number, level:number, jetzt?:number}} p
   * @returns {boolean} ob ein Auftrag entstanden ist
   */
  wasserGemeldet({ entityId, x, y, level, jetzt } = {}) {
    if (!this.#stand.wasser) return false;
    if (!Number.isFinite(entityId) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!this.#wasser.melde(entityId, level, jetzt)) return false;
    return this.#auftraege.merke({ art: 'sturz', entityId, x, y, level: Number(level) });
  }

  /** Abonnement auf Änderungen; gibt die Abbestellung zurück. */
  abonniere(fn) {
    if (typeof fn !== 'function') return () => {};
    this.#hoerer.add(fn);
    return () => { this.#hoerer.delete(fn); };
  }

  zuruecksetzen() {
    this.#stand = { ...KAMERA_EFFEKTE_STANDARD };
    this.#kette.zuruecksetzen();
    this.#wasser.zuruecksetzen();
    this.#auftraege.leeren();
    this.#melde();
  }

  #melde() {
    for (const fn of this.#hoerer) {
      try { fn(this.stand, this.#kette.stand); } catch { /* eine Anzeige darf die andere nicht ausfallen lassen */ }
    }
  }
}

/** Der eine Stand (Modul-Singleton). */
export const kameraEffekte = new KameraEffekte();

export default kameraEffekte;
