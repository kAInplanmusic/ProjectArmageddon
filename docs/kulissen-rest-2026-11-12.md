# Kulissen-Rest 2026-11-12

**Erstellt:** 2026-11-12

## Wasser

### foam_lines / oil_slick

- **Status:** ⏳ Offen
- **Beschreibung:** Neue Wasser-Optiken für Schaumkappen (foam_lines) und Öl-Schlick (oil_slick).
- **Erwartung:** Diese Wasserarten benötigen Anpassungen in `config/scenery.js`.
- **Implementierung:** Noch nicht vorhanden. Aktuelle Wasser-Optiken: `waves`, `ripples`, `crust`, `bubbles`, `grain`, `stars`.

### Neue Wasserarten

| Wasser-ID | Status |
|-----------|--------|
| frozen_lake | ✅ Implementiert |
| tar_pit | ✅ Implementiert |
| meltwater | ✅ Implementiert |
| foam_lines | ⏳ Offen |
| oil_slick | ⏳ Offen |

## Dynamische Himmelsfarbe

- **aurora / plasma_storm / toxic_noon**
- **Status:** ⏳ Offen
- **Beschreibung:** Die drei Himmelsarten `aurora`, `plasma_storm` und `toxic_noon` sind definiert, aber die dynamische Farbgenerierung fehlt eventuell.
- **Prüfung nötig:** `src/server/` und `src/client/` prüfen, ob die Himmels-Komposition dynamisch ist.

## Comic-Filter 15 Foto-Texturen (N-32)

- **Status:** ✅ **Erledigt** (siehe Kenney CC0/OGA in Recherche-Stand)
- **Quelle:** Kenney Asset-Kit, CC0-lizenzierte Foto-Texturen
- **Verfügbarkeit:** 15 Texturen für Comic-Filter verfügbar

## Stil Foto-Kulissen (Western/Hyperreal)

- **Western**
  - **Status:** ⏳ Offen
  - **Beschreibung:** Foto-basierte Kulissen im Western-Stil

- **Hyperreal**
  - **Status:** ⏳ Offen
  - **Beschreibung:** Foto-basierte Kulissen im Hyperrealismus-Stil

## Fazit

| Aufgabe | Status | Beleg |
|---------|--------|-------|
| Wasser `foam_lines`/`oil_slick` | ⏳ | Benötigt `config/scenery.js` Anpassung |
| Dynamische Himmelsfarbe | ⏳ | Nicht implementiert |
| Comic-Filter 15 Texturen | ✅ | Kenney CC0/OGA nutzbar |
| Western Stil | ⏳ | Offen |
| Hyperreal Stil | ⏳ | Offen |