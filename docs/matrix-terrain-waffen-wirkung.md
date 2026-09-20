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
| heavy_ranged | 20 | 22–65 | 6 | 4–33 px | 5 | 2 | 1 |
| magic | 30 | 18–62 | 9 | 4–36 px | 0 | 1 | 0 |
| melee | 21 | 20–52 | 0 | 4–35 px | 0 | 1 | 0 |
| ranged | 19 | 14–62 | 7 | 4–80 px | 3 | 0 | 0 |
| tech | 20 | 27–78 | 10 | 4–65 px | 0 | 1 | 1 |
| ultimate | 10 | 55–110 | 7 | 4–95 px | 1 | 0 | 0 |
| utility | 10 | 28–55 | 3 | 4–85 px | 0 | 0 | 0 |
| **gesamt** | **150** | | 56 | | 11 | 6 | 2 |

**Zustellart:** 96 Projektile · 54 Hitscan. Ein Hitscan erzeugt kein Geschoss — Flug, Zünder, Durchschlag und Zielsuche
können bei ihm nicht wirken. `npm run check:effects` hält das fest.

**Wirkung OHNE Schaden (6):** Dimensionssprung (teleport), Dimensionsriss (teleport), Grappling Hook (grapple), Jetpack (flight), Gleitschirm (flight), Munitionskiste (ammo_drop)

Diese Waffen bewegen, schützen oder versorgen — sie graben nichts und treffen niemanden. Ihr Nutzen liegt im Spezialeffekt.

## 2. Zerstörungsgrad

Der Krater folgt EINER Regel (`projectileSystem.#explode`):
`terrainDamage > 0` → Radius = `terrainDamage`, sonst `blastRadius × 0,6`,
sonst ein Mindestloch von 4 px, damit ein Einschlag sichtbar bleibt.

| Grad | Kraterfläche | Waffen | stärkste Waffe |
|---|---|---|---|
| 1 · Kratzer | 50–50 px² | 83 | Feuerfaust (50 px²) |
| 2 · Loch | 201–1018 px² | 7 | Morgenstern (1018 px²) |
| 3 · Trichter | 1257–4778 px² | 49 | Luftangriff (4778 px²) |
| 4 · Krater | 5542–13273 px² | 7 | Bohrkopfrakete (13273 px²) |
| 5 · Großkrater | 20106–28353 px² | 4 | Erdspalter (28353 px²) |

Von 150 Waffen graben **68** Gelände weg; **82** tun es nicht (Hitscan ohne Flächenwirkung oder Wirkung nur auf Figuren).

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
| 1 | Baseballschläger | melee | 28 | — | 8 px | 2 | 82 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 2 | Feuerfaust | melee | 34 | — | 4 px | 1 | 55 | Feuer 18 | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 3 | Hakenklinge | melee | 30 | — | 4 px | 1 | 45 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 4 | Piratenhaken | melee | 24 | — | 4 px | 1 | 40 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 5 | Morgenstern | melee | 42 | — | 18 px | 2 | 70 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 6 | Schaufel | melee | 20 | — | 35 px | 3 | 30 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 7 | Tonfa | melee | 22 | — | 4 px | 1 | 35 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 8 | Kriegshammer | melee | 45 | — | 20 px | 3 | 65 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 9 | Eispickel | melee | 30 | — | 10 px | 2 | 30 | Eis 25 | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 10 | Kettensäge | melee | 52 | — | 15 px | 2 | 35 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 11 | Zwillingskatanas | melee | 25 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 12 | Katana | melee | 32 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 13 | Multifunktionsmesser | melee | 28 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 14 | Taschenmesser | melee | 35 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 15 | Runenschwert | melee | 31 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 16 | Rapier | melee | 27 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 17 | Kampfmesser | melee | 34 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 18 | Energieschwert | melee | 42 | — | 4 px | 1 | 45 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 19 | Doppelaxt | melee | 26 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 20 | Kriegssense | melee | 33 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 21 | Gebogene Klinge | melee | 29 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 22 | Plasma-Blaster | ranged | 34 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 23 | Boxhandschuhe | ranged | 20 | — | 4 px | 1 | 96 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 24 | Mittelfinger | ranged | 24 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 25 | Handtuch | ranged | 31 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 26 | Pneumatischer Bohrer | ranged | 18 | — | 80 px | 5 | 30 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 27 | Fackel | ranged | 23 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 28 | Kaktusbombe | ranged | 48 | 48 | 29 px | 3 | 30 | Gift 12 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Zustand (Element) |
| 29 | Pömpel | ranged | 32 | 30 | 18 px | 2 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 30 | Cyber-Bombe | ranged | 42 | 52 | 31 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 31 | Power Gauntlets | ranged | 48 | — | 4 px | 1 | 60 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 32 | Raketenrucksack | ranged | — | — | 4 px | 1 | 30 | — | Stellung (Rückstoß) |
| 33 | Magischer Kampfstock | ranged | 21 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 34 | Magischer Geschosszauber | ranged | 28 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 35 | Explosiver Energieball | ranged | 54 | 34 | 20 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 36 | Raketenhandschuh | ranged | 31 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 37 | Raketenwerfer | ranged | 62 | 46 | 55 px | 4 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 38 | Rakete | ranged | 50 | 38 | 23 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 39 | Feldkanone / Mörser | ranged | 58 | 45 | 27 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 40 | Maschinenpistole | ranged | 14 | — | 4 px | 1 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 41 | Salvengeber | heavy_ranged | 22 | 16 | 18 px | 2 | 8 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 42 | Feuerwerks-Salve | heavy_ranged | 58 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 43 | Kampfgeschütz | heavy_ranged | 50 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 44 | Phönix-Angriff | heavy_ranged | 65 | 55 | 33 px | 3 | 30 | Feuer 35 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Ziel (suchend), Zustand (Element) |
| 45 | Raketen-Salve | heavy_ranged | 56 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 46 | Splittergranate | heavy_ranged | 42 | 42 | 25 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 47 | Handgranate | heavy_ranged | 61 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 48 | Bananengranate | heavy_ranged | 46 | 40 | 24 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 49 | Bumerang | heavy_ranged | 30 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 50 | Doppelkopf-Axt | heavy_ranged | 59 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 51 | Wurfklingen | heavy_ranged | 52 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 52 | Molotowcocktail | heavy_ranged | 36 | 42 | 25 px | 3 | 30 | Feuer 32 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß), Zustand (Element) |
| 53 | Roboterbombe | heavy_ranged | 52 | 45 | 27 px | 3 | 30 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 54 | Schrotflinte | heavy_ranged | 44 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 55 | Scharfschützengewehr | heavy_ranged | 65 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 56 | Präzisionsgewehr | heavy_ranged | 55 | — | 20 px | 3 | 12 | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 57 | Revolver | heavy_ranged | 38 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 58 | Kampfbogen | heavy_ranged | 42 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 59 | Armbrust | heavy_ranged | 55 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Figur (Durchschlag 1×) |
| 60 | Minigun | heavy_ranged | 28 | — | 4 px | 1 | 30 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 61 | Feuerdämon | elemental | 58 | 44 | 26 px | 3 | — | Feuer 38 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 62 | Flammenwerfer | elemental | 48 | — | 4 px | 1 | — | Feuer 45 | Figur (direkt), Kisten (zerstörbar), Zustand (Element) |
| 63 | Wasserblaster | elemental | 18 | — | 42 px | 4 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 64 | Katapult | elemental | 68 | 48 | 29 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 65 | Meteoritenbrocken | elemental | 74 | 50 | 50 px | 4 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 66 | Artilleriegeschütz | elemental | 64 | 48 | 29 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 67 | Säurekanone | elemental | 35 | 38 | 23 px | 3 | — | Gift 28 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 68 | Plasma-Gewehr | elemental | 50 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 69 | Raketenkanone | elemental | 46 | 40 | 24 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 70 | Giftwolke | elemental | 18 | 58 | 35 px | 3 | — | Gift 45 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 71 | Eisschlag | elemental | 42 | 35 | 21 px | 3 | — | Eis 50 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 72 | Feuerball | elemental | 48 | 34 | 20 px | 3 | — | Feuer 30 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 73 | Tentakelgift | elemental | 32 | 44 | 26 px | 3 | — | Gift 55 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 74 | Verderbnis-Siegel | elemental | 28 | 46 | 28 px | 3 | — | Gift 20 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 75 | Tornado | elemental | 18 | 60 | 36 px | 3 | 88 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 76 | Portalring | elemental | 35 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 77 | Schwarzes Loch | elemental | 75 | 72 | 43 px | 4 | 80 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 78 | Voodoo-Puppe | elemental | 45 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 79 | Kosmisches Portal | elemental | 20 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 80 | Psionischer Tentakel | elemental | 44 | 52 | 31 px | 3 | 60 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 81 | Zauberbuch der Leere | magic | 55 | 48 | 29 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 82 | Goldene Zauberrolle | magic | 44 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 83 | Goldene Hand | magic | 50 | — | 4 px | 1 | 70 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 84 | Astraltrank | magic | 34 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 85 | Chaosmagier | magic | 45 | 45 | 27 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 86 | Wirbelwind-Krieger | magic | 42 | 46 | 28 px | 3 | 78 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 87 | Dimensionssprung | magic | — | — | 4 px | 1 | — | — | — |
| 88 | Dimensionsriss | magic | — | — | 4 px | 1 | — | — | — |
| 89 | Magischer Stiefel | magic | 36 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 90 | Giftpilz | magic | 18 | 38 | 23 px | 3 | — | Gift 50 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 91 | Astralorb | magic | 58 | 55 | 33 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 92 | Heilzauber | magic | 35 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 93 | Engelssegen | magic | 30 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 94 | Heil-Injektion | magic | 39 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 95 | Chaos-Elixier | magic | 34 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 96 | Mutationselixier | magic | 29 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 97 | Traumfänger | magic | 38 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 98 | Lava-Elixier | magic | 50 | 50 | 30 px | 3 | — | Feuer 45 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 99 | Zeit-Sanduhr | magic | 28 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 100 | Würfel des Chaos | magic | 36 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 101 | Eisschild | magic | 32 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 102 | Gedankensturm | magic | 52 | 60 | 36 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 103 | Verderbnis-Kelch | magic | 30 | 48 | 29 px | 3 | — | Gift 30 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 104 | Quantengewehr | magic | 62 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 105 | Zauberrolle | magic | 48 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 106 | Sonnenamulett | magic | 38 | 40 | 24 px | 3 | — | Feuer 25 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 107 | Allsehendes Auge | magic | 29 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 108 | Magische Peitsche | magic | 32 | — | 4 px | 1 | 55 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 109 | Weltenbaum | magic | 33 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 110 | Dimensionskugel | magic | 28 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 111 | Grappling Hook | utility | — | — | 4 px | 1 | — | — | — |
| 112 | Jetpack | utility | — | — | 4 px | 1 | — | — | — |
| 113 | Bohrkanone | utility | 30 | — | 85 px | 5 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 114 | Gleitschirm | utility | — | — | 4 px | 1 | — | — | — |
| 115 | Wächterstatue | utility | 28 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 116 | Blutritual | utility | 50 | 55 | 33 px | 3 | — | Gift 35 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 117 | Ananasbombe | utility | 48 | 45 | 27 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 118 | Feuerwesen | utility | 52 | 42 | 25 px | 3 | — | Feuer 40 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 119 | Munitionskiste | utility | — | — | 4 px | 1 | — | — | — |
| 120 | Energiefaust | utility | 55 | — | 4 px | 1 | 78 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 121 | Explosiver Punch | tech | 58 | 35 | 21 px | 3 | 88 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 122 | Infinity Loop | tech | 32 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 123 | Magnetkanone | tech | 40 | 45 | 27 px | 3 | 95 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 124 | Auto-Turret | tech | 38 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 125 | Versorgungscontainer | tech | 31 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 126 | Bunker | tech | 27 | — | 20 px | 3 | — | — | Figur (direkt), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar) |
| 127 | Teleport-Plattform | tech | 34 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 128 | Hologramm-Portal | tech | 30 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 129 | Tesla-Turm | tech | 48 | 52 | 31 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 130 | Tarnnetz | tech | 33 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 131 | Schlauchboot | tech | 29 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 132 | Alte Dame | tech | 55 | 30 | 18 px | 2 | 82 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 133 | Fliegendes Superschaf | tech | 60 | 40 | 24 px | 3 | — | Feuer 25 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Ziel (suchend), Zustand (Element) |
| 134 | Luftangriff | tech | 62 | 65 | 39 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 135 | Meteorregen | tech | 68 | 55 | 33 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 136 | Bohrkopfrakete | tech | 64 | 48 | 65 px | 4 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 137 | Flammenklinge | tech | 55 | — | 4 px | 1 | 55 | Feuer 30 | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß), Zustand (Element) |
| 138 | Magischer Kriegshammer | tech | 68 | 45 | 27 px | 3 | 78 | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Stellung (Rückstoß) |
| 139 | Höllenkanone | tech | 78 | 58 | 35 px | 3 | — | Feuer 48 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 140 | Quantenblaster | tech | 72 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar), Figur (Durchschlag 1×) |
| 141 | Astralkrieger | ultimate | 70 | 55 | 33 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 142 | Void-Ritter | ultimate | 82 | — | 4 px | 1 | 75 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 143 | Astralross | ultimate | 65 | — | 4 px | 1 | 70 | — | Figur (direkt), Kisten (zerstörbar), Stellung (Rückstoß) |
| 144 | Kosmische Wassermelone | ultimate | 85 | 70 | 42 px | 4 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 145 | Erdspalter | ultimate | 95 | 75 | 95 px | 5 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 146 | Giftige Weltenflasche | ultimate | 55 | 65 | 39 px | 3 | — | Gift 80 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 147 | Welten-Drache | ultimate | 100 | 80 | 48 px | 4 | — | Feuer 75 | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze), Zustand (Element) |
| 148 | Himmelswächter | ultimate | 70 | 60 | 36 px | 3 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |
| 149 | Goldene Reliktkugel | ultimate | 78 | — | 4 px | 1 | — | — | Figur (direkt), Kisten (zerstörbar) |
| 150 | Kosmischer Kern | ultimate | 110 | 90 | 90 px | 5 | — | — | Figur (direkt), Figuren (Fläche), Terrain (Krater), Wasser (verdrängt), Kisten (zerstörbar), NPCs (Günther, Geschütze) |

## 5. Zustands-Effekte (Elementarschaden)

Elementarschaden wird in `src/engine/specials.js` in Zustände übersetzt:
Feuer und Gift als Schaden über Zeit, Eis als Einfrieren. Die Dauer wächst
mit der Summe der Elementpunkte.

**Feuer** (13): Welten-Drache 75, Höllenkanone 48, Flammenwerfer 45, Lava-Elixier 45, Feuerwesen 40, Feuerdämon 38, Phönix-Angriff 35, Molotowcocktail 32, … (5 weitere)

**Eis** (2): Eisschlag 50, Eispickel 25

**Gift** (9): Giftige Weltenflasche 80, Tentakelgift 55, Giftpilz 50, Giftwolke 45, Blutritual 35, Verderbnis-Kelch 30, Säurekanone 28, Verderbnis-Siegel 20, … (1 weitere)

## 6. Woher die Zahlen kommen

| Größe | Quelle |
|---|---|
| Schaden, Radius, Rückstoß, Elemente, Durchschlag, Zielsuche | `src/shared/config/weapons.js` (erzeugt aus `project_armageddon_weapons_v1.json`) |
| Kraterradius | `src/engine/systems/projectileSystem.js`, `#explode` — hier nachgebildet und im Test verglichen |
| Flächenwirkung auf Figuren | Falloff `max(0,25, 1 − Abstand/Radius)` je Figur im Radius |
| Wasser | `water.displace(x, y, craterRadius, 0,65)` bei jedem Krater |
| Kisten und NPCs | Sie tragen `Position`+`Health` und werden vom Flächenschaden mitgetroffen |
| Terrain-Kennzahlen | `generateTerrain` mit Seed 4242, 640×360 — dieselbe Vorgabe für alle Arten |

*Felder ohne Wirkung sind der Fehler, den `npm run check:effects` sucht:
Bis 2026-09-20 trugen 6 Waffen `piercing` und 2 `homing`, ohne dass ein Stück
Motorcode sie las — die Übersicht hätte damals Wirkungen ausgewiesen, die es
nicht gab.*

