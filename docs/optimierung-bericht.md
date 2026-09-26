# Optimierungs-Bericht — wo ist überhaupt etwas zu holen?

**Auftrag:** Messen statt vermuten. Vor jeder Optimierung die Frage beantworten, an
welcher Stelle überhaupt etwas zu gewinnen ist — und wo nichts zu holen ist, das
als Ergebnis festhalten.

**Stand:** HEAD `e26821d`, Branch `main`, 2026-09-26. Rein lesende Messung: keine
Produktivdatei, keine Testdatei, kein `scripts/`-Werkzeug wurde geändert; kein
Playwright, kein Server gestartet. Alle Zahlen unten stammen aus Läufen, deren
Befehl und Ausgabe wörtlich daneben stehen.

**Umgebung:** Node v22.23.2, Linux, kein GPU-Zugriff in dieser Messung.

---

## 0. Der bekannte Stand — nachgemessen

Der Tiefen-Audit meldet alles grün. Drei seiner Zahlen habe ich nachgemessen,
bevor ich nach Kandidaten gesucht habe. **Eine davon stimmt heute nicht mehr.**

### 0.1 Tick-Kosten: 0,069 ms sind überholt

```
$ npm run perf
  Konfiguration : 2 Teams x 2, Karte hills, Seed 20260910
  Simuliert     : 18000 Ticks (300.0 s Spielzeit), 39 Schüsse
  Matches       : 1 (Ø 13 Runden pro Match)
  Wanduhr       : 2552 ms → 7053 Ticks/s
  Tick-Dauer    : mittel 0.092 ms | p95 0.1454 ms | p99 0.3805 ms | max 8.3183 ms
  Budget        : 16.6667 ms/Tick (60 Hz)
  Über Budget   : 0 Ticks (0 %)
  Speicher      : Heap 12.1 MB, RSS 70.1 MB
  Echtzeitfaktor: 117.6x (Simulation läuft schneller als Echtzeit)
```

Der Audit nennt „Mittel 0,069 ms je Tick". Heute steht dort **0,092 ms** — Faktor
1,33. Die Aussage „0 Ticks über dem Budget" bleibt richtig und ist der Punkt, auf
den es ankommt: **0,092 ms sind 0,55 % des 16,7-ms-Budgets.**

### 0.2 Netz: bestätigt

```
$ npm run measure:network
Konfiguration    Voll (Ø)  Delta (Ø)   Spitze  je Spieler/s
2 Spieler           189 B      189 B    261 B        3.7 KB
4 Spieler           217 B      217 B    297 B        4.2 KB
6 Spieler           234 B      234 B    341 B        4.6 KB
8 Spieler           230 B      230 B    303 B        4.5 KB
...
  8 Spieler, Spitzenwert: 303 B je Snapshot
    alle acht:   47 KB/s  = 0.046 MB/s
```

217 B bei vier Spielern, 303 B Spitze bei acht, 47 KB/s für acht — **unverändert**.
Die Summen-Gegenprobe des Werkzeugs stimmt: `Summe 217 B (gegen Mittel 217 B —
Abweichung -0.0 B)`.

### 0.3 Kaltstart „~30 s": nicht belegbar

Für die Zahl existiert **kein Messwerkzeug**. Die Suche findet im ganzen Repo nur
zwei Stellen mit „30 s":

- `docs/audit-userflow.md:13` und `:84` — „Zugtimer 30 s", „Zugzeit: 30 s (Duell)".
  Das ist die **Zugdauer**, nicht die Startdauer.
- `docs/audit-blackbox.md:83` — „Wartezeiten beim Matchstart (sein Protokoll nennt
  ‚30 s Wartezeit')". Das ist eine Nutzeraussage, keine Messung.

Was ich stattdessen messen konnte, steht in Abschnitt 6 (33–45 ms). Die
30-s-Zahl ist mit hoher Wahrscheinlichkeit eine Verwechslung mit dem Zugtimer.
Ein Menü-zu-erstes-Bild-Messwert existiert nicht und war in diesem Auftrag nicht
messbar (kein Browser, kein Server).

### 0.4 Tote Dateien / unbenutzte Konstanten

0 / 0 laut Audit — das habe ich nicht nachgemessen, es ist kein Optimierungsfeld.

---

## 1. Kandidat: Tick-Kosten je SYSTEM

**Werkzeuglage:** `npm run perf` (`scripts/perf-profile.mjs`) misst nur den GANZEN
Tick — mittel/p95/p99/max. Ein Werkzeug für den Anteil der einzelnen Systeme gab es
nicht; ich habe deshalb im Speicher instrumentiert (Prototypen der Systeme
umwickelt, nichts geschrieben) und die Transparenz der Messung belegt.

**Befehl (gekürzt; vollständig: System-Prototypen umwickelt, dann derselbe
Lauf wie `perf-profile.mjs`):**

```js
import { MatchController } from "./src/engine/match.js";
import { ProjectileSystem } from "./src/engine/systems/projectileSystem.js";
// ... CharacterSystem, MaelstromSystem, LootSystem, DamageSystem,
//     PhysicsSystem, TurnSystem, GuentherSystem, World
// wrap(name, cls) misst process.hrtime.bigint() um cls.prototype.update
// 6000 Ticks, 2 Teams x 2, hills, Seed 20260910, maxRounds 30
```

**Ausgabe (wörtlich):**

```
Instrumentiert: 6000 Ticks, 26 Schuesse, 1 Matches, Zustandshash ce98bb9b
Tick gesamt (Mittel) : 0.0988 ms  → 9.9 % von 16,7 ms

Posten                        ms/Tick    Anteil   Aufrufe    max ms
ecs.step (gesamt)          0.03733    37.77 %     6000    4.4859
loot                       0.01203    12.17 %     6000    0.4964
projectile                 0.00735     7.43 %     1343    4.3325
character                  0.00551     5.58 %     6000    0.3683
physics                    0.00178     1.80 %     6000    0.2151
guenther                   0.00094     0.95 %     6000    0.7013
damage                     0.00082     0.83 %     6000    0.0751
turn                       0.00058     0.59 %     6000    0.3454
maelstrom                  0.00045     0.45 %     6000    0.0429

Summe Systeme          : 0.02946 ms/Tick (29.8 %)
world.step()           : 0.03733 ms/Tick (37.8 %)
→ ECS-Query-Aufwand    : 0.00881 ms/Tick
→ match.step() Rest    : 0.06149 ms/Tick (62.2 %)
```

**Transparenz-Beleg** — derselbe Lauf ohne Instrumentierung liefert denselben
Zustandshash und praktisch dieselbe Tickzeit:

```
OHNE Instrumentierung: 6000 Ticks, 26 Schuesse, 1 Matches, Zustandshash ce98bb9b
Tick gesamt (Mittel) : 0.0930 ms  → 9.3 % von 16,7 ms
```

Also: **Messaufschlag 0,0058 ms/Tick (6 %)**, Zustandshash identisch
(`ce98bb9b`) — die Messung verändert das Spiel nicht.

### 1.1 Der Befund: 62 % des Ticks liegen AUSSERHALB der Systeme

Die Summe aller acht Systeme (inkl. Günther) beträgt **0,02946 ms = 29,8 %** des
Ticks. `world.step()` ist mit 0,03733 ms (37,8 %) etwas teurer als die Summe seiner
Systeme; die Differenz von **0,00881 ms/Tick (8,9 %)** ist der Query-Aufwand des
ECS (`getEntitiesBySignature` + `entities.filter(id => isActive(id))` je System und
Tick — `ecs/world.js:185–190` legt dabei jedes Mal ein NEUES Array an).

Der größte Einzelposten liegt aber im Rest von `match.step()`: **0,06149 ms/Tick =
62,2 %**. Um den zu benennen, habe ich den V8-Profiler im Speicher laufen lassen
(`node:inspector`, kein Dateiausgabe):

```
$ node --input-type=module   # Profiler.setSamplingInterval 50 µs, 6000 Ticks
Profillauf: 6000 Ticks, 26 Schuesse, Zustandshash ce98bb9b, Tick-Mittel 0.1160 ms
Samples gesamt: 8159 (Intervall 0,05 ms)
Selbstzeit — Top 13 (wörtlich, in der Reihenfolge des Laufs)
(anonym)  @engine/stateSnapshot.js:63        90.3 ms   0.01504 ms/Tick   13.0 %
step  @ecs/world.js:179                      29.9 ms   0.00498 ms/Tick    4.3 %
baueAnsichtszustand  @engine/stateSnapshot.js:62  26.9 ms 0.00447 ms/Tick   3.9 %
snapshot  @engine/specials.js:593            24.4 ms   0.00407 ms/Tick    3.5 %
update  @systems/lootSystem.js:151           16.4 ms   0.00274 ms/Tick    2.4 %
step  @engine/match.js:1112                  14.2 ms   0.00237 ms/Tick    2.0 %
cooldownFor  @engine/match.js:2351           14.1 ms   0.00235 ms/Tick    2.0 %
(garbage collector)                          13.6 ms   0.00226 ms/Tick    1.9 %
getComponent  @ecs/world.js:111              12.7 ms   0.00212 ms/Tick    1.8 %
getState  @engine/match.js:2977              12.3 ms   0.00205 ms/Tick    1.8 %
getComponent  @ecs/componentStore.js:163     11.7 ms   0.00195 ms/Tick    1.7 %
#zustandsQuelle  @engine/match.js:3020       10.0 ms   0.00167 ms/Tick    1.4 %
snapshot  @systems/guentherSystem.js:414      9.5 ms   0.00158 ms/Tick    1.4 %
```

Der Rest des Ticks ist zu ~17 % der Aufbau des **Ansichtszustands**
(`stateSnapshot.js`), plus `specials.snapshot` (3,5 %), `guentherSystem.snapshot`
(1,4 %) und `cooldownFor` (2,0 %) — alles Teile von `getState()`.

### 1.2 Der Zustandsaufbau ist 44 % des Ticks — und wird doppelt gebaut

`match.step()` endet mit `return this.getState()` (`src/engine/match.js:1152`).
Gemessen:

```
$ node --input-type=module   # MatchController.prototype.getState umwickelt
6000 Ticks, Tick-Mittel 0.1005 ms, Zustandshash ce98bb9b
getState-Aufrufe gesamt            : 12001 (2.00 je Tick)
davon INNERHALB von match.step()   : 6000 (1.00 je Tick)
getState gesamt, Mittel je Aufruf  : 0.04426 ms (max 5.4749 ms)
getState-Anteil am Tick (Mittel)   : 44.0 %
getState-Kosten je Tick            : 0.04426 ms
```

- **Der Server braucht den Rückgabewert nicht:** `src/server/gameServer.js:275–276`
  ruft `this.match.step();` und danach `this.match.getState()` — der Zustand wird
  je Tick **zweimal** gebaut, obwohl der Rückgabewert von `step()` dort verworfen
  wird. Dasselbe gilt in der Tick-Schleife (`:163–164`).
- **Niemand liest den Rückgabewert.** Gezählt über `src/`, `tests/` und `scripts/`:

  ```
  $ grep -rn 'match\.step()' src/ tests/ scripts/ | wc -l
  126
  $ grep -rn '= *[A-Za-z_.]*\.step()' src/ tests/ scripts/ | wc -l
  0
  ```

  **126 Aufruforte, 0 Zuweisungen.** Der Ansichtszustand wird in jedem Tick gebaut
  und an jeder Stelle weggeworfen.
- **Gewinn:** bis zu **0,0443 ms/Tick** (44–48 % des Ticks; 0,27 % des
  16,7-ms-Budgets). Ohne ihn: 0,092 → 0,0477 ms/Tick, rechnerisch 20947 statt
  10870 Ticks/s.
- **Aufwand:** klein (Rückgabe abschaffen oder lazy machen) — **Risiko: klein**,
  aber nicht null: `step()` ist eine öffentliche Schnittstelle. Belegt ist, dass
  im Repo **kein** Aufrufort den Wert liest (126 : 0) — ein künftiger Nutzer
  bekäme statt eines Zustands `undefined`. Wer die Rückgabe behalten will, kann
  sie stattdessen LAZY machen (Zustand erst beim Zugriff bauen).
- **Determinismus:** `getState()` zieht keinen Zufall. Wann er gebaut wird,
  beeinflusst die Simulation nicht → Replay-Hash bleibt gültig (`ce98bb9b`
  unverändert). Die Prüfung gehört trotzdem in den Replay-Beleg.

### 1.3 Der größte SYSTEMPOSTEN ist `loot` (12,2 %), mit Fragezeichen

`LootSystem.update` läuft in **jedem** der 6000 Ticks und kostet 0,01203 ms/Tick —
mehr als Projektile (0,00735, und die nur in 1343 Ticks). Wenn ein Spieler „das
System optimieren" will, ist das die erste Adresse. Aufwand: mittel (Verhalten
prüfen), Risiko: mittel (Loot-Zufall gehört zum Determinismus).

---

## 2. Kandidat: Der Snapshot-Posten

**Messung:** `npm run measure:network` (Ausgabe in 0.2). Aufteilung bei vier
Spielern, wörtlich:

```
Kopf              25 B   (11 %)
Spieler           60 B   (28 %)
Projektile        83 B   (38 %)
Kisten            40 B   (18 %)
Geschütze          4 B   (2 %)
Günther            6 B   (3 %)
Summe             217 B   (gegen Mittel 217 B — Abweichung -0.0 B)
```

Bei acht Spielern sind die Spielereinträge 120 B von 230 B — **52 %**.
Bei vierzig Figuren (Kriegsmodus, `8 × 5`; die Budgetprüfung fordert diese Zahl)
sind es `40 × PLAYER_STRIDE = 40 × 15 = 600 B` von gemessenen 639 B = **93,9 %**.

**Was ist schon dicht:** Das Delta spart nachweislich **0 B** (Nachrichtengröße
ist `HEADER + n × STRIDE`, feste Puffergröße; nur das `dirty`-Byte unterscheidet
sich, und das liest der Client nicht). Der Vorschlag „Delta-Snapshots" aus der
Skalierungsplanung ist damit ein Nullgewinn und darf nicht wieder auftauchen.

**Was wäre zu holen:** `waterLevel` und `frozenTurns` nur bei Bedarf senden. Diese
Felder stehen im 15-B-Stride der Figur, kosten also 2 von 15 B je Figur
(gerundet; das genaue Feldlayout müsste vor einer Zusage geprüft werden).
Rechnung bei vierzig Figuren: −80 B von 639 B = **−12,5 %** auf dem Snapshot,
in Bytes/s: 12,48 → 10,9 kB/s (**−1,6 kB/s je Client**). Dafür braucht das
Drahtformat eine variable Länge je Spieler — mehr Fehlerquellen, mehr Decoderpfad.
**Aufwand: groß, Risiko: hoch (Drahtformat + Protokollversion), und der Gewinn
liegt unter dem, was der Ereigniskanal (Abschnitt 3) heute ungenutzt wegwirft.**

**Wichtig für die Bewertung:** Der Snapshot hat ein BUDGET und hält es.
`tests/snapshot-size.test.js:120–162` prüft (Seed 42, 600 Schritte, 20 Hz, MIT
Günther-Block):

```
12 Figuren  → 225 B →  4,1 kB/s   (Budget 320 B / 6)
40 Figuren  → 645 B → 12,3 kB/s   (Budget 700 B / 14)
```

Meine Nachmessung derselben Größenordnung (Seed 4711, 1800 Ticks, Karte `flooded`,
Stichprobe jeder 3. Tick, `encodeSnapshot(state, {turnRemainingMs:0})`):

```
40 Figuren (Krieg max) (teams=8, playersPerTeam=5), preset flooded, 1800 Ticks
  Figuren im Zustand: 40
  Snapshot (Stichprobe): 639 B → 12.48 KB/s je Client
8 Figuren (teams=4, playersPerTeam=2), preset flooded, 1800 Ticks
  Snapshot (Stichprobe): 159 B → 3.11 KB/s je Client
```

Bei vierzig Figuren ist der Snapshot also bei **12,48 von 14 kB/s = 89 % des
Budgets**. Sparen wäre dort begründbar — nur ist der Snapshot nicht mehr der
größte Posten der Leitung. Siehe Abschnitt 3.

---

## 3. Kandidat: Der EREIGNISKANAL (Steuernachrichten) — der größte Fund

`src/server/gameServer.js:246–248` schickt **jedes** Engine-Ereignis als eigene
JSON-Nachricht an alle Clients, ungefiltert:

```js
for (const event of this.match.consumeEvents()) {
  this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
}
```

`controlMessage()` (`src/shared/protocol.js:549`) macht daraus
`JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload })`. Der Ereigniskanal
hat **kein Budget und keinen Wächter** — im Gegensatz zum Snapshot (Abschnitt 2).

### 3.1 Zählung aller Ereignisarten (4 Figuren, Karte hills, 100 s)

**Befehl:**

```js
import { MatchController } from "./src/engine/match.js";
import { controlMessage } from "./src/shared/protocol.js";
// 6000 Ticks, 2 Teams x 2, hills, Seed 20260910, Schüsse wie in perf-profile.mjs;
// je Ereignis: controlMessage(ev.type, { round, ...ev.payload }) und Buffer.byteLength
```

**Ausgabe (wörtlich, gekürzt auf die Kopfzeilen):**

```
EREIGNISZAEHLUNG — 6000 Ticks (= 100.0 s bei 60 Hz), 26 Schuesse, 1 Match(es), 4 Figuren

Ereignisart              Anzahl   je s    Bytes/Stk   KB/10s   Anteil
landed                     3428    34.3         43    143.9   100.0 %
projectile_spawn             25     0.3        166      4.1     2.7 %
explosion                    25     0.3        155      3.8     2.5 %
shot                         26     0.3        125      3.2     2.0 %
terrain_destroyed            25     0.3         98      2.4     1.5 %
projectile_impact            21     0.2        113      2.3     1.5 %
turn_start                   29     0.3         61      1.7     1.1 %
turn_end                     28     0.3         54      1.5     0.9 %
round_crates                  8     0.1         64      0.5     0.3 %
weapon_cooldown               6     0.1         82      0.5     0.3 %
projectile_expired            4     0.0        101      0.4     0.2 %
round_start                   7     0.1         50      0.3     0.2 %
turret_deployed               2     0.0        128      0.2     0.2 %
special_effect                2     0.0        128      0.2     0.2 %
crate_pickup                  2     0.0        108      0.2     0.1 %
damage                        1     0.0        149      0.1     0.1 %
turret_fired                  1     0.0        133      0.1     0.1 %
pulled                        1     0.0         82      0.1     0.0 %
maelstrom_contract            1     0.0         69      0.1     0.0 %
heal                          1     0.0         52      0.1     0.0 %
toxic_rain                    1     0.0         48      0.0     0.0 %
GESAMT                     3644    36.4         47    165.8
Steuernachrichten je Sekunde (alle Empfaenger einzeln) : 36
Steuerlast je 10 s                                     : 165.8 KB  = 1.66 KB/s
Snapshot-Verkehr (2000 Snapshots, 20 Hz)   : Mittel 139 B je Snapshot = 2.72 KB/s je Client
```

(Die Spalte „KB/10s" meines Einmal-Skripts ist die **Summe über den ganzen
100-s-Lauf**: 165,8 KB / 100 s = **1,66 KB/s**. Die Spalte „Anteil" ist im Lauf
falsch — sie teilt durch eine LAUFENDE Summe, deshalb steht bei der ersten Zeile
100,0 %. Maßgeblich ist die Spalte „KB"; die Anteile unten sind nachgerechnet:
143,9 / 165,8 = 86,8 %.)

**Ergebnis:** `landed` allein macht **143,9 von 165,8 KB = 86,8 %** der
Steuerlast aus. Ohne `landed` blieben 0,22 KB/s.

### 3.2 Die Zahl des Auftraggebers ist reproduziert

Er nannte 344 `landed`-Nachrichten in 600 Ticks bei vier Figuren. Mein Lauf —
**ohne einen einzigen Schuss**:

```
OHNE Schuss: 344 landed-Ereignisse in 600 Ticks (34.4/s) bei 4 Figuren
  = 0.57 Landungen je Tick (4 Figuren), erste: Tick 4 Spieler 1 | Tick 4 Spieler 2 |
    Tick 4 Spieler 3 | Tick 4 Spieler 4 | Tick 10 Spieler 1 | Tick 10 Spieler 2
  Endpositionen: #1@512.00,788.20 #2@1024.00,883.20 #3@1536.00,674.20 #4@2048.00,903.20
```

**Beide Zahlen stimmen.** Die Nachrichtengröße ebenfalls — er nennt 44 B, meine
Messung liefert 43 B bei einstelliger Rundenzahl und 44 B ab Runde 10:

```
  landed  {"v":7,"t":"landed","round":8,"playerId":3}   (43 B)
$ node --input-type=module -e "controlMessage('landed', {round:12, playerId:3})"
  {"v":7,"t":"landed","round":12,"playerId":3}          (44 B)
```

### 3.3 Ursache: eine STEHENDE Figur „landet" alle ~7 Ticks

`landed` wird in `src/engine/match.js:1345–1355` nur beim Übergang
Luft → Boden gemeldet. Genau dieser Übergang flattert, obwohl sich die Figur
nicht bewegt:

```
Boden/Luft-Folge der ersten 40 Ticks:
0:Luft 1:Luft 2:Luft 3:Boden 4:Boden 5:Boden 6:Boden 7:Luft 8:Luft 9:Boden
10:Boden 11:Boden 12:Boden 13:Boden 14:Luft 15:Luft 16:Boden ...
Wechsel des Bodenkontakts in 120 Ticks: 34
Position am Ende: x=512.00 y=784.00 (Figur bewegt sich nicht — kein Schuss, kein Sprung)
Nach 40 Ticks: Spieler-Figur #1 bei x=512.00 y=788.20 vy=1.680
```

Die Figur steht bei x=512, ihre Höhe pendelt zwischen **788,20 und 784,00** —
4 Pixel —, und der Bodenkontakt wechselt **34-mal in 120 Ticks**. Das ist die
Quelle der 344 Nachrichten. Es ist kein Ausreißer und keine Absicht: Es ist ein
Bounce-Artefakt der Physik.

### 3.4 Die drei Flutarten auf einer Wasser-Karte

Dieselbe Zählung, Karte `flooded`, jeweils 1800 Ticks (30 s):

```
PRESET hills: 1800 Ticks (30.0 s)
  Ereignisse gesamt: 1033 (34.4/s), 43.5 KB/10s = 1.45 KB/s
    landed                  1028 (34.3/s)  43 B/Stk  43.2 KB/10s

PRESET flooded: 1800 Ticks (30.0 s)
  Ereignisse gesamt: 3700 (123.3/s), 308.9 KB/10s = 10.30 KB/s
    entity_in_water         1060 (35.3/s)  62 B/Stk  64.2 KB/10s
    damage                  1060 (35.3/s) 160 B/Stk 165.9 KB/10s
    drowning                1060 (35.3/s)  55 B/Stk  56.9 KB/10s
    landed                   514 (17.1/s)  43 B/Stk  21.6 KB/10s
```

(Wieder gilt: die KB-Spalte ist die Summe über den 30-s-Lauf; 308,9 KB / 30 s =
**10,30 KB/s**.)

Beispielnachrichten wörtlich:

```
entity_in_water   {"v":7,"t":"entity_in_water","round":1,"entityId":3,"level":1}   (62 B)
damage            {"v":7,"t":"damage","round":1,"entityId":3,"attackerId":null,"amount":0.149994,
                   "absorbedByShield":0,"remaining":62.85,"damageType":0,
                   "damageTypeName":"physical"}   (161 B)
drowning          {"v":7,"t":"drowning","round":1,"entityId":3,"level":1}   (55 B)
```

### 3.5 Der Höchstfall: 40 Figuren — der Ereigniskanal ist 7,6× der Snapshot

```
40 Figuren (Krieg max) (teams=8, playersPerTeam=5), preset flooded, 1800 Ticks (30.0 s)
  Figuren im Zustand: 40
  Steuernachrichten: 34418 (1147.3/s), 94.65 KB/s je Client
  Snapshot (Stichprobe): 639 B → 12.48 KB/s je Client
    damage                9410  161 B  49.41 KB/s
    entity_in_water       9410   63 B  19.30 KB/s
    drowning              9410   56 B  17.15 KB/s
    landed                6168   44 B   8.76 KB/s
    death                   16   43 B   0.02 KB/s
```

**Rechnung, geprüft:**
- Kontrolle **94,65 KB/s** gegen Snapshot **12,48 KB/s** → Faktor **7,58**.
- Kontrollkanal allein = **676 %** des Snapshot-Budgets von 14 kB/s, das der
  Snapshot mit 12,48 kB/s zu 89 % ausfüllt. Der gewachsene Posten ist damit nicht
  mehr der Snapshot.
- Absolut: **96 922 B/s je Client** — für vierzig Figuren auf einer Wasser-Karte
  und **1147 JSON-Nachrichten je Sekunde**.
- Bei vier Figuren auf `flooded`: 10,30 KB/s gegen den Snapshot-Bezugswert
  4,24 KB/s aus `measure:network` (4 Spieler) = **+143 %**; gegen den
  Snapshot-Stichprobenwert DERSELBEN Partie (3,11 KB/s) sogar **+231 %**.

### 3.6 Welche Arten der Online-Client überhaupt liest

Die **einzige** Zuordnungstabelle ist `src/client/ereignisse.js`
(`EREIGNIS_WIRKUNGEN`); `verarbeiteOnline()` schlägt dort nach
(`ereignisse.js:617–619`). Wer keinen `online`-Zweig hat, wird geparst und
verworfen. Gemessen an dieser Tabelle, für die Flutarten:

| Ereignisart | Zweig lokal | Zweig online | gemessen |
|---|---|---|---|
| `landed` | ja (HUD-Zeile) | **nein** | 3428 / 100 s |
| `jumped` | ja | **nein** | 0 in diesen Läufen |
| `crate_landed` | ja | **nein** | 0 |
| `crate_pickup` | ja | **nein** | 2 / 100 s |
| `fall_damage` | ja | **nein** | 0 |
| `toxic_rain` | ja | **nein** | 1 / 100 s |
| `drowning` | **nein** (bewusst leer, `drowning: {}`) | **nein** | 1060 / 30 s (flooded) |
| `entity_in_water` | **kein Eintrag** | **kein Eintrag** | 1060 / 30 s |
| `damage` | **kein Eintrag** | **kein Eintrag** | 1060 / 30 s (4 Fig.) / 9410 (40 Fig.) |
| `turn_end`, `round_crates`, `weapon_cooldown`, `projectile_expired` | **kein Eintrag** | **kein Eintrag** | 28 / 8 / 6 / 4 je 100 s |

Der Kommentar bei `drowning: {}` (`ereignisse.js:499–509`) begründet, warum der
CLIENT nichts tut — „bis zu 60 Meldungen je Sekunde, die das Protokoll
überschwemmen". Genau das passiert auf der Leitung trotzdem, weil der SERVER
ungefiltert sendet. Bei `damage`, `entity_in_water` und `landed` ist es derselbe
Mechanismus.

### 3.7 Die zwei möglichen Fixes

**(a) Online-Zweig ergänzen — ABLEHNEN.** `landed` würde dann im Online-HUD
protokolliert. Bei gemessenen **34,3 Ereignissen/s** (40 Figuren auf Wasser:
`landed` allein 8,76 KB/s ⇒ über 200/s) entstünde eine Log-Flut, die das
Protokollfenster leerräumt. Der fehlende Zweig ist hier kein Versehen, sondern
das kleinere Übel — ein Fix, der 34 Logzeilen je Sekunde erzeugt, ist schlechter
als das Problem.

**(b) Sende-Filter im Server — EMPFEHLUNG.** In `gameServer.js` nur die
Ereignisarten senden, für die es einen `online`-Zweig gibt (bzw. eine kurze
Negativliste der reinen Lokalarten). Gemessene Ersparnis:

Gerechnet aus den gemessenen Tabellen: behalten wird, was einen `online`-Zweig hat
(`projectile_spawn`, `explosion`, `shot`, `terrain_destroyed`, `projectile_impact`,
`turn_start`, `round_start`, `death`, `special_effect`, …), entfernt wird der Rest.

| Fall | vorher | nachher | Ersparnis |
|---|---|---|---|
| 4 Figuren, hills (100 s) | 1,66 KB/s | 0,19 KB/s | **−1,47 KB/s (−88,7 %)** |
| 4 Figuren, flooded (30 s) | 10,30 KB/s | ~0,01 KB/s | **−10,29 KB/s (−99,9 %)** |
| 40 Figuren, flooded (30 s) | **94,65 KB/s** | 0,02 KB/s | **−94,62 KB/s (−99,97 %)** |

(`landed` 143,9 + `turn_end` 1,5 + `round_crates` 0,5 + `weapon_cooldown` 0,5 +
`projectile_expired` 0,4 + `crate_pickup` 0,2 + `damage` 0,1 = 147,1 von 165,8 KB
im hills-Lauf.)

- **Aufwand: klein.** Eine Whitelist/`Set` im Sendeaugenblick, eine Datei, wenige
  Zeilen. Der Entwurf sollte die Tabelle aus `client/ereignisse.js` als Wahrheit
  benutzen (Ereignisarten mit `online`-Zweig), damit die Liste nicht ein zweites
  Mal gepflegt wird — sonst wächst hier eine Doppelregel.
- **Risiko: klein, aber nicht null.** Es verschwinden nur Nachrichten, die kein
  Client liest. Ein neuer Client, der künftig `landed` online nutzen will, müsste
  den Filter mitziehen. Deshalb gehört ein Test dazu, der für JEDE Ereignisart
  prüft: „hat einen `online`-Zweig ODER wird gefiltert".
- **Braucht es einen Versionssprung?** Nein: Es fallen nur Nachrichten weg, die
  die Gegenstelle nachweislich ignoriert; kein Client liest sie, ein alter Client
  liest sie ebenso wenig. Die Protokollversion beschreibt das Drahtformat, das
  sich nicht ändert.
- **Determinismus: NICHT berührt.** Der Filter sitzt NACH `consumeEvents()` im
  Server — die Engine emittiert unverändert, die Ereignis-Warteschlange wird
  weiterhin geleert, der Zufallsstrom und die Tick-Reihenfolge sind unangetastet.
  Replays und Zustandshashes bleiben gültig. Das ist der entscheidende
  Unterschied zu einem Eingriff in die Physik (siehe (c)).
- **Server-CPU:** klein. Gemessen `0,663 µs je controlMessage`
  (`controlMessage('landed') 200000x: 132.5 ms → 0.663 µs je Nachricht`), bei
  1147 Nachrichten/s also **0,76 ms/s**. Der Gewinn ist die **Leitung und die
  1147 `JSON.parse` je Client und Sekunde**, nicht die Server-CPU.

**(c) Ursache beheben (Bounce der stehenden Figur) — VERBOTEN ohne Auftrag.**
Der Bodenkontakt pendelt in der PHYSIK (`#updateGroundedState` liest
`isGrounded`, das auf `Velocity.y` und dem Terrain prüft). Ein Eingriff dort
ändert Positionen und Tick-Ablauf → **Replays und Zustandshash werden ungültig.**
Das ist die Projektregel, die der Auftrag nennt: Zufallsstrom oder
Tick-Reihenfolge anfassen = Replays brechen. Der Befund gehört gemeldet, die
Reparatur braucht einen ausdrücklichen Auftrag samt neuem Replay-Beleg. Nebenbei:
dieselbe Ursache kostet auch Simulationszeit (Physik + `#updateGroundedState` +
`isGrounded` je Figur und Tick).

---

## 4. Kandidat: Browser-Renderpfad (Bildzeit)

**Heute nicht nachmessbar** — dafür braucht es einen Browser und einen Server,
beides ist in diesem Auftrag ausgeschlossen. Die Zahlen sind deshalb aus den
Dokumenten belegt, mit Fundstelle; die Ableitung habe ich nachgerechnet.

**Fundstellen (wörtlich):**

`docs/testgrenzen.md:32–38`:

> **Die Bildzeit-Prüfung läuft auf der echten GPU — die Flagge war die Ursache.**
> Gemessen mit `--use-gl=angle --use-angle=gl`: `ANGLE (Intel, Mesa Intel HD
> Graphics 3000 (SNB GT2), OpenGL 3.3)`, **13,6 ms je Mio. Pixel** auf der
> 2560×1440-Leinwand (21,3 fps kopflos, 29,3 fps mit Fenster). Ohne die Flags
> schaltet Chrome auf **SwiftShader** um: 48,2 ms je Mio. Pixel, 5,6 fps —
> Faktor 3,5.

`docs/testgrenzen.md:50–53`:

> **Ein Nebenfund zum Produkt:** Der Terrain-Aufbau kostet auf dem CPU-Weg rund
> **2,5–2,7 s für 2560×1440** (0,7 µs je Pixel, linear in der Fläche) und läuft
> EINMAL je Kartenaufbau …

`tests/e2e/profiling.spec.mjs:31–35` (Schwellen, wörtlich):

> eine Bildzeit über 30 ms je Mio. Pixel … (Bezugswert der echten GPU: 12,7 ms —
> Software-Rasterung: 48,2 ms) … ein Terrain-Neuaufbau, der je Pixel mehr als das
> Vierfache des Bezugs braucht (Bezugswert 0,74 µs je Pixel)

**Nachgerechnet** (2560 × 1440 = 3,6864 Mio. Pixel):

| Weg | je Mio. Pixel | je Frame (3,6864 Mpx) | entspricht |
|---|---|---|---|
| echte GPU (ANGLE/Intel HD 3000) | 13,6 ms | **50,1 ms** | 19,9 fps |
| SwiftShader (keine GPU) | 48,2 ms | **177,7 ms** | 5,6 fps |
| Budget 60 Hz | — | 16,7 ms | 60 fps |

**Belastbarkeit:** Die Zahl ist belastbar als **Aufwand je Mio. Pixel** auf DIESER
Maschine — und genau deshalb prüft der Test diese Größe und keine fps-Zahl. Nicht
belastbar ist sie als Absolutwert für andere Rechner. Der E2E-Plan warnt
ausdrücklich: ohne GPU schaltet Chrome auf SwiftShader (Faktor 3,5), und die
Profiling-Specs scheitern dann. Die Bildrate selbst schwankt zudem zwischen
kopflos und mit Fenster (21,3 zu 29,3 fps).

**Das ist der EINZIGE Posten, der das Budget wirklich reißt:** 50,1 ms gegen
16,7 ms = *Faktor 3*. Alles andere in diesem Bericht ist Prozentbruchteile eines
Budgets. Der Rechenweg dagegen existiert bereits (`gpuTerrainPath` /
WebGPU-Pfad, `scripts/browser-perf.mjs` weist `terrainBakeMs` und `path` aus);
die Größe des Gewinns ist ohne GPU-Messung nicht zu beziffern.
**Aufwand: groß, Risiko: hoch (Anzeige), Determinismus: nicht berührt.**

---

## 5. Kandidat: Bundle-Größe

**Gibt es ein Budget oder ein Skript dafür? NEIN.**

```
$ grep -rn -i 'bundle|budget|groesse|gzip' scripts/checks.mjs vite.config.mjs package.json
(keine Ausgabe)
```

`vite.config.mjs` setzt nur `outDir`, `target`, `sourcemap: true` — keine
Größenschranke. Die Gate-Batterie (`scripts/checks.mjs`) prüft Lint, Validate und
Tests, nicht die Bundle-Größe.

**Gemessen am vorhandenen `dist/` (Stand des letzten Builds, 25.09. 07:53 — in
diesem Auftrag NICHT neu gebaut, um nichts zu schreiben):**

```
479258 dist/assets/index-Bb8tJAiJ.js          ← das eine JS-Bundle (roh)
128251                                        ← gzip desselben Bundles
1761554 dist/assets/index-Bb8tJAiJ.js.map     ← mitgelieferte Sourcemap
21M    dist/                                  ← Gesamtgröße (dominiert von JPG-Kulissen)
298796 dist/assets/warren_bamboo_thicket-1HF0BBe7.jpg
290303 dist/assets/warren_ruin_labyrinth-CVBnKlq2.jpg
265960 dist/assets/deluge_drowned_forest-CWjxOJeR.jpg
```

- **Größter Posten im JS:** das eine Bundle — 479.258 B roh, **128.251 B gzip**
  (26,8 %). Ohne Budget ist „zu groß" keine prüfbare Aussage.
- **Auffälliger Nebenposten:** die Sourcemap ist mit **1,76 MB das 3,7-fache des
  Bundles** und liegt im Auslieferungsordner. Für eine Auslieferung wäre
  `sourcemap: false` (oder getrennter Upload) eine Ein-Zeilen-Entscheidung mit
  −1,76 MB — kein Rechenzeit-, sondern ein Auslieferungsgewinn.
- **Der Rest von `dist/` ist Kulisse (JPG).** Dort ist nichts zu optimieren, ohne
  die Bildqualität zu ändern. Der Posten ist außerdem einmalig (Cache), nicht
  je Frame.
- **Gewinn: 0 ms Rechenzeit.** Empfehlung: erst ein Budget/Gate einführen, wenn
  jemand die Größe als Problem benennt — vorher ist es eine Zahl ohne Schwelle.

---

## 6. Kandidat: Kaltstart

**Ein Messskript für „bis das Match startet" gibt es nicht.** Was messbar ist,
ist der Simulationsaufbau — Terrain, Spawn, Erreichbarkeitsprüfung — für
2560×1440 und vier Figuren, über 15 Seeds je Karte:

```
PRESET hills: Match-Aufbau (Konstruktor + start) über 15 Seeds
  Mittel 45.1 ms | min 31.9 | Median 40.7 | max 83.1 ms
  Breite x Hoehe: 2560 x 1440
  Erster step() danach: Mittel 1.208 ms, max 9.162 ms
PRESET flooded: ... Mittel 33.1 ms | min 27.5 | Median 33.2 | max 42.3 ms
  Erster step() danach: Mittel 0.275 ms, max 0.344 ms
PRESET open: ... Mittel 44.2 ms | min 29.5 | Median 44.3 | max 58.2 ms
  Erster step() danach: Mittel 0.351 ms, max 0.549 ms
```

**Ergebnis: 33–45 ms im Mittel (max 83 ms).** Davon ist nichts zu holen, was ein
Mensch bemerken würde. Die 30-Sekunden-Zahl aus dem bekannten Stand ist damit
**nicht reproduzierbar** (Faktor ~667). Was im Browser zusätzlich anfällt und hier
nicht messbar ist: das Terrain-Backen auf dem CPU-Weg (**2,5–2,7 s** laut
`docs/testgrenzen.md:51`, nachgerechnet: 0,74 µs/px × 3,6864 Mpx = 2,73 s), das
Laden der Kulissen und der Vite-Start. Das ist die einzige Startgröße in
Sekundenordnung — und sie ist bereits bekannt und dokumentiert.

**Nicht messbar in diesem Auftrag:** Menü → erstes Bild im Browser (kein Browser,
kein Server). Wenn diese Zahl gebraucht wird, gehört sie als Messung in
`scripts/browser-perf.mjs` (dort läuft schon eine echte Seite über das Menü,
Zeile 109–118 — die Zeit von `page.click('#start-button')` bis
`window.__PA__?.game?.match` existiert im Code, wird aber nicht gestoppt).

---

## 7. Rangliste — was zuerst, mit welcher Zahl

| # | Kandidat | Gewinn (gemessen) | Aufwand | Risiko | Determinismus |
|---|---|---|---|---|---|
| 1 | **Ereignis-Filter im Server** (`gameServer.js:246`) | **−94,62 KB/s je Client** im Höchstfall (−99,97 %); hills −1,47 KB/s | klein | klein (nur ignorierte Nachrichten) | **nicht berührt** (Filter nach `consumeEvents`) |
| 2 | `step()` baut den Zustand umsonst (44–48 % des Ticks; 126 Aufruforte, 0 lesen ihn) | **−0,0443 ms/Tick** (0,27 % des Frames) | klein | klein (öffentliche API, kein Leser) | nicht berührt |
| 3 | `LootSystem.update` je Tick | 0,01203 ms/Tick (12,2 % des Ticks) | mittel | mittel (Loot-RNG) | Vorsicht: RNG im Loot-Pfad |
| 4 | ECS-Query je Tick (neues Array je System) | 0,00881 ms/Tick (8,9 %) | klein | klein | nicht berührt |
| 5 | Bounce der stehenden Figur (Ursache von `landed`) | 34,3 Nachrichten/s + Physikzeit | **gross** | **hoch** | **VERBOTEN ohne Auftrag** — bricht Replays |
| 6 | Snapshot-`Stride` verkleinern | −1,6 kB/s bei 40 Figuren (−12,5 %) | gross | hoch (Drahtformat) | nicht berührt, aber Protokoll |
| 7 | Sourcemap nicht ausliefern | −1,76 MB Auslieferung | klein | keins | nicht berührt |
| 8 | Terrain-Backen / Renderpfad | 50,1 ms je Frame gegen 16,7 ms Budget (Faktor 3) | gross | hoch (Anzeige) | nicht berührt |

**Die eine Zahl, die alles einordnet:** Der ganze Simulations-Tick kostet
**0,092 ms von 16,7 ms — 0,55 %**. Selbst wenn man ihn komplett auf null brächte,
wäre der Frame 0,55 % kürzer. Von den acht Posten sind sechs im Bereich von
Prozentbruchteilen. **Der einzige Posten, der ein Budget reißt, ist die Anzeige
(50,1 ms/Frame); der einzige Posten, der eine Leitung reißt, ist der ungefilterte
Ereigniskanal (94,65 KB/s gegen 14 kB/s Budget).**

---

## 8. Was NICHT zu holen ist

Mit der Messung, die es belegt.

1. **Tick-Budget: nichts.** `npm run perf` → Mittel **0,092 ms**, **0 Ticks über
   16,7 ms** (0 %), 18000 Ticks, p99 0,3805 ms. Kein System und kein Zustandsposten
   kommt in die Nähe des Budgets. Der teuerste Einzelposten des Ticks ist mit
   0,0443 ms beziffert — 0,27 % des Frames.
2. **Snapshot-Kompression durch das Delta: exakt 0 B.** `npm run measure:network`
   → „Voll 217 B / Delta 217 B" bei vier Spielern, für alle vier Konfigurationen
   identisch; die Größe ist fest (`HEADER_SIZE + n × STRIDE`). Der Client liest
   das `dirty`-Byte nicht. **Dieser Vorschlag darf nicht wiederkehren.**
3. **Der Snapshot-Verkehr selbst: kein Engpass.** 217 B (4 Spieler), 303 B Spitze
   (8 Spieler), 47 KB/s für acht Spieler; „Ein 100-Mbit-Anschluss trägt damit 264
   solcher Matches gleichzeitig — im Spitzenfall." Auch der Höchstfall von 40
   Figuren bleibt mit 12,48 kB/s unter seinem Budget von 14 kB/s.
4. **Der Günther-Block: +7 B je Snapshot — kein Optimierungsfeld.** Er ist der
   einzige heute gemessene Zuwachs (Protokoll v7: 1 B im Kopf + `GUENTHER_STRIDE`
   6 B, belegt in `tests/snapshot-size.test.js:135–140`). Bei 20 Hz sind das
   **140 B/s je Client = rund 1 % des Snapshot-Budgets (14 kB/s)**, und die
   Budgets halten trotzdem (12 Figuren 225/320 B, 40 Figuren 645/700 B). Am Tick
   kostet Günther 0,00094 ms (**0,95 %**). Ein Rückbau wäre Arbeit an der
   Protokollversion für 1 % eines Budgets, das eingehalten wird.
5. **Tote Dateien und unbenutzte Konstanten: 0.** Laut `audit_deadcode`; kein
   Optimierungsfeld (nicht nachgemessen, da statische Aussage).
6. **Kaltstart: nichts.** Gemessen **33–45 ms** (max 83 ms) für Aufbau + Start
   einer 2560×1440-Karte. Die „~30 s" sind nicht belegbar und mit hoher
   Wahrscheinlichkeit der Zugtimer (30 s) aus `docs/audit-userflow.md`.
7. **Bundle-Größe: keine Schwelle vorhanden — also nichts zu reißen.** 479.258 B
   roh / **128.251 B gzip**, kein Budget, kein Gate. Ein Budget einzuführen wäre
   eine Entscheidung, keine Optimierung. Der einzige konkrete Posten ist die
   mitgelieferte Sourcemap (1,76 MB).
8. **Die Nachrichten-Häufigkeit selbst ist ohne Leitungskosten nicht das
   Problem — die CPU ist es nicht.** `node --input-type=module -e
   "controlMessage('landed', ...) 200000x"` → **0,663 µs je Nachricht**, also
   0,76 ms/s Server-CPU bei 1147 Nachrichten/s. Wer hier CPU sparen will, spart
   nichts. Zu holen sind die **96.922 B/s je Client**.
9. **Bilder/Kulissen: außerhalb der Messung.** 21 MB `dist/`, dominiert von
   JPG-Kulissen; das ist ein Auslieferungs- und Cacheposten, kein Rechen- oder
   Leitungsposten je Frame.

---

## 9. Grenzen dieser Messung

- Alles in Node gemessen, nichts im Browser: Der Renderpfad (Abschnitt 4) ist
  belegt, aber nicht nachgemessen; eine GPU-Zahl ohne GPU wäre eine Erfindung.
- `npm run perf` sagt nichts über den 8.3183-ms-Ausreißer (max) — ob er aus dem
  Terrain-Aufbau oder aus einem Matchwechsel stammt, habe ich nicht zerlegt.
- Der Erste-Tick-Aufschlag (hills: Mittel 1,208 ms, max 9,162 ms) ist gemessen,
  aber nicht erklärt (JIT/Caches sind plausibel, nicht belegt).
- Loot (Abschnitt 1.3) ist als Posten beziffert, nicht analysiert — was in den
  0,01203 ms steckt, ist eine eigene Messung wert.
- Die Ereigniszahlen hängen am Preset: `hills` flutet mit `landed`,
  `flooded` mit `damage`/`entity_in_water`/`drowning`. Andere Biome wurden nicht
  durchgezählt (nur `hills`, `flooded`, `open` beim Kaltstart).
