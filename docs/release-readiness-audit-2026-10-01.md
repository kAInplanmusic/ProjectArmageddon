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

| Bereich | Status | Beleg / nächste Messung |
|---|---|---|
| Git-/Arbeitsbaum | offen | uncommitted Änderungen müssen vor Abnahme zugeordnet werden |
| Unit-/Integrationstests | offen | vollständigen Lauf mit ausreichendem Timeout fahren |
| Lint / Validate / Build | offen | Gate-Batterie |
| E2E / Accessibility | offen | Produktionsbuild bzw. System-Chrome, kein HMR-Lauf für Messwerte |
| Balance | offen | Sweep über Seeds, Presets, Klassen, Waffen und Distanzen |
| Performance | offen | `perf`, Figuren-/Netz-/Browser-Messung |
| Security / Autorität | offen | Server-Autorität, Protokoll, Secrets, Limits |
| Deployment / Rollback | offen | `npm run server`, Healthcheck, SIGTERM, Build-Artefakt, Rollback |
| SSOT-Konsistenz | offen | MASTERDOTO, Befundregister, README, Auditberichte |

## Befunde

Noch keine neuen Befunde behauptet. Dieser Abschnitt wird ausschließlich aus den
Messläufen und Codeprüfungen fortgeschrieben.

## Nicht messbar ohne Betreiberaktion

Live-Internet-Deployment, echte Mehrspieler-Human-Session, externe DNS-/TLS-
Abnahme und Produktionslast werden lokal nicht als erledigt behauptet. Dafür wird
eine reproduzierbare Operator-Checkliste erstellt.
