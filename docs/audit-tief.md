# Tiefen-Audit — ProjectArmageddon (Spiel und Engine)

**Erzeugt:** 2026-10-23T16:40:59.753Z · **Commit:** `cf2a08c` (bg/totcode) · **Node:** v22.23.3
**Werkzeug:** `tools/audit-mcp` (Audit-MCP) — statische Analyse, laufende Engine, Gate-Batterie.

> Jede Aussage in diesem Bericht ist eine Messung oder eine Fundstelle. Zahlen, die eine Annahme sind,
> stehen als Annahme da. **Design-Entscheidungen sind NICHT getroffen** — sie stehen als „Offen" mit den Zahlen daneben.

## Ampel

| Feld | Zustand | Begründung |
|---|---|---|
| gates | 🟢 gruen | alle gefahrenen Gates bestanden |
| determinismus | 🟢 gruen | Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes. |
| ereignisse | 🟢 gruen | 6 stumme Ereignisse — alle im Wächter mit Begründung gelistet (6 gelesene Begründungen) |
| toteDateien | 🟢 gruen | 0 Dateien ohne Importeur |
| toteDaten | 🟢 gruen | 0 von 10 Datendateien (.json) unter src/ haben keinen Leser |
| unbenutzteKonstanten | 🟢 gruen | 0 definiert, nie gelesen |
| marker | 🟢 gruen | 0 TODO/FIXME im Quelltext |
| zufall | 🟢 gruen | 0 Zeit-/Zufallstreffer im Simulationspfad |
| pfade | 🟢 gruen | Alle 80 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel. |
| doppelregeln | 🟠 gelb | 28 OFFEN (nicht in der Ausnahmeliste): ZELLE, boden, CACHE_KANTE, ladeBild, MAX_TEILCHEN, aufprallStaerke, BACKDROP_URLS, begrenze, begrenze01, BILDER, cache, el, FNV_BASIS, glatt, KATEGORIEN, KONTUR, LUFT_SCHWELLE, mische, neueLeinwand, P, PARAMETER, standard, STIMMUNGEN, STUFEN, tabelle, TOENE, TWO_PI, zufall |
| secrets | 🟢 gruen | 0 Fundstellen in getrackten Dateien |
| perf | 🟠 gelb | 274 von 15019 Ticks über Budget. |

## 0. Während dieses Audits behoben

Ein Befund dieses Audits war kein Berichtspunkt, sondern ein Defekt, der die Prüfung selbst lahmlegte.
Er ist **repariert** — und, soweit dieser Lauf es messen kann, nachgemessen:

| Was | Beleg | Zustand |
|---|---|---|
| `scripts/smoke-fast.mjs` war vollständig funktionsunfähig | `spawn npm ENOENT`, **0 von 4 Schritten** gemeldet, Stacktrace statt FEHLER-Zeile | **behoben** — Das Gate `smoke:fast` war in DIESEM Lauf nicht dabei (gefahren: lint, validate) — die historische Zahl ist hier NICHT nachgemessen (letzter Commit an der Datei: `0d571d8`, 2026-09-26) |

**Ursache (eine Zeile, zwei Umstände):** `const ROOT = new URL('..', import.meta.url).pathname;`
`.pathname` liefert den Pfad prozent-kodiert. Das Projektverzeichnis enthält Leerzeichen, also wurde daraus
`/home/patrick/AnunnakiTools%20Projekte/laufende%20Projekte/ProjectArmageddon/` — und `fs.existsSync` darauf ist `false`.
Jeder `spawn` mit diesem `cwd` scheitert dann mit ENOENT.

**Reichweite, in DIESEM Lauf gemessen:** 80 Stellen im Projekt benutzen das korrekte `fileURLToPath`, **keine** mehr.
Damals — **historische Zahl, in diesem Lauf nicht messbar**, Beleg: Commit `0d571d8` (2026-09-26) — war es genau **1** Stelle: `scripts/smoke-fast.mjs:31`. Es war die Datei, die den schnellen Rückkopplungszyklus trägt: die,
die nach jeder Änderung laufen soll. Sie ist damit seit dem Umzug des Repos in dieses Verzeichnis stumm gewesen.

**Zweiter Defekt in derselben Datei:** `laufe()` hängte keinen `error`-Handler an den `spawn`. Ein Startfehler
wurde deshalb als unbehandeltes Ereignis GEWORFEN und riss den Lauf mit einem Stacktrace ab, statt als sauberer
FEHLER-Schritt zu erscheinen. Beides ist behoben; die Ursache steht als Kommentar an der Stelle, und
`audit_paths` prüft die Fehlerklasse künftig automatisch.

## 1. Umfang

| Bereich | Dateien | Zeilen |
|---|---|---|
| src | 170 | 66512 |
| tests | 263 | 60475 |
| scripts | 63 | 12206 |
| tools | 14 | 5328 |

Ungetrackte Änderungen beim Lauf: **37**

## 2. Gate-Batterie

| Gate | Ergebnis | Dauer | Kennzahlen |
|---|---|---|---|
| lint | 🟢 bestanden | 112.3 s | – |
| validate | 🟢 bestanden | 4.8 s | – |

**2/2 bestanden** · Gesamtdauer 117.1 s

## 3. Determinismus

| Lauf | Seed | Zustandshash | Status | Runde |
|---|---|---|---|---|
| 1 | 4242 | `f76026b` | playing | 3 |
| 2 | 4242 | `f76026b` | playing | 3 |
| 3 | 9999 | `e68d04e6` | playing | 3 |

Derselbe Seed → derselbe Hash: **JA** · Verschiedene Seeds → verschiedene Hashes: **JA**

Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes.

## 4. Spielverlauf (Spielgefühl als Zahl)

| Seed | Runden | Züge | Schüsse | Ticks | Spielzeit (s) | Status |
|---|---|---|---|---|---|---|
| 101 | 95 | 317 | 186 | 35587 | 593.1 | gameover |
| 202 | 106 | 323 | 192 | 36306 | 605.1 | gameover |
| 303 | 124 | 389 | 223 | 44170 | 736.2 | gameover |
| 404 | 127 | 394 | 226 | 44612 | 743.5 | gameover |
| 505 | 145 | 351 | 204 | 39592 | 659.9 | gameover |

**Mittel:** 119.4 Runden · 354.8 Züge · 206.2 Schüsse · 667.6 s Simulationszeit
**Spanne:** Runden 95–145 · Spielzeit 593.1–743.5 s

Mahlstrom greift ab Runde **8**. Davor beendet: **0 von 5**.

*Annahme:* Die Spielzeit ist Simulationszeit. Ein Mensch braucht zusätzlich Bedenkzeit — sie ist hier
konservativ mit **0 s** angesetzt, die echte Partie ist also länger.

## 5. Ballistik (gemessen, nicht gerechnet)

Karte (Default): 2560×1440 px · Abstand zum nächsten Gegner ≈ 640 px · Geschoss-Lebensdauer 109.5 Ticks

| Winkel | Kraft | Bahnpunkte | Horizontale Weite | Endhöhe |
|---|---|---|---|---|
| 20° | 30 | 7 | 41.4 px | -34.3 px |
| 20° | 60 | 12 | 160.9 px | -118.1 px |
| 20° | 100 | 14 | 315 px | -111.1 px |
| 35° | 30 | 8 | 39.7 px | -33.2 px |
| 35° | 60 | 14 | 153.2 px | -115.1 px |
| 35° | 100 | 17 | 324.6 px | -106.8 px |
| 45° | 30 | 8 | 34.7 px | -30.7 px |
| 45° | 60 | 15 | 133.4 px | -104.7 px |
| 45° | 100 | 20 | 302.6 px | -115.1 px |
| 60° | 30 | 8 | 22.8 px | -25.1 px |
| 60° | 60 | 15 | 84.9 px | -66.3 px |
| 60° | 100 | 23 | 212.9 px | -120.6 px |
| 75° | 30 | 8 | 7.4 px | -20.3 px |
| 75° | 60 | 14 | 29 px | -27.8 px |
| 75° | 100 | 23 | 75 px | -59.4 px |

## 6. Waffenkatalog

**150 Waffen** · Kategorien: melee 21, ranged 19, heavy_ranged 20, elemental 20, magic 30, utility 10, tech 20, ultimate 10

| Kennzahl | min | Median | max | verschiedene Werte |
|---|---|---|---|---|
| damage | 0 | 38 | 110 | 51 / 150 |
| blastRadius | 0 | 0 | 90 | 23 / 150 |
| knockback | 0 | 0 | 96 | 28 / 150 |
| cooldown | 0 | 1 | 3 | 4 / 150 |
| maxRange | 110 | 532 | 1062 | 80 / 150 |
| projectileSpeed | 0 | 46 | 100 | 40 / 150 |
| powerScore | 0 | 57.86 | 463.82 | 136 / 150 |
| terrainDamage | 0 | 0 | 95 | 16 / 150 |
| fuseTime | 0 | 0 | 5 | 5 / 150 |

**Auffälligkeiten:** ohneSchadenswert=7 · ohneMunition=0 · ohneKlassenbezug=0

**Felder mit überall gleichem Wert (0):** keine

## 7. Klassen × Archetypen

**9 Kombinationen** aus 3 Klassen und 3 Archetypen.

| Achse | min | max | Verhältnis |
|---|---|---|---|
| health | 0.56 | 1.56 | 2.786× |
| damage | 0.7 | 1.3 | 1.857× |
| launch | 0.6417 | 1.7333 | 2.701× |
| mobility | 0.7 | 1.2 | 1.714× |

Inert deklarierte Felder (vom Motor NICHT gelesen): `drag`, `mass`, `classSpeed`, `archetypeSpeed`, `archetypeLaunchAsDamage`

## 8. Terrain-Generator

Karte 2560×1440 px · 12 Karten je Form · Kriterium: Landanteil in %

| Form | min | max | Mittel | Streuung |
|---|---|---|---|---|
| hills | 27 | 40.2 | 33.2 | 3.577 |
| mountains | 23.6 | 50.8 | 36.4 | 7.332 |
| islands | 12.8 | 25.4 | 18.7 | 3.409 |
| caverns | 17.4 | 26.7 | 21.9 | 2.602 |
| open | 39.4 | 40.8 | 40 | 0.384 |
| spires | 19.3 | 62.7 | 39.5 | 11.455 |
| flooded | 0.8 | 19.2 | 10.1 | 5.132 |
| warren | 4.4 | 21 | 12.3 | 4.837 |

*Lesart:* Eine breite Streuung heißt, der Generator nutzt seinen Spielraum. Eine Streuung nahe 0 hieße,
die Form liefert immer dasselbe.

## 9. Leistung

Züge 150 · Schüsse 106 · gemessene Ticks 15019

Tick-Kosten: mittel **0.6662 ms** · p95 0.1465 ms · p99 24.9083 ms · max 59.3960 ms
Budget 16,6667 ms → **274 Ticks über Budget** (2 %)

274 von 15019 Ticks über Budget.

## 10. Statische Befunde

### 10.1 Dateien ohne Importeur

Keine. Wächter `tests/no-dead-code.test.js`: vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`).

#### Die Freisprüche dieser Prüfung — mit Beleg

Ein Einstiegspunkt ist hier kein NAME, sondern ein BELEG: die Datei muss Code
haben UND in einem Manifest außerhalb `src/` namentlich genannt sein (`package.json`, `index.html`, `vite.config.mjs`, `playwright.config.mjs`).
Wer nur so heißt, wird geprüft — bis 2026-09-27 galt das Gegenteil, und `src/shared/data/index.js` war damit still freigesprochen.

| Einstiegspunkt | Beleg |
|---|---|
| src/client/index.js | namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt und nicht leer |
| src/client/main.js | namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt und nicht leer |
| src/engine/index.js | namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt und nicht leer |
| src/server/index.js | namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt und nicht leer |
| src/shared/index.js | namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt und nicht leer |

### 10.1b Datendateien ohne Leser

Keine: alle 10 `.json` unter `src/` werden von irgendwo im CODE gelesen.

### 10.2 Konstanten ohne Leser

Keine — jede definierte Konstante unter `src/` wird irgendwo gelesen.

### 10.3 Doppelregeln (derselbe Name in 2+ Dateien)

Gemessen: **28** · davon aus der Ausnahmeliste begründet: **0** · OFFEN: **28**. Das Urteil wird aus `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)` gelesen; ohne Eintrag dort gilt eine Doppelregel als offen (fail-safe in Richtung des lauteren Fehlers).

| Name | Orte | Urteil |
|---|---|---|
| `ZELLE` | src/engine/systems/feuerSystem.js:36 · src/client/feuerOptik.js:22 · src/client/figurSheets.js:16 · src/client/waffenAnimation.js:41 · src/client/waffenSprites.js:25 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `boden` | src/shared/config/biome-neu.js:68 · src/shared/config/biome-planet.js:73 · src/shared/config/biome-themen.js:21 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `CACHE_KANTE` | src/client/figurStufen.js:11 · src/client/figurenBilder.js:34 · src/client/waffenSprites.js:22 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `ladeBild` | src/client/figurenBilder.js:47 · src/client/tierBilder.js:33 · src/client/waffenSprites.js:253 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `MAX_TEILCHEN` | src/client/feuerOptik.js:18 · src/client/figurEffekte.js:13 · src/client/tierBuehne.js:19 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `aufprallStaerke` | src/shared/config/zerstoerung.js:125 · src/client/zerstoerungOptik.js:260 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `BACKDROP_URLS` | src/client/kulisseUndWasser.js:28 · src/client/renderer.js:101 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `begrenze` | src/client/musik.js:66 · src/client/valhallaOmen.js:49 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `begrenze01` | src/client/gefuehl.js:57 · src/client/soundMixer.js:58 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `BILDER` | src/client/roster.js:20 · src/client/tierBilder.js:15 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `cache` | src/client/figurenBilder.js:45 · src/client/tierBilder.js:31 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `el` | src/client/hilfeTiere.js:128 · src/client/hilfeZerstoerung.js:15 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `FNV_BASIS` | src/shared/stoffkarte.js:35 · src/engine/terrain/collisionMask.js:141 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `glatt` | src/client/gelaendeStil.js:80 · src/client/waffenAnimation.js:244 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `KATEGORIEN` | src/client/klangProfile.js:26 · src/client/waffenAnimation.js:33 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `KONTUR` | src/client/figuren.js:18 · src/client/gelaendeStil.js:27 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `LUFT_SCHWELLE` | src/client/figurAnimation.js:24 · src/client/hoehlenSchatten.js:86 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `mische` | src/shared/config/backdrops.js:718 · src/shared/config/loadouts.js:105 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `neueLeinwand` | src/client/figurStufen.js:15 · src/client/waffenSprites.js:246 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `P` | src/client/figurTypen.js:59 · src/client/klangProfile.js:53 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `PARAMETER` | src/client/figurTypen.js:72 · src/client/waffenAnimation.js:107 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `standard` | src/client/figurenBilder.js:35 · src/client/waffenSprites.js:263 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `STIMMUNGEN` | src/shared/config/backdrops.js:698 · src/client/musikListe.js:13 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `STUFEN` | src/engine/systems/lootSystem.js:93 · src/client/figurStufen.js:13 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `tabelle` | src/client/gelaendeStil.js:233 · src/client/stoffOptik.js:22 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `TOENE` | src/client/gelaendeStil.js:31 · src/client/toasts.js:18 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `TWO_PI` | src/client/figurAnimation.js:33 · src/client/figurEffekte.js:200 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |
| `zufall` | src/engine/zerstoerung.js:108 · src/client/valhallaOmen.js:38 | **OFFEN** — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen |

### 10.4 Marker im Quelltext

**0 Treffer** — ein Qualitätsmerkmal: die Schulden stehen in der SSOT, nicht im Code.

### 10.5 Generierte Dateien

| Datei | Zeilen | Generator | Kopf als generiert markiert | schreibt beim Import |
|---|---|---|---|---|
| src/shared/config/weapons.js | 7355 | scripts/build-weapon-catalog.mjs | ja | nein |

### 10.6 Zufall und Zeit im Simulationspfad

Keine Treffer unter `src/engine/`.

Außerhalb des Simulationspfads (meist legitim — Seed-Erzeugung, Anzeige): **21** Treffer.

## 11. Ereignis-Abdeckung

**81** emittierte Ereignisarten (`emit(` UND `melde(`) · **75** im Client behandelt · **6** stumm.

*Methode und ihre Belegstärke (Textsuche, kein Aufrufgraph):* Ein Ereignis gilt als behandelt, wenn sein Name unter `src/client/` als Zeichenkette oder als UNQUOTIERTER Tabellenschlüssel vorkommt. Davon **54 nur über einen Schlüssel** belegt — der schwächere Beleg; ein solcher Name kann theoretisch ein fremder Schlüssel sein. Bis 2026-09-26 zählte das Werkzeug nur Zeichenketten und meldete dadurch Namen als „UNDOKUMENTIERT", die im Client einen Zweig haben (`tests/event-coverage.test.js:218-232`). Ein „stumm" aus dieser Tabelle ist ein PRÜFAUFTRAG, kein Urteil.

Davon **6 mit Begründung als bewusst stumm gelistet** (Wächter `tests/event-coverage.test.js`), **0 undokumentiert**.

| Ereignis | emittiert in | Urteil | Begründung (aus dem Wächter) |
|---|---|---|---|
| `dot_applied` | src/engine/match.js:2244 | bewusst stumm (begründet) | Zustandsmarke am Spielernamen |
| `entity_in_water` | src/engine/systems/characterSystem.js:226 | bewusst stumm (begründet) | Wasserstand steht als Marke am Spielernamen (seit 2026-09-27 gedrosselt: im Snapshot redundant) |
| `round_crates` | src/engine/systems/lootSystem.js:243 | bewusst stumm (begründet) | Buchführung; die Anzahl steht im HUD |
| `turn_end` | src/engine/match.js:2503 | bewusst stumm (begründet) | Rundenanzeige im HUD, plus Zugwechsel im Spielerfeld |
| `water_pushed` | src/engine/match.js:2289 | bewusst stumm (begründet) | der Wasserstand am Ziel ist die sichtbare Wirkung |
| `weapon_cooldown` | src/engine/match.js:2190 | bewusst stumm (begründet) | die Waffenliste zeigt den Nachladezustand |

*Keine Lücke:* Jedes stumme Ereignis ist im Wächter MIT Begründung gelistet — der Begründungstext wird in dieser Spalte einzeln gezeigt. Geprüft ist damit, dass eine Begründung HINGESCHRIEBEN wurde; ob sie stichhaltig ist, ist eine Einzelprüfung und keine Messung.

## 12. Pfad-Auflösung (`fileURLToPath` statt `.pathname`)

**80** Stellen lösen den Modulpfad korrekt auf · **0** falsch.

Alle 80 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel.

## 13. Server-Autorität und Secrets

Identity aus dem Token: **3** Fundstellen
`Number()` auf Drahtwerten: **0** Fundstellen
Direkt gelesene Kennungen aus der Nachricht: **0** Fundstellen

Secret-Scan über getrackte Dateien: **0** Fundstellen.

*Die lokale `.env` ist gitignoriert und der vorgesehene Ort — sie ist kein Befund.*

## 14. Prüfkatalog (Wissensstand der Skills)

**59 Prüffragen** aus 9 Regelwerken.

| Quelle | Fragen |
|---|---|
| code-grounded-ux-audit | 19 |
| projectarmageddon-verification | 15 |
| deterministic-sim-engine-dev | 4 |
| webapp-architecture-audit | 6 |
| webapp-security-config-audit | 5 |
| e2e-suite-deep-analysis | 3 |
| browser-game-audio-and-feel | 1 |
| procedural-terrain-generation | 4 |
| systematic-debugging | 2 |

Abrufbar über das Werkzeug `audit_checklist` (filterbar nach Thema, Quelle, Freitext).

## 15. Auswertung

**Rot:** keine

**Gelb:** doppelregeln, perf

**Grün:** gates, determinismus, ereignisse, toteDateien, toteDaten, unbenutzteKonstanten, marker, zufall, pfade, secrets

### Was schon belegt gut funktioniert

- **Determinismus hält.** Derselbe Seed ergibt über echte Züge mit Schüssen denselben Zustandshash (f76026b), verschiedene Seeds verschiedene. Das ist das Kernversprechen des Spiels und es ist gemessen.
- **Kein TODO/FIXME im Quelltext.** Gemessen: 0 Treffer (Abschnitt 10.4). Wo die offene Arbeit steht (SSOT/MASTERDOTO), prüft dieser Bericht nicht — das ist eine Vereinbarung, keine Messung.
- **Keine Datendatei ohne Leser.** Gemessen: alle 10 `.json` unter `src/` werden im Code genannt (Abschnitt 10.1b). Bis 2026-09-27 war diese Zahl gar nicht messbar — `QUELTEXT` kannte kein `.json`.
- **Keine Datei ohne Importeur.** In diesem Lauf gemessen: 0 (die 974 toten Zeilen sind die historische Zahl der ersten Messung). Wächter `tests/no-dead-code.test.js`: vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`), nicht dieser Bericht.
- **Kein Secret in getrackten Dateien.**
- **Ereignis-Abdeckung ist sauber:** 75 von 81 Ereignisarten behandelt, die 6 stummen sind im Wächter `tests/event-coverage.test.js` EINZELN mit Begründung gelistet — der Text wird gelesen, nicht unterstellt (Abschnitt 11).
- **OFFENE Doppelregeln (28):** `ZELLE` (src/engine/systems/feuerSystem.js:36 · src/client/feuerOptik.js:22 · src/client/figurSheets.js:16 · src/client/waffenAnimation.js:41 · src/client/waffenSprites.js:25), `boden` (src/shared/config/biome-neu.js:68 · src/shared/config/biome-planet.js:73 · src/shared/config/biome-themen.js:21), `CACHE_KANTE` (src/client/figurStufen.js:11 · src/client/figurenBilder.js:34 · src/client/waffenSprites.js:22), `ladeBild` (src/client/figurenBilder.js:47 · src/client/tierBilder.js:33 · src/client/waffenSprites.js:253), `MAX_TEILCHEN` (src/client/feuerOptik.js:18 · src/client/figurEffekte.js:13 · src/client/tierBuehne.js:19), `aufprallStaerke` (src/shared/config/zerstoerung.js:125 · src/client/zerstoerungOptik.js:260), `BACKDROP_URLS` (src/client/kulisseUndWasser.js:28 · src/client/renderer.js:101), `begrenze` (src/client/musik.js:66 · src/client/valhallaOmen.js:49), `begrenze01` (src/client/gefuehl.js:57 · src/client/soundMixer.js:58), `BILDER` (src/client/roster.js:20 · src/client/tierBilder.js:15), `cache` (src/client/figurenBilder.js:45 · src/client/tierBilder.js:31), `el` (src/client/hilfeTiere.js:128 · src/client/hilfeZerstoerung.js:15), `FNV_BASIS` (src/shared/stoffkarte.js:35 · src/engine/terrain/collisionMask.js:141), `glatt` (src/client/gelaendeStil.js:80 · src/client/waffenAnimation.js:244), `KATEGORIEN` (src/client/klangProfile.js:26 · src/client/waffenAnimation.js:33), `KONTUR` (src/client/figuren.js:18 · src/client/gelaendeStil.js:27), `LUFT_SCHWELLE` (src/client/figurAnimation.js:24 · src/client/hoehlenSchatten.js:86), `mische` (src/shared/config/backdrops.js:718 · src/shared/config/loadouts.js:105), `neueLeinwand` (src/client/figurStufen.js:15 · src/client/waffenSprites.js:246), `P` (src/client/figurTypen.js:59 · src/client/klangProfile.js:53), `PARAMETER` (src/client/figurTypen.js:72 · src/client/waffenAnimation.js:107), `standard` (src/client/figurenBilder.js:35 · src/client/waffenSprites.js:263), `STIMMUNGEN` (src/shared/config/backdrops.js:698 · src/client/musikListe.js:13), `STUFEN` (src/engine/systems/lootSystem.js:93 · src/client/figurStufen.js:13), `tabelle` (src/client/gelaendeStil.js:233 · src/client/stoffOptik.js:22), `TOENE` (src/client/gelaendeStil.js:31 · src/client/toasts.js:18), `TWO_PI` (src/client/figurAnimation.js:33 · src/client/figurEffekte.js:200), `zufall` (src/engine/zerstoerung.js:108 · src/client/valhallaOmen.js:38). Diese Definitionen steht in mehr als einer Datei und ist NICHT in der Ausnahmeliste `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)` begründet — nach der Projektregel „eine Regel, eine Stelle" ein offener Befund, kein Freispruch. Ein Freispruch wird ab hier GELESEN, nicht behauptet: Wer ihn will, trägt den Namen mit Begründung und Orten in die Liste ein.
- **Der Gate-Apparat ist erheblich:** 2 Gates in diesem Lauf, 60475 Zeilen Tests gegen 66512 Zeilen Quelltext (Verhältnis 0.91).
- **Der Waffenkatalog ist kein Datenmüll:** 136 verschiedene powerScore-Werte bei 150 Waffen.

### Die größten Bremsen

1. 6 stumme Engine-Ereignisse (6 mit Begründung gelistet, 0 OHNE Begründung) — jeder stumme Pfad ist in der Anzeige unsichtbar.

## 16. Nicht messbar in dieser Umgebung

- **Visuelle Qualität des Renderings.** Braucht einen echten Browser; dieses MCP misst die Simulation, nicht das Bild.
- **Echter WebGPU-Pfad.** Ohne GPU-Adapter fällt die Umgebung auf CPU zurück.
- **Netzwerklatenz unter realen Bedingungen.** Nur simulierbar (`tests/e2e/network-conditions.spec.mjs`).
- **Der volle E2E-Lauf (28 Dateien, ~10 min).** Plan über `audit_e2e_plan`; bekannte vorbestehende Fehler: profiling-Specs ohne GPU.
- **Menschenzeit statt Simulationszeit.** Die Umrechnung braucht eine Bedenkzeit-Annahme und ist deshalb ausgewiesen, nicht gemessen.

### 16.1 Was die statischen Sonden NICHT sehen

Die Sichtgrenzen stammen aus `lib/statisch.mjs#sichtgrenzen()` und werden mit JEDER Antwort des Werkzeugs `audit_deadcode` ausgegeben — eine Meldung, die ihre Lücke nennt, ist mehr wert als eine stille Null:

- *quelltext:* Dateifilter Quelltext: .js/.mjs/.cjs/.ts/.tsx — .json/.html/.css/.yml/.md gelten NICHT als Quelltext (in ihnen gibt es keinen Export, keinen Import, keine Doppelregel).
- *daten:* Dateifilter Daten: .json NUR unter src/ — .json ausserhalb src/ (z. B. project_armageddon_weapons_v1.json, bgworker-todo.json, .pa-state/lobbies.json) wird NICHT erfasst.
- *leser:* Leser-Suche: nur CODE (.js/.mjs/.cjs/.ts/.tsx/.html) ohne Kommentare — ein Dateiname in Doku (.md) zaehlt NICHT als Leser. Eine Pfad-NENNUNG im Code ist dagegen schon ein Leser: wer den Namen in einem Test, einer Probe oder einer Zeichenkette erwaehnt, spricht die Datei frei (belegt an dieser Stelle selbst: eine kopierte Probe im Pruefgebiet hat ihre eigenen synthetischen Dateien freigesprochen — probe-blindstellen.mjs).
- *importe:* Import-Erkennung: Textsuche nach `from '…'` und `import('…')` — mehrzeilig geprueft (probe-blindstellen.mjs). Ein Pfad, der erst zur Laufzeit gebaut wird (Variable, Template-String, `import.meta.glob`), ist NICHT erkennbar.
- *doppelregeln:* Doppelregeln: nur Definitionen auf MODUL-Ebene (Spalte 0) unter src/ — lokale Namen in Funktionsruempfen zaehlen NICHT (gemessen: 391 „Doppelnamen", davon 2 echte Regeln); Definitionen in scripts/, tests/ und tools/ werden NICHT erfasst.
- *exporte:* unbenutzteExporte zaehlt NAMEN, nicht BINDUNGEN: Steht derselbe Name in einer zweiten Datei als Export, gilt er als gelesen — die tote Fassung bleibt unsichtbar (belegt: hasSpecialEffect in src/engine/specials.js:234, maskiert durch den gleichnamigen Export in src/shared/config/weapons.js:7128; gemeldet werden nur 5 „Exporte ohne externen Leser"). AUSSERDEM unsichtbar als Leser: der Default-Export-Block (`export default { foo, bar }`). Ein Name, der NUR dort steht, gilt als ungelesen — gemessen an src/engine/shooting.js (`resolveStrike`, `fuseTicksFor`, `applySelfEffect`), die ueber `shootingModule.resolveStrike` erreichbar sind und deshalb KEINE toten Exporte sind. Drei falsch gemeldete Namen.
- *einstieg:* Einstiegspunkte: nur mit BELEG (namentlich in package.json / index.html / vite.config.mjs / playwright.config.mjs genannt UND nicht codeleer) — sonst wird geprueft.
- *ausgeschlossen:* Nicht durchsucht (SKIP_DIRS aus repo.mjs): node_modules, .git, dist, build, artifacts, test-results, playwright-report, .pa-state, coverage, .vite, uploaded.

## 17. TODO

30 Punkte, nach Schwere sortiert. **Design-Entscheidungen sind nicht getroffen** — sie stehen als solche markiert und brauchen einen Beschluss.

### MITTEL (29)

- [ ] Offene Doppelregel: ZELLE
      src/engine/systems/feuerSystem.js:36 · src/client/feuerOptik.js:22 · src/client/figurSheets.js:16 · src/client/waffenAnimation.js:41 · src/client/waffenSprites.js:25 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: boden
      src/shared/config/biome-neu.js:68 · src/shared/config/biome-planet.js:73 · src/shared/config/biome-themen.js:21 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: CACHE_KANTE
      src/client/figurStufen.js:11 · src/client/figurenBilder.js:34 · src/client/waffenSprites.js:22 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: ladeBild
      src/client/figurenBilder.js:47 · src/client/tierBilder.js:33 · src/client/waffenSprites.js:253 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: MAX_TEILCHEN
      src/client/feuerOptik.js:18 · src/client/figurEffekte.js:13 · src/client/tierBuehne.js:19 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: aufprallStaerke
      src/shared/config/zerstoerung.js:125 · src/client/zerstoerungOptik.js:260 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: BACKDROP_URLS
      src/client/kulisseUndWasser.js:28 · src/client/renderer.js:101 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: begrenze
      src/client/musik.js:66 · src/client/valhallaOmen.js:49 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: begrenze01
      src/client/gefuehl.js:57 · src/client/soundMixer.js:58 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: BILDER
      src/client/roster.js:20 · src/client/tierBilder.js:15 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: cache
      src/client/figurenBilder.js:45 · src/client/tierBilder.js:31 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: el
      src/client/hilfeTiere.js:128 · src/client/hilfeZerstoerung.js:15 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: FNV_BASIS
      src/shared/stoffkarte.js:35 · src/engine/terrain/collisionMask.js:141 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: glatt
      src/client/gelaendeStil.js:80 · src/client/waffenAnimation.js:244 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: KATEGORIEN
      src/client/klangProfile.js:26 · src/client/waffenAnimation.js:33 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: KONTUR
      src/client/figuren.js:18 · src/client/gelaendeStil.js:27 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: LUFT_SCHWELLE
      src/client/figurAnimation.js:24 · src/client/hoehlenSchatten.js:86 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: mische
      src/shared/config/backdrops.js:718 · src/shared/config/loadouts.js:105 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: neueLeinwand
      src/client/figurStufen.js:15 · src/client/waffenSprites.js:246 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: P
      src/client/figurTypen.js:59 · src/client/klangProfile.js:53 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: PARAMETER
      src/client/figurTypen.js:72 · src/client/waffenAnimation.js:107 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: standard
      src/client/figurenBilder.js:35 · src/client/waffenSprites.js:263 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: STIMMUNGEN
      src/shared/config/backdrops.js:698 · src/client/musikListe.js:13 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: STUFEN
      src/engine/systems/lootSystem.js:93 · src/client/figurStufen.js:13 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: tabelle
      src/client/gelaendeStil.js:233 · src/client/stoffOptik.js:22 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: TOENE
      src/client/gelaendeStil.js:31 · src/client/toasts.js:18 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: TWO_PI
      src/client/figurAnimation.js:33 · src/client/figurEffekte.js:200 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] Offene Doppelregel: zufall
      src/engine/zerstoerung.js:108 · src/client/valhallaOmen.js:38 — nicht in der Ausnahmeliste tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) — gilt als offen
- [ ] 274 Ticks über dem 16,7-ms-Budget
      274 von 15019 Ticks über Budget.

### NIEDRIG (1)

- [ ] Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen *[Offen — Design-Entscheidung]*
      0 von 5 Partien endeten VOR Runde 8

---

Erzeugt von `tools/audit-mcp` v1.0.0 · Repo `/home/patrick/pa-wt/totcode`
