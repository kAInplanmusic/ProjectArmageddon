# Kontrollfluss: Matchstart und Wiederverbindung (A4)

**Stand:** 2026-11-09 · **Gebiet:** `src/server/gameServer.js`,
`src/server/lobby.js`, `src/server/lobbySession.js`, `src/shared/protocol.js` ·
**Prüfung:** `tests/server-kontrollfluss-a4.test.js` (10 Fälle am echten Server)

Diese Datei beschreibt, was der Server **tatsächlich** tut — nicht, was ein
Kommentar verspricht. Sie ist die Grundlage für die drei offenen Punkte RT-2,
B-9a und NET-1 aus `docs/TODO.md`.

Anker sind Namen, keine Zeilennummern (die wandern):

| Aufgabe | Stelle |
|---|---|
| Start-Gate (einziger Aufruf von `LobbySession#start`) | `GameServer#starteMatchFallsVoll` |
| Beitritt / Fortsetzen | `case CONTROL.JOIN_LOBBY`, `case CONTROL.RESUME` in `GameServer#nachrichtBehandeln` |
| Trennung | Socket-`close`-Zuhörer in `GameServer#handleConnection` |
| Platzverwaltung | `LobbyManager#join`, `#resume`, `#disconnect`, `#pruneDisconnected` |

---

## 1. Wie ein Match startet

Es gibt genau **eine** Startstelle: `#starteMatchFallsVoll(lobbyId, session)`.
Sie prüft

1. `LobbyManager#alleTeamsBesetzt` — jedes Team hat einen Platz mit `token` und
   `connected === true`, und
2. `!session.laeuft` — die Sitzung tickt noch nicht.

Nur dann ruft sie `session.start()` und `LobbyManager#markRunning` (Status
`running`). Sie wird an drei Stellen aufgerufen:

| Weg | Auslöser | Was danach passiert |
|---|---|---|
| **Auto-Start beim Beitritt** | `JOIN_LOBBY` des letzten fehlenden Menschen | Start **vor** `session.attach`; der letzte Beitretende liest deshalb `laeuft: true` (Befund 3, behoben). |
| **Auto-Start beim Fortsetzen** | `RESUME` des letzten fehlenden Menschen (z. B. nach Neuladen) | gleicher Start, danach `attach`, `WELCOME`, Vollsnapshot. |
| **`CONTROL.START_MATCH`** | ausdrückliche Steuernachricht | Sitzung muss existieren; sonst `ERROR` „Keine aktive Sitzung". Ist das Gate falsch und die Sitzung läuft nicht: `ERROR` „Warte auf Mitspieler …". Läuft die Sitzung bereits: `markRunning` + `broadcastSnapshot` — **folgenlos**, kein Neustart, keine zweite Sitzung. |

### Befund RT-2: `START_MATCH` ist im Livebetrieb unerreichbar

Kein Client sendet `CONTROL.START_MATCH` — geprüft über alle Dateien unter
`src/client` in `tests/server-kontrollfluss-a4.test.js`. Der einzige Live-Weg
ist der Auto-Start beim letzten Beitritt. Der Server-Zweig ist trotzdem
funktionsfähig und getestet; er ist die Schnittstelle für künftige Oberflächen
(„Match starten"-Knopf) und für Werkzeuge.

Weitere gemessene Eigenschaften des Zweigs:

* **Keine Host-Prüfung**: Jeder Teilnehmer der Lobby darf ihn senden. Das ist
  heute ohne Wirkung (das Match läuft schon), wäre bei einer künftigen
  Oberfläche aber eine Berechtigungsfrage.
* **Idempotent**: Ein zweiter Aufruf setzt weder Runde noch Tick zurück und
  erzeugt keine neue Sitzung; beide Clients erhalten weiter Zustände.
* **Bei unvollständigen Teams**: Ablehnung, Lobby bleibt `open`, Simulation
  bleibt stehen, kein Snapshot.

---

## 2. Wiederverbindung

Es gibt zwei Schlüssel (RT-1, `docs/fortsetzen-nach-neuladen.md`):

| Schlüssel | Woher | Wofür | Lebensdauer |
|---|---|---|---|
| `token` (UUID) | `WELCOME.token` | Identität des Platzes, alle Spielkommandos | solange der Platz existiert |
| `resumeToken` (32 Hex) | `WELCOME.resumeToken` | Wiedereinstieg nach Neuladen (`CONTROL.RESUME`) | bis Match-Ende/Abbruch oder Platzverfall |

### Ablauf beim Trennen

Der Socket-`close`-Zuhörer:

1. prüft, ob der Token inzwischen einem **neueren** Socket gehört (dann ist das
   `close` veraltet und wird ignoriert),
2. `session.detach(token)` — nur die Sendebindung,
3. `LobbyManager#disconnect` — alle Plätze des Tokens werden `connected: false`
   mit `disconnectedAt`; die Plätze und der `resumeToken` **bleiben**,
4. `session.broadcastLobbyState()` (B-9) — die Verbliebenen bekommen einen
   `lobby_state` mit kleinerem `besetzteTeams`,
5. sind **alle** Plätze getrennt, `session.stop()`; die Sitzung bleibt
   registriert und wartet auf Rückkehrer.

### Ablauf beim Zurückkommen

Beide Wege laufen in derselben Reihenfolge:

`#bisherigenPlatzLoesen` (alte Bindung des Sockets lösen) → `pruneLobbies()`
(abgelaufene Fenster wirklich ungültig machen) → Platz suchen → Sitzung
sicherstellen → `#starteMatchFallsVoll` → `session.attach` → `WELCOME` →
Vollsnapshot.

| Weg | Nachricht | Platzsuche | Ergebnis |
|---|---|---|---|
| **RESUME** | `{token: resumeToken, lobbyId?}` | `LobbyManager#resume` über alle Lobbys | WELCOME `resumed: true`, gleicher Platz/Figur, erneut `resumeToken`, erster Snapshot ist voll |
| **Altweg JOIN** | `JOIN_LOBBY` mit `token` | `LobbyManager#join` findet vorhandene Plätze | WELCOME `resumed: true`, gleicher Platz, **kein** zweiter Platz |

Der Token-Zweig in `join` steht **vor** der Statusprüfung. Deshalb funktioniert
die Wiederverbindung auch in einer `running`-Lobby. Innerhalb des
Reconnect-Fensters (Vorgabe 30 s) gilt:

* derselbe Platz, dieselbe `entityId`, dieselben Figuren;
* die Simulation läuft unverändert weiter (kein Rücksetzen von Runde/Tick);
* die Zahl der Plätze ändert sich nicht;
* ein veralteter Socket kann den neuen nicht mehr trennen (`close` wird an der
  neueren Bindung erkannt).

### Nach dem Reconnect-Fenster (RT-2)

`pruneDisconnected` entfernt das Team aus `lobby.seats`. Damit ist der Platz
frei — aber:

* `RESUME` mit dem alten `resumeToken` scheitert mit `RESUME_FAILED`,
  `grund: "unbekannt"`;
* `JOIN_LOBBY` mit dem alten Platz-Token oder ohne Token scheitert mit
  `ERROR` „Lobby nimmt keine Spieler mehr auf", weil die Lobby `running` ist.

**Das Versprechen „die Lobby nimmt wieder einen Menschen auf" gilt also nur für
eine Lobby in `open` (Wartephase), nicht für ein laufendes Match.** Beide
Startwege setzen seit SRV-3 `running`. Der freie Platz bleibt bis zum
Match-Ende unbesetzbar; für den Getrennten zieht niemand (keine Bot-KI), sein
Zug läuft über die Zugzeit ab.

### Nach dem Match-Ende

`#finish` → `onEmpty` löscht die Sitzung und entwertet alle `resumeToken`. Der
Platz-Token bleibt. Ein `JOIN_LOBBY` mit Token legt deshalb eine **neue**
Sitzung an; die Lobby wird von `finished` auf `running` nachgezogen (W5) und
startet, sobald alle Teams nach Lobby-Sicht besetzt sind.

**Gemessene Lücke (offen):** Bleibt der Gegner mit offenem Socket verbunden,
wird er nicht an die neue Sitzung gebunden. Die Lobby hält seinen Platz für
`connected` (deshalb startet das Match überhaupt), aber die neue Sitzung kennt
nur den Wiederverbinder — der Gegner bekommt keine Snapshots mehr und bleibt auf
dem Endbildschirm stehen. Eine Reparatur müsste dem Gegner einen Match-Neustart
mit Karte/Startanzeige erklären (Client-Änderung) oder den Auto-Start verhindern
(Produktentscheidung). In A4 bewusst nur festgehalten, nicht geändert.

### Serverneustart

`resumeToken` wird nicht gesichert. Wiederhergestellte Plätze stehen auf
`connected: false`; die Sitzung tickt nicht, bis jedes Team wieder einen
verbundenen Menschen hat. Der Client fällt von `RESUME` (`unbekannt`) auf
`JOIN_LOBBY` mit dem Platz-Token zurück.

---

## 3. Die drei offenen Punkte — was sie trennt

### RT-2 — Start/Beitritt und das „nimmt wieder einen auf"

Gemessen (2026-11-09):

* `START_MATCH` wird von keinem Client gesendet; Live-Start = Auto-Start.
* Beide Startwege enden in `running`; nach dem Reconnect-Fenster ist der Platz
  frei, aber unbesetzbar (siehe oben).
* Reconnect nach Match-Ende startet ein neues Match, lässt einen weiter
  verbundenen Gegner aber ohne Sitzungsbindung zurück.

**Keine Protokolländerung nötig.** Nötig ist eine Produktentscheidung:
Lobby-Status während des Matches (`open`/`running`), Reservierung des Platzes
oder ein bewusstes „Match ohne Gegner läuft weiter". Dazu gehört
Oberflächenverhalten (Lobby-Browser, Wartehinweis), das A4 nicht entscheiden
darf.

### B-9a — „Gegner getrennt" auf der Leitung

B-9 ist erledigt: `broadcastLobbyState()` nach `disconnect` schickt den
Verbliebenen sofort einen `lobby_state`. Was fehlt, ist ein **Merkmal je Platz**:
der Zustand trägt `besetzteTeams`, aber weder `seats` noch `connected` je Platz,
und der Client wertet ihn mitten im Match nicht als Verbindungsanzeige aus.
Zusätzlich ist der Kanal nur geliehen: Der `lobby_state`-Zuhörer in
`src/client/main.js` setzt `remoteMinen` aus dem Snapshot neu und `remoteSeil`
auf `null` — eine mitten im Match eintreffende Anwesenheitsmeldung kann also
Darstellungszustand zurücksetzen.

**Was eine Änderung bräuchte:** ein Feld in `LOBBY_STATE` (z. B.
`seats: [{seatIndex, connected}]` oder `getrennt: [seatIndex]`) **oder** eine
eigene JSON-Steuernachricht, plus einen Client-Zweig für die Anzeige. Das ändert
kein Byte des binären Snapshots und braucht nach derselben Begründung wie RT-1
keine neue `PROTOCOL_VERSION`; es ist trotzdem eine Protokoll- **und**
Clientänderung und in A4 gesperrt.

### NET-1 — `match_over` nur auf PING

Nach `#finish` sendet die Sitzung genau einmal `match_over` und stoppt. Die
Wiederholung lebt ausschließlich im `CONTROL.PING`-Zweig (`#beendeteMatches`
bzw. der Live-Zustand einer neuen Sitzung). Ohne PING kommt **nichts**; der
Client pingt alle 2 s (`NetworkClient.startPing`), daraus folgt der bekannte
Verzug von höchstens 2 s. Der Zustands-Pin in
`tests/server-kontrollfluss-a4.test.js` misst beides: 2,2 s ohne PING → keine
weitere Meldung; danach PING → dieselbe Antwort erneut.

**Was eine Änderung bräuchte:** eine serverseitige Wiederholung mit Bestätigung
(neuer Steuernachricht-Typ + Client-ACK) oder ein Zustandsfeld im Snapshot
(Änderung am Binärformat → `PROTOCOL_VERSION`). Beides ist eine
Protokollerweiterung und war nicht Auftrag.

---

## 4. Prüfungen

`tests/server-kontrollfluss-a4.test.js` (10 Fälle, echter Server):

| Fall | Aussage |
|---|---|
| 1 | `START_MATCH` ohne Sitzung → `ERROR` „Keine aktive Sitzung", kein Zustand |
| 2 | `START_MATCH` bei 2/3 Teams → Ablehnung, Status bleibt `open`, kein Snapshot |
| 3 | `START_MATCH` nach Auto-Start → kein Fehler, gleiche Sitzung, kein Rücksetzen, Tick läuft weiter (auch vom zweiten Teilnehmer) |
| 4 | Quelltext-Wächter: kein Client sendet `START_MATCH` (RT-2) |
| 5 | Trennung im laufenden Match → `lobby_state` beim Gegner, `besetzteTeams` sinkt, Platz reserviert, Simulation läuft; **kein** Platzmerkmal (B-9a) |
| 6 | `RESUME` im laufenden Match → gleicher Platz, Vollsnapshot, Tick läuft weiter, beide Token gebunden |
| 7 | `JOIN_LOBBY` + `token` im laufenden Match → gleicher Platz, kein dritter Platz |
| 8 | ZUSTANDS-PIN RT-2: nach 150-ms-Fenster Platz verfallen, laufende Lobby weist alten Token und Nachrücker ab |
| 9 | ZUSTANDS-PIN (offen): Reconnect nach Match-Ende startet Runde 1, bindet den weiter verbundenen Gegner aber nicht (keine Snapshots für ihn) |
| 10 | ZUSTANDS-PIN NET-1: `match_over` nur auf PING, nicht von selbst |

Ergänzend: `tests/resume-platz.test.js` (RT-1-Detailfälle),
`tests/server-beitritt-und-trennung.test.js` (Startreihenfolge, B-9-Broadcast),
`tests/server-integration.test.js` (PING-Wiederholung, Revanche nach Ende).
