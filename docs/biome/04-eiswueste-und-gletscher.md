# Biom 4: Eiswüste & Gletscher

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Schnee, Firn, Gletschereis, Spalten; rutschig; Eisbrücken brechen; Lawinen; Tauwasser; gefrorene Wasserfälle; Wind.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Pulverschnee | SSOT | – | ähnlich: schnee | ähnlich: schnee.jpg | offen | offen | offen | **einzigartig** |
| Firn | SSOT | – | fehlt | ja | offen | offen | offen | 14 Planet (eine Variante); 16 Kristallines Schwebearchipel |
| Gletschereis | SSOT | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Massiver Fels | SSOT | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | 2 Kristallhöhlen; 7 Kristall-Archipel; 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel; 19 Dimensionsriss / Zeit-Chaosebene; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Klareiskristall | SSOT | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | 16 Kristallines Schwebearchipel |
| Gefrorene Wurzeln | SSOT | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Schnee | Manifest | – | ja (schnee, weich) | ja | offen | weich | offen | 14 Planet (eine Variante); 16 Kristallines Schwebearchipel |
| Klareis | Manifest | – | fehlt | fehlt | offen | offen | offen | 16 Kristallines Schwebearchipel |
| Tiefenfels | Manifest | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | **einzigartig** |
| Eis | Manifest | – | ja (eis, normal) | ja | offen | normal | offen | 14 Planet (eine Variante); 16 Kristallines Schwebearchipel |
| Kristall | Manifest | – | ja (kristall, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 7 Kristall-Archipel; 10 Asteroidenfeld; 11 Surreale Schwebewelt; 14 Planet (eine Variante); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Schnee/Klareis |
| Kern | Tiefenfels |
| Adern und Einschlüsse | Eis/Kristall |

## Wasser / Fluid (Manifest)

- Eiskalte Tiefsee
- Schmelzwasser

## Spezial-Items und Begebenheiten (Manifest)

- Eisbrücken
- Lawinenhänge
- Gletscherspalten
- Rutschflächen
- reflektierende Eisflächen

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Eisbrücken | offen | offen | offen | 14 Planet (eine Variante); 16 Kristallines Schwebearchipel |
| Lawinenhänge | offen | offen | offen | 14 Planet (eine Variante) |
| gefrorene Wasserfälle | offen | offen | offen | 14 Planet (eine Variante) |
| Windturbinen | offen | offen | offen | 7 Kristall-Archipel; 16 Kristallines Schwebearchipel |
| Schneehöhlen | offen | offen | offen | **einzigartig** |
| Wetterfahnen | offen | offen | offen | **einzigartig** |

## Trigger

- Eisriss-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Gletscherkluft mit Eisbrücken
- Plateaus mit Seitenwind
- Hang mit Lawine
- gefrorene Wasserfälle als Wände
- Arena mit dünner Eisdecke über Wasser

## Einzigartig in diesem Biom

- **Materialien (4):** Pulverschnee, Gletschereis, Gefrorene Wurzeln, Tiefenfels
- **Objekte (2):** Schneehöhlen, Wetterfahnen
