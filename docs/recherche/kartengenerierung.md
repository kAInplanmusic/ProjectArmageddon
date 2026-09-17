# Prozedurale Kartengenerierung für 2D-Artillerie-Spiele — Recherchebericht

Stand: September 2026. Ziel: Bestandsaufnahme mit prüfbaren Quellen für einen
Browser-Worms-Klon (JS/ESM, Canvas 2D, 1D-Höhenfeld, zerstörbar, PRNG mit Seed).

**Wichtige Vorab-Einordnung:** Fast alle guten Artillerie-Terrain-Generatoren
arbeiten **2D-pixelbasiert (Collision-Mask als Bitmap)**, *nicht* als
1D-Höhenfeld. Ein 1D-Höhenfeld kann per Definition keine Höhlen, Tunnels,
Überhänge und schwebenden Inseln darstellen. Der Nutzer will genau diese
Features. Dazu muss der Motor **von 1D auf 2D-Maske verbreitert** werden —
das ist die Kernentscheidung, um die sich alle Empfehlungen drehen.

---

## 1) Algorithmen & Grundlagen

### 1.1 Hedgewars Perlin-Generator — die vollständige, konkrete Formel
Hedgewars' `mgPerlin`-Generator ist der einzige quelloffene Artillerie-
Generator, dessen exakte Formel öffentlich einsehbar ist.

- Quelle (Original, Pascal): https://github.com/hedgewars/hw/blob/master/hedgewars/uLandGenPerlin.pas
- Arbeitskopie lokal: `/tmp/hw_research/hedgewars_uLandGenPerlin.pas`

**Der Kern (Zeile 184 des Originals — das ist der ganze Trick):**

```
r = ((abs(inoise(di, dj)) + y*4) mod 65536 - (height - y) * 8) div 256
```

und dann:
```
if r < rCutoff  -> Luft (0)
else if param1 = 0 -> lfObjMask   (Tunnel/Sand-Durchlauf, wird in zweitem
                                   Pass entfernt -> ergibt Höhlen!)
else            -> lfBasic        (solides Land)
```

- `di = df * y / height`, `dj = df * x / width` — normale Perlin-Skalierung
- `+ y*4` ist ein **vertikaler Gradient**: weiter unten wird der Wert größer →
  mehr Land am Boden (Klassisches "Luft oben, Erde unten")
- `- (height - y) * 8` zieht **die Hälfte der Höhe als Bias** ab → die
  Wasserlinie / Grundform entsteht
- `rCutoff = min(max((26 - cFeatureSize) * 4, 15), 85)` — der Benutzer-Regler
  "Feature Size" (1–25) steuert die Detaildichte; KEIN Threshold-Slider im
  UI, sondern direkt gemappt
- `margin = 200`: am linken/rechten Rand wird per `r -= abs(x - width/2) + width/2 - margin`
  ein **Rand-Fade** angewendet → Inseln laufen sauber aus, ohne abrupte Kante.
  Das ist genau der "Taper"-Effekt, den Worms-Fans suchen.
- `param1 = cTemplateFilter div 3`, `param2 = cTemplateFilter mod 3`:
  param1 wählt den Modus (0 = Tunnel, 1 = Inseln), param2 die Größe
  (klein/mittel/groß). Hedgewars beeinflusst damit auch **MaxHedgehogs**
  (geschätzte maximale Spielerzahl) — nützlich für Balance-Checks.

**Wichtige Erkenntnis:** Hedgewars' Perlin-Generator nutzt die Land-Flags
`lfObjMask` (wird nach dem Füllen entfernt) und `lfBasic`. Der zweite Pass
(Zeile 216–226) füllt von unten nach oben und strippt dann alle ObjMask-Pixel
→ so entstehen **Tunnels und Löcher**, die aus einem reinen Höhenfeld nie
kämen. Das ist genau das Muster für "Höhlen aus einem Noise-Feld".

### 1.2 Hedgewars' vollständige Generator-Taxonomie
Aus `hedgewars/uLand.pas`, `procedure GenMap` (Dispatch des `cMapGen`-Enums):

| Enum | Aufruf | Verfahren | Lizenz-Erbe |
|---|---|---|---|
| `mgRandom` | `GenerateOutlineTemplatedLand(...)` | **Outline-Template + Distort + Bezier** (Standard!) | GPLv2 |
| `mgMaze` | `GenerateMazeLand(...)` | Maze-Generator (Rust, s. 1.5) | GPLv2 |
| `mgPerlin` | `ResizeLand(4096,2048); GenPerlin;` | 1D-artiges Perlin (s. 1.1) | GPLv2 |
| `mgDrawn` | `GenDrawnMap;` | Handgezeichnet | GPLv2 |
| `mgForts` | `MakeFortsMap();` | Symmetrische Festungen | GPLv2 |
| `mgWfc` | `GenerateWfcTemplatedLand(...)` | **Wave Function Collapse auf Templates** | GPLv2 |

Quelle: https://github.com/hedgewars/hw/blob/master/hedgewars/uLand.pas
- Alle Generatoren erzeugen **Byte-Masken** (`LandGet`/`LandSet`), keine
  1D-Arrays. Größe 4096×2048 (Perlin) bzw. `LAND_WIDTH`/`LAND_HEIGHT`.
- `WorldEdge = weNone/weBounce/weWrap` + `hasBorder` → erzeugt unzerstörbaren
  Rand (Kachelung schwarz-gelb). Direkt übernehmbar für den Mahlstrom.

### 1.3 Outline-Template + Distort + Bezier — der Qualitäts-Bring­er
Das ist der **beste Einzel-Fund** für "richtig gut". Ablauf (aus
`rust/landgen/src/outline_template_based/template_based.rs` + `outline.rs`):

1. Template = Liste von Polygonen (`islands`), Mauer-Polygonen (`walls`) und
   Füllpunkten (`fill_points`), definiert in einem `play_box`-Rechteck.
2. `from_outline_template`: Jeder Template-Punkt wird mit einem Zufallsanteil
   zwischen zwei Template-Eckpunkten interpoliert
   (`play_box.top_left() + rect.quotient(rnd_a, rnd_b)`) → **Varianz**.
3. `can_mirror` / `can_flip`: 50 %-Chance pro Achse → 4 Layout-Varianten aus
   einem Template.
4. `points.distort(distance_divisor, distortion_limiting_factor, rng)`:
   **Rekursives Unterteilen jeder Kante**, solange die Gesamtlänge wächst
   (`divide_edges` in einer `loop`, bis `total_len()` konstant bleibt).
   `distortion_limiting_factor = 100 + rng.gen_range(0..8) * 10` — harte
   Begrenzung, damit Kanten nicht durch andere Polygone stoßen.
5. `points.bezierize(5)`: Ersetzt jede Polygonkante durch eine **Bézier-Kurve
   mit 5 Segmenten** → weiche, organische Worms-Konturen statt Pixel-Treppen.
6. `points.draw(&mut land, zero)` → Außenlinien, dann
   `land.fill(*p, zero, zero)` von jedem Fill-Point aus (Floodfill!),
   dann nochmal `draw(..., basic)` → geschlossene Form.

Quellen:
- https://github.com/hedgewars/hw/blob/master/rust/landgen/src/outline_template_based/template_based.rs
- https://github.com/hedgewars/hw/blob/master/rust/landgen/src/outline_template_based/outline.rs
- Lokale Kopien: `/tmp/hw_research/r_template_based.rs`, `/tmp/hw_research/landgen_outline.rs`

**Warum das für den Nutzer wichtig ist:** Das ist **deterministisch,
seed-fähig** (jede Zufallsentscheidung läuft über `&mut impl Rng`) und liefert
per Konstruktion Höhlen (invertierte Templates, `is_negative`), Inseln
(`add_island`) und Mehrkomponenten-Karten. Der Bezier-Schritt ist der
entscheidende "sieht gut aus"-Faktor gegenüber purem Noise.

### 1.4 Worms-Stil mit Simplex-Noise (Blog, beste Lehrdarstellung)
Julian Fietkau, 26.07.2023 — der ausführlichste öffentliche Artikel zum Thema.
- URL: https://fietkau.blog/2023/generating_terrain_simplex_noise
- Arbeitskopie: `/home/patrick/.hermes/cache/web/fietkau.blog-921161932b.md`
- Inhalt: 2D-Simplex → `frequency`/`threshold`/`fade`-Parameter;
  `fade` = vertikaler Bias (oben Luft, unten Erde); Collision-Mask getrennt
  von Visuals; Texturierung + Highlight-System für Oberflächenkanten.
- Genutzt Bibliothek: josephg/noisejs (Public Domain / ISC).
- Der Autor stellt im Fazit **exakt** die Fragen, die hier offen sind:
  "How could the fade function be modified to make sure left/right sides are
  solid?" und "how would you blow a circular hole into the terrain?" — der
  Artikel ist also die Grundlage, die Hedgewars' zweiter Pass (1.1) löst.

### 1.5 Maze-Generator (Rust) — Tunnelsysteme
- https://github.com/hedgewars/hw/blob/master/rust/landgen/src/maze.rs
- Parameter: `cell_size`, `inverted` (Tunnel statt Wände), `braidness`
  (wie viele Sackgassen entfernt werden → "Durchgängigkeit"),
  `distortion_limiting_factor`.
- Nutzt einen **Growing-Tree/Maze-Algorithmus** über `Vec2D`-Zellen, mit
  `came_from`/`last_cell`-Backtracking. Ergebnis: echte Tunnel-/Höhlennetze.
- **Wichtig für Balance:** `inverted` + `braidness` liefern "verbundene
  Höhlen", was bei Artillerie-Spielen sonst zu unerreichbaren Bereichen führt.

### 1.6 Wave Function Collapse auf Templates
- https://github.com/hedgewars/hw/blob/master/rust/landgen/src/wavefront_collapse/generator.rs
- Neue Methode (mgWfc). Nutzt WFC, um aus einem Set von Tile-Bildern
  (`tile_image.rs`) ein zusammenhängendes Terrain zu legen, mit
  `transform.rs` für Rotationen.
- **Ehrliche Einschätzung:** Für einen 30k-Zeilen-Klon mit 150 Waffen ist WFC
  **überdimensioniert**. WFC ist teuer, schwer deterministisch zu debuggen und
  liefert selten "funktionierende" Artillerie-Karten (Konnektivität ist nicht
  garantiert). Nur relevant, wenn der Nutzer ausdrücklich Designer-Kacheln
  statt Rauschen will.

### 1.7 Klassische kleine Algorithmen (die man selbst bauen kann)
- **Midpoint Displacement** (1D, für Scorched-Earth-artige Hügel):
  https://gamedev.stackexchange.com/questions/9384/how-do-i-generate-terrain-like-that-of-scorched-earth
  (Antwort mit Code-Link: http://www.gameprogrammer.com/fractal.html) —
  **passt exakt auf ein 1D-Höhenfeld**, aber liefert eben keine Höhlen.
- **Threshold + Connected Components + Dilate** (Worms-Inseln aus Perlin):
  https://gamedev.stackexchange.com/a/20606 — 2D-Perlin, Threshold (z.B.
  0.04), dann Zeilen von unten nach oben mit abnehmender Wahrscheinlichkeit
  "Inseln auswählen", dann Dilatation. Sehr elegante, kleine Lösung.
- **Pavlidis-Contour-Tracing + Chaikin-Curve-Smoothing + Bresenham + Floodfill**
  (kompletter Worms-Generator in 15 Schritten): https://bamboy360.com/blog/worms_level_generation/
  (Original-Thread: https://mastodon.gamedev.place/@bamboy/110561886431913180)
  — **Das ist die pragmatischste Bauanleitung**: grobes 40×20-Bool-Raster →
  Prim's MST verbindet Zufallspunkte → Bresenham zeichnet → Growth-Phase →
  auf 1200×600 hochskalieren → Kontur mit Zufalls-Offset verzerren →
  Chaikin glätten → Floodfill. Lizenz: Blog-Tutorial, kein Code-Repo.

---

## 2) JavaScript-Bibliotheken (alle geprüft)

| Paket | Version | Lizenz | Letzte Änderung | Nutzen |
|---|---|---|---|---|
| `simplex-noise` | 4.0.3 | **MIT** | 2024-07-26 | **Erste Wahl.** 2D/3D/4D, dependency-free, ~2 kB gzip, ~20 ns/Sample (70 Mio. 2D-Calls/s). Seed-fähig per eigener PRNG-Funktion. |
| `alea` | 1.0.1 | **MIT** | 2021-09-07 | Empfohlener Seed-PRNG-Partner für `simplex-noise` (`createNoise2D(alea(seed))`). Alte Version, aber stabil & winzig. |
| `fastnoise-lite` | 1.1.1 | **MIT** | 2024-03-05 | JS-Port von FastNoiseLite. Mehr Algorithmen (Value/Value-Cubic/Perlin/Simplex/Cellular/DomainWarp/Fractal). **Wichtig**: unterstützt **Value Noise mit frei wählbarer Dimension** — gut für echtes 1D-Höhenfeld. |
| `noisejs` (josephg) | – | ISC/PD | alt | Simplex2/3, Perlin2/3, `seed(val)` (nur 65536 Seeds!). Von Fietkau benutzt. ISC = unkritisch. |
| `THREE.Terrain` | – | MIT | – | 3D/Three.js-Engine — **passt nicht** (2D-Canvas, kein Three.js). Nur als Ideen-Quelle. |

`.npmrc`-Fakten verifiziert über `registry.npmjs.org`:
`simplex-noise@4.0.3 MIT`, `fastnoise-lite@1.1.1 MIT`, `alea@1.0.1 MIT`.

**Hinweis 1D:** Kein gepflegtes npm-Paket bietet speziell 1D-Wertrauschen mit
Fractal-Summation bequem an. `fastnoise-lite` kann es (Value-Noise-Algorithmus
ist dimensionsunabhängig), sonst: 1D-Wertrauschen ist ~30 Zeilen eigener Code
(Lerp zwischen Hash-Werten + Oktaven). Für Desync-Sicherheit gehört es an
denselben PRNG wie die Simulation.

---

## 3) Fertige Open-Source-Referenzen

### 3.1 HEDGEWARS — die beste Referenz (C++/Pascal + Rust)
- Repo: https://github.com/hedgewars/hw (offizieller GitHub-Spiegel; Hauptrepo
  ist Mercurial: https://hg.hedgewars.org/hedgewars/)
- **Lizenz: GNU GPL v2** (`COPYING`, verifiziert). Konsequenz: Code darf
  **gelesen und als Algorithmus-Vorlage genutzt** werden, aber **kein
  Copy-Paste in ein anders lizenziertes Projekt**. Bei privatem,
  nicht-kommerziellem Projekt praktisch unkritisch — die *Idee* eines
  Algorithmus ist ohnehin nicht urheberrechtlich geschützt, nur der Code.
  Empfehlung: Algorithmen **neu implementieren** in ESM und im Header
  "inspiriert von Hedgewars (GPLv2)" vermerken.
- Terrain-Größe 4096×2048, Bild-basierte Masken, `lfIndestructible`-Flag für
  Ränder, `WorldEdge`-Modi (`weBounce`/`weWrap`) — direkt relevant für den
  Mahlstrom.
- Rust-Module (moderner, lesbarer als Pascal):
  `rust/landgen/` (maze, outline_template_based, wavefront_collapse),
  `rust/mapgen/` (template: maze, outline, wfc; theme.rs).
- Wiki: https://hedgewars.org/wiki/Map (Map-Typen, Random/Perlin/Maze),
  https://hedgewars.org/wiki/terrain (Eis, Gummi, unzerstörbar als
  Terrain-**Flags** — Vorbild für Mehrkomponenten-Terrain!).

### 3.2 TerrainVer (JavaScript) — Worms-Stil, direkter Code-Nachbar
- Repo: https://github.com/juliango202/TerrainVer
- **Lizenz: MIT** (verifiziert; enthält ISC/BSD-2/MIT/Apache-2.0/LGPL-2.1
  Drittlibs, alle kommerziell nutzbar laut CREDITS.md).
- Was es macht: nimmt ein **Template-Bild** mit rot/blau/schwarz-Zonen,
  erzeugt daraus per Perlin-Noise (josephg/noisejs) eine Terrain-Maske;
  dazu ein `TerrainRenderer` mit Textur, Wasser-Animation, Rand und sogar
  kleinen Figuren. Parameter: `noiseResolution` (35),
  `noiseResolutionBlack` (18), `noiseThreshold` (20.0).
- **API** (ESM, direkt kompatibel mit dem Nutzer-Stack!):
  ```js
  import TerrainGenerator from './src/TerrainGenerator.js'
  TerrainGenerator.fromImgUrl({ terrainTypeImg, width, height,
    noiseResolution, noiseResolutionBlack, noiseThreshold })
    .then(g => g.generate(seed))
  ```
- **Achtung — zwei Probleme:**
  1. **Der Demo-Link ist tot.** `https://juliango202.com/terrainver/` ist
     inzwischen eine Casino-/iGaming-Spam-Seite (Domain verkauft). Nicht mehr
     als Referenz verlinken.
  2. Letzter Commit-Kontext: 41 Commits, 128 Stars, 11 Forks. Kein npm-Release
     — man muss die `src/*.js` direkt kopieren. Kein TypeScript, keine Tests.
- **Einschätzung:** Trotzdem der beste *direkt lauffähige* JS-Startpunkt für
  Worms-Terrain. Der Renderer (Rand + Wasser + Textur) spart echte Arbeit.

### 3.3 Weitere Artillerie-/Tunnel-Clones (kurz bewertet)
- **OpenLieroX** — https://github.com/openlierox/openlierox
  "Liero clone / Worms realtime / 2D shooter". Echtzeit, Pixel-Masken. GPL.
  Nützlich für Destruktions-/Masken-Handling, weniger für Level-Gen.
- **WebLiero** — FAQ: https://github.com/pilaf/webliero-faq
  Erwähnt: "The random map generator on WebLiero uses a different (improved)
  terrain generation algorithm; Maps in WebLiero can be mirrored" — d.h.
  **Mirroring als Level-Variation**: ein guter, billiger Kniff, den auch
  Hedgewars (`can_mirror`) nutzt.
- **Guntanks** (masag0) — https://github.com/masag0/Guntanks
  Vanilla JS, Canvas, zerstörbares Terrain via
  `globalCompositeOperation = 'destination-out'` + `getImageData`-Pixel-Test.
  **Sehr relevant**: exakt die Canvas-2D-Destruktions- und
  Kollisionstechnik für einen Browser-Worms-Klon (Code im README zitiert).
  8 Jahre alt, keine Lizenz angegeben → nur als Technik-Vorlage.
- **worms-world-party** (NirDiamant) — https://github.com/NirDiamant/worms-world-party
  Browser-Worms-Klon in **vanilla JS + Canvas + ES Modules**, 5 gestapelte
  Layer, prozedurales Terrain mit "Hills, islands, bridges, valleys",
  4 Biome (Grassland/Desert/Arctic/Hell) mit Wettereffekten.
  **Strukturell der nächste Verwandte des Nutzer-Projekts** (technisch, nicht
  als Code-Quelle). Mit Claude Code gebaut, 14 Stars, Trademark-Disclaimer.
  Lizenz nicht klar im README → vorsichtig behandeln.
- **Tankwars** — https://github.com/fmstephe/Tankwars
  1D-Höhenfeld aus **summierten Sinuswellen**; Antwort unter
  https://gamedev.stackexchange.com/a/19319. Einfachster möglicher Ansatz.

### 3.4 Worms-Originaldokumentation (Team17-Terrain, nicht Generator)
- Worms Knowledge Base "Terrain Creation Guide": https://worms2d.info/Terrain_Creation_Guide
  Zeigt das **Datenformat**: `DATA\Level\<Name>\Level.XXX` + `.dir`-Steuerdatei.
  Kein Generator, aber nützlich, um zu verstehen, was Team17 als Terrain
  ansah (Bitmaps, keine Heightmaps).
- r/worms-Thread zu Custom Terrains:
  https://www.reddit.com/r/worms/comments/1ofujgk/worms_armageddon_creating_your_own_custom_terrains/

---

## 4) Konkrete Empfehlungen mit Aufwandsschätzung

### Vorab: Architektur-Entscheidung (die alles andere bestimmt)
Der Motor hat ein **1D-Höhenfeld**. Höhlen/Überhänge/schwebende Inseln/
Tunnel/Etagen sind damit **nicht darstellbar**. Hedgewars, TerrainVer,
Guntanks, bamboy360 und Fietkau nutzen **alle** eine 2D-Bitmaske.
→ Empfehlung: **2D-Collision-Maske als neue Quelle der Wahrheit einführen**
(Uint8Array, ein Byte pro Pixel mit Flags: 0=Luft, 1=Land,
2=unzerstörbar, 3=Eis, 4=Gummi …), Höhenfeld nur noch als *abgeleitete*
Datenstruktur (Surface-Cache pro Spalte) für die vielen bestehenden Systeme
behalten. Das entspricht exakt Hedgewars' `lfBasic`/`lfIndestructible`/`lfIce`.

**Aufwand: 3–5 Tage** (inkl. Anpassung Kollision, Zerstörung, KI, Rendering,
Mahlstrom). Das ist der einzige wirklich große Brocken.

### Empfehlung 1 — Noise-Grundlage (sofort, klein)
- `npm i simplex-noise alea` (beide MIT, gepflegt, ES-Module).
- Noise mit `alea(mapSeed)` erzeugen → **deterministisch & seed-reproduzierbar**,
  deckt sich mit dem bestehenden PRNG-Konzept.
- **Aufwand: 2–4 Stunden.**

### Empfehlung 2 — Hedgewars-Perlin-Formel nachbauen (höchster Nutzen/Aufwand)
Portiere `uLandGenPerlin.pas` Zeile 177–226 nach ESM. Konkret:
```js
const df = detail * (6 - param2 * 2);
for (let y = minY; y < height; y++) {
  const di = (df * y / height) | 0;
  for (let x = 0; x < width; x++) {
    const dj = (df * x / width) | 0;
    let r = (((Math.abs(inoise(di,dj)) + y*4) % 65536) - (height-y)*8) / 256;
    if (x < margin || x > width - margin)
      r -= Math.abs(x - width/2) + width/2 - margin;   // Rand-Fade = Insel-Taper
    if (r < rCutoff) land[y*width+x] = 0;
    else land[y*width+x] = (param1 === 0) ? FLAG_OBJMASK : FLAG_BASIC;
  }
}
// Zweiter Pass: ObjMask-Pixel -> Luft  => TUNNELS/HÖHLEN
```
- `rCutoff = min(max((26 - featureSize) * 4, 15), 85)` — direkt als Regler
  übernehmen, das gibt dem Nutzer sofort einen sinnvollen Qualitätsslider.
- **Das liefert: Inseln die sauber auslaufen + Höhlen + Tunnels, in ~120
  Zeilen.** Höchster Nutzen pro Aufwand im ganzen Bericht.
- **Aufwand: 1 Tag** (inkl. Seed-Test und visueller Kalibrierung).

### Empfehlung 3 — Outline-Template-Pipeline (der „richtig gut"-Pfad)
Nachbau von Hedgewars `TemplatedLandGenerator` (siehe 1.3) in ESM:
Templates definieren (Insel, Höhle, Etagen, Schwebe-Inseln) →
Zufalls-Warp der Template-Punkte → rekursives `distort()` bis Länge stabil →
`bezierize(5)` → `draw` + Floodfill. Kombiniert mit `can_mirror`/`can_flip`
ergeben 4 Varianten pro Template, deterministisch aus dem Seed.
- **Warum:** Das ist die *einzige* Methode, die Höhlen + Inseln +
  spielbare Etagen + Mehrkomponenten-Karten strukturell garantiert.
- **Konkrete Templates für den Nutzer:** „Islands", „Cave" (invertiert),
  „Tunnels" (braidness hoch), „Schwebende Inseln", „Etagen/Stockwerke",
  „Kessel" (für Mahlstrom). Hedgewars liefert fertige
  Template-Definitionen unter `share/hedgewars/Data/Maps/*/map.cfg`
  (z.B. `Maps/Cave/`, `Maps/Islands/`, `Maps/Lonely_Island/`) — direkt als
  Vorlage lesen.
- **Aufwand: 4–6 Tage** (Distort+Bezier+Floodfill sind je ~80–150 Zeilen).

### Empfehlung 4 — Höhlen/Überhänge per zweitem Noise-Feld (billige Variante)
Statt voller Template-Pipeline: zwei 2D-Noise-Felder, `density = n1 -
Fade(y) + 0.5*n2`, Threshold → Land, dann **Connected-Component-Analyse**
gegen nicht erreichbare Bereiche (im Geist von
https://gamedev.stackexchange.com/a/20595, welches explizit
"Connected-component labeling" für schwebende Inseln empfiehlt).
- **Aufwand: 1–2 Tage.** Gut als Zwischenschritt, bevor die volle Template-
  Pipeline kommt.

### Empfehlung 5 — Biom/Klima-Variation (günstig, große Wirkung)
Der Nutzer braucht dafür **keinen neuen Algorithmus** — nur einen
**Post-Processing-Pass auf der Maske** (genau wie Hedgewars es macht):
- Hedgewars' Theme-System (`share/hedgewars/Data/Themes/*/theme.cfg`) setzt
  Land-Texturen (`LandTex.png`, `LandBackTex.png`), Horizont, Objekte,
  und Terrain-Flags (Eis = rutschig, Gummi = federnd) **pro Theme**.
- Für den Nutzer: Biome = Objekt { Farbpalette, Kanten-Textur, Wasser-Farbe,
  Terrain-Physikflags, Objekt-Sprites }, gewählt per Seed. Die *Form*
  kommt aus dem Generator, das *Aussehen* aus dem Biom.
- Wetter (Schnee/Regen/Sandsturm) als Partikelschicht — worms-world-party
  hat das mit 4 Biomen vorgemacht.
- **Aufwand: 2–3 Tage für 4–6 Biome.**

### Empfehlung 6 — Kanten- und Textureffekte (klein, sichtbarster Gewinn)
- **Dwitter-artige Surface-Detection**: Pro Spalte obersten Land-Pixel
  finden (Surface-Cache), dort Kanten-Textur (Gras/Fels) zeichnen.
  Hedgewars macht genau das in `DrawBorderFromImage` (16-px-Kacheln vom
  `Border.png` an Ober- UND Unterseite jedes Land-Segments).
- **Highlight-System** für Beleuchtung: siehe Fietkau-Artikel (Kapitel
  "Texturing and Lighting") — wenige Zeilen, sehr großer Optik-Gewinn.
- **Anti-Aliasing** der Maske (TerrainVer nutzt Hqx) — im Browser genügt
  `ctx.imageSmoothingEnabled` bzw. ein einmaliger Downscale-Pass.
- **Aufwand: 2–3 Tage.**

### Empfehlung 7 — Optional: Maze (Tunnel-Karten)
`rust/landgen/src/maze.rs` mit `inverted=true`, `braidness` hoch →
verbundene Tunnelnetze. Nur sinnvoll, wenn der Nutzer einen expliziten
"Tunnel"-Kartentyp will. **Aufwand: 2–3 Tage.**

### Was ich NICHT empfehle
- **Wave Function Collapse** (Hedgewars mgWfc): zu teuer, Konnektivität
  nicht garantiert, für Artillerie-Balance riskant. Nur bei explizitem
  Designer-Kachel-Wunsch.
- **THREE.Terrain / 3D-Noise**: falsche Dimension für Canvas-2D.
- **TerrainVer als Abhängigkeit übernehmen**: kein npm-Paket, keine
  Pflege, tote Demo-Domain. Als **Code-Vorlage lesen** (MIT erlaubt das
  ausdrücklich), nicht als Paket einbinden.
- **Hedgewars-Code kopieren**: GPLv2. Algorithmen neu schreiben.

### Vorgeschlagene Reihenfolge & Gesamtaufwand
| Schritt | Inhalt | Aufwand |
|---|---|---|
| 0 | 2D-Maske als neue Wahrheit (Flags) einführen | 3–5 T |
| 1 | `simplex-noise` + `alea` einbinden, seed-gebunden | 0,5 T |
| 2 | Hedgewars-Perlin-Formel portieren (Inseln + Höhlen) | 1 T |
| 3 | Zwei-Noise-Feld + Connected-Component-Reinigung | 1–2 T |
| 4 | Outline-Template-Pipeline (distort + bezier + floodfill) | 4–6 T |
| 5 | Biom-/Klima-Postpass + Wetterpartikel | 2–3 T |
| 6 | Kanten/Textur/Highlight/Antialiasing | 2–3 T |
| 7 | Optional Maze-Tunnel-Typ, WFC (nein) | 2–3 T |
| | **Summe** | **~16–24 Tage** |

**Pragmatischer Minimalpfad (größter Effekt in ~4–5 Tagen):**
Schritte 0 + 1 + 2 + 6. Damit hat der Nutzer Inseln mit sauberem Taper,
Höhlen, Tunnels und deutlich bessere Optik — alles seed-deterministisch,
MIT-lizenziert und browser-nativ.

---

## Anhang: Verifizierte Lizenz- und Metadaten-Quellen
- Hedgewars `COPYING` (GPL-2.0): https://github.com/hedgewars/hw/blob/master/COPYING
- TerrainVer `LICENSE` + `CREDITS.md` (MIT + Drittlizenzen):
  https://github.com/juliango202/TerrainVer/blob/master/LICENSE
  https://github.com/juliango202/TerrainVer/blob/master/CREDITS.md
- simplex-noise (MIT, 4.0.3, 2024-07-26): https://registry.npmjs.org/simplex-noise
- fastnoise-lite (MIT, 1.1.1, 2024-03-05): https://registry.npmjs.org/fastnoise-lite
- alea (MIT, 1.0.1): https://registry.npmjs.org/alea

## Anhang: Recherche-Einschränkungen
- **Reddit war nicht direkt scrapebar** (Firecrawl lehnt reddit.com ab,
  `/.json`-API blockiert). Die relevanten Threads wurden über
  Suchmaschinen-Snippets erfasst, Inhalte nicht vollständig gelesen:
  r/proceduralgeneration `1qgfjqv` (Worms-Like Terrain Advice),
  r/gamedev `3zlsfo` (destructible terrain), r/gamedev `17ntive`.
  → Für Tiefe in r/proceduralgeneration manuell im Browser nachsehen.
- Der `mgPerlin`-Code wurde vollständig gelesen und analysiert; Maze-,
  Outline- und WFC-Module im Detail für Outline/Maze.
- WebExtract lieferte von `https://juliango202.com/terrainver/` **nur die
  geparkte Spam-Seite** — die ehemalige Demo existiert nicht mehr. Das ist
  ein verifizierter Befund, keine Vermutung.
