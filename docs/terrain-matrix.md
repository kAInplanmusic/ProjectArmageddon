# Gelände-Matrix: Eigenschaften und Schadensarten

Erzeugt aus `src/shared/config/stoffe.js` über `src/shared/materialMatrix.js` (`node scripts/terrain-matrix-schreiben.mjs`).
Reine Lesesicht, keine Spielregel.

**Drei Eigenschaften je Boden**

- **Härte:** weich, normal, hart, sehr_hart, unzerstoerbar — bestimmt Größe und Tiefe des Kraters.
- **Haftung:** rutschig, glatt, normal, griffig — aus dem Reibungsfaktor (Eis rutscht, Sand und Asche greifen).
- **Nachgiebigkeit:** fest, weich, tief, traegt nicht — aus Bremswirkung und Tragfähigkeit (Magma und Dampf tragen nicht).

**Matrix:** Die Zahlen sind der Radiusfaktor auf den Krater (1 = Erde mit Wucht). Spalten sind die Wirkgruppen der Schadensart:
Wucht (Standard), Hitze (Feuer, Drache, Energie, Plasma), Kälte (Eis), Ätz (Säure, Gift), Strom (Elektro, Magnet), Nass (Wasser).
0 heißt unzerstörbar.

| Stoff | Härte | Haftung | Nachgiebigkeit | wucht | hitze | kaelte | aetz | strom | nass | Sonderwirkung |
|---|---|---|---|---|---|---|---|---|---|---|
| Erde | normal | normal | fest | 1 | 1 | 1 | 1 | 1 | 1.1 | – |
| Sand | weich | griffig | tief | 1.25 | 1.13 | 1.25 | 1.25 | 1.25 | 1.06 | – |
| Schnee | weich | glatt | tief | 1.35 | 1.89 | 1.22 | 1.35 | 1.35 | 1.35 | schmilzt |
| Pilzgewebe | weich | griffig | weich | 1.2 | 1.5 | 1.2 | 1.38 | 1.2 | 1.2 | brennt |
| Holz | normal | normal | fest | 0.95 | 1.19 | 0.95 | 0.95 | 0.95 | 0.86 | brennt |
| Fels | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | – |
| Obsidian | sehr_hart | glatt | fest | 0.4 | 0.4 | 0.4 | 0.4 | 0.36 | 0.4 | splittert (1) |
| Eis | normal | rutschig | fest | 1 | 1.5 | 0.8 | 1 | 1 | 1 | schmilzt, splittert (3) |
| Kristall | hart | glatt | fest | 0.8 | 0.8 | 0.8 | 0.72 | 0.92 | 0.8 | splittert (4) |
| Metallplatte | unzerstoerbar | normal | fest | 0 | 0 | 0 | 0 | 0 | 0 | – |
| Grundgestein | unzerstoerbar | normal | fest | 0 | 0 | 0 | 0 | 0 | 0 | – |
| Basalt | hart | normal | fest | 0.65 | 0.59 | 0.65 | 0.72 | 0.65 | 0.65 | – |
| Asche | weich | griffig | tief | 1.3 | 1.3 | 1.3 | 1.3 | 1.3 | 1.04 | – |
| Koralle | normal | normal | fest | 0.95 | 0.95 | 0.95 | 1.23 | 0.95 | 0.95 | splittert (2) |
| Beton | hart | normal | fest | 0.72 | 0.68 | 0.72 | 0.83 | 0.72 | 0.72 | splittert (2) |
| Glas | normal | glatt | fest | 1.05 | 1.26 | 1.16 | 1.05 | 0.95 | 1.05 | schmilzt, splittert (5) |
| Regolith | weich | normal | fest | 1.3 | 1.17 | 1.3 | 1.3 | 1.3 | 1.17 | – |
| Magiekristall | hart | glatt | fest | 0.75 | 0.83 | 0.75 | 0.64 | 0.98 | 0.75 | splittert (4) |
| Alienharz | weich | griffig | tief | 1.15 | 1.5 | 1.15 | 1.26 | 1.15 | 1.15 | brennt, schmilzt |
| Asteroidenbasalt | hart | normal | fest | 0.65 | 0.59 | 0.65 | 0.72 | 0.65 | 0.65 | – |
| Betonreste | normal | griffig | weich | 1 | 1 | 1 | 1.15 | 1 | 0.95 | splittert (2) |
| Bimsstein | weich | griffig | weich | 1.2 | 1.08 | 1.2 | 1.2 | 1.2 | 1.08 | splittert (1) |
| Burgfelsen | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | splittert (1) |
| Dampfkammer | weich | rutschig | traegt nicht | 1.6 | 1.6 | 1.28 | 1.6 | 1.6 | 1.6 | – |
| Druckkammer | sehr_hart | normal | fest | 0.4 | 0.4 | 0.4 | 0.46 | 0.48 | 0.4 | – |
| Eisader | normal | rutschig | fest | 0.95 | 1.33 | 0.76 | 0.95 | 0.95 | 0.95 | schmilzt, splittert (3) |
| Erdüberzug | weich | normal | fest | 1.1 | 1.1 | 1.1 | 1.1 | 1.1 | 1.21 | – |
| Feinsand | weich | griffig | tief | 1.25 | 1.13 | 1.25 | 1.25 | 1.25 | 1.06 | – |
| Feuchte Erde | weich | glatt | weich | 1.1 | 0.99 | 1.1 | 1.1 | 1.26 | 0.99 | – |
| Firnschnee | weich | glatt | weich | 1.25 | 1.75 | 1.13 | 1.25 | 1.25 | 1.25 | schmilzt |
| Gefrorene Wurzeln | normal | glatt | fest | 0.95 | 1.05 | 0.86 | 0.95 | 0.95 | 0.95 | brennt, splittert (1) |
| gehärtetes Glas | hart | glatt | fest | 0.75 | 0.68 | 0.68 | 0.75 | 0.68 | 0.75 | schmilzt, splittert (3) |
| Geröll | weich | griffig | weich | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 | 1.03 | splittert (1) |
| Giftablagerungen | weich | griffig | weich | 1.2 | 1.2 | 1.2 | 0.96 | 1.2 | 1.08 | – |
| Giftnebel | weich | rutschig | traegt nicht | 1.6 | 1.6 | 1.6 | 1.28 | 1.6 | 1.6 | – |
| Glasfassade | normal | glatt | fest | 0.95 | 1.14 | 1.05 | 0.95 | 0.86 | 0.95 | schmilzt, splittert (4) |
| Glasfragmente | weich | glatt | weich | 1.3 | 1.56 | 1.43 | 1.3 | 1.3 | 1.3 | schmilzt |
| Glasplatten | normal | glatt | fest | 1 | 1.2 | 1.1 | 1 | 0.9 | 1 | schmilzt, splittert (4) |
| Gletschereis | hart | rutschig | fest | 0.8 | 1.12 | 0.64 | 0.8 | 0.8 | 0.8 | schmilzt, splittert (2) |
| Holzaufbauten | normal | normal | fest | 0.95 | 1.19 | 0.95 | 0.95 | 0.95 | 0.86 | brennt |
| Holzreste | weich | normal | weich | 1.1 | 1.43 | 1.1 | 1.1 | 1.1 | 0.99 | brennt |
| Humus | weich | griffig | weich | 1.15 | 1.26 | 1.15 | 1.15 | 1.15 | 1.21 | brennt |
| Hydrothermalablagerungen | normal | normal | fest | 0.9 | 0.81 | 0.9 | 1.08 | 0.9 | 0.9 | splittert (2) |
| Industriemagma | weich | glatt | traegt nicht | 1.6 | 1.6 | 1.6 | 1.6 | 1.6 | 1.28 | – |
| Instabiler Boden | weich | normal | weich | 1.3 | 1.3 | 1.3 | 1.3 | 1.43 | 1.3 | splittert (2) |
| Kalkstein | normal | normal | fest | 0.9 | 0.9 | 0.86 | 1.26 | 0.9 | 0.9 | splittert (1) |
| Keramik | hart | glatt | fest | 0.8 | 0.56 | 0.84 | 0.8 | 0.8 | 0.8 | splittert (3) |
| Kerkergewölbe | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | splittert (1) |
| Klareis | normal | rutschig | fest | 1 | 1.5 | 0.8 | 1 | 1 | 1 | schmilzt, splittert (3) |
| Klareiskristall | hart | rutschig | fest | 0.8 | 1.12 | 0.64 | 0.8 | 0.88 | 0.8 | schmilzt, splittert (4) |
| Kolossstamm | hart | normal | fest | 0.65 | 0.72 | 0.65 | 0.65 | 0.65 | 0.59 | brennt |
| Kontaminierte Ablagerungen | weich | griffig | weich | 1.15 | 1.15 | 1.15 | 0.98 | 1.15 | 1.03 | – |
| Kontaminierte Erde | normal | normal | weich | 1 | 1 | 1 | 1.1 | 1 | 1.1 | – |
| korrodiertes Metall | hart | normal | fest | 0.7 | 0.7 | 0.7 | 0.98 | 0.7 | 0.77 | splittert (2) |
| Korrosion | weich | griffig | weich | 1.2 | 1.2 | 1.2 | 1.44 | 1.2 | 1.32 | splittert (1) |
| Kristalladern | hart | glatt | fest | 0.8 | 0.8 | 0.8 | 0.72 | 0.92 | 0.8 | splittert (4) |
| Kristallblätter | normal | glatt | fest | 1 | 1 | 1 | 0.9 | 1.15 | 1 | splittert (4) |
| Kristallfelsen | hart | glatt | fest | 0.75 | 0.75 | 0.75 | 0.83 | 0.83 | 0.75 | splittert (3) |
| Lavaglas | hart | glatt | fest | 0.7 | 0.84 | 0.77 | 0.7 | 0.7 | 0.7 | schmilzt, splittert (4) |
| lebende Koralle | normal | normal | fest | 0.95 | 1.05 | 0.95 | 1.33 | 0.95 | 0.95 | splittert (1) |
| lehmige Erde | normal | griffig | tief | 0.95 | 0.95 | 0.95 | 0.95 | 0.95 | 0.86 | – |
| Leuchtalgen | weich | glatt | weich | 1.25 | 1.5 | 1.25 | 1.5 | 1.25 | 1.13 | – |
| Leuchtkristall | hart | glatt | fest | 0.8 | 0.8 | 0.8 | 0.72 | 0.92 | 0.8 | splittert (4) |
| Leuchtpilzgewebe | weich | griffig | weich | 1.2 | 1.5 | 1.2 | 1.38 | 1.2 | 1.2 | brennt |
| Magmaadern | hart | normal | fest | 0.7 | 0.63 | 0.84 | 0.7 | 0.7 | 0.7 | schmilzt, splittert (1) |
| Magnetgestein | hart | normal | fest | 0.7 | 0.7 | 0.7 | 0.7 | 0.84 | 0.7 | splittert (1) |
| Massivfels | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | – |
| Mauerwerk | hart | normal | fest | 0.74 | 0.7 | 0.74 | 0.85 | 0.74 | 0.74 | splittert (2) |
| Metallader | sehr_hart | normal | fest | 0.45 | 0.45 | 0.45 | 0.45 | 0.5 | 0.45 | – |
| Metallfragmente | normal | normal | weich | 1 | 1 | 1 | 1 | 1.1 | 1 | splittert (2) |
| Metallgitter | normal | glatt | fest | 0.9 | 0.9 | 0.9 | 0.9 | 0.99 | 0.9 | splittert (1) |
| Metallplatten | sehr_hart | normal | fest | 0.45 | 0.45 | 0.45 | 0.45 | 0.5 | 0.45 | – |
| Metallschienen | hart | glatt | fest | 0.65 | 0.65 | 0.65 | 0.65 | 0.72 | 0.65 | – |
| Metallträger | sehr_hart | normal | fest | 0.45 | 0.45 | 0.45 | 0.45 | 0.5 | 0.45 | – |
| Metalltrümmer | normal | griffig | weich | 1 | 1 | 1 | 1 | 1.1 | 1 | splittert (2) |
| Meteoritenfels | sehr_hart | normal | fest | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 | splittert (1) |
| Moos | weich | griffig | weich | 1.3 | 1.56 | 1.3 | 1.3 | 1.3 | 1.17 | brennt |
| Mutterboden | weich | griffig | weich | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 | 1.26 | – |
| Myzelmatte | weich | griffig | weich | 1.2 | 1.5 | 1.2 | 1.38 | 1.2 | 1.2 | brennt |
| Nickel-Eisen | sehr_hart | normal | fest | 0.45 | 0.45 | 0.45 | 0.45 | 0.5 | 0.45 | – |
| Organische Riffablagerungen | weich | normal | weich | 1.2 | 1.2 | 1.2 | 1.56 | 1.2 | 1.2 | splittert (1) |
| Organische Tragwurzeln | normal | normal | fest | 0.95 | 1.19 | 0.95 | 0.95 | 0.95 | 0.86 | brennt |
| Phasen-Fels | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | – |
| Pilzbrücke | normal | griffig | weich | 1 | 1.25 | 1 | 1.15 | 1 | 1 | brennt |
| Pilze | weich | griffig | weich | 1.2 | 1.5 | 1.2 | 1.38 | 1.2 | 1.2 | brennt |
| Pilzmyzel | weich | griffig | weich | 1.2 | 1.5 | 1.2 | 1.38 | 1.2 | 1.2 | brennt |
| Poröser Beton | hart | normal | fest | 0.85 | 0.85 | 0.85 | 1.06 | 0.85 | 0.94 | splittert (3) |
| Poröser Fels | hart | normal | fest | 0.85 | 0.85 | 0.85 | 1.06 | 0.85 | 0.85 | splittert (2) |
| Pulverschnee | weich | normal | tief | 1.4 | 1.96 | 1.26 | 1.4 | 1.4 | 1.4 | schmilzt |
| Rankgitter | weich | normal | weich | 1.1 | 1.43 | 1.1 | 1.26 | 1.1 | 0.99 | brennt |
| Raumanker | unzerstoerbar | glatt | fest | 0 | 0 | 0 | 0 | 0 | 0 | – |
| Regolith-Staub | weich | griffig | tief | 1.3 | 1.17 | 1.3 | 1.3 | 1.3 | 1.17 | – |
| Riff-Kalkstein | normal | normal | fest | 0.95 | 0.95 | 0.95 | 1.28 | 0.95 | 0.95 | splittert (1) |
| Risszone | weich | glatt | fest | 1.56 | 1.3 | 1.3 | 1.3 | 1.56 | 1.3 | splittert (3) |
| Rohrleitungen | hart | glatt | fest | 0.7 | 0.7 | 0.7 | 0.84 | 0.84 | 0.7 | splittert (1) |
| Rostmetall | hart | normal | fest | 0.75 | 0.75 | 0.75 | 1.05 | 0.83 | 0.83 | splittert (1) |
| Salzkruste | normal | normal | fest | 1 | 1 | 1 | 1.1 | 1 | 1.4 | splittert (2) |
| Sandstein | normal | normal | fest | 0.9 | 0.9 | 0.9 | 1.03 | 0.9 | 0.95 | splittert (1) |
| Säureablagerungen | weich | normal | weich | 1.15 | 1.15 | 1.15 | 0.69 | 1.15 | 1.5 | splittert (2) |
| Säureboden | weich | normal | weich | 1.2 | 1.2 | 1.2 | 0.72 | 1.2 | 1.32 | – |
| Schlacke | normal | griffig | weich | 0.9 | 1.08 | 0.99 | 0.9 | 0.9 | 0.9 | schmilzt, splittert (3) |
| Schrott | normal | griffig | weich | 0.95 | 0.95 | 0.95 | 1.14 | 1.09 | 0.95 | splittert (2) |
| Schwebende Plattformen | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | splittert (1) |
| Schwefelkruste | normal | normal | fest | 1 | 1.3 | 1 | 1.05 | 1 | 1 | brennt, schmilzt, splittert (2) |
| Seegras | weich | glatt | traegt nicht | 1.2 | 1.56 | 1.2 | 1.32 | 1.2 | 1.2 | brennt |
| Stabilisatormaterial | unzerstoerbar | glatt | fest | 0 | 0 | 0 | 0 | 0 | 0 | – |
| Stahlbeton | sehr_hart | normal | fest | 0.5 | 0.48 | 0.5 | 0.55 | 0.5 | 0.5 | splittert (1) |
| Stalaktiten | normal | glatt | fest | 1.2 | 1 | 1 | 1.3 | 1 | 1 | splittert (3) |
| Teer | weich | griffig | tief | 1.1 | 1.43 | 1.1 | 1.1 | 1.1 | 1.1 | brennt, schmilzt |
| Tempelstein | hart | normal | fest | 0.7 | 0.7 | 0.7 | 0.81 | 0.7 | 0.7 | splittert (1) |
| Tiefenfels | sehr_hart | normal | fest | 0.5 | 0.5 | 0.48 | 0.55 | 0.5 | 0.5 | – |
| Tiefseebasalt | hart | normal | fest | 0.65 | 0.59 | 0.65 | 0.72 | 0.65 | 0.65 | – |
| Tiefseeschlamm | weich | griffig | traegt nicht | 1.3 | 1.3 | 1.3 | 1.3 | 1.3 | 1.11 | – |
| Totholz & Knochen | normal | normal | fest | 0.95 | 1.19 | 0.95 | 0.95 | 0.95 | 0.86 | brennt, splittert (1) |
| Traumgestein | hart | normal | fest | 0.75 | 0.75 | 0.75 | 0.83 | 0.75 | 0.75 | splittert (2) |
| Treibsand | weich | griffig | traegt nicht | 1.25 | 1.13 | 1.25 | 1.25 | 1.25 | 1.06 | – |
| Unterwasserfels | hart | normal | fest | 0.7 | 0.7 | 0.66 | 0.84 | 0.7 | 0.7 | – |
| Unterwassersand | weich | griffig | tief | 1.25 | 1.13 | 1.25 | 1.25 | 1.25 | 1.06 | – |
| Verdichteter Sand | normal | griffig | weich | 1 | 0.9 | 1 | 1 | 1 | 0.9 | – |
| Versteinerte Wurzeln | hart | normal | fest | 0.75 | 0.75 | 0.75 | 0.83 | 0.75 | 0.75 | splittert (1) |
| Versteinertes Holz | hart | normal | fest | 0.75 | 0.75 | 0.75 | 0.83 | 0.75 | 0.75 | splittert (1) |
| Wasser | weich | glatt | traegt nicht | 1.12 | 1.4 | 1.68 | 1.4 | 1.82 | 1.4 | – |
| Wasserader | weich | glatt | tief | 1.2 | 1.2 | 1.44 | 1.2 | 1.56 | 1.2 | – |
| Wolkenstein | weich | normal | fest | 1.15 | 1.15 | 1.15 | 1.15 | 1.15 | 1.03 | splittert (1) |
| Wurzeln | normal | normal | fest | 1 | 1.2 | 1 | 1 | 1 | 0.9 | brennt |
| Zeitkristall | hart | glatt | fest | 0.8 | 0.8 | 0.8 | 0.72 | 0.92 | 0.8 | splittert (4) |
