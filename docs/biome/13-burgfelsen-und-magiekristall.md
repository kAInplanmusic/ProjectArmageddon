# Biom 13: Burgfelsen & Magiekristall

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Befestigte Felsen, Mauern, Türme, Zugbrücken, Kerker, Magiekristalle (Energiespeicher; wirken nur auf definierte magische/energetische Mechaniken).

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Burgfelsen | SSOT | – | ähnlich: fels | ja | offen | offen | offen | **einzigartig** |
| Mauerwerk | beide | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Holzaufbauten | SSOT | – | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen | **einzigartig** |
| Magiekristall | beide | – | ja (magiekristall, hart) | ja | offen | hart | offen | **einzigartig** |
| Metallgitter | SSOT | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |
| Erdüberzug | SSOT | – | fehlt | ja | offen | offen | offen | 7 Kristall-Archipel |
| Kerkergewölbe | SSOT | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Mutterboden | Manifest | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Holz | Manifest | – | ja (holz, normal) | ja | offen | normal | offen | 3 Dschungel & Sumpf; 6 Schrottplatz; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall); 20 Versteinerter Kristallwald / Uralter Koloss-Wald |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Mutterboden |
| Kern | Mauerwerk |
| Adern und Einschlüsse | Magiekristall/Holz |

## Wasser / Fluid (Manifest)

- Burggraben

## Spezial-Items und Begebenheiten (Manifest)

- Magiekristalle
- Prisma-Stelen
- Mauerwerk
- Zugbrücken/Falltüren
- Burggraben

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Burgmauern | offen | offen | offen | **einzigartig** |
| Türme | offen | offen | offen | **einzigartig** |
| Kerker | offen | offen | offen | **einzigartig** |
| Magiekristalle | offen | offen | offen | **einzigartig** |
| Zugbrücken | offen | offen | offen | **einzigartig** |
| Fallgitter | offen | offen | offen | **einzigartig** |
| Thronsaal | offen | offen | offen | **einzigartig** |

## Trigger

- Mauerbruch-Trigger — **einzigartig**
- Kristallüberlastungs-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Burg auf Plateau mit zerstörbarer Hauptbrücke
- mehrstöckige Festung
- Belagerungskarte
- Kristallkammer unter der Burg
- asymmetrische Burg mit Turmeinsturz

## Einzigartig in diesem Biom

- **Materialien (7):** Burgfelsen, Mauerwerk, Holzaufbauten, Magiekristall, Metallgitter, Kerkergewölbe, Mutterboden
- **Objekte (7):** Burgmauern, Türme, Kerker, Magiekristalle, Zugbrücken, Fallgitter, Thronsaal
