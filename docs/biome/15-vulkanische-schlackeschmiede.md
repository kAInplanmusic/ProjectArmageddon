# Biom 15: Vulkanische Schlackeschmiede

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Industrieanlage im Vulkan: Förderplattformen, Schmelzöfen, Keramikschilde, Metallkräne, Dampfkammern auf Schlacke und Basalt.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Schlacke | beide | – | fehlt | ja | offen | offen | offen | 1 Vulkan & Lavafeld; 14 Planet (eine Karte, Art per Zufall) |
| Basalt | beide | – | ja (basalt, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 14 Planet (eine Karte, Art per Zufall); 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Metallschienen | beide | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |
| Obsidian | SSOT | – | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen | 1 Vulkan & Lavafeld; 2 Kristallhöhlen; 7 Kristall-Archipel; 14 Planet (eine Karte, Art per Zufall) |
| Keramik | beide | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Dampfkammer | SSOT | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Lavaglas | SSOT | – | ähnlich: glas | ja | offen | offen | offen | **einzigartig** |
| Bimsstein | SSOT | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Industriemagma | Manifest | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Schlacke/Basalt |
| Kern | Keramik/Basalt |
| Adern und Einschlüsse | Metallschienen/Keramik |

## Wasser / Fluid (Manifest)

- Industriemagma (tödlich)

## Spezial-Items und Begebenheiten (Manifest)

- Schlackekessel
- Dampfventile
- Keramikschilde
- Metallschienen
- Hitzeschilde

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Förderplattformen | offen | offen | offen | **einzigartig** |
| Dampfventile | offen | offen | offen | 1 Vulkan & Lavafeld; 14 Planet (eine Karte, Art per Zufall) |
| Metallkräne | offen | offen | offen | **einzigartig** |
| Druckkessel | offen | offen | offen | 1 Vulkan & Lavafeld |
| Lavaglaswände | offen | offen | offen | **einzigartig** |
| Keramikschilde | offen | offen | offen | **einzigartig** |
| Schmelzöfen | offen | offen | offen | **einzigartig** |

## Trigger

- Druckanstiegs-Trigger — **einzigartig**
- Förderstau-Trigger — **einzigartig**

## Sonderwirkung

Überdruck (gerichtete Dampf-/Fragmentwirkung ohne Totalzerstörung)

## Kartenformen

- mehrstöckige Schmiede über Schmelzkanal
- drei Druckkessel steuern Plattformen
- Kranschacht
- Lavaglas-Labyrinth
- Förderstau-Kettenreaktion

## Einzigartig in diesem Biom

- **Materialien (6):** Metallschienen, Keramik, Dampfkammer, Lavaglas, Bimsstein, Industriemagma
- **Objekte (5):** Förderplattformen, Metallkräne, Lavaglaswände, Keramikschilde, Schmelzöfen
