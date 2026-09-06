# ProjectArmageddon

ProjectArmageddon ist ein rundenbasiertes 2D-Artillerie-Spiel für den Browser im Geiste von Worms und Frontschweine. Das Gameplay läuft strikt in 2D, während die Präsentation optional einen 2.5D-Look nutzen darf. Das Projekt setzt auf vollständig zerstörbares Terrain, harte Systemregeln für Determinismus im Multiplayer und ein datenorientiertes ECS für hohe Performance im Web.

## Produktvision

- **Genre:** Turn-based 2D artillery tactics
- **Plattform:** Web-App
- **Rendering:** HTML5 Canvas
- **Simulation:** Deterministische 2D-Physik
- **Multiplayer:** Authoritative Node.js server via binary WebSockets
- **Core fantasy:** Zerstörbares Terrain, präzise Ballistik, asymmetrisches Drafting, chaotisches Endgame

## Leitprinzipien

1. **Gameplay und Physik bleiben 2D.**
2. **Optik darf 2.5D sein, aber nie die Simulationsregeln verändern.**
3. **Der Server ist die Source of Truth.**
4. **Alle performancekritischen Systeme sind datenorientiert aufgebaut.**
5. **Terrain-Rendering und CollisionMask müssen immer synchron bleiben.**
6. **Balancing entsteht über Counterplay, Sidegrades und Rollenfantasien, nicht über Number Bloat.**

## Gameplay- und Systemregeln

### Klassenkern

Das Kernsystem basiert auf drei asymmetrischen Archetypen, aus denen Teams mit 4-6 Einheiten gedraftet werden:

- **Brawler / Tank**
  - +30% Nahkampf
  - +50% Knockback
  - -20% Fallschaden
  - +20% HP
  - -30% Fernkampf
  - -30% Magie
- **Artillerist**
  - +30% Fernkampf
  - +20% CounterDamage
  - +10% Fallschaden
  - -30% Magie
  - -10% bis -20% Nahkampf
- **Okkultist / Glaskanone**
  - +30% Magie / Spezialwaffen
  - +30% Statuseffekt-Effizienz
  - +10% Fallschaden
  - -30% Nahkampf
  - -30% Fernkampf
  - -20% HP

### Counterplay und Drafting

- Klassen-Schwächen müssen im Draft gezielt ausnutzbar sein.
- Mono-Class-Teams dürfen nie universell dominant sein.
- Offene Karten laden Artillerie ein, aber übercommitment auf Artilleristen muss Brawler-Counterplay erlauben.

### Spieler-Psychologie

- **Artillerist:** Mastery & Strategy
- **Brawler:** Action & Destruction
- **Okkultist:** Immersion & Creativity

### Waffenmodell

- **Hitscan-Waffen:** sofortiger Treffer, keine Flugzeit
- **Ballistische Projektile:** reagieren auf Wind, Gravitation und Drag; sie erfordern Vorhalten

### Match Flow

- Klassisches Worms-Zugsystem
- Richtwerte für Zugzeiten:
  - **1v1:** 30-60 Sekunden
  - **4 Spieler:** 20-40 Sekunden

### Mahlstrom / Sudden Death

- Startet als Hard-Limit für die Matchdauer
- Ab **Runde 15** beginnt die Kontraktion
- Toxischer Regen verursacht **15% Max-HP-Verlust pro Zug**
- Die tödliche Zone schrumpft von außen zur Mitte
- Knockback aller Waffen steigt im Endgame um **100%**
- Terrain wird pro Runde um **32px von außen nach innen** entfernt
- Schaden außerhalb der Safe Zone skaliert exponentiell

### Loot und Sidegrades

- Rundestart-Drops per Drohne:
  - 10% keine Kiste
  - 85% eine Kiste
  - 5% zwei Kisten
- Kisteninhalte:
  - 55% Waffen
  - 30% Heilung / Rüstung
  - 10% leer
  - 5% Sprengfalle
- Seltenheiten:
  - Standard
  - Verbessert
  - Premium
  - Episch
- Extrem seltene Gamechanger tauchen nur in 5-10% aller Spiele auf.
- Progression im Match erfolgt über **Sidegrades**, nicht über rohe Stat-Inflation.
- Loot-RNG nutzt **Probability Tree + PRD**, damit Fehlschläge die Chance auf bessere Folgedrops erhöhen.

## Engine-Architektur

### ECS

- Entitäten sind nur numerische IDs.
- Komponenten sind reine Datencontainer ohne Methoden.
- Systeme sind isoliert und zustandslos.
- Komponenten werden per **BigArray-per-ComponentType** in TypedArrays gespeichert.

### Komponentenbeispiele

- `PositionComponent`: `x`, `y`
- `VelocityComponent`: `vx`, `vy`
- `BallisticsComponent`: `dragCoefficient`, `mass`
- `ArtilleryStats`: `angle`, `power`, `spread`

### Object Pooling

- Projektil-Entitäten werden nicht gelöscht.
- Inaktive Projektile werden im Pool markiert und wiederverwendet.

## Terrain, Rendering und Kollision

### Destruktives Terrain

- Sichtbare Terrain-Zerstörung erfolgt via Canvas `globalCompositeOperation = 'destination-out'`.
- Explosionen radieren Krater direkt aus der Terrain-Bitmap.

### CollisionMask

- Physikalisches Terrain liegt in komprimierten `Uint32Array`-Bitmasken.
- 32 horizontale Pixel werden in ein 32-Bit-Integer gepackt.
- Nach jeder visuellen Terrain-Zerstörung muss die CollisionMask synchronisiert werden.
- Betroffene Bits werden mit bitweisem `AND NOT` genullt.

### Kollisionspipeline

1. **Broad Phase:** AABB-Selektion
2. **Narrow Phase:** pixelgenaue Bitmasken-Prüfung

### Constraints

- Runtime-Kollision ist für unrotierte, unskalierte Objekte ausgelegt.
- Rotierte oder skalierte Formen benötigen vorab berechnete Masken.
- JavaScript-Bitshifts mit `>= 32` müssen explizit abgefangen werden.

## Ballistik und Physik

- Projektile nutzen analytische Ballistik mit linearem Luftwiderstand.
- Das unterstützt deterministische Trajektorienvorhersagen für KI und Netcode.
- Schnelle Projektile verwenden Continuous Collision Detection per Raycast gegen die CollisionMask.

## Wasser- und Umweltlogik

- Wasser wird per Cellular Automata simuliert.
- Vertikaler Fluss priorisiert Fallbewegung.
- Horizontaler Fluss gleicht Druckdifferenzen aus.
- Rendering erfolgt via Tilemap-Bake, um CPU-Kosten niedrig zu halten.

## Networking

- Node.js authoritative server
- Headless ECS-Simulation auf dem Server
- Server validiert Winkel, Kraft und ähnliche Inputs
- Binär kodierte WebSocket-Pakete
- Identischer Zufalls-Seed für deterministische Prozesse
- 200ms State-History für Lag Compensation

## Schadensberechnung

Die Reihenfolge der Modifikatoren ist verbindlich:

1. **Flat Modifiers**
2. **Percentage Modifiers**

So bleibt das Kampfsystem konsistent, verständlich und deterministisch.

## Repository-Struktur

```text
src/
  client/
    index.js
    rendering/
  engine/
    ecs/
    physics/
    pooling/
    systems/
    terrain/
  server/
    index.js
  shared/
    config/
    index.js
README.md
wayplan.md
MASTERTODO.md
package.json
```

## Status dieses Repositories

Dieses Repository enthält aktuell:

- die initiale Produkt- und Technikdokumentation
- ein erstes Engine-/Client-/Server-Skelett
- zentrale Konfigurationsdateien für Regeln und Architektur

## Nächste Schritte

1. Basale Laufzeit für ECS-World und Match-Loop vervollständigen
2. Terrain-Import, CollisionMask-Generierung und Canvas-Destruktion verbinden
3. Server-Loop und binäres Protokoll konkretisieren
4. Drafting, Match-Flow und Maelstrom-System implementieren
5. Wasser-CA, Loot-PRD und Damage-Pipeline produktionsreif machen

## Entwicklung

### Voraussetzungen

- Node.js 20+
- npm 10+

### Befehle

```bash
npm install
npm run validate
```

`validate` lädt das Skeleton und prüft die wichtigsten Module auf grundlegende Korrektheit.
