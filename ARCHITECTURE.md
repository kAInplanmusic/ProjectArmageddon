# ARCHITECTURE.md

## System boundaries

| Schicht | Pfad | Aufgabe |
|---|---|---|
| Shared | `src/shared/` | Konfiguration, Drahtformat (`protocol.js`), Validierung, Terrain-/Waffen-Generatoren. **Keine Node-Builtins** (Wächter: `tests/source-boundaries.test.js`) |
| Engine | `src/engine/` | Deterministische Simulation: ECS (`ecs/`), `MatchController` (match.js), Systeme (Physik, Projektile, Schaden), Replay. Kein `Math.random`/`Date.now` im Simulationspfad |
| Server | `src/server/` | Autoritativer Spielserver: `GameServer` (HTTP + WebSocket `/ws`), `LobbyManager`, `LobbySession`, dateibasierte Persistenz (`.pa-state/lobbies.json`) |
| Client | `src/client/` | Renderer (Canvas 2D), Eingabe, `NetworkClient` (binäre Snapshots), Ereignis-Wirkungen (`ereignisse.js`) |

## Data flow

1. Client → Server: JSON-Steuernachrichten (`CONTROL.*`, versioniert).
2. Server validiert jede Nachricht (Token statt `playerId`, Zugfenster, 512-Byte-Nutzlast, Rate-Limit) und führt sie im `MatchController` aus.
3. Server → Client: binäre Snapshots (Protokoll v9, Delta-Encoding) mit 20 Hz; Terrain-Abgleich über `terrain_hash`/`terrain_state`.
4. Persistenz: Replay-Kern (Seed, Konfiguration, Sitzplätze, Eingabeliste) wird atomar gesichert; Wiederherstellung rekonstruiert das Match deterministisch und prüft den Zustandshash.

## Key invariants
- **Determinismus:** gleicher Seed + gleiche Eingaben = gleicher Zustandshash. Replays sind Beweismittel.
- **Eine Regel, eine Stelle:** z. B. `combatProfile()`, `launchSpeedMultiplier`, `NETWORK_RULES`.
- **Keine Bot-KI:** freie Teams bleiben leer; das Match startet erst, wenn alle Teams Menschen haben.
- **Kein stiller Fehler:** Ablehnungen werden gemeldet oder geloggt; verworfene Snapshots werden gezählt und gemeldet.
