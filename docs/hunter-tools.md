# Hunter #1 — Tools, MCP, Build-Infrastruktur (Befundbericht)

**Rolle:** Hunter-Agent #1 — Tools, Plugins, Build-Infrastruktur, Pipeline, Routing, MCP-Server
**Stand:** 2026-09-27 · **Commit:** `4c42470` (Branch `main`) · **Node:** `v22.23.2`
**Methode:** Jedes `audit_*`-Werkzeug frisch per CLI (`node tools/audit-mcp/server.mjs --ruf audit_X`) gestartet UND gegen den **laufenden** MCP-Server (`mcp__audit__audit_X`) gestellt; zusätzlich `npm run checks` und `npm run matrix:check`-Pfad gelesen/gefahren. Jede Aussage unten trägt eine Fundstelle `datei:zeile` ODER eine Messzahl aus diesem Lauf.

**Schreibzugriff:** nur diese Datei. (`audit_bericht` wurde ausgeführt mit `pfad=/tmp/hunter-bericht.md`, damit `docs/audit-tief.md` unberührt bleibt.)

---

## 0. Kurzfazit

| Frage | Antwort |
|---|---|
| **1. Unterscheiden MCP und CLI im Wissenstand?** | **JA — und der Unterschied ist diesmal live reproduzierbar.** Der laufende MCP-Server meldet die Welt **vor** seinen eigenen Reparaturen (`audit_events`: 27 „undokumentiert" per MCP vs. 0 per CLI). Zusätzlich ist sein *Rückgabe-Schema* älter als der Code auf der Platte. |
| **2. Ausführbare/dokumentierte Skripte?** | **0 von 42 `.mjs` sind ausführbar** (nur 4 `.sh`). **15 Skriptdateien** sind weder an ein npm-Skript gebunden noch in der Doku referenziert; die README dokumentiert **3 von 51** Skriptdateien. |
| **3. Still scheiternde Pipeline-Schritte?** | **Ja, mehrere.** U. a. ist die Kennzahlen-Auswertung des `checks`-Gates in `gates.mjs` dauerhaft leer (Regex passt nicht zur Ausgabe), und der Statik-Detektor für „schreibt beim Import" wird von einem **Kommentar** gesteuert. |
| **4. Robustheit `npm run checks`?** | Der Lauf selbst ist **grün** (21 Gates, 48,8 s, 0 Verstöße) — aber die Batterie ist **nicht isoliert** (ein ungetrackter Hunter-Probe-`*.mjs` macht `npm run lint` rot) und **prüft sich selbst nicht** (Kopfdaten-Zahlen 19/20 vs. 21). |

---

## 1. MCP vs. CLI — die „eingefrorene Sicht" (Befund H1-01, kritisch)

Die README beschreibt die Falle bereits selbst (`tools/audit-mcp/README.md:105-134`): *„Ein laufender MCP-Server ist eine EINGEFRORENE Sicht auf seinen eigenen Code."* **Dieser Lauf reproduziert sie exakt.**

### 1.1 `audit_events` — 27 vs. 0

| Quelle | gesamt | gedeckt | stumm | undokumentiert | Urteil |
|---|---|---|---|---|---|
| **MCP** (laufender Prozess) | 43 | 6 | 37 | **27** | „27 stumme Ereignisse sind NICHT dokumentiert: crate_pickup, death, …" |
| **CLI** (frisch) | 47 | 39 | 8 | **0** | „Alle 8 stummen Ereignisse sind im Wächter mit Begründung gelistet … — keine Lücke." |

Der MCP-Prozess lädt noch den **Alten Detektor** (`lib/statisch.mjs` vor der zweiten Belegstufe für unquotierte Tabellenschlüssel). Die 27 „Befunde" sind ein Artefakt des Prozesses, kein Produktmangel — genau wie in `README.md:110-122` dokumentiert.

**Zweiter, härterer Beleg — das Rückgabe-Schema ist ebenfalls alt:**
- MCP `audit_events.stummDokumentiert` = **Liste von Zeichenketten** (`["crate_landed", …]`).
- CLI `audit_events.stummDokumentiert` = **Liste von Objekten** (`[{ereignis, begruendung}]`).
- MCP liefert **kein** `gedecktNurSchluessel` und **kein** `stummListeOhneBegruendung` — beide Felder stehen in `server.mjs:233, 236`.

Der laufende Prozess führt also eine **ältere `server.mjs`** aus, nicht nur eine ältere `statisch.mjs`.

### 1.2 `audit_status` — Gate-Beschreibung eingefroren

- MCP: `test:e2e` → „Echter Browser, echte Interaktion **(27 Dateien)**"
- CLI: `test:e2e` → „Echter Browser, echte Interaktion **(28 Dateien)**"

Quelle der Zeichenkette: `tools/audit-mcp/lib/gates.mjs:27` (auf der Platte **28**). Der MCP-Prozess wurde gestartet, **bevor** die Datei von 27 auf 28 geändert wurde — bestätigt durch `git log`-Einträge `0d571d8` („veraltete E2E-Dateizahl 27 -> 28 in sieben Stellen") und `52b3bad` („Testdateizahl 102 -> 103 — check:docs war ROT").

### 1.3 `audit_deadcode` — Schema-Divergenz

- MCP `doppelregeln` = `{anzahl, liste}`
- CLI `doppelregeln` = `{anzahl, begruendet, offen, quelle, liste}` (ergänzt in `server.mjs:209-216`)

### 1.4 Was **nicht** abwich (Gegenprobe)

`audit_paths` (44 richtig / 0 falsch), `audit_secrets` (0), `audit_nondeterminism` (1 im Sim-Pfad, 3 außerhalb) lieferten MCP **und** CLI identisch. Divergenz tritt also nur dort auf, wo der Code seit dem Serverstart geändert wurde — die Falle ist **zustandsabhängig**, nicht systematisch.

### 1.5 Werkzeugfalle, destilliert

> **Jede MCP-Aussage über den eigenen Code ist ein Zeitpunkt, kein Zustand.** Vor jedem Befund gegen einen frischen CLI-Lauf stellen:
> `node tools/audit-mcp/server.mjs --ruf audit_X`
> Die Falle ist besonders tückisch, weil der alte Prozess **dieselbe Oberfläche** und **dieselbe Selbstsicherheit** zeigt („27 … sind NICHT dokumentiert"). Ein Befund ohne frische Gegenprobe ist ungültig.

---

## 2. Skripte: Ausführbarkeit und Dokumentation

### 2.1 Ausführbar (executable bit)

- **`0` von 42 `scripts/*.mjs` sind ausführbar** (kein `+x`), obwohl `server.mjs` u. a. einen `#!/usr/bin/env node`-Shebang tragen. Aufruf erfolgt ausschließlich über `node scripts/…` bzw. `npm run …` — funktioniert, aber der Shebang ist irreführend.
- **4 `.sh` sind ausführbar:** `scripts/create_weapon_icons.sh`, `scripts/create_placeholder_sheets.sh`, `scripts/betrieb/server-start.sh`, `scripts/betrieb/idle-watch.sh`.
- **Nicht ausführbar (obwohl `.sh`):** `scripts/create_weapon_aim_sheet.sh` (`-rw-rw-r--`).

### 2.2 An npm-Skript gebunden?

`package.json` hat **52** Skripte; **36** der **51** Skriptdateien werden daraus referenziert. **15 sind an kein npm-Skript gebunden:**

```
build_weapon_metadata.cjs     build_weapon_metadata.js
check-hoehlensicht.mjs        compare-terrain.mjs
create_placeholder_sheets.sh  create_weapon_aim_sheet.sh
create_weapon_icons.sh        extract_factions.py
fetch-backdrops.py            measure-npc.mjs
measure-terrain.mjs           namen.py
screenshot.mjs                verify-explosion-render.mjs
verify-render.mjs
```

### 2.3 Dokumentiert?

- `README.md:297-300` dokumentiert unter `scripts/` genau **drei** Einträge (`server.mjs`, `smoke-match.mjs`, `verify-render.mjs`) — bei 51 Skriptdateien.
- Nur **selbst** dokumentiert (Kopfkommentar, keine Referenz in `package.json`/`docs/`): `compare-terrain.mjs`, `measure-terrain.mjs`, `check-hoehlensicht.mjs`, `screenshot.mjs`, `create_weapon_aim_sheet.sh`.
- **Vollständig vaterlos:** `build_weapon_metadata.cjs` und `build_weapon_metadata.js` — **null** Referenzen im ganzen Repo (auch nicht in Doku). Legacy vom 2026-09-08, abgelöst von `build-weapon-catalog.mjs`.
- Nebenbei dokumentiert: `extract_factions.py`, `namen.py`, `fetch-backdrops.py` (`README.md:59,70-76`); `measure-npc.mjs` (`MASTERDOTO.md:766`); `verify-explosion-render.mjs` (`MASTERDOTO.md:2503`).

### 2.4 Scope-Lücke des Audit-Tools (Befund H1-05)

`audit_deadcode` findet tote **Dateien** nur unter `src/`:
- `statisch.mjs:33-35` → `quellDateien()` = `walk(ROOT/src)`
- `statisch.mjs:78` → `toteDateien()` nutzt nur `quellDateien()`
- `statisch.mjs:108, 161, 204-205, 342` → `unbenutzteExporte`, `unbenutzteKonstanten`, `doppelregeln`, `marker` alle mit `nurUnter='src/'`

**Folge:** Die 15 ungebundenen Skripte und die zwei vaterlosen `build_weapon_metadata.*` sind für die Statik-Sonde **unsichtbar**. Kein Gate meldet ein totes Skript. (Gegenbeispiel: `pfadAufloesung()` scannt `projektDateien()` = ganzes Repo, `statisch.mjs:458` — die Scope-Grenze ist also inkonsistent über die Sonden hinweg.)

---

## 3. Pipeline-Risiken — was still scheitern kann

### 3.1 `gates.mjs` → `checks`-Gate: Kennzahlen dauerhaft leer (Befund H1-02, hoch)

`gates.mjs:58-63` liest die Kennzahlen des `checks`-Gates mit:
```js
/^\\s*(?:OK|FEHLGESCHLAGEN|✓|✗)/gm            // „zeilen"
/\\S+\\s+FEHLGESCHLAGEN|FEHLGESCHLAGEN\\s+(\\S+)/g // „fehlgeschlagen"
```
`scripts/checks.mjs:81-82` druckt aber `ok  ` bzw. `FEHL` (und im Fehlerfall „Ausgabe der fehlgeschlagenen Gates:"):
```js
const marke = exit === 0 ? 'ok  ' : 'FEHL';
console.log(`${marke} ${gate.skript.padEnd(22)} …`);
```
**Messung (dieser Lauf):** beide Regexe gegen die echte `checks.mjs`-Ausgabe → **0 Treffer**. Die `kennzahlen` des `checks`-Gates sind also **immer leer** — die Zahl „fehlgeschlagen" wird nirgends gelesen. *Kein* Fehlalarm (Exit-Code zählt weiter), aber eine **stille Blindstelle**: der Gate-Bericht suggeriert eine Auswertung, die es nicht gibt.

Zum Vergleich: die Auswertung der Gates `test` (`^# pass`/`^# fail`) und `smoke:fast` (`Rauchtest: N von M … in … s`) **passt** — verifiziert: der Spec-Reporter gibt tatsächlich `# pass 18` aus, `scripts/smoke-fast.mjs:246-247` druckt exakt die erwartete Zeile. Die Blindstelle ist **nur** das `checks`-Gate.

### 3.2 Detektor „schreibt beim Import" wird von einem **Kommentar** gesteuert (Befund H1-03, hoch)

`statisch.mjs:717-719`:
```js
schreibtBeimImport: genText
  ? !/if\\s*\\(\\s*import\\.meta\\.main|process\\.argv\\[1\\]/.test(genText)
  : false,
```
Gemessen wird per Textsuche nach `if (import.meta.main` **oder** `process.argv[1]`. In `scripts/build-weapon-catalog.mjs` steht beides nur **in Kommentaren**:
- `build-weapon-catalog.mjs:1437` → `` * … Ein Guard der Form `if (import.meta.main)` wuerde dort NIE `` (Kommentar!)
- `build-weapon-catalog.mjs:1449` → `` * `process.argv[1]` mit `fileURLToPath(import.meta.url)` … `` (Kommentar!)

Der **echte** Guard ist `build-weapon-catalog.mjs:1453`: `const alsProgrammAufgerufen = import.meta.main !== false;` (Schreibvorgang `:1455-1457`).

**Folge:** `audit_deadcode` meldet `schreibtBeimImport: false` — aber **zufällig richtig**: es hat den Kommentar getroffen, nicht den Guard. Wird Zeile 1437 umformuliert, kippt die Aussage auf `true` (Fehlalarm), obwohl der Code unverändert korrekt ist. Das ist exakt die im **eigenen** MCP beschriebene Lektion („Kommentarzeilen sind keine Treffer", `README.md:67-70`) — hier aber **nicht** angewandt: `generierteDateien()` benutzt den Kommentarfilter `istAusgefuehrterCode()` (der in `pfadAufloesung()`, `statisch.mjs:463`, sehr wohl greift) nicht. Zusätzlich widerspricht `statisch.mjs:699-701` (Kommentar: „`weapons.js` wird beim IMPORT geschrieben") der eigenen Messung.

### 3.3 `matrix`-Skript schreibt, `matrix:check` prüft — Kopplung an eine Doku-Datei

`scripts/build-matrix.mjs:317` liest `--check`, `:325,330` setzen `process.exitCode = 1` bei Abweichung, `:335` schreibt die Datei sonst. `check-docs.mjs:38` liest `docs/matrix-terrain-waffen-wirkung.md` als **Pflichtquelle**; fehlt sie, wirft `readFileSync` (fail-loud, akzeptabel). Sauber gebaut — aber die Matrix ist ein **generiertes Doc**, das nicht in `.gitignore` steht (kein `--check`-Gate für „Doku vs. Code" außerhalb `matrix:check`).

### 3.4 Keine Isolierung — parallele Hunter brechen die Gate-Batterie (Befund H1-04, mittel)

`npm run lint` = `eslint .` über das **ganze Arbeitsverzeichnis** inkl. ungetrackter Dateien. In diesem Lauf ist `lint` **ROT** wegen `probe-hunter5.mjs` (ein Scratch-File eines parallel arbeitenden Hunters):
```
probe-hunter5.mjs
   3:32  error  'materialAmPunkt' is defined but never used …
   5:10  error  'TERRAIN_MATERIALS' is defined but never used …
  29:5   error  'nachherBitmap' is never reassigned. Use 'const' instead
✖ 3 problems (3 errors, 0 warnings)
```
`probe-hunter5*.mjs` sind **nicht** gitignoriert (`git check-ignore … → NOT ignored`), tauchen als `??` in `git status` auf und wandern damit in jede Lint-/Status-Auswertung. In der CI (sauberer Checkout) tritt das nicht auf — **lokal** aber verschiebt es die Ampel (siehe `audit_all`: `gates → rot: lint`).

### 3.5 CI deckt nicht alle Gates ab

`.github/workflows/ci.yml` fährt: `lint` (:26), `npm run checks` (:37), `npm test` (:40), `build` (:43), `npm run perf --ticks=12000` (:58), `test:e2e` (:81). **Nicht** in der CI: `validate`, `smoke:fast`, `balance` (existieren als Gates in `gates.mjs:20,25,26`, laufen aber nirgends automatisch). `smoke:fast` ist ausdrücklich der „schnelle Rückkopplungszyklus" — er hängt allein an der Disziplin des Aufrufers.

### 3.6 `checks.mjs` liest den Startfehler nicht aus

`checks.mjs:67-72` nutzt `spawnSync('npm', …)` und liest nur `lauf.status ?? 1`; `lauf.error` (z. B. ENOENT bei fehlendem `npm`) wird nicht geprüft. Fehlt `npm`, erscheint „FEHL … (keine Ausgabe)" (`:92`) statt der eigentlichen Ursache. Laut genug, um nicht zu übersehen — aber diagnostisch arm. (Vergleiche `lib/repo.mjs:74-81`, wo `run()` den Fehler sauber in `abgebrochen`/`fehler` führt.)

---

## 4. Robustheit von `npm run checks`

**Messung (dieser Lauf):** `21 Gates in 48.8 s | fehlgeschlagen: 0` — alle 21 Gates `ok`, inkl. der langsamen `check:erreichbarkeit` (22,8 s), `check:time` (6,8 s), `check:maelstrom` (4,0 s).

| Aspekt | Bewertung |
|---|---|
| Exit-Code-Kopplung | **Solide.** `checks.mjs:88-95` setzt `process.exitCode = 1`, sobald ein Gate ≠ 0. Jedes Gate hat eigenen Exit-Code. |
| Vollständigkeit | **Gut.** `checks.mjs:33-55` listet **21** Gates; die 21 `check:*`/`matrix:check`/`balance:classes`-Skripte in `package.json` sind **alle** enthalten — kein verwaistes Prüfskript. |
| Zeitbudget | 48,8 s lokal; `--schnell` (`:57-58`) überspringt 4 lange Gates (`check:erreichbarkeit`, `check:time`, `check:maelstrom`, `check:autonom`). CI fährt die **volle** Batterie. |
| Selbstauskunft | **Schwach.** Der Kopfkommentar `checks.mjs:7` sagt „**19** Prüfwerkzeuge", die Batterie hat **21**. `ci.yml:28` schreibt ebenfalls „**19**". Nicht geprüft (siehe H1-06). |
| Kennzahlen-Weitergabe an `gates.mjs` | **Defekt** (H1-02): `fehlgeschlagen`/`zeilen` bleiben leer. |

**Fazit:** Als Gate **verlässlich** (Exit-Code-basiert, vollständig, schnell genug). Als **selbstbeschreibendes** Werkzeug **nicht** robust: Kommentar-Stand (19) und tatsächliche Batterie (21) laufen auseinander, und die Kennzahlen-Weiterverarbeitung ist eine Blindstelle.

---

## 5. Versionierungslücken (Zahl-Drift)

| Nr | Ort | Behauptung | Wirklichkeit | Beleg |
|---|---|---|---|---|
| V1 | `tools/audit-mcp/README.md:11` | „**55** Prüffragen aus **zehn** Regelwerken" | **59** Fragen aus **9** Regelwerken (kein Eintrag mit Quelle `dogfood`) | `--ruf audit_checklist` → `anzahl: 59`; `quellen` listet 9 |
| V2 | `tools/audit-mcp/README.md` Werkzeug-Tabelle (Z. 36-55) | **18** Zeilen | **19** Werkzeuge — **`audit_paths` fehlt** in der Tabelle | `node … --liste` listet 19; Tabelle springt `audit_nondeterminism` → `audit_checklist` |
| V3 | `checks.mjs:7` und `ci.yml:28` | „**19** Prüfwerkzeuge" | **21** (`GATES.length`) | `checks.mjs:33-55` |
| V4 | `gates.mjs:5` / `gates.mjs:21` / `server.mjs:7` | „19 Prüfwerk-"/„Alle **20** Prüfwerkzeuge"/„Das Projekt hat **20** Prüfwerkzeuge" | 21 Prüfwerkzeuge; 9 Gates in `gates.mjs` | `checks.mjs` = 21, `gates.mjs:18-28` = 9 |
| V5 | `server.mjs:42` | `const VERSION = '1.0.0'` | `package.json` sagt `"version": "0.1.0"` — **zwei unverbundene Versionsnummern** | `server.mjs:42` vs. `package.json:3` |
| V6 | `katalog.mjs:18` (Kopf) | führt `dogfood` als Quelle | **kein** Katalogeintrag mit `quelle: 'dogfood'` | `--ruf audit_checklist '{"thema":"werkzeug"}'` → `quellen` ohne dogfood |
| V7 | `katalog.mjs:485` (`werk-01.beleg`) | „nachgemessen am 2026-09-26: **42** richtig, 0 falsch" | **44** richtig, 0 falsch | `--ruf audit_paths` |
| V8 | `MASTERDOTO.md:39/391` | **21 Gates** (korrekt, selbst korrigiert von „20") | stimmt — aber `check:docs` prüft **nur** MASTERDOTO/README, **nicht** die Code-Kommentare aus V3/V4 | `check-docs.mjs:106` |

**Kern:** `check:docs` (`scripts/check-docs.mjs`) zählt `skript: '`-Vorkommen in **`checks.mjs`** (`:47`) und vergleicht sie mit **MASTERDOTO** (`:106`) — die Kommentare in `checks.mjs`, `gates.mjs`, `ci.yml` und `server.mjs` liegen **außerhalb** seiner Prüfmenge und dürfen deshalb jahrelang „19/20" sagen.

---

## 6. Struktur, Zirkularität, Scope

- **Zwei getrennte Gate-Batterien.** `checks.mjs` (21 Gates, CI-verdrahtet) und `gates.mjs` (9 Gates, nur über `audit_gates`). Sie überlappen (`checks`/`build`/`test`/`perf`/`balance`/`smoke:fast`), aber **niemand** hält ihre Schnittmenge konsistent. Eine Divergenz (Gate in der einen, nicht in der anderen Batterie) fällt keinem Werkzeug auf.
- **Verschachtelung, keine Zirkularität.** `gates.mjs:21` ruft `npm run checks`, das `checks.mjs` (21 Gates) fährt. Kein Aufruf-Zyklus, aber `audit_gates welche="alle"` würde die volle 21er-Batterie innerhalb der Gate-Sonde starten.
- **Statik-Scope inkonsistent.** `deadcode`/`marker`/`doppelregeln` scannen nur `src/` (`statisch.mjs:78,108,161,204-205,342`); `pfade` und `secrets` scannen das ganze Repo (`statisch.mjs:458`, `:655`). Ein totes Skript ist so **prinzipiell** nicht detektierbar (siehe §2.4).
- **Generierte Datei ist getrackt.** `src/shared/config/weapons.js` (7359 Zeilen, generiert von `build-weapon-catalog.mjs`) liegt **im Git** (`git check-ignore` → not ignored). Der Detektor meldet korrekt `kopfHinweis: true`, aber ein getracktes Generat kann trotzdem vom Generator abweichen, wenn niemand `npm run weapons:build` fährt — `check:docs` prüft nur *Zahlen*, nicht Idempotenz.
- **`code-04`-Katalogfrage** („Neubau ohne Quelländerung ergibt leeren Diff") ist im Katalog (`katalog.mjs:150-154`) als Prüffrage geführt, wird aber von **keinem** Gate automatisch gefahren.

---

## 7. Werkzeugfallen (Zusammenfassung)

1. **Gefrorener MCP-Prozess (H1-01, kritisch).** Meldet die Welt vor seinen eigenen Fixes — inkl. **Altschema** der Rückgaben. *Regel: jede MCP-Aussage gegen einen frischen CLI-Lauf stellen.* Live reproduziert (`audit_events` 27 vs. 0; `test:e2e` 27 vs. 28 Dateien).
2. **Kommentar-empfindlicher Detektor (H1-03, hoch).** `generierteDateien()` lässt sich von einem Kommentar in `build-weapon-catalog.mjs:1437` steuern — richtig aus Versehen.
3. **Tote Kennzahlen (H1-02, hoch).** `gates.mjs`-Regex passt nicht zur `checks.mjs`-Ausgabe → `checks`-Kennzahlen immer leer.
4. **Fehlende Isolation (H1-04, mittel).** Ungetrackte `probe-*.mjs` (parallel arbeitende Agenten) brechen `eslint .`/`lint` lokal.
5. **Zahl-Drift ohne Wächter (H1-06, mittel).** 19/20/21 und 55/59 und 1.0.0/0.1.0 in Code-Kommentaren, außerhalb der `check:docs`-Prüfmenge.
6. **Scope-Blindstelle (H1-05, mittel).** Statisches Audit sieht nur `src/` — tote Skripte/Tools sind unsichtbar.
7. **`audit_bericht`-Pfad kosmetisch (H1-07, niedrig).** Bei absolutem Zielpfad außerhalb des Repos liefert `rel()` einen Sinnlos-Pfad `../../../../../tmp/hunter-bericht.md` (`bericht.mjs:449` nutzt `rel()`; Rückgabe dieses Laufs). Die Datei wird korrekt geschrieben.

---

## 8. Befundtabelle

| Nr | Befund | Beleg (datei:zeile) | Schwere |
|---|---|---|---|
| H1-01 | Laufender MCP meldet alten Wissensstand + Altschema (27 statt 0 undokumentiert) | `mcp__audit__audit_events` vs. CLI; `README.md:105-134` | kritisch |
| H1-02 | `checks`-Gate-Kennzahlen dauerhaft leer (Regex ≠ Ausgabe) | `gates.mjs:58-63` vs. `checks.mjs:81-82`; Messung 0/0 | hoch |
| H1-03 | „schreibt beim Import"-Detektor wird von Kommentar gesteuert | `statisch.mjs:717-719`; `build-weapon-catalog.mjs:1437,1449,1453` | hoch |
| H1-04 | Keine Isolierung — ungetrackter Probe-`*.mjs` macht `lint` rot | `ci.yml`/`package.json` `lint: eslint .`; Probe-Lint-Ausgabe | mittel |
| H1-05 | Statisches Audit deckt nur `src/` — tote Skripte unsichtbar | `statisch.mjs:33-35,78,108,161,204-205,342` | mittel |
| H1-06 | Zahl-Drift (19/20/21; 55/59; 1.0.0/0.1.0) außerhalb `check:docs` | `checks.mjs:7`, `ci.yml:28`, `gates.mjs:5,21`, `server.mjs:7,42`, `README.md:11` | mittel |
| H1-07 | `audit_bericht`-Rückgabepfad bei absol. Ziel außerhalb Repo sinnlos | `bericht.mjs:449`; Rückgabe dieses Laufs | niedrig |
| H1-08 | `build_weapon_metadata.{cjs,js}` vaterlos (0 Referenzen) | `grep -rn build_weapon_metadata` → keine Treffer | niedrig |
| H1-09 | 15 Skriptdateien ohne npm-Skript, README dokumentiert 3/51 | `package.json` (52 Skripte); `README.md:297-300` | niedrig |
| H1-10 | 0 ausführbare `.mjs` trotz Shebang; `create_weapon_aim_sheet.sh` ohne `+x` | Dateirechte (§2.1) | niedrig |
| H1-11 | CI fährt `validate`/`smoke:fast`/`balance` nicht | `ci.yml:26-81`; `gates.mjs:20,25,26` | niedrig |

---

## 9. Rohwerte dieses Laufs (CLI, frisch)

| Werkzeug | Kernzahl |
|---|---|
| `audit_status` | `4c42470`@main · node v22.23.2 · src 89 Dateien/38415 Z. · tests 133/36230 · scripts 44/8985 · tools 8/3455 · npmSkripte 52 |
| `audit_gates schnell` | lint **rot** (`probe-hunter5.mjs`), validate grün → 1/2 |
| `audit_determinism` | deterministisch **true**, seedWirkt **true** (4242→`1e5f986a`, 9999→`8f419a54`) |
| `audit_flow` | 5 Partien, Ø 26,4 Runden / 67,4 Züge / 54,4 Schüsse; `ereignisse: {}` bei ALLEN Partien |
| `audit_weapons` | 150 Waffen, 8 Kategorien; `wirkungsloseFelder` leer |
| `audit_classes` | 9 Kombinationen; Spannen health 2,79× / damage 1,86× / launch 2,70× / mobility 1,71× |
| `audit_terrain` | 8 Formen, Streuung je Form > 0 (z. B. `spires` 11,375) |
| `audit_perf` | 5036 Ticks, Ø 0,1775 ms, p99 1,4546, max 8,7388 → **0 über Budget** |
| `audit_deadcode` | toteDateien 0 · unbenutzteExporte 5 · unbenutzteKonstanten 0 · doppelregeln 0 · marker 0 |
| `audit_events` | gesamt 47 · gedeckt 39 · stumm 8 · undokumentiert **0** |
| `audit_security` | tokenQuellen 2 · numberCoercions 0 · direkteIds 0 |
| `audit_secrets` | 0 |
| `audit_nondeterminism` | im Sim-Pfad **1** (`src/engine/replay.js:85` `Date.now()`) · außerhalb 3 |
| `audit_paths` | 44 richtig · 0 falsch |
| `audit_checklist` | 59 Einträge, 10 Themen, 9 Quellen |
| `npm run checks` | **21 Gates, 48,8 s, fehlgeschlagen 0** |
| `audit_all` | Ampel: rot={gates} · gelb={zufall} · grün={9 Felder} |

**Nebenbei entdeckt (nicht im Kernauftrag, für den Physik-/Match-Hunter relevant):**
`audit_flow` und `audit_determinism` melden `ereignisse: {}` bzw. `0` für **jede** Partie — obwohl die Engine nachweislich Events emittiert (`audit_events` zählt 47 Arten). Ursache im Werkzeug: `dynamisch.mjs:26-48` (`spieleZug`) ruft intern `m.consumeEvents()` (`:42`) und **verwirft** sie; das spätere `sammle()` (`:52-55`, aufgerufen `:68` und `:117`) sieht den leeren Puffer. Das Feld ist damit eine **strukturell immer leere Messung** — es sieht gemessen aus, ist aber tot.

## 10. Nicht messbar in diesem Lauf

- **Voller E2E-Lauf** (28 Specs, ~10 min): hier nicht gefahren; `audit_e2e_plan` liefert nur den Plan.
- **CI-Ausführung** (GitHub-Runner): nur statisch analysiert; die `lint`-Rötung wegen `probe-hunter5.mjs` ist ein **lokales** Phänomen und in der CI nicht reproduzierbar.
- **Änderungshistorie des laufenden MCP-Prozesses**: Startzeitpunkt nicht auslesbar — die Divergenz (§1) belegt nur, dass er **älter** als der Disk-Stand ist, nicht *wie* alt.
