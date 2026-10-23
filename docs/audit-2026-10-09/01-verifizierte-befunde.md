# Verifizierte Befunde — ProjectArmageddon

**Stand:** 2026-10-09 · **Commit:** `14204e7` · **Branch:** `main`
**Arbeitskopie:** sauber (nur untracked Dateien)

**Methode:** Jeder Befund in dieser Datei wurde **von mir selbst geprüft** — entweder am
Code gelesen (mit Fundstelle) oder durch einen ausgeführten Test belegt. Behauptungen
Dritter (auch die der Claude-Subagenten in `00-claude-rest-auswertung.md`) gelten hier
nichts, solange sie nicht nachgeprüft sind.

**Legende Schwere:** **A** = Spielspaß/Flow kaputt oder stiller Fehler ·
**B** = stört · **C** = Ordnung/Vorsorge

---

## A-1 · Fern-Abschuss des Servers mit 4 Bytes (PROVEN)

**Schwere: A — schwerwiegendster Befund dieses Audits**

### Beobachtung

Der WebSocket-Server registriert auf eingehenden Verbindungen nur zwei Listener —
`message` und `close`:

| Stelle | Inhalt |
|---|---|
| `src/server/gameServer.js:1130` | `this.#wsServer.on('connection', socket => {` |
| `src/server/gameServer.js:1589` | `socket.on('message', (raw, isBinary) => {` |
| `src/server/gameServer.js:1966` | `socket.on('close', () => {` |
| `src/server/gameServer.js:1124` | `this.#wsServer.on('error', …)` — **nur am Server, nicht am Socket** |

Ein **`socket.on('error', …)` fehlt vollständig.** In Node wirft ein `error`-Ereignis
ohne registrierten Listener eine unbehandelte Ausnahme. Die Bibliothek `ws` (8.21.3)
emittiert genau dieses Ereignis bei Protokollfehlern:
`node_modules/ws/lib/websocket.js:1218` (`receiverOnError`).

### Beweis (ausgeführt, nicht behauptet)

Ablauf: Server auf Port 3112 gestartet, eine WebSocket-Verbindung geöffnet,
**vier Bytes ungültiges UTF-8** in einem Text-Frame gesendet.

```
Server gestartet, PID 988329 | noch am Leben: true
WebSocket verbunden.
Ungueltiges UTF-8 gesendet.
--- ERGEBNIS ---
Server-Prozess noch am Leben: false
Server BEENDET mit {"code":1,"sig":null}
Fehlerzeilen im Serverlog:
      throw er; // Unhandled 'error' event
Error: Invalid WebSocket frame: invalid UTF-8 sequence
Emitted 'error' event on WebSocket instance at:
    at Receiver.receiverOnError (.../node_modules/ws/lib/websocket.js:1218:15)
```

### Wirkung

Ein einziger Angreifer — oder ein fehlerhafter Client, ein Proxy, ein Paketverlust mit
Bitfehler — beendet den **kompletten Spielserver**. Alle laufenden Matches sterben,
alle verbundenen Spieler fliegen raus. Aufwand: **4 Bytes**. Keine Anmeldung nötig,
die Verbindung darf anonym sein.

### Behebung (Vorschlag, nicht umgesetzt)

```js
// src/server/gameServer.js, im connection-Block (ab :1130)
socket.on('error', fehler => {
  this.#log?.warn?.({ event: 'socket_error', fehler: fehler?.message });
  socket.terminate();          // kaputte Verbindung kontrolliert schließen
});
```

Ergänzend sinnvoll, weil im selben Zusammenhang:
- `maxPayload` setzen: `new WebSocketServer({ server, path: '/ws', maxPayload: 4096 })`
  (`src/server/gameServer.js:1106`) — derzeit gilt der `ws`-Standard von **100 MiB**, der
  gepuffert wird, **bevor** die 512-Byte-Prüfung aus `validation.js:36` greift.
- Prüfen, ob der Prozess zusätzlich ein `process.on('uncaughtException')` braucht
  (`scripts/server.mjs` behandelt nur `SIGINT`/`SIGTERM`). Ein Netz-Defekt darf keinen
  Absturz verursachen — aber der Listener oben ist die eigentliche Reparatur.

---

## A-2 · `DROP_WEAPON` ohne Zug-Prüfung, verbraucht den Zufallsstrom (CONFIRMED)

**Schwere: A** (Determinismus) — **Beleg:** `src/engine/match.js:2019-2023`

```js
dropWeapon(playerId, weaponId) {
  const errors = [];
  if (this.#status !== 'playing') errors.push('Match läuft nicht');
  if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
  if (errors.length > 0) return { ok: false, errors };
```

Es fehlt **jede** Prüfung auf `activePlayerId`. Anschließend läuft
`#rollDropThrow()` → `this.#rng.nextBoolean()` (`:2105`).

**Wirkung:** Ein Spieler, der **nicht am Zug ist**, kann beliebig Kisten werfen und
dabei den **gemeinsamen Zufallsstrom** konsumieren. In einem Spiel, dessen
Reproduzierbarkeit auf einem geseedeten Generator beruht, verschiebt das alle späteren
Zufallsergebnisse — und zwar nur auf dem Server, während ein Replay aus den Eingaben
andere Werte zieht. Das ist ein Determinismus-Bruch, kein Komfortproblem.
**Hypothese (nicht bewiesen):** damit lassen sich Loot-Ergebnisse gezielt beeinflussen.

---

## A-3 · Persistenz verliert `teamId` und `figureIndex` (CONFIRMED)

**Schwere: A** — **Beleg:** `src/server/persistence.js:150-156`

```js
seats: lobby.seats.map(seat => ({
  seatIndex: seat.seatIndex,
  name: seat.name,
  token: seat.token,
  entityId: seat.entityId,
  connected: false,
}));
```

Gespeichert werden fünf Felder. **`teamId` und `figureIndex` fehlen.**

### Beweis (ausgeführter Roundtrip, nicht behauptet)

`serializeLobby` → `restoreLobby` mit einer Attrappen-Lobbyverwaltung, ein Sitz mit
`teamId: 1, figureIndex: 3`:

```
gespeicherter Sitz:        {"seatIndex":0,"name":"Spieler A","token":"tok-abc","entityId":7,"connected":false}
wiederhergestellter Sitz:  {"seatIndex":0,"name":"Spieler A","token":"tok-abc","connected":false,
                            "disconnectedAt":1791585678205,"entityId":7}

--- VERGLEICH ---
ok        seatIndex:    vorher=0          nachher=0
ok        name:         vorher="Spieler A" nachher="Spieler A"
ok        token:        vorher="tok-abc"  nachher="tok-abc"
ok        entityId:     vorher=7          nachher=7
VERLOREN  teamId:       vorher=1          nachher=undefined
VERLOREN  figureIndex:  vorher=3          nachher=undefined

belegteTeams = [null] -> enthaelt echte Team-Nummern? false
```

Damit sind **beide** Verluste praktisch nachgewiesen, nicht nur gelesen.

### Folgen (aus dem Code abgeleitet)

- `alleTeamsBesetzt` — genauer: die Teamvergabe in `src/server/lobby.js:371` — bildet
  `new Set(lobby.seats.map(seat => seat.teamId))`. Nach der Wiederherstellung enthält
  diese Menge **keine echte Team-Nummer** (gemessen: `[null]`). Die Schleife `:372-377`
  sucht das erste freie Team und findet immer Team 0 — die wiederhergestellten Sitze
  bleiben ohne Team, und die Zuordnung „Sitz → Figur" ist zerrissen.
- `#assignEntityIds` fällt auf `seat.figureIndex ?? index` zurück (`:298`) → bei mehr
  als einer Figur pro Team werden Spieler **falschen Figuren** zugeordnet.

**Was ich weiterhin nicht geprüft habe:** ob ein wiederhergestelltes Match im
laufenden Spiel tatsächlich nicht mehr startet. Dafür fehlt ein
Reconnect-Test über einen echten Serverneustart mit zwei Spielern.

**Auffällig im selben Block:** `connected: false` wird hart gesetzt. Dazu passt der
offene Punkt aus `src/server/lobby.js:392`, wonach ein über HTTP erzeugter Host-Sitz
`connected: true` **ohne Socket** ist.

---

## B-1 · Doppelte Verneinung schaltet die Winkelprüfung ab (CONFIRMED)

**Schwere: B** — **Beleg:** `src/shared/validation.js:75`

```js
if (!NETWORK_RULES.clientValidatedInputs.includes('angle') === false && !isValidAngle(angle)) {
```

Ausgewertet: `(!includes('angle')) === false` — also **`includes('angle') === true`**.
Das ist **genau verkehrt herum**: Die Prüfung läuft nur, wenn `'angle'` als
*client-validiert* markiert ist, und sie **entfällt**, wenn der Client die Prüfung
gerade *nicht* übernimmt.

Sie liefert heute das richtige Ergebnis, weil `'angle'` in der Konfiguration steht.
Nimmt jemand es heraus — oder wird die Liste umbenannt —, **schaltet sich die
Winkelvalidierung stillschweigend ab**, ohne dass etwas rot wird. Eine stille
Sicherheitslücke, die auf einer Zeichensetzung beruht.

Richtig wäre:
```js
if (!NETWORK_RULES.clientValidatedInputs.includes('angle') && !isValidAngle(angle)) {
```

---

## B-2 · Wasser wird nur in jedem vierten Frame gezeichnet (CONFIRMED, Code)

**Schwere: B** — **Belege:** `src/client/main.js:2360` und `:2402`

```js
this.waterFrame = (this.waterFrame + 1) % 4;          // :2360
...
water: this.mode === 'online' ? null : (this.waterFrame === 0 ? this.match.water : null),   // :2402
```

Der Bildschirm wird jeden Frame vollständig geleert, und `#drawWater` steigt bei `null`
aus (`src/client/renderer.js:814`). Damit wird Wasser in drei von vier Bildern
**nicht gezeichnet**.

**Was ich belege:** den Code-Pfad. **Was ich nicht belege:** dass man es sieht — dafür
müsste ich es im Browser beobachten. Das ist als Sichtgrenze notiert und ein
Playwright-Lauf wäre der nächste Schritt.

---

## B-3 · Alle visuellen Effekte altern pro Bild statt pro Simulationsschritt (CONFIRMED, Code)

**Schwere: B** — **Belege:** `FIXED_TIMESTEP = 1000/60` in `src/shared/zeit.js:11`,
Nachholschleife `src/client/main.js:2300-2302`, dagegen:
`src/client/renderer.js:1576` (`this.time += 1`), Partikelalterung
`src/client/renderer.js:1725-1726`, `PARTIKEL_ABNAHME = 0.035`
(`src/client/effects.js:41`), Kamera `src/client/camera.js:184`.

Die **Simulation** ist bildratenunabhängig (fester Zeitschritt). Die **Darstellung**
nicht: Effekte, Rauch, Partikel, Einschlagmarken und Bildschirmwackeln altern pro
gezeichnetem Frame. Auf einem 144-Hz-Monitor laufen sie damit rechnerisch **2,4×
schneller** als auf 60 Hz. Wieder gilt: Pfad belegt, Sichtbarkeit nicht gemessen.

---

## C-1 · Weitere bestätigte Beobachtungen

| # | Befund | Beleg | Schwere |
|---|---|---|---|
| C-1a | `maxPayload` nicht gesetzt → `ws`-Standard **100 MiB** wird gepuffert, bevor die 512-Byte-Prüfung greift | `src/server/gameServer.js:1106` | B |
| C-1b | Spieler-Tokens liegen im **Klartext** in `.pa-state/lobbies.json` | `src/server/persistence.js:153` | C |
| C-1c | `TerrainSync` hat keinen Aufrufer in `src/client` → tote Datei (Code gelesen, Importeure noch nicht vollständig geprüft) | `src/engine/terrain/terrainSync.js:43-53` | C |
| C-1d | Kulissen-Ordner enthält **80** Bilder, nicht 60 (Doku weicht ab) | `src/client/assets/backdrop/` | C |

---

## Was ich in diesem Durchgang NICHT geprüft habe (Sichtgrenzen)

- **Keine Browser-Messung.** Wasser-Flackern und die Effekt-Alterung auf 144 Hz sind
  aus dem Code abgeleitet, nicht gesehen. Ein Playwright-Lauf fehlt.
- **Kein Neustart-Test der Persistenz.** Der `teamId`-Verlust ist im Code belegt, seine
  Folgen für ein wiederhergestelltes Match sind abgeleitet.
- **Keine Lastprobe.** Tick-Kosten, Speicherwachstum über viele Runden und Verhalten bei
  50/150/300 ms Latenz sind nicht gemessen.
- **Kein Multi-Browser-Vergleich.**
- **Nur `main` existiert** — es gibt keine anderen Branches zu vergleichen.
