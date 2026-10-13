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

- [x] `engine/shooting.js` und (erweitertes) `engine/stateSnapshot.js` existieren
      — belegt 2026-10-13: `wc -l src/engine/shooting.js src/engine/stateSnapshot.js` → 746 und 310 Zeilen, beide vorhanden.
- [x] `rg -n '\bthis\b' src/engine/stateSnapshot.js src/engine/shooting.js` → nur
      Parameter-Zugriffe, kein `this` (dieselbe Regel wie in Schritt 3)
      — belegt 2026-10-13: `rg -n '\bthis\b' src/engine/stateSnapshot.js src/engine/shooting.js` → keine Treffer (0 in beiden Dateien).
- [ ] `npm test` **983/983** (Zahl und Ergebnis identisch zu vorher)
      — nicht erfüllt/überholt (geprüft 2026-10-13): Istwert `npm test` → 1281/1281 grün, 0 rot (`node --test tests/*.test.js`), Ziel war die Zahl 983. Die Zahl ist überholt, weil seither Tests hinzukamen (`MASTERDOTO.md`: „Die Zahl ist seither sechsmal gewachsen (983 → 1122 → …)“). Das Ergebnis (alles grün) stimmt. Nicht abgehakt, weil die Zahl im Wortlaut steht.
- [x] Replay: `record` + `play --verify` meldet „exakt reproduzierbar", Hash wie vorher
      — belegt 2026-10-13: `npm run replay -- record --out=artifacts/replay-verify.json` + `play … --verify` → „VERIFY: Replay ist exakt reproduzierbar.“, Hash de0b6889 (mit Sprung und Abwurf); ohne (`--no-jump --no-drop`) Hash 8f5575a6, ebenfalls reproduzierbar. „Hash wie vorher“ ist nicht belegbar: der Hash VOR der Zerlegung ist nirgends dokumentiert, und die Aufzeichnung hat sich seit O8 geändert.
- [x] `runtime-smoke` 10/10
      — belegt 2026-10-13: `npx playwright test tests/e2e/runtime-smoke.spec.mjs` → 10 passed.
- [x] `match.js` unter 3.200 Zeilen (heute 3.499)
      — belegt 2026-10-13: `wc -l src/engine/match.js` → 3129 Zeilen, unter 3.200 (`tests/shooting.test.js:60` „match.js bleibt unter 3200 Zeilen“ grün). Der Ausgangswert „heute 3.499“ im Kriterium ist überholt (MASTERDOTO: 3.196 → 3.091 am 2026-10-01); seither +38 Zeilen, die 3.200er-Grenze hält mit 71 Zeilen Reserve.
- [x] `npm run lint` 0, `npm run check:docs` 0
      — belegt 2026-10-13: `npx eslint .` Exit 0; `node scripts/check-docs.mjs` Exit 0.

## Was NICHT zu tun ist

- Die Ballistik in `src/shared/ballistics.js` anfassen. Sie wird von Zielvorschau,
  Client-Vorhersage, Bot-Planung UND dem Motor gelesen; jede Änderung dort
  verschiebt alle vier gleichzeitig.
- `getState()`-Feldnamen oder -Reihenfolge ändern (siehe Falle oben)
- Die Tests anpassen, damit sie grün werden. Wird ein Test rot, ist der Umbau
  falsch — oder der Test war schon vorher falsch; dann **belegen**, nicht raten.
