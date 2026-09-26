# Auftrag O8: Online-Sprung und Waffe-Abwerfen

**Abzugeben an:** einen Background-Worker mit Zugriff auf dieses Repository.
**Stand der Vorlage:** `32b1f81` (Branch `main`).
**Art dieses Dokuments:** ENTWURF. Es entscheidet nichts über Spielgefühl oder
Balance (siehe „Was dieses Dokument NICHT entscheidet"), sondern legt den Ist-Stand
offen, wägt zwei Bauwege ab und benennt eine harte Vorbedingung, die größer ist
als das Protokoll.

## Dateieigentum (verbindlich)

Erlaubt ist **genau eine** Datei: dieser Auftrag. Wer ihn umsetzt, arbeitet in
einem EIGENEN Durchgang und liest Abschnitt D zuerst.

Für den Durchgang, der dieses Dokument schreibt, gilt zusätzlich: `src/**`,
`tests/**`, `index.html` und `vite.config*` sind unberührt geblieben, weil
gleichzeitig ein E2E-Lauf über einen Vite-Dev-Server läuft (ein Schreibzugriff
lädt die Seite neu und macht die Messung wertlos). Diese Einschränkung gilt nur
für den Verfasser; der Umsetzer darf selbstverständlich `src/` und `tests/`
ändern.

## Kurzfassung (für den Umsetzer, in dieser Reihenfolge)

1. **Zuerst das Replay-Format** um den Sprung (und den Abwurf) erweitern und den
   Server sie aufzeichnen lassen — Abschnitt D. Das ist eine **Vorbedingung**,
   keine Empfehlung.
2. **Dann den Drahtweg** bauen (zwei `CONTROL`-Arten, Abschnitt B/C).
3. **Dann die Anzeige** (Abschnitt F).
4. **Erst ganz zuletzt** an Balance und Spielgefühl rühren — und nur auf
   ausdrückliche Entscheidung des Auftraggebers (Abschnitt G, letzter Teil).

---

# A) Ist-Stand, gemessen

Alle Zeilenangaben sind am Stand `32b1f81` mit `grep -n`/`sed` nachgeprüft; der
vollständige Beleglauf steht in **Anhang A**. Die Angaben des Auftraggebers haben
sich bis auf **drei** Stellen bestätigt, die unten richtiggestellt sind.

## A.1 Der Sprung existiert online nicht — und schweigt

`src/client/main.js:793-794` (Befehl und Ausgabe in Anhang A, Block 1):

```js
  jump(seitlich = 0) {
    if (!this.match || this.mode !== 'local') return null;
```

Im Online-Modus ist das ein **stummer** Ausstieg: Rückgabe `null`, keine Meldung
an den Spieler, keine Meldung an den Server. Der Spieler drückt die Sprungtaste
und es passiert nichts, ohne dass ihm jemand sagt, warum.

**Richtigstellung 1:** Der Sprung liegt auf **SHIFT**, nicht auf der Leertaste.
`src/client/input.js:152` (`if (key === 'Shift') {`) und die Begründung in
`input.js:135-146`: „Springen liegt auf SHIFT — nicht auf der Leertaste. FUND
(belegt, 2026-09-20): Hier stand ein Sprung auf `event.code === 'Space'`. Er war
NIE erreichbar … Damit hatte der Sprung GAR KEINEN Auslöser." Der Kommentar in
`main.js:179` („Springen (Leertaste), mit A/D als Richtung") ist damit **veraltet
und falsch** — dieselbe Fehlerklasse, die dort schon einmal zugeschlagen hat. Wer
diesen Auftrag umsetzt, richtet den Kommentar mit ein (und prüft README/Hilfe).

## A.2 Waffe-Abwerfen online: es gibt keinen Weg

`src/client/main.js:817-819`:

```js
  dropWeapon(anzeigePosition) {
    if (!this.match || this.mode !== 'local') {
      this.hud.log('Abwerfen ist nur im lokalen Match möglich', 'neutral');
```

Ehrlicher als der Sprung — es gibt eine Meldung. Der Ausstieg bleibt derselbe.

**Richtigstellung 2:** Der Satz „`dropWeapon` hat KEINEN anderen Aufrufer als die
lokale Tastenzuordnung" ist zu streng. Gemessen (`grep -rn dropWeapon src/client/ src/server/`,
Anhang A, Block 4) gibt es drei Aufrufstellen:

| Fundstelle | Bedeutung | online erreichbar? |
|---|---|---|
| `main.js:178` | Tastatur (Q) | ruft die Methode, die sofort aussteigt |
| `main.js:839` | HUD-Knopf, wird bei jedem HUD-Aufbau neu gebunden | dito |
| `debugApi.js:113` | `dropWeapon: index => game.dropWeapon(index)` (Debug-API) | dito |

Die **Substanz** der Meldung bleibt: es gibt keinen Weg, der im Online-Modus
wirkt. Die drei Aufrufstellen laufen alle in dieselbe Sperre — der Unterschied
ist wichtig, weil ein Umbau, der nur die Tastenzuordnung bedient, HUD-Knopf und
Debug-API stehen ließe.

## A.3 Das Protokoll kennt beides nicht

`src/shared/protocol.js:84-95` — die `CONTROL`-Liste, wörtlich und vollständig
(elf Einträge, kein `JUMP`, kein `DROP_WEAPON`; `LOADOUTS` folgt erst nach einem
Kommentarblock bei `:103`):

```js
export const CONTROL = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  CREATE_LOBBY: 'create_lobby',
  JOIN_LOBBY: 'join_lobby',
  LOBBY_STATE: 'lobby_state',
  START_MATCH: 'start_match',
  INPUT: 'input',
  SELECT_WEAPON: 'select_weapon',
  RESUME: 'resume',
  ERROR: 'error',
  PING: 'ping',
```

`LOADOUTS` folgt als zwölfter Eintrag (`protocol.js:103`, mit einem Kommentarblock
dazwischen — die Liste selbst endet dort; vollständig in Anhang A, Block 5).

`INPUT` trägt auf dem Draht genau vier Felder — `src/client/networkClient.js:427-441`:

```js
  sendInput(angle, power, weaponId = null) {
    if (!this.isConnected || !this.#socket) return false;
    const snapshot = this.latestSnapshot;
    this.#socket.send(controlMessage(CONTROL.INPUT, {
      angle,
      power,
      weaponId,
      tick: referenzTick({ ... }),
    }));
```

Der Server verarbeitet genau zwei Eingabebefehle — `src/server/gameServer.js:1152`
(`case CONTROL.INPUT:`) und `:1162` (`case CONTROL.SELECT_WEAPON:`); beide enden in
`session.handleInput(context.token, message)` bzw. `session.handleWeaponSelect(context.token, message.weaponId)`.

## A.4 Der Motor kann beides schon

`src/engine/match.js:1240` — `jump(playerId, horizontal = 0)`, mit vollständiger
Prüfung (Anhang A, Block 8):

```js
  jump(playerId, horizontal = 0) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match läuft nicht');
    if (playerId !== this.activePlayerId) errors.push('Nur der aktive Spieler kann springen');
    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
    if (errors.length > 0) return { ok: false, errors };
```

`src/engine/match.js:2127` — `dropWeapon(playerId, weaponId)`, mit denselben zwei
Vorbedingungen (`Match läuft nicht`, `Spieler ist nicht mehr aktiv`) und den
weiteren Schritten `Unbekannte Waffe` → `#inventory.removeWeapon` →
Kiste mit zufälligem Wurf → Ereignis `weapon_dropped`.

## A.5 Warum das schwer wiegt: die Klassenschwäche des Scouts hängt am Sprung

`src/engine/match.js:392` und `:394`:

```js
const JUMP_SPEED_INFLUENCE_ABOVE = 0.5;
const JUMP_SPEED_INFLUENCE_BELOW = 0.25;
```

Die Begründung steht bei den Konstanten (`match.js:352-390`) und nennt die
gemessenen Zahlen (`match.js:384-386`):

```js
 *   scout      116,9 px   (+35 % gegenüber Heavy)
 *   heavy       86,6 px
 *   artillery   82,0 px
```

Und den Grund, warum die Achse „Sprung" gewählt wurde (`match.js:358`):

```
 * Die Position ist in einem Artillerie-Spiel die kostbarste Größe (so steht es
```

Der Kopf der Konstanten (`match.js:362-370`) hält den Befund fest, der zu dieser
Verdrahtung führte: der Scout war „auf ALLEN drei wirksamen Achsen (Leben, Wucht,
Reichweite) der schwächste", seine Beweglichkeit (1,2) „existierte nur auf dem
Papier". **Online existiert die Gegenmaßnahme nicht** — dort ist der Scout wieder
der Schwächste, und zwar auf allen Achsen.

## A.6 Der Folgefehler ist schon sichtbar

`src/client/ereignisse.js:461-470` — zwei Texte für EINEN Zustand:

```js
  crate_pickup_blocked: {
    lokal: (k) => {
      // Der Vorrat ist voll: das ist der Moment, in dem Abwerfen nötig wird.
      k.hud.log('Vorrat voll — erst eine Waffe abwerfen (Q)', 'danger');
    },
    online: (k) => {
      // Online gibt es kein Abwerfen — nur der Zustand, keine Taste.
      k.hud.log('Vorrat voll — die Waffe kann nicht aufgenommen werden', 'danger');
    },
  },
```

Der Online-Text ist korrekt und der lokale ist korrekt. Zusammen heißt das aber:
**online ist der Vorrat genauso voll, es gibt aber keine Handlung** — der Spieler
kann Loot nicht aufnehmen und hat keinen Ausweg. Der Kommentar darüber
(`ereignisse.js:441-459`) benennt genau das und hält fest, dass die Q-Aufforderung
deshalb NUR im lokalen Zweig steht.

## A.7 Der Präzedenzfall steht dreimal im Code

`src/shared/protocol.js:56-75` — die Versionshistorie, wörtlich (gekürzt um die
Randzeilen; vollständig in Anhang A, Block 5):

- **5**: Kisten werden übertragen. „Vorher fehlten sie im Snapshot, weshalb ONLINE
  keine Kiste zu sehen war — im lokalen Match dagegen schon."
- **6**: aufgestellte Geschütze. „ohne Übertragung wäre der Auto-Turret online
  unsichtbar und damit ein unsichtbarer Angreifer."
- **7**: Günther und seine Kackhaufen. „online sah man weder ihn noch die Haufen —
  man wurde geschwächt und verlangsamt, ohne eine Ursache zu sehen."

Jedes Mal dieselbe Kur: ein Spielzustand lief im Motor mit, fehlte im Drahtformat,
und wurde online **still** unsichtbar. Jedes Mal steht derselbe Satz dabei: „Eine
ältere Gegenstelle lehnt den Snapshot ab, statt ihn falsch zu lesen; genau dafür
gibt es diese Zahl."

Aktueller Stand: `PROTOCOL_VERSION = 7` (`protocol.js:75`), `HEADER_SIZE = 25`
(`protocol.js:197`).

**Richtigstellung 3:** Die drei Präzedenzfälle sind **SNAPSHOT-Felder** (binäres
Format), O8 ist eine **STEUERNACHRICHT**. Daraus folgt für die Version etwas
anderes, siehe Abschnitt E — die Analogie trägt hier nur halb, und wer sie
wörtlich nimmt, baut einen unnötigen Formatwechsel.

## A.8 Die fehlende Mechanik hat einen Zwilling, der schon existiert

Der Drahtweg für Ereignisse **ist bereits da**: `src/server/gameServer.js:246-247`

```js
    for (const event of this.match.consumeEvents()) {
      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
    }
```

Der Server schickt **jedes** Motorereignis als Steuernachricht an alle Clients.
Der Client verteilt unbekannte `t`-Werte auf denselben Weg (`networkClient.js`
`default:` → `'game_event'` → `main.js:994` → `verarbeiteOnline`). Sobald der
Server einen Sprung ausführt, kommt `jumped` also **schon jetzt** beim Client an —
nur tut dort niemand etwas damit (Abschnitt F).

---

# B) Zwei Wege — und die Wahl

## Weg (a): je eine neue CONTROL-Nachricht `JUMP` und `DROP_WEAPON`

Der Client schickt `controlMessage(CONTROL.JUMP, { seitlich })` bzw.
`controlMessage(CONTROL.DROP_WEAPON, { weaponId })`. Der Server bekommt je einen
neuen `case`, ruft `match.jump(...)`/`match.dropWeapon(...)` und zeichnet auf.

## Weg (b): beide Fälle in die BESTEHENDE `INPUT`-Nachricht aufnehmen

`INPUT` trägt bereits `tick` und `weaponId`. Ein Sprung wäre dann
`{ t: 'input', kind: 'jump', seitlich, tick }`, ein Abwurf
`{ t: 'input', kind: 'drop', weaponId, tick }`.

## Bewertung

### 1. Präzedenzfall im eigenen Haus (das stärkste Argument)

Das Projekt hat diese Frage **schon einmal** beantwortet. `SELECT_WEAPON` ist eine
eigene `CONTROL`-Art (`protocol.js:92`) mit eigenem Handler
(`gameServer.js:467`), **obwohl** `INPUT` ein Feld `weaponId` trägt. Die Waffe ist
ein PARAMETER des Schusses; die AUSWAHL ist ein eigener Befehl. Genau so ist der
Sprung kein Schuss mit anderen Zahlen, sondern eine eigene Handlung — und der
Abwurf ebenso.

Weg (b) würde diese getroffene Entscheidung rückgängig machen, ohne dass sich die
Gründe geändert hätten.

### 2. Das `tick`-Feld in `INPUT` bedeutet etwas Bestimmtes

`tick` existiert in `INPUT` **nur** für die Lag-Kompensation des Schusses. Der
Server nutzt es ausschließlich, um `interpolatedFrom` zu füllen (die Kopfzeile des
Handlers sagt das ausdrücklich, `gameServer.js:413-431`), und die Rückrechnung ist
eine reine ANZEIGE-Rückmeldung. Für einen Sprung gibt es nichts zu
interpolieren: der Impuls ist sofort und autoritativ. Ein Sprung in `INPUT`
schleppte ein Feld mit, das dort entweder falsch benutzt oder tot ist.

### 3. Server-Autorität

Beide Wege lassen sich autoritativ bauen — die Spielerkennung kommt in beiden
Fällen aus dem TOKEN (`gameServer.js:405`, `#platzFuer`), nie aus der Nachricht;
`tests/anti-cheat.test.js:144` hält genau das fest. Der Unterschied liegt in der
Zahl der Prüfpfade:

| | Weg (a) | Weg (b) |
|---|---|---|
| Prüfstelle | je Befehl eine, explizit | eine gemeinsame Eingangsprüfung mit innerer Verzweigung |
| `validateCommand` | unberührt (gilt nur für den Schuss) | muss entweder umgangen oder um `kind` erweitert werden — ein Widerspruch in der Semantik („type: 'fire' steht dort fest", `gameServer.js:443`) |
| Tick-Prüfung | entfällt bewusst für den Sprung | wird automatisch mitgeschleppt, obwohl sie nichts schützt |
| Fehlerantwort | klar je Befehl | Verwechslungsgefahr: eine abgelehnte „Eingabe", die gar kein Schuss war |

Der `default:`-Zweig des Servers macht einen unbekannten Typ ohnehin **laut**
(`gameServer.js:1200-1201`):

```js
          default:
            socket.send(controlMessage(CONTROL.ERROR, { error: `Unbekannter Nachrichtentyp: ${message.t}` }));
```

Eine ältere Gegenstelle lehnt einen neuen Typ also nicht still ab — der
„stumme Ausstieg", der A.1 so gefährlich macht, entsteht hier nicht. Das spricht
**gegen** das Argument, man müsse `INPUT` überladen, um laut zu scheitern.

### 4. Rückwärtskompatibilität

| | Weg (a) | Weg (b) |
|---|---|---|
| Client neu, Server alt | `CONTROL.ERROR` „Unbekannter Nachrichtentyp" — laut, aber der Text nennt kein bekanntes Wort | `INPUT` ohne `angle`/`power` → `validateCommand` lehnt mit „angle muss zwischen 0 und 3.141592653589793 liegen" ab — laut, aber irreführend |
| Client alt, Server neu | unberührt | unberührt, solange `kind` fehlt ⇒ als Schuss gelesen |
| Rollback | neuen `case` entfernen, Schusspfad unberührt | Schemaänderung an der meistbenutzten Nachricht |

### 5. Zahl der Formatwechsel

Beide Wege ändern **nichts** am binären Snapshot: `PROTOCOL_VERSION` und
`HEADER_SIZE` bleiben (siehe Abschnitt E). Weg (a) fügt zwei Namen in eine
JSON-Liste ein, Weg (b) ändert das Schema der Nachricht, die im Spiel am häufigsten
über den Draht geht.

## Wahl: Weg (a) — zwei neue `CONTROL`-Arten

**Begründung in einem Satz:** Der eigene Präzedenzfall (`SELECT_WEAPON`), das
`tick`-Feld, das nur für den Schuss eine Bedeutung hat, und der laute
`default:`-Zweig machen die getrennten Befehle billiger als das Überladen — und
sie machen den Rückbau zu einer Einzeiler-Operation.

**Preis, der ausdrücklich mitbezahlt wird:**
- zwei neue Prüfpfade statt einem,
- zwei neue Zeilen in `tests/anti-cheat.test.js` sind Pflicht (Abschnitt G),
- die Liste `CONTROL` wächst auf 14 Einträge; wer sie zählt (es gibt Tests, die
  `CONTROL`-Namen prüfen), muss nachziehen.

**Nicht** Teil dieses Weges: ein `kind`-Feld auf dem Draht. Das `kind` gehört in
das **Replay-Format** (Abschnitt D) und hat auf dem Draht nichts zu suchen.

---

# C) Server-Autorität, ausformuliert

Leitsatz des Projekts (`tests/anti-cheat.test.js:12-20`): „Der Client darf
behaupten, was er will — der Server entscheidet anhand des TOKENS, welcher Spieler
handelt", geprüft „gegen einen ECHTEN Server über echte WebSockets, nicht gegen
eine nachgebaute Attrappe".

## C.1 Was der MOTOR schon prüft (nichts davon muss doppelt gebaut werden)

`match.jump(playerId, horizontal)` — `match.js:1240-1260`:

| Prüfung | Fundstelle | Fehlertext |
|---|---|---|
| Match läuft | `:1242` | `Match läuft nicht` |
| Es ist der aktive Spieler | `:1243` | `Nur der aktive Spieler kann springen` |
| Spieler lebt | `:1244` | `Spieler ist nicht mehr aktiv` |
| Erster Sprung nur vom Boden | `:1254-1256` | `In der Luft ist kein erster Sprung möglich` |
| Höchstens zwei je Zug | `:1257-1259` | `Keine Sprünge mehr in diesem Zug` |
| Richtung begrenzt | `:1280` | `Math.max(-1, Math.min(1, Number(horizontal) || 0))` |

Dazu: `#jumpsUsed` wird **beim Zugbeginn** zurückgesetzt (`match.js:2779`), nicht
beim Landen (`match.js:1249-1253` erklärt, warum: sonst könnte man innerhalb eines
Zuges beliebig oft springen, landen und wieder springen). `jumpsLeft(playerId)`
(`match.js:1179`) ist die Abfrage für die Anzeige.

`match.dropWeapon(playerId, weaponId)` — `match.js:2127-2134`: Match läuft,
Spieler lebt, Waffe existiert (`Unbekannte Waffe`). Danach greift das Inventar
(`#inventory.removeWeapon(playerId, weaponId)`) — **die Zugehörigkeit wird über
die `playerId` entschieden, nicht über die Waffe allein**; das ist die
entscheidende Eigenschaft für die Server-Autorität.

## C.2 Was der SERVER-Handler zusätzlich prüfen muss

1. **Identität aus dem Token.** `#platzFuer(token)` (`gameServer.js:405-412`),
   dann `seat.entityId`. Ein `playerId`-Feld in der Nachricht wird **nicht
   gelesen** — auch nicht „nur zur Kontrolle". Vorbild: `#handleInput`,
   `gameServer.js:412-416`.
2. **Sitzung und Platz vorhanden.** `Kein Spielerplatz` bei fehlendem Platz
   (`gameServer.js:413-415`); `Keine aktive Sitzung` wie in den bestehenden
   `case`-Zweigen (`gameServer.js:1153-1154`).
3. **Typ des Richtungswerts.** Die Klemme im Motor (`Number(horizontal) || 0`,
   `:1280`) ist Toleranz, keine Prüfung: `Number('1e9')` wird still zu `1`, aus
   Unsinn wird ein gültiger Sprung. Der Handler muss `typeof x === 'number'`,
   `Number.isInteger(x)` und `x >= -1 && x <= 1` verlangen — die Projektregel
   „`Number(x)` ist keine Typprüfung" (`validation.js:55-60`) gilt hier genauso.
   Ohne Feld gilt `0` (gerade) als Standard.
4. **Kein Tick für den Sprung.** Der Sprung wird **nicht** interpoliert; es gibt
   keinen Grund, einen Tick zu verlangen (Begründung in B-2). Kommt trotzdem
   einer mit, wird er ignoriert — nicht etwa gegen `maxTickDrift` geprüft, denn
   das würde nur eine Prüfung ohne Wirkung vortäuschen (genau der Fehler, den
   `INPUT_LIMITS.maxPayloadBytes` hatte, `validation.js:22-35`).
5. **Aufzeichnen — sonst ist der Umbau unvollständig.** `result.ok` ⇒
   `recorder.recordInput({ kind: 'jump', ... })`, spiegelbildlich zu
   `gameServer.js:454-462`. Für den Abwurf ebenso, mit `weaponId`.
6. **Fehlerantwort in der Form des Projekts.** `CONTROL.ERROR` mit
   **`errors`-Liste**, nicht `error` (Singular): `gameServer.js:1157` (INPUT)
   und `:1166` (SELECT_WEAPON) tun es so; die Singularform benutzen nur die
   Sonderfälle (`:991`, `:999`, `:1201`, `:1212`). Der Client liest beides
   (`networkClient.js:392`:
   `message.errors?.[0] ?? message.error`), aber die Liste ist die Hausform.
7. **Nichts glauben, was die Zahl der Sprünge betrifft.** Kein eigenes Zählen im
   Handler: `#jumpsUsed` liegt im Motor, und eine zweite Zählung wäre die nächste
   doppelte Regel (Projektregel „Eine Regel, eine Stelle" —
   `tests/eine-regel-eine-stelle.test.js`).

## C.3 Fehlerfälle und was der Client zurückbekommt

| Fall | Auslöser | Antwort des Servers | Was der Spieler sieht |
|---|---|---|---|
| Kein Platz | Token unbekannt | `{errors:['Kein Spielerplatz']}` | `Server: Kein Spielerplatz` (`main.js:986-993`) |
| Nicht am Zug | fremde Figur am Zug | `{errors:['Nur der aktive Spieler kann springen']}` | wie oben |
| Nicht am Boden | erster Sprung in der Luft | `{errors:['In der Luft ist kein erster Sprung möglich']}` | wie oben |
| Zähler erschöpft | dritter Sprung im Zug | `{errors:['Keine Sprünge mehr in diesem Zug']}` | wie oben |
| Figur gefallen | `isPlayerAlive` falsch | `{errors:['Spieler ist nicht mehr aktiv']}` | wie oben |
| Unsinnige Richtung | `seitlich: 'rechts'`, `1e9`, `true` | neue Handler-Prüfung: `{errors:['seitlich muss -1, 0 oder 1 sein']}` | wie oben |
| Alte Gegenstelle | Client kennt `jump` nicht | `default:` → `{error:'Unbekannter Nachrichtentyp: jump'}` | `Server: Unbekannter Nachrichtentyp: jump` |

Der Client-Weg für die Ablehnung **existiert schon und ist vollständig**:
`networkClient.js:391-395` → `'server_error'` → `main.js:986-993`. Er wirft
zusätzlich die Schussvorhersage weg (`this.shotPredictor.discard(text)`) — für
einen abgelehnten Sprung harmlos, aber wissenswert.

**Der Abwurf braucht eine eigene Prüfung, die es heute in den Anti-Cheat-Tests
NICHT gibt:** „Ein Client kann keine Waffe abwerfen, die er nicht hat". Der Motor
entscheidet das über die `playerId` (C.1), also ist die Eigenschaft da — aber
nicht belegt. Die Testdatei prüft heute nur BENUTZEN (`:208`) und AUSWÄHLEN
(`:245`).

---

# D) Determinismus und Replays — der kritische Teil

## D.1 Der Befund ist gemessen und im Repo als Wache festgehalten

**Ja, der Sprung muss aufgezeichnet werden — und wird es nicht.** Belegt mit einer
Sonde (zwei Partien, identischer Seed, identische Schussfolge, in der zweiten
zusätzlich EIN Sprung; in **beiden** Fällen wurden nur die Schüsse aufgezeichnet):

```
ohne Sprung   Hash nach Aufzeichnung b528e643 -> Wiedergabe b528e643   REPRODUZIERBAR
mit  Sprung   Hash nach Aufzeichnung 380b5ef8 -> Wiedergabe c7576510   ABWEICHUNG
mit  Sprung: beim Abspielen 3 von 12 aufgezeichneten Schuessen ABGELEHNT
```

Die Wache steht in `tests/replay-sprung-luecke.test.js` (Commit `32b1f81`,
7856 Byte): **drei** Tests — die Gegenprobe ohne Sprung (ohne sie könnte der
Befund auch „Aufzeichnung ist generell kaputt" heißen), der Befund selbst, und ein
Quelltext-Test auf `recordInput`.

Der strukturelle Grund, an der Quelle:

```
$ grep -n "match.fire(entry" src/engine/replay.js
393:        const result = this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId);
```

```
$ sed -n '118,120p' src/engine/replay.js
  recordInput({ tick, playerId, angle, power, weaponId = null }) {
```

Der Wiedergabepfad ruft **ausschließlich** `match.fire(...)`; `recordInput` kennt
genau eine Eingabeart. Der Sprung ist aber Simulationszustand:
`match.js:1283-1285` setzt `Velocity` direkt.

**Diese Wache ist UMZUDREHEN, nicht zu löschen.** Ihr Kopfkommentar sagt das
ausdrücklich (`tests/replay-sprung-luecke.test.js:47-56`): „**Das Replay-Format
muss den Sprung aufnehmen** (eine Eingabeart neben dem Schuss), UND der Server
muss ihn aufzeichnen. Danach wird aus dieser Wache eine Gleichheits-Zusicherung."
Auch der Quelltext-Test (`:183-197`) fällt um, sobald eine zweite Eingabeart
eingeführt wird — er ist absichtlich so gebaut.

## D.2 Geht der Sprung in den Zustandshash ein? — Mittelbar, und das ist die Falle

`hashState(state)` (`src/engine/stateSnapshot.js:223-296`) bildet den **Ansichts**
zustand ab. Für die Figuren nimmt es genau diese Felder
(`stateSnapshot.js:230-236`):

```js
    const entities = state.entities.map(e => [
      e.entityId,
      e.alive,
      Math.round(e.x),
      Math.round(e.y),
      Math.round(e.health),
      e.activeWeaponId ?? null,
```

**Kein `Velocity`.** Und `#jumpsUsed` (`match.js:469`, Abfrage `:1179`) kommt im
Hash überhaupt nicht vor. Daraus folgen zwei Sätze, die für den Umbau zählen:

1. **Der Hash fängt den Sprung erst einen Takt später.** Im Takt des Absprungs ist
   `y` noch unverändert; ab dem nächsten Takt verschiebt die Geschwindigkeit die
   Position, und die steht im Hash (gerundet). Eine Wiedergabe, die den Sprung
   nicht kennt, weicht also **nicht im Sprungtakt**, sondern danach ab.
2. **Zwei Läufe können im Sprungtakt hash-gleich sein und trotzdem auseinander
   laufen.** Ein Vergleich, der nur den Hash EINES Takts nimmt, belegt deshalb
   weniger als er behauptet. Die gemessene Sonde vergleicht den Endzustand — nur
   der ist aussagekräftig.

Das zweite Signal der Sonde ist deshalb wichtig: **3 von 12 Eingaben wurden
abgelehnt.** Der Zähler `appliedInputs`/`rejected` im Wiedergabepfad
(`replay.js:393-396`) zeigt die Divergenz früher und deutlicher als der Hash.
Wer für O8 prüft, sieht beide Zahlen an.

## D.3 NEUER BEFUND: der Abwurf ist derselbe Fall — und ein schärferer

`dropWeapon` ist ebenso Simulationszustand, und er ist **schlimmer** als der
Sprung. `src/engine/match.js:2205-2206`:

```js
  #rollDropThrow() {
    const richtung = this.#rng.nextBoolean() ? -1 : 1;
```

und weiter (`:2226`, `:2238`):

```
2226:    const zielWeite = this.#rng.nextFloat(PICKUP_RADIUS * 1.4, PICKUP_RADIUS * 3);
2238:      vy: -this.#rng.nextFloat(9, 14),
```

Derselbe Zufallsstrom erzeugt auch den **Wind** (`match.js:2804`):

```
2804:    return Math.round(this.#rng.nextFloat(-MAX_WIND, MAX_WIND) * 10000) / 10000;
```

Drei Konsequenzen, alle aus diesen vier Zeilen:

1. Ein Abwurf **verschiebt den Zufallsstrom**. Jeder spätere `nextFloat` liefert
   einen anderen Wert — also auch der Wind jeder folgenden Runde.
2. Der Wind geht **in den Hash ein** (`stateSnapshot.js`-Payload, Feld `wind`).
   Eine Aufzeichnung ohne Abwurf weicht damit nicht nur an der Kiste ab, sondern
   am Wind und an allem, was daran hängt (Ballistik).
3. Die Kiste selbst ist nur teilweise im Hash (`crates` in
   `stateSnapshot.js:281-288`: `entityId`, gerundete `x`/`y`, `crateType`,
   `rarity`, `weaponId`) — die **Wurfgeschwindigkeit** nicht. Die Landestelle
   fällt also erst über die Position auf, wieder mit einem Takt Verzögerung.

**Folge für den Auftrag:** Der Abwurf gehört in dieselbe Vorbedingung wie der
Sprung. Wer nur den Sprung aufzeichnet, baut die nächste nicht reproduzierbare
Aufzeichnung — und die Ursache (Windverschiebung) ist von der Wirkung (schlechtere
Trefferquote in der Wiedergabe) so weit entfernt, dass sie schwer zu finden wäre.

**Offen und ausdrücklich dem Auftraggeber überlassen:** ob der Wurf
aufgezeichnet wird (drei Zufallswerte in den Eintrag) oder ob er *deterministisch
aus aufgezeichneten Größen* gerechnet wird (etwa aus Tick + Spieler + Inventarstand,
ohne Zufallsstrom). Beides ist möglich; die zweite Variante wäre stärker, weil sie
den Zufallsstrom gar nicht anfasst, aber sie ist eine Verhaltensänderung der
Mechanik. Dieses Dokument entscheidet das nicht.

## D.4 Die harte Vorbedingung: Reihenfolge

**Der Umbau hat eine Vorbedingung, die größer ist als das Protokoll. Ein neuer
`CONTROL`-Befehl genügt NICHT.**

Der Server zeichnet **jedes** Online-Match auf (`gameServer.js:456`, heute nur im
Erfolgsfall von `match.fire`):

```js
    const result = this.match.fire(seat.entityId, command.input.angle, command.input.power, command.input.weaponId);
    if (result.ok) {
      this.recorder.recordInput({
```

und er stellt Sitzungen **aus dieser Aufzeichnung** wieder her
(`gameServer.js:150-169`):

```js
    const limit = Math.max(totalTicks, ...entries.map(entry => entry.tick)) + 1;
    let guard = 0;
    while (this.match.status === 'playing' && this.match.world.tickCount < limit && guard < limit + 10) {
      const tick = this.match.world.tickCount;
      for (const entry of byTick.get(tick) ?? []) {
        this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId ?? null);
      }
      this.match.step();
```

Die Wiederherstellung ruft **ausschließlich `match.fire`** und prüft **nicht**
gegen einen Vorher-Zustand — sie ist still. Und sie ist der Weg, den die
Persistenz nimmt (`toPersisted()` → `ReplayRecorder.toJSON()`, `gameServer.js:172-175`).

**Also gibt es für O8 nur EINEN verantwortbaren Schnitt:**

> **Erst das Replay-Format um Sprung und Abwurf erweitern und den Server sie
> aufzeichnen lassen, DANN den Drahtweg bauen.**

In der umgekehrten Reihenfolge ist **zwischen den beiden Schritten jeder
Serverneustart ein Zustandsverlust** — und zwar ein stiller: die Figuren stehen
nach dem Wiederanlauf woanders, die Kisten liegen woanders, der Wind ist ein
anderer, und niemand meldet es. Das ist kein Testproblem, sondern ein
Betriebsproblem.

## D.5 Abwärtskompatibilität des Formats — mit Fundstelle

Altreplays kennen kein `kind`-Feld. In diesem Projekt hat genau diese Klasse schon
zugeschlagen (siehe `replay.js:155-170`: die entfernte Abkürzung
`static forMatch(match, { entries, rounds })` kopierte `sidegrades` und `loadouts`
nicht in den Kopf — „sonst spielte die Wiedergabe ein anderes Match"). Die daraus
gezogene **Regel**, mit Fundstelle:

`src/engine/replay.js:52-59` — ein Feld kommt nur in den Kopf, wenn es wirklich
gesetzt ist:

```js
    const hatSidegrades = Array.isArray(sidegrades) && sidegrades.some(s => s !== null && s !== undefined);
    const hatLoadouts = Array.isArray(loadouts) && loadouts.some(l => l !== null && l !== undefined);
```

`tests/replay-head.test.js:107-123` — die Gegenprobe, wörtlich:

```
107:test('Ein leeres Feld wird NICHT aufgenommen (kein Rauschen im Kopf)', () => {
109-   * Die andere Seite: Ein Kopf ohne Nebenwirkungen soll auch kein leeres Feld
110-   * tragen — sonst wären alte und neue Aufzeichnungen ohne Grund verschieden.
```

`src/engine/replay.js:192-197` — das Format-Tor:

```js
    if (!parsed || parsed.format !== REPLAY_FORMAT_VERSION) {
      throw new Error(`Unbekanntes Replay-Format: ${parsed?.format}`);
    }
    const recorder = new ReplayRecorder({ seed: parsed.seed, ...parsed.config });
    for (const entry of parsed.entries ?? []) recorder.recordInput(entry);
```

**Was daraus für den Eintrag folgt (Regel, nicht Vorschlag):**

- Ein Eintrag **ohne** `kind` muss als **Schuss** gelesen werden. Der Leser ist
  tolerant, nicht streng — sonst sind alle gespeicherten Aufzeichnungen (und damit
  die Sitzungswiederherstellung nach einem Neustart) unlesbar. Das ist der
  Fall „der Umbau macht mehr kaputt, als er heilt" (Abschnitt H, Risiko 2).
- Der Eintrag trägt das `kind` **im Eintrag**, nicht im Kopf: Kopf-Felder sind
  Konfiguration (Seed, Teams, Karte), das `kind` ist je Eingabe verschieden.
  Die Regel aus `replay.js:52-59` („nur wenn gesetzt, sonst Rauschen") verbietet
  ein Kopf-Feld mit dem Wert „alle Eingaben sind Schüsse".
- `REPLAY_FORMAT_VERSION` (`replay.js:22`, Wert `1`) wird **nur** angehoben, wenn
  der Leser nicht tolerant bleiben kann. Mit einem Standardwert für ein fehlendes
  `kind` kann er es — also **nicht** anheben.

`tests/replay-sprung-luecke.test.js:191` prüft heute die Signatur von
`recordInput` auf genau das Verbot, das hier aufgehoben werden soll:

```js
  assert.doesNotMatch(signatur[1], /jump|sprung|kind|type/,
```

Dieser Test wird beim Umbau **rot** und muss umgedreht werden (Gleichheit
fordern), nicht gelöscht.

---

# E) Versionssprung — braucht es v8?

**Kurzantwort: Nein.** Und die Begründung ist der Unterschied, den der
Präzedenzfall aus A.7 nicht abdeckt.

## E.1 Was `PROTOCOL_VERSION` tatsächlich bewacht

Der einzige Ort, an dem die Zahl GEPRÜFT wird, ist der **binäre** Snapshot —
`protocol.js:386`:

```js
  if (!view || view.byteLength < HEADER_SIZE) return null;
  if (view.getUint8(2) !== PROTOCOL_VERSION) return null;
```

Sie steht außerdem im Kopf jedes Snapshots (`protocol.js:263`) und in jeder
Steuernachricht (`protocol.js:550`:

```js
  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload });
```

). Der Parser einer Steuernachricht **prüft sie nicht**
(`protocol.js:589-596`):

```js
export function parseControlMessage(raw) {
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') return null;
    return parsed;
```

Geprüft wird nur, dass `t` eine Zeichenkette ist.

## E.2 Der Unterschied zu v5/v6/v7

| | v5, v6, v7 | O8 |
|---|---|---|
| Art der Änderung | Snapshot-**Felder** (binär) | neue `t`-**Werte** (JSON) |
| Betroffen | `encodeSnapshot`/`decodeSnapshot`, `HEADER_SIZE` | die `CONTROL`-Liste und ein `case` |
| Wirkung der Version | eine ältere Gegenstelle lehnt den Snapshot ab, statt ihn falsch zu lesen | keine: der Parser prüft `v` nicht |
| `HEADER_SIZE = 25` | musste mit | bleibt unverändert |

**Der Präzedenzfall trägt hier also nur halb.** v7 war ein Fall, in dem eine
falsch gelesene Nachricht STILL falsche Zahlen erzeugt hätte — dafür ist die Zahl
gedacht. O8 fügt Namen in eine JSON-Liste ein; die Sorte Nachricht, die
`PROTOCOL_VERSION` bewacht, ändert sich nicht.

## E.3 Was stattdessen das Richtige ist

Eine neue `t`-Art ist **kein Versionsereignis**, und ein Hochzählen von
`PROTOCOL_VERSION` hätte sogar einen Schaden: eine ältere Gegenstelle würde dann
**jeden Snapshot verwerfen** (`:386` → `null`) — also das Spiel verlieren, obwohl
binär alles unverändert ist. Das wäre ein Formatwechsel ohne Grund, und die
Projektregel „nur aufnehmen, wenn wirklich etwas anders ist" (D.5) verbietet ihn.

**Was fehlt, ist nicht die Version, sondern eine Fähigkeitsauskunft.** Die
Handshake-Möglichkeit ist angelegt und ungenutzt: `WELCOME` trägt `protocol`
(`gameServer.js`-`WELCOME`-Zweig), und der Client gibt es weiter
(`networkClient.js:371`: `this.#emit('hello', { protocol: message.protocol })`) —
niemand vergleicht es. Der unbekannte-Typ-Fall ist durch den `default:`-Zweig
bereits **laut** (B-3), also ist die Auskunft eine Verbesserung der Meldung, keine
Voraussetzung für die Sicherheit.

**Empfehlung:** `PROTOCOL_VERSION` **nicht** anheben; `HEADER_SIZE` unberührt
lassen; `REPLAY_FORMAT_VERSION` ebenfalls nicht (D.5). **Offener Punkt für den
Auftraggeber:** ob `WELCOME` eine `features`-Liste bekommt, damit der Client
„Springen nicht möglich — der Server ist älter" melden kann, statt die Meldung
`Unbekannter Nachrichtentyp: jump` zu zeigen.

---

# F) Was der Client zeigen muss

## F.1 Der Transport ist schon da, nur der Zweig fehlt

Der Weg steht vollständig: Server (jedes Motorereignis, `gameServer.js:246-247`)
→ Client-Default-Zweig → `'game_event'` → `main.js:994`
(`client.on('game_event', message => this.#handleRemoteEvent(message))`) →
`verarbeiteOnline`. Die Zuordnungstabelle ist eine Datei für beide Betriebsarten
(`ereignisse.js`, geprüft von `tests/event-coverage.test.js`).

`jumped` hat heute nur einen **lokalen** Zweig — `ereignisse.js:424-428`:

```js
  jumped: {
    lokal: (k, n) => {
      k.hud.log(`${k.nameOf(n.playerId)} springt${n.double ? ' (Doppelsprung)' : ''}`, 'accent');
    },
  },
```

Online passiert deshalb nichts. Das ist heute **korrekt** (das Ereignis kam nie
an) und wird beim Umbau **falsch**: der Server schickt `jumped` dann, der Zweig
fehlt, und der Spieler sieht nicht, dass seine Figur fliegt und wohin.

## F.2 Der Abwurf hat GAR KEINEN Zweig — und seine Begründung ist nur lokal gültig

`grep -rn "weapon_dropped" src/client/ tests/event-coverage.test.js` findet
**eine** Zeile — und die steht in der Testdatei, nicht im Client. Über alle
Testdateien sind es zwei Fundstellen (`grep -rc "weapon_dropped" tests/*.test.js`):
`tests/event-coverage.test.js:1`, `tests/drop-mechanic.test.js:1`. In
`src/client/` gibt es **keinen** Zweig. Das Ereignis steht in
`tests/event-coverage.test.js:195` unter `bewusstStumm` mit dieser Begründung:

```js
  'weapon_dropped',    // `dropWeapon()` meldet das Ergebnis direkt im Log
```

Diese Begründung gilt für den **lokalen** Zweig (`main.js:833-839` loggt Name,
Munition und aktualisiert die Liste). **Online gilt sie nicht** — dort gibt es
kein `dropWeapon()`, das etwas melden könnte. Wer den Umbau macht, muss die
Begründung neu fassen: entweder einen `online`-Zweig ergänzen oder an der
Fundstelle aufschreiben, warum die Kiste im Snapshot (seit v5 auf dem Draht) als
Meldung genügt. **Eine veraltete Begründung im `bewusstStumm`-Set ist ein
stummer Fehler.**

## F.3 Wie eine Log-Flut vermieden wird — gemessen, nicht vermutet

Drei Quellen sind zu prüfen; zwei sind schon geschlossen.

1. **Tastenwiederholung — geschlossen.** `src/client/input.js:62-63`:

   ```js
       if (event.repeat) return;
   ```

   Wer die Taste hält, löst den Sprung NICHT mehrfach aus. Wichtig, weil ein
   wiederholender Sprungbefehl je Wiederholung eine Serverablehnung und damit eine
   neue Meldung erzeugt hätte.

2. **Der Motor deckelt — `at most two per turn`** (`match.js:1257-1259`); mehr als
   zwei `jumped`-Ereignisse je Spieler und Zug kann es nicht geben. Bei mehreren
   Figuren je Spieler (`unitsPerPlayer`) multipliziert sich das mit der
   Einheitenzahl — die Anzeige muss also je Ereignis genau EINE Zeile erzeugen,
   nicht eine je Figur und Tick.

3. **Die Doppelmeldung ist schon da — und darf nicht verdoppelt werden.** Der
   lokale Weg erzeugt **zwei** Meldungen für EINEN Sprung: `main.js:804`
   (`this.hud.log(ergebnis.double ? 'Doppelsprung' : 'Sprung', 'accent')`) UND
   `ereignisse.js:426` (`„… springt"`). Gemessen mit einer Sonde (nur `/tmp`, kein
   Repo-Eingriff): ein echter `match.jump()` erzeugt genau **ein** Ereignis
   (`jumped`) und über den Ereignisweg genau **eine** Log-Zeile:

   ```
   Sprung-Ergebnis: {"ok":true,"jumpsLeft":1,"impulse":10.12,"double":false}
   Takt: 4
   Ereignisarten nach dem Sprung: ["jumped"]
   Log-Zeilen aus dem EREIGNIS-Weg: [["Figur#1 springt","accent"]]
   Anzahl: 1
   ```

   Zusammen mit `main.js:804` sind das also **2 Meldungen je Sprung im lokalen
   Spiel**. Für online gilt: **genau eine** — die aus dem Ereigniszweig (sie kommt
   vom Server, ist damit die Wahrheit) — und **kein** zusätzlicher Log in einer
   Client-eigenen Sprungmethode. Genau diese Dopplung ist die Flutursache, nicht
   die Menge der Sprünge.

4. **Die Ablehnung erzeugt schon eine Meldung.** `main.js:986-993` zeigt
   `Server: <Text>` (danger) für jede `CONTROL.ERROR`. Ein Client, der seine
   Sprungtaste zusätzlich selbst kommentiert, erzeugt wieder zwei Zeilen.

**Empfehlung:** Der online-Zweig für `jumped` ist die EINZIGE neue Meldung; Text
aus `n.double` (`… springt` / `… springt (Doppelsprung)`), Ton `accent` wie lokal;
keine zweite Meldung über einen Erfolgspfad.

## F.4 Was der Spieler NOCH nicht sieht — und warum das eine Entscheidung ist

Der binäre Snapshot führt **keine Geschwindigkeit**: die Figur wird online aus
aufeinanderfolgenden Positionen interpoliert (`networkClient.js`, Interpolation).
Der Sprung erscheint online also als eine Folge von Positionssprüngen über die
50-ms-Snapshots, nicht als Bogen. Eine Client-Vorhersage gäbe es nur mit einem
zweiten Rechenweg — genau die Sorte „zweite Regel", die das Projekt mehrfach
eingesammelt hat. **Ob online vorhergesagt wird, entscheidet der Auftraggeber**
(siehe G), nicht dieses Dokument.

---

# G) Abnahmekriterien

## G.1 Die Vorbedingung (zuerst, nicht gleichzeitig)

- [ ] Ein Eintrag im Replay kann **Springen** und **Abwerfen** beschreiben; der
      Leser liest einen Eintrag **ohne** `kind` als Schuss (Rückwärtskompatibilität).
      Beleg: `node --test tests/replay-head.test.js` bleibt grün, und ein neuer
      Test liest eine Aufzeichnung **ohne** `kind` und fordert Gleichheit des Hashes.
- [ ] `tests/replay-sprung-luecke.test.js` ist **umgedreht** (nicht gelöscht):
      dieselbe Partie mit Sprung ergibt denselben Zustandshash. Der Kopfkommentar
      der Datei ist auf den neuen Stand gebracht.
- [ ] Eine Aufzeichnung **mit Sprung und mit Abwurf** verifiziert gegen sich selbst
      und gegen die Gegenprobe.
      `npm run replay -- record --out=artifacts/replay-verify.json`
      `npm run replay -- play artifacts/replay-verify.json --verify`
      (`scripts/replay.mjs` springt heute nicht — der Weg muss den neuen Eintrag
      erzeugen, sonst prüft dieser Punkt nichts.)
      Danach `rm -f artifacts/replay-verify.json` (`artifacts/` ist getrackt).
- [ ] Der Server zeichnet **beide** auf: `grep -n "recordInput" src/server/gameServer.js`
      zeigt den ruhenden Aufruf innerhalb des Sprung- und des Abwurfpfads, jeweils
      hinter `result.ok`.
- [ ] Die Wiederherstellung kennt beide: `gameServer.js:150-169`
      (`#restoreFromReplay`) wendet nicht nur `match.fire` an.
- [ ] **Belegprobe für die Vorbedingung:** zwei Läufe derselben Sitzung mit Sprung,
      einmal über den Wiederherstellungspfad — gleicher Zustandshash. Ohne diesen
      Schritt ist D.4 nur behauptet.

## G.2 Der Drahtweg

- [ ] `CONTROL.JUMP` und `CONTROL.DROP_WEAPON` in `protocol.js`; der Server hat je
      einen `case` und einen Handler nach dem Muster von `handleWeaponSelect`.
- [ ] **Identität aus dem Token**, kein `entityId` aus der Nachricht:
      `node --test tests/anti-cheat.test.js` wird um Prüfungen erweitert:
      - fremder Token kann keinen Sprung für eine andere Figur auslösen,
      - ein dritter Sprung im selben Zug wird mit `errors`-Liste abgelehnt,
      - `seitlich: 'rechts'` / `1e9` / `true` wird abgelehnt (nicht still zu `0`),
      - ein Abwurf einer Waffe, die die Figur **nicht** hat, wird abgelehnt.
      Diese Datei prüft gegen einen ECHTEN Server (`GameServer.listen(0)` + `ws`) —
      eine Attrappe belegt nichts.
- [ ] `node --test tests/netcode.test.js` bleibt grün (`validateCommand` und
      `isTickInWindow` bleiben für den Schuss unverändert).
- [ ] `node --test tests/event-coverage.test.js` bleibt grün; der `online`-Zweig
      für `jumped` existiert, und die `bewusstStumm`-Begründung für
      `weapon_dropped` ist neu gefasst (F.2).
- [ ] Keine zweite Zählung der Sprünge im Server (Regel „eine Regel, eine Stelle"):
      `node --test tests/eine-regel-eine-stelle.test.js`.

## G.3 Anzeige

- [ ] Genau EINE Meldung je Sprung online; keine Dopplung mit einem Client-Pfad
      (F.3). Prüfbar an der Zahl der `hud.log`-Aufrufe im Erfolgspfad.
- [ ] Der Online-Text für `crate_pickup_blocked` wird **richtig**, sobald es das
      Abwerfen online gibt (`ereignisse.js:461-470`): der Vorrat ist voll, es gibt
      jetzt eine Handlung — also darf die Taste wieder genannt werden (oder
      bewusst nicht, siehe G.6).
- [ ] Der veraltete Kommentar in `main.js:179` („Springen (Leertaste)") ist
      berichtigt; HUD-Hilfe und README nennen SHIFT.

## G.4 Gates (in dieser Reihenfolge, Ergebniszahlen in den Abschluss)

```bash
npm run lint
npm test                          # node --test tests/*.test.js
npm run validate
npm run build
npm run perf                      # 60-Hz-Budget: kein Tick > 16,7 ms
npm run balance                   # Zahlen vor/nach vergleichen
npm run replay -- record --out=artifacts/replay-verify.json
npm run replay -- play artifacts/replay-verify.json --verify
rm -f artifacts/replay-verify.json
npm run test:e2e
```

Vor `test:e2e` einen stehengebliebenen Dev-Server entfernen, aber **nicht** mit
einem Muster, das sich selbst trifft:
`pkill -f "[P]rojectArmageddon/node_modules/.bin/[v]ite"`, danach
`ss -ltn | grep 5173`.

## G.5 E2E (neu zu schreiben)

- [ ] Ein Online-Sprung wird im **Zustand** geprüft, nicht über eine Wartezeit:
      die Methode im Seitenkontext anzapfen und den Wert im **selben**
      `page.evaluate` ablegen (Muster im Skill `projectarmageddon-verification`,
      Abschnitt „E2E: Zustand prüfen, nicht Uhrzeit"). Eine Zusicherung „nach
      200 ms fliegt die Figur noch" fällt auf dieser Hardware bei richtigem
      Produkt um.
- [ ] Fester Seed vor dem Start: `await page.locator('#cfg-seed').fill('4242')`.
- [ ] Die Meldung erscheint genau einmal (Zähler im Live-Bereich, nicht in zwei
      Schritten gelesen — `#hud-log` im ANIMATIONSBILD neu aufgebaut).
- [ ] Der Abwurf: die Waffe ist danach in der Kistenliste, und die eigene Liste
      hat eine Waffe weniger.

## G.6 Was dieses Dokument NICHT entscheidet

Alles Spielgefühl und alle Balance sind Entscheidungen des Auftraggebers:

- **Darf online zweimal je Zug gesprungen werden** (wie lokal), oder nur einmal?
  Lokal sind es zwei (ein Bodensprung und ein Doppelsprung, `match.js:1248-1259`).
  Online ändert dieselbe Zahl das Kräfteverhältnis sofort, weil der Scout seine
  Stärke zurückbekommt (A.5).
- **Beendet der Sprung online den Zug?** Lokal ausdrücklich nicht
  (`match.js:1295-1301`: sonst wäre der Doppelsprung nie auslösbar). Im Netzspiel
  ist die Zugzeit eine Ressource — wer springt, könnte Zeit gewinnen.
- **Wird der Sprung abwärts begrenzt, wenn der Server die Klasse nicht kennt?**
  Die Beweglichkeit kommt aus dem Kampfprofil (`match.js:1266-1276`); online
  kennt der Server die Konfiguration, aber ein abweichender Punktekatalog
  (Sidegrades) könnte die Zahlen verschieben — Balancefrage.
- **Darf online überhaupt abgeworfen werden?** Der Abwurf schenkt dem Gegner eine
  Waffe und Munition. Lokal ist das eine bewusste Entscheidung gegen einen vollen
  Vorrat; online ist der Vorrat ebenso voll, aber die Kiste ist vielleicht
  wertvoller für den Gegner als der freie Platz. **Diese Frage entscheidet der
  Auftraggeber** — sie ist der Grund, warum A.6 überhaupt ein Fehler ist.
- **Wird der `online`-Text für `crate_pickup_blocked` wieder die Taste nennen?**
  Hängt direkt an der vorigen Frage.
- **Vorhersage des Sprungs im Client** (F.4): ja/nein, und wenn ja, mit welcher
  Toleranz.
- **Deterministischer Wurf statt Zufallsstrom** (D.3, offener Punkt): ändert die
  Mechanik und braucht eine eigene Messung.
- **Bekommt `WELCOME` eine `features`-Liste** (E.3) oder bleibt es bei der
  Meldung `Unbekannter Nachrichtentyp`.
- **Wird `MASTERDOTO.md` um einen Befund-Eintrag ergänzt** und unter welcher
  Nummer.

---

# H) Risiken — der Fall, in dem der Umbau mehr kaputt macht als er heilt

**Das Hauptrisiko ist die Reihenfolge.** Wird der Drahtweg vor dem Replay-Format
gebaut, ist jeder Serverneustart in der Zwischenzeit ein **stiller
Zustandsverlust**: die Sitzung wird aus einer Aufzeichnung wiederhergestellt, die
den Sprung nicht kennt (`gameServer.js:150-175`, `:456`), und die
Wiederherstellung vergleicht **nicht** gegen den Vorher-Zustand. Es gibt keine
Fehlermeldung, keinen Test, keinen Log-Eintrag — nur ein Match, das nach dem
Neustart anders steht. Gewonnen: online kann man springen. Verloren: die
Wiederaufnahme ist unzuverlässig, und zwar nur nach einem Neustart.

Die weiteren Risiken, nach Schwere:

1. **Der strenge Leser.** Wird ein Eintrag ohne `kind` als ungültig behandelt,
   sind **alle gespeicherten Aufzeichnungen** unlesbar — und damit die
   Sitzungswiederherstellung nach einem Neustart. Genau diese Klasse hat im
   Projekt schon zugeschlagen (`replay.js:155-170`, `tests/replay-head.test.js:107-123`).
   Gegenmittel: Standardwert im Leser (D.5).
2. **Der Abwurf bleibt außen vor.** Er verschiebt den Zufallsstrom und damit den
   Wind (D.3). Wer nur den Sprung aufzeichnet, baut die nächste nicht
   reproduzierbare Aufzeichnung — mit einer Ursache, die man an der Wirkung nicht
   mehr erkennt.
3. **Die Wache wird gelöscht statt umgedreht.** `tests/replay-sprung-luecke.test.js`
   ist der einzige Ort, an dem der Befund steht. Weg damit = Befund weg.
4. **Anticheat-Lücke am Abwurf.** Die Zugehörigkeit der Waffe entscheidet heute die
   `playerId` im Inventar (C.1) — es gibt aber **keinen** Test dafür (C.3).
   Wird der Abwurf geöffnet, ohne diesen Test, ist eine offene Tür gebaut und
   niemand merkt es.
5. **Zwei Meldungen je Sprung.** Lokal schon der Fall (F.3, gemessen). Wird das
   Muster online kopiert, ist der Live-Bereich nach einem Zug mit drei Figuren
   voll — und der Screenreader liest sechs Zeilen für zwei Sprünge.
6. **Die veraltete Begründung im `bewusstStumm`-Set** (F.2): bleibt sie stehen,
   gilt für ein online gesendetes Ereignis eine Begründung, die nur lokal stimmt —
   ein stiller Fehler in genau der Liste, die stille Fehler verhindern soll.
7. **Der Kommentar, der lügt.** `main.js:179` nennt die Leertaste; tatsächlich ist
   es SHIFT (`input.js:152`). Wer diesen Auftrag liest und die Leertaste
   verdrahtet, macht den Sprung ein zweites Mal unerreichbar — die Fehlerklasse,
   die `input.js:135-146` schon einmal dokumentiert hat.
8. **Balance wird zur Regression erklärt.** Mit dem Sprung wird der Scout online
   stärker (A.5). Die Klassenmatrix (`npm run balance`) kann sich ändern, ohne dass
   etwas kaputt ist. Die Zahlen vor dem Umbau festhalten, sonst ist nachher nicht
   unterscheidbar, was gewollt und was versehentlich ist.
9. **Zwei Prüfpfade für einen Schalter.** Weg (a) kostet zwei Handler; wer aus
   Bequemlichkeit einen gemeinsamen Zwischenschritt einbaut, hat den Zustand, den
   B-3 vermeiden wollte.

---

# Anhang A: Beleglauf (wörtlich)

Der folgende Lauf wurde am Stand `32b1f81` ausgeführt. Das Skript lag unter
`/tmp/pa-beleg.sh` (außerhalb des Repos; im Repo wurde nichts angelegt außer
dieser Datei). Es ist hier vollständig abgedruckt, damit der Lauf aus dem Dokument
heraus wiederholbar ist.

```bash
#!/usr/bin/env bash
cd "/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon" || exit 1
run() { echo; echo "\$ $*"; "$@"; }

run sed -n '791,802p' src/client/main.js
run sed -n '805,812p' src/client/main.js
run sed -n '176,181p' src/client/main.js
run grep -rn dropWeapon src/client/ src/server/
run grep -n 'export const CONTROL' -A 14 src/shared/protocol.js
run grep -n 'export const PROTOCOL_VERSION\|export const HEADER_SIZE\|export const MESSAGE_TYPE' src/shared/protocol.js
run grep -n PROTOCOL_VERSION src/shared/protocol.js
run grep -n 'jump(playerId' -A 6 src/engine/match.js
run grep -n 'verbraucht >= 2\|jumpsLeft(playerId)\|#jumpsUsed.set(entityId, 0)\|if (!grounded && verbraucht === 0)' src/engine/match.js
run grep -n 'JUMP_IMPULSE\|DOUBLE_JUMP_FACTOR\|JUMP_SIDE_IMPULSE\|JUMP_SPEED_INFLUENCE' src/engine/match.js
run grep -n 'kostbarste\|116,9 px\|86,6 px\|82,0 px' src/engine/match.js
run grep -n 'dropWeapon(playerId, weaponId)' -A 8 src/engine/match.js
run grep -n '#rollDropThrow() {' -A 3 src/engine/match.js
run grep -n '#rng\.' src/engine/match.js
run sed -n '118,120p' src/engine/replay.js
run grep -n 'match.fire(entry' src/engine/replay.js
run grep -n recordInput src/server/gameServer.js
run sed -n '452,462p' src/server/gameServer.js
run sed -n '150,169p' src/server/gameServer.js
run grep -n toPersisted -A 4 src/server/gameServer.js
run grep -n 'const entities = state.entities.map' -A 7 src/engine/stateSnapshot.js
run grep -n 'jumped:' -A 5 src/client/ereignisse.js
run grep -n 'weapon_dropped,' -A 2 src/client/ereignisse.js
run sed -n '459,470p' src/client/ereignisse.js
run grep -n 'this.#broadcastControl(event.type' -B 1 -A 1 src/server/gameServer.js
run grep -n '#broadcastControl(type, payload)' -A 6 src/server/gameServer.js
run grep -n 'case CONTROL.INPUT\|case CONTROL.SELECT_WEAPON\|handleWeaponSelect' src/server/gameServer.js
run grep -n 'sendInput(angle, power, weaponId' -A 12 src/client/networkClient.js
run grep -n 'REPLAY_FORMAT_VERSION = \|hatSidegrades = \|hatLoadouts = ' src/engine/replay.js
run grep -n 'parsed.format !== REPLAY_FORMAT_VERSION' -A 5 src/engine/replay.js
run grep -n 'parseControlMessage' -A 6 src/shared/protocol.js
run grep -n 'kein Rauschen\|leeres Feld\|OBJEKT statt eines Arrays' -B 1 -A 3 tests/replay-head.test.js
run git log --oneline -2
echo; echo '$ git status --short'; git status --short
```

Ausgabe (wörtlich, unverändert):

```
$ sed -n 791,802p src/client/main.js
   * @param {number} [seitlich] - -1 links, 0 gerade, 1 rechts
   */
  jump(seitlich = 0) {
    if (!this.match || this.mode !== 'local') return null;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;

    const ergebnis = this.match.jump(playerId, seitlich);
    if (!ergebnis.ok) {
      // Kein Grund zur Beunruhigung: eine Meldung genügt.
      this.hud.log(ergebnis.errors.join(', '), 'neutral');
      return ergebnis;

$ sed -n 805,812p src/client/main.js
    return ergebnis;
  }

  /**
   * Wirft die Waffe an einer Anzeigeposition ab.
   *
   * Der Abwurf ist die Antwort auf einen vollen Vorrat: statt eine Waffe zu
   * verlieren, entscheidet der Spieler bewusst, welche er ablegt. Die Waffe

$ sed -n 176,181p src/client/main.js
      onWeaponSelect: index => this.selectWeapon(index),
      // Aktive Waffe abwerfen (Q).
      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
      // Springen (Leertaste), mit A/D als Richtung.
      onJump: seitlich => this.jump(seitlich),
    });

$ grep -rn dropWeapon src/client/ src/server/
src/client/ereignisse.js:447:   * `Main#dropWeapon` läuft nur im lokalen Match (`src/client/main.js:817`),
src/client/ereignisse.js:451:   * Abwerf-Weg im Client (kein Aufrufer von `dropWeapon` außer der lokalen
src/client/debugApi.js:113:      dropWeapon: index => game.dropWeapon(index),
src/client/main.js:178:      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
src/client/main.js:817:  dropWeapon(anzeigePosition) {
src/client/main.js:830:    const ergebnis = this.match.dropWeapon(playerId, weaponId);
src/client/main.js:839:    this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i), onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()), onJump: seitlich => this.jump(seitlich) });

$ grep -n export const CONTROL -A 14 src/shared/protocol.js
84:export const CONTROL = Object.freeze({
85-  HELLO: 'hello',
86-  WELCOME: 'welcome',
87-  CREATE_LOBBY: 'create_lobby',
88-  JOIN_LOBBY: 'join_lobby',
89-  LOBBY_STATE: 'lobby_state',
90-  START_MATCH: 'start_match',
91-  INPUT: 'input',
92-  SELECT_WEAPON: 'select_weapon',
93-  RESUME: 'resume',
94-  ERROR: 'error',
95-  PING: 'ping',
96-  /**
97-   * Waffenbestand je Spieler (Waffen, Munition, aktive Waffe).
98-   *

$ grep -n export const PROTOCOL_VERSION\|export const HEADER_SIZE\|export const MESSAGE_TYPE src/shared/protocol.js
75:export const PROTOCOL_VERSION = 7;
78:export const MESSAGE_TYPE = Object.freeze({
197:export const HEADER_SIZE = 25;

$ grep -n PROTOCOL_VERSION src/shared/protocol.js
75:export const PROTOCOL_VERSION = 7;
263:  bytes[2] = PROTOCOL_VERSION;
386:  if (view.getUint8(2) !== PROTOCOL_VERSION) return null;
532:    version: PROTOCOL_VERSION,
550:  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload });

$ grep -n jump(playerId -A 6 src/engine/match.js
1240:  jump(playerId, horizontal = 0) {
1241-    const errors = [];
1242-    if (this.#status !== 'playing') errors.push('Match läuft nicht');
1243-    if (playerId !== this.activePlayerId) errors.push('Nur der aktive Spieler kann springen');
1244-    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
1245-    if (errors.length > 0) return { ok: false, errors };
1246-

$ grep -n verbraucht >= 2\|jumpsLeft(playerId)\|#jumpsUsed.set(entityId, 0)\|if (!grounded && verbraucht === 0) src/engine/match.js
1179:  jumpsLeft(playerId) {
1254:    if (!grounded && verbraucht === 0) {
1257:    if (verbraucht >= 2) {
2779:    this.#jumpsUsed.set(entityId, 0);

$ grep -n JUMP_IMPULSE\|DOUBLE_JUMP_FACTOR\|JUMP_SIDE_IMPULSE\|JUMP_SPEED_INFLUENCE src/engine/match.js
334:const JUMP_IMPULSE = 9.2;
339:const DOUBLE_JUMP_FACTOR = 0.8;
341:const JUMP_SIDE_IMPULSE = 2.4;
392:const JUMP_SPEED_INFLUENCE_ABOVE = 0.5;
394:const JUMP_SPEED_INFLUENCE_BELOW = 0.25;
1205:   * Die Zahlen samt Messung stehen bei den Konstanten `JUMP_SPEED_INFLUENCE_*`.
1217:    const dampf = abweichung >= 0 ? JUMP_SPEED_INFLUENCE_ABOVE : JUMP_SPEED_INFLUENCE_BELOW;
1279:    const impuls = JUMP_IMPULSE * (istDoppel ? DOUBLE_JUMP_FACTOR : 1) * langsam * beweglichkeit;
1285:      this.#world.setComponent(playerId, 'Velocity', 'x', vxAlt + richtung * JUMP_SIDE_IMPULSE);

$ grep -n kostbarste\|116,9 px\|86,6 px\|82,0 px src/engine/match.js
358: * Die Position ist in einem Artillerie-Spiel die kostbarste Größe (so steht es
374: *     kartensprengend bleibt. Mit 0,50 landet der Scout bei 116,9 px — klar
384: *   scout      116,9 px   (+35 % gegenüber Heavy)
385: *   heavy       86,6 px
386: *   artillery   82,0 px
1198:   *   - Werte ÜBER 1,0 werden mit 0,50 gedämpft: Der Scout landet bei 116,9 px,
1230:   * Position ändert — in einem Artillerie-Spiel die kostbarste Größe — und

$ grep -n dropWeapon(playerId, weaponId) -A 8 src/engine/match.js
2127:  dropWeapon(playerId, weaponId) {
2128-    const errors = [];
2129-    if (this.#status !== 'playing') errors.push('Match läuft nicht');
2130-    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
2131-    if (errors.length > 0) return { ok: false, errors };
2132-
2133-    const weapon = getWeapon(weaponId);
2134-    if (!weapon) return { ok: false, errors: ['Unbekannte Waffe'] };
2135-

$ grep -n #rollDropThrow() { -A 3 src/engine/match.js
2205:  #rollDropThrow() {
2206-    const richtung = this.#rng.nextBoolean() ? -1 : 1;
2207-    /*
2208-     * Die Weite wird aus der ZIELDISTANZ gerechnet, nicht geschätzt.

$ grep -n #rng\. src/engine/match.js
2206:    const richtung = this.#rng.nextBoolean() ? -1 : 1;
2226:    const zielWeite = this.#rng.nextFloat(PICKUP_RADIUS * 1.4, PICKUP_RADIUS * 3);
2238:      vy: -this.#rng.nextFloat(9, 14),
2804:    return Math.round(this.#rng.nextFloat(-MAX_WIND, MAX_WIND) * 10000) / 10000;

$ sed -n 118,120p src/engine/replay.js
  recordInput({ tick, playerId, angle, power, weaponId = null }) {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new TypeError('tick muss eine nichtnegative Ganzzahl sein');

$ grep -n match.fire(entry src/engine/replay.js
393:        const result = this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId);

$ grep -n recordInput src/server/gameServer.js
167:    for (const entry of entries) this.recorder.recordInput(entry);
456:      this.recorder.recordInput({

$ sed -n 452,462p src/server/gameServer.js
    if (!command.valid) return { ok: false, errors: command.errors };

    const result = this.match.fire(seat.entityId, command.input.angle, command.input.power, command.input.weaponId);
    if (result.ok) {
      this.recorder.recordInput({
        tick: currentTick,
        playerId: seat.entityId,
        angle: command.input.angle,
        power: command.input.power,
        weaponId: command.input.weaponId,
      });

$ sed -n 150,169p src/server/gameServer.js
    const byTick = new Map();
    for (const entry of entries) {
      if (!byTick.has(entry.tick)) byTick.set(entry.tick, []);
      byTick.get(entry.tick).push(entry);
    }

    const limit = Math.max(totalTicks, ...entries.map(entry => entry.tick)) + 1;
    let guard = 0;
    while (this.match.status === 'playing' && this.match.world.tickCount < limit && guard < limit + 10) {
      const tick = this.match.world.tickCount;
      for (const entry of byTick.get(tick) ?? []) {
        this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId ?? null);
      }
      this.match.step();
      this.match.consumeEvents();
      guard += 1;
    }
    for (const entry of entries) this.recorder.recordInput(entry);
    this.recorder.finalize(this.match.world.tickCount);
  }

$ grep -n toPersisted -A 4 src/server/gameServer.js
172:  toPersisted() {
173-    this.recorder.finalize(this.match.world.tickCount);
174-    return { replay: this.recorder.toJSON(), tick: this.match.world.tickCount };
175-  }
176-

$ grep -n const entities = state.entities.map -A 7 src/engine/stateSnapshot.js
230:    const entities = state.entities.map(e => [
231-      e.entityId,
232-      e.alive,
233-      Math.round(e.x),
234-      Math.round(e.y),
235-      Math.round(e.health),
236-      e.activeWeaponId ?? null,
237-      // Die Waffenliste als Zeichenkette, damit die Reihenfolge zählt.

$ grep -n jumped: -A 5 src/client/ereignisse.js
424:  jumped: {
425-    lokal: (k, n) => {
426-      k.hud.log(`${k.nameOf(n.playerId)} springt${n.double ? ' (Doppelsprung)' : ''}`, 'accent');
427-    },
428-  },
429-

$ grep -n weapon_dropped, -A 2 src/client/ereignisse.js

$ sed -n 459,470p src/client/ereignisse.js
   * Spieler konnte nicht aufnehmen und erfuhr keinen Grund.
   */
  crate_pickup_blocked: {
    lokal: (k) => {
      // Der Vorrat ist voll: das ist der Moment, in dem Abwerfen nötig wird.
      k.hud.log('Vorrat voll — erst eine Waffe abwerfen (Q)', 'danger');
    },
    online: (k) => {
      // Online gibt es kein Abwerfen — nur der Zustand, keine Taste.
      k.hud.log('Vorrat voll — die Waffe kann nicht aufgenommen werden', 'danger');
    },
  },

$ grep -n this.#broadcastControl(event.type -B 1 -A 1 src/server/gameServer.js
246-    for (const event of this.match.consumeEvents()) {
247:      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
248-    }

$ grep -n #broadcastControl(type, payload) -A 6 src/server/gameServer.js
591:  #broadcastControl(type, payload) {
592-    const message = controlMessage(type, payload);
593-    for (const socket of this.clients.values()) {
594-      if (socket.readyState === 1) socket.send(message);
595-    }
596-  }
597-}

$ grep -n case CONTROL.INPUT\|case CONTROL.SELECT_WEAPON\|handleWeaponSelect src/server/gameServer.js
467:  handleWeaponSelect(token, weaponId) {
1152:          case CONTROL.INPUT: {
1162:          case CONTROL.SELECT_WEAPON: {
1165:            const result = session.handleWeaponSelect(context.token, message.weaponId);

$ grep -n sendInput(angle, power, weaponId -A 12 src/client/networkClient.js
427:  sendInput(angle, power, weaponId = null) {
428-    if (!this.isConnected || !this.#socket) return false;
429-    const snapshot = this.latestSnapshot;
430-    this.#socket.send(controlMessage(CONTROL.INPUT, {
431-      angle,
432-      power,
433-      weaponId,
434-      // Nicht der rohe Snapshot-Tick, sondern der fortgeschriebene: siehe
435-      // `referenzTick` oben. Ein zu alter Tick lässt der Server als
436-      // „ausserhalb des Lag-Kompensationsfensters" fallen, und dann verpufft ein
437-      // gueltiger Schuss.
438-      tick: referenzTick({
439-        snapshotTick: snapshot?.tick,

$ grep -n REPLAY_FORMAT_VERSION = \|hatSidegrades = \|hatLoadouts =  src/engine/replay.js
22:export const REPLAY_FORMAT_VERSION = 1;
55:    const hatSidegrades = Array.isArray(sidegrades) && sidegrades.some(s => s !== null && s !== undefined);
56:    const hatLoadouts = Array.isArray(loadouts) && loadouts.some(l => l !== null && l !== undefined);

$ grep -n parsed.format !== REPLAY_FORMAT_VERSION -A 5 src/engine/replay.js
192:    if (!parsed || parsed.format !== REPLAY_FORMAT_VERSION) {
193-      throw new Error(`Unbekanntes Replay-Format: ${parsed?.format}`);
194-    }
195-    const recorder = new ReplayRecorder({ seed: parsed.seed, ...parsed.config });
196-    if (Number.isInteger(parsed.totalTicks)) recorder.finalize(parsed.totalTicks);
197-    for (const entry of parsed.entries ?? []) recorder.recordInput(entry);

$ grep -n parseControlMessage -A 6 src/shared/protocol.js
589:export function parseControlMessage(raw) {
590-  try {
591-    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
592-    if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') return null;
593-    return parsed;
594-  } catch {
595-    return null;

$ grep -n kein Rauschen\|leeres Feld\|OBJEKT statt eines Arrays -B 1 -A 3 tests/replay-head.test.js
106-
107:test('Ein leeres Feld wird NICHT aufgenommen (kein Rauschen im Kopf)', () => {
108-  /*
109:   * Die andere Seite: Ein Kopf ohne Nebenwirkungen soll auch kein leeres Feld
110-   * tragen — sonst wären alte und neue Aufzeichnungen ohne Grund verschieden.
111-   */
112-  const recorder = new ReplayRecorder({
--
124-
125:test('Ein OBJEKT statt eines Arrays wird still verworfen — das ist dokumentiert', () => {
126-  /*
127-   * Diese Prüfung hält das Verhalten fest, das beim Schreiben der Tests zwei
128-   * Fehlschläge verursacht hat: `{ 1: 'gepanzert' }` ist KEIN gültiges Format.

$ git log --oneline -2
32b1f81 test(replay): Wache fuer den Befund, dass ein Sprung nicht aufzeichenbar ist
01db34e feat(client): Guenther online sichtbar und meldend (Anschluss an Protokoll v7)

$ git status --short
?? docs/duplikate-bericht.md
?? docs/optimierung-bericht.md
```

**Zum `git status`:** Die gezeigten ungetrackten Dateien stammen **nicht** aus
dieser Arbeit — sie lagen bereits vor bzw. entstanden parallel in anderen
Durchgängen. Diese Datei war zum Zeitpunkt des Beleglaufs noch nicht erfasst.
Der abschließende Stand nach dem Schreiben (wörtlich, ausgeführt um 22:15):

```
$ git status --short
?? docs/auftraege/online-sprung-und-abwurf.md
?? docs/duplikate-bericht.md
?? docs/optimierung-bericht.md
?? docs/todo-abgleich.md

$ git diff --stat
(leer = keine Änderung an getrackten Dateien)
```

`git diff --stat` ist leer: an `src/**`, `tests/**`, `index.html` und
`vite.config*` wurde **nichts** angefasst. Das ist die Bedingung, unter der
dieses Dokument entstanden ist (der Auftraggeber fuhr gleichzeitig einen
E2E-Lauf über einen Vite-Dev-Server).

Zusätzlich ausgeführt (nicht Teil des Skripts, Ausgabe wörtlich):

```
$ grep -n "key === 'Shift'" src/client/input.js
152:    if (key === 'Shift') {

$ grep -rn "weapon_dropped" src/client/ tests/event-coverage.test.js
tests/event-coverage.test.js:195:  'weapon_dropped',    // `dropWeapon()` meldet das Ergebnis direkt im Log

$ grep -n "landed:\|fall_damage:\|jumped:" src/client/ereignisse.js
424:  jumped: {
430:  landed: {
436:  crate_landed: {
537:  fall_damage: {

$ grep -n "case CONTROL.INPUT" -A 2 src/server/gameServer.js
1152:          case CONTROL.INPUT: {
1153-            const session = this.#sessions.get(context.lobbyId);
1154-            if (!session) throw new Error('Keine aktive Sitzung');
$ sed -n "1198,1201p" src/server/gameServer.js
            break;

          default:
            socket.send(controlMessage(CONTROL.ERROR, { error: `Unbekannter Nachrichtentyp: ${message.t}` }));

$ grep -n "CONTROL.ERROR" src/server/gameServer.js
991:        socket.send(controlMessage(CONTROL.ERROR, {
999:        socket.send(controlMessage(CONTROL.ERROR, { error: 'Ungültige Nachricht' }));
1141:              socket.send(controlMessage(CONTROL.ERROR, {
1157:              socket.send(controlMessage(CONTROL.ERROR, { errors: result.errors }));
1166:            if (!result.ok) socket.send(controlMessage(CONTROL.ERROR, { errors: result.errors }));
1201:            socket.send(controlMessage(CONTROL.ERROR, { error: `Unbekannter Nachrichtentyp: ${message.t}` }));
1212:        socket.send(controlMessage(CONTROL.ERROR, { error: error.message }));

$ grep -n LOADOUTS src/shared/protocol.js
103:  LOADOUTS: 'loadouts',

$ grep -n "crates:" -A 7 src/engine/stateSnapshot.js
281:      crates: (state.crates ?? []).map(c => [
282-        c.entityId ?? null,
283-        Math.round(c.x),
284-        Math.round(c.y),
285-        c.crateType ?? null,
286-        c.rarity ?? null,
287-        c.weaponId ?? null,
288-      ]),

$ grep -n "export function hashState" src/engine/stateSnapshot.js
223:export function hashState(state) {

$ grep -rc "weapon_dropped" tests/event-coverage.test.js tests/drop-mechanic.test.js
tests/event-coverage.test.js:1
tests/drop-mechanic.test.js:1

$ ls -l tests/replay-sprung-luecke.test.js
-rw-rw-r-- 1 patrick patrick 7856 Sep 26 22:05 tests/replay-sprung-luecke.test.js

$ grep -n 'Math.min(1, Number(horizontal)' src/engine/match.js
1280:    const richtung = Math.max(-1, Math.min(1, Number(horizontal) || 0));
```

Und die Sonde aus F.3 (`/tmp/pa-sonde-sprunglog.mjs`, außerhalb des Repos;
gemessen am Stand `32b1f81`, Seed 20260926, `hills`, ein `match.jump(aktiv, 1)` im
vierten Takt):

```
Sprung-Ergebnis: {"ok":true,"jumpsLeft":1,"impulse":10.12,"double":false}
Takt: 4
Ereignisarten nach dem Sprung: ["jumped"]
Log-Zeilen aus dem EREIGNIS-Weg: [["Figur#1 springt","accent"]]
Anzahl: 1
```
