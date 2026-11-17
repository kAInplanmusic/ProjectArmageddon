// Audit 2026-11-17: Sichtgeprüft defekte Sprite-Zellen müssen im Manifest gesperrt sein,
// damit der Renderer sie nie zeigt (Fallback: prozedurale Animation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freigabeFuer } from '../src/client/figurSheets.js';

const manifest = JSON.parse(readFileSync(new URL('../src/client/assets/sprite-sheets/manifest.json', import.meta.url), 'utf8'));

const ERWARTET = {
  'datacult/02_chrome-code-shifter': 2,
  'datacult/20_buffer-flow-swarm': 2,
  'pirates/11_sniper-marie': 7,
};

for (const [schluessel, zelle] of Object.entries(ERWARTET)) {
  test(`${schluessel}: defekte Zelle ${zelle} ist gesperrt und wird in keiner Rolle genutzt`, () => {
    const eintrag = manifest.figuren[schluessel];
    assert.ok(eintrag, 'Manifesteintrag fehlt');
    const f = freigabeFuer({}, eintrag);
    assert.ok(f.gesperrt.includes(zelle), 'Zelle nicht in gesperrt');
    assert.equal(f.gehen?.includes(zelle) ?? false, false, 'Gehzyklus enthält gesperrte Zelle');
    for (const wert of Object.values(f.rollen)) {
      const zellen = Array.isArray(wert) ? wert : [wert];
      assert.equal(zellen.includes(zelle), false, 'Rolle nutzt gesperrte Zelle');
    }
  });
}
