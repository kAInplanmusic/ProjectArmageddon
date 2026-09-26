# TODO-Abgleich — was von den offenen Punkten wirklich noch offen ist

**Erzeugt:** durch rein lesende Prüfung gegen den Code, 2026-09-26.
**Startpunkt:** HEAD `32b1f81`; **während der Arbeit** hat der Auftraggeber parallel
`f28bbed` („docs(todo): Stand nachgezogen, O9 aufgenommen") committet — alle
Belege unten wurden nach diesem Commit nachgemessen.

**Auftrag:** Jeder als offen bezeichnete Punkt aus `MASTERDOTO.md`, `bgworker-todo.json`
und `docs/audit-tief.md` wird EINZELN gegen den CODE geprüft — nicht gegen die Doku.

**Kategorien:**
- **ERLEDIGT** — Beleg vorhanden (Datei:Zeile, Testname oder Messwert).
- **WIDERLEGT** — die Behauptung stimmt gemessen nicht (mehr).
- **OFFEN** — trifft zu; hier steht, was für 100 % Produktionsreife fehlt.
- **NICHT PRUEFBAR** — mit Angabe, was gefehlt hätte.

**Randbedingungen dieser Prüfung:** Ein E2E-Lauf läuft parallel. Diese Datei ist der
einzige Schreibzugriff; kein Server, kein Playwright, kein `npm test`/`npm run build`.
`node scripts/check-docs.mjs` wurde gefahren, weil es ausschließlich liest (kein Schreiben,
kein Netz) — seine Ausgabe steht unten wörtlich.

**WICHTIG — der Baum hat sich während der Prüfung bewegt.** Zwischen dem ersten und dem
letzten Befehl dieser Arbeit sind Commits entstanden (`32b1f81` → `f28bbed`) und es ist
mindestens eine Datei neu angelegt worden (`docs/auftraege/online-sprung-und-abwurf.md`,
22:14). Jede Aussage unten ist eine **Momentaufnahme mit Zeitstempel**, keine Aussage über
den Zustand beim Lesen. Wer diesen Bericht benutzt, prüft die zwei Zahlen, die sich am
schnellsten ändern, selbst nach: `ls tests/*.test.js | wc -l` und `node scripts/check-docs.mjs`.

## Umfang der Prüfung — und was NICHT geprüft ist

| Quelle | Umfang | Abgeglichen |
|---|---|---|
| `bgworker-todo.json` | O1–O9 (W1–W7/M1–M6 sind laut Datei erledigt, nicht Thema) | **alle 9** |
| `docs/audit-tief.md` §17 TODO | 8 Punkte | **alle 8** |
| `docs/audit-tief.md` Ampel „gelb: zufall" | 1 Feld | abgeglichen |
| `MASTERDOTO.md:148` Auszugstabelle | 5 Zeilen | **alle 5** |
| `MASTERDOTO.md` 2556–2724 | 21 Checkbox-Punkte, 2 Rest-„offen"-Sätze | 2 Rest-Sätze geprüft, 4 Stichproben |
| `MASTERDOTO.md` 2724–3333 | 36 Checkbox-Punkte, 9 Rest-„offen"-Sätze | 9 geprüft, 4 Stichproben |
| `MASTERDOTO.md` 3333–3494 | 9 Checkbox-Punkte, 1 Widerspruch | 1 geprüft, 1 Stichprobe |
| `MASTERDOTO.md` 3494–4089 | 30 Checkbox-Punkte, 6 Rest-„offen"-Sätze | 6 geprüft, 3 Stichproben |
| `MASTERDOTO.md` 4089–4437 | „Bekannte Grenzen", 8 Rest-„offen"-Sätze | 8 geprüft, 1 Stichprobe |
| **zusätzlich gefunden** | „offen"-Marker in 190–2556 (außerhalb der genannten Bereiche) | 5 geprüft |

**Summe:** In den offenen Abschnitten stehen **96 Checkbox-Punkte, alle `[x]`**, und
**0 offene Häkchen** (`grep -c '^ *- \[ \]' MASTERDOTO.md` → **0**; die 8 leeren
Häkchen sitzen in `docs/audit-tief.md` §17). Gegengeprüft wurden **jeder Punkt, der
irgendwo noch als offen formuliert ist** (32 Sätze), plus **15 Stichproben** auf
als erledigt geführte Häkchen. **Nicht einzeln gegen den Code geprüft** sind die
übrigen ~80 `[x]`-Punkte — sie sind als „erledigt geführt, nicht abgeglichen"
markiert, nicht als „erledigt belegt".

---

## 1. `bgworker-todo.json` — O1 bis O9

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `bgworker-todo.json` O1 | MASTERDOTO:154 trägt den widerlegten Freispruch zur Doppelregel `PRIMARY_BIOME_BY_PRESET` noch | **ERLEDIGT** | `MASTERDOTO.md:154` sagt jetzt: „`PRIMARY_BIOME_BY_PRESET` (backdrops.js + scenery.js — ein **wertgleiches Duplikat**, keine Absicht)" und nennt „`src/shared/config/backdrops.js:968` definiert, `scenery.js:21` importiert". Nachgeprüft: `grep -rn PRIMARY_BIOME_BY_PRESET src/` → Definition nur `src/shared/config/backdrops.js:968`, Import `src/shared/config/scenery.js:21`, Re-Export `:438`, Leser `backdrops.js:740` und `scenery.js:514` | nichts |
| `bgworker-todo.json` O2 | 15 Ereignisse sind einzweigig (Engine sendet, Client schweigt) | **OFFEN (teilweise erledigt, wie angegeben)** — die Restliste der Datei stimmt exakt | Zählung über `src/client/ereignisse.js` (Block `EREIGNIS_WIRKUNGEN`, `:82`–`:599`): **38 Einträge**; 27 in beiden Zweigen (`beide(` oder `lokal:`+`online:`); **6 nur-lokal**: `jumped@424`, `landed@430`, `crate_landed@436`, `crate_pickup@472`, `fall_damage@537`, `toxic_rain@547`; **4 nur-online**: `terrain_destroyed@90`, `projectile_spawn@202`, `turn_start@571`, `karte_unerreichbar@590`; 1 in keinem: `drowning@509` (bewusst, `:499-509`). Daß die 4 „nur-lokal"-Kandidaten online WIRKLICH ankommen, belegt `src/server/gameServer.js:246-248`: der Server schickt **jedes** Engine-Ereignis raus (`for (const event of this.match.consumeEvents()) this.#broadcastControl(event.type, …)`). Emittiert werden sie in `src/engine/match.js:1351` (`landed`), `src/engine/systems/lootSystem.js:198` (`crate_pickup`), `src/engine/systems/characterSystem.js:122` (`fall_damage`), `src/engine/systems/maelstromSystem.js:96` (`toxic_rain`) | **4 Online-Zweige in `src/client/ereignisse.js` für `landed`, `crate_pickup`, `fall_damage`, `toxic_rain`** — sonst spielt der Online-Spieler ohne Rückmeldung, daß er eine Kiste aufgenommen hat, Schaden durch Sturz/Toxischen Regen genommen hat. `jumped` und `crate_landed` sind hier nicht behebbar: sie hängen an O8 |
| `bgworker-todo.json` O3 | Günther ist im Online-Match möglicherweise unsichtbar | **ERLEDIGT im Code / NICHT PRUEFBAR im Browser** | Client-Anschluß vorhanden: `src/client/main.js:1165` `guenther: snapshot.guenther ?? null` (mit Begründungskommentar `:1150-1164`). Drahtseite vorhanden: `src/shared/protocol.js:243` liest `state.guenther`, `:355-363` schreibt Position/Richtung/`aktiv`, `:513-518` dekodiert. **Kein Online-E2E**: `grep -rln guenther tests/e2e/` → **nur** `tests/e2e/guenther.spec.mjs`, und dessen Helfer startet lokal (`api.startMatch({ seed, teams: 2, playersPerTeam: 2, preset: 'hills' })`, `:20`). Die fünf Testnamen der Datei (`:39`, `:116`, `:130`, `:155`, `:169`) sind alle lokal | Ein E2E, der ein **Online**-Match spielt und prüft, daß Günther **gezeichnet** wird. Die Behauptung „online sichtbar" ist derzeit nur aus dem Code belegt, nicht im Browser gesehen |
| `bgworker-todo.json` O4 | Kommentar in `tests/event-coverage.test.js` behauptet, der Audit suche nur `emit()` | **ERLEDIGT** | Der Kommentar sagt jetzt das Gegenteil und nennt die Fundstelle: `tests/event-coverage.test.js:140-141` „(Das Werkzeug `tools/audit-mcp` wurde nachgezogen: `lib/statisch.mjs:536` sucht mit `(?:emit|melde)\(` nach BEIDEN Meldewegen.)". Nachgeprüft in `tools/audit-mcp/lib/statisch.mjs:536`: `for (const m of zeile.matchAll(/(?:emit|melde)\(\s*'([a-z0-9_]+)'/gi))` | nichts |
| `bgworker-todo.json` O5 | „Partien enden nie vor Runde 8" sei eine offene Design-Entscheidung | **ERLEDIGT — war keine offene Entscheidung** (Urteil der Datei bestätigt) | Die Entscheidung steht **begründet im Code**: `src/shared/config/match.js:81-85`: „Acht Runden geben dem Spieler Zeit, die Karte zu lesen … Das ist die Mitte zwischen ‚zu spät' und ‚verdrängt'." mit `roundBreakpoint: 8`. Leser: `src/engine/match.js:2697`, `src/shared/config/match.js:95`/`:98`, `scripts/check-match-time.mjs:38`, `scripts/check-maelstrom.mjs:49`. Der Wächter hält die Zahl nirgends fest (`tests/gameplay.test.js:128` liest sie aus der Konfiguration) | nichts. **Achtung für Nachfolger:** es ist eine getroffene Balance-Entscheidung, keine Lücke — genau der Irrtum, der schon einmal eine Stunde gekostet hat |
| `bgworker-todo.json` O6 | Testzahl in MASTERDOTO und README nachziehen | **WIDERLEGT (jetzt wieder falsch)** | `node scripts/check-docs.mjs` (rein lesend) meldet wörtlich: `FEHL  README: 102 Testdateien — wirklich 103` und endet mit `Geprüfte Behauptungen: 1 Abweichung(en)` / `EXIT=1`. Ursache: `ls tests/*.test.js \| wc -l` → **103**, die Dokumente nennen 102 (`README.md:173`, `MASTERDOTO.md:142`) — `tests/replay-sprung-luecke.test.js` kam mit Commit `32b1f81` NACH der Zählung hinzu | Die Zahl 102 auf **103** richtigstellen (README.md:173 **und** MASTERDOTO.md:142) — das ist ein Ein-Zeilen-Fix, aber bis dahin ist `npm run check:docs` rot |
| `bgworker-todo.json` O7 | E2E-Lauf (Playwright) steht aus | **NICHT PRUEFBAR** | Es läuft gerade ein E2E-Lauf dieses Repos (Randbedingung des Auftrags). Ein eigenes Urteil über Vollständigkeit wäre geraten. Die Spec-Anzahl ist dagegen gemessen: `ls tests/e2e/*.spec.mjs \| wc -l` → **28**, und `node scripts/check-docs.mjs` bestätigt dem README „28 E2E-Spezifikationen" | Der E2E-Befund des laufenden Auftrags. Zusätzlich fehlt aus O3 ein **Online**-Günther-Test und aus O2/O8 fehlen Online-Tests für die vier stummen Ereignisse |
| `bgworker-todo.json` O8 | Springen und Waffe-Abwerfen gibt es online NICHT | **OFFEN — bestätigt, Zeilenangaben exakt** | `src/client/main.js:793-794`: `jump(seitlich = 0) { if (!this.match \| this.mode !== 'local') return null; }` — **stumm**. `:817-818`: `dropWeapon(anzeigePosition) { if (!this.match \| this.mode !== 'local') { … 'Abwerfen ist nur im lokalen Match möglich' … }`. Protokoll: `CONTROL` in `src/shared/protocol.js:84-95` führt `HELLO, WELCOME, CREATE_LOBBY, JOIN_LOBBY, LOBBY_STATE, START_MATCH, INPUT, SELECT_WEAPON, RESUME, ERROR, PING`. `grep -rn "JUMP\|DROP_WEAPON" src/shared/protocol.js src/server/` → **kein Treffer** | Der Drahtweg: `CONTROL.JUMP` + `CONTROL.DROP_WEAPON`, Server-Handler (der Motor hat `jump()`/`dropWeapon()` fertig), Client-Verdrahtung statt des `mode !== 'local'`-Ausstiegs. **Zusätzlich:** der stumme Ausstieg in `:794` sollte mindestens melden, warum nichts passiert. **Reihenfolge bindet an O9** (siehe dort) |
| `bgworker-todo.json` O9 | Ein Sprung ist nicht aufzeichenbar: Replays mit Sprung divergieren | **OFFEN — bestätigt und im Code gepinnt** | Wache vorhanden: `tests/replay-sprung-luecke.test.js` mit genau den drei beschriebenen Tests — `:137` „Die Gegenprobe: OHNE Sprung ist die Aufzeichnung reproduzierbar", `:153` „BEFUND: Ein Sprung ist NICHT aufzeichenbar und macht die Wiedergabe abweichend", `:176` „Der Recorder kennt genau EINE Eingabeart: den Schuss". Ursache im Code nachgelesen: `src/engine/replay.js:118` `recordInput({ tick, playerId, angle, power, weaponId = null })` — nur Winkel/Kraft; der Wiedergabepfad ruft ausschließlich `this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId)` (`:393`). Der Server zeichnet JEDES Online-Match auf (`src/server/gameServer.js:456` `this.recorder.recordInput({…})`) und stellt Sitzungen daraus wieder her (`:172` `toPersisted()` / `:174` `replay: this.recorder.toJSON()`) | **Das Replay-Format um den Sprung erweitern** (zweite Eingabeart + Wiedergabepfad, der `jump()` aufruft), **bevor** der Drahtweg aus O8 gebaut wird — sonst wird jeder Serverneustart zwischen den beiden Schritten zum stillen Zustandsverlust. Das in O9 als „in Arbeit" genannte `docs/auftraege/online-sprung-und-abwurf.md` **existiert inzwischen** (angelegt 2026-09-26T22:14 parallel zu dieser Prüfung, 67 251 Byte, Auftragstitel „Auftrag O8: Online-Sprung und Waffe-Abwerfen", Stand `32b1f81`) — der Belegstand dieser Zeile ist damit „Entwurf vorhanden", nicht „umgesetzt" |

---

## 2. `docs/audit-tief.md` — §17 TODO (8 Punkte) und die Ampel

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `docs/audit-tief.md:304` (HOCH) | Zufall/Zeit im Simulationspfad: `src/engine/replay.js:85` `this.#startedAt = Date.now();` | **ERLEDIGT (Fall b, Metadatum) — der Audit wiederholt hier eine FRAGE, deren Antwort in `bgworker-todo.json` M5 steht** | Fundstelle stimmt: `src/engine/replay.js:85`. EIN Leser: `:177` `createdAt: this.#startedAt` in `toJSON()`. `fromJSON` übernimmt `createdAt` nicht. Der Auftraggeber hat es gemessen und gepinnt: `tests/replay-uhr.test.js`, Hash `f2d232c3` identisch bei echter Uhr, springender Uhr, `createdAt` 0 / −1 / +1 Jahr (M5 in `bgworker-todo.json`, Beleg dort wörtlich) | nichts am Produkt. **Aber:** `docs/audit-tief.md` ist vom 2026-09-26 und führt den Punkt weiter als „HOCH" — die Datei ist der Werkzeugstand von 18:36 und kennt die Einordnung nicht |
| `docs/audit-tief.md:309` | Export ohne Leser: `rosterWithSprites` (`src/client/roster.js`) | **ERLEDIGT** | Entfernt; die Stelle trägt jetzt den Grabstein: `src/client/roster.js:51` „HIER STAND `rosterWithSprites()` — entfernt am 2026-09-26.", `:54` nennt den Beweis-grep. `grep -rn rosterWithSprites src/ tests/ scripts/` → nur noch diese Kommentarzeilen | nichts |
| `docs/audit-tief.md:311` | Export ohne Leser: `resolveStrike` (`src/engine/shooting.js`) | **OFFEN (kosmetische tote Exporte)** | `grep -rn resolveStrike src/ tests/ scripts/` → Definition `src/engine/shooting.js:362`, interner Aufruf `:246`, Re-Export `:739`. **Kein Importeur, kein Test** | Es ist ein Export **ohne externen Leser** — nach der Projektregel (Skill „ProjectArmageddon: verifizierte Weiterarbeit") tot. Entweder Import entfernen oder einen Leser schaffen. Kein Laufzeitrisiko |
| `docs/audit-tief.md:313` | Export ohne Leser: `fuseTicksFor` (`src/engine/shooting.js`) | **OFFEN (kosmetische tote Exporte)** | `grep -rn fuseTicksFor src/ tests/ scripts/` → Definition `src/engine/shooting.js:392`, interne Aufrufe `:338` und `:431`, Re-Export `:740`. Kein Importeur, kein Test | wie oben |
| `docs/audit-tief.md:315` | Export ohne Leser: `GERAETE_SCHLUESSEL` (`src/shared/identity.js`) | **OFFEN (kosmetisch) — mit Vorbehalt** | `src/shared/identity.js:42` Definition, gelesen in derselben Datei `:102`/`:106`. Kein externer Leser. **`bgworker-todo.json` M4 vertritt die Gegenposition** („leben intern und bleiben") — der Konflikt ist eine Entscheidung, nicht eine Messung | Entscheiden, ob der Export bleibt (dann aus `audit-tief`-TODO streichen) oder fällt |
| `docs/audit-tief.md:317`/`:319` | Export ohne Leser: `isValidAngle`, `isValidPower` (`src/shared/validation.js`) | **OFFEN (kosmetisch) — mit Vorbehalt** | `src/shared/validation.js:39`/`:43` Definitionen, gelesen `:75`/`:78` in derselben Datei. Kein externer Leser. Dieselbe M4-Gegenposition | wie oben |
| `docs/audit-tief.md:321` | „Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen" *[Offen — Design-Entscheidung]*, „0 von 5 Partien endeten VOR Runde 8" | **ERLEDIGT — Fehlspur, vom Auftraggeber selbst als O5 abgeräumt** | Die Entscheidung steht begründet in `src/shared/config/match.js:81-85` (`roundBreakpoint: 8`), und das Werkzeug, das sie falsch berichtete, ist repariert: `scripts/check-maelstrom.mjs:49` liest jetzt `MATCH_RULES.suddenDeath.roundBreakpoint`, `:189` nennt den heutigen Stand | nichts. **Der Audit-Punkt war doppelt falsch:** „Design-Entscheidung offen" *und* „Werkzeug mit fest verdrahtetem Fazit" (die zweite Hälfte hat der Auftraggeber in Commit `e31d1c7` behoben) |
| `docs/audit-tief.md:19` (Ampel) | `zufall` 🟠 gelb — „1 Zeit-/Zufallstreffer im Simulationspfad" | **ERLEDIGT (eingerordnete Warnung) — die Ampel ist gelb, das Produkt nicht gefährdet** | Derselbe Treffer wie oben: `src/engine/replay.js:85`, Metadatum, kein Determinismus-Einfluß; `docs/audit-tief.md:14` bestätigt selbst Determinismus/Gates/Doppelregeln/marker grün | nichts. **Hier steckt der Irrtum im Bericht selbst:** §10.6 zählt einen Treffer im „Simulationspfad", §3 desselben Berichts mißt Determinismus **grün** — der Widerspruch ist der Datei bewußt (sie nennt es „gelb"), wird aber von jedem Leser als Mangel gelesen |

---

## 3. `MASTERDOTO.md:148` — „Offen aus dem Audit (33 Punkte, Auszug)"

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:152` | 3 Dateien ohne jeden Importeur (183 Zeilen): `waterSimulation.js`, `terrainRenderer.js`, `ui.js` | **ERLEDIGT** | `ls` meldet für alle drei: „Datei oder Verzeichnis nicht gefunden" — sie sind weg (Commit `7b78b38`, in `MASTERDOTO.md:3591-3604` ausführlich belegt) | nichts |
| `MASTERDOTO.md:153` | Konstanten ohne Leser: `SHIELD_SCALE`, `PROJECT_ARMAGEDDON_WEAPON_DATABASE`, `TERRAIN_MATERIAL_DEFINITIONS`, `weaponIndexFromId` | **ERLEDIGT** | `grep -rn "SHIELD_SCALE\|PROJECT_ARMAGEDDON_WEAPON_DATABASE\|TERRAIN_MATERIAL_DEFINITIONS\|weaponIndexFromId" src/` → **kein Treffer** | nichts |
| `MASTERDOTO.md:154` | Vier Doppelregeln: `TICK_MS`, `PLAYER_HALF_WIDTH/_HEIGHT`, `PRIMARY_BIOME_BY_PRESET` | **ERLEDIGT (Definitionen je EINE Quelle)** | `grep -rn "const TICK_MS\s*=" src/` → **eine** Stelle, `src/shared/config/network.js:32`. `grep -rn "PLAYER_HALF_WIDTH\s*=\|PLAYER_HALF_HEIGHT\s*=" src/` → je **eine** Stelle, `src/shared/config/player.js:35`/`:38`; `src/engine/systems/projectileSystem.js:39-40` trägt nur noch den Kommentar über die entfernten Zweitexporte. `PRIMARY_BIOME_BY_PRESET`: Definition nur `src/shared/config/backdrops.js:968` (siehe O1) | nichts |
| `MASTERDOTO.md:155` | `requiresLineOfSight` ist bei allen 150 Waffen konstant `false` | **ERLEDIGT — nachgemessen** | `node --input-type=module -e "import {WEAPONS} … "` → `Waffen: 150`, **`requiresLineOfSight true: 13`** — die dokumentierte Zahl 13 stimmt exakt. Verdrahtung: `MASTERDOTO.md:3566-3589` nennt `MatchController.hasLineOfSight()` samt Sperre vor dem Munitionsverbrauch, Tests `tests/weapon-damage-types.test.js`, `tests/wirkungsmerkmale-match.test.js` | nichts |

---

## 4. `MASTERDOTO.md` 2556–2724 — „Offene Arbeit"

Alle 21 Punkte tragen `[x]`. Nur zwei Stellen formulieren **noch** offen:

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:2561-2565` | „Offen bleiben einzelne Mechaniken: aufgestelltes Geschütz (Auto-Turret), Wasserschub … Offen bleibt nur noch das aufgestellte Geschütz." | **WIDERLEGT — beide sind gebaut** | Auto-Turret vollständig verdrahtet: `src/engine/specials.js:206` `auto_target: { kind: EFFECT_KIND.TURRET }` → `src/engine/shooting.js:618-619` `case EFFECT_KIND.TURRET: quelle.deployTurret(...)` → `src/engine/match.js:1800` `#deployTurret(...)`, Ereignis `:1847` `turret_deployed`, Bahnsuche `:1939-1953` (`TURRET_POWERS`/`TURRET_ELEVATIONS`). Bewaffnung: `node --input-type=module` → **1 Waffe** mit `special: 'auto_target'` (`id: pa_124`, `strikeStyle: self`, `damage: 38`, `maxRange: 1062`). Tests: `tests/turret.test.js`, `tests/turret-ballistics.test.js`, `tests/e2e/turret.spec.mjs`, auf dem Draht `tests/netcode.test.js:585` „Geschütze überleben die Kodierung (Protokoll v6)". Wasserschub: `water_push` steht in der Special-Liste des Katalogs, `src/engine/match.js:2496` emittiert `water_pushed` | **Inhaltlich offen bleibt nur die Frage, ob EINE Waffe mit diesem Special genug ist** — das ist eine Content-Entscheidung, keine Lücke im Code |
| `MASTERDOTO.md:2639-2640` | „*Offen bleibt die Entscheidung selbst:* Ob ein Draft … zum Spiel passt." | **WIDERLEGT innerhalb desselben Abschnitts** | 22 Zeilen darüber entscheidet derselbe Abschnitt das Gegenteil: `MASTERDOTO.md:2617` „**Entwurfsphase (Draft) — ENTSCHIEDEN (2026-09-20): es gibt KEINEN Draft.**" samt Begründung `:2619-2624`; dieselbe Entscheidung steht in der Tabelle `:178` („KEIN Draft") | nichts am Produkt. **Der Satz muß weg oder als historisch gekennzeichnet werden** — er ist heute als „offen" lesbar |

**Stichproben auf die als erledigt geführten Punkte dieses Abschnitts:**

| Quelle | Stichprobe | Urteil | Beleg |
|---|---|---|---|
| `MASTERDOTO.md:2612` | „Lobby-Browser im Menü (offene Lobbys listen und beitreten)" | **nicht abgeglichen** | — |
| `MASTERDOTO.md:2699` | `/healthz` liefert Betriebszähler | **nicht abgeglichen** | — |
| `MASTERDOTO.md:2705` | Lasttest mit künstlicher Latenz (`page.routeWebSocket`) | **ERLEDIGT (Stichprobe)** | `tests/e2e/network-conditions.spec.mjs` existiert (in `docs/audit-tief.md:294` namentlich genannt) |
| `MASTERDOTO.md:2714` | Replay im Client abspielen | **ERLEDIGT (Stichprobe)** | Wiedergabepfad im Code vorhanden: `src/engine/replay.js:393` `this.match.fire(...)`, Debug-API + Menü laut `MASTERDOTO.md:2714-2716`; **nicht** im Browser geprüft |

---

## 5. `MASTERDOTO.md` 2724–3333 — „Auftrag vom 2026-09-11"

Alle 36 Punkte tragen `[x]`. Neun Stellen formulieren **noch** offen:

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:2775-2776`, `:2801` | Erfolge: „offen sind **Symbole als Bilder** und **Belohnungen**" | **OFFEN (Inhalt)** | `reward` ist überall `null` (in `MASTERDOTO.md:3939-3940` so festgehalten: „Belohnungen bleiben `null`: Es gibt kein Vergabesystem, ein Text wäre eine Behauptung"); die Anzeige benutzt ★/☆ statt Bilddateien (`:1770`). Katalog: **11 Einträge**, Muster-Feld entfernt — die Erfolgszahl steht in `MASTERDOTO.md:1705` (`ACHIEVEMENTS: 11`, `muster: 0`), im Code `src/shared/achievements.js:111`/`:252` (`MUSTER_ANZAHL` → 0) | Bilddateien je Erfolg und ein Vergabesystem für Belohnungen. **Beides ist Gestaltung/Content und ausdrücklich eine Entscheidung des Auftraggebers** — kein Code-Mangel |
| `MASTERDOTO.md:2811` | „Offen bleibt allein die **Lieblingsnation**" | **OFFEN (Inhalt)** | `src/client/main.js:2381` zeigt die Zeile `['Lieblingsnation', text.lieblingsfraktion]`, `:2410` nennt den Grund: „Die Lieblingsnation braucht eine Charakterwahl — die gibt es noch nicht." Es gibt keine Fraktionsvergabe im Match | Eine Charakterwahl (Fraktion je Platz). **Content-Entscheidung**, kein Fehler — die Zeile zeigt „—" und sagt warum |
| `MASTERDOTO.md:2818` | „OFFEN: die exklusive Waffe je Charakter, die NUR als legendärer Drop erscheint" | **OFFEN (Inhalt)** | `grep -rn "exklusiv\|exclusive" src/shared/config/factions.js src/shared/config/weapons.js` → **kein Treffer**. Der Katalog kennt keine charaktergebundene Legendärwaffe; die Ultimate-Fähigkeit je Charakter ist ein anderes Feld (so in `MASTERDOTO.md:2819-2820` abgegrenzt) | Inhaltslieferung: welche Waffe je Charakter, und der Ausschluß im Drop-Pool. **Design-Entscheidung** |
| `MASTERDOTO.md:2837`, `:2860` | Kantenlicht: „Was offen bleibt: nur noch die Geschmacksfrage, wie stark die Kante hervortreten soll" | **DESIGN (kein Code-Mangel) — Entscheidung liegt beim Auftraggeber** | Die Stellschraube existiert und wirkt: `src/client/terrainBaker.js:170` `export const KANTEN_STUFEN = 3`, benutzt in `:233`; Test `tests/kantenlicht.test.js` laut `MASTERDOTO.md:2835-2836` | Nichts Funktionales. Eine Zahl ändern (`KANTEN_STUFEN`) oder es so lassen. **Nicht als „offen, weil Code fehlt" führen** |
| `MASTERDOTO.md:2909` | „Offen — Produkt- und Datenschutzentscheidung: Ob und wie Konten eingeführt werden" | **ERLEDIGT als Entscheidung (KEINE Konten)** | `MASTERDOTO.md:2868-2912` dokumentiert die getroffene Entscheidung samt Umsetzung (`src/shared/identity.js`, „Fortschritt sichern"/„Sicherung laden", 6 Unit-Tests in `tests/identity.test.js`), Datei existiert | Die Infrastruktur steht, die Entscheidung ist gefallen. **Der Satz ist als offener Punkt überholt** — er beschreibt nur, was ein späterer Auftraggeber entscheiden könnte |
| `MASTERDOTO.md:3096` | „Hier stand: ‚Offen bleibt allein die Umsetzung der mehreren Einheiten je Spieler.'" | **ERLEDIGT** | Der Absatz darunter dokumentiert den Bau (`:3106-3124`) mit Tabelle `unitsPerPlayer`, `seat.figureIndex`, `#platzFuer`, `WELCOME.entityIds`; Belege `tests/einheiten-je-spieler.test.js` (existiert), `tests/e2e/grosse-teams.spec.mjs` (existiert), `tests/e2e/loadout-choice.spec.mjs`. `MAX_PLAYERS_PER_TEAM = 6` in `src/server/lobby.js` laut `MASTERDOTO.md:2629-2631` | nichts |
| `MASTERDOTO.md:3330` | „Offen bleibt der **Ausbau**: Böden mit eigener Physik (Eis = rutschig, Gummi = federnd) und Etagen." | **WIDERLEGT für die Böden / OFFEN für die Etagen** | Böden sind gebaut (W7): `src/shared/config/terrain.js:61` `normal/Erde rutschigkeit: 0, rueckprall: 0`, `:69` `ice/Eis rutschigkeit: 1`, `:78` `rubber/Gummi rueckprall: 0.6`; die EINE Lesestelle `src/engine/match.js:1367` `materialAt(x, y)`, angewandt `:1428` (`y + PLAYER_HALF_HEIGHT`); Test `tests/terrain-material.test.js` (existiert). **Etagen** (mehrstöckige Karten) sind nirgends gebaut | Nur noch **Etagen**, falls gewünscht — und das ist eine Design-Entscheidung (die 2D-Maske trägt sie) |

**Stichproben:** `MASTERDOTO.md:3006` Kamera → `src/client/camera.js` existiert · `:2673` WebGPU-Bodenbäckerei → `src/client/terrainBaker.js` existiert · `:2885` Profil-Sicherung → `src/shared/identity.js` existiert · `:3377` Sidegrades → `src/shared/config/sidegrades.js` existiert (alle vier **ERLEDIGT, Stichprobe**). Nicht abgeglichen: `:2744` Zünder-Umbau, `:2831` Anflugrichtung, `:2772` Erfolgsmechanik im Detail, `:3006-3023` Matcharten-Zahlen.

---

## 6. `MASTERDOTO.md` 3333–3494 — „Übernommen aus der alten todo.md"

Alle 9 Punkte tragen `[x]`.

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:3357-3359` | „Die drei bewusst NICHT umgesetzten Punkte (Sidegrades, Counterplay, Map-Synergie) bleiben offen" | **WIDERLEGT — 2 der 3 sind im selben Abschnitt als erledigt geführt** | Direkt darunter: `:3360-3378` „**Sidegrades.** Erledigt als datenorientiertes Trade-off-System" mit `src/shared/config/sidegrades.js` (existiert) und vier Testdateien; `:3379-3406` „**Counterplay und Map-Synergie.** Erledigt als sichtbare Beziehung ohne Multiplikator" mit `tests/counterplay.test.js`, `tests/mobility.test.js` (beide existieren) | Nichts am Produkt. Der Satz ist ein Überrest — er widerspricht dem eigenen Abschnitt und sollte auf „Map-Synergie: nur als Anzeige, bewusst ohne Multiplikator" reduziert werden |

**Stichprobe:** `MASTERDOTO.md:3422` Browser-Profiling → `tests/e2e/profiling.spec.mjs` wird in `docs/audit-tief.md:295` als bekannte GPU-Grenze genannt (**ERLEDIGT, Stichprobe**; dort auch der vorbestehende Fehler). Nicht abgeglichen: `:3407-3414` Karten-Authoring über Presets hinaus (vier neue Formen — von `docs/audit-tief.md:159-166` mit allen acht Formen gemessen bestätigt).

---

## 7. `MASTERDOTO.md` 3494–4089 — „Offene Punkte aus dem Audit"

Alle 30 Punkte tragen `[x]`. Sechs Stellen formulieren **noch** offen:

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:3672-3682` | Zünder-Waffen: „Offen — Design-Entscheidung", für Einschlagswaffen sei der Zünder falsch | **ERLEDIGT — die Entscheidung ist gefallen und im Code** | Der Lösungsweg des Werkzeugs ist umgesetzt: `mechanic.fuseIntent` mit `timed`/`impact`. Nachgemessen: `node --input-type=module` → **`fuseIntent timed: 11`, `impact: 7`, `fuseTime>0: 11`** — genau die Zahlen, die `MASTERDOTO.md:4140-4146` nachträgt und die `npm run check:fuses` meldet. Die vier als falsch benannten Namen sind laut `:4148-4151` auf `impact` umgestellt | nichts. **Der Absatz trägt die Entscheidung selbst nach („*Der ursprüngliche Befund (Stand vor dem Umbau)*")** — er ist historisch, wird aber unter der Überschrift „Offen" geführt |
| `MASTERDOTO.md:3712-3717` | `maxRange`: „Offen — Balance-Entscheidung"; die Anzeige solle klarstellen, daß es die Reichweite bei neutralem Profil ist | **OFFEN (Balance/Anzeige)** | Der Faktor ist gemessen (0,37 systematisch, `MASTERDOTO.md:3702-3706`; in „Bekannte Grenzen" `:4164-4178` mit 0,37 / 0,28 erneut) und die Empfehlung des Werkzeugs steht im Klartext (`:3714-3717`) | **Eine Zeile in der Waffenliste: „Reichweite bei neutralem Profil".** Sonst verspricht die Liste mehr, als das Spiel hält. Der Wert selbst zu ändern wäre eine Balance-Änderung an allen 150 Waffen — bewußt unterlassen |
| `MASTERDOTO.md:3743-3746` | Scout-Balance: „Offen — Design-Entscheidung" | **OFFEN (Balance) — der zugrundeliegende Mangel ist behoben** | Der Scout hat jetzt eine wirksame Stärke: `MASTERDOTO.md:4232-4273` dokumentiert die Behebung (`#mobilityFactor`, gemessen scout 116,9 px gegen heavy 86,6 px, +35 %); `tests/mobility.test.js` existiert | Die **Bewertung**: ob der Scout mit einer Stärke gegen drei Schwächen aufholen soll. Das ist Spielgefühl, kein Code. `npm run balance:classes` liefert die Zahlen (`:3720-3750`) |
| `MASTERDOTO.md:3881-3884` | Matchdauer: „Offen — Entscheidung: ob 13 min zu lang sind" | **ERLEDIGT als Entscheidung** | `MASTERDOTO.md:181` (Tabelle „Durchgang 2026-09-20"): „Matchdauer \| 100 Leben bleiben; die Dauer hängt an der Zugzeit … `npm run check:time` nennt die Entscheidung"; `:3847-3857` wiederholt sie. Werkzeug-Beleg: `scripts/check-match-time.mjs:38` liest `MATCH_RULES.suddenDeath.roundBreakpoint` | nichts. Der Satz ist die Restfrage eines Spielers, nicht ein Arbeitspunkt |
| `MASTERDOTO.md:3990-3992` | Erfolge: „Offen — Content-Entscheidung: Schwelle senken (auf ~20 je Minute) oder Text ändern" | **ERLEDIGT — die Schwelle ist auf 20 gesetzt** | `src/shared/achievements.js:242`: `condition: { kind: 'mindestens', kennzahl: 'schaden_pro_minute', wert: 20, mindestbasis: { kennzahl: 'schuesse', wert: 20 } }` — exakt die im Text vorgeschlagene Zahl. `MASTERDOTO.md:3942-3944` dokumentiert die Korrektur „200 → **20**" | nichts an dieser Schwelle. Offen bleiben nur Symbole/Belohnungen (siehe §5) |
| `MASTERDOTO.md:3809-3810` | „Der Eintrag stand noch als offen, obwohl die Behebung darunter dokumentiert ist." | **ERLEDIGT (selbst richtiggestellt)** | Kisten-Radius 110 px, `MASTERDOTO.md:3830-3839`; `tests/kisten-erreichbar.test.js` | nichts |

**Stichproben:** `:3501` 974 Zeilen toter Code entfernt → `MASTERDOTO.md:3512-3514` nennt `tests/no-dead-code.test.js`, und `docs/audit-tief.md:184` bestätigt „Keine [Dateien ohne Importeur]" (**ERLEDIGT, Stichprobe**) · `:3555` `src/engine/damageTypes.js` (**nicht abgeglichen**, Datei nicht gelesen) · `:4129` `tests/melee-throw.test.js` (**nicht abgeglichen**).

---

## 8. `MASTERDOTO.md` 4089–4437 — „Bekannte Grenzen (bewusst dokumentiert)"

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:4133-4162` | „Die Zünder der 11 Zünder-Waffen sind länger als die Flugzeit … **Offen — das ist eine Design-Entscheidung.**" | **ERLEDIGT — Absatz trägt die Entscheidung selbst nach** | `:4148-4151`: die vier genannten Namen sind jetzt Aufprallwaffen (`fuseIntent: 'impact'`, Zünder 0); nachgemessen `timed: 11, impact: 7`. Die verbleibenden 11 sind Liegezeit-Waffen (Granaten, Giftwolken, Wassermelone) — **für die ist ein Zünder die Absicht** | nichts. Die verbleibende „eine Waffe ohne Wirkung" (Explosiver Energieball) ist mit dem Umbau gelöst (`MASTERDOTO.md:4126-4127`) |
| `MASTERDOTO.md:4164-4178` | `maxRange` beschreibt die Reichweite bei NEUTRALEM Klassenprofil (Faktor 0,37) | **OFFEN (Anzeige)** — gleicher Punkt wie `:3712` | `simulateProjectileReach` mit `launchSpeedMultiplier = 1,0`; die Zahlen stehen in `:4170-4173` (Plasma-Blaster 850 → 317, Baseballschläger 110 → 30) | **Eine Klarstellung in der Anzeige** (siehe §7). Der Titel der Rubrik ist „Bekannte Grenzen" — hier ist die Doku ehrlich und vollständig |
| `MASTERDOTO.md:4180-4208`, `:4352-4373` | „Die Kopplung von Klasse und Archetyp ist aufgehoben — offen bleibt die Balance" / „Offen bleibt die BALANCE-Bewertung, nicht die Erreichbarkeit" | **OFFEN (Balance)** — und die Doku sagt das selbst korrekt | Erreichbarkeit belegt: `MASTERDOTO.md:4199-4203` nennt `resolveLoadout(index, wahl)`, `:4357-4363` zusätzlich `src/shared/config/classes.js:177`, `src/engine/match.js:549-566`/`:999`, `src/client/main.js:537` und den Wächter `tests/loadout-choice.test.js`. **Die Datei sendet hier eine widersprüchliche Botschaft:** `:4218-4230` erklärt denselben Punkt bereits für „überholt in der Bewertung (richtiggestellt 2026-09-26)" | Vergleichszahlen für die **sechs neuen** Kombinationen (`npm run balance`, `npm run balance:classes` wurden für die drei Diagonalen erhoben). Das ist Messung, nicht Code — und eine Balance-Entscheidung obendrauf |
| `MASTERDOTO.md:4210-4216`, `:4393-4395` | Bezugswert `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp (1,1 / 1,4 / 1,6) | **OFFEN (Balance)** — doppelt geführt (zwei Stellen, dieselbe Aussage) | `MASTERDOTO.md:4210-4216` (ausführlich) und `:4393-4395` (Kurzfassung mit Rückverweis); Wächter `tests/class-profile.test.js` hält den Wert fest (`:4216`) | Eine Entscheidung: normalisieren (verschiebt alle Abschußgeschwindigkeiten um ~8 %) oder lassen. **Berührungspunkt mit `profil.inert`** (`:4374-4392`: `archetypeSpeed` steht als ungelesen im Profil) |
| `MASTERDOTO.md:4331-4337` | „Persistenz ist dateibasiert. Für mehrere Serverinstanzen wäre ein gemeinsamer Speicher nötig." | **OFFEN (Betrieb) — bestätigt, unverändert gültig** | `src/server/persistence.js:9-14`: „Ablage: eine einzelne JSON-Datei, atomar geschrieben (temp + rename)"; Import nur `node:fs`/`node:path`/`node:crypto` (`:16-18`), keine Sperre, keine Instanz-Kennung | Ein gemeinsamer Speicher oder eine Sperre, **sobald mehr als eine Instanz läuft**. Heute nicht nötig (der Betriebsplan nennt eine Instanz) — **aber es ist die Grenze, die einem zweiten Server im Weg steht** |
| `MASTERDOTO.md:4349-4350` | „Offen sind allein die Inhalte: nach der Werkzeugtabelle ‚11 statt 100 Erfolge'" | **OFFEN (Inhalt)** | `MASTERDOTO.md:1705` (`ACHIEVEMENTS: 11`, `muster: 0`), `src/shared/achievements.js:111` `export const ACHIEVEMENTS` | Der Katalogumfang ist eine Inhaltsfrage. **Die Mechanik trägt jeden neuen Erfolg als Tabellenzeile ohne Code-Änderung** — das ist belegt (`MASTERDOTO.md:3955-3957`) |
| `MASTERDOTO.md:4397-4418` | Wiederverbinden auf ein entschiedenes Match startet ein NEUES Match; ein fremder Client kommt nicht hinein | **ERLEDIGT (Widerspruch behoben)** | `MASTERDOTO.md:4403-4410` mit Fundstelle `src/server/gameServer.js` `JOIN_LOBBY`: `if (lobby.status === LOBBY_STATUS.FINISHED) this.#lobbies.markRunning(lobbyId)`; zwei Tests in `tests/server-integration.test.js` | nichts. Die verbleibende Eigenschaft („ein REMATCH nur für die, die schon drin waren") ist **die Regel des Hauses** und begründet, nicht offen |
| `MASTERDOTO.md:4419-4422` | Verpasste `match_over` wird nur auf die PING-Anfrage wiederholt (bis 2 s Verzug) | **OFFEN (bewußt in Kauf genommen)** | Der Satz nennt selbst die Abwägung („Ein eigenes Zeitintervall wäre schneller, würde aber ohne Not Nachrichten erzeugen"). Die Ursache steht in `MASTERDOTO.md:4419`: „Nach dem Match-Ende sendet der Server keine Snapshots mehr (Fehler 32)" | Eine schnellere Zustellung des Match-Endes (eigenes Intervall oder Piggyback auf den Snapshot). **Bewußt offen gelassen** — wer es ändert, erzeugt Nachrichten ohne Anlaß |

---

## 8b. Zusätzlich gefunden: „offen"-Marker AUSSERHALB der genannten Bereiche

Diese Stellen liegen in `MASTERDOTO.md` zwischen 190 und 2556 — sie waren nicht Teil des
Auftrags (die „offenen Abschnitte" beginnen bei 2556), bezeichnen aber Punkte als offen:

| Quelle | Punkt (kurz) | Urteil | Beleg | Was fehlt fuer Produktionsreife |
|---|---|---|---|---|
| `MASTERDOTO.md:318-320` | „**Offen bleibt Schritt 4 im Übrigen:** `fire()` (211 Zeilen) als `engine/shooting.js` und `spawnPlayers()`/`buildTerrain()` als Aufbau sind **noch nicht** ausgezogen." | **WIDERLEGT für `fire()` / OFFEN für den Aufbau** | `fire()` **ist** ausgezogen: `src/engine/shooting.js` existiert mit **745 Zeilen**; `wc -l src/engine/match.js` → **3163** (die Doku nennt an derselben Stelle „gemessen 3.588"); `wc -l src/client/main.js` → **3251** (Doku `:306` nennt 3.235 — auch das ist überholt). Die beiden Aufbaumethoden sind **weiterhin im Match**: `src/engine/match.js:794` `#buildTerrain()`, `:1000` `#spawnPlayers()`, aufgerufen `:646`/`:657` | Nur noch `#buildTerrain()`/`#spawnPlayers()` herausziehen. **Reine Architektur-Schuld ohne Spielerwirkung** — die Doku nennt sie selbst „die letzte echte Architektur-Schuld" |
| `MASTERDOTO.md:928-934` | „*Offen — Balance:* Für 465 Kombinationen liegt der Deckel weiterhin unter der Wurfweite … Ob das so gewollt ist (kurze Zündschnur als Design) oder ob `maxRange` für diese Waffen zu klein ist, ist eine Balance-Entscheidung." | **OFFEN (Balance)** | Der Satz beziffert die Messung selbst und nennt die Alternative. Der Bezug zur Reichweiten-Skalierung steht in `MASTERDOTO.md:915-925` | Eine Balance-Entscheidung. **Nicht** als Code-Mangel führen — das Werkzeug `npm run check:reichweite` druckt die Tabelle |
| `MASTERDOTO.md:1507-1509` | „`src/client/main.js` setzt im Online-Pfad weiterhin kein `guenther`-Feld … Günther bleibt online unsichtbar" | **WIDERLEGT** | `src/client/main.js:1165` `guenther: snapshot.guenther ?? null` — seit Commit `01db34e` („feat(client): Guenther online sichtbar und meldend"), also **vor** diesem Doku-Stand. Der Kommentar darüber (`:1150-1164`) beschreibt den Fehler selbst als Fund | Nichts am Code; **die drei Sätze sind zu streichen**, sonst sucht der nächste Leser einen Fehler, der behoben ist. Der zweite Teil desselben Absatzes (`:1510-1516`, JUMP/DROP) stimmt dagegen weiter = O8 |
| `MASTERDOTO.md:2241-2244` | „**Offen bleibt:** das aufgestellte Geschütz (`Auto-Turret`, `special: "auto_target"`)." | **WIDERLEGT — es ist gebaut** | Vollständiger Nachweis siehe §4: `src/engine/specials.js:206` → `src/engine/shooting.js:618-619` → `src/engine/match.js:1800`/`:1847`, Tests `tests/turret.test.js` + `tests/e2e/turret.spec.mjs` + Protokoll v6 (`tests/netcode.test.js:585`) | Nur die Content-Frage, ob eine einzige Waffe (`pa_124`) dieses Specials genug ist |
| `MASTERDOTO.md:2316-2318` | „**Offen, aber jetzt beziffert:** 52 Waffen haben keinen Designwert in der Quelldatei und rechnen mit einem Ersatz-Schadenswert (`istPlatzhalter`)." | **OFFEN (Datenmangel) — die Zahl stimmt noch** | Nachgemessen: `node --input-type=module` → `damageSource`-Verteilung `{source: 98, derived: 45, none: 7}` ⇒ **52 ohne Designwert** = 150 − 98. Die Herkunft wird in `scripts/balance-report.mjs:369` als `istPlatzhalter: weapon.damageSource !== 'source'` gebildet und in `:636`/`:671-672` getrennt gemeldet. **Nuance:** der Feldwert heißt inzwischen `derived`/`none`, nicht mehr `placeholder` — die Aussage bleibt trotzdem wahr | Designwerte für 52 Waffen in der Quelldatei des Auftraggebers. **Das ist eine Inhaltslieferung** — der Generator kann es nicht erfinden |

---

## 9. Die wirklich offenen Punkte, nach Dringlichkeit

Nur Kategorie **OFFEN**. Geordnet nach **Wirkung auf den Spieler** (nicht nach Aufwand).

### 1. Springen und Waffe-Abwerfen fehlen online vollständig — `bgworker-todo.json` O8

**Wirkung:** Der Scout hat online **keine** wirksame Stärke (seine einzige ist laut
`MASTERDOTO.md:4246-4259` der Absprung, gemessen +35 %), und der Vorrat ist online
genauso voll wie lokal — der Spieler kann Loot **nicht** aufnehmen und erfährt mit der
Meldung „Vorrat voll — die Waffe kann nicht aufgenommen werden" (`src/client/ereignisse.js:468`)
einen Grund, den er **nicht beheben kann**.
**Beleg:** `src/client/main.js:794` (stumm) und `:818`; `CONTROL` in `src/shared/protocol.js:84-95` kennt weder `JUMP` noch `DROP_WEAPON`.
**Empfehlung:** Eigener Auftrag mit Versionssprung. Motor (`jump()`, `dropWeapon()`) ist
fertig und getestet — es fehlt **ausschließlich** der Drahtweg (die zweite Stelle der
Zwei-Stellen-Kur, die für Kisten v5 und Geschütze v6 schon zweimal gemacht wurde,
dokumentiert in `src/shared/protocol.js:56-75`, die Versionszeilen `:20-22` und `:29-31`;
die Quelle nennt dafür `protocol.js:49-60` — dort steht heute der Import-Block, die
Versionsgeschichte steht ab `:56`). **Reihenfolge: erst O9, dann O8** (siehe 2).

### 2. Ein Sprung ist nicht aufzeichenbar — `bgworker-todo.json` O9

**Wirkung:** Heute **latent** — es trifft noch niemanden, weil weder `scripts/replay.mjs`
springt noch Online-Springen existiert. Es wird aber **in dem Moment zum stillen
Zustandsverlust**, in dem O8 gebaut wird: der Server zeichnet jedes Online-Match auf
(`src/server/gameServer.js:456`) und stellt Sitzungen daraus wieder her (`:172`).
**Beleg:** `tests/replay-sprung-luecke.test.js` (drei Tests, `:137`/`:153`/`:176`); Ursache `src/engine/replay.js:118` und `:393`.
**Empfehlung:** Das Replay-Format um die zweite Eingabeart erweitern, **bevor** der Drahtweg entsteht. Die Wache im Repo nennt die Bedingung zum Umdrehen selbst im Kopfkommentar.

### 3. Vier Ereignisse erreichen online den Spieler nicht — `bgworker-todo.json` O2 (Rest)

**Wirkung:** Im Online-Match fehlt die Rückmeldung für: **Kiste aufgenommen**
(`crate_pickup`), **gelandet** (`landed`), **Sturzschaden** (`fall_damage`),
**Toxischer Regen trifft** (`toxic_rain`). Der Server **sendet** alle vier
(`src/server/gameServer.js:246-248` leitet jedes Engine-Ereignis weiter) — der Client
verwirft sie. Für `fall_damage` und `toxic_rain` ist das ein unerklärter Lebensverlust.
**Beleg:** `src/client/ereignisse.js:424-551` (die vier Einträge haben nur `lokal:`).
**Empfehlung:** Vier Einträge um `online:` ergänzen (dieselbe Datei, ein Vorgang). Die
Texte müssen den Online-Fall ehrlich benennen — bei `crate_pickup_blocked` ist das Muster
schon vorbildlich gelöst (`:461-469`: lokal mit Taste, online ohne).

### 4. `npm run check:docs` ist ROT: Testdateizahl 102 statt 103 — O6

**Wirkung:** Kein Spielerfehler, aber ein **rotes Gate** und ein Ärgernis: die SSOT nennt
eine gemessene Zahl, die der Baum nicht mehr hergibt.
**Beleg:** `node scripts/check-docs.mjs` wörtlich: `FEHL  README: 102 Testdateien — wirklich 103`, `EXIT=1`; `ls tests/*.test.js | wc -l` → 103.
**Empfehlung:** Zwei Zahlen ändern (`README.md:173`, `MASTERDOTO.md:142`, je „102" → „103").
Der Grund für die Abweichung ist benennbar: `tests/replay-sprung-luecke.test.js` (Commit `32b1f81`) kam nach der Zählung.

### 5. Günther online: Code fertig, im Browser **unbelegt** — O3

**Wirkung:** Wenn die Annahme „online sichtbar" falsch wäre, spielte ein Mensch gegen einen
NPC, dessen Haufen ihn verlangsamen und vergiften, **ohne ihn zu sehen** — ein
Erlebnis-Fehler, kein Detail.
**Beleg:** `src/client/main.js:1165` + `src/shared/protocol.js:243`/`:355-363`/`:513-518`
belegen den Weg; **kein** E2E prüft ihn (`tests/e2e/guenther.spec.mjs` ist durchgehend lokal).
**Empfehlung:** Ein Online-E2E, der Günther im gezeichneten Zustand nachweist. Bis dahin
bleibt die Aussage „online sichtbar" eine **Code-Lesung**, keine Beobachtung.

### 6. Die fünf toten Exporte und der Konten-Satz — O2/M4-Streitpunkt

**Wirkung:** Keine auf den Spieler. Sie belasten aber jede künftige „Export ohne Leser"-Zählung.
**Beleg:** §2 (`resolveStrike`, `fuseTicksFor`, `GERAETE_SCHLUESSEL`, `isValidAngle`, `isValidPower`).
**Empfehlung:** **Entscheiden statt liegenlassen.** `bgworker-todo.json` M4 sagt „leben intern
und bleiben", `docs/audit-tief.md` führt sie als TODO. Beides gleichzeitig geht nicht — die
eine Stelle (der Audit-TODO) sollte die Entscheidung übernehmen.

### 7. Balance-Bewertungen ohne Vergleichszahlen

**Wirkung:** Sie entscheiden, ob das Spiel **gerecht** wirkt: Scout (Punkt 5 aus §7), die
sechs neuen Klasse/Archetyp-Kombinationen, `ARCHETYPE_LAUNCH_BASE = 1,2`, der
Wurfweiten-Deckel für 465 Kombinationen, die `maxRange`-Anzeige.
**Beleg:** `MASTERDOTO.md:3743`, `:4180-4208`, `:4210-4216`, `:928-934`, `:3712`.
**Empfehlung:** `npm run balance:classes` und `npm run balance:sweep` über die sechs neuen
Kombinationen laufen lassen — **das ist Messung, keine Gestaltung** und macht die
Entscheidung überhaupt entscheidbar. Die `maxRange`-Anzeige ist dagegen eine Zeile Code.

### 8. `spawnPlayers()`/`buildTerrain()` herausziehen

**Wirkung:** Keine auf den Spieler. `src/engine/match.js` ist **3163 Zeilen**.
**Beleg:** `src/engine/match.js:794`, `:1000`, `:646`, `:657`.
**Empfehlung:** Nachrangig. Wer es anfaßt, liest zuerst die zwei Wächter, die den Umzug
begrenzen (Skill: `tests/reichweite-konsistenz.test.js` liest `match.js` als TEXT;
`tests/event-coverage.test.js` verlangt für jedes Ereignis einen Client-Zweig).

### 9. Persistenz ist eine einzelne JSON-Datei

**Wirkung:** Heute keine — **sie ist die Wand vor der zweiten Serverinstanz**.
**Beleg:** `src/server/persistence.js:9-14` und `:16-18`.
**Empfehlung:** Erst angehen, wenn ein zweiter Server geplant ist. Bis dahin ehrlich als
Grenze führen (was die Doku tut).

### 10. Inhaltslieferungen (Entscheidungen des Auftraggebers, keine Code-Lücken)

Erfolgs-Symbole als Bilder · Belohnungen (`reward` überall `null`) · Katalogumfang
11 statt 100 · exklusive Waffe je Charakter · Lieblingsnation/Fraktionswahl ·
52 Waffen ohne Designwert · Auto-Turret: ist eine Waffe genug?
**Beleg:** §5 und §8b.

---

## 10. Was die Doku falsch behauptet (Kategorie WIDERLEGT)

Alle Zeilenangaben sind gegen den heutigen Baum nachgeprüft.

| Stelle | Behauptung (wörtlich) | Gemessen | Beleg |
|---|---|---|---|
| `README.md:173` | „**1057 Tests in 102 Dateien**" | **103** Testdateien | `ls tests/*.test.js \| wc -l` → 103; `node scripts/check-docs.mjs` → `FEHL  README: 102 Testdateien — wirklich 103` |
| `MASTERDOTO.md:142` | „Dateizahl **102** (`ls tests/*.test.js \| wc -l`)" | **103** | dito |
| `MASTERDOTO.md:2561-2565` | „Offen bleiben einzelne Mechaniken: aufgestelltes Geschütz (Auto-Turret) … Offen bleibt nur noch das aufgestellte Geschütz." | Der Auto-Turret und der Wasserschub sind **beide gebaut und getestet** | `src/engine/specials.js:206`, `src/engine/shooting.js:618-619`, `src/engine/match.js:1800`, `:1847`; `tests/turret.test.js`, `tests/e2e/turret.spec.mjs`, `tests/netcode.test.js:585` |
| `MASTERDOTO.md:2241-2244` | „**Offen bleibt:** das aufgestellte Geschütz" | wie oben | wie oben |
| `MASTERDOTO.md:1507-1509` | „`src/client/main.js` setzt im Online-Pfad weiterhin kein `guenther`-Feld … Günther bleibt online unsichtbar" | Das Feld steht da | `src/client/main.js:1165` `guenther: snapshot.guenther ?? null` (seit `01db34e`) |
| `MASTERDOTO.md:318-319` | „`fire()` (211 Zeilen) als `engine/shooting.js` … sind **noch nicht** ausgezogen" | `src/engine/shooting.js` existiert, **745 Zeilen**; `match.js` **3163** statt „3.588" | `wc -l src/engine/shooting.js src/engine/match.js` → 745 / 3163 |
| `MASTERDOTO.md:306` | `src/client/main.js` **3.235** Zeilen | **3251** | `wc -l src/client/main.js` |
| `MASTERDOTO.md:3330` | „Offen bleibt der Ausbau: Böden mit eigener Physik (Eis = rutschig, Gummi = federnd) und Etagen." | Die Böden **sind gebaut** (W7) | `src/shared/config/terrain.js:61`/`:69`/`:78`; `src/engine/match.js:1367` `materialAt`; `tests/terrain-material.test.js` |
| `MASTERDOTO.md:3357-3359` | „Die drei bewusst NICHT umgesetzten Punkte (Sidegrades, Counterplay, Map-Synergie) bleiben offen" | Sidegrades und Counterplay sind **im selben Abschnitt** als erledigt geführt | `MASTERDOTO.md:3360-3378`, `:3379-3406` |
| `MASTERDOTO.md:2639-2640` | „*Offen bleibt die Entscheidung selbst:* Ob ein Draft … zum Spiel passt." | 2026-09-20 **entschieden: kein Draft** | `MASTERDOTO.md:2617`, Tabelle `:178` |
| `bgworker-todo.json` O6 | Status `"erledigt"` mit Beleg „Commit e26821d, `npm run check:docs` Exit 0" | Der Beleg war zu seinem Zeitpunkt richtig; **heute ist `check:docs` Exit 1** | `node scripts/check-docs.mjs` → `EXIT=1` |
| `bgworker-todo.json` O9 / M5 | `src/engine/replay.js:66` als Fundstelle von `Date.now()` | Die Zeile liegt bei **85** | `grep -n "Date.now()" src/engine/replay.js` → `85: this.#startedAt = Date.now();` (der Tiefen-Audit nennt `:85` **richtig**) |
| `bgworker-todo.json` O9 | Entwurf „`docs/auftraege/online-sprung-und-abwurf.md` (in Arbeit)" | **Beim ersten Nachsehen gab es die Datei nicht — sie wurde während dieser Prüfung angelegt** (2026-09-26T22:14). Der Satz ist damit richtiggestellt, **aber der Beleg muß jetzt „Entwurf vorhanden" heißen, nicht „in Arbeit"** | `ls -la --time-style=+%Y-%m-%dT%H:%M docs/auftraege/` → `online-sprung-und-abwurf.md`, 67 251 Byte, 22:14; `zerlegung-schritt3-…`/`zerlegung-schritt4-…` vom 2026-09-20T14:21 | nichts — die Zeile war nur zum Zeitpunkt des Schreibens ungenau. **Lehre für Nachfolger:** in diesem Repo schreiben mehrere Sitzungen gleichzeitig; jede Aussage über „existiert/existiert nicht" braucht ihren Zeitstempel |
| `MASTERDOTO.md:4360` | „`src/engine/match.js:549-566`, angewandt in `:999`" | **nicht abgeglichen** (Zeilenangaben nicht einzeln nachgeschlagen) | — |

---

## 11. Widersprüche zwischen den Quellen (eigener Befund)

1. **`docs/audit-tief.md` widerspricht sich selbst zum Determinismus.** §3 („Determinismus")
   meldet **grün** und §15 zählt `determinismus` unter den grünen Feldern, während die Ampel
   in §17 `zufall` als **HOCH** führt. Beide beziehen sich auf **denselben** Treffer
   (`src/engine/replay.js:85`). Der Bericht hat die Einordnung nicht, die der Auftraggeber
   in `bgworker-todo.json` M5 nachgeliefert hat (Fall **b**: Metadatum, Hash unverändert,
   gepinnt in `tests/replay-uhr.test.js`).
2. **`bgworker-todo.json` M4 gegen `docs/audit-tief.md` §17** zu den toten Exporten:
   M4 sagt „`GERAETE_SCHLUESSEL`/`isValidAngle`/`isValidPower` leben intern und bleiben",
   das Audit führt sie als offene TODO-Punkte. Beides zusammen ist nicht haltbar —
   entweder ist der Export gewollt, dann gehört der TODO-Punkt gestrichen, oder er ist tot,
   dann gehört die Begründung in M4 korrigiert.
3. **`bgworker-todo.json` O3 gegen `MASTERDOTO.md:1507`**: O3 sagt „Code erledigt",
   die SSOT sagt an einer Stelle 70 Zeilen weiter oben noch „Günther bleibt online unsichtbar".
   Die SSOT ist damit an dieser Stelle gegen den eigenen Worker-Stand.
4. **`MASTERDOTO.md` gegen sich selbst, mehrfach** (jeweils steht die alte Fassung als
   offener Satz unter einer `[x]`-Überschrift, ohne als historisch gekennzeichnet zu sein):
   Draft (`:2639` gegen `:2617`), Sidegrades/Counterplay (`:3357` gegen `:3360`),
   Auto-Turret (`:2561`/`:2241` gegen `:1800` im Code), Günther online (`:1507` gegen
   `main.js:1165`), Böden-Physik (`:3330` gegen `W7`), `fire()`-Zerlegung (`:318` gegen
   `src/engine/shooting.js`). **Muster:** die `[x]`-Zeile wurde gesetzt, der darunter
   stehende Prosasatz nicht mitgezogen.
5. **Zwei Zahlen zur selben Sache in der SSOT:** die Matrizen-Doku nennt „22 % der
   Klassentabellen wirksamkeitslos / vier Dimensionen" (`MASTERDOTO.md:4375-4376` als
   richtiggestellt markiert) — **dieselbe Stelle** führt 18 Zeilen später fünf Schlüssel
   und `classSpeed` als doch wirksam. Die Richtigstellung ist vorhanden (`:4374-4392`),
   der alte Satz aber nicht entfernt.
6. **Zeilenangaben im `bgworker-todo.json` driften** (`replay.js:66` statt `:85`), während
   `docs/audit-tief.md:208` dieselbe Stelle mit `:85` **richtig** nennt. Wer dem Worker-Dokument
   folgt, sucht an der falschen Zeile.

---

## 12. „Offen, nicht abgeglichen" — was diese Prüfung NICHT geleistet hat

Ehrlich benannt, damit niemand diesen Bericht für vollständig hält:

- **~80 der 96 `[x]`-Punkte** in den offenen Abschnitten sind **nicht** gegen den Code
  geprüft — nur die mit Rest-„offen"-Wortlaut, plus die 15 unten genannten Stichproben.
  Namentlich nicht abgeglichen sind unter anderem: `MASTERDOTO.md:2593-2606` (Client-Prädiktion
  im Detail), `:2612` (Lobby-Browser), `:2699` (`/healthz`-Zähler), `:3022-3024`
  (Matcharten berechnet, Determinismus bei 40 Figuren), `:3416-3421` (Anti-Cheat-Audit),
  `:3501-3515` (974 tote Zeilen), `:3555` (`damageTypes.js`), `:3787-3803` (Raritäts-Gewichte),
  `:3807-3845` (Kisten-Radius im Detail).
- **Zeilenangaben in der Dokumentation** (z. B. `MASTERDOTO.md:4214`, `:4360`,
  `src/client/main.js:124`, `:537`) wurden nur dort nachgeprüft, wo sie für ein Urteil
  nötig waren.
- **Kein Testlauf.** Die Testzahl 1057 und die Gate-Zahl 21 sind **Dokumentangaben**; nur
  die Dateizahl (103) und die E2E-Spec-Zahl (28) sind hier gemessen.
- **Kein Browser.** Alle Aussagen über Anzeige/Zeichnung (Günther online, Kisten-Icons,
  Kantenlicht) sind Code-Lesungen.
- **`docs/audit-tief.md` ist ein Werkzeugstand vom 2026-09-26T18:36 (Commit `d2d8495`)**
  und damit **älter** als `bgworker-todo.json` (Nacht) und als der heutige HEAD. Seine
  8 TODO-Punkte spiegeln einen Stand, den die drei Reparaturen desselben Abends
  (`bericht.mjs`, `check-maelstrom.mjs`, `measure-network.mjs`) zum Teil überholt haben.

---

**Erzeugt durch rein lesende Prüfung.** Einziger Schreibzugriff: diese Datei.
Gelesen wurde ausschließlich im Repo
`/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon` an HEAD `f28bbed`.
