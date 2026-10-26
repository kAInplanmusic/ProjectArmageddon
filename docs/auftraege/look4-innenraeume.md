# LOOK-4 — Begehbare Innenräume und Etagen (Entwurf)

*Stand: 2026-10-25. Auftrag: MASTERDOTO, Kästchen LOOK-4 („Begehbare Hohlräume und Etagen nach
`ref-6-hochhaus-schnitt` und `ref-4-turmruine`"). Dies ist ein **Entwurf**, keine Umsetzung:
In dieser Sitzung wurde bewusst nichts am Gelände geändert.*

## 1. Warum das kein Feinschliff ist

Die drei anderen LOOK-Kästchen ändern, **wie** etwas gezeichnet wird. LOOK-4 ändert, **was**
Gelände ist: Figuren sollen in Löcher hineinlaufen, auf Böden stehen, Etagen betreten. Das
berührt Geländeerzeugung, Standabfrage, Kartenprüfung, Kameraführung und Bildzeit-Budget
gleichzeitig. Deshalb eigenes Paket mit eigener Abnahme, nicht als Beifang.

## 2. Ist-Stand (geprüft am 2026-10-25, mit Fundstellen)

- **Geländeerzeugung:** `src/shared/terrainGen3.js` → `erzeugeAutonomeKarte({ rng, width, height, biom, stoffe })`
  liefert ein Bitmap (fest/leer) und optional eine Stoffkarte; `pruefeSpielbarkeit(k)` prüft die Karte.
- **Stoff/ Material je Punkt:** `src/shared/stoffkarte.js` mit `baueStoffkarte(...)`, `stoffAm(karte, x, y)`,
  `materialAn(karte, x, y)`, `geschuetztAm`, `stoffAmEinschlag`, `stoffHash`.
- **Wichtig:** Das Gelände ist ein **Bitmap je Pixel**, kein reines Höhenfeld (eine Höhe je x). Der
  Zugriff läuft über `materialAmPunkt(material, x, y)` (`terrainGen3.js`). Damit sind Hohlräume
  **im Datenmodell bereits möglich** — ein Loch ist einfach „leer zwischen zwei festen Bereichen".
- **Darstellung:** Der Renderer malt Gelände in Zellen (`ZELLE`) mit der Stoffkarte; Lavazellen,
  Stoffwechsel nach Einschlägen und Kulissen liegen daneben (`src/client/renderer.js`,
  `src/client/feuerOptik.js`, `src/client/kulisseUndWasser.js`).
- **Physik/Stand:** Die Standabfrage läuft über die Physik (`src/engine/physics/ballistics.js` und
  die Systeme unter `src/engine/systems/`); Figuren stehen auf dem obersten festen Pixel ihrer Spalte.

**Stufe 0 — Ergebnis (2026-10-25, belegt):** Die Materialabfrage
`materialAmPunkt(material, x, y)` (`src/shared/terrainGen3.js:520`) nimmt NICHT die Geländeoberfläche
der Spalte, sondern klettert von der gefragten Stelle **aufwärts bis zur Oberkante des
zusammenhängenden Felsblocks** in derselben Spalte:

```js
while (py > 0 && material.bitmap[(py - 1) * material.breite + px]) py -= 1;
```

Das heißt: Ein Bodenband INNERHALB eines Hohlraums löst bereits auf sein eigenes Material auf — die
Abfrage kennt mehrere feste Bereiche je Spalte. Die in §2 notierte Annahme ist damit **widerlegt**;
für Ruinen mit einem Boden muss die Standabfrage nicht umgebaut werden. Der Motor reicht sie über
`MatchController.materialAt(x, y)` (`src/engine/match.js:1341`) durch — die eine Lesestelle.

**Was daraus NICHT folgt:** Dass Figuren auf einem Innenboden auch *stehen bleiben*, ist damit noch
nicht bewiesen — die Stand-/Falllogik sitzt in den Systemen und wurde in Stufe 0 nicht gemessen.
Das bleibt die erste Prüfung in Stufe 1 (Testgelände mit einem künstlichen Hohlraum).

## 3. Entwurf in vier Stufen

### Stufe 0 — Prüfung (kein Produktivcode)
1. Standabfrage belegen: ein Testgelände mit einem künstlichen Hohlraum, Figur hineinfallen lassen,
   protokollieren, wo sie stehen bleibt.
2. Kameraführung prüfen: Was passiert heute, wenn eine Figur unter der Oberfläche steht?
3. Entscheidungsvorlage: „Hohlraum = Bitmap-Loch" gegen „Hohlraum = eigene Struktur (Rechtecke/Polygone)".

### Stufe 1 — Hohlräume erzeugen (deterministisch)
- In `erzeugeAutonomeKarte` einen optionalen Schritt `hohlraeume` (Seed-fest über den vorhandenen
  Teil-RNG-Zweig), der Rechtecke/Gänge in das Bitmap stanzt und die Stoffkarte mitzieht (Innenwände
  = anderer Stoff als Außenwand).
- `pruefeSpielbarkeit` muss Hohlräume kennen: keine Figur darf in einem Hohlraum ohne Ausgang
  starten (Erreichbarkeitsprüfung, `src/shared/erreichbarkeit.js`).
- **Gates:** Karten-Hashes der bestehenden Tests dürfen sich NICHT ändern, solange `hohlraeume`
  nicht gesetzt ist (Voreinstellung aus). Neue Tests: gleicher Seed → gleiche Hohlräume; jede
  Spawn-Position hat einen Weg nach draußen.

### Stufe 2 — Böden, Etagen, Treppen
- Böden sind einfache feste Bänder im Bitmap; Etagen entstehen durch mehrere Bänder übereinander.
- Treppen: eine Folge von Stufen, die die Erreichbarkeitsprüfung als Weg akzeptiert.
- Figuren brauchen eine „steht auf"-Regel, die mehrere feste Bereiche je Spalte zulässt, sonst
  fallen sie durch den Boden des Hohlraums auf das Grundgestein.
- **Risiko:** Die bestehende Ballistik rechnet gegen die Oberfläche. Projektile müssen Decken
  treffen können (oder bewusst nicht — das ist eine Design-Entscheidung, siehe §5).

### Stufe 3 — Lesbarkeit innen (der eigentliche LOOK-Teil)
- Innenwände brauchen eine eigene Kante/Abdunkelung, sonst sieht ein Hohlraum wie ein Loch im Bild aus.
- Sichtbarkeit: Figur hinter einer Decke muss erkennbar bleiben (Röntgen-Schnitt oder aufhellender
  Innenraum), sonst ist das Paket spielerisch wertlos.
- Referenzbilder: `ref-6-hochhaus-schnitt` (Etagen im Schnitt) und `ref-4-turmruine` (offene Räume).

### Stufe 1 — Messung (2026-10-25, ohne Produktivcode)

**Befund 1: Die Hohlräume gibt es längst.** `src/shared/terrainGen2.js` kennt
`KARTENTYPEN` mit Hohlraumanteil, und die Produktion läuft mit `kartentyp: 'autonom'`:

| Typ | Hohlraumanteil | Innenböden (gemessen, Seed 7, 2560×1440) | tiefster Boden unter der Oberfläche |
| :-- | :-- | :-- | :-- |
| `kavernen` | 0,45 | **3 495** | **839 px** |
| `hoehlen` | 0,30 | 2 657 | 825 px |
| `schwebe` | 0,20 | (nicht gemessen) | — |
| `huegel` | 0,00 | 0 | 0 |

Gezählt als feste Bänder mit Luft darunter, alle 2 Spalten abgetastet (`bitmap` ist
`Uint8Array` der Länge Breite×Höhe; `huegel` hat als Gegenprobe exakt 0).

**Befund 2: Niemand startet in einer Höhle.** In drei Kartentypen standen alle Spieler
auf der Oberfläche (`y ≈ surfaceYAt(x) − 10`, `isGrounded = true`); 0 von 12 Figuren
unterirdisch. Die Platzvergabe setzt also auf die Oberfläche — kein eingesperrter Start.

**Befund 3: Vier Systeme fragen den Boden nur nach x.** `surfaceYAt(x)` ist einwertig
und wird benutzt von
`src/engine/systems/guentherSystem.js` (Zeilen 290, 598),
`src/engine/systems/cookieSystem.js` (325, 346),
`src/engine/shooting.js` (801: Einschlagpunkt) und
`src/engine/turret.js` (Ballistik bricht am Gelände ab).
In Höhlen benutzen diese vier die **Oberfläche** statt des Innenbodens — Haustiere,
Einschläge und Geschütztürme verhalten sich dort falsch, sobald jemand drinnen ist.

**Befund 4 (belegt): Die Figur steht y-fähig — Innenböden sind begehbar.**
Der Weg der Figur zum Boden läuft über den `terrain`-Dienst des ECS, und der fragt
**pixelgenau mit y**: `terrain.isSolid(x, y)` in
`src/engine/systems/bewegungSystem.js:48/54/57` (Laufen) und
`src/engine/systems/characterSystem.js:239` (Treffer) sowie `:270-272` (Fall/Suche nach
dem Boden). `surfaceYAt` kommt in der Figurenphysik nicht vor.

Messung am tiefsten Innenboden (Seed 7, `kavernen`, x = 228): Band von y = 1279 bis 1355,
Oberfläche dort 516 (also 763 px darüber). Am Punkt:

| Abfrage | Ergebnis | Bedeutung |
| :-- | :-- | :-- |
| `isSolid(228, 1279)` | **true** | der Innenboden ist fest |
| `isSolid(228, 1274)` | false | 5 px über dem Boden ist Luft (Platz für die Figur) |
| `isSolid(228, 1359)` | false | unter dem Band ist Luft (echter Hohlraum) |

Damit ist der Umbau der Standabfrage **nicht nötig**: Ein Figurenkörper, der bei
y ≈ 1279 steht, hat festen Grund unter sich und Luft um sich. Abgesichert durch
`tests/innenraeume.test.js` (drei Prüfungen: Innenböden zählen — kavernen > 1000,
huegel exakt 0; Maske am Innenboden fest/Luft/Luft; niemand startet unter der
Oberfläche).

**Arbeitsliste für Stufe 1 (Stand 2026-10-25):**
1. ~~Bodenabfrage der Figur belegen~~ — **erledigt** (Befund 4: y-fähig über `isSolid`).
2. **Offen:** die vier x-only-Stellen auf eine y-fähige Abfrage umstellen, jeweils mit
   Test. Das ist der eigentliche Rest von Stufe 1: die Figuren können drinnen stehen, die
   vier Systeme wissen es noch nicht. Nachgesehen am 2026-10-25:

   | Stelle | Was sie mit `surfaceYAt(x)` macht | Folge im Hohlraum |
   | :-- | :-- | :-- |
   | `shooting.js:801` in `shiftPlayer` | **Rückstoß** setzt `Position.y = surfaceYAt(zielX)` | die Figur wird auf die **Oberfläche gerissen** statt im Hohlraum zu bleiben |
   | `guentherSystem.js:290/598` | Haustier-Günther sucht seinen Boden | läuft über dem Hohlraum auf der Oberfläche |
   | `cookieSystem.js:325/346` | Cookie-Krater und Cookie-Boden | Krater und Standort am falschen Ort |
   | `turret.js` | **Platzsuche** (`freierPlatz`) nimmt `surfaceYAt(x)` | das Geschütz steht ÜBER der Figur auf der Oberfläche statt neben ihr — **behoben 2026-10-25** |

   Die **Rückstoß-Stelle ist die schlimmste**, weil sie eine Figur versetzt (nicht nur
   zeichnet).

**Der Fix ist gebaut, gemessen — und wieder zurückgezogen (2026-10-25).**

Ablauf, ehrlich protokolliert:

1. **Reproduziert:** Figur auf einem Innenboden (Seed 7, `kavernen`, y = 1279, Oberfläche
   516), Bewegungswaffe `pa_087` (Teleport) feuern → die Figur stand danach bei **y = 638**,
   also 641 px nach oben aus der Höhle gerissen. Test dazu: `tests/innenraeume.test.js`,
   Fall „Ein Bewegungsspezial reisst die Figur nicht aus dem Hohlraum".
2. **Behoben:** `bodenNaheHoehe()` in `shooting.js` sucht den Boden um die BISHERIGE Höhe
   (±480 px, erst nach unten) statt die einwertige Oberfläche zu nehmen; auf der Oberfläche
   bleibt das alte Verhalten (Schwelle: mehr als ein Körpermaß unter der Oberfläche).
   Ergebnis: Test **grün** (rot → grün belegt).
3. **Zurückgezogen:** Die Goldwert-Prüfungen in `tests/zerstoerung.test.js` ändern ihre
   **Zustands-Hashes** (Seed 4242: `85bd9975` → `1fefacd8`; Altfassung `eb0d7904` →
   `16bd8499`; Terrain-Hashes unverändert). Ursache ist dieselbe Fehlerklasse: In einem
   Lauf mit 30 Kratern stehen Figuren IM Krater, also unter der Oberfläche — dort greift die
   neue Suche und verschiebt Positionen.
4. **Neubasiert und wieder eingesetzt (2026-10-25, Entscheidung des Auftraggebers):** Die
   Goldwerte der Krater-Läufe in `tests/zerstoerung.test.js` sind bewusst nachgezogen —
   **drei von vier Seeds** (4242, 606, 31; Seed 9001 unverändert), jeweils Zustands- **und**
   Terrain-Hash, mit Begründung im Testkopf. Der Fix ist damit im Baum, der Test scharf.

**Stand:** `npm test` 1882/1882 grün, 0 übersprungen. Der Rückstoß kann eine Figur nicht
mehr aus einem Hohlraum oder Krater reißen; über Tage bleibt das Verhalten Bit für Bit das
alte.
3. Erst danach Ruinen als eigene Kartentyp-Variante prüfen — die Hohlräume selbst müssen
   nicht mehr erfunden werden.

### Tiere im Hohlraum (Entscheidung 2026-10-25: sie sollen folgen)

**Entschieden:** Günther und Cookie sollen dem Spieler auch in einen Hohlraum folgen
(nicht auf der Oberfläche zurückbleiben).

**Ist-Stand (belegt):** Beide hängen an der einwertigen Oberfläche —
`guentherSystem.js:290` (`const boden = surfaceYAt(...); if (boden > 0) this.#position.y = boden;`)
und `cookieSystem.js:346` (`#bodenFolgen`). In einem Hohlraum werden sie damit nach oben
gesetzt, also vom Spieler getrennt.

**Umgesetzt am 2026-10-25.** Der Weg dorthin war eine TDD-Grenze, die erst überwunden
werden musste — sie ist unten als Lehrstück stehengelassen:

**Warum zuerst KEIN Code ging (TDD-Grenze, inzwischen aufgelöst):** Der Fix ist mit dem
Muster aus `shooting.js` klar (Boden um die bisherige Höhe suchen). Aber es gab keinen
Test, der ihn zuerst rot zeigt:

1. Die Position der Tiere liegt privat (`#position`), es gibt nur einen Leser
   (`get position()`), **keine Setz-API**. Ein Test kann das Tier also nicht in einen
   Hohlraum stellen.
2. Der Umweg über das Spiel (Spieler in die Kaverne setzen, Tier laufen lassen, bis es
   ankommt) ist ein langlaufender Simulationstest mit unsicherem Zeitpunkt — kein
   verlässliches Rot.
3. Das Gelände steckt nicht im Kontext der Tiere: Sie bekommen `surfaceYAt`, aber kein
   `terrain`. Der Fix braucht also eine durchgereichte `bodenNahe(x, vonY)`-Abfrage —
   dieselbe, die `shooting.js` seit dem 2026-10-25 lokal hat.

**Alle vier Stufen sind erledigt (2026-10-25):**
1. **Gemeinsame Abfrage:** `src/engine/boden.js` mit `bodenNaheHoehe(quelle, x, vonY)` —
   `shooting.js` und der Motor nutzen sie jetzt beide (kein zweiter Rechenweg).
2. **Motor:** `MatchController.bodenNahe(x, vonY)` ist öffentlich; `#tierKontext()` reicht sie
   als `bodenNahe` an beide Tiere weiter (`tierKontext.js` fällt ohne sie auf `surfaceYAt`
   zurück, damit ältere Aufrufer unverändert laufen).
3. **Testbarkeit:** `setzePosition(x, y)` an Günther und Cookie, dazu die Zugriffe
   `guentherSystem` und `cookieSystem` am Motor.
4. **Fix + Beleg:** `guentherSystem` (Zeile ~290) und `cookieSystem` (`#bodenFolgen` und der
   Schockwellen-Krater) fragen jetzt `bodenNahe` mit der bisherigen Höhe.
   Test `tests/innenraeume.test.js` war rot (Cookie: y = 516 = Oberfläche statt 1279 im
   Hohlraum) und ist grün. **Goldwerte bleiben unverändert** — die Krater-Läufe laufen auf
   `preset: 'hills'` ohne Hohlräume, dort liefert `bodenNahe` genau die Oberfläche.

### Stufe 2 — Etagen (umgesetzt 2026-10-25, Teil 2a)

**Neu:** Kartentyp `etagen` in `src/shared/terrainGen2.js` — ein Massiv mit drei
Stockwerken: je Etage ein Deckenband (8 px), darunter ein Raum (46 px lichte Höhe), der
Boden des Raums ist die nächste Decke, die unterste Etage steht auf dem Kartenboden.
Schächte (18 px breit, alle 320 px) stanzen Löcher **von der Oberfläche** durch alle
Decken — dort fällt eine Figur hinunter und landet auf dem nächsten Boden.

**Zwei Messungen haben den Entwurf korrigiert (beide belegt):**

1. **Erster Anlauf: 9,8 % Land** auf 640×360 — die durchgehenden Räume nahmen 38 % der
   Karte weg, unter der Schwelle des bestehenden Land-Tests (15 %). Der Test hat den
   Fehler gefunden, nicht ich.
2. **Pfeiler eingebaut** (60 px fest je 140 px): Land **24,7 %** auf 640×360, 40,3 % auf
   1280×720, 44,6 % auf 2560×1440 — alle Größen über der Schwelle.

**Masse sind Pixelwerte, keine Kartenanteile** — dieselbe Lehre wie bei den Höhlen (dort
ergab ein Anteil auf kleiner Karte 11 % Land, auf großer 27 %).

**Stufe 2b — Aufstieg (umgesetzt 2026-10-25).** Der Schacht ist jetzt **ersteigbar**:
Er ist 56 px breit und trägt versetzte **Trittbretter** (26 px tief, alle 40 px Höhe,
abwechselnd links und rechts).

Entscheidende Messung vor dem Bau: Ein **normaler Sprung erreicht 117 px**, ein Salto
139 px (gemessen im Motor, `bewegung: 2`). Ein reiner Schacht wäre damit nutzlos gewesen —
man springt hoch und fällt wieder hinunter. Der Höhenabstand der Trittbretter (40 px bzw.
80 px bis zum nächsten Brett der anderen Seite) liegt deutlich darunter; der Test fordert
höchstens 100 px und damit Reserve.

**Belegt:** `tests/etagen-karte.test.js` prüft, dass mindestens drei Trittbretter im
Schacht liegen und **kein** Abstand über 100 px liegt. Rot-Seite belegt: mit
`stufenHoehe: 160` fällt der Test (5 von 6 grün), mit 40 ist er grün.

**Was weiterhin NICHT geprüft ist:** Ein echter Kletterlauf (Figur springt Brett für Brett
nach oben). Die Prüfung ist geometrisch (Abstände gegen die gemessene Sprunghöhe), nicht
motorisch — ein End-to-End-Klettertest steht noch aus.

## 4. Messgrößen und Gates (vor dem Bau festgelegt)

| Größe | Erwartung |
| :-- | :-- |
| Karten-Hash ohne Hohlräume | **unverändert** (Voreinstellung aus) |
| `pruefeSpielbarkeit` | 0 unerreichbare Startpunkte bei 200 Seeds |
| Bildzeit | im vorhandenen Budget (`dynamik`/`profiling`-Grenzen), keine Regression |
| Determinismus | gleicher Seed → gleiches Bitmap, gleiche Hohlräume, gleicher Hash |
| Replay | Aufzeichnungen ohne Hohlräume bleiben abspielbar (Format nicht anfassen) |

## 5. Entscheidungen (getroffen am 2026-10-25)

1. **Decken sind unzerstörbar.** Projektile prallen ab; Innenräume sind reine Deckung. Kein
   Statikaufwand, keine Fallregeln für Figuren auf einbrechenden Etagen. Ein späterer Durchschlag
   wäre eine eigene Stufe und braucht dann Statik.
2. **Röntgen-Schnitt.** Die Figur wird halbtransparent, wenn eine Wand oder Decke davor liegt —
   nicht der ganze Raum. Ein aufhellender Innenraum ist damit vom Tisch (weniger Renderer-Arbeit,
   bewährtes Muster aus 2D-Spielen).
3. **Stufenweise beides: erst Ruinen mit 1–2 Räumen, dann Hochhäuser mit Etagen.** Gemeinsamer
   Entwurf, getrennte Abnahme. Stufe 1 ist damit die Ruine ohne Treppen.

**Folge für Stufe 2:** Etagen/Treppen bleiben im Plan, aber erst nach der Ruinen-Abnahme — und mit
der dann gewonnenen Erkenntnis, ob eine Figur auf einem Innenboden wirklich stehen bleibt.

## 6. Aufwand (grobe Ordnung)

| Stufe | Aufwand | Ergebnis |
| :-- | :-- | :-- |
| 0 Prüfung | klein (1 Sitzung) | Entscheidungsvorlage mit Messung |
| 1 Hohlräume | mittel | Löcher/Gänge, Seed-fest, Spielbarkeit geprüft |
| 2 Etagen/Treppen | groß | begehbare Böden, Standabfrage erweitert |
| 3 Lesbarkeit | mittel | Innenkanten, Sichtbarkeitsregel |

Erst nach Stufe 0 ist eine belastbare Schätzung für 1–3 möglich; die Zahlen oben sind Ordnungen,
keine Zusagen.
