/**
 * Tests: Kameraführung — reine Zielberechnung und Regie (ohne Browser).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { begrenzeAnsicht, Camera } from '../src/client/camera.js';
import {
  zielAusschnitt, flugAusschnitt, glaette, bogenZoom, stossFuer, stossKurve, gegnerImSchussweg,
  figurImSicheren, zoomBevorzugt,
} from '../src/client/kameraZiel.js';
import { KameraRegie } from '../src/client/kameraRegie.js';
import { seitenRaender } from '../src/client/sichtbereich.js';

const karte = { b: 2560, h: 1440 };
const schirm = { b: 2560, h: 1440 };
const rand = { oben: 144, unten: 220, links: 470, rechts: 0 };
const pad = { halb: 60, oben: 120, unten: 30 };

test('Die Klemmung zeigt nie leere Welt neben der Karte', () => {
  for (const zoom of [1, 1.5, 2.5, 4]) {
    for (const [x, y] of [[0, 0], [2560, 1440], [-500, 3000], [1280, 720]]) {
      const a = begrenzeAnsicht({ x, y, zoom }, karte, schirm, rand);
      const k = new Camera({ mapBreite: 2560, mapHoehe: 1440, schirmBreite: 2560, schirmHoehe: 1440 });
      k.setzeRand(rand);
      k.setzeAnsicht(x, y, zoom);
      const o = k.schirmZuKarte(0, 0);
      const u = k.schirmZuKarte(2560, 1440);
      if (schirm.b / zoom < karte.b) {
        assert.ok(o.x >= -1e-6 && u.x <= karte.b + 1e-6, `x bei Zoom ${zoom}`);
      }
      if (schirm.h / zoom < karte.h) {
        assert.ok(o.y >= -1e-6 && u.y <= karte.h + 1e-6, `y bei Zoom ${zoom}`);
      }
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    }
  }
});

test('Der Bildschub zeigt ebenfalls keine leere Welt', () => {
  const k = new Camera({ mapBreite: 2560, mapHoehe: 1440, schirmBreite: 2560, schirmHoehe: 1440 });
  k.setzeAnsicht(0, 0, 2);
  k.setzeStoss(-14, -14);
  const o = k.schirmZuKarte(0, 0);
  assert.ok(o.x >= -1e-6 && o.y >= -1e-6);
});

test('Ausschnitt: Figur am linken Rand steht nicht hinter dem Seitenpanel', () => {
  const aktiv = { x: 330, y: 700, winkel: Math.PI / 4 };
  const a = zielAusschnitt({ aktiv, karte, schirm, rand, pad });
  assert.ok(a.sicher, 'Figur im sicheren Bereich');
  assert.ok(figurImSicheren(aktiv, a, karte, schirm, rand, pad));
});

test('Ausschnitt: Gegner im Schussweg zählen, Gegner entgegen der Richtung nicht', () => {
  const aktiv = { x: 800, y: 700, winkel: 0.3 };
  const gegner = [{ x: 1500, y: 650 }, { x: 100, y: 700 }];
  const a = zielAusschnitt({ aktiv, gegner, karte, schirm, rand, pad });
  assert.deepEqual(gegnerImSchussweg(aktiv, 0.3, gegner), [{ x: 1500, y: 650 }]);
  assert.ok(a.zoom >= Math.min(schirm.b / karte.b, schirm.h / karte.h));
});

test('Ausschnitt im Hochformat bleibt in den Zoomgrenzen', () => {
  const kl = { b: 1440, h: 2560 };
  const a = zielAusschnitt({
    aktiv: { x: 200, y: 1500, winkel: 1 }, karte: kl, schirm: kl,
    rand: { oben: 200, unten: 300, links: 250, rechts: 0 }, pad,
  });
  assert.ok(a.zoom >= 1 && a.zoom <= 4);
  assert.ok(zoomBevorzugt(kl, kl) <= 4);
});

test('Geschoss: Vorausschau und Zoom-Out bei großer Flugweite', () => {
  const nah = flugAusschnitt({ geschosse: [{ x: 900, y: 600 }], tempo: { x: 500, y: -100 }, ursprung: { x: 800, y: 700 }, karte, schirm, rand });
  const weit = flugAusschnitt({ geschosse: [{ x: 2200, y: 600 }], tempo: { x: 500, y: 100 }, ursprung: { x: 300, y: 700 }, karte, schirm, rand });
  assert.ok(weit.zoom < nah.zoom, 'weiter Flug zoomt heraus');
  assert.ok(nah.x > 900 - 1, 'Mitte liegt vor dem Geschoss');
});

test('Glättung: kein Überschwingen, erreicht das Ziel', () => {
  let w = 0; let v = 0;
  for (let i = 0; i < 120; i += 1) {
    ({ wert: w, tempo: v } = glaette(w, v, 100, 0.25, 1 / 60));
    assert.ok(w <= 100.000001);
  }
  assert.ok(Math.abs(w - 100) < 0.5);
});

test('Weg-Easing: großer Abstand zoomt heraus, Abstand 0 nicht', () => {
  assert.equal(bogenZoom(2, 0, 2560, 1), 2);
  assert.ok(bogenZoom(2, 2000, 2560, 1) < 1.2);
  assert.ok(bogenZoom(2, 99999, 2560, 1) >= 1);
});

test('Stoß skaliert nach Radius und Kategorie, kleine Treffer bleiben still', () => {
  assert.equal(stossFuer({ radius: 0 }), null);
  const klein = stossFuer({ radius: 40, kategorie: 'ranged' });
  const gross = stossFuer({ radius: 120, kategorie: 'heavy_ranged' });
  assert.ok(gross.amplitude > klein.amplitude);
  assert.ok(gross.amplitude <= 14);
  assert.equal(stossKurve(0, 1), 0);
  assert.equal(stossKurve(1, 1), 0);
  assert.ok(stossKurve(0.15, 1) > 0.99);
});

test('Seitenränder zählen nur Panels links/rechts in der Mittelzone', () => {
  const s = { b: 1280, h: 720 };
  const r = seitenRaender(s, [
    { x: 12, y: 80, b: 220, h: 267 },
    { x: 130, y: 650, b: 150, h: 40 },
    { x: 300, y: 455, b: 670, h: 150 },
  ]);
  assert.equal(r.links, 232);
  assert.equal(r.rechts, 0);
});

function eingabe(extra = {}) {
  return {
    karte, schirm, rand, pad, zoomMax: 4, aktivId: 1, aktiv: { x: 800, y: 700, winkel: 0.5 },
    gegner: [], geschosse: [], wiederholung: null, krater: null, waffe: null,
    ansicht: { x: 1280, y: 720, zoom: 1 }, ...extra,
  };
}

test('Regie: Zugwechsel fährt weich, Bewegungsreduktion schneidet hart', () => {
  const r = new KameraRegie();
  let a = null;
  for (let i = 0; i < 20; i += 1) a = r.schritt(1 / 60, eingabe());
  const vorher = { x: a.x, y: a.y };
  const neu = { aktivId: 2, aktiv: { x: 2200, y: 600, winkel: 2 } };
  a = r.schritt(1 / 60, eingabe(neu));
  assert.ok(Math.hypot(a.x - vorher.x, a.y - vorher.y) < 60, 'erster Schritt klein');
  for (let i = 0; i < 90; i += 1) a = r.schritt(1 / 60, eingabe(neu));
  assert.ok(a.x > 1500, 'nach 1,5 s am neuen Ziel');

  const h = new KameraRegie();
  h.setzeReduziert(true);
  for (let i = 0; i < 20; i += 1) h.schritt(1 / 60, eingabe());
  const s = h.schritt(1 / 60, eingabe(neu));
  assert.ok(s.x > 1500, 'harter Schnitt');
});

test('Regie: Geschoss verfolgt, Einschlag schiebt, danach Rückkehr; reduziert ohne Stoß', () => {
  for (const reduziert of [false, true]) {
    const r = new KameraRegie();
    r.setzeReduziert(reduziert);
    for (let i = 0; i < 30; i += 1) r.schritt(1 / 60, eingabe());
    let a;
    const krater = { id: {}, x: 1500, y: 800, radius: 90 };
    for (let i = 0; i < 40; i += 1) {
      a = r.schritt(1 / 60, eingabe({ geschosse: [{ x: 800 + i * 18, y: 600 }], waffe: { kategorie: 'heavy_ranged', radius: 90 } }));
    }
    assert.equal(r.phase, 'verfolgung');
    a = r.schritt(1 / 60, eingabe({ krater }));
    assert.equal(r.phase, 'einschlag');
    let maxStoss = 0;
    for (let i = 0; i < 10; i += 1) {
      a = r.schritt(1 / 60, eingabe({ krater }));
      maxStoss = Math.max(maxStoss, Math.hypot(a.stoss.x, a.stoss.y));
    }
    if (reduziert) assert.equal(maxStoss, 0); else assert.ok(maxStoss > 1);
    for (let i = 0; i < 60; i += 1) a = r.schritt(1 / 60, eingabe({ krater }));
    assert.equal(r.phase, 'uebersicht');
  }
});

test('Regie: Spielereingriff und Modus frei überschreiben die Automatik', () => {
  const r = new KameraRegie();
  for (let i = 0; i < 10; i += 1) r.schritt(1 / 60, eingabe());
  r.uebersteuere();
  assert.equal(r.schritt(1 / 60, eingabe()), null);
  assert.ok(r.schritt(1 / 60, eingabe({ aktivId: 2 })), 'Zugwechsel hebt den Eingriff auf');
  r.setzeModus('frei');
  assert.equal(r.schritt(1 / 60, eingabe({ aktivId: 3 })), null);
  r.schalteModus();
  assert.equal(r.modus, 'folgt');
});
