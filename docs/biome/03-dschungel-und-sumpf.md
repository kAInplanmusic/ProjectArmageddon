# Biom 3: Dschungel & Sumpf

> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die SSOT.

## Beschreibung

Weiches Erdreich, Wurzeln, Ranken, Wasserbecken, morsches Holz, Ruinen; Sumpf bremst; Wurzeln halten Erde zusammen (Hangrutsch bei Verlust); Sporen; Regen verändert Wasserstände.

## Materialien (Terrain)

| Material | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Erde/Humus | – | ähnlich: erde | ähnlich: erde.jpg | offen | offen | offen | **einzigartig** |
| Holz/Wurzeln | – | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen | **einzigartig** |
| Pilzgewebe | – | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen | 9 Pilzwald & Säuresumpf |
| Fels | – | ja (fels, hart) | ja | offen | hart | offen | 9 Pilzwald & Säuresumpf; 14 Planet (eine Variante) |
| Moos | – | fehlt | ja | offen | offen | offen | 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Alienharz | – | fehlt | ja | offen | offen | offen | 17 Bio-Alien-Tempelstadt |
| Säureboden | – | fehlt | fehlt | offen | offen | offen | 9 Pilzwald & Säuresumpf |

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

- **Materialien (2):** Erde/Humus, Holz/Wurzeln
- **Objekte (1):** Tempelbrücken
