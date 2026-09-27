# Hunter-Doku-Nachzug — O8 ist umgesetzt: was in den Berichten noch als offen stand

**Erzeugt:** 2026-09-27, 03:43 CEST (Worker C), rein lesend am Code geprüft.
**Auftrag:** Die Berichte, die O8 (Online-Sprung und Waffe-Abwerfen) noch als
offen führen, am **Code** nachziehen — umschreiben, was wirklich überholt ist;
stehen lassen und als geprüft markieren, was noch stimmt.
**Stand der Arbeitskopie:** HEAD `68f551c` („feat(O8,O9): Online-Sprung und
Waffe-Abwerfen ueber den Drahtweg").

**Geschriebene Dateien (nur diese fünf):** `docs/hunter-ui.md`,
`docs/analyse-ereigniszweige.md`, `docs/todo-abgleich.md`,
`docs/waffen-balance-whitepaper.md`, `docs/hunter-doku-nachzug.md` (diese Datei).
**Nicht angefasst:** `src/**`, `tests/**`, `tools/**`, `bgworker-todo.json`,
`docs/o8-impl.md`, `docs/o9-impl.md`, `docs/hunter-arch.md`, `docs/hunter-physics.md`,
`docs/hunter-terrain.md`, `docs/hunter-tools.md`, `MASTERDOTO.md`.

---

## 0. Ergebnis in drei Sätzen

**O8 ist im Code umgesetzt** — der Online-Sprung und das Waffe-Abwerfen laufen
über eigene Steuernachrichten (`CONTROL.JUMP`, `CONTROL.DROP_WEAPON`), mit
Server-Handlern, Client-Sendern und Anzeigezweigen; die vier im O8-Bericht
genannten Fundstellen waren damit **überholt und sind richtiggestellt**. Bei der
Prüfung kamen **fünf weitere überholte Stellen** in denselben Berichten heraus
(darunter die zweite Stelle in `hunter-ui.md`, die Zählung der Ereigniszweige und
der ganze Abschnitt 6 der Ereignisanalyse). **Ein Befund ist NEU und steht
nirgends:** `crate_landed` wird seit O8 auch online erzeugt und fällt dort still
weg — gedeckt nur durch den `bewusstStumm`-Eintrag (Abschnitt 4).

---

## 1. Der Beleg am Code (wörtliche Ausgaben)

Alle Ausgaben sind unverändert übernommen. Ausgeführt in
`/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon`.

### 1.1 Drahtweg: das Protokoll kennt Sprung und Abwurf

```
$ grep -n 'JUMP\|DROP_WEAPON' src/shared/protocol.js
93:  JUMP: 'jump',
94:  DROP_WEAPON: 'drop_weapon',
```

`PROTOCOL_VERSION` und `HEADER_SIZE` wurden bewusst **nicht** angehoben (eine
neue `t`-Art ist kein Versionsereignis). Alle Treffer im Quellbaum:

```
$ grep -rn "JUMP\|DROP_WEAPON" src/
src/engine/match.js:335:const JUMP_IMPULSE = 9.2;
src/engine/match.js:340:const DOUBLE_JUMP_FACTOR = 0.8;
src/engine/match.js:342:const JUMP_SIDE_IMPULSE = 2.4;
src/engine/match.js:393:const JUMP_SPEED_INFLUENCE_ABOVE = 0.5;
src/engine/match.js:395:const JUMP_SPEED_INFLUENCE_BELOW = 0.25;
src/engine/match.js:1206:   * Die Zahlen samt Messung stehen bei den Konstanten `JUMP_SPEED_INFLUENCE_*`.
src/engine/match.js:1218:    const dampf = abweichung >= 0 ? JUMP_SPEED_INFLUENCE_ABOVE : JUMP_SPEED_INFLUENCE_BELOW;
src/engine/match.js:1280:    const impuls = JUMP_IMPULSE * (istDoppel ? DOUBLE_JUMP_FACTOR : 1) * langsam * beweglichkeit;
src/engine/match.js:1286:      this.#world.setComponent(playerId, 'Velocity', 'x', vxAlt + richtung * JUMP_SIDE_IMPULSE);
src/shared/config/classes.js:338:         * JUMP_SPEED_INFLUENCE_ABOVE in match.js): Der Scout springt höher als
src/shared/config/classes.js:450:     * JUMP_SPEED_INFLUENCE_ABOVE in match.js). Vorher stand der Wert unter
src/shared/protocol.js:93:  JUMP: 'jump',
src/shared/protocol.js:94:  DROP_WEAPON: 'drop_weapon',
src/client/networkClient.js:465:    this.#socket.send(controlMessage(CONTROL.JUMP, { seitlich }));
src/client/networkClient.js:481:    this.#socket.send(controlMessage(CONTROL.DROP_WEAPON, { weaponId }));
src/client/ereignisse.js:487:   * Abwerf-Weg online (`CONTROL.DROP_WEAPON`) — die Taste wirkt dort genauso wie
src/server/gameServer.js:1295:          case CONTROL.JUMP: {
src/server/gameServer.js:1303:          case CONTROL.DROP_WEAPON: {
```

### 1.2 Server: Handler und Verteiler

```
$ grep -n 'handleJump\|handleDropWeapon' src/server/gameServer.js
517:  handleJump(token, message = {}) {
518:    const result = this.#handleJump(token, message);
526:  #handleJump(token, message) {
561:   * Wie `handleJump` eine eigene Steuernachricht. Die Zugehörigkeit der Waffe
570:  handleDropWeapon(token, weaponId) {
571:    const result = this.#handleDropWeapon(token, weaponId);
579:  #handleDropWeapon(token, weaponId) {
1298:            const result = session.handleJump(context.token, message);
1306:            const result = session.handleDropWeapon(context.token, message.weaponId);
```

```
$ grep -n 'case CONTROL.JUMP\|case CONTROL.DROP_WEAPON' src/server/gameServer.js
1295:          case CONTROL.JUMP: {
1303:          case CONTROL.DROP_WEAPON: {
```

### 1.3 Client: Sender und Aufrufer

```
$ grep -n 'sendJump\|sendDropWeapon\|CONTROL.JUMP\|CONTROL.DROP_WEAPON' src/client/networkClient.js
463:  sendJump(seitlich = 0) {
465:    this.#socket.send(controlMessage(CONTROL.JUMP, { seitlich }));
479:  sendDropWeapon(weaponId) {
481:    this.#socket.send(controlMessage(CONTROL.DROP_WEAPON, { weaponId }));
```

```
$ grep -n "jump(seitlich\|dropWeapon(anzeigePosition\|sendJump\|sendDropWeapon\|onJump\|onDrop" src/client/main.js
178:      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
181:      onJump: seitlich => this.jump(seitlich),
794:  jump(seitlich = 0) {
812:      this.network.sendJump(seitlich);
838:  dropWeapon(anzeigePosition) {
862:      this.network.sendDropWeapon(weaponId);
886:    this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i), onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()), onJump: seitlich => this.jump(seitlich) });
```

### 1.4 Anzeige: die Ereigniszweige

```
$ grep -n 'jumped\|weapon_dropped' src/client/ereignisse.js
437:  jumped: beide((k, n) => {
469:   * Zweig fiele `weapon_dropped` STUMM weg, und der Spieler sähe nur eine neue
472:  weapon_dropped: {
```

### 1.5 Motor: Emitter

```
$ grep -n "jump(playerId\|emit('jumped'\|dropWeapon(playerId\|inFlight: 1\|emit('weapon_dropped'" src/engine/match.js
1241:  jump(playerId, horizontal = 0) {
1292:    this.#events.emit('jumped', {
2128:  dropWeapon(playerId, weaponId) {
2159:      inFlight: 1,
2167:    this.#events.emit('weapon_dropped', {
```

### 1.6 Messungen (selbst gefahren)

**Zählung der Ereigniszweige** (`typeof` auf `lokal`/`online`, nicht Textsuche):

```
$ node --input-type=module -e "… typeof v.lokal === 'function' …"
Eintraege gesamt: 39
beide: 32 | nur lokal: 1 | nur online: 5 | ohne Zweig: 1
nur lokal: crate_landed
nur online: terrain_destroyed, projectile_spawn, weapon_dropped, turn_start, karte_unerreichbar
ohne Zweig: drowning
```

**Menge `bewusstStumm`** (aus `tests/event-coverage.test.js`, Block ab `:184`):

```
$ node /tmp/bewusst.mjs
Anzahl: 12
turn_start, turn_end, entity_in_water, damage, dot_applied, shot, weapon_cooldown, crate_landed, drowning, round_crates, projectile_expired, water_pushed
```

**Sonde: erzeugt ein Abwurf `crate_landed`?** (Motorlauf, seed 4242, teams 2,
playersPerTeam 2, `turnDurationMs` 1000000, 600 Ticks nach dem Abwurf):

```
$ node /tmp/probe-crate.mjs
dropWeapon -> {"ok":true,"crateId":6,"x":512,"y":498,"vx":-7.411610719331819,"vy":-10.863472979748622,"ammo":6}
Ereignisse in 600 Ticks nach dem Abwurf: {"landed":344,"crate_landed":1}
```

### 1.7 Tests

```
$ grep -n '^test(' tests/replay-sprung-luecke.test.js
123:test('Die Gegenprobe: OHNE Sprung ist die Aufzeichnung reproduzierbar', () => {
139:test('Ein aufgezeichneter Sprung ist reproduzierbar (O8)', () => {
163:test('Der Recorder kennt die zweite Eingabeart: den Sprung', () => {
```

```
$ node --test tests/replay-sprung-luecke.test.js
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 850.894258
```

Vier **neue** Anti-Cheat-Tests gegen einen echten Server (`git diff` gegen `b123919`):

```
$ git diff b123919..HEAD -- tests/anti-cheat.test.js | grep '^+' | grep 'test('
test('Der Client kann keinen Sprung für eine fremde Figur auslösen', { timeout: 30_000 }, async () => {
test('Die Sprungrichtung wird TYPGEPRÜFT, nicht still geklemmt', { timeout: 30_000 }, async () => {
test('Ein dritter Sprung im selben Zug wird abgelehnt', { timeout: 30_000 }, async () => {
test('Der Client kann keine FREMDE Waffe abwerfen', { timeout: 30_000 }, async () => {
```

---

## 2. Stelle für Stelle: was umgeschrieben wurde

In der Reihenfolge des O8-Berichts (`docs/o8-impl.md`, Abschnitt „Nachzuziehende
Dokumente"). **Alle Zeilenangaben in den Spalten sind der Ausgangsstand VOR dem
Nachzug** — sie sind durch die Einfügungen gewandert (in den Dateien selbst steht
an jeder geänderten Stelle die heute gültige Nummer).

### 2.1 `docs/hunter-ui.md`

| Stelle | Stand vorher | Nachher |
|---|---|---|
| `:146-147` (**im O8-Bericht genannt**) | „Abwerfen (Q) ist **lokal-only**: `dropWeapon` (`:817-841`) steigt online vorzeitig aus … es gibt keinen Online-Aufrufer" | Abwerfen (Q) wirkt in **beiden** Betriebsarten; Online-Zweig `main.js:847`, `sendDropWeapon` `main.js:862` → `networkClient.js:479` (sendet `:481`) → `protocol.js:94` |
| `:221-222` (**zusätzlich gefunden**) | „`jump()` (`:793-806`) und `dropWeapon()` (`:817-841`) sind lokal-only; online steigen sie mit eigener Meldung aus" | beide senden online (`main.js:803`/`:812` bzw. `:847`/`:862`); die Meldung kommt online aus den Ereignissen, nicht aus dem Client |
| `:153-154` (**zusätzlich**) | „Menge `bewusstStumm`, 13 Namen" | **12** Namen (gemessen); `weapon_dropped` ist heraus |
| `:166` (**zusätzlich**) | Tabellenzeile `weapon_dropped` \| „`dropWeapon()` meldet das Ergebnis direkt" \| `:195` | durchgestrichen + Grund: gilt nur lokal; seit O8 hat das Ereignis einen `online`-Zweig |
| `:180-182` (**zusätzlich**) | „Die **Menge** hat aber 13 Einträge" | 12 (13 vor O8) |
| `:174` (**zusätzlich**) | „der einzige Tabelleneintrag ganz ohne Zweig ist `drowning: {}` (`ereignisse.js:535`)" | Aussage stimmt, Zeile gewandert: heute `:553` |
| `:38-39` (**zusätzlich**) | Zeilennummern nach der O2-Korrektur (`landed:439` …) | Nachtrag: durch die O8-Einfügungen erneut gewandert (gemessene Liste im Dokument) |
| `:77-80` (**zusätzlich**) | Zählungstabelle „nachher" (2 nur-lokal, 4 nur-online, 31 beide) | zusätzliche Zeile „heute": 1 nur-lokal, 5 nur-online, **32** beide, 39 Einträge |

### 2.2 `docs/analyse-ereigniszweige.md`

| Stelle | Stand vorher | Nachher |
|---|---|---|
| `:100` (**im O8-Bericht genannt**) | `jumped` „nur lokal … **nein** — online erzeugt der Motor es nie (kein Sprungbefehl im Protokoll)" | `beide(fn)` (`ereignisse.js:437`), Server springt (`gameServer.js:1295` → `:517`), Emitter `match.js:1292` |
| `:102` (**zusätzlich gefunden**) | `crate_landed` „**nein** — nur abgeworfene Waffen fliegen, der Abwurf ist lokal-only" | Begründung **widerlegt**: der Abwurf ist online möglich ⇒ `crate_landed` entsteht auch online (Messung in 1.6). Urteil bleibt „still", aber neu begründet (nur noch `bewusstStumm`) |
| `:103` (**zusätzlich gefunden**) | `crate_pickup_blocked` „**ECHTE LUECKE (online)**" | **erledigt**: Eintrag ist `beide(fn)` (`ereignisse.js:492`) und nennt Q in beiden Zweigen |
| `:34-35` (**zusätzlich gefunden**) | „38 Einträge: 22 beide, 11 nur lokal, 4 nur online, 1 ohne Zweig" | heute 39 / 32 / 1 / 5 / 1 (gemessen, wörtlich zitiert); die alten Zahlen bleiben als Stand der Analyse stehen |
| `:46-49` (**zusätzlich gefunden**) | Listen „NUR LOKAL (11)", „NUR ONLINE (4)" | heute „NUR LOKAL (1): `crate_landed`", „NUR ONLINE (5): … `weapon_dropped` (NEU)" |
| `:52` (**zusätzlich gefunden**) | „Die **15** Einzweigigen … sind die Arbeitsmenge" | heute **6** (1+5) |
| `4.2` (`:146` ff.) | Überschrift „… online kommt das Ereignis an und fällt" | Überschrift als behoben markiert + Nachtrag am Abschnittsende |
| `6.1` (`:234` ff.) | „jumped ist online **nicht existent** … der Server ruft `match.jump()` nirgends" | Nachtrag: erledigt; Satz stimmt nicht mehr (Methoden-/Emitter-Zeilen zitiert) |
| `6.2` (`:249` ff.) | „Der Abwurf ist lokal-only: `main.js:818` … und `CONTROL` enthält kein `drop`" | Nachtrag: Prämisse gefallen (Zeilen zitiert, Messung 1.6) |
| `§7` (`:264` ff.) | „kein Zweig nimmt es online" | Nachtrag: erledigt; zusätzlich angemerkt, dass dieser Satz schon damals `4.2` derselben Datei widersprach |
| `§8.3` | „`bewusstStumm` enthält drei Namen, die einen Zweig haben" | Aussage bleibt (weiterhin drei), Liste kürzer: 12 statt 13 (O8 hat `weapon_dropped` entfernt) |
| Kopf (`:12-13`) | „Tabelle unverändert 38/22/11/4/1" | Nachtrag am Dateikopf: die Zählung ist mit O8 überholt |

### 2.3 `docs/todo-abgleich.md`

| Stelle | Stand vorher | Nachher |
|---|---|---|
| O8-Zeile (**im O8-Bericht genannt**) | „Springen und Waffe-Abwerfen gibt es online NICHT" → Urteil **„OFFEN — bestätigt"** | **ERLEDIGT (O8)** mit vollständigem Belegsatz (Protokoll, Handler, Verteiler, Sender, Ereignisse); die alte Belegspalte ist als widerlegt gekennzeichnet |
| O8-Zeile, Schlusszelle | „der stumme Ausstieg … **Reihenfolge bindet an O9**" | Nachtrag: der stumme Ausstieg ist weg (`main.js:803-811`), die Reihenfolge wurde eingehalten (`68f551c` trägt O8 **und** O9) |
| O9-Zeile (**zusätzlich gefunden**) | „**OFFEN — bestätigt und im Code gepinnt**" | **ERLEDIGT (O9)**: `recordInput` kennt die Art (`replay.js:133`), Wiedergabe `#wendeEingabeAn` (`:407`), Wächter umgedreht; selbst gefahren: **3/3 grün** (Ausgabe in 1.7) |
| O2-Zeile (**zusätzlich gefunden**) | Zählung 38 Einträge; „`jumped` und `crate_landed` … hängen an O8" | Nachtrag: der beschriebene Rest ist erledigt (die vier Ereignisse sind `beide`); „hängt an O8" gilt nur noch für `crate_landed` — aus neuem Grund |
| O7-Zeile (**zusätzlich gefunden**) | „aus O2/O8 fehlen Online-Tests" | Nachtrag: `event-coverage` prüft die Online-Zweige (`:670`, `:701`), O8 brachte 4 Anti-Cheat-Tests (Namen in 1.7); der Browser-E2E entstand WÄHREND dieser Arbeit (03:40/03:41) — Status von mir **nicht** geprüft |
| `MASTERDOTO:1510-1516`-Zeile (**zusätzlich gefunden**) | „Der zweite Teil … stimmt dagegen weiter = O8" | Nachtrag: auch dieser Teil ist überholt; `MASTERDOTO.md` liegt **außerhalb meines Schreibauftrags** und ist hier nur benannt |
| `§9` Punkte 1–3 | „Die wirklich offenen Punkte, nach Dringlichkeit" (O8, O9, O2-Rest) | alle drei als erledigt durchgestrichen, Texte bleiben als Zeitzeugnis stehen |
| `§10`/`§12`-Ränder | O9-Entwurf „nur vorhanden" | Entwurf ist umgesetzt (`68f551c`); Schlussabsatz um den Nachtrag ergänzt |

### 2.4 `docs/waffen-balance-whitepaper.md`

| Stelle | Stand vorher | Nachher |
|---|---|---|
| `:119` (**im O8-Bericht genannt**) | „Der Flow ist konsistent, aber **kein Sprung/Waffe-Abwerfen** online verfügbar. Scout verliert seine Hauptunterscheidungsmerkmal online" | Sprung **und** Abwerfen sind online verfügbar; der Scout verliert sein Merkmal nicht mehr. Belegsatz + alter Wortlaut als Zitat |
| `:139` (**zusätzlich gefunden**) | offene Frage „Welche Waffen sollen Online-Spezifika haben? (Scout-Sprung …)" | Frage bleibt, aber kleiner: der Scout-Sprung ist kein fehlendes Online-Spezifikum mehr |
| Kopf | Status „Work-in-progress (2026-09-26)" | Nachzug-Hinweis, dass **nur** §5/§7 betroffen sind und die Zahlen des Papiers **nicht** nachgemessen wurden |

---

## 3. Was noch stimmt und stehen blieb (geprüft, nicht geändert)

- **`docs/hunter-ui.md` §1 (O2, vier Ereignisse):** `landed`, `crate_pickup`,
  `fall_damage`, `toxic_rain` sind nachgemessen `beide(fn)` — die Aussagen des
  Abschnitts treffen weiter zu (nur die Zeilennummern sind gewandert, oben
  nachgetragen).
- **`docs/hunter-ui.md` §3a/§3b (Waffenauswahl lokal/online):** unverändert
  gültig. Betroffen war allein der Q-Abwurf-Satz.
- **`docs/analyse-ereigniszweige.md` §4.1 (`guenther_poop` online leer)** und
  **§4.3 (`karte_unerreichbar` lokal leer):** beide Lücken bestehen weiterhin;
  O8 hat sie nicht berührt (keine der beiden Ereignisarten hat einen neuen Zweig
  bekommen — die gemessene Zählung in 1.6 nennt genau drei bewegte Einträge).
- **`docs/analyse-ereigniszweige.md` §8.1/§8.2 (Landungsflut, Dauerzustand
  `crate_pickup_blocked`):** Aussagen bleiben; der Dauerzustand ist ausdrücklich
  **nicht** behoben (O8 ändert nur den Text der Meldung, nicht ihre Häufigkeit).
- **`docs/todo-abgleich.md` §1–§8 zu allen übrigen Punkten** (O1, O3, O4, O5, O6,
  O7-Kern, M4/M5): nicht Teil dieses Auftrags und nicht neu bewertet — nur die
  Stellen mit O8-Bezug sind nachgezogen.
- **`docs/waffen-balance-whitepaper.md` Zahlen (§1/§5/§6):** ausdrücklich **nicht**
  nachgemessen; stehen als Zeitzeugnis.

---

## 4. NEUER Befund: `crate_landed` fällt online still weg

**O8 hat den Auslöser online gebracht, den Zweig aber nicht.** Vor O8 war die
Sache sauber: „nur abgeworfene Waffen fliegen" und abwerfen konnte man nur lokal
— also entstand `crate_landed` online nie. **Seit O8 gibt es den Abwurf online**
(`CONTROL.DROP_WEAPON`), er setzt `inFlight: 1` (`match.js:2159`, in
`dropWeapon` `:2128`), das Geschoss fliegt — und **`crate_landed` wird erzeugt**.
Gemessen (Motorlauf, 1.6): nach einem erfolgreichen Abwurf
`{"landed":344,"crate_landed":1}`.

Der Client hat für `crate_landed` weiterhin **nur** `lokal:`
(`ereignisse.js:454`), online wird es also still verworfen. **Gedeckt ist das
allein durch den `bewusstStumm`-Eintrag** in `tests/event-coverage.test.js`
(„lokaler Zweig hat einen Fall; online übernimmt es die Kistenliste") — die
Entscheidung ist also dokumentiert, aber sie steht jetzt auf einer **anderen**
Begründung als in der Analyse („der andere Modus erzeugt es nicht").

**Empfehlung an den Auftraggeber (nicht ausgeführt — `src/` ist nicht mein
Auftrag):** entweder einen `online`-Zweig für `crate_landed` ergänzen (eine
Protokollzeile „Abgeworfene Waffe gelandet") oder die Begründung im
`bewusstStumm`-Eintrag auf den neuen Grund umschreiben. Der `bewusstStumm`-Eintrag
selbst ist eine **Teständerung** und damit außerhalb meines Schreibauftrags.

---

## 5. Nicht angefasst, aber benannt

- **`bgworker-todo.json`** — ausdrücklich ausgenommen (Auftraggeber). Die Zeilen
  O2/O8/O9 tragen dort weiter den Vor-O8-Stand.
- **`MASTERDOTO.md:1510-1516`** — beschreibt den Sprung/Abwurf noch als
  fehlend. Außerhalb meines Schreibauftrags; in `docs/todo-abgleich.md` namentlich
  benannt, damit die Stelle beim nächsten Zug mitgezogen wird.
- **`docs/audit-tief.md`, `docs/duplikate-bericht.md`, `docs/optimierung-bericht.md`**
  — tragen den Vor-O8-Stand **nicht**. Wörtlich geprüft (Treffer außerhalb der
  fünf bearbeiteten Dateien, `head -6`):

```
$ grep -rn "lokal-only\|kein Sprungbefehl\|JUMP\|DROP_WEAPON\|Abwerfen ist nur im lokalen" docs/*.md docs/auftraege/*.md | grep -v "<die fuenf Dateien>"
docs/auftraege/online-sprung-und-abwurf.md:69:      this.hud.log('Abwerfen ist nur im lokalen Match möglich', 'neutral');
docs/auftraege/online-sprung-und-abwurf.md:92:(elf Einträge, kein `JUMP`, kein `DROP_WEAPON`; `LOADOUTS` folgt erst nach einem
docs/auftraege/online-sprung-und-abwurf.md:155:const JUMP_SPEED_INFLUENCE_ABOVE = 0.5;
docs/auftraege/online-sprung-und-abwurf.md:156:const JUMP_SPEED_INFLUENCE_BELOW = 0.25;
docs/auftraege/online-sprung-und-abwurf.md:248:## Weg (a): je eine neue CONTROL-Nachricht `JUMP` und `DROP_WEAPON`
docs/auftraege/online-sprung-und-abwurf.md:250:Der Client schickt `controlMessage(CONTROL.JUMP, { seitlich })` bzw.
```

  Die einzigen Treffer liegen in **`docs/auftraege/online-sprung-und-abwurf.md`**
  — dem Auftrag selbst, der den Vor-O8-Stand bewusst zitiert (`:69`, `:92`).
  Er gehört nicht zu den nachzuziehenden Berichten und blieb unberührt.
- **`docs/o8-impl.md`** — der Bericht, der den Nachzug angestoßen hat; unverändert.
  Sein Abschnitt „Nachzuziehende Dokumente" ist mit dieser Datei abgearbeitet.

---

## 6. Grenzen dieser Nacharbeit (was ich NICHT getan habe)

1. **Kein Testlauf der Gates.** Gefahren wurde genau ein Testlauf
   (`tests/replay-sprung-luecke.test.js`, Ausgabe in 1.7) plus zwei Node-Sonden.
   `npm test`, `npm run lint`, `npm run build`, `npm run check:docs` und die E2E
   wurden **nicht** gefahren — im Baum arbeiten parallel andere Worker, und ein
   voller Lauf hätte die Aussage dieser Datei nicht verbessert.
2. **Kein Browser.** Die neuen Online-E2E-Spezifikationen wurden **gelesen**, nicht
   ausgeführt; ihr Ergebnis ist hier keine Aussage.
3. **Der Baum bewegt sich.** Während dieser Arbeit sind Dateien entstanden und
   geändert worden (u. a. `tests/e2e/guenther-online.spec.mjs` und
   `tests/e2e/online-sprung-abwurf.spec.mjs` um 03:40/03:41, `src/engine/match.js`,
   `src/client/renderer.js`, `tools/audit-mcp/*`). **Jede Zahl dieser Datei ist
   eine Momentaufnahme mit Zeitstempel** — die Momentaufnahme steht in 1.1–1.7.
4. **`ls tests/e2e/*.spec.mjs | wc -l` lag beim ersten Nachsehen bei 28 und beim
   zweiten bei 30.** Das ist kein Widerspruch, sondern der laufende Fremdbau:
   zwei neue, ungetrackte Dateien. Wer die Zahl zitiert, nennt den Zeitpunkt.

---

*Erzeugt rein lesend am Code; Schreibzugriff ausschließlich auf die fünf
genannten `docs/`-Dateien.*
