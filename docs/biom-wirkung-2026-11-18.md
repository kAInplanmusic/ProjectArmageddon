# Biom-Wirkung nach QV-6 Welle 1 (2026-11-18)

Messung: `npm run balance:biome` (4 Seeds, Bot-Duell, 24:9 groß, Menümodus). Rohdaten: `docs/biom-wirkung-2026-11-18.json`.

## Wichtig: die Messbasis hat sich geändert

Die Messung vom 2026-11-17 (`docs/biom-wirkung-2026-11-17.md`) startete die Partien mit `kartentyp: 'autonom'`, aber mit dem
**Altstand jeder Regelfamilie** (Wind je Runde, kein Hagel, kein Seil, …), weil der Motor ohne Angabe jede Fassung auf ALT setzt,
das Menü aber überall STANDARD übergibt. Seit QV-6 liest das Messwerkzeug dieselbe Liste wie das Menü
(`MENUE_FASSUNGEN`, `src/shared/config/menueStart.js`). **Die Zahlen beider Tage sind deshalb nicht vergleichbar**, und die
Balance-Berichte vom 12. und 17.11. (`docs/balance-rollen-*`) beruhen auf den Altregeln dieser Familien; sie sind neu zu messen.

## Ergebnis

- Verschiedene Verläufe je Seed (von 21 Biom-Wahlen): 12, 10, 19, 12 (am 17.11.: 3, 15, 8, 14).
- Nie ein eigener Verlauf: kristallhoehle, fabrik, dimensionsriss (am 17.11.: sieben Biome, darunter dschungel, schlackeschmiede, tiefsee, kristallwald).
- Wie viel davon an den Menü-Fassungen liegt und wie viel an der Biomregel, trennt die Kontrolle unten.

## Kontrolle: Biomregel 1 gegen 2 bei gleichen Menü-Fassungen

Dasselbe Biom und derselbe Seed, nur `biomregeln` 1 (keine Regel) gegen 2 (Strömung). Verlaufsschlüssel: Züge, Schüsse, Treffer,
Schaden, Sieger, Tick.

| Biom | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| duenen | anders | anders | anders | anders |
| riff | anders | anders | anders | anders |
| tiefsee | anders | anders | anders | anders |
| vulkan (ohne Regel) | gleich | gleich | gleich | gleich |

Die Strömung ändert den Duellverlauf in genau den drei Biomen, in denen sie gilt, und sonst nirgends.

## Kontrolle Schwerkraft (Teil B): Biomregel 2 gegen 3

Gleiche Seeds, gleiches Biom, 24:9 groß, Menü-Fassungen; nur `biomregeln` 2 (ohne Schwerkraft) gegen 3 (mit).

| Biom | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| kosmos | anders | anders | anders | anders |
| planet | anders | anders | anders | anders |
| schwebinseln | anders | anders | anders | anders |
| surreal | anders | anders | anders | anders |
| vulkan (ohne Regel) | gleich | gleich | gleich | gleich |

Die Tabelle darunter stammt von der Messung nach Teil A (Fassung 2) und ist für Teil B nicht neu gemessen.

## Kontrolle Gefahrenwasser (Welle 2, Baustein E): Biomregel 3 gegen 4

Gleiche Seeds (4), 24:9 groß, Menü-Fassungen. Ein Duell ändert sich nur, wenn eine Figur tief im Gefahrenwasser steht.

| Biom | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| vulkan | gleich | anders | anders | gleich |
| schlackeschmiede | anders | anders | gleich | gleich |
| dschungel | anders | anders | gleich | gleich |
| pilzwald | anders | anders | anders | gleich |
| tempelstadt | anders | anders | anders | gleich |
| schrott | gleich | gleich | gleich | gleich |
| fabrik | gleich | gleich | gleich | gleich |
| klassisch | gleich | anders | gleich | gleich |

Die Wirkung hängt an der Wasserart, die der Seed zieht, nicht am Biom allein (klassisch zieht in Seed 2 Lava). Schrott und Fabrik
haben in diesen Seeds kein Gefahrenwasser gezogen; ob sie je eines ziehen, ist hier nicht belegt.

## Kontrolle Wasserlauf: Biomregel 4 gegen 5 (Wasserlauf), 5 gegen 6 (Treiben)

Gleiche Seeds (4), 24:9 groß, Menü-Fassungen, Biome mit Wasser.

| Biom | 4 gegen 5: Seed 1 | Seed 2 | Seed 3 | Seed 4 | 5 gegen 6 |
|---|---|---|---|---|---|
| klassisch | anders | gleich | gleich | gleich | gleich |
| vulkan | anders | anders | gleich | gleich | gleich |
| riff | anders | anders | gleich | gleich | gleich |
| tiefsee | gleich | anders | gleich | gleich | gleich |
| dschungel | gleich | anders | gleich | gleich | gleich |
| pilzwald | gleich | anders | gleich | gleich | gleich |

- Der Wasserlauf (Fassung 5) ändert 6 von 24 Duellen. Er wirkt nur, wo eine Explosion Wasser in Bewegung bringt.
- Das Treiben (Fassung 6) ändert in diesen Duellen keinen Verlauf. Minen, Kisten und Fässer liegen selten in strömendem Wasser;
  die Wirkung ist durch Unit-Tests belegt (`tests/biomregeln-treiben.test.js`), im Bot-Duell nicht messbar. Ob sie im Spiel
  spürbar ist, zeigt erst der Spieltest (QV-4).

## Tabelle (Menümodus, Biomregel 2)

| Biom | Form anders | Stoffe anders | Verlauf anders als klassisch | eigener Verlauf | häufigste Stoffe (Seed 1) |
|---|---:|---:|---:|---:|---|
| klassisch | 0/4 | 0/4 | 0/4 | 4/4 | schnee 55 %, fels 41 %, eis 3 % |
| vulkan | 0/4 | 4/4 | 4/4 | 4/4 | asche 56 %, basalt 37 %, magmaadern 6 % |
| kristallhoehle | 0/4 | 4/4 | 4/4 | 0/4 | kristallfelsen 93 %, leuchtkristall 6 %, grundgestein 1 % |
| dschungel | 0/4 | 4/4 | 4/4 | 2/4 | moos 55 %, humus 38 %, lehmige_erde 6 % |
| eiswueste | 0/4 | 4/4 | 4/4 | 4/4 | schnee 57 %, gletschereis 39 %, gefrorene_wurzeln 4 % |
| duenen | 0/4 | 4/4 | 4/4 | 4/4 | feinsand 61 %, sandstein 34 %, keramik 4 % |
| schrott | 0/4 | 4/4 | 4/4 | 2/4 | korrosion 55 %, rostmetall 37 %, metall 7 % |
| schwebinseln | 0/4 | 4/4 | 4/4 | 1/4 | moos 55 %, wolkenstein 37 %, kristall 7 % |
| riff | 0/4 | 4/4 | 4/4 | 4/4 | feinsand 55 %, koralle 37 %, seegras 6 % |
| pilzwald | 0/4 | 4/4 | 4/4 | 4/4 | pilz 56 %, pilzbruecke 38 %, saeureablagerungen 5 % |
| kosmos | 0/4 | 4/4 | 4/4 | 1/4 | regolith_staub 56 %, meteoritenfels 37 %, nickel_eisen 5 % |
| surreal | 0/4 | 4/4 | 4/4 | 2/4 | traumgestein 91 %, gehaertetes_glas 8 %, grundgestein 1 % |
| fabrik | 0/4 | 4/4 | 4/4 | 0/4 | poroeser_beton 57 %, stahlbeton 37 %, rostmetall 3 % |
| burg | 0/4 | 4/4 | 4/4 | 1/4 | mutterboden 55 %, mauerwerk 38 %, magiekristall 5 % |
| planet | 4/4 | 4/4 | 4/4 | 4/4 | schnee 51 %, gletschereis 40 %, firnschnee 4 % |
| schlackeschmiede | 0/4 | 4/4 | 4/4 | 1/4 | schlacke 92 %, rostmetall 5 %, grundgestein 1 % |
| kristallarchipel | 0/4 | 4/4 | 4/4 | 4/4 | firnschnee 55 %, klareiskristall 35 %, klareis 5 % |
| tempelstadt | 0/4 | 4/4 | 4/4 | 1/4 | humus 55 %, tempelstein 38 %, alienharz 5 % |
| tiefsee | 0/4 | 4/4 | 4/4 | 4/4 | tiefseeschlamm 56 %, tiefseebasalt 39 %, leuchtalgen 4 % |
| dimensionsriss | 0/4 | 4/4 | 4/4 | 0/4 | instabiler_boden 55 %, phasen_fels 37 %, zeitkristall 6 % |
| kristallwald | 0/4 | 4/4 | 4/4 | 1/4 | moos 55 %, versteinertes_holz 37 %, kristalladern 6 % |

## Grenzen

- Ein Bot nutzt wenige Waffen und zielt direkt; die Zahlen sind eine Untergrenze der Wirkung, kein Spielerurteil (Spieltest QV-4 steht aus).
- „Anderer Verlauf" heißt nur: die Partie nimmt einen anderen Lauf. Ob die Regel Spaß macht oder fair ist, sagt diese Messung nicht.
- Die Stärke der Strömung (Anteil 0,5 / 0,35 / 0,5 von `MAX_WIND`) ist ein erster Ansatz, nicht balanciert.
