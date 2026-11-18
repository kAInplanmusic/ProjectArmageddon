# Übergabe an den nächsten Agenten (Stand 2026-11-18)

Dieses Dokument ist für einen Agenten gedacht, der die Arbeit ohne Vorwissen übernimmt. Lies zuerst `AGENTS.md`
(Regeln, Determinismus, Versionsmarken, Prüfschritte), dann diesen Text. Der Auftraggeber ist der Nutzer; Antworten
an ihn sind auf Deutsch. Vor Freigaben (Balance-Werte, Merges kritischer Änderungen) fragst du ihn.

## 1. Wo stehen wir

### Fertig und gemergt (main)

| PR | Inhalt | Versionsmarke |
|---|---|---|
| #25 | QV-7: Matchstart beschleunigt (Erreichbarkeitsflächen), Messskripte | — |
| #26 | QV-5: Monolithen abgebaut (`main.js` 3713, `renderer.js` 2218 Zeilen) | — |
| #27 | QV-6 Welle 1 A: Strömung in duenen, riff, tiefsee | `biomregeln` 2 |
| #28 | QV-6 Welle 1 B: Schwerkraft in kosmos, planet (alle Arten), schwebinseln, surreal | `biomregeln` 3 |
| #29 | Balance je Rolle neu gemessen (nur Doku) | — |
| #30 | QV-6 Welle 2 E: Gefahrenwasser (Lava 16, Gift 13, Säure 13, Leere 11, Schlamm 14 LP/s) | `biomregeln` 4 |

QV-4 (Spieltest mit Menschen) ist NICHT erfolgt und liegt beim Auftraggeber.

### Offen auf Branch `claude/qv6-wasser-stroemung` (NICHT committet)

Wasserlauf, Biomregel-Fassung 5 (Standard). Stand:

- `src/engine/waterField.js`: `stepAktiv()` rechnet nur im wachen Fenster; `displace()` weckt das Fenster selbst
  (explosion.js ruft displace bereits); `flussAn(x,y)` liefert die seitliche Strömung des letzten Schritts; `step()`
  bleibt unverändert (Fassung 4 und älter).
- `src/engine/match.js`: `#wasserlauf` aus `wasserlaufAktiv(biomregeln)`; `stepAktiv()` vor `world.step()`;
  `services.match.wasserSchub` (0 vor Fassung 5).
- `src/engine/systems/characterSystem.js`: Strömung schiebt Figuren mit `flussAn * wasserSchub`.
- `src/shared/config/biomregeln.js`: `BIOMREGELN_WASSERLAUF = 5` (Standard), `WASSERLAUF` {schub 0,6}, `wasserlaufAktiv`.
- `src/client/biomregelAnzeige.js`: Hinweis „Wasserlauf: …" im Protokoll ab Fassung 5.
- Tests: `tests/biomregeln-wasserlauf.test.js` (6 Tests, grün); `tests/biomregeln.test.js` und
  `tests/biomregeln-wasser.test.js` auf Standard 5 angepasst.
- Vor dem Commit offen: vollständiger `npm test`-Lauf (lief beim Übergeben noch, Stand ~2400/3125 ohne Fehler),
  Kontrollmessung Fassung 4 gegen 5, Eintrag in `docs/TODO.md`, Commit, PR, CI.

Hinweis zu Fehlern: Der frühere Fehlschlag in `tests/replay-waffenwahl.test.js` tritt nur beim Einzelaufruf auf.
AGENTS.md §3 verlangt `PA_ZUGPAUSE_SEKUNDEN=0`; `npm test` setzt das. Mit der Variable ist der Test grün.

## 2. Fahrplan (Reihenfolge)

1. **Wasserlauf abschließen** (Abschnitt 1, Branch oben): Suite, Messung, TODO, Commit, PR, CI, Merge.
2. **Wasserlauf-Ausbau** (Grundwasser-Physik, Vorgaben des Nutzers, 2026-11-18):
   - Flaches Wasser schiebt Figuren in Fließrichtung und ertränkt nicht; tiefes Wasser ertränkt wie bisher.
   - Fließrichtung und Schub auch für Kisten und Fässer (Bodenobjekte), nicht nur für Figuren.
   - Würmer (als Spielfiguren oder Bodenobjekte) werden vom Wasser weggespült oder an Hindernisse gedrückt.
   - Sprengung als Spielzug: Damm sprengen, Wasser umleiten (bereits durch Fenster und displace möglich, nicht getestet).
   - Vor dem Ausbau Schub-Stärke messen (`balance:biome`-Muster), nicht schätzen.
3. **Karten-Ausstattung**: Seen in Höhlen oder auf Inseln, kleine Wasserfälle. Kartengenerierung, betrifft Startzeit
   (QV-7) und Erreichbarkeitsprüfung. Erst nach Schritt 2.
4. **QV-6 Welle 2 Teil F**: Bodenobjekte nach Biom (schrott, fabrik, dschungel, pilzwald, tempelstadt). Daten
   vorhanden: `BODENOBJEKTE_BIOM` in `src/shared/config/bodenobjekte.js`.
5. **QV-6 Welle 3**: C Bodenwirkung (Eis, Schlacke, Sumpf: Reibung und Gehtempo; berührt Bewegung und Replay-Hash,
   höchstes Regressionsrisiko) und D Splitter/Kettenreaktion (Kristalle, Burg, Dimensionsriss).
6. **Balance**: Alle Werte (Schwerkraft 0,6 bis 0,85, surreal 0,7 bis 1,3, Strömung 0,5/0,35/0,5, Gefahrenwasser,
   Wasserlauf-Schub) sind ERSTE ANSÄTZE. Jede Änderung braucht eine Messung (`npm run balance:biome`,
   `node scripts/balance-rollen.mjs --stufe=standard`) und eine Freigabe.
7. **QV-4**: Spieltest mit Menschen. Sichtabnahme der Hinweiszeilen und des Windpfeils, Lesbarkeit der Wasserregeln.

## 3. Regeln, die man nicht verletzt

- **Versionsmarken** (AGENTS.md §2): Jede Regel, die Replays verändert, bekommt eine neue Fassung im Replay-Kopf
  (`config.biomregeln`). Fassungen 1 bis n bleiben bitgleich. Der Standard für neue Partien ist die neueste Fassung.
- **Menü und Messung teilen eine Liste**: `MENUE_FASSUNGEN` in `src/shared/config/menueStart.js`. Neue Fassungen dort
  eintragen, sonst messen die Bots mit Altregeln (das war der Fund vom 2026-11-18).
- **Ereigniskatalog**: `src/shared/ereigniskatalog.js` nennt Zeilen in `main.js`/`renderer.js`. Bei Zeilenverschiebung
  nachziehen (Test `event-coverage`). Zeilenbudgets: `tests/zeilenbudget.test.js`.
- **Quelle der Schussberechnung**: `#schussQuelle()` in `match.js` gibt jeden Wert weiter, den `shooting.js` liest.
  Neue Werte (z. B. `schwerkraft`) dort eintragen, sonst fehlen sie stillschweigend (so passiert bei Fassung 3).
- **Events sind gepuffert**: `EventBus.emit` stellt nicht sofort zu, nur `drain()`/`dispatch()`. Wer auf Ereignisse
  reagiert, muss das wissen (Fund beim Wasserlauf).
- **Prüfen vor Übergabe**: `npm test`, `npx eslint .`, `npm run check:docs`. Bei Doku-Änderungen Testzahlen nicht von Hand.
- **Merge**: Nur nach grüner CI (Lint/Tests/Build, Balance, 4 Browser-Teile). Merge über `gh api -X PUT
  repos/kAInplanmusic/ProjectArmageddon/pulls/N/merge -f merge_method=squash` (GraphQL ist für `gh pr` gesperrt;
  PRs mit `gh api repos/.../pulls -f title=… -f head=… -f base=main -f body=…`).
- **Commit-Trailer**: Ab 2026-11-18 lautet die Zeile `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`,
  gefolgt von `Claude-Session: https://claude.ai/code/session_01AVWAnddTBzDFEBgouvPDj2`. PR-Text endet mit
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)` und derselben Session-Zeile.

## 4. Bekannte Fakten und Fallen

- Das Wasserfeld wurde im Spiel bis Fassung 4 NIE weitergerechnet (kein Aufruf von `step()`). Wasser stand still,
  außer ein Einschlag verdrängte es. Mit Fassung 5 läuft es nur im Fenster der Bewegung.
- `hazard` in `config/scenery.js` war nur beschriftet, ohne Leser. Fassung 4 setzt die Werte in `WASSER_SCHADEN`
  (nicht in `hazard`). Treibsand (`quicksand`) wirkt weiter nicht.
- Testkarten im Menü (`neuesMatch`, Format 24:9 groß) sind 4704×1764; `new MatchController` mit Standard-Format
  (2560×1440) hatte in den Tests kein Wasser. Für Wassertests `neuesMatch` aus `scripts/bot-partien.mjs` nutzen.
- `neuesMatch` liefert ohne `m.start()` einen Zustand ohne Wasserfeld-Stand; vorher `status` prüfen.
- Balance-Berichte: Nur `docs/balance-rollen-2026-11-18.md` und `docs/biom-wirkung-2026-11-18.md` beruhen auf den
  Menü-Regeln. `2026-11-12` und `2026-11-17` (außer dem Überholt-Hinweis) sind mit Altregeln gemessen.
- Okkultist-Vorsprung (69 %) bleibt bestehen; die Zahl ist aus 36 Partien je Rolle, Wilson-Intervall beachten.
- Die Erreichbarkeitsprüfung der Karte (`pruefeErreichbarkeit`) rechnet die Schwerkraft mit Faktor 1. Bei Faktor
  1,3 (surreal) wird sie etwas zu optimistisch, bei 0,6 zu vorsichtig. Das ist offen.
- Die Kontrollmessungen laufen über `/tmp`-Skripte (nicht im Repo). Das Muster steht in `docs/biom-wirkung-2026-11-18.md`:
  zwei Fassungen mit gleichem Seed und Biom, Verlaufsschlüssel „Züge/Schüsse/Treffer/Schaden/Sieger/Tick" vergleichen.

## 5. Dateien, die man kennen muss

| Thema | Datei |
|---|---|
| Biomregeln (Versionen, Strömung, Schwerkraft, Gefahrenwasser, Wasserlauf) | `src/shared/config/biomregeln.js` |
| Wasserfeld (Schritt, Fenster, Strömung, Verdrängung) | `src/engine/waterField.js` |
| Match (Wasserlauf-Verdrahtung, Schussquelle, Wind) | `src/engine/match.js` |
| Figuren im Wasser (Ertrinken, Strömung) | `src/engine/systems/characterSystem.js` |
| Geschoss-Schwerkraft | `src/shared/ballistics.js`, `src/engine/systems/projectileSystem.js` |
| Hinweise im Spiel | `src/client/biomregelAnzeige.js` |
| Menü-Fassungen (gemeinsam mit Messung) | `src/shared/config/menueStart.js` |
| Wasserarten und Szenen | `src/shared/config/scenery.js`, `src/shared/config/biome-*.js` |
| Bodenobjekte | `src/shared/config/bodenobjekte.js`, `src/engine/systems/bodenobjektSystem.js` |
| Messung Biome | `scripts/biom-wirkung.mjs` (`npm run balance:biome`) |
| Messung Rollen | `scripts/balance-rollen.mjs` |
| Duelle für Kontrollmessungen | `scripts/bot-partien.mjs` (`neuesMatch`, `spiele`) |
| Entwurf QV-6 | Projekt-Dokument `claude/qv6-biom-regeln-entwurf-2026-11-18.md` |
| Aufgabenliste | `docs/TODO.md` (Zeile QV-6) |

## 6. Nächster Schritt für den Übernehmenden

Branch `claude/qv6-wasser-stroemung` öffnen, `npm test` mit `PA_ZUGPAUSE_SEKUNDEN=0` (über `npm test` automatisch)
laufen lassen, Wasserlauf-Kontrollmessung (Fassung 4 gegen 5, Biome mit Wasser: klassisch, vulkan, riff, tiefsee)
ausführen, Ergebnis in `docs/biom-wirkung-2026-11-18.md` ergänzen, dann committen und PR öffnen.
