/**
 * In-Memory-Lobby-Verwaltung.
 *
 * Eine Lobby hält Spielerplätze, Wiederbeitritts-Token und die Match-
 * Konfiguration. Zustand liegt bewusst nur im Speicher des autoritativen
 * Servers — es gibt keine Client-Autorität über Slot-Belegung.
 *
 * @module LobbyManager
 */
import { randomUUID } from 'node:crypto';
import { ORIENTATIONS, TEAM_COLORS } from '../engine/match.js';
import { isKnownSidegrade } from '../shared/config/sidegrades.js';
import { CLASS_DEFINITIONS, CLASS_ARCHETYPES } from '../shared/config/classes.js';

export const LOBBY_STATUS = Object.freeze({
  OPEN: 'open',
  RUNNING: 'running',
  FINISHED: 'finished',
});

/**
 * Wie viele FIGUREN eine Lobby fassen darf.
 *
 * Die Matcharten nennen im Kriegsmodus **8 Spieler × 5 Einheiten = 40 Figuren**.
 * Der Motor trägt sie (gemessen: 40 Figuren kosten 0,312 ms je Tick = 1,9 %
 * eines Kerns, `npm run measure:figures`).
 *
 * Eine zweite Grenze für die Zahl der MENSCHEN gibt es nicht mehr: Ein Beitritt
 * belegt ein ganzes Team, und Teams gibt es 2 bis 8 (`TEAM_COLORS`). Die alte
 * Konstante `MAX_LOBBY_PLAYERS = 12` zählte Plätze im Modus „ein Platz je
 * Beitritt" — den gibt es nicht, seit ein Mensch ein Team führt.
 */
export const MAX_LOBBY_FIGURES = 40;

/**
 * Wie viele EINHEITEN ein Team haben darf — also wie viele Einheiten ein Mensch
 * steuert, wenn er ein ganzes Team besetzt.
 *
 * Zwei Grenzen passen zusammen: Die Summe der Figuren darf `MAX_LOBBY_FIGURES`
 * (40) nicht überschreiten, die Einheiten je Team `MAX_PLAYERS_PER_TEAM` (6).
 * Beide müssen zusammenpassen — vorher taten sie es nicht (3 je Team, aber 12 in
 * der Summe).
 *
 * Gemessen: Der Motor trägt 40 Figuren (1,9 % eines Kerns).
 *
 * ## Wer steuert welche Figur (berichtigt 2026-09-20)
 *
 * **Ein Mensch steuert ein TEAM, nicht eine Figur.** Die Matcharten kennen
 * keinen Modus mit einer Einheit je Spieler; sie nennen 3, 4 bzw. 5 Einheiten je
 * Spieler (klein 2–4 × 3, groß 4 × 4, Krieg 6–8 × 5 = bis 40 Figuren). Mit
 * `unitsPerPlayer` (siehe `create`) besetzt ein Beitritt deshalb ein ganzes Team.
 *
 * **Es gibt KEINE Bot-KI.** Teams werden ausschließlich von Menschen gespielt;
 * ein unbesetztes Team ist kein Bot-Team, sondern ein unbesetztes Team, und das
 * Match startet erst, wenn alle Teams besetzt sind (`alleTeamsBesetzt`). Die
 * SPEZIELLEN NPCs (Günther, Geschütze) sind davon unberührt: Sie stecken im
 * Motor, laufen deterministisch mit und besetzen kein Team.
 *
 * Lokal ist es ein Hot-Seat: Der Mensch am Gerät spielt JEDE Figur der Reihe
 * nach — also auch die gegnerischen, weil ein zweiter Mensch am selben Gerät
 * fehlt. Für die Kennzahlen zählt sein EIGENES Team (Team 0).
 *
 * Der Zug läuft dabei immer „jede Einheit einzeln" (S1E1, S2E1, S1E2 — nie
 * zweimal dieselbe Seite hintereinander). Das klassische Modell ist damit
 * umgesetzt und durch `tests/zugreihenfolge.test.js` festgehalten; es ist NICHT
 * das gleichzeitige Ziehen (siehe MASTERDOTO, „Gleichzeitige Züge").
 *
 * *Frühere Fassung (falsch):* „Ein Platz = eine Figur, online besitzt ein Mensch
 * einen Platz." Das beschrieb den Code, nicht das Modell — und widersprach den
 * Matcharten. Der Fehler ist hier festgehalten, damit er nicht zurückkommt.
 */
export const MAX_PLAYERS_PER_TEAM = 6;

export class LobbyManager {
  #lobbies = new Map();
  #reconnectWindowMs;

  constructor({ reconnectWindowMs = 30_000 } = {}) {
    this.#reconnectWindowMs = reconnectWindowMs;
  }

  create({
    teams = 2, playersPerTeam = null, unitsPerPlayer = null, preset = 'hills', kartentyp = null,
    seed = undefined, hostName = 'Host', orientation = 'landscape', sidegrades = null,
    loadouts = null,
  } = {}) {
    /*
     * Grenzen der Teamzahl.
     *
     * FUND (belegt, Skalierungsplanung): Hier stand **4** — so viele wie es
     * Teamfarben gab. Die Matcharten nennen bis zu 8 Spieler; in 2 Teams mit je
     * 3 Einheiten sind das 6 Figuren, die untergebracht werden müssen.
     *
     * Beide Grenzen richten sich jetzt an derselben Quelle aus: `TEAM_COLORS`.
     * Wer mehr Teams erlaubt, als Farben da sind, bricht die Anzeige — die
     * Zuordnung ist `TEAM_COLORS[teamId]`.
     */
    if (teams < 2 || teams > TEAM_COLORS.length) {
      throw new Error(`teams muss zwischen 2 und ${TEAM_COLORS.length} liegen`);
    }
    /*
     * Grenzen der Lobby.
     *
     * `teams`: 2 bis 4. Die Untergrenze ist sachlich (ein Duell braucht zwei
     * Seiten), die Obergrenze kommt aus der Anzeige: Die Teamfarben sind eine
     * feste Liste (`TEAM_COLORS`, 4 Einträge).
     *
     * `playersPerTeam`: 1 bis 6.
     *
     * FUND (belegt): Hier stand eine Grenze von **3**, ohne Begründung im Code
     * — an keiner Stelle stand, warum. Die Messung zeigt, dass sie nicht nötig
     * war:
     *
     *     Konfiguration   Figuren   Leben min/max   läuft
     *     2 × 4 = 8             8        63 / 104      OK
     *     2 × 5 = 10           10        63 / 104      OK
     *     4 × 3 = 12           12        63 / 104      OK
     *     2 × 6 = 12           12        63 / 104      OK
     *
     * Der Motor trägt 12 Figuren ohne Einschränkung: Alle werden gesetzt, alle
     * Teams stehen, die Klassen- und Archetypverteilung greift je Platz
     * (`resolveLoadout` indiziert zyklisch und kennt keine Obergrenze).
     *
     * Die alte Grenze 3 war zudem NIE die wirksame: `MAX_LOBBY_PLAYERS` lag
     * bereits bei 12, also erlaubte die Lobby in der Summe mehr, als sie je
     * Team zuließ. Die beiden Zahlen widersprachen sich.
     *
     * Gesetzt wird 6 je Team — damit ist `2 Teams × 6 = 12` erreichbar (das
     * größte Match, das die Kapazität hergibt) und `4 Teams × 3 = 12`
     * ebenfalls. Die Summe bleibt die Grenze.
     */
    /*
     * EINHEITEN JE SPIELER — der Modus der Matcharten (2026-09-20).
     *
     * Die Matcharten nennen 3, 4 bzw. 5 Einheiten JE SPIELER:
     *
     *     klein   2–4 Spieler × 3 Einheiten =  6–12 Figuren
     *     groß      4 Spieler × 4 Einheiten = 16    Figuren
     *     Krieg   6–8 Spieler × 5 Einheiten = 30–40 Figuren
     *
     * **Ein Beitritt = ein TEAM.** Der Mensch steuert ALLE `unitsPerPlayer`
     * Figuren einer Seite. Einen Modus mit einer Einheit je Spieler gibt es
     * nicht, und ein freies Team wird NICHT von einer KI übernommen: Das Match
     * startet erst, wenn alle Teams besetzt sind (`alleTeamsBesetzt`).
     *
     * `playersPerTeam` bleibt als gleichbedeutende Angabe erlaubt (der Motor
     * nennt die Zahl so, und Werkzeuge setzen sie); beide zusammen müssen
     * übereinstimmen.
     */
    const jeSpieler = Math.trunc(Number(unitsPerPlayer ?? playersPerTeam ?? 2));
    if (!Number.isFinite(jeSpieler) || jeSpieler < 1 || jeSpieler > MAX_PLAYERS_PER_TEAM) {
      throw new Error(
        `unitsPerPlayer muss zwischen 1 und ${MAX_PLAYERS_PER_TEAM} liegen (war ${jeSpieler})`,
      );
    }
    if (playersPerTeam !== null && jeSpieler !== Math.trunc(Number(playersPerTeam))) {
      throw new Error(
        `playersPerTeam (${playersPerTeam}) und unitsPerPlayer (${jeSpieler}) widersprechen sich`,
      );
    }
    // Figuren je Team: die eine Zahl, die der Motor braucht.
    const figurenProTeam = jeSpieler;
    const capacity = teams * figurenProTeam;
    /*
     * Die wirksame Grenze ist die FIGURENZAHL.
     *
     * `MAX_LOBBY_FIGURES` (40): Der Kriegsmodus nennt 8 Spieler × 5 Einheiten =
     * 40, und der Motor trägt sie (gemessen: 1,9 % eines Kerns,
     * `npm run measure:figures`).
     *
     * Die Zahl der MENSCHEN ist durch `teams` begrenzt (ein Mensch je Team, 2–8)
     * — dafür braucht es keine eigene Konstante mehr: Ein Beitritt belegt ein
     * Team, und mehr Teams als `teams` gibt es nicht.
     */
    if (capacity > MAX_LOBBY_FIGURES) {
      throw new Error(`Kapazität überschreitet ${MAX_LOBBY_FIGURES} Figuren`);
    }
    if (!ORIENTATIONS.includes(orientation)) throw new Error(`Unbekannte Ausrichtung: ${orientation}`);

    /*
     * Sidegrades prüfen — aber TOLERANT.
     *
     * Eine unbekannte Kennung wird auf `null` gesetzt, nicht abgelehnt: Sie
     * wirkt dann wie „kein Sidegrade", genau wie in `combatProfile()`. Der
     * Grund ist derselbe — ein Tippfehler oder eine Kennung aus einer älteren
     * Fassung darf ein Match nicht verhindern, und ein fehlendes Sidegrade ist
     * kein Fehler.
     *
     * Anders als bei `orientation`, wo ein falscher Wert abgelehnt wird: Dort
     * wäre ein stiller Ersatz eine andere KARTE als bestellt, also ein sichtbar
     * anderes Spiel. Beim Sidegrade ist der neutrale Zustand unschädlich.
     */
    const geprüfteSidegrades = Array.isArray(sidegrades)
      ? sidegrades
        .slice(0, capacity)
        .map(s => (isKnownSidegrade(s) ? s : null))
      : null;

    /*
     * Loadouts: Klasse und Archetyp je Platz — ebenfalls TOLERANT geprüft.
     *
     * Unbekannte Kennungen werden auf `null` gesetzt (dann gilt der Platzwert),
     * statt die Lobby abzulehnen. Dieselbe Haltung wie bei den Sidegrades: Eine
     * Konfiguration mit Tippfehler soll spielbar bleiben, und ein fehlender
     * Eintrag ist kein Fehler.
     */
    const geprüfteLoadouts = Array.isArray(loadouts)
      ? loadouts.slice(0, capacity).map(eintrag => {
        if (!eintrag || typeof eintrag !== 'object') return null;
        const klasse = CLASS_DEFINITIONS[eintrag.classId] ? eintrag.classId : null;
        const archetyp = CLASS_ARCHETYPES[eintrag.archetypeId] ? eintrag.archetypeId : null;
        if (!klasse && !archetyp) return null;
        return {
          ...(klasse ? { classId: klasse } : {}),
          ...(archetyp ? { archetypeId: archetyp } : {}),
        };
      })
      : null;

    const id = randomUUID().slice(0, 8);
    const lobby = {
      id,
      teams,
      // Figuren je Team — die Zahl, die der Motor liest.
      playersPerTeam: figurenProTeam,
      /*
       * Einheiten je Spieler (3/4/5) oder `null` für die alte Aufteilung.
       *
       * `null` heißt: Ein Beitritt belegt EINEN Platz (Werkzeuge, Tests und
       * Replays aus einer älteren Fassung). Ein Wert heißt: Ein Beitritt besetzt
       * ein ganzes Team — der Modus der Matcharten.
       */
      unitsPerPlayer: jeSpieler,
      capacity,
      preset,
      /*
       * Der Kartentyp des neuen Generators (`terrainGen2`).
       *
       * Wie `preset` gehört er zur Lobby-Konfiguration: Der Server baut das
       * Gelände autoritativ, damit alle Teilnehmer dieselbe Karte sehen. Ein
       * unbekannter Wert fällt im Generator auf die Vorgabe zurück — der
       * Server muss ihn deshalb nicht gegen eine Liste prüfen.
       */
      kartentyp,
      // Ausrichtung gehört zur Lobby: sie bestimmt die Kartengröße und muss für
      // alle Teilnehmer dieselbe sein.
      orientation,
      // Sidegrades je Spielerplatz — Teil der Match-Konfiguration wie `preset`.
      sidegrades: geprüfteSidegrades,
      // Klassenwahl je Spielerplatz — ebenfalls Konfiguration, kein Zufall.
      loadouts: geprüfteLoadouts,
      seed,
      status: LOBBY_STATUS.OPEN,
      createdAt: Date.now(),
      seats: [],
    };
    this.#lobbies.set(id, lobby);

    const host = this.join(id, { name: hostName });
    return { lobby: this.describe(id), player: host };
  }

  get(id) {
    return this.#lobbies.get(id) ?? null;
  }

  /**
   * Setzt eine bereits aufgebaute Lobby unter ihrer ID ein (Wiederherstellung
   * nach Serverneustart). Erwartet ein vollständiges Lobby-Objekt.
   */
  restoreWithId(lobby) {
    if (!lobby || typeof lobby.id !== 'string') {
      throw new TypeError('Lobby mit gültiger ID erwartet');
    }
    this.#lobbies.set(lobby.id, lobby);
    return lobby;
  }

  describe(id) {
    const lobby = this.get(id);
    if (!lobby) return null;
    /*
     * „Belegt" zählt MENSCHEN, nicht Plätze.
     *
     * Ein Mensch belegt ein ganzes Team — bei drei Einheiten sind das drei
     * Plätze, aber EIN Spieler. Die alte Zählung (`seats.length`) hätte „3 von
     * 2" gemeldet, obwohl erst ein Mensch da ist.
     *
     * `seatsTotal` ist deshalb die Zahl der TEAMS: So viele Menschen passen
     * hinein. `capacity` bleibt die Zahl der Figuren.
     */
    const beitritte = new Set(lobby.seats.map(seat => seat.token));
    const plaetze = lobby.teams;
    return {
      id: lobby.id,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      unitsPerPlayer: lobby.unitsPerPlayer ?? null,
      capacity: lobby.capacity,
      preset: lobby.preset,
      orientation: lobby.orientation,
      // Die Sidegrades gehören in die Beschreibung: Ohne sie sähe der Client
      // nicht, mit welchem Profil die Figuren antreten.
      sidegrades: Array.isArray(lobby.sidegrades) ? [...lobby.sidegrades] : null,
      loadouts: Array.isArray(lobby.loadouts) ? lobby.loadouts.map(l => (l ? { ...l } : null)) : null,
      status: lobby.status,
      // Belegt = reservierte Plätze. Die Entity-ID existiert erst, wenn ein
      // Match gestartet und die Welt erzeugt wurde.
      occupied: beitritte.size,
      seatsOccupied: lobby.seats.length,
      seatsTotal: plaetze,
      connected: new Set(
        lobby.seats.filter(seat => seat.connected).map(seat => seat.token),
      ).size,
      seats: lobby.seats.map(seat => ({
        seatIndex: seat.seatIndex,
        figureIndex: seat.figureIndex ?? seat.seatIndex,
        name: seat.name,
        entityId: seat.entityId,
        connected: seat.connected,
        teamId: seat.teamId ?? seat.seatIndex % lobby.teams,
        unitIndex: seat.unitIndex ?? 0,
      })),
    };
  }

  /**
   * Lobbys für die Auswahlliste im Menü.
   *
   * Entschiedene Lobbys werden ausgelassen: Sie lassen sich nicht mehr
   * betreten (`join` lehnt bei status !== OPEN ab), und ihre Anzeige wäre eine
   * Sackgasse. In der Entwicklungsdatei sammelten sich 258 davon an und
   * verdeckten die spielbaren Einträge vollständig.
   *
   * @param {object} [optionen]
   * @param {boolean} [optionen.mitBeendeten=false] - auch entschiedene zeigen
   */
  list({ mitBeendeten = false } = {}) {
    return [...this.#lobbies.values()]
      .filter(lobby => mitBeendeten || lobby.status !== LOBBY_STATUS.FINISHED)
      .map(lobby => this.describe(lobby.id));
  }

  /**
   * Belegt ein TEAM.
   *
   * **Ein Beitritt = ein Team.** Ein Mensch führt alle `unitsPerPlayer` Figuren
   * einer Seite; einen Modus mit einer Einheit je Spieler gibt es nicht (siehe
   * die Matcharten). Freie Teams werden NICHT von einer KI übernommen — das
   * Match startet erst, wenn alle Teams von Menschen besetzt sind
   * (`alleTeamsBesetzt`).
   *
   * Der Rückgabewert trägt `seats` (alle Plätze dieses Beitrags) und `entityIds`
   * (alle Figuren; erst nach dem Matchstart gefüllt): Bei einem Team sind das
   * mehrere, und wer nur `entityId` liest, sähe eine einzige.
   */
  join(lobbyId, { name = 'Spieler', token = null } = {}) {
    const lobby = this.get(lobbyId);
    if (!lobby) throw new Error('Lobby nicht gefunden');

    // Wiederverbindung: bekannter Token holt ALLE seine Plätze zurück.
    if (token) {
      const vorhandene = lobby.seats.filter(seat => seat.token === token);
      if (vorhandene.length > 0) {
        for (const seat of vorhandene) {
          seat.connected = true;
          seat.disconnectedAt = null;
        }
        return this.#antwort(lobby, vorhandene[0], vorhandene, { resumed: true });
      }
    }

    if (lobby.status !== LOBBY_STATUS.OPEN) throw new Error('Lobby nimmt keine Spieler mehr auf');

    const belegteTeams = new Set(lobby.seats.map(seat => seat.teamId));
    let teamId = -1;
    for (let t = 0; t < lobby.teams; t += 1) {
      if (!belegteTeams.has(t)) { teamId = t; break; }
    }
    if (teamId < 0) {
      throw new Error(`Alle ${lobby.teams} Teams sind besetzt — kein Platz frei`);
    }

    const neuerToken = randomUUID();
    const seats = [];
    for (let unitIndex = 0; unitIndex < lobby.playersPerTeam; unitIndex += 1) {
      seats.push({
        // Figur-Slot des Motors: `#spawnPlayers` setzt `teamId = index % teams`.
        figureIndex: unitIndex * lobby.teams + teamId,
        seatIndex: lobby.seats.length + seats.length,
        playerIndex: teamId,
        teamId,
        unitIndex,
        name,
        token: neuerToken,
        connected: true,
        disconnectedAt: null,
        entityId: null,
      });
    }
    lobby.seats.push(...seats);
    return this.#antwort(lobby, seats[0], seats, { resumed: false });
  }

  /**
   * Ist die Lobby vollständig? — Jedes Team hat einen VERBUNDENEN Menschen.
   *
   * DAS ist die Startbedingung. Ohne sie müsste eine KI einspringen, und die
   * gibt es nicht: Ein unbesetztes Team ist kein Bot-Team, sondern ein
   * unbesetztes Team.
   *
   * „Verbunden" gehört zur Bedingung, nicht nur „beansprucht": Nach einem
   * Serverneustart stehen die Teams in der Sicherung, aber ihre Menschen sind
   * erst wieder da, wenn sie sich verbinden. Vorher loszulaufen hieße, gegen
   * leere Plätze zu spielen.
   */
  alleTeamsBesetzt(lobbyId) {
    const lobby = typeof lobbyId === 'string' ? this.get(lobbyId) : lobbyId;
    if (!lobby) return false;
    const belegt = new Set(
      lobby.seats.filter(seat => seat.token !== null && seat.connected).map(seat => seat.teamId),
    );
    for (let t = 0; t < lobby.teams; t += 1) {
      if (!belegt.has(t)) return false;
    }
    return true;
  }

  /** Antwort auf einen Beitritt: alle Plätze und Figuren dieses Menschen. */
  #antwort(lobby, seat, seats, { resumed }) {
    return {
      ...seat,
      lobbyId: lobby.id,
      resumed,
      // Alle Plätze dieses Beitritts — bei einem Team mehrere.
      seats: seats.map(entry => ({ ...entry })),
      entityIds: seats.map(entry => entry.entityId).filter(id => id !== null),
    };
  }

  /**
   * Markiert einen BEITRITT als getrennt und startet das Reconnect-Fenster.
   *
   * Alle Plätze desselben Tokens: Ein Mensch führt ein ganzes Team. Nur den
   * ersten Platz zu trennen wäre falsch — die übrigen Figuren gälten als
   * „verbunden" und der Mensch wäre halb da.
   *
   * Für seine Züge springt NIEMAND ein: Es gibt keine Bot-KI. Bis er
   * wiederkommt, läuft sein Zug über die Zugzeit ab. Nach dem Reconnect-Fenster
   * verfällt sein Team (`pruneDisconnected`) und die Lobby nimmt wieder einen
   * Menschen auf.
   */
  disconnect(lobbyId, token) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    const seats = lobby.seats.filter(entry => entry.token === token);
    if (seats.length === 0) return null;
    for (const seat of seats) {
      seat.connected = false;
      seat.disconnectedAt = Date.now();
    }
    return seats[0];
  }

  /** Entfernt abgelaufene Beitritte. Gibt die betroffenen Token zurück. */
  pruneDisconnected(now = Date.now()) {
    const removed = [];
    for (const lobby of this.#lobbies.values()) {
      /*
       * Ein ganzes TEAM verfällt zusammen.
       *
       * Sonst bliebe nach dem Fenster eine halbe Mannschaft übrig: Zwei von drei
       * Einheiten fielen weg, die dritte stünde als „verbunden" da. Und das Team
       * wäre für einen neuen Menschen nicht mehr frei.
       */
      const abgelaufen = new Set();
      for (const seat of lobby.seats) {
        if (seat.connected || seat.disconnectedAt === null) continue;
        if (now - seat.disconnectedAt < this.#reconnectWindowMs) continue;
        abgelaufen.add(seat.token);
      }
      // Ein Eintrag je BEITRITT, nicht je Platz: Sonst stünde derselbe Mensch
      // dreimal in der Liste, nur weil er drei Einheiten führt.
      for (const token of abgelaufen) {
        const erster = lobby.seats.find(seat => seat.token === token);
        removed.push({ lobbyId: lobby.id, token, name: erster?.name ?? null });
      }
      lobby.seats = lobby.seats.filter(seat => !abgelaufen.has(seat.token));
      lobby.seats.forEach((seat, index) => { seat.seatIndex = index; });
    }
    return removed;
  }

  markRunning(lobbyId) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    lobby.status = LOBBY_STATUS.RUNNING;
    return lobby;
  }

  markFinished(lobbyId) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    lobby.status = LOBBY_STATUS.FINISHED;
    return lobby;
  }

  close(lobbyId) {
    return this.#lobbies.delete(lobbyId);
  }

  /**
   * Alle Lobbys als Rohobjekte (nicht die beschreibende Ansicht).
   *
   * Nötig für die Persistenz: `list()` liefert nur die nach außen sichtbaren
   * Felder, während zum Speichern auch Sitze und Token gebraucht werden.
   */
  all() {
    return [...this.#lobbies.values()];
  }

  get size() {
    return this.#lobbies.size;
  }
}

export default LobbyManager;
