# Audit-MCP — Tiefen-Audit für Spiele und Spielengines

Ein MCP-Server (Model Context Protocol, stdio) für belegbasierte Tiefen-Audits.
Er bündelt **drei Dinge**, die vorher verstreut waren:

1. **Die laufende Engine** — Sonden gegen `MatchController` (Determinismus,
   Spielverlauf, Ballistik, Leistung, Karten, Klassen, Waffen).
2. **Den Quelltext** — statische Analyse (tote Dateien, unbenutzte Konstanten,
   Doppelregeln, stumme Ereignisse, Zufall im Simulationspfad, Secrets,
   generierte Dateien, Server-Autorität).
3. **Den Wissensstand der Skills** — 55 Prüffragen aus zehn Regelwerken, jede
   mit Quelle, Methode und Belegpflicht, abfragbar über `audit_checklist`.

## Aufruf

```bash
# Als MCP (stdio) — so ruft Hermes es auf
node tools/audit-mcp/server.mjs

# Diagnose ohne MCP
npm run audit:liste                      # Werkzeuge, Prompts, Kataloggröße
npm run audit:status                     # Repozustand
node tools/audit-mcp/server.mjs --ruf audit_deadcode
node tools/audit-mcp/server.mjs --ruf 'audit_gates' '{"welche":"schnell"}'

# Der bestellte Bericht (schreibt docs/audit-tief.md)
npm run audit:bericht
```

Es gibt **keine Abhängigkeit**: Der Server spricht JSON-RPC 2.0 zeilenweise
über stdin/stdout, wie es die MCP-stdio-Spezifikation verlangt. Kein SDK, kein
`npm install`.

## Werkzeuge

| Werkzeug | Was es liefert |
|---|---|
| `audit_status` | Commit, Branch, ungetrackte Änderungen, Umfang (Dateien/Zeilen je Bereich), Gate-Liste |
| `audit_gates` | Gate-Batterie mit Exit-Code, Dauer und Kennzahlen je Gate |
| `audit_determinism` | Derselbe Seed zweimal → gleicher Zustandshash? Anderer Seed → anderer? |
| `audit_flow` | Partiedauer, Züge, Schüsse, Rundenzahl, Sieger je Seed |
| `audit_ballistics` | Wurfweite über Winkel × Kraft aus der ECHTEN Vorhersage, Geschoss-Lebensdauer |
| `audit_weapons` | 150 Waffen: Verteilungen, Kategorien, Felder mit überall gleichem Wert |
| `audit_classes` | 9er-Matrix Klasse × Archetyp mit den Wirk-Achsen und ihren Spannweiten |
| `audit_terrain` | Landanteil je Geländeform über viele Seeds — Mittelwert UND Streuung |
| `audit_perf` | Tick-Kosten (mittel/p95/p99/max) gegen das 16,7-ms-Budget, je Schritt gemessen |
| `audit_deadcode` | Dateien ohne Importeur, unbenutzte Exporte/Konstanten, Doppelregeln, Marker, generierte Dateien |
| `audit_events` | Emittierte vs. behandelte Ereignisse — gedeckt von stumm |
| `audit_security` | Identität aus dem Token? `Number()` auf Drahtwerten? direkt gelesene Kennungen? Grenzen |
| `audit_secrets` | Secret-Scan über `git ls-files` (Werte nie im Klartext, nur Fingerabdruck) |
| `audit_nondeterminism` | Zufall/Zeit im Simulationspfad und außerhalb (mit Einordnung) |
| `audit_checklist` | Der Prüfkatalog, filterbar nach Thema/Quelle/Freitext |
| `audit_e2e_plan` | Plan für den 10-Minuten-E2E-Lauf samt Putzregel und bekannten Vorbefunden |
| `audit_all` | Alles auf einmal mit Ampel je Prüffeld (JSON) |
| `audit_bericht` | Alles auf einmal **als Markdown-Datei** mit Auswertung und TODO |

Dazu zwei MCP-Prompts: `tiefenaudit` (kompletter Durchlauf) und
`befund-pruefen` (einen einzelnen Befund als Widerlegungsversuch prüfen).

## Die Regeln, die dieses MCP durchsetzt

Der Katalog ist nicht erfunden — er sammelt, was in diesem Projekt schon einmal
schiefgegangen ist. Die vier wichtigsten:

- **Jeder Befund braucht eine Fundstelle (`datei:zeile`) ODER eine Messzahl.**
  Ohne eines von beiden ist es eine Meinung.
- **Kommentarzeilen sind keine Treffer.** Das MCP hat sich diese Lektion selbst
  eingebaut: Im ersten Lauf meldete die Zufalls-Sonde drei Treffer — alle drei
  waren Kommentare („bewusst NICHT `Math.random`"). Ein Werkzeug, das Kommentare
  zählt, ist ein Werkzeug, dem niemand glaubt.
- **„Ist definiert" ist nicht „wird gelesen".** Ein Export ohne externen Leser
  wird von einem Export unterschieden, der nur innerhalb der eigenen Datei
  genutzt wird (überflüssiges `export`) — zwei verschiedene Befunde.
- **Design-Entscheidungen trifft das Werkzeug nicht.** Was eine Balance- oder
  Produktfrage ist (konstante Waffenfelder, Mahlstrom-Breakpoint), steht im
  Bericht als *„Offen — Design-Entscheidung"* mit den Zahlen daneben.

## Grenzen

- **Kein Bild.** Das MCP misst die Simulation, nicht das Rendering. Visuelle
  Qualität und der WebGPU-Pfad sind ohne echten Browser nicht prüfbar.
- **Kein Netz.** Latenzverhalten nur über `tests/e2e/network-conditions.spec.mjs`.
- **Der E2E-Lauf läuft nicht im MCP.** 27 Dateien, ~10 Minuten — dafür gibt
  `audit_e2e_plan` den Plan und `npm run test:e2e` den Lauf.
- **Statische Treffer sind Kandidaten, keine Urteile.** Ein toter Export kann
  Absicht sein (Testbarkeit), eine Konstante kann von außen gelesen werden
  (Konfiguration). Jeder Treffer muss nachgelesen werden — das Werkzeug sortiert
  vor, es entscheidet nicht.

## Herkunft der Prüffragen

`audit_checklist` nennt je Frage die Quelle. Eingeflossen sind:
`code-grounded-ux-audit`, `e2e-suite-deep-analysis`,
`projectarmageddon-verification`, `webapp-security-config-audit`,
`webapp-architecture-audit`, `deterministic-sim-engine-dev`,
`browser-game-audio-and-feel`, `procedural-terrain-generation`, `dogfood`,
`systematic-debugging`.
