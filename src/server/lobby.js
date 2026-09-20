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
 * Wie viele BEITRETENDE eine Lobby fasst — die alte Grenze.
 *
 * Sie gilt im Modus „ein Platz je Beitritt" (ohne `unitsPerPlayer`): Dort ist
 * ein Beitritt ein Platz. Im Modus der Matcharten (ein Mensch je Team) begrenzt
 * sie nicht mehr die Figuren, sondern nur die Zahl der Menschen — und die ist
 * ohnehin durch `teams` begrenzt.
 */
export const MAX_LOBBY_PLAYERS = 12;

/**
 * Wie viele FIGUREN eine Lobby fassen darf.
 *
 * Die Matcharten nennen im Kriegsmodus **8 Spieler × 5 Einheiten = 40 Figuren**.
 * Der Motor trägt sie (gemessen: 40 Figuren kosten 0,312 ms je Tick = 1,9 %
 * eines Kerns, `npm run measure:figures`). Diese Grenze ist damit die wirksame;
 * `MAX_LOBBY_PLAYERS` gilt nur noch für den alten Modus mit einem Platz je
 * Beitritt.
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
 * `unitsPerPlayer` (siehe `create`) besetzt ein Beitritt deshalb ein ganzes
 * Team; freie Teams übernimmt die Bot-KI.
 *
 * Lokal ist es ein Hot-Seat: Der Mensch am Gerät spielt JEDE Figur der Reihe
 * nach (es gibt keine Bots im Client) — also auch die gegnerischen, weil ein
 * zweiter Mensch am selben Gerät fehlt. Für die Kennzahlen zählt sein EIGENES
 * Team (Team 0).
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
     * FUND (belegt): Bis hierher nahm JEDER Beitritt GENAU EINEN Platz ein. Ein
     * Mensch steuerte damit eine EINZIGE Figur — einen Modus mit einer Einheit je
     * Spieler gibt es in den Matcharten aber gar nicht. Sie nennen 3, 4 bzw. 5
     * Einheiten JE SPIELER:
     *
     *     klein   2–4 Spieler × 3 Einheiten =  6–12 Figuren
     *     groß      4 Spieler × 4 Einheiten = 16    Figuren
     *     Krieg   6–8 Spieler × 5 Einheiten = 30–40 Figuren
     *
     * Mit `unitsPerPlayer` (3/4/5) besetzt ein Beitritt ein GANZES TEAM: Der
     * Mensch steuert ALLE `unitsPerPlayer` Figuren einer Seite; freie Teams
     * übernimmt die Bot-KI. Die Zugreihenfolge bleibt „jede Einheit einzeln"
     * (S1E1, S2E1, S1E2 …) — der Motor erzeugt die Figuren bereits so
     * (`#spawnPlayers`: `teamId = index % teams`).
     *
     * OHNE diese Angabe bleibt die alte Aufteilung erhalten (ein Platz je
     * Beitritt). Werkzeuge und Tests setzen sie weiterhin, und ein Match ohne die
     * Option verläuft exakt wie bisher.
     */
    const jeSpieler = unitsPerPlayer === null ? null : Math.trunc(Number(unitsPerPlayer));
    if (jeSpieler !== null && (!Number.isFinite(jeSpieler) || jeSpieler < 1
      || jeSpieler > MAX_PLAYERS_PER_TEAM)) {
      throw new Error(`unitsPerPlayer muss zwischen 1 und ${MAX_PLAYERS_PER_TEAM} liegen`);
    }
    if (playersPerTeam !== null && jeSpieler !== null && playersPerTeam !== jeSpieler) {
      throw new Error(
        `playersPerTeam (${playersPerTeam}) und unitsPerPlayer (${jeSpieler}) widersprechen sich`,
      );
    }
    // Figuren je Team: die eine Zahl, die der Motor braucht.
    const figurenProTeam = jeSpieler ?? playersPerTeam ?? 2;
    if (figurenProTeam < 1 || figurenProTeam > MAX_PLAYERS_PER_TEAM) {
      throw new Error(`playersPerTeam muss zwischen 1 und ${MAX_PLAYERS_PER_TEAM} liegen`);
    }
    const capacity = teams * figurenProTeam;
    /*
     * Zwei Grenzen, zwei Bedeutungen.
     *
     * `MAX_LOBBY_PLAYERS` (12) begrenzt die BEITRETENDEN — im alten Modus, wo ein
     * Beitritt einen Platz belegt, ist das dasselbe wie die Platzzahl.
     * `MAX_LOBBY_FIGURES` (40) begrenzt die FIGUREN: Der Kriegsmodus nennt
     * 8 Spieler × 5 Einheiten = 40, und der Motor trägt sie (gemessen: 1,9 % eines
     * Kerns, `npm run measure:figures`).
     */
    if (capacity > MAX_LOBBY_FIGURES) {
      throw new Error(`Kapazität überschreitet ${MAX_LOBBY_FIGURES} Figuren`);
    }
    if (jeSpieler === null && capacity > MAX_LOBBY_PLAYERS) {
      throw new Error(`Kapazität überschreitet ${MAX_LOBBY_PLAYERS} Spieler`);
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
     * „Belegt" zählt BEITRETENDE, nicht Plätze.
     *
     * Im Modus der Matcharten belegt ein Mensch ein ganzes Team — drei Plätze,
     * aber EIN Spieler. Die alte Zählung (`seats.length`) hätte bei zwei Teams mit
     * je drei Einheiten „2 von 2 belegt" gemeldet, obwohl erst ein Mensch da war.
     * Ohne `unitsPerPlayer` bleibt es bei einem Platz je Beitritt, also bei der
     * alten Zahl.
     */
    const beitritte = new Set(lobby.seats.map(seat => seat.token));
    const plaetze = lobby.unitsPerPlayer !== null ? lobby.teams : lobby.capacity;
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
   * Belegt Plätze.
   *
   * Zwei Aufteilungen, je nach Lobby-Konfiguration:
   *
   *  - **`unitsPerPlayer = null`** (alt): Ein Beitritt belegt EINEN Platz.
   *  - **`unitsPerPlayer = n`** (Matcharten): Ein Beitritt belegt ein GANZES
   *    TEAM — `n` Figuren. Die freien Teams übernimmt die Bot-KI. Ein Mensch
   *    zieht damit mehrfach je Runde, aber nie zweimal hintereinander.
   *
   * Der Rückgabewert trägt immer `seats` (alle Plätze dieses Beitritts) und
   * `entityIds` (alle Figuren; erst nach dem Matchstart gefüllt): Bei einem
   * Team sind das mehrere, und wer nur `entityId` liest, sähe eine einzige.
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

    if (lobby.unitsPerPlayer !== null) {
      // Modus der Matcharten: ein freies TEAM je Beitritt.
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
      for (let unitIndex = 0; unitIndex < lobby.unitsPerPlayer; unitIndex += 1) {
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

    // Alte Aufteilung: ein Platz je Beitritt, in Reihenfolge der Slots.
    if (lobby.seats.length >= lobby.capacity) {
      throw new Error(`Lobby ist voll (${lobby.seats.length}/${lobby.capacity} Plätze belegt)`);
    }

    const seatIndex = lobby.seats.length;
    const seat = {
      seatIndex,
      // Ohne `unitsPerPlayer` ist der Platz sein eigener Figur-Slot.
      figureIndex: seatIndex,
      playerIndex: seatIndex,
      teamId: seatIndex % lobby.teams,
      unitIndex: Math.floor(seatIndex / lobby.teams),
      name,
      token: randomUUID(),
      connected: true,
      disconnectedAt: null,
      entityId: null,
    };
    lobby.seats.push(seat);
    return this.#antwort(lobby, seat, [seat], { resumed: false });
  }

  /** Einheitliche Antwort für beide Aufteilungen. */
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
   * Alle Plätze desselben Tokens: Im Modus der Matcharten besitzt ein Mensch ein
   * ganzes Team. Nur den ersten Platz zu trennen hieße, dass seine übrigen
   * Figuren als „verbunden" gelten — und damit vom Bot NICHT übernommen würden.
   * Der Mensch wäre weg, seine Einheiten stünden still.
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
       * Einheiten fielen weg, die dritte stünde als „verbunden" da und würde vom
       * Bot nicht übernommen.
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
