# AGENTS.md

## Project
ProjectArmageddon ist ein rundenbasiertes 2D-Artillerie-Taktikspiel für den
Browser (Geist von Worms/Frontschweine). Vollständig zerstörbares Terrain,
harte Determinismus-Regeln für Multiplayer, datenorientiertes ECS.
JavaScript (ESM), Vite, Node >= 22.

## Primary goals
- Deterministische Simulation: ein Seed, ein Zustandshash. Replays und
  Server-Wiederherstellung müssen exakt reproduzieren.
- Server ist die Source of Truth: Client-Eingaben werden validiert
  (Token, Zug, Nutzlast), nie geglaubt.
- Messen statt behaupten: Fertigmeldungen tragen die Ausgabe der Belegbefehle.
- Keine Bot-KI: Teams werden ausschließlich von Menschen gespielt.

## TypeScript
Dieses Projekt ist JavaScript — KEIN TypeScript. Keine `.ts`-Dateien anlegen.

## Architecture
Vor einer Architekturänderung:
1. Inspect existing implementation.
2. Identify dependency boundaries (src/shared darf keine Node-Builtins laden).
3. Check existing tests.
4. Explain proposed changes.
5. Modify the smallest necessary surface.

## AI behavior
Distinguish: observation, hypothesis, proposed change, implemented change, verified result.
Never claim a test passed unless it was actually executed.

## Git
Never rewrite history.
Never force-push.
Never modify main directly for experimental work.

## MCP
Use the smallest MCP toolset required.
Do not load unrelated MCP servers.

## Audio
Never destructively modify source audio unless explicitly requested.
Prefer reproducible processing chains.

## Security
Never expose secrets.
Never commit API keys.
Never disable authentication merely to simplify development.
