# Lokaler Abschluss · 9. November 2026

Arbeitsbranch: `integration/lokal-abschluss-2026-11-09`.
Dieser Stand vereinigt den bisherigen Integrationsbranch, die vollständige
Waffenprüfung und den aktuellen Main-Stand mit neun neuen Machina-Aktionsblättern.
Die frühere [Agentenübergabe](agenten-uebergabe-2026-11-09.md) dokumentiert die
Herkunft; ihre damalige Beschränkung auf einen Sidebranch gilt für jenen Auftrag.

## Vollständigkeit

- Alle drei lokalen Checkouts wurden auf Änderungen, Branches, Worktrees und
  Stashes geprüft. Keine uncommittierten Quellarbeiten und keine Stashes gefunden.
- Panoramen-Ursprung `45a2d1d` und Kulissen-Ursprung `f08dd47` sind bereits inhaltlich
  integriert und mit identischen Trees als `5172fad` und `549e749` veröffentlicht.
  Die sauberen Ursprungs-Checkouts bleiben als Sicherung erhalten.
- Der lokale Waffenprüfcommit `8be59b5` hat denselben Tree wie der veröffentlichte
  Commit `eefed19`; keine zweite, abweichende Waffenfassung vorhanden.
- Der nicht mehr referenzierte Merge `f3b9d68` hat denselben Tree wie `e7e0d76`;
  er enthält keine zusätzliche verlorene Arbeit.
- Main-Ausgang `fa40d86` und Waffenprüfung `eefed19` wurden konfliktfrei vereinigt.
  Veröffentlichungsmerge: `e166d30`; sein Tree stimmt exakt mit dem lokalen Merge
  `63f4f70` überein. Keine fremde Historie wurde umgeschrieben.

## Behobener Integrationsfehler

Die zusätzlichen Machina-Aktionen ließen das Auslieferungspaket auf 100,84 MiB
wachsen (105.742.998 Bytes; Grenze 105.000.000 Bytes). Der Bild-Glob in
`figurenBilder.js` nahm außerdem 81 historische `__zustand.webp` auf, obwohl
`ladeBlatt` ausschließlich `walk` und `aktion` liest. Der Glob umfasst jetzt nur
diese beiden Laufzeitrollen. Sämtliche 162 benötigten Sheets aus dem Manifest
sind vorhanden. Die historischen Bilder bleiben unverändert im Quellbestand.

Der geprüfte Bau liegt bei 94,43 MiB. Haupt-JavaScript: 1243,7 KiB roh / 344,9 KiB
gzip; Start: 1341,8 KiB roh / 367,8 KiB gzip. Keine Sourcemaps.
Alle Größenlimits bleiben unverändert; es wurden keine Bilder neu kodiert.

## Prüfungen und verbleibende Grenzen

- Unit-Tests: 2422 bestanden, keine Fehler, keine übersprungenen Tests.
- Lint, Importprüfung, Dokumentationsprüfung und `git diff --check`: erfolgreich.
- Alle 22 Projekt-Gates einschließlich Produktionsbau und Größenlimit: erfolgreich.
- Browserprüfungen für Lobby, Replay, Siegdialog, Touch, Laufzeit und Figuren-Sheets
  wurden angestoßen, konnten hier aber keinen Browser starten. Playwrights Browser
  fehlt; die Installation liefert ein unbrauchbares Downloadarchiv. System-Chromium
  bricht beim Start mit `socket() failed: Operation not permitted` ab.
  Das ist keine erfolgreiche E2E- oder visuelle Abnahme. CI-Ergebnisse separat prüfen.
- Die fachlichen Arbeitspakete in `docs/TODO-SSOT.md`, insbesondere die vorbereiteten
  Waffenbalance-Maßnahmen, bleiben eigenständige Aufgaben. Diese Zusammenführung
  ändert weder Waffenwerte noch Replayregeln und erklärt offene Aufgaben nicht für erledigt.
