# Die Fallschaden-Bremse: der Sprung bleibt unbegrenzt, der Aufprall bremst

**Stand: 2026-09-27.** Diese Datei hält EINE Entscheidung fest, die Messung, auf
der sie steht, den Verdacht, der sich als falsch erwies, und die Zahlen für jeden
der vier Fälle, an denen abgenommen wird.

## 0. Kurzfassung

| Frage | Antwort |
| --- | --- |
| Gibt es einen Deckel auf der Fallgeschwindigkeit? | **Nein.** Gemessen: das Aufpralltempo folgt `√(2·g·h)` von 4,20 bis 24,36 px/Takt. |
| Warum kam dann nach einem tiefen Sturz kein Schaden? | Die **Landung** wurde verpasst: Die Kollisionsprüfung tastete nur den Endpunkt des Schritts ab und sprang über die Geländekruste. „Nicht gelandet" hieß: kein Schaden, `vy` wuchs unbegrenzt weiter (gemessen 201,48). |
| Was ist gebaut? | Die Landung tastet den **Fallweg** ab (`characterSystem.js#ersteSolideZeile`), und **jeder Luft-Sprung** erhöht das Aufpralltempo um 3 px/Takt (`config/fallschaden.js`). |
| Was kostet es? | Ein einzelner Sprung **0**. Ein Luft-Sprung 10,79. Drei 33,23. Neun 86,69–92,23 bei 96 Leben. Dauerfeuer im Sprung ist tödlich. |
| Und die Geländekante ohne Sprung? | **Unverändert**: 40 px und 117 px Sturz kosten 0 wie zuvor (der Zuschlag hängt am Luft-Sprung). |
| Altreplay `artifacts/replay-20260910.json` | Zustandshash **vorher 9ec63e8c, nachher 9ec63e8c** — 2440 von 2440 Takten identisch, `VERIFY: Replay ist exakt reproduzierbar.` |

Die Regel selbst steht in `src/shared/config/fallschaden.js` (drei Zahlen),
die Durchsetzung in `src/engine/systems/characterSystem.js`, das Auslösen in
`src/engine/match.js#jump`.

## 1. Die Entscheidung des Auftraggebers

Wörtlich:

> „sprung unbegrenzt, fallschaden bremst den character (somit kein freier flug)"

Damit war eine Änderung an der **Simulation** ausdrücklich erlaubt — mit der
Auflage dieses Projekts, die Folge für das Altreplay zu **belegen** statt zu
behaupten. Der Beleg steht in Abschnitt 8.

## 2. Der Verdacht: ein Deckel auf der Fallgeschwindigkeit — WIDERLEGT

Der Auftrag vermutete eine terminale Fallgeschwindigkeit, weil das Aufpralltempo
nach 633 px Sturz nicht über die Schwelle stieg. Gemessen ist das Gegenteil: Es
gibt **keinen Deckel**. Ein Sturz OHNE Sprung, in einer freien Spalte, in der
das Gelände nicht dazwischenkommt — Seed 4242, 606 und 2025 ergeben **identische**
Werte:

| Fallhöhe | Aufpralltempo gemessen | `√(2·0,42·h)` | Fallschaden |
| ---: | ---: | ---: | ---: |
| 20 px | 4,20 | 4,10 | 0,00 |
| 40 px | 5,88 | 5,80 | 0,00 |
| 80 px | 8,40 | 8,20 | 0,00 |
| 117 px | 10,08 | 9,91 | 0,00 |
| 200 px | 13,02 | 12,96 | **4,44** |
| 300 px | 15,96 | 15,87 | **10,91** |
| 400 px | 18,48 | 18,33 | **16,46** |
| 500 px | 20,58 | 20,49 | **21,08** |
| 600 px | 22,26 | 22,45 | **24,77** |
| 700 px | 24,36 | 24,25 | **29,39** |

Das Tempo wächst monoton mit der Höhe und deckt sich mit der Physik. Ein Deckel
hätte hier eine Waagerechte ergeben; es gibt keine. Der zweite Teil des Verdachts
(„der Aufprall steigt nicht mit der Fallhöhe") war also ein **Messartefakt** —
und zwar ein erklärbares: der Vorzustand hat den Sturz oft gar nicht bis zur
Landung kommen lassen (Abschnitt 3).

## 3. Die eigentliche Ursache: die Landung wurde verpasst

`characterSystem.js` prüfte den Aufprall mit einer **Punktprobe** auf den
Schrittendpunkt:

```
isSolid(nextX, nextY)  UND  NICHT isSolid(nextX, nextY − 11)   → gelandet
```

Die zweite Bedingung heißt „über dem Aufsetzpunkt ist Luft" (die Figur kommt von
oben). Fällt eine Figur je Takt weiter, als die Geländekruste dick ist, liegt
`nextY` **tief im Festkörper** — dann ist auch `nextY − 11` fest, der Motor las
„nicht gelandet", ließ `resolvedY = y` stehen (die Figur bewegte sich nicht mehr)
und `vy` wuchs weiter. Genau dort entsteht kein Fallschaden.

Gemessen mit einem **gesetzten** Sinktempo auf einer stehenden Figur (kein
Geländezufall, Seed 4242/606/2025, alle drei identisch):

| gesetztes `vy` | Fallschaden (Vorzustand) | Endzustand (Vorzustand) | Fallschaden (jetzt) |
| ---: | ---: | --- | ---: |
| 12 px/Takt | 3,12 | landet auf der Oberfläche | 3,12 |
| 20 px/Takt | **0,00** | bleibt bei `y = Start`, `vy` wächst auf **22,52** | **20,72** |
| 60 px/Takt | **0,00** | bleibt bei `y = Start`, `vy` wächst auf **62,52** | **108,72** (tödlich) |

Dieselbe Erscheinung im Sprungdauerfeuer: Der Sprungimpuls des Vorzustands setzte
`vy` neu, die Landung wurde verpasst, und am Ende stand `vy = 201,48` bei
**0,00 Fallschaden** (Seed 4242/606/2025, 10 Luft-Sprünge bzw. 200 Sprünge in 200
Takten).

Dass das **Projektil**-System dieses Problem nicht hat, steht im Baum schon
aufgeschrieben: `src/shared/ballistics.js#simulateFlight` beschreibt beide
Betriebsarten (`exact: true` = „pixeltreu abtasten (wie der Motor)" und
`exact: false` = „prüft nur das Schrittende — billiger, aber es kann eine dünne
Wand übersehen"). Die Projektile nehmen `raycastSegment`; der Charakter nahm die
billige Variante. Die Behebung ist deshalb keine neue Erfindung, sondern
dieselbe Bauart wie beim Projektil: **die erste feste Zeile auf dem Fallweg
zählt** (`#ersteSolideZeile`).

Nebenbefund, der zur Zusage dieses Projekts gehört: Die Körpermaße standen in
`characterSystem.js` ein ZWEITES Mal (`const HALF_WIDTH = 7; const HALF_HEIGHT =
10;`) neben `src/shared/config/player.js`. Wertgleich, deshalb unauffällig — aber
die Landung rastet auf `Oberfläche − PLAYER_HALF_HEIGHT` ein und `isGrounded`
prüft dieselbe Grenze. Die zweite Kopie ist entfernt; beide lesen jetzt
`config/player.js`.

## 4. Die Wahl: (a), (b) oder (c)

**(b) Deckel der Fallgeschwindigkeit anheben — unmöglich.** Es gibt keinen
Deckel (Abschnitt 2). Ein „Anheben" hätte nichts zu heben; die vorgeschlagene
Behebung ruht auf einer Voraussetzung, die die Messung nicht hergibt. Der Weg
wäre nur gewesen, einen Deckel erst EINZUBAUEN — dann wächst der Aufprall aber
nicht mit der Höhe, sondern wird künstlich begrenzt, also genau das Gegenteil.

**(a) Schwelle senken (11 → unter 9,62) — verworfen.** Gemessen landet ein
einzelner Sprung bei **10,04 px/Takt** (Impuls 9,70, Rückweg unter Schwerkraft)
und die Schwelle liegt bei 11: der Abstand ist **0,96 px/Takt**. Eine Schwelle
darunter bestraft jeden einzelnen Sprung — das Zielbild verlangt das Gegenteil
(„Ein einzelner Sprung auf flachem Boden: kein oder kaum Schaden"). Zweitens
trifft sie JEDEN Sturz: 117 px Geländekante kosten heute 0 (Aufprall 10,08) und
würden mit einer Schwelle unter 10,08 sofort Leben kosten. Der Test
`tests/fallschaden-bremse.test.js` hält beide Seiten fest (Sprung unter der
Schwelle, Kante ohne Schaden).

**(c) Zuschlag JE LUFT-SPRUNG — gewählt.** Der Luft-Sprung ist das eigentliche
Problem, nicht der Sprung: `match.js#jump` **setzt** `vy = −Impuls`, statt zu
addieren, und schenkt der Figur damit Höhe, die sie nicht hat. Diese geborgte
Höhe wird jetzt beim Aufprall abgerechnet — je angenommenem Luft-Sprung
`+3 px/Takt` auf das Aufpralltempo. Warum das die saubere Lösung ist:

- Sie wirkt auf die **Zahl** der Sprünge, nicht auf den Sturz. Ein Sprung vom
  Boden und jede Geländekante bleiben unberührt (gemessen: 0 Schaden).
- Sie ist **deterministisch**: kein Zufallswert, keine Änderung an der
  Tick-Reihenfolge. Der Motor meldet nur „hier wurde ein Luft-Sprung angesetzt"
  (`meldeLuftsprung`), das System rechnet die Folge.
- Sie ist **eine Regel an einer Stelle**: die drei Zahlen stehen in
  `config/fallschaden.js`, die Formel in `characterSystem.js`, der Anlass in
  `match.js`.
- Sie ist **skalierbar ohne Umbau**: Wer die Bremse härter oder weicher will,
  ändert eine Zahl (`luftsprungZuschlag`), nicht eine Mechanik.

## 5. Die Vier-Fälle-Tabelle, VORHER und NACHHER (fünf Seeds)

Sonde: echter `MatchController`, Preset `hills`, `turnDurationMs` 1 000 000 000
(ein Zug endet nie), `playersPerTeam` 1; „Luft-Sprünge" werden je am Gipfel
angesetzt (das ist das günstigste Muster für den Spieler), danach 400 Takte
Beobachtung. Sprungangaben: `Bodensprung + n Luft-Sprünge`.

| Fall | Seed | Aufprall vorher | Schaden vorher | Aufprall nachher | Schaden nachher | Leben nachher |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **1. Ein Sprung, flacher Boden** | 4242 | 9,62 | 0,00 | 9,62 | **0,00** | 96,0/96 |
| | 606 | 9,62 | 0,00 | 9,62 | **0,00** | 96,0/96 |
| | 2025 | 9,62 | 0,00 | 9,62 | **0,00** | 96,0/96 |
| | 777 | 9,62 | 0,00 | 9,62 | **0,00** | 96,0/96 |
| | 1414 | 9,62 | 0,00 | 9,62 | **0,00** | 96,0/96 |
| **2. +2 Luft-Sprünge** | 4242 | 14,58 | 8,81 | 14,58 | **22,01** | 74,0/96 |
| | 606 | 14,58 | 8,81 | 14,58 | **22,01** | 74,0/96 |
| | 2025 | 14,58 | 8,81 | 14,58 | **22,01** | 74,0/96 |
| | 777 | 14,58 | 8,81 | 14,58 | **22,01** | 74,0/96 |
| | 1414 | 14,58 | 8,81 | 14,58 | **22,01** | 74,0/96 |
| **3. +3 Luft-Sprünge** | 4242 | **159,48** | **0,00** (im Gelände eingefroren) | 16,68 | **33,23** | 62,8/96 |
| | 606 | **159,48** | **0,00** (eingefroren) | 16,68 | **33,23** | 62,8/96 |
| | 2025 | **159,48** | **0,00** (eingefroren) | 16,68 | **33,23** | 62,8/96 |
| | 777 | **159,48** | **0,00** (eingefroren) | 16,68 | **33,23** | 62,8/96 |
| | 1414 | **159,48** | **0,00** (eingefroren) | 16,68 | **33,23** | 62,8/96 |
| **4. +9 Luft-Sprünge** | 4242 | 24,66 | 30,98 | 24,66 | **90,38** | 5,6/96 |
| | 606 | **159,48** | **0,00** (eingefroren) | 22,98 | **86,69** | 9,3/96 |
| | 2025 | **159,48** | **0,00** (eingefroren) | 25,50 | **92,23** | 3,8/96 |
| | 777 | **159,48** | **0,00** (eingefroren) | 24,66 | **90,38** | 5,6/96 |
| | 1414 | **159,48** | **0,00** (eingefroren) | 21,30 | **82,99** | 13,0/96 |
| **4b. Dauerfeuer (200 Luft-Sprünge)** | 4242 | 24,66 | 30,98 | 24,66 | **1350,98 — tot** | 0/96 |
| | 606 | **159,48** | **0,00** | 22,98 | **1347,29 — tot** | 0/96 |
| | 2025 | **159,48** | **0,00** | 25,50 | **1352,83 — tot** | 0/96 |
| | 777 | **159,48** | **0,00** | 24,66 | **1350,98 — tot** | 0/96 |
| | 1414 | **159,48** | **0,00** | 21,30 | **1343,59 — tot** | 0/96 |
| **5. Geländekante 40 px, KEIN Sprung** | 4242–1414 | 5,46 | 0,00 | 5,46 | **0,00** | unverändert |
| **6. Geländekante 117 px, KEIN Sprung** | 4242–1414 | 9,66 | 0,00 | 9,66 | **0,00** | unverändert |
| **7. Geländekante 300 px, KEIN Sprung** | 4242–1414 | **167,58** | **0,00** (eingefroren) | 15,54 | **10,91** | 85,1/96 |

Was die Tabelle zeigt — und was ehrlich dazugehört:

- **Fall 1 unverändert** (0), **Fall 5 und 6 unverändert** (0). Das Zielbild ist
  auf beiden Seiten erfüllt: der einzelne Sprung und die normale Kante fühlen
  sich nicht anders an.
- **Fall 2–4 sind die Bremse**: +2 Luft-Sprünge kosten 22,01, +3 kosten 33,23,
  +9 kosten 86,69–92,23 bei 96 Leben (3,8–13 Leben übrig) — „dem Tode nah", und
  Dauerfeuer ist tödlich.
- **Fall 3/4 vorher ist der Befund**: Drei und mehr Luft-Sprünge kosteten
  **0,00**, während der Aufprall auf **159,48** px/Takt stand (im Gelände
  eingefroren). Genau diese Zeile hat den Auftrag ausgelöst.
- **Fall 7 ändert sich (0 → 10,91) — und das ist gewollt**: Ein 300-px-Sturz ist
  kein „normale Geländekante", sondern ein tiefer Sturz, und er wurde nach der
  Physik bezahlt. Vorher fror die Figur mit `vy = 167,58` ein und zahlte nichts.
  Ein 300-px-Sturz kostet jetzt 10,91 von 96 Leben — rund ein Neuntel.

## 6. Die Leiter der Luft-Sprünge (das Maßband für die Bremse)

Seed 4242/606/2025, Sprünge je am Gipfel, 500-Takte-Fenster. „+n" = n Sprünge in
der Luft nach dem Bodensprung.

| +n Luft-Sprünge | Schaden vorher | Schaden jetzt | Leben jetzt |
| ---: | ---: | ---: | ---: |
| 0 (Bodensprung) | 0,00 | **0,00** | 96,0/96 |
| 1 | 4,19 | **10,79** | 85,2/96 |
| 2 | 8,81 | **22,01** | 74,0/96 |
| 3 | 0,00 (`vy` 201,48) | **33,23** | 62,8/96 |
| 5 | 0,00 (`vy` 201,48) | **53,82** | 42,2/96 |
| 9 | 30,98 bzw. 0,00 | **86,69–92,23** | 3,8–9,3/96 |
| 200 | 30,98 bzw. 0,00 | **1343,59–1352,83** | tot |

## 7. Der Aufprall-Zuschlag als Formel — gegen alle Messwerte geprüft

```
Aufprall      = vy_land + 0,42 + 3 · (Zahl der Luft-Sprünge)
Fallschaden   = (Aufprall − 11) · 2,2        — nur wenn Aufprall > 11
```

Nachgerechnet gegen die gemessene Leiter (Sonde 14, Seed 606; identisch zu 4242
und 2025, sofern der Landeort derselbe ist):

| +n | `vy_land` gemessen | Aufprall | Schaden gerechnet | Schaden gemessen |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 12,90 | 15,90 | 10,78 | **10,79** |
| 2 | 15,00 | 21,00 | 22,00 | **22,01** |
| 3 | 17,10 | 26,10 | 33,22 | **33,23** |
| 5 | 20,46 | 35,46 | 53,81 | **53,82** |
| 9 | 23,40 | 50,40 | 86,68 | **86,69** (Seed 606) |
| 200 | 23,40 | 623,40 | 1347,28 | **1347,29** |

Die Formel trägt also bis zum Extremfall. Das `fall_damage`-Ereignis führt den
Zuschlag mit: `velocity` ist das **wirksame** Aufpralltempo (physikalisch +
Zuschlag), dazu `luftsprunge` und `zuschlag`. Die Anzeige
(`src/client/ereignisse.js`) liest nur `damage` — sie bleibt unverändert richtig.

## 8. Der Altreplay-Beleg

```
npm run replay -- play artifacts/replay-20260910.json --verify
  vorher : Zustandshash 9ec63e8c — „VERIFY: Replay ist exakt reproduzierbar."
  nachher: Zustandshash 9ec63e8c — „VERIFY: Replay ist exakt reproduzierbar."
```

**Der Hash ist unverändert.** Nicht erzwungen, sondern gemessen: Takt für Takt
mit `ReplayPlayer` nachgespielt — **2440 von 2440 Takten identisch** (Sonde 11,
Vergleich der Zustandshashes je Takt; `artifacts/replay-demo.json` ebenfalls
identisch in beiden Ständen, Hash 8bfae56c — dort stimmt die Erwartung
`d4071cd2` schon VOR der Änderung nicht).

Warum das so sein MUSS, ist wichtig für den nächsten Leser: Diese Aufzeichnung
enthält **keinen einzigen Sprung** (38 Eingaben, alle `kind: 'fire'`). Der
Zuschlag aus Luft-Sprüngen kann also gar nicht greifen. Und der Landungs-Umbau
greift nur dort, wo vorher **durch die Kruste gefallen** wurde: Die Aufzeichnung
hat in beiden Ständen **0 `fall_damage`-Ereignisse** über 2440 Takte.

### Der Zwischenstand, der TATSÄCHLICH abwich (und warum die Endfassung nicht)

Der erste Anlauf der Abtastung begann eine Zeile UNTER der Fußposition. Damit war
ein Fall nicht mehr abgedeckt, den der Vorzustand über `#surfaceY` abdeckte: eine
Figur, deren Fuß im Festkörper **steckt** (nach einem Ziehen/Schub, nach einem
Krater unter ihr). Messbar wurde das in genau EINEM Takt:

| | Befund |
| --- | --- |
| **Takt 289** | Spieler 3 wird von einem Windgeschoss (pa_041, Schütze 2) getroffen: `terrain_destroyed` (Radius 36) am Aufprallpunkt, 15,89 Schaden — und `pulled {dx: −90, dy: +26}`: Die Figur wird 90 px nach links auf die Geländeoberfläche der neuen Stelle gesetzt, **unter ihr ist der Krater**. |
| | Der Vorzustand ließ die Figur mit `y = 686,00` stehen (Oberfläche 696 − 10), der Zwischenstand mit `y = 696,42` fallen. |
| | **Takt 290**: Spieler 3 schießt — `projectile_spawn` meldete die Mündung mit `y = 686` gegen `y = 696,42`, also **10,42 px tiefer**. Die Bahn war eine andere. |
| | **ab Takt 989**: Die Zuggrenzen verschoben sich um einen Takt; 14 der 38 aufgezeichneten Schüsse wurden abgelehnt („Spieler ist nicht am Zug"), die Wiedergabe endete in Runde 9 (`playing`) statt Runde 13 (`gameover`). |
| | Kein Lebenswert und kein Fallschaden unterschied sich dabei — über alle 2440 Takte gab es in BEIDEN Ständen **0 `fall_damage`-Ereignisse**. |

Die Endfassung prüft deshalb die **Fußzeile mit** (`for (let y = Math.floor(fromY); …)`):
Eine Figur mit dem Fuß im Festkörper wird auf dessen Oberfläche gehoben — genau
das tat vorher `#surfaceY`. Mit dieser Zeile ist der Altreplay Takt für Takt
identisch (Abschnitt 8 oben), und der Zwischenstand ist damit vollständig erklärt:
**die Abweichung war die fehlende Fußzeile, nicht der Fallschaden.**

## 8b. Nachprüfung der vorgegebenen Ausgangslage

Die Zahlen, die den Auftrag ausgelöst haben, wurden selbst nachgemessen (Sonde 17,
gegen den Vorzustand UND den Endstand — die Abweichung wäre ein Fehler):

| Vorgabe | Nachgemessen | Vorher = Nachher? |
| --- | --- | --- |
| Schwelle bei `vy > 11` (`characterSystem.js`) | `vy 10,5` → Aufprall 10,92 → **0,00**; `vy 10,9` → 11,32 → **0,70**; `vy 11,0` → 11,42 → **0,92** | identisch |
| 10 Bodensprünge: 10 von 10 angenommen | Seed 606 und 2025: **10/10** angenommen, Figur bleibt am Zug | identisch |
| 10 Bodensprünge: 0 Fallschaden | Seed 606: 0,66 (identisch vorher/nachher — das ist der Aufprall einer Kante, siehe `docs/sprung-regel.md` §2.3); Seed 2025: 9,90 vorher, 0,00 nachher | **nicht** identisch — die Landung sitzt anders, siehe Abschnitt 5 |
| 10 Sprünge IN DER LUFT: +633 px, 0 Schaden | Seed 606: 10/10 angenommen, Höhe +633 px, **0,00 Schaden** bei `vy = 201,48` (eingefroren) | der Befund ist bestätigt |

Die letzten beiden Zeilen sind der Kern: Die Zahl der Sprünge war nie das Problem
— der Aufprall wurde nicht abgerechnet. Genau eine Zeile der Tabelle („0
Fallschaden bei 10 Bodensprüngen") ist deshalb NICHT unverändert: Der Sturz
landet jetzt, statt durch die Kruste zu fallen.

## 9. Was sich geändert hat (Fundstellen)

| Datei | Was |
| --- | --- |
| `src/shared/config/fallschaden.js` | **NEU.** Die drei Zahlen der Regel (Schwelle 11, Skala 2,2, Luft-Sprung-Zuschlag 3) samt Messreihen. |
| `src/engine/systems/characterSystem.js` | Landung tastet den Fallweg ab (`#ersteSolideZeile`); Körpermaße aus `config/player.js` statt zweiter Kopie; `#surfaceY` entfernt (hatte keinen Leser mehr); Schuld-Zähler `#luftsprunge` mit `meldeLuftsprung`/`luftsprungeSeitBoden`; Zuschlag im Aufprall; `fall_damage` trägt `luftsprunge` und `zuschlag`. |
| `src/engine/match.js` | `jump()` meldet einen angenommenen **Luft**-Sprung an das CharacterSystem (`meldeLuftsprung`). Der Bodensprung meldet nichts. |
| `tests/fallschaden-bremse.test.js` | **NEU.** Neun Prüfungen: Schwelle über einem Sprung, Leiter der Luft-Sprünge, Dauerfeuer tödlich, Kante unverändert, schneller Aufprall wird gelandet (nicht verschluckt), Schuld wird beglichen. |

## 10. Was ich NICHT geprüft habe

Ehrlich und vollständig — diese Punkte sind **nicht** abgedeckt:

- **Kein voller Testlauf.** `npm test` und `npm run test:e2e` waren für diese
  Arbeit ausdrücklich gesperrt (andere Arbeiter laufen parallel). Geprüft wurden
  gezielt: `tests/fallschaden-bremse.test.js` (neu, 9/9 grün),
  `tests/weapon-identity.test.js`, `tests/replay-sprung-luecke.test.js`,
  `tests/mobility.test.js`, `tests/water-drowning.test.js`,
  `tests/water-hud.test.js`, `tests/event-coverage.test.js`,
  `tests/eine-regel-eine-stelle.test.js` (8/9 — der eine Fehler ist FREMD:
  `tests/weapon-field-wiring.test.js` definiert `ohneKommentare` ein zweites Mal).
- **Die Testzahl 1122 ist nicht nachgemessen** (dafür wäre der volle Lauf nötig).
  Mit den neun Prüfungen dieser Datei ist sie eine **Untergrenze**; README und
  MASTERDOTO nennen sie weiterhin einheitlich 1122 — die Dateizahl (118) stimmt.
- **Kein Browser, kein Onlinespiel.** Die Anzeige „Sturzschaden" ist gelesen, nicht
  im Browser gesehen; der Netzpfad (`protocol.js`) ist nicht angefasst.
- **Wasser.** Der Fallschaden ist in Wasser unverändert aus (`!inWater`) — ob die
  Bremse auch dort greifen SOLL, ist nicht entschieden und wurde nicht geändert.
- **Klassen- und Sidegrade-Unterschiede beim Sprung** (Impuls je Beweglichkeit)
  sind nur indirekt berührt: die Leiter wurde mit einer Klasse gemessen (Impuls
  9,70). Andere Klassen springen anders hoch, der Zuschlag ist pro Luft-Sprung
  aber unabhängig von der Klasse.
- **Die Kartenauswahl.** Gemessen wurde `hills`. Andere Presets ändern die
  Landeorte, nicht die Regel.
- **Der Zuschlag ist gesetzt, nicht optimiert.** 3 px/Takt ist aus der
  gemessenen Leiter gewählt (Abschnitt 6/7). Ob „+1 Luft-Sprung = 10,79 Leben"
  sich im Spiel richtig anfühlt, entscheidet der Auftraggeber — es ist eine Zahl
  in `config/fallschaden.js`, keine Mechanik.

## 11. Stellen, die noch die alte Aussage tragen (NICHT in diesem Auftrag geändert)

Diese Fundstellen behaupten weiterhin, der Fallschaden sei keine Bremse. Sie
liegen nicht in meiner Dateihoheit und wurden deshalb NICHT stillgelegt, sondern
namentlich genannt:

| Fundstelle | Behauptung |
| --- | --- |
| `docs/sprung-regel.md` §2 („Der Fallschaden ist KEINE Bremse") und §2.4 („es gibt heute keine Bremse") | durch diese Änderung überholt — §2.3 („zehn Sprünge, 0 Schaden") war die Messung, die den Auftrag ausgelöst hat |
| `docs/sprung-regel.md` §5/§6 (Zahlen und Dateiliste) | nennen teils die alten Fundstellen (`:389`, `:1265`) |
| `tests/weapon-identity.test.js`, Kommentarblock „Sprung ohne Obergrenze" | „Der zweite Teil — der Fallschaden als Bremse — ist GEMESSEN und trägt NICHT" |
| `README.md`, Testzahl-Notiz | „(Fallschaden bremst NICHT — gemessen)" |
| `MASTERDOTO.md` (Testzahl) | „1122/1122" — mit neun neuen Prüfungen eine Untergrenze |

## 12. Wie man die Messungen wiederholt

Die Sonden lagen unter `/tmp/fallprobe/` (JavaScript gegen
`src/engine/match.js`, mit `SRC_ROOT` gegen zwei Stände fahrbar):

| Sonde | Frage |
| --- | --- |
| `probe9.mjs` | Die Vier-Fälle-Tabelle (Sprungfolgen und Kanten, je Seed) |
| `probe11.mjs` | Zustandshash je Takt im Altreplay (Takt-für-Takt-Vergleich zweier Stände) |
| `probe14.mjs` | Die Leiter der Luft-Sprünge |
| `probe15.mjs` | Gesetztes Sinktempo (deckt den eingefrorenen Zustand auf) |
| `probe16.mjs` | Aufpralltempo gegen Fallhöhe (die Deckel-Frage) |
| `probe17.mjs` | Nachprüfung der Ausgangslage (Schwelle, zehn Bodensprünge, zehn Luft-Sprünge) |

Der Vorzustand ist reproduzierbar durch eine Kopie von `src/` mit den beiden
HEAD-Fassungen von `engine/match.js` und `engine/systems/characterSystem.js`.

Die wichtigsten Zahlen stehen jetzt als **Tests** in
`tests/fallschaden-bremse.test.js` — sie laufen mit und brechen, wenn die Zahlen
kippen.
