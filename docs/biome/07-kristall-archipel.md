# Biom 7: Kristall-Archipel

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Schwebende Inseln mit tragenden Kernen und Verbindungen; Zerstörung kann Inselteile abtrennen; Abgründe; Wind; Magnet; Glas rutschig.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Erdüberzug | beide | – | fehlt | fehlt | offen | offen | offen | 13 Burgfelsen & Magiekristall |
| Massivfels | SSOT | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel; 19 Dimensionsriss / Zeit-Chaosebene; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Kristall | beide | – | ja (kristall, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 10 Asteroidenfeld; 11 Surreale Schwebewelt; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Obsidian | beide | – | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede |
| Wolkenstein | SSOT | – | fehlt | ja | offen | offen | offen | 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel |
| Glasplatten | SSOT | – | ähnlich: glas | ähnlich: glas.webp | offen | offen | offen | **einzigartig** |
| Magnetgestein | SSOT | – | fehlt | ja | offen | offen | offen | 16 Kristallines Schwebearchipel |
| Kristallfelsen | Manifest | – | ähnlich: fels | ähnlich: kristall.webp | offen | offen | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Erdüberzug |
| Kern | Kristallfelsen |
| Adern und Einschlüsse | Kristall/Obsidian |

## Wasser / Fluid (Manifest)

- Bodenlose Leere (Abgrund) — **Abgrund**
- kein Wasser

## Spezial-Items und Begebenheiten (Manifest)

- Schwebende Kristalle
- Prisma-Stelen
- Kristallbrücken
- Laserreflexion
- +50 % Magieintensität

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Schwebende Kristalle | offen | offen | offen | 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel |
| Windturbinen | offen | offen | offen | 4 Eiswüste & Gletscher; 16 Kristallines Schwebearchipel |
| Glasbrücken | offen | offen | offen | **einzigartig** |
| Magnetkräne | offen | offen | offen | 16 Kristallines Schwebearchipel |
| Spiegelwände | offen | offen | offen | 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel |
| Observatorien | offen | offen | offen | 16 Kristallines Schwebearchipel |
| Wolkenplattformen | offen | offen | offen | 16 Kristallines Schwebearchipel |

## Trigger

- Inselbruch-Trigger — auch in: 16 Kristallines Schwebearchipel

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- 3–5 Hauptinseln
- zentrale Kristallinsel über Brücken
- vertikale Karten mit Windkorridoren
- Arena mit tragender Kristallader
- Spiegelkristalle

## Einzigartig in diesem Biom

- **Materialien (2):** Glasplatten, Kristallfelsen
- **Objekte (1):** Glasbrücken
