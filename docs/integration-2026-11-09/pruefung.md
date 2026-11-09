# Prüfprotokoll der Zusammenführung

Stand: 9. November 2026, Node 24.22.1 lokal; CI verwendet Node 22.

| Prüfung | Ergebnis |
|---|---|
| `npm test` | 2422/2422 grün, keine übersprungenen Tests; vollständiger Lauf nach Funktionskorrekturen. Wiederholung nach Ladeoptimierung siehe unten. |
| `npm run validate` | grün, alle vier Einstiegspunkte importiert |
| `npm run lint` | grün |
| `npm run check:docs` | grün, README und MASTERDOTO auf 2422 Tests in 269 Dateien vereinheitlicht |
| `npm run build` | grün; große Chunks werden weiterhin als Vite-Hinweis gemeldet |
| `npm run check:bundle` | grün nach Ladeoptimierung; Grenzen unverändert |
| `npm run checks` | Erster Lauf: 21/22 grün; Bundle zuerst über Budget. Nach Optimierung vollständiger Wiederholungslauf, Ergebnis unten. |
| `node scripts/pruefe-kistenwege.mjs` | 37 Fälle vollständig, fünf Größen × sieben Formate plus zwei Problemseeds; Ausgabe daneben eingecheckt |
| Playwright, vier betroffene Specs | 18/18 durch Browserstart blockiert, keine Anwendungsausführung. Chromium: `socket() failed: Operation not permitted` in `process_singleton_posix.cc:297`. Kein Nachweis eines Anwendungsfehlers und keine E2E-Freigabe. |

Browseraufruf war `PA_PORT=5199 npx playwright test` mit temporärer Konfiguration,
die `/usr/bin/chromium` als ausführbare Datei setzte. Ausgeführt wurden
`lobby-browser`, `replay`, `sieg-dialog`, `touch-bedienung`. Die temporäre
Umgebungskonfiguration wurde entfernt. Insbesondere die erweiterten Fälle in
`backdrops.spec.mjs` und der spätere Hilfe-Ladeweg benötigen die CI-Abnahme.
Eine neue visuelle Baseline wurde nicht erstellt.

## Ladebudget nach Optimierung

| Wert | Gemessen | Unveränderte Grenze |
|---|---:|---:|
| Haupt-JS roh | 1256,9 KiB | 1269,5 KiB |
| Haupt-JS gzip | 346,5 KiB | 348,6 KiB |
| Start roh | 1355,1 KiB | 1372,1 KiB |
| Start gzip | 369,4 KiB | 376,0 KiB |
| Gesamtauslieferung | 99,28 MiB | 100,14 MiB |
| Sourcemaps | 0 | 0 |

UHD-Pixelmaße bleiben erhalten. Quellen und Encoderparameter stehen beim Fotoasset.
Die dekodierte Höhlen-AVIF wurde als 1280er-Vorschau sichtbar geprüft; eine
Abnahme aller drei Motive im laufenden Spiel auf echter Hardware bleibt offen.

## Nachlauf am endgültigen Quellstand

- `npm test`: **2422/2422 grün**, 119,1 s, 0 Fehler, 0 übersprungen.
- `npm run checks`: **22/22 grün**, 90,6 s, 0 fehlgeschlagen.
- `npm run validate`, `npm run lint`, `npm run build`, `npm run check:docs`: grün.
- `git diff --check`: grün; beide Quell-Checkouts und Integrationscheckout sauber
  nach den Sicherungs-/Integrationscommits.
- Foto-Manifest: alle 15 SHA-256-Prüfsummen stimmen.
- Die beiden anschließenden Herkunfts-Merges ändern ausschließlich die Historie,
  keinen Quelltext. Abschließender Doku-Commit ergänzt nur dieses Protokoll.
- Die GitHub-CI wird beim Push auf den Integrationsbranch gestartet. Ihr Ergebnis
  wird hier nicht vorweggenommen; der Browsernachweis bleibt bis dahin offen.

[Kompletter Gate-Nachlauf](gates.txt) · [Unit-Zusammenfassung](unit-zusammenfassung.txt)
