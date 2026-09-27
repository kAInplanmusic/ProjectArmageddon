# Verkabelungs-Audit — was gebaut ist und nicht angeschlossen

**Datum:** 2026-09-27, 10:20–11:05 CEST
**git-Stand:** HEAD `2d365d3` („fix(gate): #drawLadeanzeige als Bildschirm eingeordnet — check:camera war rot"),
Arbeitsverzeichnis **schmutzig**: 34 geänderte/ungetrackte Einträge zum Messzeitpunkt.
**Umfang:** `src/` — 92 `.js`-Dateien, 42.607 Zeilen. Gelesen: alle Dateien unter
`src/client/`, `src/server/`, `src/shared/config/`, `src/engine/` (kleinere Dateien ganz,
die vier großen `match.js`/`main.js`/`gameServer.js`/`renderer.js` in den verdrahtungs-
relevanten Teilen). `tests/` und `scripts/` wurden **nur** als Importeure/Konsumenten
ausgewertet, nicht ausgeführt.

## Warnung: das Ziel bewegt sich

**Sieben andere Arbeiter haben während dieses Audits in `src/` geschrieben.** Jede
Zeilennummer ist ein Stand von ~10:45. Belegte Folge:

* `#drawParticles` (`renderer.js`) stand um **10:38** noch in meiner A-Liste („definiert,
  nirgends gerufen") — um **10:52** trägt die Datei den Kommentar „FUND (belegt, dieser
  Zug): `#drawParticles` war definiert und wurde nie gerufen" und ruft es
  (`renderer.js:1674`). Fall während des Audits **geschlossen**.
* `pruneDisconnected`/`startPruning`/`stopPruning`/`markFinished` waren zum Start des
  Audits teils ungerufen; um 10:47 ist `pruneDisconnected` über
  `GameServer#pruneLobbies` verdrahtet (`gameServer.js:1213`, `:1935`).
* Neu entstanden und **sofort unverdrahtet** in der A-Liste:
  `luftsprungeSeitBoden` (`characterSystem.js:96`).
* Umbenennungen verschoben Definitionen um bis zu 150 Zeilen
  (`match.js` `clearCooldowns` 2361 → 2376).

Wer diesen Bericht nach 11:05 liest, muss die Zeilennummern nachziehen — die **Aussagen**
wurden zweimal unabhängig geprüft (eigener Scanner + `grep` über `src/`, `tests/`,
`scripts/`, `tools/`, `index.html`), die Zeilen sind flüchtig.

**Nachprüfung 11:07** (nach dem letzten Schreibzugriff der anderen Arbeiter): die
Hauptbefunde P1–P3, C-1, C-2 und G2 wurden erneut gegengelesen und erneut gemessen —
unverändert. Die Terrain-Sonde wurde zweimal ausgeführt (10:38 und 11:07), beide Male
**34,0 %** abweichende Zellen. Zeilennummern der Hauptbefunde nachgezogen:
`terrainPreview.js:13/25`, `networkClient.js:163`, `main.js:1031` (kartentyp),
`main.js:1151` (`#buildRemoteTerrain`), `main.js:1211-1214` (dots/boost),
`main.js:1299` (`maxRounds: 30`), `hud.js:377/378`, `stateSnapshot.js:269` (`t.rounds`).

## Was NICHT geprüft wurde

* **Keine** Tests, kein Lint, kein Build, kein E2E-Lauf (Auftrag). Es gibt daher **keine**
  Laufzeitaussage außer der einen ausdrücklich gestarteten Sonde (Terrain, §Pipelines 3).
* **Nicht** geprüft: CSS, `index.html`-Gestaltung (nur Element-IDs und Zuhoerer),
  `dist/`, `tools/audit-mcp/**` (nur als Belegquelle gelesen), `uploaded/`, `artifacts/`.
* **JSON-Dateien** (`src/shared/data/*.json`, `project_armageddon_weapons_v1.json`) sind
  für meinen Scanner unsichtbar (Filter `.js`/`.mjs`). Zur Laufzeit liest sie niemand:
  `src/shared/data/index.js` ist code-leer („Intentionally empty", dort begründet),
  der Katalog kommt aus dem generierten `src/shared/config/weapons.js`.
* **Bundellage**: `src/client/index.js`, `src/engine/index.js`, `src/server/index.js`,
  `src/shared/index.js` sind für die *Anwendung* toter Code — sie werden nur von
  `npm run validate` (package.json) und Tests geladen. Ihre Re-Exporte sind deshalb
  einzeln bewertet, nicht als „verdrahtet".

## Werkzeuge und ihre belegten Grenzen

Eigene Sonden in `/tmp/verkabelung/` (nur lesend). Zwei Blindheiten wurden **im Lauf
gefunden und behoben**, jede hätte Phantom-Befunde erzeugt:

1. **Blockkommentare verschoben die Zeilennummern** (erster Reduzierer ersetzte einen
   Kommentar durch *ein* Leerzeichen). Behoben: längengleiche Reduktion — jeder entfernte
   Zeichenbereich wird durch Leerzeichen ersetzt, Zeilenumbrüche bleiben stehen.
   Selbstprobe: **0 Abweichungen** über alle 92 Dateien (`kern.py --selbst`).
2. **Code in `${…}`-Ausdrücken galt als Zeichenkette.** `beschreibeWert(art, wert)`
   (`main.js:566`) und `fensterKennung(nutzlast)` (`protocol.js:958`) waren damit
   scheinbar ungerufen. Behoben: Template-Literale werden zerlegt, `${…}` bleibt **Code**.
3. **`export … from`-Kanten fehlten** — dieselbe Klasse wie die im Auftrag genannte
   Mehrzeilen-Blindheit. Vorher: 13 „Dateien ohne Importeur", nachher **6**
   (4 Barrels, `data/index.js`, `main.js`). Die 7 Differenz waren Phantom-Verletzungen.
4. Rufstellen werden mit Wortgrenze gezählt (`\bname\s*(`), damit `this.#foo(` zählt.
   Ein Zwischenstand zählte `obj.methode(` nicht — 98 statt 22 A-Funde. Jeder der 22
   Endfunde wurde zusätzlich mit `grep` gegengeprüft.

**Grenze meiner Werkzeuge, offen benannt:** die automatische Parameterprüfung (E) ist
**ungenau** — sie meldete u. a. `hud.setConnection(state, latencyMs)` als „latencyMs
ungenutzt", obwohl die Zeile in `hud.js:224` steht. Alle E-Befunde dieses Berichts sind
deshalb von Hand nachgelesen; die falsch-positiven Kandidaten sind in §E aufgeführt,
damit der Nächste sie nicht erneut prüft.

---

# A) Definiert und nie gerufen

Zählung: Aufrufe in `src/` (ohne Definitionszeile, mit Wortgrenze) **und** in
`tests/`+`scripts/`+`tools/`+`index.html`. Steht hier ein Eintrag, wurde er aus allen vier
Orten **verifiziert**.

| Gegenstand | Fundstelle (10:47) | wer sollte es rufen | Urteil |
|---|---|---|---|
| `ProjectilePool#acquire` / `#release` | `src/engine/pooling/projectilePool.js:20`, `:36` | `ProjectileSystem` (Projektile wiederverwenden) | **Ordnung**: ganzes Modul tot — nur über das Barrel `engine/index.js` erreichbar, das nur `npm run validate` lädt. Das System erzeugt Projektil-Entities direkt. |
| `TurnSystem#addListener` / `#removeListener` | `src/engine/systems/turnSystem.js:113`, `:117` | niemand | **Ordnung**: die halbe Abo-Mechanik des Systems ist tot (vgl. §H EventBus). |
| `GuentherSystem#auftritteInRunde` | `src/engine/systems/guentherSystem.js:121` | `MatchController#stepGuenther` | **Verdacht**: Auftrittsplan je Runde ist berechnet, aber niemand fragt ihn — Günthers Plan wird über `#planeAuftritte`/`#betrete` anders entschieden. Doppelter Weg. |
| `StatusStore#clearFreeze` | `src/engine/specials.js:494` | `advanceTurn`/Zugbeginn (`#tickCooldowns`-Analogon) | **Verdacht**: Einfrieren läuft offenbar nur über Zähler-Dekrement ab; ein Aufräumpfad fehlt (kein Aufrufer, kein Test). |
| `ComponentStore#countEntitiesBySignature`, `#getSignature`, `EntityManager#getEntitiesWithComponent`, `World#stepN` | `componentStore.js:257`/`:229`, `entityManager.js:95`, `world.js:206` | ECS-Konsumenten | **Ordnung**: ECS-API ohne Konsumenten (kein Test liest sie). |
| `TerrainSync#syncToCanvas`, `static createDefault` | `src/engine/terrain/terrainSync.js:25`, `:60` | Client-Anzeige (Zerstörung nachziehen) | **Verdacht**: das Modul spiegelt `CollisionMask`+`punchCrater`+`markClean` — die App tut das über `renderer.applyCrater` (`ereignisse.js:193`) und `CollisionMask` direkt (`match.js:864`). Zweite Umsetzung derselben Sache, unverdrahtet. |
| `EreignisSendefilter#drosselt` | `src/shared/protocol.js:927` | Anzeige/Diagnose („ist diese Art gedrosselt?") | **Ordnung**: die Auskunft existiert, `zahlen()` (nur Skripte) ist der einzige Leser der Drosselzahlen. |
| `MatchController#fuseSecondsLeft` | `src/engine/match.js:2385` | Anzeige des Zünder-Countdowns | **Verdacht**: der Wert wird doppelt geführt — der Zustand liefert `fuseSeconds` je Projektil (`stateSnapshot.js:142`) und geht seit Protokoll v8 über die Leitung. Die Methode am Match ist der tote Zwilling. |
| `MatchController#resetTurnDuration` | `src/engine/match.js:2999` | Zugwechsel mit neuer Spielerzahl | **Verdacht**: Gegenstück zu `setTurnDuration` (nur Tests); niemand setzt die Dauer nach einem Platzverlust zurück. |
| `SoundMixer#setzeAn` | `src/client/soundMixer.js:71` | Menü/Client (Klang an/aus) | **Verdacht**: der Hauptschalter des Mischers hat keinen Aufrufer — es gibt **keinen** Weg, den Klang abzuschalten, obwohl der Mischer es kann. `setzeLautstaerke` (77) wird ebenfalls nur von Tests gerufen. |
| `Camera#setzeZoomZurueck` | `src/client/camera.js:154` | Client (Zoom-Reset) | **Ordnung**: kein Test, kein Aufrufer. |
| `GameServer#toPersisted` | `src/server/gameServer.js:269` | Persistenz | **Defekt-verdacht**: die „Momentaufnahme für die Persistenz" existiert **zweimal** — `serializeLobby` (`persistence.js:113-141`) enthält dieselbe Logik inline (`recorder.finalize`, `replay.toJSON()`, `tick`). Der Speicherpfad benutzt die Kopie in `persistence.js`, nicht diese Methode. |
| `LobbyManager#markFinished` | `src/server/lobby.js:497` | `GameServer` beim Match-Ende | **Ordnung**: kein Aufrufer — der Status wird inline gesetzt (`gameServer.js:439`: `this.lobby.status = LOBBY_STATUS.FINISHED`). Zweiter Weg, nicht benutzt. |
| `CharacterSystem#luftsprungeSeitBoden` | `src/engine/systems/characterSystem.js:96` | Sprunglogik | **Verdacht (neu, während des Audits entstanden)**: definiert, kein Aufrufer, kein Test. |
| `weapons.js#getWeaponsByCategory`, `#getWeaponsByRarity` | `src/shared/config/weapons.js:7245`, `:7249` | Werkzeuge/Anzeige | **Ordnung**: auch von keinem Skript gelesen (vgl. §G). |
| `EventBus#on`, `#off`, `#dispatch`, `#drain` | `src/engine/events.js:20`, `:29`, `:65`, `:74` | Konsumenten der Engine | **Ordnung**: in der App ruft niemand sie. Der Motor nutzt die Warteschlange (`match.js:3004 consumeEvents` → `#events.flush()`); `on/off/dispatch/drain` sind ein Abo-Nebenweg, den **nur Tests** (7 Dateien) benutzen. |
| `GameServer#getSession` | `src/server/gameServer.js:1261` | HTTP-/WS-Pfade | **halbtot**: 20 Aufrufe, **alle** in Tests — die „Zugangsmethode" ist ein Testhaken. |

**Zusätzlich: definiert, nur von Tests/Skripten gerufen** (Auszug, weil dieselbe
Baustelle): `clearCooldowns` (`match.js:2376`), `dotCount` (`specials.js:539`),
`isFrozen`/`isRevealed`/`shieldOf` (`specials.js:440/460/445`), `isUnlimited`
(`inventory.js:76`), `totalVolume` (`waterField.js:228`), `turretPath` (`match.js:2078`),
`fromString` (`seed.js:96`), `mapGroesseFuerSpieler` (`match.js:130`), `schirmZuKarte`
(`camera.js:252`), `verschiebe` (`camera.js:195`), `isWithinWindow`
(`lagCompensation.js:53` — **begründet**: die Serverseite prüft bewusst nur die
Betrugsgrenze, siehe Kommentar `gameServer.js` bei `#handleInput`).

---

# B) Gesendet und nie gelesen

## B1 Zustandstakt (Draht, `protocol.js`)

| Feld | wird gesendet von | wer sollte lesen | Urteil |
|---|---|---|---|
| **`crate.crateType`** | `protocol.js:230` (`CRATE_STRIDE` 8 Byte, Protokoll v5) | `Renderer#drawCrates` (`renderer.js:579-606`) | **Defekt**: der Renderer liest **nur** `crate.rarity` für die Farbe. Die ART der Kiste (Waffe / Nachschub / leer / **Sprengfalle**) ist auf der Leitung und im lokalen Zustand (`stateSnapshot.js:155`, `lootSystem.js:166`), wird aber **nirgends angezeigt** (`grep -rn crateType src/client` = 0 Treffer). Eine Sprengfalle sieht aus wie eine Waffenkiste. |
| `entity.isActiveTurn` (Turn-Flag, `protocol.js:479`) | `encodeSnapshot` Byte 10 | `Renderer`/`HUD` | **harmlos**: nur Tests lesen es (`tests/netcode.test.js:62`). Wer am Zug ist, kommt aus `activePlayerId` (`networkClient.js:256`). Ein Byte je Figur ohne Leser. |
| `turret.teamId` | `protocol.js:548` | `Renderer#drawTurrets` | verdrahtet (`renderer.js:701`, `:715`) — nur zur Abgrenzung genannt. |

## B2 Ansichtszustand (nicht Draht, beide Quellen)

| Feld | wird geschrieben von | Leser | Urteil |
|---|---|---|---|
| `terrainWidth`, `terrainHeight` | `main.js:1362/1363` (online), `stateSnapshot.js:198/199` (lokal) | **niemand** (1 Treffer je Name in `src/client` = die Schreibzeile) | **Ordnung**: tote Felder in beiden Zuständen. |
| `maxRounds` | `main.js:1299` (**Konstante 30**), `stateSnapshot.js:87` | **niemand**: `hud.js:241` zeigt nur `state.round`, `renderer.js` liest es nicht | **Ordnung + Doppelregel**: 30 im Client gegen den Vorgabewert 30 des Motors (`match.js:531`) — zwei Zahlen für dieselbe Sache, und der Client kann nicht erkennen, dass der Server etwas anderes eingestellt hat. |
| `projectile.owner` | `stateSnapshot.js:138` | niemand | **Ordnung**. |
| `turret.ownerId`, `turret.damage`, `turret.range` | `stateSnapshot.js:191-196` | niemand (Anzeige liest `teamId`, `roundsLeft`) | **Ordnung** (nur lokal; der Draht führt sie bewusst nicht, `protocol.js:170-177`). |
| `state.scenery` | `stateSnapshot.js:205` | niemand — der Renderer bekommt die Kulisse über `setScenery` (`main.js:824` → `renderer.js:107`) | **Ordnung**: das Feld ist die dritte Kopie einer Angabe. |

## B3 Ereigniskanal

| Feld | Quelle | Leser | Urteil |
|---|---|---|---|
| `damage.attackerId` | `damageSystem.js:103` | 0 Leser | **harmlos und ausdrücklich dokumentiert** — die Bedingung, unter der das gilt, steht in `protocol.js` („VORBEHALT ZU `damage`"). |
| `projectile_spawn.x/y/vx/vy`, `weaponId` | `shooting.js:344` | Online-Zweig löst nur die Vorhersage auf (`ereignisse.js:340`) | **harmlos**: die echte Bahn kommt aus dem Snapshot (`projectile_spawn`-Kommentar dort). |
| `hitscan.weaponId`, `special_effect.amount` | `shooting.js:239`, `:228` | niemand | **harmlos**: Doppelangaben zur Ereignisart. |
| `round_crates.spawned`, `turn_end.next`, `water_pushed.waterBefore/After/cellsFlooded` | `lootSystem.js:181`, `match.js:2699`, `:2485` | 0 Leser **in beiden Betriebsarten** | **harmlos, weil die ganze Art stumm ist** (vgl. §F) — die Nutzlast ist damit doppelt tot. |

---

# C) Gelesen und nie gesendet

Der gefährliche Fall. **Zwei belegte Treffer**, dazu zwei geprüfte Verdachtsfälle, die
sich als in Ordnung erwiesen.

| Lesestelle | liest | die Leitung führt | Urteil |
|---|---|---|---|
| `src/engine/stateSnapshot.js:269` (`hashState`) | `t.rounds` für jedes Geschütz | **`roundsLeft`** — der Zustand baut Geschütze als `{entityId, teamId, ownerId, x, y, damage, range, roundsLeft}` (`stateSnapshot.js:188-197`) | **Defekt**: `t.rounds` ist **immer `null`**. Der Determinismus-Hash sieht die Restrunden der Geschütze nicht — zwei Zustände, die sich nur darin unterscheiden, haben denselben Hash. Beleg direkt daneben: die Zeile `c.weaponId ?? null` (`:287`) hat exakt diese Klasse und trägt den Kommentar „FUND (belegt, im Test)" — die Turret-Zeile wurde damals **nicht** mitgeprüft. |
| `src/client/hud.js:377`, `:378` | `state.statuses[id].dots.length`, `state.statuses[id].boostMultiplier` | **online nichts**: `main.js:1211-1214` baut `statuses[id]` fest als ``{shield, frozenTurns, dots: [], boostMultiplier: 1}`` | **Defekt**: die Marken „☠ N" (Schaden über Zeit) und „↑" (Schadensbonus) können **online nie** erscheinen, weil die Werte im Ansichtszustand Konstanten sind. Lokal stimmen sie (`statuses: quelle.statuses`, `stateSnapshot.js:174` mit `StatusStore#snapshot`). Der Snapshot überträgt nur `shield`, `frozenTurns`, `waterLevel` (Protokoll v3/v4) — `dots`/`boostMultiplier` fehlen und sind im Client durch Platzhalter „aufgefüllt". |
| `src/client/ereignisse.js:655` (crate_pickup, lokal) | `k.match?.players` | nur lokal (`match: this.match` ist online `null` — begründet und kommentiert) | **in Ordnung** (der Zweig ist ausdrücklich `lokal:`). |
| `src/client/main.js:2267` | `shotPredictor.pending?.trajectory` | `ShotPredictor#pending` (Getter) | **in Ordnung**. |
| `ergebnis.jumpsLeft` | `main.js:848`-Kommentar | bewusst `null` (`SPRUENGE_UNBEGRENZT`) | **in Ordnung**, ausdrücklich begründet. |

---

# D) Exportiert und nie importiert

Zwei Stufen, beide gezählt (Importeure in `src/` **und** in `tests/`+`scripts/`).

## D1 Ohne jeden Importeur im Baum — 24 Stück

* `src/client/index.js` :: `createClientRuntime` · `src/engine/index.js` ::
  `computeLinearDragPosition`, `isWasmSupported` · `src/server/index.js` ::
  `DEFAULT_HISTORY_MS`, `normalizeInput`, `registerDefaultComponents`
  → **Barrel-Re-Exporte**, deren Namen sonst niemand liest
  (`normalizeInput`/`registerDefaultComponents` werden *intern* benutzt — geprüft,
  kein Fehler).
* `src/client/terrainBaker.js` :: `renderGroundOnGpu` — der WebGPU-Bodenpfad, von
  niemandem gerufen (die Klasse benutzt `fillGroundPixels`/`renderGroundOnGpu` intern?
  Nein: **0 Treffer** außerhalb der Definition) → **Verdacht**.
* `src/engine/shooting.js` :: `applySelfEffect`, `fuseTicksFor`, `resolveStrike` —
  werden **im Modul selbst** benutzt (geprüft), der Export ist nur für Tests nötig.
* `src/server/lobby.js` :: `MAX_PLAYERS_PER_TEAM` — intern gelesen (`lobby.js:147`), Export ohne Abnehmer.
* `src/shared/config/weapons.js` :: `FUSE_SPECIALS`, `STRIKE_FROM_FLANK`, `STRIKE_FROM_SKY`,
  `WEAPON_CATALOG_VERSION`, `WEAPON_RARITIES`, `getWeaponsByCategory`, `getWeaponsByRarity`,
  `isReserveWeapon`, `subcategoryLabel` — **auch kein Skript liest sie** (vgl. §G).
* `src/shared/identity.js` :: `GERAETE_SCHLUESSEL` · `src/shared/prng.js` :: `PRNG` ·
  `src/shared/validation.js` :: `isValidAngle`, `isValidPower` (intern benutzt).

## D2 Von der Anwendung nicht erreichbar — 11 Dateien

Breadth-first vom Einstieg (`client/main.js`, `server/gameServer.js`) über alle
`import`- **und** `export … from`-Kanten: **81 von 92** Dateien sind erreichbar. Nicht
erreichbar:

```
src/client/index.js            src/engine/index.js          src/server/index.js
src/shared/index.js            src/shared/data/index.js     src/engine/headless.js
src/engine/physics/ballisticsWasm.js   src/engine/pooling/projectilePool.js
src/engine/terrain/terrainLoader.js    src/engine/terrain/terrainSync.js
src/shared/config/rules.js
```

Für die vier Barrels und `data/index.js` ist das **Absicht** (Kommentare + `package.json`
`validate`) und in `tests/no-dead-code.test.js:112-128` als Ausnahmeliste festgehalten.
Bemerkenswert sind die anderen sechs: `headless` und `terrainLoader` sind Testwerkzeuge,
`ballisticsWasm`, `projectilePool`, `terrainSync` sind **tote Umsetzungen** (A), und
`rules.js` ist ein Regelkatalog, den die Anwendung **nie liest** (§G).

## D3 Nur Tests/Skripte lesen sie — 167 Exporte in 44 Dateien

Verteilung (oben die dicksten): `protocol.js` 15, `client/gefuehl.js` 13,
`config/weapons.js` 13, `achievements.js` 10, `terrainBaker.js` 9, `config/factions.js` 8,
`config/scenery.js` 7, `identity.js` 7, `server/index.js` 6, `config/sidegrades.js` 6,
`shotPrediction.js` 5, `match.js` 5, `config/backdrops.js` 5, `reichweite.js` 5 …
**Einordnung:** die meisten sind *modul-interne Konstanten* oder *Zugriffsfunktionen*,
die die Anwendung über einen anderen Namen liest (`sidegradesForClass` statt `SIDEGRADES`,
`materialAmPunkt` statt `TERRAIN_MATERIALS`) — also halbtot, aber nicht kaputt. Wirklich
verwaist sind davon die Werkzeug-APIs (`hasFuse`, `identityFor`, `subcategoryFor`,
`speedFactorFor`, `hasSpecialEffect` — Konsument ist `scripts/build-weapon-catalog.mjs`
bzw. `check-*`).

---

# E) Parameter ohne Wirkung

**Ein belegter Fall:**

| Fundstelle | Parameter | Warum wirkungslos | Urteil |
|---|---|---|---|
| `src/client/main.js:962` | `onWeaponDrop`, `onJump` im Optionsobjekt von `hud.update` | `Hud#update(state, { aim = null, onWeaponSelect = null } = {})` (`hud.js:239`) **destrukturiert nur zwei Felder** — die anderen zwei werden nie gelesen. Nur der lokale Abwurfpfad übergibt sie; die Zeichenrunde (`main.js:2309`) übergibt sie nicht. | **Ordnung**: die HUD hat keine Abwerf-/Sprungknöpfe, also fehlt nichts — aber die Argumente suggerieren eine Anbindung, die es nicht gibt. Kleinster Fix: Argumente streichen oder in `update` lesen. |

**Geprüfte und verworfene Kandidaten meiner Sonde** (alle von Hand widerlegt — bitte nicht
erneut prüfen): `hud.setConnection(state, latencyMs)` (beide gelesen, `hud.js:218-231`),
`Hud#buildWeaponItem({… anzeigeNummer})` (`hud.js:533`, `:555`),
`beschreibeWert(art, wert)` (Aufruf in `main.js:566`),
`MatchController#clearCooldowns(playerId)` / `#cooldownFor` / `#tickCooldowns`
(`match.js:2376ff`), `assertFiniteInteger(value, name)` (`headless.js:10`),
`drawAmbient(…, imVordergrund)` (`sceneryPainter.js:321`),
`SceneryPainter#zeichneLandmarke` u. a. sowie die `update(_dt)`-Familie der Systeme
(**Vereinbarung**: `_`-Präfix heißt „bewusst unbenutzt").

**Der im Auftrag genannte Fall `documentRef` ist geschlossen**: der Parameter wird
gehalten und benutzt (`hud.js:184`, `:196`, `:198-204`), die Render-Methoden lesen
`this.#document`.

---

# F) Ereignis ohne Wirkung

Geprüft gegen **beide** Meldewege (`emit('…')` und Günthers `melde('…')`) und gegen den
Katalog `EREIGNIS_WIRKUNGEN` (`client/ereignisse.js:183`) sowie die Protokolllisten
(`ANZEIGE_EREIGNISARTEN`, `ZUSTANDSEREIGNISARTEN`, `GEDROSSELTE_EREIGNISARTEN`).

**Ergebnis (unabhängig nachgezählt):** 47 erzeugte Arten = **39 mit Wirkungszweig** +
**12 als „bewusst stumm" registriert** (`tests/event-coverage.test.js:192-232`).
**Keine undokumentierte Stille gefunden.** Jede der 12 Begründungen wurde gegen das
genannte Ersatzelement geprüft:

| stumme Art | Begründung im Register | mein Nachweis, dass sie trägt |
|---|---|---|
| `turn_start`, `turn_end` | Rundenanzeige/Zugwechsel | `hud.js:241` (Runde), Spielerfeld über `activePlayerId` |
| `entity_in_water`, `damage` | Wasserstand/Lebensbalken | `hud.js:383-392` (Wasserzeichen), `hud.js:302` (Balken aus dem Zustand) |
| `dot_applied` | Zustandsmarke am Namen | `hud.js:377` |
| `drowning` | `{}` in der Tabelle, gedrosselt | `main.js:1640 #trackWater` meldet den Übergang |
| `shot` | löst die Vorhersage auf | Zweig existiert (`ereignisse.js:330`) |
| `weapon_cooldown` | Waffenliste zeigt Nachladen | `hud.js:368` liest `cooldowns` |
| `crate_landed` | online übernimmt die Kistenliste | `snapshot.crates` → `main.js:1324` |
| `round_crates` | „Buchführung; die Anzahl steht im HUD" | Kistenliste/Kisten im Zustand (`hud.js`/`renderer.js:579`) |
| `projectile_expired` | „ein verfallenes Geschoss ist kein Ereignis" | Zeitablauf detoniert und erzeugt `explosion` (`projectileSystem.js:323`) — sichtbar; nur der Kartenrand-Abbruch bleibt stumm |
| `water_pushed` | „der Wasserstand am Ziel ist die sichtbare Wirkung" | Wasserstand steht im Zustand/Snapshot (`renderer.js` Wasserfläche) |

**Zwei Schwächen, die keine Lücke sind, aber benannt gehören:** (1) Das Register belegt
seine Begründungen **in Prosa**, der Test prüft maschinell nur „Zweig: ja/nein" — das
steht so in der Datei selbst. (2) Drei stumme Arten (`shot`, `turn_start`, `crate_landed`)
haben *doch* einen Zweig und stehen trotzdem in der Menge — als Sonderfall kommentiert.

---

# G) Konfigwert ohne Leser

## G1 Ohne jeden Leser (auch kein Skript)

`src/shared/config/weapons.js`: `WEAPON_CATALOG_VERSION`, `WEAPON_RARITIES`,
`subcategoryLabel`, `getWeaponsByCategory`, `getWeaponsByRarity`, `isReserveWeapon`
— alle sechs: 0 Treffer außerhalb der Definition, in `src/`, `tests/`, `scripts/`, `tools/`.
**Urteil: Ordnung** (Katalog-Metadaten ohne Anzeige).

## G2 Datei ohne Leser: `src/shared/config/rules.js` — **Defekt (Ordnung + Doppelregel)**

`GAME_RULES` wird ausschließlich über die Barrels re-exportiert (`shared/index.js:7`,
`client/index.js:19`, `server/index.js:51`); kein Anwendungspfad liest einen Wert. Die
Werte **widersprechen** dem laufenden Spiel:

| `rules.js` sagt | die Anwendung tut |
|---|---|
| `matchDurationRounds: 20` | `maxRounds = 30` (`match.js:531`) |
| `teamSize: {minimum: 4, maximum: 6}` | `MAX_PLAYERS_PER_TEAM = 6` als **Einheiten je Spieler** (`lobby.js:72`), Matcharten 3/4/5 |
| `turnDurationSeconds: 30` | 30 / **20** / **15** s je Spielerzahl (`turnSystem.js:156-161`) |
| `maxPlayers: 8` | `MAX_LOBBY_FIGURES = 40` (`lobby.js:33`) |

Ein Regelkatalog, der 20 Runden verspricht und 30 spielt, ist schlimmer als keiner.
Kleinster Fix: Datei löschen **und** die `export * from './config/rules.js'`-Zeile in
`shared/index.js:7` entfernen (die Barrels lädt `npm run validate`!).

## G3 Nur Tests/Skripte lesen sie — „halbtot"

Betroffen sind ~60 Exporte in 15 Config-Dateien, u. a. `SIDEGRADES`, `SIDEGRADE_IDS`,
`SIDEGRADE_AXES`, `SIDEGRADE_BY_CLASS`, `SIDEGRADE_FLOOR`, `resolveSidegrade`
(`sidegrades.js`), `TERRAIN_MATERIALS` (`terrain.js`), `ALL_BACKDROPS`, `TERRAIN_PALETTES`,
`COMPOSITION_SUFFIX`, `TERRAIN_COVERAGE`, `backdropsForPreset` (`backdrops.js`),
`SKY_KINDS`, `WATER_KINDS`, `AMBIENT_KINDS`, `LANDMARK_KINDS`, `SCENERY_BIOMES`,
`describeScenery` (`scenery.js`), `CHARACTERS`, `SLOT_CLASSES`, `NAMING_CONFLICTS`,
`charactersByRolle/Faction`, `getCharacter`, `roleOf`, `validateFactionData`
(`factions.js`), `REFERENCE_PROJECTILE_SPEED`, `HITSCAN_RANGE_BY_CATEGORY`,
`DAMAGE_BY_CATEGORY`, `SPECIAL_WITHOUT_DAMAGE`, `WEAPON_IDENTITIES`, `identityFor`,
`strikeStyleFor`, `hasFuse`, `hasSpecialEffect`, `speedFactorFor`, `subcategoryFor`,
`getWeaponsBySubcategory`, `WEAPON_SUBCATEGORIES`, `ARCHETYPE_LAUNCH_BASE`,
`GUENTHER_REFERENZ_BREITE`, `HEIMDALL_MAX_PERCENT`, `LOADOUT_ROLES`, `MOVE_SPECIALS`.
**Urteil: überwiegend Ordnung** — die Anwendung liest die *Zugriffsfunktionen*, die
Kataloge selbst sind nur den Prüfskripten zugänglich. Zwei Ausnahmen mit echtem
Doppelregel-Risiko: `SIDEGRADES` (Quelle) gegen `sidegradeModifiers` (Anwendungspfad) und
`TERRAIN_MATERIALS` gegen `TERRAIN_MATERIAL` + `materialAmPunkt` — beide sind geprüft
**konsistent**, aber sie liegen an zwei Stellen.

---

# H) Handler ohne Auslöser

| Handler / Zuhoerer | Fundstelle | Auslöser | Urteil |
|---|---|---|---|
| `case CONTROL.START_MATCH` | `src/server/gameServer.js:1700` (Wächter „alle Teams besetzt", `markRunning`, `session.start()`) | **kein Client sendet `START_MATCH`** — gesendet werden `HELLO`, `JOIN_LOBBY`, `INPUT`, `SELECT_WEAPON`, `JUMP`, `DROP_WEAPON`, `PING` (`networkClient.js:288-534`) | **Verdacht**: der Zweig ist im Live-Betrieb unerreichbar. Der Start läuft über den Beitritt (`gameServer.js:1655-1663`). Die Prüfung „erst wenn alle Teams besetzt" existiert damit zweimal, nur einmal wird sie durchlaufen. |
| `CONTROL.RESUME = 'resume'` | `src/shared/protocol.js:105` | weder gesendet noch behandelt (kein `case CONTROL.RESUME`) | **Defekt-verdacht (Lücke, kein Schaden)**: Die Persistenz speichert die Sitzplatz-Token (`persistence.js:158`) und `WELCOME` schickt einen Token (`gameServer.js:1690`) — aber der Client hält ihn **nur im Speicher**. Nach einem Seiten-Neuladen kann sich niemand per Token fortsetzen; die Konstante ist die Ankündigung eines Weges, den es nicht gibt. |
| `CONTROL.CREATE_LOBBY = 'create_lobby'` | `src/shared/protocol.js:97` | über WebSocket: niemand (die Lobby entsteht per HTTP `POST /api/lobby/create`, `main.js:974`) | **Ordnung**: Konstante für einen zweiten Weg, der nicht benutzt wird. |
| `EventBus#on/#off` | `src/engine/events.js:20`, `:29` | kein Produktionscode registriert je einen Zuhoerer | **Ordnung** (vgl. A) — der Motor arbeitet mit `consumeEvents()`. |
| `Hud#update` … `onWeaponDrop`, `onJump` | übergeben in `main.js:962`, nicht gelesen (`hud.js:239`) | — | siehe §E. |
| Tastenzuhoerer | `input.js:83-119` (`pointermove/down`, `pointerup`, `keydown`, `keyup`, `resize`), `main.js:279` (`keydown`, R + Klangfreigabe) | **alle erreichbar** — geprüft: `' '` (Laden) hat das Gegenstück in `keyup`, `Enter`/`a`/`d`/`w`/`s`/`1-9`/`q`/`Shift` liegen im `#onKeyDown`-Rumpf, `Shift` liest die Richtung aus `#keys` (die `keydown` vorher füllt) | **in Ordnung** |
| DOM-Zuhoerer | alle `getElementById`-IDs des Clients | **alle 80 IDs aus `index.html` vorhanden**; 43 interaktive Elemente, **0 ohne Referenz** im Client-JS; die 6 scheinbar unreferenzierten sind ein Sprung-Anker (`#skip-to-board`) und fünf `<details>` (reines Markup) | **in Ordnung** |

---

# Die fünf Pipelines, Station für Station

## Pipeline 1 — Eingabe → Anzeige (der Schusswandelweg)

| # | Station | Funktion + Datei | Abbruchstelle |
|---|---|---|---|
| 1 | Maus/Taste | `InputController#attach/#onKeyDown/#releaseCharge` (`client/input.js:83-242`), Kraftformel `kraftAusLadung` (`:47`) | **behoben** (Doku im Kopf): `#charging` wurde vor `onFire` gelöscht → Kraft war immer `aim.power`. Jetzt wird die Kraft als Argument übergeben. |
| 2 | Absicht | `Game#fire` (`main.js:1486`) — lokal `match.fire`, online `networkClient.sendInput` + `#startShotPrediction` | online: der Tick der Eingabe wird fortgeschrieben (`networkClient.js:80 referenzTick`) — sonst fällt der Schuss aus dem Fenster |
| 3 | Auftrag → Server | `#handleInput` (`gameServer.js:341`) → `validateCommand` (`validation.js`) → `match.fire` | Lag-Kompensation nur gegen die Betrugsgrenze; `history.isWithinWindow` bewusst **nicht** benutzt (Kommentar dort) |
| 4 | Motor | `MatchController.fire` (`match.js:~2000`) → `shooting.js#fire` (`:150`): Selbstwirkung → `special_effect`; Hitscan → `#resolveHitscan` (`match.js:1707`); sonst Projektil (`:344` `projectile_spawn`) | `ProjectilePool` wird **nicht** benutzt (A) — kein Funktionsverlust, nur Ballast |
| 5 | Flug | `ProjectileSystem#update` (`projectileSystem.js:33`) → Impact/Pierce/Ablauf (`:275`/`:265`/`:324`) → `#explode` (`:277`) → `terrain.punchCrater` (`collisionMask.js:103`) + `terrain_destroyed` (`:402`) | Krater entsteht im Motor, die Anzeige zieht ihn über das Ereignis nach (`ereignisse.js:193 applyCrater`) bzw. lokal gar nicht (lokal zeichnet der Zustand, vgl. `explosion`) |
| 6 | Treffer | `services.onProjectileImpact` → `MatchController#handleProjectileImpact` (`match.js:1616`) → `DamageSystem#applyDamage` (`damageSystem.js:61`) → `damage`/`death` (`:103`/`:135`) | **`damage` hat keinen Wirkungszweig** — Rückmeldung kommt aus dem Zustand (Balken) und seit Neuestem aus `client/gefuehl.js` |
| 7 | Kanäle | lokal: `consumeEvents` (`match.js:3004`) → `#handleEvents` → `verarbeiteLokal` (`ereignisse.js:813`). Online: `LobbySession#stepSimulation` → `EreignisSendefilter#durchlassen` (`protocol.js:953`) → `#broadcastControl` → Client `game_event` → `verarbeiteOnline` (`ereignisse.js:828`) | Drossel verwirft Wiederholungen (gemessen 86,8 % der Steuerlast) — `jumped` ist dort **entfernt** (Doppelsprung kam 3 von 61 Malen durch) |
| 8 | Zustand | `encodeSnapshot` (`protocol.js:278`) ↔ `decodeSnapshot` (`:429`) → `NetworkClient#handleMessage` (`:330`) → `onlineViewState` (`main.js:1197`) → `Renderer.render` / `Hud.update` | `snapshot_rejected` meldet verworfene Takte; `crateType` wird übertragen und nicht gezeichnet (B1) |

## Pipeline 2 — Match-Lebenszyklus

| # | Station | Funktion + Datei | Abbruchstelle |
|---|---|---|---|
| 1 | Menü | `#bindMenu` (`main.js:192`) → `#start-button` → `startFromMenu` (`:397`) | Kartentyp ist fest `'autonom'`; die Preset-Auswahl wurde bewusst entfernt (Kommentar) |
| 2 | Lobby | `startOnline` (`main.js:966`) → HTTP `POST /api/lobby/create` → `#handleHttp` (`gameServer.js:743`) → `LobbyManager.create` (`lobby.js:82`) | `kartentyp` geht als `body.kartentyp` mit (`gameServer.js:1340`) — **aber der Client kann ihn beim Wiederaufbau nicht verwenden**, siehe Pipeline 3 |
| 3 | Verbindung | `NetworkClient.connect` (`:269`) → `HELLO`, `JOIN_LOBBY` → `gameServer.js:1523/1530` → `WELCOME` (`:1685`) → `joined` (`main.js:1039`) | `entityIds` (mehrere eigene Figuren) — ohne sie hielte sich der Client für einen Zuschauer |
| 4 | Start | automatisch beim letzten Beitritt: `alleTeamsBesetzt` → `session.start()` (`gameServer.js:1655-1663`) | zweiter Weg `START_MATCH` unerreichbar (§H); Wartemeldung hängt an `lobby_state.laeuft` (`main.js:1071`) |
| 5 | Zug | `turn_start` (`match.js:2831`) → `ereignisse.js:773` setzt online den Status; Timer aus `getTurnDurationForPlayerCount` (`turnSystem.js:156`) | keine Obergrenze der Sprünge mehr; `turn_end` bleibt stumm (§F) |
| 6 | Runde | `round_start` (`match.js:2734`) → Protokollzeile; `round_crates` stumm; Mahlstrom ab `roundBreakpoint` 8 (`config/match.js:85`) | online wird die Schwelle aus **derselben** Config gerechnet (`maelstromActiveFromRound`), nachdem sie zuvor als 15 doppelt vorlag |
| 7 | Ende | `#finish` (`gameServer.js:253`) → `match_over` → `ereignisse.js:765` → `#showEndScreen` (`main.js:2011`) → `#verbucheMatch` (`:2567`) → `#speichereProfil` | `lobby.status = FINISHED` wird inline gesetzt (`gameServer.js:439`); die entschiedene Lobby fällt aus der Sicherung (`:1070`) |
| 8 | Revanche | `#rematch-button` (`main.js:210`) → `#seedFuerRevanche` (`:322`) schreibt den Seed ins Feld | **behoben** (Doku im Kopf): vorher lief „Revanche" auf eine neue Karte |
| — | Abbruch | `abortMatch` (`:345`) → `#verlasseMatch` (`:363`) | beide Wege (R und Knopf) laufen in **einer** Umsetzung zusammen |

## Pipeline 3 — Terrain: Seed → Generator → Material → Maske → Kulisse → Anzeige

| # | Station | Funktion + Datei | Abbruchstelle |
|---|---|---|---|
| 1 | Seed | `MatchSeedManager` (`shared/seed.js`), Unterstrom `getSubRng('TERRAIN')` | — |
| 2 | Generator | `MatchController#buildTerrain` (`match.js:790`): bei `kartentyp === 'autonom'` → `erzeugeAutonomeKarte` (`terrainGen3.js:523`), sonst `generateTerrain` (`terrainGen.js:196`) | **die Weiche ist die Abbruchstelle** |
| 3 | Material | `k.material` → `#material` (`match.js:842`), gelesen nur in `materialAt` (`:1436`) → `materialAmPunkt` (`terrainGen3.js:483`), angewandt in `#wendeBodenmaterialAn` (`:1474`) mit `rutschigkeit`/`rueckprall` (`config/terrain.js`) | **eine** Lesestelle — geprüft, keine Doppelregel |
| 4 | Kollisionsmaske | `CollisionMask.fromBitmap` (`match.js:864`, `collisionMask.js:36`); Zerstörung `punchCrater` (`collisionMask.js:103`) | `TerrainSync` spiegelt genau das und ist unverdrahtet (A) |
| 5 | Wasser | `WaterField` (`waterField.js`) im Motor; Anzeige: lokal `match.water` (`main.js:2389`), online **nur** über `waterLevel` aus dem Snapshot | online gibt es keine Wasserfläche als Feld, nur die Marke am Namen |
| 6 | Kulisse | `pickScenery` (`config/scenery.js`) → `renderer.setScenery`; Kulissenauswahl `#applyBackdrop` (`main.js:1953`) mit `biomFuerCharakter`/`kulisseFuerBiom` | Zwei Wege (generativ vs. gewähltes Bild) — beide verdrahtet, per Menü wählbar |
| 7 | Anzeige | `Renderer#buildTerrainLayer` + `terrainBaker.js` (CPU/WebGPU), Kulisse über `sceneryPainter.js` | WebGPU-Pfad nur bei Menüwahl `auto` |

> **══ BEFUND (P1, gemessen) ══** **Station 2 läuft online auf zwei verschiedenen
> Generatoren.** Der Server baut die Karte mit `erzeugeAutonomeKarte` (Lobby trägt
> `kartentyp: 'autonom'`, `lobby.js:240` → `gameServer.js:122` → `match.js:828`), der
> Client baut sie für die Anzeige mit `generateTerrain` — dem **1D-Höhenfeld-Generator**
> (`client/terrainPreview.js:13`, `:25`, gerufen aus `main.js:1151 #buildRemoteTerrain`).
> Der `kartentyp` wird dem Client sogar übergeben (`main.js:1031`), aber der Konstruktor
> von `NetworkClient` nimmt ihn **nicht entgegen** (`networkClient.js:163`) — das Argument
> verfällt (§E).
>
> **Messung** (Sonde `/tmp/verkabelung/probe_terrain.mjs`, Seed 3367130477, 2560×1440,
> beide Wege mit den echten Modulen gebaut):
> Server 1.174.020 belegte Zellen, Client 1.282.406, **Zellen mit unterschiedlichem
> Belegungszustand: 1.254.438 = 34,0 %**.
>
> Folge online: die gezeichnete Landschaft ist **nicht** die simulierte. Der
> Schuss-Vorhersagepfad (`main.js:1733 isSolid` aus `remoteTerrain.bitmap`) rechnet gegen
> die falsche Karte, Krater werden an der falschen Stelle getragen, Einschläge liegen für
> den Spieler „in der Luft". Kein Test vergleicht beide Karten:
> `tests/seed-feld.test.js:59` prüft nur, dass `buildTerrainForSeed` im Quelltext
> **vorkommt**; `grep -rn remoteTerrain tests/` = 0 Treffer.

## Pipeline 4 — Waffen: Katalog → Spawn → Schuss → Treffer → Schaden → Lebensbalken

| # | Station | Funktion + Datei | Abbruchstelle |
|---|---|---|---|
| 1 | Katalog | generiert: `scripts/build-weapon-catalog.mjs` → `src/shared/config/weapons.js` (7.359 Zeilen); Zugriff `getWeapon`, `orderInventoryBySubcategory` | die Designdateien (`*.json`) liest zur Laufzeit niemand (§Umfang) |
| 2 | Aufgebot | `config/loadouts.js` → `MatchController#spawnPlayers` (`match.js:495`) → `Inventory#grantWeapon` (`inventory.js:94`) | Online-Bestände kommen als eigene Nachricht (`CONTROL.LOADOUTS`, `gameServer.js:826`), weil der Binärsnapshot sie nicht führt |
| 3 | Waffenwahl | `Game#selectWeapon` (`main.js:1440`) ↔ `LobbySession#handleWeaponSelect` (`gameServer.js:610`); Anzeige↔Inventar-Umsetzung `#inventoryIndexAt` (`main.js:1398`) | — |
| 4 | Schuss | `shooting.js#fire` → `applyCooldown` (`match.js:2384`, Ereignis `weapon_cooldown` **stumm**) | Nachladen ist online nur über `cooldowns` in der LOADOUTS-Nachricht sichtbar |
| 5 | Projektil | `shooting.js:~300` Komponentenaufbau (pierce/homing/fuse) → `ProjectileSystem#update` | Zünder: `fuseTicks` → `stateSnapshot.js:142 fuseSeconds` → seit Protokoll v8 über die Leitung → `renderer.js:717` zeichnet den Countdown (**dieser Weg ist vollständig verdrahtet**) |
| 6 | Treffer | `#collectTargets`/`#raycast` (`projectileSystem.js:340`/`:350`) → `DamageSystem#applyDamage` → `Health`-Komponente | Trefferfenster der Statistik braucht den Takt (`main.js:1555` übergibt `world.tickCount`) — vorher verglich es 0 gegen 0 |
| 7 | Schaden | `damageSystem.js:66` mit `COMBAT_RULES.resistanceCap`, Schild über `absorbWithShield` (`specials.js:547`) | `absorbWithShield` selbst ist **ungerufen** (nur intern über `applySelfEffect`? geprüft: kein Aufrufer) — Schildabbau läuft über `StatusStore` andere Wege |
| 8 | Lebensbalken | `Renderer#drawHealthBar` (liest `health/maxHealth`), `Hud#update` (Balken + Marken) | **online `maxHealth` erst ab der ersten LOADOUTS-Nachricht** (`main.js:1266` Rückfall 100) — davor falsche Balkenbreite (im Kommentar als Fund dokumentiert) |
| — | Geschütze | `#deployTurret` (`match.js:1075`) → `#fireTurrets` (`:1117`) → `#simulateTurretPath` (`:1167`); Anzeige `renderer.js:540` mit `roundsLeft` | die **öffentliche** `turretPath` (`match.js:2078`) ist ungerufen → online gibt es keine Geschütz-Zielvorschau |

## Pipeline 5 — Persistenz: Spielstand → Datei → Wiederaufbau → Anzeige

| # | Station | Funktion + Datei | Abbruchstelle |
|---|---|---|---|
| 1 | Aufnahme | `LobbySession#recorder` (`ReplayRecorder`), Eingaben je Schuss/Sprung/Abwurf (`gameServer.js:599/667/709`) | ein fehlender `kind`-Zweig ließ Sprünge/Abwürfe still verschwinden — behoben (`#applyReplayEntry`, `gameServer.js:255`) |
| 2 | Momentaufnahme | `GameServer#snapshotState` (`gameServer.js:~1055`) → `serializeLobby` (`persistence.js:98`): Seed, Sitzplätze+Token, Replay-Kern, `tick`, **Zustandshash** | `LobbySession#toPersisted` (`gameServer.js:269`) ist die **unbenutzte** zweite Fassung derselben Logik (A) |
| 3 | Datei | `PersistenceStore#save` (`persistence.js:41`, atomar über `writeFileSync` + `rename`) → `.pa-state/lobbies.json`, alle 10 s (`gameServer.js:1159`) sowie beim Schließen (`:1840`) | entschiedene Lobbys werden ausgelassen (`:1070`) |
| 4 | Wiederaufbau | `load` (`:62`) → `restoreLobby` (`:185`) → `#restoreState` (`gameServer.js:1092`) → `#restoreFromReplay` (`:127`) + `#applyReplayEntry` | **Hash-Vergleich** gegen `hashState` (`persistence.js:141`) — meldet nur, repariert nicht |
| 5 | Anzeige | Client verbindet sich mit Token (`networkClient.js:290`) → `WELCOME` → Snapshot | **hier bricht es**: der Token lebt nur im Speicher des Tabs. Nach einem Neuladen ist er weg, `CONTROL.RESUME` ist nicht implementiert (§H) → der Wiederaufbau ist nur für die **laufende** Seite wirksam (Reconnect des WebSocket), nicht für einen neuen Seitenaufruf |
| 6 | Replay-Wiedergabe | `#wireReplay` (`main.js:2276`) → `ReplayPlayer` → `#syncReplayMatch` (`:2417`); Eingaben gesperrt (`fire`, `:1521`) | behoben: das Anzeigeobjekt wurde beim `reset()` nicht mitgezogen (`#syncReplayMatch`-Kommentar) |

---

# DEFEKTE, nach Schaden für den Spieler geordnet

## P1 — schadet dem Spieler unmittelbar

1. **Online ist die gezeichnete Karte eine andere als die simulierte** (34,0 % der Zellen;
   Pipeline 3, Beweis: `/tmp/verkabelung/probe_terrain.mjs` + `terrainPreview.js:25` gegen
   `match.js:828`). Der Spieler sieht Gelände, das es nicht gibt: Krater an falscher Stelle,
   Vorhersagebahn gegen eine Phantomkarte, Treffer „ohne Wand".
   **Kleinster Fix:** `buildTerrainForSeed(seed, preset, orientation, kartentyp)` und in
   ihm bei `kartentyp === 'autonom'` dieselbe Funktion `erzeugeAutonomeKarte` rufen wie der
   Motor — plus `kartentyp` im `NetworkClient`-Konstruktor entgegennehmen
   (`networkClient.js:163`) und in `#buildRemoteTerrain` durchreichen (`main.js:1151`).
2. **Die Art einer Kiste ist unsichtbar** (§B1): `crateType` steht in Zustand und Snapshot
   (`stateSnapshot.js:155`, `protocol.js:230`), der Renderer zeichnet nur die
   Seltenheitsfarbe (`renderer.js:581`). Waffenkiste, Nachschub, leere Kiste und
   **Sprengfalle** sind nicht unterscheidbar.
   **Kleinster Fix:** in `#drawCrates` je `crateType` (`CRATE_TYPES`, `lootSystem.js:131`)
   ein Zeichen setzen — 4 Zeilen, keine Protokolländerung.
3. **Gift- und Bonusmarken gibt es online nicht** (§C): `main.js:1211-1214` füllt `dots`
   und `boostMultiplier` mit Konstanten, `hud.js:377/378` liest sie. Wer online vergiftet
   wird, verliert Leben ohne Marke.
   **Kleinster Fix:** `dots`/`boostMultiplier` in den Zustandstakt aufnehmen (Protokoll
   v9, je Spieler zwei Bytes: Anzahl DoTs, Boost-Faktor in Zehnteln) **oder** — ohne
   Protokolländerung — die Marken online aus dem `dot_tick`-Ereignis speisen.

## P2 — die Anzeige lügt (kein Spielschaden)

4. **Der Determinismus-Hash sieht die Geschützrunden nicht** (§C):
   `stateSnapshot.js:269` liest `t.rounds`, der Zustand führt `roundsLeft` (`:112`).
   **Kleinster Fix:** `t.roundsLeft ?? null` — eine Zeile, ein Satz in
   `tests/`-Erwartung (der Hashwert selbst ändert sich dadurch für Zustände mit Geschützen).
5. **Totale Stille bei `projectile_expired` am Kartenrand** (§F): begründet, aber der
   Zweig „Geschoss verlässt die Karte" hat **gar keine** Rückmeldung — anders als der
   Zeitablauf, der detoniert. (Verdacht, kein belegter Schaden.)

## P3 — Last und Ordnung (kein Spielernutzen, aber Bewegungsmasse)

6. `src/shared/config/rules.js` (`GAME_RULES`) widerspricht dem Spiel in vier Werten (§G2).
7. `ProjectilePool`, `TerrainSync`, `ballisticsWasm`/`isWasmSupported`, `terrainLoader`:
   vier Module außerhalb jedes Anwendungspfades (§D2), davon zwei Umsetzungen lebender
   Logik.
8. `EventBus#on/off/dispatch` und `TurnSystem#addListener/#removeListener`: zwei
   Abo-Mechaniken ohne Zuhoerer (§A/§H).
9. Zwei Momentaufnahmen für die Persistenz (`serializeLobby` inline vs.
   `GameServer#toPersisted`, §A).
10. Doppelte Zahl `maxRounds: 30` im Client (§B2) neben dem Motor-Vorgabewert.
11. `SoundMixer#setzeAn`/`#setzeLautstaerke` ohne Aufrufer: **es gibt keinen
    Klangschalter im Spiel**, obwohl der Mischer ihn hat (§A).

---

# Die fünf wichtigsten nicht verdrahteten Stellen

| # | Stelle | Kleinster Fix |
|---|---|---|
| 1 | **Client baut die Online-Karte mit dem falschen Generator** (`terrainPreview.js:25` `generateTerrain` statt `erzeugeAutonomeKarte`; `kartentyp` fällt in `networkClient.js:163` weg) — 34,0 % der Kartenzellen weichen ab | `kartentyp` als vierten Parameter durchreichen und in `buildTerrainForSeed` auf `erzeugeAutonomeKarte` umschalten (dieselbe Weiche wie `match.js:826`). Ein Test, der **beide** Bitmaps vergleicht, fehlt bisher. |
| 2 | **`crateType` auf der Leitung, nicht im Bild** (`protocol.js:230` ↔ `renderer.js:581`) | In `#drawCrates` je Art ein Zeichen (Falle/Waffe/Heilung/leer) — 4 Zeilen, kein Protokollschritt. |
| 3 | **Online keine Zustandsmarken für DoT/Buff** (`main.js:1199` `dots: []`, `boostMultiplier: 1` ↔ `hud.js:377/378`) | Online-Zustand aus den Ereignissen speisen (`dot_tick` zählt, `special_effect` mit `multiplier`) — kein Protokollschritt nötig. |
| 4 | **`hashState` liest `t.rounds`, der Zustand führt `roundsLeft`** (`stateSnapshot.js:269` gegen `:112`) | `t.roundsLeft ?? null` — eine Zeile. Der Zustandshash wird dadurch für Matches mit Geschützen ein anderer; die Replay-Erwartung muss neu belegt werden. |
| 5 | **`GAME_RULES` widerspricht dem Spiel** (`config/rules.js`: 20 Runden, 4–6 je Team, 8 Spieler, 30 s) und wird von keiner Anwendung gelesen | Datei löschen **und** `shared/index.js:7` (`export * from './config/rules.js'`) entfernen — die Barrels lädt `npm run validate`. |

---

## Belege außerhalb dieses Berichts

Alle Sonden sind rein lesend und liegen unter `/tmp/verkabelung/`:
`kern.py` (längengleiche JS-Reduktion + Selbstprobe), `audit.py`/`a_final.py`
(A: definiert/gerufen), `feld.py`/`feldabgleich.py`/`importeure.py`/`exports.py`
(B–D), `pruef.py` (E/G), `ereignisse.py` (F), `dom.py`/`dom2.py` (H),
`probe_terrain.mjs` (die Terrain-Messung mit den echten Modulen).
Rohlisten: `A_jetzt.txt`, `D.txt`, `param.txt`, `config2.txt`.
