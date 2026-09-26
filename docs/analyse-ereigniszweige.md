# Analyse der Ereigniszweige — welche der 15 einzweigigen Engine-Ereignisse sind echte stumme Lücken

**Auftrag:** Für jedes der 15 Ereignisse mit nur einem Behandlungszweig in
`src/client/ereignisse.js` klären, ob der andere Modus still bleibt. Rein
lesende Arbeit: keine Produktivdatei, keine bestehende Testdatei geändert;
`npm test`, Playwright und `npm run build` wurden NICHT gefahren.

**Stand:** Die Arbeit lief über mehrere Commits des Auftraggebers hinweg
(Messbeginn `d2d8495` mit 20 geänderten Dateien → `7d4d208` → `e31d1c7`).
**Alle** unten zitierten Zeilenangaben wurden gegen `7d4d208` geprüft und am
Ende gegen `e31d1c7` erneut nachgeprüft (`/tmp/check.mjs`: **80 von 80**
Prüfproben gefunden, keine offen; Tabelle unverändert 38/22/11/4/1,
`src/client/ereignisse.js` unverändert md5 `64eeb62551f78159166177efbf3d7fb5`).

**Sonden** (lagen in `/tmp`, nichts im Repo): `/tmp/parse2.mjs` (Tabelle
auswerten), `/tmp/probe.mjs`, `/tmp/probe2.mjs`, `/tmp/probe4.mjs` (Motorläufe
mit `MatchController` — derselben Klasse, die Server und Client benutzen).
Nach jeder Sonde war die Ausgabe von `git status --porcelain` identisch zur
Ausgabe davor: die Messungen haben keine Datei angefasst.

**Urteilslegende** (aus dem Auftrag):

- **ECHTE LUECKE** — die Engine erzeugt das Ereignis in diesem Modus, der Client
  zeigt dort nichts, und kein anderes Element zeigt die Wirkung.
- **BEGRUENDET EINZWEIGIG** — der Modus erzeugt es nicht, ODER die Wirkung wird
  über ein anderes Element gezeigt (Fundstelle genannt).
- **UNGEPRUEFT** — nicht entscheidbar (kommt hier nicht vor; die Grenzen der
  Messung stehen in Abschnitt 9).

---

## 1. Gemessener Ist-Stand der Tabelle

`EREIGNIS_WIRKUNGEN` (`src/client/ereignisse.js:82`) hat **38 Einträge**:
**22** in beiden Zweigen, **11** nur lokal, **4** nur online, **1** ohne Zweig.
Gemessen mit `/tmp/parse2.mjs` (Textauswertung der Tabelle; `beide(fn)` wird als
beide Zweige gezählt — das war beim ersten Anlauf die Fehlerquelle eines eigenen
Parsers, der nur `lokal:`/`online:`-Zeilen sah und deshalb 13 „ohne Zweig"
meldete):

```
BEIDE (22): explosion, hitscan, shot, projectile_impact, projectile_pierced, loot_error, fuse_armed,
            fuse_expired, turret_deployed, turret_fired, turret_expired, special_effect, frozen,
            turn_skipped, dot_tick, shield_absorbed, pulled, heal, maelstrom_contract, death,
            round_start, match_over
NUR LOKAL (11): guenther_wheel, guenther_pee, guenther_poop, guenther_poop_hit, jumped, landed,
            crate_landed, crate_pickup_blocked, crate_pickup, fall_damage, toxic_rain
NUR ONLINE (4): terrain_destroyed, projectile_spawn, turn_start, karte_unerreichbar
KEIN ZWEIG (1): drowning   (bewusst stumm, begründet in ereignisse.js:451–461)
```

Die **15** Einzweigigen (11 + 4) sind die Arbeitsmenge dieses Berichts.

## 2. Die zwei strukturellen Wege (Grundlage jedes Urteils)

**(a) Der Server sendet JEDES Engine-Ereignis — ohne Whitelist.**
`src/server/gameServer.js:246–248`:

```js
for (const event of this.match.consumeEvents()) {
  this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
}
```

Auf der Clientseite fällt jede Kontrollnachricht, die keinen eigenen `case` hat,
in den Sammelzweig `networkClient.js:396–398` (`this.#emit('game_event', message)`)
→ `main.js:994` → `#handleRemoteEvent` (`main.js:1163–1165`) → `verarbeiteOnline`
(`ereignisse.js:569–571`). Es gibt also **keine** zweite Filterstelle: was die
Engine erzeugt, erreicht den Online-Client und wird dort gegen dieselbe Tabelle
gehalten.

**(b) Beide Betriebsarten fahren DENSELBEN Motor.**
Lokal: `main.js:744` (`new MatchController({…})`). Online: `gameServer.js:85`
(`this.match = new MatchController({…})`) und `gameServer.js:104`
(`this.match.start()`). Die drei Systeme, um die es hier geht, laufen in EINEM
Schritt: `match.js:1113` `step()` → `:1119` `#stepFlyingCrates()`, `:1132`
`#updateGroundedState()`, `:1138` `#stepGuenther()`. Günther wird **unbedingt**
gebaut (`match.js:618`, keine Modusschranke) und meldet über
`match.js:1335` (`melde: (typ, daten) => this.#events.emit(typ, daten)`) in
dieselbe Ereignisliste, die der Server verteilt.

**(c) Der lokale Zweig** wird aus `match.consumeEvents()` gespeist:
`main.js:1322` → `#handleEvents` (`main.js:1340–1343`) → `verarbeiteLokal`
(`ereignisse.js:559–561`).

**Folgerung:** „nur lokal" bedeutet online immer „das Ereignis kommt an und fällt
in eine leere Stelle" — AUSSER der Motor erzeugt es online gar nicht (weil der
Auslöser im Drahtprotokoll fehlt). Genau diese Unterscheidung liefert weiter
unten zwei der drei echten Lücken und entkräftet die Begründung bei zwei anderen
Ereignissen.

## 3. Tabelle: die 15 einzweigigen Ereignisse

| Ereignis | Zweig im Baum | emittiert in (Datei:Zeile) | im lokalen Match? | online gesendet? (Datei:Zeile) | Urteil |
|---|---|---|---|---|---|
| guenther_wheel | nur lokal | `guentherSystem.js:341` (`melde` → `match.js:1335`) | ja, gemessen 5× | ja — `gameServer.js:246–248` | BEGRUENDET (Folgen sichtbar: `hud.js:227` ❄-Marke, `ereignisse.js:340` turn_skipped, `hud.js:247` HP, `main.js:1114` Bestand) |
| guenther_pee | nur lokal | `guentherSystem.js:276` | ja, gemessen 22× | ja — `gameServer.js:246–248` | BEGRUENDET (HP sinkt: `main.js:1103` → `hud.js:216/217/247`) |
| guenther_poop | nur lokal | `guentherSystem.js:302` | ja, gemessen 8× | ja — `gameServer.js:246–248` | **ECHTE LUECKE (online)** — siehe 4.1 |
| guenther_poop_hit | nur lokal | `guentherSystem.js:319` | ja, gemessen 5× | ja — `gameServer.js:246–248` | BEGRUENDET (`dot_tick` beide Zweige, `ereignisse.js:344–352`, nennt das Element „poop") |
| jumped | nur lokal | `match.js:1291` | ja, aber nur über `jump()` (Taste SHIFT, `input.js:152`) | **nein** — online erzeugt der Motor es nie (kein Sprungbefehl im Protokoll) | BEGRUENDET (der andere Modus erzeugt es nicht) — siehe 6.1 |
| landed | nur lokal | `match.js:1351` (`#updateGroundedState`, gerufen aus `step()` `:1132`) | ja, gemessen 344 in 600 Ticks | ja — `gameServer.js:246–248` | BEGRUENDET (Bewegung aus dem Snapshot: `main.js:1077` → `renderer.js:1217`) — Flut-Nebenbefund 8.1 |
| crate_landed | nur lokal | `match.js:2303` (`#stepCrate` ← `:1119`) | ja | **nein** — nur abgeworfene Waffen fliegen, der Abwurf ist lokal-only | BEGRUENDET (der andere Modus erzeugt es nicht) — siehe 6.2 |
| crate_pickup_blocked | nur lokal | `lootSystem.js:187` | ja, gemessen 60 von 60 Ticks | ja — `gameServer.js:246–248` | **ECHTE LUECKE (online)** — siehe 4.2 |
| crate_pickup | nur lokal | `lootSystem.js:198` | ja, gemessen 5× | ja — `gameServer.js:246–248` | BEGRUENDET (Bestand: `main.js:1000` → `:1114` → `:1212`; HP bei sustain/trap) |
| fall_damage | nur lokal | `characterSystem.js:122` | im Modus möglich (Knockback beider Modi) | ja — `gameServer.js:246–248` | BEGRUENDET (HP sinkt: `main.js:1103` → `hud.js:216/217/247`) |
| toxic_rain | nur lokal | `maelstromSystem.js:96` | ja, gemessen 47× | ja — `gameServer.js:246–248` | BEGRUENDET (Schaden wirkt: `maelstromSystem.js:92` → `main.js:1103` → `hud.js:247`) |
| terrain_destroyed | nur online | `projectileSystem.js:402` | **ja, der lokale Motor erzeugt es auch** | ja — `gameServer.js:246–248` | BEGRUENDET (lokal liegt der Krater schon im geteilten Bitmap: `main.js:766/2096`; zusätzlich `ereignisse.js:105`) |
| projectile_spawn | nur online | `shooting.js:344`, `match.js:2093` (Geschütz) | **ja, der lokale Motor erzeugt es auch** | ja — `gameServer.js:246–248` | BEGRUENDET (lokal gibt es keine Schussvorhersage: `main.js:1481`, gezeichnet nur online `main.js:1961`) |
| turn_start | nur online | `match.js:2800` (`#beginTurn`) | **ja, der lokale Motor erzeugt es auch** | ja — `gameServer.js:246–248` | BEGRUENDET (lokal kommt der Status aus dem Motor: `main.js:1039`; Rundenzahl `hud.js:92`) |
| karte_unerreichbar | nur online | `match.js:759` (`#pruefeErreichbarkeit` ← `:658` in `start()`) | **ja** — `start()` läuft lokal (`main.js:747`) mit `kartentyp = 'autonom'` (`main.js:382`) | ja — `gameServer.js:246–248` | **ECHTE LUECKE (lokal)** — siehe 4.3 |

## 4. Die echten stummen Lücken

### 4.1 `guenther_poop` — online wird der Haufen nirgends gezeigt

**Der Motor erzeugt das Ereignis online.** Günther wird im Konstruktor des
Motors unbedingt gebaut (`match.js:618–623`); `#stepGuenther()` steht im
gemeinsamen Simulationsschritt (`match.js:1138`, gerufen aus `step()`
`match.js:1113`) und meldet über `match.js:1335` in die Ereignisliste. Gemessen
an einem Motorlauf, wie ihn der Server fährt (seed 4242, teams 2,
playersPerTeam 2, `turnDurationMs` 1000, 4575 Ticks): **8 × `guenther_poop`**,
dazu 22 × `guenther_pee`, 5 × `guenther_poop_hit`, 5 × `guenther_wheel`. Damit
ist auch die im Wächter offen gelassene Frage „NICHT gemessen: ob der Server
Günther überhaupt würfeln lässt" (`tests/event-coverage.test.js:283–285`)
beantwortet: **er würfelt** — es ist derselbe Motor.

**Der Client zeigt online nichts.** Der Online-Zweig fehlt (`ereignisse.js:387–391`
hat nur `lokal`), und der Haufen ist auch nicht über ein anderes Element
sichtbar: Der Renderer zeichnet ihn aus dem Ansichtszustand —
`renderer.js:1200` `#drawPoopPiles(state.guenther?.haufen ?? [])` —, und der
Online-Ansichtszustand führt **kein** `guenther`-Feld (`main.js:1119–1152`:
status, round, maxRounds, wind, tick, turnElapsedMs, turnDurationMs,
activePlayerId, winnerTeamId, statuses, maelstrom, entities, projectiles,
crates, turrets, terrainWidth/Height). Gegenprobe per Messung:
`match.getState()` liefert die Felder `…, orientation, guenther, scenery`,
`onlineViewState` kennt keines davon.

**Was online bleibt,** ist die spätere Folge: Wer in den Haufen tritt, verliert
Leben, und das wird über `dot_tick` gemeldet (beide Zweige,
`ereignisse.js:344–352`, Elementname „poop"). Die **Entstehung** des Hindernisses
und seine Lage erfährt der Online-Spieler nie — er sieht nur, dass er Schaden
nimmt. Der lokale Zweig hat dafür nur die Protokollzeile
(`ereignisse.js:387–391`, „Günther hat ein Häufchen gemacht"); online fehlt auch
diese.

### 4.2 `crate_pickup_blocked` — online kommt das Ereignis an und fällt

**Der Motor erzeugt es in beiden Betriebsarten.** Das `LootSystem` ist ein
ECS-System desselben Motors (`lootSystem.js:152` `update()`), die Bedingung hängt
nur an Abstand (`PICKUP_RADIUS = 110`, `lootSystem.js:77/178`), vollem Vorrat
(`inventory.isFull`, `src/engine/inventory.js:179–181`; Aufruf
`lootSystem.js:185`) und daran, dass die Kiste die Waffe nicht schon liefert
(`lootSystem.js:186`).

**Gemessen (seed 777, teams 2, playersPerTeam 2):** Ein Spieler mit vollem Vorrat
und eine Waffenkiste auf seiner Position → **60 `crate_pickup_blocked` in 60
Ticks**; erster und letzter Rumpf identisch
(`{"crateId":7,"playerId":1,"weaponId":"pa_003","reason":"voll"}`). Die Kiste
bleibt liegen (`picked` bleibt 0, sie steht weiter im Zustand) — es passiert also
sichtbar **nichts**, was den Grund verraten könnte.

**Der Client zeigt online nichts.** Der Online-Zweig fehlt
(`ereignisse.js:417–422` hat nur `lokal`); das Ereignis erreicht den Client aber
(`gameServer.js:246–248` → `networkClient.js:396–398` → `main.js:1163–1165`).
Und es gibt kein anderes Element: Die Bestandsnachricht ist unverändert
(nichts wurde aufgenommen, `gameServer.js:539–546` vergleicht Signaturen und
schweigt), die Kiste bleibt im Snapshot sichtbar liegen, der Lebensbalken ändert
sich nicht. Der Spieler steht auf einer Waffe, kann sie nicht nehmen und erfährt
nicht, dass er erst abwerfen muss — der Satz, der das erklärt
(`ereignisse.js:420`, „Vorrat voll — erst eine Waffe abwerfen (Q)"), existiert
nur lokal.

**Nicht empirisch gemessen:** eine tatsächliche Auslösung in einem Online-Match
(kein Serverlauf erlaubt). Strukturell ist sie belegt: derselbe Motor ohne
Modusschranke, und im unbeaufsichtigten Motorlauf (seed 4242, ohne jede Eingabe)
wurden **5 × `crate_pickup`** erzeugt — Kisten werden also auch ohne
Spielerbewegung aufgenommen (Verdrängung durch Physik/Wasser/Explosionen).

### 4.3 `karte_unerreichbar` — lokal läuft die Prüfung, die Anzeige fehlt

**Der Motor erzeugt es lokal.** `start()` ruft `this.#pruefeErreichbarkeit()`
(`match.js:658`); die Prüfung läuft nur beim autonomen Kartentyp
(`match.js:702` `if (this.kartentyp !== 'autonom') return;`) und sendet bei
negativem Urteil `match.js:759` `karte_unerreichbar`. Lokal ist genau das der
Fall: `main.js:382` setzt `const kartentyp = 'autonom';`, und der lokale Motor
wird daneben gebaut (`main.js:744`), `start()` bei `main.js:747`.

**Der Client zeigt es nicht.** Der lokale Zweig fehlt (`ereignisse.js:542–550`
hat nur `online`). Ein anderes Element zeigt es ebenfalls nicht: Das Ergebnis
landet in `this.erreichbarkeit` (`match.js:752–757`), und **in `src/client`
liest das niemand** — die Suche über `src/ client`- und `tests`-/`scripts`-Bäume
nach `erreichbarkeit` ergibt außerhalb von `src/engine/match.js` nur
`src/shared/erreichbarkeit.js` (die Rechenfunktion), drei Testdateien und
`scripts/check-erreichbarkeit.mjs:56` (`const e = m.erreichbarkeit ?? { ok: true };`
— ein Werkzeug, kein Spielpfad). Wer lokal auf einer abgeschnittenen Karte
spielt, erfährt es nicht.

**Messwert zur Häufigkeit:** In **90 gezogenen Karten** hat die Prüfung **kein
einziges Mal** ausgelöst — 30 Partien „schräg" (seeds `200000 + i*6151`, teams 2,
playersPerTeam 2) und 60 weitere (6 Konfigurationen × 10 seeds: (2,1), (2,2),
(3,2), (4,2), (2,3), (4,1), seeds `300000 + i*7919 + …`), jeweils
`kartentyp: 'autonom'`, Ereignisse aus `start()` eingesammelt: **0 Treffer**.
Die Lücke ist damit strukturell echt, aber im Messfeld nicht ausgelöst — ihre
praktische Wirkung hängt an Karten, die es nach dieser Stichprobe nicht gibt.
Ob es Seeds gibt, die sie treffen, ist offen (das Werkzeug
`scripts/check-erreichbarkeit.mjs` existiert genau für diese Frage).

## 5. Die andere Betriebsart zeigt die Wirkung — Gegenweg je Ereignis belegt

Die Frage ist nicht „gibt es irgendeine Anzeige für X", sondern „zeigt die
Stelle, in der dieser Modus läuft, auch die Folge". Für die elf Ereignisse, die
NICHT unter 4. fallen, ist diese Stelle:

| Ereignis | Fehlender Zweig | Fundstelle des anderen Wegs |
|---|---|---|
| guenther_wheel | online | Gefrieren wirkt: ❄-Marke im HUD aus dem Snapshot (`main.js:1066–1075` → `hud.js:227`), Aussage „setzt aus — eingefroren" in BEIDEN Zweigen (`ereignisse.js:340`, ausgelöst `match.js:2793`); Schaden/Heilung: `main.js:1103` → `hud.js:216/217/247`; Waffe: `main.js:1114` |
| guenther_pee | online | Lebensbalken und -zahl sinken: `main.js:1103` → `hud.js:216/217/247`; der Schaden wirkt real (`guentherSystem.js:275` `schaden(opfer, betrag)`) |
| guenther_poop_hit | online | `dot_tick` wird in BEIDEN Zweigen protokolliert und nennt das Element: `ereignisse.js:344–352` („… erleidet N Schaden (poop)"), Wirkung `match.js:1327–1332` |
| landed | online | Die Landung ist die Bewegung der Figur: `main.js:1077` (interpolierte Entities) → `renderer.js:1217` (`#drawEntities`) |
| crate_pickup | online | Bestand aus der LOADOUTS-Nachricht: `main.js:1000` (remoteLoadouts) → `:1114` (inventory) → `:1212` (`#weaponIdsForActivePlayer`); Heilung/ Sprengfalle über `main.js:1103` → `hud.js:247` |
| fall_damage | online | `main.js:1103` (health aus dem Snapshot) → `hud.js:216/217/247` |
| toxic_rain | online | `maelstromSystem.js:92` teilt echten Schaden aus → `main.js:1103` → `hud.js:247` |
| terrain_destroyed | lokal | Der Krater steckt schon im Bitmap, das der lokale Renderer zeichnet: `main.js:766` und `:2096` (`#afterWorldReady(this.match.bitmap, …)` → `main.js:1768–1769`); zusätzlich gräbt der lokale `explosion`-Zweig (`ereignisse.js:105`) |
| projectile_spawn | lokal | Es gibt lokal keine Schussvorhersage, die aufgelöst werden müsste: `main.js:1481` (`#startShotPrediction` kehrt zurück) und `main.js:1961` (gezeichnet wird sie nur online) |
| turn_start | lokal | Der Status kommt aus dem Motor: `main.js:1039` (`mode === 'online' ? onlineViewState : this.match.getState()`); Rundenzahl im HUD `hud.js:92` |
| karte_unerreichbar | — (unter 4.3) | — |

## 6. Zwei Ereignisse, die der andere Modus gar nicht erzeugt

Die Tabelle im Wächter begründet diese beiden damit, dass die Wirkung „als
Bewegung" bzw. „über die Kistenliste" sichtbar sei. Der **tragfähigere** Grund
ist ein anderer — und er ist strenger: Der Online-Modus kennt den Auslöser nicht.

### 6.1 `jumped`

`match.js:1291` sendet `jumped` in `jump(playerId, horizontal)`. Aufgerufen wird
das nur an zwei Stellen: `main.js:798` (`jump()` — mit der Schranke
`main.js:794` `if (!this.match || this.mode !== 'local') return null;`) und
`debugApi.js:148` (Entwickler-API, ruft dieselbe örtliche Methode).
Im Drahtprotokoll gibt es keinen Sprungbefehl: `CONTROL` in
`src/shared/protocol.js` kennt `hello, welcome, create_lobby, join_lobby,
lobby_state, start_match, input, select_weapon, resume, error, ping, loadouts` —
kein `jump`; der Server-Schalter (`gameServer.js:1004–1201`) behandelt nur diese.
Der Server ruft `match.jump()` nirgends. **Folge:** `jumped` ist online nicht
still, sondern **nicht existent** — im Motorlauf über 4575 Ticks (ohne Eingabe)
kam es **0 ×** vor, obwohl `landed` 2616 × auftrat. Kein Spieler kann online
springen; die Lücke wäre erst dann eine, wenn der Sprung ins Protokoll käme.

### 6.2 `crate_landed`

`match.js:2303` sendet `crate_landed` in `#stepCrate`, gerufen aus
`#stepFlyingCrates` (`match.js:1119`) für alle Entities mit `Crate`+`Velocity`.
Wer fliegt, ist festgelegt: Rundenkisten liegen bereits
(`lootSystem.js:141–142`: „Rundenkisten liegen bereits; nur abgeworfene Waffen
fliegen", `inFlight: 0`), und nur der Abwurf setzt `inFlight: 1`
(`match.js:2158`, in `dropWeapon`, `match.js:2127`). Der Abwurf ist lokal-only:
`main.js:818` (`if (!this.match || this.mode !== 'local') { … 'Abwerfen ist nur
im lokalen Match möglich' }`), und `CONTROL` enthält kein `drop`. **Folge:**
`crate_landed` entsteht online nie (im Motorlauf 0 ×), die Kistenliste im
Snapshot ist dafür die richtige Gegenprobe — aber nicht der Grund.

## 7. Die zwei gemeldeten Fälle — Ergebnis des Widerlegungsversuchs

**`crate_pickup_blocked`: bestätigt, und schärfer als gemeldet.** Die Engine
erzeugt es in beiden Betriebsarten (Messung 4.2: 60 von 60 Ticks), der Server
sendet jedes Ereignis (`gameServer.js:246–248`, kein Filter), und kein Zweig
nimmt es online (`ereignisse.js:417–422`). **Zusatzbefund, der die Meldung
verschärft:** lokal ist der Eintrag kein Übergang, sondern ein Dauerzustand — er
protokolliert 60 Zeilen je Sekunde, solange der Spieler mit vollem Vorrat neben
einer Waffenkiste steht (dieselbe Klasse wie `drowning`, das deshalb bewusst
stumm ist, `ereignisse.js:451–461`).

**`karte_unerreichbar`: in der Sache bestätigt, in der Begründung zu eng.** Die
Aussage „der lokale Zweig fehlt; der Wert landet nur in `match.erreichbarkeit`"
trifft zu (4.3). Die Aussage **„einziger Leser im ganzen Projekt:
`tests/zugreihenfolge.test.js:144`" ist jedoch falsch**: `erreichbarkeit` wird
auch in `scripts/check-erreichbarkeit.mjs:56` gelesen —
`const e = m.erreichbarkeit ?? { ok: true };`. Für den Spielpfad ändert das
nichts (in `src/client` gibt es keinen Leser), aber die Formulierung „einziger
Leser im ganzen Projekt" hält der Nachprüfung nicht stand. Neu ist der
Häufigkeitswert: **0 von 90** gezogenen Karten lösten die Prüfung aus.

## 8. Nebenbefunde (nicht Teil des Auftrags, aber belegt)

1. **`landed` flutet das lokale Protokoll.** Messung (seed 909, teams 2,
   playersPerTeam 2, `turnDurationMs` 10^6, 600 Ticks, ohne Eingabe):
   **344 `landed`-Ereignisse**, 4 verschiedene Figuren, **0** davon in zwei
   aufeinanderfolgenden Ticks für dieselbe Figur, längste Serie **1**. Jede
   Landung ist also ein echter Übergang (kein Flackern der Bodenprüfung), aber
   jede Figur „landet" im Leerlauf etwa alle 7 Ticks — das sind rund 0,57
   Meldungen je Tick. Lokal protokolliert `ereignisse.js:405–409` jede einzelne
   davon. Die Ursache der hohen Landefrequenz wurde **nicht** untersucht.
   (Zweite Messung, anderer Seed und Runde 21: 2616 in 4575 Ticks — dasselbe
   Verhältnis.)
2. **`crate_pickup_blocked` ist ein Zustand, kein Übergang** — 60 Ereignisse in
   60 Ticks (4.2), lokal 60 Protokollzeilen je Sekunde.
3. **`bewusstStumm` enthält drei Namen, die einen Zweig haben.** Die Liste
   `tests/event-coverage.test.js:182–203` bedeutet laut ihrer eigenen
   Begriffsbestimmung (Zeilen 165–170): „KEIN Client-Zweig behandelt dieses
   Ereignis". Dagegen stehen: `turn_start` (Zeile 185 vs. Zweig
   `ereignisse.js:523–527`), `shot` (Zeile 191 vs. Zweige
   `ereignisse.js:174–199`), `crate_landed` (Zeile 194 mit dem Kommentar
   „lokaler Zweig hat einen Fall" vs. Zweig `ereignisse.js:411–415`).
   Der Test prüft diesen Widerspruch nur für die 27 Namen der Audit-Liste
   (`tests/event-coverage.test.js:517–522`); diese drei sind nicht darunter,
   also fällt nichts um.
4. **Veraltete Zeilenangaben** im `offen`-Text zu `karte_unerreichbar`
   (`tests/event-coverage.test.js:360`): genannt werden `match.js:641/684/742/735`
   — tatsächlich `:658/701/759/752`. Der Wächter verlangt nur, dass **irgendwo**
   ein `datei.js:Zeile` steht (`:584`), prüft die Zahl also nicht.
5. **Günther läuft online mit** — gemessen 22/8/5/5 Ereignisse (4.1). Die im
   Test vermerkte Lücke „NICHT gemessen: ob der Server würfelt"
   (`tests/event-coverage.test.js:283–285`) ist damit geschlossen.

## 9. Grenzen dieser Analyse (was NICHT gemessen wurde)

- **Kein Serverlauf.** Die Aussage „der Server sendet X" ist ein Code-Beleg
  (`gameServer.js:246–248`), keine Beobachtung; kein WebSocket-Client, kein
  Playwright, kein `npm test`.
- **Die Häufigkeiten stammen aus Motorenläufen**, nicht aus Partien: verkürzte
  Zugzeit (`turnDurationMs` 1000/2000), ohne menschliche Eingabe, feste Seeds
  (4242, 777, 909). Sie sind Größenordnungen.
- **`fall_damage` trat in keinem Lauf auf** (0 × in 4575 Ticks) — die
  Reachability online ist aus dem Knockback-Pfad geschlossen
  (`projectileSystem.js:436–444`), nicht gemessen.
- **`crate_pickup_blocked` online** ist strukturell belegt (derselbe Motor, keine
  Modusschranke, 5 natürliche `crate_pickup` im unbeaufsichtigten Lauf), aber in
  keinem Online-Match beobachtet.
- **`karte_unerreichbar`**: 0 Auslösungen in 90 Karten; welche Seeds den Fall
  treffen, ist offen.
- Alle Zeilenangaben beziehen sich auf `7d4d208` und sind gegen `e31d1c7`
  unverändert gültig (80 von 80 Prüfproben gefunden). Der Arbeitsbaum ist in
  Bewegung (andere Arbeiten laufen); `src/client/ereignisse.js` hatte den md5
  `64eeb62551f78159166177efbf3d7fb5`.
