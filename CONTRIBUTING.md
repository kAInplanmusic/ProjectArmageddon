# CONTRIBUTING.md

## Development workflow
1. Branch from main
2. Make changes
3. Tests green
4. Commit with test evidence in the message

## Code standards
- JavaScript (ESM) — **kein TypeScript**, das Projekt ist JavaScript
- Small composable modules
- Tests before or with changes (TDD: erst rot, dann grün)
- „Messen statt behaupten": Jede Fertigmeldung trägt die Ausgabe des Belegbefehls

## Verifikation vor dem Abschluss
- `npm test` — Unit- und Integrationstests
- `npm run lint` — ESLint
- `npm run validate` — Modul-Importe
- `npm run build` — Vite-Build
- `npm run checks` — alle 21 Prüfwerkzeuge

## PR requirements
- Clear description
- Test evidence
- No secrets
