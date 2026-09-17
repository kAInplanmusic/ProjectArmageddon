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

export const MAX_LOBBY_PLAYERS = 12;

/**
 * Wie viele Spieler ein einzelnes Team haben darf.
 *
 * Die wirksame Grenze ist die SUMME (`MAX_LOBBY_PLAYERS`); dieser Wert begrenzt
 * nur, wie ungleich die Verteilung sein darf. Beide müssen zusammenpassen —
 * vorher taten sie es nicht (3 je Team, aber 12 in der Summe).
 *
 * Gemessen: Der Motor trägt 12 Figuren ohne Einschränkung.
 */
export const MAX_PLAYERS_PER_TEAM = 6;

export class LobbyManager {
  #lobbies = new Map();
  #reconnectWindowMs;

  constructor({ reconnectWindowMs = 30_000 } = {}) {
    this.#reconnectWindowMs = reconnectWindowMs;
  }

  create({
    teams = 2, playersPerTeam = 2, preset = 'hills', kartentyp = null, seed = undefined,
    hostName = 'Host', orientation = 'landscape', sidegrades = null, loadouts = null,
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
    if (playersPerTeam < 1 || playersPerTeam > MAX_PLAYERS_PER_TEAM) {
      throw new Error(`playersPerTeam muss zwischen 1 und ${MAX_PLAYERS_PER_TEAM} liegen`);
    }
    const capacity = teams * playersPerTeam;
    if (capacity > MAX_LOBBY_PLAYERS) throw new Error(`Kapazität überschreitet ${MAX_LOBBY_PLAYERS} Spieler`);
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
      playersPerTeam,
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
    return {
      id: lobby.id,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
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
      occupied: lobby.seats.length,
      connected: lobby.seats.filter(seat => seat.connected).length,
      seats: lobby.seats.map(seat => ({
        seatIndex: seat.seatIndex,
        name: seat.name,
        entityId: seat.entityId,
        connected: seat.connected,
        teamId: seat.seatIndex % lobby.teams,
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

  /** Belegt einen freien Platz. Ohne lobbyId wird eine neue Lobby erstellt. */
  join(lobbyId, { name = 'Spieler', token = null } = {}) {
    const lobby = this.get(lobbyId);
    if (!lobby) throw new Error('Lobby nicht gefunden');

    // Wiederverbindung: bekannter Token darf denselben Platz zurückholen.
    if (token) {
      const existing = lobby.seats.find(seat => seat.token === token);
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        return { ...existing, lobbyId, resumed: true };
      }
    }

    if (lobby.status !== LOBBY_STATUS.OPEN) throw new Error('Lobby nimmt keine Spieler mehr auf');
    if (lobby.seats.length >= lobby.capacity) {
      throw new Error(`Lobby ist voll (${lobby.seats.length}/${lobby.capacity} Plätze belegt)`);
    }

    const seatIndex = lobby.seats.length;
    if (seatIndex >= lobby.capacity) {
      throw new Error(`Lobby ist voll (${lobby.seats.length}/${lobby.capacity} Plätze belegt)`);
    }

    const seat = {
      seatIndex,
      name,
      token: randomUUID(),
      connected: true,
      disconnectedAt: null,
      entityId: null,
    };
    lobby.seats.push(seat);
    return { ...seat, lobbyId, resumed: false };
  }

  /** Markiert einen Platz als getrennt und startet das Reconnect-Fenster. */
  disconnect(lobbyId, token) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    const seat = lobby.seats.find(entry => entry.token === token);
    if (!seat) return null;
    seat.connected = false;
    seat.disconnectedAt = Date.now();
    return seat;
  }

  /** Entfernt abgelaufene Plätze. Gibt die betroffenen Token zurück. */
  pruneDisconnected(now = Date.now()) {
    const removed = [];
    for (const lobby of this.#lobbies.values()) {
      lobby.seats = lobby.seats.filter(seat => {
        if (seat.connected || seat.disconnectedAt === null) return true;
        if (now - seat.disconnectedAt < this.#reconnectWindowMs) return true;
        removed.push({ lobbyId: lobby.id, token: seat.token, name: seat.name });
        return false;
      });
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
