# Griffe und Wirkspitzen — Ankerabnahme (BAL-08)

Stand 2026-11-09. Beleg zur Abnahme „Links/rechts, drei Zielwinkel, Ruhe/Ziehen/Schuss und
drei Figurengrößen im echten Renderer; Griff am nutzbaren Heft, Wirkspitze am tatsächlichen
Ende, Spiegelung korrekt; keine geometrische Randheuristik als Freigabe".

## Was falsch war

Die Anker kamen aus einer **Umriss-Schätzung** (`scripts/waffen-sprites.py`): Griff =
Schwerpunkt des hinteren Drittels, projiziert auf die Spaltenmitte; Mündung = rechter
Maskenrand auf der Höhe des Griffs. Dazu verschob `griffObjekt` in `waffenAnimation.js` den
Griff je Kategorie um 8–16 Zellpixel nach hinten — die Hand lag also **neben** dem Anker, den
das Manifest nannte. Die Freigabe stützte sich auf Randabstände („Mündung höchstens 6 px vom
rechten Rand", „Griff zwischen 3 % und 75 % der Länge"), nicht auf die gezeichnete Waffe.

Belegte Folgen (Vorher-Werte aus `git show HEAD:...manifest.json`):

| Waffe | Anker vorher | Befund |
|---|---|---|
| pa_068 Plasmagewehr | Griff (98,66) | Griff im Vorderschaft statt am Pistolengriff; 70,5 Zellpixel daneben |
| pa_022 Plasmawerfer | Griff (27,64) | Griff über dem Pistolengriff, nicht darauf |
| pa_040 Maschinenpistole | Griff (58,50) | Griff am Verschluss statt am Abzug |
| pa_019 Doppelaxt | Mündung (100,56) | Mündung 20 px vor dem tatsächlichen Ende (veralteter Handwert) |
| pa_007 Tonfa | Griff (25,50) | Griff am Hauptschaft statt am Quergriff |
| pa_009 Eispickel | Mündung am Schaftende | Wirkkopf zeigte nach links: die Schätzung „das dünnere Ende ist die Spitze" griff hier falsch |
| pa_136 Bohrkopf-Rakete | Mündung an den Finnen | Bohrspitze ist das Wirkende, zeigte nach links |
| pa_139 Höllenkanone | Mündung am Körper | Rohr zeigte nach links |
| pa_039 Feldmörser, pa_066 Haubitze | Mündung an der Lafette | Rohr erreicht den Zellrand nicht, „rechter Rand" war das Bodenkreuz bzw. der Zierrahmen |

## Was jetzt gilt

`scripts/waffen-anker-tabelle.json` ist die **einzige Quelle** der Anker (150 Einträge):

* `halt: "heft"` + `heft: [x,y]` — der Punkt, an dem die Hand greift (50 Waffen: Klingen,
  Stiele, Feuerwaffen, Bogen, Peitsche, Spritze …). Der Punkt ist gesetzt und wird gegen die
  Deckfläche geprüft (`scripts/waffen_anker.py`: im Umriss, auf deckendem Pixel, innerhalb
  der Waffe).
* `halt: "koerper"` — kein geführtes Heft (Granate, Karte, Orb, Wesen, Gerät): Griff =
  Schwerpunkt der Deckfläche, ausdrücklich als „am Körper gehalten" dokumentiert.
* `muendung` — nur bei zwei Waffen gesetzt (pa_039, pa_066), weil das Rohr den Zellrand nicht
  erreicht; sonst liegt die Mündung am äußersten Materialpunkt am rechten Ende.
* `spiegeln` — drei Zellen kamen mit dem Wirkende nach links (pa_009, pa_136, pa_139) und
  werden gespiegelt; `facing` bleibt `right`.
* `grund` — Begründung, besonders für die Ausnahmen (Tonfa-Quergriff, Peitschengriff …).

Im Renderer sind zwei Dinge mitgezogen:

* `griffObjekt` (Kategorien-Versatz) ist **entfallen**: `par.griff` ist 0, die Hand sitzt auf
  dem Anker. Eine bewusste Ausnahme je Waffe bleibt über `KORREKTUREN[id].griff` möglich.
* Die Achsneigung Griff → Mündung wird **nicht mehr geklemmt** (`MAX_ACHSE` war 1,0 rad). Die
  Klemme ließ die Mündung bei schrägen Rohren neben dem Zielstrahl liegen (bis 5° Abweichung).
  Die Schranke steht jetzt bei 1,35 rad und fängt nur fehlerhafte Daten ab; die steilste echte
  Achse ist 40° (Zwillingskatanas).

## Abnahme

`tools/waffen-anker-abnahme.mjs` zeichnet jede Waffe mit **`figuren.zeichneWaffeSprite`** (der
echte Rendererpfad) und misst am Ergebnis. Ein aufzeichnender Canvas-Kontext liefert die
tatsächlich benutzte Matrix — der Prüfer rechnet die Renderer-Mathematik nicht nach.

Matrix je Waffe: 2 Seiten × 3 Zielwinkel (−0,35 / +0,08 / +0,52 rad, links gespiegelt) ×
4 Posen (Ruhe mit Pendeln, Ruhe ohne Pendeln, Ziehen, Schuss) × 3 Figurgrößen (0,85 / 1,00 /
1,35) = 72 Konstellationen. Gemessen werden die 36 rechtsgerichteten Fälle; die linke Seite
wird als Spiegelpaar in allen vier Posen verglichen (8 weitere Zeichnungen je Waffe). Das sind
6 600 Zeichnungen für alle 150 Waffen.

Kriterien (pixelbasiert, keine Randheuristik):

1. **Spitze am Ende** — die Mündung ist der äußerste Punkt der gezeichneten Waffe entlang der
   Achse Griff → Mündung (±2,5 Weltpixel). Mündungsblitz und Aufladeglanz werden ausgenommen,
   weil sie bewusst vor der Mündung liegen.
2. **Mündung auf dem Zielstrahl** — in ruhiger Pose ist die Waffenachse der Zielstrahl
   (±0,02 rad); damit liegt die Mündung bei jedem der drei Winkel auf dem Strahl.
3. **Mündung auf der Waffe** — bei `halt: heft` liegt der Punkt auf Material (weiche Kanten an
   Flamme und Nadel zählen).
4. **Griff auf der Waffe und im Heft** — Griffpunkt auf Material; bei `halt: heft` zusätzlich
   innerhalb der belegten Heftspanne (die Spanne selbst wird in `tests/waffen-anker.test.js`
   spaltenweise gegen die Deckfläche geprüft).
5. **Spiegelung** — der Linksfall ist pixelgenau die Spiegelung des Rechtsfalls (<2 %
   Abweichung), in allen vier Posen.
6. **Figurgröße** — kein Sprung der Mündungsabweichung zwischen 0,85 und 1,35.

Ergebnis (Lauf siehe `docs/bilder/waffen-anker-abnahme/bericht.json`): **150 von 150 Waffen
bestanden**. Größte gemessene Werte:

* Mündung neben dem gezeichneten Ende: 1,90 px (pa_050, schräger Axtkopf). pa_066 Haubitze
  liegt bei 4,19 px — dort ist der Zellrand der Zierrahmen, die Mündung ist gesetzt und wird
  im Prüfblatt gezeigt.
* Achse neben dem Zielstrahl: 8·10⁻¹⁶ rad (Rundung), also exakt auf dem Strahl.
* Spiegelabweichung: 0,55 % (pa_118, Orb), im Mittel unter 0,1 %.
* Größensprung zwischen 0,85 und 1,35: höchstens 0,18 px.

Prüfblatt (Ruhe rechts / Ruhe links / Schuss mit Griff- und Mündungsmarker):
`docs/bilder/waffen-anker-abnahme/blatt.jpg`.

## Nachvollziehen

```
python3 scripts/waffen-sprites.py --nur-anker   # Anker aus der Tabelle neu setzen
npm run waffen:anker:abnahme                    # Matrix im echten Renderer, Bericht + Blatt
node --test tests/waffen-anker.test.js tests/waffen-sprites.test.js tests/ci-semantik.test.js
```

Die Anker selbst prüft `tests/waffen-anker.test.js` gegen die Atlanten (150 Waffen): Griff auf
deckendem Pixel, Heftspanne durchgehend Material, Mündung am tatsächlichen Ende, Achsneigung
ausrichtbar, gespiegelte Zellen mit Wirkende rechts. `tests/ci-semantik.test.js` (W18) prüft
dieselbe Semantik über das Manifest; die frühere Hälftenregel dort ist ersetzt.

## Grenzen

* „Am nutzbaren Heft" ist eine **Aussage über die Daten und das Bild**, nicht über Physik: die
  Tabelle nennt den Griffpunkt je Waffe, das Prüfblatt zeigt ihn am gezeichneten Heft. Ein
  automatischer Nachweis „das ist ein Heft und kein Kopf" wäre wieder eine Formheuristik.
* Die Figurgröße wird über `par.zelle` skaliert (so wirkt `figur.skala` im Renderer), damit die
  Messung nur die Waffenzelle sieht; Arm und Faust liegen am Griff und verfälschten die
  Dickenmessung.
* Zwei Zellen tragen weiter einen Zierrahmen bzw. ein Beiwerk (pa_066 Haubitze, pa_082
  Münzstab). Das ist Freistellungsarbeit (BAL-09), nicht Ankerarbeit; die Mündung der Haubitze
  ist deshalb gesetzt.
* Der volle Generatorlauf (`python3 scripts/waffen-sprites.py`) erzeugt dieselben Anker;
  `--nur-anker` ist nur der schnelle Weg nach einer Tabellenänderung. Für pa_148 nutzt der Lauf
  die HEIC-Quelle, wenn `pillow-heif` installiert ist (dokumentiert im Generatorkopf).
