# Biom 1: Vulkan & Lavafeld

> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die SSOT.

## Beschreibung

Steile Basaltwände, Lavazungen, Magmakanäle, poröse Asche; Lava ist ein eigenes Gefahrenmedium, keine Bodenart; Kanäle brechen durch Risse/Sprengung/Druck auf; Dampf bei Lava+Wasser; Obsidian spröde; Schwefel setzt Giftgas frei; Kruste bricht wieder auf.

## Materialien (Terrain)

| Material | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Vulkanasche | – | ähnlich: asche | fehlt | offen | offen | offen | **einzigartig** |
| Basalt | – | ja (basalt, hart) | ja | offen | hart | offen | 14 Planet (eine Variante); 15 Vulkanische Schlackeschmiede; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Obsidian | – | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 2 Kristallhöhlen; 7 Kristall-Archipel; 14 Planet (eine Variante); 15 Vulkanische Schlackeschmiede |
| Magmaader | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Schlacke | – | fehlt | ja | offen | offen | offen | 14 Planet (eine Variante); 15 Vulkanische Schlackeschmiede |
| Schwefelkruste | – | fehlt | ja | offen | offen | offen | **einzigartig** |

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Lavaseen | offen | offen | offen | 14 Planet (eine Variante) |
| Dampfventile | offen | offen | offen | 14 Planet (eine Variante); 15 Vulkanische Schlackeschmiede |
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

- **Materialien (3):** Vulkanasche, Magmaader, Schwefelkruste
- **Objekte (2):** Obsidianstelen, Schmiedeöfen
