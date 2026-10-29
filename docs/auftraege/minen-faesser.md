# Auftrag: Minen und Fässer als Bodenobjekte

*Stand: 2026-10-29 · Status: **Minen-Kern gebaut (siehe Abschnitt 0), Waffe und Fässer offen** · Quelle: MASTERDOTO, „Standardmechaniken":
„Minen / Fässer als Bodenobjekte — FEHLT, Aufwand groß (neue Entität, Auslöser, Replay)".*

## 0. Umsetzungsstand (2026-10-29)

**Gebaut und geprüft (`npm test` 2107/2107 grün):**

| Teil | Wo |
|---|---|
| Marke `config.bodenobjekte` (1 = keine Minen, 2 = Minen), im Replay-Kopf, in der Sicherung, im Server; neue Partien tragen 2 | `shared/config/bodenobjekte.js`, `engine/replay.js`, `server/persistence.js`, `server/gameServer.js`, `client/main.js` |
| Seed-Zweig `BODENOBJEKTE` | `shared/seed.js` |
| Explosionswirkung aus dem Geschoss herausgezogen, EINE Stelle für Geschoss und Mine (verhaltensgleich: alle Goldwerte unverändert) | `engine/explosion.js`, `engine/systems/projectileSystem.js` |
| Minensystem: sofort scharf, Auslöseradius 24 px, Friendly Fire, 80 % normal / 5 % Super (doppelter Schaden) / 15 % Blindgänger, Kettenreaktion (höchstens 16 je Takt), Obergrenze 64 | `engine/systems/bodenobjektSystem.js` |
| Liegende Minen aus dem Seed (0–4 je Karte, Abstand zu Startplätzen 140 px, untereinander 90 px, nur trocken) | `BodenobjektSystem#setzeLiegende`, aufgerufen in `match.js#baueBodenobjekte` |
| Zustand und Hash nur mit Marke 2 (alte Hashes bitgleich) | `engine/stateSnapshot.js`, `match.js#getState` |
| Ereignisse `mine_placed`, `mine_exploded`, `mine_dud` (Katalog, Sendefilter, lokale und Online-Behandlung), Online-Minenliste aus Beitrittszustand und Ereignissen | `shared/ereigniskatalog.js`, `client/ereignisse.js`, `client/main.js` |
| Zeichnung (Scheibe mit Lämpchen, Blindgänger grau; „reduzierte Bewegung“ ohne Blinken) | `client/renderer.js#drawMinen` |
| Tests (23): Ausgangsverteilung über 6000 Auslösungen, Superschaden genau doppelt, Blindgänger, Kette, Grenzen, Determinismus, Altmarke, Replay-Kopf | `tests/minen.test.js` |

**Nicht geprüft:** Aussehen und Klang (kein Blick auf das fertige Bild, kein Gehör), Balance (die Werte 50 Schaden,
Radius 48, Rückstoß 35 sind ein erster Ansatz in der Größenordnung der Wurfbomben), Verhalten in echten Online-Partien
über die E2E-Auswahl hinaus.

**Die Waffe (Entscheidung des Auftraggebers, 2026-10-29): keine neue Waffe, sondern die Teleportplattform (`pa_127`) wird zur Mine.**
Ihr Bild (graue Gerätekiste mit blauer Linse auf einer Plattform) ist das Bild der Mine. Umgesetzt als Waffenfassung 12
(`shared/config/waffen-f12.js`, Standard für neue Partien): Name „Mine“, Beschreibung, `special: 'mine'`. Katalogzahl 150, Beutetopf,
Munitionsklasse (5), Seltenheit (rare) und Gadget-Gruppe bleiben, deshalb ändern sich Kisteninhalte nicht. Fassung 11 und älter
behalten die Teleportplattform. (Ein früherer Ansatz mit der Impulsbombe `pa_030` ist verworfen.)

- **Selbstwirkung wie das Wachgeschütz** (`EFFECT_KIND.MINE`, `engine/specials.js`, `engine/shooting.js`): kein Geschoss; die Mine entsteht
  am Boden in Blickrichtung des Zielwinkels. Entfernung = Kraft × 2,4 px, mindestens 40 px, höchstens 240 px. Kurz = „abgelegt“, weit =
  „abgeworfen“. **Das ist ein Platzieren, kein Flug über eine Bahn** (ein Wurf mit Flugbahn wäre ein eigenes Projekt).
- Sie beendet den Zug und verbraucht Munition wie jede Selbstwirkung. Ohne Bodenobjektfassung 2 legt sie nichts und meldet es.

**Fässer (gebaut, 2026-10-29, Bodenobjektfassung 3, `config.bodenobjekte` 3):**
- 0–4 liegende Fässer je Karte aus dem Seed (Abstand 140 px zu Startplätzen, 90 px zu anderen Objekten, nur trocken).
- Ein Fass löst NICHT durch eine Figur aus, nur durch eine **Explosion in der Nähe** (Geschoss, Mine, anderes Fass): `engine/explosion.js` meldet
  jede Explosion an `BodenobjektSystem#explosionBei`. Damit lösen auch Geschosse Minen aus, und Fässer und Minen bilden Ketten.
- Es explodiert IMMER, ohne Zufall (kein Blindgänger, keine Superexplosion): Schaden 60, Radius 64, Rückstoß 45, Krater 36 (erster Ansatz,
  `FAESSER` in `config/bodenobjekte.js`, nicht balanciert).
- Anzeige: rotbrauner Zylinder mit Warnstreifen; Ereignisse `fass_placed`, `fass_exploded`.
- Marke 3 ist die neue Standardfassung für neue Partien; Marke 2 (nur Minen) und 1 (nichts) laufen unverändert weiter.

**Noch nicht gebaut:**

1. **Fässer** außer den liegenden: keine Fässer als Kiste oder Wurf; kein Auslösen durch Direkttreffer eines Geschosses ohne Explosionsradius
   (es zählt der Einschlagpunkt mit mindestens 12 px Reichweite).
2. **Eine Flugbahn für die geworfene Mine** (falls gewünscht).
3. **Bild und Klang der Mine im Spiel** nicht geprüft: Das Waffenmenü zeigt das vorhandene Icon der Teleportplattform; die
   Zeichnung der liegenden Mine ist eine einfache Scheibe mit Lämpchen (`renderer.js#drawMinen`), nicht das Gerätebild.

## 1. Ziel

Zwei Arten fester Objekte auf der Karte, die Taktik jenseits des direkten Schusses geben:

- **Mine:** kommt auf drei Wegen auf die Karte (abgeworfen, abgelegt, liegend vom Kartenaufbau), bleibt liegen und löst aus, sobald eine Figur in ihre Nähe kommt. **Sie ist immer sofort scharf**, gleich auf welchem Weg.
- **Fass:** liegt von Anfang an (oder wird durch Kisten/Ereignisse gesetzt), explodiert bei Treffer und
  löst dabei Nachbarfässer aus (Kettenreaktion).

Beides zerstört Gelände über die vorhandene Krater-Pipeline und wirkt über das vorhandene Schadenssystem.
Neue Regeln, die alte Replays verändern würden, bekommen eine **Versionsmarke** (AGENTS.md §2).

## 2. Ausgangslage (am Code geprüft, nicht angenommen)

| Baustein | Fundstelle | Folge für den Entwurf |
|---|---|---|
| Versionsmarke je Regelwerk | `config/bewegung.js`, `config/zugregeln.js` (`*_ALT`, `normalisiere*`), `replay.js` (Kopf `config`), `match.js:610` (Konstruktor), `persistence.js` | Neue Marke `config.bodenobjekte` (1 = keine, 2 = Minen/Fässer); fehlt sie, bleibt das Altverhalten bit-identisch |
| Platzierte Objekte | `turret.js` (Geschütz: `freierPlatz`, reine Funktionen), `kistenWurf.js`, `systems/lootSystem.js` (Kisten als Entitäten mit Aufheben im Radius) | Vorlage für Aufstellung und Entitätenanlage; Kisten zeigen den Weg Entität → Zustand → Client |
| Wirkung | `zerstoerung.js`, `zieleffekte.js`, `systems/damageSystem.js`, `schadenMali.js` | Explosion = vorhandener Krater plus Flächenschaden; keine zweite Schadenslogik |
| Systemreihenfolge | `engine/init.js` (`SYSTEM_PRIORITIES`), Test `tests/system-priority.test.js` | Neues `BodenobjektSystem` dort eintragen, nur an EINER Stelle |
| Eingaben im Replay | `replay.js`, `recordInput({ kind })` (`move`, `jump`, `skip_turn`, `surrender`, `skip_pause`) | Legen einer Mine = neue Eingabeart `lege_mine` |
| Serverprüfung | `shared/validation.js`, `server/gameServer.js` (`#laufendeSitzung`, Token statt Absender) | Neue Nachricht nur vom aktiven Spieler, Typ und Grenzen geprüft, Sitzung muss laufen |
| Zeilenbudget | `AGENTS.md` §3: `match.js` ≤ 2790 Zeilen (jetzt 2638) | Logik in `systems/bodenobjektSystem.js`; `match.js` bekommt nur Verdrahtung (~10 Zeilen) |
| Katalog | `weapons.js` wird von `scripts/build-weapon-catalog.mjs` erzeugt | Änderungen am Katalog NUR im Generator oder in `project_armageddon_weapons_v1.json` (nicht in `weapons.js`) |
| Namensprüfung | `weapons.js:7412` prüft Waffennamen auf „mine“ | Schritt 0: prüfen, welche Katalogwaffen damit gemeint sind, bevor etwas doppelt gebaut wird |

## 3. Entscheidungen (Auftraggeber, 2026-10-29: Empfehlungen angenommen, Friendly Fire AN)

Bestätigt sind die Punkte 1 bis 5 wie empfohlen. **Friendly Fire gilt: Minen und Fässer treffen auch die eigenen Figuren** (auch den Werfer; es gibt keine Scharfschaltzeit, siehe Punkt 2).

1. **Wer legt Minen?** *Als Waffe aus dem Katalog* (passt zu Waffenwahl, Munition, Kisten) — nicht als eigene
   Taste. Wirkung: nutzt `inventory.js` und Waffenmenü ohne neue Bedienung. „Abgeworfen“ ist dieselbe Mine als Wurfgeschoss, die beim Aufkommen liegen bleibt; „liegend“ sind Minen, die der Kartenaufbau aus dem Seed setzt (Anzahl und Platzierung: im Bauschritt festlegen, dieselben Sperrzonen wie bei Fässern).
2. **Auslöser der Mine — ENTSCHIEDEN (2026-10-29):** Nähe einer **fremden oder eigenen** Figur (Radius klein,
   z. B. 24 px). **Keine Scharfschaltzeit:** abgeworfen, abgelegt oder liegend, jede Mine ist sofort scharf.
   Friendly Fire: **an**. Folge: Der Werfer ist nicht geschützt. Wird eine Mine vor die eigenen Füße gelegt,
   geht sie sofort hoch. Vorschlag, bitte bestätigen: Das Ablegen setzt die Mine mit Mindestabstand vor die
   Figur (größer als der Auslöseradius), damit „ablegen“ nicht gleich „sich selbst sprengen“ heißt.
   **Zufall je Auslösung (entschieden):** 80 % normale Explosion, **5 % Superexplosion mit doppeltem Schaden**,
   **15 % Blindgänger** (explodiert nicht). Annahmen, bitte bestätigen: Der Wurf gilt je Auslösung (nicht bei
   Anlage der Mine) und kommt aus einem eigenen Seed-Sub-RNG der Bodenobjekte, in fester Reihenfolge nach
   Objekt-ID gezogen — dadurch bleibt der Zustandshash reproduzierbar und der Ausgang ist vorher nicht
   sichtbar. „Doppelter Schaden“ betrifft nur den Schaden; Radius und Krater bleiben gleich. Ein Blindgänger
   bleibt als wirkungsloses Objekt liegen und löst nicht noch einmal aus.
3. **Sichtbarkeit:** Minen für alle sichtbar (Spielgleichheit, keine versteckte Information). Verdeckte Minen
   bräuchten pro Spieler gefilterte Zustände und sind **nicht** Teil dieses Entwurfs.
4. **Fässer:** Zufällig aus dem Seed gesetzt (gehört zum Kartenaufbau) oder nur als Kiste-Variante? Empfehlung:
   aus dem Seed, 0–4 je Karte, nie in Wasser und nie in Spawnnähe (Erreichbarkeitsprüfung bleibt gültig).
5. **Standardfassung:** Neue Partien mit Marke 2, alte Aufzeichnungen unverändert (wie bei `bewegung`).

## 4. Arbeitsschritte

0. **Prüfung:** Welche Katalogwaffen heißen „Mine“? Gibt es schon ein Ereignis `mine_*`? (`grep`, `events.js`,
   `ereigniskatalog.test.js`.) Ergebnis ins Ticket, vor jedem Code.
1. **Konfiguration:** `config/bodenobjekte.js` (Marke, `normalisiereBodenobjekte`, Werte: Radius, Schaden,
   Kettenabstand, Wahrscheinlichkeiten 80/5/15 %, Mindestabstand beim Ablegen). Reine Daten, kein Zufall, keine Uhr.
2. **Engine:** `systems/bodenobjektSystem.js`: Liste der Objekte im Zustand (`stateSnapshot.js`), Auslösen,
   Auslösen, Kettenreaktion in fester Reihenfolge (nach Objekt-ID, damit der Zustandshash stabil bleibt),
   Aufruf von Krater und Schaden über die vorhandenen Funktionen.
3. **Aufzeichnung:** Eingabeart `lege_mine` in `replay.js` und `persistence.js`; Kopfmarke `bodenobjekte`.
4. **Server:** Nachricht, Validierung (aktiver Spieler, Munition, Platz frei, Sitzung läuft), Zähler.
5. **Client:** Sprite/Zeichnung, Warnring bei Scharfschaltung, Explosion über bestehende Effekte, Klang über
   `klangProfile.js`; Eintrag in Hilfe und Ereigniskatalog.
6. **Balance:** Messung mit `scripts/bot-partien.mjs` (Bots legen Minen nicht; Messung über Ketten in
   fest gesetzten Fässern) und `npm run check:*` für Katalog und Wirkungen.

## 5. Technische Einschränkungen

- Kein `Math.random` / `Date.now` in `src/engine` und `src/shared` — Zufall nur aus Seed-Sub-RNGs.
- Alte Replays (ohne Marke) müssen bit-identisch laufen: Goldwert-Test mit einer Altdatei.
- Kein neues Abhängigkeitspaket.
- Server vertraut dem Client nie (AGENTS.md §6).

## 6. Akzeptanzkriterien

- [ ] Replay mit Marke 1 ergibt exakt den bisherigen Zustandshash (Goldwert unverändert).
- [ ] Zwei Läufe mit gleichem Seed und gleicher Eingabefolge ergeben dieselbe Kettenreaktion (Hash gleich).
- [ ] Mine löst aus: im Radius ja, außerhalb nein, sofort nach dem Ablegen/Aufkommen/Kartenaufbau scharf (kein Wartezustand).
- [ ] Ausgang je Auslösung: über viele Seeds nahe 80 / 5 / 15 % (Messung mit Toleranz), Blindgänger löst nicht erneut aus, Superexplosion macht genau den doppelten Schaden bei gleichem Krater.
- [ ] Kettenreaktion von drei Fässern endet (keine Endlosschleife), Reihenfolge fest.
- [ ] Server lehnt `lege_mine` ab: nicht am Zug, ohne Munition, auf belegtem Platz, bei stehender Simulation.
- [ ] `npm test`, `npm run checks`, `eslint .` grün; `match.js` ≤ 2790 Zeilen.
- [ ] E2E: eine Mine legen und auslösen, zwei Clients sehen dasselbe (`online-einschlag`-Muster).
- [ ] Sicht- und Klangprüfung durch den Auftraggeber (nicht automatisierbar).

## 7. Testanforderungen

Unit: Konfiguration, Auslöser, Kette, Hash-Gleichheit, Altmarke. Integration: Server-Nachricht samt Ablehnungen.
E2E: ein Online-Match mit Mine. Manuell: Optik und Klang.

## 8. Erwartete Ergebnisartefakte

`config/bodenobjekte.js`, `systems/bodenobjektSystem.js`, Tests (`bodenobjekte*.test.js`), E2E-Spec, Eintrag in
`README.md`/`MASTERDOTO.md` (Testzahlen, Marke), Abschnitt in `docs/`, Wächter für das Zeilenbudget.

## 9. Risiken

- Zustandshash: Jede neue Liste im Zustand ändert den Hash — nur hinter der Marke.
- Kettenreaktionen können Gelände in einem Takt stark verändern (Bildzeit, Netzlast): Obergrenze je Takt festlegen.
- Erreichbarkeit: Fässer dürfen Spawn und Wege nicht blockieren (`pruefeErreichbarkeit`).

## Fass-Abwurf (Bodenobjektfassung 4)

- Zu jedem Rundenbeginn (nicht beim Matchstart) fällt mit 40 % (`FAESSER.abwurfChance`) ein Fass wie eine Kiste vom Himmel; Landeplatz sofort fest (trockener Boden, x ≥ 120 vom Rand), Flugzeit 150 Takte, höchstens 6 Fässer.
- Fliegende Fässer sind nicht sprengbar; Ereignisse `fass_abgeworfen` / `fass_gelandet`. Stehende Fässer bleiben unverändert (Fassung 3). Explosionsradius unverändert (64).
- Verifiziert: Unit-/Match-Tests (Chance, Nicht-Sprengbarkeit im Flug, Determinismus), Lint, Kamera-Gate, Gesamtlauf 2123/2123. Optik des Falls (Wanduhr-Animation) nur im Code geprüft, nicht visuell.
