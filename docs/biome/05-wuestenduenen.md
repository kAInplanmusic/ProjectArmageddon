# Biom 5: Wüstendünen

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Lose Dünen, Sandstein, Salzkrusten, Treibsand, alte Bauwerke; Wind formt um; Sandstürme; Teergruben; Oasen.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Feinsand | beide | – | ja (feinsand, weich) | ähnlich: sand.jpg | offen | weich | offen | 8 Korallenriff |
| Verdichteter Sand | SSOT | – | ja (verdichteter_sand, normal) | ähnlich: sand.jpg | offen | normal | offen | **einzigartig** |
| Sandstein | beide | – | ja (sandstein, normal) | ja | offen | normal | offen | 14 Planet (eine Karte, Art per Zufall) |
| Salzkruste | SSOT | – | ja (salzkruste, normal) | ja | offen | normal | offen | 14 Planet (eine Karte, Art per Zufall) |
| Treibsand | beide | – | ja (treibsand, weich) | ja | offen | weich | offen | **einzigartig** |
| Teer | SSOT | – | ja (teer, weich) | ja | offen | weich | offen | 6 Schrottplatz; 11 Surreale Schwebewelt; 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall) |
| Totholz & Knochen | SSOT | – | ja (totholz_knochen, normal) | ja | offen | normal | offen | **einzigartig** |
| Fels | Manifest | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Versteinertes Holz | Manifest | – | ja (versteinertes_holz, hart) | ja | offen | hart | offen | 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

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
| Wanderdünen | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |
| Treibsandlöcher | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |
| Teergruben | offen | offen | offen | **einzigartig** |
| Knochengerippe | offen | offen | offen | **einzigartig** |
| Sandsteinmonumente | offen | offen | offen | **einzigartig** |
| Oasen | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |

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

- **Materialien (3):** Verdichteter Sand, Treibsand, Totholz & Knochen
- **Objekte (3):** Teergruben, Knochengerippe, Sandsteinmonumente
