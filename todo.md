# ProjectArmageddon — TODO (Single Source of Truth)

> **Stand:** 2026-09-08 — konsolidiert aus `wayplan.md`, `TODO.md` und `MASTERTODO.md`
> (alle drei ersetzt). Status **gegen Code verifiziert** auf `main` @ `0615d59`.
> Quellen-Referenzen: **[W]** = wayplan-Phase, **[T]** = alte TODO.md-Prio, **[M]** = alte MASTERTODO-Prio.
> Konvention: `- [ ]` = offen. Es gibt bewusst **keine** "erledigt"-Häkchen in den Aufgaben —
> erledigte Arbeit ist aus der Liste entfernt und im Basis-Block unten dokumentiert.

---

## ✅ Verifizierte Basis (bereits im Code vorhanden — nicht erneut planen)

- ECS-Kern: `ComponentStore` (TypedArrays, Signatur-Flags inkl. HEALTH/DAMAGE/CLASS), `EntityManager`, `World` mit `registerSystem` + Fixed-Timestep-`step()` [W0/1, M2]
- `ProjectilePool` (Objekt-Pool mit Inaktiv-Wiederverwendung) [W1]
- `TurnSystem`: konfigurierbare Turn-Dauer, `currentPlayer`/`elapsedTime`-Getter, Change-Listener [T3.1]
- `DamageSystem`: Schadensanwendung, Health ≤ 0 → deaktivieren, Dead-Listener + Death-Effect-Handler [T3.2, M6.2-teil]
- `PhysicsSystem` mit linearem Drag über `computeLinearDragPosition` (`ballistics.js`, `ballisticsWasm.js`) [W3.2, M4.2-teil]
- Klassen-Modifier: `CLASS_DEFINITIONS` (Scout/Heavy/Artillery, drag/mass/power) + `applyClassModifiers`; Archetypen `CLASS_ARCHETYPES` (Brawler/Artillerist/Okkultist mit Prozent-Modifiern) [W4.4, M6.2-teil]
- Zentralisierte Regel-Configs: `combat.js` (Damage-Reihenfolge flat→percent), `loot.js` (Drop-Rules + PRD-Helfer `getRareChanceWithPrd`), `match.js` (Turn-Timer, Sudden-Death-/Mahlstrom-Parameter + `computeMaelstromDamage`), `network.js`, `rules.js` (`GAME_RULES`) [W0.2, M1.2]
- `CollisionMask`: Bitmask mit `shift >= 32`-Schutz, word-weise Speicherung [W2, M3.3-teil]
- `terrainSync.js`, Client-Rendering `punchCrater` (Canvas) [W2.3-teil]
- `WaterSimulation`-Klasse (Float32-Grid, einfacher Spread-Step) [T5.1-teil, M10-teil]
- `init.js`: `createGameWorld` verdrahtet TurnSystem/DamageSystem/UI + externe WeaponEngine/TerrainEngine über Adapter-System [W4]
- Externe Engines als Pakete integriert: `terrain_engine/`, `weapon_engine/` (TS-Quelle + dist), Wrapper re-exportieren aus dist [W2/3]
- Waffen-Basis: `project_armageddon_weapons_v1.json` + Index-CSV/Readme, Icons (`assets/weapons/icons/`, `src/client/assets/icons/` + `weaponIcons.json`), Skripte (`build_weapon_metadata`, `create_weapon_icons/aim/placeholder_sheets`) [T7-teil]
- Client-/Server-Runtime-Skelett: `createClientRuntime()`, `createServerRuntime()` (nur World + PhysicsSystem registriert) [W0.4-teil]
- UI-Grundgerüst: `initUI`, `updateTurnInfo`, `showEntityDeath` [T3.4-teil]

---

## Offene Arbeit

### 1. Deterministische Simulation (PRNG & Seeds) — Fundament

- [ ] Deterministischen PRNG implementieren (`src/shared/prng.js`): seedbar, mulberry32/xorshift-Klasse, keine `Math.random`-Nutzung im Simulationspfad [W1.4, M5.3, T-Completed-Behauptung war falsch]
- [ ] Seed-Verwaltung: Match-Seed aus Server erzeugen, an Clients verteilen, in Engine injizieren
- [ ] PRNG in Loot-/Drop-System einklinken (`loot.js` PRD-Helfer auf echten PRNG umstellen statt `Math.random`)
- [ ] Unit-Tests: gleicher Seed → identische Sequenz; verschiedene Seeds → verschiedene Sequenzen

### 2. Headless-Simulation & Server-Runtime

- [ ] Echte Headless-Loop (`src/engine/headless.js` oder `src/server/runtime.js`): ECS-Simulation ohne Rendering, Fixed-Timestep-Tick (60 Hz), Match-State-Verwaltung [W8.1, M5.1]
- [ ] `createServerRuntime()` ausbauen: Spieler-/Entity-Registrierung, Input-Queue, Turn-/Runden-Fortschritt
- [ ] Deterministische Wiederholbarkeit: gleiche Input-Sequenz → gleicher Match-Zustand (Test!)

### 3. Multiplayer & Netcode

- [ ] WebSocket-Server (`ws`-Dependency) mit autoritativem Node-Server [W8.1, T4, M5]
- [ ] Binär-Protokoll implementieren: Join/Leave, Snapshot, Delta, Input Command, Event Broadcast [W8.2, M5.2]
- [ ] Lag Compensation: State-History-Puffer (~200 ms, Config existiert in `network.js`) [W8.3, M5.3, T4.3]
- [ ] Input-Validierung serverseitig (Winkel/Kraft, `clientValidatedInputs` aus `network.js`) [W8.3]
- [ ] Client-Handshake + Snapshot-Interpolation im Client [T-Completed-Behauptung war falsch]
- [ ] Lobby/Matchmaking: in-memory Lobby, `POST /api/lobby/create`, JOIN mit Lobby-ID [T4.1]
- [ ] Bot-AI (State-Machine: Winkel/Kraft wählen, feuern) für volle Lobbys [T4.2]
- [ ] WebSocket-Reconnect mit exponentiellem Backoff im Client [T4.4]
- [ ] Tests: Mock-Clients mit künstlicher Netzwerk-Verzögerung, Desync-/Lag-Verifikation [T4.5]

### 4. Terrain & Kollision vervollständigen

- [ ] `CollisionMask.fromBitmap` implementieren (Bitmap → Maske) [W2.1, M3.1, T-Completed-Behauptung war falsch]
- [ ] Terrain-Loader (`terrainLoader.js`): Startterrain laden (Bitmap/JSON), Wortbreiten/Randfälle testen [M3.1]
- [ ] Krater-Destruktion an CollisionMask koppeln (Rendering + Physik synchron, Dirty-Regionen) [W2.3, M3.2]
- [ ] Kollisionspipeline: AABB-Broadphase + Bitmask-Narrowphase verbinden [W2.4, M3.3]
- [ ] Tests: Blockgrenzen, dünne Geometrie, `shift >= 32`-Edge-Case

### 5. Ballistik & Trefferlogik verfeinern

- [ ] Hitscan-Pipeline getrennt von Projektil-Pipeline (eigener Pfad, eigenes Balancing) [W3.1, M4.1]
- [ ] CCD-Raycasts gegen CollisionMask aktivieren (Tunneling-Schutz, `projectileCollisionMode: 'ccd-raycast'` aus `network.js` einlösen) [W3.3, M4.3]
- [ ] Wind-System (Config + Simulation) [W3.4]
- [ ] Gravitation/Vorhaltebedarf austarieren, Tests für deterministische Flugbahnen

### 6. Match Rules & UI

- [ ] Turn-Timer-UI: Countdown-Anzeige, aktiven Spieler hervorheben (UI-Grundgerüst erweitern) [T3.4]
- [ ] Turn-Timer je Spielerzahl aus `match.js`-Config verdrahten (duel/fourPlayer-Sekunden) [W4.2, M6.1]
- [ ] Damage-Pipeline vollständig: `DEAD`-Event emittieren, Death-Effekte, Cleanup [T3.2]
- [ ] Klassenmodifikatoren beim Feuern anwenden (Fire-Flow → `applyClassModifiers`) [T3.3, M6.2]
- [ ] Fallschaden + Knockback (Klassenboni, Wasser/Klippen, Hyper-Knockback-Mahlstrom-Kompatibilität) [M6.3]
- [ ] Integrationstest: mehrere Turns simulieren, Health-Änderungen verifizieren [T3.5]
- [ ] Optimierungen: `World.step`-Short-Circuit ohne aktive Entities, Flag-Masken cachen, Klassen-Lookups memoïsieren [T3.6]

### 7. Klassen, Drafting & Identität

- [ ] Draft-Flow: Team-Draft für 4–6 Einheiten, Teamgrößen aus `match.js` [W5.1, M7.2]
- [ ] Archetypen vollständig ins Datenmodell überführen (Brawler/Artillerist/Okkultist in Gameplay überführen, nicht nur Config) [W5.2, M7.1]
- [ ] Counterplay-Regeln in Teamzusammenstellung + Map-Synergien testen [W5.3]
- [ ] Klassenfantasie sichtbar machen: UI, Audio/VFX, Waffenempfehlungen, Tooltips/Tutorials [W5.4, M7.3]
- [ ] 3×3-Klassensystem → 9 Fraktions-Ausprägungen (Werte von Fraktions-Flair trennen) [M11.3]

### 8. Loot & Sidegrades

- [ ] Loot-Spawner: Kisten mit Seltenheit (standard/enhanced/premium/epic) spawnen, PRNG-basiert [T6.1, M8.1]
- [ ] Crate-Component im `ComponentStore` (crateType/crateX/crateY) [T6.2]
- [ ] Pickup-Handling: Projektil-Kiste-Kollision, Kiste entfernen, Inventar aktualisieren [T6.3]
- [ ] PRD-Rarity-Tree vollständig: Anti-Clumping-Zustand pro Match, Telemetrie [M8.2]
- [ ] Klassen-Sidegrades: Trade-offs statt Power Creep, Kombinationen begrenzen, aktive Modifikatoren anzeigen [M8.3]
- [ ] Inventory-UI: Rarity-farbige Icons [T6.4]
- [ ] Loot-VFX nach Seltenheit + Trap-Handling [W6.4]
- [ ] Tests: Spawn-Verteilung, Pickup-Removal, Inventar-Updates [T6.5]

### 9. Wasser & Umwelt

- [ ] Cellular-Automata-Wasser in die Engine ziehen (Tick-Loop, Druckmodell, seitlicher Ausgleich) [W7.1, M10.1, T5.1]
- [ ] Wasser-Terrain-Interaktion: Krater senkt Wasserstand, Flut kann Terrain anheben; Sync mit CollisionMask [T5.2, M10.3]
- [ ] Wasser rendern (semi-transparentes Overlay) [T5.3]
- [ ] Gameplay-Interaktionen: Ertrinken, Leitfähigkeit/Spezialwaffen, Verdrängung durch Explosionen [M10.3]
- [ ] Performance: Tilemap-Bake, Dirty-Chunk-Updates, Grenzwerte für große Karten testen [W7.2/7.4, M10.2]
- [ ] Tests: Wasser-Spread + Terrain-Interaktion [T5.4]

### 10. Mahlstrom / Endgame

- [ ] `MahlstromSystem`: Start ab Runde 15, Safe-Zone-Kontraktion, Terrain-Kompression (Config in `match.js` vorhanden) [W9.1, M9.1, T9.1]
- [ ] Schaden außerhalb der Zone: exponentielle Kurve (`computeMaelstromDamage` einbinden) + toxischer Regen [W9.3, M9.2]
- [ ] Hyper-Knockback im Lategame mit Klassenbalance testen [W9.4, M9.2]
- [ ] Sudden-Death-UI: Timer + Game-Over-Overlay [T9.2]
- [ ] Vorwarnung/Zonenvisualisierung/Audio-Pacing + Matchlängen-Telemetrie [M9.3]
- [ ] Tests: Zonen-Kontraktion + Schaden nach Runde 15 [T9.3]

### 11. Client, Rendering & UI-Flow

- [ ] Vite-Setup + `index.html`; Client-Main-Loop (requestAnimationFrame → step → render) [T4.4/8.5, W0.4]
- [ ] Turn-/Match-Loop mit Server verbinden (Client-Runtime existiert nur als Skelett)
- [ ] Vollständiger UI-Flow: Hauptmenü → Lobby → Match → HUD (Health, Ammo, Timer) → End-Screen [T10.2]
- [ ] WebGPU-Pfad (optional): Init-Wrapper mit Canvas-2D-Fallback, Terrain-/Projektile-/Wasser-Shader [T8.1–8.6]
- [ ] Performance-Profiling: 5-Min-Headless-Lauf, CPU/Memory, Frame-Ziel < 16 ms [T10.3]

### 12. Content & Assets

- [ ] Beispiel-Karte (Terrain-Bitmap) + 3 Klassen (Scout/Heavy/Artillery spielbar machen) [T10.1]
- [ ] Waffen-Metadaten-JSON vollständig in Runtime-Waffenfabriken überführen (Sprite-Index, Parameter je Waffe) [T7.5]
- [ ] Karten-Authoring: offene/vertikale/Wasser-/Brawler-Karten [M11.2]
- [ ] Basis-Waffenpool strukturieren: Hitscan/Projektil/Magie, Gamechanger selten [M11.1]
- [ ] Asset-Pipeline-Tests: JSON-Mapping Name → Frame-Koordinaten [T7.6]

### 13. Tooling, Tests, CI & Release

- [ ] Test-Setup: Vitest als Dependency, `npm test`-Script (aktuell existiert **kein** Test-Framework) [T3.5-Basis, W0.4]
- [ ] Test-Suite nachziehen: PRNG, ComponentStore, Headless-Sim, Terrain-Loader, Turn-/Damage-System, Server-Sync [T-Completed-Behauptung war falsch]
- [ ] CI-Workflow (GitHub Actions): `npm ci`, `npm test`, Lint, Build — `.github/` existiert nicht [T-Completed-Behauptung war falsch]
- [ ] Debug-/Replay-Tools: Seed-Logging, CollisionMask-Visualisierung, Turn-by-turn-Replay [M12.1]
- [ ] Onboarding: Aim-Training, Klassenübersicht, Loot-/Sidegrade-Erklärung [M12.2]
- [ ] Release-Härtung: Lasttests, Anti-Cheat-Audit, Browser-Profiling, Accessibility [M12.3]
- [ ] README aktualisieren: Install-/Run-Guide, Architektur-Diagramm, Feature-Übersicht [T10.4]

---

## Qualitätsregeln (aus wayplan.md übernommen — niemals brechen)

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
