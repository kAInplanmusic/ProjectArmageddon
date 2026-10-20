/**
 * Rendert Klangprofile offline in Chromium (OfflineAudioContext) und liefert Float32-Felder.
 * Die Quelltexte kommen über einen kleinen statischen Server aus dem Repo; es wird kein
 * Dev-Server und keine Spielseite gebraucht.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SAMPLERATE = 48000;

function kanal() {
  if (process.env.PLAYWRIGHT_CHANNEL === 'bundled') return undefined;
  if (process.env.PLAYWRIGHT_CHANNEL === 'chrome') return 'chrome';
  return fs.existsSync('/opt/google/chrome/chrome') ? 'chrome' : undefined;
}

function dekodiere(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Startet Server und Browser, ruft `fn(rendere)` und räumt auf.
 * `rendere({dauer, seed, lautstaerke, stimmen:[{name, zeit, pegel, pan, tiefpass}]})` → `{links, rechts}`.
 */
export async function mitKlangRenderer(fn) {
  const server = http.createServer((req, res) => {
    const pfad = path.join(WURZEL, decodeURIComponent(req.url.split('?')[0]));
    if (!pfad.startsWith(WURZEL) || req.url === '/' || !fs.existsSync(pfad) || fs.statSync(pfad).isDirectory()) {
      res.writeHead(req.url === '/' ? 200 : 404, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>klang</title>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/javascript' });
    fs.createReadStream(pfad).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true, ...(kanal() ? { channel: kanal() } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const rendere = async ({ dauer = 3.5, seed = 1, lautstaerke = 0.8, stimmen }) => {
      const roh = await page.evaluate(async ({ dauer: d, seed: s, lautstaerke: l, stimmen: st, sr }) => {
        const synth = await import('/src/client/klangSynth.js');
        const prof = await import('/src/client/klangProfile.js');
        const ctx = new OfflineAudioContext(2, Math.ceil(sr * d), sr);
        const graph = synth.baueKlangGraph(ctx, { lautstaerke: l, zufall: prof.mulberry(s) });
        for (const v of st) {
          synth.spieleProfil(graph, prof.ALLE_PROFILE[v.name], {
            zeit: v.zeit ?? 0.02, pegel: v.pegel ?? 1, pan: v.pan ?? 0, tiefpass: v.tiefpass ?? 0,
          });
        }
        const buf = await ctx.startRendering();
        const kodiere = f => {
          const bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
          let text = '';
          for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(text);
        };
        return { l: kodiere(buf.getChannelData(0)), r: kodiere(buf.getChannelData(1)) };
      }, { dauer, seed, lautstaerke, stimmen, sr: SAMPLERATE });
      return { links: dekodiere(roh.l), rechts: dekodiere(roh.r) };
    };
    return await fn(rendere);
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}
