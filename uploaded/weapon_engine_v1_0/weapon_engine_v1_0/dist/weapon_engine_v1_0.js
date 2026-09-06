"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeaponEngine = void 0;
exports.validateDatabase = validateDatabase;
const EPS = 1e-8;
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a); return l < EPS ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l }; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const dot = (a, b) => a.x * b.x + a.y * b.y;
function rotate(v, r) { return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) }; }
function turnToward(v, target, maxRadians) { const a = Math.atan2(v.y, v.x), b = Math.atan2(target.y, target.x); let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return norm(rotate(v, clamp(d, -maxRadians, maxRadians))); }
const SPECIAL_STATUS = {
    burn: w => ({ id: 'burn', magnitude: Math.max(1, w.stats.fireDamage || 8), duration: 3.5, sourceWeaponId: w.id, stacks: 1 }),
    freeze: w => ({ id: 'freeze', magnitude: 1, duration: 1.5, sourceWeaponId: w.id }),
    stun: w => ({ id: 'stun', magnitude: 1, duration: 1.25, sourceWeaponId: w.id }),
    sleep: w => ({ id: 'sleep', magnitude: 1, duration: 2.5, sourceWeaponId: w.id }),
    poison_cloud: w => ({ id: 'poison', magnitude: Math.max(1, w.stats.poisonDamage || 8), duration: 5, sourceWeaponId: w.id }),
    poison_zone: w => ({ id: 'poison', magnitude: Math.max(1, w.stats.poisonDamage || 8), duration: 5, sourceWeaponId: w.id }),
    acid_dot: w => ({ id: 'acid', magnitude: Math.max(1, w.stats.poisonDamage || 10), duration: 4, sourceWeaponId: w.id }),
    world_poison: w => ({ id: 'poison', magnitude: 14, duration: 7, sourceWeaponId: w.id }),
    shield_freeze: w => ({ id: 'freeze_aura', magnitude: 1, duration: 2, sourceWeaponId: w.id }),
    curse: w => ({ id: 'curse', magnitude: 1, duration: 5, sourceWeaponId: w.id }),
    corruption: w => ({ id: 'corruption', magnitude: 1, duration: 6, sourceWeaponId: w.id }),
    mind_pull: w => ({ id: 'disorient', magnitude: 1, duration: 2, sourceWeaponId: w.id }),
};
class WeaponEngine {
    db;
    projectiles = new Map();
    cooldowns = new Map();
    ammo = new Map();
    seq = 0;
    constructor(database) {
        this.db = new Map(database.weapons.map(w => [w.id, this.normalize(w)]));
    }
    normalize(w) {
        const s = w.stats || {};
        const pick = (snake, camel, def = 0) => s[snake] !== undefined && s[snake] !== null ? s[snake] : (s[camel] ?? def);
        const n = { ...w, stats: { ...s,
                baseDamage: pick('base_damage', 'baseDamage'), blastRadius: pick('blast_radius', 'blastRadius'),
                terrainDamage: pick('terrain_damage', 'terrainDamage'), fireDamage: pick('fire_damage', 'fireDamage'),
                iceDamage: pick('ice_damage', 'iceDamage'), poisonDamage: pick('poison_damage', 'poisonDamage'),
                special: s.special ?? w.mechanic?.specialEffect ?? 'direct_hit',
                damage_type: s.damage_type ?? 'physical'
            } };
        return n;
    }
    getWeapon(id) { const w = this.db.get(id); if (!w)
        throw new Error(`Unknown weapon: ${id}`); return w; }
    setAmmo(entityId, weaponId, value) { this.ammo.set(`${entityId}:${weaponId}`, Math.max(0, value)); }
    getAmmo(entityId, weaponId) { return this.ammo.get(`${entityId}:${weaponId}`) ?? this.getWeapon(weaponId).balance.maxAmmo; }
    canFire(entityId, weaponId) { return (this.cooldowns.get(`${entityId}:${weaponId}`) ?? 0) <= 0 && this.getAmmo(entityId, weaponId) > 0; }
    fire(world, entityId, weaponId, origin, direction, now = 0) {
        const w = this.getWeapon(weaponId);
        if (!this.canFire(entityId, weaponId))
            return [];
        const key = `${entityId}:${weaponId}`;
        this.ammo.set(key, this.getAmmo(entityId, weaponId) - 1);
        this.cooldowns.set(key, w.balance.cooldown || 0);
        const events = [];
        const dir = norm(direction);
        const sp = w.stats.special || 'direct_hit';
        if (w.stats.projectileSpeed <= 0) {
            this.resolveImpact(world, w, entityId, origin, origin, dir, events);
            this.specialOnFire(world, w, entityId, origin, dir, events);
            return events;
        }
        const kind = sp === 'returning_projectile' ? 'boomerang' : sp === 'rocket' ? 'rocket' : sp.includes('drill') ? 'drill' : sp === 'sticky' ? 'sticky' : w.stats.homing > 0 ? 'guided' : 'standard';
        const p = { id: `p_${++this.seq}`, weaponId, ownerId: entityId, position: { ...origin }, velocity: mul(dir, w.stats.projectileSpeed), radius: 4, age: 0, alive: true, bouncesLeft: w.stats.bounces, piercesLeft: w.stats.piercing, kind, payload: { origin, direction: dir } };
        this.projectiles.set(p.id, p);
        events.push({ type: 'projectile_spawned', projectile: { ...p } });
        this.specialOnFire(world, w, entityId, origin, dir, events);
        return events;
    }
    update(world, dt) {
        const out = [];
        for (const [key, v] of this.cooldowns)
            this.cooldowns.set(key, Math.max(0, v - dt));
        for (const [id, p] of [...this.projectiles]) {
            if (!p.alive) {
                this.projectiles.delete(id);
                continue;
            }
            const w = this.getWeapon(p.weaponId);
            p.age += dt;
            if (w.stats.fuseTime > 0 && p.age >= w.stats.fuseTime) {
                this.explode(world, w, p.ownerId, p.position, out);
                this.kill(p, 'fuse', out);
                continue;
            }
            if (p.kind === 'boomerang' && p.age > 0.35) {
                const back = norm(sub(p.payload.origin, p.position));
                p.velocity = mul(back, w.stats.projectileSpeed);
            }
            if (w.stats.homing > 0) {
                const target = this.findHomingTarget(world, p, w.stats.homing);
                if (target) {
                    const desired = norm(sub(target.position, p.position));
                    const turned = turnToward(p.velocity, desired, (w.stats.homing / 100) * 8 * dt);
                    p.velocity = mul(turned, len(p.velocity));
                }
            }
            if (w.stats.gravity > 0) {
                p.velocity.y += world.gravity * (w.stats.gravity / 100) * dt;
            }
            const next = add(p.position, mul(p.velocity, dt));
            const hit = world.raycastTerrain(p.position, next);
            if (hit) {
                p.position = hit.point;
                const special = w.stats.special || 'direct_hit';
                if (w.stats.blastRadius === 0 && (p.kind === 'drill' || w.stats.terrainDamage > 0))
                    this.damageTerrain(world, w, p.position, out);
                if (w.stats.blastRadius > 0 || ['rocket', 'mortar', 'artillery', 'meteor_impact', 'launcher', 'hell_cannon', 'quantum_ultimate', 'cosmic_ultimate'].includes(special))
                    this.explode(world, w, p.ownerId, p.position, out);
                if (p.bouncesLeft > 0) {
                    p.bouncesLeft--;
                    p.velocity = mul(sub(p.velocity, mul(hit.normal, 2 * dot(p.velocity, hit.normal))), 0.78);
                    p.position = add(p.position, mul(hit.normal, 2));
                    continue;
                }
                if (p.kind === 'boomerang' && len(sub(p.payload.origin, p.position)) > 12) {
                    continue;
                }
                this.kill(p, 'terrain', out);
                continue;
            }
            p.position = next;
            const targets = world.getEntities().filter(e => e.alive && e.id !== p.ownerId && len(sub(e.position, p.position)) <= e.radius + p.radius);
            if (targets.length) {
                for (const t of targets) {
                    this.resolveImpact(world, w, p.ownerId, p.position, t.position, norm(p.velocity), out, t.id);
                    if (p.piercesLeft > 0)
                        p.piercesLeft--;
                    else {
                        this.kill(p, 'entity', out);
                        break;
                    }
                }
            }
            if (p.kind === 'boomerang' && p.age > 0.5 && len(sub(p.payload.origin, p.position)) < 16) {
                this.kill(p, 'return', out);
            }
            if (p.age > 30) {
                this.kill(p, 'timeout', out);
            }
        }
        return out;
    }
    findHomingTarget(world, p, strength) { const candidates = world.getEntities().filter(e => e.alive && e.id !== p.ownerId); let best; let bd = Infinity; for (const e of candidates) {
        const d = len(sub(e.position, p.position));
        if (d < bd && d < 600) {
            bd = d;
            best = e;
        }
    } return best; }
    resolveImpact(world, w, ownerId, impact, entityPos, dir, out, targetId) {
        const special = w.stats.special || 'direct_hit';
        if (targetId) {
            let dmg = w.stats.baseDamage;
            if (special === 'precision')
                dmg *= 1.5;
            if (special === 'heavy_impact')
                dmg *= 1.15;
            world.applyEntityDamage(targetId, { amount: dmg, type: w.stats.damage_type || 'physical', sourceWeaponId: w.id, sourceEntityId: ownerId, critical: special === 'precision' });
            this.applyKnockback(world, w, targetId, dir);
            const st = SPECIAL_STATUS[special]?.(w);
            if (st) {
                world.addStatus(targetId, st);
                out.push({ type: 'status', entityId: targetId, status: st });
            }
            if (special === 'hook_pull' || special === 'mind_pull')
                world.applyImpulse(targetId, mul(norm(sub(impact, entityPos)), w.stats.knockback / 6));
            if (special === 'linked_damage')
                world.emit({ type: 'special', effect: special, position: entityPos, weaponId: w.id, data: { ownerId, targetId } });
        }
        if (w.stats.blastRadius > 0)
            this.explode(world, w, ownerId, impact, out);
        else if (w.stats.terrainDamage > 0)
            this.damageTerrain(world, w, impact, out);
        this.specialOnImpact(world, w, ownerId, impact, dir, out, targetId);
    }
    applyKnockback(world, w, targetId, dir) { if (w.stats.knockback > 0)
        world.applyImpulse(targetId, mul(dir, w.stats.knockback * 0.12)); }
    damageTerrain(world, w, center, out) { const r = Math.max(8, w.stats.blastRadius || 18); const cells = world.queryTerrainCircle(center, r); for (const c of cells) {
        if (!c.destructible)
            continue;
        const d = len({ x: c.x - center.x, y: c.y - center.y });
        const fall = 1 - clamp(d / r, 0, 1);
        const amount = Math.max(w.stats.terrainDamage, w.stats.baseDamage * 0.35) * fall;
        world.applyTerrainDamage(c, amount, w.id);
    } out.push({ type: 'terrain_deformed', center, radius: r, strength: Math.max(w.stats.terrainDamage, w.stats.baseDamage * 0.35), weaponId: w.id }); }
    explode(world, w, ownerId, pos, out) {
        const r = Math.max(1, w.stats.blastRadius);
        for (const e of world.getEntities()) {
            if (!e.alive || e.id === ownerId)
                continue;
            const d = len(sub(e.position, pos));
            if (d > r + e.radius)
                continue;
            const fall = 1 - clamp(d / r, 0, 1);
            const packet = { amount: w.stats.baseDamage * lerp(0.25, 1, fall), type: w.stats.damage_type || 'explosive', sourceWeaponId: w.id, sourceEntityId: ownerId };
            world.applyEntityDamage(e.id, packet);
            this.applyKnockback(world, w, e.id, norm(sub(e.position, pos)));
            const st = SPECIAL_STATUS[w.stats.special || '']?.(w);
            if (st) {
                world.addStatus(e.id, st);
                out.push({ type: 'status', entityId: e.id, status: st });
            }
        }
        if (w.stats.terrainDamage > 0 || w.mechanic.destructibleTerrain !== false)
            this.damageTerrain(world, w, pos, out);
        out.push({ type: 'explosion', position: pos, radius: r, damage: w.stats.baseDamage, weaponId: w.id });
    }
    specialOnFire(world, w, ownerId, pos, dir, out) {
        const s = w.stats.special || 'direct_hit';
        const data = { ownerId };
        if (['teleport', 'portal', 'portal_field', 'teleport_platform', 'hologram_portal', 'mobility'].includes(s)) {
            world.emit({ type: 'special', effect: s, position: pos, weaponId: w.id, data: { ...data, direction: dir } });
        }
        if (['auto_target', 'guardian', 'supply_drop', 'ammo_drop', 'summon_warrior', 'summon_mount', 'fire_entity', 'fire_minion', 'delayed_bot', 'bunker', 'camouflage', 'water_mobility'].includes(s))
            world.emit({ type: 'special', effect: s, position: pos, weaponId: w.id, data });
        if (['random_spell', 'random_buff', 'random_effect', 'mutation'].includes(s))
            world.emit({ type: 'special', effect: s, position: pos, weaponId: w.id, data: { ...data, seed: this.seq } });
    }
    specialOnImpact(world, w, ownerId, pos, dir, out, targetId) {
        const s = w.stats.special || 'direct_hit';
        if (['fire_pool', 'poison_cloud', 'poison_zone', 'tentacle_zone', 'lava', 'corruption', 'curse', 'astral_burst', 'mind_aoe', 'gravity_well', 'suction', 'energy_explosion', 'emp_blast', 'spike_blast', 'fragmentation', 'banana_split', 'phoenix_strike', 'meteor_impact', 'meteor_rain', 'air_strike', 'earth_splitter', 'world_poison', 'dragon_ultimate', 'guardian_ultimate', 'cosmic_ultimate', 'hell_cannon', 'rocket_punch'].includes(s))
            world.emit({ type: 'special', effect: s, position: pos, weaponId: w.id, data: { ownerId, targetId, direction: dir } });
        if (s === 'water_push' && targetId)
            world.applyImpulse(targetId, mul(dir, -w.stats.knockback / 8 || -3));
        if (s === 'teleport' && targetId) {
            const destination = add(pos, mul(dir, 80));
            world.moveEntity(targetId, destination);
        }
        if (s === 'bat_knockback' && targetId)
            this.applyKnockback(world, { ...w, stats: { ...w.stats, knockback: Math.max(82, w.stats.knockback) } }, targetId, dir);
    }
    kill(p, reason, out) { p.alive = false; this.projectiles.delete(p.id); out.push({ type: 'projectile_destroyed', projectileId: p.id, reason }); }
}
exports.WeaponEngine = WeaponEngine;
function validateDatabase(db) { const errors = []; if (db.iconCount !== db.weapons.length)
    errors.push(`iconCount=${db.iconCount} but weapons=${db.weapons.length}`); const ids = new Set(); for (const w of db.weapons) {
    if (ids.has(w.id))
        errors.push(`duplicate id ${w.id}`);
    ids.add(w.id);
    for (const k of ['baseDamage', 'blastRadius', 'knockback', 'projectileSpeed', 'gravity', 'bounces', 'fuseTime', 'terrainDamage', 'fireDamage', 'iceDamage', 'poisonDamage', 'homing', 'piercing']) {
        const v = w.stats[k];
        if (v !== undefined && v < 0)
            errors.push(`${w.id}.${k}<0`);
    }
} return errors; }
