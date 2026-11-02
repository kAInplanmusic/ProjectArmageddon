#!/usr/bin/env node
/**
 * Ladezeit im echten Chrome: Navigation bis `window.__PA__` (Menü bedienbar) und bis das erste Bild
 * eines Matches gezeichnet ist ("spielbar"), dazu Zahl und Größe der geladenen Dateien nach Art.
 * Reine Messung. Aufruf: PA_URL=http://127.0.0.1:4173/ node scripts/lade-profil.mjs [--laeufe=7] [--json]
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const laeufe = Number(args.laeufe ?? 7);
const url = process.env.PA_URL ?? 'http://127.0.0.1:4173/';
const pct = (s, f) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0;
const stat = (v) => { const s = [...v].sort((a, b) => a - b); return { p50: Math.round(pct(s, 0.5)), p95: Math.round(pct(s, 0.95)), min: Math.round(s[0]), max: Math.round(s.at(-1)) }; };

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL === 'bundled' ? undefined : 'chrome' }).catch(() => chromium.launch());
const menue = []; const spielbar = []; let dateien = null;
for (let i = 0; i < laeufe; i += 1) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const arten = {};
  page.on('response', async (r) => {
    const art = (r.url().split('?')[0].match(/\.(\w+)$/)?.[1] ?? 'andere').toLowerCase();
    const len = Number(r.headers()['content-length'] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    arten[art] = arten[art] ?? { n: 0, kb: 0 };
    arten[art].n += 1; arten[art].kb += len / 1024;
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__PA__));
  menue.push(Date.now() - t0);
  await page.evaluate(() => window.__PA__.startMatch({ seed: 20260916, teams: 2, playersPerTeam: 2, preset: 'hills' }));
  await page.evaluate(() => new Promise(res => { const r = window.__PA__.game.renderer; const o = r.render.bind(r); r.render = (...a) => { const x = o(...a); r.render = o; res(); return x; }; }));
  spielbar.push(Date.now() - t0);
  await page.waitForTimeout(300);
  for (const a of Object.values(arten)) a.kb = Math.round(a.kb);
  dateien = arten;
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ url, laeufe, bisMenueMs: stat(menue), bisSpielbarMs: stat(spielbar), dateien }, null, args.json ? 1 : 0));
