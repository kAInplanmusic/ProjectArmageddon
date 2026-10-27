# Gesamtliste: Materialien, Objekte, Trigger, Sonderwirkungen

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern.

Jede Zeile ist ein Eintrag, der **einzeln** gebaut und mit den drei Eigenschaften belegt wird: **Optik**, **Zerstörbarkeit**, **Bewegung** (Reihenfolge laut Auftraggeber). „Biome“ nennt die Nummern aus der SSOT.

**Stand:** 20 Biome · 124 Materialien (56 ohne Katalogeintrag) · 111 Objekte · 32 Trigger. Quellen: docs/biome-ssot.md und docs/biome-manifest.md (Spalte „Quelle“).

## Vereinheitlichte Namen

Diese Schreibweisen wurden zusammengelegt (links der frühere Name, rechts der gültige):

| Früher | Gilt |
| :-- | :-- |
| Erde/Humus | Erde und Humus |
| Holz/Wurzeln | Holz und Wurzeln |
| Erdauflage | Erdüberzug |
| Erdaufschüttung | Erdüberzug |
| Loser Sand | Feinsand |
| Firn | Firnschnee |
| Klarer Kristall | Klareiskristall |
| Massiver Fels | Massivfels |
| kontaminierte Erde | Kontaminierte Erde |
| versteinertes Holz | Versteinertes Holz |
| Magmaader | Magmaadern |
| Kristallader | Kristalladern |
| Pilz | Pilze |
| Myzel | Pilzmyzel |
| Stahlträger | Metallträger |
| Regolith | Regolith-Staub |
| Nebelstein | Wolkenstein |
| Vulkanasche | Asche |
| Intaktes Metall | Metall |

## Materialien

| Material | Quelle | Biome | Im Katalog | Textur | Optik | Zerstörbarkeit | Bewegung |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Alienharz | SSOT/beide | 3, 17 | fehlt | ja | offen | offen | offen |
| Asche | beide/SSOT | 1, 14 | ja (asche, weich) | fehlt | offen | weich | offen |
| Asteroidenbasalt | SSOT | 10 | ähnlich: basalt | ähnlich: basalt.jpg | offen | offen | offen |
| Basalt | beide/SSOT | 1, 14, 15, 18 | ja (basalt, hart) | ja | offen | hart | offen |
| Beton | Manifest/beide/SSOT | 6, 12, 14 | ja (beton, hart) | ja | offen | hart | offen |
| Betonreste | SSOT | 6 | ähnlich: beton | ähnlich: beton.jpg | offen | offen | offen |
| Bimsstein | SSOT | 15 | fehlt | ja | offen | offen | offen |
| Burgfelsen | SSOT | 13 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Dampfkammer | SSOT | 15 | fehlt | fehlt | offen | offen | offen |
| Druckkammer | SSOT | 18 | fehlt | fehlt | offen | offen | offen |
| Eis | Manifest/SSOT | 4, 14, 16 | ja (eis, normal) | ja | offen | normal | offen |
| Eisader | SSOT | 10 | fehlt | fehlt | offen | offen | offen |
| Erde | beide | 3 | ja (erde, normal) | ja | offen | normal | offen |
| Erdüberzug | beide/SSOT | 7, 13 | fehlt | fehlt | offen | offen | offen |
| Feinsand | beide/Manifest | 5, 8 | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen |
| Fels | Manifest/beide/SSOT | 1, 2, 3, 5, 6, 9, 14, 20 | ja (fels, hart) | ja | offen | hart | offen |
| Feuchte Erde | SSOT | 9 | ähnlich: erde | ähnlich: teer.jpg | offen | offen | offen |
| Firnschnee | SSOT/beide | 4, 14, 16 | ähnlich: schnee | ähnlich: firn.jpg | offen | offen | offen |
| Gefrorene Wurzeln | SSOT | 4 | fehlt | fehlt | offen | offen | offen |
| gehärtetes Glas | Manifest | 11 | ähnlich: glas | ähnlich: glas.webp | offen | offen | offen |
| Geröll | SSOT | 14 | fehlt | fehlt | offen | offen | offen |
| Giftablagerungen | SSOT | 6 | fehlt | fehlt | offen | offen | offen |
| Giftnebel | SSOT | 11 | fehlt | fehlt | offen | offen | offen |
| Glas | beide/SSOT/Manifest | 11, 16, 19 | ja (glas, normal) | ja | offen | normal | offen |
| Glasfassade | SSOT | 12 | ähnlich: glas | ähnlich: glas.webp | offen | offen | offen |
| Glasfragmente | SSOT | 19 | ähnlich: glas | ähnlich: glas.webp | offen | offen | offen |
| Glasplatten | SSOT | 7 | ähnlich: glas | ähnlich: glas.webp | offen | offen | offen |
| Gletschereis | SSOT | 4 | fehlt | fehlt | offen | offen | offen |
| Holz | beide/Manifest/SSOT | 3, 6, 9, 13, 14, 20 | ja (holz, normal) | ja | offen | normal | offen |
| Holzaufbauten | SSOT | 13 | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen |
| Holzreste | SSOT | 6, 9 | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen |
| Humus | beide/Manifest/SSOT | 3, 9, 14, 17 | fehlt | fehlt | offen | offen | offen |
| Hydrothermalablagerungen | SSOT | 18 | fehlt | ähnlich: hydrothermal.jpg | offen | offen | offen |
| Industriemagma | Manifest | 15 | fehlt | fehlt | offen | offen | offen |
| Instabiler Boden | beide | 19 | fehlt | ja | offen | offen | offen |
| Kalkstein | beide/SSOT | 2, 8 | fehlt | ja | offen | offen | offen |
| Keramik | beide | 15 | fehlt | ja | offen | offen | offen |
| Kerkergewölbe | SSOT | 13 | fehlt | fehlt | offen | offen | offen |
| Klareis | Manifest | 4, 16 | fehlt | fehlt | offen | offen | offen |
| Klareiskristall | SSOT/beide | 4, 16 | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen |
| Kolossstamm | SSOT | 20 | fehlt | fehlt | offen | offen | offen |
| Kontaminierte Ablagerungen | SSOT | 12 | fehlt | fehlt | offen | offen | offen |
| Kontaminierte Erde | beide/Manifest | 6, 9 | ähnlich: erde | ähnlich: teer.jpg | offen | offen | offen |
| Koralle | beide | 8, 18 | ja (koralle, normal) | ja | offen | normal | offen |
| korrodiertes Metall | Manifest | 18 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Korrosion | SSOT | 14 | fehlt | fehlt | offen | offen | offen |
| Kristall | Manifest/beide/SSOT | 2, 4, 7, 10, 11, 14, 20 | ja (kristall, hart) | ja | offen | hart | offen |
| Kristalladern | SSOT | 2, 10, 14, 20 | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen |
| Kristallblätter | SSOT | 20 | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen |
| Kristallfelsen | Manifest | 7 | ähnlich: fels | ähnlich: kristall.webp | offen | offen | offen |
| Lavaglas | SSOT | 15 | ähnlich: glas | ja | offen | offen | offen |
| lebende Koralle | Manifest | 8 | ähnlich: koralle | ähnlich: koralle.webp | offen | offen | offen |
| lehmige Erde | Manifest | 3 | ähnlich: erde | ähnlich: erde.jpg | offen | offen | offen |
| Leuchtalgen | SSOT | 18 | fehlt | ja | offen | offen | offen |
| Leuchtkristall | SSOT | 18 | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen |
| Leuchtpilzgewebe | SSOT | 20 | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen |
| Magiekristall | beide | 13 | ja (magiekristall, hart) | ja | offen | hart | offen |
| Magmaadern | SSOT | 1, 14 | fehlt | fehlt | offen | offen | offen |
| Magnetgestein | SSOT/beide | 7, 16 | fehlt | ja | offen | offen | offen |
| Massivfels | SSOT/beide | 2, 4, 7, 11, 16, 19, 20 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Mauerwerk | beide | 13 | fehlt | ja | offen | offen | offen |
| Metall | beide/Manifest/SSOT | 6, 12, 14, 17, 18 | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen |
| Metallader | SSOT | 10 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metallfragmente | SSOT | 19 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metallgitter | SSOT | 13 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metallplatten | SSOT | 12, 17 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metallschienen | beide | 15 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metallträger | beide | 12 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Metalltrümmer | SSOT | 10 | ähnlich: metall | ähnlich: metall.webp | offen | offen | offen |
| Meteoritenfels | Manifest | 10 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Moos | SSOT/beide | 3, 20 | fehlt | ja | offen | offen | offen |
| Mutterboden | Manifest | 13 | fehlt | fehlt | offen | offen | offen |
| Myzelmatte | SSOT | 9 | fehlt | ähnlich: myzel.jpg | offen | offen | offen |
| Nickel-Eisen | Manifest | 10 | fehlt | fehlt | offen | offen | offen |
| Obsidian | beide/SSOT | 1, 2, 7, 14, 15 | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen |
| Organische Riffablagerungen | SSOT | 8 | fehlt | fehlt | offen | offen | offen |
| Organische Tragwurzeln | SSOT | 17 | fehlt | fehlt | offen | offen | offen |
| Phasen-Fels | Manifest | 19 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Pilzbrücke | SSOT | 9 | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen |
| Pilze | Manifest/SSOT | 3, 14 | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen |
| Pilzgewebe | SSOT/beide | 3, 9 | ähnlich: pilz | ähnlich: pilz.jpg | offen | offen | offen |
| Pilzmyzel | Manifest/beide | 9, 17 | ähnlich: pilz | ähnlich: myzel.jpg | offen | offen | offen |
| Poröser Beton | Manifest | 12 | ähnlich: beton | ähnlich: beton.jpg | offen | offen | offen |
| Poröser Fels | SSOT | 10 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Pulverschnee | SSOT | 4 | ähnlich: schnee | ähnlich: schnee.jpg | offen | offen | offen |
| Rankgitter | SSOT | 17 | fehlt | fehlt | offen | offen | offen |
| Raumanker | SSOT | 11 | fehlt | fehlt | offen | offen | offen |
| Regolith-Staub | beide | 10 | ähnlich: regolith | ähnlich: regolith.jpg | offen | offen | offen |
| Riff-Kalkstein | Manifest | 8 | fehlt | ähnlich: kalkstein.jpg | offen | offen | offen |
| Risszone | SSOT | 19 | fehlt | fehlt | offen | offen | offen |
| Rohrleitungen | SSOT | 12 | fehlt | fehlt | offen | offen | offen |
| Rostmetall | beide/SSOT | 6, 14 | ähnlich: metall | ja | offen | offen | offen |
| Salzkruste | SSOT | 5, 14 | fehlt | ja | offen | offen | offen |
| Sand | SSOT | 14 | ja (sand, weich) | ja | offen | weich | offen |
| Sandstein | beide/SSOT | 5, 14 | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen |
| Säureablagerungen | SSOT | 17 | fehlt | fehlt | offen | offen | offen |
| Säureboden | SSOT | 3, 9 | fehlt | fehlt | offen | offen | offen |
| Schlacke | beide/SSOT | 1, 14, 15 | fehlt | ja | offen | offen | offen |
| Schnee | Manifest/SSOT | 4, 14, 16 | ja (schnee, weich) | ja | offen | weich | offen |
| Schrott | SSOT | 14 | fehlt | fehlt | offen | offen | offen |
| Schwebende Plattformen | SSOT | 19 | fehlt | fehlt | offen | offen | offen |
| Schwefelkruste | SSOT | 1 | fehlt | ja | offen | offen | offen |
| Seegras | SSOT | 8 | fehlt | fehlt | offen | offen | offen |
| Stabilisatormaterial | SSOT | 19 | fehlt | fehlt | offen | offen | offen |
| Stahlbeton | Manifest | 12 | ähnlich: beton | ähnlich: beton.jpg | offen | offen | offen |
| Stalaktiten | SSOT | 2 | fehlt | fehlt | offen | offen | offen |
| Teer | SSOT | 5, 6, 11, 12, 14 | fehlt | ja | offen | offen | offen |
| Tempelstein | beide | 17 | fehlt | ja | offen | offen | offen |
| Tiefenfels | Manifest | 4 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Tiefseebasalt | Manifest | 18 | ähnlich: basalt | ähnlich: basalt.jpg | offen | offen | offen |
| Tiefseeschlamm | beide | 18 | fehlt | ja | offen | offen | offen |
| Totholz & Knochen | SSOT | 5 | ähnlich: holz | ähnlich: holz.jpg | offen | offen | offen |
| Traumgestein | Manifest | 11 | fehlt | fehlt | offen | offen | offen |
| Treibsand | beide | 5 | ähnlich: sand | ja | offen | offen | offen |
| Unterwasserfels | SSOT | 8 | ähnlich: fels | ähnlich: fels.jpg | offen | offen | offen |
| Unterwassersand | SSOT | 8 | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen |
| Verdichteter Sand | SSOT | 5 | ähnlich: sand | ähnlich: sand.jpg | offen | offen | offen |
| Versteinerte Wurzeln | SSOT | 20 | fehlt | fehlt | offen | offen | offen |
| Versteinertes Holz | Manifest/beide | 5, 20 | ähnlich: holz | ja | offen | offen | offen |
| Wasser | SSOT | 8 | fehlt | fehlt | offen | offen | offen |
| Wasserader | SSOT | 2 | fehlt | fehlt | offen | offen | offen |
| Wolkenstein | SSOT | 7, 11, 16 | fehlt | ja | offen | offen | offen |
| Wurzeln | SSOT | 3, 14 | fehlt | fehlt | offen | offen | offen |
| Zeitkristall | beide | 19 | ähnlich: kristall | ähnlich: kristall.webp | offen | offen | offen |

## Objekte

| Objekt | Biome | Zustände | Auslöser | Folgen |
| :-- | :-- | :-- | :-- | :-- |
| Alien-Artefakte | 18 | offen | offen | offen |
| Alien-Totems | 17 | offen | offen | offen |
| Aufzüge | 12 | offen | offen | offen |
| Autowracks | 6 | offen | offen | offen |
| Burgmauern | 13 | offen | offen | offen |
| Chaospunkte | 19 | offen | offen | offen |
| Dampfrohre | 12 | offen | offen | offen |
| Dampfventile | 1, 14, 15 | offen | offen | offen |
| Druckkammern | 18 | offen | offen | offen |
| Druckkessel | 1, 15 | offen | offen | offen |
| Eisadern | 10 | offen | offen | offen |
| Eisbrücken | 4, 14, 16 | offen | offen | offen |
| Fallgitter | 13 | offen | offen | offen |
| Felsbrücken | 14 | offen | offen | offen |
| Förderbänder | 12 | offen | offen | offen |
| Förderplattformen | 15 | offen | offen | offen |
| gefrorene Wasserfälle | 4, 14 | offen | offen | offen |
| Generatoren | 12, 17 | offen | offen | offen |
| Geröllhänge | 14 | offen | offen | offen |
| Giftanemonen | 8 | offen | offen | offen |
| Giftfässer | 6, 12, 14 | offen | offen | offen |
| Glasbrücken | 7 | offen | offen | offen |
| Glasinseln | 11 | offen | offen | offen |
| Gravitationssenken | 10 | offen | offen | offen |
| Hydrothermalquellen | 18 | offen | offen | offen |
| Insektennester | 3, 17 | offen | offen | offen |
| Instabile Plattformen | 19 | offen | offen | offen |
| Keramikschilde | 15 | offen | offen | offen |
| Kerker | 13 | offen | offen | offen |
| Knochengerippe | 5 | offen | offen | offen |
| Kolossstämme | 20 | offen | offen | offen |
| Korallenstöcke | 8, 18 | offen | offen | offen |
| korrodierte Träger | 14 | offen | offen | offen |
| Kran | 6 | offen | offen | offen |
| Kristallblätter | 20 | offen | offen | offen |
| Kristallbrücken | 2 | offen | offen | offen |
| Kristalle | 14 | offen | offen | offen |
| Kristallformationen | 10, 20 | offen | offen | offen |
| Kristallresonatoren | 2 | offen | offen | offen |
| Lavaglaswände | 15 | offen | offen | offen |
| Lavarampen | 14 | offen | offen | offen |
| Lavaseen | 1, 14 | offen | offen | offen |
| Lawinenauslöser | 16 | offen | offen | offen |
| Lawinenhänge | 4, 14 | offen | offen | offen |
| Leuchtalgenfelder | 18 | offen | offen | offen |
| Leuchtkristalle | 2 | offen | offen | offen |
| Leuchtpilze | 9, 20 | offen | offen | offen |
| Luftblasenquellen | 8 | offen | offen | offen |
| Magiekristalle | 13 | offen | offen | offen |
| Magmarisse | 14 | offen | offen | offen |
| Magnetkräne | 7, 16 | offen | offen | offen |
| Metallkräne | 15 | offen | offen | offen |
| Metallplatten | 6, 14 | offen | offen | offen |
| Metalltrümmer | 10 | offen | offen | offen |
| Minenloren | 2 | offen | offen | offen |
| Monumente | 14 | offen | offen | offen |
| Moosfelsen | 20 | offen | offen | offen |
| Myzelnetze | 9 | offen | offen | offen |
| Nebelbrücken | 11 | offen | offen | offen |
| Oasen | 5, 14 | offen | offen | offen |
| Observatorien | 7, 16 | offen | offen | offen |
| Obsidianstelen | 1 | offen | offen | offen |
| Pilzbrücken | 9 | offen | offen | offen |
| Portale | 19 | offen | offen | offen |
| Pressen | 14 | offen | offen | offen |
| Rankenaufzüge | 3, 14, 17 | offen | offen | offen |
| Riesenpilze | 9 | offen | offen | offen |
| Sandbänke | 8 | offen | offen | offen |
| Sandsteinmonumente | 5 | offen | offen | offen |
| Satellitenwracks | 10 | offen | offen | offen |
| Säurebecken | 3, 9, 17 | offen | offen | offen |
| Schiffswracks | 8 | offen | offen | offen |
| Schmelzöfen | 15 | offen | offen | offen |
| Schmiedeöfen | 1 | offen | offen | offen |
| Schneehöhlen | 4 | offen | offen | offen |
| Schrotthaufen | 6 | offen | offen | offen |
| Schrottpresse | 6 | offen | offen | offen |
| Schrottpressen | 12 | offen | offen | offen |
| Schwebende Asteroiden | 10 | offen | offen | offen |
| Schwebende Fragmente | 19 | offen | offen | offen |
| Schwebende Kristalle | 7, 11, 16 | offen | offen | offen |
| Spiegelwände | 7, 11, 16 | offen | offen | offen |
| Sporen | 14 | offen | offen | offen |
| Sporenschwämme | 3, 9, 17 | offen | offen | offen |
| Stabilisatoren | 19 | offen | offen | offen |
| Stalaktiten | 14 | offen | offen | offen |
| Strömungskorridore | 8 | offen | offen | offen |
| Teergruben | 5 | offen | offen | offen |
| Teerseen | 11 | offen | offen | offen |
| Tempelbrücken | 3 | offen | offen | offen |
| Thronsaal | 13 | offen | offen | offen |
| Tiefseegräben | 18 | offen | offen | offen |
| Traumportale | 11 | offen | offen | offen |
| Treibsandlöcher | 5, 14 | offen | offen | offen |
| Türme | 13 | offen | offen | offen |
| unterirdische Seen | 2 | offen | offen | offen |
| Unterwasserhöhlen | 8 | offen | offen | offen |
| Versteinerte Baumriesen | 20 | offen | offen | offen |
| Versteinerte Wurzeln | 20 | offen | offen | offen |
| Versunkene Gebäude | 18 | offen | offen | offen |
| Wanderdünen | 5, 14 | offen | offen | offen |
| Wasserstandsschalter | 14 | offen | offen | offen |
| Wetterfahnen | 4 | offen | offen | offen |
| Windturbinen | 4, 7, 16 | offen | offen | offen |
| Windzonen | 14 | offen | offen | offen |
| Wolkenplattformen | 7, 16 | offen | offen | offen |
| Wurzelherzen | 3, 17 | offen | offen | offen |
| Wurzeln | 14 | offen | offen | offen |
| Zeitkristalle | 19 | offen | offen | offen |
| Zeitrisse | 19 | offen | offen | offen |
| Zugbrücken | 13 | offen | offen | offen |

## Trigger

| Trigger | Biome |
| :-- | :-- |
| Abkühlungs-Trigger | 1 |
| Asteroidenbruch-Trigger | 10 |
| Bio-Netzwerk-Trigger | 17 |
| Dimensionswechsel-Trigger | 19 |
| Druckanstiegs-Trigger | 15 |
| Druckentlastungs-Trigger | 18 |
| Einsturz-Trigger | 2 |
| Eisriss-Trigger | 4 |
| Förderstau-Trigger | 15 |
| Fruchtkörper-Trigger | 9 |
| Inselbruch-Trigger | 7, 16 |
| Kontaminations-Trigger | 6 |
| Kristallresonanz-Trigger | 20 |
| Kristallüberlastungs-Trigger | 13 |
| Lichtausfall-Trigger | 18 |
| Magmaausbruch-Trigger | 1 |
| Mauerbruch-Trigger | 13 |
| Notabschaltungs-Trigger | 12 |
| Raumanker-Trigger | 11 |
| Realitätswechsel-Trigger | 11 |
| Riffbruch-Trigger | 8 |
| Sandsturm-Trigger | 5 |
| Stalaktit-Trigger | 2 |
| Stammsturz-Trigger | 20 |
| Stromkreis-Trigger | 6 |
| Trägerbruch-Trigger | 12 |
| Trümmerfeld-Trigger | 10 |
| Wachstums-Trigger | 9 |
| Wasserstands-Trigger | 3 |
| Wurzelbruch-Trigger | 17, 20 |
| Wurzelspannungs-Trigger | 3 |
| Zeitablauf-Trigger | 19 |

## Wasser / Fluide und Abgründe (Manifest)

| Fluid | Art | Biome |
| :-- | :-- | :-- |
| Abgrund | Abgrund | 20 |
| Ätzende Säure | Fluid | 9 |
| Binnensee | Fluid | 20 |
| Bio-Säurewasser (ätzend) | Fluid | 17 |
| Bodenlose Leere (Abgrund) | Abgrund | 7 |
| Burggraben | Fluid | 13 |
| Eiskalte Tiefsee | Fluid | 4 |
| Eiswasser-Abgrund | Abgrund | 16 |
| Industriegift | Fluid | 12 |
| Industriemagma (tödlich) | Fluid | 15 |
| kein Wasser | Fluid | 1, 7, 10 |
| Lava (tödlich) | Fluid | 1 |
| Oasen | Fluid | 5 |
| Raumriss | Abgrund | 11 |
| Säure (ätzend) | Fluid | 3 |
| Schmelzwasser | Fluid | 2, 4 |
| Strömung | Fluid | 8 |
| Sumpfschlamm | Fluid | 3 |
| Teer | Fluid | 5, 11 |
| Tiefsee | Fluid | 8 |
| Tiefseegraben | Abgrund | 18 |
| Toxischer Schlamm | Fluid | 6 |
| Treibsand | Fluid | 5 |
| Variabel | Fluid | 14 |
| Weltraum-Leere | Abgrund | 10 |
| Zeit-Vortex | Abgrund | 19 |

## Spezial-Items und Begebenheiten (Manifest)

| Eintrag | Biome | Optik | Zerstörbarkeit | Bewegung |
| :-- | :-- | :-- | :-- | :-- |
| +50 % Magieintensität | 2, 7 | offen | offen | offen |
| 6-in-1-Planetenwechsel | 14 | offen | offen | offen |
| Alienharz | 17 | offen | offen | offen |
| Asteroiden | 10 | offen | offen | offen |
| begrabende Sandmassen | 5 | offen | offen | offen |
| Binnensee | 20 | offen | offen | offen |
| Bio-Säure | 17 | offen | offen | offen |
| Burggraben | 13 | offen | offen | offen |
| Dampfventile | 1, 15 | offen | offen | offen |
| Druckbegebenheiten | 18 | offen | offen | offen |
| Einschläge/Trümmer | 10 | offen | offen | offen |
| einsturzgefährdete Etagen | 12 | offen | offen | offen |
| Eisbrücken | 4, 16 | offen | offen | offen |
| Förderbänder | 6, 12 | offen | offen | offen |
| Giftfässer | 6, 12 | offen | offen | offen |
| Glasinseln | 11 | offen | offen | offen |
| Gletscherspalten | 4 | offen | offen | offen |
| glühende Brandspuren | 1 | offen | offen | offen |
| Hitzeschilde | 15 | offen | offen | offen |
| Hitzesprung/Risse | 1 | offen | offen | offen |
| Industrieaufzüge | 6, 12 | offen | offen | offen |
| Insektennester | 3, 9 | offen | offen | offen |
| instabiler Boden | 19 | offen | offen | offen |
| Keramikschilde | 15 | offen | offen | offen |
| Klareiskristalle | 16 | offen | offen | offen |
| Korallen | 18 | offen | offen | offen |
| Korallenbarrieren | 8 | offen | offen | offen |
| korrodiertes Metall | 18 | offen | offen | offen |
| Kristalladern | 20 | offen | offen | offen |
| Kristallbäume | 20 | offen | offen | offen |
| Kristallbrücken | 2, 7 | offen | offen | offen |
| Kristalle | 10 | offen | offen | offen |
| Laserreflexion | 2, 7, 16 | offen | offen | offen |
| Lavafontänen | 1 | offen | offen | offen |
| Lawinen | 16 | offen | offen | offen |
| Lawinenhänge | 4 | offen | offen | offen |
| Lebende Korallen | 8 | offen | offen | offen |
| Leucht-/Arkankristalle | 2 | offen | offen | offen |
| Magiekristalle | 13 | offen | offen | offen |
| Magnetfelder | 10 | offen | offen | offen |
| Magnetgestein | 16 | offen | offen | offen |
| magnetische Ablenkung | 6 | offen | offen | offen |
| Magnetturbinen | 6, 12 | offen | offen | offen |
| Mauerwerk | 13 | offen | offen | offen |
| Metallschienen | 15 | offen | offen | offen |
| Moos | 20 | offen | offen | offen |
| Myzel | 17 | offen | offen | offen |
| nachrutschende Sandbänke | 5 | offen | offen | offen |
| Nickel-Eisen-Adern | 10 | offen | offen | offen |
| Oasen | 5 | offen | offen | offen |
| Phasenwechsel | 19 | offen | offen | offen |
| Prisma-Stelen | 2, 7, 13 | offen | offen | offen |
| Raumrisse | 19 | offen | offen | offen |
| reflektierende Eisflächen | 4 | offen | offen | offen |
| Riffgänge | 8 | offen | offen | offen |
| Rutschflächen | 4 | offen | offen | offen |
| Säurepfützen | 3 | offen | offen | offen |
| Säureseen | 9 | offen | offen | offen |
| Schadgaswolken | 3, 9 | offen | offen | offen |
| Schlackekessel | 1, 15 | offen | offen | offen |
| schwebende Kristalle | 2 | offen | offen | offen |
| Schwebende Kristalle | 7 | offen | offen | offen |
| Spiegelwände | 11 | offen | offen | offen |
| Splitter | 11 | offen | offen | offen |
| Sporen | 17 | offen | offen | offen |
| Sporenschwämme | 3, 9 | offen | offen | offen |
| Stromkaskaden | 6 | offen | offen | offen |
| Stromleitungen | 12 | offen | offen | offen |
| Strömungen | 8 | offen | offen | offen |
| Tempelmechanismen | 17 | offen | offen | offen |
| Tiefseeströmungen | 18 | offen | offen | offen |
| transparente Wände | 11 | offen | offen | offen |
| Traumportale | 11 | offen | offen | offen |
| Treibsandlöcher | 5 | offen | offen | offen |
| Übergänge/Portale | 14 | offen | offen | offen |
| variable Material-/Fluid-Sets | 14 | offen | offen | offen |
| versteinertes Holz | 20 | offen | offen | offen |
| Wanderdünen | 5 | offen | offen | offen |
| Wurzelherzen | 3, 9, 17 | offen | offen | offen |
| Zeitkristalle | 19 | offen | offen | offen |
| Zeitverzerrung | 11, 19 | offen | offen | offen |
| Zugbrücken/Falltüren | 13 | offen | offen | offen |

## Sonderwirkungen

| Biom | Sonderwirkung |
| :-- | :-- |
| 15 Vulkanische Schlackeschmiede | Überdruck (gerichtete Dampf-/Fragmentwirkung ohne Totalzerstörung) |
| 17 Bio-Alien-Tempelstadt | Netzwerkreaktion (Verlust eines Myzelknotens trennt nur angeschlossene Verbindungen) |
| 18 Abyssale Tiefsee / Versunkene Alien-Metropole | Druckentlastung (gerichtete Wasserbewegung) |
| 19 Dimensionsriss / Zeit-Chaosebene | Zeitimpuls, Dimensionsimpuls (nur markierte Objekte/Verbindungen) |
| 20 Versteinerter Kristallwald / Uralter Koloss-Wald | Lichtimpuls (aktiviert definierte Kristallflächen) |
