# Abnahmebericht — Bugs / Tote Pfade (2026-10-01)

**Erstellt:** 2026-10-01 12:53 CEST
**Repo:** `/home/patrick/AnunnakiTools Projekte/laufende Projekte/ProjectArmageddon/`
**Commit:** `0cb14ae` (main) · **Node:** v26.7.0
**Werkzeug-Stand (MCP):** `5413fccf39320245da190f111dcb57355d02c81268aff3b04803a188521c6d67` · **veraltet:** nein
(„läuft mit dem Code, der jetzt auf der Platte liegt" — `audit_stand`, geprüft 2026-10-01 10:46)

**Regel dieses Berichts:** Jeder Befund trägt `datei:zeile` und, soweit möglich, eine Messzahl.
Was nicht geprüft werden konnte, steht in §8 ausdrücklich als solches.
**Keine Datei wurde geändert** außer dieser einen neuen Datei; in `src/` und `tests/` wurde nichts angefasst;
kein Playwright, kein Server gestartet.

---

## 1. Was gefahren wurde — und was nicht

| Prüfschritt | Ergebnis |
|---|---|
| `npm run audit:status` | JSON: src 95 Dateien/43 494 Z. · tests 162/44 547 · scripts 44/9 525 · tools 12/4 991 · 9 Gates |
| `npm run audit:liste` | 20 Werkzeuge, 2 Prompts, **59** Katalogfragen |
| `node tools/audit-mcp/server.mjs --ruf audit_deadcode '{}'` | vollständige Antwort gelesen (Datei in §3 ausgewertet) |
| `… --ruf audit_events '{}'` | 47 Ereignisarten, 40 gedeckt, **7 stumm — 0 undokumentiert** |
| `… --ruf audit_secrets '{}'` | 0 Fundstellen in getrackten Dateien |
| `… --ruf audit_nondeterminism '{}'` | 1 Zeit-Treffer im Simulationspfad (`src/engine/replay.js:85`, bereits als Fehlalarm belegt) |
| `npm run audit:bericht` | **NICHT ausgeführt** — das Werkzeug schreibt fest nach `docs/audit-tief.md` (`server.mjs:492/768`) und würde damit eine bestehende getrackte Datei überschreiben. Das ist durch die Auftragsregel verboten. Ersatz: `audit_deadcode`/`audit_events` usw. lesen direkt (machen dasselbe ohne Datei zu schreiben) und `docs/audit-tief.md` lesen. |
| `npm run audit:tief` | **existiert nicht** — `package.json` kennt nur `audit:liste`, `audit:status`, `audit:bericht` (`package.json:57-59`). |

> **Hinweis zur vorhandenen `docs/audit-tief.md` (Stand 2026-09-27, Commit `686a85f`):** Sie ist **veraltet** und
> widerspricht dem frischen Lauf: sie nennt 43 Ereignisarten / 37 stumm / 28 undokumentiert; der frische Lauf
> nennt 47 / 7 / 0. Für diesen Bericht gilt ausschließlich der frische Lauf.

---

## 2. Bewertung der neun C-Befunde

Urteil: **bestätigt** · **teilweise** · **widerlegt** · **erledigt** (Gegenstand existiert nicht mehr).

| # | Urteil | Beleg (nachgeprüft, nicht übernommen) |
|---|---|---|
| **C-1** Quelltext kennt kein `.json` | **erledigt** (Gegenstand entfernt) + Werkzeug repariert | `find src -name '*.json'` → **leer**. Der gelöschte Commit `8f85394` (2026-10-01, „tote Daten und tote Datei entfernt") entfernte genau drei Dateien: `src/shared/data/projectArmageddonWeaponsV1.json`, `src/shared/data/terrainMaterialsV1.json`, `src/client/assets/weaponIcons.json`. Die getrennte Behandlung ist im Werkzeug vorhanden: `statisch.mjs:39` (`QUELTEXT` ohne `.json`), `statisch.mjs:42` (`DATEN_ENDUNGEN=['.json']`), eigene Sonde `toteDaten()` `statisch.mjs:201`. Frischer Lauf: `toteDaten {anzahl:0, geprueft:0, bytes:0}` — bei leerem Bestand ehrlich 0. |
| **C-2** `EINSTIEG` fängt jedes `index.js` | **erledigt** | Freispruch verlangt jetzt Beleg: `statisch.mjs:120/139/243` („namentlich in package.json/index.html/vite.config/playwright.config genannt UND nicht codeleer"). Es gibt nur noch **4** `src/**/index.js` — alle vier belegt. Der frühere Übeltäter `src/shared/data/index.js` ist entfernt; das steht auch festgeschrieben in `tests/no-dead-code.test.js:121-131`. Werkzeug-`einstiegspunkte`: 5 Einträge, jeder mit Belegtext. |
| **C-3** `doppelregeln()` sieht nur `const GROSSBUCHSTABEN` | **erledigt** (repariert) | `doppelregeln()` arbeitet jetzt auf **Modul-Ebene (Spalte 0)** für `const/let/var/function/class` (README-Abschnitt „Vier Blindstellen", Punkt 3). Frischer Lauf: `doppelregeln {anzahl:0, offen:[], begruendet:[]}`. **Der belegte Fall ist ebenfalls weg:** `hasSpecialEffect` steht nur noch in `src/shared/config/weapons.js:7124`; `src/engine/specials.js:234` ist heute ein Kommentar („HIER STAND …"). Wächter: `tests/tote-regeln.test.js:88`. Damit ist auch **A-12 sachlich erledigt** (die Register-Zeile „zwei Definitionen" ist überholt). Offene Rest-Sichtgrenze siehe §3.4. |
| **C-4** Wächter prüft 30 von 90 Dateien | **erledigt** | `tests/no-dead-code.test.js` läuft jetzt über **ganz** `src/` und prüft seine Abdeckung selbst: „Der Wächter deckt JEDE Schicht unter src/ ab" (`:184`), Schichten-Summe == Gesamtzahl (`:193`), mind. 90 Dateien (`:204`), Freispruch nur mit Begründung (`:209-216`). |
| **C-5** `match.js` 3195/3200 | **erledigt** | `wc -l src/engine/match.js` → **3092**. Budget-Wächter `tests/match-zeilenbudget.test.js:13` (≤ 3200) vorhanden. |
| **C-6** „Bot-KI" in 22 Kommentaren | **teilweise** (Zahl falsch, Deutung nicht) | `grep -rniE 'bot[- ]?ki' src` → **18 Treffer, nicht 22**. Kein Treffer widerspricht `src/server/index.js:34` („Es gibt keine Bot-KI") — **alle** erklären die Abwesenheit bzw. dokumentieren die Entfernung vom 2026-09-20, z. B. `src/server/gameServer.js:406`, `src/engine/match.js:213`, `src/server/lobby.js:53`, `src/client/main.js:1094`. Es ist eine **Ordnungsfrage** (viel Prosa zum selben Punkt), kein sachlicher Fehler. |
| **C-7** 4 Barrels / 137 Zeilen ohne Produktkonsument, 14 wortgleiche Kopien | **bestätigt** (Zahl leicht abweichend) | 4 Barrels = **148 Zeilen** heute (`engine 33 / shared 23 / client 29 / server 63`). **Produktkonsument: keiner** — die einzigen Nennungen sind `package.json` (`validate`-Skript, Z. 11), `tests/no-dead-code.test.js:114-117` (Ausnahmeliste) und `tests/class-profile.test.js:224`. **Genau 14 wortgleiche Codezeilen** zwischen `src/client/index.js` und `src/server/index.js` (gemessen; z. B. `GAME_RULES`, `MATCH_RULES`, `SeededRandom`, `CollisionMask` …). |
| **C-8** `gameServer.js` 282 Z./26 `this.`; `guentherSystem.update` 66 `this.`/169 Z. | **teilweise** (guenther bestätigt, gameServer-Zahlen überholt) | `guentherSystem.update` (`src/engine/systems/guentherSystem.js:188-358`): **171 Zeilen, 66 `this.`** — bestätigt (Register 169/66). `gameServer.js` ist heute **2013 Zeilen / 301 `this.`**; größte Methode ist `#handleConnection` (`:1490`) mit **362 Zeilen / 38 `this.`**. Die zitierten 282/26 sind im aktuellen Baum **nicht auffindbar** (Datei wurde seither umgebaut). Das Kernproblem (Riesenmethode) besteht, die Zahl als Momentaufnahme ist überholt. |
| **C-9** Kein Zeilenbudget außer `match.js`; größte unbewachte Datei 7358 Z. | **bestätigt** | Einziges Zeilenbudget-Test ist `tests/match-zeilenbudget.test.js`. Größte unbewachte `.js`-Dateien: `src/shared/config/weapons.js` **7354 Z.** (generiert), `src/client/main.js` **3464 Z.**, `src/shared/terrainGen3.js` 1830, `src/client/renderer.js` 1723. Register nannte 7358 → heute 7354 (Zeilendrift; Zahl als Momentaufnahme). |

---

## 3. Tote Dateien / Exporte / Konstanten (Werkzeugbefund **und** Nachprüfung)

Frischer `audit_deadcode`-Lauf, dann jede Gruppe einzeln gegen den Code geprüft.

### 3.1 Tote Dateien — 0
`toteDateien {anzahl:0}`. Nachprüfung: keine verwaiste `.js` unter `src/`; der Wächter hält das bei 0.

### 3.2 Tote Datendateien — 0 (Sonde: 0 geprüft)
Keine `.json` unter `src/`. Geprüfte Menge = 0, gemeldete Treffer = 0 (§2, C-1).

### 3.3 Unbenutzte Exporte — Werkzeug meldet **5**, tatsächlich **7**
Werkzeug (`super`-Liste): `resolveStrike` (`src/engine/shooting.js:362`), `fuseTicksFor` (`shooting.js:392`),
`GERAETE_SCHLUESSEL` (`src/shared/identity.js:42`), `isValidAngle` (`src/shared/validation.js:38`),
`isValidPower` (`src/shared/validation.js:42`).

Nachprüfung (Kommentare entfernt, Leser über alle `.js/.mjs/.html` gesucht) — **zwei fehlen im Werkzeug:**

| Fundstelle | Warum vom Werkzeug übersehen | Art |
|---|---|---|
| `src/engine/shooting.js:581` `applySelfEffect` | wird im Kommentar `tests/shooting.test.js:163` genannt → Werkzeug zählt das als Leser | nur intern genutzt (`shooting.js:227`, `:640`) → überflüssiges `export` |
| `src/client/terrainBaker.js:527` `renderGroundOnGpu` | wird im Kommentar `tests/terrain-baker.test.js:276` genannt | intern genutzt (`terrainBaker.js:347`) → überflüssiges `export` |

**Ursache (belegt):** `unbenutzteExporte()` liest die Dateien mit `read(f)` **ohne** `streicheKommentare`
(`tools/audit-mcp/lib/statisch.mjs:333`) — derselbe Fehler, den das Werkzeug an anderer Stelle selbst
verurteilt („Kommentarzeilen sind keine Treffer"). `resolveStrike` etc. haben keine Fremd-Kommentarnennung und
werden deshalb korrekt gemeldet.

### 3.4 Namen, die nur über ein Barrel erreichbar sind (Produktkonsument fehlt)
Bei der Leser-Suche fiel auf: folgende Exporte haben **keinen** direkten Leser außerhalb ihrer Datei — sie
werden **nur** in einem der vier Barrels re-exportiert, und die Barrels importiert kein Produktcode:
`GAME_RULES`, `ProjectilePool`, `TerrainSync`, `computeLinearDragPosition`, `createClientRuntime`,
`registerDefaultComponents`, `normalizeInput`, `terrainMaskFromBitmap`, `DEFAULT_HISTORY_MS`,
`isWasmSupported`. Zusammen mit C-7 (Barrels ohne Konsument) sind diese transitiv ohne Produktleser.
*(Einzeln nicht endgültig als „tot" verurteilt — sie können in Modultests direkt aus ihrer Quelldatei gelesen
werden. Markiert als Kandidaten.)*

### 3.5 Unbenutzte Konstanten — Werkzeug 0, Nachprüfung 0
Kommentarbereinigter Lauf über den ganzen Baum: **keine** Konstante ohne jeden Leser. **Aber dieselbe
Blindstelle** wie §3.3 gilt auch hier: `unbenutzteKonstanten()` liest ebenfalls ohne `streicheKommentare`
(`statisch.mjs:393`) — eine Konstante, die nur in einem Fremd-Kommentar genannt wird, gilt irrtümlich als
gelesen.

### 3.6 Doppelregeln — 0 offen
`hasSpecialEffect` auf **eine** Definitionsstelle zurückgeführt (§2, C-3). Kein aktueller Fall.

---

## 4. Marker für unfertige Arbeit (Aufgabe 3)

Werkzeug-Sonde `marker()` (`statisch.mjs:631-638`) sucht **nur** `TODO|FIXME|XXX|HACK` und **nur** unter
`src/`. Sie meldet 0. Das ist nachgeprüft und **wahr, aber eng gefasst**:

| Muster | Treffer in `src/ scripts/ tests/ index.html` | Bewertung |
|---|---|---|
| `TODO` / `FIXME` / `XXX` / `HACK` | **0** (repo-weit, ohne `node_modules/`+`dist/`) | echtes Qualitätsmerkmal: keine Schuldenliste im Code |
| `deprecated` | 0 | — |
| `nicht implementiert` | 0 | — |
| `Platzhalter` / `Stub` | 11 (alle `src/`), **alle in Kommentaren/Doku** | kein Code-Pfad schaltet sich ab |

Einzeln bewertet (11 Treffer, `grep -rniE 'platzhalter|\bstub\b' src`):

- **Echtes Risiko (Ordnung):** `src/engine/physics/ballisticsWasm.js:2` — „WASM-Ballistik-Wrapper (Stub für
  WebAssembly-Implementierung)". Das Modul re-exportiert nur `ballistics.js` und ergänzt `isWasmSupported()`
  (`:18`), das **keinen Produktaufrufer** hat (§3.4). Reiner Platzhalter, kein aktiver Fehler.
- **Harmlos (Prosa):** `src/engine/turret.js:83/86` (Platzhalter-Waffe = gültige Dummy-Waffe mit Werten),
  `src/shared/index.js:18` (Historie: entfernter Leer-Platzhalter), `src/shared/achievements.js:96`,
  `src/shared/config/backdrops.js:782`, `src/client/hud.js:344`, `src/client/profilanzeige.js:108`,
  `src/client/main.js:1206/2712/2842`.

**Kein** Treffer ist ein erreichbarer Pfad, der stillschweigend abgeschaltet ist.

---

## 5. Funktionen ohne Aufrufer / stille Abschaltungen (Aufgabe 4)

- **7 Exporte ohne externen Leser** (§3.3) — alle nur „überflüssiges `export`", keine echte Tote-Funktion
  (jede wird intern benutzt).
- **`isWasmSupported`** (`src/engine/physics/ballisticsWasm.js:18`) wird in `src/engine/index.js:27`
  re-exportiert, aber **nirgends aufgerufen** → toter Export über Barrel. Ebenfalls ohne Aufrufer:
  **`playReplay`** (`src/engine/replay.js:247`) taucht in keiner `src/`-Datei als Leser auf (Kandidat; nur
  intern/Test prüfbar — nicht abschließend verurteilt).
- **`if (false)` / `if (!true)`:** **0 Treffer** repo-weit — es gibt keine hart abgeschaltete Verzweigung.
- **`return null`:** ~80 Stellen in `src/`. Stichprobe: überwiegend legitime Eingabe-Wächter
  (`src/shared/protocol.js:431-434` Frame-Kopf, `src/engine/match.js:2285` Ziel-Prüfung,
  `src/shared/validation.js:*`). **Keine** Stelle schaltet einen Produktivpfad **ohne Meldung** ab:
  - Der historische Fall **A-14** (`decodeSnapshot` → `null` → stiller `return`, schwarzes Bild) ist im Code
    **bereits behoben**: `src/client/networkClient.js:341-370` zählt und **emittiert** `snapshot_rejected`
    (mit Grund/Version/Byte-Zahl); `src/client/main.js:1158-1164` schreibt daraus eine `danger`-Protokollzeile.
  - `src/engine/physics/ballisticsWasm.js:22` `catch → false` ist eine Fähigkeits-Abfrage (kein Pfad).

---

## 6. Stellen, die einen Fehler still verschlucken (Aufgabe 5)

- **Literal leere `catch {}`:** **0 Treffer** repo-weit (`grep -rnE 'catch\s*(\([^)]*\))?\s*\{\s*\}'`).
- **`catch` ohne Bindung in `src/`:** 11 Stellen. Jede liefert einen **definierten** Rückgabewert oder
  protokolliert. Bewertung:

| Fundstelle | Verhalten | Bewertung |
|---|---|---|
| `src/client/soundMixer.js:135` | kein AudioContext → kein Klang, kein Absturz (Kommentar `:136-138`) | dokumentiert, harmlos |
| `src/shared/identity.js:108` | localStorage voll/Privatmodus → `null` (Kommentar `:109-110`) | dokumentiert, harmlos |
| `src/shared/identity.js:289` | ungültiges JSON → `{ok:false, fehler:…}` | meldet |
| `src/client/networkClient.js:324` | Sendefehler → `#scheduleReconnect()` | behandelt |
| `src/client/dom.js:61`, `src/engine/physics/ballisticsWasm.js:21` | Fähigkeits-Abfrage → `false` | harmlos |
| `src/shared/protocol.js:1040` `parseControlMessage` → `null` | wird laut behandelt: `src/server/gameServer.js:1548-1550` sendet „Ungültige Nachricht" | meldet |
| `src/server/gameServer.js:1029` | `response.destroy()` im bereits protokollierten `http_failed`-Pfad (`:1016-1019`) | protokolliert |
| `src/server/gameServer.js:1933/1939` | SPA-Fallback (`statSync` schlägt fehl → nicht Datei) | beabsichtigt |
| **`src/server/gameServer.js:1421`** (`#readBody`) | ungültiges/leeres JSON im Request-Body → **still `resolve({})`** (kein Log) | **einzige stille Stelle** — „stört" (niedrig), siehe §7 |

- **`?.` / `??`:** `?.` kommt **577×** in `src/` vor; `?? {}` / `?? []` **30+**-mal (u. a.
  `src/shared/protocol.js:279-282`, `src/engine/systems/*System.js` `world.services ?? {}`,
  `src/client/main.js:1224` `this.network?.latestSnapshot`). Das sind ganz überwiegend **defensive Defaults**
  auf Draht-/Snapshot-Daten und Zustandsdaten. **Es wurde kein belegter Fehler gefunden**, bei dem eine
  `?.`-Kette eine fehlende Struktur verdeckt (kein erfundenes Ergebnis — geprüft, negativ).

---

## 7. Priorisiert: „Bugs / Tote Pfade — was zu tun ist"

Schwere: **kritisch** = Spielspaß/Flow/stiller Fehler · **stört** = merkliche Unstimmigkeit ·
**Ordnung** = Werkzeug/Wartbarkeit.

| # | Fundstelle | Schwere | Beleg | Empfohlener Fix | Aufwand |
|---|---|---|---|---|---|
| 1 | `tools/audit-mcp/lib/statisch.mjs:333` (+ `:393`) — Export-/Konstanten-Leser zählt **Kommentarnennungen** als Leser | Ordnung (Werkzeug) | `applySelfEffect` (`src/engine/shooting.js:581`) und `renderGroundOnGpu` (`src/client/terrainBaker.js:527`) fehlen in der Werkzeugliste; ihre einzigen Fremdnennungen sind die Kommentare `tests/shooting.test.js:163` und `tests/terrain-baker.test.js:276` | `read(f)` → `streicheKommentare(read(f) ?? '')` an beiden Stellen; Gegenprobe ergänzen | klein |
| 2 | `src/client/index.js` + `src/server/index.js` — Barrel-Dubletten | Ordnung | 4 Barrels / 148 Zeilen ohne Produktkonsument; **14 wortgleiche Zeilen** zwischen Client- und Server-Barrel; 10 Namen nur über Barrel erreichbar (§3.4) | Gemeinsames Re-Export-Modul oder Barrels auf belegten Rest kürzen; alternativ im Wächter begründet freisprechen | klein–mittel |
| 3 | `src/engine/physics/ballisticsWasm.js` (Stub) | Ordnung | `:2` „Stub …"; `:18` `isWasmSupported` re-exportiert (`src/engine/index.js:27`), 0 Aufrufer | Entweder WASM-Implementierung liefern oder Re-Export/Nutzung belegen und den Stub als solchen kennzeichnen | klein |
| 4 | `src/server/gameServer.js:1421` (`#readBody`) | stört (niedrig) | ungültiges JSON → still `resolve({})`, kein Log | Ungültigen Body unterscheiden und protokollieren (Status 400 statt leerem Objekt) | klein |
| 5 | 7 Exporte ohne externen Leser (§3.3) | Ordnung | `resolveStrike`, `fuseTicksFor`, `GERAETE_SCHLUESSEL`, `isValidAngle`, `isValidPower`, `applySelfEffect`, `renderGroundOnGpu` | `export` entfernen (Funktionen bleiben intern) oder externen Leser belegen | klein |
| 6 | Zeilenbudget fehlt außer `match.js` | Ordnung | `src/shared/config/weapons.js` 7354 Z., `src/client/main.js` 3464 Z. unbewacht (C-9) | Budget-Test für `main.js` ergänzen; `weapons.js` als generiert explizit ausnehmen/markieren | klein |
| 7 | `src/server/gameServer.js` `#handleConnection` (`:1490`) 362 Z./38 `this.`; `guentherSystem.update` (`:188-358`) 171 Z./66 `this.` | Ordnung | C-8 (gameServer-Zahl überholt, Methode bleibt Riese) | Methode zerlegen (Nachrichten-Handler je `CONTROL.*`) | groß |
| 8 | „Bot-KI" in **18** Kommentaren | Ordnung | C-6; alle konsistent mit `src/server/index.js:34` | Auf wenige zentrale Erklärung einkürzen | klein |
| 9 | `docs/befundregister.md` C-1…C-5 | Ordnung | §2 — Gegenstände erledigt/entfernt | Register nachziehen (C-1/C-2/C-3/C-4/C-5 auf ✅) — **nicht in diesem Auftrag geändert** | klein |

**Nichts „kritisch" gefunden.** Die früher kritischen stillen Pfade sind im Code bereits behandelt
(A-14 → `snapshot_rejected`; `parseControlMessage` → „Ungültige Nachricht"). Der einzige neu belegte
Werkzeug-Defekt ist #1 (Blindstelle), der einzige neu belegte stille Code-Pfad ist #4.

---

## 8. Was NICHT geprüft werden konnte (Grenzen)

- **`npm run audit:bericht` nicht ausgeführt** — sie schreibt zwingend nach `docs/audit-tief.md`
  (`server.mjs:492/768`) und hätte eine bestehende Datei überschrieben (Auftragsverbot). Ersatz: die
  Einzelsonden (Ausgabe identisch zur Berichtsbasis) + Lesen der vorhandenen Datei.
- **`npm run audit:tief` existiert nicht** (`package.json:57-59`). Es wurde nichts ersatzweise geraten.
- **Kein E2E / kein Playwright / kein Serverstart** (Auftragsvorgabe; parallele E2E-Suite). Gate-Batterie
  (`audit_gates`/`checks`) und die dynamischen Sonden (`audit_all`, `audit_perf`, `audit_flow`,
  `audit_ballistics`, `audit_determinism`) wurden **nicht** gefahren — sie brauchen längere Läufe.
- **Visuelle Qualität / WebGPU-Pfad:** ohne echten Browser nicht prüfbar (MCP-Grenze, `docs/audit-tief.md` §16).
- **Statische Export-/Leser-Suche ist Textsuche.** Dynamisch gebaute Pfade (`import(variable)`,
  Template-Strings, `import.meta.glob`) sind nicht erkennbar; die Ergebnisse in §3.3/§3.4 sind hierdurch
  begrenzt (in den 577 `?.`- und den Barrel-Fällen aber einzeln gegengelesen).
- **Alle Zeilennummern sind Momentaufnahmen** (kein schreibender Arbeiter aktiv, aber das Repo ist schmutzig:
  `docs/release-readiness-audit-2026-10-01.md` geändert; untracked u. a. `docs/abnahme-ux-2026-10-01.md`).
  Anker ist jeweils der **Name** (Funktion/Konstante/Datei), nicht die Zeile.
- **Nicht nachgerechnet:** die Balance-/Klassen-Kennzahlen aus `docs/audit-tief.md` §6/§7 (Waffenkatalog,
  „inert deklarierte Felder") — sie stammen aus dem **veralteten** Bericht und wurden hier nicht neu gemessen.

---

*Erzeugt als Einzeldatei für diese Abnahme. Grundlage: frischer Audit-MCP-Lauf (Hash `5413fccf…`, nicht
veraltet) plus grep/node-Nachprüfung. Keine bestehende Datei geändert.*
