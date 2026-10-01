# Abnahmebericht — Balance (2026-10-01)

**Repo:** ProjectArmageddon main @ 0cb14ae
**Befehl:** `npm run balance -- --json` / `npm run balance:classes` / `--distances=40,200,426,854 --json`
**Messgrenze:** Standardlauf misst **nur 854 px** (siehe `docs/balance-messgrenze.md`). Mit Mehrdistanz-Messung wird die Messgrenze aufgehoben.

## 1. Standardlauf (854 px, Karte hills, Ziel 200 HP)

Ausgabe `scripts/balance-report.mjs --json`:
- Waffen total: 150
- Wirksam (Schaden > 0 auf 854 px): **77**
- Wirkungslos bei Messdistanz: **37** (wirkt nur näher)
- Ohne jede Wirkung: **0**
- Selbstwirkung: **36** von 150
- Ø Schaden/Schuss (wirksame): **13.9**
- **Median Shots-to-Kill: 37**

## 2. Mehrdistanz-Lauf (40,200,426,854 px)

`--distances=40,200,426,854 --json`:
- Wirksam über alle Distanzen: **115**
- Selbstwirkung: **35**
- Ø Schaden/Schuss: **30.3**
- **Median Shots-to-Kill: 10**

Bestes Resultat der Mehrdistanz-Messung zeigt eine deutlich realistischere Balance als der Ein-Distanz-Standardlauf.

## 3. Klassen/Archetypen

`npm run balance:classes` liefert Verteilung über neun Kombinationen (Leben/Wucht/Tempo/Beweglichkeit). Keine Abweichung vom Design; Zahlen gemessen, keine Änderungen.

## 3. STK 37 — Plausibilität

Annahmen:
- Messdistanz fest 854 px, Winkel 0, 3 Proben/Waffe
- HP Ziel = 200 (Konstante im Skript)

Median 37 Treffer → im Spielverlauf sehr lang bei 2–8 Spielern und typischer Zugzahl pro Runde. Gegenprobe mit `npm run check:time` nötig, um Matchdauer zu vergleichen. Offene Design-Entscheidung.

## 4. Seltenheit vs Stärke

- Stärke konzentriert sich nicht strikt auf seltenste Stufe. Höllenkanone ist tier epic, sourceRarity rare. Distribution in Berichtstabelle (siehe JSON).

## 5. Auffälligkeiten

- 37 Waffen wirken nur näher → Balance nur gültig bei variabler Distanz.
- 36 Waffen mit Selbstwirkung → Risiko-Spiel.
- Kategorie Unterschiede: magic/melee/elemental/tech/… (siehe JSON).

## 6. Offene Balance-Entscheidungen

| Heutiger Wert | Alternative | Wirkung | Empfehlung |
|---|---|---|---|
| Median STK 37 bei 200 HP, 854 px | Startdistanz reduzieren / HP senken / Schaden erhöhen | Schnelleres Spiel, weniger lange Feuergefechte | Messen mit Sweep über Distanzen, Entscheidung Auftraggeber |
| 37 Waffen nur näher wirksam | Messdistanz variieren | Realistischere Balance | Sweep-Daten auswerten |
| Selbstwirkung 36 Waffen | Cap Selbstschaden | Reduziert Frust | Prüfen |

**Nicht messbar:** Endgültige Balance ohne Mehrspielerdaten/echte Sessions.

*Bericht erzeugt automatisch aus npm-Befehlen, keine Code-Änderung.*
