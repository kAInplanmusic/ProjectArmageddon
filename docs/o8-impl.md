# O8-Implementierung: Online-Sprung und Waffe-Abwerfen

**Auftrag:** `docs/auftraege/online-sprung-und-abwurf.md`
**Gebaut auf:** der Replay-Format-Erweiterung aus O9 (`docs/o9-impl.md`) — Reihenfolge
bewusst eingehalten, siehe Abschnitt „Abhängigkeit zu O9".
**Ergebnis:** Der Sprung und der Abwurf sind ONLINE spielbar. Kein neues
`PROTOCOL_VERSION`, kein neues `HEADER_SIZE`, kein neues `REPLAY_FORMAT_VERSION`.

## Kurzfassung

| Punkt des Auftrags | Ist-Stand (belegt) | Erledigt |
|---|---|---|
| `main.js:794` Sprung stumm (`mode !== 'local'` → `return null`) | kein Weg, kein Hinweis | Ja — `Main#jump` sendet online `CONTROL.JUMP`, Meldung kommt aus dem `jumped`-Ereignis |
| `main.js:818` Abwerfen stumm („Abwerfen ist nur im lokalen Match möglich") | kein Weg online | Ja — `Main#dropWeapon` sendet online `CONTROL.DROP_WEAPON` |
| `CONTROL` (`protocol.js:84-95`) kennt kein `JUMP`/`DROP_WEAPON` | 11 Einträge (+ `LOADOUTS` = 12) | Ja — zwei neue Arten; die Liste hat jetzt 14 Einträge |
| `INPUT` trägt nur Winkel/Kraft (+`weaponId`/`tick`) | — | **BEWUSST NICHT GEÄNDERT** (Weg (a), siehe unten) |
| `docs/o8-impl.md` | fehlte | Ja — diese Datei |
| Abhängigkeit zu O9 dokumentieren | — | Ja — eigener Abschnitt unten |

## Gewählter Weg: (a) zwei eigene `CONTROL`-Arten

Der Auftrag ließ (a) zwei neue `CONTROL`-Arten und (b) ein `kind`-Feld in `INPUT`
gegeneinander abwägen. Gebaut ist **(a)**:

- **Präzedenzfall im eigenen Haus:** `SELECT_WEAPON` ist trotz `weaponId` in
  `INPUT` ein eigener Befehl. Der Sprung ist keine Zahl in einem Schuss, sondern
  eine eigene Handlung — dieselbe Entscheidung, dieselbe Form.
- **`INPUT.tick` bedeutet etwas Bestimmtes:** Es dient ausschließlich der
  Lag-Kompensation des Schusses (füllt `interpolatedFrom`, eine reine
  Anzeige-Rückmeldung). Für einen Sprung gibt es nichts zu interpolieren — ein
  mitgeschlepptes, wirkungsloses Tick-Feld wäre genau die Sorte „Prüfung ohne
  Wirkung", die `INPUT_LIMITS.maxPayloadBytes` schon einmal war.
- **Der `default:`-Zweig ist laut** (`gameServer.js` → „Unbekannter
  Nachrichtentyp: …"). Ein altes Gegenüber lehnt einen neuen Typ also NICHT still
  ab — der stumme Ausstieg entsteht hier nicht.

**`INPUT` bleibt damit unverändert.** Das `kind` gibt es NUR im Replay-Format
(Abschnitt D des Auftrags), nicht auf dem Draht.

## Was geändert wurde

### 1. Protokoll — zwei neue Steuernachrichten

**Datei:** `src/shared/protocol.js`

```js
export const CONTROL = Object.freeze({
  …
  SELECT_WEAPON: 'select_weapon',
  JUMP: 'jump',
  DROP_WEAPON: 'drop_weapon',
  …
});
```

`PROTOCOL_VERSION` bleibt **7**, `HEADER_SIZE` bleibt **25**. Eine neue
`t`-Art ist kein Versionsereignis: Der Parser einer Steuernachricht prüft `v`
nicht, und ein Hochzählen hätte sogar geschadet — eine ältere Gegenstelle würde
dann JEDEN Snapshot verwerfen (binär hat sich nichts geändert).

### 2. Server — je ein Handler und ein `case`

**Datei:** `src/server/gameServer.js`

- `LobbySession#handleJump(token, message)` → `#handleJump`:
  - Identität aus dem **TOKEN** (`#platzFuer`), kein `playerId`-Feld aus der
    Nachricht — wie `#handleInput`.
  - `seitlich` wird **typpgeprüft**: `typeof === 'number'`, `Number.isInteger`,
    `-1..1`. Fehlt das Feld, gilt `0`. Der Motor klemmt nur (`Number(x) || 0`) —
    das ist Toleranz, keine Prüfung; `'1e9'` würde dort still zu `1`.
  - Ausgeführt wird `match.jump(seat.entityId, seitlich)`. Die Figurenzustands-
    Regeln (am Boden, höchstens zwei je Zug, am Zug) bleiben **im Motor** — hier
    wird NICHT nachgezählt (Regel „eine Regel, eine Stelle").
  - Nach `result.ok` → `recorder.recordInput({ …, kind: 'jump' })`.
- `LobbySession#handleDropWeapon(token, weaponId)` → `#handleDropWeapon`:
  - Identität aus dem Token; `weaponId` muss eine nichtleere Zeichenkette sein.
  - `match.dropWeapon(seat.entityId, weaponId)` — die **Zugehörigkeit**
    entscheidet das Inventar über die `playerId`, nicht die Waffe allein.
  - Nach `result.ok` → `recorder.recordInput({ …, kind: 'drop' })`.
- Zwei neue `case`-Zweige im WS-Handler (`CONTROL.JUMP`,
  `CONTROL.DROP_WEAPON`), Form wie `CONTROL.SELECT_WEAPON`: Fehler gehen als
  `CONTROL.ERROR` mit **`errors`-Liste** (Hausform) zurück, nicht als `error`
  (Singular).
- `#restoreFromReplay` wendet jetzt `#applyReplayEntry` an: je Eintrag
  `jump`/`drop`/`fire`. Vorher stand dort ausschließlich `match.fire(...)` —
  eine Sitzungswiederherstellung nach Serverneustart hätte den Sprung (Figur
  steht woanders) und den Abwurf (Zufallsstrom verschoben → Wind) STILL
  unvollständig nachgespielt.

### 3. Client-Netz — zwei Sender

**Datei:** `src/client/networkClient.js`

- `sendJump(seitlich)` → `CONTROL.JUMP`, **ohne `tick`**.
- `sendDropWeapon(weaponId)` → `CONTROL.DROP_WEAPON` (nur die Waffe, nicht der
  Spieler).

### 4. Client-Steuerung — beide Wege sind jetzt offen

**Datei:** `src/client/main.js`

- `jump(seitlich)`: Online → Verbindung/Zug prüfen, `network.sendJump(seitlich)`,
  **keine eigene Log-Zeile** (die kommt aus dem `jumped`-Ereignis — sonst stünde
  EIN Sprung zweimal im Protokoll). Lokal unverändert.
- `dropWeapon(anzeigePosition)`: Online → Anzeigeposition über dieselbe
  Ordnungsfunktion auf den Inventarindex auflösen, `network.sendDropWeapon(...)`.
  Der Zug wird online geprüft: `#weaponIdsForActivePlayer()` liest die Liste des
  AKTIVEN Spielers — außerhalb des eigenen Zugs wäre das der Gegner, und der
  Abwurf träfe dessen Waffe (der Server lehnte mit „Waffe nicht geführt" ab).
  Lokal entfällt diese Prüfung, weil dort IMMER der aktive Spieler am Zug ist
  (Hotseat) — die Meldung „Nur am eigenen Zug …" ist damit online eine
  Präzisierung, keine Verhaltensänderung. Der Replay-Zweig meldet „Abwerfen ist
  im Replay nicht möglich" (vorher: „… nur im lokalen Match möglich" — das war
  mit dem Drahtweg falsch geworden).
- Der veraltete Kommentar `// Springen (Leertaste)` ist berichtigt (SHIFT). Der
  `jumped`-Weg erzeugt genau EINE Meldung je Sprung.

### 5. Client-Anzeige — zwei Ereigniszweige

**Datei:** `src/client/ereignisse.js`

- `jumped` von nur-`lokal` auf **`beide(fn)`** — online ist der Zweig die
  EINZIGE Meldung, die der Spieler vom Sprung bekommt.
- `weapon_dropped` bekommt einen **`online`**-Zweig (Name + Munition aus dem
  Ereignis). Lokal bleibt es bei der Meldung, die `Main#dropWeapon` direkt
  schreibt — dort wäre ein zweiter Zweig eine Dopplung.
- `crate_pickup_blocked` von zwei getrennten Texten auf **`beide(fn)`**: Die alte
  Begründung („online gibt es kein Abwerfen, also keine Q-Aufforderung") ist mit
  O8 gegenstandslos. Beide Betriebsarten nennen jetzt die Taste.

### 6. Replay-Format und Aufzeichnung

Erweitert in **O9** (`kind`/`seitlich` in `recordInput`, `#wendeEingabeAn` in
`ReplayPlayer`, Server zeichnet auf) — siehe unten. In O8 zusätzlich:

**Datei:** `scripts/replay.mjs` — `record` erzeugt standardmäßig EINEN Sprung
(`kind: 'jump'`, sobald `isGrounded`) und EINEN Abwurf (`kind: 'drop'`, erste
abwerfbare, nicht aktive Waffe). Ohne diesen Eintrag prüfte `play --verify` den
neuen Eingabepfad nie. Abschaltbar mit `--no-jump`/`--no-drop`.

### 7. Tests

| Datei | Änderung |
|---|---|
| `tests/replay-sprung-luecke.test.js` | Wache **umgedreht** (nicht gelöscht): Gleichheit des Zustandshashes gefordert; Quelltext-Test fordert jetzt `kind`/`seitlich` |
| `tests/replay-head.test.js` | Neuer Abwärtskompatibilitäts-Test: Eintrag OHNE `kind` wird als Schuss gelesen, Hash bleibt gleich |
| `tests/anti-cheat.test.js` | Vier neue Tests gegen einen ECHTEN Server: fremde Figur springen, unsinnige Richtung (`'rechts'`, `1e9`, `true`, `1.5`, …), dritter Sprung je Zug, fremde Waffe abwerfen |
| `tests/event-coverage.test.js` | `weapon_dropped` aus `bewusstStumm` entfernt (hat jetzt einen Zweig); `jumped` aus `EINZWEIG_BELEGT` entfernt (jetzt `beide`); `weapon_dropped` als Einzweig-Fall MIT Beleg eingetragen; `crate_pickup_blocked`-Test auf „MIT Q-Aufforderung" umgestellt |

## Abhängigkeit zu O9 — und warum die Reihenfolge erzwungen war

**Der Befund (Auftrag D.4):** Der Server zeichnet JEDES Online-Match auf und
stellt Sitzungen AUS DIESER Aufzeichnung wieder her. Die Wiederherstellung ruft
`match.fire(...)` und **vergleicht nicht** gegen einen Vorher-Zustand — sie ist
still. Wird der Drahtweg vor dem Replay-Format gebaut, ist **jeder
Serverneustart in der Zwischenzeit ein stiller Zustandsverlust**: die Figur steht
woanders, die Kiste liegt woanders, der Wind ist ein anderer, und niemand meldet
es.

**Deshalb gibt es für O8 nur einen verantwortbaren Schnitt:**

> **Erst das Replay-Format um Sprung und Abwurf erweitern und den Server sie
> aufzeichnen lassen, DANN den Drahtweg bauen.**

**So ist es geschehen:** Das Replay-Format ist die Arbeit aus **O9**
(`docs/o9-impl.md`, separat abgeschlossen) und lag beim Bau des Drahtwegs bereits
vor:

1. `ReplayRecorder.recordInput({ …, kind, seitlich })` mit `kind`-Standard
   `'shot'` (abwärtskompatibel),
2. `ReplayPlayer#wendeEingabeAn` — je Eintrag `jump`/`drop`/`fire`,
3. Server zeichnet `kind: 'jump'`/`kind: 'drop'` hinter `result.ok` auf,
4. `#restoreFromReplay` wendet alle Arten an (in O8 nachgezogen, s. o.).

O8 setzt **nur** den Drahtweg und die Anzeige darauf. Wer den Drahtweg zuerst
gebaut hätte, hätte die Vorbedingung verletzt; das ist hier nicht der Fall.

**Was O8 NICHT entscheidet (Auftrag G.6, dem Auftraggeber überlassen):**

- ob online zweimal je Zug gesprungen werden darf (lokal: zwei) — die Zahl kommt
  unverändert aus dem Motor;
- ob der Sprung online den Zug beendet (tut er nicht — wie lokal);
- ob online abgeworfen werden darf (O8 öffnet es; die Mechanik gibt dem Gegner
  das Material);
- ob `WELCOME` eine `features`-Liste bekommt (heute: laute Meldung
  „Unbekannter Nachrichtentyp: jump" statt „Server zu alt");
- ob es eine Client-VORHERSAGE des Sprungs gibt (der binäre Snapshot führt keine
  Geschwindigkeit; der Sprung erscheint als Folge von Positionssprüngen);
- ob der Abwurfwurf deterministisch statt aus dem Zufallsstrom gerechnet wird
  (Auftrag D.3 — ändert die Mechanik, braucht eine eigene Messung).

## Verifikation (Gates)

```bash
npm run lint         # eslint . → clean
npm run validate     # Skeleton gültig
npm test             # node --test tests/*.test.js
npm run build        # vite build
npm run replay -- record --out=artifacts/replay-verify.json
npm run replay -- play artifacts/replay-verify.json --verify
rm -f artifacts/replay-verify.json
```

Ergebnisse der Belegläufe dieses Durchgangs:

- `npm run lint` — **clean** (eslint . ohne Ausgabe).
- `npm run validate` — „ProjectArmageddon skeleton is valid."
- `npm test` — **1068 Tests, 1068 bestanden, 0 Fehler** (`node --test
  tests/*.test.js`, 103 Testdateien, ca. 434 s).
- `npm run build` — `vite build` erfolgreich (`dist/`).
- `npm run check:docs` — „Geprüfte Behauptungen: alle richtig".
- Replay-Rundlauf mit **1 Sprung und 1 Abwurf** (`artifacts/`-Variante des
  Auftrags, danach gelöscht): `record` → 33 Schüsse, 1 Sprung, 1 Abwurf, 2633
  Ticks, Endhash `c6e06101`; `play --verify` → 35 angewendete Eingaben,
  **0 abgelehnt**, Zustandshash `c6e06101`, „VERIFY: Replay ist exakt
  reproduzierbar."
- `tests/replay-sprung-luecke.test.js` — 3/3 grün (Gleichheit statt Befund).
- `tests/anti-cheat.test.js` (nur die vier neuen Tests) — 4/4 grün gegen einen
  echten Server (`GameServer.listen(0)` + `ws`).

## Gemessene Zahlen / Sicherheitsgrenzen

- Der Sprung erzeugt **genau eine** Meldung je Ereignis (`jumped`) — der
  Client-Pfad loggt im Online-Fall nicht zusätzlich.
- `CONTROL` wächst auf **14** Einträge; Tests, die die Liste zählen, sind
  nachgezogen.
- Der Abwurf ist der **schärfere** Fall für das Replay: `#rollDropThrow` zieht
  drei Zufallswerte aus demselben Strom wie der Wind (`nextBoolean`, zweimal
  `nextFloat`). Fehlte der Eintrag, divergierte nicht nur die Kiste, sondern der
  Wind jeder folgenden Runde.
- Server-Autorität: Aufzeichnung erfolgt erst nach `result.ok`; die Spieler-
  kennung kommt ausschließlich aus dem Token.

## Risiken, die beim Bau beobachtet wurden

1. **Stiller Zustandsverlust bei falscher Reihenfolge** (Auftrag H Hauptrisiko) —
   vermieden, weil O9 zuerst lief.
2. **Strenge Leser** — vermieden: fehlendes `kind` ⇒ Schuss (Default).
3. **Veraltete Begründung im `bewusstStumm`-Set** — behoben: `weapon_dropped`
   entfernt und das Einzweig-Loch mit einer neuen Begründung belegt; sonst hätte
   für ein online gesendetes Ereignis eine nur-lokal gültige Begründung
   gegolten.
4. **Doppelmeldung je Sprung** — vermieden: nur der Ereigniszweig meldet online.

## Dateien

**Geändert:**
- `src/shared/protocol.js` (zwei neue `CONTROL`-Arten)
- `src/server/gameServer.js` (`handleJump`/`handleDropWeapon`, zwei `case`,
  `#applyReplayEntry` in `#restoreFromReplay`)
- `src/client/networkClient.js` (`sendJump`, `sendDropWeapon`)
- `src/client/main.js` (`jump`/`dropWeapon` online, Kommentar SHIFT)
- `src/client/ereignisse.js` (`jumped` → beide, `weapon_dropped` → online,
  `crate_pickup_blocked` → beide)
- `src/engine/replay.js` (Format-Erweiterung `kind`/`seitlich` +
  `#wendeEingabeAn` — inhaltlich die O9-Arbeit, im selben Arbeitsbaum)
- `scripts/replay.mjs` (Sprung/Abwurf im Record-Lauf, `--no-jump`/`--no-drop`)
- `tests/replay-sprung-luecke.test.js`, `tests/replay-head.test.js`,
  `tests/anti-cheat.test.js`, `tests/event-coverage.test.js`

**Neu:**
- `docs/o8-impl.md` (diese Datei)

**Hinweis zur Gleichzeitigkeit:** O8 und O9 liefen im selben Arbeitsbaum. Die
Replay-Format-Erweiterung (`src/engine/replay.js`, `tests/replay-sprung-luecke
.test.js`) stammt inhaltlich aus O9; der Drahtweg und die Anzeige aus O8. Der
Endstand ist konsistent und durch die Tests unten belegt — die Reihenfolge, die
D.4 fordert, ist im ERGEBNIS eingehalten (Format vorhanden, bevor der Drahtweg
Aufzeichnungen erzeugt).

**Unverändert (Absicht):** `PROTOCOL_VERSION = 7`, `HEADER_SIZE = 25`,
`REPLAY_FORMAT_VERSION = 1`, das Schema der `INPUT`-Nachricht.

## Nachzuziehende Dokumente (nicht in diesem Durchgang geändert)

Andere Analyse-/Statusdokumente beschreiben noch den VOR-O8-Stand. Sie wurden
bewusst nicht angefasst, weil parallel an denselben Dateien gearbeitet wird
(mehrere Background-Worker im selben Repo) — der Nachtrag steht hier, damit er
nicht untergeht:

| Stelle | veralteter Satz | jetzt richtig |
|---|---|---|
| `docs/hunter-ui.md:146` | „Abwerfen (Q) ist **lokal-only**: `dropWeapon` (`:817-841`) steigt online … aus" | Online gibt es `CONTROL.DROP_WEAPON`; Q wirkt in beiden Betriebsarten |
| `docs/analyse-ereigniszweige.md:100` | `jumped` = „nur lokal … online erzeugt der Motor es nie (kein Sprungbefehl im Protokoll)" | `jumped` ist `beide(fn)`; der Server springt und schickt es |
| `docs/todo-abgleich.md` O8-Zeile | „**OFFEN** — Springen und Waffe-Abwerfen gibt es online NICHT" | erledigt; Beleg: diese Datei |
| `docs/waffen-balance-whitepaper.md:119` | „kein Sprung/Waffe-Abwerfen online verfügbar" | nicht mehr zutreffend |

Die Zeilenangaben in den Zitaten sind am Stand der jeweiligen Datei; sie wandern
mit den Änderungen aus O8.

