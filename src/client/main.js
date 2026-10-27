/**
 * Browser-Einstiegspunkt für Project Armageddon.
 *
 * Zwei Betriebsarten teilen sich Rendering, HUD und Eingabe:
 *  - Lokal: die Simulation läuft im Browser (MatchController).
 *  - Online: der Server ist autoritativ; der Client rendert Snapshots und
 *    sendet nur Eingabewünsche.
 *
 * Die Simulation läuft lokal mit fester Zeitschrittweite (60 Hz), das Rendering
 * folgt der Bildwiederholrate. Ereignisse werden einmalig in Rendering, HUD und
 * Protokoll gespiegelt.
 *
 * @module main
 */
import { MALI_LEITUNGSMARKE, maskeZuMali } from '../shared/config/schaden.js';
import { isTextEntry } from './dom.js';
import { haerteAusTreffer } from './gefuehl.js';
import { MatchController, TEAM_COLORS } from '../engine/match.js';
import { Renderer } from './renderer.js';
import { Camera, ZOOM_GRENZEN } from './camera.js';
import { KameraRegie } from './kameraRegie.js';
import { KameraSteuerung } from './kameraSteuerung.js';
import { InputController, kraftAusLadung, MIN_KRAFT, MAX_KRAFT } from './input.js';
import { Hud } from './hud.js';
import { zeigeToast } from './toasts.js';
import { WaffenMenue } from './waffenMenue.js';
import { NetworkClient, CONNECTION_STATE } from './networkClient.js';
import { applyCraterToTerrain, applyInsetToTerrain, applyLogEntryToTerrain, applySettleToTerrain, applyRemoveToTerrain, applyAddToTerrain, applySlumpToTerrain, bewerteTerrainHash, buildTerrainForSeed, terrainQuelleFuer } from './terrainPreview.js';
import { getWeapon, orderInventoryBySubcategory } from '../shared/config/weapons.js';
import { CLASS_IDS, ARCHETYPE_IDS } from '../engine/match.js';
import { pickBackdrop, getBackdrop, BACKDROP_BIOMES } from '../shared/config/backdrops.js';
import { biomFuerCharakter, kulisseFuerBiom } from '../shared/biomwahl.js';
import { SoundMixer, tonSpeicher } from './soundMixer.js';
import { tonErlaubt } from './klangProfile.js';
import { bindeTonBedienung } from './soundBedienung.js';
import { Musik, wiedergabeErlaubt } from './musik.js';
import { bindeMusikBedienung } from './musikBedienung.js';
import { bindeGrafikBedienung } from './grafikBedienung.js';
import MUSIK_MANIFEST from './assets/music/manifest.json';
import { ladeStoffTexturen } from './stoffTexturen.js';
import { planetenBilder } from './planetenKulisse.js';
import HYMNEN_MANIFEST from './assets/music/fraktionen/manifest.json';
import { pickScenery } from '../shared/config/scenery.js';
import { NEUE_BIOME, SONDERBIOM_IDS_FASSUNG_3 as SONDERBIOM_IDS } from '../shared/config/biome-neu.js';
import { PLANET_BIOM_IDS, PLANET_WAHL } from '../shared/config/biome-planet.js';
import { GUENTHER_WHEEL, GUENTHER_FASSUNG_STANDARD } from '../shared/config/guenther.js';
import { TierHud } from './tierHud.js';
import { COOKIE_STANDARD } from '../shared/config/cookie.js';
import { FEUER_STANDARD } from '../shared/config/feuer.js';
import { BEWEGUNG_STANDARD } from '../shared/config/bewegung.js';
import { ZUGREGELN_STANDARD } from '../shared/config/zugregeln.js';
import { LaufVorhersage } from './laufVorhersage.js';
import { exposeDebugApi } from './debugApi.js';
import { verarbeiteLokal, verarbeiteOnline, EreignisDedup } from './ereignisse.js';
import { klassifiziereEinschlag, wasserAusLinie } from '../shared/einschlag.js';
import { baueProfilAnzeige, baueErfolgsAnzeige } from './profilanzeige.js';
import { FIXED_TIMESTEP } from '../shared/zeit.js';
import {
  PROFIL_SCHLUESSEL,
  geraeteKennung,
  sicherungAlsText,
  sicherungAusText,
} from '../shared/identity.js';
import { FACTIONS } from '../shared/config/factions.js';
import { bereinigeFraktionen, loeseFraktionen, KLASSISCH } from '../shared/config/darstellung.js';
import { FigurenKarte } from './figurenKarte.js';
import { HudAusweichen } from './hudAusweichen.js';
import {
  resolveLoadout,
} from '../shared/config/classes.js';
import { sidegradesForClass } from '../shared/config/sidegrades.js';
import { WATER_STATE, waterStateFor } from '../shared/config/water.js';
import { MATCH_RULES } from '../shared/config/match.js';
import { SchussAufnahme } from './schussWiederholung.js';
import { SIMULATION_HZ } from '../shared/config/network.js';

/**
 * Zugpause in Sekunden. Vorrang: URL-Parameter `?zugpause=N` (Tests/Vorführung), dann
 * `VITE_ZUGPAUSE_SEKUNDEN` (E2E-Läufe ohne Pause), sonst die Spielregel.
 */
function zugpauseSekunden() {
  const nutzbar = wert => (wert !== undefined && wert !== null && wert !== '' && Number.isFinite(Number(wert)) && Number(wert) >= 0 ? Number(wert) : null);
  let url = null;
  try { url = nutzbar(new URLSearchParams(globalThis.location?.search ?? '').get('zugpause')); } catch { /* kein Browser */ }
  return url ?? nutzbar(import.meta.env?.VITE_ZUGPAUSE_SEKUNDEN) ?? MATCH_RULES.turnPauseSeconds;
}
import { ReplayPlayer } from '../engine/replay.js';
import { ShotPredictor, predictTrajectory, launchSpeedMultiplier } from './shotPrediction.js';
import { MatchStats, PlayerProfile } from '../shared/stats.js';
import {
  kennzahlen as erfolgsKennzahlen,
  neueErfolge as neueErfolgeFuer,
  emblem,
} from '../shared/achievements.js';
import { buildRosterView, buildHilfeView, beschreibeWert } from './kaderansicht.js';

/** Schlüssel des Profils im lokalen Speicher des Browsers. */
/*
 * Der Ablageschlüssel kommt jetzt aus `shared/identity.js`.
 *
 * FUND (belegt, Audit): Er stand hier als lokale Konstante — und die Frage
 * „wo liegt der Fortschritt?" war damit im Client verstreut. Die Trennstelle
 * für die noch offene Konten-Entscheidung liegt in `identity.js`; ein Test
 * hält fest, dass es nur EINE Definition gibt.
 */

/** Reihenfolge der Schwierigkeitsstufen in der Erfolgsübersicht (leicht zuerst). */
/*
 * `TIER_REIHENFOLGE` ist ENTFERNT — die Reihenfolge stand hier wortgleich mit
 * `TIERS` aus `shared/achievements.js`. Die Erfolgsanzeige liest jetzt `TIERS`
 * (siehe `client/profilanzeige.js`, Modulkopf).
 */

const MAX_STEPS_PER_FRAME = 8;

/**
 * Musikdateien: Vite vergibt im Build gehashte URLs; hier wird Dateiname → URL
 * daraus. Nur eine Zuordnung — geladen (gestreamt) wird erst beim Abspielen.
 */
const MUSIK_URLEN = Object.fromEntries([
  ...Object.entries(import.meta.glob('./assets/music/*.mp3', { query: '?url', import: 'default', eager: true }))
    .map(([pfad, url]) => [pfad.split('/').pop(), url]),
  // Fraktionshymnen: Schlüssel `fraktionen/<datei>` (siehe musikListe.hymnenStueck).
  ...Object.entries(import.meta.glob('./assets/music/fraktionen/*.mp3', { query: '?url', import: 'default', eager: true }))
    .map(([pfad, url]) => [`fraktionen/${pfad.split('/').pop()}`, url]),
]);

/** Material-Texturen der Stoffe (Client-Optik): Name → URL, geladen beim Start. */
const STOFF_TEXTUR_URLEN = {
  // Biom-Materialien (`stoff-texturen-neu`), dann die Basisstoffe (gleiche Namen: die Basisstoffe gewinnen).
  ...Object.fromEntries(
    Object.entries(import.meta.glob('./assets/stoff-texturen-neu/*.{webp,jpg}', { query: '?url', import: 'default', eager: true }))
      .map(([pfad, url]) => [pfad.split('/').pop().replace(/\.(webp|jpg)$/, ''), url]),
  ),
  ...Object.fromEntries(
    Object.entries(import.meta.glob('./assets/stoff-texturen/*.jpg', { query: '?url', import: 'default', eager: true }))
      .map(([pfad, url]) => [pfad.split('/').pop().replace(/\.jpg$/, ''), url]),
  ),
};

/** Sprite-Atlanten der Effekte (Einschlag, Glut, Feuerring, Leuchtgeschosse): Name → URL. */
const EFFEKT_SHEET_URLEN = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/effekt-sheets/*.webp', { query: '?url', import: 'default', eager: true }))
    .map(([pfad, url]) => [pfad.split('/').pop().replace(/\.webp$/, ''), url]),
);

/** Bilder der Planeten-Kulisse (Szene und Kugeln): Name → URL; geladen erst, wenn eine Planetenkarte sie braucht. */
const PLANETEN_KULISSE_URLEN = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/planeten-kulisse/*.{webp,jpg}', { query: '?url', import: 'default', eager: true }))
    .map(([pfad, url]) => [pfad.split('/').pop().replace(/\.(webp|jpg)$/, ''), url]),
);

class Game {
  constructor() {
    planetenBilder.setzeUrls(PLANETEN_KULISSE_URLEN);
    void ladeStoffTexturen(STOFF_TEXTUR_URLEN);
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.renderer.sheets.setzeUrls(EFFEKT_SHEET_URLEN);
    this.renderer.sheets.vorladen();

    /*
     * Die Kamera zeigt einen Ausschnitt der Karte.
     *
     * Ohne sie wäre die Karte immer genau so groß wie das Fenster — auf einem
     * 4K-Fernseher sähe man die ganze Karte auf einmal, und eine größere Karte
     * bedeutete nur kleinere Figuren. Mit Kamera bleibt die Figur gleich groß
     * und die Welt wächst darüber hinaus.
     *
     * Sie folgt dem AKTIVEN Spieler: Wer am Zug ist, soll im Blick sein — auch
     * dann, wenn ein Replay läuft oder jemand anderes am Zug ist. Das ist
     * dieselbe Regel wie beim Zugwechsel, nur für die Anzeige.
     *
     * Die Maße werden beim Match-Start gesetzt (`#setzeKameraGroesse`); vorher
     * gibt es nichts zu zeigen.
     */
    this.kamera = null;
    this.hud = new Hud(document);
    this.figurenKarte = new FigurenKarte(document);
    // Hält Figuren und Schilder frei vom HUD (gemessene Ränder, siehe hudAusweichen.js).
    this.hudAusweichen = new HudAusweichen({ doc: document, canvas: this.canvas, renderer: this.renderer });
    // Kameraführung (Zugübersicht, Geschossverfolgung, Einschlag) und Spielerkontrolle (Rad, Ziehen, Taste C).
    this.kameraRegie = new KameraRegie();
    this.kameraZeit = 0;
    this.kameraSteuerung = new KameraSteuerung({
      canvas: this.canvas,
      kamera: () => this.kamera,
      regie: this.kameraRegie,
      knopf: document.getElementById('hud-kamera'),
      tastaturFrei: ev => !isTextEntry(ev.target),
    });
    // Waffenmenü: Dropdown des Besitzes (Taste E / Knopf neben der Leiste).
    this.waffenMenue = new WaffenMenue(document, {
      getFigur: () => this.#aktiveFigur(),
      onSelect: weaponId => this.selectWeaponById(weaponId),
    });
    /*
     * Der Klangmischer.
     *
     * Er erzeugt alle Klänge selbst — es gibt keine Audiodateien. Im
     * Serverbetrieb (RunPod, Hetzner) gibt es kein Ausgabegerät; dort bleibt er
     * stumm, ohne zu scheitern.
     */
    this.sound = new SoundMixer({
      aktiv: tonErlaubt({
        suche: globalThis.location?.search ?? '',
        webdriver: globalThis.navigator?.webdriver === true,
      }),
      speicher: tonSpeicher(),
    });
    // Donner nach dem Blitz der Bildkulisse (`wetterLicht.js`): verzögert nach der Entfernung des Einschlags, nur bei sichtbarem Tab.
    this.renderer.beiBlitz = (verzug) => {
      globalThis.setTimeout?.(() => { if (globalThis.document?.visibilityState !== 'hidden') this.sound?.spieleDonner(); }, Math.round(verzug * 1000));
    };
    // Hörerposition für Stereolage und Abstandsdämpfung: Mitte und halbe Breite der Kamera.
    this.sound.setzeHoerer(() => {
      const k = this.kamera;
      if (!k) return null;
      const halb = k.sichtbareBreite / 2;
      return { x: k.x + halb, y: k.y + k.sichtbareHoehe / 2, halbBreite: halb };
    });
    /*
     * Die Hintergrundmusik (src/client/musik.js). Hängt am Mischer: derselbe
     * AudioContext und Limiter, eigener Lautstärkeknoten. In Headless-Läufen
     * (navigator.webdriver) und mit `?musik=0` bleibt die Wiedergabe aus.
     */
    this.musik = new Musik({
      manifest: MUSIK_MANIFEST,
      urls: MUSIK_URLEN,
      hymnen: HYMNEN_MANIFEST,
      hymnenNamen: Object.fromEntries(FACTIONS.map(f => [f.id, f.name])),
      mischer: this.sound,
      aktiv: wiedergabeErlaubt({
        suche: globalThis.location?.search ?? '',
        webdriver: globalThis.navigator?.webdriver === true,
      }),
    });
    // Einschläge und Treffer ducken die Musik kurz (dezent, −6 dB für ~0,4 s).
    this.sound.setzeLautHandler(() => this.musik.ducken());
    this.match = null;          // lokale Simulation
    this.network = null;        // Online-Verbindung
    this.mode = 'local';
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.running = false;
    this.autoLoop = true;
    this.aim = { angle: Math.PI / 4, power: 55 };
    this.lastEvents = [];
    /**
     * Letzter bekannter Wasserzustand je Figur — für die Meldungen im Protokoll.
     * Der Zustand selbst steht im Match-State (und kommt im Online-Modus mit dem
     * Snapshot); hier wird nur der ÜBERGANG erkannt.
     */
    this.waterStates = new Map();
    /** Online: jedes Anzeige-/Klangereignis genau einmal (Schlüssel Takt+Art+Ort). */
    this.ereignisDedup = new EreignisDedup();
    this.schussAufnahme = new SchussAufnahme();
    this.zugpause = null;
    this.rueckzug = null; // Rückzugsfrist online (Wanduhr ab Ereignis `rueckzug`); lokal trägt der Engine-Zustand sie

    /**
     * Zählerstand des Mischers beim letzten geprüften Bild.
     *
     * Nötig, um einen Treffer NICHT zweimal zu hören: Der Klang zum Treffer
     * eines HITSCAN-Schusses entsteht im Ereigniszweig (`ereignisse.js`), der
     * Klang zu jedem anderen Treffer aus dem Zustand (`#spieleTrefferklang`).
     * Beide Wege zielen auf dieselbe Handlung — ohne diesen Vergleich hätte ein
     * Treffer zwei Klänge übereinander.
     *
     * Gelesen wird der ZÄHLER des Mischers (`gezaehlt.treffer`) und nicht eine
     * eigene Buchführung: Er zählt genau die erzeugten Klänge.
     */
    this.letzterTrefferklang = 0;
    this.cooldownMerker = null;

    /**
     * Vorhersage des eigenen Schusses (Online-Modus).
     *
     * Der eigene Schuss wird sofort gezeichnet, statt auf die Serverantwort zu
     * warten; ein Modul, kein Zustand des Matches. Siehe `shotPrediction.js` —
     * die Vorhersage ist rein anzeigend und verändert nichts.
     */
    this.shotPredictor = new ShotPredictor({ timeoutMs: 1000 });

    /**
     * Wiedergabe einer Aufzeichnung.
     *
     * Eine Aufzeichnung enthält nur die EINGABEN (Seed und Schüsse), nicht den
     * Verlauf. Beim Abspielen wird das Match neu gerechnet — deshalb ist eine
     * Aufzeichnung wenige Kilobyte groß, und deshalb lässt sich jede Stelle
     * anspringen.
     */
    this.replayPlayer = null;
    this.replayPlaying = false;
    /** Wiedergabegeschwindigkeit: 1 = Echtzeit. */
    this.replaySpeed = 1;

    /**
     * Kennzahlen des laufenden Matches und das fortgeschriebene Profil.
     *
     * Die Zahlen entstehen aus den EREIGNISSEN des Matches, nicht aus einer
     * zweiten Buchführung — so können sie nicht von dem abweichen, was
     * tatsächlich geschehen ist. Das Profil liegt im lokalen Speicher des
     * Browsers: Es gibt (noch) keine Konten, also bleibt es auf diesem Rechner.
     */
    this.stats = null;
    /** Wurde das laufende Match schon ins Profil verbucht? */
    this.verbucht = false;
    /** Erfolge, die in dieser Partie neu freigeschaltet wurden. */
    this.neueErfolge = [];
    /**
     * Die eigene Figur (für Kennzahlen und Sieg/Niederlage) und ALLE eigenen
     * Figuren.
     *
     * `eigenerSpielerId` bleibt der erste Platz — die Anzeige braucht einen
     * Namen für „du". `eigeneSpielerIds` trägt das ganze TEAM: Im Modus der
     * Matcharten führt ein Mensch 3–5 Einheiten, und die Kennzahlen müssen alle
     * zählen.
     */
    this.eigenerSpielerId = null;
    this.eigeneSpielerIds = [];
    this.profil = this.#ladeProfil();
    /** Anzeige-Vorhersage für das Gehen im Netzspiel (`laufVorhersage.js`). */
    this.laufVorhersage = new LaufVorhersage();

    // Touch-Aktionen (Sprung links/rechts, Abwurf): rufen dieselben Wege wie Shift+A/D und Q.
    for (const feld of ['touch-aktionen', 'touch-laufen']) document.getElementById(feld)?.addEventListener('click', ereignis => {
      const aktion = ereignis.target?.closest?.('button')?.dataset?.aktion;
      if (aktion === 'sprung-links') this.jump(-1);
      else if (aktion === 'sprung-rechts') this.jump(1);
      else if (aktion === 'salto') this.jump(-this.input.blickrichtung, true);
      else if (aktion === 'passen') this.ueberspringeZug();
      else if (aktion === 'abwurf') this.dropWeapon(this.#activeDisplayPosition());
    });
    // FEUER-Knopf: Halten lädt auf, Loslassen schießt — wie Leertaste/Maus auf dem Spielfeld.
    const feuerKnopf = document.getElementById('hud-fire');
    if (feuerKnopf) {
      feuerKnopf.addEventListener('pointerdown', ereignis => {
        if (ereignis.button !== 0) return;
        ereignis.preventDefault();
        feuerKnopf.setPointerCapture?.(ereignis.pointerId);
        this.input.ladenStarten();
      });
      const loslassen = () => this.input.ladenLoslassen();
      feuerKnopf.addEventListener('pointerup', loslassen);
      feuerKnopf.addEventListener('pointercancel', () => { if (this.input.isCharging) this.input.ladenLoslassen(); });
      feuerKnopf.addEventListener('keydown', ereignis => {
        if ((ereignis.key === 'Enter' || ereignis.key === ' ') && !ereignis.repeat) { ereignis.preventDefault(); ereignis.stopPropagation(); this.input.ladenStarten(); }
      });
      feuerKnopf.addEventListener('keyup', ereignis => {
        if (ereignis.key === 'Enter' || ereignis.key === ' ') { ereignis.preventDefault(); ereignis.stopPropagation(); loslassen(); }
      });
    }
    // Laufen per Touch: gehaltene Knöpfe (Hochformat) — dieselbe Absicht wie A/D.
    const laufKnoepfe = document.getElementById('touch-laufen');
    const laufStopp = () => this.input?.setzeLaufen(0);
    laufKnoepfe?.addEventListener('pointerdown', ereignis => {
      const knopf = ereignis.target?.closest?.('button');
      const richtung = knopf?.dataset?.laufen === 'links' ? -1 : knopf?.dataset?.laufen === 'rechts' ? 1 : 0;
      if (!richtung || ereignis.button !== 0) return;
      ereignis.preventDefault();
      try { knopf.setPointerCapture?.(ereignis.pointerId); } catch { /* Zeiger schon weg: der Stopp kommt über pointerup/-cancel */ }
      this.input.setzeLaufen(richtung);
    });
    laufKnoepfe?.addEventListener('pointerup', laufStopp);
    laufKnoepfe?.addEventListener('pointercancel', laufStopp);
    this.input = new InputController(this.canvas, {
      getOrigin: () => this.#origin(),
      onAim: (angle, power) => { this.aim = { angle, power }; },
      // Die Kraft kommt AUS dem Aufladen (`InputController#releaseCharge`) —
      // sie wird dort gelesen, bevor das Laden endet. Enter ruft `fire()` ohne
      // Argument und schießt mit der eingestellten Kraft (`this.aim.power`).
      onFire: kraft => this.fire(kraft),
      onWeaponSelect: index => this.selectWeapon(index),
      // Aktive Waffe abwerfen (Q).
      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
      // Waffenmenü ein-/ausblenden (E).
      onWeaponMenu: () => this.waffenMenue.toggle(),
      // Springen (SHIFT), mit A/D als Richtung. NICHT die Leertaste — die lädt
      // den Schuss auf (siehe `input.js`).
      onJump: (seitlich, salto) => this.jump(seitlich, salto),
      // Gehen (A/D, Pfeile links/rechts, Touch-Knöpfe): Absicht −1/0/1, solange die Taste gehalten wird erneuert.
      onWalk: richtung => this.walk(richtung),
      // Zug überspringen (P).
      onSkipTurn: () => this.ueberspringeZug(),
    });

    this.#bindMenu();
    this.#bindeMusik();
    this.#bindeTon();
    // Grafikstufe (Lite/Ultra): Gerätewahl, gilt für alle Renderer-Grenzen (`this.grafik.grenzen`).
    this.grafik = bindeGrafikBedienung(document, (g) => { this.grafik = g; this.renderer.partikelDichte = g.grenzen.partikelDichte; });
    this.renderer.partikelDichte = this.grafik.grenzen.partikelDichte;
    this.#exposeDebugApi();
  }

  /**
   * Musik: Bedienelemente, Stimmung (Menü ↔ Match), Nutzergeste, Tab-Sichtbarkeit.
   * Die Stimmung folgt dem `hidden` des Menüs — ein Beobachter statt Eingriffen
   * an jedem Startpfad (lokal, online, Replay, Abbruch, Revanche).
   */
  #bindeMusik() {
    bindeMusikBedienung(document, this.musik);
    const stimmung = () => this.musik.setzeStimmung(this.menuOverlay.hidden ? 'match' : 'menu');
    new MutationObserver(stimmung).observe(this.menuOverlay, { attributes: true, attributeFilter: ['hidden'] });
    stimmung();
    // Autoplay-Regel: Start erst nach einer Geste (Tasten stehen im keydown-Hörer unten).
    for (const art of ['pointerup', 'touchend', 'click']) {
      window.addEventListener(art, () => { void this.musik.freigeben(); }, { passive: true });
    }
    /*
     * Fraktionshymne: Wählt der Spieler im Menü eine Fraktion an, spielt deren
     * Hymne; „Automatisch/Klassisch" oder das Verlassen des Menüs beenden sie.
     * Ein delegierter Hörer, weil `fillFraktionOptions` die Felder neu baut.
     */
    document.getElementById('fraktion-felder')?.addEventListener('change', event => {
      const wert = event.target?.value ?? '';
      this.musik.setzeHymne(FACTIONS.some(f => f.id === wert) ? wert : null);
    });
    document.addEventListener('visibilitychange', () => this.musik.setzeVersteckt(document.hidden));
  }

  /**
   * Effekte: Schalter, Regler und Taste T (siehe `soundBedienung.js`); der Audiokontext
   * startet bei der ersten Nutzergeste (Zeiger, Touch, Taste).
   */
  #bindeTon() {
    bindeTonBedienung(document, this.sound);
    for (const art of ['pointerdown', 'touchend', 'click']) {
      window.addEventListener(art, () => { void this.sound?.starte(); }, { passive: true });
    }
  }

  #bindMenu() {
    this.menuOverlay = document.getElementById('menu-overlay');
    // Solange das Menü offen ist, sind Spielfeld und HUD dahinter nicht bedienbar (Tastatur/Screenreader):
    // `inert` folgt dem `hidden` des Menüs (Audit 2026-10-13: Tab lief durch das Menü ins Spielfeld).
    const menuHinweis = () => {
      for (const id of ['game-canvas', 'hud']) {
        const el = document.getElementById(id);
        if (el) el.inert = !this.menuOverlay.hidden;
      }
    };
    new MutationObserver(menuHinweis).observe(this.menuOverlay, { attributes: true, attributeFilter: ['hidden'] });
    menuHinweis();
    this.endOverlay = document.getElementById('end-overlay');
    /*
     * Der Abbruchknopf im HUD — sichtbar nur während eines Matches.
     *
     * `#zeigeAbbruch(false)` steht hier zusätzlich zum `hidden`-Attribut im
     * HTML: Das Attribut verhindert ein Aufblitzen beim Laden (es wirkt, bevor
     * JavaScript läuft), der Aufruf setzt den Zustand explizit. Ein Test hält
     * beides fest — beim ersten Anlauf fehlte die eine Hälfte, und der Knopf
     * stand im Menü.
     */
    this.abortButton = document.getElementById('hud-abort');
    this.aufgebenButton = document.getElementById('hud-aufgeben');
    this.#zeigeAbbruch(false);
    this.winnerText = document.getElementById('winner-text');
    document.getElementById('end-menu-button')?.addEventListener('click', () => this.#verlasseMatch());
    this.endSummary = document.getElementById('end-summary');

    document.getElementById('start-button')?.addEventListener('click', () => this.startFromMenu());
    document.getElementById('rematch-button')?.addEventListener('click', () => {
      /*
       * REVANCHE = DIESELBE KARTE.
       *
       * FUND (belegt, Datenfluss-Audit): Der Knopf öffnete nur wieder das Menü.
       * Das Seed-Feld ist dort standardmäßig LEER (`placeholder="leer = neue
       * Karte"`), und ein leerer Seed heißt ein NEUER Zufalls-Seed
       * (`match.js:564` `MatchSeedManager.createRandom()`). Wer „Revanche"
       * drückte, spielte also auf einer anderen Karte — obwohl der Knopf nach
       * einem Neuanlauf auf derselben Karte klingt. Gemessen an zwei Läufen ohne
       * Seed: baseSeed 3367130477 gegen 1341271627, Zustandshash `98aad2e2`
       * gegen `e6da56da`.
       *
       * Der Wert steht im Feld, nicht in einer zweiten Ablage: So sieht der
       * Spieler, worauf er als Nächstes spielt, und kann ihn LÖSCHEN, wenn er
       * wirklich eine neue Karte will. Dieselbe Karte ist die Vorgabe, die neue
       * bleibt eine bewusste Handlung.
       */
      this.#seedFuerRevanche();
      this.endOverlay.hidden = true;
      this.menuOverlay.hidden = false;
    });

    // Lobby-Browser: manuell über den Button, zusätzlich automatisch beim
    // Aufklappen. Sonst müsste der Nutzer erst laden, ohne zu wissen, dass es
    // die Möglichkeit gibt.
    const lobbyBrowser = document.getElementById('lobby-browser');
    const refresh = () => this.refreshLobbies();
    document.getElementById('lobby-refresh')?.addEventListener('click', refresh);
    lobbyBrowser?.addEventListener('toggle', () => {
      if (lobbyBrowser.open) refresh();
    });

    this.#wireReplay();

    // Profil: Anzeige füllen und den Zurücksetzen-Knopf verdrahten. Ohne den
    // Knopf wären die Zahlen im Browser unerreichbar — eine Sackgasse.
    document.getElementById('profil-reset')?.addEventListener('click', () => {
      this.profilZuruecksetzen();
      this.hud.log('Profil zurückgesetzt', 'neutral');
    });

    /*
     * Klangschalter (UX-7, Warteschlange): Der Schalter im Menü und im HUD
     * hängt an `[data-ton-schalter]` und wird von `soundBedienung.js`
     * verdrahtet (siehe `#bindeTon`). Hier steht bewusst KEIN zweiter Weg über
     * ein eigenes Kästchen: Zwei Bedienelemente für denselben Mischer wären
     * zwei Wahrheiten über denselben Zustand.
     */

    /*
     * Fortsetzen nach Neuladen (Warteschlange 3.7): Der Token liegt im
     * sessionStorage und holt denselben Platz zurück.
     */
    document.getElementById('resume-button')?.addEventListener('click', () => this.#setzeSitzungFort());
    this.#aktualisiereSitzungsKnopf();

    /*
     * Profilsicherung (Entscheidung 2026-09-20): kein Konto, aber eine Datei.
     *
     * Der Ablauf ist bewusst der eines Downloads/Uploads und nicht der eines
     * Formulars: Der Spieler bekommt eine Datei, die er aufbewahren kann. Ohne
     * diese zwei Knöpfe wäre „Profil liegt im Browser" eine Sackgasse — ein
     * gelöschter Cache hieße Verlust, und es gäbe keinen Ausweg.
     */
    document.getElementById('profil-export')?.addEventListener('click', () => {
      this.profilSichern();
    });
    const importKnopf = document.getElementById('profil-import');
    const importDatei = document.getElementById('profil-import-datei');
    importKnopf?.addEventListener('click', () => importDatei?.click());
    importDatei?.addEventListener('change', () => {
      const datei = importDatei.files?.[0];
      if (!datei) return;
      // Nach der Auswahl zurücksetzen, damit dieselbe Datei erneut wählbar ist.
      datei.text()
        .then(text => this.profilLaden(text))
        .catch(error => this.hud.log(`Sicherung nicht lesbar: ${error.message}`, 'danger'))
        .finally(() => { importDatei.value = ''; });
    });

    this.#zeigeProfil();
    this.#zeigeErfolge();

    window.addEventListener('keydown', event => {
      /*
       * Die Klangfreigabe.
       *
       * Browser starten einen AudioContext GESPERRT, bis der Nutzer mit der
       * Seite interagiert hat. Ohne diese Zeile bliebe jeder Klang stumm — ohne
       * Fehlermeldung, was die Suche unnötig schwer macht.
       *
       * Ein Tastendruck ist eine solche Interaktion. Sie steht bewusst VOR der
       * Formularprüfung: Auch wer in ein Textfeld tippt, hat interagiert.
       */
      /*
       * UX-7 (Warteschlange): Bleibt der Mischer stumm, weil der Browser
       * keinen AudioContext hergibt, wird das EINMAL gemeldet — vorher blieb
       * es still ohne Fehlermeldung, was die Suche unnötig schwer macht.
       */
      void this.sound?.starte().then(bereit => {
        if (!bereit && this.sound?.an && !this.klangBlockiertGemeldet) {
          this.klangBlockiertGemeldet = true;
          this.hud.log('Klang blockiert — der Browser hat keinen AudioContext freigegeben', 'warn');
        }
      });
      void this.musik?.freigeben();

      // Der Abbruch darf nicht ausgelöst werden, während in ein Formularfeld
      // getippt wird — sonst beendet ein "r" im Seed- oder Serverfeld das Match.
      if (isTextEntry(event.target)) return;
      if (event.key === 'r' || event.key === 'R') {
        this.abortMatch();
      }
    });

    /*
     * Der Abbruchknopf im HUD.
     *
     * FUND (belegt, User-Flow-Audit): Bis hier gab es nur die Taste R. Sie
     * wirkt global und beendet das Match SOFORT — wer sie versehentlich
     * trifft, verliert die Partie. Ein sichtbarer Weg existierte nicht: nur
     * ein Eintrag in der Tastaturliste des Menüs.
     */
    this.abortButton?.addEventListener('click', () => this.abortMatch());
    this.aufgebenButton?.addEventListener('click', () => this.gibAuf());
  }

  /**
   * Trägt den Seed der letzten Partie ins Menü ein — für die Revanche.
   *
   * Der Wert kommt aus DER Quelle, die ihn geführt hat: lokal aus dem
   * MatchController (`seedManager.baseSeed` — bei leerem Feld ein gezogener
   * Zufallswert), online aus der Lobby (`networkClient.worldSeed`, vom Server
   * im `lobby_state` gemeldet). Es gibt keine zweite Ablage und keinen eigenen
   * Zähler: Der Seed ist bereits da, er wurde nur nicht weitergegeben.
   *
   * @returns {number|null} der eingetragene Seed, `null` wenn keiner bekannt ist
   */
  #seedFuerRevanche() {
    const seed = this.mode === 'online'
      ? (this.network?.worldSeed ?? null)
      : (this.match?.seedManager?.baseSeed ?? null);
    const feld = document.getElementById('cfg-seed');
    if (seed === null || seed === undefined || !feld) return null;
    feld.value = String(seed);
    this.hud.log(`Revanche auf derselben Karte — Seed ${seed}`, 'accent');
    return seed;
  }

  /**
   * Verlässt das laufende Match und kehrt ins Menü zurück.
   *
   * Beide Wege (Taste `R` und der HUD-Knopf) laufen hier zusammen — es gibt
   * nur EINE Umsetzung. Beide Wege fragen nach: Ein Tastendruck kann ein
   * Fehlgriff sein, und auch ein Klick soll die Partie nicht ohne Rückfrage
   * beenden (UX-4).
   *
   * @param {{frage?: boolean}} [optionen] - `frage: true` verlangt eine
   *   Bestätigung, bevor abgebrochen wird.
   * @returns {boolean} true, wenn abgebrochen wurde
   */
  abortMatch({ frage = true } = {}) {
    // Kein Match, nichts abzubrechen — der Knopf ist dann auch unsichtbar.
    const laeuft = Boolean(this.match) || this.mode === 'online';
    if (!laeuft) return false;

    if (frage && typeof globalThis.confirm === 'function') {
      // Der Text nennt die Folge beim Namen: Das Match geht verloren.
      const sicher = globalThis.confirm(
        'Match verlassen? Der Spielstand geht verloren.',
      );
      if (!sicher) return false;
    }

    this.#verlasseMatch();
    return true;
  }

  /** Räumt den Match-Zustand auf und zeigt das Menü. */
  #verlasseMatch() {
    // Vor dem Abräumen: den Knopf verschwinden lassen, sonst bliebe er im
    // Menü stehen, wo es nichts abzubrechen gibt.
    this.network?.disconnect();
    this.network = null;
    this.match = null;
    this.#setzeZugpauseZurueck();
    this.mode = 'local';
    this.endOverlay.hidden = true;
    this.menuOverlay.hidden = false;
    this.#zeigeAbbruch(false);
    // Wer bewusst verlässt, braucht keine Fortsetzen-Sitzung mehr (3.7).
    try {
      sessionStorage.removeItem('pa-sitzung');
    } catch { /* nicht verfügbar */ }
    this.#aktualisiereSitzungsKnopf();
  }

  /** Blendet den Fortsetzen-Knopf ein, wenn eine Sitzung gespeichert ist. */
  #aktualisiereSitzungsKnopf() {
    const knopf = document.getElementById('resume-button');
    if (!knopf) return;
    try {
      knopf.hidden = !sessionStorage.getItem('pa-sitzung');
    } catch {
      knopf.hidden = true;
    }
  }

  /** Setzt die letzte Sitzung aus dem sessionStorage fort. */
  #setzeSitzungFort() {
    try {
      const roh = sessionStorage.getItem('pa-sitzung');
      if (!roh) return;
      const sitzung = JSON.parse(roh);
      this.startOnline({
        serverUrl: sitzung.serverUrl,
        lobbyId: sitzung.lobbyId,
        token: sitzung.token,
        name: sitzung.name ?? 'Spieler',
      });
    } catch {
      try { sessionStorage.removeItem('pa-sitzung'); } catch { /* still */ }
      this.#aktualisiereSitzungsKnopf();
    }
  }

  /**
   * Blendet den Abbruchknopf ein oder aus.
   *
   * Zentral, weil es drei Startwege gibt (lokal, online, Replay-Wiedergabe) und
   * zwei Enden (Match vorbei, Abbruch). Eine Anzeige, die an drei Stellen
   * getrennt gepflegt wird, läuft irgendwann auseinander — genau das war die
   * Ursache mehrerer Befunde in diesem Projekt.
   *
   * @param {boolean} sichtbar
   */
  #zeigeAbbruch(sichtbar) {
    if (this.abortButton) this.abortButton.hidden = !sichtbar;
    if (this.aufgebenButton) this.aufgebenButton.hidden = !sichtbar;
  }

  #origin() {
    const state = this.currentViewState;
    if (!state?.activePlayerId) return null;
    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    if (!active) return null;
    // Der Zeiger liegt in Bildschirmpixeln: Der Ursprung muss durch die Kamera (Zoom, Verschiebung).
    const t = this.kamera?.transformation({ ohneStoss: true });
    return t
      ? { x: active.x * t.skalierung + t.versatzX, y: active.y * t.skalierung + t.versatzY }
      : { x: active.x, y: active.y };
  }

  /** Liest die Menükonfiguration und startet das passende Match. */
  startFromMenu() {
    const teams = Number(document.getElementById('cfg-teams')?.value ?? 2);
    /*
     * „Einheiten je Spieler" — die Zahl der Matcharten (3/4/5).
     *
     * Ein Mensch führt ein ganzes TEAM, nicht eine Figur: Klein nennt 3
     * Einheiten je Spieler, groß 4, Krieg 5 (siehe MASTERDOTO, „Matcharten").
     * `playersPerTeam` ist derselbe Wert — der Motor kennt nur Figuren je Team.
     */
    const unitsPerPlayer = Number(document.getElementById('cfg-players')?.value ?? 3);
    const playersPerTeam = unitsPerPlayer;
    /*
     * Der Kartentyp ist keine Einstellung mehr.
     *
     * FUND (belegt, gemessen 2026-09-19): Das Menü hatte eine Auswahl
     * „Karte" (`#cfg-preset`, acht Formen). Sie bewirkte NICHTS: `kartentyp:
     * 'autonom'` lässt den Generator entscheiden, und gemessen erzeugten hills,
     * open, spires und flooded dieselbe Karte (`hash 6bc9aa96`, `landAnteil
     * 0,524`). Ein Bedienelement, das nichts bewirkt, ist irreführender als
     * keines — die Auswahl und die Anzeige, die daran hing, sind entfernt.
     *
     * „autonom" lässt den Generator selbst entscheiden: Der Typ ist keine
     * Einstellung, der Generator zieht seinen Charakter aus dem Seed. Wer die
     * Karte wählen könnte, kennt sie nach zehn Partien und spielt gegen eine
     * Kulisse statt gegen das Gelände.
     *
     * `preset` bleibt als neutraler Rückfallwert stehen — der Motor braucht ihn
     * für Wege, die keine autonome Karte bauen (Werkzeuge, Tests).
     */
    const preset = 'hills';
    const kartentyp = 'autonom';
    // Gewählte Kulisse (leer = automatisch aus dem Seed).
    const backdropKey = document.getElementById('cfg-backdrop')?.value ?? '';
    // Biomwahl (leer = der Seed entscheidet; `klassisch` = Biom folgt der Karte; sonst ein Sonderbiom).
    const biom = document.getElementById('cfg-biom')?.value || null;
    const orientation = document.getElementById('cfg-orientation')?.value ?? 'landscape';
    const rawSeed = document.getElementById('cfg-seed')?.value?.trim();
    const seed = rawSeed === '' || rawSeed === undefined ? undefined : Number(rawSeed);
    const serverUrl = document.getElementById('cfg-server')?.value?.trim() ?? '';
    const lobbyId = document.getElementById('cfg-lobby')?.value?.trim() ?? '';
    const sidegrades = this.#sidegradesAusMenue(teams * playersPerTeam);
    const loadouts = this.#loadoutsAusMenue(teams * playersPerTeam);
    const fraktionen = this.#fraktionenAusMenue(teams);

    if (serverUrl) {
      return this.startOnline({
        serverUrl, lobbyId, teams, playersPerTeam, unitsPerPlayer, preset, kartentyp, seed,
        backdropKey, orientation, sidegrades, loadouts, fraktionen, biom,
      });
    }
    return this.startMatch({
      teams, playersPerTeam, preset, kartentyp, seed, backdropKey, orientation, sidegrades, loadouts, fraktionen, biom,
    });
  }

  /**
   * Liest die Sidegrade-Wahl aus dem Menü und bildet daraus die Liste je
   * Spielerplatz.
   *
   * Warum je KLASSE und nicht je Platz: Das Menü kennt die Spielerplätze nicht —
   * Klasse und Archetyp werden beim Start über den Listenindex vergeben
   * (`index % 3`, siehe MASTERDOTO „Bekannte Grenzen"). Der Spieler kann also
   * nicht sagen „Platz 3 bekommt Zusatzpanzerung", weil er nicht weiß, welche
   * Klasse Platz 3 hat. Er wählt je Klasse — und die Platzliste entsteht daraus
   * nach derselben Regel, die der Motor anwendet.
   *
   * @param {number} plaetze - Anzahl Spielerplätze (teams × playersPerTeam)
   * @returns {(string|null)[]} Kennung je Platz
   */
  #sidegradesAusMenue(plaetze) {
    // Die Klassen folgen der Vergaberegel des Motors: Platz i bekommt
    // CLASS_IDS[i % 3].
    const liste = [];
    for (let i = 0; i < plaetze; i += 1) {
      const klasse = CLASS_IDS[i % CLASS_IDS.length];
      const feld = document.getElementById(`cfg-sidegrade-${klasse}`);
      const wert = feld?.value ?? '';
      // Leerer Wert = kein Sidegrade. Eine unbekannte Kennung ist im Menü nicht
      // wählbar, weil die Optionen aus den Configs stammen.
      liste.push(wert === '' ? null : wert);
    }
    return liste;
  }

  /*
   * ENTFERNT (2026-09-19): `fillTerrainAffinity()` samt `#cfg-preset-synergie`.
   *
   * Die Methode zeigte zur gewählten KARTENFORM, welche Klasse dort ihre Stärke
   * ausspielt. Beides hing an der Menü-Auswahl „Karte", die die Karte gar nicht
   * beeinflusste (der Generator entscheidet aus dem Seed) — eine Synergie-Anzeige
   * für eine Wahl, die es nicht gibt, wäre irreführend.
   *
   * `TERRAIN_AFFINITY` bleibt: Die Tabelle steht weiter in der Hilfe
   * (`hilfeInhalt`) und beschreibt die Geländeformen des Generators.
   */

  /**
   * Füllt die Loadout-Auswahl im Menü — je Spielerplatz zwei Felder.
   *
   * ## Warum je PLATZ und nicht je Klasse (anders als die Sidegrades)
   *
   * Bei den Sidegrades wählt man je Klasse, weil der Sidegrade an der Klasse
   * hängt. Hier ist es umgekehrt: Die Wahl BESTIMMT die Klasse des Platzes. Der
   * Spieler muss also den Platz adressieren — und die Zahl der Plätze steht mit
   * „Teams" und „Spieler pro Team" im Menü.
   *
   * ## Die Vorgabe ist „automatisch"
   *
   * Der erste Eintrag je Feld ist leer und bedeutet: die alte Regel
   * (`index % 3`). Damit ist die Änderung im Menü neutral — wer nichts wählt,
   * bekommt genau das Spiel von vorher.
   */
  /**
   * Fraktionswahl je Team (reine Darstellung). Bleibt eine Wahl beim Neuaufbau
   * erhalten, soweit das Team noch existiert.
   */
  fillFraktionOptions() {
    const behaelter = document.getElementById('fraktion-felder');
    if (!behaelter) return;
    const teams = Number(document.getElementById('cfg-teams')?.value ?? 2);
    const alt = [];
    for (let t = 0; t < 8; t += 1) alt.push(document.getElementById(`cfg-fraktion-${t}`)?.value ?? '');
    behaelter.replaceChildren();
    for (let t = 0; t < teams; t += 1) {
      const zeile = document.createElement('div');
      zeile.className = 'field-row';
      const label = document.createElement('label');
      label.setAttribute('for', `cfg-fraktion-${t}`);
      label.textContent = `Team ${t + 1}`;
      const auswahl = document.createElement('select');
      auswahl.id = `cfg-fraktion-${t}`;
      const keine = document.createElement('option');
      keine.value = '';
      keine.textContent = 'Zufällig / Automatisch';
      auswahl.append(keine);
      const klassisch = document.createElement('option');
      klassisch.value = KLASSISCH;
      klassisch.textContent = 'Klassisch (ohne Figuren)';
      auswahl.append(klassisch);
      for (const f of FACTIONS) {
        const o = document.createElement('option');
        o.value = f.id;
        o.textContent = f.name;
        auswahl.append(o);
      }
      auswahl.value = alt[t] ?? '';
      zeile.append(label, auswahl);
      behaelter.append(zeile);
    }
  }

  #fraktionenAusMenue(teams) {
    const liste = [];
    for (let t = 0; t < teams; t += 1) liste.push(document.getElementById(`cfg-fraktion-${t}`)?.value || null);
    return bereinigeFraktionen(liste, teams);
  }

  fillLoadoutOptions() {
    const behaelter = document.getElementById('loadout-felder');
    if (!behaelter) return;

    const teams = Number(document.getElementById('cfg-teams')?.value ?? 2);
    const proTeam = Number(document.getElementById('cfg-players')?.value ?? 2);
    const plaetze = teams * proTeam;

    behaelter.replaceChildren();

    for (let i = 0; i < plaetze; i += 1) {
      const zeile = document.createElement('div');
      zeile.className = 'field-row';

      const label = document.createElement('label');
      label.setAttribute('for', `cfg-loadout-klasse-${i}`);
      /*
       * Der Platz wird mit Team und Klassen-Vorgabe benannt, damit man sieht,
       * was man ändert. Die Vorgabe stammt aus derselben Regel wie der Motor —
       * eine eigene Rechnung hier würde bei einer Änderung auseinanderlaufen.
       */
      const vorgabe = resolveLoadout(i);
      label.textContent = `Platz ${i + 1} (${vorgabe.classId}/${vorgabe.archetypeId})`;
      zeile.append(label);

      for (const [art, werte, feld] of [
        ['Klasse', CLASS_IDS, 'klasse'],
        ['Archetyp', ARCHETYPE_IDS, 'archetyp'],
      ]) {
        const auswahl = document.createElement('select');
        auswahl.id = `cfg-loadout-${feld}-${i}`;
        // Leer = automatisch (alte Regel).
        const auto = document.createElement('option');
        auto.value = '';
        auto.textContent = `${art}: automatisch`;
        auswahl.append(auto);
        for (const wert of werte) {
          const option = document.createElement('option');
          option.value = wert;
          /*
           * Die Auswahl nennt die WIRKSAMEN Werte, nicht nur den Namen.
           *
           * FUND (belegt, User-Flow-Audit): Hier stand `option.textContent = wert`
           * — also nur „scout", „heavy", „artillery". Das wirksame Leben
           * unterscheidet sich aber um Faktor 0,56 bis 1,56; die Wahl war damit
           * eine Entscheidung ohne Grundlage.
           *
           * Die Zahlen kommen aus `combatProfile()` — derselben Quelle, die der
           * Motor liest. Eine eigene Rechnung hier würde bei einer Änderung
           * auseinanderlaufen (genau die Doppelregel, die dieses Projekt an
           * mehreren Stellen behoben hat).
           *
           * Bei Archetypen zeigt der Wert das TEMPO statt des Schadens: Der
           * Archetyp wirkt über `launchSpeedMultiplier` auf die Flugbahn, nicht
           * über den Schaden (`damage` hieß früher irreführend so und wurde in
           * `launch` umbenannt).
           */
          option.textContent = `${wert} ${beschreibeWert(art, wert)}`;
          auswahl.append(option);
        }
        zeile.append(auswahl);
      }

      behaelter.append(zeile);
    }
  }

  /**
   * Liest die Loadout-Wahl aus dem Menü.
   *
   * @param {number} plaetze
   * @returns {(object|null)[]} Wahl je Platz — `null`, wenn nichts gewählt wurde
   */
  #loadoutsAusMenue(plaetze) {
    const liste = [];
    for (let i = 0; i < plaetze; i += 1) {
      const klasse = document.getElementById(`cfg-loadout-klasse-${i}`)?.value ?? '';
      const archetyp = document.getElementById(`cfg-loadout-archetyp-${i}`)?.value ?? '';
      if (klasse === '' && archetyp === '') {
        liste.push(null);
        continue;
      }
      // Nur die gesetzten Felder übergeben — der Rest fällt auf den Platzwert.
      liste.push({
        ...(klasse ? { classId: klasse } : {}),
        ...(archetyp ? { archetypeId: archetyp } : {}),
      });
    }
    return liste;
  }

  /**
   * Füllt die Sidegrade-Auswahl im Menü — je Klasse ein Feld.
   *
   * Die Optionen kommen aus `sidegradesForClass()`, also aus der Config. Im
   * Client steht keine Liste: Käme ein Sidegrade dazu, müsste sonst an zwei
   * Stellen gepflegt werden.
   */
  fillSidegradeOptions() {
    const behaelter = document.getElementById('sidegrade-felder');
    if (!behaelter) return;
    behaelter.replaceChildren();

    for (const klasse of CLASS_IDS) {
      const angebot = sidegradesForClass(klasse);

      const zeile = document.createElement('div');
      zeile.className = 'field-row';

      const label = document.createElement('label');
      label.setAttribute('for', `cfg-sidegrade-${klasse}`);
      label.textContent = klasse;
      zeile.append(label);

      const auswahl = document.createElement('select');
      auswahl.id = `cfg-sidegrade-${klasse}`;
      // Erster Eintrag: kein Sidegrade. Das ist der neutrale Zustand und muss
      // immer wählbar bleiben — sonst wäre ein Match ohne Sidegrade unmöglich.
      const keine = document.createElement('option');
      keine.value = '';
      keine.textContent = 'ohne Sidegrade';
      auswahl.append(keine);

      for (const eintrag of angebot) {
        const option = document.createElement('option');
        option.value = eintrag.id;
        // Die Erklärung steht im Text: Das Menü hat keine Tooltip-Fläche, und
        // eine eigene Beschreibungszeile je Feld wäre mehr Aufwand als Nutzen.
        option.textContent = `${eintrag.label} — ${eintrag.erklaerung}`;
        auswahl.append(option);
      }

      zeile.append(auswahl);
      behaelter.append(zeile);
    }
  }

  /**
   * Lädt die offenen Lobbys vom konfigurierten Server und zeigt sie im Menü an.
   *
   * Rein lesend: Es wird nichts am Serverzustand geändert. Ein Klick auf einen
   * Eintrag übernimmt die Lobby-ID ins Formular, damit derselbe Startweg
   * verwendet wird wie bei manueller Eingabe.
   */
  async refreshLobbies() {
    const status = document.getElementById('lobby-status');
    const list = document.getElementById('lobby-list');
    const serverUrl = document.getElementById('cfg-server')?.value?.trim() ?? '';
    if (!list) return { ok: false, reason: 'keine Liste im DOM' };

    if (!serverUrl) {
      if (status) status.textContent = 'Dafür bitte eine Server-URL eintragen.';
      list.replaceChildren();
      return { ok: false, reason: 'kein Server konfiguriert' };
    }

    if (status) status.textContent = 'Lade …';
    let lobbies = [];
    try {
      const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/lobby`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      lobbies = Array.isArray(payload.lobbies) ? payload.lobbies : [];
    } catch (error) {
      // Kein Absturz bei nicht erreichbarem Server: das Menü bleibt bedienbar.
      if (status) status.textContent = `Server nicht erreichbar (${error.message})`;
      zeigeToast(`Server nicht erreichbar (${error.message})`, 'danger');
      list.replaceChildren();
      return { ok: false, reason: error.message };
    }

    const offen = lobbies.filter(lobby => lobby.status === 'open');
    if (offen.length === 0) {
      if (status) status.textContent = 'Keine offene Lobby gefunden.';
      list.replaceChildren();
      return { ok: true, count: 0 };
    }

    if (status) status.textContent = `${offen.length} offene Lobby(s)`;
    list.replaceChildren(...offen.map(lobby => {
      const item = document.createElement('li');
      item.className = 'lobby-karte pa-karte';

      /*
       * Gezählt werden BEITRETENDE, nicht Figuren.
       *
       * Im Modus der Matcharten sind das zwei verschiedene Zahlen: Ein Mensch
       * belegt ein ganzes Team (3–5 Figuren). Der Server nennt deshalb
       * `seatsTotal` (wie viele Menschen hineinpassen) neben `capacity` (wie
       * viele Figuren). Ohne diese Unterscheidung stünde „1/6 Plätze" und
       * „Beitreten" an einer Lobby, die schon voll ist.
       */
      const plaetze = lobby.seatsTotal ?? lobby.capacity ?? 0;
      const belegtZahl = lobby.occupied ?? 0;
      const voll = belegtZahl >= plaetze;
      const verbunden = Math.min(lobby.connected ?? belegtZahl, belegtZahl);
      item.dataset.zustand = voll ? 'voll' : belegtZahl > 0 ? 'wartet' : 'leer';

      const el = (tag, klasse, text) => {
        const knoten = document.createElement(tag);
        if (klasse) knoten.className = klasse;
        if (text !== undefined) knoten.textContent = text;
        return knoten;
      };

      // Kopf: Lobby-ID (Wiedererkennung) und Karte als Chip.
      const kopf = el('div', 'lk-kopf');
      kopf.append(el('span', 'lk-id', lobby.id), el('span', 'chip chip-karte', lobby.preset ?? 'hills'));

      // Konfig-Zusammenfassung als kleine Chips.
      const konfig = el('div', 'lk-konfig');
      if (lobby.teams) konfig.append(el('span', 'chip', `${lobby.teams} Teams × ${lobby.playersPerTeam ?? '?'}`));
      // Querformat ist der Normalfall und bleibt unbeschriftet; nur die Ausnahme bekommt einen Chip.
      if (lobby.orientation === 'portrait') konfig.append(el('span', 'chip', 'Hochformat'));

      // Spielerplätze: ein Feld je Platz (belegt/verbunden/getrennt/frei) plus Zahl.
      const platzZeile = el('div', 'lk-plaetze');
      const felder = el('span', 'lk-felder');
      felder.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < Math.min(plaetze, 12); i += 1) {
        const zustand = i < verbunden ? 'bereit' : i < belegtZahl ? 'getrennt' : 'frei';
        felder.append(el('span', `lk-platz is-${zustand}`));
      }
      const belegt = `${belegtZahl}/${plaetze || '?'}`;
      platzZeile.append(felder, el('span', 'lk-zahl', `${belegt} Plätze`));

      // Bereit-Status: die Lobby ist offen, voll oder wartet auf Mitspieler.
      const stand = voll ? 'Voll' : belegtZahl === 0 ? 'Leer — du startest' : `Wartet auf ${plaetze - belegtZahl}`;
      const zusatz = belegtZahl > 0 && verbunden < belegtZahl ? ` · ${belegtZahl - verbunden} getrennt` : '';
      const statusChip = el('span', `chip chip-status is-${item.dataset.zustand}`, stand + zusatz);

      const join = document.createElement('button');
      join.type = 'button';
      join.className = 'lk-beitreten';
      join.textContent = voll ? 'Voll' : 'Beitreten';
      join.disabled = voll;
      join.setAttribute('aria-label', `${voll ? 'Voll' : 'Beitreten'}: Lobby ${lobby.id}, ${belegt} Plätze`);
      join.addEventListener('click', () => {
        const lobbyInput = document.getElementById('cfg-lobby');
        if (lobbyInput) lobbyInput.value = lobby.id;
        if (status) status.textContent = `Lobby ${lobby.id} ausgewählt — auf "Match starten" klicken.`;
        zeigeToast(`Lobby ${lobby.id} ausgewählt`, 'good');
      });

      const info = el('div', 'lk-info');
      konfig.append(statusChip);
      info.append(kopf, konfig, platzZeile);
      item.append(info, join);
      return item;
    }));
    return { ok: true, count: offen.length };
  }

  /** Lokales Match im Browser. */
  /**
   * Füllt die Kulissenauswahl im Menü aus dem Katalog.
   *
   * Die Liste wird aus `BACKDROP_BIOMES` erzeugt und nicht im HTML gepflegt: bei
   * sechzig Einträgen wäre jede Änderung am Katalog sonst eine zweite, von Hand
   * nachzuziehende Liste — und die beiden würden auseinanderlaufen.
   */
  /** Füllt die Biomauswahl im Menü aus den Sonderbiomen (`config/biome-neu.js`). */
  fillBiomOptions() {
    const auswahl = document.getElementById('cfg-biom');
    if (!auswahl) return 0;
    const feste = Array.from(auswahl.options).filter(o => o.value === '' || o.value === 'klassisch');
    auswahl.replaceChildren(...feste);
    for (const id of SONDERBIOM_IDS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = NEUE_BIOME[id].label;
      option.title = NEUE_BIOME[id].beschreibung;
      auswahl.append(option);
    }
    // Planeten (Geländefassung 4): `planet` lässt den Seed die Art ziehen, die Arten sind auch einzeln wählbar.
    const planet = document.createElement('option');
    planet.value = PLANET_WAHL;
    planet.textContent = 'Planet (Art nach Seed)';
    planet.title = 'Scheibenwelt im All mit Kratern und Tunneln; der Seed zieht Eis, Lava, Wüste, Dschungel, Rost oder Stein.';
    auswahl.append(planet);
    for (const id of PLANET_BIOM_IDS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = NEUE_BIOME[id].label;
      option.title = NEUE_BIOME[id].beschreibung;
      auswahl.append(option);
    }
    return SONDERBIOM_IDS.length + 1 + PLANET_BIOM_IDS.length;
  }

  fillBackdropOptions() {
    const auswahl = document.getElementById('cfg-backdrop');
    if (!auswahl) return 0;

    // Erste Option bleibt „automatisch" (leerer Wert).
    // Die ersten beiden Einträge (generativ, automatisches Bild) bleiben.
    const feste = Array.from(auswahl.options).filter(o => o.value === 'generativ' || o.value === 'automatisch' || o.value === '');
    auswahl.replaceChildren(...feste);
    let anzahl = 0;
    for (const biome of BACKDROP_BIOMES) {
      const gruppe = document.createElement('optgroup');
      gruppe.label = biome.label;
      for (const variante of biome.variants) {
        const option = document.createElement('option');
        option.value = `${biome.id}/${variante.id}`;
        option.textContent = variante.label;
        gruppe.append(option);
        anzahl += 1;
      }
      auswahl.append(gruppe);
    }
    return anzahl;
  }

  /** Kulissen-Suche: blendet Einträge und Gruppen aus, die den Suchtext nicht enthalten. */
  filterBackdropOptions(text) {
    const auswahl = document.getElementById('cfg-backdrop');
    if (!auswahl) return 0;
    const q = String(text ?? '').trim().toLowerCase();
    let sichtbar = 0;
    for (const gruppe of auswahl.querySelectorAll('optgroup')) {
      const gruppeTrifft = q === '' || gruppe.label.toLowerCase().includes(q);
      let imGruppe = 0;
      for (const o of gruppe.querySelectorAll('option')) {
        const trifft = gruppeTrifft || o.textContent.toLowerCase().includes(q);
        o.hidden = !trifft;
        if (trifft) imGruppe += 1;
      }
      gruppe.hidden = imGruppe === 0;
      sichtbar += imGruppe;
    }
    return sichtbar;
  }

  /**
   * „Überrasch mich": würfelt Biom, Kulisse und Fraktionen (reine Menüwahl, der Zufall steckt danach
   * in der Match-Konfiguration/im Replay-Kopf). Math.random ist im Client erlaubt (nicht Engine/Shared).
   */
  ueberraschMich() {
    const wahl = liste => liste[Math.floor(Math.random() * liste.length)];
    const teile = [];
    const biom = document.getElementById('cfg-biom');
    if (biom) {
      const o = wahl(Array.from(biom.options).filter(x => x.value !== '' && x.value !== 'klassisch'));
      if (o) { biom.value = o.value; teile.push(`Biom ${o.textContent}`); }
    }
    const kulisse = document.getElementById('cfg-backdrop');
    if (kulisse) {
      const o = wahl(Array.from(kulisse.querySelectorAll('optgroup option')));
      if (o) { kulisse.value = o.value; teile.push(`Kulisse ${o.parentElement.label} / ${o.textContent}`); }
    }
    const teams = Number(document.getElementById('cfg-teams')?.value ?? 2);
    for (let t = 0; t < teams; t += 1) {
      const f = document.getElementById(`cfg-fraktion-${t}`);
      if (f) f.value = wahl(FACTIONS).id;
    }
    teile.push('Fraktionen gemischt');
    const status = document.getElementById('ueberrasch-status');
    if (status) status.textContent = `Gewürfelt: ${teile.join(' · ')}`;
    return teile;
  }

  startMatch({
    teams = 2, playersPerTeam = 2, preset = 'hills', kartentyp = null,
    seed = undefined, backdropKey = '', orientation = 'landscape',
    sidegrades = null, loadouts = null, fraktionen = null, biom = null,
  } = {}) {
    this.network?.disconnect();
    this.network = null;
    this.#setzeZugpauseZurueck();
    this.mode = 'local';

    // Sidegrades gehören in die Match-Konfiguration — sie verändern das
    // Kampfprofil und müssen deshalb schon beim Aufbau bekannt sein, nicht erst
    // nach dem Start.
    this.match = new MatchController({
      seed, teams, playersPerTeam, preset, kartentyp, orientation, sidegrades, loadouts, biom,
      guenther: GUENTHER_FASSUNG_STANDARD, cookie: COOKIE_STANDARD, feuer: FEUER_STANDARD, bewegung: BEWEGUNG_STANDARD, zugregeln: ZUGREGELN_STANDARD, // neue Partien: Gehen am Boden;: Günthers Aktionen und Cookie
      turnPauseTicks: Math.round(zugpauseSekunden() * SIMULATION_HZ),
      turnReplayTicks: zugpauseSekunden() > 0 ? Math.round(MATCH_RULES.turnReplaySeconds * SIMULATION_HZ) : 0,
    });
    this.match.start();
    // Darstellung: Fraktion je Team (nur Anzeige, wirkt nicht auf den Motor).
    this.renderer.fraktionJeTeam = loeseFraktionen(fraktionen, teams, this.match.seedManager.baseSeed);
    // Kulisse ZUERST: sie bestimmt die Bodenfarbe, und das Gelände wird mit
    // dieser Farbe gezeichnet. In umgekehrter Reihenfolge trüge die frische
    // Karte noch die Bodenfarbe der vorigen Kulisse.
    //
    // Der Seed stammt aus dem Match, damit ein Replay dieselbe Karte zeigt wie
    // das aufgezeichnete Spiel.
    this.gewaehlteKulisse = backdropKey;
    // Zeichenfläche auf die Kartengröße bringen (Hoch- oder Querformat).
    this.#applyOrientation(this.match.orientation, this.match.width, this.match.height);
    // Vorgabe ist die GENERATIVE Kulisse: sie passt sich jeder Kartengröße an,
    // ein Bild nicht. Wer ausdrücklich ein Bild wählt, bekommt das Bild — sonst
    // wäre die Auswahl im Menü wirkungslos.
    // Menü-Vorgabe seit 2026-10-27 ist 'automatisch': gemaltes Bild passend zum Kartencharakter; Sonderbiome (Planet, Kosmos, ...)
    // behalten ihre generative Szene. 'generativ' und der leere Wert (API ohne Angabe) bleiben generativ.
    const bildWahl = backdropKey && backdropKey !== 'generativ' && !(backdropKey === 'automatisch' && this.match.sonderbiom);
    if (bildWahl) {
      this.renderer.setScenery(null);
      this.#applyBackdrop(this.match.seedManager.baseSeed, preset, backdropKey);
    } else {
      this.renderer.setScenery(this.match.scenery);
    }
    this.#afterWorldReady(this.match.bitmap, this.match.water);
    // Erfassung für dieses Match beginnen (Kennzahlen aus den Ereignissen).
    this.verbucht = false;
    this.#starteErfassung();

    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    this.#zeigeAbbruch(true);
    this.running = true;
    this.hud.log(`Lokales Match — Seed ${this.match.seedManager.baseSeed}`, 'accent');
    if (!this.animationHandle) this.#loop(performance.now());
    return { ok: true, mode: 'local' };
  }

  /**
   * Online-Match: optional wird die Lobby per HTTP erzeugt, danach verbindet
   * sich der Client per WebSocket. Der Server bleibt die Source of Truth.
   */
  /**
   * Springt mit der Figur am Zug.
   *
   * Der Sprung ist eine echte Physik (siehe `MatchController.jump`): Er setzt
   * einen Impuls, die Figur fliegt und landet.
   *
   * ## Seit 2026-09-27: keine Obergrenze mehr
   *
   * Vorher stand hier „je Zug sind zwei Sprünge möglich" (Bodensprung +
   * Doppelsprung). Der Auftraggeber hat entschieden: „nein sprung kann man
   * unendlich" — die Zahlengrenze ist entfallen. Geblieben ist, dass der ERSTE
   * Sprung eines Zuges vom Boden kommen muss; jeder weitere geht auch in der
   * Luft.
   *
   * Die Unterscheidung der Meldung hängt deshalb weiter an `ergebnis.double`
   * und nicht an einer Restzahl: `false` = vom Boden abgesprungen, `true` = in
   * der Luft abgesprungen. Beides bleibt richtig, gleich wie oft gesprungen
   * wird.
   *
   * `ergebnis.jumpsLeft` ist mit entfallener Grenze `null` („unbegrenzt") — die
   * Anzeige liest es deshalb NICHT. Der Wert steht überall gleich (auch im
   * Netzpfad, wo das `jumped`-Ereignis als JSON ankommt); die Begründung steht
   * bei `SPRUENGE_UNBEGRENZT` in `src/engine/match.js`.
   *
   * @param {number} [seitlich] - -1 links, 0 gerade, 1 rechts
   * @param {boolean} [salto] - Rückwärtssalto/hoher Sprung (Bewegungsfassung 2)
   */
  jump(seitlich = 0, salto = false) {
    /*
     * ONLINE: eigener Befehl an den Server — und KEINE eigene Meldung.
     *
     * Der Server führt den Sprung aus und schickt das `jumped`-Ereignis an alle
     * Clients; die Anzeige dafür steht im `online`-Zweig von `ereignisse.js`.
     * Würde hier zusätzlich geloggt, stünde EIN Sprung zweimal im Protokoll —
     * genau die Doppelmeldung, die den Live-Bereich zumüllt.
     */
    if (this.mode === 'online') {
      if (!this.network?.isConnected) {
        this.hud.log('Nicht verbunden', 'danger');
        return null;
      }
      if (!this.network.isMyTurn) {
        this.hud.log('Nur am eigenen Zug kann gesprungen werden', 'notice');
        return null;
      }
      this.network.sendJump(seitlich, salto);
      return { ok: true, pending: true };
    }
    if (!this.match || this.mode !== 'local') return null;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;

    const ergebnis = this.match.jump(playerId, seitlich, salto);
    if (!ergebnis.ok) {
      // Kein Grund zur Beunruhigung: eine Meldung genügt.
      this.hud.log(ergebnis.errors.join(', '), 'notice');
      return ergebnis;
    }
    this.hud.log(salto ? 'Rückwärtssalto' : (ergebnis.double ? 'Doppelsprung' : 'Sprung'), 'accent');
    return ergebnis;
  }

  /**
   * Gehen: setzt/erneuert/löscht die Gehabsicht der Figur am Zug (Bewegungsfassung 2).
   *
   * Online geht die Absicht als `move` an den Server (er entscheidet), lokal direkt in den Motor. Die Anzeige
   * des Netzspiels läuft über `LaufVorhersage` sofort mit. Ein Stopp (0) wird immer durchgereicht.
   *
   * @param {-1|0|1} richtung
   */
  walk(richtung) {
    if (this.mode === 'online') {
      this.laufVorhersage.setzeRichtung(this.network?.isMyTurn ? richtung : 0);
      if (!this.network?.isConnected || (richtung !== 0 && !this.network.isMyTurn)) return null;
      this.network.sendMove(richtung);
      return { ok: true, pending: true };
    }
    if (!this.match || this.mode !== 'local' || !this.match.gehen) return null;
    const playerId = this.match.activePlayerId;
    return playerId === null ? null : this.match.gehen.setzeRichtung(playerId, richtung);
  }

  /**
   * Wirft die Waffe an einer Anzeigeposition ab.
   *
   * Der Abwurf ist die Antwort auf einen vollen Vorrat: statt eine Waffe zu
   * verlieren, entscheidet der Spieler bewusst, welche er ablegt. Die Waffe
   * bleibt als Kiste liegen und ist für alle aufhebbar.
   *
   * @param {number} anzeigePosition - Position wie in der Liste (0-basiert)
   */
  dropWeapon(anzeigePosition) {
    /*
     * ONLINE: eigener Befehl an den Server — die Meldung kommt aus dem
     * `weapon_dropped`-Ereignis (siehe `ereignisse.js`), NICHT von hier.
     *
     * Die Anzeigeposition wird über die Bestandsliste aufgelöst (dieselbe
     * Übersetzung wie lokal): Die Liste gliedert nach Gruppen um, der
     * Inventarindex der aktiven Waffe ist deshalb nicht ihre Anzeigeposition.
     */
    if (this.mode === 'online') {
      if (!this.network?.isConnected) {
        this.hud.log('Nicht verbunden', 'danger');
        return null;
      }
      if (!this.network.isMyTurn) {
        this.hud.log('Nur am eigenen Zug kann eine Waffe abgeworfen werden', 'notice');
        return null;
      }
      const index = this.#inventoryIndexAt(anzeigePosition);
      if (index === null) return null;
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      const weaponId = active?.inventory?.[index];
      if (!weaponId) return null;
      this.network.sendDropWeapon(weaponId);
      return { ok: true, pending: true };
    }
    if (!this.match || this.mode !== 'local') {
      this.hud.log('Abwerfen ist im Replay nicht möglich', 'notice');
      return null;
    }
    const index = this.#inventoryIndexAt(anzeigePosition);
    if (index === null) return null;

    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;
    const weaponId = this.match.inventory.getWeapons(playerId)[index];
    if (!weaponId) return null;

    const ergebnis = this.match.dropWeapon(playerId, weaponId);
    if (!ergebnis.ok) {
      this.hud.log(`Abwerfen nicht möglich: ${ergebnis.errors?.join(', ')}`, 'danger');
      return ergebnis;
    }
    const name = getWeapon(weaponId)?.displayName ?? weaponId;
    const vorrat = ergebnis.ammo < 0 ? '∞' : ergebnis.ammo;
    this.hud.log(`${name} abgeworfen (${vorrat} Munition liegt bereit)`, 'accent');
    // Die Liste muss sofort nachziehen.
    /*
     * Nur `aim` und `onWeaponSelect` — `hud.update` kennt genau diese.
     *
     * FUND (belegt, B-4 im Befundregister): Hier standen zusätzlich
     * `onWeaponDrop` und `onJump`. `Hud#update` liest nur `aim` und
     * `onWeaponSelect` (Signatur in `hud.js`); die zwei anderen wurden nie
     * gelesen — toter Draht. Die Sprung-/Abwurf-Eingabe läuft längst über den
     * `InputController` (`#input` im Konstruktor), nicht über die HUD-Liste.
     * Ein Parameter, den niemand liest, ist eine Absicht ohne Wirkung.
     */
    this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i) });
    return ergebnis;
  }

  async startOnline({
    serverUrl, lobbyId = '', teams = 2, playersPerTeam = 2, unitsPerPlayer = null,
    preset = 'hills', kartentyp = null, seed = undefined, name = 'Spieler', backdropKey = '',
    orientation = 'landscape', sidegrades = null, loadouts = null, fraktionen = null, biom = null, token = null,
  } = {}) {
    this.gewaehlteKulisse = backdropKey;
    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    this.hud.clearLog();
    this.hud.log('Verbinde mit Server …', 'accent');
    this.mode = 'online';
    // Online kommt die Fraktion je Figur vom Server (Bestandsnachricht).
    this.renderer.fraktionJeTeam = null;
    this.running = true;
    /*
     * Der Abbruchknopf gilt auch online — nicht nur lokal.
     *
     * FUND (belegt, A-9 im Befundregister): `#zeigeAbbruch(true)` stand nur im
     * LOKALEN Zweig. Online verschwand das Menü, aber der Knopf erschien nie —
     * wer eine Lobby nicht wollte oder aus einem Match aussteigen musste, hatte
     * keinen Rückweg außer Neuladen. `abortMatch()` konnte das längst (er prüft
     * `mode === 'online'` und trennt über `#verlasseMatch`); es fehlte allein
     * das EINBLENDEN. Gezeigt wird ab dem Commit aufs Verbinden — auch während
     * „Warte auf Mitspieler" will man zurücktreten können (der Server verfällt
     * das Team über `pruneDisconnected`).
     */
    this.#zeigeAbbruch(true);

    let targetLobby = lobbyId;
    let resolvedSeed = seed;
    let hostToken = null;

    try {
      if (!targetLobby) {
        const response = await fetch(new URL('/api/lobby/create', serverUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Sidegrades gehen als Teil der Match-Konfiguration mit — der Server
          // validiert sie und rechnet autoritativ.
          body: JSON.stringify({
            teams, preset, kartentyp, seed, orientation, ...(biom ? { biom } : {}),
            /*
             * Genau EINE der beiden Angaben — sie widersprechen sich sonst.
             *
             * `unitsPerPlayer` setzt den Modus der Matcharten (ein Beitritt
             * besetzt ein ganzes Team); ohne die Angabe gilt die alte Aufteilung
             * mit `playersPerTeam` als Platzzahl. Beides zu senden lehnt der
             * Server ab („widersprechen sich"), und zwar zu Recht: Es wären zwei
             * Zahlen für dieselbe Größe.
             */
            ...(unitsPerPlayer ? { unitsPerPlayer } : { playersPerTeam }),
            ...(Array.isArray(sidegrades) && sidegrades.some(s => s !== null) ? { sidegrades } : {}),
            // Nur mitschicken, wenn wirklich etwas gewählt wurde — sonst bliebe
            // die Anfrage größer als nötig und die alte Regel wäre nicht mehr
            // erkennbar.
            ...(Array.isArray(loadouts) && loadouts.some(l => l !== null) ? { loadouts } : {}),
            ...(Array.isArray(fraktionen) ? { fraktionen } : {}),
          }),
        });
        if (!response.ok) throw new Error(`Lobby konnte nicht erstellt werden (${response.status})`);
        const created = await response.json();
        targetLobby = created.lobby.id;
        resolvedSeed = created.lobby.seed ?? seed ?? null;
        // Der Ersteller hat bereits einen Platz reserviert; dieser Token setzt
        // ihn fort und verhindert eine Doppelbelegung.
        hostToken = created.player?.token ?? null;
      }
    } catch (error) {
      this.hud.log(`Serverfehler: ${error.message}`, 'danger');
      zeigeToast(`Serverfehler: ${error.message}`, 'danger');
      this.menuOverlay.hidden = false;
      // Kein Match, kein Abbruchknopf — der Fehlschlag führt zurück ins Menü.
      this.#zeigeAbbruch(false);
      return { ok: false, error: error.message };
    }

    const wsUrl = new URL('/ws', serverUrl).toString().replace(/^http/, 'ws');
    const client = new NetworkClient({
      url: wsUrl,
      lobbyId: targetLobby,
      token: token ?? hostToken,
      playerName: name,
      seed: resolvedSeed,
      preset,
      kartentyp,
      teams,
      playersPerTeam,
    });
    this.network = client;
    this.lobbyId = targetLobby;
    // Ohne Fraktionsangabe des Servers leitet jeder Client dieselbe Anzeige aus der Lobby-ID ab.
    this.renderer.fraktionJeTeam = loeseFraktionen(null, 8, targetLobby);

    // A-10 (Befundregister): Solange kein `joined` eingetroffen ist, ist ein
    // `server_error` ein BEITRITTSfehler (Lobby voll, läuft schon) — der führt
    // zurück ins Menü, nicht ins leere Spiel.
    let beigetreten = false;

    client.on('hello', () => this.hud.log('Handshake abgeschlossen', 'good'));
    client.on('joined', payload => {
      beigetreten = true;
      /*
       * Warteschlange 3.7: Der Sitzplatz-Token lebte nur im Tab. Er wird jetzt
       * im sessionStorage abgelegt, damit „Letzte Sitzung fortsetzen" nach
       * einem Neuladen denselben Platz zurückholt (JOIN_LOBBY mit Token).
       */
      try {
        sessionStorage.setItem('pa-sitzung', JSON.stringify({
          serverUrl,
          lobbyId: client.lobbyId,
          token: payload.token ?? token ?? hostToken ?? null,
          name,
        }));
        this.#aktualisiereSitzungsKnopf();
      } catch { /* sessionStorage nicht verfügbar — Fortsetzen entfällt still */ }
      /*
       * Im Modus der Matcharten führt ein Mensch ein ganzes TEAM (3–5 Einheiten).
       * `entityIds` nennt alle; `entityId` bleibt die erste Figur. Beide werden
       * übernommen — sonst zählten die Kennzahlen nur ein Drittel der eigenen
       * Schüsse.
       */
      this.eigeneSpielerIds = Array.isArray(payload.entityIds) && payload.entityIds.length > 0
        ? [...payload.entityIds]
        : (payload.entityId === null || payload.entityId === undefined ? [] : [payload.entityId]);
      this.eigenerSpielerId = this.eigeneSpielerIds[0] ?? null;
      this.hud.log(
        `Lobby ${client.lobbyId} — Platz ${payload.seatIndex + 1}`
        + (this.eigeneSpielerIds.length > 1 ? ` (${this.eigeneSpielerIds.length} Einheiten)` : ''),
        'accent',
      );
      // Neue Sitzung beim Server: die Takte zählen von vorn, alte Dedup-Schlüssel gelten nicht mehr.
      if (!payload.resumed) this.ereignisDedup.zuruecksetzen();
      if (payload.seed !== null && payload.seed !== undefined) {
        this.#buildRemoteTerrain(terrainQuelleFuer(payload, { preset, orientation, kartentyp }));
        // Krater, die vor dem Beitritt entstanden sind (Reconnect/Spätbeitritt).
        this.#wendeKraterAn(payload.craters);
        // Mahlstrom-Einschnitt, der vor dem Beitritt entstanden ist.
        this.#wendeEinschnittAn(payload.inset);
      }
    });
    // Terrain-Hash: Abgleich der eigenen Karte mit der des Servers (alle ~2 s).
    this.terrainAbweichungOffen = false;
    client.on('terrain_hash', meldung => this.#pruefeTerrainHash(meldung));
    client.on('terrain_state', stand => this.#baueKarteNeu(stand));
    client.on('lobby_state', payload => {
      if (payload.seed !== null && payload.seed !== undefined && !this.remoteTerrain) {
        this.#buildRemoteTerrain(terrainQuelleFuer(payload, { preset, orientation, kartentyp }));
      }
      /*
       * Wartet die Lobby noch auf Menschen?
       *
       * Es gibt keine Bot-KI: Ein unbesetztes Team bleibt leer, und die
       * Simulation läuft erst, wenn JEDES Team einen verbundenen Menschen hat.
       * Ohne diesen Hinweis sähe der Spieler ein Standbild ohne Erklärung —
       * der Server sendet in dieser Zeit keine Snapshots.
       */
      if (payload.laeuft === false) {
        const besetzt = payload.besetzteTeams ?? 0;
        const teams = payload.teams ?? teams;
        this.hud.log(
          `Warte auf Mitspieler: ${besetzt}/${teams} Teams besetzt — `
          + 'es gibt keine Bot-KI, jedes Team braucht einen Menschen.',
          'accent',
        );
      }
      // Wer mitten in der Zugpause (neu) verbindet, sieht sie trotzdem: Der Beitritts-Zustand trägt die Restzeit.
      const pauseRestMs = Number(payload.snapshot?.turnPauseMs) || 0;
      if (pauseRestMs > 0) {
        this.#starteZugpause({ pauseTicks: pauseRestMs * SIMULATION_HZ / 1000, replayTicks: 0, playerId: payload.snapshot.activePlayerId });
      }
      /*
       * Der mitgesendete `snapshot` wird hier bewusst NICHT ausgewertet.
       *
       * Zwischenzeitlich stand hier eine Prüfung auf `snapshot.status ===
       * 'gameover'`, um einem Wiederverbinder das entschiedene Match zu zeigen.
       * Sie war toter Code: Die Sitzung wird beim Match-Ende gelöscht
       * (`#finish` → `onEmpty`), ein späterer Beitritt erzeugt deshalb eine
       * NEUE Sitzung, und deren Zustand steht auf „playing". Der Reconnect
       * startet faktisch ein neues Match — geprüft in
       * `tests/server-integration.test.js`.
       */
    });
    client.on('state', state => {
      if (state === CONNECTION_STATE.RECONNECTING) {
        this.hud.log('Verbindung verloren — versuche Wiederverbindung', 'danger');
        zeigeToast('Verbindung verloren — versuche Wiederverbindung', 'danger');
      }
      if (state === CONNECTION_STATE.CONNECTED) {
        this.hud.log('Verbunden', 'good');
        zeigeToast('Verbunden', 'good');
      }
      /*
       * Den Verbindungszustand SOFORT ins HUD schreiben, nicht erst im
       * Zeichenbild.
       *
       * Fund (belegt, 2026-09-20): Die Anzeige wurde nur im Renderpfad gesetzt
       * (`#renderFrame`), und der kehrt ohne Zustand früh zurück. Solange die
       * Lobby auf Mitspieler wartet, gibt es keine Snapshots — die Anzeige stand
       * deshalb auf „offline", obwohl die Verbindung stand. Genau so hat es ein
       * E2E-Test gemeldet.
       */
      if (this.mode === 'online') {
        this.hud.setConnection?.(state, this.network?.latencyMs ?? 0);
      }
    });
    client.on('server_error', message => {
      const text = message.errors?.[0] ?? message.error ?? 'Serverfehler';
      // Der Server hat den Schuss abgelehnt (kein Zug, Nachladezeit, keine
      // Munition): Die Vorhersage ist damit widerlegt und MUSS weg — sonst
      // zeigte die Anzeige eine Bahn für einen Schuss, den es nie gab.
      this.shotPredictor.discard(text);
      this.hud.log(`Server: ${text}`, 'danger');
      zeigeToast(`Server: ${text}`, 'danger');
      /*
       * A-10 (Befundregister): Ein abgelehnter BEITRITT (Lobby voll, läuft
       * schon) ließ den Spieler vor einem geschlossenen Menü zurück — nur eine
       * Protokollzeile, kein Rückweg. Solange kein `joined` kam, ist der Fehler
       * ein Beitrittsfehler: aufräumen und ins Menü zurück.
       */
      if (!beigetreten && this.mode === 'online') {
        this.#verlasseMatch();
      }
    });
    client.on('game_event', message => this.#handleRemoteEvent(message));
    /*
     * Ein VERWORFENER Zustandstakt wird gemeldet, nicht verschwiegen.
     *
     * FUND (belegt, Datenfluss-Audit): `decodeSnapshot` liefert `null`, wenn die
     * Protokollversion nicht passt oder der Puffer abgeschnitten ist — der
     * Client verwarf den Takt und kehrte still zurück. Folge: schwarzes Bild
     * ohne Meldung, keine Zeile im Protokoll, und für den Spieler kein
     * Unterschied zwischen „Server sendet nicht", „Protokoll passt nicht" und
     * „Netz spinnt". Gemeldet wird der ERSTE Ausfall je Verbindung — eine Zeile
     * je Takt wäre selbst eine Zumutung; die Gesamtzahl steht im Zähler
     * (`networkClient.stats.snapshotRejects`, Debug-Ansicht).
     */
    client.on('snapshot_rejected', info => {
      if (info.versuche !== 1) return;
      this.hud.log(
        `Zustandstakt verworfen: ${info.grund} (${info.bytes} Byte) — das Bild steht, bis das passt`,
        'danger',
      );
    });
    // Bestände kommen wegen ihrer variablen Länge nicht im binären Snapshot,
    // sondern als eigene Nachricht bei Änderung.
    // Der Ansichtszustand wird jeden Frame neu gebaut; die Bestände werden dort
    // gelesen. Ein zusätzlicher Anstoß ist nicht nötig.
    this.remoteLoadouts = {};
    client.on('loadouts', table => { this.remoteLoadouts = table; });

    await client.connect();
    // Laufende Latenzmessung, damit die HUD-Anzeige den echten Wert zeigt.
    client.startPing(2000);
    if (!this.animationHandle) this.#loop(performance.now());
    return { ok: true, mode: 'online', lobbyId: targetLobby };
  }

  /**
   * Trägt das Änderungslog in Karte und Zeichenfläche ein, in der Reihenfolge des
   * Servers: Krater `[x, y, radius]` / `[x, y, radius, tiefe]` und gelandete
   * Inseln `['s', dy, ...Spaltenläufe]`.
   */
  #wendeKraterAn(krater) {
    if (!Array.isArray(krater)) return;
    for (const eintrag of krater) {
      applyLogEntryToTerrain(this.remoteTerrain, eintrag);
      if (eintrag[0] === 's') {
        this.renderer.landeInsel(null, eintrag.slice(2), eintrag[1], { stumm: true });
      } else if (eintrag[0] === 'x') {
        this.renderer.entferneZellen(eintrag.slice(1));
      } else if (eintrag[0] === 'p') {
        this.renderer.setzeSchutt(eintrag.slice(1));
      } else if (eintrag[0] === 'r') {
        this.renderer.setzeRutsch(eintrag.slice(1));
      } else {
        this.renderer.applyCrater(eintrag[0], eintrag[1], eintrag[2], eintrag[3] ?? null);
      }
    }
  }

  /** Trägt den Mahlstrom-Einschnitt in Karte, Zeichenfläche und Anzeigezustand ein. */
  #wendeEinschnittAn(inset) {
    if (!(inset > 0)) return;
    this.remoteInset = inset;
    applyInsetToTerrain(this.remoteTerrain, inset);
    this.renderer.applyContraction(inset);
  }

  /**
   * Gleicht die Karte mit dem Server-Hash ab. Bei Abweichung: eine Zeile im
   * Protokoll und Nachlieferung (Krater + Einschnitt) anfordern. Das erste
   * Urteil 'abwarten' (Stand weicht ab, Ereignis womöglich noch unterwegs)
   * wird erst bei der nächsten Meldung zur Abweichung.
   */
  #pruefeTerrainHash(meldung) {
    if (!this.remoteTerrain) return;
    const urteil = bewerteTerrainHash(this.remoteTerrain, meldung, this.terrainAbweichungOffen);
    this.terrainAbweichungOffen = urteil.urteil === 'abwarten';
    if (urteil.urteil === 'stoffe') {
      if (!this.stoffeGemeldet) this.hud.log('Stoffkarte weicht vom Server ab — Material-Reaktionen können abweichen', 'danger');
      this.stoffeGemeldet = true;
      return;
    }
    if (urteil.urteil !== 'abweichung') return;
    this.hud.log(
      `Terrain-Hash weicht ab (Client ${urteil.lokal?.toString(16)}, Server ${Number(meldung.hash).toString(16)}) — Karte wird neu aufgebaut`,
      'danger',
    );
    this.network?.requestTerrain();
  }

  /** Baut die Karte aus Seed + gelieferten Kratern + Einschnitt neu auf. */
  #baueKarteNeu(stand) {
    if (!this.remoteTerrainQuelle) return;
    this.#buildRemoteTerrain(this.remoteTerrainQuelle);
    this.#wendeKraterAn(stand.craters);
    this.#wendeEinschnittAn(stand.inset);
    this.terrainAbweichungOffen = false;
  }

  #buildRemoteTerrain(quelle) {
    const { seed, preset, orientation, kartentyp } = quelle;
    this.remoteTerrainQuelle = quelle;
    const terrain = buildTerrainForSeed(seed, preset, orientation, kartentyp, quelle);
    this.remoteTerrain = terrain;
    /*
     * Fläche und Kulisse zuerst — die Kulisse liefert die Bodenfarbe für die
     * Geländeschicht.
     *
     * KORREKTUR (Befund P1, 2026-10-02): Hier stand „Der Server schickt nur Seed
     * und Ausrichtung; beides ergibt auf beiden Seiten dieselbe Karte." Das war
     * FALSCH — es fehlte der Kartentyp. Der Server baut die autonome Karte aus
     * `erzeugeAutonomeKarte`, diese Anzeige baute sie aus `generateTerrain`:
     * gemessen 34,23 % abweichende Zellen, 106 px anderer Wasserstand. Der Client
     * hat `kartentyp` im Snapshot bekommen und hier weggeworfen.
     */
    this.#applyOrientation(orientation, terrain.width, terrain.height);
    // Vorgabe 'automatisch': auch online das gemalte Bild passend zum Kartencharakter (Sonderbiome bleiben generativ).
    if (this.gewaehlteKulisse === 'automatisch' && !terrain.sonderbiom && terrain.charakter) {
      this.renderer.setScenery(null);
      this.#applyBackdrop(seed, preset, 'automatisch', terrain.charakter);
    } else {
      this.setSceneryFromSeed(seed, preset, terrain.sonderbiom);
    }
    this.renderer.stoffkarte = terrain.stoffkarte ?? null;
    this.renderer.buildTerrainLayer(terrain.bitmap, terrain.width, terrain.height);
    this.renderer.gefuehlZuruecksetzen();
    this.hud.log(`Terrain aus Seed ${seed} rekonstruiert`, 'neutral');
  }

  /**
   * Der Zustand, den die Anzeige liest.
   *
   * Hier wird das ERFOLGS-EMBLEM angehängt — zentral und nicht an jeder
   * HUD-Aufrufstelle. Gründe:
   *
   *  - Es gilt für den EIGENEN Spieler, denn nur dessen Profil liegt vor. Ein
   *    fremdes Emblem wäre geraten, und ein geratener Erfolg ist schlimmer als
   *    keiner.
   *  - Es gilt in BEIDEN Modi (lokal und online) — die Aufrufstelle wäre sonst
   *    zweimal zu pflegen, und einer der beiden fiele irgendwann aus.
   *
   * Die Ableitung selbst liegt in `emblem()` (`shared/achievements.js`); hier
   * wird nur das Ergebnis mitgegeben. Es enthält keine Gestaltung — nur Anzahl,
   * Rang und den Hinweis, ob ein Erfolg noch ein Platzhalter ist.
   */
  currentState() {
    const roh = this.mode === 'online' ? this.onlineViewState : this.match?.getState() ?? null;
    if (!roh) return roh;
    return {
      ...roh,
      eigenerSpielerId: this.eigenerSpielerId,
      emblem: emblem(this.profil?.erfolge ?? null),
    };
  }

  get currentViewState() {
    return this.currentState();
  }

  /** Übersetzt den neuesten Snapshot in das Renderformat. */
  get onlineViewState() {
    const snapshot = this.network?.latestSnapshot;
    if (!snapshot) return null;

    // Zugzeit kommt aus dem Snapshot. Die Gesamtdauer wird aus dem höchsten
    // beobachteten Wert abgeleitet, damit sie ohne Zusatzfeld korrekt ist.
    const remaining = snapshot.turnRemainingMs ?? 0;
    if (remaining > (this.remoteTurnDurationMs ?? 0)) this.remoteTurnDurationMs = remaining;
    const turnDurationMs = this.remoteTurnDurationMs || 30_000;

    // Zustandsmarken kommen jetzt ebenfalls über die Leitung (Protokoll v9):
    // `dotsCount` (Anzahl der Schaden-über-Zeit-Effekte) und `boostMultiplier`.
    // Vor v9 standen hier die Konstanten `[]` und `1` — online erschien deshalb
    // NIE eine Gift- oder Bonusmarke, obwohl Leben verloren bzw. dazugewonnen
    // wurde (Defekt aus docs/verkabelung.md §C). Jede Figur bekommt weiterhin
    // JEDEZ Takt einen Eintrag, damit alte Marken nicht kleben (B-5).
    const statuses = {};
    for (const entity of snapshot.entities ?? []) {
      statuses[entity.entityId] = {
        shield: entity.shield ?? 0,
        frozenTurns: entity.frozenTurns ?? 0,
        // Die Anzeige zählt die Marken (`hud.js`), nicht ihre Inhalte — lokal
        // ist es dieselbe Zahl (`statuses[id].dots.length`).
        dots: new Array((entity.dotsCount ?? 0) < MALI_LEITUNGSMARKE ? (entity.dotsCount ?? 0) : 0).fill(null),
        ...((entity.dotsCount ?? 0) >= MALI_LEITUNGSMARKE ? { mali: maskeZuMali(entity.dotsCount & ~MALI_LEITUNGSMARKE) } : {}),
        boostMultiplier: entity.boostMultiplier ?? 1,
      };
    }

    const entities = (this.network.interpolatedEntities() ?? []).map((entity, index) => ({
      entityId: entity.entityId,
      teamId: entity.teamId,
      /*
       * Klasse und Archetyp kommen aus der Bestandsnachricht (LOADOUTS).
       *
       * Fund (belegt): Hier stand ein GERATENER Wert —
       * `CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1` —, also
       * abwechselnd je Listenposition, unabhängig davon, welche Figur der
       * Spieler tatsächlich führt. Im Spiel fiel das nicht auf, weil nur
       * Positionen und Gesundheit gezeichnet wurden. Mit der Schussvorhersage
       * wurde es sichtbar: Der Geschwindigkeitsfaktor folgt der Klasse
       * (Artillery 1,3 gegen Scout 0,7), und eine geratene Klasse zeigte damit
       * eine um ein Drittel falsche Bahn.
       *
       * Der Rückfall bleibt der Index — aber nur, wenn die Nachricht noch nicht
       * eingetroffen ist (direkt nach dem Beitritt).
       */
      // Darstellung: Fraktion des Teams (Server, nur Anzeige).
      fraktionId: this.remoteLoadouts?.[entity.entityId]?.fraktionId ?? null,
      classId: this.remoteLoadouts?.[entity.entityId]?.classId
        ?? (CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1),
      archetypeId: this.remoteLoadouts?.[entity.entityId]?.archetypeId
        ?? (ARCHETYPE_IDS[index % ARCHETYPE_IDS.length] === 'brawler' ? 0 : 1),
      /*
       * Der SIDEGRADE kommt aus derselben Bestandsnachricht wie die Klasse.
       *
       * FUND (belegt, Datenfluss-Audit): Diese Zeile fehlte, und `#startShotPrediction`
       * las `eigene.sidegradeId` (`:1607`) — der Wert war online also IMMER
       * `undefined`, und die Bahn wurde ohne Sidegrade gerechnet, obwohl der
       * Server mit ihm rechnet. Gemessen an der Bahnlänge (Sonde
       * `/tmp/pa-stille/sonde1-sidegrade-maxhealth.mjs`, 45°, Kraft 100, flacher
       * Boden): artillery/scharfschütze 134 px ohne, 191 px mit `kompakt`
       * (+57 px) und 98 px mit `schwerlast` (−36 px) — der Faktor geht von
       * 0,5347 auf 0,6417 bzw. 0,4545. Auf einer großen Karte wächst der Fehler
       * mit dem Quadrat des Faktors (Bahnweite ∝ f²), also auf mehrere hundert
       * Pixel.
       *
       * Der Rückfall ist der NEUTRALE Wert (`null` = „kein Sidegrade") — genau
       * wie im Motor, wo eine unbekannte Kennung wie „kein Sidegrade" wirkt. Ein
       * geratener Ersatzwert wäre hier besonders schädlich: Er zeigte eine Bahn,
       * die zu keinem Profil gehört.
       */
      sidegradeId: this.remoteLoadouts?.[entity.entityId]?.sidegradeId ?? null,
      label: `P${index + 1}`,
      alive: entity.alive,
      x: entity.x,
      y: entity.y,
      health: entity.health,
      /*
       * Höchstleben aus der Bestandsnachricht — nicht die Konstante 100.
       *
       * FUND (belegt, Datenfluss-Audit): Hier stand `maxHealth: 100`. Die
       * Klassen und Archetypen ergeben gemessen 32 verschiedene Werte von 48 bis
       * 195 (scout/späher 96, artillery 108, heavy/brawler 156, mit
       * Zusatzpanzerung 120/135/195). `hud.js:365` und `renderer.js:795` rechnen
       * `health / maxHealth` ohne Obergrenze: Ein voller Balken eines Brawlers
       * war 156 % breit, ein unverletzter Späher sah mit 96 % beschädigt aus.
       *
       * Die 100 bleibt als Startwert, bis die erste Bestandsnachricht da ist —
       * sie ist der Vorgabewert der Simulation (`BASE_HEALTH`), nicht die
       * Gesundheit der Klasse. Der Server schickt sie beim Beitritt sofort
       * (`syncLoadouts(true)`), sie wird also im ersten Bild ersetzt.
       */
      maxHealth: this.remoteLoadouts?.[entity.entityId]?.maxHealth ?? 100,
      // Wasserstand kommt je Spieler mit dem Snapshot (Protokoll v4) und geht
      // unverändert in den Ansichtszustand — dieselbe Anzeige wie im lokalen
      // Modus, ohne zweiten Rechenweg.
      waterLevel: entity.waterLevel ?? 0,
      angle: entity.entityId === snapshot.activePlayerId ? this.aim.angle : Math.PI / 4,
      power: this.aim.power,
      // Bestände aus der Loadout-Nachricht: der binäre Snapshot führt sie nicht.
      // Ohne diese Zuordnung blieb die Waffenliste im Online-Modus leer.
      activeWeaponId: this.remoteLoadouts?.[entity.entityId]?.activeWeaponId ?? null,
      inventory: this.remoteLoadouts?.[entity.entityId]?.inventory ?? [],
      ammo: this.remoteLoadouts?.[entity.entityId]?.ammo ?? {},
      cooldowns: this.remoteLoadouts?.[entity.entityId]?.cooldowns ?? {},
    }));

    /*
     * Laufvorhersage (nur Anzeige): Die eigene Figur am Zug läuft zwischen zwei Snapshots mit und gleitet nach dem
     * Stopp weich auf den Serverstand zurück (`laufVorhersage.js`). Der Server entscheidet weiterhin allein.
     */
    const amZug = entities.find(figur => figur.entityId === snapshot.activePlayerId);
    if (amZug && amZug.alive && this.network.isMyTurn && this.remoteTerrain?.bitmap) {
      const terrain = this.remoteTerrain;
      const pos = this.laufVorhersage.anzeige(amZug, {
        isSolid: (x, y) => (x < 0 || x >= terrain.width || y >= terrain.height ? true : y < 0 ? false : Boolean(terrain.bitmap[y * terrain.width + x])),
        breite: terrain.width, jetzt: performance.now(), snapshotAt: this.network.letzterSnapshotMs,
      });
      amZug.x = pos.x;
      amZug.y = pos.y;
    } else {
      this.laufVorhersage.zuruecksetzen();
    }

    return {
      status: this.remoteStatus ?? 'playing',
      round: snapshot.round,
      maxRounds: MATCH_RULES.roundLimitBackstop,
      wind: snapshot.wind,
      tick: snapshot.tick,
      turnElapsedMs: Math.max(0, turnDurationMs - remaining),
      rueckzugMs: this.#rueckzugRest(snapshot.activePlayerId),
      turnDurationMs,
      activePlayerId: snapshot.activePlayerId,
      winnerTeamId: this.remoteWinner ?? null,
      statuses,
      /*
       * Der Mahlstrom (Valhalla): aktiv, sobald der Server den ersten Einschnitt
       * gemeldet hat.
       *
       * Der Beginn hängt seit 2026-10-13 an einer zufällig gezogenen SPIELZEIT
       * (6–12 Minuten, `MATCH_RULES.suddenDeath`), nicht mehr an einer festen
       * Runde. Der Client kann ihn deshalb nicht aus der Rundenzahl herleiten —
       * und soll ihn auch nicht kennen: der Zeitpunkt ist geheim. Er erfährt ihn
       * über das, was der Server ohnehin sendet: `maelstrom_contract` (mit dem
       * Einschnitt, der Wert steht in `remoteInset`) und beim Wiedereinstieg
       * `WELCOME.inset`. Einschnitt > 0 heißt: der Sturm läuft.
       *
       * Vorgeschichte (Datenfluss-Audit): Die Schwelle stand einmal ein zweites Mal
       * im Client und wich vom Motor ab — der Sturm war online sieben Runden lang
       * unsichtbar. Mit einer Quelle (dem Server) kann das nicht mehr passieren.
       */
      maelstrom: { active: (this.remoteInset ?? 0) > 0, inset: this.remoteInset ?? 0 },
      entities,
      projectiles: snapshot.projectiles ?? [],
      /*
       * Kisten aus dem Snapshot (Protokoll v5).
       *
       * Fund (belegt): Hier stand fest `crates: []`. Im lokalen Match wurden
       * Kisten gezeichnet, online nie — gemessen mit zwei Browsern an einem
       * echten Server: beide sahen 0 Kisten, obwohl der Server sie führte. Die
       * Lücke lag an ZWEI Stellen: Der Client setzte die Liste leer, und der
       * Snapshot übertrug Kisten überhaupt nicht (`encodeSnapshot` kannte nur
       * Figuren und Projektile).
       */
      crates: snapshot.crates ?? [],
      /*
       * Geschütze aus dem Snapshot (Protokoll v6). Sie sind ein Spielzustand:
       * Ohne sie wäre ein aufgestelltes Geschütz online unsichtbar, und sein
       * Besitzer hätte einen unsichtbaren Angreifer.
       */
      turrets: snapshot.turrets ?? [],
      /*
       * Günther aus dem Snapshot (Protokoll v7).
       *
       * FUND (belegt): Hier fehlte das Feld. Der Renderer zeichnet Günther und
       * seine Haufen GENAU aus `state.guenther` (`renderer.js:1218` ruft
       * `#drawGuenther(state.guenther)`, `:1200` `#drawPoopPiles(state.guenther?.haufen ?? [])`),
       * und die lokale Sicht reichte es durch (`engine/stateSnapshot.js:201`:
       * `guenther: quelle.guenther`). Online setzte der Ansichtszustand nur
       * `crates` und `turrets` — Günther lief mit der Simulation, war aber
       * unsichtbar.
       *
       * Form wie bei `crates`/`turrets`: unverändert aus dem Snapshot
       * durchgereicht. Fehlt das Feld, steigt der Renderer weich aus
       * (`?.aktiv`, `?? []`) — dieselbe Absicherung wie lokal.
       */
      guenther: snapshot.guenther ?? null,
      cookie: snapshot.cookie ?? null,
      terrainWidth: this.remoteTerrain?.width ?? this.renderer.width,
      terrainHeight: this.remoteTerrain?.height ?? this.renderer.height,
    };
  }

  /**
   * Eine Meldung des Servers an die Anzeige weitergeben.
   *
   * Die Fassade bleibt hier, die Wirkung steht in `client/ereignisse.js`: Der
   * Online-Zweig und der lokale Zweig lesen DIESELBE Zuordnungstabelle —
   * vorher waren es zwei Schalter über denselben Ereignisarten, die schon
   * einmal auseinandergelaufen sind.
   */
  #handleRemoteEvent(message) {
    verarbeiteOnline(this.#ereignisKontext(), message);
  }

  /**
   * Anzeigeposition der gerade gewählten Waffe.
   *
   * Nötig für das Abwerfen per Taste: die Liste gliedert nach Gruppen um, der
   * Inventarindex der aktiven Waffe ist deshalb nicht ihre Position in der
   * Anzeige. Ohne diese Übersetzung träfe das Abwerfen die falsche Waffe.
   */
  #activeDisplayPosition() {
    const weapons = this.#weaponIdsForActivePlayer();
    const aktiv = this.mode === 'online'
      ? this.onlineViewState?.entities
        ?.find(e => e.entityId === this.onlineViewState.activePlayerId)?.activeWeaponId
      : this.match?.activePlayerId === null || !this.match
        ? null
        : this.match.inventory.getActiveWeaponId(this.match.activePlayerId);
    if (aktiv === undefined || aktiv === null) return 0;

    const reihenfolge = orderInventoryBySubcategory(weapons);
    const inventarIndex = weapons.indexOf(aktiv);
    if (inventarIndex < 0) return 0;
    const position = reihenfolge.indexOf(inventarIndex);
    return position >= 0 ? position : 0;
  }

  /**
   * Inventar-Index zu einer Anzeigeposition.
   *
   * Liest die Waffen des aktiven Spielers, ordnet sie wie die Liste
   * (`orderInventoryBySubcategory`) und gibt den Inventar-Index an dieser
   * Position zurück. Ohne diese Übersetzung träfen die Zifferntasten bei
   * gegliederter Liste die falsche Waffe.
   *
   * @returns {number|null} Inventar-Index oder null
   */
  #inventoryIndexAt(anzeigePosition) {
    const position = Number(anzeigePosition);
    if (!Number.isInteger(position) || position < 0 || position > 8) return null;

    const reihenfolge = orderInventoryBySubcategory(this.#weaponIdsForActivePlayer());
    return position < reihenfolge.length ? reihenfolge[position] : null;
  }

  /** Die Figur am Zug aus dem Anzeige-State (lokal wie online gleiche Form). */
  #aktiveFigur() {
    const state = this.currentState();
    return state?.entities?.find(entity => entity.entityId === state.activePlayerId) ?? null;
  }

  /** Waffen des aktiven Spielers, je nach Betriebsart. */
  #weaponIdsForActivePlayer() {
    if (this.mode === 'online') {
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      return active?.inventory ?? [];
    }
    if (!this.match || this.match.activePlayerId === null) return [];
    return this.match.inventory.getWeapons(this.match.activePlayerId);
  }

  /**
   * Wählt eine Waffe anhand ihrer ANGEZEIGTEN Nummer (1-basiert übergeben als
   * 0-basierte Position).
   *
   * Die Liste ist nach den vier Gruppen gegliedert, die Nummern folgen der
   * Anzeige — nicht der Inventarreihenfolge. Diese Methode übersetzt deshalb
   * Position → Inventar-Index über dieselbe Ordnungsfunktion, die die Liste
   * verwendet.
   */
  selectWeapon(anzeigePosition) {
    const inventarIndex = this.#inventoryIndexAt(anzeigePosition);
    if (inventarIndex === null) return;
    this.selectWeaponById(this.#weaponIdsForActivePlayer()[inventarIndex]);
  }

  /**
   * Wählt eine Waffe über ihre ID (Waffenmenü; die Zifferntasten laufen
   * darüber ebenfalls). Der Server bekommt wie bisher nur `weaponId`.
   *
   * @returns {boolean} true, wenn die Wahl angenommen bzw. abgeschickt wurde
   */
  selectWeaponById(weaponId) {
    if (!weaponId || !this.#weaponIdsForActivePlayer().includes(weaponId)) return false;

    if (this.mode === 'online') {
      // Nur die eigene Waffe wählen und nur am eigenen Zug: sonst schickte der
      // Client eine Wahl, die der Server ablehnt.
      if (!this.network?.isMyTurn) {
        this.hud.log('Nur am eigenen Zug kann die Waffe gewechselt werden', 'notice');
        return false;
      }
      this.network?.selectWeapon(weaponId);
      this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
      this.sound?.verarbeite({ type: 'waffenwechsel' });
      return true;
    }
    if (!this.match) return false;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return false;
    this.match.inventory.selectWeapon(playerId, weaponId);
    this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
    this.sound?.verarbeite({ type: 'waffenwechsel' });
    return true;
  }

  /**
   * Feuert in der aktuellen Betriebsart.
   *
   * ## Woher die Kraft kommt (Befund, belegt 2026-09-27)
   *
   * Hier stand:
   *
   *     const charging = this.input.isCharging;
   *     const power = charging
   *       ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70)))
   *       : this.aim.power;
   *
   * Das war TOTER CODE: `InputController#releaseCharge` löschte `#charging`
   * vor dem Aufruf von `onFire`, also lieferte `isCharging` immer `false` und
   * `power` war immer `this.aim.power`. Das Aufladen hatte keine Wirkung —
   * obwohl README und die Tastaturliste es versprechen.
   *
   * Jetzt bringt der Aufruf die Kraft MIT (`kraftAusLadung`), gelesen vom
   * Eingabe-Controller, bevor das Laden endet. Wer keine übergibt (Enter über
   * `#onKeyDown`, die Diagnose `__PA__.fire`), schießt mit der eingestellten
   * Kraft `this.aim.power` — das ist unverändert.
   *
   * @param {number|null} geladen Kraft aus dem Aufladen, oder `null`
   */
  fire(geladen = null) {
    const state = this.currentState();
    if (!state) return { ok: false, errors: ['Kein laufendes Match'] };
    if (state.status !== 'playing') return { ok: false, errors: ['Match ist beendet'] };

    // In der Zugpause beendet jeder Feuer-Tastendruck die Pause (Überspringen), statt zu schießen.
    const inPause = this.mode === 'online' ? Boolean(this.zugpause) : (state.turnPauseMs ?? 0) > 0;
    if (inPause) return this.#ueberspringeZugpause();

    // Die aufgeladene Kraft gilt in BEIDEN Betriebsarten — der Server rechnet
    // mit derselben Zahl, die die Anzeige während des Ladens gezeigt hat.
    const power = Number.isFinite(geladen)
      ? Math.max(MIN_KRAFT, Math.min(MAX_KRAFT, Math.round(geladen)))
      : this.aim.power;

    if (this.mode === 'online') {
      if (!this.network?.isConnected) {
        this.hud.log('Nicht verbunden — Schuss konnte nicht gesendet werden', 'danger');
        return { ok: false, errors: ['Nicht verbunden'] };
      }
      if (!this.network.isMyTurn) {
        this.hud.log('Nicht am Zug', 'danger');
        return { ok: false, errors: ['Nicht am Zug'] };
      }
      this.network.sendInput(this.aim.angle, power);
      // Vorhersage SOFORT anlegen: Die Bahn wird gezeichnet, bevor die
      // Serverantwort eintrifft. Sie ist rein anzeigend (siehe
      // `shotPrediction.js`) — der Server entscheidet weiterhin über Gültigkeit
      // und Wirkung.
      this.#startShotPrediction(this.aim.angle, power);
      this.hud.log(`Schuss gesendet (${Math.round(power)} Kraft)`, 'accent');
      return { ok: true, projectileId: null, hit: null };
    }

    /*
     * Im Replay wird nicht gespielt.
     *
     * Ohne diese Sperre würde ein Tastendruck die NACHGESPIELTE Rechnung
     * verändern: Der Zustand wäre danach weder das Replay noch ein eigenes
     * Match, und ein Vergleich mit `replay --verify` wäre wertlos. Wer zusieht,
     * spielt nicht.
     */
    if (this.mode === 'replay') {
      this.hud.log('Im Replay kann nicht gespielt werden — erst „Abspielen" beenden', 'danger');
      return { ok: false, errors: ['Replay läuft'] };
    }

    const playerId = this.match.activePlayerId;
    if (playerId === null) return { ok: false, errors: ['Kein aktiver Spieler'] };

    const result = this.match.fire(playerId, this.aim.angle, power);
    if (!result.ok) {
      this.hud.log(`Schuss verweigert: ${result.errors[0] ?? 'unbekannt'}`, 'danger');
    } else {
      this.hud.log(`Schuss abgegeben (${Math.round(power)} Kraft)`, 'accent');
    }
    return result;
  }

  /**
   * Zug überspringen (Taste P, Touch-Knopf): beendet den eigenen Zug ohne Schuss (Zugregeln 2).
   * Online entscheidet der Server (aktiver Spieler, höchstens zweimal in Folge); lokal der Motor.
   */
  ueberspringeZug() {
    if (this.mode === 'replay') return { ok: false, errors: ['Replay läuft'] };
    if (this.mode === 'online') {
      if (!this.network?.isMyTurn) { this.hud.log('Nur am eigenen Zug kann übersprungen werden', 'notice'); return { ok: false }; }
      return this.network.sendSkipTurn() ? { ok: true, pending: true } : { ok: false };
    }
    const id = this.match?.activePlayerId;
    if (!this.match?.zug || id === null || id === undefined) return { ok: false };
    const ergebnis = this.match.zug.ueberspringen(id);
    if (!ergebnis.ok) this.hud.log(ergebnis.errors.join(', '), 'notice');
    return ergebnis;
  }

  /**
   * Aufgeben (HUD-Knopf „Aufgeben", nur mit Bestätigung): Die eigenen Figuren zählen als besiegt, das Match endet
   * wie sonst. Online gilt es nur für den eigenen Sitz (Token); lokal für das Team der Figur am Zug. Die Taste R
   * bleibt „Match verlassen" und gibt nie still auf.
   */
  gibAuf({ frage = true } = {}) {
    if (this.mode === 'replay' || (!this.match && this.mode !== 'online')) return false;
    if (frage && typeof globalThis.confirm === 'function' && !globalThis.confirm('Aufgeben? Deine Figuren zählen als besiegt.')) return false;
    if (this.mode === 'online') return this.network?.sendSurrender() === true;
    const zustand = this.match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (!aktiv || !this.match.zug) return false;
    for (const e of zustand.entities) if (e.teamId === aktiv.teamId && e.alive !== false) this.match.zug.aufgeben(e.entityId);
    return true;
  }

  /** Beendet die Zugpause vorzeitig (lokal direkt, online per Nachricht; im Replay nie). */
  #ueberspringeZugpause() {
    if (this.mode === 'replay') return { ok: false, errors: ['Replay läuft'] };
    if (this.mode === 'online') {
      if (!this.network?.isMyTurn || !this.network.sendSkipPause()) return { ok: false, errors: ['Nicht am Zug'] };
    } else if (!this.match?.skipTurnPause().ok) {
      return { ok: false, errors: ['Keine Zugpause'] };
    }
    this.zugpause = null;
    const feld = document.getElementById('zugpause');
    if (feld) feld.hidden = true;
    return { ok: true, uebersprungen: true };
  }

  /** Ein lokaler Simulationsschritt inklusive Ereignisverarbeitung. */
  step() {
    if (this.mode !== 'local' || !this.match) return;
    const before = this.match.status;
    this.match.step();
    const events = this.match.consumeEvents();
    this.lastEvents = events;
    // Kennzahlen aus DENSELBEN Ereignissen, die auch das Protokoll speist —
    // keine zweite Buchführung, die abweichen könnte.
    //
    // Der TAKT geht mit: Er steht in keinem Ereignis (Ereignisse tragen nur
    // ihre Nutzlast), und ohne ihn blieb `MatchStats.tick` bei 0 stehen. Die
    // Folge war ein stiller Fehler in der Trefferquote — das Trefferfenster
    // (`TREFFER_FENSTER_TICKS`) verglich 0 gegen 0 und war damit IMMER
    // durchlässig: Ein Schuss, dessen Schaden erst 2000 Takte später ankam,
    // zählte als Treffer. Gemessen vorher `treffer: 1, trefferquote: 1` für
    // genau diesen Fall (siehe `tests/stats-trefferfenster.test.js`).
    this.stats?.feedAll(events, this.match.world.tickCount);
    this.#handleEvents(events);
    if (before === 'playing' && this.match.status === 'gameover') {
      this.#showEndScreen(this.match.winnerTeamId);
    }
  }

  /**
   * Die Ereignisse des lokalen Simulationsschritts an die Anzeige weitergeben.
   *
   * Die Wirkungszuordnung steht in `client/ereignisse.js`; hier bleibt nur die
   * Übergabe. Der Kontext wird EINMAL je Ereignisfolge gebaut, nicht je
   * Ereignis: Er enthält nur Zugänge, die auf den laufenden Zustand zeigen.
   */
  #handleEvents(events) {
    const kontext = this.#ereignisKontext();
    for (const ereignis of events) verarbeiteLokal(kontext, ereignis);
  }

  /**
   * Sammelt GENAU die Werte, die `client/ereignisse.js` braucht.
   *
   * ## Warum es dieses Objekt gibt
   *
   * Das Ereignismodul kennt kein `this` — es kann die Klasse nicht benutzen.
   * Statt ihm die Instanz zu geben (damit läge jede private Methode in
   * Reichweite), steht hier Zeile für Zeile, WAS es benutzen darf: Renderer,
   * HUD, Klang, Match, Schussvorhersage, fünf Helfer und — als einziger
   * schreibender Zugang — der Online-Zustand.
   *
   * Jede Zeile ist damit eine bewusste Entscheidung über Kopplung: Kommt eine
   * dazu, ist sie sichtbar; fällt eine weg, ebenso.
   */
  #ereignisKontext() {
    return {
      renderer: this.renderer,
      tierBuehne: this.renderer?.tierBuehne,
      hud: this.hud,
      sound: this.sound,
      dedup: this.ereignisDedup,
      match: this.match,
      shotPredictor: this.shotPredictor,
      /*
       * Die folgenden Helfer bleiben in dieser Klasse, weil sie privates
       * Wissen brauchen (Zustand, Namen, Überlagerung). Das Modul RUFT sie
       * auf und bildet nichts davon nach.
       */
      nameOf: playerId => this.#nameOf(playerId),
      findEntity: entityId => this.currentState()?.entities?.find(e => e.entityId === entityId) ?? null,
      // Untergrund an einer Stelle für den Einschlagklang: Wasser, Fels (Höhlen, Gebirge) oder Erde.
      material: (x, y) => this.#materialAn(x, y),
      // Steht eine lebende Figur an der Stelle? (Dann klingt der Treffer, nicht der Boden.)
      figurNah: (x, y) => (this.currentState()?.entities ?? []).some(
        e => e.alive !== false && Math.hypot(e.x - x, e.y - y) < 22,
      ),
      drawHitscanBeam: nutzlast => this.#drawHitscanBeam(nutzlast),
      logSpecialEffect: nutzlast => this.#logSpecialEffect(nutzlast),
      showGuentherWheel: nutzlast => this.showGuentherWheel(nutzlast),
      showEndScreen: sieger => this.#showEndScreen(sieger),
      starteZugpause: nutzlast => this.#starteZugpause(nutzlast),
      starteRueckzug: nutzlast => { this.rueckzug = { start: performance.now(), dauerMs: Number(nutzlast?.ms) || 0, playerId: nutzlast?.playerId }; },
      /*
       * Der Online-Zustand gehört dem Client. Statt das Modul Felder schreiben
       * zu lassen, bekommt es vier benannte Zugänge — so steht HIER, welche
       * Werte ein Serverereignis ändern darf.
       */
      // Nur online gibt es eine nachgebaute Karte; lokal ist die Match-Maske selbst die Karte.
      karte: this.mode !== 'online' ? null : {
        krater: (x, y, radius, tiefe = null) => applyCraterToTerrain(this.remoteTerrain, x, y, radius, tiefe),
        // Eine gelandete Geländeinsel wandert in Bitmap und Maske nach unten.
        insel: (dy, runs) => applySettleToTerrain(this.remoteTerrain, dy, runs),
        // Zerstörung Fassung 4: Zellen weg, Schutt abgesetzt, Setzrutsch (Bitmap und Maske).
        entfernt: runs => applyRemoveToTerrain(this.remoteTerrain, runs),
        hinzu: zellen => applyAddToTerrain(this.remoteTerrain, zellen),
        rutsch: zuege => applySlumpToTerrain(this.remoteTerrain, zuege),
        // Der Mahlstrom trägt Bitmap und Maske ab, nicht nur die Zeichenfläche.
        einschnitt: inset => applyInsetToTerrain(this.remoteTerrain, inset),
      },
      fernzustand: {
        status: () => this.remoteStatus,
        setzeStatus: wert => { this.remoteStatus = wert; },
        setzeSieger: wert => { this.remoteWinner = wert; },
        setzeEinschnitt: wert => { this.remoteInset = wert; },
      },
    };
  }

  /**
   * Untergrund für den Klang: `wasser` | `fels` | `erde` — Ableitung, wenn das Ereignis
   * kein `material` trägt (älterer Server). Dieselbe Funktion wie in der Engine
   * (`shared/einschlag.js`); online aus Maske und Wasserlinie der Karte.
   */
  #materialAn(x, y) {
    const online = this.mode === 'online';
    const wasser = online
      ? wasserAusLinie(this.remoteTerrain?.mask, this.remoteTerrain?.waterLevel)
      : this.match?.water;
    return klassifiziereEinschlag(online ? this.remoteTerrain?.mask : this.match?.terrain, wasser, x, y, { biomId: this.match?.biomId });
  }

  /**
   * Beginn der Zugpause (Ereignis `turn_start` mit `pauseTicks`/`replayTicks`).
   * Nur Anzeige: Die Sperre gegen Schießen und Springen liegt in der Engine.
   */
  #starteZugpause(nutzlast) {
    const ticks = Number(nutzlast?.pauseTicks) || 0;
    if (ticks <= 0) { this.zugpause = null; return; }
    this.zugpause = {
      start: performance.now(),
      dauerMs: ticks * 1000 / SIMULATION_HZ,
      wiederholungMs: (Number(nutzlast.replayTicks) || 0) * 1000 / SIMULATION_HZ,
      playerId: nutzlast.playerId,
    };
  }

  /** Verbleibende Rückzugsfrist online in ms (Wanduhr ab `rueckzug`); endet mit dem Zugwechsel. */
  #rueckzugRest(aktiv) {
    const r = this.rueckzug;
    if (!r) return 0;
    const rest = r.dauerMs - (performance.now() - r.start);
    if (rest <= 0 || aktiv !== r.playerId) { this.rueckzug = null; return 0; }
    return rest;
  }

  /** Neues Match, Replay oder Abbruch: Pause und alte Aufnahme verwerfen, Hinweis ausblenden. */
  #setzeZugpauseZurueck() {
    this.kameraRegie?.reset();
    this.renderer?.tierBuehne?.reset();
    this.zugpause = null;
    this.rueckzug = null;
    this.schussAufnahme.verwerfe();
    const feld = document.getElementById('zugpause');
    if (feld) feld.hidden = true;
  }

  /**
   * Pro Bild: erfasst den Flug, steuert Pausen-Hinweis (DOM) und liefert den Stand der
   * Wiederholung für den Renderer (oder `null`).
   */
  #zugpauseAnzeige(state) {
    this.schussAufnahme.erfasse(state?.projectiles);
    const feld = document.getElementById('zugpause');
    // Lokal und im Replay zählt die ENGINE (Takte, exakt auch bei Tempo ≠ 1× und Seek); nur online, wo
    // der Zustand die Pause nicht trägt, läuft die Wanduhr ab dem Ereignis `turn_start`.
    const ausEngine = this.mode !== 'online' && typeof state?.turnPauseMs === 'number';
    if (ausEngine && state.turnPauseMs > 0 && !this.zugpause) {
      this.zugpause = { start: performance.now(), dauerMs: state.turnPauseMs, wiederholungMs: 0, playerId: state.activePlayerId };
    }
    const z = this.zugpause;
    const rest = !z ? 0 : (ausEngine ? state.turnPauseMs : z.dauerMs - (performance.now() - z.start));
    if (!z || rest <= 0 || state?.status !== 'playing') {
      this.zugpause = null;
      if (feld && !feld.hidden) feld.hidden = true;
      return null;
    }
    const freezeMs = z.dauerMs - z.wiederholungMs;
    const inWiederholung = z.wiederholungMs > 0 && rest > freezeMs;
    if (feld) {
      const titel = feld.querySelector('.zugpause-titel');
      const zahl = feld.querySelector('.zugpause-zahl');
      if (inWiederholung) {
        titel.textContent = 'WIEDERHOLUNG';
        zahl.textContent = '';
      } else {
        titel.textContent = `${this.#nameOf(z.playerId)} ist gleich dran`;
        zahl.textContent = String(Math.max(1, Math.ceil(rest / 1000)));
      }
      feld.hidden = false;
    }
    if (!inWiederholung) return null;
    if (z.mitSpur === undefined) z.mitSpur = this.schussAufnahme.nimmFrische();
    if (!z.mitSpur) return null;
    // Die Wiederholung läuft über die ganze Wiederholungsphase (leicht verlangsamt).
    return this.schussAufnahme.zustand(1 - (rest - freezeMs) / z.wiederholungMs);
  }

  /** Name einer Spielfigur für Log-Meldungen. */
  #nameOf(playerId) {
    const state = this.currentState();
    const entity = state?.entities?.find(e => e.entityId === playerId);
    return entity?.label ?? `Einheit ${playerId}`;
  }

  /**
   * Verfolgt den Wasserzustand jeder Figur und meldet nur die ÜBERGÄNGE.
   *
   * Warum nicht über die Ereignisse: `entity_in_water` und `drowning` feuern in
   * jedem Simulationsschritt, solange die Bedingung gilt. Eine Meldung je
   * Sekunde wäre schon zu viel, 60 sind es tatsächlich. Der Zustand steht
   * ohnehin im Match-State — und im Online-Modus kommt er mit dem Snapshot,
   * sodass dieselbe Anzeige ohne zweiten Weg funktioniert.
   *
   * Der Vergleich läuft auf dem ZUSTAND, nicht auf dem Rohwert: Der Füllstand
   * schwankt bei jedem Schritt um Rundungsbeträge, ein Vergleich der Zahlen
   * würde dauern melden.
   */
  #trackWater(state) {
    if (!state?.entities) return;
    for (const entity of state.entities) {
      const jetzt = entity.alive ? waterStateFor(entity.waterLevel) : WATER_STATE.DRY;
      const vorher = this.waterStates.get(entity.entityId) ?? WATER_STATE.DRY;
      if (jetzt === vorher) continue;
      this.waterStates.set(entity.entityId, jetzt);

      const prozent = Math.round((entity.waterLevel ?? 0) * 100);
      if (jetzt !== WATER_STATE.DRY && vorher === WATER_STATE.DRY) {
        this.sound?.verarbeite({
          type: 'platscher', gross: jetzt === WATER_STATE.SUBMERGED, x: entity.x, y: entity.y,
        });
      }
      if (jetzt === WATER_STATE.SUBMERGED) {
        this.hud.log(`${entity.label} ertrinkt (${prozent} % unter Wasser)`, 'danger');
      } else if (jetzt === WATER_STATE.WET && vorher === WATER_STATE.DRY) {
        this.hud.log(`${entity.label} steht im Wasser (${prozent} %)`, 'neutral');
      } else if (vorher === WATER_STATE.SUBMERGED) {
        this.hud.log(`${entity.label} ist wieder über Wasser`, 'good');
      }
    }
  }

  /**
   * Spielt den Klang zu den Treffern, die der Renderer im letzten Bild gesehen
   * hat — und zwar nur, wenn der Ereigniszweig ihn nicht schon gespielt hat.
   *
   * ## Warum es diesen Weg zusätzlich gibt
   *
   * Der Klang zum Treffer hing bis hierher NUR am Ereigniszweig, und dort an
   * einer Bedingung: `hitscan` mit `hit && target` (`ereignisse.js`, beide
   * Betriebsarten). Wer mit einer GESCHOSSWAFFE traf — dem Standardfall —, hörte
   * nichts. Das `damage`-Ereignis, an dem es hängen könnte, ist gedrosselt
   * (höchstens alle 30 Takte je Figur) und gemessen viel zu häufig (15092
   * Ereignisse in 30 s bei 40 Figuren) — ein Klang daran wäre ein Dauerläuten.
   *
   * Der Zustand trägt die vollständige Wahrheit: Der Renderer vergleicht die
   * Gesundheit jeder Figur und meldet jedes Absinken (`Renderer#nimmTreffer`).
   * Hier wird daraus ein Klang — mit der Härte aus dem Schadensanteil und mit
   * einem AKUSTISCHEN Dämpfer: Hat der Ereigniszweig im selben Bild schon einen
   * Trefferklang erzeugt (gemessen am Zähler des Mischers), bleibt dieser Weg
   * still. Zwei Klänge übereinander wären ein doppelter Treffer.
   *
   * Es entsteht KEIN neuer Klang: benutzt wird `SoundMixer#spieleTreffer` mit
   * dem vorhandenen Rezept (`sound.js#treffer`) — ein Kratzer klingt dunkler als
   * ein Volltreffer, sonst nichts.
   */
  #spieleTrefferklang() {
    const treffer = this.renderer.nimmTreffer?.() ?? [];
    /*
     * Der Zähler wird IMMER gelesen, auch ohne Treffer: Sonst bliebe er stehen,
     * und der nächste echte Klang des Ereigniszweigs sähe wie ein Zuwachs in
     * genau diesem Bild aus (er hätte den Zustandstreffer verschluckt).
     */
    const zaehler = this.sound?.gezaehlt?.treffer ?? 0;
    const ueberEreignis = zaehler > this.letzterTrefferklang;
    this.letzterTrefferklang = zaehler;

    if (treffer.length === 0 || ueberEreignis) return;
    for (const t of treffer) {
      this.sound?.spieleTreffer(haerteAusTreffer(t.schaden, t.maxHealth), {
        schaden: t.schaden, maxHealth: t.maxHealth, x: t.x, y: t.y,
      });
    }
  }

  /** Hinweiston, wenn eine Waffe des aktiven (eigenen) Spielers wieder nachgeladen ist. */
  #pruefeNachladen(state) {
    const aktive = state?.entities?.find(e => e.entityId === state.activePlayerId) ?? null;
    const rest = aktive?.cooldowns;
    if (!rest || (this.mode === 'online' && !this.network?.isMyTurn)) {
      this.cooldownMerker = null;
      return;
    }
    const alt = this.cooldownMerker;
    if (alt && alt.id === aktive.entityId) {
      for (const waffe of Object.keys(alt.werte)) {
        if (alt.werte[waffe] > 0 && !(rest[waffe] > 0)) {
          this.sound?.verarbeite({ type: 'bereit' });
          break;
        }
      }
    }
    this.cooldownMerker = { id: aktive.entityId, werte: { ...rest } };
  }

  /** Meldet eine Wirkung auf den Schützen im Protokoll. */
  #logSpecialEffect(payload) {
    const name = this.#nameOf(payload.playerId);
    switch (payload.kind) {
      case 'heal':
        this.hud.log(payload.healed > 0
          ? `${name} heilt ${Math.round(payload.healed)} Lebenspunkte`
          : `${name} ist bereits vollständig geheilt`, payload.healed > 0 ? 'good' : 'neutral');
        break;
      case 'shield':
        this.hud.log(`${name} erhält ${Math.round(payload.shield)} Schild`, 'accent');
        break;
      case 'damage_boost':
        this.hud.log(`${name} macht ×${payload.multiplier} Schaden`, 'accent');
        break;
      case 'armor':
        this.hud.log(`${name} nimmt ${Math.round(payload.reduction * 100)} % weniger Schaden`, 'accent');
        break;
      case 'ammo':
        this.hud.log(payload.restored > 0
          ? `${name} füllt ${payload.restored} Ladungen nach`
          : `${name} hat nichts nachzufüllen`, payload.restored > 0 ? 'good' : 'neutral');
        break;
      case 'move':
        this.hud.log(`${name} versetzt sich um ${Math.round(Math.hypot(payload.moved?.dx ?? 0, payload.moved?.dy ?? 0))} px`, 'accent');
        break;
      case 'reveal':
        this.hud.log(`${name} ist für ${payload.revealedTurns} Züge aufgedeckt`, 'accent');
        break;
      case 'random':
        this.hud.log(`${name}: Zufallswirkung ${payload.randomKind}`, 'accent');
        break;
      default:
        this.hud.log(`${name} nutzt eine Wirkung (${payload.kind})`);
    }
  }

  /**
   * Legt die Vorhersage für den eigenen Schuss an.
   *
   * Der Client kennt alles, was die Bahn bestimmt: die eigene Position aus dem
   * Zustand, Klasse und Archetyp aus der Bestandsnachricht, den Waffenfaktor aus
   * dem Katalog und das Terrain aus dem rekonstruierten Bitmap. Damit rechnet er
   * mit DENSELBEN Zahlen und derselben Schleife wie der Server — die
   * Vorhersage ist deshalb keine Schätzung, sondern die Bahn, die der Server
   * gleich bestätigen wird.
   *
   * Sie läuft NUR im Online-Modus: Lokal ist der Schuss ohnehin sofort da, eine
   * zweite Anzeige wäre eine Doppelung.
   */
  #startShotPrediction(angle, power) {
    if (this.mode !== 'online') return;

    const zustand = this.onlineViewState;
    const playerId = zustand?.activePlayerId ?? null;
    if (playerId === null) return;
    const eigene = zustand.entities.find(entity => entity.entityId === playerId);
    if (!eigene) return;

    const waffe = eigene.activeWeaponId ? getWeapon(eigene.activeWeaponId) : null;

    /*
     * Selbstwirkende Waffen verschießen kein Geschoss (Heilung, Schild,
     * Teleport). Eine Bahn dafür zu zeichnen wäre schlicht falsch — sie zeigen
     * eine Flugkurve, die es nicht gibt. Der Server meldet die Wirkung als
     * `special_effect`; die Anzeige folgt dort.
     */
    if (waffe && waffe.delivery !== 'projectile' && waffe.delivery !== 'hitscan') return;

    // Terrainprüfung, sofern die Karte rekonstruiert ist. Ohne sie endet die
    // Bahn an der Kartengrenze — sichtbar besser als gar keine Vorhersage.
    const terrain = this.remoteTerrain;
    const breite = terrain?.width ?? this.renderer.width;
    const hoehe = terrain?.height ?? this.renderer.height;
    const isSolid = terrain?.bitmap
      ? (x, y) => (
        x >= 0 && y >= 0 && x < terrain.width && y < terrain.height
          ? Boolean(terrain.bitmap[y * terrain.width + x])
          : false
      )
      : null;

    /*
     * FUND (belegt, E2E): Diese Rechnung stand VOR der Zeile, die `breite`
     * definiert — sie lag damit in der Temporal Dead Zone: `Cannot access
     * 'breite' before initialization`. Die Online-Vorhersage brach ab, sobald
     * ein Spieler schoss. Gefunden hat das der E2E-Lauf (`multiplayer`,
     * `network-conditions`), nicht die Unit-Tests: `src/client/main.js` ist nur
     * im Browser ausführbar. Deshalb steht die Terrain- und Kartenbreiten-
     * Bestimmung jetzt DARÜBER.
     */
    const faktor = launchSpeedMultiplier({
      classId: eigene.classId,
      archetypeId: eigene.archetypeId,
      weapon: waffe,
      // Ohne den Sidegrade zeigte die Vorhersage eine Bahn, die der Server
      // anders rechnet — er geht in dieselbe combatProfile-Verrechnung ein.
      sidegradeId: eigene.sidegradeId ?? null,
      // Die Kartenbreite gehört in dieselbe Rechnung wie im Motor.
      kartenbreite: breite,
    });

    const trajectory = predictTrajectory({
      x: eigene.x,
      y: eigene.y,
      angle,
      power,
      speedMultiplier: faktor,
      gravityScale: waffe?.gravityScale ?? 1,
      wind: zustand.wind ?? 0,
      width: breite,
      height: hoehe,
      isSolid,
    });

    this.shotPredictor.begin({
      playerId,
      angle,
      power,
      weaponId: eigene.activeWeaponId ?? null,
      tick: zustand.tick ?? null,
      trajectory,
    });
  }

  /** Zeichnet den Strahl eines Hitscan-Schusses zwischen Schütze und Einschlag. */
  #drawHitscanBeam(payload) {
    // currentState() liefert den lokalen ODER den Online-Zustand, damit
    // Soforttreffer in beiden Betriebsarten sichtbar sind.
    const state = this.currentState();
    if (!state) return;
    const shooter = state.entities.find(entity => entity.entityId === payload.playerId);
    if (!shooter) return;
    this.renderer.addBeam(
      shooter.x,
      shooter.y,
      payload.hitX,
      payload.hitY,
      { hit: Boolean(payload.hit), waffeId: payload.weaponId },
    );
  }

  /**
   * Wählt die Kulisse für eine Karte und setzt sie im Renderer.
   *
   * Die Wahl ist deterministisch: gleicher Seed und gleiches Gelände ergeben
   * dieselbe Kulisse. Eine zufällige Kulisse je Anzeige würde das Bild vom
   * aufgezeichneten Spielgeschehen trennen — ein Replay zeigte eine andere
   * Landschaft als das Original.
   */
  /**
   * Zeigt das Glücksrad und dreht auf den bereits feststehenden Ausgang zu.
   *
   * Der Ausgang kommt aus der Simulation. Die Anzeige würfelt NICHT selbst: Sonst
   * könnten zwei Clients verschiedene Ergebnisse zeigen, und ein Bearbeiter der
   * Seite könnte sich den besten Ausgang aussuchen.
   *
   * @param {object} payload - Ereignis aus dem Match (outcome, label, detail, ...)
   */
  showGuentherWheel(payload) {
    const overlay = document.getElementById('guenther-wheel');
    const canvas = document.getElementById('wheel-canvas');
    const ergebnis = document.getElementById('wheel-result');
    const detail = document.getElementById('wheel-detail');
    const panel = overlay?.querySelector('.wheel-panel');
    if (!overlay || !canvas) return;

    const index = Math.max(0, GUENTHER_WHEEL.findIndex(o => o.id === payload.outcome));
    const istHeimdall = payload.outcome === 'heimdall';

    overlay.hidden = false;
    if (panel) panel.classList.toggle('heimdall', istHeimdall);
    if (ergebnis) ergebnis.textContent = istHeimdall ? '⚡ Das Gjallarhorn erklingt …' : '';
    if (detail) detail.textContent = '';

    // Heimdall bekommt die volle Animation: Blitze und Bifröst über dem Feld.
    if (istHeimdall) this.renderer.addHeimdall(this.match?.seedManager?.baseSeed ?? 0);

    const ctx = canvas.getContext('2d');
    const mitte = canvas.width / 2;
    const radius = mitte - 12;
    const segment = (Math.PI * 2) / GUENTHER_WHEEL.length;
    const farben = ['#f4a261', '#90be6d', '#4cc9f0', '#ef476f', '#9d4edd'];

    const zeichne = versatz => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < GUENTHER_WHEEL.length; i++) {
        const start = i * segment + versatz - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(mitte, mitte);
        ctx.arc(mitte, mitte, radius, start, start + segment);
        ctx.closePath();
        ctx.fillStyle = farben[i % farben.length];
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(12,9,6,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    // Drehen: schnell anlaufen, ausrollen, dann auf dem Ausgang stehen bleiben.
    const ziel = -index * segment - segment / 2;
    const umdrehungen = Math.PI * 2 * 3;
    const dauer = istHeimdall ? 2600 : 1800;
    const start = performance.now();

    const schritt = jetzt => {
      const t = Math.min(1, (jetzt - start) / dauer);
      // Ausrollen: schnell los, langsam ankommen.
      const e = 1 - (1 - t) ** 3;
      zeichne(-umdrehungen * e + ziel * e);

      if (t < 1) {
        requestAnimationFrame(schritt);
        return;
      }
      if (ergebnis) ergebnis.textContent = payload.label ?? payload.outcome;
      if (detail) detail.textContent = payload.detail ?? '';
      this.hud.log(`Günther: ${payload.label ?? payload.outcome}`, istHeimdall ? 'accent' : 'neutral');
    };
    requestAnimationFrame(schritt);

    // Nach genügend Zeit wieder ausblenden; bei Heimdall später, damit die
    // Verwandlung sichtbar bleibt.
    clearTimeout(this.guentherTimer);
    this.guentherTimer = setTimeout(() => { overlay.hidden = true; }, istHeimdall ? 6000 : 3200);
  }

  /**
   * Setzt Bühnenklasse und Zeichenfläche auf die Kartenausrichtung.
   *
   * Die Bühne bekommt eine Klasse, weil die Seitenverhältnisse in CSS stehen und
   * nicht in JavaScript — Schrift und Bedienelemente skalieren dort mit.
   */
  #applyOrientation(orientation, breite, hoehe) {
    const stage = document.getElementById('stage');
    if (stage) {
      stage.classList.toggle('portrait', orientation === 'portrait');
      stage.classList.toggle('landscape', orientation !== 'portrait');
    }
    this.renderer.resize(breite, hoehe);
    this.#setzeKameraGroesse(breite, hoehe);
    this.hudAusweichen?.markiere();
  }

  /**
   * Erzeugt oder aktualisiert die Kamera für die Kartenmaße.
   *
   * ## Zwei Fälle
   *
   * Beim ersten Match entsteht die Kamera. Wechselt später die Kartengröße
   * (anderes Preset, andere Spielerzahl), werden nur die Maße neu gesetzt — die
   * Zoom-Einstellung des Spielers bleibt dann erhalten.
   *
   * ## Warum die Schirmgröße gebraucht wird
   *
   * Der Standardzoom passt die Karte in den Bildschirm ein. Ohne die
   * tatsächliche Fenstergröße könnte er das nicht rechnen, und auf einem
   * großen Fernseher wäre die Figur so klein wie auf dem Laptop.
   */
  #setzeKameraGroesse(kartenBreite, kartenHoehe) {
    const schirmBreite = this.canvas?.width ?? this.canvas?.clientWidth ?? 0;
    const schirmHoehe = this.canvas?.height ?? this.canvas?.clientHeight ?? 0;
    if (!(schirmBreite > 0) || !(schirmHoehe > 0)) return;

    if (!this.kamera) {
      this.kamera = new Camera({
        mapBreite: kartenBreite,
        mapHoehe: kartenHoehe,
        schirmBreite,
        schirmHoehe,
      });
      this.renderer.setKamera(this.kamera);
      return;
    }

    this.kamera.setzeKarte(kartenBreite, kartenHoehe);
    this.kamera.setzeSchirm(schirmBreite, schirmHoehe);
  }

  /**
   * Baut die generative Kulisse aus Seed und Geländeform.
   *
   * Öffentlich, weil der Online-Weg sie nach dem Verbindungsaufbau braucht: der
   * Server liefert nur Seed und Ausrichtung, die Kulisse entsteht daraus auf
   * beiden Seiten gleich.
   */
  setSceneryFromSeed(seed, preset, biomId = null) {
    const kulisse = pickScenery(seed, preset, biomId);
    this.renderer.setScenery(kulisse);
    return kulisse;
  }

  #applyBackdrop(seed, preset, gewaehlt = null, charakter = this.match?.kartencharakter ?? null) {
    // Ohne ausdrücklichen Wert gilt die im Menü getroffene Wahl. Nötig, weil der
    // Online-Weg das Gelände erst nach dem Verbindungsaufbau aufbaut und die Wahl
    // sonst verloren ginge.
    const wahl = gewaehlt ?? this.gewaehlteKulisse ?? '';
    const auswahl = wahl === 'automatisch' ? '' : wahl; // 'automatisch': kein fester Schlüssel, der Kartencharakter entscheidet
    // Eine ausdrückliche Wahl des Spielers schlägt die Ableitung aus dem Seed.
    // Sonst könnte man die Kulisse im Menü wählen und bekäme trotzdem eine andere.
    let kulisse = null;
    if (auswahl) {
      const [biomId, variantenId] = String(auswahl).split('/');
      kulisse = getBackdrop(biomId, variantenId);
      if (!kulisse) this.hud.log(`Kulisse „${auswahl}" unbekannt — nehme automatisch`, 'neutral');
    }
    /*
     * Ohne Wahl des Spielers entscheidet der CHARAKTER der Karte.
     *
     * FUND (belegt): Bisher kam die Kulisse aus `pickBackdrop(seed, preset)` —
     * der Seed wählte also nur die Variante innerhalb der Geländeformen, die
     * das Preset zuließ. Mit dem autonomen Generator gibt es kein Preset mehr:
     * Der Charakter sagt, was für eine Karte es ist (Küste, Höhle, Gebirge),
     * und daraus folgt das Biom.
     *
     * Das ist der Unterschied zwischen „zufälligem Aussehen" und „stimmiger
     * Szene": Eine durchlöcherte Kaverne mit grünem Gras darauf wäre nicht
     * hässlich, sondern falsch.
     */
    if (!kulisse && charakter) {
      const biomId = biomFuerCharakter(charakter);
      const biom = BACKDROP_BIOMES.find(b => b.id === biomId);
      kulisse = kulisseFuerBiom({ seed, biome: biom });
    }
    if (!kulisse) kulisse = pickBackdrop(seed, preset);
    if (!kulisse) {
      this.renderer.setBackdrop(null);
      return null;
    }
    this.renderer.setBackdrop(kulisse, {
      // Ein Ladefehler wird gemeldet statt verschwiegen: eine stumm fehlende
      // Kulisse wäre nicht von einer absichtlich leeren zu unterscheiden.
      onError: fehler => this.hud.log(`Kulisse: ${fehler.message}`, 'danger'),
    });
    return kulisse;
  }

  #afterWorldReady(bitmap, water) {
    this.renderer.stoffkarte = this.match.stoffkarte ?? null;
    this.renderer.buildTerrainLayer(bitmap, this.match.width, this.match.height);
    /*
     * Neue Karte: Alles, was sich das Gefühl gemerkt hat, gehört zur ALTEN.
     * Das schließt die Splitter ein (`particles`) — sie standen hier vorher
     * einzeln, und mit ihnen wären Narben, Spuren und die Gesundheitswerte der
     * vorigen Figuren stehen geblieben.
     */
    this.renderer.gefuehlZuruecksetzen();
    this.hud.clearLog();
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.water = water;

    const first = this.match.players[0];
    const firstAngle = first?.teamId === 0 ? Math.PI / 4 : (Math.PI * 3) / 4;
    this.input.reset(firstAngle, 55);
    this.aim = { angle: firstAngle, power: 55 };
  }

  #showEndScreen(winnerTeamId) {
    if (this.endOverlay.hidden === false) return;
    this.running = false;
    /*
     * Der Abbruch verschwindet mit dem Match.
     *
     * Der Knopf heißt „Match verlassen" — im Endbildschirm gibt es kein Match
     * mehr zu verlassen. Der Rückweg ins Menü steht dort als eigener Knopf.
     */
    this.#zeigeAbbruch(false);
    this.winnerText.textContent = winnerTeamId === null || winnerTeamId === undefined
      ? 'Unentschieden — niemand überlebt'
      : `Team ${winnerTeamId + 1} gewinnt`;
    this.winnerText.style.color = winnerTeamId === null || winnerTeamId === undefined
      ? '#e8eef5'
      : TEAM_COLORS[winnerTeamId % TEAM_COLORS.length];
    this.endSummary.textContent = this.mode === 'online'
      ? `Online-Match — Lobby ${this.network?.lobbyId ?? '-'}, ${this.network?.latencyMs ?? 0} ms`
      : `${this.match.round} Runden, ${this.match.world.tickCount} Simulationsticks, Seed ${this.match.seedManager.baseSeed}`;
    this.endOverlay.hidden = false;

    /*
     * Kennzahlen verbuchen und anzeigen.
     *
     * Erst hier, nicht im `step()`: Ein Match kann auf mehrere Wege enden, und
     * `#verbucheMatch` verbucht nur einmal (`verbucht`-Merker). Sonst zählte ein
     * mehrfach ausgelöster Endbildschirm dieselbe Partie doppelt.
     */
    this.#verbucheMatch();
    this.#zeigeMatchKennzahlen();

    // Neu freigeschaltete Erfolge melden — im Protokoll, damit sie ohne das
    // Menü sichtbar sind. Ein Erfolg, den niemand bemerkt, ist keiner.
    for (const e of this.neueErfolge ?? []) {
      this.hud.log(`Erfolg: ${e.title}`, 'accent');
    }
  }

  /**
   * Zeigt die Kennzahlen der gerade beendeten Partie im Endbildschirm.
   *
   * Bewusst mit den Zahlen der PARTIE: Das Gesamtprofil steht im Menü, hier geht
   * es um das eben Gespielte — sonst wüsste man nach einer Partie nicht, was man
   * darin geleistet hat.
   */
  #zeigeMatchKennzahlen() {
    const ziel = document.getElementById('match-kennzahlen');
    if (!ziel || !this.stats) return;
    const zusammenfassung = this.stats.zusammenfassung(this.eigeneSpielerIds);
    const figuren = zusammenfassung.figuren;
    const eigener = zusammenfassung.eigener;

    const zeilen = [];
    if (eigener) {
      zeilen.push(['Dein Schaden', String(eigener.schaden)]);
      zeilen.push(['Deine Schüsse', `${eigener.schuesse} (${eigener.treffer} Treffer)`]);
      if (eigener.trefferquote !== null) {
        zeilen.push(['Trefferquote', `${Math.round(eigener.trefferquote * 100)} %`]);
      }
      zeilen.push(['Deine Züge', String(eigener.zuege)]);
      if (eigener.lieblingswaffe) zeilen.push(['Meistgenutzt', eigener.lieblingswaffe.waffeId]);
    }
    zeilen.push(['Runden', String(zusammenfassung.runden)]);
    zeilen.push(['Spielzeit', `${Math.round(zusammenfassung.dauerSekunden)} s`]);
    zeilen.push(['Schaden gesamt', String(zusammenfassung.schadenGesamt)]);

    ziel.replaceChildren(...zeilen.map(([bezeichnung, wert]) => {
      const zeile = document.createElement('div');
      zeile.className = 'profil-zeile';
      const name = document.createElement('span');
      name.className = 'profil-name';
      name.textContent = `${bezeichnung}:`;
      const wertEl = document.createElement('span');
      wertEl.className = 'profil-wert';
      wertEl.textContent = wert;
      zeile.append(name, wertEl);
      return zeile;
    }));

    // Die Tabelle aller Spieler steht daneben — sie zeigt, wer was beigetragen hat.
    const tabelle = document.getElementById('match-tabelle');
    if (tabelle) {
      const kopf = ['Spieler', 'Schaden', 'Schüsse', 'Treffer'];
      // Jede EIGENE Figur ist „du" — im Modus der Matcharten sind das mehrere.
      const zeilenAlle = figuren.map(f => [
        `P${f.playerId}${this.eigeneSpielerIds.includes(f.playerId) ? ' (du)' : ''}`,
        String(f.schaden),
        String(f.schuesse),
        f.trefferquote === null ? '—' : `${Math.round(f.trefferquote * 100)} %`,
      ]);
      const thead = document.createElement('thead');
      const kopfZeile = document.createElement('tr');
      kopfZeile.append(...kopf.map(t => {
        const th = document.createElement('th');
        th.textContent = t;
        return th;
      }));
      thead.append(kopfZeile);
      const tbody = document.createElement('tbody');
      tbody.append(...zeilenAlle.map(werte => {
        const tr = document.createElement('tr');
        tr.append(...werte.map(w => {
          const td = document.createElement('td');
          td.textContent = w;
          return td;
        }));
        return tr;
      }));
      tabelle.replaceChildren(thead, tbody);
    }
  }

  #loop(timestamp) {
    this.animationHandle = requestAnimationFrame(time => this.#loop(time));
    if (this.mode === 'local' && !this.match) return;
    if (this.mode === 'online' && !this.network) return;

    if (this.lastFrameTime === 0) this.lastFrameTime = timestamp;
    let delta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    /*
     * Die Zeit läuft nicht rückwärts (FUND 2026-10-23, gemessen).
     *
     * Nach dem Matchstart kam hier ein negativer Sprung an (rund -670 ms,
     * `renderer.time` stand danach bei -40,8 Bildern und kroch 40 Bilder lang
     * zurück). Ein negativer Zeitschritt rechnet den Akkumulator herunter und
     * lässt Effekte, Partikel und die Wasserebene ALTERN, statt zu wachsen —
     * die Wasserspiegel-Ringe bekamen dadurch negative Radien und die
     * Canvas-API warf `IndexSizeError`. Gemessen ist der negative Sprung
     * selbst; WORAUS der kleinere Zeitstempel kommt, ist nicht belegt (der
     * Startpfad setzt `lastFrameTime` zurück und wartet auf den nächsten
     * rAF-Takt). Ein Zeitschritt unter null hat fachlich keine Bedeutung,
     * deshalb wird er hier auf 0 geklemmt — unabhängig von der Ursache.
     */
    if (delta < 0) delta = 0;
    if (delta > 250) delta = FIXED_TIMESTEP; // Tab war inaktiv: nicht nachholen
    this.input?.update(delta, timestamp); // gehaltenes Zielen, Erneuerung der Gehabsicht
    this.accumulator += delta;

    let steps = 0;
    if (this.autoLoop && this.mode === 'local') {
      while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
        this.step();
        this.accumulator -= FIXED_TIMESTEP;
        steps++;
        if (this.match.status !== 'playing') break;
      }
    }

    /*
     * Wiedergabe einer Aufzeichnung.
     *
     * Eigener Zweig statt `step()`: Dort wird die lokale Simulation
     * weitergerechnet, hier aber ein aufgezeichnetes Match nachgespielt. Die
     * Schrittweite wird durch das Tempo geteilt — bei 2× vergehen pro Tick nur
     * halb so viele Millisekunden, es laufen also doppelt so viele Takte je
     * Sekunde.
     */
    if (this.mode === 'replay' && this.replayPlayer && this.replayPlaying) {
      while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
        if (!this.replayPlayer.step()) {
          this.replayPlaying = false;
          break;
        }
        this.accumulator -= FIXED_TIMESTEP / Math.max(0.25, this.replaySpeed);
        steps++;
      }
      this.#afterReplayStep();
      this.#setReplayStatus();
    }

    this.#render(delta / FIXED_TIMESTEP);
  }

  /**
   * Die Eingabe der Kameraregie aus dem Anzeigezustand. Nur lesend: lokal, online,
   * Replay und Zuschauer liefern denselben Zustand, deshalb gilt überall dieselbe Führung.
   */
  #kameraEingabe(state, wiederholung, waffe, meinZug) {
    const kamera = this.kamera;
    const aktiv = state.entities.find(e => e.entityId === state.activePlayerId && e.alive)
      ?? null;
    const t = kamera.transformation({ ohneStoss: true });
    const masse = this.renderer.figurMasse();
    const winkel = (meinZug && this.mode !== 'replay') ? this.aim.angle : (aktiv?.angle ?? 0);
    const krater = this.renderer.letzterKrater;
    return {
      karte: kamera.karte,
      schirm: kamera.schirm,
      rand: this.hudAusweichen.randFuerKamera(),
      // Grob gerundet (nach oben): Die Maße hängen schwach vom Zoom ab, und ohne Rundung
      // schaukelte sich Zielzoom und Figurgröße gegenseitig auf.
      pad: {
        halb: Math.ceil(masse.halbBreite * t.skalierung / 24) * 24,
        oben: Math.ceil(masse.oben * t.skalierung / 48) * 48,
        unten: Math.ceil(masse.unten * t.skalierung / 24) * 24,
      },
      zoomMax: ZOOM_GRENZEN.max,
      ansicht: kamera.ansicht(),
      aktivId: state.activePlayerId,
      aktiv: aktiv ? { x: aktiv.x, y: aktiv.y, winkel } : null,
      gegner: state.entities.filter(e => e.alive && aktiv && e.teamId !== aktiv.teamId).map(e => ({ x: e.x, y: e.y })),
      geschosse: (state.projectiles ?? []).slice(0, 8).map(p => ({ x: p.x, y: p.y })),
      wiederholung: wiederholung ? { kopf: wiederholung.kopf, ursprung: wiederholung.spur[0] } : null,
      krater: krater ? { id: krater, x: krater.x, y: krater.y, radius: krater.radius } : null,
      waffe: waffe ? { kategorie: waffe.category, radius: waffe.blastRadius ?? 0 } : null,
      tier: this.renderer.tierBuehne.kameraAuftritt(),
    };
  }

  #render(dt = 1) {
    const state = this.currentState();
    if (!state) return;

    const playerId = state.activePlayerId;
    const myTurn = this.mode === 'online'
      ? this.network?.isMyTurn === true
      : state.status === 'playing' && playerId !== null;

    /*
     * Der Ladefortschritt gehört ins Bild — und in die Rechnung, die gezeigt wird.
     *
     * `chargeRatio` gab es schon, es hat ihn nur niemand gelesen: Wer hielt,
     * sah nichts und schoss mit derselben Kraft wie ein Tipp. Hier wird derselbe
     * Wert benutzt, den `fire()` beim Loslassen bekommt — Zielhilfe, HUD-Zahl
     * und der Schuss selbst zeigen deshalb dieselbe Kraft. Zwei getrennte
     * Rechnungen könnten auseinanderlaufen, und der Spieler sähe eine Kraft, die
     * nicht die seine ist.
     */
    // Touch-Aktionen nur am eigenen Zug im lokalen/Online-Spiel (nicht im Replay, nicht im Menü).
    const touchFeld = document.getElementById('touch-aktionen');
    if (touchFeld) touchFeld.hidden = !(myTurn && this.mode !== 'replay');
    const laufFeld = document.getElementById('touch-laufen');
    if (laufFeld) laufFeld.hidden = !(myTurn && this.mode !== 'replay');
    const laedt = this.input.isCharging;
    const ladeAnteil = laedt ? this.input.chargeRatio : null;
    const ladeKraft = laedt ? kraftAusLadung(ladeAnteil) : null;
    const feuerKnopf = document.getElementById('hud-fire');
    if (feuerKnopf) {
      feuerKnopf.style.setProperty('--ladung', String(ladeAnteil ?? 0));
      feuerKnopf.disabled = !(myTurn && this.mode !== 'replay');
    }
    const wiederholung = this.#zugpauseAnzeige(state);

    const aimPreview = (myTurn && this.mode === 'local')
      ? this.match.aimPreview(playerId, this.aim.angle, ladeKraft ?? this.aim.power)
      : null;

    /*
     * FUND (belegt, Audit 2026-10-09, B-2): Hier stand ein Bildzähler mit
     * Rest 4 (`(zaehler + 1) % 4`), und der Renderer bekam das Wasser nur in
     * jedem vierten Bild. Da der Bildschirm jeden Frame geleert wird, war
     * Wasser in drei von vier Bildern unsichtbar. Das Wasser geht jetzt in
     * JEDEM Bild an den Renderer (siehe unten, `water:`), und die Ebene wird
     * auch in jedem Bild neu berechnet (`wasserNeu: true`) — der Puffer dafür
     * wird wiederverwendet, es entsteht also kein Müll je Bild.
     */

    /*
     * Die laufende Schussvorhersage wird ZUSÄTZLICH als Aim-Vorschau
     * gezeichnet, aber in eigener Farbe: Sie ist eine andere Aussage als die
     * Zielhilfe („so fliegt der abgegebene Schuss") und darf mit ihr nicht
     * verwechselt werden. Der Renderer trennt beide Wege.
     */
    this.shotPredictor.expire();
    const prediction = this.mode === 'online' ? this.shotPredictor.pending?.trajectory ?? null : null;

    // Flächenwirkung der gewählten Waffe für die Radius-Vorschau.
    const activeEntity = state.entities.find(entity => entity.entityId === playerId);
    const activeWeapon = activeEntity?.activeWeaponId ? getWeapon(activeEntity.activeWeaponId) : null;

    /*
     * Kamera auf den aktiven Spieler richten — und in dieser Ansicht auch
     * bleiben, während ein Geschoss fliegt.
     *
     * FUND (belegt): Ohne Kamera war die Karte genau so groß wie das Fenster.
     * Die Folge auf einem großen Bildschirm: Man sah alles auf einmal, und
     * eine größere Karte bedeutete nur kleinere Figuren.
     *
     * Die Ausrichtung geschieht VOR dem Zeichnen, damit die Verschiebung im
     * selben Bild gilt. Sie ändert nichts am Zustand — ein Replay bleibt
     * reproduzierbar, egal wohin die Kamera zeigt.
     */
    // Tier-Bühne altern lassen (Blasen, Teilchen, Auftritt); Signale gehen ins Protokoll und an den Klang.
    {
      const tierJetzt = performance.now();
      const tierDt = this.tierZeit ? (tierJetzt - this.tierZeit) / 1000 : 0;
      this.tierZeit = tierJetzt;
      for (const signal of this.renderer.tierBuehne.schritt(state, tierDt, this.renderer.reducedMotion)) {
        if (signal.typ === 'guenther_auftritt') {
          this.hud.log('Günther betritt die Karte', 'neutral');
          this.sound?.verarbeite({ type: 'bellen', x: signal.x, y: signal.y, pegel: 0.7 });
        }
      }
    }
    if (this.kamera) {
      // HUD-Ränder messen, Schilder und Schub setzen (nur Darstellung).
      this.hudAusweichen.aktualisiere(state, this.kamera);
      const jetzt = performance.now();
      const dtSek = this.kameraZeit ? (jetzt - this.kameraZeit) / 1000 : 0;
      this.kameraZeit = jetzt;
      this.kameraRegie.setzeReduziert(this.renderer.reducedMotion);
      const kameraAus = this.kameraRegie.schritt(dtSek, this.#kameraEingabe(state, wiederholung, activeWeapon, myTurn));
      // Beben der Tiere (Cookie tobt, Schockwelle, wildes Bellen) kommt als Versatz obendrauf; 0 bei Bewegungsreduktion.
      const beben = this.renderer.tierBuehne.versatz();
      if (kameraAus) {
        this.kamera.setzeAnsicht(kameraAus.x, kameraAus.y, kameraAus.zoom);
        this.kamera.setzeStoss(kameraAus.stoss.x + beben.x, kameraAus.stoss.y + beben.y);
        this.kameraRegie.uebernimm(this.kamera.ansicht());
      } else {
        this.kamera.setzeStoss(beben.x, beben.y);
      }
      // Rest-Schritt: Schub der nicht scrollenden Achse weich annähern.
      this.kamera.schritt();
      this.kameraSteuerung.aktualisiereKnopf();
    }

    this.renderer.render(state, {
      aimPreview,
      prediction,
      // Während des Ladens zeigt die Anzeige die aufgeladene Zahl — dieselbe,
      // mit der der Schuss beim Loslassen fliegt.
      aim: ladeKraft === null ? this.aim : { angle: this.aim.angle, power: ladeKraft },
      ladeAnteil,
      wiederholung,
      /*
       * Das Wasser wird JEDES Bild berechnet und aufgelegt (B-2). Der Aufwand
       * ist ein Durchlauf über die Wassermaske in ein wiederverwendetes
       * ImageData; die teure Uferkarte hat ihre eigene Drosselung
       * (`Renderer#uferMaske`, nur bei geänderter Geländeebene).
       */
      water: this.mode === 'online' ? null : this.match.water,
      wasserNeu: true,
      blastRadius: activeWeapon?.blastRadius ?? 0,
      dt,
    });
    this.#trackWater(state);
    this.#pruefeNachladen(state);
    /*
     * Der Klang zum Treffer — NACH dem Zeichnen, weil die Treffer im
     * Zeichenaufruf entstehen (siehe `Renderer#nimmTreffer`).
     */
    this.#spieleTrefferklang();
    (this.tierHud ??= new TierHud()).aktualisiere(state, this.renderer.tierBuehne);
    this.hud.update(state, {
      aim: ladeKraft === null ? this.aim : { angle: this.aim.angle, power: ladeKraft },
      onWeaponSelect: index => this.selectWeapon(index),
    });
    {
      // Figurenkarte der aktiven Figur (nur bei gewählter Fraktion).
      const aktive = state.entities?.find(e => e.entityId === state.activePlayerId) ?? null;
      const fraktion = aktive ? this.renderer.fraktionVon(aktive) : null;
      this.figurenKarte.aktualisiere(aktive, fraktion, aktive ? TEAM_COLORS[aktive.teamId % TEAM_COLORS.length] : '');
    }
    // Bei geschlossenem Menü ein No-op; offen: nur bei Änderung wird etwas angefasst.
    this.waffenMenue.aktualisiere(state.entities?.find(e => e.entityId === state.activePlayerId) ?? null);
    if (this.mode === 'online') this.hud.setConnection?.(
      this.network?.state ?? CONNECTION_STATE.IDLE,
      this.network?.latencyMs ?? 0,
    );
  }

  // ---------------------------------------------------------------- Replay

  /**
   * Verdrahtet die Replay-Steuerung im Menü.
   *
   * Die Dateiauswahl liest die Aufzeichnung im Browser (FileReader) — es wird
   * nichts hochgeladen. Eine Aufzeichnung enthält nur Seed und Eingaben, also
   * wenige Kilobyte.
   */
  #wireReplay() {
    const datei = document.getElementById('replay-file');
    datei?.addEventListener('change', async () => {
      const gewaehlt = datei.files?.[0];
      if (!gewaehlt) return;
      try {
        const text = await gewaehlt.text();
        this.loadReplayDocument(JSON.parse(text));
        this.#setReplayStatus(`Geladen: ${gewaehlt.name}`);
      } catch (error) {
        this.#setReplayStatus(`Konnte die Aufzeichnung nicht lesen: ${error.message}`);
        this.hud.log(`Replay nicht lesbar: ${error.message}`, 'danger');
      }
    });

    document.getElementById('replay-toggle')?.addEventListener('click', () => this.replayAction('toggle'));
    document.getElementById('replay-restart')?.addEventListener('click', () => this.replayAction('restart'));
    document.getElementById('replay-back')?.addEventListener('click', () => this.replayAction('step', -60));
    document.getElementById('replay-forward')?.addEventListener('click', () => this.replayAction('step', 60));

    const tempo = document.getElementById('replay-speed');
    tempo?.addEventListener('input', () => {
      this.replaySpeed = Number(tempo.value) || 1;
      const anzeige = document.getElementById('replay-speed-value');
      if (anzeige) anzeige.textContent = `${this.replaySpeed}×`;
      this.#setReplayStatus();
    });

    /*
     * Der Stellenregler springt. Das Neuberechnen kostet Rechenzeit, deshalb
     * passiert es erst beim Loslassen (`change`) und nicht bei jeder Bewegung
     * (`input`) — sonst würde beim Ziehen hundertmal neu gespult.
     */
    document.getElementById('replay-seek')?.addEventListener('change', () => {
      if (!this.replayPlayer) return;
      const anteil = Number(document.getElementById('replay-seek').value) / 1000;
      this.replaySeek(Math.round(anteil * this.replayPlayer.totalTicks));
    });
  }

  /**
   * Lädt eine Aufzeichnung und zeigt sie an.
   *
   * Die Wiedergabe ersetzt das laufende Match: `this.match` zeigt danach auf die
   * Rechnung des Players, damit Zeichnen und HUD unverändert funktionieren.
   * Eingaben sind gesperrt, solange wiedergegeben wird (siehe `fire`).
   *
   * @param {object} dokument - Aufzeichnung (Format aus `npm run replay -- record`)
   * @returns {boolean} true, wenn geladen
   */
  loadReplayDocument(dokument) {
    try {
      this.replayPlayer = new ReplayPlayer(dokument);
    } catch (error) {
      this.replayPlayer = null;
      this.#setReplayStatus(`Ungültige Aufzeichnung: ${error.message}`);
      return false;
    }

    this.enterReplay();
    this.#setReplayStatus();
    return true;
  }

  /** Schaltet in den Wiedergabemodus und setzt die Anzeige auf den Anfang. */
  enterReplay() {
    if (!this.replayPlayer) return this;
    this.network?.disconnect();
    this.network = null;
    this.#setzeZugpauseZurueck();
    this.mode = 'replay';
    this.match = this.replayPlayer.match;
    this.replayPlaying = false;
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    // Im Wiedergabemodus gibt es keinen Abbruch: Er hat eigene Knöpfe, und ein
    // „Match verlassen" wäre dort irreführend — es läuft kein Match.
    this.#zeigeAbbruch(false);
    this.hud.clearLog();
    /*
     * Die Anzeige braucht Gelände und Wasser des nachgespielten Matches. Ohne
     * `#afterWorldReady` bliebe die Spielfläche leer — die Wiedergabe wäre
     * unsichtbar, und die Schleife liefe ohne Bild.
     */
    this.#afterWorldReady(this.match.bitmap, this.match.water);
    this.running = true;
    if (!this.animationHandle) this.#loop(performance.now());
    this.hud.log(
      `Replay geladen — ${this.replayPlayer.totalTicks} Takte, `
      + `${this.replayPlayer.appliedInputs} aufgezeichnete Eingaben`,
      'accent',
    );
    return this;
  }

  /**
   * Steuert die Wiedergabe.
   * @param {string} aktion - 'play' | 'pause' | 'toggle' | 'restart' | 'step'
   * @param {number} [wert] - bei 'step': Takte (negativ = zurück)
   */
  replayAction(aktion, wert) {
    if (!this.replayPlayer) return false;
    switch (aktion) {
      case 'play':
        // Am Ende neu beginnen, sonst passierte nichts.
        if (this.replayPlayer.finished) this.replayPlayer.reset();
        this.#syncReplayMatch();
        this.replayPlaying = true;
        break;
      case 'pause':
        this.replayPlaying = false;
        break;
      case 'toggle':
        return this.replayAction(this.replayPlaying ? 'pause' : 'play');
      case 'restart':
        this.replayPlayer.reset();
        this.#syncReplayMatch();
        this.replayPlaying = false;
        this.hud.clearLog();
        break;
      case 'step': {
        this.replayPlaying = false;
        const takte = Number(wert) || 1;
        if (takte < 0) this.replaySeek(this.replayPlayer.tick + takte);
        else this.replayPlayer.stepMany(takte);
        this.#afterReplayStep();
        break;
      }
      default:
        return false;
    }
    this.#setReplayStatus();
    return true;
  }

  /** Springt an eine Stelle der Aufzeichnung. */
  replaySeek(tick) {
    if (!this.replayPlayer) return 0;
    const erreicht = this.replayPlayer.seek(tick);
    this.#syncReplayMatch();
    this.#afterReplayStep();
    this.#setReplayStatus();
    return erreicht;
  }

  /**
   * Zeigt die Anzeige auf das Match des Players.
   *
   * Fund (belegt): `ReplayPlayer.reset()` — aufgerufen beim Rückspringen und
   * beim Neustart — baut den MatchController NEU. Die Anzeige hielt aber weiter
   * das alte Objekt: Nach einem Rücksprung meldete `replay().tick` korrekt 120,
   * während der gezeichnete Zustand vom Ende des Matches stammte (gemessen:
   * Tick 120, aber Hash des Endzustands). Ohne den Hash-Vergleich im Test wäre
   * das nie aufgefallen — die Anzeige sah nur falsch aus, ohne Fehler zu werfen.
   */
  #syncReplayMatch() {
    if (this.replayPlayer) this.match = this.replayPlayer.match;
  }

  /** Verarbeitet die Ereignisse des letzten Wiedergabeschritts. */
  #afterReplayStep() {
    if (!this.replayPlayer) return;
    this.lastEvents = this.replayPlayer.lastEvents;
    this.#handleEvents(this.lastEvents);
  }

  /**
   * Aktualisiert Fortschritt, Regler und Knöpfe.
   *
   * Der Stellenregler wird nur gesetzt, wenn der Nutzer ihn NICHT gerade hält —
   * sonst würde die Wiedergabe ihn unter dem Finger wegziehen.
   */
  #setReplayStatus(zusatz = null) {
    const bereit = Boolean(this.replayPlayer);
    const knopf = document.getElementById('replay-toggle');
    if (knopf) {
      knopf.disabled = !bereit;
      knopf.textContent = this.replayPlaying ? 'Pause' : 'Abspielen';
    }
    for (const id of ['replay-restart', 'replay-back', 'replay-forward']) {
      const el = document.getElementById(id);
      if (el) el.disabled = !bereit;
    }

    const regler = document.getElementById('replay-seek');
    if (regler) {
      regler.disabled = !bereit;
      if (bereit && document.activeElement !== regler) {
        regler.value = String(Math.round(this.replayPlayer.progress * 1000));
      }
    }
    const balken = document.getElementById('replay-progress');
    if (balken) balken.value = bereit ? Math.round(this.replayPlayer.progress * 1000) : 0;

    if (!zusatz) {
      if (!bereit) this.#setReplayText('Keine Aufzeichnung geladen.');
      else {
        const s = this.replayPlayer;
        this.#setReplayText(
          `Takt ${s.tick} / ${s.totalTicks} · ${Math.round(s.progress * 100)} % · `
          + `${this.replayPlaying ? 'läuft' : 'angehalten'}${s.finished ? ' · Ende' : ''}`
          + ` · Tempo ${this.replaySpeed}×`,
        );
      }
    } else {
      this.#setReplayText(zusatz);
    }
  }

  #setReplayText(text) {
    const el = document.getElementById('replay-status');
    if (el) el.textContent = text;
  }

   // ------------------------------------------------------ Spielerkennzahlen

  /**
   * Lädt das Profil aus dem lokalen Speicher des Browsers.
   *
   * Bewusst fehlertolerant: Ein beschädigter oder fremd geschriebener Eintrag
   * darf das Spiel nicht blockieren. Ein Profil ist Beiwerk — wenn es unlesbar
   * ist, beginnt man eben neu. Ein Fehler wird gemeldet, nicht verschwiegen.
   */
  #ladeProfil() {
    try {
      const roh = globalThis.localStorage?.getItem(PROFIL_SCHLUESSEL);
      if (!roh) return new PlayerProfile();
      return PlayerProfile.fromJSON(JSON.parse(roh));
    } catch (error) {
      this.hud?.log(`Profil konnte nicht geladen werden: ${error.message}`, 'danger');
      return new PlayerProfile();
    }
  }

  /**
   * Schreibt das Profil in den lokalen Speicher.
   *
   * ## Wo das Profil liegt
   *
   * Hier — im Browser des Spielers. Das ist der heutige Ablageort
   * (`identity.js`, `AKTUELLER_ABLAGEORT`). Die Entscheidung über Konten ist
   * offen; sie zu treffen heißt, `identity.js` zu ändern und die Ladefunktion
   * hier auf den Server zu richten. Der Schlüssel und der Hinweistext stehen
   * dort bereits.
   *
   * ## Die Geräte-Kennung
   *
   * Sie wird beim Speichern mitgeschrieben. Sie ist **kein Konto**: eine
   * zufällige Zeichenkette ohne Bezug zu einer Person. Sie erlaubt nur, denselben
   * Browser wiederzuerkennen — die Grundlage dafür, Fortschritt später einem
   * Server zuzuordnen, ohne jemanden zu identifizieren.
   */
  #speichereProfil() {
    try {
      const nutzlast = { ...this.profil.toJSON(), geraet: geraeteKennung() };
      globalThis.localStorage?.setItem(PROFIL_SCHLUESSEL, JSON.stringify(nutzlast));
      return true;
    } catch (error) {
      // Voller oder gesperrter Speicher (Privatmodus): Das Spiel läuft weiter,
      // die Kennzahlen dieser Sitzung sind dann eben nicht dauerhaft.
      this.hud?.log(`Profil konnte nicht gespeichert werden: ${error.message}`, 'danger');
      return false;
    }
  }

  /** Beginnt die Erfassung für ein neues Match. */
  #starteErfassung() {
    const zustand = this.match.getState();
    const teams = new Map(zustand.entities.map(e => [e.entityId, e.teamId]));
    this.stats = new MatchStats({ teams });
    /*
     * Die EIGENEN Figuren: das ganze Team 0, nicht nur die erste Figur.
     *
     * Lokal ist der Platz am Gerät der erste Spieler — und damit Team 0. Früher
     * stand hier `match.activePlayerId`, also GENAU EINE Figur: Im Modus der
     * Matcharten führt ein Mensch aber 3–5 Einheiten, und zwei Drittel seiner
     * Schüsse wären nie in sein Profil gekommen. Welches Team das eigene ist,
     * entscheidet der Startzustand (Team 0).
     */
    const eigene = zustand.entities.filter(e => e.teamId === 0).map(e => e.entityId);
    this.eigeneSpielerIds = eigene.length > 0 ? eigene : [this.match.activePlayerId];
    this.eigenerSpielerId = this.eigeneSpielerIds[0] ?? null;
    return this.stats;
  }

  /**
   * Verbucht ein beendetes Match ins Profil.
   *
   * Wird nur EINMAL je Match aufgerufen — `stats.entschieden` verhindert eine
   * zweite Verbuchung, falls der Endbildschirm mehrfach ausgelöst wird.
   */
  #verbucheMatch() {
    if (!this.stats || this.verbucht) return false;
    const zusammenfassung = this.stats.zusammenfassung(this.eigeneSpielerIds);
    if (!zusammenfassung.entschieden) return false;

    this.profil.merge(zusammenfassung);

    /*
     * Die in dieser Partie benutzten Waffen ins Gesamtprofil übernehmen.
     *
     * „Lieblingswaffe" soll über alle Partien gelten, nicht nur über die letzte.
     * Die Fraktion bleibt offen: Es gibt keine Charakterwahl, also gibt es auch
     * keine Fraktion zu verbuchen (siehe MASTERDOTO).
     */
    const eigener = zusammenfassung.eigener;
    if (eigener) {
      const eigenerEintrag = this.stats.spieler.get(this.eigenerSpielerId);
      if (eigenerEintrag) this.profil.benutzeWaffen(eigenerEintrag.waffen);
    }

    this.verbucht = true;

    /*
     * Erfolge auswerten und verbuchen.
     *
     * Erst HIER, nach `merge` — die Kennzahlen enthalten Partien, Siege und
     * Schaden des Profils, und die sind erst nach dem Verbuchen aktuell. Wer die
     * Erfolge vorher auswertete, verpasste jeden Erfolg, der genau durch diese
     * Partie fällig wurde.
     */
    const erreichtVorher = this.profil.erfolge;
    const werte = erfolgsKennzahlen(
      this.stats.zusammenfassung(this.eigeneSpielerIds),
      this.profil.toJSON(),
    );
    const frisch = neueErfolgeFuer(werte, erreichtVorher);
    this.profil.verbucheErfolge(frisch.map(e => e.id));
    this.neueErfolge = frisch;

    this.#speichereProfil();
    this.#zeigeProfil();
    this.#zeigeErfolge();
    return true;
  }

  /** Aktualisiert die Profilanzeige im Menü. */
  #zeigeProfil() {
    baueProfilAnzeige({ document, profil: this.profil });
  }

  /**
   * Zeigt die Erfolgsübersicht im Menü.
   *
   * Aufbau je Erfolg: Symbol, Titel, Stufe, Stand/Ziel und der HINWEIS, wie er
   * zu holen ist. Der Hinweis steht bewusst auch bei erreichten Erfolgen —
   * sonst sähe die Liste bei jedem erreichten Eintrag anders aus, und man
   * verliert die Erinnerung, wofür er war.
   *
   * Muster-WACHHUND: Die Inhalte sind seit 2026-09-20 gesetzt, `musterAnzahl`
   * ist also 0 und der Zähler schweigt dazu. Die Kennzeichnung bleibt trotzdem
   * stehen — würde ein künftiger Katalog wieder Platzhalter enthalten, darf die
   * Anzeige nicht den Eindruck eines fertigen Katalogs erwecken.
   */
  #zeigeErfolge() {
    baueErfolgsAnzeige({
      document,
      stats: this.stats,
      profil: this.profil,
      eigeneSpielerIds: this.eigeneSpielerIds,
      neueErfolge: this.neueErfolge,
    });
  }

  /**
   * Setzt die Zahlen zurück — die Erfolge bleiben.
   *
   * Nötig, weil die Zahlen im Browser liegen und ein Spieler sie sonst nicht mehr
   * loswird; ein unerreichbarer Zurücksetzen-Knopf wäre eine Sackgasse.
   *
   * Der Knopf heißt „Zahlen zurücksetzen", und genau das tut er. Die ERFOLGE
   * bleiben: Sie sind verdient, keine Kennzahl. Sie mitzunehmen wäre eine
   * Überraschung (niemand erwartet, beim Nullen seiner Statistik seine Abzeichen
   * zu verlieren), und der Name des Knopfes deckt es nicht.
   *
   * Folgerichtig bleiben sie auch nach einem Neuladen: Die Erfolge werden
   * gespeichert, die Zahlen auf 0.
   */
  profilZuruecksetzen() {
    const vorher = this.profil;
    this.profil = new PlayerProfile({
      name: vorher.name,
      // Verdiente Erfolge behalten.
      erfolge: [...vorher.erfolge],
    });
    this.neueErfolge = [];
    try {
      globalThis.localStorage?.setItem(PROFIL_SCHLUESSEL, JSON.stringify(this.profil.toJSON()));
    } catch (error) {
      this.hud?.log(`Profil konnte nicht zurückgesetzt werden: ${error.message}`, 'danger');
    }
    this.#zeigeProfil();
    this.#zeigeErfolge();
    return this.profil;
  }

  /**
   * Schreibt eine Profilsicherung als Datei — der Ausweg aus „nur im Browser".
   *
   * ENTSCHEIDUNG (2026-09-20): Es gibt keine Serverkonten (kein Personenbezug,
   * keine Anmeldung, keine Speicherfrist zu überwachen). Der reale Schaden war
   * aber der Verlust bei einem Browserwechsel. Die Datei löst genau den, ohne
   * ein Konto zu brauchen.
   *
   * @returns {{ok: boolean, text: string|null, fehler: string|null}}
   */
  profilSichern() {
    try {
      const text = sicherungAlsText(this.profil.toJSON(), {
        erstelltAm: new Date().toISOString(),
      });
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anker = document.createElement('a');
      anker.href = url;
      anker.download = 'projectarmageddon-profil.json';
      document.body.append(anker);
      anker.click();
      anker.remove();
      // Erst nach dem Klick freigeben: sonst kann der Download leer ankommen.
      URL.revokeObjectURL(url);
      this.hud?.log('Profilsicherung heruntergeladen', 'active');
      return { ok: true, text, fehler: null };
    } catch (error) {
      this.hud?.log(`Sicherung fehlgeschlagen: ${error.message}`, 'danger');
      return { ok: false, text: null, fehler: error.message };
    }
  }

  /**
   * Lädt eine Profilsicherung aus Text (Dateiinhalt).
   *
   * Eine ungültige Datei wird ABGELEHNT, nicht teilweise übernommen: Ein halb
   * geladenes Profil wäre der schlimmere Zustand — der Spieler sähe Erfolge, die
   * er nie erreicht hat, oder verlöre seine eigenen.
   *
   * @returns {{ok: boolean, fehler: string|null}}
   */
  profilLaden(text) {
    const geprueft = sicherungAusText(text);
    if (!geprueft.ok) {
      this.hud?.log(`Sicherung abgelehnt: ${geprueft.fehler}`, 'danger');
      return { ok: false, fehler: geprueft.fehler };
    }
    const geladen = PlayerProfile.fromJSON(geprueft.profil);
    /*
     * Erfolge VEREINIGEN statt ersetzen.
     *
     * Ein Erfolg, der einmal erreicht war, wird nie wieder abgenommen (siehe
     * `achievements.js`). Eine Sicherung aus einem älteren Stand darf deshalb
     * keinen Erfolg wegnehmen, den dieser Browser schon hat.
     */
    for (const id of this.profil.erfolge) geladen.erfolge.add(id);
    this.profil = geladen;
    this.#speichereProfil();
    this.#zeigeProfil();
    this.#zeigeErfolge();
    this.hud?.log('Profilsicherung geladen', 'active');
    return { ok: true, fehler: null };
  }

  /**
   * Delegiert an `client/debugApi.js` — dort steht, warum sie ausgezogen ist.
   */
  #exposeDebugApi() {
    exposeDebugApi(this);
  }
}

const game = new Game();
// Kader- und Hilfeansicht einmalig aufbauen (eigenes Modul, siehe kaderansicht.js).
buildRosterView();
buildHilfeView();
// Kulissenauswahl füllen, sobald das DOM steht. Der Katalog ist die einzige
// Quelle; die Liste im HTML bleibt bewusst leer.
if (typeof document !== 'undefined') {
  const fuelle = () => {
    game.fillBackdropOptions();
    game.fillBiomOptions();
    // Sidegrade-Felder aus der Config füllen — im Markup steht keine Option.
    game.fillSidegradeOptions();
    // Loadout-Auswahl je Spielerplatz (Klasse und Archetyp entkoppelt).
    game.fillLoadoutOptions();
    game.fillFraktionOptions();
    document.getElementById('cfg-backdrop-suche')?.addEventListener('input', e => game.filterBackdropOptions(e.target.value));
    document.getElementById('ueberrasch-button')?.addEventListener('click', () => { game.ueberraschMich(); game.startFromMenu(); });

    /*
     * Die Loadout-Felder richten sich nach „Teams" und „Spieler pro Team" —
     * nach deren Änderung muss die Liste neu aufgebaut werden, sonst stünden
     * dort Felder für Plätze, die es nicht mehr gibt (oder es fehlten welche).
     */
    for (const id of ['cfg-teams', 'cfg-players']) {
      document.getElementById(id)?.addEventListener('change', () => { game.fillLoadoutOptions(); game.fillFraktionOptions(); });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fuelle, { once: true });
  } else {
    fuelle();
  }
}

export default game;
