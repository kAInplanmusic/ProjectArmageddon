/**
 * Panorama-Kulissen (`config/backdrops-panorama.js`): Katalog vollstaendig, Dateien da, Zuordnung = zuordnung.json,
 * Wahl deterministisch, Ragnarok nie automatisch, Engine/Hash unberuehrt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PANORAMEN_STIL, BACKDROPS_PANORAMA, ARTEN_PANORAMA } from '../src/shared/config/backdrops-panorama.js';
import { stilFuerKarte, panoramaStil } from '../src/client/panoramenStil.js';
import { findeKulisse } from '../src/client/panoramen.js';
import { paletteFor } from '../src/shared/config/backdrops.js';
import { lichtKlasseFuer } from '../src/client/kulissenLicht.js';
import { SONDERBIOM_IDS_FASSUNG_7 } from '../src/shared/config/biome-neu.js';

const wurzel = new URL('../src/client/assets/', import.meta.url);
const zuordnung = JSON.parse(fs.readFileSync(new URL('panoramen-stil/zuordnung.json', wurzel), 'utf8')).bilder;

test('Katalog: 32 Motive x 4 Arten, Dateien vorhanden (1920 Quelle, 1280 Laufzeit)', () => {
  assert.equal(PANORAMEN_STIL.length, 32);
  assert.equal(BACKDROPS_PANORAMA.length, 128);
  assert.equal(new Set(BACKDROPS_PANORAMA.map(b => b.key)).size, 128);
  for (const b of BACKDROPS_PANORAMA) {
    assert.ok(fs.existsSync(new URL('panoramen-stil/' + b.file, wurzel)), b.file);
    const klein = fs.readFileSync(new URL('panoramen-kulissen/' + b.file, wurzel));
    assert.equal(klein.subarray(8, 12).toString(), 'WEBP', b.file);
    assert.ok(klein.length < 400_000, `${b.file}: Laufzeitdatei zu gross`);
  }
  for (const m of PANORAMEN_STIL) assert.equal(BACKDROPS_PANORAMA.filter(b => b.motiv === m.name).map(b => b.art).join(), ARTEN_PANORAMA.map(a => a.id).join());
});

test('Zuordnung stimmt mit zuordnung.json ueberein; 15 Motive ohne Sonderbiom', () => {
  assert.deepEqual(Object.keys(zuordnung).sort(), PANORAMEN_STIL.map(m => m.name).sort());
  for (const m of PANORAMEN_STIL) {
    const z = zuordnung[m.name];
    assert.deepEqual([...m.biome], z.biome, m.name);
    assert.equal(m.familie, z.familie, m.name);
    assert.equal(m.staerke === 'keins' ? 'keins' : m.staerke, z.staerke, m.name);
    assert.deepEqual(m.autoArten ? [...m.autoArten] : undefined, z.autoArten, m.name);
    for (const b of m.biome) assert.ok(SONDERBIOM_IDS_FASSUNG_7.includes(b), `${m.name}: ${b}`);
  }
  assert.equal(PANORAMEN_STIL.filter(m => m.biome.length === 0).length, 15);
});

test('Objekte: Palette der Familie, Licht, Ragnarok-Kennung, findeKulisse', () => {
  const k = panoramaStil('klondike_schnee_hell');
  assert.equal(k.key, 'stil/klondike_schnee_hell');
  assert.equal(k.stil, 'klondike_schnee_hell.webp');
  assert.deepEqual(findeKulisse(k.key), k);
  assert.equal(findeKulisse('stil/gibtsnicht'), null);
  assert.ok(paletteFor({ key: `${k.biomeId}/${k.id}` }).surface);
  assert.equal(lichtKlasseFuer(panoramaStil('schneegarten_dunkel')), 'nacht');
  assert.equal(lichtKlasseFuer(panoramaStil('schneegarten_ragnarok')), 'lava');
  assert.equal(panoramaStil('klondike_schnee_ragnarok').id.includes('ragnarok'), true);
});

test('Wahl: jede dritte Karte, deterministisch, nie Ragnarok, schwache Motive nicht im Sonderbiom', () => {
  const gesehen = new Set();
  for (let seed = 0; seed < 600; seed += 1) {
    const k = stilFuerKarte({ sonder: 'eiswueste', seed });
    assert.equal(k !== null, seed % 3 === 0);
    assert.deepEqual(k, stilFuerKarte({ sonder: 'eiswueste', seed }));
    if (k) gesehen.add(k.key.replace(/_(hell|dunkel)$/, ''));
    assert.ok(!stilFuerKarte({ biomId: 'open', seed })?.key.includes('ragnarok'));
    assert.ok(!stilFuerKarte({ sonder: 'duenen', seed })?.key.match(/schotterweg|sonnenuntergang/));
    assert.equal(stilFuerKarte({ sonder: 'dimensionsriss', seed }), null);
    assert.equal(stilFuerKarte({ sonder: 'riff', seed })?.key.includes('palmenstrand') ?? false, false);
  }
  assert.deepEqual([...gesehen].sort(), ['stil/klondike_schnee', 'stil/schnee_alpendorf', 'stil/schneegarten']);
  assert.equal(stilFuerKarte({ sonder: 'schrott', seed: 3, kartenart: 'hoehle' }), null); // Nachtmotiv hat keinen Hoehlenblick
  assert.ok(stilFuerKarte({ sonder: 'duenen', seed: 3, kartenart: 'hoehle' }).key.endsWith('_hoehle'));
  assert.ok(stilFuerKarte({ biomId: 'open', seed: 3 }));
  assert.equal(stilFuerKarte({ biomId: 'cosmos', seed: 3 }), null);
});

test('Kein Engine-Zugriff: Katalog und Wahl benutzen weder Math.random noch Engine', () => {
  for (const f of ['../src/shared/config/backdrops-panorama.js', '../src/client/panoramenStil.js']) {
    const q = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/Math\.random|Date\.now|engine\//.test(q.replace(/\/\*[\s\S]*?\*\//g, '')), f);
  }
});
