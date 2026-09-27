# Waffen-Verkabelung: welche Felder wirken — und welche nur dastehen

**Auftrag:** „alle Waffen analysiert, Parameter bestimmt, sprite sheets,
waffenanimationen, namen, beschreibung, zuordnung munition, explosion, gadgets,
drop, rarity" — die Antwort darauf war einmal NEIN. Diese Datei beantwortet sie
NICHT pauschal, sondern **feldweise mit Zahlen**: 150 Waffen, 41 Feldnamen, je
Feld: wie viele Waffen tragen es, wer liest es, welches Gate prüft es.

**Der Satz, an dem alles hängt:** Ein Feld, das niemand liest, ist keine
Eigenschaft, sondern eine **Behauptung**. Dieses Projekt hat die Folgen zweimal
getragen — eine Gewichtstabelle, die nie traf, weil die Namensräume nicht
zusammenpassten (Kisten dadurch IMMER epic), und ein Messwerkzeug, das die
Wirkung von 43 Waffen als 0 meldete, weil es nur an EINER Entfernung maß. Diese
Datei sucht dieselbe Fehlerklasse im Waffenkatalog.

## 0. Messmethode (und ihre Grenze)

* Gemessen wird gegen den **erzeugten Katalog** (`src/shared/config/weapons.js`),
  nicht gegen die Designdatei: Nur was im Katalog steht, erreicht den Motor.
* Ein **Leser** ist ein Vorkommen des Feldnamens als Eigenschaftszugriff
  (`weapon.feld`) oder als Zeichenkette (`'feld'`) in `src/**` **ohne** die
  Katalogdatei selbst und **ohne Kommentare**. Prosa zählt nicht.
* Die Messung ist eine Textmessung: Sie kann einen Schreibvorgang für einen
  Lesevorgang halten. Sie irrt damit in die richtige Richtung — sie erkennt
  **eher einen Leser zu viel** als zu wenig. Kein Feld wird leichtfertig als
  „ohne Leser" gemeldet.
* Grenze der Gegenrichtung: Ein Feld, dessen Name ein häufiges Wort ist
  (`index`, `id`, `category`), gilt schnell als gelesen. Für die 13 Felder ohne
  Leser wurde deshalb zusätzlich **von Hand** in den Code gesehen; die Befunde
  stehen in Abschnitt 3 mit Datei und Zeile.

## 1. Feldtabelle — 41 Feldnamen, 150 Waffen

Leser-Spalten zählen **Dateien** (nicht Vorkommen). `Motor 0` heißt: keine
einzige Datei unter `src/engine/**` liest das Feld. „Gate" nennt die
Prüfwerkzeuge, die den Feldnamen anfassen; „— keines —" heißt: kein Gate der
Gate-Batterie (`npm run checks`) prüft dieses Feld.

| Feld | Waffen mit Wert | versch. Werte | Leser (Dateien) | Gate | ohne Produktleser |
|---|---:|---:|---|---|---|
| `aoe` | 56/150 | 1 | Motor 0 | check:effects | JA |
| `blastRadius` | 56/150 | 22 | Motor 3 (shooting.js, systems/projectileSystem.js, turret.js), Client 2, geteilt 1 | balance, matrix:check, check:effects |  |
| `bounces` | 24/150 | 2 | Motor 2 (shooting.js, systems/projectileSystem.js) | check:effects |  |
| `category` | 150/150 | 8 | Motor 1 (shooting.js), Client 1, geteilt 1 | balance, matrix:check, check:docs, check:fuses, check:range |  |
| `concept` | 8/150 | 8 | Motor 0 | — keines — | JA |
| `cooldown` | 106/150 | 3 | Motor 1 (match.js), Client 1 | — keines — |  |
| `cooldownSource` | 0/150 | 0 | Motor 0 | — keines — | JA |
| `damage` | 143/150 | 50 | Motor 11 (init.js, match.js, shooting.js, …), Client 3, geteilt 5 | balance, matrix:check, check:effects, check:range, measure:npc |  |
| `damageSource` | 150/150 | 3 | Motor 0 | balance | JA |
| `damageType` | 150/150 | 27 | Motor 5 (match.js, shooting.js, systems/damageSystem.js, …) | check:damage-types |  |
| `damageTypeSource` | 150/150 | 2 | Motor 0 | — keines — | JA |
| `delivery` | 150/150 | 2 | Motor 1 (shooting.js), Client 1, geteilt 1 | balance, matrix:check, check:effects, check:fuses, check:range |  |
| `displayName` | 150/150 | 150 | Motor 2 (match.js, shooting.js), Client 3 | balance, matrix:check, check:damage-types, check:fuses, check:range, check:targeting |  |
| `effectMagnitude` | 4/150 | 4 | Motor 0 | — keines — | JA |
| `elemental` | 24/150 | 21 | Motor 1 (specials.js), geteilt 1 | matrix:check, check:effects |  |
| `fuseIntent` | 18/150 | 2 | Motor 0 | check:fuses | JA |
| `fuseTime` | 11/150 | 4 | Motor 1 (shooting.js) | matrix:check, check:docs, check:fuses |  |
| `gravityScale` | 150/150 | 9 | Motor 4 (match.js, shooting.js, systems/projectileSystem.js, …), Client 1 | check:fuses |  |
| `homing` | 2/150 | 2 | Motor 2 (shooting.js, systems/projectileSystem.js) | matrix:check, check:effects |  |
| `icon` | 150/150 | 150 | Motor 0 | — keines — | JA |
| `iconPath` | 150/150 | 150 | Motor 0 | — keines — | JA |
| `id` | 150/150 | 150 | Motor 9 (ecs/componentStore.js, ecs/world.js, inventory.js, …), Client 5, Server 3, geteilt 7 | balance, perf:browser, check:biome, check:damage-types, check:effects, check:fuses, check:range, check:targeting, balance:classes, measure:npc |  |
| `index` | 150/150 | 150 | Motor 5 (match.js, shooting.js, systems/lootSystem.js, …), Client 1, geteilt 1 | balance, matrix:check |  |
| `internalName` | 150/150 | 150 | Motor 0 | — keines — | JA |
| `knockback` | 73/150 | 17 | Motor 3 (shooting.js, systems/projectileSystem.js, turret.js) | matrix:check, check:effects |  |
| `maxAmmo` | 150/150 | 5 | Motor 2 (inventory.js, shooting.js), geteilt 1 | balance |  |
| `maxRange` | 150/150 | 63 | Motor 3 (match.js, shooting.js, specials.js), Client 1, geteilt 1 | check:map, check:range |  |
| `piercing` | 6/150 | 1 | Motor 1 (shooting.js) | matrix:check, check:effects |  |
| `powerScore` | 144/150 | 132 | Motor 0, Client 1 | balance |  |
| `powerTier` | 150/150 | 5 | Motor 0, Client 1, geteilt 1 | balance |  |
| `projectileSpeed` | 96/150 | 24 | Motor 0 | check:map, check:reichweite | JA |
| `rarity` | 150/150 | 3 | Motor 2 (match.js, stateSnapshot.js), Client 1, geteilt 1 | — keines — |  |
| `requiresLineOfSight` | 13/150 | 1 | Motor 1 (shooting.js) | check:damage-types |  |
| `requiresLineOfSightSource` | 150/150 | 2 | Motor 0 | check:damage-types | JA |
| `sourceRarity` | 150/150 | 3 | Motor 0 | balance | JA |
| `special` | 150/150 | 118 | Motor 1 (specials.js), geteilt 1 | balance, matrix:check, check:damage-types, check:range, check:targeting |  |
| `speedFactor` | 150/150 | 24 | Motor 1 (match.js), geteilt 2 | check:fuses, check:reichweite |  |
| `strikeStyle` | 150/150 | 3 | Motor 1 (shooting.js) | check:damage-types |  |
| `subcategory` | 150/150 | 4 | Motor 0, Client 1, geteilt 1 | — keines — |  |
| `targeting` | 150/150 | 2 | Motor 1 (shooting.js) | check:damage-types, check:targeting |  |
| `terrainDamage` | 18/150 | 15 | Motor 3 (shooting.js, systems/projectileSystem.js, turret.js), geteilt 1 | balance, matrix:check, check:effects |  |

**Anmerkungen zur Tabelle (nachgemessen, sonst wäre sie irreführend):**

* `powerTier` zeigt `Motor 0`, weil die Treffer in `match.js` und
  `lootSystem.js` **Kommentare** sind. Der echte Produktleser steht in
  `pickWeaponForRarity` — und die Funktion liegt **in der Katalogdatei selbst**,
  aufgerufen von `lootSystem.js`, `guentherSystem.js` und
  `shared/config/loadouts.js`. Sie wird von der Messung ausgenommen (Selbstbezug),
  ist aber ein vollwertiger Leser.
* `rarity` hat einen Motorleser (`match.js:2179`) — aber siehe Abschnitt 5, der
  Wert **kommt dort nie an**. Die zweite Motorzeile (`stateSnapshot.js:156`) und
  der Client-Treffer (`renderer.js:891`) lesen das `rarity`-Feld der **Kiste**,
  nicht das der Waffe: Auch das sind Namensgleichheiten.
* `subcategory` zeigt `Client 1` — der Treffer ist `kopf.dataset.subcategory`
  (`hud.js:491`), ein **DOM-Attributname**, kein Waffenfeld. Der echte Leser des
  Feldes steht in `displayGroupFor` **in der Katalogdatei** (der Client ruft sie) —
  dieselbe Sachlage wie bei `powerTier`.
* Damit ist die Richtung des Messfehlers belegt: Die Textsuche erkennt **eher
  einen Leser zu viel** (Namensgleichheiten: DOM-Attribute, Kistenfelder,
  Ereignisfelder) — nie einen zu wenig. Für die Frage „hat dieses Feld einen
  Leser?" ist das die sichere Richtung: Ein Feld wird nicht fälschlich als
  ungelesen gemeldet, und die ungelesenen Felder in Abschnitt 3 sind von Hand
  nachgeprüft (Datei und Zeile genannt).
* `iconPath` hat keinen Leser außerhalb der Katalogdatei, weil `iconUrlFor` — der
  Leser — **in** der Katalogdatei steht und vom Client nur aufgerufen wird. Das
  ist Absicht (der Pfad ist relativ zu dieser Datei; außerhalb aufgelöst zeigte
  er ins Leere).

## 2. Die drei belegten Befunde: heutiger Stand

Alle drei waren einmal dokumentiert. Stand **2026-09-27**, gemessen am Katalog:

| Befund (damals) | Heute | Beleg |
|---|---|---|
| `damageType` bei 26 von 150 pauschal `physical` | **geheilt.** 150/150 tragen eine Art, 124 aus der Designdatei (`source`), 26 abgeleitet (`derived`). Die 26 Abgeleiteten verteilen sich auf physical 16, explosive 6, arcane 3, fire 1 — nicht mehr ein Einheitswert. 27 der 27 bekannten Arten (`src/engine/damageTypes.js`) sind im Gebrauch. | `npm run check:damage-types` → `Fehler: 0, Warnungen: 0` |
| `requiresLineOfSight` bei ALLEN 150 auf `false` | **geheilt.** 13/150 verlangen freie Sicht (Quelle: abgeleitet aus der Feuerart; die Designdatei führt weiter für alle 150 `false` — das Feld ist dort also ein Platzhalter). Der Motor **entscheidet** damit: `shooting.js:163` lehnt den Schuss ohne Sichtlinie ab. | `npm run check:damage-types`: „13 von 150 Waffen verlangen freie Sicht"; Leser `src/engine/shooting.js:163` (nicht in einem Kommentar) |
| `targeting`: 11 Widersprüche zur Wirkung | **geheilt.** 150/150 tragen eine Zielart (114 `directional`, 36 `self_or_area`), Widersprüche zur Wirkung: **0**. | `npm run check:targeting` → `Übereinstimmend: 150, Widersprüche: 0` |

**Aber:** „belegt" ist nicht „wirkt". Für `targeting` gilt: Der Wert wird
gelesen (`shooting.js:218`) — und dann **in das `shot`-Ereignis kopiert**, wo ihn
niemand abnimmt (kein Client-, Server- oder Motorleser des Ereignisfeldes). Die
Zielart ist damit korrekt und konsistent, aber **entscheidungsunwirksam**: Ob ein
Angriff auf den Schützen geht, entscheidet weiterhin allein die Wirkung
(`buildEffect`/`SELF_TARGET_KINDS`). Das Feld `weapon.targeting` ist die
**Prüfbasis** von `check:targeting` und wäre der richtige Ausgangspunkt für eine
Anzeige — es ist aber heute kein Merkmal, das etwas steuert.

## 3. Felder ohne Produktleser — Urteil je Feld

**13 Feldnamen** haben keinen Leser unter `src/**` (ohne Katalogdatei). Sie sind
jetzt **einzeln** beurteilt. Die Begründungen stehen als EINE Quelle im Generator
(`scripts/build-weapon-catalog.mjs`, `FELDER_OHNE_PRODUKTLESER_BEWUSST` /
`FELDER_OHNE_PRODUKTLESER_OFFEN`) und werden von
`tests/weapon-field-wiring.test.js` gegen den Katalog geprüft: **Ein Feld ohne
Leser, das dort nicht steht, lässt den Test rot werden.**

### 3a. Bewusst ohne Leser (12) — je mit Aufgabe

| Feld | Waffen mit Wert | Aufgabe (kurz) |
|---|---:|---|
| `aoe` | 56 | Abgeleiteter Alias von `blastRadius > 0`; `check:effects` prüft die Gleichheit beider Felder als Invariante. |
| `concept` | 8 | Beschreibung des Zielkonflikts der acht Waffen mit eigener Identität; Adressat ist der Mensch. `tests/weapon-identity.test.js` liest sie. |
| `cooldownSource` | 0 (alle 0) | Herkunftsnachweis: der `cooldown`-Wert der Designdatei ist konstant 0 — der Nachweis belegt, dass die Nachladezeit **hergeleitet** ist. |
| `damageSource` | 150 | Herkunft des Schadenswerts (`source`/`derived`); `npm run balance` und `tests/assets.test.js` lesen ihn. |
| `damageTypeSource` | 150 | Herkunft der Schadensart (124/26); `tests/weapon-damage-types.test.js` liest ihn. |
| `fuseIntent` | 18 | Zünder-**Absicht** der Designdatei; der Motor liest `fuseTime` (das Abgeleitete), `check:fuses` vergleicht beide. In `shooting.js` steht der Name nur in einem Kommentar. |
| `icon` | 150 | Quell-Dateiname des Assets; Eingabe der Pfadableitung `iconPathFor`. |
| `iconPath` | 150 | Gelesen von `iconUrlFor` **in der Katalogdatei**; der Client ruft nur `iconUrlFor(weapon)`. |
| `internalName` | 150 | Stabile ASCII-Kennung der Designdatei für Werkzeuge; Anzeigenamen dürfen wandern, sie nicht. |
| `projectileSpeed` | 96 | Quellwert; der Motor liest `speedFactor` (normalisiert). Zwei Aussagen über dieselbe Größe wären der Fehler, den dieses Feld vermeidet. |
| `requiresLineOfSightSource` | 150 | Herkunftsnachweis der Sichtlinie; `check:damage-types` prüft damit, dass das Merkmal nicht erfunden wurde. |
| `sourceRarity` | 150 | Unveränderte Quell-Rarität neben `powerTier`; `npm run balance` berichtet beide. |

### 3b. Offene Lücke (1) — Leser fehlt, gemeldet

| Feld | Waffen mit Wert | Befund |
|---|---:|---|
| `effectMagnitude` | 4 (64 / 72 / 150 / 165) | **Der Motor befragt den Wert nicht.** `buildEffect` (`src/engine/specials.js`) setzt für `MOVE`/`PULL` `distance: SPECIAL_DEFAULTS.moveDistance` = **60** für alle. Gemessen: Raketenrucksack (`pa_032`, 64) und Gleitschirm (`pa_114`, 150) springen **beide exakt 60 px** — die zugesagte Abgrenzung „kurzer, häufiger Satz" gegen „weit, aber mit Pause" existiert im Spiel **nicht**; die beiden unterscheiden sich nur über Munition (6/3) und Abklingzeit (0/2). Dasselbe gilt für Dimensionssprung (72) / Dimensionsriss (165). |

**Vorschlag (nicht ausgeführt — `src/engine/specials.js` gehört einem anderen
Arbeiter):** im `MOVE`-Zweig von `buildEffect` `distance: weapon.effectMagnitude || SPECIAL_DEFAULTS.moveDistance`
setzen. Dann trägt der Gleitschirm 150 statt 60 — die Reichweite wächst und die
Paarung wird echt. Achtung: das ist eine **Balance-Änderung** (pa_032/087/088
werden weiter) und der Replay-Zustandshash kann wandern; der Wert muss also
bewusst gesetzt werden, nicht als Nebenwirkung. Der Vorschlag greift den
Raketenrucksack (`effectMagnitude` 64 → weiter als heute) mit — wer ihn nicht
bewegen will, setzt für ihn bewusst 60.

**Bis dahin** ist die Lücke festgehalten, nicht behauptet:
`tests/weapon-field-wiring.test.js` prüft in Zahlen, dass alle vier Geräte
**dieselbe** Distanz bekommen — der Test **schlägt fehl**, sobald jemand den
Leser nachträgt, weil dann die Zusage eine andere ist. Ein Test, der einen
Fehler festhält, ist nur so lange sinnvoll, wie er beim Beheben auffällt.

### 3c. Gefunden UND behoben in diesem Auftrag: `cooldownTurns`

`cooldownTurns` stand als **42. Feldname** im Katalog — bei vier Waffen
(`pa_032`, `pa_087`, `pa_088`, `pa_114`), zwei davon mit dem Wert 2 — und hatte
**keinen Leser**. Es war kein Waffenfeld, sondern ein **Steuerfeld** der
`WEAPON_IDENTITIES`-Tabelle, das durch `Object.assign(weapon, identity.overrides)`
mit in die Ausgabe lief: ein **Schattenfeld von `cooldown`** mit demselben
Inhalt. Zwei Felder für dieselbe Aussage laufen auseinander, ohne dass es
auffällt — genau die Fehlerklasse. Die Kopie im Generator schleust das
Steuerfeld jetzt nicht mehr mit (`scripts/build-weapon-catalog.mjs`), das Feld
ist aus allen 150 Waffen verschwunden; `cooldown` bleibt die eine Aussage.

## 4. Die Lücke zwischen „Gate" und „Leser"

`scripts/check-effects.mjs` ist das Werkzeug dieser Klasse („Wirkfeld ohne
Motorleser"). Es prüft **8 Feldnamen**: `damage`, `blastRadius`, `knockback`,
`terrainDamage`, `bounces`, `homing`, `piercing`, `elemental` — plus drei
Invarianten (`aoe` ⇔ Radius, `homing`/`piercing` ⇒ Projektil).

**Was es NICHT sieht** (nachgemessen):

1. **Es kennt nur 8 Felder.** `effectMagnitude` stand mit Werten bei 4 Waffen da
   und wurde nie von einem Gate erfasst — die Lücke aus Abschnitt 3b hätte es
   gefunden, wenn das Feld in der Liste stünde.
2. **Es sucht nur in `src/engine/**` + `shared/ballistics.js`** und nur nach
   **zitierten** Zugriffen (`['"]feld['"]`). Ein Leser über Punktzugriff
   (`weapon.requiresLineOfSight` in `shooting.js`) ist für dieses Werkzeug
   unsichtbar. `requiresLineOfSight` wird deshalb allein von
   `check:damage-types` abgedeckt.
3. **Es prüft nicht die Abwesenheit von Feldern.** Ein durchgereichtes Fremdfeld
   wie `cooldownTurns` ist für „Wirkfeld ohne Motorleser" kein Treffer, weil es
   gar nicht in der Liste steht. Erst die Feldnamen-Gegenprobe
   (`tests/weapon-field-wiring.test.js`, Test 1) macht das sichtbar.
4. **Client und Server zählen bei ihm nicht.** Ein Feld, das nur die Anzeige
   braucht (`powerTier`, `subcategory`, `iconPath`), ist legitim — mit der
   Suchgrenze `src/engine` allein wäre es fälschlich „ohne Leser".

**Zehn Felder haben kein Gate** (`— keines —` in der Tabelle): `concept`,
`cooldown`, `cooldownSource`, `damageTypeSource`, `effectMagnitude`, `icon`,
`iconPath`, `internalName`, `rarity`, `subcategory`. Davon haben **sieben auch
keinen Produktleser** und sind deshalb über die Begründungsliste abgedeckt
(Abschnitt 3a/3b); drei haben einen Leser und sind nur ungeprüft: `cooldown`
(Motor/Client), `subcategory` (Client), `rarity` (Motor — mit dem Befund aus
Abschnitt 5). **Kein Feld ist also „weder gelesen noch geprüft", ohne dass es in
der Begründungsliste steht** — und genau das erzwingt
`tests/weapon-field-wiring.test.js` bei jedem `npm test`.

## 5. Die fünf Versprechen des Lastenhefts

| Versprechen | Daten (150 Waffen) | Motor-/Clientleser | Gate |
|---|---|---|---|
| **Munition** | `maxAmmo` 150/150, Werte 2/3/5/6/8 (68×3, 77×5) | `inventory.js`, `shooting.js` (Verbrauch), `Client` (Anzeige) | `npm run balance` berichtet; kein eigenes Gate |
| **Explosion** | `blastRadius` bei 56, `terrainDamage` bei 18, `fuseTime` bei 11 | `systems/projectileSystem.js`, `shooting.js`, `turret.js`, `init.js` (Explosionszustand) | `check:effects` (Felder + Invarianten), `check:fuses` (Zünder gegen Flugzeit) |
| **Gadgets** | `special` 150/150 (118 verschiedene Wirkungsnamen), 24 mit Elementarschaden | `src/engine/specials.js` (`buildEffect` → Heilung, Schild, Geschütz, Sprung, Wasser, Aufklärung, Zufall) | `check:effects` (elemental), `check:targeting` (Zielart gegen Wirkung), `matrix:check` |
| **Drop** | `rarity` 150/150 (80/40/30), `powerTier` 150/150, `index` 150/150 | `systems/lootSystem.js` (Kiste → `pickWeaponForRarity`), `inventory.js` (Abwurf), `match.js` (Wurfkiste) | `check:crates`, `tests/loot.test.js`, `tests/rarity-weights.test.js` |
| **Rarity** | 3 Quellstufen, 5 abgeleitete Stufen (`powerTier`: common 63, uncommon 32, rare 42, epic 8, legendary 5) | `pickWeaponForRarity` zieht nach `powerTier` mit `RARITY_WEIGHTS`; Client färbt nach `powerTier` (`hud.js`) | kein Gate; `tests/rarity-weights.test.js` hält die Verteilung |

**Ein Befund in diesem Block, der NICHT behoben ist (fremde Datei):**

`weapon.rarity` erreicht den Client nur über **eine** Zeile: `match.js:2179`
`rarity: Math.max(0, RARITY_IDS.indexOf(weapon.rarity))`. `RARITY_IDS` führt die
vier Namen `standard/enhanced/premium/epic`; die Waffen tragen
`common/uncommon/rare`. `indexOf` liefert damit für **alle 150 Waffen -1**, also
`max(0,-1) = 0` — jede abgeworfene Waffe erscheint als Seltenheit **0
(standard)**, egal ob common oder rare. Der Kommentar an der Stelle sagt es
selbst („gemessen liegt der Index bei ALLEN 150 Waffen auf 0"); es ist derselbe
**Namensraum-Fehler** wie bei der Gewichtstabelle, die nie traf. Der Client färbt
die Kiste danach (`renderer.js:737`).

**Vorschlag (nicht ausgeführt):** entweder die Anzeige auf `powerTier` umstellen
(mit einer expliziten Abbildung der fünf Stufen auf die vier Kistenstufen) oder
`weapon.rarity` in der Kiste auf einen der vier Namen abbilden. Beides ist eine
Änderung an `src/engine/match.js` bzw. `src/engine/systems/lootSystem.js` — nicht
Teil dieses Auftrags.

## 6. Behauptung „4 Barrels, 137 Zeilen, 14 wortgleiche Kopien" — nachgeprüft

Die Behauptung (`docs/befundregister.md`, Eintrag **C-7**) ist **in allen drei
Zahlen richtig**, gemessen:

* **4 Barrel-Dateien:** `src/engine/index.js` (32 Z.), `src/shared/index.js` (15),
  `src/client/index.js` (28), `src/server/index.js` (62) = **137 Zeilen**.
* **Kein Produktkonsument:** Der Client wird über `index.html` Zeile 1087 mit
  `/src/client/main.js` geladen, der Server über `scripts/server.mjs` mit
  `../src/server/gameServer.js`. Kein Spielpfad importiert eine Barrel-Datei.
  Geladen werden sie nur von `npm run validate` (`package.json:11`) und von Tests —
  die `package.json`-Zeile `"main": "src/server/index.js"` beschreibt einen
  Einstieg, den nichts benutzt.
* **14 wortgleiche Zeilen:** genau **14** nicht-leere Zeilen kommen in mindestens
  zwei der vier Dateien wörtlich identisch vor, ausschließlich `export { … } from …`
  (z. B. `export { World } from '../engine/ecs/world.js';`). Es sind
  Re-Export-Zeilen — die Kopien sind also nicht zufällig, sondern strukturell.

**Urteil:** Der Befund ist kein toter Code (die Dateien werden als
Verkabelungstest geladen), sondern ein **Kopien-Befund** — die Aussage des
Befundregisters („C" = Kopien, nicht „tot") trifft zu. **Nicht angefasst:** Es
sind vier Dateien unter `src/**`; sieben andere Arbeiter schreiben dort.
Vorschlag an den Auftraggeber: entweder eine gemeinsame Sammeldatei oder die vier
Barrels ersatzlos streichen und `npm run validate` auf die echten Einstiege
(`client/main.js`, `server/gameServer.js`) umstellen.

## 7. Beweis des Generatorlaufs

| Prüfung | Ergebnis |
|---|---|
| `npm run weapons:build` | läuft; `Waffen: 150 \| Projektile: 96 \| mit Flaechenwirkung: 56 \| mit Schaden: 143` |
| Waffendaten **vorher** → **nachher** (JSON-Vergleich aller 150 Waffen, Feld für Feld) | **4 Waffen geändert, 0 Werte geändert.** Geändert ist ausschließlich das Entfernen von `cooldownTurns` bei `pa_032`, `pa_087`, `pa_088`, `pa_114`. Alle 146 übrigen Waffen byte-identisch. |
| Vergleich gegen `HEAD` (`git show HEAD:src/shared/config/weapons.js`) | dieselben 4 Unterschiede, sonst identisch — die Datei war vorher zum Generator passend und ist es danach. |
| SHA-256 `src/shared/config/weapons.js` | vorher `280e8188…`, nachher `8b8bcc7b…` (Änderung = nur die vier Zeilen) |
| Zweiter Generatorlauf (Determinismus) | derselbe Hash `8b8bcc7b…` |
| Replay-Zustandshash (`node scripts/replay.mjs play artifacts/replay-20260910.json --verify`) | **Isoliert nachgewiesen: mein Beitrag ist 0.** Beweis in drei Läufen (A/B, siehe unten): reine HEAD-Kopie → `9ec63e8c`; HEAD-Kopie **plus nur meine Änderung** → `9ec63e8c`; die **Arbeitskopie mit den fremden Änderungen** → `16b10e85`. Die Drift kommt also nicht vom Katalog. |
| Fremde Änderungen in `src/` während des Auftrags | `ballistics.js` hatte eine **Kommentar**änderung (kein Wert) — der Kataloglauf blieb davon unberührt, belegt durch den identischen Hash des zweiten Laufs. |

**Der Replay-Beweis in voller Länge (A/B, nicht invasiv gefahren).** Während
dieses Auftrags haben sieben andere Arbeiter in `src/**` geschrieben; der
Zustandshash der Arbeitskopie wanderte dadurch von `9ec63e8c` auf `16b10e85`
(Ursache: die parallele Arbeit an der Sprungregel/Fallschaden — `match.js`,
`systems/characterSystem.js`, neu `shared/config/fallschaden.js`). Weil eine
solche Drift den Verdacht auf den Katalognachtrag lenkt, wurde sie **isoliert**
nachgestellt — in einer Kopie des committeten Stands (`git archive HEAD` nach
`/tmp/pa-baseline`, die Arbeitskopie blieb unberührt):

| Lauf | Inhalt | Zustandshash |
|---|---|---|
| A | HEAD, unverändert | `9ec63e8c` ✓ |
| B | HEAD **+ nur meine Änderung** (mein Generator, neu erzeugter Katalog, SHA `8b8bcc7b…` — identisch zum Lauf in der Arbeitskopie) | `9ec63e8c` ✓ |
| C | Arbeitskopie mit den fremden `src/`-Änderungen | `16b10e85` ✗ (gegen die aufgezeichnete Erwartung) |

Damit ist belegt: Der Katalogbeitrag zum Zustandshash ist **0** — die Drift ist
fremdverursacht. In Lauf B lief auch der neue Test im HEAD-Zweig: **7/7 grün**,
er hängt also nicht an den Änderungen der anderen Arbeiter.

**Gate-Batterie (`npm run checks`, 59 s): 19 von 21 Gates grün, 2 rot — beide
fremdverursacht.**

| rotes Gate | Ursache | Meine Beteiligung |
|---|---|---|
| `check:docs` | README behauptet **112** Testdateien, tatsächlich **116**. Ohne meine neue Testdatei wären es **115** gegen 112 — das Gate war also **schon vor diesem Auftrag rot**. | **+1** am Istwert (mein neuer Test), die Ursache ist die nicht nachgezogene Zahl in `README.md` (fremde Datei, während des Auftrags von einem anderen Arbeiter geändert). |
| `check:camera` | Sechs Zeichenfunktionen im Renderer sind keiner Kameraklasse zugeordnet (`#drawNarben`, `#drawSpuren`, `#drawRauch`, `#drawTreffer`, `#ermittleTreffer`, `#fuehreSpuren`) — Zuwächse in `src/client/renderer.js`. | **keine.** Der Waffenkatalog enthält nichts zu Kamera oder Zeichnen. |

`npm run lint` → **Exit 0** (Volllauf). Der neue Test läuft über das Muster
`tests/*.test.js` automatisch in `npm test` mit; ein eigenes Gate in
`scripts/checks.mjs` wäre ein Eintrag in `package.json` — eine fremde Datei,
deshalb nicht getan.

## 8. Offene Punkte — Vorschläge, nicht ausgeführt

1. **`effectMagnitude` verdrahten** (`src/engine/specials.js`, `MOVE`/`PULL`) —
   sonst bleibt „weit" ein Wort (Abschnitt 3b).
2. **Kisten-Rarität abwerfen: `match.js:2179`** bildet drei Waffennamen auf vier
   Kistennamen ab und trifft deshalb immer 0 (Abschnitt 5).
3. **`targeting` bekommt einen Verbraucher** — oder wird als Prüfbasis ohne
   Wirkung dokumentiert (Abschnitt 2). Heute reist es im `shot`-Ereignis mit und
   niemand nimmt es ab.
4. **20 Exporte des Katalogs ohne Produktaufrufer** (gemessen): u. a.
   `hasFuse`, `strikeStyleFor`, `getWeaponsByCategory`, `getWeaponsByRarity`,
   `subcategoryFor`, `isReserveWeapon`, `WEAPON_RARITIES`, `HITSCAN_RANGE_BY_CATEGORY`.
   Sie sind teils Prüf-API (Tests, Gates), teils Karteileichen; `getWeaponsByRarity`
   wäre die richtige Funktion für Punkt 2. Aufräumen ist eine eigene Entscheidung.
5. **Vier Barrel-Dateien** (Abschnitt 6): streichen oder zusammenführen.

## 9. Was ich NICHT geprüft habe

* **Sprite Sheets und Waffenanimationen** — die Frage des Auftraggebers umfasste
  sie. Hier steht dazu **nichts**: die Icons des Katalogs (`icon`, `iconPath`,
  150/150 gesetzt) und die Animation (`src/client/weaponAnimation.js`) wurden
  nicht gegen die 150 Assets geprüft. `tests/assets.test.js` und
  `tests/weapon-animation.test.js` decken Teile davon ab — gelesen, nicht
  nachgemessen habe ich das nicht.
* **„Beschreibung"** — es gibt kein Beschreibungsfeld je Waffe im Katalog
  (`concept` trägt nur 8 Waffen). Ob eine Beschreibung gefordert ist, ist eine
  Designfrage; geprüft ist nur, dass kein Feld dafür existiert.
* **Kein voller `npm test`/`npm run test:e2e`** (Auftragsregel). Gefahren:
  `tests/weapon-field-wiring.test.js` (neu, 7/7 grün), die vier Waffengates
  (`check:effects`, `check:damage-types`, `check:fuses`, `check:targeting` —
  alle 0 Verstöße) und `npm run lint` (Exit 0 für meine Dateien und im Volllauf).
  **Nicht** gefahren: `npm test` (Volllauf), `npm run test:e2e`, `npm run
  balance`, `matrix:check` einzeln (in `npm run checks` enthalten, siehe unten).
* **Wirkung im laufenden Match** — ich habe Leser im Code **gelesen**, nicht jeden
  Leser in einem Match **ausgelöst**. Für drei Pfade gibt es das bereits:
  `tests/wirkungsmerkmale-match.test.js`, `tests/waffen-wirkung.test.js`,
  `tests/melee-throw-match.test.js` (nicht von mir gefahren).
* **Die 26 aus dem Anzeigenamen abgeleiteten Schadensarten** sind auf Plausibilität
  GEPRÜFT, nicht einzeln fachlich bestätigt (16 physical, 6 explosive, 3 arcane,
  1 fire).
* **Kein Test beweist, dass ein Gate das Feld im Spiel durchsetzt.** Die Tabelle
  zeigt Leser und Gate getrennt; die Verknüpfung „Gate prüft, was der Leser tut"
  ist für `check:effects` (Invarianten) und `check:fuses` (Absicht vs. Wert)
  belegt, für die übrigen Gates nur über ihren Kopfkommentar.
