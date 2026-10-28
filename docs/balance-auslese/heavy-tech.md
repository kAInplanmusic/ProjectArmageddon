# Balance-Auslese: heavy_ranged + tech (2026-10-28)

Stand: Katalog `src/shared/config/weapons.js` (150 Waffen, Katalog = Fassung 4), Spielwerte der Fassung 5 aus `src/shared/config/waffen-fassung.js`, Auswertung am Arbeitsstand von `main` (Commit 9a23325). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Rechen- und Messskripte lagen im Scratchpad (Methode in Abschnitt 2); alle Zahlen sind daraus abgeleitet. Das Gegenstück zu dieser Datei ist `melee-utility.md` (gleiche Struktur und z-Festlegungen, nachgerechnet gegen dessen CSV), dazu `ranged-ultimate.md`. Der Zündertest steht in `zuender-test.md`.

Gruppe: Kategorien `heavy_ranged` (20 Waffen, pa_041 bis pa_060) und `tech` (20 Waffen, pa_121 bis pa_140). Das sind 40 Waffen; **alle 40 wurden einzeln beurteilt**: Bei 20 Waffen je Kategorie decken "die 15 besten plus die 15 Ausreißer" je Themenfeld die Kategorie vollständig ab (geprüft: Vereinigung der Listen = 40 Waffen).

## 0. Kurzbefund

- **40 von 40 Waffen einzeln beurteilt.** Urteile nach dem ersten Wort der Urteilsspalte: Fehlzuordnung 13, zu stark 6, zu schwach 7, ok 12, Messartefakt 2.
- **Rangkorrelation Spearman powerScore gegen Mittel a bis d: 0,35 im Gesamtkatalog, 0,45 in dieser Gruppe** (heavy_ranged 0,11, tech 0,84); gegen Feld a allein 0,89 in der Gruppe. Das Scoring bildet Schaden und Fläche ab. In `tech` ordnen Score und Merkmale fast gleich (Strahlwaffen mit Radius oben, Selbstwirkungen unten), aber nach Feldern, die zum Teil nicht wirken (siehe unten); in `heavy_ranged` ordnet der Score die Zünderwaffen weit über dem, was Merkmale und Wirkung ergeben.
- **Leistungswert zählt Felder, die der Motor nicht auswertet.** Strahlwaffen (`delivery` hitscan) wenden nur Schaden und Zielwirkung an (`#resolveHitscan`); Radius, aoe, Rückstoß, Gelände und `strikeStyle` (sky, flank) sind wirkungslos, weil `fire()` Strahlwaffen vor `resolveStrike` verlässt (`shooting.js` Zeile 239 gegen 250). Neun Waffen der Gruppe wechseln die Stufe, wenn man nur Motorfelder zählt: Raketenfaust, Tesla-Turm, Alte Dame, Luftangriff, Meteorregen, Arkanhammer rare → uncommon; Magnetkanone rare → common; Bohrkopfrakete epic → uncommon; Höllenkanone epic → rare.
- **Acht Selbstwirkungen in `tech` tragen Schaden im Score, der nie anfällt** (Endlosschleife, Wachgeschütz, Nachschubkiste, Bunker, Teleportplattform, Hologrammportal, Tarnnetz, Schlauchboot; ps 31,9 bis 42,9 gegen ps* 0). Sie sind zugleich Dubletten: 3 Wirkungen für 8 Waffen (Munition +3 zweimal, Rüstung −30 % zweimal, Versetzung 60 px dreimal; Wachgeschütz eigen).
- **Zünderwaffen wirken kaum (Befund aus dem Zündertest).** Eine armierte Granate sinkt je Takt etwa 0,3 px und explodiert je nach Zünderdauer (1 bis 5 s) 11 bis 82 px unter dem Aufprallpunkt; vier der Gruppe (Splittergranate, Handgranate, Bananengranate, Roboterbombe; dazu die Wassermelone aus ultimate) liegen dann außerhalb ihres eigenen Radius. Details und Gegenprobe: `zuender-test.md`.
- **Katalog und Spielwerte weichen bei 4 Waffen der Gruppe ab** (Fassung 5, `WAFFEN_F5_WERTE`): Salvengeber `damage` 22 → 48, Fernbüchse 65 → 42, Armbrust 66 → 41, Quantenkanone 60 → 47. Score, Stufe und z-Werte stehen auf den Katalogwerten (wie in den anderen Auslesen); die Unterschiede sind in Abschnitt 2 gerechnet.
- **Zielsuche (`homing`) verzerrt zwei Stufen:** Phönixschlag (287,87) und Fliegendes Superschaf (463,82) sind `legendary`, gemessen ein Schaden der Stufen uncommon bis rare (58,2 und 48,3); mit dem beschlossenen Gewicht 0,5 wären beide epic (146,12 und 151,97).
- **Messartefakte der Messung:** Tesla-Turm und Arkanhammer (`requiresLineOfSight`) werden am Hügel abgelehnt (belegt mit Einzelschüssen: "verlangt freie Sicht"); `waffen-balance` meldet den Tesla-Turm deshalb als Ausreißer "ohne Schaden". Selbstwirkungen messen 0.

## 1. Mittelwert und Standardabweichung je Merkmal

| Merkmal | heavy_ranged Mittel | heavy_ranged SD | tech Mittel | tech SD | gesamt Mittel | gesamt SD |
|---|---:|---:|---:|---:|---:|---:|
| damage | 48.65 | 12.17 | 46.90 | 15.08 | 41.75 | 19.28 |
| blastRadius | 12.00 | 19.43 | 23.65 | 24.71 | 18.28 | 24.94 |
| knockback | 26.30 | 8.97 | 19.90 | 35.13 | 19.94 | 25.95 |
| terrainDamage | 1.90 | 5.71 | 4.25 | 14.60 | 4.87 | 16.77 |
| homing | 1.75 | 7.63 | 3.50 | 15.26 | 0.70 | 6.35 |
| piercing | 0.10 | 0.30 | 0.05 | 0.22 | 0.04 | 0.20 |
| maxAmmo | 3.10 | 0.70 | 5.00 | 0.00 | 4.09 | 1.08 |
| cooldown | 1.60 | 0.66 | 1.20 | 1.12 | 1.23 | 1.00 |
| fuseTime | 0.65 | 1.15 | 0.00 | 0.00 | 0.19 | 0.74 |
| maxRange | 677.65 | 230.05 | 637.15 | 252.70 | 500.54 | 227.07 |
| projectileSpeed (alle, Strahl = 0) | 76.85 | 14.05 | 12.00 | 30.59 | 42.04 | 34.58 |
| gravityScale (alle) | 1.02 | 0.08 | 1.00 | 0.00 | 1.03 | 0.08 |
| bounces (alle) | 0.30 | 0.64 | 0.00 | 0.00 | 0.19 | 0.49 |
| powerScore | 70.86 | 53.24 | 98.06 | 93.72 | 71.48 | 56.80 |
| elemental (Summe) | 3.35 | 10.06 | 5.15 | 12.84 | 6.11 | 15.40 |
| Anteil mit Motorwirkung (`effectFor(special)`) | 0.05 | – | 0.55 | – | 0.43 | – |
| Anteil aoe | 0.30 | – | 0.50 | – | 0.37 | – |
| Anteil Strahlwaffen (delivery hitscan) | 0.00 | – | 0.85 | – | 0.36 | – |
| Anteil mit fuseTime > 0 | 0.25 | – | 0.00 | – | 0.07 | – |

Nur Projektilwaffen (Strahlwaffen haben `projectileSpeed` 0 und `gravityScale` 1 als Platzhalter): heavy_ranged n=20: Tempo 76.85 (SD 14.05); gesamt n=96: Tempo 65.68 (SD 17.74), gravityScale 1.04, bounces 0.30. tech hat 3 Projektilwaffen (Wachgeschütz, Fliegendes Superschaf, Quantenkanone), 17 Strahlwaffen.

Lesehinweise (aus der Tabelle belegt):

- heavy_ranged ist einheitlich gebaut: alle 20 sind Projektilwaffen, Munition 3 (Ausnahmen: Präzisionsgewehr 2, Salvengeber 6), Pause 0 bis 3, `rarity` überall `common` (im Katalog nach Nummer vergeben, nicht nach Stärke). Die Streuung liegt in Schaden (SD 12.17), Radius (SD 19.43) und Flug; 5 von 20 tragen einen Zünder (fuseTime 0.65 im Mittel).
- tech ist bimodal: 8 Selbstwirkungen mit Schaden 27 bis 38 (nie wirksam) und 12 Angriffe mit Schaden 33 bis 68; Munition überall 5, `rarity` überall `rare`. 17 von 20 sind Strahlwaffen, deshalb ist das Tempo-Mittel (12.00) kein Flugwert.
- Das Kategoriemittel von powerScore ist in heavy_ranged 70.86, in tech 98.06 (SD 93.72, getrieben von zwei homing-Waffen), der Katalog liegt bei 71.48 (SD 56.80).

## 2. Methode

**Referenz der z-Werte: Gesamtkatalog (150 Waffen), Grundgesamtheit (n).** Je Merkmal z = (Wert − Mittel) / SD. Ein Themenfeld-z ist der ungewichtete Mittelwert der z-Werte seiner Merkmale. Die Festlegungen sind die aus `melee-utility.md` (die Formel wurde gegen dessen CSV nachgerechnet: Baseballschläger, Feuerfaust, Enterhaken, Energiefaust stimmen in allen fünf Feldern auf zwei Stellen, ebenso der Gesamt-Spearman 0,35).

| Feld | Merkmale (Richtung: höher = stärker) | Festlegungen |
|---|---|---|
| a Schaden | damage, blastRadius, terrainDamage, aoe (0/1), piercing | keine |
| b Flug | projectileSpeed, gravityScale (negiert), bounces, maxRange, homing, delivery (Strahl = 1) | Tempo, Schwerkraft und Abpraller nur für Projektilwaffen (n=96) gerechnet, bei Strahlwaffen entfallen sie. Richtung von gravityScale und delivery ist eine Annahme (flach = leichter zu zielen; Strahl = trifft sicher). |
| c Munition | maxAmmo, cooldown (negiert), fuseTime > 0 (negiert), rarity (common 0, uncommon 1, rare 2) | `rarity` ist die Quell-Seltenheit und kein Merkmal der Stärke: heavy_ranged ist ganz `common` (mittleres z_munition −0.70, ohne rarity −0.65), tech ganz `rare` (+0.71, ohne rarity +0.38). Das hebt z_munition in tech und senkt es in heavy_ranged unabhängig von der Waffe. |
| d Sonderwirkung | special (1, wenn `effectFor(special)` im Motor eine Wirkung liefert), effectMagnitude (null = 0), elemental (Summe), knockback | Phönixschlag, Fliegendes Superschaf und Höllenkanone bekommen ihre Brandwirkung über `elementalEffectFor` (kein `special`-Eintrag); das Feld d erfasst sie nur über den Elementarwert. |
| e Scoring | z(powerScore) − z(Mittel der Felder a bis d) | Positiv: Leistungswert höher als das, was die Merkmale ergeben. |

Messung: `scripts/waffen-balance.mjs` (`messeWaffe`, exportiert), Ziel steht still, Entfernungen 40/90/150/300/500/800/1200/1700 px, `hills`. **Drei Karten-Seeds** je Waffe (Seed = 4242 + (index + Versatz) × 977, Versatz 0, 1000, 2000). `schaden` ist der Bestwert pro Schuss, `Reichweite` die größte Entfernung mit mindestens 25 % des Bestwerts. Der Schütze der Messung ist ein Späher (Schadensfaktor 0,7: Fernbüchse mit Fassung-5-Schaden 42 × 0,7 = 29,4 als Durchschlagstreffer, gemessen 29,4); Strahlwaffen erhalten den Klassenfaktor nicht. Die Messung nutzt die Fassung-5-Werte (`getWaffe`), die z-Werte den Katalog.

Direktwaffen ohne Radius (Revolver, Gatlingkanone, Wurfklingen, ...) messen 0,59 bis 0,67 von Schaden × 0,7. Das passt zum Abfall `max(0,25; 1 − Abstand/Radius)` im Aufschlag (`#explode`) bei Mindestradius 24 (`blastRadius || 24` in `shooting.js`, aus dem Code gelesen) und rund 8 px Abstand zur Figurenmitte; der Abstand selbst ist nicht gemessen. Durchschlagwaffen (Fernbüchse, Armbrust, Quantenkanone) treffen zweimal: Durchschlagstreffer ohne Abfall plus Aufschlag im Gelände dahinter (Ereignisse je eines Schusses: 29,4 + 16,6 und 32,9 + 19,8).

Gegenrechnung "Leistungswert nur aus Motorfeldern" (`ps*`): gleiche Formel wie `computePowerScore`, aber Felder, die der Motor nach meiner Lektüre für diese Waffe nicht auswertet, werden 0 gesetzt: bei Strahlwaffen `blastRadius`, `aoe`, `knockback`, `terrainDamage`, `bounces` (auch beim Tesla-Turm: die Kette nutzt feste Sprünge von 240 px, nicht den Radius); bei Selbstwirkungen der ganze Wert (beim Wachgeschütz zählt der Katalogschaden mittelbar, siehe dessen Urteil). Das ist eine Rechnung zur Einordnung, kein Vorschlag für die Formel.

**Katalog gegen Spielwerte (Fassung 5).** `getWaffe(id, 5)` legt `WAFFEN_F5_WERTE` über den Katalog. In dieser Gruppe betrifft das vier Waffen (im ganzen Katalog zehn, die übrigen sechs in ranged, elemental, magic). Mit den Spielwerten gerechnet: Salvengeber ps 68,26 → 98,16 (uncommon → rare), Fernbüchse 63,78 → 44,12 (uncommon, bleibt), Armbrust 64,64 → 43,26 (uncommon → common), Quantenkanone 62,07 → 49,85 (uncommon, bleibt). Der Spearman der Gruppe bleibt 0,45 (heavy_ranged 0,11 → −0,03, Gesamt 0,35 → 0,36). Stufe und Beute lesen aber den Katalog (`pickWeaponForRarity` liest `powerTier` ohne Fassung, laut Audit E4).

## 3. Beste und Ausreißer je Themenfeld und Kategorie

"Beste" = höchste z-Werte, "Ausreißer" = größte |z|; jeweils 15 Waffen je Kategorie (20 Waffen). Die Zahl hinter dem Namen ist der z-Wert (Referenz Gesamtkatalog). Feld c in tech ist wegen gleicher Munition (5) und gleicher `rarity` (rare) bei vielen Waffen gleich; dort entscheidet die Katalogreihenfolge.

### Schwere Fernkampfwaffen (heavy_ranged, 20)

**a Schaden und Zerstörung**

- Beste (15): Armbrust 0.87; Fernbüchse 0.86; Phönixschlag 0.70; Roboterbombe 0.48; Bananengranate 0.38; Splittergranate 0.35; Molotowcocktail 0.29; Salvengeber 0.15; Präzisionsgewehr -0.02; Handgranate -0.20; Doppelkopfaxt -0.22; Feuerwerkssalve -0.23; Raketensalve -0.25; Wurfklingen -0.29; Kampfgeschütz -0.31
- Ausreißer (15): Armbrust 0.87; Fernbüchse 0.86; Phönixschlag 0.70; Bumerang -0.52; Roboterbombe 0.48; Gatlingkanone -0.48; Revolver -0.44; Kampfbogen -0.40; Bananengranate 0.38; Schrotflinte -0.38; Splittergranate 0.35; Kampfgeschütz -0.31; Wurfklingen -0.29; Molotowcocktail 0.29; Raketensalve -0.25

**b Flug, Reichweite, Zielen**

- Beste (15): Phönixschlag 0.85; Präzisionsgewehr 0.58; Fernbüchse 0.54; Bananengranate 0.51; Gatlingkanone 0.49; Wurfklingen 0.47; Salvengeber 0.40; Revolver 0.40; Kampfgeschütz 0.33; Bumerang 0.25; Raketensalve 0.22; Schrotflinte 0.18; Splittergranate -0.07; Molotowcocktail -0.07; Roboterbombe -0.07
- Ausreißer (15): Phönixschlag 0.85; Präzisionsgewehr 0.58; Doppelkopfaxt -0.57; Fernbüchse 0.54; Bananengranate 0.51; Gatlingkanone 0.49; Wurfklingen 0.47; Salvengeber 0.40; Revolver 0.40; Kampfgeschütz 0.33; Armbrust -0.30; Bumerang 0.25; Raketensalve 0.22; Feuerwerkssalve -0.22; Schrotflinte 0.18

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (15): Salvengeber 0.61; Kampfgeschütz -0.34; Bumerang -0.34; Wurfklingen -0.34; Schrotflinte -0.34; Revolver -0.34; Kampfbogen -0.34; Gatlingkanone -0.34; Feuerwerkssalve -0.58; Raketensalve -0.58; Doppelkopfaxt -0.58; Fernbüchse -0.58; Armbrust -0.58; Präzisionsgewehr -0.82; Phönixschlag -0.83
- Ausreißer (15): Splittergranate -1.54; Handgranate -1.54; Bananengranate -1.54; Molotowcocktail -1.54; Roboterbombe -1.54; Phönixschlag -0.83; Präzisionsgewehr -0.82; Salvengeber 0.61; Feuerwerkssalve -0.58; Raketensalve -0.58; Doppelkopfaxt -0.58; Fernbüchse -0.58; Armbrust -0.58; Kampfgeschütz -0.34; Bumerang -0.34

**d Sonderwirkung und Status**

- Beste (15): Molotowcocktail 0.76; Phönixschlag 0.31; Doppelkopfaxt -0.16; Kampfgeschütz -0.20; Splittergranate -0.26; Bananengranate -0.26; Bumerang -0.26; Roboterbombe -0.26; Schrotflinte -0.26; Fernbüchse -0.26; Revolver -0.26; Kampfbogen -0.26; Armbrust -0.26; Gatlingkanone -0.26; Handgranate -0.28
- Ausreißer (15): Molotowcocktail 0.76; Wurfklingen -0.49; Salvengeber -0.47; Feuerwerkssalve -0.43; Präzisionsgewehr -0.43; Raketensalve -0.32; Phönixschlag 0.31; Handgranate -0.28; Splittergranate -0.26; Bananengranate -0.26; Bumerang -0.26; Roboterbombe -0.26; Schrotflinte -0.26; Fernbüchse -0.26; Revolver -0.26

**e Scoring (Residuum)**

- Beste (15): Phönixschlag 2.83; Handgranate 2.16; Roboterbombe 1.91; Splittergranate 1.84; Doppelkopfaxt 1.45; Bananengranate 1.36; Feuerwerkssalve 1.25; Molotowcocktail 1.02; Raketensalve 0.69; Kampfbogen 0.65; Präzisionsgewehr 0.55; Schrotflinte 0.38; Wurfklingen 0.31; Bumerang 0.27; Armbrust 0.22
- Ausreißer (15): Phönixschlag 2.83; Handgranate 2.16; Roboterbombe 1.91; Splittergranate 1.84; Doppelkopfaxt 1.45; Bananengranate 1.36; Feuerwerkssalve 1.25; Molotowcocktail 1.02; Raketensalve 0.69; Salvengeber -0.69; Kampfbogen 0.65; Fernbüchse -0.64; Präzisionsgewehr 0.55; Schrotflinte 0.38; Wurfklingen 0.31

### Technik (tech, 20)

**a Schaden und Zerstörung**

- Beste (15): Bohrkopfrakete 1.40; Quantenkanone 0.81; Höllenkanone 0.75; Luftangriff 0.74; Meteorregen 0.73; Arkanhammer 0.65; Fliegendes Superschaf 0.52; Tesla-Turm 0.50; Raketenfaust 0.46; Alte Dame 0.39; Magnetkanone 0.36; Bunker -0.31; Wachgeschütz -0.44; Teleportplattform -0.48; Tarnnetz -0.49
- Ausreißer (15): Bohrkopfrakete 1.40; Quantenkanone 0.81; Höllenkanone 0.75; Luftangriff 0.74; Meteorregen 0.73; Arkanhammer 0.65; Schlauchboot -0.53; Fliegendes Superschaf 0.52; Hologrammportal -0.52; Nachschubkiste -0.51; Endlosschleife -0.50; Tesla-Turm 0.50; Tarnnetz -0.49; Flammenklinge -0.49; Teleportplattform -0.48

**b Flug, Reichweite, Zielen**

- Beste (15): Fliegendes Superschaf 1.23; Meteorregen 1.00; Arkanhammer 1.00; Höllenkanone 1.00; Bohrkopfrakete 0.93; Luftangriff 0.89; Raketenfaust 0.81; Alte Dame 0.75; Tesla-Turm 0.61; Wachgeschütz 0.58; Quantenkanone 0.58; Magnetkanone 0.46; Teleportplattform 0.34; Tarnnetz 0.32; Flammenklinge 0.32
- Ausreißer (15): Fliegendes Superschaf 1.23; Meteorregen 1.00; Arkanhammer 1.00; Höllenkanone 1.00; Bohrkopfrakete 0.93; Luftangriff 0.89; Raketenfaust 0.81; Alte Dame 0.75; Tesla-Turm 0.61; Wachgeschütz 0.58; Quantenkanone 0.58; Magnetkanone 0.46; Teleportplattform 0.34; Tarnnetz 0.32; Flammenklinge 0.32

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (15): Endlosschleife 1.01; Wachgeschütz 1.01; Nachschubkiste 1.01; Bunker 1.01; Teleportplattform 1.01; Hologrammportal 1.01; Tarnnetz 1.01; Schlauchboot 1.01; Magnetkanone 0.76; Flammenklinge 0.76; Quantenkanone 0.76; Raketenfaust 0.51; Tesla-Turm 0.51; Alte Dame 0.51; Fliegendes Superschaf 0.51
- Ausreißer (15): Endlosschleife 1.01; Wachgeschütz 1.01; Nachschubkiste 1.01; Bunker 1.01; Teleportplattform 1.01; Hologrammportal 1.01; Tarnnetz 1.01; Schlauchboot 1.01; Magnetkanone 0.76; Flammenklinge 0.76; Quantenkanone 0.76; Raketenfaust 0.51; Tesla-Turm 0.51; Alte Dame 0.51; Fliegendes Superschaf 0.51

**d Sonderwirkung und Status**

- Beste (15): Flammenklinge 0.97; Magnetkanone 0.87; Raketenfaust 0.30; Alte Dame 0.24; Höllenkanone 0.23; Arkanhammer 0.20; Endlosschleife -0.04; Wachgeschütz -0.04; Nachschubkiste -0.04; Bunker -0.04; Teleportplattform -0.04; Hologrammportal -0.04; Tesla-Turm -0.04; Tarnnetz -0.04; Schlauchboot -0.04
- Ausreißer (15): Flammenklinge 0.97; Magnetkanone 0.87; Luftangriff -0.55; Meteorregen -0.55; Bohrkopfrakete -0.55; Quantenkanone -0.55; Raketenfaust 0.30; Alte Dame 0.24; Höllenkanone 0.23; Arkanhammer 0.20; Fliegendes Superschaf -0.14; Endlosschleife -0.04; Wachgeschütz -0.04; Nachschubkiste -0.04; Bunker -0.04

**e Scoring (Residuum)**

- Beste (15): Fliegendes Superschaf 4.80; Luftangriff -0.32; Meteorregen -0.46; Höllenkanone -0.82; Bohrkopfrakete -0.83; Tesla-Turm -1.08; Bunker -1.31; Schlauchboot -1.32; Hologrammportal -1.33; Nachschubkiste -1.34; Alte Dame -1.35; Endlosschleife -1.36; Tarnnetz -1.37; Teleportplattform -1.38; Raketenfaust -1.40
- Ausreißer (15): Fliegendes Superschaf 4.80; Magnetkanone -1.93; Flammenklinge -1.84; Quantenkanone -1.74; Wachgeschütz -1.59; Arkanhammer -1.50; Raketenfaust -1.40; Teleportplattform -1.38; Tarnnetz -1.37; Endlosschleife -1.36; Alte Dame -1.35; Nachschubkiste -1.34; Hologrammportal -1.33; Schlauchboot -1.32; Bunker -1.31

## 4. Einzelbeurteilung (40 Waffen)

Urteile: ok / zu stark / zu schwach / Fehlzuordnung / Messartefakt. Ein Zusatz in Klammern kennzeichnet, worauf sich das Urteil stützt. "Verdacht" heißt: aus Messung und gelesenem Code gerechnet, nicht im Spiel erprobt. Vorschläge sind Testwerte zur Entscheidung, keine Änderung; "linear gerechnet" heißt Messwert × neuer Schaden / alter Schaden. "Risiko" nennt, was mit einer Umsetzung mitgezogen werden müsste. Wo `special` im Motor keine Wirkung hat, steht das (gelesen in `src/engine/specials.js`, `SPECIAL_EFFECTS`).

Gemessen = Bestwert je Seed (drei Werte, Versatz 0/1000/2000), "Reichw." ebenso je Seed; ps = Katalog-`powerScore`, ps* = Gegenrechnung aus Motorfeldern. Bei Selbstwirkungen ist der Messwert 0 (Messartefakt der Annahme "Schaden am Ziel").

### Schwere Fernkampfwaffen (heavy_ranged, 20)

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_041 | Salvengeber | Schaden 22, Radius 16, Rückst. 8, Mun. 6, CD 0, Reichw. 919, `direct_hit` | 16.1/16.6/16.8; Reichw. 450/300/490 | 68.26 (uncommon) → 68.26 (uncommon) | **ok (Vielschuss-Nische)** | Katalog 22, im Spiel (Fassung 5, `WAFFEN_F5_WERTE`) 48: der Katalogwert ist hier veraltet, z_schaden (0,15) und ps 68,26 beruhen auf 22 (mit 48: ps 98,16, rare; Abschnitt 2). Munition 6 und Pause 0 sind in der Kategorie einmalig (sonst 3 Schuss, 1 bis 3 Züge Pause). Gemessen 16,1/16,6/16,8: 48 × 0,7 = 33,6 mal Abfall bei Radius 16 (rund 0,5; Abfall aus dem Code gelesen); je Zug gerechnet (Pause 0) trägt sie mehr als Kampfgeschütz (23,5 je zwei Züge) und Raketensalve (26 je drei Züge); Magazin 6 × 16,5 = 99 gegen 3 × 23,5 = 70. Das Audit E3 nennt sie mit 0,5 gegen den Stufenmedian; das ist die Dauerfeuer-Rolle, nicht Schwäche. | keine; Katalogwert `damage` 22 auf 48 nachziehen (Fassung 5 ist Standard), damit Score und Stufe stimmen | Stufe uncommon → rare durch Nachziehen; Prüfsummen |
| pa_042 | Feuerwerkssalve | Schaden 58, Radius 0, Rückst. 12, Mun. 3, CD 2, Reichw. 357, `direct_hit` | 24/24.8/25.2; Reichw. 1690/150/150 | 53.5 (uncommon) → 53.5 (uncommon) | **ok (Zwilling der Raketensalve)** | Schaden 58, Tempo 52, Reichweite 357 gegen Raketensalve 56, 74, 674 bei gleicher Munition und Pause; beide `direct_hit` mit gleichem Beschreibungssatz. Gemessen 24,0 bis 25,2 (0,61 × Schaden × 0,7, wie jede Direktwaffe ohne Radius, siehe Abschnitt 0). Der Treffer bei 1690 px in Seed 0 ist ein Zufallstreffer. | keine; Unterscheidung beider Waffen ist eine Entwurfsentscheidung (Abschnitt 7) | – |
| pa_043 | Kampfgeschütz | Schaden 50, Radius 0, Rückst. 36, Mun. 3, CD 1, Reichw. 811, `direct_hit` | 22.6/24.5/23.3; Reichw. 300/430/400 | 48.89 (uncommon) → 48.89 (uncommon) | **ok** | Gemessen 22,6/24,5/23,3 (0,67), Pause 1, Munition 3, ps 48,89 uncommon: passt zur Stufe (Median uncommon 30,4 laut `waffen-balance`). Datenzwilling der Wurfklingen (50/84/811 gegen 52/90/918 bei gleicher Schwerkraft 0,95 und Pause 1). Gemessene Reichweite 300 bis 430 gegen Katalog 811, weil der Schütze der Messung ein Späher ist (Abschussfaktor 0,64). | keine | – |
| pa_044 | Phönixschlag | Schaden 65, Radius 55, Rückst. 30, Mun. 3, CD 3, Reichw. 565, Zielsuche 35, `phoenix_strike` | 58.2/57.6/58.1; Reichw. 300/300/300 | 287.87 (legendary) → 287.87 (legendary) | **zu stark (Score und Wirkung)** | ps 287,87 (legendary, z_scoring +2,83): `homing` 35 × 5 = 175 Punkte, 61 % des Werts. Wirkung: Zielsuche, Radius 55; gemessen 58,2/57,6/58,1 = Treffer 40,1 plus sofortiger Brandtakt 18 (Ereignisse eines Einzelschusses), danach Brand 18 je Zug über `turns` 3 (`elementalEffectFor`, Feuer 35 / 2). Gerechnet je Treffer: etwa 40 + 54 (Späher-Schütze) bis 75 + 54 (Artillerie) gegen Gesundheit 96/156/108. Pause 3 und Munition 3 bremsen, aber ein Treffer, der den halben Lebensvorrat nimmt, ist für diese Stufe viel. | `homing`-Gewicht 5 → 0,5 (beschlossen): ps 146,12, epic; zusätzlich Test `elemental.fire` 35 → 25 (Brand 13 je Zug, ps 283,4 vor der Gewichtsänderung) | Stufe legendary → epic; Brand-Untergrenze 8 gilt für alle Feuerwaffen; Prüfsummen |
| pa_045 | Raketensalve | Schaden 56, Radius 0, Rückst. 24, Mun. 3, CD 2, Reichw. 674, `direct_hit` | 25.6/27.4/25.5; Reichw. 300/300/810 | 52.99 (uncommon) → 52.99 (uncommon) | **ok (Zwilling der Feuerwerkssalve)** | Gemessen 25,6/27,4/25,5 (0,67), Reichweite 300/300/810 (Katalog 674), Pause 2, Munition 3. Nimmt gegenüber der Feuerwerkssalve höheres Tempo und doppelte Reichweite bei 2 Schaden weniger; passt zur Stufe uncommon. | keine | – |
| pa_046 | Splittergranate | Schaden 42, Radius 42, Rückst. 30, Mun. 3, CD 2, Reichw. 565, Zünder 3 s, `fragmentation` | 8.3/7.5/7.4; Reichw. 150/270/300 | 83.97 (rare) → 83.97 (rare) | **zu schwach (Zünder sinkt in den Boden)** | Gemessen 8,3/7,5/7,4 = 0,26 von Schaden × 0,7. Ursache im Motor, gemessen: Eine armierte Granate sinkt je Takt etwa 0,3 px und explodiert nach 3 s rund 44 px tiefer als der Aufprall; der Radius ist 42 px. Ursache nach Lektüre von `projectileSystem.js`: Der Aufprallzweig setzt die Granate jeden Takt neu an den Treffpunkt; eine Kopie, die das bei bereits armierter Granate unterlässt, lässt sie liegen (Gegenprobe). Treffer wirken nur noch am Radiusrand mit der Untergrenze 0,25 × 42 × 0,7 = 7,4. In einer Kopie ohne das Sinken: 25,0 (0,85). Der ps 83,97 (rare, Rangdifferenz +95,5) beschreibt die Wirkung nicht. | nicht den Schaden anheben, sondern den Motor: armierte Zünderwaffe bleibt liegen (zuender-test.md); danach +15 % entbehrlich | Motoränderung verändert alte Replays: Versionsmarke im Replay-Kopf (§2, `config.kit`) |
| pa_047 | Handgranate | Schaden 61, Radius 0, Rückst. 28, Mun. 3, CD 2, Reichw. 313, Zünder 2 s, `direct_hit` | 10.7/10.7/10.7; Reichw. 40/150/150 | 63.32 (uncommon) → 63.32 (uncommon) | **zu schwach (Zünder sinkt; Text sagt „prallt ab“)** | Gemessen konstant 10,7 = Untergrenze 0,25 × 61 × 0,7. Katalogradius 0, der Motor setzt 24 px Mindestradius; Sinktiefe nach 2 s: 36 px, also außerhalb des Radius. Die Beschreibung („prallt ab, bevor sie zündet“) trifft nicht zu: eine Zünderwaffe bleibt beim ersten Aufprall liegen (`fuse_armed`), `bounces` 2 wird nie ausgewertet, zählt im Score aber 6 Punkte. Kopie ohne Sinken: 30,9 (90 px) und 31,7 (150 px), also 0,74 von 61 × 0,7; bei 300 px erreicht die Waffe das Ziel nicht (Katalogreichweite 313, Späher). | Motor wie bei der Splittergranate; Beschreibung auf „bleibt liegen und zündet“ ändern oder Abprallen umsetzen (Entscheidung); `bounces` 2 → 0 (Score ehrlich) | Replay-Marke; Text und Score ohne Risiko |
| pa_048 | Bananengranate | Schaden 46, Radius 40, Rückst. 30, Mun. 3, CD 2, Reichw. 565, Zünder 3 s, `banana_split` | 8/8/8; Reichw. 300/300/300 | 91.44 (rare) → 91.44 (rare) | **zu schwach (Zünder sinkt; Splitter fehlen)** | Gemessen 8,0/8,0/8,0 = 0,25 × 46 × 0,7. Sinktiefe 42 px nach 3 s bei Radius 40 px (außerhalb). `banana_split` hat keine Motorwirkung (nicht in `SPECIAL_EFFECTS`), der Text „zerfällt in Splitter“ stimmt nicht; `bounces` 2 greift nicht. ps 91,44 (rare, Rangdifferenz +81). Kopie ohne Sinken nicht gerechnet. | Motor wie bei der Splittergranate; Text anpassen oder Splitter umsetzen (Entscheidung) | Replay-Marke |
| pa_049 | Bumerang | Schaden 30, Radius 0, Rückst. 30, Mun. 3, CD 1, Reichw. 589, `returning_projectile` | 14.2/13.1/13.3; Reichw. 150/150/300 | 32.94 (common) → 32.94 (common) | **ok** | Gemessen 14,2/13,1/13,3 (0,64 von 30 × 0,7), Reichweite 150/150/300 (Katalog 589); ps 32,94 common. Median common laut Skript 17,8: gemessen 0,75-fach, über der Schwelle 0,5. `returning_projectile` hat keine Motorwirkung (kein Rückflug), der Text verspricht aber keinen. | keine | – |
| pa_050 | Doppelkopfaxt | Schaden 59, Radius 0, Rückst. 40, Mun. 3, CD 2, Reichw. 288, `direct_hit` | 26.3/26.3/25.7; Reichw. 150/150/150 | 60.12 (uncommon) → 60.12 (uncommon) | **ok** | Gemessen 26,3/26,3/25,7 (0,63); Katalogschaden 59 bei der kürzesten Katalogreichweite der Gruppe (288), Schwerkraft 1,25: die Reichweite ist der Preis. Namensnähe zur Nahkampfwaffe Doppelaxt (melee), Verwechslungsgefahr im Menü. | keine (Name prüfen, Audit A1) | – |
| pa_051 | Wurfklingen | Schaden 52, Radius 0, Rückst. 6, Mun. 3, CD 1, Reichw. 918, `direct_hit` | 24/23.4/23.7; Reichw. 300/500/490 | 47.45 (uncommon) → 47.45 (uncommon) | **ok (Datenzwilling des Kampfgeschützes)** | Gemessen 24,0/23,4/23,7 (0,65), Pause 1, Munition 3, Reichweite 300 bis 500 (Katalog 918). ps 47,45 liegt knapp über der Stufengrenze 45; gleiche Tempo-, Schwerkraft- und Munitionswerte wie das Kampfgeschütz, beide ohne eigene Wirkung. | keine | – |
| pa_052 | Molotowcocktail | Schaden 36, Radius 42, Rückst. 30, Mun. 3, CD 2, Reichw. 565, Zünder 2 s, `fire_pool` | 32.8/34.5/34.2; Reichw. 300/300/300 | 92.97 (rare) → 92.97 (rare) | **ok** | Gemessen 32,8/34,5/34,2 (Reichweite 300): Direktteil mit Abfall plus erstem Brandtakt 16. Zünder 2 s, Sinktiefe 27 px bei Radius 42: als einzige Granate der Kategorie wirkt sie, weil der Radius größer ist als die Sinktiefe. Dazu Brand 16 je Zug über 3 Züge (`fire_pool`). Beschreibung („nach kurzer Verzögerung, im Umkreis in Brand“) stimmt mit dem Motor überein. Kopie ohne Sinken: 37,4. | keine | – |
| pa_053 | Roboterbombe | Schaden 52, Radius 45, Rückst. 30, Mun. 3, CD 2, Reichw. 565, Zünder 3 s, `delayed_bot` | 12.4/12.2/9.4; Reichw. 300/300/150 | 95.27 (rare) → 95.27 (rare) | **zu schwach (Zünder sinkt; kein Roboter)** | Gemessen 12,4/12,2/9,4 gegen 52 × 0,7 = 36,4 (0,31). Sinktiefe 46 px nach 3 s bei Radius 45 (außerhalb). `delayed_bot` ohne Motorwirkung: es ist eine Granate, der „Roboter“ fehlt. ps 95,27 (rare), Rangdifferenz +105, die größte der Kategorie; Kopie ohne Sinken nicht gerechnet. | Motor wie bei der Splittergranate; Text/Wirkung „Roboter“ als Entscheidung | Replay-Marke |
| pa_054 | Schrotflinte | Schaden 44, Radius 0, Rückst. 30, Mun. 3, CD 1, Reichw. 747, `spread_shot` | 19.6/18.9/19.6; Reichw. 300/300/300 | 42.84 (common) → 42.84 (common) | **ok (Name verspricht Streuung)** | Gemessen 18,9 bis 19,6 (0,63), Pause 1, Munition 3, common (ps 42,84); `spread_shot` hat keine Motorwirkung: ein Geschoss wie beim Revolver mit höherem Schaden (44 gegen 38). Die Beschreibung („wuchtiger Schuss“) verspricht keine Streuung, der Name schon. | keine; Streuschuss umsetzen oder Namen wählen, der keine Streuung verspricht (Entscheidung) | Streuung wäre Motoränderung (Replay-Marke) |
| pa_055 | Fernbüchse | Schaden 65, Radius 0, Rückst. 30, Mun. 3, CD 2, Reichw. 1031, Durchschlag, `precision` | 45.7/46.4/47.2; Reichw. 500/300/500 | 63.78 (uncommon) → 63.78 (uncommon) | **zu stark (Verdacht, gemessen gegen Stufenmedian)** | Katalog 65, im Spiel (Fassung 5) 42. Gemessen 45,7/46,4/47,2; Ereignisse eines Einzelschusses: Durchschlagstreffer 29,4 (= 42 × 0,7, ohne Abfall) plus Aufschlag im Gelände hinter dem Ziel 16,6, zusammen 46,0. Ein Durchschlag trifft also zweimal; nichtdurchschlagende Direktwaffen erreichen 0,59 bis 0,67 von Schaden × 0,7 (Abfall bei 24-px-Mindestradius, aus dem Code gelesen). Gegen den Median uncommon (30,4) 1,5-fach, unter der Skriptschwelle 2. ps zählt den Durchschlag mit 6 Punkten. | Wert der Fassung 5 `damage` 42 → 34 (gemessen linear ≈ 37,0 = 1,2-fach); Katalogwert 65 gleichzeitig auf den Fassung-5-Wert nachziehen | Prüfsummen; Armbrust und Quantenkanone gleich behandeln; Änderung in `WAFFEN_F5_WERTE` wirkt auf Fassung 5, nicht auf ältere Aufzeichnungen |
| pa_056 | Präzisionsgewehr | Schaden 55, Radius 0, Rückst. 12, Mun. 2, CD 2, Reichw. 1062, `direct_hit` | 25.2/27.7/25; Reichw. 500/560/500 | 58.52 (uncommon) → 58.52 (uncommon) | **zu schwach (von der Fernbüchse dominiert)** | Gemessen 25,2/27,7/25,0 (0,65 von 55 × 0,7), Reichweite 500 bis 560. Munition 2 gegen 3, gleiche Pause 2, kein Durchschlag; Schaden 55 gegen 65 im Katalog (im Spiel Fernbüchse 42 gegen 55 hier). Die Fernbüchse ist in jedem Feld besser und gemessen 1,8-fach stärker; einziger Gewinn ist `terrainDamage` 20. Auch nach einer Senkung der Fernbüchse (Vorschlag dort) bleibt der Abstand gemessen 1,5-fach. | Test: `piercing` 0 → 1 (Doppeltreffer wie bei der Fernbüchse; ps 58,52 → 63,65) oder `maxAmmo` 2 → 3 | Wird zum Klon der Fernbüchse; nur zusammen mit der Fernbüchse entscheiden |
| pa_057 | Revolver | Schaden 38, Radius 0, Rückst. 30, Mun. 3, CD 1, Reichw. 919, `precision` | 17.5/16.1/15.6; Reichw. 300/500/340 | 35.57 (common) → 35.57 (common) | **ok** | Gemessen 17,5/16,1/15,6 (0,59 bis 0,66), common (ps 35,57), Median common 17,8. Eine von vier nahezu gleichen Direktwaffen (Revolver 38, Kampfbogen 42, Gatlingkanone 34, Schrotflinte 44, alle Pause 1 und Munition 3); `precision` hat keine Motorwirkung. | keine | – |
| pa_058 | Kampfbogen | Schaden 42, Radius 0, Rückst. 30, Mun. 3, CD 1, Reichw. 596, `arrow` | 18.1/17.9/21.6; Reichw. 150/150/300 | 38.99 (common) → 38.99 (common) | **ok (kleiner Textwiderspruch)** | Gemessen 18,1/17,9/21,6 (0,62), common. Der Text nennt „flache Bahn“, `gravityScale` 1,0769 ist aber höher als beim Revolver (1,0); `arrow` ohne Motorwirkung. | Text („flache Bahn“) streichen oder `gravityScale` 1,0769 → 1 | Prüfsummen (Schwerkraft ändert die Bahn) |
| pa_059 | Armbrust | Schaden 66, Radius 0, Rückst. 30, Mun. 3, CD 2, Reichw. 515, Durchschlag, `heavy_arrow` | 45/45.3/45.6; Reichw. 300/150/150 | 64.64 (uncommon) → 64.64 (uncommon) | **zu stark (Verdacht, wie Fernbüchse)** | Katalog 66, im Spiel (Fassung 5) 41. Gemessen 45,0/45,3/45,6 bis 150 px, bei 300 px 13,4 (Seed 0): Durchschlagstreffer 41 × 0,7 = 28,7 plus Aufschlag hinter dem Ziel, wie bei der Fernbüchse. Kürzere Reichweite (515, Tempo 70, Schwerkraft 1,1077) ist der Preis, der im Schadenswert nicht sichtbar wird; ps 64,64 uncommon (mit 41: 43,26, common). | Wert der Fassung 5 `damage` 41 → 34 (gemessen linear ≈ 37,3); Katalogwert 66 nachziehen | Prüfsummen; wie Fernbüchse |
| pa_060 | Gatlingkanone | Schaden 34, Radius 0, Rückst. 30, Mun. 3, CD 1, Reichw. 989, `minigun` | 15.5/15.9/14.9; Reichw. 500/410/480 | 33.84 (common) → 33.84 (common) | **Fehlzuordnung (Name und Mechanik)** | `minigun` hat keine Motorwirkung: ein Schuss je Zug mit Schaden 34 (gemessen 15,5/15,9/14,9), Munition 3, Pause 1; ps 33,84 ist der niedrigste der Kategorie. „Drehlaufgeschütz“ verspricht Salve. Nach Stufe (common) im Rahmen. | Namen und Text ändern („Schnellfeuerkanone“) oder Salve umsetzen (Entscheidung) | Salve = Motoränderung, Replay-Marke |

### Technik (tech, 20)

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_121 | Raketenfaust | Schaden 58, Radius 35, Rückst. 88, Mun. 5, CD 2, Reichw. 773, `rocket_punch` | 58/58/58; Reichw. 700/860/770 | 109.21 (rare) → 57.42 (uncommon) | **Fehlzuordnung (Text, Reichweite, Score)** | Strahl, gemessen 58 auf allen gemessenen Entfernungen bis 700 px (Reichweite 700/860/770; Katalogreichweite 773 kommt aus der Formel `deriveMaxRange`: 600 × 58/45); ein „Faustschlag“ mit der Reichweite einer Büchse. Radius 35, aoe und Rückstoß 88 wirkt der Strahl nicht (`#resolveHitscan`: nur `applyDamage` und Zielwirkung); ps 109,21 rare → ps* 57,42 uncommon. `rocket_punch` ohne Motorwirkung. Der Text „im Umkreis“ stimmt nicht. | `blastRadius` 35 → 0, `knockback` 88 → 0, `aoe` → falsch (ps 109,21 → 57,42, Stufe uncommon); Text ohne „Umkreis“; Strahllänge kürzen als Entscheidung (Generatorregel) | Stufe rare → uncommon; Prüfsummen |
| pa_122 | Endlosschleife | Schaden 32, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 427, `loop` | 0/0/0; Reichw. 0/0/0 | 35.2 (common) → 0 (common) | **Fehlzuordnung (Score auf Schaden, den die Wirkung nie macht)** | `loop` = Munition +3, identisch zur Nachschubkiste (`supply_drop`). Selbstwirkung: der Motor führt sie sofort aus, beendet den Zug und erzeugt kein Geschoss; Schaden 32 und Reichweite 427 fallen nie an. ps 35,2 → ps* 0. Messung 0/0/0 ist die Selbstwirkung (Messartefakt der Skriptannahme „Schaden am Ziel“). | `damage` 32 → 0 (ps 0); Dublette auflösen: eigene Zahl oder Wirkung (Entscheidung) | Prüfsummen; Stufe common bleibt |
| pa_123 | Magnetkanone | Schaden 40, Radius 45, Rückst. 95, Mun. 5, CD 1, Reichw. 533, `magnetism` | 40/40/40; Reichw. 500/500/500 | 100.63 (rare) → 39.6 (common) | **Fehlzuordnung (Text „Umkreis“, Score)** | `magnetism` zieht 90 px, aber nur das getroffene Ziel; Radius 45, aoe und Rückstoß 95 wirkt der Strahl nicht. Gemessen 40 auf allen Entfernungen bis 500 px (Katalog 533). ps 100,63 rare → ps* 39,6 common. Die Wirkung selbst (Ziehen, z_sonder 0,87, zweithöchster der Gruppe) ist echt und stärker, als der Schaden 40 sagt. | `blastRadius` 45 → 0, `knockback` 95 → 0, `aoe` → falsch (ps 100,63 → 39,6, Stufe common); Text „zieht das getroffene Ziel heran“ | Stufe rare → common; Prüfsummen |
| pa_124 | Wachgeschütz | Schaden 38, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 1062, `auto_target` | 0/0/0; Reichw. 0/0/0 | 41.8 (common) → 0 (common) | **ok** | Selbstwirkung `turret`: Geschütz mit Schaden round(38 × 0,6) = 23, Reichweite round(1062 × 0,75) = 797, 3 Züge (`buildEffect`); der Katalogschaden 38 zählt also mittelbar. Gemessen 0 (Messartefakt: das Geschütz feuert erst in Folgezügen, die Messung zählt nur den eigenen Schuss). Geschützleistung selbst nicht gemessen. | keine; Geschützschaden messen (Entscheidung) | – |
| pa_125 | Nachschubkiste | Schaden 31, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 413, `supply_drop` | 0/0/0; Reichw. 0/0/0 | 34.1 (common) → 0 (common) | **Fehlzuordnung (Dublette, Score)** | `supply_drop` = Munition +3, gleiche Wirkung wie die Endlosschleife; Schaden 31 und Reichweite 413 fallen nie an, ps 34,1 → ps* 0. Messung 0 (Selbstwirkung). | `damage` 31 → 0; Dublette auflösen (Entscheidung) | Prüfsummen |
| pa_126 | Bunker | Schaden 27, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 360, `bunker` | 0/0/0; Reichw. 0/0/0 | 42.9 (common) → 0 (common) | **Fehlzuordnung (Dublette, Score)** | `bunker` = Rüstung −30 %, derselbe Wert wie das Tarnnetz (`armor`, `armorReduction` 0,3). Schaden 27 und `terrainDamage` 20 fallen nie an (20 × 0,6 = 12 Punkte); ps 42,9 → ps* 0, höchster Score der acht Selbstwirkungen. Messung 0 (Selbstwirkung). | `damage` 27 → 0, `terrainDamage` 20 → 0 (ps 0); Unterschied zum Tarnnetz festlegen (Entscheidung) | Prüfsummen |
| pa_127 | Teleportplattform | Schaden 34, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 453, `teleport_platform` | 0/0/0; Reichw. 0/0/0 | 37.4 (common) → 0 (common) | **zu schwach (Wirkung = gewöhnlicher Sprung)** | `teleport_platform` = `move` mit 60 px, also die Sprungweite einer gewöhnlichen Bewegung (Kommentar in `specials.js`: „mehr als ein gewöhnlicher Sprung (60)“), beendet dabei den Zug; identisch zu Hologrammportal und Schlauchboot. Schaden 34 fällt nie an; ps 37,4 → 0. Messung 0 (Selbstwirkung). | Weite je Waffe setzen (Entscheidung, z. B. `moveDistance` aus `effectMagnitude`); `damage` 34 → 0 | Wirkungsänderung; Prüfsummen |
| pa_128 | Hologrammportal | Schaden 30, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 400, `hologram_portal` | 0/0/0; Reichw. 0/0/0 | 33 (common) → 0 (common) | **zu schwach (Wirkung = gewöhnlicher Sprung)** | `hologram_portal` = `move` 60 px wie die Teleportplattform; Text „springt an einen anderen Ort“ gilt für 60 px. Schaden 30 fällt nie an; ps 33 → 0. Messung 0 (Selbstwirkung). | wie Teleportplattform; `damage` 30 → 0 | Wirkungsänderung; Prüfsummen |
| pa_129 | Tesla-Turm | Schaden 48, Radius 52, Rückst. 0, Mun. 5, CD 2, Reichw. 640, `chain_lightning` | 0/0/48; Reichw. 0/0/850 | 98 (rare) → 45.14 (uncommon) | **Messartefakt (Sichtlinie)** | Gemessen 0/0/48 (Seed 2 bei 850 px): `requiresLineOfSight` verlangt freie Sicht, der Motor lehnt den flachen Messschuss am Hügel ab („verlangt freie Sicht“, belegt mit Einzelschuss). `waffen-balance` meldet „ohne Schaden“ (Ausreißer), das ist falsch positiv. Wirkung `chain_lightning`: Kette mit 2 Sprüngen, 0,6 Rest (48, 28,8, 17,3). Radius 52 und aoe wirken nicht (Kette nutzt festen Sprung von 240 px): ps 98 → ps* 45,14. | Messung mit hohem Winkel wiederholen; Radius 52 und `aoe` im Score streichen (ps 45,14) | Stufe rare → uncommon |
| pa_130 | Tarnnetz | Schaden 33, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 440, `camouflage` | 0/0/0; Reichw. 0/0/0 | 36.3 (common) → 0 (common) | **Fehlzuordnung (Name und Dublette)** | `camouflage` ist als Rüstung −30 % abgebildet (`armor`), nicht als Tarnung; identisch zum Bunker. Schaden 33 fällt nie an; ps 36,3 → 0. Messung 0 (Selbstwirkung). | `damage` 33 → 0; Wirkung (Tarnung statt Rüstung) oder Name entscheiden | Prüfsummen |
| pa_131 | Schlauchboot | Schaden 29, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 387, `water_mobility` | 0/0/0; Reichw. 0/0/0 | 31.9 (common) → 0 (common) | **Fehlzuordnung (Wirkung ohne Wasserbezug, Dublette)** | `water_mobility` = `move` 60 px an Land wie im Wasser; der Text („Fahrt“) deutet auf Wasserbewegung. Schaden 29 fällt nie an; ps 31,9 → 0 (niedrigster Wert der Gruppe, Rangdifferenz −81). Messung 0 (Selbstwirkung). | `damage` 29 → 0; Wirkung an Wasser binden (Entscheidung) | Wirkungsänderung; Prüfsummen |
| pa_132 | Alte Dame | Schaden 55, Radius 30, Rückst. 82, Mun. 5, CD 2, Reichw. 733, `old_lady_strike` | 55/55/55; Reichw. 800/800/670 | 101.32 (rare) → 54.45 (uncommon) | **Fehlzuordnung (Text „Umkreis“, Score)** | Strahl, gemessen 55 auf allen Entfernungen bis 800/800/670 px (Katalog 733). Radius 30, aoe und Rückstoß 82 wirken nicht; `old_lady_strike` ohne Motorwirkung. ps 101,32 rare → ps* 54,45 uncommon. Ohne Sichtlinie, ohne Klassenfaktor: der Schaden fällt voll an, wo Projektilwaffen 0,4 bis 0,7 erreichen. | `blastRadius` 30 → 0, `knockback` 82 → 0, `aoe` → falsch (ps 54,45); Text ohne „Umkreis“ | Stufe rare → uncommon; Prüfsummen |
| pa_133 | Fliegendes Superschaf | Schaden 60, Radius 40, Rückst. 0, Mun. 5, CD 2, Reichw. 219, Zielsuche 70, `guided_sheep` | 48.3/47.9/47; Reichw. 150/150/150 | 463.82 (legendary) → 463.82 (legendary) | **Fehlzuordnung (Score: Zielsuche 70 × 5)** | ps 463,82 (legendary, z_scoring +4,80, größte Abweichung des Katalogs): `homing` 70 × 5 = 350 von 464 Punkten. Wirkung: Projektil Tempo 40, Reichweite 219, gemessen 48,3/47,9/47,0 bei 40 und 90 px, 28,2 bei 150 px, darüber 0; Direktschaden 60 × 0,7 und Brand 13 je Zug (Feuer 25 / 2). Das ist eine Kurzstreckenwaffe in der Stufe rare, kein legendary. | `homing`-Gewicht 5 → 0,5 (beschlossen): ps 151,97, epic; Zielsuche 70 → 35 als Test (ps 290,6 bei altem Gewicht) | Stufe legendary → epic; Prüfsummen |
| pa_134 | Luftangriff | Schaden 62, Radius 65, Rückst. 0, Mun. 5, CD 3, Reichw. 827, `air_strike` | 62/62/62; Reichw. 790/1070/820 | 127.96 (rare) → 61.38 (uncommon) | **Fehlzuordnung (Text „von oben“ wirkungslos)** | `strikeStyle` sky wirkt nicht: Strahlwaffen verlassen `fire()` vor `resolveStrike` (Zeile 239 gegen 250 in `shooting.js`); gemessen ist ein gerader Strahl, 62 auf allen Entfernungen bis 790/1070/820 px, Einzelschuss: ein `damage`-Ereignis. Radius 65 und aoe wirken nicht: ps 127,96 rare → ps* 61,38 uncommon. Pause 3, Munition 5. | `delivery` hitscan → projectile (Anflug von oben, Radius wirkt) als Entscheidung; sonst Text und `blastRadius` 65 → 0, `aoe` → falsch (ps 61,38) | delivery-Wechsel ändert Spiel und Replays; Score-Bereinigung: Stufe rare → uncommon |
| pa_135 | Meteorregen | Schaden 68, Radius 55, Rückst. 0, Mun. 5, CD 3, Reichw. 907, `meteor_rain` | 68/68/68; Reichw. 1200/1120/430 | 125.48 (rare) → 67.32 (uncommon) | **Fehlzuordnung (Text „von oben“ wirkungslos)** | Wie Luftangriff: `strikeStyle` sky ohne Wirkung, Strahl mit 68 auf allen Entfernungen bis 1200/1120/430 px (Katalog 907). Radius 55 und aoe wirken nicht: ps 125,48 rare → ps* 67,32 uncommon. | wie Luftangriff (`blastRadius` 55 → 0, `aoe` → falsch: ps 67,32) | wie Luftangriff |
| pa_136 | Bohrkopfrakete | Schaden 64, Radius 48, Rückst. 0, Mun. 5, CD 2, Reichw. 853, `drill_rocket` | 64/64/64; Reichw. 800/820/730 | 154.24 (epic) → 63.36 (uncommon) | **Fehlzuordnung (Score epic ohne Radius, Gelände, Bohrer)** | Strahl, gemessen 64 auf allen Entfernungen bis 800/820/730 px. `drill_rocket` ist nicht auf `DRILL` abgebildet (nur `drill_cannon`); Radius 48, `terrainDamage` 65 (39 Punkte) und aoe wirken beim Strahl nicht. ps 154,24 epic → ps* 63,36 uncommon: größte Stufenlücke der Gruppe. Text: „große Sprengwirkung“ stimmt nicht. | `blastRadius` 48 → 0, `terrainDamage` 65 → 0, `aoe` → falsch (ps 63,36) oder `drill_rocket` auf `DRILL` abbilden (Entscheidung) | Stufe epic → uncommon bzw. neue Bohrwirkung (Replay-Marke) |
| pa_137 | Flammenklinge | Schaden 33, Radius 0, Rückst. 55, Mun. 5, CD 1, Reichw. 440, `flame_blade` | 48/48/48; Reichw. 500/360/490 | 54.05 (uncommon) → 47.52 (uncommon) | **zu stark (Verdacht, aus Messung und Rechnung)** | Gemessen 48/48/48 auf allen Entfernungen bis 500/360/490 px: 33 Direktschaden plus erster Brandtakt 15. Dazu Brand 15 je Zug über 3 Züge. Pause 1 und Munition 5, kein Klassenfaktor, keine Sichtlinie, in der Stufe uncommon (ps 54,05, Median 30,4; 1,6-fach). Eine „Klinge“ mit 440 bis 500 px Reichweite. Vorgeschichte: Fassung 2 hatte 55 Schaden, `BALANCE_KORREKTUREN_3` senkte auf die heutigen 33 (Ziel „unter 2 × Stufenmedian“, `waffen-fassung.js`); die Grenze 2 ist damit eingehalten, die Waffe liegt aber weiter am oberen Rand. | `elemental.fire` 30 → 20 (Brand 10 je Zug; ps 54,05 → 49,10) oder Pause 1 → 2 | Brand-Untergrenze 8 gilt für alle; Prüfsummen |
| pa_138 | Arkanhammer | Schaden 68, Radius 45, Rückst. 78, Mun. 5, CD 2, Reichw. 907, `magic_hammer` | 68/0/0; Reichw. 90/0/0 | 120.02 (rare) → 63.95 (uncommon) | **Messartefakt (Sichtlinie); Score wie Alte Dame** | Gemessen 68/0/0 (Seed 0 nur bei 40 und 90 px): `requiresLineOfSight` lehnt den flachen Messschuss am Hügel ab (belegt mit Einzelschuss: „verlangt freie Sicht“). Wirkung sonst Strahl 68. Radius 45, aoe und Rückstoß 78 wirken nicht: ps 120,02 rare → ps* 63,95 uncommon; Text „im Umkreis“ stimmt nicht. | Messung mit hohem Winkel; `blastRadius` 45 → 0, `knockback` 78 → 0, `aoe` → falsch (ps 63,95) | Stufe rare → uncommon |
| pa_139 | Höllenkanone | Schaden 68, Radius 58, Rückst. 0, Mun. 5, CD 3, Reichw. 907, `hell_cannon` | 92/92/92; Reichw. 1210/1200/950 | 151.77 (epic) → 91.08 (rare) | **zu stark** | Gemessen 92 auf allen Entfernungen bis 1200 px (68 plus erster Brandtakt 24), dazu Brand 24 je Zug über `turns` 3 (Fassung: ob der Sofortschlag einer der drei Takte ist, nicht geprüft). Gesundheit 96/156/108: ein Schuss nimmt einem Späher fast alles. Keine Sichtlinie, kein Klassenfaktor, Pause 3, Munition 5. `strikeStyle` flank wirkt nicht (Strahl); Radius 58 wirkt nicht: ps 151,77 epic → ps* 91,08 rare. | `elemental.fire` 48 → 30 (Brand 15 je Zug; ps 151,77 → 142,86); zusätzlich Radius und aoe aus dem Score | Stufe epic → rare nach Bereinigung; Brandwerte teilen sich mit allen Feuerwaffen die Untergrenze |
| pa_140 | Quantenkanone | Schaden 60, Radius 0, Rückst. 0, Mun. 5, CD 1, Reichw. 1062, Durchschlag, `quantum_blast` | 52.4/52/51.8; Reichw. 500/500/500 | 62.07 (uncommon) → 62.07 (uncommon) | **zu stark (Verdacht, gemessen gegen Stufenmedian)** | Katalog 60, im Spiel (Fassung 5) 47. Projektil mit Durchschlag, gemessen 52,4/52,0/51,8 bis 500 px; Ereignisse eines Einzelschusses: Durchschlagstreffer 32,9 plus Aufschlag hinter dem Ziel 19,8. Pause 1 und Munition 5: Magazin 260 gegen 138 der Fernbüchse. Gegen den Median uncommon (30,4) 1,7-fach (Audit E3 nennt 1,72); Munition und Pause berühren den Wert nur mit Faktoren (ps 62,07). | Wert der Fassung 5 `damage` 47 → 38 (gemessen linear ≈ 42,4 = 1,4-fach) oder Pause 1 → 2; Katalogwert 60 nachziehen | Prüfsummen; wie Fernbüchse |

## 5. Tabellenmatrix Waffe × Themenfeld

z-Werte gegen den Gesamtkatalog. z_scoring = z(powerScore) − z(Mittel a bis d). Die Urteilsspalte entspricht Abschnitt 4. CSV mit denselben Daten: `docs/balance-auslese/heavy-tech.csv`.

| id | Waffe | Kat. | z_schaden | z_flug | z_munition | z_sonder | z_scoring | powerScore | Stufe | Urteil |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| pa_041 | Salvengeber | heavy | 0.15 | 0.40 | 0.61 | -0.47 | -0.69 | 68.26 | uncommon | ok (Vielschuss-Nische) |
| pa_042 | Feuerwerkssalve | heavy | -0.23 | -0.22 | -0.58 | -0.43 | 1.25 | 53.5 | uncommon | ok (Zwilling der Raketensalve) |
| pa_043 | Kampfgeschütz | heavy | -0.31 | 0.33 | -0.34 | -0.20 | 0.20 | 48.89 | uncommon | ok |
| pa_044 | Phönixschlag | heavy | 0.70 | 0.85 | -0.83 | 0.31 | 2.83 | 287.87 | legendary | zu stark (Score und Wirkung) |
| pa_045 | Raketensalve | heavy | -0.25 | 0.22 | -0.58 | -0.32 | 0.69 | 52.99 | uncommon | ok (Zwilling der Feuerwerkssalve) |
| pa_046 | Splittergranate | heavy | 0.35 | -0.07 | -1.54 | -0.26 | 1.84 | 83.97 | rare | zu schwach (Zünder sinkt in den Boden) |
| pa_047 | Handgranate | heavy | -0.20 | -0.16 | -1.54 | -0.28 | 2.16 | 63.32 | uncommon | zu schwach (Zünder sinkt; Text sagt „prallt ab“) |
| pa_048 | Bananengranate | heavy | 0.38 | 0.51 | -1.54 | -0.26 | 1.36 | 91.44 | rare | zu schwach (Zünder sinkt; Splitter fehlen) |
| pa_049 | Bumerang | heavy | -0.52 | 0.25 | -0.34 | -0.26 | 0.27 | 32.94 | common | ok |
| pa_050 | Doppelkopfaxt | heavy | -0.22 | -0.57 | -0.58 | -0.16 | 1.45 | 60.12 | uncommon | ok |
| pa_051 | Wurfklingen | heavy | -0.29 | 0.47 | -0.34 | -0.49 | 0.31 | 47.45 | uncommon | ok (Datenzwilling des Kampfgeschützes) |
| pa_052 | Molotowcocktail | heavy | 0.29 | -0.07 | -1.54 | 0.76 | 1.02 | 92.97 | rare | ok |
| pa_053 | Roboterbombe | heavy | 0.48 | -0.07 | -1.54 | -0.26 | 1.91 | 95.27 | rare | zu schwach (Zünder sinkt; kein Roboter) |
| pa_054 | Schrotflinte | heavy | -0.38 | 0.18 | -0.34 | -0.26 | 0.38 | 42.84 | common | ok (Name verspricht Streuung) |
| pa_055 | Fernbüchse | heavy | 0.86 | 0.54 | -0.58 | -0.26 | -0.64 | 63.78 | uncommon | zu stark (Verdacht, gemessen gegen Stufenmedian) |
| pa_056 | Präzisionsgewehr | heavy | -0.02 | 0.58 | -0.82 | -0.43 | 0.55 | 58.52 | uncommon | zu schwach (von der Fernbüchse dominiert) |
| pa_057 | Revolver | heavy | -0.44 | 0.40 | -0.34 | -0.26 | 0.09 | 35.57 | common | ok |
| pa_058 | Kampfbogen | heavy | -0.40 | -0.13 | -0.34 | -0.26 | 0.65 | 38.99 | common | ok (kleiner Textwiderspruch) |
| pa_059 | Armbrust | heavy | 0.87 | -0.30 | -0.58 | -0.26 | 0.22 | 64.64 | uncommon | zu stark (Verdacht, wie Fernbüchse) |
| pa_060 | Gatlingkanone | heavy | -0.48 | 0.49 | -0.34 | -0.26 | 0.01 | 33.84 | common | Fehlzuordnung (Name und Mechanik) |
| pa_121 | Raketenfaust | tech | 0.46 | 0.81 | 0.51 | 0.30 | -1.40 | 109.21 | rare | Fehlzuordnung (Text, Reichweite, Score) |
| pa_122 | Endlosschleife | tech | -0.50 | 0.30 | 1.01 | -0.04 | -1.36 | 35.2 | common | Fehlzuordnung (Score auf Schaden, den die Wirkung nie macht) |
| pa_123 | Magnetkanone | tech | 0.36 | 0.46 | 0.76 | 0.87 | -1.93 | 100.63 | rare | Fehlzuordnung (Text „Umkreis“, Score) |
| pa_124 | Wachgeschütz | tech | -0.44 | 0.58 | 1.01 | -0.04 | -1.59 | 41.8 | common | ok |
| pa_125 | Nachschubkiste | tech | -0.51 | 0.28 | 1.01 | -0.04 | -1.34 | 34.1 | common | Fehlzuordnung (Dublette, Score) |
| pa_126 | Bunker | tech | -0.31 | 0.20 | 1.01 | -0.04 | -1.31 | 42.9 | common | Fehlzuordnung (Dublette, Score) |
| pa_127 | Teleportplattform | tech | -0.48 | 0.34 | 1.01 | -0.04 | -1.38 | 37.4 | common | zu schwach (Wirkung = gewöhnlicher Sprung) |
| pa_128 | Hologrammportal | tech | -0.52 | 0.26 | 1.01 | -0.04 | -1.33 | 33 | common | zu schwach (Wirkung = gewöhnlicher Sprung) |
| pa_129 | Tesla-Turm | tech | 0.50 | 0.61 | 0.51 | -0.04 | -1.08 | 98 | rare | Messartefakt (Sichtlinie) |
| pa_130 | Tarnnetz | tech | -0.49 | 0.32 | 1.01 | -0.04 | -1.37 | 36.3 | common | Fehlzuordnung (Name und Dublette) |
| pa_131 | Schlauchboot | tech | -0.53 | 0.24 | 1.01 | -0.04 | -1.32 | 31.9 | common | Fehlzuordnung (Wirkung ohne Wasserbezug, Dublette) |
| pa_132 | Alte Dame | tech | 0.39 | 0.75 | 0.51 | 0.24 | -1.35 | 101.32 | rare | Fehlzuordnung (Text „Umkreis“, Score) |
| pa_133 | Fliegendes Superschaf | tech | 0.52 | 1.23 | 0.51 | -0.14 | 4.80 | 463.82 | legendary | Fehlzuordnung (Score: Zielsuche 70 × 5) |
| pa_134 | Luftangriff | tech | 0.74 | 0.89 | 0.26 | -0.55 | -0.32 | 127.96 | rare | Fehlzuordnung (Text „von oben“ wirkungslos) |
| pa_135 | Meteorregen | tech | 0.73 | 1.00 | 0.26 | -0.55 | -0.46 | 125.48 | rare | Fehlzuordnung (Text „von oben“ wirkungslos) |
| pa_136 | Bohrkopfrakete | tech | 1.40 | 0.93 | 0.51 | -0.55 | -0.83 | 154.24 | epic | Fehlzuordnung (Score epic ohne Radius, Gelände, Bohrer) |
| pa_137 | Flammenklinge | tech | -0.49 | 0.32 | 0.76 | 0.97 | -1.84 | 54.05 | uncommon | zu stark (Verdacht, aus Messung und Rechnung) |
| pa_138 | Arkanhammer | tech | 0.65 | 1.00 | 0.51 | 0.20 | -1.50 | 120.02 | rare | Messartefakt (Sichtlinie); Score wie Alte Dame |
| pa_139 | Höllenkanone | tech | 0.75 | 1.00 | 0.26 | 0.23 | -0.82 | 151.77 | epic | zu stark |
| pa_140 | Quantenkanone | tech | 0.81 | 0.58 | 0.76 | -0.55 | -1.74 | 62.07 | uncommon | zu stark (Verdacht, gemessen gegen Stufenmedian) |

## 6. Güte des Scorings

Spearman-Rangkorrelation (mittlere Ränge bei Gleichstand) von `powerScore` gegen den Mittelwert der Felder a bis d:

| Menge | n | Spearman rho |
|---|---:|---:|
| Gesamtkatalog | 150 | 0.35 |
| Gesamtkatalog, nur Waffen mit Schaden > 0 | 143 | 0.42 |
| Gesamtkatalog, Feld c ohne `rarity` | 150 | 0.30 |
| heavy_ranged | 20 | 0.11 |
| tech | 20 | 0.84 |
| heavy_ranged + tech (diese Gruppe) | 40 | 0.45 |
| heavy_ranged + tech, Feld c ohne `rarity` | 40 | 0.45 |
| heavy_ranged + tech, nur Waffen mit Schaden > 0 und Wirkung im Motor als Angriff (ohne 8 Selbstwirkungen) | 32 | 0.63 |

Je Feld (powerScore gegen das einzelne Feld): Gesamtkatalog a 0.91 / b 0.07 / c −0.29 / d −0.02; diese Gruppe a 0.89 / b 0.54 / c −0.29 / d 0.02. Das Feld b korreliert in der Gruppe (0.54), weil Strahlwaffen (delivery = 1, hohe maxRange) hohe Leistungswerte haben und Projektilwaffen niedrige.

Messwert gegen Leistungswert (32 Waffen der Gruppe mit gemessenem Schaden > 0): Spearman powerScore gegen Bestwert **0.67**, ps* gegen Bestwert **0.24**. Der Katalogwert bildet die Messung also besser ab als die bereinigte Rechnung; der Grund ist, dass die Strahlwaffen gemessen den vollen Katalogschaden ohne Klassenfaktor und Abfall bringen (58 bis 92) und die Projektilwaffen nur 0,26 bis 0,7 davon.

Einordnung:

- Der niedrige Gesamtwert 0,35 und das Scoring als Schadenswert (rho gegen Feld a 0,91) wurden in `melee-utility.md` beschrieben; für diese Gruppe gilt dasselbe, mit zwei Besonderheiten: (1) die acht Selbstwirkungen und die Strahlwaffen mit unwirksamen Feldern, (2) `homing` mit Gewicht 5 (zwei Waffen, 175 und 350 Punkte).
- heavy_ranged 0,11: Die Rangfolge im Leistungswert folgt Radius, aoe und Zünder (Roboterbombe +105, Splittergranate +95,5, Handgranate +81), die Merkmale a bis d ordnen aber nach Munition und Zünder-Malus in Feld c nach unten. Das Ergebnis sagt: Zünderwaffen sind im Score "rare", in der Wirkung nahe null (`zuender-test.md`).
- tech 0,84: hoher Wert, weil Schaden fast alles erklärt; die Selbstwirkungen stehen unten, die Strahlwaffen mit Radius oben. Das ist hoch, aber für die falschen Waffen richtig: Der Score ordnet nach Feldern, die nicht wirken.

**Passen `powerTier` und `rarity` dazu?**

| Stufe (`powerTier`) | n in Gruppe | mittlerer powerScore | mittleres Mittel a bis d |
|---|---:|---:|---:|
| common | 13 | 36.68 | 0.05 |
| uncommon | 12 | 58.13 | -0.08 |
| rare | 11 | 104.21 | 0.20 |
| epic | 2 | 153.00 | 0.57 |
| legendary | 2 | 375.85 | 0.39 |

- Die Stufen steigen mit dem Mittel der Felder a bis d nur grob: uncommon (−0.08) liegt unter common (0.05), legendary (0.39) unter epic (0.57). common enthält die acht Selbstwirkungen mit z_munition +1.01.
- `rarity`: heavy_ranged ist ganz `common`, tech ganz `rare` (Blöcke nach Nummer, Audit A6). Nach `powerTier` verteilen sich die 20 heavy_ranged auf 5 × common, 10 × uncommon, 4 × rare, 1 × legendary, die 20 tech auf 8 × common, 2 × uncommon, 7 × rare, 2 × epic, 1 × legendary. Die Quell-Seltenheit sagt nichts über die Stärke.
- Stufenwechsel durch ps* (Motorfelder): common → common 13, uncommon → uncommon 12, rare → rare 4, legendary → legendary 2, rare → uncommon 6, rare → common 1, epic → uncommon 1, epic → rare 1; das sind **9 von 40 Waffen**, alle Strahlwaffen in tech.

**Größte Abweichungen zwischen Rang des Leistungswerts und Rang des Mittels a bis d** (positiv = Leistungswert höher eingestuft als die Merkmale hergeben):

| Waffe | Kat. | powerScore | Stufe | Rangdifferenz |
|---|---|---:|---|---:|
| Roboterbombe | heavy_ranged | 95.27 | rare | +105 |
| Splittergranate | heavy_ranged | 83.97 | rare | +95.5 |
| Handgranate | heavy_ranged | 63.32 | uncommon | +81 |
| Bananengranate | heavy_ranged | 91.44 | rare | +81 |
| Schlauchboot | tech | 31.9 | common | -81 |
| Hologrammportal | tech | 33 | common | -78.5 |
| Doppelkopfaxt | heavy_ranged | 60.12 | uncommon | +78 |
| Nachschubkiste | tech | 34.1 | common | -76 |
| Endlosschleife | tech | 35.2 | common | -73 |
| Wachgeschütz | tech | 41.8 | common | -73 |
| Teleportplattform | tech | 37.4 | common | -73 |
| Tarnnetz | tech | 36.3 | common | -73 |
| Feuerwerkssalve | heavy_ranged | 53.5 | uncommon | +67 |
| Molotowcocktail | heavy_ranged | 92.97 | rare | +66 |

Im Gesamtkatalog führen Meteorbrocken (elemental) +120, Dimensionssprung (magic) −117.5, Katapult (elemental) +117; die Roboterbombe aus dieser Gruppe steht mit +105 auf Rang 8.

## 7. Sofort umsetzbar und Entscheidungsbedarf

### Sofort umsetzbar (eindeutig, ohne Spielwirkung auf Gefechte)

Änderungen am Katalog laufen über `project_armageddon_weapons_v1.json` und `npm run weapons:build`, danach `npm test` und `npm run check:docs` (Prüfsummen, Invarianten). Die folgenden Punkte ändern im Gefecht nichts, nur Leistungswert, Stufe (damit **Beutegewichte**, siehe Audit E4-1) und Text:

- Katalogwerte an Fassung 5 angleichen: Salvengeber `damage` 22 → 48, Fernbüchse 65 → 42, Armbrust 66 → 41, Quantenkanone 60 → 47 (und die sechs übrigen Waffen aus anderen Kategorien). Ändert ps und Stufe (Salvengeber uncommon → rare, Armbrust uncommon → common).
- Acht Selbstwirkungen: `damage` → 0 bei Endlosschleife, Nachschubkiste, Bunker, Teleportplattform, Hologrammportal, Tarnnetz, Schlauchboot; Bunker zusätzlich `terrainDamage` 20 → 0. **Nicht** beim Wachgeschütz: dort speist der Katalogschaden das Geschütz (23 = 38 × 0,6).
- Strahlwaffen: `blastRadius`, `knockback`, `aoe` (und bei Bohrkopfrakete `terrainDamage`) → 0 bei Raketenfaust, Magnetkanone, Alte Dame, Luftangriff, Meteorregen, Arkanhammer, Tesla-Turm, Bohrkopfrakete; Höllenkanone nur `blastRadius`, `aoe`. Der Strahl wendet sie nicht an; ps ändert sich wie in Abschnitt 4 angegeben, 9 Waffen wechseln die Stufe.
- Beschreibungen angleichen: "im Umkreis" bei Raketenfaust, Magnetkanone, Alte Dame, Arkanhammer, Höllenkanone; "von oben" bei Luftangriff und Meteorregen; "prallt ab" (Handgranate), "zerfällt in Splitter" (Bananengranate), "Roboter" (Roboterbombe), "flache Bahn" (Kampfbogen).
- `homing`-Gewicht 5 → 0,5 (laut `melee-utility.md` vom Auftraggeber beschlossen): Phönixschlag und Fliegendes Superschaf werden epic.

### Braucht Entscheidung

- **Zünder im Motor** (Sinken der armierten Granate): vier Waffen der Gruppe (dazu Wassermelone, und am Radiusrand Kaktusbombe, Pömpel, Impulsbombe) sind dadurch praktisch wirkungslos; Änderung verlangt eine Replay-Versionsmarke (AGENTS.md §2). Details in `zuender-test.md`.
- Durchschlag: Fernbüchse, Armbrust, Quantenkanone treffen zweimal (Treffer plus Aufschlag); Schaden im Spielwert senken (Fassung 5, `WAFFEN_F5_WERTE`) oder den Durchschlagwert im Score anheben.
- Sky/Flank-Strahlwaffen (Luftangriff, Meteorregen, Höllenkanone): `delivery` auf projectile (Anflug von oben/seitlich wird dann wirksam) oder Text und Werte auf "Strahl" setzen.
- Strahlwaffen insgesamt: kein Klassenfaktor, kein Abfall, Reichweiten 400 bis 1200 px aus der Formel `deriveMaxRange` (600 × Schaden/45). Gemessen bringen sie 55 bis 92 gegen 8 bis 26 der Projektil-Direktwaffen. Ob das gewollt ist, ist eine Entwurfsfrage.
- Dubletten der Selbstwirkungen (Munition +3, Rüstung −30 %, Versetzung 60 px) auflösen: eigene Zahlen je Waffe (`effectMagnitude` wird vom Motor nicht gelesen).
- `drill_rocket` auf `DRILL` abbilden oder die Werte streichen; Gatlingkanone (`minigun`) und Schrotflinte (`spread_shot`) mit Salve/Streuung ausstatten oder umbenennen.
- Flammenklinge und Höllenkanone: Brandwerte im Spiel prüfen und dann Zahlen setzen (Verdacht aus Rechnung).

## 8. Grenzen dieser Auslese

- Die Messung ist nur ein Hügel-Preset mit drei Seeds und grober Entfernungsreihe; Sichtlinienwaffen und Selbstwirkungen messen 0 (Tesla-Turm, Arkanhammer, acht Selbstwirkungen); die Reichweite ist mit dem Späher als Schützen (Abschussfaktor 0,64) unterschätzt (z. B. Kampfgeschütz 300 bis 430 gegen 811 im Katalog).
- Brandschaden über Zeit wurde nur als erster Takt gemessen (Einzelschüsse); Höllenkanone, Flammenklinge, Phönixschlag, Superschaf, Molotowcocktail haben je 3 Brandzüge, ob der Sofortschlag einer davon ist, wurde nicht geprüft. Das Geschütz des Wachgeschützes wurde nicht gemessen.
- Urteile "zu stark" mit Zusatz "Verdacht" stützen sich auf gelesenen Code und Rechnung, nicht auf Spielversuche.
- z-Werte hängen an den Festlegungen aus `melee-utility.md` (gleiche Gewichtung der Merkmale, `rarity` in Feld c, Richtung von gravityScale und delivery) und am Katalog (Fassung 4); die Fassung-5-Werte sind in Abschnitt 2 gegengerechnet.
- Der Abfall von 0,59 bis 0,67 bei Direktwaffen ist aus Codelektüre und Übereinstimmung der Zahlen abgeleitet; der Abstand von Aufschlag und Figurenmitte wurde nicht gemessen.
- Das Sinken der Zünder wurde auf der Hügelkarte mit je einem Wurf ohne Ziel gemessen (Tiefen 11 bis 82 px) und an einer Kopie des Motors (Scratchpad, nicht im Repo) gegengeprobt; die Kopie wurde nicht in den Tests geprüft.
