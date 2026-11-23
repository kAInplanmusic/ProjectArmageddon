/**
 * QV-6, Welle 1, Baustein B: Schwerkraftfaktor je Biom (`config/biomregeln.js`, Fassung 3).
 *
 * Geprüft wird: Versionsmarke (Fassung 1 und 2 bleiben bitgleich), welche Biome den Faktor haben, Surreal je Runde
 * deterministisch aus dem Seed, der Faktor gilt am Abschuss (Projektil, Geschütz) und in der Client-Vorhersage, und
 * die Hinweiszeile. Die Höhe der Faktoren ist nicht Gegenstand (erste Ansätze).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_ALT, BIOMREGELN_STROEMUNG, BIOMREGELN_SCHWERKRAFT, BIOM_SCHWERKRAFT, schwerkraftFuer, schwerkraftHoechstwert,
} from '../src/shared/config/biomregeln.js';
import { MatchController } from '../src/engine/match.js';
import { turretProjectile } from '../src/engine/turret.js';
import { biomregelText, meldeBiomregel, schwerkraftFaktor } from '../src/client/biomregelAnzeige.js';

const match = (biom, biomregeln, seed = 77) => {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom, biomregeln });
  m.start();
  return m;
};

test('schwerkraftFuer: nur Kosmos, Planet(-arten), Schwebinseln, Surreal und nur ab Fassung 3', () => {
  assert.deepEqual(Object.keys(BIOM_SCHWERKRAFT).sort(), ['kosmos', 'planet', 'schwebinseln', 'surreal']);
  for (const fassung of [BIOMREGELN_ALT, BIOMREGELN_STROEMUNG]) assert.equal(schwerkraftFuer('kosmos', fassung, 5, 1), null);
  assert.equal(schwerkraftFuer('vulkan', BIOMREGELN_SCHWERKRAFT, 5, 1), null);
  assert.equal(schwerkraftFuer(null, BIOMREGELN_SCHWERKRAFT, 5, 1), null);
  assert.equal(schwerkraftFuer('kosmos', BIOMREGELN_SCHWERKRAFT, 5, 1).faktor, 0.6);
  assert.equal(schwerkraftFuer('planet_eis', BIOMREGELN_SCHWERKRAFT, 5, 1).faktor, 0.85, 'Planetenart gehört zu planet');
  assert.ok(schwerkraftFuer('schwebinseln', BIOMREGELN_SCHWERKRAFT, 5, 1).faktor < 1);
});

test('Surreal: Faktor je Runde aus dem Seed, innerhalb der Spanne, reproduzierbar, nicht immer gleich', () => {
  const werte = [];
  for (let runde = 1; runde <= 40; runde += 1) {
    const a = schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 12345, runde);
    const b = schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 12345, runde);
    assert.equal(a.faktor, b.faktor);
    assert.ok(a.faktor >= 0.7 && a.faktor <= 1.3, String(a.faktor));
    assert.equal(a.jeRunde, true);
    werte.push(a.faktor);
  }
  assert.ok(new Set(werte).size > 10, 'die Runden unterscheiden sich');
  assert.notEqual(schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 1, 3).faktor, schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 2, 3).faktor);
});

test('Motor: Fassung 1 und 2 behalten Faktor 1; Fassung 3 gibt ihn im Biom, sonst 1', () => {
  for (const f of [BIOMREGELN_ALT, BIOMREGELN_STROEMUNG]) assert.equal(match('kosmos', f).schwerkraft, 1);
  assert.equal(match('kosmos', BIOMREGELN_SCHWERKRAFT).schwerkraft, 0.6);
  assert.equal(match('vulkan', BIOMREGELN_SCHWERKRAFT).schwerkraft, 1);
  const s = match('surreal', BIOMREGELN_SCHWERKRAFT, 4242);
  assert.equal(s.schwerkraft, schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 4242, 1).faktor, 'Runde 1');
});

test('Geschütz: das Geschoss trägt den Faktor in gravityScale; Faktor 1 lässt den Wert unverändert', () => {
  const turret = { x: 0, y: 0, ownerId: 1, damage: 10, range: 300 };
  const waffe = { index: 1, damageType: 'explosive', gravityScale: 1.2 };
  const ohne = turretProjectile({ turret, waffe, winkel: 0.5, speed: 10 }).projectile.gravityScale;
  const mit = turretProjectile({ turret, waffe, winkel: 0.5, speed: 10, schwerkraft: 0.5 }).projectile.gravityScale;
  assert.equal(ohne, 1.2);
  assert.equal(mit, 0.6);
});

test('Geschütz-Vorschau im Match: kleinere Schwerkraft → höherer Bogen, Fassung 2 unverändert', () => {
  const a = match('kosmos', BIOMREGELN_STROEMUNG);
  const b = match('kosmos', BIOMREGELN_SCHWERKRAFT);
  const turret = { x: a.width / 2, y: 20, ownerId: 1, range: 600 };
  const bahnA = a.turretPath(turret, Math.PI / 4, 60);
  const bahnB = b.turretPath(turret, Math.PI / 4, 60);
  assert.ok(bahnA.length > 5 && bahnB.length > 5);
  const hoechster = (bahn) => Math.min(...bahn.map((p) => p.y));
  assert.ok(hoechster(bahnB) < hoechster(bahnA), 'Faktor 0,6 steigt höher als Faktor 1');
  const c = match('kosmos', BIOMREGELN_ALT);
  assert.deepEqual(c.turretPath(turret, Math.PI / 4, 60), bahnA, 'Fassung 1 und 2 rechnen gleich');
});

test('Client: Vorhersagefaktor und Hinweiszeile rechnen mit derselben Regel wie der Motor', () => {
  const hud = { log() {} };
  meldeBiomregel(hud, { biom: 'kosmos', biomregeln: BIOMREGELN_SCHWERKRAFT, seed: 9 });
  assert.equal(schwerkraftFaktor(1), 0.6);
  meldeBiomregel(hud, { biom: 'surreal', biomregeln: BIOMREGELN_SCHWERKRAFT, seed: 9 });
  assert.equal(schwerkraftFaktor(3), schwerkraftFuer('surreal', BIOMREGELN_SCHWERKRAFT, 9, 3).faktor);
  meldeBiomregel(hud, { biom: 'kosmos', biomregeln: BIOMREGELN_STROEMUNG, seed: 9 });
  assert.equal(schwerkraftFaktor(1), 1);
  assert.match(biomregelText({ biom: 'kosmos', biomregeln: 3, seed: 9 }), /Geringe Schwerkraft/);
  assert.match(biomregelText({ biom: 'surreal', biomregeln: 3, seed: 9 }), /Wechselnde Schwerkraft/);
  assert.equal(biomregelText({ biom: 'kosmos', biomregeln: 2, seed: 9 }), null);
});

test('Abschuss: das echte Projektil trägt den Faktor (Fassung 3), in Fassung 2 nicht', () => {
  const gravityScaleDesErstenSchusses = (biom, fassung) => {
    const m = match(biom, fassung);
    const id = m.getState().activePlayerId;
    const r = m.fire(id, 0.9, 60);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(Number.isFinite(r.projectileId), 'ein Projektil existiert');
    return m.world.getComponent(r.projectileId, 'Projectile', 'gravityScale');
  };
  const ohne = gravityScaleDesErstenSchusses('kosmos', BIOMREGELN_STROEMUNG);
  const mit = gravityScaleDesErstenSchusses('kosmos', BIOMREGELN_SCHWERKRAFT);
  assert.ok(Math.abs(mit - ohne * 0.6) < 1e-6, `${mit} gegen ${ohne} × 0,6`);
});

test('Erreichbarkeit beim Kartenstart rechnet mit dem stärksten Faktor des Bioms (TODO 2.4)', () => {
  assert.equal(schwerkraftHoechstwert('surreal', BIOMREGELN_SCHWERKRAFT), 1.3, 'Spanne: Höchstwert');
  assert.equal(schwerkraftHoechstwert('kosmos', BIOMREGELN_SCHWERKRAFT), 0.6);
  assert.equal(schwerkraftHoechstwert('planet_eis', BIOMREGELN_SCHWERKRAFT), 0.85);
  assert.equal(schwerkraftHoechstwert('vulkan', BIOMREGELN_SCHWERKRAFT), 1);
  assert.equal(schwerkraftHoechstwert('surreal', BIOMREGELN_STROEMUNG), 1, 'vor Fassung 3 keine Regel');
  // Wurfweite ~ v²/g: Bei gleicher Kartenbreite verhalten sich die Weiten umgekehrt wie die Faktoren.
  const weite = (biom, f) => match(biom, f, 77).erreichbarkeit?.wurfweite;
  const ohne = weite('surreal', BIOMREGELN_STROEMUNG);
  const surreal = weite('surreal', BIOMREGELN_SCHWERKRAFT);
  const kosmos = weite('kosmos', BIOMREGELN_SCHWERKRAFT);
  assert.ok(ohne > 0 && surreal > 0 && kosmos > 0, `Wurfweiten: ${ohne} ${surreal} ${kosmos}`);
  assert.ok(Math.abs(surreal * 1.3 - ohne) < 1e-6, `Surreal: ${surreal} * 1,3 = ${ohne}`);
  assert.ok(Math.abs(kosmos * 0.6 - ohne) < 1e-6, `Kosmos: ${kosmos} * 0,6 = ${ohne}`);
});
