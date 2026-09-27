# Spielgefühl-Fixes — drei belegte Befunde (2026-09-27)

Dieser Zug behebt drei vom Auftraggeber im Code nachgeprüfte Befunde. Oberstes
Ziel war **Spielspaß und Flow**: Was das Spiel verspricht, muss es auch tun —
und der Spieler muss es SEHEN.

Alle Messungen dieses Dokuments stammen aus Sonden mit **echtem Motor, echtem
Hud und echtem Browser** (Chrome, Playwright). Die Sonden liegen NICHT im Repo
(sie ändern nichts), ihre Aufrufe stehen bei der jeweiligen Messung.

| Befund | Kern | VOR → NACH (gemessen) |
| --- | --- | --- |
| 1 | Aufladen war eine Attrappe | Tippen 33 / Halten 100 → Ladeanzeige sichtbar, HUD folgt |
| 2 | Klangebene online weg | 0 Klangaufrufe im Online-Zweig → Schuss, Explosion, Treffer |
| 3 | Ablehnungsbegründung unsichtbar | 0 sichtbare Zeilen (40 Figuren) → 11 sichtbare Zeilen |

---

## Befund 1 — Das Aufladen war eine Attrappe

### VOR (belegt)

`src/client/input.js` löschte den Ladezustand VOR dem Feuern:

```js
#releaseCharge() {
  this.#charging = false;
  this.#handlers.onFire?.();
}
```

und `src/client/main.js` las danach `isCharging`:

```js
const charging = this.input.isCharging;
const power = charging
  ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70)))
  : this.aim.power;
```

`get chargeRatio` liefert nach dem Löschen `0`, `isCharging` immer `false` —
der Ladezweig war **toter Code**, jede Kugel flog mit `this.aim.power`. Es gab
außerdem keine Anzeige (`chargeRatio` hatte keinen Leser), und der E2E-Test
prüfte nur `tick > 0`: Es passierte etwas, nur nicht das Versprochene.

### NACH (geändert)

| Stelle | Änderung |
| --- | --- |
| `src/client/input.js:13,16` | `MIN_KRAFT = 30`, `MAX_KRAFT = 100` |
| `src/client/input.js:47` | `kraftAusLadung(anteil)` — reine Funktion, ohne DOM prüfbar |
| `src/client/input.js:239-241` | ERST die Kraft lesen, DANN laden beenden, DANN feuern (`onFire(kraft)`) |
| `src/client/main.js:19` | Import von `kraftAusLadung`, `MIN_KRAFT`, `MAX_KRAFT` |
| `src/client/main.js:1493` | `fire(geladen = null)` — die übergebene Kraft gilt, sonst `aim.power` |
| `src/client/main.js:2188-2190` | Ladefortschritt aus dem Eingabe-Controller lesen |
| `src/client/main.js:2236,2243` | **HUD-Kraftwert und Zielhilfe folgen dem Aufladen** (dieselbe Zahl, mit der geschossen wird) |
| `src/client/renderer.js:411` | `#drawLadeanzeige(ladeAnteil)` — schmaler Balken in der Bildmitte |
| `src/client/renderer.js:1205,1290` | `ladeAnteil` als Render-Option, gezeichnet ÜBER dem Geschehen |

Der Balken nutzt die vorhandene Farbsprache (Zielhilfe-Orange
`rgba(244, 162, 97, …)`, Grund `rgba(13, 27, 42, …)`) und steht in der
**Bildmitte**: Der untere Rand ist seit Befund 3 vom Protokoll belegt, und
online gibt es keine Zielhilfe, an der ein Ring sitzen könnte.

### Messung (Sonde: `node /tmp/pa-probe/probe-laden.mjs`)

```
Tippen (Leertaste sofort los)          : 33 Kraft
Halten  (1,4 s)                        : 100 Kraft
während des Haltens:  300 ms → 0,263 Anteil, HUD zeigt 30
                      500 ms → 0,483 Anteil, HUD zeigt 48
                     1400 ms → 1,000 Anteil, HUD zeigt 100
```

Die Zahl steht im SICHTBAREN Protokoll (`Schuss abgegeben (N Kraft)`) — genau
die Zahl, die der Spieler liest.

### Test

`tests/e2e/prediction-gpu.spec.mjs:193` — „HALTEN lädt auf: es ergibt mehr Kraft
als ein Tippen": misst einen getippten und einen gehaltenen Schuss im Protokoll,
verlangt `halten > tippen`, `tippen < 60`, `halten >= 90` und dass der
Ladefortschritt beim Halten über 0,4 steigt.

Warum die Tasten dort IM SEITENKONTEXT gesendet werden (echte `KeyboardEvent`s,
dieselben `window`-Listener): über das Playwright-Protokoll gedrückt dauerte ein
„Tipp" gemessen **~650 ms** (der Seitenprozess backt direkt nach dem Matchstart
das Gelände), und `Schuss abgegeben (68 Kraft)` ist kein Tipp mehr. Dass auch die
echte Playwright-Tastatur feuert, hält der Test darüber fest
(`prediction-gpu.spec.mjs:181`).

Und ein „Tipp" muss auch ein Tipp bleiben: Der Test MISST die Dauer des Tipps
(`performance.now()` um die beiden Versendungen — dieselbe Uhr wie der
Ladefortschritt). Gemessen unter Last: **514 ms** für einen „Tipp", was
`Schuss abgegeben (60 Kraft)` ergibt. Deshalb gilt ein Durchgang nur, wenn der
Tipp unter 150 ms blieb, sonst wird der ganze Durchgang wiederholt (bis zu fünf
Versuche, Fehlermeldung nennt die gemessenen Dauern). Die Zusicherung selbst
bleibt streng — vor und nach der Wiederholung.

### Replay-Grenze

`npm run replay -- play artifacts/replay-20260910.json --verify` liefert VOR und
NACH **denselben Zustandshash `9ec63e8c`** (Status gameover, Runde 13, Tick
2440). Das ist erwartet und kein Zufall: Eine Aufzeichnung zeichnet **Eingaben**
auf (`angle`, `power`), nicht Ladezustand; beim Abspielen wendet der
`ReplayPlayer` sie direkt auf den Motor an (`src/engine/replay.js`), und
`Main#fire` ist im Replay gesperrt. Der Client-Pfad, den dieser Befund ändert,
liegt außerhalb des Simulationspfads.
**Eine Aufzeichnung enthält keine Ladeinformation — der Hash musste sich deshalb
nicht ändern, und er hat sich nicht geändert.**

---

## Befund 2 — Online war die Klangebene weg

### VOR (belegt)

Alle vier Klangaufrufe des Clients standen in den NUR-LOKALEN Zweigen
(`src/client/ereignisse.js`, vorher `:216` explosion, `:236` hitscan/Schuss,
`:245` hitscan/Treffer, `:293` shot). Die Online-Zweige machten nur
`shotPredictor.resolve()` — **0 Klangaufrufe**. Der Mischer wurde online
übergeben (`main.js#ereignisKontext`, `sound: this.sound`) und nie gerufen. Im
Code stand das als Entscheidung („und KEIN Klang") — eine Entscheidung war es
nie, es war vergessen.

### NACH (geändert) — Prüfung JE Wirkung

| Wirkung | online gehört? | Begründung / Klangflut? |
| --- | --- | --- |
| Schuss (`shot`, `hitscan`) | **ja** (`ereignisse.js:293,332`) | einmal je Schuss (`shooting.js:201,238`) — kein Dauerläuten |
| Explosion (`explosion`) | **ja** (`ereignisse.js:237`) | einmal je detonierendem Geschoss (`projectileSystem.js:447`) |
| Treffer (`damage`-Klang) | **ja, aber nur bei echtem Treffer** (`ereignisse.js:295`, Bedingung `n.hit && n.target`) | hängt am TREFFER des Schusses, NICHT am `damage`-Ereignis |

Die Klangflut-Frage ist damit beantwortet, und zwar an der Quelle: `damage`
meldet im großen Match **jeden Takt** (gemessen 15092 Ereignisse in 30 s bei 40
Figuren, `flooded`) und ist deshalb gedrosselt — an dieses Ereignis ist KEIN
Klang gehängt. Gemessen am echten Replay durch den Sendefilter des Servers
(Sonde: `node /tmp/pa-probe/flood.mjs`):

```
38 Schüsse über 2440 Takte (40,7 s)
explosion 36 · hitscan 1 · shot 37  →  74 Klang-Anlässe  =  1,82 je Sekunde
zum Vergleich: damage 27 (gedrosselt), drowning 0
```

### Tests — zwei Belege, eine Attrappe wie im Browser

**1. Zweig-Test (ohne Browser)** — `tests/event-coverage.test.js:447` — „Die
Klangebene gilt ONLINE genauso wie lokal — Schuss, Explosion, Treffer": ruft
BEIDE Einstiege (`verarbeiteLokal`/`verarbeiteOnline`) mit einem aufzeichnenden
Mischer (Attrappe) und verlangt Gleichheit:

```
lokal  = [explosion, shot, shot, shot, damage]
online = [explosion, shot, shot, shot, damage]   ← vorher leer
```

**2. E2E im echten Online-Match (mit Server)** —
`tests/e2e/prediction-online.spec.mjs:282` — „Online wird der Klang GERUFEN":
Der Client feuert nur `sendInput`; gemessen wird der Zuwachs der Zähler des
**echten** `SoundMixer` (`gezaehlt`) NACH dem Serverereignis. Vorher blieb der
Zähler stehen. Damit ist die Lücke geschlossen, dass keine einzige
E2E-Spezifikation den Klang je berührte.

Gegenprobe (Zähne): Mit entferntem Online-Klangaufruf im `shot`-Zweig fällt der
E2E (gemessen):

```
✘ Online wird der Klang GERUFEN … (13.0s)
  Error: Der Schuss-Klang muss online gerufen werden (vorher 0, jetzt 0)
```

### Replay-Grenze

Zustandshash unverändert `9ec63e8c`: Die Änderung liegt im Client-Anzeigepfad;
der Motor und seine Ereignisse bleiben unberührt.

### Bewusst NICHT mit erledigt

Das **Mündungsfeuer** fehlt online ebenfalls (der Befund nennt es). Dieser Zug
zieht nur die Klangebene nach; ein Mündungsfeuer im `shot`-Online-Zweig ist eine
Darstellungsänderung mit eigener Prüfung (Position der Figur im Snapshot) und
steht hier offen benannt, statt halb mitgemacht zu werden.

---

## Befund 3 — Die Ablehnungsbegründung war unsichtbar

### VOR (belegt, gemessen)

Die Lehre des Auftrags („Zugehörigkeit ist nicht Sichtbarkeit") ist an der
Messung noch schärfer als angenommen: Nicht die 108 px waren das Problem.

| Lage | `#hud-log` | Sichtbare Zeilen |
| --- | --- | --- |
| 4 Figuren, 30 Füllzeilen | Höhe 108 px, auf der Fläche | **6** |
| 40 Figuren (`flooded`) | Höhe 33 px, `top = 2221 px` — Fläche endet bei 855 px | **0** |

Ursache: `#hud-log` hing in **Zeile 3** des HUD-Rasters, und Zeile 2 ist `1fr`
und wächst mit ihrem Inhalt. Bei 40 Figuren ist die Spielerliste 2092 px hoch →
das Protokoll rutschte vollständig UNTER die Spielfläche. Die `notice`-Meldung
war dort **nie** sichtbar; im Modell hielt sie sich 4,58 s, verdrängt von einer
Welle aus 26 `death`-Meldungen gegen `VORRANG_LIMIT` (20).

### NACH (geändert)

`index.html:278` — das Protokoll hängt nicht mehr im Raster, sondern am unteren
Rand der Spielfläche, und seine Höhe wächst mit dem Fenster:

```css
#hud-log {
  position: absolute; left: 12px; right: 12px; bottom: 12px;
  max-height: clamp(108px, 22vh, 340px);
  overflow: hidden;
}
```

| Lage | `#hud-log` | Sichtbare Zeilen | `notice` unter der Sichtkante |
| --- | --- | --- | --- |
| 4 Figuren, 30 Füllzeilen | Höhe 198 px | **11** (vorher 6) | — |
| 40 Figuren (`flooded`) | auf der Fläche (top 645 px) | **11** (vorher 0) | **3,68 s** (vorher: nie sichtbar) |

Und die Auflösungsserie (je 4 Figuren, 30 Füllzeilen — gemessen, nicht gerechnet):

| Auflösung | VOR sichtbar | NACH sichtbar | `#hud-log` NACH |
| --- | --- | --- | --- |
| 1280×720 (E2E-Vorgabe) | 6 | **9** | 158 px |
| 1920×1080 (Full-HD) | 6 | **13** | 238 px |
| 2560×1440 | 6 | **18** | 317 px |
| 3840×2160 (4K) | 6 | **19** | 340 px |

VOR ist die Zeilenzahl in jeder Auflösung dieselbe (6, feste 108 px) — die Fläche
hing am Raster, nicht am Fenster.

Sonde (deterministisch, `autoLoop` aus, echter `game.step()`):
`node /tmp/pa-probe/probe-vor-nach.mjs` — „VOR" wird durch Injizieren der alten
Regel in dieselbe Seite erreicht, damit beide Läufe dieselbe Szene messen;
Auflösung über `PROBE_BREITE`/`PROBE_HOEHE`, Figuren über `PROBE_TEAMS`/`PROBE_UNITS`.

### Warum (a) und nicht (b) — die Verwerfung

Gewählt: **(a) die Fläche wächst** (Fensterabhängig, Full-HD bis 4K haben Platz).

Verworfen: **(b) die Todesmeldungen zusammenfassen.** Drei Gründe, jeder aus der
Messung bzw. dem Code:

1. **(b) behebt die gemessene Ursache nicht.** Bei 40 Figuren war die Fläche
   NICHT zu klein, sondern **außerhalb** der Spielfläche (0 sichtbare Zeilen,
   `top 2221 px` gegen `stageBottom 855 px`). Meldungen zusammenzufassen hilft
   einer Fläche nicht, die man nicht sieht.
2. **(b) kostet Information.** Lokal lautet die Todesmeldung
   „`<Name>` ausgeschaltet" — die Texte sind VERSCHIEDEN, die vorhandene
   Text-Zusammenfassung des HUD greift dort also gar nicht; ein absichtliches
   Zusammenfassen würde verschweigen, WELCHE Figur gefallen ist. (Online ist der
   Text einheitlich, aber lokal ist der Standardfall.)
3. **Der laute Teil ist nicht nur `death`.** Die Übergänge „X ertrinkt" kommen
   ebenfalls als `danger` und fluten das Vorrangbudget (bei 40 Figuren 40
   Meldungen beim Untergehen). (b) müsste dieselbe Ersetzung an mehreren
   Stellen einführen.

Die Entscheidung ist damit an der WIRKUNG geprüft: Nach (a) ist eine
Vorrangmeldung sichtbar, solange sie im Modell steht.

### Test (mit Zähnen)

`tests/e2e/grosse-teams.spec.mjs:96` — „Das Protokoll bleibt bei 30 Figuren AUF
der Spielfläche — und zeigt mehr als eine Zeile": prüft die GEOMETRIE
(Kasten innerhalb `#stage`) und die Zahl der GANZ sichtbaren Zeilen (≥ 8 nach 30
Füllzeilen). Gegenprobe: mit der alten Regel fällt der Test (gemessen):

```
✘ Das Protokoll liegt NICHT auf der Spielfläche: top 1656 px, Fläche endet bei 720 px
```

Ersetzt wurde an dieser Stelle `expect(page.locator('#hud-log')).toBeVisible()` —
das fragt nur nach einer nicht-leeren Box und hat den Fehler nie bemerkt.

### Replay-Grenze

Zustandshash unverändert `9ec63e8c`: reine CSS-Änderung.

### Grenzen dieser Behebung

- **Das Vorrangbudget des Modells bleibt bei 20** (`VORRANG_LIMIT`, `hud.js`).
  In der gemessenen Worst-Case-Welle (26 Todesmeldungen in wenigen Sekunden) ist
  die Meldung damit 4,58 s lang überhaupt vorhanden und 3,68 s davon sichtbar.
  Wer mehr will, muss das Budget oder die Zusammenfassung anfassen — beides
  liegt außerhalb dieses Auftrags und ist oben als (b) begründet verworfen.
- **Die Spielerliste selbst läuft bei 40 Figuren weiter aus der Fläche**
  (Zeile 2 wächst über die Spielfläche hinaus). Das ist ein eigener Befund
  (nicht Teil dieses Auftrags) und war VOR wie NACH so; die Wirkung auf das
  Protokoll ist mit der neuen Anheftung beseitigt.

---

## Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| `npm run replay -- play artifacts/replay-20260910.json --verify` VOR | Zustandshash `9ec63e8c`, „Replay ist exakt reproduzierbar." |
| … NACH | Zustandshash `9ec63e8c`, „Replay ist exakt reproduzierbar." — unverändert, Begründung je Befund oben |
| `npm run lint` | Exit 0, keine Meldung |
| `npm run check:docs` | „Geprüfte Behauptungen: alle richtig" |
| `node --test tests/event-coverage.test.js tests/sound-mixer.test.js tests/hud-vorrang.test.js tests/ereignis-kontext.test.js` | 47/47 grün |
| `node --test tests/no-dead-code.test.js tests/source-boundaries.test.js tests/eine-regel-eine-stelle.test.js tests/ohne-kommentare.test.js tests/system-priority.test.js tests/dom.test.js tests/weapon-animation.test.js tests/effects.test.js` | 64/64 grün |
| `npx playwright test tests/e2e/prediction-gpu.spec.mjs` (ganze Datei) | 9/9 grün, darunter „HALTEN lädt auf …" |
| `npx playwright test tests/e2e/prediction-gpu.spec.mjs -g „HALTEN"` | 4× grün (Stabilität nach der Tipp-Dauer-Prüfung) |
| `npx playwright test tests/e2e/grosse-teams.spec.mjs -g „Protokoll"` | 1/1 grün |
| `npx playwright test tests/e2e/accessibility.spec.mjs tests/e2e/grosse-teams.spec.mjs` | 17/17 grün |
| `npx playwright test tests/e2e/prediction-online.spec.mjs -g „Klang"` | 1/1 grün (echter Server, echter Mischer) |
| `npx playwright test tests/e2e/screenreader.spec.mjs` | 11/11 grün (Live-Region unversehrt) |

`npm test` und `npm run test:e2e` wurden NICHT als Volllauf gefahren (Auftrag:
lastempfindlich, parallel schreibende Arbeiter).

---

## Was ich NICHT geprüft habe (offen benannt)

1. **Kein Volllauf der Suiten.** Die Testzahl in `README.md`/`MASTERDOTO.md`
   (**1122**) ist durch die hier ergänzten Tests nicht mehr die echte Summe. Sie
   konnte nicht nachgemessen werden (Volllauf verboten) und wurde deshalb NICHT
   angefasst: `check:docs` vergleicht nur, dass beide Dokumente dieselbe Zahl
   nennen — das tun sie weiterhin. Ein späterer Volllauf muss die Zahl
   nachziehen. (Die Zahl der E2E-SPEZIFIKATIONEN bleibt bei 30: die neuen Tests
   stehen in vorhandenen Dateien, keine neue Datei.)
2. **Der Klang ist nicht GEHÖRT worden.** Es gibt in dieser Umgebung kein
   Audio-Ausgabegerät am Ohr. Belegt ist, dass der echte Mischer den Schuss aus
   dem Serverereignis zählt (E2E) und wie oft Klang entstehen kann (Sonde) —
   nicht, wie es klingt.
3. **Der Nachweis für den GEGNER fehlt.** Der Online-E2E misst den Zähler des
   GREIFENDEN Clients (der Server bestätigt den eigenen Schuss). Der zweite
   Mensch ist im Test ein roher Socket, kein Browser — dass AUCH das Gegenüber
   den Schuss hört, ist damit nicht gemessen, sondern nur dieselbe Codebahn
   (`verarbeiteOnline` läuft bei jedem Client).
4. **Der Ladebalken ist nicht bildlich geprüft.** Kein Bildvergleich. Geprüft
   ist die Größe, die ihn speist (`chargeRatio` beim Halten > 0,4), die Zahl im
   HUD und der Kraftwert im Protokoll. Dass der Balken bei `ladeAnteil = 0`
   nichts zeichnet und bei 1 voll ist, folgt aus dem Code (eine einzige
   Aufrufstelle) — nicht aus Pixeln.
5. **Das Mündungsfeuer online fehlt weiterhin** (siehe Befund 2, „Bewusst NICHT
   mit erledigt").
6. **Der Mahlstrom ist NICHT angefasst.** Die Lücke, dass `maelstrom` in keiner
   E2E-Spezifikation vorkommt, ist ein eigener Befund (7 Runden unsichtbar) und
   liegt außerhalb dieses Auftrags (er berührt Motor und Renderer-Zustand, nicht
   die vier Klangstellen).
7. **Der E2E-Lauf ist während dieses Zuges durch einen parallel schreibenden
   Arbeiter gestört worden**: Der Dev-Server lädt die Seite bei jeder
   Quelländerung neu (`[vite] page reload`), mitten in einem Test wurde dadurch
   der Ausführungs-Kontext zerstört (der Ladetest wiederholt den Durchgang
   deshalb selbst). In einem Lauf war außerdem der WebGPU-Test aus
   `prediction-gpu.spec.mjs` rot (`expect(pfad.path).toBe('cpu')`), ohne dass
   Gelände- oder GPU-Code berührt wurde; im Lauf danach war dieselbe Datei 9/9
   grün. Das ist Umgebungsrauschen, kein Befund dieses Zuges.
8. **Die Sonden liegen in `/tmp/pa-probe/`**, nicht im Repo. Sie sind damit
   nicht versioniert; die Aufrufe stehen oben, die Ergebnisse hier.
