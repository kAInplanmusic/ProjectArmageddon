#!/usr/bin/env node
/**
 * Backt Streifen aus je EINEM Stoff mit `tinteStoffe` (reine Client-Optik) und schreibt rohes RGB.
 * Hilfswerkzeug von `scripts/stoff-optik-messung.py` (dort Texturen-Dump, Messwerte, Kontaktbogen).
 *
 *   node scripts/stoff-optik-bake.mjs <texdir> <ausdir> [--breite=6272] [--hoehe=256] [--seed=7] [--ids=1,2,3]
 *
 * <texdir>: `<name>.rgba` (512x512 RGBA roh). Ausgabe: `<ausdir>/<id>.rgb` und `<ausdir>/zeiten.json`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { STOFFE } from '../src/shared/config/stoffe.js';
import { STOFF_TEXTUR, TEXTUR_NAMEN, registriereStoffTextur } from '../src/client/stoffTexturen.js';
import { tinteStoffe } from '../src/client/stoffOptik.js';

const [texdir, ausdir, ...rest] = process.argv.slice(2);
const opt = (n, v) => { const a = rest.find((r) => r.startsWith(`--${n}=`)); return a ? a.split('=')[1] : v; };
const B = Number(opt('breite', 6272));
const H = Number(opt('hoehe', 256));
const seed = Number(opt('seed', 7));
for (const n of TEXTUR_NAMEN) {
  const f = `${texdir}/${n}.rgba`;
  if (existsSync(f)) { const b = readFileSync(f); registriereStoffTextur(n, new Uint8ClampedArray(b.buffer, b.byteOffset, b.length)); }
}
const ids = opt('ids', '') ? opt('ids').split(',').map(Number)
  : STOFFE.map((s, i) => i).filter((i) => STOFF_TEXTUR[STOFFE[i].key]);
const zeiten = {};
for (const id of ids) {
  const spalten = B / 8; const zeilen = H / 8;
  const feld = new Uint8Array(spalten * zeilen).fill(id);
  const bitmap = new Uint8Array(B * H).fill(1);
  const d = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = 110; d[i + 1] = 96; d[i + 2] = 84; d[i + 3] = 255; }
  const t0 = performance.now();
  tinteStoffe(d, bitmap, B, H, { feld, spalten, zeilen }, seed);
  zeiten[id] = performance.now() - t0;
  const rgb = Buffer.alloc(B * H * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
  writeFileSync(`${ausdir}/${id}.rgb`, rgb);
}
writeFileSync(`${ausdir}/zeiten.json`, JSON.stringify({ breite: B, hoehe: H, seed, ms: zeiten }));
