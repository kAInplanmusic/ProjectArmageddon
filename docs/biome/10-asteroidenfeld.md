# Biom 10: Asteroidenfeld

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Asteroiden als Geländeinseln, Regolith, Metalltrümmer, Kristall, Eisadern; Trägheit/geringe Gravitation; Randabbrüche; Gravitationssenken sind Kartenobjekte, kein Material; im Vakuum kein atmosphärischer Flächenbrand.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Regolith-Staub | beide | – | ähnlich: regolith | ähnlich: regolith.jpg | offen | offen | offen | **einzigartig** |
| Asteroidenbasalt | SSOT | – | ähnlich: basalt | ja | offen | offen | offen | **einzigartig** |
| Metallader | SSOT | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |
| Kristalladern | SSOT | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | 2 Kristallhöhlen; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Eisader | SSOT | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Poröser Fels | SSOT | – | ähnlich: fels | ja | offen | offen | offen | **einzigartig** |
| Metalltrümmer | SSOT | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |
| Meteoritenfels | Manifest | – | ähnlich: fels | ja | offen | offen | offen | **einzigartig** |
| Nickel-Eisen | Manifest | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Kristall | Manifest | – | ja (kristall, hart) | ja | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 11 Surreale Schwebewelt; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Regolith-Staub |
| Kern | Meteoritenfels |
| Adern und Einschlüsse | Nickel-Eisen/Kristall |

## Wasser / Fluid (Manifest)

- Weltraum-Leere — **Abgrund**
- kein Wasser

## Spezial-Items und Begebenheiten (Manifest)

- Asteroiden
- Nickel-Eisen-Adern
- Kristalle
- Einschläge/Trümmer
- Magnetfelder

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

- **Materialien (8):** Regolith-Staub, Asteroidenbasalt, Metallader, Eisader, Poröser Fels, Metalltrümmer, Meteoritenfels, Nickel-Eisen
- **Objekte (5):** Schwebende Asteroiden, Metalltrümmer, Eisadern, Satellitenwracks, Gravitationssenken
