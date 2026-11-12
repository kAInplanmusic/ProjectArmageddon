# Test-Struktur 2026-11-12

## Überblick

Die Test-Suite ist in zwei Teile unterteilt:

### `npm run test:unit` (schnell)

Unit- und Integrations-Tests, die ohne Browser/DOM laufen:
- PRNG, Seed-System
- Loot-System
- Ballistik (geteilt/führend)
- Kollisionsmatrix
- Waffenfassungen (BAL-10 bis BAL-16)
- Figurenanimationen
- Schadenssystem
- Effekte
- Engine-Tests (ENG-1, ENG-6, ENG-7, ENG-12)
- UI-Elemente (ohne E2E)

**Laufzeit**: ca. 1-2 Minuten

### `npm run test:full` (vollständig)

Alle Tests inklusive E2E-Spezifikationen:
- `test:unit` + `test:e2e --jobs=1`

**Laufzeit**: ca. 13 Minuten (E2E ist seriell, weil Multiplayer-Tests feste Ports benötigen)

## E2E-Serialisierung

Die E2E-Tests laufen **ausschließlich seriell** (`workers: 1` in `playwright.config.mjs`).

Grund: Viele Specs starten einen eigenen Serverprozess und nutzen feste Ports (5173, 5174, etc.). Parallele Ausführung würde Kollisionen verursachen.

### Bekannte Flakes

1. **online-sprung-abwurf Timeout**: Der Test `gehen-online.spec.mjs` prüft das Abschalten von Online-Spielen. Bei langsamer Netzwerk-Emulation kann es zu Timeout kommen.
2. **profiling 60-Hz-Budget**: Tests wie `profiling.spec.mjs` prüfen die Frame-Zeit. Auf überlasteten CI-Runnern kann der 60-Hz-Budget (16,7 ms) unterschritten werden.

### Retires

In CI-Modus (`CI=true`) werden einzelne Tests mit `--retries 1` wiederholt, um flüchtige Fehler zu kompensieren.

## Dateien

- Unit-Tests: `tests/*.test.js` (329 Dateien)
- E2E-Tests: `tests/e2e/*.spec.mjs` (79 Spezifikationen)
- Test-Harness: `tests/test-harness.js`
- Hilfsdateien: `tests/helfer/`