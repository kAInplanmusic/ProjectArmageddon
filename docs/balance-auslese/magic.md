# Balance-Auslese: magic (2026-10-28)

Stand: Katalog `src/shared/config/weapons.js` (150 Waffen, Fassung 5), Auswertung am Arbeitsstand von `main` (Commit 9a23325). Nur gelesen und gerechnet; am Katalog, Quellcode und Tests wurde nichts geändert. Die Rechenskripte lagen im Scratchpad (nicht im Repo) und sind in Abschnitt 2 beschrieben. Die Zahlen aus der Auslese `melee-utility.md` (z-Werte der Gruppe melee/utility) habe ich mit denselben Festlegungen nachgerechnet und exakt reproduziert (Beispiele: Baseballschläger -0,37/-0,78/0,38/0,24/0,38; Spearman Gesamtkatalog 0,354).

Gruppe: Kategorie `magic` (30 Waffen, pa_081 bis pa_110). **Alle 30 wurden einzeln beurteilt** (Abschnitt 4). Die Buffs, Statuseffekte und Zauberwirkungen stehen in `docs/balance-auslese/buffs-status.md`.

## 0. Kurzbefund

- **30 von 30 Waffen einzeln beurteilt.** Urteile nach dem ersten Wort der Urteilsspalte: Fehlzuordnung 12, zu stark 2, zu schwach 4, Messartefakt 2, ok 10.
- **Rangkorrelation Spearman powerScore gegen Mittel a bis d: 0,35 im Gesamtkatalog, 0,61 in magic** (Selbstwirkungen eingerechnet; nur die 13 Waffen mit Schaden am Ziel: 0,63). Innerhalb magic hängt der Leistungswert fast nur am Schaden (Feld a 0,96), und er läuft gegen Munition (-0,61) und Sonderwirkung (-0,17).
- **Neun Strahlwaffen tragen einen Umkreis, den der Motor nicht kennt:** Zauberbuch, Chaosmagier, Windkrieger, Giftpilz, Astralkugel, Lavaelixier, Gedankensturm, Verderbniskelch, Sonnenamulett. `#resolveHitscan` (`match.js`) trifft nur die erste Figur; Radius und aoe sind ohne Wirkung, zählen aber im Leistungswert. Ohne sie fallen alle neun in eine niedrigere Stufe (acht rare → uncommon bzw. common, Giftpilz uncommon → common). Dazu `knockback` bei Goldener Hand, Windkrieger und Zauberpeitsche, das bei Strahlen ebenfalls nicht angewandt wird.
- **17 von 30 Waffen sind Selbstwirkungen** (Verstärkung 4, Zufall 4, Versetzen 4, Heilung 2, Schild 2, Aufdecken 1). Für sie ist `damage` ohne Funktion außer als Heil- und Schildwert (Untergrenzen 35 und 40 greifen meist), `maxRange`, Radius und `damageType` ohne Wirkung. Es gibt Dubletten: vier gleiche ×1,5-Verstärkungen, vier Zufallswaffen mit demselben Pool, vier 60-px-Versetzer (Zauberstiefel und Dimensionskugel mit identischen Zahlen), zwei gleiche Schilde, zwei fast gleiche Heiler.
- **Allsehendes Auge bewirkt nichts:** `target_scan` setzt "aufgedeckt" für den Schützen, aber `isRevealed` hat im Spielcode keinen Leser.
- **Dimensionsriss ist in jeder Zahl schlechter als seine drei Schwestern** (2 Munition, Pause 2, gleiche 60 px); die Daten (`effectMagnitude` 165) deuten auf mehr hin, der Motor liest sie nicht.
- **Lavaelixier ist rechnerisch die stärkste Magiewaffe** (98 gesamt gegen Median 50 aller Schadenswaffen), **Traumfänger die einzige Zugsperre auf Distanz** (Verdacht, nicht im Spiel getestet).
- **Die Verstärkung wirkt nur einen eigenen Zug** (nachgerechnet am `StatusStore`) und kostet den Zug des Wurfs; rechnerisch ein Verlust von 25 % Schaden gegenüber Schießen.

## 1. Mittelwert und Standardabweichung je Merkmal

Population: Grundgesamtheit (Teilen durch n). Kategorie magic n=30, gesamt n=150.

| Merkmal | magic Mittel | magic SD | gesamt Mittel | gesamt SD |
|---|---:|---:|---:|---:|
| damage | 35.83 | 13.42 | 41.75 | 19.28 |
| blastRadius | 14.33 | 22.18 | 18.28 | 24.94 |
| knockback | 6.77 | 20.52 | 19.94 | 25.95 |
| terrainDamage | 0.00 | 0.00 | 4.87 | 16.77 |
| homing | 0.00 | 0.00 | 0.70 | 6.35 |
| piercing | 0.03 | 0.18 | 0.04 | 0.20 |
| maxAmmo | 3.03 | 0.41 | 4.09 | 1.08 |
| cooldown | 1.33 | 0.65 | 1.23 | 1.00 |
| fuseTime | 0.00 | 0.00 | 0.19 | 0.74 |
| maxRange | 464.63 | 162.48 | 500.54 | 227.07 |
| powerScore | 49.40 | 31.81 | 71.48 | 56.80 |
| elemental (Summe Feuer+Eis+Gift) | 5.00 | 13.29 | 6.11 | 15.40 |
| Anteil Motorwirkung (`special` in SPECIAL_EFFECTS) | 0.77 | – | 0.43 | – |
| Anteil aoe | 0.30 | – | 0.37 | – |
| Anteil Strahlwaffen (delivery hitscan) | 0.90 | – | 0.36 | – |

Nur Projektilwaffen: magic n=3 (Goldene Zauberrolle, Quantengewehr, Spruchrolle): Tempo 86.67 (SD 8.06), gravityScale 1.00, bounces 0.00; gesamt n=96: Tempo 65.68 (SD 17.74), gravityScale 1.04, bounces 0.30.

Mittlerer powerScore je Kategorie: melee 48.61; ranged 60.74; heavy_ranged 70.86; elemental 83.45; magic 49.40; utility 50.87; tech 98.06; ultimate 150.84.

Lesehinweise (aus der Tabelle belegt):

- magic hat überall `terrainDamage` 0, `homing` 0, `fuseTime` 0 und fast überall `maxAmmo` 3 (SD 0,41; Ausnahmen Dimensionssprung 5, Dimensionsriss 2). Die Streuung liegt in Schaden (SD 13,42), Radius und Reichweite.
- Der Schaden-Mittelwert (35,83) ist verzerrt: 17 der 30 Waffen sind Selbstwirkungen, bei denen `damage` keine Trefferzahl ist; Dimensionssprung und Dimensionsriss haben 0.
- 27 der 30 Waffen sind Strahlwaffen (Anteil 0,90 gegen 0,36 im Katalog); Reichweite und Projektilmerkmale sind deshalb für magic fast nur Strahllänge.

## 2. Methode

**Referenz der z-Werte: Gesamtkatalog (150 Waffen), wie in `melee-utility.md`.** Je Merkmal z = (Wert − Mittel) / SD. Ein Themenfeld-z ist der ungewichtete Mittelwert der z-Werte seiner Merkmale. Die Festlegungen sind unverändert übernommen:

| Feld | Merkmale (höher = stärker) | Festlegungen |
|---|---|---|
| a Schaden | damage, blastRadius, terrainDamage, aoe (0/1), piercing | keine |
| b Flug | projectileSpeed, gravityScale (negiert), bounces, maxRange, homing, delivery (Strahl = 1) | Tempo, Schwerkraft und Abpraller nur für Projektilwaffen (n=96) gerechnet; bei Strahlwaffen entfallen sie. Richtung von gravityScale und delivery ist **Annahme** |
| c Munition | maxAmmo, cooldown (negiert), fuseTime > 0 (negiert), rarity (common 0, uncommon 1, rare 2) | `rarity` ist Quell-Seltenheit; alle 30 magic sind `uncommon` und tragen damit überall +1 bei |
| d Sonderwirkung | special (1, wenn `special` in `SPECIAL_EFFECTS`), effectMagnitude (null = 0), elemental (Summe), knockback | `effectMagnitude` liest der Motor nicht: die Werte 72 (Dimensionssprung) und 165 (Dimensionsriss) erzeugen z_sonder 0,87 und 2,06 (Statistik-Artefakt). Sonnenamulett (`solar` nicht gemappt, Brand aus der Ableitung) zählt als "ohne Motorwirkung" |
| e Scoring | z(powerScore) − z(Mittel der Felder a bis d) | positiv: Leistungswert höher als die Merkmale |

Nachgerechnet: Die Formel `computePowerScore` (`scripts/build-weapon-catalog.mjs`) habe ich neu aufgesetzt; sie trifft alle 150 Katalogwerte (Abweichung ≤ 0,01). Daraus ist `ps*` (Gegenrechnung): gleiche Formel, aber Felder, die der Motor für die Waffe nicht auswertet, sind 0 gesetzt: bei Strahlwaffen `blastRadius`, `aoe`, `knockback`, `terrainDamage`, `bounces` (`#resolveHitscan`); bei Selbstwirkungen (`SELF_TARGET_KINDS`) der ganze Wert. Das ist eine Rechnung zur Einordnung, kein Vorschlag für die Formel.

Messung: `scripts/waffen-balance.mjs` (`messeWaffe`), Ziel steht still, Entfernungen 40/90/150/300/500/800/1200/1700 px, **drei Karten-Seeds** je Waffe (Seed = 4242 + (index + Versatz) × 977, Versatz 0, 1000, 2000), Schaden-Fassung 1 (`schaden: 1` im Messskript). Der Bestwert enthält bei Waffen mit Schaden über Zeit einen Tick (Katalogschaden + `damagePerTurn`: Giftpilz 43 = 18 + 25, Lavaelixier 73 = 50 + 23, Verderbniskelch 45 = 30 + 15, Sonnenamulett 51 = 38 + 13, Zauberbuch 63 = 55 + 8). Der Faktor 0,7 zwischen Katalog- und Messschaden der Nahkämpfer (offen in `melee-utility.md`) ist der Schadensfaktor der Klasse Scout (`combatProfile`: scout 0,7, heavy 1,0, artillery 1,3); die Messfigur ist ein Scout. Er wirkt auf Geschosse (`shooting.js`, `weapon.damage * profile.damageMultiplier`), nicht auf Strahlen (`#resolveHitscan` rechnet `weapon.damage` mal Statusfaktor).

**Gesamtschaden je Treffer in der Standard-Schadensfassung 2** (Rechnung aus `config/schaden.js`, `specials.js`; keine Messung): direkt + Tick × Dauer, mit `DOT_FAKTOR` und `DOT_MAX_JE_EINTRAG`. Nicht eingerechnet: die Gesamtgrenze von 20 % der Maximalgesundheit je Zugbeginn, Heilung, Wasser, Stapel. Median über alle 112 Schadenswaffen: 50.

| Waffe | direkt | Malus | Tick × Züge | gesamt | Pause | Munition | Stufe |
|---|---:|---|---:|---:|---:|---:|---|
| Lavaelixier | 50 | brand | 16 × 3 | 98 | 2 | 3 | rare |
| Giftpilz | 18 | gift | 18 × 3 | 72 | 1 | 3 | uncommon |
| Sonnenamulett | 38 | brand | 10 × 3 | 68 | 2 | 3 | rare |
| Zauberbuch der Leere | 55 | fluch | 6 × 2 | 67 | 2 | 3 | rare |
| Verderbniskelch | 30 | fluch | 10 × 2 | 50 | 1 | 3 | rare |

## 3. Beste und Ausreißer je Themenfeld

"Beste" = höchste z-Werte, "Ausreißer" = größte |z|; jeweils 15 von 30 Waffen. Bei Gleichstand entscheidet die Katalogreihenfolge. Feld c ist für magic fast ohne Trennschärfe (20 der 30 Waffen: 3 Munition und Pause 1; alle uncommon), die Liste "Beste" ist dort Reihenfolge der Kennungen. Feld b ist fast reine Strahllänge. Die Felder c und d enthalten Artefakte (rarity, effectMagnitude), siehe Abschnitt 2.

**a Schaden und Zerstörung**

- Beste (15): Quantengewehr 0.77; Astralkugel 0.62; Gedankensturm 0.60; Zauberbuch der Leere 0.54; Lavaelixier 0.50; Chaosmagier 0.41; Windkrieger 0.39; Sonnenamulett 0.30; Verderbniskelch 0.28; Giftpilz 0.07; Spruchrolle -0.33; Goldene Hand -0.36; Goldene Zauberrolle -0.38; Heilspritze -0.43; Traumfänger -0.44
- Ausreißer (15): Dimensionssprung -0.83; Dimensionsriss -0.83; Quantengewehr 0.77; Astralkugel 0.62; Gedankensturm 0.60; Sanduhr -0.54; Dimensionskugel -0.54; Zauberbuch der Leere 0.54; Mutationselixier -0.53; Allsehendes Auge -0.53; Engelssegen -0.52; Eisschild -0.50; Zauberpeitsche -0.50; Lavaelixier 0.50; Weltenbaum -0.49

**b Flug, Reichweite, Zielen**

- Beste (15): Astralkugel 0.66; Zauberbuch der Leere 0.61; Gedankensturm 0.56; Quantengewehr 0.54; Lavaelixier 0.52; Goldene Hand 0.45; Chaosmagier 0.44; Windkrieger 0.38; Heilspritze 0.33; Traumfänger 0.32; Sonnenamulett 0.32; Zauberstiefel 0.28; Würfel des Chaos 0.28; Heilzauber 0.27; Astraltrank 0.25
- Ausreißer (15): Astralkugel 0.66; Zauberbuch der Leere 0.61; Gedankensturm 0.56; Quantengewehr 0.54; Lavaelixier 0.52; Goldene Hand 0.45; Chaosmagier 0.44; Windkrieger 0.38; Heilspritze 0.33; Traumfänger 0.32; Sonnenamulett 0.32; Zauberstiefel 0.28; Würfel des Chaos 0.28; Heilzauber 0.27; Astraltrank 0.25

**c Munition, Abklingzeit, Verfügbarkeit**

- Beste (15): Dimensionssprung 0.69; Goldene Zauberrolle -0.02; Goldene Hand -0.02; Astraltrank -0.02; Zauberstiefel -0.02; Giftpilz -0.02; Heilzauber -0.02; Engelssegen -0.02; Heilspritze -0.02; Chaoselixier -0.02; Mutationselixier -0.02; Traumfänger -0.02; Sanduhr -0.02; Würfel des Chaos -0.02; Eisschild -0.02
- Ausreißer (15): Dimensionssprung 0.69; Astralkugel -0.52; Gedankensturm -0.52; Dimensionsriss -0.50; Zauberbuch der Leere -0.27; Chaosmagier -0.27; Windkrieger -0.27; Lavaelixier -0.27; Quantengewehr -0.27; Sonnenamulett -0.27; Goldene Zauberrolle -0.02; Goldene Hand -0.02; Astraltrank -0.02; Zauberstiefel -0.02; Giftpilz -0.02

**d Sonderwirkung und Status**

- Beste (15): Dimensionsriss 2.06; Dimensionssprung 0.87; Giftpilz 0.77; Windkrieger 0.71; Lavaelixier 0.69; Verderbniskelch 0.44; Goldene Hand 0.13; Zauberpeitsche -0.02; Zauberbuch der Leere -0.04; Astraltrank -0.04; Chaosmagier -0.04; Zauberstiefel -0.04; Heilzauber -0.04; Engelssegen -0.04; Heilspritze -0.04
- Ausreißer (15): Dimensionsriss 2.06; Dimensionssprung 0.87; Giftpilz 0.77; Windkrieger 0.71; Lavaelixier 0.69; Goldene Zauberrolle -0.55; Astralkugel -0.55; Gedankensturm -0.55; Quantengewehr -0.55; Verderbniskelch 0.44; Sonnenamulett -0.14; Goldene Hand 0.13; Zauberbuch der Leere -0.04; Astraltrank -0.04; Chaosmagier -0.04

**e Scoring (Residuum)**

- Beste (15): Gedankensturm 0.54; Astralkugel 0.44; Goldene Zauberrolle 0.30; Sonnenamulett 0.13; Spruchrolle -0.21; Chaosmagier -0.23; Sanduhr -0.28; Dimensionskugel -0.28; Zauberpeitsche -0.28; Mutationselixier -0.29; Allsehendes Auge -0.29; Engelssegen -0.31; Eisschild -0.33; Zauberbuch der Leere -0.34; Weltenbaum -0.34
- Ausreißer (15): Dimensionssprung -2.08; Dimensionsriss -2.07; Windkrieger -0.81; Giftpilz -0.79; Quantengewehr -0.76; Lavaelixier -0.66; Verderbniskelch -0.55; Goldene Hand -0.54; Gedankensturm 0.54; Astralkugel 0.44; Heilspritze -0.42; Traumfänger -0.40; Zauberstiefel -0.38; Würfel des Chaos -0.38; Heilzauber -0.37

Abdeckung: Die Vereinigung aller Listen enthält 30 von 30 Waffen (alle).

## 4. Einzelbeurteilung (30 Waffen)

Urteile: ok / zu stark / zu schwach / Fehlzuordnung / Messartefakt. "Verdacht" heißt: aus Code und Rechnung, nicht im Spiel getestet. Vorschläge sind Testwerte zur Entscheidung, keine Änderung. "Risiko" nennt, was bei einer Umsetzung mitzuziehen wäre. Gemessen = Bestwert je Seed, Reichw. ebenso; ps = Katalog-`powerScore`, ps* = Gegenrechnung aus Motorfeldern (Abschnitt 2). Die Variante A/B bei den Umkreis-Waffen: A = Daten an den Motor anpassen, B = Motor liefert den Umkreis für Strahlen.

| ID | Waffe | Katalog | Gemessen | Stufe ps → ps* | Urteil | Begründung | Vorschlag | Risiko |
|---|---|---|---|---|---|---|---|---|
| pa_081 | Zauberbuch der Leere | Schaden 55, Radius 48, Rückst. 0, Mun. 3, CD 2, Reichw. 636, `void_spell` | 63/63/63; Reichw. 800/680/800 | 97.02 (rare) → 49.50 (uncommon) | **Fehlzuordnung (Umkreis nur Text und Score)** | Beschreibung verspricht "Schaden im Umkreis"; `#resolveHitscan` trifft nur die erste Figur (Radius 48 und aoe ohne Wirkung), im Leistungswert zählen sie mit 47,5 von 97 Punkten. Die echte Stärke ist der Fluch (Art `void`): 55 direkt + 6 je Zug über 2 Züge = 67, dazu halbe Heilung und 15 % weniger eigener Schaden beim Ziel. Reichweite 636 und Abklingzeit 2 passen dazu. | A (Daten): `blastRadius` 48 → 0, `aoe` wahr → falsch, Text "Schaden und anhaltender Fluch" (ps 97,02 → 49,5, rare → uncommon). B (Motor): Strahl mit Fläche | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_082 | Goldene Zauberrolle | Schaden 44, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 719, `magic_bolt` | 18.8/19.9/18.7; Reichw. 300/300/300 | 37.62 (common) → 37.62 (common) | **Messartefakt (Wert unter Erwartung, Ursache offen)** | Gemessen 18,7 bis 19,9 bei 90 bis 300 px, Katalog 44; der Scout-Faktor 0,7 (`combatProfile`, wirkt nur auf Geschosse) erklärt 30,8, nicht 18,8. Treffer nur bis 300 px gefunden, Katalogreichweite 719 (Sichtlinienpflicht, `aimPreview`). Ich habe die Ursache nicht untersucht. | keine, bevor die Messung mit der Klasse Heavy (Faktor 1,0) wiederholt ist | – |
| pa_083 | Goldene Hand | Schaden 46, Radius 0, Rückst. 70, Mun. 3, CD 1, Reichw. 532, `magic_hand` | 46/46/46; Reichw. 300/500/390 | 48.96 (uncommon) → 41.40 (common) | **ok** | Strahl 46 (gemessen 46 bis 300 bis 500 px), Abklingzeit 1, Art `arcane` (Rüstung wirkt zur Hälfte). Beschreibung verspricht keinen Rückstoß; `knockback` 70 wirkt bei Strahlen nicht und treibt den Leistungswert um 7,6 auf 48,96 (uncommon, ohne: 41,4 common). | `knockback` 70 → 0 (nur Score, Stufe uncommon → common) | Beute-Gewichtung; Prüfsummen |
| pa_084 | Astraltrank | Schaden 34, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 393, `buff` | kein Schuss (Selbstwirkung) / 0 | 30.60 (common) → 0.00 (common) | **zu schwach (Verdacht, rechnerisch)** | Verstärkung ×1,5 gilt nach dem Code genau einen eigenen Zug (`addBoost(.., 2)`, Abzug beim nächsten Zugbeginn; nachgerechnet am `StatusStore`). Der Wurf beendet den eigenen Zug (`endTurn`): Zug 1 ohne Schaden, Zug 2 mit ×1,5 ergibt 1,5 Schuss-Einheiten gegen 2,0 bei zwei normalen Schüssen, also 25 % weniger Schaden (Annahme: ein Schuss je Zug). `damage` 34 und `maxRange` 393 haben bei Selbstwirkungen keine Funktion. | Test: `SPECIAL_DEFAULTS.boostMultiplier` 1,5 → 2,0 (Break-even) oder Dauer auf drei Züge; `damage` 34 → 0 (Wirkung unverändert, ps 30,6 → 0) | Gilt für alle fünf Verstärkungswaffen (auch Reliktkugel, ultimate); Zahlen in `specials.js` sind gemeinsam; Replay-Fassung nötig (§2) |
| pa_085 | Chaosmagier | Schaden 45, Radius 45, Rückst. 0, Mun. 3, CD 2, Reichw. 520, `random_spell` | kein Schuss (Selbstwirkung) / 0 | 85.73 (rare) → 0.00 (common) | **Fehlzuordnung (Umkreis und Score)** | Zufallswirkung aus sechs Selbstwirkungen (heal, shield, damage_boost, armor, ammo, move); Radius 45 und aoe haben keine Wirkung, zählen aber zusammen 45,2 von 85,7 Punkten (ps* = 0, rare → common). Gegenüber Mutationselixier und Würfel (gleicher Pool) nur Abklingzeit 2 statt 1 und höhere Heil- und Schildwerte über `damage` 45 (Heilung 54, Schild 50). | `blastRadius` 45 → 0, `aoe` → falsch (ps 0 nach Methode, Stufe common) | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_086 | Windkrieger | Schaden 42, Radius 46, Rückst. 78, Mun. 3, CD 2, Reichw. 485, `whirlwind` | 42/42/42; Reichw. 500/500/500 | 92.21 (rare) → 37.80 (common) | **Fehlzuordnung (Umkreis, Rückstoß und Score)** | Beschreibung: "Gegner im Umkreis zum Schützen heranzieht". Der Motor zieht nur das getroffene Ziel 90 px heran (`whirlwind` → PULL); Radius 46, aoe und `knockback` 78 wirken bei Strahlen nicht. Leistungswert 92,21 rare gegen ps* 37,8 common; gemessen 42 bis 500 px. | Text "zieht den getroffenen Gegner heran"; `blastRadius` 46 → 0, `aoe` → falsch, `knockback` 78 → 0 | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_087 | Dimensionssprung | Schaden 0, Radius 0, Rückst. 0, Mun. 5, CD 0, Reichw. 312, `teleport` | kein Schuss (Selbstwirkung) / 0 | 0.00 (common) → 0.00 (common) | **ok (Nutzwaffe; Score 0 ist Gruppenfrage)** | Versetzt um 60 px (zuerst nach rechts, sonst nach links, ohne Blick auf den Zielwinkel), 5 Munition, keine Pause: die häufigste Versetzung der Gruppe, passend zu "oft einsetzbar". `effectMagnitude` 72 wird vom Motor nicht gelesen und erzeugt z_sonder 0,87 (Messartefakt). Leistungswert 0 liegt 117,5 Ränge unter dem Mittel a bis d. | keine an der Waffe; Nutzwert im Leistungswert (Entscheidung, siehe Abschnitt 7) | – |
| pa_088 | Dimensionsriss | Schaden 0, Radius 0, Rückst. 0, Mun. 2, CD 2, Reichw. 312, `teleport` | kein Schuss (Selbstwirkung) / 0 | 0.00 (common) → 0.00 (common) | **zu schwach** | Gleiche Wirkung wie Dimensionssprung und Zauberstiefel (60 px), aber nur 2 Munition und Abklingzeit 2: in jeder Zahl schlechter als die Schwestern. `effectMagnitude` 165 (z_sonder 2,06, Messartefakt) deutet auf eine größere Weite hin, die der Motor nicht liest. | Motor liest `effectMagnitude` als Weite (72 und 165 px); Daten-Notlösung: `maxAmmo` 2 → 3, `cooldown` 2 → 1 (dann gleich Zauberstiefel) | Motoränderung verändert alte Replays, Fassungsmarke nötig (§2); Weite 165 px prüfen (Astralross springt 140) |
| pa_089 | Zauberstiefel | Schaden 36, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 416, `mobility` | kein Schuss (Selbstwirkung) / 0 | 32.40 (common) → 0.00 (common) | **ok** | Versetzt 60 px, 3 Munition, Abklingzeit 1; Beschreibung stimmt. `damage` 36 wirkt nicht (Leistungswert 32,4 für eine Selbstwirkung). | keine; Score siehe Abschnitt 7 | – |
| pa_090 | Giftpilz | Schaden 18, Radius 38, Rückst. 0, Mun. 3, CD 1, Reichw. 312, `poison_zone` | 43/43/43; Reichw. 300/300/300 | 78.57 (uncommon) → 38.70 (common) | **Fehlzuordnung (Umkreis nur Text und Score)** | Beschreibung "im Umkreis vergiftet": nur das Ziel wird vergiftet; Radius und aoe zählen 39,9 Punkte (ps 78,57 uncommon gegen ps* 38,7 common). Wirkung selbst: 18 direkt + 18 je Zug über 3 Züge = 72 (1,44 × Median 50), Gift stapelt zweifach, Heilung ab 20 entfernt einen Stapel; gemessen 43 (= 18 + ein Tick 25). | Text "vergiftet den getroffenen Gegner"; `blastRadius` 38 → 0, `aoe` → falsch (ps 38,7, common) | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_091 | Astralkugel | Schaden 58, Radius 55, Rückst. 0, Mun. 3, CD 3, Reichw. 670, `astral_burst` | 58/58/58; Reichw. 800/640/770 | 105.08 (rare) → 52.20 (uncommon) | **Fehlzuordnung (Umkreis nur Text und Score)** | Beschreibung "schlägt im Umkreis ein": Strahl, nur ein Ziel. 58 direkt bei Abklingzeit 3 und nur 3 Munition: ohne Fläche ist das weniger als Quantengewehr (56, Pause 2, durchschlägt) und weit unter Zauberbuch (67 gesamt, Pause 2). ps 105,08 rare gegen ps* 52,2 uncommon; gemessen 58 bis 800 px. | A: `blastRadius` 55 → 0, `aoe` → falsch und `cooldown` 3 → 2. B: Fläche im Strahl (dann Werte belassen) | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_092 | Heilzauber | Schaden 35, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 404, `heal` | kein Schuss (Selbstwirkung) / 0 | 31.50 (common) → 0.00 (common) | **ok** | Heilt 42 (35 × 1,2), das ist über der Schwelle 40: entfernt auch Fluch und alles Gift, ein Gegenmittel. 3 Munition, Abklingzeit 1. Doppelt zu Heilspritze (47). | keine | – |
| pa_093 | Engelssegen | Schaden 30, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 347, `shield_heal` | kein Schuss (Selbstwirkung) / 0 | 27.00 (common) → 0.00 (common) | **ok** | Schild 40 (Untergrenze, 30 × 1,1 = 33 darunter), stapelt bis 120, kein Zeitablauf. Identisch mit Eisschild. | keine; Unterscheidung zum Eisschild siehe dort | – |
| pa_094 | Heilspritze | Schaden 39, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 451, `instant_heal` | kein Schuss (Selbstwirkung) / 0 | 35.10 (common) → 0.00 (common) | **ok** | Heilt 47 (39 × 1,2), entfernt Fluch und Gift wie der Heilzauber; gleiche Munition und Pause. Der Unterschied sind 5 Lebenspunkte. | keine | – |
| pa_095 | Chaoselixier | Schaden 34, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 393, `random_buff` | kein Schuss (Selbstwirkung) / 0 | 30.60 (common) → 0.00 (common) | **Fehlzuordnung (Name verspricht Zufall, Dublette)** | Spezialname `random_buff` und Name "Chaoselixier" deuten auf einen zufälligen Buff; der Motor gibt festes ×1,5 wie Astraltrank. Beschreibung ("verstärkt den eigenen Schaden") stimmt mit dem Motor. Wirkung ist eine von vier gleichen (Astraltrank, Sanduhr, Weltenbaum). | Entscheidung: Zufallswirkung (Pool wie `random`) oder Namen und Special angleichen; Verstärkung siehe Astraltrank | Replay-Fassung bei Motoränderung (§2) |
| pa_096 | Mutationselixier | Schaden 29, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 335, `mutation` | kein Schuss (Selbstwirkung) / 0 | 26.10 (common) → 0.00 (common) | **ok** | Zufallswirkung mit gleichem Pool wie Würfel und Spruchrolle; Beschreibung stimmt. Heilung 35 und Schild 40 (Untergrenzen). | keine; Unterscheidung der vier Zufallswaffen (Pools) ist eine Entscheidung | – |
| pa_097 | Traumfänger | Schaden 38, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 439, `sleep` | 30/30/30; Reichw. 370/580/410 | 34.20 (common) → 34.20 (common) | **zu stark (Verdacht, rechnerisch)** | Art `psychic`, `sleep` → Betäubung: Ziel setzt einen Zug aus (kein Frost, denn die Art ist nicht Eis), danach ein Zug Schutz. Das ist die einzige Zugsperre der Gruppe, auf 439 px, bei nur 1 Pause und 3 Munition; der Betäubungsschutz (`zugBeginn`) (ein Zug) erlaubt nach meiner Lektüre die Sperre trotzdem in jeder zweiten Runde. Der Kriegshammer (gleiche Sperre) hat Reichweite 110. Leistungswert 34,2 common zählt die Sperre nicht (Rangdifferenz -37). | Test: `cooldown` 1 → 2 (halbiert die Sperrhäufigkeit); Score: Sperre im Wert abbilden (Entscheidung) | Nur Spieltest belegt es; Verdacht aus Code |
| pa_098 | Lavaelixier | Schaden 50, Radius 50, Rückst. 0, Mun. 3, CD 2, Reichw. 578, `lava` | 73/73/73; Reichw. 710/700/630 | 114.30 (rare) → 65.25 (uncommon) | **zu stark (Verdacht, rechnerisch) und Umkreis nur Text** | 50 direkt + 16 je Zug über 3 Züge (Obergrenze `DOT_MAX_JE_EINTRAG` erreicht) = 98, fast das Doppelte des Medians 50 aller Schadenswaffen und höchster Wert der Gruppe; Pause nur 2. Brand ist leicht zu löschen (Wasser, Eis, Heilung ab 20). Radius 50 und aoe ohne Wirkung. Gemessen 73 (= 50 + 23). | Test: `damage` 50 → 40 und `elemental.fire` 45 → 30, `blastRadius` 0, `aoe` falsch: gesamt 76, ps 49,5 (uncommon) | Brand-Zahlen (`DOT_FAKTOR`) gemeinsam mit Feuerfaust, Feuerwesen, Feuerball; Prüfsummen |
| pa_099 | Sanduhr | Schaden 28, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 324, `time_control` | kein Schuss (Selbstwirkung) / 0 | 25.20 (common) → 0.00 (common) | **zu schwach (Verdacht, rechnerisch)** | Wie Astraltrank: ×1,5 für einen Zug gegen einen Zug Verzicht. "Sanduhr, die die Zeit beugt" verspricht mehr als eine Verstärkung (Name `time_control`). | wie Astraltrank; Sanduhr könnte als Einzige die Dauer verlängern (Entscheidung) | wie Astraltrank |
| pa_100 | Würfel des Chaos | Schaden 36, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 416, `random_effect` | kein Schuss (Selbstwirkung) / 0 | 32.40 (common) → 0.00 (common) | **ok** | Zufallswirkung, gleicher Pool wie Mutationselixier; Heilung 43, Schild 40. | keine | – |
| pa_101 | Eisschild | Schaden 32, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 370, `shield_freeze` | kein Schuss (Selbstwirkung) / 0 | 28.80 (common) → 0.00 (common) | **Fehlzuordnung (Name verspricht Eis, Dublette)** | Spezialname `shield_freeze`, Art `ice`: Der Motor bildet nur den Schild ab (40, Untergrenze), identisch zum Engelssegen. Beschreibung "Schild aus Eis" ist stimmig; ein Einfrieren des Angreifers findet nicht statt. Im Leistungswert 28,8 gegen 27 bei gleicher Wirkung. | `damage` 32 → 45 (Schild 50 statt 40) als Unterscheidung (Test), oder echte Eiswirkung (Entscheidung) | Schildwerte stapeln bis 120 |
| pa_102 | Gedankensturm | Schaden 52, Radius 60, Rückst. 0, Mun. 3, CD 3, Reichw. 601, `mind_aoe` | 52/52/52; Reichw. 770/670/700 | 103.50 (rare) → 46.80 (uncommon) | **Fehlzuordnung (Umkreis nur Text und Score)** | Wie Astralkugel: "Mentaler Sturm im Umkreis" ist ein Strahl auf ein Ziel; Radius und aoe zählen 56,7 von 103,5 Punkten (rare gegen ps* 46,8 uncommon). 52 direkt bei Abklingzeit 3, Art `psychic` (Rüstung zur Hälfte). Gemessen 52 bis 700 px. | A: `blastRadius` 60 → 0, `aoe` → falsch, `cooldown` 3 → 2. B: Fläche im Strahl | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_103 | Verderbniskelch | Schaden 30, Radius 48, Rückst. 0, Mun. 3, CD 1, Reichw. 347, `corruption` | 45/45/45; Reichw. 300/300/300 | 88.02 (rare) → 40.50 (common) | **Fehlzuordnung (Umkreis nur Text und Score)** | Beschreibung "im Umkreis ... verflucht": Radius und aoe wirkungslos, tragen 47,5 von 88 Punkten (rare gegen ps* 40,5 common). Wirkung: 30 + 10 je Zug (Obergrenze Fluch) über 2 Züge = 50, Fluch stimmt mit Beschreibung. Gemessen 45 (= 30 + 15). | Text "verflucht den getroffenen Gegner"; `blastRadius` 48 → 0, `aoe` → falsch | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_104 | Quantengewehr | Schaden 56, Radius 0, Rückst. 0, Mun. 3, CD 2, Reichw. 1031, `quantum_shot` | 51.3/49.8/50.2; Reichw. 490/480/500 | 53.01 (uncommon) → 53.01 (uncommon) | **ok** | Geschoss (Tempo 98), 56 direkt, durchschlägt eine Figur, Reichweite 1031, Sichtlinie nötig, Pause 2, Art `energy` (Schildbrecher). Gemessen 46 bis 51 bis 500 px (Scout-Faktor 0,7 und Durchschlag erklären das nicht ganz; nicht geklärt). Leistungswert 53,01 zählt Durchschlag nur mit 6 Punkten (Rangdifferenz -33). | keine | – |
| pa_105 | Spruchrolle | Schaden 48, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 747, `scroll_spell` | kein Schuss (Selbstwirkung) / 0 | 43.20 (common) → 0.00 (common) | **ok** | Zufallswirkung (gleicher Pool); als einzige Zufallswaffe `delivery` Geschoss, aber Selbstwirkung erzeugt kein Geschoss (`fire`), also ohne Folge. Heilung 58, Schild 53 (höchste der vier wegen `damage` 48). | `delivery` auf `hitscan` angleichen (nur Daten) | Prüfsummen |
| pa_106 | Sonnenamulett | Schaden 38, Radius 40, Rückst. 0, Mun. 3, CD 2, Reichw. 439, `solar` | 51/51/51; Reichw. 500/500/500 | 86.85 (rare) → 45.45 (uncommon) | **Fehlzuordnung (Umkreis nur Text und Score)** | Beschreibung "Sonnenlicht im Umkreis": Radius 40 wirkungslos (ps 86,85 rare gegen ps* 45,45 uncommon). `solar` steht nicht in `SPECIAL_EFFECTS`; der Brand kommt aus der Ableitung `elementalEffectFor` (fire 25 → 10 je Zug über 3 Züge, gesamt 68). Der Brand steht nicht in der Beschreibung. Heilig +25 % gegen Verfluchte ist erreichbar, aber nur wenn das Ziel Fluch trägt (nur Magiewaffen mit dunkler Art setzen ihn). | Text um den Brand ergänzen; `blastRadius` 40 → 0, `aoe` → falsch | Stufe und Beute-Gewichtung ändern sich; Prüfsummen (`waffen-fassung.test.js`) und `npm run weapons:build` nachziehen; Variante B (Fläche im Motor) ist eine Regeländerung mit Replay-Fassungsmarke (§2) |
| pa_107 | Allsehendes Auge | Schaden 29, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 335, `target_scan` | kein Schuss (Selbstwirkung) / 0 | 26.10 (common) → 0.00 (common) | **Fehlzuordnung (Wirkung ohne Folge)** | `target_scan` → Aufdecken: Der Schütze ist zwei Züge "aufgedeckt". Gelesen: `isRevealed` hat im Spielcode keinen Leser, der Client schreibt nur eine Protokollzeile; Beschreibung "Späht das Feld aus" und Wirkungstext sagen verschieden, wer aufgedeckt wird. Eine Waffe mit 29 Schaden-Wert, die nichts bewirkt. | Entscheidung: Aufdecken mit Wirkung füllen (z. B. Zielvorschau der Gegner) oder Waffe umwidmen; `damage` 29 → 0 | Motoränderung mit Replay-Fassungsmarke (§2) |
| pa_108 | Zauberpeitsche | Schaden 32, Radius 0, Rückst. 55, Mun. 3, CD 1, Reichw. 370, `magic_whip` | 0/32/0; Reichw. 0/300/0 | 33.00 (common) → 27.36 (common) | **Messartefakt (Sichtlinie) und Score leicht überhöht** | Gemessen 0 / 32 / 0 in drei Seeds: Sichtlinienwaffe am Hang, wie Energiefaust. Katalog 32 direkt, `knockback` 55 wirkt bei Strahlen nicht (5,6 von 33 Punkten). Beschreibung stimmt (kein Rückstoß-Versprechen). | `knockback` 55 → 0 (ps 27,36) | Prüfsummen |
| pa_109 | Weltenbaum | Schaden 33, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 381, `area_buff` | kein Schuss (Selbstwirkung) / 0 | 29.70 (common) → 0.00 (common) | **zu schwach (Verdacht, rechnerisch)** | Wie Astraltrank. Spezialname `area_buff` und Name "Weltenbaum" deuten auf ein Team oder Fläche; die Beschreibung ("den eigenen Schaden") und der Motor sagen nur Selbstverstärkung. | wie Astraltrank; Fläche (Team) als Unterscheidung wäre eine Entscheidung | wie Astraltrank |
| pa_110 | Dimensionskugel | Schaden 28, Radius 0, Rückst. 0, Mun. 3, CD 1, Reichw. 324, `dimension_orb` | kein Schuss (Selbstwirkung) / 0 | 25.20 (common) → 0.00 (common) | **Fehlzuordnung (Dublette von Zauberstiefel)** | Gleiche Wirkung (60 px), gleiche Munition und Pause wie Zauberstiefel; `damage` 28 statt 36 ohne Folge, Leistungswert 25,2 gegen 32,4. | Entscheidung: Weite über `effectMagnitude` unterscheiden oder `damage` 28 → 0 | Replay-Fassung bei Motoränderung (§2) |

## 5. Matrix (Markdown; CSV in `magic.csv`)

| id | Waffe | Kat. | z_schaden | z_flug | z_munition | z_sonder | z_scoring | powerScore | Stufe | Urteil |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| pa_081 | Zauberbuch der Leere | magic | 0.54 | 0.61 | -0.27 | -0.04 | -0.34 | 97.02 | rare | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_082 | Goldene Zauberrolle | magic | -0.38 | 0.14 | -0.02 | -0.55 | 0.30 | 37.62 | common | Messartefakt (Wert unter Erwartung, Ursache offen) |
| pa_083 | Goldene Hand | magic | -0.36 | 0.45 | -0.02 | 0.13 | -0.54 | 48.96 | uncommon | ok |
| pa_084 | Astraltrank | magic | -0.48 | 0.25 | -0.02 | -0.04 | -0.35 | 30.6 | common | zu schwach (Verdacht, rechnerisch) |
| pa_085 | Chaosmagier | magic | 0.41 | 0.44 | -0.27 | -0.04 | -0.23 | 85.73 | rare | Fehlzuordnung (Umkreis und Score) |
| pa_086 | Windkrieger | magic | 0.39 | 0.38 | -0.27 | 0.71 | -0.81 | 92.21 | rare | Fehlzuordnung (Umkreis, Rückstoß und Score) |
| pa_087 | Dimensionssprung | magic | -0.83 | 0.13 | 0.69 | 0.87 | -2.08 | 0 | common | ok (Nutzwaffe; Score 0 ist Gruppenfrage) |
| pa_088 | Dimensionsriss | magic | -0.83 | 0.13 | -0.50 | 2.06 | -2.07 | 0 | common | zu schwach |
| pa_089 | Zauberstiefel | magic | -0.46 | 0.28 | -0.02 | -0.04 | -0.38 | 32.4 | common | ok |
| pa_090 | Giftpilz | magic | 0.07 | 0.13 | -0.02 | 0.77 | -0.79 | 78.57 | uncommon | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_091 | Astralkugel | magic | 0.62 | 0.66 | -0.52 | -0.55 | 0.44 | 105.08 | rare | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_092 | Heilzauber | magic | -0.47 | 0.27 | -0.02 | -0.04 | -0.37 | 31.5 | common | ok |
| pa_093 | Engelssegen | magic | -0.52 | 0.18 | -0.02 | -0.04 | -0.31 | 27 | common | ok |
| pa_094 | Heilspritze | magic | -0.43 | 0.33 | -0.02 | -0.04 | -0.42 | 35.1 | common | ok |
| pa_095 | Chaoselixier | magic | -0.48 | 0.25 | -0.02 | -0.04 | -0.35 | 30.6 | common | Fehlzuordnung (Name verspricht Zufall, Dublette) |
| pa_096 | Mutationselixier | magic | -0.53 | 0.16 | -0.02 | -0.04 | -0.29 | 26.1 | common | ok |
| pa_097 | Traumfänger | magic | -0.44 | 0.32 | -0.02 | -0.04 | -0.40 | 34.2 | common | zu stark (Verdacht, rechnerisch) |
| pa_098 | Lavaelixier | magic | 0.50 | 0.52 | -0.27 | 0.69 | -0.66 | 114.3 | rare | zu stark (Verdacht, rechnerisch) und Umkreis nur Text |
| pa_099 | Sanduhr | magic | -0.54 | 0.15 | -0.02 | -0.04 | -0.28 | 25.2 | common | zu schwach (Verdacht, rechnerisch) |
| pa_100 | Würfel des Chaos | magic | -0.46 | 0.28 | -0.02 | -0.04 | -0.38 | 32.4 | common | ok |
| pa_101 | Eisschild | magic | -0.50 | 0.22 | -0.02 | -0.04 | -0.33 | 28.8 | common | Fehlzuordnung (Name verspricht Eis, Dublette) |
| pa_102 | Gedankensturm | magic | 0.60 | 0.56 | -0.52 | -0.55 | 0.54 | 103.5 | rare | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_103 | Verderbniskelch | magic | 0.28 | 0.18 | -0.02 | 0.44 | -0.55 | 88.02 | rare | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_104 | Quantengewehr | magic | 0.77 | 0.54 | -0.27 | -0.55 | -0.76 | 53.01 | uncommon | ok |
| pa_105 | Spruchrolle | magic | -0.33 | 0.18 | -0.02 | -0.04 | -0.21 | 43.2 | common | ok |
| pa_106 | Sonnenamulett | magic | 0.30 | 0.32 | -0.27 | -0.14 | 0.13 | 86.85 | rare | Fehlzuordnung (Umkreis nur Text und Score) |
| pa_107 | Allsehendes Auge | magic | -0.53 | 0.16 | -0.02 | -0.04 | -0.29 | 26.1 | common | Fehlzuordnung (Wirkung ohne Folge) |
| pa_108 | Zauberpeitsche | magic | -0.50 | 0.22 | -0.02 | -0.02 | -0.28 | 33 | common | Messartefakt (Sichtlinie) und Score leicht überhöht |
| pa_109 | Weltenbaum | magic | -0.49 | 0.23 | -0.02 | -0.04 | -0.34 | 29.7 | common | zu schwach (Verdacht, rechnerisch) |
| pa_110 | Dimensionskugel | magic | -0.54 | 0.15 | -0.02 | -0.04 | -0.28 | 25.2 | common | Fehlzuordnung (Dublette von Zauberstiefel) |

## 6. Güte des Scorings

Spearman-Rangkorrelation (mittlere Ränge bei Gleichstand) von `powerScore` gegen den Mittelwert der Felder a bis d:

| Menge | n | Spearman rho |
|---|---:|---:|
| Gesamtkatalog | 150 | **0.35** |
| magic | 30 | **0.61** |
| magic, nur Waffen mit Schaden am Ziel (ohne Selbstwirkungen) | 13 | 0.63 |
| magic, Gegenrechnung ps* statt ps | 30 | 0.55 |

Je Feld, magic (powerScore gegen das einzelne Feld): a 0.96, b 0.72, c -0.61, d -0.17. Gesamtkatalog zum Vergleich: a 0.91, b 0.07, c -0.29, d -0.02.

Einordnung:

- Der Leistungswert ist auch in magic im Wesentlichen ein Schadens-und-Flächenwert (a 0.96). Die Sonderwirkung geht nicht ein (d -0.17): Traumfänger (Zugsperre), Giftpilz, Lavaelixier (Schaden über Zeit), Windkrieger (Heranziehen) und alle Selbstwirkungen bleiben im Wert unbewertet, außer über `damage` und den Elementarwert.
- Die größten Rangabweichungen (Rang powerScore minus Rang Mittel a bis d von 150, positiv = Wert höher als die Merkmale): Dimensionssprung -117.5; Dimensionsriss -116.5; Heilzauber -43.5; Astraltrank -43; Chaoselixier -43; Weltenbaum -43; Zauberstiefel -42; Engelssegen -42; Würfel des Chaos -42; Mutationselixier -41; Eisschild -41; Allsehendes Auge -41. Die zwei Versetzer mit powerScore 0 sind nach unten die Spitze (-117,5 und -116,5 im Katalog); die größten positiven Abweichungen haben Gedankensturm und Astralkugel, deren Umkreis nicht wirkt.
- Stufen der 30: rare 8, common 19, uncommon 3. Mit ps* (Umkreis und Selbstwirkungen herausgerechnet): uncommon 6, common 24. Von den 8 `rare` bleibt mit ps* keine `rare`.
- Stufe und mittleres Mittel a bis d (Gesamtkatalog): common n=63, ps 30.8, Mittel -0.07; uncommon n=32, ps 60.9, Mittel -0.04; rare n=42, ps 100.2, Mittel 0.09; epic n=8, ps 147.0, Mittel 0.24; legendary n=5, ps 288.5, Mittel 0.47.
- `rarity`: alle 30 sind `uncommon` (Block pa_081 bis pa_120), unabhängig von Stärke; das Scoring ist davon unabhängig, Feld c aber nicht (Abschnitt 2).

## 7. Sofort umsetzbar und Entscheidungsbedarf

### Sofort umsetzbar (eindeutig, ohne Wirkung im Spiel)

Änderungen am Katalog laufen über `project_armageddon_weapons_v1.json` und `npm run weapons:build`, danach `npm test` und `npm run check:docs` (Prüfsummen, Invarianten). Diese Punkte ändern nur Leistungswert, Stufe und Text:

- Variante A für die neun Umkreis-Strahlen: `blastRadius` → 0, `aoe` → falsch, `knockback` → 0 (Goldene Hand, Windkrieger, Zauberpeitsche) und Beschreibungen von Zauberbuch, Windkrieger, Giftpilz, Astralkugel, Gedankensturm, Verderbniskelch, Sonnenamulett (Sonnenamulett: Brand ergänzen) auf "getroffener Gegner" setzen.
- Spruchrolle: `delivery` projectile → hitscan (Selbstwirkung erzeugt ohnehin kein Geschoss).

### Braucht Entscheidung

- **Umkreis für Strahlen im Motor (Variante B)** statt Variante A: betrifft auch Waffen anderer Kategorien (siehe `melee-utility.md`); Regeländerung mit Replay-Fassungsmarke (§2). Danach wären Astralkugel (58, Pause 3) und Gedankensturm (52, Pause 3) neu zu prüfen.
- **Verstärkung** (Astraltrank, Chaoselixier, Sanduhr, Weltenbaum, Reliktkugel): Multiplikator oder Dauer anheben (Test: ×2,0 für einen Zug oder ×1,5 für drei Züge = Break-even); gemeinsame Zahl in `specials.js`, Replay-Fassung nötig.
- **Dimensionsriss und Dimensionssprung:** `effectMagnitude` als Weite lesen (72 und 165 px), sonst Notlösung Munition/Pause angleichen.
- **Allsehendes Auge:** Aufdecken mit einer Wirkung füllen oder die Waffe umwidmen.
- **Lavaelixier, Traumfänger:** Zahlen prüfen, erst im Spiel testen (nur Verdacht aus Code).
- **Dubletten** (Verstärkung ×4, Zufall ×4, Schild ×2, Versetzen ×4): Unterscheidung der Waffen untereinander.
- **Nutzwert im Leistungswert** für Selbstwirkungen (Heilung, Schild, Verstärkung, Versetzen): derzeit zählt `damage`, das dort kein Schaden ist. Eigene Formel nötig (wie in `melee-utility.md`).
- Zünderwaffen +15 %: in magic keine Zünderwaffe (`fuseTime` überall 0); `homing` 5 → 0,5: in magic ohne Wirkung (`homing` überall 0).

## 8. Grenzen dieser Auslese

- Die Messung ist ein Hügel-Preset mit drei Seeds und grober Entfernungsreihe; die Messfigur ist ein Scout (Faktor 0,7 für Geschosse). Selbstwirkungen ergeben konstruktionsbedingt 0.
- Goldene Zauberrolle (18,7 bis 19,9 bei Katalog 44) und Quantengewehr (46 bis 51 bei Katalog 56) weichen von der Erwartung (Faktor 0,7) ab; die Ursache habe ich nicht geklärt.
- Alle Urteile mit "Verdacht" und alle Vergleiche "zu stark/zu schwach" bei Verstärkung und Zugsperre stützen sich auf gelesenen Code und Rechnung (ein Schuss je Zug angenommen), nicht auf Spielversuche.
- z-Werte hängen an den Festlegungen aus `melee-utility.md` (Richtung von gravityScale und delivery, Gleichgewichtung der Merkmale, `rarity` in Feld c, `effectMagnitude`).
- Die Werte "Gesamtschaden Fassung 2" lassen Heilung, Wasser, Stapel und die 20-Prozent-Grenze aus.
