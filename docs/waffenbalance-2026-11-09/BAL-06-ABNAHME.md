# BAL-06 · Abnahme der Balancewerkzeuge

Stand: 2026-11-09, Branch `bg/bal-06`. Geändert wurden nur Messwerkzeuge und
Tests — keine Spielwerte, keine Assets.

## Was falsch war

`scripts/waffen-balance.mjs`, `scripts/balance-report.mjs` und
`scripts/balance-schaden.mjs` lasen `WEAPONS` direkt und starteten ihre Matches
ohne ausdrückliche Fassungen. Gemessen wurde damit der Grundkatalog mit den
Altklassen: `pa_127` hieß „Teleportplattform“, der F15-Schaden fehlte, und
`maxAmmo` galt als Munition, obwohl 110 Waffen seit Fassung 11 eine andere
Frischmunition haben. `tools/waffenbalance-audit.mjs` protokollierte nur die
angefragte, nicht die tatsächlich aufgebaute Distanz.

## Abnahme

```bash
npm run --silent balance:vertrag
```

```text
Waffenvertrag: Waffenfassung 16, Klassenfassung 3, Schaden 2, Wind 2, Bodenobjekte 5
Waffen: 150 (150 eindeutige IDs)
Klassenleben: nahkampf 130, fernkampf 100, okkultist 70
Frische Munition: 9 unbegrenzt, 73x3, 48x2, 20x1
```

- **150 aktuelle Namen/Werte:** jede Zeile trägt `werte` aus
  `getWaffe(id, WAFFEN_STANDARD)`; der Test vergleicht alle 150 vollständig.
- **Klassenleben 130/100/70:** aus `combatProfile` mit Klassenfassung 3.
- **Munition:** frische Munition aus dem Inventar (`PlayerInventory`), nicht
  `maxAmmo`. 9 unbegrenzt, 73 mit 3, 48 mit 2, 20 mit 1 Schuss.

### Alte Fassung separat

```bash
node scripts/waffen-balance.mjs --vertrag --waffen=1 --json
```

```text
Fassung 1 | pa_001 Baseballschläger 28 | pa_127 Teleportplattform 34
```

Der Standard zeigt dagegen `pa_001` mit 53 und `pa_127` als „Mine“ mit 0
Schaden (Mine). Die Fassung wird in jedem Match und für jede Waffe ausdrücklich
gesetzt; unbekannte Fassungen werden abgelehnt statt still auf den Standard zu
fallen.

### Angefragt und gemessen

```bash
node scripts/waffen-balance.mjs --nur=pa_001 --json
```

```text
angefragt: 40, 90, 150, 300, 500, 800, 1200, 1700
angefragt   40 -> gemessen   40
angefragt   90 -> gemessen   90
angefragt  150 -> gemessen  150
angefragt  300 -> gemessen  300
angefragt  500 -> gemessen  500
angefragt  800 -> gemessen  800
angefragt 1200 -> gemessen  850
angefragt 1700 -> gemessen  850
```

Jede angefragte Distanz bleibt als eigene Zeile erhalten. Verkürzt das Gelände
die Messung, stehen angefragter und gemessener Wert nebeneinander; eine
Distanz ohne freie Schusslinie bleibt mit `gemessen: null` und Grund sichtbar.

## Tests

```bash
node --test tests/waffenbalance-vertrag.test.js tests/balance-report.test.js
```

12 Tests grün, darunter: 150 Namen/Werte, Klassenleben, Munitionsverteilung,
Fassung 1 separat, acht sichtbare Distanzen. `npm run lint` bleibt sauber.
Der vollständige Lauf `npm test` auf diesem Branch: **2564/2564 grün, 0
übersprungen**.
