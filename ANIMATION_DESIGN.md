# ProjectArmageddon Animation Design Document

## Overview
This document outlines the animation system for ProjectArmageddon, a 2D artillery browser game with TS/ECS architecture. The game already has a solid foundation for animations including weapon effects, particle systems, and UI feedback.

## Existing Animation Systems

### Weapon Animations (`src/client/weaponAnimation.js`)
- **Muzzle Flash**: Directional cone that grows and fades when firing
- **Weapon Recoil**: Weapon moves backward when firing
- **Crosshair Pulse**: Pulsing aim assistance reticle
- **Blast Preview**: Pulsing radius indicator for area-of-effect weapons
- **Reload Progress**: Visual indicator for weapon reload status

### Particle & Effect Systems (`src/client/effects.js`)
- **Explosion Particles**: Deterministically distributed fragments
- **Beam Effects**: Instant-hit visualization (lasers, etc.)
- **Flash Effects**: Explosion/impact visualizations
- **Effect Aging System**: All effects automatically age and remove themselves

### Renderer Integration (`src/client/renderer.js`)
- All animations are drawn in the `render()` method
- Proper ordering: sky → world → particles → effects → UI
- Camera shake/recoil system
- Reduced motion support for accessibility

## Design Principles (Already Implemented)

1. **Separation of Logic and Rendering**: Animation state logic is separate from drawing code for testability
2. **Determinism**: No randomness in core animation logic (particles use index-based distribution)
3. **Accessibility**: Respects `prefers-reduced-motion` - removes motion but keeps essential information
4. **Proper Lifecycle Management**: Effects age and are automatically cleaned up
5. **Testability**: Pure functions that can be unit tested without canvas

## Recommended Animation Enhancements

### 1. Impact Animations
**Enhance the existing hit feedback system** in `gefuehl.js`:
- **Screen Shake**: Different intensities based on weapon caliber/damage
- **Impact Sparks**: Small particle bursts at impact points
- **Surface-Specific Effects**: Different particles for hitting metal, dirt, water, etc.
- **Critical Hit Indicators**: Special visual flair for critical hits

### 2. Weapon-Specific Muzzle Effects
**Extend `weaponAnimation.js`**:
- Different muzzle flash colors/sizes per weapon type
- Trail effects for slow-moving projectiles (mortar shells)
- Charging animations for charged weapons
- Overheat visuals for rapid-fire weapons

### 3. Environmental Reactions
**Add to particle systems**:
- **Dust Kicks**: When shells impact ground near tanks
- **Water Splashes**: For impacts in water
- **Smoke Trails**: For projectile flight paths
- **Debris**: Larger chunks from explosions that bounce/roll

### 4. UI Feedback Animations
**Enhance HUD elements**:
- **Weapon Selection Pulses**: Subtle pulse on selected weapon
- **Ammo Low Warnings**: Pulsing/flashing when ammo is low
- **Health Indicators**: Color pulses or screen tints when damaged
- **Kill Feed Animations**: Pop-up animations for kill notifications

### 5. State Transition Animations
**Smooth state changes**:
- **Turret Rotation**: Smooth interpolation instead of instant snapping
- **Camera Movements**: Eased camera movements when changing targets
- **Menu Transitions**: Fade/slide effects for UI menus
- **State Overlays**: Animated overlays for game states (paused, game over, etc.)

### 6. Special Weapon Effects
**For unique weapons**:
- **Laser Weapons**: Continuous beam with charging/discharging effects
- **Artillery Shells**: Trajectory prediction lines with timed effects
- **Mine Deployment**: Placement and arming animations
- **Shield Effects**: Visual indicators when shields are active

### 7. Performance Considerations
**Maintain the existing performance-conscious approach**:
- Limit particle counts per effect (already using MAX_PARTIKEL)
- Use object pooling where beneficial (consider for frequent effects)
- Keep animation calculations lightweight
- Ensure all animations respect reduced motion settings

### 8. Testing Strategy
**Follow existing patterns**:
- Add unit tests for new animation functions in `tests/` directory
- Test both normal and reduced motion modes
- Verify deterministic behavior where applicable
- Test edge cases (zero values, negative values, etc.)

## Implementation Guidelines

### When Adding New Animations:
1. **Logic First**: Implement the animation state logic in a pure function (like in `weaponAnimation.js` or `effects.js`)
2. **Testability**: Ensure the logic can be unit tested without requiring a canvas
3. **Renderer Integration**: Add drawing calls to the appropriate place in `renderer.js.render()`
4. **Ordering**: Consider visual layering (what should appear over/under what)
5. **Cleanup**: Ensure automatic removal when animation completes
6. **Accessibility**: Always implement reduced motion variants

### File Structure Recommendations:
- New weapon-specific animations: Extend `weaponAnimation.js`
- New particle/effect types: Extend `effects.js`
- Major new systems: Consider new files following the existing patterns
- UI animations: Consider enhancing `hud.js` or creating new UI-specific modules

## Example Implementation Pattern

For a new impact spark effect:

1. **In `effects.js`**:
   ```javascript
   export function erzeugeImpactFunken(x, y, kraft, { farbe = '#ffaa33' } = {}) {
     return {
       kind: 'impactSparks',
       x, y,
       kraft, // affects particle count/velocity
       farbe,
       life: 1,
       decay: 0.2 // lasts 5 frames
     };
   }
   ```

2. **In `renderer.js`**:
   - Add to effects array when impact occurs
   - Add drawing logic in `#drawEffects()` or new `#drawImpactFunken()` method
   - Ensure proper z-index (over terrain, under flashes?)

3. **In tests**:
   - Create `tests/impactSparks.test.js` following existing test patterns
   - Test particle generation, aging, and deterministic behavior

## Conclusion

ProjectArmageddon already has a robust, testable, and accessible animation foundation. The recommended enhancements focus on:
- Increasing visual feedback for gameplay events
- Adding weapon and environment specificity
- Maintaining the existing patterns of separation, determinism, and accessibility
- Keeping performance considerations in mind
- Ensuring all new animations are fully testable

The key is to build upon the existing strong foundation rather than reinventing systems, ensuring consistency with the game's architecture and design philosophy.