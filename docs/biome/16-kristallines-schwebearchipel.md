# Biom 16: Kristallines Schwebearchipel

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Schwebende Eis- und Felsinseln, Kristalladern, Windbrücken, Schneedecken, Magnetgestein; Schnee, Eis und Wind dominieren.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Schnee | SSOT | – | ja (schnee, weich) | ja | offen | weich | offen | 4 Eiswüste & Gletscher; 14 Planet (eine Variante) |
| Firn | SSOT | – | fehlt | ja | offen | offen | offen | 4 Eiswüste & Gletscher; 14 Planet (eine Variante) |
| Eis | SSOT | – | ja (eis, normal) | ja | offen | normal | offen | 4 Eiswüste & Gletscher; 14 Planet (eine Variante) |
| Klarer Kristall | SSOT | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | **einzigartig** |
| Magnetgestein | beide | – | fehlt | ja | offen | offen | offen | 7 Kristall-Archipel |
| Glas | SSOT | – | ja (glas, normal) | ja | offen | normal | offen | 11 Surreale Schwebewelt; 19 Dimensionsriss / Zeit-Chaosebene |
| Wolkenstein | SSOT | – | fehlt | ja | offen | offen | offen | 7 Kristall-Archipel |
| Massiver Fels | SSOT | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 11 Surreale Schwebewelt; 19 Dimensionsriss / Zeit-Chaosebene; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Firnschnee | Manifest | – | ähnlich: schnee | ähnlich: firn.jpg | offen | offen | offen | **einzigartig** |
| Klareis | Manifest | – | fehlt | fehlt | offen | offen | offen | 4 Eiswüste & Gletscher |
| Massivfels | Manifest | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | **einzigartig** |
| Klareiskristall | Manifest | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | 4 Eiswüste & Gletscher |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Firnschnee/Klareis |
| Kern | Massivfels |
| Adern und Einschlüsse | Klareiskristall/Magnetgestein |

## Wasser / Fluid (Manifest)

- Eiswasser-Abgrund

## Spezial-Items und Begebenheiten (Manifest)

- Eisbrücken
- Lawinen
- Magnetgestein
- Klareiskristalle
- Laserreflexion

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Schwebende Kristalle | offen | offen | offen | 7 Kristall-Archipel; 11 Surreale Schwebewelt |
| Windturbinen | offen | offen | offen | 4 Eiswüste & Gletscher; 7 Kristall-Archipel |
| Eisbrücken | offen | offen | offen | 4 Eiswüste & Gletscher; 14 Planet (eine Variante) |
| Magnetkräne | offen | offen | offen | 7 Kristall-Archipel |
| Spiegelwände | offen | offen | offen | 7 Kristall-Archipel; 11 Surreale Schwebewelt |
| Observatorien | offen | offen | offen | 7 Kristall-Archipel |
| Wolkenplattformen | offen | offen | offen | 7 Kristall-Archipel |
| Lawinenauslöser | offen | offen | offen | **einzigartig** |

## Trigger

- Inselbruch-Trigger — auch in: 7 Kristall-Archipel

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Eisinseln mit Windbrücken
- zwei Kristallplateaus mit Eisbrücke
- Windkorridore
- Schneehang legt Plattform frei
- schmelzende Eisverbindungen

## Einzigartig in diesem Biom

- **Materialien (3):** Klarer Kristall, Firnschnee, Massivfels
- **Objekte (1):** Lawinenauslöser
