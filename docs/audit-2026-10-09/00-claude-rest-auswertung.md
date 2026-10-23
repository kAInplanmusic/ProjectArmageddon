# Claude-Reste — Auswertung des abgebrochenen Laufs vom 2026-10-09

**Zweck:** Forensische Auswertung der Überbleibsel des Claude-Code-Laufs, der um
19:39:54 Ortszeit vom System abgebrochen wurde. Diese Datei stellt sicher, dass die
bereits geleistete Arbeit nicht verloren geht.

**Herkunft der Daten:** lokale Sitzungsprotokolle unter
`~/.claude/projects/-home-patrick-AnunnakiTools-Projekte-laufende-Projekte-ProjectArmageddon/`

**Wichtige Einordnung:** Die Funde unten sind **nicht von mir geprüft**. Sie stammen von
Subagenten des abgebrochenen Laufs und sind hier nur geborgen, nicht verifiziert. Jeder
Befund ist mit `datei:zeile` belegt und muss vor einer Umsetzung nachgeprüft werden.

---

## 1. Vorgehen des abgebrochenen Laufs

| Punkt | Wert |
|---|---|
| Client | Claude Code CLI v2.1.295, Modus `-p` (nicht-interaktiv) |
| Modell | `claude-opus-5-5` |
| Sitzung | `ba3d9e25-c29c-4a34-9f08-084876e33f47`, 17:33:30–17:39:54 UTC |
| Umfang | 79 Assistant-Aufrufe, 60.224 Output-Tokens |
| Erlaubte Werkzeuge | `Read, Grep, Glob, Bash, Write` |
| Arbeitsteilung | 3 eigene Subagenten (Parallelisierung durch den Agenten selbst) |
| Subagent 1 | „Audit client render loop perf" — 40 Assistant-Nachrichten |
| Subagent 2 | „Audit server netcode paths" — 38 Assistant-Nachrichten |
| Subagent 3 | „Audit engine physics terrain" — 57 Assistant-Nachrichten |
| Ergebnis | **kein Bericht geschrieben** — Abbruch vor der Zusammenführung |

Verzeichnis mit allen Protokollen (1,08 MB Hauptlauf + 3 × ~0,7 MB Subagenten):
`~/.claude/projects/-home-patrick-AnunnakiTools-Projekte-laufende-Projekte-ProjectArmageddon/ba3d9e25-c29c-4a34-9f08-084876e33f47/`

Der Engine-Subagent lief bis zuletzt und hat messbaren Aufwand betrieben: unter anderem
ein ausführbares Node-Experiment zur Fallphysik (`CharacterSystem.update()` gegen eine
synthetische Kollisionsmaske, 20 Schritte). Sein Bericht ging verloren, weil seine
Denkblöcke verschlüsselt abgelegt sind und der Textblock nie geschrieben wurde.

---

## 2. Geborgene Ergebnisse — Client (Frame-Loop, Rendering, Performance)

Quelle: Subagent `agent-a50666e44a778d8ef`. Der Subagent gibt ausdrücklich an, **nichts
gemessen, sondern nur gelesen** zu haben.

### 2.1 Simulationsschritt ist bildratenunabhängig, die Darstellung nicht

- Fester Zeitschritt: `FIXED_TIMESTEP = 1000/60` (`src/shared/zeit.js:11`), in der
  Schleife begrenzt auf `MAX_STEPS_PER_FRAME = 8` (`src/client/main.js:80`).
- Nachholschleife: `src/client/main.js:2300-2302`.
- **Aber:** fast alle visuellen Effekte altern **pro gezeichnetem Frame**, nicht pro
  Simulationsschritt — `src/client/renderer.js:1576` (`this.time += 1;`),
  Partikel/Effekte `src/client/renderer.js:1725-1726`,
  `PARTIKEL_ABNAHME = 0.035` (`src/client/effects.js:41`, `:150`),
  Kamera-Nachführung `src/client/camera.js:184`.
  → Auf einem 144-Hz-Display laufen diese Effekte rund **2,4× zu schnell**.

### 2.2 Wasser wird nur in jedem vierten Frame gezeichnet (vermuteter Fehler)

- `src/client/main.js:2360`: `this.waterFrame = (this.waterFrame + 1) % 4;`
- `src/client/main.js:2402`: `water: ... (this.waterFrame === 0 ? this.match.water : null)`
- `#drawWater` steigt bei `null` aus (`src/client/renderer.js:814`), während der Himmel
  jeden Frame das ganze Canvas löscht (`src/client/renderer.js:786`).

→ Erwartung: sichtbares Flackern des Wassers. **Vom Subagenten als unsicher markiert**,
weil nicht im Browser beobachtet.

### 2.3 Accumulator kann unbegrenzt wachsen

- Bei Frames von 140–250 ms wird mehr Zeit eingetragen, als 8 Schritte (8 × 16,7 ms)
  abbauen können. Der Rest wird **nie verworfen**.
- Nur bei Tab-Inaktivität gibt es einen Schutz: `if (delta > 250) delta = FIXED_TIMESTEP;`
  (`src/client/main.js:2295`).
- Zurückgesetzt wird der Accumulator nur an `src/client/main.js:2165` und `:2502`.

### 2.4 Allokationen pro Frame (Auswahl, nach Schwere)

| Stelle | Was pro Frame neu entsteht |
|---|---|
| `src/client/renderer.js:816` | `createImageData` für die **ganze Wasser-Ebene**, jedes Mal wenn sie gezeichnet wird |
| `src/client/renderer.js:806` | neue Farb-Array je Wasserzelle |
| `src/client/renderer.js:773, 782`, `sceneryPainter.js:53, 71, 85` | neue Gradients für Himmel, Sonne, Mond |
| `src/client/renderer.js:1088` | Gradient je Projektil |
| `src/client/renderer.js:1486` | Gradient je Rauchwolke |
| `src/client/renderer.js:412` | Gradient je Blitz, plus String-Konkatenation |
| `src/client/renderer.js:1536, 1542` | Mahlstrom-Gradients |
| `sceneryPainter.js:145` | Aurora, 3 pro Element |
| `src/client/effects.js:112, 150`, `gefuehl.js:444` | Copy-on-Write-Objekte je Partikel/Effekt/Rauch |
| `src/client/renderer.js:375`, `gefuehl.js:102` | neues `Map` je Frame |
| `sceneryPainter.js:322` | `new Set([...])` zweimal pro Frame |
| `sceneryPainter.js:115` | **Regex (`parseCss`) pro Umgebungselement pro Frame** |
| `src/client/main.js:1273` | `currentState()` spreadet den ganzen Zustand je Frame |
| `src/client/renderer.js:1575`, `dom.js:60` | `matchMedia`-Abfrage je Frame |
| `renderer.js:969, 1017, 1340`, `main.js:2372, 2388`, `hud.js:262, 424` | `.find` je Entität je Frame |

**Kein `shadowBlur`, kein `ctx.filter`** in den geprüften Dateien — das ist positiv.

### 2.5 Weitere Beobachtungen

- Partikel (26/Explosion) und Rauch (6/Explosion) sind **nur pro Explosion** begrenzt;
  es gibt **keinen globalen Deckel und kein Pooling**.
- HUD schreibt jeden Frame `textContent` und `style.color` in ~7 Felder ohne
  Vorher-Vergleich (`src/client/hud.js:241-291`). Signatur-Strings werden jeden Frame
  neu gebaut (`hud.js:318-320, 428-432`).
- **Kein Layout-Thrashing:** keine `getBoundingClientRect`/`offsetWidth` gefunden.
- Kulissen: **80** JPGs (11 MB), nicht 60 — nur die aktuelle wird geladen
  (`src/client/renderer.js:295-307`).
- `TerrainSync` (`src/engine/terrain/terrainSync.js:43-53`) hat **keinen Aufrufer** in
  `src/client` → vermutlich tote Datei.
- `this.waterStates` (`src/client/main.js:1763`) — Aufräumstelle nicht gefunden (offen).

---

## 3. Geborgene Ergebnisse — Server / Netcode

Quelle: Subagent `agent-aebf7b46df84846de`. Auch dieser gibt an, **nichts ausgeführt,
sondern nur gelesen** zu haben.

### 3.1 Beweisbare Fehler (nach Einschätzung des Subagenten zuerst zu beheben)

1. **Kein `error`-Listener auf Client-Sockets.**
   Nur `wsServer.on('error')` existiert (`src/server/gameServer.js:1124`). `ws` 8.21.3
   emittiert bei Protokollfehlern (ungültiges UTF-8, falscher Opcode) ein `error`-Ereignis
   auf dem Socket (`node_modules/ws/lib/websocket.js:1218`). Ohne Listener wirft Node →
   **Hypothese des Subagenten: ein einziges fehlerhaftes Frame beendet den Prozess.**
   Nicht gemessen.

2. **`DROP_WEAPON` ohne Zug-Prüfung.**
   `dropWeapon` prüft nur `status` und `isPlayerAlive` (`src/engine/match.js:2019-2023`),
   dann läuft `#rollDropThrow()` → `this.#rng.nextBoolean()` (`:2105`).
   → Ein Spieler, der **nicht am Zug ist**, kann Kisten werfen und dabei den
   **gemeinsamen Zufallsstrom verbrauchen**. Hypothese: gezielte Beeinflussung späterer
   Zufallsergebnisse.

3. **Befehle werden im pausierten Zustand angenommen.**
   `#handleInput` prüft `session.laeuft` nie; `match.start()` läuft bereits im
   Konstruktor (`src/server/gameServer.js:135`). Ein Spieler in einer Wartelobby oder
   nach `session.stop()` kann feuern oder springen; das Geschoss bleibt dann stehen.

4. **Persistenz verliert `teamId`/`figureIndex`.**
   `serializeLobby` speichert nur `seatIndex, name, token, entityId`
   (`src/server/persistence.js:150-156`), `restoreLobby` baut Sitze ohne `teamId` auf
   (`:246-253`). Folgen (abgeleitet, nicht gemessen):
   - `alleTeamsBesetzt` bildet eine Menge aus `undefined` → wird nie wahr →
     **ein wiederhergestelltes Match startet nie**.
   - `#assignEntityIds` fällt auf `seat.figureIndex ?? index` zurück (`:298`) →
     bei mehr als einer Figur pro Team werden Spieler **falschen Figuren** zugeordnet.
   - Zusätzlich gehen `kartentyp`, Sidegrades und Loadouts verloren (`:123, :131-133`).

5. **Lobby bleibt `open` → fremder Übernehmer.**
   Der Auto-Start bei JOIN ruft `session.start()`, aber nie `markRunning`
   (`src/server/gameServer.js:1805-1806`). Der Client sendet nie `START_MATCH`.
   Nach einem Prune kann ein Fremder beitreten und bekommt denselben `figureIndex`
   (`src/server/lobby.js:385`) — also **die Figuren des ausgeschiedenen Spielers** in
   einem laufenden Match.

### 3.2 Weitere Befunde

- **Das „Delta"-Snippet spart nichts:** alle Felder werden immer geschrieben
  (`src/server/protocol.js:391-403`), nur das `dirty`-Byte ändert sich. Gleiche Größe
  wie ein Vollsnapshot.
- **Einheitenfehler bei der Latenzkompensation:**
  `maxTickDrift: NETWORK_RULES.lagCompensationBufferMs * 2` (`src/shared/validation.js:18`)
  sind 400 **Millisekunden**, die als 400 **Ticks** (~6,7 s, in der Zukunft) verwendet
  werden. Wird `tick` weggelassen, entfällt die Prüfung ganz (`:641`).
- **`SnapshotHistory` speichert nur Tick-Nummern** (`:420`), der einzige Aufrufer füllt
  bloß `interpolatedFrom` (`:634, :675`). `fire` ignoriert den Tick komplett
  (`src/engine/shooting.js:90`) → für ein rundenbasiertes Spiel wirkungslos.
- **Kein `maxPayload` am `WebSocketServer`** (`src/server/gameServer.js:1106`) → Standard
  **100 MiB** werden gepuffert, bevor die 512-Byte-Prüfung greift. Keine Origin-Prüfung,
  CORS spiegelt jeden Origin (`:1374`).
- **`POST /api/lobby/create` ohne Rate-Limit und ohne Auth**, Lobbys werden nie gelöscht
  (`close` nur in `persistence.js:217`). Gestoppte Sessions bleiben in `#sessions`
  (`:1978`). → unbegrenztes Wachstum.
- **Kein try/catch in `tick()`** (`src/server/gameServer.js:315, 338-342`): Eine Ausnahme
  in `match.step()` entkommt dem Timer-Callback. `scripts/server.mjs` behandelt nur
  `SIGINT`/`SIGTERM` → Hypothese: **Prozessabsturz**.
- **Tick-Schleife verliert Zeit nach Stillstand:** `Math.min(250, now - this.lastTickAt)`
  (`:338`), höchstens 15 Nachholschritte (`:342`). Kein Drift, aber Nachholverlust.
- **Zug-Timer rechnet in Ticks, nicht in Wanduhrzeit:** `#turnElapsed += dt` mit
  `dt = 1000/60` (`src/engine/match.js:980-983`), Ende bei `:1036`.
- **`validation.js:75`:** `!…includes('angle') === false` liefert nur zufällig das
  richtige Ergebnis. Nimmt man `'angle'` aus der Konfiguration, **schaltet sich die
  Winkelprüfung stillschweigend ab**.
- **Tokens im Klartext:** `src/server/persistence.js:153` schreibt Tokens unverschlüsselt
  nach `.pa-state/lobbies.json`.
- **Host-Sitzplatz über HTTP** ist `connected: true` **ohne Socket**
  (`src/server/lobby.js:392`); der Kommentar `:1336-1340` räumt das als offen ein.
- **`previousByToken` wird auch für nicht-offene Sockets aktualisiert**
  (`:944` gegen `:955`) → nach Reconnect kann ein unverändertes Feld bis zum nächsten
  Vollsnapshot (max. ~2 s) veralten. Als unsicher markiert.

### 3.3 Was der Subagent als **in Ordnung** befand

- Identität kommt **immer aus dem Token** (`#platzFuer`, `:604-608`) — keine
  Client-Autorität über Spieler-IDs.
- **Feuern wird doppelt geprüft**: in `validateCommand` über `activePlayerId`
  (`src/shared/validation.js:115`) und erneut in `src/engine/shooting.js:89-98`;
  ein zweiter Schuss im selben Zug wird blockiert (`:144`).
- Der Schuss wird **nur serverseitig simuliert**; `shotPrediction.js` zeichnet bloß den Bogen.
- **Kein Race bei Zugwechseln:** Node ist single-threaded, `endTurn` tauscht
  `activePlayerId`; ein verspäteter Schuss wird abgelehnt.
- **Terrain-Selbstheilung funktioniert:** `TERRAIN_HASH` in jedem Vollsnapshot (`:940`),
  Client vergleicht (`src/client/main.js:1205-1215`) und fordert bei Abweichung die
  Kraterliste an (`:1910`) → Kraterverlust heilt in ~2–4 s.
- Ratenbegrenzung vorhanden: 30 Nachrichten/s, Burst 60, Trennung nach 600 Ablehnungen
  (`src/server/rateLimit.js:15-19`), Nutzlastgrenze 512 Byte (`validation.js:36`),
  JSON-Parsing und Message-Switch in try/catch (`protocol.js:1098-1105, 1670, 1947`).

---

## 4. Verlorene Ergebnisse

Der dritte Subagent (**Engine: Physik & Terrain**) hat bis zum Abbruch gearbeitet —
57 Assistant-Nachrichten, 39 Werkzeugaufrufe, darunter ein ausgeführtes Node-Experiment
zur Fallphysik — aber **keinen Bericht geschrieben**. Seine Denkblöcke sind verschlüsselt
gespeichert, sein Textblock existiert nicht.

Aus seinen Werkzeugaufrufen lässt sich rekonstruieren, **was** er untersucht hat:

- `src/engine/physics/ballistics*` (Zeilenumfang geprüft)
- `src/engine/shooting.js` (`fire`-Export, Zeilen 85–160)
- `src/engine/match.js` (Zeilen 980–1060: Zug-Timer)
- `src/engine/systems/characterSystem.js` + `terrain/collisionMask.js`
  (ausgeführtes Fall-Experiment über 20 Schritte)
- `src/shared/prng.js` (Exporte, `JSON.parse`, Zeilen 313–390 und 897–930)
- `src/shared/config/network.js` (Latenzkompensation)
- `src/server/persistence.js` (Zeilen 21–70, 140–205)

Diese Spur ist **nicht verloren, nur unbearbeitet** — sie ist der Startpunkt für den
Engine-Teil des neuen Audits.

---

## 5. Geheimnis-Prüfung der Reste

Ergebnis: **keine offenen Zugangsdaten gefunden.**

| Prüfung | Ergebnis |
|---|---|
| `grep` nach `sk-ant-`, `sk-or-v1-`, `ghp_`, `AKIA` über `~/.claude` | kein Treffer |
| Derselbe Scan über das Projekt (ohne `node_modules`, `.git`) | kein Treffer |
| Bekannte Keys (Claude-Key, OpenRouter-Key) als Volltext in `~/.claude` | nicht vorhanden |
| `~/.claude/sessions/*.key` | enthält nur ein lokales IPC-`peerToken`, **keinen API-Key** |
| `~/.claude/backups/*.json` | keine Felder `apiKey`/`apiKey`/`oauth*`/`secret` |
| Rechte der sensiblen Dateien | alle `600`, Verzeichnisse `700` |

**Bemerkenswert:** Der vom abgebrochenen Lauf erzeugte `.pa-state/lobbies.json` enthält
laut Subagenten-Befund **Spieler-Tokens im Klartext** (`persistence.js:153`). Das ist ein
Befund über den Projektcode, kein Leck durch Claude Code.

---

## 6. Offene Punkte aus dieser Auswertung

- [ ] Engine-/Physik-Teil neu auditieren (Spur aus Abschnitt 4)
- [ ] Wasser-Flackern im Browser bestätigen oder widerlegen (`main.js:2360/2402`)
- [ ] Effekt-Alterung pro Frame auf 144 Hz bestätigen
- [ ] `error`-Listener-Hypothese praktisch prüfen (fehlerhaftes WS-Frame senden)
- [ ] Persistenz-Roundtrip prüfen: `serializeLobby` → `restoreLobby` auf `teamId`
