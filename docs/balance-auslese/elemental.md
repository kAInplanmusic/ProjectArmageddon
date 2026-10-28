# Balance-Auslese: elemental (2026-10-28)

Stand: Katalog `src/shared/config/weapons.js` (150 Waffen, Katalog = Fassung 4, Standard im Motor = Fassung 5), Auswertung am Arbeitsstand von `main` (Commit 4dd6167). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Rechenskripte lagen im Scratchpad; alle Zahlen sind daraus abgeleitet. Methode und z-Festlegungen sind die der Auslese `melee-utility.md` (Abschnitt 2 dort); die Nachrechnung hat deren Zahlen für Baseballschläger bis auf die zweite Stelle reproduziert (z-Werte der Felder a bis d und z_scoring, Spearman 0,35 im Gesamtkatalog).

Gruppe: Kategorie `elemental` (20 Waffen, pa_061 bis pa_080). **Alle 20 wurden einzeln beurteilt** (Abschnitt 5).

> Zwischenstand (Teilergebnis 1): Merkmalsstatistik, Methode, Listen je Themenfeld, Matrix und CSV. Die Einzelbeurteilung, die Untersuchung von Schadensart, Brand, Frost, Gift und Gelände und die Scoring-Güte folgen im nächsten Stand.

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

## 5. Tabellenmatrix Waffe × Themenfeld

z-Werte gegen den Gesamtkatalog. z_scoring = z(powerScore) − z(Mittel a bis d) mit dem Katalog-`powerScore`; die Spalte "z_scoring (F5)" setzt den Leistungswert nach Fassung 5 ein (nur Wasserwerfer, Eisschlag, Tornado ändern sich). CSV mit denselben Daten: `docs/balance-auslese/elemental.csv`.

| id | Waffe | Kat. | z_schaden | z_flug | z_munition | z_sonder | z_scoring | z_scoring (F5) | powerScore | ps (F5) | Stufe | Urteil |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| pa_061 | Feuerdämon | elemental | 0.54 | -0.07 | -0.83 | 0.07 | 1.12 | 1.12 | 113.76 | 113.76 | rare | folgt |
| pa_062 | Flammenwerfer | elemental | -0.33 | -0.07 | -0.34 | 0.18 | 0.50 | 0.50 | 63.45 | 63.45 | uncommon | folgt |
| pa_063 | Wasserwerfer | elemental | -0.15 | -0.07 | -0.09 | -0.04 | -0.08 | 0.17 | 43.2 | 57.2 | common | folgt |
| pa_064 | Katapult | elemental | 0.67 | -0.54 | -0.83 | -0.55 | 2.01 | 2.01 | 108.72 | 108.72 | rare | folgt |
| pa_065 | Meteorbrocken | elemental | 1.35 | -0.91 | -0.83 | -0.55 | 2.29 | 2.29 | 142.65 | 142.65 | epic | folgt |
| pa_066 | Haubitze | elemental | 0.55 | -0.60 | -0.83 | -0.55 | 2.01 | 2.01 | 97.92 | 97.92 | rare | folgt |
| pa_067 | Säurekanone | elemental | 0.25 | -0.07 | -0.58 | 0.41 | 0.28 | 0.28 | 83.97 | 83.97 | rare | folgt |
| pa_068 | Plasmagewehr | elemental | 0.75 | 0.45 | -0.34 | -0.55 | -0.61 | -0.61 | 51.3 | 51.3 | uncommon | folgt |
| pa_069 | Raketenkanone | elemental | 0.48 | -0.07 | -0.58 | -0.55 | 1.16 | 1.16 | 91.8 | 91.8 | rare | folgt |
| pa_070 | Giftwolke | elemental | 0.23 | -0.07 | -1.29 | 0.69 | 0.88 | 0.88 | 91.62 | 91.62 | rare | folgt |
| pa_071 | Eisschlag | elemental | 0.30 | -0.07 | -0.58 | 0.77 | 0.11 | 0.32 | 97.88 | 109.58 | rare | folgt |
| pa_072 | Feuerball | elemental | 0.35 | -0.07 | -0.58 | -0.06 | 0.83 | 0.83 | 93.51 | 93.51 | rare | folgt |
| pa_073 | Tentakelgift | elemental | 0.27 | -0.07 | -1.54 | 0.85 | 1.04 | 1.04 | 98.01 | 98.01 | rare | folgt |
| pa_074 | Verderbnissiegel | elemental | 0.24 | -0.07 | -0.34 | 0.28 | 0.10 | 0.10 | 80.19 | 80.19 | rare | folgt |
| pa_075 | Tornado | elemental | 0.25 | -0.07 | -0.34 | 0.80 | -0.41 | 0.02 | 82.4 | 106.7 | rare | folgt |
| pa_076 | Portalring | elemental | -0.47 | -0.07 | -0.34 | -0.04 | 0.30 | 0.30 | 31.5 | 31.5 | common | folgt |
| pa_077 | Schwarzes Loch | elemental | 0.94 | -0.07 | -0.83 | 0.73 | 0.53 | 0.53 | 142.02 | 142.02 | epic | folgt |
| pa_078 | Voodoopuppe | elemental | -0.37 | -0.07 | -0.34 | -0.55 | 0.87 | 0.87 | 40.5 | 40.5 | common | folgt |
| pa_079 | Kosmisches Portal | elemental | -0.63 | -0.07 | -0.34 | -0.04 | 0.22 | 0.22 | 18 | 18 | common | folgt |
| pa_080 | Psionischer Tentakel | elemental | 0.45 | -0.07 | -0.58 | 0.53 | 0.17 | 0.17 | 96.66 | 96.66 | rare | folgt |

