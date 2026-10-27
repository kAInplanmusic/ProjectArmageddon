# Biom 10: Asteroidenfeld

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Asteroiden als Geländeinseln, Regolith, Metalltrümmer, Kristall, Eisadern; Trägheit/geringe Gravitation; Randabbrüche; Gravitationssenken sind Kartenobjekte, kein Material; im Vakuum kein atmosphärischer Flächenbrand.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Regolith-Staub | beide | – | ja (regolith_staub, weich) | ähnlich: regolith.jpg | offen | weich | offen | **einzigartig** |
| Asteroidenbasalt | SSOT | – | ja (asteroidenbasalt, hart) | ja | offen | hart | offen | **einzigartig** |
| Metallader | SSOT | – | ja (metallader, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen | **einzigartig** |
| Kristalladern | SSOT | – | ja (kristalladern, hart) | ähnlich: kristall.webp | offen | hart | offen | 2 Kristallhöhlen; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Eisader | SSOT | – | ja (eisader, normal) | ja | offen | normal | offen | **einzigartig** |
| Poröser Fels | SSOT | – | ja (poroeser_fels, hart) | ja | offen | hart | offen | **einzigartig** |
| Metalltrümmer | SSOT | – | ja (metalltruemmer, normal) | ähnlich: metall.webp | offen | normal | offen | **einzigartig** |
| Meteoritenfels | Manifest | – | ja (meteoritenfels, sehr_hart) | ja | offen | sehr_hart | offen | **einzigartig** |
| Nickel-Eisen | Manifest | – | ja (nickel_eisen, sehr_hart) | ja | offen | sehr_hart | offen | **einzigartig** |
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
