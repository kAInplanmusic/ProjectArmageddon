# Selbst-Audit (Agent) — Code, Architektur, Struktur

**Commit:** `edba466` · **Datum:** 2026-09-17 · **Umfang:** 30.567 Zeilen `src/`,
16.013 Zeilen Tests, 666 Unit-Tests + 164 E2E-Tests (alle grün)

Dies ist der **eigene** Audit-Teil des Agenten. Drei unabhängige Subagenten
liefern parallel weitere Sichten (Code-Audit, User-Flow + Spaßfaktor,
Black-Box-Test) in eigene Dokumente.

---

## Positiv verifiziert (mit Beleg, nicht behauptet)

### Determinismus hält wirklich

Gemessen, nicht gelesen: Zweimal dasselbe Match mit demselben Seed ergibt
denselben Zustandshash, verschiedene Seeds verschiedene.

```
Seed 4242 Lauf 1: bc9695fa
Seed 4242 Lauf 2: bc9695fa
Seed 9999       : c0531097
Deterministisch : JA
Seed wirkt      : JA
```

Geprüft wurde über 3000 Ticks eines laufenden Matches mit Schüssen — nicht über
einen Kurzlauf.

### Kein `Math.random()` im Simulationspfad

Vollständige Suche über `src/`. Die Treffer liegen **ausschließlich** außerhalb
der Simulation:

| Ort | Zweck | Bewertung |
|---|---|---|
| `src/shared/prng.js:150-151` | Seed-Erzeugung (`Date.now`, `Math.random`) | korrekt — das ist die Quelle, nicht der Pfad |
| `src/client/networkClient.js` | Latenzmessung (`performance.now`) | korrekt — Anzeige |
| `src/client/input.js:164` | Aufladefortschritt | korrekt — Eingabe |
| `src/server/lobby.js`, `persistence.js`, `gameServer.js` | Zeitstempel, Metriken | korrekt — Betrieb |
| `src/client/shotPrediction.js:216` | injizierbare `now`-Funktion | vorbildlich — testbar statt fest verdrahtet |

Die Kommentare in `prng.js:9`, `loot.js:5`, `loadouts.js:38` benennen die Regel
ausdrücklich. Das ist gelebte Konvention, nicht Zufall.

---

## Befunde

### 🔴 1. 974 Zeilen toter Code ohne jeden Bezug zum Produktivpfad

| Datei | Zeilen | Importeure |
|---|---|---|
| `src/engine/terrain/terrainEngine.js` | 494 | **0** |
| `src/engine/weapons/weaponEngine.js` | 480 | **0** |
| `src/engine/terrainEngine/index.js` | 1,2 KB | **0** |
| `src/engine/weaponEngine/index.js` | 0,65 KB | **0** |
| `src/engine/weapons/projectArmageddonWorldAdapter.js` | 175 | **0** |

**Beleg:** `grep -rn "terrain/terrainEngine" src/ tests/` findet nur die Datei
selbst. `grep -c 'TerrainEngine' src/engine/index.js` ergibt **0** — auch über
das Barrel sind sie nicht erreichbar.

**Warum das ein Problem ist:** Die beiden `index.js` sind als „Wrapper für
externes Paket" kommentiert, aber es gibt kein externes Paket — sie sind
Attrappen mit Stub-Klassen (`initialize()` setzt ein Array und gibt `true`
zurück). Wer sie für den Produktivpfad hält, sucht an der falschen Stelle.
Projektregel „eine Regel, eine Stelle" — hier existiert eine zweite,
unbenutzte Terrain- und Waffen-Engine neben `engine/terrain/` und
`shared/config/weapons.js`.

**Fix-Vorschlag:** Entfernen, wenn bestätigt ist, dass kein externes Werkzeug
sie lädt. Wegen der Größe als eigener Schritt mit Rückfrage (siehe TODO).

### 🟠 2. `targeting` widerspricht der Wirkung — bei 11 Waffen

Eine erste Zählung ergab sieben verdächtige Felder. Die **Einzelprüfung** hat
sechs davon entlastet und beim siebten etwas Ernsteres gefunden, als „ungenutzt":

Das Feld `targeting` steht in **allen 150** Einträgen der Quelldatei
(`'directional'` 125×, `'self_or_area'` 25×) und wird vom Motor **nicht**
gelesen. Der Motor leitet die Unterscheidung stattdessen aus der **Wirkung** ab
(`SELF_TARGET_KINDS` in `engine/specials.js`).

**Nachgemessen: Die beiden Quellen widersprechen sich bei 11 Waffen.**

| Waffe | Quelldatei sagt | Motor leitet ab |
|---|---|---|
| Heilzauber (`pa_092`) | `directional` | wirkt auf den **Schützen** (`heal`) |
| Eisschild (`pa_101`) | `directional` | wirkt auf den **Schützen** (`shield`) |
| Auto-Turret (`pa_124`) | `directional` | wirkt auf den **Schützen** (`turret`) |
| Blutritual (`pa_116`) | `directional` | wirkt auf den **Schützen** (`heal`) |
| … 7 weitere | `directional` | selbstbezogen |

Bei 139 von 150 stimmen beide überein.

**Wer hat recht?** Die Quelldatei. Der Heilzauber hat `special: "heal"` UND
`targeting: "directional"` — sie widerspricht sich **in sich selbst**.
`'directional'` ist dort der undifferenzierte Normalfall (125 von 150), auch für
Waffen, die nachweislich auf den Schützen wirken. Nur `flight` und `teleport`
sind als `self_or_area` verschlagwortet.

**Folge:** Die Ableitung des Motors ist die verlässliche Quelle; das Datenfeld
ist unscharf. Deshalb wird es **nicht** verdrahtet — es würde 11 Waffen falsch
steuern (Heilzauber als Angriff).

Die **Einzelprüfung der übrigen sechs Verdachtsfelder** entlastete sie:

| Feld | Verdacht | Nachprüfung | Urteil |
|---|---|---|---|
| `aoe` | kein Leser in `src` | **wird gelesen**: `build-weapon-catalog.mjs:380` (`weapon.aoe ? 12 : 0`) | lebt |
| `sourceRarity` | kein Leser in `src` | **wird gelesen**: `tests/weapon-audit.test.js:173`, `scripts/balance-report.mjs:325` | lebt |
| `cooldownSource` | kein Leser | als „Herkunftsnachweis" kommentiert | bewusst behalten |
| `requiresLineOfSight` | kein Leser in `src` | **wird gelesen**: `build-weapon-catalog.mjs:390` (`losFactor`) | lebt |
| `effectMagnitude` | kein Leser in `src` | **wird gelesen**: `build-weapon-catalog.mjs:820` | lebt |
| `wurfAbgeleitet` | kein Leser | 0 Leser, vom Agenten selbst eingeführt | **entfernt** |

**Methodischer Hinweis:** Ein `grep` nur über `src/` erzeugt hier fast nur
Fehlalarme, weil der Generator ein Teil des Produktivpfads ist — er erzeugt den
Katalog, den die Engine liest. Die Prüfung muss `scripts/` einschließen. Dieser
Fehler ist im ersten Durchgang passiert und wurde korrigiert.

**Wirkung:** `wurfAbgeleitet` (21 Einträge, 0 Leser) ist entfernt. `targeting`
bleibt bestehen — die Begründung steht oben (Datenfeld unscharf, Motor leitet
korrekt ab).

### 🟠 3. Testabdeckung: zwei Module waren schlechter dargestellt als sie sind

Ein erster Zählschritt ergab fünf Module „ohne eigenen Test". Die
**Einzelprüfung** hat drei davon entlastet — und einen echten Grund gefunden:

| Modul | Zeilen | eigener Test | Nachprüfung |
|---|---|---|---|
| `src/client/sceneryPainter.js` | 599 | **nein** | **echte Lücke** → im Audit geschlossen (9 Tests) |
| `src/client/renderer.js` | 1119 | nein | in `node --test` **nicht ladbar** (siehe unten); teils über E2E gedeckt |
| `src/shared/protocol.js` | 473 | nein | **entlastet**: 10 Testdateien lesen es |
| `src/engine/terrain/terrainEngine.js` | 494 | nein | toter Code (Befund 1), Test wäre sinnlos |
| `src/engine/weapons/weaponEngine.js` | 480 | nein | toter Code (Befund 1) |

#### Warum `renderer.js` keinen Test hatte — und es kein Versäumnis war

Der Renderer nutzt `import.meta.glob('./assets/backdrops/*.jpg')`
(`renderer.js:38`). Das ist eine **Vite-spezifische** Erweiterung; Node kennt sie
nicht. Ein `import` des Moduls in `node --test` scheitert mit
`TypeError: (intermediate value).glob is not a function`.

Ein Testversuch während dieses Audits reproduzierte das und wurde wieder
entfernt. Der projektübliche Weg ist ein anderer: `tests/backdrops.test.js`
prüft die **Dateien auf der Platte** und die Konfiguration, nicht das
Renderer-Modul — und die Partikellogik ist über
`tests/e2e/accessibility.spec.mjs:212` (E2E, echter Browser) gedeckt, inklusive
der `prefers-reduced-motion`-Regel.

**Was daraus folgt:** Wer den Renderer künftig testen will, braucht einen
Vite-basierten Testläufer (z. B. Vitest) oder muss die testbare Logik in
eigene Module ziehen — wie bei `terrainBaker.js` und `shotPrediction.js`
bereits geschehen. Das ist ein **Architektur-Vorschlag**, kein Fehler.
Beides steht als offener Punkt in der TODO.

### 🟡 4. `sourceRarity` ist eine Doppelspur zu `rarity`

Nachgemessen: Bei allen 150 Waffen sind beide Felder identisch. Der Unterschied
ist die Herkunft (Quelldatei vs. abgeleitet), aber wenn ein Test fehlschlägt,
kann niemand sagen, welches der beiden Felder gemeint ist.

**Fix-Vorschlag:** Eines entfernen oder die Beziehung testen
(`rarity === sourceRarity || rarity ist abgeleitet`).

### 🟡 5. Der Balance-Bericht nennt als Ursache „Datenmangel", wo Mechanik fehlte

Im Zug „Nahkampf wirft" behoben, aber die **Textausgabe des Berichts** nennt
weiterhin pauschal drei Ursachen, von denen eine („b) Platzhalter ohne
Designwert") in der Praxis nicht mehr zutrifft.

**Beleg:** Der Bericht meldete für 21 Waffen mit Schadenswerten 20–52
„Datenmangel", obwohl die Werte vorhanden waren — es fehlte die Mechanik.

**Fix-Vorschlag:** Die Ursachenschätzung des Berichts um „Wirkung fehlt trotz
Werten" ergänzen.

---

## Nicht gefunden (ebenso wichtig)

Gesucht und **nicht** angetroffen:

- **`Math.random()` im Simulationspfad** — keiner vorhanden (siehe oben).
- **Zustandslecks zwischen Client und Server** — `currentState()` und
  `onlineViewState` werden getrennt aufgebaut, aber ein E2E-Test deckt die
  Divergenz ab.
- **Stumm verschluckte Fehler** — es gibt leere `catch`-Blöcke, sie sind aber
  jeweils kommentiert und behandeln erwartbare Fälle (Verbindungsabbruch beim
  senden, localStorage voll).
- **Client-Autorität bei Physik** — der Server rechnet; der Client sagt nur
  voraus und rollt zurück (`shotPrediction.js`).
- **Fehlende Eingabevalidierung an der API** — `lobby.js` prüft jede Kennung
  und fällt tolerant zurück.

---

## Umfang und Grenzen dieses Audits

Nicht geprüft (bewusst): die visuelle Qualität des Renderings, die
Langzeit-Balance der neuen Klasse/Archetyp-Kombinationen, das Verhalten unter
echter Netzwerklatenz (nur simuliert in `network-conditions.spec.mjs`), und
alles, was einen echten WebGPU-Adapter bräuchte.
