# DESIGNWERT-1 · Herkunft der Schadenswerte (Stand 2026-11-10)

Status: **bewusst als abgeleitet markiert und festgeschrieben.** Kein Wert geändert.

Die Quelldatei `project_armageddon_weapons_v1.json` liefert für 97 von 150 Waffen einen eigenen
Schadenswert (`damageSource: 'source'`). Die übrigen 53 teilen sich in zwei Gruppen:

## 15 Waffen ohne Schaden (`none`) — gewollt

Alle 15 sind Werkzeuge ohne Trefferwirkung: Bewegung (pa_032 Raketenrucksack, pa_111 Enterhaken,
pa_112 Düsenrucksack, pa_114 Gleitschirm, pa_087 Dimensionssprung, pa_088 Dimensionsriss,
pa_128 Hologrammportal, pa_131 Schlauchboot), Schutz (pa_115 Wächterstatue, pa_126 Bunker,
pa_130 Tarnnetz), Nachschub (pa_119, pa_122, pa_125) und die Mine (pa_127; ihr Schaden kommt aus
den Minen-Daten, nicht aus `damage`). Ein Schadenswert wäre hier falsch.

## 38 Waffen mit abgeleitetem Schaden (`derived`) — Regel statt Platzhalter

Die Quelldatei trug für sie nur den Platzhalter 25. `scripts/build-weapon-catalog.mjs`
(`derivePlaceholderDamage`) leitet den Wert aus der Kategorie ab (melee 30, ranged 26,
heavy_ranged 52, elemental 36, magic 34, tech 30, utility 16, ultimate 68) mit einer festen
Streuung aus dem Index (0,82 bis 1,18, ohne Zufall). Davon:

- **22** (Nahkampf pa_011 bis pa_021, Fernkampf pa_024 bis pa_036, schwere Fernwaffen pa_042 bis
  pa_051) werden in späteren Waffenfassungen (Zielband, Tempo, Klassenfaktor) skaliert; der
  abgeleitete Wert ist dort nur noch die Ausgangsgröße.
- **16** (Elementar pa_076, Magie pa_084 bis pa_110, Ultimate pa_149) spielen heute genau den
  abgeleiteten Wert.

## Was offen bleibt

Ob die 38 eigene Designwerte bekommen sollen, ist eine Inhaltsentscheidung des Auftraggebers.
Bis dahin gilt die Ableitung als bewusste Regel. `tests/designwert-herkunft.test.js` hält die
Aufteilung fest: Eine neue Waffe ohne Designwert, ein Werkzeug, das plötzlich Schaden macht,
oder eine Änderung der Ableitung fällt dort auf.
