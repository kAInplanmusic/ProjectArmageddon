# Native Kulissenfassungen (1920 / 2560 / 3840)

Hier liegen die nativen Großfassungen, sobald sie produziert sind. Bis dahin ist
der Ordner leer; der Client fällt auf die Basisdateien unter
`../backdrops/` zurück.

## Namensschema

```
<biom>_<variante>-<breite>.webp
maritime_calm_day-2560.webp
forest_deep_green-3840.webp
```

Die 1280er Fassung ist die vorhandene Basisdatei ohne Breitenzusatz. Kein Bild
wird aus einer kleineren Datei hochskaliert und als 3840er Fassung abgelegt —
Abnahmekriterien in `docs/DesignRest/kulissen-4k.md`, Abschnitt A17.

## Format

- 3840 × 2160, Seitenverhältnis 16:9, sRGB
- WebP q82–88 oder AVIF, Ziel 0,5–2 MB je Bild
- Horizont bei 47–53 % der Höhe (das Terrain deckt die untere Hälfte)
- keine Schrift, kein Wasserzeichen, keine UI
