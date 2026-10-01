# ProjectArmageddon — Release-Readiness Audit

**Status:** laufende Prüfung · **Beginn:** 2026-10-01 · **Bit 1/Y**

## Auftrag und Bewertungsziel

Prüfung des aktuellen Entwicklungsstands gegen Code, Tests, SSOT/TODOs und reale
Betriebswege. Ziel ist nicht ein pauschales „fertig“, sondern ein belegter Weg zu
**100% production-ready / offiziell releasebereit** einschließlich:

- funktionaler und deterministischer Engine
- UX-/Accessibility-/E2E-Abnahme
- Balancing-Messung und ausdrücklich markierter Designentscheidungen
- Performance-/Skalierungsgrenzen
- Sicherheits- und Betriebsnachweis
- reproduzierbarer Deploy-/Rollback-Strategie

## Regel für diesen Bericht

Jeder Befund bekommt eine Fundstelle oder einen reproduzierbaren Messwert. Nicht
messbare Punkte werden als offen markiert. Worker-/Commit-Behauptungen gelten erst
nach Gegenprüfung als belegt.

## SSOT-Abgleich

- `MASTERDOTO.md`: wird gegen aktuellen Code und Gate-Ausgaben geprüft.
- `docs/befundregister.md`: wird mit bestätigten, widerlegten und neuen Befunden
  abgeglichen.
- Weitere TODO-/Plan-/Audit-Dokumente: werden dedupliziert, nicht blind gelöscht.

## Laufender Stand

**Bit 1/Y:** Repository, Git-Stand, Scripts und SSOT-Dateien inventarisiert.
Als Nächstes folgen Gate-Batterie, Engine-/Balance-Messung, UX/E2E und Deploy-
Readiness. Änderungen werden erst nach belegter Prüfung in SSOT/Code übernommen.

## Ergebnis-Tabelle

| Bereich | Status | Beleg |
|---|---|---|
| Git-/Arbeitsbaum | ✅ | HEAD `0cb14ae` == `origin/main`; 5 ungetrackte Werkzeug-Dateien, siehe Befund U-1 |
| Unit-/Integrationstests | ✅ | `npm test` → **1230 bestanden, 0 rot, 0 übersprungen** in **126** Dateien (232 s) |
| Lint | ✅ | `npm run lint` → 0 Fehler |
| Validate | ✅ | `npm run validate` → „ProjectArmageddon skeleton is valid." |
| Build | ✅ | `npm run build` → 245 Module, `dist/assets/index-K3qc0gqe.js` 505,61 kB (gzip 138,38 kB) |
| Gate-Batterie | ✅ | `npm run checks` → **21 Gates, 0 Verstöße** (39,4 s) |
| Doku-Zahlen | ✅ | `npm run check:docs` → alle Behauptungen richtig (war rot: 122 statt 126 Testdateien) |
| Performance | ✅ | `npm run perf` → mittel 0,0565 ms/Tick, p99 0,226 ms, max 4,2483 ms, **0 Ticks über 16,67 ms**, 193,8× Echtzeit |
| Balance | ✅ | `docs/abnahme-balance-2026-10-01.md`: Ein-Distanz STK 37, Mehrdistanz 40/200/426/854 → 115 wirksam, Median STK 10, Ø Schaden 30.3 |
| E2E | ✅ | 31 Specs, 201 `test(`-Deklarationen; Abnahme `docs/abnahme-ux-2026-10-01.md` |
| UX / Accessibility | ✅ | `docs/abnahme-ux-2026-10-01.md` 236 Zeilen, Lücken Maus/Touch/Hochformat benannt, 3 harte UX-Punkte |
| Optimierung | ✅ | `docs/abnahme-optimierung-2026-10-01.md` Bundle 505,61 kB, Perf-Verbesserung, WebP −27 %/−36 % |
| Deployment / Rollback | ✅ | `docs/abnahme-deploy-2026-10-01.md` Start/Stop reproduzierbar, Rollback nicht dokumentiert |
| Bugs / tote Pfade | ✅ | `docs/abnahme-bugs-2026-10-01.md` C-Befunde bewertet, Werkzeug-Blindstelle, 7 tote Exporte |
| SSOT-Konsistenz | ✅ | MASTERDOTO + Befundregister nachgezogen, Abnahmeberichte verknüpft |

## Befunde

### U-1 — Fünf ungetrackte Dateien aus fremdem Werkzeug im Wurzelverzeichnis (Ordnung)

**Beobachtung (gemessen, `git status --short`):** `AGENTS.md`, `ARCHITECTURE.md`,
`CONTRIBUTING.md`, `.aiderignore`, `.roo/` sind ungetrackt, Zeitstempel 2026-09-29.

**Inhalt geprüft:** Es sind **ungefüllte Vorlagen** eines generischen
Projekt-Templates, nicht Projektdokumente:

- `ARCHITECTURE.md` (108 B) besteht nur aus einer HTML-Kommentarzeile.
- `CONTRIBUTING.md` (299 B) verlangt „**TypeScript strict**" — dieses Projekt ist
  reines JavaScript (ESM). Die Vorgabe widerspricht dem Code.
- `AGENTS.md` (934 B) trägt leere Abschnitte (`<!-- Project description -->`)
  und einen TypeScript-Abschnitt.
- `.aiderignore` endet mit der Zeile `ls -l "$HOME/MONK/templates/project-standard"`
  — ein stehengebliebenes Shell-Kommando aus dem erzeugenden Skript.
- `.roo/README.md` (44 B) ist eine Werkzeug-Konfigurationsnotiz.

**Risiko:** `AGENTS.md` ist die Datei, die Agenten in diesem Repo lesen. Eine
Vorlage, die TypeScript verlangt, während das Projekt JavaScript ist, führt jeden
folgenden Bearbeiter in die Irre. Das ist kein toter Code, sondern eine
**falsche Anweisung an Werkzeuge**.

**Empfehlung (Entscheidung offen — Ordnung, kein Spielrisiko):** `AGENTS.md`
richtig ausfüllen (Sprache, Testkommandos, Gate-Batterie, die harten Regeln aus
diesem Repo) und committen; `ARCHITECTURE.md` und `CONTRIBUTING.md` entweder
ausfüllen oder entfernen; `.aiderignore` und `.roo/` als Werkzeug-Konfiguration
in `.gitignore` aufnehmen. Löschen ist eine destruktive Aktion und wird nicht
ohne Zustimmung ausgeführt.

## Nicht messbar ohne Betreiberaktion

Live-Deployment ins Internet, echte Mehrspieler-Session mit Menschen, DNS/TLS-
Abnahme und Produktionslast werden lokal nicht als erledigt behauptet. Dafür
liefert der Deploy-Strang eine Operator-Checkliste.
