# Biom 17: Bio-Alien-Tempelstadt

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Überwucherte Alien-Stadt, Organik und Technik verschmolzen; Wurzeln tragen Plattformen; Myzel überträgt Zustände.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Humus | beide | – | ja (humus, weich) | ja | offen | weich | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf; 14 Planet (eine Karte, Art per Zufall) |
| Tempelstein | beide | – | ja (tempelstein, hart) | ja | offen | hart | offen | **einzigartig** |
| Alienharz | beide | – | ja (alienharz, weich) | ja | offen | weich | offen | 3 Dschungel & Sumpf |
| Metallplatten | SSOT | – | ja (metallplatten, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen | 12 Fabrik & Hochhausruine |
| Pilzmyzel | beide | – | ja (pilzmyzel, weich) | ähnlich: myzel.jpg | offen | weich | offen | 9 Pilzwald & Säuresumpf |
| Rankgitter | SSOT | – | ja (rankgitter, weich) | ja | offen | weich | offen | **einzigartig** |
| Säureablagerungen | SSOT | – | ja (saeureablagerungen, weich) | ja | offen | weich | offen | **einzigartig** |
| Organische Tragwurzeln | SSOT | – | ja (organische_tragwurzeln, normal) | ja | offen | normal | offen | **einzigartig** |
| Metall | Manifest | – | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall); 18 Abyssale Tiefsee / Versunkene Alien-Metropole |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Humus/Tempelstein |
| Kern | Tempelstein |
| Adern und Einschlüsse | Alienharz/Metall/Myzel |

## Wasser / Fluid (Manifest)

- Bio-Säurewasser (ätzend)

## Spezial-Items und Begebenheiten (Manifest)

- Alienharz
- Myzel
- Tempelmechanismen
- Bio-Säure
- Sporen
- Wurzelherzen

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Alien-Totems | offen | offen | offen | **einzigartig** |
| Sporenschwämme | offen | offen | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf |
| Rankenaufzüge | offen | offen | offen | 3 Dschungel & Sumpf; 14 Planet (eine Karte, Art per Zufall) |
| Säurebecken | offen | offen | offen | 3 Dschungel & Sumpf; 9 Pilzwald & Säuresumpf |
| Generatoren | offen | offen | offen | 12 Fabrik & Hochhausruine |
| Wurzelherzen | offen | offen | offen | 3 Dschungel & Sumpf |
| Insektennester | offen | offen | offen | 3 Dschungel & Sumpf |

## Trigger

- Bio-Netzwerk-Trigger — **einzigartig**
- Wurzelbruch-Trigger — auch in: 20 Versteinerter Kristallwald / Uralter Koloss-Wald

## Sonderwirkung

Netzwerkreaktion (Verlust eines Myzelknotens trennt nur angeschlossene Verbindungen)

## Kartenformen

- vertikale Tempelstadt
- getrennte Bio- und Technikennetze
- Arena auf Wurzelplattformen
- Generatoren steuern Türen und Barrieren
- unterirdischer Tempel mit Säure und Myzelbrücken

## Einzigartig in diesem Biom

- **Materialien (4):** Tempelstein, Rankgitter, Säureablagerungen, Organische Tragwurzeln
- **Objekte (1):** Alien-Totems
