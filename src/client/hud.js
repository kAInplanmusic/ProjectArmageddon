/**
 * DOM-HUD: Runden-, Wind- und Zugzeitanzeige, Spielerliste, Waffenliste
 * und Ereignisprotokoll.
 *
 * Das HUD liest ausschließlich aus dem Match-State und schreibt nie in die
 * Simulation — die Trennung hält Replays und Netzwerk-Sync sauber.
 *
 * @module hud
 */
import { TEAM_COLORS } from '../engine/match.js';
import {
  getWeapon,
  iconUrlFor,
  orderInventoryBySubcategory,
  displayGroupFor,
  displayGroupLabel,
} from '../shared/config/weapons.js';
import { WATER_STATE, waterStateFor, waterLabel, DROWN_LEVEL } from '../shared/config/water.js';
import { ladungAnteil } from './weaponAnimation.js';

const LOG_LIMIT = 60;

/**
 * Vorrang im Ereignisprotokoll: zwei Klassen, zwei Budgets.
 *
 * ## Der Befund, der dazu führte (belegt, zwei Messungen)
 *
 * Das Protokoll hielt 60 Zeilen; jede neue kam vorn hinein, die älteste fiel
 * hinten heraus — nach ZEIT, nicht nach Wichtigkeit. Eine STEHENDE Figur
 * erzeugt ~34 `landed`-Meldungen je Sekunde (Physik-Bounce um 4 px). Gemessen
 * mit echtem Motor, echtem Hud, 4242 und 10 s Laufzeit:
 *
 *   Lage                          Zeilen/s   Überlebt
 *   4 Figuren, hills, ungefiltert      34,5   105 Takte = 1,8 s
 *   4 Figuren, flooded, ungefiltert    17,3   210 Takte = 3,5 s
 *   40 Figuren, hills, ungefiltert    344,2    14 Takte = 0,2 s
 *   40 Figuren, flooded, ungefiltert  138,4    28 Takte = 0,5 s
 *
 * Der Sendefilter des Servers (`src/shared/protocol.js`, `EreignisSendefilter`)
 * nimmt davon die Wiederholungen weg — das verbessert die Lage, löst sie aber
 * nicht: bei 40 Figuren bleiben gefiltert 72,2 Zeilen/s auf `hills` (0,7 s) und
 * 29,6 auf `flooded` (1,9 s). Eine Servermeldung wie „In der Luft ist kein
 * erster Sprung möglich" (kommt als `danger`, siehe `main.js`) war damit weg,
 * bevor der Spieler sie gelesen hatte.
 *
 * ## Was hier passiert
 *
 * Zwei Wege, sie ergänzen sich:
 *
 * **1. Reserviertes Budget (`VORRANG_LIMIT`).** Meldungen sind entweder
 * `vorrang` (Fehler, Zugwechsel, Ereignisse, Ablehnungsbegründungen:
 * `danger`, `accent`, `good`, `notice`) oder `rauschen` (Anzeigearten mit dem
 * Vorgabeton `neutral` — `landed` und Verwandte).
 *
 * Vorrangmeldungen haben ein EIGENES Budget (20) und können nur ihresgleichen
 * verdrängen. Anzeigerauschen kann eine Vorrangmeldung **nie** verdrängen —
 * unabhängig davon, wie viel davon ankommt und wie viele verschiedene Texte es
 * sind. Umgekehrt darf die Anzeige den Platz, den der Vorrang GERADE nicht
 * braucht, mitbenutzen: Das Protokoll führt bis zu 60 Zeilen, und beim ersten
 * Vorrangbedarf räumt das Rauschen (das ist der „geliehene Rest"). So bleibt
 * die Obergrenze `LOG_LIMIT` erhalten — ein Protokoll, das bei 40 Zeilen
 * dichtmacht, obwohl keine einzige Vorrangmeldung ansteht, wäre eine
 * Verschlechterung ohne Nutzen.
 *
 * **2. Zusammenfassen statt anhäufen.** Eine Meldung mit DEM SELBEN Text belegt
 * nur EINE Zeile; weitere Vorkommen zählen dort hoch (`… ist gelandet ×12`).
 * Das senkt den Zufluss, statt ihn nur anders zu verteilen: Bei 4 Figuren sind
 * genau 4 Landungstexte im Umlauf, das Rauschbudget läuft deshalb praktisch
 * nicht mehr über.
 *
 * Für Vorrangmeldungen wird nur eine UNMITTELBAR folgende Wiederholung
 * zusammengefasst (Tastenspam auf dieselbe Sperre). Eine spätere gleiche
 * Meldung ist ein NEUES Ereignis und bekommt eine neue Zeile — „A ist am Zug"
 * der nächsten Runde darf nicht in der Zeile der vorigen Runde verschwinden,
 * sonst fiele die Zugwechsel-Ansage weg (die wichtigste Ansage des Protokolls).
 *
 * ## Warum nicht die anderen Wege
 *
 * - **Fehler nie automatisch entfernen** (nur manuell/beim Matchwechsel): Der
 *   Knotenbestand wüchse dann unbegrenzt über `LOG_LIMIT` hinaus. Ein
 *   Screenreader liest die Region beim Fokussieren ganz vor — bei Hunderten
 *   Zeilen ist das kein Vorrang, sondern eine Zumutung. Zudem bräuchte die
 *   wachsende Liste sofort wieder eine Obergrenze, also genau diese Budgets.
 * - **Nur zusammenfassen** (ohne Budgets): hilft nur bei GLEICHEM Text. Ein
 *   Rauschgemisch aus vielen verschiedenen Anzeigetexten (auf `flooded`:
 *   Wassermeldungen je Figur und Füllstand) verdrängt eine Vorrangmeldung
 *   weiterhin. Die Zusicherung wäre „meistens", nicht „nie".
 *
 * ## Grenze, offen benannt
 *
 * Die Klassenzuordnung liest den TON der Meldung. Eine Meldung mit dem
 * Vorgabeton `neutral`, die inhaltlich eine Begründung ist, gehört damit ins
 * Rauschbudget — dafür gibt es den Ton `notice` (siehe `VORRANG_TOENE`); die
 * fünf Aufrufstellen in `main.js`, die ihn setzen sollten, stehen in
 * `docs/hud-vorrang.md`.
 */
const VORRANG_LIMIT = 20;

/**
 * Töne, die eine Aussage tragen (Fehler, Zugwechsel, Ereignis, abgelehnte
 * Eingabe) und deshalb Vorrang bekommen. Alles andere ist Anzeige.
 *
 * ## `notice` — die Ablehnungsbegründung
 *
 * `notice` ist für Meldungen dieser Art:
 *
 *   „Nur am eigenen Zug kann gesprungen werden"
 *   „In der Luft ist kein erster Sprung möglich"        (Sprung abgelehnt)
 *   „Nur am eigenen Zug kann eine Waffe abgeworfen werden"
 *
 * Der Spieler drückt etwas, es passiert nichts — er MUSS den Grund erfahren
 * können. Solche Meldungen sind heute mit dem Vorgabeton `neutral` unterwegs
 * (fünf Stellen in `main.js`, siehe `docs/hud-vorrang.md` §6) und landen damit
 * im Rauschbudget.
 *
 * **Warum ein eigener Ton und nicht `danger`:** `danger` heißt im ganzen Haus
 * Schaden und Gefahr (und ist rot, `#ef476f`). Eine abgelehnte Tasteneingabe
 * damit zu schreiben, ließe jeden Tastendruck wie einen Angriff aussehen — die
 * Farbe ist eine Aussage über die Lage, nicht über den Ort des Problems.
 *
 * **Warum nicht eine Kennzeichnung am Aufruf** (`{ dringend: true }`): Ton und
 * Wichtigkeit sind dieselbe Frage an denselben Aufruf. Zwei Achsen dafür sind
 * zwei Regeln für eine Sache — genau die Doppelregel, die dieses Projekt an
 * anderen Stellen teuer bezahlt hat (Simulationstakt, Trefferfeld, Reichweite).
 *
 * **Warum keine Texterkennung** (Muster wie /nicht möglich|Nur am eigenen
 * Zug/): eine ZWEITE Regelquelle. Sie fällt bei der nächsten Umformulierung
 * still aus (die Meldung ist dann wieder ungeschützt) oder greift bei einer
 * Meldung, die inhaltlich etwas anderes sagt. Der Ton steht dort, wo die
 * Absicht entsteht — beim Absender.
 */
const VORRANG_TOENE = Object.freeze(new Set(['danger', 'accent', 'good', 'notice']));

/**
 * Klasse einer Protokollmeldung — die Zuteilung des Zeilenbudgets.
 * @param {string} tone Der Ton, mit dem die Meldung geschrieben wurde
 * @returns {'vorrang'|'rauschen'} `vorrang` behält einen reservierten Rest
 */
export function protokollKlasse(tone) {
  return VORRANG_TOENE.has(tone) ? 'vorrang' : 'rauschen';
}

/**
 * Farben der abgeleiteten Waffenstufen.
 *
 * Die Quelle kennt nur common/uncommon/rare; epic und legendary leitet der
 * Katalog-Generator deterministisch aus den Waffenwerten ab (siehe
 * scripts/build-weapon-catalog.mjs, POWER_TIERS).
 */
const TIER_COLORS = Object.freeze({
  common: '#c8d3de',
  uncommon: '#90be6d',
  rare: '#4cc9f0',
  epic: '#b388ff',
  legendary: '#ffb703',
});

export class Hud {
  #elements;
  /** Das Dokument, aus dem ALLE Knoten kommen (siehe Konstruktor). */
  #document;
  /**
   * Das Protokoll als Modell — neueste Zeile ZUERST.
   *
   * Jeder Eintrag führt seinen Knoten mit. Ein Zusammenfassen oder ein
   * Hinauswerfen muss GENAU diesen Knoten treffen; ohne die Bindung würde das
   * Trimmen den falschen Knoten entfernen und die Live-Region dabei neu
   * aufbauen.
   */
  #logEntries = [];
  /**
   * Lebende Rauschzeilen je Text — der Zähler des Zusammenfassens.
   *
   * Nur Rauschzeilen: Bei Vorrangmeldungen wird ausschließlich eine
   * UNMITTELBAR folgende Wiederholung zusammengefasst (siehe `log`).
   */
  #rauschZeilen = new Map();
  #selectedWeaponIndex = 0;
  #rosterSignature = '';
  #weaponSignature = '';
  /** Zuletzt angesagter aktiver Spieler — für die Zugwechsel-Meldung. */
  #lastActiveId = null;

  constructor(documentRef = document) {
    /*
     * Das übergebene Dokument gilt ÜBERALL.
     *
     * Fund (belegt beim Bau der Protokoll-Tests): Der Konstruktor nahm ein
     * `documentRef`, die Render-Methoden lasen aber den GLOBALEN `document`
     * (`#renderRoster`, `#renderWeapons`, `#logItem`). Im Browser fällt das
     * nicht auf — `Main` übergibt genau dieses globale Dokument. Außerhalb des
     * Browsers macht es das HUD unprüfbar: Ein Test kann kein eigenes Dokument
     * einhängen, weil die Hälfte der Klasse am globalen hängt. Jetzt kommt
     * alles aus EINER Quelle.
     */
    this.#document = documentRef;
    this.#elements = {
      round: documentRef.getElementById('hud-round'),
      wind: documentRef.getElementById('hud-wind'),
      timer: documentRef.getElementById('hud-timer'),
      status: documentRef.getElementById('hud-status'),
      roster: documentRef.getElementById('roster'),
      weapons: documentRef.getElementById('weapon-list'),
      angle: documentRef.getElementById('hud-angle'),
      power: documentRef.getElementById('hud-power'),
      blast: documentRef.getElementById('hud-blast'),
      active: documentRef.getElementById('hud-active'),
      log: documentRef.getElementById('log-list'),
      connection: documentRef.getElementById('hud-connection'),
    };
  }

  /**
   * Zeigt den Verbindungszustand im Online-Modus.
   * @param {string} state
   * @param {number} latencyMs
   */
  setConnection(state, latencyMs = 0) {
    const element = this.#elements.connection;
    if (!element) return;
    const labels = {
      idle: 'offline',
      connecting: 'verbindet …',
      connected: `online · ${latencyMs} ms`,
      reconnecting: 'neu verbinden …',
      closed: 'getrennt',
    };
    element.textContent = labels[state] ?? state;
    element.style.color = state === 'connected' ? '#90be6d'
      : state === 'reconnecting' || state === 'closed' ? '#ef476f'
      : '#8ba0b4';
  }

  get elements() {
    return this.#elements;
  }

  /** Aktualisiert alle HUD-Felder aus einem Match-State. */
  update(state, { aim = null, onWeaponSelect = null } = {}) {
    const el = this.#elements;
    if (el.round) el.round.textContent = String(state.round);
    if (el.wind) {
      const wind = state.wind ?? 0;
      el.wind.textContent = `${wind >= 0 ? '→' : '←'} ${Math.abs(wind).toFixed(3)}`;
      el.wind.style.color = Math.abs(wind) > 0.03 ? '#ef476f' : '#e8eef5';
    }
    if (el.timer) {
      const remaining = Math.max(0, (state.turnDurationMs - state.turnElapsedMs) / 1000);
      el.timer.textContent = remaining.toFixed(0);
      el.timer.style.color = remaining < 6 ? '#ef476f' : '#e8eef5';
    }
    if (el.status) {
      el.status.textContent = state.status === 'gameover'
        ? 'Ende'
        : state.maelstrom?.active ? 'Mahlstrom' : 'Läuft';
      el.status.style.color = state.maelstrom?.active ? '#ef476f' : '#90be6d';
    }

    this.#renderRoster(state);
    this.#renderWeapons(state, onWeaponSelect);

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    if (el.active) {
      el.active.textContent = active ? `${active.label} am Zug` : '—';
      el.active.style.color = active ? TEAM_COLORS[active.teamId % TEAM_COLORS.length] : '#8ba0b4';
    }
    /*
     * Zugwechsel ins Protokoll schreiben.
     *
     * Das Protokoll ist die Live-Region des HUD (`role="log"`), und für einen
     * Screenreader ist die wichtigste Frage im Spiel: Wer ist jetzt dran? Ohne
     * diese Zeile bliebe der Zugwechsel stumm — `#hud-active` wird nur sichtbar
     * geändert, und es absichtlich NICHT zur Live-Region gemacht: Dann kämen
     * zwei Ansagen für dasselbe Ereignis.
     *
     * Protokolliert wird nur der WECHSEL, nicht jeder Frame — `update()` läuft
     * mit der Bildrate.
     */
    if (active && active.entityId !== this.#lastActiveId) {
      this.log(`${active.label} ist am Zug`, 'accent');
      this.#lastActiveId = active.entityId;
    }
    if (el.angle) el.angle.textContent = `${Math.round((((aim?.angle ?? active?.angle ?? 0)) * 180) / Math.PI)}°`;
    if (el.power) el.power.textContent = String(Math.round(aim?.power ?? active?.power ?? 0));

    // Flächenwirkung der gewählten Waffe: hilft beim Einschätzen des Splash-Radius.
    if (el.blast) {
      const weapon = active?.activeWeaponId ? getWeapon(active.activeWeaponId) : null;
      const radius = weapon?.blastRadius ?? 0;
      el.blast.textContent = radius > 0 ? `⌀ ${Math.round(radius)}` : '— direkt —';
      el.blast.style.color = radius > 0 ? '#f4a261' : '#8ba0b4';
    }
  }

  #renderRoster(state) {
    const list = this.#elements.roster;
    if (!list) return;

    // Zustände (Schild, Einfrieren, Schaden über Zeit) gehören in die Signatur:
    // sonst bliebe die Anzeige stehen, obwohl sich der Zustand geändert hat.
    const zustandsText = entity => {
      const zustand = state.statuses?.[entity.entityId];
      const teile = [];
      if (zustand) {
        if (zustand.shield > 0) teile.push(`S${Math.round(zustand.shield)}`);
        if (zustand.frozenTurns > 0) teile.push(`❄${zustand.frozenTurns}`);
        if (zustand.dots?.length > 0) teile.push(`☠${zustand.dots.length}`);
        if (zustand.boostMultiplier > 1) teile.push('↑');
      }
      // Wasser gehört in dieselbe Signatur: Steigt der Pegel durch Verdrängung,
      // muss die Marke erscheinen, ohne dass sich Leben oder Position ändern.
      if (waterStateFor(entity.waterLevel) !== WATER_STATE.DRY) {
        teile.push(`W${Math.round((entity.waterLevel ?? 0) * 100)}`);
      }
      return teile.join(' ');
    };

    const signature = state.entities
      .map(entity => `${entity.entityId}:${entity.alive ? 1 : 0}:${Math.round(entity.health)}:${entity.entityId === state.activePlayerId ? 1 : 0}:${zustandsText(entity)}`)
      .join('|');
    if (this.#rosterSignature === signature) return;
    this.#rosterSignature = signature;

    list.replaceChildren(...state.entities.map(entity => {
      const item = this.#document.createElement('li');
      item.className = 'roster-item';
      item.dataset.entityId = String(entity.entityId);
      if (entity.entityId === state.activePlayerId) item.classList.add('is-active');
      if (!entity.alive) item.classList.add('is-dead');

      const name = this.#document.createElement('span');
      name.textContent = entity.label;
      name.style.color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      /*
       * Erfolgs-Emblem neben dem Namen — aus vorhandenen Daten abgeleitet.
       *
       * `state.emblem` wird vom Client mitgegeben (siehe `currentState()`): Es
       * gilt für den EIGENEN Spieler, denn nur dessen Profil liegt vor. Ein
       * fremdes Emblem wäre geraten — und ein geratener Erfolg ist schlimmer als
       * keiner.
       *
       * Kein Emblem, solange nichts erreicht ist (`rang === null`): Ein leerer
       * Platzhalter wäre irreführend.
       */
      const emblemElement = this.#document.createElement('span');
      if (entity.entityId === state.eigenerSpielerId && state.emblem?.rang) {
        emblemElement.className = 'roster-emblem';
        emblemElement.dataset.tier = state.emblem.rang;
        /*
         * Der Text nennt Anzahl und Rang — beides aus der Ableitung, nichts
         * gedichtet. Die FLÄCHENFÜLLUNG des Rangs (Farbe, Umriss) ist Gestaltung
         * und steht im CSS; hier steht nur die Aussage.
         */
        emblemElement.textContent = `${state.emblem.anzahl}/${state.emblem.gesamt}`;
        emblemElement.title = `Erfolge: ${state.emblem.anzahl} von ${state.emblem.gesamt}, `
          + `höchster Rang: ${state.emblem.rang}`
          + (state.emblem.nurMuster ? ' (nur Muster — die Inhalte fehlen noch)' : '');
      }

      const track = this.#document.createElement('span');
      track.className = 'hp-track';
      const fill = this.#document.createElement('span');
      fill.className = 'hp-fill';
      const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.style.background = ratio > 0.6 ? '#90be6d' : ratio > 0.3 ? '#fbbf24' : '#ef476f';
      track.append(fill);

      // Laufende Zustände als kompakte Marken: Schild, Einfrieren, Schaden über
      // Zeit, Schadensbonus. Ohne sie wäre nicht erkennbar, warum eine Figur
      // aussetzt oder weniger Schaden nimmt.
      const zustand = state.statuses?.[entity.entityId];
      const marken = [];
      if (zustand?.shield > 0) marken.push({ text: `🛡 ${Math.round(zustand.shield)}`, color: '#4cc9f0' });
      if (zustand?.frozenTurns > 0) marken.push({ text: `❄ ${zustand.frozenTurns}`, color: '#7fd8ff' });
      if (zustand?.dots?.length > 0) marken.push({ text: `☠ ${zustand.dots.length}`, color: '#90be6d' });
      if (zustand?.boostMultiplier > 1) marken.push({ text: '↑', color: '#ffb703' });

      // Wasser: Der Füllstand ist eine Zahl zwischen 0 und 1 und für den Spieler
      // bedeutungslos — deshalb Prozent und Zustandswort. „nass" bremst nur,
      // „untergetaucht" kostet Leben; die Farbe macht den Unterschied sichtbar.
      const wasserzustand = waterStateFor(entity.waterLevel);
      if (wasserzustand !== WATER_STATE.DRY) {
        const untergetaucht = wasserzustand === WATER_STATE.SUBMERGED;
        marken.push({
          text: `${untergetaucht ? '🌊' : '💧'} ${waterLabel(entity.waterLevel)}`,
          color: untergetaucht ? '#ef476f' : '#4cc9f0',
          title: untergetaucht
            ? `Untergetaucht (${Math.round((entity.waterLevel ?? 0) * 100)} % Füllstand) — verliert Leben, bis die Figur aus dem Wasser kommt. Ertrinken ab ${Math.round(DROWN_LEVEL * 100)} %.`
            : `Im Wasser (${Math.round((entity.waterLevel ?? 0) * 100)} % Füllstand) — Bewegung gebremst, noch kein Ertrinken. Ertrinken ab ${Math.round(DROWN_LEVEL * 100)} %.`,
        });
      }

      const hp = this.#document.createElement('span');
      hp.textContent = String(Math.max(0, Math.round(entity.health)));
      hp.style.fontVariantNumeric = 'tabular-nums';

      // Das Emblem steht ZWISCHEN Name und Lebensbalken: Es gehört zum Namen,
      // nicht zu den Zustandsmarken (die hinter dem Balken stehen).
      item.append(name, emblemElement, track, hp);

      for (const marke of marken) {
        const badge = this.#document.createElement('span');
        badge.className = 'status-badge';
        badge.textContent = marke.text;
        badge.style.color = marke.color;
        badge.title = marke.title ?? (zustand?.frozenTurns > 0 && marke.text.startsWith('❄')
          ? `Eingefroren: setzt ${zustand.frozenTurns} Zug/Züge aus`
          : marke.text.startsWith('🛡') ? 'Schild: fängt Schaden ab, bevor Gesundheit sinkt'
            : marke.text.startsWith('☠') ? 'Schaden über Zeit: wirkt bei jedem Zugbeginn'
              : 'Erhöhter Schaden');
        item.append(badge);
      }

      return item;
    }));
  }

  #renderWeapons(state, onWeaponSelect) {
    const list = this.#elements.weapons;
    if (!list) return;

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    const weapons = active?.inventory ?? [];
    // Munition gehört in die Signatur: sonst aktualisiert sich die Anzeige
    // erst beim Zugwechsel statt direkt nach einem Schuss.
    const ammoKey = weapons.map(id => `${id}=${active?.ammo?.[id] ?? 0}`).join(',');
    // Nachladezeiten gehören in die Signatur: sonst bliebe die Anzeige stehen,
    // obwohl eine Waffe wieder bereit ist.
    const cdKey = weapons.map(id => `${id}=${active?.cooldowns?.[id] ?? 0}`).join(',');
    const signature = `${state.activePlayerId}:${weapons.join(',')}:${active?.activeWeaponId ?? ''}:${ammoKey}:${cdKey}`;
    if (this.#weaponSignature === signature) return;
    this.#weaponSignature = signature;

    /*
     * Fokus merken, bevor die Liste neu aufgebaut wird.
     *
     * Fund (belegt): `replaceChildren` entfernt alle alten Knoten. Liegt der
     * Fokus auf einer Waffenzeile — was seit der Tastaturbedienung möglich ist —,
     * wandert er mit dem entfernten Knoten auf `<body>`. Und die Liste wird bei
     * JEDER Änderung neu gebaut: nach einem Schuss (Munition), nach dem
     * Waffenwechsel, beim Zugwechsel. Ein Tastaturnutzer verlor den Fokus also
     * genau in dem Moment, in dem er etwas ausgewählt hatte, und musste sich von
     * vorn durch die Seite tabben.
     */
    const fokussierteWaffe = this.#document.activeElement?.dataset?.weaponId ?? null;

    /*
     * Eine Ordnung für Anzeige UND Eingabe. Die angezeigte Nummer ist die
     * Position in dieser Reihenfolge; die Zifferntasten treffen dieselbe Waffe.
     */
    const reihenfolge = orderInventoryBySubcategory(weapons);
    const positionVon = new Map(reihenfolge.map((inventarIndex, position) => [inventarIndex, position]));

    /*
     * Die Gruppen entstehen aus DIESER Reihenfolge — nicht aus einer zweiten
     * Sortierung nach Unterkategorie.
     *
     * Fund (belegt): Vorher lief die Gliederung über die feste Liste der
     * Unterkategorien, die Nummerierung aber über `orderInventoryBySubcategory`.
     * Solange beide dieselbe Ordnung ergaben, fiel das nicht auf. Seit die
     * Reservewaffe in der Sortierung ans Ende wandert (sie ist nicht abwerfbar,
     * siehe `orderInventoryBySubcategory`), fiel sie in der Gliederung weiter
     * unter „Schusswaffen" — und die Nummern standen nicht mehr aufsteigend:
     * 1, 2, 3, 5, 4. Ein Leser sieht die 5 über der 4.
     *
     * Dadurch, dass die Gruppen beim Durchlaufen der Reihenfolge entstehen,
     * gilt: Die Gruppen stehen in der Reihenfolge ihres ersten Auftretens, und
     * die Nummern steigen lückenlos von oben nach unten. Die Reserve bekommt
     * über `displayGroupFor` eine eigene Gruppe, weil sie keine Spielweise ist.
     */
    const gruppen = [];
    const gruppeVon = new Map();
    for (const index of reihenfolge) {
      const weaponId = weapons[index];
      const id = displayGroupFor(weaponId);
      let gruppe = gruppeVon.get(id);
      if (!gruppe) {
        gruppe = { id, label: displayGroupLabel(id), eintraege: [] };
        gruppeVon.set(id, gruppe);
        gruppen.push(gruppe);
      }
      gruppe.eintraege.push({ weaponId, index, weapon: getWeapon(weaponId) });
    }

    const kinder = [];
    for (const gruppe of gruppen) {
      const kopf = this.#document.createElement('li');
      kopf.className = 'weapon-group';
      kopf.dataset.subcategory = gruppe.id;
      kopf.textContent = `${gruppe.label} (${gruppe.eintraege.length})`;
      kinder.push(kopf);
      kinder.push(...gruppe.eintraege.map(eintrag => this.#buildWeaponItem({
        ...eintrag,
        anzeigeNummer: positionVon.get(eintrag.index) + 1,
      }, active, onWeaponSelect)));
    }

    list.replaceChildren(...kinder);

    // Fokus zurückholen — auf dieselbe Waffe, nicht auf dieselbe Position.
    if (fokussierteWaffe) {
      list.querySelector(`.weapon-item[data-weapon-id="${fokussierteWaffe}"]`)?.focus();
    }
  }

  /** Baut eine Zeile der Waffenliste. */
  #buildWeaponItem({ weaponId, index, weapon, anzeigeNummer }, active, onWeaponSelect) {
    const item = this.#document.createElement('li');
    item.className = 'weapon-item';
    item.dataset.weaponId = weaponId;
    item.dataset.tier = weapon?.powerTier ?? 'common';
    const istAktiv = weaponId === active?.activeWeaponId;
    if (istAktiv) item.classList.add('is-active');

    /*
     * Bedienbar und benannt — auch ohne Maus.
     *
     * Die Zeilen waren reine `<li>` mit Klick-Listener: Für Maus und
     * Zifferntasten hat das gereicht, für Tastatur und Screenreader nicht. In
     * der Baumansicht des Browsers standen sie als gewöhnliche Listeneinträge,
     * ohne Rolle und ohne Fokus — wer nicht klicken kann, kam an die
     * Waffenauswahl gar nicht heran.
     *
     * `role="button"` plus `tabindex` macht sie erreichbar; `aria-label` nennt
     * Anzeigenummer, Name, Schaden und Munition, weil die sichtbare Zeile aus
     * mehreren Spans besteht und vorgelesen sonst „1. Schaufel 20 DMG · 5"
     * ohne Zusammenhang ergäbe. `aria-current` markiert die gewählte Waffe.
     */
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-label', `${anzeigeNummer ?? index + 1}. ${weapon?.displayName ?? weaponId}`);
    if (istAktiv) item.setAttribute('aria-current', 'true');

    // Waffen-Icon: das Logo aus assets/weapons/icons, vom Generator als Pfad
    // hinterlegt. Fehlt die Datei, bleibt die Zeile ohne Bild nutzbar.
    const iconUrl = iconUrlFor(weapon);
    if (iconUrl) {
      const image = this.#document.createElement('img');
      image.className = 'weapon-icon';
      // Auflösung über den Katalog: der Pfad ist relativ zu weapons.js.
      image.src = iconUrl;
      image.alt = '';
      image.width = 24;
      image.height = 24;
      image.loading = 'lazy';
      // Ladefehler dürfen die Liste nicht stören.
      image.addEventListener('error', () => image.remove());
      item.append(image);
    }

    const label = this.#document.createElement('span');
    label.className = 'weapon-name';
    label.textContent = `${anzeigeNummer ?? index + 1}. ${weapon?.displayName ?? weaponId}`;
    // Rarität als Farbe: die abgeleitete Stufe ist im Katalog dokumentiert.
    label.style.color = TIER_COLORS[weapon?.powerTier] ?? TIER_COLORS.common;

    const meta = this.#document.createElement('span');
    const ammo = active?.ammo?.[weaponId];
    const restCooldown = active?.cooldowns?.[weaponId] ?? 0;
    meta.textContent = ammo === 'unbegrenzt'
      ? `${weapon?.damage ?? 0} DMG · ∞`
      : `${weapon?.damage ?? 0} DMG · ${ammo ?? 0}`;
    meta.style.color = '#8ba0b4';

    item.append(label, meta);

    // Nachladezeit sichtbar machen: ohne sie wäre unklar, warum ein Schuss
    // abgelehnt wird. Die Zeile wird zusätzlich abgeblendet.
    if (restCooldown > 0) {
      const cd = this.#document.createElement('span');
      cd.className = 'weapon-cooldown';

      /*
       * Ein BALKEN statt nur einer Zahl.
       *
       * FUND (belegt, 2026-09-25): Die Anzeige bestand aus „⏳ N" und sonst
       * nichts. Eine Zahl zählt in ZÜGEN, nicht in Sekunden — der Spieler kann
       * daraus nicht ablesen, wie weit das Nachladen ist, ohne den
       * Gesamtwert zu kennen. Der Balken zeigt es ohne Rechnen.
       *
       * Die Umrechnung steht in `weaponAnimation.js` (`ladungAnteil`) und ist
       * dort ohne DOM prüfbar — dieselbe Trennung wie bei den
       * Waffenanimationen im Renderer.
       */
      const gesamt = weapon?.cooldown ?? 0;
      const anteil = ladungAnteil(restCooldown, gesamt);

      const spur = this.#document.createElement('span');
      spur.className = 'weapon-cooldown-track';
      const fuellung = this.#document.createElement('span');
      fuellung.className = 'weapon-cooldown-fill';
      fuellung.style.width = `${Math.round(anteil * 100)}%`;
      spur.append(fuellung);

      const zahl = this.#document.createElement('span');
      zahl.className = 'weapon-cooldown-value';
      zahl.textContent = `⏳ ${restCooldown}`;
      cd.title = `Lädt nach — noch ${restCooldown} ${restCooldown === 1 ? 'Zug' : 'Züge'}`;

      cd.append(zahl, spur);
      item.append(cd);
      item.classList.add('is-cooling');
      item.dataset.cooldown = String(restCooldown);
      // Die Zahlen des Balkens als Datenattribute: Die E2E-Suite prüft damit
      // den Fortschritt, ohne aus dem CSS rechnen zu müssen.
      item.dataset.cooldownTotal = String(gesamt);
      item.dataset.cooldownReady = String(Math.round(anteil * 100));
    }

    const radius = weapon?.blastRadius ?? 0;
    item.title = [
      weapon?.displayName ?? weaponId,
      `Schaden ${weapon?.damage ?? 0}`,
      radius > 0 ? `Radius ${Math.round(radius)}` : 'kein Flächenschaden',
      `Stufe ${weapon?.powerTier ?? 'common'} (Wert ${weapon?.powerScore ?? 0})`,
      `Reichweite ${weapon?.maxRange ?? 0} px`,
      (weapon?.cooldown ?? 0) > 0 ? `Nachladen ${weapon.cooldown} Zug/Züge` : 'kein Nachladen',
      weapon?.category ? `Kategorie ${weapon.category}` : null,
    ].filter(Boolean).join(' · ');
    item.addEventListener('click', () => onWeaponSelect?.(index));
    /*
     * Eingabe und Leertaste wählen die Waffe.
     *
     * `stopPropagation` ist hier kein Detail, sondern nötig: Die Leertaste
     * feuert im Spiel (der Eingabe-Controller hängt global am Fenster). Ohne
     * die Sperre würde ein Tastendruck auf einer fokussierten Waffenzeile
     * gleichzeitig auswählen UND schießen.
     */
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      event.stopPropagation();
      onWeaponSelect?.(index);
    });
    return item;
  }

  /**
   * Fügt eine Zeile zum Ereignisprotokoll hinzu.
   *
   * Der Ton entscheidet nicht nur die Farbe, sondern auch die Klasse und damit
   * das Zeilenbudget (Begründung und Messwerte: siehe `VORRANG_LIMIT` oben).
   *
   * ## Zusammenfassen statt anhäufen
   *
   * Ist der Text schon als Zeile vorhanden, wird diese hochgezählt
   * (`… ist gelandet ×12`) statt eine zweite Zeile anzulegen. Die Zeile bleibt
   * dabei STEHEN, wo sie steht: Das Protokoll liest sich von oben nach unten
   * als „das Neueste zuerst", eine hochgezählte Zeile ist aber kein neues
   * Ereignis, sondern dieselbe Meldung öfter. Wer die Reihenfolge streng
   * chronologisch braucht, darf nicht zusammenfassen — für ein
   * Ereignisprotokoll ist die Zahl aussagekräftiger als 40 gleiche Zeilen.
   *
   * @param {string} message Der Meldungstext
   * @param {string} [tone] `danger` | `accent` | `good` | `notice` = Vorrang,
   *   sonst Anzeige
   */
  log(message, tone = 'neutral') {
    const text = String(message);
    const vorhanden = this.#zeileZumZaehlen(text, tone);

    if (vorhanden) {
      vorhanden.anzahl += 1;
      vorhanden.beschriftung = `${text} ×${vorhanden.anzahl}`;
      /*
       * NUR der Text des vorhandenen Knotens ändert sich.
       *
       * Kein Einfügen, kein Neuaufbau. Für die Live-Region (`role="log"`,
       * `aria-relevant="additions"`, siehe index.html) ist eine Textänderung
       * keine Hinzufügung — der Screenreader liest die Region deshalb nicht
       * erneut vor. Zugleich bleibt die Zahl der Knoten unverändert.
       */
      if (vorhanden.knoten) vorhanden.knoten.textContent = vorhanden.beschriftung;
      return;
    }

    const klasse = protokollKlasse(tone);
    const eintrag = { text, tone, klasse, anzahl: 1, beschriftung: text, knoten: null };
    const list = this.#elements.log;

    /*
     * Nur die NEUE Zeile einfügen — die Liste nicht neu aufbauen.
     *
     * Das Protokoll ist die Live-Region des HUD (`role="log"`, siehe
     * index.html). Ein `replaceChildren` über alle Zeilen würde bei jeder
     * Meldung 60 Knoten neu erzeugen; ein Screenreader liest die Region dann
     * als Ganzes vor — bei jeder einzelnen Meldung. Deshalb: vorn einfügen und
     * die älteste Zeile hinten entfernen. Der Screenreader bekommt genau einen
     * neuen Knoten zu sehen (`aria-relevant="additions"`).
     */
    if (list) {
      eintrag.knoten = this.#logItem(text, tone);
      list.prepend(eintrag.knoten);
    }
    this.#logEntries.unshift(eintrag);
    if (klasse === 'rauschen') this.#rauschZeilen.set(text, eintrag);

    this.#trimme();
  }

  /**
   * Sucht die Zeile, in der eine Meldung hochgezählt werden darf.
   *
   * Rauschen: jede lebende Zeile mit demselben Text — bei 4 Figuren sind genau
   * 4 Landungstexte im Umlauf, sie wechseln sich ab und dürfen sich trotzdem
   * zusammenfassen.
   *
   * Vorrang: NUR die neueste Zeile, und nur bei gleichem Text. Eine spätere
   * gleiche Meldung ist ein neues Ereignis: „A ist am Zug" der nächsten Runde
   * muss eine neue Zeile werden (und damit angesagt werden), nicht der Zähler
   * der vorigen Runde steigen.
   *
   * @param {string} text Der Meldungstext
   * @param {string} tone Der Ton der Meldung
   * @returns {object|null} Der Eintrag, der hochgezählt werden darf
   */
  #zeileZumZaehlen(text, tone) {
    if (protokollKlasse(tone) === 'rauschen') return this.#rauschZeilen.get(text) ?? null;
    const neueste = this.#logEntries[0];
    return neueste && neueste.klasse === 'vorrang' && neueste.text === text ? neueste : null;
  }

  /**
   * Hält die Grenzen des Protokolls ein — auf Kosten der richtigen Klasse.
   *
   * Zwei Grenzen, zwei Zahler:
   *
   * 1. **Vorrang über seinem Budget** (`VORRANG_LIMIT`): Es fällt die älteste
   *    VORRANGzeile. Vorrang verdrängt Vorrang — das ist die natürliche
   *    Alterung wichtiger Meldungen.
   * 2. **Überhang über `LOG_LIMIT`:** Den zahlt IMMER das Rauschen (älteste
   *    Rauschzeile zuerst). Deshalb kann Anzeigerauschen eine Vorrangmeldung
   *    nicht verdrängen: Der Pfad, der sie entfernen könnte, entfernt nur
   *    Seinesgleichen.
   *
   * Der zweite Schritt kann nicht ins Leere laufen: `VORRANG_LIMIT` (20) liegt
   * unter `LOG_LIMIT` (60), es bleibt also immer mindestens eine Rauschzeile
   * übrig, bevor die Gesamtzahl die Grenze überschreiten könnte.
   */
  #trimme() {
    while (this.#zaehle('vorrang') > VORRANG_LIMIT) {
      if (!this.#entferneAelteste('vorrang')) break;
    }
    while (this.#logEntries.length > LOG_LIMIT) {
      if (!this.#entferneAelteste('rauschen')) break;
    }

    /*
     * Sicherheitsnetz gegen ein Auseinanderlaufen von Modell und Anzeige.
     *
     * Im Normalbetrieb greift es NIE (das Modell ist oben schon auf `LOG_LIMIT`
     * begrenzt). Es steht hier, weil eine Live-Region, die über die Grenze
     * hinaus wächst, für einen Screenreader unbrauchbar wird — lieber eine
     * Zeile zu wenig als eine unbegrenzte Region.
     */
    const list = this.#elements.log;
    while (list && list.children.length > LOG_LIMIT) list.lastElementChild.remove();
  }

  /** Zählt die Einträge einer Klasse. */
  #zaehle(klasse) {
    let zahl = 0;
    for (const eintrag of this.#logEntries) if (eintrag.klasse === klasse) zahl += 1;
    return zahl;
  }

  /**
   * Entfernt die ÄLTESTE Zeile einer Klasse (das Ende der Liste — sie ist
   * neueste-zuerst) und räumt Zähler und Knoten mit auf.
   * @param {'vorrang'|'rauschen'} klasse
   * @returns {boolean} true, wenn eine Zeile entfernt wurde
   */
  #entferneAelteste(klasse) {
    for (let i = this.#logEntries.length - 1; i >= 0; i -= 1) {
      const eintrag = this.#logEntries[i];
      if (eintrag.klasse !== klasse) continue;
      this.#logEntries.splice(i, 1);
      if (this.#rauschZeilen.get(eintrag.text) === eintrag) this.#rauschZeilen.delete(eintrag.text);
      eintrag.knoten?.remove();
      return true;
    }
    return false;
  }

  /** Baut eine Protokollzeile. */
  #logItem(message, tone) {
    const item = this.#document.createElement('li');
    item.textContent = message;
    /*
     * `notice` (Ablehnungsbegründung) wird WIE `neutral` gezeichnet.
     *
     * Der Ton entscheidet die Klasse und damit das Zeilenbudget — nicht die
     * Farbe. Eine abgelehnte Tasteneingabe ist kein Schaden: Rot wäre eine
     * Aussage über die Lage, die nicht stimmt. Die Zeile hebt sich deshalb
     * nicht von den Anzeigezeilen ab; sie bleibt nur länger stehen. Wer hier
     * später eine eigene Farbe setzt, ändert eine getroffene Entscheidung.
     */
    item.style.color = tone === 'danger' ? '#ef476f'
      : tone === 'good' ? '#90be6d'
      : tone === 'accent' ? '#f4a261'
      : '#8ba0b4';
    return item;
  }

  clearLog() {
    this.#logEntries = [];
    this.#rauschZeilen.clear();
    this.#elements.log?.replaceChildren();
  }
}

export default Hud;
