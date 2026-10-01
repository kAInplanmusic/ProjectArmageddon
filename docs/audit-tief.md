# Tiefen-Audit — ProjectArmageddon (Spiel und Engine)

**Erzeugt:** 2026-09-27T15:28:19.936Z · **Commit:** `686a85f` (main) · **Node:** v22.23.2
**Werkzeug:** `tools/audit-mcp` (Audit-MCP) — statische Analyse, laufende Engine, Gate-Batterie.

> Jede Aussage in diesem Bericht ist eine Messung oder eine Fundstelle. Zahlen, die eine Annahme sind,
> stehen als Annahme da. **Design-Entscheidungen sind NICHT getroffen** — sie stehen als „Offen" mit den Zahlen daneben.

## Ampel

| Feld | Zustand | Begründung |
|---|---|---|
| gates | 🟢 gruen | alle gefahrenen Gates bestanden |
| determinismus | 🟢 gruen | Bestanden: gleicher Seed → gleicher Hash, verschiedene Seeds → verschiedene Hashes. |
| ereignisse | 🟠 gelb | 28 UNDOKUMENTIERT stumme Ereignisse: crate_pickup, crate_pickup_blocked, death, dot_tick, fall_damage, frozen, fuse_armed, fuse_expired, jumped, karte_unerreichbar, landed, loot_error, maelstrom_contract, match_over, projectile_impact, projectile_pierced, projectile_spawn, pulled, round_start, shield_absorbed, special_effect, terrain_destroyed, toxic_rain, turn_skipped, turret_deployed, turret_expired, turret_fired, weapon_dropped |
| toteDateien | 🟢 gruen | 0 Dateien ohne Importeur |
| unbenutzteKonstanten | 🟢 gruen | 0 definiert, nie gelesen |
| pfade | 🟢 gruen | Alle 54 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel. |
| doppelregeln | 🟢 gruen | 0 Bezeichner in 2+ Dateien definiert |
| marker | 🟢 gruen | 0 TODO/FIXME im Quelltext |
| zufall | 🟠 gelb | 1 Zeit-/Zufallstreffer im Simulationspfad |
| secrets | 🟢 gruen | 0 Fundstellen in getrackten Dateien |
| perf | 🟢 gruen | Budget eingehalten: kein Tick über 16,7 ms. |

## 0. Während dieses Audits behoben

Ein Befund dieses Audits war kein Berichtspunkt, sondern ein Defekt, der die Prüfung selbst lahmlegte.
Er ist **repariert und nachgemessen** — nicht nur beschrieben:

| Was | Beleg | Zustand |
|---|---|---|
| `scripts/smoke-fast.mjs` war vollständig funktionsunfähig | `spawn npm ENOENT`, **0 von 4 Schritten** gemeldet, Stacktrace statt FEHLER-Zeile | **behoben** — jetzt **4 von 4 in 26,8 s** |

**Ursache (eine Zeile, zwei Umstände):** `const ROOT = new URL('..', import.meta.url).pathname;`
`.pathname` liefert den Pfad prozent-kodiert. Das Projektverzeichnis enthält Leerzeichen, also wurde daraus
`/home/patrick/AnunnakiTools%20Projekte/laufende%20Projekte/ProjectArmageddon/` — und `fs.existsSync` darauf ist `false`.
Jeder `spawn` mit diesem `cwd` scheitert dann mit ENOENT.

**Reichweite, gemessen:** 38 Stellen im Projekt benutzen das korrekte `fileURLToPath`, genau **1** nicht —
`scripts/smoke-fast.mjs:31`. Es war die Datei, die den schnellen Rückkopplungszyklus trägt: die, die nach
jeder Änderung laufen soll. Sie ist damit seit dem Umzug des Repos in dieses Verzeichnis stumm gewesen.

**Zweiter Defekt in derselben Datei:** `laufe()` hängte keinen `error`-Handler an den `spawn`. Ein Startfehler
wurde deshalb als unbehandeltes Ereignis GEWORFEN und riss den Lauf mit einem Stacktrace ab, statt als sauberer
FEHLER-Schritt zu erscheinen. Beides ist behoben; die Ursache steht als Kommentar an der Stelle, und
`audit_paths` prüft die Fehlerklasse künftig automatisch.

## 1. Umfang

| Bereich | Dateien | Zeilen |
|---|---|---|
| src | 92 | 43181 |
| tests | 155 | 43865 |
| scripts | 44 | 9514 |
| tools | 12 | 4991 |

Ungetrackte Änderungen beim Lauf: **2**

## 2. Gate-Batterie

| Gate | Ergebnis | Dauer | Kennzahlen |
|---|---|---|---|
| lint | 🟢 bestanden | 7.2 s | – |
| validate | 🟢 bestanden | 0.4 s | – |

**2/2 bestanden** · Gesamtdauer 7.6 s

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

Tick-Kosten: mittel **0.0592 ms** · p95 0.0933 ms · p99 0.1383 ms · max 0.6806 ms
Budget 16,6667 ms → **0 Ticks über Budget** (0 %)

Budget eingehalten: kein Tick über 16,7 ms.

## 10. Statische Befunde

### 10.1 Dateien ohne Importeur

Keine. Der Wächter `tests/no-dead-code.test.js` hält diese Zahl bei 0.

### 10.2 Konstanten ohne Leser

Keine — jede definierte Konstante unter `src/` wird irgendwo gelesen.

### 10.3 Doppelregeln (derselbe Name in 2+ Dateien)

Keine.

### 10.4 Marker im Quelltext

**0 Treffer** — ein Qualitätsmerkmal: die Schulden stehen in der SSOT, nicht im Code.

### 10.5 Generierte Dateien

| Datei | Zeilen | Generator | Kopf als generiert markiert | schreibt beim Import |
|---|---|---|---|---|
| src/shared/config/weapons.js | 7355 | scripts/build-weapon-catalog.mjs | ja | nein |

### 10.6 Zufall und Zeit im Simulationspfad

| Ort | Art | Zeile |
|---|---|---|
| src/engine/replay.js:85 | Zeit | `this.#startedAt = Date.now();` |

Außerhalb des Simulationspfads (meist legitim — Seed-Erzeugung, Anzeige): **3** Treffer.

> **GEPRÜFT 2026-10-01 — der Treffer ist ein FEHLALARM, und zwar ein gemessener.**
>
> `#startedAt` hat **genau EINEN Leser**: `toJSON()` schreibt den Wert als
> `createdAt` in den Kopf der Aufzeichnung („wann wurde das aufgenommen"). Der
> Weg, den JEDE Wiedergabe geht — `fromJSON()` — liest `createdAt` nicht einmal;
> `ReplayPlayer` setzt seinen eigenen Stempel. Der Zustandshash kennt keinen
> Zeitstempel.
>
> Belegt durch `tests/replay-uhr.test.js` (**8 Prüfungen**), darunter die
> Gegenprobe mit einer VERSTELLTEN Wanduhr: Aufzeichnung und Wiedergabe ändern
> sich dadurch nicht. Der Detektor schlägt an, weil die Datei unter `src/engine/`
> liegt — er kann nicht wissen, dass der Wert das Simulationspfad-Feld nie
> erreicht.
>
> **Bewusst NICHT geändert:** Das Modul umzubauen, damit diese Heuristik grün
> wird, hieße eine getestete und begründete Konstruktion einer Faustregel
> zuliebe zu verschieben — und dabei die acht Wächter zu schwächen, die genau
> diese Zusage festhalten. Der Befund bleibt deshalb sichtbar („benannte Lücke
> statt stille Lüge"), ist aber mit Messung beantwortet.
>
> *Wenn die Wanduhr ganz aus `src/engine/` verschwinden soll, ist der saubere
> Weg: `ReplayRecorder` bekommt `createdAt` als Konstruktor-Option, und der
> AUFRUFER (Server, Aufzeichnungswerkzeug) stempelt. Das ist eine eigene Aufgabe
> mit eigenem Belegweg — sie steht in MASTERDOTO.*

## 11. Ereignis-Abdeckung

**43** emittierte Ereignisarten · **6** im Client behandelt · **37** stumm.

Davon **9 dokumentiert** als bewusst stumm (Wächter `tests/event-coverage.test.js`), **28 undokumentiert**.

| Ereignis | emittiert in | Urteil |
|---|---|---|
| `crate_landed` | src/engine/match.js:2330 | bewusst stumm (dokumentiert) |
| `crate_pickup` | src/engine/systems/lootSystem.js:231 | **UNDOKUMENTIERT** |
| `crate_pickup_blocked` | src/engine/systems/lootSystem.js:220 | **UNDOKUMENTIERT** |
| `death` | src/engine/systems/damageSystem.js:135 | **UNDOKUMENTIERT** |
| `dot_applied` | src/engine/match.js:2442 | bewusst stumm (dokumentiert) |
| `dot_tick` | src/engine/match.js:2816 | **UNDOKUMENTIERT** |
| `entity_in_water` | src/engine/systems/characterSystem.js:226 | bewusst stumm (dokumentiert) |
| `fall_damage` | src/engine/systems/characterSystem.js:200 | **UNDOKUMENTIERT** |
| `frozen` | src/engine/match.js:2426 | **UNDOKUMENTIERT** |
| `fuse_armed` | src/engine/systems/projectileSystem.js:223 | **UNDOKUMENTIERT** |
| `fuse_expired` | src/engine/systems/projectileSystem.js:202 | **UNDOKUMENTIERT** |
| `jumped` | src/engine/match.js:1347 | **UNDOKUMENTIERT** |
| `karte_unerreichbar` | src/engine/match.js:755 | **UNDOKUMENTIERT** |
| `landed` | src/engine/match.js:1407 | **UNDOKUMENTIERT** |
| `loot_error` | src/engine/match.js:1102 | **UNDOKUMENTIERT** |
| `maelstrom_contract` | src/engine/systems/maelstromSystem.js:69 | **UNDOKUMENTIERT** |
| `match_over` | src/engine/match.js:2777, src/engine/match.js:2858 | **UNDOKUMENTIERT** |
| `projectile_expired` | src/engine/systems/projectileSystem.js:324, src/engine/systems/projectileSystem.js:335 | bewusst stumm (dokumentiert) |
| `projectile_impact` | src/engine/systems/projectileSystem.js:275 | **UNDOKUMENTIERT** |
| `projectile_pierced` | src/engine/systems/projectileSystem.js:265 | **UNDOKUMENTIERT** |
| `projectile_spawn` | src/engine/match.js:2113, src/engine/shooting.js:344 | **UNDOKUMENTIERT** |
| `pulled` | src/engine/match.js:2436 | **UNDOKUMENTIERT** |
| `round_crates` | src/engine/systems/lootSystem.js:181 | bewusst stumm (dokumentiert) |
| `round_start` | src/engine/match.js:2736 | **UNDOKUMENTIERT** |
| `shield_absorbed` | src/engine/match.js:873 | **UNDOKUMENTIERT** |
| `special_effect` | src/engine/shooting.js:228 | **UNDOKUMENTIERT** |
| `terrain_destroyed` | src/engine/systems/projectileSystem.js:402 | **UNDOKUMENTIERT** |
| `toxic_rain` | src/engine/systems/maelstromSystem.js:96 | **UNDOKUMENTIERT** |
| `turn_end` | src/engine/match.js:2701 | bewusst stumm (dokumentiert) |
| `turn_skipped` | src/engine/match.js:2826 | **UNDOKUMENTIERT** |
| `turn_start` | src/engine/match.js:2833 | bewusst stumm (dokumentiert) |
| `turret_deployed` | src/engine/match.js:1896 | **UNDOKUMENTIERT** |
| `turret_expired` | src/engine/match.js:1935 | **UNDOKUMENTIERT** |
| `turret_fired` | src/engine/match.js:2118 | **UNDOKUMENTIERT** |
| `water_pushed` | src/engine/match.js:2487 | bewusst stumm (dokumentiert) |
| `weapon_cooldown` | src/engine/match.js:2392 | bewusst stumm (dokumentiert) |
| `weapon_dropped` | src/engine/match.js:2193 | **UNDOKUMENTIERT** |

*Befund:* Die undokumentierten brauchen eine Begründung oder einen Client-Zweig.

## 12. Pfad-Auflösung (`fileURLToPath` statt `.pathname`)

**54** Stellen lösen den Modulpfad korrekt auf · **0** falsch.

Alle 54 Pfad-Auflösungen benutzen fileURLToPath — keine prozent-kodierte Wurzel.

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

**Gelb:** ereignisse, zufall

**Grün:** gates, determinismus, toteDateien, unbenutzteKonstanten, pfade, doppelregeln, marker, secrets, perf

### Was schon belegt gut funktioniert

- **Determinismus hält.** Derselbe Seed ergibt über echte Züge mit Schüssen denselben Zustandshash (7ef3d6ed), verschiedene Seeds verschiedene. Das ist das Kernversprechen des Spiels und es ist gemessen.
- **Kein TODO/FIXME im Quelltext.** Die offene Arbeit steht in der SSOT (MASTERDOTO), nicht verstreut im Code.
- **Keine Datei ohne Importeur.** Der Wächter hält die 974 toten Zeilen von damals bei 0.
- **Kein Secret in getrackten Dateien.**
- **Der Gate-Apparat ist erheblich:** 2 Gates in diesem Lauf, 43865 Zeilen Tests gegen 43181 Zeilen Quelltext (Verhältnis 1.02).
- **Der Waffenkatalog ist kein Datenmüll:** 133 verschiedene powerScore-Werte bei 150 Waffen.

### Die größten Bremsen

1. 37 stumme Engine-Ereignisse — unsichtbare Lücken in der Anzeige.
2. Zeit-/Zufallstreffer im Simulationspfad gefährden den Determinismus.

## 16. Nicht messbar in dieser Umgebung

- **Visuelle Qualität des Renderings.** Braucht einen echten Browser; dieses MCP misst die Simulation, nicht das Bild.
- **Echter WebGPU-Pfad.** Ohne GPU-Adapter fällt die Umgebung auf CPU zurück.
- **Netzwerklatenz unter realen Bedingungen.** Nur simulierbar (`tests/e2e/network-conditions.spec.mjs`).
- **Der volle E2E-Lauf (27 Dateien, ~10 min).** Plan über `audit_e2e_plan`; bekannte vorbestehende Fehler: profiling-Specs ohne GPU.
- **Menschenzeit statt Simulationszeit.** Die Umrechnung braucht eine Bedenkzeit-Annahme und ist deshalb ausgewiesen, nicht gemessen.

## 17. TODO

35 Punkte, nach Schwere sortiert. **Design-Entscheidungen sind nicht getroffen** — sie stehen als solche markiert und brauchen einen Beschluss.

### HOCH (1)

- [x] Zufall/Zeit im Simulationspfad: src/engine/replay.js:85
      `this.#startedAt = Date.now();`
      → **2026-10-01 GEPRÜFT: Fehlalarm, mit Messung beantwortet.** Genau EIN
      Leser (`toJSON` → `createdAt`), `fromJSON` übernimmt ihn nicht, der
      Zustandshash kennt keinen Zeitstempel; 8 Wächter in
      `tests/replay-uhr.test.js`, darunter eine verstellte Wanduhr als
      Gegenprobe. Begründung und der Weg zu einer echten Entkopplung stehen
      in §10.6.

### MITTEL (28)

- [ ] Ereignis „crate_pickup" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/lootSystem.js:231 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „crate_pickup_blocked" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/lootSystem.js:220 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „death" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/damageSystem.js:135 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „dot_tick" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2816 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „fall_damage" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/characterSystem.js:200 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „frozen" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2426 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „fuse_armed" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/projectileSystem.js:223 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „fuse_expired" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/projectileSystem.js:202 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „jumped" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:1347 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „karte_unerreichbar" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:755 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „landed" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:1407 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „loot_error" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:1102 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „maelstrom_contract" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/maelstromSystem.js:69 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „match_over" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2777, src/engine/match.js:2858 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „projectile_impact" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/projectileSystem.js:275 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „projectile_pierced" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/projectileSystem.js:265 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „projectile_spawn" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2113, src/engine/shooting.js:344 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „pulled" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2436 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „round_start" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2736 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „shield_absorbed" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:873 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „special_effect" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/shooting.js:228 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „terrain_destroyed" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/projectileSystem.js:402 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „toxic_rain" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/systems/maelstromSystem.js:96 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „turn_skipped" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2826 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „turret_deployed" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:1896 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „turret_expired" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:1935 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „turret_fired" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2118 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen
- [ ] Ereignis „weapon_dropped" ist stumm und NICHT dokumentiert *[braucht Begründung oder Behandlung]*
      Emittiert in src/engine/match.js:2193 — Begründung im Wächter nachtragen oder einen Client-Zweig bauen

### NIEDRIG (6)

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
