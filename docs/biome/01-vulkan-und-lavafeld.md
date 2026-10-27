# Biom 1: Vulkan & Lavafeld

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Steile Basaltwände, Lavazungen, Magmakanäle, poröse Asche; Lava ist ein eigenes Gefahrenmedium, keine Bodenart; Kanäle brechen durch Risse/Sprengung/Druck auf; Dampf bei Lava+Wasser; Obsidian spröde; Schwefel setzt Giftgas frei; Kruste bricht wieder auf.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Asche | beide | – | ja (asche, weich) | ja | offen | weich | offen | 14 Planet (eine Karte, Art per Zufall) |
| Basalt | beide | – | ja (basalt, hart) | ja | offen | hart | offen | 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Obsidian | beide | – | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 2 Kristallhöhlen; 7 Kristall-Archipel; 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede |
| Magmaadern | SSOT | – | ja (magmaadern, hart) | ja | offen | hart | offen | 14 Planet (eine Karte, Art per Zufall) |
| Schlacke | beide | – | ja (schlacke, normal) | ja | offen | normal | offen | 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede |
| Schwefelkruste | SSOT | – | ja (schwefelkruste, normal) | ja | offen | normal | offen | **einzigartig** |
| Fels | Manifest | – | ja (fels, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 3 Dschungel & Sumpf; 5 Wüstendünen; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Asche/Basalt |
| Kern | Basalt |
| Adern und Einschlüsse | Obsidian/Fels |

## Wasser / Fluid (Manifest)

- Lava (tödlich)
- kein Wasser

## Spezial-Items und Begebenheiten (Manifest)

- Dampfventile
- Schlackekessel
- Lavafontänen
- Hitzesprung/Risse
- glühende Brandspuren

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Lavaseen | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall) |
| Dampfventile | offen | offen | offen | 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede |
| Druckkessel | offen | offen | offen | 15 Vulkanische Schlackeschmiede |
| Obsidianstelen | offen | offen | offen | **einzigartig** |
| Schmiedeöfen | offen | offen | offen | **einzigartig** |

## Trigger

- Magmaausbruch-Trigger — **einzigartig**
- Abkühlungs-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Vulkankegel mit Kratern und Höhenstufen
- zwei Kampfbereiche über zerstörbare Basaltbrücken
- unterirdische Lavakanäle
- Aschehänge mit Abrutsch
- Basaltwall, dessen Zerstörung einen Lavastrom umleitet

## Einzigartig in diesem Biom

- **Materialien (1):** Schwefelkruste
- **Objekte (2):** Obsidianstelen, Schmiedeöfen
