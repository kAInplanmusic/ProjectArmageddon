# Architektur-Audit: Modulgrenzen, Kopplung, Schichtung

Stand: **2026-09-27, 09:38 CEST** · Branch `main` · HEAD **`fd4afc2`** (`refactor(engine): Textanker
durch Verhalten ersetzt — Fund 1 UND Fund 5 jetzt wirklich behoben`, 09:33)
Arbeitsbaum: ungetrackt `docs/audit-ui-ablauf.md`, `docs/audit-ui-spielersicht.md` (nicht von mir).
Waehrend des Audits kam `docs/audit-arch-datenfluss.md` eines **parallel arbeitenden** Pruefers
hinzu (ebenfalls nicht von mir). Von mir stammt ausschliesslich `docs/audit-arch-grenzen.md` —
nachgemessen mit `git status --short`.

**Auftrag:** Pruefgegenstand sind **Modulgrenzen, Kopplung und Schichtung** — nicht die
Wiederholung dessen, was die 21 Pruefwerkzeuge und 1122 Tests schon sagen. Die Arbeit ist
**rein lesend**; die einzige Schreibe ist diese Datei.

**Umfang:** 90 Module unter `src/` (39 901 Zeilen), 249 aufgeloeste Importkanten, 107
Testdateien (`tests/*.test.js`) und 31 E2E-Dateien (`tests/e2e/`). Gelesen: `src/**` vollstaendig
auf Importebene (maschinell), dazu `match.js`, `specials.js`, `stats.js`, `shotPrediction.js`,
`ballistics.js`, `terrainGen{2,3}.js`, `no-dead-code.test.js`, `eine-regel-eine-stelle.test.js`,
`weapons.js`-Auswertung, `tools/audit-mcp/lib/statisch.mjs` sowie `docs/duplikate-bericht.md`.

**NICHT geprueft** (abgesprochen, lastempfindlich): `npm test`, `npm run test:e2e`,
`npm run checks`, `npm run build` liefen **nicht**. Die Testzahl 1122 ist aus dem Commit
`a49e805` uebernommen, nicht nachgemessen. Ebenfalls nicht geprueft: der Browser-Pfad
(`index.html`/Vite-HMR), der E2E-Zustand, die Netzwerkschicht (`ws`) im Betrieb und alles
unter `scripts/betrieb/`. **Nicht** geprueft wurde auch `dist/` (Build-Output).
**Ein anderer Arbeiter hat waehrend dieses Audits `src/engine/match.js`, `src/engine/turret.js`
und drei Testdateien bearbeitet** (Commit `fd4afc2`); alle `match.js`-Zeilenangaben sind gegen
`fd4afc2` nachgemessen.

---

## 1. Der Import-Graph

Maschinell aufgebaut (`/tmp/arch-import-graph2.mjs`, Wegwerfsonde): Kommentare und Template-Literale
werden vor der Suche entfernt, sonst zaehlen Import-Beispiele in Kommentaren als Kanten.

| Groesse | Wert |
|---|---|
| Module (`src/**.js`) | **90** |
| aufgeloeste Kanten | **249** |
| extern (`ws`, `node:fs/path/crypto/http`) | **8** |
| unaufloesbare Importe | **0** |
| **Import-Zyklen** | **0** |
| **Schichtverletzungen** | **0** |

**Kanten je Schichtpaar** (Soll: shared < engine < client | server; erlaubt ist nur der Weg nach unten):

```
engine -> engine   57      server -> engine   23
client -> shared   40      client -> client   21
engine -> shared   40      client -> engine   20
shared -> shared   24      server -> shared   17
                           server -> server    7
```

Die drei verbotenen Richtungen kommen **null mal** vor: `engine -> client` 0, `engine -> server` 0,
`shared -> engine` 0, `shared -> client` 0, `shared -> server` 0, `client -> server` 0.
Gegengeprueft mit einem unabhaengigen, kommentarblinden `grep` ueber `src/shared/`, `src/engine/`,
`src/client/` — dieselbe Aussage. **Das ist die belastbarste positive Aussage dieses Audits: die
Schichtung haelt, und zwar vollstaendig, nicht ungefaehr.**

**Fan-out (ausgehende Kanten je Modul, Top 8):**

| Modul | Kanten | Zeilen |
|---|---|---|
| `src/engine/match.js` | **35** | 3195 |
| `src/server/index.js` (Barrel) | 35 | 62 |
| `src/client/main.js` | **31** | 3316 |
| `src/client/index.js` (Barrel) | 17 | 28 |
| `src/engine/index.js` (Barrel) | 14 | 32 |
| `src/server/gameServer.js` | 9 | 1549 |
| `src/client/renderer.js` | 8 | 1256 |
| `src/engine/shooting.js` | 8 | 746 |

**Fan-in (eingehende Kanten, Top 8):**

| Modul | Leser |
|---|---|
| `src/shared/config/weapons.js` | **13** |
| `src/engine/ecs/world.js` | 11 |
| `src/engine/match.js` | 11 |
| `src/shared/config/classes.js` | 8 |
| `src/engine/ecs/componentStore.js` · `src/shared/config/water.js` · `src/shared/seed.js` · `src/engine/terrain/collisionMask.js` | je 7 |

**Module ohne Importeur unter `src/`: 6.** Vier Barrel-Dateien (`engine|shared|client|server/index.js`),
`src/client/main.js` (Einstieg, `index.html:1059`) und `src/shared/data/index.js` (siehe 4.2).
`src/engine/shooting.js` und `src/engine/turret.js` haben einen Importeur
(`match.js:55` bzw. `match.js:59`) — die Zerlegung hat die beiden also nicht verwaist.

### 1.1 Eigener Fehlalarm — zuerst die Sonde, dann das Produkt

**Der erste Graph war falsch und meldete 127 Schichtverletzungen.** Ursache war die Sonde, nicht
der Code: mein Muster verlangte `from` in **derselben Zeile** wie `import`. Das Projekt notiert
Importe aber mehrzeilig —

```js
import {
  TURRET_PATH_STEPS,
} from './turret.js';          // match.js:55-59
```

— und damit fielen genau die Kanten weg, um die es geht. Dieselbe Sonde meldete daraufhin 13
„verwaiste" Module, darunter `shooting.js` und `turret.js`. Nach der Korrektur: **0 Verletzungen,
0 Verwaiste.** Die 127 sind als **widerlegt** zu fuehren, nicht als Befund. (Das ist die bekannte
Klasse aus `references/messwerkzeug-fallen.md` — hier am eigenen Werkzeug.)

---

## 2. Zyklen

**0 Zyklen.** Verfahren: Tiefensuche (Weiss/Grau/Schwarz) ueber alle 249 aufgeloesten Kanten;
jede Rueckkante auf einen grauen Knoten haette den Weg ausgegeben. Kein einziger Treffer — auch
nicht innerhalb einer Schicht (`shared -> shared` 24 Kanten, `engine -> engine` 57 Kanten, kein
Rueckweg). Beleg: die Richtung `engine -> shared` (40 Kanten) hat **kein** Gegenstueck
(`shared -> engine` 0). Ein Zyklus ueber die Schichtgrenze ist damit strukturell ausgeschlossen,
nicht nur nicht gefunden.

Das ist bemerkenswert, weil der Motor mit **11 eingehenden Kanten** der zweitgroesste Knoten ist
und `match.js` mit **35 ausgehenden** der groesste — ein solcher Hub ist die uebliche Quelle von
Zyklen. Die Zerlegung in `shooting.js` (746 Z.) und `turret.js` (331 Z.) mit
**Parameter-Injektion statt Rueckimport** (belegt: `tests/shooting.test.js` erzwingt, dass
`shooting.js` **0 mal** `this` benutzt — nachgemessen, 0 Treffer im kommentarblinden Code) ist
genau die Massnahme, die Zyklen verhindert. **Positiv verifiziert, mit Zahl.**

---

## 3. Gemeinsamer Zustand: wer haelt welche Groesse, und wie viele Fassungen gibt es?

### 3.1 Schwerkraft — jetzt EINE Quelle, aber eine zweite Groesse daneben (B)

| Ort | Zeile | Gestalt |
|---|---|---|
| `src/shared/ballistics.js:51` | `export const PROJECTILE_GRAVITY = 0.32` | **die Definition** |
| `src/engine/match.js:279` | `const GRAVITY = PROJECTILE_GRAVITY;` | Referenz |
| `src/client/shotPrediction.js:59` | `export const PREDICTION_GRAVITY = PROJECTILE_GRAVITY;` | Referenz |
| `src/engine/systems/projectileSystem.js:52` | `export const DEFAULT_PROJECTILE_GRAVITY = PROJECTILE_GRAVITY;` | Referenz |
| `src/engine/match.js:282` | `const CRATE_GRAVITY = 0.30;` | **zweite Zahl, kein Bezug** |

Die vier Projektilschwerkraft-Namen tragen **keine eigene Zahl** — die vom Projekt teuer
bezahlte Doppelregel ist hier wirklich geschlossen (Referenz statt Kopie, gegen
`src/engine/match.js:273-279` dokumentiert). **Bestaetigt sauber.**

`CRATE_GRAVITY = 0.30` ist dagegen eine zweite, benannte Schwerkraft. Dass Kisten anders fallen,
ist belegt und Absicht (`match.js:2312-2314`, „Eigene Fallbeschleunigung fuer Kisten: schwaecher
als bei Geschossen"). Der Befund ist nicht „muss gleich sein", sondern: **kein Test koppelt die
beiden Zahlen aneinander.** Wer `PROJECTILE_GRAVITY` um 20 % senkt (eine Balance-Entscheidung),
aendert das Verhaeltnis Kiste/Geschoss still mit. Gehoert als Kommentar-Zusage oder Test an
`match.js:282`.

### 3.2 Der Kistenflug ist die vierte Fassung des Integrationsschritts (A, bekannt, Zusatz neu)

`src/engine/match.js:2300-2303`:

```js
vy += CRATE_GRAVITY;
vx += wind * 0.8;                 // <- Zahl ohne Namen
vx *= DEFAULT_PROJECTILE_DRAG;
vy *= DEFAULT_PROJECTILE_DRAG;
```

Das ist **dieselbe 4-Zeilen-Regel wie `integrateStep`** (`src/shared/ballistics.js:90-111`), die
`ProjectileSystem` (`projectileSystem.js:174`) und `#simulateTurretPath` (`match.js:2044`) bereits
benutzen. Als Fund 2 steht der Rumpf schon in `docs/duplikate-bericht.md:198` — **ich fuehre ihn
nicht als neuen Befund.** Neu belegt sind zwei Zusaechse:

1. **Zwei Zahlen ohne Namen.** Der Windfaktor `0.8` (`match.js:2301`) und der Sink-Deckel `0.4`
   (`match.js:2336`) sind die einzigen Physikzahlen im Kistenpfad ohne Konstante. `integrateStep`
   nimmt `wind`/`gravity`/`drag` **als Parameter** — es gibt keinen Grund, warum ausgerechnet der
   Windfaktor keine sein sollte.
2. **Der Windterm der Kiste ist wirkungslos.** Gemessen (Sonde `/tmp`): mit `MAX_WIND = 0.05`
   (`match.js:280`) und `Σ drag^i, i=1..45 = 40,185` verschiebt der Wind eine Kiste ueber die
   ganze Flugzeit um **1,61 px** (Faktor 0,8) bzw. 2,01 px (Faktor 1,0) — bei einer Zielflanke von
   154–330 px (`match.js:2251`). Der Unterschied zwischen 0,8 und 1,0 betraegt **0,40 px**.

   Damit ist der Windterm fuer Kisten ein **Parameter, der existiert, aber nicht wirkt** — und der
   Kommentar `match.js:2271-2273` („nutzt dieselben Kraefte wie ein Geschoss: Schwerkraft,
   Luftwiderstand, Wind") ueberzeichnet ihn. Praktische Folge: den Term entweder benennen und
   messbar machen (groesserer Faktor) oder entfernen; beides ist eine kleine, belegbare Aenderung.

### 3.3 Das Trefferfenster der Statistik ist immer durchlaessig — die Kennzahl misst das Falsche (A, NEU)

**Der Fund mit der groessten Hebelwirkung dieses Audits, und er steht in keiner Datei unter `docs/`.**

`src/shared/stats.js`:

- `:30` `const TREFFER_FENSTER_TICKS = 240;` (4 s bei 60 Hz)
- `:50` `this.tick = 0;`  — Konstruktor
- `:111` `tick: this.tick` — in `letzterSchuss` eingetragen
- `:139` `if (letzter && !letzter.getroffen && this.tick - letzter.tick <= TREFFER_FENSTER_TICKS)`
- `:151` `if (typeof p.ticks === 'number') this.tick = p.ticks;` — **einzige Zuweisung**, im Zweig `match_over`

`MatchStats.tick` ist waehrend eines **ganzen Matches 0**: `feed()` behandelt nur `turn_start`,
`shot`, `damage` und `match_over`, und nur der letzte setzt `tick`. Damit ist `letzter.tick` immer
`0`, `this.tick` immer `0`, und `0 - 0 <= 240` **immer wahr** — die Frist von 240 Takten lehnt nie
etwas ab.

**Messung** (Sonde `/tmp`, `MatchStats` direkt gefuettert): ein Schuss, danach **2000 Takte spaeter**
ein Schadensereignis:

```
spieler 1: { schuesse: 1, treffer: 1, schaden: 6, ... }
zusammenfassung: { ..., "trefferquote": 1 }
```

Ein Schuss, der 33 Sekunden vor dem Schadenstreffer lag, zaehlt als Treffer. Wo die Zahl beim
Spieler ankommt: `src/client/main.js:1919` („Trefferquote", eigene Kennzahlen),
`main.js:1950` (Uebersicht), `main.js:2440` (Endabrechnung). Betroffen sind also **Trefferquote
und die darauf aufbauenden Erfolge** — eine Kennzahl, die nicht 0 meldet, sondern **das Falsche**.

Kein Test deckt es: `tests/metrics.test.js` prueft **Server-Betriebszaehler**, und die Datei enthaelt
kein einziges Vorkommen von `tick` oder `treffer`. Ironisch: der Kopf genau dieser Datei schreibt
den Projektgrundsatz hin, der hier verletzt ist — „Zahlen, die immer null bleiben, waeren
irrefuehrender als gar keine".

**Der Fix ist vorbereitet:** `damageSystem.js:98` hat den Tick bereits im Zugriff
(`tick: world.tickCount` im Killfeed-Eintrag), gibt ihn aber **nicht** im `damage`-Ereignis mit
(`damageSystem.js:103-110`). Der `shot`-Payload (`shooting.js:201-220`) traegt ebenfalls keinen
Tick. Fix-Weg: `tick: world.tickCount` in beide `emit`-Payloads, in `stats.js:111`/`:139` den
Tick aus dem Ereignis lesen statt `this.tick`. Damit ist das Fenster wirksam, ohne dass etwas
Neues erfunden wird. **Der Test, der das entscheidet:** `feed(shot) → 2000 Takte → feed(damage)`
muss `treffer === 0` ergeben; heute ergibt er 1.

### 3.4 Weitere Doppel-Halter (bestaetigt geschlossen)

| Groesse | Wie viele Fassungen | Beleg |
|---|---|---|
| `SIMULATION_HZ` / `TICK_MS` | 1 Definition, Server+Client re-exportieren | `shared/config/network.js:14`, Waechter `eine-regel-eine-stelle.test.js` |
| `PLAYER_HALF_WIDTH/HEIGHT` | 1 Definition, Waechter vorhanden | `shared/config/player.js`, Waechter greift |
| `POWER_TO_SPEED` | **1 Zahl** (`shared/ballistics.js:49`) | `match.js:222` re-exportiert nur |
| `launchSpeedMultiplier` | 1 Definition | `shared/launchSpeed.js:30` |
| `MAX_WIND` | 1 Definition | `match.js:280` |

---

## 4. Tote und halbtote Pfade — und ob die 0 der Werkzeuge stimmt

### 4.1 Was das Projektwerkzeug meldet

`tools/audit-mcp/lib/statisch.mjs` direkt aufgerufen (lesend, keine Datei geschrieben):

| Detektor | Meldung |
|---|---|
| `toteDateien()` | **0** |
| `unbenutzteKonstanten()` | **0** |
| `doppelregeln()` | **0** |
| `unbenutzteExporte()` | **5** — alle „export ohne externen Leser (intern genutzt)" |

**Die 0 stimmen fuer die Fragen, die die Werkzeuge stellen — und sind fuer drei Fragen blind.**

### 4.2 Die Blindheit, belegt und mit Zahl (A)

| Blindstelle | Beleg | Was dadurch unsichtbar bleibt |
|---|---|---|
| `QUELTEXT` kennt kein `.json` | `statisch.mjs:22` (`['.js','.mjs','.cjs','.ts','.tsx']`) | `src/shared/data/projectArmageddonWeaponsV1.json` (**164 128 B**) und `terrainMaterialsV1.json` (3 728 B) — **null Leser** im ganzen Baum (`grep` ueber `src/ tests/ scripts/ tools/ index.html package.json vite.config.mjs`: 0 Treffer) |
| `EINSTIEG` faengt **jedes** `index.js` auf **jeder** Tiefe | `statisch.mjs:25` | `src/shared/data/index.js` — ein **leeres** Modul (1 322 B, 28 Kommentarzeilen, 0 Exporte, `:29` „Intentionally empty"). Kein Importeur, nirgends benutzt |
| `doppelregeln()` sieht nur `const GROSSBUCHSTABEN` | `statisch.mjs:210` (`/^\s*(?:export\s+)?const\s+([A-Z_][A-Z0-9_]{2,})\s*=/`) | **gleichnamige Funktionen in zwei Dateien** — kein `function`, kein `let`, kein Kleinbuchstabe, keine Tabelleninhalte |
| `unbenutzteExporte()` zaehlt **Namen im Text**, nicht **Bindungen** | `statisch.mjs:122-129` (Regex ueber alle Projektdateien) | Ein toter Export, dessen Name in einer **anderen** Datei als **anderes** Symbol vorkommt |

**Unabhaengige bindungsbasierte Messung** (`/tmp/dead-exports-binding.mjs`: `import {X} from` **und**
`export {X} from` werden als Leser des Ziels gezaehlt): **29 tote Exporte** in `src/` ohne die
Barrel-Dateien. Gegenprobe mit dem Namen-Werkzeug: die meisten davon werden als „intern genutzt"
korrekt entlastet. **Einer bleibt, und der ist ein echter Fund** (siehe 4.3).

**Die ausgebeutete Blindstelle in einem Satz:** das Werkzeug findet 0 doppelte Funktionen, obwohl
es mindestens zwei gibt (4.3 und `docs/duplikate-bericht.md:647` — `gitterrauschen`
`terrainGen2.js:77` / `terrainGen3.js:229`, rumpfgleich auf 503 Zeichen). Es findet 0 tote
Dateien, obwohl eine leere und zwei ungenutzte Datendateien mit 169 KB im Baum liegen.

### 4.3 `hasSpecialEffect` — vier Definitionsstellen, drei Regeln, und die toedlichste ist die stille (A, NEU)

Der Name `hasSpecialEffect` steht **viermal** im Baum:

| Stelle | Rumpf | Leser |
|---|---|---|
| `src/shared/config/weapons.js:7128` (**generiert**) | `weapon.damage > 0 \|\| SPECIAL_WITHOUT_DAMAGE.includes(weapon.special)` | `weapons.js:7347`, `tests/weapon-audit.test.js:10,181,191` |
| `scripts/build-weapon-catalog.mjs:1206` | dito (Quelle des Textes) | Generator-intern |
| `src/engine/specials.js:234` | **`effectFor(weapon?.special) !== null`** | **0** |
| (Treffer in `tests/weapon-audit.test.js` und `build-weapon-catalog.mjs` sind die obigen) | | |

Zwei Dinge sind **neu** gegenueber `docs/duplikate-bericht.md:672` (dort ist `hasSpecialEffect`
in der Liste der 13 Generator↔Katalog-Rumpfpaare):

1. **Die vierte Stelle liegt im Motor, nicht im Generator, und hat einen anderen Rumpf.** Der
   Test `weapon-audit.test.js` haelt die Katalog-Regel fest; die Motor-Regel ist unbewacht. Der
   **gleiche Doc-Kommentar** steht ueber beiden („Hat diese Waffe eine Wirkung ueber Schaden und
   Flaeche hinaus?").

2. **Die beiden Regeln sind sich uneinig — gemessen: 89 von 150 Waffen (59 %).** Sonde ueber den
   echten Katalog:

   ```
   WEAPONS: 150        ABWEICHUNGEN: 89
   {"id":"pa_001","special":"bat_knockback","damage":28,"katalog":true,"motor":false}
   {"id":"pa_039","special":"mortar","damage":58,"katalog":true,"motor":false}
   ...
   ```

   Die Richtung ist einheitlich: die Katalog-Regel sagt fast immer `true` (jede Waffe mit Schaden),
   die Motor-Regel `false` (der Spezialname steht nicht in `SPECIAL_EFFECTS`).

3. **`src/engine/specials.js:234` hat null Leser** — nichts importiert den Namen aus dieser Datei.
   Das Werkzeug `unbenutzteExporte()` meldet ihn **nicht**, weil der **Name** in `weapons.js` und
   `tests/weapon-audit.test.js` vorkommt — nur eben als **anderes** Symbol mit anderer Regel.
   Das ist die Fehlerklasse „Werkzeug zaehlt Namen, nicht Bindungen", mit einem echten Opfer.

   **Nebenbei gemessen:** die Katalog-Regel **wirft** auf `undefined`
   (`TypeError: Cannot read properties of undefined (reading 'damage')`), die Motor-Regel liefert
   `false` (`weapon?.special`). Zwei Funktionen desselben Namens mit unterschiedlicher
   Randfall-Festigkeit.

**Fix-Weg.** `specials.js:234` entfernen (kein Leser, andere Regel, kein Verlust) — oder, wenn der
Begriff im Motor gebraucht wird, ihn als **einzige** Quelle exportieren und den Katalog-Generator
aus ihr speisen. Vorher entscheiden, **welche der beiden Regeln gelten soll** — das ist eine
Inhaltsfrage, kein Aufraeumen.

### 4.4 Die vier Barrel-Dateien: 137 Zeilen, kein Produktivleser (C)

`src/engine/index.js` 32 Z. · `src/shared/index.js` 15 Z. · `src/client/index.js` 28 Z. ·
`src/server/index.js` 62 Z. = **137 Zeilen**, davon **76 aktive `export`-Zeilen**
(`engine` 14, `shared` 10, `client` 17, `server` 35).

Kein Modul unter `src/` importiert sie. Belege: `package.json:11` und `package.json:6` sind die
**einzigen** Bezugnahmen (`npm run validate` importiert alle vier; `"main"` zeigt auf
`server/index.js`), der Produktivpfad geht daran vorbei (`scripts/server.mjs:43` importiert
`gameServer.js` direkt, `index.html:1059` `client/main.js`).

**Der eigentliche Befund ist die Kopie darin:** **14 Export-Zeilen** von `client/index.js` stehen
**wortgleich** in `server/index.js` (`GAME_RULES`, `MATCH_RULES`, `NETWORK_RULES`, `COMBAT_RULES`,
`LOOT_DROP_RULES…`, `CLASS_DEFINITIONS…`, `World`, `ComponentStore…`, `CollisionMask`, `DamageSystem`,
`PhysicsSystem`, `SeededRandom…`, `MatchSeedManager…`, `computeTrajectory…`).
Wandert eine dieser Quellen, muessen zwei Stellen nach — und **kein Verbraucher wuerde den Fehler
melden**, weil es keinen gibt. `tests/class-profile.test.js:224-228` prueft nur, dass zwei
bestimmte **verbotene** Namen dort *nicht* stehen — eine Abwesenheits-, keine Gleichheitspruefung.

### 4.5 Der Waechter gegen tote Dateien deckt eine von vier Schichten (B)

`tests/no-dead-code.test.js:85`:

```js
const dateien = quelldateien(path.join(ROOT, 'src', 'engine'));
```

Der Test prueft **nur `src/engine/`** — **30 Dateien**. Ungeprueft: `src/shared/` (34),
`src/client/` (20), `src/server/` (6) — **60 von 90 Dateien (67 %)**, also zwei Drittel des
Baums. Die urspruengliche Begruendung
(„zwei tote Engines lagen unter `src/engine/`") ist richtig, aber die Regel, die er traegt —
„eine Regel, eine Stelle" auf Modulebene — ist nicht auf die Schicht beschraenkt, in der sie
zuerst verletzt wurde. **Positiv:** alle vier Barrel-Dateien und `src/shared/data/index.js` sind
namentlich in `ERLAUBT_OHNE_IMPORTEUR` (`no-dead-code.test.js:70-78`) aufgefuehrt, also waere eine
Ausweitung auf `src/client`+`src/server` sofort lauffaehig (nachgemessen: 0 verwaiste Dateien dort).

---

## 5. Bruchstellen zwischen den Schichten

### 5.1 Die „Bot-KI" — 22 Kommentare berufen sich auf einen Konsumenten, den es nicht gibt (B)

`src/server/index.js:33-36` stellt ausdruecklich fest:

> „Kein `BotController`-Export: Es gibt keine Bot-KI. Teams werden nur von Menschen gespielt."

Trotzdem berufen sich **22 Stellen in 9 Dateien unter `src/`** auf „Bot-KI" als den dritten
Konsumenten, der eine Zentralisierung rechtfertigt — unter anderem:

| Stelle | Aussage |
|---|---|
| `src/shared/launchSpeed.js:8` | „…und — beim Umbau der Bot-KI — gebraucht vom Server." |
| `src/client/shotPrediction.js:144` | „Der Geschwindigkeitsfaktor … weil ihn die Bot-KI (Server) und der Motor ebenso brauchen." |
| `src/engine/match.js:213` | „clientseitige Vorhersage und Bot-KI lesen dieselbe Konstante." |
| `src/engine/shooting.js:441,551` | „…die Vorhersage und die Bot-KI benutzen." |
| `src/server/gameServer.js` | 7 Nennungen |

Die Zentralisierung selbst ist **richtig** (Engine, Client-Vorhersage, Zielvorschau und
Geschuetz-Pfad sind echte Konsumenten, in 1. und 2. belegt). Der Befund ist: **die Begruendung
stuetzt sich auf einen Phantom-Leser.** Ein Leser, der die Bot-KI sucht, findet sie nicht, und
eine geplante Wiedereinfuehrung wuerde die Kommentare stillschweigend wieder wahr machen; eine
Streichung dagegen wirft die Frage auf, ob die Zentralisierung weiterhin gerechtfertigt ist (sie
ist es — aber aus den drei echten Konsumenten). Reine Textarbeit, aber sie kostet jeden neuen
Leser Zeit.

### 5.2 `power_to_speed` wird an eine Stelle gezeigt, an der die Zahl nicht mehr steht (C)

`src/shared/config/classes.js:202`:

> `BASE_HEALTH` = 100, `POWER_TO_SPEED` = 0,14 in `src/engine/match.js`

`POWER_TO_SPEED` steht seit dem Umbau in **`src/shared/ballistics.js:49`**. `match.js:222` gibt
den Namen nur noch weiter (`export { POWER_TO_SPEED };`). Der Kommentar zeigt nicht auf eine
Luege, aber auf einen **Re-Export** — und genau das ist die Stelle, an der der naechste Leser
glaubt, die Balance wohne im Motor. Zweite Stelle desselben Musters: `classes.js:37`
`ARCHETYPE_LAUNCH_BASE = 1.2` ist die echte Zahl, `launchSpeed.js` verrechnet sie.

### 5.3 Ein Import und ein Re-Export ohne jeden Leser (C)

`src/client/terrainPreview.js`:

- `:15` `import { MAP_SIZES, mapSizeFor } from '../engine/match.js';` — `MAP_SIZES` wird in der
  Datei **nie** benutzt (nur `mapSizeFor`, `:23`)
- `:40` `export { MAP_SIZES };` — Re-Export an **niemanden**; bindungsbasiert bestaetigt
  (0 Leser in `src/`, `tests/`, `scripts/`)

Vermutlich ein Rest der Naht, ueber die `MAP_SIZES` frueher vom Client aus erreichbar war.
Zwei Zeilen.

### 5.4 Ein Test, der die Implementierung festhielt — bestaetigt und behoben

Die Fehlerklasse „ein Test, der die Implementierung festhaelt" war hier **wirksam und ist
dokumentiert**: `tests/turret-ballistics.test.js` verlangte den **Wortlaut** `vy *= drag` im Rumpf
von `#simulateTurretPath`, `tests/reichweite-konsistenz.test.js` forderte **genau zwei**
Vorkommen von `* geschwindigkeitsFaktor(this.width)`. Der Commit `fd4afc2` fasst die Lehre selbst
zusammen: „Ein Test, der die Implementierung festhaelt, blockiert die Verbesserung."
**Bestaetigt, nicht neu** — und der Vorgang ist eine Warnung fuer jede weitere Zerlegung:
`tests/shooting.test.js:60` („match.js bleibt unter 3200 Zeilen") und
`tests/shooting.test.js:54` („shooting.js greift 0-mal auf `this` zu") sind **Strukturanker**, die
denselben Effekt haben koennen, aber eine Architekturregel tragen (Parameter statt Instanz,
Rumpf wirklich draussen). Nachgemessen: beide halten heute (0 `this`-Treffer in `shooting.js`,
`split('\n').length` von `match.js` = **3195**).

---

## 6. Umfang: gewachsene Dateien, gewachsene Funktionen, Budgets

**Schichtgroessen** (`src/`, 39 901 Zeilen): `shared/` ist mit `config/weapons.js` allein
7 358 Zeilen der groesste Einzelposten.

| Datei | Zeilen | Budget? |
|---|---|---|
| `src/shared/config/weapons.js` | **7 358** | generiert, **kein Budget** |
| `src/client/main.js` | **3 316** | **kein Budget** |
| `src/engine/match.js` | **3 195** | `< 3200` (`tests/shooting.test.js:60`) — **5 Zeilen Luft** |
| `src/server/gameServer.js` | 1 549 | **kein Budget** |
| `src/client/renderer.js` | 1 256 | **kein Budget** |
| `src/shared/terrainGen3.js` | 1 114 | kein Budget |
| `src/shared/protocol.js` | 992 | kein Budget |
| `src/shared/config/backdrops.js` | 981 | kein Budget |
| `src/shared/config/factions.js` | 921 | kein Budget |
| `src/client/hud.js` | 814 | kein Budget |

**Das Zeilenbudget existiert genau einmal — fuer die Datei, die ohnehin bewacht wird.**
`tests/replay-uhr.test.js:253` (`ERLAUBTE_ZEILEN`) ist etwas anderes: eine Leser-Whitelist fuer
`#startedAt`, kein Groessenbudget.

**Die 5 Zeilen Luft in `match.js` sind ein aktives Risiko, kein Ordnungspunkt:** genau heute hat
ein anderer Arbeiter **118 Zeilen** in dieser Datei verschoben (Commit `fd4afc2`,
`git diff --stat a49e805..HEAD`: `src/engine/match.js | 118 ++++++------`). Eine Zerlegung, die
5 Zeilen hinzufuegt, macht `tests/shooting.test.js:60` rot — und der naechste Schritt waere,
das Budget zu erhoehen, womit der Waechter seinen Zweck verliert. Der naheliegende naechste
Kandidat steht schon fest: der **Kistenpfad** (3.2, `#stepCrate` `match.js:2277-2342`,
`#rollDropThrow` `:2230-2265`, `#stepFlyingCrates` `:2344-2354`, zusammen ~78 Zeilen) ist eine
zusammenhaengende, bereits als Nachbau erkannte Einheit — er wuerde das Budget **entlasten**
statt belasten.

**111 Funktionen/Methoden ≥ 40 Zeilen** (Klammerzaehlung; die mit `switch`/`for` bezeichneten
Zeilen sind grosse **innere** Bloecke, die die Zaehlung als eigene Einheit erfasst — sie sind
mitgenannt, weil sie die Kopplungszahl der umgebenden Methode erklaeren). Die groessten und die
mit den meisten Instanzzugriffen:

| Zeilen | Ort | Funktion | `this.`-Zugriffe |
|---|---|---|---|
| **282** | `src/server/gameServer.js:1145` | `#handleConnection` | 26 |
| 214 | `src/server/gameServer.js:1187` | (verschachteltes `switch` darin) | 20 |
| **257** | `src/engine/systems/projectileSystem.js:79` | `update` | 7 |
| 193 | `src/client/sceneryPainter.js:117` | `switch` | 0 |
| **169** | `src/engine/systems/guentherSystem.js:186` | `update` | **66** |
| 160 | `src/client/main.js:908` | `startOnline` | 33 |
| 107 | `src/client/main.js:78` | `constructor` | 39 |
| 95 | `src/engine/match.js:785` | `#buildTerrain` | 28 |
| 89 | `src/client/networkClient.js:309` | `#handleMessage` | 40 |
| 88 | `src/client/renderer.js:933` | `#drawGuenther` | 53 |

**Dateien mit den meisten ≥40-Zeilen-Rumpfen:** `client/main.js` **22**, `engine/match.js` 18,
`server/gameServer.js` 15, `client/renderer.js` 10, `client/hud.js` 6.

**`guentherSystem.update` ist der Ausreisser nach Kopplung:** 66 `this.`-Zugriffe in 169 Zeilen —
kein anderer Rumpf kommt ueber 53. Das ist die Zahl, die eine Zerlegung begruendet (nicht die
Laenge: `sceneryPainter` ist mit 193 Zeilen laenger und hat **0** `this.`-Zugriffe, weil er ueber
Parameter arbeitet — das ist die bessere Bauform, siehe 2.).

`src/server/gameServer.js:1145` ist mit 282 Zeilen der groesste Rumpf im Produktivpfad und hat
**kein** Budget, obwohl die Datei seit dem Hunter-Audit (1 342 Z.) um 207 Zeilen gewachsen ist.

---

## BESTAETIGT / VERDACHT / WIDERLEGT

### Bestaetigt (Messung liegt vor)

| # | Befund | Schwere | Beleg | Zahl |
|---|---|---|---|---|
| B1 | Schichtung haelt vollstaendig: keine der verbotenen Richtungen existiert | — (positiv) | Import-Graph §1 | 0 von 6 moeglichen Richtungen, 249 Kanten |
| B2 | Keine Import-Zyklen | — (positiv) | DFS §2 | 0 bei 90 Modulen / 249 Kanten |
| B3 | `MatchStats.tick` wird nie fortgeschrieben → `TREFFER_FENSTER_TICKS` immer durchlaessig → `trefferquote` falsch | **A** | `stats.js:30,50,111,139,151`; Anzeige `main.js:1919,1950,2440` | 2000 Takte Abstand → `treffer: 1`, `trefferquote: 1`; kein Test deckt es |
| B4 | `hasSpecialEffect` in `specials.js:234` ist toter Export **und** die 3. Regel | **A** | `specials.js:234` vs `weapons.js:7128` | 0 Leser, **89/150** Abweichungen (59 %) |
| B5 | `doppelregeln()` ist auf `const GROSSBUCHSTABEN` beschraenkt und meldet deshalb 0 | **A** | `statisch.mjs:210` | 0 gemeldet, ≥2 gleichnamige Funktionen real |
| B6 | `unbenutzteExporte()` zaehlt Namen, nicht Bindungen — maskiert B4 | **A** | `statisch.mjs:122-129` | 5 gemeldet, 1 echter toter Export verdeckt |
| B7 | `toteDateien()` ist blind fuer `.json` und fuer jedes `index.js` | **B** | `statisch.mjs:22,25` | 3 Dateien / 169 178 B mit 0 Lesern unsichtbar |
| B8 | Kisten-Integrationsschritt ist die 4. Fassung; Windterm wirkt nicht | **B** (bekannt) + Zahlen neu | `match.js:2300-2303,2336`; `ballistics.js:90` | 1,61 px von 154–330 px Zielflanke; 0,40 px Unterschied 0,8→1,0 |
| B9 | `CRATE_GRAVITY = 0.30` neben `PROJECTILE_GRAVITY = 0.32`, ohne Kopplung | **B** | `match.js:282` vs `ballistics.js:51` | 2 Zahlen, 0 Tests |
| B10 | Der „kein Importeur"-Waechter deckt nur `src/engine/` | **B** | `no-dead-code.test.js:85` | 30 von 90 Dateien geprueft (33 %) |
| B11 | Vier Barrel-Dateien, 0 Produktkonsument, 14 wortgleiche Zeilenkopien | **C** | `client/index.js` ↔ `server/index.js`; `package.json:6,11` | 137 Zeilen, 76 Exporte, 14 Kopien |
| B12 | „Bot-KI" als Begruendung in 22 Kommentaren, obwohl sie laut Code nicht existiert | **B** | `server/index.js:33-36` vs 9 Dateien | 22 Nennungen |
| B13 | `match.js` hat 5 Zeilen Luft, waehrend darin 118 Zeilen bewegt wurden | **B** | `shooting.test.js:60` | 3195 / 3200 |
| B14 | Kein Groessenbudget ausser fuer `match.js` | **C** | §6 | 9 Dateien > 800 Z. unbewacht, groesste 7 358 |
| B15 | `guentherSystem.update`: 66 `this.`-Zugriffe in 169 Zeilen | **C** | `guentherSystem.js:186` | 66 vs 53 (naechsthoechster) |
| B16 | `terrainPreview.js:15/40` — ein Import und ein Re-Export ohne Leser | **C** | `terrainPreview.js:15,40` | 2 Zeilen, 0 Leser |
| B17 | `classes.js:202` zeigt auf einen Re-Export statt auf die Zahl | **C** | `classes.js:202` vs `ballistics.js:49` | 1 Stelle |

### Verdacht (der Test, der es klaeren wuerde)

| # | Verdacht | Der Test, der entscheidet |
|---|---|---|
| V1 | Der Kisten-Landeort haengt nicht am Wind, obwohl `#rollDropThrow` (`match.js:2237-2249`) ihn aus der Zieldistanz rechnet und den Wind bewusst **auslaesst** | Ein Wurf bei `MAX_WIND = ±0,05` und einer bei Windstille, je 200 Seeds: die Landestelle darf sich um **≤ 2 px** unterscheiden. Erwartung nach Rechnung: ≤ 1,61 px → **harmlos**, aber die Zusage gehoert gemessen, weil sie heute nur im Kommentar steht |
| V2 | Die Motor-Regel in `specials.js:234` und die Katalog-Regel koennten beide „richtig" sein und nur verschiedene Fragen beantworten („hat eine Wirkung" vs „macht Schaden") | Ein Test, der fuer die 11 `SELF_TARGET_KINDS`-Waffen (Heilzauber, Eisschild, Auto-Turret, laut `weapons.js:7097`/`check-weapon-targeting`) beide Funktionen gegen die **Wirkung** stellt. Faellt er aus, ist eine der beiden Regeln falsch benannt |
| V3 | Der leere `src/shared/data/index.js` und die zwei JSON-Dateien koennten als Altdaten-Vertraeglichkeit fuer Replays/Snapshots gedacht sein | `grep -rn "PERSISTENCE_VERSION\|SICHERUNG_VERSION"` in `protocol.js`/`persistence.js` zeigt, ob die Persistenz diese Dateien je beruehrt hat. Aktuell: 0 Leser, also wahrscheinlich nicht |
| V4 | `gameServer.js#handleConnection` mit 282 Zeilen koennte intern bereits ueber Parameter arbeiten und nur optisch monolithisch sein | `this.`-Zugriffe **innerhalb** des Rumpfes zaehlen (26 gemessen) gegen die der Nachbarmethoden: liegen die Zugriffe konzentriert in einem Teilblock, ist die Zerlegung ein Umzug ohne Umzug |

### Widerlegt (ausdruecklich, mit Ursache)

| # | Vermutung | Nachpruefung |
|---|---|---|
| W1 | „Schichtverletzungen und Zyklen im Import-Graph" | **Fehlalarm des eigenen Messaufbaus.** 127 Schichtverletzungen und 13 verwaiste Module waren ein Artefakt eines Scanners, der mehrzeilige `import { … } from` nicht erkannte. Nach der Korrektur: 0 und 0 (§1.1) |
| W2 | Der Windfaktor `0.8` im Kistenpfad (`match.js:2301`) weiche von `integrateStep` (Faktor 1) ab und verschiebe das Ergebnis | **Fehlalarm in der Wirkung, nicht im Code.** Der Unterschied betraegt **0,40 px** ueber die ganze Flugzeit bei `MAX_WIND = 0,05`. Der Term ist real abweichend, aber ohne sichtbare Folge (§3.2) |
| W3 | `src/engine/shooting.js` und `src/engine/turret.js` seien nach der Zerlegung ohne Importeur | **Fehlalarm** derselben Sonde (W1). Beide haben einen: `match.js:55` bzw. `match.js:59` |
| W4 | `PREDICTION_GRAVITY`, `PREDICTION_DRAG`, `PREDICTION_POWER_TO_SPEED` in `shotPrediction.js:59-66` seien Doppelregeln | **Fehlalarm.** Alle drei sind Referenzen auf `shared/ballistics.js`, tragen **keine** eigene Zahl (Kommentar `shotPrediction.js:52-55`) |
| W5 | Die Barrel-Dateien seien toter Code | **Zum Teil Fehlalarm.** Sie werden von `npm run validate` (`package.json:11`) als Verkabelungstest geladen. Der Befund bleibt, aber als **C** (Kopien), nicht als „tot" |
| W6 | `resolveStrike`, `fuseTicksFor`, `isValidAngle`, `isValidPower`, `GERAETE_SCHLUESSEL`, `applySelfEffect` seien tot | **Fehlalarm des Projektwerkzeugs korrekt gemeldet** („intern genutzt"). Nachgeprueft: alle werden **innerhalb** ihrer Datei benutzt (`shooting.js:246,338,431,227,639`; `validation.js:75,78`; `identity.js:102,106`). Es ist jeweils nur das `export` ueberfluessig — genau die harmlose Sorte, die `statisch.mjs:140` trennt |

---

## Nicht gefunden (Auftragspunkte, die zu pruefen waren)

| Auftragspunkt | Ergebnis | Beleg der Suche |
|---|---|---|
| `engine`, das aus `client/` liest | **nicht vorhanden** | Import-Graph: `engine -> client` 0 Kanten; unabhaengiges `grep -rn "from '\.\./client" src/engine/` → 0 Treffer |
| `shared`, das aus `engine/` liest | **nicht vorhanden** | `shared -> engine` 0 Kanten; `grep -rn "from '\.\./engine" src/shared/` → 0 Treffer |
| `client`, das aus `server/` liest | **nicht vorhanden** | `client -> server` 0 Kanten; `grep -rn "from '\.\./server" src/client/` → 0 Treffer |
| Import-Zyklen | **nicht vorhanden** | DFS ueber 249 Kanten → 0 (§2) |
| Dynamische Importe (`import(…)`) | **nicht vorhanden in `src/`** | Scanner §1: 0 Treffer. Der einzige dynamische Zugriff ist `import.meta.glob` (`renderer.js:23`, `roster.js:4`) — Vite-spezifisch, keine Modulgrenze |
| Gleichnamige Konstanten in zwei Dateien (Grossbuchstaben) | **nicht vorhanden** | eigenes Verfahren (`/tmp/dupdefs.py`) ueber 90 Dateien → 0; deckt sich mit `doppelregeln()` |
| Exporte, die nur in Tests gelesen werden | **1 Fall** | `src/engine/systems/turnSystem.js` re-exportiert `COMPONENT_SIGNATURES` (ein `componentStore`-Symbol) — gefunden im bindungsbasierten Lauf, nicht bestaetigt als toter Export |
| Funktionen mit 0 Aufrufen | **1 bestaetigt** | `specials.js:234 hasSpecialEffect` (B4). Die uebrigen 28 bindungsbasiert toten Exporte sind, einzeln nachgeprueft, in-datei-genutzt (W6) oder Generator-Text (bekannt) |

---

## Die drei Stellen, die die naechste grosse Aenderung am meisten behindern werden

### 1. Das Zeilenbudget `match.js < 3200` mit 5 Zeilen Luft — es blockiert genau die Arbeit, die es erzwingen soll (B13)

**Warum zuerst:** `docs/zerlegung-turret.md` belegt, dass an dieser Regel wochenlang gearbeitet
wurde; heute wurden 118 Zeilen darin bewegt. Die naechste sinnvolle Aenderung an `match.js` —
irgendetwas, das 5 Zeilen braucht — macht `tests/shooting.test.js:60` rot, und der Reflex
„Budget erhoehen" entwertet den Waechter. Das Budget ist heute eine **Sperre ohne Ziel**.

**Vorschlag (klein, konkret):** `#stepCrate` + `#rollDropThrow` + `#stepFlyingCrates`
(`match.js:2230-2354`, ~78 Zeilen) als `src/engine/systems/crateSystem.js` herausziehen und
**im selben Schritt** `integrateStep` benutzen (dort ist es ohnehin Fund 2). Das ist keine
neue Arbeit: beide Aenderungen sind im `duplikate-bericht` schon belegt und begruendet. Danach
das Budget **einmal** auf einen neuen, begruendeten Wert setzen (z. B. `< 3100` — nur unter dem
Ist, nie darueber), damit es wieder eine Untergrenze fuer den naechsten Schritt ist statt eine
Obergrenze fuer den aktuellen.

### 2. `MatchStats.tick` — die falsche Trefferquote (B3)

**Warum zweitens:** Es ist der einzige Befund dieses Audits, bei dem eine **dem Spieler gezeigte
Zahl nachweislich falsch** ist, und die Korrektur ist ein Bruchteil der Arbeit der anderen
Punkte. Zusaetzlich haengen Erfolge (`shared/achievements.js:264`) an denselben Kennzahlen.

**Vorschlag (klein, konkret):** Drei Zeilen plus ein Test.
`damageSystem.js:103` den vorhandenen Tick mitgeben (`:98` hat ihn: `tick: world.tickCount`),
`shooting.js:201` ebenso; in `stats.js:139` `const jetzt = typeof p.tick === 'number' ? p.tick : this.tick;`
lesen. Test: `feed(shot) → feed(damage)` mit 2000 Takten Abstand muss `treffer === 0` ergeben —
heute 1. **Gegenprobe im selben Test:** 100 Takte Abstand muss `treffer === 1` ergeben, damit der
Fix nicht einfach das ganze Fenster abschaltet.

### 3. `hasSpecialEffect` — vier Stellen, drei Regeln, eine davon tot (B4)

**Warum drittens:** Es ist der Musterfall fuer die Blindstelle der 21 Werkzeuge. Der Name steht
viermal, zwei Rumpfe sind unvereinbar (89 von 150 Waffen), und die **toten** 3 Zeilen sind
diejenigen, die niemand sieht. Jede weitere Aenderung an „was ist eine Spezialwirkung" muss raten,
welche der Regeln gilt.

**Vorschlag (klein, konkret):** Zuerst **entscheiden, nicht aufraeumen**: Ein Vergleichslauf
`motorRegel` vs `katalogRegel` ueber alle 150 Waffen mit Namensausgabe (die Sonde liegt bei,
`/tmp/sonde-hasspeciale.mjs`; Ergebnis 89/150) zeigt, dass die Katalog-Regel „hat Schaden" misst und
die Motor-Regel „hat eine gemappte Wirkung" — **zwei verschiedene Fragen unter einem Namen.**
Danach: die Motor-Funktion umbenennen (`hasMappedEffect`) **oder** entfernen, und — unabhaengig
davon — einen Test aufnehmen, der die **Namen** koppelt: `grep` ueber `src/engine/` darf den Namen
`hasSpecialEffect` nur an **einer** Stelle definieren. Damit greift derselbe Waechter wie
`eine-regel-eine-stelle.test.js`, nur fuer Funktionsnamen statt Grossbuchstaben — genau die Luecke,
die B5 und B6 belegen.
