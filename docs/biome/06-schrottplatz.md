# Biom 6: Schrottplatz

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Wracks, Rostmetall, kontaminierte Böden, Kabel, Giftfässer; Zerstörung durch Kettenreaktionen; Strom über verbundenes Metall; Rost mindert Belastbarkeit.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Kontaminierte Erde | beide | – | ähnlich: erde | ähnlich: teer.jpg | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Rostmetall | beide | – | ähnlich: metall | ja | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |
| Metall | beide | – | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall); 17 Bio-Alien-Tempelstadt; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Holzreste | SSOT | – | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Giftablagerungen | SSOT | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Teer | SSOT | – | fehlt | ja | offen | offen | offen | 5 Wüstendünen; 11 Surreale Schwebewelt; 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall) |
| Betonreste | SSOT | – | ähnlich: beton | ähnlich: beton.jpg | offen | offen | offen | **einzigartig** |
| Beton | Manifest | – | ja (beton, hart) | ja | offen | hart | offen | 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall) |
| Holz | Manifest | – | ja (holz, normal) | ja | offen | normal | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf; 13 Burgfelsen & Magiekristall; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Fels | Manifest | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 5 Wüstendünen; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | kontaminierte Erde |
| Kern | Rostmetall/Beton |
| Adern und Einschlüsse | Metall/Holz/Fels |

## Wasser / Fluid (Manifest)

- Toxischer Schlamm

## Spezial-Items und Begebenheiten (Manifest)

- Giftfässer
- Förderbänder
- Magnetturbinen
- Industrieaufzüge
- Stromkaskaden
- magnetische Ablenkung

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Schrotthaufen | offen | offen | offen | **einzigartig** |
| Giftfässer | offen | offen | offen | 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall) |
| Autowracks | offen | offen | offen | **einzigartig** |
| Metallplatten | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |
| Kran | offen | offen | offen | **einzigartig** |
| Schrottpresse | offen | offen | offen | **einzigartig** |

## Trigger

- Stromkreis-Trigger — **einzigartig**
- Kontaminations-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Schrottkorridore mit Wrackebenen
- zentraler Kran
- verknüpfte Metallplattformen unter Strom
- rutschender Schrottberg
- Pressen und Förderer bewegen Deckung

## Einzigartig in diesem Biom

- **Materialien (2):** Giftablagerungen, Betonreste
- **Objekte (4):** Schrotthaufen, Autowracks, Kran, Schrottpresse
