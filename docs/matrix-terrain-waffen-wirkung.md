# Wirkungs-Übersicht: Terrain, Waffen und was auf was wirkt

*Erzeugt von `npm run matrix` (`scripts/build-matrix.mjs`). Jede Zahl ist
gerechnet — aus dem Waffenkatalog und dem Terrain-Generator, mit derselben
Regel, die der Motor benutzt. `npm run matrix:check` schlägt fehl, wenn die
Übersicht nicht mehr zum Katalog passt.*

**Katalog:** 150 Waffen · **Karte:** 2.560×1.440 px = 3.69 Mio. Pixel

## 1. Die Waffen in Zahlen

| Kategorie | Waffen | Schaden min–max | Flächenwirkung | Krater | Zünder | Durchschlag | Zielsuche |
|---|---|---|---|---|---|---|---|
| elemental | 20 | 18–75 | 14 | 4–50 px | 2 | 1 | 0 |
| heavy_ranged | 20 | 30–65 | 6 | 4–33 px | 5 | 2 | 1 |
| magic | 30 | 18–58 | 0 | 4–4 px | 0 | 1 | 0 |
| melee | 21 | 24–52 | 0 | 4–35 px | 0 | 1 | 0 |
| ranged | 19 | 20–62 | 7 | 4–80 px | 3 | 0 | 0 |
| tech | 20 | 33–68 | 1 | 4–24 px | 0 | 1 | 1 |
| ultimate | 10 | 55–110 | 7 | 4–95 px | 1 | 0 | 0 |
| utility | 10 | 30–50 | 2 | 4–27 px | 0 | 0 | 0 |
| **gesamt** | **150** | | 37 | | 11 | 6 | 2 |

**Zustellart:** 96 Projektile · 54 Hitscan. Ein Hitscan erzeugt kein Geschoss — Flug, Zünder, Durchschlag und Zielsuche
können bei ihm nicht wirken. `npm run check:effects` hält das fest.

**Wirkung OHNE Schaden (14):** Dimensionssprung (teleport), Dimensionsriss (teleport), Enterhaken (grapple), Düsenrucksack (flight), Gleitschirm (flight), Wächterstatue (guardian), Munitionskiste (ammo_drop), Endlosschleife (loop), Nachschubkiste (supply_drop), Bunker (bunker), Teleportplattform (teleport_platform), Hologrammportal (hologram_portal), Tarnnetz (camouflage), Schlauchboot (water_mobility)

Diese Waffen bewegen, schützen oder versorgen — sie graben nichts und treffen niemanden. Ihr Nutzen liegt im Spezialeffekt.

## 2. Zerstörungsgrad

Der Krater folgt EINER Regel (`engine/explosion.js`, `wendeExplosionAn`):
`terrainDamage > 0` → Radius = `terrainDamage`, sonst `blastRadius × 0,6`,
sonst ein Mindestloch von 4 px, damit ein Einschlag sichtbar bleibt.

| Grad | Kraterfläche | Waffen | stärkste Waffe |
|---|---|---|---|
| 1 · Kratzer | 50–50 px² | 104 | Feuerfaust (50 px²) |
| 2 · Loch | 201–1018 px² | 6 | Morgenstern (1018 px²) |
| 3 · Trichter | 1257–4778 px² | 31 | Giftige Weltenflasche (4778 px²) |
| 4 · Krater | 5542–9503 px² | 6 | Raketenwerfer (9503 px²) |
| 5 · Großkrater | 20106–28353 px² | 3 | Erdspalter (28353 px²) |

Von 150 Waffen graben **47** Gelände weg; **103** tun es nicht (Hitscan ohne Flächenwirkung oder Wirkung nur auf Figuren).

## 3. Terrain-Arten (gemessen, Seed 4242, 640×360)

| Art | fester Anteil | leerer Innenraum | Wasserlinie | was das für Waffen bedeutet |
|---|---|---|---|---|
| hills | 41.2 % | 36.366 px | y = 302 von 360 | Hügel in Wurfweite — Standardfall für Bogenfeuer |
| mountains | 52.7 % | 27.345 px | y = 324 von 360 | hohe Wände: Artillerie über den Berg, Hitscan trifft die Wand |
| islands | 26.3 % | 70.212 px | y = 251 von 360 | Wasser zwischen den Inseln: Rückstoß drückt hinein, Wurfwaffen verziehen |
| caverns | 27.8 % | 67.595 px | y = 316 von 360 | Höhlen: Sprengung öffnet Wege, ein Durchschlag trifft auch dahinter |
| open | 41.3 % | 22.330 px | y = 324 von 360 | kaum Deckung: direkte Schüsse und Flächenwaffen dominieren |
| spires | 61.0 % | 16.418 px | y = 342 von 360 | schmale Türme: ein Treffer am Fuß kippt die Stellung |
| flooded | 22.7 % | 86.457 px | y = 198 von 360 | Wasser über der Oberfläche: Versenken wirkt schneller als Schaden |
| warren | 24.1 % | 94.595 px | y = 324 von 360 | Gänge im Gestein: Krater verändern die Karte am stärksten |

*Zum „leeren Innenraum": Er zählt die Pixel, die Gestein ÜBER und UNTER sich
haben. Bei `caverns` und `warren` sind das die HÖHLEN, bei `hills` der nicht
gefüllte Bauch der Karte — beides ist für eine Explosion erreichbar, aber nur
im ersten Fall ein Weg.*

*Die Terrain-Art bestimmt die Wirkung mit: Ein Krater in `warren` schafft
einen Durchgang, derselbe Krater in `open` ist ein Loch im Boden.*

## 4. Wirkungs-Matrix (alle Waffen)

| # | Waffe | Klasse | Schaden | Radius | Krater | Grad | Rückstoß | Element | wirkt auf |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Baseballschläger | melee | 35 | — | 8 px | 2 | 82 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 2 | Feuerfaust | melee | 34 | — | 4 px | 1 | 55 | Feuer 18 | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 3 | Hakenklinge | melee | 30 | — | 4 px | 1 | 45 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 4 | Piratenhaken | melee | 24 | — | 4 px | 1 | 40 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 5 | Morgenstern | melee | 50 | — | 18 px | 2 | 70 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 6 | Schaufel | melee | 25 | — | 35 px | 3 | 30 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 7 | Tonfa | melee | 28 | — | 4 px | 1 | 35 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 8 | Kriegshammer | melee | 45 | — | 20 px | 3 | 65 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 9 | Eispickel | melee | 37 | — | 10 px | 2 | 30 | Eis 25 | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 10 | Kettensäge | melee | 52 | — | 15 px | 2 | 35 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 11 | Zwillingskatanas | melee | 25 | — | 4 px | 1 | 24 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 12 | Katana | melee | 32 | — | 4 px | 1 | 20 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 13 | Mehrzweckmesser | melee | 28 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 14 | Taschenmesser | melee | 35 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 15 | Runenschwert | melee | 31 | — | 4 px | 1 | 38 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 16 | Rapier | melee | 27 | — | 4 px | 1 | 10 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 17 | Kampfmesser | melee | 34 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 18 | Energieschwert | melee | 42 | — | 4 px | 1 | 45 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 19 | Doppelaxt | melee | 26 | — | 4 px | 1 | 44 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 20 | Kriegssense | melee | 33 | — | 4 px | 1 | 40 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 21 | Krummsäbel | melee | 29 | — | 4 px | 1 | 22 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 22 | Plasmawerfer | ranged | 34 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 23 | Boxhandschuhe | ranged | 20 | — | 4 px | 1 | 96 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 24 | Mittelfinger | ranged | 24 | — | 4 px | 1 | 10 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 25 | Handtuch | ranged | 31 | — | 4 px | 1 | 20 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 26 | Pressluftbohrer | ranged | 36 | — | 80 px | 5 | 30 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 27 | Fackel | ranged | 23 | — | 4 px | 1 | 14 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 28 | Kaktusbombe | ranged | 48 | 48 | 29 px | 3 | 30 | Gift 12 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Zustand (Element) |
| 29 | Pömpel | ranged | 32 | 30 | 18 px | 2 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 30 | Impulsbombe | ranged | 42 | 52 | 31 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 31 | Kraftfaust | ranged | 48 | — | 4 px | 1 | 60 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 32 | Raketenrucksack | ranged | — | — | 4 px | 1 | 30 | — | Stellung (Rückstoß) |
| 33 | Zauberstab | ranged | 21 | — | 4 px | 1 | 40 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 34 | Zauberbolzen | ranged | 28 | — | 4 px | 1 | 8 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 35 | Energieball | ranged | 54 | 34 | 20 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 36 | Raketenhandschuh | ranged | 31 | — | 4 px | 1 | 45 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 37 | Raketenwerfer | ranged | 62 | 46 | 55 px | 4 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 38 | Rakete | ranged | 58 | 38 | 23 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 39 | Feldmörser | ranged | 48 | 45 | 27 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 40 | Maschinenpistole | ranged | 21 | — | 4 px | 1 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 41 | Salvengeber | heavy_ranged | 48 | 16 | 18 px | 2 | 8 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 42 | Feuerwerkssalve | heavy_ranged | 58 | — | 4 px | 1 | 12 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 43 | Kampfgeschütz | heavy_ranged | 50 | — | 4 px | 1 | 36 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 44 | Phönixschlag | heavy_ranged | 65 | 55 | 33 px | 3 | 30 | Feuer 35 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Ziel (suchend), Zustand (Element) |
| 45 | Raketensalve | heavy_ranged | 56 | — | 4 px | 1 | 24 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 46 | Splittergranate | heavy_ranged | 42 | 42 | 25 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 47 | Handgranate | heavy_ranged | 61 | — | 4 px | 1 | 28 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 48 | Bananengranate | heavy_ranged | 46 | 40 | 24 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 49 | Bumerang | heavy_ranged | 30 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 50 | Doppelkopfaxt | heavy_ranged | 59 | — | 4 px | 1 | 40 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 51 | Wurfklingen | heavy_ranged | 52 | — | 4 px | 1 | 6 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 52 | Molotowcocktail | heavy_ranged | 36 | 42 | 25 px | 3 | 30 | Feuer 32 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Zustand (Element) |
| 53 | Roboterbombe | heavy_ranged | 52 | 45 | 27 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 54 | Schrotflinte | heavy_ranged | 44 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 55 | Fernbüchse | heavy_ranged | 42 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 56 | Präzisionsgewehr | heavy_ranged | 55 | — | 20 px | 3 | 12 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 57 | Revolver | heavy_ranged | 38 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 58 | Kampfbogen | heavy_ranged | 42 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 59 | Armbrust | heavy_ranged | 41 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 60 | Gatlingkanone | heavy_ranged | 34 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 61 | Feuerdämon | elemental | 58 | 44 | 26 px | 3 | — | Feuer 38 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 62 | Flammenwerfer | elemental | 48 | — | 4 px | 1 | — | Feuer 45 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 63 | Wasserwerfer | elemental | 32 | — | 42 px | 4 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 64 | Katapult | elemental | 68 | 48 | 29 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 65 | Meteorbrocken | elemental | 74 | 50 | 50 px | 4 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 66 | Haubitze | elemental | 56 | 48 | 29 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 67 | Säurekanone | elemental | 35 | 38 | 23 px | 3 | — | Gift 28 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 68 | Plasmagewehr | elemental | 54 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 69 | Raketenkanone | elemental | 56 | 40 | 24 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 70 | Giftwolke | elemental | 18 | 58 | 35 px | 3 | — | Gift 45 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 71 | Eisschlag | elemental | 55 | 35 | 21 px | 3 | — | Eis 50 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 72 | Feuerball | elemental | 48 | 34 | 20 px | 3 | — | Feuer 30 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 73 | Tentakelgift | elemental | 32 | 44 | 26 px | 3 | — | Gift 55 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 74 | Verderbnissiegel | elemental | 28 | 46 | 28 px | 3 | — | Gift 20 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 75 | Tornado | elemental | 45 | 60 | 36 px | 3 | 88 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 76 | Portalring | elemental | 35 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 77 | Schwarzes Loch | elemental | 75 | 72 | 43 px | 4 | 80 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 78 | Voodoopuppe | elemental | 45 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 79 | Kosmisches Portal | elemental | 20 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 80 | Psionischer Tentakel | elemental | 44 | 52 | 31 px | 3 | 60 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 81 | Zauberbuch der Leere | magic | 55 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 82 | Goldene Zauberrolle | magic | 44 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 83 | Goldene Hand | magic | 46 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 84 | Glutelixier | magic | 34 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 85 | Feuermagier | magic | 45 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 86 | Windkrieger | magic | 42 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 87 | Dimensionssprung | magic | — | — | 4 px | 1 | — | — | — |
| 88 | Dimensionsriss | magic | — | — | 4 px | 1 | — | — | — |
| 89 | Zauberstiefel | magic | 36 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 90 | Giftpilz | magic | 18 | — | 4 px | 1 | — | Gift 50 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 91 | Astralkugel | magic | 58 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 92 | Heilzauber | magic | 35 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 93 | Funkenschild | magic | 30 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 94 | Heilspritze | magic | 39 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 95 | Sturmelixier | magic | 34 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 96 | Mutationselixier | magic | 29 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 97 | Traumfänger | magic | 30 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 98 | Lavaelixier | magic | 50 | — | 4 px | 1 | — | Feuer 45 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 99 | Frostsanduhr | magic | 28 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 100 | Blitzwürfel | magic | 36 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 101 | Eisschild | magic | 32 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 102 | Gedankensturm | magic | 52 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 103 | Verderbniskelch | magic | 30 | — | 4 px | 1 | — | Gift 30 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 104 | Quantengewehr | magic | 45 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 105 | Frostrolle | magic | 48 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 106 | Sonnenamulett | magic | 38 | — | 4 px | 1 | — | Feuer 25 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 107 | Allsehendes Auge | magic | 29 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 108 | Zauberpeitsche | magic | 32 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 109 | Giftbaum | magic | 33 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 110 | Dimensionskugel | magic | 28 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 111 | Enterhaken | utility | — | — | 4 px | 1 | — | — | — |
| 112 | Düsenrucksack | utility | — | — | 4 px | 1 | — | — | — |
| 113 | Bohrkanone | utility | 30 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 114 | Gleitschirm | utility | — | — | 4 px | 1 | — | — | — |
| 115 | Wächterstatue | utility | — | — | 4 px | 1 | — | — | — |
| 116 | Blutritual | utility | 50 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 117 | Ananasbombe | utility | 48 | 45 | 27 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 118 | Feuerwesen | utility | 46 | 42 | 25 px | 3 | — | Feuer 40 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 119 | Munitionskiste | utility | — | — | 4 px | 1 | — | — | — |
| 120 | Energiefaust | utility | 48 | — | 4 px | 1 | 78 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 121 | Raketenfaust | tech | 58 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 122 | Endlosschleife | tech | — | — | 4 px | 1 | — | — | — |
| 123 | Magnetkanone | tech | 40 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 124 | Wachgeschütz | tech | 38 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 125 | Nachschubkiste | tech | — | — | 4 px | 1 | — | — | — |
| 126 | Bunker | tech | — | — | 4 px | 1 | — | — | — |
| 127 | Teleportplattform | tech | — | — | 4 px | 1 | — | — | — |
| 128 | Hologrammportal | tech | — | — | 4 px | 1 | — | — | — |
| 129 | Tesla-Turm | tech | 48 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 130 | Tarnnetz | tech | — | — | 4 px | 1 | — | — | — |
| 131 | Schlauchboot | tech | — | — | 4 px | 1 | — | — | — |
| 132 | Alte Dame | tech | 55 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 133 | Fliegendes Superschaf | tech | 60 | 40 | 24 px | 3 | — | Feuer 25 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Ziel (suchend), Zustand (Element) |
| 134 | Luftangriff | tech | 62 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 135 | Meteorregen | tech | 68 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 136 | Bohrkopfrakete | tech | 64 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 137 | Flammenklinge | tech | 33 | — | 4 px | 1 | 55 | Feuer 30 | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 138 | Arkanhammer | tech | 68 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 139 | Höllenkanone | tech | 68 | — | 4 px | 1 | — | Feuer 48 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 140 | Quantenkanone | tech | 47 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 141 | Astralkrieger | ultimate | 70 | 55 | 33 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 142 | Leerenritter | ultimate | 82 | — | 4 px | 1 | 75 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 143 | Astralross | ultimate | 65 | — | 4 px | 1 | 70 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 144 | Kosmische Wassermelone | ultimate | 85 | 70 | 42 px | 4 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 145 | Erdspalter | ultimate | 95 | 75 | 95 px | 5 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 146 | Giftige Weltenflasche | ultimate | 55 | 65 | 39 px | 3 | — | Gift 80 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 147 | Weltendrache | ultimate | 100 | 80 | 48 px | 4 | — | Feuer 75 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 148 | Feuerschild | ultimate | 70 | 60 | 36 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 149 | Goldene Reliktkugel | ultimate | 78 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 150 | Kosmischer Kern | ultimate | 110 | 90 | 90 px | 5 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |

## 5. Zustands-Effekte (Elementarschaden)

Elementarschaden wird in `src/engine/specials.js` in Zustände übersetzt:
Feuer und Gift als Schaden über Zeit, Eis als Einfrieren. Die Dauer wächst
mit der Summe der Elementpunkte.

**Feuer** (13): Weltendrache 75, Höllenkanone 48, Flammenwerfer 45, Lavaelixier 45, Feuerwesen 40, Feuerdämon 38, Phönixschlag 35, Molotowcocktail 32, … (5 weitere)

**Eis** (2): Eisschlag 50, Eispickel 25

**Gift** (8): Giftige Weltenflasche 80, Tentakelgift 55, Giftpilz 50, Giftwolke 45, Verderbniskelch 30, Säurekanone 28, Verderbnissiegel 20, Kaktusbombe 12

## 6. Woher die Zahlen kommen

| Größe | Quelle |
|---|---|
| Schaden, Radius, Rückstoß, Elemente, Durchschlag, Zielsuche | `src/shared/config/weapons.js` (erzeugt aus `project_armageddon_weapons_v1.json`) |
| Kraterradius | `src/engine/explosion.js`, `wendeExplosionAn` — hier nachgebildet und im Test verglichen |
| Flächenwirkung auf Figuren | Falloff `max(0,25, 1 − Abstand/Radius)` je Figur im Radius |
| Wasser | `water.displace(x, y, craterRadius, 0,65)` bei jedem Krater |
| Kisten und NPCs | Sie tragen `Position`+`Health` und werden vom Flächenschaden mitgetroffen |
| Terrain-Kennzahlen | `generateTerrain` mit Seed 4242, 640×360 — dieselbe Vorgabe für alle Arten |

*Felder ohne Wirkung sind der Fehler, den `npm run check:effects` sucht:
Bis 2026-09-20 trugen 6 Waffen `piercing` und 2 `homing`, ohne dass ein Stück
Motorcode sie las — die Übersicht hätte damals Wirkungen ausgewiesen, die es
nicht gab.*

## Material × Schadensart (Zerstörung Fassung 5)

Faktoren auf Kraterradius/-tiefe der Fassung 4, gerechnet aus `src/shared/config/stoffe.js` (`stoffWirkung`). `0` = der Stoff hält.
Die Stoffkarte (`src/shared/stoffkarte.js`) entsteht aus Seed + Biom und wird vom Client nachgebaut — keine Netzlast.

| Stoff | Härte | Sprengung r/t | Durchschlag r | Hitze r | Kälte r | Säure r | Reaktion bei Hitze |
|---|---|---|---|---|---|---|---|
| Erde (`erde`) | normal | 1 / 1 | 1 | 1 | 1 | 1 | – |
| Sand (`sand`) | weich | 1,5 / 1,21 | 1,38 | 1,29 | 1,5 | 1,5 | – |
| Schnee (`schnee`) | weich | 1,62 / 1,26 | 1,49 | 2,17 | 1,46 | 1,62 | schmilzt |
| Pilzgewebe (`pilz`) | weich | 1,44 / 1,21 | 1,32 | 1,73 | 1,44 | 1,66 | brennt |
| Holz (`holz`) | normal | 0,95 / 0,9 | 0,95 | 1,19 | 0,95 | 0,95 | brennt |
| Fels (`fels`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Obsidian (`obsidian`) | sehr_hart | 0,16 / 0,12 | 0 | 0,16 | 0,16 | 0,16 | – |
| Eis (`eis`) | normal | 1 / 0,85 | 1 | 1,5 | 0,8 | 1 | schmilzt |
| Kristall (`kristall`) | hart | 0,6 / 0,3 | 0,28 | 0,6 | 0,6 | 0,54 | – |
| Metallplatte (`metall`) | unzerstoerbar | 0 / 0 | 0 | 0 | 0 | 0 | haelt |
| Grundgestein (`grundgestein`) | unzerstoerbar | 0 / 0 | 0 | 0 | 0 | 0 | haelt |
| Basalt (`basalt`) | hart | 0,49 / 0,25 | 0,23 | 0,44 | 0,49 | 0,54 | – |
| Asche (`asche`) | weich | 1,56 / 1,21 | 1,43 | 1,5 | 1,56 | 1,56 | – |
| Koralle (`koralle`) | normal | 0,95 / 0,8 | 0,95 | 0,95 | 0,95 | 1,23 | – |
| Beton (`beton`) | hart | 0,54 / 0,28 | 0,25 | 0,51 | 0,54 | 0,62 | – |
| Glas (`glas`) | normal | 1,05 / 0,8 | 1,05 | 1,26 | 1,16 | 1,05 | schmilzt |
| Regolith (`regolith`) | weich | 1,56 / 1,21 | 1,43 | 1,35 | 1,56 | 1,56 | – |
| Magiekristall (`magiekristall`) | hart | 0,56 / 0,28 | 0,26 | 0,62 | 0,56 | 0,48 | – |
| Alienharz (`alienharz`) | weich | 1,38 / 1,1 | 1,26 | 1,72 | 1,38 | 1,52 | brennt |
| Asteroidenbasalt (`asteroidenbasalt`) | hart | 0,49 / 0,25 | 0,23 | 0,44 | 0,49 | 0,54 | – |
| Betonreste (`betonreste`) | normal | 1 / 0,9 | 1 | 1 | 1 | 1,15 | – |
| Bimsstein (`bimsstein`) | weich | 1,44 / 1,16 | 1,32 | 1,24 | 1,44 | 1,44 | – |
| Burgfelsen (`burgfelsen`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Dampfkammer (`dampfkammer`) | weich | 1,92 / 0,33 | 1,76 | 1,84 | 1,54 | 1,92 | – |
| Druckkammer (`druckkammer`) | sehr_hart | 0,16 / 0,12 | 0 | 0,16 | 0,16 | 0,18 | – |
| Eisader (`eisader`) | normal | 0,95 / 0,8 | 0,95 | 1,33 | 0,76 | 0,95 | schmilzt |
| Erdüberzug (`erdueberzug`) | weich | 1,32 / 0,88 | 1,21 | 1,26 | 1,32 | 1,32 | – |
| Feinsand (`feinsand`) | weich | 1,5 / 1,21 | 1,38 | 1,29 | 1,5 | 1,5 | – |
| Feuchte Erde (`feuchte_erde`) | weich | 1,32 / 1,1 | 1,21 | 1,14 | 1,32 | 1,32 | – |
| Firnschnee (`firnschnee`) | weich | 1,5 / 1,21 | 1,38 | 2,01 | 1,35 | 1,5 | schmilzt |
| Gefrorene Wurzeln (`gefrorene_wurzeln`) | normal | 0,95 / 0,85 | 0,95 | 1,05 | 0,86 | 0,95 | brennt |
| gehärtetes Glas (`gehaertetes_glas`) | hart | 0,56 / 0,28 | 0,26 | 0,51 | 0,51 | 0,56 | schmilzt |
| Geröll (`geroell`) | weich | 1,38 / 1,1 | 1,26 | 1,32 | 1,38 | 1,38 | – |
| Giftablagerungen (`giftablagerungen`) | weich | 1,44 / 1,16 | 1,32 | 1,38 | 1,44 | 1,15 | – |
| Giftnebel (`giftnebel`) | weich | 1,92 / 0,33 | 1,76 | 1,84 | 1,92 | 1,54 | – |
| Glasfassade (`glasfassade`) | normal | 0,95 / 0,75 | 0,95 | 1,14 | 1,05 | 0,95 | schmilzt |
| Glasfragmente (`glasfragmente`) | weich | 1,56 / 1,1 | 1,43 | 1,79 | 1,72 | 1,56 | schmilzt |
| Glasplatten (`glasplatten`) | normal | 1 / 0,8 | 1 | 1,2 | 1,1 | 1 | schmilzt |
| Gletschereis (`gletschereis`) | hart | 0,6 / 0,35 | 0,28 | 0,84 | 0,48 | 0,6 | schmilzt |
| Holzaufbauten (`holzaufbauten`) | normal | 0,95 / 0,9 | 0,95 | 1,19 | 0,95 | 0,95 | brennt |
| Holzreste (`holzreste`) | weich | 1,32 / 1,1 | 1,21 | 1,64 | 1,32 | 1,32 | brennt |
| Humus (`humus`) | weich | 1,38 / 1,16 | 1,26 | 1,45 | 1,38 | 1,38 | brennt |
| Hydrothermalablagerungen (`hydrothermalablagerungen`) | normal | 0,9 / 0,75 | 0,9 | 0,81 | 0,9 | 1,08 | – |
| Industriemagma (`industriemagma`) | weich | 1,92 / 0,33 | 1,76 | 1,84 | 1,92 | 1,92 | – |
| Instabiler Boden (`instabiler_boden`) | weich | 1,56 / 1,32 | 1,43 | 1,5 | 1,56 | 1,56 | – |
| Kalkstein (`kalkstein`) | normal | 0,9 / 0,7 | 0,9 | 0,9 | 0,86 | 1,26 | – |
| Keramik (`keramik`) | hart | 0,6 / 0,3 | 0,28 | 0,42 | 0,63 | 0,6 | – |
| Kerkergewölbe (`kerkergewoelbe`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Klareis (`klareis`) | normal | 1 / 0,85 | 1 | 1,5 | 0,8 | 1 | schmilzt |
| Klareiskristall (`klareiskristall`) | hart | 0,6 / 0,3 | 0,28 | 0,84 | 0,48 | 0,6 | schmilzt |
| Kolossstamm (`kolossstamm`) | hart | 0,49 / 0,28 | 0,23 | 0,54 | 0,49 | 0,49 | brennt |
| Kontaminierte Ablagerungen (`kontaminierte_ablagerungen`) | weich | 1,38 / 1,1 | 1,26 | 1,32 | 1,38 | 1,17 | – |
| Kontaminierte Erde (`kontaminierte_erde`) | normal | 1 / 1 | 1 | 1 | 1 | 1,1 | – |
| korrodiertes Metall (`korrodiertes_metall`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,52 | 0,73 | – |
| Korrosion (`korrosion`) | weich | 1,44 / 1,1 | 1,32 | 1,38 | 1,44 | 1,73 | – |
| Kristalladern (`kristalladern`) | hart | 0,6 / 0,3 | 0,28 | 0,6 | 0,6 | 0,54 | – |
| Kristallblätter (`kristallblaetter`) | normal | 1 / 0,7 | 1 | 1 | 1 | 0,9 | – |
| Kristallfelsen (`kristallfelsen`) | hart | 0,56 / 0,28 | 0,26 | 0,56 | 0,56 | 0,62 | – |
| Lavaglas (`lavaglas`) | hart | 0,52 / 0,25 | 0,24 | 0,63 | 0,58 | 0,52 | schmilzt |
| lebende Koralle (`lebende_koralle`) | normal | 0,95 / 0,75 | 0,95 | 1,05 | 0,95 | 1,33 | – |
| lehmige Erde (`lehmige_erde`) | normal | 0,95 / 0,95 | 0,95 | 0,95 | 0,95 | 0,95 | – |
| Leuchtalgen (`leuchtalgen`) | weich | 1,5 / 1,21 | 1,38 | 1,73 | 1,5 | 1,8 | – |
| Leuchtkristall (`leuchtkristall`) | hart | 0,6 / 0,3 | 0,28 | 0,6 | 0,6 | 0,54 | – |
| Leuchtpilzgewebe (`leuchtpilzgewebe`) | weich | 1,44 / 1,21 | 1,32 | 1,73 | 1,44 | 1,66 | brennt |
| Magmaadern (`magmaadern`) | hart | 0,52 / 0,25 | 0,24 | 0,47 | 0,63 | 0,52 | schmilzt |
| Magnetgestein (`magnetgestein`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,52 | 0,52 | – |
| Massivfels (`massivfels`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Mauerwerk (`mauerwerk`) | hart | 0,55 / 0,28 | 0,26 | 0,53 | 0,55 | 0,64 | – |
| Metallader (`metallader`) | sehr_hart | 0,18 / 0,14 | 0 | 0,18 | 0,18 | 0,18 | – |
| Metallfragmente (`metallfragmente`) | normal | 1 / 0,8 | 1 | 1 | 1 | 1 | – |
| Metallgitter (`metallgitter`) | normal | 0,9 / 0,7 | 0,9 | 0,9 | 0,9 | 0,9 | – |
| Metallplatten (`metallplatten`) | sehr_hart | 0,18 / 0,12 | 0 | 0,18 | 0,18 | 0,18 | – |
| Metallschienen (`metallschienen`) | hart | 0,49 / 0,23 | 0,23 | 0,49 | 0,49 | 0,49 | – |
| Metallträger (`metalltraeger`) | sehr_hart | 0,18 / 0,12 | 0 | 0,18 | 0,18 | 0,18 | – |
| Metalltrümmer (`metalltruemmer`) | normal | 1 / 0,8 | 1 | 1 | 1 | 1 | – |
| Meteoritenfels (`meteoritenfels`) | sehr_hart | 0,2 / 0,14 | 0 | 0,2 | 0,2 | 0,2 | – |
| Moos (`moos`) | weich | 1,56 / 1,16 | 1,43 | 1,79 | 1,56 | 1,56 | brennt |
| Mutterboden (`mutterboden`) | weich | 1,38 / 1,16 | 1,26 | 1,32 | 1,38 | 1,38 | – |
| Myzelmatte (`myzelmatte`) | weich | 1,44 / 1,21 | 1,32 | 1,73 | 1,44 | 1,66 | brennt |
| Nickel-Eisen (`nickel_eisen`) | sehr_hart | 0,18 / 0,14 | 0 | 0,18 | 0,18 | 0,18 | – |
| Organische Riffablagerungen (`organische_riffablagerungen`) | weich | 1,44 / 1,1 | 1,32 | 1,38 | 1,44 | 1,87 | – |
| Organische Tragwurzeln (`organische_tragwurzeln`) | normal | 0,95 / 0,9 | 0,95 | 1,19 | 0,95 | 0,95 | brennt |
| Phasen-Fels (`phasen_fels`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Pilzbrücke (`pilzbruecke`) | normal | 1 / 0,85 | 1 | 1,25 | 1 | 1,15 | brennt |
| Pilze (`pilze`) | weich | 1,44 / 1,21 | 1,32 | 1,73 | 1,44 | 1,66 | brennt |
| Pilzmyzel (`pilzmyzel`) | weich | 1,44 / 1,21 | 1,32 | 1,73 | 1,44 | 1,66 | brennt |
| Poröser Beton (`poroeser_beton`) | hart | 0,64 / 0,33 | 0,3 | 0,64 | 0,64 | 0,8 | – |
| Poröser Fels (`poroeser_fels`) | hart | 0,64 / 0,3 | 0,3 | 0,64 | 0,64 | 0,8 | – |
| Pulverschnee (`pulverschnee`) | weich | 1,68 / 1,32 | 1,54 | 2,25 | 1,51 | 1,68 | schmilzt |
| Rankgitter (`rankgitter`) | weich | 1,32 / 0,99 | 1,21 | 1,64 | 1,32 | 1,52 | brennt |
| Raumanker (`raumanker`) | unzerstoerbar | 0 / 0 | 0 | 0 | 0 | 0 | haelt |
| Regolith-Staub (`regolith_staub`) | weich | 1,56 / 1,21 | 1,43 | 1,35 | 1,56 | 1,56 | – |
| Riff-Kalkstein (`riff_kalkstein`) | normal | 0,95 / 0,8 | 0,95 | 0,95 | 0,95 | 1,28 | – |
| Risszone (`risszone`) | weich | 1,87 / 1,21 | 1,72 | 1,5 | 1,56 | 1,56 | – |
| Rohrleitungen (`rohrleitungen`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,52 | 0,63 | – |
| Rostmetall (`rostmetall`) | hart | 0,56 / 0,28 | 0,26 | 0,56 | 0,56 | 0,79 | – |
| Salzkruste (`salzkruste`) | normal | 1 / 0,85 | 1 | 1 | 1 | 1,1 | – |
| Sandstein (`sandstein`) | normal | 0,9 / 0,75 | 0,9 | 0,9 | 0,9 | 1,03 | – |
| Säureablagerungen (`saeureablagerungen`) | weich | 1,38 / 1,1 | 1,26 | 1,32 | 1,38 | 0,83 | – |
| Säureboden (`saeureboden`) | weich | 1,44 / 1,16 | 1,32 | 1,38 | 1,44 | 0,86 | – |
| Schlacke (`schlacke`) | normal | 0,9 / 0,75 | 0,9 | 1,08 | 0,99 | 0,9 | schmilzt |
| Schrott (`schrott`) | normal | 0,95 / 0,8 | 0,95 | 0,95 | 0,95 | 1,14 | – |
| Schwebende Plattformen (`schwebende_plattformen`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Schwefelkruste (`schwefelkruste`) | normal | 1 / 0,85 | 1 | 1,3 | 1 | 1,05 | brennt |
| Seegras (`seegras`) | weich | 1,44 / 1,1 | 1,32 | 1,79 | 1,44 | 1,58 | brennt |
| Stabilisatormaterial (`stabilisatormaterial`) | unzerstoerbar | 0 / 0 | 0 | 0 | 0 | 0 | haelt |
| Stahlbeton (`stahlbeton`) | sehr_hart | 0,2 / 0,14 | 0 | 0,19 | 0,2 | 0,22 | – |
| Stalaktiten (`stalaktiten`) | normal | 1,2 / 0,8 | 1,2 | 1 | 1 | 1,3 | – |
| Teer (`teer`) | weich | 1,32 / 1,1 | 1,21 | 1,64 | 1,32 | 1,32 | brennt |
| Tempelstein (`tempelstein`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,52 | 0,6 | – |
| Tiefenfels (`tiefenfels`) | sehr_hart | 0,2 / 0,14 | 0 | 0,2 | 0,19 | 0,22 | – |
| Tiefseebasalt (`tiefseebasalt`) | hart | 0,49 / 0,25 | 0,23 | 0,44 | 0,49 | 0,54 | – |
| Tiefseeschlamm (`tiefseeschlamm`) | weich | 1,56 / 1,21 | 1,43 | 1,5 | 1,56 | 1,56 | – |
| Totholz & Knochen (`totholz_knochen`) | normal | 0,95 / 0,9 | 0,95 | 1,19 | 0,95 | 0,95 | brennt |
| Traumgestein (`traumgestein`) | hart | 0,56 / 0,28 | 0,26 | 0,56 | 0,56 | 0,62 | – |
| Treibsand (`treibsand`) | weich | 1,5 / 1,21 | 1,38 | 1,29 | 1,5 | 1,5 | – |
| Unterwasserfels (`unterwasserfels`) | hart | 0,52 / 0,25 | 0,24 | 0,52 | 0,5 | 0,63 | – |
| Unterwassersand (`unterwassersand`) | weich | 1,5 / 1,21 | 1,38 | 1,29 | 1,5 | 1,5 | – |
| Verdichteter Sand (`verdichteter_sand`) | normal | 1 / 0,9 | 1 | 0,9 | 1 | 1 | – |
| Versteinerte Wurzeln (`versteinerte_wurzeln`) | hart | 0,56 / 0,28 | 0,26 | 0,56 | 0,56 | 0,62 | – |
| Versteinertes Holz (`versteinertes_holz`) | hart | 0,56 / 0,28 | 0,26 | 0,56 | 0,56 | 0,62 | – |
| Wasser (`wasser`) | weich | 1,34 / 1,32 | 1,23 | 1,61 | 2,02 | 1,68 | – |
| Wasserader (`wasserader`) | weich | 1,44 / 1,1 | 1,32 | 1,38 | 1,73 | 1,44 | – |
| Wolkenstein (`wolkenstein`) | weich | 1,38 / 1,1 | 1,26 | 1,32 | 1,38 | 1,38 | – |
| Wurzeln (`wurzeln`) | normal | 1 / 0,9 | 1 | 1,2 | 1 | 1 | brennt |
| Zeitkristall (`zeitkristall`) | hart | 0,6 / 0,3 | 0,28 | 0,6 | 0,6 | 0,54 | – |

