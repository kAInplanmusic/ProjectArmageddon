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

**Offene Annahme für Stufe 0:** Ob die Standabfrage wirklich nur „oberstes festes Pixel je Spalte"
nimmt oder bereits beliebige feste Bereiche, ist aus dem Code allein nicht abschließend belegt
(kein Höhenfeld-Modul gefunden, aber die Abfrage ist über Systeme verteilt). Das ist die **erste
Messung** des Pakets, nicht eine Vermutung, auf der gebaut wird.

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

## 5. Entscheidungen, die der Auftraggeber treffen muss

1. **Decken:** Sollen Projektile Decken durchschlagen (Zerstörung von Etagen) oder prallen sie ab?
   Durchschlagen ist realistischer, kostet aber Statik: eine Etage, die wegfällt, muss die darüber
   stehenden Figuren fallen lassen.
2. **Sichtbarkeit:** Röntgen-Schnitt (Figur durchscheinend, wenn hinter Wand) oder aufhellender
   Innenraum (Wände transparent, wenn die Figur drin ist)?
3. **Umfang:** Nur Ruinen mit 1–2 Räumen (klein, schnell) oder Hochhäuser mit echten Etagen (groß)?

## 6. Aufwand (grobe Ordnung)

| Stufe | Aufwand | Ergebnis |
| :-- | :-- | :-- |
| 0 Prüfung | klein (1 Sitzung) | Entscheidungsvorlage mit Messung |
| 1 Hohlräume | mittel | Löcher/Gänge, Seed-fest, Spielbarkeit geprüft |
| 2 Etagen/Treppen | groß | begehbare Böden, Standabfrage erweitert |
| 3 Lesbarkeit | mittel | Innenkanten, Sichtbarkeitsregel |

Erst nach Stufe 0 ist eine belastbare Schätzung für 1–3 möglich; die Zahlen oben sind Ordnungen,
keine Zusagen.
