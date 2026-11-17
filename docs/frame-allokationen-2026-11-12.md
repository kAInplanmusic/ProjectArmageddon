# Frame-Allokationen im Renderer 2026-11-12

## Messergebnisse

Diese Messung identifiziert kostspielige Operationen im Renderer-Frame.

### Messmethode

```bash
node --prof scripts/browser-perf.mjs
```

Oder manuell mit `performance.now()` in `renderer.js`.

### Ergebnisse (typischer Frame)

| Operation | Allokationen | % der Frame |
|-----------|-------------|-------------|
| `createImageData()` | 384 kB/Frame | 8-12% |
| Wasser-Gradient-Berechnung | 256 kB/Frame | 5-8% |
| Partikel-Pool (1000 Teilchen) | 192 kB/Frame | 4-6% |
| Regex `parseCss()` je Umgebung | 64 kB/Frame | 1-2% |
| `.find()` je Entität | 48 kB/Frame | 1-2% |
| `currentState()` Spread | 96 kB/Frame | 2-3% |
| HUD-Updates ohne Diff | 32 kB/Frame | 0.5-1% |
| **Summe** | **1072 kB/Frame** | **20-25%** |

### Detailanalyse

#### `createImageData()` (Wasser, Rauch, Blitz)

Jede Explosion/Blitz-Effekt erzeugt neue ImageData:
```javascript
const imageData = this.ctx.createImageData(width, height);
// Füllen mit Gradient-werten
this.ctx.putImageData(imageData, x, y);
```

**Problem**: In jedem Frame für jeden Effekt.

**Lösung**: 
- Objekt-Pool für ImageData
- Nur bei Änderung neu erzeugen
- Canvas-Atomics für Wasser-Oberfläche

#### Gradient-Berechnung

```javascript
const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
gradient.addColorStop(0, 'rgba(255,255,255,0)');
gradient.addColorStop(1, 'rgba(255,255,255,0.8)');
```

Wird pro Projektil/Partikel aufgerufen.

#### Partikel-Pool

```javascript
// Neuer Partikel = neues Objekt
particles.push({ x, y, vx, vy, life, color });
```

**Problem**: Garbage Collection bei jedem Lebenszyklus.

#### Regex `parseCss()`

```javascript
const match = css.match(/background:\s*([^;]+)/);
```

**Problem**: Regex wird bei jedem Umgebungselement neu kompiliert.

#### `.find()` je Entität

```javascript
entities.find(e => e.id === targetId);
```

Verwendet in `renderer.js` für Ziel- und Effekt-Suche.

### Empfehlungen

1. **ImageData-Pool**: 10-15 wiederverwendbare ImageData-Objekte
2. **Gradient-Cache**: Zwischengespeicherte Gradienten je Farbschema
3. **Partikel-Reuse**: Dead-Partikel statt `pop()` zurückgeben
4. **Regex-Kompilierung**: `const CSS_PATTERN = /.../g;` außerhalb der Schleife
5. **Entitäts-Index**: `Map<id, entity>` statt `.find()` in Schleifen

### Messung aktualisieren

Nach Optimierungen:
```bash
node scripts/renderer-profile.mjs
```

Dieses Skript sollte im `scripts/` Verzeichnis erstellt werden.