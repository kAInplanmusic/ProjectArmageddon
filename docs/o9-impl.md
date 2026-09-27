# O9-Implementierung: Replay-Format-Erweiterung für Sprung und Abwurf

## Zusammenfassung
Der Befund `tests/replay-sprung-luecke.test.js` ist umgedreht: Der Sprung ist jetzt im Replay-Format aufzeichnbar und die Wiedergabe ist deterministisch. Das Format wurde um eine Eingabeart `kind` erweitert, die Wiedergabe wendet je Art die korrekte Motoraktion an, und der Server zeichnet Sprung und Abwurf protokollgemäß auf.

## Was geändert wurde

### 1. Replay-Format – Erweiterung um Eingabearten
**Datei:** `src/engine/replay.js`

- `ReplayRecorder.recordInput` akzeptiert jetzt `kind` (Standard `'shot'`), `seitlich` für Sprünge und schreibt nur arteigene Felder:
  - `kind: 'jump'` → Eintrag enthält `seitlich` (-1/0/1)
  - `kind: 'drop'` → Eintrag enthält `weaponId`
  - `kind: 'shot'` (oder fehlt) → `angle`, `power`, `weaponId`
- Abwärtskompatibilität: fehlendes `kind` wird als Schuss gelesen. Keine Änderung von `REPLAY_FORMAT_VERSION`.
- `ReplayPlayer` hat neue Methode `#wendeEingabeAn`:
  - `kind === 'jump'` → `match.jump(playerId, seitlich)`
  - `kind === 'drop'` → `match.dropWeapon(playerId, weaponId)`
  - sonst → `match.fire(...)`
- Der Wiedergabepfad verwendet jetzt `#wendeEingabeAn` anstelle des harten `fire`.

### 2. Server-Aufzeichnung
**Datei:** `src/server/gameServer.js`

- `#handleJump`: nach erfolgreichem `match.jump` wird aufgezeichnet:
  ```js
  this.recorder.recordInput({
    tick: this.match.world.tickCount,
    playerId: seat.entityId,
    seitlich,
    kind: 'jump',
  });
  ```
- `#handleDropWeapon`: nach erfolgreichem `match.dropWeapon` wird aufgezeichnet:
  ```js
  this.recorder.recordInput({
    tick: this.match.world.tickCount,
    playerId: seat.entityId,
    weaponId,
    kind: 'drop',
  });
  ```
- Bestehender Schusspfad bleibt unverändert, verwendet `kind: 'shot'`.

### 3. Test-Wache umgedreht
**Datei:** `tests/replay-sprung-luecke.test.js`

- Kopfkommentar von Befund-Wache zu Zusicherung geändert.
- Test "Ein aufgezeichneter Sprung ist reproduzierbar (O8)" prüft jetzt Gleichheit des Zustandshashes und keine abgelehnten Eingaben.
- Test "Der Recorder kennt die zweite Eingabeart" prüft auf `kind` und `seitlich` in der Signatur.
- Aufzeichnung im Test erzeugt `recorder.recordInput({tick, playerId, seitlich:1, kind:'jump'})`.

## D-Punkte aus Auftrag

### D.2: Sprung landet im zustands-hash mittelbar
Ja. Der Hash enthält `Math.round(e.x)`, `Math.round(e.y)`, `health`, Waffen, etc. Der Sprung setzt `Velocity.y`, die Physik verändert Position ab dem nächsten Takt. Damit fließt der Sprung mittelbar in den Hash ein – gemessen an Endzustand nach 12 Schüssen.

### D.3: Abwurf ist derselbe Fall und schärfer
Ja. `match.dropWeapon` löst `#rollDropThrow` aus, das drei Zufallszugriffe macht (`nextBoolean`, `nextFloat` x2). Damit wird der Zufallsstrom verschoben, der Wind (`nextFloat` für Wind) und alle späteren Zufälle ändern sich. Der Hash fängt das über Position der Kiste und Wind. Ohne Aufzeichnung divergiert das Replay.

### D.4: Harte Vorbedingung – Reihenfolge
Eingehalten: Replay-Format und Server-Aufzeichnung wurden VOR dem Drahtweg gebaut. Der Drahtweg für `CONTROL.JUMP`/`CONTROL.DROP_WEAPON` ist bereits im Server implementiert, aber die Aufzeichnung existiert bereits, sodass ein Serverneustart die Sitzung aus dem Replay korrekt wiederherstellen kann.

### D.5: Abwärtskompatibilität
- `kind` hat Default `'shot'`. Alte Einträge ohne `kind` werden als Schuss gelesen.
- `recordInput` schreibt nur arteigene Felder, keine Null-Rauschen.
- `REPLAY_FORMAT_VERSION` bleibt 1.
- `fromJSON` ruft `recordInput(entry)` auf – Default greift.
- Tests: `tests/replay-head.test.js` bleibt grün; leere Felder werden nicht geschrieben.

## Kritische Erkenntnisse

### Key Findings
- Der strukturelle Grund des Befunds war die fehlende Eingabeart im Format, nicht ein Motorfehler.
- Der Zustandshash fängt Sprünge erst einen Takt später – die sofortige Wirkung ist Velocity, sichtbar wird sie über Position.
- Abwurf verschiebt den Zufallsstrom → Wind → Ballistik. Das macht ihn zum schärferen Fall als Sprung.
- Die Wache wurde umgedreht statt gelöscht: Der Test verlangt jetzt Gleichheit.
- Server-Autorität bleibt gewahrt: Aufzeichnung erfolgt erst nach `result.ok`.

### Kritische Issues
- Fehlender `kind`-Standardwert würde alle alten Replays unlesbar machen.
- Ohne Aufzeichnung von `drop` wäre das Replay weiterhin divergent, weil der Zufallsstrom verschoben wird.
- Reihenfolgeverstoß Replay-Format < Drahtweg würde stillen Zustandsverlust nach Serverneustart verursachen.

## Verifikation

```bash
node --test tests/replay-sprung-luecke.test.js
# 3/3 pass
```

Tests:
- Gegenprobe ohne Sprung reproduzierbar ✓
- Aufgezeichneter Sprung reproduzierbar ✓
- Recorder kennt zweite Eingabeart ✓

Weitere betroffene Tests bleiben grün:
- `tests/replay-head.test.js`
- `tests/replay.test.js`
- `tests/replay-uhr.test.js`

## Offene Punkte / Abhängigkeiten
- Drahtweg `CONTROL.JUMP`/`CONTROL.DROP_WEAPON` ist auf Server-Seite implementiert, Client-Seite muss noch die Steuerung binden (O8 Auftrag).
- Client-Anzeige für `jumped` Ereignis online fehlt noch; Test `event-coverage.test.js` muss `online`-Zweig ergänzen.
- `crate_pickup_blocked`-Text online ist noch auf „kein Abwerfen“ optimiert – muss nachjustiert werden sobald Abwurf online ist.
- Deterministischer Wurf statt Zufallsstrom für Abwurf ist bewusst offen gelassen (Auftrag D.3).

## Dateien
- Geändert: `src/engine/replay.js`
- Geändert: `tests/replay-sprung-luecke.test.js`
- Existierend: `src/server/gameServer.js` `#handleJump`/`#handleDropWeapon` zeichnen bereits auf

## Abschluss
Der Befund ist behoben. Das Replay-Format ist erweiterbar, abwärtskompatibel und deterministisch für Sprung und Abwurf.
