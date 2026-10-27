# Biom 8: Korallenriff

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Unterwasser, mehrere Tiefenebenen, Strömung, Seegras, Höhlen, Wracks; Wasser als eigenes Medium (Schussbahnen und Explosionen anders als an Land).

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Unterwassersand | SSOT | – | ja (unterwassersand, weich) | ähnlich: wasser.webp | offen | weich | offen | **einzigartig** |
| Koralle | beide | – | ja (koralle, normal) | ja | offen | normal | offen | 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Kalkstein | SSOT | – | ja (kalkstein, normal) | ja | offen | normal | offen | 2 Kristallhöhlen |
| Seegras | SSOT | – | ja (seegras, weich) | ja | offen | weich | offen | **einzigartig** |
| Unterwasserfels | SSOT | – | ja (unterwasserfels, hart) | ähnlich: wasser.webp | offen | hart | offen | **einzigartig** |
| Organische Riffablagerungen | SSOT | – | ja (organische_riffablagerungen, weich) | ja | offen | weich | offen | **einzigartig** |
| Wasser | SSOT | – | ja (wasser, weich) | ja | offen | weich | offen | **einzigartig** |
| Feinsand | Manifest | – | ja (feinsand, weich) | ähnlich: sand.jpg | offen | weich | offen | 5 Wüstendünen |
| Riff-Kalkstein | Manifest | – | ja (riff_kalkstein, normal) | ähnlich: kalkstein.jpg | offen | normal | offen | **einzigartig** |
| lebende Koralle | Manifest | – | ja (lebende_koralle, normal) | ähnlich: koralle.webp | offen | normal | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Feinsand/Koralle |
| Kern | Riff-Kalkstein |
| Adern und Einschlüsse | lebende Koralle |

## Wasser / Fluid (Manifest)

- Tiefsee
- Strömung

## Spezial-Items und Begebenheiten (Manifest)

- Lebende Korallen
- Strömungen
- Riffgänge
- Korallenbarrieren

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Korallenstöcke | offen | offen | offen | 18 Abyssale Tiefsee / Versunkene Alien-Metropole |
| Unterwasserhöhlen | offen | offen | offen | **einzigartig** |
| Sandbänke | offen | offen | offen | **einzigartig** |
| Strömungskorridore | offen | offen | offen | **einzigartig** |
| Giftanemonen | offen | offen | offen | **einzigartig** |
| Schiffswracks | offen | offen | offen | **einzigartig** |
| Luftblasenquellen | offen | offen | offen | **einzigartig** |

## Trigger

- Riffbruch-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Unterwasser-Canyon
- Wrack mit Korallenwänden
- Sandbänke mit Strömung
- Arena mit absinkendem Sand
- Korallenbögen, die Passagen verschließen

## Einzigartig in diesem Biom

- **Materialien (7):** Unterwassersand, Seegras, Unterwasserfels, Organische Riffablagerungen, Wasser, Riff-Kalkstein, lebende Koralle
- **Objekte (6):** Unterwasserhöhlen, Sandbänke, Strömungskorridore, Giftanemonen, Schiffswracks, Luftblasenquellen
