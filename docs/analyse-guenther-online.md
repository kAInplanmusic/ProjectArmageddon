# Analyse: Ist Günther im Online-Match unsichtbar?

**Datum:** 2026-09-26 21:25 CEST
**Repo:** `/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon`
**Branch:** `main`
**Commit beim Beginn der Analyse:** `d2d8495` (schmutziger Arbeitsbaum)
**Commit beim Abschluss:** `7d4d208` — HEAD ist WÄHREND der Analyse gewandert
**Auftrag:** Widerlegungsversuch gegen eine Fremdmeldung. Rein lesende Prüfung —
keine Produktivdatei, keine Testdatei geändert; kein `npm test`, kein Playwright,
kein `npm run build`. Einzige Schreibe: dieses Dokument.

**Arbeitsbaum-Hinweis (wichtig für die Zeilenangaben).** Beim Beginn lagen die
Belege im **Arbeitsbaum** von `d2d8495` vor: viele Dateien waren geändert
(`M src/client/main.js`, `M src/engine/match.js`, …) und
`src/client/ereignisse.js` war **untracked** (`??`). Während der Analyse haben
parallel arbeitende Auftragnehmer diese Änderungen **committet**; HEAD steht
jetzt auf `7d4d208`. Genau diese vorher ungetrackten/geänderten Fassungen sind
damit Inhalt von `7d4d208`.

Deshalb wurde JEDE Fundstelle und JEDE Messung dieses Dokuments **am Ende
nochmals gegen `7d4d208` geprüft** — alle Zeilenangaben, alle wörtlichen Zitate
und beide Messläufe sind dort reproduziert worden (Ergebnis unten: identisch,
u. a. `ticks=3180 aktiv_ticks=900`, `172 Bytes`, `decodeSnapshot kennt
guenther? false`). Die Angaben beziehen sich also auf `7d4d208` und stimmten
schon für den Arbeitsbaum von `d2d8495`.

**Methode.** Statische Belegkette (Fundstelle wörtlich) plus eine **lesende
Messung am Motor**: ein `node --input-type=module -e`-Lauf, der einen
`MatchController` genau so aufbaut, wie der Server ihn aufbaut
(`src/server/gameServer.js:85`), ihn schrittweise simuliert und
`encodeSnapshot`/`decodeSnapshot` im Prozess aufruft. Der Lauf schreibt **keine
Datei** und ist keiner der verbotenen Befehle. Der Lauf ist unten wörtlich
zitiert. Für die Frage „ist Günther im Browser unsichtbar?" bleibt es bei einem
**statischen Beweis ohne Browser-Messung** — das ist als Grenze unten benannt.

---

## Befund in einem Satz

**Bestätigt:** Günther wird im Online-Match nicht gezeichnet, weil der
Netzwerkzustand gar keinen Günther führt — das **Drahtformat** kennt kein
Günther-Feld (`src/shared/protocol.js`), die Onlinesicht des Clients setzt
deshalb keines (`src/client/main.js:1119–1152`), und der Renderer, der genau
daraus zeichnet (`src/client/renderer.js:1200`, `:1218`), bekommt `undefined`.

**Aber die von der Fremdmeldung genannte Begründung ist nicht die Ursache der
Unsichtbarkeit.** Die „Zuordnungstabelle nur im lokalen Zweig" betrifft den
**Ereignisweg** (HUD-Text, Glücksrad-Overlay) — sie ist **wahr**, aber sie ist
eine *zweite, unabhängige* Lücke. Der Motor **sendet** die vier Ereignisse
nachweislich online (gemessen), der Client **verwirft** sie. Wer nur die Tabelle
repariert, macht Günther **nicht** sichtbar: es fehlt die Zustandsübertragung.

Zusätzlich ein **widerlegter Code-Kommentar**: „der Server kennt diese
Ereignisarten nicht" (`src/client/ereignisse.js:373–374`) ist **falsch** —
gemessen und an `src/server/gameServer.js:246` belegt.

---

## Prüfschritt 1 — Erzeugt die Engine Günther online überhaupt?

**Ja, unbedingt.** Drei Belege:

**(a) Das System wird im Konstruktor des Matches IMMER erzeugt** — kein
Modus-Schalter, keine Bedingung:

```bash
$ grep -n '' src/engine/match.js | sed -n '617,622p'
```
```
617:     */
618:     this.#guenther = new GuentherSystem({
619:       rng: this.#seedManager.getSubRng('GUENTHER'),
620:       maxRounds: this.maxRounds,
621:       width: this.width,
622:       height: this.height,
```

**(b) `#stepGuenther()` steht bedingungslos in `step()`** — also in JEDER
Simulation, der des Servers eingeschlossen:

```bash
$ grep -n '' src/engine/match.js | sed -n '1136,1139p'
```
```
1136:     // Günther bewegt sich nach der Physik: Er läuft auf der Oberfläche, die
1137:     // sich in diesem Schritt geändert haben kann.
1138:     this.#stepGuenther();
1139:     // KEIN `drain()` hier: das würde die Warteschlange leeren und die
```

Der einzige Ausstieg liegt INNERHALB der Methode und prüft nur, ob es das System
gibt:

```bash
$ grep -n '' src/engine/match.js | sed -n '1310,1313p'
```
```
1310:   #stepGuenther() {
1311:     if (!this.#guenther) return;
1312:     this.#guenther.setRunde(this.#round);
```

**(c) Der Server benutzt DENSELBEN MatchController** — kein zweiter Motor, kein
abgespeckter Serverlauf:

```bash
$ grep -n '' src/server/gameServer.js | sed -n '85,89p'
```
```
85:     this.match = new MatchController({
86:       seed: lobby.seed,
87:       teams: lobby.teams,
88:       playersPerTeam: lobby.playersPerTeam,
89:       preset: lobby.preset,
```

**Messung (Gegenbeweis gegen „vielleicht läuft er nur lokal").** Ein
`MatchController` mit exakt diesen Optionsfeldern, 4 Seeds, `step()` bis
Spielende, Ereignisse über `consumeEvents()` gezählt:

```bash
$ node --input-type=module -e '…' # vollständiges Skript im Anhang (Belegweg B)
```
```
seed=4242 status=gameover runden=31 ticks=3180 guenther_aktiv_ticks=900 haufen_max=5 events={"guenther_poop":5,"guenther_pee":5,"guenther_wheel":2,"guenther_poop_hit":2}
   Beispielereignis: {"type":"guenther_poop","payload":{"x":2329.2,"y":824}}
seed=7 status=gameover runden=31 ticks=2580 guenther_aktiv_ticks=810 haufen_max=3 events={"guenther_poop":3,"guenther_pee":4,"guenther_wheel":2}
seed=9001 status=gameover runden=31 ticks=2880 guenther_aktiv_ticks=1530 haufen_max=5 events={"guenther_poop":5,"guenther_wheel":3,"guenther_pee":7}
seed=12 status=gameover runden=31 ticks=3210 guenther_aktiv_ticks=810 haufen_max=4 events={"guenther_poop":4,"guenther_pee":2,"guenther_wheel":2}
```

**Ergebnis:** In **jedem** der vier Läufe ist Günther hunderte Ticks `aktiv`,
baut bis zu 5 Haufen und emittiert **alle drei/vier** Ereignisarten. Die Engine
erzeugt ihn online — die Fremdmeldung hat insoweit recht, dass die Simulation
läuft.

---

## Prüfschritt 2 — Sendet der Server die Günther-Ereignisse?

**Ja — ALLE, ohne Whitelist, ohne Filter.** Die Weiterleitung ist eine Schleife
über die gesamte Ereignisliste:

```bash
$ grep -n '' src/server/gameServer.js | sed -n '244,248p'
```
```
244:    }
245:
246:    for (const event of this.match.consumeEvents()) {
247:      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
248:    }
```

`#broadcastControl` serialisiert den Typ unverändert und schickt ihn an alle
Sockets — keine Typenprüfung:

```bash
$ grep -n '' src/server/gameServer.js | sed -n '591,596p'
```
```
591:   #broadcastControl(type, payload) {
592:     const message = controlMessage(type, payload);
593:     for (const socket of this.clients.values()) {
594:       if (socket.readyState === 1) socket.send(message);
595:     }
596:   }
```

**Der Empfänger nimmt sie ebenfalls an** — unbekannte Steuernachrichten fallen in
den `default`-Zweig und werden als `game_event` gereicht:

```bash
$ grep -n '' src/client/networkClient.js | sed -n '396,399p'
```
```
396:      default:
397:        // Simulierte Spielereignisse (turn_start, explosion, terrain_destroyed, ...)
398:        this.#emit('game_event', message);
399:        break;
```
```bash
$ grep -n '' src/client/main.js | sed -n '994p'
```
```
994:     client.on('game_event', message => this.#handleRemoteEvent(message));
```

**Folge:** Die vier Günther-Ereignisse **kommen online an**. Sie werden erst bei
der Wirkung verworfen (Prüfschritt 4) — genau umgekehrt zur Aussage des
Code-Kommentars.

**Damit ist der Kommentar `src/client/ereignisse.js:373–374` widerlegt:**

```bash
$ grep -n '' src/client/ereignisse.js | sed -n '373,374p'
```
```
373:   // Günther: seine Streiche gibt es nur im lokalen Match — der Server kennt
374:   // diese Ereignisarten nicht.
```

Der Server kennt sie: er erzeugt sie (Prüfschritt 1) und schickt sie
(Prüfschritt 2). Die Datei `tests/event-coverage.test.js` sagt dasselbe bereits
an anderer Stelle: „Der Server schickt JEDES Engine-Ereignis an alle Clients
(`src/server/gameServer.js:246–248`)" (`tests/event-coverage.test.js:296–297`,
Umfeld der Liste `nurEinZweig`).

---

## Prüfschritt 3 — Trägt der übertragene Zustand Günther?

Hier liegt der **Kern**. Der Ansichtszustand der Engine **führt** Günther:

```bash
$ grep -n '' src/engine/stateSnapshot.js | sed -n '199,203p'
```
```
199:     terrainHeight: quelle.terrainHeight,
200:     orientation: quelle.orientation,
201:     guenther: quelle.guenther,
202:     // Die Kulisse geht als Kennung mit, nicht als volles Objekt: der Client
```

Und die Quelle füllt ihn aus dem Systemabzug:

```bash
$ grep -n '' src/engine/match.js | sed -n '3057,3058p'
```
```
3057:       // Günther ebenso als Abzug: Sein Aufbau liegt im GuentherSystem.
3058:       guenther: this.#guenther ? this.#guenther.snapshot() : null,
```

**Aber das Drahtformat kennt ihn nicht.** Der Snapshot hat einen festen Kopf
(24 Byte) und vier Abschnitte: Spieler, Projektile, Kisten, Geschütze. Für
Günther gibt es **kein Feld, keine Kennung, kein Byte**:

```bash
$ grep -rin 'guenther' src/shared/protocol.js
$ echo "(kein Treffer — exit 1)"
```
```
(kein Treffer — exit 1)
```

```bash
$ grep -n -e 'PLAYER_STRIDE = 15' -e 'PROJECTILE_STRIDE = 6' -e 'CRATE_STRIDE = 8' -e 'TURRET_STRIDE = 8' -e 'HEADER_SIZE = 24' src/shared/protocol.js
```
```
117:export const PLAYER_STRIDE = 15;
118:export const PROJECTILE_STRIDE = 6;
126:export const CRATE_STRIDE = 8;
134:export const TURRET_STRIDE = 8;
144:export const HEADER_SIZE = 24;
```

**Messung — der Zustand trägt Günther, der Draht nicht.** In demselben
Prozess, im Moment seiner Aktivität, mit einem Haufen auf der Karte:

```bash
$ node --input-type=module -e '…' # vollständiges Skript im Anhang (Belegweg C)
```
```
ticks bis Guenther aktiv MIT Haufen: 1405 | runde: 12
getState().guenther = {"aktiv":true,"x":2329.2,"y":824,"richtung":-1,"haufen":[{"x":2329.2,"y":824}]}
encodeSnapshot Bytes: 172 = HEADER 24 + 4 Spieler x 15 = 84
decodeSnapshot() Felder: version,isFull,tick,round,wind,turnRemainingMs,activePlayerId,entities,projectiles,crates,turrets,previous
decodeSnapshot hat guenther?  false
```

**Das ist der Beweis:** Während `getState().guenther.aktiv === true` mit einem
Haufen bei (2329.2, 824) ist, enthält der kodierte Snapshot (172 Byte) **kein**
Günther-Feld — `decodeSnapshot` liefert 12 Schlüssel, keiner davon `guenther`.
**Der Client kann nichts zeichnen, was er nicht bekommt.**

Bemerkenswert: Das Muster ist im Code bereits **dokumentiert und zweimal
behoben worden** — für Kisten (Protokoll v5) und Geschütze (Protokoll v6),
jeweils mit genau dieser Begründung:

```bash
$ grep -n '' src/shared/protocol.js | sed -n '373,375p'
```
```
373:    * Kisten stehen NACH den Projektilen — die Reihenfolge muss zu encodeSnapshot
374:    * passen. Sie werden im Zustand ausdrücklich mitgeführt, weil sie sonst online
375:    * unsichtbar wären: `onlineViewState` im Client konnte sie nicht erfinden.
```

Günther ist derselbe Fall — nur ohne den dritten Ausbau. Der Kommentar bei der
Onlinesicht nennt die Ursache der beiden Vorläufer sogar ausdrücklich als
„**ZWEI Stellen**" (Client füllt nicht + Draht überträgt nicht); genau diese
Zwei-Stellen-Lage liegt hier wieder vor.

---

## Prüfschritt 4 — Was zeichnet der Renderer, und was liest die Tabelle?

**Der Renderer liest `state.guenther` — genau das Feld, das online fehlt:**

```bash
$ grep -n 'guenther' src/client/renderer.js
```
```
14:import { GUENTHER_IDENTITY } from '../shared/config/guenther.js';
936:   * @param {object|null} guenther - Zustand aus `getState().guenther`
938:  #drawGuenther(guenther) {
939:    if (!guenther?.aktiv) return;
940:    const { coat, coatDark, belly, nose, height, length } = GUENTHER_IDENTITY;
941:    const richtung = guenther.richtung >= 0 ? 1 : -1;
942:    const x = guenther.x - length / 2;
943:    const y = guenther.y;
1200:    this.#drawPoopPiles(state.guenther?.haufen ?? []);
1218:    this.#drawGuenther(state.guenther);
```

Beide Zeichenstellen sind **weich** gegen das fehlende Feld: `:1200` liest
`haufen ?? []` (leere Liste), `:1218` reicht `undefined` weiter, und `:939`
steigt bei `!guenther?.aktiv` aus. **Ein fehlendes Feld ist lautlos** — kein
Fehler, kein Log, nur ein leeres Bild. Genau deshalb fällt es niemandem auf.
Damit sind die beiden von der Fremdmeldung genannten Zeichenstellen
(`renderer.js:1218`, `:1200`) **wörtlich bestätigt**.

**Die Zuordnungstabelle behandelt die vier Arten NUR lokal** — bestätigt:

```bash
$ grep -n '' src/client/ereignisse.js | sed -n '373,397p'
```
```
373:  // Günther: seine Streiche gibt es nur im lokalen Match — der Server kennt
374:  // diese Ereignisarten nicht.
375:  guenther_wheel: {
376:    lokal: (k, n) => {
377:      k.showGuentherWheel(n);
378:    },
379:  },
380:
381:  guenther_pee: {
382:    lokal: (k, n) => {
383:      k.hud.log(`Günther pinkelt ${k.nameOf(n.playerId)} an (−${n.amount})`, 'neutral');
384:    },
385:  },
386:
387:  guenther_poop: {
388:    lokal: (k) => {
389:      k.hud.log('Günther hat ein Häufchen gemacht', 'neutral');
390:    },
391:  },
392:
393:  guenther_poop_hit: {
394:    lokal: (k, n) => {
395:      k.hud.log(`${k.nameOf(n.playerId)} ist in ein Häufchen getreten`, 'danger');
396:    },
397:  },
```

**Und der Online-Zweig fällt NICHT auf `lokal` zurück** — die entscheidende
Zeile gegen die Vermutung „es greift ohnehin der lokale Zweig":

```bash
$ grep -n '' src/client/ereignisse.js | sed -n '559,571p'
```
```
559:export function verarbeiteLokal(kontext, ereignis) {
560:  EREIGNIS_WIRKUNGEN[ereignis.type]?.lokal?.(kontext, ereignis.payload);
561:}
...
569:export function verarbeiteOnline(kontext, nachricht) {
570:  EREIGNIS_WIRKUNGEN[nachricht.t]?.online?.(kontext, nachricht);
571:}
```

`?.online?.()` — fehlt der Schlüssel, ist die Wirkung ein **No-op**. Der Server
schickt `guenther_poop`, der Client sucht `.online`, findet nichts, tut nichts.

**Folge (zwei getrennte Lücken):**
1. **Darstellung (Ursache der Unsichtbarkeit):** kein `guenther`-Feld im Draht
   und in der Onlinesicht → Günther und die Haufen werden nie gezeichnet.
2. **Ereignisse (Ursache der Stille):** die vier kommen an, werden aber
   verworfen → keine HUD-Zeile, kein Glücksrad-Overlay online, obwohl eines der
   Ereignisse (`guenther_wheel`) die **eigene** Wirkung des Spielers steuert.

---

## Prüfschritt 5 — Gegenprobe: Woher bekommt die LOKALE Sicht ihre Daten?

**Eine einzige Zeile entscheidet den ganzen Fall:**

```bash
$ grep -n 'this.onlineViewState : this.match' src/client/main.js
```
```
1039:    const roh = this.mode === 'online' ? this.onlineViewState : this.match?.getState() ?? null;
```

- **Lokal:** `this.match.getState()` → `match.js:2979` delegiert an
  `baueAnsichtszustand(this.#zustandsQuelle())` → `match.js:3058` setzt
  `guenther: this.#guenther.snapshot()` → `stateSnapshot.js:201` reicht es durch
  → Renderer zeichnet. **Der lokale Weg geht direkt aus dem Match, nicht über
  den Ansichtszustand des Netzes.**
- **Online:** `this.onlineViewState` — der Getter ab `main.js:1053`, dessen
  Rückgabeobjekt bei `:1119` beginnt und in `:1152` endet. Die Feldliste ist
  vollständig:

```bash
$ grep -n '' src/client/main.js | sed -n '1119,1152p'
```
```
1119:    return {
1120:      status: this.remoteStatus ?? 'playing',
1121:      round: snapshot.round,
1122:      maxRounds: 30,
1123:      wind: snapshot.wind,
1124:      tick: snapshot.tick,
1125:      turnElapsedMs: Math.max(0, turnDurationMs - remaining),
1126:      turnDurationMs,
1127:      activePlayerId: snapshot.activePlayerId,
1128:      winnerTeamId: this.remoteWinner ?? null,
1129:      statuses,
1130:      maelstrom: { active: (snapshot.round ?? 0) >= 15, inset: this.remoteInset ?? 0 },
1131:      entities,
1132:      projectiles: snapshot.projectiles ?? [],
1143:      crates: snapshot.crates ?? [],
1149:      turrets: snapshot.turrets ?? [],
1150:      terrainWidth: this.remoteTerrain?.width ?? this.renderer.width,
1151:      terrainHeight: this.remoteTerrain?.height ?? this.renderer.height,
1152:    };
```

**Kein `guenther`. Auch kein `orientation`, kein `scenery`.** Die von der
Fremdmeldung genannte Stelle `main.js:1119–1143` ist damit **bestätigt** — es
ist der Feldblock der Onlinesicht, und `:1119` ist exakt die Zeile `return {`.

**Damit ist der Unterschied zwischen den beiden Wegen der eigentliche Befund:**
Nicht „die Tabelle ist unvollständig", sondern **die Onlinesicht hat keine
Quelle für Günther.** Der Fix an der Tabelle wäre wirkungslos für die
Darstellung; der Fix der Darstellung braucht einen **Drahtkanal** (Protokoll-
Erweiterung) *und* das Feld in der Onlinesicht — dieselbe Zwei-Stellen-Kur wie
bei Kisten und Geschützen.

**Es gibt keinen zweiten Weg, der ihn online doch noch zeigt.** Geprüft:

```bash
$ grep -rn 'GuentherSystem\|guentherSystem\|GUENTHER_SPAWN\|GUENTHER_MOVEMENT' src/client/
$ echo "(leer)"
```
```
(leer)
```

Der Client baut Günther **nicht** aus dem Seed nach (anders als die Kulisse,
`stateSnapshot.js:202–203`: „der Client baut sie ohnehin selbst aus dem Seed" —
für Günther gilt das NICHT), und es gibt **genau eine** Render-Aufrufstelle:

```bash
$ grep -rn 'renderer\.render(' src/client/*.js
```
```
src/client/main.js:1987:    this.renderer.render(state, {
```

---

## GEGENPROBE-PFLICHT: Fälle, in denen mein Befund NICHT gilt

**Fall A — „Der Client rekonstruiert Günther deterministisch aus dem Seed."**
Wäre das so, wäre die fehlende Drahtübertragung harmlos. **Geprüft und
verworfen:** `grep -rn 'GuentherSystem|guentherSystem|GUENTHER_SPAWN|GUENTHER_MOVEMENT' src/client/`
liefert **nichts**. Kein Clientmodul importiert das System oder seine
Bewegungskonstanten; `src/client` kennt nur `GUENTHER_IDENTITY` (Zeichnung,
`renderer.js:14`) und `GUENTHER_WHEEL` (Overlay-Ausgänge, `main.js:29`) sowie
den Debug-Zugriff (`debugApi.js`). Die Kulisse wird aus dem Seed gebaut,
Günther nicht.

**Fall B — „Der Save-/Replay-Modus zeigt ihn, also ist es kein genereller
Fehler."** **Bestätigt und eingegrenzt:** Der Befund gilt **nur für
`mode === 'online'`**. Lokal (`main.js:1039` links) und im Wiederabspielpfad
läuft alles über `match.getState()`, wo Günther enthalten ist. Der Fehler ist
also spezifisch der Netzpfad, nicht die Anzeige allgemein.

**Fall C — „Die Ereignisse reichen zum Zeichnen; die Tabelle ist der einzige
Fehler."** **Verworfen:** Die Ereignisse tragen nur Momentwerte
(`guenther_poop` → `{x, y}`, gemessen: `{"x":2329.2,"y":824}`). Günther muss sich
aber **kontinuierlich bewegen** (900–1530 aktive Ticks je Partie) und seine
Haufenliste wächst und schrumpft (`maxPiles`). Aus zwei Dutzend Einzelpunkten
pro Partie lässt sich keine laufende Figur zeichnen — es braucht den
**Zustand**, also den Drahtkanal. Der Ereignisweg erklärt nur HUD und Rad.

**Fall D — „Ein Test fängt das ab, der Befund ist also bekannt und harmlos."**
**Teilweise bestätigt:** `tests/event-coverage.test.js:287` benennt die
Client-Lücke wörtlich (`GUENTHER_ONLINE_OFFEN`) und markiert die vier Einträge
als `offen`. Der Test **misst aber den Server nicht** — wörtlich: „Ob der Server
würfelt, ist NICHT gemessen." Genau diese Lücke schließt Prüfschritt 1 dieses
Dokuments: der Server **würfelt**. Und **kein** Test deckt die Online-Anzeige ab
— die Fundstelle ist ein Kommentar, keine Zusicherung, und der einzige
Günther-E2E-Test startet ein **lokales** Match
(`tests/e2e/guenther.spec.mjs:20`: `api.startMatch({ seed, … })`). Ein Fehler,
den nur ein Kommentar nennt und kein Test hält, ist nicht abgesichert.

**Fall E — „Die Fremdmeldung hat den Ereignispfad gemeint, und der ist der
Grund."** **Verworfen** — siehe Befund: Ereignisse sind der Grund für die
*Stille*, nicht für die *Unsichtbarkeit*.

**Suchweite (Lehre aus früheren Fehlalarmen):** gesucht wurde über `src/`,
`tests/`, `scripts/` und `docs/`, nicht nur in der Definitionsdatei — u. a.
`grep -ril 'guenther' src tests scripts docs` (16 Dateien) und
`grep -rin 'guenther' src tests` (230 Treffer). Die Lesestellen
(`renderer.js`, `main.js`) liegen in anderen Dateien als die Definition
(`guentherSystem.js`) — genau die Konstellation, an der frühere Befunde
gescheitert sind. Hier sind **alle** Lesestellen geprüft.

---

## Bestand der Fremdmeldung: **TEILWEISE BESTÄTIGT**

| Teilaussage der Fremdmeldung | Urteil | Beleg |
|---|---|---|
| Günther ist im lokalen Match sichtbar | **bestätigt** | `main.js:1039` links → `getState()` → `match.js:3058` → `renderer.js:1218` |
| Günther ist im Online-Match **nicht** sichtbar | **bestätigt** | `main.js:1119–1152` ohne `guenther`; `protocol.js` ohne Kanal; Messung: `decodeSnapshot hat guenther? false` |
| Die Zuordnungstabelle behandelt die vier Ereignisse NUR im lokalen Zweig | **bestätigt** (wörtlich) | `ereignisse.js:375,381,387,393`; kein Rückfall: `:570` |
| … und **das ist die Begründung der Unsichtbarkeit** | **widerlegt** | Ereignisse steuern HUD/Rad, nicht die Zeichnung; Zeichnung liest `state.guenther` (`renderer.js:1200,1218`) |
| `main.js:1119–1143` baut die Onlinesicht | **bestätigt** | `:1119` ist `return {`; Block endet `:1152` |
| `renderer.js:1218` und `:1200` sind die Zeichenstellen | **bestätigt** (wörtlich) | siehe Prüfschritt 4 |
| `git grep guenther src/client/main.js` liefert nur `GUENTHER_WHEEL`, Rad-Overlay, Timer | **bestätigt** | 9 Treffer: `:29, :1375, :1589, :1590, :1597, :1611, :1616, :1656, :1657` |

**Widerlegter Code-Kommentar (nicht Teil der Fremdmeldung, aber am selben Ort):**
`ereignisse.js:373–374` „der Server kennt diese Ereignisarten nicht" —
**falsch**, siehe Prüfschritt 1 (Messung) und 2 (`gameServer.js:246`).

**Ordnung der Schwere.** Der Befund ist ein **Erlebnis-Fehler** der vom
Tiefen-Audit geführten Klasse „Anzeige gegen Simulation": Der Spieler wird
online verlangsamt und vergiftet (`match.js:1328–1332`: `damagePerTurn`,
`addSlow`), ohne den Verursacher zu sehen. Zusätzlich verliert er online die
**eigene** Wirkung des Glücksrads (`guenther_wheel` → `showGuentherWheel`), weil
kein `online`-Zweig existiert — obwohl der Server das Ereignis schickt.

---

## Offen, nicht prüfbar (in diesem rein lesenden Auftrag)

1. **Keine Browser-Messung.** Der Beweis ist statisch plus Motorprobe. Dass im
   echten Online-Match im Browser **nichts** gezeichnet wird, ist streng
   genommen nicht gemessen worden — verboten waren Playwright und der Dev-Server.
   Die Kette ist lückenlos (kein Kanal → kein Feld → weicher Ausstieg), aber die
   End-to-End-Beobachtung mit zwei Browsern (wie beim Kisten-Fund) fehlt.
2. **Kein echter Serverlauf.** Der Server wurde nicht gestartet (bräuchte
   `ws`-Clients). Belegt ist nur: `gameServer.js:85` baut denselben
   `MatchController`, und `:246` reicht alles durch. Die Annahme, dass der
   Serverpfad keine zusätzliche Filterstufe hat, stützt sich auf das Lesen von
   `#broadcastControl` — weitere Aufrufer von `#broadcastControl` wurden nicht
   einzeln auf Filter geprüft.
3. **Draht-Budget nicht berechnet.** Ob ein Günther-Kanal in den 24-Byte-Kopf
   passt oder eine Protokollversion (v7) braucht, ist **nicht** untersucht: beide
   freien Kopfbytes sind an Kisten (`:22`) und Geschütze (`:23`) vergeben.
4. **Payload-Vollständigkeit für einen Online-Zweig nicht geprüft.** Ob
   `guenther_pee`/`guenther_poop_hit` alle Felder mitführen, die ihre HUD-Zeile
   braucht (`playerId`, `amount`), wurde nicht gegen die `melde`-Aufrufe in
   `guentherSystem.js:276`/`:319` feldweise abgeglichen. Das betrifft nur die
   *Stille*, nicht die Unsichtbarkeit.
5. **Wirkung des Fixes auf `tests/event-coverage.test.js` NICHT verifiziert.**
   Die vier Einträge stehen dort mit `zweig: 'lokal'` (`:344–347`). Ein Fix, der
   `online`-Zweige ergänzt, würde diese Zusicherung berühren. Ob der Test dann
   rot wird und wie er mitzuziehen ist, ist **nicht** gemessen (kein
   Testlauf erlaubt).
6. **Häufigkeit über viele Seeds nicht bestimmt.** 4 Seeds wurden gemessen
   (alle mit Auftritten). Die Verteilung (`meanPerMatch`, Poisson) sagt „es gibt
   Spiele ohne Günther" (`guentherSystem.js:99–107`) — wie oft online ein Match
   betroffen ist, ist nicht ausgemessen.

---

## Belegweg (wörtliche Befehle)

### A — Suchweite und Übersicht

```bash
$ cd "/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon"
$ grep -ril 'guenther' src tests scripts docs | sort
```
```
docs/audit-code.md
docs/entwurf-onboarding-sidegrades-counterplay.md
docs/skalierung.md
scripts/check-camera.mjs
scripts/measure-npc.mjs
src/client/debugApi.js
src/client/ereignisse.js
src/client/main.js
src/client/renderer.js
src/engine/match.js
src/engine/stateSnapshot.js
src/engine/systems/guentherSystem.js
src/server/gameServer.js
src/shared/config/guenther.js
src/shared/seed.js
tests/e2e/guenther.spec.mjs
tests/event-coverage.test.js
tests/guenther-skalierung.test.js
tests/guenther.test.js
```

```bash
$ grep -rin 'guenther' src tests | wc -l
```
```
230
```

### B — Motorprobe: läuft Günther? (vollständiges Skript)

```bash
$ node --input-type=module -e '
import { MatchController } from "./src/engine/match.js";
import { encodeSnapshot, decodeSnapshot } from "./src/shared/protocol.js";

console.log("### PROBE 1: Motor laeuft #stepGuenther? Ereignisse + Zustand ueber 4 Seeds");
for (const seed of [4242, 7, 9001, 12]) {
  const match = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: "hills", turnDurationMs: 500 });
  match.start();
  const zaehler = {};
  let aktivTicks = 0, haufenMax = 0, ticks = 0, erste = null;
  while (match.status === "playing" && ticks < 4000) {
    match.step();
    ticks += 1;
    for (const ev of match.consumeEvents()) {
      if (ev.type.startsWith("guenther")) {
        zaehler[ev.type] = (zaehler[ev.type] ?? 0) + 1;
        if (!erste) erste = JSON.stringify(ev);
      }
    }
    const g = match.getState().guenther;
    if (g && g.aktiv) aktivTicks += 1;
    if (g && g.haufen && g.haufen.length > haufenMax) haufenMax = g.haufen.length;
  }
  console.log("seed=" + seed, "status=" + match.status, "runden=" + match.round, "ticks=" + ticks,
    "guenther_aktiv_ticks=" + aktivTicks, "haufen_max=" + haufenMax,
    "events=" + JSON.stringify(zaehler));
  console.log("   Beispielereignis:", erste);
}
```

### C — Drahtprobe: trägt der Snapshot Günther? (vollständiger zweiter Teil)

```bash
const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: "hills", turnDurationMs: 500 });
m.start();
let t = 0;
while (t < 4000) { m.step(); m.consumeEvents(); t += 1; const g = m.getState().guenther; if (g && g.aktiv && g.haufen.length > 0) break; }
const roh = m.getState();
console.log("ticks bis Guenther aktiv MIT Haufen:", t, "| runde:", roh.round);
console.log("getState().guenther =", JSON.stringify({ aktiv: roh.guenther.aktiv, x: roh.guenther.x, y: roh.guenther.y, richtung: roh.guenther.richtung, haufen: roh.guenther.haufen }));
const statuses = roh.statuses ?? {};
const state = { ...roh, entities: roh.entities.map(e => ({ ...e, shield: statuses[e.entityId]?.shield ?? 0, frozenTurns: statuses[e.entityId]?.frozenTurns ?? 0 })) };
const puffer = encodeSnapshot(state, { turnRemainingMs: 1000 });
const zurueck = decodeSnapshot(puffer);
console.log("encodeSnapshot Bytes:", puffer.byteLength, "= HEADER 24 + 4 Spieler x 15 =", 24 + 4 * 15);
console.log("decodeSnapshot() Felder:", Object.keys(zurueck).join(","));
console.log("decodeSnapshot hat guenther? ", Object.prototype.hasOwnProperty.call(zurueck, "guenther"));
```

Der Aufbau des `state` in Teil C ist bewusst der des Servers nachgebaut
(`gameServer.js:548–565` in `broadcastSnapshot`: `...rohZustand` plus
`shield`/`frozenTurns` je Figur), damit der kodierte Puffer wirklich der ist,
der über die Leitung geht.

### D — Wörtliche Einzelbefehle dieses Dokuments

```bash
$ grep -rin 'guenther' src/shared/protocol.js ; echo "(exit $?)"
$ grep -n 'this.onlineViewState : this.match' src/client/main.js
$ grep -n 'guenther' src/client/renderer.js
$ grep -rn 'renderer\.render(' src/client/*.js
$ grep -rn 'GuentherSystem|guentherSystem|GUENTHER_SPAWN|GUENTHER_MOVEMENT' src/client/
$ grep -n 'guenther' tests/event-coverage.test.js
$ sed -n '1,40p' tests/e2e/guenther.spec.mjs
```

### E — Repozustand am Ende

`git status --short` **beim Beginn** der Analyse (Arbeitsbaum von `d2d8495`,
schmutzig durch parallel arbeitende Auftragnehmer):

```bash
$ git status --short
```
```
 M MASTERDOTO.md
 M README.md
 M docs/audit-tief.md
 M docs/betrieb.md
 M docs/entwurf-onboarding-sidegrades-counterplay.md
 M src/client/main.js
 M src/client/roster.js
 M src/engine/match.js
 M src/engine/replay.js
 M src/engine/stateSnapshot.js
 M src/server/gameServer.js
 M src/shared/config/backdrops.js
 M src/shared/config/scenery.js
 M src/shared/terrainGen3.js
 M tests/backdrops.test.js
 M tests/eine-regel-eine-stelle.test.js
 M tests/event-coverage.test.js
 M tests/server-integration.test.js
 M tests/terrain-presets.test.js
 M tools/audit-mcp/README.md
 M tools/audit-mcp/lib/bericht.mjs
 M tools/audit-mcp/lib/gates.mjs
 M tools/audit-mcp/lib/katalog.mjs
 M tools/audit-mcp/lib/statisch.mjs
 M tools/audit-mcp/server.mjs
?? bgworker-todo.json
?? deploy/
?? docs/betrieb-INSTANZ.md
?? scripts/betrieb/
?? src/client/ereignisse.js
?? src/engine/shooting.js
?? src/shared/config/terrain.js
?? tests/replay-uhr.test.js
?? tests/shooting.test.js
?? tests/terrain-material.test.js
?? tools/audit-mcp/probe-doppelregeln.mjs
```

`git status --short` **am Ende** der Analyse — dieselben Änderungen sind
inzwischen committet (`7d4d208`), der Baum ist bis auf dieses Dokument sauber:

```bash
$ git rev-parse --short HEAD
7d4d208
$ git status --short
?? docs/analyse-guenther-online.md
```

**Allein von diesem Auftrag stammt genau eine Datei:
`?? docs/analyse-guenther-online.md`.** Keine Produktivdatei und keine
Testdatei wurde angefasst; es wurde keine Hilfsdatei im Repo hinterlassen (die
Messläufe waren `node --input-type=module -e` ohne Dateiausgabe, `/tmp` wurde
nicht beschrieben).

### F — Nachprüfung aller Fundstellen und Messungen gegen `7d4d208`

Weil HEAD während der Arbeit gewandert ist, wurden die Fundstellen erneut
gelesen und **beide Messläufe wiederholt**:

```bash
$ grep -n '' src/client/networkClient.js | sed -n '396,399p'
```
```
396:      default:
397:        // Simulierte Spielereignisse (turn_start, explosion, terrain_destroyed, ...)
398:        this.#emit('game_event', message);
399:        break;
```

```bash
$ grep -n '' src/engine/match.js | sed -n '3057,3058p'
$ grep -n -e 'PLAYER_STRIDE = 15' -e 'PROJECTILE_STRIDE = 6' -e 'CRATE_STRIDE = 8' -e 'TURRET_STRIDE = 8' -e 'HEADER_SIZE = 24' src/shared/protocol.js
$ grep -n '' src/shared/protocol.js | sed -n '373,375p'
$ grep -n '' src/client/ereignisse.js | sed -n '569,571p'
$ grep -n 'JEDES Engine-Ereignis' tests/event-coverage.test.js
$ grep -n "'guenther_wheel'\|'guenther_pee'\|'guenther_poop'" tests/event-coverage.test.js
$ grep -n '' tests/e2e/guenther.spec.mjs | sed -n '20p'
```
```
3057:      // Günther ebenso als Abzug: Sein Aufbau liegt im GuentherSystem.
3058:      guenther: this.#guenther ? this.#guenther.snapshot() : null,
117:export const PLAYER_STRIDE = 15;
118:export const PROJECTILE_STRIDE = 6;
126:export const CRATE_STRIDE = 8;
134:export const TURRET_STRIDE = 8;
144:export const HEADER_SIZE = 24;
373:   * Kisten stehen NACH den Projektilen — die Reihenfolge muss zu encodeSnapshot
374:   * passen. Sie werden im Zustand ausdrücklich mitgeführt, weil sie sonst online
375:   * unsichtbar wären: `onlineViewState` im Client konnte sie nicht erfinden.
569:export function verarbeiteOnline(kontext, nachricht) {
570:  EREIGNIS_WIRKUNGEN[nachricht.t]?.online?.(kontext, nachricht);
571:}
296: * Der Server schickt JEDES Engine-Ereignis an alle Clients
344:  ['guenther_wheel', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
345:  ['guenther_pee', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
346:  ['guenther_poop', { zweig: 'lokal', offen: GUENTHER_ONLINE_OFFEN }],
20:      api.startMatch({ seed, teams: 2, playersPerTeam: 2, preset: 'hills' });
```

Und die **wiederholte Messung** (identisch zum ersten Lauf — dieselben Zahlen
sind der Beleg, dass die committete Fassung dieselbe ist, die geprüft wurde):

```bash
$ node --input-type=module -e '…'   # Probe 1+2, gegen 7d4d208
```
```
HEAD-Nachprobe seed=4242: ticks=3180 aktiv_ticks=900 haufen_max=5 events={"guenther_poop":5,"guenther_pee":5,"guenther_wheel":2,"guenther_poop_hit":2}
guenther im Zustand: {"aktiv":true,"x":2329.2,"y":824,"haufen":1}
Bytes: 172 | decodeSnapshot kennt guenther? false
```

`ticks=3180`, `aktiv_ticks=900` und die Ereigniszahlen sind **bitgleich** zum
ersten Lauf gegen den Arbeitsbaum von `d2d8495`; ebenso `172 Bytes` und
`decodeSnapshot kennt guenther? false`.

Zusätzlich geprüft, ob sich eine der Belegdateien zwischen `d2d8495` und
`7d4d208` geändert hat:

```bash
$ git diff --stat d2d8495 HEAD -- src/client/main.js src/client/renderer.js src/engine/match.js src/shared/protocol.js src/server/gameServer.js src/engine/stateSnapshot.js src/client/ereignisse.js src/client/networkClient.js tests/event-coverage.test.js
```
```
 src/client/ereignisse.js     |  571 ++++++++++++++++++
 src/client/main.js           |  441 +++-----------
 src/engine/match.js          | 1323 ++++++++++++++++----------------------------
 src/engine/stateSnapshot.js  |  202 ++++++-
 src/server/gameServer.js     |   43 ++
 tests/event-coverage.test.js |  529 ++++++++++++++---
 6 files changed, 1742 insertions(+), 1367 deletions(-)
```

**Einordnung — das ist KEIN Widerspruch.** Diese Unterschiede sind genau die
Änderungen, die beim Beginn **uncommittet im Arbeitsbaum** lagen (siehe
`git status --short` unter E) und die damals schon gelesen wurden. Der Diff
nennt 6 Dateien; **`renderer.js`, `protocol.js` und `networkClient.js` stehen
gar nicht darin** — sie sind zwischen `d2d8495` und `7d4d208` nicht berührt
worden, ihre Zeilenangaben sind also unverändert gültig. Bei `main.js` (441
geänderte Zeilen) sind die gelesenen und zitierten Stellen (`:994`, `:1039`,
`:1053`, `:1119–1152`, `:1987`) durch die Nachprüfung oben Zeile für Zeile
bestätigt.

---

## Was ein Fix berühren müsste (nicht Teil des Auftrags, nur benannt)

Drei Stellen, alle **nötig**, sonst bleibt es halb:

1. `src/shared/protocol.js` — ein Kanal für Günther (Position, Richtung,
   Haufenliste) samt `PROTOCOL_VERSION`-Anhebung; Vorbild sind Kisten (v5) und
   Geschütze (v6).
2. `src/client/main.js:1119–1152` (`onlineViewState`) — das Feld `guenther` aus
   dem Snapshot durchreichen (der Kommentar an Ort und Stelle beschreibt genau
   diese Zwei-Stellen-Kur bereits zweimal).
3. `src/client/ereignisse.js:375–397` — `online`-Zweige für die vier Arten,
   **und** den falschen Kommentar `:373–374` richtigstellen. Berührt
   `tests/event-coverage.test.js:344–347` (steht dort als `zweig: 'lokal'`).

**Gegenprobe für einen Fix** (erst zu fassen, wenn er gebaut wird): Ein Test,
der `decodeSnapshot(encodeSnapshot(stateMitAktivemGuenther))` auf ein
`guenther`-Feld prüft und **ohne** den Fix fällt — sonst belegt er nichts. Und
`GUENTHER_ONLINE_OFFEN` in `tests/event-coverage.test.js:287` ist nach dem Fix
zu streichen bzw. durch eine Zusicherung zu ersetzen.
