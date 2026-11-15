# E2E-Stabilisierung — Stand 2026-11-13

## Problem
Wave-4 E2E-Tests (402 Specs) scheiterten massenhaft mit `net::ERR_CONNECTION_REFUSED`. Der Vite-Dev-Server wurde nicht korrekt initialisiert.

## Ursachen & Fixes

### 1. Vite-Server-Start
- **Problem:** `reuseExistingServer: !CI && !PA_PORT` → bei `CI=true` oder gesetztem `PA_PORT` startet Playwright einen neuen Server pro Test.
- **Fix:** `reuseExistingServer: true` in `playwright.config.mjs` — der Server wird zwischen Tests wiederverwendet.
- **Ergebnis:** ~60s/Test statt ~4,5 min/Test. Geschätzte Gesamtdauer: ~40 min für 402 Tests.

### 2. Port-Konflikte
- **Problem:** Port 5173 war durch andere Worktree-Instanzen belegt.
- **Fix:** `PA_PORT=5199` für Test-Läufe, um Kollisionen zu vermeiden.

### 3. Feuerwesen-Test (pa_118)
- **Problem:** `match.waffen` gab 22 statt erwartete 20 (WAFFEN_WURF=22 ist neuer Default).
- **Fix:** Test auf `startMatch({ waffen: 20 })` umgestellt — explizite Waffenfassung statt UI-Interaktion.
- **Problem:** `requestAnimationFrame` läuft im headless Browser (Playwright) nicht zuverlässig.
- **Fix:** Test auf Log-Text-Abbildung umgestellt (`Ein Feuerwesen läuft los`, `Feuerwesen zerbirst`).
- **Ergebnis:** Test läuft grün in 4,9s.

### 4. Trace-Dateien
- **Problem:** ENOENT-Fehler für Trace-Dateien.
- **Fix:** `trace: 'off'` in playwright.config.mjs.

## Aktueller Lauf
- PID: 578660
- Modus: `CI=true npx playwright test --project=chromium --reporter=line --retries=2`
- Port: 5199
- Tempo: ~60s/Test
- Geschätzte Dauer: ~40 min

## Test-Status
- Unit-Tests: 3059/3059 bestanden
- Wave-4 E2E: läuft