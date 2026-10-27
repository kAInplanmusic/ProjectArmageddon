# Biom 18: Abyssale Tiefsee / Versunkene Alien-Metropole

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Dunkles Unterwassergebiet: Basaltgräben, versunkene Gebäude, Druckkammern, Korallen, Leuchtalgen, Hydrothermalquellen; mehrere Tiefenstufen; Druck nur an definierte Tiefenzonen gebunden.

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Tiefseeschlamm | beide | – | ja (tiefseeschlamm, weich) | ja | offen | weich | offen | **einzigartig** |
| Basalt | SSOT | – | ja (basalt, hart) | ja | offen | hart | offen | 1 Vulkan & Lavafeld; 14 Planet (eine Karte, Art per Zufall); 15 Vulkanische Schlackeschmiede |
| Koralle | beide | – | ja (koralle, normal) | ja | offen | normal | offen | 8 Korallenriff |
| Metall | SSOT | – | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen | 6 Schrottplatz; 12 Fabrik & Hochhausruine; 14 Planet (eine Karte, Art per Zufall); 17 Bio-Alien-Tempelstadt |
| Leuchtkristall | SSOT | – | ja (leuchtkristall, hart) | ja | offen | hart | offen | **einzigartig** |
| Hydrothermalablagerungen | SSOT | – | ja (hydrothermalablagerungen, normal) | ähnlich: hydrothermal.jpg | offen | normal | offen | **einzigartig** |
| Druckkammer | SSOT | – | ja (druckkammer, sehr_hart) | ja | offen | sehr_hart | offen | **einzigartig** |
| Leuchtalgen | SSOT | – | ja (leuchtalgen, weich) | ja | offen | weich | offen | **einzigartig** |
| Tiefseebasalt | Manifest | – | ja (tiefseebasalt, hart) | ähnlich: basalt.jpg | offen | hart | offen | **einzigartig** |
| korrodiertes Metall | Manifest | – | ja (korrodiertes_metall, hart) | ähnlich: metall.webp | offen | hart | offen | **einzigartig** |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | Tiefseeschlamm |
| Kern | Tiefseebasalt |
| Adern und Einschlüsse | korrodiertes Metall/Koralle |

## Wasser / Fluid (Manifest)

- Tiefseegraben — **Abgrund**

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
