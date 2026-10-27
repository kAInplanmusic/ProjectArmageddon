/**
 * Wetter und Licht auf den gemalten Kulissen: Auswahl aus dem Beschreibungstext, Lichter aus dem Bild, Blitzzeiten, Zeichnen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { wetterAus, findeLichter, blitzZustand, zeichneWetterHinten, zeichneWetterVorn } from '../src/client/wetterLicht.js';
import { ALL_BACKDROPS } from '../src/shared/config/backdrops.js';

const kulisse = key => ALL_BACKDROPS.find(b => b.key === key);

test('Wetter folgt der Kulisse: Regenwald leicht, Sturm mit Gewitter, Winter mit Schnee, Sumpf mit Nebel, Höhle ohne', () => {
  const dschungel = wetterAus(kulisse('hyperreal/jungle_river'));
  assert.ok(dschungel.regen > 0 && dschungel.regen <= 0.35, `leichter Regen im Regenwald: ${dschungel.regen}`);
  assert.equal(dschungel.gewitter, false);
  const sturm = wetterAus(kulisse('maritime/storm_night'));
  assert.ok(sturm.regen >= 0.7 && sturm.gewitter);
  const winter = wetterAus(kulisse('alpine/winter_snow'));
  assert.ok(winter.schnee > 0 && winter.regen === 0);
  const sumpf = wetterAus(kulisse('fantasy/dark_swamp'));
  assert.ok(sumpf.nebel > 0);
  const hoehle = wetterAus(kulisse('caverns/crystal'));
  assert.deepEqual([hoehle.regen, hoehle.schnee, hoehle.gewitter, hoehle.nebel], [0, 0, false, 0]);
  const all = wetterAus(kulisse('cosmos/nebula'));
  assert.equal(all.lichter, false);
  assert.deepEqual(wetterAus(null), { regen: 0, schnee: 0, gewitter: false, nebel: 0, lichter: false });
});

test('Über alle 160 Kulissen: Stärken liegen in 0 bis 1, Regen und Schnee nie zugleich stark, jede Wetterart kommt vor', () => {
  const arten = { regen: 0, schnee: 0, gewitter: 0, nebel: 0 };
  for (const b of ALL_BACKDROPS) {
    const w = wetterAus(b);
    for (const v of [w.regen, w.schnee, w.nebel]) assert.ok(v >= 0 && v <= 1, b.key);
    assert.ok(!(w.regen > 0.4 && w.schnee > 0), `${b.key}: Regen und Schnee zugleich`);
    if (w.regen > 0) arten.regen += 1;
    if (w.schnee > 0) arten.schnee += 1;
    if (w.gewitter) arten.gewitter += 1;
    if (w.nebel > 0) arten.nebel += 1;
  }
  for (const [art, n] of Object.entries(arten)) assert.ok(n > 0, `keine Kulisse mit ${art}`);
});

test('findeLichter liest helle warme Punkte vor dunklem Grund, ignoriert kalte und flache Helligkeit', () => {
  const b = 64; const h = 36;
  const data = new Uint8ClampedArray(b * h * 4);
  for (let i = 0; i < b * h; i += 1) { data[i * 4] = 14; data[i * 4 + 1] = 16; data[i * 4 + 2] = 24; data[i * 4 + 3] = 255; }
  const setze = (x, y, r, g, bl) => { const i = (y * b + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = bl; };
  for (const [x, y] of [[20, 12], [21, 12], [20, 13], [21, 13]]) setze(x, y, 255, 200, 90); // warmes Fenster
  for (const [x, y] of [[44, 20], [45, 20], [44, 21], [45, 21]]) setze(x, y, 200, 220, 255); // kalt: kein Licht
  const lichter = findeLichter({ data, width: b, height: h });
  assert.equal(lichter.length, 1);
  assert.ok(Math.abs(lichter[0].x - 20.5 / b) < 0.05 && Math.abs(lichter[0].y - 12.5 / h) < 0.06);
  assert.ok(lichter[0].st > 0.3);
  // Helle Fläche (Himmel) ohne Abheben zählt nicht.
  const hell = new Uint8ClampedArray(b * h * 4).fill(235);
  assert.equal(findeLichter({ data: hell, width: b, height: h }).length, 0);
  assert.deepEqual(findeLichter({ data: [], width: 2, height: 2 }), []);
});

test('Blitze sind deterministisch, kommen etwa alle 10 s, hellen zweimal auf und haben Zacken mit Ästen', () => {
  let blitze = 0;
  let zuletzt = false;
  for (let t = 0; t < 120; t += 0.05) {
    const a = blitzZustand(t, 3);
    const b = blitzZustand(t, 3);
    assert.deepEqual(a, b);
    assert.ok(a.hell >= 0 && a.hell <= 1);
    const an = a.hell > 0.05;
    if (an && !zuletzt) blitze += 1;
    zuletzt = an;
    if (a.zacken) {
      assert.ok(a.zacken.length >= 2 && a.zacken[0].length >= 8);
      for (const weg of a.zacken) for (const p of weg) assert.ok(p.x > -0.1 && p.x < 1.1 && p.y >= 0 && p.y <= 0.7);
    }
  }
  assert.ok(blitze >= 10 && blitze <= 14, `Blitze in 120 s: ${blitze}`);
  assert.notDeepEqual(blitzZustand(15.4, 1), blitzZustand(15.4, 2));
});

function fakeRenderer(key, optionen = {}) {
  const aufrufe = [];
  const farbverlauf = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (_, name) => {
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => farbverlauf;
      return (...a) => { aufrufe.push(String(name)); void a; };
    },
    set: () => true,
  });
  const k = kulisse(key);
  return { aufrufe, r: { ctx, width: 1920, height: 1080, time: 600, backdrop: k, backdropKey: key, reducedMotion: false, ...optionen } };
}

test('Zeichnen: Regen und Blitz im Sturm, nichts bei reduzierter Bewegung, nichts ohne Kulisse, Dichte skaliert die Tropfen', () => {
  const sturm = fakeRenderer('maritime/storm_night');
  zeichneWetterVorn(sturm.r, 1);
  const volleStriche = sturm.aufrufe.filter(a => a === 'lineTo').length;
  assert.ok(volleStriche > 50, `Regentropfen: ${volleStriche}`);
  const lite = fakeRenderer('maritime/storm_night');
  zeichneWetterVorn(lite.r, 0.5);
  assert.ok(lite.aufrufe.filter(a => a === 'lineTo').length < volleStriche * 0.6);

  const still = fakeRenderer('maritime/storm_night', { reducedMotion: true });
  zeichneWetterVorn(still.r, 1);
  assert.equal(still.aufrufe.filter(a => a === 'lineTo').length, 0, 'reduzierte Bewegung: kein Regen');

  const keine = fakeRenderer('maritime/storm_night', { backdrop: null });
  zeichneWetterVorn(keine.r, 1);
  zeichneWetterHinten(keine.r);
  assert.equal(keine.aufrufe.length, 0);

  const schnee = fakeRenderer('alpine/winter_snow');
  zeichneWetterVorn(schnee.r, 1);
  assert.ok(schnee.aufrufe.filter(a => a === 'arc').length > 50, 'Schneeflocken');
  assert.doesNotThrow(() => zeichneWetterHinten(sturm.r));
});
