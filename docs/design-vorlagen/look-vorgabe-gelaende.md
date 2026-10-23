# Look-Vorgabe Gelände (Auftraggeber, 2026-10-23)

Alle Bilder in diesem Ordner und unter `assets/gelaende-quelle/` gehören dem Auftraggeber (volles Urheberrecht).
Sie zeigen Qualität, Feinheit, Detailstufe und groben Look, den das Spiel erreichen soll.

## Referenz-Kartenausschnitte (`referenz-karten/`)
| Datei | Inhalt | Was wir übernehmen |
|---|---|---|
| ref-1-cyberstadt | Neon-Ruinenstadt, Brücken, Explosion im Vordergrund | Mehrstöckige begehbare Strukturen, Leuchtakzente, Tiefenstaffel |
| ref-2-dschungelruine | Hochformat: Tempel, Höhle, giftgrünes Wasser | Organische Überhänge, Lianen, Höhlen mit Lichtquelle |
| ref-3-vulkanschmiede-hud | Lava-Industrie MIT HUD-Leiste unten | Lava als glühender Stoff, HUD kompakt am unteren Rand, Panels dunkel/gold |
| ref-4-turmruine | Hochformat: zerfallener Hochhausturm | Vertikale Karten, Etagen als Plattformen |
| ref-5-dschungel-breit | Breites Panorama, Baumhäuser, Pilze | Panorama-Kartenformat, Pflanzen-Silhouetten |
| ref-6-hochhaus-schnitt | Schnitt durch Gebäude (Räume, Treppen) | Innenräume als Gelände-Hohlräume |

Gemeinsamer Stil: handgemalte, dichte 2D-Seitenansicht; dunkle, gesättigte Paletten mit warmen/neon Lichtakzenten;
klare Silhouettenkante oben, darunter strukturierte Materialschichten (keine flachen Füllungen);
3 Ebenen Tiefe (Hintergrund-Kulisse entsättigt, Spielgelände scharf, Vordergrundpartikel).

## Tile-Sheets (`assets/gelaende-quelle/`)
- **sheet-a-sidecut** (7 Spalten, Nr. 1–26, Nummern oben links IN der Kachel → beim Ausschneiden Rand ~12 % abschneiden):
  1 Erde/Wurzeln · 2 Moos · 3 Sand · 4 Geröll · 5 Fels · 6 Lehm · 7 Lavafels · 8 Schnee · 9 Eis · 10 Pilz/Violett ·
  11 Holz (Stämme) · 12 Ranken · 13 Kristall türkis · 14 Kristall violett · 15 Rostmetall · 16 Beton · 17 Ruinenbogen ·
  18 Wasser · 19 Riff · 20 Sand hell · 21 Obsidian/Basalt · 22 Regolith/Mond · 23 Rauch/Wolke · 24 Rohre · 25 Metallgitter · 26 Holzplanken
- **sheet-c-querschnitt**: dieselben Kacheln als Querschnitt-Komposition (Worms-Stil) — Look-Referenz, nicht schneiden.
- **sheet-b-fantasy**: alternative Fantasy-Kacheln (Lava, Riff, Höhle, Runen, Kristall-Geode, Gitter) — für Spezialbiome.
- **sheet-d-isometrisch**: isometrische Würfel — für die Seitenansicht NICHT nutzbar (ggf. Menü/Icons).

Vorgeschlagene Zuordnung zu `STOFF_TEXTUR` (src/client/stoffTexturen.js), wo heute nur Ersatz-Texturen hängen:
eis→A9 · sand→A3 · holz→A11 · beton→A16 · obsidian→A21 · basalt→A7 · regolith→A22 · pilz→A10 · (erde/fels/schnee: A1/A5/A8 nur, wenn besser als heute).
