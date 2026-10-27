# Allwissendes Manifest: Biome

**Quelle:** Auftraggeber (Patrick Hilf), eingegangen 2026-10-27. Ergänzt `docs/biome-ssot.md` um **Bodenschichten**, **Wasser/Fluid** und **Spezial-Items/Begebenheiten**. Bei Widerspruch in den Inhalten (nicht in den Zahlen) gilt weiter die SSOT; die Widersprüche stehen unten und warten auf eine Entscheidung. Die Biom-Dateien unter `docs/biome/` und die Gesamtliste führen beide Quellen zusammen (`node scripts/biome-dateien.mjs`).

**Geltungsbereich:** ausschließlich die 20 Biome mit Materialien, Bodenschichten, Wasser/Fluid und Spezial-Items/Begebenheiten. Bewusst ausgelassen: Spielformen und Topologien (Insel, Höhle, Berg, Warren, Archipel usw.).

**Legende:** Deck = Deckschicht · Kern = Kernschicht · Adern = Adern und Einschlüsse. Wasser/Fluid umfasst Wasser sowie primäre Fluide und Abgründe; tödliche oder ätzende Fluide sind markiert.

| ID | Biom | Materialien | Deck | Kern | Adern | Wasser / Fluid | Spezial-Items, Gegenstände und Begebenheiten |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Vulkan & Lavafeld | Asche, Schlacke, Basalt, Obsidian, Fels | Asche/Basalt | Basalt | Obsidian/Fels | Lava (tödlich); kein Wasser | Dampfventile; Schlackekessel; Lavafontänen; Hitzesprung/Risse; glühende Brandspuren |
| 2 | Kristallhöhlen | Fels, Kalkstein, Kristall, Obsidian | Fels/Kalkstein | Fels | Kristall/Obsidian | Schmelzwasser | Leucht-/Arkankristalle; Prisma-Stelen; Kristallbrücken; schwebende Kristalle; Laserreflexion; +50 % Magieintensität |
| 3 | Dschungel & Sumpf | Humus, Erde, lehmige Erde, Holz, Pilz, Fels | Humus/Erde | lehmige Erde | Holz/Pilz/Fels | Sumpfschlamm; Säure (ätzend) | Wurzelherzen; Sporenschwämme; Insektennester; Säurepfützen; Schadgaswolken |
| 4 | Eiswüste & Gletscher | Schnee, Klareis, Tiefenfels, Eis, Kristall | Schnee/Klareis | Tiefenfels | Eis/Kristall | Eiskalte Tiefsee; Schmelzwasser | Eisbrücken; Lawinenhänge; Gletscherspalten; Rutschflächen; reflektierende Eisflächen |
| 5 | Wüsten-Dünen | Feinsand, Treibsand, Sandstein, Fels, versteinertes Holz | Feinsand/Treibsand | Sandstein | Fels/versteinertes Holz | Treibsand; Teer; Oasen | Treibsandlöcher; Wanderdünen; Oasen; nachrutschende Sandbänke; begrabende Sandmassen |
| 6 | Schrottplatz | Kontaminierte Erde, Rostmetall, Beton, Metall, Holz, Fels | kontaminierte Erde | Rostmetall/Beton | Metall/Holz/Fels | Toxischer Schlamm | Giftfässer; Förderbänder; Magnetturbinen; Industrieaufzüge; Stromkaskaden; magnetische Ablenkung |
| 7 | Kristall-Archipel | Erdüberzug, Kristallfelsen, Kristall, Obsidian | Erdüberzug | Kristallfelsen | Kristall/Obsidian | Bodenlose Leere (Abgrund); kein Wasser | Schwebende Kristalle; Prisma-Stelen; Kristallbrücken; Laserreflexion; +50 % Magieintensität |
| 8 | Korallenriff | Feinsand, Koralle, Riff-Kalkstein, lebende Koralle | Feinsand/Koralle | Riff-Kalkstein | lebende Koralle | Tiefsee; Strömung | Lebende Korallen; Strömungen; Riffgänge; Korallenbarrieren |
| 9 | Pilzwald & Säuresumpf | Pilzgewebe, Humus, kontaminierte Erde, Pilzmyzel, Holz | Pilzgewebe/Humus | kontaminierte Erde | Pilzmyzel/Holz | Ätzende Säure | Sporenschwämme; Wurzelherzen; Insektennester; Säureseen; Schadgaswolken |
| 10 | Asteroidenfeld | Regolith-Staub, Meteoritenfels, Nickel-Eisen, Kristall | Regolith-Staub | Meteoritenfels | Nickel-Eisen/Kristall | Weltraum-Leere; kein Wasser | Asteroiden; Nickel-Eisen-Adern; Kristalle; Einschläge/Trümmer; Magnetfelder |
| 11 | Surreale Schwebewelt | Glas, Traumgestein, gehärtetes Glas, Kristall | Glas/Traumgestein | Traumgestein | gehärtetes Glas/Kristall | Raumriss; Teer | Traumportale; Glasinseln; Spiegelwände; transparente Wände; Splitter; Zeitverzerrung |
| 12 | Fabrik & Hochhausruine | Poröser Beton, Stahlbeton, Metallträger, Beton, Metall | poröser Beton | Stahlbeton | Metallträger/Beton | Industriegift | Förderbänder; Magnetturbinen; Giftfässer; Industrieaufzüge; Stromleitungen; einsturzgefährdete Etagen |
| 13 | Burgfelsen & Magiekristall | Mutterboden, Mauerwerk, Magiekristall, Holz | Mutterboden | Mauerwerk | Magiekristall/Holz | Burggraben | Magiekristalle; Prisma-Stelen; Mauerwerk; Zugbrücken/Falltüren; Burggraben |
| 14 | Planeten (6-in-1) | Variabel; sechs Sub-Biome mit eigenen Material-Sets | variabel | variabel | variabel | Variabel | 6-in-1-Planetenwechsel; variable Material-/Fluid-Sets; Übergänge/Portale |
| 15 | Schlackeschmiede | Schlacke, Basalt, Keramik, Metallschienen, Industriemagma | Schlacke/Basalt | Keramik/Basalt | Metallschienen/Keramik | Industriemagma (tödlich) | Schlackekessel; Dampfventile; Keramikschilde; Metallschienen; Hitzeschilde |
| 16 | Kristallines Schwebearchipel | Firnschnee, Klareis, Massivfels, Klareiskristall, Magnetgestein | Firnschnee/Klareis | Massivfels | Klareiskristall/Magnetgestein | Eiswasser-Abgrund | Eisbrücken; Lawinen; Magnetgestein; Klareiskristalle; Laserreflexion |
| 17 | Bio-Alien-Tempelstadt | Humus, Tempelstein, Alienharz, Metall, Myzel | Humus/Tempelstein | Tempelstein | Alienharz/Metall/Myzel | Bio-Säurewasser (ätzend) | Alienharz; Myzel; Tempelmechanismen; Bio-Säure; Sporen; Wurzelherzen |
| 18 | Abyssale Tiefsee | Tiefseeschlamm, Tiefseebasalt, korrodiertes Metall, Koralle | Tiefseeschlamm | Tiefseebasalt | korrodiertes Metall/Koralle | Tiefseegraben | Korallen; korrodiertes Metall; Tiefseeströmungen; Druckbegebenheiten |
| 19 | Dimensionsriss | Instabiler Boden, Phasen-Fels, Zeitkristall, Glas | instabiler Boden | Phasen-Fels | Zeitkristall/Glas | Zeit-Vortex | Zeitkristalle; Zeitverzerrung; Raumrisse; Phasenwechsel; instabiler Boden |
| 20 | Versteinerter Kristallwald | Moos, versteinertes Holz, Kristall, Holz, Fels | Moos/versteinertes Holz | versteinertes Holz | Kristall/Holz/Fels | Binnensee; Abgrund | Kristallbäume; versteinertes Holz; Moos; Kristalladern; Binnensee |

## Widersprüche zur SSOT (offen, Entscheidung des Auftraggebers)

1. **Planet (Biom 14):** Das Manifest nennt „Planeten (6-in-1)" mit sechs Sub-Biomen. Entschieden ist seit 2026-10-26: **ein** Planet, nicht sechs. Die Zeile bleibt hier als Quelle stehen und gilt nicht, bis der Auftraggeber sie neu fasst.
2. **Abweichende Benennungen:** das Manifest nennt „Feinsand/Treibsand" (SSOT: „Loser Sand/Verdichteter Sand"), „Klareis" (SSOT: „Eis"/„Klarer Kristall"), „Wüsten-Dünen" (SSOT: „Wüstendünen"), „Erdüberzug", „Mutterboden", „Phasen-Fels", „Traumgestein", „Industriemagma", „Tiefseebasalt", „Meteoritenfels", „Regolith-Staub", „Nickel-Eisen" u. a. Sie gelten als eigene Einträge, bis die Namen vereinheitlicht sind (Gesamtliste, Spalte „Quelle").
3. **„+50 % Magieintensität" (Biome 2 und 7) — entschieden (Auftraggeber, 2026-10-27):** gemeint ist die **Magie vom Magier (Klasse) und seinen Zaubern**, also deren Wirkung in diesen beiden Biomen. Im Code heißt der Magier-Archetyp vermutlich `occultist` (Archetypen: `brawler`, `artillerist`, `occultist`) und die Zauber sind die Schadensgruppe `magie` (`arcane`, `astral`, `spatial`, `temporal`, `time`, `psychic` in `schaden.js`). Zuordnung noch zu bestätigen; es ist **kein** Material- oder Biomwert, sondern ein Biom-Modifikator auf Magie.
4. **Fluide:** Die SSOT führt Fluide nicht als eigene Liste; das Manifest ist die erste Quelle dafür. Ob „Raumriss", „Zeit-Vortex", „Weltraum-Leere" und „Bodenlose Leere" Fluide oder Abgründe sind, ist offen (hier als Fluid/Abgrund geführt).
