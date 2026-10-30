# Biome 15 bis 20 spielbar (Geländefassung 7)

Stand 2026-10-30. Ab `config.gelaende` **7** (neuer Standard) sind alle 20 Biome der SSOT (`docs/biome-ssot.md`) im Spiel: 13 Sonderbiome,
`planet` (Art zieht der Seed) und die sechs neuen. Der Audit `docs/audits/terrain-spielgefuehl-2026-10-30.md` (Punkt 6) nannte sie
„nur Bilder, keine Spieldefinition“; das ist hiermit behoben. Optik-Abnahme durch den Auftraggeber steht aus (siehe „Nicht verifiziert“).

## Die Marke

| Fassung | Inhalt |
|---|---|
| 1 bis 6 | unverändert, Bit für Bit (Goldwerte in `tests/biome-fassung-7.test.js`, gemessen auf `main` vor der Änderung) |
| 7 | zusätzlich ziehen und wählen die sechs neuen Biome; die Ziehung läuft über 20 statt 14 Plätze |

Replays ohne Marke bleiben Fassung 1, mit Marke 1 bis 6 bleiben sie, was sie waren. Neue Aufzeichnungen tragen 7. Die Ziehung benutzt
weiter nur den Seed-Zweig „BIO“ (`config/gelaende.js`, `waehleSonderbiom`), kein `Math.random`. Die Verdrahtung (Replay-Kopf, Lobby,
Server, Persistenz, Client) war für `config.gelaende` schon vorhanden; die Marke 7 braucht dort keine Änderung.

## Die sechs Biome

Quelle: SSOT Abschnitte 15 bis 20 und Manifest (Deck, Kern, Adern, Fluid). Stoffe sind Katalogstoffe (`stoffe.js`, 126), nichts neu angelegt.

| SSOT | Kennung | Name | Kartenform / Himmel | Fluid (Abbildung) | Deck / Kern / Adern (Fassung-7-Rezept) | Kulisse |
|---|---|---|---|---|---|---|
| 15 | `schlackeschmiede` | Vulkanische Schlackeschmiede | `mountains`; terrassiert, steil, Kessel | Industriemagma als `lava` (Schaden) | Schlacke, Basalt / Basalt / Keramik, Bimsstein, Obsidian; Metallschienen als Plattenstreifen | `schlackeschmiede_*` |
| 16 | `kristallarchipel` | Kristallines Schwebearchipel | `islands`; inselig, Eis-Himmel | Eiswasser-Abgrund als `void` | Firnschnee, Klareis / Massivfels / Klareiskristall, Magnetgestein | `kristallarchipel_*` |
| 17 | `tempelstadt` | Bio-Alien-Tempelstadt | `spires`; terrassiert, Sporen | Bio-Säurewasser als `acid` (Schaden), Sumpfschlamm | Humus, Tempelstein / Tempelstein / Alienharz, Pilzmyzel, Organische Tragwurzeln, Metallplatten | `tempelstadt_*` |
| 18 | `tiefsee` | Abyssale Tiefsee | `flooded`; Wasseranteil hoch, Himmel `abyss` | Tiefseegraben als `deep_sea` | Tiefseeschlamm / Tiefseebasalt / korrodiertes Metall, Koralle, Leuchtkristall, Hydrothermalablagerungen | `tiefsee_*` |
| 19 | `dimensionsriss` | Dimensionsriss | `islands`; Bruchstellen, Plasma-Himmel | Zeit-Vortex als `void` | Instabiler Boden / Phasen-Fels / Zeitkristall, Glasfragmente, Metallfragmente, Stabilisatormaterial | `dimensionsriss_*` |
| 20 | `kristallwald` | Versteinerter Kristallwald | `hills`; Wald, Binnensee | Binnensee `shallow_lake`, Abgrund `void` | Moos, Versteinertes Holz / Versteinertes Holz / Kristalladern, Kristallblätter, Versteinerte Wurzeln, Leuchtpilzgewebe, Massivfels | `kristallwald_*` |

Physik und Zerstörung folgen den Stoffen: Härte, Haftung, Nachgiebigkeit und die Wirkung je Schadensart stehen in `stoffe.js` und
`docs/terrain-matrix.md` und gelten in allen Biomen gleich (SSOT, Leitregel 5). Die Biome bringen nur Zusammensetzung, Form und Optik mit.
Die Fluide sind Optik und Beschreibung; die Engine ertränkt in jedem Wasser gleich, `lava` und `acid` tragen eine Schadensangabe
(`config/water.js`).

## Der Weg eines Bioms ins Spiel

1. Definition: `src/shared/config/biome-fassung-7.js` (Himmel, Wasser, Landmarken, Ambiente, Boden, `form`, Rückfallrezept, Pflanzen); eingehängt in `NEUE_BIOME` (`biome-neu.js`), damit Kulisse (`SCENERY_BIOMES`), Pflanzen und Hilfe-Tabelle denselben Eintrag lesen.
2. Rezept mit Biom-Materialien: `config/stoff-rezepte-material.js` (`REZEPTE_MATERIAL`, gilt ab Fassung 5; `rezeptFuer` in `stoff-rezepte.js`). Das Rückfallrezept in `NEUE_BIOME` nutzt nur Basisstoffe (ein bestehender Test verlangt das für `NEUE_BIOME`).
3. Ziehung und Wahl: `SONDERBIOM_IDS_FASSUNG_7` in `biome-neu.js`; `waehleSonderbiom`, `normalisiereBiomWahl` in `gelaende.js` (`idsFuer`).
4. Karte: `terrainGen3.formeCharakter` lenkt die Achsen in die `form`-Bereiche; die Kartenart (Bauteilkarte) zieht der Seed wie bisher.
5. Kulisse: `config/backdrops-neu.js` (24 Bilder aus `assets/backdrops-neu`, Stimmungen hell, dunkel, Höhle, Ragnarök; Bodenfarbe aus dem Biom), Zuordnung in `client/sonderKulissen.js` (automatisch hell, dunkel, Höhle), URL über `kulissenUrls.js`.
6. Menü: Gruppe „Neue Biome 15 bis 20“ in der Biomauswahl (`main.js`, `fillBiomOptions`).

## Prüfung

- `tests/biome-fassung-7.test.js` (29 Tests): Marke, Ziehung (Fassung 6 zieht nie ein neues Biom und bleibt die alte), Definition und Manifest-Rezept je Biom, Spielbarkeit je Biom (Spawn erreichbar, Stoffkarte mit Biom-Materialien, Server gleich Client, zwei Läufe gleicher Zustands- und Stoffhash), Kulissen (Dateien vorhanden, Wahl nach Seed), 27 Goldfälle der Fassungen 1 bis 6 und drei Alt-Replays bit-identisch.
- `node scripts/check-biome.mjs` prüft die Biome jetzt je mit ihrer Fassung (neue mit 7); Optionen `--fassung=N`, `--pro=N`, `--nur=a,b`.
- Befund (nicht durch die Biome verursacht): Mit Fassung 6 und 7 (Bauteilkarten) unterschreiten einzelne Seeds die Kisten-Schwelle von 50 % zu Fuß erreichbar (Seeds 951031, 1080350, 1224883; sie fallen biomunabhängig an, auch bei `vulkan` und `pilzwald`). Der Lauf auf Fassung 3 verdeckte das bisher. `check:biome` meldet bei einem solchen Seed einen Fehler; die Ursache liegt im Generator, nicht in dieser Fassung.

## Offen (bewusst nicht gebaut: das System kennt es nicht)

- **Objekte und Trigger** der SSOT (Förderplattformen, Druckkessel, Dampfventile, Schmelzöfen, Myzelnetz, Wurzelherzen, Druckkammern, Portale, Zeitrisse, Stabilisatoren, Stammsturz, Kristallresonanz …) und die **Sonderwirkungen** (Überdruck, Netzwerkreaktion, Druckentlastung, Zeit-, Dimensions-, Lichtimpuls): hängen an BS-6 (Objekt-/Trigger-System) und BS-7 (Medien) in `MASTERDOTO.md`. Die Biome unterscheiden sich vorerst durch Form, Stoffe, Himmel, Fluid und Kulisse.
- **Biom-Objekte-Sheets** (`assets/biom-objekte`, 15 bis 20): isometrische Pixel-Art, das Spiel ist eine Seitenansicht; nicht eingebunden, braucht Neuzeichnung in Seitenansicht.
- Besondere Feuer-/Lavaregeln gibt es nur im Biom `vulkan` (`feuerSystem.js`); die Schlackeschmiede nutzt sie nicht.
- Die neuen Kulissen stehen nicht im Kulissenmenü der Spieloptionen (es liest nur `BACKDROP_BIOMES`); automatisch gewählt werden hell, dunkel und Höhle. Ragnarök ist im Katalog, aber nicht in der automatischen Wahl (wie bei den klassischen Stimmungen).
- Keine biomspezifische Klangkulisse (Audit Abschnitt 6, K2); keine Hörprobe.
- Die Dateien `kerkergewoelbe.webp`, `risszone.webp`, `wurzeln.webp` (Stoff-Texturen) sind im Arbeitsbaum geändert und wurden hier nicht angefasst. Der Test „Jeder zugeordnete Stoff existiert, jede Textur hat ihre kleine Datei“ schlägt wegen der Größe von `kerkergewoelbe.webp` fehl, auch ohne die Änderungen dieser Fassung (Basislauf vor der Arbeit: 2122 von 2123 grün).
- Folge der Marke: Neue Matches ohne ausdrückliche Marke (Fassung 7) ziehen für denselben Seed ein anderes Sonderbiom als unter Fassung 6, weil die Ziehung über 20 statt 14 Plätze läuft. Das ist gewollt (neue Marke wird Standard); Replays mit Marke bleiben davon unberührt.
