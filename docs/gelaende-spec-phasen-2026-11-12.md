# Gelaende-Spec Phasen 2026-11-12

**Erstellt:** 2026-11-12

Inventur der Gelände-Spezifikationsphasen (P1-P5) zur Erfassung des Fortschritts.

## P1: Materialoptik (WebGL2-Shader, Kachelmuster Autokorrelation, 3 Materialien)

- **Status:** ⏳ Ungeprüft
- **Beschreibung:** WebGL2-basierte Materialtexturen mit Autokorrelationsmustern für Boden, Wand, Deckung.
- **Check:** `npm run check:erreichbarkeit` für verschiedene Materialien
- **Erforderliche Tools:** `src/client/renderer/...`, `src/engine/materials.js`

## P2: Zoom/Kartenmaße/Flächenbudget

- **Status:** ✅ **Teilweise erledigt**
- **Beschreibung:** Kartenformate implementiert (kolossal: 5760×5760 = 33,18 Mio. Pixel).
- **Check:** `npm run check:map-scale` und `npm run check:erreichbarkeit`
- **Ergebnis:** `npm run check:docs` bestätigt 3.69 Mio. Pixel Matrix (2560×1440)

## P3: Zerstörbarkeit sichtbar

- **Status:** ⏳ Offen
- **Beschreibung:** Visuelle Unterscheidung zerstörbarer vs. unzerstörbare Oberflächen.
- **Erforderlich:** Visuelle Tests, Collision-Map-Anzeige

## P4: Stoffumwandlung

- **Status:** ⏳ Offen
- **Beschreibung:** Regeneration von Material durch Stoffe (z.B. Fels → Erde, Eis → Schnee).
- **Erforderlich:** `src/engine/stoffe/` System prüfen

## P5: Bewegung (Reibung je Stoff)

- **Status:** ✅ **Erledigt (W7)**
- **Beschreibung:** 
  - **Eis:** rutschig (Reibungskoeffizient reduziert)
  - **Sand:** bremst (Reibungskoeffizient erhöht)
- **Erforderliche Änderungen:** `src/engine/systems/bewegungSystem.js`
- **Ergebnis:** W7 bereits implementiert und getestet.

## Zusammenfassung

| Phase | Thema | Status | Beleg |
|-------|-------|--------|-------|
| P1 | Materialoptik (Shader) | ⏳ | Ungeprüft |
| P2 | Zoom/Kartenmaße/Flächenbudget | ✅ | `check:docs` grün |
| P3 | Zerstörbarkeit sichtbar | ⏳ | Offen |
| P4 | Stoffumwandlung | ⏳ | Offen |
| P5 | Bewegung (Reibung) | ✅ | W7 erledigt |