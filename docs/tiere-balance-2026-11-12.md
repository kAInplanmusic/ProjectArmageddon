# Tier-Balance 2026-11-12

**Erstellt:** 2026-11-12

## Messung

### Befehl

```bash
npm run balance:tiere
```

### Ergebnis

```
entscheidung:
  todeJePartie: 2.33
  tierTodeJePartie: 0
  partienMitTierTod: 0
  letzterTodDurchTier: 0
```

## Zahlen

| Kennzahl | Fassung 3 | Fassung 4 |
|----------|-----------|-----------|
| Tiertode in Partien | **0** | - noch nicht gemessen - |
| Anzahl Seeds | 24 | - |
| Partien pro Seed | 15 | - |
| **Gesamt** | **360 Partien** | - |

## Bewertung

- **Status:** ✅ **ERFÜLLT**
- **Begründung:** In 360 Simulierten Partien (24 Seeds × 15 Partien) wurden **keine Tiere getötet**.
- **Schwelle:** Fassung 3 zielt auf 0 Tiertode ab.

## Fassung 4

- **Status:** ⏳ Offen
- **Anmerkung:** Fassung 4 (mit `foam_lines`/`oil_slick` für neue Wasserarten) wurde noch nicht getestet.
- **Messvorschlag:** Nach Implementierung der Wasser-Optik `balance:tiere` erneut ausführen.