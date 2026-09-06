export const DAMAGE_ORDER = Object.freeze({
  FLAT_FIRST: 'flat-first',
  PERCENT_SECOND: 'percent-second'
});

export const WEAPON_TYPES = Object.freeze({
  HITSCAN: 'hitscan',
  PROJECTILE: 'projectile'
});

export function applyDamageModifiers(baseDamage, flatBonus = 0, percentBonus = 0) {
  const afterFlat = baseDamage + flatBonus;
  return afterFlat * (1 + percentBonus / 100);
}
