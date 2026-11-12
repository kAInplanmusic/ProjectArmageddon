#!/usr/bin/env node
/**
 * Kontaktbogen der runden Kartenarten (N-40): je Art eine Zeile, je Seed eine Zelle, als PNG.
 *
 *     node scripts/rund-kontaktbogen.mjs --seite=1920 --seeds=1,2,3,4 --aus=/tmp/rund.png [--figuren=3] [--art=rundPlanet]
 *
 * Gezeichnet wird die echte Maske (Fels braun, Himmel hell, Leere unter dem Spiegel dunkel). Grün = Stand (`rund.stand`), mit `--figuren=N` (Teams 2 × N) starten echte Matches (`MatchController`) und die Figuren erscheinen als Punkte (Team 0 gelb, Team 1 weiß).
 * Reine Darstellung, kein Teil des Spiels.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { MatchController } from '../src/engine/match.js';
import { KARTENARTEN_RUND } from '../src/shared/config/gelaende.js';

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SEITE = Number(args.get('seite') ?? 1920);
const SEEDS = String(args.get('seeds') ?? '1,2,3,4').split(',').map(Number);
const FIGUREN = Number(args.get('figuren') ?? 0);
const ARTEN = args.get('art') ? [args.get('art')] : KARTENARTEN_RUND;
const AUS = String(args.get('aus') ?? '/tmp/rund-kontaktbogen.png');
const ZELLE = Number(args.get('zelle') ?? 400);
const gr = SEITE === 5760 ? 'kolossal' : ({ 960: 'klein', 1920: 'mittel', 2880: 'gross', 3840: 'riesig' })[SEITE];

function crc32(buf) {
  let c; let crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n += 1) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(t, d) {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}
function png(w, h, rgb) {
  const roh = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) { roh[y * (w * 3 + 1)] = 0; rgb.copy(roh, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(roh)), chunk('IEND', Buffer.alloc(0))]);
}

const zeilen = ARTEN.length;
const B = SEEDS.length * ZELLE;
const H = zeilen * ZELLE;
const img = Buffer.alloc(B * H * 3);
const pix = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= B || y >= H) return; const i = (y * B + x) * 3; img[i] = r; img[i + 1] = g; img[i + 2] = b; };

ARTEN.forEach((art, zi) => {
  SEEDS.forEach((seed, si) => {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: FIGUREN || 1, kartentyp: 'autonom', maxRounds: 2, format: '1:1', groesse: gr, kartenart: art, turnDurationMs: 1e9 });
    m.start();
    const W = m.width;
    const bm = m.bitmap;
    const f = W / ZELLE;
    const wy = m.kartencharakter?.rund?.wasserY ?? 0;
    for (let cy = 0; cy < ZELLE; cy += 1) {
      for (let cx = 0; cx < ZELLE; cx += 1) {
        // Mehrheit aus 3 × 3 Stichproben je Zelle (schnell, genug für die Sichtprüfung).
        let fest = 0;
        for (let j = 0; j < 3; j += 1) for (let i = 0; i < 3; i += 1) fest += bm[Math.min(W - 1, Math.floor((cy + (j + 0.5) / 3) * f)) * W + Math.min(W - 1, Math.floor((cx + (i + 0.5) / 3) * f))];
        const unterSpiegel = (cy * f) > wy;
        const [r, g, b] = fest >= 5 ? [120, 92, 64] : unterSpiegel ? [28, 20, 44] : [196, 222, 240];
        pix(si * ZELLE + cx, zi * ZELLE + cy, r, g, b);
      }
    }
    const rund = m.kartencharakter?.rund;
    if (rund?.stand) {
      const y0 = zi * ZELLE;
      for (let x = Math.floor(rund.stand[0] / f); x <= rund.stand[1] / f; x += 1) { pix(si * ZELLE + x, y0 + 2, 40, 200, 70); pix(si * ZELLE + x, y0 + 3, 40, 200, 70); }
    }
    if (FIGUREN) {
      for (const p of m.players) {
        const x = m.world.getComponent(p.entityId, 'Position', 'x'); const y = m.world.getComponent(p.entityId, 'Position', 'y');
        if (typeof x !== 'number') continue;
        const [r, g, b] = p.teamId === 0 ? [255, 230, 0] : [255, 255, 255];
        for (let j = -3; j <= 3; j += 1) for (let i = -3; i <= 3; i += 1) pix(si * ZELLE + Math.round(x / f) + i, zi * ZELLE + Math.round(y / f) + j, r, g, b);
      }
    }
    console.log(`${art} Seed ${seed}: ${W}x${m.height}, Stand ${JSON.stringify(rund?.stand)}`);
  });
});
fs.writeFileSync(AUS, png(B, H, img));
console.log(`geschrieben: ${AUS} (${B}x${H})`);
