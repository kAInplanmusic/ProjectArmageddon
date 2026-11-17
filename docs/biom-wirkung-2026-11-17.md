# Biom-Wirkung im Menümodus (2026-11-17, QV-3)

Wie stark ändert die Biom-Wahl das Spiel? Gemessen mit `npm run balance:biome` (`scripts/biom-wirkung.mjs`),
Menümodus (`kartentyp: 'autonom'`, 24:9 groß), Kit 4, Bot-Duell 1 gegen 1, 4 Seeds. Rohdaten:
`docs/biom-wirkung-2026-11-17.json`. Laufzeit 5 min; zwei Läufe ergaben identische Zahlen (deterministisch).
Stand: `main` ce023759. Nur Messung, Bot statt Menschen.

## Ergebnis

- **Form:** Die Geländeform hängt am Seed, nicht am Biom (Absicht: das Biom verschiebt keine Karte). Nur `planet` hat eine eigene Form.
- **Stoffe:** Alle 20 Sonderbiome haben ein anderes Stofffeld als `klassisch` (Unit-Test `tests/biom-wirkung.test.js` sichert das).
- **Verlauf:** Je Seed gibt es nur **3, 15, 8 und 14** verschiedene Verläufe auf 21 Biom-Wahlen; die größte Gruppe gleich verlaufender Biome umfasst 18, 7, 13 und 7.
- **Nie ein eigener Verlauf (bei keinem der 4 Seeds):** kristallhoehle, dschungel, fabrik, schlackeschmiede, tiefsee, dimensionsriss, kristallwald. Diese sieben verlaufen bei allen Seeds gemeinsam in einer Gruppe.

Der Vergleich nur gegen `klassisch` (Spalte 4) täuscht: Fast alle weichen von klassisch ab, aber viele verlaufen untereinander gleich.

## Je Biom

| Biom | Form anders | Stoffe anders | Verlauf anders als klassisch | eigener Verlauf | häufigste Stoffe (Seed 1) |
|---|---:|---:|---:|---:|---|
| klassisch | 0/4 | 0/4 | 0/4 | 3/4 | schnee 55 %, fels 41 %, eis 3 % |
| vulkan | 0/4 | 4/4 | 4/4 | 2/4 | asche 56 %, basalt 37 %, magmaadern 6 % |
| kristallhoehle | 0/4 | 4/4 | 4/4 | 0/4 | kristallfelsen 93 %, leuchtkristall 6 %, grundgestein 1 % |
| dschungel | 0/4 | 4/4 | 4/4 | 0/4 | moos 55 %, humus 38 %, lehmige_erde 6 % |
| eiswueste | 0/4 | 4/4 | 3/4 | 3/4 | schnee 57 %, gletschereis 39 %, gefrorene_wurzeln 4 % |
| duenen | 0/4 | 4/4 | 4/4 | 3/4 | feinsand 61 %, sandstein 34 %, keramik 4 % |
| schrott | 0/4 | 4/4 | 4/4 | 2/4 | korrosion 55 %, rostmetall 37 %, metall 7 % |
| schwebinseln | 0/4 | 4/4 | 4/4 | 2/4 | moos 55 %, wolkenstein 37 %, kristall 7 % |
| riff | 0/4 | 4/4 | 4/4 | 2/4 | feinsand 55 %, koralle 37 %, seegras 6 % |
| pilzwald | 0/4 | 4/4 | 4/4 | 3/4 | pilz 56 %, pilzbruecke 38 %, saeureablagerungen 5 % |
| kosmos | 0/4 | 4/4 | 4/4 | 1/4 | regolith_staub 56 %, meteoritenfels 37 %, nickel_eisen 5 % |
| surreal | 0/4 | 4/4 | 4/4 | 2/4 | traumgestein 91 %, gehaertetes_glas 8 %, grundgestein 1 % |
| fabrik | 0/4 | 4/4 | 4/4 | 0/4 | poroeser_beton 57 %, stahlbeton 37 %, rostmetall 3 % |
| burg | 0/4 | 4/4 | 4/4 | 2/4 | mutterboden 55 %, mauerwerk 38 %, magiekristall 5 % |
| planet | 4/4 | 4/4 | 4/4 | 4/4 | schnee 51 %, gletschereis 40 %, firnschnee 4 % |
| schlackeschmiede | 0/4 | 4/4 | 4/4 | 0/4 | schlacke 92 %, rostmetall 5 %, grundgestein 1 % |
| kristallarchipel | 0/4 | 4/4 | 4/4 | 2/4 | firnschnee 55 %, klareiskristall 35 %, klareis 5 % |
| tempelstadt | 0/4 | 4/4 | 4/4 | 2/4 | humus 55 %, tempelstein 38 %, alienharz 5 % |
| tiefsee | 0/4 | 4/4 | 4/4 | 0/4 | tiefseeschlamm 56 %, tiefseebasalt 39 %, leuchtalgen 4 % |
| dimensionsriss | 0/4 | 4/4 | 4/4 | 0/4 | instabiler_boden 55 %, phasen_fels 37 %, zeitkristall 6 % |
| kristallwald | 0/4 | 4/4 | 4/4 | 0/4 | moos 55 %, versteinertes_holz 37 %, kristalladern 6 % |

## Lesart

- Gemessen: Für einen Bot macht bei einem Drittel der Biome die Wahl keinen Unterschied zu anderen Biomen; die Stoffe unterscheiden sich, die Wirkung im Duell nicht.
- Hypothese „gleiche Härte“ geprüft und **widerlegt**: In der festen Gruppe stehen weiche Deckstoffe (dschungel: moos, humus) neben harten und sehr harten (fabrik: Beton, Stahlbeton). Warum diese sieben im Bot-Duell gleich verlaufen, ist offen; nächster Prüfschritt: Ereignisse zweier Gruppenmitglieder Zug für Zug vergleichen und die erste Abweichung zu einem Nicht-Mitglied suchen.
- Ein Bot nutzt wenige Waffen und zielt direkt; Menschen nutzen mehr Waffen und Gelände. Die Zahlen sind deshalb eine Untergrenze der Wirkung, kein Spielerurteil (Spieltest QV-4).
- Folge für QV-6 (eine Regel je Biom): mit diesen sieben anfangen.
