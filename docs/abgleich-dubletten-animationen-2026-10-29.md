# Abgleich: Dubletten bei Waffen und Stand der Animationen (2026-10-29)

Zum Gegenlesen, nichts davon ist umgesetzt. Quellen: Katalog `src/shared/config/weapons.js` (Spielwerte Waffenfassung 9),
`docs/balance-auslese/*.md`, Clientcode `src/client/`.

## A. Dubletten bei den Waffen

Gleiche Wirkung (`special`) bei mehreren Waffen, Stand Katalog:

| Wirkung | Waffen | Einschätzung |
|---|---|---|
| `direct_hit` (26 Waffen) | alle Nahkämpfer und viele Standardschützen, z. B. Zwillingskatanas, Katana, Mehrzweckmesser, Taschenmesser, Runenschwert, Rapier, Kampfmesser, Doppelaxt, Kriegssense, Krummsäbel | Normal, das ist der Grundtyp. Unterschiede entstehen nur über Schaden, Reichweite und Flugwerte. Mehrere Nahkämpfer werden von einer Schwesterwaffe bei gleichen Flugwerten im Schaden übertroffen (Piratenhaken gegen Hakenklinge, Mehrzweckmesser gegen Kampfmesser, Rapier gegen Taschenmesser). |
| `flight` (3) | Raketenrucksack, Düsenrucksack, Gleitschirm | Echte Dublette. Düsenrucksack und Enterhaken haben identische Zahlen und Motorwirkung (Versatz 60 px). Der Gleitschirm ist bei gleicher Wirkung nur schwächer, weil sein `effectMagnitude` nicht gelesen wird. |
| `hook_pull` (2) | Hakenklinge, Piratenhaken | Gleich bis auf Schaden. Beide ziehen das Ziel heran. |
| `freeze` (2) | Eispickel, Eisschlag | Verschieden in Reichweite und Zielart. Der Eisschlag friert in Schadensfassung 2 nicht ein (nur Frost), obwohl er „einfriert" verspricht. |
| `fragmentation` (2) | Splittergranate, Ananasbombe | Die Ananasbombe ist als Strahl modelliert, die Splittergranate als Zündergranate. Unterschiedliche Wirkung trotz gleichem Namen der Wirkung. |
| `precision` (2) | Fernbüchse, Revolver | Fernbüchse trifft zweimal (Durchschlag), Revolver nicht. |
| `teleport` (2) | Dimensionssprung, Dimensionsriss | Der Riss ist in jeder Zahl schlechter als der Sprung, sein `effectMagnitude` wird nicht gelesen. |

Dazu die Selbstwirkungen der Kategorie `magic` (17 von 30 Waffen), laut `docs/balance-auslese/magic.md`:

| Gruppe | Waffen | Befund |
|---|---|---|
| Verstärkung ×1,5 (4) | gleiche Wirkung, nur andere Namen | Dublette. Wirkt genau einen eigenen Zug, der Text sagt „einige Züge". |
| Zufall (4) | vier Waffen mit demselben Zufallspool | Dublette. Chaoselixier verspricht schon im Namen Zufall. |
| Versetzen 60 px (4) | gleiche Wirkung | Dublette. |
| Schild (2) | Eisschild und ein zweiter | Der Eisschild bringt nichts Eisiges mit. |
| Heilung (2), Aufdecken (1) | Aufdecken hat keine Wirkung, `isRevealed` liest niemand | Allsehendes Auge setzt nur eine Markierung. |

**Mögliche Entscheidungen (für dich):**
1. Dubletten bewusst lassen, aber durch Zahlen unterscheiden (Dauer, Stärke, Abklingzeit, Munition), damit jede Waffe einen eigenen Zweck hat.
2. Dubletten zusammenführen (weniger Waffen, einheitlicher Katalog) und Platz für neue Wirkungen schaffen.
3. Nur die Fehlzuordnungen beheben (Namen/Texte, die Falsches versprechen), die Zahl der Waffen bleibt.

Mein Vorschlag: Variante 1 für Verstärkung, Zufall und Versetzen, Variante 3 für die Texte. Das ändert Spielwerte und wäre eine neue
Waffenfassung 10.

## B. Animationen: was es gibt

| Bereich | Stand | Datei |
|---|---|---|
| Figur: Gehen, Aktion, Zustand | Je Figur Sheets für Gehzyklus (8 Frames), Aktion (Idle, Sprung, Treffer, Niedergestreckt) und Zustand; alle 81 Figuren | `figurSheets.js`, `figurAnimation.js` (`FigurPosen`) |
| Figur: Emotionen | 8 Posen (Angst, Blinzeln, Schulterzucken, Jubel, Zittern, Kopf hoch, Kopf runter, Waffenwechsel). Im Schnitt sind 5,7 von 8 Zellen je Figur brauchbar, 11 Figuren haben alle 8 | `figurSheets.js`, Manifest `sprite-sheets-emotion/` |
| Figur: Treffer, Fall, Schuss | Schuss- und Treffer-Kurven, Fall-Pose | `figurAnimation.js` |
| Waffen | Standbilder, die prozedural animiert werden: Idle, Ziehen, Rückstoß, Nachladen je Kategorie, Korrekturen je Waffen-ID | `waffenAnimation.js`, `weaponAnimation.js` |
| Geschosse | Schweif, Gruppenmarken, Flugwinkel | `waffenAnimation.js` |
| Effekte | Sheets: Explosion, Glut, Feuerring, Feuerball, Pilzwolke, Mündungsfeuer; Einschlagwahl nach Radius | `effektSheets.js` |
| Umgebung | Wetter, Tageszeit, Sterne, Sonne, Laub, Regenspritzer, Pfützen, Blitz und Donner | `wetterLicht.js`, `stimmung.js` |
| Gelände | Risse und Geröll beim Einschlag, Geländedetails | `gelaendeDetails.js` |

Bewegung wird bei „reduzierte Bewegung" ausgeschaltet, die Aussage (Blitz, Glanz, Füllband) bleibt.

## C. Animationen: Lücken und Auffälligkeiten

1. **Emotionen:** 2,3 von 8 Zellen je Figur fehlen im Schnitt. Betroffen sind vor allem Nicht-Humanoide (Schlange, Spinne, Panzer, Drohne), dort hat die KI die Art verwandelt. Eine bessere Methode wäre nötig, etwa Referenzbild plus eigene Zeichnung statt nur Prompt.
2. **Waffen:** Sie bewegen sich nur parametrisch (Kategorie), nicht je Waffe. Eine Waffe ohne Korrektur-Eintrag sieht aus wie ihre Kategorie.
3. **Einschlag und Effekte:** Rauchring und Flamme gibt es nur als Skript, nicht im Repo; die 19 isometrischen Biom-Objekt-Sheets sind bewusst nicht eingebaut.
4. **Messung:** Es gibt keine automatische Prüfung, ob eine Animation im Spiel „gut aussieht", nur ob sie sichtbar und im Größenbereich ist (`figuren-sichtbarkeit`, `dynamik`).

**Mögliche nächste Schritte:** (a) fehlende Emotionen für Nicht-Humanoide mit besserem Verfahren, (b) Waffen-Korrekturen je ID für die Dubletten (so unterscheiden sie sich auch sichtbar), (c) Rauchring und Flamme als Sheet ins Repo.
