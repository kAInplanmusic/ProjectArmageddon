# Biom 12: Fabrik & Hochhausruine

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Beton, Stahlträger, Förderanlagen, Aufzüge, Rohre; tragende und nicht tragende Teile getrennt; lokale Einstürze.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Beton | beide | – | ja (beton, hart) | ja | offen | hart | offen | 6 Schrottplatz; 14 Planet (eine Karte, Art per Zufall) |
| Metallträger | beide | – | ja (metalltraeger, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen | **einzigartig** |
| Metallplatten | SSOT | – | ja (metallplatten, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen | 17 Bio-Alien-Tempelstadt |
| Glasfassade | SSOT | – | ja (glasfassade, normal) | ja | offen | normal | offen | **einzigartig** |
| Rohrleitungen | SSOT | – | ja (rohrleitungen, hart) | ja | offen | hart | offen | **einzigartig** |
| Teer | SSOT | – | ja (teer, weich) | ja | offen | weich | offen | 5 Wüstendünen; 6 Schrottplatz; 11 Surreale Schwebewelt; 14 Planet (eine Karte, Art per Zufall) |
| Kontaminierte Ablagerungen | SSOT | – | ja (kontaminierte_ablagerungen, weich) | ja | offen | weich | offen | **einzigartig** |
| Poröser Beton | Manifest | – | ja (poroeser_beton, hart) | ähnlich: beton.jpg | offen | hart | offen | **einzigartig** |
| Stahlbeton | Manifest | – | ja (stahlbeton, sehr_hart) | ähnlich: beton.jpg | offen | sehr_hart | offen | **einzigartig** |
| Metall | Manifest | – | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 6 Schrottplatz; 14 Planet (eine Karte, Art per Zufall); 17 Bio-Alien-Tempelstadt; 18 Abyssale Tiefsee / Versunkene Alien-Metropole |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | poröser Beton |
| Kern | Stahlbeton |
| Adern und Einschlüsse | Metallträger/Beton |

## Wasser / Fluid (Manifest)

- Industriegift

## Spezial-Items und Begebenheiten (Manifest)

- Förderbänder
- Magnetturbinen
- Giftfässer
- Industrieaufzüge
- Stromleitungen
- einsturzgefährdete Etagen

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Förderbänder | offen | offen | offen | **einzigartig** |
| Giftfässer | offen | offen | offen | 6 Schrottplatz; 14 Planet (eine Karte, Art per Zufall) |
| Aufzüge | offen | offen | offen | **einzigartig** |
| Schrottpressen | offen | offen | offen | **einzigartig** |
| Dampfrohre | offen | offen | offen | **einzigartig** |
| Generatoren | offen | offen | offen | 17 Bio-Alien-Tempelstadt |

## Trigger

- Trägerbruch-Trigger — **einzigartig**
- Notabschaltungs-Trigger — **einzigartig**

## Sonderwirkung

keine eigene; es gelten die Standardreaktionen der SSOT.

## Kartenformen

- Hochhausquerschnitt mit Etagen
- Fabrikhalle
- Karte mit gefluteter Unterebene
- vertikaler Aufzugsschacht
- Gebäudeflügel stürzt bei Trägerverlust

## Einzigartig in diesem Biom

- **Materialien (6):** Metallträger, Glasfassade, Rohrleitungen, Kontaminierte Ablagerungen, Poröser Beton, Stahlbeton
- **Objekte (4):** Förderbänder, Aufzüge, Schrottpressen, Dampfrohre
