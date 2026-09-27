# Waffen-Balance Whitepaper

**Status**: Work-in-progress (2026-09-26 22:26)  
**Ziel**: Systemisches Verständnis der Waffen-Balance, nicht eine triviale Tabelle aller 150 Waffen.

> **NACHTRAG 2026-09-27 (Worker C, Auftrag „O8-Nachzug").** Eine Aussage dieses
> Papiers ist überholt: §5 behauptete, online gebe es **keinen** Sprung und
> **kein** Waffe-Abwerfen. O8 ist umgesetzt (Commit `68f551c`) — die Stelle ist
> unten richtiggestellt und markiert. **Alle übrigen Aussagen wurden gegen den
> heutigen Baum gelesen und bleiben unverändert** (Einzelnachweis:
> `docs/hunter-doku-nachzug.md`, Abschnitt `waffen-balance-whitepaper.md`).
> Die Zahlen dieses Papiers sind **nicht** nachgemessen worden — sie stammen aus
> seiner eigenen Erhebung und stehen hier als Zeitzeugnis.

---

## 1. Überblick

Die Waffen sind **generativ erzeugt** — das bedeutet:

- **Kein manueller Edit-Möglichkeit** für `WEAPONS` (Header `AUTO-GENERIERT`)
- Quelle: `project_armageddon_weapons_v1.json` mit 150 Einträgen
- Parameter-Familien mit fest definierten Wertbereichen
- `speedFactorFor()` normiert die Geschwindigkeit kategorisch

**Folge**: Balance-Änderungen geschehen über Parameter-Grid, nicht über Einzelwerk.

---

## 2. Kategorie-basierte Balance

### 2.1 `speedFactorFor(weapon)`

```js
// Quelle: src/shared/config/weapons.js:14-36
const untergrenze = weapon.category === 'melee' ? 0.3 : 0.6;
return Number(Math.min(1.6, Math.max(untergrenze, roh / REFERENCE_PROJECTILE_SPEED)).toFixed(4));
```

| Kategorie | Untergrenze | Effekt |
|---|---|---|
| **melee** | 0.3 | Waffen wie Baseball Schläger (27,2 px/s → 0,39x) |
| **alles andere** | 0.6 | Geschosse müssen mindestens 42 px/s haben |

**Warum?** Die 0,6-Grenze verhindert, dass aussergewöhnliche Werte Bahnkurven verzerren. Die 0,3-Grenze für Nahkämpfe erlaubt langsame Würfe (27–41 px/s).

### 2.2 `HITSCAN_RANGE_BY_CATEGORY`

```js
{melee:130, ranged:520, heavy_ranged:820, elemental:560, magic:520, tech:600, utility:420, ultimate:900}
```

Jede Kategorie hat einen **maximalen Reichweitenwert**, der für Hitscan-Waffen gilt. Projektile nutzen die `WEAPONS[].maxRange` direkt.

---

## 3. Waffentypen und ihre Parameter

### 3.1 Offensichtliche Hauptgruppen

| Typ | Beispiel | powerScore | damage | knockback | specialty |
|---|---|---|---|---|---|
| Melee | Baseball Schläger | 50 | 28 | 82 | bat_knockback |
| Ranged | Standard-Pistole | 70 | 32 | 45 | - |
| Heavy Ranged | Minigun | 120 | 45 | 60 | - |
| Elemental | Feuerfaust | 90 | 38 | 50 | fire |
| Magic | Teleport | 150 | 0 | 0 | teleport |
| Utility | Medkit | 80 | 0 | 0 | heal |
| Ultimate | nuke | 300 | 100 | 120 | area_kill |

### 3.2 Grenzfallanalyse: Der Profiler

**Frage**: Welche Waffen sind am *schwachsten* am Start?

**Antwort**: `baseballschlager`:
- `powerScore = 50` (niedrigste Kategorie)
- `maxRange = 110` (klein für melee)
- `damage = 28`, `knockback = 82` (relativ hoch für den Schaden)

**Was bedeutet das?** Der Scout hat mit dem Schläger die **schlechteste Reichweite**, dafür aber den **höchsten Rückstoß**. Das ist kein Bug, sondern eine bewusste Schwäche, die Balance durchbucht.

---

## 4. Die drei größten Probleme (nach Audit)

### 4.1 Duplikat: `match.js:323` `GRAVITY = 0.32` vs `ballistics.js:51` `PROJECTILE_GRAVITY = 0.32`

Der **Geschütz-Zielpfad** nutzt die **eigene Kopie**:

```js
// match.js:2017
const gravitation = GRAVITY * (waffe.gravityScale ?? 1);
```

Der **Erreichbarkeitspfad** nutzt die geteilte Konstante:

```js
// match.js:735
gravity: DEFAULT_PROJECTILE_GRAVITY,
```

**Risiko**: Ändert jemand `PROJECTILE_GRAVITY`, zielt das Geschütz **still falsch**. Das ist dieselbe Fehlerklasse wie der 78-px-Fall (ehemals `currentStrength` statt `match.wind`).

**Empfehlung**: `GRAVITY`/`CRATE_GRAVITY` in `match.js` durch `PROJECTILE_GRAVITY` ersetzen — oder zumindest als Referenz deklarieren.

---

### 4.2 `RARITY_IDS` vs `LOOT_DROP_RULES.rarities`

Identische Listen in getrennten Modulen. Beim Refactoring einer dieser Listen **fällt die Konsistenz plötzlich**.

---

### 4.3 `npm run check:docs` war ROT

Testdateizahl: `102` in der Doku, `103` in der Wildbahn. Ursache: Neuer Waechter `tests/replay-sprung-luecke.test.js`.

---

## 5. User Flow – Wie ein Spieler mit Waffen interagiert

1. **Spawn** → zufällige Waffe (Gewichtung aus `WEAPON_SPAWN_RATES`)
2. **Auswahl** → HUD zeigt Icon + `displayName`
3. **Ziel** → Rechtsklick, Visueller Pickup
4. **Schuss** → `INPUT` → `fire()` → `ProjectileSystem`
5. **Ergebnis** → Treffer: Damage, Knockback, Terrain-Damage

**Chapeau** `[O8, nachgezogen 2026-09-27]`: Der Flow ist **konsistent**, und
**Sprung wie Waffe-Abwerfen sind online verfügbar** — der Scout verliert sein
Hauptunterscheidungsmerkmal online **nicht mehr**. Der Vor-O8-Satz lautete:
„Der Flow ist **konsistent**, aber **kein Sprung/Waffe-Abwerfen** online
verfügbar. Scout verliert seine Hauptunterscheidungsmerkmal online."
Belege: `CONTROL.JUMP`/`CONTROL.DROP_WEAPON` (`src/shared/protocol.js:93-94`),
Server-Handler `handleJump`/`handleDropWeapon` (`src/server/gameServer.js:517`
/`:570`, Verteiler `:1295`/`:1303`), Client `sendJump`/`sendDropWeapon`
(`src/client/networkClient.js:463`/`:479`, die `send`-Zeilen darin `:465`/`:481`), Anzeige `jumped`/`weapon_dropped`
(`src/client/ereignisse.js:437`/`:472`).

---

## 6. Messbare Zahlen (für Balance-Team)

| Metrik | Wert | Quelle |
|---|---|---|
| `REFERENCE_PROJECTILE_SPEED` | 70 px/s | weapons.js:11 |
| `MAX_PROJECTILE_SPEED` (beschränkt) | 70 * 1,6 = 112 px/s | weapons.js:35 |
| `powerScore` (Durchschnitt) | ≈ 85 | Messung in WEAPONS |
| `powerScore` (Max) | 300 (ultimate) | weapons.js (nuke) |
| `powerScore` (Min) | 50 (baseball) | weapons.js |

---

## 7. Offene Fragen für den Designer

1. **Soll `GRAVITY = 0.32` wirklich separat gehalten werden?**
2. **Wie groß ist der Nutzen von 150 Waffen vs. 80 getuned?**
3. **Welche Waffen sollen Online-Spezifika haben?** (Scout-Sprung, Günther-Poops)
   — *Nachtrag 2026-09-27: Die Frage bleibt eine Designfrage, ist aber kleiner
   geworden: Der Scout-Sprung ist **kein fehlendes** Online-Spezifikum mehr (O8).*

---

## 8. Anhang

### 8.1 Skript, das den Katalog erzeugt

`scripts/build-weapon-catalog.mjs` — nicht editieren, Quelle: `project_armageddon_weapons_v1.json`

### 8.2 Tests, die die Balance betreffen

- `tests/shooting.test.js` – Schusslogik
- `tests/melee-throw.test.js` – Wurf- und Knickprofil
- `tests/prediction.test.js` – Zielgenauigkeit