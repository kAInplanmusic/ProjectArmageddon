# Tote Regeln und irreführende Kommentare — Belege

Arbeit vom 2026-09-27. Zwei Befunde aus `docs/befundregister.md` (A-12, B-4),
beide mit Gegenprobe.

**Anker-Regel:** Fundstellen sind über den NAMEN bzw. den Wortlaut verankert.
Zeilennummern in diesem Dokument sind eine **Momentaufnahme** vom 2026-09-27 und
wandern mit jeder Änderung darüber — wer sie zitiert, zitiert den Namen mit.

---

## Kurzfassung

| Befund | Stand | Beleg |
|---|---|---|
| **A-12** `hasSpecialEffect` zweimal, zwei Regeln | **behoben** — die tote Fassung ist entfernt | 0 Import-Bindungen nachgewiesen; Replay-Hash `9ec63e8c` unverändert; `lint` 0 |
| „89 von 150 Waffen weichen ab“ | **BESTÄTIGT — 89** (nachgerechnet, nicht übernommen) | Schleife über `WEAPONS`, beide Regeln, s. u. |
| **B-4** 22 „Bot-KI“-Kommentare in `src/` | **10 falsch / 12 richtig**; 8 der 10 korrigiert, 2 gemeldet (Datei nicht im Auftrag) | Einzelprüfung unten |
| Zusätzlich gefunden: vier Stellen mit „Bot“ OHNE „-KI“ | 3 korrigiert (davon 1 historisch), 1 begründet **nicht** geändert | unten, Abschnitt „Über den Auftrag hinaus“ |

`npm run lint` → **Exit 0**. `npm run check:docs` → **„alle richtig“**.
Gezielte Tests (17 Dateien, 193 Tests) → **193 bestanden, 0 rot**.
`npm run replay -- play artifacts/replay-20260910.json --verify` → **`9ec63e8c`**,
vorher wie nachher. Kein voller `npm test`-Lauf (parallel schreibende Arbeiter).

---

## A-12 — EINE tote Regel, die zwei verschiedene Antworten gab

### 1. Die zwei Regeln (Namen, nicht Zeilennummern)

| Ort | Wortlaut | Frage |
|---|---|---|
| `src/engine/specials.js` (entfernt) | `return effectFor(weapon?.special) !== null;` | „hat diese Waffe einen **zugeordneten Spezialeffekt**?“ |
| `src/shared/config/weapons.js` (`hasSpecialEffect`) | `return weapon.damage > 0 \|\| SPECIAL_WITHOUT_DAMAGE.includes(weapon.special);` | „ist diese Waffe **spielbar**?“ |

`weapons.js` ist GENERIERT; die Quelle ist `scripts/build-weapon-catalog.mjs`
(dort steht derselbe Rumpf als Vorlagen-Text, `:1206`). Die zweite Fassung stand
in der HANDGESCHRIEBENEN Datei — der Widerspruch war also keine Generator-Frage.

### 2. Der Nachweis „0 Leser“ — über IMPORTE, nicht über Vorkommen

Der Name kommt viermal im Baum vor. „Vorkommen zählen“ ergibt vier Treffer und
übersieht, dass drei davon keine Leser sind. Eine Sonde über `src/`, `tests/`,
`scripts/`, `tools/` sammelt deshalb **Import-Bindungen und Re-Exporte**:

```
--- hasSpecialEffect: 1 Import/Re-Export ---
tests/weapon-audit.test.js  IMPORT  … pickWeaponForRarity, hasSpecialEffect, …  from '../src/shared/config/weapons.js'
--- effectFor: 2 Importe ---
tests/specials.test.js      IMPORT  … buildEffect, elementalEffectFor, effectFor, …
tests/weapon-audit.test.js  IMPORT  effectFor
Property-Zugriffe (potenziell dynamisch): []
```

Ergebnis: **genau EINE** Import-Bindung von `hasSpecialEffect`, und sie zeigt auf
`weapons.js`. Die Fassung in `engine/specials.js` hatte **0** — kein Import in
`src/`, `tests/`, `scripts/` oder `tools/`, kein dynamischer Zugriff
(`specials['hasSpecialEffect']`, Property-Suche: 0 Treffer). Die Datei
`src/engine/specials.js` ist auch **nicht** über ein Barrel (`export *`)
weitergereicht: die einzigen `export *`-Barrels sind `src/shared/index.js`.

Nach der Streichung bleibt in `src/` genau **eine** Definitionsstelle
(`src/shared/config/weapons.js`) — reproduzierbar über die Sonde oder direkt
über `tests/tote-regeln.test.js`.

### 3. `effectFor` ist NICHT der nächste tote Export (geprüft, gepinnt)

`effectFor` war der einzige Grund, aus dem die gestrichene Fassung etwas tat.
Nach der Entfernung hat sie weiterhin Leser:

- **im Code:** `src/engine/specials.js`, in `buildEffect`
  (`const base = effectFor(weapon?.special);`) — der Pfad, über den jede Waffe
  ihre Wirkung bekommt;
- **in Tests:** `tests/specials.test.js` (6 Aufrufe), `tests/weapon-audit.test.js`
  (4 Aufrufe).

`tests/tote-regeln.test.js` hat dafür einen eigenen Test: Er zählt die
Dateien, die `effectFor(` im CODE aufrufen, und verlangt
`['src/engine/specials.js']` — wandert der letzte Leser, wird er rot.

### 4. Die gemeldete Zahl — nachgerechnet

Gemeldet war „bei 89 von 150 Waffen weichen die zwei Regeln ab“, **nicht**
nachgerechnet. Sonde (Schleife über `WEAPONS`, beide Regeln, Zähler):

```
Waffen: 150
Abweichungen: 89 | nurKatalog(A=false,B=true): 89 | nurEffekt(A=true,B=false): 0
Schaden > 0: 143
SPECIAL_WITHOUT_DAMAGE: 34
Beispiele: pa_001/bat_knockback/dmg=28 pa_005/heavy_impact/dmg=42 pa_006/dig/dmg=20 …
```

**Die Zahl stimmt: 89 von 150 (59,3 %).** Die Richtung ist einseitig — es gibt
**keine** Waffe, bei der die Effekt-Regel ja und die Katalog-Regel nein sagt:

- Katalog-Regel sagt für **alle 150** Waffen ja (143 mit `damage > 0`; die 7
  ohne Schaden stehen alle in `SPECIAL_WITHOUT_DAMAGE`, 34 Einträge);
- Effekt-Regel sagt für **61** Waffen ja;
- 150 − 61 = **89** Abweichungen, jede mit Schaden > 0 und einem `special`, dem
  `SPECIAL_EFFECTS` keine Wirkung zuordnet (`bat_knockback`, `heavy_impact`,
  `dig`, `rapid_melee`, `multi_hit`, `direct_hit`, …).

Das ist auch der Grund, warum die Streichung richtig ist und nicht die andere
Fassung: Die Katalog-Regel beantwortet die Frage, die der Leser
(`pickWeaponForRarity`, `spielbar = weapon => hasSpecialEffect(weapon)`) stellt —
„darf diese Waffe in den Zufallspool?“ Die Effekt-Regel hätte dort 89 Waffen
ausgeschlossen, die erreichbar sein sollen.

**Die Zahl steht NICHT als Zusicherung im Test.** Sie hängt am Waffenkatalog und
würde bei jeder Katalog-Erweiterung ohne Aussage rot. `tests/tote-regeln.test.js`
hält stattdessen fest, dass die beiden Fragen VERSCHIEDEN sind — gemessen an
einem erfundenen Spezialnamen (`effectFor('nicht_im_wirkungskatalog') === null`,
`hasSpecialEffect({damage: 10, special: 'nicht_im_wirkungskatalog'}) === true`).

### 5. Beleg, dass die Entfernung nichts ändert

| Prüfung | vorher | nachher |
|---|---|---|
| `npm run replay -- play artifacts/replay-20260910.json --verify` | Zustandshash `9ec63e8c`, „Replay ist exakt reproduzierbar.“ | **`9ec63e8c`**, dieselben fünf OK-Zeilen (Status gameover / Runde 13 / Tick 2440 / Hash / Zwischenhash 2400) |
| `tests/specials.test.js` + `weapon-audit` + `class-loadout` | 65/65 | 65/65 |
| 17 gezielte Testdateien (s. u.) | — | **193/193** |
| `npm run lint` | Exit 0 | Exit 0 |

Verwendet wurde bewusst die **alte** Aufzeichnung `artifacts/replay-20260910.json`
(entstanden 2026-09-10), nicht eine frisch erzeugte: Ein neues `record` prüft nur
Selbstkonsistenz. Die Datei ist vor den Änderungen aufgezeichnet worden — ein
identischer Hash beweist daher den unveränderten Zustandsverlauf.

### 6. Der Wächter gegen die Rückkehr — und sein Wirksamkeitsnachweis

Neu: `tests/tote-regeln.test.js` (5 Tests). Er zählt **Definitionsstellen**, nicht
Werte (die Lehre aus `tests/eine-regel-eine-stelle.test.js`):

1. `hasSpecialEffect` wird in `src/` an genau EINER Stelle definiert
   (`src/shared/config/weapons.js`).
2. In `src/engine/specials.js` steht der Name nicht mehr im CODE (der Kommentar,
   der die Streichung dokumentiert, ist erlaubt — Kommentare fallen vorher weg).
3. Die eine Regel beantwortet die Schaden/Liste-Frage, nicht die Effekt-Frage.
4. `effectFor` hat weiterhin Leser.
5. **Selbstprüfung** des Wächters gegen gekaperten Text: eine zweite Fassung im
   Code wird gefunden; eine AUSKOMMENTIERTE Fassung und eine Re-Export-Naht
   werden NICHT als Definitionsstelle gezählt.

Wirksamkeit bewiesen, nicht behauptet — Mutation in einer **Kopie** des Baums
(`cp -r src tests scripts package.json /tmp/pa-mut`, `node_modules` symlinkt):

```
not ok 1 - hasSpecialEffect wird in src/ an genau EINER Stelle definiert
not ok 2 - Die entfernte Fassung ist nicht als CODE zurueckgekehrt
ok     3, 4, 5
# tests 5 / pass 3 / fail 2
```

Die echte Datei wurde dabei nicht angefasst (parallel arbeitende Kollegen).

### 7. Was an der Stelle stehen blieb

An der gestrichenen Stelle steht kein leerer Raum, sondern ein Grabstein
(Projektkonvention, wie bei `#runBotTurn` in `gameServer.js`): „HIER STAND
`hasSpecialEffect()` — eine ZWEITE Antwort auf dieselbe Frage“, mit der einen
Regel, der Zahl 89, dem Leser-Nachweis und dem Verweis auf den Wächter. Wer in
einem halben Jahr sucht, findet die Entscheidung samt Grund.

---

## B-4 — 22 Kommentare, die sich auf „Bot-KI“ berufen

**Vorbedingung geprüft, nicht geglaubt:** Die Bot-KI existiert wirklich nicht.
Beleg: `git log --diff-filter=D --name-only` zeigt Commit `784a8d5`
(2026-09-20, „fix(server): KEINE BOT-KI — Teams sind Menschen, NPCs sind etwas
anderes“) mit `src/server/bot.js`, `tests/bot-ai.test.js`,
`scripts/check-bots.mjs`. Heute existiert **keine** Bot-Datei
(`ls src/engine/*bot* src/server/*bot* src/shared/*bot*` → nichts), und
`src/server/index.js` (`Kein BotController-Export`) sagt es ausdrücklich.
**`src/server/index.js:33` hat also recht** — der Befund ist nicht dort, sondern
in den Kommentaren, die einen Leser behaupten.

Gezählt wurde über Kommentarzeilen (`*`, `//`, `/*`) in `src/`: **22** Treffer
„Bot-KI“ in 9 Dateien (Momentaufnahme vor der Arbeit; nach der Arbeit 16, weil
6 Nennungen als Phantom-Leser gestrichen wurden und 2 historische hinzukamen).

### Die 10 FALSCHEN — „die Bot-KI liest mit“ (je Stelle geprüft)

Alle zehn behaupten einen **dritten Leser**, der nicht existiert. Geprüft wurde
jeweils durch Suche nach den TATSÄCHLICHEN Lesern der genannten Funktion.

| Stelle (Name/Wortlaut als Anker) | Behauptung | tatsächlicher Leser | Stand |
|---|---|---|---|
| `engine/systems/projectileSystem.js`, Kopf von `DEFAULT_PROJECTILE_GRAVITY/DRAG` | „…aus der die clientseitige Vorhersage, die Zielvorschau des MatchControllers **und die Bot-KI** lesen“ | `shotPrediction.js`, `shooting.js` (Zielvorschau), `match.js`, `turret.js` | **korrigiert** |
| `…projectileSystem.js`, Kommentar über `integrateStep({…})` | „verschiebt auch die Bahn, die die Zielvorschau **und die Bot-KI** vorhersagen“ | dieselben zwei | **korrigiert** |
| `…projectileSystem.js`, Kopf von `#raycast` | „wird von der Vorhersage (Client), der Zielvorschau **und der Bot-KI** mitbenutzt“ | `shooting.js` (`raycastSegment`), `shotPrediction.js` (über `simulateFlight`, das es aufruft) | **korrigiert** |
| `engine/shooting.js`, Kopf von `aimPreview` | „…dieselbe Funktion, die die clientseitige Vorhersage **und die Bot-KI** benutzen“ | `shotPrediction.js`, Tests | **korrigiert** |
| `engine/shooting.js`, Kopf von `muzzlePoint` | „Wer den Schuss vorausberechnen will (**Bot-KI**, Vorhersage, Waffenprüfung)…“ | Zielvorschau, Client-Vorhersage (eine „Waffenprüfung“, die die Mündung nimmt, gibt es **nicht**: `scripts/check-weapon-targeting.mjs` liest nur Katalog + Effekte) | **korrigiert** |
| `engine/match.js`, Kommentar über `POWER_TO_SPEED`/`BASE_HEALTH` | „Motor, Zielvorschau, clientseitige Vorhersage **und Bot-KI** lesen dieselbe Konstante“ | `ballistics.js` (Quelle), `match.js`, `shotPrediction.js` | **korrigiert** |
| `engine/match.js`, Kopf von `aimPreview()` | „dieselbe Funktion, die die clientseitige Vorhersage **und die Bot-KI** benutzen“ | `shooting.js`, `shotPrediction.js` | **korrigiert** |
| `shared/launchSpeed.js`, Modulkopf | „und — beim Umbau der Bot-KI — **gebraucht vom Server**“ | **Der Server liest `launchSpeedMultiplier` überhaupt nicht** (`grep -rn launchSpeed src/server/` → 0 Treffer). Leser heute: `match.js` (`#launchVector`) und der Client (`main.js` über die Naht in `shotPrediction.js`) | **korrigiert** |
| `client/shotPrediction.js`, Modulkopf („Rechenweg“) | „…(`ProjectileSystem`), die Zielvorschau des MatchControllers **und die Bot-KI** lesen“ | Motor + Vorhersage | **NICHT angefasst — `src/client/**` lag nicht im Auftrag** → gemeldet |
| `client/shotPrediction.js`, Kommentar über dem Re-Export von `launchSpeedMultiplier` | „weil ihn **die Bot-KI (Server)** und der Motor ebenso brauchen“ | Motor + Client | **NICHT angefasst** → gemeldet |

Dieselbe Falschaussage steht ein elftes Mal in `tests/shot-prediction.test.js`
(„…Bot-KI lesen dieselben Zahlen“) — Testdateien lagen nicht im Auftrag, ebenfalls
gemeldet.

### Die 12 RICHTIGEN — bestätigt, nicht angefasst

Diese behaupten nicht die Existenz der Bot-KI, sondern ihr **Fehlen** — und das
ist wahr (Beleg oben):

| Stelle | Aussage | Stand |
|---|---|---|
| `server/index.js`, über den Exporten | „Kein `BotController`-Export: Es gibt keine Bot-KI.“ | **BESTÄTIGT** — die Referenzaussage des Befunds |
| `server/gameServer.js`, Kommentar statt `import` | „KEIN Bot-Import. Es gibt keine Bot-KI“ | **BESTÄTIGT** (7 Nennungen im Server) |
| `server/gameServer.js`, Kopf von `laeuft` | „seit es keine Bot-KI gibt…“ | **BESTÄTIGT** |
| `server/gameServer.js`, Grabstein `#runBotTurn` | „HIER STAND `#runBotTurn()` … ENTFERNT (2026-09-20)“ | **BESTÄTIGT** — deckt sich mit Commit `784a8d5` |
| `server/gameServer.js`, Feld `laeuft` im Beitritts-Payload | „Es gibt keine Bot-KI: Bis jedes Team einen verbundenen Menschen hat, läuft nichts.“ | **BESTÄTIGT** |
| `server/gameServer.js`, Wiederverbindung aus der Sicherung | „für leere Plätze springt niemand ein: Es gibt keine Bot-KI“ | **BESTÄTIGT** |
| `server/gameServer.js`, `alleTeamsBesetzt`-Prüfung | „Vorher lief sie sofort, und der Server-Bot spielte die freien Teams.“ | **BESTÄTIGT** (Vergangenheit, korrekt datiert) |
| `server/gameServer.js`, `join` einer `LobbySession` | „Startet erst, wenn ALLE Teams besetzt sind … Vorher füllte der Bot solche Teams.“ | **BESTÄTIGT** |
| `server/lobby.js`, Modulkopf | „**Es gibt KEINE Bot-KI.** Teams werden ausschließlich von Menschen gespielt“ | **BESTÄTIGT** |
| `server/lobby.js`, `disconnect` | „Für seine Züge springt NIEMAND ein: Es gibt keine Bot-KI.“ | **BESTÄTIGT** |
| `client/main.js`, Wartemeldung (Kommentar) | „Es gibt keine Bot-KI: Ein unbesetztes Team bleibt leer…“ | **BESTÄTIGT** |
| `client/main.js`, Nutzertext `'es gibt keine Bot-KI, jedes Team braucht einen Menschen.'` | sichtbare Meldung | **BESTÄTIGT** — deckt sich mit `gameServer`-Fehlertext und `tests/server-integration.test.js` |

### Über den Auftrag hinaus: vier Stellen mit „Bot“ OHNE „-KI“

Die 22 waren über die Zeichenfolge „Bot-KI“ gefunden. Wer nur die sucht,
übersieht die teuerste Sorte: dieselbe Falschaussage ohne das Wort. Gefunden über
alle **Kommentarzeilen** in `src/` mit `\bBot` (**29** nach der Arbeit):

| Stelle | Wortlaut (vorher) | Urteil | Stand |
|---|---|---|---|
| `shared/ballistics.js`, Punkt 2 der „Hier steht deshalb“-Liste | „Dieselbe Abtastung nutzt der Motor (`ProjectileSystem`) und die Vorausberechnung (**Bot**, Vorhersage).“ | FALSCH — der Bot nutzt die Abtastung nicht (es gibt ihn nicht) | **korrigiert** zu „(`ProjectileSystem`), die Zielvorschau und die Client-Vorhersage“ |
| `shared/launchSpeed.js`, Abschnitt „Warum die Karte hier hineingehört (FUND 2026-09-19)“ | „…an jeder Aufrufstelle: im Motor, **im Bot** und in der Client-Vorhersage.“ | zum Zeitpunkt des FUND richtig, ohne Zeitmarke heute irreführend | **korrigiert** — Zeitmarke „Der Bot ist am 2026-09-20 mit der Bot-KI entfallen; Aufrufstellen sind heute der Motor und der Client.“ |
| `engine/shooting.js`, `projectileLifetime`-Kopf (FUND „Der Bot plante Bögen mit 83 Ticks…“) | „…**Der Bot** plante Bögen…“ | historischer, echter Messwert — aber ohne Hinweis, dass das Subjekt entfallen ist | **korrigiert** — FUND-Klammer trägt jetzt „gemessen mit dem damaligen Server-Bot — die Bot-KI ist am 2026-09-20 entfallen“ |
| `shared/ballistics.js`, Punkt 3 derselben Liste | „Sie ist die „Wahrheit“ für Vorhersage und **KI**: `FORMEL = Startpunkt, SIMULATION = Wahrheit, SCORE = Auswahl` (Recherche, Punkt 4.3).“ | **bewusst NICHT geändert** | Es ist ein **Zitat** der Architektur-Empfehlung aus `docs/recherche/npc-ki.md` (dort Punkt 3: „Formel = Startpunkt, Simulation = Wahrheit. Das ist die zentrale Architektur-Idee.“). Der Satz beschreibt eine Entwurfsabsicht mit Quellenangabe, keinen laufenden Leser. Änderung wäre eine Inhaltsentscheidung, keine Wortkorrektur — hier nicht im Auftrag. |

Nebenbei bemerkt, **nicht** Teil dieses Auftrags: Der Zitatverweis „(Recherche,
Punkt 4.3)“ zeigt auf eine Liste, deren zitierter Satz in `npc-ki.md` der dritte
Punkt ist — die Abschnittsnummer wurde nicht nachgeprüft.

---

## Geänderte Dateien

| Datei | Art der Änderung |
|---|---|
| `src/engine/specials.js` | **Code:** die tote `hasSpecialEffect`-Fassung entfernt (Grabstein-Kommentar statt dessen) |
| `src/engine/shooting.js` | nur Kommentare (2 Stellen B-4 + FUND-Zeitmarke) |
| `src/engine/match.js` | nur Kommentare (2 Stellen B-4); Datei bleibt bei **3195** Zeilen (Budget < 3200, `tests/shooting.test.js`) |
| `src/engine/systems/projectileSystem.js` | nur Kommentare (3 Stellen B-4) |
| `src/shared/launchSpeed.js` | nur Kommentare (2 Stellen B-4, 1 Zeitmarke) |
| `src/shared/ballistics.js` | nur Kommentar (1 Stelle „Bot“) — **außerhalb der 22, s. o.** |
| `tests/tote-regeln.test.js` | **neu**, 5 Tests (Wächter + Selbstprüfung) |
| `README.md` | Testdatei-Zahl 111 → 112 (Folge der neuen Testdatei; `npm run check:docs` vergleicht diese Zahl gegen die Wirklichkeit) |
| `docs/tote-regeln.md` | diese Datei |

Die drei Dateien `src/client/**` und `src/server/**` wurden **nicht** angefasst —
die vier dort verbliebenen Falschaussagen (2× `shotPrediction.js`, 1×
`tests/shot-prediction.test.js`; die Server-Nennungen sind alle BESTÄTIGT) sind
gemeldet, nicht stillschweigend mitgelöst.

## Nachgemessene Zahlen (dieser Auftrag)

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Import-Bindungen `hasSpecialEffect` nach `engine/specials.js` | Import-Sonde | **0** |
| Definitionsstellen `hasSpecialEffect` in `src/` danach | `tests/tote-regeln.test.js` | **1** (`shared/config/weapons.js`) |
| Leser `effectFor` im Code | `tests/tote-regeln.test.js` | **1 Datei** (`engine/specials.js`) |
| Abweichungen der zwei Regeln | Sonde über `WEAPONS` | **89 von 150** (59,3 %), einseitig |
| Replay-Zustandshash | `play artifacts/replay-20260910.json --verify` | **`9ec63e8c`** vorher = nachher |
| Gezielte Tests | `node --test <17 Dateien>` | **193/193** |
| `npm run lint` | — | **Exit 0** |
| `npm run check:docs` | — | **„alle richtig“** |
| Mutationsprobe des Wächters | Kopie unter `/tmp/pa-mut` | **2 Tests rot** (Wächter greift) |

## Belegpflicht: was NICHT geprüft wurde

- **Kein voller `npm test`-Lauf** (Auftrag) und **kein E2E-Lauf** — die
  Testzahl 1122 im README ist der Stand eines früheren Laufs; diese Arbeit fügt 5
  Tests hinzu, ohne die Gesamtzahl nachzumessen. Nachgemessen wurde nur die
  **Dateizahl** (112).
- **`src/client/**` und `src/server/**` nicht angefasst und deren Kommentare nur
  gelesen, nicht in ihrem Laufzeitverhalten geprüft** — die Bot-Freiheit des
  Servers ist über Dateiliste, Importe und Grabsteine belegt, nicht über einen
  neuen Serverlauf.
- **Der Audit-Detektor selbst** (`tools/audit-mcp/lib/statisch.mjs`,
  `unbenutzteExporte` / `doppelregeln`) wurde **gelesen, nicht geändert**: Die
  Blindheit gegen die zweite Fassung ist belegt (er zählt Vorkommen des Namens in
  `alleTexte`, und `doppelregeln` sucht nur `const NAME =` in GROSSBUCHSTABEN —
  eine `function`-Definition sieht er gar nicht). Ob er korrigiert werden soll,
  ist eine Werkzeug-Entscheidung und nicht in diesem Auftrag getroffen.
- **Die Zeilennummern** in `docs/audit-arch-grenzen.md` (§4.3, §5.1),
  `docs/befundregister.md` (A-12, B-4) und `docs/duplikate-bericht.md` sind
  Momentaufnahmen und jetzt teils verschoben; diese Dateien lagen nicht im
  Auftrag und wurden **nicht** nachgezogen. A-12 ist inhaltlich erledigt
  (die tote Fassung existiert nicht mehr), B-4 zur Hälfte (8 von 10 korrigiert).
