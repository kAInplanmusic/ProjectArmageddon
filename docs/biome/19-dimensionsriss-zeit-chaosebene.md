# Biom 19: Dimensionsriss / Zeit-Chaosebene

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern, sondern die Quellen.

## Beschreibung

Zerbrochene Landschaft aus instabilem Fels, Zeitkristallen, schwebenden Fragmenten und Raumrissen; Schwerpunkt auf zeitabhängigen Zuständen (Plattformen bewegen sich, Oberflächen wechseln, Objekte reagieren verzögert).

## Materialien (Terrain)

| Material | Quelle | Variante | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung | Auch in |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Instabiler Boden | beide | – | ja (instabiler_boden, weich) | ja | offen | weich | offen | **einzigartig** |
| Massivfels | SSOT | – | ja (massivfels, hart) | ähnlich: fels.jpg | offen | hart | offen | 2 Kristallhöhlen; 4 Eiswüste & Gletscher; 7 Kristall-Archipel; 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel; 20 Versteinerter Kristallwald / Uralter Koloss-Wald |
| Zeitkristall | beide | – | ja (zeitkristall, hart) | ähnlich: kristall.webp | offen | hart | offen | **einzigartig** |
| Glasfragmente | SSOT | – | ja (glasfragmente, weich) | ja | offen | weich | offen | **einzigartig** |
| Metallfragmente | SSOT | – | ja (metallfragmente, normal) | ähnlich: metall.webp | offen | normal | offen | **einzigartig** |
| Schwebende Plattformen | SSOT | – | ja (schwebende_plattformen, hart) | ja | offen | hart | offen | **einzigartig** |
| Risszone | SSOT | – | ja (risszone, weich) | ja | offen | weich | offen | **einzigartig** |
| Stabilisatormaterial | SSOT | – | ja (stabilisatormaterial, unzerstoerbar) | ja | offen | unzerstoerbar | offen | **einzigartig** |
| Phasen-Fels | Manifest | – | ja (phasen_fels, hart) | ja | offen | hart | offen | **einzigartig** |
| Glas | Manifest | – | ja (glas, normal) | ja | offen | normal | offen | 11 Surreale Schwebewelt; 16 Kristallines Schwebearchipel |

## Bodenschichten (Manifest)

| Schicht | Material |
| :-- | :-- |
| Deck | instabiler Boden |
| Kern | Phasen-Fels |
| Adern und Einschlüsse | Zeitkristall/Glas |

## Wasser / Fluid (Manifest)

- Zeit-Vortex — **Abgrund**

## Spezial-Items und Begebenheiten (Manifest)

- Zeitkristalle
- Zeitverzerrung
- Raumrisse
- Phasenwechsel
- instabiler Boden

## Objekte

| Objekt | Zustände | Auslöser | Folgen | Auch in |
| :-- | :-- | :-- | :-- | :-- |
| Zeitrisse | offen | offen | offen | **einzigartig** |
| Schwebende Fragmente | offen | offen | offen | **einzigartig** |
| Instabile Plattformen | offen | offen | offen | **einzigartig** |
| Portale | offen | offen | offen | **einzigartig** |
| Zeitkristalle | offen | offen | offen | **einzigartig** |
| Chaospunkte | offen | offen | offen | **einzigartig** |
| Stabilisatoren | offen | offen | offen | **einzigartig** |

## Trigger

- Zeitablauf-Trigger — **einzigartig**
- Dimensionswechsel-Trigger — **einzigartig**

## Sonderwirkung

Zeitimpuls, Dimensionsimpuls (nur markierte Objekte/Verbindungen)

## Kartenformen

- mehrschichtige Fragmentkarte mit Zeitbrücken
- zwei Teilkarten über Portal mit wechselndem Ausgang
- Zeitkristall stellt Plattform wieder her
- instabiles Labyrinth
- Stabilisatoren-Arena

## Einzigartig in diesem Biom

- **Materialien (8):** Instabiler Boden, Zeitkristall, Glasfragmente, Metallfragmente, Schwebende Plattformen, Risszone, Stabilisatormaterial, Phasen-Fels
- **Objekte (7):** Zeitrisse, Schwebende Fragmente, Instabile Plattformen, Portale, Zeitkristalle, Chaospunkte, Stabilisatoren
