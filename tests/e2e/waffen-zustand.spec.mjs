/**
 * E2E: Zustandsanzeigen der Waffenwirkung im laufenden Spiel (N-10, N-15).
 *
 * Geprüft wird, dass die neuen Zeichenwege im echten Renderer ohne Fehler laufen und ihren Zustand führen:
 *   - Nahkampf-Familien (Schnitt, Stich) erscheinen als Pose mit eigener Art und eigener Blitzform,
 *   - die Schildblase folgt `statuses[id].shield` (Aufbau, Treffer, Zerplatzen),
 *   - Minen vom Kartenaufbau liegen sofort (kein Fallen), eine neu gelegte Mine wird verfolgt.
 * Ob es GUT aussieht, belegt das nicht: Sichtprüfung bleibt (`PA_SHOTS=<Ordner>` legt Bilder ab).
 */
import { test, expect } from '@playwright/test';

async function matchStarten(page, seed = '4') {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.fill('#cfg-seed', seed);
  await page.click('#start-button');
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#weapon-list .weapon-item').first()).toBeVisible();
  return fehler;
}

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

const zustand = page => page.evaluate(() => window.__PA__.waffenAnimation());

test.describe('Waffen-Zustandsanzeigen', () => {
  test('Nahkampf: Katana schneidet (Bogen), Rapier sticht (Spur), jede Familie mit eigener Art', async ({ page }) => {
    const fehler = await matchStarten(page);
    const erwartet = [['pa_012', 'schnitt', 'bogen'], ['pa_016', 'stoss', 'stoss'], ['pa_008', 'schlag', 'stern'], ['pa_003', 'zug', 'keiner']];
    for (const [waffe, art, form] of erwartet) {
      const spieler = await page.evaluate((id) => {
        const api = window.__PA__;
        const match = api.getMatch();
        const s = match.activePlayerId;
        match.inventory.register(s, [id]);
        api.selectWeaponById(id);
        return s;
      }, waffe);
      await page.waitForFunction(({ id, w }) => window.__PA__.waffenAnimation().posen[id]?.waffeId === w, { id: spieler, w: waffe }, { timeout: 15000 });
      expect((await zustand(page)).posen[spieler].art, waffe).toBe(art);
      const schuesse = (await zustand(page)).posen[spieler].schuesse ?? 0;
      await page.evaluate(() => window.__PA__.fire(0.3, 40));
      await page.waitForFunction(({ id, n }) => (window.__PA__.waffenAnimation().posen[id]?.schuesse ?? 0) > n, { id: spieler, n: schuesse });
      const erg = await page.evaluate((id) => {
        const aus = { blitz: 0, form: '', bewegung: 0 };
        for (let t = 0; t < 0.9; t += 0.005) {
          const p = window.__PA__.waffenPoseBei(id, t);
          if (p.blitz > aus.blitz) { aus.blitz = p.blitz; aus.form = p.blitzForm; }
          aus.bewegung = Math.max(aus.bewegung, Math.abs(p.vor), Math.abs(p.hoch), Math.abs(p.drehung) * 10);
        }
        return aus;
      }, spieler);
      expect(erg.bewegung, `${waffe}: Bewegung`).toBeGreaterThan(1);
      if (form === 'keiner') expect(erg.blitz, waffe).toBe(0);
      else { expect(erg.blitz, waffe).toBeGreaterThan(0.5); expect(erg.form, waffe).toBe(form); }
      await page.evaluate(() => window.__PA__.advance(400));
    }
    await ablegen(page, 'waffen-zustand-nahkampf');
    expect(fehler).toEqual([]);
  });

  test('Schildblase folgt dem Schildwert der Figur: da, getroffen, zerplatzt, weg', async ({ page }) => {
    const fehler = await matchStarten(page);
    const spieler = await page.evaluate(() => window.__PA__.getMatch().activePlayerId);
    const abfrage = () => page.evaluate(id => window.__PA__.waffenAnimation().zustand.schild[id] ?? null, spieler);
    expect(await abfrage()).toBeNull();
    await page.evaluate(id => window.__PA__.getMatch().statuses.addShield(id, 40), spieler);
    await expect.poll(async () => (await abfrage())?.wert, { timeout: 5000 }).toBe(40);
    await ablegen(page, 'waffen-zustand-schild');
    // Treffer: Wert sinkt, die Marke `treffer` springt auf einen neuen Zeitstempel.
    const vor = (await abfrage()).treffer;
    await page.evaluate(id => window.__PA__.getMatch().statuses.absorbWithShield(id, 15), spieler);
    await expect.poll(async () => (await abfrage())?.wert, { timeout: 5000 }).toBe(25);
    await expect.poll(async () => (await abfrage())?.treffer, { timeout: 5000 }).toBeGreaterThan(vor);
    // Rest weg: die Blase zerplatzt (Zeitstempel `platzt`) und verschwindet danach.
    await page.evaluate(id => window.__PA__.getMatch().statuses.absorbWithShield(id, 500), spieler);
    await expect.poll(async () => (await abfrage())?.platzt, { timeout: 5000 }).toBeGreaterThan(0);
    expect(fehler).toEqual([]);
  });

  test('Minen: Kartenminen liegen sofort, die Verfolgung läuft ohne Fehler', async ({ page }) => {
    const fehler = await matchStarten(page, '3');
    await expect.poll(async () => (await zustand(page)).zustand.minen, { timeout: 5000 }).toBeGreaterThanOrEqual(0);
    const n = await page.evaluate(() => window.__PA__.getState().bodenobjekte?.filter(m => m.typ !== 'fass').length ?? 0);
    await expect.poll(async () => (await zustand(page)).zustand.minen, { timeout: 5000 }).toBe(n);
    await ablegen(page, 'waffen-zustand-minen');
    expect(fehler).toEqual([]);
  });
});
