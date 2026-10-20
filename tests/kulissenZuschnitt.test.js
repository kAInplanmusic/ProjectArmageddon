import assert from 'node:assert/strict';
import test from 'node:test';
import { coverZuschnitt, glutStaerke } from '../src/client/kulissenZuschnitt.js';

/** Das Quellrechteck muss dasselbe Seitenverhältnis wie die Fläche haben (kein Stauchen). */
function verhaeltnisGleich(z, fb, fh) {
  assert.ok(Math.abs(z.sb / z.sh - fb / fh) < 1e-9, `verzerrt: ${z.sb}/${z.sh} vs ${fb}/${fh}`);
}

const FLAECHEN = { quer: [1600, 900], hoch: [600, 1000], quadrat: [800, 800] };
const BILDER = [[1440, 617], [1440, 768], [672, 1568], [1024, 1024], [880, 1184]];

test('cover-Zuschnitt verzerrt nie und bleibt im Bild', () => {
  for (const [fb, fh] of Object.values(FLAECHEN)) {
    for (const [bb, bh] of BILDER) {
      for (const pan of [0, 0.5, 1]) {
        const z = coverZuschnitt(bb, bh, fb, fh, pan);
        verhaeltnisGleich(z, fb, fh);
        assert.ok(z.sx >= -1e-9 && z.sx + z.sb <= bb + 1e-9, 'x außerhalb');
        assert.ok(z.sy === 0 && z.sh <= bh + 1e-9, 'y außerhalb oder nicht oben ausgerichtet');
      }
    }
  }
});

test('Parallax verschiebt nur breite Überstände; Himmel bleibt oben', () => {
  const links = coverZuschnitt(1440, 617, 600, 1000, 0);
  const rechts = coverZuschnitt(1440, 617, 600, 1000, 1);
  assert.equal(links.sx, 0);
  assert.ok(rechts.sx > 0);
  // Hochformat-Fläche: das Bild füllt die Höhe ganz, keine vertikale Beschneidung.
  assert.equal(links.sh, 617);
  // Bild ohne Breitenüberstand: Pan wirkungslos.
  const gleich = coverZuschnitt(1000, 1000, 800, 800, 1);
  assert.equal(gleich.sx, 0);
});

test('Ungültige Eingaben ergeben ein endliches Rechteck; Glut steigt mit der Runde', () => {
  const z = coverZuschnitt(0, 0, 100, 100, NaN);
  assert.ok(Number.isFinite(z.sb) && Number.isFinite(z.sh));
  assert.equal(glutStaerke(1), 0);
  assert.ok(glutStaerke(6) > glutStaerke(2));
  assert.equal(glutStaerke(999), 0.3);
  assert.equal(glutStaerke(undefined), 0);
});
