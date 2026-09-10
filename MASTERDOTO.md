# ProjectArmageddon — Master TODO / Codeaudit

Stand: 2026-09-10 (nach Umsetzung des spielbaren Kerns)
Branch: `main`

Diese Datei ist die **Single Source of Truth** für offene Arbeit. Alles, was hier
als erledigt entfernt wurde, ist gegen den Code verifiziert — nicht gegen
Commit-Messages oder Behauptungen früherer Agenten.

## Verifikationsbasis

Aktuell automatisiert geprüft:

| Suite | Umfang | Ergebnis |
|---|---|---|
| `npm test` (Unit + Integration) | 70 Tests | grün |
| `npm run test:unit` | 36 Tests (PRNG, Seed, Loot) | grün |
| `npm run test:e2e` (echter Browser) | 12 Tests | grün |
| `npm run build` (Vite) | 140 kB / 30 kB gzip | grün |
| `npm run smoke` (Headless-Match) | Match bis `gameover` | grün |
| `npm run validate` | Modulimporte | grün |

Multiplayer ist mit **zwei echten Browserkontexten** gegen einen echten
Serverprozess getestet (`tests/e2e/multiplayer.spec.mjs`), nicht simuliert.

## Umgesetzt und verifiziert

### Spielbarer Kern
- `MatchController` verbindet Terrain, Wasser, ECS-Systeme, Runden-, Zug- und
  Sieglogik zu einem vollständigen Match. Wird lokal im Browser **und**
  headless auf dem Server identisch genutzt.
- `ProjectileSystem`: Gravitation, Wind, Drag, Continuous Collision Detection,
  Krater, Flächenschaden mit Distanzabfall, Knockback, Direktschaden ohne AoE.
- `CharacterSystem`: Gravitation, Terrain-Kollision, Reibung, Landung,
  Fallschaden, Wasserauftrieb.
- `DamageSystem`: Flat-vor-Prozent-Reihenfolge, einmalige Death-Events,
  Entity-Cleanup, deterministische Killfeed-Ticks (kein `Date.now()`).
- `MaelstromSystem`: Zonenkontraktion ab Runde 15, Terrain-Abtrag, toxischer Regen.
- `LootSystem` + `PlayerInventory`: deterministische Kisten aus dem Match-PRNG,
  Pickup, Waffen-/Heil-/Falleninhalte, Reservewaffe mit ∞-Munition gegen Softlocks.
- `WaterField`: Zelluläres Wasser mit vertikalem Vorrang und seitlichem
  Ausgleich; Massendrift < 0,2 % über 200 Schritte.
- `EventBus`: gepufferte, geordnete Ereignisse für Rendering/HUD/Netzwerk.

### Determinismus
- Mulberry32-PRNG, `MatchSeedManager` mit Offsets pro Subsystem.
- Vollständige `World.serialize()`/`deserialize()` inkl. Entities, Komponenten,
  Signaturen und Turn-State.
- `MATCH_BASE`-Zufall für Wind; identische Seeds ergeben identische Match-Hashes
  (im Browser-E2E verifiziert).

### Terrain
- `generateTerrain()` mit vier Presets (hügel/berge/inseln/höhlen),
  seed-deterministisch, Ränder solide.
- `CollisionMask` mit `shift >= 32`-Schutz, `fromBitmap`, `punchCrater`.
- `terrainMaskFromRows` für lesbare ASCII-Karten.

### Multiplayer & Server
- Autoritativer `GameServer` (HTTP + WebSocket) mit Tick-Schleife (60 Hz) und
  entkoppelter Snapshot-Rate (20 Hz).
- Binärprotokoll via `DataView` — läuft in Node **und** im Browser.
- `LobbyManager`: Plätze, Kapazität, Reconnect-Token, Prune-Fenster.
- `SnapshotHistory`: 200 ms Lag-Kompensation.
- `BotController`: deterministischer Ersatz für unbesetzte Plätze.
- Serverseitige `validateCommand()`: Spielerberechtigung, Winkel, Kraft,
  Tick-Fenster, Waffen-Whitelist.
- HTTP-API: `/healthz`, `/api/lobby`, `/api/lobby/:id`, `POST /api/lobby/create`.
- CORS für Dev-Betrieb; statische Auslieferung des Builds für Single-Origin-Produktion.

### Client
- Vite-Build, `index.html` mit HUD, Menü, Keymap, Endscreen.
- Renderer: Terrain-Ebene (Offscreen), Wasser, Kisten, Spieler mit Lebensbalken,
  Geschützrohr, gestrichelte Zielvorschau, Partikel, Mahlstrom-Zone.
- Eingabe: Maus-Zielen, Aufladen per Klick/Leertaste, Winkel/Kraft-Tasten, Waffenwahl.
- HUD: Runde, Wind, Zugzeit, Status, Netzstatus, Spielerliste, Waffenliste mit
  Munition, Ereignisprotokoll.
- Lokaler **und** Online-Modus; Snapshot-Interpolation; Reconnect mit Backoff;
  Terrain-Rekonstruktion aus dem Server-Seed.
- Debug-API `window.__PA__` für Tests und Automatisierung.

### Content
- Waffenkatalog-Generator aus `project_armageddon_weapons_v1.json` (150 Waffen).
  Wichtig: Die Quelle führt zwei Feldfamilien — die camelCase-Felder sind
  0-Platzhalter, die echten Werte stehen in snake_case. Der Generator wählt den
  ersten *positiven* Kandidaten und bricht ab, wenn der Katalog leer wäre.

### Infrastruktur
- `.gitignore` für `node_modules/`, `dist/`, `test-results/`, Coverage.
- Playwright-Konfiguration nutzt den System-Chrome (`channel: 'chrome'`) und
  startet den Dev-Server selbst.

## Offene Arbeit

### P1 — Vertiefung Gameplay
- [ ] Hitscan-Waffen visuell darstellen (Linie/Blitz statt reinem Sofortschaden).
- [ ] Explosionsradius-Vorschau im HUD bei Waffenwechsel.
- [ ] Windanzeige als Vektorpfeil im Spielfeld statt nur numerisch.
- [ ] Wasser-Terrain-Kopplung: Krater soll Wasser nachfließen lassen.
- [ ] Ertrinken und Verdrängung durch Explosionen.
- [ ] Munitionsanzeige beim Waffenwechsel aktualisieren (aktuell erst nach Zugwechsel).

### P1 — Netcode-Härtung
- [ ] Snapshot-Delta-Encoding statt Vollzustand pro Frame.
- [ ] Client-seitige Prädiktion des eigenen Schusses mit Server-Rollback.
- [ ] Server-autoritative Zeitmessung: Zugzeit läuft aktuell nur clientseitig.
- [ ] Sitzungs-Persistenz über Serverneustart.
- [ ] Lasttest mit 8+ gleichzeitigen Clients und künstlicher Latenz.

### P2 — Balance & Inhalt
- [ ] Balancing-Durchlauf: 150 Waffen sind ungeprüft; TTK und Matchdauer messen.
- [ ] Seltenheitsstufen `epic`/`legendary` im Katalog füllen (aktuell nur common/uncommon/rare).
- [ ] Draft-Flow für 4–6 Einheiten pro Team.
- [ ] Spielbare Beispielkarten aus ASCII/JSON im Menü wählbar.
- [ ] Waffen-Icons aus `assets/weapons/icons/` im HUD einbinden.

### P2 — Client & UX
- [ ] Lobby-Browser im Menü (offene Lobbys listen und beitreten).
- [ ] Latenz-Anzeige per Ping-Intervall statt nur bei manuellem Ping.
- [ ] Tastatursteuerung vollständig (derzeit keine Fokus-Reihenfolge).
- [ ] Accessibility: Kontraste, Fokusindikatoren, Screenreader-Labels.
- [ ] Optionale WebGPU-Pipeline mit Canvas-2D-Fallback.

### P3 — Tooling & Release
- [ ] CI-Workflow: `npm ci`, `npm test`, `npm run test:e2e`, `npm run build`.
- [ ] Linting/Formatierung als reproduzierbares Script.
- [ ] Replay-Tool: Seed loggen, Match tickweise aufzeichnen und abspielen.
- [ ] Headless-5-Minuten-Lauf mit CPU-/Memory-Profil.
- [ ] Asset-Pipeline-Tests für Waffen-Icon-Mapping.
- [ ] README mit Install-, Dev-, Test-, Build- und Serveranleitung aktualisieren.

## Bewusst dokumentierte Grenzen

- **Kein Audio** implementiert.
- **Keine Prädiktion**: bei hoher Latenz fühlt sich der eigene Schuss verzögert an.
- **Zugzeit ist clientseitig**: der Server erzwingt sie noch nicht.
- **Kein Persistenz-Layer**: Lobbys leben nur im Serverprozess.
- **150 Waffen sind unbalanciert** — die Werte stammen aus der Designdatei und
  wurden nicht gegeneinander getestet.
- **Snapshots sind Vollzustände**: bei sehr vielen Entities steigt die Bandbreite.

## Qualitätsregeln (verbindlich)

- Simulation bleibt strikt 2D und deterministisch.
- Kein `Math.random()` im Simulationspfad.
- Keine Client-Autorität für physikrelevante Aktionen.
- Keine rotierende Runtime-Maskenkollision ohne Prebakes.
- Canvas-Terrain und CollisionMask werden aus demselben Ereignisstrom geändert.
- Keine Number-Bloat-Progression im Match.
- Keine destruktiven Git-/Dateioperationen ohne Bestandsprüfung.
