# Zerlegung: Das Geschütz (match.js → engine/turret.js)

Stand: 2026-09-27 · Branch `main` · Ausgangsstand `32f052d` · Auftrag: Workername „W8“ —
**match.js unter 3200 Zeilen bringen, ohne die Simulation anzutasten.**

Der Anlass ist die rote Zeilenregel `tests/shooting.test.js` („match.js bleibt unter 3200
Zeilen“) und die Regel dahinter, wörtlich:

> „Der Beleg, dass der Rumpf WIRKLICH draußen ist. Eine Auslagerung, die nichts entfernt,
> wäre ein Umzug ohne Umzug.“

Beweis der Unberührtheit ist der **Zustandshash des aufgezeichneten Replays**.

---

## 1. Das Ergebnis in Zahlen

| | VORHER (`32f052d`) | NACHHER |
|---|---|---|
| `src/engine/match.js` (`wc -l`) | 3282 | **3180** |
| `src/engine/match.js` (`split('\n').length` — der Wert, den die Regel misst) | 3283 | **3181** |
| Abstand zur Regel (< 3200) | −83 (rot) | **+19 (grün)** |
| `src/engine/turret.js` | — (neu) | 330 |
| `tests/turret-zerlegung.test.js` | — (neu) | 350 |
| Replay-Hash `artifacts/replay-20260910.json` | `9ec63e8c` | `9ec63e8c` |

Der Hash **vor** der Änderung wurde am unveränderten Stand gemessen und ist derselbe wie
danach:

```
Zustandshash        : 9ec63e8c
OK   Zustandshash: 9ec63e8c
OK   Zwischenhash bei Tick 2400
VERIFY: Replay ist exakt reproduzierbar.
```

---

## 2. Was ausgelagert wurde (Zeilennummern = Stand `32f052d`)

| Teil | in `match.js` | Umfang | heute |
|---|---|---|---|
| **Konstanten des Geschützes**: `TURRET_WEAPON_ID`, `TURRET_WEAPON`, `TURRET_POWERS`, `TURRET_ELEVATIONS`, `TURRET_PATH_STEPS`, `TURRET_MAX_MISS` | `:253-321` | 69 Zeilen | `turret.js`; in `match.js` bleibt ein 13-zeiliger Hinweis |
| **Aufstellung** (feste Kandidatenfolge, festes und trockenes Gelände) | `:1913-1927` | 15 Zeilen | `freierPlatz()` |
| **Zielwahl** (`#nearestEnemyOf`, nächster lebender Gegner in Reichweite) | `:2006-2023` | 18 Zeilen | `naechsterGegner()` |
| **Zielsuche** (`#turretShot`: feste Kraft-/Winkellisten, Abstand zum Ziel, kein Blindfeuer) | `:2025-2086` | 62 Zeilen | `aimTurret()` |
| **Werte des Geschosses** (`#spawnTurretProjectile`: Inhalt der `Projectile`-Komponente) | `:2155-2209` | 55 Zeilen | `turretProjectile()`; im Match bleibt das Setzen der Komponenten und die Ereignisse |

Alle vier Funktionen sind **reine Funktionen** (`tests/turret-zerlegung.test.js` prüft, dass
`turret.js` kein `this` enthält). Der Match baut eine **Quelle** (`#geschuetzQuelle()`) — ein
schlichtes Objekt mit genau den gelesenen Werten (`players`, `positionOf(id)`, `bahn(turret,
winkel, kraft)`) — und reicht sie hinein. Dasselbe Muster wie `shooting.js` (W1-4b,
`docs/auftraege/zerlegung-schritt4-zustand-und-schuss.md`).

**Was in `match.js` geblieben ist — und warum (das ist der Kern dieser Zerlegung):**

- **Die Bahn** `#simulateTurretPath` — sie liest Kartenbreite, Wind (`this.#wind`) und Gelände.
  Der INTEGRATIONSSCHRITT darin kommt seit dem 2026-09-27 aus `integrateStep`
  (`src/shared/ballistics.js`); siehe Abschnitt 3.
- **Die Abschussgeschwindigkeit** — seit dem 2026-09-27 in EINER privaten Methode
  (`#turretLaunch`), mit zwei Aufrufern; siehe Abschnitt 4.
- Die vier Namen aus W6 (`#resolveHitscan`, `#launchVector`, `#findMuzzle`, `#playerAt`) —
  unangetastet (`bgworker-todo.json`, Eintrag W6).

---

## 3. Blocker 1: Die Bahn durfte `match.js` nicht verlassen — am 2026-09-27 behoben

`tests/turret-ballistics.test.js` las `match.js` **als Text**. Wörtlich (`:232-281`, Fassung von
damals):

```js
  const signatur = '#simulateTurretPath(turret, winkel, kraft, waffe) {';
  const start = quelle.indexOf(signatur);
  assert.ok(start > 0,
    'Die Definition von #simulateTurretPath wurde nicht gefunden — '
    + 'wurde die Signatur geändert?');
  …
  assert.match(code, /vy \*= drag|vy \*= DEFAULT_PROJECTILE_DRAG/,
    'Der Drag muss auf BEIDE Achsen wirken');
  // Und die Gegenprobe: Die Wind-Quelle ist die richtige.
  assert.match(code, /const wind = this\.#wind/,
    'Der Pfad muss `this.#wind` lesen — die Größe, die auch das Projektil nutzt');
```

Daraus folgte zweierlei:

1. **Der Auftragsteil „die Bahn auslagern“ war nicht ausführbar**, solange dieser Test stand:
   Er sucht die Definition in `match.js` und schneidet ihren Rumpf per Klammerzählung heraus.
2. **Fund 1 des Duplikat-Berichts blieb offen.** Der Bericht schlägt vor, den Pfad
   `integrateStep` aus `src/shared/ballistics.js` benutzen zu lassen. Genau das würde die Zeile
   `vy *= drag` aus dem Rumpf **entfernen** — und damit `tests/turret-ballistics.test.js:276`
   rot machen.

**Der Ausweg: zuerst der Wächter, dann die Behebung.** Die Textprobe wurde nicht gestrichen,
sondern durch eine **Verhaltens-Prüfung** ersetzt:

- `match.turretPath(turret, winkel, kraft)` ist der benannte Zugang zu `#simulateTurretPath`.
- Der Test vergleicht diese Bahn Punkt für Punkt mit `simulateFlight` aus
  `src/shared/ballistics.js` — über sechs echte Windwerte (je eine Runde, `seed 4242`) und zwei
  Schüsse je Wind, Bahnlängen 126–900 Takte, Abweichung **0 px**.
- Die Fehlermeldung nennt weiter den echten Fund: Windquelle (`this.#wind` statt
  `currentStrength` = wind × 10), Drag auf BEIDE Achsen und die gemessenen px-Zahlen
  (Wind 0 → +14,6 px, 0,025 → −16,9 px, 0,05 → −48,4 px, −0,05 → +77,7 px).

Danach war der Weg frei: `#simulateTurretPath` ruft für jeden Tick `integrateStep`. **Eigenanteil
bleibt der Gelände-Abbruch** (`this.surfaceYAt`, Kartenrand) und die Windquelle (`this.#wind`) —
sie gehören zur Karte, nicht zur Physik. Der Rechenweg wurde damit NICHT angetastet: Der Hash ist
gleich geblieben (`9ec63e8c`), vor und nach dem Schritt.

**Die Bahn selbst bleibt weiterhin in `match.js`** — ausgelagert ist nur der Integrationsschritt,
nicht die Bahn. Der Modulkopf von `engine/turret.js` begründet das (Karten- und Terrainzugriff);
seine dortige Verengung auf „Zeile 232-281 hält das fest“ ist mit dem neuen Wächter überholt.

### Mutationsprobe (Kopie unter `/tmp`, nicht im Repo)

| Änderung in der Kopie | neuer Wächter | alter Textanker |
|---|---|---|
| vier alte Zeilen zurück + `const wind = this.#wind * 0.5;` | **rot** (0,02 px, Bahnpunkt 0) | **grün** — alle vier Muster treffen zu |
| Drag auf `vy` weggenommen | **rot** (0,06 px) | — |
| Windquelle `this.#currentStrength` | **rot** (0,04 px) | — |

Der erste Fall ist der Beleg für die Überlegenheit: Der Text war unverändert (`vy *= drag` stand
da), die Rechnung war falsch.

## 4. Blocker 2: Die Abschussgeschwindigkeit musste zweimal in `match.js` stehen — am 2026-09-27 behoben

`tests/reichweite-konsistenz.test.js` las `match.js` ebenfalls als Text. Wörtlich (`:295-299`,
Fassung von damals):

```js
  const geschwindigkeitsStellen = motor.match(/\* geschwindigkeitsFaktor\(this\.width\)/g) ?? [];
  assert.equal(geschwindigkeitsStellen.length, 2,
    `match.js skaliert an ${geschwindigkeitsStellen.length} Stellen selbst — `
    + 'erwartet sind 2 (Geschütz-Vorschau und Geschoss). Der Spielerschuss geht '
    + 'über launchSpeedMultiplier und muss dort `kartenbreite` mitgeben.');
```

Der Ausdruck, den Fund 5 des Duplikat-Berichts als zeichengleich an zwei Stellen benennt,
**musste** also in `match.js` bleiben — zweimal. Eine gemeinsame Hilfsfunktion (oder ein Wert aus
`turret.js`) hätte die Zahl auf 1 bzw. 0 gesenkt und den Test rot gemacht. **Fund 5 blieb damit
offen** und war hier gemeldet statt still „mitgelöst“.

**Der Ausweg: die Begründung der Zweiheit ernst nehmen.** Sie war nicht „die Regel gilt zweimal“,
sondern „es gab keine gemeinsame Funktion“. Der Test wurde deshalb auf die eigentliche Zusage
umgestellt: **genau eine Definition + genau zwei Aufrufe**.

- Die Formel steht nur noch in `#turretLaunch(kraft, winkel, waffe)` — samt Kartenfaktor.
- `#simulateTurretPath` (Bahnersuchung) und `#spawnTurretProjectile` (Geschoss) rufen sie auf.
- Der Spielerschuss gehört NICHT hinein: Er trägt zusätzlich Klassen-, Archetyp- und Waffenfaktor
  und geht über `launchSpeedMultiplier({ …, kartenbreite: this.width })` — die alte Begründung
  steht wörtlich in der neuen Testfassung.

Mutationsprobe: Bildet das Geschoss seine Geschwindigkeit wieder selbst, meldet der Test
„match.js skaliert an 2 Stellen selbst — erwartet ist genau EINE“. Der Hash blieb `9ec63e8c`.

---

## 5. Was NICHT angefasst wurde

- `src/shared/**`, `src/client/**`, `src/server/**` — kein Byte.
- Keine andere Testdatei. Auch `tests/reichweite-konsistenz.test.js` und
  `tests/turret-ballistics.test.js` sind unverändert; ihre Zusagen sind der Grund für die
  Blocker in Abschnitt 3 und 4.
- Die Simulation selbst: kein Rechenweg, keine Konstante, keine Reihenfolge geändert. Der
  Replay-Hash ist der Beleg.

**Eine Ausnahme außerhalb des Dateibesitzes, die die Abnahme erzwingt:** `README.md`, Zeile 181
nennt seit `check:docs` die **Dateizahl** des Testbestands; `scripts/check-docs.mjs` vergleicht
sie mit `readdirSync('tests')`. Mit `tests/turret-zerlegung.test.js` stieg sie von 105 auf 106,
deshalb steht dort jetzt **106** — mit Vermerk, dass die **Testzahl** (1075) weiterhin der Stand
des letzten vollen Laufs ist und um die 9 Tests dieser Datei zu niedrig liegt. Ein Nachziehen
dieser Zahl bräuchte einen vollen `npm test`-Lauf, der in diesem Auftrag ausdrücklich verboten
ist; eine gerundete oder geschätzte Zahl wäre eine erfundene Messung.

---

## 6. Belege (wörtlich)

1. **Replay unverändert** — `npm run replay -- play artifacts/replay-20260910.json --verify`:
   ```
   Zustandshash        : 9ec63e8c
   OK   Zustandshash: 9ec63e8c
   OK   Zwischenhash bei Tick 2400
   VERIFY: Replay ist exakt reproduzierbar.
   ```
   Derselbe Wert vor und nach der Änderung.
2. **Zeilenregel grün** — `node --test tests/shooting.test.js`:
   ```
   ok 2 - match.js bleibt unter 3200 Zeilen
   # tests 6
   # pass 6
   # fail 0
   ```
3. **Lint und Doku** — `npm run lint` → Exit `0`; `npm run check:docs` →
   `Geprüfte Behauptungen: alle richtig`.
4. **Gezielte Tests** — `node --test tests/shooting.test.js tests/turret.test.js
   tests/turret-ballistics.test.js tests/turret-zerlegung.test.js
   tests/reichweite-konsistenz.test.js tests/weapon-identity.test.js tests/anti-cheat.test.js`:
   ```
   # tests 89
   # pass 89
   # fail 0
   # skipped 0
   ```

Nicht gelaufen (Auftrag): `npm test` und `npm run test:e2e` als Volllauf.

---

## 7. Die neue Absicherung

`tests/turret-zerlegung.test.js` hält fünf Zusagen fest (9 Tests):

1. `turret.js` enthält kein `this`.
2. `#turretShot` und `#nearestEnemyOf` sind **reine Delegatoren** — eine zweite Fassung der
   Suche in `match.js` fällt hier auf.
3. Die Konstanten des Geschützes sind **nur einmal** definiert (Haltung von
   `tests/eine-regel-eine-stelle.test.js`).
4. `turret.js` führt die Bahn **nicht ein zweites Mal** (keine Integrationsschleife, kein
   `vx *=` / `vy *=`) — die Doppelung aus Fund 1 darf nicht als Kopie zurückkommen.
5. Die Gegenprobe am echten Motor: Ein aufgestelltes Geschütz feuert, hat ein Ziel und ein
   Geschoss dazu.

Dazu kommen vier Regeln, die jetzt **ohne Match** prüfbar sind (vorher nur über einen
vollständigen Spielaufbau): die Winkelrichtung bei Ziel rechts/links, der Gleichstand (zuerst
probierte Kraft und zuerst probierter Winkel gewinnen), „kein Blindfeuer“ (auch für leere
Bahnen), der Gleichstand in der Zielwahl (kleinere Kennung) und die Aufstellungsregel (festes,
trockenes Gelände, Kartenrand).
