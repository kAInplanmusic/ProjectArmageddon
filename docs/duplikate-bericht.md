# Duplikate jenseits gleichnamiger Definitionen

Stand: 2026-09-26 · Branch `main` · HEAD `e26821d` · **rein lesender Auftrag**: keine Aenderung an
`src/**` oder `tests/**`, kein Testlauf, kein Build, kein Server. Die einzige Schreibe ist diese Datei.

## Was hier gesucht wurde — und warum

Vorhanden und hier nur als **Werkzeug** benutzt (nicht wiederholt):

- `tools/audit-mcp/lib/statisch.mjs` → `doppelregeln()` (Zeile 204-220): findet **nur** Bezeichner, die in 2+ Dateien
  per `^\s*(export )?const NAME =` definiert werden. Meldet derzeit 0.
- `tests/eine-regel-eine-stelle.test.js` → Tabelle `EINE_STELLE` (Zeile 72-80) pinnt **einzelne Namen**.

Beide Verfahren greifen nur, wenn **derselbe Name** zweimal auftaucht. Alle Funde unten sind deshalb
entweder **anderer Name, gleiche Regel**, **Name vorhanden, Zahl abgeschrieben** oder **zwei Tabellen**.
Ich habe zu jedem Fund geprueft, ob das der Fall ist — die Funde 1, 3, 4, 5, 6, 8 sind genau deshalb fuer
die vorhandenen Werkzeuge **unsichtbar**:

| Fund | warum `doppelregeln()` ihn nicht sieht | warum `EINE_STELLE` ihn nicht sieht |
|---|---|---|
| 1 Geschuetz-Pfad / Motor | der eine ist eine `for`-Schleife, der andere ein Aufruf | kein `const NAME =` |
| 3 `GRAVITY` / `PROJECTILE_GRAVITY` | verschiedene Namen | Name nicht in der Tabelle |
| 4 `drag: 0.995` | **keine Definition**, ein Literal | kein `const NAME =` |
| 5 `speed` zweimal in `match.js` | keine Definition, ein Ausdruck | kein `const NAME =` |
| 6 `HALF_WIDTH` / `PLAYER_HALF_WIDTH` | verschiedene Namen | Name nicht in der Tabelle |
| 8 `this.height * 0.47` | **keine Definition**, ein Literal | kein `const NAME =` |
| 11 `RARITY_WEIGHTS` x `RARITY_IDS` | zwei verschiedene Namen | beide nicht in der Tabelle |

### Verfahren (nachpruefbar, keine Vermutung)

1. `grep -rn` ueber `src/` nach jeder Definition `const [A-Z_]+ =` und nach den **Zahlen** der bekannten
   Konstanten (`0.32`, `0.995`, `0.14`, `0.05`, `0.72`, `0.47`, `7`, `10`, `48`, `16`, `4`).
2. **Koerper-Vergleich**: Skript `/tmp/duplikat-koerper2.py` (ausserhalb des Repos) hat ueber `src/`,
   `tests/`, `scripts/`, `tools/` alle benannten Funktionsdeklarationen geschnitten, Kommentare und
   Whitespace entfernt, und **gleich normalisierte Rumpfe gruppiert**. Ergebnis: **273 Dateien,
   533 erkannte Funktionsruempfe, 21 Gruppen mit 2+ gleich normalisiertem Rumpf**. Das ist das
   Verfahren, das Klasse 1 (kopierte Funktionskoerper) systematisch findet — nicht per Aehnlichkeitsgefuehl.

   *Der Detektor hat sich dabei selbst korrigiert, und das ist Teil des Belegs:* Die erste Fassung nahm
   das **erste** `{` nach dem Funktionsnamen als Rumpfanfang. Bei einer Signatur mit Destrukturierung
   (`function f({ a } = {}) {`) ist das der **Parameter** — der „Rumpf" wurde winzig und fiel unter die
   Laengengrenze. Dadurch fehlte dem ersten Lauf genau das Paar aus Fund 1
   (`tests/turret-ballistics.test.js:57` gegen `:84`). Die zweite Fassung sucht die schliessende `)` der
   Signatur und nimmt das `{` danach; die Zahl stieg von 20 auf **21** Gruppen. Ein Detektor, der einen
   Fall nicht sieht, meldet darum nicht weniger — er meldet weniger **richtig**.
3. **Messung statt Behauptung** wo eine Wirkung behauptet wird: Fund 11 wurde mit einem
   Node-Einmalaufruf **gemessen** (Ausgabe unten woertlich), nicht geschlossen.
4. Zu jedem Fund eine **Gegenprobe**: der Fall, in dem er NICHT gilt.
5. **Zitatpruefung**: Ein Skript (`/tmp/duplikat-zitate-pruefen.mjs`) hat **142 zitierte Stellen**
   gegengelesen — jede Datei, jede Zeile, jeder zitierte Textausschnitt. Die Ergebnisse stehen in den
   Funden; 19 Abweichungen wurden dabei gefunden und **korrigiert** (Zeilennummern, die um 1 verschoben
   waren, weil das erste Messskript die Zeilennummer am `^\s*`-Muster verankert hat).

### Urteils-Kategorien

- **(a) ECHTE DOPPLUNG** — dieselbe Regel an zwei Stellen; eine Aenderung muesste an beiden gemacht werden.
- **(b) BEWUSSTE WIEDERHOLUNG** — gleicher Wert, unabhaengige Bedeutung; begruendet durch Beleg.
- **(c) ZUFALL** — gleicher Wert, keine gemeinsame Regel. Nicht weiter verfolgt.

---

## Funde

| # | Klasse (1-4) | Fundstellen | Woertliche Zeilen | Urteil | Fix-Weg |
|---|---|---|---|---|---|
| 1 | 1 | `src/engine/match.js:2032-2038` ↔ `src/shared/ballistics.js:108-109` ↔ `src/engine/systems/projectileSystem.js:174-184` | `for (let schritt = 0; schritt < TURRET_PATH_STEPS; schritt++) {` / `vy += gravitation;` / `vx += wind;` / `vx *= drag;` / `vy *= drag;` / `x += vx;` / `y += vy;` | **(a)** | `#simulateTurretPath` ruft `integrateStep`/`simulateFlight`; eigen bleibt nur die Kollision |
| 2 | 1 | `src/engine/match.js:2275-2278` | `vy += CRATE_GRAVITY;` / `vx += wind * 0.8;` / `vx *= DEFAULT_PROJECTILE_DRAG;` / `vy *= DEFAULT_PROJECTILE_DRAG;` | **(a)** | `integrateStep({ vy, vx, gravity: CRATE_GRAVITY, wind: wind * 0.8, drag: DEFAULT_PROJECTILE_DRAG })` |
| 3 | 2 | `src/engine/match.js:323` ↔ `src/shared/ballistics.js:51` | `const GRAVITY = 0.32;` ↔ `export const PROJECTILE_GRAVITY = 0.32;` | **(a)** | `GRAVITY` loeschen, `DEFAULT_PROJECTILE_GRAVITY` an `:2017` benutzen (schon importiert) |
| 4 | 2 | `src/engine/shooting.js:300`, `src/engine/match.js:2068` ↔ `src/shared/ballistics.js:53` | `drag: 0.995,` (2x) ↔ `export const PROJECTILE_DRAG = 0.995;` | **(a)** | `PROJECTILE_DRAG`/`DEFAULT_PROJECTILE_DRAG` importieren und setzen |
| 5 | 1/3 | `src/engine/match.js:2012` ↔ `src/engine/match.js:2052` ↔ `src/shared/ballistics.js:131` | `const speed = kraft * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);` (2012) / `const speed = schuss.power * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);` (2052) | **(a)** | eine private Methode `#turretLaunch(kraft, winkel)`; `launchVelocity` in `ballistics.js` benannt exportieren |
| 6 | 2 | `src/engine/systems/characterSystem.js:27-28` ↔ `src/shared/config/player.js:35,38` | `const HALF_WIDTH = 7;` / `const HALF_HEIGHT = 10;` ↔ `export const PLAYER_HALF_WIDTH = 7;` / `export const PLAYER_HALF_HEIGHT = 10;` | **(a)** | Koerpermasse aus `shared/config/player.js` importieren |
| 7 | 2 | `src/client/renderer.js:347` ↔ `src/engine/match.js:324` | `const maxWind = 0.05;` ↔ `const MAX_WIND = 0.05;` | **(a)** | `MAX_WIND` aus `match.js` exportieren (renderer importiert dort schon) |
| 8 | 2 | `src/client/renderer.js:545` ↔ `src/shared/config/backdrops.js:36` | `drawLandmarks(this.ctx, this.width, this.height, this.scenery, this.height * 0.47);` ↔ `export const TERRAIN_COVERAGE = 0.47;` | **(a)** | `TERRAIN_COVERAGE` in `renderer.js` importieren |
| 9 | 2 | `src/client/renderer.js:622` ↔ `src/shared/config/water.js:35` | `data[index + 3] = Math.round(Math.min(0.72, level) * 210 * (this.scenery?.water?.alpha ?? 1));` ↔ `export const DROWN_LEVEL = 0.72;` | **(c)**, grenzwertig — siehe unten | keiner; wer will, liest `DROWN_LEVEL` trotzdem |
| 10 | 4 | `src/engine/systems/lootSystem.js:80` ↔ `src/shared/config/loot.js:22` | `export const RARITY_IDS = Object.freeze(['standard', 'enhanced', 'premium', 'epic']);` ↔ `rarities: Object.freeze(['standard', 'enhanced', 'premium', 'epic']),` | **(a)** | `RARITY_IDS = LOOT_DROP_RULES.rarities` oder eine der beiden loeschen |
| 11 | 4 | `src/engine/systems/lootSystem.js:124-125` (Paarung) mit `:80`+`:81` und `src/shared/config/loot.js:53` | `const rarityName = weightedRarity(activeRng, RARITY_WEIGHTS, RARITY_IDS);` / `const weightArray = rarities.map(r => weights[r] \|\| 0);` | **(a)** — **belegte Fehlwirkung** | eine Quelle: entweder `Object.keys(RARITY_WEIGHTS)` als Namensliste, oder Gewichte auf den `RARITY_IDS`-Raum; plus Test auf Gleichheit der Schluesselmengen |
| 12 | 4 | `src/client/renderer.js:55` ↔ `src/shared/config/loot.js:27-32` (und `src/client/main.js:3200`) | `const RARITY_COLORS = ['#e8eef5', '#4cc9f0', '#a855f7', '#fbbf24'];` ↔ `rarityColors: Object.freeze({ standard: '#ffffff', enhanced: '#3b82f6', premium: '#a855f7', epic: '#fbbf24' })` | **(a)** — **schon abgedriftet** | `RARITY_COLORS` loeschen; `LOOT_DROP_RULES.rarityColors[RARITY_IDS[rarity]]` |
| 13 | 1 | `tests/backdrops.test.js:512` ↔ `tests/eine-regel-eine-stelle.test.js:43`; `tests/erreichbarkeit.test.js:32` ↔ `tests/kantenlicht.test.js:59`; `tests/anti-cheat.test.js:88` ↔ `tests/server-integration.test.js:80` | siehe Detail | **(b)** fuer die reinen Testpaare | keine Pflicht; ein `tests/lib/helfer.js` waere der Weg |
| 14 | 1 | `scripts/smoke-fast.mjs:50` ↔ `tests/server-start.test.js:57` (`freierPort()`); `scripts/{balance-report:29,browser-perf:37,perf-profile:15}.mjs` (`parseArgs()`, 3x); `scripts/{balance-report:39,browser-perf:47,perf-profile:25,replay:33}.mjs` (`num()`, 4x) | siehe Detail | **(a)** | `scripts/lib/args.mjs` mit `parseArgs`/`num`/`freierPort` |
| 15 | 1 | `src/shared/terrainGen2.js:77` ↔ `src/shared/terrainGen3.js:229` (`gitterrauschen()`) | identische Rumpfe (503 Zeichen normalisiert) | **(b)** — begruendet, Restrisiko benannt | reiner Helfer `src/shared/terrainNoise.js` |
| 16 | 1 | `scripts/build-weapon-catalog.mjs:316`↔`:1191`, `:504`↔`:1210` — der Generator fuehrt dieselben Helfer als CODE und als TEXT | `export function subcategoryFor(category) {` (2x) / `export function iconUrlFor(weapon) {` (2x) | **(b)** — Projekt-regelkonform, Restrisiko | Pruefung, dass Generator-Code und Emissionstext gleich sind |

---

## Belege und Gegenproben

### Fund 1 — Der Geschuetz-Pfad baut den Integrationsschritt nach (Klasse 1, **(a)**)

`src/engine/match.js:2032-2038`:
```
    for (let schritt = 0; schritt < TURRET_PATH_STEPS; schritt++) {
      vy += gravitation;
      vx += wind;
      vx *= drag;
      vy *= drag;
      x += vx;
      y += vy;
```
`src/shared/ballistics.js:108-109` (die EINE Fassung):
```
  const neuesVy = (vy + gravity * skala) * drag;
  const neuesVx = (vx + (wind || 0) * windFaktor) * drag;
```
`src/engine/systems/projectileSystem.js:174-184` (der Motor ruft sie):
```
      const naechsteGeschwindigkeit = integrateStep({
        vx,
        vy,
        gravity: this.#gravity,
        gravityScale,
        wind: match.wind || 0,
        windFactor,
        drag,
      });
```
Reihenfolge und Vorzeichen sind identisch (`vy += g*scale`, `vx += wind*factor`, dann Drag auf BEIDE
Achsen). Der Kommentar `match.js:2007-2009` sagt selbst, die Behebung sei „bewusst KEINE neue Formel,
sondern die Uebernahme der geltenden". Uebernommen wurde aber der **Wortlaut**, nicht der **Aufruf**.
`integrateStep` hat im ganzen Projekt genau **einen** Aufrufer (`projectileSystem.js:174`; das `grep`
ueber `src/` liefert nur diese Datei und die Definition in `ballistics.js`).

**Was hier NICHT gilt (Gegenprobe).** Die beiden Rumpfe sind **nicht** in allem gleich: der Pfad prueft
die Kollision nur am **Schritt-Ende** (`match.js:2039-2040`: `if (x < 0 || x > this.width || y > this.height) break;`
und `if (this.surfaceYAt(Math.round(x)) > 0 && y >= this.surfaceYAt(Math.round(x))) {`), das echte Geschoss
tastet die Strecke pixelgenau ab (`raycastSegment`, `ballistics.js:154-185`). Es ist also **keine**
blosse Wiederverwendung mit anderem Namen — es ist eine Doppelung, die in einem Punkt schon abweicht.
Genau darum ist der Fund ein Fund.

**Warum die vorhandene Absicherung ihn nicht abdeckt.** `tests/turret-ballistics.test.js` baut die
Physik **zweimal nach**: `echteBahn()` (`:57`) und `geschuetzBahn()` (`:84`) sind nach Normalisierung
**identische Rumpfe** (340 Zeichen — aus der Messung; die `:80-82`-Kommentarzeile der zweiten Fassung
lautet woertlich „Wird diese Funktion geaendert, muss `#simulateTurretPath` in `match.js` mitgezogen
werden."). Geprueft wird dort also **Kopie gegen Kopie**, und `:211-282` prueft den Quelltext von
`match.js` per Regex. Wird `integrateStep` in `src/shared/ballistics.js` geaendert, aendert sich
**keine** der drei Kopien und **kein** Test faellt. Der Waechter haelt fest, was in `match.js` steht —
nicht, dass `match.js` und die geteilte Funktion dasselbe tun.

**Fix-Weg.** `#simulateTurretPath` ruft `simulateFlight({ …, isSolid })` aus `src/shared/ballistics.js`
(gleiche Konstanten, gleiche Reihenfolge, pixelgenaue Abtastung inklusive) und behaelt als Eigenanteil
nur die Zielwahl. Danach faellt die Klasse „Geschuetz-Pfad laeuft auseinander" weg, weil es keine
zweite Fassung mehr gibt — dieselbe Bewegung, die `ballistics.js:5-15` im Kopf schon beschreibt.

### Fund 2 — Der Kistenflug baut denselben Schritt ein drittes Mal nach (Klasse 1, **(a)**)

`src/engine/match.js:2275-2278`:
```
    vy += CRATE_GRAVITY;
    vx += wind * 0.8;
    vx *= DEFAULT_PROJECTILE_DRAG;
    vy *= DEFAULT_PROJECTILE_DRAG;
```
Bemerkenswert: hier steht fuer den Drag **der Name** — das Projekt weiss also um die Regel, und dieser
Rumpf ist die dritte Fassung derselben vier Zeilen. `grep -rn "CRATE_GRAVITY" src/` →
nur `match.js:326` (Definition) und `:2275`.

**Gegenprobe.** Dass Kisten ANDERS fliegen als Geschosse, ist belegt und Absicht (`match.js:2272-2274`:
„Eigene Fallbeschleunigung fuer Kisten: schwaecher als bei Geschossen"). Die Kiste ist damit aber kein
Gegenbeispiel: `integrateStep` nimmt `gravity`, `wind` und `drag` **als Parameter** — andere Zahlen
brauchen keinen zweiten Rumpf. Der Unterschied zwischen „andere Werte" und „andere Regel" ist hier
gemessen: die Werte sind andere, die Regel ist dieselbe.

**Fix-Weg.** `integrateStep({ vx, vy, gravity: CRATE_GRAVITY, wind: wind * 0.8, drag: DEFAULT_PROJECTILE_DRAG })`
und das Ergebnis den Positionen zuschlagen (`x += vx; y += vy;` bleibt, weil die Kiste keine
Segment-Abtastung braucht).

### Fund 3 — `GRAVITY = 0.32` neben `PROJECTILE_GRAVITY = 0.32` (Klasse 2, **(a)**)

`src/engine/match.js:322-323`:
```
/** Schwerkraft der Geschosse — derselbe Wert wie im ProjectileSystem. */
const GRAVITY = 0.32;
```
`src/shared/ballistics.js:50-51`:
```
/** Schwerkraft je Tick auf ein Geschoss. */
export const PROJECTILE_GRAVITY = 0.32;
```
Der Kommentar behauptet die Uebereinstimmung, der Code stellt sie nicht her — es ist eine Abschrift.
`match.js` importiert die Konstante bereits: `match.js:26`
`import { DEFAULT_PROJECTILE_GRAVITY, DEFAULT_PROJECTILE_DRAG } from './systems/projectileSystem.js';`
und benutzt sie schon (`match.js:735`: `gravity: DEFAULT_PROJECTILE_GRAVITY,`).

**Gegenprobe.** Der Fund gilt NICHT, wenn der Turm absichtlich eine andere Schwerkraft fliegt. Dann ist
der Kommentar falsch statt der Wert — beides zugleich kann nicht gelten. Beleg dafuer, welche Lesart
gilt: `tests/turret-ballistics.test.js:205-206` pinnt `DEFAULT_PROJECTILE_GRAVITY === 0.32` als
Stolperdraht mit dem Text „Die Gravitation hat sich geaendert — dann muss der Geschuetz-Pfad mitziehen".
Das Projekt behandelt 0.32 als DEN Wert.

**Fix-Weg.** `const GRAVITY = 0.32;` loeschen und `:2017` (`const gravitation = GRAVITY * (waffe.gravityScale ?? 1);`)
auf `DEFAULT_PROJECTILE_GRAVITY` umstellen — der Import steht schon da.

### Fund 4 — `drag: 0.995` als Zahl statt als Name (Klasse 2, **(a)**)

`src/engine/match.js:2026-2029` (dieselbe Datei, 40 Zeilen darueber):
```
    // Der Drag kommt aus DERSELBEN Konstante wie beim echten Geschoss —
    // `DEFAULT_PROJECTILE_DRAG` ist oben importiert. Eine eigene Zahl wäre
    // genau die Doppelregel, die zu diesem Fehler geführt hat.
    const drag = DEFAULT_PROJECTILE_DRAG;
```
`src/engine/match.js:2068` (in `#spawnTurretProjectile`):
```
      drag: 0.995,
```
`src/engine/shooting.js:300` (der normale Schuss — `grep -rn "drag: 0.995" src/` liefert genau diese
zwei Stellen):
```
    drag: 0.995,
```
`src/shared/ballistics.js:52-53`:
```
/** Luftwiderstand je Tick (Faktor auf beide Achsen). */
export const PROJECTILE_DRAG = 0.995;
```
Der Wert wird zur **Laufzeit** gelesen (`projectileSystem.js:161`:
`const drag = world.getComponent(entityId, 'Projectile', 'drag') || this.#baseDrag;`) — die abgeschriebene
Zahl ist also nicht kosmetisch, sie entscheidet die Bahn.

**Gegenprobe.** Der Fund gilt nicht, wenn eine Waffe ihren eigenen Drag mitbringt. Geprueft:
`grep -rn "drag" src/shared/config/weapons.js` liefert **keinen** Treffer (nur die Zeichenfolge in
`"damageType": "dragon"`), und der Generator setzt kein `drag`-Feld. Alle 150 Waffen tragen dieselbe
Zahl. Die Abschrift hat damit keinen Zweck, den der Name nicht auch haette.

**Fix-Weg.** In `match.js:2068` `drag: DEFAULT_PROJECTILE_DRAG,` (Import vorhanden) und in
`shooting.js:300` `drag: PROJECTILE_DRAG,` (`shooting.js:54` importiert bereits aus `shared/ballistics.js`).

### Fund 5 — Abschussgeschwindigkeit des Geschuetzs zweimal in derselben Datei (Klasse 1/3, **(a)**)

`src/engine/match.js:2012` (in `#simulateTurretPath`):
```
    const speed = kraft * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);
```
`src/engine/match.js:2052` (in `#spawnTurretProjectile`, 40 Zeilen spaeter):
```
    const speed = schuss.power * POWER_TO_SPEED * (waffe.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width);
```
Die Zeilen sind bis auf die Parameternamen identisch; dazu `:2015-2016` und `:2053-2054`:
```
    let vx = Math.cos(winkel) * speed;
    let vy = -Math.sin(winkel) * speed;
```
```
    const vx = Math.cos(schuss.angle) * speed;
    const vy = -Math.sin(schuss.angle) * speed;
```
Das ist eine **harte** Kopplung: mit `:2012` wird die Flugbahn gerechnet, aus der der Schusswinkel
gewaehlt wird; mit `:2052` fliegt das Geschoss wirklich los. Laufen die beiden auseinander, zielt das
Geschuetz systematisch falsch — die Fehlerklasse, die `match.js:1986-2005` als Fund beschreibt.
`src/shared/ballistics.js:130-133` enthaelt dieselbe Verrechnung fertig:
```
function launchVelocity({ angle, power, speed = null, speedMultiplier = 1 }) {
  const v = speed === null || speed === undefined ? power * POWER_TO_SPEED * speedMultiplier : speed;
  return { vx: Math.cos(angle) * v, vy: -Math.sin(angle) * v, speed: v };
}
```
Sie ist aber **nur im Default-Export** enthalten (`ballistics.js:324`) und nicht als benannter Export —
die drei Aufrufer koennen sie deshalb nicht benutzen und schreiben die Formel neu.

**Gegenprobe.** `#launchVector` (`match.js:1777-1786`) gehoert **nicht** dazu:
```
    const speed = power * POWER_TO_SPEED * launchSpeedMultiplier({
```
Dort kommt der Klassen-/Archetyp-/Sidegrade-Faktor mit (`launchSpeed.js:38-41`: „Der Kartenfaktor stand
zuletzt NEBEN dieser Funktion an jeder Aufrufstelle … der Spielerschuss vergass ihn, das Geschuetz nicht").
Das Geschuetz soll ihn **nicht** haben. Die Stellen sind also nicht alle gleich: deckungsgleich sind
`:2012` und `:2052`, und `ballistics.js:130-133` ist die gemeinsame Form fuer beide — wenn man sie
exportiert.

**Fix-Weg.** (1) `export function launchVelocity(…)` in `ballistics.js` statt nur im Default-Objekt.
(2) Eine private Methode `#turretLaunch(kraft, winkel)`, die `launchVelocity({ angle: winkel, power: kraft,
speedMultiplier: (TURRET_WEAPON.speedFactor ?? 1) * geschwindigkeitsFaktor(this.width) })` aufruft, und
`#simulateTurretPath` **und** `#spawnTurretProjectile` rufen nur noch sie.

### Fund 6 — Koerpermasse ein drittes Mal, unter anderem Namen (Klasse 2, **(a)**)

`src/engine/systems/characterSystem.js:26-28`:
```
 */
const HALF_WIDTH = 7;
const HALF_HEIGHT = 10;
```
`src/shared/config/player.js:34-38`:
```
/** Halbe Breite des Spielerkörpers in Pixeln (voller Körper: 14 px). */
export const PLAYER_HALF_WIDTH = 7;

/** Halbe Höhe des Spielerkörpers in Pixeln (voller Körper: 20 px). */
export const PLAYER_HALF_HEIGHT = 10;
```
Benutzt wird die Kopie in `characterSystem.js:99` (`nextY - HALF_HEIGHT - 1`), `:101` (`- HALF_HEIGHT`),
`:129-130`:
```
      resolvedX = Math.max(HALF_WIDTH, Math.min((terrain?.width ?? 4096) - HALF_WIDTH, resolvedX));
      resolvedY = Math.max(HALF_HEIGHT, Math.min((terrain?.height ?? 4096) - HALF_HEIGHT, resolvedY));
```
`projectileSystem.js:37-41` dokumentiert genau diesen Fehler fuer die **zweite** Kopie:
```
 * Trefferfeld und Körpermaße kommen aus `src/shared/config/player.js`.
 *
 * Hier standen sie als EXPORTE ein zweites Mal (`PLAYER_HALF_WIDTH = 7`,
 * `PLAYER_HALF_HEIGHT = 10`) — und diese Exporte hatten KEINEN Importeur.
```
`match.js:398-402` benennt ihn fuer die **dritte** („Hier standen sie ein ZWEITES Mal (Audit-Fund
„Doppelregel"), waehrend `projectileSystem.js` fuer die Trefferpruefung eine dritte Kopie fuehrte. Drei
Zahlen fuer denselben Koerper"). Die hier gefundene Kopie in `characterSystem.js` ist die **vierte** —
und sie ist unter anderem Namen gefuehrt, deshalb sieht sie keines der beiden vorhandenen Werkzeuge
(siehe Tabelle oben).

**Gegenprobe.** Der Fund gilt nicht, wenn `CharacterSystem` auch **Nicht-Spieler** bewegt, die einen
anderen Koerper haben. Geprueft: die Signatur ist `POSITION | VELOCITY | HEALTH`
(`characterSystem.js:188-190`), und die **einzige** Stelle im Projekt, die eine `Health`-Komponente
anlegt, ist `match.js:1058` (`this.#world.addComponent(entityId, 'Health', { current: maxHealth, max: maxHealth });`)
im Spieler-Aufbau. Es gibt keinen zweiten Koerpertyp in diesem System.

**Fix-Weg.** `import { PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT } from '../../shared/config/player.js';`
und die zwei lokalen Konstanten loeschen. Zusaetzlich — weil Namen nicht verglichen werden — gehoert
`HALF_WIDTH` in die `EINE_STELLE`-Tabelle **nicht** hinein (der Name verschwindet), sondern die Regel
„Koerpermasse nur aus `config/player.js`" in `tests/source-boundaries.test.js`.

### Fund 7 — Die Windanzeige kennt das Windmaximum als eigene Zahl (Klasse 2, **(a)**)

`src/client/renderer.js:344-348`:
```
    const magnitude = Math.abs(wind ?? 0);
    if (magnitude < 0.0005) return;

    const maxWind = 0.05;
    const strength = Math.min(1, magnitude / maxWind);
```
`src/engine/match.js:324`:
```
const MAX_WIND = 0.05;
```
`src/engine/match.js:2803-2805`:
```
  #rollWind() {
    return Math.round(this.#rng.nextFloat(-MAX_WIND, MAX_WIND) * 10000) / 10000;
  }
```
Der Wind der Partie liegt damit **immer** in `[-MAX_WIND, MAX_WIND]`. Die Anzeige normiert genau
darauf — sie behauptet also dieselbe Regel. `renderer.js:11` importiert bereits aus `match.js`
(`import { WATER_SCALE } from '../engine/match.js';`), der Weg fuer einen Import ist da; `MAX_WIND`
ist aber **nicht exportiert** (geprueft: im Quelltext von `match.js` steht kein `export` vor `MAX_WIND`).

**Gegenprobe.** Der Fund gilt nicht, wenn 0.05 nur ein Anzeige-Anschlag waere („ab 0.05 ist der Pfeil
ganz lang, egal wie stark es weht"). Dagegen spricht die Formel selbst: `Math.min(1, magnitude / maxWind)`
ist „Anteil am Maximum", nicht „ab hier gesaettigt" — die Farbstufen (`:353`,
`strength > 0.6 ? '#ef476f' : strength > 0.3 ? '#f4a261' : '#8ba0b4'`) sind an genau dieser Skala
kalibriert. Wird `MAX_WIND` erhoeht, zeigt der Pfeil die obere Haelfte des Bereichs konstant voll —
still, ohne Fehler.

**Fix-Weg.** `MAX_WIND` in `match.js` exportieren und in `renderer.js:347` importieren.

### Fund 8 — Die Horizontlinie ist eine abgeschriebene 0.47 (Klasse 2, **(a)**)

`src/shared/config/backdrops.js:35-36`:
```
/** Höhe des Geländes im Verhältnis zur Bildhöhe (für Komposition und Tests). */
export const TERRAIN_COVERAGE = 0.47;
```
`src/client/renderer.js:542-545`:
```
      // Die Horizontlinie liegt knapp über der Geländekante. Ein Horizont in der
      // Bildmitte würde vom Gelände verdeckt und die Landmarke verschwände.
      drawLandmarks(this.ctx, this.width, this.height, this.scenery, this.height * 0.47);
```
Beide sagen dasselbe: die Geländekante liegt bei 47 % der Bildhöhe. `TERRAIN_COVERAGE` hat
**keinen** Produktivleser (`grep -rn TERRAIN_COVERAGE src/` → nur die Definition in `backdrops.js:36`;
in `tests/` nur `backdrops.test.js:10,262-263`); die einzige Stelle, an der die Regel im Produktivpfad
**wirkt**, steht als nackte Zahl im Renderer.

**Gegenprobe.** Der Fund gilt nicht, wenn der Renderer die Kante aus dem **echten** Gelaende nimmt und
0.47 nur ein Notnagel ist. Geprueft: der Wert ist ein Literal, nicht abgeleitet — es gibt an dieser
Stelle keine Abfrage der Geländeoberkante. Damit sind beide dieselbe **Annahme**, und nur
`backdrops.js` traegt den Namen dazu.

**Fix-Weg.** `import { TERRAIN_COVERAGE } from '../shared/config/backdrops.js';` (der Import steht
schon fuer `paletteFor, DEFAULT_TERRAIN_PALETTE`, `renderer.js:13`) und `this.height * TERRAIN_COVERAGE`.

### Fund 9 — `Math.min(0.72, level)` und `DROWN_LEVEL` (Klasse 2, **(c)** — grenzwertig)

`src/shared/config/water.js:34-35`:
```
export const DROWN_LEVEL = 0.72;
```
`src/client/renderer.js:622`:
```
      data[index + 3] = Math.round(Math.min(0.72, level) * 210 * (this.scenery?.water?.alpha ?? 1));
```
`water.js:5-8` sagt ausdruecklich, warum die Schwellen ausgelagert wurden: „Die Schwellen standen
bisher nur im `CharacterSystem`: `0.35` entschied ‚nass', `0.72` entschied ‚ertrinkt'. **Die Anzeige
durfte sie nicht kennen**" — und `src/client/hud.js:18` liest `DROWN_LEVEL` seitdem aus der Config,
`main.js:50` liest `WATER_STATE, waterStateFor`. Der Renderer liest **nichts** aus `water.js`.

**Gegenprobe — sie ist der Grund fuer (c).** Hier wird die **Deckkraft** gedeckelt, nicht ein Zustand
bestimmt. Waere `DROWN_LEVEL` 0.6, muesste `renderer.js:622` **nicht** mitziehen: es gaebe keinen
Fehler, nur einen frueher/dauerhaft volleren Wasserfilm. Es besteht also **keine** Regel, die an beiden
Stellen zugleich gelten muss — nur Wertgleichheit. Zweiter Beleg: dieselbe Zahl 0.72 steht in
`renderer.js:1021` (`this.ctx.moveTo(l * 0.1, -h * 0.72);`) in einer reinen Zeichenform.

**Fix-Weg.** Keiner zwingend. Wer die Naehe trotzdem loswerden will (die Verwechslungsgefahr ist real,
weil das Projekt `DROWN_LEVEL` als „die" 0.72 etabliert hat), benennt die Deckkraft:
`const WASSER_DECKKRAFT_MAX = 0.72;` mit einem Kommentar, dass es **nicht** `DROWN_LEVEL` ist.

**Was diese Einordnung NICHT behauptet:** dass hier ein Fehler ist. Sie behauptet nur, dass die beiden
Werte keine gemeinsame Regel teilen — deshalb wird hier kein Fix verlangt.

### Fund 10 — `RARITY_IDS` ist die zweite Kopie von `LOOT_DROP_RULES.rarities` (Klasse 4, **(a)**)

`src/shared/config/loot.js:22`:
```
  rarities: Object.freeze(['standard', 'enhanced', 'premium', 'epic']),
```
`src/engine/systems/lootSystem.js:80`:
```
export const RARITY_IDS = Object.freeze(['standard', 'enhanced', 'premium', 'epic']);
```
Wertgleich, gleiche Reihenfolge, zwei Orte — und **beide werden gelesen**: `loot.js:45` benutzt
`LOOT_DROP_RULES.rarities` als Default von `weightedRarity`, `tests/loot.test.js:37` prueft dagegen;
`lootSystem.js:125` und `main.js:3194,3200` benutzen `RARITY_IDS`. Eine Aenderung an einer der beiden
Laengen verschiebt die Zuordnung Index → Seltenheit im Drahtformat (`protocol.js:142` `CRATE_STRIDE`)
und in der Anzeige, ohne dass etwas fehlschlaegt.

**Gegenprobe.** Der Fund gilt nicht, wenn `LOOT_DROP_RULES.rarities` nur Dokumentation ist. Es hat
einen Leser (siehe oben), und `tests/loot.test.js:37` prueft `LOOT_DROP_RULES.rarities.includes(…)` —
also nein.

**Fix-Weg.** `export const RARITY_IDS = LOOT_DROP_RULES.rarities;` in `lootSystem.js` (Import nach
`loot.js` besteht bereits, `lootSystem.js:11`) — oder `RARITY_IDS` ganz streichen und die Lesestellen
auf `LOOT_DROP_RULES.rarities` umstellen.

### Fund 11 — Zwei Tabellen mit VERSCHIEDENEN Schluesselmengen, zusammengelesen (Klasse 4, **(a)**)

`src/engine/systems/lootSystem.js:124-125` (die Paarung):
```
      const rarityName = weightedRarity(activeRng, RARITY_WEIGHTS, RARITY_IDS);
      const rarityId = Math.max(0, RARITY_IDS.indexOf(rarityName));
```
`src/engine/systems/lootSystem.js:80-81` (die beiden Tabellen):
```
export const RARITY_IDS = Object.freeze(['standard', 'enhanced', 'premium', 'epic']);
export const RARITY_WEIGHTS = Object.freeze({ common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 });
```
`src/shared/config/loot.js:53` (wie `weightedRarity` die beiden verbindet):
```
  const weightArray = rarities.map(r => weights[r] || 0);
```
Die Gewichte sind nach den **fuenf** `powerTier`-Stufen benannt, die Liste `RARITY_IDS` traegt die
**vier** Quell-Raritaeten. Nur `epic` kommt in beiden Raeumen vor. Damit gilt:
`weights[r] || 0` → `[0, 0, 0, 6]`.

**Messung** (Node-Einmalaufruf ueber `src/shared/config/loot.js`; keine Datei im Repo veraendert,
`loot.js` importiert nur `seed.js` → `prng.js` — der Waffenkatalog, der sich beim Import selbst
schreibt, wird dabei **nicht** geladen):
```
Verteilung ueber 20000 gleichmaessige rng-Werte: { epic: 20000 }
Gegenprobe mit powerTier-Namen: {
  common: 11000,
  uncommon: 5000,
  rare: 2400,
  epic: 1200,
  legendary: 400
}
Gewichte ueber RARITY_IDS gelesen: [
  [ 'standard', 0 ],
  [ 'enhanced', 0 ],
  [ 'premium', 0 ],
  [ 'epic', 6 ]
]
```
**Folge, im Code verfolgt:** `rarity: rarityId` (`lootSystem.js:136`) ist damit **immer 3**, und
`renderer.js:687` (`const color = RARITY_COLORS[crate.rarity] ?? CRATE_COLORS[0];`) zeichnet jede
Rundenkiste als `epic`.

**Gegenprobe — und warum es trotzdem (a) ist.** Kein Test schlaegt an, weil das Ergebnis
**deterministisch** bleibt: der `rng.next()`-Verbrauch in `weightedRarity` ist unveraendert, also
bleibt der Zufallsstrom identisch und `tests/gameplay.test.js:143,146` („`assert.deepEqual(spawn(313), spawn(313))`")
weiter gruen. Der Fund ist daher **nicht** Zufall im Sinne von (c): die zwei Tabellen werden
nachweislich zusammengelesen, und die Regel „welche Namen sind die Seltenheiten" steht an zwei Stellen
mit zwei verschiedenen Antworten. Zweite Gegenprobe: derselbe `RARITY_WEIGHTS`-Beutel wird **eine Zeile
spaeter** (`lootSystem.js:127`) mit `pickWeaponForRarity` benutzt und ist dort **richtig**, weil die
Funktion `weights[weapon.powerTier] ?? weights[weapon.rarity]` liest (`weapons.js:7348`). Die
Gewichte sind also nicht falsch — falsch ist die **Paarung**. Genau das ist der Fall, den die Aufgabe
als „zwei Listen mit uebereinstimmenden Inhalten, die auseinanderlaufen koennen" meint, nur dass sie
hier schon auseinandergelaufen sind.

**Fix-Weg.** Eine Quelle. Entweder
`weightedRarity(activeRng, RARITY_WEIGHTS, Object.keys(RARITY_WEIGHTS))` — dann ist die Ziehung
dieselbe wie die des Waffenkatalogs und die 55/25/12/6/2-Verteilung gilt fuer beide; oder die Gewichte
werden auf den `RARITY_IDS`-Raum umgeschrieben und aus **einer** Konstante abgeleitet. Dazu gehoert
zwingend ein Test, der `new Set(Object.keys(RARITY_WEIGHTS))` und `new Set(RARITY_IDS)` gleichsetzt —
sonst laeuft es wieder auseinander, sobald eine der beiden Listen waechst.

### Fund 12 — Die Seltenheitsfarben stehen zweimal im Client, und sie sind schon auseinander (Klasse 4, **(a)**)

`src/shared/config/loot.js:27-32`:
```
  rarityColors: Object.freeze({
    standard: '#ffffff',
    enhanced: '#3b82f6',
    premium: '#a855f7',
    epic: '#fbbf24'
  })
```
`src/client/renderer.js:54-55`:
```
const CRATE_COLORS = ['#dcdcdc', '#4cc9f0', '#a855f7', '#fbbf24'];
const RARITY_COLORS = ['#e8eef5', '#4cc9f0', '#a855f7', '#fbbf24'];
```
`src/client/main.js:3196-3200`:
```
    // Farbe aus der Config, nicht im Client gewählt: dieselbe Farbe wie im
    // Spiel, sonst wichen Liste und Waffenanzeige voneinander ab.
    punkt.style.background = regeln.rarityColors[stufe] ?? '#888';
```
Der Kommentar in `main.js` **behauptet**, es gebe keine eigene Farbwahl im Client. Der Renderer hat
sie trotzdem. Der Vergleich der POSITIONEN (die Liste ist mit `RARITY_IDS` indiziert):
`standard`: `#ffffff` gegen `#e8eef5`, `enhanced`: `#3b82f6` gegen `#4cc9f0` — **verschieden**;
`premium`: `#a855f7` gegen `#a855f7`, `epic`: `#fbbf24` gegen `#fbbf24` — gleich. Eine Kopie, die zur
Haelfte noch uebereinstimmt, ist eine Kopie, die abgedriftet ist.

**Gegenprobe.** Der Fund gilt nicht, wenn `RARITY_COLORS` andere Dinge einfaerbt als `rarityColors`.
Geprueft: beide werden mit **derselben** Seltenheit indiziert — `renderer.js:687`
`RARITY_COLORS[crate.rarity]` mit `crate.rarity` = `RARITY_IDS.indexOf(rarityName)`, und
`main.js:3194-3200` iteriert ueber `RARITY_IDS`. Dieselbe Groesse, dieselbe Reihenfolge, zwei Tabellen.
Nebenbefund derselben Zeile: `?? CRATE_COLORS[0]` mischt eine Farbe nach **Kistentyp**
(`CRATE_COLORS` steht in `renderer.js:54` unmittelbar daneben) als Rueckfall unter die
**Seltenheitsfarben** — auch das eine Verwechslung zweier Tabellen.

**Sichtbarkeit heute: keine.** Weil `crate.rarity` durch Fund 11 immer 3 ist, wird immer `#fbbf24`
gezeichnet — die abgedriftete Haelfte faellt nie auf. Beide Funde gehoeren zusammen behoben.

**Fix-Weg.** `RARITY_COLORS` loeschen und
`LOOT_DROP_RULES.rarityColors[RARITY_IDS[crate.rarity]]` benutzen (`lootSystem.js:80` exportiert die
Namensliste, `main.js:47` importiert sie schon) — damit gibt es die vier Raritaetsfarben genau einmal,
und der Kommentar in `main.js:3196-3197` wird wahr.

### Fund 13/14 — Kopierte Helfer in Tests und Werkzeugen (Klasse 1)

**Reine Testpaare — (b) bewusste Wiederholung.** Die Messung fand identische Rumpfe:

- `tests/backdrops.test.js:512` `quelldateien()` ≙ `tests/eine-regel-eine-stelle.test.js:43` (257 Zeichen):
  ```
    const ergebnis = [];
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
  ```
- `tests/erreichbarkeit.test.js:32` `maske(zeilen)` ≙ `tests/kantenlicht.test.js:59` (219 Zeichen)
- `tests/anti-cheat.test.js:88` `starteServer()` ≙ `tests/server-integration.test.js:80` `startTestServer()`
  (85 Zeichen), Rumpf woertlich:
  ```
    const server = new GameServer();
    const info = await server.listen(0);
    return { server, ...info };
  ```

Diese Tests sind unabhaengig voneinander lauffaehig; eine Aenderung an einem Aufbau muss den anderen
nicht erreichen. Deshalb **(b)**, ohne Fixpflicht. Wer es aufraeumen will, legt `tests/lib/helfer.js` an.

**Test↔Werkzeug und Werkzeugreihe — (a).** Hier ist die Unabhaengigkeit nicht belegbar:

- `scripts/smoke-fast.mjs:50` `freierPort()` ≙ `tests/server-start.test.js:57` (188 Zeichen).
  `scripts/smoke-fast.mjs` ist der Waechter des schnellen Zyklus (`package.json`:
  `"smoke:fast": "node scripts/smoke-fast.mjs"`). Es ist **kein** Testaufbau, sondern ein Werkzeug,
  das dieselbe Zusage prueft wie ein Test — `npm run smoke:fast` und `npm test` duerfen nicht
  auseinanderlaufen.
- `parseArgs()` in **drei** Dateien, identisch (167 Zeichen): `scripts/balance-report.mjs:29`,
  `scripts/browser-perf.mjs:37`, `scripts/perf-profile.mjs:15`:
  ```
    const args = {};
    for (const token of argv) {
      if (!token.startsWith('--')) continue;
      const [key, value] = token.slice(2).split('=');
      args[key] = value === undefined ? true : value;
    }
    return args;
  ```
- `num()` in **vier** Dateien, identisch (74 Zeichen): `scripts/balance-report.mjs:39`,
  `scripts/browser-perf.mjs:47`, `scripts/perf-profile.mjs:25`, `scripts/replay.mjs:33`:
  ```
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  ```
  Beleg fuer die gemeinsame Regel: `perf-profile.mjs:10-11` und `browser-perf.mjs` lesen **dasselbe**
  Argumentformat (`--ticks=N [--seed=N] [--teams=N] [--players=N] [--preset=NAME] [--shots=N] [--json]`).

**Gegenprobe.** Der Fund gilt nicht, wenn diese Skripte als einmalige Wegwerfwerkzeuge gedacht sind.
Dagegen spricht, dass `num()` in vier von ihnen **byte-gleich** ist und drei dasselbe Argumentformat
lesen. Ein gemeinsames `scripts/lib/args.mjs` mit `parseArgs`, `num` und `freierPort` ist der Fix;
`freierPort` sollte danach von **beiden** Seiten (Test und `smoke-fast`) importiert werden, weil beide
dieselbe Zusage pruefen.

### Fund 15 — `gitterrauschen()` doppelt in `terrainGen2` und `terrainGen3` (Klasse 1, **(b)** mit Restrisiko)

`src/shared/terrainGen2.js:77-99` und `src/shared/terrainGen3.js:229-250` sind nach Normalisierung
**gleich** (503 Zeichen), der einzige Unterschied ist der erklaerende Kommentar:
```
  /** Weiche Interpolation (smoothstep) — verhindert sichtbare Gitterkanten. */
  const glatt = t => t * t * (3 - 2 * t);
```
(in `terrainGen2.js:81` vorhanden, in `terrainGen3.js` **fehlt** er). `terrainGen3.js:226-227`
begruendet die Kopie selbst:
```
 * Gitterrauschen über einem 2D-Gitter — wie in `terrainGen2`, hier lokal,
 * damit dieses Modul nicht von dessen Innenleben abhängt.
```
Das ist ein **dokumentierter** Grund, also **(b)** — mit einem ausdruecklichen Vorbehalt: die Begruendung
ist eine Schichtungs-Regel („nicht vom Innenleben abhaengen"), und die wird von einem **reinen Blattmodul**
(kein Zustand, keine eigenen Importe) besser erfuellt als von einer Kopie. Das Restrisiko ist belegt:
die Kopie hat den Interpolations-Kommentar schon verloren, also **ist** bereits etwas abgedriftet, und
eine Korrektur an der Interpolation (z. B. `smoothstep` → `quintic`) erreicht nur eine der beiden
Terraingeneratoren — also genau eine Haelfte der Karten.

**Fix-Weg.** `src/shared/terrainNoise.js` mit `export function gitterrauschen(rng, spalten, zeilen)`;
`terrainGen2.js` und `terrainGen3.js` importieren sie. Die Abhaengigkeit, die `terrainGen3.js` vermeiden
will, entsteht dadurch nicht — das neue Modul hat kein Innenleben, das man kennen muesste.

### Fund 16 — Der Generator fuehrt zwei Helfer als CODE **und** als TEXT (Klasse 1, **(b)**)

`scripts/build-weapon-catalog.mjs` enthaelt ab Zeile `1083` (`const file = \`/**`) bis `1422` (`` `; ``)
ein Template-Literal — den Text des erzeugten Katalogs. Die Datei warnt selbst davor
(`build-weapon-catalog.mjs:1067-1082`, woertlich: „AB HIER BEGINNT EIN TEMPLATE-LITERAL … Wer hier
editiert, aendert die VORLAGE fuer `src/shared/config/weapons.js`"). Zwei Helfer stehen deshalb
**zweimal** in derselben Datei:

- `subcategoryFor` — `scripts/build-weapon-catalog.mjs:316` (echter Code, **wird beim Bauen benutzt**:
  `:812` `subcategory: subcategoryFor(category),`) und `:1191` (Text → `src/shared/config/weapons.js:7133`).
  Rumpf (identisch, aus der Messung): `{const treffer = WEAPON_SUBCATEGORIES.find(gruppe => gruppe.categories.includes(category)); return treffer?.id ?? null;}`
- `iconUrlFor` — `:504` (echter Code, im Generator selbst **ohne** Aufrufer: `grep -n "iconUrlFor("`
  liefert nur `:504` und `:1210`) und `:1210` (Text → `weapons.js:7152`).

Das Projekt kennt und begruendet den Zustand — `tests/weapon-builder-guard.test.js:72-74` woertlich:
„Die Laufzeit-Helfer (`getWeapon`, `orderInventoryBySubcategory`) stehen NICHT hier, sondern im
ERZEUGTEN Katalog (`src/shared/config/weapons.js`); der Generator schreibt sie als Text."
Deshalb **(b)** — und die Gesamtzahl der so verdoppelten Rumpfe ist mit **13** gemessen
(`subcategoryFor`, `iconUrlFor`, `speedFactorFor`, `strikeStyleFor`, `hasFuse`, `hasSpecialEffect`,
`subcategoryLabel`, `getWeaponsBySubcategory`, `orderInventoryBySubcategory`, `displayGroupFor`,
`displayGroupLabel`, `getDefaultLoadout`, `pickWeaponForRarity` — jede dieser Funktionen steht in
`src/shared/config/weapons.js` und in `scripts/build-weapon-catalog.mjs` mit gleichem Rumpf).

**Restrisiko (das eigentliche Ergebnis dieses Fundes).** Bei `getWeapon` und
`orderInventoryBySubcategory` ist die Sache eindeutig — sie existieren **nur** als Text. Bei
`subcategoryFor` **und** `iconUrlFor` existieren sie als **beides**: der Generator wendet
`subcategoryFor` auf die Waffendaten an (`:812`), und die emitierte Kopie wird im Client benutzt.
Driften die beiden, widersprechen sich ausgelieferte **Daten** und ausgelieferte **Funktion** — still,
weil keine Pruefung Code gegen Text stellt. `tests/rarity-weights.test.js:82-104` prueft genau so etwas
fuer **eine** Signatur (`pickWeaponForRarity` ohne Default), aber nur die **Abwesenheit** eines
Defaults, nicht die Gleichheit zweier Rumpfe.

**Fix-Weg.** Ein kleiner Test, der fuer die Helfer, die in beiden Rollen vorkommen, den normalisierten
Rumpf in `build-weapon-catalog.mjs:316` gegen den im Template-Literal (`:1191`) vergleicht — dasselbe
Normalisierungsverfahren wie hier (Kommentare und Whitespace entfernen, per Klammerzaehlung schneiden).
Alternativ: den Helfer nur noch als Text fuehren und den Generator ihn aus dem erzeugten Text
**importieren** (dann gibt es genau eine Fassung).

---

## Offen, nicht geprueft

Zeit- und Auftragsgrenze: die folgenden Klassen habe ich **angefangen, aber nicht zu Ende belegt**.
Sie stehen hier, damit die naechste Runde nicht bei Null beginnt. **Was hier steht, ist kein Befund.**

1. **`match.js:2804` `Math.round(… * 10000) / 10000`** und die gleiche Vier-Stellen-Rundung an anderen
   Stellen. Verdacht auf dieselbe Regel „Draht-/Anzeigegenauigkeit", nicht geprueft.
2. **`WATER_SCALE = 4` (`match.js:156`) und `COORD_SCALE = 4` (`protocol.js:106`)**: gleicher Wert,
   aber verschiedene Einheiten (Wasserraster vs. 0.25-px-Drahtaufloesung). Nach erster Sicht **(c)**;
   die gemeinsame Groesse 4 wurde nicht gegen alle Vorkommen geprueft.
3. **`MUZZLE_SEARCH_DISTANCE = 48` (`match.js:415`) und `MAX_SHIFT_SLOPE = 16` (`match.js:413`)**:
   die Zahlen 48 und 16 wurden nicht systematisch ueber `src/client/` und `src/shared/` gesucht.
4. **`POWER_TO_SPEED = 0.14` gegen `PULS_TEMPO = 0.14` (`weaponAnimation.js:60`)** und
   `decay: 0.14` (`effects.js:133`): nach erster Sicht **(c)** (Animations-/Partikelzeit), nicht
   abschliessend geprueft.
5. **`CRATE_FLIGHT_TICKS = 45` / `lootSystem.js:120` (`- 14`) / `match.js:2284` (`width - 12`)**:
   die Kistenmasse stehen an zwei Stellen mit **zwei** Zahlen (14 und 12). Ob das dieselbe Regel ist
   (halbe Kistenhoehe gegen Randabstand), wurde nicht entschieden — es braucht die Zeichenroutine in
   `renderer.js:685-690`.
6. **Die 21 Gruppen aus dem Koerper-Vergleich** habe ich bis auf die oben genannten und die beiden
   Werkzeugreihen (`num`, `parseArgs`) nicht einzeln verurteilt. Offen sind insbesondere die Paare,
   die **nur** aus dem Generator stammen (`speedFactorFor`, `strikeStyleFor`, `hasFuse`,
   `hasSpecialEffect`, `subcategoryLabel`, `getWeaponsBySubcategory`, `orderInventoryBySubcategory`,
   `displayGroupFor`, `displayGroupLabel`, `getDefaultLoadout`, `pickWeaponForRarity`) — sie sind in
   Fund 16 als **eine** Klasse behandelt, nicht einzeln gegen den erzeugten Text geprueft.
7. **Funktionen mit identischem Koerper in `src/engine/systems/*`**: der Detektor verlangt
   **byte-gleiche** normalisierte Rumpfe. „Gleicher Rechenweg mit einer anderen Zahl" faellt durch
   dieses Netz. Die Funde 1, 2 und 5 wurden deshalb **von Hand** gefunden (gleiche Schleifenkoepfe,
   gleiche Formeln) — ein Detektor fuer „fast gleich" (Konstanten maskieren, Abweichungen zaehlen)
   steht noch aus und ist der naheliegende naechste Schritt.

Ausserdem **nicht** ausgefuehrt (Auftrag: rein lesend, kein Testlauf): `npm test`, `npm run lint`,
`npm run checks`, Playwright. Alle Aussagen ueber „kein Test schlaegt an" stuetzen sich auf das
**Lesen** der Testdateien und auf die **Messung** in Fund 11, nicht auf einen Testlauf.
