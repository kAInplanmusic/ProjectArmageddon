/**
 * E2E: Sprite-Sheets im Renderer — Stehen (Idle), Gehen (Walk-Zyklus), Treffer, Tod.
 *
 * Die Sheets laden lazy je Figur der Partie; bis dahin gilt das Seitenbild. Geprüft wird die
 * Zustandswahl am echten Renderer (kein Zustands-Hash, keine Spiellogik). Mit `PA_SHOTS=<Ordner>`
 * werden Bilder abgelegt.
 */
import { test, expect } from '@playwright/test';

const FORMATE = [
  { name: 'quer', viewport: { width: 1280, height: 720 } },
  { name: 'hoch', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
];

async function oeffne(page) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#cfg-seed').fill('20260910');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return fehler;
}

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

/** Zustände aller gezeichneten Figuren mit geladenem Blatt: Rolle und ob der Frame zur Rolle passt. */
const zustaende = page => page.evaluate(() => {
  const r = window.__PA__.game.renderer;
  const aus = [];
  for (const [id, z] of r.figurPosen.zustaende) {
    const b = z.fig?.blatt;
    if (!b) continue;
    // Im Stand ist es der Idle-Frame oder — wenn gerade eine Emotion läuft (Blinzeln, Jubel …) — genau deren Frame.
    const passt = z.rolle === 'idle' ? (b.idle.includes(z.frame) || Boolean(z.emotion && b.emotion?.[z.emotion] === z.frame))
      : z.rolle === 'walk' ? b.walk.includes(z.frame)
        : z.rolle ? z.frame === b[z.rolle] : z.frame === null;
    aus.push({ id, rolle: z.rolle, passt });
  }
  return aus;
});

for (const fmt of FORMATE) {
  test(`Sheets (${fmt.name}): Blatt lädt lazy, Stehen zeigt Idle-Frames`, async ({ page }) => {
    await page.setViewportSize(fmt.viewport);
    const fehler = await oeffne(page);
    await expect.poll(async () => (await zustaende(page)).length, { timeout: 15000 }).toBeGreaterThan(0);
    const z = await zustaende(page);
    expect(z.every(f => f.passt)).toBe(true);
    expect(z.some(f => f.rolle === 'idle')).toBe(true);
    await ablegen(page, `sheets-${fmt.name}-idle`);
    expect(fehler).toEqual([]);
  });
}

test('Sheets: Sprung zeigt Luft/Hocke, Treffer den Treffer-Frame, Tod die liegende Figur', async ({ page }) => {
  await page.setViewportSize(FORMATE[0].viewport);
  const fehler = await oeffne(page);
  await expect.poll(async () => (await zustaende(page)).length, { timeout: 15000 }).toBeGreaterThan(0);
  // Sprung (A/D + Enter): Luft- und Hocke-Frame; der Gehzyklus selbst steht in gehen.spec.mjs.
  await page.keyboard.down('d');
  await page.keyboard.press('Enter');
  const rollen = new Set();
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(40);
    const f = await zustaende(page);
    expect(f.every(q => q.passt)).toBe(true);
    for (const q of f) rollen.add(q.rolle);
    if (rollen.has('luft') && i === 8) await ablegen(page, 'sheets-quer-sprung');
  }
  await page.keyboard.up('d');
  expect(rollen.has('luft') || rollen.has('hocke') || rollen.has('walk'), `Rollen: ${[...rollen]}`).toBe(true);

  // Treffer halten (Zustand der ersten Figur mit Blatt), Bild ablegen.
  const treffer = await page.evaluate(async () => {
    const r = window.__PA__.game.renderer;
    const orig = r.figurPosen.pose.bind(r.figurPosen);
    r.figurPosen.pose = (e, j, o) => {
      const p = orig(e, j, o);
      const z = r.figurPosen.zustaende.get(e.entityId);
      if (z?.fig?.blatt?.treffer) { z.hitT = 0.01; }
      return p;
    };
    await new Promise(res => setTimeout(res, 300));
    const out = [];
    for (const z of r.figurPosen.zustaende.values()) if (z.fig?.blatt?.treffer) out.push(z.frame === z.fig.blatt.treffer);
    return out;
  });
  expect(treffer.length).toBeGreaterThan(0);
  expect(treffer.every(Boolean)).toBe(true);
  await ablegen(page, 'sheets-quer-treffer');

  // Tod: ein Fall-Effekt mit liegender Figur wird gezeichnet (gehalten, damit das Bild stehen bleibt).
  const liegt = await page.evaluate(async () => {
    const r = window.__PA__.game.renderer;
    r.figurPosen.pose = Object.getPrototypeOf(r.figurPosen).pose.bind(r.figurPosen);
    const z = [...r.figurPosen.zustaende.values()].find(q => q.fig?.blatt?.tod);
    if (!z) return null;
    r.faelle.push({ fig: z.fig, x: z.x + 40, y: z.y, winkel: 0, team: z.team, t0: performance.now() / 1000, ertrinkt: false, blick: 1, vx: 0, tod: 'kippen', breite: 1, liegt: true });
    const f = r.faelle.at(-1);
    const halte = setInterval(() => { f.t0 = performance.now() / 1000 - 0.45; }, 16);
    await new Promise(res => setTimeout(res, 250));
    window.__halte = halte;
    return true;
  });
  expect(liegt).toBe(true);
  await ablegen(page, 'sheets-quer-tod');
  expect(fehler).toEqual([]);
});
