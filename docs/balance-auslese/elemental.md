# Balance-Auslese: elemental (2026-10-28)

Stand: Katalog `src/shared/config/weapons.js` (150 Waffen, Katalog = Fassung 4, Standard im Motor = Fassung 5), Auswertung am Arbeitsstand von `main` (Commit 4dd6167). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Rechenskripte lagen im Scratchpad; alle Zahlen sind daraus abgeleitet. Methode und z-Festlegungen sind die der Auslese `melee-utility.md` (Abschnitt 2 dort); die Nachrechnung hat deren Zahlen für Baseballschläger bis auf die zweite Stelle reproduziert (z-Werte der Felder a bis d und z_scoring, Spearman 0,35 im Gesamtkatalog).

Gruppe: Kategorie `elemental` (20 Waffen, pa_061 bis pa_080). **Alle 20 wurden einzeln beurteilt** (Abschnitt 5).

## 0. Kurzbefund

- **20 von 20 Waffen einzeln beurteilt.** Urteile nach dem ersten Wort der Urteilsspalte: ok 9, zu stark 4, Fehlzuordnung 5, zu schwach 2.
- **Rangkorrelation Spearman powerScore gegen Mittel der Felder a bis d: 0,35 im Gesamtkatalog, 0,12 in dieser Gruppe** (0,28 mit dem Fassung-5-Schaden, 0,16 mit der Motor-Gegenrechnung); gegen Feld a allein 0,81, gegen Feld c (Abklingzeit) −0,85. Gegen den im Mali-Lauf gerechneten Gesamtschaden (Direktschaden + Brand/Gift/Fluch, 18 Waffen) steht ρ bei 0,46.
- **Elementarpunkte sind falsch bepreist.** Der Leistungswert zählt jeden Punkt `elemental` mit 0,5. Der Motor (Fassung 2 der Schadensarten) liefert: Feuer 1,2 Schaden je Punkt (Brand 0,8 × Summe/2 × 3 Züge), Gift bis zu 1,5, Fluch 0,7, Eis 0 (Frost nimmt nur Tempo). Brand ist bei 16 je Zug gedeckelt (Feuer ab 39), Gift bei 18 je Zug (ab 35): Flammenwerfer 45, Giftwolke 45 und Tentakelgift 55 liegen darüber.
- **Drei Katalog-Leistungswerte sind veraltet:** Fassung 5 liest für Wasserwerfer 32 (Katalog 18), Eisschlag 55 (42) und Tornado 45 (18) (`WAFFEN_F5_WERTE`); der Katalog-`powerScore` rechnet mit den alten Werten (43,2 / 97,88 / 82,4 statt 57,2 / 109,58 / 106,7). Das betrifft im Gesamtkatalog zehn Waffen (Abschnitt 7).
- **Strike-Waffen treffen doppelt (Verdacht, Ereignisfolge gemessen):** Meteorbrocken und Haubitze (Anflugart `sky`) lassen den Zielstrahl `resolveHitscan` mit vollem Katalogschaden (`attackerId` null) auf eine Figur im Strahl wirken, danach schlägt der Himmelsschlag ein: Messung 111,4 und 87,8 (1,63 und 1,89 × Stufenmedian).
- **Eisschlag friert nicht ein:** In Fassung 2 macht Art `ice` Frost (Tempo 70 %, 2 Züge, kein Aussetzen); Einfrieren gibt es erst beim zweiten Treffer oder bei nassem Ziel. Beschreibung und Elementarwert 50 (22,5 Leistungspunkte) versprechen mehr.
- **Rückstoß unter Zug ist wirkungslos:** Tornado (88), Schwarzes Loch (80) und Psionischer Tentakel (60) ziehen das Ziel; `shiftToward` setzt die Geschwindigkeit danach auf 0 und löscht den Rückstoß. `aoe` (12 Punkte in 14 Waffen) liest der Motor nirgends.
- **Gelände:** 9 von 18 Waffen mit Einschlag wirken als Wucht (kein Entzünden, kein Löschen); der Wasserwerfer gräbt mit `terrainDamage` 42 einen Krater von 42 px bei Abklingzeit 0; das Entzünden folgt dem Kraterradius (nicht dem Katalogradius): Flammenwerfer und Plasmagewehr (Radius 0) zünden mit 14 px Krater nur im Umkreis von rund 26 px.
- **Portale sind Selbstwirkungen mit Schaden im Katalog:** Portalring (31,5) und Kosmisches Portal (18) zählen Schaden, der nie entsteht; beide sind bis auf diesen Schaden gleich.

## 1. Mittelwert und Standardabweichung je Merkmal

Population: Grundgesamtheit (Teilen durch n). Alle Zahlen aus dem Katalog (`weapons.js`); Kategoriespalte elemental n=20, gesamt n=150.

| Merkmal | elemental Mittel | elemental SD | gesamt Mittel | gesamt SD |
|---|---:|---:|---:|---:|
| damage | 43.60 | 17.64 | 41.75 | 19.28 |
| blastRadius | 33.45 | 23.45 | 18.28 | 24.94 |
| knockback | 11.40 | 27.52 | 19.94 | 25.95 |
| terrainDamage | 4.60 | 13.86 | 4.87 | 16.77 |
| homing | 0.00 | 0.00 | 0.70 | 6.35 |
| piercing | 0.05 | 0.22 | 0.04 | 0.20 |
| maxAmmo | 3.00 | 0.00 | 4.09 | 1.08 |
| cooldown | 1.75 | 0.89 | 1.23 | 1.00 |
| fuseTime | 0.15 | 0.48 | 0.19 | 0.74 |
| maxRange | 567.65 | 98.86 | 500.54 | 227.07 |
| projectileSpeed (alle, Strahl = 0) | 71.20 | 5.23 | 42.04 | 34.58 |
| gravityScale (alle) | 1.05 | 0.11 | 1.03 | 0.08 |
| bounces (alle) | 0.00 | 0.00 | 0.19 | 0.49 |
| powerScore | 83.45 | 32.73 | 71.48 | 56.80 |
| elemental (Summe Feuer+Eis+Gift) | 15.55 | 20.33 | 6.11 | 15.40 |
| Anteil mit Motorwirkung (`special` in SPECIAL_EFFECTS) | 0.55 | 0.50 | 0.43 | 0.50 |
| Anteil aoe | 0.70 | 0.46 | 0.37 | 0.48 |
| Anteil Strahlwaffen (delivery hitscan) | 0.00 | 0.00 | 0.36 | 0.48 |

Nur Projektilwaffen (Strahlwaffen haben `projectileSpeed` 0 und `gravityScale` 1 als Platzhalter): elemental n=20 (alle 20 sind Projektilwaffen): Tempo 71.20 (SD 5.23), gravityScale 1.05, bounces 0.00; gesamt n=96: Tempo 65.68 (SD 17.74), gravityScale 1.04, bounces 0.30.

Lesehinweise (aus der Tabelle belegt):

- In elemental ist `maxAmmo` bei allen 20 Waffen 3 (SD 0; Katalog 4.09), `bounces`, `homing` und Strahl überall 0. Die Streuung liegt in Schaden (SD 17.64), Radius (SD 23.45), Abklingzeit (Mittel 1.75 gegen 1.23), Elementarwert und Rückstoß.
- Die Gruppe hat nach tech (98.1) und ultimate (150.8) das dritthöchste Kategoriemittel im `powerScore` (83.45; melee 48.6, ranged 60.7, heavy_ranged 70.9, magic 49.4, utility 50.9) bei der kleinsten SD der drei (32.73 gegen 56.80 gesamt). Stufen der 20: 4 × common, 2 × uncommon, 12 × rare, 2 × epic.
- 14 von 20 Waffen tragen `aoe` (0.70) gegen 0.37 im Katalog; der Motor liest `aoe` nirgends (Suche in `src/` außer `weapons.js`: keine Treffer), die 12 Punkte je Waffe sind inert.
- `special` hat bei 11 von 20 Waffen eine Motorwirkung (0.55); bei Feuerdämon, Flammenwerfer, Feuerball (Feuer) leitet `elementalEffectFor` den Brand aus dem Elementarwert ab, bei Katapult, Meteorbrocken, Haubitze, Plasmagewehr, Raketenkanone, Voodoopuppe gibt es keine Wirkung außer dem Schaden und (Voodoopuppe) dem Fluch aus der Art.
- Alle 20 Waffen haben als Quell-Seltenheit `common` (Block pa_001 bis 080, siehe Audit A6); die Seltenheit bringt in Feld c also keine Streuung, nur den gleichen z-Wert −0,85 für alle 20 (Katalogmittel 0,67, SD 0,79).

## 2. Methode

**Referenz der z-Werte: Gesamtkatalog (150 Waffen), Festlegungen wie in `melee-utility.md`.** Je Merkmal z = (Wert − Mittel) / SD. Ein Themenfeld-z ist der ungewichtete Mittelwert der z-Werte seiner Merkmale. Die Rangfolge innerhalb der Kategorie hängt nicht von der Referenz ab (nur die Skala).

| Feld | Merkmale (Richtung: höher = stärker) | Festlegungen |
|---|---|---|
| a Schaden | damage, blastRadius, terrainDamage, aoe (0/1), piercing | keine |
| b Flug | projectileSpeed, gravityScale (negiert), bounces (nur Projektilwaffen, n=96), maxRange, homing, delivery (Strahl = 1) | Richtung von gravityScale und delivery ist Annahme der Vorlage (flach = leichter zu zielen). |
| c Munition | maxAmmo, cooldown (negiert), fuseTime > 0 (negiert), rarity (common 0, uncommon 1, rare 2) | Quell-Seltenheit (`sourceRarity`), kein Merkmal der Waffenstärke. |
| d Sonderwirkung | special (1, wenn `effectFor(special)` eine Wirkung liefert), effectMagnitude (null = 0), elemental (Summe), knockback | `effectMagnitude` ist in elemental überall null. |
| e Scoring | z(powerScore) − z(Mittel der Felder a bis d) | Positiv: Leistungswert höher als die Merkmale ergeben. |

**Zusätze dieser Auslese (jeweils belegt am Quelltext oder im Lauf):**

1. **Zwei Fassungen.** Die z-Werte und der Katalog-`powerScore` rechnen auf dem Katalog (Fassung 4). Der Motor liest Fassung 5 (`getWaffe` in `waffen-fassung.js`): für Wasserwerfer, Eisschlag und Tornado ist der Schaden dort höher. Die Spalte "ps (F5)" rechnet den Leistungswert mit der Formel `computePowerScore` (nachgebaut, 150 von 150 Katalogwerten reproduziert) neu.
2. **Messung** wie in `melee-utility.md`: `messeWaffe` aus `scripts/waffen-balance.mjs` (Ziel steht still, Entfernungen 40/90/150/300/500/800/1200/1700 px, Karte `hills`, Skript rechnet mit Schadensfassung 1), **drei Karten-Seeds** (Seed = 4242 + (Index + Versatz) × 977, Versatz 0/1000/2000). `Bestwert` = größter Schaden je Schuss. Zwei Messartefakte sind belegt: (a) Das Skript setzt `schaden: 1` (Fassung 1), bei der ein Treffer mit Brand/Gift sofort einen ersten Tick nach sich zieht (Beispiel Flammenwerfer: Explosion 21,6 + Tick 23 = 44,6); der Standard ist Fassung 2. (b) Bei Anflugart `sky` zählt der Zielstrahl mit (Abschnitt 5, Meteorbrocken).
3. **Mali-Lauf (Fassung 2, Standard).** Für jede Waffe wurde `buildEffect(w) ?? elementalEffectFor(w)` und `match.mali.treffer(...)` auf einen Gegner angewendet und danach sieben Zugwechsel gefahren; Zahlen sind die dabei gemessenen `dot_tick`-Werte (Abschnitt 4). Der Schütze der Messung ist ein Scout (Klassenfaktor 0,7 auf Projektilschaden, aus `classes.js`; erklärt auch den Faktor 0,7 der Nahkämpfer in `melee-utility.md`). Brand, Gift und Fluch laufen nicht über den Klassenfaktor.
4. **Gesamtschaden (Richtwert)** = 0,7 × Fassung-5-Schaden (Kernmitte, Scout) + Summe der Ticks aus dem Mali-Lauf. Ohne Vorstrahl, Durchschlag und ohne Heilung des Ziels.
5. **Flache Wurfweite**: Karte `open`, Schütze auf 200 px, volle Kraft, Winkel 0,1 bis 0,785 rad, größte erreichte Flugweite (`scripts/check-range.mjs`-Verfahren).
6. **Gegenrechnung ps\*** ("Leistungswert nur aus Motorfeldern"): `aoe` → 0 (nirgends gelesen), `knockback` → 0 bei den drei Zug-Waffen, bei Radius 0 der Radius 24 (gemessener Explosionsradius des Trefferfensters), Portale 0. Rechnung zur Einordnung, kein Formelvorschlag.

## 3. Beste und Ausreißer je Themenfeld

"Beste" = höchste z-Werte, "Ausreißer" = größte |z|; jeweils bis zu 15 der 20 Waffen. Die Zahl hinter dem Namen ist der z-Wert (Referenz Gesamtkatalog). Gleichstand entscheidet die Katalogreihenfolge. In Feld b (15 Waffen mit −0.07) und c (Abklingzeiten) sind die Listen wenig aussagekräftig.

**a Schaden und Zerstörung**

- Beste (15): Meteorbrocken 1.35; Schwarzes Loch 0.94; Plasmagewehr 0.75; Katapult 0.67; Haubitze 0.55; Feuerdämon 0.54; Raketenkanone 0.48; Psionischer Tentakel 0.45; Feuerball 0.35; Eisschlag 0.30; Tentakelgift 0.27; Tornado 0.25; Säurekanone 0.25; Verderbnissiegel 0.24; Giftwolke 0.23
- Ausreißer (15): Meteorbrocken 1.35; Schwarzes Loch 0.94; Plasmagewehr 0.75; Katapult 0.67; Kosmisches Portal -0.63; Haubitze 0.55; Feuerdämon 0.54; Raketenkanone 0.48; Portalring -0.47; Psionischer Tentakel 0.45; Voodoopuppe -0.37; Feuerball 0.35; Flammenwerfer -0.33; Eisschlag 0.30; Tentakelgift 0.27

**b Flug, Reichweite, Zielen**

- Beste (15): Plasmagewehr 0.45; Feuerdämon -0.07; Flammenwerfer -0.07; Wasserwerfer -0.07; Säurekanone -0.07; Raketenkanone -0.07; Giftwolke -0.07; Eisschlag -0.07; Feuerball -0.07; Tentakelgift -0.07; Verderbnissiegel -0.07; Tornado -0.07; Portalring -0.07; Schwarzes Loch -0.07; Voodoopuppe -0.07
- Ausreißer (15): Meteorbrocken -0.91; Haubitze -0.60; Katapult -0.54; Plasmagewehr 0.45; Feuerdämon -0.07; Flammenwerfer -0.07; Wasserwerfer -0.07; Säurekanone -0.07; Raketenkanone -0.07; Giftwolke -0.07; Eisschlag -0.07; Feuerball -0.07; Tentakelgift -0.07; Verderbnissiegel -0.07; Tornado -0.07

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (15): Wasserwerfer -0.09; Flammenwerfer -0.34; Plasmagewehr -0.34; Verderbnissiegel -0.34; Tornado -0.34; Portalring -0.34; Voodoopuppe -0.34; Kosmisches Portal -0.34; Säurekanone -0.58; Raketenkanone -0.58; Eisschlag -0.58; Feuerball -0.58; Psionischer Tentakel -0.58; Feuerdämon -0.83; Katapult -0.83
- Ausreißer (15): Tentakelgift -1.54; Giftwolke -1.29; Feuerdämon -0.83; Katapult -0.83; Meteorbrocken -0.83; Haubitze -0.83; Schwarzes Loch -0.83; Säurekanone -0.58; Raketenkanone -0.58; Eisschlag -0.58; Feuerball -0.58; Psionischer Tentakel -0.58; Flammenwerfer -0.34; Plasmagewehr -0.34; Verderbnissiegel -0.34

**d Sonderwirkung und Status**

- Beste (15): Tentakelgift 0.85; Tornado 0.80; Eisschlag 0.77; Schwarzes Loch 0.73; Giftwolke 0.69; Psionischer Tentakel 0.53; Säurekanone 0.41; Verderbnissiegel 0.28; Flammenwerfer 0.18; Feuerdämon 0.07; Wasserwerfer -0.04; Portalring -0.04; Kosmisches Portal -0.04; Feuerball -0.06; Katapult -0.55
- Ausreißer (15): Tentakelgift 0.85; Tornado 0.80; Eisschlag 0.77; Schwarzes Loch 0.73; Giftwolke 0.69; Katapult -0.55; Meteorbrocken -0.55; Haubitze -0.55; Plasmagewehr -0.55; Raketenkanone -0.55; Voodoopuppe -0.55; Psionischer Tentakel 0.53; Säurekanone 0.41; Verderbnissiegel 0.28; Flammenwerfer 0.18

**e Scoring (Residuum)**

- Beste (15): Meteorbrocken 2.29; Katapult 2.01; Haubitze 2.01; Raketenkanone 1.16; Feuerdämon 1.12; Tentakelgift 1.04; Giftwolke 0.88; Voodoopuppe 0.87; Feuerball 0.83; Schwarzes Loch 0.53; Flammenwerfer 0.50; Portalring 0.30; Säurekanone 0.28; Kosmisches Portal 0.22; Psionischer Tentakel 0.17
- Ausreißer (15): Meteorbrocken 2.29; Katapult 2.01; Haubitze 2.01; Raketenkanone 1.16; Feuerdämon 1.12; Tentakelgift 1.04; Giftwolke 0.88; Voodoopuppe 0.87; Feuerball 0.83; Plasmagewehr -0.61; Schwarzes Loch 0.53; Flammenwerfer 0.50; Tornado -0.41; Portalring 0.30; Säurekanone 0.28

## 4. Schadensart, Elementarwerte, Brand, Frost, Gift und Gelände: passt das zusammen?

Gelesen in `src/shared/config/schaden.js` (Tabellen `MALUS`, `ART_REGEL`, `DOT_FAKTOR`, `DOT_MAX_JE_EINTRAG`, `WECHSELWIRKUNG`), `feuer.js`, `docs/terrain-matrix.md` und `src/engine/` (`specials.js`, `schadenMali.js`, `match.js`, `systems/projectileSystem.js`, `systems/feuerSystem.js`); Zahlen in der Spalte "Wirkung" stammen aus dem Mali-Lauf (Zusatz 3 in Abschnitt 2).

### 4.1 Zuordnung je Waffe

| ID | Waffe | Schadensart (Familie) | Malus der Art | Elementar F/E/G | `special` → Motorwirkung | Wirkung im Spiel (Fassung 2) | Wirkgruppe Gelände | Krater px / Tiefe % (flach, gemessen) | Zünden/Löschen (px) |
|---|---|---|---|---|---|---|---|---:|---:|
| pa_061 | Feuerdämon | fire (feuer) | brand | 38/0/0 | `fire_entity` → keine (aus Elementarwert abgeleitet) | Brand 15 × 3 = 45 | hitze | 26 / 85 | zünden 42 |
| pa_062 | Flammenwerfer | fire (feuer) | brand | 45/0/0 | `continuous_stream` → keine (aus Elementarwert abgeleitet) | Brand 16 × 3 = 48 | hitze | 14 / 85 | zünden 26 |
| pa_063 | Wasserwerfer | water (natur) | nass | 0/0/0 | `water_push` → water_push | Nass 2 Züge; Wegschub 120 px; Wasserstand +0,4 | nass | 42 / 115 | löschen 75 |
| pa_064 | Katapult | physical (koerper) | – | 0/0/0 | `catapult` → keine | – | wucht | 29 / 85 | – |
| pa_065 | Meteorbrocken | impact (koerper) | – | 0/0/0 | `meteor_impact` → keine | – (Vorstrahl 74 zusätzlich) | wucht | 50 / 115 | – |
| pa_066 | Haubitze | explosive (koerper) | – | 0/0/0 | `artillery` → keine | – (Vorstrahl 56 zusätzlich) | wucht | 29 / 85 | – |
| pa_067 | Säurekanone | acid (gift) | saeure; Rüstung 50 % | 0/0/28 | `acid_dot` → damage_over_time poison | Gift 14 × 3 = 42; Säure 2 Züge | aetz | 23 / 85 | – |
| pa_068 | Plasmagewehr | energy (energie) | –; Schild 50 % | 0/0/0 | `plasma` → keine | – (Durchschlag) | hitze | 14 / 85 | zünden 26 |
| pa_069 | Raketenkanone | explosive (koerper) | – | 0/0/0 | `launcher` → keine | – | wucht | 24 / 85 | – |
| pa_070 | Giftwolke | poison (gift) | gift; Rüstung 50 % | 0/0/45 | `poison_cloud` → damage_over_time poison | Gift 18 × 3 = 54 | aetz | 35 / 85 | – |
| pa_071 | Eisschlag | ice (eis) | frost | 0/50/0 | `freeze` → freeze | Frost: Tempo 70 %, 2 Züge, kein Aussetzen | kaelte | 21 / 85 | löschen 42 |
| pa_072 | Feuerball | fire (feuer) | brand | 30/0/0 | `fireball` → keine (aus Elementarwert abgeleitet) | Brand 12 × 3 = 36 | hitze | 20 / 85 | zünden 34 |
| pa_073 | Tentakelgift | poison (gift) | gift; Rüstung 50 % | 0/0/55 | `tentacle_zone` → damage_over_time poison | Gift 18 × 3 = 54 | aetz | 26 / 85 | – |
| pa_074 | Verderbnissiegel | dark (schatten) | fluch; Rüstung 50 % | 0/0/20 | `curse` → damage_over_time poison | Fluch 7 × 2 = 14; Heilung −50 % | wucht | 28 / 85 | – |
| pa_075 | Tornado | wind (natur) | – | 0/0/0 | `suction` → pull | Zug 90 px zum Schützen | wucht | 36 / 85 | – |
| pa_076 | Portalring | spatial (magie) | –; Rüstung 50 % | 0/0/0 | `portal` → move | Selbst: Versatz 60 px | wucht | kein Einschlag | – |
| pa_077 | Schwarzes Loch | void (schatten) | fluch; Rüstung 50 % | 0/0/0 | `gravity_well` → pull | Fluch 2 Züge (0 Schaden); Zug 90 px | wucht | 43 / 85 | – |
| pa_078 | Voodoopuppe | dark (schatten) | fluch; Rüstung 50 % | 0/0/0 | `linked_damage` → keine | Fluch 2 Züge (0 Schaden) | wucht | 14 / 85 | – |
| pa_079 | Kosmisches Portal | spatial (magie) | –; Rüstung 50 % | 0/0/0 | `portal_field` → move | Selbst: Versatz 60 px | wucht | kein Einschlag | – |
| pa_080 | Psionischer Tentakel | psychic (magie) | –; Rüstung 50 % | 0/0/0 | `mind_pull` → pull | Zug 90 px zum Schützen | wucht | 31 / 85 | – |

Befunde zur Zuordnung (jeweils belegt):

- Beschreibung, Art und Wirkung stimmen bei Feuerdämon, Flammenwerfer, Feuerball (Brand), Säurekanone und Giftwolke/Tentakelgift (Gift), Verderbnissiegel/Voodoopuppe/Schwarzes Loch (Fluch aus `dark`/`void`), Wasserwerfer (Nass), Tornado/Psionischer Tentakel (Zug) überein.
- **Eisschlag:** Die Beschreibung sagt "den Gegner einfriert", die Art `ice` macht Frost (`ART_REGEL.ice.malus = frost`). Der Zweig `FREEZE` mit Art `ice` ruft `wende(.., "frost")`, die im Katalog abgeleitete Dauer des `freeze` (Eis 50 → 1 + ⌊50/40⌋ = 2 Züge) wird nicht gelesen; Frost hat feste Dauer 2 (+1 im Biom `alpine` und auf Eisboden). Ausgesetzt wird erst bei zweitem Frost oder nassem Ziel (`betaeube`: 1 Zug, danach 1 Zug Schutz).
- **Verderbnissiegel:** Der Elementarwert steht als `poison` 20 und `special` `curse` bildet auf Gift-Schaden ab, die Art `dark` macht daraus Fluch (`treffer`: `regel.malus === "fluch"`); Dauer 2, Tick 7 (`DOT_FAKTOR.fluch` 0,7 × 10).
- **Meteorbrocken:** Beschreibung "glühender Brocken", Art `impact`, Wirkgruppe Wucht: kein Brand-Malus, kein Entzünden (`einschlag` zündet nur Gruppe Hitze).
- **Plasmagewehr:** Art `energy` ist Gruppe Hitze und Zerstörungscharakter `brand` (`BRAND_ARTEN`): Der Einschlag (Krater 14, Zündreichweite 26 px) entzündet brennbare Stoffe, aber `ART_REGEL.energy` hat keinen Malus; ein Treffer brennt die Figur also nicht, Flammen am Boden schon (`FEUER.schadenFlamme` 3 je Schritt, `brandMalusSchaden` 3).
- **Schwarzes Loch, Tornado, Psionischer Tentakel:** Der Zug (`PULL`, 90 px zum **Schützen**, nicht zum Einschlagpunkt) setzt per `#shiftToward` `Velocity` auf 0; der Rückstoß aus `#explode` (88/80/60) wirkt damit nur, wenn der Zug nicht greift (Wand, Kartenrand).

### 4.2 Was ein Elementarpunkt im Spiel liefert und was der Leistungswert dafür zahlt

Der Leistungswert zählt `elemental` (Feuer + Eis + Gift) mit 0,5 je Punkt, bei Abklingzeit > 0 mal 0,9, also 0,45. Der Motor setzt den Elementarwert so um (`elementalEffectFor`/`buildEffect`: Schaden je Zug = max(8, ⌊Summe/2⌉), 3 Züge; Fassung 2: `DOT_FAKTOR` Brand 0,8, Gift 1, Fluch 0,7, Deckel je Eintrag Brand 16, Gift 18, Fluch 10):

| Waffe | Elementar | Tick je Zug (Lauf) | Züge | Summe | Schaden je Elementarpunkt | Leistungspunkte (×0,45) | Schaden je Leistungspunkt |
|---|---|---:|---:|---:|---:|---:|---:|
| Feuerball (Feuer) | 30 | 12 | 3 | 36 | 1,20 | 13,50 | 2,67 |
| Feuerdämon (Feuer) | 38 | 15 | 3 | 45 | 1,18 | 17,10 | 2,63 |
| Flammenwerfer (Feuer) | 45 | 16 | 3 | 48 | 1,07 | 20,25 | 2,37 |
| Säurekanone (Gift) | 28 | 14 | 3 | 42 | 1,50 | 12,60 | 3,33 |
| Giftwolke (Gift) | 45 | 18 | 3 | 54 | 1,20 | 20,25 | 2,67 |
| Tentakelgift (Gift) | 55 | 18 | 3 | 54 | 0,98 | 24,75 | 2,18 |
| Verderbnissiegel (Fluch) | 20 | 7 | 2 | 14 | 0,70 | 9,00 | 1,56 |
| Eisschlag (Eis) | 50 | 0 | – | 0 (Tempo 70 %) | 0,00 | 22,50 | 0,00 |

- Feuer und Gift liefern 1,0 bis 1,5 Schaden je Elementarpunkt über drei Züge, bezahlt werden 0,45 Punkte (Schaden je Leistungspunkt 2,2 bis 3,3 gegen 1,0 beim Direktschaden). Der Leistungswert **unterschätzt Status-Waffen**: Flammenwerfer (63,45) liegt unter Feuerball (93,51) und Feuerdämon (113,76), liefert aber 81,6 gegen 69,6 und 85,6 Gesamtschaden bei kürzerer Abklingzeit.
- **Deckel:** Brand wird bei 16 je Zug gedeckelt, der Deckel greift ab Feuer 39 (Flammenwerfer 45 liegt darüber); Gift bei 18 je Zug, ab Gift 35 (Giftwolke 45 und Tentakelgift 55 liegen darüber und liefern dasselbe). Fluch (Deckel 10) ist mit Tick 7 nicht gedeckelt. Der gesamte Schaden über Zeit je Zugbeginn ist zusätzlich auf 20 % der Höchstgesundheit begrenzt (`OBERGRENZEN.dotAnteil`).
- **Eis** zahlt 22,5 Leistungspunkte ohne Schaden (Eisschlag). Frost ist ein Tempo-Malus mit Betäubungsfolge, kein Schaden; Fluch ist ein Schwächungs-Malus (Heilung −50 %, eigener Schaden −15 %), im Leistungswert unsichtbar.
- **Gegenspiel** (nimmt Status-Waffen Wert): Nässe verhindert Brand und löscht ihn (`wende`: `istNass`; Wasserwerfer setzt Nass für 2 Züge, Wasserstand ≥ 0,35 genügt); Frost und Brand heben sich auf; Heilung ab Rohwert 20 (jede Heilwaffe mit Untergrenze 35) löscht Brand, Säure und einen Gift-Stapel, ab 40 alles Gift und den Fluch. Biom `forest`: Brand +1 Zug, `alpine`: Frost +1 Zug, Eisboden: Frost +1, Brand −1; Archetyp Artillerist: Brand −1 Zug, Brawler: Gift/Säure −1 Zug. Nur das Biom `forest` und Eisboden verändern die Brandsumme (Faktor 4/3 bzw. 2/3).

### 4.3 Abklingzeit wird vom Leistungswert kaum bezahlt

`computePowerScore` kennt nur "Abklingzeit > 0 → × 0,9" (Abklingzeit 1 und 3 sind gleich). In der Gruppe haben die höchsten Leistungswerte (außer Tentakelgift) Abklingzeit 3:

| Abklingzeit | Waffen | mittlerer Leistungswert | mittlerer Gesamtschaden (Richtwert, ohne Portale) | Gesamtschaden je Abklingzyklus (÷ (CD+1)) |
|---:|---:|---:|---:|---:|
| 0 | 1 | 57,2 | 22,4 | 22,4 |
| 1 | 8 | 60,4 | 47,1 | 23,6 |
| 2 | 6 | 95,6 | 53,5 | 17,8 |
| 3 | 5 | 121,0 | 55,3 | 13,8 |

Die fünf Waffen mit Abklingzeit 3 (Feuerdämon, Katapult, Meteorbrocken, Haubitze, Schwarzes Loch) stehen im Mittel auf dem höchsten Leistungswert, liefern aber nur 39,2 bis 85,6 Gesamtschaden je Einsatz und 9,8 bis 21,4 je Abklingzyklus (Haubitze 9,8 · Katapult 11,9 · Meteorbrocken 13,0 · Schwarzes Loch 13,1 · Feuerdämon 21,4); Flammenwerfer (40,8), Giftwolke (33,3), Tentakelgift (25,5) und Feuerball (23,2) liegen darüber. Annahme dabei: Einsatz, sobald die Waffe wieder frei ist; Abklingzeit zählt in eigenen Zügen. Die Stufe richtet sich also nach dem Einzelschlag, nicht nach der Schlagfolge.

### 4.4 Gelände

Krater: `projectileSystem.#explode` nimmt `terrainDamage`, wenn > 0, sonst 0,6 × Radius des **Geschosses**; für Waffen mit Radius 0 ist das Geschossmaß 24 (Trefferfenster), also Krater 14 px (Flammenwerfer, Plasmagewehr, Voodoopuppe). Tiefe 85 %, 115 % bei `terrainDamage` > 0 (Wasserwerfer, Meteorbrocken; die Stufe 135 % für `terrainDamage` ohne Geschossradius trifft nur Nahkämpfer). Wirkgruppe der Art (`GRUPPE_VON_ART`): fire/dragon/energy → Hitze, ice → Kälte, acid/poison → Ätz, electric/magnetic → Strom, water → Nass, alles andere → Wucht.

| Wirkgruppe | Waffen der Gruppe | Radiusfaktoren aus `terrain-matrix.md` (Auswahl) | Besonderheit |
|---|---|---|---|
| Hitze | Feuerdämon, Flammenwerfer, Feuerball, Plasmagewehr | Schnee 1,89 · Pulverschnee 1,96 · Eis 1,5 · Pilzgewebe 1,5 · Holz 1,19 · Fels 0,7 · Obsidian 0,4 | entzündet brennbare Zellen (Holz, Pilz) im Radius × 1,3 + 8 px mit Wahrscheinlichkeit 0,85; Eis und Schnee schmelzen |
| Kälte | Eisschlag | Eis 0,8 · Gletschereis 0,64 · Schnee 1,22 · Fels 0,66 | löscht Feuerzellen im Radius × 1,6 + 8 px; frisst weniger Eis |
| Ätz | Säurekanone, Giftwolke, Tentakelgift | Säureablagerungen 0,69 · Säureboden 0,72 · Fels 0,84 · Koralle 1,23 · Riffkalkstein 1,28 | kleinerer Krater auf Säure- und Giftboden (0,69 bis 0,72), größer auf Koralle und Riffkalk |
| Nass | Wasserwerfer | Salzkruste 1,4 · Säureablagerungen 1,5 · Erde 1,1 · Holz 0,86 · Wasser 1,4 | löscht Feuerzellen (Radius × 1,6 + 8 px), macht Holz 45 Schritte lang nass (brennt dann nicht) |
| Wucht (Rest) | Katapult, Meteorbrocken, Haubitze, Raketenkanone, Verderbnissiegel, Tornado, Schwarzes Loch, Voodoopuppe, Psionischer Tentakel (Portale: kein Einschlag) | Schnee 1,35 · Fels 0,7 · Metall 0 | keine Gelände-Reaktion |

- 9 von 18 Waffen mit Einschlag (11 von 20 nach Art, die Portale zählen als Wucht ohne Einschlag) sind "Wucht" und bekommen weder Entzünden noch Löschen; das ist stimmig für `physical`, `impact`, `explosive`, nicht verlangt für `wind`, `void`, `dark`, `psychic`.
- Nur Wasserwerfer (42) und Meteorbrocken (50) haben einen Krater aus `terrainDamage` statt aus Radius × 0,6. Beim Wasserwerfer (Katalogradius 0) heißt das: Krater 42 px bei Tiefe 115 %, fast so groß wie Schwarzes Loch (43, Abklingzeit 3), bei Abklingzeit 0 in jedem Zug. Dazu löscht er 75 px weit (Gegenspiel zu Brand) und verdrängt Wasser mit Radius 42.
- Flammenwerfer, Plasmagewehr und Voodoopuppe haben im Katalog Radius 0, im Motor aber ein Trefferfenster von 24 px (gemessener Explosionsradius 24) mit Krater 14 px; Flammenwerfer und Plasmagewehr zünden dabei 26 px weit. Der Leistungswert zählt dieses Fenster nicht (ps* 81,81 gegen 63,45 beim Flammenwerfer).
- `docs/terrain-matrix.md` führt Wirkgruppen nach Art, nicht nach Waffe: 18 der 18 gemessenen Kraterradien sind `terrainDamage` oder round(0,6 × Geschossradius) (Radius 0 → 24); die Matrix ist für diese Gruppe mit dem Motor konsistent.

## 5. Einzelbeurteilung (20 Waffen)

Urteile: ok / zu stark / zu schwach / Fehlzuordnung / Messartefakt. Vorschläge sind Testwerte zur Entscheidung, keine Änderung. "Gemessen" = Bestwert je Seed (Versatz 0/1000/2000, Skript mit Schadensfassung 1) und flache Wurfweite (`open`, volle Kraft); G = Gesamtschaden (Richtwert, Scout, Kernmitte, Fassung 2). Stufenmediane aus Audit E1: common 17,8; uncommon 30,4; rare 46,5; epic 68,5. ps = Katalog-Leistungswert, ps (F5) = mit Fassung-5-Schaden, ps\* = Gegenrechnung aus Motorfeldern.

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps (F5) → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_061 | Feuerdämon | fire, Schaden 58, Radius 44, Rückst. 0, Gelände 0, Mun. 3, CD 3, Reichw. 565, `fire_entity`, Elem. 38/0/0 | 51.8/51.8/52.1; Weite 241 px; G 85,6 | 113.76 (rare) → 113.76 (rare) → 102.96 | **ok** | Brand 15 je Zug über 3 Züge (Elementarwert 38, im Mali-Lauf gemessen) zu 40,6 Direktschaden (Scout, Kernmitte) ergibt rund 85,6 bei Abklingzeit 3; Fläche 44 px, Brand trifft alle im Radius. Messwert 51,8 (1,11 × Median rare) enthält den ersten Brand-Tick der Fassung 1 (19). Beschreibung "Beschworener Feuerdämon" ist Erzählung: der Motor kennt `fire_entity` nicht, es ist ein Feuer-Flächenschuss. | keine | – |
| pa_062 | Flammenwerfer | fire, Schaden 48, Radius 0, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `continuous_stream`, Elem. 45/0/0 | 44.6/45.6/45.5; Weite 241 px; G 81,6 | 63.45 (uncommon) → 63.45 (uncommon) → 81.81 | **zu stark (Verdacht, gelesen und im Mali-Lauf gemessen, nicht im Spiel getestet)** | Ohne Flächenwirkung, aber: 33,6 Direktschaden + Brand 16 × 3 = 48 gleich 81,6 bei Abklingzeit 1; Feuerdämon (Abklingzeit 3) kommt auf 85,6, Feuerball (Abklingzeit 2) auf 69,6. Der Leistungswert 63,45 (uncommon) ist der niedrigste der drei, weil Brand nur mit 22,5 Punkten zählt und der Radius 0 ist (im Motor wirkt aber ein Trefferfenster von 24 px). Elementarwert 45 liegt über dem Brand-Deckel (16 je Zug ab Feuer 39): 6 Elementarpunkte (rund 2,7 Leistungspunkte) sind wirkungslos. Messwert 44,6 = 1,47 × Median uncommon. | `elemental.fire` 45 → 30 (Brand 12, Summe 69,6 wie Feuerball); Leistungswert 63,45 → 56,7 | Brand 12 statt 16 je Zug; Stufe bleibt uncommon; Prüfsummen (`waffen-fassung.test.js`) neu rechnen |
| pa_063 | Wasserwerfer | water, Schaden 18 (F5: 32), Radius 0, Rückst. 0, Gelände 42, Mun. 3, CD 0, Reichw. 565, `water_push` | 14.3/14.7/15.1; Weite 241 px; G 22,4 | 43.2 (common) → 57.2 (uncommon) → 77.6 | **Fehlzuordnung (Score veraltet; Gelände 42 px)** | Fassung 5 liest Schaden 32 (`WAFFEN_F5_WERTE`), der Katalog und sein Leistungswert 43,2 (common) rechnen noch mit 18; mit 32 wären es 57,2 (uncommon). Im Spiel: Nass 2 Züge (löscht Brand, verstärkt Frost und Schock), Wegschub 120 px, Wasserstand +0,4. Der Krater folgt `terrainDamage` 42 und ist 42 px groß bei Tiefe 115 %, fast so groß wie Schwarzes Loch (43) und größer als jeder Sprengkrater außer Meteorbrocken (50), bei Abklingzeit 0 in jedem Zug möglich. 25,2 der 57,2 Punkte (44 %) stammen aus dem Gelände; die Beschreibung erwähnt kein Gelände. | `terrainDamage` 42 → 20 (Test; Krater 20 px wie Feuerball); Leistungswert (Fassung 5) 57,2 → 44,0; Katalog-Leistungswert mit Schaden 32 nachziehen | Löschreichweite (1,6 × Kraterradius) sinkt von 75 auf 40 px; Wasserverdrängung (`water.displace`) wird kleiner; Tests zu `water_push` prüfen |
| pa_064 | Katapult | physical, Schaden 68, Radius 48, Rückst. 0, Gelände 0, Mun. 3, CD 3, Reichw. 472, `catapult` | 38.8/38.5/39.5; Weite 202 px; G 47,6 | 108.72 (rare) → 108.72 (rare) → 97.92 | **ok** | Reiner Flächenschlag ohne Status (47,6 Direktschaden, Radius 48, Abklingzeit 3); Schwerkraft 1,23 verkürzt die Wurfweite auf 202 px (alle anderen 241 px). Je Leistungspunkt 0,44 Schaden, wie Raketenkanone (0,43): die Schadens-Waffen ohne Status sind untereinander stimmig. Die Rang-Abweichung +117 (Leistungswert hoch gegen die Merkmale) folgt aus dem Radius (40,8 von 108,7 Punkten), nicht aus einem Fehler im Wert. | keine | – |
| pa_065 | Meteorbrocken | impact, Schaden 74, Radius 50, Rückst. 0, Gelände 50, Mun. 3, CD 3, Reichw. 419, `meteor_impact` | 111.4/113.9/116.4; Weite 565 px; G 51,8 | 142.65 (epic) → 142.65 (epic) → 131.85 | **zu stark (Verdacht Motor: Vorstrahl trifft zusätzlich; Ereignisfolge gemessen)** | Anflugart `sky`: `resolveStrike` ruft `resolveHitscan` auf, und der wendet auf eine Figur im Strahl den vollen Katalogschaden an (Ereignis `damage` 74, `attackerId` null, ohne Klassenfaktor), danach schlägt der Himmelsschlag am selben Punkt ein (weitere 37 bis 42 Schaden): Messung 111,4/113,9/116,4 in drei Seeds = 1,63 × Median epic. Die Leistungspunkte (142,65, epic) bilden nur den Einzelschlag ab. Schadensart `impact` (Wucht): "Glühender Brocken" bewirkt weder Brand noch Entzünden. | Motorprüfung: Vorstrahl ohne Schaden (Entscheidung, Replay-Fassung); falls gewollt: `damage` 74 → 52 (Leistungswert 142,65 → 122,85, dann rare) | Motoränderung berührt alle 7 Waffen mit Anflugart `sky`/`flank` (pa_039, pa_065, pa_066, pa_134, pa_135; pa_113, pa_139) und alte Replays (§2); Katalogwert senkt die Stufe |
| pa_066 | Haubitze | explosive, Schaden 56, Radius 48, Rückst. 0, Gelände 0, Mun. 3, CD 3, Reichw. 463, `artillery` | 87.8/89/88.3; Weite 621 px; G 39,2 | 97.92 (rare) → 97.92 (rare) → 87.12 | **zu stark (Verdacht Motor: Vorstrahl; wie Meteorbrocken)** | Gleicher Mechanismus wie Meteorbrocken: Vorstrahl 56 (`attackerId` null) plus Einschlag rund 32 in der Messung (87,8/89/88,3 = 1,89 × Median rare); Audit E3 nannte den Wert schon. Radius 48, Krater 29 px, Abklingzeit 3, kein Status. Der Leistungswert 97,92 (rare) bildet den Einzelschlag ab. | wie Meteorbrocken (Motor); falls gewollt: `damage` 56 → 40 (Leistungswert 97,92 → 83,52, bleibt rare) | wie Meteorbrocken |
| pa_067 | Säurekanone | acid, Schaden 35, Radius 38, Rückst. 0, Gelände 0, Mun. 3, CD 2, Reichw. 565, `acid_dot`, Elem. 0/0/28 | 33.4/33.4/33.3; Weite 241 px; G 66,5 | 83.97 (rare) → 83.97 (rare) → 73.17 | **ok** | Beschreibung und Wirkung stimmen: Art `acid` löst Gift (14 je Zug × 3 = 42, Elementarwert 28 unter dem Deckel 18) und den Säure-Malus (Rüstung 25 Prozentpunkte weniger, 2 Züge) aus; 24,5 Direktschaden; Gelände Gruppe Ätz. Summe 66,5 bei Abklingzeit 2, Stufe rare knapp (83,97). | keine | – |
| pa_068 | Plasmagewehr | energy, Schaden 54, Radius 0, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 959, `plasma`, Durchschlag 1 | 59.7/59.2/58.6; Weite 430 px; G 37,8 | 51.3 (uncommon) → 51.3 (uncommon) → 68.74 | **zu stark (Verdacht, Messung belegt)** | Durchschlag: die Figur nimmt den vollen Schaden (37,8) im Durchflug, das Geschoss fliegt weiter und explodiert mit dem Trefferfenster 24 px am Boden dahinter: Messung 59,7/59,2/58,6 = 1,96 × Median uncommon (höchstes Verhältnis der Gruppe). Schnellstes Geschoss (Tempo 94) und flache Weite 430 px gegen 241 der übrigen. Leistungswert 51,3 (uncommon) zählt Durchschlag nur mit 6 Punkten. Art `energy` zündet Holz (Gruppe Hitze) ohne Brand-Malus; der Schild fängt nur die Hälfte. | `damage` 54 → 46 (Test; Fassung 3 hatte 50); Leistungswert 51,3 → 44,46 (dann common) | Stufe uncommon → common ändert das Beutegewicht; Prüfsummen neu |
| pa_069 | Raketenkanone | explosive, Schaden 56, Radius 40, Rückst. 0, Gelände 0, Mun. 3, CD 2, Reichw. 565, `launcher` | 32.6/30.8/31.2; Weite 241 px; G 39,2 | 91.8 (rare) → 91.8 (rare) → 81 | **ok** | Status-lose Fläche (39,2, Radius 40, Abklingzeit 2); je Leistungspunkt 0,43 Schaden, gleich Katapult. Messwert 32,6 (0,70 × Median rare) ist bei Kernmitte-Abstand und Abfall des Radius zu erwarten. Beschreibung "großer Radius" gilt (40 gegen Mittel 33,5 der Gruppe). | keine | – |
| pa_070 | Giftwolke | poison, Schaden 18, Radius 58, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `poison_cloud`, Elem. 0/0/45, Zünder 1 s | 35.3/34.9/34.3; Weite 242 px; G 66,6 | 91.62 (rare) → 91.62 (rare) → 80.82 | **ok (Zünder; Messwert Messartefakt)** | Gift 18 je Zug × 3 = 54 für alle im Radius 58 (größter Radius der Gift-Waffen), zwei Stapel möglich, jeder mindert Heilung um 25 %. 12,6 Direktschaden. Der Elementarwert 45 übersteigt den Gift-Deckel (18 je Zug ab Gift 35): 10 Elementarpunkte (4,5 Leistungspunkte) sind wirkungslos. Messwert 35,3 enthält den ersten Gift-Tick der Fassung 1 (23) und ist wegen der Lunte unsicher (Skript nimmt Zünderwaffen aus der Ausreißerprüfung). | keine am Spiel; Score: `elemental.poison` 45 → 36 (91,62 → 87,57, bleibt rare) | nur Leistungswert und Prüfsumme |
| pa_071 | Eisschlag | ice, Schaden 42 (F5: 55), Radius 35, Rückst. 0, Gelände 0, Mun. 3, CD 2, Reichw. 565, `freeze`, Elem. 0/50/0 | 28.8/29.9/29.8; Weite 241 px; G 38,5 | 97.88 (rare) → 109.58 (rare) → 98.78 | **Fehlzuordnung (Wirkung gegen Beschreibung; Score veraltet)** | Beschreibung "friert ein", aber Art `ice` löst in Fassung 2 nur Frost aus (Tempo 70 %, 2 Züge); die `freeze`-Dauer 2 aus dem Elementarwert wird nicht gelesen, ein Zug fällt erst beim zweiten Treffer oder bei nassem Ziel aus. Eis 50 bringt 22,5 Leistungspunkte (21 % des Wertes von 109,58) für 0 Schaden. Fassung 5 liest Schaden 55 (Katalog 42), Leistungswert dann 109,58 (rare); Messwert 28,8 (0,62 × Median rare) bei Direktschaden 38,5. Wasserwerfer + Eisschlag ergibt Betäubung (Nässe). | `elemental.ice` 50 → 30 (Leistungswert Fassung 5 109,58 → 100,58); Beschreibung auf "verlangsamt" ändern oder Einfrieren umsetzen (Entscheidung) | Einfrieren = Motor und Fassung 2 der Mali; Wirkungstexte (`wirkungstexte.js`) und deren Test mitziehen |
| pa_072 | Feuerball | fire, Schaden 48, Radius 34, Rückst. 0, Gelände 0, Mun. 3, CD 2, Reichw. 565, `fireball`, Elem. 30/0/0 | 41.7/40.2/40.8; Weite 241 px; G 69,6 | 93.51 (rare) → 93.51 (rare) → 82.71 | **ok** | Brand 12 je Zug × 3 = 36 (Feuer 30 unter dem Deckel) plus 33,6 Direktschaden = 69,6 bei Radius 34 und Abklingzeit 2; Wirkgruppe Hitze entzündet Holz und Pilz im Radius 20 × 1,3 + 8 = 34 px. Messwert 41,7 (0,90 × Median rare). Stimmig mit der Beschreibung. | keine | – |
| pa_073 | Tentakelgift | poison, Schaden 32, Radius 44, Rückst. 0, Gelände 0, Mun. 3, CD 2, Reichw. 565, `tentacle_zone`, Elem. 0/0/55, Zünder 2 s | 44.9/42/44.8; Weite 242 px; G 76,4 | 98.01 (rare) → 98.01 (rare) → 87.21 | **ok (Elementarwert über Deckel)** | Gift 18 × 3 = 54 wie Giftwolke, dazu 22,4 Direktschaden = 76,4 bei Abklingzeit 2 und Zünder 2 s. Der Elementarwert 55 liegt weit über dem Deckel (28 Rohwert; 20 Elementarpunkte oder 9 Leistungspunkte wirkungslos); Giftwolke (45) und Tentakelgift (55) liefern damit dieselbe Gift-Wirkung. Messwert 44,9 enthält den ersten Gift-Tick der Fassung 1 (28). | Score: `elemental.poison` 55 → 36 (98,01 → 89,46, bleibt rare); am Spiel nichts | nur Leistungswert und Prüfsumme |
| pa_074 | Verderbnissiegel | dark, Schaden 28, Radius 46, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `curse`, Elem. 0/0/20 | 26.2/26.2/26.7; Weite 241 px; G 33,6 | 80.19 (rare) → 80.19 (rare) → 69.39 | **zu schwach (Verdacht)** | Art `dark` macht aus dem als Gift gedachten Elementarwert (20) einen Fluch: 7 je Zug × 2 = 14, dazu Heilung halbiert und eigener Schaden −15 %. Direktschaden 19,6, Summe 33,6 bei Radius 46 und Abklingzeit 1: niedrigste Summe aller Status-Waffen der Stufe rare (Messwert 26,2 = 0,56 × Median). Der Leistungswert 80,19 liegt knapp über der Schwelle rare (80) und zählt Gift 20 mit 10 Punkten, geliefert werden 14 Schaden. Der Schwächungseffekt hat keinen Leistungswert. | `damage` 28 → 34 (Test); Leistungswert 80,19 → 85,59 | Fluch gilt auch für Schwarzes Loch und Voodoopuppe; Gewichtung Fluch im Leistungswert ist eine Formelfrage |
| pa_075 | Tornado | wind, Schaden 18 (F5: 45), Radius 60, Rückst. 88, Gelände 0, Mun. 3, CD 1, Reichw. 565, `suction` | 27/27.7/27.3; Weite 241 px; G 31,5 | 82.4 (rare) → 106.7 (rare) → 86.4 | **Fehlzuordnung (Score veraltet; Rückstoß wirkungslos)** | Fassung 5 liest Schaden 45 (Katalog 18, Leistungswert 82,4); mit 45 sind es 106,7. Der Rückstoß 88 (10,6 Punkte) wird gelöscht: `shiftToward` setzt die Geschwindigkeit des gezogenen Ziels auf 0, nachdem `#explode` den Impuls addiert hat. Der Zug (90 px zum Schützen) wirkt auf alle im Radius 60 (zweitgrößter der Gruppe, Abklingzeit 1). Messwert 27 bei 31,5 Direktschaden. | `knockback` 88 → 0 (Leistungswert Fassung 5 106,7 → 97,2); Katalog-Leistungswert mit Schaden 45 nachziehen | Bei Zug in die Wand (Zug = 0) wirkte der Rückstoß noch; Prüfsummen neu |
| pa_076 | Portalring | spatial, Schaden 35, Radius 0, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `portal` | Selbstwirkung, 0/0/0 | 31.5 (common) → 31.5 (common) → 0 | **Fehlzuordnung (Score und Kategorie; Dublette zu Kosmisches Portal)** | Selbstwirkung (`portal` = Versatz 60 px, kein Geschoss): der Katalogschaden 35 wird nie angerichtet, zählt aber 31,5 Punkte. Alle Werte außer dem Schaden gleich Kosmisches Portal (Munition 3, Abklingzeit 1, Versatz 60); gleiche Wirkung wie Enterhaken und Düsenrucksack (60 px). Schadensart `spatial` hat keinen Malus. Sie liegt als Bewegungswaffe in `elemental`. | `damage` 35 → 0 (Leistungswert 31,5 → 0); Wirkung von Portalring und Kosmisches Portal unterscheiden (Entscheidung) | Kategorie bestimmt Ersatzschaden und Strahllänge (`DAMAGE_BY_CATEGORY`); Umsortieren ist eine Balanceänderung; Prüfsummen |
| pa_077 | Schwarzes Loch | void, Schaden 75, Radius 72, Rückst. 80, Gelände 0, Mun. 3, CD 3, Reichw. 565, `gravity_well` | 46/46.3/46.6; Weite 241 px; G 52,5 | 142.02 (epic) → 142.02 (epic) → 122.58 | **ok** | Größter Radius (72) und Schaden 75 (52,5 Direktschaden, Abklingzeit 3); Art `void` setzt Fluch (2 Züge, ohne Schaden) und die Wirkung zieht 90 px zum Schützen. Der Rückstoß 80 (9,6 Punkte) wird wie beim Tornado durch den Zug gelöscht. Messwert 46 (0,67 × Median epic) liegt unter der Stufe, aber der Zug und der Fluch sind im Wert nicht erfasst; die Beschreibung "zieht Gegner an" stimmt (zum Schützen). | keine (nur Score: `knockback` 80 → 0, 142,02 → 133,38, bleibt epic) | – |
| pa_078 | Voodoopuppe | dark, Schaden 45, Radius 0, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `linked_damage` | 20.3/21/20.4; Weite 241 px; G 31,5 | 40.5 (common) → 40.5 (common) → 58.86 | **ok (Wirkung unvollständig)** | `linked_damage` hat keine Motorwirkung (nur Fluch aus der Art `dark`: 2 Züge, 0 Schaden, Heilung halbiert, eigener Schaden −15 %). Direktschaden 31,5 ohne Fläche, Abklingzeit 1; Messwert 20,3 = 1,14 × Median common. Leistungswert 40,5 (common) stimmt dazu; die "Verbindung" des Schadens fehlt, die Beschreibung verspricht sie nicht. | keine | – |
| pa_079 | Kosmisches Portal | spatial, Schaden 20, Radius 0, Rückst. 0, Gelände 0, Mun. 3, CD 1, Reichw. 565, `portal_field` | Selbstwirkung, 0/0/0 | 18 (common) → 18 (common) → 0 | **Fehlzuordnung (Score und Kategorie; Dublette zu Portalring)** | Selbstwirkung (`portal_field`, Versatz 60 px): Katalogschaden 20 zählt 18 Punkte, ohne je angerichtet zu werden; bis auf den Schaden gleich Portalring. Messung 0/0/0 ist Soll. | `damage` 20 → 0 (Leistungswert 18 → 0); mit Portalring zusammenführen oder unterscheiden (Entscheidung) | wie Portalring |
| pa_080 | Psionischer Tentakel | psychic, Schaden 44, Radius 52, Rückst. 60, Gelände 0, Mun. 3, CD 2, Reichw. 565, `mind_pull` | 26/26/25.6; Weite 241 px; G 30,8 | 96.66 (rare) → 96.66 (rare) → 79.38 | **zu schwach (Verdacht, Dublette zu Tornado)** | Seit Fassung 5 ist Tornado in jedem Feld mindestens gleich: Schaden 45 gegen 44, Radius 60 gegen 52, Abklingzeit 1 gegen 2, gleiche Munition, gleicher Zug 90 px. Der einzige Unterschied ist die Art `psychic` (halbe Rüstungswirkung). Der Rückstoß 60 wird wie beim Tornado gelöscht. Messwert 26 (0,56 × Median rare). | `cooldown` 2 → 1 (Test; Leistungswert unverändert, da der Faktor nur zwischen 0 und größer 0 unterscheidet) | Leistungswert bildet die Abklingzeit nicht ab; Stufe bleibt rare |

Hinweise zu den Messwerten: Das Skript misst nur den ersten Schlag (Explosion mit Abfall zum Rand plus bei Fassung 1 den ersten Tick von Brand/Gift), nicht die weiteren Züge. Auf flacher Karte fliegen 15 der 20 Waffen gleich weit (241 px bei Tempo 70 und Schwerkraft 1), Katapult 202 px (Schwerkraft 1,23), Plasmagewehr 430 px (Tempo 94); die beiden `sky`-Waffen messen 565 und 621 px, das ist die Strahllänge, kein Flug. Gegen den Katalogwert `maxRange` 565 ist das Faktor 0,43 (in `scripts/check-range.mjs` schon als Klasseneffekt beschrieben). Der Flug-z-Wert (Feld b) trennt in dieser Gruppe deshalb kaum etwas: 15 Waffen haben z -0,07.

## 6. Tabellenmatrix Waffe × Themenfeld

z-Werte gegen den Gesamtkatalog. z_scoring = z(powerScore) − z(Mittel a bis d) mit dem Katalog-`powerScore`; die Spalte "z_scoring (F5)" setzt den Leistungswert nach Fassung 5 ein (nur Wasserwerfer, Eisschlag, Tornado ändern sich). CSV mit denselben Daten: `docs/balance-auslese/elemental.csv`.

| id | Waffe | Kat. | z_schaden | z_flug | z_munition | z_sonder | z_scoring | z_scoring (F5) | powerScore | ps (F5) | Stufe | Urteil |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| pa_061 | Feuerdämon | elemental | 0.54 | -0.07 | -0.83 | 0.07 | 1.12 | 1.12 | 113.76 | 113.76 | rare | ok |
| pa_062 | Flammenwerfer | elemental | -0.33 | -0.07 | -0.34 | 0.18 | 0.50 | 0.50 | 63.45 | 63.45 | uncommon | zu stark (Verdacht, gelesen und im Mali-Lauf gemessen, nicht im Spiel getestet) |
| pa_063 | Wasserwerfer | elemental | -0.15 | -0.07 | -0.09 | -0.04 | -0.08 | 0.17 | 43.2 | 57.2 | common | Fehlzuordnung (Score veraltet; Gelände 42 px) |
| pa_064 | Katapult | elemental | 0.67 | -0.54 | -0.83 | -0.55 | 2.01 | 2.01 | 108.72 | 108.72 | rare | ok |
| pa_065 | Meteorbrocken | elemental | 1.35 | -0.91 | -0.83 | -0.55 | 2.29 | 2.29 | 142.65 | 142.65 | epic | zu stark (Verdacht Motor: Vorstrahl trifft zusätzlich; Ereignisfolge gemessen) |
| pa_066 | Haubitze | elemental | 0.55 | -0.60 | -0.83 | -0.55 | 2.01 | 2.01 | 97.92 | 97.92 | rare | zu stark (Verdacht Motor: Vorstrahl; wie Meteorbrocken) |
| pa_067 | Säurekanone | elemental | 0.25 | -0.07 | -0.58 | 0.41 | 0.28 | 0.28 | 83.97 | 83.97 | rare | ok |
| pa_068 | Plasmagewehr | elemental | 0.75 | 0.45 | -0.34 | -0.55 | -0.61 | -0.61 | 51.3 | 51.3 | uncommon | zu stark (Verdacht, Messung belegt) |
| pa_069 | Raketenkanone | elemental | 0.48 | -0.07 | -0.58 | -0.55 | 1.16 | 1.16 | 91.8 | 91.8 | rare | ok |
| pa_070 | Giftwolke | elemental | 0.23 | -0.07 | -1.29 | 0.69 | 0.88 | 0.88 | 91.62 | 91.62 | rare | ok (Zünder; Messwert Messartefakt) |
| pa_071 | Eisschlag | elemental | 0.30 | -0.07 | -0.58 | 0.77 | 0.11 | 0.32 | 97.88 | 109.58 | rare | Fehlzuordnung (Wirkung gegen Beschreibung; Score veraltet) |
| pa_072 | Feuerball | elemental | 0.35 | -0.07 | -0.58 | -0.06 | 0.83 | 0.83 | 93.51 | 93.51 | rare | ok |
| pa_073 | Tentakelgift | elemental | 0.27 | -0.07 | -1.54 | 0.85 | 1.04 | 1.04 | 98.01 | 98.01 | rare | ok (Elementarwert über Deckel) |
| pa_074 | Verderbnissiegel | elemental | 0.24 | -0.07 | -0.34 | 0.28 | 0.10 | 0.10 | 80.19 | 80.19 | rare | zu schwach (Verdacht) |
| pa_075 | Tornado | elemental | 0.25 | -0.07 | -0.34 | 0.80 | -0.41 | 0.02 | 82.4 | 106.7 | rare | Fehlzuordnung (Score veraltet; Rückstoß wirkungslos) |
| pa_076 | Portalring | elemental | -0.47 | -0.07 | -0.34 | -0.04 | 0.30 | 0.30 | 31.5 | 31.5 | common | Fehlzuordnung (Score und Kategorie; Dublette zu Kosmisches Portal) |
| pa_077 | Schwarzes Loch | elemental | 0.94 | -0.07 | -0.83 | 0.73 | 0.53 | 0.53 | 142.02 | 142.02 | epic | ok |
| pa_078 | Voodoopuppe | elemental | -0.37 | -0.07 | -0.34 | -0.55 | 0.87 | 0.87 | 40.5 | 40.5 | common | ok (Wirkung unvollständig) |
| pa_079 | Kosmisches Portal | elemental | -0.63 | -0.07 | -0.34 | -0.04 | 0.22 | 0.22 | 18 | 18 | common | Fehlzuordnung (Score und Kategorie; Dublette zu Portalring) |
| pa_080 | Psionischer Tentakel | elemental | 0.45 | -0.07 | -0.58 | 0.53 | 0.17 | 0.17 | 96.66 | 96.66 | rare | zu schwach (Verdacht, Dublette zu Tornado) |

## 7. Güte des Scorings

Spearman-Rangkorrelation (mittlere Ränge bei Gleichstand) von `powerScore` gegen den Mittelwert der Felder a bis d (Rechnung wie in `melee-utility.md`; Gesamtkatalogwerte unverändert 0,35 / 0,30 ohne `rarity`):

| Menge | n | Spearman rho |
|---|---:|---:|
| Gesamtkatalog | 150 | **0.35** |
| Gesamtkatalog, Feld c ohne `rarity` | 150 | 0.30 |
| elemental (Katalog-`powerScore`) | 20 | **0.12** |
| elemental, `powerScore` mit Fassung-5-Schaden | 20 | 0.28 |
| elemental, Gegenrechnung ps\* (aus Motorfeldern) | 20 | 0.16 |
| elemental, Feld c ohne `rarity` | 20 | -0.01 |
| elemental ohne die beiden Portale (Selbstwirkung) | 18 | -0.04 |

Je Feld (elemental, `powerScore` gegen das einzelne Feld): a Schaden **0.81** (mit F5: 0.75), b Flug -0.53 (-0.49), c Munition/Abklingzeit **-0.85** (-0.71), d Sonderwirkung 0.12 (0.25). Gesamtkatalog: a 0.91, b 0.07, c -0.29, d -0.02.

Gegen den **Gesamtschaden** (Richtwert, 18 Waffen ohne Portale): `powerScore` 0.46, `powerScore` mit F5 0.31, Gegenrechnung ps\* 0.47, Mittel der Felder a bis d -0.21. Der Leistungswert folgt dem Gesamtschaden also mäßig (0.46), das Mittel der Merkmale in dieser Gruppe gar nicht (-0.21).

Einordnung:

- Die niedrige Korrelation (0.12) entsteht nicht durch Streuung der Merkmale, sondern weil in der Gruppe zwei Dinge gegeneinander laufen: Der Leistungswert ist ein Schadens- und Flächenwert (a 0.81), die Felder b und c laufen invers, weil starke Waffen lange Abklingzeit haben (c -0.85, Abschnitt 4.3). Feld b ist praktisch konstant (15 von 20 Waffen -0.07).
- **Rangabweichung** (Rang des powerScore minus Rang des Mittels a bis d, Gesamtkatalog 150; positiv = Leistungswert höher als die Merkmale hergeben): Meteorbrocken +120, Katapult +117, Haubitze +112, Raketenkanone +74, Tentakelgift +71, Feuerdämon +69, Giftwolke +55, Feuerball +54, Voodoopuppe +45, Flammenwerfer +39, Schwarzes Loch +28; Plasmagewehr -29, Tornado -10 (Katalogwert). Die ersten vier sind Radiuswaffen ohne Status: Radius × 0,85 macht 34 bis 43 Punkte ihres Wertes. Gegen den Gesamtschaden liegen dagegen die Status-Waffen zu tief (Abschnitt 4.2): Der Leistungswert wirkt in beide Richtungen schief.
- **Homing 5 → 0,5 (Test):** in elemental ist `homing` überall 0, ohne Wirkung.
- **Zünderwaffen (+15 % Schaden, nur testen):** In elemental gibt es zwei: Giftwolke (Zünder 1 s) und Tentakelgift (Zünder 2 s). Rechnerisch: Giftwolke 18 → 20,7 (Leistungswert 91,62 → 94,05), Tentakelgift 32 → 36,8 (98,01 → 102,33); beide bleiben rare, der Direktschaden wächst um 1,9 bzw. 3,4, der Gift-Tick (Deckel 18) um 0. Im Lauf nicht gemessen (Zünder ist im Messskript ein Messartefakt).

**Passen `powerTier` und `rarity` dazu?** Die Quell-Seltenheit ist bei allen 20 "common" (Block), die Stufen: 4 × common (Wasserwerfer, Portalring, Voodoopuppe, Kosmisches Portal), 2 × uncommon (Flammenwerfer, Plasmagewehr), 12 × rare, 2 × epic (Meteorbrocken, Schwarzes Loch). Mit Fassung-5-Schaden wechselt der Wasserwerfer von common nach uncommon (57,2). Der Katalog zeigt für die Gesamtmenge: mittlerer powerScore common 30.8, uncommon 60.9, rare 100.2, epic 147.0 bei einem mittleren Mittel a bis d von -0.07, -0.04, 0.09, 0.24; innerhalb der Gruppe ist die Stufe also vor allem eine Radius- und Schadensstufe. Die Stufe rare (80 bis 129) umfasst Waffen mit 30,8 bis 85,6 Gesamtschaden (Psionischer Tentakel 30,8 und Verderbnissiegel 33,6 gegen Tentakelgift 76,4 und Feuerdämon 85,6).


**Zehn Waffen mit Fassung-5-Schaden ungleich Katalog** (Gesamtkatalog, `WAFFEN_F5_WERTE`; der Katalog-`powerScore` rechnet mit der linken Zahl): pa_026 18 → 36, pa_041 22 → 48, pa_055 65 → 42, pa_059 66 → 41, pa_063 18 → 32, pa_071 42 → 55, pa_075 18 → 45, pa_097 38 → 30, pa_104 56 → 45, pa_140 60 → 47. Hier betrifft es drei Waffen (pa_063, pa_071, pa_075); die übrigen sieben gehören anderen Gruppen und sind in deren Auslesen vermutlich nicht berücksichtigt (nicht geprüft).


## 8. Sofort umsetzbar und Entscheidungsbedarf

### Sofort umsetzbar (im Spiel unverändert oder praktisch unverändert: Leistungswert, Stufe, Text)

- Änderungen am Katalog laufen über `project_armageddon_weapons_v1.json` und `npm run weapons:build`, danach `npm test` und `npm run check:docs` (Prüfsummen, Invarianten).
- Portalring und Kosmisches Portal: `damage` 35 → 0 und 20 → 0 (Selbstwirkung; Leistungswert 31,5 → 0 und 18 → 0).
- Leistungswert für Wasserwerfer (32), Eisschlag (55), Tornado (45) mit dem Fassung-5-Schaden neu rechnen: 43,2 → 57,2 (Stufe common → uncommon), 97,88 → 109,58, 82,4 → 106,7. Oder die F5-Werte in den Katalog übernehmen (`BALANCE_KORREKTUREN`).
- Elementarwerte über dem Deckel (nur Leistungswert, Spiel unverändert): Giftwolke Gift 45 → 36 (91,62 → 87,57), Tentakelgift 55 → 36 (98,01 → 89,46); Flammenwerfer Feuer 45 → 39 (Brand bleibt 16).
- Rückstoß der Zug-Waffen (Tornado 88, Schwarzes Loch 80, Psionischer Tentakel 60) auf 0: im Spiel nur wirksam, wenn der Zug blockiert ist.
- Texte: Eisschlag ("friert ein" → "verlangsamt, ein zweiter Treffer betäubt"), Meteorbrocken ("glühend"), Feuerdämon ("beschworen").

### Braucht Entscheidung

- **Strike-Vorstrahl** (`resolveStrike` ruft `resolveHitscan` mit Schaden auf): Vorstrahl schadenfrei machen (Motoränderung, Replay-Fassung, betrifft 7 Waffen mit Anflugart `sky`/`flank`: pa_039, 065, 066, 113, 134, 135, 139) oder die Katalogwerte von Meteorbrocken (74 → 52) und Haubitze (56 → 40) senken. Ob der Vorstrahl auch eigene Teammitglieder trifft (`shooterId` ist null), habe ich nicht geprüft.
- **Eisschlag:** Einfrieren (2 Züge Aussetzen) wie in Fassung 1 umsetzen oder Elementarwert 50 → 30 und Beschreibung ändern.
- **Preis der Elementarpunkte** differenzieren (Brand ≈ 1,2, Gift ≈ 1,5, Fluch ≈ 0,7, Eis 0 Schaden je Punkt) oder den Leistungswert für Status-Waffen auf Gesamtschaden umstellen; Abklingzeit 1 bis 3 staffeln statt eines Faktors 0,9.
- Flammenwerfer (Feuer 45 → 30), Plasmagewehr (54 → 46), Verderbnissiegel (28 → 34), Psionischer Tentakel (Abklingzeit 2 → 1), Wasserwerfer (Gelände 42 → 20): Zahlen in Abschnitt 5; alle Teststufen.
- **Portale:** zusammenführen oder unterscheiden; Kategorie `elemental` ist für Selbstwirkungen unpassend (Audit E4 Punkt 5, Balanceänderung).
- Zünderwaffen +15 %: in dieser Gruppe zwei Waffen, rechnerisch ohne Stufenwechsel (Abschnitt 7).

## 9. Grenzen dieser Auslese

- Die Messung ist nur ein Hügel-Preset mit drei Seeds und grober Entfernungsreihe; sie misst Fassung 1 der Schadensarten (Skript-Voreinstellung). Gesamtschaden und Ticks stammen aus einem eigenen Lauf in Fassung 2 mit Scout-Schütze und einem Gegner; Heilung, Nässe, Biomzuschläge und die 20-%-Grenze greifen dort nicht oder nicht immer (Gegner 104 Lebenspunkte, Ticks bis 18).
- "zu stark/zu schwach (Verdacht)" stützt sich auf gelesenen Code und Rechnung, nicht auf Spielversuche. Die Strike-Doppeltreffer sind in der Ereignisfolge des Messaufbaus belegt (Seed 4242 + Index × 977, 150 px), nicht im Spiel gegen echte Gegner und nicht gegen Teamkameraden.
- Messwert und Katalog weichen bei Wurfwaffen um Klassenfaktor 0,7, Radiusabfall (mindestens 0,25) und erste Ticks ab; die Zerlegung ist je Waffe nur dort belegt, wo sie im Abschnitt 5 steht (Flammenwerfer, Meteorbrocken, Haubitze, Plasmagewehr).
- z-Werte hängen an den Festlegungen der Vorlage (Gleichgewichtung, Richtung von `gravityScale` und `delivery`, `rarity` in Feld c). Der Gesamtschaden-Richtwert (Abschnitt 2, Zusatz 4) ist meine Festlegung.
- Die Wirkung `fire_entity` ("Beschworener Feuerdämon"), `continuous_stream`, `catapult`, `meteor_impact`, `artillery`, `plasma`, `launcher`, `fireball`, `curse`/`linked_damage` hat entweder keine Motorwirkung oder wird aus dem Elementarwert abgeleitet; ob das gewollt ist, entscheidet die Designdatei, nicht diese Auslese.

