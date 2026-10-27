# Biom 5: Wüstendünen

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Lose Dünen, Sandstein, Salzkrusten, Treibsand, alte Bauwerke; Wind formt um; Sandstürme; Teergruben; Oasen.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Loser Sand | SSOT | – | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | **einzigartig** |
| Verdichteter Sand | SSOT | – | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | **einzigartig** |
| Sandstein | beide | – | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | 14 Planet (eine Variante) |
| Salzkruste | SSOT | – | fehlt | ja | offen | offen | offen | 14 Planet (eine Variante) |
| Treibsand | beide | – | ähnlich: sand | ja | offen | offen | offen | **einzigartig** |
| Teer | SSOT | – | fehlt | ja | offen | offen | offen | 6 Schrottplatz; 11 Surreale Schwebewelt; 12 Fabrik & Hochhausruine; 14 Planet (eine Variante) |
| Totholz & Knochen | SSOT | – | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen | **einzigartig** |
| Feinsand | Manifest | – | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen | 8 Korallenriff |
| Fels | Manifest | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Variante); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| versteinertes Holz | Manifest | – | ähnlich: holz | ja | offen | offen | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Feinsand/Treibsand |
| Kern | Sandstein |
| Adern und Einschlüsse | Fels/versteinertes Holz |

## Wasser / Fluid (Manifest)

- Treibsand
- Teer
- Oasen

## Spezial-Items und Begebenheiten (Manifest)

- Treibsandlöcher
- Wanderdünen
- Oasen
- nachrutschende Sandbänke
- begrabende Sandmassen

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Wanderdünen | offen | offen | offen | 14 Planet (eine Variante) |
| Treibsandlöcher | offen | offen | offen | 14 Planet (eine Variante) |
| Teergruben | offen | offen | offen | **einzigartig** |
| Knochengerippe | offen | offen | offen | **einzigartig** |
| Sandsteinmonumente | offen | offen | offen | **einzigartig** |
| Oasen | offen | offen | offen | 14 Planet (eine Variante) |

## Trigger

- Sandsturm-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- offene Dünenkarte mit Felsformationen
- Canyon mit einstürzenden Wänden
- Treibsandfelder unter Salzkrusten
- zwei Oasen
- hohe Dünen, die sich abflachen

## Einzigartig in diesem Biom

- **Materialien (5):** Loser Sand, Verdichteter Sand, Treibsand, Totholz & Knochen, versteinertes Holz
- **Objekte (3):** Teergruben, Knochengerippe, Sandsteinmonumente
