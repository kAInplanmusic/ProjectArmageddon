# Balance je Rolle, Neumessung mit den Menü-Regeln (2026-11-18)

Messung: `node scripts/balance-rollen.mjs --stufe=standard --parallel=2` (Rohdaten `docs/balance-rollen-2026-11-18.json`).
Anlass: Die Messwerkzeuge starteten bis QV-6 mit den Altständen von Wind, Hagel, Seil u. a. Jetzt lesen sie
`MENUE_FASSUNGEN` wie das Menü (Biomregel-Fassung 3). Zahlen aus `docs/balance-rollen-2026-11-12.md` und `-11-17.md` beruhen auf den Altregeln.

## Klassen (Duelle 1 gegen 1, je 36 Partien)

| Rolle | Siegrate 17.11 (Altregeln) | Siegrate 18.11 (Menü-Regeln) | Trefferquote 17.11 | Trefferquote 18.11 |
|---|---|---|---|---|
| nahkampf | 38,9 % | 41,7 % | 18,0 % | 21,8 % |
| fernkampf | 38,9 % | 38,9 % | 18,3 % | 21,3 % |
| okkultist | 72,2 % | 69,4 % | 24,4 % | 27,4 % |

## Aussage und Grenzen

- Der Vorsprung des Okkultisten bleibt mit den Menü-Regeln bestehen (69 % statt 72 %); er war KEIN Artefakt der Altregeln.
- Die Trefferquoten steigen bei allen Rollen um rund 3 bis 4 Prozentpunkte (Wind je Zug, Hagel u. a. wirken jetzt mit).
- 36 Partien je Rolle sind eine Stichprobe: Unterschiede von 2 bis 3 Prozentpunkten liegen im Rauschen (Wilson-Intervalle stehen im JSON).
- Die Module `alt`, `scout`, `vorruecken`, `biome`, `reichweite` liegen im JSON und sind hier nicht ausgewertet.
- Bot-Duelle sagen nichts über menschliches Spiel; der Spieltest QV-4 steht aus. Es wurde kein Spielwert geändert.
