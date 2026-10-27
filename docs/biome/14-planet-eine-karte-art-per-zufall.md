# Biom 14: Planet (eine Karte, Art per Zufall)

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

**Entscheidung des Auftraggebers (2026-10-26/27): Planet ist ein Biom und eine Karte; der Seed zieht die Planetenart zufällig aus sechs (Eis, Lava, Wüste, Dschungel, Rost, Stein).** Im Code ist das die Wahl `planet`: `planetArtAusZug` wählt eine der Kennungen `planet_eis`, `planet_lava`, `planet_sand`, `planet_dschungel`, `planet_rost`, `planet_stein`; es ist keine Änderung am Code nötig. Die sechs Materialmixe unten sind die sechs möglichen Arten. Übergeordnetes System: Eis, Lava, Wüste, Dschungel, Rost, Stein; gleiche technische Grundstruktur, eigener Materialmix und eigene Umwelt; Varianten ergänzen Sonderreaktionen, widersprechen der globalen Matrix nicht.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Schnee | SSOT | Eis | ja (schnee, weich) | ja | offen | weich | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Firn | SSOT | Eis | fehlt | ja | offen | offen | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Eis | SSOT | Eis | ja (eis, normal) | ja | offen | normal | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Fels | SSOT | Eis | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 5 Wüstendünen; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Kristall | SSOT | Eis | ja (kristall, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 10 Asteroidenfeld; 11 Surreale Schwebewelt; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Asche | SSOT | Lava | ja (asche, weich) | fehlt | offen | weich | offen | 1 Vulkan & Lavafeld |
| Basalt | SSOT | Lava | ja (basalt, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 15 Vulkanische Schlackeschmiede; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Obsidian | SSOT | Lava | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 7 Kristall-Archipel; 15 Vulkanische Schlackeschmiede |
| Schlacke | SSOT | Lava | fehlt | ja | offen | offen | offen | 1 Vulkan & Lavafeld; 15 Vulkanische Schlackeschmiede |
| Magmaadern | SSOT | Lava | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Sand | SSOT | Wüste | ja (sand, weich) | ja | offen | weich | offen | **einzigartig** |
| Sandstein | SSOT | Wüste | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | 5 Wüstendünen |
| Salzkruste | SSOT | Wüste | fehlt | ja | offen | offen | offen | 5 Wüstendünen |
| Teer | SSOT | Wüste | fehlt | ja | offen | offen | offen | 5 Wüstendünen; 6 Schrottplatz; 11 Surreale Schwebewelt; 12 Fabrik & Hochhausruine |
| Humus | SSOT | Dschungel | fehlt | fehlt | offen | offen | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf; 17 Bio-Alien-Tempelstadt |
| Holz | SSOT | Dschungel | ja (holz, normal) | ja | offen | normal | offen | 3 Dschungel & Sumpf; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 13 Burgfelsen & Magiekristall; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Wurzeln | SSOT | Dschungel | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Pilze | SSOT | Dschungel | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen | **einzigartig** |
| Rostmetall | SSOT | Rost | ähnlich: metall | ja | offen | offen | offen | 6 Schrottplatz |
| Metall | SSOT | Rost | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine; 17 Bio-Alien-Tempelstadt; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Schrott | SSOT | Rost | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Beton | SSOT | Rost | ja (beton, hart) | ja | offen | hart | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine |
| Korrosion | SSOT | Rost | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Geröll | SSOT | Stein | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Kristalladern | SSOT | Stein | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | variabel |
| Kern | variabel |
| Adern und Einschlüsse | variabel |

## Wasser / Fluid (Manifest)

- Variabel

## Spezial-Items und Begebenheiten (Manifest)

- 6-in-1-Planetenwechsel
- variable Material-/Fluid-Sets
- Übergänge/Portale

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Eisbrücken | offen | offen | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Lawinenhänge | offen | offen | offen | 4 Eiswüste & Gletscher |
| gefrorene Wasserfälle | offen | offen | offen | 4 Eiswüste & Gletscher |
| Windzonen | offen | offen | offen | **einzigartig** |
| Lavaseen | offen | offen | offen | 1 Vulkan & Lavafeld |
| Magmarisse | offen | offen | offen | **einzigartig** |
| Dampfventile | offen | offen | offen | 1 Vulkan & Lavafeld; 15 Vulkanische Schlackeschmiede |
| Lavarampen | offen | offen | offen | **einzigartig** |
| Treibsandlöcher | offen | offen | offen | 5 Wüstendünen |
| Wanderdünen | offen | offen | offen | 5 Wüstendünen |
| Monumente | offen | offen | offen | **einzigartig** |
| Oasen | offen | offen | offen | 5 Wüstendünen |
| Rankenaufzüge | offen | offen | offen | 3 Dschungel & Sumpf; 17 Bio-Alien-Tempelstadt |
| Wurzeln | offen | offen | offen | **einzigartig** |
| Sporen | offen | offen | offen | **einzigartig** |
| Wasserstandsschalter | offen | offen | offen | **einzigartig** |
| Metallplatten | offen | offen | offen | 6 Schrottplatz |
| Giftfässer | offen | offen | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine |
| Pressen | offen | offen | offen | **einzigartig** |
| korrodierte Träger | offen | offen | offen | **einzigartig** |
| Stalaktiten | offen | offen | offen | **einzigartig** |
| Kristalle | offen | offen | offen | **einzigartig** |
| Geröllhänge | offen | offen | offen | **einzigartig** |
| Felsbrücken | offen | offen | offen | **einzigartig** |

## Trigger

- (keine in der SSOT)

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- eine Planetenkarte, deren Art der Seed zieht
- Planet mit mehreren Regionen
- Übergangslevel mit zwei Segmenten
- Kraterplanet mit Höhenringen
- modulare Kartenserie

## Einzigartig in diesem Biom

- **Materialien (8):** Magmaadern, Sand, Wurzeln, Pilze, Schrott, Korrosion, Geröll, Kristalladern
- **Objekte (13):** Windzonen, Magmarisse, Lavarampen, Monumente, Wurzeln, Sporen, Wasserstandsschalter, Pressen, korrodierte Träger, Stalaktiten, Kristalle, Geröllhänge, Felsbrücken
