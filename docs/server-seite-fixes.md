# Serverseite: vier Befunde, ihre Belege und was davon geändert wurde

**Stand:** 2026-09-27 · **Gebiet:** `src/server/**`, neue Testdateien, diese Datei.
`src/client/**`, `src/engine/**` und `src/shared/**` sind **nicht** angefasst worden.

**Anker-Regel:** Jede Fundstelle ist über ihren NAMEN benannt (Funktion, Konstante,
Nachrichtentyp). Zeilennummern sind **Momentaufnahmen** dieser Sitzung — vier andere
Arbeiter schreiben gleichzeitig in `src/`, jede Zahl wandert.

---

## Übersicht

| Befund | Gegenstand | Messwert | Urteil | Was passiert ist |
|---|---|---|---|---|
| 1 | `pruneDisconnected` wird nie gerufen | 0 Aufrufer in `src/` | **BEFUND** | Verwaltungsrunde + Aufruf im Beitrittspfad, 5 Tests |
| 1b (neu) | „Die Lobby nimmt wieder einen auf“ gilt nur auf EINEM Startweg | Status `open` gegen `running` | **offener Punkt** | gemessen + festgehalten, nicht entschieden (Punkt 5 unten) |
| 2 | Beim Trennen erfährt der Verbliebene nichts | 0 Meldungen in 1,2 s | **BEFUND, offen** | Belegt + Zustands-Pin; Fix gehört Client+Protokoll (fremdes Gebiet) |
| 3 | Letzter Beitretender liest „2/2 Teams besetzt“ | `laeuft=false` bei `besetzteTeams 2/2` | **BEFUND** | Reihenfolge `start` vor `attach`, 4 Tests |
| 4 (A-10) | Ablehnungen ohne Rückweg, Serverteil | 15 Stellen geprüft, **2 stumm** | **BEFUND (2 Stellen)** | Einheitliche Fehlernutzlast, HTTP-Fehlerweg, 9 Tests |
| Ordnung | `gameServer.js`: „282 Zeilen, 26 `this.`“ | Methodenmaß **281/26** ✅, aber 175 der 357 Zeilen sind **Kommentar** | **Zahl richtig, Umbau nicht erzwungen** | Vermessen + begründet *nicht* umgebaut |

---

## BEFUND 1 — `pruneDisconnected` wurde nie gerufen

### Messung (vor der Änderung)

```
$ grep -rn pruneDisconnected src/
src/server/lobby.js:446:   * verfällt sein Team (`pruneDisconnected`) und die Lobby nimmt wieder einen
src/server/lobby.js:462:  pruneDisconnected(now = Date.now()) {
```

Kein Aufrufer. Gerufen wurde die Methode nur in `tests/netcode.test.js` — durch einen
**direkten** Aufruf. Das ist der Unterschied zwischen „die Methode funktioniert“ und
„der Mechanismus wirkt“: Der Test belegt das erste, der Kommentar an
`LobbyManager#disconnect` verspricht das zweite.

### Gegenprobe (Sonde `/tmp/pa-sonde-123.mjs`, echter Server)

Ein Mensch verbindet sich, trennt sich, sein Platz wird künstlich zehn Minuten über das
Fenster (30 s) geschoben — und dann 2,5 s gewartet, ohne irgendetwas zu rufen:

```
Sitze (sollten verfallen sein): 1 (vorher 1)      ← der Platz steht noch
Alle getrennt: true
```

Der Platz bleibt. Und mit **Handaufruf** derselben Methode fällt er sofort:

```
pruneDisconnected(+60s) -> entfernt: [{lobbyId, token, name: 'B'}]
Sitze nachher: ["Host"]                     ← das Team ist wieder frei
```

Damit war die Ursache belegt und nicht vermutet: **die Methode wirkt, sie wird nur
nicht gerufen.** Die Folge für den Spieler („Alle 2 Teams sind besetzt — kein Platz
frei, auch zehn Minuten später") steht als Gegenprobe im Test: Sie gilt innerhalb des
Fensters — gemessen in `tests/server-lobby-verfall.test.js` — und fällt danach weg.

### Entscheidung: WIRKLICH rufen (nicht das Versprechen streichen)

Gestrichen wurde das Versprechen nicht, weil es eine echte Zusage über den
Reconnect-Weg ist — ein getrennter Mensch muss Platz machen, sonst ist die Lobby nach
einem Absturz dauerhaft voll. Verworfen wurde die zweite Variante („Fenster beim
Trennen ablaufen lassen“): Sie hätte den Wiederverbinder bestraft, für den das Fenster
gebaut ist.

Neu in `GameServer` (die EINE Stelle, die `pruneDisconnected` ruft):

* `pruneLobbies(now = Date.now())` — ruft `LobbyManager#pruneDisconnected`, meldet
  jeden verfallenen **Beitritt** einmal (`lobby_beitritt_verfallen`).
* `startPruning()` / `stopPruning()` — Zeitgeber, Vorgabe `PRUNE_INTERVAL_MS = 5 s`,
  `unref`t wie die Persistenz; `close()` räumt ihn ab.
* `startServer()` startet ihn — dort, wo `npm run server` ihn braucht.
* `JOIN_LOBBY` ruft ihn **vor** `#lobbies.join`, damit niemand bis zu 5 s auf einen
  fälligen Platz wartet.

**Zur Zeitwahl:** 5 s, nicht 1 s — die Runde läuft über wenige Lobbies und wenige
Plätze; die Entscheidung „frei oder nicht“ hängt nicht an ihr, weil der Beitritt selbst
nachzieht.

### Reichweite des Versprechens — nachgemessen, weil sie nicht überall gilt

Der Satz an `disconnect` hat ZWEI Teile. Teil 1 („sein Team verfällt“) gilt jetzt
überall. Teil 2 („und die Lobby nimmt wieder einen Menschen auf“) gilt nur, wenn die
Lobby danach noch „open“ ist — und das hängt am Startweg (gemessen, Sonde
`/tmp/pa-sonde-6.mjs`, Reconnect-Fenster 150 ms):

```
Start durch den letzten BEITRITT: Status open   → Nachrücker bekommt WELCOME,
                                                  entityIds [2] = die FIGUREN des Gegangenen
Start per START_MATCH:            Status running → Nachrücker: „Lobby nimmt keine Spieler
                                                  mehr auf“ — Team bleibt leer
```

Festgehalten in `tests/server-beitritt-und-trennung.test.js` (Zustands-Pin), begründet
als offener Punkt 5.

### Was ich verworfen habe (Begründung im Code, Abschnitt in `pruneLobbies`)

Eine zusätzliche Zeile, die eine Sitzung stoppt, wenn nach dem Verfall niemand mehr
verbunden ist, ist **wieder entfernt**: Ihr Fall ist nicht erreichbar. Ein Platz wird
nur verfallbar, wenn sein `close` ihn getrennt hat — und dieser Handler prüft bereits
„alle Plätze getrennt?“ und stoppt. Beim letzten `close` greift er. Eine Zeile, deren
Wirkung sich nicht vorführen lässt, ist toter Code, auch wenn sie gut gemeint ist.

### Test und Mutationsprobe

`tests/server-lobby-verfall.test.js` (5 Tests): die Verdrahtung über `startServer`,
der Beitrittspfad, die **Gegenprobe** (innerhalb des Fensters bleibt „Alle Teams sind
besetzt“ richtig), ein Beitrag mit drei Einheiten (einmal gemeldet, nicht dreimal),
`stopPruning`.

| Mutation (auf einer Kopie in `/tmp`) | Ergebnis |
|---|---|
| `server.startPruning()` aus `startServer` entfernt | **1 Test rot** (Verdrahtung) |
| `this.pruneLobbies()` aus `JOIN_LOBBY` entfernt | **1 Test rot** (Beitrittspfad) |

---

## BEFUND 2 — Beim Trennen erfährt der verbliebene Spieler nichts

### Urteil: BEFUND (bestätigt) — **nicht behoben**, weil der Fix fremdes Gebiet braucht

### Messung (echter Server, zwei Menschen, dann schließt einer)

```
Steuernachrichten an den Verbliebenen nach dem Trennen: 4  (nur "landed")
Snapshots an ihn weiterhin: +25 in 1,5 s
Lobby-Ansicht: occupied=2, connected=1
Sitze: [Host connected=true] [Zweiter connected=false]
```

Was ankommt, ist `landed` (reine Anzeige, vom Sendefilter zusammengefasst) und der
Zustandstakt. **Keine** Meldung nennt den Weggang. Quelle und Weg, Schritt für Schritt:

| Stelle | was passiert |
|---|---|
| `gameServer.js`, `socket.on('close')` | `session.detach(token)`, `#lobbies.disconnect(lobbyId, token)`, bei „alle getrennt“ `session.stop()` |
| `LobbySession#detach` | löscht den Token aus `clients` — **sendet nichts** |
| `LobbyManager#disconnect` | setzt `connected=false`, `disconnectedAt` — **sendet nichts** |
| Client `networkClient.js` | kennt nur `CONTROL.ERROR`, `WELCOME`, `LOBBY_STATE`, `LOADOUTS` + Spielereignisse — **es gibt keinen Nachrichtentyp für „Mitspieler weg“** |
| Client `main.js`, Handler `server_error` / `lobby_state` | zeigen nur, was gesendet wird — hier kommt nichts |
| Snapshot (binär) | führt Position, Leben, Zustände — **kein Verbindungsmerkmal**; der Kader zeigt den Getrennten unverändert als Spieler |

Die Tatsache ist dem **Server** bekannt (`describe()` liefert `connected`, je Platz
`connected:false`) — sie geht aber nur über `GET /api/lobby/:id` heraus, eine
Abfrage, die der Spielclient im laufenden Match nicht stellt.

### Festgehalten (Zustands-Pin statt Wunschtest)

`tests/server-beitritt-und-trennung.test.js` hält den Zustand fest: keine Nachricht,
deren **Typ** den Weggang nennt (`/leav|disconnect|verlass|trenn|lobby_state/`) und
keine, in der der **Name** des Getrennten steht — dazu die Gegenprobe, dass die
Sitzung weiterläuft (`snapshots > 0`) und der Server die Trennung kennt
(`connected === 1`, ein Platz `connected:false`). Der Test sagt im Klartext, dass er
**umzustellen ist**, sobald es die Meldung gibt.

Mutationsprobe: Wird in einer Kopie eine `player_left`-Nachricht an die verbliebenen
Sockets gesendet, fällt der Pin (**1 Test rot**). Der Test ist damit nicht leer.

### Was der Fix braucht (Zuständigkeit außerhalb dieses Gebiets)

1. `src/shared/protocol.js`: ein `CONTROL`-Eintrag, z. B. `PLAYER_LEFT: 'player_left'`.
2. `src/client/**`: ein Zweig, der ihn in das Ereignisprotokoll schreibt (und, wenn
   gewünscht, den Platz im Kader als getrennt kennzeichnet).
3. `GameServer`, `socket.on('close')`: die Nachricht an die **verbliebenen** Sockets der
   Lobby (`session.clients`, ohne den Getrennten), Text mit Namen und Team.

Was **nicht** in Frage kommt: die Meldung über `CONTROL.ERROR` zu schicken. Der Client
zeigt Fehler rot als „Server: …“ in `hud.log`; eine Zustandsmeldung wäre damit als
Fehler verkleidet — die Art Notlösung, die später niemand mehr findet.

---

## BEFUND 3 — Der letzte Beitretende las „Warte auf Mitspieler: 2/2 Teams besetzt“

### Urteil: BEFUND (bestätigt) — behoben

`attach` sendet die `lobby_state`-Nachricht mit `laeuft: this.laeuft`. Gemessen
(vorher, echter Server, zwei Teams):

```
1. Beitritt (Host):    laeuft=false besetzteTeams=1/2
2. Beitritt (letzter): laeuft=false besetzteTeams=2/2   ← DER LETZTE
alle Teams besetzt? true    Session laeuft JETZT? true
```

Der letzte Beitretende ist genau der, mit dem das Match beginnt — und er las die volle
Lobby als wartende (der Client schreibt bei `laeuft === false` den Wartehinweis, s.
`main.js`, Handler `lobby_state`). Ursache und Beleg liegen auf **drei** Zeilen
beieinander: `attach(...)`, danach die Prüfung, danach `session.start()`.

### Änderung

Die Reihenfolge im Beitrittspfad ist gedreht: erst prüfen und **starten**
(`alleBesetzt` → `session.start()`), **dann** `attach`. `attach` meldet damit
`laeuft: true`, wenn das Match mit diesem Beitritt voll ist. Der **erste** Beitretende
bekommt weiter `false` und damit den ehrlichen Hinweis.

Zulässig, weil zwischen `start()` und `attach()` kein Zeitgeber feuern kann: Beide
laufen im selben synchronen Durchgang.

### Test und Mutationsprobe

`tests/server-beitritt-und-trennung.test.js` (zwei Tests zur Reihenfolge, von fünf in
der Datei): `laeuft` beim letzten Beitritt ist `true`; die Gegenprobe über **drei**
Teams ergibt `[false, false, true]` und `besetzteTeams [1, 2, 3]`.

Mutation: Reihenfolge zurück (Node: `attach` vor `start`) → **2 Tests rot**.

---

## BEFUND 4 (A-10) — jede Ablehnungsstelle: Art, Kennung, Text, Urteil

Der Client blendet sein Menü vor dem Netzversuch aus und hat keinen Timeout (A-10,
Client-Teil, fremdes Gebiet). Sein einziger Rückweg ist die Antwort des Servers.
Geprüft wurde deshalb **jede** Ablehnungsstelle einzeln — an einem echten Server, nicht
im Code gelesen: **15 Stellen**, jede mit einem eigenen Test — eine davon mit zwei
Eingabeformen.

| # | Art | Kennung | Text | vorher | Urteil |
|---|---|---|---|---|---|
| 1 | HTTP `GET /api/lobby/:id` | 404 | `Lobby nicht gefunden` | `error` **nur** | Nutzlast vereinheitlicht |
| 2 | HTTP `POST /api/lobby/create` (Grenzen) | 400 | `teams muss zwischen 2 und 8 liegen` / `playersPerTeam … widersprechen sich` | `error` **nur** | Nutzlast vereinheitlicht |
| 3 | HTTP `GET /api/*` (unbekannt) | 404 | `Nicht gefunden` | `error` **nur** | Nutzlast vereinheitlicht |
| 4 | HTTP, Auslieferung wirft | — | **keine Antwort**, danach `unhandledRejection` | **stumm** | **BEHOBEN**: 500 mit `Serverfehler: …` |
| 5 | WS `JOIN_LOBBY`, Lobby unbekannt | `error` | `Lobby nicht gefunden: <id>` | `error` nur, ohne Kennung | Kennung ergänzt |
| 6 | WS `JOIN_LOBBY`, `lobbyId` fehlt | `error` | `Lobby nicht gefunden: (keine Kennung)` | von 5 nicht zu unterscheiden | eigener Text |
| 7 | WS `JOIN_LOBBY`, Lobby voll | `error` | `Alle N Teams sind besetzt — kein Platz frei` | `error` nur | Nutzlast vereinheitlicht |
| 8 | WS `JOIN_LOBBY`, Lobby `running` | `error` | `Lobby nimmt keine Spieler mehr auf` | `error` nur | Nutzlast vereinheitlicht |
| 9 | WS `JOIN_LOBBY`, Lobby `finished` | `error` | wie 8 (Entscheidung s. u.) | `error` nur | Nutzlast vereinheitlicht |
| 10 | WS `START_MATCH`, Teams unvollständig | `error` | `Warte auf Mitspieler: Jedes Team braucht einen Menschen.` | `errors` **nur** | Nutzlast vereinheitlicht |
| 11 | WS `INPUT`/`SELECT_WEAPON`/`JUMP`/`DROP_WEAPON` ohne Sitzung | `error` | `Keine aktive Sitzung` | `errors` nur | Nutzlast vereinheitlicht |
| 12 | WS unbekannter Nachrichtentyp | `error` | `Unbekannter Nachrichtentyp: <t>` | `error` nur | Nutzlast vereinheitlicht |
| 13 | WS unlesbare Nachricht (zwei Eingabeformen: kaputtes JSON und JSON ohne `t`) | `error` | `Ungültige Nachricht` | `error` nur | Nutzlast vereinheitlicht |
| 14 | WS Nutzlast > `INPUT_LIMITS.maxPayloadBytes` | `error` | `Nachricht zu groß (20027 Byte, erlaubt 512)` | `error` nur | Nutzlast vereinheitlicht |
| 15 | WS Binärrahmen Client→Server | — | **keine Antwort** | **stumm, ohne Log** | JEZT: Log-Zeile, weiterhin keine Antwort (Begründung unten) |

**Zwei stumme Abbruche gefunden** (Zeilen 4 und 15). Zeile 4 war ein echter Defekt:
`#handleHttp` ist `async`, sein Rückgabewert wurde nirgends abgewartet — eine werfende
Auslieferung erzeugte **keine Antwort** und eine unbehandelte Promise-Ablehnung (in
Node die Stelle, die den Prozess beendet). Gemessen mit einem werfenden `serveStatic`:
`fetch` lief in den Abbruch, danach genau eine `unhandledRejection`.

### Die Änderungen

1. **Eine Nutzlast für jede Ablehnung** (`GameServer#fehlerNutzlast`): jedes `error`
   trägt jetzt `error` **und** `errors`. Vorher waren es zwei Formen —
   `{"t":"error","error":"Lobby nicht gefunden"}` gegen
   `{"t":"error","errors":["Warte auf Mitspieler: …"]}`. Der Client liest beide
   (`errors?.[0] ?? message.error`); ein fremder Leser musste es auch, und jede neue
   Stelle musste raten, welche Form gilt. Die Redundanz ist Absicht und steht als
   solche im Code.
2. **`GameServer#fehlerSenden`**: prüft `readyState === 1` (dieselbe Rücksicht wie
   `#broadcastControl`) und protokolliert eine nicht zustellbare Ablehnung
   (`error_reply_dropped`), statt im `catch` zu werfen.
3. **HTTP-Fehlerweg** (Zeile 4): `#handleHttp(...).catch(...)` → 500 mit lesbarem
   Grund, Log-Zeile `http_failed`; ist der Kopf schon gesendet, wird die Verbindung
   geschlossen statt still zu hängen.
4. **Binärrahmen** (Zeile 15): protokolliert (`binary_message_rejected`), weiterhin
   **ohne** Antwort. Begründung im Code: eine Antwort je Rahmen wäre eine Verstärkung
   (wenige Byte hinein, eine volle JSON-Zeile hinaus) und damit eine Einladung, den
   Server mit Müll zuzustellen. Sichtbarkeit stellt das Log her.
5. **Kennung in der Meldung** (Zeilen 5/6): `Lobby nicht gefunden: <id>` bzw.
   `Lobby nicht gefunden: (keine Kennung)`. Der Client wiederholt den Beitritt bei
   jeder Wiederverbindung mit derselben ID; ohne sie ist ein Fehlerbericht nicht
   nachvollziehbar. (Dokumente, die den alten Wortlaut zitieren, verlieren dadurch
   nichts: „Lobby nicht gefunden“ bleibt Präfix.)

### Entscheidung, die ausdrücklich **nicht** geändert wurde

`running` und `finished` sind für den Beitretenden **derselbe** Fall („nimmt keine
Spieler mehr auf“). Die beiden Zustände zu trennen wäre eine Änderung am Drahttext, die
für den Spieler nichts entscheidet: In beiden Fällen ist derselbe Schritt richtig
(andere Lobby wählen). Ein Bedienhinweis („Match läuft“) wäre eine Sache des Clients.

### Test und Mutationsprobe

`tests/server-ablehnungen.test.js` (9 Tests) prüft **jede** Stelle einzeln und
verlangt überall dieselbe Eigenschaft (`assertLesbareAblehnung`): `error` nicht leer,
`errors[0]` nicht leer, `t === 'error'`.

Mutation: HTTP-Fehlerweg entfernt (auf einer Kopie) → Test 2 fällt mit
`failureType: 'unhandledRejection'` — der Befund, in seiner eigenen Form.

---

## Ordnung: Die große Methode in `gameServer.js` — gemessen, nicht umgebaut

Die Meldung lautete: **282 Zeilen, 26 `this.`-Zugriffe, um Zeile 1145**.

Gemessen (vor meinen Änderungen, per Klammerzählung ab der Signatur):

| Methode | Zeilen | `this.` |
|---|---|---|
| `#handleConnection` | **281** | **26** |

Beide Zahlen **stimmen** (281 gegen gemeldete 282: die Zählung schließt die
schließende Klammerzeile mit ein; die Zeilennummer lag wegen fremder Änderungen bei
1264 → nach meinen Änderungen 1458; alle Zahlen sind Momentaufnahmen).

### Was in der Methode steckt (nacher gemessen)

```
#handleConnection: 357 Zeilen gesamt | 175 Kommentarzeilen | 13 Leerzeilen | 169 Code-Zeilen
  case JOIN_LOBBY    170 Z. gesamt, 112 Kommentar
  case START_MATCH    20 Z., 7 Kommentar
  case PING           30 Z., 17 Kommentar
  default             33 Z., 8 Kommentar
  INPUT / SELECT_WEAPON / JUMP / DROP_WEAPON   je 8 Z., 0 Kommentar
```

**Die Hälfte ist Erklärung, nicht Ablauf.** Der Fall `JOIN_LOBBY` bringt 58 Code-Zeilen
und 112 Kommentarzeilen mit. Eine Zerlegung „nach Zeilen“ würde damit überwiegend
**Kommentare verschieben** — genau die Begründungen, die an ihrer Stelle gelesen werden
sollen (sie heißen nicht umsonst `FUND (belegt)`). Für den Umbau selbst wären die
kleinen Fälle (8 Zeilen) uninteressant, und `JOIN_LOBBY` ist der verzweigteste Fall.

### Gibt es ein Zeilenbudget? — Nein.

```
$ grep -rn "max-lines" eslint.config.mjs scripts/checks.mjs tests/*.test.js   → kein Treffer
$ grep -rn "3200" tests/*.test.js
tests/shooting.test.js:60: test('match.js bleibt unter 3200 Zeilen', …)
```

Das einzige Zeilenbudget im Projekt gilt für `src/engine/match.js` (< 3200,
`tests/shooting.test.js`), und `docs/audit-arch-grenzen.md` hält als Befund C-9 selbst
fest: „Kein Zeilenbudget außer für `match.js`“. Für `gameServer.js` gibt es keines —
der Umbau ist also **nicht erzwungen**, und ohne Notwendigkeit wäre er Bewegung ohne
Grund.

### Wäre die Methode prüfbar? — Ja, und der Prüfstand steht jetzt.

`#handleConnection` ist indirekt prüfbar: kein Test kann eine private Methode rufen,
aber **jeder** ihrer Zweige ist über einen echten Server + `ws`-Client erreichbar.
Genau das tun die neuen Dateien: 19 Tests fahren den Draht (Beitritt, Ablehnungen,
Trennung, Verfall) und würden eine Zerlegung mitprüfen. Vorher gab es für die
Ablehnungszweige **keinen** solchen Prüfstand — ein Umbau wäre ein Umzug ohne Umzug
gewesen.

### Urteil

**Kandidat bestätigt, Umbau in diesem Zug zurückgestellt — mit Begründung.**

Drei Gründe, jeder gemessen statt geschätzt:

1. **Kein Budget.** Es gibt keine Grenze, gegen die `gameServer.js` verstößt; der Umbau
   wäre Bewegung ohne Zwang. (Das Projekt hält als eigenen Befund C-9 fest, dass es
   außer für `match.js` überhaupt kein Zeilenbudget gibt.)
2. **Der Umfang ist Erklärung, nicht Ablauf.** 175 der 357 Zeilen sind Kommentar. Ein
   Schnitt „nach Zeilen" verschiebt die Begründungen von ihrer Fundstelle weg — und
   gerade sie sind in diesem Projekt der Wert des Codes.
3. **Die Verifikation wäre in dieser Sitzung unvollständig.** Der Beitrittspfad ist der
   meistbenutzte Weg des Servers; die E2E-Suite, die ihn im Browser durchspielt, durfte
   in dieser Sitzung nicht laufen (vier Arbeiter schreiben gleichzeitig in `src/` — der
   Dev-Server lädt neu und die Spezifikationen brechen mit „Execution context was
   destroyed", was nach Produktfehler aussähe). Die 19 neuen Prüfungen und die
   bestehenden Serverdateien fahren den Draht, aber nicht die Oberfläche. Wer den Umbau
   angeht, sollte ihn **mit** lauffähiger E2E machen.

Wer ihn angeht, hat jetzt den Test dafür. Vorgeschlagener Schnitt (wenn er gewünscht ist):
`JOIN_LOBBY` → `#beitritt(socket, message)` mit Rückgabe `{lobbyId, token}` (der Fall
setzt den Kontext), danach sind 58 Code-Zeilen an einer prüfbaren Naht getrennt, und
`#handleConnection` fällt unter 200 Zeilen.

---

## Offene Punkte (gefunden, nicht geändert — mit Grund)

1. **Trennung wird nicht gemeldet** (Befund 2). Braucht `CONTROL`-Eintrag + Client-Zweig
   → fremdes Gebiet. Zustands-Pin steht.
2. **Host-Platz steht auf `connected: true`, auch ohne Socket.** `LobbyManager#create`
   belegt den Host-Platz über `join` — der Platz gilt damit als verbunden, bevor sich
   ein Client anmeldet. Folge: Ein über `POST /api/lobby/create` angelegter Host, dessen
   Browser nie verbindet, verfällt nicht und zählt als Mensch; die Sitzung kann mit
   einem echten Client starten und danach weiterlaufen, wenn dieser geht (der
   `close`-Handler findet den Host-Platz „verbunden“). Nicht Teil dieser Arbeit — der
   Reconnect-Pfad hängt daran, und das ist eine eigene Entscheidung.
3. **`GET /api/<unbekannt>` liefert 200 statt 404 — wenn `dist/` gebaut ist.** Die
   SPA-Ersatzroute (`createDistHandler`) gibt für Pfade **ohne Punkt** `index.html`
   zurück, bevor der 404-Zweig greift. Gemessen: `/api/gibtsnicht` → 200 HTML,
   `/gibtsnicht.json` → 404 JSON. Kein stiller Abbruch (es kommt etwas), aber ein
   falsch geschriebener API-Pfad sieht aus wie eine gültige Seite.
4. **Kein `error`-Zuhörer auf den Clientsockets.** Der `catch`-Zweig des
   Nachrichtenzuhörers sendet an `socket`; ohne Zuhörer kann ein `error`-Ereignis (etwa
   auf einem bereits geschlossenen Socket) als unbehandelte Ausnahme hochkommen. Ich
   habe es **nicht reproduziert**: 12 Sockets, die direkt nach dem Senden schließen,
   ergaben 0 `uncaughtException`. Deshalb **keine** Zeile dafür — nur dieser Vermerk.
   (`#fehlerSenden` prüft jetzt `readyState` und protokolliert, statt zu senden.)

5. **Zwei Startwege, zwei Lobby-Zustände** (gemessen, s. o.): Ein Match, das durch den
   letzten BEITRITT startet, lässt den Status auf `open` (die Lobby bleibt in der
   Auswahlliste des Clients — der zeigt nur `open`), ein per `START_MATCH` gestartetes
   steht auf `running`. Folge: Ein verfallenes Team lässt sich nur im ersten Fall neu
   besetzen. Das ist insofern bemerkenswert, als die Entscheidung W5 (`JOIN_LOBBY`,
   Kommentar „ENTSCHEIDUNG (Fund W5)“) „open“ ausdrücklich als die GRÖSSERE Änderung
   bezeichnet — „es öffnete die Tür für neue Spieler und stellte die Lobby zurück in den
   Lobby-Browser“ — obwohl der Beitrittspfad genau diesen Zustand herstellt. Eine
   Angleichung wäre eine Produktentscheidung (beide Richtungen sind vertretbar:
   `markRunning` auch im Beitrittspfad = sauberer Status, aber das freie Team bleibt
   dann dauerhaft leer; `open` auch bei START_MATCH = das Versprechen gilt überall, aber
   ein laufendes Match steht in der Auswahlliste). **Nicht geändert**, weil sie das
   Verhalten der Oberfläche verschiebt.

---

## Was ich NICHT geprüft habe

* **Kein Volllauf** von `npm test` oder `npm run test:e2e` — nach Vorgabe: vier andere
  Arbeiter schreiben gleichzeitig in `src/`. Geprüft wurden einzelne Dateien (s. u.).
* **Der Client-Teil von A-10** (Menü vor dem Netzversuch ausgeblendet, kein Timeout,
  Platzierung der Fehlermeldung) — fremdes Gebiet, nicht angefasst und nicht
  nachgemessen. Diese Arbeit deckt nur, was der SERVER liefert.
* **Der Reconnect-Weg Ende-zu-Ende im Browser** (Wiederverbinden nach Ablauf des
  Fensters über die Oberfläche) — nicht geprüft; geprüft ist der Serverpfad
  (`JOIN_LOBBY` nach Verfall).
* **Das Zeitverhalten mit Vorgabefenstern** (30 s Reconnect, 5 s Runde): geprüft wurde
  mit verkürzten Werten (120–150 ms / 40–60 ms). Die Rechnung „Verfall spätestens einen
  Rundenlauf nach Fensterablauf“ ist damit belegt; die 30-s-Wartezeit selbst wurde nicht
  abgewartet.
* **Der Zugzeit-Ablauf für den Getrennten** („sein Zug läuft über die Zugzeit ab“):
  geprüft ist, dass die Simulation weiterläuft und sein Zustand erhalten bleibt;
  die volle Zugzeit (30 s) wurde nicht abgewartet.
* **Der Host-Platz ohne Socket** (offener Punkt 2) ist **gelesen**, nicht als Testfall
  vorgeführt.
* **Der Socket-`error`-Fall** (offener Punkt 4) ist **nicht reproduziert** — die Angabe
  „12 Versuche, 0 Ausnahmen“ ist alles, was ich dazu sagen kann.

---

## Gates dieser Arbeit

| Gate | Ergebnis |
|---|---|
| `npm run lint` | **Exit 0** |
| `npm run check:docs` | **„Geprüfte Behauptungen: alle richtig“** (118 Testdateien, 31 E2E-Spezifikationen, 21 Gates) |
| `npm run replay -- play artifacts/replay-20260910.json --verify` | Zustandshash **`9ec63e8c` — unverändert**, „Replay ist exakt reproduzierbar“ (38 Eingaben, 2440 Takte, Runde 13) |
| Mutationsproben (5, auf `/tmp`-Kopien) | **jede** Mutation macht den zugehörigen Test rot |
| Neue Tests | `tests/server-lobby-verfall.test.js` 5/5 · `tests/server-beitritt-und-trennung.test.js` 5/5 · `tests/server-ablehnungen.test.js` 9/9 = **19** |

### Gezielt nachgeprüft (Einzeldateien, kein Volllauf)

Alle grün, 0 rot: `netcode` 34 · `server-start` 7 · `snapshot-size` 6 · `logger` 15 ·
`metrics` 3 · `event-coverage` 16 · `server-integration` 9 · `einheiten-je-spieler` 10 ·
`persistence-restart` 2 · `wiederaufbau-seed-und-takt` 2 · `anti-cheat` 13 · `load` 2 ·
`guenther` 32 · `sidegrade-maxhealth-zuender` 4 · `replay-head` 9 ·
`replay-sprung-luecke` 3 · `eine-regel-eine-stelle` 9.

**Zwischenstand, der sich von selbst erledigt hat:** Im ersten Durchlauf war
`tests/eine-regel-eine-stelle.test.js` 8/9 — Test 6 meldete, `ohneKommentare` sei außer
in `tests/helfer/ohne-kommentare.js` auch in `tests/weapon-field-wiring.test.js`
definiert. Diese Datei war **um 10:44:06** entstanden, also nach den Dateien dieser
Arbeit (10:40–10:41) — ein fremder Zwischenstand, nicht angefasst. Der zweite Durchlauf
(gegen den Endstand) ist 9/9.

**Zahlen in der Doku:** `README.md` nennt derzeit **1122 Tests in 118 Dateien**; die
Dateizahl stimmt (gemessen `ls tests/*.test.js | wc -l` → 118, `check:docs` grün), die
TESTZAHL ist ein älterer Messwert — meine 19 Tests und die Dateien der parallel
arbeitenden Aufträge sind darin nicht enthalten. Ein `npm test`-Volllauf war für diese
Arbeit ausdrücklich nicht erlaubt (vier andere schreiben in `src/`), deshalb wird die
Zahl hier NICHT fortgeschrieben: 1122 + 19 = 1141 wäre eine Rechnung, keine Messung.
Die Fortschreibung gehört in einen neuen MASTERDOTO-Abschnitt (erste Zahl im Dokument),
sobald ein Volllauf erlaubt ist.
