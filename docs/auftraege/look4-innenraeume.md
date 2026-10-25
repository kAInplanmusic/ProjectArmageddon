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
