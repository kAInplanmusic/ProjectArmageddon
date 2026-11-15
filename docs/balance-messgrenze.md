# Messleiter-Spezifikation (BAL-17)

## Distanz-Schwellen (6 Stufen)

| Stufe | Distanz (px) | Bezeichnung | Einsatz |
|-------|--------------|-------------|---------|
| 0 | 40 | **Nahbereich** | Melee, Nahkampf-Waffen |
| 1 | 100 | **Kurz** | Pistolen, Schrotflinten |
| 2 | 200 | **Mittel** | Gewehre, mittlere Projektile |
| 3 | 350 | **Lang** | Scharfschützen, Artillerie |
| 4 | 500 | **Sehr Lang** | Extrem-Reichweiten-Waffen |
| 5 | 650 | **Extrem** | Kartenübergreifend, Spezial |

## Abdeckungsstaffelung

Jede Waffe erhält ein **Profil** (nah/kurz/mittel/lang/sehr-lang/extrem). Die Reichweite wird im HUD als `Reichweite X px (bei neutralem Profil ~0,37)` angezeigt (Faktor 0,37 aus BAL-1).

## Mess-Protokoll

1. Waffe im Waffenmenü auswählen
2. Schuss auf Ziel bei Distanz D abfeuern
3. Treffer/Kein-Treffer protokollieren
4. Bei 3/3 Treffern → Distanz erhöhen
5. Bei 0/3 Treffern → Distanz verringern
6. Effektive Reichweite = letzte Distanz mit ≥2/3 Treffern

## Browser-/Touch-Freigabe (BAL-15)

- Desktop Chrome: ✅ getestet (150 Waffen)
- Mobile Touch: ⏳ ausstehend
- Firefox/Safari: ⏳ ausstehend

## CI-Integration

E2E-Tests validieren Messleiter automatisch via `tests/e2e/balance-messleiter.spec.mjs` (zu erstellen).