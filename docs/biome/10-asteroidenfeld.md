# Biom 10: Asteroidenfeld

> Erzeugt aus `docs/biome-ssot.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die SSOT.

## Beschreibung

Asteroiden als Geländeinseln, Regolith, Metalltrümmer, Kristall, Eisadern; Trägheit/geringe Gravitation; Randabbrüche; Gravitationssenken sind Kartenobjekte, kein Material; im Vakuum kein atmosphärischer Flächenbrand.

## Materialien (Terrain)

| Material | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Regolith | – | ja (regolith, weich) | ja | offen | weich | offen | **einzigartig** |
| Asteroidenbasalt | – | ähnlich: basalt | ähnlich: basalt.jpg | offen | offen | offen | **einzigartig** |
| Metallader | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |
| Kristallader | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | 2 Kristallhöhlen; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Eisader | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Poröser Fels | – | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen | **einzigartig** |
| Metalltrümmer | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Schwebende Asteroiden | offen | offen | offen | **einzigartig** |
| Metalltrümmer | offen | offen | offen | **einzigartig** |
| Kristallformationen | offen | offen | offen | 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Eisadern | offen | offen | offen | **einzigartig** |
| Satellitenwracks | offen | offen | offen | **einzigartig** |
| Gravitationssenken | offen | offen | offen | **einzigartig** |

## Trigger

- Trümmerfeld-Trigger — **einzigartig**
- Asteroidenbruch-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- mehrere Asteroiden mit Sprungverbindungen
- großer Zentralasteroid + zwei Seiteninseln
- Asteroidentunnel mit Kristall
- Arena mit Gravitationssenke
- Verbindungspunkte trennen Inseln

## Einzigartig in diesem Biom

- **Materialien (6):** Regolith, Asteroidenbasalt, Metallader, Eisader, Poröser Fels, Metalltrümmer
- **Objekte (5):** Schwebende Asteroiden, Metalltrümmer, Eisadern, Satellitenwracks, Gravitationssenken
