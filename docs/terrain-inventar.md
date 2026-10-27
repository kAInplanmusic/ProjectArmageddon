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
| Kristall (`kristall`) | hart | 0.8/0.6 | 4 | – | – | strom ×1.15, aetz ×0.9 | kristall | kristallhoehle, eiswueste, schwebinseln, kosmos, surreal, planet_eis, planet_sand, planet_stein, alpine, cosmos, abstract, caverns, fantasy, spires |
| Metallplatte (`metall`) | unzerstoerbar | 0/0 | – | – | – | – | metall | schrott, kosmos, fabrik, planet_rost, urban, noir |
| Grundgestein (`grundgestein`) | unzerstoerbar | 0/0 | – | – | – | – | fels | – |
| Basalt (`basalt`) | hart | 0.65/0.5 | – | – | – | hitze ×0.9, aetz ×1.1 | basalt | vulkan, kosmos, planet_lava, cosmos, warren |
| Asche (`asche`) | weich | 1.3/1.1 | – | – | – | nass ×0.8 | kohle | vulkan, planet_lava, cosmos |
| Koralle (`koralle`) | normal | 0.95/0.8 | 2 | – | – | aetz ×1.3 | koralle | riff, island |
| Beton (`beton`) | hart | 0.72/0.55 | 2 | – | – | aetz ×1.15, hitze ×0.95 | beton | fabrik, planet_rost |
| Glas (`glas`) | normal | 1.05/0.8 | 5 | – | ja | hitze ×1.2, kaelte ×1.1, strom ×0.9 | glas | surreal |
| Regolith (`regolith`) | weich | 1.3/1.1 | – | – | – | hitze ×0.9, nass ×0.9 | regolith | kosmos, planet_rost |
| Magiekristall (`magiekristall`) | hart | 0.75/0.55 | 4 | – | – | strom ×1.3, hitze ×1.1, aetz ×0.85 | magiekristall | burg |
| Alienharz (`alienharz`) | weich | 1.15/1 | – | ja | ja | hitze ×1.3, aetz ×1.1 | alienharz | – |
| Asteroidenbasalt (`asteroidenbasalt`) | hart | 0.65/0.5 | – | – | – | hitze ×0.9, aetz ×1.1 | asteroidenbasalt | – |
| Betonreste (`betonreste`) | normal | 1/0.9 | 2 | – | – | aetz ×1.15, nass ×0.95 | betonreste | – |
| Bimsstein (`bimsstein`) | weich | 1.2/1.05 | 1 | – | – | hitze ×0.9, nass ×0.9 | bimsstein | – |
| Burgfelsen (`burgfelsen`) | hart | 0.7/0.5 | 1 | – | – | aetz ×1.2, kaelte ×0.95 | burgfelsen | – |
| Dampfkammer (`dampfkammer`) | weich | 1.6/0.3 | – | – | – | kaelte ×0.8 | dampfkammer | – |
| Druckkammer (`druckkammer`) | sehr_hart | 0.4/0.35 | – | – | – | aetz ×1.15, strom ×1.2 | druckkammer | – |
| Eisader (`eisader`) | normal | 0.95/0.8 | 3 | – | ja | hitze ×1.4, kaelte ×0.8 | eisader | – |
| Erdüberzug (`erdueberzug`) | weich | 1.1/0.8 | – | – | – | nass ×1.1 | erdueberzug | – |
| Feinsand (`feinsand`) | weich | 1.25/1.1 | – | – | – | nass ×0.85, hitze ×0.9 | sand | – |
| Feuchte Erde (`feuchte_erde`) | weich | 1.1/1 | – | – | – | nass ×0.9, strom ×1.15, hitze ×0.9 | feuchte_erde | – |
| Firnschnee (`firnschnee`) | weich | 1.25/1.1 | – | – | ja | hitze ×1.4, kaelte ×0.9 | firn | – |
| Gefrorene Wurzeln (`gefrorene_wurzeln`) | normal | 0.95/0.85 | 1 | ja | – | hitze ×1.1, kaelte ×0.9 | gefrorene_wurzeln | – |
| gehärtetes Glas (`gehaertetes_glas`) | hart | 0.75/0.55 | 3 | – | ja | hitze ×0.9, kaelte ×0.9, strom ×0.9 | gehaertetes_glas | – |
| Geröll (`geroell`) | weich | 1.15/1 | 1 | – | – | nass ×0.9 | geroell | – |
| Giftablagerungen (`giftablagerungen`) | weich | 1.2/1.05 | – | – | – | aetz ×0.8, nass ×0.9 | giftablagerungen | – |
| Giftnebel (`giftnebel`) | weich | 1.6/0.3 | – | – | – | aetz ×0.8 | giftnebel | – |
| Glasfassade (`glasfassade`) | normal | 0.95/0.75 | 4 | – | ja | hitze ×1.2, kaelte ×1.1, strom ×0.9 | glasfassade | – |
| Glasfragmente (`glasfragmente`) | weich | 1.3/1 | – | – | ja | hitze ×1.2, kaelte ×1.1 | glasfragmente | – |
| Glasplatten (`glasplatten`) | normal | 1/0.8 | 4 | – | ja | hitze ×1.2, kaelte ×1.1, strom ×0.9 | glasplatten | – |
| Gletschereis (`gletschereis`) | hart | 0.8/0.7 | 2 | – | ja | hitze ×1.4, kaelte ×0.8 | gletschereis | – |
| Holzaufbauten (`holzaufbauten`) | normal | 0.95/0.9 | – | ja | – | hitze ×1.25, nass ×0.9 | holz | – |
| Holzreste (`holzreste`) | weich | 1.1/1 | – | ja | – | hitze ×1.3, nass ×0.9 | holzreste | – |
| Humus (`humus`) | weich | 1.15/1.05 | – | ja | – | nass ×1.05, hitze ×1.1 | humus | – |
| Hydrothermalablagerungen (`hydrothermalablagerungen`) | normal | 0.9/0.75 | 2 | – | – | aetz ×1.2, hitze ×0.9 | hydrothermal | – |
| Industriemagma (`industriemagma`) | weich | 1.6/0.3 | – | – | – | nass ×0.8 | industriemagma | – |
| Instabiler Boden (`instabiler_boden`) | weich | 1.3/1.2 | 2 | – | – | strom ×1.1 | instabiler_boden | – |
| Kalkstein (`kalkstein`) | normal | 0.9/0.7 | 1 | – | – | aetz ×1.4, kaelte ×0.95 | kalkstein | – |
| Keramik (`keramik`) | hart | 0.8/0.6 | 3 | – | – | hitze ×0.7, kaelte ×1.05 | keramik | – |
| Kerkergewölbe (`kerkergewoelbe`) | hart | 0.7/0.5 | 1 | – | – | aetz ×1.2, kaelte ×0.95 | kerkergewoelbe | – |
| Klareis (`klareis`) | normal | 1/0.85 | 3 | – | ja | hitze ×1.5, kaelte ×0.8 | klareis | – |
| Klareiskristall (`klareiskristall`) | hart | 0.8/0.6 | 4 | – | ja | hitze ×1.4, kaelte ×0.8, strom ×1.1 | kristall | – |
| Kolossstamm (`kolossstamm`) | hart | 0.65/0.55 | – | ja | – | hitze ×1.1, nass ×0.9 | kolossholz | – |
| Kontaminierte Ablagerungen (`kontaminierte_ablagerungen`) | weich | 1.15/1 | – | – | – | aetz ×0.85, nass ×0.9 | kontaminierte_ablagerungen | – |
| Kontaminierte Erde (`kontaminierte_erde`) | normal | 1/1 | – | – | – | nass ×1.1, aetz ×1.1 | kontaminierte_erde | – |
| korrodiertes Metall (`korrodiertes_metall`) | hart | 0.7/0.5 | 2 | – | – | aetz ×1.4, nass ×1.1 | rostmetall | – |
| Korrosion (`korrosion`) | weich | 1.2/1 | 1 | – | – | aetz ×1.2, nass ×1.1 | korrosion | – |
| Kristalladern (`kristalladern`) | hart | 0.8/0.6 | 4 | – | – | strom ×1.15, aetz ×0.9 | kristall | – |
| Kristallblätter (`kristallblaetter`) | normal | 1/0.7 | 4 | – | – | strom ×1.15, aetz ×0.9 | kristall | – |
| Kristallfelsen (`kristallfelsen`) | hart | 0.75/0.55 | 3 | – | – | strom ×1.1, aetz ×1.1 | kristallfelsen | – |
| Lavaglas (`lavaglas`) | hart | 0.7/0.5 | 4 | – | ja | hitze ×1.2, kaelte ×1.1 | lavaglas | – |
| lebende Koralle (`lebende_koralle`) | normal | 0.95/0.75 | 1 | – | – | aetz ×1.4, hitze ×1.1 | koralle | – |
| lehmige Erde (`lehmige_erde`) | normal | 0.95/0.95 | – | – | – | nass ×0.9 | erde | – |
| Leuchtalgen (`leuchtalgen`) | weich | 1.25/1.1 | – | – | – | hitze ×1.2, aetz ×1.2, nass ×0.9 | leuchtalgen | – |
| Leuchtkristall (`leuchtkristall`) | hart | 0.8/0.6 | 4 | – | – | strom ×1.15, aetz ×0.9 | leuchtkristall | – |
| Leuchtpilzgewebe (`leuchtpilzgewebe`) | weich | 1.2/1.1 | – | ja | – | hitze ×1.25, aetz ×1.15 | leuchtpilzgewebe | – |
| Magmaadern (`magmaadern`) | hart | 0.7/0.5 | 1 | – | ja | hitze ×0.9, kaelte ×1.2 | magmaadern | – |
| Magnetgestein (`magnetgestein`) | hart | 0.7/0.5 | 1 | – | – | strom ×1.2 | magnetgestein | – |
| Massivfels (`massivfels`) | hart | 0.7/0.5 | – | – | – | aetz ×1.2, kaelte ×0.95 | fels | – |
| Mauerwerk (`mauerwerk`) | hart | 0.74/0.55 | 2 | – | – | aetz ×1.15, hitze ×0.95 | mauerwerk | – |
| Metallader (`metallader`) | sehr_hart | 0.45/0.4 | – | – | – | strom ×1.1 | metall | – |
| Metallfragmente (`metallfragmente`) | normal | 1/0.8 | 2 | – | – | strom ×1.1 | metall | – |
| Metallgitter (`metallgitter`) | normal | 0.9/0.7 | 1 | – | – | strom ×1.1 | metall | – |
| Metallplatten (`metallplatten`) | sehr_hart | 0.45/0.35 | – | – | – | strom ×1.1 | metall | – |
| Metallschienen (`metallschienen`) | hart | 0.65/0.45 | – | – | – | strom ×1.1 | metall | – |
| Metallträger (`metalltraeger`) | sehr_hart | 0.45/0.35 | – | – | – | strom ×1.1 | metall | – |
| Metalltrümmer (`metalltruemmer`) | normal | 1/0.8 | 2 | – | – | strom ×1.1 | metall | – |
| Meteoritenfels (`meteoritenfels`) | sehr_hart | 0.5/0.4 | 1 | – | – | – | meteoritenfels | – |
| Moos (`moos`) | weich | 1.3/1.05 | – | ja | – | hitze ×1.2, nass ×0.9 | moos | – |
| Mutterboden (`mutterboden`) | weich | 1.15/1.05 | – | – | – | nass ×1.1 | mutterboden | – |
| Myzelmatte (`myzelmatte`) | weich | 1.2/1.1 | – | ja | – | hitze ×1.25, aetz ×1.15 | myzel | – |
| Nickel-Eisen (`nickel_eisen`) | sehr_hart | 0.45/0.4 | – | – | – | strom ×1.1 | nickel_eisen | – |
| Organische Riffablagerungen (`organische_riffablagerungen`) | weich | 1.2/1 | 1 | – | – | aetz ×1.3 | organische_riffablagerungen | – |
| Organische Tragwurzeln (`organische_tragwurzeln`) | normal | 0.95/0.9 | – | ja | – | hitze ×1.25, nass ×0.9 | organische_tragwurzeln | – |
| Phasen-Fels (`phasen_fels`) | hart | 0.7/0.5 | – | – | – | aetz ×1.2, kaelte ×0.95 | phasen_fels | – |
| Pilzbrücke (`pilzbruecke`) | normal | 1/0.85 | – | ja | – | hitze ×1.25, aetz ×1.15 | pilzbruecke | – |
| Pilze (`pilze`) | weich | 1.2/1.1 | – | ja | – | hitze ×1.25, aetz ×1.15 | pilz | – |
| Pilzmyzel (`pilzmyzel`) | weich | 1.2/1.1 | – | ja | – | hitze ×1.25, aetz ×1.15 | myzel | – |
| Poröser Beton (`poroeser_beton`) | hart | 0.85/0.65 | 3 | – | – | aetz ×1.25, nass ×1.1 | beton | – |
| Poröser Fels (`poroeser_fels`) | hart | 0.85/0.6 | 2 | – | – | aetz ×1.25 | poroeser_fels | – |
| Pulverschnee (`pulverschnee`) | weich | 1.4/1.2 | – | – | ja | hitze ×1.4, kaelte ×0.9 | schnee | – |
| Rankgitter (`rankgitter`) | weich | 1.1/0.9 | – | ja | – | hitze ×1.3, aetz ×1.15, nass ×0.9 | rankgitter | – |
| Raumanker (`raumanker`) | unzerstoerbar | 0/0 | – | – | – | – | raumanker | – |
| Regolith-Staub (`regolith_staub`) | weich | 1.3/1.1 | – | – | – | hitze ×0.9, nass ×0.9 | regolith | – |
| Riff-Kalkstein (`riff_kalkstein`) | normal | 0.95/0.8 | 1 | – | – | aetz ×1.35 | kalkstein | – |
| Risszone (`risszone`) | weich | 1.3/1.1 | 3 | – | – | wucht ×1.2, strom ×1.2 | risszone | – |
| Rohrleitungen (`rohrleitungen`) | hart | 0.7/0.5 | 1 | – | – | strom ×1.2, aetz ×1.2 | rohrleitungen | – |
| Rostmetall (`rostmetall`) | hart | 0.75/0.55 | 1 | – | – | aetz ×1.4, nass ×1.1, strom ×1.1 | rostmetall | – |
| Salzkruste (`salzkruste`) | normal | 1/0.85 | 2 | – | – | nass ×1.4, aetz ×1.1 | salzkruste | – |
| Sandstein (`sandstein`) | normal | 0.9/0.75 | 1 | – | – | aetz ×1.15, nass ×1.05 | sandstein | – |
| Säureablagerungen (`saeureablagerungen`) | weich | 1.15/1 | 2 | – | – | aetz ×0.6, nass ×1.3 | saeureablagerungen | – |
| Säureboden (`saeureboden`) | weich | 1.2/1.05 | – | – | – | aetz ×0.6, nass ×1.1 | saeureboden | – |
| Schlacke (`schlacke`) | normal | 0.9/0.75 | 3 | – | ja | hitze ×1.2, kaelte ×1.1 | schlacke | – |
| Schrott (`schrott`) | normal | 0.95/0.8 | 2 | – | – | strom ×1.15, aetz ×1.2 | schrott | – |
| Schwebende Plattformen (`schwebende_plattformen`) | hart | 0.7/0.5 | 1 | – | – | aetz ×1.2, kaelte ×0.95 | schwebende_plattformen | – |
| Schwefelkruste (`schwefelkruste`) | normal | 1/0.85 | 2 | ja | ja | hitze ×1.3, aetz ×1.05 | schwefelkruste | – |
| Seegras (`seegras`) | weich | 1.2/1 | – | ja | – | hitze ×1.3, aetz ×1.1 | seegras | – |
| Stabilisatormaterial (`stabilisatormaterial`) | unzerstoerbar | 0/0 | – | – | – | – | stabilisatormaterial | – |
| Stahlbeton (`stahlbeton`) | sehr_hart | 0.5/0.4 | 1 | – | – | aetz ×1.1, hitze ×0.95 | beton | – |
| Stalaktiten (`stalaktiten`) | normal | 1/0.8 | 3 | – | – | aetz ×1.3, wucht ×1.2 | stalaktiten | – |
| Teer (`teer`) | weich | 1.1/1 | – | ja | ja | hitze ×1.3 | teer | – |
| Tempelstein (`tempelstein`) | hart | 0.7/0.5 | 1 | – | – | aetz ×1.15 | tempelstein | – |
| Tiefenfels (`tiefenfels`) | sehr_hart | 0.5/0.4 | – | – | – | aetz ×1.1, kaelte ×0.95 | fels | – |
| Tiefseebasalt (`tiefseebasalt`) | hart | 0.65/0.5 | – | – | – | hitze ×0.9, aetz ×1.1 | basalt | – |
| Tiefseeschlamm (`tiefseeschlamm`) | weich | 1.3/1.1 | – | – | – | nass ×0.85 | tiefseeschlamm | – |
| Totholz & Knochen (`totholz_knochen`) | normal | 0.95/0.9 | 1 | ja | – | hitze ×1.25, nass ×0.9 | totholz_knochen | – |
| Traumgestein (`traumgestein`) | hart | 0.75/0.55 | 2 | – | – | aetz ×1.1 | traumgestein | – |
| Treibsand (`treibsand`) | weich | 1.25/1.1 | – | – | – | nass ×0.85, hitze ×0.9 | treibsand | – |
| Unterwasserfels (`unterwasserfels`) | hart | 0.7/0.5 | – | – | – | aetz ×1.2, kaelte ×0.95 | fels | – |
| Unterwassersand (`unterwassersand`) | weich | 1.25/1.1 | – | – | – | nass ×0.85, hitze ×0.9 | sand | – |
| Verdichteter Sand (`verdichteter_sand`) | normal | 1/0.9 | – | – | – | nass ×0.9, hitze ×0.9 | sand | – |
| Versteinerte Wurzeln (`versteinerte_wurzeln`) | hart | 0.75/0.55 | 1 | – | – | aetz ×1.1 | versteinerte_wurzeln | – |
| Versteinertes Holz (`versteinertes_holz`) | hart | 0.75/0.55 | 1 | – | – | aetz ×1.1 | versteinertes_holz | – |
| Wasser (`wasser`) | weich | 1.4/1.2 | – | – | – | strom ×1.3, kaelte ×1.2, wucht ×0.8 | wasser | – |
| Wasserader (`wasserader`) | weich | 1.2/1 | – | – | – | strom ×1.3, kaelte ×1.2 | wasserader | – |
| Wolkenstein (`wolkenstein`) | weich | 1.15/1 | 1 | – | – | nass ×0.9 | wolkenstein | – |
| Wurzeln (`wurzeln`) | normal | 1/0.9 | – | ja | – | hitze ×1.2, nass ×0.9 | wurzeln | – |
| Zeitkristall (`zeitkristall`) | hart | 0.8/0.6 | 4 | – | – | strom ×1.15, aetz ×0.9 | kristall | – |

## 2. Gelände-Eigenschaften (Oberflächenverhalten)

Ids 0, 1, 2 = normal, Eis (rutschig), Gummi (federnd).

## 3. Kartenformen

hills, mountains, islands, caverns, flooded, open, spires, warren (`src/shared/config/terrain.js`). Verteilung je Biom: `docs/biome-uebersicht.md`.

## 4. Texturen und Terrain-Bilder

### Eingebaute Stoff-Texturen (512 px) (`src/client/assets/stoff-texturen`, 15)

basalt.jpg, beton.jpg, eis.jpg, erde.jpg, fels.jpg, hecke.jpg, holz.jpg, kies.jpg, kohle.jpg, moos.jpg, obsidian.jpg, pilz.jpg, regolith.jpg, sand.jpg, schnee.jpg

### Neue Stoff-Texturen für die SSOT-Materialien (noch nicht eingebaut) (`src/client/assets/stoff-texturen-neu`, 85)

alienharz.jpg, asche.webp, asteroidenbasalt.webp, betonreste.webp, bimsstein.jpg, burgfelsen.webp, dampfkammer.webp, druckkammer.webp, eisader.webp, erdueberzug.webp, feuchte_erde.webp, firn.jpg, gefrorene_wurzeln.webp, gehaertetes_glas.webp, geroell.webp, giftablagerungen.webp, giftnebel.webp, glas.webp, glasfassade.webp, glasfragmente.webp, glasplatten.webp, gletschereis.webp, holzreste.webp, humus.webp, hydrothermal.jpg, industriemagma.webp, instabiler_boden.jpg, kalkstein.jpg, keramik.jpg, kerkergewoelbe.webp, klareis.webp, kolossholz.jpg, kontaminierte_ablagerungen.webp, kontaminierte_erde.webp, koralle.webp, korrosion.webp, kristall.webp, kristallfelsen.webp, lavaglas.jpg, leuchtalgen.jpg, leuchtkristall.webp, leuchtpilzgewebe.webp, magiekristall.webp, magmaadern.webp, magnetgestein.jpg, mauerwerk.jpg, metall.webp, meteoritenfels.webp, moos.jpg, mutterboden.webp, myzel.jpg, nickel_eisen.webp, organische_riffablagerungen.webp, organische_tragwurzeln.webp, phasen_fels.webp, pilzbruecke.webp, poroeser_fels.webp, rankgitter.webp, raumanker.webp, risszone.webp, rohrleitungen.webp, rostmetall.jpg, saeureablagerungen.webp, saeureboden.webp, salzkruste.jpg, sandstein.webp, schlacke.jpg, schrott.webp, schwebende_plattformen.webp, schwefelkruste.jpg, seegras.webp, stabilisatormaterial.webp, stalaktiten.webp, teer.jpg, tempelstein.jpg, tiefseeschlamm.jpg, totholz_knochen.webp, traumgestein.webp, treibsand.jpg, versteinerte_wurzeln.webp, versteinertes_holz.jpg, wasser.webp, wasserader.webp, wolkenstein.jpg, wurzeln.webp

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
