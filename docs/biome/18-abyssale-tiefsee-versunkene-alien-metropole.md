# Biom 18: Abyssale Tiefsee / Versunkene Alien-Metropole

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Dunkles Unterwassergebiet: Basaltgräben, versunkene Gebäude, Druckkammern, Korallen, Leuchtalgen, Hydrothermalquellen; mehrere Tiefenstufen; Druck nur an definierte Tiefenzonen gebunden.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Tiefseeschlamm | beide | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Basalt | SSOT | – | ja (basalt, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 14 Planet (eine Variante); 15 Vulkanische Schlackeschmiede |
| Koralle | beide | – | ja (koralle, normal) | ja | offen | normal | offen | 8 Korallenriff |
| Metall | SSOT | – | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine; 14 Planet (eine Variante); 17 Bio-Alien-Tempelstadt |
| Leuchtkristall | SSOT | – | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen | **einzigartig** |
| Hydrothermalablagerungen | SSOT | – | fehlt | ähnlich: hydrothermal.jpg | offen | offen | offen | **einzigartig** |
| Druckkammer | SSOT | – | fehlt | fehlt | offen | offen | offen | **einzigartig** |
| Leuchtalgen | SSOT | – | fehlt | ja | offen | offen | offen | **einzigartig** |
| Tiefseebasalt | Manifest | – | ähnlich: basalt | ähnlich: basalt.jpg | offen | offen | offen | **einzigartig** |
| korrodiertes Metall | Manifest | – | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Tiefseeschlamm |
| Kern | Tiefseebasalt |
| Adern und Einschlüsse | korrodiertes Metall/Koralle |

## Wasser / Fluid (Manifest)

- Tiefseegraben

## Spezial-Items und Begebenheiten (Manifest)

- Korallen
- korrodiertes Metall
- Tiefseeströmungen
- Druckbegebenheiten

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Hydrothermalquellen | offen | offen | offen | **einzigartig** |
| Versunkene Gebäude | offen | offen | offen | **einzigartig** |
| Leuchtalgenfelder | offen | offen | offen | **einzigartig** |
| Druckkammern | offen | offen | offen | **einzigartig** |
| Alien-Artefakte | offen | offen | offen | **einzigartig** |
| Tiefseegräben | offen | offen | offen | **einzigartig** |
| Korallenstöcke | offen | offen | offen | 8 Korallenriff |

## Trigger

- Druckentlastungs-Trigger — **einzigartig**
- Lichtausfall-Trigger — **einzigartig**

## Sonderwirkung

Druckentlastung (gerichtete Wasserbewegung)

## Kartenformen

- Unterwasserstadt über Graben
- hydrothermaler Canyon
- Druckkammern fluten Räume
- dunkle Ruinenkarte mit Lichtquellen
- Tiefenebenen mit Tunneln und Strömungen

## Einzigartig in diesem Biom

- **Materialien (7):** Tiefseeschlamm, Leuchtkristall, Hydrothermalablagerungen, Druckkammer, Leuchtalgen, Tiefseebasalt, korrodiertes Metall
- **Objekte (6):** Hydrothermalquellen, Versunkene Gebäude, Leuchtalgenfelder, Druckkammern, Alien-Artefakte, Tiefseegräben
