export function computeLinearDragPosition({
  x0 = 0,
  y0 = 0,
  vx0 = 0,
  vy0 = 0,
  dragCoefficient = 0,
  mass = 1,
  gravity = 9.81,
  timeSeconds = 0
}) {
  const k = mass === 0 ? 0 : dragCoefficient / mass;

  if (k <= 0) {
    return {
      x: x0 + vx0 * timeSeconds,
      y: y0 + vy0 * timeSeconds - 0.5 * gravity * timeSeconds * timeSeconds
    };
  }

  const exp = Math.exp(-k * timeSeconds);
  const x = x0 + (vx0 / k) * (1 - exp);
  const y = y0 + ((vy0 + gravity / k) / k) * (1 - exp) - (gravity * timeSeconds) / k;

  return { x, y };
}
