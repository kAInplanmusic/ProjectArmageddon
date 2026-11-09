# Native 4K-Kulissen – Produktionsplan, Auslieferung und Abnahme (A17–A22)

Stand: 09.11.2026 · Branch `bg/kulissen-4k` · Ausgangspunkt `main` @ `67684f7`

Dieses Dokument ist **Vorarbeit**. Es wurden keine Kulissenbilder erzeugt, keine
bezahlten APIs aufgerufen und keine 4K-Assets abgelegt. Beschrieben sind der
Produktionsweg, die technischen Grenzen und die Abnahmekriterien; die
Client-Mechanik für Auswahl, Vorladen und Freigabe ist prototypisch umgesetzt
und getestet.

## 0. Ausgangslage

- 272 WebP-Kulissen in `src/client/assets/backdrops/` und `backdrops-neu/`,
  zusammen ~24,3 MiB. Kein Bild erreicht 3840×2160: 80 Bilder sind 1280×720,
  die übrigen meist bis 1440 px; die neuen 48 liegen bei 1536×672 oder
  768×1344.
- Ein 3840×2160-Bild belegt als RGBA8 entpackt 31,6 MiB. Das ist Rohspeicher,
  nicht der Browser-Gesamtspeicher; Kulisse, Terrain, Wasser und Effekte
  addieren sich.
- Der Renderer zeichnet die Kulisse in Weltkoordinaten (`renderer.width`), die
  Figuren und das Terrain liegen darüber. Quellenauflösung, Bildschirmausgabe
  und Simulationsraster sind getrennte Größen.
- Bestehende Sättigungs- und Abdunkelungswerte waren global (Deckel 0,45,
  Verlauf 0/0,28/0,55). Sie sind jetzt je Lichtklasse kalibrierbar (A19).

Grundsätze:

1. **Keine Hochskalierung als 4K ausgeben.** Eine 1440er Datei bleibt eine
   1440er Datei. Eine 3840er Fassung entsteht nur aus einer Quelle, die
   mindestens 3840 px breit gerendert oder gemalt wurde.
2. **Ein Bild pro Stufe, nicht pro Gerät.** Die Stufen 1280/1920/2560/3840
   sind die einzigen Quellen; alles andere ist Zuschnitt und Skalierung im
   Client.
3. **Die 1280er Basis bleibt lieferbar.** Fehlt eine Großfassung, fällt der
   Client auf die Basisdatei zurück — spielbar, nur weicher.

## A17 – Produktionsplan native 3840×2160

### A17.1 Technische Spezifikation je Bild

| Merkmal | Vorgabe | Prüfung |
|---|---|---|
| Auflösung | 3840 × 2160 px, exakt 16:9 | `identify`/Decoder-Ausgabe |
| Quelle | nativ ≥ 3840 px breit gerendert/gemalt, nicht interpoliert | Dokumentation der Renderauflösung + Kantenmessung |
| Farbraum | sRGB, 8 Bit je Kanal (HDR-Master separat, siehe A21) | ICC-Profil / Pixelwerte |
| Horizont | 47–53 % der Bildhöhe; Gelände bedeckt die untere Hälfte | Messung der Helligkeitskante |
| Komposition | Landmarken und Himmel in den oberen zwei Dritteln; unteres Drittel ruhig | Sichtprüfung + Maskenüberlagerung |
| Licht | eine Hauptrichtung, links oben; Schatten fallen nach rechts unten | Sichtprüfung, Schattenwinkel |
| Spielfläche | mittlere Leuchtdichte unten ≤ 0,35; keine ausgefressenen weißen Flächen hinter Figuren | Luminanzprobe 64×36 + Kontrast (A19) |
| Text | keine Schrift, kein Wasserzeichen, keine UI, kein Rahmen | Sichtprüfung bei 100 % |
| Datei | WebP q82–88 oder AVIF; 0,5–2 MB je 4K-Bild | `ls -l`, Qualitätsvergleich |
| Benennung | `<biom>_<variante>-3840.webp` | Katalogtest |

Der Horizontwert folgt `TERRAIN_COVERAGE = 0.47` aus
`src/shared/config/backdrops.js`; die Kulisse muss dort ansetzen, wo das
prozedurale Gelände beginnt.

### A17.2 Sechs Referenzbiome (Reihenfolge = Produktionsreihenfolge)

Zuerst sechs Bilder, die die schwierigsten Lichtsituationen abdecken. Erst nach
deren Abnahme werden die übrigen Varianten produziert.

| # | Referenz | Vorhandenes Biom / Variante | Motiv und Licht | Abnahmeschwerpunkt |
|---|---|---|---|---|
| 1 | **Schnee** | `alpine/winter_snow` | verschneite Grate, tiefe Sonne links oben, blauer Schneeschatten | weiße Flächen ohne Ausfressen, dunkle Figurenkontur lesbar |
| 2 | **Wald** | `forest/autumn_forest` | dichter Mischwald, gefiltertes Licht, warmer Mittelgrund | Grün bleibt grün, keine Matschzone; Figuren vor Blattwerk |
| 3 | **Wüste** | `western/desert_town` | Sandstein, harte Schatten, Staubdunst am Horizont | Sandton kippt nicht ins Orange; Kontrastkante unten |
| 4 | **Lava** | `caverns/lava_tube` | Basaltwände, Glutfluss als einzige Lichtquelle, Funken | Glut bleibt gesättigt, Schwarz crush nicht; Figuren vor Glut |
| 5 | **Stadt** | `urban/industrial_ruins` | Industriehafen bei Dämmerung, kaltes Restlicht, warme Fenster | Neon/Fenster nur oberhalb der Spielfläche; Silhouetten klar |
| 6 | **Nacht** | `noir/rainy_street` | regennasse Straße, Mondlicht links oben, wenige kalte Akzente | dunkle Kulisse wird nicht weiter abgedunkelt; Figuren über Helligkeit getrennt |

Die sechs Bilder werden **gegen die vorhandenen Varianten** derselben Kennung
geprüft (gleiche Stimmung, gleicher Ausschnitt, nur höhere Auflösung und
besseres Licht). Ein Wechsel des Motivs ist eine Designentscheidung und wird
getrennt begründet.

### A17.3 Produktionsweg je Bild

1. **Konzept:** Motiv, Horizontlinie, Lichtrichtung, drei Tiefenebenen
   (Himmel/Fern, Mittelgrund/Landmarken, ruhiger unterer Streifen) als Skizze.
   Vorlagen: vorhandene Variante + `COMPOSITION_SUFFIX` in
   `src/shared/config/backdrops.js`.
2. **Blockout:** graue Massen mit korrektem Horizont (47–53 %) und
   Landmarkenposition; als Overlay gegen den Terrainverlauf prüfen.
3. **Ausarbeitung:** native Render- oder Malfläche ≥ 3840×2160. Bei
   3D-Renderings: Kamera 16:9, Ausgabe mindestens 3840 px, kein Upscale im
   Compositor. Bei Malerei: Arbeitsfläche 4096×2304, Export auf 3840×2160
   heruntergerechnet (Downsampling ist zulässig, Upscaling nicht).
4. **Grading:** Weißpunkt, Schwarzwert, Sättigung je Lichtklasse (A19);
   Histogramm prüfen, keine geclippten Lichter im unteren Drittel.
5. **Export:** WebP q82–88, Metadaten entfernen; optional AVIF als zweite
   Quelle für spätere Auslieferung.
6. **QA:** Auflösung, Dateigröße, Horizont, Textfreiheit, 100-%-Ansicht auf
   4K-Monitor und auf 1080p herunterskaliert.

### A17.4 Kein Hochskalieren – belegbar

Ein Bild gilt nur dann als native 4K-Fassung, wenn alle drei Nachweise
vorliegen:

- **Quelle:** dokumentierte Render-/Malauflösung ≥ 3840 px Breite.
- **Kantenenergie:** Hochfrequenzanteil (z. B. Laplace-Varianz) im 1:1-Ausschnitt
  liegt im Bereich der nativen Referenz, nicht bei einem weichgerechneten
  1440er Bild. Ein 1440→3840-Upscale hat typisch deutlich weniger
  Hochfrequenzenergie und weiche Kanten.
- **Sichtprüfung:** 100-%-Ausschnitt einer Kante (Fels, Dach, Ast) zeigt
  Einzelpixelstruktur, keine Treppen aus Interpolation.

Die Prüfung wird je Bild in der Abnahmeliste vermerkt (Pfad, Quellauflösung,
Messwert). Ein Bild ohne Nachweis bleibt auf 1280/1920 und wird nicht als 3840
ausgeliefert.

### A17.5 Weitere Biome nach der Referenzabnahme

Reihenfolge nach Sichtbarkeit und Kontrastrisiko:

1. `maritime` (Wasser/Himmel, viele Varianten)
2. `open` (helle Weite, Lesbarkeit)
3. `spires` (Hochgebirge, Schnee-Nachbar)
4. `island` (helle Strände)
5. `deluge` (Wasser/Überschwemmung)
6. `warren` (enge dunkle Gänge)
7. `cosmos` (dunkel, Sterne)
8. `abstract`, `fantasy`, `hyperreal` (Sonderfälle, zuletzt)

Nicht jede der zehn Varianten je Biom braucht eine 4K-Fassung. Behalten wird,
was einen sichtbaren Gewinn bringt; Stimmungsvarianten mit weichem Verlauf
(Regen, Nebel) verlieren am wenigsten durch 1920.

### A17.6 Abnahmekriterien A17

- [ ] Bild dekodiert exakt zu 3840×2160, Seitenverhältnis 16:9 (±1 px).
- [ ] Quellauflösung ≥ 3840 px dokumentiert; kein Upscale-Nachweis offen.
- [ ] Horizont zwischen 47 % und 53 % der Höhe; unteres Drittel ruhig.
- [ ] Hauptlicht aus links oben, Schattenrichtung konsistent.
- [ ] Keine Schrift, kein Wasserzeichen, keine UI, kein Rahmen.
- [ ] Dateigröße 0,5–2 MB (WebP/AVIF), keine sichtbaren Kompressionsblöcke
      bei 100 %.
- [ ] Spielfläche: Figurensilhouette erreicht mindestens 3:1 Kontrast zur
      Kulisse an der Standlinie (A19 `lesbarkeitsHinweis`).
- [ ] Gegen die vorhandene 1280er Variante gesichtet: gleiche Stimmung,
      gleicher Ausschnitt, nur höhere Auflösung/besseres Licht.
- [ ] Auf 1080p herunterskaliert keine harten Halos oder Doppelkanten.

## A18 – Responsive Kulissenwahl

### Stufen und Regeln

| Stufe | Datei | Einsatz |
|---|---|---|
| 1280 | Basisdatei (unverändert) | kleine Fenster, Lite-Geräte, Rückfall |
| 1920 | `<name>-1920.webp` | 1080p-Displays, DPR 1–1,5 |
| 2560 | `<name>-2560.webp` | 1440p/Retina-Notebooks, DPR 2 bei 1280 CSS |
| 3840 | `<name>-3840.webp` | 4K-Displays, DPR 2 bei 1920 CSS |

Auswahl: `Bedarf = sichtbare CSS-Breite × min(DPR, 2)`, dann die kleinste Stufe
≥ Bedarf, begrenzt durch die Geräteleistung:

- Grafikstufe `lite`, ≤ 2 Kerne oder ≤ 2 GB → höchstens 1920
- ≤ 4 Kerne oder ≤ 4 GB → höchstens 2560
- sonst → 3840

DPR über 2 wird nicht vergrößert: der sichtbare Gewinn ist gering, der
Speicherbedarf steigt linear (31,6 MiB je 4K-RGBA8).

### Vorladen und Freigeben

- Im Speicher bleiben **die aktuelle und höchstens eine vorgeladene Variante**
  (`KulissenBildspeicher`, Obergrenze 2). Ein Katalog-Vorladen aller Varianten
  findet nicht statt.
- Beim Wechsel werden alte Bildverweise, Warteschlangen und die
  zusammengesetzte Kulissenfläche (`kulissenCache`) gelöscht. Der Browser gibt
  den Speicher danach frei; erzwingen lässt sich das von JavaScript aus nicht.
- Fehlt die gewählte Großfassung, wird die Basisdatei geladen (Rückfall), ohne
  erneut zu skalieren.

### Umsetzung

- `src/client/kulissenQuelle.js`: Stufen, DPR-Deckel, Leistungsgrenze,
  Dateinamen, Kandidaten, Vorladeplan, Bildspeicher.
- `src/client/kulissenUrls.js`: ein `kulissenUrl(name)` für alle drei Ordner.
- `src/client/renderer.js`: wählt die Breite beim Setzen der Kulisse, lädt mit
  Rückfall, hält den Speicher bei zwei Einträgen. Ändert sich die sichtbare
  Breite um mehr als 32 px (Fenster, Drehung), wird die Quellstufe neu gewählt;
  das alte Bild bleibt bis zum neuen stehen.
- `src/client/main.js`: übergibt die vorhandene Gerätemessung der Grafikstufe;
  keine zweite Messung.

### Abnahmekriterien A18

- [ ] 1280-CSS-Fenster/DPR 1 lädt die Basisdatei; DPR 2 lädt 2560.
- [ ] 4K-Fenster/DPR 1 lädt 3840; 1920-CSS/DPR 2 lädt 3840.
- [ ] Lite-Gerät lädt nie 3840 (auch wenn das Fenster es verlangt).
- [ ] Nach einem Kulissenwechsel existiert höchstens ein Bild im Speicher
      (plus optional eine vorgeladene Variante).
- [ ] Fehlende Großfassung führt zum Basisbild, nicht zu einer leeren Kulisse.
- [ ] Netzwerk-Panel zeigt genau eine Bildanfrage je Kulisse, nicht vier.

## A19 – Licht und Sättigung je Biom

Klassen und Startwerte (`src/client/kulissenLicht.js`):

| Klasse | Sättigungsdeckel | Abdunkelung unten | Licht | Besonderheit |
|---|---:|---:|---|---|
| Schnee | 0,30 | 0,58 | links oben, kalt | weiße Flächen brauchen Tiefe |
| Wald | 0,45 | 0,55 | links oben, gefiltert | Grün nicht entsättigen |
| Wüste | 0,36 | 0,60 | links oben, warm | harte Schattenkante |
| Lava | 0,50 | 0,56 | Glut von unten | Glut bleibt gesättigt |
| Stadt | 0,40 | 0,56 | links oben, gemischt | Neon nur oberhalb des Terrains |
| Nacht | 0,32 | 0,48 | Mond links oben | nicht weiter abdunkeln |
| Standard | 0,45 | 0,55 | links oben | bisheriges Verhalten |

Zuordnung: Variantenname vor Biom (`caverns/lava_tube` → Lava,
`maritime/arctic_ice` → Schnee, `maritime/storm_night` → Nacht). Eine dunkle
Stimmung macht aus einem Wald keine Nacht (`forest/stimmung_dunkel` bleibt
Wald).

Kalibrierung ist eine Sichtentscheidung, keine Messzusage. Abnahme:

- [ ] Vor jedem der sechs Referenzbilder sind Figuren, Lebensbalken, Munition
      und Zuganzeige bei 1080p und 4K lesbar.
- [ ] Figurenkontrast an der Standlinie ≥ 3:1 (Formel in `kulissenLicht.js`).
- [ ] Schnee/Wüste: keine ausgefressenen Flächen hinter Figuren; unten
      mindestens 0,56 Alpha Abdunkelung.
- [ ] Lava: Glutfarbe bleibt gesättigt, Basalt behält Struktur (kein Crush).
- [ ] Nacht: Kulisse bleibt erkennbar; Trennung erfolgt über Helligkeit/Aura,
      nicht über noch mehr Schwarz.
- [ ] Zwei Spieler mit gleicher Fraktion sind vor jedem Hintergrund an Ring,
      Name und Marker unterscheidbar (Teamfarbe getrennt von Fraktionsfarbe).

## A20 – Terrain und Items: erwachsener Abenteuercomic

Ziel ist kein fotorealistisches Gelände. Die Kulisse ist fotoreal und
filmisch; Terrain und Requisiten sind **gezeichnet**, scharf konturiert und
materialklar. Die gemeinsame Klammer: Licht von links oben, dieselbe
Schattenrichtung, Kontakt zum Boden, gleiche Bildschärfe.

### Gestaltungsregeln

| Element | Regel |
|---|---|
| Kontur | 2–3 px dunkle Kontur bei 1080p-Referenz; skaliert mit der Zoomstufe, nicht mit der Textur |
| Bruchkanten | 2–3 gerade Facetten je Bruch, keine runden „Löcher“; Splitter zeigen Materialquerschnitt |
| Material | Stein: körnig, harte Kanten; Holz: Faser längs, splittrig quer; Metall: kalt, gerichtete Glanzkante; Eis: klare Sprödbruchflächen; Basalt: säulig, stumpf; Sand: weiche Böschung, keine Kanten |
| Textur | feine Körnung nur im Material, nicht als Rauschen über die ganze Fläche |
| Requisiten | 10–20 % überzeichnet (Überlänge, Übergröße), aber funktional erkennbar |
| Licht | eine Hauptlichtrichtung, harte Schattenkante, kein Ambient-Brei |
| Figuren | starke Silhouette, dunkle Kontur; keine fotorealistischen Mikroporen bei 40–80 sichtbaren Pixeln |

### Materialunterschiede im Graustufenbild

Jedes Material muss auch ohne Farbe erkennbar sein:

- Stein: mittlere Helligkeit, gebrochene Kanten, wenige große Flächen.
- Holz: helle Längsstreifen, dunkle Fugen, splitternde Enden.
- Metall: dunkle Grundfläche, eine helle gerichtete Kante, Nieten.
- Eis: sehr hell, bläuliche Schatten, muscheliger Bruch.
- Basalt: dunkel, säulige Struktur, stumpfe Kanten.
- Sand: hell, weiche Böschung, keine scharfe Kante.

Die optischen Materialfelder (`glanz`, `textur`, `kontur`, `bruch`) stehen
bereits in `src/shared/config/stoffe.js` bzw. `stoffe-biome/`. A20 füllt sie
redaktionell und zeichnerisch, erfindet aber keine zweite Materialtabelle.

### Abnahmekriterien A20

- [ ] Terrain, Krater und Requisiten haben sichtbare dunkle Konturen bei
      1080p und 4K.
- [ ] Ein Krater zeigt Materialquerschnitt (innen anders als Oberfläche), nicht
      nur eine dunkle Ellipse.
- [ ] Materialien sind im Graustufen-Screenshot unterscheidbar (mindestens
      Stein/Holz/Metall).
- [ ] Kein Objekt wirkt fotorealistischer als die Figuren; keine
      Mikrotexturen, die bei Spielgröße zu Rauschen werden.
- [ ] Licht- und Schattenrichtung stimmen mit der Kulisse überein.
- [ ] Requisiten bleiben in der Trefferfläche, die sie optisch behaupten
      (keine größere Silhouette als Kollision).

## A21 – HDR als optionaler Pfad (Spezifikation, keine Zusage)

HDR ist **nicht** Teil der 4K-Abnahme. 4K-Auflösung und Display-P3-Farbraum
allein ergeben kein HDR; ein SDR-Bild in P3 bleibt SDR.

### Kette (alle vier Glieder nötig)

1. **Inhalt:** Master mit linearem Licht und Werten über 1,0, mindestens
   10 Bit je Kanal. Der bestehende 8-Bit-sRGB-Weg bleibt der SDR-Master.
2. **Übertragung:** PQ (SMPTE ST 2084) oder HLG, im Container als HDR
   gekennzeichnet (AVIF 10 Bit oder PNG 16 Bit als Zwischenstufe).
3. **Compositing:** Canvas/GPU gibt den erweiterten Bereich tatsächlich aus.
   `getContext('2d', { colorSpace: 'display-p3' })` ist nur der Farbraum; der
   zurückgelesene `colorSpace` muss `display-p3` sein, sonst SDR.
4. **Anzeige:** Betriebssystem und Display melden
   `(dynamic-range: high)` und geben den Bereich ungetont aus.

### Rückfall

- Standard ist und bleibt SDR. Der HDR-Pfad ist eine ausdrückliche Wahl
  (Opt-in), keine automatische Umschaltung.
- Fällt ein Glied aus, wird derselbe Bildinhalt SDR-tone-gemappt
  (Reinhard) ausgegeben. Der SDR-Pfad muss identisch zum heutigen Bild sein.
- Keine Behauptung „HDR“ auf Grund einer Dateiendung, einer Media Query oder
  eines P3-Screenshots.

### Prototyp (Code)

`src/client/hdrPfad.js` prüft die Kette und liefert `sdr` oder `hdr-p3` samt
Gründen; `pruefeCanvasFarbraum` liest den tatsächlichen Farbraum zurück;
`liesDynamikBereich` behandelt Fehler als Standard. Tests:
`tests/hdr-pfad.test.js`.

### Abnahmekriterien A21 (falls der Pfad weiterverfolgt wird)

- [ ] Referenzszene (Lava + Schnee) als SDR- und HDR-Master vorhanden.
- [ ] Auf jedem Zielgerät (OS/Display-Kombination) wird entweder korrekt HDR
      oder korrekt SDR gezeigt — nie ein falsch getontes Zwischenbild.
- [ ] SDR-Fallback ist pixelgleich zum heutigen SDR-Bild (Toleranz nach
      Tone-Mapping dokumentiert).
- [ ] Kein erhöhter Speicherbedarf im Standardpfad; HDR nur auf Opt-in.
- [ ] Ergebnisoffen: Ein negatives Ergebnis („auf diesen Geräten kein
      verlässliches HDR“) ist ein gültiges Ergebnis.

## A22 – Testmatrix vor der Abnahme

Jede Zelle wird mit Beweismittel festgehalten (Screenshot, Messwert,
Netzwerk-Protokoll). „Nicht geprüft“ ist kein Bestehen.

### Kernmatrix

| # | Szenario | Auflösung | Gerät/Browser | Biomes | Prüfung |
|---|---|---|---|---|---|
| 1 | 2 Spieler, **gleiche Fraktion** | 1920×1080 | Desktop/Chrome | Schnee, Wald | Ring, Name, Marker unterscheidbar; Figur doppelt sichtbar |
| 2 | 2 Spieler, gleiche Fraktion | 3840×2160 | Desktop/Chrome | Lava, Nacht | dito; Kontrast vor Glut/Dunkelheit |
| 3 | Zoom **min** | 1920×1080 | Desktop/Chrome | alle vier | Figuren nicht zu klein, Kontur lesbar, Kulisse nicht dominant |
| 4 | Zoom **max** | 1920×1080 | Desktop/Chrome | alle vier | keine weichen/verpixelten Kulissenkanten, HUD frei |
| 5 | Zoom min/max | 3840×2160 | Desktop/Chrome | Schnee, Lava | Quellstufe 3840 geladen, Speicher ≤ 2 Bilder |
| 6 | Bewegung (Gehen, Sprung, Treffer) | 1920×1080 | Desktop/Chrome | Schnee, Lava, Nacht, Grün | Silhouette bleibt lesbar, keine Schlieren |
| 7 | Wie 6 | 3840×2160 | Desktop/Chrome | Schnee, Lava, Nacht, Grün | dito bei 4K |
| 8 | Wie 6 | 390×844 (CSS) | **iPhone/Safari** | Schnee, Lava, Nacht, Grün | DPR-Deckel greift (≤2560), kein Speicherabbruch, Kulisse fällt nicht auf 1280 zurück, wenn 1920 sinnvoll |
| 9 | Menü → Match → Menü → neues Match | 1920×1080 | Desktop/Chrome | zwei verschiedene | alte Kulisse freigegeben, keine kumulierenden Bildanfragen |

Biome der Kernmatrix: **Schnee** = `alpine/winter_snow`, **Grün** =
`forest/autumn_forest`, **Lava** = `caverns/lava_tube`, **Nacht** =
`noir/rainy_street`. Zusätzlich die drei weiteren Referenzen Wüste, Stadt.

### Geräte und Randbedingungen

| Gerät | Browser | Auflösung | Was dort anders ist |
|---|---|---|---|
| Desktop 1080p | Chrome | 1920×1080, DPR 1 | Referenzfall; 1920er Quelle |
| Desktop 4K | Chrome | 3840×2160, DPR 1 | 3840er Quelle, 31,6 MiB je Bild |
| Retina-Notebook | Chrome/Safari | 1440–1728 CSS, DPR 2 | 2560/3840, Speicherdruck |
| iPhone | Safari | 390–430 CSS, DPR 3 | DPR-Deckel 2, Canvas-Grenzen, wenig RAM |
| Desktop | Firefox | 1920×1080 | Canvas-Filter, `colorSpace`-Abfrage |

Safari/iPhone ist **manuell** zu prüfen; Playwright/Chromium ersetzt das nicht
(iOS-Safari nutzt eine andere Engine). Ein Chromium-Screenshot bei
`deviceScaleFactor: 3` belegt nur die DPR-Rechnung, nicht das Gerät.

### Ablauf je Zelle

1. Match mit festem Seed und zwei Spielern derselben Fraktion starten.
2. Kulisse über `backdropKey` fest wählen; warten bis `backdropReady`.
3. Zoom auf Minimum, dann Maximum; je Zustand Screenshot.
4. Bewegung auslösen (Gehen, Sprung, Treffer), Screenshot im Trefferbild.
5. Netzwerk: Anzahl Bildanfragen und geladene Stufe notieren.
6. Speicher: `renderer.kulissenBilder.groesse` ≤ 2, keine alten Bilder.
7. Ergebnis in der Abnahmeliste eintragen (bestanden / Befund / nicht geprüft).

### Abnahmekriterien A22

- [ ] Alle neun Kernzellen geprüft; keine Zelle „nicht geprüft“.
- [ ] Zwei Spieler gleicher Fraktion in jeder Zelle unterscheidbar.
- [ ] Bei Zoom min/max keine Kulissenkante sichtbar weich oder verpixelt.
- [ ] 1080p lädt höchstens 2560, 4K höchstens 3840; Lite-Gerät höchstens 1920.
- [ ] iPhone/Safari: kein Absturz, kein Speicher-Abbruch, Kulisse sichtbar.
- [ ] Nach Matchwechsel ist die alte Kulisse freigegeben.

## 9. Reihenfolge der Umsetzung

1. Sechs Referenzkulissen nativ produzieren und nach A17.6 abnehmen.
2. Adaptive Auslieferung mit den sechs Bildern auf Desktop und iPhone messen
   (A18), Speicher und Ladezeit protokollieren.
3. Licht/Sättigung je Referenzbild nachziehen (A19) und die Werte tabelle
   festschreiben.
4. Terrain/Item-Stilregeln (A20) an einer Karte umsetzen und gegen die
   Referenzkulisse prüfen.
5. Übrige aktive Biome in der Reihenfolge A17.5 produzieren.
6. A22 vollständig abnehmen; erst danach ist „4K“ eine belegte Aussage.
7. HDR (A21) bleibt ein separater, ergebnisoffener Prototyp.

## 10. Offene Punkte

- Es liegen **keine** 4K-Bilder vor; alle Aussagen zu Schärfe und
  Speicherverbrauch sind Rechnungen und Prototypen, keine Endgerätemessung.
- Die Leistungsgrenzen (Kerne/Speicher) sind konservative Startwerte, nicht
  gemessen. Sie werden nach den ersten Gerätemessungen angepasst.
- Safari/iPhone und ein echtes 4K-Display standen für diesen Stand nicht zur
  Verfügung; die Matrix ist vorbereitet, nicht ausgeführt.
- Ob 1920 für Stimmungsvarianten mit weichem Verlauf ausreicht, entscheidet
  die Sichtprüfung, nicht die Dateigröße.
