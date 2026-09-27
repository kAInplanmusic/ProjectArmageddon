# TODO-Verifikation 2 — Verifikationsstand und Audit-Abschnitte gegen den Code geprüft

**Bereich:** `MASTERDOTO.md`, Zeilen 375–1352:
`Verifikationsstand` (375–401) · `Befund zur E2E-Batterie` (403–465) · `Ein E2E-Fehler, der im TEST lag` (467–489) ·
`Die vorbestehenden E2E-Fehler` (491–520) · die sieben Haken (522 / 553 / 627 / 635 / 846 / 884 / 900) ·
`Audit 2026-09-17` (746–758) · `Fortsetzung 2026-09-18` inkl. Bot-Umbau (760–844) ·
`In diesem Durchgang gefundene und behobene Fehler` (939–1069) · `Fortsetzung 2026-09-11` (1071–1185) ·
`Fortsetzung 2026-09-11 (2)` (1186–1350).
Nicht in diesem Bericht: alles ab Zeile 1352 (anderer Prüfer).

| | |
|---|---|
| Datum | 2026-09-27, 10:10–10:47 CEST |
| Git-Stand **vorher** | `6b59573` (`main`) |
| Git-Stand **nachher** | `2d365d3` — **neun** Commits während der Prüfung (`git rev-list --count 6b59573..HEAD` → 9; vier Arbeiter in `src/`). Alle Fundstellen unten sind über **Namen** verankert. Die Haken lagen vorher und nachher auf denselben Zeilen (522/553/627/635/846/884/900), ebenso die Abschnittsköpfe (375/746/760/939/1071/1186/1352) — geprüft um 10:41 |
| Art der Prüfung | **rein lesend.** Kein `npm test`, kein `npm run test:e2e`, kein `npm run checks`, kein `npm run build`. Benutzt: Datei-/Code-Lesung, `git show`/`git worktree`, einzelne `node --test <eine Datei>`, einzelne Lese-Gates (`check-docs`, `check-effects`, `check-fuses`, `check-achievements`, `matrix:check`), `npm run validate`, `npm run lint`, `npm run perf`, `npm run balance`, `npm run smoke:fast`, `npx playwright test --list` (listet nur, startet keinen Lauf) |
| Punkte im Bereich | **84** geprüfte Behauptungen: 20 Tabellenzeilen des `Verifikationsstand` · 5 E2E-Aussagen · 1 Audit-Aussage · 4 Aussagen der Fortsetzung 2026-09-18 · 8 zu den sieben Haken (7 Haken + 1 Zusatzaussage) · 19 Fehler 1–18 + Betriebszähler · 14 der Fortsetzung 2026-09-11 · 13 der Fortsetzung 2026-09-11 (2) |
| Urteile | **62 BESTÄTIGT · 13 WIDERLEGT · 9 NICHT PRÜFBAR** — jede Zeile trägt genau **ein** Urteil (nachgezählt über die Zeilen, nicht geschätzt) |

**Der Baum bewegt sich — drei gemessene Zahlen desselben Tages:**

| Messung | 10:10 | 10:40 | 10:43 |
|---|---|---|---|
| `tests/*.test.js` | 111 | 116 | **117** |
| `src/**/*.js` (Dateien / Zeilen) | 90 / 40.601 | 92 / 42.460 | **92 / 42.596** |
| `test(`-Aufrufe in `tests/*.test.js` | — | 1.169 | **1.191** |

⚠️ **Folge, die noch am Prüftag eintrat:** `node scripts/check-docs.mjs` lief um 10:14 noch mit Exit 0,
um 10:41 mit **`FEHL README: 112 Testdateien — wirklich 116`** (Exit 1). Die README nennt 112, fünf
Arbeiter legten zwischen 10:31 und 10:40 fünf Prüfdateien an. Jede Datei- und Testzahl in diesem
Bericht ist deshalb **mit Messzeit** genannt und keine davon ist als Dauerwert zu lesen.

---

## 1. `Verifikationsstand` — die Tabelle (Zeilen 380–401)

| Behauptung | Urteil | Beleg | Heute gültige Zahl |
|---|---|---|---|
| `npm run lint` grün, 0 Fehler | **WIDERLEGT** *(zur Messzeit)* | 10:41 `npm run lint` → Exit 1, `tools/audit-mcp/lib/statisch.mjs:293 error 'EINSTIEG' is not defined`. **Ursache ist eine fremde, noch nicht committete Änderung:** `git status` zeigt `M tools/audit-mcp/lib/statisch.mjs` (Umbau `EINSTIEG` → `EINSTIEG_MUSTER`), `git diff` Commits unberührt. Gegen **HEAD** ist Lint sauber: `git worktree add /tmp/pa-head HEAD` + `eslint .` → 0 Meldungen; 10:14 lief `npm run lint` im `smoke:fast` noch grün | committeter Stand: 0 Fehler · Arbeitsbaum 10:41: **1 Fehler** |
| `npm test` **983/983** grün | **WIDERLEGT** | MASTERDOTO. Kopf (Zeile 33) und README nennen **1122/1122** (voller Lauf, 281,5 s, laut `check-docs` einheitlich); die Zeile hier ist der Stand vom 2026-09-20. Voller Lauf in diesem Auftrag verboten | **1122** bestanden, 0 rot, 0 übersprungen (README/MASTERDOTO, nachgemessen 2026-09-26; nach dem Zuwachs nicht erneut gemessen) |
| Browser-E2E **183 grün / 0 rot / 1 übersprungen** in 25,2 min | **WIDERLEGT** | `npx playwright test --list` (10:22, führt nichts aus) → **Total: 194 tests in 30 files**; README nennt „191 Tests in 30 Spezifikationen (190 grün, 1 übersprungen, 0 rot), ~25 min" | **194** Tests / 30 Dateien *(gelistet; Laufzahl = 190 grün + 1 übersprungen + 3 `test.fixme`-freie Sonderfälle — die Laufzahl selbst nur per E2E)* |
| Rauchtest `npm run smoke:fast` 4/4 in ~30 s | **BESTÄTIGT** | 10:14 gefahren: „4 von 4 Schritten OK in 45,6 s" (Verkabelung, Lint, Kern-Tests, Serverstart) | 4/4, **45,6 s** |
| Build `npm run build` grün | **NICHT PRÜFBAR** | verboten in diesem Auftrag. Klärt: `npm run build` | — |
| Validierung `npm run validate` grün | **BESTÄTIGT** | 10:20 gefahren: „ProjectArmageddon skeleton is valid.", Exit 0 (lädt shared/engine/server/client) | grün |
| Performance: 0 Ticks über 16,7 ms, **123×** Echtzeit, p99 **0,40 ms** | **BESTÄTIGT** *(Zahlen schwanken)* | 10:22 `npm run perf`: „Über Budget: 0 Ticks (0 %)", 18 000 Ticks, mittel 0,076 ms, p99 0,331 ms, **140,5×** Echtzeit, Exit 0. Der Hinweis „der Echtzeitfaktor schwankt mit der Rechnerlast" trifft zu | 0 Ticks · **140,5×** · p99 **0,331 ms** |
| Balance: **71** Waffen mit Schaden am Ziel, **36** Selbstwirkungs-Waffen (alle wirksam), **43** ohne Wirkung, „immer blockiert: **0**" | **BESTÄTIGT** | 10:24 `npm run balance` misst exakt dasselbe: „Schaden am Ziel: 71 … Selbstwirkung: 36 (36 wirken nachweislich, 0 nicht) … Ohne Schaden NUR auf dieser Entfernung: 43 … immer blockiert: 0" | 71 / 36 / 43 / 0 — unverändert |
| Balance (Sweep): Median Shots-to-Kill **13**, neun Entfernungen 40–2440 px | **NICHT PRÜFBAR** | `npm run balance:sweep` lief 10:26–10:49 (**22 min** CPU bei 99,5 %) und hatte **nicht abgeschlossen** (der Bericht schreibt erst am Ende; der Lauf wurde abgebrochen, um die schreibenden Arbeiter nicht zu stören). Klärt: `npm run balance:sweep` (>25 min einplanen) | — |
| Wirkfelder: `check:effects` 0 Verstöße; vorher 8 Waffen ohne Motor (6 `piercing`, 2 `homing`) | **BESTÄTIGT** | 10:22 `node scripts/check-effects.mjs` → Exit 0: `homing 2`, `piercing 6`, „aoe = (blastRadius > 0): ok für alle 150 Waffen", „Waffen: 150 \| Verstöße: 0" | 0 Verstöße · 6 `piercing` · 2 `homing` |
| Wirkungs-Übersicht: 150 Waffen, **6 Zerstörungsgrade (46–28.353 px²)**, 8 Terrain-Arten | **WIDERLEGT** | `matrix:check` Exit 0 → `docs/matrix-terrain-waffen-wirkung.md` ist aktuell. Kapitel 2 listet **fünf** Grade: „1 Kratzer 50–50", „2 Loch 201–1018", „3 Trichter 1257–4778", „4 Krater 5542–13273", „5 Großkrater 20106–28353 px²". 150 Waffen ✔, 8 Terrain-Arten ✔ (`check-docs`: „ok MASTERDOTO: 8 Terrain-Arten"), Wasserlinie + leerer Innenraum ✔ (Kap. 3) | **5** Zerstörungsgrade, **50–28.353 px²** |
| Prüfwerkzeuge: `npm run checks` **21 Gates, 0 Verstöße**, seit 2026-09-20 in der CI | **BESTÄTIGT** | `grep -c "skript: '" scripts/checks.mjs` → 21; `check-docs` → „ok MASTERDOTO: 21 Gates"; `.github/workflows/ci.yml` ruft „Prüfwerkzeuge (alle Gates): `npm run checks`". **5 der 21 Gates** heute einzeln gefahren und grün: `check-docs`, `check-effects`, `check-fuses`, `check-achievements`, `matrix:check`. Der Gesamtlauf ist in diesem Auftrag verboten | 21 Gates; Dauer **nicht gemessen** (MASTERDOTO Zeile 41 nennt ~40–52 s) |
| Node-Version `>=22` in `package.json` → `engines` | **BESTÄTIGT** | `package.json` `"engines": {"node": ">=22"}`; `ci.yml` `node-version: '22'`; `check-docs` → „ok Node-Version >=22" | `>=22` |
| GPU-Pfad: profiling **7/7 grün**, „13,6 ms je Mio. Pixel", „verlangt mehr als 20 fps" | **NICHT PRÜFBAR** (Zahl 7 stimmt) | `tests/e2e/profiling.spec.mjs`: `FORMEN = ['mountains','islands']` → 2×2 Schleifen-Tests + „Bildzeiten auf dem echten Grafikpfad" + „Das Spiel kostet deutlich weniger als ein 60-Hz-Budget" + „Terrain-Neuaufbau" = **7**. Die geforderten Werte stehen in `pruefeHardwareMessung`: `msProMioPixel < 30`, `fps > 12`, `max < 500 ms` — **kein** `>20 fps`-Kriterium mehr; der Code-Kommentar nennt als Bezug 12,7 ms (kopflos) bzw. 9,3 ms (Fenster), nicht 13,6. Ein Lauf ist verboten. Klärt: `npm run test:e2e tests/e2e/profiling.spec.mjs` | 7 Tests; Schwellen heute 30 ms/Mio. px und >12 fps |
| Zünder-Absicht: `check:fuses` 0 Verstöße, **11 `timed`**, **7 `impact`** | **BESTÄTIGT** | 10:22 `node scripts/check-fuses.mjs` → Exit 0: „Waffen mit Zünder: 11 … Absicht aus der Designdatei: timed 11 \| impact 7 … Verstöße: 0". 11+7 = 18 = die genannte Vorgängerzahl | 11 `timed` / 7 `impact` |
| Erfolgs-Schwellen: `check:achievements` Exit 0 | **BESTÄTIGT** | 10:22 → Exit 0, Schlusszeile „Alle Partie-Schwellen und Raten sind erreichbar oder in Reichweite." | Exit 0, 11 Erfolge |
| Replay: Zustandshash **`9ec63e8c`** identisch, 2440 Ticks, Runde 13 | **BESTÄTIGT** | `artifacts/replay-20260910.json`: `expected = {status: "gameover", round: 13, tick: 2440, stateHash: "9ec63e8c"}`, 38 Eingaben, Format 1 (Stand 2026-09-26 19:49). `src/engine/systems/lootSystem.js` nennt denselben Wert als den heute gültigen (die Änderung, die ihn auf `384c51cf` verschieben würde, wurde zurückgenommen). Der Verify-Lauf selbst ist nicht gefahren (schreibt nach `artifacts/`) | `9ec63e8c`, 2440 Ticks, Runde 13 — Artefakt deckt sich |
| Determinismus: „manuell, 3000 Ticks, Seed 4242 → `bc9695fa`, Seed 9999 → `c0531097`" | **NICHT PRÜFBAR** | Die Werte stammen aus `docs/audit-selbst.md` (2026-09-17, „über 3000 Ticks eines laufenden Matches **mit Schüssen**"); der genaue Aufbau (Teams, Zugzeiten, Schussfolge) ist nicht dokumentiert und mit dem heutigen Waffenkatalog auch nicht mehr derselbe. Die **Eigenschaft** ist belegt: `node --test tests/state-hash.test.js` → **10/10 grün** (10:31), u. a. „Zwei gleiche Läufe ergeben denselben Hash". Klärt: Probe mit festgehaltenem Aufbau + `stateHash()` nach 3000 Ticks | — |
| Lasttest: 8 Clients / 4 Lobbys stabil | **BESTÄTIGT** | `node --test tests/load.test.js` → **2/2 grün** (10:26, 7,8 s); der Test baut genau diesen Aufbau: „Vier Lobbys à zwei Spieler = acht Clients" | 8 Clients / 4 Lobbys, grün |
| Bot-Treffsicherheit entfallen | **BESTÄTIGT** | `src/server/bot.js`, `scripts/check-bots.mjs`, `tests/bot-ai.test.js` existieren **nicht**; `package.json` hat kein Skript `check:bots` | entfallen |

---

## 2. E2E-Abschnitte (403–520)

| Behauptung | Urteil | Beleg |
|---|---|---|
| „NEUER STAND (2026-09-20, dritter Durchgang): **182 grün, 1 rot**, 1 übersprungen (22,5 min). Der rote ist ‚Bildzeiten auf dem echten Grafikpfad' … **verlangt mehr als 20 fps** — gemessen 17,2 fps … **Ohne GPU dieses Rechners ist das nicht zu erfüllen**" | **WIDERLEGT** | Drei belegbare Fehler in fünf Zeilen: (a) die Zeile **direkt darüber** in derselben Tabelle sagt 183 grün / **0 rot** — zwei Stände desselben Datums, die sich widersprechen; (b) „verlangt mehr als 20 fps" gilt **nicht mehr**: `pruefeHardwareMessung` in `profiling.spec.mjs` prüft `msProMioPixel < 30`, `fps > 12`, `max < 500 ms` — der fps-Festwert wurde laut Code-Kommentar ausdrücklich ersetzt („Warum nicht mehr ‚> 20 fps'", „FUND belegt 2026-09-20"); (c) ohne GPU **scheitert** der Test nicht, er **überspringt sich selbst mit Begründung** (`test.skip(true, 'Nur Software-Rasterung verfügbar …')`), und die Erkennung prüft `/swiftshader\|llvmpipe\|softpipe\|software\|offscreen/i`. Ein roter Lauf dieses Tests ist damit ein Last- oder Umgebungsbefund — genau das, was die README seit dem 2026-09-27 als **LASTempfindlichkeit** beschreibt („900 ms längstes Bild gegen ein 500-ms-Limit") |
| „Die frühere Angabe 160/160 gilt nicht mehr; die Batterie hat **16 reproduzierbare Ausfälle**", A/B-Tabelle 16/16 gegen Baseline `9cb5fe5` | **NICHT PRÜFBAR** | Historische Messung vom 2026-09-19; der A/B-Worktree und die acht genannten Testdateien wurden nicht nachgefahren (E2E verboten). Der Text ist als Zeitdokument gekennzeichnet, die Zahl der Ausfälle hängt aber am heutigen Zustand (194 Tests). Klärt: `git worktree add /tmp/pa-base 9cb5fe5` + `npx playwright test tests/e2e/<acht Dateien>` |
| „profiling (7 Ausfälle): die Hardware dieses Rechners … 300 Bilder, Mittel 48,8 ms, 20,5 fps, Terrain-Neuaufbau 2435 ms" | **NICHT PRÜFBAR** | Messwerte des 2026-09-19 (Software-Rasterung). Die Ursachendarstellung ist inzwischen überholt (siehe Zeile darüber): `pruefeSoftwareMessung` prüft heute Ausreißer Faktor 50 und eine Notgrenze 15 000 ms, die harte Produktaussage hängt am Hardware-Block |
| „Ein E2E-Fehler, der im TEST lag (emblem.spec): 3 von 6 Läufen rot, nach der Behebung 30/30 grün" | **NICHT PRÜFBAR** (Ursache korrekt beschrieben) | `tests/e2e/emblem.spec.mjs` existiert und liest die Spielerliste; die Läufe selbst nicht gefahren. Klärt: `npx playwright test tests/e2e/emblem.spec.mjs --repeat-each=6` |
| „Nachweis: `turret.spec.mjs` **5/5**, `drop-cooldown.spec.mjs` **7/7**, `profil.spec.mjs` **8/8**, `runtime-smoke.spec.mjs` **10/10**, `multiplayer:224` grün, `terrain-presets:48` grün" — dazu die vier Produktfehler (Geschütz-Reichweite, untergetauchte Figuren, Abwurfkiste, `#profil-reset`) | **WIDERLEGT** (eine Zahl) | Testdateien und -zahlen statisch geprüft: `turret` 5 ✔, `drop-cooldown` 7 ✔, `runtime-smoke` 10 ✔, **`profil.spec.mjs` aber 9** (heute), `terrain-presets.spec.mjs` 5, `multiplayer.spec.mjs` 10. Die vier Produktfehler-Behebungen sind im Code vorhanden (`weitenFaktor` in der Geschützreichweite, `#drySpawnX` mit Körperpunkt, Wurfweite aus der Zieldistanz, `.overlay-card` mit `max-height`/`overflow-y`). Ob sie **grün** sind, ist in diesem Auftrag nicht geprüft |

---

## 3. Audit 2026-09-17 (746–758)

| Behauptung | Urteil | Beleg |
|---|---|---|
| Vier Audit-Berichte in `docs/` (`audit-selbst.md`, `audit-code.md`, `audit-userflow.md`, `audit-blackbox.md`) | **BESTÄTIGT** | alle vier Dateien vorhanden; `docs/audit-selbst.md` trägt tatsächlich die 3000-Tick-Determinismus-Messung mit `bc9695fa`/`c0531097` |

---

## 4. Fortsetzung 2026-09-18 (760–844)

| Behauptung | Urteil | Beleg |
|---|---|---|
| `check:terrain` widersprach seiner eigenen Messung; der Schluss wird jetzt **aus der Messung** gebildet (`KANTEN_STUFEN`, `kantenStufe()`) | **BESTÄTIGT** | `scripts/check-terrain-look.mjs` importiert `KANTEN_STUFEN, kantenStufe` und baut die Alpha-Reihe über `Array.from({length: KANTEN_STUFEN}, (_, stufe) => …kantenStufe(BOEDEN[0].farbe, stufe))`; der frühere feste Satz steht nur noch als Fundstelle im Kommentar |
| Alpha-Reihe im Kommentar war falsch („0,22 → 0,15 → 0,10"), richtig ist **0,22 · 0,11 · 0,073** | **BESTÄTIGT** | `src/client/terrainBaker.js` Kommentar nennt die Korrektur, die Rechnung steht als `const alpha = 0.22 * anteil;` im Code |
| Kommentar in `src/shared/config/match.js` nannte eine überholte Teamgrenze; geltend ist `MAX_PLAYERS_PER_TEAM = 6` (`src/server/lobby.js`) | **BESTÄTIGT**, *Fundort veraltet* | `match.js` Kommentar nennt `MAX_PLAYERS_PER_TEAM = 6`; die Konstante steht heute in `lobby.js` **Zeile 72**, nicht `:32` (Zeilennummern wandern — die Aussage hält über den Namen). Zusatz: die Konstante bedeutet heute „Einheiten **je Mensch**" (1–6), die Obergrenze der Figuren ist `MAX_LOBBY_FIGURES = 40` |
| Der Server-Bot wurde neu gebaut: `src/server/bot.js`, `scripts/check-bots.mjs`, Messungen „6 Seeds × 5 Skill-Stufen, 1017 Schüsse", „32/32 = 100 %", „Solvgenauigkeit 0,000 px", `tests/bot-ai.test.js` rechnet unabhängig nach | **WIDERLEGT** (als Aussage über den heutigen Code) | **Keines der genannten Artefakte existiert:** `src/server/bot.js`, `scripts/check-bots.mjs`, `tests/bot-ai.test.js` sind fort. Der Abschnitt ist im Text selbst als überholt gekennzeichnet („es gibt keine Bot-KI"), die Messzahlen darin sind damit nicht reproduzierbar. **Geblieben** ist die gemeinsame Rechnung: `src/shared/ballistics.js` + `src/shared/launchSpeed.js` existieren und werden gelesen von `turret.js`, `shooting.js`, `match.js`, `systems/projectileSystem.js`, `client/shotPrediction.js` — also von **fünf** Lesern, nicht von vier (der vierte war der Bot) |

---

## 5. Die sieben abgehakten Punkte (522 / 553 / 627 / 635 / 846 / 884 / 900)

| Behauptung | Urteil | Beleg |
|---|---|---|
| „`#cfg-preset` entfernt — das Feld bewirkte nichts": Auswahl + „Karten-Synergie" aus dem Menü, `fillTerrainAffinity()` im Client entfernt, `TERRAIN_AFFINITY` bleibt in der Hilfe | **BESTÄTIGT** | `index.html` enthält **kein** `cfg-preset` mehr; in `src/` gibt es den Namen nur noch in zwei Kommentaren (`main.js`), `fillTerrainAffinity` nur als Kommentar; `TERRAIN_AFFINITY` lebt in `terrainGen.js` und wird von `main.js` für die Hilfe durchlaufen |
| ↳ Zusatz im selben Haken: „Die zwei Kulissen-Tests bleiben vorerst `test.fixme`" | **WIDERLEGT** | In `tests/e2e/` gibt es heute **kein** `test.fixme` und kein `fixme` (0 Treffer). Die Prüfung ist inzwischen echt und in `tests/terrain-presets.test.js` verankert: „Alle Geländeformen haben eigene Kulissen — oder stehen namentlich hier" und „Die Leitbiom-Gegenprobe erkennt eine verdrehte Zuordnung" |
| Schuss-Ablehnung: Server reicht den Client-Tick in `validateCommand` (Grenze `maxTickDrift` = **400**), die harte `history.isWithinWindow`-Prüfung ist **entfernt**; `tests/anti-cheat.test.js` neu gefasst (erfundene Ticks abgelehnt, veralteter plausibler Tick angenommen) | **BESTÄTIGT** | `src/shared/validation.js`: `maxTickDrift: NETWORK_RULES.lagCompensationBufferMs * 2` und `lagCompensationBufferMs: 200` → **400** ✔. `src/server/gameServer.js` `#handleInput` übergibt `tick` an `validateCommand`; `isWithinWindow` kommt im Serverpfad nur noch im **Kommentar** vor (der Aufruf ist fort), `isTickInWindow` prüft gegen `maxTickDrift`. `node --test tests/anti-cheat.test.js` → **13/13 grün** (10:29), darunter exakt „Der Client kann keinen ERFUNDENEN Tick einschleusen" und „Ein veralteter, aber plausibler Tick wird angenommen — nur die Rückrechnung entfällt" |
| Nebenbefund: der Unit-Test „Alle Formen sind im Menü wählbar" (`tests/terrain-presets.test.js`) ist entfernt, mit Begründung im Kommentar | **BESTÄTIGT** | kein Test dieses Namens in `terrain-presets.test.js` (10 Tests, alle andere Aussagen: Spielbarkeit über Wasser, vier neue Formen unterscheidbar, Flut/Wasser, offene Weite, Steilheit, Kulissen, Leitbiom + Gegenprobe, Determinismus) |
| `prediction-online:102` behoben — der Test prüft den Zustand **beim Abschuss** statt nach 200 ms; „4 Läufe, 4× grün" | **BESTÄTIGT** *(Behebung; die vier Läufe sind E2E und hier nicht gefahren)* | Die **Ursachenanalyse und Behebung** sind im Test nachweisbar: `tests/e2e/prediction-online.spec.mjs` zapft `sp.begin` an (`const original = sp.begin.bind(sp); sp.begin = …`), liest `aktiv`/Bahnpunkte/Einschlag unmittelbar nach dem Schuss und sichert `expect(waehrend.aktiv, 'Die Vorhersage muss stehen, bevor die Antwort da ist').toBe(true)`. Die vier Läufe sind E2E und in diesem Auftrag nicht gefahren |
| Reichweite: **eine** Auffassung für Spieler, Geschütz und Prüfung (`geschwindigkeitsFaktor`/`weitenFaktor`), Feld `#reichweite` entfernt, `tests/reichweite-konsistenz.test.js` **4 Tests** | **BESTÄTIGT** (Zahl veraltet) | `src/shared/reichweite.js` exportiert `reichweitenFaktor`, `geschwindigkeitsFaktor`, `weitenFaktor`; Lesestellen: `shooting.js` (Hitscan-Strahl, Bahn), `match.js` (Abschussgeschwindigkeit, Geschützwirkung), `turret.js`, `systems/projectileSystem.js`, `client/shotPrediction.js`. `#reichweite` existiert nur noch als Kommentar. `node --test tests/reichweite-konsistenz.test.js` → **8/8 grün** (10:28) | 
| Hitscan-Waffen skalieren mit der Karte: `weapon.maxRange * weitenFaktor(this.width)` in `#resolveHitscan` | **BESTÄTIGT** *(Datei verschoben)* | Die Rechenzeile steht heute in `src/engine/shooting.js`: `let laenge = Math.max(1, (waffe.maxRange \|\| 0) * weitenFaktor(quelle.width));` (der Methodenkopf `#resolveHitscan` wanderte beim Zerlegen von `match.js` nach `shooting.js`). Der Strukturtest dazu lebt: `tests/reichweite-konsistenz.test.js` „Der Strahl einer Hitscan-Waffe folgt der Karte" |
| Lebensdauer: der Deckel bleibt, das Geschoss **detoniert** im Flug statt lautlos zu verschwinden; Beleg in `tests/reichweite-konsistenz.test.js` | **BESTÄTIGT** | Testname vorhanden: „Ein Geschoss am Lebensdauer-Deckel detoniert — es verschwindet nicht lautlos"; die Datei läuft **8/8 grün** (10:28) |

---

## 6. Fehler 1–18 + Betriebszähler (939–1069)

| Behauptung | Urteil | Beleg |
|---|---|---|
| (1) Hitscan-Waffen richteten keinen Schaden an — **76 von 150** Waffen; `#findMuzzle` + `#playerAt(x, y, excludeId)` | **WIDERLEGT** (Zahl) | Die Struktur hält: `match.js` hat `#findMuzzle` und `#playerAt(x, y, excludeId)` (Aufrufe im Hitscan-Pfad mit `shooterId`). Die Zahl stimmt nicht mehr: der Katalog führt heute `delivery` `projectile: 96`, `hitscan: 54` |
| (2) Projektile verschwanden im ersten Schritt (**74 Waffen**); Mündungsversatz + Ausschluss des Eigentümers in `ProjectileSystem.update` | **WIDERLEGT** (Zahl) | Ausschluss steht (Kommentar in `systems/projectileSystem.js` in der Nähe der `owner`-Prüfung); die Projektilzahl ist heute **96**, nicht 74 |
| (3) Alle Waffen hatten denselben Schaden (**25**) → jetzt Schaden **0–110**, **54** mit Flächenwirkung, **74** Projektile | **WIDERLEGT** (zwei von drei Zahlen) | `damage` min/max heute **0/110** ✔ (eigene Zählung über `WEAPONS`). `blastRadius > 0`: **56** (nicht 54). `delivery === 'projectile'`: **96** (nicht 74). Die Matrix-Seite nennt dieselben Werte („56 Flächenwirkung", „Zustellart: 96 Projektile · 54 Hitscan") |
| (4) Wasser stapelte unbegrenzt / verlor bei Verdrängung; `step()` läuft jetzt von **unten nach oben**, Massenerhaltung exakt und getestet | **BESTÄTIGT** | `src/engine/waterField.js` `step()`: „Von UNTEN nach OBEN verarbeiten. Nur so ist die Kapazität der Zelle unter …"; `verdraenge()` prüft die Kapazität. Tests: `tests/water-drowning.test.js` „Massenerhaltung bleibt gewahrt", `tests/gameplay.test.js` „die CA darf Wasser weder erzeugen noch vernichten" |
| (5) `maxRounds` wurde nie erzwungen → harte Rundengrenze im `#onRoundStart`, Sieger nach Restgesundheit | **BESTÄTIGT** | `match.js` `#onRoundStart()`: `if (this.#round > this.maxRounds) { this.#finishByAttrition(); return; }` mit Kommentar „deterministisch, kein Unentschieden-Fallback" |
| (6) Delta-Encoding verglich skalierte gegen unskalierte Werte → gemeinsamer Helfer `toDeltaBase()` | **BESTÄTIGT** | `src/shared/protocol.js` `export function toDeltaBase(state)`; Nutzer `gameServer.js` (`const nextPrevious = toDeltaBase(state);`) |
| (7) Replay lief endlos → `recorder.finalize(totalTicks)` + abgeleitete Standardgrenze | **BESTÄTIGT** | `src/engine/replay.js` `finalize(totalTicks)` und die Wiederherstellung `if (Number.isInteger(parsed.totalTicks)) recorder.finalize(parsed.totalTicks)`; Aufrufer `gameServer.js` und `persistence.js` |
| (8) Ein Waffen-Icon fehlte (`IMG_9049`), Portierung als `scripts/create-weapon-icons.py` (Pillow) → **150/150** | **BESTÄTIGT** | `scripts/create-weapon-icons.py` vorhanden; `src/client/assets/icons/` enthält genau **150** `*_icon.png` |
| (9) Race Condition zwischen `startMatch` und dem Deaktivieren der Render-Schleife | **BESTÄTIGT** (Struktur) | `tests/e2e/runtime-smoke.spec.mjs` trägt den Fund als Kommentar („zwischen `startMatch()` und einem nachgelagerten `setAutoLoop(false)`") und startet das Match jetzt über eine Hülle. Ein Lauf ist E2E |
| (10) Tastatursteuerung griff in Formularfelder → gemeinsamer Helfer `isTextEntry()` in `src/client/dom.js` | **BESTÄTIGT** | `dom.js` `export function isTextEntry(target)`; benutzt in `input.js` und `main.js` (beide keydown-Handler) |
| (11) Fokusindikatoren und Tastaturbedienung fehlten → `:focus-visible`, Skip-Link, fokussierbares Canvas, `[hidden]`-Ausblendung | **BESTÄTIGT** | `index.html`: `:focus-visible {`-Regel, `[hidden] { display: none !important; }`, `<a id="skip-to-board" href="#game-canvas">`, Canvas mit `tabindex="0"`, verborgene Overlays `.overlay[hidden]` |
| (12) Frisch angelegte Lobbys überlebten keinen Neustart → über den Lobby-Manager; „abgesichert in `tests/persistence-restart.test.js`" | **BESTÄTIGT** (Struktur) | Testdatei vorhanden (2 Tests); `src/server/persistence.js` führt den Zustandsdump über den Lobby-Manager und hat `session?.recorder?.finalize?.(ticks)` für Lobbys ohne Kern. Lauf nicht gefahren (schreibt Zustandsdateien) |
| (13) `totalTicks` blieb beim Speichern auf 0 → `finalize()` in `serializeLobby` | **BESTÄTIGT** | `persistence.js` Kommentar „`finalize` arbeitet mit …" + Aufruf `session?.recorder?.finalize?.(ticks)` |
| (14) Gravitation der Quelldaten als Multiplikator übernommen: **26 Waffen** mit `gravity` (62–92), **19 exakt 65**; jetzt `gravityScaleFor`, Bereich **0,95–1,42** | **BESTÄTIGT** | Designdatei `project_armageddon_weapons_v1.json`: 26 Waffen mit `gravity ≠ 0`, davon **19 × 65**, Werte 62/70/72/78/80/82/92. Katalog heute: `gravityScale` min **0,9538** / max **1,4154** — die genannte Spanne stimmt auf zwei Stellen. Die Folgezahl „23 Waffen wurden funktionsfähig" ist eine damalige Messung und nicht nachgeprüft |
| (15) `damageSource` eingeführt: **94** echte Werte, **52** Platzhalter, **4** ohne Wert | **WIDERLEGT** | eigene Zählung über `WEAPONS`: `{source: 98, derived: 45, none: 7}`. Der Generator (`scripts/build-weapon-catalog.mjs`) kennt `'source' \| 'placeholder' \| 'none'` und schreibt `placeholder` in **`derived`** um — die Kategorie heißt heute anders. Die Summe „ohne Designwert" (45+7 = **52**) deckt sich mit dem Balance-Bericht („Mit Ersatz-Schadenswert … 52") |
| (16) **25 Nutzwaffen** hatten keine Wirkung (Teleport, Jetfallschirm, Heilung, Schild, Munition) | **BESTÄTIGT** *(Struktur; die Zahl 25 ist eine historische Zählung)* | Die Wirkungen sind verdrahtet: `check:effects` liest für 150 Waffen **8 Wirkfelder mit Motorlesern** und meldet 0 Verstöße; die Selbstwirkungs-Waffen (36) wirken laut Balance-Bericht „alle nachweislich"; `tests/specials.test.js` und `tests/effects.test.js` bestehen. Die Zahl **25** ist eine historische Zählung; heute richten laut README 143 von 150 Schaden an, 7 nicht |
| (17) `step()` leerte die Ereignis-Warteschlange (`drain()`) — behoben, dazu eine Obergrenze | **BESTÄTIGT** | `match.js` `step()` trägt den Kommentar „KEIN `drain()` hier: das würde die Warteschlange leeren …"; `tests/events.test.js` „EventBus: die Warteschlange wächst ohne Abnehmer nicht unbegrenzt" |
| (18) Kein Test prüfte den Ereignisstrom → `tests/events.test.js` modelliert „feuern, einen Schritt ausführen, DANN lesen" | **BESTÄTIGT** | `tests/events.test.js` „Während der Simulation entstehende Ereignisse erreichen den Konsumenten"; `node --test tests/events.test.js` → **7/7 grün** (10:28) |
| Betriebszähler: eine Hülle um die Methode zählt **jeden** Ausgang (früher stand der Zähler nur am Ende) | **BESTÄTIGT** | `gameServer.js`: `handleInput(token, message) { const result = this.#handleInput(token, message); if (result.ok) commandsAccepted += 1 else commandsRejected += 1 }` mit Kommentar „Eigene Hülle, damit ALLE Ablehnungspfade gezählt werden"; `tests/metrics.test.js` „Abgelehnte Kommandos werden gezählt" |

---

## 7. Fortsetzung 2026-09-11 — Klassen, Wasser, zwei schwere Fehler (1071–1185)

| Behauptung | Urteil | Beleg |
|---|---|---|
| (26) Gelandete Kisten sanken durch das Gelände; `y ≈ 10 558` gemessen; Behebung `if (world.hasComponent(entityId, 'Crate')) continue;` | **BESTÄTIGT** | Die Zeile steht wörtlich in `src/engine/systems/physicsSystem.js` (mit Kommentar auf `MatchController#stepCrate` und `#stepFlyingCrates`); `#stepCrate` existiert in `match.js` |
| (27) Match endete nie durch Ausschaltung (wiederverwendete Entity-IDs); Lebensstatus wandert an den Spieler (`entry.alive`), `isPlayerAlive()`; „abgesichert in `tests/victory-elimination.test.js` (5 Tests)" | **BESTÄTIGT** | `node --test tests/victory-elimination.test.js` → **5/5 grün** (10:28); darunter exakt „Eine wiederverwendete Entity-ID täuscht den Lebensstatus nicht". Die Zahlen „Seed 5150, Runde 8, Rundengrenze 30" sind die damalige Nachstellung |
| (28) Wasseranzeige warf `ReferenceError`: `wasserLabel(...)` statt `waterLabel(...)` in `hud.js` | **BESTÄTIGT** | `src/client/hud.js` importiert und benutzt `waterLabel` (`src/shared/config/water.js`); der Name `wasserLabel` kommt im Code nicht mehr vor |
| (29) Ertrinken überschwemmte das Protokoll (bis 60 Meldungen/s) → der Client meldet den **Übergang**, gemessen „60 Schritte → eine Meldung je Figur" | **BESTÄTIGT** (Struktur) | `tests/e2e/water-hud.spec.mjs` trägt den Test „Das Protokoll meldet den Übergang, nicht jeden Simulationsschritt"; die Mengenmessung selbst ist E2E |
| (30) Online-Test erwartete vier Waffenzeilen → jetzt korrekt **fünf** (vier Klassenwaffen + Reserve) | **BESTÄTIGT** | `tests/e2e/multiplayer.spec.mjs` Kommentar „Fünf Zeilen: vier Klassenwaffen aus dem Startloadout plus die Reservewaffe …"; `loadouts.js` liefert die vier Rollen, `FALLBACK_WEAPON_ID = "pa_028"` die Reserve |
| Klassen-Profil: `applyClassModifiers` / `applyArchetypeModifiers` **entfallen** (nirgends aufgerufen, andere Rechnung) | **BESTÄTIGT** | Beide Namen existieren nur noch in Kommentaren und in `tests/class-profile.test.js`, das ihre Abwesenheit **erzwingt** (`assert.ok(!/applyClassModifiers/.test(quelle), …)`); `node --test tests/class-profile.test.js` → **7/7 grün** (10:28) |
| Einzige Verrechnung ist `combatProfile()` in `src/shared/config/classes.js` | **BESTÄTIGT** | `export function combatProfile(classId, archetypeId, sidegradeId = null)`; `match.js`, `main.js` und die Übersichtsfunktionen lesen sie |
| Klasse und Archetyp waren über `index % 3` fest gekoppelt → Zuteilung liegt jetzt in `resolveLoadout()` und nimmt eine Wahl entgegen, ohne Wahl gilt die alte Regel | **BESTÄTIGT** | `classes.js` `export function resolveLoadout(index, wahl = null)`; `match.js`: `const wahl = resolveLoadout(index, this.loadouts[index] ?? null);`; `main.js` ruft `resolveLoadout(i)` für die Anzeige |
| `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp (1,1 / 1,4 / 1,6), Wert unverändert übernommen | **BESTÄTIGT** | `export const ARCHETYPE_LAUNCH_BASE = 1.2;` und Archetypen mit `launch: 1.1 / 1.4 / 1.6`; der Modulkommentar erklärt die Offenheit ausdrücklich („Offen bleibt der Bezugswert") |
| Feld `archetype.damage` hieß falsch → heißt `launch` | **BESTÄTIGT** | in `classes.js` tragen die Archetypen `launch`, kein `damage`; `combatProfile` rechnet `archetype.launch / ARCHETYPE_LAUNCH_BASE` |
| Tabellen führen Dimensionen, die der Motor **nicht** liest (`drag`, `mass`, Klassentempo, Archetyptempo) → stehen unter `profil.inert` und sind getestet | **BESTÄTIGT** | `classes.js` hat `inert: Object.freeze({ drag: def.drag, mass: def.mass })` bzw. `{ speed: def.speed }` und einen `inertHinweis`; `tests/class-profile.test.js` hält das fest |
| `src/shared/config/loadouts.js`: gleiche Rollenstruktur je Klasse, **nur `common`/`uncommon`/`rare`** als Startwaffen, deterministisch | **BESTÄTIGT** | `LOADOUT_ROLES = ['flaeche','direkt','hitscan','kuer']`, `START_TIERS = ['common','uncommon','rare']`, `getClassLoadout()` |
| `tests/class-loadout.test.js` **12 Tests** | **BESTÄTIGT** | `node --test tests/class-loadout.test.js` → **12/12 grün** (10:32) |
| ↳ darin: „läuft über viele Züge ohne Munitionsnot" war auf den Mehrfachschuss-Fehler angewiesen und wurde auf „Zug ausspielen" umgebaut | **BESTÄTIGT** | Testname „Ein Match mit einer Klasse läuft über viele Züge ohne Munitionsnot" mit Kommentar „Jetzt wird der Zug zu Ende gespielt: bis der Zug wechselt oder das Match endet." |

---

## 8. Fortsetzung 2026-09-11 (2) — Netzwerk, Screenreader (1186–1350)

| Behauptung | Urteil | Beleg |
|---|---|---|
| (31) Reservewaffe stand bei „heavy" auf Anzeigeposition 1 → ans Ende; `isReserveWeapon()` schützt sie | **BESTÄTIGT** | `src/shared/config/weapons.js` `orderInventoryBySubcategory()` sortiert die Reserve ausdrücklich zuletzt (Kommentar „Die Reservewaffe steht IMMER zuletzt"); `export const FALLBACK_WEAPON_ID = "pa_028"` + `isReserveWeapon()` |
| (32) Verpasstes `match_over` → der Server wiederholt es auf jede PING-Anfrage; „dazu drei Tests in `tests/server-integration.test.js`" | **BESTÄTIGT** | Die drei Tests existieren namentlich: „Auf PING kommt das Match-Ende erneut, wenn es entschieden ist", „Ohne entschiedenes Match wiederholt PING nichts", „Der Reconnect auf ein entschiedenes Match startet ein NEUES Match" (die Datei hat heute 9 Tests) |
| (33) Screenreader: `role="log"` + `aria-live="polite"` + `aria-relevant="additions"` auf `#log-list`, Zugwechsel wird gemeldet, `Hud#log` fügt **genau eine Zeile** ein und entfernt die älteste | **BESTÄTIGT** | `index.html`: `<ul id="log-list" … role="log" aria-live="polite" aria-relevant="additions">`; `hud.js` `log()` baut den Knoten und macht `list.prepend(eintrag.knoten)` (Kommentar erklärt, warum **kein** `replaceChildren`), `#trimme()` entfernt die ältesten; `tests/e2e/screenreader.spec.mjs` hat „Eine neue Meldung erzeugt genau EINEN neuen Knoten" und „Der Zugwechsel wird gemeldet" |
| (34) Waffenliste ohne Maus nicht erreichbar → `role="button"`, `tabindex`, benannter Text, `aria-current`, Eingabe/Leertaste wählen, `stopPropagation` | **BESTÄTIGT** | `hud.js`: `item.setAttribute('role', 'button')` mit `tabindex`, `aria-label` und `if (istAktiv) item.setAttribute('aria-current', 'true')`; `screenreader.spec.mjs`: „Die Waffenliste ist ohne Maus bedienbar und wird als Knopf benannt" + „Leertaste auf einer Waffenzeile wählt und feuert NICHT" |
| (35) Fokussierter Waffeneintrag verlor den Fokus beim Neuaufbau → Fokus wird zurückgeholt | **BESTÄTIGT** | `hud.js` Kommentar beim Neuaufbau („`replaceChildren` entfernt alle alten Knoten …"), Test „Der Fokus auf einer Waffenzeile überlebt den Neuaufbau der Liste" |
| (36) Jeder Seitenaufruf erzeugte einen 404 → `public/favicon.svg` + `<link rel="icon">` | **BESTÄTIGT** | `public/favicon.svg` vorhanden; `index.html` `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` |
| (37) Waffenliste im Onlinemodus sprengte ihr Test-Budget: **2,0 s statt >60 s**, E2E-Lauf **2,6 statt 4,3 min** | **NICHT PRÜFBAR** | Laufzeitmessungen eines E2E-Laufs; E2E in diesem Auftrag verboten. Klärt: `npm run test:e2e tests/e2e/multiplayer.spec.mjs` mit Zeitnahme |
| (38) Glücksrad-Test rannte gegen den Ausblend-Timer (3,2 s / 1,8 s) → Zustand synchron gelesen | **BESTÄTIGT** (Test vorhanden) | `tests/e2e/guenther.spec.mjs` enthält den Glücksrad-Test (einzige Datei mit diesem Motiv); das zeitliche Verhalten selbst ist E2E |
| Netzwerk unter Störung: `tests/e2e/network-conditions.spec.mjs` **(5 Tests)** | **WIDERLEGT** | Die Datei hat heute **4** Tests: „Bei 120 ms Latenz …", „Bei Paketverlust bleibt die Verbindung …", „Nach einem Aussetzer holt der Vollsnapshot den Client zurück", „Der Störer verwirft nur Spielrahmen, keine Steuerung". Die inhaltlich genannten Punkte (120 ms Latenz, jeder dritte Snapshot verworfen, mehrsekündiger Aussetzer, Gegenprobe) sind alle vier da — nur die Zahl war falsch |
| „Die Online-Spezifikationen brauchen jetzt einen zweiten Menschen" | **BESTÄTIGT** | `tests/e2e/helfer/zweiter-mensch.mjs` existiert und wird von `multiplayer.spec.mjs`, `prediction-online.spec.mjs`, `network-conditions.spec.mjs` (über `helfer/online-match.mjs`) benutzt |
| Screenreader-Durchlauf: `tests/e2e/screenreader.spec.mjs` **11 Tests**, geprüft gegen den echten Accessibility-Baum (`Accessibility.getFullAXTree`) | **BESTÄTIGT** | 11 `test(`-Titel gezählt, u. a. „Kein bedienbares Element bleibt im Menü ohne Namen", „Auch im laufenden Match ist jedes bedienbare Element benannt", „Runde, Wind und Zugzeit sind absichtlich KEINE Live-Region" |
| Tab-Reihenfolge: „Im Match gibt es genau **8 Tab-Stopps**" (1 Sprunglink, 2 Spielfeld, fünf Waffenzeilen) | **NICHT PRÜFBAR** | Keine Zusicherung im Code/Test hält die 8 fest: `screenreader.spec.mjs` prüft nur, dass Tab die Waffenliste und das Spielfeld **erreicht** (Selektor `a[href], button, [tabindex]:not([tabindex="-1"]), canvas[tabindex]`), die Zahl 8 steht nur in der MASTERDOTO-Prosa. Klärt: `npm run test:e2e tests/e2e/screenreader.spec.mjs` (Test „Tab erreicht die Waffenliste und das Spielfeld") plus Auszählung im Seitenkontext. *Intern konsistent* ist sie mit Fehler 30 („fünf Zeilen") |
| (39) Waffennummern standen nicht in aufsteigender Reihenfolge → Gliederung entsteht aus derselben Reihenfolge, Reserve bekommt über `displayGroupFor` eine eigene Gruppe, `WEAPON_SUBCATEGORIES` bleibt bei **vier** Einträgen, abgesichert in `tests/drop-mechanic.test.js` | **BESTÄTIGT** | `weapons.js` `WEAPON_SUBCATEGORIES` hat **4** Einträge (melee/guns/elemental/special), `displayGroupFor()` liefert für die Reserve `'reserve'`; `hud.js` baut die Gruppen beim Durchlaufen von `orderInventoryBySubcategory`; `node --test tests/drop-mechanic.test.js` → **23/23 grün** (10:32) |

---

## WIDERLEGT — im Einzelnen

**W1 · Die drei Testzahlen des Verifikationsstands sind drei Stände hintereinander (Tabelle).**
`983/983` (Zeile 383), `182 grün, 1 rot` (Zeile 405) und `183 grün, 0 rot` (Zeile 384) stehen in **einem**
Abschnitt. Heute misst man `1122/1122` (README + MASTERDOTO-Kopf, voller Lauf 2026-09-26) und
**194 E2E-Tests in 30 Dateien** (`npx playwright test --list`). Der Abschnitt trägt die Überschrift
„Stand 2026-09-20" — er ist ein Archivstand, wird aber von oben (Zeile 33/144) überstimmt.
**Wer nur `## Verifikationsstand` liest, hält das Projekt für 139 Tests kleiner als es ist.**

**W2 · „6 Zerstörungsgrade (46–28.353 px²)" (Tabelle „Wirkungs-Übersicht").**
`docs/matrix-terrain-waffen-wirkung.md` ist durch `matrix:check` (Exit 0) als **aktuell** belegt und
listet **fünf** Grade: Kratzer 50–50, Loch 201–1018, Trichter 1257–4778, Krater 5542–13273,
Großkrater 20106–28353 px². Weder die Zahl 6 noch die Untergrenze 46 px² stehen in der Datei.
Die Zahl ist nicht veraltet, sondern war nie die der Datei — die Datei hatte zuletzt `1 Kratzer 50`
als kleinste Fläche.

**W3 · Der E2E-Blockquote (403–435) widerspricht der Tabelle darüber und dem heutigen Testcode.**
Er behauptet „182 grün, 1 rot", „der rote verlangt mehr als 20 fps", „ohne GPU dieses Rechners ist das
nicht zu erfüllen". Heute gilt: die Tabelle darüber sagt 0 rot; `pruefeHardwareMessung` prüft
`msProMioPixel < 30`, `fps > 12`, `max < 500 ms` und **kein** fps-Festwert (der Code-Kommentar erklärt,
warum der Festwert abgeschafft wurde); ohne Hardware-GPU **überspringt** sich der Test mit Begründung,
er wird nicht rot. Ein roter Lauf dieses Tests bedeutet heute **Last** oder Software-Rasterung,
nicht ein fehlendes GPU-Feature (README: „parallel zu schreibenden Arbeitern werden sie rot,
ohne dass etwas kaputt ist").

**W4 · Der Bot-Abschnitt (760–844) beschreibt Artefakte, die es nicht mehr gibt.**
Geprüft: `src/server/bot.js` **fehlt**, `scripts/check-bots.mjs` **fehlt**, `tests/bot-ai.test.js`
**fehlt**, kein `check:bots` in `package.json`. Damit sind „1017 Schüsse", „32/32 = 100 %",
„Solvgenauigkeit 0,000 px" und „`tests/bot-ai.test.js` rechnet mit einer unabhängigen Schleife nach"
nicht mehr prüfbar, sondern nur noch Zeitdokument. Geblieben ist die gemeinsame Rechnung:
`src/shared/ballistics.js` und `src/shared/launchSpeed.js` werden von **fünf** Stellen gelesen
(`turret.js`, `shooting.js`, `match.js`, `systems/projectileSystem.js`, `client/shotPrediction.js`).

**W5 · Die Katalogzahlen aus dem Durchgang (Fehler 1–3, 15) stimmen nicht mehr.**
Heute: `delivery` **96 Projektile / 54 Hitscan**, `blastRadius > 0` **56**, `damageSource`
**98 `source` / 45 `derived` / 7 `none`**. Die Doku nennt 76 Hitscan, 74 Projektile, 54 Flächenwaffen,
94/52/4. Der Umbenennungsschritt `placeholder` → `derived` im Generator ist zusätzlich ein Grund,
warum die alten Zahlen nicht nur veraltet, sondern **nicht mehr vergleichbar** sind.

**W6 · `npm run lint` ist zur Messzeit rot — aber nicht wegen des Projekts.**
10:41: Exit 1, `tools/audit-mcp/lib/statisch.mjs:293 'EINSTIEG' is not defined`. `git status` zeigt die
Datei als **uncommitted geändert** (Umbau auf `EINSTIEG_MUSTER` / `EINSTIEG_QUELLEN`, eine Verwendung
blieb auf dem alten Namen stehen). Gegen **HEAD** ist Lint sauber (`git worktree add /tmp/pa-head HEAD`
+ `eslint .` → 0 Meldungen), und um 10:14 war `npm run lint` im `smoke:fast` noch grün.
Die Lehre für künftige Prüfungen: **ein Grid-Lauf dieser Art gehört immer gegen den committeten Stand**,
sonst prüft man fremde Arbeit im Fluss.

**W7 · `tests/e2e/profil.spec.mjs` 8/8 war einmal richtig — heute sind es 9.**
Der „Nachweis" der fünf behobenen E2E-Fehler nennt vier Testzahlen; drei stimmen (turret 5,
drop-cooldown 7, runtime-smoke 10), `profil.spec.mjs` hat heute **9** Tests.
Gleiches Muster bei `network-conditions`: „5 Tests" stehen dort, die Datei hat **4**.

**W8 · „Die zwei Kulissen-Tests bleiben vorerst `test.fixme`" — sie sind keine mehr.**
In `tests/e2e/` gibt es **null** `fixme`. Die Kulissen-Prüfung lebt jetzt echt in
`tests/terrain-presets.test.js` („Alle Geländeformen haben eigene Kulissen — oder stehen namentlich
hier", „Die Leitbiom-Gegenprobe erkennt eine verdrehte Zuordnung"). Der Halbsatz ist die einzige
Stelle im Bereich, die eine **Lücke behauptet, die geschlossen ist** — die umgekehrte Irreführung.

---

## Veraltete Zahlen: alt → neu

| Stelle (MASTERDOTO) | alt | heute gültig | Beleg |
|---|---|---|---|
| Verifikationsstand, Unit-Tests | 983/983 | **1122/1122** | README + MASTERDOTO-Kopf (Lauf 2026-09-26); `check-docs` meldet Einheitlichkeit |
| Verifikationsstand, E2E | 183 grün / 0 rot / 1 ü. | **194 Tests / 30 Dateien** | `npx playwright test --list` (10:22); README: 191 (190 grün, 1 ü.) |
| E2E-Blockquote | 182 grün, 1 rot (22,5 min) | 194 Tests; ~25 min | ebd. |
| Verifikationsstand, Rauchtest | 4/4 in ~30 s | 4/4 in **45,6 s** | `npm run smoke:fast` (10:14) |
| Verifikationsstand, Performance | 123× Echtzeit, p99 0,40 ms | **140,5×**, p99 **0,331 ms** | `npm run perf` (10:22) |
| Verifikationsstand, Wirkungs-Übersicht | 6 Zerstörungsgrade, 46–28.353 px² | **5 Grade, 50–28.353 px²** | `docs/matrix-terrain-waffen-wirkung.md` Kap. 2 |
| Verifikationsstand, Zünder | 11 `timed` die einen Zünder tragen | 11 `timed` **mit** Zünder, 7 `impact` ohne | `check-fuses` |
| Haken 846 (Reichweite) | „4 Tests" | **8 Tests** (`reichweite-konsistenz.test.js`) | `node --test` 8/8 |
| E2E-Nachweis (Zeile 518) | `profil.spec.mjs` 8/8 | **9 Tests** | Auszählung `test(`-Titel |
| Netzwerk (Zeile 1264) | `network-conditions.spec.mjs` (5 Tests) | **4 Tests** | Auszählung |
| Fehler 1 | „76 von 150 Waffen" Hitscan | **54 Hitscan / 96 Projektil** | Katalog `delivery` |
| Fehler 2 | „74 Waffen" Projektile | **96** | ebd. |
| Fehler 3 | 54 Flächenwaffen, 74 Projektile | **56 Flächenwirkung, 96 Projektile** | Katalog `blastRadius`, `delivery` |
| Fehler 15 | `damageSource` 94 / 52 / 4 | **98 `source` / 45 `derived` / 7 `none`** | eigene Zählung über `WEAPONS` |
| Zeile 362 | `src/client/ereignisse.js` (571 Zeilen) | **831 Zeilen** (10:43) — Datei wird gerade von einem Arbeiter geändert | `wc -l` |
| Zeile 787 | `MAX_PLAYERS_PER_TEAM = 6` (`lobby.js:32`) | `lobby.js:**72**` | Zeilennummern wandern, Name hält |
| Zeile 799 | `check:bots`, `src/server/bot.js` | **beide entfernt** | Dateisystem/`package.json` |
| **außerhalb meines Bereichs, aber in derselben Sitzung gemessen:** | | | |
| `docs/testgrenzen.md` | 974 Unit-Tests (93 Dateien), 35.955 Quellcode-Zeilen | **1.191 `test(`-Aufrufe in 117 Dateien** (10:43), **42.596 Quellcode-Zeilen in 92 `src/**/*.js`** | eigene Zählung — die Datei selbst ist nicht Teil dieses Auftrags |
| `docs/testgrenzen.md` | „E2E-Tests 191 (30 Dateien)" | **194 gelistet** in 30 Dateien | `npx playwright test --list` |
| `README.md` Zeile 181 | 112 Testdateien | **117** → `check-docs` schlägt deshalb um 10:41 **fehl** (`FEHL README: 112 Testdateien — wirklich 116`, Sekunden später 117) | `node scripts/check-docs.mjs` |

---

## Nicht geprüft — und welcher Befehl es klärt

Nichts davon ist ein Hinweis auf einen Fehler; es ist die Grenze dieses Auftrags.

| Was offen bleibt | Warum | Befehl, der es klärt |
|---|---|---|
| Unit-Gesamtzahl (`1122`?) nach dem heutigen Zuwachs | voller Lauf verboten (vier Arbeiter schreiben in `src/` und `tests/`) | `npm test` |
| E2E-Gesamtlauf (grün/rot/übersprungen) | verboten, lastempfindlich | `npm run test:e2e` |
| `npm run checks` (alle 21 Gates) | verboten; **5 von 21** wurden einzeln gefahren und waren grün | `npm run checks` |
| `npm run build` | verboten | `npm run build` |
| `npm run balance:sweep` (Median Shots-to-Kill 13) | Lauf nach **17 min** nicht beendet, abgebrochen | `npm run balance:sweep` (>20 min einplanen) |
| Replay-Verify gegen `9ec63e8c` | schreibt nach `artifacts/` (Auftrag: nur **eine** Datei schreiben) | `npm run replay -- record` + `npm run replay -- play --verify` |
| Exakte Determinismus-Hashes `bc9695fa` / `c0531097` | manueller Lauf 2026-09-17, Aufbau nicht dokumentiert; die Eigenschaft deckt `tests/state-hash.test.js` 10/10 | Probe mit festgehaltenem Aufbau, `stateHash()` nach 3000 Ticks |
| „8 Tab-Stopps" im Match | keine Zusicherung im Code, nur Prosa | `npm run test:e2e tests/e2e/screenreader.spec.mjs` + Auszählung im Seitenkontext |
| A/B gegen Baseline `9cb5fe5` (16 E2E-Ausfälle) | historisch; E2E verboten | `git worktree add /tmp/pa-base 9cb5fe5` + dieselben acht Dateien |
| Re-Benchmarks (13,6 ms/Mio. Pixel, 48,2 ms SwiftShader, 17,2 fps, E2E-Laufzeiten 2,0/2,6/4,3 min) | E2E und Browser-Messung verboten | `npm run test:e2e tests/e2e/profiling.spec.mjs` |
| `hasSpecialEffect`-Doppelregel und weitere Haken außerhalb meiner Zeilen | anderer Prüfer | siehe `docs/todo-verifikation-1.md` |

---

## Die drei Behauptungen, die am meisten in die Irre führen, wenn man ihnen glaubt

**1 · „`npm test` **983/983** grün" (Zeile 383).**
Der Abschnitt heißt `Verifikationsstand` und ist die erste Stelle, die ein Leser zu Rate zieht — und er
führt **139 Tests weniger**, als es gibt (1122). Schlimmer: er nennt als Grund für einen Rückgang
„mit dem Server-Bot entfiel `tests/bot-ai.test.js`", obwohl die Suite seither um rund 140 Tests
**gewachsen** ist und **117 statt 103** Testdateien hat. Wer diese Zeile glaubt, hält die Suite für
kleiner, älter und schwächer belegt, als sie ist.

**2 · „Der GPU-Test verlangt mehr als 20 fps — auf diesem Rechner nicht zu erfüllen" (Zeile 406–410).**
Diese Diagnose ist doppelt irreführend: Sie erzeugt die Erwartung, ein roter Profiling-Lauf sei ein
Umgebungsproblem (heute prüft der Test 30 ms/Mio. Pixel und >12 fps, und ohne GPU **überspringt** er
sich selbst), und sie widerspricht der Zeile darüber („183 grün / 0 rot"). Genau damit kann jeder rote
Profiling-Test als „Hardware" abgetan werden — die README weiß es besser (Last).

**3 · „**21 Gates, 0 Verstöße**" — zusammen mit „die Gate-Zahl ist 21" ist das der einzige
Sicherheitsgurt, der heute wirklich hält.**
Diese Zeile ist **bestätigt** (21 Einträge, in der CI verdrahtet) — und deshalb steht sie hier:
Sie ist der Gegenbeweis zur Regel „Haken ohne Prüfung". Nur 5 der 21 Gates wurden in diesem Auftrag
einzeln gefahren; die Aufforderung bleibt, `npm run checks` vor einem Push zu fahren, statt sich auf
den Satz „0 Verstöße" in einer Markdown-Zeile zu verlassen. Besonders `check:docs` hat sich in dieser
Sitzung selbst gemeldet (README 112 Dateien, wirklich 116) — der Wachhund bellt, weil sich der Baum
während der Arbeit bewegt.

### Randnotiz zur Selbstkritik (belegt am eigenen Vorgehen)

Vier Messungen dieses Berichts waren zuerst **falsch gezählt**, weil ich Testdateien statisch per
`grep -c "test("` gezählt habe: Inline-`test.skip(true, …)` in Testrümpfen werden mitgezählt.
Die verlässliche Zahl kam aus `npx playwright test --list` (listet, führt nichts aus) bzw. aus
`node --test <eine Datei>` (führt eine Datei aus). Wo oben eine Zahl steht, die nur statisch zählbar
ist, ist sie als solche gekennzeichnet.

### Schlussprüfung (10:49, nach dem letzten Commit)

Alle oben zitierten Stellen wurden **nach** dem letzten Commit erneut geprüft:

| Wieder geprüft | Ergebnis |
|---|---|
| Git-Stand | `2d365d3`, **9** Commits seit `6b59573`; `git rev-list --count` bestätigt |
| MASTERDOTO-Anker | 103 Haken, 0 offene; die sieben Haken unverändert auf 522 / 553 / 627 / 635 / 846 / 884 / 900; Abschnittsköpfe unverändert auf 375 / 746 / 760 / 939 / 1071 / 1186 / 1352 |
| Code-Anker | `shooting.js` `* weitenFaktor(quelle.width)` ✔ · `physicsSystem.js` `hasComponent(entityId, 'Crate')` ✔ · `waterField.js` „Von UNTEN nach OBEN" ✔ · `classes.js` `ARCHETYPE_LAUNCH_BASE = 1.2` ✔ · `hud.js` `setAttribute('aria-current', 'true')` ✔ · `index.html` `role="log"` ✔ |
| Replay-Artefakt | `expected.stateHash = "9ec63e8c"`, `totalTicks 2440`, `round 13` — Wort für Wort ✔ |
| E2E-Testzahlen | `network-conditions` 4 · `profil` 9 · `screenreader` 11 · `multiplayer` 10 · `turret` 5 · `drop-cooldown` 7 · `runtime-smoke` 10 — alle wie oben |
| Testdateien | 117 (um 10:10 waren es 111) — die Drift ist im Kopf dokumentiert |
| Eigene Spuren | `git status` zeigt in `src/`, `tests/`, `scripts/`, `index.html`, `README.md`, `tools/` **nur fremde** Änderungen; von mir stammt allein dieses Dokument (`docs/todo-verifikation-2.md`, neu). Der Prüf-Worktree `/tmp/pa-head` wurde wieder entfernt |

*Die Gates, die ich einzeln gefahren habe, waren um 10:22 alle grün. Wer diesen Bericht später liest:
`check-docs` ist die erste Zeile, die rot wird, wenn der Baum weiterwächst — sie prüft die Zahlen
dieses Berichts mit.*
