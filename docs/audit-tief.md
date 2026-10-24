# Tiefen-Audit — ProjectArmageddon (Spiel und Engine)

**Erzeugt:** 2026-10-24T12:38:37.151Z · **Commit:** `9301578` (main) · **Node:** v22.23.3
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
| pfade | 🟢 gruen | Alle 83 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel. |
| doppelregeln | 🟢 gruen | 17 Doppelregel(n), jede in tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN) begründet: MAX_TEILCHEN, aufprallStaerke, BILDER, cache, CACHE_KANTE, KONTUR, LUFT_SCHWELLE, mische, P, PARAMETER, standard, STIMMUNGEN, STUFEN, tabelle, TOENE, ZELLE, zufall |
| secrets | 🟢 gruen | 0 Fundstellen in getrackten Dateien |
| perf | 🟢 gruen | Budget eingehalten: kein Tick über 16,7 ms. |

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

**Reichweite, in DIESEM Lauf gemessen:** 83 Stellen im Projekt benutzen das korrekte `fileURLToPath`, **keine** mehr.
Damals — **historische Zahl, in diesem Lauf nicht messbar**, Beleg: Commit `0d571d8` (2026-09-26) — war es genau **1** Stelle: `scripts/smoke-fast.mjs:31`. Es war die Datei, die den schnellen Rückkopplungszyklus trägt: die,
die nach jeder Änderung laufen soll. Sie ist damit seit dem Umzug des Repos in dieses Verzeichnis stumm gewesen.

**Zweiter Defekt in derselben Datei:** `laufe()` hängte keinen `error`-Handler an den `spawn`. Ein Startfehler
wurde deshalb als unbehandeltes Ereignis GEWORFEN und riss den Lauf mit einem Stacktrace ab, statt als sauberer
FEHLER-Schritt zu erscheinen. Beides ist behoben; die Ursache steht als Kommentar an der Stelle, und
`audit_paths` prüft die Fehlerklasse künftig automatisch.

## 1. Umfang

| Bereich | Dateien | Zeilen |
|---|---|---|
| src | 175 | 66595 |
| tests | 266 | 60743 |
| scripts | 65 | 12693 |
| tools | 14 | 5419 |

Ungetrackte Änderungen beim Lauf: **6**

## 2. Gate-Batterie

| Gate | Ergebnis | Dauer | Kennzahlen |
|---|---|---|---|
| lint | 🟢 bestanden | 5.9 s | – |
| validate | 🟢 bestanden | 0.2 s | – |

**2/2 bestanden** · Gesamtdauer 6.1 s

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

Tick-Kosten: mittel **0.0403 ms** · p95 0.0450 ms · p99 0.0762 ms · max 2.9223 ms
Budget 16,6667 ms → **0 Ticks über Budget** (0 %)

Budget eingehalten: kein Tick über 16,7 ms.

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

Gemessen: **17** · davon aus der Ausnahmeliste begründet: **17** · OFFEN: **0**. Das Urteil wird aus `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)` gelesen; ohne Eintrag dort gilt eine Doppelregel als offen (fail-safe in Richtung des lauteren Fehlers).

| Name | Orte | Urteil |
|---|---|---|
| `MAX_TEILCHEN` | src/client/feuerOptik.js:19 · src/client/figurEffekte.js:15 · src/client/tierBuehne.js:19 | bewusst, begründet: Drei getrennte Bild-Budgets: Feuer-, Figuren- und Tier-Effekte begrenzen jeweils ihre eigenen Teilchen; die Werte 280/192/90 sind je Renderer verschieden, keine gemeinsame Regel. |
| `aufprallStaerke` | src/shared/config/zerstoerung.js:125 · src/client/zerstoerungOptik.js:260 | bewusst, begründet: Der Client rechnet Spaltenläufe in Zellen um und ruft die gemeinsame Formel aus shared/config/zerstoerung.js — ein Adapter, keine zweite Formel. |
| `BILDER` | src/client/roster.js:20 · src/client/tierBilder.js:17 | bewusst, begründet: Verschiedene Vite-Globs: Figurenporträts in roster.js, Tierposen in tierBilder.js; nur der Bezeichner stimmt überein. |
| `cache` | src/client/figurenBilder.js:44 · src/client/tierBilder.js:33 | bewusst, begründet: Zwei getrennte Caches für verschiedene Daten (Figurenbilder bzw. Tierposen); gemeinsamer Name, keine gemeinsame Regel. |
| `CACHE_KANTE` | src/client/figurStufen.js:13 · src/client/waffenSprites.js:25 | bewusst, begründet: figurStufen.js meint die Kantenlänge der Figuren-Mip-Stufe (128), waffenSprites.js die gecachte Waffenzelle (64) — zwei verschiedene Caches. |
| `KONTUR` | src/client/figuren.js:18 · src/client/gelaendeStil.js:28 | bewusst, begründet: figuren.js hält die Konturfarbe als RGB-Tripel aus PAL, gelaendeStil.js als hexRgb-Fassung desselben Palettenwerts — verschiedene Darstellungen, kein geteilter Wert. |
| `LUFT_SCHWELLE` | src/client/figurAnimation.js:25 · src/client/hoehlenSchatten.js:86 | bewusst, begründet: figurAnimation.js meint die Vertikalgeschwindigkeit (px/s), ab der eine Figur fliegt; hoehlenSchatten.js die Helligkeitsschwelle einer Kavernenkarte — gleicher Name, andere Einheit und Bedeutung. |
| `mische` | src/shared/config/backdrops.js:718 · src/shared/config/loadouts.js:105 | bewusst, begründet: backdrops.js mischt zwei RGB-Farben, loadouts.js ist ein Ganzzahl-Hash — gleicher Name, verschiedene Verfahren. |
| `P` | src/client/figurTypen.js:59 · src/client/klangProfile.js:51 | bewusst, begründet: figurTypen.js ist eine Kurzform für Object.freeze, klangProfile.js eine Profilfabrik mit eigener Signatur — gleicher Ein-Buchstaben-Name, andere Funktion. |
| `PARAMETER` | src/client/figurTypen.js:72 · src/client/waffenAnimation.js:106 | bewusst, begründet: figurTypen.js beschreibt Bewegungsparameter je Figurentyp, waffenAnimation.js Animationsparameter je Waffenkategorie — zwei getrennte Tabellen. |
| `standard` | src/client/figurenBilder.js:34 · src/client/waffenSprites.js:249 | bewusst, begründet: figurenBilder.js ist die Standard-Ankertabelle, waffenSprites.js die Standardverdrahtung des Laders — gleicher Name, andere Bedeutung. |
| `STIMMUNGEN` | src/shared/config/backdrops.js:698 · src/client/musikListe.js:13 | bewusst, begründet: backdrops.js listet Kulissen-Stimmungen (hell/dunkel/…), musikListe.js Einsatzorte eines Musikstücks (menu/match/intensiv) — gleicher Name, andere Bedeutung. |
| `STUFEN` | src/engine/systems/lootSystem.js:93 · src/client/figurStufen.js:15 | bewusst, begründet: lootSystem.js meint Seltenheitsstufen, figurStufen.js die Mip-Kantenlängen der Figurensprites — gleicher Name, andere Bedeutung. |
| `tabelle` | src/client/gelaendeStil.js:229 · src/client/stoffOptik.js:22 | bewusst, begründet: gelaendeStil.js baut eine Rausch-Tabelle für Verzerrung, stoffOptik.js eine Texturtabelle — verschiedene Daten und Formate. |
| `TOENE` | src/client/gelaendeStil.js:32 · src/client/toasts.js:18 | bewusst, begründet: gelaendeStil.js meint Steintöne (RGB), toasts.js die Toene-Symbole und Rollen der Hinweise — gleicher Name, andere Bedeutung. |
| `ZELLE` | src/client/figurSheets.js:16 · src/client/waffenAnimation.js:40 | bewusst, begründet: figurSheets.js meint die 256-px-Zelle der Figurensprite-Sheets, waffenAnimation.js die 128-px-Zelle der Waffenatlanten; die Feuer- und Waffensprite-Fassungen sind bereits zusammengeführt, die Atlanten bleiben verschieden. |
| `zufall` | src/engine/zerstoerung.js:108 · src/client/valhallaOmen.js:40 | bewusst, begründet: engine/zerstoerung.js ist ein reiner Ganzzahl-Hash, valhallaOmen.js ein mulberry32-Zustandsgenerator für Blitze — verschiedene Verfahren. |

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

**83** Stellen lösen den Modulpfad korrekt auf · **0** falsch.

Alle 83 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel.

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

**Gelb:** keine

**Grün:** gates, determinismus, ereignisse, toteDateien, toteDaten, unbenutzteKonstanten, marker, zufall, pfade, doppelregeln, secrets, perf

### Was schon belegt gut funktioniert

- **Determinismus hält.** Derselbe Seed ergibt über echte Züge mit Schüssen denselben Zustandshash (f76026b), verschiedene Seeds verschiedene. Das ist das Kernversprechen des Spiels und es ist gemessen.
- **Kein TODO/FIXME im Quelltext.** Gemessen: 0 Treffer (Abschnitt 10.4). Wo die offene Arbeit steht (SSOT/MASTERDOTO), prüft dieser Bericht nicht — das ist eine Vereinbarung, keine Messung.
- **Keine Datendatei ohne Leser.** Gemessen: alle 10 `.json` unter `src/` werden im Code genannt (Abschnitt 10.1b). Bis 2026-09-27 war diese Zahl gar nicht messbar — `QUELTEXT` kannte kein `.json`.
- **Keine Datei ohne Importeur.** In diesem Lauf gemessen: 0 (die 974 toten Zeilen sind die historische Zahl der ersten Messung). Wächter `tests/no-dead-code.test.js`: vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`), nicht dieser Bericht.
- **Kein Secret in getrackten Dateien.**
- **Ereignis-Abdeckung ist sauber:** 75 von 81 Ereignisarten behandelt, die 6 stummen sind im Wächter `tests/event-coverage.test.js` EINZELN mit Begründung gelistet — der Text wird gelesen, nicht unterstellt (Abschnitt 11).
- **Bewusst und begründet (17):** `MAX_TEILCHEN` (src/client/feuerOptik.js:19 · src/client/figurEffekte.js:15 · src/client/tierBuehne.js:19) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: Drei getrennte Bild-Budgets: Feuer-, Figuren- und Tier-Effekte begrenzen jeweils ihre eigenen Teilchen; die Werte 280/192/90 sind je Renderer verschieden, keine gemeinsame Regel.
- **Bewusst und begründet (17):** `aufprallStaerke` (src/shared/config/zerstoerung.js:125 · src/client/zerstoerungOptik.js:260) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: Der Client rechnet Spaltenläufe in Zellen um und ruft die gemeinsame Formel aus shared/config/zerstoerung.js — ein Adapter, keine zweite Formel.
- **Bewusst und begründet (17):** `BILDER` (src/client/roster.js:20 · src/client/tierBilder.js:17) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: Verschiedene Vite-Globs: Figurenporträts in roster.js, Tierposen in tierBilder.js; nur der Bezeichner stimmt überein.
- **Bewusst und begründet (17):** `cache` (src/client/figurenBilder.js:44 · src/client/tierBilder.js:33) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: Zwei getrennte Caches für verschiedene Daten (Figurenbilder bzw. Tierposen); gemeinsamer Name, keine gemeinsame Regel.
- **Bewusst und begründet (17):** `CACHE_KANTE` (src/client/figurStufen.js:13 · src/client/waffenSprites.js:25) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurStufen.js meint die Kantenlänge der Figuren-Mip-Stufe (128), waffenSprites.js die gecachte Waffenzelle (64) — zwei verschiedene Caches.
- **Bewusst und begründet (17):** `KONTUR` (src/client/figuren.js:18 · src/client/gelaendeStil.js:28) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figuren.js hält die Konturfarbe als RGB-Tripel aus PAL, gelaendeStil.js als hexRgb-Fassung desselben Palettenwerts — verschiedene Darstellungen, kein geteilter Wert.
- **Bewusst und begründet (17):** `LUFT_SCHWELLE` (src/client/figurAnimation.js:25 · src/client/hoehlenSchatten.js:86) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurAnimation.js meint die Vertikalgeschwindigkeit (px/s), ab der eine Figur fliegt; hoehlenSchatten.js die Helligkeitsschwelle einer Kavernenkarte — gleicher Name, andere Einheit und Bedeutung.
- **Bewusst und begründet (17):** `mische` (src/shared/config/backdrops.js:718 · src/shared/config/loadouts.js:105) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: backdrops.js mischt zwei RGB-Farben, loadouts.js ist ein Ganzzahl-Hash — gleicher Name, verschiedene Verfahren.
- **Bewusst und begründet (17):** `P` (src/client/figurTypen.js:59 · src/client/klangProfile.js:51) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurTypen.js ist eine Kurzform für Object.freeze, klangProfile.js eine Profilfabrik mit eigener Signatur — gleicher Ein-Buchstaben-Name, andere Funktion.
- **Bewusst und begründet (17):** `PARAMETER` (src/client/figurTypen.js:72 · src/client/waffenAnimation.js:106) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurTypen.js beschreibt Bewegungsparameter je Figurentyp, waffenAnimation.js Animationsparameter je Waffenkategorie — zwei getrennte Tabellen.
- **Bewusst und begründet (17):** `standard` (src/client/figurenBilder.js:34 · src/client/waffenSprites.js:249) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurenBilder.js ist die Standard-Ankertabelle, waffenSprites.js die Standardverdrahtung des Laders — gleicher Name, andere Bedeutung.
- **Bewusst und begründet (17):** `STIMMUNGEN` (src/shared/config/backdrops.js:698 · src/client/musikListe.js:13) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: backdrops.js listet Kulissen-Stimmungen (hell/dunkel/…), musikListe.js Einsatzorte eines Musikstücks (menu/match/intensiv) — gleicher Name, andere Bedeutung.
- **Bewusst und begründet (17):** `STUFEN` (src/engine/systems/lootSystem.js:93 · src/client/figurStufen.js:15) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: lootSystem.js meint Seltenheitsstufen, figurStufen.js die Mip-Kantenlängen der Figurensprites — gleicher Name, andere Bedeutung.
- **Bewusst und begründet (17):** `tabelle` (src/client/gelaendeStil.js:229 · src/client/stoffOptik.js:22) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: gelaendeStil.js baut eine Rausch-Tabelle für Verzerrung, stoffOptik.js eine Texturtabelle — verschiedene Daten und Formate.
- **Bewusst und begründet (17):** `TOENE` (src/client/gelaendeStil.js:32 · src/client/toasts.js:18) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: gelaendeStil.js meint Steintöne (RGB), toasts.js die Toene-Symbole und Rollen der Hinweise — gleicher Name, andere Bedeutung.
- **Bewusst und begründet (17):** `ZELLE` (src/client/figurSheets.js:16 · src/client/waffenAnimation.js:40) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: figurSheets.js meint die 256-px-Zelle der Figurensprite-Sheets, waffenAnimation.js die 128-px-Zelle der Waffenatlanten; die Feuer- und Waffensprite-Fassungen sind bereits zusammengeführt, die Atlanten bleiben verschieden.
- **Bewusst und begründet (17):** `zufall` (src/engine/zerstoerung.js:108 · src/client/valhallaOmen.js:40) — Ausnahme laut `tools/audit-mcp/lib/statisch.mjs (DOPPELREGEL_AUSNAHMEN)`: engine/zerstoerung.js ist ein reiner Ganzzahl-Hash, valhallaOmen.js ein mulberry32-Zustandsgenerator für Blitze — verschiedene Verfahren.
- **Der Gate-Apparat ist erheblich:** 2 Gates in diesem Lauf, 60743 Zeilen Tests gegen 66595 Zeilen Quelltext (Verhältnis 0.91).
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

1 Punkte, nach Schwere sortiert. **Design-Entscheidungen sind nicht getroffen** — sie stehen als solche markiert und brauchen einen Beschluss.

### NIEDRIG (1)

- [ ] Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen *[Offen — Design-Entscheidung]*
      0 von 5 Partien endeten VOR Runde 8

---

Erzeugt von `tools/audit-mcp` v1.0.0 · Repo `/home/patrick/projectArmageddon`
