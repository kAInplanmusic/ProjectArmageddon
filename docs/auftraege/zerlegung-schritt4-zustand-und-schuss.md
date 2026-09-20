# Auftrag: Zerlegung Schritt 4 — `engine/stateSnapshot.js` und `engine/shooting.js`

**Abzugeben an:** einen Background-Worker mit Zugriff auf dieses Repository.
**Voraussetzung:** Schritte 1–3 erledigt (`c1cafb6`, `7628d05`; Schritt 3 siehe
`docs/auftraege/zerlegung-schritt3-ereignisse.md`). Der Auftrag ist selbsttragend.

## Warum

`src/engine/match.js` ist 3.499 Zeilen lang und trägt 73 Methoden. Zwei davon sind
so groß, dass sie einzeln gelesen und geprüft werden müssen — und beide sind
**risikoreich**, weil sie den Spielzustand verändern (`fire`) oder vollständig
darstellen (`getState`).

## Ist-Stand (gemessen 2026-09-20, nach Schritt 1 und 2)

| Methode | Zeilen | Spanne | private Zugriffe | `this` |
|---|---|---|---|---|
| `getState()` | 149 | `[3249–3397]` | **39** | 49 |
| `fire()` | 211 | `[1459–1669]` | **32** | 36 |
| `spawnPlayers()` | 96 | `[962–1057]` | 16 | 22 |
| `buildTerrain()` | 89 | `[762–850]` | 14 | 29 |

Zum Vergleich: `stateHash()` hatte **einen** privaten Zugriff und ist deshalb in
Schritt 2 sauber ausgezogen worden. Hier sind es 39 bzw. 32 — das ist kein
Nebenbei-Auftrag, sondern der Grund, warum er einen eigenen Durchgang hat.

## Auftrag 4a (kleiner, zuerst): `getState()` → `engine/stateSnapshot.js`

**Ziel:** `getState()` wird eine reine Funktion `baueAnsichtszustand(quelle)` in
`engine/stateSnapshot.js` — dieselbe Datei, in der `hashState(state)` seit
Schritt 2 liegt. Die Methode in `match.js` bleibt als Delegator:

```js
getState() { return baueAnsichtszustand(this.#zustandsQuelle()); }
```

`#zustandsQuelle()` sammelt die Werte, die `getState()` wirklich liest (Spieler,
Welt, Status, Mahlstrom-Zustand, Rundenzähler …). Jeder Eintrag dort ist eine
bewusste Kopplungs-Entscheidung.

**Warum das lohnt:** `getState()` ist der Vertrag zum Client UND zum `stateHash()`.
Als reine Funktion lässt er sich gegen feste Eingaben prüfen — heute kann man ihn
nur mit einem laufenden Match testen.

**Falle:** `getState()` liefert ein Objekt, das der Client und `hashState()`
weiterverwenden. Ändere **keine** Feldnamen und **keine** Feldreihenfolge —
`hashState()` hasht die Reihenfolge mit, ein Umsortieren ändert den Zustandshash
und damit die Determinismus-Prüfung.

## Auftrag 4b (größer, danach): `fire()` → `engine/shooting.js`

**Ziel:** `fire()` (211 Zeilen) in `engine/shooting.js` zerlegen, entlang der
Abschnitte, die heute schon als Kommentarblöcke dastehen:

- Abschussvorbereitung (Winkel/Kraft → Geschwindigkeit, `#resolveStrike`,
  `#findMuzzle`)
- Geschoß-Erzeugung (die Komponentenliste — hier stehen `pierce`, `homing`,
  `fuseTicks`, `lifetime`)
- Munition/Nachladezeit (`#applyCooldown`)
- Ereignis und Rückgabe

**Warum das lohnt:** Diese 211 Zeilen sind die heißeste Stelle des Motors (jeder
Schuss), und die Abschnitte sind schon benannt. Nach dem Auszug ist jede Stufe
einzeln prüfbar.

**Falle:** `fire()` ist **nicht** rein — es setzt Komponenten, zieht Munition ab,
setzt Nachladezeiten und emittiert Ereignisse. Der Auszug muss die Seiteneffekte
explizit machen (Rückgabewerte statt versteckter Zugriffe), sonst wird die Bahn
nicht mehr reproduzierbar.

## Belegweg (zwingend, vor UND nach JEDEM Teilschritt)

```bash
npm test                                    # 983/983 — MUSS identisch bleiben
npm run lint                                # 0
npm run check:docs                          # 0 Abweichungen
node scripts/replay.mjs record              # Zustandshash notieren
node scripts/replay.mjs play <datei> --verify   # „exakt reproduzierbar"
npx playwright test tests/e2e/runtime-smoke.spec.mjs --reporter=line   # 10/10
```

Der Replay-Hash ist der **entscheidende** Beleg: Er ändert sich, sobald sich die
Simulation auch nur minimal anders verhält. `tests/replay.test.js` und die
Determinismus-Tests in `npm test` prüfen dasselbe, aber die Replay-Datei ist der
Ende-zu-Ende-Beweis.

## Abnahmekriterien

- [ ] `engine/shooting.js` und (erweitertes) `engine/stateSnapshot.js` existieren
- [ ] `rg -n '\bthis\b' src/engine/stateSnapshot.js src/engine/shooting.js` → nur
      Parameter-Zugriffe, kein `this` (dieselbe Regel wie in Schritt 3)
- [ ] `npm test` **983/983** (Zahl und Ergebnis identisch zu vorher)
- [ ] Replay: `record` + `play --verify` meldet „exakt reproduzierbar", Hash wie vorher
- [ ] `runtime-smoke` 10/10
- [ ] `match.js` unter 3.200 Zeilen (heute 3.499)
- [ ] `npm run lint` 0, `npm run check:docs` 0

## Was NICHT zu tun ist

- Die Ballistik in `src/shared/ballistics.js` anfassen. Sie wird von Zielvorschau,
  Client-Vorhersage, Bot-Planung UND dem Motor gelesen; jede Änderung dort
  verschiebt alle vier gleichzeitig.
- `getState()`-Feldnamen oder -Reihenfolge ändern (siehe Falle oben)
- Die Tests anpassen, damit sie grün werden. Wird ein Test rot, ist der Umbau
  falsch — oder der Test war schon vorher falsch; dann **belegen**, nicht raten.
