# Tragen `damage`, `entity_in_water` und `drowning` eigene Information?

**Auftrag (Worker E, REIN LESEND):** Auf Wasser-Karten melden diese drei Arten
**jeden Takt** — 583,6 Nachrichten/s bzw. 42,29 KB/s je Client (40 Figuren,
`flooded`, gemessen in `docs/ereigniskanal-filter.md`, Abschnitt 9). Die Frage
des Auftraggebers wörtlich: *„kp mittlerweile oder teilen die Infos"* — also:
**Steht das, was diese Meldungen tragen, ohnehin schon im Snapshot?**

**Antwort in einem Satz:** Zwei von drei tragen **nichts**, was der Snapshot
nicht schon hat (`entity_in_water`: 15066 von 15092 Meldungen wertgleich mit dem
Snapshot desselben Taktes, die 26 Ausnahmen sind der Sterbetakt;
`drowning`: dasselbe Feld, dieselbe Schwelle, 15092 von 15092) — die dritte
(`damage`) trägt den Betrag messbar **nur als Saldo** (der Snapshot läuft mit
20 Hz über 3 Takte, 99,7 % der Fenster enthalten mehr als einen Treffer) und den
**Urheber**, den der Snapshot gar nicht führt, den aber **niemand im Client
liest**.

| Art | Urteil | Kernbeleg |
|---|---|---|
| `entity_in_water` | **(a) REDUNDANT** | `payload.level` == `snapshot.waterLevel` in 15066/15092; keine Wirkung im Client (kein Zweig) |
| `drowning` | **(a) REDUNDANT** | dasselbe Feld, Schwelle ist geteilte Konstante (0,72); 15092/15092 ≥ Schwelle; keine Wirkung im Client |
| `damage` | **(b) TEILWEISE** | `remaining` deckungsgleich mit `snapshot.health` (0 Abweichungen über der Drahtstufe); Betrag nur als Saldo rekonstruierbar; **Urheber/Art nicht im Snapshot — aber ohne Leser** |

Zusammen: die drei sind **88,9 % des ungefilterten Ereigniskanals** bzw.
**97,5 % des heute ausgelieferten** (nach der Anzeige-Drossel). Dieselbe Drossel
auf sie brächte **42,29 → 2,46 KB/s je Client (−94,2 %)**, und **keine einzige
im HUD sichtbare Zahl** ginge dabei verloren (Begründung in Abschnitt 5).

Kein Browser, kein Testlauf, kein `src/**` angefasst. Alle Zahlen unten sind
unter Abschnitt 7 mit Befehl und Rohausgabe nachvollziehbar.

---

## 1. Was der Snapshot je Spieler trägt — die Fundstellen

Drahtformat (`src/shared/protocol.js:24-27`):

```
ab [25]  je Spieler 15 Byte:
  id Uint16, team Uint8, alive Uint8,
  x Int16 (0.25 px), y Int16 (0.25 px), health Int16 (0.1 HP),
  turnFlag Uint8 (1 = am Zug), dirty Uint8 (Bitfeld, siehe DIRTY),
  shield Uint8, frozenTurns Uint8, waterLevel Uint8 (Wasserstand 0..255)
```

- **Gesundheit** steht bei `offset + 8` (`protocol.js:315`), Auflösung
  `HEALTH_SCALE = 10` ⇒ **0,1 HP** (`protocol.js:108-109`).
- **Wasserstand** steht bei `offset + 14` (`protocol.js:320`), geschrieben aus
  `toWireWaterLevel()` (`protocol.js:295`), gelesen über
  `fromWireWaterLevel(...)` (`protocol.js:430-435`). Ein Byte, 255 Stufen.
- **Rate:** `SNAPSHOT_HZ = 20` (`src/server/gameServer.js:50-51`), Vollsnapshot
  alle 2 s (`gameServer.js:58`). Also **20-mal je Sekunde** je Spieler
  Gesundheit **und** Wasserstand.
- Warum beides überhaupt auf der Leitung liegt: `protocol.js:38-43`
  („v3 → v4: Wasserstand je Spieler. Die Anzeige konnte bisher weder ‚nass' noch
  ‚ertrinkt' darstellen … Ein Byte genügt“), und die Schwellen liegen in
  `src/shared/config/water.js` — **eine** Quelle für Motor und Anzeige
  (`WET_LEVEL = 0.35`, `DROWN_LEVEL = 0.72`, `waterStateFor()`).
- Der Zustand, aus dem der Snapshot gebaut wird, liefert den Wasserstand je
  Figur an **genau der Stelle, an der die Figur steht**
  (`src/engine/stateSnapshot.js:93-107`):

```js
waterLevel: alive
  ? Math.round(quelle.waterLevelAt(x, y) * 1000) / 1000
  : 0,
health: alive ? quelle.world.getComponent(entry.entityId, 'Health', 'current') : 0,
```

**Das ist die Messlatte der ganzen Prüfung:** Dieselbe Zelle, die der Motor in
`CharacterSystem` für seine Wasserabfrage liest („Wasserabfrage in
Weltkoordinaten“, `src/engine/systems/characterSystem.js:73-76`), liefert den
Wert, den der Snapshot überträgt.

## 2. Wer liest die drei Ereignisse im Client? — **niemand**

Die Ereignis-Wirkungstabelle ist `EREIGNIS_WIRKUNGEN` (je Ereignisart ein
Schlüssel; angewendet in `verarbeiteLokal` und `verarbeiteOnline`). Sie
hat für `damage` **keinen Schlüssel** und für `entity_in_water` **keinen
Schlüssel**; `drowning` hat einen absichtlich leeren:

```js
// src/client/ereignisse.js — der Eintrag `drowning` in EREIGNIS_WIRKUNGEN
/*
 * 'drowning' hat bewusst KEINE Wirkung: Das CharacterSystem meldet es bei
 * JEDEM Simulationsschritt, solange die Figur unter Wasser ist — das sind
 * bis zu 60 Meldungen je Sekunde, die das Protokoll überschwemmen. Die
 * Meldung entsteht stattdessen beim ÜBERGANG in `Main#trackWater` …
 */
drowning: {},
```

Der Test, der das maschinell festhält, ist die Menge `bewusstStumm`
(`tests/event-coverage.test.js:192-218`); ihre Bedeutung ist dort eng definiert:
„Der Spieler sieht von diesem Ereignis NICHTS; der sichtbare Effekt entsteht
über ein anderes Element.“ Die drei Einträge wörtlich:

```
:196  'entity_in_water',   // Wasserstand steht als Marke am Spielernamen
:197  'damage',            // Lebensbalken sinkt sichtbar
:216  'drowning',          // bis zu 60x/s: nur beim ÜBERGANG gemeldet (#trackWater)
```

**Wo die Anzeige stattdessen herkommt (beides aus dem Snapshot):**

1. **Wasserstand je Figur** — online unverändert aus dem Snapshot in den
   Ansichtszustand (`src/client/main.js:1155`, Kommentar: „Wasserstand kommt je
   Spieler mit dem Snapshot (Protokoll v4) und geht unverändert in den
   Ansichtszustand“).
2. **Die Übergangsmeldung** — `Main#trackWater` (`main.js:1474-1493`) vergleicht
   den *Zustand* (nicht den Rohwert) je Figur und schreibt nur beim Wechsel ins
   Protokoll: „<Name> ertrinkt (N % unter Wasser)“, „<Name> steht im Wasser“,
   „<Name> ist wieder über Wasser“. Der Kommentar an der Fundstelle
   (`main.js:1461-1473`, Zitat ab `:1464`) sagt ausdrücklich, warum **nicht** über die Ereignisse:
   *„`entity_in_water` und `drowning` feuern in jedem Simulationsschritt … Der
   Zustand steht ohnehin im Match-State — und im Online-Modus kommt er mit dem
   Snapshot, sodass dieselbe Anzeige ohne zweiten Weg funktioniert.“*
   Aufgerufen wird das im Darstellungspfad (`main.js:2057`), also in **beiden**
   Betriebsarten.
3. **Die Marke am Namen** — `hud.js:163-164` (Kurzform `W42`) und
   `hud.js:234-242` (Klartext + Symbol 💧/🌊 + Tooltip mit der Ertrinkgrenze
   aus `DROWN_LEVEL`) — beide lesen `entity.waterLevel`.
4. **Der Betrag als Balken und Zahl** — `hud.js:216` (Balken) und `hud.js:247`
   (`hp.textContent = Math.max(0, Math.round(entity.health))`).

**Ergebnis:** Alle drei Meldungen haben im Client **null Leser**. Was der Spieler
sieht (Marke, Übergangstext, Lebenszahl), entsteht aus dem Snapshot.

## 3. `entity_in_water` — welchen Wert trägt die Nutzlast?

**Erzeuger** (`src/engine/systems/characterSystem.js:137-138`):

```js
if (inWater && events) {
  events.emit('entity_in_water', { entityId, level: waterLevel });
}
```

`inWater` ist `waterLevel > WET_LEVEL` (`characterSystem.js:76`), `waterLevel`
ist der Füllstand an der Figurposition (`characterSystem.js:73-75`) — **dieselbe
Quelle wie `stateSnapshot.js:101`.**

**Drahtgröße:** `{"v":7,"t":"entity_in_water","round":R,"entityId":N,"level":L}`
= **62–63 B** (gemessen 62,9 B im Mittel bei 40 Figuren, `flooded`, 100 s).

**Messung** (`/tmp/inhalt-messung.mjs`, `/tmp/inhalt-detail.mjs`): Für jede der
15092 Meldungen wurde `payload.level` gegen `snapshot.waterLevel` **desselben
Taktes** gestellt:

```
entity_in_water 15092 Meldungen
  payload.level == snapshot.waterLevel : 26 Abweichungen von 15092
  davon bei LEBENDER Figur: 0
```

Alle 26 Ausnahmen sind **der Sterbetakt der Figur** — wörtlich aus der Messung:

```
Takt  428 entity_in_water Figur 15: payload.level=1 snapshot.waterLevel=0 alive=false health=0
```

Die Ursache steht in `stateSnapshot.js:101-107`: Für eine tote Figur liefert der
Zustand **absichtlich 0** („`alive ? … : 0`“ — ebenso für `health`, `x`, `y`).
Der Snapshot sagt also nach dem Tod „kein Wasser“, die letzte Meldung der
sterbenden Figur sagt „voll unter Wasser“. **Für jede lebende Figur ist der Wert
wertgleich (15066/15066)**, und ein Zustand ohne lebende Figur hat keine Anzeige.

**Zusätzliche Probe (Quantisierung):** Der Snapshot schickt den Füllstand als
**ein** Byte (255 Stufen). Über alle 240000 Figuren-Takte des Laufs gekippt:
**0** — die Zustandsgrenzen (0,35 / 0,72) liegen weit genug von der
Quantisierungsstufe (1/255 = 0,0039) entfernt.

### Urteil: **(a) REDUNDANT**

- **Fundstelle:** `characterSystem.js:137-138` gegen `stateSnapshot.js:101-107`
  und `protocol.js:320` (+14 im 15-B-Spielersatz).
- **Messwert:** 15066 von 15092 Meldungen wertgleich mit dem Snapshot desselben
  Taktes; die 26 Abweichungen sind ausschließlich Sterbetakte toter Figuren
  (`alive=false`, `snapshot.waterLevel=0`).
- **Kein Leser** (`bewusstStumm`, `event-coverage.test.js:196`); die Anzeige
  entsteht aus `main.js:1474` + `hud.js:163`.
- **Wert der Art, der bleibt:** Sie ist die einzige Meldung, die den Wechsel
  *sofort* nennt (bis zu 50 ms früher als der nächste Snapshot) — das ist ein
  **Latenzvorteil, keine Information**.

## 4. `drowning` — Zustand oder nur Anzeige?

**Erzeuger** (`characterSystem.js:142-145`):

```js
if (waterLevel >= this.#submergedLevel && damageSystem) {
  const damage = (this.#drownDamagePerSecond / 60) * (dt / (1000 / 60));
  damageSystem.applyDamage(world, entityId, damage, null);
  events?.emit('drowning', { entityId, level: waterLevel });
}
```

`#submergedLevel = DROWN_LEVEL` (`characterSystem.js:46`) — **dieselbe
Konstante**, die die Anzeige für „untergetaucht“ benutzt
(`src/shared/config/water.js`, gelesen von `hud.js:18` und `main.js:50`). Es gibt
also keine zweite Schwelle, die auseinanderlaufen könnte.

**Nutzlast:** `{ entityId, level }` — **dasselbe Feld wie `entity_in_water`**,
kein eigener Zustand, kein Text, kein Klang. Drahtgröße 55–56 B, gemessen 55,9 B.

**Messung** (dieselben Läufe):

```
drowning 15092 Meldungen
  payload.level == snapshot.waterLevel : 26 Abweichungen (identisch mit entity_in_water)
  davon unter der Ertrinkgrenze 0.72  : 0
  bei LEBENDER Figur                  : 0 Abweichungen
```

Drei Aussagen in einer Zeile: **jede** Meldung liegt über der Schwelle (die
Meldung ist also exakt „Zustand == untergetaucht“), der Wert ist der Wert des
Snapshots, und die 26 Ausnahmen sind dieselben Sterbetakte wie in Abschnitt 3.
Auf der Wasser-Karte feuern `drowning` und `entity_in_water` **im selben Takt
gleich oft** (15092 zu 15092), und jedes `drowning` trägt genau die Information,
aus der `Main#trackWater` den Satz „<Name> ertrinkt (N % unter Wasser)“ bildet.

**Zustand oder Anzeige?** Gemessen: **weder noch eigenständig** — es ist die
Takt-für-Takt-Wiederholung eines Snapshot-Wertes, und die Anzeige, die daraus
einmal entstehen sollte, ist längst aus den Ereignissen herausgenommen
(`EREIGNIS_WIRKUNGEN.drowning` ist leer, `#trackWater`). Kein Klang, kein Text, kein Zweig.

### Urteil: **(a) REDUNDANT**

- **Fundstelle:** `characterSystem.js:46` + `:142-145` gegen
  `src/shared/config/water.js` (DROWN_LEVEL) und `main.js:1474-1493`.
- **Messwert:** 15092/15092 Meldungen mit `level ≥ 0,72`; 15066/15092 exakt
  gleich `snapshot.waterLevel`; 0 Abweichungen bei lebenden Figuren; 26 Sterbetakte.
- **Kein Leser** (`EREIGNIS_WIRKUNGEN.drowning` = `{}`, `event-coverage.test.js:216`).

## 5. `damage` — was trägt es über den Betrag hinaus?

**Erzeuger** (`src/engine/systems/damageSystem.js:103-111`) — die vollständige
Nutzlast:

```js
world.services?.events?.emit('damage', {
  entityId, attackerId, amount: finalDamage, absorbedByShield,
  remaining: newHealth, damageType: damageTypeId(options.damageType),
  damageTypeName: damageTypeName(damageTypeId(options.damageType)),
});
```

Drahtgröße **151–170 B**, gemessen 161,2 B im Mittel — die teuerste der drei.

### 5.1 Betrag: `remaining` ist der Snapshot, `amount` nur als Saldo

```
damage 15092 Meldungen, |remaining - snapshot.health|:
  exakt 0                                    :  3020
  unter 0.001 HP                             : 12072
  zwischen 0.001 und der Drahtstufe 0.10 HP  :     0
  SICHTBAR auf der Leitung (>= 0.10 HP)      :     0
```

**`remaining` ist der Gesundheitswert des Snapshots** — in 15092 von 15092
Fällen auf **weniger als eine Drahtstufe** (0,1 HP) genau; die größte gemessene
Restdifferenz (3,1 × 10⁻⁶ HP) liegt **mehr als vier Zehnerpotenzen unter der
Auflösung**, mit der Gesundheit überhaupt übertragen wird. Kein Spieler kann das
sehen; auf der Leitung ist der Unterschied nicht darstellbar.

Und `amount` gegen die Lebensdifferenz desselben Taktes:

```
Summe amount je Takt != Lebensdifferenz (> 0.05): 8 von 15092
```

Die 8 Fälle sind **alle der Todestakt** (`/tmp/inhalt-ausnahmen.mjs`):

```
Takt 702 Figur 14: amount=[0.15] remaining=[0] | Snapshot health 0.050 -> 0.000 alive=false
```

Die Meldung nennt 0,15 Schaden, das Leben fiel aber nur um 0,05 (der Rest war
nicht mehr da) — `remaining=0` stimmt wieder exakt mit dem Snapshot. **Der
Betrag ist also als Gesundheitsdifferenz des Taktes exakt rekonstruierbar
(15084/15092), die Ausnahmen sind Tode.**

**Die entscheidende Gegenprobe — und sie fällt gegen den Snapshot aus:** Der
Snapshot kommt mit **20 Hz**, deckt also **3 Takte** je Nachricht ab. Genau
gezählt (Fenster = 3 Takte, je Figur):

```
Snapshot-Fenster (20 Hz = 3 Takte): 5047 Fenster mit damage,
  davon mit MEHR als einer Meldung: 5031 (99.7 %)
```

**In 99,7 % der Fälle verschmilzt der Snapshot rund drei Treffer zu einer
Netto-Differenz.** Den *einzelnen* Trefferbetrag trägt der Snapshot also nicht.
Wer also später eine Trefferzahl je Schuss anzeigen will, braucht die Meldung
oder ein Delta mit höherer Rate — für die **heutige** Anzeige ist sie
gleichgültig, weil **niemand** sie liest (Abschnitt 2).

### 5.2 Was sonst noch drinsteckt: Urheber und Schadensart

```
Wasserkarte (40 Figuren flooded, 100 s):
  Urheber gesetzt 0/15092, Schadensart != 0 0/15092, Art-Name 15092/15092 (physical)
Karte MIT Schüssen (4 Figuren hills, 60 s):
  Urheber gesetzt 2/2,     Schadensart != 0 2/2,     Arten: wind
```

Zwei Befunde:

1. **Auf der Wasser-Karte trägt `damage` ausschließlich Umweltschaden**
   (`attackerId = null`, Art `physical`) — dort, wo die Flut entsteht, ist die
   Meldung ein reines Duplikat des Ertrinkens.
2. **Der Urheber steht nirgends im Snapshot** — Suche über das ganze Repo:
   `attackerId`/`damageTypeName` kommen in `src/client/**` **kein einziges Mal**
   vor. Der einzige Leser ist `MatchStats` (`src/shared/stats.js:119-135`,
   zählt `schaden` je Angreifer) — und der läuft **nur lokal**: `feedAll()` wird
   ausschließlich in `Main#step()` gerufen, das mit
   `if (this.mode !== 'local' || !this.match) return;` beginnt
   (`src/client/main.js:1382-1389`), und `#starteErfassung()` baut die
   Erfassung aus `this.match.getState()` (`main.js:2341-2344`) — im Online-Modus
   ist `this.stats` deshalb `null` (`main.js:154`).

**Also:** `damage` trägt eine Information, die der Snapshot **nicht** hat
(Urheber), und einen Wert, den der Snapshot nur **als Saldo** hat (Betrag,
3-Takt-Fenster) — aber **keinen einzigen Leser im ausgelieferten Client**. Das
ist ein Befund über die Anzeige, keine Rechtfertigung für die Meldung: Die
Rechnung „der Client kann es nicht selbst ausrechnen" trifft für `attackerId`
zu — nur rechnet es heute niemand.

### Urteil: **(b) TEILWEISE**

- **Fundstelle:** `damageSystem.js:103-111` gegen `protocol.js:315`
  (`health` @ +8) und `gameServer.js:50-51` (20 Hz); `stats.js:119-135` vs.
  `main.js:1382-1389` (nur lokal).
- **Messwerte:** `remaining` = Snapshot-Gesundheit in 15092/15092 innerhalb einer
  Drahtstufe (0 Fälle darüber); `amount` = Takt-Differenz in 15084/15092 (8 =
  Tode); **99,7 %** der 20-Hz-Fenster verschmelzen mehr als einen Treffer;
  Urheber in 0/15092 (Wasserkarte) bzw. 2/2 (mit Schüssen) gesetzt, im Client
  **0 Leser**.
- **Drossel möglich mit Verlust** — der Verlust ist der einzelne Trefferbetrag
  und der Urheber. Beides ist heute ungenutzt; wer später eine Trefferbilanz
  oder ein Abschussprotokoll baut, braucht es.

## 6. Nutzenseite: was jede der drei einzeln spart

Ein Lauf, aufgezeichnet und durch **fünf** Filter gestellt
(`/tmp/inhalt-bytes.mjs`; dieselben Bytes, dieselbe Drossel von 30 Takten je Art
und Figur wie im ausgelieferten Filter). Gerechnet mit den **echt codierten
Drahtgrößen** (`controlMessage`).

Lauf: 40 Figuren (8×5), `flooded`, **6000 Takte = 100,0 s**, seed 20260910,
ohne Schüsse, 57309 Ereignisse, hash `6b1f3706`. **Alle Angaben je Client.**

```
UNGEFILTERT, je Art:
  damage              15092 Meldungen   23.75 KB/s   (161.2 B/Stk)
  entity_in_water     15092 Meldungen    9.26 KB/s   ( 62.9 B/Stk)
  drowning            15092 Meldungen    8.23 KB/s   ( 55.9 B/Stk)
  landed              11998 Meldungen    5.11 KB/s
  der Rest (death, turn_*, crate_pickup, round_crates)          0.01 KB/s
  -> die drei Wasserarten: 41.25 von 46.38 KB/s = 88.9 % des Kanals
```

Dieselbe Drossel, je Variante:

```
  A   (Stand der Auslieferung)      42.29 KB/s je Client
  A+d (nur damage)                  19.35 KB/s
  A+w (nur entity_in_water)         33.34 KB/s
  A+t (nur drowning)                34.34 KB/s
  A+3 (alle drei)                    2.46 KB/s
```

Ersparnis **einzeln** (Differenz der gesendeten Bytes derselben Art):

| Art | ungefiltert | mit Drossel | **gespart je Client** | bleibt |
|---|---|---|---|---|
| `damage` | 2375,1 KB | 81,5 KB | **22,94 KB/s** (96,6 % der Art) | 516/15092 |
| `entity_in_water` | 926,4 KB | 31,7 KB | **8,95 KB/s** (96,6 %) | 516/15092 |
| `drowning` | 823,2 KB | 28,1 KB | **7,95 KB/s** (96,6 %) | 516/15092 |
| **Summe** | **4124,7 KB** | **141,3 KB** | **39,84 KB/s** | 1548/45276 |

Die drei Einzelwerte addieren sich zum Gesamtwert (39,84 ≈ 39,83 KB/s), weil der
Filter je Art **und Figur** drosselt — keine Überlagerung, keine Doppelzählung.

Und die Bilanz des ganzen Kanals:

```
  A   gesamt: 42.29 KB/s je Client
  A+3 gesamt:  2.46 KB/s je Client  -> Ersparnis 39.83 KB/s = 94.2 % des Kanals
  ungefiltert waeren es 46.38 KB/s  -> A+3 spart gegen UNGEFILTERT 94.7 %
```

In der heute ausgelieferten Fassung sind die drei damit **97,5 % des Kanals**
(4124,7 von 4229,0 KB) — 56,2 % `damage`, 21,9 % `entity_in_water`, 19,5 %
`drowning`.

**Was ein Wegfall die Anzeige kostet — geprüft, nicht vermutet:** Die einzigen
Meldungen, die dem Spieler eine **Zahl** nennen, sind andere Arten und bleiben
unangetastet: `fall_damage` („Sturzschaden: N“), `dot_tick` („erleidet N
Schaden“), `special_effect` und `heal` (alle in `EREIGNIS_WIRKUNGEN`,
`src/client/ereignisse.js`) sowie die Übergangsmeldung aus `#trackWater`. Kein einziger
angezeigter Text und kein Balken hängt an `damage`, `drowning` oder
`entity_in_water` (Abschnitt 2).

## 7. Reproduktion

```bash
# 1) Nutzlast gegen den Snapshot desselben Taktes (drei Läufe)
node /tmp/inhalt-messung.mjs      # -> /tmp/inhalt-messung.txt
# 2) die 26/26 Abweichungen und die Größe der Restdifferenz
node /tmp/inhalt-detail.mjs       # -> /tmp/inhalt-detail.txt
# 3) Bytes je Art, fünf Filtervarianten (derselbe Strom)
node /tmp/inhalt-bytes.mjs        # -> /tmp/inhalt-bytes.txt
# 4) die 8 Ausnahmen beim Betrag
node /tmp/inhalt-ausnahmen.mjs    # -> /tmp/inhalt-ausnahmen.txt
# 5) Gegenprobe mit dem Skript des Vorgängers (identische Zahlen)
node /tmp/ereignis-variante.mjs   # A/A+3, unterdrueckt je Art
node /tmp/ereignis-gegenprobe.mjs # je Art, 30 s / 100 s / 4 Figuren
```

Die Rohausgaben liegen unter `/tmp/inhalt-*.txt`; die Skripte liegen bewusst
außerhalb des Repos und importieren den Motor über absolute Pfade.

**Stand der Messung — wichtig, weil parallel am Repo gearbeitet wird:** HEAD
`c84b1b4` plus ungetrackte Arbeitsbaum-Änderungen. Alle hier genannten Läufe
entstanden am **2026-09-27 zwischen 08:40:53 und 08:43:31**; seither haben andere
Worker `src/shared/protocol.js` (**08:44:27** — dort wurde `jumped` aus
`GEDROSSELTE_EREIGNISARTEN` genommen) und `src/client/ereignisse.js`
(**08:45:32**) erneut geschrieben. Auf die Messung wirkt das **nicht**: Auf
`flooded` tritt kein `jumped` und kein `crate_landed` auf (siehe Arttabelle in
Abschnitt 6), und die Filtervarianten des Byte-Skripts wurden explizit übergeben.
Alle zitierten **Zeilennummern** und die Aussage „kein Zweig im Client“ wurden
danach am Arbeitsbaum nachgeprüft (zuletzt **08:46:56**): `damage` und
`entity_in_water` haben weiterhin **keinen** Schlüssel in `EREIGNIS_WIRKUNGEN`,
`drowning` steht weiterhin leer, und `bewusstStumm` führt alle drei. Weil
`ereignisse.js` dabei **im Minutentakt umgebaut wird** (die Datei wuchs in dieser
Sitzung von 25.462 auf über 30.000 B; `drowning: {}` wanderte zwischen 08:41 und
08:47 von Zeile 553 über 656 nach 666), sind für diese Datei die **Schlüsselnamen**
der stabile Anker — die Zeilennummern in den Abschnitten 3–6 gelten für den
genannten Zeitpunkt, die Namen immer. **Wird dort ein Zweig für eine dieser drei
Arten ergänzt, muss die Aussage „kein Leser“ neu geprüft werden — sie ist der
Kern der Urteile in den Abschnitten 3 bis 5.**

**Gegenprobe der Gegenprobe:** Mein Lauf (40 Figuren, `flooded`, 100 s) liefert
**dieselben** Zahlen wie `/tmp/ereignis-gegenprobe.txt` aus
`docs/ereigniskanal-filter.md` — 57309 Ereignisse, `damage` 15092 = 23,75 KB/s,
`entity_in_water` 15092 = 9,26 KB/s, `drowning` 15092 = 8,23 KB/s, hash
`6b1f3706`. Die hier gerechneten Ersparnisse stehen damit auf demselben Boden
wie der bereits abgenommene Bericht (dort Abschnitt 9: 42,29 → 2,46 KB/s).

## 8. Grenzen dieser Messung (ehrlich benannt)

- **Kein Browser, kein E2E.** Die Aussagen über den Client stützen sich auf den
  Code und auf `tests/event-coverage.test.js` (der die Abwesenheit der Zweige
  festhält) — nicht auf eine Laufzeitbeobachtung im Browser. Ein Browserlauf war
  nicht Teil des Auftrags.
- **Ein Lauf je Konfiguration** (seed 20260910). Für Wasser-Karten ist die Rate
  **phasenabhängig** (Figuren ertrinken; siehe `docs/ereigniskanal-filter.md`,
  Abschnitt 3 — dieselben 15092 Meldungen je Art, über 30 s statt 100 s
  verteilt). Die Urteile (a)/(a)/(b) hängen nicht an der Phase: Sie vergleichen
  **je Meldung** mit dem Snapshot desselben Taktes, nicht Raten.
- **Die 20-Hz-Aussage für `damage` ist die einzige, die eine Entscheidung
  berührt:** Der Snapshot verschmilzt 99,7 % der Treffer. Wer den Einzelbetrag
  anzeigen will, kann ihn nicht aus dem Snapshot rechnen.
- **Nicht geprüft:** ob ein künftiges HUD den Urheber anzeigen *soll*. Das ist
  eine Inhaltsfrage, keine Messfrage — deshalb (b) statt (a) bei `damage`.

## 9. Was ein Eingriff berühren würde (nicht getan, nur benannt)

Read-only Auftrag — **nichts geändert**. Für den Fall, dass der Auftraggeber
handeln will, sind das die Stellen, die dann mitmüssen:

- `src/shared/protocol.js:640-674` (`ZUSTANDSEREIGNISARTEN`, die drei stehen dort
  auf `:643` / `:647` / `:648`) und `:715-718` (`GEDROSSELTE_EREIGNISARTEN` —
  enthält nach dem heutigen Eingriff eines anderen Workers nur noch `landed` und
  `crate_landed`) plus die Regel „gedrosselt ⇒ Anzeige“
  (`tests/event-coverage.test.js:816-825`) — heute stehen die drei ausdrücklich
  auf **ungedrosselt**.
- `tests/event-coverage.test.js:192-218` (`bewusstStumm`) und der Test
  „`damage` kommt ungekuerzt durch“ (`:876-895`, die Prüfung selbst `:887`) —
  beide würden fallen. Anmerkung: Dieser Test begründet die Ausnahme mit
  „Schaden ist Spielzustand (Lebensbalken, **Höhe des Schadens**)“ — die Höhe
  hat im Client **keinen Leser** (Abschnitt 2), das ist eine Absichtserklärung,
  keine gemessene Anzeige.
- **Nicht betroffen:** Der Zähler des Filters (`gameServer.js:299-305`) und der
  Ereignisstrom der Simulation — die Drossel sitzt hinter `consumeEvents()`.

## 10. Dateien

| Datei | Änderung |
|---|---|
| `docs/ereignis-info-gehalt.md` | dieser Bericht (neu) |
| `/tmp/inhalt-messung.mjs`, `/tmp/inhalt-detail.mjs`, `/tmp/inhalt-bytes.mjs`, `/tmp/inhalt-ausnahmen.mjs` | Messskripte außerhalb des Repos |

`src/**`, `tests/**`, `scripts/**`, `tools/**` wurden **nicht** angefasst.
