# Abnahme-Bericht Optimierung — 2026-10-01

**Auftrag:** Belegter Optimierungs-Abnahmebericht. Bundle-Analyse, Code-Splitting-Prüfung,
`perf`/`measure`-Zahlen, Bildauslieferung, priorisierte Wirkungsliste. Keine erfundenen
Zahlen — jeder Wert mit Befehl und Ausgabe. Was schon optimal ist, wird als solches benannt.

**Stand:** HEAD `0cb14ae`, Branch `main`. Rein lesende Messung: **keine** bestehende Datei
geändert, nichts in `src/`, `tests/`, `vite.config.mjs`, `index.html` oder `package.json`
angefasst; **kein Playwright, kein Server**. `npm run build` schreibt nur nach `dist/`
(gitignored). Neu angelegt wurde ausschließlich diese Datei.

**Umgebung:** Node v26.7.0, Vite 8.3.0 (`npx vite --version` → `vite/8.3.0 linux-x64
node-v26.7.0`), Linux, kein GPU-/Browser-Zugriff in dieser Messung.

**Vorgänger:** `docs/optimierung-bericht.md` (Stand HEAD `e26821d`, 2026-09-26). Dieser
Bericht baut darauf auf und korrigiert, was überholt ist.

---

## 0. Was sich seit dem Vorgängerbericht geändert hat (und was nicht)

Seit `e26821d` liegen 40+ Commits (`git log --oneline e26821d..HEAD`), 148 Dateien,
+33.454 / −8.368 Zeilen. Zwei Befunde des Vorgängerberichts habe ich gezielt nachgeprüft:

### 0.1 Top-Fund umgesetzt: der Ereignis-Filter ist da

Der Vorgängerbericht nannte als **Kandidat #1** den ungefilterten Ereigniskanal
(`gameServer.js` sandte jedes Engine-Ereignis an alle Clients). Heute steht dort ein
Sendefilter:

```
$ grep -n -A6 "for (const event of" src/server/gameServer.js
361:    for (const event of this.match.consumeEvents()) {
362-      if (!this.sendefilter.durchlassen(event.type, event.payload, takt)) {
363-        if (this.metrics) this.metrics.controlMessagesSuppressed += 1;
364-        continue;
365-      }
366-      if (this.metrics) this.metrics.controlMessagesSent += 1;
367-      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
```

`src/server/gameServer.js:114` → `this.sendefilter = new EreignisSendefilter();`.
Die Klasse steht in `src/shared/protocol.js:905`; sie drosselt `landed`, `crate_landed`,
`damage`, `entity_in_water`, `drowning` auf ein Wiederholungsfenster von
`EREIGNIS_DROSSEL_TAKTE = 30` Takten (`protocol.js:838, :869`) — die erste Meldung je Art
und Figur geht immer raus, weitere im Fenster werden zusammengefasst.

**Eigene Nachmessung** (derselbe Lauf wie der Vorgängerbericht: 18000 Ticks = 300 s,
2 Teams × 2, `hills`, Seed 20260910, ohne Schuss; Ereignisse aus `consumeEvents()` durch
`EreignisSendefilter.durchlassen(art, payload, takt)` geschickt, `takt = world.tickCount`):

```
Ticks: 18000 | Ereignisse roh: 10314 | gesendet: 2086 | unterdrueckt: 8228 (79.8%)
je Sekunde roh: 34.4 | gesendet: 7.0
Top unterdrueckt:
  landed             empfangen  10288 gesendet   2060 unterdrueckt   8228
```

Das deckt sich exakt mit der Projektdokumentation `docs/ereigniskanal-filter.md`
(Z. 26–27, 68: „3428 `landed` in 100 s bei vier Figuren … 688“) — 10288/3 ≈ 3429 und
2060/3 ≈ 687. **Der Kanal ist damit kein Optimierungskandidat mehr** (Rest 7,0/s, davon
2060 `landed` im Fenster bleibt sichtbar „DASS" gelandet wurde).

### 0.2 Kandidat #2 (Zustand doppelt gebaut) ist **weiterhin offen**

`match.step()` endet weiter mit `return this.getState()` (`src/engine/match.js:1013`), und
der Server ruft beides je Tick:

```
$ grep -n "match.step()\|match.getState()" src/server/gameServer.js
395:      this.match.step();
396:      this.history.push(this.match.world.tickCount, this.match.getState());
399:    return this.match.getState();
```

Der Rückgabewert von `step()` (Z. 395) wird verworfen, der Zustand danach (Z. 396) neu
gebaut. Der Befund besteht unverändert — die Zahl dazu steht in Abschnitt 3.

---

## 1. Bundle-Analyse — `npm run build`

**Befehl:** `npm run build`

**Ausgabe (wörtlich; Bildliste gekürzt, Kopf und Fuß vollständig):**

```
> projectarmageddon@0.1.0 build
> vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 245 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                         33.11 kB │ gzip:  10.13 kB
dist/assets/12_arcology-agent-VwG0Efx5.png              46.33 kB
dist/assets/20_buffer-flow-swarm-DQMhpjUj.png           61.23 kB
   … 155 weitere Bilddateien …
dist/assets/deluge_drowned_forest-CWjxOJeR.jpg         265.96 kB
dist/assets/warren_ruin_labyrinth-CVBnKlq2.jpg         290.30 kB
dist/assets/warren_bamboo_thicket-1HF0BBe7.jpg         298.79 kB
dist/assets/index-K3qc0gqe.js                          505.61 kB │ gzip: 138.38 kB │ map: 2,048.34 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 40.13s
```

Die Warnung ist eine **Schwelle bei 500 kB, keine Messung** — das Bundle liegt mit
505,61 kB knapp darüber. Der Vorgängerbericht hielt bereits fest: es gibt **kein**
Bundle-Budget und **kein** Gate dafür (`grep` in `scripts/checks.mjs`,
`vite.config.mjs`, `package.json` → keine Ausgabe). Daran hat sich nichts geändert.

### 1.1 Was das JS-Bundle dominiert — Daten, nicht Bilder

**Erste Feststellung: die Bilder sind NICHT im JS-Bundle.** Beide Bilderglobs laden
ausschließlich URLs:

```
$ sed -n '52,56p' src/client/renderer.js
const BACKDROP_URLS = import.meta.glob('./assets/backdrops/*.jpg', {
  eager: true, query: '?url', import: 'default',
});
$ sed -n '18,22p' src/client/roster.js
const BILDER = import.meta.glob('./assets/characters/*/*.png', {
  eager: true, query: '?url', import: 'default',
});
```

`?url` bedeutet: Vite legt die Datei unter `/assets/` ab und setzt nur den Pfad-String ins
Bundle. Gegenprobe: **0 Treffer** für eingebettete Bilder im Bundle
(`grep -o "data:image" bundle.js | wc -l` → `0`). Die 161 Bild-URL-Strings kosten grob
**7,2 kB roh** (Summe der Asset-Pfadlängen; Rechnung: 161 Pfade × Ø ~46 Zeichen).

**Modulrangfolge.** Die Sourcemap nennt **240 Module** (`map.sources`), der Build meldet
245 transformierte Module; 79 davon sind `.js`, **161 sind die Bild-URL-Virtualmodule**,
**0 stammen aus `src/server/`** (der Client zieht keinen Servercode). Ich habe jedes
JS-Modul **isoliert** mit rolldown minifiziert (nur der eigene Code, alle Abhängigkeiten
extern) und die Größe gemessen.

> **Methodenvorbehalt (wichtig):** Isolierte Minifizierung ist schwächer als die des
> Gesamtbundles — die Summe der 79 Module ergibt **516.498 B**, mehr als das reale Bundle
> (**505.617 B**). Die Einzelwerte überschätzen also jeden Anteil; sie sind **untereinander**
> vergleichbar und zeigen die Rangfolge, nicht den exakten Byte-Anteil im Bundle.

**Befehl:** `node --input-type=module -e '… rolldown({input:f, external:()=>true}).generate({minify:true}) …'`
(Ausgabe, Top 18):

```
 119176 B  gzip  12175 B   src/shared/config/weapons.js
  47829 B  gzip  15913 B   src/shared/config/factions.js
  47629 B  gzip  15171 B   src/client/main.js
  39282 B  gzip  14488 B   src/shared/config/backdrops.js
  27440 B  gzip   9371 B   src/engine/match.js
  21857 B  gzip   6369 B   src/client/renderer.js
  15094 B  gzip   4579 B   src/shared/config/scenery.js
   9627 B  gzip   3960 B   src/client/hud.js
   9265 B  gzip   3391 B   src/client/sceneryPainter.js
   8746 B  gzip   3651 B   src/shared/terrainGen3.js
   8630 B  gzip   3447 B   src/shared/protocol.js
   7391 B  gzip   3158 B   src/client/terrainBaker.js
   7359 B  gzip   3078 B   src/engine/shooting.js
   7282 B  gzip   2332 B   src/engine/specials.js
   7126 B  gzip   2500 B   src/shared/stats.js
   7008 B  gzip   2415 B   src/client/ereignisse.js
   6487 B  gzip   2289 B   src/shared/achievements.js
   6126 B  gzip   2652 B   src/client/networkClient.js
```

**Befund:** Der größte Einzelbrocken ist **`src/shared/config/weapons.js`** — 199.697 B
Quelltext, isoliert minifiziert **119.176 B** (gzip 12.175 B), also rund ein Viertel des
minifizierten Codes. Der Dateikopf sagt, was es ist:

```
$ head -5 src/shared/config/weapons.js
 * AUTO-GENERIERT von scripts/build-weapon-catalog.mjs — nicht manuell editieren.
 * Quelle: project_armageddon_weapons_v1.json (150 Waffen).
```

Gezählt: `awk '/"id":/ {n++} END{print n}' weapons.js` → **150**. Es sind reine Daten.

Danach folgen **drei weitere reine Datentabellen** — `factions.js` (81 Kader-Einträge,
`grep -c "sprite:"` → 81), `backdrops.js` (81 Kulissen, `grep -c "file:"` → 81) und
`scenery.js` — sowie die Spiel-Logik (`main.js`, `match.js`, `renderer.js`).

**Zusammengefasst:** Das 505-kB-JS-Bundle besteht aus **Datentabellen (~45 %) und
Engine/UI-Logik (~55 %)**. Ein unverhältnismäßiger Einzelposten ist das **nicht**: der
gzip-Anteil von real 138,38 kB ist klein, es gibt keine eingebetteten Bilder und keine
doppelten Servermodule. Das JS ist außerdem mit **2,3 %** ein Nebenposten der Auslieferung
(siehe Abschnitt 5).

---

## 2. Code-Splitting — sinnvoll? (Erwartete Ersparnis als Schätzung)

Die Vite-Warnung schlägt `dynamic import()` vor. Die Frage ist nicht „kann man splitten",
sondern „was darf beim Start fehlen". Ich habe die Importkette geprüft.

**Was beim Start gebraucht wird (nicht verschiebbar):**

| Modul | Warum beim Start | gemessen (isoliert minif.) |
|---|---|---|
| `config/weapons.js` | statisch von `engine/match.js:41`, `shooting.js`, `hud.js`, `ereignisse.js`, `debugApi.js` … importiert | 119.176 B / 12.175 B gz |
| `config/factions.js`, `config/backdrops.js` | Kader-/Kulissen-Daten fürs Menü und die Karte | 47.829 / 15.913 gz bzw. 39.282 / 14.488 gz |
| `engine/match.js` + Systeme | `import { MatchController } from '../engine/match.js'` (`src/client/main.js:17`) — der Client baut das Match lokal auf | 27.440 B / 9.371 B gz |
| `engine/replay.js` | **doppelt gebunden**: `main.js:53` **und** `shared/protocol.js` | 4.239 B / 1.697 B gz |

**Kandidaten, die beim ersten Bild NICHT gebraucht werden:**

| Kandidat | Fundstelle | gemessen (isoliert minif. / gzip) |
|---|---|---|
| Debug-API | `import { exposeDebugApi } from './debugApi.js'` (`main.js:31`), Aufruf `this.#exposeDebugApi()` (`main.js:207`) | **3.493 B / 1.375 B** |
| Profil-/Erfolgsanzeige | `import { baueProfilAnzeige, baueErfolgsAnzeige } from './profilanzeige.js'` (`main.js:33`) | **2.978 B / 1.213 B** |
| Hilfe-Inhalte | `config/classes.js` (`uebersichtFuerHilfe`, `classCounterplay`, `resolveLoadout`, `combatProfile` — `main.js:44`) + `TERRAIN_AFFINITY` (`Hilfe`, `main.js:50`) | `classes.js` **4.070 B / 1.756 B** gesamt; der reine Hilfe-Anteil ist darin nicht sauber abtrennbar (**Schätzung**) |
| Replay-Wiedergabe | `ReplayPlayer` (`main.js:53`) | **nicht verschiebbar** — `protocol.js` importiert `replay.js` ebenfalls, das Modul bleibt ohnehin im Hauptchunk |

**Schätzung der Ersparnis:** Verschiebt man Debug-API und Profilanzeige in einen
Lazy-Chunk, wandern **nur deren eigener Code** (ihre Abhängigkeiten `stats.js`,
`achievements.js` bleiben, weil `main.js` sie selbst braucht):

```
Debug-API     1.375 B gzip
Profilanzeige 1.213 B gzip
─────────────────────────
Summe         ≈ 2.588 B gzip  ≈ 1,9 % des 138,38-kB-gzip-Bundles
```

Das ist eine **Schätzung**, gespeist aus den gemessenen Modulgrößen; die Zuordnung „nur
diese beiden sind verschiebbar" folgt aus dem gemessenen Importgraphen.

**Die großen Brocken lassen sich NICHT sinnvoll abspalten:** `weapons.js`, `factions.js`
und `backdrops.js` sind die drei größten Module, aber alle drei werden von der Engine bzw.
dem Menü **beim Start** gebraucht. Sie erst bei „Start" nachzuladen hieße, die ganze Engine
(`match.js`) zu verzögern — ein großer Umbau, und das erste Match braucht sie sofort.
**Ergebnis: Code-Splitting lohnt hier nicht.** Der mögliche Gewinn (~2,6 kB gzip, ~1,9 %)
steht in keinem Verhältnis zum Umbau der Startlogik. Das ist ein valides „hier ist fast
nichts zu holen".

---

## 3. `npm run perf` — Tick-Kosten und Vergleich mit dem Vorgänger

**Befehl:** `npm run perf`

**Ausgabe (wörtlich, eigener Lauf):**

```
Performance-Profil (Headless, ohne Rendering)
  Konfiguration : 2 Teams x 2, Karte hills, Seed 20260910
  Simuliert     : 18000 Ticks (300.0 s Spielzeit), 39 Schüsse
  Matches       : 1 (Ø 13 Runden pro Match)
  Wanduhr       : 1709 ms → 10534 Ticks/s
  Tick-Dauer    : mittel 0.0627 ms | p95 0.1007 ms | p99 0.2821 ms | max 4.5037 ms
  Budget        : 16.6667 ms/Tick (60 Hz)
  Über Budget   : 0 Ticks (0 %)
  Speicher      : Heap 18.5 MB, RSS 90 MB
  Echtzeitfaktor: 175.6x (Simulation läuft schneller als Echtzeit)
  ERGEBNIS: Simulationsbudget wird eingehalten (< 1 % der Ticks über 16,7 ms).
```

### 3.1 Vergleich mit `docs/optimierung-bericht.md`

| Größe | Vorgänger (2026-09-26) | heute (2026-10-01) | Änderung |
|---|---|---|---|
| Tick mittel | 0,0920 ms | **0,0627 ms** | −31,8 % |
| p95 | 0,1454 ms | **0,1007 ms** | −30,7 % |
| p99 | 0,3805 ms | **0,2821 ms** | −25,9 % |
| max | 8,3183 ms | **4,5037 ms** | −45,9 % |
| Ticks/s | 7053 | **10534** | +49,4 % |
| Echtzeitfaktor | 117,6× | **175,6×** | — |
| Heap | 12,1 MB | **18,5 MB** | +52,9 % |
| RSS | 70,1 MB | **90,0 MB** | +28,4 % |
| über Budget | 0 Ticks | **0 Ticks** | unverändert |

**Der Tick ist heute rund ein Drittel schneller.** Die Ursache habe ich lokalisiert:
`getState()` je Aufruf ist von 0,04426 ms auf **0,02898 ms** gefallen. Beleg (derselbe
Lauf wie `perf-profile.mjs`, `MatchController.prototype.getState` im Speicher umwickelt,
Zeitmessung mit `process.hrtime.bigint()`):

```
Ticks: 18000 | Schuesse: 39 | Matches: 1
getState-Aufrufe gesamt: 36001 ( 2.00 je Tick)
getState Kosten gesamt: 1043 ms | Mittel je Aufruf: 0.02898 ms
Tick (step+consumeEvents) Mittel: 0.06540 ms
```

(Die 2,00 Aufrufe je Tick kommen aus dem Messskript selbst: `perf-profile.mjs:82` ruft
`getState()` zusätzlich zum internen Aufruf in `step()`. Der **eine** Aufruf IN `step()`
kostet 0,02898 ms von 0,0627 ms ⇒ **~46 %** des Ticks — dieselbe Größenordnung wie die
44 % des Vorgängerberichts, nur auf kleinerer Basis.) Der Server baut den Zustand weiterhin
**zweimal** (Abschnitt 0.2); die Einsparung eines Aufrufs wäre heute ≈ 0,029 ms/Tick
(≈ 0,17 % des 16,67-ms-Budgets) statt der früheren 0,0443 ms.

**Einordnung, unverändert gültig:** 0,0627 ms sind **0,38 %** des 16,6667-ms-Budgets.
0 Ticks über Budget. Am Tick ist nichts zu reißen.

---

## 4. `measure:load` und `measure:figures` — Rechenlast bei vielen Figuren

> **Wichtig fürs Lesen:** Die drei Skripte messen **unterschiedliche Zeitfenster** und sind
> daher nicht direkt vergleichbar. `perf` misst `step()+consumeEvents()`
> (`perf-profile.mjs:92–95`). `measure:figures` misst ebenfalls `step()+consumeEvents()`,
> ruft aber alle 7 Ticks `endTurn()` und setzt `turnDurationMs: 200`
> (`measure-figures.mjs:58,72–75`). `measure:load` misst `getState()+fire()+endTurn()+
> step()+consumeEvents()` **je Durchlauf** (`measure-load.mjs:54–71`) und feuert dabei in
> JEDEM Takt — das ist die volle Obergrenze, nicht der Normalbetrieb.

### 4.1 `npm run measure:load`

```
Rechenlast je Konfiguration

Gemessen mit echten Partien (kein Schätzen).

2 Spieler      Aufbau    56 ms | je Tick   4.78 ms | Zustand    3.3 KB | 2 Figuren, 44 Ticks
4 Spieler      Aufbau    42 ms | je Tick   2.76 ms | Zustand    3.7 KB | 4 Figuren, 87 Ticks
6 Spieler      Aufbau    54 ms | je Tick   2.25 ms | Zustand    4.7 KB | 6 Figuren, 152 Ticks
3 Teams × 2    Aufbau    35 ms | je Tick   3.96 ms | Zustand    4.9 KB | 6 Figuren, 124 Ticks
4 Teams × 2    Aufbau    35 ms | je Tick   1.82 ms | Zustand    4.6 KB | 8 Figuren, 195 Ticks

HOCHRECHNUNG AUF DIE PRAXIS
Konfiguration      1 Match  10 Matches  je Match/Std
2 Spieler       286.9 ms/s   2869 ms/s        1033 s
4 Spieler       165.6 ms/s   1656 ms/s         596 s
6 Spieler       135.2 ms/s   1352 ms/s         487 s
3 Teams × 2     237.9 ms/s   2379 ms/s         856 s
4 Teams × 2     109.2 ms/s   1092 ms/s         393 s

WAS DAS BEDEUTET
  Ein 4-Spieler-Match braucht 165.6 ms Rechenzeit je
  Sekunde — das sind 16.56 % EINES Kerns.
  Zehn gleichzeitige 4-Spieler-Matches: 166 % eines Kerns.
  Ein 8-Spieler-Match: 10.92 % eines Kerns.
  Die Simulation ist damit KEIN Engpass.
```

### 4.2 `npm run measure:figures` — Zielgröße 40 Figuren

```
Wie viele Figuren trägt der Motor?

Konfiguration   Figuren    Aufbau   je Tick   % Kern   Ticks
--------------------------------------------------------------
2 Figuren             2     60 ms  0.284 ms    1.7 %     106
4 Figuren             4     37 ms  0.192 ms    1.2 %     218
6 Figuren             6     36 ms  0.103 ms    0.6 %     330
8 Figuren             8     34 ms  0.097 ms    0.6 %     435
10 Figuren           10     32 ms  0.107 ms    0.6 %     547
12 Figuren           12     31 ms  0.131 ms    0.8 %     652
15 Figuren           15     36 ms  0.156 ms    0.9 %     820
20 Figuren           20     34 ms  0.166 ms    1.0 %    1100
16 Figuren           16     34 ms  0.146 ms    0.9 %     876
20 (2×10)            20     36 ms  0.156 ms    0.9 %    1100
40 Figuren           40     28 ms  0.272 ms    1.6 %    2185

WAS DIE ZAHLEN SAGEN
  Größte gemessene Konfiguration: 40 Figuren, 1.6 % eines Kerns, Aufbau 28 ms.
    Figuren:     10.0× mehr
    Rechenzeit:  1.4× mehr

DER DETERMINISMUS BEI VIELEN FIGUREN
   4 Figuren: Hash 32f25691 / 32f25691 — gleich
  12 Figuren: Hash 338f27f6 / 338f27f6 — gleich
  20 Figuren: Hash 4680f623 / 4680f623 — gleich
```

**Befund zur Zielgröße 40 Figuren:** Der Aufbau einer 40-Figuren-Karte kostet **28 ms**,
der Tick **0,272 ms = 1,6 % eines Kerns** — gemessen über 2185 Ticks. Die Rechenzeit wächst
mit der Figurenzahl um Faktor 1,4 bei Faktor 10 Figuren, also **langsamer als linear**. Der
Determinismus bleibt bei 4/12/20 Figuren nachweislich erhalten (gleicher Seed → gleicher
Hash). **Bei der Zielgröße 40 Figuren ist die Simulation weit von jedem Engpass entfernt.**

---

## 5. Bildauslieferung — Gesamtgröße, größte Dateien, WebP-Gewinn

**Befehl:** `find dist/assets -type f -printf "%s %f\n" | awk …` (Summen) bzw.
`du -sb dist`.

```
Bilder: 19153067 B (88,2%)   ← 80 × .jpg (11.291.863 B) + 81 × .png (7.861.204 B)
JS:       505617 B ( 2,3%)
Map:     2048349 B ( 9,4%)
index.html 33116 B
assets gesamt: 21707033 B
dist gesamt:   21741008 B (≈ 20,73 MB)
```

**Größte Einzeldateien in `dist/assets`:**

```
2048349 index-K3qc0gqe.js.map          ← Sourcemap
 505617 index-K3qc0gqe.js              ← das JS-Bundle
 298796 warren_bamboo_thicket-1HF0BBe7.jpg
 290303 warren_ruin_labyrinth-CVBnKlq2.jpg
 265960 deluge_drowned_forest-CWjxOJeR.jpg
 230191 hyperreal_jungle_river-BNaADiwL.jpg
 223057 warren_trench_lines-BvfxwtWW.jpg
 222104 deluge_rice_terraces-5RJlmFKr.jpg
 217679 deluge_monsoon-Cr4YxnBM.jpg
 213670 spires_karst_peaks-v7-QEu7A.jpg
 212050 abstract_psychedelic-CcExrXkI.jpg
 208545 warren_cave_network-eexYA_AJ.jpg
```

**Die Auslieferung wird von Bildern dominiert (88,2 %), nicht vom JS (2,3 %).** Die
Kulissen sind 1280×720-JPG (`PIL`-Größe `(1280, 720)`), die Kadersprites sind 256×256-PNG
mit Alphakanal (`(256, 256) RGBA`).

### 5.1 WebP — echte Messung an den größten Dateien (kein Schätzen)

Ich habe die größten Dateien mit PIL 12.3.0 tatsächlich nach WebP umgerechnet (Ausgabe in
den Scratch-Ordner, keine Projektdatei angefasst).

**JPG → WebP (quality 82):**

```
   298796 ->  216404 B  ( 27.6% kleiner)  warren_bamboo_thicket-1HF0BBe7.jpg  (1280, 720)
   290303 ->  207264 B  ( 28.6% kleiner)  warren_ruin_labyrinth-CVBnKlq2.jpg  (1280, 720)
   265960 ->  179554 B  ( 32.5% kleiner)  deluge_drowned_forest-CWjxOJeR.jpg  (1280, 720)
   212050 ->  176998 B  ( 16.5% kleiner)  abstract_psychedelic-CcExrXkI.jpg   (1280, 720)
   119002 ->   83846 B  ( 29.5% kleiner)  western_desert_town-Btet73vR.jpg     (1280, 720)
  Summe JPG: 1186111 -> 864066 B  (27.2% kleiner)
```

**PNG → WebP (lossless UND quality 90):**

```
   130344 -> lossless  82438 ( 36.8%) | q90  32928 ( 74.7%) B  22_ethereo (256,256 RGBA)
   127188 -> lossless  80828 ( 36.4%) | q90  33316 ( 73.8%) B  11_rauch-meister-genzi
   126101 -> lossless  78716 ( 37.6%) | q90  29586 ( 76.5%) B  22_banshee-beatrice
   124891 -> lossless  84804 ( 32.1%) | q90  31866 ( 74.5%) B  21_cosmic-meditate
  Sample-Summe PNG: 508524 -> lossless 326786 | q90 127696 B
```

**Hochrechnung auf den Gesamtbestand — ausdrücklich SCHÄTZUNG** (lineare Extrapolation der
gemessenen Prozentsätze auf alle Dateien; echte Konvertierung des Gesamtbestands wurde
nicht durchgeführt):

| Weg | Restgröße (geschätzt) | Ersparnis (geschätzt) |
|---|---|---|
| JPG→WebP q82: 11.291.863 × 27,2 % | ≈ 8,22 MB | ≈ −3,07 MB |
| PNG→WebP **lossless**: 7.861.204 × 35,7 % | ≈ 5,05 MB | ≈ −2,81 MB |
| PNG→WebP **q90**: 7.861.204 × 74,9 % | ≈ 1,97 MB | ≈ −5,89 MB |
| Bilder gesamt **lossless**: 19,15 MB → | ≈ 13,28 MB | ≈ **−5,88 MB (−30,7 %)** |
| Bilder gesamt **q90**: 19,15 MB → | ≈ 10,19 MB | ≈ **−8,96 MB (−46,8 %)** |

**Bewertung:** WebP bringt bei der Auslieferung einen **messbaren** Gewinn von ~6 MB
(verlustfrei) bis ~9 MB (q90) auf ~19 MB Bilder. **Risiko:** q90 auf den freigestellten
256×256-Sprites ist verlustbehaftet (Kanten, Alphakanten) — dort ist `lossless` der
sichere Weg und liefert trotzdem ~36 %. **Nicht** betroffen ist die Rechenzeit je Frame:
Bilddateien wirken auf Lade-/Cachezeit, nicht auf `drawImage`. Der Umbau verlangt (a) einen
Konvertierungsschritt und (b) ein Anpassen der zwei `import.meta.glob`-Muster
(`.jpg`→`.webp` in `renderer.js:52`, `.png`→`.webp` in `roster.js:18`) plus Neuerzeugung
der Dateien — **Aufwand: mittel.**

### 5.2 Sourcemap

Die Sourcemap ist mit **2.048.349 B (1,95 MB)** größer als das Bundle selbst; `vite.config.mjs:20`
setzt `sourcemap: true`, und sie landet in `dist/assets/`. Für eine Auslieferung ist
`sourcemap: false` (oder getrennter Upload) eine Einzeilen-Entscheidung mit **−1,95 MB**.

---

## 6. Priorisierte Liste „Optimierungen nach Wirkung/Aufwand"

Legende: **[M]** = gemessen, **[S]** = geschätzt.

| # | Maßnahme | Gemessene Ausgangslage | Erwartete Wirkung | Risiko | Aufwand |
|---|---|---|---|---|---|
| 1 | **WebP für Kulissen** (JPG→WebP q82) | 80 JPG = 11.291.863 B; Sample −27,2 % **[M]**, Gesamt ca. −3,07 MB **[S]** | Auslieferung −3,1 MB, ~16 % der Bilder | klein (Kulissen, keine Transparenz) | mittel |
| 2 | **WebP lossless für Sprites** (PNG→WebP) | 81 PNG = 7.861.204 B; Sample −35,7 % **[M]**, Gesamt ca. −2,81 MB **[S]** | Auslieferung −2,8 MB, verlustfrei | klein (lossless) | mittel |
| 3 | **Sourcemap nicht ausliefern** | `dist/assets/index-…js.map` = 2.048.349 B **[M]** | Auslieferung −1,95 MB; 0 ms Rechenzeit | keins | klein (1 Zeile) |
| 4 | **WebP q90 für Sprites** (statt lossless) | Sample −74,9 % **[M]**, Gesamt ca. −5,89 MB **[S]** | Auslieferung −5,9 MB | **mittel** (Artefakte an Alpha-Kanten) | mittel |
| 5 | **`step()` baut Zustand umsonst** | `getState()` 0,02898 ms/Aufruf, ~46 % des Ticks **[M]**; `gameServer.js:395/396` baut 2× je Tick **[M]** | ≈ −0,029 ms/Tick = 0,17 % des 16,67-ms-Budgets **[M]** | klein (öffentliche API, im Repo liest kein Aufrufer den Rückgabewert) | klein |
| 6 | **Debug-API + Profil lazy splitten** | beide statisch importiert (`main.js:31,33`); Zusammen 2.588 B gzip **[M]** | ≈ 1,9 % des gzip-Bundles, nur Erstladung **[S]** | klein | mittel (Startlogik umbauen) |
| 7 | **Bundle-Größen-Gate einführen** | kein Budget/Gate vorhanden (`grep` → keine Ausgabe) **[M]** | keine Optimierung, sondern eine Schwelle | — | klein |

**Nicht in der Liste, weil erledigt:** der **Ereignis-Filter** (Vorgängerbericht #1) ist
umgesetzt und gemessen wirksam: `landed` 34,4/s → 7,0/s gesamt, **−79,8 %** Steuerlast
(Abschnitt 0.1) **[M]**.

---

## 7. Was bei der Optimierung NICHT zu holen ist (mit Beleg)

1. **Simulations-Tick:** 0,0627 ms mittel bei 16,6667 ms Budget = **0,38 %**, 0 Ticks über
   Budget **[M]**. Selbst ein vollständig auf null gebrachter Tick verkürzt den Frame um
   0,38 %. Kein System kommt in die Nähe des Budgets.
2. **Viele Figuren (40):** 0,272 ms/Tick = **1,6 % eines Kerns**, Aufbau 28 ms,
   Determinismus erhalten **[M]**. Kein Engpass.
3. **Server-Rechenlast:** 4-Spieler-Match = 165,6 ms/s = **16,56 % eines Kerns**; 10 Matches
   = 166 % eines Kerns, ein 8-Spieler-Match = 10,92 % **[M]**. Ein kleiner Server trägt
   Dutzende Matches.
4. **Ereigniskanal:** bereits gefiltert, Rest **7,0 Meldungen/s** bei vier Figuren **[M]** —
   der ehemals größte Leitungsfund ist abgearbeitet.
5. **Bilder sind NICHT im JS-Bundle:** 161 `?url`-Module, 0 `data:image`-Treffer,
   ~7,2 kB URL-Strings **[M]**. Das Bundle ist nicht „aufgebläht" durch Bilder.
6. **Code-Splitting:** nur ~2,6 kB gzip (~1,9 %) sind verschiebbar; die drei größten Module
   (Daten) braucht die Engine beim Start **[M] für Größen, [S] für die Zuordnung]**. Hier ist
   fast nichts zu holen.
7. **Bundle-Größe an sich:** 505,61 kB roh / **138,38 kB gzip**, kein Budget, kein Gate
   **[M]**. Ohne Schwelle ist „zu groß" keine prüfbare Aussage.
8. **Kein doppelter Servercode im Client:** 0 Module aus `src/server/` im Bundle **[M]**.

---

## 8. Grenzen dieser Messung

- Alles in Node gemessen, **nichts im Browser**: Bildzeit, Startzeit „Menü → erstes Bild"
  und `drawImage`-Kosten sind hier nicht nachmessbar (kein Browser, kein Server, kein
  Playwright in diesem Auftrag). Der einzige bekannte Posten, der ein Budget reißt, bleibt
  laut Vorgängerbericht die **Anzeige** (50,1 ms/Frame auf der Intel-HD-3000-Maschine) —
  belegt, aber nicht in diesem Auftrag nachgemessen.
- Die Modulgrößen (Abschnitt 1.1) sind **isoliert** minifiziert und überschätzen den Anteil
  im Gesamtbundle (Summe 516.498 B > 505.617 B). Sie dienen der Rangfolge, nicht dem exakten
  Byte-Anteil.
- Die WebP-Zahlen für den Gesamtbestand sind eine **Hochrechnung** aus Stichproben (5 JPG,
  4 PNG); der Gesamtbestand wurde nicht konvertiert.
- Die `perf`-Zahlen schwanken zwischen Läufen leicht (der Vorgänger nannte für `measure:load`
  andere Absolutwerte); verglichen werden hier nur Läufe desselben Skripts und derselben
  Konfiguration.
- `dist/` wurde während der Messung parallel neu gebaut (eine E2E-Suite lief); der Build
  war dabei **reproduzierbar** (derselbe Hash `index-K3qc0gqe.js`), die Analyse lief daher
  auf einer Kopie in `$TMPDIR`.
