# Balance-Auslese: heavy_ranged + tech (2026-10-28) - ZWISCHENSTAND

Teilergebnis 1: Merkmalsstatistik und Themenfeld-Listen. Einzelurteile, Matrix, Güte des Scorings und Zündertest folgen. Methode und z-Festlegungen wie in `melee-utility.md`; die Formel wurde gegen dessen CSV nachgerechnet (Baseballschläger, Feuerfaust, Enterhaken, Energiefaust stimmen auf zwei Stellen).

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

## 3. Beste und Ausreißer je Themenfeld und Kategorie

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

