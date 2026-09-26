# Tiefen-Audit — ProjectArmageddon (Spiel und Engine)

**Erzeugt:** 2026-09-26T18:36:08.331Z · **Commit:** `d2d8495` (main) · **Node:** v22.23.2
**Werkzeug:** `tools/audit-mcp` (Audit-MCP) — statische Analyse, laufende Engine, Gate-Batterie.

> Jede Aussage in diesem Bericht ist eine Messung oder eine Fundstelle. Zahlen, die eine Annahme sind,
> stehen als Annahme da. **Design-Entscheidungen sind NICHT getroffen** — sie stehen als „Offen" mit den Zahlen daneben.

## Ampel

| Feld | Zustand | Begründung |
|---|---|---|
| gates | 🟢 gruen | alle gefahrenen Gates bestanden |
| determinismus | 🟢 gruen | Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes. |
| ereignisse | 🟢 gruen | 8 stumme Ereignisse — alle im Wächter mit Begründung gelistet (8 gelesene Begründungen) |
| toteDateien | 🟢 gruen | 0 Dateien ohne Importeur |
| unbenutzteKonstanten | 🟢 gruen | 0 definiert, nie gelesen |
| marker | 🟢 gruen | 0 TODO/FIXME im Quelltext |
| zufall | 🟠 gelb | 1 Zeit-/Zufallstreffer im Simulationspfad |
| pfade | 🟢 gruen | Alle 42 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel. |
| doppelregeln | 🟢 gruen | keine Doppelregel gemessen |
| secrets | 🟢 gruen | 0 Fundstellen in getrackten Dateien |
| perf | 🟢 gruen | Budget eingehalten: kein Tick über 16,7 ms. |

## 0. Während dieses Audits behoben

Ein Befund dieses Audits war kein Berichtspunkt, sondern ein Defekt, der die Prüfung selbst lahmlegte.
Er ist **repariert** — und, soweit dieser Lauf es messen kann, nachgemessen:

| Was | Beleg | Zustand |
|---|---|---|
| `scripts/smoke-fast.mjs` war vollständig funktionsunfähig | `spawn npm ENOENT`, **0 von 4 Schritten** gemeldet, Stacktrace statt FEHLER-Zeile | **behoben** — Das Gate `smoke:fast` war in DIESEM Lauf nicht dabei (gefahren: lint, validate) — die historische Zahl ist hier NICHT nachgemessen (letzter Commit an der Datei: `dfce278`, 2026-09-25) |

**Ursache (eine Zeile, zwei Umstände):** `const ROOT = new URL('..', import.meta.url).pathname;`
`.pathname` liefert den Pfad prozent-kodiert. Das Projektverzeichnis enthält Leerzeichen, also wurde daraus
`/home/patrick/AnunnakiTools%20Projekte/laufende%20Projekte/ProjectArmageddon/` — und `fs.existsSync` darauf ist `false`.
Jeder `spawn` mit diesem `cwd` scheitert dann mit ENOENT.

**Reichweite, in DIESEM Lauf gemessen:** 42 Stellen im Projekt benutzen das korrekte `fileURLToPath`, **keine** mehr.
Damals — **historische Zahl, in diesem Lauf nicht messbar**, Beleg: Commit `dfce278` (2026-09-25) — war es genau **1** Stelle: `scripts/smoke-fast.mjs:31`. Es war die Datei, die den schnellen Rückkopplungszyklus trägt: die,
die nach jeder Änderung laufen soll. Sie ist damit seit dem Umzug des Repos in dieses Verzeichnis stumm gewesen.

**Zweiter Defekt in derselben Datei:** `laufe()` hängte keinen `error`-Handler an den `spawn`. Ein Startfehler
wurde deshalb als unbehandeltes Ereignis GEWORFEN und riss den Lauf mit einem Stacktrace ab, statt als sauberer
FEHLER-Schritt zu erscheinen. Beides ist behoben; die Ursache steht als Kommentar an der Stelle, und
`audit_paths` prüft die Fehlerklasse künftig automatisch.

## 1. Umfang

| Bereich | Dateien | Zeilen |
|---|---|---|
| src | 88 | 37808 |
| tests | 130 | 35040 |
| scripts | 44 | 8907 |
| tools | 8 | 3455 |

Ungetrackte Änderungen beim Lauf: **31**

## 2. Gate-Batterie

| Gate | Ergebnis | Dauer | Kennzahlen |
|---|---|---|---|
| lint | 🟢 bestanden | 6.2 s | – |
| validate | 🟢 bestanden | 0.5 s | – |

**2/2 bestanden** · Gesamtdauer 6.7 s

## 3. Determinismus

| Lauf | Seed | Zustandshash | Status | Runde |
|---|---|---|---|---|
| 1 | 4242 | `7ef3d6ed` | playing | 3 |
| 2 | 4242 | `7ef3d6ed` | playing | 3 |
| 3 | 9999 | `95e928a` | playing | 3 |

Derselbe Seed → derselbe Hash: **JA** · Verschiedene Seeds → verschiedene Hashes: **JA**

Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes.

## 4. Spielverlauf (Spielgefühl als Zahl)

| Seed | Runden | Züge | Schüsse | Ticks | Spielzeit (s) | Status |
|---|---|---|---|---|---|---|
| 101 | 25 | 62 | 53 | 3747 | 62.5 | gameover |
| 202 | 26 | 61 | 51 | 3591 | 59.9 | gameover |
| 303 | 25 | 62 | 52 | 3509 | 58.5 | gameover |
| 404 | 25 | 73 | 57 | 3930 | 65.5 | gameover |
| 505 | 31 | 79 | 59 | 4807 | 80.1 | gameover |

**Mittel:** 26.4 Runden · 67.4 Züge · 54.4 Schüsse · 65.3 s Simulationszeit
**Spanne:** Runden 25–31 · Spielzeit 58.5–80.1 s

Mahlstrom greift ab Runde **8**. Davor beendet: **0 von 5**.

*Annahme:* Die Spielzeit ist Simulationszeit. Ein Mensch braucht zusätzlich Bedenkzeit — sie ist hier
konservativ mit **0 s** angesetzt, die echte Partie ist also länger.

## 5. Ballistik (gemessen, nicht gerechnet)

Karte (Default): 2560×1440 px · Abstand zum nächsten Gegner ≈ 640 px · Geschoss-Lebensdauer 135 Ticks

| Winkel | Kraft | Bahnpunkte | Horizontale Weite | Endhöhe |
|---|---|---|---|---|
| 20° | 30 | 9 | 71.8 px | -56.6 px |
| 20° | 60 | 13 | 232 px | -118.9 px |
| 20° | 100 | 13 | 382.8 px | -42.2 px |
| 35° | 30 | 10 | 68 px | -53.3 px |
| 35° | 60 | 16 | 230.7 px | -118.5 px |
| 35° | 100 | 16 | 406.5 px | 7.6 px |
| 45° | 30 | 10 | 58.8 px | -46.5 px |
| 45° | 60 | 18 | 209.2 px | -120.7 px |
| 45° | 100 | 19 | 407.3 px | 10 px |
| 60° | 30 | 10 | 38 px | -32.8 px |
| 60° | 60 | 19 | 141.7 px | -109.3 px |
| 60° | 100 | 27 | 333.7 px | -101.2 px |
| 75° | 30 | 10 | 12.8 px | -21.8 px |
| 75° | 60 | 18 | 48.5 px | -39.4 px |
| 75° | 100 | 29 | 122.3 px | -96.9 px |

## 6. Waffenkatalog

**150 Waffen** · Kategorien: melee 21, ranged 19, heavy_ranged 20, elemental 20, magic 30, utility 10, tech 20, ultimate 10

| Kennzahl | min | Median | max | verschiedene Werte |
|---|---|---|---|---|
| damage | 0 | 39 | 110 | 51 / 150 |
| blastRadius | 0 | 0 | 90 | 23 / 150 |
| knockback | 0 | 0 | 96 | 18 / 150 |
| cooldown | 0 | 1 | 3 | 4 / 150 |
| maxRange | 110 | 565 | 1062 | 63 / 150 |
| projectileSpeed | 0 | 40.8 | 100 | 25 / 150 |
| powerScore | 0 | 56.34 | 463.82 | 133 / 150 |
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

Züge 86 · Schüsse 65 · gemessene Ticks 5036

Tick-Kosten: mittel **0.0601 ms** · p95 0.1166 ms · p99 0.1462 ms · max 0.8656 ms
Budget 16,6667 ms → **0 Ticks über Budget** (0 %)

Budget eingehalten: kein Tick über 16,7 ms.

## 10. Statische Befunde

### 10.1 Dateien ohne Importeur

Keine. Wächter `tests/no-dead-code.test.js`: vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`).

### 10.2 Konstanten ohne Leser

Keine — jede definierte Konstante unter `src/` wird irgendwo gelesen.

### 10.3 Doppelregeln (derselbe Name in 2+ Dateien)

Keine gemessen.

### 10.4 Marker im Quelltext

**0 Treffer** — ein Qualitätsmerkmal: die Schulden stehen in der SSOT, nicht im Code.

### 10.5 Generierte Dateien

| Datei | Zeilen | Generator | Kopf als generiert markiert | schreibt beim Import |
|---|---|---|---|---|
| src/shared/config/weapons.js | 7359 | scripts/build-weapon-catalog.mjs | ja | nein |

### 10.6 Zufall und Zeit im Simulationspfad

| Ort | Art | Zeile |
|---|---|---|
| src/engine/replay.js:85 | Zeit | `this.#startedAt = Date.now();` |

Außerhalb des Simulationspfads (meist legitim — Seed-Erzeugung, Anzeige): **3** Treffer.

## 11. Ereignis-Abdeckung

**47** emittierte Ereignisarten (`emit(` UND `melde(`) · **39** im Client behandelt · **8** stumm.

*Methode und ihre Belegstärke (Textsuche, kein Aufrufgraph):* Ein Ereignis gilt als behandelt, wenn sein Name unter `src/client/` als Zeichenkette oder als UNQUOTIERTER Tabellenschlüssel vorkommt. Davon **33 nur über einen Schlüssel** belegt — der schwächere Beleg; ein solcher Name kann theoretisch ein fremder Schlüssel sein. Bis 2026-09-26 zählte das Werkzeug nur Zeichenketten und meldete dadurch Namen als „UNDOKUMENTIERT", die im Client einen Zweig haben (`tests/event-coverage.test.js:218-232`). Ein „stumm" aus dieser Tabelle ist ein PRÜFAUFTRAG, kein Urteil.

Davon **8 mit Begründung als bewusst stumm gelistet** (Wächter `tests/event-coverage.test.js`), **0 undokumentiert**.

| Ereignis | emittiert in | Urteil | Begründung (aus dem Wächter) |
|---|---|---|---|
| `dot_applied` | src/engine/match.js:2451 | bewusst stumm (begründet) | Zustandsmarke am Spielernamen |
| `entity_in_water` | src/engine/systems/characterSystem.js:138 | bewusst stumm (begründet) | Wasserstand steht als Marke am Spielernamen |
| `projectile_expired` | src/engine/systems/projectileSystem.js:324, src/engine/systems/projectileSystem.js:335 | bewusst stumm (begründet) | ein verfallenes Geschoss ist kein Ereignis für den |
| `round_crates` | src/engine/systems/lootSystem.js:148 | bewusst stumm (begründet) | Buchführung; die Anzahl steht im HUD |
| `turn_end` | src/engine/match.js:2710 | bewusst stumm (begründet) | dito, plus Zugwechsel im Spielerfeld |
| `water_pushed` | src/engine/match.js:2496 | bewusst stumm (begründet) | der Wasserstand am Ziel ist die sichtbare Wirkung |
| `weapon_cooldown` | src/engine/match.js:2237 | bewusst stumm (begründet) | die Waffenliste zeigt den Nachladezustand |
| `weapon_dropped` | src/engine/match.js:2038 | bewusst stumm (begründet) | `dropWeapon()` meldet das Ergebnis direkt im Log |

*Keine Lücke:* Jedes stumme Ereignis ist im Wächter MIT Begründung gelistet — der Begründungstext wird in dieser Spalte einzeln gezeigt. Geprüft ist damit, dass eine Begründung HINGESCHRIEBEN wurde; ob sie stichhaltig ist, ist eine Einzelprüfung und keine Messung.

## 12. Pfad-Auflösung (`fileURLToPath` statt `.pathname`)

**42** Stellen lösen den Modulpfad korrekt auf · **0** falsch.

Alle 42 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel.

## 13. Server-Autorität und Secrets

Identity aus dem Token: **2** Fundstellen
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

**Gelb:** zufall

**Grün:** gates, determinismus, ereignisse, toteDateien, unbenutzteKonstanten, marker, pfade, doppelregeln, secrets, perf

### Was schon belegt gut funktioniert

- **Determinismus hält.** Derselbe Seed ergibt über echte Züge mit Schüssen denselben Zustandshash (7ef3d6ed), verschiedene Seeds verschiedene. Das ist das Kernversprechen des Spiels und es ist gemessen.
- **Kein TODO/FIXME im Quelltext.** Gemessen: 0 Treffer (Abschnitt 10.4). Wo die offene Arbeit steht (SSOT/MASTERDOTO), prüft dieser Bericht nicht — das ist eine Vereinbarung, keine Messung.
- **Keine Datei ohne Importeur.** In diesem Lauf gemessen: 0 (die 974 toten Zeilen sind die historische Zahl der ersten Messung). Wächter `tests/no-dead-code.test.js`: vorhanden — ob er diese Zahl hält, zeigt nur sein eigener Lauf (`npm test`), nicht dieser Bericht.
- **Kein Secret in getrackten Dateien.**
- **Ereignis-Abdeckung ist sauber:** 39 von 47 Ereignisarten behandelt, die 8 stummen sind im Wächter `tests/event-coverage.test.js` EINZELN mit Begründung gelistet — der Text wird gelesen, nicht unterstellt (Abschnitt 11).
- **Der Gate-Apparat ist erheblich:** 2 Gates in diesem Lauf, 35040 Zeilen Tests gegen 37808 Zeilen Quelltext (Verhältnis 0.93).
- **Der Waffenkatalog ist kein Datenmüll:** 133 verschiedene powerScore-Werte bei 150 Waffen.

### Die größten Bremsen

1. 8 stumme Engine-Ereignisse (8 mit Begründung gelistet, 0 OHNE Begründung) — jeder stumme Pfad ist in der Anzeige unsichtbar.
2. Zeit-/Zufallstreffer im Simulationspfad gefährden den Determinismus.

## 16. Nicht messbar in dieser Umgebung

- **Visuelle Qualität des Renderings.** Braucht einen echten Browser; dieses MCP misst die Simulation, nicht das Bild.
- **Echter WebGPU-Pfad.** Ohne GPU-Adapter fällt die Umgebung auf CPU zurück.
- **Netzwerklatenz unter realen Bedingungen.** Nur simulierbar (`tests/e2e/network-conditions.spec.mjs`).
- **Der volle E2E-Lauf (28 Dateien, ~10 min).** Plan über `audit_e2e_plan`; bekannte vorbestehende Fehler: profiling-Specs ohne GPU.
- **Menschenzeit statt Simulationszeit.** Die Umrechnung braucht eine Bedenkzeit-Annahme und ist deshalb ausgewiesen, nicht gemessen.

## 17. TODO

8 Punkte, nach Schwere sortiert. **Design-Entscheidungen sind nicht getroffen** — sie stehen als solche markiert und brauchen einen Beschluss.

### HOCH (1)

- [ ] Zufall/Zeit im Simulationspfad: src/engine/replay.js:85
      this.#startedAt = Date.now();

### NIEDRIG (7)

- [ ] Export ohne Leser: rosterWithSprites
      src/client/roster.js
- [ ] Export ohne Leser: resolveStrike
      src/engine/shooting.js
- [ ] Export ohne Leser: fuseTicksFor
      src/engine/shooting.js
- [ ] Export ohne Leser: GERAETE_SCHLUESSEL
      src/shared/identity.js
- [ ] Export ohne Leser: isValidAngle
      src/shared/validation.js
- [ ] Export ohne Leser: isValidPower
      src/shared/validation.js
- [ ] Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen *[Offen — Design-Entscheidung]*
      0 von 5 Partien endeten VOR Runde 8

---

Erzeugt von `tools/audit-mcp` v1.0.0 · Repo `/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon`
