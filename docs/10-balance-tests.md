# 10 Test-Spiele: Balance-Quickcheck

**Ausgeführt**: `npm run balance` (3 Schüsse je Waffe, 150 Waffen)  
**Setup**: Karte `hills`, Startabstand 854 px, Ziel 200 HP

---

## 1. Ø Schaden/Schuss (wirksam): **13.8**

Kein Waffenschlag hat diesen Wert — das ist die **Durchschnittsschwelle**. Jede Waffe, die unter diesem liegt (und nicht blockiert), hat geringe Effizienz.

---

## 2. Median Shots-to-Kill: **44 Schüsse**

Von einer Waffe braucht der Schütze **44 Treffer**, um ein Ziel zu töten. Das ist die **Balance-Blase**: zwischen 30 und 60 ist spielbar.

---

## 3. ~~**43 Waffen blockieren von selbst** (0 Schaden)~~ — **WIDERLEGT**

> **Korrektur 2026-09-27.** Dieser Punkt war **falsch**, und zwar vollständig.
> Die 43 Waffen wirken — nur nicht auf 854 px. Ursache war ein **Messartefakt
> des Standardlaufs** von `scripts/balance-report.mjs`: der Pfad endete mit
> `return [startEntfernung]` und maß damit **genau eine** Entfernung, die
> größte des Spiels. Wurf- und Nahkampfwaffen reichen 30–75 px und wurden
> daraus als „ohne Wirkung" geschlossen.
>
> **Nachgemessen** (eigene Messung, `npm run balance` nach dem Werkzeug-Fix):
> ```
> Messgrenze: gemessen wurde NUR auf 854 px — der größten Entfernung des Spiels
> Ohne Schaden NUR auf dieser Entfernung: 43 Waffen
>   davon wirken näher (40 / 90 / 200 / 300 / 450 / 650 px) doch: 43
> Ohne jede Wirkung (auf keiner Messdistanz): 0 | immer blockiert: 0
> ```
> **Alle 43 wirken.** Beispiele: Baseballschläger 19,6 Schaden bis 40 px,
> Kettensäge 36,4 bis 90 px, Void-Ritter 38,8 bis 90 px, Boxhandschuhe 9,2 bis
> 200 px. Der erste Durchgang blieb unverändert (71 Waffen mit Schaden, 36
> selbstwirksam, Ø 13,8, Median STK 44) — die Korrektur ist rein additiv.
>
> **Der hier genannte Grund war ebenfalls falsch.** Gemessen:
> `npm run check:fuses` → 11 Zünderwaffen, **0 Verstöße** („Zünder > Flugzeit"
> widerlegt), und **alle 43 tragen einen `projectileSpeed`** (27,2–98)
> („kein `projectileSpeed`" widerlegt). Die Tabelle unten beschreibt nur noch,
> **wo** diese Waffen gemessen wurden — nicht mehr, was sie seien.

| Typ | Anzahl | Beispiele |
|---|---|---|
| melee | 15 | Baseballschläger, Feuerfaust, Katana, … |
| ranged | 3 | Boxhandschuhe, Mittelfinger, … |
| heavy_ranged | 6 | Scharfschützengewehr, Bumerang, … |
| elemental | 5 | Schwarzes Loch, … |
| magic | 8 | Zauberrolle, Wirbelwind-Krieger, … |
| utility | 4 | Bohrkanone, Ananasbombe, … |
| tech | 1 | Magnetkanone |
| ultimate | 1 | Void-Ritter |

**Grund**: keine — die Waffen sind in Ordnung. Der Fehler lag im Messwerkzeug.
Genaue Reichweite je Waffe: `docs/balance-messgrenze.md`.

---

## 4. 36 Waffen **selbstwirksam** (schädigen den Schützen)

Beispiele: Raketenrucksack (`move`), Heilzauber (`heal`), Zeit-Sanduhr (`damage_boost`).

**Test**: Jede dieser Waffen nutzt `special` — prüf im Browser, ob der Effekt sichtbar ist.

---

## 5. Stärkste Waffe: **Höllenkanone**

```
102 Schaden | STK 2 | 854 px | epic | Höllenkanone
```

**Test im Browser**: Schieß dich **hinten an** gegen einen Berg. Der Schaden sollte sofort 102 verteilen.

---

## 6. ~~Schwächste Waffen: 15 Nahkampf-Waffen mit **0 Schaden**~~ — **WIDERLEGT**

> **Korrektur 2026-09-27.** Auch dieser Punkt war falsch — siehe Punkt 3.
> Gemessen wirken diese Waffen auf kurze Distanz:
> ```
> Baseballschläger  wirkt bis  40 px | 19,6 Schaden
> Schaufel          wirkt bis  40 px | 14   Schaden
> Tonfa             wirkt bis  40 px | 15,4 Schaden
> Morgenstern       wirkt bis  90 px | 29,4 Schaden
> Eispickel         wirkt bis  90 px | 21   Schaden
> Kettensäge        wirkt bis  90 px | 36,4 Schaden
> Kampfmesser       wirkt bis  90 px | 23,8 Schaden
> ```
> Die Aussage „scheitern bei `projectile`-Delivery" (unten) ist damit ebenfalls
> widerlegt: ihr `projectileSpeed` liegt bei 27,2–98, sie fliegen nur **kurz**.

```
Baseballschläger, Feuerfaust, Hakenklinge, Morgenstern, Schaufel,
Tonfa, Eispickel, Kettensäge, Zwillingskatanas, Katana,
Runenschwert, Rapier, Kampfmesser, Kriegssense, Gebogene Klinge
```

**Test im Browser**: Nah herangehen. Diese Waffen sind **Nahkampf** — sie sollen
auf 854 px nicht treffen.

---

## 7. Bei 854 px trifft KEINE Waffe direkt

**Physikalisches Phänomen**: Alle Schüsse ziehen einen 78-px-Polung (siehe `match.js:#simulateTurretPath`).

**Test im Browser**: Schussreichweite messen — die Treffer-Fläche ist **kleiner** als die Reichweite.

---

## 8. 104 Waffen erreichen **854 px**

Das ist der **Startabstand**. Die anderen 46 haben kürzere Reichweite.

**Test im Browser**: Bei weitem Ziel: `rarity = epic, ultimate` reichen. Bei Nahkampf: nur `melee`.

---

## 9. Ohne Design-Wert: **52 Waffen**

Die Quelldatei hat keinen `damage`-Wert. Der Generator verwendet einen Ersatzwert.

**Test im Browser**: Diese Waffen sehen "normal" aus, aber ihre Balance ist automatisch generiert.

---

## 10. ~~E2E: 7 Tests brauchen echte GPU~~ → **WIDERLEGT (es war Last, nicht fehlende Grafik)**

> **Korrektur 2026-09-27.** Dieser Punkt war falsch. Eigener Vollauf über alle 30
> Spezifikationen auf stillem Baum (kein Worker aktiv):
> ```
> 190 passed · 1 skipped · 0 failed (25,2 min)  — Exit 0
> ```
> **Alle 7 `profiling`-Specs grün**, auch `Bildzeiten mit Explosionen und
> Partikeln (Software-Rasterung) — mountains` und `Bildzeiten auf dem echten
> Grafikpfad`. Sie scheitern **nicht** „auf SwiftShader".
>
> Der Grund für die früheren roten: **Last.** In einem Lauf mit fünf
> gleichzeitigen Workern stand `längstes Bild 900 ms` gegen ein Limit von
> `500 ms` — dieselbe Messung, einmal belastet und einmal allein. Das ist der
> Beleg für die Projektregel, die genau das verlangt: *„Ein repo-weiter Lauf
> parallel zu schreibenden Workern macht fremde Tests lastbedingt rot. Der
> Auftraggeber fährt die Batterie NACH der Rückgabe, seriell."*
>
> `MASTERDOTO.md:393` wusste es bereits: „**7/7 grün.** Auf diesem Rechner läuft
> die echte GPU (`ANGLE (Intel, Mesa Intel HD Graphics 3000)`)."

**Test im Browser**: `npm run test:e2e` — aber **allein**. Parallel zu anderen
Lasten sind die Bildzeit-Specs empfindlich und werden rot, ohne dass etwas
kaputt ist.


---

## Sofortige Handlungsempfehlungen

> **Korrigiert 2026-09-27.** Die ursprünglichen Empfehlungen 1 und 2 beruhten
> auf dem widerlegten Befund aus Punkt 3/6 („43 Waffen ohne Wirkung") und sind
> damit gegenstandslos. Sie hätten 43 gesunde Waffen „repariert".

1. ~~**Nahkampf-Waffen**: `damage` erhöhen ODER `projectileSpeed` ändern~~
   **Gegenstandslos.** Gemessen: `npm run check:fuses` → 11 Zünderwaffen,
   **0 Verstöße**; alle 43 tragen einen `projectileSpeed` (27,2–98). An den
   Waffen ist nichts zu reparieren. `weapons.js` ist ohnehin AUTO-GENERIERT —
   Änderungen daran überschreibt der nächste Build.
2. ~~**Reichweite vs. Schaden**: `Ø13,8` ist zu niedrig~~ **Gegenstandslos.**
   Der Wert ist der Durchschnitt über **nur die wirksamen** Waffen auf 854 px.
   Er sagt nichts über die Nahkampfwaffen aus, die dort nicht treffen sollen.
3. **Selbstwirkung**: 36 Waffen sind „moveset". Das ist **nicht schlecht**, aber dokumentieren, was sie bewirken.
4. **Was wirklich zu tun wäre** (gemessen, `docs/balance-messgrenze.md`): die
   Nachmess-Leiter des Berichts ist grob (6 Stufen, 40–650 px) und die zweite
   Runde dünner besetzt als die erste (1 Schuss, 4 Winkel gegen 3 Schüsse,
   6 Winkel). Eine Waffe, die nur in einem schmalen Band **zwischen** zwei
   Stufen wirkt, könnte weiter als wirkungslos gelten — der Werkzeugfehler ist
   entschärft, nicht ausgerottet.
