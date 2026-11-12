/**
 * Feuerwesen (Waffenfassung 20, `pa_118`): ein kleiner Feuergnom, der geradeaus läuft, springt und bei Berührung mit
 * einer Figur in fünf Feuerkugeln zerbirst.
 *
 * ## Der Befund
 *
 * Bis Fassung 19 war das Feuerwesen ein Strahl (`delivery: 'hitscan'`); das Etikett `special: 'fire_minion'` las im
 * Motor niemand (`docs/waffenbalance-2026-11-09/BAL-16-NAME-MECHANIK.md`).
 *
 * ## Die Entscheidung (Auftraggeber, 2026-11-10)
 *
 * „Feuerwesen ist ein kleiner Feuergnom, der geradeaus läuft, springt und bei Berührung mit Spieler in 5 Feuerkugeln
 * zerbirst!"
 *
 * ## Was hier geprüft wird (alles über `fire` + `step`, der echte Motor)
 *
 *  - Er läuft geradeaus in Blickrichtung über ebenen Boden (Tempo je Takt), hüpft regelmäßig.
 *  - Eine Stufe bis 30 px überspringt er; vor einer höheren Wand kehrt er um.
 *  - Berührung einer Figur: genau fünf Feuerkugeln im festen Fächer, die Figur nimmt Schaden und brennt.
 *  - Laufzeitende: er zerbirst an Ort und Stelle (fünf Kugeln). Wasser und Kartenrand: weg, ohne Kugeln.
 *  - Der Zug endet erst, wenn Gnom und Kugeln aufgelöst sind.
 *  - Ohne Zufall: zwei gleiche Läufe sind Takt für Takt hashgleich.
 *  - Fassung 19 bleibt ein Strahl; ein Ablauf mit anderen Waffen ist in Fassung 19 und 20 hashgleich.
 *
 * Die Prüfbahn ist ein geebneter Abschnitt der Karte (Boden auf `BODEN`, darüber Luft), damit jede Aussage an einer
 * bekannten Geometrie hängt und nicht an der zufälligen Oberfläche des Seeds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import {
  WAFFEN_STREU, WAFFEN_FEUERWESEN, WAFFEN_STANDARD, getWaffe, normalisiereWaffen,
} from '../src/shared/config/waffen-fassung.js';
import { FEUERWESEN_WERTE } from '../src/shared/config/waffen-f20.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';

const FEUERWESEN = 'pa_118';
const BODEN = 700;
const W = FEUERWESEN_WERTE;

/**
 * Frischer Prüfstand: Boden auf `BODEN` von x = 0 bis 1400, Schütze bei `schuetzeX`, Ziel bei `zielX`, beide stehen.
 * `mauer`: Höhe einer 30 px breiten Wand bei x = 650 (0 = keine).
 */
function stand({ waffen = WAFFEN_FEUERWESEN, schuetzeX = 400, zielX = 1300, mauer = 0, waffe = FEUERWESEN } = {}) {
  const m = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    klassen: KLASSEN_STANDARD, waffen, schaden: SCHADEN_STANDARD, wind: WIND_STANDARD,
    bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 0,
    loadouts: [{ classId: 'fernkampf', archetypeId: null }, { classId: 'fernkampf', archetypeId: null }],
  });
  m.start();
  for (let x = 0; x < 1400; x += 1) for (let y = BODEN - 250; y < BODEN + 40; y += 1) m.terrain.setPixel(x, y, y >= BODEN);
  for (let x = 650; x < 680 && mauer > 0; x += 1) for (let y = BODEN - mauer; y < BODEN; y += 1) m.terrain.setPixel(x, y, true);
  const [a, b] = m.getState().entities;
  const schuetze = a.entityId;
  const ziel = b.entityId;
  for (const [id, x] of [[schuetze, schuetzeX], [ziel, zielX]]) {
    m.world.setComponent(id, 'Position', 'x', x);
    m.world.setComponent(id, 'Position', 'y', BODEN - 40);
  }
  for (let i = 0; i < 120; i += 1) m.step();
  m.consumeEvents();
  assert.equal(m.activePlayerId, schuetze, 'Testaufbau: der Schütze ist am Zug');
  m.inventory.register(schuetze, [waffe]);
  m.inventory.selectWeapon(schuetze, waffe);
  return { m, schuetze, ziel };
}

/** Feuert und lässt laufen, bis nichts mehr unterwegs ist; sammelt Ereignisse, Gnomlagen und Hashes je Takt. */
function lauf(f, { winkel = 0.3, kraft = 50, waffe = FEUERWESEN, vorher = null } = {}) {
  const { m } = f;
  vorher?.(m);
  const r = m.fire(f.schuetze, winkel, kraft, waffe);
  assert.ok(r.ok, `Schuss abgelehnt: ${r.errors}`);
  const ereignisse = [...m.consumeEvents()];
  const lagen = [];
  const hashes = [m.stateHash()];
  let takte = 0;
  for (; takte < 1200 && m.activeProjectileCount > 0; takte += 1) {
    m.step();
    ereignisse.push(...m.consumeEvents());
    const g = m.getState().feuerwesen?.[0];
    if (g) lagen.push({ ...g });
    hashes.push(m.stateHash());
  }
  const typ = t => ereignisse.filter(e => e.type === t);
  return { r, ereignisse, typ, lagen, hashes, takte, m };
}

test('Fassung 20 folgt direkt auf Fassung 19 (Standard ist seit Fassung 21 die Entscheidung); der Läufer bleibt', () => {
  assert.equal(WAFFEN_FEUERWESEN, WAFFEN_STREU + 1);
  assert.equal(WAFFEN_STANDARD, WAFFEN_FEUERWESEN + 1, 'Fassung 21 ist der Standard');
  assert.equal(normalisiereWaffen(20), WAFFEN_FEUERWESEN);
  assert.equal(normalisiereWaffen(19), WAFFEN_STREU, 'Fassung 19 bleibt eine gültige Marke (alte Replays)');
  const neu = getWaffe(FEUERWESEN, WAFFEN_FEUERWESEN);
  const alt = getWaffe(FEUERWESEN, WAFFEN_STREU);
  assert.equal(neu.delivery, 'laeufer');
  assert.equal(neu.laeufer.kugeln.anzahl, 5);
  assert.equal(alt.delivery, 'hitscan', 'Fassung 19 bleibt ein Strahl');
  assert.equal(alt.laeufer, undefined, 'Fassung 19 darf keinen Läufer kennen');
  // Die übrigen Felder bleiben: Munition, Abklingzeit, Brand, Schadensart.
  for (const feld of ['maxAmmo', 'cooldown', 'damageType', 'elemental', 'damage']) assert.deepEqual(neu[feld], alt[feld], feld);
});

test('Er läuft geradeaus in Blickrichtung, folgt dem Boden und hüpft regelmäßig', () => {
  const l = lauf(stand());
  const gesetzt = l.typ('feuerwesen_gesetzt');
  assert.equal(gesetzt.length, 1);
  assert.equal(l.r.feuerwesenId, gesetzt[0].payload.id);
  assert.equal(l.r.projectileId, null, 'der Schuss selbst ist kein Geschoss');
  assert.equal(gesetzt[0].payload.richtung, 1, 'Zielwinkel nach rechts: er läuft nach rechts');
  assert.ok(gesetzt[0].payload.x > 400, 'abgesetzt VOR der Figur');
  // Am Boden genau `tempo` je Takt nach rechts, nie zurück, Füße auf dem Boden.
  for (let i = 1; i < l.lagen.length; i += 1) {
    assert.ok(Math.abs(l.lagen[i].x - l.lagen[i - 1].x - W.tempo) < 1e-9, `Takt ${i}: nicht geradeaus`);
    assert.equal(l.lagen[i].richtung, 1);
    if (!l.lagen[i].luft) assert.equal(l.lagen[i].y, BODEN - 1, `Takt ${i}: nicht auf dem Boden`);
  }
  const hopser = l.typ('feuerwesen_sprung').filter(e => e.payload.art === 'hopser');
  assert.ok(hopser.length >= 5, `nur ${hopser.length} Hopser in 4,5 s`);
  for (let i = 1; i < hopser.length; i += 1) {
    assert.ok(Math.abs(hopser[i].payload.x - hopser[i - 1].payload.x - W.hopserTakte * W.tempo) < 1e-6, 'Hopser nicht regelmäßig');
  }
  assert.ok(l.lagen.some(g => g.luft && g.y < BODEN - 1 - W.hopserHoehe + 1.5), 'ein Hopser hebt ihn sichtbar an');
});

test('Eine Stufe bis 30 px überspringt er, vor einer höheren Wand kehrt er um', () => {
  const stufe = lauf(stand({ mauer: 16 }));
  assert.equal(stufe.typ('feuerwesen_sprung').filter(e => e.payload.art === 'sprung').length, 1, 'genau ein Sprung');
  assert.ok(stufe.lagen.some(g => g.x > 690), 'er ist über die Stufe hinweg');
  assert.ok(stufe.lagen.every(g => g.richtung === 1), 'an der Stufe kehrt er nicht um');

  const wand = lauf(stand({ mauer: 60 }));
  assert.ok(wand.lagen.every(g => g.x < 650), 'durch die Wand kommt er nicht');
  const umkehr = wand.lagen.findIndex(g => g.richtung === -1);
  assert.ok(umkehr > 0, 'vor der 60-px-Wand kehrt er um');
  assert.ok(wand.lagen[umkehr].x > 620, 'umgekehrt wird an der Wand');
  assert.ok(wand.lagen.at(-1).x < wand.lagen[umkehr].x - 100, 'nach der Umkehr läuft er zurück');
});

test('Berührung einer Figur: genau fünf Feuerkugeln im festen Fächer, Schaden und Brand am Ziel', () => {
  const f = stand({ zielX: 560 });
  const vorher = f.m.world.getComponent(f.ziel, 'Health', 'current');
  const l = lauf(f);
  const birst = l.typ('feuerwesen_zerbirst');
  assert.equal(birst.length, 1);
  assert.equal(birst[0].payload.grund, 'beruehrung');
  assert.equal(birst[0].payload.target, f.ziel);
  assert.equal(birst[0].payload.kugeln.length, 5);
  const spawns = l.typ('projectile_spawn');
  assert.equal(spawns.length, 5, 'genau fünf Feuerkugeln');
  assert.ok(spawns.every(e => e.payload.weaponId === FEUERWESEN));
  // Fester Fächer ohne Zufall: 45°, 67,5°, 90°, 112,5°, 135° bei `kugeln.tempo`.
  const winkel = spawns.map(e => Math.atan2(-e.payload.vy, e.payload.vx) * 180 / Math.PI);
  [45, 67.5, 90, 112.5, 135].forEach((soll, i) => assert.ok(Math.abs(winkel[i] - soll) < 1e-6, `Kugel ${i}: ${winkel[i]}°`));
  assert.ok(spawns.every(e => Math.abs(Math.hypot(e.payload.vx, e.payload.vy) - W.kugeln.tempo) < 1e-9));
  assert.ok(Math.abs(spawns[0].payload.x - birst[0].payload.x) < 1e-9, 'die Kugeln starten am Gnom');

  const direkt = l.typ('damage').filter(e => e.payload.entityId === f.ziel && e.payload.attackerId === f.schuetze && e.payload.dot !== true)
    .reduce((s, e) => s + e.payload.amount, 0);
  assert.ok(direkt >= 30, `Direktschaden am Ziel nur ${direkt}`);
  assert.ok(direkt <= 5 * W.kugeln.schaden, 'mehr als fünf volle Kugeln');
  assert.ok(l.typ('malus_angewendet').some(e => e.payload.playerId === f.ziel && e.payload.art === 'brand'), 'das Ziel brennt');
  assert.ok(l.m.world.getComponent(f.ziel, 'Health', 'current') < vorher);
});

test('Friendly Fire: auch eine eigene Figur bringt ihn zum Bersten — den Werfer selbst erreicht er nach der Umkehr', () => {
  // Wand bei 650, der Gnom kehrt um und läuft zum Werfer zurück; die Laufzeit reicht dafür nicht ganz,
  // deshalb steht der Werfer hier dicht an der Wand.
  const f = stand({ schuetzeX: 560, mauer: 60 });
  const l = lauf(f);
  const birst = l.typ('feuerwesen_zerbirst');
  assert.equal(birst.length, 1);
  assert.equal(birst[0].payload.grund, 'beruehrung');
  assert.equal(birst[0].payload.target, f.schuetze, 'er birst am eigenen Werfer');
});

test('Laufzeitende: er zerbirst an Ort und Stelle nach genau `laufzeitTakte`', () => {
  const l = lauf(stand());
  const birst = l.typ('feuerwesen_zerbirst');
  assert.equal(birst.length, 1);
  assert.equal(birst[0].payload.grund, 'laufzeit');
  assert.equal(birst[0].payload.target, null);
  assert.equal(l.lagen.length, W.laufzeitTakte - 1, 'gelaufen wird bis einen Takt vor dem Ende');
  assert.ok(Math.abs(birst[0].payload.x - l.lagen.at(-1).x) < 1e-9, 'an Ort und Stelle');
  assert.equal(l.typ('projectile_spawn').length, 5);
});

test('Kartenrand und Wasser: er verschwindet ohne Kugeln', () => {
  const rand = lauf(stand({ schuetzeX: 60 }), { winkel: 2.8 });
  assert.deepEqual(rand.typ('feuerwesen_erloschen').map(e => e.payload.grund), ['kartenrand']);
  assert.equal(rand.typ('feuerwesen_zerbirst').length, 0);
  assert.equal(rand.typ('projectile_spawn').length, 0, 'am Kartenrand keine Kugeln');

  const nass = lauf(stand(), {
    vorher: (m) => {
      // Ein Becken bei x 520–600, randvoll geflutet.
      for (let x = 520; x < 600; x += 1) for (let y = BODEN; y < BODEN + 30; y += 1) m.terrain.setPixel(x, y, false);
      for (let x = 520; x < 600; x += 4) m.floodArea(x, BODEN + 26, 1);
    },
  });
  assert.deepEqual(nass.typ('feuerwesen_erloschen').map(e => e.payload.grund), ['wasser']);
  assert.equal(nass.typ('projectile_spawn').length, 0, 'im Wasser keine Kugeln');
});

test('Der Zug endet erst, wenn Gnom und alle Feuerkugeln aufgelöst sind', () => {
  const f = stand({ zielX: 560 });
  const l = lauf(f);
  const index = t => l.ereignisse.findIndex(e => e.type === t);
  const ende = index('turn_end');
  assert.ok(ende > 0, 'der Zug endet');
  assert.ok(index('feuerwesen_zerbirst') < ende);
  const letzterEinschlag = l.ereignisse.map(e => e.type).lastIndexOf('projectile_impact');
  assert.ok(letzterEinschlag < ende, 'eine Kugel schlug nach dem Zugende ein');
  assert.equal(l.typ('projectile_impact').length + l.typ('projectile_expired').length, 5, 'alle fünf Kugeln aufgelöst');
  assert.equal(l.m.activeProjectileCount, 0);
  assert.notEqual(l.m.activePlayerId, f.schuetze, 'der nächste ist am Zug');
  // Während er läuft, zählt er als unterwegs.
  assert.ok(l.lagen.length > 0 && l.typ('turn_end').length === 1);
});

test('Ohne Zufall: zwei gleiche Läufe sind Takt für Takt hashgleich, und der Gnom steht im Hash', () => {
  const a = lauf(stand({ zielX: 900 }));
  const b = lauf(stand({ zielX: 900 }));
  assert.deepEqual(a.hashes, b.hashes);
  assert.ok(new Set(a.hashes.slice(0, 20)).size > 10, 'die Lage des Gnoms verändert den Hash');
});

test('Fassung 19 bleibt unverändert: das Feuerwesen ist dort ein Strahl ohne Läufer', () => {
  const l = lauf(stand({ waffen: WAFFEN_STREU }), { winkel: 0 });
  assert.ok(l.r.hit, 'Fassung 19: Strahltreffer');
  assert.equal(l.r.feuerwesenId, undefined);
  assert.equal(l.typ('hitscan').length, 1);
  assert.equal(l.ereignisse.filter(e => e.type.startsWith('feuerwesen')).length, 0);
  assert.equal(l.takte, 0, 'ein Strahl hält den Zug nicht auf');
});

test('Andere Waffen: Fassung 19 und 20 sind hashgleich', () => {
  for (const waffe of ['pa_040', 'pa_037', 'pa_072', 'pa_054']) {
    const alt = lauf(stand({ waffen: WAFFEN_STREU, waffe }), { waffe, winkel: 0.4, kraft: 60 });
    const neu = lauf(stand({ waffen: WAFFEN_FEUERWESEN, waffe }), { waffe, winkel: 0.4, kraft: 60 });
    assert.deepEqual(neu.hashes, alt.hashes, waffe);
  }
});
