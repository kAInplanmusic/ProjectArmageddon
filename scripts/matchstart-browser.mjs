#!/usr/bin/env node
/**
 * Misst im Browser (Chromium/Chrome, CDP-Profiler), wie lange der Matchstart vom Klick bis `game.match` + laufender Schleife dauert,
 * und listet die größten Eigenzeiten (QV-7). Der Dev-Server muss laufen (`npm run dev`, Port per PA_PORT, Standard 5173).
 *
 *     node scripts/matchstart-browser.mjs [--format=24:9] [--groesse=gross] [--runs=2]
 */
import { chromium } from '@playwright/test';

const a = new Map(process.argv.slice(2).map(s => { const [k, v] = s.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const format = a.get('format') ?? '24:9';
const groesse = a.get('groesse') ?? 'gross';
const runs = Number(a.get('runs') ?? 2);
const url = `http://localhost:${process.env.PA_PORT ?? 5173}/`;

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL === 'bundled' ? undefined : (process.env.PLAYWRIGHT_CHANNEL ?? undefined) });
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { sessionStorage.setItem('pa.home.v1', '1'); } catch { /* egal */ } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector('#start-button');
  await page.selectOption('#cfg-kartenformat', format).catch(() => {});
  await page.selectOption('#cfg-kartengroesse', groesse).catch(() => {});
  await page.fill('#cfg-seed', String(1000 + i));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.click('#start-button');
  await page.waitForFunction(() => Boolean(window.__PA__?.game?.match), null, { timeout: 60_000 });
  const tMatch = Date.now() - t0;
  await page.waitForFunction(() => window.__PA__.game.running === true, null, { timeout: 60_000 });
  const tLauf = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, k) => self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[k]));
  const agg = new Map();
  for (const [id, t] of self) { const n = byId.get(id); const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/').split('?')[0]}:${n.callFrame.lineNumber + 1}`; agg.set(key, (agg.get(key) ?? 0) + t); }
  const gesamt = [...agg.values()].reduce((x, y) => x + y, 0);
  console.log(`\nLauf ${i}: game.match nach ${tMatch} ms, running nach ${tLauf} ms (Profil ${Math.round(gesamt / 1000)} ms CPU)`);
  [...agg].sort((x, y) => y[1] - x[1]).slice(0, 12).forEach(([k, t]) => console.log(`${String(Math.round(t / 1000)).padStart(6)} ms ${String(Math.round(100 * t / gesamt)).padStart(3)}% ${k}`));
  await ctx.close();
}
await browser.close();
