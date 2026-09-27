# Audit-MCP — Tiefen-Audit für Spiele und Spielengines

Ein MCP-Server (Model Context Protocol, stdio) für belegbasierte Tiefen-Audits.
Er bündelt **drei Dinge**, die vorher verstreut waren:

1. **Die laufende Engine** — Sonden gegen `MatchController` (Determinismus,
   Spielverlauf, Ballistik, Leistung, Karten, Klassen, Waffen).
2. **Den Quelltext** — statische Analyse (tote Dateien, unbenutzte Konstanten,
   Doppelregeln, stumme Ereignisse, Zufall im Simulationspfad, Secrets,
   generierte Dateien, Server-Autorität).
3. **Den Wissensstand der Skills** — 55 Prüffragen aus zehn Regelwerken, jede
   mit Quelle, Methode und Belegpflicht, abfragbar über `audit_checklist`.

## Aufruf

```bash
# Als MCP (stdio) — so ruft Hermes es auf
node tools/audit-mcp/server.mjs

# Diagnose ohne MCP
npm run audit:liste                      # Werkzeuge, Prompts, Kataloggröße, Code-Fingerabdruck
npm run audit:status                     # Repozustand
node tools/audit-mcp/server.mjs --ruf audit_stand        # läuft der Prozess mit dem Code auf der Platte?
node tools/audit-mcp/server.mjs --ruf audit_deadcode
node tools/audit-mcp/server.mjs --ruf 'audit_gates' '{"welche":"schnell"}'

# Der bestellte Bericht (schreibt docs/audit-tief.md)
npm run audit:bericht
```

Es gibt **keine Abhängigkeit**: Der Server spricht JSON-RPC 2.0 zeilenweise
über stdin/stdout, wie es die MCP-stdio-Spezifikation verlangt. Kein SDK, kein
`npm install`.

## Werkzeuge

| Werkzeug | Was es liefert |
|---|---|
| `audit_stand` | **Code-Fingerabdruck**: SHA-256 über `lib/*.mjs` + `server.mjs`. Stellt den Stand des LAUFENDEN Prozesses dem gegenüber, was JETZT auf der Platte liegt — bei Abweichung „Dieser Server läuft mit altem Code — Neustart nötig", Datei für Datei |
| `audit_status` | Commit, Branch, ungetrackte Änderungen, Umfang (Dateien/Zeilen je Bereich), Gate-Liste |
| `audit_gates` | Gate-Batterie mit Exit-Code, Dauer und Kennzahlen je Gate — die Kennzahlen werden aus der ECHTEN Ausgabe gelesen (`ok  <skript>  <n> ms` je Gate plus Summenzeile) und gegeneinander geprüft; ein fremdes Format meldet einen `hinweis`, statt still 0 zu sagen |
| `audit_determinism` | Derselbe Seed zweimal → gleicher Zustandshash? Anderer Seed → anderer? |
| `audit_flow` | Partiedauer, Züge, Schüsse, Rundenzahl, Sieger je Seed |
| `audit_ballistics` | Wurfweite über Winkel × Kraft aus der ECHTEN Vorhersage, Geschoss-Lebensdauer |
| `audit_weapons` | 150 Waffen: Verteilungen, Kategorien, Felder mit überall gleichem Wert |
| `audit_classes` | 9er-Matrix Klasse × Archetyp mit den Wirk-Achsen und ihren Spannweiten |
| `audit_terrain` | Landanteil je Geländeform über viele Seeds — Mittelwert UND Streuung |
| `audit_perf` | Tick-Kosten (mittel/p95/p99/max) gegen das 16,7-ms-Budget, je Schritt gemessen |
| `audit_deadcode` | Dateien ohne Importeur, **Datendateien (`.json`) ohne Leser**, unbenutzte Exporte/Konstanten, Doppelregeln (derselbe Name 2+ mal auf **Modul-Ebene** definiert), Marker, generierte Dateien — **plus `einstiegspunkte` (jeder Freispruch mit Beleg) und `sichtgrenzen` (was das Werkzeug NICHT sieht)** |
| `audit_events` | Emittierte vs. behandelte Ereignisse — gedeckt von stumm |
| `audit_security` | Identität aus dem Token? `Number()` auf Drahtwerten? direkt gelesene Kennungen? Grenzen |
| `audit_secrets` | Secret-Scan über `git ls-files` (Werte nie im Klartext, nur Fingerabdruck) |
| `audit_nondeterminism` | Zufall/Zeit im Simulationspfad und außerhalb (mit Einordnung) |
| `audit_checklist` | Der Prüfkatalog, filterbar nach Thema/Quelle/Freitext |
| `audit_e2e_plan` | Plan für den 10-Minuten-E2E-Lauf samt Putzregel und bekannten Vorbefunden |
| `audit_all` | Alles auf einmal mit Ampel je Prüffeld (JSON) |
| `audit_bericht` | Alles auf einmal **als Markdown-Datei** mit Auswertung und TODO |

Dazu zwei MCP-Prompts: `tiefenaudit` (kompletter Durchlauf) und
`befund-pruefen` (einen einzelnen Befund als Widerlegungsversuch prüfen).

## Die Regeln, die dieses MCP durchsetzt

Der Katalog ist nicht erfunden — er sammelt, was in diesem Projekt schon einmal
schiefgegangen ist. Die vier wichtigsten:

- **Jeder Befund braucht eine Fundstelle (`datei:zeile`) ODER eine Messzahl.**
  Ohne eines von beiden ist es eine Meinung.
- **Kommentarzeilen sind keine Treffer.** Das MCP hat sich diese Lektion selbst
  eingebaut: Im ersten Lauf meldete die Zufalls-Sonde drei Treffer — alle drei
  waren Kommentare („bewusst NICHT `Math.random`"). Ein Werkzeug, das Kommentare
  zählt, ist ein Werkzeug, dem niemand glaubt.
- **„Ist definiert" ist nicht „wird gelesen".** Ein Export ohne externen Leser
  wird von einem Export unterschieden, der nur innerhalb der eigenen Datei
  genutzt wird (überflüssiges `export`) — zwei verschiedene Befunde.
- **Design-Entscheidungen trifft das Werkzeug nicht.** Was eine Balance- oder
  Produktfrage ist (konstante Waffenfelder, Mahlstrom-Breakpoint), steht im
  Bericht als *„Offen — Design-Entscheidung"* mit den Zahlen daneben.
- **Ein Freispruch wird GELESEN, nicht behauptet.** Wo das Werkzeug etwas für
  Absicht erklären könnte, muss die Absicht in einer prüfbaren Quelle stehen —
  sonst meldet es einen offenen Befund. Fail-safe in Richtung des **lauteren**
  Fehlers: im Zweifel offen, nie „Absicht".
  - **Doppelregeln** stehen in `lib/statisch.mjs` unter `DOPPELREGEL_AUSNAHMEN`
    (Name → Begründung + dokumentierte Orte). Nur ein Eintrag mit Begründung UND
    deckungsgleichen Orten wird freigesprochen, und der Bericht nennt die
    Begründung wörtlich. Nicht gelistet, ohne Begründung, mit abweichenden Orten
    oder ohne Messung ⇒ offener Befund.
  - **Stumme Ereignisse** zählen nur dann als dokumentiert, wenn im Wächter
    `tests/event-coverage.test.js` NEBEN dem Namen ein Begründungskommentar
    steht; der Text wird gelesen und im Bericht einzeln gezeigt. Ein gelisteter
    Eintrag ohne Begründung ist offen — sonst würde eine gelöschte Begründung
    still freisprechen.
  - Die Gegenprobe dazu: `node tools/audit-mcp/probe-doppelregeln.mjs`
    (Exit-Code 1, sobald eine Erwartung verletzt ist).
- **Ein Werkzeug, das 0 meldet, weil es nicht hinschaut, ist gefährlicher als
  eines, das schweigt — es erzeugt Vertrauen.** Deshalb steht die eigene
  Sichtgrenze in JEDER Antwort von `audit_deadcode` (`sichtgrenzen`) und im
  Bericht (Abschnitt 16.1), wörtlich:

  > `Dateifilter Quelltext: .js/.mjs/.cjs/.ts/.tsx — .json/.html/.css/.yml/.md
  > gelten NICHT als Quelltext (in ihnen gibt es keinen Export, keinen Import,
  > keine Doppelregel).`
  >
  > `Dateifilter Daten: .json NUR unter src/ — .json ausserhalb src/ (z. B.
  > project_armageddon_weapons_v1.json, bgworker-todo.json,
  > .pa-state/lobbies.json) wird NICHT erfasst.`

  Dazu: `Einstiegspunkte` sind kein NAME mehr, sondern ein BELEG (namentlich in
  `package.json`/`index.html`/`vite.config.mjs`/`playwright.config.mjs` genannt
  UND nicht code-leer), und jeder Freispruch wird als Tabelle mitgeliefert.

## Die vier Blindstellen der eigenen Werkzeuge (behoben 2026-09-27)

Ein Prüfer hat belegt: Die `0`-Meldungen dieses Werkzeugs waren für ihre Fragen
korrekt und für DREI andere blind. Alle vier sind behoben, jede mit einer
Gegenprobe (`probe-blindstellen.mjs`).

| # | Blindstelle (vorher) | Gegenstand im Baum | vorher | nachher |
|---|---|---|---|---|
| 1 | `QUELTEXT` kannte kein `.json` (`statisch.mjs`) | 3 `.json` unter `src/` mit **0 Lesern** (168 979 Byte) | **0 Meldungen** — die Dateien erschienen in keiner Antwort | neue Sonde `toteDaten()`: **3 von 3** geprüft, 3 Treffer, Bytesumme ausgewiesen |
| 2 | `EINSTIEG` fing JEDES `index.js` | `src/shared/data/index.js`: 30 Zeilen, **0 Code**, 0 Importeure, in keinem Manifest | Datei still freigesprochen | Einstiegspunkt nur mit BELEG; die Datei wird geprüft und **gemeldet** (mit Grund) |
| 3 | `doppelregeln()` sah nur `const GROSSBUCHSTABEN` | `hasSpecialEffect` — zwei unvereinbare Regeln (`specials.js` gegen `weapons.js`) | **0** | Modul-Ebene (Spalte 0), jedes `const`/`let`/`var`/`function`/`class`: **findet den Fall** (Gegenprobe Fall B aus `git show HEAD:…`) |
| 4 | „kein Importeur"-Wächter lief nur über `src/engine/` | 30 von 90 Dateien geprüft (33 %) | 60 Dateien (67 %) ungeprüft | `tests/no-dead-code.test.js` läuft über **alle 90**, prüft seine Abdeckung selbst und verlangt für jeden Freispruch eine Begründung |

**Belegter Fall zu 3 — und die Falle dahinter.** Die Gegenprobe stellt den
Zustand aus der Git-Historie wieder her und misst:

```
orte: src/shared/config/weapons.js:7128 · src/engine/specials.js:234 · dateien: 2
```

Die zweite Falle ist das Muster selbst: `^\s*(?:export\s+)?(const|let|var|function|class)\s+NAME`
findet im Ist-Baum **391** mehrfach vergebene Namen — fast alles lokale
Hilfsgrößen (`y`, `x`, `index`, `ergebnis`) in Funktionsrümpfen. Ein Werkzeug,
das 200 Treffer meldet, von denen 190 unbrauchbar sind, ist unbrauchbar. Deshalb
gilt die Grenze des Projekts: **Modul-Ebene (Spalte 0)**. Damit bleiben 2
Treffer — und beide sind echt.

**Vier Fallen, die beim Erweitern dieses Werkzeugs wiederkommen:**

1. **Kommentarzeilen sind keine Treffer** — gilt für JEDES neue Muster.
   `streicheKommentare()` (`statisch.mjs`) ist die Fassung des Werkzeugs,
   `tests/helfer/ohne-kommentare.js` die der Testseite. Belegt: `src/engine/specials.js`
   enthält `hasSpecialEffect` heute nur noch als Notiz (`HIER STAND …`) — der
   Detektor darf daraus keine zweite Definition machen.
2. **Ein Dateiname in einem Bericht ist kein Leser.** `docs/ARCHIVED.md` nennt
   `projectArmageddonWeaponsV1.json` — die erste Fassung von `toteDaten()` hätte
   die Datei damit freigesprochen. Gelesen wird nur CODE (`.js|.mjs|.cjs|.ts|.tsx|.html`).
3. **Der Prüfer darf nicht im Prüfgebiet liegen.** Eine Probe, die im selben
   Baum liegt und die geprüften Pfade selbst nennt, spricht sie frei (genau das
   ist `probe-blindstellen.mjs` beim ersten Lauf passiert — sie kopiert deshalb
   nur `lib/` in das Temp-Projekt).
4. **Mehrzeilige Anweisungen.** Der erste Import-Scanner des Prüfers erkannte
   `import { … } from` über mehrere Zeilen nicht → 127 Phantom-Verletzungen.
   `importIndex()` ist mit drei Formen geprüft (Zeilenumbruch in der Klammer, vor
   `from`, und `import(…)`) — Gegenprobe Fall E.

## Grenzen

- **Kein Bild.** Das MCP misst die Simulation, nicht das Rendering. Visuelle
  Qualität und der WebGPU-Pfad sind ohne echten Browser nicht prüfbar.
- **Kein Netz.** Latenzverhalten nur über `tests/e2e/network-conditions.spec.mjs`.
- **Der E2E-Lauf läuft nicht im MCP.** 28 Dateien, ~11 Minuten — dafür gibt
  `audit_e2e_plan` den Plan und `npm run test:e2e` den Lauf.
- **Statische Treffer sind Kandidaten, keine Urteile.** Ein toter Export kann
  Absicht sein (Testbarkeit), eine Konstante kann von außen gelesen werden
  (Konfiguration). Jeder Treffer muss nachgelesen werden — das Werkzeug sortiert
  vor, es entscheidet nicht.
- **Ein laufender MCP-Server ist eine EINGEFRORENE Sicht auf seinen eigenen
  Code.** Wer `lib/**` oder `server.mjs` ändert, ändert nicht den Prozess, der
  gerade antwortet. Der liefert danach weiter die alte Welt — mit voller
  Überzeugung.

  **Belegt (2026-09-26).** Nach der Reparatur von `lib/statisch.mjs` (der
  Ereignis-Detektor suchte Namen nur als *zitierte* Zeichenkette, die
  Zuordnungstabelle benutzt aber unquotierte Schlüssel) lieferte derselbe Aufruf
  zwei verschiedene Antworten:

  | Quelle | gesamt | gedeckt | stumm | undokumentiert | Urteil |
  |---|---|---|---|---|---|
  | MCP (langlaufender Prozess) | 43 | 6 | 37 | **27** | „27 stumme Ereignisse sind NICHT dokumentiert" |
  | CLI, frisch gestartet | 47 | 39 | 8 | **0** | „keine Lücke" |

  Die „27 undokumentiert stummen Ereignisse" haben daraufhin einen ganzen
  Arbeitsdurchgang gekostet — sie waren nie ein Produktmangel, sondern ein
  Prozess, der die Welt von vor seiner eigenen Reparatur meldete.

  **Regel: Jede Aussage des MCP über den Code wird gegen einen frisch gestarteten
  Lauf geprüft, bevor sie als Befund gilt.**

  ```bash
  # Gegenprobe: dieselbe Frage, frischer Prozess
  node tools/audit-mcp/server.mjs --ruf audit_events
  ```

  Ein MCP-Ergebnis ist ein **Zeitpunkt**, kein Zustand. Nach jeder Änderung unter
  `tools/audit-mcp/` den Server neu starten (Hermes: Verbindung trennen und neu
  aufbauen) — oder das Ergebnis als verdächtig kennzeichnen.

### Der Prozess sagt jetzt selbst, ob er alt ist

Seit 2026-09-27 ist aus dem Vorsatz („nach jeder Änderung neu starten") eine
Messung geworden — die Regel ist damit nicht mehr guter Wille, sondern prüfbar:

- **Jede Werkzeugantwort trägt `werkzeugStand`**:
  `{hash, prozessStart, dateienGehasht, platteHash, veraltet, urteil}`.
  `veraltet: true` heißt: der Code, der hier antwortet, ist NICHT der Code, der
  auf der Platte liegt. Dann steht die Warnung zusätzlich als eigener Textblock
  am Anfang der Antwort — im Wortlaut: **„Dieser Server läuft mit altem Code —
  Neustart nötig"** (dazu eine ASCII-Fassung, weil eine Warnung, die nur als
  „läuft" ankommt, keine Warnung ist).
- **`audit_stand`** zeigt die Gegenüberstellung im Detail: welche Datei(en)
  geändert wurden (mit beiden Hashes), welche neu dazukam, welche verschwand —
  und welche **nicht lesbar** war. Unlesbar ist eine Abweichung, kein
  Gleichstand (fail-safe).
- Der Fingerabdruck umfasst `lib/*.mjs` + `server.mjs` und wird **beim
  Prozessstart** gebildet. Er ist keine feste Dateiliste: eine neu
  hinzugekommene `lib/*.mjs` ändert ihn.
- Der `initialize`-Handschlag nennt seinen Stand (`serverInfo.stand`),
  `--liste` ebenfalls — man kann also vor der ersten Frage sehen, wer antwortet.

```bash
# Frischer Prozess: läuft mit dem, was auf der Platte liegt
node tools/audit-mcp/server.mjs --ruf audit_stand
# → "abweichung": false · hash == platteHash
```

Die Gegenproben dazu (Exit-Code 1, sobald eine Erwartung verletzt ist):
`node tools/audit-mcp/probe-stand.mjs` startet den Server als echten
MCP-Prozess auf einer Kopie unter `/tmp` und ändert Dateien UNTER dem laufenden
Prozess (geändert / neu / unlesbar / Neustart); `probe-checks-messwert.mjs`
prüft die Kennzahlen-Leser der Gate-Batterie, inklusive fail-safe bei fremdem
Format; `probe-doppelregeln.mjs` prüft das Urteil über Doppelregeln und die
gelesenen Ereignis-Begründungen; **`probe-blindstellen.mjs` prüft die vier
Blindstellen selbst** — in BEIDE Richtungen: der belegte Gegenstand MUSS
gefunden werden (Fall B stellt ihn aus `git show HEAD:…` wieder her), und der
Scheintreffer darf NICHT gefunden werden (Kommentarzeilen, Doku-Nennungen, lokale
Namen, auskommentierte Definitionen).

## Herkunft der Prüffragen

`audit_checklist` nennt je Frage die Quelle. Eingeflossen sind:
`code-grounded-ux-audit`, `e2e-suite-deep-analysis`,
`projectarmageddon-verification`, `webapp-security-config-audit`,
`webapp-architecture-audit`, `deterministic-sim-engine-dev`,
`browser-game-audio-and-feel`, `procedural-terrain-generation`, `dogfood`,
`systematic-debugging`.
