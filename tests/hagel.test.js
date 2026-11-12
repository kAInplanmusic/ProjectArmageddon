/**
 * Tests: Hagelfassung (`config.hagel`, HAGEL-1).
 *
 * Die Zusagen:
 *  1. Gleicher Seed → gleiche Lagen, gleiche Körner, gleicher Hash; anderer Seed → andere Folge.
 *  2. Jedes Korn braucht mindestens 1,0 s (60 Takte) vom Himmel zum Ziel; die Körner sind selten (Abstand 2,5 bis 5,5 s).
 *  3. Nur unter freiem Himmel: kein Treffer in Höhlen, Kammern, unter Überhängen (Strahltest gegen die Maske); freie Gegenprobe trifft.
 *  4. Schaden 1 bis 2 LP, nie unter 1 LP, kein Terrainschaden (die Maske wird nur gelesen).
 *  5. Fassung 1 (und ein Kopf OHNE das Feld) ist bitgleich zum Stand vor der Fassung: Goldwerte aus dem Stand davor.
 *  6. Replay: der Kopf trägt die Fassung, die Wiedergabe endet im Live-Hash; ein alter Kopf ohne Feld läuft als Fassung 1.
 *  7. Draht und Ereigniskatalog: Hagelereignisse sind Zustandsarten; der binäre Snapshot wächst nicht.
 *  8. Client: die Anzeige bindet den Hagel an die Engine (Menüwahl zählt in Fassung 2 nicht), Fassung 1 bleibt unberührt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { HagelSystem } from '../src/engine/hagel.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { HAGEL, HAGEL_ALT, HAGEL_KOERNER, HAGEL_STANDARD, normalisiereHagel } from '../src/shared/config/hagel.js';
import { EREIGNIS_KATALOG } from '../src/shared/ereigniskatalog.js';
import { ZUSTANDSEREIGNISARTEN, encodeSnapshot } from '../src/shared/protocol.js';
import { EREIGNIS_WIRKUNGEN } from '../src/client/ereignisse.js';
import { HagelAnzeige, bindeHagelZiel } from '../src/client/hagelAnzeige.js';
import { zielAus } from '../src/client/wetterZustand.js';
import { wetterMit } from '../src/client/stimmung.js';
import * as waffen from '../src/shared/config/waffen-fassung.js';
import * as zerstoerung from '../src/shared/config/zerstoerung.js';
import * as kisten from '../src/shared/config/kisten.js';
import * as loadouts from '../src/shared/config/loadouts.js';
import * as schaden from '../src/shared/config/schaden.js';
import * as guenther from '../src/shared/config/guenther.js';
import * as cookie from '../src/shared/config/cookie.js';
import * as feuer from '../src/shared/config/feuer.js';
import * as bewegung from '../src/shared/config/bewegung.js';
import * as zugregeln from '../src/shared/config/zugregeln.js';
import * as klassen from '../src/shared/config/klassen-fassung.js';
import * as bodenobjekte from '../src/shared/config/bodenobjekte.js';
import * as seil from '../src/shared/config/seil.js';
import * as wind from '../src/shared/config/wind.js';
import { zeichneHagelKoerner } from '../src/client/hagelAnzeige.js';
import { starteServer, erstelleLobby, trittBei } from './helfer/server-testclient.js';

// ---------------------------------------------------------------------------------------------------------------
// Attrappe: ein Motor-Ersatz, an dem das System allein läuft (Gelände, Figuren und Schadensweg sind frei wählbar)
// ---------------------------------------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {(x:number,y:number)=>boolean} [o.fest] Maske (Vorgabe: Boden ab y=800)
 * @param {{id:number,x:number,y:number,hp:number}[]} [o.figuren]
 */
function attrappe(seed, { fest = (x, y) => y >= 800, figuren = [{ id: 1, x: 500, y: 790, hp: 50 }], breite = 1000, hoehe = 1000 } = {}) {
  const sm = new MatchSeedManager(seed);
  const log = [];
  const leben = new Map(figuren.map(f => [f.id, f.hp]));
  const schadensLog = [];
  const welt = {
    tickCount: 0,
    getEntitiesBySignature: () => figuren.map(f => f.id),
    isActive: () => true,
    getComponent: (id, bauteil, feld) => {
      const f = figuren.find(g => g.id === id);
      if (bauteil === 'Position') return feld === 'x' ? f.x : f.y;
      if (bauteil === 'Health') return feld === 'current' ? leben.get(id) : 100;
      return undefined;
    },
    setComponent: (id, bauteil, feld, wert) => { if (bauteil === 'Health') leben.set(id, wert); },
    getSystem: () => ({
      applyDamage: (_w, id, betrag, urheber, opt) => {
        schadensLog.push({ id, betrag, urheber, art: opt?.damageType });
        leben.set(id, Math.round((leben.get(id) - betrag) * 1000) / 1000);
      },
    }),
  };
  // Das Gelände darf nur gelesen werden: jede andere Eigenschaft wäre Terrainschaden.
  const gelaende = new Proxy({}, { get: (_, p) => { if (p === 'isSolid') return fest; throw new Error(`Gelände angefasst: ${String(p)}`); } });
  const match = {
    world: welt, terrain: gelaende, width: breite, height: hoehe,
    events: { emit: (typ, nutzlast) => log.push({ tick: welt.tickCount, typ, ...nutzlast }) },
    isPlayerAlive: () => true,
  };
  const sys = new HagelSystem(match, { lage: sm.getSubRng('HAGEL'), korn: sm.getSubRng('HAGEL_KORN') });
  return { sys, welt, log, leben, schadensLog };
}

function laufe(a, takte) {
  for (let t = 1; t <= takte; t += 1) { a.welt.tickCount = t; a.sys.update(); }
}

const LANG = HAGEL.lageTakte * 40; // 40 Scheiben = 50 Minuten Spielzeit

test('Fassungen: Standard ist Fassung 2, Unbekanntes fällt auf den Standard, Mindestflugzeit und Schaden sind festgehalten', () => {
  assert.equal(HAGEL_STANDARD, HAGEL_KOERNER);
  assert.equal(normalisiereHagel(HAGEL_ALT), HAGEL_ALT);
  assert.equal(normalisiereHagel(HAGEL_KOERNER), HAGEL_KOERNER);
  assert.equal(normalisiereHagel(undefined), HAGEL_STANDARD);
  assert.equal(normalisiereHagel(9), HAGEL_STANDARD);
  assert.ok(HAGEL.fallMin >= HAGEL.minFall && HAGEL.minFall >= 60, 'ein Korn fällt mindestens 1,0 s');
  assert.ok(HAGEL.schadenMin >= 1 && HAGEL.schadenMax <= 2, 'leichter Schaden: 1 bis 2 LP');
  assert.equal(HAGEL.nieToedlich, true);
  assert.ok(HAGEL.startMax + HAGEL.dauerMax <= HAGEL.lageTakte, 'eine Lage bleibt in ihrer Scheibe');
});

test('Determinismus: gleicher Seed → gleiche Lagen, Körner und Treffer; anderer Seed → andere Folge', () => {
  const lauf = seed => { const a = attrappe(seed, { figuren: [{ id: 1, x: 300, y: 790, hp: 9999 }, { id: 2, x: 700, y: 790, hp: 9999 }] }); laufe(a, LANG); return a; };
  const a = lauf(4242);
  const b = lauf(4242);
  const c = lauf(4243);
  assert.ok(a.log.some(e => e.typ === 'hail_start'), 'in 40 Scheiben fällt Hagel');
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.leben, b.leben);
  assert.notDeepEqual(a.log, c.log);
});

test('Lagen: Hagel in grob jeder fünften Scheibe, Beginn und Ende sind gepaart und liegen in der Scheibe', () => {
  const a = attrappe(11);
  laufe(a, HAGEL.lageTakte * 400);
  const starts = a.log.filter(e => e.typ === 'hail_start');
  const enden = a.log.filter(e => e.typ === 'hail_ende');
  assert.ok(Math.abs(starts.length / 400 - HAGEL.anteilLagen) < 0.06, `Anteil ${starts.length / 400}`);
  assert.ok(Math.abs(starts.length - enden.length) <= 1);
  starts.forEach((s, i) => {
    const scheibe = Math.floor(s.tick / HAGEL.lageTakte);
    if (enden[i]) {
      assert.equal(Math.floor((enden[i].tick - 1) / HAGEL.lageTakte), scheibe, 'Ende in derselben Scheibe');
      const dauer = enden[i].tick - s.tick;
      assert.ok(dauer >= 1 && dauer <= HAGEL.dauerMax);
    }
  });
});

test('Sichtbare Flugzeit und Seltenheit: Aufschlag mindestens 60 Takte nach dem Start, Abstand 2,5 bis 5,5 s, nur innerhalb einer Lage', () => {
  const a = attrappe(5, { figuren: [] });
  laufe(a, LANG);
  const koerner = a.log.filter(e => e.typ === 'hail_korn');
  const aufpralle = new Map(a.log.filter(e => e.typ === 'hail_aufprall').map(e => [e.id, e]));
  assert.ok(koerner.length > 30);
  for (const k of koerner) {
    assert.ok(k.fall >= 60, `Flugzeit ${k.fall} Takte`);
    assert.equal(aufpralle.get(k.id).tick - k.tick, k.fall, 'Aufschlag genau nach der gemeldeten Flugzeit');
    assert.ok(k.x >= 0 && k.x <= 1000);
  }
  // Abstand zweier Körner innerhalb einer Lage.
  let letzte = null;
  for (const e of a.log) {
    if (e.typ === 'hail_start') letzte = null;
    if (e.typ !== 'hail_korn') continue;
    if (letzte !== null) {
      const d = e.tick - letzte;
      assert.ok(d >= HAGEL.abstandMin && d <= HAGEL.abstandMax, `Abstand ${d}`);
    }
    letzte = e.tick;
  }
  // Mittlere Rate je Lage: etwa ein Korn alle 4 s.
  const lagenSek = a.log.filter(e => e.typ === 'hail_ende').reduce((s, e, i) => s + (e.tick - a.log.filter(x => x.typ === 'hail_start')[i].tick), 0) / 60;
  assert.ok(lagenSek > 0);
  const proSekunde = koerner.length / lagenSek;
  assert.ok(proSekunde > 1 / 6 && proSekunde < 1 / 3, `${proSekunde.toFixed(3)} Körner/s`);
});

test('Nur unter freiem Himmel: Höhle, Kammer und Überhang schützen; die freie Gegenprobe wird getroffen', () => {
  // Eine Figur auf dem Boden unter einem Dach (y < 200 ist fest), eine daneben unter freiem Himmel an einer Stelle ohne Dach.
  const mitDach = (x, y) => y >= 800 || (x < 600 && y < 200);
  const a = attrappe(4242, { fest: mitDach, figuren: [{ id: 1, x: 300, y: 790, hp: 99999 }, { id: 2, x: 800, y: 790, hp: 99999 }] });
  laufe(a, LANG);
  const treffer = a.log.filter(e => e.typ === 'hail_hit');
  assert.ok(treffer.length > 5, 'die freie Figur wird getroffen');
  assert.ok(treffer.every(e => e.entityId === 2), 'unter dem Dach trifft nie ein Korn');
  assert.equal(a.schadensLog.filter(s => s.id === 1).length, 0);
  // Ein Überhang nur über dem Kopf (Strahl geht von hier nach oben): Boden fest, Dach direkt über der Figur.
  const ueberhang = (x, y) => y >= 800 || (x >= 280 && x <= 320 && y >= 700 && y < 720);
  const b = attrappe(4242, { fest: ueberhang, figuren: [{ id: 1, x: 300, y: 790, hp: 99999 }] });
  laufe(b, LANG);
  assert.equal(b.log.filter(e => e.typ === 'hail_hit').length, 0, 'Überhang schützt');
  // Ganze Kammer: alles außer einem Hohlraum ist fest.
  const kammer = (x, y) => !(x > 100 && x < 900 && y > 400 && y < 790);
  const c = attrappe(4242, { fest: kammer, figuren: [{ id: 1, x: 500, y: 790, hp: 99999 }] });
  laufe(c, LANG);
  assert.equal(c.log.filter(e => e.typ === 'hail_hit').length, 0, 'Kammer schützt');
  assert.ok(c.log.some(e => e.typ === 'hail_korn'), 'es fällt trotzdem Hagel, er trifft nur nichts');
});

test('Schaden: 1 bis 2 LP über den gewöhnlichen Weg (ohne Urheber, Art physisch); nie unter 1 LP; kein Terrainschaden', () => {
  const a = attrappe(4242, { figuren: [{ id: 1, x: 500, y: 790, hp: 40 }, { id: 2, x: 520, y: 790, hp: 1 }, { id: 3, x: 540, y: 790, hp: 1.5 }] });
  laufe(a, LANG); // die Attrappe wirft bei jedem Zugriff auf die Maske außer `isSolid` → Terrainschaden wäre ein Fehler
  const s = a.schadensLog;
  assert.ok(s.length > 5);
  for (const e of s) {
    assert.ok(e.betrag >= 1 - 1e-9 && e.betrag <= 2 + 1e-9 || e.id === 3, `Betrag ${e.betrag}`);
    assert.equal(e.urheber, null, 'Wetter hat keinen Urheber');
    assert.equal(e.art, 'physical');
  }
  assert.ok(a.leben.get(1) >= 1 && a.leben.get(2) >= 1 && a.leben.get(3) >= 1, 'nie unter 1 LP');
  assert.equal(a.leben.get(2), 1, 'bei 1 LP gibt es keinen Schaden');
  assert.equal(a.schadensLog.filter(e => e.id === 2).length, 0);
  const hits = a.log.filter(e => e.typ === 'hail_hit');
  assert.ok(hits.some(e => e.entityId === 2 && e.damage === 0), 'ein Treffer bei 1 LP wird gemeldet (Schaden 0)');
  assert.ok(hits.filter(e => e.entityId === 1).every(e => e.damage === 1 || e.damage === 2));
});

// ---------------------------------------------------------------------------------------------------------------
// Der echte Motor
// ---------------------------------------------------------------------------------------------------------------

const STANDARD_FASSUNGEN = {
  waffen: waffen.WAFFEN_STANDARD, zerstoerung: zerstoerung.ZERSTOERUNG_STANDARD, kisten: kisten.KISTEN_STANDARD, kit: loadouts.KIT_STANDARD,
  schaden: schaden.SCHADEN_STANDARD, guenther: guenther.GUENTHER_FASSUNG_STANDARD, cookie: cookie.COOKIE_STANDARD, feuer: feuer.FEUER_STANDARD,
  bewegung: bewegung.BEWEGUNG_STANDARD, zugregeln: zugregeln.ZUGREGELN_STANDARD, klassen: klassen.KLASSEN_STANDARD,
  bodenobjekte: bodenobjekte.BODENOBJEKTE_STANDARD, seil: seil.SEIL_STANDARD, wind: wind.WIND_STANDARD,
};

/** Spielt `takte` Takte mit gleichmäßigen Schüssen; liefert Endhash, Hagel-Ereignisse und Lebenspunkte. */
function spiele(seed, extra = {}, takte = 30000) {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 50, turnDurationMs: 1e9, ...STANDARD_FASSUNGEN, ...extra });
  m.start();
  const hagel = [];
  let schuesse = 0;
  for (let t = 0; t < takte; t += 1) {
    if (m.activeProjectileCount === 0 && t % 150 === 0) {
      const id = m.activePlayerId;
      m.fire(id, 0.5 + (schuesse % 9) * 0.15, 40 + ((schuesse * 13) % 50), m.inventory.getActiveWeaponId(id));
      schuesse += 1;
    }
    m.step();
    for (const e of m.consumeEvents()) if (e.type.startsWith('hail_')) hagel.push({ tick: m.world.tickCount, typ: e.type, ...e.payload });
  }
  return { m, hash: m.stateHash(), hagel };
}

/**
 * GOLDWERTE aus dem Stand VOR der Hagelfassung (Commit 675ec36, ohne `engine/hagel.js`), einmal gemessen mit
 * `spiele(seed)` (alle Standardfassungen, 30000 Takte, Schüsse alle 150 Takte): Hash, Taktzahl.
 */
const GOLD_VOR_HAGEL = { 1: ['986f94f4', 27614], 5: ['ea1de160', 30000], 777: ['20cb8020', 30000] };

test('Gold: Fassung 1 und ein Match OHNE die Angabe sind bitgleich zum Stand vor der Hagelfassung', () => {
  for (const [seed, [hash, takte]] of Object.entries(GOLD_VOR_HAGEL)) {
    const ohne = spiele(Number(seed));
    const alt = spiele(Number(seed), { hagel: HAGEL_ALT });
    assert.equal(ohne.hash, hash, `Seed ${seed} ohne Angabe`);
    assert.equal(alt.hash, hash, `Seed ${seed} Fassung 1`);
    assert.equal(alt.m.world.tickCount, takte);
    assert.equal(alt.hagel.length, 0, 'Fassung 1 meldet nie Hagel');
    assert.equal(alt.m.hagelSystem, null);
  }
});

test('Fassung 2 im Motor: deterministisch, ändert den Hash genau dann, wenn Hagel fiel, und taucht im Ansichtszustand auf', () => {
  const a = spiele(1, { hagel: HAGEL_KOERNER });
  const b = spiele(1, { hagel: HAGEL_KOERNER });
  assert.deepEqual(a.hagel, b.hagel);
  assert.equal(a.hash, b.hash);
  assert.ok(a.hagel.some(e => e.typ === 'hail_korn'), 'Hagel fiel');
  assert.notEqual(a.hash, GOLD_VOR_HAGEL[1][0], 'Hagel verändert den Verlauf');
  // Die Lagen hängen nur an Seed und Takt: Goldwert der ersten Lage für Seed 4242.
  const g = spiele(4242, { hagel: HAGEL_KOERNER }, 23000);
  assert.equal(g.hagel.find(e => e.typ === 'hail_start')?.tick, 22925);
  // Körner sind keine Geschosse: sie halten das Zugende nicht auf.
  const gerade = new MatchController({ seed: 4242, ...STANDARD_FASSUNGEN, hagel: HAGEL_KOERNER, turnDurationMs: 1e9, maxRounds: 50 });
  gerade.start();
  for (let t = 0; t < 23100; t += 1) gerade.step();
  assert.equal(gerade.activeProjectileCount, 0);
  assert.ok(gerade.getState().hagel, 'der Ansichtszustand trägt die Lage, solange sie läuft');
  assert.equal(new MatchController({ seed: 1, ...STANDARD_FASSUNGEN, hagel: HAGEL_ALT }).getState().hagel, undefined);
});

test('Fassung 2 im Motor: ein Hagelkorn lässt nie unter 1 LP fallen; der Schaden läuft als gewöhnliches damage-Ereignis ohne Urheber', () => {
  let geprueft = 0;
  for (const seed of [1, 3, 4242]) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 50, turnDurationMs: 1e9, ...STANDARD_FASSUNGEN, hagel: HAGEL_KOERNER });
    m.start();
    let letztes = null;
    for (let t = 0; t < 36000; t += 1) {
      m.step();
      for (const e of m.consumeEvents()) {
        if (e.type === 'damage') letztes = e.payload;
        if (e.type !== 'hail_hit' || e.payload.damage <= 0) continue;
        assert.equal(letztes.entityId, e.payload.entityId, 'das damage-Ereignis des Treffers geht voraus');
        assert.equal(letztes.attackerId, null, 'Wetter hat keinen Urheber');
        assert.ok(letztes.remaining >= 1, `Rest ${letztes.remaining} LP`);
        assert.ok(letztes.amount >= 1 && letztes.amount <= 2 + 1e-9, `Betrag ${letztes.amount}`);
        geprueft += 1;
      }
    }
  }
  assert.ok(geprueft >= 5, `nur ${geprueft} Treffer geprüft`);
});

test('Replay: der Kopf trägt die Fassung, die Wiedergabe endet im Live-Hash; ein alter Kopf ohne Feld ist Fassung 1', () => {
  const kopf = { seed: 1, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 50 };
  const live = new MatchController({ ...kopf, turnDurationMs: 1e9, hagel: HAGEL_KOERNER });
  live.start();
  const rec = new ReplayRecorder({ ...kopf, turnDurationMs: 1e9, hagel: live.hagel });
  for (let t = 0; t < 26000; t += 1) {
    if (live.activeProjectileCount === 0 && t % 150 === 0) {
      const id = live.activePlayerId;
      const waffe = live.inventory.getActiveWeaponId(id);
      if (live.fire(id, 0.8, 55, waffe).ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: 0.8, power: 55, weaponId: waffe });
    }
    live.step();
    live.consumeEvents();
  }
  rec.finalize(live.world.tickCount);
  const json = rec.serialize();
  assert.equal(JSON.parse(json).config.hagel, HAGEL_KOERNER);
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(json));
  while (!spieler.finished) spieler.advance?.() ?? spieler.step?.();
  assert.equal(spieler.match.hagel, HAGEL_KOERNER);
  assert.equal(spieler.match.stateHash(), live.stateHash());
  // Alter Kopf: Feld entfernt → Fassung 1, kein Hagel.
  const alt = JSON.parse(json);
  delete alt.config.hagel;
  const altSpieler = new ReplayPlayer(ReplayRecorder.fromJSON(JSON.stringify(alt)));
  assert.equal(altSpieler.match.hagel, HAGEL_ALT);
  assert.equal(altSpieler.match.hagelSystem, null);
});

test('Draht: Hagelereignisse sind Zustandsarten mit Katalogeintrag und Wirkung; der binäre Snapshot wächst nicht', () => {
  for (const art of ['hail_start', 'hail_korn', 'hail_aufprall', 'hail_hit', 'hail_ende']) {
    assert.ok(art in EREIGNIS_KATALOG, `${art} im Katalog`);
    assert.ok(ZUSTANDSEREIGNISARTEN.includes(art), `${art} ist eine Zustandsart (wird nie gefiltert)`);
    assert.equal(typeof EREIGNIS_WIRKUNGEN[art]?.lokal, 'function', `${art} lokal`);
    assert.equal(typeof EREIGNIS_WIRKUNGEN[art]?.online, 'function', `${art} online`);
  }
  // Während der Hagel fällt, ist der Snapshot auf dem Draht genauso groß wie ohne.
  const m = new MatchController({ seed: 4242, ...STANDARD_FASSUNGEN, hagel: HAGEL_KOERNER, turnDurationMs: 1e9, maxRounds: 50 });
  m.start();
  for (let t = 0; t < 23200; t += 1) m.step();
  const zustand = m.getState();
  assert.ok(zustand.hagel, 'Hagel fällt');
  const { hagel: _ohne, ...ohneHagel } = zustand;
  assert.equal(encodeSnapshot(zustand, { turnRemainingMs: 1000 }).byteLength, encodeSnapshot(ohneHagel, { turnRemainingMs: 1000 }).byteLength);
});

test('Client: Hagel folgt dem Engine-Wetter (Menüwahl zählt in Fassung 2 nicht), Fassung 1 bleibt unberührt, später Beitritt wird erkannt', () => {
  const ziel = (wahl) => zielAus(wetterMit({ regen: 0, schnee: 0, gewitter: false, nebel: 0 }, wahl, 'auto'), 0, 0);
  // Fassung 2, kein Engine-Hagel: Menüwahl „Hagel" bleibt ohne Hagel.
  const anzeige = new HagelAnzeige(HAGEL_KOERNER);
  assert.equal(bindeHagelZiel(ziel('hagel'), anzeige, 100).hagel, 0);
  // Engine meldet Beginn: Hagel ein, nach dem Ende wieder aus.
  anzeige.start(100, 600);
  assert.equal(bindeHagelZiel(ziel('auto'), anzeige, 200).hagel, 1);
  assert.ok(bindeHagelZiel(ziel('auto'), anzeige, 200).wind >= 0.6);
  anzeige.ende(300);
  assert.equal(bindeHagelZiel(ziel('auto'), anzeige, 301).hagel, 0);
  // Kein Himmel (Höhle, Weltraum): keine Optik.
  anzeige.start(400, 600);
  assert.equal(bindeHagelZiel(ziel('auto'), anzeige, 450, true).hagel, 0);
  // Fassung 1: nichts wird angefasst.
  const alt = new HagelAnzeige(HAGEL_ALT);
  assert.equal(bindeHagelZiel(ziel('hagel'), alt, 0).hagel, 1);
  assert.equal(bindeHagelZiel(ziel('auto'), alt, 0).hagel, 0);
  // Korn: Schatten und Fall bis zum Aufschlag; die Meldung trägt den Rest der Lage (später Beitritt sieht Hagel).
  const spaet = new HagelAnzeige(HAGEL_KOERNER);
  spaet.korn(1000, { id: 7, x: 10, y: 20, fall: 70, rest: 900 });
  assert.equal(spaet.aktiv(1500), true);
  assert.equal(spaet.koerner.size, 1);
  spaet.aufprall(1070, { id: 7, x: 10, y: 20, treffer: null });
  assert.equal(spaet.koerner.size, 0);
  assert.equal(spaet.aufschlaege.length, 1);
});

/** Ein Zeichenflächen-Ersatz, der alle Aufrufe zählt und nie wirft (Farbverläufe liefern Farbstopps). */
function zeichenflaeche() {
  const aufrufe = [];
  const ctx = new Proxy({}, {
    get: (_, p) => {
      if (p === 'aufrufe') return aufrufe;
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => { aufrufe.push(String(p)); return { addColorStop() {} }; };
      return () => { aufrufe.push(String(p)); };
    },
    set: () => true,
  });
  return ctx;
}

test('Client-Zeichnung: Schatten, fallendes Korn und Aufschlag zeichnen ohne Fehler; reduzierte Bewegung zeigt nur die Markierung; Fassung 1 zeichnet nichts', () => {
  const anzeige = new HagelAnzeige(HAGEL_KOERNER);
  anzeige.korn(100, { id: 1, x: 400, y: 500, fall: 80, rest: 1000 });
  const bewegt = zeichenflaeche();
  zeichneHagelKoerner(bewegt, anzeige, 140);
  assert.ok(bewegt.aufrufe.includes('ellipse'), 'Schatten am Zielpunkt');
  assert.ok(bewegt.aufrufe.includes('createRadialGradient'), 'das Korn selbst (maleHagelkorn)');
  const still = zeichenflaeche();
  zeichneHagelKoerner(still, anzeige, 140, true);
  assert.ok(still.aufrufe.includes('ellipse'));
  assert.ok(!still.aufrufe.includes('createRadialGradient'), 'ohne Bewegung fällt kein Korn');
  anzeige.aufprall(180, { id: 1, x: 400, y: 500, treffer: 3 });
  const auf = zeichenflaeche();
  zeichneHagelKoerner(auf, anzeige, 185);
  assert.ok(auf.aufrufe.includes('arc'), 'Splitter');
  const spaeter = zeichenflaeche();
  zeichneHagelKoerner(spaeter, anzeige, 400);
  assert.equal(spaeter.aufrufe.length, 0, 'nach der Anzeigedauer ist alles weg');
  assert.equal(anzeige.aufschlaege.length, 0);
  const alt = new HagelAnzeige(HAGEL_ALT);
  alt.korn(0, { id: 2, x: 1, y: 1, fall: 70, rest: 100 });
  const leer = zeichenflaeche();
  zeichneHagelKoerner(leer, alt, 10);
  assert.equal(leer.aufrufe.length, 0);
  // Ein verlorenes Aufschlagereignis lässt ein Korn nicht ewig hängen.
  const haengt = new HagelAnzeige(HAGEL_KOERNER);
  haengt.korn(0, { id: 3, x: 1, y: 1, fall: 70, rest: 100 });
  zeichneHagelKoerner(zeichenflaeche(), haengt, 70 * 3 + 100);
  assert.equal(haengt.koerner.size, 0);
});

test('Server: welcome und Aufzeichnung tragen die Hagelfassung (neue Partien: Standard)', async () => {
  const { server, url, wsUrl } = await starteServer();
  const lobby = await erstelleLobby(url, { teams: 2, playersPerTeam: 1, seed: 31 });
  const a = await trittBei(wsUrl, lobby.lobby.id, { name: 'A', token: lobby.player.token });
  try {
    assert.equal(a.welcome.hagel, HAGEL_STANDARD);
  } finally { a.client.close(); await server.close?.(); }
});
