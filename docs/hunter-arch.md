# Hunter #4 — Architektur, Struktur, Importe, Pipelines, Routing

**Rolle:** Hunter-Agent #4 (Architektur / Struktur / Importe / Pipelines / Routing).
**Repo:** `ProjectArmageddon`, Branch `main`, HEAD `4c42470`.
**Auftrag:** Architektur dokumentieren, Event-Fluss belegen, `getState()`-Aufrufe
zählen, Replay-Aufzeichnung verorten, Protokoll v7 erklären — jede Aussage mit
`datei:zeile`.

**Methode:** Rein lesend. Gelesen wurden `src/engine/match.js` (3163 Z.), 
`src/server/gameServer.js` (1342 Z.), `src/shared/protocol.js` (597 Z.),
`src/engine/replay.js` (447 Z.), `src/engine/stateSnapshot.js` (297 Z.),
`src/engine/events.js` (91 Z.), `src/engine/init.js`, `src/engine/systems/*.js`.
Zählungen mit `grep -rn … | wc -l`. **Keine** Produktivdatei geändert; nur dieses
Dokument neu angelegt.

---

## 1. Schichten und der eine Motor

**Der Kern ist EIN Modul, das beide Betriebsarten fahren.** `MatchController`
(`src/engine/match.js:417`) verbindet Terrain, Wasser, ECS-Systeme und Zuglogik
zu einem deterministischen Match (Kopf-Kommentar `match.js:1–9`). Der Client baut
ihn lokal (`src/client/main.js:744`), der Server baut ihn je Lobby
(`gameServer.js:85`). Der Unterschied ist nur, **wer `step()` aufruft** und ob
gerendert wird — der Motor ist identisch.

Schichten (Importrichtung, alle Pfeile gehen nach unten):

| Schicht | Verzeichnis | Rolle |
|---|---|---|
| Shared | `src/shared/**` | Konfiguration, Ballistik, Terrain-Generatoren, Protokoll, Validierung, Seed. Keine Aufwärts-Importe. |
| ECS-Kern | `src/engine/ecs/**` | `World`, `componentStore`, Signaturen. |
| Systeme | `src/engine/systems/*.js` | Physik, Charakter, Projektile, Loot, Maelstrom, Günther, Turm, Schaden. |
| Motor | `src/engine/match.js`, `stateSnapshot.js`, `shooting.js`, `replay.js`, `events.js` | Orchestrierung, Zustandsaufbau, Schuss, Replay, EventBus. |
| Server | `src/server/**` | HTTP + WebSocket, Lobby-Verwaltung, Persistenz, Snapshot-Versand. |
| Client | `src/client/**` | Eingabe, Rendering, Netzwerk-Wrapper, Ereignis-Anzeige. |

**Importeigenschaften von `match.js`** (`match.js:10–55`), 46 Importzeilen aus 34
Modulen — vollständig relativ, kein Bare-Specifier, kein zirkulärer Import:

- **ECS/Infrastruktur:** `init.js` (`createGameWorld`, `SYSTEM_PRIORITIES`),
  `ecs/componentStore.js`, `terrain/collisionMask.js`, `events.js` (EventBus),
  `waterField.js`, `inventory.js`, `specials.js`, `damageTypes.js`.
- **Systeme:** `systems/projectileSystem.js` (Klasse + zwei Konstanten),
  `systems/characterSystem.js`, `systems/maelstromSystem.js`,
  `systems/lootSystem.js` (+ `CRATE_TYPES`, `RARITY_IDS`, `PICKUP_RADIUS`),
  `systems/guentherSystem.js`.
- **Shared-Config:** `config/terrain.js`, `config/match.js`, `config/classes.js`,
  `config/weapons.js`, `config/player.js`, `config/loadouts.js`,
  `config/scenery.js`, `config/water.js`, `config/guenther.js`.
- **Shared-Logik:** `terrainGen.js`, `terrainGen2.js`, `terrainGen3.js`,
  `erreichbarkeit.js`, `reichweite.js`, `seed.js`, `biomwahl.js`,
  `ballistics.js`, `launchSpeed.js`.
- **Eigene Nachbarn:** `stateSnapshot.js` (`baueAnsichtszustand`, `hashState`),
  `shooting.js` (`fire`, `projectileLifetime`, `aimPreview`, `hasLineOfSight`,
  `launchOrigin`).

**Exporteigenschaften** (`match.js`): `export class MatchController` (`:417`),
`export default MatchController` (`:3163`), plus Konstanten/Funktionen für
Werkzeuge und Tests — `MAP_SIZES` (`:105`), `MAP_GROESSEN` (`:123`),
`mapGroesseFuerSpieler` (`:126`), `ORIENTATIONS` (`:134`), `MAP_WIDTH/HEIGHT`
(`:142/143`), `mapSizeFor` (`:152`), `WATER_SCALE` (`:156`), Re-Export
`CLASS_IDS`/`ARCHETYPE_IDS` (`:161`), `TEAM_COLORS` (`:183`), `BASE_HEALTH`
(`:203`), Re-Export `POWER_TO_SPEED` (`:218`), `reichweiteFuer` (`:239`),
`HOHECHSTE_KRAFT = 100` (`:252`).

> **DESIGN-ENTSCHEIDUNG — ein Motor, zwei Fahrer.** Es gibt keine zweite
> Simulationsfassung für den Server. Damit kann ein Online-Match nicht anders
> rechnen als ein lokales; Determinismus ist an EINER Stelle zu belegen
> (`stateHash()` → `npm run replay --verify`). Der Preis: Jede Motoränderung
> wirkt sofort in beiden Betriebsarten.

---

## 2. `getState()` — wer baut den Zustand, wer liest ihn

### 2.1 Was `getState()` ist

`MatchController.getState()` (`match.js:2978`) delegiert vollständig:

```js
getState() { return baueAnsichtszustand(this.#zustandsQuelle()); }   // match.js:2978-2980
```

`#zustandsQuelle()` (`match.js:3021`) sammelt die 24 Eingabewerte als explizite
Kopplungsliste; `baueAnsichtszustand()` (`stateSnapshot.js:63`) ist eine REINE
Funktion und baut den Ansichtszustand — dieselbe Struktur geht an Client,
Server und `hashState()`. Der Hash `stateHash()` (`match.js:3124`) ruft
`hashState(this.getState())`.

> **DESIGN-ENTSCHEIDUNG — Zustandsaufbau als reine Funktion (Zerlegung Schritt
> 4a, 2026-09-26).** Vorher stand der 149-Zeilen-Rumpf in der Klasse und griff
> 39-mal in private Felder (`stateSnapshot.js:23–27`, `match.js:2968–2972`).
> Jetzt: Klasse = Kopplung an EINER Stelle, Aufbau = prüfbar gegen feste
> Eingaben. **Falle, festgehalten:** Feldnamen UND -reihenfolge sind Vertrag —
> `hashState()` hashed die Reihenfolge mit (`stateSnapshot.js:44–53`).

### 2.2 Aufruforte von `getState()`

**Produktiv in `src/` — 13 echte Aufrufe** (Definitions-/Kommentarzeilen nicht
gezählt; `grep -rn 'getState(' src/` liefert 27 Zeilen inkl. Erwähnungen):

| Ort | Zweck |
|---|---|
| `gameServer.js:276` | `stepSimulation()`: Rückgabe für den Client/Test |
| `gameServer.js:279` | `stepSimulation()`: Rückgabewert der Methode |
| `gameServer.js:366` | `attach()`: Startzustand im `LOBBY_STATE` |
| `gameServer.js:554` | `broadcastSnapshot()`: DER Sendepfad |
| `client/main.js:1039` | `currentState()`: lokal `match.getState()`, online `onlineViewState` |
| `client/main.js:2295` | Client-Zustand (Rendering/Anzeige) |
| `client/debugApi.js:106/115/180` | `window.__PA__`-Dev-API |
| `engine/replay.js:443` | `ReplayPlayer.getState()`: Wiedergabe |
| `engine/match.js:1114` | `step()`: früher Ausstieg bei `status !== 'playing'` |
| `engine/match.js:1152` | `step()`: Rückgabe am Ende jedes Takts |
| `engine/match.js:3125` | `stateHash()` |

**Tests/Werkzeuge:** ~150 Zuweisungen (`= … .getState(`), u. a.
`tests/state-hash.test.js` (17×), `tests/water-hud.test.js` (18×),
`tests/turret.test.js` (12×), `tests/guenther.test.js` (11×),
`scripts/*.mjs` in jedem Mess-/Prüfskript.

### 2.3 Die 126 Aufrufe — und wie viele den Snapshot lesen

Die Zahl **126** stammt aus `docs/optimierung-bericht.md:187–197`: gezählt wurden
Aufruforte von `match.step()`, **nicht** von `getState()`. `step()` endet mit
`return this.getState()` (`match.js:1152`) — der Snapshot ist der Rückgabewert
des Takts.

**Live nachgemessen (HEAD `4c42470`):**

```
$ grep -rn 'match\.step()' src/ tests/ scripts/ | wc -l
126
$ grep -rn '= *[A-Za-z_.]*\.step()' src/ tests/ scripts/ | wc -l
0
```

> **BEFUND — 126 Aufrufe, 0 lesen den Snapshot.** Kein einziger der 126
> `step()`-Aufruforte weist den Rückgabewert zu. Der Ansichtszustand wird in
> jedem Tick gebaut **und an jeder Stelle weggeworfen**. Der Server baut ihn
> sogar doppelt: `gameServer.js:275–276` ruft `this.match.step()` (baut intern
> `getState()`) und danach `this.match.getState()` erneut; in der Tick-Schleife
> `:163–164` dasselbe. Messung in `optimierung-bericht.md`: `getState` ist
> **44 % des Ticks** (0,04426 ms/Aufruf, 12 001 Aufrufe in 6000 Ticks = 2,00 je
> Tick).
>
> **DESIGN-ENTSCHEIDUNG (offen, markiert):** `match.js:1152` als öffentliche
> Schnittstelle beibehalten ODER lazy machen. Belegt ist nur, dass im Repo kein
> Aufrufort liest (126 : 0). Wer die Rückgabe entfernt, bricht einen künftigen
> Leser; wer sie lazy macht, behält die API. Determinismus unberührt — `getState`
> zieht keinen Zufall.

---

## 3. Der Event-Broadcast (`gameServer.js:246–248`)

### 3.1 Der Fluss

Der Motor puffert Ereignisse im `EventBus` (`engine/events.js:14`), der sie
**nicht** sofort verteilt: `emit()` (`events.js:36`) hängt an eine Warteschlange
(Obergrenze `MAX_QUEUE = 2000`, `events.js:12`), `flush()` (`events.js:54`) leert
sie in stabiler Reihenfolge. `MatchController.consumeEvents()` (`match.js:2958`)
ist der einzige Ausgang:

```js
consumeEvents() { return this.#events.flush(); }         // match.js:2958-2960
```

**Wichtig, festgehalten (`match.js:1139–1145`):** In `step()` steht bewusst
**kein** `drain()`. `drain()` würde die Warteschlange leeren und an Push-Handler
verteilen, **bevor** der Konsument lesen kann — Explosionen würden nicht
gezeichnet, Treffer nicht protokolliert. Die Push-API (`on`/`dispatch`) wird im
Projekt nicht verwendet; gelesen wird ausschließlich über `consumeEvents()`.

Der Server verteilt **jedes** Ereignis, **ohne Whitelist** (`gameServer.js:246–248`):

```js
for (const event of this.match.consumeEvents()) {
  this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
}
```

`#broadcastControl` (`gameServer.js:591`) baut eine JSON-Kontrollnachricht
(`controlMessage`, `protocol.js:549`) und sendet sie an **jeden** offenen Socket
(`readyState === 1`). Der Typ des Engine-Ereignisses wird **1:1** zum
`CONTROL`-String (kein Mapping, kein Filter).

### 3.2 Der Client-Gegenweg

Der `default`-Zweig des Client-Schalters fängt jede Kontrollnachricht ohne
eigenen `case` (`src/client/networkClient.js:396–398`):

```js
default:
  // Simulierte Spielereignisse (turn_start, explosion, terrain_destroyed, ...)
  this.#emit('game_event', message);
```

→ `main.js` `#handleRemoteEvent` → `verarbeiteOnline` (`ereignisse.js:569`). Es
gibt also **keine zweite Filterstelle** — was die Engine erzeugt, kommt beim
Online-Client an und wird gegen dieselbe Wirkungstabelle gehalten wie lokal.

> **DESIGN-ENTSCHEIDUNG — Server sendet alles, Client filtert.** Der Server
> kennt keine Ereignis-Whitelist: Ein neues Engine-Ereignis ist ohne
> Serveränderung online sichtbar. Der Preis: Der Client muss jede
> Nachrichtenart vertragen, und ein Ereignis ohne Client-Zweig fällt still in
> `default` (siehe Abschnitt 4).

### 3.3 Takt und Kopplung

`LobbySession.tick()` (`gameServer.js:234`) entkoppelt Netzwerk von Simulation:
Simulationsschritte laufen über `accumulator`/`TICK_MS` (`:240–244`), danach
**einmal** `consumeEvents()` + Broadcast (`:246–248`), Snapshots mit fester Rate
`SNAPSHOT_HZ = 20` (`:49`) über einen zweiten Akkumulator (`:252–256`).
`#broadcastControl` (Control/Events) und `broadcastSnapshot` (Binär) sind zwei
getrennte Kanäle.

---

## 4. Die 4 einzweigigen Ereignisse im Server-Stream

`docs/analyse-ereigniszweige.md:48` (gemessen, Tabelle 38/22/11/4/1) nennt
**genau 4 Ereignisse mit nur einem Zweig „nur online"** in
`src/client/ereignisse.js`:
`terrain_destroyed`, `projectile_spawn`, `turn_start`, `karte_unerreichbar`.

Alle vier nehmen **denselben Weg** durch den Server-Stream — den einen Loop
`gameServer.js:246–248`. Wo sie in der Simulation entstehen:

| Ereignis | emittiert in (datei:zeile) | im Server-Stream |
|---|---|---|
| `terrain_destroyed` | `systems/projectileSystem.js:402` (Krater) | `gameServer.js:246–248` → `default` |
| `projectile_spawn` | `engine/shooting.js:344` **und** `match.js:2093` (Turm) | `gameServer.js:246–248` → `default` |
| `turn_start` | `match.js:2800` in `#beginTurn` | `gameServer.js:246–248` → `default` |
| `karte_unerreichbar` | `match.js:759` in `#pruefeErreichbarkeit` (nur `kartentyp === 'autonom'`, `match.js:702`) | `gameServer.js:246–248` → `default` |

**Einordnung:** Der Urteilsstand im Analyse-Dokument ist für alle vier
„BEGRUENDET" — sie sind im lokalen Modus nicht stumm, weil dort die Wirkung über
ein anderes Element sichtbar wird (`analyse-ereigniszweige.md:107–110`). Der
Server-Stream ist für sie **kein Filter**: Sie laufen ungehindert durch
`consumeEvents()` → `#broadcastControl` und landen im Client-`default`. Der
Grund für „nur online" liegt also NICHT im Server, sondern darin, dass der lokale
Client sie über den Zustand/das Bitmap zeigt statt über die Ereignistabelle.

> **DESIGN-ENTSCHEIDUNG — Ereignisstrom als zweiter, feinerer Kanal neben dem
> Snapshot.** Der Binär-Snapshot führt nur KONSTANTE Felder (Position, Leben,
> Zustände, feste Stride-Längen). Alles, was ein Übergang/„etwas ist passiert"
> ist — Explosion, Krater, Treffer, Rundenwechsel —, fährt als
> Control-Ereignis. Damit muss das Drahtformat nicht je Ereignisart wachsen.

---

## 5. Replay-Aufzeichnung — nur Schüsse

### 5.1 Der Recorder

`ReplayRecorder` (`engine/replay.js:24`) speichert **nicht** den ECS-Zustand,
sondern `seed + Konfiguration + geordnete Eingabeliste`; die Wiedergabe ist
exakt, weil die Simulation deterministisch ist (Kopf `replay.js:1–19`).

**Nur Schüsse werden aufgezeichnet.** `recordInput()` (`replay.js:118`) nimmt
`{tick, playerId, angle, power, weaponId}` und wird produktiv an genau EINER
Stelle im laufenden Betrieb gerufen — im Erfolgszweig von `#handleInput`
(`gameServer.js:455–463`), **nur wenn `result.ok`**. Zwei weitere produktive
Rufe sind Wiedergabe/Wiederherstellung, kein Mitschnitt:

- `gameServer.js:167` — `#restoreFromReplay()` trägt die geladenen Eingaben
  erneut ein.
- `replay.js:197` — `fromJSON()` baut den Recorder nach.

> **BEFUND / DESIGN-ENTSCHEIDUNG — aufgezeichnet wird NUR `fire`.** Winkel, Kraft
> und Waffe sind die vollständige Eingabe, die in die Simulation eingeht.
> Springen (`jump()`), Abwerfen (`dropWeapon()`), Waffenwahl
> (`selectWeapon()`) stehen NICHT im Replay und NICHT im Protokoll (vgl.
> `analyse-ereigniszweige.md:6.1/6.2`: kein `jump`, kein `drop` in `CONTROL`).
> Das ist konsistent: Was das Replay nicht kennt, kann es nicht divergieren
> lassen — aber es heißt auch, dass ein aufgezeichnetes Match exakt die Schüsse
> reproduziert, sonst nichts.

### 5.2 `recordInput` — Rundung als gelernter Fehler

`recordInput` (`replay.js:118–148`) validiert `tick` (nichtnegative Ganzzahl)
und speichert **angle/power UNVERÄNDERT**.

> **DESIGN-ENTSCHEIDUNG — keine Rundung.** Hier stand einmal
> `Math.round(angle * 1e6) / 1e6` (`replay.js:122–139`). Messung: Wiedergabe
> schoss mit 1.145398 statt 1.1453981633974482; nach ~200 Takten wich die
> Explosion um 1,2 × 10⁻⁴ px ab, ab Takt 471 ging der Zustandshash auseinander.
> Eine Aufzeichnung muss das Match EXAKT reproduzieren (Determinismus,
> Anti-Cheat) — die Datei wird dafür wenige Prozent größer.

### 5.3 `fire()` im Replay und `Date.now()`

- **`fire()` im Replay:** `ReplayPlayer.step()` wendet Eingaben ZUERST an
  (`replay.js:390–397`): `this.match.fire(entry.playerId, entry.angle,
  entry.power, entry.weaponId)` (`replay.js:393`). Danach `this.match.step()`
  (`:404`) und `consumeEvents()` (`:406`). `MatchController.fire()` selbst
  (`match.js:1573–1575`) delegiert an `engine/shooting.js` über
  `#schussQuelle()` (`match.js:1610`).

- **`Date.now()` — der EINZIGE Wanduhr-Zugriff der Replay-Datei:**
  `replay.js:85` (`this.#startedAt = Date.now()`). Er landet ausschließlich als
  `createdAt` in `toJSON()` (`replay.js:174–184`). `fromJSON()` liest es
  **nicht einmal**. Der Kommentar (`replay.js:64–84`) hält fest: Wer dieses Feld
  in den Simulationspfad zieht (Seed/Timer/Zustandsfeld), bricht den
  Replay-Vertrag; Wächter ist `tests/replay-uhr.test.js`. **FALLE:** Zwei
  Aufzeichnungen desselben Matches sind hash-gleich, aber ihr JSON unterscheidet
  sich in genau diesem Feld.

> **DESIGN-ENTSCHEIDUNG — Zeitstempel als reine Metadaten.** Der Zustandshash
> belegt die Reproduzierbarkeit des ZUSTANDS, nicht der DATEI. `createdAt` ist
> bewusst außerhalb jedes Lesers des Simulationspfads.

### 5.4 Wiederherstellung nutzt dieselbe Kette

`#restoreFromReplay()` (`gameServer.js:149–169`) gruppiert die Eingaben nach
Tick, spielt sie in Tick-Reihenfolge über `match.fire()` + `match.step()` +
`consumeEvents()` nach und trägt sie dann mit `recorder.recordInput()` erneut ein
(`:167`). Persistenz ist damit nur „Seed + Eingaben", kein Zustandsdump.

---

## 6. Protokoll v7 — Layout, `HEADER_SIZE = 25`, `MAX_WIRE_POOPS = 6`

Quelle: `src/shared/protocol.js`. `PROTOCOL_VERSION = 7` (`:75`),
`MAGIC = [0x50,0x41]` („PA", `:76`), zwei Kanäle:
Steuernachrichten = JSON-Textframes (`controlMessage` `:549`), Snapshots =
Binärframes (`encodeSnapshot` `:238` / `decodeSnapshot` `:382`).

### 6.1 Binärlayout (Little Endian)

Kopf `HEADER_SIZE = 25` (`protocol.js:197`):

| Offset | Feld |
|---|---|
| [0..1] | Magic `'P','A'` |
| [2] | Protokollversion (`7`) |
| [3] | Nachrichtentyp (`MESSAGE_TYPE.SNAPSHOT = 1`) |
| [4..7] | Tick (Uint32) |
| [8..9] | Runde (Uint16) |
| [10..13] | Wind (Float32) |
| [14..15] | aktive Entity-ID (Uint16, 0 = keine) |
| [16] | Spieleranzahl |
| [17] | Projektilanzahl |
| [18..19] | Restzugzeit in 100 ms |
| [20..21] | Flags (Bit 0 = Vollsnapshot statt Delta) |
| [22] | Kistenanzahl (ab v5) |
| [23] | Geschützanzahl (ab v6) |
| [24] | Kackhaufenzahl (ab v7) |

Danach je Spieler 15 B (`PLAYER_STRIDE`, `:133`), je Projektil 6 B
(`:134`), je Kiste 8 B (`:142`), je Geschütz 8 B (`:150`), der Günther-Block
**immer** 6 B (`:161`), zuletzt je Kackhaufen 4 B (`:168`).

> **DESIGN-ENTSCHEIDUNG — feste Stride-Längen, keine variablen Felder.**
> Bestände (Waffen/Munition/Nachladen/Klasse) und Reload-Zeiten gehen NICHT in
> den Snapshot, weil sie je Spieler unterschiedlich lang sind und das feste
> Delta-Format sprengen würden — sie laufen als eigene `CONTROL.LOADOUTS`-
> Nachricht und nur bei Änderung (`gameServer.js:475–546`, `protocol.js:96–103`).

### 6.2 `MAX_WIRE_POOPS = Math.min(maxPiles, 255) = 6`

`protocol.js:186`:

```js
export const MAX_WIRE_POOPS = Math.min(GUENTHER_POOP.maxPiles, 255);
```

`GUENTHER_POOP.maxPiles = 6` (`src/shared/config/guenther.js:191`). Also
`min(6, 255) = 6`.

**Was das bedeutet:** Der Deckel gehört der **Simulation**, nicht dem Drahtformat
— `GuentherSystem` entfernt den ältesten Haufen, sobald `maxPiles` erreicht ist
(`protocol.js:178–184`, Verweis auf `guentherSystem.js`). Das Drahtformat **liest
die Zahl** statt sie neu zu setzen („eine Regel, eine Stelle"). Die
Kackhaufenzahl steht in `bytes[24]` (ein Byte) und reicht mit großem Abstand
(6 statt 255). Der Encoder kürzt die Haufenliste **vor** der Größenrechnung auf
`MAX_WIRE_POOPS` (`protocol.js:248`), der Decoder liest höchstens
`min(poopCount, MAX_WIRE_POOPS)` (`protocol.js:521`).

> **DESIGN-ENTSCHEIDUNG.** Ein Byte als Zählfeld genügt, weil 6 ≪ 255. Der
> Kommentar hält die Kopplung fest: Wer `maxPiles` über 255 hebt, MUSS das
> Zählfeld mitziehen.

### 6.3 Versionstreppe

- **v4:** Wasserstand je Spieler (`fromWireWaterLevel`, Grenzen aus
  `config/water.js`).
- **v5:** Kisten (im Kampffeld-Loot sonst online unsichtbar).
- **v6:** Geschütze (sonst ein unsichtbarer Angreifer).
- **v7:** Günther + Kackhaufen (Schaden/Verlangsamung ohne sichtbare Ursache).

> **DESIGN-ENTSCHEIDUNG — Version als harte Ablehnung.** `decodeSnapshot` lehnt
> jeden Snapshot mit falscher Version ab (`protocol.js:386`), statt ihn
> fehlzuinterpretieren. Genau dafür existiert die Zahl (`protocol.js:65–73`).

### 6.4 Eingaberichtung

Client → Server ist **ausschließlich** JSON-Kontrolle (`gameServer.js:966`);
Nutzlastgrenze VOR dem Parsen: `INPUT_LIMITS.maxPayloadBytes = 512` Byte
(`validation.js:36`), geprüft in `gameServer.js:983–995` (Bytes, nicht Zeichen).
`Control`-Arten (`protocol.js:84–104`): `hello, welcome, create_lobby,
join_lobby, lobby_state, start_match, input, select_weapon, resume, error, ping,
loadouts`.

---

## 7. ECS-Pipelines

**Registrierung:** `createGameWorld()` (`init.js`) legt die Komponenten an
(`registerDefaultComponents`, `init.js:25`), u. a. `Position`, `Velocity`,
`Health` (Float32 — Bruchteile, `init.js:28–30`), `Damage`, `Class`, `Weapon`,
`Crate`, `Team`, `Projectile`. Signatur-Bitmasken kommen aus
`ecs/componentStore.js`.

**Prioritäten — EINE Liste:** `SYSTEM_PRIORITIES` (`init.js:12–23`):

```
TURN 100 · PROJECTILE 95 · PHYSICS 90 · CHARACTER 85 · DAMAGE 80
MAELSTROM 75 · LOOT 70 · WEAPON 65 · TERRAIN 60 · EFFECTS 50
```

> **DESIGN-ENTSCHEIDUNG — Reihenfolge nur an EINER Stelle.** In
> `characterSystem.js:16–26`, `projectileSystem.js:25–34`, `lootSystem.js:14–24`
> stand je eine ZWEITE Prioritätskonstante mit NULL Lesern (Code-Audit-Befund).
> Wer sie ändern wollte, änderte nichts — der Motor liest `SYSTEM_PRIORITIES`.
> Alle entfernt; Wächter: `tests/system-priority.test.js`.

**Der eine Takt — `MatchController.step()` (`match.js:1113–1153`), exakte
Reihenfolge:**

1. `status !== 'playing'` → früher Ausstieg mit `getState()` (`:1114`).
2. `#turnElapsed += dt` (`:1116`).
3. `#stepFlyingCrates()` (`:1119`) — fliegende Kisten VOR der Physik.
4. `#merkeBewegung()` (`:1128`) — Bewegungszustand für das Bodenmaterial.
5. `this.#world.step()` (`:1129`) — die ECS-Systeme in Prioritätsordnung.
6. `#updateGroundedState()` (`:1132`) — Landung (Doppelsprung).
7. `#wendeBodenmaterialAn()` (`:1134`) — Reibung/Aufprall nach dem Schritt.
8. `#stepGuenther()` (`:1138`) — Günther nach der Physik.
9. `#checkVictory()` (`:1146`) — Ausscheidung.
10. Zugende bei Zeitablauf oder `hasFired && keine Projektile` (`:1149`) →
    `endTurn()`.
11. `return this.getState()` (`:1152`).

**Zug-/Rundenpipeline:** `endTurn()` (`match.js:2659`) → nächstes lebendes
Element der `#turnOrder` (`:2666–2669`), bei Umlauf `#round += 1` +
`#onRoundStart()` (`:2676–2683`). `#onRoundStart()` (`:2688`) prüft die harte
Rundengrenze (`#finishByAttrition`, `:2726`), aktiviert ab
`suddenDeath.roundBreakpoint` den Mahlstrom (`:2697–2702`), würfelt Wind
(`:2703–2707`), spawnt Rundenloot (`:2708`), emittiert `round_start` (`:2709`)
und lässt Geschütze feuern (`:2718`). `#beginTurn()` (`:2759`) rechnet
Zustände/Cooldowns ab, prüft Einfrieren (`turn_skipped`, `:2793`), startet den
Turn-Timer und emittiert `turn_start` (`:2800`).

**ECS-Systeme (Rolle):** `characterSystem.js` — Gravitation, Reibung,
Terrain-Kollision, Landeschaden, Wasser/Auftrieb (`:1–14`); `projectileSystem.js`
— Gravitation/Drag/Wind, CCD gegen Bitmaske und AABBs, Explosion/Krater/
Knockback (`:1–15`); `lootSystem.js` — deterministischer Kistenspawn + Aufsammeln
(`:1–12`, `PICKUP_RADIUS = 110`, `:45`); `turnSystem.js` — Zugreihenfolge,
Zugdauer, Rundenfortschritt, mit `autoAdvance: false` nur noch Countdown
(`:1–13`). Kein `terrainSystem.js` — Terrain läuft über `CollisionMask` und die
Generatoren, nicht als ECS-System.

---

## 8. Server-Autorität und Routing

**Der Server besitzt die Simulation** (`gameServer.js:1–9`): Clients senden nur
Wünsche, der Server validiert und verteilt kompakte Binär-Snapshots. Feste
Zeitschrittweite je Lobby, Tick-Schleife unabhängig von der Snapshot-Rate.

> **DESIGN-ENTSCHEIDUNG — keine Bot-KI (**`gameServer.js:20–22`, `:282–299`,
> `:1027–1036`**).** Es gibt Bots weder im Motor noch im Server. Teams werden
> ausschließlich von Menschen gespielt. Die Sitzung entsteht beim ersten
> Beitritt, **tickt aber erst, wenn alle Teams einen verbundenen Menschen
> haben** (`session.laeuft` vs. `#lobbies.alleTeamsBesetzt`, `:1088`). Ein
> unbesetztes Team ist kein Bot-Team. Die SPEZIELLEN NPCs (Günther, Geschütze)
> stecken im Motor, laufen deterministisch mit und besetzen kein Team.

**HTTP-Routing** (`#handleHttp`, `gameServer.js:824`):

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/healthz` | Status, Zähler, `orphanedSessions` (`:839`) |
| GET | `/api/lobby` | Lobbyliste (`:861`) |
| GET | `/api/lobby/:id` | Lobbydetail (`:865`) |
| POST | `/api/lobby/create` | Lobby anlegen (`:872`) |
| GET/HEAD | `*` | statische Auslieferung `dist/` + SPA-Fallback (`createDistHandler`, `:1277`) |

CORS-Header für jeden Request (`:829–832`). Der WebSocket hängt am selben
HTTP-Server unter `/ws` (`:649`), plus ein `error`-Zuhörer, der rohe
`EADDRINUSE`-Abstürze in eine Logzeile verwandelt (`:667–672`).

**WebSocket-Steuerschalter** (`#handleConnection`, `gameServer.js:1004`):
`HELLO`→`WELCOME`, `JOIN_LOBBY` (Sitzung anlegen, Entity-IDs zuordnen, ggf.
starten), `START_MATCH` (nur wenn alle Teams besetzt), `INPUT` (Validierung →
`match.fire` → bei Erfolg `recorder.recordInput`), `SELECT_WEAPON`, `PING`→`PONG`
(+ Wiederholung des `match_over` bei entschiedenem Match, `:1188–1197`),
`default`→`ERROR`.

**Autorität an zwei Stellen belegt:**

- `#handleInput` (`gameServer.js:411–465`) validiert über `validateCommand`
  (`validation.js`) gegen `currentTick`, `activePlayerId` und `knownPlayerIds`
  und lehnt Winkel/Kraft/Tick außerhalb der Grenzen ab (bzw. degradiert sauber
  via `history.get()` außerhalb des Kompensationsfensters, `:435`).
- `#platzFuer(token)` (`:405`) wählt den Platz der AKTIVEN Figur; der
  `activePlayerId`-Vergleich verhindert Züge der falschen Figur.

**Persistenz:** `snapshotState()` (`:698`) speichert **nicht** entschiedene
Lobbys (`:717`); `saveState()` atomar; `restoreState()` (`:738`) baut Matches
durch erneutes Anwenden der Replay-Eingaben auf, `startPersistence()` speichert
periodisch (`:800`, Standard 10 s, abschaltbar via `PA_PERSISTENCE=off`).

---

## 9. Markierte Design-Entscheidungen (Übersicht)

1. **Ein Motor, zwei Fahrer** (`match.js:1–9`): Server und Client fahren
   denselben `MatchController`; Determinismus an EINER Stelle belegbar.
2. **Zustandsaufbau als reine Funktion** (`stateSnapshot.js:63`,
   `match.js:2978`): Kopplung in `#zustandsQuelle()`, Aufbau in
   `stateSnapshot.js`. Feldreihenfolge ist Vertrag (Hash).
3. **`step()` gibt den Zustand zurück, niemand liest ihn** (126 : 0) —
   offener Optimierungspunkt, `step()` ist öffentliche API.
4. **Server broadcastet jedes Engine-Ereignis ohne Whitelist**
   (`gameServer.js:246–248`); Client filtert im `default`-Zweig
   (`networkClient.js:396–398`).
5. **Ereignisstrom als zweiter Kanal** neben dem Binär-Snapshot;
   Übergänge vs. konstante Zustandsfelder getrennt.
6. **Replay = Seed + Eingaben, nur `fire`** (`replay.js:118`,
   `gameServer.js:456`); angle/power ungerundet (gelernte Divergenz).
7. **`createdAt` ist reine Metadaten** (`replay.js:85`), außerhalb jedes
   Simulationslesers; Wächter `tests/replay-uhr.test.js`.
8. **Feste Draht-Stride-Längen** (`protocol.js:133–168`); variable Bestände
   laufen als `CONTROL.LOADOUTS` nur bei Änderung.
9. **`MAX_WIRE_POOPS` folgt der Simulation** (`protocol.js:186` ↔
   `config/guenther.js:191`): „eine Regel, eine Stelle".
10. **Protokollversion lehnt ab statt fehlzuinterpretieren**
    (`protocol.js:65–73`, `:386`).
11. **Prioritäten nur in `SYSTEM_PRIORITIES`** (`init.js:12–23`); die lokalen
    Zweitkopien in den Systemen wurden als tote Regeln entfernt
    (`tests/system-priority.test.js`).
12. **Keine Bot-KI** (`gameServer.js:282–299`); Teams nur von Menschen; NPCs im
    Motor.

---

## 10. Belegte Zahlen (live, HEAD `4c42470`)

```
match.step()-Aufruforte (src/tests/scripts) : 126
… davon mit Zuweisung des Rückgabewerts     :   0
getState()-Aufrufe in src/ (inkl. Def./Kom.) : 27  (13 echte Aufrufe)
consumeEvents()-Aufruforte                  : 177
recordInput()-Rufe produktiv                : 2   (recordInput def + Server :456);
                                                   1 weiterer Wiedergabe-Ruf (:167) + 1 fromJSON (:197)
Date.now() in replay.js                     : 1   (:85, nur createdAt)
HEADER_SIZE                                 : 25  (protocol.js:197)
MAX_WIRE_POOPS                              : 6   (min(6,255), protocol.js:186)
SNAPSHOT_HZ / FULL_SNAPSHOT_INTERVAL        : 20 / 40  (gameServer.js:49,57)
getState-Häufigkeit (gemessen)              : 2,00 je Tick; 44 % des Ticks
```

---

## 11. Grenzen dieser Arbeit

- **Kein Serverlauf, kein WebSocket-Client, kein `npm test`, kein Build.**
  „Der Server sendet X" ist an `gameServer.js:246–248` **code-belegt**, nicht
  beobachtet.
- Die Häufigkeiten aus `optimierung-bericht.md` (44 % des Ticks, 126 : 0)
  stammen aus dessen eigener Messung; hier live nachgezählt ist nur die
  **Anzahl der Aufruforte** (126 / 0).
- `analyse-ereigniszweige.md` bezieht sich auf ältere Commits (`7d4d208`,
  `e31d1c7`); die Zeilenangaben im Abschnitt 4 wurden hier gegen `4c42470`
  stichprobenartig gegengeprüft (`match.js:2800/759/2093`,
  `projectileSystem.js:402`, `shooting.js:344` stimmen).
