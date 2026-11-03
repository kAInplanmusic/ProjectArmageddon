#!/usr/bin/env node
/**
 * Feuer-/Lava-Bildzeit im echten Chrome: `renderer.render` mit und ohne viele Flammen- und Lavazellen.
 * Reine Messung (setzt nur Anzeigezellen im Client, ändert keinen Spielzustand).
 *
 * Aufruf: PA_URL=http://127.0.0.1:5634/ node scripts/feuer-profil.mjs [--frames=120] [--zellen=2500] [--seed=N] [--preset=hills]
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const frames = Number(args.frames ?? 120);
const zellen = Number(args.zellen ?? 2500);
const seed = Number(args.seed ?? 20260916);
const preset = args.preset ?? 'hills';
const pct = (s, f) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0;
const stat = (v) => { const s = [...v].sort((a, b) => a - b); return { n: s.length, p50: +pct(s, 0.5).toFixed(1), p95: +pct(s, 0.95).toFixed(1), max: +(s.at(-1) ?? 0).toFixed(1) }; };

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL === 'bundled' ? undefined : 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.goto(process.env.PA_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__PA__));
await page.evaluate(({ seed, preset }) => window.__PA__.startMatch({ seed, teams: 2, playersPerTeam: 2, preset }), { seed, preset });
await page.waitForTimeout(1500);

const messe = (label) => page.evaluate(async ({ frames, label }) => {
  const r = window.__PA__.game.renderer;
  const orig = r.render.bind(r);
  const zeiten = [];
  r.render = (...a) => { const t0 = performance.now(); const ret = orig(...a); zeiten.push(performance.now() - t0); return ret; };
  while (zeiten.length < frames) await new Promise(res => requestAnimationFrame(res));
  r.render = orig;
  return { label, zeiten };
}, { frames, label });

const aus = await messe('ohne Feuer');
await page.evaluate((n) => {
  const r = window.__PA__.game.renderer;
  const f = r.feuerOptik;
  if (!f.spalten) f.setzeKarte({ spalten: Math.ceil(r.width / 8) }, r.width, r.height);
  const sp = f.spalten;
  const zeilen = Math.floor(f.hoehe / 8);
  // Zellen im mittleren Geländeband: zufällig verteilt, halb Flammen, halb Lava.
  const neu = [], an = [];
  for (let i = 0; i < n; i += 1) {
    const idx = (Math.floor(zeilen * (0.4 + 0.5 * Math.random())) * sp) + Math.floor(Math.random() * sp);
    (i % 2 ? neu : an).push(idx);
  }
  f.schritt({ neu });
  f.lavaStand({ an });
}, zellen);
if (args.teile) {
  await page.evaluate(() => {
    const f = window.__PA__.game.renderer.feuerOptik;
    const t = window.__teile = { zeichne: [], fort: [] };
    for (const [n, k] of [['zeichne', 'zeichne'], ['fortschreiben', 'fort']]) {
      const o = f[n].bind(f);
      f[n] = (...a) => { const t0 = performance.now(); const r = o(...a); t[k].push(performance.now() - t0); return r; };
    }
  });
}
const mit = await messe(`mit ${zellen} Zellen`);
if (args.teile) console.log('teile', JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__teile).map(([k, v]) => [k, +(v.sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0).toFixed(1)])))));
console.log(JSON.stringify([aus, mit].map(m => ({ label: m.label, ...stat(m.zeiten) }))));
await browser.close();
