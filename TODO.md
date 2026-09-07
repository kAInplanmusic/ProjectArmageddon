# Project Armageddon – Master TODO List

This document contains a hierarchical list of all tasks required to complete the game, grouped by priority and development phase.  It is intended to serve as a single source of truth for the remaining work.

---

## ✅ Completed (Priority 1 & 2)

- **ComponentStore** – cleaned duplicate flags, added `HEALTH`, `DAMAGE`, `CLASS` component arrays and setter methods.
- **Deterministic PRNG** – `src/shared/prng.js`.
- **Headless simulation** – `src/engine/headless.js` (runs a deterministic ECS simulation).
- **DamageSystem** – applies projectile‑terrain collisions, reduces health, deactivates dead entities.
- **TurnSystem** – manages player turn order, timer, getters for `currentPlayer` and `elapsedTime`.
- **Multiplayer server** – HTTP → WebSocket, deterministic 60 Hz tick loop, JSON protocol, lag‑compensation buffer.
- **Client handshake** – minimal Vite client that connects to the server and interpolates snapshots.
- **Terrain pipeline** – `CollisionMask.fromBitmap`, `terrainLoader.js`, `terrainSync.js`.
- **CI workflow** – GitHub Actions runs `npm ci`, `npm test`, lint, and builds.
- **Tests** – Vitest suite covering PRNG, ComponentStore, headless simulation, terrain loader, and server synchronization.

---

## 📋 Priority 3 – Match Rules (Turn System, Damage Pipeline, Class Modifiers)

| # | Task | Files | Description |
|---|------|-------|-------------|
| 3.1 | **Refine TurnSystem** – expose `currentPlayer`, `elapsedTime`, make turn duration configurable via constructor. | `src/engine/systems/turnSystem.js` | Already added getters; ensure UI can read them. |
| 3.2 | **DamagePipeline** – improve `DamageSystem` to handle health‑to‑death transition, emit a `DEAD` event, and optionally spawn death effects. | `src/engine/systems/damageSystem.js` | Add event emission and cleanup. |
| 3.3 | **Class Modifiers** – create a mapping of class IDs to gameplay modifiers (drag, mass, power multipliers) and apply them when a player fires a projectile. | `src/engine/classes.js`, modify `src/engine/headless.js` and `src/server/runtime.js` | Use `CLASS_DEFINITIONS` to adjust projectile parameters. |
| 3.4 | **Turn‑Timer UI** – display countdown for the current turn and highlight the active player. | `src/client/ui.js` (new) | Hook into `TurnSystem` getters. |
| 3.5 | **Tests** – unit tests for turn rotation, damage application, and class‑modifier effects; integration test that runs several turns and verifies health changes. | `test/turnSystem.test.js`, `test/damageSystem.test.js` | Ensure deterministic behavior. |
| 3.6 | **Optimisations** – short‑circuit `World.step` when no active entities, cache component flag masks, memoise class look‑ups. | `src/engine/ecs/world.js`, `src/engine/systems/*.js` | Minor performance tweaks. |

---

## 📋 Priority 4 – Multiplayer Enhancements

| # | Task | Files | Description |
|---|------|-------|-------------|
| 4.1 | **Matchmaking / Lobby** – simple in‑memory lobby that groups up to N players. | `src/server/lobby.js` (new) | `POST /api/lobby/create` returns a lobby ID; clients join via `JOIN` with lobby ID. |
| 4.2 | **Bot AI** – basic state‑machine bot that selects a random angle/power each turn and fires. | `src/server/aiBot.js` (new) | Insert bots when lobby slots are empty. |
| 4.3 | **Lag‑Compensation Tuning** – configurable buffer size, record latency statistics per tick. | `src/server/lagCompensation.js` (already present) | Add config and logging. |
| 4.4 | **WebSocket Reconnect** – client automatically attempts exponential back‑off reconnect and re‑sends `JOIN`. | `src/client/main.js` (update) | Improve resilience. |
| 4.5 | **Tests** – mock clients with artificial network delay to verify lag‑compensation works. | `test/serverLag.test.js` (new) | End‑to‑end validation. |

---

## 📋 Priority 5 – Water Simulation & Physics Integration

| # | Task | Files | Description |
|---|------|-------|-------------|
| 5.1 | **Cellular‑Automata Water** – 2‑D grid, simple smoothing rule, integrated into the tick loop. | `src/engine/water/waterSimulation.js` (new) | Each tick spreads water to neighbours. |
| 5.2 | **Water‑Terrain Interaction** – crater reduces water height; high water can raise terrain bits (flood). | `src/engine/water/waterTerrainSync.js` (new) | Sync water with `CollisionMask`. |
| 5.3 | **Render Water** – visualise water grid as semi‑transparent overlay (Canvas 2D for now). | `src/client/waterRenderer.js` (new) | Simple color‑coded cells. |
| 5.4 | **Tests** – verify water spreads correctly and interacts with terrain. | `test/waterSimulation.test.js` (new) | Unit tests for water dynamics. |

---

## 📋 Priority 6 – Loot System & Inventory UI

| # | Task | Files | Description |
|---|------|-------|-------------|
| 6.1 | **LootSpawner** – periodically spawn crates with rarity (common/rare/epic) using PRNG. | `src/server/lootSpawner.js` (new) | Configurable spawn interval. |
| 6.2 | **Crate Component** – add `crateType`, `crateX`, `crateY` arrays to `ComponentStore`. | Extend `ComponentStore` (new arrays) | Store crate state. |
| 6.3 | **Pickup Handling** – detect projectile‑crate collisions, remove crate, add item to player’s inventory component. | Modify `src/server/runtime.js` and `DamageSystem` | Update inventory. |
| 6.4 | **Inventory UI** – overlay showing icons for collected items, colour‑coded by rarity. | `src/client/inventory.js` (new) | Simple grid display. |
| 6.5 | **Tests** – verify crate spawning distribution, pickup removal, inventory updates. | `test/lootSpawner.test.js` (new) | Validate loot mechanics. |

---

## 📋 Priority 7 – Asset Pipeline (ZIP → Sprite‑Sheet)

| # | Task | Files | Description |
|---|------|-------|-------------|
| 7.1 | **Extract assets** – read `wagfen.zip`, parse `wagfen.json`, extract images. | `scripts/extractAssets.js` (new) | Use `adm-zip` or `unzipper`. |
| 7.2 | **Scale images** – resize each weapon image to a uniform sprite size (e.g., 64 × 64). | `scripts/scaleImages.js` (new) | Use `sharp`. |
| 7.3 | **Generate sprite‑sheet** – concatenate scaled images into a single PNG and produce a JSON mapping of frames. | `scripts/generateSpritesheet.js` (new) | Output `assets/sprites.png` + `assets/sprites.json`. |
| 7.4 | **Load sprite‑sheet in client** – utility to draw the correct weapon sprite for each projectile. | `src/client/weaponRenderer.js` (new) | Reads `sprites.json` for UV coordinates. |
| 7.5 | **Add new weapon types** – for each entry in `wagfen.json`, create a factory that sets projectile parameters and sprite index. | `src/engine/weapons/*.js` (new) | Use class modifiers where appropriate. |
| 7.6 | **Tests** – verify that the generated JSON correctly maps each weapon name to the expected frame coordinates. | `test/assetPipeline.test.js` (new) | Ensure integrity of sprite‑sheet. |

---

## 📋 Priority 8 – Advanced Graphics (WebGPU Shaders)

| # | Task | Files | Description |
|---|------|-------|-------------|
| 8.1 | **WebGPU init wrapper** – detect WebGPU support, create device & context, fallback to Canvas2D. | `src/client/webgpu.js` (new) |
| 8.2 | **Terrain shader** – render `CollisionMask` as a height‑field with crater deformation. | `src/client/shaders/terrain.wgsl` (new) |
| 8.3 | **Projectile shader** – draw textured quads using the sprite‑sheet UVs. | `src/client/shaders/projectile.wgsl` (new) |
| 8.4 | **Water shader** – render water grid with ripple effect. | `src/client/shaders/water.wgsl` (new) |
| 8.5 | **Integration** – update the main render loop to use WebGPU when available, otherwise fall back. | `src/client/main.js` (update) |
| 8.6 | **Tests** – manual visual verification (no automated test for shaders). |

---

## 📋 Priority 9 – End‑Game Logic (Mahlstrom)

| # | Task | Files | Description |
|---|------|-------|-------------|
| 9.1 | **MahlstromSystem** – starts at round 15, contracts a safe‑zone circle, applies damage outside the zone, triggers Sudden Death. | `src/engine/systems/mahlstromSystem.js` (new) |
| 9.2 | **Sudden‑Death UI** – overlay showing timer and “Game Over” when all players die. | `src/client/suddenDeath.js` (new) |
| 9.3 | **Tests** – ensure zone contracts correctly and damage is applied after round 15. | `test/mahlstrom.test.js` (new) |

---

## 📋 Priority 10 – Vertical Slice & Polish

| # | Task | Files | Description |
|---|------|-------|-------------|
| 10.1 | **Assemble map & three classes** – provide a sample terrain bitmap and class definitions (`Scout`, `Heavy`, `Artillery`). | `src/client/maps/*.json` (new) |
| 10.2 | **Full UI flow** – main menu → lobby → match → HUD (health, ammo, timer) → end screen. | `src/client/ui.js` (extend) |
| 10.3 | **Performance profiling** – run headless simulation for 5 min, record CPU/memory, ensure average frame time < 16 ms. | `scripts/profile.js` (new) |
| 10.4 | **Documentation** – update `README.md` with full install/run guide, architecture diagram, and feature summary. |

---

## 📦 How to Use This TODO List

1. **Pick the next priority** (e.g., Priority 3) and work through the tasks in order.
2. **Commit after each logical batch** (e.g., finish TurnSystem, run tests, push).
3. **Run `npm test`** to ensure the test suite stays green.
4. **Check CI** after each push – the workflow will verify build, lint, and tests.
5. **Update this file** as tasks are completed (move them to the ✅ Completed section).

---

*Happy coding!  When you’re ready for the next set of tasks, just let me know which batch you’d like to start with.*
