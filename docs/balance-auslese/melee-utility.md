# Balance-Auslese: melee + utility (2026-10-28)

Stand: Katalog `src/shared/config/weapons.js` (150 Waffen, Fassung 5), Auswertung am Arbeitsstand von `main` (Commit 80930e3). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Rechenskripte lagen im Scratchpad und sind unten (Abschnitt 2) beschrieben; alle Zahlen sind daraus abgeleitet.

Gruppe: Kategorien `melee` (21 Waffen, pa_001 bis pa_021) und `utility` (10 Waffen, pa_111 bis pa_120). Das sind 31 Waffen; **alle 31 wurden einzeln beurteilt** (bei 21 und 10 Waffen deckt "die 15 besten plus die 15 Ausreißer" je Themenfeld die Kategorie vollständig ab, siehe Abschnitt 4).

## 0. Kurzbefund

- **31 von 31 Waffen einzeln beurteilt.** Urteile nach dem ersten Wort der Urteilsspalte: Fehlzuordnung 9, zu stark 4, ok 11, zu schwach 6, Messartefakt 1.
- **Rangkorrelation Spearman powerScore gegen Mittel a bis d: 0,35 im Gesamtkatalog, 0,36 in dieser Gruppe;** gegen Feld a allein 0,91. Das Scoring bildet Schaden und Fläche ab und kaum Flug, Munition, Sonderwirkung.
- **Leistungswert zählt Felder, die der Motor nicht auswertet:** Strahlwaffen (Ananasbombe, Feuerwesen, Energiefaust, Bohrkanone) mit Radius, aoe, Rückstoß und Gelände; alle 21 Nahkämpfer mit Rückstoß. Blutritual (124,99, rare) und Wächterstatue (30,8) sind reine Selbstheiler ohne Schaden.
- **Rückstoß der Nahkämpfer wirkt nicht:** `knockback` wird in `projectileSystem.js` nur bei `blastRadius` > 0 angewandt; alle 21 Nahkämpfer haben Radius 0. Die Beschreibung des Baseballschlägers verspricht aber Rückstoß.
- **Nahkampf-Dubletten:** Mehrere Nahkämpfer sind von einer Schwesterwaffe mit sonst gleichen Flugwerten im Schaden übertroffen (Piratenhaken gegen Hakenklinge, Mehrzweckmesser gegen Kampfmesser, Rapier gegen Taschenmesser; Zwillingskatanas liegt bei fast gleicher Reichweite sieben Schaden unter dem Katana); Enterhaken und Düsenrucksack sind in allen Zahlen und in der Motorwirkung gleich, der Gleitschirm ist bei gleicher Wirkung nur schwächer, weil `effectMagnitude` 150 nicht gelesen wird.
- **Brand wirkt stärker, als der Leistungswert zählt (Verdacht):** Feuerwesen 46 + 60 = 106 Gesamtschaden, Feuerfaust 23,8 + 27 = 50,8, Eispickel lässt den Zug des Ziels ausfallen ohne Abklingzeit. Alle drei sind im Spiel nicht getestet.

## 1. Mittelwert und Standardabweichung je Merkmal

Population: Grundgesamtheit (Teilen durch n). Alle Zahlen aus dem Katalog; Kategoriespalten melee n=21, utility n=10, gesamt n=150.

| Merkmal | melee Mittel | melee SD | utility Mittel | utility SD | gesamt Mittel | gesamt SD |
|---|---:|---:|---:|---:|---:|---:|
| damage | 33.43 | 7.78 | 25.00 | 21.58 | 41.75 | 19.28 |
| blastRadius | 0.00 | 0.00 | 14.20 | 21.90 | 18.28 | 24.94 |
| knockback | 39.05 | 16.90 | 7.80 | 23.40 | 19.94 | 25.95 |
| terrainDamage | 5.05 | 9.27 | 8.50 | 25.50 | 4.87 | 16.77 |
| homing | 0.00 | 0.00 | 0.00 | 0.00 | 0.70 | 6.35 |
| piercing | 0.05 | 0.21 | 0.00 | 0.00 | 0.04 | 0.20 |
| maxAmmo | 5.00 | 0.00 | 4.80 | 0.60 | 4.09 | 1.08 |
| cooldown | 0.19 | 0.39 | 0.90 | 0.94 | 1.23 | 1.00 |
| fuseTime | 0.00 | 0.00 | 0.00 | 0.00 | 0.19 | 0.74 |
| maxRange | 172.62 | 44.93 | 334.10 | 93.73 | 500.54 | 227.07 |
| projectileSpeed (alle, Strahl = 0) | 38.68 | 4.86 | 0.00 | 0.00 | 42.04 | 34.58 |
| gravityScale (alle) | 1.12 | 0.08 | 1.00 | 0.00 | 1.03 | 0.08 |
| bounces (alle) | 1.00 | 0.62 | 0.00 | 0.00 | 0.19 | 0.49 |
| powerScore | 48.61 | 12.31 | 50.87 | 48.66 | 71.48 | 56.80 |
| elemental (Summe Feuer+Eis+Gift) | 2.05 | 6.40 | 7.50 | 15.04 | 6.11 | 15.40 |
| Anteil mit Motorwirkung (`special` in SPECIAL_EFFECTS) | 0.24 | – | 0.70 | – | 0.43 | – |
| Anteil aoe | 0.00 | – | 0.30 | – | 0.37 | – |
| Anteil Strahlwaffen (delivery hitscan) | 0.00 | – | 1.00 | – | 0.36 | – |

Nur Projektilwaffen (Strahlwaffen haben `projectileSpeed` 0 und `gravityScale` 1 als Platzhalter): melee n=21: Tempo 38.68 (SD 4.86), gravityScale 1.12, bounces 1.00; gesamt n=96: Tempo 65.68 (SD 17.74), gravityScale 1.04, bounces 0.30. utility hat keine Projektilwaffe.

Lesehinweise (aus der Tabelle belegt):

- melee hat in allen 21 Waffen `blastRadius` 0, `aoe` falsch, `homing` 0, `fuseTime` 0, `maxAmmo` 5; die Streuung liegt nur in Schaden (SD 7.78), Rückstoß, Flugprofil und Reichweite (maxRange 172.62 gegen 500.54 gesamt).
- utility ist bimodal: 6 von 10 Waffen haben Schaden 0 oder reine Selbstwirkung (Enterhaken, Düsenrucksack, Gleitschirm, Munitionskiste, dazu Wächterstatue und Blutritual mit Selbstheilung), 4 haben Schaden 30 bis 48 (Mittelwert 25.00, SD 21.58). Mittelwerte sind dort wenig aussagekräftig.
- Das Kategoriemittel von powerScore ist in melee 48.61 und in utility 50.87, der Katalog liegt bei 71.48 (SD 56.80).

## 2. Methode

**Referenz der z-Werte: Gesamtkatalog (150 Waffen).** Je Merkmal z = (Wert − Mittel) / SD. Ein Themenfeld-z ist der ungewichtete Mittelwert der z-Werte seiner Merkmale. Die Rangfolge innerhalb einer Kategorie hängt nicht von der Referenz ab (nur die Skala).

| Feld | Merkmale (Richtung: höher = stärker) | Festlegungen, die ich treffen musste |
|---|---|---|
| a Schaden | damage, blastRadius, terrainDamage, aoe (0/1), piercing | keine |
| b Flug | projectileSpeed, gravityScale (negiert: flacher = besser), bounces, maxRange, homing, delivery (Strahl = 1) | Tempo, Schwerkraft und Abpraller nur für Projektilwaffen (n=96) gerechnet; bei Strahlwaffen nicht anwendbar, dort entfallen sie. Die Richtung von gravityScale und delivery ist **meine Annahme** (flach = leichter zu zielen; Strahl = trifft sicher). |
| c Munition | maxAmmo, cooldown (negiert), fuseTime > 0 (negiert), rarity (common 0, uncommon 1, rare 2) | `rarity` ist die Quell-Seltenheit; sie ist kein Merkmal der Waffenstärke (siehe Abschnitt 6) und verzerrt Feld c: alle melee sind `common`, alle utility `uncommon`. |
| d Sonderwirkung | special (1, wenn `effectFor(special)` im Motor eine Wirkung liefert, sonst 0), effectMagnitude (null = 0), elemental (Summe), knockback | `effectMagnitude` hat nur vier Werte (64/72/150/165) und liest der Motor nicht (siehe `docs/waffen-verkabelung.md`); ein Wert von 150 erzeugt deshalb für diese Einzelgröße ein z von rund 7,5 (Statistik-Artefakt, betrifft den Gleitschirm). |
| e Scoring | z(powerScore) − z(Mittel der Felder a bis d) | Positiv: Leistungswert höher als das, was die Merkmale ergeben. Negativ: niedriger. |

Messung: `scripts/waffen-balance.mjs` (`messeWaffe`, exportiert), Ziel steht still, Entfernungen 40/90/150/300/500/800/1200/1700 px. **Drei Karten-Seeds** je Waffe (Seed = 4242 + (index + Versatz) × 977, Versatz 0, 1000, 2000), also nicht nur die Standardkarte. `schaden` ist der Bestwert pro Schuss, `Reichweite` die größte Entfernung mit mindestens 25 % des Bestwerts.

Gegenrechnung "Leistungswert nur aus Motorfeldern" (`ps_wirksam`): gleiche Formel wie `computePowerScore`, aber Felder, die der Motor nach meiner Lektüre für diese Waffe nicht auswertet, werden 0 gesetzt: bei Strahlwaffen `blastRadius`, `aoe`, `knockback`, `terrainDamage`, `bounces` (`#resolveHitscan` in `match.js` ruft nur `applyDamage` und die Zielwirkung auf; Kette und Bohrer sind ausgenommen, die Bohrkanone nutzt feste Radien aus `SPECIAL_DEFAULTS`); bei Würfen ohne Radius (alle melee) `knockback` (in `projectileSystem.js` steht der Rückstoß nur innerhalb des `blastRadius > 0`-Zweigs); bei Selbstwirkungen (`SELF_TARGET_KINDS`) der ganze Wert. Das ist eine Rechnung zur Einordnung, kein Entscheidungsvorschlag für die Formel.

## 3. Beste und Ausreißer je Themenfeld und Kategorie

"Beste" = höchste z-Werte, "Ausreißer" = größte |z|; jeweils bis zu 15 Waffen. melee hat 21, utility 10 Waffen. Die Zahl hinter dem Namen ist der z-Wert (Referenz Gesamtkatalog). Bei Gleichstand entscheidet die Katalogreihenfolge; das betrifft vor allem Feld c in melee (alle 21 haben Munition 5, 17 haben Abklingzeit 0 und 4 Abklingzeit 1, alle `common`), dort sind die Listen nicht aussagekräftig, und Feld b/c in utility (alle Strahlwaffen).

### Nahkampf (melee, 21)

**a Schaden und Zerstörung**

- Beste (15): Energieschwert 0.62; Morgenstern -0.10; Kettensäge -0.11; Kriegshammer -0.13; Schaufel -0.16; Eispickel -0.33; Baseballschläger -0.37; Taschenmesser -0.47; Feuerfaust -0.48; Kampfmesser -0.48; Kriegssense -0.49; Katana -0.50; Runenschwert -0.51; Hakenklinge -0.52; Krummsäbel -0.53
- Ausreißer (15): Energieschwert 0.62; Piratenhaken -0.58; Zwillingskatanas -0.57; Doppelaxt -0.56; Rapier -0.55; Tonfa -0.54; Mehrzweckmesser -0.54; Krummsäbel -0.53; Hakenklinge -0.52; Runenschwert -0.51; Katana -0.50; Kriegssense -0.49; Feuerfaust -0.48; Kampfmesser -0.48; Taschenmesser -0.47

**b Flug, Reichweite, Zielen**

- Beste (15): Krummsäbel 0.46; Taschenmesser -0.25; Runenschwert -0.32; Zwillingskatanas -0.43; Rapier -0.54; Schaufel -0.60; Eispickel -0.60; Mehrzweckmesser -0.60; Kampfmesser -0.60; Tonfa -0.62; Kettensäge -0.62; Piratenhaken -0.64; Katana -0.65; Hakenklinge -0.66; Energieschwert -0.66
- Ausreißer (15): Kriegssense -1.02; Baseballschläger -0.78; Morgenstern -0.75; Kriegshammer -0.74; Feuerfaust -0.70; Doppelaxt -0.69; Hakenklinge -0.66; Energieschwert -0.66; Katana -0.65; Piratenhaken -0.64; Tonfa -0.62; Kettensäge -0.62; Schaufel -0.60; Eispickel -0.60; Mehrzweckmesser -0.60

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (15): Baseballschläger 0.38; Feuerfaust 0.38; Hakenklinge 0.38; Piratenhaken 0.38; Schaufel 0.38; Tonfa 0.38; Eispickel 0.38; Zwillingskatanas 0.38; Katana 0.38; Mehrzweckmesser 0.38; Taschenmesser 0.38; Runenschwert 0.38; Rapier 0.38; Kampfmesser 0.38; Doppelaxt 0.38
- Ausreißer (15): Baseballschläger 0.38; Feuerfaust 0.38; Hakenklinge 0.38; Piratenhaken 0.38; Schaufel 0.38; Tonfa 0.38; Eispickel 0.38; Zwillingskatanas 0.38; Katana 0.38; Mehrzweckmesser 0.38; Taschenmesser 0.38; Runenschwert 0.38; Rapier 0.38; Kampfmesser 0.38; Doppelaxt 0.38

**d Sonderwirkung und Status**

- Beste (15): Feuerfaust 0.78; Eispickel 0.65; Kriegshammer 0.58; Hakenklinge 0.39; Piratenhaken 0.34; Baseballschläger 0.24; Morgenstern 0.13; Energieschwert -0.11; Doppelaxt -0.12; Kriegssense -0.16; Runenschwert -0.18; Tonfa -0.21; Kettensäge -0.21; Schaufel -0.26; Mehrzweckmesser -0.26
- Ausreißer (15): Feuerfaust 0.78; Eispickel 0.65; Kriegshammer 0.58; Rapier -0.45; Hakenklinge 0.39; Katana -0.36; Piratenhaken 0.34; Krummsäbel -0.34; Zwillingskatanas -0.32; Schaufel -0.26; Mehrzweckmesser -0.26; Taschenmesser -0.26; Kampfmesser -0.26; Baseballschläger 0.24; Tonfa -0.21

**e Scoring (Residuum)**

- Beste (15): Kriegssense 0.87; Kettensäge 0.84; Morgenstern 0.68; Katana 0.63; Kampfmesser 0.58; Doppelaxt 0.56; Rapier 0.55; Mehrzweckmesser 0.53; Tonfa 0.51; Schaufel 0.48; Baseballschläger 0.38; Zwillingskatanas 0.37; Taschenmesser 0.23; Runenschwert 0.21; Kriegshammer 0.15
- Ausreißer (15): Kriegssense 0.87; Kettensäge 0.84; Morgenstern 0.68; Katana 0.63; Kampfmesser 0.58; Doppelaxt 0.56; Rapier 0.55; Mehrzweckmesser 0.53; Tonfa 0.51; Schaufel 0.48; Baseballschläger 0.38; Krummsäbel -0.38; Zwillingskatanas 0.37; Taschenmesser 0.23; Runenschwert 0.21

### Hilfsmittel (utility, 10)

**a Schaden und Zerstörung**

- Beste (10): Blutritual 0.54; Bohrkanone 0.49; Ananasbombe 0.44; Feuerwesen 0.39; Energiefaust -0.33; Wächterstatue -0.54; Enterhaken -0.83; Düsenrucksack -0.83; Gleitschirm -0.83; Munitionskiste -0.83
- Ausreißer (10): Enterhaken -0.83; Düsenrucksack -0.83; Gleitschirm -0.83; Munitionskiste -0.83; Wächterstatue -0.54; Blutritual 0.54; Bohrkanone 0.49; Ananasbombe 0.44; Feuerwesen 0.39; Energiefaust -0.33

**b Flug, Reichweite, Zielen**

- Beste (10): Blutritual 0.36; Ananasbombe 0.33; Energiefaust 0.33; Feuerwesen 0.30; Bohrkanone 0.08; Wächterstatue 0.06; Enterhaken 0.04; Düsenrucksack 0.04; Gleitschirm 0.04; Munitionskiste 0.04
- Ausreißer (10): Blutritual 0.36; Ananasbombe 0.33; Energiefaust 0.33; Feuerwesen 0.30; Bohrkanone 0.08; Wächterstatue 0.06; Enterhaken 0.04; Düsenrucksack 0.04; Gleitschirm 0.04; Munitionskiste 0.04

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (10): Enterhaken 0.69; Düsenrucksack 0.69; Bohrkanone 0.69; Wächterstatue 0.69; Munitionskiste 0.69; Energiefaust 0.44; Blutritual 0.19; Ananasbombe 0.19; Feuerwesen 0.19; Gleitschirm -0.27
- Ausreißer (10): Enterhaken 0.69; Düsenrucksack 0.69; Bohrkanone 0.69; Wächterstatue 0.69; Munitionskiste 0.69; Energiefaust 0.44; Gleitschirm -0.27; Blutritual 0.19; Ananasbombe 0.19; Feuerwesen 0.19

**d Sonderwirkung und Status**

- Beste (10): Gleitschirm 1.87; Blutritual 0.52; Energiefaust 0.20; Feuerwesen 0.10; Enterhaken -0.04; Düsenrucksack -0.04; Bohrkanone -0.04; Wächterstatue -0.04; Munitionskiste -0.04; Ananasbombe -0.55
- Ausreißer (10): Gleitschirm 1.87; Ananasbombe -0.55; Blutritual 0.52; Energiefaust 0.20; Feuerwesen 0.10; Enterhaken -0.04; Düsenrucksack -0.04; Bohrkanone -0.04; Wächterstatue -0.04; Munitionskiste -0.04

**e Scoring (Residuum)**

- Beste (10): Ananasbombe 0.09; Feuerwesen -0.23; Blutritual -0.65; Wächterstatue -0.82; Bohrkanone -0.88; Energiefaust -0.90; Enterhaken -1.05; Düsenrucksack -1.05; Munitionskiste -1.05; Gleitschirm -2.02
- Ausreißer (10): Gleitschirm -2.02; Enterhaken -1.05; Düsenrucksack -1.05; Munitionskiste -1.05; Energiefaust -0.90; Bohrkanone -0.88; Wächterstatue -0.82; Blutritual -0.65; Feuerwesen -0.23; Ananasbombe 0.09

## 4. Einzelbeurteilung (31 Waffen)

Urteile: ok / zu stark / zu schwach / Fehlzuordnung / Messartefakt. Ein Zusatz in Klammern kennzeichnet, worauf sich das Urteil stützt. Vorschläge sind Testwerte zur Entscheidung, keine Änderung. "Risiko" nennt, was mit einer Umsetzung mitgezogen werden müsste. Wo `special` im Motor keine Wirkung hat, steht das (gelesen in `src/engine/specials.js`, `SPECIAL_EFFECTS`).

Gemessen = Bestwert je Seed (drei Werte, Versatz 0/1000/2000), "Reichw." ebenso je Seed; ps = Katalog-`powerScore`, ps* = Gegenrechnung aus Motorfeldern.

### Nahkampf (melee, 21)

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_001 | Baseballschläger | Schaden 35, Radius 0, Rückst. 82, Mun. 5, CD 0, Reichw. 110, `bat_knockback` | 24.5/24.5/24.5; Reichw. 40/40/40 | 57.9 (uncommon) → 47.08 (uncommon) | **Fehlzuordnung (Text und Score)** | Beschreibung verspricht "weit zurückstößt", aber `knockback` 82 wird bei `blastRadius` 0 nicht angewandt (`projectileSystem.js`, Rückstoß nur im Radiuszweig); im Leistungswert zählt er mit 10,8 von 57,9 Punkten (19 %). | Beschreibung ändern ODER Rückstoß für Würfe umsetzen (Entscheidung); `knockback` 82 unverändert lassen | Motoränderung am Rückstoß verändert alte Replays (Fassungsmarke nötig, §2); reine Textänderung ohne Risiko |
| pa_002 | Feuerfaust | Schaden 34, Radius 0, Rückst. 55, Mun. 5, CD 0, Reichw. 127, `burn` | 32.8/32.8/32.8; Reichw. 40/40/40 | 57.86 (uncommon) → 50.6 (uncommon) | **zu stark (Verdacht, Code gelesen, nicht im Spiel getestet)** | Feuer 18 ergibt Brand 9 je Zug über 3 Züge (`elementalEffectFor`/`burn`): 23,8 Direktschaden + 27 Brand = 50,8 insgesamt, die Messung sieht nur einen Tick (32,8); der Leistungswert zählt Feuer nur mit 9 Punkten. | `elemental.fire` 18 → 10 (Brand 8/Zug Untergrenze) als Test, Gesamtschaden dann 23,8 + 24 = 47,8; oder `damage` 34 → 28 | Brand-Untergrenze 8 ist gemeinsam für alle Feuerwaffen; Fassungsprüfsummen (`waffen-fassung.test.js`) neu rechnen |
| pa_003 | Hakenklinge | Schaden 30, Radius 0, Rückst. 45, Mun. 5, CD 0, Reichw. 147, `hook_pull` | 21/21/21; Reichw. 90/40/90 | 42.24 (common) → 36.3 (common) | **ok** | Schaden 30 (gemessen 21), Heranziehen 90 px (`hook_pull`, Motorwirkung PULL) ist die eigentliche Leistung; Wert liegt mittig im Nahkampf. | keine | – |
| pa_004 | Piratenhaken | Schaden 24, Radius 0, Rückst. 40, Mun. 5, CD 0, Reichw. 158, `hook_pull` | 16.8/16.8/16.8; Reichw. 90/90/90 | 34.98 (common) → 29.7 (common) | **zu schwach** | Gleiche Wirkung wie Hakenklinge (`hook_pull`), aber Schaden 24 statt 30 und Rückstoß 40 statt 45; nur 11 px mehr Reichweite (158 gegen 147). Niedrigster Leistungswert der Nahkämpfer mit Wirkung (34,98), gemessen 16,8 (niedrigster Wert der Gruppe). | `damage` 24 → 28 (Test) | Leistungswert steigt um rund 4,4 auf 39,4, bleibt common; Prüfsummen neu rechnen |
| pa_005 | Morgenstern | Schaden 50, Radius 0, Rückst. 70, Mun. 5, CD 1, Reichw. 110, `heavy_impact` | 35/35/35; Reichw. 40/40/40 | 71.48 (uncommon) → 63.16 (uncommon) | **ok** | Schaden 50 mit Abklingzeit 1 und Reichweite 110 (gemessen 35 bei 40 px); hoher Schaden ist durch die kurze Reichweite und die Pause bezahlt. Score 71,5 (uncommon), davon 8,3 Punkte aus dem nicht wirkenden Rückstoß 70. | keine | – |
| pa_006 | Schaufel | Schaden 25, Radius 0, Rückst. 30, Mun. 5, CD 0, Reichw. 180, `dig` | 17.5/17.5/17.5; Reichw. 90/90/90 | 57.86 (uncommon) → 53.9 (uncommon) | **Fehlzuordnung (Score)** | Spaten: Gelände 35 macht 23,1 von 57,9 Punkten (40 %); Kampfwert gemessen nur 17,5 (Median common 17,8 laut Audit A7), die Stufe uncommon stammt aus dem Graben, nicht aus dem Kampf. | Gewicht `terrainDamage` im Leistungswert 0,6 → 0,3 testen (Schaufel dann 46,3, uncommon bleibt knapp); `terrainDamage` 35 bleibt | Gewichtsänderung verschiebt auch Stufen anderer Waffen mit Gelände (Katalog 4,87 im Mittel, nur 18 Waffen mit Wert); Beute-Gewichtung ändert sich |
| pa_007 | Tonfa | Schaden 28, Radius 0, Rückst. 35, Mun. 5, CD 0, Reichw. 168, `rapid_melee` | 19.6/19.6/19.6; Reichw. 90/90/90 | 38.72 (common) → 34.1 (common) | **ok** | Schaden 28 (gemessen 19,6), keine Sonderwirkung; `rapid_melee` hat keine Motorwirkung, die Beschreibung verspricht nichts darüber. | keine | – |
| pa_008 | Kriegshammer | Schaden 45, Radius 0, Rückst. 65, Mun. 5, CD 1, Reichw. 110, `stun` | 31.5/31.5/31.5; Reichw. 40/40/40 | 67.12 (uncommon) → 59.4 (uncommon) | **ok** | Schaden 45 mit Abklingzeit 1, Reichweite 110, `stun` wirkt wie Einfrieren 1 Zug (Zug des Ziels entfällt, `turn_skipped`); gemessen 31,5 bei 40 px; Preis stimmt (kurz, Pause). | keine | – |
| pa_009 | Eispickel | Schaden 37, Radius 0, Rückst. 30, Mun. 5, CD 0, Reichw. 180, `freeze` | 25.9/25.9/25.9; Reichw. 90/90/90 | 68.31 (uncommon) → 64.35 (uncommon) | **zu stark (Verdacht, Code gelesen, nicht im Spiel getestet)** | Wie Kriegshammer, aber ohne Abklingzeit und mit 90 px Reichweite gemessen (Kriegshammer 40 px): ein Treffer lässt den Zug des Ziels ausfallen, der Leistungswert zählt das nur mit Eis 25 × 0,5 = 12,5 Punkten; Direktschaden 25,9. | `cooldown` 0 → 1 (Test) oder `maxAmmo` 5 → 3 | Ausfallzug ist die stärkste Einzelwirkung der Gruppe; Abklingzeit 1 senkt den Leistungswert um 6,8 (Faktor 0,9) |
| pa_010 | Kettensäge | Schaden 52, Radius 0, Rückst. 35, Mun. 5, CD 1, Reichw. 168, `multi_hit` | 36.4/36.4/36.4; Reichw. 40/90/90 | 67.52 (uncommon) → 63.36 (uncommon) | **ok** | Höchster Nahkampfschaden (52, gemessen 36,4 und damit 2,04 × Median common 17,8, aber 1,2 × Median uncommon 30,4), mit Abklingzeit 1 und kurzer Reichweite; `multi_hit` hat keine Motorwirkung, die Beschreibung verspricht keinen Mehrfachtreffer. | keine (wenn `multi_hit` je umgesetzt wird, Schaden neu prüfen) | – |
| pa_011 | Zwillingskatanas | Schaden 25, Radius 0, Rückst. 24, Mun. 5, CD 0, Reichw. 233, `direct_hit` | 17.5/17.5/17.5; Reichw. 90/90/90 | 33.97 (common) → 30.8 (common) | **zu schwach** | "Zwei Klingen", aber ein Wurf mit Schaden 25 (gemessen 17,5); schlechter als Katana (32) bei etwa gleicher Reichweite (233 gegen 229), dazu fehlt die Doppelwirkung. | `damage` 25 → 30 (Test) oder Doppelwurf umsetzen (Entscheidung) | +5 Schaden: Leistungswert +5,5; Doppelwurf wäre Motoränderung (Replay-Fassung) |
| pa_012 | Katana | Schaden 32, Radius 0, Rückst. 20, Mun. 5, CD 0, Reichw. 229, `direct_hit` | 22.4/22.4/22.4; Reichw. 1080/90/90 | 37.84 (common) → 35.2 (common) | **ok (Reichweite Messartefakt)** | Schaden 32 (gemessen 22,4); der Messwert 1080 px Reichweite im Seed 0 ist ein Treffer nach Abprall auf der Hügelkarte, in den beiden anderen Seeds 90 px. | keine | – |
| pa_013 | Mehrzweckmesser | Schaden 28, Radius 0, Rückst. 30, Mun. 5, CD 0, Reichw. 180, `direct_hit` | 19.6/19.6/19.6; Reichw. 90/90/90 | 38.06 (common) → 34.1 (common) | **zu schwach** | Gleiche Flugwerte wie Kampfmesser (Tempo 40,8, Reichweite 180, Rückstoß 30, 1 Abpraller), aber Schaden 28 gegen 34; "vielseitig" ohne Zusatzwirkung. | `damage` 28 → 32 (Test) | Leistungswert +4,4 auf rund 42,5, bleibt common |
| pa_014 | Taschenmesser | Schaden 35, Radius 0, Rückst. 30, Mun. 5, CD 0, Reichw. 246, `direct_hit` | 24.5/24.5/24.5; Reichw. 90/150/90 | 45.76 (uncommon) → 41.8 (common) | **zu stark** | Übertrifft Katana in allen Werten (Schaden 35 gegen 32, Reichweite 246 gegen 229, Rückstoß 30 gegen 20); Leistungswert 45,76 liegt 0,76 über der Schwelle uncommon, das Kampfmesser (34 Schaden) mit 44,66 darunter. Ohne wirkungslosen Rückstoß: 41,8, also common. | `damage` 35 → 32 (Test); gleichzeitig Stufenfrage klären | Rangänderung im Nahkampf; Stufe common statt uncommon ändert Beute-Gewicht |
| pa_015 | Runenschwert | Schaden 31, Radius 0, Rückst. 38, Mun. 5, CD 0, Reichw. 207, `direct_hit` | 21.7/21.7/21.7; Reichw. 90/90/90 | 42.42 (common) → 37.4 (common) | **ok** | Schaden 31 als `arcane` (Familie Magie), gemessen 21,7; im Mittelfeld, Beschreibung stimmt. | keine | – |
| pa_016 | Rapier | Schaden 27, Radius 0, Rückst. 10, Mun. 5, CD 0, Reichw. 246, `direct_hit` | 18.9/18.9/18.9; Reichw. 90/90/150 | 31.02 (common) → 29.7 (common) | **zu schwach** | Gleiche Flugwerte wie Taschenmesser (Tempo 45, Reichweite 246, Schwerkraft 1), aber Schaden 27 gegen 35, Rückstoß 10 gegen 30, ohne Abpraller; niedrigster Leistungswert der Gruppe (31,02), gemessen 18,9. | `damage` 27 → 32 (Test) | Leistungswert +5,5; bleibt common |
| pa_017 | Kampfmesser | Schaden 34, Radius 0, Rückst. 30, Mun. 5, CD 0, Reichw. 180, `direct_hit` | 23.8/23.8/23.8; Reichw. 90/90/90 | 44.66 (common) → 40.7 (common) | **ok** | Schaden 34 (gemessen 23,8) bei Reichweite 180; Leistungswert 44,66 knapp unter der Schwelle uncommon. | keine | – |
| pa_018 | Energieschwert | Schaden 42, Radius 0, Rückst. 45, Mun. 5, CD 1, Reichw. 147, `energy_blade` | 29.4/29.4/29.4; Reichw. 90/40/90 | 55.84 (uncommon) → 50.49 (uncommon) | **ok (Ausreißer nur statistisch)** | Hoher z_schaden (+0,62) entsteht fast allein aus `piercing` 1 (Mittel 0,04, SD 0,2: z 4,9 für diese Waffe); Schaden 42 bei Abklingzeit 1, gemessen 29,4; kein Missverhältnis. | keine | – |
| pa_019 | Doppelaxt | Schaden 26, Radius 0, Rückst. 44, Mun. 5, CD 0, Reichw. 112, `direct_hit` | 18.2/18.2/18.2; Reichw. 40/40/40 | 41.01 (common) → 35.2 (common) | **zu schwach** | "Schwere Wurfaxt" mit 112 px Reichweite (Tempo 34, Schwerkraft 1,3) so kurz wie die schweren Waffen (Baseballschläger, Morgenstern, Kriegshammer 110), aber Schaden nur 26 (gemessen 18,2); die schweren Verwandten haben 35 bis 50. | `damage` 26 → 34 (Test) | Leistungswert +8,8 auf rund 49,8: Stufe uncommon |
| pa_020 | Kriegssense | Schaden 33, Radius 0, Rückst. 40, Mun. 5, CD 0, Reichw. 152, `direct_hit` | 23.1/23.1/23.1; Reichw. 90/90/40 | 41.58 (common) → 36.3 (common) | **Fehlzuordnung (Text gegen Werte)** | Beschreibung "weiter Hieb", aber Reichweite 152 ist die 7. kürzeste von 21 (Katana 229, Krummsäbel 235) und das Flugprofil das schwächste der Gruppe (z_flug −1,02: Tempo 38, Schwerkraft 1,2, kein Abpraller); Schaden 33 normal. | Beschreibung auf "mittlere Distanz" kürzen (Text) oder `gravityScale` 1,2 → 1,05 (Test) | Text: keines; Flugänderung ist Motorwert mit Replay-Fassung |
| pa_021 | Krummsäbel | Schaden 29, Radius 0, Rückst. 22, Mun. 5, CD 0, Reichw. 235, `direct_hit` | 20.3/20.3/20.3; Reichw. 90/90/90 | 44.7 (common) → 41.8 (common) | **ok** | Bester Flug der Nahkämpfer (z_flug +0,46: Reichweite 235, Schwerkraft 0,9, 3 Abpraller), Schaden 29 (gemessen 20,3); ausgeglichen durch niedrigen Schaden. | keine | – |

### Hilfsmittel (utility, 10)

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_111 | Enterhaken | Schaden 0, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 252, `grapple` | Selbstwirkung, 0 | 0 (common) → 0 (common) | **Fehlzuordnung (Dublette)** | Selbstwirkung `grapple` = Versatz 60 px, in allen Katalogwerten und in der Motorwirkung identisch mit Düsenrucksack; Leistungswert 0, Stufe common trotz Nutzen; Messung 0 Schaden ist hier Soll, kein Fehler. | Wirkung unterscheiden (z. B. Zug zu einem Ankerpunkt) oder Waffe streichen; kurzfristig `effectMagnitude` im Motor lesen (siehe Gleitschirm) | Neue Wirkung = Motoränderung und Replay-Fassung; Streichen ändert die Beute-Tabelle |
| pa_112 | Düsenrucksack | Schaden 0, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 252, `flight` | Selbstwirkung, 0 | 0 (common) → 0 (common) | **Fehlzuordnung (Dublette)** | Siehe Enterhaken: gleiche Zahlen (Munition 5, Abklingzeit 0, Versatz 60 px); die einzigen Unterschiede sind Name und `special`-Bezeichnung. | Wirkung unterscheiden, z. B. `effectMagnitude` 64 und eigene Weite lesen (wie beim Raketenrucksack geplant) | Motorleser für `effectMagnitude` nötig (Replay-Fassung) |
| pa_113 | Bohrkanone | Schaden 30, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 280, `drill_cannon` | 30/30/30; Reichw. 270/300/360 | 89.1 (rare) → 33 (common) | **Fehlzuordnung (Score), Verdacht zu stark** | Leistungswert 89,1 (rare) enthält Gelände 85 × 0,6 = 51 Roh-Punkte (56 nach Munitionsfaktor), aber der Bohrstrahl nutzt feste Radien (`drillEntryRadius` 30, `drillTunnelRadius` 14) und nicht `terrainDamage`; aus Motorfeldern bleiben 33 (common). Gemessen 30 Schaden bei Trefferquote 1,0 und einer Messreichweite von 270/300/360 px (je Seed), Abklingzeit 0, Munition 5: sicherer Treffer ohne Pause. | `terrainDamage` 85 → 0 oder im Leistungswert für `drill_cannon` nicht zählen; Stufe dann common; Abklingzeit 0 → 1 als Test | `terrainDamage` wird vom Strahl nicht gelesen, die Änderung ändert das Spiel nicht, aber die Stufe (Beute) und Prüfsummen |
| pa_114 | Gleitschirm | Schaden 0, Radius 0, Rückst. 0, Mun. 3, CD 2, Reichw. 252, `flight` | Selbstwirkung, 0 | 0 (common) → 0 (common) | **zu schwach (und z_sonder Statistik-Artefakt)** | Gleiche Wirkung wie Düsenrucksack (Versatz 60 px), aber Munition 3 statt 5 und Abklingzeit 2 statt 0; die zugesagte größere Weite (`effectMagnitude` 150) liest der Motor nicht (steht so im Generator). z_sonder +1,87 kommt nur von diesem ungelesenen Feld. | In `buildEffect` für `MOVE` `distance` aus `effectMagnitude` lesen (150) — oder Munition 3 → 5 | Leser ändert Verhalten von 4 Waffen (Raketenrucksack, Gleitschirm, beide Dimensionswaffen); Replay-Fassung (§2) und Wirkungs-Tests |
| pa_115 | Wächterstatue | Schaden 28, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 261, `guardian` | Selbstwirkung, 0 | 30.8 (common) → 0 (common) | **Fehlzuordnung (Score)** | Reiner Selbstheiler (`guardian` = HEAL, Betrag max(35, 1,2 × 28) = 35); der Katalogschaden 28 wird nie angerichtet, zählt aber 30,8 Punkte. Die Beschreibung sagt "heilt den Schützen" und ist richtig. | `damage` 28 → 0 (Heilung bleibt 35, da Untergrenze greift); Leistungswert dann 0 wie die anderen Selbstwirkungen | Prüfsummen und Fassungstabellen neu; Heilung ohne Abklingzeit bei 5 Munition: Stärke gegen die anderen Heilwaffen prüfen (andere Kategorien) |
| pa_116 | Blutritual | Schaden 50, Radius 55, Rückst. 0, Mun. 5, CD 2, Reichw. 467, `blood_ritual` | Selbstwirkung, 0 | 124.99 (rare) → 0 (common) | **Fehlzuordnung (Score)** | Höchster Leistungswert der Gruppe (124,99, rare) für eine reine Heilung: `blood_ritual` = HEAL, Betrag 1,2 × 50 = 60; Radius 55, aoe und Gift 35 werden nie ausgelöst, Schaden 50 nie angerichtet. Aus Motorfeldern: 0. | `blastRadius` 55 → 0, `aoe` → falsch, `elemental.poison` 35 → 0 (Heilung 60 bleibt, da sie an `damage` 50 hängt) | Matrix `docs/matrix-terrain-waffen-wirkung.md` führt Blutritual mit Flächenwirkung (Felder, nicht Motor); `check:effects`-Invarianten und Prüfsummen; Heilung 60 mit Abklingzeit 2 gegen Wächterstatue 35 ohne Pause: Verhältnis klären |
| pa_117 | Ananasbombe | Schaden 48, Radius 45, Rückst. 0, Mun. 5, CD 2, Reichw. 448, `fragmentation` | 48/48/48; Reichw. 500/500/510 | 97.27 (rare) → 47.52 (uncommon) | **Fehlzuordnung (Strahl statt Wurf)** | Beschreibung "Sprengwirkung im Umkreis und Splitterlöchern", aber `delivery` hitscan: der Strahl trifft nur ein Ziel (gemessen 48 flach bis 500 px, Trefferquote 1,0), Radius 45 und `aoe` werden nicht ausgewertet; der Leistungswert 97,27 (rare) enthält rund 50 Punkte daraus. Aus Motorfeldern 47,5 (uncommon). | `delivery` hitscan → projectile (Granate mit Zünder) ODER `blastRadius` 45 → 0 und Beschreibung anpassen (Entscheidung) | Wurf mit Radius 45 und Schaden 48 wäre deutlich stärker im Spiel als der Strahl; Reichweiten-Prüfungen (`check:range`) |
| pa_118 | Feuerwesen | Schaden 46, Radius 42, Rückst. 0, Mun. 5, CD 2, Reichw. 429, `fire_minion` | 66/66/66; Reichw. 500/500/500 | 112.56 (rare) → 65.34 (uncommon) | **zu stark (Verdacht, Code gelesen, nicht im Spiel getestet)** | Strahl 500 px: 46 Direktschaden und Feuer 40 = Brand 20 je Zug über 3 Züge (60), insgesamt 106 bei Abklingzeit 2 (gemessen 66 nach dem ersten Tick); Radius 42 und `aoe` ohne Wirkung. Die Beschreibung "legt im Umkreis Brand" trifft nicht zu (ein Ziel). | `elemental.fire` 40 → 20 (Brand 10/Zug, Gesamt 76) als Test; Beschreibung auf Einzelziel ändern | Leistungswert 112,56 → rund 103 (rare bleibt); Brand-Formel gilt für alle Feuerwaffen nur über `elemental`, hier einzeln |
| pa_119 | Munitionskiste | Schaden 0, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 252, `ammo_drop` | Selbstwirkung, 0 | 0 (common) → 0 (common) | **ok (Nutzwaffe)** | Füllt 3 Munition anderer Waffen auf (`ammo_drop`, AMMO), kostet den Zug; Leistungswert 0 und Stufe common entsprechen dem Katalog-Nachweis "kein Schaden"; Messung 0 ist Soll. | keine (Nutzwert im Leistungswert ist eine Formelfrage, siehe Abschnitt 7) | – |
| pa_120 | Energiefaust | Schaden 48, Radius 0, Rückst. 78, Mun. 5, CD 1, Reichw. 448, `energy_fist` | 48/48/0; Reichw. 510/500/0 | 53.95 (uncommon) → 45.14 (uncommon) | **Messartefakt (Sichtlinie) und Score leicht überhöht** | Strahl mit Sichtlinie: 48 nur bei 500/510 px in 2 von 3 Seeds, sonst 0, im dritten Seed insgesamt 0 (Ursache vermutlich die Sichtlinie, nicht untersucht); Rückstoß 78 wird vom Strahl nicht angewandt (8,8 Punkte im Score, ps* 45,1). | Messung mit mehr Winkeln wiederholen; `knockback` 78 → 0 oder aus dem Score nehmen (Strahl) | Fassung 3 hat die Waffe schon einmal gesenkt (`waffen-fassung.js`); Prüfsummen |

"Gemessen" bei Wurfwaffen: Alle 21 Nahkampfwaffen messen exakt 0,7 × Katalogschaden (z. B. Baseballschläger 35 → 24,5, Kettensäge 52 → 36,4), die Strahlwaffen exakt den Katalogschaden (Bohrkanone 30, Ananasbombe 48). Die Ursache des Faktors 0,7 habe ich nicht untersucht; in `classes.js` gibt es einen Klassenwert `power: 0.7`, ob er der Grund ist, ist nicht belegt. "Reichw." ist die Messgröße des Skripts (nächste getroffene Stufe der Entfernungsreihe), nicht `maxRange`; Wurfwaffen erreichen darin 40 bis 150 px gegen 110 bis 246 im Katalog. Das gilt für alle drei Seeds und ist damit kein Zufall der Karte, aber die Entfernungsreihe ist grob (40/90/150/300).

## 5. Tabellenmatrix Waffe × Themenfeld

z-Werte gegen den Gesamtkatalog. z_scoring = z(powerScore) − z(Mittel a bis d). Die Urteilsspalte entspricht Abschnitt 4. CSV mit denselben Daten: `docs/balance-auslese/melee-utility.csv`.

| id | Waffe | Kat. | z_schaden | z_flug | z_munition | z_sonder | z_scoring | powerScore | Stufe | Urteil |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| pa_001 | Baseballschläger | melee | -0.37 | -0.78 | 0.38 | 0.24 | 0.38 | 57.9 | uncommon | Fehlzuordnung (Text und Score) |
| pa_002 | Feuerfaust | melee | -0.48 | -0.70 | 0.38 | 0.78 | -0.15 | 57.86 | uncommon | zu stark (Verdacht, Code gelesen, nicht im Spiel getestet) |
| pa_003 | Hakenklinge | melee | -0.52 | -0.66 | 0.38 | 0.39 | -0.02 | 42.24 | common | ok |
| pa_004 | Piratenhaken | melee | -0.58 | -0.64 | 0.38 | 0.34 | -0.06 | 34.98 | common | zu schwach |
| pa_005 | Morgenstern | melee | -0.10 | -0.75 | 0.13 | 0.13 | 0.68 | 71.48 | uncommon | ok |
| pa_006 | Schaufel | melee | -0.16 | -0.60 | 0.38 | -0.26 | 0.48 | 57.86 | uncommon | Fehlzuordnung (Score) |
| pa_007 | Tonfa | melee | -0.54 | -0.62 | 0.38 | -0.21 | 0.51 | 38.72 | common | ok |
| pa_008 | Kriegshammer | melee | -0.13 | -0.74 | 0.13 | 0.58 | 0.15 | 67.12 | uncommon | ok |
| pa_009 | Eispickel | melee | -0.33 | -0.60 | 0.38 | 0.65 | -0.09 | 68.31 | uncommon | zu stark (Verdacht, Code gelesen, nicht im Spiel getestet) |
| pa_010 | Kettensäge | melee | -0.11 | -0.62 | 0.13 | -0.21 | 0.84 | 67.52 | uncommon | ok |
| pa_011 | Zwillingskatanas | melee | -0.57 | -0.43 | 0.38 | -0.32 | 0.37 | 33.97 | common | zu schwach |
| pa_012 | Katana | melee | -0.50 | -0.65 | 0.38 | -0.36 | 0.63 | 37.84 | common | ok (Reichweite Messartefakt) |
| pa_013 | Mehrzweckmesser | melee | -0.54 | -0.60 | 0.38 | -0.26 | 0.53 | 38.06 | common | zu schwach |
| pa_014 | Taschenmesser | melee | -0.47 | -0.25 | 0.38 | -0.26 | 0.23 | 45.76 | uncommon | zu stark |
| pa_015 | Runenschwert | melee | -0.51 | -0.32 | 0.38 | -0.18 | 0.21 | 42.42 | common | ok |
| pa_016 | Rapier | melee | -0.55 | -0.54 | 0.38 | -0.45 | 0.55 | 31.02 | common | zu schwach |
| pa_017 | Kampfmesser | melee | -0.48 | -0.60 | 0.38 | -0.26 | 0.58 | 44.66 | common | ok |
| pa_018 | Energieschwert | melee | 0.62 | -0.66 | 0.13 | -0.11 | -0.18 | 55.84 | uncommon | ok (Ausreißer nur statistisch) |
| pa_019 | Doppelaxt | melee | -0.56 | -0.69 | 0.38 | -0.12 | 0.56 | 41.01 | common | zu schwach |
| pa_020 | Kriegssense | melee | -0.49 | -1.02 | 0.38 | -0.16 | 0.87 | 41.58 | common | Fehlzuordnung (Text gegen Werte) |
| pa_021 | Krummsäbel | melee | -0.53 | 0.46 | 0.38 | -0.34 | -0.38 | 44.7 | common | ok |
| pa_111 | Enterhaken | utility | -0.83 | 0.04 | 0.69 | -0.04 | -1.05 | 0 | common | Fehlzuordnung (Dublette) |
| pa_112 | Düsenrucksack | utility | -0.83 | 0.04 | 0.69 | -0.04 | -1.05 | 0 | common | Fehlzuordnung (Dublette) |
| pa_113 | Bohrkanone | utility | 0.49 | 0.08 | 0.69 | -0.04 | -0.88 | 89.1 | rare | Fehlzuordnung (Score), Verdacht zu stark |
| pa_114 | Gleitschirm | utility | -0.83 | 0.04 | -0.27 | 1.87 | -2.02 | 0 | common | zu schwach (und z_sonder Statistik-Artefakt) |
| pa_115 | Wächterstatue | utility | -0.54 | 0.06 | 0.69 | -0.04 | -0.82 | 30.8 | common | Fehlzuordnung (Score) |
| pa_116 | Blutritual | utility | 0.54 | 0.36 | 0.19 | 0.52 | -0.65 | 124.99 | rare | Fehlzuordnung (Score) |
| pa_117 | Ananasbombe | utility | 0.44 | 0.33 | 0.19 | -0.55 | 0.09 | 97.27 | rare | Fehlzuordnung (Strahl statt Wurf) |
| pa_118 | Feuerwesen | utility | 0.39 | 0.30 | 0.19 | 0.10 | -0.23 | 112.56 | rare | zu stark (Verdacht, Code gelesen, nicht im Spiel getestet) |
| pa_119 | Munitionskiste | utility | -0.83 | 0.04 | 0.69 | -0.04 | -1.05 | 0 | common | ok (Nutzwaffe) |
| pa_120 | Energiefaust | utility | -0.33 | 0.33 | 0.44 | 0.20 | -0.90 | 53.95 | uncommon | Messartefakt (Sichtlinie) und Score leicht überhöht |

## 6. Güte des Scorings

Spearman-Rangkorrelation (Rangfolgen mit mittleren Rängen bei Gleichstand) von `powerScore` gegen den Mittelwert der Felder a bis d:

| Menge | n | Spearman rho |
|---|---:|---:|
| Gesamtkatalog | 150 | **0.35** |
| Gesamtkatalog, nur Waffen mit Schaden > 0 | 143 | 0.42 |
| Gesamtkatalog, Feld c ohne `rarity` | 150 | 0.30 |
| Gesamtkatalog, Gewicht `homing` 5 → 0,5 (Test) | 150 | 0.35 |
| melee | 21 | 0.62 |
| utility | 10 | 0.77 |
| melee + utility (diese Gruppe) | 31 | **0.36** |
| melee + utility, Feld c ohne `rarity` | 31 | 0.41 |

Je Feld (Gesamtkatalog, powerScore gegen das einzelne Feld): a Schaden 0.91, b Flug 0.07, c Munition -0.29, d Sonderwirkung -0.02.

Einordnung:

- Das Scoring ist praktisch ein **Schadens- und Flächenwert**: rho gegen Feld a ist 0.91, gegen b, c und d um null (0.07 / -0.29 / -0.02). Der niedrige Gesamtwert 0.35 entsteht, weil Flug, Munition und Sonderwirkung kaum in den Leistungswert eingehen (Formel in `scripts/build-weapon-catalog.mjs`, `computePowerScore`: Schaden, Radius, Gelände, Rückstoß, aoe, Durchschlag, Zielsuche, Abpraller, Elementarwert; Munition, Abklingzeit und Sicht nur als Faktoren). Das ist eine Eigenschaft der Formel, kein Fehler in einzelnen Waffen. Dass die vier Felder gleich schwer zählen, ist **meine Festlegung**; mit einem höheren Gewicht auf Feld a wäre rho höher.
- Dass die Rangkorrelation in melee (0.62) und utility (0.77) höher ist, liegt daran, dass dort innerhalb der Kategorie weniger Merkmale variieren (melee: Radius, aoe, Zünder, Munition konstant).
- **`homing` 5 → 0,5:** Es gibt genau zwei Waffen mit `homing` > 0 (Phönixschlag 35, Fliegendes Superschaf 70, beide nicht in dieser Gruppe). Meine Gegenrechnung (Gewichtsanteil `homing` × 0,5 statt × 5, Faktoren der Formel beibehalten) ändert rho von 0.3537 auf 0.3538 (fast unverändert, weil nur zwei Ränge wandern); der Effekt liegt in den Stufen: Phönixschlag fällt von 287,87 auf 146,12 und Fliegendes Superschaf von 463,82 auf 151,97, beide damit von `legendary` auf `epic` (Schwelle 130). Für melee und utility ändert sich nichts (`homing` ist dort überall 0).
- **Zünderwaffen (+15 % Schaden, nur testen):** Im Katalog haben 11 Waffen `fuseTime` > 0 (pa_028:ranged, pa_029:ranged, pa_030:ranged, pa_046:heavy_ranged, pa_047:heavy_ranged, pa_048:heavy_ranged, pa_052:heavy_ranged, pa_053:heavy_ranged, pa_070:elemental, pa_073:elemental, pa_144:ultimate). **In melee und utility ist es keine einzige** (`fuseTime` überall 0). Für diese Gruppe ist der Versuch deshalb ohne Wirkung; ich habe ihn hier nicht gerechnet.

**Passen `powerTier` und `rarity` dazu?**

| Stufe (`powerTier`) | n | mittlerer powerScore | mittleres Mittel a bis d |
|---|---:|---:|---:|
| common | 63 | 30.8 | -0.07 |
| uncommon | 32 | 60.9 | -0.04 |
| rare | 42 | 100.2 | 0.09 |
| epic | 8 | 147.0 | 0.24 |
| legendary | 5 | 288.5 | 0.47 |

| Quell-Seltenheit (`rarity`) | n | mittlerer powerScore | mittleres Mittel a bis d (mit rarity in Feld c) |
|---|---:|---:|---:|
| common | 80 | 65.8 | -0.13 |
| uncommon | 40 | 49.8 | 0.05 |
| rare | 30 | 115.7 | 0.35 |

- `powerTier` steigt monoton mit dem Mittel der Felder a bis d (common -0.07 bis legendary 0.47), die Abstände zwischen common und uncommon sind aber klein (-0.07 gegen -0.04). Die Stufen trennen also nach Schaden, nicht nach dem Gesamtbild.
- `rarity` ist **nicht** an die Stärke gebunden: Die Seltenheit "common" hat mit 65.8 einen **höheren** mittleren powerScore als "uncommon" (49.8). Grund: `rarity` liegt in Blöcken nach Nummer (pa_001 bis 080 common, 081 bis 120 uncommon, 121 bis 150 rare), siehe Audit A6. Übereinstimmung von `rarity` und `powerTier`: 44 von 150 (hier nachgezählt: 44).
- In dieser Gruppe: alle 21 melee sind `common`; ihre Stufen sind 12 × common und 9 × uncommon. Alle 10 utility sind `uncommon`; ihre Stufen sind 5 × common (alle mit powerScore 0 oder ohne Schadenswirkung), 1 × uncommon, 4 × rare (Bohrkanone, Blutritual, Ananasbombe, Feuerwesen).

**Größte Abweichungen zwischen Rang des Leistungswerts und Rang des Mittels a bis d** (Rang powerScore − Rang Mittel a bis d von 150; positiv = Leistungswert höher eingestuft als die Merkmale hergeben):

| Waffe | Kat. | powerScore | Stufe | Rangdifferenz |
|---|---|---:|---|---:|
| Gleitschirm | utility | 0 | common | -112.5 |
| Enterhaken | utility | 0 | common | -73.5 |
| Düsenrucksack | utility | 0 | common | -73.5 |
| Munitionskiste | utility | 0 | common | -73.5 |
| Wächterstatue | utility | 30.8 | common | -69 |
| Kettensäge | melee | 67.52 | uncommon | +60 |
| Morgenstern | melee | 71.48 | uncommon | +49 |
| Kriegssense | melee | 41.58 | common | +46 |
| Kampfmesser | melee | 44.66 | common | +42 |
| Schaufel | melee | 57.86 | uncommon | +39.5 |
| Doppelaxt | melee | 41.01 | common | +36 |
| Katana | melee | 37.84 | common | +34 |

Größte Abweichungen im Gesamtkatalog (zur Einordnung, die Waffen anderer Kategorien beurteilen die Parallel-Auslesen): Meteorbrocken (elemental) +120; Dimensionssprung (magic) -117.5; Katapult (elemental) +117; Dimensionsriss (magic) -116.5; Gleitschirm (utility) -112.5; Haubitze (elemental) +112; Raketenrucksack (ranged) -107; Roboterbombe (heavy_ranged) +105; Impulsbombe (ranged) +102; Kaktusbombe (ranged) +98.

Abweichungen dieser Gruppe in einem Satz: Die fünf Waffen mit powerScore 0 bzw. reiner Selbstwirkung (Enterhaken, Düsenrucksack, Gleitschirm, Munitionskiste, mit Wächterstatue als Heiler) stehen im Rang weit unter dem, was Munition und Sonderwirkung ergeben, und Blutritual, Ananasbombe, Feuerwesen und Bohrkanone stehen über dem, was der Motor aus ihren Feldern macht (Abschnitt 4, Spalte ps*).

## 7. Sofort umsetzbar und Entscheidungsbedarf

### Sofort umsetzbar (eindeutig)

- Änderungen am Katalog laufen über `project_armageddon_weapons_v1.json` und `npm run weapons:build`, danach `npm test` und `npm run check:docs` (Prüfsummen, Invarianten). Die folgenden Punkte sind deshalb eindeutig, weil sie im Spiel nichts ändern, nur Leistungswert, Stufe und Text:
- Blutritual: `blastRadius` 55 → 0, `aoe` → falsch, `elemental.poison` 35 → 0 (Motor liest sie nicht; Heilung 60 bleibt). Mit Prüfsummen-Nachzug.
- Wächterstatue: `damage` 28 → 0 (Heilung 35 bleibt über die Untergrenze 35; Leistungswert 0). Mit Prüfsummen-Nachzug.
- Bohrkanone: `terrainDamage` 85 → 0 (der Strahl liest es nicht; in `src/engine` wird es nur in `projectileSystem.js` und `turret.js` gelesen) oder im Leistungswert für `drill_cannon` nicht zählen; Stufe rare → common.
- Beschreibungen angleichen: Baseballschläger (Rückstoß), Ananasbombe und Feuerwesen (kein Umkreis), Kriegssense ("weiter" Hieb). Nur Text.
- `homing`-Gewicht 5 → 0,5 (Auftraggeber hat zugestimmt): für diese Gruppe ohne Wirkung, siehe Abschnitt 6.

### Braucht Entscheidung

- Ananasbombe: `delivery` hitscan → projectile mit Zünder (Granate) oder Fläche streichen. Die Wirkung im Spiel ändert sich stark.
- Rückstoß für Würfe (Nahkampf) umsetzen oder `knockback` aus dem Leistungswert nehmen; ersteres ist eine Motoränderung mit Replay-Fassung.
- `effectMagnitude` im Motor lesen: macht Gleitschirm, Raketenrucksack und beide Dimensionswaffen unterscheidbar; Enterhaken und Düsenrucksack brauchen eine eigene Wirkung.
- Feuerwesen/Feuerfaust/Eispickel: Brand- und Frost-Zahlen im Spiel prüfen, dann Zahlen setzen (nur Verdacht aus Code).
- Nahkampf-Schwesterwaffen (Piratenhaken, Mehrzweckmesser, Rapier, Zwillingskatanas, Doppelaxt): Schadensanhebung um 4 bis 8, oder die Waffen mit eigener Wirkung differenzieren.
- Nutzwert im Leistungswert (Selbstwirkungen, Heiler): ein Wert statt 0 würde Enterhaken, Düsenrucksack, Gleitschirm, Munitionskiste, Wächterstatue und Blutritual in der Beute einordnen; eigene Formel nötig.
- Zünderwaffen +15 %: in dieser Gruppe keine Zünderwaffe; Entscheidung betrifft andere Kategorien.

## 8. Grenzen dieser Auslese

- Die Messung ist nur ein Hügel-Preset mit drei Seeds und grober Entfernungsreihe; Nullwerte bei Sichtlinienwaffen sind Verdachtsfälle für Messartefakte (Energiefaust).
- Alle Urteile "zu stark" mit Zusatz "Verdacht" stützen sich auf gelesenen Code und Rechnung, nicht auf Spielversuche.
- z-Werte hängen an meinen Festlegungen (Richtung von gravityScale und delivery, Gleichgewichtung der Merkmale, `rarity` in Feld c); die Rangfolgen innerhalb einer Kategorie sind davon nur über diese Wahl abhängig.
- Der Faktor 0,7 zwischen Katalog- und Messschaden der Nahkämpfer ist nicht erklärt.
- `docs/matrix-terrain-waffen-wirkung.md` führt Wirkungen nach Katalogfeldern, nicht nach Motor; Abweichungen dazu (Blutritual, Ananasbombe) sind hier gelesen aus dem Motor.

