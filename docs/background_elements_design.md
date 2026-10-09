# Background Elements Design — Project Armageddon

## Existing System

Project Armageddon uses two parallel background systems:

1. **Static Backdrops** (`src/shared/config/backdrops.js`, 60 images, 12 biomes ×5 variants)
   - Image based, loaded via `import.meta.glob`
   - Deterministic pick via seed
   - Per-backdrop terrain palette

2. **Generative Scenery** (`src/shared/config/scenery.js`, `src/client/sceneryPainter.js`)
   - Purely code-generated, seed deterministic
   - Components: Sky, Celestial, Water, Ambient elements, Landmarks, Ground variants
   - Renders sky gradient, celestial body, ambient elements, landmarks silhouette, water surface overlay

Renderer integration:
- `Renderer.setScenery()` → generative overrides backdrop
- `Renderer.setBackdrop()` → image backdrop
- Drawing order: Sky → Terrain → Water → Narben → Landmarks → Entities etc.
- `sceneryPainter.drawSky`, `drawAmbient`, `drawLandmarks`, `drawWaterSurface`

## Design Goals

- Keep netcode safe: all values numeric/IDs
- Keep performance: canvas 2D only, no external assets
- Keep determinism: seed → same scenery
- Maintain visual consistency with terrain: horizon low at ~47% (`TERRAIN_COVERAGE`)

## Proposed New Background Elements

### 1. Volumetric Fog Sheets
Add a new ambient kind `fog_sheets` that draws layered soft ellipses moving vertically slower than ground. Useful for `warren`, `caverns`, `deluge`.

Implementation notes:
- Add to `AMBIENT_KINDS` with `count: [2,4]`, `scale: [1.8,3]`, `drift: 0.005`
- In `sceneryPainter.zeichneElement`, handle `case 'fog_sheets':` with radial gradient, alpha 0.15-0.35, y-offset modulated by `zeit * 0.003`

### 2. Distant Light Pillars
For `cosmos`, `abstract`, `fantasy` biomes: vertical light shafts from ground to horizon.
- Ambient kind `light_pillars`
- Draw as thin translucent rectangles with gradient, slight flicker `Math.sin(zeit*0.01+phase)`
- Add to biome ambient lists

### 3. Parallax Mountain Layers
Landmarks currently one silhouette. Add second distant layer with lower opacity and parallax shift based on `zeit`.
- New landmark kind `distant_range`
- Draw in `zeichneLandmarke` with smaller scale *0.6, alpha 0.45, x-offset = sin(zeit*0.002)*breite*0.02

### 4. Water Surface Variants
Extend `WATER_KINDS.surface` with:
- `foam_lines` – white caps on waves, stronger in storm
- `oil_slick` – rainbow sheen for `urban`, `deluge` scenes
Implement in `drawWaterSurface` with new case.

### 5. Dynamic Sky Color Shift
For `aurora`, `plasma_storm`, `toxic_noon`: add subtle hue oscillation over time.
- Modify `drawSky` to lerp between `stufen` colors with `zeit * 0.0005` offset
- Keep within same palette, no netcode impact

## Example Implementation Sketch

Add to `src/shared/config/scenery.js`:

```js
// AMBIENT_KINDS extension
fog_sheets: { count: [2,4], scale: [1.8,3], alpha: 0.28, drift: 0.005, band: [0.55,0.9] },
light_pillars: { count: [3,6], scale: [0.4,0.9], alpha: 0.22, drift: 0.008, band: [0.25,0.7] },
```

Add to `sceneryPainter.js` in `zeichneElement`:
```js
case 'fog_sheets': {
  const ry = hoehe * 0.45 + bewegung * hoehe * 0.02;
  const r = skala * Math.min(breite, hoehe) * 0.28;
  const verlauf = ctx.createRadialGradient(x, ry, 0, x, ry, r);
  verlauf.addColorStop(0, `rgba(220,230,240,${0.18*skala})`);
  verlauf.addColorStop(1, 'rgba(220,230,240,0)');
  ctx.fillStyle = verlauf;
  ctx.beginPath(); ctx.ellipse(x, ry, r, r*0.6, 0,0,Math.PI*2); ctx.fill();
  break;
}
case 'light_pillars': {
  ctx.fillStyle = `rgba(255,240,210,${0.12*skala})`;
  ctx.globalAlpha = 0.18 * (0.5+0.5*Math.sin(zeit*0.01+phase));
  ctx.fillRect(x - breite*0.015*skala, 0, breite*0.03*skala, hoehe*0.8);
  ctx.globalAlpha = 1;
  break;
}
```

Update biome ambient lists:
- `warren.ambient` add `fog_sheets`
- `cosmos.ambient` add `light_pillars`
- `deluge.ambient` add `fog_sheets`

## Asset Impact

- No new images required
- No netcode changes – all deterministic from seed
- Performance: +2 draw calls per frame max, negligible

## Testing

- Add visual test in `tests/scenery.test.js` checking that new ambient kinds are present in at least one biome
- Verify reduced-motion: `fog_sheets` drift should be disabled when `prefers-reduced-motion` is true – handled via existing `imVordergrund` flag

## Next Steps

1. Implement ambient kinds and painter cases
2. Add biome ambient assignments
3. Run `npm test` and visual smoke
4. Document in README under Kulissen

Design complete, ready for implementation.
