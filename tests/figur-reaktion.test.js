// FIGUREN-B: Angst (B3) und Rückwärtssalto (B6) — reine Darstellung, deterministisch aus Kennung und Bewegung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGST_RADIUS, angstDauer, angstAn, meldeGefahr, vergesseGefahren, istSalto, SALTO_VX, saltoWinkel, saltoVersatz,
} from '../src/client/figurReaktion.js';
import { FigurPosen } from '../src/client/figurAnimation.js';
import { waehleEmotion } from '../src/client/figurSheets.js';
import { PARAMETER } from '../src/client/figurTypen.js';

test('Angstdauer liegt je Figur zwischen 1,0 und 1,5 s und hängt nur an der Kennung', () => {
  for (let id = 0; id < 200; id += 1) {
    const d = angstDauer(id);
    assert.ok(d >= 1 && d <= 1.5, `${id}: ${d}`);
    assert.equal(d, angstDauer(id));
  }
  assert.notEqual(angstDauer(1), angstDauer(2));
});

test('Angst: nur im Umkreis von 150 px und nur für die Dauer; stärkster Einschlag zählt', () => {
  vergesseGefahren();
  meldeGefahr(1000, 500, 10);
  assert.equal(angstAn(1000 + ANGST_RADIUS - 1, 500, 3, 10.2).rest > 0.7, true);
  assert.equal(angstAn(1000 + ANGST_RADIUS + 1, 500, 3, 10.2).rest, 0, 'außerhalb');
  assert.equal(angstAn(1000, 500, 3, 10 + angstDauer(3) + 0.01).rest, 0, 'abgelaufen');
  assert.equal(angstAn(1000, 500, 3, 9.9).rest, 0, 'vor dem Einschlag');
  assert.equal(angstAn(1050, 500, 3, 10.1).weg, 1, 'rechts vom Einschlag: weg nach rechts');
  assert.equal(angstAn(950, 500, 3, 10.1).weg, -1);
  vergesseGefahren();
  assert.equal(angstAn(1000, 500, 3, 10.1).rest, 0);
});

test('Salto: nur schnelle Rückwärtssprünge; Normalsprünge (auch beim Gehen, schnelle Klasse) nicht', () => {
  assert.equal(istSalto(-288, 1), true, 'Salto aus dem Stand nach hinten (Blick rechts)');
  assert.equal(istSalto(288, -1), true);
  assert.equal(istSalto(288, 1), false, 'nach vorn ist kein Rückwärtssalto');
  assert.equal(istSalto(-245, 1), false, 'Normalsprung rückwärts mit Gehen und schneller Klasse');
  assert.equal(istSalto(-144, 1), false);
  assert.ok(SALTO_VX > 245 && SALTO_VX < 288);
});

test('Salto-Drehung: eine volle Runde, am Anfang und Ende aufrecht, Körpermitte bleibt an ihrem Platz', () => {
  assert.equal(Math.abs(saltoWinkel(0, -1)), 0);
  assert.ok(Math.abs(Math.abs(saltoWinkel(1, -1)) - 2 * Math.PI) < 1e-9);
  assert.ok(saltoWinkel(0.5, -1) < 0, 'nach links gegen den Uhrzeigersinn');
  let letzter = 0;
  for (let u = 0; u <= 1.0001; u += 0.05) { const w = Math.abs(saltoWinkel(u, 1)); assert.ok(w >= letzter - 1e-12); letzter = w; }
  const v = saltoVersatz(Math.PI, { dx: 0, dy: 0 });
  assert.ok(Math.abs(v.dx) < 1e-9 && Math.abs(v.dy + 40) < 1e-9, 'kopfüber: Fuß-Drehpunkt liegt 2 x Körpermitte tiefer');
});

test('Angst und Salto in der Pose: Pose ändert sich, ohne Engine-Daten; Emotion `angst` hat Vorrang vor Blinzeln', () => {
  assert.equal(waehleEmotion({ ergebnis: 0, hp: 1, aktiv: false, winkelSin: 0, zeit: 0.05, id: 0, angst: true }), 'angst');
  assert.equal(waehleEmotion({ ergebnis: 1, hp: 1, aktiv: false, winkelSin: 0, zeit: 0, id: 0, angst: true }), 'jubel', 'Matchende geht vor');
  vergesseGefahren();
  const posen = new FigurPosen();
  const opt = { typ: 'humanoid', params: PARAMETER.humanoid, blatt: null, winkel: 0 };
  const figur = { entityId: 7, x: 100, y: 100 };
  const ruhig = { ...posen.pose(figur, 1, opt) };
  meldeGefahr(120, 100, 2);
  const angst = { ...posen.pose(figur, 2.1, opt) };
  assert.ok(angst.sy < ruhig.sy, 'duckt sich');
  const spaeter = { ...posen.pose(figur, 2 + angstDauer(7) + 0.2, opt) };
  assert.ok(Math.abs(spaeter.sy - ruhig.sy) < 0.05, 'danach wieder normal');
  vergesseGefahren();
  // Salto: Absprung nach links (Blick rechts) mit 4,8 px/Takt, dann Flug
  const s = new FigurPosen();
  const e = { entityId: 9, x: 500, y: 300 };
  let t = 0;
  for (let i = 0; i < 10; i += 1) { t += 1 / 60; s.pose(e, t, opt); }
  let maxRot = 0;
  let vy = -10;
  for (let i = 0; i < 70; i += 1) {
    t += 1 / 60; e.x -= 4.8; vy += 0.3; e.y += vy; // Wurfbahn
    const p = s.pose(e, t, opt);
    maxRot = Math.max(maxRot, Math.abs(p.rot));
  }
  assert.ok(maxRot > 2, `Salto dreht deutlich (max ${maxRot.toFixed(2)} rad)`);
  // Gleicher Flug mit Normalsprung-Tempo dreht nicht
  const n = new FigurPosen();
  const e2 = { entityId: 10, x: 500, y: 300 };
  t = 0;
  for (let i = 0; i < 10; i += 1) { t += 1 / 60; n.pose(e2, t, opt); }
  let maxRot2 = 0; vy = -10;
  for (let i = 0; i < 70; i += 1) {
    t += 1 / 60; e2.x -= 2.4; vy += 0.3; e2.y += vy;
    maxRot2 = Math.max(maxRot2, Math.abs(n.pose(e2, t, opt).rot));
  }
  assert.ok(maxRot2 < 0.5, `Normalsprung bleibt aufrecht (max ${maxRot2.toFixed(2)})`);
});
