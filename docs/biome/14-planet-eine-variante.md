# Biom 14: Planet (eine Variante)

> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die SSOT.

## Beschreibung

**Entscheidung des Auftraggebers (2026-10-26): es gibt nur einen Planeten, nicht sechs.** Die sechs Materialmixe unten sind kein Variantensatz mehr, sondern Vorrat für Zonen dieses einen Planeten; wie sie verteilt werden, ist offen. Im Code existieren noch sechs `planet_*`-Kennungen; sie auf eine zu verringern ändert alte Replays und braucht eine neue Gelände-Fassung (Versionsmarke). Übergeordnetes System: Eis, Lava, Wüste, Dschungel, Rost, Stein; gleiche technische Grundstruktur, eigener Materialmix und eigene Umwelt; Varianten ergänzen Sonderreaktionen, widersprechen der globalen Matrix nicht.

## Materialien (Terrain)

| Material | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Schnee | Eis | ja (schnee, weich) | ja | offen | weich | offen | 16 Kristallines Schwebearchipel |
| Firn | Eis | fehlt | ja | offen | offen | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Eis | Eis | ja (eis, normal) | ja | offen | normal | offen | 16 Kristallines Schwebearchipel |
| Fels | Eis | ja (fels, hart) | ja | offen | hart | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf |
| Kristall | Eis | ja (kristall, hart) | ja | offen | hart | offen | 7 Kristall-Archipel; 11 Surreale Schwebewelt |
| Asche | Lava | ja (asche, weich) | fehlt | offen | weich | offen | **einzigartig** |
| Basalt | Lava | ja (basalt, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 15 Vulkanische Schlackeschmiede; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Obsidian | Lava | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 7 Kristall-Archipel; 15 Vulkanische Schlackeschmiede |
| Schlacke | Lava | fehlt | ja | offen | offen | offen | 1 Vulkan & Lavafeld; 15 Vulkanische Schlackeschmiede |
| Magmaadern | Lava | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Sand | Wüste | ja (sand, weich) | ja | offen | weich | offen | **einzigartig** |
| Sandstein | Wüste | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | 5 Wüstendünen |
| Salzkruste | Wüste | fehlt | ja | offen | offen | offen | 5 Wüstendünen |
| Teer | Wüste | fehlt | ja | offen | offen | offen | 5 Wüstendünen; 6 Schrottplatz; 11 Surreale Schwebewelt; 12 Fabrik & Hochhausruine |
| Humus | Dschungel | fehlt | fehlt | offen | offen | offen | 17 Bio-Alien-Tempelstadt |
| Holz | Dschungel | ja (holz, normal) | ja | offen | normal | offen | **einzigartig** |
| Wurzeln | Dschungel | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Pilze | Dschungel | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen | **einzigartig** |
| Rostmetall | Rost | ähnlich: metall | ja | offen | offen | offen | 6 Schrottplatz |
| Metall | Rost | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Schrott | Rost | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Beton | Rost | ja (beton, hart) | ja | offen | hart | offen | 12 Fabrik & Hochhausruine |
| Korrosion | Rost | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Geröll | Stein | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Kristalladern | Stein | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | **einzigartig** |

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

- eine Planetenkarte (früher: sechs mit gleichem Aufbau)
- Planet mit mehreren Regionen
- Übergangslevel mit zwei Segmenten
- Kraterplanet mit Höhenringen
- modulare Kartenserie

## Einzigartig in diesem Biom

- **Materialien (10):** Asche, Magmaadern, Sand, Holz, Wurzeln, Pilze, Schrott, Korrosion, Geröll, Kristalladern
- **Objekte (13):** Windzonen, Magmarisse, Lavarampen, Monumente, Wurzeln, Sporen, Wasserstandsschalter, Pressen, korrodierte Träger, Stalaktiten, Kristalle, Geröllhänge, Felsbrücken
