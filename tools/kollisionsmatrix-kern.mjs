/**
 * Kern der BAL-12-Kollisionsmatrix: echte Schüsse und echte Selbstwirkungen.
 *
 * Warum ein eigener Kern?
 *
 * Werkzeug (`tools/waffenbalance-kollisionsmatrix.mjs`) und Test
 * (`tests/bal-12-kollisionsmatrix.test.js`) müssen DENSELBEN Weg gehen. Sonst
 * belegt der Test eine Nachbildung und nicht den Motor. Der Kern importiert
 * deshalb ausschließlich den echten `MatchController`; er ruft weder
 * `wendeExplosionAn` noch eine andere Abkürzung auf. Ein Kollisionsfall ist nur,
 * was als Engine-Ereignis aus einem abgegebenen Schuss entsteht:
 *
 *   - `hitscan` mit `target` (Strahl trifft eine Figur),
 *   - `projectile_impact` mit `target` (Geschoss trifft eine Figur),
 *   - `projectile_pierced` mit `target` (Durchschlag trifft eine Figur),
 *   - `fuse_armed` in der Luft nahe der Figur (Zünderwaffe wird am Trefferfeld
 *     armiert; auf freier Strecke kann nur eine Figur der Auslöser sein).
 *
 * Der kontrollierte Aufruf `wendeExplosionAn(world, …)` erzeugt KEINES dieser
 * Ereignisse. Er ist damit kein Kollisionsfall — der Kontrollfall in Werkzeug
 * und Test hält das ausdrücklich fest.
 *
 * @module kollisionsmatrix-kern
 */
import { MatchController } from '../src/engine/match.js';
import { WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { weitenFaktor } from '../src/shared/reichweite.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import { wendeExplosionAn } from '../src/engine/explosion.js';

export const SEED = 31337;
export const KARTENBREITE = 2560;
export const ZIEL_LP = 1000;

/** Rollenentfernung: die Entfernung, in der eine Waffe ihre Rolle ausübt. */
export const ROLLEN_ENTFERNUNG = Object.freeze({
  melee: 30,
  ranged: 250,
  heavy_ranged: 600,
  elemental: 250,
  magic: 250,
  utility: 250,
  tech: 250,
  ultimate: 600,
});

const rund = n => Math.round(n * 1000) / 1000;
const gesund = (m, id) => m.world.getComponent(id, 'Health', 'current') ?? 0;

/**
 * Frischer, deterministischer Prüfstand.
 *
 * Beide Figuren stehen auf y=100 im freien Luftraum; das Terrain bleibt
 * darunter unberührt. `kisten: 0` hält Streukörper aus dem Schussfeld — die
 * Matrix prüft die Waffe, nicht den zufällig im Weg stehenden Nachschub.
 * Ohne Angabe bleibt die echte Startposition (für Selbstwirkungen, die auf dem
 * Boden wirken müssen).
 */
export function pruefstand(weaponId, { distance = 90, frei = true, spieler = 1 } = {}) {
  const m = new MatchController({
    seed: SEED, teams: 2, playersPerTeam: spieler, preset: 'open', turnDurationMs: 1_000_000,
    klassen: KLASSEN_STANDARD, waffen: WAFFEN_STANDARD, schaden: SCHADEN_STANDARD,
    wind: WIND_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 0,
    loadouts: [{ classId: 'fernkampf', archetypeId: null }, { classId: 'fernkampf', archetypeId: null }],
  });
  m.start();
  const entities = m.getState().entities;
  const shooter = entities[0].entityId;
  const target = entities[1].entityId;
  if (frei) {
    const positionen = new Map([[shooter, { x: 400, y: 100 }], [target, { x: 400 + distance, y: 100 }]]);
    const festhalten = () => {
      for (const [id, p] of positionen) {
        if (!m.world.isActive(id)) continue;
        for (const achse of ['x', 'y']) {
          m.world.setComponent(id, 'Position', achse, p[achse]);
          m.world.setComponent(id, 'Velocity', achse, 0);
        }
      }
    };
    festhalten();
    m.world.setComponent(target, 'Health', 'max', ZIEL_LP);
    m.world.setComponent(target, 'Health', 'current', ZIEL_LP);
    m.inventory.register(shooter, [weaponId]);
    m.inventory.selectWeapon(shooter, weaponId);
    m.consumeEvents();
    return { m, shooter, target, pin: festhalten, positionen };
  }
  m.inventory.register(shooter, [weaponId]);
  m.inventory.selectWeapon(shooter, weaponId);
  m.consumeEvents();
  return { m, shooter, target, pin: () => {}, positionen: null };
}

/** Reichweite der Waffe auf dieser Karte (dieselbe Rechnung wie der Motor). */
export function reichweite(weapon) {
  return weapon.maxRange * weitenFaktor(KARTENBREITE);
}

/**
 * Die Entfernung, in der die Waffe ihre Rolle ausübt: Nahkampf am Körper,
 * Fernwaffen im Rahmen ihrer eigenen Reichweite (85 %), nie über die
 * Katalogrolle hinaus.
 */
export function rollenDistanz(weapon) {
  if (weapon.category === 'melee') return ROLLEN_ENTFERNUNG.melee;
  const job = ROLLEN_ENTFERNUNG[weapon.category] ?? 250;
  if (weapon.delivery === 'hitscan') return Math.max(30, Math.round(Math.min(job, reichweite(weapon) * 0.95)));
  return Math.max(30, Math.round(Math.min(job, reichweite(weapon) * 0.85)));
}

/** Zielsuche: Winkel/Kraft, deren Vorschau dem Ziel am nächsten kommt. */
export function vorschauZiel(weapon, distance) {
  const { m, shooter } = pruefstand(weapon.id, { distance });
  let best = { d: Infinity, angle: 0, power: 100 };
  const pruefe = (angle, power) => {
    const bahn = m.aimPreview(shooter, angle, power, 600, weapon);
    let d = Infinity;
    for (const q of bahn) d = Math.min(d, Math.hypot(q.x - 400 - distance, q.y - 100));
    if (d < best.d) best = { d, angle, power };
  };
  for (const a of [-0.1, 0, 0.1, 0.3, 0.5, 0.8, 1.1, 1.4]) for (const p of [30, 60, 100]) pruefe(a, p);
  const coarse = { ...best };
  for (let da = -0.08; da <= 0.08; da += 0.02) {
    for (const dp of [-10, 0, 10]) pruefe(coarse.angle + da, Math.max(10, Math.min(100, coarse.power + dp)));
  }
  return { angle: best.angle, power: best.power, nearestPreview: rund(best.d) };
}

const kollisionsArten = ['hitscan', 'projectile_impact', 'projectile_pierced', 'fuse_armed'];

/**
 * Ein echter Schuss auf ein Ziel. Liefert den vollständigen Nachweis oder
 * `collision: null`. Es wird NICHTS direkt explodiert.
 */
export function trefferProbe(weapon, { distance, angle, power }) {
  const f = pruefstand(weapon.id, { distance });
  const { m, shooter, target, pin } = f;
  const vorherZiel = gesund(m, target);
  const vorherSchuetze = gesund(m, shooter);
  const munitionVorher = m.inventory.getAmmo(shooter, weapon.id);
  const r = m.fire(shooter, angle, power, weapon.id);
  const ereignisse = [...m.consumeEvents()];
  const projectileId = r.projectileId ?? null;
  const spawn = projectileId == null ? null : {
    x: rund(m.world.getComponent(projectileId, 'Position', 'x')),
    y: rund(m.world.getComponent(projectileId, 'Position', 'y')),
    blastRadius: m.world.getComponent(projectileId, 'Projectile', 'blastRadius') ?? 0,
    trefferRadius: m.world.getComponent(projectileId, 'Projectile', 'trefferRadius') ?? 0,
    homing: m.world.getComponent(projectileId, 'Projectile', 'homing') ?? 0,
    fuseTicks: m.world.getComponent(projectileId, 'Projectile', 'fuseTicks') ?? 0,
  };

  let takte = 0;
  while (m.activeProjectileCount > 0 && takte < 900) {
    pin(); m.step(); pin(); ereignisse.push(...m.consumeEvents()); takte += 1;
  }
  for (let i = 0; i < 12; i++) { pin(); m.step(); pin(); ereignisse.push(...m.consumeEvents()); }

  const zielOrt = {
    x: m.world.getComponent(target, 'Position', 'x'),
    y: m.world.getComponent(target, 'Position', 'y'),
  };
  const eigen = e => projectileId == null || e.payload.entityId === projectileId || e.payload.target !== undefined;
  const strahl = ereignisse.find(e => e.type === 'hitscan' && e.payload.target === target);
  const aufprall = ereignisse.find(e => e.type === 'projectile_impact' && eigen(e) && e.payload.target === target);
  const durchschlag = ereignisse.find(e => e.type === 'projectile_pierced' && eigen(e) && e.payload.target === target);
  const armierung = ereignisse.find(e => e.type === 'fuse_armed' && eigen(e));
  const armierungAmZiel = armierung && Math.hypot(armierung.payload.x - zielOrt.x, armierung.payload.y - zielOrt.y)
    <= (spawn?.trefferRadius || 24) + 1 ? armierung : null;
  const armierungInLuft = armierungAmZiel && armierungAmZiel.payload.y < (m.surfaceYAt(Math.round(armierungAmZiel.payload.x)) - 1);

  let kollision = null;
  if (strahl) kollision = { art: 'hitscan', x: rund(strahl.payload.hitX), y: rund(strahl.payload.hitY), target: strahl.payload.target };
  else if (aufprall) kollision = { art: 'projectile_impact', x: rund(aufprall.payload.x), y: rund(aufprall.payload.y), target: aufprall.payload.target };
  else if (durchschlag) kollision = { art: 'projectile_pierced', x: rund(durchschlag.payload.x), y: rund(durchschlag.payload.y), target: durchschlag.payload.target };
  else if (armierungInLuft) kollision = { art: 'fuse_armed', x: rund(armierungAmZiel.payload.x), y: rund(armierungAmZiel.payload.y), target, imFreien: true };

  const schaden = ereignisse
    .filter(e => e.type === 'damage' && e.payload.entityId === target && e.payload.attackerId === shooter && e.payload.dot !== true)
    .reduce((n, e) => n + e.payload.amount, 0);
  const zielVerlust = rund(vorherZiel - gesund(m, target));
  const relevante = ['shot', 'hitscan', 'projectile_spawn', 'projectile_impact', 'projectile_pierced',
    'fuse_armed', 'fuse_expired', 'explosion', 'damage', 'terrain_destroyed'];

  return {
    distance, angle, angleAnzeige: rund(angle), power,
    ok: r.ok === true, errors: r.errors ?? [],
    route: r.special ? 'selbst' : projectileId != null ? 'projektil' : 'strahl',
    targetId: target, shooterId: shooter,
    munitionVorher: Number.isFinite(munitionVorher) ? munitionVorher : 'unbegrenzt',
    spawn, ticks: takte,
    kollision,
    schaden: {
      ereignisse: rund(schaden), zielVerlust,
      selbstVerlust: rund(vorherSchuetze - gesund(m, shooter)),
      zielLP: { vorher: rund(vorherZiel), nachher: rund(gesund(m, target)) },
    },
    ereignisArten: [...new Set(ereignisse.map(e => e.type))].filter(t => relevante.includes(t)),
    /* Die Zusage des Tickets, maschinenlesbar: kein kontrollierter Explosionsaufruf. */
    quelle: 'fire+step',
    kontrollierteExplosion: false,
  };
}

/** Nutzwert einer Selbstwirkung — mindestens eine positive, messbare Größe. */
export function nutzwert(payload) {
  if (!payload) return null;
  switch (payload.kind) {
    case 'heal': return payload.healed > 0 ? { art: 'heilung', wert: payload.healed } : null;
    case 'shield': return payload.shield > 0 ? { art: 'schild', wert: payload.shield } : null;
    case 'damage_boost': return payload.multiplier > 1 ? { art: 'schadensbonus', wert: payload.multiplier } : null;
    case 'armor': return payload.reduction > 0 ? { art: 'ruestung', wert: payload.reduction } : null;
    case 'ammo': return payload.restored > 0 ? { art: 'munition', wert: payload.restored } : null;
    case 'move': return payload.moved && (payload.moved.dx !== 0 || payload.moved.dy !== 0)
      ? { art: 'bewegung', wert: rund(Math.hypot(payload.moved.dx, payload.moved.dy)), dx: rund(payload.moved.dx), dy: rund(payload.moved.dy) } : null;
    case 'mount': return payload.moved && (payload.moved.dx !== 0 || payload.moved.dy !== 0)
      ? { art: 'reittier', wert: rund(Math.hypot(payload.moved.dx, payload.moved.dy)), dx: rund(payload.moved.dx), dy: rund(payload.moved.dy) } : null;
    case 'turret': return payload.turretId != null ? { art: 'geschuetz', wert: payload.rounds ?? 1, turretId: payload.turretId } : null;
    case 'mine': return payload.mineId != null ? { art: 'mine', wert: 1, mineId: payload.mineId, mineArt: payload.art } : null;
    case 'reveal': return payload.revealedTurns > 0 ? { art: 'aufklaerung', wert: payload.revealedTurns } : null;
    case 'random': {
      const unter = nutzwert({ ...payload, kind: payload.randomKind });
      if (!unter) return null;
      return { art: 'zufall', wert: unter.wert, randomKind: payload.randomKind, unter };
    }
    default: return null;
  }
}

/**
 * Eine Selbstwirkung auf dem echten Boden (Startposition, kein Festhalten).
 * Heilung und Zufall bekommen vorher Schaden, damit die Wirkung nicht an
 * vollen LP verpufft. Munition und Zufall bekommen eine zweite, angebrochene
 * Waffe (`MUNITION_ZIEL`, eine Ladung): Bis Waffenfassung 17 füllte der Nachschub
 * die eigene, gerade verbrauchte Ladung auf; ab Fassung 18 (BAL-05) füllt er nie
 * sich selbst und braucht eine andere Waffe, um messbar zu wirken.
 */
export const MUNITION_ZIEL = 'pa_072';

export function selbstProbe(weapon) {
  const { m, shooter } = pruefstand(weapon.id, { frei: false });
  const effekt = buildEffect(weapon);
  if (effekt && (effekt.kind === 'heal' || effekt.kind === 'random')) {
    const max = m.world.getComponent(shooter, 'Health', 'max') ?? 100;
    m.world.setComponent(shooter, 'Health', 'current', Math.max(1, Math.round(max * 0.4)));
  }
  if (effekt && (effekt.kind === 'ammo' || effekt.kind === 'random') && weapon.id !== MUNITION_ZIEL) {
    m.inventory.grantWeapon(shooter, MUNITION_ZIEL, { ammo: 1 });
    m.inventory.selectWeapon(shooter, weapon.id);
  }
  const vorher = {
    x: rund(m.world.getComponent(shooter, 'Position', 'x')),
    y: rund(m.world.getComponent(shooter, 'Position', 'y')),
    hp: rund(gesund(m, shooter)),
  };
  const munitionVorher = m.inventory.getAmmo(shooter, weapon.id);
  const r = m.fire(shooter, 0, 100, weapon.id);
  const ereignisse = [...m.consumeEvents()];
  for (let i = 0; i < 10; i++) { m.step(); ereignisse.push(...m.consumeEvents()); }
  const ausloeser = ereignisse.find(e => e.type === 'special_effect' && e.payload.weaponId === weapon.id);
  const nutzen = nutzwert(ausloeser?.payload ?? null);
  const nachher = {
    x: rund(m.world.getComponent(shooter, 'Position', 'x')),
    y: rund(m.world.getComponent(shooter, 'Position', 'y')),
    hp: rund(gesund(m, shooter)),
  };
  return {
    ok: r.ok === true,
    errors: r.errors ?? [],
    route: 'selbst',
    kind: effekt?.kind ?? null,
    /* Eine Selbstwirkung darf kein Geschoss erzeugen: sonst wäre sie als Angriff getarnt. */
    projectileId: r.projectileId ?? null,
    nutzen,
    vorher, nachher,
    munitionVorher: Number.isFinite(munitionVorher) ? munitionVorher : 'unbegrenzt',
    munitionNachher: Number.isFinite(m.inventory.getAmmo(shooter, weapon.id)) ? m.inventory.getAmmo(shooter, weapon.id) : 'unbegrenzt',
    ereignisArten: [...new Set(ereignisse.map(e => e.type))],
    quelle: 'fire+step',
    kontrollierteExplosion: false,
  };
}

/** Klassifikation einer Waffe über den Motor, nicht über den Namen. */
export function istSelbstwirkung(weapon) {
  const effekt = buildEffect(weapon);
  return Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
}

/**
 * Negativkontrolle: derselbe Explosionsaufruf wie im Audit erzeugt Schaden,
 * aber KEIN Kollisionsereignis. Er darf deshalb nie als Kollisionsfall zählen.
 */
export function kontrollfall() {
  const { m, shooter, target } = pruefstand('pa_040', { distance: 90 });
  const vorher = gesund(m, target);
  m.consumeEvents();
  wendeExplosionAn(m.world, {
    x: 490, y: 100, damage: 40, blastRadius: 40, knockback: 0, terrainDamage: 0,
    owner: shooter, damageType: 0, weaponId: 40, hitTarget: target,
  });
  const ereignisse = [...m.consumeEvents()];
  return {
    schaden: rund(vorher - gesund(m, target)),
    kollisionsEreignisse: ereignisse.filter(e => kollisionsArten.includes(e.type)).length,
    ereignisArten: [...new Set(ereignisse.map(e => e.type))],
    zaehltAlsKollision: false,
    begruendung: 'Direkter Aufruf von wendeExplosionAn erzeugt kein hitscan/projectile_impact/projectile_pierced/fuse_armed',
  };
}
