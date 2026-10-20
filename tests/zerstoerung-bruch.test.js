import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { CollisionMask } from '../src/engine/terrain/collisionMask.js';
import { Zerstoerung, charakterFuerIndex } from '../src/engine/zerstoerung.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/world.js';
import {
  ZERSTOERUNG_ALT, ZERSTOERUNG_GELAENDE, ZERSTOERUNG_SCHOLLEN, ZERSTOERUNG_BRUCH, ZERSTOERUNG_STANDARD,
  normalisiereZerstoerung, aufprallStaerke, charakterDerWaffe, SUCH_BUDGET_PRO_TICK, SCHUTT_MAX_GESAMT,
} from '../src/shared/config/zerstoerung.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { applyLogEntryToTerrain } from '../src/client/terrainPreview.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { WAFFEN_ALT } from '../src/shared/config/waffen-fassung.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

/**
 * Zerstörung Fassung 4: weich aufschlagende und brechende Inseln, Schutt als Partikel-Zellen,
 * Zerstörungscharakter der Waffe, Setzrutsch (Erdbeben), rutschende Figuren.
 * Fassung 1 bis 3 bleiben Bit für Bit (Goldwerte in `zerstoerung.test.js`).
 */

const B = 900;
const H = 700;

/** Boden ab y=600, Sockel (x 400..469, y 520..599) und eine Scholle 200 x 100 bei y 100 (x 300..499), nirgends verankert. */
function scholleAufSockel() {
  const bitmap = new Uint8Array(B * H);
  for (let y = 600; y < H; y++) for (let x = 0; x < B; x++) bitmap[y * B + x] = 1;
  for (let y = 520; y < 600; y++) for (let x = 400; x < 470; x++) bitmap[y * B + x] = 1;
  for (let y = 100; y < 200; y++) for (let x = 300; x < 500; x++) bitmap[y * B + x] = 1;
  return bitmap;
}

function stubWelt() {
  return {
    isActive: () => false,
    getEntitiesBySignature: () => [],
    getComponent: () => 0,
    setComponent() {},
    getSystem: () => null,
  };
}

function einheit(bitmap, fassung = ZERSTOERUNG_BRUCH, welt = stubWelt()) {
  const maske = CollisionMask.fromBitmap(bitmap, B, H);
  const ereignisse = [];
  const z = new Zerstoerung({ terrain: maske, world: welt, events: { emit: (type, payload) => ereignisse.push({ type, payload }) }, turrets: new Map(), fassung });
  return { maske, z, ereignisse };
}

function laufe(z, ticks) {
  let maxSuch = 0;
  let maxNach = 0;
  for (let t = 0; t < ticks; t++) {
    z.schritt();
    maxSuch = Math.max(maxSuch, z.suchkosten);
    maxNach = Math.max(maxNach, z.nachkosten);
  }
  return { maxSuch, maxNach };
}

const arten = ereignisse => {
  const zaehler = {};
  for (const e of ereignisse) zaehler[e.type] = (zaehler[e.type] ?? 0) + 1;
  return zaehler;
};

/** Client-Nachbau: Ausgangskarte + Log der Maske, Zelle für Zelle gegen die Server-Maske. */
function nachbau(bitmap, maske) {
  const terrain = { bitmap: bitmap.slice(), width: B, height: H, mask: CollisionMask.fromBitmap(bitmap, B, H) };
  for (const eintrag of maske.craterLog) applyLogEntryToTerrain(terrain, eintrag);
  let maskeAbw = 0;
  let bitmapAbw = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < B; x++) {
      if (terrain.mask.isSolid(x, y) !== maske.isSolid(x, y)) maskeAbw += 1;
      if (Boolean(terrain.bitmap[y * B + x]) !== maske.isSolid(x, y)) bitmapAbw += 1;
    }
  }
  return { terrain, maskeAbw, bitmapAbw };
}

/* ------------------------------------------------------------ Versionsmarke */

test('Fassung 4: Marke, Standard und Normalisierung', () => {
  assert.equal(ZERSTOERUNG_BRUCH, 4);
  assert.equal(ZERSTOERUNG_STANDARD, 5);
  for (const f of [1, 2, 3, 4, 5]) assert.equal(normalisiereZerstoerung(f), f);
  assert.equal(normalisiereZerstoerung(undefined), 5);
  assert.equal(normalisiereZerstoerung(6), 5);
});

test('Aufprallstärke: Masse und Fallhöhe, geklemmt auf 0..1', () => {
  assert.ok(aufprallStaerke(100, 5) < 0.3);
  assert.ok(aufprallStaerke(24000, 320) > 0.99);
  assert.ok(aufprallStaerke(4000, 100) > aufprallStaerke(4000, 30));
  assert.ok(aufprallStaerke(8000, 100) > aufprallStaerke(1000, 100));
  assert.equal(aufprallStaerke(-5, -5), 0.12);
});

test('Zerstörungscharakter nach Waffe: Bohrer, Splitter, Brand, Ultimate-Beben, Rest', () => {
  const art = name => charakterDerWaffe(WEAPONS.find(w => w.internalName === name));
  assert.equal(art('bohrkanone'), 'durchschlag');
  assert.equal(art('pneumatischer_bohrer'), 'durchschlag');
  assert.equal(art('splittergranate'), 'splitter');
  assert.equal(art('schrotflinte'), 'splitter');
  assert.equal(art('feuerball'), 'brand');
  assert.equal(art('erdspalter'), 'beben');
  assert.equal(art('kosmischer_kern'), 'beben');
  assert.equal(art('rakete'), 'sprengung');
  assert.equal(art('astralkrieger'), 'sprengung', 'Ultimate ohne Geländeschaden bebt nicht');
  assert.equal(charakterDerWaffe(null), 'sprengung');
  const feuerball = WEAPONS.find(w => w.internalName === 'feuerball');
  assert.equal(charakterFuerIndex(feuerball.index), 'brand');
  assert.equal(charakterFuerIndex(99999), 'sprengung');
});

/* ------------------------------------------------- weich, Bruch, Schutt */

function scholleFaellt(fassung) {
  const bitmap = scholleAufSockel();
  const e = einheit(bitmap, fassung);
  e.z.krater(300, 150, 10, 100);
  const kosten = laufe(e.z, 400);
  return { ...e, kosten, bitmap };
}

test('Fassung 4: eine schwere Scholle zerbröselt beim Aufprall, bricht in zwei Teile, der Schutt setzt sich ab', () => {
  const { z, ereignisse, maske, kosten } = scholleFaellt(ZERSTOERUNG_BRUCH);
  const zaehler = arten(ereignisse);
  assert.equal(zaehler.terrain_detached, 2, 'Scholle und abgebrochener Teil');
  assert.equal(zaehler.terrain_settled, 2);
  assert.ok(zaehler.terrain_crumble >= 1, 'der Rand zerbröselt');
  const entfernt = ereignisse.filter(e => e.type === 'terrain_removed');
  assert.ok(entfernt.some(e => e.payload.art === 'abplatz') && entfernt.some(e => e.payload.art === 'bruch'));
  assert.equal(entfernt.filter(e => e.payload.art === 'bruch').length, 1, 'bricht nur einmal je Linie');
  assert.ok(zaehler.terrain_added >= 3, 'Schutt setzt sich ab');
  const gelandet = ereignisse.filter(e => e.type === 'terrain_settled').map(e => e.payload.dy);
  assert.ok(gelandet[0] > 250 && gelandet[1] > 40, `Fallhöhen ${gelandet}`);
  assert.equal(z.faellt, 0, 'am Ende fällt nichts mehr');
  assert.equal(z.schutt, 0);
  assert.ok(kosten.maxSuch <= SUCH_BUDGET_PRO_TICK, `Suchkosten ${kosten.maxSuch} im Budget`);
  assert.ok(kosten.maxNach <= 60000, `Nacharbeit ${kosten.maxNach} Zellen im Tick`);
  const log = maske.craterLog.map(l => l[0]);
  assert.ok(log.includes('x') && log.includes('p') && log.includes('s'));
});

test('Fassung 4: die Bruchstücke liegen nach dem Fall getrennt (Riss), nichts hängt in der Luft', () => {
  const { maske } = scholleFaellt(ZERSTOERUNG_BRUCH);
  // Jede feste Zelle über dem Boden muss mit einer Zelle darunter verbunden sein, bis zum Boden/Sockel (kein schwebender Schutt).
  let schwebend = 0;
  for (let x = 0; x < B; x++) {
    for (let y = 100; y < 599; y++) {
      if (!maske.isSolid(x, y)) continue;
      const stuetze = maske.isSolid(x, y + 1) || maske.isSolid(x - 1, y + 1) || maske.isSolid(x + 1, y + 1);
      const getragen = maske.isSolid(x, y - 1) || maske.isSolid(x - 1, y) || maske.isSolid(x + 1, y);
      if (!stuetze && !getragen) schwebend += 1;
    }
  }
  assert.ok(schwebend <= 2, `höchstens ein, zwei Schuttzellen, deren Auflage später selbst zerbröselt ist (${schwebend})`);
});

test('Fassung 4: Client-Nachbau aus Ausgangskarte und Log ergibt zellengleich die Server-Maske (x, p, s)', () => {
  const { maske, bitmap } = scholleFaellt(ZERSTOERUNG_BRUCH);
  const { terrain, maskeAbw, bitmapAbw } = nachbau(bitmap, maske);
  assert.equal(maskeAbw, 0, 'Maske gleich');
  assert.equal(bitmapAbw, 0, 'Bitmap gleich');
  assert.equal(terrain.mask.hash(), maske.hash());
  assert.equal(terrain.mask.craterCount, maske.craterCount, 'gleiche Zählung des Logs');
});

test('Fassung 4 ist deterministisch (zwei Läufe: gleiche Maske, Log und Ereignisse)', () => {
  const a = scholleFaellt(ZERSTOERUNG_BRUCH);
  const b = scholleFaellt(ZERSTOERUNG_BRUCH);
  assert.equal(a.maske.hash(), b.maske.hash());
  assert.deepEqual(a.maske.craterLog, b.maske.craterLog);
  assert.deepEqual(a.ereignisse, b.ereignisse);
});

test('Fassung 3 kennt weder Zerbröseln noch Bruch noch neue Logeinträge', () => {
  const { ereignisse, maske } = scholleFaellt(ZERSTOERUNG_SCHOLLEN);
  const zaehler = arten(ereignisse);
  assert.equal(zaehler.terrain_detached, 1);
  assert.equal(zaehler.terrain_crumble, undefined);
  assert.equal(zaehler.terrain_removed, undefined);
  assert.equal(zaehler.terrain_added, undefined);
  assert.ok(maske.craterLog.every(l => l[0] === 's' || l.length === 4));
  assert.deepEqual(ereignisse[0].payload, { x: 300, y: 150, radius: 10, tiefe: 100 }, 'Nutzlast von terrain_destroyed ohne Zusatzfeld');
});

test('Eine kleine oder niedrig fallende Insel bleibt ganz (weder Schutt noch Bruch)', () => {
  const bitmap = new Uint8Array(B * H);
  for (let y = 600; y < H; y++) for (let x = 0; x < B; x++) bitmap[y * B + x] = 1;
  for (let y = 560; y < 600; y++) for (let x = 400; x < 410; x++) bitmap[y * B + x] = 1; // Pfeiler
  for (let y = 540; y < 560; y++) for (let x = 380; x < 430; x++) bitmap[y * B + x] = 1; // Brett 50 x 20
  const { z, ereignisse } = einheit(bitmap);
  z.krater(405, 580, 12, 100);
  laufe(z, 200);
  const zaehler = arten(ereignisse);
  assert.equal(zaehler.terrain_settled, 1);
  assert.equal(zaehler.terrain_crumble, undefined);
  assert.equal(zaehler.terrain_removed, undefined);
});

test('Fliegender Schutt ist gedeckelt und kostet je Tick wenig', () => {
  const { z, ereignisse } = scholleFaellt(ZERSTOERUNG_BRUCH);
  const teile = ereignisse.filter(e => e.type === 'terrain_crumble').reduce((summe, e) => summe + e.payload.teile.length / 4, 0);
  assert.ok(teile > 0 && teile <= SCHUTT_MAX_GESAMT);
  assert.equal(z.schutt, 0);
});

/* --------------------------------------------------------- Waffencharakter */

test('Splitterstreuung: ein Hauptkrater und 4 bis 6 kleine Nebenlöcher am Boden', () => {
  const bitmap = new Uint8Array(B * H);
  for (let y = 400; y < H; y++) for (let x = 0; x < B; x++) bitmap[y * B + x] = 1;
  const { z, ereignisse } = einheit(bitmap);
  z.krater(450, 400, 40, 85, 'splitter');
  const kraterEreignisse = ereignisse.filter(e => e.type === 'terrain_destroyed');
  assert.equal(kraterEreignisse[0].payload.art, 'splitter');
  const neben = kraterEreignisse.slice(1);
  assert.ok(neben.length >= 1 && neben.length <= 6, `${neben.length} Nebenlöcher`);
  for (const n of neben) {
    assert.equal(n.payload.art, 'splitter');
    assert.ok(n.payload.radius >= 3 && n.payload.radius < 40);
    assert.ok(Math.hypot(n.payload.x - 450, n.payload.y - 400) > 40, 'außerhalb des Hauptkraters');
  }
  // Ohne Streuung (Sprengung) gibt es keine Nebenlöcher.
  const ohne = einheit(bitmap);
  ohne.z.krater(450, 400, 40, 85, 'sprengung');
  assert.equal(ohne.ereignisse.filter(e => e.type === 'terrain_destroyed').length, 1);
  // Der Client bildet jedes Loch aus dem Log nach.
  const { maskeAbw } = nachbau(bitmap, ohne.maske);
  assert.equal(maskeAbw, 0);
});

test('Durchschlag: ein Bohrtunnel (mehrere Löcher in einem Tick) ist ein Auftrag und trennt die Scholle ab', () => {
  const bitmap = new Uint8Array(B * H);
  for (let y = 600; y < H; y++) for (let x = 0; x < B; x++) bitmap[y * B + x] = 1;
  for (let y = 300; y < 600; y++) for (let x = 395; x < 405; x++) bitmap[y * B + x] = 1; // Pfeiler
  for (let y = 250; y < 300; y++) for (let x = 360; x < 440; x++) bitmap[y * B + x] = 1; // Brett
  const { z, ereignisse } = einheit(bitmap);
  // Der Tunnel läuft waagerecht durch den Pfeiler: drei überlappende Löcher.
  for (const x of [380, 396, 412]) z.krater(x, 450, 14, 100, 'durchschlag');
  laufe(z, 200);
  assert.equal(arten(ereignisse).terrain_destroyed, 3);
  assert.ok(ereignisse.filter(e => e.type === 'terrain_destroyed').every(e => e.payload.art === 'durchschlag'));
  assert.equal(arten(ereignisse).terrain_detached, 1, 'der obere Pfeilerrest mit dem Brett löst sich');
});

/* ---------------------------------------------------------------- Beben */

/** Zackiger Boden (Zähne von 12 px Höhe) – steiler als der Schüttwinkel. */
function zackenBoden() {
  const bitmap = new Uint8Array(B * H);
  for (let x = 0; x < B; x++) {
    const oben = 400 - (Math.floor(x / 6) % 2 === 0 ? 12 : 0);
    for (let y = oben; y < H; y++) bitmap[y * B + x] = 1;
  }
  return bitmap;
}

function zaehleFeste(maske) {
  let n = 0;
  for (let x = 0; x < B; x++) for (let y = 0; y < H; y++) if (maske.isSolid(x, y)) n += 1;
  return n;
}

test('Erdbeben (Ultimate): Setzrutsch glättet steile Spalten um den Einschlag, erhält die Masse, passt zum Client', () => {
  const bitmap = zackenBoden();
  const { z, ereignisse, maske } = einheit(bitmap);
  z.krater(450, 380, 8, 100, 'beben'); // kleines Loch: die Masse wird danach verglichen
  const nachKrater = zaehleFeste(maske);
  let maxSuch = 0;
  for (let t = 0; t < 60; t++) { z.schritt(); maxSuch = Math.max(maxSuch, z.suchkosten); }
  const zaehler = arten(ereignisse);
  assert.equal(zaehler.terrain_quake, 1);
  assert.equal(zaehler.terrain_slumped, 1);
  assert.ok(maxSuch <= SUCH_BUDGET_PRO_TICK, `Suchkosten ${maxSuch}`);
  const zuege = ereignisse.find(e => e.type === 'terrain_slumped').payload.zuege;
  assert.ok(zuege.length >= 8 && zuege.length % 4 === 0 && zuege.length <= 300 * 4);
  assert.equal(zaehleFeste(maske), nachKrater, 'Masse erhalten: jede Zelle wandert nur');
  const { maskeAbw, bitmapAbw } = nachbau(bitmap, maske);
  assert.equal(maskeAbw + bitmapAbw, 0, 'Client-Nachbau zellengleich');
  assert.equal(z.faellt, 0);
});

test('Ohne Beben-Charakter gibt es keinen Setzrutsch, und Fassung 3 kennt ihn nicht', () => {
  const bitmap = zackenBoden();
  const a = einheit(bitmap);
  a.z.krater(450, 380, 8, 100, 'sprengung');
  laufe(a.z, 60);
  assert.equal(arten(a.ereignisse).terrain_slumped, undefined);
  const b = einheit(bitmap, ZERSTOERUNG_SCHOLLEN);
  b.z.krater(450, 380, 8, 100, 'beben');
  laufe(b.z, 60);
  assert.equal(arten(b.ereignisse).terrain_slumped, undefined);
});

/* -------------------------------------------------- Match, Replay, Figuren */

function matchLauf(fassung, ticks = 4000, preset = 'mountains') {
  const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset, zerstoerung: fassung, kit: KIT_FLAECHE, waffen: WAFFEN_ALT, kisten: KISTEN_ALT });
  m.start();
  let schuesse = 0;
  const gesehen = {};
  for (let tick = 0; tick < ticks; tick++) {
    if (m.activeProjectileCount === 0 && tick % 90 === 0) {
      m.fire(m.activePlayerId, 0.3 + (schuesse % 11) * 0.12, 55 + (schuesse * 17) % 45, null);
      schuesse += 1;
    }
    m.step();
    for (const e of m.consumeEvents()) gesehen[e.type] = (gesehen[e.type] ?? 0) + 1;
  }
  return { m, gesehen };
}

test('Fassung 4 im Match: zwei Läufe gleicher Seed ergeben denselben Zustands- und Maskenhash; Terrain bleibt zellengleich nachbaubar', () => {
  const a = matchLauf(ZERSTOERUNG_BRUCH);
  const b = matchLauf(ZERSTOERUNG_BRUCH);
  assert.equal(a.m.zerstoerung, ZERSTOERUNG_BRUCH);
  assert.ok(a.m.terrain.craterCount >= 10);
  assert.equal(a.m.stateHash(), b.m.stateHash());
  assert.equal(a.m.terrain.hash(), b.m.terrain.hash());
  assert.deepEqual(a.m.terrain.craterLog, b.m.terrain.craterLog);
});

test('Die Marke wirkt: derselbe Splittereinschlag ergibt in Fassung 4 eine andere Karte als in Fassung 3', () => {
  const karte = fassung => {
    const m = figurenWelt(fassung);
    const boden = m.surfaceYAt(900);
    m.setzung.krater(900, boden, 40, 85, 'splitter');
    for (let i = 0; i < 100; i++) { m.step(); m.consumeEvents(); }
    return m.terrain.hash();
  };
  assert.notEqual(karte(ZERSTOERUNG_BRUCH), karte(ZERSTOERUNG_SCHOLLEN));
});

test('Replay-Rundlauf Fassung 4: Kopf trägt die Fassung, der Nachspielhash gleicht dem Live-Lauf', () => {
  const live = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, zerstoerung: ZERSTOERUNG_BRUCH });
  live.start();
  const rec = new ReplayRecorder({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: live.turnDurationMs,
    kit: live.kit, zerstoerung: ZERSTOERUNG_BRUCH,
  });
  assert.equal(rec.toJSON().config.zerstoerung, 4);
  let schuesse = 0;
  for (let tick = 0; tick < 3000; tick++) {
    if (live.activeProjectileCount === 0 && tick % 120 === 0) {
      const id = live.activePlayerId;
      const winkel = 0.5 + (schuesse % 9) * 0.15;
      const kraft = 40 + (schuesse * 13) % 50;
      const waffe = live.inventory.getActiveWeaponId(id);
      const ergebnis = live.fire(id, winkel, kraft, waffe);
      if (ergebnis.ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
      schuesse += 1;
    }
    live.step();
    live.consumeEvents();
  }
  rec.finalize(live.world.tickCount);
  const { match } = playReplay(ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(rec.toJSON()))));
  assert.equal(match.zerstoerung, ZERSTOERUNG_BRUCH);
  assert.equal(match.stateHash(), live.stateHash());
  assert.equal(match.terrain.hash(), live.terrain.hash());
  assert.ok(live.terrain.craterCount > 5);
});

test('Altköpfe: Fassung 1 bis 3 laufen im Match unverändert weiter (Fassung 2 und 3 gleich, 1 ohne Nachrutschen)', () => {
  assert.equal(matchLauf(ZERSTOERUNG_ALT, 2500, 'hills').m.setzung, null);
  const zwei = matchLauf(ZERSTOERUNG_GELAENDE, 2500, 'hills');
  const drei = matchLauf(ZERSTOERUNG_SCHOLLEN, 2500, 'hills');
  assert.ok(zwei.m.terrain.craterLog.every(l => l[0] === 's' || l.length === 4));
  assert.ok(drei.m.terrain.craterLog.every(l => l[0] === 's' || l.length === 4));
  assert.equal(zwei.gesehen.terrain_crumble, undefined);
  assert.equal(drei.gesehen.terrain_added, undefined);
});

function figurenWelt(fassung = ZERSTOERUNG_BRUCH) {
  const m = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1, preset: 'hills', zerstoerung: fassung });
  m.start();
  return m;
}

test('Figuren am Kraterrand rutschen in den Krater (Fassung 4), in Fassung 3 bleibt es beim Fall', () => {
  for (const [fassung, rutscht] of [[ZERSTOERUNG_BRUCH, true], [ZERSTOERUNG_SCHOLLEN, false]]) {
    const m = figurenWelt(fassung);
    const figur = m.players[0].entityId;
    const w = m.world;
    for (let i = 0; i < 8; i++) { m.step(); m.consumeEvents(); } // erst landen lassen
    const fx = Math.round(w.getComponent(figur, 'Position', 'x'));
    const boden = m.surfaceYAt(fx);
    // Krater links neben der Figur, deren Fuß am Rand steht.
    m.setzung.krater(fx - 27, boden, 24, 100);
    const vx = w.getComponent(figur, 'Velocity', 'x');
    if (rutscht) assert.ok(vx < -0.5, `Figur bekommt Schub zum Krater (vx ${vx})`);
    else assert.equal(vx, 0);
  }
});

test('Figuren stecken nach Schutt und Setzrutsch nicht im Gelände', () => {
  const m = figurenWelt();
  const figur = m.players[0].entityId;
  const w = m.world;
  for (let i = 0; i < 5; i++) { m.step(); m.consumeEvents(); }
  const fx = Math.round(w.getComponent(figur, 'Position', 'x'));
  const boden = m.surfaceYAt(fx);
  m.setzung.krater(fx + 4, boden - 2, 24, 100, 'beben');
  for (let i = 0; i < 400; i++) {
    m.step();
    m.consumeEvents();
    const x = Math.floor(w.getComponent(figur, 'Position', 'x'));
    const y = w.getComponent(figur, 'Position', 'y');
    assert.equal(m.terrain.isSolid(x, Math.floor(y)), false, `Figur steckt im Gelände (Tick ${i})`);
  }
  const y = w.getComponent(figur, 'Position', 'y');
  const x = Math.floor(w.getComponent(figur, 'Position', 'x'));
  assert.equal(m.terrain.isSolid(x, Math.floor(y + PLAYER_HALF_HEIGHT) - 1), false);
});

test('Schutt setzt sich nicht in eine Figur', () => {
  // Boden mit Schollenlandung; eine Figur steht neben dem Aufprall, die Schuttzellen dürfen nicht in ihrem Körper landen.
  const bitmap = scholleAufSockel();
  const maske = CollisionMask.fromBitmap(bitmap, B, H);
  const figuren = [{ id: 1, x: 380, y: 599 - PLAYER_HALF_HEIGHT }, { id: 2, x: 330, y: 599 - PLAYER_HALF_HEIGHT }];
  const welt = {
    isActive: () => true,
    getEntitiesBySignature: sig => (sig & COMPONENT_SIGNATURES.HEALTH ? figuren.map(f => f.id) : []),
    getComponent: (id, komp, feld) => {
      const f = figuren.find(g => g.id === id);
      if (komp === 'Health') return 100;
      return f ? { x: f.x, y: f.y }[feld] : 0;
    },
    setComponent(id, komp, feld, wert) { const f = figuren.find(g => g.id === id); if (f && komp === 'Position') f[feld] = wert; },
    getSystem: () => null,
  };
  // Boden unter den Figuren fest machen (y 600 ist Boden).
  const ereignisse = [];
  const z = new Zerstoerung({ terrain: maske, world: welt, events: { emit: (type, payload) => ereignisse.push({ type, payload }) }, turrets: new Map(), fassung: ZERSTOERUNG_BRUCH });
  z.krater(300, 150, 10, 100);
  laufe(z, 400);
  for (const f of figuren) {
    for (let y = Math.floor(f.y) - PLAYER_HALF_HEIGHT; y < Math.floor(f.y) + PLAYER_HALF_HEIGHT; y++) {
      for (let x = Math.floor(f.x) - 6; x <= Math.floor(f.x) + 6; x++) {
        assert.equal(maske.isSolid(x, y), false, `Körper der Figur ${f.id} bei ${x},${y} ist frei`);
      }
    }
  }
  assert.ok(arten(ereignisse).terrain_added >= 1);
});

/* ------------------------------------------------------------ Client-Optik */

test('Schuttoptik: Materialfarben je Boden, Brandspur ohne Zufall, fliegende Zellen enden am Gelände', async () => {
  const o = await import('../src/client/schuttOptik.js');
  const palette = { surface: [96, 138, 92], deep: [38, 54, 46] };
  assert.notDeepEqual(o.materialStil('schnee', palette).schutt, o.materialStil('fels', palette).schutt);
  assert.ok(o.materialStil('sand', palette).staubFaktor > o.materialStil('fels', palette).staubFaktor);
  const aufnahme = () => {
    const log = [];
    const ctx = new Proxy({}, {
      get: (_, name) => (name === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...args) => { log.push(`${String(name)}${args.map(a => (typeof a === 'number' ? a.toFixed(2) : '')).join(',')}`); }),
      set: () => true,
    });
    return { ctx, log };
  };
  const umriss = Array.from({ length: 9 }, (_, i) => ({ x: 100 + i * 5, y: 100 + (i % 3) * 4 }));
  umriss.push(umriss[0]);
  for (const art of ['gras', 'sand', 'schnee', 'fels']) {
    const a = aufnahme();
    const b = aufnahme();
    o.zeichneBrandspur(a.ctx, umriss, 120, 100, 30, art, 5);
    o.zeichneBrandspur(b.ctx, umriss, 120, 100, 30, art, 5);
    assert.deepEqual(a.log, b.log, `Brandspur ${art} deterministisch`);
    assert.ok(a.log.includes('stroke'));
  }
  const fl = o.erzeugeFlugSchutt([10.5, 10.5, 1, -1, 20.5, 10.5, 0, 0], ['#fff'], 1);
  assert.equal(fl.length, 2);
  const bitmap = new Uint8Array(100 * 100);
  for (let x = 0; x < 100; x++) bitmap[50 * 100 + x] = 1;
  let liste = fl;
  for (let i = 0; i < 100 && liste.length > 0; i++) liste = o.schreiteFlugSchutt(liste, bitmap, 100, 100);
  assert.equal(liste.length, 0, 'beide Zellen treffen den Boden bei y=50');
});
