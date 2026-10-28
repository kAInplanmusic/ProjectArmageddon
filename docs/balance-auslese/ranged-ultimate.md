# Balance-Auslese: Gruppe „ranged + ultimate“ (2026-10-28)

Auftrag des Auftraggebers (sinngemäß): je Merkmal den Durchschnitt ziehen, die 15 Waffen mit dem höchsten Wert und die 15 am weitesten vom
Durchschnitt entfernten einzeln ansehen, in verschiedenen Themenfeldern, um schnell alle Waffen einmal anzufassen und die Güte des Scorings zu
sehen. Diese Datei deckt die Katalogkategorien `ranged` (19 Waffen, pa_022 bis pa_040) und `ultimate` (10 Waffen, pa_141 bis pa_150) ab. Es wurde
nichts am Katalog, am Quellcode oder an Tests geändert; alle Vorschläge sind unumgesetzt. Maschinenlesbare Fassung: `ranged-ultimate.csv`.

Vorarbeit gelesen: `docs/audit-waffen-2026-10-28.md` (Befund, Messlage, neun offene Vorschläge, hier „Audit E4-n“ genannt). Datenstand: Katalog
`src/shared/config/weapons.js`, 150 Waffen. Nachgerechnet: Die Leistungsformel (`computePowerScore`) wurde im Skript nachgebildet und ergibt für alle
150 Waffen exakt den Katalogwert (0 Abweichungen); damit sind die Szenarien unten belastbar.

## 1 Ergebnis in Kürze

1. **Das Scoring ist im Wesentlichen ein Schadenswert.** Spearman von `powerScore` gegen den Mittelwert der Themenfelder a–d: 0,49 (n=150) über den Gesamtkatalog, aber nur
   -0,05 (n=19) in `ranged` und 0,56 (n=10) in `ultimate` (beide zusammen 0,23 (n=29)); gegen das Themenfeld a (Schaden) allein 0,91 (n=150).
2. **Fehler im Motor, kein Katalogwert:** Der Feldmörser richtet doppelten Schaden an (Luftschlag ruft `resolveHitscan` mit Schütze null; Messung 71 bis 76 gegen 48 im Katalog). Laut Code gilt dasselbe für Meteorbrocken und Haubitze (nicht gemessen).
3. **Selbstwirkungen werden nach Feldern bewertet, die nie wirken:** Himmelswächter (epic) und Astralkrieger (rare) tragen Radius und `aoe` im Wert, die der Motor nicht anwendet; Astralross trägt nur ungenutzten Schaden; der Raketenrucksack (Nutzwaffe, Schaden 0) bleibt dagegen bei Wert 4,1 (common).
4. **Zünderwaffen** (Kaktusbombe, Pömpel, Impulsbombe) messen 0,20 bis 0,48 ihres Katalogschadens, Direkttreffer 0,43 bis 0,47, die Rakete 0,55. Die +15 % ändern keine Stufe (alle 11 Zünderwaffen des Katalogs bleiben in ihrer Stufe) und schließen die Lücke der Impulsbombe nicht; das Messverfahren trägt Zünder nicht (Kosmische Wassermelone 14,9 / 0 / 0 / 0 über vier Seeds).
5. **Gewichte im Leistungswert verschieben Stufen:** terrainDamage 0,6 macht den Raketenwerfer zu epic (mit 0,3: rare); Elementarwerte mit 0,5 unterbewerten Schaden über Zeit (Giftige Weltenflasche: rechnerisch 120 aus Gift gegen 33 Direktschaden). `effectMagnitude` wird vom Motor nirgends gelesen.

Einzeln beurteilt: **29 von 29 Waffen** (ok: 15, Fehlzuordnung: 7, zu schwach: 5, zu stark: 1, Messartefakt: 1).

## 2 Methode

- Merkmale je Waffe aus dem Katalog; Mittelwert und Standardabweichung (Grundgesamtheit, n) je Kategorie und für den Gesamtkatalog (150).
- z-Werte beziehen sich auf den **Gesamtkatalog** (Vergleich mit allen Kategorien). In `ultimate` ist die Streuung vieler Merkmale 0 (alle 10 haben Tempo 70, Schwerkraft 1, Munition 5, Reichweite 565); dort sagt der Gesamt-z nur „anders als der Katalog“.
- Themenfeld-z = Mittel der Merkmals-z, vorzeichenrichtig (höher = stärker/vorteilhafter):
  - (a) Schaden und Zerstörung: damage, blastRadius, terrainDamage, aoe, piercing (piercing ist überall 0 bis auf wenige Waffen, in der Gruppe 0).
  - (b) Flug und Zielen: projectileSpeed (+), gravityScale (−), bounces (+), maxRange (+), homing (+), hitscan (+). homing ist in der Gruppe überall 0.
  - (c) Munition und Verfügbarkeit: maxAmmo (+), cooldown (−), fuseTime (−), rarity (− : selten = schwer zu bekommen). **Vorbehalt:** alle zehn `ultimate` sind `rare`, das drückt ihr z_munition um etwa 0,4 allein durch die Seltenheit; die Rangkorrelation ohne rarity steht in Abschnitt 7 (dann mittelt Feld c nur über drei Merkmale).
  - (d) Sonderwirkung und Status: wirkt im Motor (1, wenn `buildEffect` oder `elementalEffectFor` einen Effekt liefert), effectMagnitude, Elementarsumme, knockback. **Lücke:** Der Art-Malus (Brand, Gift, Fluch, Schock, Fassung 2) steckt in `ART_REGEL`, nicht im Katalog, und fehlt im z (zum Beispiel Fackel, Impulsbombe, Leerenritter).
  - (e) Scoring: z des `powerScore`; Vergleich gegen das Komposit (Mittel a–d, erneut standardisiert) und gegen eine **Soll-Stufe** (Rangfolge nach Komposit, gleiche Stufengrößen wie die tatsächlichen: common 63, uncommon 32, rare 42, epic 8, legendary 5).
- Messung: `messeWaffe` aus `scripts/waffen-balance.mjs`, je Waffe mit **vier Seeds** (Index plus 0, 7, 13, 21) statt einem; Bestwert je Seed. Ergänzende Läufe (Ereignisprotokoll, Volltreffer-Versuch, Rückstoß) mit Kopien des Skripts im Arbeitsverzeichnis, ohne das Skript zu ändern.
- Grenzen der Messung (aus dem Audit und eigenen Läufen): nur eine Karte (`hills`), stehendes Ziel, Treffer meist nur bis etwa 300 bis 500 px (vereinzelte Treffer bei 1220 bis 1690 px sind Zufall), daher „Reichweite 300“ bei Katalog 565 bis 879, `schaden: 1` also **ohne Mali der Fassung 2**; Projektilwaffen erhalten den Klassenfaktor, Strahlwaffen nicht.

## 3 Mittelwert und Streuung je Merkmal

| Merkmal | ranged (n=19) Mittel (SD) | ultimate (n=10) Mittel (SD) | Gesamt (n=150) Mittel (SD) | z ranged | z ultimate |
|---|---|---|---|---|---|
| damage | 33,84 (15,62) | 81,00 (16,12) | 41,75 (19,28) | -0,41 | +2,04 |
| blastRadius | 15,42 (20,69) | 49,50 (33,72) | 18,28 (24,94) | -0,11 | +1,25 |
| knockback | 31,21 (20,12) | 14,50 (29,02) | 19,94 (25,95) | +0,43 | -0,21 |
| projectileSpeed | 70,11 (9,55) | 70,00 (0,00) | 42,04 (34,58) | +0,81 | +0,81 |
| gravityScale | 1,01 (0,09) | 1,00 (0,00) | 1,03 (0,08) | -0,17 | -0,34 |
| bounces | 0,05 (0,22) | 0,10 (0,30) | 0,19 (0,49) | -0,29 | -0,19 |
| fuseTime (s) | 0,42 (0,99) | 0,50 (1,50) | 0,19 (0,74) | +0,31 | +0,42 |
| terrainDamage | 7,32 (21,06) | 18,50 (37,02) | 4,87 (16,77) | +0,15 | +0,81 |
| homing | 0,00 (0,00) | 0,00 (0,00) | 0,70 (6,35) | -0,11 | -0,11 |
| piercing | 0,00 (0,00) | 0,00 (0,00) | 0,04 (0,20) | -0,20 | -0,20 |
| aoe (Anteil) | 0,37 (0,48) | 0,70 (0,46) | 0,37 (0,48) | -0,01 | +0,68 |
| maxAmmo | 5,11 (0,85) | 5,00 (0,00) | 4,09 (1,08) | +0,94 | +0,84 |
| cooldown | 0,79 (1,00) | 2,50 (0,67) | 1,23 (1,00) | -0,44 | +1,27 |
| maxRange | 572,47 (158,32) | 565,00 (0,00) | 500,54 (227,07) | +0,32 | +0,28 |
| effectMagnitude (fehlend = 0) | 3,37 (14,29) | 0,00 (0,00) | 3,01 (19,60) | +0,02 | -0,15 |
| elemental (Summe Feuer+Eis+Gift) | 0,63 (2,68) | 15,50 (31,02) | 6,11 (15,40) | -0,36 | +0,61 |
| delivery = hitscan (Anteil) | 0,00 (0,00) | 0,00 (0,00) | 0,36 (0,48) | -0,75 | -0,75 |
| rarity (0 common, 1 uncommon, 2 rare) | 0,00 (0,00) | 2,00 (0,00) | 0,67 (0,79) | -0,85 | +1,69 |
| wirkt im Motor (special oder Elementarwirkung, Anteil) | 0,11 (0,31) | 0,70 (0,46) | 0,50 (0,50) | -0,79 | +0,40 |
| powerScore | 60,74 (36,27) | 150,84 (59,86) | 71,48 (56,80) | -0,19 | +1,40 |

Kategorieprofil: `ranged` liegt im Schaden unter dem Katalogmittel (33,8 gegen 41,8) und bei Munition (5,11) über ihm; `ultimate` hat knapp den doppelten Schaden (81,0), den 2,7-fachen Radius, Abklingzeit 2,5 und feste Werte bei Tempo, Munition und Reichweite.

## 4 Themenfelder: Beste und Ausreißer

#### Kategorie ranged (n=19)

- **(a) Schaden und Zerstörung**
  - Beste (z absteigend, 15): Raketenwerfer +1,25; Rakete +0,49; Kaktusbombe +0,46; Feldmörser +0,44; Impulsbombe +0,43; Energieball +0,41; Pressluftbohrer +0,31; Pömpel +0,15; Kraftfaust -0,33; Plasmawerfer -0,48; Handtuch -0,51; Raketenhandschuh -0,51; Zauberbolzen -0,54; Maschinenpistole -0,57; Mittelfinger -0,58
  - Ausreißer (|z| absteigend, 15): Raketenwerfer +1,25; Raketenrucksack -0,83; Boxhandschuhe -0,63; Zauberstab -0,62; Fackel -0,59; Mittelfinger -0,58; Maschinenpistole -0,57; Zauberbolzen -0,54; Handtuch -0,51; Raketenhandschuh -0,51; Rakete +0,49; Plasmawerfer -0,48; Kaktusbombe +0,46; Feldmörser +0,44; Impulsbombe +0,43
  - nicht in „Beste“ und nicht in „Ausreißer“: keine
- **(b) Flug, Reichweite, Zielen**
  - Beste (z absteigend, 15): Zauberbolzen +0,45; Mittelfinger +0,41; Maschinenpistole +0,36; Plasmawerfer +0,32; Rakete +0,24; Raketenhandschuh +0,15; Fackel +0,04; Boxhandschuhe +0,03; Pressluftbohrer +0,03; Kaktusbombe +0,03; Pömpel +0,03; Impulsbombe +0,03; Kraftfaust +0,03; Raketenrucksack +0,03; Energieball +0,03
  - Ausreißer (|z| absteigend, 15): Feldmörser -0,74; Handtuch -0,74; Zauberbolzen +0,45; Mittelfinger +0,41; Maschinenpistole +0,36; Plasmawerfer +0,32; Rakete +0,24; Zauberstab -0,16; Raketenhandschuh +0,15; Raketenwerfer -0,10; Fackel +0,04; Boxhandschuhe +0,03; Pressluftbohrer +0,03; Kaktusbombe +0,03; Pömpel +0,03
  - nicht in „Beste“ und nicht in „Ausreißer“: keine
- **(c) Munition, Abklingzeit, Verfügbarkeit**
  - Beste (z absteigend, 15): Maschinenpistole +1,49; Raketenrucksack +1,03; Plasmawerfer +0,79; Boxhandschuhe +0,79; Mittelfinger +0,79; Handtuch +0,79; Pressluftbohrer +0,79; Fackel +0,79; Zauberstab +0,79; Zauberbolzen +0,79; Raketenhandschuh +0,79; Kraftfaust +0,54; Energieball +0,29; Rakete +0,29; Feldmörser +0,29
  - Ausreißer (|z| absteigend, 15): Maschinenpistole +1,49; Raketenrucksack +1,03; Plasmawerfer +0,79; Boxhandschuhe +0,79; Mittelfinger +0,79; Handtuch +0,79; Pressluftbohrer +0,79; Fackel +0,79; Zauberstab +0,79; Zauberbolzen +0,79; Raketenhandschuh +0,79; Kaktusbombe -0,72; Impulsbombe -0,72; Kraftfaust +0,54; Raketenwerfer -0,42
  - nicht in „Beste“ und nicht in „Ausreißer“: Pömpel
- **(d) Sonderwirkung und Status**
  - Beste (z absteigend, 15): Raketenrucksack +1,03; Kaktusbombe +0,40; Boxhandschuhe +0,35; Kraftfaust -0,00; Raketenhandschuh -0,15; Zauberstab -0,19; Plasmawerfer -0,29; Pressluftbohrer -0,29; Pömpel -0,29; Impulsbombe -0,29; Energieball -0,29; Raketenwerfer -0,29; Rakete -0,29; Feldmörser -0,29; Handtuch -0,39
  - Ausreißer (|z| absteigend, 15): Raketenrucksack +1,03; Maschinenpistole -0,58; Zauberbolzen -0,50; Mittelfinger -0,48; Fackel -0,44; Kaktusbombe +0,40; Handtuch -0,39; Boxhandschuhe +0,35; Plasmawerfer -0,29; Pressluftbohrer -0,29; Pömpel -0,29; Impulsbombe -0,29; Energieball -0,29; Raketenwerfer -0,29; Rakete -0,29
  - nicht in „Beste“ und nicht in „Ausreißer“: keine
- **(e) Scoring (z des powerScore)**
  - Beste (z absteigend, 15): Raketenwerfer +1,11; Kaktusbombe +0,67; Rakete +0,59; Feldmörser +0,52; Impulsbombe +0,52; Energieball +0,46; Pressluftbohrer +0,09; Pömpel +0,02; Kraftfaust -0,30; Raketenhandschuh -0,55; Plasmawerfer -0,57; Handtuch -0,61; Boxhandschuhe -0,65; Zauberbolzen -0,70; Fackel -0,72
  - Ausreißer (|z| absteigend, 15): Raketenrucksack -1,19; Raketenwerfer +1,11; Mittelfinger -0,77; Zauberstab -0,76; Maschinenpistole -0,74; Fackel -0,72; Zauberbolzen -0,70; Kaktusbombe +0,67; Boxhandschuhe -0,65; Handtuch -0,61; Rakete +0,59; Plasmawerfer -0,57; Raketenhandschuh -0,55; Feldmörser +0,52; Impulsbombe +0,52
  - nicht in „Beste“ und nicht in „Ausreißer“: keine

#### Kategorie ultimate (n=10, weniger als 15: alle zehn werden angesehen)

- **(a) Schaden und Zerstörung**
  - Beste (z absteigend, 15): Kosmischer Kern +2,52; Erdspalter +2,30; Weltendrache +1,26; Kosmische Wassermelone +1,02; Himmelswächter +0,79; Astralkrieger +0,75; Giftige Weltenflasche +0,67; Leerenritter +0,02; Goldene Reliktkugel -0,02; Astralross -0,16
  - Ausreißer: dieselben zehn Waffen, nach |z| sortiert: Kosmischer Kern +2,52; Erdspalter +2,30; Weltendrache +1,26; Kosmische Wassermelone +1,02; Himmelswächter +0,79; Astralkrieger +0,75; Giftige Weltenflasche +0,67; Astralross -0,16; Goldene Reliktkugel -0,02; Leerenritter +0,02
- **(b) Flug, Reichweite, Zielen**
  - Beste (z absteigend, 15): Kosmische Wassermelone +0,37; Astralkrieger +0,03; Leerenritter +0,03; Astralross +0,03; Erdspalter +0,03; Giftige Weltenflasche +0,03; Weltendrache +0,03; Himmelswächter +0,03; Goldene Reliktkugel +0,03; Kosmischer Kern +0,03
  - Ausreißer: dieselben zehn Waffen, nach |z| sortiert: Kosmische Wassermelone +0,37; Astralkrieger +0,03; Leerenritter +0,03; Astralross +0,03; Erdspalter +0,03; Giftige Weltenflasche +0,03; Weltendrache +0,03; Himmelswächter +0,03; Goldene Reliktkugel +0,03; Kosmischer Kern +0,03
- **(c) Munition, Abklingzeit, Verfügbarkeit**
  - Beste (z absteigend, 15): Astralross -0,09; Leerenritter -0,34; Giftige Weltenflasche -0,34; Goldene Reliktkugel -0,34; Astralkrieger -0,59; Erdspalter -0,59; Weltendrache -0,59; Himmelswächter -0,59; Kosmischer Kern -0,59; Kosmische Wassermelone -2,29
  - Ausreißer: dieselben zehn Waffen, nach |z| sortiert: Kosmische Wassermelone -2,29; Astralkrieger -0,59; Erdspalter -0,59; Weltendrache -0,59; Himmelswächter -0,59; Kosmischer Kern -0,59; Leerenritter -0,34; Giftige Weltenflasche -0,34; Goldene Reliktkugel -0,34; Astralross -0,09
- **(d) Sonderwirkung und Status**
  - Beste (z absteigend, 15): Giftige Weltenflasche +1,22; Weltendrache +1,14; Leerenritter +0,64; Astralross +0,59; Astralkrieger -0,08; Himmelswächter -0,08; Goldene Reliktkugel -0,08; Kosmische Wassermelone -0,58; Erdspalter -0,58; Kosmischer Kern -0,58
  - Ausreißer: dieselben zehn Waffen, nach |z| sortiert: Giftige Weltenflasche +1,22; Weltendrache +1,14; Leerenritter +0,64; Astralross +0,59; Kosmische Wassermelone -0,58; Erdspalter -0,58; Kosmischer Kern -0,58; Astralkrieger -0,08; Himmelswächter -0,08; Goldene Reliktkugel -0,08
- **(e) Scoring (z des powerScore)**
  - Beste (z absteigend, 15): Kosmischer Kern +3,14; Erdspalter +2,71; Weltendrache +2,53; Giftige Weltenflasche +1,57; Kosmische Wassermelone +1,52; Himmelswächter +1,06; Astralkrieger +0,99; Leerenritter +0,33; Goldene Reliktkugel +0,10; Astralross +0,02
  - Ausreißer: dieselben zehn Waffen, nach |z| sortiert: Kosmischer Kern +3,14; Erdspalter +2,71; Weltendrache +2,53; Giftige Weltenflasche +1,57; Kosmische Wassermelone +1,52; Himmelswächter +1,06; Astralkrieger +0,99; Leerenritter +0,33; Goldene Reliktkugel +0,10; Astralross +0,02

In beiden Kategorien decken „Beste“ und „Ausreißer“ zusammen alle 29 Waffen ab (ranged: 15 von 19 je Liste, Vereinigung 19); jede Waffe wurde einmal einzeln beurteilt (Abschnitt 6).

## 5 Tabellenmatrix (Gesamtkatalog als Bezug)

| id | Waffe | Kat. | z Schaden | z Flug | z Munition | z Sonder | z Scoring | Komposit a–d (z) | Stufe ist / Soll | Urteil |
|---|---|---|---|---|---|---|---|---|---|---|
| pa_022 | Plasmawerfer | ranged | -0,48 | +0,32 | +0,79 | -0,29 | -0,57 | +0,49 | common / rare | ok |
| pa_023 | Boxhandschuhe | ranged | -0,63 | +0,03 | +0,79 | +0,35 | -0,65 | +0,77 | common / rare | Fehlzuordnung |
| pa_024 | Mittelfinger | ranged | -0,58 | +0,41 | +0,79 | -0,48 | -0,77 | +0,20 | common / uncommon | ok |
| pa_025 | Handtuch | ranged | -0,51 | -0,74 | +0,79 | -0,39 | -0,61 | -1,19 | common / common | ok |
| pa_026 | Pressluftbohrer | ranged | +0,31 | +0,03 | +0,79 | -0,29 | +0,09 | +1,19 | uncommon / rare | ok |
| pa_027 | Fackel | ranged | -0,59 | +0,04 | +0,79 | -0,44 | -0,72 | -0,29 | common / uncommon | ok |
| pa_028 | Kaktusbombe | ranged | +0,46 | +0,03 | -0,72 | +0,40 | +0,67 | +0,25 | rare / uncommon | zu schwach |
| pa_029 | Pömpel | ranged | +0,15 | +0,03 | -0,13 | -0,29 | +0,02 | -0,34 | uncommon / common | zu schwach |
| pa_030 | Impulsbombe | ranged | +0,43 | +0,03 | -0,72 | -0,29 | +0,52 | -0,78 | rare / common | zu schwach |
| pa_031 | Kraftfaust | ranged | -0,33 | +0,03 | +0,54 | -0,00 | -0,30 | +0,34 | uncommon / rare | ok |
| pa_032 | Raketenrucksack | ranged | -0,83 | +0,03 | +1,03 | +1,03 | -1,19 | +1,77 | common / epic | Fehlzuordnung |
| pa_033 | Zauberstab | ranged | -0,62 | -0,16 | +0,79 | -0,19 | -0,76 | -0,24 | common / uncommon | ok |
| pa_034 | Zauberbolzen | ranged | -0,54 | +0,45 | +0,79 | -0,50 | -0,70 | +0,28 | common / uncommon | ok |
| pa_035 | Energieball | ranged | +0,41 | +0,03 | +0,29 | -0,29 | +0,46 | +0,63 | rare / rare | ok |
| pa_036 | Raketenhandschuh | ranged | -0,51 | +0,15 | +0,79 | -0,15 | -0,55 | +0,41 | common / rare | Fehlzuordnung |
| pa_037 | Raketenwerfer | ranged | +1,25 | -0,10 | -0,42 | -0,29 | +1,11 | +0,63 | epic / rare | zu schwach |
| pa_038 | Rakete | ranged | +0,49 | +0,24 | +0,29 | -0,29 | +0,59 | +1,03 | rare / rare | ok |
| pa_039 | Feldmörser | ranged | +0,44 | -0,74 | +0,29 | -0,29 | +0,52 | -0,42 | rare / common | zu stark |
| pa_040 | Maschinenpistole | ranged | -0,57 | +0,36 | +1,49 | -0,58 | -0,74 | +0,99 | common / rare | zu schwach |
| pa_141 | Astralkrieger | ultimate | +0,75 | +0,03 | -0,59 | -0,08 | +0,99 | +0,15 | rare / uncommon | Fehlzuordnung |
| pa_142 | Leerenritter | ultimate | +0,02 | +0,03 | -0,34 | +0,64 | +0,33 | +0,50 | rare / rare | ok |
| pa_143 | Astralross | ultimate | -0,16 | +0,03 | -0,09 | +0,59 | +0,02 | +0,53 | uncommon / rare | Fehlzuordnung |
| pa_144 | Kosmische Wassermelone | ultimate | +1,02 | +0,37 | -2,29 | -0,58 | +1,52 | -2,08 | epic / common | Messartefakt |
| pa_145 | Erdspalter | ultimate | +2,30 | +0,03 | -0,59 | -0,58 | +2,71 | +1,64 | legendary / epic | ok |
| pa_146 | Giftige Weltenflasche | ultimate | +0,67 | +0,03 | -0,34 | +1,22 | +1,57 | +2,24 | epic / legendary | Fehlzuordnung |
| pa_147 | Weltendrache | ultimate | +1,26 | +0,03 | -0,59 | +1,14 | +2,53 | +2,60 | legendary / legendary | ok |
| pa_148 | Himmelswächter | ultimate | +0,79 | +0,03 | -0,59 | -0,08 | +1,06 | +0,21 | epic / uncommon | Fehlzuordnung |
| pa_149 | Goldene Reliktkugel | ultimate | -0,02 | +0,03 | -0,34 | -0,08 | +0,10 | -0,59 | uncommon / common | ok |
| pa_150 | Kosmischer Kern | ultimate | +2,52 | +0,03 | -0,59 | -0,58 | +3,14 | +1,95 | legendary / legendary | ok |

Lesehilfe: z Scoring = z des `powerScore`; „Stufe ist / Soll“: tatsächliche `powerTier` gegen die Stufe, die das Komposit a–d bei gleichen Stufengrößen ergäbe (nur ein Gradmesser: in den Randkategorien liegen viele Waffen zwangsläufig daneben).

### Messwerte (4 Seeds)

| id | Waffe | Katalog-Schaden | Messung (Bestwert, 4 Seeds) | Verhältnis | Bemerkung |
|---|---|---|---|---|---|
| pa_022 | Plasmawerfer | 34 | 14,3 bis 15,2 | 0,42 bis 0,45 |  |
| pa_023 | Boxhandschuhe | 20 | 8,9 bis 9,8 | 0,45 bis 0,49 |  |
| pa_024 | Mittelfinger | 24 | 10,2 bis 11,3 | 0,42 bis 0,47 |  |
| pa_025 | Handtuch | 31 | 12,8 bis 14,3 | 0,41 bis 0,46 |  |
| pa_026 | Pressluftbohrer | 18 | 15,5 bis 16,8 | 0,86 bis 0,93 |  |
| pa_027 | Fackel | 23 | 10,1 bis 10,8 | 0,44 bis 0,47 |  |
| pa_028 | Kaktusbombe | 48 | 19,6 bis 21,3 | 0,41 bis 0,44 | Zünder: Messung unsicher |
| pa_029 | Pömpel | 32 | 11,1 bis 15,5 | 0,35 bis 0,48 | Zünder: Messung unsicher |
| pa_030 | Impulsbombe | 42 | 8,5 bis 11,7 | 0,20 bis 0,28 | Zünder: Messung unsicher |
| pa_031 | Kraftfaust | 48 | 22,4 bis 23,5 | 0,47 bis 0,49 |  |
| pa_032 | Raketenrucksack | 0 | - | - | Selbstwirkung: keine Messung |
| pa_033 | Zauberstab | 21 | 9,0 bis 9,6 | 0,43 bis 0,46 |  |
| pa_034 | Zauberbolzen | 28 | 12,6 bis 12,8 | 0,45 bis 0,46 |  |
| pa_035 | Energieball | 54 | 28,1 bis 28,7 | 0,52 bis 0,53 |  |
| pa_036 | Raketenhandschuh | 31 | 13,2 bis 14,9 | 0,43 bis 0,48 |  |
| pa_037 | Raketenwerfer | 62 | 34,8 bis 35,6 | 0,56 bis 0,57 |  |
| pa_038 | Rakete | 58 | 31,7 bis 32,2 | 0,55 bis 0,56 |  |
| pa_039 | Feldmörser | 48 | 71,0 bis 76,1 | 1,48 bis 1,59 |  |
| pa_040 | Maschinenpistole | 21 | 9,4 bis 9,7 | 0,45 bis 0,46 |  |
| pa_141 | Astralkrieger | 70 | - | - | Selbstwirkung: keine Messung |
| pa_142 | Leerenritter | 82 | 35,6 bis 39,1 | 0,43 bis 0,48 |  |
| pa_143 | Astralross | 65 | - | - | Selbstwirkung: keine Messung |
| pa_144 | Kosmische Wassermelone | 85 | 0,0 bis 14,9 | 0,00 bis 0,18 | Zünder: Messung unsicher |
| pa_145 | Erdspalter | 95 | 58,2 bis 59,5 | 0,61 bis 0,63 |  |
| pa_146 | Giftige Weltenflasche | 55 | 73,1 bis 73,7 | 1,33 bis 1,34 |  |
| pa_147 | Weltendrache | 100 | 99,6 bis 100,9 | 1,00 bis 1,01 |  |
| pa_148 | Himmelswächter | 70 | - | - | Selbstwirkung: keine Messung |
| pa_149 | Goldene Reliktkugel | 78 | - | - | Selbstwirkung: keine Messung |
| pa_150 | Kosmischer Kern | 110 | 69,6 bis 70,2 | 0,63 bis 0,64 |  |

Hinweise: Der Messwert liegt bei Direkttreffern bei rund 0,43 bis 0,47 des Katalogschadens, bei Flächenwaffen bei 0,5 bis 0,64. Projektile tragen laut `shooting.js` (Zeile 282) den Klassenfaktor des Schützen, Strahlwaffen nicht (der Audit fand beim Tesla-Turm den vollen Katalogwert); die Größe des Faktors und den Anteil der Entfernung zum Explosionsmittelpunkt habe ich nicht einzeln nachgelesen. Werte über 1 (Feldmörser, Giftige Weltenflasche, Weltendrache) enthalten Doppelschaden beziehungsweise den ersten Tick des Schadens über Zeit.

## 6 Einzelurteile (29 Waffen)

**pa_022 Plasmawerfer** (ranged; Stufe common, Wert 39,29; Schaden 34, Radius 0, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art energy, special `plasma_bolt`)
- Urteil: **ok**
- Begründung: Hoher Flug-z (Tempo 88, Reichweite 850, Sichtlinie) bei Schaden 34; Messung 14,3 bis 15,2 (0,42 bis 0,45 des Katalogwerts) wie die übrigen Direkttreffer.
- Vorschlag: keiner
- Risiko: -

**pa_023 Boxhandschuhe** (ranged; Stufe common, Wert 34,67; Schaden 20, Radius 0, Rückstoß 96, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art physical, special `mega_knockback`)
- Urteil: **Fehlzuordnung**
- Begründung: Alleinstellung ist der Rückstoß 96 (`mega_knockback`, ohne eigenen Motorcode), im Messlauf verschob er das Ziel nur um 2,9 px (Raketenwerfer mit Rückstoß 30: 4,2 px), die Beschreibung verspricht „gewaltigen Rückstoß“.
- Vorschlag: Katalogwerte unverändert; Entscheidung, ob der Rückstoß im Motor (Faktor 0,02 im Explosionszweig, `projectileSystem.js`) für Waffen ohne Radius verstärkt wird oder der Text zurückgenommen wird.
- Risiko: Motoränderung = Replay-Versionsmarke (§2); Text ändern ist risikolos.

**pa_024 Mittelfinger** (ranged; Stufe common, Wert 27,72; Schaden 24, Radius 0, Rückstoß 10, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art physical, special `direct_hit`)
- Urteil: **ok**
- Begründung: Reiner Direkttreffer 24, Messung 10,2 bis 11,3 (0,43 bis 0,47), Rückstoß 10; Stufe common passt.
- Vorschlag: keiner
- Risiko: -

**pa_025 Handtuch** (ranged; Stufe common, Wert 36,74; Schaden 31, Radius 0, Rückstoß 20, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art physical, special `direct_hit`)
- Urteil: **ok**
- Begründung: Kurze Reichweite (325, gemessen höchstens 150) gegen Schaden 31 über dem Direkttreffer-Schnitt der Kategorie: ein stimmiger Tausch.
- Vorschlag: keiner
- Risiko: -

**pa_026 Pressluftbohrer** (ranged; Stufe uncommon, Wert 76,56; Schaden 18, Radius 0, Rückstoß 30, Gelände 80, Munition 5, Abklingzeit 0, Zünder 0, Art physical, special `drill`)
- Urteil: **ok**
- Begründung: Schaden an Figuren 18 (Messung 15,5 bis 16,8); der Wert 76,6 besteht zu 69 % des Rohwerts aus terrainDamage 80 × 0,6, als Werkzeug stimmig, die Stufe uncommon beschreibt aber das Gelände, nicht den Kampf.
- Vorschlag: keiner (bleibt auch bei Gewicht 0,3 uncommon: 50,2)
- Risiko: -

**pa_027 Fackel** (ranged; Stufe common, Wert 30,45; Schaden 23, Radius 0, Rückstoß 14, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art fire, special `direct_hit`)
- Urteil: **ok**
- Begründung: Feuerart mit Malus Brand (`ART_REGEL.fire`, Fassung 2), Katalog-Elementarwert 0; die Messung (10,1 bis 10,8) läuft mit `schaden: 1` ohne Mali, z_sonder (-0,44) sieht den Art-Malus nicht.
- Vorschlag: keiner
- Risiko: -

**pa_028 Kaktusbombe** (ranged; Stufe rare, Wert 109,30; Schaden 48, Radius 48, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 2, Zünder 3, Art physical, special `spike_blast`)
- Urteil: **zu schwach**
- Begründung: Zünder 3 s, Schaden 48, Radius 48: Messung 19,6 bis 21,3 und im Volltreffer-Versuch 16,4 (0,34 bis 0,44 des Katalogwerts, Rakete im selben Versuch 0,51 bis 0,52); Gift 12 gibt zusätzlich 8 Schaden × 3 Runden.
- Vorschlag: damage 48 -> 55 (+15 %, nur testen): Wert 109,3 -> 116,4, Stufe bleibt rare.
- Risiko: Mittel: Messverfahren für Zünder unsicher; Replay-Fassung nötig (§2); Art physical -> poison separat (Audit E4-6).

**pa_029 Pömpel** (ranged; Stufe uncommon, Wert 72,37; Schaden 32, Radius 30, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 1, Zünder 2, Art physical, special `sticky`)
- Urteil: **zu schwach**
- Begründung: Zünder 2 s, Schaden 32, Radius 30: Messung 11,1 bis 15,5 (0,35 bis 0,48), Volltreffer-Versuch 5,6 bis 14,4; `sticky` hat keinen Motorcode.
- Vorschlag: damage 32 -> 37 (+15 %, nur testen): Wert 72,4 -> 77,1 (uncommon, 2,9 unter rare).
- Risiko: Mittel: wie Kaktusbombe.

**pa_030 Impulsbombe** (ranged; Stufe rare, Wert 100,78; Schaden 42, Radius 52, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 2, Zünder 3, Art electric, special `emp_blast`)
- Urteil: **zu schwach**
- Begründung: Zünder 3 s, Schaden 42, Radius 52: Messung 8,5 bis 11,7 (0,20 bis 0,28), Volltreffer-Versuch 7,3 bis 8,8, die schwächste der Gruppe; der Schock-Malus (Art electric) ist in der Messung nicht enthalten.
- Vorschlag: damage 42 -> 48 (+15 %, nur testen): Wert 100,8 -> 107,0, Stufe bleibt rare; schließt die gemessene Lücke (0,2 gegen 0,5) nicht.
- Risiko: Mittel: wie Kaktusbombe; +15 % reicht allein nicht.

**pa_031 Kraftfaust** (ranged; Stufe uncommon, Wert 54,65; Schaden 48, Radius 0, Rückstoß 60, Gelände 0, Munition 5, Abklingzeit 1, Zünder 0, Art energy, special `power_punch`)
- Urteil: **ok**
- Begründung: Energie (ein Schild fängt nur die Hälfte), Schaden 48 (Messung 22,4 bis 23,5), Rückstoß 60 ergab im Messlauf 3,2 px; Stufe uncommon plausibel.
- Vorschlag: keiner
- Risiko: -

**pa_032 Raketenrucksack** (ranged; Stufe common, Wert 4,14; Schaden 0, Radius 0, Rückstoß 30, Gelände 0, Munition 6, Abklingzeit 0, Zünder 0, Art utility, special `flight`)
- Urteil: **Fehlzuordnung**
- Begründung: Selbstwirkung (Sprung 60 px, `SPECIAL_DEFAULTS.moveDistance`) mit Schaden 0 ergibt Wert 4,1 (common) trotz 6 Ladungen ohne Abklingzeit, die größte negative Abweichung der Gruppe (-2,95); `effectMagnitude` 64 liest der Motor nirgends.
- Vorschlag: Nutzwert-Term im Leistungswert (Audit E4-3); `effectMagnitude` 64 streichen oder anbinden.
- Risiko: Beutegewichte ändern sich (Stufe), Versionsmarke (§2).

**pa_033 Zauberstab** (ranged; Stufe common, Wert 28,38; Schaden 21, Radius 0, Rückstoß 40, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art arcane, special `direct_hit`)
- Urteil: **ok**
- Begründung: Schaden 21, arkan (halbe Rüstung), Messung 9,0 bis 9,6 (0,43 bis 0,46), Rückstoß 40 gibt 1,8 px; common passt.
- Vorschlag: keiner
- Risiko: -

**pa_034 Zauberbolzen** (ranged; Stufe common, Wert 31,86; Schaden 28, Radius 0, Rückstoß 8, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art arcane, special `direct_hit`)
- Urteil: **ok**
- Begründung: Schaden 28, schnell (80), flach, Reichweite 781, Messung 12,6 bis 12,8; common passt.
- Vorschlag: keiner
- Risiko: -

**pa_035 Energieball** (ranged; Stufe rare, Wert 97,52; Schaden 54, Radius 34, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art energy, special `energy_explosion`)
- Urteil: **ok**
- Begründung: Schaden 54, Radius 34, Energie (Schildbrecher), Messung 28,1 bis 28,7 (0,52); Stufe rare entspricht dem Soll.
- Vorschlag: keiner
- Risiko: -

**pa_036 Raketenhandschuh** (ranged; Stufe common, Wert 40,04; Schaden 31, Radius 0, Rückstoß 45, Gelände 0, Munition 5, Abklingzeit 0, Zünder 0, Art explosive, special `direct_hit`)
- Urteil: **Fehlzuordnung**
- Begründung: Art `explosive` bei Radius 0 (reiner Direkttreffer, Messung 13,2 bis 14,9), in `ART_REGEL` und Familie gleich wie `physical`, nur Klang und Anzeige unterscheiden sich.
- Vorschlag: damageType explosive -> physical ODER blastRadius 0 -> etwa 20 (Entscheidung, wie Handgranate, Audit E4-7).
- Risiko: Art: Replay-Fassung `ARTEN_BIS_F4` (§2); Radius = Balanceänderung.

**pa_037 Raketenwerfer** (ranged; Stufe epic, Wert 134,73; Schaden 62, Radius 46, Rückstoß 30, Gelände 55, Munition 3, Abklingzeit 3, Zünder 0, Art explosive, special `direct_hit`)
- Urteil: **zu schwach**
- Begründung: Wert 134,7 liegt knapp über der Grenze epic (130) und besteht zu 33 Punkten aus terrainDamage 55; gemessen 34,8 bis 35,6, nur 1,1 × Rakete (rare) bei 3 statt 5 Ladungen; epic heißt Beutegewicht 6 und 2 Munition je Kiste.
- Vorschlag: Stufe statt Wert: terrainDamage-Gewicht im Leistungswert 0,6 -> 0,3 (134,7 -> 119,9, rare); alternativ damage 62 -> 75.
- Risiko: Gewicht ändert drei Waffen (Raketenwerfer, Meteorbrocken epic -> rare, Bohrkanone rare -> uncommon), Beute, Versionsmarke (§2).

**pa_038 Rakete** (ranged; Stufe rare, Wert 104,84; Schaden 58, Radius 38, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art explosive, special `rocket`)
- Urteil: **ok**
- Begründung: Bezugswaffe der Kategorie (58 / Radius 38 / Abklingzeit 2), Messung 31,7 bis 32,2 (0,55), Volltreffer-Versuch 29,8 bis 30,2; rare entspricht dem Soll.
- Vorschlag: keiner
- Risiko: -

**pa_039 Feldmörser** (ranged; Stufe rare, Wert 100,83; Schaden 48, Radius 45, Rückstoß 30, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art explosive, special `mortar`)
- Urteil: **zu stark**
- Begründung: Doppelschaden: Der Luftschlag ruft `resolveHitscan(..., null)` in `resolveStrike`, das den vollen Schaden (48, `attackerId` null) auf einen Gegner im Strahl anrichtet, und danach explodiert das Geschoss noch einmal (+21); Messung 71 bis 76 gegen 48 im Katalog.
- Vorschlag: Code, nicht Katalog: `resolveStrike` darf nur den Zielpunkt bestimmen, ohne Schaden und Wirkung (laut Code ebenso Meteorbrocken und Haubitze, ungemessen).
- Risiko: Ändert Aufzeichnungen von drei Waffen (Versionsmarke, §2); nicht Teil dieses Auftrags (kein Eingriff).

**pa_040 Maschinenpistole** (ranged; Stufe common, Wert 29,25; Schaden 21, Radius 0, Rückstoß 0, Gelände 4, Munition 8, Abklingzeit 0, Zünder 0, Art physical, special `direct_hit`)
- Urteil: **zu schwach**
- Begründung: Pro Zug nur ein Schuss (`hasFired`), der Vorteil 8 Ladungen wirkt nur als Vorrat; Schaden 21 (Messung 9,4 bis 9,7) wie der Zauberstab, Wert 29,3 (common), der Komposit-z (+0,99) liegt wegen Munition und Reichweite 879 deutlich höher.
- Vorschlag: damage 21 -> 24 (Mittelfinger-Niveau).
- Risiko: Gering; Replay-Fassung nötig (§2).

**pa_141 Astralkrieger** (ultimate; Stufe rare, Wert 127,46; Schaden 70, Radius 55, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 3, Zünder 0, Art astral, special `summon_warrior`)
- Urteil: **Fehlzuordnung**
- Begründung: Selbstwirkung `summon_warrior` stellt ein Geschütz auf (35 Schaden = 0,5 × 70, 3 Runden, Reichweite 424), das mit den Platzhalterwerten `TURRET_WEAPON` schießt (Radius 18, Art explosive); `blastRadius` 55 und `aoe` des Katalogs wirken nie, tragen aber 59 der 128,8 Rohpunkte des Werts 127,5 (rare).
- Vorschlag: Selbstwirkung-Regel im Leistungswert (siehe Himmelswächter): 127,5 -> 69,3 (uncommon), oder Radius 55 im Motor anbinden; Entscheidung. Messung entfällt (Selbstwirkung, 0 ist ein Messartefakt), Gesamtschaden bis 105 nur gerechnet.
- Risiko: Beute ändert sich, Versionsmarke (§2); Radius im Motor anbinden ist Balanceänderung.

**pa_142 Leerenritter** (ultimate; Stufe rare, Wert 90,09; Schaden 82, Radius 0, Rückstoß 75, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art void, special `void_knight`)
- Urteil: **ok**
- Begründung: Ziehen um 90 px (im Messlauf dx -90 bestätigt) plus Fluch (Art void), Direkttreffer 82 -> gemessen 35,6 bis 39,1; Wert 90,1 (rare) entspricht dem Soll.
- Vorschlag: keiner
- Risiko: -

**pa_143 Astralross** (ultimate; Stufe uncommon, Wert 72,67; Schaden 65, Radius 0, Rückstoß 70, Gelände 0, Munition 5, Abklingzeit 1, Zünder 0, Art astral, special `summon_mount`)
- Urteil: **Fehlzuordnung**
- Begründung: Reine Bewegung um 140 px (`mount`); `damage` 65 und Rückstoß 70 wirken nie, der Wert 72,7 (uncommon) stammt ausschließlich aus diesen Feldern.
- Vorschlag: Wert aus der Wirkung statt aus ungenutzten Feldern (Selbstwirkung-Regel, Audit E4-3); oder damage 65 -> 0 wie beim Raketenrucksack.
- Risiko: Beute (Stufe) ändert sich, Versionsmarke (§2).

**pa_144 Kosmische Wassermelone** (ultimate; Stufe epic, Wert 157,91; Schaden 85, Radius 70, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 3, Zünder 5, Art explosive, special `cosmic_banana`)
- Urteil: **Messartefakt**
- Begründung: Zünder 5 s (300 Ticks), Abprallen 1: Messung 14,9 / 0 / 0 / 0 über vier Seeds, auch der Volltreffer-Versuch (0 in 2 von 3 Seeds) taugt nicht, weil das Ziel die Bahn ändert; `cosmic_banana` wirkt nur als Nebenkrater im Gelände (`zerstoerung.js`).
- Vorschlag: keine Werteänderung; Messverfahren für Zünder klären (Audit E4-4). Die pauschale +15 % würde Schaden 85 -> 98 (Wert 157,9 -> 170,5, epic) geben, ist hier nicht begründet.
- Risiko: Ohne belastbare Messung kein Eingriff.

**pa_145 Erdspalter** (ultimate; Stufe legendary, Wert 225,47; Schaden 95, Radius 75, Rückstoß 0, Gelände 95, Munition 5, Abklingzeit 3, Zünder 0, Art impact, special `earth_splitter`)
- Urteil: **ok**
- Begründung: Direkttreffer 95 / Radius 75 / Krater 95 mit Beben, Messung 58,2 bis 59,5; der Wert 225,5 (legendary) kommt zu 25 % aus terrainDamage, bleibt aber auch bei Gewicht 0,3 legendary.
- Vorschlag: keiner
- Risiko: -

**pa_146 Giftige Weltenflasche** (ultimate; Stufe epic, Wert 160,63; Schaden 55, Radius 65, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art poison, special `world_poison`)
- Urteil: **Fehlzuordnung**
- Begründung: Gift 80 wirkt als Schaden über Zeit 40 × 3 Runden (`elementalSum / 2`, `dotTurns` 3; Tick 1 gemessen, 2 und 3 gerechnet), also 120 gegen 33 Direktschaden; der Wert zählt Elementarwerte nur mit 0,5 je Punkt (40 von 160,6) und stuft die Waffe als epic ein.
- Vorschlag: Leistungswert: Feuer/Gift-Gewicht 0,5 -> 1,5 (Flasche 160,6 -> 239,8, legendary), Entscheidung; Katalog unverändert.
- Risiko: Ändert 13 Waffen die Stufe (Feuerdämon, Giftwolke, Höllenkanone u. a.), Beute, Versionsmarke (§2).

**pa_147 Weltendrache** (ultimate; Stufe legendary, Wert 215,33; Schaden 100, Radius 80, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 3, Zünder 0, Art dragon, special `dragon_ultimate`)
- Urteil: **ok**
- Begründung: Direktschaden gemessen 61,7 plus Brand 38 × 3 Runden (Tick 1 gemessen), Wert 215,3 (legendary) entspricht dem Soll.
- Vorschlag: keiner
- Risiko: -

**pa_148 Himmelswächter** (ultimate; Stufe epic, Wert 131,67; Schaden 70, Radius 60, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 3, Zünder 0, Art holy, special `guardian_ultimate`)
- Urteil: **Fehlzuordnung**
- Begründung: Reiner Schild 77 (`max(40, 1,1 × damage)`); `blastRadius` 60 und `aoe` wirken nie, weil Selbstwirkungen vor dem Geschoss enden (`shooting.js`), der Wert 131,7 (epic, Beutegewicht 6, 2 Munition) stammt daraus.
- Vorschlag: Leistungswert ohne Radius, aoe, Rückstoß und Gelände für Selbstwirkungen (ohne Geschütz): 131,7 -> 69,3 (uncommon); betrifft auch Chaosmagier (rare -> common) und Blutritual (rare -> uncommon).
- Risiko: Beute ändert sich bei drei Waffen, Versionsmarke (§2).

**pa_149 Goldene Reliktkugel** (ultimate; Stufe uncommon, Wert 77,22; Schaden 78, Radius 0, Rückstoß 0, Gelände 0, Munition 5, Abklingzeit 2, Zünder 0, Art arcane, special `relic_buff`)
- Urteil: **ok**
- Begründung: Verstärkung fest ×1,5 (nicht aus damage 78 abgeleitet), `addBoost` Vorgabe 2 Züge; Wert 77,2 (uncommon) hat keinen Radius-Anteil; die Wirkung selbst wurde nicht gemessen, daher keine Aussage zu stärker/schwächer.
- Vorschlag: keiner (Wirkung messen: ×1,5 auf die Folgewaffe)
- Risiko: -

**pa_150 Kosmischer Kern** (ultimate; Stufe legendary, Wert 249,97; Schaden 110, Radius 90, Rückstoß 0, Gelände 90, Munition 5, Abklingzeit 3, Zünder 0, Art void, special `cosmic_ultimate`)
- Urteil: **ok**
- Begründung: Stärkster Treffer (110 / Radius 90 / Krater 90, Beben), Bestwert 69,6 bis 70,2 plus Selbstschaden 19,3 bei 90 px Abstand; legendary entspricht dem Soll.
- Vorschlag: keiner
- Risiko: -

## 7 Güte des Scorings

**Spearman-Rangkorrelation** `powerScore` gegen den Mittelwert der Themenfeld-z a–d:

| Menge | mit rarity in (c) | ohne rarity in (c) |
|---|---|---|
| Gesamtkatalog | 0,49 (n=150) | 0,39 (n=150) |
| ranged | -0,05 (n=19) | -0,30 (n=19) |
| ultimate | 0,56 (n=10) | 0,56 (n=10) |
| ranged + ultimate | 0,23 (n=29) | 0,21 (n=29) |

Gegen das Themenfeld (a) allein: 0,91 (n=150). Das ist erwartbar, denn `computePowerScore` besteht aus damage, blastRadius, terrainDamage, knockback, aoe, piercing, homing, bounces und Elementarwerten, dazu ein Munitionsfaktor (höchstens +25 %), 0,9 bei Abklingzeit, 0,95 bei Sichtlinie. Flug, Zünder, Reichweite, Status und Selbstwirkungen gehen nicht ein.

**Größte Abweichungen** (z Scoring gegen z Komposit, innerhalb der Gruppe, nach Betrag):

- Kosmische Wassermelone (Ist epic, Soll common): z Scoring +1,52, z Komposit -2,08, Abweichung +3,60
- Raketenrucksack (Ist common, Soll epic): z Scoring -1,19, z Komposit +1,77, Abweichung -2,95
- Maschinenpistole (Ist common, Soll rare): z Scoring -0,74, z Komposit +0,99, Abweichung -1,73
- Boxhandschuhe (Ist common, Soll rare): z Scoring -0,65, z Komposit +0,77, Abweichung -1,42
- Impulsbombe (Ist rare, Soll common): z Scoring +0,52, z Komposit -0,78, Abweichung +1,30
- Kosmischer Kern (Ist legendary, Soll legendary): z Scoring +3,14, z Komposit +1,95, Abweichung +1,19
- Pressluftbohrer (Ist uncommon, Soll rare): z Scoring +0,09, z Komposit +1,19, Abweichung -1,10
- Erdspalter (Ist legendary, Soll epic): z Scoring +2,71, z Komposit +1,64, Abweichung +1,07
- Plasmawerfer (Ist common, Soll rare): z Scoring -0,57, z Komposit +0,49, Abweichung -1,06
- Zauberbolzen (Ist common, Soll uncommon): z Scoring -0,70, z Komposit +0,28, Abweichung -0,98

Über den Gesamtkatalog (zur Einordnung):

- Fliegendes Superschaf (tech, legendary): z Scoring +6,91, z Komposit +2,80, Abweichung +4,11
- Kosmische Wassermelone (ultimate, epic): z Scoring +1,52, z Komposit -2,08, Abweichung +3,60
- Raketenrucksack (ranged, common): z Scoring -1,19, z Komposit +1,77, Abweichung -2,95
- Meteorbrocken (elemental, epic): z Scoring +1,25, z Komposit -0,87, Abweichung +2,12
- Haubitze (elemental, rare): z Scoring +0,47, z Komposit -1,49, Abweichung +1,96
- Katapult (elemental, rare): z Scoring +0,66, z Komposit -1,21, Abweichung +1,87
- Roboterbombe (heavy_ranged, rare): z Scoring +0,42, z Komposit -1,37, Abweichung +1,79
- Splittergranate (heavy_ranged, rare): z Scoring +0,22, z Komposit -1,55, Abweichung +1,77
- Dimensionssprung (magic, common): z Scoring -1,26, z Komposit +0,48, Abweichung -1,73
- Maschinenpistole (ranged, common): z Scoring -0,74, z Komposit +0,99, Abweichung -1,73
- Dimensionsriss (magic, common): z Scoring -1,26, z Komposit +0,47, Abweichung -1,73
- Handgranate (heavy_ranged, uncommon): z Scoring -0,14, z Komposit -1,87, Abweichung +1,72

**Passen `powerTier` und `rarity`?**

- `rarity` folgt der Waffennummer (Audit E4-2): ranged ist ganz `common`, ultimate ganz `rare`. Tatsächliche Stufe gegen Seltenheit in der Gruppe: common -> common: 10; common -> epic: 1; common -> rare: 5; common -> uncommon: 3; rare -> epic: 3; rare -> legendary: 3; rare -> rare: 2; rare -> uncommon: 2. Gesamtkatalog (Seltenheit -> Stufe): common/common: 31; common/epic: 3; common/legendary: 1; common/rare: 21; common/uncommon: 24; rare/common: 8; rare/epic: 5; rare/legendary: 4; rare/rare: 9; rare/uncommon: 4; uncommon/common: 24; uncommon/rare: 12; uncommon/uncommon: 4. Gleich sind in der Gruppe 12 von 29, im Katalog 44 von 150.
- `powerTier` gegen die Soll-Stufe aus dem Komposit: Treffer in der Gruppe 6 von 29, im Katalog 79 von 150. Der Wert ist als Gradmesser zu lesen (siehe oben), aber die Richtung ist eindeutig: Stufen folgen dem Schaden, nicht der Gesamtwirkung.
- Folgen: Die Beute zieht nach `powerTier` (Gewichte 49 / 25 / 18 / 6 / 2) und die Munition je Kiste nach Stufe (rare 3, epic 2, legendary 1; `kisten.js`). Eine falsche Stufe verändert also Fundhäufigkeit und Ladungen.

**Szenarien** (nur gerechnet, nicht umgesetzt; Formel nachgebildet, 0 Abweichung zum Katalog):

- `homing` 5 -> 0,5 (Auftraggeber abgesegnet): Betroffen sind genau zwei Waffen im Katalog, beide außerhalb dieser Gruppe: Phönixschlag: 287,9 (legendary) -> 146,1 (epic); Fliegendes Superschaf: 463,8 (legendary) -> 152,0 (epic). In `ranged` und `ultimate` ist homing überall 0; kein Effekt auf diese Gruppe. Die Zahlen decken sich mit dem Audit (152,0 und 146,1).
- Zünderwaffen +15 % Schaden (Auftraggeber: nur testen). Alle 11 Zünderwaffen im Katalog, Wert und Stufe:

| Waffe | Kat. | Schaden alt -> neu | Wert alt -> neu | Stufe |
|---|---|---|---|---|
| Kaktusbombe | ranged | 48 -> 55,2 | 109,30 -> 116,42 | rare -> rare |
| Pömpel | ranged | 32 -> 36,8 | 72,37 -> 77,12 | uncommon -> uncommon |
| Impulsbombe | ranged | 42 -> 48,3 | 100,78 -> 107,02 | rare -> rare |
| Splittergranate | heavy_ranged | 42 -> 48,3 | 83,97 -> 89,64 | rare -> rare |
| Handgranate | heavy_ranged | 61 -> 70,1 | 63,32 -> 71,56 | uncommon -> uncommon |
| Bananengranate | heavy_ranged | 46 -> 52,9 | 91,44 -> 97,65 | rare -> rare |
| Molotowcocktail | heavy_ranged | 36 -> 41,4 | 92,97 -> 97,83 | rare -> rare |
| Roboterbombe | heavy_ranged | 52 -> 59,8 | 95,27 -> 102,28 | rare -> rare |
| Giftwolke | elemental | 18 -> 20,7 | 91,62 -> 94,05 | rare -> rare |
| Tentakelgift | elemental | 32 -> 36,8 | 98,01 -> 102,33 | rare -> rare |
| Kosmische Wassermelone | ultimate | 85 -> 97,7 | 157,91 -> 170,53 | epic -> epic |

  Keine Waffe wechselt die Stufe; der Schaden wirkt laut Code linear (`weapon.damage * Klassenfaktor`). Belegte Lage in dieser Gruppe: Messung 0,20 bis 0,48 des Katalogschadens (Zünder) gegen 0,43 bis 0,47 (Direkttreffer) und 0,55 (Rakete); im Volltreffer-Versuch (Ziel an den Explosionsort gesetzt) Kaktusbombe 16,4, Pömpel 5,6 bis 14,4, Impulsbombe 7,3 bis 8,8, Wassermelone 0 bis 14,9, Rakete 29,8 bis 30,2. Dieser Versuch ist **nicht belastbar**, weil das umgesetzte Ziel die Bahn des Zünders ändern kann; er stützt „Zünder liefern im Messaufbau weniger“, aber nicht die Höhe von +15 %. Für die Impulsbombe reichen +15 % rechnerisch nicht (0,2 gegen 0,5), für die Kosmische Wassermelone fehlt jede belastbare Messung.
- terrainDamage-Gewicht 0,6 -> 0,3: drei Stufenwechsel im ganzen Katalog (Raketenwerfer epic -> rare, Meteorbrocken epic -> rare, Bohrkanone rare -> uncommon); Erdspalter und Pressluftbohrer bleiben.
- Elementarwert (Feuer, Gift) 0,5 -> 1,5 (= `damagePerTurn` Summe/2 über 3 Runden): 13 Stufenwechsel im Katalog; in der Gruppe nur die Giftige Weltenflasche (epic -> legendary). Die Rechnung gewichtet auch Eis mit 1,5, obwohl Eis als Einfrieren wirkt (Eisschlag und Eispickel zählen mit), der Vorschlag müsste also auf Feuer und Gift beschränkt werden.
- Selbstwirkung ohne Radius, aoe, Rückstoß, Gelände im Wert: Himmelswächter epic -> uncommon (131,7 -> 69,3), Chaosmagier rare -> common, Blutritual rare -> uncommon; Astralkrieger (Geschütz) wäre mit der Regel ebenfalls 69,3, die Regel wurde dort wegen des Geschützes im Skript ausgenommen.

## 8 Weitere Befunde mit Beleg

- **Doppelschaden Luftschlag** (`src/engine/shooting.js`, `resolveStrike`): `quelle.resolveHitscan(x, y, angle, power, weapon, null)` bestimmt den Zielpunkt, aber `#resolveHitscan` (`match.js`) wendet bei einem Gegner im Strahl vollen Schaden und die Zielwirkung an. Ereignisprotokoll Feldmörser: Schaden 48 (`attackerId` null), danach Explosion mit 20,8 gegen dasselbe Ziel. Projektil-Strike-Waffen laut Katalog: Feldmörser (ranged), Meteorbrocken, Haubitze (elemental); die vier übrigen Strike-Waffen sind Strahlwaffen und gehen den anderen Weg.
- **Rückstoß** wird nur im Explosionszweig (`projectileSystem.js`) mit Faktor 0,02 angewandt; gemessen: Boxhandschuhe (96) 2,9 px, Kraftfaust (60) 3,2 px, Zauberstab (40) 1,8 px, Raketenwerfer (30) 4,2 px, Rakete (30) 1,2 px, Mittelfinger (10) 0. Der Katalogwert unterscheidet die Waffen nicht in der Wirkung, die er verspricht (ein Messlauf je Waffe).
- **`effectMagnitude`** (in dieser Gruppe nur der Raketenrucksack, Wert 64) wird außerhalb des Katalogs von keinem Code gelesen (Suche in `src/`).
- **Schaden über Zeit** wird vom Klassenfaktor nicht skaliert (Tick 38 und 40 gemessen, Direktschaden 61,7 und 33,1). Bei Weltendrache und Giftiger Weltenflasche besteht die Wirkung damit überwiegend aus dem Tick; im Standard (Fassung 2) kommt zusätzlich der Art-Malus Brand beziehungsweise Gift hinzu (nicht gemessen, das Skript misst mit `schaden: 1`).
- **Kosmische Wassermelone**: `cosmic_banana` taucht nur in `zerstoerung.js` auf (Nebenkrater); die Beschreibung „zerspringt in Stücke“ trifft das Gelände, keinen Zusatzschaden.
- **Selbstschaden**: Kosmischer Kern trifft den Schützen bei 90 px Abstand mit 19,3 (gemessen).

## 9 Empfehlungen

### Sofort umsetzbar (eindeutig)

1. Das Messskript bei Messwert 0 mit weiteren Seeds wiederholen lassen (Audit E2); die Vier-Seed-Messung dieser Datei zeigt, dass die Bestwerte je Waffe über Seeds stabil sind (außer bei Zündern und Sichtlinienwaffen).
2. Den Fehler im Luftschlag (`resolveStrike`) beheben: nur Zielpunkt bestimmen, keinen Schaden und keine Wirkung auslösen. Eindeutig als Fehler belegt (Ereignisprotokoll), aber eine Motoränderung mit Versionsmarke (§2); Umsetzung ist Sache des Auftraggebers.
3. `homing`-Gewicht 5 -> 0,5 (bereits abgesegnet): wirkt auf Fliegendes Superschaf und Phönixschlag, nicht auf diese Gruppe; Versionsmarke für die Beute nötig (§2).

### Braucht Entscheidung

1. Selbstwirkungen im Leistungswert (Himmelswächter epic -> uncommon, Astralkrieger rare -> uncommon, Astralross; dazu Raketenrucksack mit Nutzwert statt 4,1).
2. terrainDamage-Gewicht 0,6 -> 0,3 (Raketenwerfer, Meteorbrocken, Bohrkanone) oder Schaden des Raketenwerfers 62 -> 75.
3. Elementar-Gewicht für Feuer und Gift 0,5 -> 1,5 (13 Waffen ändern die Stufe, darunter die Giftige Weltenflasche).
4. Zünderwaffen +15 % (Kaktusbombe 48 -> 55, Pömpel 32 -> 37, Impulsbombe 42 -> 48): erst ein belastbares Messverfahren für Zünder; bei der Impulsbombe reichen +15 % nicht, bei der Kosmischen Wassermelone ist keine Änderung begründet.
5. Rückstoß: Boxhandschuhe und Zauberstab versprechen Rückstoß, der Motor liefert wenige Pixel (Motor stärken oder Text zurücknehmen).
6. Raketenhandschuh: Art `explosive` mit Radius 0 (analog Handgranate): Art oder Radius.
7. Maschinenpistole 21 -> 24 (ein Schuss pro Zug, Vorteil nur als Vorrat).
8. `effectMagnitude` streichen oder anbinden.

Alle Vorschläge, die Katalog, Leistungswert oder Motor betreffen, ändern Beute oder Aufzeichnungen und brauchen nach AGENTS.md §2 eine Versionsmarke im Replay-Kopf.
