# Auftrag: Zerlegung Schritt 3 — `client/ereignisse.js`

**Abzugeben an:** einen Background-Worker (Agent oder Mensch) mit Zugriff auf dieses
Repository. **Voraussetzung:** Schritte 1 und 2 sind erledigt (Commits `c1cafb6`,
`7628d05`). Der Auftrag ist selbsttragend — er braucht keine Vorgeschichte.

## Warum

`src/client/main.js` ist 3.538 Zeilen lang und enthält **zwei** Schalter über
dieselben Engine-Ereignisse: einen für das lokale Match, einen für den
Online-Betrieb. Sie sind 229 und 142 Zeilen lang, behandeln dieselben Ereignisarten
und sind schon einmal auseinandergelaufen (ein Ereignis war nur im Online-Zweig
behandelt). `tests/event-coverage.test.js` prüft heute, dass JEDES Engine-Ereignis
in mindestens einem Zweig behandelt wird — dieses Wissen steckt in zwei `switch`-
Blöcken statt in einer Zuordnungstabelle.

## Ist-Stand (gemessen 2026-09-20, nach Schritt 1 und 2)

| Methode | Zeilen | Spanne | private Zugriffe | `this` |
|---|---|---|---|---|
| `handleEvents()` | 229 | `[1463–1691]` | **19** | 55 |
| `handleRemoteEvent()` | 142 | `[1154–1295]` | **10** | 39 |

Zum Vergleich der bereits erledigte Schritt 1 (`#exposeDebugApi`): 0 private
Zugriffe. **Dieser Auftrag ist also NICHT mechanisch** — die privaten Zugriffe
müssen bewusst übergeben werden.

## Ziel

Neu: `src/client/ereignisse.js` mit **einer** Zuordnungstabelle
`EREIGNIS_WIRKUNGEN` (Ereignisart → Funktion `(kontext, nutzlast) => void`) und
zwei Einstiegspunkten:

```js
export function verarbeiteLokal(kontext, ereignis) { … }
export function verarbeiteOnline(kontext, ereignis) { … }
```

Die Tabelle ist der Kern: Beide Zweige nutzen **dieselbe** Menge an Wirkungen.
Unterschiede zwischen lokal und online sind BENANNT (z. B. ein Flag im Eintrag),
nicht stillschweigend dupliziert.

## Vorgehen

1. **`main.js` bleibt die Fassade.** Die beiden Methoden werden zu Delegatoren:
   ```js
   handleEvents() { verarbeiteLokal(this.#ereignisKontext(), …); }
   ```
2. **Kontext-Objekt statt `this`.** Baue in `main.js` eine private Methode
   `#ereignisKontext()`, die GENAU die Werte sammelt, die die Module brauchen
   (Renderer, HUD, Match, Netzwerk, Stats, Profil …), und diese als ein Objekt
   zurückgibt. Jede Zeile dort ist eine bewusste Entscheidung über Kopplung — das
   ist der eigentliche Gewinn, nicht die Zeilenzahl.
3. **Kein `this` im neuen Modul.** Prüfe das abschließend mit
   `rg -n '\bthis\b' src/client/ereignisse.js` — es darf **kein** Treffer sein.
4. **Verhalten unverändert.** Kein Log-Text ändern, kein Ereignis umbenennen, keine
   Reihenfolge ändern. Die Zuordnungstabelle ist eine Umsortierung, keine
   Verhaltensänderung.

## Falle, die Schritt 1 fast gekostet hätte

Beim Ersetzen von `this.` blieb `game: this,` stehen (das Muster traf nur `this`
**mit Punkt**). In einem Modul ist `this` undefiniert — zwei E2E-Prüfungen fielen
um, gefunden hat es `runtime-smoke`, **nicht** der Linter. Suche deshalb
ausdrücklich auch nach `this,`, `this)` und `= this`:
`rg -n '\bthis\b(?!\.)' --pcre2 src/client/ereignisse.js`

## Belegweg (zwingend, vor UND nach dem Umbau)

```bash
npm run lint                      # 0 Fehler
node --test tests/event-coverage.test.js   # muss grün bleiben
npx playwright test tests/e2e/runtime-smoke.spec.mjs --reporter=line   # 10/10
npx playwright test tests/e2e/multiplayer.spec.mjs --reporter=line     # 10/10
```

`runtime-smoke` ist der wichtigste Beleg: Es prüft, dass die Anzeige auf
Ereignisse reagiert. `multiplayer` prüft den Online-Zweig.

## Abnahmekriterien

- [ ] `src/client/ereignisse.js` existiert, keine Zeile darin enthält `this`
- [ ] `main.js` ist um mindestens 300 Zeilen kürzer (Ziel: < 3.250)
- [ ] `tests/event-coverage.test.js` unverändert grün
- [ ] `runtime-smoke` 10/10, `multiplayer` 10/10 (Ergebnis wie VOR dem Umbau)
- [ ] `npm run lint` 0, `npm run check:docs` 0
- [ ] Die Zuordnungstabelle ist der EINZIGE Ort, der Ereignisarten auf Wirkungen
      abbildet — beide Zweige lesen daraus

## Was NICHT zu tun ist

- `handleEvents` inhaltlich „aufräumen" oder Log-Texte verbessern
- Neue Ereignisse erfinden oder eines weglassen
- Die Tests anpassen, damit sie grün werden — wenn ein Test rot wird, ist der
  Umbau falsch (oder der Test war schon vorher falsch; dann BELEGEN, nicht raten)
