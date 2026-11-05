# Fortsetzen nach Neuladen (RT-1)

*Stand: 2026-11-05. Umsetzung von `CONTROL.RESUME`; Entscheidung des Auftraggebers:
„Bauen" (`docs/plan-produktion.md` Abschnitt 1).*

## Das Problem

Der Sitzplatz eines Menschen hing an einem Token, der nur im Tab lebte. Ein
versehentliches Neuladen verlor den Platz: Der Server hielt ihn noch für das
Reconnect-Fenster (30 s), der Client kannte seinen Schlüssel aber nicht mehr.
`CONTROL.RESUME` war im Protokoll deklariert und nie implementiert.

## Zwei Schlüssel, zwei Aufgaben

| Feld | Wo | Zweck | Lebensdauer |
|---|---|---|---|
| `token` (UUID) | `WELCOME.token` | Identität des Platzes. Jedes Spielkommando (`input`, `jump`, `move`, …) wird darüber zugeordnet. | solange der Platz existiert (bis `pruneDisconnected` ihn verfallen lässt) |
| `resumeToken` (32 Hex, `randomBytes(16)`) | `WELCOME.resumeToken` | Schlüssel zum Wiedereinstieg nach einem Neuladen. | bis Match-Ende/Abbruch oder bis der Platz verfällt |

Der Fortsetzungs-Token verlässt den Server **nur** im `WELCOME` am eigenen
Socket — nicht in `describe()`, nicht in der HTTP-Antwort von
`POST /api/lobby/create`. `#antwort` in `src/server/lobby.js` zieht ihn
ausdrücklich ab.

## Ablauf

1. **Beitritt** (`JOIN_LOBBY`): Der Server legt je Sitzplatz einen
   `resumeToken` an und schickt ihn im `WELCOME`. Der Client legt
   `{serverUrl, lobbyId, token, resumeToken, name, zeit}` in `sessionStorage`
   ab (`src/client/main.js`).
2. **Neuladen**: Beim Laden steht die Sitzung noch im `sessionStorage` (er lebt
   so lange wie der Tab). Der Client verbindet sich automatisch und sendet
   direkt nach `HELLO` **`CONTROL.RESUME {token, lobbyId}`** — statt
   `JOIN_LOBBY`.
3. **Server** (`src/server/gameServer.js`, `case CONTROL.RESUME`):
   Verwaltungsrunde (`pruneLobbies`, damit ein abgelaufenes Fenster wirklich
   ungültig ist) → Token suchen (`LobbyManager#resume`) → neuen Socket an den
   BESTEHENDEN Platz binden (`session.attach`) → `WELCOME` mit `resumed: true`
   und erneutem `resumeToken` → sofort ein Vollsnapshot.
   Der Zug ist unberührt: kein Platz entsteht, keiner fällt weg, die Simulation
   bekommt von dem Vorgang nichts mit.
4. **Rückfall**: Wird der Token abgelehnt (`RESUME_FAILED`), entscheidet der
   Client nach `grund`:
   - `unbekannt` (abgelaufen, fremd, nach Serverneustart verloren) und
     `ungueltig` (Formfehler): normaler Beitritt (`JOIN_LOBBY`) mit dem
     bekannten Platz-Token, falls vorhanden. Kein zweiter Platz.
   - `beendet` (Match entschieden oder abgebrochen): kein Beitritt; der Client
     vergisst die Sitzung und geht ins Menü. Eine Revanche soll niemand
     ungefragt beginnen.

## Verhalten bei Trennung und Verlassen

- **Trennung (Netz, Reload, Tab zu)**: Der Server entwertet NICHTS. Der Platz
  bleibt für das Reconnect-Fenster (`LobbyManager`, 30 s) reserviert; innerhalb
  dieser Zeit holt `RESUME` ihn zurück. Danach lässt `pruneDisconnected` den
  Platz verfallen — mit ihm den `resumeToken`, der dann als `unbekannt`
  abgelehnt wird.
- **Bewusstes Verlassen** („Match verlassen" im ⚙-Menü, `R`): Der Client löscht
  die gespeicherte Sitzung (`#vergesseSitzung`). Serverseitig sieht ein
  bewusstes Schließen wie eine Trennung aus — es gibt keine `LEAVE`-Nachricht
  und darf auch keine geben, denn der Server muss den Platz für ein Neuladen
  offen halten. Der Platz verfällt deshalb erst mit dem Reconnect-Fenster.
- **Match-Ende/Abbruch**: `#sitzungBeendet` entwertet alle `resumeToken` der
  Lobby. Der Platz und sein `token` bleiben stehen — eine Revanche über
  `JOIN_LOBBY` mit Token ist weiter möglich, ein Fortsetzen des entschiedenen
  Matches nicht.
- **Serverneustart**: `resumeToken` wird nicht gesichert (`persistence.js`).
  Ein Fortsetzen schlägt dann mit `unbekannt` fehl; der Client fällt auf
  `JOIN_LOBBY` mit dem Platz-Token zurück und kommt in denselben Platz, sobald
  die wiederhergestellte Lobby ihn annimmt.

## Drahtformat

`PROTOCOL_VERSION` bleibt **9**. `RESUME`/`RESUME_FAILED` sind JSON-
Steuernachrichten, `resumeToken` ist ein zusätzliches Feld im `WELCOME`; kein
Byte des binären Snapshots ändert sich. Eine ältere Gegenstelle verwirft den
unbekannten Typ still und liest das Feld nicht — alte Aufzeichnungen laufen
unverändert (AGENTS.md §2). Die Begründung steht auch an `CONTROL.RESUME` in
`src/shared/protocol.js`.

## Prüfung

`tests/resume-platz.test.js` (9 Fälle, echter Server und echter `NetworkClient`): Token-Vergabe (32 Hex,
je Platz verschieden, nicht der Platz-Token, nicht in der Lobby-Beschreibung),
Fortsetzen mit sofortigem Vollsnapshot und unverändertem Zug, Fortsetzen in der
Wartephase, Ablehnung `unbekannt` ohne Platzbelegung, Formfehler `ungueltig`,
Entwertung am Match-Ende (`beendet`), zweimaliges Fortsetzen ohne zweiten Platz.
