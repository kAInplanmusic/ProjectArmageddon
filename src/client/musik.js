/**
 * Hintergrundmusik — Wiedergabe, Überblendung, Ducken, Zustand.
 *
 * ## Aufbau
 *
 * ```
 *  <audio> A ──► Gain A ─┐
 *                        ├─► Ducken ─► Musik-Lautstärke ─► Limiter des SoundMixers ─► Ausgabe
 *  <audio> B ──► Gain B ─┘
 * ```
 *
 * Zwei `HTMLAudioElement` wechseln sich ab (ein Stück läuft aus, das nächste
 * ein). Die Elemente STREAMEN (`preload = 'none'`, Quelle erst beim Einsatz):
 * Es wird nie die ganze Bibliothek geladen, nur das gerade gespielte Stück.
 * Über `MediaElementAudioSourceNode` hängen sie am AudioContext des
 * `SoundMixer`, laufen also durch denselben Limiter wie die Effekte, haben aber
 * einen EIGENEN Lautstärkeknoten („Musik" getrennt von „Effekte").
 *
 * ## Regeln
 *
 *  - **Autoplay:** Der Start passiert erst in `freigeben()`, und das wird aus
 *    einer Nutzergeste gerufen (Taste, Klick, Tippen) — gemeinsam mit der
 *    Freigabe des Mischers. Davor ist alles Zustand, kein Ton.
 *  - **Stimmung:** `menu` oder `match`. Beim Wechsel wird zu einem Stück der
 *    neuen Stimmung übergeblendet (2 s). Im Match mischt die Wiedergabe ohne
 *    direkte Wiederholung (`musikListe.js`).
 *  - **Ducken:** Bei Einschlägen sinkt die Musik für ~0,4 s um 6 dB.
 *  - **Tab versteckt:** Pause; beim Zurückkehren geht es weiter.
 *  - **Fehler:** Lädt ein Stück nicht, wird es still übersprungen. Nach einer
 *    Runde ohne Erfolg gibt die Musik auf (kein Endlos-Versuch). Nach außen
 *    wirft nichts.
 *  - **Aus in Tests:** `navigator.webdriver` oder `?musik=0` schalten die
 *    WIEDERGABE ab (`aktiv = false`); Schalter, Regler und Zustand arbeiten
 *    weiter, damit sie testbar sind. `?musik=1` erzwingt die Wiedergabe.
 *
 * Reine Darstellung: nichts hiervon berührt Engine, Seed oder Replay.
 *
 * @module musik
 */

import { begrenze } from './mathe.js';
import { pruefeManifest, stueckeFuer, waehleNaechstes, hymnenStueck } from './musikListe.js';

export const MUSIK_SCHLUESSEL = 'pa.musik.v1';
export const STANDARD_LAUTSTAERKE = 0.35;
/** Dauer der Überblendung in Sekunden. */
export const UEBERBLENDUNG_S = 2;
/** Ducken: Faktor (0,5 = −6 dB), Haltezeit und Rückkehr in Sekunden. */
export const DUCK_FAKTOR = 0.5;
export const DUCK_HALTEN_S = 0.4;
export const DUCK_ERHOLUNG_S = 0.35;

/**
 * Ist die Wiedergabe erlaubt?
 * `?musik=0` aus, `?musik=1` an (erzwungen), sonst aus bei `navigator.webdriver`.
 * @param {{suche?: string, webdriver?: boolean}} umgebung
 * @returns {boolean}
 */
export function wiedergabeErlaubt({ suche = '', webdriver = false } = {}) {
  let wert = null;
  try { wert = new URLSearchParams(suche).get('musik'); } catch { /* ignorieren */ }
  if (wert === '0' || wert === 'aus') return false;
  if (wert === '1' || wert === 'an') return true;
  return !webdriver;
}

/** Speicher mit try/catch — ohne localStorage läuft alles weiter. */
function standardSpeicher() {
  return {
    lies() {
      try { return globalThis.localStorage?.getItem(MUSIK_SCHLUESSEL) ?? null; } catch { return null; }
    },
    schreibe(text) {
      try { globalThis.localStorage?.setItem(MUSIK_SCHLUESSEL, text); } catch { /* ignorieren */ }
    },
  };
}

export class Musik {
  #manifest;
  #urls;
  #mischer;
  #speicher;
  #aktiv;
  #audioBauer;
  #zufall;
  #setTimeout;
  #hymnen;
  #hymnenNamen;
  #hymne = null;

  #an = true;
  #lautstaerke = STANDARD_LAUTSTAERKE;
  #stimmung = 'menu';
  #aktuell = null;
  #letzteId = null;
  #runde = [];
  #verlauf = [];
  #slots = [];
  #aktuellerSlot = -1;
  #bus = null;
  #gestartet = false;
  #versteckt = false;
  #aufgegeben = false;
  #fehlversuche = 0;
  #zaehler = { ueberblendungen: 0, ducken: 0, fehler: 0, starts: 0 };
  #hoerer = new Set();

  /**
   * @param {object} optionen
   * @param {{stuecke: object[]}} optionen.manifest
   * @param {Record<string,string>} optionen.urls - Dateiname → URL (aus `import.meta.glob`)
   * @param {import('./soundMixer.js').SoundMixer} optionen.mischer
   * @param {boolean} [optionen.aktiv] - false = keine Wiedergabe (Tests/Headless)
   * @param {{lies: Function, schreibe: Function}} [optionen.speicher]
   * @param {Function} [optionen.audioBauer] - liefert ein Audio-Element
   * @param {() => number} [optionen.zufall]
   * @param {{fraktionen: object}} [optionen.hymnen] - Hymnen-Manifest (Fraktions-ID → Datei)
   * @param {Record<string,string>} [optionen.hymnenNamen] - Fraktions-ID → Anzeigename
   */
  constructor({
    manifest, urls = {}, mischer, aktiv = true, speicher = null, audioBauer = null,
    zufall = Math.random, setTimeoutFn = null, hymnen = null, hymnenNamen = {},
  }) {
    this.#manifest = manifest;
    this.#urls = urls;
    this.#mischer = mischer;
    this.#speicher = speicher ?? standardSpeicher();
    this.#audioBauer = audioBauer ?? (() => new globalThis.Audio());
    this.#zufall = zufall;
    this.#hymnen = hymnen;
    this.#hymnenNamen = hymnenNamen;
    this.#setTimeout = setTimeoutFn ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.#aktiv = Boolean(aktiv) && pruefeManifest(manifest).length === 0;
    this.#ladeZustand();
  }

  /* ------------------------------------------------------------ Zustand */

  get an() { return this.#an; }
  get lautstaerke() { return this.#lautstaerke; }
  get aktiv() { return this.#aktiv; }
  get titel() { return this.#aktuell?.titel ?? ''; }

  /** Momentaufnahme für Anzeige, Debug-API und Tests. */
  get zustand() {
    const slot = this.#slots[this.#aktuellerSlot];
    return {
      aktiv: this.#aktiv,
      an: this.#an,
      lautstaerke: this.#lautstaerke,
      stimmung: this.#stimmung,
      hymne: this.#hymne,
      id: this.#aktuell?.id ?? null,
      titel: this.titel,
      gestartet: this.#gestartet,
      spielt: Boolean(slot && !slot.el.paused && this.#an),
      aufgegeben: this.#aufgegeben,
      verlauf: [...this.#verlauf],
      ...this.#zaehler,
    };
  }

  /** Meldet jede Zustandsänderung (Anzeige synchron halten). Gibt „abmelden" zurück. */
  beiAenderung(fn) {
    this.#hoerer.add(fn);
    return () => this.#hoerer.delete(fn);
  }

  #melde() {
    for (const fn of this.#hoerer) {
      try { fn(this.zustand); } catch { /* Anzeigefehler dürfen die Musik nicht stören. */ }
    }
  }

  #ladeZustand() {
    try {
      const roh = this.#speicher.lies();
      if (!roh) return;
      const d = JSON.parse(roh);
      if (typeof d?.an === 'boolean') this.#an = d.an;
      if (d?.lautstaerke !== undefined && Number.isFinite(Number(d.lautstaerke))) {
        this.#lautstaerke = begrenze(d.lautstaerke, 0, 1);
      }
    } catch { /* kaputter Eintrag: Standardwerte */ }
  }

  #speichere() {
    try {
      this.#speicher.schreibe(JSON.stringify({ an: this.#an, lautstaerke: this.#lautstaerke }));
    } catch { /* ignorieren */ }
  }

  /* ----------------------------------------------------------- Bedienung */

  /** Musik ein-/ausschalten. */
  setzeAn(an) {
    const neu = Boolean(an);
    if (neu === this.#an) return this;
    this.#an = neu;
    this.#speichere();
    if (neu) { this.#aufgegeben = false; this.#fehlversuche = 0; }
    this.#sicher(() => {
      if (!this.#gestartet) return;
      if (!neu) this.#pausiere(0.25);
      else this.#setzeFort();
    });
    this.#melde();
    return this;
  }

  /** Taste M. */
  schalte() { return this.setzeAn(!this.#an); }

  /** Lautstärke 0..1. */
  setzeLautstaerke(wert) {
    this.#lautstaerke = begrenze(wert, 0, 1);
    this.#speichere();
    this.#sicher(() => {
      if (this.#bus) this.#rampe(this.#bus.lautstaerke.gain, this.#lautstaerke, 0.05);
    });
    this.#melde();
    return this;
  }

  /** Setzt die Stimmung; läuft Musik, wird zu einem passenden Stück übergeblendet. */
  setzeStimmung(stimmung) {
    if (stimmung === this.#stimmung && this.#aktuell) return this;
    this.#stimmung = stimmung;
    if (stimmung !== 'menu') this.#hymne = null; // Match-Start: Hymne klingt über das Stück der neuen Stimmung aus
    this.#sicher(() => {
      if (this.#gestartet && this.#an && !this.#versteckt) this.#spieleNaechstes();
    });
    this.#melde();
    return this;
  }

  /**
   * Fraktionshymne im Menü: spielt die Hymne der angewählten Fraktion (nur
   * eine zugleich, Überblendung wie bei Stücken) oder `null` = zurück zur
   * normalen Menümusik. Unbekannte IDs zählen als `null`. Folgt Schalter und
   * Regler der Musik (läuft über denselben Bus). Lädt nur die gewählte Datei.
   * @param {string|null} id - Fraktions-ID
   */
  setzeHymne(id) {
    const neu = id && hymnenStueck(this.#hymnen, id, this.#hymnenNamen[id] ?? id) ? id : null;
    if (neu === this.#hymne) return this;
    this.#hymne = neu;
    this.#sicher(() => {
      if (this.#gestartet && this.#an && !this.#versteckt && this.#stimmung === 'menu') this.#spieleNaechstes();
    });
    this.#melde();
    return this;
  }

  /**
   * Gibt die Wiedergabe frei. Muss aus einer Nutzergeste gerufen werden
   * (Taste/Klick/Tippen); mehrfaches Rufen ist unschädlich.
   * @returns {Promise<boolean>} ob die Musik jetzt bereitsteht
   */
  async freigeben() {
    if (!this.#aktiv) return false;
    if (this.#gestartet) return true;
    try {
      const ok = await this.#mischer?.starte?.();
      const anschluss = ok ? this.#mischer.musikAnschluss?.() : null;
      if (!anschluss) return false;
      this.#baueBus(anschluss);
      this.#gestartet = true;
      if (this.#an && !this.#versteckt) this.#spieleNaechstes();
      this.#melde();
      return true;
    } catch {
      return false;
    }
  }

  /** Kurz ducken (Einschlag/Treffer). */
  ducken() {
    this.#sicher(() => {
      if (!this.#bus || !this.#an) return;
      const { ctx, ducken } = this.#bus;
      const t = ctx.currentTime;
      const g = ducken.gain;
      g.cancelScheduledValues?.(t);
      g.setValueAtTime?.(g.value, t);
      g.linearRampToValueAtTime?.(DUCK_FAKTOR, t + 0.03);
      g.setValueAtTime?.(DUCK_FAKTOR, t + 0.03 + DUCK_HALTEN_S);
      g.linearRampToValueAtTime?.(1, t + 0.03 + DUCK_HALTEN_S + DUCK_ERHOLUNG_S);
      this.#zaehler.ducken += 1;
    });
  }

  /** Tab-Sichtbarkeit: versteckt = Pause. */
  setzeVersteckt(versteckt) {
    const neu = Boolean(versteckt);
    if (neu === this.#versteckt) return;
    this.#versteckt = neu;
    this.#sicher(() => {
      if (!this.#gestartet || !this.#an) return;
      if (neu) this.#pausiere(0);
      else this.#setzeFort();
    });
    this.#melde();
  }

  /* ------------------------------------------------------- Innenleben */

  #sicher(fn) {
    try { fn(); } catch { this.#zaehler.fehler += 1; }
  }

  #baueBus({ ctx, ziel }) {
    const lautstaerke = ctx.createGain();
    lautstaerke.gain.value = this.#lautstaerke;
    const ducken = ctx.createGain();
    ducken.gain.value = 1;
    ducken.connect(lautstaerke);
    lautstaerke.connect(ziel);
    this.#bus = { ctx, lautstaerke, ducken };
  }

  /** Legt beim ersten Bedarf Element + Knoten für einen Slot an. */
  #slot(index) {
    if (this.#slots[index]) return this.#slots[index];
    const { ctx, ducken } = this.#bus;
    const el = this.#audioBauer();
    el.preload = 'none';
    el.loop = false;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const quelle = ctx.createMediaElementSource(el);
    quelle.connect(gain);
    gain.connect(ducken);
    const slot = { el, gain, quelle, belegung: 0, stueck: null };
    el.addEventListener('timeupdate', () => this.#beiZeit(index));
    el.addEventListener('ended', () => this.#beiEnde(index));
    el.addEventListener('error', () => this.#beiFehler(index));
    el.addEventListener('playing', () => { this.#fehlversuche = 0; });
    this.#slots[index] = slot;
    return slot;
  }

  #rampe(param, ziel, sekunden) {
    const t = this.#bus.ctx.currentTime;
    param.cancelScheduledValues?.(t);
    param.setValueAtTime?.(param.value, t);
    param.linearRampToValueAtTime?.(ziel, t + sekunden);
    if (!param.linearRampToValueAtTime) param.value = ziel;
  }

  #urlFuer(stueck) {
    return this.#urls[stueck.datei] ?? null;
  }

  /** Wählt das nächste Stück der Stimmung und blendet dorthin über. */
  #spieleNaechstes() {
    if (!this.#aktiv || !this.#bus || this.#aufgegeben) return;
    if (this.#hymne && this.#stimmung === 'menu') {
      const h = hymnenStueck(this.#hymnen, this.#hymne, this.#hymnenNamen[this.#hymne] ?? this.#hymne);
      if (h) { this.#starteStueck(h); return; }
    }
    const kandidaten = stueckeFuer(this.#manifest, this.#stimmung);
    let runde = this.#runde.filter(id => kandidaten.some(k => k.id === id));
    if (runde.length >= kandidaten.length) runde = [];
    const stueck = waehleNaechstes(kandidaten, this.#letzteId, runde, this.#zufall);
    if (!stueck) return;
    this.#runde = [...runde, stueck.id];
    this.#starteStueck(stueck);
  }

  #starteStueck(stueck) {
    const url = this.#urlFuer(stueck);
    const alt = this.#slots[this.#aktuellerSlot] ?? null;
    const index = this.#aktuellerSlot === 0 ? 1 : 0;
    if (!url) { this.#ueberspringe(stueck); return; }

    const slot = this.#slot(index);
    slot.belegung += 1;
    const belegung = slot.belegung;
    slot.stueck = stueck;
    slot.el.src = url;
    slot.el.currentTime = 0;
    this.#aktuell = stueck;
    this.#letzteId = stueck.id;
    this.#aktuellerSlot = index;
    this.#verlauf = [...this.#verlauf, stueck.id].slice(-20);
    this.#zaehler.starts += 1;

    const spiel = slot.el.play();
    if (spiel && typeof spiel.catch === 'function') {
      spiel.catch(() => {
        if (slot.belegung === belegung && this.#slots[this.#aktuellerSlot] === slot) {
          this.#beiFehler(index);
        }
      });
    }

    // Erstes Stück: kurz einblenden; sonst über 2 s überblenden.
    const dauer = alt && !alt.el.paused ? UEBERBLENDUNG_S : 0.4;
    this.#rampe(slot.gain.gain, 1, dauer);
    if (alt) {
      this.#rampe(alt.gain.gain, 0, dauer);
      this.#zaehler.ueberblendungen += 1;
      const altBelegung = alt.belegung;
      this.#setTimeout(() => {
        if (alt.belegung !== altBelegung || this.#slots[this.#aktuellerSlot] === alt) return;
        this.#sicher(() => { alt.el.pause(); });
      }, (dauer + 0.1) * 1000);
    }
    this.#melde();
  }

  #beiZeit(index) {
    if (index !== this.#aktuellerSlot) return;
    const slot = this.#slots[index];
    const dauer = Number.isFinite(slot.el.duration) && slot.el.duration > 0
      ? slot.el.duration : (slot.stueck?.dauer ?? 0);
    if (dauer > 0 && dauer - slot.el.currentTime <= UEBERBLENDUNG_S && this.#an && !this.#versteckt) {
      // Nur einmal je Stück auslösen: nach dem Wechsel ist dieser Slot nicht mehr der aktuelle.
      this.#sicher(() => this.#spieleNaechstes());
    }
  }

  #beiEnde(index) {
    if (index !== this.#aktuellerSlot) return;
    if (this.#an && !this.#versteckt) this.#sicher(() => this.#spieleNaechstes());
  }

  #beiFehler(index) {
    this.#sicher(() => {
      const slot = this.#slots[index];
      if (!slot || index !== this.#aktuellerSlot) return;
      this.#ueberspringe(slot.stueck);
    });
  }

  /** Datei lädt nicht: still weiter, nach einer vollen Runde ohne Erfolg aufgeben. */
  #ueberspringe(stueck) {
    this.#zaehler.fehler += 1;
    if (stueck?.hymne) { // Hymne lädt nicht: still zur normalen Musik zurück
      this.#hymne = null;
      this.#spieleNaechstes();
      return;
    }
    this.#fehlversuche += 1;
    const gesamt = this.#manifest.stuecke.length;
    if (this.#fehlversuche >= gesamt) {
      this.#aufgegeben = true;
      this.#aktuell = null;
      this.#melde();
      return;
    }
    // Das defekte Stück gilt für diese Runde als gespielt, damit es nicht sofort wiederkommt.
    if (stueck && !this.#runde.includes(stueck.id)) this.#runde.push(stueck.id);
    this.#spieleNaechstes();
  }

  #pausiere(ausblenden) {
    for (const slot of this.#slots) {
      if (!slot) continue;
      if (ausblenden > 0) {
        this.#rampe(slot.gain.gain, 0, ausblenden);
        const b = slot.belegung;
        this.#setTimeout(() => {
          if (slot.belegung === b && (!this.#an || this.#versteckt)) this.#sicher(() => slot.el.pause());
        }, ausblenden * 1000 + 30);
      } else {
        slot.el.pause();
      }
    }
  }

  #setzeFort() {
    const slot = this.#slots[this.#aktuellerSlot];
    const passt = slot?.stueck
      && (slot.stueck.hymne ? slot.stueck.hymne === this.#hymne : true)
      && (slot.stueck.hymne || stueckeFuer(this.#manifest, this.#stimmung).some(s => s.id === slot.stueck.id));
    if (!passt) { this.#spieleNaechstes(); return; }
    slot.belegung += 1;
    const p = slot.el.play();
    if (p && typeof p.catch === 'function') p.catch(() => this.#beiFehler(this.#aktuellerSlot));
    this.#rampe(slot.gain.gain, 1, 0.4);
    this.#melde();
  }
}

export default Musik;
