# BAL-13 · Status-, Schild-, Heil- und Buffökonomie mit echten LP

Stand: 2026-11-09, Branch `bg/bal-13`. Geändert wurden nur Tests und Belege —
keine Spielwerte. Die Messung läuft gegen die drei tatsächlichen Klassenleben
aus Klassenfassung 3:

| Klasse | Leben |
|---|---:|
| okkultist | 70 |
| fernkampf | 100 |
| nahkampf | 130 |

Damit greift der 20-%-DoT-Deckel mit 14/20/26 statt mit 200 bei den bisherigen
1000-LP-Kontrollaufbauten.

## Abnahme

```bash
PA_ZUGPAUSE_SEKUNDEN=0 node --test tests/status-oekonomie.test.js
```

```text
# tests 22
# pass 22
# fail 0
```

Jeder Punkt hat eine Gegenprobe; die Datei führt sie im selben Lauf aus.

| Punkt | Messung | Gegenprobe |
|---|---|---|
| Heilgrenze | 40 Heilung bei 10 fehlenden LP heilt genau 10; am vollen Leben 0; pa_094 (70) endet exakt am Maximum | dieselbe Heilung ohne Grenznähe heilt voll |
| Schild | pa_093 40, pa_101 55, pa_148 75 Punkte | 30 Schaden: mit 40er Schild 0 HP-Verlust, ohne Schild 30 |
| Schild-Überlappung | 40 + 55 = 95; 55 + 75 = 130 → 120 gedeckelt | einzelne Schilde bleiben bei 40/55/75 |
| Schildrückwirkung | Eis → Frost, Blitz → Schock, Feuer → Brand beim Angreifer | ohne Schild bleibt der Angreifer frei |
| Rüstung | pa_130 20 %, pa_126 35 %; 40 Schaden → 32 bzw. 26 | ohne Rüstung 40 |
| Rüstungs-Überlappung | 20 % → 35 % = 35 %; 35 % → 20 % bleibt 35 % | zweimal 20 % bleibt 20 % |
| Verstärkung | pa_083 Basis 34,5; mit pa_084 ×1,7 = 58,65 | nach Ablauf wieder 34,5 bei Multiplikator 1,0 |
| Verstärkungs-Überlappung | 20 Anwendungen: 1,7 und 2 Züge; schwacher Buff verlängert höchstens auf 5 Züge | nach 5 eigenen Zügen Multiplikator 1,0 |
| Dauerstun | 20 Züge, zwei Urheber: `STSTST…`, 10 Aussetzer, nie zwei hintereinander | Schutz blockiert jede zweite Anwendung |
| Stapelgrenzen | 50× Gift = 2 Stapel; 50× Brand = 1 Eintrag; höchstens 3 Mali | erste Anwendung wirkt |
| DoT-Deckel | 14/20/26 je Zug; zwei Urheber teilen sich 14 in 7 + 7 | 10 Schaden bleiben 10, `gedeckelt: false` |
| Reinigung/Wasser | pa_092 nimmt Frost, pa_094 Schock, Wasser löscht Brand; Heilung ab 20/40 räumt Mali | trockener Brand bleibt zunächst |
| Nachschub | pa_119/122/125 stellen 2/3/4 Ladungen in ein echtes Inventar; endliche Waffe 1 → 3/4/5, nie über 5 | volle Waffen bleiben auf der Obergrenze |
| Turret | pa_124 feuert zweimal auf ein echtes 130-LP-Ziel, trifft, läuft einmal ab | ohne Ziel in Reichweite kein Schuss |

## Befund zur Nachschub-Ökonomie

Bei vollem Inventar stellt `restoreAmmo` auch die abgefeuerte Nachschubwaffe
selbst wieder auf die Obergrenze (gemessen: `restored: 1`, Vorrat bleibt 5).
Das ist **kein unbegrenztes Stapeln** — 5 ist die harte Grenze —, aber es macht
die Nachschubwaffe bei vollem Inventar unerschöpflich. Der Test hält deshalb
nur die Obergrenze und die endliche Fremdwaffe fest; die Ökonomieentscheidung
gehört zu BAL-05, nicht zu dieser Messung.

**Nachtrag 2026-11-10 (BAL-05 entschieden):** Ab Waffenfassung 18 füllt eine Nachschubwaffe nie sich
selbst, nur andere endliche Waffen (Entscheidung des Auftraggebers). Beleg mit 30 Anwendungen:
`tests/nachschub-fassung18.test.js`. Die obige Messung gilt weiter für Fassung 17 und älter.

## Grenzen

- Die Betäubungsprobe ruft `MaliRegeln.betaeube` direkt auf, damit zwei Urheber
  und der Schutzzug isoliert messbar sind; der Frost-/Schockpfad ist in
  `tests/schadensarten.test.js` zusätzlich abgedeckt.
- Rüstung und Schild haben im aktuellen Vertrag keine eigene Dauer. Gemessen
  wird ihre Höhe und Überlappung, nicht ein Ablauf.
