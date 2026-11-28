# ProjectArmageddon — die einzige Aufgabenliste

Stand: 2026-11-28. **Dies ist die einzige Arbeits- und Planliste.** Alle früheren Listen sind hier eingeflossen
(`MASTERDOTO.md`, `docs/p0-balance-offen.md`, `docs/plan-produktion.md`, `docs/letzter-halt-plan.md`, die Übergaben
`docs/UEBERGABE-*.md`, `docs/TODO-report.json`, `bgworker-todo.json`, die Arbeitsliste des Agenten). Ihr alter Inhalt
steht in Git (`git log --all -- <Datei>`). Was welche Datei enthält: `README.md`; welche Quelle verbindlich ist:
`docs/SSOT.md`.

**Regeln für diese Liste:** Neue Punkte nur hier. Erledigtes wird gelöscht (der Beleg steht im Commit). Nichts als
erledigt führen, was nicht nachweisbar lief. Bild und Klang kann keine Maschine abnehmen: sie stehen in Abschnitt 8,
bis der Auftraggeber sie abgenommen hat. Fachliche Spezifikationen bleiben eigene Dokumente (`docs/auftraege/*.md`),
sind aber keine Listen.

## A. So wird jeder Punkt umgesetzt (für alle gleich)

1. **Zweig anlegen:** `git checkout main && git pull --rebase && git checkout -b integration/<kurzname>`.
2. **Regel ändert den Spielablauf?** Dann neue **Fassung**: In der passenden Datei unter `src/shared/config/`
   (z. B. `gelaende.js`, `waffen-fassung.js`, `biomregeln.js`, `loadouts.js`) eine neue Konstante anlegen
   (`GELAENDE_XY = 20`), den `*_STANDARD` darauf setzen und im Code nur `if (fassung >= GELAENDE_XY)` verzweigen.
   Alte Fassungen müssen bitgleich bleiben (alte Replays, `AGENTS.md` §2). Kein `Math.random`/`Date.now` in
   `src/engine` und `src/shared`; Zufall nur über die Seed-Unter-RNGs.
3. **Test schreiben:** `tests/<thema>.test.js` (Node-Test). Er prüft: neue Fassung wirkt, alte Fassung unverändert,
   Standard ist die neueste. Die Tests „Standard ist die neueste“ in den anderen Testdateien (suchen mit
   `grep -rn "_STANDARD" tests | grep neueste`) auf die neue Zahl setzen; Goldwerte alter Tests auf die alte Fassung
   festnageln (`kit: 4`, `gelaende: 18` …), nie löschen oder abschwächen.
4. **Prüfen:** `npm test` (alles grün), `npm run checks`, `npm run check:docs`, betroffene E2E
   (`npx playwright test tests/e2e/<spec> --trace off`). Erzeugte PNGs unter `docs/vergleich-alternativspiele-*`
   danach mit `git checkout -- docs/vergleich-alternativspiele-2026-10-19/` zurücksetzen.
5. **Mergen:** `git pull --rebase origin main`, `npm run paket:stand`, pushen, CI (Lint, Tests, vier E2E-Teile)
   abwarten. Nur bei grüner CI `git checkout main && git merge --ff-only integration/<kurzname> && git push`.
6. **Diese Liste pflegen:** Erledigtes löschen, Rest genau beschreiben.

## 0. Stand

| Bereich | Stand |
|---|---|
| Fassungen (Standard neuer Partien) | Gelände 19 (`GELAENDE_GEWICHTE`), Waffen 23 (`WAFFEN_TURM`), Kit 5 (`KIT_AUSRUESTUNG`), Klassen `KLASSEN_NEU`, Seil 3, Biomregeln 10, Bodenobjekte 8, Zugregeln 3 |
| Zeilenbudgets | `src/engine/match.js` ≤ 2790 Zeilen (`tests/zeilenbudget.test.js`) |
| Tests | `npm test` 2026-11-28: 3215 grün, 0 rot |
| Wunschbild | `docs/SSOT.md`, Teil D (verbindliche Fassung); die Lücken stehen hier unter 2.12 und 2.13 |
| Spieltest mit Menschen (QV-4) | nicht erfolgt |

## 1. Sofort: Fehler und rote Prüfungen

Nichts offen.

## 2. Spiel: nächste Bauschritte (in dieser Reihenfolge)

**Reihenfolge ab 2026-11-28 (Vorschlag des Agenten, nach Spaß und Aufwand):**
1. 2.12c Revanche auf neuer Karte (steht, 2026-11-28).
2. 2.12b Kartengröße aus Spielerzahl plus Zufall (entschieden 2026-11-28).
3. 2.13 Ereignissystem mit den ersten drei: Blondine (2.13n), Gewitter (2.13d), Erdbeben (2.13e); danach die übrigen.
4. 2.12d Biomelemente und 2.12e Gefrieren/Schmelzen (viel Spielspaß, mittlerer Aufwand).
5. 2.4 Landhöhe variieren (Geländefassung 20).
6. 2.12f Boote, Geheimtunnel, Auslöser.
7. 2.12a Schwerkraft zur Mitte bzw. schwach (größter Umbau; zuerst Spezifikation).
Daneben gilt 2.1 (Sichtabnahme am Gerät) weiter mit Vorrang, sobald der Auftraggeber testen kann.

### 2.1 TOUCH-ZUERST (Vorrang vor allem anderen, Entscheidung 2026-11-25)
- **Steht:** Seilknöpfe nur am Seil, eine Aktionsreihe am Telefon, Touch-Texte, Kamera hält die Figur über der
  Knopfreihe, unverzerrtes Bild ohne schwarze Ränder, Figuren 12 % der Bildhöhe, Gegenstände wachsen mit, kompaktes
  Protokoll, Abwurf-Knopf nur bei abwerfbarer Waffe, Figur am Zug in 0 von 16 Messfällen verdeckt.
- **Offen:** nur die Sichtabnahme am echten Gerät (Abschnitt 8).

### 2.2 KARTE-WASSER: Seen in Höhlen und auf Inseln, kleine Wasserfälle
- **Wo:** `src/shared/terrainKomposition.js` (Zonen bauen; dort entstehen Höhlen und Inseln),
  Wasser-Startfeld in `src/engine/waterField.js`, Fassung in `src/shared/config/gelaende.js`.
- **Wie:** Neue Geländefassung. In Höhlenzonen (Funktion für Höhlen in `terrainKomposition.js`) den tiefsten Hohlraum
  suchen und bis zu einer Höhe mit Wasser füllen; auf Inseln eine Mulde in der Krone ausheben und füllen. Wasserfall =
  schmale Wasserspalte an einer Kante, die ins Becken darunter läuft (Wasserlauf aus Biomregel 5 lässt es fließen).
- **Abnahme:** Test mit festem Seed (Wasserzellen > 0 in Höhle), `node scripts/check-erreichbarkeit.mjs` ohne neue
  unerreichbare Figur, Matchstartzeit nicht schlechter.

### 2.3 KARTE-QUALITÄT
- **Offen:** runde Karten interessanter (Planet: verzweigte Tunnel, hohler Kern) in `src/shared/terrainPlanet.js` und
  `terrainRund.js`; Rest auf groß 24:9 Seed 7 (Ruinenkammer hinter einem Riss von 176 px; das Durchgangstor
  `src/shared/kartenTor.js` misst auf halber Auflösung nur 90 px); unerreichbare Figuren 8 von 500.
- **Wie:** Tor auf voller Auflösung messen oder Schwelle anpassen (neue Geländefassung); Planet: Tunnel als
  Verzweigung vom Kern aus graben.
- **Abnahme:** `node scripts/messung-kartenqualitaet.mjs --vergleich=<alte Fassung>`.

### 2.4 GELAENDE-1 (TODO 4.6, Rückmeldung „Landschaft langweilig“)
- **Steht:** Fassung 18 (Inseln mit Tafelberg, Überhang, Schiefe), Fassung 19 (Zonenarten gewichtet: weniger Höhlen
  und Pyramiden, mehr Inseln und Ebenen).
- **Offen, als Nächstes:** **Landhöhe variieren.** Befund: Jede Karte ist ein großer Landblock bis etwa zwei Drittel
  der Höhe. **Wo:** `src/shared/terrainKomposition.js`, dort wo die Grundhöhe je Zone gesetzt wird (Suche nach der
  Stelle, an der die Zonen-Masken zusammengesetzt werden; `masseSchief`/`inselMasse` aus Fassung 18 als Muster).
  **Wie:** Geländefassung 20: je Zone eine Höhe aus dem Seed ziehen (z. B. 35–75 % der Kartenhöhe, mit einem
  `rng.next()` je Zone), dazu tiefe Täler zwischen Zonen. Prüfen mit dem Übersichtsbild
  (Skript im Muster von `scripts/messung-kartenqualitaet.mjs`) und `check:erreichbarkeit`.
- **Offen danach:** Höhlen mit weniger Tunnelgewirr (größere Kammern, weniger Gänge, Höhlenbau in
  `terrainKomposition.js`/`terrainGen3.js`); Licht an Fackeln und Lava (nur Client: `src/client/kulissenLicht.js`,
  `renderer.js`, ein weiches radiales Licht über dem Gelände); Nebelschichten (Client: halbtransparente Bänder in
  `renderer.js` zwischen Kulisse und Gelände).
- **Achtung beim Ändern der Karte:** Diese E2E-Specs hängen im Testaufbau an einer Karte und kippten bei Fassung 19:
  `online-mine` (Fall Seed/Winkel/Kraft mit der Engine neu suchen, Muster im Test), `feuerwesen` (Seed mit Boden in
  Schussrichtung), `waffen-animation` (`SEED_FREIE_SICHT`: Fernbüchse braucht freie Sicht), `gehen` (`stelleFrei`)
  und `seil` (`stelleUnterDecke`). Nach jeder neuen Geländefassung diese fünf zuerst laufen lassen; den **Aufbau**
  anpassen, nie die Prüfung.

### 2.5 QV-6-C/D (Bodenwirkung, Splitter)
- **Offen:** Glätte auf Eis (`reibung`, die Figur braucht Schwung beim Gehen) und Sumpf (langsamer, einsinken);
  Splitter wirken in Kristallarchipel und Kristallwald nicht (Oberfläche nicht spröde genug); eine Hinweiszeile.
- **Wo:** Biomregeln `src/shared/config/biomregeln.js` (neue Fassung 11), Bewegung `src/engine/physics/`, Stoffe
  `src/shared/config/stoffe.js` (Sprödigkeit), Hinweis `src/client/biomregelAnzeige.js`.
- **Abnahme:** Fassung mit Marke, Goldwerte, `npm run balance:regelkontrolle -- --von=10 --bis=11`.

### 2.6 MENUE-EINFACH
- **Offen:** Das Menü selbst straffen: Biomwahl und Kartengröße hinter einen Knopf „Mehr“.
- **Wo:** `src/client/kartenWahlMenue.js`, `menueFelder.js`, Stil in `src/client/styles/`. E2E: Menü-Specs
  (`grep -l "Anpassen" tests/e2e`).

### 2.7 PORTAL-2 (wartet auf Rückmeldung zu Stufe 1)
- Stufe 1 steht (Spezifikation `docs/auftraege/portal.md`). Stufe 2: andere Figur beamen, zwei Enden, Ort an Kiste,
  eigener Klang. **Wo:** `src/engine/portal.js`, `src/client/portalBild.js`, Bodenobjektfassung 9.

### 2.8 DICHTE-RUND (Rest)
- Gegner zwischen 100 und 120 px in 5 von 100 1:1-Partien („mittel“) und 8 von 100 kleinen; gewählte runde Art auf
  kleiner Karte bleibt eng. **Wo:** `src/engine/startFairness.js`, `spawnManager.js`. **Abnahme:**
  `node scripts/messung-kartenqualitaet.mjs`.

### 2.9 LETZTER-HALT (erst nach dem Spieltest, Abschnitt 8)
- Konzept in Git (`git show 109e87e^:docs/letzter-halt-plan.md`).
  Stufe 2 A/B-Test Materiallesbarkeit (2 Teams, 1 Karte, 5 Wiederholungen, Anteil Geländewege > 60 %), Stufe 3
  Bruchbild und Werkzeugklang, Stufe 4 Gegenmaßnahmen, Stufe 5 Rollen-Biome; Rodentia ohne Heim-Biom.

### 2.10 FIGUREN-B-REST
- Echte Kopf-/Oberkörperdrehung (Teilsprites). **Wo:** `src/client/figurAnimation.js`, `figurSheets.js`. Braucht
  neues Bildmaterial (Bildbudget, Frage an den Auftraggeber, Abschnitt 9).

### 2.11 SCHUSS-FAMILIEN
- Eigene Schussbewegungen für Fernkampf (Pumpen, Spannen, Aufziehen) und Magie (Nahkampf ist gebaut); sanfte
  Geschützdrehung (der Zustand trägt keine Zielrichtung: in `src/engine/turret.js` und `stateSnapshot.js` ergänzen,
  Drahtformat mit Marke); HUD-Animationen Kill-Feed, Waffenwahl, wenig Munition; Menü-Übergänge.
  **Wo:** `src/client/figurAnimation.js`, `waffenAnimation.js`, `hud.js`.

### 2.12 VISION-ABGLEICH (Auftraggeber 2026-11-28): Lücken zwischen Wunschbild und Code
Das Wunschbild steht verbindlich in `docs/SSOT.md`, Teil D. Hier die Lücken mit Befund im Code (2026-11-28); je Lücke
ein eigenes Paket mit Fassungsmarke (Abschnitt A):

| ID | Wunsch | Stand im Code | Was fehlt, wo, wie |
|---|---|---|---|
| 2.12a SCHWERKRAFT-RUND | Runde Karten: Schwerelosigkeit oder Anziehung zur Kartenmitte | Schwerkraft zeigt überall nach unten, nur der Betrag ändert sich je Biom (`src/shared/config/biomregeln.js`, `schwerkraftFuer`) | Schwerkraft als Vektor statt Zahl: `src/engine/systems/physicsSystem.js`, `characterSystem.js`, `src/engine/physics/ballistics.js` (`integrateStep`), Geschosse in `match.js`. Modus je Kartenart (Entscheidung 2026-11-28): **runde Karten `mitte`** (Vektor zur Kartenmitte, Stärke wie heute), **Schwebekarten (Schwebinseln, surreale Schwebewelt) `schwach`** (keine oder schwache Atmosphäre: Schwerkraft 0 bis 0,3 der normalen, aus dem Seed; Sprünge und Rückstoß tragen weit, Geschosse fliegen fast gerade), alle anderen `unten` (heute). Figuren stehen dann „auf“ dem Planeten: Bodenfindung (`surfaceYAt`) radial, Zielwinkel relativ zur Oberfläche, Kamera dreht nicht. Neue Bewegungsfassung, Planet-Karten zuerst. Groß: eigenes Paket, vorher Spezifikation `docs/auftraege/schwerkraft-rund.md` |
| 2.12b KARTENGRÖSSE-ZUFALL | **Entschieden 2026-11-28:** Die Spielerzahl (Teams, je Team ein Mensch) gibt den Bereich vor: **2 → klein bis mittel, 3 → mittel bis groß, 4 → groß, 5 → groß bis riesig, 6 und mehr → riesig**. Danach verändert der Zufall das Ergebnis um **−25 % bis +50 %** | Das Menü schlägt eine feste Stufe aus der Figurenzahl vor (`mapGroesseFuerFiguren` in `src/engine/karte.js`, `src/client/kartenVorschlag.js`); kein Zufall | **Bau:** in `src/engine/karte.js` `kartenMasseFuer(spieler, format, rng)`: (1) Bereich aus der Tabelle oben (Stufen aus `MAP_GROESSEN`: klein, kompakt, mittel, weit, gross, riesig); (2) Grundmaß = Breite und Höhe der unteren Stufe, mit einer Seed-Zahl gleichverteilt bis zur oberen Stufe gemischt (bei 4 und 6 fest); (3) Faktor aus dem Seed gleichverteilt in [0,75; 1,5] auf die Breite (bei 1:1 auf beide Seiten); (4) auf ein Vielfaches von 32 runden, Grenzen `KOLOSSAL_PIXEL` und iOS (`src/engine/kartenWahl.js`) einhalten. Zugzeit nach Fläche statt Stufe (`getTurnDurationForSize` in `src/engine/systems/turnSystem.js`). Geländefassung mit Marke; die Lobby schickt nur „automatisch“, der Server rechnet die Maße aus dem Seed. **Menü:** neue Wahl „Größe: automatisch“ als Vorgabe, auch für „Spielen“; eine ausdrücklich gewählte Größe bleibt genau so (hält die E2E-Karten stabil; vorher prüfen, welche Specs die Vorgabe nutzen, und dort `mittel` ausdrücklich setzen). Test: je Spielerzahl 200 Seeds, alle Maße im Bereich, Mittelwert plausibel |
| 2.12c KEINE-KARTE-ZWEIMAL | Jede Partie eine neue Karte | **Steht (2026-11-28):** Revanche startet mit denselben Teams und Regeln auf einer neuen Karte, das Seed-Feld wird dabei geleert (`src/client/revanche.js`, `#seedFuerRevanche` in `main.js`). Das Seed-Feld bleibt im Menü (Vorgabe leer = neue Karte), weil über 100 E2E-Tests es füllen und Nachspielen damit möglich bleibt | – |
| 2.12d BIOM-ELEMENTE | Elemente je Biom in Varianten, mit Eigenschaften (beweglich, zerstörbar, explosiv) | Spielwirksame Biomobjekte nur in 7 von 20 Biomen, je eins (`ALLE_BIOMOBJEKTE` in `src/shared/config/bodenobjekte.js`: explodieren); `docs/biome/gesamtliste.md` beschreibt 111 Objekte und 32 Auslöser. Bäume und Pflanzen sind nur Bild (`src/client/pflanzen.js`), nicht zerstörbar, brennen nicht | Je Biom 2–4 Objekte aus der Gesamtliste in den Motor holen: Eigenschaften `beweglich` (Physik wie Fass), `zerstoerbar` (Lebenspunkte), `explosiv` (wie Fass), `brennbar` (Feuersystem). Bäume als Objekt mit Stamm aus Holz (brennt, fällt um). Varianten (Größe/Farbe/Form) aus dem Seed. Bodenobjektfassung 9; Bilder in `src/client/assets/biom-objekte/` (19 vorhanden) |
| 2.12e STOFF-REAKTIONEN | Wasser gefriert, Eis schmilzt oder zersplittert, Holz brennt | Holz/Pflanzen brennen und werden Asche, Lava erstarrt, Nässe und Kälte löschen (`src/engine/systems/feuerSystem.js`); spröde Stoffe brechen (Biomregel 10). **Fehlt:** Wasser → Eis bei Kälte, Eis → Wasser bei Hitze | Im Feuersystem (oder neuem `kaelteSystem.js`): Kältetreffer wandelt Wasserzellen (`waterField.js`) im Radius in Stoff `eis` (begehbar), Hitze/Feuer schmilzt Eis zu Wasser. Biomregel- oder Feuerfassung mit Marke |
| 2.12f STRUKTUREN | Brücken, Boote, Geheimtunnel, Ereignisse, Teleport-Auslöser, getrennte Inseln | Brücken zwischen Landmassen (Geländefassung 11), getrennte Inseln (Archipel, Inselgruppe), Kartenportal (Bodenobjektfassung 8, 20 % der Partien), Ereignisse (Günther, Cookie, Hagel, Mahlstrom). **Fehlt:** Boote, Geheimtunnel, Auslöser-Felder | Boot: schwimmendes Objekt auf der Wasseroberfläche (Treiben aus Biomregel 6), Figur kann darauf stehen. Geheimtunnel: in `terrainKomposition.js` ein schmaler Gang hinter dünner Wand zwischen zwei Zonen. Auslöser: Bodenobjekt `ausloeser` (Druckplatte), das Portal, Falle oder Ereignis startet (`src/engine/portal.js` als Muster) |
| 2.12g HINTERGRÜNDE | Die hochgeladenen Hintergründe je Biom, verbessert, mit Effekten | 81 Kulissen unter `src/client/assets/backdrops*`; ob jede auf eine hochgeladene Vorlage zurückgeht, ist nicht belegt (siehe 4.5) | Tabelle Biom → Kulissen → Herkunft (Upload/erzeugt) in `docs/biome/kulissen.md` anlegen; fehlende Uploads einsetzen (4.5) |

### 2.13 EREIGNISSE-UND-BESUCHER (Wunsch Auftraggeber 2026-11-28)
**Grundlage für alle:** Ein neues Ereignissystem `src/engine/systems/ereignisSystem.js` nach dem Muster von Günther
(`src/shared/config/guenther.js`, `src/engine/guentherRad.js`): Zu Rundenbeginn zieht der Seed-Unter-RNG `ereignisse`
höchstens **ein** Ereignis (Grundchance je Runde z. B. 25 %, Gewichte je Biom: Vulkanausbruch nur in Vulkan-Biomen,
U-Boot nur mit Wasser, Blizzard nur in kalten Biomen). Neue Regelfassung `src/shared/config/ereignisse.js`
(`EREIGNISSE_STANDARD`, Replay-Kopf, AGENTS.md §2), Ereignisse über den Ereigniskanal an die Clients
(`src/shared/ereigniskatalog.js`, `src/shared/protocol.js`), Hinweiszeile im HUD (`src/client/hud.js`), Bild und Klang
im Client (`src/client/effects.js`, `sound.js`). Jedes Ereignis: Unit-Test (Wirkung, Replay-Hash gleich), Bot-Messung
(`scripts/bot-partien.mjs`: Partiedauer, Schaden je Partie), Sichtabnahme (Abschnitt 8).

**Naturereignisse und Unglücke:**

| ID | Ereignis | Wirkung im Spiel | Wo / Wie |
|---|---|---|---|
| 2.13a SCHNEE/BLIZZARD | Schneefall, als Blizzard mit Sturm | Schnee legt eine dünne Schicht auf den Boden (glatter, Gehen langsamer); Blizzard: starker Wind, Sicht kurz eingeschränkt, Wasser gefriert an der Oberfläche (braucht 2.12e) | Wetter heute nur Bild (`src/client/wetterZustand.js`); Wirkung in `ereignisSystem.js`, Schneeschicht als Stoff `schnee` (Zerstörung wie Erde), Wind über `src/shared/config/wind.js` |
| 2.13b REGEN | Starkregen | füllt Mulden mit Wasser, löscht Feuer, macht Hänge rutschig | Wasser in `src/engine/waterField.js` zugeben (Wasserlauf aus Biomregel 5 verteilt es), Löschen über `feuerSystem.js` |
| 2.13c TSUNAMI/HURRIKAN | Welle von einem Kartenrand, Wirbelsturm | Tsunami: Wasserspiegel steigt für 2 Züge, eine Welle schiebt Figuren und lose Objekte; Hurrikan: Windstärke auf Höchstwert, lose Objekte (Kisten, Fässer, Minen) fliegen mit | Wasserspiegel in `waterField.js`, Schub wie Strömung (Biomregel 1); Wind in `wind.js` |
| 2.13d GEWITTER | Blitze | 1–3 Blitze je Runde schlagen am höchsten Punkt oder in Metall ein: 15–25 Schaden im kleinen Radius, Holz entzündet sich | Einschlag wie eine Waffe (`src/engine/explosion.js`), Ziel aus dem Gelände (höchste Stelle) per Seed |
| 2.13e ERDBEBEN | Beben | Kamera wackelt, lose Überhänge brechen ab und fallen, Figuren rutschen ein Stück, 5 Schaden für alle am Boden | Abbruch über `src/engine/zerstoerung.js` (freischwebende Inseln fallen), Kamera `src/client/kameraEffekte.js` |
| 2.13f VULKANAUSBRUCH | Ausbruch (Vulkan-Biome und Karten mit Lava) | Lavabomben aus dem Krater oder vom oberen Rand, Lava fließt und erstarrt später | Geschosse wie eine Waffe, Lava über `src/engine/systems/feuerSystem.js` (`feuer_lava`) |
| 2.13g RATTENPLAGE | Schwarm Ratten | 6–10 Ratten laufen über die Karte, je Berührung 2–5 Schaden, fressen eine Kiste an | Tiere-System als Muster (`src/engine/tierZustand.js`, `tierWirkung.js`) |
| 2.13h FLUGZEUGABSTURZ | Flugzeug stürzt ab | Flugzeug kreuzt die Karte, stürzt an zufälliger Stelle: große Explosion, Trümmer, 1–2 Kisten fallen heraus | Explosion `explosion.js`, Kisten `src/shared/config/kisten.js` |
| 2.13i UFO / UFO-ABSTURZ | UFO erscheint oder stürzt ab | UFO: entführt eine zufällige Figur und setzt sie woanders ab (wie Portal); Absturz: Krater und eine Kiste mit seltener Waffe | Versetzen wie `src/engine/portal.js` |
| 2.13j U-BOOT-UNFALL | U-Boot (nur Karten mit Wasser) | taucht auf, feuert einen Torpedo oder explodiert; Ölteppich auf dem Wasser (brennbar) | Geschoss im Wasser, Ölteppich als brennbare Wasserschicht (`feuerSystem.js`) |

**Besucher (Figuren ohne Team, wie Günther):**

| ID | Besucher | Wirkung | Wo / Wie |
|---|---|---|---|
| 2.13k HEILER | **Dr. Stilzchen-Rumpel** (Name entschieden 2026-11-28; Anspielung auf das Grimm-Märchen, frei nutzbar): kleiner, schrulliger Wunderdoktor | erscheint, singt, heilt alle Figuren im Umkreis um +15 bis +30 und geht wieder | Besucher-Entität wie Günther (`guenther.js`), Heilung über die Lebenspunkte im Motor |
| 2.13l STRICKOMA | Alte, verwirrte Landstreicherin, strickt und isst Gummibärchen | wandert ziellos; wer ihr nahe kommt, bekommt ein Gummibärchen (+5) oder wird von ihr „eingestrickt“ (ein Zug ohne Bewegung); ihr Geruch: Figuren direkt neben ihr husten (−2 je Zug) | Besucher mit Laufweg, Wirkung bei Nähe; Bild und Sprüche im Client |
| 2.13m DEALER | Dünner, verpeilter Händler | tauscht mit der Figur am Zug: Leben gegen Waffe, Waffe gegen andere Waffe, eine Zugrunde aussetzen gegen eine starke Waffe | Handelsangebot als Servernachricht, Wahl des Spielers als neue Eingabe (`src/shared/protocol.js`, Server prüft alles, AGENTS.md §6); Angebote aus dem Seed; Handelsfenster `src/client/` (neues Modul) |
| 2.13n BLONDINE | Süße Blondine | trifft die Figur am Zug: Verhältnis 8 : 1, also in 8 von 9 Fällen Kuss (+10 bis +50 Leben, gleichverteilt aus dem Seed, nicht über die Höchstlebenspunkte), in 1 von 9 lacht sie aus (−69 Leben, kann töten) | Ziehung über den Seed-RNG, Wirkung im Motor, Sprechblase und Klang im Client. Kein anzüglicher Inhalt: Comic-Kuss mit Herzchen |

## 3. Balance (immer: messen, dann ändern, Freigabe)

| ID | Arbeit | Wo / Wie |
|---|---|---|
| 3.1 BIOM-WERTE | Schwerkraft 0,6–0,85, surreal 0,7–1,3, Strömung 0,5/0,35/0,5, Gefahrenwasser sind erste Ansätze; Sturzflut nur in einer Rinne gemessen | `npm run balance:biome`, `node scripts/messung-wasserlauf.mjs`, `node scripts/balance-rollen.mjs --stufe=standard`; Werte in `src/shared/config/biomregeln.js` (neue Fassung) |
| 3.2 ROLLEN (BAL-14) | Feinbalancing je Rolle statt globaler Faktoren; Okkultist-Vorsprung 69 % (36 Partien je Rolle) | 1. Kennzahlen je Rolle (`src/shared/config/waffen-rollen.js`), 2. identische Seeds vorher/nachher, 3. echte LP 130/100/70, 4. Anpassung je Rolle in neuer Waffenfassung (`waffen-f24.js`) |
| 3.3 NAHKAMPF | Nahkampf erreicht den Startabstand mit 0 von 100 Projektilwaffen | Wurfweiten angleichen (Waffenfassung) oder Startabstände je Klasse mischen (`startFairness.js`) |
| 3.4 BAL-1 | maxRange-Anzeige „Reichweite bei neutralem Profil“ (Faktor 0,37) im Waffenmenü; Scout-Bewertung (Beweglichkeit ohne Netto-Vorteil); 6 Klasse/Archetyp-Kombinationen messen (`npm run balance:classes`); `ARCHETYPE_LAUNCH_BASE = 1,2` normalisieren (verschiebt etwa 8 %); Wurfweiten-Deckel (465 Kombinationen) | Anzeige: `src/client/waffenMenue.js` mit `src/shared/reichweite.js`; Rest Balance-Skripte unter `scripts/` |
| 3.5 BAL-15/17 | Abnahme der Waffen in Browser und Touch (Symbole 24/64/128 px, Kontrast, Zielen links/rechts, Bewegung); Abdeckung Karten × Fraktionen × Partien staffeln, nichts aus Stichproben behaupten | E2E unter `tests/e2e/waffen-*.spec.mjs`; Abdeckungsmatrix als Bericht unter `docs/` |
| 3.6 HAGEL | Schaden je Partie messen (Lagenanteil 20 %, 50 % gezielte Körner), ggf. senken | `src/engine/hagel.js`, Fassung in `src/shared/config/hagel.js` |
| 3.7 TIERE | N-51: Balance-Nachmessung (Code und Tests stehen) | `src/engine/tierWirkung.js`, `npm run balance:biome` |
| 3.8 MESSGRENZE | N-17 Messleiter feiner; N-48 Flake-Risiko der Balance-Tests | `docs/balance-messgrenze.md`, Balance-Tests unter `tests/balance-*.test.js` |
| 3.9 AUSRÜSTUNG | Kit 5 und Geschütze nach dem Spieltest nachmessen (Bot-Messung: Kit 5 6,6 min/12 Runden) | `node scripts/bot-partien.mjs`; Zuordnung neu mit `node scripts/ausruestung-zuordnen.mjs` |

## 4. Grafik und Optik

| ID | Arbeit | Wo |
|---|---|---|
| 4.1 GRAFIKSTUFE-1 | `flaechenBudgetMio` im Renderer durchsetzen; Figuren immer in voller Bildschirmauflösung (bei `kolossal` „krätzig“); Ultra besser | `src/client/grafikStufe.js`, `renderer.js` |
| 4.2 KACHELUNG | Gelände-Canvas in Kacheln ≤ 4 Mio. px (hebt die iOS-Sperre für `kolossal` auf); iOS-Gäste in einer `kolossal`-Lobby klären | `renderer.js`, `src/engine/kartenWahl.js` (Sperre) |
| 4.3 N-31 | Übergänge statt harter Kanten: Lippe/Überhang an Oberkanten, Mischzonen, Konturlinien an Materialgrenzen | `src/client/gelaendeStil.js`, `gelaendeDetails.js` |
| 4.4 N-32 | Die 15 alten Foto-Texturen im Comic-Stil der übrigen 85 (Auftrag B2 in `docs/auftraege/bildagenten-2026-11-09.md`; Bildbudget) | `src/client/assets/material-texturen/` |
| 4.5 HINTERGRÜNDE | Hintergründe des Auftraggebers (`uploaded/`, `IMG_*`) einsetzen; Wasser `foam_lines`/`oil_slick`; dynamische Himmelsfarbe; Stil der Foto-Kulissen; Menügruppe Panoramen | `src/client/kulissenQuelle.js`, `kulissenUrls.js`, `panoramen.js`, `bodenMotiv.js` (Boden nach Motiv) |
| 4.6 BIOM-15-20 | 15 Streifen oben, 16 Facetten gitterartig, 17 Fries klein, 18 Tiefsee-Feinschliff, Fantasywald-Deko; Kristallarchipel-Grading 1,1 s → 0,4 s | `src/client/sonderKulissen.js`, `biomGrading.js`, `fantasywaldDeko.js` |
| 4.7 NAHTEN | Keramik und Metall: sichtbare Brüche, nahtlos neu | `src/client/stoffTexturen.js`, Texturen |
| 4.8 SPRITES | Emotionsblätter der 8-Bit-Figuren; `pixel/00_nullpointer-exception` nur mit Tod-Rolle; Glättung je Fraktion für Pixelkunst (einfache Glättung war ohne sichtbare Wirkung, 2026-11-27); zwei gesperrte Walk-Zellen (`chrome-code-shifter`, `buffer-flow-swarm`); Luchs-Emotionszellen | `src/client/figurSheets.js`, `scripts/sprites-erzeugen/` |
| 4.9 LOOK-3 | Prüfbild mit gefüllter Lava gegen `ref-3-vulkanschmiede-hud` | `tests/e2e/visuell.spec.mjs` |
| 4.10 BESTÄNDE | Ungenutzte Texturen, Normalmap, Intro-Video, 73 ungenutzte Stoffe, isometrische Biom-Objekte: als Referenz kennzeichnen, nichts löschen (Entscheidung 2026-11-11) | `docs/n34-ungenutzte-bestaende.md` |
| 4.11 FIGUREN-NEU | Rückmeldung 2026-11-25 „Figuren sehen schlecht aus“: neue Figurenbilder und Geländetexturen brauchen Bildbudget | wartet auf Freigabe (Abschnitt 9) |

## 5. Technik und Qualität

| ID | Arbeit | Wo |
|---|---|---|
| 5.1 N-43 | Wasser-Ereignisse (`damage`, `entity_in_water`, `drowning`) bündeln statt je Takt (42 KB/s, gemessen −94 %), Drahtformat mit Marke | `src/shared/protocol.js`, `src/server/lobbySession.js` |
| 5.2 OPT-1/2/7 | Bundle: Menü zuerst, Engine/Renderer/Katalog erst beim Matchstart; Geländegenerator nachladen; `dist` 117 MiB: größte Posten messen | `vite.config.mjs`, `src/client/main.js` (dynamische Importe) |
| 5.3 OPT-3 | `npm test` dauert 13–25 min: langsame Dateien in einen eigenen Lauf trennen | `package.json` (`test:unit`), `scripts/` |
| 5.4 ENG-12 | `renderer.js` in `node --test` nicht ladbar (`import.meta.glob`): Logik in eigene Module | `src/client/rendererLogik.js` als Muster |
| 5.5 QA-5 | Bild-Allokationen im Renderer messen und senken (ImageData Wasser, Gradients je Geschoss, `parseCss`, `.find` je Entität, Partikeldeckel) | `renderer.js`, `effects.js` |
| 5.6 KLEIN | N-46 `integrateStep`-Duplikat in `match.js`; ENG-6 LootSystem je Takt; ENG-7 Sortieren bei Registrierung; TER-2 `pruefeSpielbarkeit` „zu nadelig“; TER-3 Doku-/Ordnungspunkte I–L | `src/engine/` |
| 5.7 SKALIERUNG | 4K in `MAP_SIZES` mit Kamera, Strukturtests statt Wertetests; Snapshot-Strides sparen | `src/engine/karte.js` (`MAP_SIZES`), `src/engine/stateSnapshot.js` |
| 5.8 E2E-VOLLLAUF | Volle E2E-Suite (CI, vier Teile) nach jedem größeren Merge; QA-1/QA-3 Black-Box auf dem Produktionsbau | `.github/workflows/ci.yml` |
| 5.9 G1 | Spielgefühl messen: Eingabe bis Bild, lokal und online mit Latenz | `scripts/browser-perf.mjs` |
| 5.10 ÜBERSETZUNG | (später) Englisch per Einstellung; zuerst alle Texte in eine Tabelle ziehen | `src/client/` |
| 5.11 TESTZAHLEN | Der Block in `README.md`/`MASTERDOTO.md` nennt noch den Lauf vom 2026-11-12. Nach einem vollen Lauf: `npm run testlauf:erfassen`, dann `npm run check:docs -- --schreiben` | `docs/testlauf.json` |
| 5.12 DETERMINISMUS-SAFARI | Review 2026-11-28: Der Kartenbau (`src/shared/terrainKomposition.js`, `masse`/`masseSchief`, Exponenten 0,85 bis 7) rechnet mit `**` und gebrochenen Exponenten; `Math.pow` ist zwischen JS-Engines (V8 am Server, JavaScriptCore in Safari) nicht bitgleich garantiert. Der Client baut die Karte aus dem Seed nach und vergleicht mit `terrain_hash` (`src/client/terrainPreview.js`). Prüfen: Online-Partie auf echtem iPhone/iPad, Protokoll auf Hash-Abweichung ansehen; bei Abweichung die Karte vom Server übernehmen statt nachbauen oder ganzzahlige/tabellierte Potenzen (neue Geländefassung) | `src/client/terrainPreview.js`, `src/shared/terrainKomposition.js` |

## 6. Konten, Web-Zugang, Betrieb

| ID | Arbeit |
|---|---|
| 6.1 WWW-1 | Cloudflare (kein Netlify): Einstieg gebaut und getestet (`functions/`, D1, `_headers`, `_routes.json`). Offen beim Auftraggeber: Projekt anlegen, D1 und Bindung `DB`, `nodejs_compat`, Secrets, DNS und Zertifikat für www, alte Netlify-Seite `proarmgame` und Netlify-DNS abschalten. Hashes der Umgebung als `pbkdf2$20000$` neu erzeugen. Erste Abnahme: Rechenzeit der Passwortprüfung im kostenlosen Tarif, Dauer des Not-aus-Aufrufs (`docs/zugang-www.md`) |
| 6.2 KONTO-2/3 | Profil (Foto, Biografie, angepinnte Einheit) und Scoreboard aus der Nutzerdatenbank (`src/server/konto.js`, `src/client/kontoMenue.js`); Kennzahlen Sprünge, Selbsttreffer, Schaden je Einheit und Waffe erfassen (`src/shared/stats.js`) |
| 6.3 ABBILD | Hetzner-Abbild auffrischen (Spielserver mit Spieltoken-Prüfung), `deploy/` |
| 6.4 KNOTEN | Nur wenn der Auftraggeber mietet (`AGENTS.md` §5/§7): Firewall `deploy/firewall.nft`, Zertifikat, systemd-Units und Idle-Timer, Marker `ist-gemietet`, Belege in `docs/betrieb-INSTANZ.md`, `systemctl list-timers` als Nachweis |
| 6.5 PERSIST-1 | Eine JSON-Datei ohne Sperre (`src/server/persistence.js`): bewusst so bis zur zweiten Serverinstanz |
| 6.6 Z579 | Messung `messung.html` auf iPhone und Asus-Laptop (Auftraggeber), danach Grafikstufen-Grenzen festlegen |

## 7. Entscheidungen des Auftraggebers (gelten)

| Datum | Entscheidung |
|---|---|
| 2026-11-04 | Nur Querformat; Telefone hochkant zeigen „Bitte Gerät drehen“; Hochformat-HUD bleibt weg; ⚙-Menü für Musik, Effekte, Verlassen, Aufgeben |
| 2026-11-05 | Alles bis zur Produktionsreife; Entscheidungen trifft der Agent nach Spaß und Flow, nur Unentscheidbares geht zurück. **Es gibt keine Bots** (Mess-Skripte simulieren nur). Rangliste mit Elo; Revanche als echter Neustart; Musik „intensiv“ in der Schlussphase; Fortsetzen nach Neuladen; Tempo: eine Figur fällt nach 3–4 guten Treffern |
| 2026-11-05 | Hosting Hetzner, höchstens 1 €/h, Löschen nach 15 min ohne Spieler (Spielstand vorher außerhalb sichern); Bildbudget +10 € |
| 2026-11-11 | Versionsmarken bleiben Pflicht; Materialoptik-Shader gestrichen; „rund“ = 1:1 (Planet, runde Höhle, schwebende Insel), Auflösung bis 33 Mio. px; ungenutzte Bestände als Referenz, nichts löschen; GP-1/GP-2-Entscheidungen 8–25 (umgesetzt in Waffenfassung 21/22); Seil Fassung 3 „wie Worms“; Biome 15–20 freigegeben; Stil: alles Comic |
| 2026-11-12 | Wurffass entfällt, 150 Waffen bleiben; Wetter immer zufällig; Menü vereinfachen (2.7) |
| 2026-11-17 | Kein Netlify; Hosting des Web-Zugangs auf Cloudflare |
| 2026-11-25 | Startausrüstung (ersetzt EXKL-1): jede Figur trägt 5 feste Startwaffen mit unbegrenzter Munition (Auswahl durch den Agenten, gemessen), 2 Gimmicks (Seil 5×, Gleitschirm pa_114 5×; das Seil ist eine der 150 Waffen) und eine Spezialwaffe aus den übrigen 143: legendär 1 Schuss, stark 2, normal 3. Stufen nach Seltenheit (legendary; epic/rare; common/uncommon). Je Fraktion (9 Figuren): 1 legendär, 2 stark, 6 normal. TURRET-1: 2 bis 3 vorhandene, selten genutzte Waffen bekommen die Turm-Mechanik (Waffenfassung mit Marke, gemessen) |
| 2026-11-25 | Das Seil (Ninjaseil) ist der Enterhaken pa_111. Bedienung: Handy und iPad zuerst, Tastatur an zweiter Stelle |
| 2026-11-27 | Mindestens zehn legendäre Waffen: 11 (die 3 legendären und die 8 bisher epischen), jede Fraktion eine eigene. Gelände: Mittelweg zwischen „düsterer“ (2026-10-27) und hell — Tiefe halb so dunkel, Gestein je Bodenart |
| 2026-11-28 | Wunschbild des Spiels festgehalten (`docs/SSOT.md`, Teil D). Runde Karten: Schwerkraft zur Kartenmitte; Schwebekarten: keine oder schwache Atmosphäre. Keine Karte zweimal: die Revanche zieht eine neue Karte (das Seed-Feld bleibt für Tests und Nachspielen, Vorgabe leer). Kartengröße aus Spielerzahl plus Zufall (genaue Regel in der nächsten Zeile). Neue Ereignisse und Besucher wie in TODO 2.13 beschrieben; Blondine Kuss : Auslachen = 8 : 1 |
| 2026-11-28 | Der Heiler (TODO 2.13k) heißt **Dr. Stilzchen-Rumpel** |
| 2026-11-28 | Kartengröße: Spielerzahl gibt den Bereich (2 klein–mittel, 3 mittel–groß, 4 groß, 5 groß–riesig, 6 riesig), Zufall −25 % bis +50 % (ersetzt −30 %/+80 %). Agent: gilt für „Größe: automatisch“ (Vorgabe und „Spielen“), eine ausdrücklich gewählte Größe bleibt fest |
| 2026-11-24 | Zugtempo (Agent nach TODO 2.8, vom Auftraggeber bestätigt: „make it as you think“): Zugpause 3 → 1,5 s (ändert die Entscheidung vom 13.10.), Schusswiederholung online 2 → 1,5 s, Rückzugsfrist 5 → 3 s (Zugregelfassung 3). Gemessen: Warten je Zug 8 → 4,5 s |
| 2026-11-23 | Registrierung mit E-Mail (eindeutige Namen und Adressen, Anmeldung mit Name oder E-Mail); Web-Zugang mit schwächerem Hash (PBKDF2, 20 000 Runden) statt bezahltem Cloudflare-Tarif |

## 8. Abnahmen durch den Auftraggeber (maschinell nicht möglich)

Spieltest mit Menschen (QV-4: Wasserlauf, Sturzflut/Dammbruch, Treibsand, Treiben, Strömung, Lesbarkeit der Hinweise, Windpfeil) · Sicht: Figuren
(Randlicht, Hocke, 8-Bit-pixel, Angst, Tod-Epilog-Sprüche), Waffenoptik im Flug und im Nahkampf (N-09, N-10, N-14,
N-15, GP-8), Wetter und Hagel, Kameraeffekte, Spielgefühl (Trefferstopp, gestaffelte Schadenszahlen, Kill-Kamera, Kettenzähler), Mine und Fass (MINEN-1/2), Biomobjekte (Druckkessel, Giftblüte, Sporenbovist, Runenstein), Kartenportal (Ring, Sprung), Einstieg der ersten Partie (Texte, Lage), Grabstein, Seil am Touch-Gerät, Menü `kolossal`
am Telefon, Biome 15–20, später jedes Ereignis und jeder Besucher aus 2.13 (Bild, Häufigkeit, Spaß) · Hören: alle Klänge (K4, AUDIO-2, QA-2), Funkenkugel, Mine, Hagel, Titellied.

## 9. Fragen an den Auftraggeber

| Frage | Warum |
|---|---|
| Darf neues Bildmaterial (Figuren, Geländetexturen, Teilsprites für 2.10) aus dem Bildbudget (+10 €) erzeugt werden? | Rückmeldung „Figuren sehen schlecht aus“; Glättung und Farbänderung allein brachten keine sichtbare Besserung (gemessen 2026-11-27) |
| Rückmeldung zu Portal Stufe 1 (2.7) | Stufe 2 wartet darauf |

## 10. Branches

Ziel: nur `main`. Stand 2026-11-28: Jeder Branch auf GitHub ist entweder vollständig in `main` enthalten oder sein
Inhalt steckt in anderer Form in `main` (geprüft mit `git cherry` und je Änderung im Code). Gelöscht wird über den
Workflow **„Branches aufräumen“** (`.github/workflows/branch-aufraeumen.yml`; Listen `.github/branch-loeschliste.txt`
für vollständig enthaltene, `.github/branch-verworfen.txt` für geprüfte, überholte), weil das direkte Löschen per
`git push --delete` aus der Agentenumgebung abbricht.

| Branch | Befund |
|---|---|
| `claude/e2e-await-timeout` | Überholt: Home-Bypass (`tests/e2e/helfer/test-basis.mjs`), `await startMatch` (`messlauf.js`), Dezimalkomma (`kartenWahl.js`), Fraktionsanzeige und Texturendung (`main.js`) stehen in `main` |
| `claude/regelkontrolle-skript` | Übernommen: `scripts/regel-kontrolle.mjs`, `npm run balance:regelkontrolle` |
| `claude/repo-aufraeumen-reddit` | Übernommen: `docs/werbung/reddit-post.md`; Probe-Workflow `bildvergleich-probe.yml` entfernt |
| `experiment/boden-hell` | Verworfen: Auftraggeber wählte am 2026-11-27 den Mittelweg (in `main`) |
| `claude/qv6-*`, `claude/wasserlauf-ausbau`, `claude/balance-rollen-2026-11-18`, `integration/splitter`, `integration/menue-einfach`, `paket/startfairness` | Inhalt gleichwertig in `main` (rebasiert gemergt) |
| alle übrigen `integration/*`, `paket/*`, `claude/*` | Vollständig in `main` |

Falls nach dem Lauf noch ein Branch übrig ist: `git fetch --prune`, dann für ihn `git cherry origin/main origin/<branch>`;
Zeilen mit `+` sind Änderungen, die in `main` fehlen. Jede einzeln prüfen (steht sie in anderer Form schon in `main`?),
übernehmen oder hier als verworfen mit Grund eintragen, danach den Branch in `branch-verworfen.txt` eintragen und den
Workflow mit `verworfene: true`, `dry_run: false` starten.
