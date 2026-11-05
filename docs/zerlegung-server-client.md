# Zerlegung: Server und Client (2026-11-05)

Zwei Dateien rissen am 2026-11-05 ihr Zeilenbudget (`tests/zeilenbudget.test.js`,
`AGENTS.md` §3). Beide wurden zerlegt, ohne eine Regel, ein Verhalten oder eine
Ausgabe zu ändern. Die Belege sind die unveränderten Tests, nicht die Absicht.

## Server: `gameServer.js` → `lobbySession.js`

`src/server/gameServer.js` stand bei **3368** Zeilen (Budget 3000). Der Schnitt
liegt zwischen der Sitzung EINER Lobby und dem Server als Ganzem:

| Datei | Zeilen | Inhalt |
| :-- | --: | :-- |
| `src/server/gameServer.js` | 2011 | HTTP/WebSocket, Lobby-Verwaltung, Konten, Start |
| `src/server/lobbySession.js` | 1403 | `LobbySession`: Tick-Schleife, Snapshots (Delta und Voll), Eingabeprüfung je Sitz, Munitions-/Loadout-Tabelle, Match-Ende, Sicherung (`toPersisted`) und Wiederaufbau |

Mit umgezogen sind die Konstanten, die nur für die Sitzung gelten (Zugpause,
Snapshot-Rate und -Intervall, Munitionsvermerk, Dedup-Arten) sowie
`kartenFelder()` und `SNAPSHOT_HZ`.

Schnittstelle: `gameServer.js` importiert `LobbySession` und `kartenFelder` und
**re-exportiert** `LobbySession` und `SNAPSHOT_HZ`. `src/server/index.js` und alle
Tests importieren unverändert aus `gameServer.js`. `lobbySession.js` importiert
`gameServer.js` nicht — kein Zyklus.

Zwei Quelltext-Wächter lesen die Server-Seite seitdem aus **beiden** Dateien
(`tests/audit-2026-10-09-fixes.test.js`, `tests/event-coverage.test.js`): Sie
prüfen Verhalten, nicht den Dateinamen; die Aussagen selbst sind unverändert.

## Client: `main.js` → vier Menü-Module

`src/client/main.js` stand bei **4137** Zeilen (Budget 4000). Ausgezogen sind
vier abgegrenzte Bereiche:

| Datei | Zeilen | Inhalt |
| :-- | --: | :-- |
| `src/client/main.js` | 3993 | Spielablauf, Rendern, Eingaben, Verdrahtung |
| `src/client/kontoMenue.js` | 181 | Formular Anmelden/Registrieren, Abmelden, Konto löschen, Rangliste |
| `src/client/sitzung.js` | 211 | Sitzungsablage im `sessionStorage`, Platz- und Fortsetzungs-Token, Fortsetzen-Knopf und der Versuch nach einem Neuladen (RT-1) |
| `src/client/replayBedienung.js` | 80 | Replay-Steuerung: Dateiauswahl, Knöpfe, Tempo, Stellenregler |
| `src/client/profilSicherung.js` | 53 | Export und Import der Profildatei (nur die Knopf-Verdrahtung) |

`konto.js` (168 Zeilen) behält Netz und Sitzungslesen; die Menü-Verdrahtung liegt
in `kontoMenue.js`. Jedes neue Modul hat einen Kopfkommentar mit Zweck, Grund des
Auszugs und dem, was es ausdrücklich NICHT tut (rechnen, entscheiden).

Dazu ein Befund, der beim Auszug auffiel: Die Fortsetzen-Ablehnung
(`Fortsetzen nicht möglich … — normaler Beitritt`) schrieb mit `warn` und landete
damit im Rauschbudget des HUD. Sie schreibt jetzt `notice`
(`docs/hud-vorrang.md` §3), und `tests/hud-ablehnung-ton.test.js` liest
`sitzung.js` mit — sonst wäre die Stelle aus dem Wächter herausgefallen.

## Was bewusst blieb

- Die Tick-Schleife bleibt im Serverprozess; es gibt keinen zweiten Takt.
- `main.js` behält `profilSichern`/`profilLaden` (die Regel) — das Modul verdrahtet
  nur die Knöpfe.
- Kein Modul importiert `main.js` zurück.

## Beleg

`npm test` (Unit), `npm run check:docs`, `eslint` grün; die Zeilenbudgets werden
von `tests/zeilenbudget.test.js` gehalten. Die Zerlegung selbst ist in drei
Commits getrennt (Server, Motor/Kartenmaße, Client) und jeweils einzeln geprüft.
