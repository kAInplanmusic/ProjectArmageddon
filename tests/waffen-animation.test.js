/**
 * Waffen-Animation (`src/client/waffenAnimation.js`) und Atlas-Lader
 * (`src/client/waffenSprites.js`): Parameter, Zeitverlauf, Ruhezustand,
 * reduzierte Bewegung, Projektilwinkel, Schweif, Manifest-/Atlas-Lader.
 * Alles ohne Browser und Canvas.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { CHARACTERS } from '../src/shared/config/factions.js';
import { TYP_JE_CHARAKTER as FIGUR_TYP, PARAMETER as TYP_PARAMETER } from '../src/client/figurTypen.js';
import {
  KATEGORIEN, PARAMETER, KORREKTUREN, waffenParameter, parameterFuerWaffe, waffenPose, neuePose, neueZeiten, handPunkt,
  geschossDarstellung, geschossWinkel, flugWinkel, SchweifRing, SCHWEIF_LAENGE, GeschossLagen,
  FIGUR_OFFSETS, FIGURTYP_STANDARD, figurHand,
} from '../src/client/waffenAnimation.js';
import { erzeugeWaffenSprites, zellenFuer } from '../src/client/waffenSprites.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(
  path.join(HIER, '..', 'src', 'client', 'assets', 'weapon-sprites', 'manifest.json'), 'utf8'));

function pose(par, zeit, reduziert = false) {
  const z = { ...neueZeiten(), ...zeit };
  return { ...waffenPose(par, z, reduziert, neuePose()) };
}

const RUHE = { idle: 0, seitZiehen: Infinity, seitSchuss: Infinity };

test('Parameter gibt es für alle acht Katalogkategorien und alle Katalogkategorien sind abgedeckt', () => {
  assert.equal(KATEGORIEN.length, 8);
  for (const k of KATEGORIEN) {
    const p = PARAMETER[k];
    assert.ok(p, k);
    for (const feld of ['zelle', 'handVor', 'ziehenDauer', 'art', 'schussDauer', 'blitzForm']) {
      assert.ok(p[feld] !== undefined, `${k}.${feld}`);
    }
    assert.ok(p.zelle > 10 && p.zelle < 60, `${k}.zelle ${p.zelle}`);
    assert.ok(Object.isFrozen(p));
  }
  const katalog = new Set(WEAPONS.map(w => w.category));
  for (const k of katalog) assert.ok(PARAMETER[k], `Katalogkategorie ${k} ohne Parameter`);
});

test('Die Kategorien unterscheiden sich wie beschrieben', () => {
  assert.equal(PARAMETER.melee.art, 'hieb');
  assert.equal(PARAMETER.melee.blitzForm, 'keiner');
  assert.equal(PARAMETER.ranged.art, 'kurz');
  assert.equal(PARAMETER.heavy_ranged.art, 'schwer');
  assert.ok(PARAMETER.heavy_ranged.schussDauer > PARAMETER.ranged.schussDauer);
  assert.ok(PARAMETER.heavy_ranged.kick > PARAMETER.ranged.kick);
  assert.equal(PARAMETER.magic.art, 'zauber');
  assert.ok(PARAMETER.magic.heben > 0 && PARAMETER.magic.aufladen > 0);
  assert.equal(PARAMETER.tech.art, 'tech');
  assert.equal(PARAMETER.utility.art, 'selbst');
});

test('Korrekturen je Waffen-ID überschreiben einzelne Felder, Selbstwirkung hat nie einen Blitz', () => {
  const basis = waffenParameter('ranged', 'pa_zzz');
  assert.equal(basis.kick, PARAMETER.ranged.kick);
  const selbst = waffenParameter('ranged', 'pa_032', true);
  assert.equal(selbst.art, 'selbst');
  assert.equal(selbst.blitzForm, 'keiner');
  // Unbekannte Kategorie: Rückfall statt Absturz; gleicher Aufruf liefert dasselbe Objekt.
  assert.equal(waffenParameter('gibtsnicht', 'x'), waffenParameter('gibtsnicht', 'x'));
  for (const [id, k] of Object.entries(KORREKTUREN)) {
    assert.ok(WEAPONS.some(w => w.id === id), `Korrektur für unbekannte Waffe ${id}`);
    assert.ok(typeof k === 'object');
  }
});

test('Wurfwaffen: Wurfbewegung ohne Mündungsblitz; Kachel-Waffen kleiner und weiter vorn', () => {
  const wurf = waffenParameter('heavy_ranged', 'pa_zzz', false, 'objekt', true);
  assert.equal(wurf.art, 'hieb');
  assert.equal(wurf.blitzForm, 'keiner');
  const aus = pose(wurf, { ...RUHE, seitSchuss: 0.15 });
  assert.equal(aus.blitz, 0);
  assert.ok(Math.abs(aus.drehung) > 0.2, 'Wurf schwingt');
  const gewehr = waffenParameter('heavy_ranged', 'pa_zzz', false, 'objekt', false);
  assert.equal(gewehr.blitzForm, 'kegel');
  const kachel = waffenParameter('magic', 'pa_zzz', false, 'kachel');
  assert.ok(kachel.zelle < PARAMETER.magic.zelle && kachel.handVor > PARAMETER.magic.handVor);
  assert.equal(kachel.griff, 0, 'Kacheln haben keinen Schaftgriff');
  assert.equal(waffenParameter('ranged', 'pa_zzz', false, 'objekt').griff, PARAMETER.ranged.griffObjekt);
  // Aus Katalogwaffe und Sprite-Eintrag: Granate mit Zünder wird geworfen, Selbstwirkung nie mit Blitz.
  const granate = WEAPONS.find(w => w.id === 'pa_047');
  assert.equal(parameterFuerWaffe(granate, { form: 'kompakt', projektilInfo: { art: 'ding' } }).blitzForm, 'keiner');
  const selbst = WEAPONS.find(w => w.damage === 0);
  assert.equal(parameterFuerWaffe(selbst, { form: 'kachel', projektilInfo: null }).art, 'selbst');
});

test('Zeitverlauf ist deterministisch (gleiche Eingabe, gleiche Pose)', () => {
  for (const kat of KATEGORIEN) {
    const par = waffenParameter(kat, 'pa_x');
    for (const t of [0, 0.01, 0.07, 0.15, 0.3, 0.45, 0.9]) {
      const a = pose(par, { ...RUHE, seitSchuss: t, seitZiehen: t * 0.5, idle: 3.3 });
      const b = pose(par, { ...RUHE, seitSchuss: t, seitZiehen: t * 0.5, idle: 3.3 });
      assert.deepEqual(a, b, `${kat} t=${t}`);
      for (const v of Object.values(a)) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v));
      }
    }
  }
});

test('Der Schuss bewegt die Waffe, danach kehrt sie in den Ruhezustand zurück', () => {
  for (const kat of KATEGORIEN) {
    const par = waffenParameter(kat, 'pa_x');
    let maxBewegung = 0;
    for (let t = 0; t < par.schussDauer; t += 0.005) {
      const p = pose(par, { ...RUHE, seitSchuss: t }, false);
      maxBewegung = Math.max(maxBewegung, Math.abs(p.vor), Math.abs(p.drehung), Math.abs(p.hoch), Math.abs(p.skala - 1));
    }
    assert.ok(maxBewegung > 0.05, `${kat}: keine Bewegung beim Schuss`);
    // Nach Ablauf: exakt dieselbe Pose wie ohne Schuss.
    const ende = pose(par, { ...RUHE, seitSchuss: par.schussDauer + 0.001, idle: 1.1 });
    const ruhe = pose(par, { ...RUHE, idle: 1.1 });
    assert.deepEqual(ende, ruhe, `${kat}: kehrt nicht zurück`);
    // Ohne Idle-Pendeln (idle = 0) ist die Ruhe exakt null.
    const null0 = pose(par, { ...RUHE, idle: 0 });
    assert.equal(null0.vor, 0);
    assert.equal(null0.blitz, 0);
    assert.equal(null0.glanz, 0);
  }
});

test('Der Schuss ist am Anfang und am Ende der Bewegung stetig (kein Sprung)', () => {
  for (const kat of KATEGORIEN) {
    const par = waffenParameter(kat, 'pa_x');
    const schritt = 0.0005;
    let letzte = pose(par, { ...RUHE, seitSchuss: 0 });
    for (let t = schritt; t < par.schussDauer + 0.05; t += schritt) {
      const p = pose(par, { ...RUHE, seitSchuss: t });
      // Rückstoß 6 px und Drehung 1,5 rad in 0,5 ms ergäben ~12 px bzw. 3 rad/s-Sprünge; wir erlauben das Dreifache.
      assert.ok(Math.abs(p.vor - letzte.vor) < 0.9, `${kat} vor springt bei t=${t.toFixed(4)}`);
      assert.ok(Math.abs(p.drehung - letzte.drehung) < 0.25, `${kat} drehung springt bei t=${t.toFixed(4)}`);
      letzte = p;
    }
  }
});

test('Rückstoß: Gewehr kurz und scharf, schwere Waffe länger und mit Nachschwingen', () => {
  const kurz = waffenParameter('ranged', 'x');
  const schwer = waffenParameter('heavy_ranged', 'x');
  const k0 = pose(kurz, { ...RUHE, seitSchuss: 0.001 });
  assert.ok(k0.vor < -2.5, `Gewehr-Kick sofort: ${k0.vor}`);
  const s0 = pose(schwer, { ...RUHE, seitSchuss: 0.001 });
  assert.ok(s0.vor > k0.vor, 'schwere Waffe fährt langsamer an');
  // Nach 0,25 s ist das Gewehr fast in Ruhe, die schwere Waffe noch deutlich ausgelenkt.
  const k1 = pose(kurz, { ...RUHE, seitSchuss: 0.25 });
  const s1 = pose(schwer, { ...RUHE, seitSchuss: 0.25 });
  assert.ok(Math.abs(k1.vor) < 0.3);
  assert.ok(Math.abs(s1.vor) > Math.abs(k1.vor));
  // Nachschwingen: die Drehung wechselt bei der schweren Waffe das Vorzeichen.
  let vorzeichen = 0;
  let letzte = 0;
  for (let t = 0.05; t < schwer.schussDauer; t += 0.005) {
    const d = pose(schwer, { ...RUHE, seitSchuss: t }).drehung;
    if (letzte !== 0 && Math.sign(d) !== Math.sign(letzte) && d !== 0) vorzeichen += 1;
    letzte = d || letzte;
  }
  assert.ok(vorzeichen >= 1, 'kein Nachschwingen');
});

test('Nahkampf schwingt als Bogen (Ausholen, Hieb nach unten), ohne Blitz', () => {
  const par = waffenParameter('melee', 'x');
  const aus = pose(par, { ...RUHE, seitSchuss: 0.06 });
  const hieb = pose(par, { ...RUHE, seitSchuss: 0.22 });
  assert.ok(aus.drehung > 0.3, 'Ausholen hebt die Spitze');
  assert.ok(hieb.drehung < -1.2, 'Hieb senkt die Spitze tief');
  for (let t = 0; t < par.schussDauer; t += 0.01) {
    const p = pose(par, { ...RUHE, seitSchuss: t });
    assert.equal(p.blitz, 0);
    assert.equal(p.blitzForm, 'keiner');
  }
});

test('Magie: Heben und Aufladeglanz vor dem Blitz; Tech: Aufladen, dann Blitz; Selbstwirkung: Glanz, nie Blitz', () => {
  const magie = waffenParameter('magic', 'x');
  const m = pose(magie, { ...RUHE, seitSchuss: magie.aufladen * 0.9 });
  assert.ok(m.glanz > 0.5 && m.drehung > 0.2);
  assert.equal(m.blitz, 0, 'vor der Freigabe kein Blitz');
  const m2 = pose(magie, { ...RUHE, seitSchuss: magie.aufladen + 0.01 });
  assert.ok(m2.blitz > 0.8 && m2.blitzForm === 'ring');

  const tech = waffenParameter('tech', 'x');
  assert.equal(pose(tech, { ...RUHE, seitSchuss: tech.aufladen * 0.5 }).blitz, 0);
  assert.ok(pose(tech, { ...RUHE, seitSchuss: tech.aufladen + 0.005 }).blitz > 0.8);

  const selbst = waffenParameter('utility', 'x', true);
  let glanz = 0;
  for (let t = 0; t < selbst.schussDauer; t += 0.01) {
    const p = pose(selbst, { ...RUHE, seitSchuss: t });
    glanz = Math.max(glanz, p.glanz);
    assert.equal(p.blitz, 0);
  }
  assert.ok(glanz > 0.9);
});

test('Mündungsblitz: Form und Größe nach Kategorie, endet nach blitzDauer', () => {
  const formen = new Set();
  for (const kat of ['ranged', 'heavy_ranged', 'elemental', 'magic', 'tech', 'ultimate']) {
    const par = waffenParameter(kat, 'x');
    const p = pose(par, { ...RUHE, seitSchuss: par.aufladen + 0.002 });
    assert.ok(p.blitz > 0.5, kat);
    assert.equal(p.blitzForm, par.blitzForm);
    assert.equal(p.blitzGroesse, par.blitzGroesse);
    formen.add(p.blitzForm);
    assert.equal(pose(par, { ...RUHE, seitSchuss: par.aufladen + par.blitzDauer + 0.001 }).blitz, 0);
  }
  assert.ok(formen.size >= 3, 'die Formen unterscheiden sich');
  assert.ok(waffenParameter('heavy_ranged', 'x').blitzGroesse > waffenParameter('ranged', 'x').blitzGroesse);
});

test('Ziehen: Einschwingen von unten in ~0,25 s, Aufnehm-Blitz über der Silhouette', () => {
  const par = waffenParameter('ranged', 'x');
  assert.ok(Math.abs(par.ziehenDauer - 0.25) < 0.1);
  const start = pose(par, { ...RUHE, seitZiehen: 0, idle: 0 });
  assert.ok(start.hoch < -5, `startet unten: ${start.hoch}`);
  assert.ok(start.weiss > 0.5);
  const ende = pose(par, { ...RUHE, seitZiehen: par.ziehenDauer + 0.001, idle: 0 });
  assert.deepEqual(ende, pose(par, { ...RUHE, idle: 0 }), 'danach wie ohne Ziehen');
  assert.equal(ende.weiss, 0);
  // Monoton Richtung Ruhe (bis zum leichten Überschwingen).
  let letzte = start.hoch;
  for (let t = 0.01; t < par.ziehenDauer * 0.6; t += 0.01) {
    const h = pose(par, { ...RUHE, seitZiehen: t, idle: 0 }).hoch;
    assert.ok(h >= letzte - 1e-9);
    letzte = h;
  }
});

test('Idle: Pendeln und Atmen im Stand, begrenzt und periodisch', () => {
  const par = waffenParameter('ranged', 'x');
  let min = 1; let max = -1;
  for (let t = 0; t < 1 / par.idleTempo; t += 0.01) {
    const d = pose(par, { ...RUHE, idle: t }).drehung;
    min = Math.min(min, d); max = Math.max(max, d);
  }
  assert.ok(max > 0.02 && min < -0.02, 'pendelt');
  assert.ok(max <= par.idleDreh + 1e-9);
  const a = pose(par, { ...RUHE, idle: 0.4 });
  const b = pose(par, { ...RUHE, idle: 0.4 + 1 / par.idleTempo });
  assert.ok(Math.abs(a.drehung - b.drehung) < 1e-9);
});

test('Bildratenunabhängig: dieselbe Zeit liefert dieselbe Pose, gleich wie fein abgetastet wird', () => {
  const par = waffenParameter('heavy_ranged', 'x');
  const direkt = pose(par, { ...RUHE, seitSchuss: 0.3, idle: 0.3 });
  const p = neuePose();
  const z = neueZeiten();
  // „30 fps" und „144 fps": Zwischenschritte ändern nichts, die Pose hängt nur von der Zeit ab.
  for (const dt of [1 / 30, 1 / 144]) {
    for (let t = 0; t < 0.3 - 1e-9; t += dt) {
      z.seitSchuss = t; z.idle = t; waffenPose(par, z, false, p);
    }
    z.seitSchuss = 0.3; z.idle = 0.3; waffenPose(par, z, false, p);
    assert.deepEqual({ ...p }, direkt);
  }
});

test('prefers-reduced-motion: keine Bewegung, aber Blitz, Glanz, Abdunkelung bleiben', () => {
  for (const kat of KATEGORIEN) {
    const par = waffenParameter(kat, 'x');
    for (let t = 0; t < par.schussDauer; t += 0.01) {
      const p = pose(par, { ...RUHE, seitSchuss: t, seitZiehen: t * 0.3, idle: 1.7, bereit: 0.4 }, true);
      assert.equal(p.vor, 0, `${kat} vor`);
      assert.equal(p.hoch, 0, `${kat} hoch`);
      assert.equal(p.drehung, 0, `${kat} drehung`);
      assert.equal(p.skala, 1, `${kat} skala`);
      assert.ok(p.dunkel > 0 && p.ladung === 0.4);
    }
  }
  const par = waffenParameter('ranged', 'x');
  assert.ok(pose(par, { ...RUHE, seitSchuss: 0.005 }, true).blitz > 0.5, 'Blitz bleibt');
  assert.ok(pose(waffenParameter('magic', 'x'), { ...RUHE, seitSchuss: 0.1 }, true).glanz > 0.3, 'Glanz bleibt');
});

test('Nachladeanzeige: abgedunkelt mit Füllband bis bereit', () => {
  const par = waffenParameter('ranged', 'x');
  const halb = pose(par, { ...RUHE, bereit: 0.5 });
  assert.ok(halb.dunkel > 0.3 && halb.ladung === 0.5);
  const leer = pose(par, { ...RUHE, bereit: 0 });
  assert.ok(leer.dunkel > halb.dunkel);
  const bereit = pose(par, { ...RUHE, bereit: 1 });
  assert.equal(bereit.dunkel, 0);
  assert.equal(bereit.ladung, 1);
});

test('Treffer färbt die Waffe kurz weiß', () => {
  const par = waffenParameter('ranged', 'x');
  assert.equal(pose(par, { ...RUHE, treffer: 0.7 }).weiss, 0.7);
  assert.equal(pose(par, { ...RUHE, treffer: 3 }).weiss, 1);
});

test('Handpunkt: abhängig von Sprite-Höhe und Blickrichtung, Griff nie auf der falschen Seite', () => {
  const par = waffenParameter('ranged', 'x');
  const r = handPunkt(par, 1, 52, 10, { x: 0, y: 0 });
  const l = handPunkt(par, -1, 52, 10, { x: 0, y: 0 });
  assert.equal(r.x, -l.x);
  assert.ok(r.x > 0);
  assert.ok(Math.abs(r.y - -7.25) < 1e-9, `Standardhöhe ${r.y}`);
  const hoch = handPunkt(par, 1, 70, 10, { x: 0, y: 0 });
  assert.ok(hoch.y < r.y, 'größeres Sprite: Hand höher');
  const schwer = handPunkt(waffenParameter('heavy_ranged', 'x'), 1, 52, 10, { x: 0, y: 0 });
  assert.ok(schwer.y < r.y, 'schwere Waffe sitzt höher an der Schulter');
});

// ------------------------------------------------------------------ Projektile

test('Flugwinkel aus der Geschwindigkeit; ohne Bewegung der Rückfallwert', () => {
  assert.equal(flugWinkel(1, 0), 0);
  assert.ok(Math.abs(flugWinkel(0, 1) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(flugWinkel(-1, 0) - Math.PI) < 1e-12);
  assert.ok(Math.abs(flugWinkel(0, -1) + Math.PI / 2) < 1e-12);
  assert.equal(flugWinkel(0, 0, 1.25), 1.25);
});

test('Geschosswinkel: Flugrichtung, Zellenversatz, Eigenrotation nur ohne reduzierte Bewegung', () => {
  const flach = { spin: 0, versatz: 0 };
  assert.equal(geschossWinkel(0.7, flach, 5, false), 0.7);
  const dreht = { spin: 8, versatz: 0.5 };
  assert.ok(Math.abs(geschossWinkel(1, dreht, 0.25, false) - (1 - 0.5 + 2)) < 1e-12);
  assert.equal(geschossWinkel(1, dreht, 0.25, true), 0.5);
});

test('Eigenrotation für Granaten mit Zünder, Steine, Nahkampf-Wurfdinge und Bumerangs, nicht für Geschützgranaten, Raketen und Kugeln', () => {
  const dreht = (waffe, proj) => geschossDarstellung(waffe, proj).spin > 0;
  assert.ok(dreht({ id: 'a', category: 'ranged', fuseTime: 3 }, { art: 'ding' }), 'Handgranate trudelt');
  assert.ok(dreht({ id: 'a', category: 'ranged', bounces: 2 }, { art: 'ding' }), 'Abpraller trudelt');
  assert.ok(!dreht({ id: 'a', category: 'ranged', fuseTime: 0 }, { art: 'granate' }), 'Geschützgranate fliegt gerade');
  assert.ok(dreht({ id: 'a', category: 'elemental' }, { art: 'stein' }));
  assert.ok(dreht({ id: 'a', category: 'melee' }, { art: 'ding', spin: true }));
  assert.ok(dreht({ id: 'a', displayName: 'Bumerang', category: 'ranged' }, { art: 'ding' }));
  assert.ok(!dreht({ id: 'a', category: 'ranged' }, { art: 'rakete' }));
  assert.ok(!dreht({ id: 'a', category: 'ranged' }, { art: 'kugel' }));
  assert.ok(!dreht({ id: 'a', category: 'magic' }, { art: 'zauber' }));
  const v = geschossDarstellung({ id: 'a', category: 'x' }, { art: 'rakete', angle: 90 });
  assert.ok(Math.abs(v.versatz - Math.PI / 2) < 1e-12);
  assert.ok(v.groesse > 8 && v.groesse < 40);
});

test('Jedes Geschoss des Manifests bekommt eine brauchbare Darstellung', () => {
  const ids = Object.keys(MANIFEST.waffen).filter(id => MANIFEST.waffen[id].projectile);
  assert.ok(ids.length > 80);
  for (const id of ids) {
    const waffe = WEAPONS.find(w => w.id === id);
    assert.ok(waffe, id);
    const d = geschossDarstellung(waffe, MANIFEST.waffen[id].projectile);
    assert.ok(d.groesse > 8 && Number.isFinite(d.spin) && Number.isFinite(d.versatz), id);
  }
});

test('Schweif: Ringpuffer fester Länge, älteste zuerst, Sprung leert ihn', () => {
  const r = new SchweifRing();
  assert.equal(r.n, SCHWEIF_LAENGE);
  for (let i = 0; i < 20; i++) r.schiebe(i * 10, i);
  assert.equal(r.anzahl, SCHWEIF_LAENGE);
  assert.equal(r.xAn(r.anzahl - 1), 190);
  assert.equal(r.xAn(0), 190 - 70);
  // Stillstand fügt nichts hinzu.
  r.schiebe(190, 19);
  assert.equal(r.anzahl, SCHWEIF_LAENGE);
  // Teleport: neuer Schweif.
  r.schiebe(5000, 5000);
  assert.equal(r.anzahl, 1);
  assert.equal(r.xAn(0), 5000);
});

test('GeschossLagen: Winkel aus der Bewegung, Spawn-Ereignis liefert Waffe, verschwundene Geschosse werden vergessen', () => {
  const g = new GeschossLagen();
  g.merke(7, 'pa_010', 0, 100);
  g.fuehre([{ entityId: 7, x: 0, y: 0, owner: 1 }], 0);
  const s = g.lage(7);
  assert.equal(s.waffeId, 'pa_010');
  assert.ok(Math.abs(s.flug - Math.PI / 2) < 1e-12, 'Anfangsrichtung aus dem Ereignis');
  g.fuehre([{ entityId: 7, x: 10, y: 10, owner: 1 }], 0.016);
  assert.ok(Math.abs(g.lage(7).flug - Math.PI / 4) < 1e-12);
  g.fuehre([{ entityId: 7, x: 10, y: 10, owner: 1 }], 0.032);
  assert.ok(Math.abs(g.lage(7).flug - Math.PI / 4) < 1e-12, 'ohne Bewegung bleibt der Winkel');
  assert.equal(g.lage(7).ring.anzahl, 2);
  g.fuehre([], 0.05);
  assert.equal(g.lage(7), null);
  g.merke(8, 'x'); g.leere();
  g.fuehre([{ entityId: 8, x: 0, y: 0 }], 0);
  assert.equal(g.lage(8).waffeId, '');
});

// ------------------------------------------------------------------ Lader

test('Das Manifest deckt alle Katalogwaffen mit Zellen, Ankern und Blitzfarbe ab', () => {
  for (const w of WEAPONS) {
    const z = zellenFuer(MANIFEST, w.id);
    assert.ok(z, `${w.id} fehlt im Manifest`);
    assert.ok(MANIFEST.atlanten[z.atlas], `${w.id}: Atlas ${z.atlas}`);
    assert.match(z.flashColor, /^#[0-9a-f]{6}$/i, w.id);
    assert.ok(z.grip.x >= 0 && z.grip.x <= 128 && z.muzzle.x <= 128, w.id);
  }
  assert.equal(zellenFuer(MANIFEST, 'pa_gibtsnicht'), null);
  assert.equal(zellenFuer(null, 'pa_001'), null);
});

class FalscheLeinwand {
  constructor(b, h) {
    this.width = b; this.height = h; this.aufrufe = [];
    this.kontext = {
      imageSmoothingQuality: '',
      drawImage: (...a) => this.aufrufe.push(a),
      fillRect() {},
      createRadialGradient: () => ({ addColorStop() {} }),
    };
  }

  getContext() { return this.kontext; }
}

function lader(opt = {}) {
  const log = { manifest: 0, bilder: [], leinwaende: 0 };
  const abh = {
    ladeManifest: () => { log.manifest += 1; return opt.manifest ?? Promise.resolve(MANIFEST); },
    atlasUrl: datei => `/a/${datei}`,
    ladeBild: (url) => {
      log.bilder.push(url);
      return opt.bild ? opt.bild(url) : Promise.resolve({ atlas: url });
    },
    neueLeinwand: (b, h) => { log.leinwaende += 1; return new FalscheLeinwand(b, h); },
  };
  return { sprites: erzeugeWaffenSprites(abh), log };
}

const tick = () => new Promise(r => setTimeout(r, 0));

test('Lader: lazy — erst der Aufruf lädt Manifest und genau den Atlas der Kategorie', async () => {
  const { sprites, log } = lader();
  assert.equal(log.manifest, 0);
  assert.equal(log.bilder.length, 0);
  const melee = WEAPONS.find(w => w.category === 'melee');
  assert.equal(sprites.hole(melee), null, 'erster Aufruf: noch nicht bereit');
  assert.equal(sprites.hole(melee), null);
  await tick(); await tick();
  assert.equal(log.manifest, 1);
  assert.deepEqual(log.bilder, ['/a/atlas_melee.png'], 'nur der Atlas der benutzten Kategorie');
  const e = sprites.hole(melee);
  assert.ok(e, 'bereit');
  for (const f of ['held', 'silhouette', 'farbig', 'dunkel', 'glanz']) assert.ok(e[f], f);
  assert.ok(e.projektil, 'Nahkampfwaffen werfen');
  assert.ok(e.grip.x >= 0 && e.muzzle.x > e.grip.x);
  assert.equal(e.held.width, 64);
  assert.equal(e.projektil.width, 32);
  // Der Zugriff danach legt nichts mehr an (kein Allokieren je Bild).
  const vorher = log.leinwaende;
  for (let i = 0; i < 100; i++) assert.equal(sprites.hole(melee), e);
  assert.equal(log.leinwaende, vorher);
  // Die Zelle wird aus dem richtigen Rechteck des Atlas geschnitten.
  const z = MANIFEST.waffen[melee.id].held;
  assert.deepEqual(e.held.aufrufe[0].slice(1, 5), [z.x, z.y, z.w, z.h]);
});

test('Lader: zweite Waffe derselben Kategorie lädt den Atlas nicht noch einmal, andere Kategorie einen zweiten', async () => {
  const { sprites, log } = lader();
  const [a, b] = WEAPONS.filter(w => w.category === 'ranged');
  const magic = WEAPONS.find(w => w.category === 'magic');
  sprites.hole(a); sprites.hole(b);
  await tick(); await tick();
  assert.ok(sprites.hole(a) && sprites.hole(b));
  assert.equal(log.bilder.length, 1);
  sprites.hole(magic);
  await tick(); await tick();
  assert.deepEqual(log.bilder, ['/a/atlas_ranged.png', '/a/atlas_magic.png']);
  assert.ok(sprites.hole(magic));
  const z = sprites.zustand();
  assert.equal(z.bereit, 3);
  assert.equal(z.atlasLadungen, 2);
  assert.equal(z.manifestLadungen, 1);
});

test('Lader: Waffe ohne Geschoss liefert projektil null', async () => {
  const { sprites } = lader();
  const w = WEAPONS.find(x => x.category === 'utility');
  sprites.hole(w);
  await tick(); await tick();
  const e = sprites.hole(w);
  assert.ok(e);
  assert.equal(e.projektil, null);
  assert.equal(e.projektilInfo, null);
});

test('Lader: fehlt der Atlas, bleibt es dauerhaft bei null (Fallback auf das Icon), ohne erneute Ladeversuche', async () => {
  const { sprites, log } = lader({ bild: () => Promise.reject(new Error('404')) });
  const w = WEAPONS.find(x => x.category === 'tech');
  assert.equal(sprites.hole(w), null);
  await tick(); await tick();
  for (let i = 0; i < 5; i++) assert.equal(sprites.hole(w), null);
  await tick();
  assert.equal(log.bilder.length, 1);
  assert.equal(sprites.zustand().fehlt, 1);
  // Eine weitere Waffe derselben Kategorie: auch null, kein neuer Versuch.
  const w2 = WEAPONS.filter(x => x.category === 'tech')[1];
  assert.equal(sprites.hole(w2), null);
  await tick();
  assert.equal(sprites.hole(w2), null);
  assert.equal(log.bilder.length, 1);
});

test('Lader: fehlt das Manifest oder ist es kaputt, gibt es nur null und keinen Absturz', async () => {
  for (const manifest of [Promise.reject(new Error('404')), Promise.resolve({ unfug: true }), Promise.resolve(null)]) {
    const { sprites, log } = lader({ manifest });
    const w = WEAPONS[0];
    assert.equal(sprites.hole(w), null);
    await tick(); await tick();
    assert.equal(sprites.hole(w), null);
    assert.equal(log.bilder.length, 0, 'ohne Manifest wird kein Atlas geladen');
    assert.equal(sprites.hole(WEAPONS[1]), null);
    assert.equal(sprites.zustand().manifest, 'fehlt');
  }
});

test('Lader: unbekannte Waffe und null sind sicher', async () => {
  const { sprites } = lader();
  assert.equal(sprites.hole(null), null);
  assert.equal(sprites.hole({ id: 'pa_nichtda', category: 'melee' }), null);
  await tick(); await tick();
  assert.equal(sprites.hole({ id: 'pa_nichtda', category: 'melee' }), null);
});

// ------------------------------------------------------------------ Figurtypen und Handoffsets

test('Handoffset-Tabelle: jede der 81 Figuren hat einen gültigen Figurtyp, Korrekturen betreffen nur bekannte Figuren', () => {
  assert.equal(CHARACTERS.length, 81);
  for (const c of CHARACTERS) {
    const typ = FIGUR_TYP[c.id];
    assert.ok(typ && TYP_PARAMETER[typ], `${c.id}: kein Figurtyp in FIGUR_TYP`);
  }
  const ids = new Set(CHARACTERS.map(c => c.id));
  for (const id of Object.keys(FIGUR_TYP)) assert.ok(ids.has(id), `FIGUR_TYP: unbekannte Figur ${id}`);
  for (const id of Object.keys(FIGUR_OFFSETS)) assert.ok(ids.has(id), `FIGUR_OFFSETS: unbekannte Figur ${id}`);
  for (const [name, t] of Object.entries(TYP_PARAMETER)) {
    assert.ok(t.handAnteil > 0.15 && t.handAnteil < 0.7, `${name}: handAnteil ${t.handAnteil}`);
    assert.ok(t.handAufbau === 0 || t.handAufbau === 1);
    assert.ok(t.handSkala > 0.5 && t.handSkala < 1.5);
  }
  // Alle Typen kommen vor.
  const benutzt = new Set(Object.values(FIGUR_TYP));
  for (const name of Object.keys(TYP_PARAMETER)) assert.ok(benutzt.has(name), `Figurtyp ${name} wird nie verwendet`);
});

test('figurHand: Standard ist der Humanoide; Typ und Feinkorrektur wirken auf den Handpunkt', () => {
  assert.equal(figurHand(undefined).typ, FIGURTYP_STANDARD);
  assert.equal(figurHand('gibt-es-nicht').typ, 'humanoid');
  assert.equal(figurHand('captain-sven'), figurHand('captain-sven'), 'Ergebnis wird gemerkt');
  const par = waffenParameter('ranged', 'x');
  const mensch = handPunkt(par, 1, 52, 10, { x: 0, y: 0 }, figurHand('captain-sven'));
  assert.ok(Math.abs(mensch.y - -7.25) < 1e-9, 'Humanoide: wie bisher');
  const tier = handPunkt(par, 1, 52, 10, { x: 0, y: 0 }, figurHand('pikamon'));
  assert.ok(tier.x < mensch.x, 'Tiere tragen die Waffe weiter hinten auf dem Rücken');
  const tank = figurHand('heavy-battery-moerser-bot');
  assert.equal(tank.typ, 'fahrzeug');
  assert.equal(tank.aufbau, true);
  const links = handPunkt(par, -1, 52, 10, { x: 0, y: 0 }, figurHand('pikamon'));
  assert.equal(links.x, -tier.x, 'Spiegelung bei Blick nach links');
  // Feinkorrektur überschreibt den Typ
  assert.equal(figurHand('storm-talon').handAnteil, FIGUR_OFFSETS['storm-talon'].handAnteil);
});

test('Kachel-Waffen: Orb oder Motiv je nach Manifest, Rücken-Waffen liegen hinter dem Körper', () => {
  const orb = waffenParameter('utility', 'pa_118', false, 'kachel', false, 'orb');
  const motiv = waffenParameter('utility', 'pa_118', false, 'kachel', false, 'motiv');
  assert.equal(orb.orb, true);
  assert.equal(motiv.orb, false);
  assert.ok(motiv.zelle > orb.zelle, 'Motiv wird größer gezeichnet als der Orb');
  const sp = { form: 'kachel', kachel: 'orb', projektilInfo: null };
  assert.equal(parameterFuerWaffe(WEAPONS.find(w => w.id === 'pa_118'), sp).orb, true);
  assert.equal(waffenParameter('utility', 'pa_112', false, 'kompakt').lage, 'hinter');
  assert.equal(waffenParameter('melee', 'pa_001', false, 'objekt').lage, 'vor', 'Nahkampf liegt vor dem Körper');
  // Kompakte Sprites werden etwas vor dem Körper gehalten.
  assert.ok(waffenParameter('ranged', 'pa_zzz', false, 'kompakt').handVor > PARAMETER.ranged.handVor);
});

test('Manifest: Waffen mit Kachel-Modus orb brauchen keine Motiv-Maske, alle 28 haben einen Modus', () => {
  const kacheln = Object.values(MANIFEST.waffen).filter(w => w.form === 'kachel');
  assert.equal(kacheln.length, 28);
  for (const w of kacheln) assert.ok(['motiv', 'orb'].includes(w.kachel.modus), w.id);
  const z = zellenFuer(MANIFEST, kacheln[0].id);
  assert.ok(['motiv', 'orb'].includes(z.kachel));
});

// ------------------------------------------------------------------ Unterscheidbarkeit der Schüsse

/** Messwerte einer Kategorie: größter Rückstoßweg, Dauer, Blitzfläche, größte Drehung (Heben/Hieb). */
function schussMasse(kat) {
  const par = waffenParameter(kat, 'pa_zzz', false, 'objekt');
  let vor = 0;
  let drehung = 0;
  for (let t = 0; t < par.schussDauer; t += 0.004) {
    const p = pose(par, { ...RUHE, seitSchuss: t }, false);
    vor = Math.max(vor, -p.vor);
    drehung = Math.max(drehung, Math.abs(p.drehung));
  }
  return { vor, dauer: par.schussDauer, blitz: par.blitzGroesse ** 2, drehung, koerper: par.koerper, ausfall: par.ausfall, start: par.start };
}

test('Schüsse der Kategorien unterscheiden sich messbar (Rückstoßweg, Dauer, Blitzfläche, Drehung)', () => {
  const masse = Object.fromEntries(KATEGORIEN.map(k => [k, schussMasse(k)]));
  const verschieden = (a, b) => (a === 0 || b === 0 ? a !== b : Math.max(a, b) / Math.min(a, b) >= 1.25);
  for (let i = 0; i < KATEGORIEN.length; i++) {
    for (let j = i + 1; j < KATEGORIEN.length; j++) {
      const a = masse[KATEGORIEN[i]];
      const b = masse[KATEGORIEN[j]];
      const unterschiede = ['vor', 'dauer', 'blitz', 'drehung'].filter(m => verschieden(a[m], b[m]));
      assert.ok(unterschiede.length >= 2, `${KATEGORIEN[i]} und ${KATEGORIEN[j]} unterscheiden sich nur in ${unterschiede.join(',') || 'nichts'}`);
    }
  }
  // Die Grundsätze: schwere Waffen stoßen weiter, länger und blitzen größer als Gewehre.
  assert.ok(masse.heavy_ranged.vor >= 1.8 * masse.ranged.vor, 'Rückstoßweg schwer ≥ 1,8 × Gewehr');
  assert.ok(masse.heavy_ranged.dauer >= 2.5 * masse.ranged.dauer, 'Dauer schwer ≥ 2,5 × Gewehr');
  assert.ok(masse.heavy_ranged.blitz >= 2.5 * masse.ranged.blitz, 'Blitzfläche schwer ≥ 2,5 × Gewehr');
  assert.ok(masse.heavy_ranged.ausfall > 0.5 && masse.ranged.ausfall === 0, 'Ausfallschritt nur bei schweren Waffen');
  assert.ok(masse.heavy_ranged.koerper > masse.ranged.koerper && masse.ranged.koerper > masse.magic.koerper, 'Oberkörper-Kick nimmt von schwer über Gewehr zu Magie ab');
  assert.ok(masse.heavy_ranged.start > masse.ranged.start, 'Startglanz schwer größer');
  assert.equal(masse.melee.start, 0);
});

test('Schnelle Schussfolgen: keine Drift, die Pose hängt nur von der Zeit seit dem letzten Schuss ab', () => {
  for (const kat of KATEGORIEN) {
    const par = waffenParameter(kat, 'pa_zzz', false, 'objekt');
    const frisch = pose(par, { ...RUHE, seitSchuss: 0.05 }, false);
    // 40 Schüsse im Abstand von 60 ms, dazwischen abgetastet: keine Zustandsreste.
    for (let n = 0; n < 40; n++) {
      pose(par, { ...RUHE, seitSchuss: (n % 7) * 0.06 }, false);
    }
    assert.deepEqual(pose(par, { ...RUHE, seitSchuss: 0.05 }, false), frisch, `${kat}: Pose hängt vom Verlauf ab`);
    // Nach Ablauf kehrt alles in die Ruhe zurück.
    const ende = pose(par, { ...RUHE, seitSchuss: par.schussDauer + 0.01 }, true);
    assert.equal(ende.vor, 0);
    assert.equal(ende.drehung, 0);
    const p = pose(par, { ...RUHE, seitSchuss: 0.01 }, false);
    assert.ok(Math.abs(p.vor) <= par.kick * 1.3 + 1 && Math.abs(p.drehung) <= 2.2, `${kat}: Ausschlag unbeschränkt`);
  }
});

test('Geschoss: Startglanz je Kategorie, Oberkörper-Kick und Ausfallschritt wirken in der Figurpose', async () => {
  const w = c => WEAPONS.find(x => x.category === c);
  assert.ok(geschossDarstellung(w('heavy_ranged'), null).start > geschossDarstellung(w('ranged'), null).start);
  const { FigurPosen } = await import('../src/client/figurAnimation.js');
  const messe = (opt) => {
    const f = new FigurPosen();
    const e = { entityId: 1, x: 100, y: 100 };
    const par = TYP_PARAMETER.humanoid;
    f.pose(e, 0, { params: par, typ: 'humanoid', winkel: 0, feuer: 0 });
    let dx = 0;
    let sy = 1;
    for (let i = 1; i <= 40; i++) {
      const p = f.pose(e, i / 60, { params: par, typ: 'humanoid', winkel: 0, feuer: i === 1 ? 1 : 0.9, ...opt });
      dx = Math.min(dx, p.dx);
      sy = Math.min(sy, p.sy);
    }
    return { dx, sy };
  };
  const leicht = messe({ schussStaerke: 0.5, ausfall: 0 });
  const schwer = messe({ schussStaerke: 2.4, ausfall: 1 });
  assert.ok(schwer.dx < leicht.dx - 1, `Oberkörper-Kick schwer ${schwer.dx} gegen leicht ${leicht.dx}`);
  assert.ok(schwer.sy < leicht.sy - 0.03, 'Ausfallschritt: Figur geht in die Knie');
});
