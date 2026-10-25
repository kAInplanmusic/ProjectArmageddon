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

**Befund 4 (noch offen): Der Stand der Figur selbst ist nicht belegt.**
`src/engine/systems/bewegungSystem.js` enthält keinen Geländezugriff, und `surfaceYAt`
wird dort nicht benutzt — der Weg der Figur zum Boden läuft über den `terrain`-Dienst
des ECS. Welche Abfrage dort greift (Bitmap mit y oder Spaltenoberfläche), ist die
**nächste Messung**; erst danach ist entscheidbar, ob Stufe 1 ein Umbau der Abfrage ist
oder nur die vier x-only-Stellen nachziehen muss.

**Arbeitsliste für Stufe 1 (aus diesen Befunden):**
1. Bodenabfrage der Figur belegen (eine Messung, wie oben beschrieben).
2. Falls sie y-fähig ist: die vier x-only-Stellen auf `materialAt(x, y)` umstellen —
   jeweils mit Test (Haustier auf Innenboden, Einschlag auf Innenboden, Turm in der Höhle).
3. Falls sie es nicht ist: Standabfrage auf `materialAt(x, y)` erweitern (ein Punkt,
   `MatchController.materialAt`), dann dieselben vier Stellen nachziehen.
4. Erst danach Ruinen mit 1–2 Räumen als Kartentyp-Variante prüfen — die Hohlräume
   selbst müssen nicht mehr erfunden werden.

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
