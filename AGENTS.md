# AGENTS.md — Regeln für Agenten in diesem Repo

Gilt für jeden Agenten (Claude Code, Subagenten, andere Werkzeuge). Die
Paragraphen §5 und §7 werden von `docs/betrieb*.md` und `deploy/README.md`
zitiert; ihre Nummern bleiben stabil.

## §1 Projekt

ProjectArmageddon: rundenbasiertes Artillerie-Spiel im Browser. Autoritativer
Node-`ws`-Server, deterministische ECS-Engine (fest 60 Hz, Seed-Sub-RNGs,
Zustands-Hash), Canvas-2D-Client. Replay = Seed + Eingaben. Reines JavaScript
(ESM), **kein TypeScript**. Sprache von Doku, Kommentaren und Commit-Texten:
Deutsch.

## §2 Determinismus

Keine `Math.random`/`Date.now` in `src/engine` und `src/shared`; Zufall nur über
die Seed-Sub-RNGs. Neue Regeln, die alte Replays verändern würden, bekommen eine
Versionsmarke im Replay-Kopf (siehe `config.kit`); alte Aufzeichnungen laufen
unverändert weiter.

## §3 Prüfen vor dem Übergeben

- `npm test` (Unit, setzt `PA_ZUGPAUSE_SEKUNDEN=0`) muss grün sein.
- `npm run check:docs` muss grün sein; Zahlen in `README.md` und `MASTERDOTO.md`
  bleiben konsistent mit dem Code.
- E2E: `npx playwright test` (Config setzt die Zugpause auf 0). Betroffene Specs
  immer laufen lassen.
- `src/engine/match.js` bleibt ≤ 3199 Zeilen (Zeilenbudget-Test).
- Tests werden nie übersprungen, abgeschwächt oder gelöscht, um grün zu werden.

## §4 Git

Arbeit auf einem eigenen Branch, kleine Commits, Ergebnis nach `main` mergen und
pushen. Nur eigene Dateien stagen (Working Tree kann mit anderen Agenten geteilt
sein). Keine fremde Historie umschreiben. Keine Geheimnisse einchecken.

## §5 Miete / Betrieb (Kosten)

Eine Datei im Repo ist kein laufender Dienst. **Ohne diese drei Punkte wird
nichts gemietet:**

1. Eintrag in `docs/betrieb-INSTANZ.md` (Name, Zweck, Preis pro Stunde, Besitzer).
2. Eine Abschaltung, die ohne Zutun greift (Idle-Bremse: `scripts/betrieb/idle-watch.sh`
   mit systemd-Timer).
3. Der Nachweis, dass sie läuft: die Ausgabe von `systemctl list-timers` vom
   Knoten, eingetragen in `docs/betrieb-INSTANZ.md`, Abschnitt 3.

Ein Agent mietet, erstellt oder startet **nie** selbst Server, Instanzen oder
andere kostenpflichtige Ressourcen; das entscheidet der Auftraggeber.

## §6 Daten und Sicherheit

Der Server vertraut dem Client nie: Eingaben werden validiert, Nachrichten sind
größenbegrenzt, Socket-Fehler werden abgefangen. Der Client berechnet nichts
Autoritatives.

## §7 Kosten-Obergrenze

Vor jedem Lauf auf gemieteter Hardware stehen in `docs/betrieb-INSTANZ.md`:
Preis pro Stunde, Höchstdauer und Worst Case (= Preis/h × Höchstdauer). Ohne
diese Rechnung wird nicht gestartet. Zusätzlich braucht der Lauf eine zweite,
unabhängige Frist außerhalb des Knotens. Preise und Besitzer legt der
Auftraggeber fest; sie werden nie geschätzt oder erfunden.
