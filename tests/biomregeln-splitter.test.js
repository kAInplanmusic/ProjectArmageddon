/**
 * Biomregel-Fassung 10 (TODO 2.6, Welle 3 Baustein D): Splitter verletzen und brechen weiter (`SPLITTER_REGEL`).
 *
 * Geprüft wird: Versionsmarke; die Regel der Fassung; in einer Bot-Partie in der Burg treffen Splitter Figuren nur ab Fassung 10,
 * und Fassung 9 bleibt ohne Treffer; derselbe Lauf ergibt dieselbe Folge (deterministisch). Die Stärke ist ein erster Ansatz
 * (Messung: Burg 6,2 Treffer je Partie, rund 15 % des Schadens; Dimensionsriss 2,7; Kristallhöhle 1,3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_BODEN, BIOMREGELN_SPLITTER, BIOMREGELN_STANDARD, SPLITTER_REGEL, normalisiereBiomregeln, splitterRegelFuer,
} from '../src/shared/config/biomregeln.js';
import { spiele } from '../scripts/bot-partien.mjs';

test('Marke: 10 ist der Standard, 9 bleibt gültig', () => {
  assert.equal(BIOMREGELN_SPLITTER, 10);
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_SPLITTER);
  assert.equal(normalisiereBiomregeln(10), 10);
  assert.equal(normalisiereBiomregeln(9), BIOMREGELN_BODEN);
  assert.equal(splitterRegelFuer(9), null);
  assert.equal(splitterRegelFuer(10), SPLITTER_REGEL);
});

/** Bot-Partie in der Burg; zählt Splittertreffer und liefert ihre Folge. */
function burg(seed, biomregeln) {
  const folge = [];
  const r = spiele(seed, 4, { extra: { biom: 'burg', biomregeln }, ereignis: liste => {
    for (const e of liste) if (e.type === 'splitter_treffer') folge.push(`${e.payload.entityId}@${e.payload.x},${e.payload.y}`);
  } });
  return { folge, schaden: r.schaden };
}

test('Burg: Splitter treffen erst ab Fassung 10, deterministisch', () => {
  let treffer = 0;
  for (const seed of [1, 2, 3]) {
    assert.deepEqual(burg(seed, BIOMREGELN_BODEN).folge, [], `Seed ${seed}: Fassung 9 ohne Treffer`);
    const a = burg(seed, BIOMREGELN_SPLITTER);
    const b = burg(seed, BIOMREGELN_SPLITTER);
    assert.deepEqual(b.folge, a.folge, `Seed ${seed}: gleiche Folge`);
    treffer += a.folge.length;
  }
  assert.ok(treffer > 0, 'in drei Burg-Partien trifft mindestens ein Splitter');
});
