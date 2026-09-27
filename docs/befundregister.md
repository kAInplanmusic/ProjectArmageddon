# Befundregister — Prüfrunde 2026-09-27

**Zweck:** Jeder Befund aus den vier Prüfberichten an EINER Stelle, mit Beleg, Schwere,
Stand und Zuständigkeit. Die Berichte selbst bleiben die Beweisquelle; hier steht nur,
was daraus folgt und wer es hat.

**Quellen:**
`docs/audit-ui-spielersicht.md` (722 Z.) · `docs/audit-ui-ablauf.md` (565 Z.) ·
`docs/audit-arch-grenzen.md` (589 Z.) · `docs/audit-arch-datenfluss.md` (505 Z.)

**Schwere:** **A** = Spielspaß/Flow kaputt oder stiller Fehler · **B** = stört ·
**C** = Ordnung.
**Stand:** ✅ erledigt · 🟡 beauftragt · ⬜ offen · ❌ Fehlalarm (widerlegt).

---

## 0. Was ich selbst nachgeprüft habe (nicht nur übernommen)

Behauptungen von Arbeitern werden hier nicht geglaubt, sondern gemessen. Diese vier habe
ich im Code selbst gelesen:

| Befund | Prüfung | Ergebnis |
|---|---|---|
| Aufladen ist eine Attrappe | `input.js#releaseCharge` + `main.js#fire` | **bestätigt** — `#charging = false` steht VOR `onFire()`, der Lade-Zweig ist toter Code |
| Online ist die Klangebene weg | `ereignisse.js:216/236/245/293` + `shot.online:296-299` | **bestätigt** — die vier Mischer-Aufrufe liegen in den nur-lokalen Zweigen |
| Protokoll nur 4–5 Zeilen sichtbar | `index.html:257` | **bestätigt** — `max-height: 108px; overflow: hidden` |
| Mahlstrom-Schwelle zweimal | `main.js:1194` | **bestätigt** — Client rechnet hart `>= 15` |

---

## A — Was den Spielspaß trifft

| # | Befund | Beleg | Schwere | Stand |
|---|---|---|---|---|
| A-1 | **Aufladen wirkt nicht** („halten = mehr Kraft" ist unwahr) | `input.js:178-181`, `main.js:1351-1354`, README ~142, `index.html` ~1028 | A | 🟡 Worker J |
| A-2 | **Keine Ladeanzeige** — `chargeRatio` existiert, niemand zeichnet ihn | Getter in `input.js`, 0 Treffer in renderer/hud | A | 🟡 Worker J |
| A-3 | **Online stumm** — Schuss, Explosion, Mündungsfeuer fehlen | `ereignisse.js:216/236/245/293` vs. `:296-299` | A | 🟡 Worker J |
| A-4 | **Protokoll unsichtbar** — 4–5 Zeilen statt 60 | `index.html:257` | A | 🟡 Worker J |
| A-5 | **Todesmeldungen verdrängen die Aussage** — 26 `danger` gegen Budget 20 | Messung im Bericht | A | 🟡 Worker J |
| A-6 | **Mahlstrom online 7 Runden unsichtbar** — Motor 8, Client 15 | `main.js:1194`, `renderer.js:1117` | A | 🟡 Worker K |
| A-7 | **Sidegrad erreicht den Client nie** — Bahn ±335 px | `main.js:1607` | A | 🟡 Worker K |
| A-8 | **Fallschaden bremst nicht** — 633 px Sturz, 0 Schaden | Schwelle 11 gegen Aufprall 9,62 | A | 🟡 Worker L |
| A-9 | **Abbruchknopf online nicht erreichbar** | `main.js:774`, `index.html:400` (`[hidden]` unüberstimmbar) | A | ⬜ |
| A-10 | **Abgelehnter Online-Beitritt hat keinen Rückweg** — nur eine Protokollzeile, kein Timeout | `main.js:913`, `gameServer.js:1205`, `lobby.js:369` | A | ⬜ |
| A-11 | **Trefferquote immer 1,0** — Taktwert wird nie fortgeschrieben | Fenster `240` immer durchlässig | A | 🟡 Worker K |
| A-12 | **`hasSpecialEffect` viermal, zwei unvereinbare Regeln — 89 von 150 Waffen abweichend** | `specials.js:234` (0 Leser) vs. `weapons.js:7128` | A | ⬜ |
| A-13 | **Revanche ergibt eine andere Karte** — Seed fehlt | baseSeed → anderer Hash | A | 🟡 Worker K |
| A-14 | **Versionsabweichung = schwarzes Bild ohne Meldung** | `decodeSnapshot` → `null` → `return` | A | ⬜ |

## B — Stört

| # | Befund | Beleg | Schwere | Stand |
|---|---|---|---|---|
| B-1 | Lebensbalken online mit fester 100; 32 echte Werte 48–195, **100 kommt nicht vor** | `main.js:1168`, `hud.js:365` | B | 🟡 Worker K |
| B-2 | Der Restore läuft einen Takt zu weit — alle Figuren 8 px tiefer, Kommentar „exakt derselbe Zustand" widerlegt | `gameServer.js:167/169` | B | 🟡 Worker K |
| B-3 | Zünder-Countdown online immer 0 | `renderer.js:820` | B | 🟡 Worker K |
| B-4 | `onJump`/`onWeaponDrop` an `hud.update` übergeben und dort **nie gelesen** | 0 Treffer | B | ⬜ |
| B-5 | `☠`/`↑`-Marken online fest auf leer/1 | Bericht | B | ⬜ |
| B-6 | Kader ohne Überlaufschutz bei 30–40 Figuren | Bericht | B | ⬜ |
| B-7 | Online-Feuern ohne Verbindung stumm (Nachbarn melden, `fire()` nicht) | Bericht | B | ⬜ |
| B-8 | `pruneDisconnected` hat **keinen** Produktionsaufrufer — Doku-Versprechen „Team verfällt" gilt nicht | Bericht | B | ⬜ |
| B-9 | Beim Trennen erfährt der verbliebene Spieler nichts | Bericht | B | ⬜ |
| B-10 | Letzter Beitretender liest „Warte auf Mitspieler: **2/2** Teams besetzt" | `attach` vor `session.start()` | B | ⬜ |
| B-11 | `R` heißt in der Keymap „Neustart", verlässt aber das Match | `index.html:1035` vs. `main.js:273-275` | B | ⬜ |
| B-12 | `karte_unerreichbar` lokal stumm; Code-Kommentar widerspricht dem Test | Bericht | B | ⬜ |

## C — Werkzeuge und Ordnung

| # | Befund | Beleg | Schwere | Stand |
|---|---|---|---|---|
| C-1 | `QUELTEXT` kennt kein `.json` — 2 Dateien / 169 178 Byte mit 0 Lesern unentdeckt | Werkzeug | C | 🟡 Worker M |
| C-2 | `EINSTIEG` fängt jedes `index.js` (auch das leere) | Werkzeug | C | 🟡 Worker M |
| C-3 | `doppelregeln()` sieht nur `const GROSSBUCHSTABEN` — Funktionen unsichtbar | Werkzeug | C | 🟡 Worker M |
| C-4 | „kein Importeur"-Wächter prüft **30 von 90** Dateien | Werkzeug | C | 🟡 Worker M |
| C-5 | `match.js` **3195/3200 = 5 Zeilen Luft** | `tests/shooting.test.js` | C | ⬜ |
| C-6 | „Bot-KI" in 22 Kommentaren als Begründung, obwohl `server/index.js:33` sie verneint | Bericht | C | ⬜ |
| C-7 | 4 Barrels / 137 Zeilen ohne Produktkonsument, mit 14 wortgleichen Kopien | Bericht | C | ⬜ |
| C-8 | `gameServer.js:1145` 282 Z. / 26 `this.`; `guentherSystem.update` 66 `this.` in 169 Z. | Bericht | C | ⬜ |
| C-9 | Kein Zeilenbudget außer für `match.js`; größte unbewachte Datei 7358 Z. | Bericht | C | ⬜ |

---

## ❌ Fehlalarme (widerlegt — damit sie nicht wiederkommen)

Ein widerlegter Befund ist ein Ergebnis, kein Nichts. Diese stammen von den Prüfern
**selbst** und aus meiner eigenen Arbeit:

| Behauptung | Urteil | Warum |
|---|---|---|
| Kisten-Windfaktor 0,8 gegen 1,0 sei wirksam | **widerlegt** | 0,40 px — wirkungslos |
| `PREDICTION_*` führten eigene Zahlen | **widerlegt** | sind Referenzen ohne eigene Zahl |
| Der erste Import-Scanner des Prüfers | **Fehlalarm** | mehrzeilige `import` nicht erfasst → 127 Phantom-Verletzungen |
| `projectile_expired` erreiche niemanden | **zurückgezogen** | Sonde las `payload.playerId` statt `entityId` |
| „43 Waffen ohne Wirkung" (frühere Runde) | **widerlegt** | der Standardlauf maß nur EINE Entfernung |
| „Meldung überlebt > 18 s" (meine eigene Messung) | **widerlegt** | maß die Zugehörigkeit zum Modell, nicht die Sichtbarkeit auf dem Schirm |

## Widerlegte Behauptungen in vorhandenen Berichten

| Bericht | Behauptung | Urteil |
|---|---|---|
| `hunter-ui.md` | alle Zeilennummern, inkl. des eigenen Nachtrags | **um exakt +113 verschoben** |
| `hunter-ui.md` | „die Anzahl der Kisten steht im HUD" | **falsch** — es gibt keinen Kistenzähler |
| `hunter-ui.md` | `dot_applied` online möglich | **falsch** |
| `ereigniskanal-filter.md` | „Wassertypen bleiben ungedrosselt" | **überholt** (heute gedrosselt) |
| `ereignis-info-gehalt.md` | „kein zustandstragendes Ereignis verloren" | **heute falsch** — 45276 → 1548 |
| `testgrenzen.md` | 974 Aufrufe / 93 Dateien / 35 955 Zeilen | **veraltet** — 1116 / 107 / 39 902 |
| `auftraege/online-sprung-und-abwurf.md` | „Sprung online stumm" | **überholt** mit O8 |

## ✅ Was die Prüfung bestätigt hat

- **Die Architektur ist sauber:** 90 Module, 249 Kanten, **0 Zyklen, 0 Schichtverletzungen**.
  Alle sechs verbotenen Richtungen kommen **null Mal** vor — doppelt geprüft (maschineller
  Graph und kommentarblindes grep).
- **Die Messzahlen der früheren Berichte stimmen auf die Nachkommastelle:** 142,65 KB/s ·
  47719 · 3991/2,46 KB/s · 88,9 % · 15066/15092 · 15092→516.
- **Drossel aktuell:** Fenster 30 Takte, fünf Arten, jede begründet, jede mit Kennungsfeld.
- `drowning: {}` ist der einzige Zweig-lose Eintrag im Wirkungskatalog (nachgerechnet).

---

## Zuständigkeit dieser Runde

| Arbeiter | Auftrag | Dateien |
|---|---|---|
| **J** | Spielgefühl: Aufladen, Klang online, Protokoll sichtbar | client/{input,main,ereignisse,renderer}.js, index.html |
| **K** | Stille Fehler: Sidegrad, Mahlstrom, Taktwert, Revanche-Seed | shared/protocol.js, stateSnapshot.js, systems, server |
| **L** | Fallschaden bremst den Charakter (Entscheidung des Auftraggebers) | engine/match.js, characterSystem.js, config |
| **M** | Blindheit der eigenen Werkzeuge | tools/audit-mcp/** |

**Regel für alle:** nie zwei Arbeiter auf derselben Datei; `npm test` und der E2E-Satz
laufen erst, wenn alle Schreiber ruhen (Lastartefakte sind keine Befunde); der
Zustandshash `9ec63e8c` des Altreplays ist das Kriterium für unveränderte Simulation —
außer wo der Auftraggeber eine Simulationänderung ausdrücklich erlaubt hat (A-8).

## Offen nach dieser Runde

Vollständiger Zug durch `MASTERDOTO.md` (offene Punkte über fünf Abschnitte) gegen dieses
Register — was hier steht, ist der Stand der Prüfung, nicht der Stand der Todos.
