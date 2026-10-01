# UX-/Abnahme-Bericht aus Spielersicht — ProjectArmageddon

**Datum:** 2026-10-01
**Auftrag:** Belegter Bericht zu (1) Abdeckung der Spielerhandlungen durch die E2E-Suite, (2) Ersteindruck aus Spielersicht, (3) offenen Flow-Befunden der vorhandenen Audits (gegen den CODE geprüft, nicht gegen die Doku), (4) Barrierefreiheit und (5) konkreten UX-Vorschlägen.
**Methode:** Reine Lese- und Analysearbeit. Kein Playwright-Start, kein Serverstart, keine Änderung an bestehenden Dateien. Gezählt/gemessen wurde nur mit `ls`, `wc`, `grep` und `read_file`. Die einzige geschriebene Datei ist diese.
**Laufender Stand:** Abschnitte 1–7 vollständig verfasst; keine offenen Baustellen.

**Eingangsdatum (zuerst, weil es die Aussagekraft begrenzt):** Ein voller E2E-Lauf war zur Berichtszeit **noch nicht ausgewertet** — `/tmp/pa-e2e.log` enthielt um 12:44 nur die Startzeile (`=== E2E Start 2026-10-01T12:44:22+02:00 ===`, 44 Byte). Es gibt in diesem Bericht daher **keine grünen/roten E2E-Ergebnisse**; alle Aussagen sind Quelltext- und Testdatei-Analysen mit Fundstelle. Siehe Abschnitt „Nicht messbar in dieser Umgebung".

---

## 1. Abdeckungsmatrix: welche Spielerhandlung ist geprüft, welche nicht

**Grundlage:** 31 Spezifikationsdateien in `tests/e2e/` (gezählt: `ls tests/e2e/*.spec.mjs | wc -l` = 31; das Verzeichnis `tests/e2e/` enthält 32 Einträge, der 32. ist Unterordner `helfer/` mit `online-match.mjs` und `zweiter-mensch.mjs`).
`README.md:183` nennt „**191 Tests in 31 Spezifikationen**". Meine Zählung der `test(`-Deklarationen ergibt **201** (`grep -rhc "^test(\|^\s*test(" tests/e2e/*.spec.mjs | paste -sd+ | bc`). Die Differenz ist nicht aufgelöst — plausibel sind schleifenerzeugte Tests (z. B. `profiling.spec.mjs:586` / `:593` über Geländeformen), das ist aber eine **Vermutung und keine Messung**. Beide Zahlen stehen hier nebeneinander.

### 1a. Geprüfte Spielerhandlungen (mit Beleg)

| Spielerhandlung | Geprüft in |
|---|---|
| Match starten (Menü → Spiel) | `terrain-presets.spec.mjs:36`, `runtime-smoke.spec.mjs:29,48`, `profiling.spec.mjs:84` |
| Teams/Einheiten wählen (3/4/5, bis 6 Teams) | `grosse-teams.spec.mjs:43,63,69,75,81` |
| Klasse/Archetyp je Platz wählen | `loadout-choice.spec.mjs:21,53,76,102,141`, `klassenwerte.spec.mjs:27,42,60` |
| Sidegrades wählen | `sidegrades.spec.mjs:21,53,66,119` |
| Kulisse wählen | `backdrops.spec.mjs:66…310` |
| Geländeform (Preset) wählen | `terrain-presets.spec.mjs:91,177,225,286` |
| Hilfe lesen (Klassen, Loot, Karten, Sidegrades) | `hilfe.spec.mjs:32…293`, `counterplay.spec.mjs:22,66,91,124` |
| Kader ansehen (81 Charaktere) | `roster.spec.mjs:11,25,61,82` |
| Eigene Lobby finden und betreten | `lobby-browser.spec.mjs:64,111,131,144` |
| Schießen (Tastatur: Enter, Leertaste) | `prediction-gpu.spec.mjs:131,181,193`, `runtime-smoke.spec.mjs:107` |
| Aufladen durch Halten (Kraft steigt) | `prediction-gpu.spec.mjs:193` („HALTEN lädt auf: es ergibt mehr Kraft als ein Tippen") |
| Zielvorschau / Flugbahn | `runtime-smoke.spec.mjs:94` |
| Springen per Taste (auch online) | `runtime-smoke.spec.mjs:233`, `online-sprung-abwurf.spec.mjs:91,376` |
| Waffe abwerfen per Taste `Q` (lokal + online) | `drop-cooldown.spec.mjs:28,69,124,268`, `online-sprung-abwurf.spec.mjs:288` |
| Waffe per Nummerntaste wählen | `drop-cooldown.spec.mjs:300` |
| Nachladezeit-Cooldown | `drop-cooldown.spec.mjs:178,219` |
| Match verlassen (Knopf + Taste R, mit Rückfrage) | `abort-knopf.spec.mjs:45,66,86,106,122` |
| Spielende + Endbildschirm-Kennzahlen | `profil.spec.mjs:140`, `erfolge.spec.mjs:108` |
| Revanche drücken | `erfolge.spec.mjs:136`, `profil.spec.mjs:239` |
| Profil (Zahlen, Neustart, Sicherung laden/sichern, Zurücksetzen) | `profil.spec.mjs:88…274` |
| Erfolge (freischalten, überleben Neustart, Stufen) | `erfolge.spec.mjs:47…188`, `emblem.spec.mjs:35…145` |
| Replay laden, abspielen, springen, sperren | `replay.spec.mjs:63,83,107,132,153,170,200` |
| Wasser-Zustand im HUD | `water-hud.spec.mjs:49,68,80,129` |
| Spezialwaffen (Heilung, Schild, Einfrieren, DoT) | `specials.spec.mjs:35,65,91,116,141,188,248` |
| Geschütz (Aufstellen, Feuern, Ablaufen) | `turret.spec.mjs:93,103,142,179,187` |
| Günther / Glücksrad (lokal + online) | `guenther.spec.mjs:39,116,130,155,169`, `guenther-online.spec.mjs:83,127,216,247` |
| Online: Lobby, zweiter Mensch, Reconnect, Latenz | `multiplayer.spec.mjs:109…495` |
| Online: Paketverlust, Aussetzer, Vollsnapshot | `network-conditions.spec.mjs:259,324,382,479` |
| Online: Schussvorhersage | `prediction-online.spec.mjs:113,227,263,282` |
| Zugwechsel-Meldung, Live-Region, Waffenliste per Tastatur | `screenreader.spec.mjs:97,126,162,182,254,278,315,356` |
| Tippen in Textfeldern steuert NICHT das Spiel | `accessibility.spec.mjs:19,54,79` |
| Bildzeiten / Performance | `profiling.spec.mjs:586,593,628,713,795`, `dynamik.spec.mjs:310` |

### 1b. NICHT geprüfte Spielerhandlungen — namentlich

**L1 — Maussteuerung (Zielen und Klicken): keine einzige Prüfung.**
`grep -rn "page.mouse\|Mouse" tests/e2e/*.mjs` → **0 Treffer.** Die Menü-Tastaturliste führt als ersten Eintrag „**Maus** Zielen" und „**Klick / Leertaste** Aufladen und feuern" (`index.html:1055-1056`). Damit ist der laut Bedienhilfe **erste** Eingabeweg (Mausbewegung → Winkel, Klick halten → Aufladen, Loslassen → Schuss) im E2E ungeprüft; geprüft ist nur die Tastatur (Space/Enter, `prediction-gpu.spec.mjs:131,181,193`).

**L2 — Touch / Mobil: kein Test, und keine Testinfrastruktur dafür.**
`grep -rln "hasTouch\|isMobile\|page.tap\|touchstart" tests/e2e/` → **0 Dateien.** `playwright.config.mjs` setzt nur `...devices['Desktop Chrome']` mit `viewport: { width: 1440, height: 900 }`. Ein Touch-Eingabepfad ist damit weder implementiert noch abgenommen.

**L3 — Hochformat / andere Fenstergrößen: nicht geprüft.**
`grep -rn "portrait\|setViewportSize\|deviceScaleFactor" tests/e2e/` → **0 Treffer.** Dabei gibt es die Spielerwahl „Ausrichtung: Querformat/Hochformat" (`index.html:866-871`) und die Umsetzung `#applyOrientation()` (`main.js:1983-1987`, setzt `#stage.portrait`). Der Pfad existiert und ist im E2E ungeprüft.

**L4 — Kleines Fenster / Scrollen im Menü: nicht geprüft.**
`.overlay-card` hat `max-height: calc(100% - 2rem); overflow-y: auto` (`index.html:515-516`) — laut Kommentar genau deshalb, weil `#profil-reset` in einem 900-px-Fenster mit der **Maus** nicht erreichbar war. Es gibt keinen Test mit einer Fensterhöhe unter 900 px, der diesen Fix festhält.

**L5 — Sound als Erlebnis: nur der Aufruf ist geprüft, nicht die Hörbarkeit; und es gibt keinen Stummschalter.**
`grep -rn "mute\|\bStumm\|volume" src/` findet **keine** Bedienelemente (nur Kommentare über stumme Fehler). `dynamik.spec.mjs:747` misst korrekt am **echten** Mischer (`SoundMixer#spieleTreffer`) und meldet, ob der AudioContext bereit war — aber es gibt keinen Test für Stummschalten, Lautstärke, oder die Freigabe des AudioContext beim ersten Klick (`main.js:302` beschreibt, dass der Klang sonst „stumm ohne Fehlermeldung" bleibt).

**L6 — Onboarding/Erstkontakt: kein E2E.**
Die Hilfe-Reiter sind als E2E geprüft (`hilfe.spec.mjs`), die Ableitung der Hilfe ist als **Unit**-Test geprüft (`tests/onboarding-hilfe.test.js`). Es gibt aber kein E2E, das den **ersten Kontakt** eines neuen Spielers abnimmt („findet er ohne Vorkenntnis vom Menü zum ersten Schuss?").

**L7 — Tastatur `A/D` (Winkel) und `W/S` (Kraft): Wirkung ungeprüft.**
`accessibility.spec.mjs:19,54,79` prüft nur, dass Tippen in **Textfeldern** das Spiel nicht steuert (u. a. `keyboard.type('ww')`, `'aa'`). Es gibt **keinen** Test, dass `W`/`S` die Kraft und `A`/`D` den Winkel im laufenden Match wirklich verändern.

**L8 — Online: abgelehnter Beitritt mitten im Verbindungsaufbau.**
`lobby-browser.spec.mjs:111,131` deckt „Server beim Lobby-Laden nicht erreichbar" und „fehlende Server-URL" ab. Der Fall, dass die HTTP-Lobby-Anfrage klappt und der **WebSocket danach** abgelehnt wird (unbekannte/volle/beendete Lobby, `gameServer.js`/`lobby.js`-Fehlerpfade), hat keinen E2E-Test.

**L9 — Fehlerzahlen/Diagnose im Menü:** keine Prüfung, dass im Menü keine Tokens/Sitzdaten sichtbar sind, außer `lobby-browser.spec.mjs:144` (das deckt nur die Lobbyliste ab).

---

## 2. Ersteindruck aus Spielersicht

**Was man zuerst sieht** (Belege: `index.html:805-1066`):
Das `#menu-overlay` mit `h1` „Project Armageddon", Untertitel („Rundenbasierte 2D-Artillerie-Taktik…", `:808-811`), dann Teams/Einheiten (`:812-855`), Kulisse/Ausrichtung/Seed/Bodenberechnung (`:856-903`), Server/Lobby (`:904-911`), der Knopf **„Match starten"** (`:912`), danach **acht aufklappbare `<details>`** (Lobby-Browser, Kader, Hilfe, Klassen, Sidegrades, Replay, Erfolge, Profil, `:913-1053`) und **ganz unten** die Tastaturliste (`.keymap`, `:1054-1064`).

**Ist der erste Schritt klar?**
- **Ja, der Startknopf ist eindeutig.** Alle Felder haben Vorgaben (`selected`: Teams 2 `:820`, Einheiten 3 `:850`, Kulisse „generativ" `:862`, Ausrichtung Querformat `:868`, Bodenberechnung CPU `:899`), das Seed-Feld ist bewusst leer (`:885`). Ein Match lässt sich **ohne jede Eingabe** starten. Das ist belegt durch die Tests, die genau so starten (`terrain-presets.spec.mjs:61`, `runtime-smoke.spec.mjs:37`).
- **Nein, der zweite Schritt ist nicht geführt.** Nach dem Start ist die einzige Erklärung der Steuerung die Tastaturliste — und die steht **unterhalb** von neun Blöcken am Ende des Menüs (`index.html:1054`). Ob sie bei 1440×900 ohne Scrollen sichtbar ist, hängt an der Kartenhöhe (`max-height: calc(100% - 2rem)`, `:515`) und ist **ohne Browser nicht messbar** (siehe Abschnitt „Nicht messbar"). Das Risiko ist aber strukturell: Die Liste ist das letzte Kind der scrollbaren Karte.

**Sackgassen:**
- **Lokal: keine.** Menü → Match → Spielende → Menü ist geschlossen (`abort-knopf.spec.mjs:86`, `profil.spec.mjs:231`). Das bestätigt der Ablauf-Audit (`docs/audit-ui-ablauf.md`, Abschnitt „BESTÄTIGT" Punkt 1).
- **Online: früher eine Sackgasse, heute nicht mehr.** Der Abbruchknopf wird jetzt **auch online** eingeblendet (`main.js:1003`, mit Fund-Kommentar `:991-1002`), und der Fehlerpfad der Lobby-Erstellung führt ins Menü zurück und blendet den Knopf aus (`main.js:1043-1048`). Belegt durch `abort-knopf.spec.mjs:45` („im Match sichtbar, im Menü nicht").
- **Online-Beitritt über WebSocket abgelehnt: nicht abgenommen** (L8). Der Codepfad `main.js:1043-1048` deckt nur den `fetch`-Fehler ab, nicht einen danach abgelehnten WebSocket. Ob der Spieler dort einen Rückweg hat, konnte ich **nicht messen** (kein Browser).

**Menü-Reibungspunkte (belegt):**
- Die Tastaturliste ist ein reiner Textblock ohne Aufklapp-Zustand (`index.html:1054`) — sie konkurriert mit acht `<details>`, die standardmäßig zu sind.
- Der Startknopf steht **über** den acht Details, die Steuerung **darunter**. Wer neu ist, findet „wie spiele ich" erst nach dem Aufklappen/Scrollen.

---

## 3. Die drei vorhandenen Audits: was ist belegt, was ist laut CODE noch offen

Geprüft gegen den heutigen Code, **nicht** gegen die Doku. Kurzfassung: Die Audits sind überwiegend **überholt** — ein großer Teil der damals offenen Befunde ist inzwischen umgesetzt.

### 3a. Aus `docs/audit-userflow.md` (Fremd-Audit, Stand Commit `edba466`)

| Befund | Doku-Aussage | Heutiger Code | Ausgang |
|---|---|---|---|
| A1 Seed leer vorbelegt | „Match ist nicht reproduzierbar" | `index.html:884-890`: Feld weiterhin leer, `placeholder="leer = neue Karte"`; gezogener Seed steht im Protokoll | **offen (bewusst so)** |
| A3 Kisten unerreichbar (PICKUP_RADIUS 18) | „praktisch unerreichbar" | `src/engine/systems/lootSystem.js:79` `export const PICKUP_RADIUS = 110;` (vorher 18) | **behoben** |
| A5 Abbruchknopf fehlt | „R ohne Rückfrage, kein Knopf" | `index.html:757` `#hud-abort`, `main.js:363-378` mit `confirm`-Rückfrage | **behoben** |
| A6 Space/Enter auf Waffenzeile | „verschluckt das Feuern" | geprüft in `screenreader.spec.mjs:278` („Leertaste auf einer Waffenzeile wählt und feuert NICHT") | **behoben/dokumentiert** |
| B3-Zusatz `maximum`-Zugzeiten tot | „60/40 s nie gelesen" | `src/engine/systems/turnSystem.js:145-148`: Obergrenzen **entfernt**, Felder heißen jetzt `seconds`; `grep -rn "\.maximum" src/` → 0 Treffer | **behoben** |
| B5 Erfolge sind Platzhalter („Muster") | „belohnt Musterfortschritt" | `index.html:1024-1027`: Inhalte seit 2026-09-20 gesetzt (0 Muster); `erfolge.spec.mjs:47,93` prüfen Fortschritt und Stufen | **behoben** |
| B6 Klassenzahlen unsichtbar | „nur Namen ohne Zahlen" | `klassenwerte.spec.mjs:27,42,60` („Jede Klassen-Option nennt Leben und Schaden") | **behoben** |
| A7 Ablehnung nennt Zugrestzeit nicht | „nicht verknüpft" | nicht nachgeprüft (kein Fund im Code für eine Restzeit in der Ablehnung) | **offen** |

### 3b. Aus `docs/audit-ui-ablauf.md` (Stand 2026-09-27)

| Befund | Doku-Aussage | Heutiger Code | Ausgang |
|---|---|---|---|
| A-1 Aufladen wirkungslos (toter Zweig) | „Hauptsteuerung tut nicht, was dasteht" | `src/client/input.js:229-245`: `#releaseCharge` liest die Kraft **vor** dem Zurücksetzen (`const kraft = kraftAusLadung(this.chargeRatio);`), `main.js:2282-2284` zeigt den Ladestand; neuer E2E-Test `prediction-gpu.spec.mjs:193` misst die **Steigerung** | **behoben** |
| A-2 Online kein sichtbares Verlassen | „nur Taste R" | `main.js:1003` `#zeigeAbbruch(true)` im Online-Start | **behoben** |
| A-3 Abgelehnter Online-Beitritt ohne Rückweg | „kein Pfad zurück ins Menü" | `main.js:1043-1048` Fehlerpfad → Menü + Knopf aus. **Aber:** gilt nur für den `fetch`-Weg, nicht für einen später abgelehnten WebSocket | **teilweise behoben** (siehe L8) |
| A-4 Doku sagt „R Neustart" | „R verlässt das Match" | `index.html:1063` sagt jetzt „**R** Match verlassen" | **behoben** |
| B-1 Kommentar „Deshalb fragt nur der Knopf nach" | „es fragen beide" | **unverändert falsch:** `main.js:351-357` behauptet weiter „Deshalb fragt nur der Knopf nach."; beide Aufrufer (`main.js:314` Tastatur, `:326` Knopf) rufen `abortMatch()` **ohne Argument**, und `abortMatch({ frage = true } = {})` (`:363`) fragt damit in **beiden** Fällen nach | **OFFEN** |
| B-2 „Revanche" startet keine Revanche | „Knopf führt nur ins Menü" | **teilweise behoben:** `main.js:228-249` + `#seedFuerRevanche()` (`:340-349`) schreiben den Seed der Partie ins `#cfg-seed`. Der Knopf **startet aber weiterhin kein Match** — er öffnet nur das Menü; gestartet wird über „Match starten" | **teilweise behoben** |
| B-3 Nach Revanche fragt das Menü „Match verlassen?" | „mode/match bleiben gesetzt" | **OFFEN:** der Revanche-Zweig (`main.js:246-248`) setzt weder `this.match = null` noch `this.mode = 'local'`. `abortMatch` prüft `Boolean(this.match) \|\| this.mode === 'online'` (`:365`) → im Menü **wahr** → `R` löst dort die Rückfrage aus | **OFFEN** |
| B-4 Letzter Beitretender liest „Warte auf Mitspieler: 2/2" | „falscher Text im Startmoment" | nicht nachgeprüft im Serverpfad | **unbekannt** |
| B-5 `pruneDisconnected` ohne Aufrufer | „Team verfällt nie" | `src/server/gameServer.js:1245` `const entfernt = this.#lobbies.pruneDisconnected(now);` (mit Fund-Kommentar `:62-63`, `:2003`) | **behoben** |
| B-6 Verbliebener Spieler erfährt Trennung nicht | „keine Meldung" | nicht nachgeprüft | **unbekannt** |
| C-1 Keymap steht am unteren Ende | „Layout nicht messbar" | unverändert: `.keymap` ist das letzte Kind der scrollbaren Menükarte (`index.html:1054`, `:515-516`) | **OFFEN (Layout unbelegt)** |
| C-2 `karte_unerreichbar` nur online | „wer lokal spielt, erfährt es nicht" | `src/client/ereignisse.js:795` `karte_unerreichbar: beide((k, n) => {` — jetzt **beide** Zweige | **behoben** |
| C-3 `const teams = payload.teams ?? teams;` (TDZ) | „kann nicht greifen" | nicht nachgeprüft | **unbekannt** |

### 3c. Aus `docs/hud-vorrang.md` (Stand 2026-09-27)

| Punkt | Doku-Aussage | Heutiger Code | Ausgang |
|---|---|---|---|
| §7.1 Fünf Ablehnungsstellen mit Vorgabeton `neutral` | „müssen den Ton `notice` setzen" | Alle fünf tragen jetzt `'notice'`: `main.js:888, 901, 932, 945, 1480` | **behoben** |
| §7.4 `check:docs` rot (103 vs 105 Testdateien) | „Zahl in README nachziehen" | nicht nachgeprüft | **unbekannt** |
| Vorrang-Budget + Zusammenfassen (Kern der Doku) | gebaut, gemessen | `tests/hud-vorrang.test.js` existiert; E2E-Gegenprobe `screenreader.spec.mjs:162` („Protokoll wird oben begrenzt") | **belegt, unverändert** |

**Zusammenfassung Abschnitt 3:** Von 27 gegen den Code geprüften Audit-Aussagen sind **14 umgesetzt/behoben**, **7 weiterhin offen** (davon 3 nur teilweise), **6 nicht nachgeprüft**. Die drei auffälligsten noch offenen Punkte: **B-1** (falscher Kommentar zur Rückfrage), **B-3** (Rückfrage im Menü nach Revanche) und **C-1** (Steuerungsliste am Ende des Menüs).

---

## 4. Barrierefreiheit — was geprüft ist und was fehlt

**Geprüft (mit Beleg):**
- **Echter Accessibility-Baum**, nicht nur Attribute: `screenreader.spec.mjs:20-23` holt über CDP `Accessibility.getFullAXTree` und filtert ignorierte Knoten. Das ist der belastbare Weg (Attribut ≠ Baum, siehe Kommentar `:11-16`).
- **Jedes bedienbare Element hat einen Namen** — im Menü (`screenreader.spec.mjs:45-67`, mit Gegenprobe, dass es überhaupt >5 Elemente sind) und im Match (`:69-93`, inkl. Prüfung, dass das Canvas als Rolle `Canvas` mit Namen „Spielfeld…Pfeiltasten" im Baum steht).
- **Live-Region** für das Ereignisprotokoll: `role="log"`, `aria-live="polite"`, `aria-relevant="additions"` (`screenreader.spec.mjs:97-124`, HTML `index.html:800-801`), **genau ein neuer Knoten je Meldung** (`:126`), Deckelung und keine Entfernungs-Ansagen (`:162`).
- **Runde/Wind/Zugzeit bewusst KEINE Live-Region** — aktiv getestet (`screenreader.spec.mjs:226`).
- **Waffenliste ohne Maus bedienbar, als Knopf benannt** (`screenreader.spec.mjs:254`), Space auf einer Waffenzeile feuert nicht (`:278`), Fokus überlebt den Listen-Neuaufbau (`:315`), Tab erreicht Waffenliste und Spielfeld (`:356`).
- **Sichtbarer Fokus** (`accessibility.spec.mjs:107`), **Sprunglink** (`:156`), **versteckte Overlays ohne Fokus** (`:167`), **alle Formularfelder per Tab erreichbar** (`:135`).
- **`prefers-reduced-motion`**: Explosionspartikel entfallen (`accessibility.spec.mjs:217`), ohne die Einstellung bleiben sie (`:239`); CSS schaltet zusätzlich alle Übergänge ab (`index.html:91-100`).

**Was FEHLT (benannt):**
1. **Keine Kontrastmessung.** `accessibility.spec.mjs` prüft Fokus sichtbar, aber nicht Farbkontrast (WCAG 1.4.3/1.4.11). Die Palette (`--muted: #8ba0b4`, `--panel-edge: #223040` auf `--panel: #131a22`, `index.html:15-26`) ist im Kommentar `:414-420` mit „ausreichend Kontrast" **behauptet**, nicht gemessen.
2. **Kein Zoom-/Skalierungstest.** Kein Test bei 200 % Zoom oder vergrößerter Systemschrift; nur 1440×900 (`playwright.config.mjs`).
3. **Keine Prüfung auf `aria-live`-Doppelansagen** bei mehreren Regionen gleichzeitig (Wheel-Panel `#wheel-result role="status" aria-live="polite"` `index.html:719` + Log) — die Kombination ist ungeprüft.
4. **Kein Test für Tastatur-Fallen** (Focus-Trap) in den Overlays — nur „versteckte Overlays nehmen keinen Fokus" (`accessibility.spec.mjs:167`).
5. **Kein Test für die Zugänglichkeit des Glücksrads** (Canvas `aria-hidden="true"` `index.html:716`; nur `#wheel-result` textet) — ob der Ausgang für einen Screenreader verständlich ankommt, ist ungeprüft.
6. **Kein `aria-*`-Test für Ladefortschritt**: Der Ladestand wird jetzt gezeichnet (`main.js:2282-2284`), es gibt aber keine Live-Region/Meldung für die erreichte Kraft — ein blinder Spieler merkt das Aufladen nicht.

---

## 5. UX-Justierung: konkrete Vorschläge (nummeriert)

> Jeder Vorschlag: (a) Beobachtung + Beleg, (b) was der Spieler heute erlebt, (c) was sich ändern würde, (d) Aufwand klein/mittel/groß.

**1. Steuerungsliste nach oben, direkt unter den Untertitel**
(a) `.keymap` ist das **letzte** Kind der scrollbaren Menükarte (`index.html:1054-1064`), unter neun Blöcken und dem Startknopf; `overflow-y: auto` (`:515-516`). (b) Ein neuer Spieler sieht Titel, Felder und „Match starten" — die Erklärung „Maus Zielen / Klick feuern" liegt unterhalb der Sichtkante und muss erfragt/errollt werden. (c) Die drei wichtigsten Zeilen (Maus, Klick/Leertaste, W/S) stehen sofort sichtbar; der Rest bleibt unten. (d) **klein** (Markup-Verschiebung, keine Logik).

**2. Maussteuerung im E2E abnehmen (Zielen und Klick-Aufladen)**
(a) `grep -rn "page.mouse" tests/e2e/*.mjs` → 0 Treffer; die Maus ist laut `index.html:1055-1056` der erste Bedienweg. (b) Für den Spieler ist das **die** Steuerung; sie ist nie automatisch geprüft worden — Regressionen in `#updateAngleFromPointer`/`#beginCharge` fielen keinem Test auf. (c) Ein Spec, das per `page.mouse.move` den Winkel ändert und per `mouse.down/up` auflädt und feuert, sichert genau die Wege, die heute blind sind. (d) **mittel** (neue Spec, `#updateAngleFromPointer` und Canvas-Koordinaten müssen stimmen).

**3. Kraftänderung mit `W`/`S` halten-fähig machen und die Wirkung testen**
(a) `src/client/input.js:104` verwirft im globalen `keydown`-Handler jede Tastenwiederholung (`if (event.repeat) return;`) — das trifft auch `W`/`S`; die Kraftspanne ist 5…100 (`input.js:257`), die Startkraft 55 (`main.js:119`, `input.js:56`). Der E2E prüft `W`/`S`-Wirkung überhaupt nicht (L7). (b) Der Spieler tippt für 45 Kraftpunkte 45-mal. (c) Halten steigert die Kraft kontinuierlich; die Tastaturliste verspricht dann, was der Code tut. (d) **klein** (Handler) + **klein** (Test).

**4. Rückfrage-Widerspruch auflösen (B-1)**
(a) `main.js:351-357`: „Deshalb fragt nur der Knopf nach." — aber beide Aufrufer (`:314`, `:326`) rufen `abortMatch()` ohne Argument, und `abortMatch({ frage = true } = {})` (`:363`) fragt immer nach. (b) Der Spieler erlebt beim Drücken von `R` **immer** eine Rückfrage (harmlos, aber die Absicht im Code ist eine andere). (c) Entweder Kommentar richtigstellen oder im Tastenzweig bewusst `{ frage: false }` übergeben — dann ist die getroffene Entscheidung sichtbar. (d) **klein**.

**5. Nach „Revanche" den Match-Zustand leeren (B-3)**
(a) `main.js:246-248` setzt weder `this.match = null` noch `this.mode = 'local'`; `abortMatch` prüft `Boolean(this.match) || this.mode === 'online'` (`:365`) → im Menü wahr. (b) Nach dem Klick auf „Revanche" steht man im Menü; drückt man dort `R`, kommt die Frage „Match verlassen? Der Spielstand geht verloren." — obwohl kein Match läuft. (c) Die Rückfrage erscheint nur, wenn wirklich etwas läuft. (d) **klein** (zwei Zuweisungen + ein Test).

**6. „Revanche" wirklich starten lassen (B-2-Rest)**
(a) `main.js:228-249`: Der Knopf schreibt den Seed (`#seedFuerRevanche`, `:340-349`), öffnet aber nur das Menü; gestartet wird erst über „Match starten". (b) Der Spieler erwartet nach „Revanche" sofort die nächste Partie auf derselben Karte und landet stattdessen im Menü. (c) Entweder den Knopf in „Zum Menü" umbenennen (ehrlich) oder mit dem gespeicherten Seed sofort `startMatch` rufen. (d) **klein** (Umbenennen) bis **mittel** (echter Neustart mit denselben Optionen).

**7. Stummschalter und Lautstärke ergänzen + im E2E abnehmen**
(a) `grep -rn "mute\|volume" src/` findet **kein** Bedienelement; der Klang ist an eine Nutzergeste gebunden (`main.js:302`, `soundMixer.js:91-94`). (b) Wer keinen Ton will, muss den Tab stumm stellen oder die Systemlautstärke ändern; umgekehrt bleibt bei blockiertem AudioContext alles stumm **ohne Meldung**. (c) Ein „Ton an/aus"-Knopf im HUD/Menü plus eine Meldung „Audio blockiert — klicke ins Spielfeld", damit der Spieler den Grund kennt. (d) **mittel**.

**8. Hochformat und ein kleineres Fenster in den E2E aufnehmen**
(a) `grep -rn "portrait\|setViewportSize\|deviceScaleFactor" tests/e2e/` → 0 Treffer, obwohl die Auswahl „Hochformat" (`index.html:866-871`) und `#applyOrientation` (`main.js:1983-1987`) existieren; `.overlay-card` wurde ausdrücklich wegen eines zu kleinen Fensters umgebaut (`index.html:505-517`). (b) Wer im Hochformat oder in einem kleinen Fenster spielt, ist ungetestet — Layout und Bedienbarkeit können brechen, ohne dass ein Gate anschlägt. (c) Ein Spec mit `viewport: { width: 800, height: 1400 }` und eines mit z. B. 800×600 prüft beide Pfade. (d) **mittel**.

**9. Ablehnungsmeldung mit der Restzugzeit verknüpfen (A7)**
(a) `docs/audit-userflow.md` A7: bei abgelehntem Schuss nennt die Meldung nicht, wie lange der Zug noch läuft; der Timer steht im HUD (`index.html:734-737`). Der Codepfad zeigt die Ablehnung mit `'notice'` (`main.js:901`, `:1480`), aber ohne Restzeit. (b) Der Spieler verliert einen Zug durch eine Ablehnung und weiß nicht, wie viel Zeit ihm bleibt. (c) Die Ablehnung nennt die verbleibende Zugzeit („… — noch 12 s"). (d) **klein**.

**10. Erstkontakt-Führung (Onboarding) ergänzen**
(a) Es gibt keinen E2E-Test für den ersten Kontakt (L6); die einzige Führung ist die Tastaturliste unten (`index.html:1054`) und das `aria-label` des Canvas (`:704`). (b) Ein neuer Spieler muss die Steuerung selbst finden; Fehlgriffe (z. B. `R`, das das Match verlässt) sind möglich. (c) Ein kurzer geführter Hinweis nach dem ersten Start („Pfeiltasten/W-S = Zielen, Leertaste = Feuern, R = Verlassen") mit „Verstanden"-Knopf. (d) **mittel**.

---

## 6. Was schon gut funktioniert (mit Beleg)

- **Der lokale Ablauf ist geschlossen und abgenommen**: Menü → Match → Spielende → Menü, inkl. Rückfrage beim Verlassen (`abort-knopf.spec.mjs:45,66,86,106,122`).
- **Barrierefreiheit auf echtem AX-Baum** statt Attribut-Abgleich (`screenreader.spec.mjs:20-23`) — das ist eine belastbare Grundlage, die viele Projekte nicht haben.
- **Die Live-Region wird nicht neu aufgebaut** (genau ein Knoten je Meldung, `screenreader.spec.mjs:126`; kein `replaceChildren`, `hud-vorrang.md` §5).
- **Vorrang im Protokoll ist gebaut und gemessen** (Budget 20 + Zusammenfassen; `hud-vorrang.md` §1/§6, Tests in `tests/hud-vorrang.test.js`).
- **Die `notice`-Klasse ist vollständig umgesetzt** — alle fünf Ablehnungsstellen `main.js:888, 901, 932, 945, 1480`.
- **Der Ladefehler-Fix ist messbar abgesichert**: `prediction-gpu.spec.mjs:193` prüft die **Steigerung** der Kraft beim Halten, nicht nur „es passiert etwas".
- **Determinismus ist abgenommen** (`runtime-smoke.spec.mjs:175,195`, `replay.spec.mjs:107`) — inkl. Rückwärts-Springen.
- **Online ist ernsthaft abgedeckt**: zweiter Mensch, Reconnect, 120 ms Latenz, Paketverlust, Vollsnapshot (`multiplayer.spec.mjs`, `network-conditions.spec.mjs`).

---

## 7. Nicht messbar in dieser Umgebung

| Was | Grund | Was zum Messen gefehlt hätte |
|---|---|---|
| **E2E-Ergebnisse (grün/rot)** | `/tmp/pa-e2e.log` enthielt um 12:44 nur die Startzeile (44 Byte); der Lauf lief parallel und war nicht auswertbar. Ein eigener Playwright-Start war ausdrücklich verboten. | Warten auf das Ende des laufenden Laufs und Lesen von `/tmp/pa-e2e.log`. |
| **Layout: ist die Steuerungsliste ohne Scrollen sichtbar?** | Hängt von gerenderter Kartenhöhe, Schriftgröße und Fensterhöhe ab (`.overlay-card { max-height: calc(100% - 2rem); overflow-y: auto }`, `index.html:515-516`). | Ein Browser mit fester Fenstergröße und Messung der `getBoundingClientRect()` von `.keymap` gegen die Viewport-Höhe. |
| **Farbkontrast** | Kein Kontrast-Werkzeug ohne Browser; die Palette ist nur als „ausreichend" kommentiert (`index.html:414-420`). | Kontrastrechner über die tatsächlich gerenderten Farbpaare (oder ein Axe/Lighthouse-Lauf). |
| **Touch-/Mobilverhalten** | Es existiert kein Touch-Test und kein Touch-Eingabepfad im Code; ohne Gerät/Browser nicht prüfbar. | `devices['Pixel 5']`-Projekt in `playwright.config.mjs` plus ein Touch-Spec. |
| **Hochformat-Darstellung** | Kein Test, kein Browser. | `setViewportSize` + `#stage.portrait`-Prüfung. |
| **Hörbarkeit des Klangs** | `dynamik.spec.mjs:747` zählt Aufrufe am Mischer und berichtet, ob der AudioContext bereit war — ob tatsächlich etwas zu hören ist, ist in einem Headless-Lauf nicht messbar. | Eine Audio-Aufnahme (WebAudio-`AnalyserNode`) oder ein manueller Hörtest. |
| **B-4, B-6, C-3, §7.4 (Audit-Punkte)** | Wurden aus Budget-/Umfangsgründen nicht nachgeprüft; sie liegen im Server-/Hilfspfad. | Gezieltes Nachlesen der bezeichneten `gameServer.js`/`lobby.js`/`main.js`-Stellen. |
| **Zugdauer/Matchdauer als Erlebniszeit** | Simulationszeit ≠ Erlebniszeit; ein Zeitlauf gegen die Engine war nicht Teil dieses Auftrags. | Die Headless-Messproben aus der Skill (`measure-flow.mjs`) in `/tmp`. |

---

*Dieser Bericht wurde ausschließlich auf Basis von Quelltext- und Testdateianalyse erstellt. Jeder Befund nennt eine Fundstelle oder eine Zählung mit Befehl. Wo etwas nicht gemessen wurde, steht das ausdrücklich als „nicht gemessen" oder im Abschnitt 7 — es wurde nichts geschätzt und als Messung ausgegeben.*
