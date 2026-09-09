/**
 * Ballistik-Berechnungen für ProjectArmageddon.
 *
 * Enthält physisch-accurate Ballistik und Hilfsfunktionen für
 * die Trajektorienberechnung von Projektilen.
 *
 * @module ballistics
 */

/**
 * Berechnet die endgültige Position eines Projektils mit linearem Drag.
 *
 * Verwendet iteratives Euler-Integration für deterministische Ergebnisse.
 *
 * @param {object} params
 * @param {number} params.startX - Start-X-Position
 * @param {number} params.startY - Start-Y-Position
 * @param {number} params.velocityX - Initial-Geschwindigkeit X
 * @param {number} params.velocityY - Initial-Geschwindigkeit Y
 * @param {number} params.drag - Drag-Koeffizient (0.95 = 5% Pro Schritt)
 * @param {number} params.gravity - Gravitation pro Schritt
 * @param {number} params.maxSteps - Maximale Iterationsschritte
 * @param {function} [onStep] - Callback für CCD: (x, y) => boolean (true = hit)
 * @returns {{x: number, y: number, steps: number, hit: boolean|null}}
 */
export function computeTrajectory(params) {
  const {
    startX = 0,
    startY = 0,
    velocityX = 0,
    velocityY = 0,
    drag = 0.98,
    gravity = 0.5,
    maxSteps = 1000,
    onStep = null
  } = params;

  let x = startX;
  let y = startY;
  let vx = velocityX;
  let vy = velocityY;
  let steps = 0;
  let hit = null;

  for (steps = 0; steps < maxSteps; steps++) {
    // Gravity anwenden
    vy += gravity;

    // Drag anwenden
    vx *= drag;
    vy *= drag;

    // Position aktualisieren
    x += vx;
    y += vy;

    // CCD-Callback prüfen
    if (onStep) {
      const result = onStep(x, y, vx, vy);
      if (result === true) {
        hit = { x, y, step: steps };
        break;
      }
    }

    // Wenn Y unter 0 fällt (boden), stoppen
    if (y < 0) {
      hit = { x, y: 0, step: steps };
      break;
    }
  }

  return {
    x,
    y: Math.max(y, 0),
    steps,
    hit
  };
}

/**
 * Berechnet die optimale Schusswinkel für ein gegebenes Ziel.
 * Verwendet binäre Suche oder geschlossene Formel.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} targetX
 * @param {number} targetY
 * @param {number} power
 * @param {number} gravity
 * @returns {{angle: number, valid: boolean}}
 */
export function computeAimAngle(startX, startY, targetX, targetY, power, gravity = 0.5) {
  const dx = targetX - startX;
  const dy = targetY - startY;

  // Geschlossene Lösung für Ballistik ohne Drag
  // y = x * tan(θ) - (g * x²) / (2 * v² * cos²(θ))
  // Dies vereinfacht: v² = power², g = gravity

  const v2 = power * power;
  const discriminant = v2 * v2 - gravity * (gravity * dx * dx + 2 * dy * v2);

  if (discriminant < 0) {
    return { angle: 0, valid: false };
  }

  const angle1 = Math.atan2(v2 + Math.sqrt(discriminant), gravity * dx);
  const angle2 = Math.atan2(v2 - Math.sqrt(discriminant), gravity * dx);

  // Wähl die höhere Trajektorie (meistens besser für Artillerie)
  return { angle: angle1, valid: true };
}

/**
 * CCD-Raycast: Prüft Kollision entlang einer Trajektorie.
 *
 * @param {object} params - Trajektorie-Parameter (siehe computeTrajectory)
 * @param {function} isSolid - (x, y) => boolean
 * @returns {{hitX: number, hitY: number, hit: boolean}}
 */
export function ccdRaycast(params, isSolid) {
  const result = computeTrajectory({
    ...params,
    onStep: (x, y) => {
      return isSolid(x, y);
    }
  });

  if (result.hit) {
    return {
      hitX: result.hit.x,
      hitY: result.hit.y,
      hit: true
    };
  }

  return {
    hitX: result.x,
    hitY: result.y,
    hit: false
  };
}
