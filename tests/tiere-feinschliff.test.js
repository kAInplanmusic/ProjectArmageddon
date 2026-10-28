/**
 * Tests: Günther Fassung 3 und Cookie Fassung 3 (Feinschliff nach Messung), Tier-Bühne, Tier-Leiste, Hilfe-Tabellen.
 *
 * Die Altköpfe (`guenther` 1 und 2, `cookie` 1 und 2) müssen Bit für Bit laufen wie vor Fassung 3:
 * Die festen Werte unten stammen aus einem Lauf des Standes VOR dieser Änderung (origin/main 9fd90d9).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { CookieSystem } from '../src/engine/systems/cookieSystem.js';
import { loeseGuentherRad } from '../src/engine/guentherRad.js';
import { SeededRandom } from '../src/shared/prng.js';
import {
  GUENTHER_PEE, GUENTHER_POOP, GUENTHER_PEE_3, GUENTHER_POOP_3, GUENTHER_WHEEL, GUENTHER_WHEEL_TOTAL,
  HEIMDALL_MAX_PERCENT, guentherWerte, GUENTHER_FEINSCHLIFF, GUENTHER_AKTIONEN, GUENTHER_AKTION_REGELN, GUENTHER_AKTION_IDS,
} from '../src/shared/config/guenther.js';
import {
  COOKIE_PFLEGE, COOKIE_PFLEGE_3, COOKIE_WUT, COOKIE_WUT_3, COOKIE_HUNGER, COOKIE_HUNGER_3, COOKIE_KATER, COOKIE_FEINSCHLIFF,
  cookiePflege, cookieWut, cookieHunger,
} from '../src/shared/config/cookie.js';
import { TierBuehne, MAX_TEILCHEN, AUFTRITTE } from '../src/client/tierBuehne.js';
import { tierHudModell } from '../src/client/tierHud.js';
import { baueTierTabellen } from '../src/client/hilfeTiere.js';
import { KameraRegie } from '../src/client/kameraRegie.js';

/** Das Szenario der Festwerte: 36 Züge zu je 400 Ticks, zählt Tier-Ereignisse. */
function lauf(seed, guenther, cookie) {
  // Sturm ausser Reichweite: Diese Festwerte messen Guenther/Cookie, nicht den
  // Mahlstrom (seit 2026-10-25 rundenbasiert, ab Runde 8).
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, turnPauseTicks: 0, valhallaRound: 999, guenther, cookie });
  m.start();
  let ereignisse = 0;
  for (let z = 0; z < 36; z += 1) {
    for (let i = 0; i < 400; i += 1) {
      m.step();
      ereignisse += m.consumeEvents().filter(e => e.type.startsWith('guenther_') || e.type.startsWith('cookie_')).length;
    }
    m.endTurn();
  }
  return [m.stateHash(), ereignisse, m.round];
}

test('Altköpfe laufen Bit für Bit wie vorher (guenther 1 und 2, cookie 1 und 2)', () => {
  // Festwerte bis zur Auslese vom 2026-10-28: 'd6881995', 'df35ca4e', 'df35ca4e', '6f1cf455', '7f26068a'. Die Auslese verschiebt
  // Stufen im Katalog, und die Waffenkisten ziehen nach `powerTier` (`lootSystem.js`): Die Kisteninhalte sind andere, daher
  // wandern die Hashes. Ereignisse und Runden sind in allen fünf Läufen gleich geblieben. Belegt: mit dem Katalog von vor der
  // Auslese ergibt derselbe Code alle fünf alten Hashes wieder (docs/audit-waffen-2026-10-28.md, Abschnitt F3). Eine Versionsmarke
  // `kisten` für die Beute alter Aufzeichnungen wurde nicht gesetzt (Entscheidung des Auftraggebers).
  assert.deepEqual(lauf(7, 1, 1), ['bdcd6ab5', 161, 12]);
  assert.deepEqual(lauf(7, 2, 1), ['26e7700c', 164, 13]);
  assert.deepEqual(lauf(7, 2, 2), ['26e7700c', 176, 13]);
  assert.deepEqual(lauf(4242, 2, 2), ['ff59b21b', 47, 10]);
  assert.deepEqual(lauf(99, 2, 2), ['606c5a8d', 61, 10]);
});

test('Fassung 3 läuft, ist deterministisch und weicht von Fassung 2 ab', () => {
  const a = lauf(7, GUENTHER_FEINSCHLIFF, COOKIE_FEINSCHLIFF);
  const b = lauf(7, GUENTHER_FEINSCHLIFF, COOKIE_FEINSCHLIFF);
  assert.deepEqual(a, b);
  assert.notEqual(a[0], lauf(7, 2, 2)[0]);
});

test('Fassung 3 ändert die Werte nur dort, wo gemessen wurde; Fassung 2 bleibt unverändert', () => {
  assert.equal(guentherWerte(2).pee, GUENTHER_PEE);
  assert.equal(guentherWerte(2).poop, GUENTHER_POOP);
  assert.equal(guentherWerte(3).pee, GUENTHER_PEE_3);
  assert.equal(guentherWerte(3).poop, GUENTHER_POOP_3);
  assert.deepEqual(GUENTHER_PEE.intervalTicks, [45, 95]);
  assert.equal(GUENTHER_PEE.baseDamage, 9);
  assert.deepEqual(GUENTHER_POOP.intervalTicks, [200, 340]);
  assert.equal(GUENTHER_POOP.damagePerTurn, 4);
  // Fassung 3: seltener und milder, nicht stärker.
  assert.ok(GUENTHER_PEE_3.intervalTicks[0] > GUENTHER_PEE.intervalTicks[0]);
  assert.ok(GUENTHER_PEE_3.baseDamage < GUENTHER_PEE.baseDamage);
  assert.ok(GUENTHER_POOP_3.intervalTicks[0] > GUENTHER_POOP.intervalTicks[0]);
  assert.ok(GUENTHER_POOP_3.damagePerTurn < GUENTHER_POOP.damagePerTurn);
  assert.equal(cookiePflege(COOKIE_KATER), COOKIE_PFLEGE);
  assert.equal(cookieWut(COOKIE_KATER), COOKIE_WUT);
  assert.equal(cookieHunger(COOKIE_KATER), COOKIE_HUNGER);
  assert.equal(cookiePflege(COOKIE_FEINSCHLIFF), COOKIE_PFLEGE_3);
  assert.equal(cookieWut(COOKIE_FEINSCHLIFF), COOKIE_WUT_3);
  assert.equal(cookieHunger(COOKIE_FEINSCHLIFF), COOKIE_HUNGER_3);
  assert.equal(COOKIE_PFLEGE.kuschelnHeilung, 20);
  assert.equal(COOKIE_WUT.schlagSchaden, 40);
  assert.ok(COOKIE_PFLEGE_3.kuschelnHeilung < COOKIE_PFLEGE.kuschelnHeilung);
  assert.ok(COOKIE_PFLEGE_3.napfAbHunger >= COOKIE_HUNGER.stufen.laut);
  assert.ok(COOKIE_WUT_3.schlagSchaden < COOKIE_WUT.schlagSchaden);
  // Stufen und Pegel (das Maß der Dringlichkeit) bleiben.
  assert.deepEqual(COOKIE_HUNGER_3.stufen, COOKIE_HUNGER.stufen);
  assert.deepEqual(COOKIE_HUNGER_3.pegel, COOKIE_HUNGER.pegel);
});

test('Glücksrad: Gewichte 100, Heimdall höchstens 5 Prozent (alle Fassungen)', () => {
  assert.equal(GUENTHER_WHEEL_TOTAL, 100);
  const heimdall = GUENTHER_WHEEL.find(a => a.id === 'heimdall');
  assert.ok(heimdall.weight / GUENTHER_WHEEL_TOTAL * 100 <= HEIMDALL_MAX_PERCENT);
});

/** Ein Rad mit festem Ausgang `angriff` und festem Wurf. */
function radMit(fassung, leben, wurf) {
  const log = [];
  const guenther = { wuerfleAusgang: () => GUENTHER_WHEEL.find(a => a.id === 'angriff'), zieheBereich: () => wurf };
  const world = {
    getComponent: (_id, _k, feld) => (feld === 'current' ? leben : 0),
    getSystem: () => ({ applyDamage: (_w, id, betrag) => log.push([id, betrag]) }),
  };
  const ergebnis = loeseGuentherRad({ fassung, guenther, statuses: {}, inventory: {}, world }, 1);
  return { ergebnis, log };
}

test('Rad-Angriff: Fassung 2 darf töten, Fassung 3 lässt mindestens 1 Leben', () => {
  const alt = radMit(2, 30, 90);
  assert.equal(alt.log[0][1], 90);
  const neu = radMit(GUENTHER_FEINSCHLIFF, 30, 90);
  assert.equal(neu.log[0][1], 29);
  assert.equal(neu.ergebnis.amount, 29);
  const voll = radMit(GUENTHER_FEINSCHLIFF, 100, 40);
  assert.equal(voll.log[0][1], 40, 'bei viel Leben unverändert');
  const eins = radMit(GUENTHER_FEINSCHLIFF, 1, 50);
  assert.equal(eins.log[0][1], 0);
});

// ------------------------------------------------------------------ Cookie 3

function welt(spieler) {
  const daten = new Map(spieler.map(s => [s.id, { x: s.x, y: s.y }]));
  return {
    isActive: id => daten.has(id),
    getComponent: (id, _k, feld) => daten.get(id)?.[feld],
    setPos: (id, x, y) => daten.set(id, { x, y }),
  };
}

function kontext(ids, extra = {}) {
  const log = { heile: [], gegessen: [], kisten: [], events: [] };
  const ctx = {
    aktiverSpieler: null, spielerIds: ids, surfaceYAt: () => 100,
    melde: (typ, d) => log.events.push([typ, d]),
    kisten: () => log.kisten,
    kisteVerzehren: (id) => { log.gegessen.push(id); log.kisten = log.kisten.filter(k => k.id !== id); },
    heile: (id, b) => log.heile.push([id, b]),
    stosse: () => {}, krater: () => {}, schaden: () => {}, schadenNichtToedlich: () => 0, zerstoereObjekte: () => 0,
    ...extra,
  };
  return { ctx, log };
}

test('Cookie 3: Kuscheln höchstens dreimal je Figur, sonst unverändert wie Fassung 2', () => {
  for (const fassung of [COOKIE_KATER, COOKIE_FEINSCHLIFF]) {
    const c = new CookieSystem({ rng: new SeededRandom(3), width: 1280, height: 720, fassung });
    const w = welt([{ id: 5, x: c.position.x + 10, y: 100 }]);
    const { ctx, log } = kontext([5]);
    for (let i = 0; i < 40_000; i += 1) c.update(w, ctx);
    const n = log.events.filter(e => e[0] === 'cookie_kuschelt').length;
    if (fassung === COOKIE_FEINSCHLIFF) assert.equal(n, COOKIE_PFLEGE_3.kuschelnMax, 'Fassung 3: Höchstzahl erreicht, nicht mehr');
    else assert.ok(n > COOKIE_PFLEGE_3.kuschelnMax, `Fassung 2 kuschelt weiter (${n})`);
  }
});

test('Cookie 3: der Futternapf frisst erst ab Hunger 60 und höchstens alle 60 Sekunden', () => {
  const alt = new CookieSystem({ rng: new SeededRandom(3), width: 1280, height: 720, fassung: COOKIE_KATER });
  const neu = new CookieSystem({ rng: new SeededRandom(3), width: 1280, height: 720, fassung: COOKIE_FEINSCHLIFF });
  const w = welt([]);
  const lauf3 = (c) => {
    const { ctx, log } = kontext([]);
    c.update(w, ctx); // einmal drehen: erst dann steht Cookie auf dem Boden
    const ort = c.position;
    log.kisten = [{ id: 9, x: ort.x + 5, y: ort.y }];
    let tick = 0;
    const erste = [];
    for (; tick < 30_000 && erste.length < 2; tick += 1) {
      if (log.kisten.length === 0 && log.gegessen.length > erste.length) { erste.push(tick); log.kisten = [{ id: 10 + erste.length, x: ort.x + 5, y: ort.y }]; }
      c.update(w, ctx);
    }
    return { erste, hungerBeimErsten: log.events.find(e => e[0] === 'cookie_gefuettert')?.[1].hunger };
  };
  const a = lauf3(alt);
  const n = lauf3(neu);
  // Das Ereignis meldet den Hunger NACH dem Fressen: davor lag er um `napfHunger` höher.
  const davorAlt = a.hungerBeimErsten + COOKIE_PFLEGE.napfHunger;
  const davorNeu = n.hungerBeimErsten + COOKIE_PFLEGE_3.napfHunger;
  assert.ok(davorAlt >= COOKIE_HUNGER.stufen.leise - 1 && davorAlt < COOKIE_HUNGER.stufen.laut, `Fassung 2 frisst schon ab "leise" (${davorAlt})`);
  assert.ok(davorNeu >= COOKIE_HUNGER.stufen.laut - 1, `Fassung 3 frisst erst ab "laut" (${davorNeu})`);
  if (n.erste.length === 2) assert.ok(n.erste[1] - n.erste[0] >= COOKIE_PFLEGE_3.napfSperre, 'Sperre zwischen zwei Kisten');
});

// ------------------------------------------------------------------ Bühne, Leiste, Tabellen, Kamera

test('Tier-Bühne: Blasen folgen dem Tier, Teilchen sind begrenzt, Auftritt klingt ab', () => {
  const b = new TierBuehne();
  const zustand = { guenther: { aktiv: true, x: 300, y: 400 }, cookie: { aktiv: true, x: 600, y: 410, hunger: 70, richtung: 1 } };
  const signale = b.schritt(zustand, 1 / 60);
  assert.deepEqual(signale.map(s => s.typ), ['guenther_auftritt']);
  assert.equal(b.schritt(zustand, 1 / 60).length, 0, 'der Auftritt wird nur einmal gemeldet');
  assert.ok(b.kameraAuftritt(), 'Günthers Auftritt zoomt kurz');
  for (let i = 0; i < 400; i += 1) b.ereignis('cookie_kuschelt', { x: 600, y: 410 });
  assert.ok(b.teilchen.length <= MAX_TEILCHEN);
  b.ereignis('cookie_miau', { stufe: 'wut', pegel: 1, x: 600, y: 410 });
  assert.equal(b.blasen.find(x => x.wer === 'cookie').text, 'MIAUUUU!!');
  assert.ok(b.miauPegel > 0.9);
  b.ereignis('cookie_tobt', { x: 600, y: 410 });
  assert.ok(b.kameraAuftritt().zoom >= 1);
  for (let i = 0; i < 60 * 30; i += 1) b.schritt(zustand, 1 / 60);
  assert.equal(b.kameraAuftritt(), null);
  assert.equal(b.teilchen.length, 0);
  assert.equal(b.blasen.length, 0);
  assert.ok(AUFTRITTE.cookie_schockwelle.beben >= AUFTRITTE.cookie_tobt.beben);
});

test('Tier-Bühne: Beben und Zoom gibt es nicht bei Bewegungsreduktion; Zufall nur aus dem Zähler', () => {
  const b = new TierBuehne();
  b.schritt({ cookie: { aktiv: true, x: 600, y: 410, hunger: 70 } }, 1 / 60, true);
  b.ereignis('cookie_schockwelle', { x: 600, y: 410, radius: 400 });
  b.schritt({ cookie: { aktiv: true, x: 600, y: 410, hunger: 70 } }, 1 / 60, true);
  assert.equal(b.kameraAuftritt(), null);
  assert.deepEqual(b.versatz(), { x: 0, y: 0 });
  const a1 = new TierBuehne(); const a2 = new TierBuehne();
  for (const t of [a1, a2]) t.ereignis('cookie_gefuettert', { x: 10, y: 20 });
  assert.deepEqual(a1.teilchen, a2.teilchen);
  const beben = new TierBuehne();
  beben.schritt({ cookie: { aktiv: true, x: 1, y: 1, hunger: 0 } }, 1 / 60, false);
  beben.ereignis('cookie_schockwelle', { x: 1, y: 1 });
  let max = 0;
  for (let i = 0; i < 60; i += 1) { beben.schritt({ cookie: { aktiv: true, x: 1, y: 1, hunger: 0 } }, 1 / 60, false); const v = beben.versatz(); max = Math.max(max, Math.hypot(v.x, v.y)); }
  assert.ok(max > 2 && max <= 12, `Beben ${max}`);
});

test('Tier-Leiste: Cookie erst ab "leise" sichtbar, Pegelstriche je Stufe, Günthers Blase', () => {
  const sat = tierHudModell({ cookie: { aktiv: true, hunger: 10 } });
  assert.equal(sat.cookie, null);
  const leise = tierHudModell({ cookie: { aktiv: true, hunger: 40 } });
  assert.equal(leise.cookie.striche, 1);
  assert.equal(tierHudModell({ cookie: { aktiv: true, hunger: 70 } }).cookie.striche, 2);
  const wut = tierHudModell({ cookie: { aktiv: true, hunger: 90 } }, { miauPegel: 1, blasen: [] });
  assert.equal(wut.cookie.striche, 3);
  assert.equal(wut.cookie.miaut, true);
  assert.equal(wut.cookie.text, 'HUNGERWUT');
  const g = tierHudModell({ guenther: { aktiv: true } }, { blasen: [{ wer: 'guenther', text: 'Wuff!', rest: 1 }], miauPegel: 0 });
  assert.equal(g.guenther.text, 'Wuff!');
  assert.equal(tierHudModell({ guenther: { aktiv: false } }, { blasen: [{ wer: 'guenther', text: 'x', rest: 1 }] }).guenther, null);
});

test('Hilfe-Tabellen: Chancen summieren sich auf 100 Prozent und stammen aus der Config', () => {
  const t = baueTierTabellen(GUENTHER_FEINSCHLIFF, COOKIE_FEINSCHLIFF);
  const zahl = s => Number(s.replace(' %', '').replace(',', '.'));
  const aktionen = t.find(x => x.titel === 'Günthers Aktionen');
  assert.equal(aktionen.zeilen.length, GUENTHER_AKTION_IDS.length);
  const summe = aktionen.zeilen.reduce((s, z) => s + zahl(z[1]), 0);
  assert.ok(Math.abs(summe - 100) < GUENTHER_AKTION_IDS.length * 0.51, `Aktionen ${summe}`);
  const rad = t.find(x => x.titel === 'Glücksrad');
  assert.equal(rad.zeilen.reduce((s, z) => s + zahl(z[1]), 0), 100);
  assert.ok(rad.zeilen.find(z => z[0].includes('Heimdall') || z[2].includes('Heimdall')));
  assert.ok(rad.zeilen.find(z => z[2].includes('nie tödlich')), 'Fassung 3: Angriff nie tödlich');
  const pflege = t.find(x => x.titel.endsWith('Pflege und Toben'));
  assert.ok(pflege.zeilen.some(z => z[0] === 'Kuscheln' && z[2].includes(`+${COOKIE_PFLEGE_3.kuschelnHeilung} Leben`)));
  assert.ok(pflege.zeilen.some(z => z[0] === 'Toben' && z[2].includes(`${COOKIE_WUT_3.schlagSchaden} Schaden`)));
  assert.ok(GUENTHER_AKTIONEN === 2 && GUENTHER_AKTION_REGELN.essen.gewicht > 0);
  for (const tabelle of t) for (const z of tabelle.zeilen) assert.equal(z.length, tabelle.kopf.length, `${tabelle.titel}: Spaltenzahl`);
});

const KARTE = { b: 2560, h: 1440 };
function eingabe(extra = {}) {
  return {
    karte: KARTE, schirm: KARTE, rand: { oben: 144, unten: 220, links: 470, rechts: 0 }, pad: { halb: 60, oben: 120, unten: 30 },
    zoomMax: 4, aktivId: 1, aktiv: { x: 800, y: 700, winkel: 0.5 }, gegner: [], geschosse: [], wiederholung: null, krater: null,
    waffe: null, ansicht: { x: 1280, y: 720, zoom: 1 }, ...extra,
  };
}

test('Kameraregie: Tierauftritt zoomt auf das Tier, Geschosse haben Vorrang, reduziert ohne Auftritt', () => {
  const r = new KameraRegie();
  let a;
  for (let i = 0; i < 30; i += 1) a = r.schritt(1 / 60, eingabe());
  const davor = { x: a.x, zoom: a.zoom };
  const tier = { x: 1900, y: 800, zoom: 1.2 };
  for (let i = 0; i < 90; i += 1) a = r.schritt(1 / 60, eingabe({ tier }));
  assert.equal(r.phase, 'tier');
  assert.ok(a.x > davor.x + 100, 'Kamera ist zum Tier gefahren');
  // Geschoss fliegt: Vorrang.
  a = r.schritt(1 / 60, eingabe({ tier, geschosse: [{ x: 900, y: 600 }] }));
  assert.equal(r.phase, 'verfolgung');
  // Danach zurück zur Übersicht.
  for (let i = 0; i < 400; i += 1) a = r.schritt(1 / 60, eingabe());
  assert.equal(r.phase, 'uebersicht');
  const rr = new KameraRegie();
  rr.setzeReduziert(true);
  for (let i = 0; i < 30; i += 1) rr.schritt(1 / 60, eingabe({ tier }));
  assert.equal(rr.phase, 'uebersicht');
});

test('Tier-Bühne: Zeichnen aller Teilchenarten und Blasen wirft nicht (Aufzeichnungs-Canvas)', () => {
  const aufrufe = [];
  const ctx = new Proxy({}, {
    get: (_, name) => {
      if (name === 'measureText') return () => ({ width: 40 });
      return (...args) => { aufrufe.push(name); return args; };
    },
    set: () => true,
  });
  const b = new TierBuehne();
  const z = { guenther: { aktiv: true, x: 300, y: 400, richtung: 1 }, cookie: { aktiv: true, x: 600, y: 410, richtung: 1, hunger: 90 } };
  b.schritt(z, 1 / 60);
  for (const [typ, n] of [
    ['cookie_miau', { stufe: 'wut', pegel: 1 }], ['cookie_kuschelt', {}], ['cookie_gefuettert', {}], ['cookie_tobt', {}],
    ['cookie_zerstoert', {}], ['cookie_schlag', {}], ['cookie_erschoepft', {}], ['cookie_spielt', {}], ['cookie_schockwelle', { radius: 500 }],
    ['guenther_aktion', { aktion: 'chaos', x: 300, y: 400 }], ['guenther_aktion_wirkung', { aktion: 'wuehlen', x: 300, y: 400 }],
    ['guenther_aktion_wirkung', { aktion: 'kuscheln', x: 300, y: 400 }], ['unbekannt', {}],
  ]) b.ereignis(typ, { x: 600, y: 410, ...n });
  const arten = new Set(b.teilchen.map(t => t.art));
  for (const art of ['herz', 'kruemel', 'staub', 'stern', 'zzz', 'note', 'ring']) assert.ok(arten.has(art), `Teilchenart ${art}`);
  for (let i = 0; i < 20; i += 1) { b.schritt(z, 1 / 60); b.zeichne(ctx); }
  assert.ok(aufrufe.length > 50);
});
