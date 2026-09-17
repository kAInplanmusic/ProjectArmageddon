# Entwurf: Onboarding, Sidegrades, Counterplay und Map-Synergie

**Status:** Entwurf, kein Produktivcode. Grundlage: Branch `main`, Stand `c9f9a4d`.
**Auftrag:** Architektur- und Design-Entscheidung für die drei offenen Punkte aus
`MASTERDOTO.md`, Abschnitt „Übernommen aus der alten `todo.md`" (Zeilen 1784–1790).

Die drei Punkte hängen zusammen: Ein **Sidegrade** ist ohne **Klassenübersicht** nicht
erklärbar, und **Counterplay** ist ohne sichtbare Klassen- und Map-Eigenschaften nicht
spielbar. Der Entwurf behandelt sie deshalb in dieser Reihenfolge — A liefert die
Anzeige-Grundlage, B die Regeln, C die Beziehungen zwischen den Regeln.

---

## 0. Ausgangslage: Was bereits existiert (geprüft, nicht angenommen)

| Baustein | Datei / Funktion | Stand |
|---|---|---|
| Klassen + Archetypen | `src/shared/config/classes.js`: `CLASS_DEFINITIONS`, `CLASS_ARCHETYPES`, `combatProfile()`, `allCombatProfiles()` | fertig, eine Verrechnungsstelle |
| Startloadouts | `src/shared/config/loadouts.js`: `getClassLoadoutDetail()` liefert **Begründung je Platz** (`role`, `roleLabel`, `reason`) | fertig, ungenutzt im Menü |
| 9 Fraktionen / 81 Charaktere | `src/shared/config/factions.js`: `FACTIONS`, `CHARACTERS`, `COMBAT_ROLES`, `SLOT_CLASSES` | fertig, Inhalte reich (`bio`, `superWeapon`, `strengths`, `weaknesses`) |
| Kader-Dialog | `index.html#roster-browser`, gebaut von `buildRosterView()` in `src/client/main.js:2230` | fertig, zeigt Fraktionen + Rollen-Label (`classOf(c)`) |
| Kartenformen | `src/shared/terrainGen.js`: `TERRAIN_PRESETS` (8 Formen) | fertig, Kennzahlen in `tests/terrain-presets.test.js` festgehalten |
| Loot-Regeln | `src/shared/config/loot.js`: `LOOT_DROP_RULES`, `rollCrateCount/rollCrateContents/rollGamechanger` | fertig, im Menü **nirgends erklärt** |
| Seltenheiten | `src/engine/systems/lootSystem.js`: `RARITY_IDS`, `RARITY_WEIGHTS`; Farben in `loot.js:rarityColors` | fertig |
| Kampfprofil-Verbrauch | `src/engine/match.js:890` (`fire`), `:2014` (`#launchVector`), `:961` (Schaden), `:455` (Leben) | liest ausschließlich `combatProfile()` |
| Determinismus | `src/shared/seed.js`: `SEED_OFFSETS`, `MatchSeedManager.getSubRng()` | fertig, memoisiert pro Schlüssel |
| Statuszustände | `src/engine/specials.js`: `StatusStore`, `EFFECT_KIND`, `SELF_TARGET_KINDS` | fertig, außerhalb des ECS |
| Snapshot | `src/engine/match.js:2372 getState()` — enthält **`classId` und `archetypeId`** | fertig: der Client kennt die Klasse jedes Spielers bereits |

**Kernbefund:** Für A fehlt **keine einzige Datenquelle** — es fehlt nur die Darstellung.
Für B fehlt ein Regelsatz, aber **alle Anschlusspunkte existieren**. Für C fehlt ebenfalls
nur der Regelsatz; Terrain- und Klassen-Kennzahlen sind bereits vollständig.

---

## 1. Qualitätsregeln als Prüfmaßstab

Aus `README.md` Z. 409–416, hier als Prüfliste für jeden der drei Entwürfe:

1. Gameplay und Physik bleiben **2D**.
2. Kein `Math.random()` im **Simulationspfad**.
3. Keine **Client-Autorität** bei physikrelevanten Aktionen.
4. Keine Number-Bloat-Progression **im Match**.

Zusätzlich projektspezifisch (aus `src/engine/replay.js` und `seed.js`):

5. Ein Replay muss aus **(Seed + Eingabeliste)** exakt denselben Verlauf ergeben.
6. Eine Regel lebt an **genau einer Stelle** (`classes.js`-Doktrin).

---

## A) Onboarding: Klassenübersicht und Regelerklärung

### A.1 Entscheidung

**Ein Menü-Bereich `details#hilfe-browser` mit vier Reitern, dessen Inhalte
ausschließlich aus bestehenden Konfigurationsmodulen abgeleitet werden — keine
handgetippte Prosa, keine zweite Datenquelle.**

Vier Reiter:

1. **Spielziel** — statischer Text (aus `index.html`-Untertitel + `MATCH_RULES`).
2. **Klassen** — Tabelle aus `allCombatProfiles()` × `getClassLoadoutDetail()`.
3. **Loot und Seltenheiten** — aus `LOOT_DROP_RULES` und `RARITY_IDS`/`RARITY_WEIGHTS`.
4. **Karte und Gelände** — aus `TERRAIN_PRESETS` plus den Form-Beschreibungen.

### A.2 Reiter „Klassen" — der wichtigste

Der Nutzen steht und fällt damit, dass die Übersicht **die wirksamen Werte** zeigt,
nicht die deklarierten. `classes.js` trennt beides bereits sauber in
`combatProfile().healthMultiplier` / `.damageMultiplier` / `.launchSpeedMultiplier`
(wirksam) gegen `.inert` (deklariert, aber ungelesen). Die Übersicht muss diese Trennung
**sichtbar übernehmen** — sonst entsteht genau die „stille Lüge", die der Dateikopf
von `classes.js` als vermieden bezeichnet.

Je Klasse eine Karte mit:

- **Name + Rolle in einem Satz**, abgeleitet aus den Rohwerten
  (`scout`: „schießt am schwächsten (power 0,7), ist am beweglichsten (speed 1,2)").
  Diese Sätze gehören als `label`/`beschreibung`-Feld in `classes.js` (siehe A.4),
  nicht in den Client.
- **Drei Wirksäulen als Balken relativ zur Klasse `heavy` (= 1,0)**:
  Leben, Schaden, Abschussgeschwindigkeit — direkt aus `combatProfile()`.
- **Die Archetypen** als Zeile darunter (`CLASS_ARCHETYPES`): Brawler / Artillerist /
  Okkultist mit ihrer Wirkung (Leben-Faktor, Tempo-Faktor).
- **Das Startaufgebot** aus `getClassLoadoutDetail(classId)` — mit `roleLabel` und
  der konkreten Waffe. Dieses Feld existiert bereits und wird **heute nirgends
  angezeigt**; die Übersicht ist der erste Konsument.

  **Korrektur zum ersten Entwurf (Umsetzung, belegt):** Der Entwurf nannte auch
  `reason` als Textgewinn („Felder, die im Menü nirgends angezeigt werden"). Das
  ist FALSCH. Nachgemessen ist `reason` ein maschinell zusammengesetzter Satz
  (`loadouts.js:221-223`):

  ```
  "Rolle Flächenwirkung — Wahl der Klasse scout"
  "Bewegungsmittel — Kür der Klasse scout"
  ```

  Er wiederholt lediglich `roleLabel` und den Klassennamen. Ihn anzuzeigen ergäbe
  doppelten Text („Flächenwirkung: Rolle Flächenwirkung — Wahl der Klasse
  scout"). Die Anzeige nutzt deshalb **Rolle + Waffe**; `reason` bleibt
  ungenutzt. Ein Test in `tests/onboarding-hilfe.test.js` hält das fest und
  schlägt fehl, sobald `reason` eines Tages eine echte Begründung wird — dann ist
  die Anzeige umzustellen.
- **Ein Warnhinweis auf die bekannte Kopplung**: Im laufenden Match sind nur drei der
  neun Kombinationen erreichbar (`index % 3`, siehe `match.js:432-433` und
  „Bekannte Grenzen"). Die Übersicht zeigt neun Kombinationen, das Spiel erzeugt drei —
  dieser Unterschied muss im Text stehen, sonst ist die Übersicht irreführend.

**Verworfener Teilvorschlag:** Die `inert`-Dimensionen (`drag`, `mass`, Tempo) als
Spielwerte darstellen. Sie wirken nicht — sie als Zahlen mit Balken zu zeigen wäre die
Lüge, die `classes.js` gerade vermeidet. Sie erscheinen maximal als **grau hinterlegter
Hinweis** („deklariert, derzeit ohne Wirkung") mit Verweis auf den offenen
Balance-Punkt. Das ist ehrlicher als Schweigen und ehrlicher als Anzeigen.

### A.3 Reiter „Loot und Seltenheiten"

Zeigt in Spielerprosa, was `LOOT_DROP_RULES` als Zahlen führt:

- **Kisten pro Rundenbeginn**: 10 % keine, 85 % eine, 5 % zwei (Prozente aus den
  Gewichten berechnet, nicht abgetippt — eine Quelle).
- **Inhalt**: 55 % Waffe, 30 % Nachschub (Heilung +25), 10 % leer, 5 % Falle (−18).
- **Seltenheiten** mit Farbcode aus `LOOT_DROP_RULES.rarityColors` und den Gewichten aus
  `RARITY_WEIGHTS` (`lootSystem.js`): standard/weiß → enhanced/blau → premium/violett →
  epic/gold.
- **Die Loot-Grenze**: Startwaffen sind nur `common`/`uncommon`/`rare`
  (`START_TIERS`, `loadouts.js`). Episch und legendär sind ausschließlich Loot. Das ist
  die zentrale Balancing-Aussage des Spiels und steht heute nirgends im Menü.
- **Der Sidegrade-Hinweis**: Platzhalter-Absatz, der auf B verweist („Abwurf und Wahl
  im Match ändern nicht die Stärke, sondern die Mittel").

### A.4 Wo die Inhalte herkommen (Architekturentscheidung)

**Regel:** Der Client rendert nur. Alle erklärenden Texte, die *Werte* beschreiben,
entstehen in `src/shared/config/` neben den Werten selbst — als zusätzliche
`beschreibung`-Felder, nicht als neue Datei.

Konkret anzuhängen (jeweils ein String-Feld, keine Logik):

- `classes.js`: je Klasse ein `erklaerung`-Feld in `CLASS_DEFINITIONS`, je Archetyp ein
  `erklaerung`-Feld in `CLASS_ARCHETYPES`.
- `terrainGen.js`: je Form ein `erklaerung`-Feld in `TERRAIN_PRESETS` (die Datei hat
  bereits beschreibende Kommentare je Form — sie werden zu Feldern).

Begründung: Es bleibt bei **„eine Regel, eine Stelle"**. Wenn die Übersicht den Faktor
`power 0,7` als Prosa beschreibt, dann muss dieser Satz bei der Änderung der Zahl
mitwandern. Ein `erklaerung`-Feld direkt neben der Zahl macht das offensichtlich und
prüfbar (`tests/source-boundaries.test.js` kann prüfen, dass keine Werte-Zahl im Client
als Literal steht). Eine separate `onboarding.js` würde dagegen genau die zweite Quelle
schaffen, die `classes.js` in seinem Kopf als Fehlerquelle beschreibt.

**Render-Ort:** `src/client/main.js` bekommt analog zu `buildRosterView()` eine Funktion
`buildHilfeView()`. Aufruf neben `buildRosterView()` (Z. 2217). Lazy wie dort: erst beim
`toggle` des `details` zeichnen, damit der Seitenstart nicht belastet wird.
DOM-Aufbau strikt über `document.createElement` (das Projekt nutzt kein
`innerHTML` — siehe `buildRosterView` und `hud.js`).

### A.5 Prüfung gegen die Qualitätsregeln

- 2D: unberührt (reine Anzeige).
- `Math.random()`: keiner.
- Client-Autorität: keiner — es werden nur Konstanten gelesen.
- Number-Bloat: keiner.
- Testbar ohne Browser: Die Ableitung („welche Sätze zeigt Reiter 2?") ist eine reine
  Funktion über `allCombatProfiles()` und `getClassLoadoutDetail()` und kann in
  `tests/class-profile.test.js` / `tests/class-loadout.test.js` geprüft werden —
  „es gibt keinen Sidegrade/Power-Wert, der im Client hartkodiert ist".

**Ergebnis A: umgesetzt.** Der Aufwandsschwerpunkt lag im Formulieren der
`erklaerung`-Felder, nicht im Code. Stand der Umsetzung:

- `erklaerung`-Felder ergänzt: `classes.js` (3 Klassen, 3 Archetypen),
  `terrainGen.js` (8 Formen).
- `uebersichtFuerHilfe()` in `classes.js` — die einzige Stelle, die Prosa und
  Werte zusammenführt. Der Client rendert nur.
- `buildHilfeView()` in `main.js` + Bereich `details#hilfe-browser` in
  `index.html` (drei Reiter: Klassen, Loot, Karte).
- Abgesichert: `tests/onboarding-hilfe.test.js` (10 Tests, ohne Browser) und
  `tests/e2e/hilfe.spec.mjs` (9 Tests im Browser, prüfen die Anzeige gegen die
  Configs).
- **Ein Befund wurde beim Umsetzen korrigiert** (siehe A.2, „Korrektur zum ersten
  Entwurf"): `reason` ist keine Begründung, sondern ein zusammengesetzter Satz.

---

## B) Sidegrades: datenorientiertes Trade-off-System

### B.1 Was ein Sidegrade in diesem Projekt sein muss

Das Spiel hat bereits eine Abwurf- und Aufheben-Mechanik mit `MAX_WEAPONS = 6`
(`src/engine/inventory.js`). Ein Sidegrade darf **keine siebte Ressource** daneben
stellen, sondern muss an genau dieser Entscheidung hängen: Man tauscht etwas Vorhandenes
gegen etwas anderes, gleichwertig, mit Nachteil.

Ein Sidegrade ist daher **kein Gegenstand, kein Upgrade, kein Kauf**, sondern eine
Modifikation des **wirkenden Kampfprofils** — verdrahtet an genau der Stelle, an der
`combatProfile()` heute gelesen wird.

### B.2 Datenstruktur

Neue Datei: **`src/shared/config/sidegrades.js`** (neben `classes.js`, `loadouts.js`).

```
SIDEGRADE_IDS = ['kompakt', 'schwerlast', 'duellist', ...]   // endliche, feste Liste
SIDEGRADES = Object.freeze({
  kompakt: Object.freeze({
    id: 'kompakt',
    label: 'Kompakter Verschluss',
    erklaerung: 'Schnellerer Abschuss, weniger Wucht — für Stellungswechsel.',
    // Modifikatoren: multiplikativ, bezogen auf das Basisprofil.
    modifiers: Object.freeze({
      healthMultiplier: 0.9,
      damageMultiplier: 0.85,
      launchSpeedMultiplier: 1.2,
    }),
  }),
  ...
})
```

Merkmale:

- **Rein deklarativ.** Kein Funktionsfeld, keine Callback, keine Zahl ohne Gegenwert.
  Jeder Eintrag hat mindestens einen Faktor `> 1` und einen `< 1` — das ist die
  Trade-off-Bedingung und wird per Test erzwungen (ein Eintrag mit ausschließlich
  Faktoren ≥ 1 ist ein Upgrade und wird abgelehnt).
- **Endliche Auswahl pro Klasse.** `SIDEGRADE_BY_CLASS = { scout: [...], heavy: [...],
  artillery: [...] }` — als reine Listen von IDs. Kein Zufall bei der Auswahl selbst.
- Zulässige Modifikationsachsen sind **zunächst nur die drei wirksamen**:
  `healthMultiplier`, `damageMultiplier`, `launchSpeedMultiplier`. Das hält den
  Angriffspunkt identisch mit dem heutigen und berührt keine Physik.

### B.3 Anwendung — genau ein Punkt

`combatProfile(classId, archetypeId)` bleibt die **einzige** Verrechnungsstelle. Es
bekommt einen **optionalen dritten Parameter**, der eine neue reine Funktion aufruft:

```
combatProfile(classId, archetypeId, sidegradeId = null)
```

Intern:

```
const base = { healthMultiplier, damageMultiplier, launchSpeedMultiplier }  // wie heute
const side = SIDEGRADES[sidegradeId]?.modifiers ?? null
// multiplikativ, mit unterer Grenze je Achse (siehe B.4)
```

**Warum als Parameter von `combatProfile` und nicht an den Aufrufstellen:** Es gibt
heute vier Lesestellen (`match.js:455` Leben, `:961` Schaden, `:1293` Hitscan-Schaden,
`:2025` Abschussvektor). Würde die Sidegrade-Rechnung an einer davon sitzen, entstünde
genau die Doppelregel, die die Datei ausdrücklich beseitigt hat. Ein Parameter erhält die
Eigenschaft „eine Regel, eine Stelle" und `tests/source-boundaries.test.js` kann sie
weiterhin prüfen.

**Auswahlentscheidung des Spielers:** Der Sidegrade wird **nicht** im Match gewechselt
(das wäre eine Änderung des laufenden Profils und damit eine Balance-Verschiebung
mitten im Spiel), sondern **im Menü beim Matchstart je Klasse festgelegt**. Der Server
ist autoritativ: Die Auswahl ist Teil der Match-Konfiguration, die der Server beim
`createMatch` erhält, und wird im Snapshot je Spieler mitgesendet (Erweiterung von
`getState()` um `sidegradeId`, dort steht `classId`/`archetypeId` bereits).
`src/shared/validation.js` prüft die ID gegen `SIDEGRADE_IDS` — eine unbekannte ID
fällt auf die Klasse ohne Sidegrade zurück (`null`), genau wie
`FALLBACK_CLASS_ID`/`FALLBACK_ARCHETYPE_ID` es heute tun.

### B.4 Determinismus und Replays — die kritische Prüfung

**Behauptung: Es entsteht kein `Math.random()` und keine Replay-Abweichung.**

Begründung, Punkt für Punkt:

1. Die Sidegrade-Wahl wird **vor** dem Matchbeginn getroffen und ist Teil der
   Match-Konfiguration. Sie ist damit — wie `preset`, `teams`, `maxRounds` — ein
   **Eingabewert**, der im Replay-Kopf mitläuft. `ReplayRecorder` speichert bereits
   `{ seed, teams, playersPerTeam, preset, maxRounds, turnDurationMs }`
   (`replay.js:46`); dort kommt `sidegrades` als Map `playerIndex → sidegradeId`
   hinzu. Das ist keine Zufallsquelle, sondern Konfiguration — dieselbe Kategorie wie
   `preset`.
2. Zur Laufzeit ist die Sidegrade-Rechnung **pur und zustandslos**: dieselben drei
   Eingaben ergeben dieselben drei Faktoren, auf jedem Rechner, zu jedem Tick. Damit
   erfüllt sie die Replay-Invariante (Punkt 5 der Prüfliste) ohne eigenen Seed-Stream.
3. `SEED_OFFSETS` bleibt unverändert. Ein neuer Offset wäre nur nötig, wenn ein
   **zufälliger** Sidegrade gezogen würde — das ist ausdrücklich **nicht** der Entwurf.
   Die Trennung der Zufallsströme (`LOOT`, `TERRAIN`, `WEAPONS`, `EFFECTS`, `GUENTHER`)
   wird nicht angetastet.
4. Multiplikative Verkettung in **fester Reihenfolge** (Klasse, dann Archetyp, dann
   Sidegrade) mit **durchgehendem `Math.fround`-Verzicht** wie im übrigen Motor —
   Gleitkommazahlen bleiben IEEE-754 deterministisch, solange die Operationsreihenfolge
   fest ist. Sie ist es: ein einziger Ausdruck in `combatProfile()`.

**Untergrenze je Achse (Schutz vor Entartung):** Jede Achse wird auf einen Minimalwert
begrenzt (Vorschlag: `0.5` für Leben und Schaden, `0.6` für Abschussgeschwindigkeit),
damit die Verkettung mehrerer ungünstiger Faktoren keine spielunfähige Figur (0 Leben
oder 0 Tempo) erzeugt. Die Grenze ist eine Konstante in `sidegrades.js`, kein
verstecktes `Math.max` an der Aufrufstelle.

### B.5 Verworfen: Sidegrades als Match-interne Loot-Gegenstände
**Vorschlag:** Eine Loot-Kiste liefert ein Sidegrade, das **während** des Matches das
Profil verändert (z. B. „+20 % Schaden für diese Runde").

**Verworfen, mit Begründung:**

- **Es wäre kein Sidegrade, sondern ein Buff.** Ein Trade-off über Zeit („jetzt stärker,
  dafür später schwächer") ist nicht über eine Kiste abbildbar, ohne dass Spieldauer
  und Effektlänge zu einer zweiten Regeldecke werden.
- **Number-Bloat-Gefahr (Regel 4).** Über Runden akkumulierte Profil-Modifikatoren sind
  genau die Progression, die die Regel „Keine Number-Bloat-Progression im Match"
  untersagt. Ein Match würde zu einem Aufsummieren von Prozenten statt zu einer
  taktischen Entscheidung.
- **Replay-Risiko.** Loot-Ziehung läuft über den `LOOT`-Stream. Ein Sidegrade an eine
  Kistenzahl zu koppeln würde die Anzahl der `LOOT`-Züge verändern und damit **alle
  nachfolgenden Kisten** in bestehenden Replays verschieben — ein Bruch der
  Reproduzierbarkeit für Altdaten.

  **Nachgemessen** (Seed 4242, je fünf Züge aus dem `LOOT`-Stream, mit und ohne
  eine eingeschobene Ziehung):

  ```
  ohne Zusatzziehung: 0.352705, 0.448522, 0.140174, 0.973870, 0.975849
  mit  Zusatzziehung: 0.448522, 0.140174, 0.973870, 0.975849, 0.670139
  ```

  Der gesamte Stream wandert um eine Position — nicht nur der eine Wert. Die
  Begründung ist damit belegt und nicht bloß plausibel.
- Der Match-interne Trade-off existiert bereits und ist gut: **Waffe wählen und
  abwerfen** (`MAX_WEAPONS`, `inventory.js`). Das Sidegrade soll diese Entscheidung
  ergänzen, nicht verdoppeln.

### B.6 Tests (neu)

- `sidegrades.test.js`:
  - Jeder Eintrag hat mindestens einen Faktor `> 1` und einen `< 1` (Trade-off-Bedingung).
  - Alle IDs sind in `SIDEGRADE_IDS` und jeder Klassenliste bekannt; keine Waise.
  - `combatProfile(c, a, s)` ist rein: zweimal aufgerufen → identisches Ergebnis.
  - Unbekannte Sidegrade-ID → Rückfall auf `null`, `onFallback` bleibt `false`
    (unbekannte **Klasse** setzt `onFallback`, unbekannte Sidegrade-ID ist tolerierbar).
- `replay.test.js` (Erweiterung): Match mit gesetzten Sidegrades → gleicher
  Zustandshash wie die Wiedergabe; und: Wiedergabe eines Replays **ohne**
  Sidegrade-Feld ergibt denselben Verlauf wie heute (Abwärtskompatibilität).

### B.7 Prüfung gegen die Qualitätsregeln

- 2D: unberührt — es werden nur drei skalare Faktoren multipliziert.
- `Math.random()`: keiner, auch nicht im Menü (Auswahl ist eine feste Liste).
- Client-Autorität: keiner — die Wahl kommt aus der Konfiguration, der Server validiert
  und rechnet.
- Number-Bloat: **durch den Entwurf ausgeschlossen** (fix, nicht akkumulierend; siehe
  B.5).
- Determinismus: gewährleistet (B.4), inkl. Abwärtskompatibilität.
- Eine Regel, eine Stelle: gewährleistet (`combatProfile()`).

**Ergebnis B: umgesetzt.** Die Implementierung folgt dem Entwurf; vier Punkte
sind beim Umsetzen dazugekommen und hier festgehalten:

- `src/shared/config/sidegrades.js` — vier Einträge, `SIDEGRADE_IDS`,
  `SIDEGRADE_BY_CLASS` (je Klasse zwei Angebote), `SIDEGRADE_FLOOR` (Untergrenze
  je Achse) und `sidegradesForClass()` für die Anzeige.
- `combatProfile(classId, archetypeId, sidegradeId = null)` — die einzige
  Verrechnungsstelle. **Vierte Lesestelle gefunden:** Der Entwurf nannte drei
  Lesestellen in `match.js`; dazu kommt `src/client/shotPrediction.js`. Sie
  musste mitgezogen werden, sonst hätte die Schussvorhersage eine Bahn gezeigt,
  die der Server anders rechnet — genau der Fehler, der dort schon einmal war.
- `MatchController({ sidegrades })` — Liste je Spielerplatz, am Spieler-Objekt
  geführt (`player.sidegradeId`) und im `getState()` übertragen, damit die
  Anzeige nicht raten muss.
- Lobby/Server: Validierung in `lobby.js` (unbekannte Kennung → `null`, tolerant),
  Durchreichen in `gameServer.js`, Sidegrades im Replay-Kopf.
- Auswahl im Menü **je Klasse** statt je Platz: Das Menü kennt die
  Platzvergabe (`index % 3`) nicht; die Feldwerte werden nach der Regel des
  Motors auf Plätze abgebildet.

**Fund beim Umsetzen:** Die Kennung fehlte zunächst am Spieler-Objekt — das
LEBEN stimmte trotzdem, weil `#spawnPlayers` das Profil korrekt bildete. Ein
Test, der nur `combatProfile()` prüft, hätte das nicht bemerkt;
`tests/sidegrades-match.test.js` prüft den Weg ins Spiel.

---

## C) Counterplay und Map-Synergie

### C.1 Leitentscheidung: keine versteckten Multiplikatoren

**Counterplay wird in diesem Entwurf als SICHTBARE, spielergesteuerte Beziehung
modelliert, nicht als automatischer Schadensbonus im Motor.**

Ein automatischer „Klasse X gegen Klasse Y = +20 % Schaden" wäre:

- **Number-Bloat im Match** (Regel 4) — eine zweite, unsichtbare Modifikationsebene
  über dem Klassenprofil.
- **Nicht lernbar** — der Spieler erlebt einen Schaden, den er nicht erklären kann.
  Counterplay funktioniert nur, wenn die Beziehung **erklärt und vorhersehbar** ist.

Die Beziehung wird deshalb in drei Teilen verwirklicht, von denen **nur der dritte**
den Motor berührt — und der dritte ist **datengestützt, nicht zufällig**.

### C.2 Teil 1 — Counterplay als Anzeige und Lehre (reine Client-Ebene)

Erweiterung des Kader-Dialogs (`buildRosterView`) und der Klassenübersicht (A):

- Jeder Charakter zeigt bereits `strengths`/`weaknesses` (`factions.js`). Diese Felder
  werden zu **„stark gegen" / „schwach gegen"** um eine abgeleitete Zeile ergänzt:
  Die Zuordnung ergibt sich **rechnerisch** aus `SLOT_CLASSES` und `COMBAT_ROLES` —
  es wird nichts Neues erfunden, nur die vorhandene Dreierstruktur lesbar gemacht.

Beispiel (abgeleitet, nicht getippt):
> Heavy (robust, langsam) ist stark gegen Artillerie (starker, zerbrechlicher Schuss),
> weil er einen Treffer übersteht und zurückschlagen kann; schwach gegen Scout
> (beweglich), weil er dessen Stellungswechsel nicht mitgeht.

- Der HUD erhält beim Zugbeginn **eine Zeile „Was der Gegner kann"** aus den bereits im
  Snapshot enthaltenen Feldern `classId`/`archetypeId` des Gegners (`getState()`), plus
  dessen `sidegradeId`. Kein neues Drahtfeld nötig außer `sidegradeId`.
- **Wichtig:** Diese Anzeige ist die einzige Form, in der Counterplay im Spiel
  „stattfindet". Sie erzeugt keinerlei Regel im Motor. Damit ist sie garantiert
  deterministisch und ohne Client-Autorität.

### C.3 Teil 2 — Teamzusammenstellung: eine Regel, eine Stelle

Der Spieler soll Klassen **sehen und wählen** können. Entwurfsentscheidung:

- **Der Menüpunkt „Teams" bekommt eine Klassen-Vorschau** (welche Klassen sitzen in
  welchem Team). Heute ist die Zuteilung `index % CLASS_IDS.length` (`match.js:432`)
  und für den Spieler nicht einsehbar.
- **Optional, aber empfohlen:** eine Klassen-Wahl je Spieler-Slot vor dem Matchstart
  (Struktur wie `cfg-teams`/`cfg-players` in `index.html`). Sie wird als Teil der
  Match-Konfiguration an den Server übergeben und dort gegen `CLASS_IDS` validiert
  (wie die Sidegrade-ID). Die bestehende `index % 3`-Zuteilung wird damit nur der
  **Rückfall**, wenn keine Wahl getroffen wurde — die Zahlungsweise des Determinismus
  bleibt unverändert, weil die Wahl Teil der Konfiguration ist (dieselbe Begründung wie
  B.4).
- **Keine Pflicht-Teamregel.** „Counterplay" als **Vorschrift** („ein Team braucht
  immer einen Scout") wäre eine Zwangsregel, die den 2D-Taktikkern beschneidet und
  Wahlen unnötig macht. Die Zusammensetzung ist eine **Entscheidung mit sichtbaren
  Folgen**, keine Regel.

### C.4 Teil 3 — Map-Synergie: die einzige motorrelevante Regel

Hier darf der Motor etwas tun, weil es **terrainabhängig, deterministisch und sichtbar**
ist. Zwei Varianten wurden geprüft; der Entwurf wählt **die schwächere, belegbare**.

#### Variante A (gewählt): Geländeform als sichtbare Klassengunst, im Menü dokumentiert

Die acht Formen aus `TERRAIN_PRESETS` (`hills`, `mountains`, `islands`, `caverns`,
`open`, `spires`, `flooded`, `warren`) haben bereits **gemessene Kennzahlen**
(`tests/terrain-presets.test.js`). Der Entwurf ordnet jeder Form eine **Haupt- und eine
Nebenklasse** zu, rein deklarativ:

```
// in terrainGen.js, neben TERRAIN_PRESETS
TERRAIN_AFFINITY = Object.freeze({
  open:      { favorisiert: 'artillery', begruendung: 'weite Sichtlinien, volle Reichweite' },
  spires:    { favorisiert: 'scout',     begruendung: 'Höhen und Vertikale, Stellungswechsel' },
  warren:    { favorisiert: 'scout',     begruendung: 'Deckung auf kurze Distanz' },
  flooded:   { favorisiert: 'scout',     begruendung: 'Bewegungsmittel im Wasser' },
  caverns:   { favorisiert: 'heavy',     begruendung: 'enge, gedeckte Räume' },
  islands:   { favorisiert: 'artillery', begruendung: 'weite Distanzen über Wasser' },
  mountains: { favorisiert: 'artillery', begruendung: 'große Höhenunterschiede' },
  hills:     { favorisiert: 'heavy',     begruendung: 'gemischt, Deckung vorhanden' },
})
```

**Diese Zuordnung erzeugt KEINEN Multiplikator.** Sie ist reine Anzeige: Im Menü wird
zur gewählten Karte angezeigt, welche Klasse hier ihre Stärke besonders ausspielen kann —
und in der Match-Tabelle am Ende steht, ob das zutraf. Der Spieler lernt die Synergie
durch Auswahl, nicht durch versteckte Rechnung.

**Warum nicht mehr:** Ein tatsächlicher Schadens- oder Reichweitenbonus je
Karte/Klasse hätte mehrere Folgekosten, die in keinem Verhältnis zum Nutzen stehen:

- Er müsste im Replay überprüfbar sein — ist er auch, aber nur, weil die Karte aus dem
  Seed feststeht; ein Bonus würde **bestehende Balance-Messungen**
  (`scripts/balance-report.mjs`) invalidieren, da diese nicht nach Karte trennen.
- Er verdoppelte die Zahl der zu prüfenden Profilkombinationen von 3 (heute erzeugt) ×
  8 Karten auf 24 Fälle — mit den neun möglichen Kombinationen sogar 72. Das Projekt
  hat den Klassen-Balance-Punkt ausdrücklich als **offen** markiert
  („Bekannte Grenzen"); eine zweite Achse darüber zu legen, bevor die erste balanciert
  ist, verschiebt das Problem nur.

#### Variante B (verworfen): Terrain-Modifikatoren im Motor

**Vorschlag:** `flooded` gibt Wasser-Waffen +X % Wirkung, `caverns` halbiert
Projektil-Reichweite, `spires` begünstigt Steilfeuer.

**Verworfen, mit Begründung:**

- **Balance-Kosten ohne Deckung.** Es gibt heute keinen Test, der die Kombination
  Klasse × Karte × Waffe prüft. Solche Modifikatoren einzuführen hieße, Regeln ohne
  Prüfnetz in den Motor zu setzen — das Gegenteil der Projektdoktrin, die jede
  Regel mit einem Test festnagelt (`tests/terrain-presets.test.js`,
  `tests/class-profile.test.js` als Vorbilder).
- **Determinismus ist zu wahren, aber teuer.** Zulässig wäre es (die Karte kommt aus dem
  `TERRAIN`-Stream, nicht aus Zufall), aber es müsste exakt in `combatProfile()`
  verrechnet werden — und `combatProfile()` müsste die Karte kennen. Damit würde eine
  **Motor-Funktion ihre Signatur ändern**, und zwar an vier Aufrufstellen gleichzeitig.
  Das ist machbar (vgl. B.3), aber es ist eine Balance-Entscheidung, keine
  Design-Entscheidung — und der Auftrag ist, den Balance-Punkt nicht nebenbei zu
  erledigen. `classes.js` formuliert genau diese Regel für den Archetyp-Schaden.

**Ergebnis C: umgesetzt — mit einem Befund, der den Entwurf an einer Stelle
korrigiert.**

Umgesetzt:
- `TERRAIN_AFFINITY` in `terrainGen.js` — reine Anzeige, je Form die begünstigte
  Klasse. Ein Test hält fest, dass der Motor sie nicht liest.
- `classCounterplay()` in `classes.js` — leitet die Beziehung aus den wirksamen
  Achsen ab.
- Anzeige: Zeile unter der Kartenwahl (wandert beim Wechsel mit), Counterplay-
  Zeile im Kader, eigener Hilfe-Reiter.

**Korrektur am Entwurf (belegt):** C.2 nahm an, die Zuordnung ergebe sich
„rechnerisch aus `SLOT_CLASSES` und `COMBAT_ROLES`". Das ist nicht der Fall —
diese Tabellen ordnen Charaktere Platz und Kampfweise zu, aber keine KLASSEN
einander. Die Beziehung wird deshalb aus `combatProfile()` abgeleitet (Leben,
Wucht, Reichweite), weil das die Werte sind, die der Motor tatsächlich liest.

**Zweiter Befund — größer als dieser Punkt, inzwischen BEHOBEN:** Der Entwurf
beschrieb eine Schere-Stein-Papier-Beziehung. Gemessen war es eine
**Rangfolge**: Der Scout war auf allen drei wirksamen Achsen der Schwächste,
weil sein `speed`-Wert (1.2) unter `inert` stand — seine Beweglichkeit existierte
nur auf dem Papier.

**Die Behebung** (auf Entscheidung des Auftraggebers): `speed` wirkt jetzt auf
den Absprung (`match.js`, `#mobilityFactor`, getrennt gedämpft). Gemessen
springt der Scout 116,9 px gegen 86,6 px (Heavy) und 82,0 px (Artillery) — unter
der hills-Amplitude von rund 151 px, die Karte bleibt also intakt. Die
Beweglichkeit steht als `mobilityMultiplier` im Kampfprofil und wird in der
Counterplay-Anzeige als eigene Achse mitgezählt. Siehe MASTERDOTO.md,
„Bekannte Grenzen", und `tests/mobility.test.js`.

Der Scout hat damit eine **Stärke**, aber weiterhin keinen **Netto-Vorteil**
(er verliert auf drei Achsen). `starkGegen` bleibt für ihn `null` — die Anzeige
erfindet nichts dazu und verschweigt die neue Stärke auch nicht.

**Die verworfene Variante B bleibt verworfen** — die Begründung (Balance-
Messungen ohne Kartentrennung, 24 statt 3 zu prüfende Kombinationen, kein
Testnetz) ist beim Umsetzen bestätigt worden.

### C.5 Tests (neu)

- `counterplay.test.js`:
  - Jede der acht Formen aus `TERRAIN_PRESETS` hat einen `TERRAIN_AFFINITY`-Eintrag;
    jeder favorisierte Wert ist eine ID aus `CLASS_IDS`. Keine Waise, keine Lücke.
  - Die abgeleitete „stark gegen / schwach gegen"-Zeile ist eine **reine Funktion**
    über `SLOT_CLASSES`/`COMBAT_ROLES` und für jede Kombination definiert.
- `terrain-presets.test.js` (Erweiterung): Die Affinität steht in **Übereinstimmung**
  mit den gemessenen Kennzahlen — z. B. `open` hat die höchste Schusslinien-Offenheit und
  ist der Artillerie zugeordnet. Damit ist die Zuordnung nicht Behauptung, sondern belegt.
- `headless-terrain.test.js` (Erweiterung): Ein Match je Form mit fester
  Klassenzuteilung → die Match-Tabelle nennt die favorisierte Klasse; der
  Determinismus-Hash bleibt über einen erneuten Lauf identisch.

### C.6 Prüfung gegen die Qualitätsregeln

- 2D: unberührt (keine Höhe, keine dritte Achse).
- `Math.random()`: keiner.
- Client-Autorität: keiner — die Klassen-/Sidegrade-Wahl ist Konfiguration, der Server
  validiert; die Affinität ist Anzeige.
- Number-Bloat: keiner — bewusst keine Multiplikatorenebene.
- Determinismus: unberührt (nichts Zufälliges kommt hinzu).

---

## 2. Zusammenfassung der Entscheidungen

| Punkt | Entscheidung | Berührte Dateien |
|---|---|---|
| A Onboarding | Vier-Reiter-Übersicht im Menü, Inhalte **abgeleitet** aus bestehenden Configs; `erklaerung`-Felder neben den Werten statt zweiter Quelle | `classes.js`, `terrainGen.js` (+`erklaerung`), `main.js` (`buildHilfeView`), `index.html` |
| B Sidegrades | Datenorientiert, **fix je Match**, ein optionaler Parameter in `combatProfile()`, multiplikativ verkettet, mit Achsen-Untergrenze; **verworfen:** zufälliger Loot-Sidegrade | neu: `src/shared/config/sidegrades.js`; `classes.js`, `replay.js`, `validation.js`, `match.js` (`getState`) |
| C Counterplay | Sichtbare Beziehung durch Anzeige + Klassenwahl; Map-Synergie als **deklarative Affinität ohne Multiplikator**; **verworfen:** Terrain-Bonus im Motor | neu: `tests/counterplay.test.js`; `factions.js`/`terrainGen.js` (+`TERRAIN_AFFINITY`), `main.js`, `hud.js` |

**Gemeinsamer roter Faden:** Alle drei Punkte werden dort verwirklicht, wo sie den
Determinismus und die Balance-Messbarkeit nicht berühren. Wo ein Vorschlag eine echte
Motorregel gebraucht hätte (Loot-Sidegrade, Terrain-Bonus), wird er **mit Begründung
verworfen**, statt eine Regel zu brechen, die das Projekt mit Tests festhält.

## 3. Empfohlene Umsetzungsreihenfolge

1. **A** (reine Anzeige, sofort nützlich, keine Risiken) — legt die Sprach- und
   Datenfelder an, die B und C mittragen.
2. **B** (Regeln mit festem Datenmodell, abwärtskompatibel) — braucht die
   Anzeige aus A, um erklärbar zu sein.
3. **C** (Beziehungen) — setzt auf den IDs und Anzeigen aus A und B auf.

## 4. Was ausdrücklich NICHT in diesem Entwurf steht

- Kein Produktivcode, keine Dateiänderung außer diesem Dokument.
- Keine Balance-Änderung an den bestehenden Tabellen (`ARCHETYPE_LAUNCH_BASE = 1.2`,
  unwirksame `inert`-Dimensionen, Kopplung `index % 3`). Diese offenen Punkte bleiben
  offen und sind hier nur als **Anzeige-Hinweise** berücksichtigt.
- Kein neuer Seed-Offset. `SEED_OFFSETS` bleibt unverändert; der Entwurf braucht keinen,
  weil nichts Zufälliges hinzukommt.
