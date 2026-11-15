# Gegenprüfung – Audit 2026-10-09

## §6: Gegenprüfung durch fremde Modelle

### Ziel
Validierung der Engine/Physik/Terrain-Berechnungen durch unabhängige Modelle.

### Status: Offen

#### Zu prüfende Bereiche
1. **ballistics.js** – Projektile, Reichweiten, Wind-Berechnung
2. **shooting.js** – Schuss-Logik, Treffererkennung
3. **characterSystem.js** – Fallphysik, Bewegung
4. **prng.js** – Deterministischer Zufall
5. **network.js** – Latenz-Kompensation
6. **persistence.js** – Speicher/Load-Konsistenz

#### Vorgehen
- Fremdmodelle (Claude, GPT, Gemini) erhalten identische Prompts
- Ergebnisse werden mit Referenz-Implementierung verglichen
- Abweichungen > 1% werden dokumentiert und behoben
- Nur verifizierte Befunde werden übernommen

#### Prompt-Varianten
| Variante | Fokus |
|----------|-------|
| A | Numerische Genauigkeit (Float-Vergleich) |
| B | Edge-Cases (Null-Werte, Extreme) |
| C | Determinismus (gleiche Seeds → gleiche Ergebnisse) |
| D | Performance (Iterationen/ms) |

#### Bisherige Ergebnisse
- **Ballistics**: Abweichung 1624 px in `gegenprobeBahn` identifiziert → Werkzeugfehler, nicht Waffenfassung (behoben)
- **Engine/Physik/Terrain**: Bericht des abgebrochenen Laufs verloren → **muss neu durchgeführt werden**

## Verknüpfungen
- TODO.md QA-4
- 00-claude-rest §4/§6
- docs/balance-rollen-2026-11-12.md (Gegenprobe Bahn)