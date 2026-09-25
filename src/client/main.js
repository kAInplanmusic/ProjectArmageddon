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
import { isTextEntry } from './dom.js';
import { MatchController, TEAM_COLORS } from '../engine/match.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { InputController } from './input.js';
import { Hud } from './hud.js';
import { NetworkClient, CONNECTION_STATE } from './networkClient.js';
import { buildTerrainForSeed } from './terrainPreview.js';
import { getWeapon, orderInventoryBySubcategory } from '../shared/config/weapons.js';
import { CLASS_IDS, ARCHETYPE_IDS } from '../engine/match.js';
import { pickBackdrop, getBackdrop, BACKDROP_BIOMES } from '../shared/config/backdrops.js';
import { biomFuerCharakter, kulisseFuerBiom } from '../shared/biomwahl.js';
import { SoundMixer } from './soundMixer.js';
import { pickScenery } from '../shared/config/scenery.js';
import { GUENTHER_WHEEL } from '../shared/config/guenther.js';
import { exposeDebugApi } from './debugApi.js';
import { FIXED_TIMESTEP } from '../shared/zeit.js';
import {
  PROFIL_SCHLUESSEL,
  ablageHinweis,
  geraeteKennung,
  sicherungAlsText,
  sicherungAusText,
} from '../shared/identity.js';
import { factionsWithSprites, spriteCount } from './roster.js';
import { COMBAT_ROLES, classOf } from '../shared/config/factions.js';
import {
  uebersichtFuerHilfe, classCounterplay, resolveLoadout, combatProfile,
} from '../shared/config/classes.js';
import { sidegradesForClass } from '../shared/config/sidegrades.js';
import { LOOT_DROP_RULES } from '../shared/config/loot.js';
import { RARITY_IDS, RARITY_WEIGHTS } from '../engine/systems/lootSystem.js';
import { START_TIERS, getClassLoadoutDetail } from '../shared/config/loadouts.js';
import { TERRAIN_PRESETS, TERRAIN_AFFINITY } from '../shared/terrainGen.js';
import { WATER_STATE, waterStateFor } from '../shared/config/water.js';
import { ReplayPlayer } from '../engine/replay.js';
import { ShotPredictor, predictTrajectory, launchSpeedMultiplier } from './shotPrediction.js';
import { MatchStats, PlayerProfile, beschreibe } from '../shared/stats.js';
import {
  kennzahlen as erfolgsKennzahlen,
  neueErfolge as neueErfolgeFuer,
  uebersicht as erfolgsUebersicht,
  emblem,
} from '../shared/achievements.js';

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
const TIER_REIHENFOLGE = ['leicht', 'mittel', 'schwer', 'sehr schwer'];

const MAX_STEPS_PER_FRAME = 8;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);

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
    /*
     * Der Klangmischer.
     *
     * Er erzeugt alle Klänge selbst — es gibt keine Audiodateien. Im
     * Serverbetrieb (RunPod, Hetzner) gibt es kein Ausgabegerät; dort bleibt er
     * stumm, ohne zu scheitern.
     */
    this.sound = new SoundMixer();
    this.match = null;          // lokale Simulation
    this.network = null;        // Online-Verbindung
    this.mode = 'local';
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.running = false;
    this.autoLoop = true;
    this.aim = { angle: Math.PI / 4, power: 55 };
    this.waterFrame = 0;
    this.lastEvents = [];
    /**
     * Letzter bekannter Wasserzustand je Figur — für die Meldungen im Protokoll.
     * Der Zustand selbst steht im Match-State (und kommt im Online-Modus mit dem
     * Snapshot); hier wird nur der ÜBERGANG erkannt.
     */
    this.waterStates = new Map();

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

    this.input = new InputController(this.canvas, {
      getOrigin: () => this.#origin(),
      onAim: (angle, power) => { this.aim = { angle, power }; },
      onFire: () => this.fire(),
      onWeaponSelect: index => this.selectWeapon(index),
      // Aktive Waffe abwerfen (Q).
      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
      // Springen (Leertaste), mit A/D als Richtung.
      onJump: seitlich => this.jump(seitlich),
    });

    this.#bindMenu();
    this.#exposeDebugApi();
  }

  #bindMenu() {
    this.menuOverlay = document.getElementById('menu-overlay');
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
    this.#zeigeAbbruch(false);
    this.winnerText = document.getElementById('winner-text');
    this.endSummary = document.getElementById('end-summary');

    document.getElementById('start-button')?.addEventListener('click', () => this.startFromMenu());
    document.getElementById('rematch-button')?.addEventListener('click', () => {
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
      void this.sound?.starte();

      // Der Neustart darf nicht ausgelöst werden, während in ein Formularfeld
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
  }

  /**
   * Verlässt das laufende Match und kehrt ins Menü zurück.
   *
   * Beide Wege (Taste `R` und der HUD-Knopf) laufen hier zusammen — es gibt
   * nur EINE Umsetzung. Der Unterschied liegt allein in der Rückfrage: Ein
   * Tastendruck kann ein Fehlgriff sein, ein Klick auf einen beschrifteten
   * Knopf ist eine Absicht. Deshalb fragt nur der Knopf nach.
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
    this.mode = 'local';
    this.endOverlay.hidden = true;
    this.menuOverlay.hidden = false;
    this.#zeigeAbbruch(false);
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
  }

  #origin() {
    const state = this.currentViewState;
    if (!state?.activePlayerId) return null;
    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    return active ? { x: active.x, y: active.y } : null;
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
    const orientation = document.getElementById('cfg-orientation')?.value ?? 'landscape';
    // Bodenberechnung: 'auto' versucht WebGPU, alles andere bleibt auf der CPU.
    const gpuWahl = document.getElementById('cfg-gpu')?.value ?? 'off';
    this.#waehleBodenpfad(gpuWahl);
    const rawSeed = document.getElementById('cfg-seed')?.value?.trim();
    const seed = rawSeed === '' || rawSeed === undefined ? undefined : Number(rawSeed);
    const serverUrl = document.getElementById('cfg-server')?.value?.trim() ?? '';
    const lobbyId = document.getElementById('cfg-lobby')?.value?.trim() ?? '';
    const sidegrades = this.#sidegradesAusMenue(teams * playersPerTeam);
    const loadouts = this.#loadoutsAusMenue(teams * playersPerTeam);

    if (serverUrl) {
      return this.startOnline({
        serverUrl, lobbyId, teams, playersPerTeam, unitsPerPlayer, preset, kartentyp, seed,
        backdropKey, orientation, sidegrades, loadouts,
      });
    }
    return this.startMatch({
      teams, playersPerTeam, preset, kartentyp, seed, backdropKey, orientation, sidegrades, loadouts,
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

      const label = document.createElement('span');
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
      const belegt = `${lobby.occupied ?? 0}/${plaetze || '?'}`;
      label.textContent = `${lobby.id} · ${lobby.preset ?? 'hills'} · ${belegt} Plätze`;

      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = lobby.occupied >= plaetze ? 'Voll' : 'Beitreten';
      join.disabled = lobby.occupied >= plaetze;
      join.addEventListener('click', () => {
        const lobbyInput = document.getElementById('cfg-lobby');
        if (lobbyInput) lobbyInput.value = lobby.id;
        if (status) status.textContent = `Lobby ${lobby.id} ausgewählt — auf "Match starten" klicken.`;
      });

      item.append(label, join);
      return item;
    }));
    return { ok: true, count: offen.length };
  }

  /**
   * Wählt den Rechenweg für den Boden anhand der Menüwahl.
   *
   * „auto" ist eine Absichtserklärung, keine Garantie: Ist kein WebGPU
   * vorhanden, bleibt es beim CPU-Weg und der Grund steht im Protokoll. Ein
   * stiller Rückfall wäre nicht von „hat funktioniert" zu unterscheiden — und
   * genau diese Verwechslung soll vermieden werden.
   *
   * Das Ergebnis wird gemeldet, nicht verschwiegen: Wer die Option wählt, soll
   * erfahren, ob sie gegriffen hat.
   */
  async #waehleBodenpfad(wahl) {
    if (wahl !== 'auto') {
      this.renderer.disableGpu();
      return { available: false, reason: 'CPU gewählt' };
    }
    const ergebnis = await this.renderer.enableGpu();
    if (ergebnis.available) {
      this.hud.log('Bodenberechnung: WebGPU', 'good');
    } else {
      this.hud.log(`Bodenberechnung: CPU (${ergebnis.reason})`, 'neutral');
    }
    return ergebnis;
  }

  /** Lokales Match im Browser. */
  /**
   * Füllt die Kulissenauswahl im Menü aus dem Katalog.
   *
   * Die Liste wird aus `BACKDROP_BIOMES` erzeugt und nicht im HTML gepflegt: bei
   * sechzig Einträgen wäre jede Änderung am Katalog sonst eine zweite, von Hand
   * nachzuziehende Liste — und die beiden würden auseinanderlaufen.
   */
  fillBackdropOptions() {
    const auswahl = document.getElementById('cfg-backdrop');
    if (!auswahl) return 0;

    // Erste Option bleibt „automatisch" (leerer Wert).
    // Die ersten beiden Einträge (generativ, automatisches Bild) bleiben.
    const feste = Array.from(auswahl.options).filter(o => o.value === 'generativ' || o.value === '');
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

  startMatch({
    teams = 2, playersPerTeam = 2, preset = 'hills', kartentyp = null,
    seed = undefined, backdropKey = '', orientation = 'landscape',
    sidegrades = null, loadouts = null,
  } = {}) {
    this.network?.disconnect();
    this.network = null;
    this.mode = 'local';

    // Sidegrades gehören in die Match-Konfiguration — sie verändern das
    // Kampfprofil und müssen deshalb schon beim Aufbau bekannt sein, nicht erst
    // nach dem Start.
    this.match = new MatchController({
      seed, teams, playersPerTeam, preset, kartentyp, orientation, sidegrades, loadouts,
    });
    this.match.start();
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
    if (backdropKey && backdropKey !== 'generativ') {
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
   * einen Impuls, die Figur fliegt und landet. Der zweite Druck in der Luft ist
   * der Doppelsprung — je Zug sind zwei Sprünge möglich.
   *
   * @param {number} [seitlich] - -1 links, 0 gerade, 1 rechts
   */
  jump(seitlich = 0) {
    if (!this.match || this.mode !== 'local') return null;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;

    const ergebnis = this.match.jump(playerId, seitlich);
    if (!ergebnis.ok) {
      // Kein Grund zur Beunruhigung: eine Meldung genügt.
      this.hud.log(ergebnis.errors.join(', '), 'neutral');
      return ergebnis;
    }
    this.hud.log(ergebnis.double ? 'Doppelsprung' : 'Sprung', 'accent');
    return ergebnis;
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
    if (!this.match || this.mode !== 'local') {
      this.hud.log('Abwerfen ist nur im lokalen Match möglich', 'neutral');
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
    this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i), onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()), onJump: seitlich => this.jump(seitlich) });
    return ergebnis;
  }

  async startOnline({
    serverUrl, lobbyId = '', teams = 2, playersPerTeam = 2, unitsPerPlayer = null,
    preset = 'hills', kartentyp = null, seed = undefined, name = 'Spieler', backdropKey = '',
    orientation = 'landscape', sidegrades = null, loadouts = null,
  } = {}) {
    this.gewaehlteKulisse = backdropKey;
    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    this.hud.clearLog();
    this.hud.log('Verbinde mit Server …', 'accent');
    this.mode = 'online';
    this.running = true;

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
            teams, preset, kartentyp, seed, orientation,
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
      this.menuOverlay.hidden = false;
      return { ok: false, error: error.message };
    }

    const wsUrl = new URL('/ws', serverUrl).toString().replace(/^http/, 'ws');
    const client = new NetworkClient({
      url: wsUrl,
      lobbyId: targetLobby,
      token: hostToken,
      playerName: name,
      seed: resolvedSeed,
      preset,
      kartentyp,
      teams,
      playersPerTeam,
    });
    this.network = client;
    this.lobbyId = targetLobby;

    client.on('hello', () => this.hud.log('Handshake abgeschlossen', 'good'));
    client.on('joined', payload => {
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
      if (payload.seed !== null && payload.seed !== undefined) {
        this.#buildRemoteTerrain(payload.seed, payload.preset ?? preset, payload.orientation ?? orientation);
      }
    });
    client.on('lobby_state', payload => {
      if (payload.seed !== null && payload.seed !== undefined && !this.remoteTerrain) {
        this.#buildRemoteTerrain(payload.seed, payload.preset ?? preset, payload.orientation ?? orientation);
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
      if (state === CONNECTION_STATE.RECONNECTING) this.hud.log('Verbindung verloren — versuche Wiederverbindung', 'danger');
      if (state === CONNECTION_STATE.CONNECTED) this.hud.log('Verbunden', 'good');
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
    });
    client.on('game_event', message => this.#handleRemoteEvent(message));
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

  #buildRemoteTerrain(seed, preset, orientation = 'landscape') {
    const terrain = buildTerrainForSeed(seed, preset, orientation);
    this.remoteTerrain = terrain;
    // Fläche und Kulisse zuerst — die Kulisse liefert die Bodenfarbe für die
    // Geländeschicht. Der Server schickt nur Seed und Ausrichtung; beides ergibt
    // auf beiden Seiten dieselbe Karte.
    this.#applyOrientation(orientation, terrain.width, terrain.height);
    this.setSceneryFromSeed(seed, preset);
    this.renderer.buildTerrainLayer(terrain.bitmap, terrain.width, terrain.height);
    this.renderer.particles = [];
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

    // Zustände kommen je Spieler mit dem Snapshot (Protokoll v3) und werden in
    // den Ansichtszustand übernommen, damit die Anzeige sie darstellen kann.
    const statuses = {};
    for (const entity of snapshot.entities ?? []) {
      if ((entity.shield ?? 0) > 0 || (entity.frozenTurns ?? 0) > 0) {
        statuses[entity.entityId] = {
          shield: entity.shield ?? 0,
          frozenTurns: entity.frozenTurns ?? 0,
          dots: [],
          boostMultiplier: 1,
        };
      }
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
      classId: this.remoteLoadouts?.[entity.entityId]?.classId
        ?? (CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1),
      archetypeId: this.remoteLoadouts?.[entity.entityId]?.archetypeId
        ?? (ARCHETYPE_IDS[index % ARCHETYPE_IDS.length] === 'brawler' ? 0 : 1),
      label: `P${index + 1}`,
      alive: entity.alive,
      x: entity.x,
      y: entity.y,
      health: entity.health,
      maxHealth: 100,
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

    return {
      status: this.remoteStatus ?? 'playing',
      round: snapshot.round,
      maxRounds: 30,
      wind: snapshot.wind,
      tick: snapshot.tick,
      turnElapsedMs: Math.max(0, turnDurationMs - remaining),
      turnDurationMs,
      activePlayerId: snapshot.activePlayerId,
      winnerTeamId: this.remoteWinner ?? null,
      statuses,
      maelstrom: { active: (snapshot.round ?? 0) >= 15, inset: this.remoteInset ?? 0 },
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
      terrainWidth: this.remoteTerrain?.width ?? this.renderer.width,
      terrainHeight: this.remoteTerrain?.height ?? this.renderer.height,
    };
  }

  #handleRemoteEvent(message) {
    switch (message.t) {
      case 'terrain_destroyed':
        this.renderer.applyCrater(message.x, message.y, message.radius || 12);
        break;
      case 'explosion':
        this.renderer.spawnExplosionParticles(message.x, message.y, message.radius || 12);
        this.renderer.addFlash(message.x, message.y, (message.radius || 12) * 1.4);
        this.renderer.applyCrater(message.x, message.y, message.radius || 12);
        break;
      case 'hitscan':
        /*
         * ROLLBACK: Der Server bestätigt den Schuss. Ab hier zeichnet der echte
         * Strahl — die Vorhersage wird aufgelöst und verschwindet. Ohne diesen
         * Schritt stünde die geschätzte Bahn neben der echten, und der Spieler
         * sähe zwei Kurven für einen Schuss.
         *
         * Der Einschlagpunkt des Servers ist zugleich die Messlatte: Weicht er
         * vom vorhergesagten ab, war das Terrain inzwischen anders (der Client
         * hat denselben Krater noch nicht verarbeitet).
         */
        this.shotPredictor.resolve({
          impact: Number.isFinite(message.hitX) && Number.isFinite(message.hitY)
            ? { x: message.hitX, y: message.hitY }
            : null,
        });
        this.#drawHitscanBeam(message);
        break;
      case 'projectile_spawn':
        // Der Server hat das Geschoss erzeugt: die Vorhersage hat ihre Aufgabe
        // erfüllt und wird von der echten Flugbahn abgelöst.
        this.shotPredictor.resolve();
        break;
      case 'shot':
        // Bestätigung eines Schusses ohne Bahn (Selbstwirkung) — nichts zu
        // zeichnen, aber die Vorhersage ist damit erledigt.
        this.shotPredictor.resolve();
        break;
      case 'projectile_impact':
        this.renderer.addFlash(message.x, message.y, 14);
        break;
      /*
       * Durchschlag: Der Einschlag blitzt, aber das Geschoss FLIEGT WEITER.
       *
       * Die Rückmeldung ist wichtig, weil die Wirkung sonst unsichtbar bliebe:
       * Ein Durchschuss sieht aus wie ein Schuss, der sein Ziel verfehlt hat —
       * erst der Blitz am Opfer zeigt, dass er getroffen hat und weiterlief.
       */
      case 'projectile_pierced':
        this.renderer.addFlash(message.x, message.y, 10, { color: '#ffd166' });
        break;
      // Dieselben zwei Fälle wie lokal — ein Spieler soll dasselbe sehen,
      // egal in welchem Modus er spielt.
      case 'loot_error':
        this.hud.log(`Beute konnte nicht verteilt werden: ${message.message}`, 'danger');
        break;
      case 'fuse_armed':
        this.hud.log('Eine Granate liegt und tickt …', 'neutral');
        this.renderer.addFlash(message.x, message.y, 10, { color: '#ffd166' });
        break;
      case 'fuse_expired':
        this.hud.log('Eine Granate ist liegen geblieben und gezündet', 'accent');
        this.renderer.addFlash(message.x, message.y, 22, { color: '#f4a261' });
        break;
      // Geschütze: Aufstellen, Feuern, Ablaufen.
      case 'turret_deployed':
        this.hud.log(
          `Geschütz aufgestellt — ${message.rounds} Runden, ${message.damage} Schaden`,
          'accent',
        );
        break;
      case 'turret_fired':
        this.hud.log('Das Geschütz feuert', 'neutral');
        break;
      case 'turret_expired':
        this.hud.log('Geschütz abgelaufen', 'neutral');
        break;
      // Wirkungen und Zustände kommen im Online-Modus als Serverereignisse.
      // Sie werden über dieselben Helfer gemeldet wie lokal, damit die
      // Meldungen in beiden Betriebsarten gleich lauten.
      case 'special_effect':
        this.#logSpecialEffect(message);
        break;
      case 'frozen':
        this.hud.log(`${this.#nameOf(message.playerId)} ist eingefroren (${message.turns} Zug/Züge)`, 'accent');
        break;
      case 'turn_skipped':
        this.hud.log(`${this.#nameOf(message.playerId)} setzt aus — eingefroren`, 'danger');
        break;
      case 'dot_tick':
        this.hud.log(`${this.#nameOf(message.playerId)} erleidet ${Math.round(message.damage)} Schaden (${(message.elements ?? []).join(', ')})`, 'danger');
        break;
      case 'shield_absorbed':
        this.hud.log(`Schild fängt ${Math.round(message.absorbed)} Schaden ab`, 'good');
        break;
      case 'pulled':
        this.hud.log(`${this.#nameOf(message.playerId)} wurde herangezogen`, 'accent');
        break;
      case 'heal':
        this.hud.log(`+${Math.round(message.amount)} Heilung`, 'good');
        break;
      case 'maelstrom_contract':
        this.remoteInset = message.inset;
        this.renderer.applyContraction(message.inset);
        this.hud.log('Mahlstrom zieht sich zusammen', 'danger');
        break;
      case 'death':
        this.hud.log('Eine Einheit wurde ausgeschaltet', 'danger');
        break;
      case 'turn_start':
        this.remoteStatus = 'playing';
        break;
      case 'round_start':
        this.hud.log(`Runde ${message.round} — Wind ${Number(message.wind ?? 0).toFixed(3)}`, 'neutral');
        break;
      case 'match_over':
        this.remoteStatus = 'gameover';
        this.remoteWinner = message.winnerTeamId ?? null;
        this.#showEndScreen(message.winnerTeamId ?? null);
        break;
      /*
       * Die Karte hat eine Figur auf einer unerreichbaren Fläche.
       *
       * Das ist kein Fehler im Ablauf — die Partie läuft weiter —, aber der
       * betroffene Spieler soll es WISSEN. Ohne diesen Eintrag säße er auf
       * einer Insel und wartete darauf, dass etwas passiert, ohne zu ahnen,
       * dass niemand ihn erreichen kann.
       *
       * Die Meldung ist bewusst nüchtern: Sie nennt den Zustand, nicht eine
       * Schuldzuweisung. Es ist eine Eigenschaft der gezogenen Karte.
       */
      case 'karte_unerreichbar':
        this.hud.log(
          `Die Karte hat eine abgeschnittene Fläche (${message.grund}) — `
          + 'eine Einheit ist von dort aus nicht erreichbar',
          'warn',
        );
        break;
      default:
        break;
    }
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
    const index = inventarIndex;

    if (this.mode === 'online') {
      // Nur die eigene Waffe wählen und nur am eigenen Zug: sonst schickte der
      // Client eine Waffe, die dem aktiven Spieler gar nicht gehört, und der
      // Server lehnte sie ab.
      if (!this.network?.isMyTurn) {
        this.hud.log('Nur am eigenen Zug kann die Waffe gewechselt werden', 'neutral');
        return;
      }
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      const weaponId = active?.inventory?.[index];
      if (weaponId) {
        // Eine nachladende Waffe lässt sich wählen, aber nicht abfeuern — der
        // Server lehnt den Schuss ab. Die Anzeige sagt warum.
        this.network?.selectWeapon(weaponId);
        // Rückmeldung wie im lokalen Spiel: ohne sie bliebe unklar, ob die Wahl
        // angekommen ist. Der Server bestätigt die Auswahl über den Bestand.
        this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
      }
      return;
    }
    if (!this.match) return;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return;
    const inventory = this.match.inventory.get(playerId);
    const weaponId = inventory?.weapons[index];
    if (!weaponId) return;
    this.match.inventory.selectWeapon(playerId, weaponId);
    this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
  }

  /** Feuert in der aktuellen Betriebsart. */
  fire() {
    const state = this.currentState();
    if (!state) return { ok: false, errors: ['Kein laufendes Match'] };
    if (state.status !== 'playing') return { ok: false, errors: ['Match ist beendet'] };

    const charging = this.input.isCharging;
    const power = charging
      ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70)))
      : this.aim.power;

    if (this.mode === 'online') {
      if (!this.network?.isConnected) return { ok: false, errors: ['Nicht verbunden'] };
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

  /** Ein lokaler Simulationsschritt inklusive Ereignisverarbeitung. */
  step() {
    if (this.mode !== 'local' || !this.match) return;
    const before = this.match.status;
    this.match.step();
    const events = this.match.consumeEvents();
    this.lastEvents = events;
    // Kennzahlen aus DENSELBEN Ereignissen, die auch das Protokoll speist —
    // keine zweite Buchführung, die abweichen könnte.
    this.stats?.feedAll(events);
    this.#handleEvents(events);
    if (before === 'playing' && this.match.status === 'gameover') {
      this.#showEndScreen(this.match.winnerTeamId);
    }
  }

  #handleEvents(events) {
    for (const { type, payload } of events) {
      switch (type) {
        case 'explosion':
          this.renderer.applyCrater(payload.x, payload.y, payload.radius || 12);
          this.renderer.addFlash(payload.x, payload.y, (payload.radius || 12) * 1.4);
          /*
           * Der Klang zum Einschlag.
           *
           * Der Mischer entscheidet selbst, ob er etwas tut — ist der Klang
           * abgeschaltet oder gibt es kein Ausgabegerät, ist der Aufruf ein
           * No-Op. Deshalb steht hier keine Bedingung: Die Regel liegt an
           * EINER Stelle (im Mischer), nicht an jedem Aufrufort.
           */
          this.sound?.verarbeite({ type: 'explosion', radius: payload.radius || 12 });
          break;
        case 'hitscan':
          // Soforttreffer sichtbar machen: Strahl vom Schützen zum Einschlag.
          this.#drawHitscanBeam(payload);
          this.sound?.verarbeite({ type: 'shot' });
          /*
           * Ein Treffer klingt anders als ein Fehlschuss.
           *
           * Das Ereignis trägt `hit` (ob getroffen wurde) und `target`. Nur
           * wenn wirklich jemand getroffen wurde, gibt es den kurzen
           * Bestätigungsklang — sonst würde jeder Schuss ins Leere quittiert.
           */
          if (payload.hit && payload.target) {
            this.sound?.verarbeite({ type: 'damage' });
          }
          break;
        case 'shot':
          /*
           * Der Abschuss hat einen Klang — und seit 2026-09-25 ein
           * Mündungsfeuer.
           *
           * Vorher stand hier NUR der Klang: Der Schuss war zu hören, aber an
           * der Figur geschah nichts. Bei einem Spiel, dessen ganze Handlung
           * aus Schüssen besteht, ist das die auffälligste Lücke der
           * Darstellung — man sieht nicht, WER geschossen hat.
           *
           * Das Ereignis trägt `playerId` und `angle`; mehr braucht der
           * Renderer nicht, weil er das Feuer an der AKTUELLEN Position der
           * Figur zeichnet (siehe `addMuzzleFlash`). Der Klang bleibt an
           * derselben Stelle — die Regel „wer spielt, entscheidet der Mischer"
           * gilt unverändert.
           */
          this.renderer.addMuzzleFlash(payload.playerId, payload.angle ?? 0);
          this.sound?.verarbeite({ type: 'shot' });
          break;
        /*
         * Beute-Fehler.
         *
         * FUND (belegt, Ereignis-Abdeckungstest): `loot_error` wurde von der
         * Engine gesendet, aber von KEINEM Client-Zweig behandelt — der Fehler
         * verschwand spurlos. Wer nichts davon erfährt, sucht den Fehler bei
         * sich: „Warum kommt keine Kiste?"
         *
         * Der Zustand ist selten (er tritt nur auf, wenn die Beuteverteilung
         * scheitert), aber genau deshalb ist eine Meldung wichtig: Ein Fehler,
         * der nie passiert, braucht keine; einer, der selten passiert, braucht
         * eine, sonst ist er beim ersten Mal ein Rätsel.
         */
        case 'loot_error':
          this.hud.log(`Beute konnte nicht verteilt werden: ${payload.message}`, 'danger');
          break;
        /*
         * Eine liegende Granate ist gezündet.
         *
         * FUND (belegt): Ebenfalls stumm. Der Krater erschien zwar über
         * `explosion`, aber der Spieler erfuhr nicht, DASS eine zuvor geworfene
         * Granate gezündet hat. Das ist gerade bei den Zünder-Waffen wichtig
         * (siehe MASTERDOTO, „Bekannte Grenzen": dort ist der Zünder länger als
         * die Flugzeit — die Ladung zündet also mit Verzögerung am Boden).
         */
        case 'fuse_armed':
          /*
           * Eine Granate ist liegen geblieben und tickt jetzt.
           *
           * Die VORSTUFE zu `fuse_expired`: Der Spieler soll wissen, dass dort
           * etwas liegt — sonst überrascht ihn die Explosion zwei Sekunden
           * später an einer Stelle, an der er nichts erwartet.
           */
          this.hud.log('Eine Granate liegt und tickt …', 'neutral');
          this.renderer.addFlash(payload.x, payload.y, 10, { color: '#ffd166' });
          break;
        case 'fuse_expired':
          this.hud.log('Eine Granate ist liegen geblieben und gezündet', 'accent');
          this.renderer.addFlash(payload.x, payload.y, 22, { color: '#f4a261' });
          break;
        /*
         * Einschlag eines Projektils.
         *
         * FUND (belegt, Black-Box-Audit): Dieser Fall FEHLTE hier. Er war nur
         * im ONLINE-Zweig (`#handleRemoteEvent`) ergänzt — im lokalen Match
         * blieb der Einschlag damit ohne Blitz, und im Protokoll stand nur
         * „ist gelandet". Wer lokal spielt (der Standardfall), sah also nicht,
         * WO sein Schuss eingeschlagen ist.
         *
         * Der Krater kommt aus `explosion` (oben) — der Blitz hier markiert den
         * Moment des Aufpralls. Beides gehört zusammen: der Krater ist das
         * Ergebnis, der Blitz der Einschlag.
         *
         * Gemessen: Die Engine sendet das Ereignis
         * (`projectileSystem.js:119`), der lokale Zweig ignorierte es.
         */
        case 'projectile_impact':
          this.renderer.addFlash(payload.x, payload.y, 14);
          break;
        // Durchschlag (siehe der lokale Zweig): Blitz, Flug geht weiter.
        case 'projectile_pierced':
          this.renderer.addFlash(payload.x, payload.y, 10, { color: '#ffd166' });
          break;
        /*
         * Geschütze.
         *
         * Fund (belegt): Diese Fälle fehlten hier. Sie waren nur im
         * ONLINE-Zweig (`#handleRemoteEvent`) ergänzt worden, und im lokalen
         * Match blieb das Aufstellen damit stumm — gemessen stand im Protokoll
         * nur „Schuss abgegeben (60 Kraft)". Ein Geschütz, dessen Aufstellen
         * niemand gemeldet bekommt, ist für den Spieler nicht vorhanden.
         */
        case 'turret_deployed':
          this.hud.log(
            `Geschütz aufgestellt — ${payload.rounds} Runden, ${payload.damage} Schaden`,
            'accent',
          );
          this.renderer.addFlash(payload.x, payload.y, 18, { color: '#d9b44a' });
          break;
        case 'turret_fired':
          this.renderer.addFlash(payload.x, payload.y, 12, { color: '#d9b44a' });
          break;
        case 'turret_expired':
          this.hud.log('Geschütz abgelaufen', 'neutral');
          break;
        case 'special_effect':
          // Wirkungen auf den Schützen: Heilung, Schild, Sprung, Munition.
          this.#logSpecialEffect(payload);
          break;
        case 'frozen':
          this.hud.log(`${this.#nameOf(payload.playerId)} ist eingefroren (${payload.turns} Zug/Züge)`, 'accent');
          break;
        case 'turn_skipped':
          this.hud.log(`${this.#nameOf(payload.playerId)} setzt aus — eingefroren`, 'danger');
          break;
        case 'dot_tick':
          this.hud.log(`${this.#nameOf(payload.playerId)} erleidet ${Math.round(payload.damage)} Schaden (${payload.elements.join(', ')})`, 'danger');
          break;
        case 'shield_absorbed': {
          // Sichtbar am Ort der Figur, nicht am Ursprung: ein Blitz bei (0,0)
          // hätte mit der Figur nichts zu tun.
          const geschuetzt = this.currentState()?.entities?.find(e => e.entityId === payload.playerId);
          if (geschuetzt) this.renderer.addFlash(geschuetzt.x, geschuetzt.y, 16, { color: '#4cc9f0' });
          this.hud.log(`Schild fängt ${Math.round(payload.absorbed)} Schaden ab`, 'good');
          break;
        }
        case 'pulled':
          this.hud.log(`${this.#nameOf(payload.playerId)} wurde herangezogen`, 'accent');
          break;
        case 'guenther_wheel':
          this.showGuentherWheel(payload);
          break;
        case 'guenther_pee':
          this.hud.log(`Günther pinkelt ${this.#nameOf(payload.playerId)} an (−${payload.amount})`, 'neutral');
          break;
        case 'guenther_poop':
          this.hud.log('Günther hat ein Häufchen gemacht', 'neutral');
          break;
        case 'guenther_poop_hit':
          this.hud.log(`${this.#nameOf(payload.playerId)} ist in ein Häufchen getreten`, 'danger');
          break;
        case 'jumped':
          this.hud.log(`${this.#nameOf(payload.playerId)} springt${payload.double ? ' (Doppelsprung)' : ''}`, 'accent');
          break;
        case 'landed':
          this.hud.log(`${this.#nameOf(payload.playerId)} ist gelandet`);
          break;
        case 'crate_landed':
          this.hud.log('Abgeworfene Waffe gelandet', 'neutral');
          break;
        case 'crate_pickup_blocked':
          // Der Vorrat ist voll: das ist der Moment, in dem Abwerfen nötig wird.
          this.hud.log('Vorrat voll — erst eine Waffe abwerfen (Q)', 'danger');
          break;
        case 'heal':
          this.hud.log(`+${Math.round(payload.amount)} Heilung für ${this.#nameOf(payload.entityId)}`, 'good');
          break;
        // 'drowning' wird NICHT hier protokolliert: Das CharacterSystem meldet
        // es bei JEDEM Simulationsschritt, solange die Figur unter Wasser ist —
        // das sind bis zu 60 Meldungen je Sekunde, die das Protokoll
        // überschwemmen. Die Meldung entsteht stattdessen beim ÜBERGANG in
        // #trackWater und nennt die Figur beim Namen. Das `break` bleibt
        // zwingend: ohne es würde das Ereignis in den nächsten Fall rutschen.
        case 'drowning':
          break;
        case 'maelstrom_contract':
          this.renderer.applyContraction(payload.inset);
          this.hud.log('Mahlstrom zieht sich zusammen', 'danger');
          break;
        case 'death': {
          const victim = this.match.players.find(player => player.entityId === payload.entityId);
          this.hud.log(`${victim?.label ?? `Entity ${payload.entityId}`} ausgeschaltet`, 'danger');
          break;
        }
        case 'crate_pickup': {
          const who = this.match.players.find(player => player.entityId === payload.playerId);
          const reward = payload.reward;
          const text = reward?.kind === 'weapon'
            ? `${who?.label ?? 'Spieler'} findet ${getWeapon(reward.weaponId)?.displayName ?? 'eine Waffe'}`
            : reward?.kind === 'heal' ? `${who?.label ?? 'Spieler'} heilt ${reward.amount} HP`
            : reward?.kind === 'trap' ? `${who?.label ?? 'Spieler'} löst eine Sprengfalle aus`
            : `${who?.label ?? 'Spieler'} öffnet eine leere Kiste`;
          this.hud.log(text, reward?.kind === 'trap' ? 'danger' : 'good');
          break;
        }
        case 'fall_damage':
          this.hud.log(`Sturzschaden: ${Math.round(payload.damage)}`, 'danger');
          break;
        case 'round_start':
          this.hud.log(`Runde ${payload.round} — Wind ${Number(payload.wind ?? 0).toFixed(3)}`, 'neutral');
          break;
        case 'toxic_rain':
          if (payload.affected?.length) this.hud.log('Toxischer Regen trifft die Zone', 'danger');
          break;
        case 'match_over':
          /*
           * Nur beim ERSTEN Mal protokollieren. Der Server wiederholt die
           * Nachricht auf jede PING-Anfrage, solange das Match entschieden ist
           * (siehe PING-Zweig im Server) — sonst stünde alle zwei Sekunden
           * dieselbe Zeile im Protokoll und verdrängte alles andere.
           */
          if (this.remoteStatus !== 'gameover') this.hud.log('Match beendet', 'accent');
          break;
        default:
          break;
      }
    }
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
      if (jetzt === WATER_STATE.SUBMERGED) {
        this.hud.log(`${entity.label} ertrinkt (${prozent} % unter Wasser)`, 'danger');
      } else if (jetzt === WATER_STATE.WET && vorher === WATER_STATE.DRY) {
        this.hud.log(`${entity.label} steht im Wasser (${prozent} %)`, 'neutral');
      } else if (vorher === WATER_STATE.SUBMERGED) {
        this.hud.log(`${entity.label} ist wieder über Wasser`, 'good');
      }
    }
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
      { hit: Boolean(payload.hit) },
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
  setSceneryFromSeed(seed, preset) {
    const kulisse = pickScenery(seed, preset);
    this.renderer.setScenery(kulisse);
    return kulisse;
  }

  #applyBackdrop(seed, preset, gewaehlt = null) {
    // Ohne ausdrücklichen Wert gilt die im Menü getroffene Wahl. Nötig, weil der
    // Online-Weg das Gelände erst nach dem Verbindungsaufbau aufbaut und die Wahl
    // sonst verloren ginge.
    const auswahl = gewaehlt ?? this.gewaehlteKulisse ?? '';
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
    if (!kulisse && this.match?.kartencharakter) {
      const biomId = biomFuerCharakter(this.match.kartencharakter);
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
    this.renderer.buildTerrainLayer(bitmap, this.match.width, this.match.height);
    this.renderer.particles = [];
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
    if (delta > 250) delta = FIXED_TIMESTEP; // Tab war inaktiv: nicht nachholen
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

    this.#render();
  }

  #render() {
    const state = this.currentState();
    if (!state) return;

    const playerId = state.activePlayerId;
    const myTurn = this.mode === 'online'
      ? this.network?.isMyTurn === true
      : state.status === 'playing' && playerId !== null;
    const aimPreview = (myTurn && this.mode === 'local')
      ? this.match.aimPreview(playerId, this.aim.angle, this.aim.power)
      : null;

    this.waterFrame = (this.waterFrame + 1) % 4;

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
    if (this.kamera) {
      const fokus = state.entities.find(e => e.entityId === state.activePlayerId)
        ?? state.entities.find(e => e.alive);
      if (fokus) this.kamera.zieleAuf(fokus.x, fokus.y);
      // Ein Schritt Näherung je Bild: weiches Nachziehen statt harter Schnitte.
      this.kamera.schritt();
    }

    this.renderer.render(state, {
      aimPreview,
      prediction,
      aim: this.aim,
      water: this.mode === 'online' ? null : (this.waterFrame === 0 ? this.match.water : null),
      blastRadius: activeWeapon?.blastRadius ?? 0,
    });
    this.#trackWater(state);
    this.hud.update(state, { aim: this.aim, onWeaponSelect: index => this.selectWeapon(index) });
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
    const ziel = document.getElementById('profil-werte');
    if (!ziel) return;
    const text = beschreibe(this.profil);
    const zeilen = [
      ['Partien', text.partien],
      ['Bilanz', text.bilanz],
      ['Siegquote', text.siegquote],
      ['Serie', text.serie],
      ['Beste Serie', text.besteSerie],
      ['Schüsse', text.schuesse],
      ['Trefferquote', text.trefferquote],
      ['Schaden gesamt', text.schaden],
      ['Schaden', text.schadenProMinute],
      ['Spielzeit', text.spielzeit],
      ['Lieblingswaffe', text.lieblingswaffe],
      ['Lieblingsnation', text.lieblingsfraktion],
    ];
    ziel.replaceChildren(...zeilen.map(([bezeichnung, wert]) => {
      const zeile = document.createElement('div');
      zeile.className = 'profil-zeile';
      const dt = document.createElement('span');
      dt.className = 'profil-name';
      dt.textContent = `${bezeichnung}:`;
      const dd = document.createElement('span');
      dd.className = 'profil-wert';
      dd.textContent = wert;
      zeile.append(dt, dd);
      return zeile;
    }));

    // Ein Hinweis auf die fehlende Fraktionsangabe: Eine leere Zeile ohne
    // Begründung sähe nach einem Fehler aus.
    const hinweis = document.getElementById('profil-hinweis');
    if (hinweis) {
      /*
       * Zwei Dinge stehen hier: warum die Lieblingsnation leer ist, und WO der
       * Fortschritt liegt.
       *
       * Der zweite Teil kam mit dem Audit: Profil und Erfolge liegen im Browser
       * (`identity.js`, `AKTUELLER_ABLAGEORT`). Ohne Hinweis erfährt der Spieler
       * erst beim Browserwechsel, dass alles weg ist — dann ist es zu spät.
       */
      const teile = [];
      if (!this.profil.lieblingsfraktion) {
        teile.push('Die Lieblingsnation braucht eine Charakterwahl — die gibt es noch nicht.');
      }
      const ablage = ablageHinweis();
      if (ablage.hinweis) teile.push(ablage.hinweis);
      hinweis.textContent = teile.join(' ');
    }
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
    const zaehler = document.getElementById('erfolge-zaehler');
    if (!zaehler) return;

    const partei = this.stats ? this.stats.zusammenfassung(this.eigeneSpielerIds) : null;
    const werte = erfolgsKennzahlen(partei, this.profil.toJSON());
    const u = erfolgsUebersicht(werte, this.profil.erfolge);

    zaehler.textContent = `${u.erreicht} von ${u.gesamt} erreicht`
      + (u.musterAnzahl > 0
        ? ` — davon ${u.musterAnzahl} Muster (die Inhalte fehlen noch)`
        : '');

    // Die zuletzt freigeschalteten zuerst: Das ist die Neuigkeit.
    const frisch = new Set((this.neueErfolge ?? []).map(e => e.id));

    const ziel = document.getElementById('erfolge-liste');
    if (!ziel) return;

    const zeilen = [];
    for (const gruppe of u.gruppen) {
      const kopf = document.createElement('div');
      kopf.className = 'erfolg-gruppe';
      kopf.textContent = `${gruppe.label} — ${gruppe.erreicht} von ${gruppe.gesamt}`;
      zeilen.push(kopf);

      // Erreichte zuerst innerhalb der Gruppe.
      const sortiert = [...gruppe.eintraege].sort((a, b) =>
        (b.erreicht - a.erreicht) || (TIER_REIHENFOLGE.indexOf(a.tier) - TIER_REIHENFOLGE.indexOf(b.tier)));

      for (const e of sortiert) {
        const zeile = document.createElement('div');
        zeile.className = `erfolg${e.erreicht ? ' erreicht' : ''}${frisch.has(e.id) ? ' frisch' : ''}`;
        zeile.dataset.erfolgId = e.id;
        zeile.dataset.tier = e.tier;

        const symbol = document.createElement('span');
        symbol.className = 'erfolg-symbol';
        // Kein Bild vorhanden: Die Kennung steht als Kürzel, damit die Anzeige
        // nicht so tut, als gäbe es Symbole. `aria-hidden`, weil der Titel folgt.
        symbol.textContent = e.erreicht ? '★' : '☆';
        symbol.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.className = 'erfolg-text';

        const titel = document.createElement('b');
        titel.textContent = e.title;
        if (e.muster) {
          const marke = document.createElement('i');
          marke.className = 'erfolg-muster';
          marke.textContent = 'Muster';
          titel.append(' ', marke);
        }

        const stufe = document.createElement('span');
        stufe.className = `erfolg-stufe stufe-${e.tier.replace(/\s+/g, '-')}`;
        stufe.textContent = e.tier;

        const beschreibung = document.createElement('span');
        beschreibung.className = 'erfolg-hinweis';
        beschreibung.textContent = e.hint;

        const stand = document.createElement('span');
        stand.className = 'erfolg-stand';
        // Prozent statt „800 / 1000", wenn das Ziel eine Quote ist — sonst
        // stünde dort „0,42 / 0,5".
        stand.textContent = e.erreicht
          ? 'erreicht'
          : (e.ziel > 0 && e.ziel <= 1
            ? `${Math.round(e.fortschritt * 100)} %`
            : `${Math.round(e.stand)} / ${Math.round(e.ziel)}`);

        text.append(titel, ' ', stufe, document.createElement('br'), beschreibung);
        zeile.append(symbol, text, stand);
        zeilen.push(zeile);
      }
    }
    ziel.replaceChildren(...zeilen);
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
// Kader-Ansicht einmalig aufbauen.
buildRosterView();
// ------------------------------------------------------------------ Kaderansicht

/**
 * Baut die Kader-Ansicht im Menü auf.
 *
 * Neun Fraktionen als Reiter, darunter die neun Charaktere der gewählten Fraktion
 * mit Bild, Kampfweise, Superwaffe, Biografie und Stärken/Schwächen.
 *
 * Die Bilder kommen aus `roster.js`. Fehlt eines, erscheint an seiner Stelle ein
 * Platzhalter statt eines stillen Ausfalls — bei 81 Dateien bliebe ein fehlendes
 * sonst unbemerkt.
 */
function buildRosterView() {
  const reiter = document.getElementById('roster-tabs');
  const liste = document.getElementById('roster-list');
  const info = document.getElementById('roster-info');
  if (!reiter || !liste || !info) return;

  const fraktionen = factionsWithSprites();
  if (fraktionen.length === 0) {
    info.textContent = 'Kein Kader geladen.';
    return;
  }

  const fehlend = fraktionen.flatMap(f => f.characters).filter(c => !c.url).length;
  if (fehlend > 0) {
    // Sichtbar machen statt stillschweigend hinnehmen.
    console.warn(`Kader: ${fehlend} Bilder fehlen (${spriteCount()} geladen)`);
  }

  let gewaehlt = fraktionen[0].id;
  let gezeichnet = false;

  // Erst beim Öffnen zeichnen: Sonst hinge der Kader mit neun Bildern an jedem
  // Seitenaufruf, obwohl das Feld zugeklappt ist.
  const behaelter = document.getElementById('roster-browser');
  if (behaelter) behaelter.addEventListener('toggle', () => {
    if (behaelter.open && !gezeichnet) zeichnen();
  });

  const zeichnen = () => {
    const fraktion = fraktionen.find(f => f.id === gewaehlt) ?? fraktionen[0];

    info.replaceChildren();
    const kopf = document.createElement('div');
    const stark = document.createElement('b');
    stark.textContent = fraktion.name;
    kopf.append(stark, document.createTextNode(` — ${fraktion.motto}`));
    const beschreibung = document.createElement('div');
    beschreibung.textContent = fraktion.description;
    info.append(kopf, beschreibung);

    liste.replaceChildren(...fraktion.characters.map(c => {
      const li = document.createElement('li');

      if (c.url) {
        const bild = document.createElement('img');
        bild.src = c.url;
        bild.alt = c.name;
        li.append(bild);
      } else {
        const ersatz = document.createElement('div');
        ersatz.className = 'r-bild-fehlt';
        ersatz.textContent = '?';
        ersatz.title = 'Bild fehlt';
        li.append(ersatz);
      }

      const text = document.createElement('div');
      text.className = 'r-text';

      const name = document.createElement('div');
      const starkName = document.createElement('span');
      starkName.className = 'r-name';
      starkName.textContent = c.name;
      const klein = document.createElement('span');
      klein.className = 'r-role';
      klein.textContent = ` ${COMBAT_ROLES[c.role]?.label ?? c.role} · ${classOf(c)}`;
      name.append(starkName, klein);

      const waffe = document.createElement('div');
      waffe.className = 'r-waffe';
      waffe.textContent = `${c.superWeapon.name}: ${c.superWeapon.description}`;

      const bio = document.createElement('div');
      bio.className = 'r-bio';
      bio.textContent = c.bio;

      const profil = document.createElement('div');
      profil.className = 'r-prof';
      profil.textContent = `+ ${c.strengths.join(' · ')}  |  − ${c.weaknesses.join(' · ')}`;

      text.append(name, waffe, bio, profil);

      /*
       * Counterplay-Zeile: gegen welche Klasse dieser Charakter stark und gegen
       * welche schwach ist.
       *
       * Die Aussage stammt aus `classCounterplay()` und damit aus denselben
       * Zahlen, die der Motor liest — nicht aus einer zweiten Tabelle. Gibt es
       * keine Gegenseite mit Vorteil, sagt die Zeile das ausdrücklich (der Scout
       * hat heute keine): Eine erfundene Zuordnung wäre eine Anzeige, die eine
       * Balance behauptet, die es nicht gibt.
       */
      const klasseDesCharakters = classOf(c);
      const beziehung = classCounterplay()[klasseDesCharakters];
      if (beziehung) {
        const cpHinweis = document.createElement('div');
        cpHinweis.className = 'r-cp';
        const teile = [];
        if (beziehung.starkGegen) {
          teile.push(`stark gegen ${beziehung.starkGegen.classId} `
            + `(${beziehung.starkGegen.wegen.join(', ')})`);
        }
        if (beziehung.schwachGegen) {
          teile.push(`schwach gegen ${beziehung.schwachGegen.classId} `
            + `(${beziehung.schwachGegen.wegen.join(', ')})`);
        }
        cpHinweis.textContent = teile.length > 0
          ? teile.join('  |  ')
          : 'keine Klasse mit Vorteil — auf keiner wirksamen Achse überlegen';
        text.append(cpHinweis);
      }

      li.append(text);
      return li;
    }));

    for (const knopf of reiter.querySelectorAll('button')) {
      knopf.setAttribute('aria-selected', String(knopf.dataset.fraktion === gewaehlt));
    }
    gezeichnet = true;
  };

  for (const fraktion of fraktionen) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.textContent = fraktion.name;
    knopf.dataset.fraktion = fraktion.id;
    knopf.setAttribute('role', 'tab');
    knopf.addEventListener('click', () => {
      gewaehlt = fraktion.id;
      zeichnen();
    });
    reiter.append(knopf);
  }

  if (behaelter?.open) zeichnen();
}

// Kulissenauswahl füllen, sobald das DOM steht. Der Katalog ist die einzige
// Quelle; die Liste im HTML bleibt bewusst leer.
if (typeof document !== 'undefined') {
  const fuelle = () => {
    game.fillBackdropOptions();
    // Sidegrade-Felder aus der Config füllen — im Markup steht keine Option.
    game.fillSidegradeOptions();
    // Loadout-Auswahl je Spielerplatz (Klasse und Archetyp entkoppelt).
    game.fillLoadoutOptions();

    /*
     * Die Loadout-Felder richten sich nach „Teams" und „Spieler pro Team" —
     * nach deren Änderung muss die Liste neu aufgebaut werden, sonst stünden
     * dort Felder für Plätze, die es nicht mehr gibt (oder es fehlten welche).
     */
    for (const id of ['cfg-teams', 'cfg-players']) {
      document.getElementById(id)?.addEventListener('change', () => game.fillLoadoutOptions());
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fuelle, { once: true });
  } else {
    fuelle();
  }
}
// ------------------------------------------------------------------- Hilfe
buildHilfeView();

/**
 * Baut den Hilfe-Bereich im Menü auf.
 *
 * Der Nutzen steht und fällt damit, dass hier NICHTS hartkodiert ist: Alle
 * Sätze und Zahlen kommen aus `uebersichtFuerHilfe()` (Klassen, Archetypen)
 * bzw. direkt aus den Configs (Loot, Gelände). Der Entwurf
 * (docs/entwurf-onboarding-sidegrades-counterplay.md, Abschnitt A) verlangt das
 * ausdrücklich — ein Zahlenwert im Client wäre eine zweite Quelle, die bei
 * jeder Balance-Änderung mitwandern müsste.
 *
 * Die Texte selbst stehen bei ihren WERTEN: `erklaerung`-Felder in
 * `classes.js`, `loot.js` und `terrainGen.js`. Diese Funktion rendert sie nur.
 *
 * Wie `buildRosterView` wird erst beim Aufklappen gezeichnet, damit der
 * Seitenstart nicht belastet wird.
 */
function buildHilfeView() {
  const reiter = document.getElementById('hilfe-tabs');
  const inhalt = document.getElementById('hilfe-inhalt');
  const behaelter = document.getElementById('hilfe-browser');
  if (!reiter || !inhalt) return;

  const seiten = [
    { id: 'klassen', label: 'Klassen', zeichne: zeichneKlassen },
    { id: 'sidegrades', label: 'Sidegrades', zeichne: zeichneSidegrades },
    { id: 'counterplay', label: 'Counterplay', zeichne: zeichneCounterplay },
    { id: 'loot', label: 'Loot und Seltenheiten', zeichne: zeichneLoot },
    { id: 'karte', label: 'Karte und Gelände', zeichne: zeichneKarte },
  ];

  let gewaehlt = seiten[0].id;
  let gezeichnet = false;

  const zeichnen = () => {
    const seite = seiten.find(s => s.id === gewaehlt) ?? seiten[0];
    inhalt.replaceChildren();
    seite.zeichne(inhalt);
    for (const knopf of reiter.querySelectorAll('button')) {
      knopf.setAttribute('aria-selected', String(knopf.dataset.hilfe === gewaehlt));
    }
    gezeichnet = true;
  };

  for (const seite of seiten) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.textContent = seite.label;
    knopf.dataset.hilfe = seite.id;
    knopf.setAttribute('role', 'tab');
    knopf.addEventListener('click', () => {
      gewaehlt = seite.id;
      zeichnen();
    });
    reiter.append(knopf);
  }

  if (behaelter) behaelter.addEventListener('toggle', () => {
    if (behaelter.open && !gezeichnet) zeichnen();
  });

  if (behaelter?.open) zeichnen();
}

/** Kleiner Helfer: ein Element mit Textinhalt. */
function textEl(tag, text, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Zeichnet einen Wertbalken.
 *
 * Die Balkenlänge ist ein Anteil am größten Wert der Gruppe — sie zeigt also
 * das VERHÄLTNIS, nicht den Absolutwert. Die Zahl steht daneben, damit die
 * Anzeige auch ohne Balken lesbar ist (und für Screenreader, die keine Breite
 * vorlesen).
 */
function balken(container, beschriftung, wert, maxWert) {
  const zeile = document.createElement('div');
  zeile.className = 'h-wert';
  zeile.append(textEl('span', beschriftung, 'h-wert-label'));

  const spur = document.createElement('span');
  spur.className = 'h-wert-spur';
  const fuellung = document.createElement('span');
  fuellung.className = 'h-wert-fuellung';
  // Anteil begrenzt: Ein Wert über dem Maximum wäre ein Anzeigefehler, kein
  // Grund, über den Balken hinauszuzeichnen.
  const anteil = maxWert > 0 ? Math.min(1, wert / maxWert) : 0;
  fuellung.style.width = `${Math.round(anteil * 100)}%`;
  spur.append(fuellung);

  zeile.append(spur, textEl('span', wert.toFixed(2), 'h-wert-zahl'));
  container.append(zeile);
}

/** Reiter „Klassen" — die wirksamen Werte samt Archetypen und Startaufgebot. */
/**
 * Beschreibt einen Klassen- oder Archetypwert für die Auswahlliste.
 *
 * ## Warum das nötig war
 *
 * Ein User-Flow-Audit stellte fest: Die Auswahlfelder im Menü zeigten nur die
 * nackten Kennungen („scout", „brawler"). Der wirksame Unterschied ist aber
 * gross — das Leben schwankt je Klasse um Faktor 0,56 bis 1,56. Wer wählt,
 * ohne die Folge zu kennen, wählt nicht.
 *
 * ## Woher die Zahlen kommen
 *
 * Aus `combatProfile()` — der Quelle, die der Motor liest. Eine eigene Rechnung
 * hier wäre eine zweite Regel, die bei einer Balance-Änderung auseinanderliefe.
 *
 * ## Was je Achse gezeigt wird
 *
 * - **Klasse:** das wirksame Leben und den wirksamen Schaden. Beides sind
 *   Multiplikatoren auf den Grundwert.
 * - **Archetyp:** das wirksame TEMPO (Absprung- und Fluggeschwindigkeit). Der
 *   Archetyp wirkt nicht auf den Schaden — das Feld hieß früher irreführend
 *   `damage` und wurde in `launch` umbenannt.
 *
 * @param {'Klasse'|'Archetyp'} art
 * @param {string} wert - Kennung, z. B. 'scout'
 * @returns {string} Kurztext wie „Leben 0,96 · Schaden 0,70" oder „Tempo 0,64"
 */
function beschreibeWert(art, wert) {
  // Der jeweils andere Teil bleibt auf dem Rückfallwert — die Zahlen sind
  // Eigenschaften des EINZELNEN Parameters, nicht der Kombination.
  const profil = art === 'Klasse'
    ? combatProfile(wert, ARCHETYPE_IDS[0])
    : combatProfile(CLASS_IDS[0], wert);

  const zahl = n => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '—');

  if (art === 'Klasse') {
    return `Leben ${zahl(profil.healthMultiplier)} · Schaden ${zahl(profil.damageMultiplier)}`;
  }
  return `Tempo ${zahl(profil.launchSpeedMultiplier)}`;
}

function zeichneKlassen(container) {
  const u = uebersichtFuerHilfe();

  container.append(textEl('p',
    'Drei Klassen und drei Archetypen bestimmen, wie eine Figur schießt und '
    + 'einsteckt. Gezeigt sind die WIRKSAMEN Werte — also die, die der Motor '
    + 'tatsächlich liest.', 'h-einleitung'));

  // Maßstab: der größte wirksame Wert über alle Klassen, damit die Balken
  // untereinander vergleichbar sind.
  const maxLeben = Math.max(...u.klassen.map(k => k.wirksam.leben));
  const maxSchaden = Math.max(...u.klassen.map(k => k.wirksam.schaden));

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const klasse of u.klassen) {
    const karte = document.createElement('div');
    karte.className = 'h-karte';
    karte.append(textEl('h3', klasse.label));
    karte.append(textEl('p', klasse.erklaerung, 'h-erklaerung'));

    balken(karte, 'Leben', klasse.wirksam.leben, maxLeben);
    balken(karte, 'Schaden', klasse.wirksam.schaden, maxSchaden);
    /*
     * Die Beweglichkeit wirkt auf den Absprung: Der Scout springt höher als die
     * anderen Klassen. Sie steht deshalb hier als Wert und nicht mehr im
     * Hinweis auf wirkungslose Dimensionen.
     */
    balken(karte, 'Beweglichk.', klasse.wirksam.beweglichkeit, 1.2);

    // Das Startaufgebot: Rolle und die konkrete Waffe.
    //
    // Fund (belegt): Der Entwurf (Abschnitt A.2) nennt `reason` eine
    // „Begründung" und verspricht daraus Textgewinn. Nachgemessen ist `reason`
    // aber ein MASCHINELL zusammengesetzter Satz:
    //
    //   "Rolle Flächenwirkung — Wahl der Klasse scout"
    //   "Bewegungsmittel — Kür der Klasse scout"
    //
    // Er wiederholt damit lediglich `roleLabel` und den Klassennamen. Ihn
    // anzuzeigen ergäbe doppelten Text („Flächenwirkung: Rolle Flächenwirkung
    // — Wahl der Klasse scout"). Gezeigt werden deshalb die beiden Angaben, die
    // tatsächlich Information tragen: die ROLLE und die konkrete WAFE.
    karte.append(textEl('h4', 'Startaufgebot'));
    const liste = document.createElement('ul');
    liste.className = 'h-liste';
    for (const platz of getClassLoadoutDetail(klasse.id)) {
      const waffe = getWeapon(platz.weaponId);
      const li = document.createElement('li');
      li.append(textEl('b', `${platz.roleLabel}: `));
      li.append(document.createTextNode(waffe?.displayName ?? platz.weaponId));
      liste.append(li);
    }
    karte.append(liste);
    raster.append(karte);
  }
  container.append(raster);

  container.append(textEl('h3', 'Archetypen'));
  const archetypRaster = document.createElement('div');
  archetypRaster.className = 'h-karten';
  for (const archetyp of u.archetypen) {
    const karte = document.createElement('div');
    karte.className = 'h-karte h-schmal';
    karte.append(textEl('h4', archetyp.label));
    karte.append(textEl('p', archetyp.erklaerung, 'h-erklaerung'));
    // Nur TEMPO und LEBEN: Der Archetyp wirkt nicht auf den Schaden (siehe
    // tests/onboarding-hilfe.test.js, „Der Archetyp wirkt als TEMPO").
    balken(karte, 'Leben', archetyp.wirksam.leben, 1.2);
    balken(karte, 'Tempo', archetyp.wirksam.tempo, 1.4);
    archetypRaster.append(karte);
  }
  container.append(archetypRaster);

  /*
   * Die Hinweise stehen ANS ENDE und sind als Hinweis gestaltet, nicht als
   * Spielwert. Der Entwurf verlangt beide ausdrücklich:
   *  - die wirkungslosen Dimensionen (sonst wirken sie wie Spielwerte),
   *  - die Kopplung (sonst ist eine Übersicht mit neun Kombinationen irreführend).
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p', u.inertHinweis));
  hinweise.append(textEl('p', u.kopplungHinweis));
  container.append(hinweise);
}

/** Reiter „Sidegrades" — was ein Sidegrade ist und welche es gibt. */
function zeichneSidegrades(container) {
  container.append(textEl('p',
    'Ein Sidegrade verstärkt eine Eigenschaft und schwächt eine andere. Es gilt '
    + 'für alle Figuren der Klasse und wird vor dem Match festgelegt — im '
    + 'laufenden Spiel lässt es sich nicht wechseln.', 'h-einleitung'));

  container.append(textEl('p',
    'Die Faktoren sind multiplikativ auf das Klassenprofil: 1,00 ist unverändert, '
    + 'über 1 verstärkt, unter 1 abgeschwächt.', 'h-erklaerung'));

  for (const klasse of CLASS_IDS) {
    container.append(textEl('h3', klasse));
    const raster = document.createElement('div');
    raster.className = 'h-karten';

    for (const eintrag of sidegradesForClass(klasse)) {
      const karte = document.createElement('div');
      karte.className = 'h-karte h-schmal';
      karte.append(textEl('h4', eintrag.label));
      karte.append(textEl('p', eintrag.erklaerung, 'h-erklaerung'));

      /*
       * Die Faktoren als Zahlentabelle, nicht als Balken: Bei einem Sidegrade
       * ist die RICHTUNG die Aussage (über oder unter 1), und dafür ist eine
       * Zahl neben der Achse lesbarer als ein Balken, dessen Maßstab erst
       * erklärt werden müsste.
       */
      const liste = document.createElement('ul');
      liste.className = 'h-liste';
      const achsen = [
        ['Leben', 'healthMultiplier'],
        ['Schaden', 'damageMultiplier'],
        ['Tempo', 'launchSpeedMultiplier'],
      ];
      for (const [beschriftung, schluessel] of achsen) {
        const wert = eintrag.modifiers[schluessel];
        const vorzeichen = wert > 1 ? '+' : (wert < 1 ? '−' : '·');
        liste.append(textEl('li',
          `${vorzeichen} ${beschriftung}: ${wert.toFixed(2)}`));
      }
      karte.append(liste);
      raster.append(karte);
    }
    container.append(raster);
  }

  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    'Nur Leben, Schaden und Tempo sind wirksam — der Motor liest diese drei. '
    + 'Ein Sidegrade kann sie nach oben oder unten verschieben, aber nicht '
    + 'darüber hinaus: Jede Achse hat eine Untergrenze, damit keine '
    + 'spielunfähige Figur entsteht.'));
  container.append(hinweise);
}

/** Reiter „Counterplay" — welche Klasse gegen welche stark ist, und warum. */
function zeichneCounterplay(container) {
  container.append(textEl('p',
    'Welche Klasse gegen welche stark ist, folgt aus ihren Werten: Leben, Wucht, '
    + 'Reichweite und Beweglichkeit. Es gibt keinen versteckten Bonus — die '
    + 'Tabelle zeigt, worauf die Werte hinauslaufen, und die Wahl entscheidet.',
    'h-einleitung'));

  const beziehungen = classCounterplay();

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const klasse of CLASS_IDS) {
    const e = beziehungen[klasse];
    if (!e) continue;

    const karte = document.createElement('div');
    karte.className = 'h-karte';
    karte.append(textEl('h3', klasse));

    // Die Werte zuerst: Sie begründen alles Folgende.
    balken(karte, 'Leben', e.profil.leben, 1.6);
    balken(karte, 'Wucht', e.profil.wucht, 1.3);
    balken(karte, 'Reichweite', e.profil.reichweite, 1.2);
    // Die Beweglichkeit wirkt auf den Absprung — der Scout springt höher.
    balken(karte, 'Beweglichk.', e.profil.beweglichkeit, 1.2);

    const liste = document.createElement('ul');
    liste.className = 'h-liste';
    if (e.starkGegen) {
      liste.append(textEl('li',
        `stark gegen ${e.starkGegen.classId} — ${e.starkGegen.wegen.join(', ')}`));
    }
    if (e.schwachGegen) {
      liste.append(textEl('li',
        `schwach gegen ${e.schwachGegen.classId} — ${e.schwachGegen.wegen.join(', ')}`));
    }
    karte.append(liste);
    raster.append(karte);
  }
  container.append(raster);

  /*
   * Der Hinweis ist wichtiger als die Tabelle: Er erklärt, warum hier Lücken
   * stehen. Der Scout hat auf keiner wirksamen Achse einen Vorteil — das
   * auszusprechen ist ehrlicher als eine Gegenseite zu erfinden.
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    'Fehlt eine Zeile „stark gegen", hat diese Klasse auf keiner wirksamen Achse '
    + 'einen Vorteil — sie ist dann durchgehend die schwächere Wahl.'));
  hinweise.append(textEl('p',
    'Die Beweglichkeit wirkt auf den Absprung: Wer beweglicher ist, springt höher '
    + 'und erreicht Stellungen, die anderen verschlossen bleiben. Sie zählt '
    + 'deshalb als eigene Achse mit.'));
  container.append(hinweise);

  container.append(textEl('h3', 'Welche Karte begünstigt wen'));
  const kartenListe = document.createElement('ul');
  kartenListe.className = 'h-liste';
  for (const [form, eintrag] of Object.entries(TERRAIN_AFFINITY)) {
    kartenListe.append(textEl('li', `${form}: ${eintrag.favorisiert} — ${eintrag.begruendung}`));
  }
  container.append(kartenListe);

  const kartenHinweis = document.createElement('div');
  kartenHinweis.className = 'h-hinweis';
  kartenHinweis.append(textEl('p',
    'Die Kartengunst ist eine Empfehlung, kein Bonus: Sie ändert keine Werte. '
    + 'Wer die begünstigte Klasse wählt, spielt ihre Stärke aus — mehr nicht.'));
  container.append(kartenHinweis);
}

/** Reiter „Loot und Seltenheiten" — die Verteilung, in Spielerprosa. */
function zeichneLoot(container) {
  container.append(textEl('p',
    'Zu Beginn jeder Runde wirft eine Drohne Kisten ab. Was darin liegt, '
    + 'entscheidet der Match-Seed — im Replay also immer dasselbe.',
    'h-einleitung'));

  const regeln = LOOT_DROP_RULES;

  container.append(textEl('h3', 'Kisten je Rundenbeginn'));
  const kistenListe = document.createElement('ul');
  kistenListe.className = 'h-liste';
  for (const [was, anteil] of [
    ['keine Kiste', regeln.cratesPerRoundStart.none],
    ['eine Kiste', regeln.cratesPerRoundStart.one],
    ['zwei Kisten', regeln.cratesPerRoundStart.two],
  ]) {
    kistenListe.append(textEl('li', `${prozent(anteil)} — ${was}`));
  }
  container.append(kistenListe);

  container.append(textEl('h3', 'Inhalt einer Kiste'));
  const inhaltListe = document.createElement('ul');
  inhaltListe.className = 'h-liste';
  for (const [was, anteil] of [
    ['eine Waffe', regeln.contents.weapons],
    ['Nachschub (Heilung)', regeln.contents.sustain],
    ['leer', regeln.contents.empty],
    ['eine Sprengfalle', regeln.contents.trap],
  ]) {
    inhaltListe.append(textEl('li', `${prozent(anteil)} — ${was}`));
  }
  container.append(inhaltListe);

  container.append(textEl('h3', 'Seltenheiten'));
  const seltenListe = document.createElement('ul');
  seltenListe.className = 'h-liste h-seltenheiten';
  for (const stufe of RARITY_IDS) {
    const li = document.createElement('li');
    const punkt = document.createElement('span');
    punkt.className = 'h-farbe';
    // Farbe aus der Config, nicht im Client gewählt: dieselbe Farbe wie im
    // Spiel, sonst wichen Liste und Waffenanzeige voneinander ab.
    punkt.style.background = regeln.rarityColors[stufe] ?? '#888';
    const gewicht = RARITY_WEIGHTS[stufe];
    const gesamt = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    li.append(punkt, textEl('span', `${stufe} — ${prozent(gewicht / gesamt)} der Waffen`));
    seltenListe.append(li);
  }
  container.append(seltenListe);

  /*
   * Die zentrale Balance-Aussage des Spiels, die bisher NIRGENDS im Menü stand:
   * Startwaffen sind nur common/uncommon/rare. Episch und legendär gibt es
   * ausschließlich über Loot.
   */
  const hinweise = document.createElement('div');
  hinweise.className = 'h-hinweis';
  hinweise.append(textEl('p',
    `Startwaffen sind nur ${START_TIERS.join(', ')}. Epische und legendäre Waffen `
    + 'gibt es ausschließlich über Kisten — wer stärker werden will, muss sie finden.'));
  container.append(hinweise);
}

/** Reiter „Karte und Gelände" — die acht Formen mit ihrer Spielweise. */
function zeichneKarte(container) {
  container.append(textEl('p',
    'Die Geländeform bestimmt Höhen, Wasser und Höhlen — und damit, welche '
    + 'Waffen und Klassen nützen. Alle Formen haben dieselbe Fläche, nur die '
    + 'Form ist anders.', 'h-einleitung'));

  const raster = document.createElement('div');
  raster.className = 'h-karten';
  for (const [id, preset] of Object.entries(TERRAIN_PRESETS)) {
    const karte = document.createElement('div');
    karte.className = 'h-karte h-schmal';
    karte.append(textEl('h4', id));
    karte.append(textEl('p', preset.erklaerung, 'h-erklaerung'));
    // Die Kennzahlen als Beschreibung der EIGENSCHAFT, nicht als Spielwert —
    // sie sind Generatorparameter, keine Werte, die der Spieler einstellt.
    karte.append(textEl('p',
      `Höhen ${preset.amplitude} · Rauheit ${preset.roughness} · `
      + `Wasser ${preset.waterLevel}`, 'h-kennzahl'));
    raster.append(karte);
  }
  container.append(raster);
}

/** Anteil als Prozentzahl mit dem Hinweis auf die Herkunft der Zahl. */
function prozent(anteil) {
  // Aus dem Gewicht BERECHNET, nicht abgetippt: Ändert sich die Verteilung in
  // der Config, wandert die Anzeige mit.
  return `${Math.round(anteil * 100)} %`;
}
export default game;
