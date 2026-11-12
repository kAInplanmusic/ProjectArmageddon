# MASTERDOTO — stillgelegt

Diese Datei ist **keine Arbeitsliste** mehr. Die einzige offene Liste steht in
[`docs/TODO.md`](docs/TODO.md); die alte Historie steht unverändert in Git
(`git log -- MASTERDOTO.md`).

Nur die von `check:docs` geprüften Kennzahlen bleiben als Kompatibilitätsvermerk:

<!-- testzahlen:start (erzeugt von scripts/check-docs.mjs --schreiben, nicht von Hand ändern) -->
- Unit/Integration (`npm test`): **2961 Tests**, 2958 grün, 1 übersprungen, **2 rot**; 319 Testdateien beim Lauf (2026-11-12, Stand `f85e81c`).
- Browser-E2E (`npx playwright test --list`): **397 Tests in 78 Spezifikationen** (Zählung 2026-11-12, Stand `f85e81c`; das ist eine Zählung, kein Lauf).
- Aktuelle Dateizahlen: `npm run check:docs` (zählt die getrackten Dateien). Erfassen: `npm run testlauf:erfassen`. Verlauf: `git log -p -- docs/testlauf.json`.
<!-- testzahlen:ende -->
- **22 Gates in 105.2 s | fehlgeschlagen: 0**
- Node `>=22` festgeschrieben
- `docs/matrix-terrain-waffen-wirkung.md`: 150 Waffen
- 8 Terrain-Arten mit gemessenem Festanteil
