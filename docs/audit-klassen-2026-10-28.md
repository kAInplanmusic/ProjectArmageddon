# Klassen-Audit 2026-10-28: Scout angehoben (Klassenfassung 2)

Werkzeug: `npm run balance:classes` (Fassung 1 mit `node scripts/class-balance.mjs --klassen=1`). Die Summe addiert Leben, Wucht, Tempo und Beweglichkeit gleich gewichtet; sie ist ein grober Indikator.

## Befund (Fassung 1)

Der Scout lag mit allen Archetypen hinten, 26 % unter Artillery, auf Leben, Wucht und Schusstempo zugleich.

## Änderung (Fassung 2, `config.klassen: 2`, Standard neuer Partien)

Nur der Scout: `power` 0,7 auf 0,85, `health` 0,8 auf 0,95. `speed` bleibt 1,2: Er ist weiter der Beweglichste, mit der kleinsten Wucht und dem kleinsten Schusstempo. Fassung 1 bleibt bitgleich; alte Aufzeichnungen ohne Feld laufen mit Fassung 1.

## Messung

Mittelwert je Klasse (Summe über die drei Archetypen):

| Klasse | Fassung 1 | Fassung 2 |
|---|---|---|
| artillery | 4,29 | 4,29 |
| heavy | 4,11 | 4,11 |
| scout | 3,42 | 3,87 |

Spannweite aller neun Kombinationen: Fassung 1 3,36 bis 4,36 (Faktor 1,30), Fassung 2 3,80 bis 4,36 (Faktor 1,15).

Scout je Archetyp (Leben / Wucht / Tempo / Beweglichkeit = Summe):

| Kombination | Fassung 1 | Fassung 2 |
|---|---|---|
| scout/brawler | 0,96 / 0,70 / 0,64 / 1,20 = 3,50 | 1,14 / 0,85 / 0,78 / 1,20 = 3,97 |
| scout/occultist | 0,56 / 0,70 / 0,93 / 1,20 = 3,39 | 0,66 / 0,85 / 1,13 / 1,20 = 3,85 |
| scout/artillerist | 0,64 / 0,70 / 0,82 / 1,20 = 3,36 | 0,76 / 0,85 / 0,99 / 1,20 = 3,80 |

Der Erklärtext des Scouts („Am beweglichsten, aber der schwächste Schütze") stimmt weiter (Wucht 0,85 bleibt die kleinste) und bleibt unverändert.

## Offen

Die Summe ersetzt keine Partien: Ob 0,85/0,95 im Spiel passt, zeigt erst eine Bot- oder Spielmessung.
