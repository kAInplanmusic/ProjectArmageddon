# Vorrang im HUD-Protokoll

**Betrifft:** `src/client/hud.js` (Protokollliste `#log-list`), Tests:
`tests/hud-vorrang.test.js`.
**Stand:** 2026-09-27.

---

## 1 Der Befund (gemessen, nicht behauptet)

`LOG_LIMIT = 60` Zeilen; neue Zeilen kommen vorn hinein, die älteste fiel hinten
heraus — **nach Zeit, nicht nach Wichtigkeit**. Eine STEHENDE Figur erzeugt
~34 `landed`-Meldungen je Sekunde (die Physik lässt sie um 4 px pendeln). Damit
war eine Meldung wie

> `In der Luft ist kein erster Sprung möglich` — die Begründung, wenn SHIFT nicht wirkt

nach wenigen Sekunden aus dem Protokoll gespült: Der Spieler drückt etwas, es
passiert nichts, und die Begründung ist weg, bevor er sie liest. Genau die
Fehlerklasse „stummer Ausstieg", die diese Sitzung mehrfach behoben hat.

**Messung (Sonde, Wegwerf, `/tmp/hud-ueberlebt.mjs`):** echtes `MatchController`
(Seed 4242), Ereignisse über die ECHTE Tabelle `src/client/ereignisse.js` in den
ECHTEN `Hud`, optional hinter dem ECHTEN `EreignisSendefilter` aus
`src/shared/protocol.js` (so wendet ihn der Server in seiner `tick()`-Schleife
an). Laufzeit 10 s, Meldung nach 4 s eingesetzt:

| Lage (10 s, Meldung nach 4 s) | Zeilen/s | Überlebt | Knoten |
| --- | --- | --- | --- |
| 4 Figuren, `hills`, ungefiltert | 34,5 | **105 Takte = 1,8 s** | 60 |
| 4 Figuren, `flooded`, ungefiltert | 17,3 | **210 Takte = 3,5 s** | 60 |
| 4 Figuren, `hills`, gefiltert | 7,3 | > Laufzeit (10 s) | 60 |
| 4 Figuren, `flooded`, gefiltert | 3,7 | > Laufzeit (10 s) | 37 |
| 40 Figuren, `hills`, ungefiltert | 344,2 | **14 Takte = 0,2 s** | 60 |
| 40 Figuren, `flooded`, ungefiltert | 138,4 | **28 Takte = 0,5 s** | 60 |
| 40 Figuren, `hills`, gefiltert | 72,2 | **42 Takte = 0,7 s** | 60 |
| 40 Figuren, `flooded`, gefiltert | 29,6 | **112 Takte = 1,9 s** | 60 |

Gegenprobe der Rechnung: 60 / 34,5 = 1,74 s — die Zahl ist stimmig.

**Zwei Dinge sind daran wichtig:**

1. Die Drossel aus Commit `473bb5a` (Sendefilter) verbessert die Lage (4
   Figuren: 1,8 s → ~8,7 s), **löst sie aber nicht**: Bei 40 Figuren bleibt
   selbst gefiltert unter einer Sekunde (0,7 s). Ein Vorrang, der nur „später"
   kommt, ist kein Vorrang.
2. Die Zeilen dieser Tabelle sind der **ungedrosselte** Fall (die Sonde umgeht
   den Sendefilter) — die konservative Wahl für einen Regressionstest. Wer den
   Online-Betrieb beurteilt, liest die gefilterten Zeilen.

**Grenzen der Sonde, offen benannt:** Ohne `Hud.update` fehlen die
Zugwechsel-Zeilen (1 je Zug — bei 30 s Zugzeit im 10-s-Lauf: 0), und der
Kontext war absichtlich unvollständig (das Modul meldet das selbst:
`[ereignisse] lokal: Kontextfeld(er) fehlen: …`). Beides macht den gemessenen
**Zufluss kleiner**, nie größer — die Vorher-Zahlen sind also eine untere
Schranke des Rauschens.

---

## 2 Die Entscheidung: reserviertes Budget **und** Zusammenfassen

Gebaut sind **zwei** sich ergänzende Wege. Einer allein hätte die Zusicherung
nicht getragen.

### (a) Reserviertes Budget — die Zusicherung

`protokollKlasse(tone)` teilt jede Meldung einer von zwei Klassen zu:

| Klasse | Töne | Zeilen | Bedeutung |
| --- | --- | --- | --- |
| `vorrang` | `danger`, `accent`, `good`, `notice` | eigenes Budget: **20** | Fehler, Zugwechsel, Ereignisse, Ablehnungsbegründungen |
| `rauschen` | alles andere (Vorgabeton `neutral`) | der Rest, bis 60 | Anzeigearten — `landed` und Verwandte |

**Die Regel:** Beim Überschreiten der Gesamtgrenze `LOG_LIMIT` fällt **immer die
älteste Rauschzeile** heraus; eine Vorrangzeile kann nur von einer Vorrangzeile
verdrängt werden (ihr Budget). Anzeigerauschen kann eine Vorrangmeldung deshalb
**nie** verdrängen — unabhängig davon, wie viel davon ankommt und wie viele
verschiedene Texte es sind.

**Warum das Rauschen den Rest mitbenutzen darf:** Ohne Vorrangmeldungen füllt
die Anzeige das Protokoll bis 60 (so hält es die bestehende E2E-Zusicherung
`screenreader.spec.mjs`, „80 Füllzeilen → 60 Knoten"). Sobald Vorrangmeldungen
da sind, nimmt sich der Vorrang seinen Platz zurück (20 Zeilen bleiben
reserviert) — das Rauschen zahlt. Ein Protokoll, das bei 40 Zeilen dichtmacht,
obwohl keine einzige wichtige Meldung ansteht, wäre eine Verschlechterung ohne
Nutzen; ein fester 40/20-Schnitt wäre genau das gewesen.

Die Töne sind bereits die Absicht des Absenders (`danger` = Fehler, `accent` =
Zugwechsel/Ereignis) — die Zuordnung erfindet keine zweite Wahrheit und
braucht keine Änderung an den Aufrufern.

### (b) Zusammenfassen statt anhäufen — die Entlastung

Gleicher Text belegt **eine** Zeile, weitere Vorkommen zählen dort hoch
(`Anna ist gelandet ×12`). Damit fällt der Zufluss selbst, statt nur anders
verteilt zu werden: Bei 4 Figuren sind genau 4 Landungstexte im Umlauf — das
Protokoll wird gar nicht mehr voll (gemessen: **5 Knoten** statt 60 nach 300
Takten; im 30-s-Lauf **5** statt 60 bei 1 029 Meldungen am Eingang).

Für Vorrangmeldungen wird **nur eine unmittelbar folgende Wiederholung**
zusammengefasst (Tastenspam auf dieselbe Sperre). Eine spätere gleiche Meldung
ist ein NEUES Ereignis und bekommt eine neue Zeile — sonst verschwände
„Anna ist am Zug" der nächsten Runde im Zähler der vorigen und die
Zugwechsel-Ansage (die wichtigste Ansage des Protokolls) fiele weg.

**Bewusste Entscheidung, im Test festgehalten:** Die hochgezählte Zeile bleibt
an IHREM Platz stehen und wandert nicht nach oben. Sie ist kein neues Ereignis,
und ein Umsortieren wäre eine DOM-Verschiebung im Live-Bereich — mit
`aria-relevant="additions"` ist das eine Ansage, die den Nutzer nichts angeht.

### Warum nicht die anderen Wege

- **(c) Fehler nie automatisch entfernen (nur manuell oder beim Matchwechsel):**
  Der Knotenbestand wüchse unbegrenzt über `LOG_LIMIT` hinaus. `#log-list` ist
  eine Live-Region; ein Screenreader liest sie beim Fokussieren GANZ vor — bei
  Hunderten Zeilen ist das kein Vorrang, sondern eine Zumutung. Außerdem
  bräuchte die wachsende Liste sofort wieder eine Obergrenze — also genau
  dieses Budget.
- **Nur Zusammenfassen (ohne Budget):** Wirkt nur bei GLEICHEM Text. Auf
  `flooded` entsteht ein Rauschgemisch aus vielen verschiedenen Texten
  (Wassermeldungen je Figur und Füllstand); ein einziges davon reicht, um eine
  Vorrangmeldung zu verdrängen. Die Zusicherung wäre „meistens", nicht „nie" —
  und „meistens" ist bei einer Begründung, die der Spieler braucht, zu wenig.

---

## 3 Ablehnungsbegründungen: der Ton `notice`

**Der Befund.** Fünf Stellen im Client protokollieren eine ABLEHNUNG mit dem
Vorgabeton `neutral` und landen damit im Rauschbudget:

| Stelle | Meldung |
| --- | --- |
| `main.js` | `Nur am eigenen Zug kann gesprungen werden` |
| `main.js` | `ergebnis.errors.join(', ')` — **die Serverbegründung eines abgelehnten Sprungs** |
| `main.js` | `Nur am eigenen Zug kann eine Waffe abgeworfen werden` |
| `main.js` | `Abwerfen ist im Replay nicht möglich` |
| `main.js` | `Nur am eigenen Zug kann die Waffe gewechselt werden` |

Genau diese Klasse darf nicht verschwinden: Der Spieler drückt etwas, es
passiert nichts, und er soll erfahren warum.

**Die Schnittstelle (was der Aufrufer setzen muss):**

```js
hud.log('Nur am eigenen Zug kann gesprungen werden', 'notice');
```

`'notice'` ist ein eigener Ton, der **denselben Vorrang wie `danger` bekommt**
und **wie `neutral` gezeichnet wird** (Farbe `#8ba0b4`).

**Warum ein eigener Ton (und nicht `danger`):** `danger` heißt im ganzen Haus
Schaden und Gefahr und ist rot (`#ef476f`). Eine abgelehnte Tasteneingabe damit
zu schreiben, ließe jeden Tastendruck wie einen Angriff aussehen — die Farbe
ist eine Aussage über die Lage, nicht über den Ort des Problems. Außerdem ist
`:danger` mit „Schaden/Gefahr" belegt; die Bedeutung würde verwässern.

**Warum nicht eine zusätzliche Kennzeichnung am Aufruf** (`hud.log(text,
'neutral', { dringend: true })`): Ton und Wichtigkeit sind dieselbe Frage an
denselben Aufruf. Zwei Achsen dafür sind zwei Regeln für eine Sache — genau die
Doppelregel, die dieses Projekt an anderer Stelle teuer bezahlt hat
(Simulationstakt, Trefferfeld, Reichweite: „eine Regel, eine Stelle"). Zudem
müsste jeder Aufrufer beide Konzepte kennen, und bis alle fünf Stellen
umgestellt sind, stünde ein ungenutzter Parameter im Code (eine Absicht ohne
Wirkung — der Audit meldet so etwas).

**Warum keine Texterkennung** (Muster wie `/nicht möglich|Nur am eigenen Zug/`):
eine ZWEITE Regelquelle. Sie fällt bei der nächsten Umformulierung still aus
(die Meldung ist dann wieder ungeschützt), greift bei einer Meldung, die
inhaltlich etwas anderes sagt, und sie versteckt die Entscheidung vor dem
Absender. Der Ton steht dort, wo die Absicht entsteht.

---

## 4 Barrierefreiheit: die Live-Region wird nicht neu aufgebaut

`#log-list` ist `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`.
Daraus folgen drei Regeln, die der Weg einhält und die Tests festhalten:

1. **Kein Neuaufbau.** Beim Einfügen wird nur `prepend` benutzt, beim
   Zusammenfassen nur `textContent` EINES vorhandenen Knotens geändert — und
   beim Trimmen fällt GENAU der älteste Knoten SEINER Klasse heraus (der
   Eintrag führt seinen Knoten mit). Ein `replaceChildren` über die Liste würde
   bei jeder Meldung 60 Knoten neu erzeugen und den Screenreader die ganze
   Region vorlesen lassen. Der Test zählt `replaceChildren`-Aufrufe auf der
   Protokollliste: **0**.
2. **Textänderung ist keine Hinzufügung.** Ein hochgezählter Zähler ist für
   `aria-relevant="additions"` unsichtbar — die Ansage bleibt die einer neuen
   Zeile pro Ereignis, nicht pro Vorkommen.
3. **Knotenidentität bleibt.** Beim Hochzählen ist es DERSELBE Knoten (die
   Tests vergleichen die Objekte, nicht die Texte); die Kinderliste wächst
   nicht.

Gegen den echten Browser geprüft: `npx playwright test
tests/e2e/screenreader.spec.mjs` → **11 passed (49,3 s)**, darunter
„Eine neue Meldung erzeugt genau EINEN neuen Knoten" und „Das Protokoll wird
oben begrenzt und meldet keine Entfernung" (80 Füllzeilen → 60 Knoten).

---

## 5 Tests

```bash
node --test tests/hud-vorrang.test.js --test-reporter=spec
# 19 Tests, 19 pass, 0 fail, ~0,5 s
npx eslint src/client/hud.js tests/hud-vorrang.test.js
```

Enthalten und woertlich geprüft:

- **Vorrang:** `protokollKlasse` (Ton → Klasse, inkl. Vorgabeton, `notice` und
  fremdem Ton); eine Fehlermeldung überlebt **200 Anzeigemeldungen mit gleichem
  Text** (→ 2 Knoten) und **200 mit verschiedenen Texten** (→ 60 Knoten, keiner
  der Vorrangplätze verdrängt); dasselbe für einen Zugwechsel; **eine
  Ablehnungsbegründung (`notice`) überlebt 200 Anzeigemeldungen** und wird
  dabei WIE `neutral` gezeichnet (Farbe geprüft, rot ausgeschlossen); `notice`
  füllt dasselbe Budget wie die übrigen Vorrangmeldungen; 100 Vorrangmeldungen
  → 20 Zeilen, die ältesten fallen zuerst; mit 20 Vorrangzeilen bleiben dem
  Rauschen genau 40; ohne Vorrangmeldungen füllt das Rauschen bis 60.
- **Zusammenfassen:** gleicher Text bei abwechselnden Figuren → eine Zeile
  `×3`; unmittelbare Wiederholung auch bei Vorrang → `×5`; spätere gleiche
  Vorrangmeldung → NEUE Zeile (3 Knoten); verdrängte Rauschzeile kommt mit
  Zähler eins zurück; `clearLog` setzt Zähler zurück.
- **Live-Region:** derselbe Knoten, keine wachsende Kinderliste, **kein**
  `replaceChildren` — mit einem DOM-Ersatz, der `replaceChildren` ZÄHLT.
- **Echter Weg:** an einem laufenden `MatchController` (4 Figuren, `hills`,
  Seed 4242, 300 Takte, Meldung nach 60 Takten) übersteht eine Vorrangmeldung
  die restlichen **240 Takte** (vorher fiel sie nach **105** Takten); Kontrolle,
  dass es wirklich Landungsrauschen gab (`assert` schlägt fehl, wenn nicht —
  sonst prüfte der Test nichts). Zweiter Test: das Protokoll bleibt unter
  `LOG_LIMIT`, jeder Text kommt höchstens einmal vor.

**Falsifizierbarkeit (in einer KOPIE des Baums geprüft, nicht im Arbeitsbaum:
`cp -r src tests package.json /tmp/mut`):** Drei Proben, jede mit einer
minimalen Mutation:

| Probe | Mutation | Ergebnis |
| --- | --- | --- |
| A | Überhang zahlt die **älteste Zeile überhaupt** (die alte Zeitregel), Zusammenfassen bleibt | 14 grün, **5 rot** — genau die Vorrang-/Budget-Tests („… überlebt 200 Anzeigemeldungen mit VERSCHIEDENEN Texten", „Anzeigerauschen nutzt nur den Platz, den der Vorrang nicht braucht", die beiden `notice`-Tests, Zugwechsel) |
| B | **Zusammenfassen abgeschaltet**, Budget bleibt | 14 grün, **5 rot** — die Zähl-/Knoten-Tests, darunter „Am laufenden Match: das Protokoll bleibt unter LOG_LIMIT" |
| C | die **alte Fassung** aus `git show HEAD:src/client/hud.js` | 19 rot |

Befund aus A und B, der die zwei Wege rechtfertigt: In Probe A hält das
ZUSAMMENFASSEN die Vorrangzeile (der Test „240 Takte am laufenden Match" bleibt
grün), in Probe B hält sie das BUDGET (derselbe Test bleibt grün, obwohl die
Liste bis 60 vollläuft). Jeder der beiden Wege trägt die Abnahme allein — die
Zusicherung fällt erst, wenn man beide entfernt. Bei Probe C ist die erste
Fehlermeldung `document is not defined`: Die alte Fassung liest den GLOBALEN
`document` (siehe §7.3) — auch das ist damit belegt.

---

## 6 Messung nachher

Dieselbe Sonde, dieselben acht Fälle, derselbe Eingang — nur mit dem neuen
`hud.js`. VORHER: 10 s Lauf, Meldung nach 4 s. NACHHER: 30 s Lauf, Meldung nach
12 s (die kürzere Laufzeit der Gegenspalte ist angegeben, wo sie 10 s beträgt).

| Lage | Zeilen/s Eingang | Überlebt VORHER | Überlebt NACHHER | Knoten vorher → nachher |
| --- | --- | --- | --- | --- |
| 4 Figuren, `hills`, ungefiltert | 34,5 → 34,3 | 1,8 s | **> 18 s (Rest des 30-s-Laufs)** | 60 → **5** |
| 4 Figuren, `flooded`, ungefiltert | 17,3 → 17,4 | 3,5 s | **> 6 s** | 60 → **5** |
| 4 Figuren, `hills`, gefiltert | 7,3 → 7,0 | > 10 s | > 18 s | 60 → **5** |
| 4 Figuren, `flooded`, gefiltert | 3,7 → 3,8 | > 10 s | > 6 s | 37 → **5** |
| 40 Figuren, `hills`, ungefiltert | 344,2 → 342,7 | **0,2 s** | **> 18 s** | 60 → **42** |
| 40 Figuren, `flooded`, ungefiltert | 138,4 → 137,9 | **0,5 s** | **> 18 s** | 60 → **36** |
| 40 Figuren, `hills`, gefiltert | 72,2 → 69,4 | **0,7 s** | **> 18 s** | 60 → **42** |
| 40 Figuren, `flooded`, gefiltert | 29,6 → 28,6 | **1,9 s** | **> 18 s** | 60 → **36** |

Lesehilfe: „Zeilen/s Eingang" ist **unverändert** — die Meldungen kommen
weiterhin, sie werden nur nicht mehr zu beliebig vielen Zeilen. Der Zufluss ist
die Ursache, die Zeilen waren das Symptom. Im härtesten Fall (40 Figuren,
`hills`, ungefiltert) gingen nach dem Einsetzen noch **10 282 − ≈4 100 ≈ 6 100**
Meldungen durch dasselbe Protokoll, ohne die Vorrangzeile zu verdrängen (aus
der gemessenen Rate abgeleitet, nicht einzeln gezählt).

**Zahlen statt „> Laufzeit":** Die Überlebensdauer hängt NACHHER nur noch an den
Vorrangmeldungen, nicht mehr an der Anzeige. Woertlich gemessen
(`tests/hud-vorrang.test.js`): **200** Anzeigemeldungen mit gleichem Text,
**200** mit verschiedenen Texten und **200** nach einer Ablehnungsbegründung
lassen die Meldung stehen. Das Anzeigebudget ist bei **40** Zeilen gedeckelt,
sobald 20 Vorrangmeldungen anstehen (500 Anzeigemeldungen → 40 Zeilen, keine der
20 verdrängt), das Vorrangbudget bei **20** (100 Fehlermeldungen → 20 Zeilen).

---

## 7 Offene Punkte (benannt statt verschwiegen)

1. **Die fünf Aufrufstellen in `src/client/main.js` müssen den Ton setzen.**
   Die Mechanik steht; solange die fünf Stellen `neutral` schreiben, nützt sie
   dort nichts. Sie liegen NICHT in diesem Auftrag (andere Hand) — die
   Schnittstelle steht in §3. Danach sollte ein Test (oder ein
   Quelltext-Wächter) festhalten, dass keine Ablehnungsbegründung mehr mit dem
   Vorgabeton geschrieben wird; das ist bewusst NICHT hier gebaut, weil ein
   solcher Wächter in `main.js` greift und rot wäre, bis die Hand dort war.
2. **Per-Takt-Meldungen als Zuflussproblem.** Auf `flooded` melden `damage`,
   `entity_in_water` und `drowning` je Simulationsschritt; sie sind vom
   Sendefilter absichtlich NICHT gedrosselt (Entscheidung über Spielinformation,
   siehe Commit `473bb5a`). Der Vorrang fängt das ab (sie sind `danger` und
   füllen nur ihr eigenes Budget), aber die Ursache bleibt der Ereigniskanal —
   nicht das Protokoll.
3. **Nebenbefund, hier mitbehoben:** Der `Hud`-Konstruktor nahm ein
   `documentRef`, die Render-Methoden lasen aber den GLOBALEN `document`
   (`#renderRoster`, `#renderWeapons`, `#logItem`, `document.activeElement`).
   Im Browser folgenlos (`Main` übergibt genau dieses Dokument) — außerhalb des
   Browsers machte es das HUD unprüfbar. Jetzt kommt alles aus `#document`.
4. **`check:docs` ist rot — nicht durch diese Arbeit, aber durch neue
   Testdateien:** `README.md` nennt 103 Testdateien, im Baum liegen 105 (diese
   Datei brachte eine davon, eine weitere kam parallel von anderer Hand). Die
   Zahl gehört in `README.md` nachgezogen (nicht in diesem Auftrag: `README.md`
   gehört nicht zu den Dateien dieses Auftrags).
