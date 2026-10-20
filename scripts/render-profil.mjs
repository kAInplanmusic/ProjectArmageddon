#!/usr/bin/env node
/**
 * Render-Profil im echten Chrome: Frame-Zeit, Eingabe-zu-Bild-Latenz, Hotspots.
 *
 * Misst (a) die Dauer von `renderer.render` je Bild und die rAF-Abstände,
 * (b) die Latenz von der Tasteneingabe bis zum Ende des nächsten `render`
 * (ohne Compositing/Anzeige) und (c) mit dem CDP-CPU-Profiler die Funktionen
 * mit der größten Eigenzeit. Reine Messung, ändert kein Spielverhalten.
 *
 * Aufruf: PA_URL=http://127.0.0.1:5624/ node scripts/render-profil.mjs
 *           [--frames=400] [--seed=N] [--preset=hills] [--key=deluge/stimmung_hell] [--json] [--top=18]
 */
import { chromium } from '@playwright/test';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const frames = Number(args.frames ?? 400);
const seed = Number(args.seed ?? 20260916);
const preset = args.preset ?? 'hills';
const top = Number(args.top ?? 18);
const key = args.key ?? ''; // Kulisse, z. B. deluge/stimmung_hell (leer = generative Kulisse)

const pct = (s, f) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : 0;
const stat = (v) => { const s = [...v].sort((a, b) => a - b); return { n: s.length, mean: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(2), p50: +pct(s, 0.5).toFixed(2), p95: +pct(s, 0.95).toFixed(2), p99: +pct(s, 0.99).toFixed(2), max: +(s.at(-1) ?? 0).toFixed(2) }; };

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL === 'bundled' ? undefined : 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.goto(process.env.PA_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__PA__));
await page.evaluate(({ seed, preset, key }) => window.__PA__.startMatch({ seed, teams: 2, playersPerTeam: 2, preset, backdropKey: key }), { seed, preset, key });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const r = window.__PA__.game.renderer;
  const orig = r.render.bind(r);
  const m = window.__perf = { render: [], latenz: [], frames: [], offen: [] };
  r.render = (...a) => {
    const t0 = performance.now();
    const ret = orig(...a);
    const t1 = performance.now();
    m.render.push(t1 - t0);
    for (const e of m.offen.splice(0)) m.latenz.push(t1 - e);
    return ret;
  };
  addEventListener('keydown', (e) => m.offen.push(e.timeStamp), true);
  let letzte = null;
  const tick = (t) => { if (letzte !== null) m.frames.push(t - letzte); letzte = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const start = Date.now();
let gedrueckt = 0;
while (true) {
  const n = await page.evaluate(() => window.__perf.render.length);
  if (n >= frames) break;
  await page.keyboard.press(gedrueckt++ % 2 ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(37 + (gedrueckt % 7) * 5); // wechselnde Phase zum Bildtakt
}
const { profile } = await cdp.send('Profiler.stop');
const m = await page.evaluate(() => window.__perf);

const eigen = new Map();
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const f = byId.get(id).callFrame;
  const k = `${f.functionName || '(anonym)'} ${f.url.split('/').slice(-1)[0].split('?')[0]}:${f.lineNumber + 1}`;
  eigen.set(k, (eigen.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
});
const gesamt = [...eigen.values()].reduce((a, b) => a + b, 0);
const hot = [...eigen.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, ms]) => ({ funktion: k, ms: +ms.toFixed(0), anteil: +(100 * ms / gesamt).toFixed(1) }));

const ergebnis = { preset, key, seed, dauerS: +((Date.now() - start) / 1000).toFixed(1), renderMs: stat(m.render), frameAbstandMs: stat(m.frames), eingabeZuRenderEndeMs: stat(m.latenz), hot };
console.log(args.json ? JSON.stringify(ergebnis, null, 1) : JSON.stringify({ ...ergebnis, hot: undefined }) + '\n' + hot.map(h => `${String(h.anteil).padStart(5)}%  ${String(h.ms).padStart(6)}ms  ${h.funktion}`).join('\n'));
await browser.close();
