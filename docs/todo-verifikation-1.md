# TODO-Verifikation 1 — abgehakte Punkte gegen den Code geprüft

**Bereich:** MASTERDOTO.md, Abschnitte ab Zeile 18 (`Wirkungsmerkmale der 150 Waffen`, `Waffenanimationen`, `Doppelregeln aufgelöst`, `Audit-MCP`, `Durchgang 2026-09-20`, `Offene Aufgabe: die zwei Riesenklassen zerlegen`), ab Zeile 1352 (`Auto-Turret` …) sowie **alle Abschnitte ab Zeile 1500** bis Dateiende.
Nicht in diesem Bericht: Zeilen 375–1499 (zweiter Prüfer), außer den Abschnitten ab 1352.

| | |
|---|---|
| Datum | 2026-09-27, ~10:10–11:00 CEST |
| Git-Stand **vorher** | `6b59573` (`main`) |
| Git-Stand **nachher** | `71a8985` — der Stand hat sich **während der Prüfung zweimal bewegt** (`6b59573` → `10ff791` → `71a8985`; vier Arbeiter in `src/`). Jede Fundstelle unten ist über den **Namen** verankert; alle zitierten Stellen wurden **nach** dem letzten Commit gegen `71a8985` erneut geprüft und stimmen. Die drei Stellen, die sich dabei verschoben haben, sind im Text als verschoben gekennzeichnet (`main.js` `guenther`-Feld 1229 → 1346, `#handleEvents`, `hud.js` `nurMuster` 209 → **358**) |
| Art der Prüfung | rein lesend. Kein `npm test`, kein `npm run test:e2e`, kein `npm run checks`, kein `npm run build`. Erlaubt und benutzt: `node`-Einzeiler, `git show`, einzelne kleine `scripts/check-*.mjs` (reine Leser) |
| Punkte im Bereich | **96** Haken (`- [x]`) in diesem Bereich von insgesamt 103 in der Datei (0 Haken in Zeilen ≤ 374; die Abschnitte 18/167/285 arbeiten mit Tabellen, nicht mit Haken) |
| Urteile | **41 BESTÄTIGT · 12 WIDERLEGT · 7 NICHT PRÜFBAR · 36 NICHT GEPRÜFT** (Begründung je Gruppe unten) |

**Wichtiger Hinweis zur Messbarkeit:** In `src/client/main.js` schreiben die Arbeiter *laufend* (Kopfzeilen-Stand bei der ersten Messung 3.315, bei der letzten 3.485). Zeilenzahlen **dieser** Datei sind darum als Beleg unbrauchbar und werden unten nur genannt, wo sie ausdrücklich als driftend gekennzeichnet sind. `src/engine/match.js` ist identisch mit HEAD und damit stabil (3.194 Zeilen).

---

## 1. Wirkungsmerkmale der 150 Waffen (Abschnitt ab Zeile 18)

| Behauptung | Urteil | Beleg |
|---|---|---|
| 150 Waffen | **BESTÄTIGT** | `WEAPONS.length === 150`, `Object.keys(WEAPONS_BY_ID).length === 150` (`src/shared/config/weapons.js`) |
| `damageType`: 150/150 gesetzt, **27 Arten** | **BESTÄTIGT** | `node scripts/check-damage-types.mjs` → „27 bekannt, 27 im Katalog“, Fehler 0, Exit 0 |
| `requiresLineOfSight`: **13 Direktschützen**; `fire()` lehnt sonst ab | **BESTÄTIGT** | Katalog: `true: 13, false: 137`; Leser `shooting.js` `hasLineOfSight` (Aufruf in `fire()`), Match-Delegator `hasLineOfSight` in `match.js` |
| `targeting`: 150/150 deckungsgleich, **0 Widersprüche** | **BESTÄTIGT** | `node scripts/check-weapon-targeting.mjs` → „Verglichen: 150, Übereinstimmend: 150, Widersprüche: 0“ |
| `targeting` reist im `shot`-Ereignis mit | **BESTÄTIGT** | `shooting.js` setzt `targeting: weapon.targeting ?? null` in der Schussmeldung |
| `damageType` reist bis ins `damage`-Ereignis | **BESTÄTIGT** | `projectileSystem.js` liest `Projectile/damageType` und übergibt sie an `applyDamage`; `damageSystem.js` schreibt `damageType` **und** `damageTypeName` ins Ereignis |
| Neu: `src/engine/damageTypes.js`, `scripts/check-damage-types.mjs`, 2 Testdateien | **BESTÄTIGT** | alle vier Dateien vorhanden; `tests/weapon-damage-types.test.js`, `tests/wirkungsmerkmale-match.test.js` |
| Dead-Code-Bereinigung, Commit `7b78b38` | **BESTÄTIGT** | Commit vorhanden |
| `npm test` 1122/1122, `npm run checks` 21 Gates, E2E 183 | **NICHT GEPRÜFT** | Läufe verboten (lastempfindlich). `scripts/check-docs.mjs` bestätigt lediglich, dass README und MASTERDOTO **dieselbe** Testzahl nennen (1122) — das ist eine Konsistenz-, keine Bestandsmessung |

### 1a. Waffenanimationen

| Behauptung | Urteil | Beleg |
|---|---|---|
| `src/client/weaponAnimation.js` als reiner Rechenkern | **BESTÄTIGT** | Datei, 203 Zeilen, kein Canvas-Import |
| `muendungsfeuer()`, `rueckstossVersatz()` existieren und werden benutzt | **BESTÄTIGT** | `weaponAnimation.js`; Aufrufer in `renderer.js` `#drawEntities` (Rückstoß + Mündungsfeuer je Figur) |
| `addMuzzleFlash()` als Auslöser („vorher NUR Klang“) | **BESTÄTIGT**, *Fundort veraltet* | `addMuzzleFlash` in `renderer.js`; aufgerufen im **`shot`-Zweig von `src/client/ereignisse.js`** — nicht mehr in `main.js` (der lokale `switch` wurde nach `ereignisse.js` gezogen). Die Doku nennt „`main.js` `case 'shot'`“: dieses `case` existiert in `main.js` **nicht mehr** |
| `fadenkreuzSegmente()` + `pulsFaktor()` in `#drawAimPreview` | **BESTÄTIGT** | beide in `weaponAnimation.js`; Aufruf in `renderer.js` `#drawAimPreview` |
| `blitzPuls()` in `#drawBlastPreview` | **BESTÄTIGT** | `renderer.js` `#drawBlastPreview` |
| `ladungAnteil()` in `hud.js`, CSS in `index.html` | **BESTÄTIGT** | `hud.js` importiert `ladungAnteil` aus `weaponAnimation.js` und benutzt es für den Nachladebalken |
| `MUENDUNGSFEUER_BILDER = 8` | **BESTÄTIGT** | `weaponAnimation.js:44` |
| `tests/weapon-animation.test.js` **11** Tests, jede Aussage mit `reducedMotion`-Gegenprobe | **BESTÄTIGT** | 11 `test(`-Aufrufe; `reducedMotion` in allen Animationsfunktionen |
| `#drawPrediction` bleibt ein VOLLER Strich (bewusst) | **BESTÄTIGT** | `renderer.js` `#drawPrediction` zeichnet einen durchgehenden Strich, Kommentar an Ort und Stelle |

### 1b. Doppelregeln aufgelöst

| Behauptung | Urteil | Beleg |
|---|---|---|
| `SIMULATION_HZ` + `TICK_MS` in `src/shared/config/network.js`, beidseitig importiert | **BESTÄTIGT** | `config/network.js` definiert beide, `TICK_MS = 1000 / SIMULATION_HZ` |
| `PLAYER_HALF_WIDTH/_HEIGHT` in `src/shared/config/player.js` | **BESTÄTIGT** | Datei mit 7/10; Leser in `match.js`, `shooting.js`, `turret.js` |
| `PRIMARY_BIOME_BY_PRESET` nur in `backdrops.js`, `scenery.js` importiert | **BESTÄTIGT** | Definition in `src/shared/config/backdrops.js`, Import in `src/shared/config/scenery.js` |
| `tests/eine-regel-eine-stelle.test.js` (**7**) | **BESTÄTIGT** (Datei + Wächter), **Zahl weicht ab** | 6 `test(`-Aufrufe gezählt; zwei davon laufen in einer Schleife über mehrere Konstanten, deshalb ist 6 ≠ falsch — die Doku-Zahl 7 ließ sich aber **nicht** als 7 Aufrufe nachweisen |
| `TICKS_PER_SECOND` kehrt als Code nicht zurück | **BESTÄTIGT** | Treffer nur in Kommentaren und in der Wächter-Prüfung selbst (Kommentare werden vorher entfernt) |

---

## 2. Audit-MCP und Tiefen-Audit (Abschnitt ab Zeile 111)

| Behauptung | Urteil | Beleg |
|---|---|---|
| `tools/audit-mcp`: **19 Werkzeuge, 2 Prompts, null Abhängigkeiten** | **BESTÄTIGT** | 19 registrierte `audit_*`-Werkzeuge; `PROMPTS` = `tiefenaudit`, `befund-pruefen` |
| Bericht `docs/audit-tief.md` **397 Zeilen, 18 Abschnitte, TODO mit 33 Punkten** | **WIDERLEGT** | Datei hat **323 Zeilen** und **7** TODO-Einträge (`- [ ]`; Abschnitte „HOCH (1)“ + „NIEDRIG (6)“). Die **18 Abschnitte** stimmen (durchnummeriert 0–17). Die Datei wurde nach der Behauptung mehrfach neu erzeugt (u. a. `c0018a7` „Audit-Bericht neu“) — die Zahl ist nicht nachgezogen worden |
| „8 stumme Ereignisse, alle 8 im Wächter begründet“ (Zeile 146) | **WIDERLEGT** | Es sind **drei verschiedene Zahlen im Umlauf**: MASTERDOTO = 8, `docs/audit-tief.md` = **7**, der Wächter `bewusstStumm` in `tests/event-coverage.test.js` listet **12**. Wer die Abdeckung beurteilen will, bekommt je nach Datei eine andere Antwort |
| `scripts/smoke-fast.mjs` behoben: 4 von 4 in 26,8 s; Ursache `.pathname` | **BESTÄTIGT** (Ursache), **NICHT GEPRÜFT** (Laufzeit) | Der Fehlerklassen-Wächter `audit_paths` ist vorhanden; die Datei benutzt `fileURLToPath`. Die Zahl 38 korrekte Stellen / 1 falsche konnte ich ohne Volllauf nicht nachzählen |
| 4 Punkte „Offen aus dem Audit“ (Zeilen 150–157) | **BESTÄTIGT** | Siehe § 5: alle vier genannten Dateien/Konstanten sind entfernt bzw. ein-eindeutig belegt |

---

## 3. Offene Aufgabe: die zwei Riesenklassen zerlegen (Abschnitt ab Zeile 285) — **hier sitzt der dickste Fund**

| Behauptung | Urteil | Beleg |
|---|---|---|
| `match.js` **3.588** Zeilen („nachgemessen 2026-09-26“) | **WIDERLEGT** | `wc -l src/engine/match.js` → **3.194** (HEAD, unverändert). Der Rückgang ist durch die eigenen späteren Schritte entstanden (`7250e2c`: 3.283 → 3.180; `8ee4935`: `fire` → `shooting.js`) |
| `main.js` **3.235** Zeilen (bzw. 3.539 in Schritt 1) | **WIDERLEGT / nicht belastbar** | HEAD-Kopfzeile bei der letzten Messung **3.485**. Die Datei wird *gerade* von einem Arbeiter geschrieben; die Zahl ist als Beleg unbrauchbar |
| „`getState()` ist **2 Zeilen** (Delegator)“ | **BESTÄTIGT** | `match.js`: `getState()` → `return baueAnsichtszustand(this.#zustandsQuelle())` |
| `stateSnapshot.js` **297 Zeilen**, `rg '\bthis\b'` → kein Treffer | **BESTÄTIGT** | Datei **genau 297 Zeilen**; kein `this` |
| Schritt 4a erledigt | **BESTÄTIGT** | s. o. |
| **„Offen bleibt Schritt 4 im Übrigen: `fire()` (211 Zeilen) ist noch nicht ausgezogen — `match.js` liegt deshalb weiterhin über 3.200 Zeilen (gemessen 3.588)“** | **WIDERLEGT** | `src/engine/shooting.js` **existiert** mit **745 Zeilen**; `match.js` `fire()` ist ein **2-Zeilen-Delegator** (`return fire(this.#schussQuelle(), …)`). Commit `8ee4935` *„refactor(engine): getState nach stateSnapshot, fire nach shooting (W2, W6)“* ist Vorfahre von HEAD. `match.js` liegt mit 3.194 Zeilen **unter** den behaupteten 3.200. Der Modulkopf von `shooting.js` nennt selbst „`fire()` stand in `MatchController` und war 211 Zeilen lang“ — die Doku führt also einen bereits erledigten Punkt als offen |
| Tabelle „größte Brocken `match.js`“: `fire()` 211 `[1458–1668]` | **WIDERLEGT** | `fire()` steht bei `match.js:1627` und hat 2 Zeilen. Die heutigen größten Brocken sind `#spawnPlayers` (96), `#buildTerrain` (95), `#applyTargetEffect` (91), `#resolveGuentherWheel` (87) — die drei letzteren decken sich mit der Doku (96/91/87), `buildTerrain` ist von 89 auf 95 gewachsen |
| Tabelle „größte Brocken `main.js`“: `handleEvents()` 229 `[1463–1691]`, `handleRemoteEvent()` 142 | **WIDERLEGT** | In `main.js` sind `#handleEvents` **4 Zeilen** und `#handleRemoteEvent` **3 Zeilen** (Wrapper). Die Logik liegt in `src/client/ereignisse.js`. Die Doku **widerspricht sich hier selbst**: Zeile 317 sagt korrekt, beide lägen in `ereignisse.js` — die Tabelle 70 Zeilen darüber sagt das Gegenteil. `#zeigeErfolge()` 80 stimmt exakt, `#bindMenu` ist 118 (Doku: 100) |

---

## 4. Auto-Turret und Protokoll v6/v7 (Abschnitt ab Zeile 1352)

| Behauptung | Urteil | Beleg |
|---|---|---|
| `pa_124` trägt `special: 'auto_target'`, `buildEffect` lieferte `null` | **BESTÄTIGT** (Vorzustand) / **BEHOBEN** | Katalog führt `special: "auto_target"`; `buildEffect(WEAPONS_BY_ID.pa_124)` → `{"kind":"turret","damage":23,"range":797,"turns":3}` |
| Wirkung aus der Waffe: `damage × 0,6`, `maxRange × 0,75`, `turns` Balance | **BESTÄTIGT** | Waffe: `damage 38`, `maxRange 1062` → `38 × 0,6 = 22,8 ≈ 23`, `1062 × 0,75 = 796,5 ≈ 797`; `turns: 3` frei |
| Selbstwirkung, kein Projektil (`SELF_TARGET_KINDS`) | **BESTÄTIGT** | `SELF_TARGET_KINDS` = `heal, shield, damage_boost, armor, ammo, move, reveal, random, turret` |
| Kein Blindfeuer bei > **22 px** Abweichung | **BESTÄTIGT** | `src/engine/turret.js`, `TURRET_MAX_MISS = 22`, Abweisung `if (bestes.naehe > TURRET_MAX_MISS) return null` |
| Geschütz feuert am **Rundenanfang**, nicht am Zugbeginn | **BESTÄTIGT** | Turret-Pfad liegt in `src/engine/turret.js` (331 Zeilen), Aufruf aus dem Runden-/Zugwechsel des Matches |
| Protokoll v6: Kopf **23 → 24 Byte**, Geschütz **8 Byte** (id Uint16, x/y Int16, Team Uint8, Restrunden Uint8) | **BESTÄTIGT** | `TURRET_STRIDE = 8`; Kodierung genau in dieser Feldreihenfolge |
| Protokoll v7: Kopf **24 → 25**, Günther **6 Byte**, Haufen **4 Byte**, `MAX_WIRE_POOPS = Math.min(GUENTHER_POOP.maxPiles, 255)` | **BESTÄTIGT** | `HEADER_SIZE = 25`, `GUENTHER_STRIDE = 6`, `GUENTHER_POOP_STRIDE = 4`, `MAX_WIRE_POOPS` exakt so definiert |
| Kein zweiter Haufen-Deckel: `guentherSystem.js` `maxPiles = 6` | **BESTÄTIGT** | Das System entfernt alte Haufen gegen `GUENTHER_POOP.maxPiles`; `config/guenther.js` führt `maxPiles: 6` |
| Der **Schaden geht nicht mit** | **BESTÄTIGT** | `encodeSnapshot` schreibt je Geschütz nur id/x/y/Team/Restrunden |
| Budgets blieben unangetastet: 12 Figuren 225 B (Budget 320), 40 Figuren 645 B (Budget 700), 40+6 Haufen 669 B | **BESTÄTIGT** (Substanz) / **Zahlen nicht reproduziert** | Die Wächter im Test fordern `≤ 320` bzw. `≤ 700`. Eigene Nachrechnung mit einem **minimalen** Figurensatz (ohne ein Feld je Spieler) ergibt 211 / 631 / 655 B — **konstant 14 B weniger** je Fall, also dieselbe Aussage: deutlich unter Budget. Die genauen Zahlen 225/645/669 stammen aus dem Testkommentar selbst und sind mit meinem Fixture nicht nachstellbar |
| **„Offen: `main.js` setzt im Online-Pfad kein `guenther`-Feld“** | **WIDERLEGT** | `main.js` (HEAD) setzt im Online-Zweig `guenther: snapshot.guenther ?? null` |
| **„das `CONTROL`-Protokoll kennt weder `JUMP` noch `DROP_WEAPON`“** | **WIDERLEGT** | `src/shared/protocol.js` definiert `CONTROL.JUMP = 'jump'` und `CONTROL.DROP_WEAPON = 'drop_weapon'` — **auch schon in HEAD**; `gameServer.js` hat `case CONTROL.JUMP` und `case CONTROL.DROP_WEAPON` ebenfalls in HEAD |
| **„Springen und Waffe-Abwerfen online gar nicht auslösbar“** | **WIDERLEGT** | `main.js` `jump()` hat einen Online-Zweig, der den Befehl an den Server schickt, mit dem Kommentar „ONLINE: eigener Befehl an den Server — und KEINE eigene Meldung“. Die drei Sätze dieser Randnotiz sind ein Stand von **2026-09-26**; der Fix landete am **2026-09-27** und die Notiz wurde nicht nachgezogen |
| Zug-Sperre steht **nach** Nachladezeit und Munition | **BESTÄTIGT** | `shooting.js`: Kommentar „REIHENFOLGE: Diese Prüfung steht NACH Nachladezeit und Munition“, Ablehnung `'In diesem Zug wurde bereits geschossen'` nach `'Keine Munition'` |
| Geschütz-Anzeige vor den Kisten, mit Restrunden-Punkten | **NICHT PRÜFBAR** | Geschmacks-/Sichtprüfung; die Zeichenreihenfolge (`#drawTurrets` vor `#drawCrates`) ist im Code vorhanden, die Lesbarkeit nicht messbar |

---

## 5. Kulissen (Abschnitte ab Zeile 1542 und 1626)

| Behauptung | Urteil | Beleg |
|---|---|---|
| **Acht** Geländeformen, vier davon mit eigenem Leitbiom (`deluge`, `open`, `spires`, `warren`) | **BESTÄTIGT** | `scripts/check-docs.mjs` → „MASTERDOTO: 8 Terrain-Arten“ stimmt; `TERRAIN_PRESETS` führt 8 Formen |
| Je **fünf** eigene Kulissenbilder für die vier neuen Biome | **BESTÄTIGT** | Vorhanden: `deluge_{rooftops,monsoon,drowned_forest,rice_terraces,dam_break}.jpg`, `open_{wheat_plains,heath_moor,salt_flats,polder,prairie_storm}.jpg`, `spires_{karst_peaks,dolomites,basalt_columns,desert_hoodoos,ice_spires}.jpg`, `warren_{slot_canyon,ruin_labyrinth,cave_network,bamboo_thicket,trench_lines}.jpg` — je 5 von 5 |
| Eintrag je Biom in `SCENERY_BIOMES`, sonst Rückfall auf `forest` | **BESTÄTIGT** | `src/shared/config/scenery.js` führt die Biome; `pickScenery` fällt ohne Eintrag auf `forest` zurück (Kommentar an Ort und Stelle) |
| „Flut bekommt bedeckten Himmel und Sturm (kein `clear_day`, keine Vögel)“ | **BESTÄTIGT** | im `deluge`-Eintrag so gesetzt |
| Höhenvarianz: `open` 16 (flachste), `spires` 213 (steilste), `warren` 47 Sprünge, `flooded` 22 % Land | **NICHT GEPRÜFT** | Diese Zahlen stammen aus `measure-terrain`/`check-terrain`-Läufen; ein Lauf war nicht erlaubt. Die **Rangfolge** ist im Code plausibel abgebildet, die Werte nicht nachgemessen |
| Bodenfarben „nach Sichtprüfung nachgezogen“ (zwei Runden, Erdbraun über Bambus usw.) | **NICHT PRÜFBAR** | Geschmacks-/Sichturteil. Die Paletteneinträge sind vorhanden (`TERRAIN_PALETTES`), die Beurteilung ist nicht messbar |
| Testfehler behoben: feste Zahlen → abgeleitete Zahl; zufälliger Seed → `SEED = 4242` | **BESTÄTIGT** | In `tests/e2e/terrain-presets.spec.mjs` steht ein fester Seed; `scripts/check-docs.mjs` vergleicht die Kulissenzahl gegen die Kataloglänge statt gegen 60 |

---

## 6. Erfolge: Mechanik und Inhalte (Abschnitt ab 1686 und Haken 3935)

| Behauptung | Urteil | Beleg |
|---|---|---|
| Katalog führt **11** Erfolge | **BESTÄTIGT** | `ACHIEVEMENTS.length === 11`; `npm run check:achievements` → Exit 0 |
| `muster` ist **entfernt**, `MUSTER_ANZAHL` → **0** | **BESTÄTIGT** | Feld existiert bei keinem Eintrag (`some(a => 'muster' in a) === false`); `MUSTER_ANZAHL = ACHIEVEMENTS.filter(e => e.muster).length` ergibt 0 |
| Jeder Eintrag trägt echten Namen, Satz, Hinweis | **BESTÄTIGT** | alle 11 haben `title`, `text`, `hint`; IDs behalten das Präfix `muster_` |
| `reward` überall `null` | **BESTÄTIGT** | 0 von 11 mit `reward !== null` |
| Zwei Schwellen korrigiert: „500 Schaden/Partie“ → **300**, „200 Schaden/Minute“ → **20** | **BESTÄTIGT** | `condition.wert` = 300 bzw. 20 in `src/shared/achievements.js` |
| `scripts/achievement-vorlage.mjs` entfernt, `achievements:vorlage` fort | **BESTÄTIGT** | Datei fehlt, `grep vorlage package.json` → 0 Treffer |
| Belegstellen `achievements.js:83-110`, `:252`, `:472`, `hud.js:209` | **BESTÄTIGT**, *eine Stelle verschoben* | `:252` (`MUSTER_ANZAHL`) und `:472` (`nurMuster`) stimmen **exakt**; die Tooltip-Zeile steht in `hud.js` bei **358**, nicht 209 |
| Erfolgs-Emblem als „Ableitung ohne Gestaltung“, nur am eigenen Spieler, `rang: null` ohne Erfolg | **BESTÄTIGT** | `emblem()` in `achievements.js`; `nurMuster`-Zusatz in `hud.js` |
| Symbole als Bilder fehlen (★/☆) | **BESTÄTIGT** | `icon` ist ein Schlüsselwort (`schuss`, `partie`, …), keine Bilddatei; keine Assets |
| `tests/emblem.test.js` (8), `tests/e2e/emblem.spec.mjs` (5) | **BESTÄTIGT** (Existenz) | beide Dateien vorhanden |

---

## 7. Auftrag 2026-09-11 (A–G) und Offene Arbeit (P1–P3)

| Haken | Behauptung | Urteil | Beleg |
|---|---|---|---|
| 2561/2567 | Spezialmechaniken; **„Offen bleibt nur noch das aufgestellte Geschütz“** | **WIDERLEGT** | Das Geschütz **ist gebaut**: `buildEffect(pa_124)` → `kind: 'turret'`, `SELF_TARGET_KINDS` enthält `turret`, `src/engine/turret.js` (331 Zeilen), Protokoll v6. Der Haken nennt einen erledigten Punkt als offen — und widerspricht damit dem eigenen Abschnitt „Auto-Turret: die letzte fehlende Waffe“ |
| 2561 | „Wasserschub ist umgesetzt“ | **BESTÄTIGT** | `EFFECT_KIND.WATER_PUSH`, `SPECIAL_DEFAULTS.waterPushDistance = 120`, `waterPushRaise = 0,4`; Wirkung über `WET_LEVEL` belegt |
| 2568 | Balance über die volle Kartenbreite (426 px, `--sweep`, 7 Entfernungen) | **NICHT GEPRÜFT** | `scripts/balance-report.mjs --sweep` ist ein Messlauf; nicht ausgeführt |
| 2573 | Zustände als Marken im HUD (Schild, Einfrieren, DoT, Bonus), Erläuterung | **BESTÄTIGT** | `hud.js` baut Marken (`🛡 …`) und Erläuterungstexte („Schild: fängt Schaden ab…“) |
| 2575 | Wasserstand im HUD, Schwellen einmal in `config/water.js` | **BESTÄTIGT** | `hud.js` zeigt Wasserzeichen mit Zustandswort („nass/untergetaucht“); `WET_LEVEL`/`DROWN_LEVEL` werden von `match.js`, `characterSystem.js`, `turret.js`, `specials.js` **und** der Anzeige aus **einer** Datei gelesen |
| 2583 | Server-autoritative Zugzeit, `tests/turn.test.js` | **BESTÄTIGT** (Struktur) / **NICHT GEPRÜFT** (Verhalten) | Testdatei vorhanden; den „sechs Wechsel ohne Schuss“ habe ich nicht nachgespielt |
| 2587 | Client-Prädiktion mit Rollback, 1 s Auslauf | **BESTÄTIGT** | `shotPrediction.js` mit `resolve`/`discard`/`timeoutMs = 1000`; Bahn über dieselben Konstanten wie `aimPreview`; `classId` geht über die Bestandsnachricht in die Vorhersage (`main.js`) |
| 2609 | Snapshot-Kompression **nicht nötig**, 4,0 kB/s bei 12 Figuren/20 Hz | **NICHT GEPRÜFT** (Lauf) / **plausibel bestätigt** | Meine Nachrechnung des Snapshot-Puffers (12 Figuren) liegt unter dem Budget; die kB/s-Zahl ist eine Laufmessung |
| 2614–2618 | Lobby-Browser, Kartenwahl, Latenz-Ping 2 s, Fokusreihenfolge, Tastatur greift nicht in Formularfelder | **BESTÄTIGT** | `refreshLobbies`/`startPing(intervalMs = 2000)` in `main.js` bzw. `networkClient.js`; `input.js` steigt in Eingabefeldern aus |
| 2619 | Kein Draft | **BESTÄTIGT** | Es existiert keine Draft-Logik; Begründung am Eintrag |
| 2663 | `prefers-reduced-motion`: CSS-Animationen entfallen, Partikel bleiben aus | **BESTÄTIGT** | zwei `@media (prefers-reduced-motion: reduce)`-Blöcke in `index.html`; `dom.js` liest die Abfrage je Bild; `weaponAnimation.js` schaltet Bewegung ab |
| 2668 | Screenreader: Protokoll als Live-Region, `role="log"` | **BESTÄTIGT** | `index.html`: `<ul id="log-list" … role="log" aria-live="polite" aria-relevant="additions">` |
| 2675 | WebGPU optional, Canvas-2D bleibt Hauptpfad, GPU ungetestet | **BESTÄTIGT** (Selbstaussage) | `terrainBaker.js` mit `DEPTH_REACH_PX` als gemeinsame Konstante; die Doku sagt ausdrücklich, dass der GPU-Weg **ungetestet** ist — eine ehrliche Teilaussage, kein Widerspruch |
| 2701 | `/healthz` mit Zählern und `healthy` | **BESTÄTIGT** | `gameServer.js`: `healthy: verwaisteSitzungen === 0`, `orphanedSessions`, `metrics: { connections, disconnections, snapshotsSent, commandsAccepted, … }`, `uptimeMs` |
| 2706 | `dist/` als CI-Artefakt, 14 Tage | **BESTÄTIGT** | `.github/workflows/ci.yml`: `upload-artifact@v4`, `path: dist/`, `retention-days: 14` |
| 2707 | Lasttest mit künstlicher Latenz/Paketverlust | **NICHT GEPRÜFT** | E2E-Lauf verboten |
| 2716 | Replay im Client (Tempo 0,25×–4×, ±1 s, Sprung) | **BESTÄTIGT** | Menübereich mit `replay-speed`, `replay-status`; `main.js` klemmt das Tempo auf `max(0.25, …)` |
| 2719 | Strukturierte JSON-Logs, Redigierung, `LOG_LEVEL`, `LOG_FORMAT=pretty` | **BESTÄTIGT** | `src/server/logger.js`: `format === 'pretty'`, `LOG_LEVELS`, `redigiere(...)` → `[redigiert:N]`, feste Felder inkl. `msg` |
| 2731 | Mk-Dubletten zu eigenständigen Waffen umgebaut | **NICHT PRÜFBAR** | Der **Vorzustand** ist nicht mehr rekonstruierbar (die „Dubletten“ waren wertgleich; heute existiert nur noch `Dimensionssprung` mit `damage 0`). Ob die vier Paare wirklich eigenständig wurden, lässt sich am Ist-Stand nicht entscheiden |
| 2740 | **52 Waffen mit Platzhalter 25 → echte Werte** | **BESTÄTIGT** | `damageSource` heute: `source 98`, `derived 45`, `none 7`; `placeholder` = **0**. 45 + 7 = 52 ✓. Die 45 „derived“ tragen **24 verschiedene** Schadenswerte (vorher einer) |
| 2746 | Zünder für passende Waffentypen (1–5 s) | **BESTÄTIGT** | `fuseTime > 0` bei **11** Waffen, Werte **1, 2, 3, 5 s** — nicht mehr 0 bei 149/150 |
| 2750 | Zielrichtungsauswahl / Anflugart | **BESTÄTIGT** | `strikeStyle`: `self 143`, `sky 5`, `flank 2`; `STRIKE_FROM_SKY`/`STRIKE_FROM_FLANK` + `strikeStyleFor()`, Anflugart wird im Schuss aufgelöst (`resolveStrike` in `shooting.js`) |
| 2753 | Super-Schuss geklärt: Kraft 100 löst nichts aus | **BESTÄTIGT** | kein Sonderfeld bei Kraft 100 |
| 2759 | Abwurf: Vorrat 6, `Q`, Kiste bleibt, Reserve geschützt | **BESTÄTIGT** | `input.js` bindet `q`/`Q`; `tests/drop-mechanic.test.js` vorhanden |
| 2761 | Abwurf zufällig und physikalisch, **nicht im Wasser** | **BESTÄTIGT** | `#stepCrate` in `match.js` mit Wind/Flugzeit; Wasser-Ausschluss beim Wurf |
| 2767 | Sprung als echte Physik (`jump`-API existiert jetzt) | **BESTÄTIGT** | `jump()` in `match.js`, Aufruf über `input.js`/Shift |
| 2770 | **„Doppelsprung (zweiter Impuls, einmal je Zug)“** | **WIDERLEGT** | Der Motor führt **keine** Obergrenze mehr: `const SPRUENGE_UNBEGRENZT = null;` — `jumpsLeft()` gibt `null` („unbegrenzt“) zurück, Kommentar „Seit 2026-09-27: keine Obergrenze mehr“. Die Doku sagt das an anderer Stelle (Zeile 36–40: „Prüfungen für unbegrenzte Sprünge“) selbst — die beiden Stellen widersprechen sich |
| 2771 | `isGrounded` als Voraussetzung für Sprünge | **BESTÄTIGT** | `isGrounded(playerId)` in `match.js`, im `jump()`-Pfad gelesen |
| 2774 | Erfolgs-Mechanik über flache Kennzahlen, Fortschritt, Persistenz | **BESTÄTIGT** | `condition` mit `kind/kennzahl/wert`, `mindestbasis`; Auswertung liest nur Zahlen |
| 2784 | Erfolgs-Emblem am Spielernamen, nur eigener Spieler | **BESTÄTIGT** | s. § 6 |
| 2810 | Spielerprofile erfassen/anzeigen; Lieblingsnation offen | **BESTÄTIGT** | `identity.js`/`stats.js`; „Lieblingsnation“ weiterhin ohne Quelle (keine Fraktionswahl im Match) |
| 2816 | **9 × 3 × 3 = 81** Charaktere in `factions.js` | **BESTÄTIGT** (mit Zahl) | `CHARACTERS.length === 81`, `FACTIONS.length === 9`, `SLOT_CLASSES.length === 3` |
| 2825 | 60 Kulissen (12 Biome × 5) als Bilder, generativer Baukasten | **BESTÄTIGT** (Substanz) / **Zahl abgelöst** | Heute mehr als 12 Biome (u. a. `deluge`, `open`, `spires`, `warren` kamen hinzu) — die 60 sind eine Untergrenze, keine feste Zahl. Die Doku nennt das im Kulissenabschnitt selbst richtig |
| 2830 | Terrain aufgewertet, `KANTEN_STUFEN = 3`, Alpha 0,22 → 0,11 → 0,073, `check:terrain` „192 Striche, 64/64 mehrfach“ | **BESTÄTIGT** (Code) / **NICHT GEPRÜFT** (Messzahl) | `KANTEN_STUFEN = 3` in `terrainBaker.js`, Alpha-Rampe im Kommentar exakt 0,22/0,11/0,073; `tests/kantenlicht.test.js` vorhanden. Die Striche-Zahl ist eine Werkzeugausgabe |
| 2867 | Deployment-Konzept, `npm run server` | **BESTÄTIGT** | `package.json`: `server = node scripts/server.mjs`; `docs/betrieb.md` vorhanden |
| 2870 | Konten: keine Serverkonten, Sicherung als Datei | **BESTÄTIGT** | `src/shared/identity.js` mit Sicherungsfunktionen; `ABLAGEORTE.SERVER_KONTO` unbenutzt; `tests/identity.test.js` vorhanden |
| 2915 | „Wo lohnt KI im Betrieb?“ beantwortet | **BESTÄTIGT** | `docs/ki-im-betrieb.md` vorhanden |
| 3008 | Kamera (`camera.js`, **12 Tests**) | **BESTÄTIGT** | `camera.js` mit `ZOOM_GRENZEN`, `FOLGE_FAKTOR`, `Camera`; 12 `test(` in `tests/camera.test.js` |
| 3014 | Vier Kartengrößen, je in beiden Ausrichtungen, Drahtformat bis 8192 px | **BESTÄTIGT** | `MAP_SIZES`: `klein 1280×720`, `mittel 2560×1440`, `gross 3840×2160`, `krieg 5120×2880`, Hochformat flächengleich; Kommentar nennt 8192 px als Grenze |
| 3016 | **Acht** Teamfarben, Lobby prüft gegen `TEAM_COLORS.length` | **BESTÄTIGT** | `TEAM_COLORS.length === 8`; `lobby.js` prüft `teams < 2 \|\| teams > TEAM_COLORS.length` |
| 3019/3164/3167/3171 | 40 Figuren = 1,9 % Kern · 8 Spieler = 23 % · Engpass Netz · GPU nicht nötig | **NICHT GEPRÜFT** | alles Laufmessungen (`measure:load`, `measure:network`, `plan:scale`) |
| 3024 | Matcharten berechnet (`npm run check:sizes`) | **BESTÄTIGT** (Befehl) | `check:sizes = node scripts/check-match-sizes.mjs` in `package.json` |
| 3025 | Determinismus bei 40 Figuren (`tests/viele-figuren.test.js`) | **BESTÄTIGT** (Datei) / **NICHT GEPRÜFT** (Lauf) | Datei vorhanden |
| 3027 | Keine gleichzeitigen Züge | **BESTÄTIGT** | Modell „jede Einheit einzeln“ im Zugwechsel |
| 3174 | `docs/testgrenzen.md`, fünf Grenzen | **BESTÄTIGT** | Datei vorhanden |
| 3176 | `npm run smoke:fast` 24 s statt 9,4 min | **BESTÄTIGT** (Befehl) / **NICHT GEPRÜFT** (Dauer) | Befehl in `package.json` |
| 3179 | Netzlast gemessen, frühere Annahme falsch | **NICHT GEPRÜFT** | Messlauf |
| 3198 | Teamgröße 1–6 je Team, bis 12 Spieler | **BESTÄTIGT** (Team) / **WIDERLEGT** (Konstante) | `MAX_PLAYERS_PER_TEAM = 6` in `lobby.js` ✓; **`MAX_TEAMS` existiert nirgends in `src/`** (0 Treffer) — die Randnotiz „bis zu 8 Teams (`MAX_TEAMS`)“ benennt eine Konstante, die es nicht gibt. Die Sache stimmt (2–8 über `TEAM_COLORS.length`), der Name nicht |
| 3224 | Große Karten, Weg A | **NICHT GEPRÜFT** | Beschreibung eines Umbaus, ohne prüfbare Einzelaussage |
| 3285 | Sound prozedural, ohne Dateien | **BESTÄTIGT** | `src/client/sound.js` erzeugt Klang; keine Audio-Assets im Baum |
| 3313 | Mehrkomponenten-Karten, 2D-Maske steht | **BESTÄTIGT** | `src/engine/terrain/collisionMask.js` (`fromBitmap`, `isSolid`) |
| 3340 | Onboarding: `details#hilfe-browser`, Inhalte **abgeleitet** (`erklaerung`-Felder) | **BESTÄTIGT** | `index.html` hat `details#hilfe-browser`; `classes.js` und `terrainGen.js` tragen `erklaerung` je Eintrag (8 Formen); `buildHilfeView()` in `main.js`; Tests vorhanden |
| 3362 | Sidegrades: vier Einträge mit Trade-off | **BESTÄTIGT** | `SIDEGRADES`: `kompakt, schwerlast, gepanzert, praezision`, jeder mit Faktor > 1 **und** < 1 (z. B. `kompakt`: Schaden 0,85 / Tempo 1,2) |
| 3381 | Counterplay als **sichtbare Beziehung ohne Multiplikator** | **BESTÄTIGT** | `tests/counterplay.test.js` prüft genau das; der Entwurf nennt es eine Rangfolge statt eines Kreises |
| 3409 | Vier neue Formen im Menü, ein Fehler bei Startpositionen behoben | **BESTÄTIGT** (Formen) | s. § 5; der Fehler ist behoben (Startplatzprüfung gegen Wasser) |
| 3417 | `prefers-reduced-motion` (Verweis auf P2) | **BESTÄTIGT** | s. 2663 |
| 3418 | Anti-Cheat-Audit: zwei Lücken geschlossen | **BESTÄTIGT** (Struktur) / **NICHT GEPRÜFT** (Lauf) | `tests/anti-cheat.test.js` vorhanden; die Einzelangriffe habe ich nicht nachgefahren |
| 3424 | Browser-Profiling gemessen (Intel HD 3000) | **NICHT PRÜFBAR** | Hardware-/Laufmessung dieses Rechners |
| 3485 | Klassen-/Archetyp-Modifier existierten doppelt → **`combatProfile()` als einzige Verrechnung** | **BESTÄTIGT** | `combatProfile()` in `classes.js` als einzige Stelle |
| 3492 | Archetypen wirken im Spiel | **BESTÄTIGT** | `launch`/`launchSpeedMultiplier`, `health` gehen über `combatProfile()` in den Match ein |
| 3503 | **974 Zeilen toter Code, fünf Dateien** | **WIDERLEGT** (Summe) | Die fünf genannten Dateien hatten im Git **494 + 480 + 47 + 40 + 175 = 1.236** Zeilen (`git show <c^>:<pfad> \| wc -l`). Die genannten 974 sind genau die Summe der **zwei** großen Dateien (494 + 480) — die Überschrift passt nicht zu ihrer eigenen Aufzählung. Die Löschung selbst ist bestätigt (`585f3330`) |
| 3519 | `wurfAbgeleitet` entfernt, 0 Leser; fünf Verdachtsfelder entlastet | **BESTÄTIGT** | 0 Code-Treffer für `wurfAbgeleitet` |
| 3530 | `targeting` verdrahtet, 11 Widersprüche behoben | **BESTÄTIGT** | s. § 1 (150/150, 0 Widersprüche) |
| 3548 | `damageType` befüllt **und verdrahtet** | **BESTÄTIGT** | s. § 1 |
| 3568 | `requiresLineOfSight` jetzt wirksam | **BESTÄTIGT** | `shooting.js` prüft das Merkmal im `fire()`-Pfad |
| 3593 | Drei Dateien + vier Konstanten ohne Leser entfernt | **BESTÄTIGT** | `waterSimulation.js`, `terrainRenderer.js`, `ui.js` fehlen; `SHIELD_SCALE`, `PROJECT_ARMAGEDDON_WEAPON_DATABASE`, `TERRAIN_MATERIAL_DEFINITIONS`, `weaponIndexFromId` → je **0** Code-Treffer |
| 3608 | `sourceRarity` ist Doppelspur, aber kein Befund | **BESTÄTIGT** | beide Felder vorhanden und bei allen 150 Waffen wertgleich |
| 3614 | `sceneryPainter.js` **599 Zeilen**, neun Tests | **BESTÄTIGT** | `wc -l` → **599**; `tests/scenery-painter.test.js` vorhanden |
| 3624 | `effects.js` als eigenes Modul, `radius ?? 0` → NaN-Fehler behoben | **BESTÄTIGT** | `src/client/effects.js` vorhanden, `tests/effects.test.js` vorhanden |
| 3642 | Balance-Bericht: Ursachenschätzung korrigiert | **NICHT GEPRÜFT** | Textänderung in einem Werkzeug; ohne Lauf nicht belegbar |
| 3658 | **„Alle 18 Zünder-Waffen … 12 davon deutlich“** + Tabelle mit Meteoritenbrocken/Höllenkanone/Meteorregen als Zünderwaffen | **WIDERLEGT** | `node scripts/check-fuses.mjs` heute: **„Waffen mit Zünder: 11“**, „zünden NACH der Landung: 11“, Faktor > 3 nur bei **6** Waffen. Von den drei in der Doku genannten Waffen führt der Katalog heute `fuseIntent: impact` → **kein Zünder** (`timed 11 \| impact 7`). Der Punkt ist nicht falsch im Ziel (Werkzeug und Entscheidungsvorlage existieren, 0 Verstöße), aber **seine Zahlen und seine Beispieltabelle sind überholt** — das kam durch die eigene Umsetzung des `fuseIntent`-Wegs, der drei Zeilen weiter unten als Lösungsweg beschrieben ist |
| 3687 | `maxRange`: Faktor gemessen (Mittel 0,37, Bereich 0,32–0,38) | **NICHT GEPRÜFT** | Messlauf |
| 3722 | Balance der Klasse/Archetyp-Kombinationen gemessen (**neun** Kombinationen) | **BESTÄTIGT** (Zahl 9) / **NICHT GEPRÜFT** (Ordnung) | 3 Klassen × 3 Archetypen = 9; das Werkzeug `scripts/class-balance.mjs` existiert |
| 3759 | Geschütz-Zielberechnung: falscher Wind behoben | **NICHT PRÜFBAR** | Der behobene Zustand ist weg; die Zielabweichung wäre eine Laufmessung |
| 3770 | Zustandshash deckte zu wenig ab — behoben | **BESTÄTIGT** (Struktur) | `stateSnapshot.hashState` nimmt Ausrüstung/Munition/Kisten/Geschütze/Mahlstrom/Sieger auf; `match.js` delegiert nur |
| 3780 | Fünf tote Prioritätskonstanten entfernt | **BESTÄTIGT** | `CHARACTER_/DAMAGE_/LOOT_/MAELSTROM_/PROJECTILE_PRIORITY` → je **0** Code-Treffer (nur Kommentare + Wächter); `tests/system-priority.test.js` vorhanden |
| 3785 | `ReplayRecorder.forMatch()` entfernt | **BESTÄTIGT** | nur noch Kommentar + Wächter (`tests/replay-head.test.js` prüft `typeof … === 'undefined'`) |
| 3789 | Raritäts-Gewichte: eine Quelle | **NICHT GEPRÜFT** | nicht einzeln verfolgt |
| 3809 | Kisten unerreichbar → **Radien 18 → 110 px** | **BESTÄTIGT** | `PICKUP_RADIUS = 110` in `lootSystem.js`; `check-crates`-Befehl vorhanden; `tests/kisten-erreichbar.test.js` vorhanden |
| 3849 | Matchdauer: 100 Leben bleiben | **BESTÄTIGT** (Entscheidung) / **NICHT GEPRÜFT** (13,4 min) | kein Konfigwert geändert; die Dauer ist eine Laufmessung |
| 3888 | `maximum`-Werte entfernt, `teamSize` entfernt | **BESTÄTIGT** | `MATCH_RULES` führt heute `duelSeconds: { seconds: 30 }`, `fourPlayerSeconds: { seconds: 20 }`, **kein** `maximum`, **kein** `teamSize` |
| 3904 | Mahlstrom greift in **Runde 8** | **BESTÄTIGT** | `match.js` `MATCH_RULES.suddenDeath.roundBreakpoint: 8`; `maelstromActiveFromRound` liest ihn |
| 3935 | Erfolge entschieden und umgesetzt, zwei Schwellen korrigiert | **BESTÄTIGT** | s. § 6 |
| 4012 | Klassen-/Archetypzahlen in der Auswahl | **BESTÄTIGT** | Optionen nennen Werte aus `combatProfile()`; `tests/e2e/klassenwerte.spec.mjs` vorhanden (6 Testfälle gezählt) |
| 4030 | Abbruchknopf im HUD | **BESTÄTIGT** | `index.html`: `<button id="hud-abort" hidden title="Match verlassen (R)">`; Rückfrage in `main.js`; `tests/abort-knopf.test.js` vorhanden |
| 4033 | Seed-Feld erklärt sich selbst | **BESTÄTIGT** | `index.html`: „Gleicher Seed = gleiche Karte und gleicher Verlauf. Der gezogene …“ |
| 4050 | `projectile_impact` fehlte im lokalen Zweig — behoben | **BESTÄTIGT** | Die Ereigniszuordnung in `src/client/ereignisse.js` behandelt den Einschlag in **beiden** Zweigen (eine Zuordnungstabelle statt zwei `switch`-Blöcke) |
| 4058 | **13 Ereignisse stumm → die „übrigen zehn“ bewusst stumm** | **WIDERLEGT** (Zahlen) | Der Wächter `bewusstStumm` in `tests/event-coverage.test.js` listet **12** Ereignisarten (`turn_start, turn_end, entity_in_water, damage, dot_applied, shot, weapon_cooldown, crate_landed, drowning, round_crates, projectile_expired, water_pushed`). Die Doku nennt „13 waren stumm … die übrigen zehn“, `docs/audit-tief.md` nennt 7, MASTERDOTO an anderer Stelle 8. Die **Sache** ist belegt: `fuse_armed`, `fuse_expired`, `loot_error` haben jetzt Zweige (`ereignisse.js`) |
| 4070 | Fehlalarm „Kernsteuerung wirkungslos“ widerlegt | **NICHT PRÜFBAR** | Bericht über eine Beobachtung eines anderen Agenten |
| 4081 | Fehlalarm „Protokoll zeigt nur ‚ist gelandet‘“ eingeordnet | **NICHT PRÜFBAR** | dito; die „über 30 Ereignistypen“ habe ich nicht ausgezählt |

**Nicht als Haken geführt, aber im Bereich und geprüft — die HUD-Begründung im Wächter:**

> `tests/event-coverage.test.js`, Eintrag `round_crates // Buchführung; die Anzahl steht im HUD`

**WIDERLEGT.** Es gibt **keinen Kistenzähler im HUD**: `src/client/hud.js` (814 Zeilen) enthält **kein** Vorkommen von `crate` oder `Kiste`; `index.html` ebenso wenig; im gesamten Client existiert kein `crates.length` außer im Protokoll-Encoder (`protocol.js`). Kisten werden **auf der Karte gezeichnet** (`renderer.js` `#drawCrates`) — ihre **Anzahl** steht nirgends. Die Begründung für ein bewusst stummes Ereignis ist damit sachlich falsch; das ist genau die Fehlerklasse „ein Kommentar behauptet etwas, was der Code nicht tut“.

---

## 8. Zusammenfassung der WIDERLEGT-Funde

1. **`fire()` als offener Schritt 4 (Abschnitt ab Zeile 285).** Die Doku führt `fire()` (211 Zeilen) als „noch nicht ausgezogen“ und begründet damit, dass `match.js` über 3.200 Zeilen liegt. Tatsächlich existiert `src/engine/shooting.js` (745 Zeilen, Commit `8ee4935` ist Vorfahre von HEAD), `fire()` ist ein 2-Zeilen-Delegator, und `match.js` liegt bei **3.194** Zeilen.
2. **Die Randnotiz „Was dabei noch offen ist“ (Günther/Sprung online).** Drei Sätze, alle drei widerlegt: `main.js` setzt das `guenther`-Feld sehr wohl; `CONTROL.JUMP` und `CONTROL.DROP_WEAPON` existieren **schon in HEAD** und werden vom Server behandelt; Springen und Abwerfen sind online auslösbar.
3. **Doppelsprung „einmal je Zug“ (Zeile 2770).** Der Motor führt keine Obergrenze mehr (`SPRUENGE_UNBEGRENZT = null`).
4. **„Offen bleibt nur noch das aufgestellte Geschütz“ (Zeile 2567).** Das Geschütz ist gebaut und verdrahtet — der Haken nennt einen erledigten Punkt als offen und widerspricht dem eigenen Auto-Turret-Abschnitt.
5. **Zünder-Zahlen (Zeile 3658).** „Alle 18 … 12 davon deutlich“ — heute 11 mit Zünder, 6 deutlich; die drei namentlich genannten Waffen haben **keinen** Zünder mehr, weil der im selben Eintrag beschriebene `fuseIntent`-Weg umgesetzt wurde.
6. **`974 Zeilen toter Code` (Zeile 3503).** Die fünf genannten Dateien hatten 1.236 Zeilen; 974 ist nur die Summe der zwei großen.
7. **`MAX_TEAMS` (Zeile 2633).** Existiert nirgends; die Sache (2–8 Teams) stimmt über `TEAM_COLORS.length`.
8. **`round_crates` / „die Anzahl steht im HUD“.** Kein Kistenzähler im HUD.
9. **Zahlendreier beim Ereignis-Wächter:** 8 (MASTERDOTO Zeile 146) / 7 (`docs/audit-tief.md`) / 12 (Code). Dazu „13 … die übrigen zehn“ im selben Dokument.
10. **`docs/audit-tief.md`**: „397 Zeilen, TODO mit 33 Punkten“ — heute 323 Zeilen, 7 TODO-Einträge.
11. **Riesenklassen-Tabelle:** `main.js`-Brocken `handleEvents()` 229 / `handleRemoteEvent()` 142 — in `main.js` heute 4 bzw. 3 Zeilen; die Tabelle widerspricht der Korrektur weiter oben im **selben** Dokument.
12. **Zeile 144:** Die Zelle nennt „1122 Tests“ und in der Klammer „Testzahl 1075“ — eine Zeile, zwei Testzahlen.

---

## 9. Was ich NICHT geprüft habe und warum

**Verbotene Läufe (der Hauptgrund).** Nicht ausgeführt: `npm test`, `npm run test:e2e`, `npm run checks`, `npm run build`. Damit sind **alle** Testzahlen, Gate-Zahlen und E2E-Zahlen dieses Bereichs **nicht** unabhängig geprüft — sie stehen hier als zitiert, nicht als belegt: 1122 Unit-Tests, 21 Gates, 183/191 E2E bestanden, „0 rot“, 107/103/111 Testdateien, `check:targeting`- und `check:achievements`-Behauptungen sind dagegen **direkt** belegt, weil ich diese beiden Werkzeuge als reine Leser ausgeführt habe.

**Lastmessungen** (nicht ausgeführt, weil sie Rechenzeit der laufenden Arbeiter kosten): `measure:load` (1,9 % / 23 % eines Kerns), `measure:network` (4,0 kB/s), `plan:scale`, `balance` / `balance:sweep` / `balance:classes` (426 px, Mittel 0,37), `check:range`, `check:time`, `check:maelstrom`, `check:crates`, `measure:figures`, `measure:terrain` (Höhenvarianzen 16/213/47, 22 % Land), `perf` und `perf:browser`. **Alle Zahlen dieser Art sind in diesem Bericht nicht bewertet.**

**Geschmacks- und Sichturteile** (grundsätzlich nicht prüfbar): Bodenfarben der 20 neuen Kulissen, „im laufenden Spiel begutachtet“, Lesbarkeit der Geschütz-Restrundenpunkte, „das Geschütz ist von den Figuren unterscheidbar“, das Kantenlicht als Abstimmung, das Verhältnis von Symbolen und Belohnungen.

**Vorzustände ohne Gegenstand** (nicht mehr rekonstruierbar): die vier Mk-Dubletten (der alte Katalogzustand ist überschrieben), die 59 wirkungslosen Nahkampfwaffen, die alte 200-Schaden-Schwelle als Ist-Zustand, die GPU-Messung ohne Adapter.

**Nicht im Auftrag, deshalb nicht geprüft:** Zeilen 375–1499 im Detail (zweiter Prüfer). Einzelne Punkte dieses Bereichs habe ich berührt, wo sie mit meinem Bereich zusammenhängen — sie sind oben als solche gekennzeichnet.

**Zeitliche Randbedingung:** Während der Prüfung haben die vier Arbeiter committet (`6b59573` → `10ff791`). Für `src/client/main.js`, `src/server/gameServer.js`, `src/shared/protocol.js`, `tests/event-coverage.test.js` und die vier neuen `docs/audit-*.md` gilt: Der geprüfte Zustand ist der, den ich zitiere (HEAD `10ff791` plus den zu diesem Zeitpunkt ungetrackten Arbeitsstand). Läuft eine Aussage nur an einer dieser Stellen, ist sie **innerhalb von Minuten** wieder veraltet — genau darum ist jede Fundstelle unten zusätzlich über Namen verankert und der Stand hier vermerkt.

---

## 10. Die drei widerlegten Behauptungen mit der größten Wirkung

1. **`fire()` sei nicht ausgezogen (Abschnitt ab Zeile 285). — Wirkung auf künftige Arbeit.** Dies ist der als **„letzte echte Architektur-Schuld“** deklarierte Punkt des Projekts. Ein nächster Arbeiter würde mit seinem Einbau beginnen und dabei feststellen, dass `shooting.js` seit `8ee4935` existiert. Schlimmer: die Doku begründet den offenen Zustand mit „`match.js` liegt deshalb weiterhin über 3.200 Zeilen“ — eine Zahl, die den eigenen Fortschritt wegdiskutiert. Die verbleibende echte Arbeit ist ein anderer Rest (`#spawnPlayers`, `#buildTerrain`, beide ~95 Zeilen), und der steht nirgends so.
2. **`CONTROL` kenne weder `JUMP` noch `DROP_WEAPON`, Springen und Abwerfen seien online nicht auslösbar. — Wirkung auf künftige Arbeit.** Diese Randnotiz lädt zu einem „eigenen Auftrag mit eigenem Versionssprung“ ein, den es nicht braucht: beide Befehle sind in `protocol.js` **und** im Server, seit HEAD. Wer daraufhin einen Protokollschritt plant, baut doppelt.
3. **`round_crates`: „die Anzahl steht im HUD“. — Wirkung auf den Spieler.** Das ist die einzige der drei, die den **Spieler** betrifft: Sie begründet, warum der Spieler **nicht** erfährt, wann Rundenkisten erscheinen, obwohl sie die einzige Quelle für epische und legendäre Waffen sind. Der Spieler sieht die Kisten auf der Karte liegen, aber kein Element der Anzeige nennt ihre Zahl — und die Begründung, die diesen Verzicht trägt, ist nachweislich falsch.

**Knapp dahinter:** die Doppelsprung-Zeile (`SPRUENGE_UNBEGRENZT`) und die Zahlendreier beim Ereignis-Wächter (8/7/12) — beide sind Beispiele dafür, dass eine Zahl, die an drei Stellen gepflegt wird, nirgends gilt.
