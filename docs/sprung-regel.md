# Die Sprung-Regel: keine Obergrenze — und was den Sprung wirklich nicht bremst

**Stand: 2026-09-27.** Diese Datei hält EINE Entscheidung fest, die Messung, auf
der sie steht, und die Annahme, die gemessen NICHT trägt.

> **Nachtrag 2026-11-04 (N-45, gegen den Code geprüft):** §2 (Überschrift) und
> §2.4 („es gibt heute keine Bremse") sind **überholt**. Inzwischen meldet
> `jump()` jeden Sprung in der Luft an das Figurensystem
> (`meldeLuftsprung`, `src/engine/match.js:1256`), und
> `src/engine/systems/characterSystem.js:213` rechnet beim Aufprall
> `vy + Luftsprünge · luftsprungZuschlag` gegen die Schwelle; der Zuschlag ist
> 3 px/Takt (`src/shared/config/fallschaden.js`). Die Schuld verfällt bei
> Bodenberührung. Ein Bodensprung bleibt damit frei (dafür gelten §2.1–§2.3
> weiter), Luftsprünge kosten Fallschaden — der zweite Teil der Entscheidung
> („fallschaden beendet") ist gebaut. Messung und Leiter:
> `docs/fallschaden-bremse.md`. Die Zahlengrenze bleibt entfallen; die
> Fundstellen in §4 und der Stand in §6 sind nachgezogen.

## 1. Die Entscheidung

Auftraggeber, wörtlich:

> „nein sprung kann man unendlich, aber fallschaden beendet"

Gebaut ist der erste Teil: **Die Obergrenze von zwei Sprüngen je Zug ist
entfallen.** Vorher lehnte der Motor den dritten Sprung mit „Keine Sprünge mehr
in diesem Zug" ab (`src/engine/match.js`, früher Zeile 1265).

Geblieben ist die **Bodenregel**:

> Der ERSTE Sprung eines Zuges geht nur vom Boden.

Sie grenzt nicht die ZAHL der Sprünge ein, sondern ihren ANFANG: Ohne sie wäre
ein Absprung mitten im Flug ein gültiger „erster" Sprung, der Bodenkontakt hätte
für die Mechanik keine Bedeutung mehr, und jede Fallhöhe wäre ein Startplatz.

## 2. Die Messung: Der Fallschaden ist KEINE Bremse (Stand 2026-09-27 — überholt, siehe Nachtrag oben)

Die Annahme „Fallschaden beendet" wurde am **lebenden Motor** geprüft, bevor
etwas gebaut wurde. Sie trägt nicht.

### 2.1 Die Schwelle, direkt gemessen

Der Fallschaden greift in `src/engine/systems/characterSystem.js` bei

```
vy > fallDamageThreshold (= 11)   →   Schaden = (vy − 11) · 2.2
```

Gemessen wird die Schwelle kontrolliert — einer stehenden Figur wird die
Sinkgeschwindigkeit GESETZT, dann läuft EIN Schritt (kein Geländezufall):

| gesetztes `vy` (px/Takt) | Aufprall-`vy` | Fallschaden |
| ---: | ---: | ---: |
| 9,0 | 9,42 | 0 |
| 10,0 | 10,42 | 0 |
| 10,5 | 10,92 | 0 |
| 10,9 | 11,32 | 0,70 |
| 11,0 | 11,42 | 0,92 |
| 11,5 | 11,92 | 2,02 |
| 13,0 | 13,42 | 5,32 |

Die Schwelle liegt also bei einem Aufpralltempo von **11 px/Takt**.

### 2.2 Der Sprung liegt darunter

| Größe | Messwert |
| --- | ---: |
| Absprungimpuls (höchster Wert, Klasse mit `mobilityMultiplier` 1,1) | **10,12 px/Takt** |
| Absprungimpuls des Doppelsprungs (Faktor 0,8) | 8,10 px/Takt |
| Gemessenes Aufpralltempo nach einem Sprung | **9,62 px/Takt** |
| Sprunghöhe | **116,9 px** |
| Fallbeschleunigung (aus Impuls und Höhe: `g = v²/(2h)`) | 0,438 px/Takt² |
| Höhe, die für die Schwelle nötig wäre (`11²/(2g)`) | **138,1 px** |

**Ergebnis: Der Absprung setzt weniger, als die Fallschadensschwelle verlangt.**
Ein Sprung landet mit 9,62 px/Takt, die Schwelle liegt bei 11 — es entsteht kein
Fallschaden, gleich wie viele Sprünge hintereinander folgen.

### 2.3 Zehn Sprünge hintereinander — gemessen

„Springe zehnmal gerade nach oben, dann wieder" (`jump` → landen → `jump` …,
`turnDurationMs` sehr groß, gemessenes Leben vorher/nachher):

| Seed | Sprünge angenommen | Fallschaden | Lebensverlust | seitliche Strecke |
| ---: | ---: | ---: | ---: | ---: |
| 606 | 10 von 10 | **0** | 0 | 1700 px |
| 2025 | 10 von 10 | **0** | 0 | 1562 px |
| 777 | 10 von 10 | **0** | 0 | 1647 px |
| 1414 | 10 von 10 | 13,33 (2× `fall_damage`) | 13,33 | 1700 px |

Seed 1414 ist der ehrliche Gegenfall und **kein** Gegenbeweis: Bei einer
Bodenwelle über unebenes Gelände kann eine Figur auf einer KANTE landen, die
tiefer liegt als der Start — dann ist der Fallschaden der Abstand zum Boden
unter ihr, nicht die Zahl der Sprünge. Dieselbe Kante kostet denselben Schaden
bei EINEM einzigen Sprung; messbar ist der Unterschied nicht am Zähler, sondern
am Gelände.

### 2.4 Was unbegrenzte Sprünge wirklich bedeuten (gemessen)

Weil jeder Sprung die senkrechte Geschwindigkeit **setzt** statt sie zu addieren,
kann eine Figur beliebig viele Sprünge IN DER LUFT nachsetzen:

| Messung (Seed 606 / 1414, 200 Takte) | Wert |
| --- | ---: |
| nachgesetzte Luft-Sprünge, alle angenommen | 10 von 10 |
| Höhe über dem Start | +632,9 px / +545,9 px (Kartenoberkante) |
| seitliche Strecke | 1048,1 px |
| Fallschaden | **0** |

Das ist die Folge der entfallenen Grenze, und sie ist hiermit **gemeldet statt
erfunden**: Es gibt heute keine Bremse gegen unbegrenztes Springen. Wer eine
will, muss sie BAUEN — der Fallschaden ist es nicht, und eine neue Bremse wurde
auf Anweisung des Auftraggebers nicht erfunden.

## 3. Was sich für den Spieler ändert

- **Springen ist nicht mehr gezählt.** Nach dem Bodensprung darf beliebig oft
  nachgesetzt werden; wer in der Luft nachsetzt, bleibt oben. *(Nachtrag
  2026-11-04: und zahlt beim Aufprall den Luftsprung-Zuschlag als Fallschaden,
  siehe Nachtrag oben.)*
- **Die Anzeige bleibt richtig.** „Sprung" heißt weiterhin *vom Boden
  abgesprungen*, „Doppelsprung" *in der Luft abgesprungen*
  (`n.double`; `src/client/ereignisse.js`, `src/client/main.js`). Die
  Unterscheidung hing nie an der Restzahl.
- **`jumpsLeft` ist `null`** — die Aussage „unbegrenzt", keine Zahl. Warum
  `null` und nicht `Infinity`: Das Ereignis geht im Netzspiel als JSON über die
  Leitung, und `JSON.stringify(Infinity)` ergibt `null`; lokal stünde dann
  `Infinity`, online `null` — zwei Werte für dieselbe Sache. Begründung im Code:
  `src/engine/match.js`, `SPRUENGE_UNBEGRENZT`.
- **Online sieht man den Sprung jetzt.** `jumped` stand in
  `GEDROSSELTE_EREIGNISARTEN` (30-Takte-Fenster je Art und Figur). Gemessen mit
  dem Muster des Motors (ein Sprung je Takt, 61 Sprünge in 61 Takten) kamen nur
  **3 von 61** Meldungen durch — und schon der normale Doppelsprung (5 Takte
  nach dem ersten) fiel ins Fenster: die Zeile „Doppelsprung" kam online nie an.
  Mit unbegrenzten Sprüngen ist der Abstand keine Flugphase mehr, die
  Voraussetzung für die Drossel fehlt; `jumped` ist deshalb **herausgenommen**
  (`src/shared/protocol.js`). Kosten, benannt: Wer im Takt springt, erzeugt 61
  kleine Steuernachrichten je Sekunde.

## 4. Änderungen im Einzelnen (Fundstellen)

Zeilenangaben auf den Stand 2026-11-04 nachgezogen (N-45).

| Datei | Was |
| --- | --- |
| `src/engine/match.js` | `SPRUENGE_UNBEGRENZT` (`:347`), `jumpsLeft()` → `null` (`:1109`), `jump()`: Grenze `verbraucht >= 2` entfernt, Bodenregel bleibt (`:1208`), `jumped`/Rückgabe mit `jumpsLeft: null` (`:1268`, `:1278`), Reset am Zugbeginn (`:2299`) |
| `src/shared/protocol.js` | `jumped` aus `GEDROSSELTE_EREIGNISARTEN` entfernt (Begründung `:890`); die Liste wird heute aus dem Katalog abgeleitet (`:917`, `KATALOG_GEDROSSELT` in `src/shared/ereigniskatalog.js`, `jumped` ohne `drossel`) |
| `src/client/main.js` | Doku von `Main#jump` (Grenze entfallen, `jumpsLeft` = `null`) |
| `src/client/ereignisse.js` | `jumped`-Zweig: `jumpsLeft` wird NICHT gelesen, `double` trägt die Unterscheidung |
| `tests/weapon-identity.test.js` | Grenze-Test umgedreht, Zug-Reset-Test neu gefasst, vier Tests für die neue Regel (zehn Sprünge ohne Schaden, Luft-Kette, Fallschaden-Schwelle, Sendefilter) |
| `tests/anti-cheat.test.js` | „Ein dritter Sprung im selben Zug wird abgelehnt" → „Die Bodenregel gilt weiter, die Zahlengrenze nicht mehr" |
| `tests/e2e/online-sprung-abwurf.spec.mjs` | `rahmen.jumpsLeft` → `toBeNull()` |

## 5. Zusatz: die drei Dauer meldenden Zustandsarten sind jetzt gedrosselt

Nicht Teil des Sprung-Auftrags, aber an derselben Liste entschieden
(`GEDROSSELTE_EREIGNISARTEN`, `src/shared/protocol.js`): `damage`,
`entity_in_water` und `drowning` melden ihren Wert JEDEN Takt, obwohl er im
Snapshot steht (Messreihen: `docs/ereignis-info-gehalt.md`). Sie werden mit
demselben 30-Takte-Verfahren zusammengefasst — die ERSTE Meldung jeder Art und
Figur geht raus.

Eigene Nachmessung (Seed 20260910, `flooded`, 40 Figuren, 1800 Takte = 30 s):

| | vorher | nachher |
| --- | ---: | ---: |
| `damage` | 15092 | 516 |
| `entity_in_water` | 15092 | 516 |
| `drowning` | 15092 | 516 |
| drei zusammen (KB/s) | 154,19 | 5,28 |
| ganzer Kanal (KB/s) | 161,13 | 6,74 (**−95,8 %**) |

Auf `hills` ohne Wasser kommen die drei nicht vor (0 Meldungen) — die Drossel
kostet dort nichts, weil es nichts zu drosseln gibt.

**Vorbehalt zu `damage`:** Es trägt `attackerId`, und der Urheber steht NICHT im
Snapshot. Heute liest ihn niemand. Soll ihn je eine Anzeige zeigen, muss
`damage` aus der Drossel heraus oder die Zusammenfassung je Urheber führen — der
Satz steht als Bedingung an der Liste im Code.

## 6. Nachzuziehende Stellen — Stand 2026-11-04: erledigt (N-45)

Diese Stellen behaupteten am 2026-09-27 noch die alte Grenze bzw. die alte
Drossel-Einteilung. Jede ist am 2026-11-04 gegen den Code geprüft:

| Fundstelle (2026-09-27) | Behauptung | Stand 2026-11-04 |
| --- | --- | --- |
| `README.md:150-151` | „**Sprung:** Je Zug sind zwei Sprünge möglich — einer vom Boden, einer in der Luft." | bereits nachgezogen: Abschnitt „**Sprung:**" (heute um Zeile 297) nennt die Sprünge unbegrenzt, den ersten nur vom Boden, und den Luftsprung-Zuschlag |
| `MASTERDOTO.md:2768` | „**Doppelsprung** (zweiter Impuls, einmal je Zug)" | richtiggestellt (Abschnitt „D. Bewegung") |
| `docs/hunter-e2e-luecke.md:187` | „zwei Sprünge je …" | Datei gelöscht (Commit `0c3a87d`, Wissen in `docs/TODO-SSOT.md` übernommen) — nichts mehr zu ziehen |
| `docs/auftraege/online-sprung-und-abwurf.md:364`, `:933` | Grenze von zwei Sprüngen (Auftragsdokument, historischer Stand) | Datei gelöscht (Commit `0c3a87d`) — nichts mehr zu ziehen |
| `docs/ereigniskanal-filter.md:457` | „**Die Wassertypen bleiben ungedrosselt** (Auflage des Auftrags)" | Nachtrag an der Stelle: `damage`, `drowning`, `entity_in_water` tragen `drossel: 'zustand'` |
| `docs/ereignis-info-gehalt.md:476-478` | Regel „gedrosselt ⇒ Anzeige" | Nachtrag an der Stelle: Regel heute „Anzeige ODER snapshot-redundant" (`tests/event-coverage.test.js`) |
| `README.md:173` / `MASTERDOTO.md` (Testzahl) | Testzahlen/Dateizahl | laufend nachgezogen, `npm run check:docs` grün |

## 7. Wie man die Messungen wiederholt

Die Messläufe zu dieser Datei lagen als Skripte unter `/tmp/sprung/`
(`messung1.mjs`–`messung4.mjs`, gegen `src/engine/match.js` und den
`EreignisSendefilter`); die wichtigsten Zahlen stehen inzwischen als **Tests**
in `tests/weapon-identity.test.js` (Abschnitt „Sprung ohne Obergrenze") und in
`tests/event-coverage.test.js` (Drossel-Gruppe) — sie laufen mit `node --test
<datei>` mit und brechen, wenn die Zahlen kippen.

Der harte Abnahmepunkt zum Altreplay bleibt unberührt:

```
npm run replay -- play artifacts/replay-20260910.json --verify
  → Zustandshash 9ec63e8c, „VERIFY: Replay ist exakt reproduzierbar."
```

Grund: Keine bestehende Aufzeichnung nutzt mehr als zwei Sprünge oder den
Sendefilter — das Entfernen einer Grenze und das Zusammenfassen von Meldungen
ändern die Simulation nicht. Der Sendefilter sitzt hinter `consumeEvents()`,
Replays zeichnen Eingaben auf, keine Ereignisse.
