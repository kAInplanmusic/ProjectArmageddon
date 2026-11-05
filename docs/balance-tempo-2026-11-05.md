# GP-4 Tempo: Waffenfassung 15 (`WAFFEN_TEMPO`) — Messung vorher/nachher

*Stand 2026-11-05. Paket GP-4 aus `docs/plan-produktion.md`; Einzelliste
`docs/TODO-SSOT.md` (Zeile GP-4).*

## 1. Ziel und Vorgehen

Ziel: **eine Figur fällt nach 3 bis 4 guten Treffern**. Lebenspunkte bleiben
(Klassenfassung 3: Nahkampf 130, Fernkampf 100, Okkultist 70); angehoben wird der
Schaden je Waffenkategorie als eigene Datenschicht `WAFFEN_F15_WERTE`
(`src/shared/config/waffen-f15.js`). Der Katalog `config/weapons.js` bleibt
unverändert, die Fassungen 1 bis 14 bleiben bitgleich (Prüfsumme
`aa032474…` in `tests/waffen-fassung.test.js`).

Gemessen wurde mit dem vorhandenen Werkzeug `scripts/waffen-balance.mjs`
(`npm run balance:waffen`). Es zielt je Waffe (Gitter aus Winkel × Kraft,
`aimPreview`), misst den besten Treffer auf der besten Entfernung gegen ein
**stehendes Ziel** mit der Gesundheit der jeweiligen Klasse und rechnet daraus
die **Schüsse bis Sieg (STK)**. Beide Läufe sind deterministisch (fester Seed je
Waffe) und liegen als Rohdaten im Repo:

| Lauf | Datei | Fassung |
| :-- | :-- | :-- |
| vorher | `docs/balance-auslese/waffen-vorher.json` | 14 (AERO-Windfaktor) |
| nachher | `docs/balance-auslese/waffen-nachher.json` | 15 (`WAFFEN_TEMPO`) |

Aufruf:

```
node scripts/waffen-balance.mjs --waffen=14 --json > docs/balance-auslese/waffen-vorher.json
node scripts/waffen-balance.mjs --waffen=15 --json > docs/balance-auslese/waffen-nachher.json
npm run balance:tempo        # scripts/balance-tempo-vergleich.mjs, die Tabelle unten
```

## 2. Warum die „37" aus dem Plan kein Maß für „gute Treffer" ist

`docs/TODO-SSOT.md` trug die Zahl „Median STK 37 bei 200 HP/854 px" aus
`abnahme-balance-2026-10-01.md`. Diese Zahl stammt aus `scripts/balance-report.mjs`
mit **einer** Messdistanz (Startentfernung 854 px) und festen Winkeln. Aus derselben
Messung, die hier als „vorher" dient, lässt sich die Ursache ablesen: Auf 800 px
richten **98 von 112** Waffen mit Schaden am Ziel **null** Schaden an — sie reichen
schlicht nicht so weit (Baseballschläger 40 px, Katana 71 px, Granaten bleiben
liegen). Ein Median über diese Grundgesamtheit misst deshalb „Schüsse auf eine
Entfernung, für die die halbe Waffe nicht gebaut ist", nicht „gute Treffer".

Die gezielte Messung (beste Entfernung je Waffe) ist die Zahl, die dem Satz
„eine Figur fällt nach N guten Treffern" entspricht. Sie zeigt zugleich, wo das
echte Problem lag: nicht im Durchschnitt, sondern in der **langsamen Hälfte**.

## 3. Vorher (Fassung 14)

Median über die 112 Waffen mit Schaden am Ziel:

| Klasse | Median Schüsse bis Sieg | Mittel |
| :-- | --: | --: |
| Nahkampf (130 LP) | 5 | 5,38 |
| Fernkampf (100 LP) | 4 | 4,25 |
| Okkultist (70 LP) | 3 | 3,13 |

| Kategorie | Waffen | Median Schaden | Median STK (Fernkampf) |
| :-- | --: | --: | --: |
| melee | 21 | 22,4 | 5 |
| ranged | 18 | 16,1 | 6,5 |
| heavy_ranged | 20 | 25,4 | 4 |
| elemental | 18 | 33,5 | 3 |
| magic | 13 | 46,0 | 3 |
| utility | 4 | 48,0 | 3 |
| tech | 12 | 56,5 | 2 |
| ultimate | 6 | 64,4 | 2 |

Der Median lag mit 4 (Fernkampf) schon am Rand des Bands — aber `ranged` brauchte
6,5 und `melee` 5 Treffer, die schwächsten Vertreter bis zu 12. Genau diese beiden
Kategorien stellen 40 der 150 Waffen und prägen das Gefecht.

## 4. Die Faktoren (und warum nicht alle Kategorien steigen)

| Kategorie | Faktor | Begründung |
| :-- | --: | :-- |
| melee | ×1,50 | 5 → 3 Treffer; Nahkampf ist die zweitgrößte Gruppe (21 Waffen) |
| ranged | ×2,00 | 6,5 → 4 Treffer; die langsamste Kategorie, Median-Schaden nur 16,1 |
| heavy_ranged | ×1,30 | 4 Treffer; Median-Schaden 25,4 → 32,0 — die Trefferzahl bleibt, weil der Median der Verteilung an der Rundungsgrenze liegt |
| elemental | ×1,00 | lag mit 3 Treffern im Band |
| magic | ×1,00 | lag mit 3 Treffern im Band |
| utility | ×1,00 | lag mit 3 Treffern im Band |
| tech | ×1,00 | lag mit 2 Treffern UNTER dem Band — eine Anhebung hätte ihn in den Ein-Treffer-Bereich geschoben |
| ultimate | ×1,00 | Ausnahme des Spiels, schon in Fassung 14 Ein- bis Zwei-Treffer-Waffen |

Eine pauschale Anhebung aller Kategorien wäre falsch gewesen: `magic` (46 Schaden)
und `tech` (56,5) liegen mit zwei bis drei Treffern bereits im oder unter dem Band;
mehr Schaden hätte sie zu Ein-Treffer-Waffen gemacht — das Gegenteil von „3 bis 4
gute Treffer". Angehoben wird deshalb genau die langsame Hälfte.

**Ein-Treffer-Grenze:** `EIN_TREFFER_GRENZE = 79`. Die 100-LP-Figur überlebt einen
Treffer auch beim stärksten Klassenschützen (Okkultist, Schadensfaktor 1,25 →
98,75). Die Grenze greift bei den stärksten Waffen der angehobenen Kategorien
(z. B. Raketenwerfer 62 → rechnerisch 124, gedeckelt auf 79).

**Flächenwirkung:** Flächenwaffen bekommen denselben Faktor wie ihre Kategorie.
Der Selbstschaden eigener Flächenwirkung ist seit Fassung 5 auf
`SELBSTSCHADEN_GRENZE` (40 % der Höchstgesundheit) gedeckelt und wächst deshalb
nicht mit; der Anteil der Flächenwaffen am gemessenen Schaden steht in der
Nachher-Tabelle.

## 5. Nachher (Fassung 15)

Ausgabe von `npm run balance:tempo` (dieselbe Messung wie oben, Fassung 15):

| Kennzahl | vorher (Fassung 14) | nachher (Fassung 15) |
| :-- | --: | --: |
| Median Schüsse bis Sieg — Nahkampf (130 LP) | 5 | **4** |
| Median Schüsse bis Sieg — Fernkampf (100 LP) | 4 | **3** |
| Median Schüsse bis Sieg — Okkultist (70 LP) | 3 | 2 |
| Mittel Schüsse bis Sieg — Nahkampf | 5,38 | 4,17 |
| Mittel Schüsse bis Sieg — Fernkampf | 4,25 | 3,30 |
| Mittel Schüsse bis Sieg — Okkultist | 3,13 | 2,53 |
| Waffen mit Schaden am Ziel | 112 | 112 |
| Waffen, die die 100-LP-Figur mit einem Schuss fällen | 1 (`pa_147`, ultimativ) | 1 (`pa_147`, ultimativ) |
| Flächenwaffen (Anteil Waffen / Anteil Schaden) | 35 (31,3 % / 36,3 %) | 35 (31,3 % / 34,3 %) |

| Kategorie | Waffen | Median Schaden vorher | nachher | Median STK vorher | nachher |
| :-- | --: | --: | --: | --: | --: |
| melee | 21 | 22,4 | **33,6** | 5 | **3** |
| ranged | 18 | 16,1 | **32,0** | 6,5 | **4** |
| heavy_ranged | 20 | 25,4 | **32,0** | 4 | 4 |
| elemental | 18 | 33,5 | 33,5 | 3 | 3 |
| magic | 13 | 46,0 | 46,0 | 3 | 3 |
| utility | 4 | 48,0 | 48,0 | 3 | 3 |
| tech | 12 | 56,5 | 56,5 | 2 | 2 |
| ultimate | 6 | 64,4 | 64,4 | 2 | 2 |

Gelesen:

- Die 100-LP-Figur (Median aller Figuren: 27 von 81 sind Fernkämpfer) fällt nach
  **3 Treffern**, die 130-LP-Figur nach **4** — beide im Zielband 3–4. Der
  Okkultist (70 LP) fällt nach 2; das ist die Glaskanone der Klassenfassung 3 und
  war nicht Teil des Auftrags (siehe §6).
- Die Spannweite der Kategorien schrumpft von **2–6,5** auf **2–4** Treffer.
  `ranged` (die langsamste) sinkt von 6,5 auf 4, `melee` von 5 auf 3.
- Der Flächenanteil am gemessenen Schaden sinkt leicht (36,3 % → 34,3 %), weil die
  angehobenen Kategorien überwiegend Direktwaffen sind — Flächenwaffen werden
  also nicht zu Monstern. Ihr Selbstschaden bleibt durch die Grenze aus Fassung 5
  (40 % der Höchstgesundheit) gedeckelt.
- **59 Waffen** sind angehoben, **9** davon liegen am Deckel von 79 Schaden
  (`pa_028`, `pa_030`, `pa_031`, `pa_035`, `pa_037`, `pa_038`, `pa_039`, `pa_044`,
  `pa_047`). Kein nicht-ultimativer Treffer fällt die 100-LP-Figur; der eine
  Ein-Treffer-Fall (`pa_147`, ultimativ, 100 Schaden) ist vorher wie nachher
  derselbe — Fassung 15 erzeugt keinen neuen.

## 6. Was die Zahlen tragen — und was nicht

- **Getragen:** Der Median der 100-LP-Figur liegt nachher bei 3 Treffern, die
  130-LP-Figur bei 4; die Kategorien-Mediane liegen zwischen 2 und 4 statt
  zwischen 2 und 6,5. Kein nicht-ultimativer Treffer fällt die 100-LP-Figur.
- **Nicht getragen:** Die Zahl ist eine **Treffer**-Zahl, keine **Schuss**-Zahl.
  Sie sagt nichts über die Trefferquote im echten Gefecht (Bewegung, Wind,
  Gelände, Zielen unter Zeitdruck) — dafür ist `npm run balance:bot` da, nicht
  diese Messung. Ebenso ungemessen bleibt das Gefühl am Bildschirm (Hörabnahme
  und Playtest bleiben Aufgabe des Auftraggebers, `docs/plan-produktion.md` §4).
- **Ausnahme Okkultist:** 70 LP und 2 Treffer nachher — die Klasse ist als
  Glaskanone angelegt (Klassenfassung 3: Leben ×0,7, Schaden ×1,25). Wer die
  3–4-Treffer-Zusage auf sie anwenden will, müsste ihre Lebenspunkte anheben;
  das war ausdrücklich nicht Teil von GP-4.
- **Stichprobe statt Turnier:** Gemessen wird gegen ein stehendes Ziel auf freier
  Linie. Das ist die reproduzierbare Vergleichsgröße; die Partie ist es nicht.
