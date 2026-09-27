# Hunter: E2E-Lücke geschlossen — Günther online und Online-Sprung/Waffe-Abwerfen

**Datum:** 2026-09-27
**Repo:** `/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon`
**Arbeitsumfang:** nur `tests/e2e/**` und diese Datei. Keine Produktivdatei angefasst.
**Auftrag:** Die zwei Mechaniken im ECHTEN Browser gegen den ECHTEN Server
beobachten, die bisher nur „durch Konstruktion" belegt waren.

---

## Kurzfassung

| Befund | Vorher | Jetzt |
|---|---|---|
| Günther online (Drahtweg v7 + `onlineViewState.guenther`) | fünf E2E-Tests, **alle lokal** (`guenther.spec.mjs` → `api.startMatch`) | **4 Browser-Tests** gegen den echten Server, mit mitgeschnittenen Steuernachrichten |
| Sprung online (`CONTROL.JUMP`) | Unit-Tests gegen einen echten Server, Replay-Rundlauf | **1 Browser-Test**: Befehl → `jumped`-Rahmen → Flughöhe → HUD-Zeile |
| Waffe-Abwerfen online (`CONTROL.DROP_WEAPON`) | dito | **1 Browser-Test**: Befehl → `weapon_dropped`-Rahmen → Kiste im Snapshot → Bestand → HUD-Zeile |
| Server-Autorität über denselben Drahtweg | `tests/anti-cheat.test.js` (Unit-Ebene) | **1 Browser-Test**: fremder Sprung wird abgelehnt, ohne Ereignis |

**Ergebnis: 7 Tests, 7 bestanden** (`npx playwright test tests/e2e/guenther-online.spec.mjs tests/e2e/online-sprung-abwurf.spec.mjs`).
Der Lauf ist unten wörtlich zitiert. Ein voller E2E-Lauf wurde **bewusst nicht**
gefahren (20 Minuten, parallele Worker) — nur die beiden neuen Dateien.

---

## 1. Neue Dateien

| Datei | Inhalt |
|---|---|
| `tests/e2e/guenther-online.spec.mjs` | 4 Tests: Ankunft über die Leitung, Zeichnung (Bildmessung), Streiche als HUD-Meldung, alle Günther-Ereignisarten über die Leitung |
| `tests/e2e/online-sprung-abwurf.spec.mjs` | 3 Tests: Sprung, Abwerfen, Ablehnung eines fremden Sprungs |
| `tests/e2e/helfer/online-match.mjs` | Serverstart, Online-Match + zweiter Mensch, Warten auf den eigenen Zug, HUD-Protokoll-Haken, **Steuernachrichten-Mitschnitt** (`routeWebSocket`) |

Der Helfer ist neu, weil dieselben vier Schritte bisher in jeder Online-Spec neu
standen (`multiplayer.spec.mjs`, `prediction-online.spec.mjs`). `zweiter-mensch.mjs`
blieb **unverändert** — es gibt weiterhin keine Bot-KI, ein zweiter Mensch ist die
Startbedingung des Matches.

## 2. Wie die Beobachtung belegt wird

Drei unabhängige Zeugen je Handlung — dadurch ist kein einzelner Zeuge die ganze
Begründung:

1. **Der Rahmen auf der Leitung.** `page.routeWebSocket('/ws', …)` schneidet die
   Server→Client-Nachrichten mit und reicht sie unverändert durch. Der Rahmen ist
   damit wörtlich belegbar: `{"v":7,"t":"jumped","round":1,"playerId":1,…}`.
2. **Der Zustand der Anzeige.** Beim Sprung die Flughöhe aus den
   SNAPSHOTS (nicht aus den Bildern, siehe Fund 4); beim Abwurf der Bestand und die
   Kiste im Snapshot; bei Günther `aktiv`, Position und Haufenliste.
3. **Die Anzeige selbst.** Jede HUD-Meldung wird im Augenblick der Anzeige
   mitgelesen und geprüft, ob sie in `#log-list` stand (Begründung: Fund 3).

Zusätzlich die Gegenprobe für Günther: online ist `game.match` **`null`** und
`__PA__.guenther()` (der lokale Diagnosezugang) liefert `null`. Was der Test sieht,
kann also nicht aus einem lokalen Motor stammen — es kommt über die Leitung.

## 3. Wörtliche Ausgabe des Beleglaufs

```bash
$ npx playwright test tests/e2e/guenther-online.spec.mjs tests/e2e/online-sprung-abwurf.spec.mjs
```

```
Running 7 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/guenther-online.spec.mjs:83:1 › Günther kommt online über die Leitung — nicht aus einem lokalen Motor (6.8s)
[guenther-online] Bildmessung: {"pixel":3686400,"mitHund":753,"grundrauschen":0,"haufen":0,"x":2159.5,"y":613}
  ✓  2 [chromium] › tests/e2e/guenther-online.spec.mjs:127:1 › Der Renderer zeichnet Günther auch online (7.8s)
  ✓  3 [chromium] › tests/e2e/guenther-online.spec.mjs:216:1 › Günthers Streiche kommen online an und stehen im Protokoll (8.1s)
  ✓  4 [chromium] › tests/e2e/guenther-online.spec.mjs:247:1 › Auch die übrigen Günther-Ereignisse laufen über die Leitung (10.3s)
[sprung] Flugmessung: {"yVorher":808.375,"proben":145,"yTiefst":693.75,"verlauf":"807 815 809 815 807 815 809 806 809 806 810 807 812 807 815 807 815 809 806 810 807 812 807 812 807 815 809 806 809 806 810 806 810 807 812 807 815 809 815 809 806 810 807 812 807 815 809 815 809 815 809 806 810 807 810 807 810 807 810 807 812 807 812 807 815 809 806 810 807 810 807 812 807 815 809 806 810 806 810 807 812 807 815 809 806 809 815 809 815 807 801 766 738 717 703 695 694 700 708 726 750 781 808 809 815 807 815 807 815 809 806 810 806 810 807 812 807 815 809 806 809 815 807 812 807 812 807 812 807 812 807 815 809 815 809 806 810 806 810 807 812 807 812 807 815","takte":539} Versuche: [{"versuch":1,"clientAntwort":{"ok":true,"pending":true},"rahmen":true,"serverfehler":[]}] Rahmen: {"v":7,"t":"jumped","round":1,"playerId":1,"double":false,"impulse":10.12,"jumpsLeft":1}
  ✓  5 [chromium] › tests/e2e/online-sprung-abwurf.spec.mjs:91:1 › Der Sprung geht online als Befehl raus und kommt als Ereignis zurück (15.6s)
[abwurf] Rahmen: {"v":7,"t":"weapon_dropped","round":1,"playerId":1,"weaponId":"pa_041","crateId":4,"x":853,"y":792.4199829101562,"vx":6.887906560229493,"vy":-11.68283326877281,"ammo":6} Waffe: {"weaponId":"pa_041","anzeigePosition":0,"beschriftung":"1. Salvengeber","ammo":6}
  ✓  6 [chromium] › tests/e2e/online-sprung-abwurf.spec.mjs:280:1 › Das Abwerfen geht online über den Server und wird gemeldet (10.1s)
  ✓  7 [chromium] › tests/e2e/online-sprung-abwurf.spec.mjs:368:1 › Ein fremder Sprung wird abgelehnt und erzeugt kein Ereignis (4.3s)

  7 passed (1.3m)
```

Was in den Zahlen steht:

- **Günther wird online gezeichnet.** Von 3 686 400 Bildpunkten (2560×1440)
  unterscheiden sich **753** allein durch `guenther` im Zustand, bei einem
  GRUNDRAUSCHEN von **0** (dieselbe Uhr, derselbe Zustand, zweimal gezeichnet).
  Position des Hundes: (2159,5 | 613) — eine Stelle, die es lokal gar nicht gibt,
  weil der Server den Seed und den Auftrittsplan führt.
- **Der Sprung hebt die Figur um 114,6 px** (808,4 → 693,8), gemessen an 145
  Snapshots über 539 Takte. Offline gegen denselben Motorbau gemessen: 117 px
  (Seed 5, `JUMP_IMPULSE 10,12`). Der Rahmen kam nach **einem** Versuch.
- **Der Abwurf trifft die Waffe, die in der Liste steht:** `pa_041` („1.
  Salvengeber", Anzeigeposition 0, 6 Munition) → dieselbe `weaponId` im Rahmen,
  `crateId 4` erscheint anschließend im übertragenen Snapshot.

## 4. Funde während der Arbeit (nicht repariert — `src/**` gehört nicht zu diesem Auftrag)

### Fund 1: Das Protokoll wird von `landed` überschwemmt

Offline gemessen (`MatchController`, Seed 5, 2×1, 600 Takte **ohne jede Eingabe**):

```
600 Ticks ohne jede Eingabe: {"round_crates":1,"turn_start":1,"landed":172}
```

172 `landed`-Ereignisse in 600 Takten (~17 je Sekunde), obwohl niemand springt
oder fällt. Folge für den Spieler: `P1 ist gelandet` / `P2 ist gelandet` füllen den
Live-Bereich; die Liste führt 40 Zeilen (`hud.js: LOG_LIMIT`), jede wichtige
Meldung fällt nach rund zwei Sekunden heraus. **Belegt** im ersten Lauf dieser
Arbeit: `#log-list` enthielt die Sprungmeldung nicht mehr, obwohl sie angezeigt
worden war. Deshalb liest der Helfer die Zeile im Anzeige-Augenblick mit (`imDom`).

### Fund 2: `isGrounded()` ist online immer `false`

`__PA__.isGrounded()` liest `game.match`; das ist online `null` (`main.js:107`,
`:324`). Die Auskunft lautet also `false`, während die Figur steht. Der Sprung
selbst hat keine Folge daraus (`Main#jump` prüft nur Verbindung und Zug), aber der
Test kann den Bodenkontakt online nicht abfragen — er wartet auf die **ruhende
Höhe** aus zwölf Snapshots (< 8 px Änderung). Der Spec hält den Zustand als
Zusicherung fest, damit die Begründung auffällt, wenn sie überholt ist.

### Fund 3: Ein zu früher Sprung wird still abgewiesen

Beim Matchstart fällt jede Figur ein paar Takte auf den Boden (offline gemessen:
4 Takte), der eigene Zug beginnt aber **sofort**. Der Server lehnt den Sprung dann
mit **`In der Luft ist kein erster Sprung möglich`** ab. Gemessen in vier
Einzelläufen desselben Tests:

```
Lauf 1: Versuche: [{"versuch":1,…,"rahmen":true,"serverfehler":[]}]
Lauf 2: Versuche: [{"versuch":1,…,"rahmen":false,"serverfehler":[["In der Luft ist kein erster Sprung möglich"]]},
                    {"versuch":2,…,"rahmen":true,…}]
Lauf 3: Versuche: [{"versuch":1,…,"rahmen":false,…},{"versuch":2,…,"rahmen":false,…},{"versuch":3,…,"rahmen":true,…}]
Lauf 4: Versuche: [{"versuch":1,…,"rahmen":true,"serverfehler":[]}]
```

Für den Spieler heißt das: Der Sprung fällt aus, ohne Rückmeldung im Live-Bereich
(der Client loggt online bewusst nichts selbst). Der Test drückt deshalb wie ein
Spieler bis zu dreimal — und **berichtet**, wie viele Versuche nötig waren.

### Fund 4: Der Renderer hat eine eigene Uhr

`renderer.js:80` (`this.time = 0`), am Ende von `render` `this.time += 1`
(`:1161`); Wasser, Umgebung, Blitzpuls und Günthers Beine hängen daran
(`Math.sin(this.time * 0.22)`). Drei Aufrufe hintereinander liefern deshalb DREI
verschiedene Bilder: im ersten Lauf standen 2046 unterschiedliche Pixel gegen ein
Grundrauschen von 1562 — der Hund war von der Animation nicht zu trennen. Der Test
hält die Uhr an (`renderer.time = 777` vor jedem Aufruf); `renderer.js` liest
`performance.now` und `Math.random` nirgends (`grep -c`: je 0), das Bild hängt also
wirklich nur an Zustand und Uhr. Ergebnis: Grundrauschen **0**.

### Fund 5: `requestAnimationFrame` eignet sich hier nicht zum Messen

Ein Abtasten je Bild maß 29 Werte in 8 s (~3,6 Bilder/s unter Last) — der Flug fiel
zwischen zwei Proben, der Test meldete „nicht gestiegen". Die Snapshots kommen als
Netzereignisse und werden auch dann zugestellt, wenn kein Bild fertig wird
(20/s). Die Flugbahn wird deshalb über `NetworkClient#on('snapshot', …)`
mitgeschrieben.

## 5. Wie die Seeds gewählt wurden

Online läuft die Simulation in **Echtzeit** (60 Hz des Servers), die Zugzeit
beträgt 30 s, und Günthers Auftrittsplan hängt an der Runde. Ein Günther aus Runde
12 wäre im Test nicht erreichbar. Offline ausgemessen (`node`, derselbe Motorbau
wie der Server, `teams: 2`, `playersPerTeam: 1`, `preset: 'hills'`, `maxRounds: 30`):

```
{"seed":2,"plan":[1,15,17,18],"ersteRundeAktiv":1,"aktivTick":0,"ersterHaufenTick":187}
{"seed":7,"plan":[1,9,25],…}
{"seed":13,"plan":[1,25],…}
```

Gewählt: **Seed 2** für Günther (aktiv ab dem ersten Simulationsschritt, erster
Haufen bei Tick 187 ≈ 3 s) und **Seed 5** für Sprung/Abwurf — dieser Seed hat
`plan: []`, also gar keinen Günther, damit die Meldungen nicht überlagert werden.

## 6. Grenzen dieser Arbeit (ehrlich benannt)

1. **Kein voller E2E-Lauf.** Nur die zwei neuen Dateien wurden gefahren (Vorgabe:
   parallele Worker, 20 Minuten). Die beiden Dateien sind 7× gemeinsam grün
   gelaufen; der Sprung-Test zusätzlich 4× einzeln (0/1/2 Wiederholungen nötig).
2. **Die Prüfung des eigenen Zuges fehlt als Browser-Test.** `Main#jump` weist den
   Befehl ohne eigenen Zug ab, BEVOR etwas gesendet wird — im Test ist der
   Ersteller zuerst am Zug, der Zustand „nicht am Zug" wäre erst nach bis zu 30 s
   erreichbar. Die Server-Autorität deckt stattdessen `tests/anti-cheat.test.js`
   auf Unit-Ebene gegen einen echten Server ab (fremde Figur, unsinnige Richtung,
   dritter Sprung je Zug, fremde Waffe), und der dritte Browser-Test prüft die
   Ablehnung eines fremden Sprungs **auf der Leitung**.
3. **Der clientseitige Doppelklick-Schutz ist nicht geprüft** („zwei Sprünge je
   Zug, der dritte wird abgelehnt") — das ist Motorensache und in
   `tests/anti-cheat.test.js` abgedeckt.
4. **Günther in einer Partie OHNE Auftritt** ist kein Testgegenstand: Der Plan ist
   seeded, „es gibt Spiele ohne Günther" (`guentherSystem.js`). Geprüft ist, dass
   er im Browser erscheint, wenn der Plan ihn führt.
5. **Kein GPU-Bezug.** Die bekannten roten `prediction-gpu`-Tests bleiben außen
   vor — sie messen den Rechenweg, nicht diese Mechaniken.

## 7. Nachvollziehen

```bash
cd "/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon"
npx playwright test tests/e2e/guenther-online.spec.mjs tests/e2e/online-sprung-abwurf.spec.mjs
npx eslint tests/e2e/guenther-online.spec.mjs tests/e2e/online-sprung-abwurf.spec.mjs tests/e2e/helfer/online-match.mjs
```

Die Ports sind fest und kollisionsfrei gewählt: **3228** (Günther), **3229**
(Sprung/Abwurf) — die vorhandenen Online-Specs nutzen 3210, 3211 und 3217.
