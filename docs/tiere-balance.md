# Günther und Cookie: Messung und Tabellen

Messwerkzeug: `npm run balance:tiere` (`scripts/tiere-verteilung.mjs`, nutzt `spiele()` aus `scripts/bot-partien.mjs`).
Es laufen volle Bot-Partien der Engine (2x2, Kit 4, 60 Seeds ab 7000), je Spielweise des Bots:
`steht` (läuft nie), `sucht` (springt auf Tiere zu), `sammelt` (springt auf Kisten zu).
Aufruf: `node scripts/tiere-verteilung.mjs --seeds=60 --weg=steht|sucht|sammelt --guenther=3 --cookie=3 [--json]`.
Die Zahlen unten sind Mittelwerte je Partie (Median 6,6 bis 8,6 Minuten, rund 27 Runden).

## Befund der Fassungen 2 und Gegenmaßnahmen (Fassung 3)

| Auffälligkeit (Fassung 2) | Messwert | Maßnahme (Fassung 3) | Messwert danach |
|---|---|---|---|
| Günther verursacht zu viel Schaden: Pinkeln 43-50 mal, Häufchen 10-13 Treffer | Tierschaden 260 je Partie (Günther ~195) | Pinkeln alle 1,5 bis 2,8 s, 7 Schaden, Abnahme 0,65; Häufchen alle 7 bis 11,7 s, 3 je Zug, höchstens 4 | Pinkeln 27 mal (44 Schaden), Häufchen 5-6 Treffer |
| Cookie-Kuscheln ist Dauerheilung | bis 30 mal, bis 390 Leben für EINE Figur (Figur: 100) | 12 statt 20 Leben, 50 s Sperre, höchstens dreimal je Figur, -5 Hunger | 1,5 bis 6 mal, höchstens 104 Leben für eine Figur (mit Günther) |
| Kuscheln hält Cookie dauernd satt, die Hungerwut verschwindet, wenn Spieler ihn aufsuchen | Wut in 5 % der Partien (Bot sucht) | Kuscheln senkt Hunger kaum; Hunger wächst in 3 statt 2 Minuten (Stufen und Pegel gleich) | Wut in 35 bis 60 % der Partien, ~1 mal je Partie |
| Futternapf frisst fast jede zweite Kiste | 45 % der Kisten (Bot steht), läuft Kisten 380 px nach | frisst ab Hunger 60, höchstens alle 60 s, -45 Hunger, sucht nur 190 px weit | 16 % (Bot sammelt), 23 % (sucht), 34 % (steht, nichts wird gesammelt) |
| Hungerwut zu häufig und zu lang: 2,1 mal je Partie in der ersten Fassung-3-Runde | 77 % Partien, 3,8 Schläge | Wut 20 statt 30 s, danach Hunger 30 statt 50, Schlag 25 statt 40 mit 2,5 s Sperre | 0,7 bis 1 mal je Partie, 1,5 bis 2,1 Schläge (36 bis 53 Schaden) |
| Rad-Angriff (1 bis 99) kann eine schwache Figur töten | 0 Tiertode gemessen, aber 18 % Chance bei jeder Berührung | nie tödlich: mindestens 1 Leben bleibt | 0 Tiertode |

Entscheidungen durch Tiere: **0 Tiertode in 360 Partien** (Fassung 2 und 3), keine offene (festgefahrene) Partie, kein Soft-Lock.
Ein Tier hat nie allein eine Partie entschieden. Die Zufallsströme `GUENTHER`, `GUENTHER_AKTION`, `COOKIE` sind unverändert; Fassung 3
ändert nur Zahlen der Wirkung (und gezogene Wertebereiche für Pinkel- und Kackuhr, weil sie von den neuen Intervallen abhängen).

## Günther: Aktionen (Chance gilt, wenn alle Bedingungen erfüllt sind)

Alle Aktionen: Wartezeit danach 150 bis 280 Ticks (2,5 bis 4,7 s), nie dieselbe zweimal hintereinander. Zufallsstrom `GUENTHER_AKTION`.

| Aktion | Gewicht | Chance | Bedingung | Effekt | Dauer | Wirkung bei | Häufigkeit je Partie |
|---|---|---|---|---|---|---|---|
| Essen | 3 | 14,6 % | Kiste in 150 px | frisst die Kiste, nächster Spieler (180 px) +20 Leben | 70 Ticks | 35 | 0,3 bis 0,7 |
| Hüpfen | 3 | 14,6 % | – | nur Pose | 50 | 25 | 2,0 bis 2,6 |
| Ziehen (Seil) | 2 | 9,8 % | Spieler in 260 px | Stoß zu Günther (4,5 / -2,5) | 70 | 35 | 1,5 bis 1,8 |
| Wühlen | 3 | 14,6 % | – | Loch (Radius 11), 35 % Kiste | 80 | 40 | 2,3 bis 2,9 (0,8 Funde) |
| Kuscheln | 4 | 19,5 % | Spieler in 90 px | +15 Leben | 90 | 80 | 2,3 bis 2,7 |
| Rücken kraulen | 2 | 9,8 % | Spieler in 70 px | +28 Leben | 100 | 90 | 1,4 bis 1,7 |
| Sitz | 2 | 9,8 % | – | steht, Pinkeln und Häufchen ruhen | 90 | 90 | 1,7 bis 1,9 |
| Platz | 2 | 9,8 % | – | steht, döst, Pinkeln und Häufchen ruhen | 120 | 120 | 1,6 bis 1,8 |
| Wildes Bellen | 1,5 | 7,3 % | – | Chaos: alle in 260 px alle 30 Ticks aufgescheucht (Stoß ±3,2 / -3) | 150 | alle 30 | 1,3 bis 1,5 |

Zusammen 14,6 bis 17,3 Aktionen je Partie; Heilung durch Günther 75 bis 94 Leben je Partie (alle Figuren zusammen).

## Günther: Unterwegs (Fassung 3 / Fassung 2)

| Verhalten | Auslöser | Effekt | Wartezeit |
|---|---|---|---|
| Anpinkeln | Spieler in 130 px | 7 Schaden, jedes weitere Mal auf dieselbe Figur x0,65, mindestens 1 / 9, x0,72 | 90 bis 170 Ticks / 45 bis 95 |
| Häufchen | läuft herum | Treten: 3 Runden je 3 Schaden und Tempo x0,55 / je 4; höchstens 4 / 6 liegen | 420 bis 700 Ticks / 200 bis 340 |
| Glücksrad | im Laufen anrempeln (26 px) | siehe unten | 240 Ticks Cooldown |
| Auftritte | – | Mittel 2 je Partie (Poisson), je 3 Runden, höchstens 6 | 13,5 % der Partien ohne Günther |

## Glücksrad (unverändert, Heimdall bleibt bei 5 %)

| Ausgang | Chance | Wirkung | gemessen (Bot sucht, je Partie) |
|---|---|---|---|
| Gassi | 30 % | eine Runde aussetzen | 0,27 bis 0,68 |
| Füttern | 25 % | aussetzen + Waffe niederer Seltenheit | 0,18 bis 0,40 |
| Spielen | 22 % | aussetzen + 50 bis 100 Leben | 0,17 bis 0,32 |
| Angriff | 18 % | 1 bis 99 Schaden, ab Fassung 3 nie tödlich | 0,20 bis 0,37 |
| Heimdall | 5 % | legendäre Waffe (Bifröst) | 0,02 bis 0,10 |

Das Rad dreht 0,9 bis 1,8 mal je Partie (nur wer Günther anläuft). Erwartungswert: gut (Waffe, Heilung, Legende) 52 %, schlecht (aussetzen, Angriff) 48 %.

## Cookie: Hunger und Miauen (Fassung 3)

Hunger 0 bis 100, Start 8 bis 22, Anstieg 100 in 10800 Ticks (3 min; im Schlaf x0,6; Fassung 2: 7200).

| Stufe | Hunger ab | Miau-Pegel | Ruf alle | erster Ruf (Median, Minuten) |
|---|---|---|---|---|
| schläft | 0 | – | – | – |
| leise | 30 | 0,30 | 5 s | 0,9 bis 1,4 |
| laut | 60 | 0,65 | 2,7 s | 1,9 bis 2,5 |
| Hungerwut | 85 | 1,00 | 1,3 s | 4,6 bis 6,4 (in 35 bis 60 % der Partien) |

## Cookie: Aktionen (Fassung 3 / Fassung 2)

| Aktion | Chance / Auslöser | Effekt | Dauer | Sperre | Häufigkeit je Partie |
|---|---|---|---|---|---|
| Füttern von Hand | im Laufen berühren (38 px), Hunger ab 30 | -45 Hunger, +10 Leben | 2 s | 5 s | 0,7 bis 2,0 |
| Futternapf | Kiste in 70 px, Hunger ab 60 / 30 | -45 / -30 Hunger, Kiste weg | 2 s | 60 s / keine | 1,6 bis 3,0 / 5,8 |
| Kuscheln | 1 s still in 55 px | -5 / -10 Hunger, +12 / +20 Leben, höchstens 3 mal je Figur / unbegrenzt | 2 s | 50 s / 20 s | 1,5 bis 6,1 |
| Toben | Hunger ab 85 | läuft zum nächsten Spieler (2,2 px/Tick), alle 12 Ticks Loch (Radius 30, Tiefe 80), Kisten in 50 px weg, Schlag 25 / 40 Schaden in 46 px | bis 20 s / 30 s, dann Hunger 30 / 50 | 2,5 s / 2 s je Figur | 0,7 bis 1,0 mal, 1,5 bis 2,1 Schläge |
| Spielen | 0,8 % je Runde | kosmische Schockwelle (Radius 60 % der Karte, 10 bis 35 Schaden, nie tödlich, 5 Krater-Ringe) | 2,5 s, Wirkung nach 1 s | – | 0,17 bis 0,22 (17 bis 20 % der Partien) |

## Reproduzieren

```
npm run balance:tiere -- --seeds=60 --weg=steht --guenther=2 --cookie=2   # Fassung 2 (Stand davor)
npm run balance:tiere -- --seeds=60 --weg=sucht --guenther=3 --cookie=3   # Fassung 3
```
60 Seeds und eine Spielweise brauchen etwa zwei Minuten.
