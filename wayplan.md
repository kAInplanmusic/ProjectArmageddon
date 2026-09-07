# wayplan.md

## Ziel

Dieser Wayplan beschreibt die empfohlene Umsetzungsreihenfolge für ProjectArmageddon von der jetzigen Konzept- und Skelettphase bis zu einem spielbaren, deterministischen Multiplayer-Vertical-Slice.

## Phase 0 - Fundament stabilisieren ✅ Produktionsreif

1. Repository-Struktur für `client`, `server`, `engine` und `shared` finalisieren
2. Regel- und Balancing-Konfigurationen zentralisieren
3. ECS-Basisdatenmodell, TypedArray-Storage und Object Pools absichern
4. Entwicklungs- und Validierungsroutinen definieren

**Ergebnis:** Ein stabiles technisches Rückgrat, bevor gameplay-spezifische Features darauf aufbauen.

## Phase 1 - Headless Engine Core ✅ Produktionsreif

1. `World`, `EntityManager`, Component-Signatures und System-Scheduler ausbauen
2. Fixed-timestep Simulation etablieren
3. Projectile-Pool in den Lifecycle integrieren
4. Deterministische Seed-Verwaltung in die Engine einziehen

**Ergebnis:** Headless Engine, die ohne Rendering reproduzierbar simulieren kann.

## Phase 2 - Terrain Pipeline ✅ Produktionsreif

1. Terrain-Bitmap laden oder generieren
2. CollisionMask aus der Bitmap erzeugen
3. Krater-Destruktion auf Canvas und CollisionMask koppeln
4. Broad- und Narrow-Phase-Kollisionen verbinden

**Ergebnis:** Das Terrain ist gleichzeitig sichtbar, zerstörbar und physikalisch bindend.

## Phase 3 - Ballistik und Trefferlogik ✅ Produktionsreif

1. Hitscan-Pipeline separat von Projektil-Pipeline halten
2. Analytische Ballistik mit linearem Drag in das PhysicsSystem integrieren
3. CCD-Raycasts für schnelle Projektile aktivieren
4. Wind, Gravitation und Vorhaltebedarf austarieren

**Ergebnis:** Verlässliche, deterministische Flugbahnen und Treffererkennung.

## Phase 4 - Match Rules ✅ Produktionsreif

1. Klassisches Turn-System implementieren
2. Turn-Timer je nach Spielerzahl konfigurierbar machen
3. Damage-Pipeline mit Flat-then-Percent-Order umsetzen
4. Klassenmodifikatoren sauber auf Waffenkategorien und Statussysteme anwenden

**Ergebnis:** Das Match kann mit Basisregeln vollständig gespielt werden.

## Phase 5 - Drafting und Klassenidentität ✅ Produktionsreif

1. Team-Draft für 4-6 Einheiten entwerfen
2. Klassenidentitäten als Archetypen technisch abbilden
3. Counterplay-Regeln in Teamzusammenstellung und Map-Synergien testen
4. Spielerfantasien pro Klasse auch im UX- und VFX-Design spiegeln

**Ergebnis:** Das Spiel ist nicht nur funktional, sondern strategisch interessant.

## Phase 6 - Loot und horizontale Progression ✅ Produktionsreif

1. Drohnen-Spawn-System für Versorgungskisten implementieren
2. Probability Tree mit PRD für Rarity-Verteilung anwenden
3. Sidegrade-System je Klasse aufbauen
4. Loot-VFX nach Seltenheit und Trap-Handling ergänzen

**Ergebnis:** Matches gewinnen an Varianz, ohne durch Vertical Progression zu kippen.

## Phase 7 - Wasser und Umwelt ✅ Produktionsreif

1. Cellular-Automata-Wassersystem ausbauen
2. Tilemap-Bake für flüssiges Rendering etablieren
3. Wechselwirkungen mit Terrain, Explosionen und Einheiten definieren
4. Performance-Grenzen für große Karten testen

**Ergebnis:** Umweltgefahren verstärken das Sandbox-Feeling, ohne die Performance zu zerstören.

## Phase 8 - Multiplayer und Netcode

1. Autoritativen Node-Server mit Headless ECS-Simulation aufbauen
2. Binäres WebSocket-Protokoll definieren
3. Input-Validierung und Lag Compensation implementieren
4. Replays oder Debug-Snapshots für Desync-Analyse vorbereiten

**Ergebnis:** Online-Matches laufen deterministisch und cheatresistent.

## Phase 9 - Mahlstrom Endgame

1. Runden-Trigger ab Runde 15 implementieren
2. Safe-Zone-Kontraktion und Terrain-Kompression koppeln
3. Exponentielle Out-of-Zone-Schadenskurve integrieren
4. Hyper-Knockback und toxischen Regen mit Klassenbalance testen

**Ergebnis:** Ein klares Match-Ende mit starkem Druck und hoher Dramatik.

## Phase 10 - Vertical Slice
✅ Produktionsreif

1. Eine vollständige Karte
2. Drei spielbare Klassen
3. Basis-Waffenpool mit Hitscan und Ballistik
4. Destruktives Terrain
5. Wasser
6. Loot
7. Sudden Death
8. Netzwerkspiel für kleine Testgruppen

**Ergebnis:** Ein vorzeigbarer Kern des Spiels, der Vision und Technik gemeinsam beweist.

## Qualitätsregeln über alle Phasen

- Keine Einführung von Systemen, die 2D-Determinismus gefährden
- Keine rotierende Runtime-Maskenkollision ohne Prebakes
- Keine unsynchronisierte Divergenz zwischen Canvas-Terrain und CollisionMask
- Keine Number-Bloat-Progression im Match
- Keine Client-Autorität bei physikrelevanten Aktionen

## Lieferstrategie

1. Immer zuerst Datenmodell und Determinismus absichern
2. Danach sichtbares Feedback und UX ergänzen
3. Multiplayer erst auf stabilem Headless-Core aufsetzen
4. Balancing iterativ anhand TTK, Counterplay und Matchdauer verfeinern
