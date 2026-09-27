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

- **Die Bahn** `#simulateTurretPath` (`:2088-2153`, 66 Zeilen) — gepinnt, siehe Abschnitt 3.
- **Die Abschussgeschwindigkeit** an zwei Stellen (`:2118`, `:2158`) — gepinnt, siehe
  Abschnitt 4.
- Die vier Namen aus W6 (`#resolveHitscan`, `#launchVector`, `#findMuzzle`, `#playerAt`) —
  unangetastet (`bgworker-todo.json`, Eintrag W6).

---

## 3. Blocker 1: Die Bahn darf `match.js` nicht verlassen

`tests/turret-ballistics.test.js` liest `match.js` **als Text**. Wörtlich (`:232-281`):

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

Daraus folgt zweierlei:

1. **Der Auftragsteil „die Bahn auslagern“ ist nicht ausführbar**, solange dieser Test steht:
   Er sucht die Definition in `match.js` und schneidet ihren Rumpf per Klammerzählung heraus.
   Wandert `#simulateTurretPath` nach `turret.js`, fällt der Test — und zwar zu Recht, denn er
   ist als Wächter genau dafür gebaut.
2. **Fund 1 des Duplikat-Berichts bleibt offen.** Der Bericht schlägt vor, den Pfad
   `integrateStep` aus `src/shared/ballistics.js` benutzen zu lassen („eine Auslagerung, die
   nichts entfernt“ hatte hier ihren Gegner in der Physik). Genau das würde aber die Zeile
   `vy *= drag` aus dem Rumpf **entfernen** — und damit `tests/turret-ballistics.test.js:276`
   rot machen. Die Nachbildung der vier Zeilen steht deshalb weiter in `match.js`. Der
   Rechenweg wurde NICHT angetastet: Der Hash entscheidet, und er ist gleich geblieben.
   *Wer Fund 1 beheben will, muss zuerst den Wächter mitziehen — das ist eine eigene Aufgabe
   und keine Nebenwirkung dieser Zerlegung.*

## 4. Blocker 2: Die Abschussgeschwindigkeit muss zweimal in `match.js` stehen

`tests/reichweite-konsistenz.test.js` liest `match.js` ebenfalls als Text. Wörtlich (`:295-299`):

```js
  const geschwindigkeitsStellen = motor.match(/\* geschwindigkeitsFaktor\(this\.width\)/g) ?? [];
  assert.equal(geschwindigkeitsStellen.length, 2,
    `match.js skaliert an ${geschwindigkeitsStellen.length} Stellen selbst — `
    + 'erwartet sind 2 (Geschütz-Vorschau und Geschoss). Der Spielerschuss geht '
    + 'über launchSpeedMultiplier und muss dort `kartenbreite` mitgeben.');
```

Der Ausdruck, den Fund 5 des Duplikat-Berichts als zeichengleich an `:2118` und `:2158`
benennt, **muss** also in `match.js` bleiben — zweimal. Eine gemeinsame Hilfsfunktion (oder ein
Wert aus `turret.js`) würde die Zahl auf 1 bzw. 0 senken und den Test rot machen. Deshalb:

- In `#simulateTurretPath` (Bahn) steht weiter
  `const speed = kraft * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);`
- In `#spawnTurretProjectile` (Geschoss) steht weiter
  `const speed = schuss.power * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);`
  — und `turretProjectile()` bekommt die fertige `speed` als Wert übergeben.

Beide Stellen tragen jetzt einen Kommentar, der den Grund nennt. **Fund 5 bleibt damit offen**
und ist hier gemeldet statt still „mitgelöst“.

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
