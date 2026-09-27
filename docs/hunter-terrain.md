# Hunter-Agent #5 — Karte, Terrain, Teams, ECS, Persistenz

**Rolle:** Hunter-Agent #5 (Karte/Terrain/Teams/ECS/Persistenz)
**Repo:** `ProjectArmageddon`
**Stand:** 2026-09-27
**Belegregel:** Jede Aussage trägt `datei:zeile`. Messungen sind mit dem exakten
Kommando am Ende reproduzierbar. Entwurfsentscheidungen sind als solche
markiert, Befunde mit Schweregrad.

---

## 0. Gegenstand und Kurzantworten

| # | Frage | Kurzantwort |
|---|---|---|
| 1 | Wie funktioniert `materialAt(x,y)`? | Ein 64-px-Zellenfeld aus einem Seed-Zweig; gelesen an **einer** Stelle (`match.js:1367`) auf der **Bodenzeile** `y + PLAYER_HALF_HEIGHT`; Eis nimmt Reibung zurück, Gummi gibt Aufprall zurück. |
| 2 | `rng.fork(0x4D4154)` — wie verteilt es Erde/Eis/Gummi? | `fork` startet **aus dem Seed**, nicht aus dem Zustand (`prng.js:122`). Schwellen 0,78 / 0,16 auf einem 64-px-Gitter. Gemessen: Erde 61,5 %, Eis 22,1 %, Gummi 16,4 % — **nicht** „die meiste Karte bleibt Erde" (`terrainGen3.js:288`). |
| 3 | `terrainGen2` vs `terrainGen3`? | Gen 2 = **sechs feste Schablonen** (`terrainGen2.js:105`), Gen 3 = **kein Typ**, sieben gezogene Achsen + Spielbarkeitsprüfung (`terrainGen3.js:61,364`). Gen 1 (1D-Höhenfeld) lebt weiter als Rückfallweg (`terrainGen.js`, `match.js:856`). Umschalter ist `kartentyp` (`match.js:826-865`). |
| 4 | CharacterSystem — Spawn-Logik, Team-Zuweisung? | **Kein Spawn, keine Teams.** Das CharacterSystem ist reine Figurenphysik (`characterSystem.js:57`). Spawn und Teamzuordnung liegen in `match.js#spawnPlayers` (`match.js:1000-1095`), Team = `index % teams` (`match.js:1009`). **BEFUND A (hoch):** Die trockene Startposition wird berechnet, aber für `x` nicht benutzt. |
| 5 | Persistenz = eine Datei — warum? Welche Felder? | Eine JSON-Datei mit **Replay-Kern** (Seed + Konfiguration + Eingaben) statt ECS-Dump, atomar geschrieben (`persistence.js:1-13,39-58`). Felder in `serializeLobby` (`persistence.js:105-125`). **BEFUND D (mittel):** Sitzungs-Token im Klartext, Dateirechte weltlesbar. |
| 6 | Terrain-Zerstörung — deterministisch? | Ja im Autoritätslauf: Krater ohne Zufall und ohne Uhr (`collisionMask.js:103`), aus dem Replay-Kern reproduzierbar. **BEFUND B (hoch):** `surfaceYAt` liest weiter das **unzerstörte** Bitmap; **BEFUND C (hoch):** online existiert der Krater beim Client nur als Bild, nie in der Kollision; **BEFUND E (mittel):** der Determinismus-Hash kennt Terrain nicht. |

---

## 1. Das Material-System (Frage 1)

### 1.1 Die zwei Achsen und ihre Werte

`src/shared/config/terrain.js:47-54` — die Kennungen, mehr gibt es nicht:

```js
TERRAIN_MATERIAL = { NORMAL: 0, ICE: 1, RUBBER: 2 }   // terrain.js:47-54
```

Der Katalog `terrain.js:59-80` beschreibt jedes Material über **zwei** Zahlen:

| id | key | `rutschigkeit` | `rueckprall` | Wirkung im Motor |
|---|---|---|---|---|
| 0 | `normal` | 0 | 0 | Boden wie bisher |
| 1 | `ice` | 1 | 0 | Bodenreibung des Schritts wird ganz zurückgenommen |
| 2 | `rubber` | 0 | 0,6 | 60 % des Aufsetztempos kommen als Impuls zurück |

**Entwurfsentscheidung:** `TERRAIN_MATERIALS[0]` ist die Vorgabe
(`terrain.js:57`), und `materialById(id)` fällt bei jeder unbekannten Kennung
darauf zurück (`terrain.js:98-100`). Damit bleiben 1D-Karten (Presets), alte
Replays und ein fehlendes Feld „Boden wie vorher" — dieselbe Toleranz wie in
`classes.js`/`water.js`.

**Entwurfsentscheidung:** `rutschigkeit` ist bewusst **nie über 1**
(`terrain.js:63-66`) — „mehr als kein Halt" gibt es nicht; ein Wert darüber
würde die Figur beschleunigen statt gleiten lassen. `rueckprall = 0,6`
(`terrain.js:71-76`) ist so gewählt, dass die Folge ausklingt
(0,6 → 0,36 → 0,22 …). Die Mindestschwelle `RUECKPRALL_MINDESTTEMPO = 3`
(`terrain.js:91`, angewandt in `match.js:1440`) verhindert das ewige Weiterhüpfen.

### 1.2 Das Feld — woher es kommt

`terrainGen3.js:296-302` — vier Konstanten, alle benannt:

```js
const MATERIAL_FORK = 0x4D4154;      // „MAT"                terrainGen3.js:296
const MATERIAL_ZELLE = 64;           // Kantenlänge in px    terrainGen3.js:298
const MATERIAL_EIS_SCHWELLE = 0.78;  // darüber Eis          terrainGen3.js:300
const MATERIAL_GUMMI_SCHWELLE = 0.16;// darunter Gummi       terrainGen3.js:302
```

`baueMaterialfeld(rng, width, height)` (`terrainGen3.js:309-326`) legt ein
Gitterrauschen über `ceil(width/64) × ceil(height/64)` Zellen und schreibt je
Zelle eine Kennung:

```js
if (t > 0.78) id = ICE; else if (t < 0.16) id = RUBBER;   // terrainGen3.js:319-320
```

**Entwurfsentscheidung — warum 64 px:** etwa viereinhalb Figuren (Körper 14 px
breit). Feiner wäre ein Flickenteppich: eine Figur stünde mit einem Fuß auf Eis
und mit dem anderen auf Gummi, „und der Boden wäre keine Fläche mehr, sondern
ein Muster" (`terrainGen3.js:281-286`).

**Entwurfsentscheidung — warum asymmetrisch:** Das geglättete Rauschen sammelt
sich um 0,5; die Schwellen schneiden nur die Flanken ab
(`terrainGen3.js:288-293`). Die Absicht ist „Sonderboden ist ein FUNDSTÜCK,
kein Grundzustand" — **die Messung widerlegt die Absicht** (siehe 2.3).

Das Feld selbst ist ein `Uint8Array` über `spalten × zeilen` Zellen
(`terrainGen3.js:314`), also **nicht** pixelgenau. Es wird nach dem Bau der
Karte in `match.js` übernommen:

```js
this.#material = k.material ?? null;    // match.js:846
```

`null` heißt „einfacher Boden überall" — der Fall bei 1D-Gelände und alten
Replays (`match.js:423-430`).

### 1.3 Die EINE Lesestelle

```js
materialAt(x, y) { return materialAmPunkt(this.#material, x, y); }   // match.js:1367-1369
```

`materialAmPunkt` (`terrainGen3.js:337-342`) ist die einzige Funktion, die das
Feld auslegt; `match.js:1362-1365` nennt sie ausdrücklich „DIE EINE Lesestelle".
Zusätzlich gibt es `get terrainMaterial` für Werkzeuge (`match.js:1372`) und
`zaehleMaterialien` für Prüfwerkzeuge (`terrainGen3.js:345-353`).

### 1.4 Wo es wirkt — und warum auf der Bodenzeile

Der Ablauf je Tick ist in `match.js:1113-1153` festgelegt:

```
#stepFlyingCrates()      match.js:1119
#merkeBewegung()         match.js:1128  ← Bewegungszustand VOR dem Schritt
#world.step()            match.js:1129  ← Physik (Reibung, Landung) läuft
#updateGroundedState()   match.js:1132
#wendeBodenmaterialAn()  match.js:1134  ← Material wirkt NACH dem Schritt
```

**Entwurfsentscheidung:** Das Material kann seine Werte erst nach dem
Physikschritt anwenden, weil es zwei Zahlen braucht, die dort schon
überschrieben sind: die waagerechte Geschwindigkeit **vor** der Reibung (Eis)
und das senkrechte Tempo des Aufpralls (Gummi). Dafür führt `MatchController`
den Speicher `#bewegung` (`match.js:431-441`, gefüllt in `match.js:1375-1384`).

Die Anwendung (`match.js:1405-1445`):

```js
const material = this.materialAt(x, y + PLAYER_HALF_HEIGHT);      // match.js:1428
if (material.id === TERRAIN_MATERIAL.NORMAL) continue;            // match.js:1429
if (material.rutschigkeit > 0 && stehtJetzt)                       // match.js:1433
  neu = vx + (vorher.vx - vx) * material.rutschigkeit;             // match.js:1435
if (material.rueckprall > 0 && !vorher.grounded && stehtJetzt
    && vorher.vy > RUECKPRALL_MINDESTTEMPO)                        // match.js:1439-1440
  Velocity.y = -(vorher.vy * material.rueckprall);                 // match.js:1442
```

**Die Antwort auf die Frage nach `y + PLAYER_HALF_HEIGHT`** (`match.js:1428`):
`y` ist die **Fußposition** (`config/player.js:20-23`). Die Fußlinie schwankt im
Betrieb um einige Pixel — eine landende Figur wird auf `Oberfläche − halbe
Höhe` gesetzt, die Schwerkraft zieht sie im nächsten Schritt wieder herunter.
Gemessen lag eine Figur abwechselnd bei `y = 702` und `y = 711`
(`match.js:1416-1427`); bei 64-px-Zellen fiel sie damit von einer Zelle in die
nächste und **derselbe Boden meldete einmal Gummi und einmal Eis**.
`y + PLAYER_HALF_HEIGHT` ist der tiefste Punkt des Körpers — die Zeile, die den
Grund berührt — und über die ganze Schwankung **dieselbe**. Der Fix ist richtig
und die Begründung ist belegt.

**Entwurfsentscheidung — kein Ereignis:** Es gibt bewusst **kein**
`boden_rutschig`/`boden_rueckprall`. `tests/event-coverage.test.js` verlangt für
jedes Engine-Ereignis einen Behandlungszweig in der Anzeige; ein Ereignis ohne
Zweig wäre eine stumme Stelle (`match.js:1395-1403`). Der Boden ist über
Position und Geschwindigkeit sichtbar.

**Abgrenzung:** Gelesen wird das Material **nur für Spielerfiguren**
(`match.js:1406`, Schleife über `this.#players`). Kisten, Günther und Geschütze
kennen kein Material — `CharacterSystem` ebenfalls nicht (siehe 4.2).

---

## 2. `rng.fork(0x4D4154)` — wie das Material verteilt wird (Frage 2)

### 2.1 Was `fork` technisch ist

```js
fork(offset) { return new SeededRandom((this.#seed + offset) >>> 0); }  // prng.js:122-125
```

**Entwurfsentscheidung:** `fork` zweigt vom **Seed** des Elternstroms ab, nicht
von dessen Zustand. Damit liest es den Elternstrom nicht an — die Alternative
„ein paar zusätzliche `rng.next()` hinter der Karte" hätte **alle folgenden
Züge verschoben** und damit nicht eine Eigenschaft ergänzt, sondern einen
anderen Generator ergeben (`terrainGen3.js:266-279`).

Der Zweig hängt am TERRAIN-Strom, nicht am Basisseed:

```js
const material = typeof rng.fork === 'function'
  ? baueMaterialfeld(rng.fork(MATERIAL_FORK), width, height) : null;   // terrainGen3.js:974-976
```

Damit ist der Materialseed `baseSeed + TERRAIN(2 000 000)
+ MATERIAL_FORK(5 062 996)` (`seed.js:20-31`, `prng.js:122`). Er kollidiert mit
keinem der festen Offsets `{0, 1e6, 2e6, 3e6, 4e6, 5e6}`, weil der Abstand
7,06e6 beträgt — gemessen und nachgerechnet, nicht behauptet.

**Wichtige Folge:** Das Material ist für **jeden** Versuch innerhalb von
`erzeugeAutonomeKarte` identisch (`terrainGen3.js:384-397` zieht bis zu 8 Mal).
Ein misslungener Kartenversuch verschiebt das Material nicht.

### 2.2 Die Verteilung — gemessen

Über 60 Seeds, Karte 1280×720 (siehe Reproduktion `RE-4`):

```
normal = 61,5 %    ice = 22,1 %    rubber = 16,4 %    (16 400 Zellen)
```

### 2.3 BEFUND F (niedrig/mittel) — die Dokumentation beschreibt eine andere Verteilung

`terrainGen3.js:288-293` behauptet: „die meisten Karten bleibt Erde … Ein
Sonderboden ist ein FUNDSTÜCK, kein Grundzustand." Gemessen sind **38,5 %**
aller Materialzellen Sonderboden, und in einem 64-px-Raster ist ein
Eis-/Gummifeld damit keine Ausnahme, sondern ein regelmäßig auftretender
Landschaftsteil. Die Datei erwähnt nirgends einen Messwert für die Verteilung,
obwohl das Projekt diese Belegform sonst überall führt (vgl.
`biomwahl.js:59-116`, das seine Schwellen über 2000 bzw. 3000 Züge herleitet).

**Empfehlung:** Die Schwellen mit demselben Vorgehen wie `biomwahl.js`
kalibrieren (Perzentile über N Seeds) **oder** die Aussage im Kommentar an die
Messung anpassen. Kein Rechenfehler — eine unbemessene Zusage.

---

## 3. `terrainGen2` vs `terrainGen3` — feste Typen gegen autonom (Frage 3)

### 3.1 Der Umschalter

`match.js:826-865`, entschieden durch `kartentyp`:

| `kartentyp` | Generator | Ergebnis |
|---|---|---|
| `'autonom'` | `erzeugeAutonomeKarte` (`terrainGen3.js:364`) | Charakter aus dem Seed, 2D-Maske, **Materialfeld** (`match.js:826-846`) |
| beliebiger anderer Wahrheitswert | `erzeugeKarte({ typ })` (`terrainGen2.js:166`) | eine von sechs Schablonen, 2D-Maske, **kein** Material (`match.js:847-855`) |
| `null`/`undefined` | `generateTerrain` (`terrainGen.js`) | 1D-Höhenfeld aus dem Preset, **kein** Material (`match.js:856-865`) |

### 3.2 Generation 1 — 1D (weiter der Rückfallweg)

`terrainGen.js:1-9`: je Spalte **genau eine** Oberfläche, alles darunter
massiv. Höhlen, Tunnel, Überhänge und schwebende Inseln sind damit nicht
darstellbar — „eine Eigenschaft des Verfahrens, nicht ein Mangel des Codes"
(`terrainGen2.js:6-10`). Acht Presets (`terrainGen.js:38-70`), Wasser wird als
**Luft** ausgestanzt (`terrainGen.js:244-250`), Ränder versiegelt
(`terrainGen.js:252-260`), `surfaceY` sucht die oberste solide Zeile
(`terrainGen.js:269-274`). `TERRAIN_AFFINITY` (`terrainGen.js:135`) ordnet jedem
Preset eine favorisierte Klasse zu — reine Anzeige-/Beratungsinformation.

### 3.3 Generation 2 — sechs feste Kartentypen

`KARTENTYPEN` (`terrainGen2.js:105-154`): `huegel`, `berge`, `inseln`,
`hoehlen`, `schwebe`, `kavernen` — je mit `grundlinie`, `amplitude`,
`hoehlenAnteil`, `gitterweite`. Unbekannter Typ → `huegel`
(`terrainGen2.js:174`). Drei Oktaven Landmasse + ein eigenes Höhlenfeld
(`terrainGen2.js:202-220`), Höhlen erst ab fester Tiefe unter der Oberfläche
(`terrainGen2.js:310-323`), Oberflächen-Array über `oberflaechen()`
(`terrainGen2.js:387-395`) — diese Funktion wird von Gen 3 **mitbenutzt**
(`terrainGen3.js:48`).

**Entwurfsentscheidung:** Der Typ ist eine **Schablone** und wird deshalb von
Gen 3 abgelöst — „Wenn ein Mensch den Typ wählt, wählt er eine Schablone. …
Nach zehn Partien kennt er sie alle, und die Karte ist kein Gegner mehr,
sondern eine Kulisse" (`terrainGen3.js:13-18`).

**Lebt Gen 2 noch?** Ja, aber nur über die API: Das Menü sendet fest
`kartentyp = 'autonom'` (`main.js:363-382`), und `lobby.js` nimmt jeden
`kartentyp` ungeprüft an (`lobby.js:232-240`). Über
`POST /api/lobby/create { kartentyp: 'huegel' }` ist der Gen-2-Weg erreichbar,
ebenso für Werkzeuge und Tests.

### 3.4 Generation 3 — autonom

Sieben Achsen in `CHARAKTER_ACHSEN` (`terrainGen3.js:61-158`): `landanteil`
[0,3–0,55], `hoehlung` [0–0,22], `steilheit` [0,28–0,58], `wasser` [0–0,3],
`zerklueftung` [0,8–1,8], `zusammenhaengung` [0,35–0,95], `inseligkeit`
[0–0,45]. `zieheCharakter` (`terrainGen3.js:194-223`) macht die Verteilung
**U-förmig** (`randGewicht = 0,45`), damit Extreme häufiger sind als die Mitte.

`erzeugeAutonomeKarte` (`terrainGen3.js:364-416`) zieht und prüft in einer
Schleife:

```
MAX_VERSUCHE = 8                                             terrainGen3.js:384
je Versuch: zieheCharakter → baueKarte → messe → pruefeSpielbarkeit  :388-392
nach 8 Fehlversuchen: Ergebnis MIT Warnung ausliefern        :399-415
```

**Entwurfsentscheidung:** Der Generator wird nicht beschnitten, sondern
**geprüft und neu gezogen** (`terrainGen3.js:372-383`). Die Regeln
(`pruefeSpielbarkeit`, `terrainGen3.js:1059-1111`) sind aus dem Motorbedarf
hergeleitet: Land ≥ 15 % und ≤ 90 %, Höhennutzung ≥ 12 %, mindestens 4
Erhebungen, Hohlraum ≤ 25 % (`:1092`).

**BEFUND G (mittel) — die Steilheits-Regel ist toter Code.**
`terrainGen3.js:1104-1109` rechnet `k.ueberhaenge / k.width` — aber `messe()`
liefert **kein** `width` (`terrainGen3.js:1030-1036`):

```
Kennzahlen-Schlüssel: landAnteil,hohlraum,hoehennutzung,erhebungen,ueberhaenge
width dabei? false      →   k.ueberhaenge / k.width = NaN   (NaN > 0,75 = false)
```

Die Regel „zu nadelig" kann also **nie** greifen. Betroffen ist genau der Fall,
den die Karte am dringendsten braucht: eine zerfaserte Karte mit vielen
Überhängen. Reproduktion: `RE-5`.

**Beobachtung (niedrig):** `pruefeSpielbarkeit` wird von Gen 3 exportiert und
von Tests genutzt; der Aufruf `messe(...)` übergibt `width` bereits
(`terrainGen3.js:390`) — es fehlt nur die Weitergabe im Rückgabeobjekt.

---

## 4. Spawn-Logik, Team-Zuweisung, CharacterSystem (Frage 4)

### 4.1 Wer spawnt — und wer **nicht**

`src/engine/systems/characterSystem.js` erzeugt **keine** Entity, wählt
**kein** Team und entscheidet **kein** Leben. Es bewegt bestehende Entities mit
`Position|Velocity|Health` (`characterSystem.js:57-148`) und ist rein
physikalisch: Gravitation (`:78`), Reibung (`:84,126`), Terrain-Kollision
(`:96-116`), Landeschaden (`:118-123`), Wasser (`:137-146`, Schwellen aus
`config/water.js:27,35`).

Alles Aufstellende liegt im `MatchController`:

```
#spawnPlayers()     match.js:1000-1095     (Team, Klasse, Loadout, Position)
#spawnRoundLoot()   match.js:1097-1108     (Rundenkisten)
```

`start()` ruft in dieser Reihenfolge: `#buildTerrain` → `#waehleSzeneAusCharakter`
→ `#buildWater` → `#registerSystems` → `#spawnPlayers` → `#pruefeErreichbarkeit`
→ Wind → Loot → `#beginTurn(0)` (`match.js:645-665`).

### 4.2 BEFUND H (mittel, Doku/Drift) — die Körpermaße stehen trotzdem zweimal

`src/shared/config/player.js` erklärt sich zur „EINEN Quelle" und begründet das
mit drei früheren Kopien (`player.js:4-16`). In `characterSystem.js:27-28`
stehen sie weiterhin lokal:

```js
const HALF_WIDTH = 7;     // characterSystem.js:27
const HALF_HEIGHT = 10;   // characterSystem.js:28
```

gelesen bei der Kartenbegrenzung (`characterSystem.js:129-130`) und in
`#surfaceY` (`:180-184`). Beide Werte sind heute gleich — es ist also keine
akute Fehlfunktion, aber genau die stille Drift, die die Datei beseitigen
wollte: Wer `PLAYER_HALF_WIDTH` ändert, bekommt Figuren, die an der einen
Stelle weiter können als an der anderen.

### 4.3 Team-Zuweisung

```js
const spacing = this.width / (total + 1);        // match.js:1002
const teamId = index % this.teams;               // match.js:1009
```

**Entwurfsentscheidung:** Round-Robin über den Platzindex. Damit stehen die
Teams abwechselnd entlang der x-Achse (gemessen, 2 Teams × 3 Figuren, Seed 11):

```
P1/Team0@366  P2/Team1@731  P3/Team0@1097  P4/Team1@1463  P5/Team0@1829  P6/Team1@2194
```

Weiter je Figur: `Team`-Komponente (`match.js:1060`), Startwinkel 45° für
Team 0 und 135° für alle anderen (`match.js:1061`), Eintrag in `#turnOrder`
(`match.js:1093`) — die Zugfolge ist damit die Spawnreihenfolge, nicht pro Team
gebündelt.

**Teamfarben:** acht Stück (`match.js:183-192`), Zuordnung `TEAM_COLORS[teamId]`.
Die Lobby prüft `teams` gegen **dieselbe** Quelle: 2 bis
`TEAM_COLORS.length` = 8 (`lobby.js:98-99`).

**Kleiner Doku-Fund (niedrig):** `match.js:180-181` sagt „Die Lobby prüft die
Grenze (`teams` 2 bis 4); sie wird mit den Matcharten angehoben" — die Lobby
prüft bereits 2 bis 8 (`lobby.js:29,98`). Der Kommentar ist überholt.

**Sieg:** `#checkVictory` zählt lebende Teams über `entry.alive`, nicht über
`world.isActive` (`match.js:2807-2832`); bei Rundengrenze entscheidet
`#finishByAttrition` über die Gesamtgesundheit je Team (`match.js:2726-2745`).

### 4.4 BEFUND A (hoch) — die trockene Startposition wird berechnet und dann verworfen

`#drySpawnX(idealX)` (`match.js:960-998`) sucht abwechselnd rechts und links in
8-px-Schritten einen Platz, der an **Fuß und Kopf** trocken ist (Wasserabfrage
an `boden` und an `boden - PLAYER_HALF_HEIGHT - 2`, `match.js:961-977`) und gibt
ihn zurück. Der Aufrufer:

```js
const x = Math.round(spacing * (index + 1));                     // match.js:1026  IDEAL
const startX = this.#drySpawnX(x);                               // match.js:1038  TROCKEN
const groundY = this.surfaceYAt(startX);                         // match.js:1039  aus startX
const y = (groundY > 0 ? groundY : this.height * 0.4) - PLAYER_HALF_HEIGHT - 2;  // :1040
...
this.#world.addComponent(entityId, 'Position', { x, y });        // match.js:1056  x, NICHT startX
```

Die Höhe kommt vom **trockenen** Platz, die x-Koordinate vom **Idealen**. Die
Korrektur wirkt damit nur auf `y` — und `y` ist genau die Koordinate, die bei
einer Verschiebung falsch wird.

Gemessen über 200 Seeds × 4 Figuren (= 800 Figuren, `RE-2`):

```
Figuren 800 | Idealplatz nicht trocken 83 | davon trotzdem dort 83 | in der Luft 76 | größte Luftstrecke 306 px
```

* **83 von 800** Figuren (10,4 %) haben einen Idealplatz, den `#drySpawnX`
  verwerfen würde — und stehen trotzdem dort.
* **76** davon stehen **frei in der Luft** (erster fester Pixel mehr als 14 px
  unter den Füßen), die größte Strecke **306 px**.
* Beispiele: `Seed 4 Figur P1: x=512 y=906, erster fester Pixel bei 1163 →
  257 px Luft`; `Seed 12 Figur P4: x=2048 y=976 → 173 px`.

Falsch ist die y-Höhe (vom trockenen Platz), falsch ist die x-Lage (der nasse
Platz). Folge: Die Figur fällt beim ersten Schritt bis zu 306 px und nimmt
dabei Fallschaden (`characterSystem.js:118-123`, Schwelle 11 px/s) — ein
Startschaden vor dem ersten Zug, ohne dass jemand geschossen hat. Das ist
dieselbe Fehlerklasse, die `characterSystem.js:163-173` für die Landung schon
einmal belegt hat.

**Fix (eine Zeile):** `{ x: startX, y }` in `match.js:1056` — oder `x` durch
`startX` ersetzen und `startX` als Namen führen. Beides muss dieselbe Zahl sein,
sonst ist die Trockenprüfung eine Zusage ohne Wirkung (die Klasse der Befunde,
die `player.js:4-16` und `match.js:397-403` bereits aufgeräumt haben).

Ein Test fehlt: Es gibt **keinen** Test auf Startpositionen
(`tests/` kennt kein `spawn*.test.js`); die vorhandenen Prüfungen
(`erreichbarkeit.test.js`, `gelaendeguete.test.js`) messen die Karte, nicht die
Startplätze.

---

## 5. ECS-Kern (Fundament für Teams, Leben, Zerstörung)

`src/engine/ecs/` — drei Dateien, wenig Code, klare Rollen.

* **Signaturen** als 16-Bit-Flags (`componentStore.js:11-28`), Registrierung in
  `init.js:24-91`. Werte in typisierten Arrays, `Float32Array` für Position,
  `Health` ausdrücklich `Float32` („Int32 würde stillschweigend abschneiden",
  `init.js:27-29`).
* **Systeme** werden nach Priorität sortiert registriert: „höher = früher"
  (`world.js:46-66`). Die Tabelle steht in `init.js:13-23`:
  `TURN 100, PROJECTILE 95, PHYSICS 90, CHARACTER 85, DAMAGE 80, MAELSTROM 75,
  LOOT 70, WEAPON 65, TERRAIN 60, EFFECTS 50`.
* **PhysicsSystem** hat die Signatur `POSITION|VELOCITY` (`physicsSystem.js:91`)
  und würde damit auch Figuren matchen — es schließt sie per
  `hasComponent('Health')`, `'Projectile'` und `'Crate'` ausdrücklich aus
  (`physicsSystem.js:29-52`). Das ist die richtige Stelle: Die Ausnahme steht
  als Aussage über die **Komponenten**, nicht als zweite Signaturliste.
* **Entitäts-IDs werden wiederverwendet:** `removeEntity` legt die ID in den
  Pool (`entityManager.js:41-47`), `createEntity` nimmt sie als Erste wieder
  (`entityManager.js:24-35`, LIFO). Werte werden dabei sauber genullt
  (`componentStore.js:237-250`) — das Problem ist nicht der Speicher, sondern
  die **Bedeutung**: Eine gefallene Figur und eine später auf ihrem Platz
  liegende Kiste teilen sich dieselbe Zahl. Deshalb führt `MatchController` den
  Lebensstatus am **Spieler** (`match.js:929-935,1084-1091`) und hat einen
  eigenen Getter `isPlayerAlive` mit derselben Begründung
  (`match.js:2930-2940`). Drei Stellen nennen denselben Vorfall
  (`match.js:918-931`, `2811-2819`, `2930-2937`) — die Begründung ist konsistent
  wiederholt, nicht widersprüchlich.

**BEFUND I (niedrig) — drei Prioritäten ohne System.** `SYSTEM_PRIORITIES`
nennt `TERRAIN 60`, `WEAPON 65`, `EFFECTS 50` (`init.js:13-23`), aber
registriert werden nur vier Systeme in `match.js:936-939` (plus `turn`,
`physics`, `damage` in `init.js:112-114`). Die drei Einträge suggerieren
Steckplätze, die es nicht gibt. Nach der im Projekt geltenden Regel
(„eine Regel, eine Stelle", `characterSystem.js:19-25`) wären sie zu entfernen,
solange kein System sie liest.

---

## 6. Persistenz — warum **eine** Datei, und welche Felder (Frage 5)

### 6.1 Der Entwurf

`persistence.js:1-13` nennt die Entscheidung im Kopf:

> „Gespeichert wird nicht der ECS-Zustand, sondern der Replay-Kern: Seed,
> Konfiguration, Sitzplätze und die geordnete Eingabeliste. Da die Simulation
> deterministisch ist, wird ein Match beim Wiederherstellen exakt rekonstruiert
> — bei einem Bruchteil der Datenmenge eines Zustandsdumps. Ablage: eine
> einzelne JSON-Datei, atomar geschrieben (temp + rename)."

Ausführung:

```
Datei     = resolve(process.cwd(), path), Vorgabe '.pa-state/lobbies.json'   persistence.js:30-33
Version   = 1 (PERSISTENCE_VERSION)                                        persistence.js:18
Schreiben = JSON.stringify → temp.<uuid>.tmp → renameSync                  persistence.js:44-52
Fehler    = werden protokolliert (lastError), nicht geworfen               persistence.js:54-57
Lesen     = unbekannte Version → null; beschädigte Datei → null, kein Absturz persistence.js:61-77
```

`save` ist damit **atomar** (ein Absturz mitten im Schreiben lässt keine halbe
Datei zurück) und **tolerant** (eine kaputte Datei wird ignoriert, nicht
behandelt). Beides ist belegt getestet (`tests/persistence.test.js:15,37,58`).

### 6.2 Die Felder

`serializeLobby` (`persistence.js:97-126`):

| Feld | Quelle | Zweck |
|---|---|---|
| `id` | `lobby.id` | alte Join-Links bleiben gültig (`persistence.js:154-161`) |
| `teams`, `playersPerTeam`, `capacity` | Lobby | Matchkonfiguration |
| `preset`, `orientation`, `seed` | Lobby | **Karte** (Maße + Generator) |
| `status`, `createdAt` | Lobby | Status ist **nicht** aus der Datei ableitbar, `create()` legt immer „offen" an (`persistence.js:181-185`) |
| `seats[]` → `seatIndex, name, token, entityId, connected: false` | Sitze | Reconnect (alle gelten als getrennt) |
| `replay` | `recorder.toJSON()` | **der Replay-Kern**: Seed + Konfiguration + Eingaben |
| `tick` | `world.tickCount` | Fortschritt |

Dazu der Kopf `version` und `savedAt` (`persistence.js:44-48`).

**Entwurfsentscheidung — `finalize` vor dem Auslesen** (`persistence.js:98-103`):
Ohne den Aufruf bleibt `totalTicks` bei 0, und ein gespieltes Match wäre von
einer leeren Lobby nicht zu unterscheiden — es käme dann ohne Sitzung zurück.
`finalize` arbeitet mit `Math.max` und ist mehrfach aufrufbar.

**Entwurfsentscheidung — entschiedene Lobbys werden nicht gespeichert**
(`gameServer.js:700-720`): In der Entwicklungsdatei standen **258 Lobbys, alle
mit Status „finished"**, und jeder Serverstart baute 258 fertige Matches neu
auf. Ein entschiedenes Match hat nichts fortzusetzen.

### 6.3 Der Weg über den Replay-Kern

```
Schreiben: LobbySession.tick → snapshotState() → PersistenceStore.save()   gameServer.js:718,724-727
Lesen:     PersistenceStore.load() → restoreLobby() → createSession({replayEntries}) gameServer.js:738-780
```

`restoreLobby` (`persistence.js:144-198`) baut die Lobby **neu** (mit
`lobbyManager.create`), ersetzt dann die generierte ID durch die gespeicherte
(`:154-161`) und erzeugt nur dann eine Sitzung, wenn ein Replay-Kern vorliegt
(`:167-176`). Die Sitze werden mit ihren alten Token wiederhergestellt, gelten
aber als getrennt (`:186-195`).

**Wichtig für Terrain/Zerstörung:** Die Karte wird beim Wiederherstellen **nicht**
gespeichert, sondern aus `seed` + `kartentyp` + `preset` + `orientation`
**neu gebaut** (`gameServer.js:85-93`) und die Eingaben erneut angewandt
(`gameServer.js:125-127`). Krater entstehen dabei als Nebenprodukt derselben
deterministischen Simulation (siehe 7.6).

### 6.4 BEFUND D (mittel) — Sitzungs-Token im Klartext, Datei weltlesbar

* `serializeLobby` schreibt `token` unverändert in die Datei
  (`persistence.js:118`), und `restoreLobby` setzt diese Token als gültige
  Sitze wieder ein (`persistence.js:186-195`). Ein Token ist damit ein
  **Sitzanspruch ohne weitere Prüfung** (Beitritt per Token,
  `gameServer.js:333-367`).
* Es gibt keinen expliziten Dateimodus — gemessen (siehe `RE-6`):
  `Modus: 664 | umask: 2`; bei üblichem `umask 022` also `644`. Jeder Nutzer
  desselben Systems kann die Token lesen.
* Unter systemd liegt die Datei nach der Auslieferungsempfehlung in
  `/var/lib/projectarmageddon/lobbies.json` (`deploy/betrieb.env.example:29-33`),
  dort entscheiden die Verzeichnisrechte der `StateDirectory`. Ein
  `chmod`/`umask` steht weder in `scripts/betrieb/server-start.sh` noch in
  `deploy/` (geprüft: kein Treffer für `chmod`/`umask`).

**Empfehlung:** Token nicht persistieren (dann müssen Clients sich beim Neustart
neu anmelden) oder die Datei auf `0600` setzen und den Token nur als Hash
ablegen. Der Vorgabewert `.pa-state/lobbies.json` im Projektordner vergrößert
das Problem, weil er im Klon-Verzeichnis liegt.

### 6.5 Weitere Beobachtungen (niedrig)

* **Pfad hängt am Arbeitsverzeichnis:** `resolve(process.cwd(), path)`
  (`persistence.js:31`). Wer den Server aus einem anderen Ordner startet, liest
  eine andere (leere) Datei. Die Auslieferung geht deshalb über
  `PA_STATE_PATH` (`scripts/server.mjs:47`), aber der Konstruktor-Default bleibt
  cwd-relativ.
* **Keine Sicherung/Rotation:** Es gibt genau eine Datei, keinen `.bak`, keine
  Historie. Ein Schreibfehler ist durch `temp + rename` abgedeckt; ein
  versehentliches `clear()` (`persistence.js:79-87`) oder Löschen ist es nicht.
* **Keine Größenbegrenzung je Match:** Der Replay-Kern wächst mit der Zahl der
  Eingaben. Entschiedene Lobbys fallen beim nächsten Speichern heraus
  (`gameServer.js:717`) — laufende nicht.
* **Wiederherstellung ist O(Eingaben):** Jeder Start spielt alle gespeicherten
  Matches bis zum letzten Tick nach (`gameServer.js:125-127`), inklusive
  Geländegenerierung. Das ist bewusst (Determinismus als Kompression) und wurde
  gemessen, als die 258 Leichen noch drin waren (`gameServer.js:704-711`).

---

## 7. Terrain-Zerstörung und Determinismus (Frage 6)

### 7.1 Wo zerstört wird

Genau eine Stelle im Motor: `ProjectileSystem.#explode`
(`projectileSystem.js:376-403`).

```js
const craterRadius = terrainDamage > 0 ? terrainDamage
  : blastRadius > 0 ? blastRadius * 0.6 : 4;                 // projectileSystem.js:395-397
if (terrain && craterRadius > 0) {
  const radius = Math.max(2, Math.round(craterRadius));      // :400
  terrain.punchCrater(x, y, radius);                         // :401
  if (events) events.emit('terrain_destroyed', { x, y, radius });  // :402
}
```

### 7.2 Ist der Krater deterministisch? — Ja

`CollisionMask.punchCrater` (`collisionMask.js:103-118`) ist eine **reine
Funktion** aus `(x, y, radius)`:

* kein Zufall, keine Uhr, kein `Math.random`,
* die Entscheidung je Pixel ist ganzzahlig: `distSq = ix*ix + dy*dy` mit
  ganzzahligen `ix`, `dy` gegen `radius*radius` (`collisionMask.js:110-111`),
* die Lage wird mit `Math.round(x + ix)` gerundet (`:107-108`) — ein
  Fließkomma-Unterschied im Einschlagpunkt ändert den Krater also nur, wenn er
  eine 0,5-Grenze überschreitet. Das ist die stabilste denkbare Form und
  bemerkenswert robust gegen minimale Rechenunterschiede zwischen Umgebungen.

**Belegbar (stärkstes Argument):** Die Zerstörung ist **nicht im Replay-Kern
enthalten** und trotzdem reproduzierbar — sie entsteht beim erneuten Anwenden
der Eingaben von selbst (`gameServer.js:125-127`, `persistence.js:1-13`). Wäre
sie nicht deterministisch, müsste jeder wiederhergestellte Server ein anderes
Gelände zeigen.

### 7.3 Zerstört wird nur über Projektile — Hitscan gräbt nicht

Der Hitscan-Weg (`match.js:1653-1720`) prüft das Terrain (`match.js:1697`),
stanzt aber **keinen** Krater und meldet kein `terrain_destroyed`. In `src/`
existiert genau ein `punchCrater`-Aufruf (`projectileSystem.js:401`, geprüft per
Suche).

**BEFUND J (mittel) — drei Waffen mit `terrainDamage`, die nichts tun.**

```
Waffen 150 | hitscan 54 | hitscan mit terrainDamage>0:
  pa_113/Bohrkanone=85, pa_126/Bunker=20, pa_136/Bohrkopfrakete=65     (RE-7)
```

„Bohrkanone" und „Bohrkopfrakete" sind der Inbegriff einer Waffe, deren Zweck
das Graben ist. Auf dem Hitscan-Pfad ist `terrainDamage` eine **Zusage ohne
Wirkung** — dieselbe Kategorie wie `piercing`, `homing` und `damageType`, die
`init.js:60-72,88-95` ausdrücklich als behobene Fälle führt.

### 7.4 BEFUND B (hoch) — `surfaceYAt` liest das unzerstörte Bitmap

Der Krater geht in die `CollisionMask` (`#terrain`), **nie** zurück ins Bitmap
(`match.js:867-868`):

```js
this.#bitmap = bitmap;                                            // match.js:867
this.#terrain = CollisionMask.fromBitmap(bitmap, this.width, this.height);  // match.js:868
```

`surfaceYAt` liest aber genau dieses statische Bitmap:

```js
surfaceYAt(x) { return findSurfaceY(this.#bitmap, this.width, this.height, x); }  // match.js:2836-2839
```

Gemessen an einer Karte mit einem einzigen Krater (Radius 30, `RE-3`):

```
x=1280 surfaceYAt vorher 544 | surfaceYAt nachher (Bitmap) 544 | echte Oberfläche (Maske) 579
```

Nach einem Einschlag bleiben **beide** Antworten stehen: die alte Oberfläche.
Betroffene Lesestellen (alle nach möglichen Kratern):

| Stelle | Wirkung |
|---|---|
| `match.js:1103` → `lootSystem.js:119-120` | Rundenkisten werden auf die **alte** Oberfläche gesetzt und schweben über dem Krater (sie fliegen nicht: `inFlight = 0`, `lootSystem.js:141-143`) |
| `match.js:1816` | Geschütz-Aufstellung |
| `match.js:2040` | Geschütz-Bahnberechnung |
| `match.js:2286` | Landung abgeworfener Kisten |
| `match.js:2530,2554` | Ziehen/Schub verankert auf der alten Oberfläche |
| `shooting.js:723` | Mündungssuche |
| `guentherSystem.js:255` | Günther läuft auf der alten Oberfläche |

**Der Widerspruch im selben Objekt:** `isGrounded` fragt die **lebende** Maske
(`match.js:1174-1175`, `#terrain.isSolid`), `surfaceYAt` fragt das **tote**
Bitmap. Zwei Quellen für „wo ist der Boden" — genau die Doppelregel, die das
Projekt an anderen Stellen aufgeräumt hat (`player.js:4-16`,
`match.js:397-403`, `match.js:488-500`).

**Fix-Optionen:** (a) `punchCrater` spiegelt in beide Strukturen,
(b) `surfaceYAt` fragt die Maske (`isSolid`-Scan je Spalte, langsamer, aber
eine Quelle), (c) das Bitmap entfällt als Motorzustand und bleibt nur
Anzeige-Artefakt. (b) ist die kleinste Änderung mit der klarsten Aussage.

### 7.5 BEFUND C (hoch) — online ist der Krater beim Client nur ein Bild

Der Client baut sein Terrain aus Seed + Preset neu
(`main.js:1009-1020` → `terrainPreview.js:22-38`) und wendet Server-Ereignisse
so an:

```js
terrain_destroyed: { online: (k, n) => k.renderer.applyCrater(n.x, n.y, n.radius || 12) }  // ereignisse.js:90-94
```

`renderer.applyCrater` (`renderer.js:498-509`) stanzst per
`globalCompositeOperation = 'destination-out'` **nur die sichtbare
Leinwand-Ebene**. Die Kollisionsmaske des Clients (`remoteTerrain.mask`,
`terrainPreview.js:33`) und dessen Bitmap werden **nie** verändert. Die
Vorhersage fragt aber genau dieses Bitmap:

```js
const isSolid = terrain?.bitmap ? (x, y) => Boolean(terrain.bitmap[y*terrain.width+x]) : null;  // main.js:1517-1526
```

`ereignisse.js:154-156` benennt den Effekt bereits als Erklärungsmuster
(„Weicht er vom vorhergesagten ab, war das Terrain inzwischen anders (der Client
hat denselben Krater noch nicht verarbeitet)") — es ist aber kein
Zwischenzustand: Der Client holt den Krater **nie** nach. Über ein Match wächst
die Abweichung monoton.

`src/engine/terrain/terrainSync.js` wäre der dafür gebaute Baustein
(`TerrainSync.punchCrater`, `terrainSync.js:43-54`, „Synchronisiert das
Canvas-Rendering mit der CollisionMask"), wird aber **nirgends instanziiert**:
Er wird nur exportiert (`engine/index.js:23`, `client/index.js:15`), `new
TerrainSync` findet sich allein in der eigenen Fabrik (`terrainSync.js:60-63`).
Der Client benutzt stattdessen `renderer.applyCrater`. Ein vorhandener Baustein
für genau dieses Problem liegt also brach — derselbe Musterfall wie die
entfernten Prioritäts-Konstanten (`characterSystem.js:19-25`).

**Zusatzbeobachtung (niedrig):** `collisionMask.js:1-5` behauptet,
„Unterstützt Bitmaps bis zu 32×N-Pixeln" — tatsächlich rechnet jede Methode mit
`wordsPerRow = ceil(width/32)` (`collisionMask.js:24,42,66,90`) und trägt
beliebige Breiten. Die Karte ist 2560 px breit und funktioniert. Die Aussage ist
zu eng, nicht falsch — aber sie könnte jemanden von einer Prüfung abhalten.

### 7.6 BEFUND K (mittel) — der Determinismus-Hash kennt kein Terrain

```js
stateHash() { return hashState(this.getState()); }   // match.js:3124-3126
```

`getState()` wird aus `#zustandsQuelle()` gebaut (`match.js:3021-3061`), und
dort steht **kein** Terrain: kein Bitmap, keine Materialfeld-Kennung, keine
Kraterliste. Der Hash ist damit blind für genau den Zustand, den Frage 6
betrifft.

Bedeutung im Rahmen der Belege: Der Hash ist „das Beweismittel für
Determinismus" und muss nach eigener Aussage **vollständig** sein — „Lässt er
Zustand aus, belegt er weniger, als er behauptet — eine Divergenz bliebe
unbemerkt" (`match.js:3086-3091`). Zwei Läufe mit identischem Seed, in denen
eine Explosion an einer Stelle einen Krater setzt oder nicht, melden denselben
Hash. Der Kommentar in `match.js:3107-3111` listet auf, was aufgenommen wurde —
Terrain fehlt in der Liste, ohne dass ein Grund genannt wird.

**Empfehlung:** `terrainHash` (z. B. Summe/Praegung über die Kraterliste in
Aufprallreihenfolge) in den Zustand aufnehmen. Der Krater ist klein
(`{x, y, radius}`, gerundet), die Liste je Match ist begrenzt, und damit wäre
auch BEFUND C nachweisbar statt nur sichtbar.

### 7.7 BEFUND L (niedrig) — `pruefeErreichbarkeit` läuft nicht mehr für den Standardweg

`#pruefeErreichbarkeit` kehrt sofort zurück, wenn `kartentyp !== 'autonom'`
(`match.js:702`) — für den Standardweg läuft sie also. **Aber** sie nutzt
`this.#bitmap` (`match.js:739`) und läuft **vor** dem ersten Schuss
(`match.js:658`), weshalb die Stale-Bitmap dort harmlos ist. Die Feststellung
ist eine Abgrenzung, kein Befund: Für 7.4 ist dieser Aufruf **nicht** betroffen.

---

## 8. Befundliste nach Schweregrad

| # | Schweregrad | Aussage | Beleg |
|---|---|---|---|
| A | **hoch** | Startposition: y vom trockenen Platz, x vom idealen → 83/800 Figuren (10,4 %), 76 schwebend bis 306 px. Fix: `{ x: startX, y }` | `match.js:1038,1056`; Messung `RE-2` |
| B | **hoch** | `surfaceYAt` liest das unzerstörte Bitmap; 7 Lesestellen nach Kratern falsch; `isGrounded` liest die Maske → zwei Bodenquellen | `match.js:867-868,2836-2839,1174`; Messung `RE-3` |
| C | **hoch** | Online wird `terrain_destroyed` nur auf die Anzeige-Ebene angewandt; Kollisionsmaske/Bitmap des Clients bleiben unzerstört; der dafür gebaute `TerrainSync` liegt brach | `ereignisse.js:90-94`, `renderer.js:498-509`, `main.js:1517-1526`, `terrainSync.js:60-63` |
| D | mittel | Persistenz: Sitzungs-Token im Klartext, Datei ohne expliziten Modus (gemessen 664 bei umask 002) | `persistence.js:118`, Messung `RE-6` |
| E | mittel | `stateHash` enthält kein Terrain → Terraindivergenz für den Determinismusbeleg unsichtbar | `match.js:3021-3061,3124-3126` |
| F | mittel | `pruefeSpielbarkeit`-Regel „zu nadelig" ist toter Code (`k.width` fehlt → NaN) | `terrainGen3.js:1030-1036,1104-1109`; Messung `RE-5` |
| G | mittel | Drei Hitscan-Waffen tragen `terrainDamage`, der Pfad gräbt nicht | `match.js:1653-1720`; Messung `RE-7` |
| H | mittel | Körpermaße stehen in `characterSystem.js:27-28` ein zweites Mal gegen `config/player.js` | `characterSystem.js:27-28` |
| I | niedrig | Materialverteilung 38,5 % Sonderboden widerspricht dem Kommentar „FUNDSTÜCK, kein Grundzustand"; keine Messung dokumentiert | `terrainGen3.js:288-293`; Messung `RE-4` |
| J | niedrig | `SYSTEM_PRIORITIES.TERRAIN/WEAPON/EFFECTS` ohne registriertes System | `init.js:13-23` vs. `match.js:936-939` |
| K | niedrig | `collisionMask.js`-Kopf sagt „bis 32×N", trägt aber beliebige Breiten | `collisionMask.js:1-5,24` |
| L | niedrig | `match.js:180-181` nennt „teams 2 bis 4"; die Lobby prüft 2 bis 8 | `match.js:180-181` vs. `lobby.js:98-99` |

---

## 9. Reproduktion

Alle Befehle im Repo-Wurzelverzeichnis, Node ≥ 22.

> **Temporäre Sonden:** Die Messungen RE-1 … RE-5 liegen zusätzlich als
> `probe-hunter5*.mjs` im Wurzelverzeichnis (5 Dateien, nicht in `package.json`
> eingebunden, `npm run lint` und die Tests laufen sauber mit ihnen). Nach
> Gebrauch: `rm probe-hunter5*.mjs`. Die Befehle unten sind in sich
> abgeschlossen und brauchen die Sonden nicht.

**RE-1 — Client-Rekonstruktion gegen Server-Karte (online).** Zeigt, dass die
Abweichung **nicht** am Client-Code liegt, sondern am fehlenden `kartentyp`:

```bash
node -e "
const run = async () => {
  const { MatchController } = await import('./src/engine/match.js');
  const { buildTerrainForSeed } = await import('./src/client/terrainPreview.js');
  for (const kt of [null, 'huegel', 'autonom']) {
    const m = new MatchController({ seed: 4242, kartentyp: kt, teams: 2, playersPerTeam: 2 }).start();
    const c = buildTerrainForSeed(4242, 'hills', 'landscape');
    let d = 0; for (let i = 0; i < c.bitmap.length; i++) if (c.bitmap[i] !== m.bitmap[i]) d++;
    console.log('kartentyp', String(kt).padEnd(8), '-> abweichende Pixel:', d, '(' + (100*d/c.bitmap.length).toFixed(1) + '%)');
  }
}; run();"
```

Ergebnis: `null → 0 (0,0 %)`, `huegel → 1 073 396 (29,1 %)`,
`autonom → 969 322 (26,3 %)`. Der Client rekonstruiert **exakt**, solange der
Server dasselbe Verfahren benutzt. Das Menü sendet `autonom` (`main.js:382`),
der Server baut `autonom` (`gameServer.js:92`) — der Client aber immer 1D
(`terrainPreview.js:25`, `main.js:933`).

**RE-2 — Startpositionen (BEFUND A):**

```bash
node -e "
const run = async () => {
  const { MatchController } = await import('./src/engine/match.js');
  const { WET_LEVEL } = await import('./src/shared/config/water.js');
  const { PLAYER_HALF_WIDTH: HW, PLAYER_HALF_HEIGHT: HH } = await import('./src/shared/config/player.js');
  let idealNichtTrocken = 0, trotzdemDort = 0, inDerLuft = 0, n = 0, maxLuft = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const m = new MatchController({ seed, kartentyp: 'autonom', teams: 2, playersPerTeam: 2 }).start();
    const total = m.players.length, spacing = m.width / (total + 1);
    m.players.forEach((p, i) => {
      n++;
      const x = m.world.getComponent(p.entityId, 'Position', 'x');
      const y = m.world.getComponent(p.entityId, 'Position', 'y');
      const idealX = Math.round(spacing * (i + 1));
      const boden = m.surfaceYAt(idealX);
      const trocken = idealX >= HW + 2 && idealX <= m.width - HW - 2 && boden > 0
        && m.waterLevelAt(idealX, boden) < WET_LEVEL && m.waterLevelAt(idealX, boden - HH - 2) < WET_LEVEL;
      if (!trocken) { idealNichtTrocken++; if (x === idealX) trotzdemDort++; }
      let erster = -1;
      for (let yy = Math.floor(y); yy < m.height; yy++) if (m.world.services.terrain.isSolid(Math.floor(x), yy)) { erster = yy; break; }
      const luft = erster - Math.floor(y);
      if (luft > maxLuft) maxLuft = luft;
      if (luft > 14) inDerLuft++;
    });
  }
  console.log('Figuren', n, '| Idealplatz nicht trocken', idealNichtTrocken, '| davon trotzdem dort', trotzdemDort, '| in der Luft', inDerLuft, '| groesste Luftstrecke', maxLuft);
}; run();"
```

Ergebnis: `Figuren 800 | Idealplatz nicht trocken 83 | davon trotzdem dort 83
| in der Luft 76 | groesste Luftstrecke 306`.

**RE-3 — Krater und die zwei Bodenquellen (BEFUND B):**

```bash
node -e "
const run = async () => {
  const { MatchController } = await import('./src/engine/match.js');
  const m = new MatchController({ seed: 4242, kartentyp: 'autonom', teams: 2, playersPerTeam: 2 }).start();
  const x = Math.round(m.width * 0.5);
  const vorher = m.surfaceYAt(x);
  m.world.services.terrain.punchCrater(x, vorher + 4, 30);
  let maske = -1; for (let y = 0; y < m.height; y++) if (m.world.services.terrain.isSolid(x, y)) { maske = y; break; }
  console.log('x=' + x, 'surfaceYAt vorher', vorher, '| surfaceYAt nachher (Bitmap)', m.surfaceYAt(x), '| echte Oberflaeche (Maske)', maske);
}; run();"
```

Ergebnis: `x=1280 surfaceYAt vorher 544 | surfaceYAt nachher (Bitmap) 544 |
echte Oberflaeche (Maske) 579`.

**RE-4 — Materialverteilung (BEFUND I):**

```bash
node -e "
const run = async () => {
  const { erzeugeAutonomeKarte, zaehleMaterialien } = await import('./src/shared/terrainGen3.js');
  const { MatchSeedManager } = await import('./src/shared/seed.js');
  const z = {};
  for (let s = 1; s <= 60; s++) {
    const k = erzeugeAutonomeKarte({ rng: new MatchSeedManager(s).getSubRng('TERRAIN'), width: 1280, height: 720 });
    for (const [key, n] of zaehleMaterialien(k.material)) z[key] = (z[key] ?? 0) + n;
  }
  const g = z.normal + z.ice + z.rubber;
  console.log('Materialzellen ueber 60 Seeds:', Object.entries(z).map(([k,v]) => k + '=' + (100*v/g).toFixed(1) + '%').join(' '));
}; run();"
```

Ergebnis: `normal=61.5% ice=22.1% rubber=16.4%`.

**RE-5 — tote Überhang-Regel (BEFUND F):**

```bash
node -e "
const run = async () => {
  const { MatchController } = await import('./src/engine/match.js');
  const m = new MatchController({ seed: 4242, kartentyp: 'autonom', teams: 2, playersPerTeam: 2 }).start();
  const k = m.kartenkennzahlen;
  console.log('Schluessel:', Object.keys(k).join(','), '| width dabei?', 'width' in k, '| k.ueberhaenge/k.width =', k.ueberhaenge / k.width);
}; run();"
```

Ergebnis: `… width dabei? false | k.ueberhaenge/k.width = NaN`.

**RE-6 — Persistenz-Dateimodus (BEFUND D):**

```bash
node -e "
import('./src/server/persistence.js').then(async ({ PersistenceStore }) => {
  const s = new PersistenceStore({ path: '/tmp/hunter5-state.json' });
  s.save({ lobbies: [{ id: 'x', seats: [{ token: 'geheim' }] }] });
  const fs = await import('node:fs');
  console.log('Modus:', (fs.statSync('/tmp/hunter5-state.json').mode & 0o777).toString(8), '| umask:', process.umask().toString(8));
  console.log('Inhalt:', fs.readFileSync('/tmp/hunter5-state.json', 'utf8'));
});"
```

Ergebnis: `Modus: 664 | umask: 2` und der Token im Klartext.

**RE-7 — Hitscan-Waffen mit Terrainschaden (BEFUND G):**

```bash
node -e "
const run = async () => {
  const { WEAPONS } = await import('./src/shared/config/weapons.js');
  const l = Array.isArray(WEAPONS) ? WEAPONS : Object.values(WEAPONS);
  const hs = l.filter(w => (w.delivery ?? 'projectile') === 'hitscan');
  console.log(l.length, 'Waffen,', hs.length, 'hitscan; mit terrainDamage>0:',
    hs.filter(w => (w.terrainDamage ?? 0) > 0).map(w => w.id + '/' + (w.displayName || w.name) + '=' + w.terrainDamage).join(', '));
}; run();"
```

Ergebnis: `150 Waffen, 54 hitscan; mit terrainDamage>0: pa_113/Bohrkanone=85,
pa_126/Bunker=20, pa_136/Bohrkopfrakete=65`.

---

## 10. Abgrenzung — was hier NICHT geprüft wurde

* **Kollisionsauflösung der Figuren im Detail** (Ecken, Tunnelung,
  Hochgeschwindigkeit): nur insoweit gelesen, wie Material und Spawn es
  brauchen (`characterSystem.js:96-130`). Gehört zu Hunter #3.
* **Ballistik, Schaden, Waffendaten**: nicht Teil dieses Auftrags; `GRAVITY`
  und `PROJECTILE_GRAVITY` sind in `docs/hunter-physics.md` behandelt.
* **Netzwerkprotokoll/Binary-Snapshot**: nur der Terrain-Anteil (Seed,
  `kartentyp`, Ereignisse) wurde geprüft. Ob der Snapshot Terrain trägt, ist
  mit „nein" belegt (`src/shared/protocol.js` und `networkClient.js` kennen kein
  Terrain-Feld), die Snapshot-Größe selbst wurde nicht gemessen.
* **Browserdarstellung** (Bodenfarben je Biom, GPU-Pfad): `biomwahl.js` wurde
  gelesen, die Kette in `renderer.js`/`terrainBaker.js` nicht.
* **Seed `0xFFFFFFFF`**: Die Offsettabelle ist kollisionsfrei gerechnet, aber
  nicht für den 32-Bit-Überlauf **gemessen** (nur nachgerechnet).

---

## 11. Kernaussagen in einem Absatz

Das Terrain ist ein sauber geschnittenes System mit **einer** Maske als
Wahrheit für Kollision, **einem** Bitmap als Wahrheit für Höhenabfragen und
**einem** Materialfeld aus einem eigenen Seed-Zweig — aber die beiden
Terrainquellen laufen nach dem ersten Krater auseinander (BEFUND B),
der Client im Onlinebetrieb erhält die Zerstörung nur als Bild (BEFUND C), und
der Determinismus-Hash sieht kein Terrain (BEFUND E). Der autonome Generator
ist die stärkste Idee im Bereich (Charakter aus dem Seed, Prüfung statt
Schablone), hat aber eine tote Spielbarkeitsregel (BEFUND F) und eine
Materialverteilung, die ihrer eigenen Beschreibung widerspricht (BEFUND I). Die
Persistenz über den Replay-Kern ist die richtige Entscheidung für ein
deterministisches Spiel und wird nur durch den Klartext-Token der Sitze
getrübt (BEFUND D). Der teuerste Einzelfund ist BEFUND A: eine Zeile in
`#spawnPlayers`, die jeden zehnten Startplatz um bis zu 306 px in die Luft
setzt.
