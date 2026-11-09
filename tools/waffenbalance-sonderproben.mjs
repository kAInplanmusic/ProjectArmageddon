/** Kontrollierter Nachweis der Nachschub-Rückkopplung ohne Kistenfunde. */
import fs from 'node:fs';
import { MatchController } from '../src/engine/match.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { MALUS } from '../src/shared/config/schaden.js';

const result = [];
for (const weaponId of ['pa_119', 'pa_122', 'pa_125']) {
  const m = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open',
    klassen: KLASSEN_STANDARD, waffen: WAFFEN_STANDARD, turnDurationMs: 1_000_000, kisten: 1,
    loadouts: [{ classId: 'fernkampf' }, { classId: 'fernkampf' }],
  });
  m.start();
  const shooter = m.activePlayerId;
  m.inventory.register(shooter, [weaponId]);
  m.inventory.selectWeapon(shooter, weaponId);
  const uses = [];
  for (let i = 0; i < 10; i++) {
    let switches = 0;
    while ((m.activePlayerId !== shooter || m.cooldownFor(shooter, weaponId) > 0) && switches < 10 && m.status === 'playing') {
      m.endTurn(); switches++;
    }
    if (m.status !== 'playing') break;
    const before = m.inventory.getAmmo(shooter, weaponId);
    const r = m.fire(shooter, 0, 100, weaponId);
    uses.push({ before, after: m.inventory.getAmmo(shooter, weaponId), ok: r.ok, result: r.special, switches });
  }
  result.push({ weaponId, uses });
}
const legacyArchetype = [];
for (const classId of ['nahkampf', 'fernkampf', 'okkultist']) {
  const m = new MatchController({ seed: 31337, preset: 'open', klassen: 3, schaden: 2,
    loadouts: [{ classId }, { classId }],
  });
  m.start();
  const target = m.getState().entities[1];
  const applied = m.mali.wende(target.entityId, 'gift', { dmg: 10, by: m.activePlayerId });
  legacyArchetype.push({ classId, snapshotArchetypeId: target.archetypeId, configuredTurns: MALUS.gift.dauer,
    applied, status: m.getState().statuses[target.entityId] });
}
fs.writeFileSync(new URL('../docs/waffenbalance-2026-11-09/sonderproben.json', import.meta.url), JSON.stringify({
  method: 'Nur Nachschubwaffe und unbegrenzte Reserve im Inventar; keine Simulationsschritte und keine Kisten aufgenommen. Zugwechsel nur für aktive Figur und Cooldown. Belegt Selbstauffüllung, keine reale Matchstrategie oder Winrate.',
  versions: { waffen: WAFFEN_STANDARD, klassen: KLASSEN_STANDARD, schaden: 2 }, ammoFeedback: result, legacyArchetype,
}, null, 2) + '\n');
console.log(JSON.stringify(result.map(r => ({ id: r.weaponId, uses: r.uses.length, ammo: r.uses.map(x => x.after), allAccepted: r.uses.every(x => x.ok) }))));
