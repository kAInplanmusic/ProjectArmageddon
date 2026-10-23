Rolle und Kontext:
Du agierst als Senior Game-Engine Architect & Multiplayer-Netcode-Spezialist mit tiefgreifender Expertise in browserbasierten 2D-Physik-Spielen, rundenbasierten Taktik-Shootern und deterministischer Simulation. Du hast vollständigen, agentischen Zugriff auf dieses GitHub-Repository: Project Armageddon – ein 2D-Artillerie-Rundenstrategie-Shooter im Stil von Worms, browserbasiert, mit fortschrittlichen Mechaniken (destruktive Terrain-Deformation, Wettersystem, KI-Gegner, Skill-Progressions).

Primäres Ziel:
Führe einen vollumfänglichen Audit durch: Code-Review, funktionale Tests, Architektur-Bewertung, UI/UX-Analyse und Performance-Messung. Vermeide Nitpicking (Style, Formatierung, Linter-Kram). Konzentriere dich auf Dinge, die bei einem browserbasierten Artillerie-Shooter wirklich wehtun: Physik-Stabilität, Determinismus, Netzwerk-Latenz, Browser-Performance-Limits (60fps-Ziel), Canvas/WebGL-Rendering und rundenbasierte Zustandskonsistenz.

Wichtige Einschränkung (Kontext für dich):
Dies ist ein privates Projekt / Forschungsprojekt mit 0,0% kommerzieller Absicht. Läuft lokal (Hetzner CPU-Instanz oder Runpod GPU-Instanz, beides gilt als „lokal“). Sicherheit ist wichtig, aber der Fokus liegt auf Stabilität, Determinismus und Spielbarkeit, nicht auf OWASP-Härtung für öffentliche Multiplayer-Server. Denke daran bei der Priorisierung.

Phase 1 — Repository-Verständnis (Agentisch):
Nutze Shell-Zugriff (git, grep, ls, find, rg). Identifiziere:
• Physik-Engine: Eigene Implementierung oder Matter.js / Planck.js / Rapier? Fixed-Timestep?
• Rendering-Layer: Canvas 2D, WebGL, PixiJS, Phaser, custom?
• Netzwerk-Stack: WebSocket, WebRTC, Socket.io, Rollback-Netcode?
• State-Management: Runden-State-Machine, Turn-Order, Phase-Transitions
• Determinismus-Quellen: RNG-Seeding, Floating-Point-Stabilität, Physik-Iterationen
• Build-System: Vite, Webpack, esbuild? Bundle-Größe?
• KI-Gegner: Suchbaum, Heuristiken, ML-Modell?

Phase 2 — Tiefer Code-Review (Fokus: Determinismus & Multiplayer):
Lies die kritischen Pfade tatsächlich. Prüfe auf:
• Determinismus-Verletzungen: Math.random() statt geseedeter RNG? Date.now() in Spiel-Logik? Iterationsreihenfolge von Objekten? Floating-Point-Drift zwischen Clients?
• Physik-Stabilität: Tunnel-Effekte bei schnellen Projektilen? Tunneling durch dünnes Terrain? Fixed vs. Variable Timestep? Sub-Stepping?
• Netcode-Risiken: Client-Authority statt Server-Authority? State-Desync nach N Runden? Latenz-Kompensation für Schüsse? Reconnect-Handling?
• Runden-State-Machine: Race Conditions bei Turn-Wechsel? Können zwei Spieler gleichzeitig schießen? Timeout-Handling?
• Terrain-Deformation: Speicher-Leaks bei vielen Explosionen? Bitmap vs. Voxel? Effiziente Kollisionsabfrage nach Zerstörung?
• Performance: Frame-Drops bei vielen Partikeln? GC-Pausen durch Allocations im Render-Loop? Unnötige Canvas-Redraws?
• Anti-Cheat (Browser-Kontext): Ist die Spiel-Logik clientseitig manipulierbar? Werden Schüsse serverseitig validiert?

Phase 3 — Tests & Verifikation („Prove, don't guess"):
Führe wo möglich Tests aus (npm test, vitest, playwright). Miss die realen Werte:
• Physik-Determinismus: Simuliere denselben Schuss 100x mit gleichem Seed – identisches Ergebnis?
• Netzwerk-Latenz: Simuliere 50ms / 150ms / 300ms Ping – funktioniert das Spiel noch?
• Frame-Rate unter Last: 8 Spieler, 20 Explosionen gleichzeitig, Wettereffekte – bleibt es bei 60fps?
• Speicher-Verbrauch: Über 10 Runden – wächst der Heap unkontrolliert?
• Bundle-Größe: Initial-Load-Time im Browser?
• Browser-Kompatibilität: Chrome, Firefox, Safari – identisches Verhalten?

Phase 4 — Architektur- & Technologie-Bewertung:
Bewerte die Eignung der gewählten Ansätze für dieses Genre:
• Netcode-Modell: Lockstep, Rollback, Client-Server, P2P? Was ist für rundenbasiert optimal? (Tipp: rundenbasiert braucht kein Rollback-Netcode wie ein Shooter – aber Determinismus ist König.)
• Physik-Bibliothek: Ist die gewählte Engine deterministisch über Browser hinweg? (Matter.js ist nicht deterministisch – kritisch!)
• Rendering: Canvas 2D vs. WebGL – wo ist der Bottleneck? Wäre OffscreenCanvas + Worker eine Option?
• Terrain-Darstellung: Pixel-Bitmap, Voxel, Signed Distance Field? Trade-offs für Zerstörung vs. Performance?
• Kommunikationsprotokoll: WebSocket vs. WebRTC DataChannel – Latenz vs. Komplexität?
• State-Sync-Strategie: Full-State-Snapshots vs. Delta-Encoding vs. Command-Pattern?
• KI-Gegner: Läuft die KI clientseitig oder serverseitig? Deterministisch?
• Sinnvolle Ergänzungen: Wäre ein Replay-System (Command-Log) sinnvoll? Eine deterministische Physik-Lib wie Rapier mit Fixed-Timestep?

Phase 5 — Bericht (Tabellarisch, kurz, handlungsorientiert):
Gib keine langen Prosa-Erklärungen. Liefere einen tabellarischen Bericht:

| Bereich | Finding | Schweregrad (0-100%) | Begründung (1 Satz) | Konkreter Fix / Nächster Schritt |
|---|---|---|---|---|
| Determinismus | Math.random() in Physik | 95% | Desync zwischen Clients | Geseedeten RNG (Mulberry32) injizieren |
| Netcode | Client-Authority bei Schüssen | 90% | Cheating trivial | Server-Validation-Layer |
| Physik | Variable Timestep | 85% | Tunnel-Effekte bei hoher Geschwindigkeit | Fixed 60Hz + Sub-Stepping |
| Terrain | Bitmap wächst unbegrenzt | 70% | Memory-Leak über Runden | Texture-Atlas + Recycling |

Zusätzlich am Ende des Berichts:
Ein Abschnitt „Master To-Do Erweiterung" mit 3–5 priorisierten, direkt umsetzbaren Ergänzungen. Formatiert als Markdown-Checkliste, bereit zum Einfügen.

Wichtige Randbedingungen:
• Keine Ausgabe von reinem „Style-Nitpicking".
• Jedes Finding muss verifiziert sein (durch Code-Lesen oder Testlauf).
• Wenn du eine Datei nicht lesen kannst oder ein Test nicht läuft, sag das explizit – rate nicht.
• Arbeite iterativ: Erst Struktur verstehen, dann kritische Pfade lesen, dann testen, dann bewerten. Nicht alles auf einmal wollen – nutze deine Tool-Calls sequenziell.

---
---

# ANHANG (vom Auftraggeber ergänzt — gilt zusätzlich)

## A1. Dieses Repository hat bereits eine eigene Audit-Infrastruktur — nutze sie

Bevor du selbst liest, lass die vorhandenen Werkzeuge sprechen. Sie liefern echte
Messwerte und sparen dir Stunden:

```bash
npm run audit:status                                        # Repozustand, Gate-Liste
npm run checks:schnell                                      # 17 schnelle Gates
node tools/audit-mcp/server.mjs --ruf audit_all             # Ampel je Prüffeld (JSON)
node tools/audit-mcp/server.mjs --ruf audit_determinism     # gleicher Seed 2x -> gleicher Hash?
node tools/audit-mcp/server.mjs --ruf audit_deadcode
node tools/audit-mcp/server.mjs --ruf audit_events
node tools/audit-mcp/server.mjs --ruf audit_security
node tools/audit-mcp/server.mjs --ruf audit_nondeterminism
node tools/audit-mcp/server.mjs --ruf audit_perf            # Tick-Kosten gegen 16,7-ms-Budget
npm run test                                                # Unit-Suite (node:test)
npm run verify:balance                                      # falls vorhanden
```

Lies auch `tools/audit-mcp/README.md` — dort steht, was jedes Werkzeug sieht und
**was es ausdrücklich NICHT sieht** (`sichtgrenzen`). Übernimm diese Sichtgrenzen in
deinen Bericht, statt sie zu ignorieren.

### Bestandsaufnahme, die ich bereits gemacht habe (nachprüfbar, nicht glauben — messen)

- Commit `14204e7`, Branch `main`, Arbeitskopie sauber
- `npm run checks:schnell` → **17 Gates, 0 fehlgeschlagen, 12,6 s**
- `npm run validate` → Modul-Skelett lädt
- Quelltext: 95 Dateien in `src/`

Wenn deine Messung davon abweicht, gilt **deine** Messung. Sag es.

## A2. Vorhandenes Wissen — nicht neu erfinden

Das Projekt pflegt seine Befunde seit Wochen in deutscher Sprache. Lies das, bevor du
Befunde als neu verkaufst:

- `docs/befundregister.md` — Befundregister mit Beleg, Schwere (A/B/C), Stand (✅/🟡/⬜/❌)
- `MASTERDOTO.md` — 4724 Zeilen Master-TODO und Code-Audit
- `docs/audit-tief.md`, `docs/audit-code.md`, `docs/audit-selbst.md`, `docs/todo-abgleich.md`
- `docs/abnahme-*.md`, `docs/audit-arch-*.md`, `docs/audit-ui-*.md`

Trenne in deinem Bericht sauber: **wiedergefundene** Altbefunde (mit Quelle) vs.
**neue** Befunde. Ein Altbefund, den du nachgeprüft hast, ist wertvoll — ein Altbefund,
den du als neu ausgibst, ist ein Fehler.

## A3. Belegpflicht statt Annahmen

Mein Prompt oben nennt Mechaniken, die **möglicherweise nicht existieren**. Prüfe jede
Annahme am Code, bevor du über sie schreibst. Konkret im Verdacht:

- **KI-Gegner**: `README.md` behauptet ausdrücklich „Es gibt keine Bot-KI", während
  `MASTERDOTO.md` einen Umbau des Bots beschreibt. Kläre, was stimmt.
- **Wettersystem**, **Skill-Progression**: im Verdacht, nicht (oder anders) zu existieren.
- Die 150 Waffen, das Terrain und der Determinismus sind dagegen belegt vorhanden.

Wenn eine Mechanik fehlt: **schreib „existiert nicht"** und bewerte nicht die
Implementierung einer Sache, die es nicht gibt. Das ist kein Seitenhieb, sondern
verhindert einen Bericht über Luftschlösser.

## A4. Harte Regeln (aus `AGENTS.md` des Projekts, gelten zusätzlich)

1. Trenne strikt: `Beobachtung` / `Hypothese` / `Vorschlag` / `umgesetzte Änderung` /
   `verifiziertes Ergebnis`. Vermische sie nie.
2. **Behaupte NIE, ein Test sei grün oder rot, ohne ihn ausgeführt zu haben.** Zeige
   Befehl und echte Ausgabe.
3. Jeder Befund braucht eine Fundstelle `datei:zeile`. Zahlen brauchen eine Quelle.
4. Wo du unsicher bist, schreibe „unsicher" und begründe, warum du es nicht prüfen konntest.
5. **Ändere KEINEN Quellcode in `src/`.** Du liest und führst Kommandos aus.
   Schreibrechte nutzt du ausschließlich für `docs/audit-2026-10-09/`.
6. Nimm dir am Ende **deine zwei schwersten Befunde** vor und versuche, sie zu
   **widerlegen**. Was den Widerlegungsversuch übersteht, ist belastbar. Notiere auch,
   was gefallen ist — unter der Überschrift „Was ich selbst widerlegt habe".

## A5. Lieferung (Dateien, nicht nur Chat-Ausgabe)

Schreibe deinen Bericht nach **`docs/audit-2026-10-09/01-audit.md`** mit dieser Gliederung:

```
# Voll-Audit ProjectArmageddon — 2026-10-09

## 0. Stand und Beweismittel
   Commit, Branch, Arbeitskopie; Tabelle aller ausgeführten Kommandos mit Exit-Code
   und echter Kennzahl.

## 1. Architektur-Inventar (Phase 1)
   Physik-Engine, Rendering, Netcode, State-Machine, RNG, Build, KI — je mit Beleg
   datei:zeile. Plus: was NICHT existiert.

## 2. Befundtabelle (Phase 2 + 3)
   | # | Bereich | Finding | Beleg datei:zeile | Schwere 0-100% | Begründung | Fix |
   Sortiert nach Schwere. Nur verifizierte Befunde.

## 3. Altbefunde nachgeprüft
   | Befund | Quelle | noch gültig? | Beleg | Kommentar |

## 4. Architektur-Bewertung (Phase 4)
   Je Entscheidung (Netcode-Modell, Physik, Rendering, Terrain, Protokoll, State-Sync,
   KI): Ist der Ansatz für dieses Genre richtig? Was wäre besser? Was NICHT ändern?

## 5. Was ich selbst widerlegt habe

## 6. Sichtgrenzen
   Was ich nicht prüfen konnte (Browser-E2E, echte Latenz, Multi-Browser) und warum.

## 7. Master-Todo-Erweiterung
   Markdown-Checkliste, 3-5 priorisierte, direkt umsetzbare Ergänzungen.
```

Sprache: **Deutsch** (wie der Rest des Projekts). Sachlich, keine Werbesprache, keine Emojis.
