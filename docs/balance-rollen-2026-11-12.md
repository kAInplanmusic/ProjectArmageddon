# Balancing je Rolle, Messung 2026-11-12

Auftrag: Entscheidung 24 vom 2026-11-11 („Balancing je Rolle mit festen Seeds messen und vorlegen“). Dieses Dokument trennt strikt
**Messung** (Abschnitte 1 bis 6, nur Zahlen aus dem nachweisbar gelaufenen Skript) von **Vorschlägen** (Abschnitt 7, nicht umgesetzt).
Es wurde keine Spielregel und kein Spielwert geändert; das Skript liest nur.

## 1 Messaufbau und Nachweis

| Punkt | Wert |
|---|---|
| Werkzeug | `scripts/balance-rollen.mjs` (Tests: `tests/balance-rollen.test.js`, 10 grün) |
| Aufruf | `node scripts/balance-rollen.mjs --stufe=standard --parallel=2 --ausgabe=docs/balance-rollen-2026-11-12.json` |
| Rohergebnis | `docs/balance-rollen-2026-11-12.json` (alle Kennzahlen, Matrizen, Reichweite) |
| Stand | Commit 461ad69e44 (Arbeitsbaum mit fremden, nicht eingecheckten Änderungen in `src/client`, `src/server`, `src/shared/ereigniskatalog.js`, `stats.js`; `src/engine` unverändert), Waffenfassung 22 (Standard), Start-Kit 4 |
| Konfiguration | Produktionsvorgaben wie `lobbySession.js` (alle `*_STANDARD`-Fassungen), echte Lebenspunkte (100 x Klassenfaktor), keine Normierung |
| Duell | 1 gegen 1, Bot aus `scripts/bot-partien.mjs` (Gitter Winkel x Kraft über `aimPreview`, kleiner Zielfehler aus dem Seed); Bot „statisch“ geht nicht vor, Bot „vorrückend“ geht bis 450 px an den Gegner |
| Seeds | Spiel i: `20261111 + 131 * i`, i = 0 bis n-1; dieselben Seeds für jede Paarung und Karte. Gerades i: Rolle A auf Platz 1 (zieht zuerst), ungerades i: Rolle B |
| Laufzeit | Standardstufe rund 7,5 min mit 2 Arbeitsprozessen (nacheinander, keine anderen schweren Läufe) |
| Wiederholbarkeit | Zwei vollständige Läufe der Standardstufe lieferten für Klassen, alte Kombinationen, Scout, Vorrücken, Reichweite und Launch-Basis identische Zusammenfassungen (Biomstufe danach geändert, siehe Abschnitt 9); ein Test hält Wiederholbarkeit eines Duells fest |

**Rollenmodell:** Die Engine liest keine Fraktion; die 81 Figuren wirken allein über ihre Klasse (Test: je Fraktion 3 Figuren je Klasse, 9 Fraktionen). Standard ist Klassenfassung 3 mit drei Klassen (nahkampf, fernkampf, okkultist). Die alten Klasse/Archetyp-Kombinationen (Fassung 2) sind mitgemessen, weil BAL-1 offene Vergleichszahlen für 6 neue Kombinationen nennt.

**Abdeckung (Stufe standard) und Grenzen:**

| Modul | Partien | Karten | Seeds je Paarung und Karte |
|---|---:|---|---:|
| Klassen, Bot statisch | 108 | 24:9 groß, 16:9 mittel, 4:3 klein | 6 |
| Alte Kombinationen (Fassung 2) | 180 | 24:9 groß | 4 |
| Scout Fassung 1 / Fassung 2 gegen Rest | je 72 | 24:9 groß | 4 |
| Klassen, Bot vorrückend | 36 | 24:9 groß | 6 |
| Klassen nach Biom (klassisch, vulkan, eiswueste, schrott) | 48 | 24:9 groß | 2 |

Wichtig für die Lesbarkeit: Die **sechs Seeds sind auf allen drei Formaten dieselben**, die Partien sind also nicht unabhängig (108 Partien, aber nur 6 verschiedene Seedreihen je Paarung). Das Wilson-Intervall (95 %) rechnet mit n Partien und ist dadurch zu eng. Eine Siegrate von genau 50 % in jeder Zelle der Klassenmatrix (je 9 von 18) belegt nur: bei diesem Bot und dieser Stichprobe ist kein Klassenunterschied nachweisbar, nicht dass die Klassen gleich stark sind. Der Bot ist kein Mensch (siehe Abschnitt 6).

## 2 Siegrate, Schaden je Zug, Trefferquote (Klassen, Fassung 3, Standard)

Siegrate: Unentschieden zählt 0,5, Spiegelduelle sind nicht gezählt. Schaden je Zug: Lebenspunkteverlust des Gegners im eigenen Zug (schließt Umweltschaden ein, z. B. Ertrinken), über alle Partien inklusive Spiegel; in Klammern die Standardabweichung je Figur und Partie (Streuung der Einzelwerte, nicht des Mittelwerts). Trefferquote = Züge mit Schaden je Schuss.

Partien: 108; Ausgänge: {"sieg":108}; Karten: {"24:9 gross":36,"16:9 mittel":36,"4:3 klein":36}; Median Spieldauer 5.44 min; erster Zug gewinnt in Spiegelduellen 57 % (n=54, 95 %: 44–70 %).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| nahkampf | 130 | 36 | 50 % | 35–66 % | 2.16 (± 3.62) | 17 % | 5.63 | 50 % | 81 % |
| fernkampf | 100 | 36 | 50 % | 35–66 % | 3.36 (± 5.16) | 17 % | 5.52 | 50 % | 69 % |
| okkultist | 70 | 36 | 50 % | 35–66 % | 4.52 (± 20.47) | 19 % | 3.37 | 50 % | 53 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | nahkampf | fernkampf | okkultist |
|---|---:|---:|---:|
| nahkampf | · | 50 % (18) | 50 % (18) |
| fernkampf | 50 % (18) | · | 50 % (18) |
| okkultist | 50 % (18) | 50 % (18) | · |

Bot „vorrückend“ (geht vor dem Schuss an den Gegner heran, 36 Partien, nur 24:9 groß, 12 Partien je Rolle):

Partien: 36; Ausgänge: {"sieg":36}; Karten: {"24:9 gross":36}; Median Spieldauer 2.69 min; erster Zug gewinnt in Spiegelduellen 17 % (n=18, 95 %: 6–39 %).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| nahkampf | 130 | 12 | 58 % | 32–81 % | 9.42 (± 9.92) | 36 % | 7.34 | 46 % | 18 % |
| fernkampf | 100 | 12 | 42 % | 19–68 % | 17.11 (± 23.96) | 55 % | 1.84 | 54 % | 0 % |
| okkultist | 70 | 12 | 50 % | 25–75 % | 11.57 (± 26.2) | 40 % | 0.96 | 50 % | 0 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | nahkampf | fernkampf | okkultist |
|---|---:|---:|---:|
| nahkampf | · | 67 % (6) | 50 % (6) |
| fernkampf | 33 % (6) | · | 50 % (6) |
| okkultist | 50 % (6) | 50 % (6) | · |

Nach Biom (Biome, für die die Spielverläufe im Vorversuch überhaupt von „klassisch“ abwichen, siehe Abschnitt 6):

Partien: 48; Ausgänge: {"sieg":48}; Karten: {"24:9 gross":48}; Median Spieldauer 5.88 min; erster Zug gewinnt in Spiegelduellen 17 % (n=24, 95 %: 7–36 %).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| nahkampf | 130 | 16 | 50 % | 28–72 % | 4.52 (± 4.65) | 24 % | 4.84 | 50 % | 100 % |
| fernkampf | 100 | 16 | 25 % | 10–50 % | 3.74 (± 3.27) | 21 % | 5.96 | 63 % | 100 % |
| okkultist | 70 | 16 | 75 % | 51–90 % | 5.12 (± 2.39) | 21 % | 5.86 | 38 % | 100 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | nahkampf | fernkampf | okkultist |
|---|---:|---:|---:|
| nahkampf | · | 50 % (8) | 50 % (8) |
| fernkampf | 50 % (8) | · | 0 % (8) |
| okkultist | 50 % (8) | 100 % (8) | · |

## 3 Alte Kombinationen (Fassung 2), 9 Rollen, nur 24:9 groß, 4 Seeds je Paarung

Partien: 180; Ausgänge: {"sieg":180}; Karten: {"24:9 gross":180}; Median Spieldauer 5.58 min; erster Zug gewinnt in Spiegelduellen 36 % (n=36, 95 %: 23–52 %).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| scout/brawler | 114 | 32 | 66 % | 48–80 % | 2.76 (± 4.23) | 21 % | 6.01 | 38 % | 53 % |
| scout/artillerist | 76 | 32 | 44 % | 28–61 % | 2.09 (± 3.45) | 20 % | 5.54 | 55 % | 18 % |
| scout/occultist | 66 | 32 | 31 % | 18–49 % | 2.19 (± 3.48) | 22 % | 5.52 | 65 % | 19 % |
| heavy/brawler | 156 | 32 | 72 % | 55–84 % | 2.4 (± 3.72) | 16 % | 8.58 | 33 % | 77 % |
| heavy/artillerist | 104 | 32 | 41 % | 26–58 % | 2.21 (± 4.13) | 20 % | 7.44 | 57 % | 48 % |
| heavy/occultist | 91 | 32 | 38 % | 23–55 % | 4.38 (± 13.57) | 27 % | 6.82 | 60 % | 42 % |
| artillery/brawler | 108 | 32 | 47 % | 31–64 % | 2.84 (± 9.71) | 16 % | 7.43 | 53 % | 67 % |
| artillery/artillerist | 72 | 32 | 50 % | 34–66 % | 11.05 (± 23.17) | 38 % | 1.44 | 50 % | 40 % |
| artillery/occultist | 63 | 32 | 63 % | 45–77 % | 7.54 (± 25.07) | 23 % | 2.05 | 40 % | 13 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | scout/brawler | scout/artillerist | scout/occultist | heavy/brawler | heavy/artillerist | heavy/occultist | artillery/brawler | artillery/artillerist | artillery/occultist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scout/brawler | · | 50 % (4) | 50 % (4) | 50 % (4) | 75 % (4) | 75 % (4) | 100 % (4) | 50 % (4) | 75 % (4) |
| scout/artillerist | 50 % (4) | · | 50 % (4) | 0 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 50 % (4) |
| scout/occultist | 50 % (4) | 50 % (4) | · | 25 % (4) | 25 % (4) | 25 % (4) | 50 % (4) | 25 % (4) | 0 % (4) |
| heavy/brawler | 50 % (4) | 100 % (4) | 75 % (4) | · | 75 % (4) | 100 % (4) | 50 % (4) | 50 % (4) | 75 % (4) |
| heavy/artillerist | 25 % (4) | 50 % (4) | 75 % (4) | 25 % (4) | · | 75 % (4) | 50 % (4) | 25 % (4) | 0 % (4) |
| heavy/occultist | 25 % (4) | 50 % (4) | 75 % (4) | 0 % (4) | 25 % (4) | · | 75 % (4) | 50 % (4) | 0 % (4) |
| artillery/brawler | 0 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 25 % (4) | · | 75 % (4) | 75 % (4) |
| artillery/artillerist | 50 % (4) | 50 % (4) | 75 % (4) | 50 % (4) | 75 % (4) | 50 % (4) | 25 % (4) | · | 25 % (4) |
| artillery/occultist | 25 % (4) | 50 % (4) | 100 % (4) | 25 % (4) | 100 % (4) | 100 % (4) | 25 % (4) | 75 % (4) | · |

Die drei Kombinationen der alten Platzvergabe sind scout/brawler, heavy/artillerist, artillery/occultist (`index % 3` für Klasse und Archetyp); die übrigen sechs sind die „neuen“ Kombinationen der freien Wahl.

### Scout gegen Nicht-Scouts, Fassung 1 gegen Fassung 2 (dieselben Seeds)

Fassung 1:

Partien: 72; Ausgänge: {"sieg":72}; Karten: {"24:9 gross":72}; Median Spieldauer 3.96 min; erster Zug gewinnt in Spiegelduellen – (n=0, 95 %: –).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| scout/brawler | 96 | 24 | 58 % | 39–76 % | 2.89 (± 4.34) | 20 % | 5.45 | 42 % | 20 % |
| scout/artillerist | 64 | 24 | 42 % | 25–61 % | 2.21 (± 4.09) | 19 % | 3.51 | 58 % | 0 % |
| scout/occultist | 56 | 24 | 42 % | 25–61 % | 2.21 (± 4.07) | 17 % | 3.57 | 58 % | 0 % |
| heavy/brawler | 156 | 12 | 67 % | 39–86 % | 1.65 (± 1.04) | 13 % | 8.91 | 33 % | 100 % |
| heavy/artillerist | 104 | 12 | 50 % | 25–75 % | 2.35 (± 3.38) | 19 % | 5.96 | 50 % | 67 % |
| heavy/occultist | 91 | 12 | 58 % | 32–81 % | 6.44 (± 16.09) | 36 % | 2.5 | 42 % | 40 % |
| artillery/brawler | 108 | 12 | 8 % | 2–35 % | 1.55 (± 3.88) | 13 % | 8.54 | 92 % | 91 % |
| artillery/artillerist | 72 | 12 | 67 % | 39–86 % | 7.74 (± 20.47) | 30 % | 3.9 | 33 % | 100 % |
| artillery/occultist | 63 | 12 | 67 % | 39–86 % | 6.57 (± 21.94) | 32 % | 2.05 | 33 % | 25 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | scout/brawler | scout/artillerist | scout/occultist | heavy/brawler | heavy/artillerist | heavy/occultist | artillery/brawler | artillery/artillerist | artillery/occultist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scout/brawler | · | – | – | 50 % (4) | 50 % (4) | 75 % (4) | 75 % (4) | 50 % (4) | 50 % (4) |
| scout/artillerist | – | · | – | 25 % (4) | 50 % (4) | 25 % (4) | 100 % (4) | 25 % (4) | 25 % (4) |
| scout/occultist | – | – | · | 25 % (4) | 50 % (4) | 25 % (4) | 100 % (4) | 25 % (4) | 25 % (4) |
| heavy/brawler | 50 % (4) | 75 % (4) | 75 % (4) | · | – | – | – | – | – |
| heavy/artillerist | 50 % (4) | 50 % (4) | 50 % (4) | – | · | – | – | – | – |
| heavy/occultist | 25 % (4) | 75 % (4) | 75 % (4) | – | – | · | – | – | – |
| artillery/brawler | 25 % (4) | 0 % (4) | 0 % (4) | – | – | – | · | – | – |
| artillery/artillerist | 50 % (4) | 75 % (4) | 75 % (4) | – | – | – | – | · | – |
| artillery/occultist | 50 % (4) | 75 % (4) | 75 % (4) | – | – | – | – | – | · |

Fassung 2:

Partien: 72; Ausgänge: {"sieg":72}; Karten: {"24:9 gross":72}; Median Spieldauer 6.18 min; erster Zug gewinnt in Spiegelduellen – (n=0, 95 %: –).

| Rolle | LP | Partien (ohne Spiegel) | Siegrate | 95 %-Intervall | Schaden/Zug (± SD je Figur und Partie) | Trefferquote | Lebenszeit (min, Median) | Todesrate | davon Ertrinken |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| scout/brawler | 114 | 24 | 71 % | 51–85 % | 2.98 (± 4.38) | 21 % | 6.02 | 29 % | 29 % |
| scout/artillerist | 76 | 24 | 42 % | 25–61 % | 1.56 (± 1.81) | 19 % | 6.31 | 58 % | 14 % |
| scout/occultist | 66 | 24 | 25 % | 12–45 % | 2.43 (± 4.31) | 23 % | 5.42 | 75 % | 11 % |
| heavy/brawler | 156 | 12 | 75 % | 47–91 % | 1.23 (± 0.92) | 13 % | 10.51 | 25 % | 100 % |
| heavy/artillerist | 104 | 12 | 50 % | 25–75 % | 1.59 (± 2.96) | 13 % | 6.41 | 50 % | 67 % |
| heavy/occultist | 91 | 12 | 50 % | 25–75 % | 4.81 (± 14.91) | 29 % | 6.09 | 50 % | 67 % |
| artillery/brawler | 108 | 12 | 33 % | 14–61 % | 1.55 (± 3.42) | 11 % | 8.7 | 67 % | 100 % |
| artillery/artillerist | 72 | 12 | 58 % | 32–81 % | 9.06 (± 24.87) | 34 % | 4.33 | 42 % | 100 % |
| artillery/occultist | 63 | 12 | 58 % | 32–81 % | 5.66 (± 25.6) | 26 % | 3.74 | 42 % | 20 % |

Siegrate Zeile gegen Spalte (n je Zelle in Klammern):

| | scout/brawler | scout/artillerist | scout/occultist | heavy/brawler | heavy/artillerist | heavy/occultist | artillery/brawler | artillery/artillerist | artillery/occultist |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scout/brawler | · | – | – | 50 % (4) | 75 % (4) | 75 % (4) | 100 % (4) | 50 % (4) | 75 % (4) |
| scout/artillerist | – | · | – | 0 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 50 % (4) | 50 % (4) |
| scout/occultist | – | – | · | 25 % (4) | 25 % (4) | 25 % (4) | 50 % (4) | 25 % (4) | 0 % (4) |
| heavy/brawler | 50 % (4) | 100 % (4) | 75 % (4) | · | – | – | – | – | – |
| heavy/artillerist | 25 % (4) | 50 % (4) | 75 % (4) | – | · | – | – | – | – |
| heavy/occultist | 25 % (4) | 50 % (4) | 75 % (4) | – | – | · | – | – | – |
| artillery/brawler | 0 % (4) | 50 % (4) | 50 % (4) | – | – | – | · | – | – |
| artillery/artillerist | 50 % (4) | 50 % (4) | 75 % (4) | – | – | – | – | · | – |
| artillery/occultist | 25 % (4) | 50 % (4) | 100 % (4) | – | – | – | – | – | · |

## 4 Reichweite

Rechnerisch aus den Spielfunktionen (`launchSpeedMultiplier`, `simulateFlight`), volle Kraft, bester Winkel (5 bis 85 Grad), ebener Boden, Abschuss 10 px über dem Boden, kein Wind, 100 Projektilwaffen mit `maxRange` > 0 (Waffenfassung 22). Angegeben ist Wurfweite geteilt durch Katalog-`maxRange` (Median über die Waffen, P10 bis P90) und wie viele Waffen den Startabstand (Kartenbreite / 3) erreichen. Weitenfaktor je Kartenbreite: {'1280': 0.667, '2560': 1.333, '4704': 2.45}.

| Profil | Tempo | 1280 px: Median (P10–P90) | Waffen erreichen Start (427 px) | 2560 px: Median (P10–P90) | erreichen (853 px) | 4704 px: Median (P10–P90) | erreichen (1568 px) |
|---|---:|---:|---:|---:|---:|---:|---:|
| neutral (fernkampf, F3) | 1 | 0.626 (0.624–0.649) | 18/100 | 1.167 (1.165–1.218) | 17/100 | 2 (1.968–2.127) | 13/100 |
| nahkampf (F3) | 0.75 | 0.371 (0.369–0.391) | 0/100 | 0.697 (0.694–0.721) | 0/100 | 1.202 (1.199–1.256) | 0/100 |
| okkultist (F3) | 1.25 | 0.936 (0.934–0.972) | 69/100 | 1.735 (1.714–1.832) | 66/100 | 2.943 (2.855–3.196) | 64/100 |
| scout/brawler (F2) | 0.779 | 0.397 (0.395–0.417) | 3/100 | 0.746 (0.744–0.773) | 0/100 | 1.286 (1.282–1.346) | 0/100 |
| scout/artillerist (F2) | 0.992 | 0.617 (0.614–0.64) | 18/100 | 1.149 (1.148–1.199) | 17/100 | 1.972 (1.941–2.092) | 13/100 |
| scout/occultist (F2) | 1.133 | 0.785 (0.782–0.813) | 64/100 | 1.458 (1.448–1.532) | 22/100 | 2.487 (2.428–2.674) | 20/100 |
| heavy/brawler (F2) | 0.917 | 0.535 (0.532–0.555) | 13/100 | 0.999 (0.997–1.039) | 11/100 | 1.717 (1.697–1.812) | 7/100 |
| heavy/artillerist (F2) | 1.167 | 0.827 (0.825–0.856) | 65/100 | 1.536 (1.522–1.616) | 64/100 | 2.615 (2.548–2.819) | 21/100 |
| heavy/occultist (F2) | 1.333 | 1.05 (1.049–1.093) | 72/100 | 1.944 (1.914–2.061) | 71/100 | 3.285 (3.173–3.59) | 69/100 |
| artillery/brawler (F2) | 1.192 | 0.859 (0.856–0.892) | 65/100 | 1.594 (1.579–1.681) | 64/100 | 2.712 (2.639–2.928) | 22/100 |
| artillery/artillerist (F2) | 1.517 | 1.322 (1.317–1.386) | 76/100 | 2.433 (2.377–2.612) | 73/100 | 4.08 (3.905–4.526) | 72/100 |
| artillery/occultist (F2) | 1.733 | 1.676 (1.658–1.768) | 79/100 | 3.06 (2.963–3.33) | 77/100 | 5.09 (4.824–5.74) | 77/100 |

**Gegenprobe:** `aimPreview` des echten Matches gegen die eigene Rechnung, erste 40 Bahnpunkte (pa_041): größte Abweichung 0 px.

Nominale Wirkfaktoren der Rollen (Quelle der Messung):

| Rolle | Fassung | LP | Leben | Wucht | Tempo | Beweglichkeit | Summe | Wurfweite relativ (Tempo²) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| nahkampf | 3 | 130 | 1.3 | 0.75 | 0.75 | 1.2 | 4 | 0.563 |
| fernkampf | 3 | 100 | 1 | 1 | 1 | 1 | 4 | 1 |
| okkultist | 3 | 70 | 0.7 | 1.25 | 1.25 | 0.8 | 4 | 1.563 |
| scout/brawler | 2 | 114 | 1.14 | 0.85 | 0.779 | 1.2 | 3.969 | 0.607 |
| scout/artillerist (neue Kombination) | 2 | 76 | 0.76 | 0.85 | 0.992 | 1.2 | 3.802 | 0.983 |
| scout/occultist (neue Kombination) | 2 | 66 | 0.665 | 0.85 | 1.133 | 1.2 | 3.848 | 1.284 |
| heavy/brawler (neue Kombination) | 2 | 156 | 1.56 | 1 | 0.917 | 0.8 | 4.277 | 0.84 |
| heavy/artillerist | 2 | 104 | 1.04 | 1 | 1.167 | 0.8 | 4.007 | 1.361 |
| heavy/occultist (neue Kombination) | 2 | 91 | 0.91 | 1 | 1.333 | 0.8 | 4.043 | 1.778 |
| artillery/brawler (neue Kombination) | 2 | 108 | 1.08 | 1.3 | 1.192 | 0.7 | 4.272 | 1.42 |
| artillery/artillerist (neue Kombination) | 2 | 72 | 0.72 | 1.3 | 1.517 | 0.7 | 4.237 | 2.3 |
| artillery/occultist | 2 | 63 | 0.63 | 1.3 | 1.733 | 0.7 | 4.363 | 3.004 |

`ARCHETYPE_LAUNCH_BASE` (1,2, gehört zu keinem Archetyp): rechnerische Wirkung einer Normalisierung auf die alten Kombinationen (Partienwirkung nicht gemessen):

| Variante | Basis | Geschwindigkeit | Wurfweite |
|---|---:|---:|---:|
| Ist: 1,2 (kein Archetyp hat diesen Wert) | 1.2 | 0 % | 0 % |
| Mittel der drei Archetypen | 1.3667 | -12.2 % | -22.9 % |
| brawler (1,1) = neutral | 1.1 | 9.1 % | 19 % |
| artillerist (1,4) = neutral | 1.4 | -14.3 % | -26.5 % |

## 5 Befunde aus der Messung (Lesart, keine Regeländerung)

Alles Folgende ist Auslegung der Zahlen oben; die Stichproben sind klein (Abschnitt 1).

1. **Fassung 3, Bot statisch:** Kein Klassenunterschied in der Siegrate nachweisbar (je 50 %, Intervall 35 bis 66 %). Der Schaden je Zug steigt dagegen mit Wucht und Tempo (nahkampf 2,16, fernkampf 3,36, okkultist 4,52), die Lebenszeit des Okkultisten ist kürzer (Median 3,37 min gegen 5,5 bis 5,6 min). Die Ertrinkenquote an den Toden ist hoch (53 bis 81 %): ein großer Teil der Entscheidungen fällt durch Gelände und Wasser, nicht durch Waffenschaden.
2. **Bot vorrückend:** Die Partien sind mehr als doppelt so kurz (Median 2,69 min gegen 5,44 min), der Schaden je Zug vervielfacht sich (9 bis 17 LP), und die Siegraten streuen stärker (nahkampf 58 %, fernkampf 42 %, okkultist 50 %, Intervalle 19 bis 81 %). Auch hier kein belastbarer Unterschied bei n = 12 je Rolle. Der erste Zug gewinnt im Spiegel nur 17 % (n = 18): ein Hinweis, dass nahe Duelle den zweiten Zug begünstigen, bei 6 Seeds aber nicht belastbar.
3. **Erster Zug:** Bot statisch, Fassung 3: 57 % für den ersten Zug im Spiegel (n = 54, Intervall 44 bis 70 %), nicht von 50 % trennbar. Alte Kombinationen: 36 % (n = 36, Intervall 23 bis 52 %), Tendenz zum zweiten Zug.
4. **Alte Kombinationen:** Die Brawler-Kombinationen haben die höchsten Siegraten (heavy/brawler 72 %, scout/brawler 66 %), artillery/occultist 63 %; scout/occultist (31 %) ist am schwächsten. artillery/artillerist erreicht 11 LP Schaden je Zug bei 1,44 min Lebenszeit. Die sechs neuen Kombinationen liegen in der Siegrate zwischen 31 % und 72 %; ihre Intervalle (rund 15 Punkte breit je Seite) überlappen weitgehend.
5. **Reichweite:** Nahkampf erreicht bei keiner Kartenbreite mit irgendeiner der 100 Projektilwaffen den Startabstand (0/100), der Okkultist 64 bis 69 von 100; fernkampf 13 bis 18. Das deckt sich mit dem Tempofaktor (Wurfweite ~ Tempo², nahkampf 0,56, okkultist 1,56).
6. **Scout:** Fassung 2 gegen Fassung 1 hebt scout/brawler von 58 % auf 71 % und scout/occultist senkt es von 42 % auf 25 % (je n = 24, Intervalle überlappen).

## 6 Grenzen und Fehlerquellen der Messung

- Kleine Stichproben, wiederverwendete Seeds (Abschnitt 1); keine Aussage über Vollabdeckung. Die Stufe `breit` (4 Formate, 24 Seeds, alle 20 Sonderbiome) ist im Skript vorbereitet, aber **nicht gelaufen**.
- Gleicher Bot für alle Rollen; keine Kisten, kein Zielen nach Rolle, kein Positionsspiel. Ergebnisse bilden nicht ab, wie Menschen die Rollen spielen. Menschliche Spieltests fehlen.
- **Biom-Beobachtung (nur Einzelprobe, Ursache ungeprüft):** In einem Probelauf (Seed 20261111, 24:9 groß, 1 Duell nahkampf gegen okkultist) wich der Spielverlauf nur bei vulkan, eiswueste und schrott von „klassisch“ ab; bei den übrigen 17 der 20 Sonderbiome war das Ergebnis identisch. Die Biomstufe misst deshalb nur diese drei plus klassisch. Warum die anderen Biome dieses Duell nicht verändern (kein Spielwirkung der Biomwahl im Bot-Duell, Seed-Zufall oder Messfehler), wurde nicht untersucht.
- Die Biomzahlen (n = 16 je Rolle) sind kaum belastbar; die auffälligen Werte (okkultist 75 %, fernkampf 25 %) liegen innerhalb der Intervalle.
- Die Wurfweiten-Rechnung ist ein Idealfall (ebener Boden, kein Wind); `aimPreview` stimmt mit ihr überein, sie sagt nichts über Geländehindernisse.
- Die Okkultist-Streuung des Schadens (SD 20,5 bei Mittel 4,5) kommt von wenigen Ausreißerzügen (Einzeltreffer mit sehr hohem Schaden); Mittelwerte sind dort wenig robust.

## 7 Vorschläge (nicht umgesetzt, Entscheidung beim Auftraggeber)

Diese Punkte sind Empfehlungen, keine Messergebnisse; keine Regel wurde geändert.

1. **Folgelauf Stufe `breit`** (rund 4- bis 6-faches der Standardstufe, grob 45 bis 90 Minuten mit 2 Prozessen; Schätzung aus der Standardlaufzeit, nicht gemessen) mit mehr unabhängigen Seeds je Format, um die Siegraten von 36 auf rund 200 Partien je Rolle zu bringen. Erst dann sind Siegratenunterschiede unter etwa 15 Punkten bewertbar.
2. **Menschliche Spieltests oder ein rollenbewusster Bot** (Okkultist: Abstand halten, Nahkampf: Annähern), bevor an Klassenfaktoren gedreht wird. Auf der heutigen Messung gibt es keinen Anlass, Klassenwerte zu ändern.
3. **Reichweite Nahkampf:** Die Rechnung zeigt, dass der Nahkampf mit keiner Projektilwaffe den Startabstand erreicht (0 von 100). Ob das beabsichtigt ist (Rolle: nur näher heran), ist eine Designentscheidung; bei ihr ist der Spielfluss (Annäherung unter Beschuss) zu beachten.
4. **`ARCHETYPE_LAUNCH_BASE`:** Falls die alten Kombinationen weitergeführt werden, bewegt eine Normalisierung die Wurfweite um bis zu -26,5 % bis +19 % (Tabelle in Abschnitt 4); das wäre eine Regeländerung mit Versionsmarke nach AGENTS.md §2.
5. **Biome:** Prüfen, warum 17 von 20 Sonderbiomen im Bot-Duell denselben Verlauf wie „klassisch“ liefern (Abschnitt 6), bevor Biomzahlen je Rolle ausgewertet werden.
6. **Ertrinkenquote** (53 bis 81 % der Tode in Fassung 3): als Kennzahl in die Waffenbalance aufnehmen, weil Gelände- und Wasserwirkung die Rollen mehr trennen könnte als die Waffen.

## 8 Reproduktion

```bash
node scripts/balance-rollen.mjs --stufe=standard --parallel=2 --ausgabe=docs/balance-rollen-2026-11-12.json
node scripts/balance-rollen.mjs --stufe=klein --module=klassen        # Rauchprobe, wenige Sekunden
PA_ZUGPAUSE_SEKUNDEN=0 node --test tests/balance-rollen.test.js        # 10 Tests
```

## 9 Korrekturen an der Vorarbeit (Nachweis, was geändert wurde)

- Test „Siegrate ohne Spiegel, Schaden je Zug“: Der Test erwartete 50/10 Züge. `wertAus` zählt Züge und Schaden auch der Spiegelfigur (nur die Siegrate lässt Spiegel aus), richtig sind 50/12 und 3/12. Ursache: **Test veraltet**, nicht Waffenfassung 22.
- Test „Reichweite: Rechnung stimmt mit aimPreview überein“ (Abweichung 1624 px): `gegenprobeBahn` verglich jeden Schritt gegen die Vorschau, die alle 3 Schritte abtastet (`sampleEvery` 3), rechnete ohne Wind und Windfaktor der Waffe und startete an der Mündung statt an der Figurposition (`aimPreview` startet bei `launchVector`). Behoben im Messwerkzeug; Abweichung danach 0 px. Ursache: **Werkzeugfehler der Vorarbeit**, nicht Waffenfassung 22 (die Abtastung gilt seit Fassung 4).
- Stufe `standard`, Biome: `abyssal_tiefsee` ist keine gültige Biomkennung (richtig `tiefsee`) und fiel auf zufällige andere Biome zurück; die Biomliste wurde nach der Einzelprobe (Abschnitt 6) auf klassisch, vulkan, eiswueste, schrott gesetzt.
- Ergänzt: Standardabweichung des Schadens je Zug.
