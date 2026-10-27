# Biom 20: Versteinerter Kristallwald / Uralter Koloss-Wald

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Versteinerte Baumriesen mit Härtegraden, Kristallzweige (spröde, reflektierend), massive Wurzeln, Moos, mineralische Lichtquellen, Leuchtpilze.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Moos | beide | – | ja (moos, weich) | ja | offen | weich | offen | 3 Dschungel & Sumpf |
| Versteinertes Holz | beide | – | ja (versteinertes_holz, hart) | ja | offen | hart | offen | 5 Wüstendünen |
| Kristalladern | SSOT | – | ja (kristalladern, hart) | ähnlich: kristall.webp | offen | hart | offen | 2 Kristallhöhlen; 10 Asteroidenfeld; 14 Planet (eine Karte, Art per Zufall) |
| Kristallblätter | SSOT | – | ja (kristallblaetter, normal) | ähnlich: kristall.webp | offen | normal | offen | **einzigartig** |
| Versteinerte Wurzeln | SSOT | – | ja (versteinerte_wurzeln, hart) | ja | offen | hart | offen | **einzigartig** |
| Massivfels | SSOT | – | ja (massivfels, hart) | ähnlich: fels.jpg | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel; 19 Dimensionsriss / Zeit-Chaosebene |
| Kolossstamm | SSOT | – | ja (kolossstamm, hart) | fehlt | offen | hart | offen | **einzigartig** |
| Leuchtpilzgewebe | SSOT | – | ja (leuchtpilzgewebe, weich) | ja | offen | weich | offen | **einzigartig** |
| Kristall | Manifest | – | ja (kristall, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 10 Asteroidenfeld; 11 Surreale Schwebewelt; 14 Planet (eine Karte, Art per Zufall) |
| Holz | Manifest | – | ja (holz, normal) | ja | offen | normal | offen | 3 Dschungel & Sumpf; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 13 Burgfelsen & Magiekristall; 14 Planet (eine Karte, Art per Zufall) |
| Fels | Manifest | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 5 Wüstendünen; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall) |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Moos/versteinertes Holz |
| Kern | versteinertes Holz |
| Adern und Einschlüsse | Kristall/Holz/Fels |

## Wasser / Fluid (Manifest)

- Binnensee
- Abgrund — **Abgrund**

## Spezial-Items und Begebenheiten (Manifest)

- Kristallbäume
- versteinertes Holz
- Moos
- Kristalladern
- Binnensee

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Versteinerte Baumriesen | offen | offen | offen | **einzigartig** |
| Kristallblätter | offen | offen | offen | **einzigartig** |
| Versteinerte Wurzeln | offen | offen | offen | **einzigartig** |
| Kolossstämme | offen | offen | offen | **einzigartig** |
| Leuchtpilze | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Moosfelsen | offen | offen | offen | **einzigartig** |
| Kristallformationen | offen | offen | offen | 10 Asteroidenfeld |

## Trigger

- Wurzelbruch-Trigger — auch in: 17 Bio-Alien-Tempelstadt
- Stammsturz-Trigger — **einzigartig**
- Kristallresonanz-Trigger — **einzigartig**

## Sonderwirkung

Lichtimpuls (aktiviert definierte Kristallflächen)

## Kartenformen

- Wald mit Schusskorridoren
- Arena mit Baumriesen als Deckung
- Waldhang mit abstürzenden Stämmen
- Wurzellabyrinth
- erhöhte Baumplattformen

## Einzigartig in diesem Biom

- **Materialien (4):** Kristallblätter, Versteinerte Wurzeln, Kolossstamm, Leuchtpilzgewebe
- **Objekte (5):** Versteinerte Baumriesen, Kristallblätter, Versteinerte Wurzeln, Kolossstämme, Moosfelsen
