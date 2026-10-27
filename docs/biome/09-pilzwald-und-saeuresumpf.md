# Biom 9: Pilzwald & Säuresumpf

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Riesenpilze, Myzelmatten (Netzwerk, Kaskaden), Sporenkammern, Säurepfützen, Pilzbrücken; Leuchtpilze.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Feuchte Erde | SSOT | – | ja (feuchte_erde, weich) | ja | offen | weich | offen | **einzigartig** |
| Pilzgewebe | beide | – | ähnlich: pilz | ähnlich: leuchtpilzgewebe.webp | offen | offen | offen | 3 Dschungel & Sumpf |
| Myzelmatte | SSOT | – | ja (myzelmatte, weich) | ähnlich: myzel.jpg | offen | weich | offen | **einzigartig** |
| Holzreste | SSOT | – | ja (holzreste, weich) | ja | offen | weich | offen | 6 Schrottplatz |
| Säureboden | SSOT | – | ja (saeureboden, weich) | ja | offen | weich | offen | 3 Dschungel & Sumpf |
| Fels | SSOT | – | ja (fels, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 3 Dschungel & Sumpf; 5 Wüstendünen; 6 Schrottplatz; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Pilzbrücke | SSOT | – | ja (pilzbruecke, normal) | ja | offen | normal | offen | **einzigartig** |
| Humus | Manifest | – | ja (humus, weich) | ja | offen | weich | offen | 3 Dschungel & Sumpf; 14 Planet (eine Karte, Art per Zufall); 17 Bio-Alien-Tempelstadt |
| Kontaminierte Erde | Manifest | – | ja (kontaminierte_erde, normal) | ja | offen | normal | offen | 6 Schrottplatz |
| Pilzmyzel | Manifest | – | ja (pilzmyzel, weich) | ähnlich: myzel.jpg | offen | weich | offen | 17 Bio-Alien-Tempelstadt |
| Holz | Manifest | – | ja (holz, normal) | ja | offen | normal | offen | 3 Dschungel & Sumpf; 6 Schrottplatz; 13 Burgfelsen & Magiekristall; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Pilzgewebe/Humus |
| Kern | kontaminierte Erde |
| Adern und Einschlüsse | Pilzmyzel/Holz |

## Wasser / Fluid (Manifest)

- Ätzende Säure

## Spezial-Items und Begebenheiten (Manifest)

- Sporenschwämme
- Wurzelherzen
- Insektennester
- Säureseen
- Schadgaswolken

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Riesenpilze | offen | offen | offen | **einzigartig** |
| Säurebecken | offen | offen | offen | 3 Dschungel & Sumpf; 17 Bio-Alien-Tempelstadt |
| Myzelnetze | offen | offen | offen | **einzigartig** |
| Pilzbrücken | offen | offen | offen | **einzigartig** |
| Sporenschwämme | offen | offen | offen | 3 Dschungel & Sumpf; 17 Bio-Alien-Tempelstadt |
| Leuchtpilze | offen | offen | offen | 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Trigger

- Fruchtkörper-Trigger — **einzigartig**
- Wachstums-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- unterirdischer Pilzwald mit Myzelbrücken
- Säurebecken mit Pilzstegen
- Lichtverhältnisse durch Leuchtpilze
- Myzelknoten gezielt trennen
- kollabierende organische Plattformen

## Einzigartig in diesem Biom

- **Materialien (3):** Feuchte Erde, Myzelmatte, Pilzbrücke
- **Objekte (3):** Riesenpilze, Myzelnetze, Pilzbrücken
