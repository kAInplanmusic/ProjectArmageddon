# ProjectArmageddon — Master TODO / Codeaudit

Stand: 2026-09-10
Branch: `main`
Auditbasis: lokaler Arbeitsstand vor Commit

## Auditstatus

- ECS-/PRNG-/Seed-/Loot-Grundlagen vorhanden und durch Node-Tests verifiziert.
- Headless-Runtime vorhanden: Fixed-Timestep, Match-Seed, Spielerregistrierung, Input-Queue.
- Terrain-Bitmap-Loader und CollisionMask vorhanden.
- CCD-Raycast gegen Tunneling durch segmentweises Sampling abgesichert.
- World-Snapshots enthalten Entities, Komponenten, Signaturen und Turn-State.
- Death-Handling emittiert einmalig, entfernt tote Entities und verwendet deterministische Simulationsticks.
- Browser-E2E-Struktur angelegt, aber bewusst blockiert: Es gibt derzeit weder `index.html` noch Vite/Webserver noch einen vollständigen Client-Main-Loop.

## P0 — Vor Multiplayer / Release

- [ ] Browser-Entrypoint implementieren: `index.html`, Canvas, Client-Bootstrap und `requestAnimationFrame`-Loop.
- [ ] Vite- oder gleichwertigen Dev-/Build-Server einführen und `npm run dev`/`npm run build` definieren.
- [ ] Playwright-Smoke-Test aktivieren: `tests/e2e/runtime-smoke.spec.mjs` darf erst nach vorhandenem Browser-Entry von `skip` auf aktiv wechseln.
- [ ] Vollständigen World-State-Deserialize implementieren. Aktuell serialisiert `World` deutlich mehr Daten als `deserialize()` wiederherstellt.
- [ ] Runtime-Input tatsächlich in Fire-/Projectile-Aktionen umsetzen. `HeadlessRuntime` schreibt derzeit nur `Input`-Komponenten.
- [ ] Input-Validierung serverseitig gegen `NETWORK_RULES` erzwingen: Winkel-/Kraftbereiche, Spielerberechtigung, Tick-Fenster und Replay-Schutz.
- [ ] `createServerRuntime()` mit vollständigem Match-/Player-State statt nur World-Hülle betreiben.

## P1 — Terrain, Ballistik und Kampfsystem

- [ ] AABB-Broadphase und CollisionMask-Narrowphase als eigenes Kollisionssystem in die ECS-Physik integrieren.
- [ ] CCD nicht nur als Utility, sondern im Projectile-Updatepfad verwenden.
- [ ] Hitscan-Pipeline getrennt vom Projektilpfad implementieren.
- [ ] Wind-Konfiguration und deterministische Wind-Simulation ergänzen.
- [ ] TerrainSync um echte Dirty-Region-Übertragung und Canvas-Rebuild ergänzen; aktuell wird primär Dirty-State quittiert.
- [ ] Klassenmodifikatoren in einen echten Fire-Flow integrieren.
- [ ] Fallschaden, Knockback, Wasser-/Klippeninteraktion und Spezialwaffenregeln implementieren.
- [ ] Damage-Events als typisierte Match-Events statt nur privater Killfeed-Liste exportieren.
- [ ] Death-Cleanup um Projektil-/Loot-/Team-Referenzen erweitern.

## P1 — Multiplayer / Server

- [ ] `ws`-basierter autoritativer WebSocket-Server.
- [ ] Versioniertes binäres Protokoll für Join, Leave, Input, Snapshot, Delta und Events.
- [ ] Lobby-API mit `POST /api/lobby/create` und Join-/Match-Status.
- [ ] Snapshot-History für mindestens 200 ms Lag Compensation.
- [ ] Client-Handshake, Seed-Verteilung und Snapshot-Interpolation.
- [ ] Reconnect mit exponentiellem Backoff und Session-Recovery.
- [ ] Mock-Client-Tests mit künstlicher Verzögerung und Desync-Prüfung.
- [ ] Bot-AI für volle Lobbys.

## P2 — Match Rules und Gameplay

- [ ] Turn-System mit aktiver Spieler-/Entity-Berechtigung verknüpfen.
- [ ] Mehrturn-Integrationstest mit Health-, Death- und Turn-Wechseln.
- [ ] Vollständiger Loot-Spawner mit Kistenkomponenten, Rarity, Pickup und Inventar-Updates.
- [ ] Sidegrades und Anti-Clumping-Telemetrie integrieren.
- [ ] Wasser-CA mit Terrain-Interaktion, Krater-/Flutlogik und Rendering.
- [ ] Mahlstrom-System ab Runde 15, Safe-Zone, toxischer Regen, Terrain-Kompression und UI.
- [ ] Draft-Flow für 4–6 Einheiten und Archetypen im Gameplay-Datenmodell.

## P2 — Client / UX

- [ ] Hauptmenü → Lobby → Match → HUD → End-Screen.
- [ ] Turn-Countdown und aktiven Spieler sichtbar markieren.
- [ ] Health-, Ammo-, Match- und Sudden-Death-Anzeigen.
- [ ] Rendering für Terrain, Projektile, Wasser, Krater und Effekte.
- [ ] Audio/VFX und Tooltips für Klassenfantasien.
- [ ] Accessibility- und Tastatursteuerungsprüfung.

## P3 — Tooling / Release

- [ ] GitHub-Actions-Workflow für `npm ci`, Unit-Tests, E2E, Lint und Build.
- [ ] Linting und Formatprüfung als reproduzierbare Scripts.
- [ ] Replay-/Debug-Tool mit Seed-Logging und Tick-by-Tick-Diff.
- [ ] Headless-5-Minuten-Performance-Test mit CPU-/Memory-Messung.
- [ ] Anti-Cheat-Audit für Input- und Server-Autorität.
- [ ] Asset-/Weapon-Mapping-Tests vervollständigen.
- [ ] README mit Install, Dev, Test, Build, Architektur und Serverstart aktualisieren.

## Verifizierte technische Risiken

- Browser-E2E ist nicht ausführbar, bis ein Browser-Entry und Devserver existieren.
- `World.deserialize()` ist noch kein vollständiger Replay-Restore.
- ComponentStore verwendet TypedArrays und serialisiert Werte, aber es gibt noch keine versionierte Snapshot-Schema-Migration.
- Der aktuelle Headless-Input setzt Komponenten, erzeugt aber noch keine Schuss-/Projectile-Events.
- Es gibt noch keinen WebSocket-Server und keine Lobby-/Matchmaking-Implementierung.
- `WaterSimulation` ist ein einfacher Spread-Step ohne Terrain-Kopplung, Druckmodell und Dirty-Chunk-Bake.
- `TerrainSync.syncToCanvas()` quittiert aktuell Dirty-State, statt Terrain-Daten aktiv in den Canvas zu übertragen.
- `initUI()` erzeugt noch keine DOM-UI-Elemente; `turnDisplay`, Health, Ammo und Endscreen bleiben leer.
- Release-CI, Lint und Build sind noch nicht eingerichtet.

## Qualitätsregeln

- Simulation bleibt strikt 2D und deterministisch.
- Keine `Math.random()`-Aufrufe im Simulationspfad.
- Keine Client-Autorität für physikrelevante Aktionen.
- Canvas-Terrain und CollisionMask müssen synchron aus demselben Ereignisstrom aktualisiert werden.
- Keine destruktiven Git- oder Dateisystemoperationen ohne explizite Bestandsprüfung.
