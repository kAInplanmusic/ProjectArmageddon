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

## 3. **43 Waffen blockieren von selbst** (0 Schaden)

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

**Grund**: `terrainDamage` = 0, kein `projectileSpeed`, oder Zünder > Flugzeit.

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

## 6. Schwächste Waffen: 15 Nahkampf-Waffen mit **0 Schaden**

```
Baseballschläger, Feuerfaust, Hakenklinge, Morgenstern, Schaufel,
Tonfa, Eispickel, Kettensäge, Zwillingskatanas, Katana,
Runenschwert, Rapier, Kampfmesser, Kriegssense, Gebogene Klinge
```

**Test im Browser**: Diese Waffen scheitern bei `projectile`-Delivery. Der Ball sollte nicht genug Energie haben, um zu zünden.

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

## 10. E2E: 7 Tests brauchen echte GPU → **rot im CI**

`profiling-Bildzeiten-*` Tests scheitern auf SwiftShader.

**Test im Browser**: Diese Tests **können nicht** in `npm run test:e2e` ausgeführt werden, ohne Chrome mit Hardware-Acceleration.

---

## Sofortige Handlungsempfehlungen

1. **Nahkampf-Waffen**: Entweder `damage` erhöhen ODER `projectileSpeed` ändern, damit die Bahn nicht zu früh zündet.
2. **Reichweite vs. Schaden**: Der aktuelle Zusammenhang `Ø13.8` ist zu niedrig — fast jede Waffe muss 44 Schüsse brauchen.
3. **Selbstwirkung**: 36 Waffen sind "moveset". Das ist **nicht schlecht**, aber dokumentieren, was sie bewirken.