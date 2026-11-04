/**
 * Alte Hochformat-Aufzeichnungen bleiben abspielbar (Entscheidung 2026-11-04: „nur quer").
 *
 * Neue Partien sind immer Querformat (Menü, Lobby und Server bieten kein Hochformat mehr an).
 * Die Engine kennt das Hochformat aber weiter (`MAP_SIZES.portrait`), weil eine Aufzeichnung
 * Seed + Eingaben ist und ihr Kopf `orientation: 'portrait'` trägt (AGENTS.md §2: alte Replays
 * laufen unverändert). Die Datei `daten/replay-hochformat-2026-11-04.json` wurde am Tag der
 * Entscheidung mit dem damaligen Stand aufgenommen (Seed 4242, 2x2, autonom, 2307 Takte); ihr
 * Endhash ist hier als Goldwert festgehalten.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MAP_SIZES } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';

const DATEI = new URL('./daten/replay-hochformat-2026-11-04.json', import.meta.url);
/** Endhash der Aufnahme (Live-Lauf am 2026-11-04 = Wiedergabe), einmal gemessen. */
const GOLD_HOCHFORMAT = 'b5fff7ba';

function abspielen(json) {
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(json));
  while (!spieler.finished) spieler.step();
  return spieler.match;
}

test('Alte Hochformat-Aufzeichnung: Wiedergabe endet bit-identisch im Goldhash', () => {
  const json = readFileSync(DATEI, 'utf8');
  assert.equal(JSON.parse(json).config.orientation, 'portrait', 'Testannahme: Kopf trägt das Hochformat');
  const match = abspielen(json);
  assert.equal(match.orientation, 'portrait');
  assert.equal(match.width, MAP_SIZES.portrait.mittel.width);
  assert.equal(match.height, MAP_SIZES.portrait.mittel.height);
  assert.equal(match.world.tickCount, 2307);
  assert.equal(match.stateHash(), GOLD_HOCHFORMAT);
  // Zweiter Lauf: derselbe Hash (keine versteckte Abhängigkeit vom ersten).
  assert.equal(abspielen(json).stateHash(), GOLD_HOCHFORMAT);
});

test('Die Ausrichtung im Kopf wirkt: ohne sie spielt dieselbe Datei eine andere (Querformat-)Karte', () => {
  const roh = JSON.parse(readFileSync(DATEI, 'utf8'));
  delete roh.config.orientation;
  const quer = abspielen(JSON.stringify(roh));
  assert.equal(quer.orientation, 'landscape');
  assert.notEqual(quer.stateHash(), GOLD_HOCHFORMAT, 'sonst prüfte der Goldwert das Hochformat nicht');
});
