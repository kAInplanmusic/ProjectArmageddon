# Gesamtliste: Materialien, Objekte, Trigger, Sonderwirkungen

> Erzeugt aus `docs/biome-ssot.md` und `docs/biome-manifest.md` mit `node scripts/biome-dateien.mjs` — nicht von Hand ändern.

Jede Zeile ist ein Eintrag, der **einzeln** gebaut und mit den drei Eigenschaften belegt wird: **Optik**, **Zerstörbarkeit**, **Bewegung** (Reihenfolge laut Auftraggeber). „Biome“ nennt die Nummern aus der SSOT.

**Stand:** 20 Biome · 124 Materialien (0 ohne Katalogeintrag) · 111 Objekte · 32 Trigger. Quellen: docs/biome-ssot.md und docs/biome-manifest.md (Spalte „Quelle“).

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
| Alienharz | SSOT/beide | 3, 17 | ja (alienharz, weich) | ja | offen | weich | offen |
| Asche | beide/SSOT | 1, 14 | ja (asche, weich) | ja | offen | weich | offen |
| Asteroidenbasalt | SSOT | 10 | ja (asteroidenbasalt, hart) | ja | offen | hart | offen |
| Basalt | beide/SSOT | 1, 14, 15, 18 | ja (basalt, hart) | ja | offen | hart | offen |
| Beton | Manifest/beide/SSOT | 6, 12, 14 | ja (beton, hart) | ja | offen | hart | offen |
| Betonreste | SSOT | 6 | ja (betonreste, normal) | ja | offen | normal | offen |
| Bimsstein | SSOT | 15 | ja (bimsstein, weich) | ja | offen | weich | offen |
| Burgfelsen | SSOT | 13 | ja (burgfelsen, hart) | ja | offen | hart | offen |
| Dampfkammer | SSOT | 15 | ja (dampfkammer, weich) | ja | offen | weich | offen |
| Druckkammer | SSOT | 18 | ja (druckkammer, sehr_hart) | ja | offen | sehr_hart | offen |
| Eis | Manifest/SSOT | 4, 14, 16 | ja (eis, normal) | ja | offen | normal | offen |
| Eisader | SSOT | 10 | ja (eisader, normal) | ja | offen | normal | offen |
| Erde | beide | 3 | ja (erde, normal) | ja | offen | normal | offen |
| Erdüberzug | beide/SSOT | 7, 13 | ja (erdueberzug, weich) | ja | offen | weich | offen |
| Feinsand | beide/Manifest | 5, 8 | ja (feinsand, weich) | ähnlich: sand.jpg | offen | weich | offen |
| Fels | Manifest/beide/SSOT | 1, 2, 3, 5, 6, 9, 14, 20 | ja (fels, hart) | ja | offen | hart | offen |
| Feuchte Erde | SSOT | 9 | ja (feuchte_erde, weich) | ja | offen | weich | offen |
| Firnschnee | SSOT/beide | 4, 14, 16 | ja (firnschnee, weich) | ähnlich: firn.jpg | offen | weich | offen |
| Gefrorene Wurzeln | SSOT | 4 | ja (gefrorene_wurzeln, normal) | ja | offen | normal | offen |
| gehärtetes Glas | Manifest | 11 | ja (gehaertetes_glas, hart) | ja | offen | hart | offen |
| Geröll | SSOT | 14 | ja (geroell, weich) | ja | offen | weich | offen |
| Giftablagerungen | SSOT | 6 | ja (giftablagerungen, weich) | ja | offen | weich | offen |
| Giftnebel | SSOT | 11 | ja (giftnebel, weich) | ja | offen | weich | offen |
| Glas | beide/SSOT/Manifest | 11, 16, 19 | ja (glas, normal) | ja | offen | normal | offen |
| Glasfassade | SSOT | 12 | ja (glasfassade, normal) | ja | offen | normal | offen |
| Glasfragmente | SSOT | 19 | ja (glasfragmente, weich) | ja | offen | weich | offen |
| Glasplatten | SSOT | 7 | ja (glasplatten, normal) | ja | offen | normal | offen |
| Gletschereis | SSOT | 4 | ja (gletschereis, hart) | ja | offen | hart | offen |
| Holz | beide/Manifest/SSOT | 3, 6, 9, 13, 14, 20 | ja (holz, normal) | ja | offen | normal | offen |
| Holzaufbauten | SSOT | 13 | ja (holzaufbauten, normal) | ähnlich: holz.jpg | offen | normal | offen |
| Holzreste | SSOT | 6, 9 | ja (holzreste, weich) | ja | offen | weich | offen |
| Humus | beide/Manifest/SSOT | 3, 9, 14, 17 | ja (humus, weich) | ja | offen | weich | offen |
| Hydrothermalablagerungen | SSOT | 18 | ja (hydrothermalablagerungen, normal) | ähnlich: hydrothermal.jpg | offen | normal | offen |
| Industriemagma | Manifest | 15 | ja (industriemagma, weich) | ja | offen | weich | offen |
| Instabiler Boden | beide | 19 | ja (instabiler_boden, weich) | ja | offen | weich | offen |
| Kalkstein | beide/SSOT | 2, 8 | ja (kalkstein, normal) | ja | offen | normal | offen |
| Keramik | beide | 15 | ja (keramik, hart) | ja | offen | hart | offen |
| Kerkergewölbe | SSOT | 13 | ja (kerkergewoelbe, hart) | ja | offen | hart | offen |
| Klareis | Manifest | 4, 16 | ja (klareis, normal) | ja | offen | normal | offen |
| Klareiskristall | SSOT/beide | 4, 16 | ja (klareiskristall, hart) | ähnlich: klareis.webp | offen | hart | offen |
| Kolossstamm | SSOT | 20 | ja (kolossstamm, hart) | fehlt | offen | hart | offen |
| Kontaminierte Ablagerungen | SSOT | 12 | ja (kontaminierte_ablagerungen, weich) | ja | offen | weich | offen |
| Kontaminierte Erde | beide/Manifest | 6, 9 | ja (kontaminierte_erde, normal) | ja | offen | normal | offen |
| Koralle | beide | 8, 18 | ja (koralle, normal) | ja | offen | normal | offen |
| korrodiertes Metall | Manifest | 18 | ja (korrodiertes_metall, hart) | ähnlich: metall.webp | offen | hart | offen |
| Korrosion | SSOT | 14 | ja (korrosion, weich) | ja | offen | weich | offen |
| Kristall | Manifest/beide/SSOT | 2, 4, 7, 10, 11, 14, 20 | ja (kristall, hart) | ja | offen | hart | offen |
| Kristalladern | SSOT | 2, 10, 14, 20 | ja (kristalladern, hart) | ähnlich: kristall.webp | offen | hart | offen |
| Kristallblätter | SSOT | 20 | ja (kristallblaetter, normal) | ähnlich: kristall.webp | offen | normal | offen |
| Kristallfelsen | Manifest | 7 | ja (kristallfelsen, hart) | ja | offen | hart | offen |
| Lavaglas | SSOT | 15 | ja (lavaglas, hart) | ja | offen | hart | offen |
| lebende Koralle | Manifest | 8 | ja (lebende_koralle, normal) | ähnlich: koralle.webp | offen | normal | offen |
| lehmige Erde | Manifest | 3 | ja (lehmige_erde, normal) | ähnlich: erde.jpg | offen | normal | offen |
| Leuchtalgen | SSOT | 18 | ja (leuchtalgen, weich) | ja | offen | weich | offen |
| Leuchtkristall | SSOT | 18 | ja (leuchtkristall, hart) | ja | offen | hart | offen |
| Leuchtpilzgewebe | SSOT | 20 | ja (leuchtpilzgewebe, weich) | ja | offen | weich | offen |
| Magiekristall | beide | 13 | ja (magiekristall, hart) | ja | offen | hart | offen |
| Magmaadern | SSOT | 1, 14 | ja (magmaadern, hart) | ja | offen | hart | offen |
| Magnetgestein | SSOT/beide | 7, 16 | ja (magnetgestein, hart) | ja | offen | hart | offen |
| Massivfels | SSOT/beide | 2, 4, 7, 11, 16, 19, 20 | ja (massivfels, hart) | ähnlich: fels.jpg | offen | hart | offen |
| Mauerwerk | beide | 13 | ja (mauerwerk, hart) | ja | offen | hart | offen |
| Metall | beide/Manifest/SSOT | 6, 12, 14, 17, 18 | ja (metall, unzerstoerbar) | ja | offen | unzerstoerbar | offen |
| Metallader | SSOT | 10 | ja (metallader, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen |
| Metallfragmente | SSOT | 19 | ja (metallfragmente, normal) | ähnlich: metall.webp | offen | normal | offen |
| Metallgitter | SSOT | 13 | ja (metallgitter, normal) | ähnlich: metall.webp | offen | normal | offen |
| Metallplatten | SSOT | 12, 17 | ja (metallplatten, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen |
| Metallschienen | beide | 15 | ja (metallschienen, hart) | ähnlich: metall.webp | offen | hart | offen |
| Metallträger | beide | 12 | ja (metalltraeger, sehr_hart) | ähnlich: metall.webp | offen | sehr_hart | offen |
| Metalltrümmer | SSOT | 10 | ja (metalltruemmer, normal) | ähnlich: metall.webp | offen | normal | offen |
| Meteoritenfels | Manifest | 10 | ja (meteoritenfels, sehr_hart) | ja | offen | sehr_hart | offen |
| Moos | SSOT/beide | 3, 20 | ja (moos, weich) | ja | offen | weich | offen |
| Mutterboden | Manifest | 13 | ja (mutterboden, weich) | ja | offen | weich | offen |
| Myzelmatte | SSOT | 9 | ja (myzelmatte, weich) | ähnlich: myzel.jpg | offen | weich | offen |
| Nickel-Eisen | Manifest | 10 | ja (nickel_eisen, sehr_hart) | ja | offen | sehr_hart | offen |
| Obsidian | beide/SSOT | 1, 2, 7, 14, 15 | ja (obsidian, sehr_hart) | ja | offen | sehr_hart | offen |
| Organische Riffablagerungen | SSOT | 8 | ja (organische_riffablagerungen, weich) | ja | offen | weich | offen |
| Organische Tragwurzeln | SSOT | 17 | ja (organische_tragwurzeln, normal) | ja | offen | normal | offen |
| Phasen-Fels | Manifest | 19 | ja (phasen_fels, hart) | ja | offen | hart | offen |
| Pilzbrücke | SSOT | 9 | ja (pilzbruecke, normal) | ja | offen | normal | offen |
| Pilze | Manifest/SSOT | 3, 14 | ja (pilze, weich) | ähnlich: pilz.jpg | offen | weich | offen |
| Pilzgewebe | SSOT/beide | 3, 9 | ähnlich: pilz | ähnlich: leuchtpilzgewebe.webp | offen | offen | offen |
| Pilzmyzel | Manifest/beide | 9, 17 | ja (pilzmyzel, weich) | ähnlich: myzel.jpg | offen | weich | offen |
| Poröser Beton | Manifest | 12 | ja (poroeser_beton, hart) | ähnlich: beton.jpg | offen | hart | offen |
| Poröser Fels | SSOT | 10 | ja (poroeser_fels, hart) | ja | offen | hart | offen |
| Pulverschnee | SSOT | 4 | ja (pulverschnee, weich) | ähnlich: schnee.jpg | offen | weich | offen |
| Rankgitter | SSOT | 17 | ja (rankgitter, weich) | ja | offen | weich | offen |
| Raumanker | SSOT | 11 | ja (raumanker, unzerstoerbar) | ja | offen | unzerstoerbar | offen |
| Regolith-Staub | beide | 10 | ja (regolith_staub, weich) | ähnlich: regolith.jpg | offen | weich | offen |
| Riff-Kalkstein | Manifest | 8 | ja (riff_kalkstein, normal) | ähnlich: kalkstein.jpg | offen | normal | offen |
| Risszone | SSOT | 19 | ja (risszone, weich) | ja | offen | weich | offen |
| Rohrleitungen | SSOT | 12 | ja (rohrleitungen, hart) | ja | offen | hart | offen |
| Rostmetall | beide/SSOT | 6, 14 | ja (rostmetall, hart) | ja | offen | hart | offen |
| Salzkruste | SSOT | 5, 14 | ja (salzkruste, normal) | ja | offen | normal | offen |
| Sand | SSOT | 14 | ja (sand, weich) | ja | offen | weich | offen |
| Sandstein | beide/SSOT | 5, 14 | ja (sandstein, normal) | ja | offen | normal | offen |
| Säureablagerungen | SSOT | 17 | ja (saeureablagerungen, weich) | ja | offen | weich | offen |
| Säureboden | SSOT | 3, 9 | ja (saeureboden, weich) | ja | offen | weich | offen |
| Schlacke | beide/SSOT | 1, 14, 15 | ja (schlacke, normal) | ja | offen | normal | offen |
| Schnee | Manifest/SSOT | 4, 14, 16 | ja (schnee, weich) | ja | offen | weich | offen |
| Schrott | SSOT | 14 | ja (schrott, normal) | ja | offen | normal | offen |
| Schwebende Plattformen | SSOT | 19 | ja (schwebende_plattformen, hart) | ja | offen | hart | offen |
| Schwefelkruste | SSOT | 1 | ja (schwefelkruste, normal) | ja | offen | normal | offen |
| Seegras | SSOT | 8 | ja (seegras, weich) | ja | offen | weich | offen |
| Stabilisatormaterial | SSOT | 19 | ja (stabilisatormaterial, unzerstoerbar) | ja | offen | unzerstoerbar | offen |
| Stahlbeton | Manifest | 12 | ja (stahlbeton, sehr_hart) | ähnlich: beton.jpg | offen | sehr_hart | offen |
| Stalaktiten | SSOT | 2 | ja (stalaktiten, normal) | ja | offen | normal | offen |
| Teer | SSOT | 5, 6, 11, 12, 14 | ja (teer, weich) | ja | offen | weich | offen |
| Tempelstein | beide | 17 | ja (tempelstein, hart) | ja | offen | hart | offen |
| Tiefenfels | Manifest | 4 | ja (tiefenfels, sehr_hart) | ähnlich: fels.jpg | offen | sehr_hart | offen |
| Tiefseebasalt | Manifest | 18 | ja (tiefseebasalt, hart) | ähnlich: basalt.jpg | offen | hart | offen |
| Tiefseeschlamm | beide | 18 | ja (tiefseeschlamm, weich) | ja | offen | weich | offen |
| Totholz & Knochen | SSOT | 5 | ja (totholz_knochen, normal) | ja | offen | normal | offen |
| Traumgestein | Manifest | 11 | ja (traumgestein, hart) | ja | offen | hart | offen |
| Treibsand | beide | 5 | ja (treibsand, weich) | ja | offen | weich | offen |
| Unterwasserfels | SSOT | 8 | ja (unterwasserfels, hart) | ähnlich: wasser.webp | offen | hart | offen |
| Unterwassersand | SSOT | 8 | ja (unterwassersand, weich) | ähnlich: wasser.webp | offen | weich | offen |
| Verdichteter Sand | SSOT | 5 | ja (verdichteter_sand, normal) | ähnlich: sand.jpg | offen | normal | offen |
| Versteinerte Wurzeln | SSOT | 20 | ja (versteinerte_wurzeln, hart) | ja | offen | hart | offen |
| Versteinertes Holz | Manifest/beide | 5, 20 | ja (versteinertes_holz, hart) | ja | offen | hart | offen |
| Wasser | SSOT | 8 | ja (wasser, weich) | ja | offen | weich | offen |
| Wasserader | SSOT | 2 | ja (wasserader, weich) | ja | offen | weich | offen |
| Wolkenstein | SSOT | 7, 11, 16 | ja (wolkenstein, weich) | ja | offen | weich | offen |
| Wurzeln | SSOT | 3, 14 | ja (wurzeln, normal) | ja | offen | normal | offen |
| Zeitkristall | beide | 19 | ja (zeitkristall, hart) | ähnlich: kristall.webp | offen | hart | offen |

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
