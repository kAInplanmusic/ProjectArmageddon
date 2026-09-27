# Der Sendefilter für den Ereigniskanal

**Auftrag (Worker D):** Die Ereignis-Flut im Server dämpfen — als SENDEFILTER
hinter `consumeEvents()`, determinismusneutral, mit Vorher/Nachher-Messung.

**Ergebnis in einem Satz:** Der Server drosselt jetzt Wiederholungen der
Bodenkontakt-Meldungen je Art und Figur (30 Takte = 0,5 s Fenster); bei vier
Figuren auf `hills` sinkt der Ereigniskanal von **1,66 KB/s auf 0,51 KB/s je
Client** (−69,4 %), bei 40 Figuren von **14,89 auf 3,17 KB/s** (−78,7 %) — und
**kein einziges zustandstragendes Ereignis** ist dabei verloren gegangen
(Zeichen für Zeichen verglichen).

---

## 1. Der Befund (bestätigt, nicht übernommen)

Der Server schickte in `src/server/gameServer.js` **jedes** Motorereignis als
eigene JSON-Nachricht an alle Clients:

```js
for (const event of this.match.consumeEvents()) {
  this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
}
```

Die Zahl aus `docs/optimierung-bericht.md` ist **reproduziert**: 3428
`landed`-Nachrichten in 100 s bei vier Figuren auf `hills` (34,3/s) — hier LAUF 1
und LAUF 2, beide mit exakt dieser Zahl. Was der Bericht „Kopfstand" nennt, ist
kein Spielgeschehen, sondern ein Bounce-Artefakt einer **stehenden** Figur.

## 2. Die Ursache (gemessen, in Takten)

```
URSACHE UND FENSTERLAENGE
  landed in 120 Takten je Figur: #1: 17, #2: 17, #3: 17, #4: 17
  Figur #1: 17 Landungen, Abstand in Takten: 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7
  -> Wiederholung alle 6.9 Takte (Median 7)
```

Eine Figur, die sich **nicht bewegt**, meldet alle 7 Takte eine Landung: Der
Bodenkontakt pendelt. Alle 17 Meldungen je 120 Takte sind dieselbe Landung.

Und die Gegenprobe — wie lange dauert ein **echter** Flug?

```
FLUGDAUER EINES SPRUNGS (Obergrenze fuer das Drosselfenster)
  hills   : Sprung angenommen=true — 'landed' nach 50 Takten (0.83 s)
  flooded : Sprung angenommen=true — 'landed' nach 50 Takten (0.83 s)
```

Damit liegen beide Grenzen des Fensters fest: Die Störung wiederholt sich alle
**7** Takte, der kürzeste echte Vorgang derselben Art dauert **50** Takte.

## 3. Messung VORHER — je Ereignisart

**Befehl:** `node /tmp/ereignis-messung.mjs` (Quelltext in Abschnitt 10,
vollständige Ausgabe in `/tmp/ereignis-messung.txt`). Gerechnet wird mit der
tatsächlich simulierten Zeit; ein Match, das vorher endet (Ertrinken), wird mit
seiner echten Dauer ausgewiesen.

### LAUF 1: 4 Figuren, `hills`, 100 s (mit Schusslast wie `perf-profile.mjs`)

```
  Konfiguration: seed=20260910 teams=2 playersPerTeam=2 preset=hills Schuesse=26
  6000 Takte = 100.0 s (Zielvorgabe 100 s), 4 Figuren im Zustand, 8 Runden, Zustandshash ea2791d8

Arten                    Anzahl   /s    Bytes/Stk  KB ges    KB/s     gesendet  unterdr.
landed                     3428  34.3        43    143.9     1.44       688      2740
projectile_spawn             25   0.3   153-171      4.1     0.04        25         0
explosion                    25   0.3   142-161      3.8     0.04        25         0
shot                         26   0.3   125-126      3.2     0.03        26         0
terrain_destroyed            25   0.3    96-101      2.4     0.02        25         0
projectile_impact            21   0.2   111-116      2.3     0.02        21         0
turn_start                   29   0.3     61-62      1.7     0.02        29         0
turn_end                     28   0.3        54      1.5     0.01        28         0
round_crates                  8   0.1     64-65      0.5     0.01         8         0
weapon_cooldown               6   0.1        82      0.5     0.00         6         0
projectile_expired            4   0.0   101-102      0.4     0.00         4         0
round_start                   7   0.1     49-50      0.3     0.00         7         0
turret_deployed               2   0.0   127-128      0.2     0.00         2         0
special_effect                2   0.0   127-128      0.2     0.00         2         0
crate_pickup                  2   0.0   102-113      0.2     0.00         2         0
damage                        1   0.0       149      0.1     0.00         1         0
turret_fired                  1   0.0       133      0.1     0.00         1         0
pulled                        1   0.0        82      0.1     0.00         1         0
maelstrom_contract            1   0.0        69      0.1     0.00         1         0
heal                          1   0.0        52      0.1     0.00         1         0
toxic_rain                    1   0.0        48      0.0     0.00         1         0
```

**`landed` allein sind 143,9 von 165,8 KB = 86,8 % der Steuerlast.** Ohne
`landed` bliebe 0,22 KB/s.

### Die weiteren Läufe (Kopfzahlen wörtlich)

| Lauf | Konfiguration | VORHER | NACHHER | Ersparnis |
|---|---|---|---|---|
| 1 | 4 Figuren `hills`, 100 s, 26 Schüsse | 36,4/s = **1,66 KB/s** | 9,0/s = **0,51 KB/s** | **69,38 %** |
| 2 | 4 Figuren `hills`, 100 s, OHNE Schuss | 34,4/s = **1,44 KB/s** | 7,0/s = **0,29 KB/s** | **79,68 %** |
| 3 | 4 Figuren `flooded`, 11,7 s (Match endete durch Ertrinken) | 520,0/s = **46,60 KB/s** | 513,2/s = **46,31 KB/s** | 0,61 % |
| 4 | 40 Figuren (8×5) `flooded`, 100 s | 583,6/s = **47,66 KB/s** | 492,4/s = **43,77 KB/s** | 8,16 % |
| 5 | 40 Figuren (8×5) `hills`, 100 s | 345,0/s = **14,89 KB/s** | 71,0/s = **3,17 KB/s** | **78,68 %** |

Alle Angaben **je Client** (der Server sendet an jeden Empfänger einzeln; die
Egress-Summe ist das Vielfache der Empfängerzahl).

Lauf 4 und 5 wörtlich, weil dort der Höchstfall steht:

```
LAUF 4: 40 Figuren (8x5), Karte flooded, 100 s — der Hoechstfall
  6000 Takte = 100.0 s (Zielvorgabe 100 s), 40 Figuren im Zustand, 2 Runden, Zustandshash b86d7259
damage                    15576 155.8   151-170   2452.4    24.52     15576         0
entity_in_water           15569 155.7     62-63    955.7     9.56     15569         0
drowning                  15569 155.7     55-56    849.3     8.49     15569         0
landed                    11415 114.2     43-44    486.3     4.86      2291      9124
  VORHER :  58360 Nachrichten  = 583.6/s  4766.0 KB  = 47.66 KB/s je Client
  NACHHER:  49236 Nachrichten  = 492.4/s  4377.3 KB  = 43.77 KB/s je Client
  Snapshot-Bezug (Delta-Stichprobe, 20 Hz): Mittel 639.1 B = 12.48 KB/s je Client
  Verhaeltnis Ereigniskanal/Snapshot: VORHER 3.82x  NACHHER 3.51x
```

```
LAUF 5: 40 Figuren (8x5), Karte hills, 100 s
landed                    34283 342.8     43-44   1465.6    14.66      6880     27403
  VORHER :  34502 Nachrichten  = 345.0/s  1488.9 KB  = 14.89 KB/s je Client
  NACHHER:   7099 Nachrichten  = 71.0/s  317.5 KB  = 3.17 KB/s je Client
  Ersparnis: 78.68 % der Steuerlast (11.71 KB/s je Client)
  Snapshot-Bezug (Delta-Stichprobe, 20 Hz): Mittel 632.4 B = 12.35 KB/s je Client
  HUD-Protokoll (60 Zeilen, nur landed-Zeilen): VORHER alle 0.2 s voll, NACHHER alle 0.9 s
```

**Wichtige Einschränkung, ehrlich benannt:** Die Raten auf Wasser-Karten sind
**phasenabhängig**. Dieselbe Konfiguration (40 Figuren, `flooded`) gemessen über
30 s statt 100 s (`node /tmp/ereignis-gegenprobe.mjs`):

```
teams=8 playersPerTeam=5 preset=flooded -> 1800 Takte = 30.0 s, 40 Figuren
  Steuernachrichten 48905 = 1630.2/s, 142.65 KB/s je Client
    damage                15092   503.1/s   79.17 KB/s
    entity_in_water       15092   503.1/s   30.88 KB/s
    drowning              15092   503.1/s   27.44 KB/s
    landed                 3598   119.9/s    5.11 KB/s
teams=8 playersPerTeam=5 preset=flooded -> 6000 Takte = 100.0 s, 40 Figuren
  Steuernachrichten 57309 = 573.1/s, 46.38 KB/s je Client
```

Es sind **dieselben 15092 Wassermeldungen je Art** — nur über 30 s statt 100 s
verteilt, weil die Figuren danach ertrunken sind. Die 94,65 KB/s des älteren
Berichts und die 46,38 KB/s hier sind deshalb beide echt; sie messen
unterschiedliche Fenster. Für den Vorher/Nachher-Vergleich zählt, dass beide
Seiten aus **demselben** Lauf stammen.

## 4. Klassifikation: Anzeige oder Zustand

Die Einteilung steht als Code in `src/shared/protocol.js`
(`ANZEIGE_EREIGNISARTEN` / `ZUSTANDSEREIGNISARTEN`) — sie ist die Grundlage des
Filters und wird von einem Test gegen die tatsächlich emittierten Arten geprüft.
**Zustand** heißt: Der Client erfährt hier etwas, was im Snapshot **nicht**
steht. **Anzeige** heißt: Blitz, Klang, Protokollzeile — die Zahlen dazu liefert
der Snapshot ohnehin (Positionen, Wasserstand, Projektile).

| Ereignisart | Klasse | Begründung |
|---|---|---|
| `damage` | **Zustand** | Schadenshöhe und Restleben; nur diese Nachricht nennt die Zahl |
| `drowning` | **Zustand** | Ertrinkenszustand je Figur (Auflage des Auftrags) |
| `entity_in_water` | **Zustand** | Wasserstand/Level je Figur (Auflage des Auftrags) |
| `turn_start` | **Zustand** | Zugwechsel — der Client setzt daraus seinen Spielstatus |
| `terrain_destroyed` | **Zustand** | Der Krater; ohne ihn zeichnet der Client die alte Wand |
| `projectile_spawn` | **Zustand** | Ein neues Projektil samt Art/Reichweite |
| `death` | Zustand | Ausscheiden einer Figur (Rundenlogik) |
| `match_over` | Zustand | Sieger und Ende |
| `round_start`, `round_crates`, `turn_end`, `turn_skipped` | Zustand | Runden-/Zugablauf |
| `crate_pickup`, `crate_pickup_blocked` | Zustand | Gefundene Waffe, voller Vorrat |
| `weapon_dropped`, `weapon_cooldown` | Zustand | Waffenbestand und Nachladen |
| `heal`, `shield_absorbed`, `frozen`, `pulled`, `water_pushed` | Zustand | Mengen und Wirkungen an Figuren |
| `dot_applied`, `dot_tick`, `fall_damage`, `toxic_rain` | Zustand | Schaden über Zeit mit Höhe |
| `turret_deployed`, `turret_fired`, `turret_expired` | Zustand | Ein Angreifer, der sonst unsichtbar wäre |
| `shot` | Zustand | Löst die Vorhersage auf (`shotPredictor.resolve`) |
| `karte_unerreichbar`, `loot_error` | Zustand | Meldungen, die der Server dem Menschen zukommen lässt |
| `landed` | **Anzeige** | Nur eine Protokollzeile; die Position steht im Snapshot |
| `jumped` | **Anzeige** | Klang/Protokollzeile; die Flugbahn steht im Snapshot |
| `crate_landed` | **Anzeige** | Die Kiste steht mit Position im Snapshot |
| `projectile_impact`, `projectile_expired`, `projectile_pierced` | Anzeige | Einschlagblitz; das Projektil verschwindet im Snapshot |
| `explosion`, `hitscan`, `special_effect` | Anzeige | Blitz und Klang |
| `fuse_armed`, `fuse_expired` | Anzeige | Zünderblitz/-ton |
| `guenther_wheel`, `guenther_pee`, `guenther_poop`, `guenther_poop_hit` | Anzeige | Günther und seine Haufen stehen im Snapshot (Protokoll v7) |

## 5. Der Filter

**Ort:** `src/shared/protocol.js` (Klasse `EreignisSendefilter`), benutzt in
`src/server/gameServer.js` **hinter** `consumeEvents()`:

```js
const takt = this.match.world.tickCount;
for (const event of this.match.consumeEvents()) {
  if (!this.sendefilter.durchlassen(event.type, event.payload, takt)) {
    if (this.metrics) this.metrics.controlMessagesSuppressed += 1;
    continue;
  }
  if (this.metrics) this.metrics.controlMessagesSent += 1;
  this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
}
```

**Die zwei Regeln:**

1. **Kein Eingriff in die Simulation.** Der Filter läuft ausschließlich hinter
   `consumeEvents()`: Die Ereignisse sind da, die Simulation ist gelaufen, der
   Zufallsstrom ist verbraucht. Er liest und entscheidet — mehr nicht. Unter
   `src/engine/` kommt der Filter in keiner Zeile vor (Test), und zwei identische
   Matches mit und ohne Filter liefern denselben Zustandshash (Test). Replays
   zeichnen **Eingaben** auf, keine Ereignisse (`src/engine/replay.js`) — die
   Wiedergabegleichheit hängt deshalb nicht an dieser Änderung.
2. **Zusammenfassen statt löschen.** Die **erste** Meldung einer Art je Figur
   geht immer raus; weitere derselben Art und Figur erst wieder nach
   `EREIGNIS_DROSSEL_TAKTE` Takten. Es bleibt also sichtbar, **dass** gelandet
   wurde. Zustandsarten und unbekannte Arten laufen ungekürzt durch. Ohne
   Taktangabe wird nicht gedrosselt (eine verlorene Meldung ist schlimmer als
   eine überflüssige).

**Warum 30 Takte (0,5 s) — beide Grenzen gemessen:**

| Grenze | Gemessen | Folge |
|---|---|---|
| Untergrenze: die Störung | Wiederholung alle **7** Takte | 30 ist ~4× so lang → die Flut wird zuverlässig geschluckt |
| Obergrenze: ein echter Vorgang | Sprung bis `landed`: **50** Takte | 30 liegt sicher darunter → eine echte Landung kann nicht verschluckt werden |

Zusätzlich: Ein zweiter **echter** Bodenkontakt derselben Figur ist innerhalb des
Fensters gar nicht möglich — er setzt eine Flugphase voraus, und die ist länger
als das Fenster. Ein Test misst diese Flugdauer und schlägt fehl, wenn jemand die
Sprungphysik so ändert, dass die Fensterlänge nicht mehr passt.

**Eigene Zahlen:** Der Filter zählt je Art `empfangen`, `gesendet` und
`unterdrueckt` (`zahlen()`, `summe()`). Der Server führt sie in
`metrics.controlMessagesSent` / `metrics.controlMessagesSuppressed` (sichtbar in
`GET /healthz`) und schreibt am Match-Ende **eine** Logzeile mit der Bilanz —
sonst bliebe „der Kanal ist ruhiger" eine Behauptung.

## 6. Gegenprobe

### 6.1 Auf der Leitung — derselbe Server, dieselbe Partie, nur die Drossel schaltet um

`node /tmp/ereignis-live.mjs hills 4 2 30` (in-process-Server, echte
WebSocket-Clients; Fenster 1 ohne Drossel, Fenster 2 mit, Fenster 3 als Kontrolle
wieder ohne):

```
Lobby 35d2dd5b, Karte hills, 2 verbundene Menschen (ein Platz je Team), 4 Figuren im Zustand, match.status=playing

FENSTER 1 — OHNE Drossel (VORHER), 30 s, 2 Empfaenger
  Steuernachrichten gesamt (alle Empfaenger): 2068 = 68.9/s Egress = 34.4/s JE EMPFAENGER
  Bytes gesamt: 91.1 KB = 3.0 KB/s Egress = 1.48 KB/s JE EMPFAENGER
    landed                   2056    34.3/s    1.44 KB/s
    lobby_state                 1     0.0/s    0.04 KB/s
    loadouts                    2     0.0/s    0.03 KB/s
    turn_start                  4     0.1/s    0.00 KB/s
    welcome                     1     0.0/s    0.00 KB/s
    round_crates                2     0.0/s    0.00 KB/s
    turn_end                    2     0.0/s    0.00 KB/s
  Zahlen des Filters (je EREIGNIS, nicht je Empfaenger): empfangen=1032 gesendet=1032 unterdrueckt=0
  Unterdrueckt je Art: keine

FENSTER 2 — MIT Drossel (NACHHER), 30 s, 2 Empfaenger
  Steuernachrichten gesamt (alle Empfaenger): 420 = 14.0/s Egress = 7.0/s JE EMPFAENGER
  Bytes gesamt: 17.7 KB = 0.6 KB/s Egress = 0.29 KB/s JE EMPFAENGER
    landed                    416     6.9/s    0.29 KB/s
    turn_start                  2     0.0/s    0.00 KB/s
    turn_end                    2     0.0/s    0.00 KB/s
  Zahlen des Filters (je EREIGNIS, nicht je Empfaenger): empfangen=1034 gesendet=210 unterdrueckt=824
  Unterdrueckt je Art: landed 824

FENSTER 3 — OHNE Drossel (VORHER), 30 s, 2 Empfaenger
  Steuernachrichten gesamt (alle Empfaenger): 2060 = 68.7/s Egress = 34.3/s JE EMPFAENGER
  Bytes gesamt: 86.6 KB = 2.9 KB/s Egress = 1.44 KB/s JE EMPFAENGER
    landed                   2056    34.3/s    1.44 KB/s
  Zahlen des Filters (je EREIGNIS, nicht je Empfaenger): empfangen=1030 gesendet=1030 unterdrueckt=0
  Unterdrueckt je Art: keine

GEGENPROBE JE EMPFAENGER
  VORHER  (Fenster 1): 34.4 Nachrichten/s, 1.48 KB/s
  NACHHER (Fenster 2): 7.0 Nachrichten/s, 0.29 KB/s
  VORHER  (Fenster 3): 34.3 Nachrichten/s, 1.44 KB/s
  Faktor VORHER/NACHHER: Nachrichten 4.92x, Bytes 5.00x
  Ersparnis je Client: 1.18 KB/s (80.01 %)
  landed je Fenster: 2056 | 416 | 2056
  Ueber alle Fenster unterdrueckte Arten: landed
```

Fenster 1 und 3 (beide ohne Drossel) liegen bei 34,4 und 34,3 Nachrichten/s —
die Partie ändert sich also nicht von selbst zwischen den Fenstern. Der
Unterschied zwischen Fenster 1 und 2 ist damit der Drossel zuzuschreiben:
**−80,0 % Bytes je Client, Faktor 5,0**.

### 6.2 Verlustprüfung — kein zustandstragendes Ereignis ging verloren

Für jeden Lauf vergleicht das Messskript die Zustandsereignisse **Zeichen für
Zeichen** (Typ, Nutzlast, Takt) und stellt fest, welche Arten unterdrückt wurden:

```
LAUF 1 (4 Figuren hills, 100 s)
  VERLUSTPRUEFUNG
    Zustandsereignisse VORHER 164, NACHHER 164 — IDENTISCH (Reihenfolge und Inhalt)
    Unterdrueckt wurden ausschliesslich Anzeigearten: JA
    Unterdrueckte Arten: landed 2740
    Befunde: keine
```
```
LAUF 2 (4 Figuren hills, 100 s, ohne Schuss)
    Zustandsereignisse VORHER 8, NACHHER 8 — IDENTISCH (Reihenfolge und Inhalt)
    Unterdrueckt wurden ausschliesslich Anzeigearten: JA
    Unterdrueckte Arten: landed 2740
    Befunde: keine
```
```
LAUF 3 (4 Figuren flooded)
    Zustandsereignisse VORHER 5982, NACHHER 5982 — IDENTISCH (Reihenfolge und Inhalt)
    Unterdrueckt wurden ausschliesslich Anzeigearten: JA
    Unterdrueckte Arten: landed 80
    Befunde: keine
```
```
LAUF 4 (40 Figuren flooded, 100 s)
    Zustandsereignisse VORHER 46893, NACHHER 46893 — IDENTISCH (Reihenfolge und Inhalt)
    Unterdrueckt wurden ausschliesslich Anzeigearten: JA
    Unterdrueckte Arten: landed 9124
    Befunde: keine
```
```
LAUF 5 (40 Figuren hills, 100 s)
    Zustandsereignisse VORHER 167, NACHHER 167 — IDENTISCH (Reihenfolge und Inhalt)
    Unterdrueckt wurden ausschliesslich Anzeigearten: JA
    Unterdrueckte Arten: landed 27403
    Befunde: keine
```

In allen fünf Läufen: **Zustandsereignisse vorher = nachher, in Inhalt und
Reihenfolge identisch.** Unterdrückt wurde ausschließlich `landed`.

Und die Folge für den Menschen am Bildschirm (HUD-Protokoll, 60 Zeilen, nur die
`landed`-Zeilen gezählt):

```
LAUF 1: HUD-Protokoll: VORHER alle 1.8 s voll, NACHHER alle 8.7 s
LAUF 2: HUD-Protokoll: VORHER alle 1.8 s voll, NACHHER alle 8.7 s
LAUF 5: HUD-Protokoll: VORHER alle 0.2 s voll, NACHHER alle 0.9 s
```

Die Servermeldung („In der Luft ist kein erster Sprung möglich"), die vorher nach
1,8 s hinausgespült war, bleibt jetzt ~5× länger stehen.

### 6.3 Betriebsbeleg — Zähler und Bilanzzeile im laufenden Server

`node /tmp/ereignis-betrieb.mjs hills` (echte Sitzung, ausgelieferter Filter,
Match läuft bis zum Ende):

```
{"level":"info","event":"match_over","msg":"Match entschieden","winnerTeamId":1,"rounds":31,"ticks":1080,"reason":"ausscheidung"}
{"level":"info","event":"ereigniskanal","msg":"Sendefilter: Wiederholungen zusammengefasst","empfangen":565,"gesendet":319,"unterdrueckt":246,"anteilUnterdrueckt":43.54,"arten":[{"art":"landed","empfangen":308,"gesendet":62,"unterdrueckt":246}]}

BETRIEBSBELEG
  Match-Status: gameover, 1080 Takte, 2 Figuren
  /healthz metrics: snapshotsSent=570 controlMessagesSent=321 controlMessagesSuppressed=246
  Zahlen des Filters in der Sitzung (je Art):
    landed               empfangen=308 gesendet=62 unterdrueckt=246
    crate_pickup         empfangen=7 gesendet=7 unterdrueckt=0
    heal                 empfangen=3 gesendet=3 unterdrueckt=0
    maelstrom_contract   empfangen=23 gesendet=23 unterdrueckt=0
    match_over           empfangen=1 gesendet=1 unterdrueckt=0
    round_crates         empfangen=30 gesendet=30 unterdrueckt=0
    round_start          empfangen=29 gesendet=29 unterdrueckt=0
    toxic_rain           empfangen=46 gesendet=46 unterdrueckt=0
    turn_end             empfangen=60 gesendet=60 unterdrueckt=0
    turn_start           empfangen=60 gesendet=60 unterdrueckt=0
  Bilanzzeile im Log: JA
```

Drei Dinge belegt diese Ausgabe: Die Betriebszähler des Servers stimmen mit den
Zahlen des Filters überein (`321 = 62+7+3+23+1+30+29+46+60+60`, `246` unterdrückt),
**jede** zustandstragende Art steht auf `unterdrueckt=0`, und die Bilanzzeile
nennt am Match-Ende, woran gespart wurde.

## 7. Der Test

`tests/event-coverage.test.js` (dort steht schon die Ereignis-Abdeckung des
Clients; der Sendefilter ist die Gegenrichtung derselben Frage — was der Server
überhaupt sendet).

```
$ node --test --test-reporter=spec tests/event-coverage.test.js
✔ Der lokale Zweig behandelt den Einschlag eines Projekils (2.06608ms)
✔ Beide Zweige behandeln den Einschlag GLEICH (2.288124ms)
✔ Die Engine sendet den Einschlag wirklich (78.355286ms)
✔ Jedes Engine-Ereignis ist in MINDESTENS einem Zweig behandelt (1299.700047ms)
✔ Die 27 Ereignisse der Audit-Meldung haben einen Zweig — und stehen NICHT in bewusstStumm (0.687391ms)
✔ Ereignisse mit nur EINEM Zweig sind einzeln belegt (1.122703ms)
✔ Der v7-Snapshot trägt Günther — und die Onlinesicht reicht ihn durch (34.070455ms)
✔ Günthers vier Streiche werden ONLINE behandelt — die Wirkung läuft wirklich (0.774072ms)
✔ `crate_pickup_blocked` meldet online den vollen Vorrat — MIT Q-Aufforderung (0.8843ms)
✔ Der Sendefilter drosselt nur reine Anzeige — die Einteilung ist vollständig (4.325759ms)
✔ 34x `landed` derselben Figur in 120 Takten: die erste Meldung geht raus, der Rest wird zusammengefasst (1.27188ms)
✔ `damage` kommt ungekuerzt durch — 34 Meldungen in 120 Takten, 34 auf der Leitung (0.37238ms)
✔ Ein echtes Match verliert kein einziges Zustandsereignis — und alle Anzeigearten bleiben sichtbar (194.471026ms)
✔ Das Drosselfenster ist kürzer als eine echte Flugphase — eine echte Landung kann nicht verschluckt werden (104.436571ms)
✔ Der Sendefilter sitzt hinter consumeEvents — die Simulation sieht ihn nicht (348.40204ms)
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

Was die sechs neuen Tests festhalten:

1. **Einteilung vollständig** — jede von der Engine emittierte Art und jeder
   Schlüssel der Client-Tabelle steht in genau einer der beiden Mengen; die
   gedrosselten Arten sind Teilmenge der Anzeigearten.
2. **34× `landed` derselben Figur in 120 Takten** → höchstens 4 Meldungen, die
   erste ist dabei; eine zweite Figur verliert dadurch nichts.
3. **`damage` ungekürzt** → 34 von 34, nichts unterdrückt.
4. **Echtes Match (1800 Takte hills)** → Zustandsfolge identisch, keine Anzeigeart
   komplett verschwunden, `landed` sinkt auf unter ein Drittel.
5. **Fenster < Flugdauer** → gemessen am laufenden Motor (50 Takte), auf `hills`
   und `flooded`.
6. **Determinismus** → zwei identische Matches mit/ohne Filter liefern denselben
   Zustandshash; unter `src/engine/` kommt der Filter nicht vor; der Server
   wendet ihn nach `consumeEvents()` an.

Nachbarschaftsprüfungen (ungezielte Vollläufe wurden vermieden):

```
$ node --test --test-reporter=spec tests/server-integration.test.js
ℹ tests 9
ℹ pass 9
ℹ fail 0
```
```
$ node --test --test-reporter=spec tests/netcode.test.js tests/replay.test.js
ℹ tests 63
ℹ pass 63
ℹ fail 0
```
```
$ npx eslint src/shared/protocol.js src/server/gameServer.js tests/event-coverage.test.js
(keine Ausgabe)
```

## 8. Was ausdrücklich NICHT geändert wurde

- **Keine Zeile im Simulationspfad.** `src/engine/**`, `src/shared/ballistics.js`,
  die Tick-Reihenfolge und der Zufallsstrom sind unberührt. Der Filter sitzt
  hinter `consumeEvents()` und entscheidet nur über die Leitung.
- **Das Drahtformat der Ereignisse ist unverändert.** Eine `landed`-Nachricht
  sieht aus wie vorher (`{"v":7,"t":"landed","round":8,"playerId":3}` → 43 B);
  es kam kein Feld hinzu, das die Gegenstelle kennen müsste.
- **Kein Eingriff in `scripts/**` oder `tools/**`** (andere Worker).
- **Die Physik bleibt.** Das Bounce-Artefakt (Ursache) ist NICHT repariert —
  das wäre eine Änderung an der Simulation und würde Replays brechen (im
  Optimierungsbericht als „VERBOTEN ohne Auftrag" geführt).
- **Die Wassertypen bleiben ungedrosselt** (Auflage des Auftrags).

## 9. Was offen bleibt — mit Zahl, ohne Handlung

Auf Wasser-Karten bleibt der Kanal der größte Posten, weil die drei
zustandstragenden Arten **je Takt** melden, solange eine Figur unter Wasser ist:

```
40 Figuren flooded (100 s):
  A: Stand der Auslieferung (nur Anzeigearten)
    Ereignisse 57309 -> gesendet 47719 = 477.2/s, 42.29 KB/s je Client
  B: Vorschlag (zusaetzlich damage, drowning, entity_in_water)
    Ereignisse 57309 -> gesendet 3991 = 39.9/s, 2.46 KB/s je Client
```

Dieselbe Drossel auf `damage`, `drowning` und `entity_in_water` brächte
**42,29 → 2,46 KB/s** (−94 %) — aber sie würde die Höhe jedes einzelnen
Schadenswerts und jeden Wasserwechsel verschlucken. Das ist eine Entscheidung
über Spielinformation, nicht über Bandbreite: **nicht ohne Auftrag.** Ein
sauberer Weg wäre nicht die Drossel, sondern eine gebündelte Meldung (Zustand
plus Zeitfenster, letzter Wert mitgesendet) — sie ändert das Drahtformat und
gehört damit in einen eigenen Auftrag.

## 10. Reproduktion

Rohausgaben: `/tmp/ereignis-messung.txt`, `/tmp/ereignis-live2.txt`,
`/tmp/ereignis-variante.txt`, `/tmp/ereignis-gegenprobe.txt`.

```bash
node /tmp/ereignis-messung.mjs              # Läufe 1–5: je Art, VORHER/NACHHER, Verlustprüfung
node /tmp/ereignis-live.mjs hills 4 2 30    # Live-A/B auf der Leitung (90 s)
node /tmp/ereignis-betrieb.mjs hills        # echte Sitzung: Zähler, /healthz, Bilanzzeile
node /tmp/ereignis-variante.mjs             # Was ein zweiter Schritt brächte (nicht getan)
node /tmp/ereignis-gegenprobe.mjs           # Phasenabhängigkeit auf Wasser-Karten
node --test --test-reporter=spec tests/event-coverage.test.js
```

Die Skripte liegen bewusst außerhalb des Repos (der Auftrag lässt nur die
genannten Dateien zu) und importieren den Motor über absolute Pfade. Die
wesentlichen Zeilen stehen in diesem Bericht; die Messung ist damit aus dem Text
heraus nachvollziehbar.

## 11. Dateien

| Datei | Änderung |
|---|---|
| `src/shared/protocol.js` | neu: `ANZEIGE_EREIGNISARTEN`, `ZUSTANDSEREIGNISARTEN`, `GEDROSSELTE_EREIGNISARTEN`, `EREIGNIS_DROSSEL_TAKTE`, `EreignisSendefilter` |
| `src/server/gameServer.js` | Sendefilter je Sitzung; Anwendung hinter `consumeEvents()`; Zähler in `metrics`; Bilanz-Logzeile am Match-Ende |
| `tests/event-coverage.test.js` | sechs neue Tests zum Sendefilter |
| `docs/ereigniskanal-filter.md` | dieser Bericht |

`src/client/ereignisse.js` und `src/client/hud.js` wurden **nicht** angefasst: Die
Anzeige behandelt `landed` bereits in beiden Betriebsarten (O2), und die
60-Zeilen-Grenze des Protokolls ist eine eigene Entscheidung — sie war nur die
Folge des Befunds, nicht seine Ursache.
