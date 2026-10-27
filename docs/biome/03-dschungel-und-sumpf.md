# Biom 3: Dschungel & Sumpf

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Weiches Erdreich, Wurzeln, Ranken, Wasserbecken, morsches Holz, Ruinen; Sumpf bremst; Wurzeln halten Erde zusammen (Hangrutsch bei Verlust); Sporen; Regen verändert Wasserstände.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Erde/Humus | SSOT | – | ähnlich: erde | ähnlich: erde.jpg | offen | offen | offen | **einzigartig** |
| Holz/Wurzeln | SSOT | – | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen | **einzigartig** |
| Pilzgewebe | SSOT | – | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Fels | beide | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 5 Wüstendünen; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Variante); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Moos | SSOT | – | fehlt | ja | offen | offen | offen | 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Alienharz | SSOT | – | fehlt | ja | offen | offen | offen | 17 Bio-Alien-Tempelstadt |
| Säureboden | SSOT | – | fehlt | fehlt | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Humus | Manifest | – | fehlt | fehlt | offen | offen | offen | 9 Pilzwald & Säuresumpf; 14 Planet (eine Variante); 17 Bio-Alien-Tempelstadt |
| Erde | Manifest | – | ja (erde, normal) | ja | offen | normal | offen | **einzigartig** |
| lehmige Erde | Manifest | – | ähnlich: erde | ähnlich: erde.jpg | offen | offen | offen | **einzigartig** |
| Holz | Manifest | – | ja (holz, normal) | ja | offen | normal | offen | 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 13 Burgfelsen & Magiekristall; 14 Planet (eine Variante); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Pilz | Manifest | – | ja (pilz, weich) | ja | offen | weich | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Humus/Erde |
| Kern | lehmige Erde |
| Adern und Einschlüsse | Holz/Pilz/Fels |

## Wasser / Fluid (Manifest)

- Sumpfschlamm
- Säure (ätzend)

## Spezial-Items und Begebenheiten (Manifest)

- Wurzelherzen
- Sporenschwämme
- Insektennester
- Säurepfützen
- Schadgaswolken

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Sporenschwämme | offen | offen | offen | 9 Pilzwald & Säuresumpf; 17 Bio-Alien-Tempelstadt |
| Rankenaufzüge | offen | offen | offen | 14 Planet (eine Variante); 17 Bio-Alien-Tempelstadt |
| Säurebecken | offen | offen | offen | 9 Pilzwald & Säuresumpf; 17 Bio-Alien-Tempelstadt |
| Tempelbrücken | offen | offen | offen | **einzigartig** |
| Wurzelherzen | offen | offen | offen | 17 Bio-Alien-Tempelstadt |
| Insektennester | offen | offen | offen | 17 Bio-Alien-Tempelstadt |

## Trigger

- Wasserstands-Trigger — **einzigartig**
- Wurzelspannungs-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- überflutete Ruinen mit tiefer Senke
- Wurzeln als Brücken
- dichter Dschungel mit Sichtkorridoren
- Sumpfbecken mit Dämmen
- Ruinenkarte, in der Wurzelverlust Plattformen kippt

## Einzigartig in diesem Biom

- **Materialien (5):** Erde/Humus, Holz/Wurzeln, Erde, lehmige Erde, Pilz
- **Objekte (1):** Tempelbrücken
