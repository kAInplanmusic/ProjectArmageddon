# Architektur-Audit 2: Datenfluss, Snapshot, Ereigniskanal, Fehlerpfade, Determinismus-Grenzen

**Datum:** 2026-09-27, 09:31–09:45 CEST
**Prüfer:** Architektur-Prüfer 2 (rein lesend; geschrieben wurde GENAU diese Datei)
**git-Stand:** Beginn `a49e805` (27.09. 09:31), Ende `fd4afc2` (27.09. 09:33, „Textanker durch Verhalten
ersetzt"). Der Stand hat sich **während** des Laufs bewegt; alle Zeilenangaben wurden nach dem Wechsel
gegen `fd4afc2` nachgeprüft. `src/engine/match.js` war zeitweise uncommitted geändert (ein anderer
Arbeiter) — nicht angefasst, nur gelesen. Arbeitsbaum am Ende: sauber bis auf die ungetrackten
Dokumente der anderen Arbeiter.

**Umfang:** `src/shared/protocol.js` (992 Z.), `src/engine/stateSnapshot.js`, `src/engine/events.js`,
`src/client/networkClient.js`, `src/client/ereignisse.js`, `src/server/gameServer.js` (1548 Z.),
`src/client/main.js` (3315 Z., gezielt), `renderer.js`/`hud.js` (Lesestellen), `validation.js`,
`launchSpeed.js`, `seed.js`, `prng.js`, `persistence.js`, `lobby.js`; Messungen über den Motor
(MatchController) und den echten Restore-Pfad.

**Fremde, ungetrackte Dokumente im Arbeitsbaum (nicht von mir):** `docs/audit-ui-ablauf.md`,
`docs/audit-ui-spielersicht.md`, `docs/audit-arch-grenzen.md` — sie erschienen während dieses Laufs
(andere Arbeiter derselben Sitzung). Meine Datei ist ausschließlich `docs/audit-arch-datenfluss.md`.

**NICHT geprüft (ausdrücklich):** kein `npm test` / `test:e2e` / `checks` / `build` (Auftrag).
E2E-Verhalten im Browser wurde nicht ausgeführt; Aussagen über die Anzeige beruhen auf Lesestellen
plus Node-Messungen des Motors, nicht auf einem Bild. Balance, Loot-Tabellen, Terrain-Qualität,
Achievements, Replay-Wiedergabe-Gleichheit selbst (nur ihr Seed-Weg) waren nicht Gegenstand.
`dist/` und `node_modules/` ausgeschlossen. Keine Sonde wurde ins Repo geschrieben (alles unter
`/tmp/pa-audit/`).

---

## 1. Der Weg eines Schusses — Stationen

| # | Station | Funktion / Fundstelle belegt in |
|---|---|---|
| 1 | Taste | `input.js:62` (`keydown`), Enter → `input.js:105` `onFire()`, Space (Aufladen) → `input.js:180` |
| 2 | Verdrahtung | `main.js:175` `onFire: () => this.fire()` |
| 3 | Client-Befehl | `main.js:1346 fire()` → Online-Zweig `main.js:1354`; Vorhersage `main.js:1367` `#startShotPrediction` |
| 4 | Referenztick | `networkClient.js:79 referenzTick()` (fortgeschrieben, nicht der rohe Snapshot-Tick) |
| 5 | Draht | `networkClient.js:427 sendInput()` → `controlMessage(CONTROL.INPUT, …)` `:430` → `socket.send` |
| 6 | Server-Annahme | `gameServer.js:1155` `socket.on('message')` → `case CONTROL.INPUT` `gameServer.js:1342` → `session.handleInput(context.token, message)` `:1345` |
| 7 | Identität | `gameServer.js:486 #platzFuer(token)` — **die Figur kommt aus dem Token, nie aus der Nachricht** |
| 8 | Prüfung | `gameServer.js:517 validateCommand(...)` → `validation.js:97` (Winkel/Kraft als echte Zahl, Tick-Fenster ±400, Waffe im Katalog) |
| 9 | Motor | `gameServer.js:535 match.fire(seat.entityId, …)` → `match.js:1627 fire()` → `shooting.js:85 fire()` |
| 10 | Ereignisse | `shot`, `projectile_spawn` (Motor) — gesammelt im `EventBus` (`events.js:36 emit()` → Puffer, `:54 flush()`) |
| 11 | Schritt | `projectileSystem.js:275 projectile_impact`, `:447 explosion`, `:402 terrain_destroyed`, `:202 fuse_expired` |
| 12 | Absenden | `gameServer.js:299 consumeEvents()` → Filter `:300` → `#broadcastControl` `:773` (JSON-Textframe) |
| 13 | Snapshot | `gameServer.js:730 broadcastSnapshot()` → `encodeSnapshot` `protocol.js:240` → Binärframe |
| 14 | Empfang | `networkClient.js:314 #handleMessage` → `decodeSnapshot` `:324` → `emit('snapshot')` `:333` |
| 15 | Anzeige | `main.js:1117 onlineViewState` → `renderer.render()` `main.js:2067` / `hud.update()` `main.js:2075`; Wirkung `ereignisse.js:275 shot.online` → `shotPredictor.resolve()` |

**Wo der Wert unterwegs verlorengehen kann**

1. **Der Tick des Schusses ist eine Schätzung** (`networkClient.js:79–101`). Der Server lehnt Ticks
   außerhalb von ±400 ab (`validation.js:97`, `INPUT_LIMITS.maxTickDrift`); das 12-Tick-Fenster der
   Lag-Kompensation füllt nur `interpolatedFrom`. Der Kommentar sagt selbst, die Fortschreibung sei
   „nicht die Behebung": im freilaufenden Match wurden **160 Ticks in 1,5 s** gemessen (> 100 Ticks/s
   statt 60). Damit ruht die Tick-Gleichsetzung auf einer Annahme, die das Projekt selbst als offen
   benennt (`networkClient.js:60–74`) — siehe §5.
2. **Ein fehlendes Paket gibt es nicht** (TCP/WebSocket), aber ein **nicht offener Socket**:
   `#broadcastControl` überspringt geschlossene Sockets **ohne Meldung** (`gameServer.js:775–777`).
   Der Schuss wird ausgeführt, der `shot`-Termin kommt beim Client nie an → die Vorhersage bleibt bis
   zum Zeitlimit stehen (`shotPredictor` mit `timeoutMs: 1000`, `main.js:131`). Selbstheilend, aber
   still. **Positiv:** eine ABGELEHNTE Eingabe ist laut — der Server antwortet mit `CONTROL.ERROR`
   (`gameServer.js:1347`) und der Client verwirft die Vorhersage (`main.js:1055`
   `this.shotPredictor.discard(text)`).
3. **Der Rückgabewert von `sendInput` wird verworfen** (`main.js:1362`); gemeldet wird trotzdem
   „Schuss gesendet" (`main.js:1365`). `sendInput` liefert `false` bei fehlender Verbindung —
   dieser Fall ist durch die Vorprüfung `main.js:1355` eng, aber die Meldung ist nicht gedeckt.

**Ist der Weg deterministisch?** Der Motor ja: `shooting.js` zieht aus dem Seed-Teilstrom
(`quelle.rng`), `specials.js`/`shooting.js:634` verzichten ausdrücklich auf `Math.random`. Der
**Einstieg** ist es nicht (siehe §5). Replays zeichnen die Eingabe samt Tick auf (`gameServer.js:537`),
damit ist die Wiedergabe selbst wieder deterministisch — die Aufzeichnung ist die Grenze, nicht der Weg.

---

## 2. Snapshot: Format, Größe, Felder

**Format:** Protokoll v7, Little Endian, 25-Byte-Kopf (`protocol.js:8–33`, `HEADER_SIZE = 199`).
Eigene Messung (`/tmp/pa-audit/groesse.mjs`, Seed 20260910, `hills`, 4 Figuren, nach 600 Takten):

```
Vollsnapshot: 99 Byte | Spieler 4 | Projektile 0 | Kisten 1 | Geschütze 0 | Haufen 0
Abschnitte: Kopf 25 | Spieler 4×15=60 | Kisten 1×8=8 | Günther 6 | Rest 0
→ bei 20 Hz (SNAPSHOT_HZ=20, gameServer.js:50): 1,93 KB/s je Client (Vollsnapshot)
Delta: 20 Hz Delta, alle 2 s ein Vollsnapshot (FULL_SNAPSHOT_INTERVAL, gameServer.js:58)
```

### Tabelle A — Felder, die der Server sendet

| Feld (Draht) | gesendet | gelesen vom Client | Urteil |
|---|---|---|---|
| `tick`, `round`, `wind`, `turnRemainingMs`, `activePlayerId` | ja | ja (`main.js:1185–1191`) | nötig |
| Spieler `x`,`y`,`health`,`alive`,`teamId`,`shield`,`frozenTurns`,`waterLevel` | ja | ja (`main.js:1141–1180`, `hud.js:302/365`, `renderer.js:713/795`) | nötig |
| Spieler `turnFlag` → `isActiveTurn` | ja (`protocol.js:316`, gelesen `:434`) | **nein** — im ganzen Repo 1 Treffer (die Dekodierung selbst) | **B1: gesendet, nie gelesen** (1 B/Spieler ⇒ 4 B = 4 % des 99-B-Takts) |
| Projektil `x`,`y` | ja | ja (`renderer.js:809–823`) | nötig |
| Projektil `entityId` | ja (`protocol.js:325`) | **nein** (Render zeichnet nur `x`/`y`) | **B4: gesendet, nie gelesen** (2 B/Projektil) |
| Kiste `x`,`y`,`rarity` | ja | ja (`renderer.js:687`) | nötig |
| Kiste `crateType` | ja (`protocol.js:335`) | **nein** — kein Treffer in `src/client/` | **B3: gesendet, nie gelesen** (1 B/Kiste) |
| Geschütz `x`,`y`,`teamId`,`roundsLeft` | ja | ja (`renderer.js:651/665/674`) | nötig |
| Günther `x`,`y`,`richtung`,`aktiv`, Haufen `x`,`y` | ja | ja (`renderer.js:941`, `main.js:1229`) | nötig |
| Kopffelder (Zählungen, `dirty`, `flags`) | ja | intern | nötig |

**Summe der nie gelesenen Bytes** im gemessenen Vollsnapshot: **5 von 99 Byte (5,1 %)** —
`turnFlag` 4 B + `crateType` 1 B (+ `entityId` je Projektil, hier 0). Kein Bandbreitenproblem, aber
es ist die Frage aus dem Auftrag: **`turnFlag` wird seit Protokoll v1 in jeden Takt jedes Spielers
geschrieben und hat keinen Leser.**

### Tabelle B — Felder, die der Client liest, aber der Server nie sendet

**Diese Frage ist die gefährliche — und sie hat einen Treffer mit messbarer Folge:**

| Gelesen in | Feld | Auf der Leitung? | Folge |
|---|---|---|---|
| `main.js:1607` `eigene.sidegradeId ?? null` | Sidegrade je Figur | **NEIN.** Weder Snapshot (`protocol.js:280–322`), noch `LOADOUTS` (`gameServer.js:704–711`: nur `inventory, ammo, cooldowns, activeWeaponId, classId, archetypeId`), noch `WELCOME`/`LOBBY_STATE` | **A1** |
| `renderer.js:820` `projectile.fuseSeconds ?? 0` | Zünder-Restzeit | **NEIN.** Projektile tragen nur `entityId/x/y` | **A6** |
| `main.js:1168` `maxHealth: 100` | Höchstleben | **NEIN** (der Snapshot führt nur `health`) | **A3** |
| `main.js:1186` `maxRounds: 30` | Rundengrenze | **NEIN** | **A3b** (Anzeige) |
| `main.js:1194` `>= 15` | Mahlstrom-Start | **NEIN** (nur `inset` kommt als Ereignis) | **A2** |
| `renderer.js:?`/`hud.js` `state.maelstrom.inset` | — | ja, über `maelstrom_contract` | ok |

Der Sidegrad ist der schwerste Fall: Er ist **gleichzeitig** Teil der Lobby-Konfiguration
(`main.js:394–404`, `main.js:943` → `gameServer.js:1092` → `gameServer.js:111` → `MatchController`)
und wird beim Rechnen **autoritativ** benutzt (`launchSpeed.js:58–69` → `combatProfile(klasse,
archetyp, sidegradeId)`). Der Client rechnet seine eigene Vorhersage mit demselben Aufruf
(`main.js:1601`) — nur ohne den Sidegrad.

---

## 3. Ereigniskanal: was ist heute gedrosselt

**AKTUELLER Stand (nachgeprüft, `protocol.js:787–795`):** Fenster **30 Takte = 0,5 s**
(`EREIGNIS_DROSSEL_TAKTE`, `protocol.js:818`), geschlüsselt **je Art und Figur**
(`fensterKennung`, `protocol.js:828–834` — liest `playerId`/`entityId`/`crateId`/`turretId`).

| gedrosselte Art | Gruppe | Begründung im Code | Eigene Nachprüfung |
|---|---|---|---|
| `landed` | 1 (Bodenkontakt) | Bounce-Artefakt einer stehenden Figur, alle 7 Takte; echter Vorgang dauert 50 Takte | **bestätigt** (siehe §6) |
| `crate_landed` | 1 | dito, Kistenaufprall | plausibel; payload hat `crateId` ⇒ Fenstertrennung greift |
| `damage` | 2 | Wert steht im Snapshot | **bestätigt, 15092/15092 wertgleich** |
| `entity_in_water` | 2 | dito | **bestätigt, 15066/15092 (26 Sterbetakte)** |
| `drowning` | 2 | dito | **bestätigt; Nutzlast `{entityId, level}` ist identisch mit `entity_in_water`** — trägt also nicht mehr als die Nachbarart |

Eigene Messung des Kanals (`/tmp/pa-audit/filter-messung.mjs` und `lang.mjs`, Seed 20260910,
`flooded`, 8×5 = 40 Figuren):

```
30 s  (1800 Takte): VORHER 48905 Nachrichten 1630,2/s 142,65 KB/s → NACHHER 2307 = 76,9/s, 5,79 KB/s (−95,9 %)
                     je Art: damage/entity_in_water/drowning 15092 → 516 gesendet (14576 unterdrückt)
100 s (6000 Takte): VORHER 57309 Nachrichten 573,1/s 46,38 KB/s
                    NACHHER (heutiger Filter) 3991 = 39,9/s, 2,46 KB/s — Zustandsarten 45276 → 1548
```

**Ist jede Art begründet?** Ja, jede der fünf hat im Code eine Begründung, und keine trägt
Zustand, der nicht anders ankommt (§6). Aber es gibt **drei Schieflagen**:

- **(b) Frisst die Drossel etwas weg?** Für `landed` nein (Fenster 30 < Flugphase 50). Für die drei
  Zustandsarten **ja, bewusst**: 93 % ihrer Meldungen (14576 je Art von 15092) fallen weg. Der Wert
  ist im Snapshot nachrechenbar — **außer dem Urheber** (`attackerId`), der im Snapshot fehlt; die
  Vorbehalts-Notiz in `protocol.js:747–756` nennt das korrekt und wurde nicht verletzt, weil heute
  niemand `attackerId` liest (`grep -r attackerId src/client/` → 0 Treffer).
- **(a) Jeden Takt gemeldet, niemand liest:** `damage`, `entity_in_water`, `drowning` — alle drei
  jetzt gedrosselt; **`dot_tick` und `toxic_rain` melden ebenfalls je Takt und tragen Zustand**,
  sind aber **ungedrosselt** (bei 40 Figuren in Unterwasser-Szenarien nicht aufgetreten; nicht
  gemessen, siehe NICHT GEPRÜFT). Kein Fund, aber die nächste Stelle mit demselben Muster.
- **(c) Erzeugt, aber im Client ohne Wirkungszweig — geprüft gegen `EREIGNIS_WIRKUNGEN`:**

| Art | Zweig lokal | Zweig online | Bewertung |
|---|---|---|---|
| `damage` | — | — | ok: Wert aus dem Snapshot (`hud.js:247/365`) |
| `entity_in_water` | — | — | ok: Übergangstext `main.js:1491 #trackWater` (läuft in beiden Betriebsarten, `main.js:2074`) |
| `drowning` | `{}` | `{}` | ok (absichtlich, kommentiert) |
| `projectile_expired` | — | — | **kein Zweig, aber begründet**: steht in `bewusstStumm` (`tests/event-coverage.test.js:192ff`, „ein verfallenes Geschoss ist kein Ereignis für den Spieler — es hat nichts getroffen"). Mein erster Befund „nirgends begründet" war falsch (siehe §8, WIDERLEGT) |
| `turn_end`, `round_crates`, `weapon_cooldown`, `water_pushed`, `dot_applied` | — | — | stumm; Zustand kommt über Snapshot/nächste Meldung. Nicht einzeln begründet, aber je harmlos |
| `crate_landed` | ja | **nein** | lokal Text, online nichts (in `bewusstStumm` begründet: „online übernimmt es die Kistenliste") — und zusätzlich gedrosselt, obwohl online ohne Wirkung |

---

## 4. Fehlerpfade

| Fall | Verhalten | Urteil |
|---|---|---|
| **ungültiges Token** / kein Spielerplatz | `#platzFuer` `gameServer.js:486` → `null` → `{ok:false, errors:['Kein Spielerplatz']}` → `CONTROL.ERROR` | **laut** ✔ |
| **kein JOIN vor INPUT** | `#sessions.get(null)` → `throw new Error('Keine aktive Sitzung')` → `catch` `gameServer.js:1409` → `metrics.errors`, Log `error`, Antwort `ERROR` | **laut** ✔ |
| **fehlende Kontextstelle (Client)** | `kontextBrauchbar` `ereignisse.js:139` meldet **einmal je Lücke** via `console.warn`, danach läuft es ohne Prüfung; fehlende Felder ⇒ nur die eigene Wirkung entfällt | **halb laut**: eine Warnung, danach ist der Ausfall still — genau die Absicht (Begründung `ereignisse.js:69–101`), aber im Betrieb sieht das niemand ohne offene Konsole |
| **unbekannter Ereignistyp** | `EREIGNIS_WIRKUNGEN[t]?.online?.()` `ereignisse.js:796` → `undefined` → nichts | **still, dokumentiert** (Tabellen-Vollständigkeit erzwingt den Eintrag) |
| **unerwarteter/abgeschnittener Snapshot** | `decodeSnapshot` → `null` (`protocol.js:386–389`, `:415`) → `networkClient.js:325 if (!snapshot) return;` | **STILL — A7** |
| **Feld fehlt im Zustand** | durchweg `?? 0` / `?? []` / `?.` | **still by design**, meist harmlos; Ausnahme: `main.js:1607` (wird falsch, A1) und `renderer.js:820` (A6) |
| **Abbruch mitten im Match** | Socket-`close` `gameServer.js:1422`: `detach` + wenn keiner verbunden `session.stop()`. Takt holt nie auf, weil `elapsed = Math.min(250, now - lastTickAt)` (`:271`) | **richtig abgesichert** ✔ (kein Nachhol-Sturm nach Stunden Pause) |
| **README/Retour nach Neustart** | siehe A4/A5 | **STILL und falsch** |
| **zu große Nutzlast** | `gameServer.js:1176` → `warn` + `CONTROL.ERROR` | **laut** ✔ |
| **kaputter JSON-Body beim Lobby-Anlegen** | `#readBody` `gameServer.js:1125–1141`: bei > 8192 Zeichen wird **gekappt** (`:1130`), daraus wird ungültiges JSON, `catch` → `resolve({})` → Lobby mit **Vorgabewerten** | **B6: still** |

**Begründung, wo ein stiller Ausfall hier schlimmer ist als ein lauter:** Die Anzeige ist die einzige
Rückmeldung, die der Spieler hat. Wo ein Wert fehlt und der Code `?? 0` schreibt, entsteht **kein
Fehler, sondern ein plausibles Bild**: ein voller Lebensbalken, der 156 % breit ist (A3), eine
Vorhersage, die 222 px neben der echten Bahn liegt (A1), ein Mahlstrom, der sichtbar nichts tut
(A2), ein Zünder ohne Countdown (A6). In allen vier Fällen läuft nichts rot, nichts wirft, nichts
loggt — der Spieler sucht den Fehler bei sich. Deshalb ist die Regel „still ist schlimmer als laut"
hier nicht Stil, sondern die teuerste Fehlerklasse des Projekts.

---

## 5. Determinismus-Grenzen — jede Fundstelle

Quellen, die NICHT aus dem Seed fließen (`grep -rn "Math\.random|Date\.now|performance\.now"
src/ tests/ scripts/`, ohne `dist/`/`node_modules/`):

| Fundort | Was | Bewertung |
|---|---|---|
| `prng.js:145–152` `generateSeed()` | `crypto.getRandomValues` **oder** `Date.now() ^ Math.random()` | **Die Grenze selbst:** nur wenn kein Seed übergeben wird. Der Server tut das im Normalfall (`lobby.seed === undefined`, gemessen) ⇒ **jede Partie beginnt mit einem Nicht-Seed**. Das ist legitim, ABER: der Wert muss die Partie überleben (er tut es im Replay-Kopf, nicht in der Sicherung — A4) |
| `gameServer.js:270–279` `tick()` | `Date.now()`, `Math.min(250, elapsed)`, `accumulator` | **Der Einstieg in die Simulation ist Wanduhr-getrieben.** Wie viele Ticks ein Aufruf nachholt, hängt von der Laufzeit ab. Der Zustand je Tick ist deterministisch, die Zuordnung „Eingabe → Tick" nicht. Nach einem Stall holt der Server bis zu 15 Ticks in einem Aufruf nach — die Annahme „1 Tick = 1/60 s", auf der das 12-Tick-Fenster ruht, gilt dann nicht (`networkClient.js:60–74` benennt genau das, ungelöst) |
| `gameServer.js:152/453` | `Date.now()` für `lastTickAt`, `emptySince` | Steuerung; `emptySince` wird **nie gelesen (B5)** |
| `replay.js:85` | `Date.now()` → `#startedAt` | Metadatum |
| `networkClient.js:82/99/331/441` | `Date.now()`, `performance.now()` für `referenzTick`, Empfangszeit, Latenz | **Eingabe-Seite**: der gesendete Tick hängt an der Client-Uhr (siehe §1.1) |
| `client/sound.js:66,218` | `Math.random()` (Rauschen) | Anzeige/Klang, kein Simulationspfad |
| `identity.js:78` | bewusst **kein** `Math.random` | Kommentar stimmt |
| `match.js`, `specials.js` | Seed-Teilströme (`SEED_OFFSETS` in `seed.js:20–34`) | deterministisch ✔ |

**Kein Treffer** für `Math.random`/`Date.now` in `src/engine/` außer `replay.js:85` (Metadatum).
Die Reihenfolge-Nichtdeterminismus-Suche (`.sort(`, `Object.keys`) ergab in `hashState` sortierte
Schlüssel (`stateSnapshot.js:241/245/256`) — dort korrekt behandelt.

**Grenze in einem Satz:** Der Motor ist deterministisch **gegeben (Seed, Tick, Eingaben am Tick)**.
Nicht aus dem Seed fließen: der Match-Seed im Normalfall (Zufall bei Spielstart), der Tick, an dem
eine Eingabe ankommt (Wanduhr + Netzweg), und die Tick-Nachholmenge nach einem Stall.

---

## 6. Vier-Augen-Probe der drei Berichte

### 6.1 `docs/ereignis-info-gehalt.md`

| Behauptung | Ergebnis | Beleg |
|---|---|---|
| `entity_in_water`: 15066 von 15092 wertgleich, die 26 Ausnahmen sind Sterbetakte | **BESTÄTIGT, exakt** | eigene Messung: 15066 / 26 Abweichungen, davon **0 am Leben**, **26 tot** (`/tmp/pa-audit/redundanz.mjs`) |
| `drowning`: dasselbe Feld, dieselbe Schwelle, 15092/15092 ≥ 0,72 | **BESTÄTIGT, mit Präzisierung** | gegen die Snapshot-Zahl gemessen sind es 15066 (+ die 26 Sterbetakte, bei denen der Snapshot **0** sendet — die Meldung widerspricht dort dem Snapshot). Gegen den Live-Wert: 15092/15092 |
| `damage`: `remaining` == Snapshot-Gesundheit in 15092/15092 | **BESTÄTIGT, exakt** | eigene Messung 15092 / 0 Abweichungen. **Achtung:** mein erster Lauf ergab „0 von 15092" — die Sonde las `payload.playerId`, das Feld heißt `entityId` (`damageSystem.js:104`). Sondenfehler, nicht Produktfehler |
| „alle drei haben im Client **null Leser**" | **BESTÄTIGT** | `EREIGNIS_WIRKUNGEN` hat für `damage`/`entity_in_water` keinen Schlüssel, `drowning` ist `{}` (`ereignisse.js:666`) |
| „88,9 % des ungefilterten Ereigniskanals" | **BESTÄTIGT, exakt** | eigene Rechnung nach Byte: **88,9 %** |
| „42,29 → 2,46 KB/s" | **BESTÄTIGT, exakt** | eigene Messung 6000 Takte: 42,29 KB/s (nur Anzeige-Drossel) und **2,46 KB/s** (heutiger Filter) |
| Zeilenangaben `main.js:1155` (Wasserstand), `main.js:1474–1493`/`2057` (`#trackWater`) | **WIDERLEGT (veraltet)** | heute `main.js:1172`, `main.js:1491`, Aufruf `main.js:2074` |

### 6.2 `docs/ereigniskanal-filter.md`

| Behauptung | Ergebnis | Beleg |
|---|---|---|
| 3428 `landed` in 100 s bei 4 Figuren `hills`; 34283 bei 40 Figuren | **BESTÄTIGT (Größenordnung, nicht nachgerechnet für 4 Figuren)** | eigene 40-Figuren-Messung `hills` nicht gefahren; `flooded` 40 Figuren: `landed` 11998 in 100 s |
| VORHER 48905 Nachrichten = 1630,2/s, 142,65 KB/s je Client (30 s, flooded, 40 Figuren) | **BESTÄTIGT, exakt auf die Nachkommastelle** | eigene Messung identisch |
| VORHER/NACHHER 57309 = 573,1/s, 46,38 KB/s (100 s) | **BESTÄTIGT, exakt** | dito |
| „**kein einziges zustandstragendes Ereignis** ist verloren gegangen"; §6.2 „Zustandsereignisse VORHER 46893, NACHHER 46893 — IDENTISCH"; §6.3 „**jede** zustandstragende Art steht auf `unterdrueckt=0`" | **WIDERLEGT gegen den heutigen Code** | Der Bericht beschreibt den Stand NACH der ersten Änderung. Heute sind `damage`, `entity_in_water`, `drowning` gedrosselt: gemessen **45276 Zustandsmeldungen → 1548** (−96,6 %), je Art 15092 → 516, `unterdrueckt` 14576 je Art. Die drei Sätze sind heute falsch |
| §8 „Die Wassertypen bleiben ungedrosselt (Auflage des Auftrags)" | **WIDERLEGT** | `protocol.js:793–794`: `entity_in_water`, `drowning` stehen in `GEDROSSELTE_EREIGNISARTEN` |
| §9 „Dieselbe Drossel … **nicht ohne Auftrag**" | **ÜBERHOLT** | Genau diese Drossel ist gebaut. Der Bericht nennt sie einen Vorschlag („B: Vorschlag … 3991 = 39,9/s, **2,46 KB/s**") — meine Messung reproduziert die Zahl exakt, der Vorschlag ist ausgeführt, der Bericht aber nicht nachgezogen |
| §9-Sorge „würde die Höhe jedes einzelnen Schadenswerts … verschlucken" | **WIDERLEGT** | `damage.remaining` ist in 15092/15092 mit der Snapshot-Gesundheit identisch, `amount` in 15084/15092 die Takt-Differenz (`protocol.js:726–728`) |
| Fensterbegründung: Störung alle 7 Takte, echter Vorgang 50 Takte | **BESTÄTIGT (Nachmessung des Berichts)** | eigene Zählung `landed` 11998 Erzeugungen → 2408 gesendet im Fenster; die 7-Takt-Periode selbst nicht neu gemessen (NICHT GEPRÜFT) |

### 6.3 `docs/testgrenzen.md`

| Behauptung | Ergebnis | Beleg (gezählt am 27.09.) |
|---|---|---|
| „Quellcode 35.955 Zeilen" | **WIDERLEGT (veraltet)** | `find src -name '*.js' \| xargs wc -l` → **39.902** |
| „Tests 32.684 Zeilen" | **WIDERLEGT (veraltet)** | `tests/` → **39.139** |
| „Unit-Tests 974 (93 Dateien)" | **WIDERLEGT (veraltet)** | **107** Dateien, **1116** `test(`/`it(`-Aufrufe; der Repo-Commit `a49e805` nennt selbst „1075 → 1122" |
| „E2E-Tests 191 (30 Dateien)" | Dateien **BESTÄTIGT**, Zahl **nicht prüfbar mit meiner Zählung** | 30 `tests/e2e/*.spec.mjs`; `grep -c '^\s*test('` ergibt **189** (Differenz vermutlich durch meine Regex — nicht zu Lasten des Berichts) |
| „Werkzeuge 37 Skripte (22)" | **WIDERLEGT (oder andere Definition)** | `scripts/` hat **51** Dateien; `package.json` hat ~50 Skript-Einträge |
| „Unit-Laufzeit 4,7 min / E2E 25,2 min / 9,4 min" | **NICHT PRÜFBAR** | Laufzeiten nicht gemessen (Testläufe verboten) |
| „Es gibt keine Bot-KI" | **BESTÄTIGT** | `gameServer.js:340–357`, kein Bot-Import `:19–22` |
| „Online-Tests brauchen zwei Menschen (`tests/e2e/helfer/zweiter-mensch.mjs`)" | **BESTÄTIGT** | Datei vorhanden |
| §2 Grenze 1 nennt „9,4 Minuten je vollem Lauf", die Tabelle darüber „25,2 min (9,4 min)" | **Selbstwiderspruch im Dokument** | derselbe Wert einmal als aktuell, einmal als „vorher" |

**Muster über alle drei Berichte:** Die **Messzahlen** sind erstaunlich belastbar — drei zentrale
Zahlen (142,65 KB/s; 47719/42,29 KB/s; 3991/2,46 KB/s; 15066/15092; 15092 gesendet→516) wurden von
meinem unabhängigen Aufbau **auf die Nachkommastelle** reproduziert. Die **Aussagen über den
aktuellen Code** sind es nicht: „keine Zustandsart verloren", „Wassertypen bleiben ungedrosselt",
Zeilennummern, Test-/Zeilen-/Skriptzahlen sind Stand 20.09. bzw. 06:37 und wurden nach der zweiten
Änderung (08:47) nicht nachgezogen.

---

## 7. Befunde

### A — stiller Fehler oder falsche Anzeige

**A1 — Online-Vorhersage rechnet ohne den Sidegrad (bis 335 px Fehlanzeige).**
Beleg: `main.js:1607` liest `eigene.sidegradeId`; auf der Leitung existiert das Feld nicht
(`protocol.js:280–322` Spielerblock; `gameServer.js:704–711` `LOADOUTS`).
Messwert: `launchSpeedMultiplier` ohne Sidegrad = 0,7409 gegenüber 0,6298…0,8891 mit Sidegrad
(`launchSpeed.js:58–69`, Klassen-/Sidegrad-Tabelle `sidegrades.js:69–112`). Bahnlänge gemessen
(`/tmp/pa-audit`, `predictTrajectory`, 45°, Kraft 100, Karte 2560 px):

```
scout     online 522 px | kompakt 643 px (+23,2 %) | schwerlast 436 px (−16,4 %)
heavy     online 803 px | kompakt 1024 px (+222 px) | schwerlast 655 px (−147 px)
artillery online 1144 px| kompakt 1479 px (+335 px) | schwerlast 914 px (−229 px)
```

Folge: Wer mit Sidegrad spielt, sieht eine falsche Flugbahn — obwohl der Kommentar an der
Fundstelle genau das behauptet zu verhindern. Fix (klein): `sidegradeId` in die `LOADOUTS`-Tabelle
aufnehmen (`gameServer.js:704–711`, aus `this.match.sidegrades[seat]`) und in
`onlineViewState` (`main.js:1177`) durchreichen.

**A2 — Mahlstrom-Schwelle doppelt, im Client mit dem ALTEN Wert 15.**
Beleg: Motor `match.js:2722` liest `MATCH_RULES.suddenDeath.roundBreakpoint` = **8**
(`config/match.js`, eigene Ausgabe der Konfiguration); Client `main.js:1194` hart `>= 15`.
`renderer.js:1117` steigt bei `!maelstrom.active` sofort aus. Folge: **online ist der Mahlstrom
7 Runden lang unsichtbar**, obwohl er ab Runde 8 Gelände frisst und Schaden macht (`match.js:2723`,
`maelstromSystem.js:69`). Lokal stimmt es (`stateSnapshot.js:175–178` liefert `active` aus dem Motor).
Fix: `maelstrom.active` aus einem Ereignis/einem Snapshot-Feld beziehen (das Ereignis
`maelstrom_contract` kennt den Moment des ersten Schnitts) statt aus einer zweiten, veralteten Zahl.

**A3 — Höchstleben online hart 100; jeder Balken einer Klasse ist falsch.**
Beleg: `main.js:1168 maxHealth: 100`; Motor: `match.js:1050` `baseHealth (100) × profile.healthMultiplier`
(`BASE_HEALTH = 100` ausgemessen). Messwerte: scout **96**, heavy **108**…**156**, artillery **108**
(`combatProfile`). `hud.js:365` und `renderer.js:795` rechnen `health / maxHealth` **ohne Obergrenze**
→ ein schwerer Treffer sieht bei voller Gesundheit wie 156 % Balken aus, ein Scout wie beschädigt
(96 %). Fix: `maxHealth` aus `classId`/`archetypeId` (+ Sidegrad, siehe A1) im Client berechnen —
die Daten sind mit `LOADOUTS` schon da (`gameServer.js:709–710`).

**A4 — Nach einem Serverneustart steht die Partie auf einer ANDEREN Karte.**
Beleg: `lobby.seed` bleibt `undefined`, wenn kein Seed eingegeben wurde (gemessen: interner
`lobby.seed = undefined`, Menü-Standard `main.js:390–391`); `persistence.js:112` schreibt
`seed: lobby.seed` → `JSON.stringify` lässt `undefined` **weg** (gemessen: kein `"seed":`-Schlüssel);
`restoreLobby` `persistence.js:145–152` reicht `saved.seed` (undefined) weiter;
`gameServer.js:136–137` → `LobbySession` → `MatchController({seed: undefined})` →
`match.js:564–566 MatchSeedManager.createRandom()` (neuer Zufalls-Seed). Der Replay-Kopf trägt den
echten Seed (`saved.replay.seed`, gemessen 3367130477) — **er wird für den MatchController nicht
benutzt**.
Messwert (`/tmp/pa-audit/neustart2.mjs`, Fall A):
```
baseSeed vorher 3367130477 → nachher 1341271627 (ungleich)
Zustandshash vorher 98aad2e2 → nachher e6da56da (ungleich)
```
Fix: in `restoreLobby` `seed: saved.seed ?? saved.replay?.seed` übergeben (eine Zeile) und
`saved.seed` beim Speichern mitschreiben.

**A5 — Der Wiederaufbau läuft einen Takt zu weit; der Kommentar „exakt derselbe Zustand" ist falsch.**
Beleg: `gameServer.js:167` `limit = Math.max(totalTicks, …)+1` bei Schleifenbedingung
`tickCount < limit` (`:169`) → ein Schritt über den gesicherten Tick hinaus. Der Kommentar
`gameServer.js:134–135` behauptet das Gegenteil.
Messwert (Kontrollfall MIT Seed 20260910, damit nur dieser Effekt bleibt):
```
Takte vorher 420 → nachher 421
y aller vier Figuren je 792,82 → 784,0 (8 px tiefer)
turnElapsedMs 5250,0 → 5266,7 | Zustandshash 1e199a57 → d4248776
```
Fix: `limit = Math.max(totalTicks, …)` ohne `+1` — oder die Schleife auf `tickCount + 1 <= limit`
umstellen und den Zustand danach gegen den gesicherten Hash prüfen. **Der bessere Fix ist der
Vergleich selbst:** `toPersisted()` legt `hashState()` mit ab, `restoreState()` vergleicht und
`logger.warn` bei Abweichung — dann ist ein solcher Fehler nie wieder still.

**A6 — Der Zünder-Countdown ist online immer 0.**
Beleg: `renderer.js:820 const rest = projectile.fuseSeconds ?? 0;` — der Snapshot führt für
Projektile nur `entityId/x/y` (`protocol.js:324–329`), und `main.js:1196` reicht die Liste
unverändert durch. Lokal steht `fuseSeconds` im Zustand (`stateSnapshot.js:142`). Folge: Ring und
Sekundenzahl („◷ 2,4 s") erscheinen **nur lokal**; online sieht der Spieler nicht, wann eine liegende
Granate zündet — genau die Information, für die die Anzeige gebaut wurde. Fix: `fuseSeconds` (oder
`fuseTicks`) in den Projektilsatz des Snapshot aufnehmen; `PROJECTILE_STRIDE 6 → 8` und
`PROTOCOL_VERSION 8`.

**A7 — Eine Protokollversion-Abweichung ist ein schwarzer Bildschirm ohne Meldung.**
Beleg: `decodeSnapshot` `protocol.js:388` verwirft abweichende Versionen → `null` →
`networkClient.js:325 if (!snapshot) return;` (kein Zähler, kein Log, keine Meldung; `stats`
(`:230`) zählt nur Erfolge). Umgekehrt liest **niemand** das `v`-Feld der Steuernachrichten
(`controlMessage` schreibt es, `:552`; `parseControlMessage` `:984` gibt es weiter — kein Leser):
der Server führt Befehle einer Gegenstelle mit fremder Version aus. Und `message.protocol` aus
WELCOME wird nur weitergegeben (`networkClient.js:371`), nicht verglichen. Fix: beide Seiten
vergleichen `v` gegen `PROTOCOL_VERSION`; der Server antwortet bei Abweichung mit `CONTROL.ERROR`,
der Client zeigt „Server spricht Protokoll 8, diese Seite 7" statt still nichts zu tun. Zusätzlich
`#snapshotFehler` zählen und im HUD/`/healthz` sichtbar machen.

### B — unnötige Last oder ungedeckte Stelle

**B1** `isActiveTurn` (turnFlag) wird in jeden Takt jedes Spielers geschrieben (`protocol.js:316`)
und nirgends gelesen (`:434` ist der einzige Treffer im Repo). 1 B/Spieler = 4 % des gemessenen
99-Byte-Takts; die Information steckt redundantly in `activePlayerId`. → entfernen oder als
Anzeige benutzen.
**B2** `interpolatedFrom` (`gameServer.js:545`) errechnet und zurückgegeben, aber **nie gesendet**;
der Kommentar `gameServer.js:508` nennt es „eine Anzeige-Rückmeldung" — die Drahtantwort trägt es
nicht (auch der Testkommentar `tests/anti-cheat.test.js:394` sagt das ausdrücklich). Nur ein Test
liest es. → entweder senden oder Kommentar richtigstellen.
**B3** `crateType` gesendet (`protocol.js:335`), kein Leser in `src/client/` — eine Sprengfalle ist
online **und lokal** von einer Waffenkiste nicht zu unterscheiden (`renderer.js:687` färbt nur nach
`rarity`). Entweder anzeigen (Form) oder aus dem Snapshot nehmen.
**B4** Projektil-`entityId` gesendet, nie gelesen (2 B/Projektil).
**B5** `emptySince` (`gameServer.js:154`, gesetzt `:453`) wird **nie gelesen**; `session.stop()`
`:1429` beendet nur die Tick-Schleife, die Sitzung (Match + Terrain) bleibt in `#sessions`, und
`/healthz` meldet nur verwaiste Sitzungen **ohne Lobby** (`:1033`). Eine verlassene Partie bleibt
also vollständig im Speicher, ohne als verwaist zu gelten.
**B6** `#readBody` kappt bei 8192 Zeichen (`gameServer.js:1130`) → ungültiges JSON → `catch`
`:1135 resolve({})` → Lobby mit Vorgabewerten, **ohne Meldung**. Ein Aufrufer, der zu viel schickt,
bekommt eine andere Partie als bestellt.
**B7** Kommentar `protocol.js:471–473` („Ein halber Snapshot ist besser als ein Absturz, und die
Prüfung darüber erkennt ihn ohnehin") — eine solche Prüfung existiert nicht: der Spielerabschnitt
bricht mit `return null` ab (`:415`), Kisten/Geschütze/Haufen brechen still ab, niemand zählt es.

### C — Ordnung

**C1** `hashState` liest `t.rounds` (`stateSnapshot.js:269`), der Zustand führt `roundsLeft`
(`:196`; der Name `rounds` existiert nur in der Ereignisnutzlast `match.js:1897`). Der Wert ist
**immer `null`** ⇒ die Restrunden der Geschütze sind im Determinismus-Beweis unsichtbar.
**C2** `hashState` liest `c.weaponId` (`stateSnapshot.js:287`), die Ansicht führt es nicht
(`:151–157`) ⇒ immer `null`. Der Kommentar darüber sagt, der Fund sei behoben; behoben wurden nur
die übrigen Felder. Der **Inhalt** einer Kiste mit gleicher Seltenheit ist damit nicht im Hash.
**C3** `maxRounds: 30` hart in `main.js:1186` (zweite Kopie der Rundengrenze).
**C4** `#trackWater` schreibt online `P1/P2` statt Spielernamen (`main.js:1163` setzt `label` aus dem
Listenindex), während die Ereigniswirkungen `k.nameOf` benutzen — zwei Namensquellen nebeneinander.
**C5** Die ausführliche Messwerkzeug-Dokumentation in `protocol.js` nennt Zahlen, die zu
`docs/ereigniskanal-filter.md` §9 auf unterschiedlicher Bezugsgröße beruhen (mit/ohne 30 Byte
Rahmenzuschlag). Beide sind für sich richtig; nebeneinander gelesen wirken sie wie Widerspruch.
Ein Satz „mit Rahmenzuschlag" / „ohne" würde das erledigen.

---

## 8. Getrennt: BESTÄTIGT / VERDACHT / WIDERLEGT

**BESTÄTIGT (mit eigener Messung)**
- Der Filter sitzt hinter `consumeEvents()` und kann die Simulation nicht berühren
  (`gameServer.js:299–306`; Protokoll-Zahlen reproduziert).
- `damage.remaining` == Snapshot-Gesundheit: **15092/15092**; `entity_in_water.level` ==
  Snapshot-Wasserstand: **15066/15092**, Abweichungen ausschließlich Sterbetakte (26, davon 0 am Leben).
- `drowning` trägt nichts, was `entity_in_water` nicht trägt (identische Nutzlastfelder `entityId, level`).
- Jede gedrosselte Art hat ein Kennungsfeld; **keine** Meldung fällt in den leeren Schlüssel `''`
  (gemessen: 0).
- Drosselfenster 30 < echte Flugphase 50; die Drossel verschluckt keine echte Landung
  (`landed` 11998 → 2408 im Fenster, ohne Totalverlust).
- Kanalzahlen der Berichte: 142,65 KB/s / 48905 (30 s) und 46,38 KB/s / 57309 (100 s) —
  **auf die Nachkommastelle reproduziert**; 88,9 % Anteil der drei Zustandsarten — exakt.
- Abbruch mitten im Match ist sauber abgesichert (`Math.min(250, elapsed)`, `gameServer.js:271`).
- Abgelehnter Schuss ist laut: Server `ERROR` (`gameServer.js:1347`), Client verwirft Vorhersage
  (`main.js:1055`).
- Identität kommt aus dem Token, nie aus der Nachricht (`gameServer.js:486`, `:519`).
- Kein `Math.random`/`Date.now` im Simulationspfad außer `replay.js:85` (Metadatum).

**VERDACHT (belegt, aber nicht abschließend gemessen)**
- B5: verlassene Sitzungen sammeln sich im Speicher (Codeweg belegt, Menge nicht gemessen).
- A3b: `maxRounds: 30` könnte ebenfalls vom Motor abweichen (Motorwert aus `MATCH_RULES` gelesen:
  `maxRounds` liegt dort **nicht**, der Wert kommt aus `match.js`-Vorgabe — nicht abschließend geklärt).
- A7: Häufigkeit einer Versionsabweichung im Betrieb (kein Messwert, weil beide Seiten im Repo gleich sind).
- `dot_tick`/`toxic_rain` je Takt ungedrosselt: Muster erkannt, Aufkommen bei 40 Figuren nicht gemessen.

**WIDERLEGT**
- „`jumped` ist gedrosselt und der Doppelsprung kommt nur 3 von 61 Malen durch" — **gilt heute nicht
  mehr**: `jumped` steht nicht in `GEDROSSELTE_EREIGNISARTEN` (`protocol.js:787–795`, geprüft per
  Import). Der Fund war richtig, ist aber behoben.
- „Kein einziges zustandstragendes Ereignis geht verloren" (`docs/ereigniskanal-filter.md`,
  §6.2/§6.3) — heute 45276 → 1548 Zustandsmeldungen (96,6 % unterdrückt).
- „Die Wassertypen bleiben ungedrosselt" (ebd. §8) — beide stehen heute in der Drosselliste.
- „§9: nicht ohne Auftrag" (ebd.) — genau diese Drossel ist gebaut; der Bericht ist nicht nachgezogen.
- „Die Simulation ist deterministisch, deshalb entsteht **exakt derselbe Zustand**"
  (`gameServer.js:134–135`) — gemessen: Takte 420 → 421, Positionen 8 px verschoben, Hash ungleich.
- „`der Tick füllt nur `interpolatedFrom` in der Antwort — eine Anzeige-Rückmeldung" — die Antwort
  trägt das Feld nicht.
- „Ein abgeschnittener Puffer … die Prüfung darüber erkennt ihn ohnehin" — es gibt keine Prüfung.
- Test-/Zeilen-/Skriptzahlen in `docs/testgrenzen.md` (974 Tests/93 Dateien/35.955 Zeilen/37 Skripte)
  — gezählt: 1116 Aufrufe/107 Dateien/39.902/51.
- „`projectile_expired` ist ein Ereignis ohne Empfänger, das nirgends begründet ist" (**mein eigener
  Fehlalarm**) — die Begründung steht in `tests/event-coverage.test.js:192ff` (`bewusstStumm`:
  „ein verfallenes Geschoss ist kein Ereignis für den Spieler — es hat nichts getroffen"). Der Befund
  B9 ist damit hinfällig und wurde aus §7 entfernt. Ursache des Fehlalarms: ich habe die
  Zweig-Tabelle (`EREIGNIS_WIRKUNGEN`) geprüft, aber die „bewusst stumm"-Liste des Tests nicht
  mitgelesen — genau der Griff, den `docs/ereignis-info-gehalt.md` §2 vorführt.
- **Eigener Fehlalarm, ausdrücklich:** Mein erster Redundanz-Lauf meldete „`damage.remaining` stimmt
  in 0 von 15092 Fällen". Ursache war die **Sonde**: sie las `payload.playerId`, das Feld heißt
  `entityId` (`damageSystem.js:104`). Nach der Korrektur: 15092/15092. Ebenso der zweite
  Restore-Lauf: der erste verglich einen Zustand, dessen Eingabe ich gar nicht aufgezeichnet hatte
  (ich rief `match.fire` direkt statt `handleInput`) — der scheinbare Determinismus-Bruch war ein
  Sonde-Fehler; erst nach `handleInput` (`ok=true`, 1 Eingabe in der Sicherung) blieb der Taktversatz
  als echter Befund übrig.

---

## 9. Die drei Stellen, an denen Information am ehesten unbemerkt verlorengeht

1. **Der Sidegrad erreicht den Client nie (A1).** Er ist der einzige Wert, der die Rechnung des
   Spielers messbar verschiebt (bis 335 px gemessene Bahnlänge, 20 % Geschwindigkeit) und der
   **nirgends** übertragen wird — weder im Snapshot noch in `LOADOUTS` noch in den Willkommensdaten.
   Der Leser existiert bereits (`main.js:1607`), es fehlt nur die Sendestelle.
   *Fix:* eine Zeile in `gameServer.js:704–711` (`sidegradeId: this.match.sidegrades?.[i]`) plus die
   Durchreiche in `onlineViewState`; Regressionstest: Vorhersage mit `kompakt` muss 23 % weiter
   reichen als ohne.
2. **Die Wiederherstellung prüft sich selbst nicht (A4/A5).** Zwei Fehler in Folge (fehlender Seed,
   ein Takt zu weit) blieben beide unbemerkt, weil der Neuaufbau mit **nichts** verglichen wird. Die
   Sicherung trägt heute schon alles, was ein Vergleich bräuchte (`saved.replay.seed`).
   *Fix:* `hashState()` in `toPersisted()` mitschreiben, in `restoreState()` gegen den
   wiederhergestellten Zustand vergleichen und bei Abweichung `logger.warn` (nicht abbrechen) —
   plus `seed: saved.seed ?? saved.replay?.seed` in `persistence.js:150`.
3. **Der Snapshot-Ausfall hat keine Stimme (A7 + B7).** `decodeSnapshot → null` ist der einzige
   Datenpfad ohne Zähler und ohne Meldung: eine Versionsabweichung oder ein abgeschnittener Puffer
   führt zu einem Standbild, das wie ein hängender Server aussieht, und die Steuernachrichten fließen
   weiter. Selbstheilend ist hier nichts — es heilt erst ein Neustart mit passender Version.
   *Fix:* einen Zähler `snapshotsRejected` mit Grund (`version`/`magic`/`truncated`) in
   `#handleMessage` einführen, ihn im HUD („Datenrate 0 — Version 8 erwartet, 7 erhalten") und in
   `/healthz` zeigen; zusätzlich das `v`-Feld eingehender Steuernachrichten gegen `PROTOCOL_VERSION`
   prüfen (`parseControlMessage` liefert es bereits).

---

## 10. Nachweis der Arbeitsweise

- **Geändert wurde ausschließlich diese Datei.** Sonden liegen unter `/tmp/pa-audit/`
  (`kanal.mjs`, `redundanz.mjs`, `redundanz2.mjs`, `filter-messung.mjs`, `lang.mjs`, `groesse.mjs`,
  `neustart.mjs`, `neustart2.mjs`, `diff.mjs`). `src/**`, `tests/**`, `scripts/**` und andere
  `docs/**` wurden nicht angefasst; `src/engine/match.js` nur gelesen.
- Verbotene Befehle (`npm test`, `test:e2e`, `checks`, `build`) wurden nicht ausgeführt.
- Werkzeuge: `node --input-type=module -e` und die Sonden oben; keine Datei im Repo wurde zum Messen
  benötigt.
