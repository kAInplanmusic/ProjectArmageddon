# Terrain-Inventar (alles zum Gelände auf einen Blick)

*Erzeugt mit `node scripts/terrain-inventar.mjs` aus Config und Dateien.*

## 1. Stoffe (18) mit Eigenschaften, Textur und Vorkommen

| Stoff | Härte | Radius/Tiefe | Brüchig | Brennbar | Schmelzbar | Anfälligkeit | Textur (Client) | Vorkommen in Biomen |
|---|---|---|---|---|---|---|---|---|
| Erde (`erde`) | normal | 1/1 | – | – | – | nass ×1.1 | erde | dschungel, schrott, schwebinseln, pilzwald, fabrik, burg, planet_dschungel, maritime, forest, urban, abstract, fantasy, hyperreal, noir, deluge, open, warren |
| Sand (`sand`) | weich | 1.25/1.1 | – | – | – | nass ×0.85, hitze ×0.9 | sand | duenen, riff, planet_sand, maritime, island, western |
| Schnee (`schnee`) | weich | 1.35/1.15 | – | – | ja | hitze ×1.4, kaelte ×0.9 | schnee | eiswueste, planet_eis, alpine |
| Pilzgewebe (`pilz`) | weich | 1.2/1.1 | – | ja | – | hitze ×1.25, aetz ×1.15 | pilz | dschungel, pilzwald, planet_dschungel |
| Holz (`holz`) | normal | 0.95/0.9 | – | ja | – | hitze ×1.25, nass ×0.9 | holz | dschungel, duenen, schrott, pilzwald, burg, planet_dschungel, forest, western, deluge |
| Fels (`fels`) | hart | 0.7/0.5 | – | – | – | aetz ×1.2, kaelte ×0.95 | fels | vulkan, kristallhoehle, dschungel, eiswueste, duenen, schrott, schwebinseln, riff, pilzwald, surreal, fabrik, burg, planet_eis, planet_lava, planet_sand, planet_dschungel, planet_rost, planet_stein, maritime, island, alpine, forest, abstract, caverns, fantasy, hyperreal, western, noir, open, spires, warren |
| Obsidian (`obsidian`) | sehr_hart | 0.4/0.35 | 1 | – | – | strom ×0.9 | obsidian | vulkan, kristallhoehle, schwebinseln, kosmos, surreal, burg, planet_eis, planet_lava, planet_stein, abstract, caverns |
| Eis (`eis`) | normal | 1/0.85 | 3 | – | ja | hitze ×1.5, kaelte ×0.8 | eis | eiswueste, planet_eis |
| Kristall (`kristall`) | hart | 0.8/0.6 | 4 | – | – | strom ×1.15, aetz ×0.9 | – | kristallhoehle, eiswueste, schwebinseln, kosmos, surreal, planet_eis, planet_sand, planet_stein, alpine, cosmos, abstract, caverns, fantasy, spires |
| Metallplatte (`metall`) | unzerstoerbar | 0/0 | – | – | – | – | – | schrott, kosmos, fabrik, planet_rost, urban, noir |
| Grundgestein (`grundgestein`) | unzerstoerbar | 0/0 | – | – | – | – | fels | – |
| Basalt (`basalt`) | hart | 0.65/0.5 | – | – | – | hitze ×0.9, aetz ×1.1 | basalt | vulkan, kosmos, planet_lava, cosmos, warren |
| Asche (`asche`) | weich | 1.3/1.1 | – | – | – | nass ×0.8 | kohle | vulkan, planet_lava, cosmos |
| Koralle (`koralle`) | normal | 0.95/0.8 | 2 | – | – | aetz ×1.3 | – | riff, island |
| Beton (`beton`) | hart | 0.72/0.55 | 2 | – | – | aetz ×1.15, hitze ×0.95 | beton | fabrik, planet_rost |
| Glas (`glas`) | normal | 1.05/0.8 | 5 | – | ja | hitze ×1.2, kaelte ×1.1, strom ×0.9 | – | surreal |
| Regolith (`regolith`) | weich | 1.3/1.1 | – | – | – | hitze ×0.9, nass ×0.9 | regolith | kosmos, planet_rost |
| Magiekristall (`magiekristall`) | hart | 0.75/0.55 | 4 | – | – | strom ×1.3, hitze ×1.1, aetz ×0.85 | – | burg |

## 2. Gelände-Eigenschaften (Oberflächenverhalten)

Ids 0, 1, 2 = normal, Eis (rutschig), Gummi (federnd).

## 3. Kartenformen

hills, mountains, islands, caverns, flooded, open, spires, warren (`src/shared/config/terrain.js`). Verteilung je Biom: `docs/biome-uebersicht.md`.

## 4. Texturen und Terrain-Bilder

### Eingebaute Stoff-Texturen (512 px) (`src/client/assets/stoff-texturen`, 15)

basalt.jpg, beton.jpg, eis.jpg, erde.jpg, fels.jpg, hecke.jpg, holz.jpg, kies.jpg, kohle.jpg, moos.jpg, obsidian.jpg, pilz.jpg, regolith.jpg, sand.jpg, schnee.jpg

### Neue Stoff-Texturen für die SSOT-Materialien (noch nicht eingebaut) (`src/client/assets/stoff-texturen-neu`, 66)

alienharz.jpg, asche.webp, asteroidenbasalt.webp, betonreste.webp, bimsstein.jpg, burgfelsen.webp, dampfkammer.webp, druckkammer.webp, eisader.webp, erdueberzug.webp, feuchte_erde.webp, firn.jpg, gefrorene_wurzeln.webp, gehaertetes_glas.webp, geroell.webp, giftablagerungen.webp, glas.webp, glasfassade.webp, glasfragmente.webp, glasplatten.webp, gletschereis.webp, holzreste.webp, humus.webp, hydrothermal.jpg, industriemagma.webp, instabiler_boden.jpg, kalkstein.jpg, keramik.jpg, kerkergewoelbe.webp, klareis.webp, kolossholz.jpg, kontaminierte_ablagerungen.webp, kontaminierte_erde.webp, koralle.webp, korrosion.webp, kristall.webp, kristallfelsen.webp, lavaglas.jpg, leuchtalgen.jpg, leuchtkristall.webp, leuchtpilzgewebe.webp, magiekristall.webp, magmaadern.webp, magnetgestein.jpg, mauerwerk.jpg, metall.webp, meteoritenfels.webp, moos.jpg, mutterboden.webp, myzel.jpg, nickel_eisen.webp, organische_riffablagerungen.webp, organische_tragwurzeln.webp, phasen_fels.webp, pilzbruecke.webp, poroeser_fels.webp, rostmetall.jpg, salzkruste.jpg, schlacke.jpg, schwefelkruste.jpg, teer.jpg, tempelstein.jpg, tiefseeschlamm.jpg, treibsand.jpg, versteinertes_holz.jpg, wolkenstein.jpg

### Originale Auftraggeber-Texturen (1024 px) (`src/client/assets/material-texturen`, 21)

kugel-planet-lava.png, kugel-sonne-gelb.png, normalmap-erde.jpg, partikel-sheet-funken-blaetter.png, sheet-explosion-rot.png, sheet-glut-gluehen.png, szene-exoplanet-sterne.png, tex-blaetter-hecke-kontrast.jpg, tex-blaetter-hecke.jpg, tex-boden-moos-steine.jpg, tex-erde-braun.jpg, tex-fels-dunkel.jpg, tex-gras-erde.jpg, tex-gras-schnee.jpg, tex-kies-dunkel.jpg, tex-kohle-schwarz.jpg, tex-lava-glut-dunkel.jpg, tex-lava-risse-rot.jpg, tex-moos-fels.jpg, tex-schnee-erde.jpg, tex-schnee-gras-kontrast.jpg

### Planeten (Kugeln) (`src/client/assets/material-texturen/planeten`, 10)

planet-blau-rost.png, planet-bunt-gruen-lila.png, planet-eis-blau.png, planet-gruen.png, planet-lava-orange.png, planet-lava-rot-hg.png, planet-rost.png, planet-sand.png, planet-sonne-gelb-hg.png, planet-stein.png

### Effekt-Sheets (Original) (`src/client/assets/material-texturen/effekte`, 4)

sheet-feuerring-flammen.png, sheet-leuchtgeschosse-farben.png, sheet-ringe-blasen-farben.png, sheet-wirbel-gruen-pink.png

### Effekt-Sheets (eingebaut, WebP) (`src/client/assets/effekt-sheets`, 4)

explosion.webp, feuerring.webp, glut.webp, leuchtgeschosse.webp

### Comic-Terrain-Kacheln (Stilreferenz) (`src/client/assets/terrain-vorlagen`, 2)

terrain-kacheln-vorlage-1.webp, terrain-kacheln-vorlage-2.webp

### Objekt-Sheets je Biom (SSOT, noch nicht eingebaut) (`src/client/assets/biom-objekte`, 19)

01.webp, 02.webp, 03.webp, 04.webp, 05.webp, 06.webp, 07.webp, 08.webp, 09.webp, 10.webp, 11.webp, 12.webp, 13.webp, 15.webp, 16.webp, 17.webp, 18.webp, 19.webp, 20.webp

### Kulissen der Planeten (`src/client/assets/planeten-kulisse`, 9)

blaurost.webp, bunt.webp, eis.webp, gruen.webp, lava.webp, rost.webp, sand.webp, stein.webp, szene.jpg

### Kulissen (Hintergründe)

Basis `src/client/assets/backdrops/` (80), Stimmungen `backdrops/stimmung/` (144, quer und `_h` hochkant).

### Biom-Beispielbilder

`docs/bilder/biome-realistisch/` (40 Dateien: Spielbild `_spiel` und fotorealistische Fassung).

## 5. Fehlt laut SSOT (Aufgabe BS-1)

schlacke, schwefelkruste, salzkruste, kalkstein, moos, alienharz, firn, wolkenstein, magnetgestein, keramik, lavaglas, bimsstein, tempelstein, mauerwerk, rostmetall, tiefseeschlamm, hydrothermal, versteinertes_holz, kolossholz, instabiler_boden, teer, treibsand, myzel, leuchtalgen (Texturen dafür siehe `stoff-texturen-neu`, sobald erzeugt).
