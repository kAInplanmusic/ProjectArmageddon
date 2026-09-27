# Die Messgrenze des Balance-Berichts

**Anlass**: „43 Waffen mit 0 Schaden" — eine Zahl, die `npm run balance` über
Monate gemeldet hat und die als Waffendefekt gelesen wurde.

**Befund**: Es ist kein Waffendefekt. Es ist ein Artefakt des Standardlaufs von
`scripts/balance-report.mjs`. Keine einzige Waffe wurde geändert.

---

## 1. Der Befund

### 1.1 Woher die Ein-Distanz-Messung kommt

`messdistanzen(startEntfernung)` endet im Standardpfad so:

```js
if (args.distances ...) return [...];   // --distances=…
if (args.sweep)         return [...];   // --sweep
if (args.distance !== undefined) return [distance];
return [startEntfernung];               // ← Standardpfad: GENAU EINE Distanz
```

Der Standardlauf misst damit **genau eine Entfernung**: die Startentfernung des
Spiels. Sie wird aus einem echten Match abgelesen und beträgt auf der
Vorgabekarte 2560 px **854 px** — das ist die **größte** Entfernung, die im
Spiel vorkommt.

Auf 854 px kann keine Wurf- oder Nahkampfwaffe treffen (die Würfe fliegen
30–75 px). Der Bericht meldete sie deshalb als „ohne Wirkung" — obwohl die
Messung nur eines belegt: *dass die Waffe bis hierher nicht reicht.*

### 1.2 Die wörtliche Messung

Dieselbe Waffe, zwei Antworten — nur die Messdistanz unterscheidet sie:

```
$ node scripts/balance-report.mjs --only=pa_001 --distances=40,90,200,854
  ...
  Ohne jede Wirkung: 0
  (Baseballschläger: 13,1 Schaden, STK 16, beste Entfernung 40 px)

$ node scripts/balance-report.mjs          # Standardlauf, nur 854 px
  ...
  Ohne jede Wirkung: 43
  (Baseballschläger: 0 Schaden | STK - | auf 854 px)
```

### 1.3 Der Befund war im Projekt schon einmal bekannt — eine Stufe tiefer

`scripts/balance-report.mjs` beschreibt im `--sweep`-Zweig genau diese
Fehlerklasse an sich selbst:

> Die erste Stufe war 90 px — für WURFWAFFEN zu grob: Gemessen fliegen sie
> 35–71 px weit. Auf 90 px können sie nicht treffen, und der Bericht meldete sie
> deshalb als „ohne Wirkung", obwohl sie wirken — nur eben näher.

Damals wurde **90 → 40 px** korrigiert. Der Standardpfad hat denselben Fehler
eine Stufe höher nie verloren: Er misst weiter die **weiteste** Entfernung und
sprach dort das Urteil „ohne Wirkung".

### 1.4 Was *nicht* die Ursache ist

`docs/10-balance-tests.md` nennt als Grund: „`terrainDamage` = 0, kein
`projectileSpeed`, oder Zünder > Flugzeit". Nachgemessen trifft nichts davon zu:

| Vermutete Ursache | Messung |
|---|---|
| `terrainDamage` = 0 | betrifft 43 Waffen — aber auch wirksame; kein Zusammenhang |
| kein `projectileSpeed` | **alle** 43 tragen einen `projectileSpeed` (27,2–98) |
| Zünder > Flugzeit | `npm run check:fuses` war **vor** der Änderung grün (11 Zünderwaffen, 0 Verstöße) |

Ein Waffendefekt war also auszuschließen, bevor etwas geändert wurde.

---

## 2. Die Änderung — `scripts/balance-report.mjs`

**Nur die Berichtserstattung. Keine Waffe, kein Waffenwert, kein `weapons.js`.**

### 2.1 Der Ablauf

1. **Erster Durchgang — unverändert.** Gemessen wird wie bisher auf der
   Startentfernung. Alle Zahlen dieses Durchgangs sind identisch mit vorher
   (Schaden am Ziel: 71, Selbstwirkung: 36, Ø 13,8, Median STK 44).
2. **Zweiter Durchgang — nur für die Verdächtigen.** Nachgemessen werden ausschließlich
   die Waffen, die auf der Startentfernung wirkungslos **erscheinen** (43 von 150),
   und nur auf kurzen Entfernungen: **40 / 90 / 200 / 300 / 450 / 650 px**,
   je ein Schuss, vier Winkel.
3. **Die Zuordnung.** Wer dort wirkt, wird als **„wirkt, aber nur bis X px"**
   gemeldet — mit der gemessenen Zahl. Als „ohne jede Wirkung" gilt nur noch, wer
   auf **keiner** Messdistanz etwas bewirkt.

### 2.2 Was am Urteil anders ist

Vorher stand dort eine Behauptung ohne Messgrenze:

```
  Ohne jede Wirkung: 43 | immer blockiert: 0
```

Jetzt nennt das Urteil seine Grenze und stellt die Gegenprobe daneben:

```
  Messgrenze     : gemessen wurde NUR auf 854 px — der größten Entfernung des Spiels
  Ohne Schaden NUR auf dieser Entfernung: 43 Waffen
    davon wirken näher (40 / 90 / 200 / 300 / 450 / 650 px) doch: 43
  Ohne jede Wirkung (auf keiner Messdistanz): 0 | immer blockiert: 0
```

Dazu die Liste, die die Aussage belegt (je Waffe die gemessene Zahl):

```
  Wirkt, aber nur bis X px (auf 854 px kein Schaden, näher schon):
    wirkt bis   40 px |   19.6 Schaden | melee         | projectile  | Baseballschläger
    …
```

Die rohe Reichweiten-Verteilung behauptete „43 Waffen mit Reichweite 0 px". Auch
sie trägt jetzt die Nachmessung ein — mit der rohen Zahl als Gegenprobe:

```
  Reichweite (… MIT Nachmessung):
      40 px :   6 Waffen
      90 px :   5 Waffen
     200 px :   1 Waffen
     300 px :   9 Waffen
     450 px :  12 Waffen
     474 px :   1 Waffen
     644 px :   1 Waffen
     650 px :  10 Waffen
     764 px :   1 Waffen
     854 px : 104 Waffen
    (roh, ohne Nachmessung: 43 Waffen mit Reichweite 0 px)
```

Die Stufe „0 px" ist damit leer — vorher standen dort 43 Waffen. Die Summe
bleibt 150; die rohe Verteilung bleibt daneben stehen, damit beide Zahlen
nachprüfbar sind.

### 2.3 Neue Felder im JSON

| Feld | Bedeutung |
|---|---|
| `messgrenze` | die Gegenprobe als eigene Zahl (s. u.) |
| `zusammenfassung.wirkungslosBeiMessdistanz` | Befund **vor** der zweiten Messung (43) |
| `zusammenfassung.wirktNurNaeher` | davon wirken näher doch (43) |
| `zusammenfassung.unwirksam` | echte Wirkungslosigkeit, über **alle** Messdistanzen (0) |
| `wirktNurNaeher` | Liste der Waffen mit `wirktBis`, höchstem Schaden und der Nachmessung je Entfernung |
| `reichweiteNachMessgrenze` | Reichweiten-Verteilung **mit** der zweiten Messung |
| `konfiguration.nachmessung` | die Stufen und Winkel der zweiten Messung |

`unwirksameIds` bleibt erhalten und führt jetzt nur noch die echten Fälle.

---

## 3. Gegenprobe VORHER / NACHHER

Gemessen auf derselben Maschine, Vorgabekarte `hills`, Standardlauf ohne
Argumente. Die VORHER-Fassung ist `git show HEAD:scripts/balance-report.mjs`.
Die Laufzeit ist ein Richtwert: Auf der Maschine laufen parallel andere Worker,
die Zeiten schwanken um einige Sekunden. Gemessen wurde 1 m 32 s (VORHER) gegen
1 m 55 s (NACHHER).

| | VORHER (`HEAD`) | NACHHER |
|---|---|---|
| Auf der Startentfernung ohne Schaden | **43** | 43 (unverändert, s. u.) |
| davon wirken auf kurzer Entfernung doch | — (nicht gemessen) | **43** |
| **ohne jede Wirkung** | **43** | **0** |
| Waffen, die Schaden am Ziel anrichten | 71 | 71 |
| Selbstwirkende Waffen | 36 | 36 |
| Laufzeit | 1 m 32 s | 1 m 55 s |

Wörtlich, die Urteilszeilen:

```
VORHER  :  Ohne jede Wirkung: 43 | immer blockiert: 0
NACHHER :  Ohne Schaden NUR auf dieser Entfernung: 43 Waffen
           davon wirken näher (40 / 90 / 200 / 300 / 450 / 650 px) doch: 43
           Ohne jede Wirkung (auf keiner Messdistanz): 0 | immer blockiert: 0
```

### 3.1 Die 43 Waffen und ihre gemessene Reichweite

Alle 43 wirken. „X px" ist die größte der nachgemessenen Entfernungen, auf der
die Waffe Schaden angerichtet hat.

| wirkt bis | Schaden | Kategorie | Zustellung | Waffe |
|---:|---:|---|---|---|
| 40 px | 19,6 | melee | projectile | Baseballschläger |
| 40 px | 21,0 | melee | projectile | Hakenklinge |
| 40 px | 14,0 | melee | projectile | Schaufel |
| 40 px | 15,4 | melee | projectile | Tonfa |
| 40 px | 17,5 | melee | projectile | Zwillingskatanas |
| 40 px | 18,9 | melee | projectile | Rapier |
| 90 px | 29,4 | melee | projectile | Morgenstern |
| 90 px | 21,0 | melee | projectile | Eispickel |
| 90 px | 36,4 | melee | projectile | Kettensäge |
| 90 px | 23,8 | melee | projectile | Kampfmesser |
| 90 px | 38,8 | ultimate | projectile | Void-Ritter |
| 200 px | 9,2 | ranged | projectile | Boxhandschuhe |
| 300 px | 23,1 | melee | projectile | Kriegssense |
| 300 px | 20,3 | melee | projectile | Gebogene Klinge |
| 300 px | 11,0 | ranged | projectile | Mittelfinger |
| 300 px | 13,7 | ranged | projectile | Magischer Geschosszauber |
| 300 px | 30,0 | heavy_ranged | projectile | Feuerwerks-Salve |
| 300 px | 21,1 | heavy_ranged | projectile | Schrotflinte |
| 300 px | 51,9 | elemental | projectile | Feuerdämon |
| 300 px | 43,0 | magic | hitscan | Giftpilz |
| 300 px | 30,0 | utility | hitscan | Bohrkanone |
| 450 px | 32,8 | melee | projectile | Feuerfaust |
| 450 px | 21,7 | melee | projectile | Runenschwert |
| 450 px | 25,6 | heavy_ranged | projectile | Raketen-Salve |
| 450 px | 8,1 | heavy_ranged | projectile | Bananengranate |
| 450 px | 59,6 | heavy_ranged | projectile | Scharfschützengewehr |
| 450 px | 94,2 | elemental | projectile | Artilleriegeschütz |
| 450 px | 25,9 | elemental | projectile | Psionischer Tentakel |
| 450 px | 38,0 | magic | hitscan | Traumfänger |
| 450 px | 45,0 | magic | hitscan | Verderbnis-Kelch |
| 450 px | 51,0 | magic | hitscan | Sonnenamulett |
| 450 px | 32,0 | magic | hitscan | Magische Peitsche |
| 450 px | 48,0 | utility | hitscan | Ananasbombe |
| 650 px | 22,4 | melee | projectile | Katana |
| 650 px | 18,9 | heavy_ranged | projectile | Bumerang |
| 650 px | 33,3 | elemental | projectile | Säurekanone |
| 650 px | 46,6 | elemental | projectile | Schwarzes Loch |
| 650 px | 42,0 | magic | hitscan | Wirbelwind-Krieger |
| 650 px | 73,0 | magic | hitscan | Lava-Elixier |
| 650 px | 52,0 | magic | hitscan | Gedankensturm |
| 650 px | 72,0 | utility | hitscan | Feuerwesen |
| 650 px | 55,0 | utility | hitscan | Energiefaust |
| 650 px | 40,0 | tech | hitscan | Magnetkanone |

---

## 4. Zwei Fallen, die beim Bauen auffielen

### 4.1 Eine Leiter nur bis 200 px verschiebt den Fehler nur

Der erste Anlauf maß auf **40 / 90 / 200 px** nach (die im Auftrag genannten
Stufen). Ergebnis: 40 von 43 richtig, **drei blieben falsch angeklagt** — sie
wirken in einem **Band über 200 px**:

| Waffe | Messung |
|---|---|
| `pa_048` Bananengranate | 300 px: 3,2 Schaden · 426 px: 0,9 |
| `pa_055` Scharfschützengewehr | 40 px: 6,8 · 300 px: 24,4 |
| `pa_120` Energiefaust | 300 px: 36,7 · 426/600 px: 55 |

Hätte man es dabei belassen, hieße es statt „ohne Wirkung" künftig „wirkt nur
bis 200 px" — für diese drei ebenso falsch. Erst die Stufen bis **650 px**
decken die tatsächlich genutzten Bänder ab.

### 4.2 Eine gekürzte Winkelliste erzeugt eine neue falsche Anklage

Um Laufzeit zu sparen, wurde die Winkelliste der zweiten Messung auf drei flache
Winkel gekürzt (0 / 0,1 / 0,25). Ergebnis: `pa_055` (Scharfschützengewehr) fiel
wieder als „ohne jede Wirkung" heraus — seine Treffer auf 300 px (24,4 Schaden)
brauchen den **überhöhten** Schuss. Der steilste Winkel des Standardlaufs
(0,45 rad) ist deshalb wieder dabei. **Eine gekürzte Messung darf keine falsche
Anklage erzeugen** — das ist die Grenze, unter die die Laufzeit-Optimierung nicht
gehen darf.

---

## 5. Grenzen der neuen Messung

Ehrlich benannt, weil eine unbenannte Grenze genau der Fehler war, der zu diesem
Befund geführt hat:

1. **„X px" ist keine monoton garantierte Reichweite**, sondern die größte
   *gemessene* Entfernung mit Treffer. Eine Waffe kann auf 40 px treffen, auf
   300 px treffen und dazwischen nicht — die Zahl nennt das Weiteste, nicht die
   lückenlose Spanne.
2. **Die Leiter ist grob** (6 Stufen, 40–650 px). Eine Waffe, die nur in einem
   schmalen Band *zwischen* zwei Stufen wirkt, könnte weiter als wirkungslos
   gelten. `pa_048` (Band 300–426 px) zeigt, wie schmal ein Band sein kann — sie
   wird von der Stufe 300 erfasst, aber das ist Glück, nicht Garantie.
3. **Die zweite Messung ist gröber als die erste** (1 Schuss, 4 Winkel statt
   3 Schüsse, 6 Winkel). Ein Treffer, der einen anderen Winkel bräuchte, wird
   nicht gefunden.
4. **Entfernungen über der Startentfernung werden nicht geprüft.** Eine Waffe,
   die erst jenseits von 854 px wirkt, gilt weiter als wirkungslos.
5. **Die Laufzeit wächst um rund ein Viertel** (1 m 32 s → 1 m 55 s), weil die
   Verdächtigen sechs Entfernungen bekommen. Nachgemessen wird nur, wer auf der
   Startentfernung ohne Schaden bleibt (43 von 150) — ein voller `--sweep` über
   alle 150 Waffen wäre ein Vielfaches (der Sweep braucht Minuten, nicht
   Sekunden).

Wer es genauer braucht, nimmt weiterhin `--sweep` (alle Waffen, alle Stufen);
der Standardlauf ist die schnelle, jetzt aber nicht mehr falsche Fassung.

---

## 6. Nachprüfen

```bash
# Gegenprobe: dieselbe Waffe, zwei Messdistanzen
node scripts/balance-report.mjs --only=pa_001 --distances=40,90,200,854
node scripts/balance-report.mjs --only=pa_001

# Der ganze Bericht mit Messgrenze und Gegenprobe
node scripts/balance-report.mjs

# Dieselben Zahlen als JSON (messgrenze, wirktNurNaeher, reichweiteNachMessgrenze)
node scripts/balance-report.mjs --json

# Unverändert (Waffendaten wurden nicht angefasst):
sha256sum src/shared/config/weapons.js
# 280e8188619f974b789dc277a0bfee18413140910d77142504116c5c82adeb3f

# Zünder-Überprüfung — war schon vorher grün, ist es geblieben
npm run check:fuses
```

---

## 7. Was unberührt blieb

* **Kein Waffenwert geändert.** `src/shared/config/weapons.js` ist
  AUTO-GENERIERT (`npm run weapons:build`) und wurde nicht angefasst — der
  SHA-256 ist unverändert. Auch `project_armageddon_weapons_v1.json` und
  `fuseTime`, `projectileSpeed`, `gravityScale` und `delivery` sind unverändert.
* **Die Reihenfolge der Messung** (Sieger: „beste Entfernung") ist gleich
  geblieben.
* **Der `--sweep`-Zweig** ist unverändert.
* **Die Wächter** in `tests/balance-report.test.js` bleiben erfüllt: Der
  Standardlauf liefert weiterhin genau eine Messdistanz (die Startentfernung),
  und `report.reichweite` deckt weiterhin alle Waffen ab.
