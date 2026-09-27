# Hunter-Agent #3 — Physik, Schaden, Waffen, Ballistik

**Rolle:** Hunter-Agent #3 (Physik/Schaden/Waffen/Ballistik)
**Repo:** `ProjectArmageddon`
**Stand:** 2026-09-27
**Belegregel:** Jede Aussage trägt `datei:zeile`. Messungen sind mit dem exakten
Kommandо am Ende reproduzierbar.

---

## 0. Gegenstand

Untersucht wurden fünf Fragen zu Ballistik-Duplikaten und Zufallsströmen:

1. `match.js:323 GRAVITY = 0.32` ↔ `ballistics.js:51 PROJECTILE_GRAVITY = 0.32`
   — ist `#simulateTurretPath` eine Kopie von `integrateStep`?
2. Zieht `#rollDropThrow` aus demselben Zufallsstrom wie der Wind?
3. `speedFactorFor` — warum die Untergrenze **0,3** für `melee`?
4. `weightedRarity` — warum **20000/20000 „epic"**?
5. `GRAVITY` / `CRATE_GRAVITY` / `DEFAULT_PROJECTILE_GRAVITY` — Unterschiede?

Zusätzlich wurde die Schadenskette (Waffe → Projektil → `DamageSystem`)
belegt, weil sie zum Rollenumfang gehört (Abschnitt 6).

---

## 1. Q1 — `GRAVITY` vs `PROJECTILE_GRAVITY`: ist `#simulateTurretPath` eine Kopie von `integrateStep`?

**Antwort: Ja — `#simulateTurretPath` ist eine funktionale Kopie des
`integrateStep`-Rumpfs, mit einer zweiten Gravitationskonstanten. Netto-Bahn-
Abweichung heute: 0 px. Damit ist es eine *wertgleiche* Doppelregel
(Klasse: stille Drift-Gefahr), kein aktueller Rechenfehler.**

### 1.1 Was in `integrateStep` steht

`src/shared/ballistics.js:90-111`, Rumpf:

```js
const skala = gravityScale || 1;
const windFaktor = (windFactor === 0 || windFactor === null || windFactor === undefined) ? 1 : windFactor;
const neuesVy = (vy + gravity * skala) * drag;          // ballistics.js:108
const neuesVx = (vx + (wind || 0) * windFaktor) * drag; // ballistics.js:109
```

Die Reihenfolge ist ausdrücklich Teil der Regel (`ballistics.js:29-34`):
erst Gravitation+Wind auf die Geschwindigkeit, dann Drag auf **beide** Achsen.

### 1.2 Was in `#simulateTurretPath` steht

`src/engine/match.js:2011-2047`, Rumpf:

```js
const gravitation = GRAVITY * (waffe.gravityScale ?? 1); // match.js:2017
const wind = this.#wind;                                  // match.js:2024
const drag = DEFAULT_PROJECTILE_DRAG;                     // match.js:2029
for (let schritt = 0; schritt < TURRET_PATH_STEPS; schritt++) { // match.js:2032
  vy += gravitation;   // match.js:2033
  vx += wind;          // match.js:2034
  vx *= drag;          // match.js:2035
  vy *= drag;          // match.js:2036
  x += vx; y += vy;    // match.js:2037-2038
```

### 1.3 Zeile-für-Zeile-Vergleich

| Operation | `integrateStep` (`ballistics.js`) | `#simulateTurretPath` (`match.js`) | gleich? |
|---|---|---|---|
| Gravitation anwenden | `vy + gravity * skala` (108) | `vy += gravitation` (2033) | ✔ (Wert; s. u.) |
| Wind addieren | `vx + (wind‖0) * windFaktor` (109) | `vx += wind` (2034) | ✔ bei `windFactor=1` |
| Drag vx | `* drag` (109) | `vx *= drag` (2035) | ✔ |
| Drag vy | `* drag` (108) | `vy *= drag` (2036) | ✔ |
| Drag-Quelle | Parameter `drag` (96) | `DEFAULT_PROJECTILE_DRAG` (2029) | ✔ dieselbe Konstante |
| **Gravitations-Quelle** | `PROJECTILE_GRAVITY` / Parameter (92) | **`GRAVITY` (match.js:323)** | ✘ **andere Quelle** |
| Wind-Quelle | Parameter `wind` | `this.#wind` (2024) | ✔ (`match.wind`) |
| Terrain-Abbruch | `raycastSegment` pixelgenau (269) | `surfaceYAt` nach Schrittende (2040) | ✘ (gröber) |

**Der einzige Konstanten-Unterschied:** `match.js:2017` liest `GRAVITY`
(`match.js:323 = 0.32`), nicht `DEFAULT_PROJECTILE_GRAVITY`
(`projectileSystem.js:52 = 0.32`, importiert in `match.js:26` und **bereits
benutzt** in `match.js:735`).

### 1.4 Nachweis der Wertgleichheit (gemessen)

Zwei Bahnen wurden über 600 Ticks und vier Windwerte (`0, 0.025, 0.05, -0.05`)
Punkt für Punkt verglichen: der `#simulateTurretPath`-Rumpf vs. derselbe Rumpf
mit `integrateStep`:

```
max Abweichung #simulateTurretPath-Kern vs integrateStep = 0
```

Exit-Code 0, keine Abweichung. Die beiden Rechenkerne sind heute **bit-identisch**;
sie unterscheiden sich ausschließlich in der Herkunft der Gravitationszahl.

### 1.5 Warum das trotzdem ein Befund ist

- `ballistics.js:8-12` benennt den Geschütz-Pfad namentlich als den Pfad, der
  schon einmal „verrutscht" ist: er las `currentStrength` statt `wind` und
  draggte nur eine Achse. Damals bis **77,7 px** Zielweitenfehler
  (`match.js:1997-2005`).
- Der Test `tests/turret-ballistics.test.js:84-103` baut die Soll-Bahn
  ausdrücklich aus den **exportierten** Konstanten (`:66`, `:93`:
  `DEFAULT_PROJECTILE_GRAVITY`) nach und hält `#simulateTurretPath` dagegen —
  der Test pinnt damit `DEFAULT_PROJECTILE_GRAVITY === 0.32`.
- Ändert jemand `PROJECTILE_GRAVITY`, zielt das Geschütz **still** falsch: der
  Test bliebe grün (er liest dieselbe Konstante), aber `GRAVITY` in `match.js`
  liefe auseinander. Genau diese Fehlerklasse ist bereits in
  `docs/duplikate-bericht.md:166-190` (Fund 3) und
  `docs/waffen-balance-whitepaper.md:77-95` (§4.1) dokumentiert.

**Empfehlung (deckungsgleich mit den Vorberichten):** `match.js:323`
`const GRAVITY = 0.32;` löschen und `match.js:2017` auf
`DEFAULT_PROJECTILE_GRAVITY` (schon importiert) umstellen; den Rumpf `2011-2047`
idealerweise ganz durch `integrateStep` ersetzen.

---

## 2. Q2 — `#rollDropThrow` und der Wind: derselbe Zufallsstrom?

**Antwort: Ja. Beide ziehen aus `this.#rng` — und das ist die
`MATCH_BASE`-Teilquelle. Ein Wurf verschiebt damit die Sequenz, aus der der
Wind (und jede andere MATCH_BASE-Abfrage) später liest.**

### 2.1 Der eine Strom

`match.js:571`:

```js
this.#rng = this.#seedManager.getSubRng('MATCH_BASE');
```

`this.#rng` (das Feld) erscheint an genau diesen Stellen:

| Stelle | Verbrauch | Zweck |
|---|---|---|
| `match.js:2206` | `this.#rng.nextBoolean()` | Wurfrichtung der Kiste |
| `match.js:2226` | `this.#rng.nextFloat(PICKUP_RADIUS*1.4, PICKUP_RADIUS*3)` | Zielweite |
| `match.js:2238` | `this.#rng.nextFloat(9, 14)` | Abwurf nach oben |
| `match.js:2804` | `this.#rng.nextFloat(-MAX_WIND, MAX_WIND)` | **Wind** (`#rollWind`) |
| `match.js:1628` | `rng: this.#rng` | an `shooting.js` gereicht → Zufallswirkung `shooting.js:637` (`quelle.rng.nextIntBelow(...)`) |

`#rollDropThrow` (`match.js:2205-2240`) verbraucht **drei** Züge aus
MATCH_BASE, `#rollWind` (`match.js:2803-2805`) einen.

### 2.2 Getrennt gehaltene Ströme (Gegenprobe)

`seed.js:20-31` legt je Teilbereich einen **eigenen** Seed-Offset fest:

```
MATCH_BASE 0 · LOOT 1_000_000 · TERRAIN 2_000_000 · WEAPONS 3_000_000
EFFECTS 4_000_000 · GUENTHER 5_000_000
```

`getSubRng` memoisiert je Offset eine eigene `SeededRandom`-Instanz
(`seed.js:53-77`). Loot, Terrain, Effekte und Günther sind damit sauber vom
MATCH_BASE-Strom entkoppelt (`match.js:916` LOOT, `:915` EFFECTS, `:619`
GUENTHER, `:804` TERRAIN).

### 2.3 Einordnung

- **Determinismus: unkritisch.** Alles läuft über den gesäten PRNG, kein
  `Math.random` (`loot.js:5` hält die Regel fest). Server und Client führen
  dieselbe Sequenz.
- **Kopplung: real.** Wind wird zwar nur zum Runden-/Matchstart gezogen
  (`match.js:659`, `match.js:2703`), aber er liest denselben Zeiger, den
  Abwürfe und die Zufallswirkung aus `shooting.js` weiterziehen. Wer eine
  Waffe abwirft, verändert damit die Zahl, die die **nächste** Windrunde
  ergibt — und umgekehrt. Zwei fachlich unabhängige Systeme (Wurf-Mechanik,
  Match-Wind) teilen sich einen Strom, obwohl die Seed-Infrastruktur genau
  dafür Offsets bereithält (`seed.js:16-18`).
- **Folge für den Test-/Replay-Aufwand:** Weil Wurf und Wind denselben Strom
  belegen, ist eine gezielte Wind-Reproduktion nicht ohne Nachbildung aller
  Abwürfe möglich — es gäbe einen sauberen `WIND`-Offset her.

---

## 3. Q3 — `speedFactorFor`: warum die Untergrenze 0,3 für `melee`?

**Antwort: Weil die Wurfgeschwindigkeiten (27–41 px) absichtlich weit unter
der Bezugsgeschwindigkeit 70 px liegen. Mit der Geschoss-Untergrenze 0,6 wären
ALLE Würfe auf denselben Faktor geklemmt worden und ihre Differenzierung über
`knockback` verloren gegangen.**

### 3.1 Der Code

`src/shared/config/weapons.js:11-36`:

```js
export const REFERENCE_PROJECTILE_SPEED = 70;               // weapons.js:11
export function speedFactorFor(weapon) {
  const roh = weapon.projectileSpeed;
  if (!Number.isFinite(roh) || roh <= 0) return 1;          // weapons.js:16
  const untergrenze = weapon.category === 'melee' ? 0.3 : 0.6; // weapons.js:34
  return Number(Math.min(1.6, Math.max(untergrenze, roh / REFERENCE_PROJECTILE_SPEED)).toFixed(4)); // :35
}
```

### 3.2 Die Begründung (steht im Quelltext selbst)

`weapons.js:17-33`:

- **0,6 für Geschosse:** ein Ausreißer in den Quelldaten darf die Bahn nicht
  unspielbar machen (`weapons.js:20-22`).
- **0,3 für Würfe:** eine geworfene Waffe ist absichtlich deutlich langsamer —
  Wurfgeschwindigkeit 27–41 gegen 70 bei Geschossen (`weapons.js:24-25`).
  Mit 0,6 wurden **alle** Würfe auf denselben Faktor geklemmt; gemessen ergaben
  Baseballschläger (27,2) und Schaufel (40,8) **identische** Werte, die
  Differenzierung über `knockback` ging verloren (`weapons.js:26-28`).
- **Nicht global gesenkt:** das hätte die Bahnkurven aller Geschosse verändert —
  „eine Balance-Änderung an 129 Waffen, um 21 zu retten" (`weapons.js:30-31`).

### 3.3 Belege / Werte

| Waffe | `projectileSpeed` | `speedFactor` | Quelle |
|---|---|---|---|
| Baseballschläger | 27,2 | 0,3886 | `weapons.js:68`, `:90` |
| Untergrenze melee (roh < 21) | — | 0,3000 | `tests/melee-throw.test.js:140` |
| Untergrenze ranged | — | 0,6000 | `tests/melee-throw.test.js:142`, `tests/range-cooldown.test.js:62` |
| Obergrenze | — | 1,6000 | `tests/melee-throw.test.js:144`, `tests/range-cooldown.test.js:57` |
| ohne Wert | — | 1 | `tests/melee-throw.test.js:145-146` |

Der Wurfwert liegt bei `40,8/70 = 0,5829` (`tests/melee-throw.test.js:137`) —
also genau unter der alten 0,6-Grenze, was den ursprünglichen Kollaps belegt.

### 3.4 Wichtige Nebenbedingung (aus dem Generator)

`speedFactorFor` existiert in **zwei** Fassungen: als Generatorfunktion
(`scripts/build-weapon-catalog.mjs:646`) und als im Katalog **eingebettete**
Kopie (`src/shared/config/weapons.js:14`, erzeugt über
`build-weapon-catalog.mjs:1096`). Außerdem ist die Reihenfolge
„Wurf-Ableitung VOR `speedFactorFor`" bindend
(`build-weapon-catalog.mjs:977`, `MASTERDOTO.md:4114-4115`): stand der Wurf
dahinter, flog er mit 70 statt 27 („galt als 850 px weit").

---

## 4. Q4 — `weightedRarity`: warum 20000/20000 „epic"?

**Antwort: Weil die Gewichtstabelle nach `powerTier`-Namen benannt ist, die
Ziehungsliste aber die vier Quell-Rarities trägt. Nur `epic` kommt in beiden
Räumen vor — alle anderen Gewichte werden zu 0, die Ziehung kollabiert auf
`epic`. Gemessen: 20000 von 20000.**

### 4.1 Die beiden Tabellen mit verschiedenen Schlüsselmengen

`src/engine/systems/lootSystem.js:80-81`:

```js
export const RARITY_IDS = Object.freeze(['standard', 'enhanced', 'premium', 'epic']);          // 4 Namen
export const RARITY_WEIGHTS = Object.freeze({ common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 }); // 5 Namen
```

Die Namensliste in `loot.js:22` (`LOOT_DROP_RULES.rarities`) ist
wertgleich mit `RARITY_IDS` (duplikate-bericht.md:408-430, Fund 10).

### 4.2 Die Paarung

`lootSystem.js:124-125`:

```js
const rarityName = weightedRarity(activeRng, RARITY_WEIGHTS, RARITY_IDS);
const rarityId = Math.max(0, RARITY_IDS.indexOf(rarityName));
```

`weightedRarity` verbindet Liste und Tabelle über `loot.js:53`:

```js
const weightArray = rarities.map(r => weights[r] || 0);
```

Damit gilt: `weights[r] || 0` → **`[0, 0, 0, 6]`** (nur `epic` existiert in
`RARITY_WEIGHTS`). `totalWeight = 6`, `threshold = rng.next() * 6 ∈ [0, 6)`;
`cumulative` erreicht 6 erst bei Index 3 → **immer `epic`**
(`loot.js:61-71`).

### 4.3 Messung (reproduziert am 2026-09-27)

```
RARITY_IDS     = ["standard","enhanced","premium","epic"]
RARITY_WEIGHTS = {"common":55,"uncommon":25,"rare":12,"epic":6,"legendary":2}
weightedRarity(RARITY_WEIGHTS, RARITY_IDS) ueber 20000: {"epic":20000}
Gewichte ueber RARITY_IDS gelesen: [["standard",0],["enhanced",0],["premium",0],["epic",6]]
Gegenprobe mit powerTier-Namen: {"common":13571,"uncommon":3572,"rare":1714,"epic":857,"legendary":286}
```

Deckt sich mit `docs/duplikate-bericht.md:452-470` (Fund 11).

### 4.4 Folge und warum das nicht auffällt

- `rarity: rarityId` (`lootSystem.js:136`) ist damit **immer 3**; der Renderer
  zeichnet **jede** Rundenkiste als `epic` (`renderer.js:687`,
  duplikate-bericht.md:471-473).
- **Kein Test schlägt an**, weil das Ergebnis deterministisch bleibt: der
  `rng.next()`-Verbrauch in `weightedRarity` ist unverändert
  (duplikate-bericht.md:475-479).
- **Die Gewichte selbst sind nicht falsch** — eine Zeile später ist dieselbe
  Tabelle korrekt: `pickWeaponForRarity` liest
  `weights[weapon.powerTier] ?? weights[weapon.rarity]` (`weapons.js:7348`,
  gerufen in `lootSystem.js:127`). Falsch ist allein die **Paarung**.

**Empfehlung (aus dem Vorbericht):** eine Quelle —
`weightedRarity(activeRng, RARITY_WEIGHTS, Object.keys(RARITY_WEIGHTS))` *oder*
Gewichte auf den `RARITY_IDS`-Raum umschreiben, plus Test, der
`new Set(Object.keys(RARITY_WEIGHTS))` gegen `new Set(RARITY_IDS)` prüft.

---

## 5. Q5 — `GRAVITY` / `CRATE_GRAVITY` / `DEFAULT_PROJECTILE_GRAVITY`

| Name | Wert | Ort | Rolle |
|---|---|---|---|
| `PROJECTILE_GRAVITY` | **0.32** | `ballistics.js:51` | **Die Quelle.** Aus ihr lesen alle. |
| `DEFAULT_PROJECTILE_GRAVITY` | **0.32** | `projectileSystem.js:52` (`= PROJECTILE_GRAVITY`) | Alias/Re-Export; Vorgabe des `ProjectileSystem`-Konstruktors (`projectileSystem.js:74`) und Import für `match.js:26`. |
| `GRAVITY` | **0.32** | `match.js:323` | **Lokale Zweitkopie** des Werts; einziger Leser `match.js:2017` (`#simulateTurretPath`). |
| `CRATE_GRAVITY` | **0.30** | `match.js:326` | **Bewusst anderer Wert** für abgeworfene Kisten; Leser `match.js:2275`. |

### 5.1 Die drei „0.32"-Namen

`PROJECTILE_GRAVITY`, `DEFAULT_PROJECTILE_GRAVITY` und `GRAVITY` sind
**wertgleich (0.32)** und meinen dieselbe Sache. Zwei davon
(`DEFAULT_PROJECTILE_GRAVITY`, `GRAVITY`) sind zusätzliche Namen:

- `DEFAULT_PROJECTILE_GRAVITY` ist ein legitimierter Alias/Re-Export und wird
  auch von Client/Tests geführt (`shotPrediction.js:59` `PREDICTION_GRAVITY`,
  `tests/shot-prediction.test.js:41` pinnt die Gleichheit).
- `GRAVITY` (`match.js:323`) ist die **eine überflüssige Kopie** — der Kommentar
  daneben behauptet selbst „derselbe Wert wie im ProjectileSystem"
  (`match.js:322`), zieht aber keine Verbindung zur Quelle.

### 5.2 `CRATE_GRAVITY = 0.30` ist absichtlich verschieden

`match.js:325-326`:

```js
/** Fallbeschleunigung abgeworfener Kisten (px pro Tick²). */
const CRATE_GRAVITY = 0.30;
```

Der Grund steht bei `match.js:2272-2274`: „Eigene Fallbeschleunigung für Kisten:
schwächer als bei Geschossen, damit der Wurf sichtbar dauert. Ein Geschoss soll
schnell ans Ziel, eine abgeworfene Waffe soll fliegen." Der Kisten-Schritt
(`match.js:2275-2278`) nutzt dieselbe Drag-Konstante wie das Geschoss
(`DEFAULT_PROJECTILE_DRAG`) und den Wind mit Faktor `0.8` (`match.js:2276`) —
hier ist der Wind absichtlich gedrosselt, beim Geschütz-Rumpf nicht.

### 5.3 Zusammenfassung der Klasse

- **Redundanz (wertgleich):** `GRAVITY` ↔ `PROJECTILE_GRAVITY` → stille
  Drift-Gefahr; Fix wie in §1.5.
- **Beabsichtigte Abweichung:** `CRATE_GRAVITY 0.30` — kein Duplikat, sondern
  eine begründete Balance-Entscheidung. Der DRAG- und Wind-Wert dagegen sind
  erneut handkopierte Rümpfe (§7).

---

## 6. Beigabe — die Schadenskette (Rollenumfang Schaden/Waffen)

Weil die Rolle auch „Schaden/Waffen" umfasst, hier die belegte Kette
Waffe → Projektil → Ziel:

1. **Schadenszusammenstellung beim Spawn** — `shooting.js:278`:
   `damage = weapon.damage * profile.damageMultiplier * statuses.damageMultiplier(playerId)`
   (`combatProfile` aus `shooting.js:179-182`).
2. **Trefferfenster / Flächenradius** — `shooting.js:297-298`:
   `blastRadius: weapon.blastRadius || (weapon.category === 'melee' ? 0 : 24)`.
   Der 24-px-Fallback gilt **nicht** für `melee` (Begründung `shooting.js:279-296`:
   ein direkt am Körper abgeworfener Schläger traf sonst den Schützen selbst —
   gemessen 104 Schaden am Schützen, 0 am Ziel).
3. **Direkttreffer (kein Flächenradius)** — `projectileSystem.js:411-414`:
   voller Schaden nur auf das getroffene Ziel.
4. **Flächenschaden mit Abfall** — `projectileSystem.js:416-443`:
   `falloff = Math.max(0.25, 1 - dist / blastRadius)` (`:429-430`),
   `applied = damage * falloff` (`:430`).
5. **Rückstoß** — `projectileSystem.js:437`:
   `impulse = knockback * falloff * knockbackMultiplier * 0.02`.
6. **Durchschlag (`piercing`)** — `projectileSystem.js:240-270`: voller Schaden
   an der Figur, Flug geht weiter; Terrain hält (`:236-239`); Schutzfenster
   `PIERCE_SCHUTZ_TICKS = 4` (`projectileSystem.js:68`) und Versatz hinter die
   Figur (`:260-263`) verhindern Doppeltreffer.
7. **Schadensanwendung** — `damageSystem.js:61-113`: erst Flat-, dann
   Prozent-Resistenz (`:70-72`, `COMBAT_RULES.resistanceCap`), danach
   Schild/Rüstung über `world.services.damageModifier` (`:78-86`). Schadensart
   (`damageType`) reist vom Projektil (`shooting.js:276`) bis ins `damage`-Event
   (`damageSystem.js:109-110`).
8. **Tod** — `damageSystem.js:36-41`: einmalig, `#handledDeaths`, danach
   `removeEntity`.
9. **Zündende Waffen** — Granate zündet nicht beim Aufprall, sondern nach
   `fuseTicks` (`projectileSystem.js:191-226`; Dauer aus `fuseTicksFor`,
   `shooting.js:392-396`, geprüft von `scripts/check-fuses.mjs`).
10. **Zufallswirkung** — `shooting.js:632-641` zieht über `quelle.rng` =
    `#rng` = **MATCH_BASE** (siehe §2): auch die Selbstwirkung teilt sich den
    Wind-Strom.

---

## 7. Befundtafel (Priorität)

| # | Befund | Ort | Klasse | Wirkung heute | Belegt durch |
|---|---|---|---|---|---|
| P1 | `GRAVITY` ist Zweitkopie von `PROJECTILE_GRAVITY`; `#simulateTurretPath` rechnet den `integrateStep`-Rumpf nach | `match.js:323`,`:2017`,`:2032-2036` | stille Drift | Bahn identisch (Δ=0), aber still falsch bei Konstanten-/Rumpf-Änderung | §1.4 Messung; duplikate-bericht.md:166-190 |
| P2 | `weightedRarity`-Paarung kollabiert die Seltenheit auf `epic` | `lootSystem.js:124-125`,`:80-81`; `loot.js:53` | belegte Fehlwirkung | 20000/20000 `epic`; jede Kiste „epic" | §4.3 Messung; duplikate-bericht.md:432-492 |
| P3 | Kisten-Schritt ist dritte Kopie des Integrationsrumpfs | `match.js:2275-2278` | Redundanz | bewusst anderes `CRATE_GRAVITY`, aber Rumpf handkopiert | §5.2; duplikate-bericht.md:147-162 |
| P4 | Wurf und Wind teilen den MATCH_BASE-Strom | `match.js:2205-2240` ↔ `:2803-2805` | Kopplung | deterministisch, aber fachlich unabhängige Systeme verkoppelt | §2 |
| P5 | `speedFactorFor` liegt als Generator- **und** Katalog-Kopie vor | `build-weapon-catalog.mjs:646`,`:1096`; `weapons.js:14` | Redundanz | eine Korrektur trifft nur eine Kopie | MASTERDOTO.md:4115; §3.4 |

> P1–P3 sind bereits in den Vorberichten `docs/duplikate-bericht.md` und
> `docs/waffen-balance-whitepaper.md` als Funde geführt. Dieser Bericht
> bestätigt sie **mit unabhängigen Messungen** und ordnet P4 (Zufallsstrom) und
> P5 (Generator-/Katalog-Kopie) ergänzend ein.

---

## 8. Reproduktion

```bash
cd "ProjectArmageddon"
# weightedRarity-Kollaps + Bahnvergleich (Node 22)
node ./hunter3-probe.mjs    # Skript s. u.; läuft mit --import-freundlichem ESM
```

Probe-Skript (im Repo-Wurzelverzeichnis ausführen, weil Importe relativ sind):

```js
import { weightedRarity } from './src/shared/config/loot.js';
import { RARITY_IDS, RARITY_WEIGHTS } from './src/engine/systems/lootSystem.js';
import { PROJECTILE_GRAVITY, integrateStep } from './src/shared/ballistics.js';
import { DEFAULT_PROJECTILE_GRAVITY, DEFAULT_PROJECTILE_DRAG } from './src/engine/systems/projectileSystem.js';
import { POWER_TO_SPEED } from './src/engine/match.js';
// ... (voller Lauf: 20000 Ziehungen vs. Bahnvergleich; Ergebnis s. §1.4 / §4.3)
```

Bereits vorhandene, einschlägige Tests:

```bash
node --test tests/turret-ballistics.test.js   # Geschütz-Pfad == echte Bahn
node --test tests/melee-throw.test.js         # speedFactorFor-Untergrenze 0,3
node --test tests/loot.test.js                # weightedRarity (prüft NICHT die Paarung)
```

---

## 9. Was dieser Bericht NICHT behauptet

- Kein aktueller **Rechenfehler** in der Geschütz-Bahn: die Abweichung ist
  heute 0 px (§1.4). Der Befund ist die **Doppelregel**, nicht die Zahl.
- `CRATE_GRAVITY = 0.30` ist **kein** Duplikat, sondern eine begründete
  Abweichung (§5.2).
- Die Kopplung aus §2 ist **kein Determinismus-Fehler** (alles gesät) — sie ist
  eine Wartbarkeits-/Nachvollziehbarkeits-Frage.
