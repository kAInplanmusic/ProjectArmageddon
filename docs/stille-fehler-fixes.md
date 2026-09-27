# Stille Fehler — was gemessen wurde und was dagegen gebaut ist

**Datum:** 2026-09-27, 09:25–10:00 CEST
**Arbeiter:** Worker K (vorgelegt wurden vier belegte Befunde + vier gemeldete Punkte)
**git-Stand:** `fd4afc2`; der Arbeitsbaum bewegte sich während der Arbeit (andere Arbeiter an
`renderer.js`, `input.js`, `ereignisse.js`, `index.html`). Meine Änderungen stehen in
`src/shared/protocol.js`, `src/shared/config/match.js`, `src/shared/stats.js`,
`src/engine/stateSnapshot.js` (nur gelesen), `src/server/gameServer.js`, `src/server/persistence.js`,
`src/client/networkClient.js`, `src/client/main.js` (klein gehalten), vier Prüfdateien,
`README.md` (Dateizahl) und dieser Datei.

**Regel, die für jeden Punkt gilt:** Die gemeldete Stelle wurde SELBST nachgeprüft, mit einem
Messwert belegt und danach geändert — oder als Fehlalarm verworfen. Eine Änderung an der
SIMULATION wurde nirgends vorgenommen: `npm run replay -- play artifacts/replay-20260910.json
--verify` liefert vor und nach allen Änderungen **`Zustandshash 9ec63e8c`** (gemessen, s. u.).

---

## BEFUND 1 — Der Sidegrad erreichte den Client nie (bestätigt)

**Belegstelle.** Leser: `src/client/main.js:1607` `sidegradeId: eigene.sidegradeId ?? null` in
`#startShotPrediction`. Der binäre Snapshot führt je Spieler nur
`entityId/teamId/alive/x/y/health/turnFlag/dirty/shield/frozenTurns/waterLevel`
(`src/shared/protocol.js`, `PLAYER_STRIDE = 15`), die Bestandsnachricht nur
`inventory/ammo/cooldowns/activeWeaponId/classId/archetypeId`
(`src/server/gameServer.js`, `#loadoutTable`). Der LOKALE Weg führte den Wert sehr wohl:
`src/engine/stateSnapshot.js:88` `sidegradeId: entry.sidegradeId ?? null`.

**Messwert (eigene Sonde, `/tmp/pa-stille/sonde1-sidegrade-maxhealth.mjs`, 45°, Kraft 100, flacher
Boden, Karte 2560 px):**

```
                        ohne Sidegrad   mit `kompakt`      mit `schwerlast`
scout/späher                39 px      57 px (+18)        29 px (−10)     | Faktor 0,2879 / 0,3455 / 0,2447
heavy/brawler               81 px     115 px (+34)        59 px (−22)     | Faktor 0,4113 / 0,4936 / 0,3496
artillery/scharfschütze    134 px     191 px (+57)        98 px (−36)     | Faktor 0,5347 / 0,6417 / 0,4545
```

Die Bahnweite wächst mit dem QUADRAT des Faktors (0,6417²/0,5347² = +44 %). Auf einer großen Karte
mit vollem Wurf sind das die vom Prüfer genannten Größenordnungen (bis mehrere hundert Pixel).

**Urteil: BEFUND.** Der Spieler wählt einen Sidegrad, der Server rechnet mit ihm, die angezeigte
Bahn gehörte zu einem anderen Profil.

**Fix (die kleinste Stelle, die alle Leser versorgt).** `sidegradeId` kommt in die
**Bestandsnachricht** (`CONTROL.LOADOUTS`), nicht in den binären Snapshot:

* Es ist eine Zeichenkette variabler Länge — der Spielerblock hat ein FESTES Layout je Figur
  (`PLAYER_STRIDE`), ein Feld dort änderte das Drahtformat für ALLE (Protokollversion, jeder
  Test zur Snapshot-Größe).
* Es ändert sich nie während eines Matches — dieselbe Kategorie wie `classId`/`archetypeId`, die aus
  genau diesem Grund schon dort stehen (`gameServer.js`, Kommentar „Nicht in den binären
  Snapshot").
* Der Wert kommt vom MOTOR (`match.players[].sidegradeId`, dort bereits gegen `SIDEGRADE_IDS`
  aufgelöst), nicht aus der Lobby-Konfiguration: eine unbekannte Kennung wirkt damit überall gleich
  („kein Sidegrade").

Der Client übernimmt ihn in `onlineViewState` mit dem neutralen Rückfall `null` (= „kein
Sidegrade", wie im Motor). Der lokale Weg war schon richtig und bleibt unverändert — deshalb ist
`src/engine/stateSnapshot.js` hier NICHT angefasst worden.

**Beleg (Test):** `tests/sidegrade-maxhealth-zuender.test.js`, Fall 1: echter Server, zwei Menschen,
Lobby mit `sidegrades: ['kompakt', null]`; geprüft wird, dass die Nachricht genau einen Platz mit
`kompakt` und einen mit `null` trägt, dass der Wert mit dem des Motors übereinstimmt und dass der
Faktor und die Bahn mit dem angekommenen Wert messbar anders sind (Schranke: `notEqual` auf Faktor
UND Bahnweite).

---

## BEFUND 2 — Die Schwelle des Mahlstroms stand zweimal (bestätigt)

**Belegstelle.** Motor: `src/engine/match.js:2722`
`if (this.#round >= MATCH_RULES.suddenDeath.roundBreakpoint)`; die Zahl ist
`roundBreakpoint = 8` (`src/shared/config/match.js:85`). Client: `src/client/main.js:1194` hart
`(snapshot.round ?? 0) >= 15` — der Wert VOR der letzten Balancing-Änderung. Der Renderer zeichnet
die Sturmwand nur bei `active` (`renderer.js`, `#drawMaelstrom`), das HUD meldete grün „Läuft"
(`hud.js`).

**Urteil: BEFUND** — online sieben Runden unsichtbar (Runde 8–14), während die Karte sich
zusammenzog und `outOfZoneDamage`/`toxicRain` wirkten. Lokal war es richtig, weil dort der Motor den
Wert liefert.

**Fix: EINE Aussprache der Regel für Leser ohne Zustandswert.** Neu:
`maelstromActiveFromRound(roundNumber, rules = MATCH_RULES.suddenDeath)` in
`src/shared/config/match.js` — liest `rules.roundBreakpoint`, dieselbe Konfiguration, aus der der
Motor liest. Der Client ruft sie mit `snapshot.round` auf. Ein Feld im Snapshot wäre die Alternative
gewesen; sie kostete ein Byte im Kopf und eine Protokollversion für einen Wert, der sich aus zwei
vorhandenen Angaben (Runde + Konfiguration) ergibt.

**Beleg (Test):** `tests/maelstrom-schwelle.test.js` — spielt ein ECHTES Match und vergleicht für
JEDE gesehene Runde `state.maelstrom.active` (Motor) mit `maelstromActiveFromRound(runde)`. Dazu
die Schranke, dass die erste aktive Runde die Schwelle IST, und eine Textwache, dass `main.js` keine
eigene Zahl (`>= 15`) mehr rechnet. Messwert der Schranke: 7 Runden (8…14) wären mit der festen 15
falsch gemeldet worden.

---

## BEFUND 3 — `MatchStats.tick` wurde nie fortgeschrieben (bestätigt)

**Belegstelle.** `src/shared/stats.js`: `feed()` schreibt für jeden Schuss `letzterSchuss.tick =
this.tick`, und der Vergleich lautet
`this.tick - letzter.tick <= TREFFER_FENSTER_TICKS` (240). `this.tick` wurde aber NUR in `match_over`
gesetzt (`p.ticks`) — während der Partie blieb er **0**. Der Client rief `feedAll(events)` ohne Takt
auf (`main.js#step`).

**Messwert vorher (nachgestellt mit dem alten Aufruf):** Schuss, 2000 Takte später Schaden →
`treffer: 1`, `trefferquote: 1`. Die Bedingung lautete immer `0 − 0 <= 240`.

**Warum kein Test es fand:** `tests/stats.test.js` zog den Takt von Hand nach
(`stats.tick = match.world.tickCount`) — der Test führte genau die Zeile aus, die im Produkt fehlte.

**Urteil: BEFUND.**

**Fix:** `MatchStats#setTick(tick)`, `feed(ereignis, tick?)` und `feedAll(ereignisse, tick?)`. Der
Client gibt den Takt mit: `this.stats?.feedAll(events, this.match.world.tickCount)` — er liegt dort
vor, in keinem Ereignis (Ereignisse tragen nur ihre Nutzlast).

**Beleg (Test):** `tests/stats-trefferfenster.test.js` (5 Fälle): Treffer 239 Takte danach zählt,
241 Takte danach NICHT (genau dieser Fall war vorher falsch), die Grenze 240 selbst zählt noch, ein
Schuss ohne Schaden bleibt ein Fehlschuss (bei verbuchtem Schaden), mehrere Schadensmeldungen
ergeben EINEN Treffer, und der echte Match-Pfad schreibt den Takt fort (`stats.tick ==
match.world.tickCount`, `> 0`).

---

## BEFUND 4 — Erneuter Start/Wiederaufbau ohne Seed ergibt eine andere Karte (bestätigt)

**Belegstelle.** `lobby.seed` ist im Normalfall `undefined` (Menüfeld „leer = neue Karte",
`main.js`); `serializeLobby` schrieb `seed: lobby.seed` (`persistence.js`), `JSON.stringify` lässt
einen `undefined`-Schlüssel WEG; `restoreLobby` reichte `saved.seed` (undefined) an
`lobbyManager.create` → `MatchController` → `match.js:564` `MatchSeedManager.createRandom()`. Den
echten Seed trug die ganze Zeit der Replay-Kopf (`saved.replay.seed`) und der Motor
(`seedManager.baseSeed`).

**Messwert (Sonde `/tmp/pa-stille/sonde2-neustart.mjs`, echter Weg über HTTP + WebSocket):**

```
Lobby angelegt. lobby.seed = undefined
vorher:  baseSeed 941474298  Hash 52fb908  Takt 92
Sicherung: seed-Schlüssel vorhanden? true | replay.seed 941474298 | hash 52fb908 | tick 92
nachher: baseSeed 941474298  Hash 52fb908  Takt 92   (nach echtem Serverneustart)
Client sieht lobby_state.seed = 941474298
```

Vorher (Prüfer-Messung, von mir nicht neu erzeugt, aber durch die Ursache gedeckt):
`baseSeed 3367130477 → 1341271627`, Hash `98aad2e2 → e6da56da`.

**Urteil: BEFUND** — und der Spieler-Symptomfall „Revanche" hat dieselbe Ursache: kein Seed in der
Sitzung, also ein frischer Zufalls-Seed beim nächsten Start.

**Fix, drei Stellen:**

1. `serializeLobby` schreibt den Seed, der WIRKLICH gespielt wurde:
   `lobby.seed ?? session?.match?.seedManager?.baseSeed ?? null`.
2. `restoreLobby` liest ihn mit Rückfall auf den Replay-Kopf: `saved.seed ?? saved.replay?.seed`
   — alte Sicherungen (ohne `seed`) funktionieren damit unverändert.
3. „Revanche" trägt den Seed der letzten Partie in das Seed-Feld ein (`main.js#seedFuerRevanche`,
   Quelle lokal `match.seedManager.baseSeed`, online `networkClient.worldSeed`). Der Wert steht
   sichtbar im Feld und darf gelöscht werden — die neue Karte bleibt eine bewusste Handlung.

**Beleg (Test):** `tests/wiederaufbau-seed-und-takt.test.js` — echter Server, Lobby OHNE Seed, zwei
Menschen, sichern, neu starten: Seed, Hash und Takt sind identisch, und der wieder verbundene
Client bekommt denselben Seed gemeldet. Dazu ein zweiter Fall „gleicher Seed, gleiche Eingaben →
gleicher Hash" (mit Gegenprobe: anderer Seed → anderer Hash).

---

## A5 — Der Wiederaufbau lief einen Takt zu weit (bestätigt)

**Belegstelle.** `gameServer.js#restoreFromReplay`:
`const limit = Math.max(totalTicks, …) + 1;` bei der Bedingung `tickCount < limit` — ein
Simulationsschritt über den gesicherten Takt hinaus, während der Kommentar zwei Zeilen darüber
„exakt derselbe Zustand" behauptete.

**Messwert (eigene Sonde, dieselbe gesicherte Datei, zwei Grenzen gerechnet):**

```
alte Grenze (+1): Takt 93  Hash e9a9ca52
neue Grenze     : Takt 92  Hash 52fb908
ReplayPlayer    : Takt 92  Hash 52fb908
gesichert       : Takt 92  Hash 52fb908
```

**Urteil: BEFUND.**

**Fix:** Grenze ohne `+1`; die Eingaben des GESICHERTEN Takts werden danach noch angewendet (sie
wirkten BEI diesem Takt — `handleInput` wendet sofort an und zeichnet den laufenden Takt auf), ein
zusätzlicher Simulationsschritt entfällt. **Und der eigentliche Gewinn:** `serializeLobby` legt den
Zustandshash mit ab (`hash`, `hashState()`), `restoreLobby` vergleicht und meldet — `logger.info`
bei Gleichheit, `logger.warn` bei Abweichung, mit beiden Hashes und beiden Taktzahlen. Zusätzlich
steht das Ergebnis als `server.restorePruefungen` bereit (prüfbar ohne Log-Auswertung). Ein
Rückfall in diese Fehlerklasse wird damit beim ersten Neustart laut statt still.

---

## A5b — Ohne Eingaben wurde GAR NICHT vorgespult (neu gefunden, bestätigt)

**Belegstelle.** `gameServer.js` (LobbySession-Konstruktor):
`if (Array.isArray(replayEntries) && replayEntries.length > 0) this.#restoreFromReplay(...)`. Eine
Partie, in der noch niemand geschossen hatte (oder in der alle Eingaben abgelehnt wurden), hat
`entries = []` — und wurde deshalb am ANFANG wiederhergestellt.

**Messwert (Sonde, vor dem Fix):** gesicherter Takt 92, wiederhergestellter Takt **0**, Hash
`2ee23ca9 → 3260a37`: Figuren auf den Startplätzen, Gelände unberührt — 92 Takte still weg.

**Urteil: BEFUND** — und erst durch die neue Gegenprobe überhaupt sichtbar geworden.

**Fix:** Bedingung `entries.length > 0 || replayTotalTicks > 0`; die Tickzahl allein genügt, weil die
Simulation aus Seed + Konfiguration deterministisch ist. **Beleg:** derselbe Test wie BEFUND 4
(er spielt bewusst OHNE Eingaben) plus die Sonde: `{gleich: true, erwartet: 52fb908, gemessen:
52fb908, tick: 92, tickGesichert: 92}`.

---

## A3 — `maxHealth: 100` hart im Client (bestätigt)

**Belegstelle.** `main.js` `onlineViewState` setzte `maxHealth: 100`; `hud.js` und `renderer.js`
rechnen `health / maxHealth` OHNE Obergrenze.

**Messwert (eigene Rechnung über alle Klassen × Archetypen × Sidegrades, `combatProfile` ×
`BASE_HEALTH`):** **32 verschiedene Werte, Spanne 48 … 195** — scout/späher **96**, artillery **108**,
heavy/brawler **156**, mit Zusatzpanzerung 120 / 135 / 195. Ein voller Balken eines 156-HP-Brawlers
war 156 % breit, ein unverletzter Späher sah mit 96 % beschädigt aus.

**Urteil: BEFUND.** **Fix:** `maxHealth` kommt in derselben Bestandsnachricht wie Klasse und
Sidegrad — gelesen aus dem Wert, den der MOTOR gesetzt hat (`world.getComponent(id,'Health','max')`),
nicht nachgerechnet. Der Client übernimmt ihn; die 100 bleibt nur als Startwert bis zur ersten
Bestandsnachricht (der Server sendet sie beim Beitritt sofort). **Beleg:**
`tests/sidegrade-maxhealth-zuender.test.js`, Fall 1 — unabhängig nachgerechnet über
`combatProfile(CLASS_IDS[…], ARCHETYPE_IDS[…], sidegradeId) × BASE_HEALTH` (inklusive der Falle
„Index vs. Name", siehe `launchSpeed.js`), plus Schranke „mindestens ein Wert ≠ 100".

---

## A6 — Der Zünder-Countdown war online immer 0 (bestätigt)

**Belegstelle.** `renderer.js` `#drawProjectiles` liest `projectile.fuseSeconds ?? 0`; der
Projektilblock des Snapshots führte nur `entityId/x/y`; `main.js` reicht die Liste unverändert
durch. Lokal steht der Wert im Zustand (`stateSnapshot.js`: `fuseSeconds`).

**Messwert:** Der längste Zünder im Katalog ist **5,0 s** (11 von 150 Waffen haben `fuseTime > 0`;
Maximum `pa_144` mit 5 s) → 50 Zehntelsekunden von 255 in einem Byte. Vorher: online `0` in JEDEM
Takt, also kein Ring und keine Sekundenzahl — genau die Anzeige, für die der Code gebaut ist.

**Urteil: BEFUND.** **Fix:** `PROJECTILE_STRIDE 6 → 7` (Zünderrest als Uint8 in Zehntelsekunden),
**`PROTOCOL_VERSION 7 → 8`**, encode und decode im selben Kopf-Kommentar dokumentiert. Der Wert geht
in DERSELBEN Einheit über die Leitung, in der ihn der lokale Zustand führt (`fuseSeconds`), damit die
Anzeige in beiden Betriebsarten dasselbe liest. **Beleg:**
`tests/sidegrade-maxhealth-zuender.test.js`, Fälle 2 und 3 — Größenformel gegen `HEADER_SIZE`,
`PROJECTILE_STRIDE` und `GUENTHER_STRIDE`; eine echte Zündgranate (`pa_144`) trägt ihren Rest durch
encode → decode unverändert.

---

## A7 — Versionsabweichung = schwarzes Bild ohne Meldung (bestätigt)

**Belegstelle.** `networkClient.#handleMessage`: `const snapshot = decodeSnapshot(…); if (!snapshot)
return;` — kein Zähler, keine Meldung. `decodeSnapshot` liefert `null` bei falscher
Protokollversion, falscher Kennung oder abgeschnittenem Puffer; die drei Fälle waren von außen
nicht zu unterscheiden.

**Urteil: BEFUND.** **Fix:** Der Client zählt verworfene Takte (`#snapshotRejects`, sichtbar über
`networkClient.stats.snapshotRejects`) und meldet über das Ereignis `snapshot_rejected` den GRUND
(Version aus dem Frame-Kopf, Puffergröße, Versuchszahl). `main.js` schreibt die ERSTE Zeile ins
HUD-Protokoll („Zustandstakt verworfen: Protokollversion 7 statt 8 (…) — das Bild steht, bis das
passt"); weitere Ausfälle erhöhen nur den Zähler. **Beleg:** Der Grund ist aus dem Frame ableitbar
und wird im Ereignis mitgeführt; ein Browsertest dafür steht AUS (siehe „was ich NICHT geprüft
habe").

---

## Fehlalarme / Urteile ohne Änderung

* **`maxHealth` „Lebensbalken 156 % breit" war KEIN Fehlalarm** — aber die vom Prüfer genannte
  Zahl „heavy 108" ist falsch: heavy/brawler ergibt **156**, artillery **108**. Die Spanne
  48…195 und die 32 Werte stimmen.
* **`fuseSeconds` „Fix: PROJECTILE_STRIDE 6 → 8"** — der Prüfer nennt 8; gemessen genügt **7**
  (ein Byte Zehntelsekunden, Maximum 50 von 255). Ein zweites Byte wäre verschenkter Platz in jedem
  Takt, in dem ein Projektil fliegt.
* **Kein weiterer Fehlalarm.** Die vier gemeldeten Punkte (A3, A5, A6, A7) sind alle bestätigt —
  drei davon habe ich selbst nachgemessen, einer (A7) ist durch Lesen und die Konsequenz belegt.
  Der Nebenfund **A5b** kam bei der Prüfung von A5 hinzu.

---

## Warum die Formatsänderung (Protokoll v8) den Determinismus NICHT berührt

Abnahmevorgabe war: `npm run replay -- play artifacts/replay-20260910.json --verify` muss
`9ec63e8c` behalten — AUSSER bei einer Formatsänderung, und die ist zu begründen. Gemessen:

```
npm run replay -- play artifacts/replay-20260910.json --verify
  Zustandshash: 9ec63e8c     (vorher wie nachher identisch, alle OK-Zeilen grün)
```

Begründung: Der Replay-Vertrag zeichnet EINGABEN auf (`src/engine/replay.js`), nicht Drahtframes.
`PROTOCOL_VERSION`/`PLAYER_STRIDE`/`PROJECTILE_STRIDE` stehen NUR im Encoder/Decoder
(`src/shared/protocol.js`) und werden von keinem Simulationspfad gelesen — `hashState()` kennt sie
nicht. Die Simulation ist unverändert; geändert ist die Übertragung zwischen zwei Rechnern (und die
Zünder-Granate trägt jetzt eine Zahl mehr, die sie vorher schon hatte). Die Version wird erhöht,
damit eine ältere Gegenstelle den Frame ABLEHNT statt ihn falsch zu lesen.

---

## Tests und Prüfläufe (gemessen, nicht behauptet)

| Prüfung | Ergebnis |
|---|---|
| `node --test tests/maelstrom-schwelle.test.js tests/stats-trefferfenster.test.js` | **9/9 grün** |
| `node --test tests/wiederaufbau-seed-und-takt.test.js` | **2/2 grün** |
| `node --test tests/sidegrade-maxhealth-zuender.test.js` | **4/4 grün** |
| `node --test tests/persistence*.test.js tests/netcode.test.js tests/snapshot-size.test.js` | **49/49 grün** |
| `node --test` (16 Dateien: stats, einheiten-je-spieler, seed-feld, abort-knopf, hud-vorrang, identity, event-coverage, ereignis-kontext, sidegrades, class-profile, loadout-choice, match-rules, replay-head, replay, replay-uhr, replay-sprung-luecke) | **178/178 grün** |
| `node --test` (10 Wachen: no-dead-code, ohne-kommentare, eine-regel-eine-stelle, pruefwerkzeuge, server-integration, server-start, generator-syntax, anti-cheat, metrics, logger) | **82/82 grün** |
| `npm run lint` | **Exit 0** |
| `npm run check:docs` | **alle richtig** (nach Nachziehen der Dateizahl im README: 107 → 111) |
| `npm run replay -- play … --verify` | **9ec63e8c**, alle Prüfzeilen OK |

Kein voller `npm test`-Lauf und kein `npm run test:e2e`-Volllauf — das war ausdrücklich verboten.
Die Testzahlen sind deshalb Einzelläufe, nicht der Gesamtbestand.

---

## Was ich NICHT geprüft habe

* **Kein voller Testlauf, kein E2E-Lauf.** Ob mein Protokoll v8 irgendeinen E2E-Fall bricht, ist
  NICHT gemessen. Die E2E-Suiten lesen `PROTOCOL_VERSION` dynamisch
  (`tests/e2e/multiplayer.spec.mjs` vergleicht gegen die importierte Zahl), das sollte tragen —
  belegt ist es nicht.
* **Die A7-Meldung ist nicht im Browser gesehen.** Der Zähler und das Ereignis sind Code; der
  Beweis „der Spieler sieht jetzt eine Zeile" bräuchte einen Browsertest. Nicht ausgeführt.
* **Die „Revanche"-Zeile ist nicht im Browser gesehen.** `#seedFuerRevanche` liest den Seed aus dem
  Match bzw. dem Netzwerk-Client und schreibt ihn in `#cfg-seed` — geprüft ist der SERVER-Teil des
  Seed-Durchreichens (echter Neustart, Test), der lokale Menüweg nur durch Lesen.
* **Online-Kennzahlen (Trefferquote).** `MatchStats` wird nur im lokalen Modus gefüttert
  (`#starteErfassung` läuft in `startMatch`); ob der Bericht im Online-Modus eine Quote zeigt,
  habe ich nicht geprüft und nicht geändert.
* **`maxHealth`-Anzeige im Online-Bild.** Der Wert kommt jetzt an (Test); dass der Balken im
  Browser damit korrekt breit ist, ist nicht im Browser gemessen (die Lesestellen im Renderer/HUD
  liegen bei anderen Arbeitern).
* **Weitere Leser der Mahlstrom-Schwelle** (HUD-Vorrang, Klang, Kamera) habe ich auf `>= 15` bzw.
  eigene Zahlen durchsucht (keine Treffer außer der behobenen Stelle) — die Anzeige selber aber
  nicht im Browser nachgestellt.
* **`outOfZoneDamage`/`toxicRain` (Wirkung des Sturms)** sind unverändert; ich habe nur die
  SICHTBARKEIT der Schwelle angefasst.
