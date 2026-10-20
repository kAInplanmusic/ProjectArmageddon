/**
 * Der Klangmischer — verbindet Spielereignisse mit erzeugten Klängen.
 *
 * ## Aufgaben
 *
 * Er hält den AudioContext (Freigabe durch den Nutzer, kein Absturz ohne Ausgabe),
 * den Klanggraph (`klangSynth.js`: Busse, Hall, Begrenzer, ein Rauschpuffer), wählt zu
 * jedem Ereignis das Profil (`klangProfile.js`) und legt Lautstärke, Stereolage und
 * Abstandsdämpfung nach der Bildposition fest. Gleichzeitig laufen höchstens
 * `STIMMEN_MAX` Klänge; der älteste wird gekappt.
 *
 * ## Busse
 *
 * `schuss`, `treffer`, `umgebung`, `ui` mit je eigenem Gain. Die Musik hat ihren
 * eigenen Gain (`musik.js`) und hängt über `musikAnschluss()` vor dem Begrenzer.
 * Der Ausgang (`#ausgang`) ist die „Effekt-Lautstärke"; „Effekte aus" erzeugt
 * keinen Klang.
 *
 * ## Stumm in Tests
 *
 * `aktiv: false` (Headless/`navigator.webdriver`, `?ton=0`) baut den Graphen
 * und erzeugt die Klänge wie sonst — der Ausgang steht aber auf null. Zähler und
 * Debug-Zustand (`zustand`) laufen unverändert, hörbar ist nichts.
 *
 * ## Staffelung
 *
 * Der Abschuss klingt sofort, der Einschlag erst, wenn die Engine ihn meldet (nach der
 * Flugzeit); bei weit entfernten Einschlägen kommt die Laufzeit des Schalls hinzu. Zwei
 * Meldungen desselben Schusses (`shot` + `hitscan`) ergeben einen Knall; Explosionen am
 * selben Ort im selben Augenblick (Splitter) einen Knall; mehr als drei Treffer in 50 ms
 * werden zusammengefasst.
 *
 * @module soundMixer
 */

import { donner } from './sound.js';
import { getWeapon } from '../shared/config/weapons.js';
import { baueKlangGraph, spieleProfil } from './klangSynth.js';
import {
  ALLE_PROFILE, BUSSE, KATEGORIEN, StimmenVerwalter, STIMMEN_MAX, einschlagProfil,
  raeumlich, schussProfilFuer, trefferProfil,
} from './klangProfile.js';

const SCHLUESSEL = 'pa.ton.v1';

/** Speicher mit try/catch — ohne localStorage laufen die Vorgaben. */
export function tonSpeicher() {
  return {
    lies() {
      try { return globalThis.localStorage?.getItem(SCHLUESSEL) ?? null; } catch { return null; }
    },
    schreibe(text) {
      try { globalThis.localStorage?.setItem(SCHLUESSEL, text); } catch { /* ignorieren */ }
    },
  };
}

const begrenze01 = wert => Math.max(0, Math.min(1, Number(wert) || 0));

const leereZaehler = () => ({
  explosion: 0, schuss: 0, treffer: 0, donner: 0, einschlag: 0, wasser: 0, truemmer: 0,
  landung: 0, tod: 0, kiste: 0, ui: 0, ticken: 0, tier: 0, wirkung: 0,
});

/** Abstand-Fenster, in dem zwei Meldungen als EIN Klang gelten (s). */
const FENSTER_SCHUSS = 0.15;
const FENSTER_EXPLOSION = 0.06;
const FENSTER_TREFFER = 0.05;
const MAX_TREFFER_IM_FENSTER = 3;

export class SoundMixer {
  #ctx = null;
  #graph = null;
  #ausgang = null;
  /** Eingang des Begrenzers (oder `destination`): Hier hängt auch die Musik. */
  #limiter = null;
  /** Wird bei Einschlägen und Treffern gerufen (Musik ducken); darf fehlen. */
  #beiLaut = null;
  #an = true;
  #aktiv = true;
  #lautstaerke = 0.8;
  #busPegel = {};
  #gezaehlt = leereZaehler();
  #ereignisse = {};
  #kategorien = Object.fromEntries(KATEGORIEN.map(k => [k, 0]));
  #profile = {};
  #stumm = 0;
  #ohneKontext = 0;
  #zusammengefasst = 0;
  #letzte = null;
  #verwalter = new StimmenVerwalter(STIMMEN_MAX);
  #hoerer = null;
  #speicher = null;
  #lauscher = new Set();
  #uhr;
  #zufall;
  #letzterSchuss = new Map();
  #letzteExplosion = null;
  #trefferFenster = { t: -1, n: 0 };
  #ctxBauer;

  /**
   * @param {object} optionen
   * @param {boolean} [optionen.an] - Effekte eingeschaltet?
   * @param {number} [optionen.lautstaerke] - 0 bis 1
   * @param {boolean} [optionen.aktiv] - false = Ausgang stumm (Tests/Headless), Rest unverändert
   * @param {Function} [optionen.ctxBauer] - für Tests: liefert einen Context
   * @param {{lies: Function, schreibe: Function}} [optionen.speicher] - Einstellung merken
   * @param {() => number} [optionen.uhr] - Sekunden (Echtzeit) für die Zusammenfassung
   * @param {() => number} [optionen.zufall]
   */
  constructor({
    an = true, lautstaerke = 0.8, aktiv = true, ctxBauer = null, speicher = null, uhr = null,
    zufall = Math.random,
  } = {}) {
    this.#an = an;
    this.#lautstaerke = lautstaerke;
    this.#aktiv = Boolean(aktiv);
    this.#ctxBauer = ctxBauer;
    this.#speicher = speicher;
    this.#uhr = uhr ?? (() => (globalThis.performance?.now?.() ?? Date.now()) / 1000);
    this.#zufall = zufall;
    for (const b of BUSSE) this.#busPegel[b] = 1;
    this.#ladeZustand();
  }

  /** Sind die Effekte eingeschaltet? */
  get an() { return this.#an; }

  /** Ist der Ausgang hörbar (false in Tests/Headless)? */
  get aktiv() { return this.#aktiv; }

  get lautstaerke() { return this.#lautstaerke; }

  /** Läuft der AudioContext schon? */
  get bereit() { return this.#ctx !== null; }

  /**
   * Hängt die Musik an den Mischer (eigener Gain, derselbe Begrenzer).
   * @returns {{ctx: AudioContext, ziel: AudioNode}|null}
   */
  musikAnschluss() {
    if (!this.#ctx || !this.#limiter) return null;
    return { ctx: this.#ctx, ziel: this.#limiter };
  }

  /** Meldet laute Ereignisse (`'explosion'` | `'treffer'`) an die Musik (Ducken). */
  setzeLautHandler(fn) {
    this.#beiLaut = typeof fn === 'function' ? fn : null;
    return this;
  }

  /**
   * Quelle der Hörerposition: `() => {x, y, halbBreite}|null` (Bildmitte in Weltpixeln,
   * halbe sichtbare Breite). Ohne sie klingt alles mittig und in voller Stärke.
   */
  setzeHoerer(fn) {
    this.#hoerer = typeof fn === 'function' ? fn : null;
    return this;
  }

  #meldeLaut(art) {
    try { this.#beiLaut?.(art); } catch { /* Die Musik darf nie einen Klang verhindern. */ }
  }

  /** Die Zähler tatsächlich erzeugter Klänge — für Werkzeuge, die messen wollen. */
  get gezaehlt() { return { ...this.#gezaehlt }; }

  /**
   * Debug-Zustand (`window.__PA__.sound()`): Schalter, Zähler pro Klangart, Kategorie und
   * Profil, Stimmen, zuletzt gespielter Klang.
   */
  get zustand() {
    const jetzt = this.#ctx?.currentTime ?? 0;
    return {
      an: this.#an,
      aktiv: this.#aktiv,
      bereit: this.bereit,
      kontext: this.#ctx?.state ?? null,
      lautstaerke: this.#lautstaerke,
      busse: { ...this.#busPegel },
      ereignisse: { ...this.#ereignisse },
      gespielt: this.gezaehlt,
      kategorien: { ...this.#kategorien },
      profile: { ...this.#profile },
      stumm: this.#stumm,
      ohneKontext: this.#ohneKontext,
      zusammengefasst: this.#zusammengefasst,
      stimmen: {
        aktiv: this.#verwalter.aktiv(jetzt), max: this.#verwalter.max,
        gekappt: this.#verwalter.gekappt, spitze: this.#verwalter.spitze,
      },
      letzte: this.#letzte ? { ...this.#letzte } : null,
    };
  }

  /** Meldet jede Änderung von Schalter und Lautstärke (Anzeige synchron halten). */
  beiAenderung(fn) {
    this.#lauscher.add(fn);
    return () => this.#lauscher.delete(fn);
  }

  #melde() {
    const z = { an: this.#an, aktiv: this.#aktiv, lautstaerke: this.#lautstaerke };
    for (const fn of this.#lauscher) {
      try { fn(z); } catch { /* Anzeigefehler dürfen den Klang nicht stören. */ }
    }
  }

  #ladeZustand() {
    if (!this.#speicher) return;
    try {
      const roh = this.#speicher.lies();
      if (!roh) return;
      const d = JSON.parse(roh);
      if (typeof d?.an === 'boolean') this.#an = d.an;
      if (d?.lautstaerke !== undefined && Number.isFinite(Number(d.lautstaerke))) {
        this.#lautstaerke = begrenze01(d.lautstaerke);
      }
    } catch { /* kaputter Eintrag: Vorgaben */ }
  }

  #speichere() {
    try {
      this.#speicher?.schreibe(JSON.stringify({ an: this.#an, lautstaerke: this.#lautstaerke }));
    } catch { /* ignorieren */ }
  }

  /** Schaltet die Effekte ein oder aus (aus: kein Klang, kein Context nötig). */
  setzeAn(an) {
    const neu = Boolean(an);
    if (neu === this.#an) return this;
    this.#an = neu;
    this.#speichere();
    this.#melde();
    return this;
  }

  /** Taste/Schalter „Effekte". */
  schalte() { return this.setzeAn(!this.#an); }

  /** Setzt die Effekt-Lautstärke (0 bis 1). */
  setzeLautstaerke(wert) {
    this.#lautstaerke = begrenze01(wert);
    this.#wendeAusgangAn();
    this.#speichere();
    this.#melde();
    return this;
  }

  /** Gain eines Busses (0 bis 1,5, Vorgabe 1) zusätzlich zu seinem Grundpegel. */
  setzeBus(name, wert) {
    if (!BUSSE.includes(name)) return this;
    this.#busPegel[name] = Math.max(0, Math.min(1.5, Number(wert) || 0));
    this.#wendeBusAn(name);
    return this;
  }

  #wendeAusgangAn() {
    if (this.#ausgang) this.#ausgang.gain.value = this.#aktiv ? this.#lautstaerke : 0;
  }

  #wendeBusAn(name) {
    const bus = this.#graph?.busse?.[name];
    if (bus) bus.gain.value = this.#busPegel[name] * (this.#graph.grundpegel?.[name] ?? 1);
  }

  /**
   * Öffnet den AudioContext (muss aus einer Nutzergeste kommen; sonst bleibt er gesperrt).
   * Gibt der Browser keinen Context her, bleibt der Mischer stumm, ohne zu scheitern.
   *
   * @returns {Promise<boolean>} ob ein Context bereitsteht
   */
  async starte() {
    if (!this.#an) return false;
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') await this.#ctx.resume();
      return true;
    }

    const bauer = this.#ctxBauer
      ?? (typeof globalThis.AudioContext !== 'undefined'
        ? () => new globalThis.AudioContext()
        : null);
    if (!bauer) return false;

    try {
      this.#ctx = bauer();
      this.#graph = baueKlangGraph(this.#ctx, {
        lautstaerke: this.#aktiv ? this.#lautstaerke : 0, zufall: this.#zufall,
      });
      this.#ausgang = this.#graph.ausgang;
      this.#limiter = this.#graph.eingang;
      for (const b of BUSSE) this.#wendeBusAn(b);
      if (this.#ctx.state === 'suspended') await this.#ctx.resume();
      return true;
    } catch {
      this.#ctx = null;
      this.#graph = null;
      this.#ausgang = null;
      this.#limiter = null;
      return false;
    }
  }

  /* ------------------------------------------------------------ Kern */

  #zaehleEreignis(art) {
    this.#ereignisse[art] = (this.#ereignisse[art] ?? 0) + 1;
  }

  /**
   * Prüft Schalter und Context; zählt Ereignis, Stummschaltung bzw. fehlenden Context.
   * @returns {boolean} ob ein Klang entstehen kann
   */
  #bereitFuer(art) {
    if (!this.#an) {
      this.#stumm += 1;
      return false;
    }
    this.#zaehleEreignis(art);
    if (!this.#ctx) {
      this.#ohneKontext += 1;
      return false;
    }
    return true;
  }

  /**
   * Spielt ein benanntes Profil.
   * @param {string} profilName Schlüssel in `ALLE_PROFILE`
   * @param {object} opt `{zaehler, x, y, pegel, tonhoehe, laufzeit, verzoegerung, kategorie}`
   */
  #spiele(profilName, {
    zaehler, x, y, pegel = 1, tonhoehe = 1, laufzeit = false, verzoegerung = 0, kategorie = null,
  } = {}) {
    const profil = ALLE_PROFILE[profilName];
    if (!profil || !this.#graph) return false;
    const hoerer = this.#hoerer?.() ?? null;
    const r = raeumlich(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null, hoerer);
    const jetzt = this.#ctx.currentTime;
    const zeit = jetzt + verzoegerung + (laufzeit ? r.verzoegerung : 0);
    const stimme = spieleProfil(this.#graph, profil, {
      zeit, pegel: pegel * r.pegel, pan: r.pan, tiefpass: r.tiefpass, tonhoehe,
    });
    this.#verwalter.melde({ start: zeit, ende: stimme.ende, kappen: stimme.kappen }, jetzt);
    this.#gezaehlt[zaehler] += 1;
    this.#profile[profilName] = (this.#profile[profilName] ?? 0) + 1;
    if (kategorie) this.#kategorien[kategorie] = (this.#kategorien[kategorie] ?? 0) + 1;
    this.#letzte = {
      art: zaehler, profil: profilName, kategorie, x: x ?? null, y: y ?? null,
      pegel: Number((pegel * r.pegel).toFixed(3)), pan: Number(r.pan.toFixed(3)), start: zeit,
    };
    return true;
  }

  /* ------------------------------------------------------------ Klänge */

  /**
   * Ein Einschlag mit Sprengwirkung.
   * @param {object} optionen
   * @param {number} [optionen.groesse] - alte Skala 0,6 bis 1,6 (wenn kein Radius angegeben)
   * @param {number} [optionen.radius] - Sprengradius in Weltpixeln
   * @param {string} [optionen.material] - `erde` | `fels` | `wasser`
   * @param {string|null} [optionen.stoff] - Schlüssel der Stoffkarte am Einschlag; `metall` klingt nach Metall
   */
  spieleExplosion({ groesse = 1, radius = null, material = 'erde', stoff = null, x, y, pegel = 1 } = {}) {
    if (!this.#bereitFuer('explosion')) return false;
    const r = radius ?? ((Math.max(0.6, groesse) - 0.6) * 12) ** 2;
    const jetzt = this.#uhr();
    const letzte = this.#letzteExplosion;
    if (letzte && jetzt - letzte.t < FENSTER_EXPLOSION && Number.isFinite(x) && Number.isFinite(letzte.x)
      && Math.hypot(x - letzte.x, y - letzte.y) < 70) {
      this.#zusammengefasst += 1;
      return false;
    }
    this.#letzteExplosion = { t: jetzt, x, y };
    const wasser = material === 'wasser';
    const ok = this.#spiele(einschlagProfil({ radius: r > 0 ? r : 12, material, stoff }), {
      zaehler: wasser ? 'wasser' : 'explosion', x, y, pegel, laufzeit: true,
    });
    if (ok && !wasser) this.#meldeLaut('explosion');
    return ok;
  }

  /** Ein Einschlag ohne Sprengwirkung (Geschoss in Erde, Fels oder Wasser). */
  spieleEinschlag({ material = 'erde', stoff = null, x, y, pegel = 1 } = {}) {
    if (!this.#bereitFuer('einschlag')) return false;
    const wasser = material === 'wasser';
    return this.#spiele(einschlagProfil({ radius: 0, material, stoff }), {
      zaehler: wasser ? 'wasser' : 'einschlag', x, y, pegel, laufzeit: true,
    });
  }

  /** Wasser-Platscher (Figur fällt hinein, Explosion im Wasser). */
  spielePlatscher({ gross = false, x, y } = {}) {
    if (!this.#bereitFuer('wasser')) return false;
    return this.#spiele(gross ? 'platscher_gross' : 'platscher_klein', {
      zaehler: 'wasser', x, y, laufzeit: true,
    });
  }

  /** Donner zum Vorzeichen von Valhalla (zwei Raben im Blitz). */
  spieleDonner() {
    if (!this.#bereitFuer('donner')) return false;
    donner(this.#ctx, this.#graph.rauschen, { lautstaerke: 0.9, ziel: this.#graph.busse.umgebung });
    this.#gezaehlt.donner += 1;
    return true;
  }

  /**
   * Ein Abschuss.
   * @param {number|object} [arg] Zahl = Tonhöhe (alt); Objekt: `{waffe|weaponId|profil, x, y, tonhoehe, playerId}`
   */
  spieleSchuss(arg = 1) {
    const opt = typeof arg === 'object' && arg !== null ? arg : { tonhoehe: Number(arg) || 1 };
    if (!this.#bereitFuer('schuss')) return false;
    const waffe = opt.waffe ?? (opt.weaponId ? getWeapon(opt.weaponId) : null);
    const name = opt.profil ?? (waffe ? schussProfilFuer(waffe) : 'pistole');
    if (opt.playerId !== undefined && opt.playerId !== null) {
      const jetzt = this.#uhr();
      const davor = this.#letzterSchuss.get(opt.playerId);
      if (davor !== undefined && jetzt - davor < FENSTER_SCHUSS) {
        this.#zusammengefasst += 1;
        return false;
      }
      this.#letzterSchuss.set(opt.playerId, jetzt);
    }
    return this.#spiele(name, {
      zaehler: 'schuss', x: opt.x, y: opt.y, tonhoehe: opt.tonhoehe ?? 1,
      kategorie: waffe?.category ?? opt.kategorie ?? null,
    });
  }

  /**
   * Ein Treffer an einer Figur.
   * @param {number} [haerte] - 0,5 weich bis 1,5 hart (alt)
   * @param {object} [opt] `{schaden, maxHealth, kritisch, selbst, x, y, verzoegerung}`
   */
  spieleTreffer(haerte = 1, opt = {}) {
    if (!this.#bereitFuer('treffer')) return false;
    const jetzt = this.#uhr();
    if (jetzt - this.#trefferFenster.t > FENSTER_TREFFER) this.#trefferFenster = { t: jetzt, n: 0 };
    this.#trefferFenster.n += 1;
    if (this.#trefferFenster.n > MAX_TREFFER_IM_FENSTER) {
      this.#zusammengefasst += 1;
      return false;
    }
    const schaden = opt.schaden ?? haerte * 25;
    const name = trefferProfil({
      schaden, maxHealth: opt.maxHealth ?? 100, kritisch: opt.kritisch, selbst: opt.selbst,
    });
    const ok = this.#spiele(name, {
      zaehler: 'treffer', x: opt.x, y: opt.y, verzoegerung: opt.verzoegerung ?? 0,
      pegel: this.#trefferFenster.n > 1 ? 0.7 : 1,
    });
    if (ok) this.#meldeLaut('treffer');
    return ok;
  }

  /** Einfache Ereignisklänge ohne eigene Regeln: Landung, Tod, Kiste, Trümmer, Oberfläche. */
  #einfach(art, zaehler, profil, opt = {}) {
    if (!this.#bereitFuer(art)) return false;
    return this.#spiele(profil, { zaehler, ...opt });
  }

  /**
   * Übersetzt ein Spielereignis in einen Klang.
   *
   *   `explosion`    → Einschlag nach Radius und Material (`sprengradius` 0 = Geschoss ohne Sprengsatz)
   *   `shot`         → Abschuss nach Waffe (`weaponId`)
   *   `damage`       → Treffer
   *   `landed`/`aufprall`/`tod`/`kiste`/`truemmer`/`insel_gelandet`/`platscher`
   *   `waffenwechsel`/`bereit`/`ticken` → Oberfläche und Umgebung
   *   `heilung`/`einfrieren`/`schild`/`heranziehen`/`geschuetz` → Wirkung auf Figuren und Geschütze
   *
   * @param {object} ereignis - mit `type`, optional `x`, `y`
   * @returns {boolean} ob ein Klang erzeugt wurde
   */
  verarbeite(ereignis) {
    if (!ereignis?.type) return false;
    const { x, y } = ereignis;

    switch (ereignis.type) {
      case 'explosion': {
        const radius = Number(ereignis.radius ?? 40);
        const roh = Number(ereignis.sprengradius ?? radius);
        if (roh <= 0) return this.spieleEinschlag({ material: ereignis.material, stoff: ereignis.stoff, x, y });
        const groesse = Math.max(0.6, Math.min(1.6, 0.6 + Math.sqrt(radius) / 12));
        return this.spieleExplosion({ groesse, radius, material: ereignis.material, stoff: ereignis.stoff, x, y });
      }
      case 'valhalla_omen':
        return this.spieleDonner();
      case 'shot':
        return this.spieleSchuss({
          weaponId: ereignis.weaponId, playerId: ereignis.playerId, x, y,
          tonhoehe: Number(ereignis.tonhoehe ?? 1),
        });
      case 'damage':
        return this.spieleTreffer(Number(ereignis.haerte ?? 1), {
          schaden: ereignis.schaden, maxHealth: ereignis.maxHealth, kritisch: ereignis.kritisch,
          selbst: ereignis.selbst, x, y, verzoegerung: ereignis.verzoegerung,
        });
      case 'platscher':
        return this.spielePlatscher({ gross: Boolean(ereignis.gross), x, y });
      case 'landed':
        return this.#einfach('landung', 'landung', 'landung_figur', { x, y });
      case 'aufprall':
        return this.#einfach('landung', 'landung', 'aufprall_hart', {
          x, y, pegel: Math.min(1.2, 0.6 + Number(ereignis.staerke ?? 0.4)),
        });
      case 'insel_gelandet':
        return this.#einfach('landung', 'landung', 'landung_insel', { x, y, laufzeit: true });
      case 'truemmer':
        return this.#einfach('truemmer', 'truemmer', 'truemmer', { x, y, laufzeit: true });
      case 'tod':
        return this.#einfach('tod', 'tod', 'tod', { x, y });
      case 'kiste':
        return this.#einfach('kiste', 'kiste', 'kiste', { x, y });
      case 'bellen':
      case 'winseln':
      case 'schnurren':
      case 'fressen':
      case 'miau_leise':
      case 'miau_laut':
      case 'miau_wut':
      case 'schockwelle':
        // Tier-NPCs: der Pegel kommt vom Ereignis (bei Cookie die Dringlichkeit).
        return this.#einfach('tier', 'tier', ereignis.type, { x, y, pegel: Number(ereignis.pegel ?? 1), laufzeit: ereignis.type === 'schockwelle' });
      case 'ticken':
        return this.#einfach('ticken', 'ticken', 'ticken', { x, y });
      case 'heilung':
      case 'einfrieren':
      case 'schild':
      case 'heranziehen':
      case 'geschuetz':
      case 'lava_grollen':
      case 'flammen':
      case 'zischen':
        // Wirkungen auf Figuren und Geschütze: ein Klang je Wirkung, Profil gleichnamig.
        return this.#einfach(ereignis.type, 'wirkung', ereignis.type, { x, y });
      case 'waffenwechsel':
        return this.#einfach('waffenwechsel', 'ui', 'waffenwechsel');
      case 'bereit':
        return this.#einfach('bereit', 'ui', 'bereit');
      default:
        return false;
    }
  }
}

export default SoundMixer;
