#!/usr/bin/env node
/**
 * Kulissen-Ladezeit (BLD-1): Matchstart mit gewählter Bildkulisse bis `backdropReady`
 * (`bisBereitMs`, enthält den Geländeaufbau), die Ladezeit des Bildes selbst aus der
 * Resource-Timing-API (`bildLadenMs`) und seine Bytes. Mediane über `--laeufe`. Ergänzt `lade-profil.mjs` (Start bis Menü/spielbar),
 * das immer die generative Kulisse misst und das Bild deshalb nie lädt.
 *
 * Reine Messung, kein Gate. Gegen einen Produktionsbau (`npm run build` + `vite preview`):
 *   PA_URL=http://127.0.0.1:4173/ node scripts/lade-kulissen.mjs [--laeufe=5] [--drossel] [--json]
 * `--drossel` setzt per CDP ein langsames Netz (1,6 Mbit/s, 150 ms RTT, wie Lighthouse „Slow 4G“).
 * Browser: `PA_CHROMIUM=/opt/pw-browsers/chromium` oder Playwrights eigener.
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const laeufe = Number(args.laeufe ?? 5);
const url = process.env.PA_URL ?? 'http://127.0.0.1:4173/';
const KULISSEN = ['noir/rainy_street', 'maritime/calm_day', 'cosmos/nebula', 'alpine/stimmung_dunkel', 'forest/stimmung_hoehle'];
const median = v => { const s = [...v].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };

const browser = await chromium.launch({
  executablePath: process.env.PA_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const ergebnis = {};
for (const key of KULISSEN) {
  const zeiten = [];
  const bildZeiten = [];
  let bytes = 0;
  let datei = null;
  for (let i = 0; i < laeufe; i += 1) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    if (args.drossel) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8,
      });
    }
    let bildBytes = 0;
    let bildName = null;
    page.on('response', async (r) => {
      const pfad = r.url().split('?')[0];
      if (!/\/assets\/[^/]+\.(jpe?g|webp)$/.test(pfad)) return;
      const name = pfad.split('/').pop();
      if (!name.startsWith(key.split('/')[0])) return;
      const body = await r.body().catch(() => Buffer.alloc(0));
      bildBytes = body.length;
      bildName = name;
    });
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__PA__));
    const ms = await page.evaluate(async (k) => {
      const api = window.__PA__;
      api.setAutoLoop(false);
      const t0 = performance.now();
      api.startMatch({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'islands', backdropKey: k });
      while (api.game.renderer.backdropReady !== true) {
        if (performance.now() - t0 > 30_000) throw new Error(`Kulisse ${k} lädt nicht`);
        await new Promise(res => setTimeout(res, 5));
      }
      const bild = performance.getEntriesByType('resource')
        .filter(e => /\.(jpe?g|webp)$/.test(e.name) && e.startTime >= t0)
        .find(e => e.name.split('/').pop().startsWith(k.split('/')[0]));
      return { gesamt: performance.now() - t0, bild: bild ? bild.responseEnd - bild.startTime : null };
    }, key);
    zeiten.push(ms.gesamt);
    bildZeiten.push(ms.bild ?? NaN);
    bytes = bildBytes;
    datei = bildName;
    await ctx.close();
  }
  ergebnis[key] = { datei, kib: Math.round(bytes / 1024), bisBereitMs: median(zeiten), bildLadenMs: median(bildZeiten) };
}
await browser.close();
console.log(JSON.stringify({ url, laeufe, drossel: Boolean(args.drossel), ergebnis }, null, args.json ? 1 : 0));
