/** Ergänzung: echte Bodenkollision und Selbstschaden ohne festgehaltene Figuren. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/waffenbalance-2026-11-09/bodenprobe.json');
const samples = [];
for (const base of WEAPONS) {
  const weapon = getWaffe(base.id);
  const effect = buildEffect(weapon);
  if (weapon.delivery === 'hitscan' || (effect && SELF_TARGET_KINDS.has(effect.kind))) continue;
  const cases = [];
  for (const seed of [777, 31337]) for (const angle of [0.1, 0.6, 1.2, 1.5]) for (const power of [25, 100]) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
      klassen: KLASSEN_STANDARD, waffen: WAFFEN_STANDARD, schaden: SCHADEN_STANDARD,
      wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 1,
      loadouts: [{ classId: 'okkultist', archetypeId: null }, { classId: 'okkultist', archetypeId: null }],
    });
    m.start();
    const shooter = m.activePlayerId;
    for (let i = 0; i < 12; i++) m.step();
    m.inventory.register(shooter, [weapon.id]);
    m.inventory.selectWeapon(shooter, weapon.id);
    const before = m.world.getComponent(shooter, 'Health', 'current');
    m.consumeEvents();
    const r = m.fire(shooter, angle, power, weapon.id);
    let selfDamage = 0, environmentDamage = 0, maxSingleSelfDamage = 0;
    const events = new Set();
    function collect() {
      for (const e of m.consumeEvents()) {
        events.add(e.type);
        if (e.type !== 'damage' || e.payload.entityId !== shooter) continue;
        if (e.payload.attackerId === shooter) { selfDamage += e.payload.amount; maxSingleSelfDamage = Math.max(maxSingleSelfDamage, e.payload.amount); }
        else environmentDamage += e.payload.amount;
      }
    }
    collect();
    let ticks = 0;
    while (m.activeProjectileCount > 0 && ticks < 900) { m.step(); collect(); ticks++; }
    for (let i = 0; i < 30 && m.status === 'playing'; i++) { m.step(); collect(); }
    cases.push({ seed, angle, power, ok: r.ok, errors: r.errors ?? [], before,
      after: m.world.getComponent(shooter, 'Health', 'current') ?? 0,
      selfDamage: Math.round(selfDamage * 1000) / 1000,
      maxSingleSelfDamage: Math.round(maxSingleSelfDamage * 1000) / 1000,
      environmentDamage: Math.round(environmentDamage * 1000) / 1000,
      alive: m.isPlayerAlive(shooter), pendingProjectiles: m.activeProjectileCount, ticks, events: [...events].sort() });
  }
  samples.push({ id: weapon.id, name: weapon.displayName, cases });
  fs.writeFileSync(OUT, JSON.stringify({ versions: { waffen: WAFFEN_STANDARD, klassen: KLASSEN_STANDARD, schaden: SCHADEN_STANDARD, wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 1 },
    method: 'Zwei feste hills-Seeds, echte Startplätze, Okkultist mit 70 LP, 12 Beruhigungstakte. Vier Winkel mal zwei Kräfte; echte Physik ohne Festhalten. Nur Projektilpfade; max. 900 Flugtakte plus 30 Nachlauftakte. Eigen- und Umweltschaden getrennt; kein Winrate-Nachweis.', weapons: samples }, null, 2) + '\n');
  console.log(`${weapon.id}: ${cases.filter(c => c.selfDamage > 0).length}/16 Selbsttreffer, ${cases.filter(c => !c.alive).length} Tode`);
}
