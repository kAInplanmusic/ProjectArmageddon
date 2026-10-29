/**
 * Die Wirkung einer Explosion: Krater, Wasserverdrängung, Schaden mit Abfall und Rückstoß.
 *
 * Bis 2026-10-29 stand dieser Block als Teil von `ProjectileSystem#explode`. Minen (`systems/bodenobjektSystem.js`)
 * explodieren ohne Geschoss und brauchen dieselbe Wirkung; ein zweiter Rechenweg wäre die Falle, die AGENTS.md
 * „eine Regel, eine Stelle" nennt. Der Block ist deshalb ZEICHENGLEICH hierher gezogen (Reihenfolge der Schritte,
 * Rundung, Dienstaufrufe); `ProjectileSystem#explode` ruft ihn mit den Werten des Geschosses auf. Beleg: die
 * Goldwert-Tests (Zustandshashes, Krater-Läufe) bleiben unverändert grün.
 *
 * Nicht Teil davon (bleibt beim Geschoss): der gerichtete Stoß des Direkttreffers, das Ereignis `explosion`
 * und das Entfernen der Entität.
 *
 * @module explosion
 */
import { COMPONENT_SIGNATURES } from './ecs/world.js';
import { kraterTiefeProzent } from '../shared/config/zerstoerung.js';
import { klassifiziereEinschlag } from '../shared/einschlag.js';

/**
 * @param {object} world
 * @param {object} p
 * @param {number} p.x
 * @param {number} p.y
 * @param {number} p.damage - Schaden in der Mitte
 * @param {number} p.blastRadius - 0 = nur Direkttreffer (`hitTarget`)
 * @param {number} p.knockback
 * @param {number} p.terrainDamage - Kraterradius; 0 = aus dem Wirkradius abgeleitet
 * @param {number} p.owner - Entity des Verursachers (für Selbstschaden-Grenze und Zurechnung)
 * @param {number|null} p.damageType - Schadensart als Zahl
 * @param {number} p.weaponId - Waffenkennung als Zahl (Zerstörungscharakter ab Fassung 4)
 * @param {number|null} [p.hitTarget] - Direkttreffer einer Waffe ohne Flächenwirkung
 * @returns {string|null} Untergrund des Einschlags (für das Ereignis `explosion`)
 */
export function wendeExplosionAn(world, p) {
  const { x, y, damage, blastRadius, knockback, terrainDamage, owner, damageType, weaponId, hitTarget = null } = p;
  const services = world.services ?? {};
  // Bodenobjekte (Minen, Fässer) in Reichweite lösen mit aus (nur mit Bodenobjektfassung; sonst gibt es den Dienst nicht).
  services.bodenobjekte?.explosionBei(x, y, blastRadius > 0 ? blastRadius : Math.max(terrainDamage, 12));
  const events = services.events ?? null;
  const match = services.match ?? { knockbackMultiplier: 1 };
  const terrain = services.terrain ?? null;

  // Untergrund des Einschlags — VOR Krater und Wasserverdrängung gemessen (shared/einschlag.js).
  const material = klassifiziereEinschlag(terrain, services.water ?? null, x, y, { biomId: match.biomId });

  // Krater: expliziter Terrain-Schaden hat Vorrang, sonst leitet sich der
  // Radius aus der Flaechenwirkung ab. Reine Direktschusswaffen graben nur
  // ein minimales Loch, damit Einschlaege sichtbar bleiben.
  const craterRadius = terrainDamage > 0
    ? terrainDamage
    : blastRadius > 0 ? blastRadius * 0.6 : 4;

  if (terrain && craterRadius > 0) {
    const radius = Math.max(2, Math.round(craterRadius));
    const zerstoerung = services.zerstoerung ?? null;
    if (zerstoerung) {
      // Zerstörungsfassung 2: raue Form, Tiefe nach Waffe, Nachrutschen (engine/zerstoerung.js).
      // Ab Fassung 4 reist die Waffe mit: Ihr Zerstörungscharakter (Durchschlag, Streuung, Beben, Brand) wirkt am Einschlag.
      zerstoerung.krater(x, y, radius, kraterTiefeProzent(terrainDamage, blastRadius, radius), weaponId);
    } else {
      terrain.punchCrater(x, y, radius);
      if (events) events.emit('terrain_destroyed', { x, y, radius });
    }
  }

  // Wasser verdrängen: Explosionen drücken das Wasser im Radius nach außen.
  const water = services.water ?? null;
  if (water && typeof water.displace === 'function' && craterRadius > 0) {
    water.displace(x, y, craterRadius, 0.65);
  }

  if (damage > 0 && blastRadius <= 0 && hitTarget !== null && world.isActive(hitTarget)) {
    // Waffe ohne Flaechenwirkung: voller Schaden nur auf das getroffene Ziel.
    world.getSystem('damage')?.applyDamage(world, hitTarget, damage, owner, { damageType });
  }

  if (blastRadius > 0 && damage > 0) {
    const victimIds = world.getEntitiesBySignature(
      COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH,
    );
    for (const victimId of victimIds) {
      if (!world.isActive(victimId)) continue;
      const vx = world.getComponent(victimId, 'Position', 'x') || 0;
      const vy = world.getComponent(victimId, 'Position', 'y') || 0;
      const dx = vx - x;
      const dy = vy - y;
      const dist = Math.hypot(dx, dy);
      if (dist > blastRadius) continue;

      const falloff = Math.max(0.25, 1 - dist / blastRadius);
      let applied = damage * falloff;
      // Waffenfassung 5: ein eigener Schuss nimmt dem Schützen höchstens `selbstschadenGrenze` seiner Höchstgesundheit.
      const grenze = match.selbstschadenGrenze || 0;
      if (grenze > 0 && victimId === owner) {
        applied = Math.min(applied, (world.getComponent(victimId, 'Health', 'max') || 0) * grenze);
      }
      const damageSystem = world.getSystem('damage');
      if (damageSystem) {
        damageSystem.applyDamage(world, victimId, applied, owner, { damageType });
      }

      if (knockback > 0 && dist > 0.0001) {
        const impulse = knockback * falloff * (match.knockbackMultiplier || 1) * 0.02;
        const currentVx = world.getComponent(victimId, 'Velocity', 'x') || 0;
        const currentVy = world.getComponent(victimId, 'Velocity', 'y') || 0;
        world.setComponent(victimId, 'Velocity', 'x', currentVx + (dx / dist) * impulse);
        world.setComponent(victimId, 'Velocity', 'y', currentVy + (dy / dist) * impulse);
      }
    }
  }

  return material;
}
