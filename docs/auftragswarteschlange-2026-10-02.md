# Auftragswarteschlange 2026-10-02 — konsolidiert aus allen Quellen

**Zweck:** EIN Ort für jede offene Arbeit. Vorher lagen die Punkte über
`MASTERDOTO.md` (Checkboxen **alle abgehakt**, offene Punkte nur noch in den
Anhängen), `docs/befundregister.md`, `docs/verkabelung.md`, vier
`docs/abnahme-*-2026-10-01.md`, `docs/betrieb-INSTANZ.md` und die
Cron-Warteschlange verstreut. Wer „was ist offen" fragte, musste sechs Dateien
gegeneinander lesen.

**Regel dieses Dokuments:** Jeder Punkt nennt Beleg + Aufwand. Erledigtes wird
abgehakt, **nicht gelöscht** — die Streichung ist der Nachweis.

Stand: 2026-10-02 · Branch `main` · Ausgangscommit `8ee42a3`

---

## 1. In diesem Zug erledigt (belegt)

| # | Punkt | Beleg |
|---|---|---|
| 1 | **Online gab es NIE eine Gift- oder Bonusmarke** (`dots`/`boostMultiplier` wurden im Client mit Konstanten gefüllt) | **Protokoll v9**: `PLAYER_STRIDE 15 → 17`, `DIRTY.MARKS`, `dotsCount`+`boostMultiplier` in Encode/Decode/Delta-Basis/`stateSnapshot`. Wächter `tests/status-marke-online.test.js` (3 Tests, vorher 1) |
| 2 | **`hashState` las `t.rounds`, der Zustand führt `roundsLeft`** → der Wert war immer `null`, der Determinismus-Hash blind für Geschützrunden | `src/engine/stateSnapshot.js:269` auf `t.roundsLeft ?? null`. Alt-Replay-Hash `d013a3ae` bleibt gültig, `npm test` 1232/1232 |
| 3 | **Die Art einer Kiste war unsichtbar** — eine Sprengfalle sah aus wie eine Waffenkiste | `renderer.js` `#drawCrates`: Marke je `crateType` (Quadrat/Ring/Warndreieck/leer), `CRATE_TYPES` aus dem Motor importiert statt als zweite Zahlenliste |
| 4 | **`config/rules.js` widersprach dem Spiel** (20 Runden gegen 30 gespielt, 4–6 je Team, 8 Spieler, 30 s) und hatte null Produktleser | Datei **gelöscht**, drei Barrel-Re-Exporte entfernt (`shared/index.js`, `client/index.js`, `server/index.js`). `npm run validate` grün |
| 5 | **Der Cron-Wächter `ProjectArmageddon Audit-Wächter` war seit 189 Läufen funktionsunfähig** — `cd /home/patrick/ProjectArmageddon` (Pfad ohne Leerzeichen, existiert nicht) | `~/.hermes/scripts/projectarmageddon-audit-waechter.sh` auf `$HOME/AnunnakiTools Projekte/…`; echt laufen lassen, meldet jetzt korrekt |
| 6 | **`tests/snapshot-size.test.js` pinnte das Budget 700 B** — v9 kostet 2 B je Figur | Budgets begründet nachgezogen (40 Figuren: 780 bzw. 790, gemessen 726/750), Formel auf `Figuren × 17` richtiggestellt |
| 7 | **Zwei Wächter pinnten die alte Protokollzahl als Gleichheit** (`PLAYER_STRIDE 15`, `PROTOCOL_VERSION = 8`) | auf 17 bzw. `>= 8` — ein Wächter soll den **Rückbau** fangen, nicht jede neue Version ohne Grund reißen |
| 8 | **Doppelte `ohneKommentare`-Definition** (ich hatte sie in den neuen Test kopiert — genau die Sünde, gegen die `tests/eine-regel-eine-stelle.test.js` wacht) | eigener Helfer entfernt, Import aus `tests/helfer/ohne-kommentare.js`; der Wächter, der es fand, ist grün |

**Gate-Stand nach diesen Änderungen:** `npm run lint` 0 · `npm test`
**1232/1232, 0 rot** · `npm run checks` **21 Gates, 0 Verstöße** (63,7 s) ·
`npm run build` ok · `npm run validate` ok · Alt-Replay `d013a3ae` unverändert.

---

## 1b. Nachtrag 2026-10-02 (zweiter Commit `1037a53`)

| # | Punkt | Beleg |
|---|---|---|
| 9 | **Der eine rote Volllauf-Test kippte über die Testumgebung, nicht über das Spiel** — `profiling.spec.mjs` „Bildzeiten messen (Software-Rasterung)": die Bilder schleife war nur über die BILDZAHL begrenzt (300), und unter SwiftShader sind das 241,7 ms × 300 = **72 s in einem einzigen `page.evaluate`**. Playwright brach mit „Execution context was destroyed" ab. Isoliert war der Test auf BEIDEN Seiten grün (HEAD 6/6, mit v9 6/6) — der A/B hat ihn entlastet, dieser Commit behebt ihn | Messung: 241,7 ms/Bild, 4,1 fps, Faktor 14,5× Budget. Jetzt `MESS_ZEITGRENZE_MS = 45_000`; Zusicherung von „300 Bilder" auf „mindestens 60" (Perzentile sind ab ~60 belastbar). **Ergebnis: 6/6 grün, Laufzeit 8,1 → 6,3 min.** Mutationsprobe in einer Kopie (Grenze auf 50 ms): **4 von 6 fallen** gezielt mit „zu wenige Bilder gemessen (1)" — der Wächter greift weiterhin |

**Merksatz aus diesem Fund:** Ein Test, der eine feste MENGE verlangt, wo er
eine belastbare STICHPROBE braucht, prüft die Maschine. Dieselbe Verwechslung
steckte schon im fps-Budget (vor der Kartenvergrößerung) und im
Terrain-Budget — dort jeweils behoben, hier zum dritten Mal.

---

## 2. Sofort und klein (kein Design-Entscheid nötig)

| # | Punkt | Beleg | Aufwand |
|---|---|---|---|
| 2.1 | **7 Exporte ohne externen Leser** entfernen oder Leser belegen: `resolveStrike`, `fuseTicksFor`, `GERAETE_SCHLUESSEL`, `isValidAngle`, `isValidPower`, `applySelfEffect`, `renderGroundOnGpu` | `docs/abnahme-bugs-2026-10-01.md` §3.3 (Werkzeug meldet nur 5 — zwei fehlen, s. u.) | klein |
| 2.2 | **Werkzeug-Blindstelle:** `unbenutzteExporte()`/`unbenutzteKonstanten()` lesen ohne `streicheKommentare` → Kommentarnennungen gelten als Leser | `tools/audit-mcp/lib/statisch.mjs:333`, `:393`; Beweis: `applySelfEffect` + `renderGroundOnGpu` fehlen in der Werkzeugliste | klein |
| 2.3 | **`gameServer.js` `#readBody`: ungültiges JSON → still `resolve({})`**, kein Log | `src/server/gameServer.js:1421` — die **einzige** stille Stelle im Baum (11 weitere `catch` sind dokumentiert oder melden) | klein |
| 2.4 | **`karte_unerreichbar`/`projectile_expired` am Kartenrand**: Geschoss verlässt die Karte ohne jede Rückmeldung (der Zeitablauf detoniert) | `docs/verkabelung.md` §F | klein |
| 2.5 | **„Bot-KI" in 18 Kommentaren** (nicht 22 — Zahl im Register falsch) | `docs/abnahme-bugs-2026-10-01.md` §2 C-6: **kein** Kommentar widerspricht `server/index.js:34`, es ist eine Ordnungsfrage | klein |
| 2.6 | **5 Fremd-Werkzeugdateien im Wurzelverzeichnis** (`AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `.aiderignore`, `.roo/`) | U-1: ungefüllte Vorlagen; `CONTRIBUTING.md` verlangt **TypeScript strict**, das Projekt ist JavaScript — eine falsche Anweisung an jeden folgenden Agenten. `AGENTS.md` ist genau die Datei, die Agenten lesen | klein |
| 2.7 | **`ballisticsWasm.js` ist ein Stub** (`isWasmSupported` re-exportiert, 0 Aufrufer) | `src/engine/physics/ballisticsWasm.js:2/18` | klein–mittel |
| 2.8 | **Barrel-Dubletten**: 4 Barrels / 148 Zeilen ohne Produktkonsument, **14 wortgleiche Zeilen** zwischen Client- und Server-Barrel | `docs/abnahme-bugs-2026-10-01.md` §7 #2 | klein–mittel |

---

## 3. Größer / braucht einen A/B-Beleg

| # | Punkt | Beleg | Aufwand |
|---|---|---|---|
| 3.1 | **`step()` baut den Zustand umsonst** — `getState()` 2× je Tick, ~46 % des Ticks | `npm run perf`; Server baut 2× (`gameServer.js:395/396`). Ersparnis ≈ 0,17 % des Budgets — **klein, aber belegt** | klein |
| 3.2 | **Online zeigt der Client eine ANDERE Karte als der Server** (34,0 % abweichende Zellen) — **zurückgestellt 2026-10-02:** `terrainPreview.js` ist eine von **einer** E2E-Spezifikation gedeckte Fläche; der Umbau braucht den vollen E2E-Lauf als Beleg, und die alte Messung (Seed 3367130477) ist gegen „gleicher Seed = gleiche Bitmap" nicht mehr reproduzierbar. **Erst messen, dann bauen** | | mittel |
| 3.3 | **WebP für Kulissen (JPG) und Sprites (PNG)**: gemessen −27,2 % bzw. −35,7 % am Sample, hochgerechnet −3,1 MB / −2,8 MB | `docs/abnahme-optimierung-2026-10-01.md` §6 #1/#2 | mittel |
| 3.4 | **Sourcemap nicht ausliefern** — 2 048 349 B im `dist/` | §6 #3, **eine Zeile** | klein |
| 3.5 | **`#handleConnection` 362 Zeilen / 38 `this.`**; `guentherSystem.update` 171 Z. / 66 `this.` | C-8 (Register-Zahlen 282/26 sind überholt) | groß |
| 3.6 | **`toPersisted` ist eine zweite Fassung von `serializeLobby`**, der Speicherpfad benutzt die Kopie in `persistence.js` | `docs/verkabelung.md` §A | mittel |
| 3.7 | **`CONTROL.RESUME` angekündigt, nie implementiert** — der Sitzplatz-Token lebt nur im Tab; nach einem Neuladen kann sich niemand fortsetzen | §H | mittel |
| 3.8 | **`CONTROL.START_MATCH` im Livebetrieb unerreichbar** — kein Client sendet es; die Prüfung „alle Teams besetzt" existiert zweimal, nur einmal wird sie durchlaufen | §H | klein–mittel |
| 3.9 | **`ProjectilePool`/`TerrainSync` sind tote Umsetzungen lebender Logik** (Projektil-Pool, Krater-Spiegelung) | §D2/§A | mittel |

---

## 4. UX (aus `docs/abnahme-ux-2026-10-01.md` §5, mit lfd. Nummerierung)

| Nr. | Punkt | Aufwand |
|---|---|---|
| UX-1 | Steuerungsliste nach oben (heute unter neun Blöcken und dem Startknopf) — **der erste Blick verrät nicht, wie man spielt** | klein |
| UX-3 | `W`/`S` halten-fähig machen (heute 45 Tipps für 45 Kraftpunkte, `event.repeat` wird verworfen) | klein |
| UX-4 | Rückfrage-Widerspruch `abortMatch` (Kommentar „nur der Knopf fragt" — beide Aufrufer fragen) | klein |
| UX-6 | „Revanche" startet nicht, sondern öffnet nur das Menü | klein–mittel |
| UX-7 | **Es gibt keinen Klangschalter**, obwohl `SoundMixer#setzeAn` existiert; bei blockiertem AudioContext bleibt alles stumm **ohne Meldung** | mittel |
| UX-9 | Ablehnungsmeldung ohne Restzugzeit | klein |
| **UX-Testlücken** | **Maus** (0 Treffer `page.mouse`), **Touch** (0), **Hochformat** (0), kleines Fenster (0), `W`/`S`-Wirkung (0), Onboarding-E2E (0) | mittel je Punkt |

> Vom Auftraggeber als **Content-/Designfrage** zu entscheiden: UX-10
> (Erstkontakt-Führung) — nicht eigenmächtig bauen.

---

## 5. Betrieb / Release (nicht im Code lösbar)

- **Rollback fehlt vollständig**, keine Release-Tags (`git tag -l` → nur ein
  Archiv-Tag). `docs/abnahme-deploy-2026-10-01.md` §4.2.
- **`PA_MAX_MACHINE_MINUTES` ist AUS** — die Kostenbremse greift nur, solange
  der Server läuft. Ohne sie gibt es **keine** Frist, die einen vergessenen
  Knoten abschaltet.
- Marker `/etc/projectarmageddon/ist-gemietet` fehlt → **die Bremse ist nicht
  scharf** (Trockenlauf heute nachgefahren: „NICHT SCHARF").
- `docs/betrieb-INSTANZ.md` hat **fünf `LÜCKE`-Felder**: Name, Zweck,
  Instanztyp, Preis/h, Besitzer — plus Höchstdauer und Worst Case.
- Vor öffentlicher Erreichbarkeit, in dieser Reihenfolge: Firewall → TLS via
  Caddy/nginx → Anmeldung → Ratenbegrenzung.
- systemd-Anschluss nur auf Syntax geprüft, nie angeschlossen.

---

## 6. Andere Projekte (gehören nicht in dieses Repo)

- **HP-Umzug** (`~/am-hautcheck/SYSTEM-TODOS.md`): VSCodium, DeepCode, Hermes,
  FreeLLMAPI, opencode, Skills, MCP-Server auf den EliteDesk; **offener Blocker:
  die API-Keys** (`DEEPSEEK_API_KEY`, `COMETAPI_KEY`, `KIE_API_KEY`,
  `FREELLMAPI_API_KEY` werden von der Config erwartet, liegen aber nicht in
  `~/.bashrc`); KDE Connect braucht einen Klick am Telefon; Fotos/Videos noch
  nicht umgezogen.
- **audioMONASTRY** und **cpsMONK**: keine offenen Punkte aus dieser Sichtung.

---

## 7. Werkzeug-Schulden (Cron + MCP)

- `tests/*.test.js`-Zahl steht im README bei **126 / 1230** — nach diesem Zug
  **127 / 1232**? Nein: die Dateizahl ist **unverändert 126** (kein neuer Test,
  `status-marke-online.test.js` ist gewachsen). Die Testzahl **1232** muss im
  README und in MASTERDOTO nachgezogen werden (`npm run check:docs` prüft sie).
- `npm run audit:bericht` schreibt **fest** nach `docs/audit-tief.md` und
  überschreibt damit einen getrackten Bericht — für Einzelprüfungen die
  Einzelsonden nehmen.
- `npm run audit:tief` existiert nicht (nur `audit:liste`, `audit:status`,
  `audit:bericht`).

## 5. Nachtrag 2026-10-02 (dritter Commit `dd30534`) — drei Auftraege parallel abgearbeitet

Drei Subagenten an **disjunkten** Dateigruppen, Auftragsspeicher
`docs/bgworker-todo-2026-10-02.json` (mit `besitzt`/`verboten` und Phasenregel).
Der Agent hat jeden Bericht am Code nachgeprueft, nicht geglaubt.

| # | Punkt | Beleg |
|---|---|---|
| 10 | **Audit-Werkzeug: Kommentare zaehlten als Leser** — `unbenutzteExporte()`/`unbenutzteKonstanten()` in `tools/audit-mcp/lib/statisch.mjs` lasen ohne `streicheKommentare`. Ein Name, der nur in einem Fremd-Kommentar stand, galt als gelesen | **5 → 7 unbenutzte Exporte.** Die zwei neu gemeldeten (`applySelfEffect`, `renderGroundOnGpu`) hatten als einzige Fremdnennung eine Kommentarzeile. Kein Ueberschiessen: Konstanten 0 vor/nach, echter Import bleibt ungemeldet. Gegenprobe als `tools/audit-mcp/probe-kommentar-leser.mjs` beigelegt (Wegwerf-Projekt, Platzhalter-Namen) |
| 11 | **Die einzige stille Stelle des Servers** — `#readBody` (gameServer.js:1411) machte ungueltiges JSON ohne Meldung zu `{}` | Leerer Body bleibt still, ungueltiges JSON und Stream-Fehler melden jetzt im Dateiformat. **HTTP-Status bewusst NICHT geaendert** (externer Vertrag) — Entscheidung offen. Mutationsprobe: Meldung ausgebaut → Test faellt (`0 !== 1`) |
| 12 | **Sieben `export` ohne externen Leser** entfernt (Funktionen bleiben) | Ueber Import-Bindungen geprueft, nicht per `grep`: die zwei „Treffer" waren Kommentarzeilen. Kein Barrel re-exportiert sie |

**Zwei Lehren, die der Agent selbst gemacht hat:**

1. Ein Kind baute die **Gegenprobe richtig, aber den Fix nicht** — und setzte dann
   in seiner eigenen Sonde stillschweigend voraus, „die Kopie hat den Fix schon".
   Ungeprueft. Der Fix fehlte. Lehre: eine Sonde, die den Fix voraussetzt, beweist
   ihn nicht.
2. Dasselbe Kind hinterliess eine **Debug-Datei in `lib/`**. Sie wanderte in jede
   Kopie mit und liess seine eigene Gegenprobe scheitern — die Sonde war nie
   falsch, der Baum war schmutzig. Lehre: erst den Baum putzen, dann messen.
