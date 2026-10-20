/**
 * Tests: Cookie, der Kater des Weltuntergangs (`config.cookie`, Fassung 2).
 *
 * Zusagen: Hunger wächst deterministisch; die Miau-Stufen steigen mit dem Hunger und
 * ihre Lautstärke zeigt die Dringlichkeit; Füttern, Futternapf und Kuscheln wirken;
 * Verhungern führt zum Toben (Gelände, Kisten, Figuren); „Spielen" ist extrem selten
 * und löst eine Schockwelle aus; ohne Marke im Replay-Kopf gibt es keinen Cookie.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { CookieSystem } from '../src/engine/systems/cookieSystem.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { SeededRandom } from '../src/shared/prng.js';
import {
  COOKIE_ALT, COOKIE_KATER, COOKIE_FEINSCHLIFF, COOKIE_STANDARD, COOKIE_HUNGER, COOKIE_PFLEGE, COOKIE_WUT, COOKIE_SPIELEN,
  COOKIE_POSEN, normalisiereCookie, cookieStufe,
} from '../src/shared/config/cookie.js';
import { GUENTHER_ALT } from '../src/shared/config/guenther.js';
import { encodeSnapshot, decodeSnapshot, COOKIE_STRIDE, ANZEIGE_EREIGNISARTEN } from '../src/shared/protocol.js';

function welt(spieler) {
  const daten = new Map(spieler.map(s => [s.id, { x: s.x, y: s.y }]));
  return {
    isActive: id => daten.has(id),
    getComponent: (id, _k, feld) => daten.get(id)?.[feld],
    setPos: (id, x, y) => daten.set(id, { x, y }),
  };
}

function kontext(ids, extra = {}) {
  const log = { heile: [], stosse: [], krater: [], schaden: [], objekte: 0, eaten: [], kisten: [], nichtToedlich: [], events: [] };
  const ctx = {
    aktiverSpieler: ids[0] ?? null,
    spielerIds: ids,
    surfaceYAt: () => 100,
    melde: (typ, d) => log.events.push([typ, d]),
    kisten: () => log.kisten,
    kisteVerzehren: (id) => { log.eaten.push(id); log.kisten = log.kisten.filter(k => k.id !== id); },
    heile: (id, b) => log.heile.push([id, b]),
    stosse: (id, vx, vy) => log.stosse.push([id, vx, vy]),
    krater: (...a) => log.krater.push(a),
    schaden: (id, b) => log.schaden.push([id, b]),
    schadenNichtToedlich: (id, b) => { log.nichtToedlich.push([id, b]); return b; },
    zerstoereObjekte: () => { log.objekte += 1; return 1; },
    ...extra,
  };
  return { ctx, log };
}

function neuerCookie(seed = 3) {
  return new CookieSystem({ rng: new SeededRandom(seed), width: 1280, height: 720 });
}

const arten = (log, typ) => log.events.filter(e => e[0] === typ).map(e => e[1]);

/** Lässt Cookie schlafen, bis der Hunger `ziel` erreicht (Spieler weit weg). */
function bisHunger(c, w, ctx, ziel, grenze = 40_000) {
  let i = 0;
  while (c.hunger < ziel && i++ < grenze) c.update(w, ctx);
  return i;
}

test('Fassungen: neue Partien sind Fassung 3, 2 bleibt Fassung 2, fehlend oder unbekannt ist Fassung 1', () => {
  assert.equal(COOKIE_STANDARD, COOKIE_FEINSCHLIFF);
  assert.equal(COOKIE_FEINSCHLIFF, 3);
  assert.equal(normalisiereCookie(3), COOKIE_FEINSCHLIFF);
  assert.equal(normalisiereCookie(2), COOKIE_KATER);
  assert.equal(normalisiereCookie(1), COOKIE_ALT);
  assert.equal(normalisiereCookie(undefined), COOKIE_ALT);
  assert.equal(normalisiereCookie('x'), COOKIE_ALT);
});

test('Stufen: schlaf < leise < laut < wut an den Schwellen', () => {
  const s = COOKIE_HUNGER.stufen;
  assert.equal(cookieStufe(0), 'schlaf');
  assert.equal(cookieStufe(s.leise - 0.1), 'schlaf');
  assert.equal(cookieStufe(s.leise), 'leise');
  assert.equal(cookieStufe(s.laut), 'laut');
  assert.equal(cookieStufe(s.wut), 'wut');
  assert.equal(cookieStufe(100), 'wut');
  assert.ok(COOKIE_HUNGER.pegel.leise < COOKIE_HUNGER.pegel.laut && COOKIE_HUNGER.pegel.laut < COOKIE_HUNGER.pegel.wut);
  assert.ok(COOKIE_HUNGER.rufTakt.leise > COOKIE_HUNGER.rufTakt.laut && COOKIE_HUNGER.rufTakt.laut > COOKIE_HUNGER.rufTakt.wut,
    'je dringender, desto öfter');
});

test('Posen: alle 14 Sprites sind benannt und passen in die fünf Flag-Bits', () => {
  assert.deepEqual([...COOKIE_POSEN].sort(), [
    'brot', 'fressen', 'gehen', 'hungerwut', 'kuscheln', 'liegen', 'miau_laut', 'miau_leise',
    'putzen', 'schlafen', 'schlafen_seite', 'sitzen', 'spielen', 'strecken',
  ]);
  assert.ok(COOKIE_POSEN.length < 32);
});

test('Er schläft zuerst; der Hunger wächst deterministisch (im Schlaf langsamer)', () => {
  const a = neuerCookie(5);
  const b = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx } = kontext([1], { aktiverSpieler: null });
  assert.ok(['schlafen', 'schlafen_seite'].includes(a.pose) || a.pose === 'schlafen');
  const h0 = a.hunger;
  for (let i = 0; i < 600; i++) { a.update(w, ctx); b.update(w, kontext([1], { aktiverSpieler: null }).ctx); }
  assert.ok(a.hunger > h0);
  assert.equal(a.hunger, b.hunger, 'gleicher Seed, gleicher Hunger');
  const erwartet = h0 + COOKIE_HUNGER.proTick * COOKIE_HUNGER.schlafFaktor * 600;
  assert.ok(Math.abs(a.hunger - erwartet) < 0.01, `${a.hunger} ≈ ${erwartet}`);
  assert.ok(['schlafen', 'schlafen_seite'].includes(a.snapshot().pose));
});

test('Miauen: die Stufen folgen dem Hunger, die Lautstärke wächst, Posen miau_leise/miau_laut', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  const posen = new Set();
  const stufen = [];
  for (let i = 0; i < 60_000 && !c.tobt; i++) {
    c.update(w, ctx);
    posen.add(c.pose);
    const letzte = arten(log, 'cookie_miau').at(-1);
    if (letzte && stufen.at(-1) !== letzte.stufe) stufen.push(letzte.stufe);
  }
  assert.deepEqual(stufen, ['leise', 'laut', 'wut']);
  const rufe = arten(log, 'cookie_miau');
  const pegel = stufe => rufe.find(r => r.stufe === stufe).pegel;
  assert.ok(pegel('leise') < pegel('laut') && pegel('laut') < pegel('wut'), 'Lautstärke = Dringlichkeit');
  for (const r of rufe) assert.equal(cookieStufe(r.hunger), r.stufe);
  for (const p of ['strecken', 'miau_leise', 'miau_laut', 'hungerwut']) assert.ok(posen.has(p), `Pose ${p}`);
  const abstand = (stufe) => {
    const t = log.events.map((e, i) => [e, i]).filter(([e]) => e[0] === 'cookie_miau' && e[1].stufe === stufe).map(([, i]) => i);
    return t.length;
  };
  assert.ok(abstand('wut') >= 1);
});

test('Füttern im Laufen: Hunger sinkt, er frisst, putzt sich, der Spieler wird etwas geheilt', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1]);
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.laut + 2);
  const vorher = c.hunger;
  const p = c.position;
  w.setPos(1, p.x - 60, p.y); c.update(w, ctx);
  w.setPos(1, p.x - 20, p.y); c.update(w, ctx); // in Bewegung und in Reichweite
  assert.ok(c.hunger <= vorher - COOKIE_PFLEGE.fuetternHunger + 1, `Hunger ${vorher} -> ${c.hunger}`);
  assert.equal(c.pose, 'fressen');
  assert.deepEqual(log.heile.at(-1), [1, COOKIE_PFLEGE.fuetternHeilung]);
  assert.equal(arten(log, 'cookie_gefuettert')[0].wie, 'hand');
  for (let i = 0; i < COOKIE_PFLEGE.fressenTicks + 5; i++) c.update(w, ctx);
  assert.equal(c.pose, 'putzen');
});

test('Füttern verlangt Bewegung: wer nur steht, füttert nicht', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1]);
  const p = c.position;
  w.setPos(1, p.x - 30, p.y);
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.leise + 2);
  for (let i = 0; i < 5; i++) c.update(w, ctx);
  assert.equal(arten(log, 'cookie_gefuettert').length, 0);
});

test('Futternapf: eine liegende Kiste in der Nähe wird gefressen, satte Katze lässt sie liegen', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  c.update(w, ctx); // erst jetzt steht er auf dem Boden
  const p = c.position;
  log.kisten = [{ id: 9, x: p.x + 20, y: p.y - 10 }];
  c.update(w, ctx);
  assert.deepEqual(log.eaten, [], 'satt: lässt die Kiste liegen');
  // Sobald der Hunger die Schwelle erreicht, frisst er die Kiste.
  for (let i = 0; i < 40_000 && log.eaten.length === 0; i++) c.update(w, ctx);
  assert.deepEqual(log.eaten, [9]);
  assert.ok(c.hunger < COOKIE_HUNGER.stufen.leise + 1 - COOKIE_PFLEGE.napfHunger + 5, 'der Napf sättigt');
  assert.equal(arten(log, 'cookie_gefuettert')[0].wie, 'napf');
  assert.equal(c.pose, 'brot');
});

test('Bei „laut" geht er zu einer Kiste in der Nähe (Pose gehen) und frisst sie', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.laut + 1);
  const p = c.position;
  log.kisten = [{ id: 4, x: p.x + 200, y: p.y - 10 }];
  let ging = false;
  for (let i = 0; i < 3000 && log.eaten.length === 0; i++) { c.update(w, ctx); if (c.pose === 'gehen') ging = true; }
  assert.ok(ging, 'er ist hingegangen');
  assert.deepEqual(log.eaten, [4]);
});

test('Kuscheln: still danebenstehen belohnt (Heilung, weniger Hunger), mit Sperre je Spieler', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.leise - 5);
  const p = c.position;
  w.setPos(1, p.x - 30, p.y);
  const vorher = c.hunger;
  for (let i = 0; i < COOKIE_PFLEGE.kuschelnStillTicks + 3; i++) c.update(w, ctx);
  assert.equal(arten(log, 'cookie_kuschelt').length, 1);
  assert.deepEqual(log.heile.at(-1), [1, COOKIE_PFLEGE.kuschelnHeilung]);
  assert.ok(c.hunger < vorher);
  assert.equal(c.pose, 'kuscheln');
  for (let i = 0; i < 600; i++) c.update(w, ctx);
  assert.equal(arten(log, 'cookie_kuschelt').length, 1, 'Sperre: nicht gleich wieder');
});

test('Toben: ungefüttert tobt er — Gelände, Kisten, Figuren; Pose hungerwut', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.wut + 1);
  for (let i = 0; i < 30; i++) c.update(w, ctx);
  assert.ok(c.tobt);
  assert.equal(c.pose, 'hungerwut');
  assert.equal(arten(log, 'cookie_tobt').length, 1);
  assert.ok(log.krater.length >= 2, 'reißt Löcher');
  assert.equal(log.krater[0][2], COOKIE_WUT.kraterRadius);
  assert.ok(log.objekte >= 2, 'zerstört Objekte');
  // Eine Figur in der Nähe wird getroffen — einmal je Sperrzeit.
  const p = c.position;
  w.setPos(1, p.x + 10, p.y);
  c.update(w, ctx);
  c.update(w, ctx);
  assert.equal(log.schaden.length, 1);
  assert.equal(log.schaden[0][1], COOKIE_WUT.schlagSchaden);
  assert.equal(log.stosse.length, 1);
  for (let i = 0; i < COOKIE_WUT.schlagSperre + 5; i++) { w.setPos(1, c.position.x + 5, c.position.y); c.update(w, ctx); }
  assert.ok(log.schaden.length >= 2, 'nach der Sperre wieder');
});

test('Toben endet, wenn er gefüttert wird', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx } = kontext([1]);
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.wut + 1);
  for (let i = 0; i < 20; i++) c.update(w, ctx);
  assert.ok(c.tobt);
  const p = c.position;
  w.setPos(1, p.x - 60, p.y); c.update(w, ctx);
  w.setPos(1, p.x - 5, p.y); c.update(w, ctx);
  c.update(w, ctx);
  assert.equal(c.tobt, false);
  assert.ok(c.hunger < COOKIE_HUNGER.stufen.wut);
  assert.notEqual(c.pose, 'hungerwut');
});

test('Toben bricht nach der Höchstdauer erschöpft ab', () => {
  const c = neuerCookie(5);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext([1], { aktiverSpieler: null });
  bisHunger(c, w, ctx, COOKIE_HUNGER.stufen.wut + 1);
  for (let i = 0; i < COOKIE_WUT.maxTicks + 5; i++) c.update(w, ctx);
  assert.equal(arten(log, 'cookie_erschoepft').length, 1);
  assert.equal(c.tobt, false);
  assert.equal(c.pose, 'liegen');
  assert.ok(c.hunger <= COOKIE_WUT.erschoepftHunger + 5, `Hunger nach der Erschöpfung: ${c.hunger}`);
});

test('Spielen: extrem selten (Würfel je Runde), dann Schockwelle — nie tödlich, Krater-Ringe, Pose spielen', () => {
  assert.ok(COOKIE_SPIELEN.chanceProRunde <= 0.01, 'extrem selten');
  let gespielt = 0;
  const runden = 4000;
  const c = neuerCookie(11);
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx } = kontext([1], { aktiverSpieler: null });
  for (let r = 1; r <= runden; r++) {
    c.setRunde(r);
    if (c.snapshot().gespielt > gespielt) gespielt = c.snapshot().gespielt;
    c.update(w, ctx);
  }
  assert.ok(gespielt > 5 && gespielt < runden * 0.03, `Spielen ${gespielt} von ${runden} Runden`);

  const d = neuerCookie(3);
  const p = d.position;
  const w2 = welt([{ id: 1, x: p.x + 100, y: p.y }, { id: 2, x: p.x + 5000, y: p.y }]);
  const { ctx: ctx2, log } = kontext([1, 2], { aktiverSpieler: null });
  d.erzwingeSpielen();
  for (let i = 0; i < COOKIE_SPIELEN.ticks + 2; i++) { d.update(w2, ctx2); if (i === 5) assert.equal(d.pose, 'spielen'); }
  const welle = arten(log, 'cookie_schockwelle');
  assert.equal(welle.length, 1);
  assert.equal(welle[0].getroffen, 1, 'nur wer im Umkreis steht');
  assert.deepEqual(log.nichtToedlich.map(n => n[0]), [1]);
  assert.ok(log.nichtToedlich[0][1] >= COOKIE_SPIELEN.schadenMin && log.nichtToedlich[0][1] <= COOKIE_SPIELEN.schadenMax);
  assert.ok(log.krater.length >= 3, 'mehrere Krater');
  assert.ok(log.stosse.length === 1 && log.stosse[0][0] === 1);
  assert.equal(arten(log, 'cookie_spielt').length, 1);
});

test('Im Match: Cookie liegt auf der Karte, wirkt auf Figuren und Gelände, ist deterministisch', () => {
  const opt = { seed: 7, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, guenther: 2, cookie: COOKIE_KATER };
  const lauf = () => {
    const m = new MatchController(opt);
    m.start();
    const typen = {};
    for (let i = 0; i < 60 * 150; i++) {
      m.step();
      for (const e of m.consumeEvents()) typen[e.type] = (typen[e.type] ?? 0) + 1;
    }
    return { typen, hash: m.stateHash(), terrain: m.terrain.hash(), cookie: m.getState().cookie };
  };
  const a = lauf();
  const b = lauf();
  assert.equal(a.hash, b.hash);
  assert.equal(a.terrain, b.terrain);
  assert.deepEqual(a.typen, b.typen);
  assert.ok(a.cookie.aktiv && a.cookie.x > 0 && a.cookie.y > 0);
  assert.ok(COOKIE_POSEN.includes(a.cookie.pose));
  assert.ok(a.typen.cookie_miau > 5, 'er meldet sich');
  const ereignis = (a.typen.cookie_tobt ?? 0) + (a.typen.cookie_gefuettert ?? 0) + (a.typen.cookie_kuschelt ?? 0);
  assert.ok(ereignis >= 1, 'in zweieinhalb Minuten wird er gefüttert, gekuschelt oder er tobt');
  assert.ok(ANZEIGE_EREIGNISARTEN.includes('cookie_miau'));
  for (const typ of Object.keys(a.typen).filter(t => t.startsWith('cookie_') || t.startsWith('guenther_'))) {
    assert.ok(ANZEIGE_EREIGNISARTEN.includes(typ), `${typ} ist als Anzeigeereignis eingetragen`);
  }
});

test('Altkopf ohne `cookie`: kein Cookie im Zustand, Wiedergabe gleicht der Live-Partie', () => {
  const live = new MatchController({ seed: 17, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 });
  live.start();
  for (let t = 0; t < 3000; t++) { live.step(); live.consumeEvents(); }
  assert.equal(live.cookie, COOKIE_ALT);
  assert.equal('cookie' in live.getState(), false);
  const aufnahme = new ReplayRecorder({ seed: 17, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 });
  aufnahme.finalize(live.world.tickCount);
  const json = JSON.parse(aufnahme.serialize());
  delete json.config.cookie; delete json.config.guenther;
  const { match } = playReplay(ReplayRecorder.fromJSON(json));
  assert.equal(match.guenther, GUENTHER_ALT);
  assert.equal(match.cookie, COOKIE_ALT);
  assert.equal(match.stateHash(), live.stateHash());
});

test('Protokoll: der Cookie-Block reist hinter den Haufen; ohne Cookie bleibt die Größe wie vorher', () => {
  const basis = { tick: 5, round: 1, wind: 0, activePlayerId: 0, entities: [], projectiles: [], crates: [], turrets: [], guenther: { aktiv: false, x: 0, y: 0, richtung: 1, haufen: [{ x: 3, y: 4 }] } };
  const ohne = encodeSnapshot(basis);
  const mit = encodeSnapshot({ ...basis, cookie: { aktiv: true, x: 321.5, y: 400, richtung: -1, pose: 'miau_laut', hunger: 73.4 } });
  assert.equal(mit.length, ohne.length + COOKIE_STRIDE);
  assert.equal('cookie' in decodeSnapshot(ohne), false);
  const d = decodeSnapshot(mit);
  assert.equal(d.cookie.pose, 'miau_laut');
  assert.equal(d.cookie.hunger, 73);
  assert.equal(d.cookie.richtung, -1);
  assert.equal(d.cookie.aktiv, true);
  assert.ok(Math.abs(d.cookie.x - 321.5) < 0.2);
  assert.equal(d.guenther.haufen.length, 1, 'Haufen bleiben lesbar');
  for (const pose of COOKIE_POSEN) {
    assert.equal(decodeSnapshot(encodeSnapshot({ ...basis, cookie: { aktiv: true, x: 1, y: 1, richtung: 1, pose, hunger: 0 } })).cookie.pose, pose);
  }
});
