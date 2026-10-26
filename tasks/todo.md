# Aufgaben P1 — Materialoptik

Plan: `tasks/plan.md` · Entwurf: `docs/superpowers/specs/2026-10-26-gelaende-materialoptik-design.md`

## Phase 1 — Fundament (in Node prüfbar)

- [ ] T1 `packeStofffeld(karte)` — Stofffeld + Überlagerung als Texturvorlage
- [ ] T2 `erkenneWebGl2()` — Kontext oder `null` mit Grund
- [ ] T3 `STOFF_SHADER_GLSL` + `stoffFarben()`

**Checkpoint A:** `npm test` grün, jeder Baustein vorher rot gesehen.

## Phase 2 — Zeichnen und Einbau

- [ ] T4 `tinteStoffeGpu(...)` — hochladen, zeichnen, zurücklesen
- [ ] T5 Einbau in `baueGelaendeEbene` mit Rückfall, Kontext im Renderer

**Checkpoint B:** Browser ohne Konsolenfehler, `npm test`, `npm run checks` grün.

## Phase 3 — Abnahme

- [ ] T6 `scripts/gelaende-optik.mjs` — Screenshots, Autokorrelation, Materialzählung

**Checkpoint C:** Kachelmuster schwächer, ≥ 3 Materialien in 400×300, alle Gates grün,
Screenshots beim Auftraggeber.
