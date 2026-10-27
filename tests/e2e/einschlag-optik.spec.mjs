/**
 * E2E: Risse und Geröll nach einem Einschlag (reine Client-Optik, kein Netz-Mehrverkehr).
 *
 * Gemessen im echten Browser: Nach einem Einschlag in der Anzeige (`renderer.applyCrater`, wie das Ereignis `terrain_destroyed` es ruft) zählt der Renderer Risse und
 * Geröllzellen, die Geröllzellen liegen auf festem Gelände der Kollisionsmaske, und der Ausschnitt
 * um den Krater ändert sich gegenüber vorher. Mit `PA_BILDER=1` entstehen die Vorher/Nachher-
 * Bilder `docs/bilder/einschlag-vorher.jpg` und `docs/bilder/einschlag-nachher.jpg` (klein, JPEG).
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.use({ viewport: { width: 1280, height: 720 } });

async function starte(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.locator('#cfg-seed').fill('20260921');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  // Eine Waffe mit großem Krater wählen, die der Schütze führt.
  const gewaehlt = await page.evaluate(() => {
    const api = window.__PA__;
    const m = api.getMatch();
    const a = m.activePlayerId;
    const kandidaten = api.weapons().filter(w => w.terrainDamage >= 20 && w.delivery !== 'hitscan' && !w.fuseTime);
    for (const w of kandidaten) {
      m.inventory.register?.(a, [w.id]);
      if (api.selectWeaponById(w.id) !== false) return w.id;
    }
    return null;
  });
  expect(gewaehlt).not.toBeNull();
}

/** Lässt einen Krater (Radius 30) in die Anzeige einschlagen; liefert Ort und Zähler. */
function sprenge(page) {
  return page.evaluate(() => {
    const api = window.__PA__;
    const game = api.game;
    const maske = api.getMatch().terrain;
    // Ein sichtbarer Ort mit dickem Fels unter der Oberfläche (Kraterradius 30): der mit den meisten festen Proben.
    const sicht = api.sichtbarerAusschnitt();
    let beste = null;
    const faktor = window.innerWidth / (sicht.x1 - sicht.x0);
    for (let x = Math.ceil(sicht.x0 + 400 / faktor); x < sicht.x1 - 200 / faktor; x += 10) {
      let y = Math.max(0, Math.floor(sicht.y0));
      while (y < api.constants.MAP_HEIGHT - 200 && !maske.isSolid(x, y)) y += 1;
      y += 8;
      if ((y - sicht.y0) * faktor < 330) continue;
      const punkte = [[0, 45], [-35, 35], [35, 35], [0, 80], [-35, 12], [35, 12]].filter(([ox, oy]) => maske.isSolid(x + ox, y + oy)).length;
      if (!beste || punkte > beste.punkte) beste = { x, y, punkte };
    }
    const { x, y } = beste;
    const ebene = game.renderer.terrainLayer;
    const box = { x: Math.max(0, x - 80), y: Math.max(0, y - 80), b: 160, h: 160 };
    const vor = ebene.getContext('2d').getImageData(box.x, box.y, box.b, box.h).data;
    game.renderer.applyCrater(x, y, 30, 115, 'sprengung');
    const nach = ebene.getContext('2d').getImageData(box.x, box.y, box.b, box.h).data;
    // Nichts darf im Freien entstehen: kein Pixel, der vorher durchsichtig war, ist danach deckend.
    let imFreien = 0;
    let veraendert = 0;
    for (let i = 3; i < vor.length; i += 4) {
      if (vor[i] === 0 && nach[i] > 0) imFreien += 1;
      if (vor[i] > 0 && nach[i] > 0 && (vor[i - 3] !== nach[i - 3] || vor[i - 2] !== nach[i - 2] || vor[i - 1] !== nach[i - 1])) veraendert += 1;
    }
    return { x, y, imFreien, veraendert, optik: api.optik() };
  });
}

async function ausschnitt(page, ort, pfad) {
  await page.waitForTimeout(1800);
  // Nur das Spielfeld aufnehmen: HUD und Hinweise ausblenden.
  await page.addStyleTag({ content: '#hud, #hud *, .toast, [id^="toast"] { visibility: hidden !important; }' });
  const p = await page.evaluate(({ x, y }) => {
    const c = document.querySelector('canvas');
    const q = window.__PA__.kartePunktImSchirm(x, y);
    const f = c.getBoundingClientRect().width / c.width;
    return { x: q.x * f, y: q.y * f };
  }, ort);
  const clip = { x: Math.max(0, Math.round(p.x - 160)), y: Math.max(0, Math.round(p.y - 100)), width: 320, height: 200 };
  await page.screenshot({ path: pfad, type: 'jpeg', quality: 70, clip });
}

test('Einschlag zeigt Risse und Geröll auf festem Gelände, Bild vorher und nachher', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await starte(page);
  const schuss = await sprenge(page);
  expect(schuss.optik.risse).toBeGreaterThan(0);
  expect(schuss.optik.geroell).toBeGreaterThan(0);

  // Risse und Geröll malen nur auf vorhandenes Gelände (kein deckendes Pixel im Freien) und färben es sichtbar um.
  expect(schuss.imFreien).toBe(0);
  expect(schuss.veraendert).toBeGreaterThan(50);

  if (process.env.PA_BILDER) {
    mkdirSync('docs/bilder', { recursive: true });
    await starte(page);
    await ausschnitt(page, schuss, 'docs/bilder/einschlag-vorher.jpg');
    await sprenge(page);
    await ausschnitt(page, schuss, 'docs/bilder/einschlag-nachher.jpg');
  }
  expect(fehler).toEqual([]);
});
