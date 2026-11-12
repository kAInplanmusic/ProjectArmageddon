# Renderer-Testbarkeit 2026-11-12

## Problem

`src/client/renderer.js` ist in `node --test` nicht ladbar, weil es Vite-spezifische Importe verwendet:

```javascript
import { createEnvironment } from 'vite-plugin-environment/client';
```

Diese Importe funktionieren nur innerhalb von Vite, nicht in einem reinen Node-Test-Lauf.

## Lösung

Die reine Logik wurde bereits in separaten Modulen geparst:

### `src/client/rendererLogik.js`
- `kistenFarbe()` - Berechnet die Farbe einer Kiste basierend auf Rarity
- `kistenMarke()` - Bestimmt das Etikett/Label der Kiste

Diese Module sind **testbar**:

```javascript
import { kistenFarbe, kistenMarke } from '../src/client/rendererLogik.js';
```

### `tests/engine-a5.test.js`
Testet `rendererLogik.js` direkt:

```javascript
import { kistenFarbe, kistenMarke } from '../src/client/rendererLogik.js';

test('kistenFarbe gibt korrekte Farbe für rarity zurück', () => {
  assert.deepEqual(kistenFarbe('common'), [0.3, 0.3, 0.3]);
});
```

## Was nicht getestet werden kann (ohne Vite)

- Canvas-Operationen (2D Rendering Context)
- `createImageData`, `putImageData`
- Bildlade-Vorgänge (`Image` Objekte)
- `import.meta.glob` für dynamische Importe
- Vite-Plugin-Integrationen

## Empfehlung

Für kritische Rendering-Logik, die im Test benötigt wird, sollten:
1. Die Logik in **reine JS-Funktionen** ausgelagert werden (keine Browser-APIs)
2. Diese unter `src/client/renderer-core/` (ohne Vite-Deps) platzieren
3. Die Tests importieren diese Module direkt

## Status

- **ENG-12**: Teilweise erledigt. `rendererLogik.js` ist testbar, der Haupt-Renderer nicht.
- **Empfehlung**: Für zukünftige Entwicklung konsistente Trennung von testbarer Logik und Vite-spezifischem Code.