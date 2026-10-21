# Biome und Gelände — Übersicht

*Erzeugt mit `node scripts/biome-uebersicht.mjs` aus den Configs. Zahlen in Klammern: Tiefe der Deckschicht in Pixeln.*

## Sonderbiome (Gelände-Fassung 2–4)

| ID | Name | Kartenform | Wasser | Landmarken | Stoffe | Form (Bereiche) |
|---|---|---|---|---|---|---|
| `vulkan` | Vulkan & Lavafeld | mountains | lava | volcano, mountain_ridge, rock_arch, cliff | Deck: asche (16), basalt (80); Kern: basalt; Adern: obsidian 7 %, fels 10 % | steilheit 0.44–0.58, hoehlung 0.06–0.2, wasser 0.16–0.3, zerklueftung 1.1–1.8, landanteil 0.32–0.48, kessel 0.5–1 |
| `kristallhoehle` | Kristallhöhlen | caverns | shallow_lake, meltwater, void | crystal_spires, rock_arch, none | Deck: fels (20); Kern: fels; Adern: kristall 20 %, obsidian 4 % | hoehlung 0.13–0.22, steilheit 0.34–0.52, wasser 0–0.14, landanteil 0.42–0.55, zerklueftung 1–1.6, kessel 0.3–0.9 |
| `dschungel` | Dschungel & Sumpf | flooded | swamp_sludge, poison, shallow_lake | forest_line, ruins, palm_grove, rock_arch | Deck: erde (36); Kern: erde; Adern: holz 16 %, pilz 7 %, fels 8 % | wasser 0.16–0.3, landanteil 0.32–0.5, steilheit 0.28–0.42, hoehlung 0–0.08, zerklueftung 1–1.6, inseligkeit 0.1–0.3 |
| `eiswueste` | Eiswüste & Gletscher | mountains | frozen_lake, meltwater, deep_sea | ice_peaks, glacier_wall, mountain_ridge | Deck: schnee (20), eis (70); Kern: fels; Adern: eis 16 %, kristall 3 % | wasser 0.05–0.2, steilheit 0.3–0.5, landanteil 0.4–0.55, hoehlung 0.04–0.14, terrassen 0.3–0.85, inseligkeit 0.05–0.25 |
| `duenen` | Wüsten-Dünen mit Ruinen | open | quicksand, tar_pit, shallow_lake | dunes, ruins, temple, mesa, cactus_field | Deck: sand (60); Kern: sand; Adern: fels 14 %, holz 4 % | steilheit 0.28–0.4, wasser 0–0.08, landanteil 0.46–0.55, zerklueftung 0.8–1.2, hoehlung 0–0.06, terrassen 0–0.3 |
| `schrott` | Schrottplatz & zerstörte Stadt | warren | tar_pit, poison, swamp_sludge | city_skyline, ruins, scrap_towers | Deck: erde (12); Kern: erde; Adern: metall 9 %, holz 10 %, fels 12 % | terrassen 0.4–0.85, steilheit 0.3–0.5, zerklueftung 1.2–1.8, wasser 0.04–0.18, hoehlung 0–0.1, lippen 0.3–0.7 |
| `schwebinseln` | Kristall-Archipel | islands | void, deep_sea | floating_isles, crystal_spires, mountain_ridge | Deck: erde (14); Kern: fels; Adern: kristall 30 %, obsidian 5 % | inseligkeit 0.34–0.45, landanteil 0.3–0.44, wasser 0–0.1, zusammenhaengung 0.35–0.55, kessel 0–0.4, steilheit 0.3–0.5 |
| `riff` | Korallenriff & Tiefsee-Rand | islands | deep_sea, shallow_lake | coral_reef, kelp_forest, rock_arch, cliff | Deck: sand (16), koralle (40); Kern: fels; Adern: koralle 20 %, fels 7 % | wasser 0.2–0.3, inseligkeit 0.25–0.45, landanteil 0.3–0.45, steilheit 0.28–0.42, hoehlung 0.02–0.12 |
| `pilzwald` | Pilzwald & Säuresumpf | caverns | acid, poison, swamp_sludge | mushroom_grove, forest_line, rock_arch | Deck: pilz (28); Kern: erde; Adern: pilz 30 %, holz 8 %, fels 10 % | hoehlung 0.05–0.15, wasser 0.1–0.26, steilheit 0.28–0.44, landanteil 0.36–0.5, zerklueftung 1–1.5 |
| `planet_eis` | Planet: Eis | islands | void | none | Deck: schnee (16), eis (54); Kern: fels; Adern: kristall 8 %, obsidian 3 % |  |
| `planet_lava` | Planet: Lava | islands | void | none | Deck: asche (12), basalt (70); Kern: basalt; Adern: obsidian 8 %, fels 8 % |  |
| `planet_sand` | Planet: Wüste | islands | void | none | Deck: sand (46); Kern: fels; Adern: fels 10 %, kristall 3 % |  |
| `planet_dschungel` | Planet: Dschungel | islands | void | none | Deck: erde (24); Kern: erde; Adern: holz 8 %, pilz 12 %, fels 8 % |  |
| `planet_rost` | Planet: Rost | islands | void | none | Deck: regolith (16); Kern: fels; Adern: metall 8 %, beton 10 % |  |
| `planet_stein` | Planet: Stein | islands | void | none | Deck: fels (26); Kern: fels; Adern: kristall 6 %, obsidian 4 % |  |

## Themenbiome (Gelände-Fassung 3)

| ID | Name | Kartenform | Wasser | Landmarken | Stoffe | Form (Bereiche) |
|---|---|---|---|---|---|---|
| `kosmos` | Asteroidenfeld & Wracks | islands | void, deep_sea | crystal_spires, mountain_ridge, rock_arch, none | Deck: regolith (18); Kern: basalt; Adern: metall 7 %, kristall 14 %, obsidian 4 % | inseligkeit 0.3–0.42, landanteil 0.32–0.46, wasser 0–0.06, zusammenhaengung 0.4–0.6, kessel 0.2–0.7, steilheit 0.38–0.56, zerklueftung 1.2–1.8 |
| `surreal` | Surreale Schwebewelt | islands | void, poison, tar_pit | floating_isles, crystal_spires, city_skyline, temple | Deck: glas (10); Kern: fels; Adern: glas 22 %, kristall 18 %, obsidian 5 % | inseligkeit 0.28–0.4, zusammenhaengung 0.42–0.62, hoehlung 0.08–0.18, landanteil 0.32–0.46, kessel 0–0.3, steilheit 0.4–0.58, wasser 0–0.12 |
| `fabrik` | Fabrik & Hochhausruine | warren | tar_pit, poison, swamp_sludge | city_skyline, scrap_towers, ruins | Deck: beton (24); Kern: erde; Adern: metall 7 %, beton 20 %, fels 8 % | terrassen 0.55–0.9, lippen 0.4–0.75, steilheit 0.34–0.52, zerklueftung 1.2–1.8, wasser 0.04–0.14, hoehlung 0.02–0.1, landanteil 0.42–0.55 |
| `burg` | Burgfelsen & Magiekristall | mountains | shallow_lake, meltwater, swamp_sludge | crystal_spires, temple, ruins, mountain_ridge | Deck: erde (12); Kern: fels; Adern: magiekristall 14 %, holz 6 %, obsidian 4 % | steilheit 0.46–0.6, terrassen 0.3–0.7, zerklueftung 1–1.6, landanteil 0.38–0.52, wasser 0.02–0.14, hoehlung 0.02–0.1, kessel 0.2–0.6 |

## Kulissenbiome (16, je 10 Varianten) mit Stoffrezept

| ID | Name | Kartenform | Stoffe | Varianten |
|---|---|---|---|---|
| `maritime` | Maritim & Meer | islands | Deck: sand (14); Kern: fels; Adern: erde 12 % | Ruhige See, Sturm bei Nacht, Polarmeer, Kriegshafen, Asiatische Karstküste, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `island` | Südseeinsel & Karibik | islands | Deck: sand (32); Kern: fels; Adern: koralle 8 % | Karibischer Tag, Goldener Sonnenuntergang, Vulkanausbruch, Taifun, Polynesische Nacht, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `alpine` | Gebirge & Alpin | mountains | Deck: schnee (14), fels (40); Kern: fels; Adern: kristall 3 % | Alpensommer, Hochwinter, Himalaya-Kloster, Kriegsruinen, Mondnacht, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `forest` | Wald & Wiese | hills | Deck: erde (44); Kern: erde; Adern: fels 12 %, holz 5 % | Sommerwiese, Herbstwald, Winterwald, Nebel bei Nacht, Verzauberte Lichtung, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `urban` | Stadt & Industrie | hills | Deck: erde (10); Kern: erde; Adern: metall 6 % | Moderne Stadt, Neonnacht, Industrieruine, Kriegsstadt, Indische Monsunstadt, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `cosmos` | Universum & Galaxie | mountains | Deck: asche (14); Kern: basalt; Adern: kristall 10 % | Nebel, Ringplanet, Raumstation, Schwarzes Loch, Fremde Welt, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `abstract` | Abstrakt & Verrückt | caverns | Deck: erde (20); Kern: fels; Adern: obsidian 8 %, kristall 8 % | Geometrisch, Psychedelisch, Vaporwave, Fraktal, Surreal, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `caverns` | Höhlenwelten | caverns | Deck: fels (24); Kern: fels; Adern: kristall 8 %, obsidian 3 % | Tropfsteinhöhle, Kristallhöhle, Lavaröhre, Eishöhle, Unterwasserhöhle, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `fantasy` | Fantasy | mountains | Deck: erde (30); Kern: fels; Adern: kristall 7 % | Elfenstadt, Drachenberg, Belagerung, Dunkler Sumpf, Kristallmagie, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `hyperreal` | Hyperrealismus | mountains | Deck: erde (40); Kern: erde; Adern: fels 10 % | Goldenes Tal, Wüste, Polstation, Dschungelfluss, Steilküste, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `western` | Cowboy & Western | hills | Deck: sand (30); Kern: fels; Adern: holz 4 % | Wüstenstadt, Duell im Sonnenuntergang, Lagerfeuer, Wintergrenze, Prärie, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `noir` | Film Noir & Cinematisch | hills | Deck: erde (10); Kern: fels; Adern: metall 5 % | Regennasse Straße, Hafenkai, Verrauchte Bar, Verfolgung, Dachsilhouette, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `deluge` | Sintflut & Überschwemmung | flooded | Deck: erde (36); Kern: erde; Adern: holz 8 % | Versunkene Stadt, Monsun, Ertränkter Wald, Reisterrassen, Dammbruch, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `open` | Weite & Ebene | open | Deck: erde (50); Kern: erde; Adern: fels 8 % | Weizenfelder, Heide, Salzpfanne, Polder, Präriesturm, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `spires` | Hochgebirge & Karst | spires | Deck: fels (30); Kern: fels; Adern: kristall 5 % | Karsttürme, Dolomiten, Basaltsäulen, Felspfeiler, Eisnadeln, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |
| `warren` | Gewirr & Enge | warren | Deck: erde (14); Kern: fels; Adern: basalt 10 % | Schlucht, Stadtruinen, Höhlengänge, Bambusdickicht, Schützengräben, Heller Himmel, Sternennacht, Höhlenblick, Ragnarök, Ragnarök – Walhalla brennt |

Material-Eigenschaften (Härte, Brennbarkeit, Zerstörbarkeit je Schadensart): siehe MASTERDOTO, „Biome und Materialien" und den Hilfe-Reiter „Karte und Gelände". Die fünf klassischen Karten (Kartenform-Spalte: `hills`, `mountains`, `islands`, `caverns`, `flooded`, `open`, `spires`, `warren`) sind in `src/shared/config/terrain.js` als Gelände-Voreinstellungen definiert.
