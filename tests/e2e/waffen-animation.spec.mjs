/**
 * E2E: Waffen-Animation im Spiel.
 *
 * Geprüft: Die gehaltene Waffe wird aus dem Atlas als Sprite gezeichnet (nicht
 * mehr als Icon), der Schuss löst Rückstoß und Blitz aus, bei reduzierter
 * Bewegung bleibt der Blitz und die Bewegung entfällt, und ein Geschoss fliegt
 * als Sprite mit Schweif. Mit `PA_SHOTS=<Ordner>` werden Bilder abgelegt.
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

/** Gibt der Figur am Zug eine Waffe (über die Debug-Schnittstelle) und wählt sie. */
async function waffeWaehlen(page, waffeId) {
  return page.evaluate((id) => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;
    match.inventory.register(spieler, [id]);
    api.selectWeaponById(id);
    return spieler;
  }, waffeId);
}

const waffenZustand = page => page.evaluate(() => window.__PA__.waffenAnimation());

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

/** Tastet die Pose der Figur ~`ms` Millisekunden lang je Bild ab und liefert Höchstwerte. */
function beobachte(page, spieler, ms) {
  return page.evaluate(({ id, dauer }) => new Promise((ok) => {
    const erg = { blitz: 0, glanz: 0, vor: 0, drehung: 0, form: '', geschosse: 0, geschossSprites: 0, schweif: 0, winkelBewegt: false, proben: 0 };
    const t0 = performance.now();
    const winkel = new Set();
    const schritt = () => {
      const api = window.__PA__.waffenAnimation();
      const p = api.posen[id];
      if (p) {
        erg.proben += 1;
        erg.blitz = Math.max(erg.blitz, p.blitz);
        erg.glanz = Math.max(erg.glanz, p.glanz);
        erg.vor = Math.min(erg.vor, p.vor);
        erg.drehung = Math.max(erg.drehung, Math.abs(p.drehung));
        if (p.blitz > 0) erg.form = p.blitzForm;
      }
      erg.geschosse = Math.max(erg.geschosse, api.geschosse.length);
      erg.geschossSprites = Math.max(erg.geschossSprites, api.stat.geschossSprites);
      for (const g of api.geschosse) {
        if (g.sprite) { erg.schweif = Math.max(erg.schweif, g.schweif); winkel.add(Math.round(g.winkel * 100)); }
      }
      if (performance.now() - t0 < dauer) requestAnimationFrame(schritt);
      else { erg.winkelBewegt = winkel.size > 2; ok(erg); }
    };
    requestAnimationFrame(schritt);
  }), { id: spieler, dauer: ms });
}

test.describe('Waffen-Animation', () => {
  test('Waffe wählen: der Atlas lädt lazy, die Waffe wird als Sprite gezeichnet (kein Icon)', async ({ page }) => {
    const fehler = await matchStarten(page);
    // Es wird nur geladen, was gebraucht wird: höchstens die Atlanten der benutzten Kategorien.
    await page.waitForFunction(() => window.__PA__.waffenAnimation().stat.sprite > 0, null, { timeout: 15000 });
    const anfang = await waffenZustand(page);
    expect(anfang.lader.manifest).toBe('bereit');
    const katAnzahl = Object.keys(anfang.lader.atlanten).length;
    expect(katAnzahl).toBeGreaterThan(0);
    expect(katAnzahl).toBeLessThan(9);
    expect(Object.keys(anfang.lader.atlanten)).not.toContain('icons');

    const spieler = await waffeWaehlen(page, 'pa_055');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_055', spieler, { timeout: 15000 });
    const z = await waffenZustand(page);
    expect(z.posen[spieler].waffeId).toBe('pa_055');
    expect(z.stat.sprite).toBeGreaterThan(0);
    expect(z.stat.ikone).toBe(0);
    expect(z.lader.atlanten.heavy_ranged).toBe('bereit');
    // Ein zweiter Wechsel in dieselbe Kategorie lädt keinen weiteren Atlas.
    const atlasAnzahl = Object.keys(z.lader.atlanten).length;
    await waffeWaehlen(page, 'pa_054');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_054', spieler);
    expect(Object.keys((await waffenZustand(page)).lader.atlanten).length).toBe(atlasAnzahl);
    await ablegen(page, 'waffen-animation-stand');
    expect(fehler).toEqual([]);
  });

  test('Schuss: Rückstoß und Mündungsblitz, danach Ruhe', async ({ page }) => {
    const fehler = await matchStarten(page);
    const spieler = await waffeWaehlen(page, 'pa_055');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_055', spieler, { timeout: 15000 });
    await page.waitForTimeout(500);
    const ruhe = await waffenZustand(page);
    expect(ruhe.posen[spieler].blitz).toBe(0);
    expect(ruhe.posen[spieler].vor).toBe(0);

    // Zustandsabfrage statt Abtasten: auf den registrierten Schuss warten, Pose zu festen Zeiten prüfen.
    const vorher = ruhe.posen[spieler].schuesse ?? 0;
    await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 45));
    await page.waitForFunction(
      ({ id, n }) => (window.__PA__.waffenAnimation().posen[id]?.schuesse ?? 0) > n, { id: spieler, n: vorher });
    const erg = await page.evaluate((id) => {
      const api = window.__PA__;
      const aus = { blitz: 0, form: '', vor: 0, drehung: 0 };
      for (let t = 0; t < 0.9; t += 0.005) {
        const p = api.waffenPoseBei(id, t);
        if (p.blitz > aus.blitz) { aus.blitz = p.blitz; aus.form = p.blitzForm; }
        aus.vor = Math.min(aus.vor, p.vor);
        aus.drehung = Math.max(aus.drehung, Math.abs(p.drehung));
      }
      return aus;
    }, spieler);
    expect(erg.blitz).toBeGreaterThan(0.5);
    expect(erg.form).toBe('kegel');
    expect(erg.vor).toBeLessThan(-2);
    expect(erg.drehung).toBeGreaterThan(0.05);
    await ablegen(page, 'waffen-animation-schuss');

    await page.waitForTimeout(400);
    const danach = (await waffenZustand(page)).posen[spieler];
    expect(danach.blitz).toBe(0);
    expect(danach.vor).toBe(0);
    expect(fehler).toEqual([]);
  });

  test('Reduzierte Bewegung: der Blitz bleibt, die Bewegung entfällt', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fehler = await matchStarten(page);
    const spieler = await waffeWaehlen(page, 'pa_055');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_055', spieler, { timeout: 15000 });
    expect((await waffenZustand(page)).reduziert).toBe(true);
    /*
     * Ursache der früheren Flakiness (Blitz 0,29 statt > 0,5 unter Last): Der Blitz ist ein
     * kurzes Fenster (0,09–0,26 s), das bei seinem Beginn am hellsten ist und quadratisch
     * abklingt. Die alte Prüfung tastete 800 ms lang die GEZEICHNETEN Bilder ab — unter Last
     * sind die Bilder selten und spät, das erste Bild im Fenster sah nur den abgeklungenen Rest.
     * Die Pose ist eine reine Funktion der Zeit seit dem Schuss; deshalb wird jetzt auf das
     * Animationsereignis gewartet (der Renderer hat den Schuss registriert) und die Pose
     * zu festen Zeitpunkten ausgewertet, nicht zu zufällig getroffenen Bildzeiten.
     */
    const vorher = (await waffenZustand(page)).posen[spieler].schuesse ?? 0;
    await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 45));
    await page.waitForFunction(
      ({ id, n }) => (window.__PA__.waffenAnimation().posen[id]?.schuesse ?? 0) > n, { id: spieler, n: vorher });
    const proben = await page.evaluate((id) => {
      const api = window.__PA__;
      const erste = api.waffenPoseBei(id, 0);
      const t0 = erste.aufladen;
      const aus = { blitzAnfang: api.waffenPoseBei(id, t0 + 0.005).blitz, vor: 0, drehung: 0 };
      for (let t = 0; t < erste.schussDauer; t += 0.005) {
        const p = api.waffenPoseBei(id, t);
        aus.vor = Math.min(aus.vor, p.vor);
        aus.drehung = Math.max(aus.drehung, Math.abs(p.drehung));
      }
      return aus;
    }, spieler);
    expect(proben.blitzAnfang).toBeGreaterThan(0.5);
    expect(proben.vor).toBe(0);
    expect(proben.drehung).toBe(0);
    expect(fehler).toEqual([]);
  });

  test('Geschoss: fliegt als Sprite in Flugrichtung mit Schweif, Wurfwaffen drehen sich', async ({ page }) => {
    const fehler = await matchStarten(page);
    // Raketenwerfer (Geschoss rakete): richtet sich nach der Flugrichtung.
    const spieler = await waffeWaehlen(page, 'pa_037');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_037', spieler, { timeout: 15000 });
    const beob = beobachte(page, spieler, 1200);
    await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 60));
    const erg = await beob;
    expect(erg.geschosse).toBeGreaterThan(0);
    expect(erg.geschossSprites).toBeGreaterThan(0);
    expect(erg.schweif).toBeGreaterThan(2);
    expect(erg.winkelBewegt, 'der Winkel folgt der gekrümmten Flugbahn').toBe(true);
    await ablegen(page, 'waffen-animation-geschoss');
    expect(fehler).toEqual([]);
  });

  test('Kachel-Waffen: Orb (Zauber-Darstellung) oder herausgelöstes Motiv, nie die gerahmte Karte', async ({ page }) => {
    const fehler = await matchStarten(page);
    // pa_118 Feuerwesen: Orb; pa_034 Zauberbolzen: Motiv ohne Rahmen
    const spieler = await waffeWaehlen(page, 'pa_118');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_118', spieler, { timeout: 15000 });
    const orb = (await waffenZustand(page)).posen[spieler];
    expect(orb.kachel).toBe('orb');
    expect(orb.orb).toBe(true);
    await page.waitForTimeout(300);
    await ablegen(page, 'waffen-animation-kachel-orb');

    await waffeWaehlen(page, 'pa_034');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_034', spieler, { timeout: 15000 });
    const motiv = (await waffenZustand(page)).posen[spieler];
    expect(motiv.kachel).toBe('motiv');
    expect(motiv.orb).toBe(false);
    await page.waitForTimeout(300);
    await ablegen(page, 'waffen-animation-kachel-motiv');
    expect(fehler).toEqual([]);
  });

  test('Lage und Figurtyp: Rucksack-Waffen hinter dem Körper, Nahkampf davor, Hand je Figurtyp', async ({ page }) => {
    const fehler = await matchStarten(page);
    const spieler = await waffeWaehlen(page, 'pa_112');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_112', spieler, { timeout: 15000 });
    const jetpack = (await waffenZustand(page)).posen[spieler];
    expect(jetpack.lage).toBe('hinter');
    expect(['humanoid', 'tier', 'fahrzeug', 'schweber', 'wesen']).toContain(jetpack.figurTyp);
    await waffeWaehlen(page, 'pa_001');
    await page.waitForFunction(
      id => window.__PA__.waffenAnimation().posen[id]?.waffeId === 'pa_001', spieler, { timeout: 15000 });
    expect((await waffenZustand(page)).posen[spieler].lage).toBe('vor');
    expect(fehler).toEqual([]);
  });

  test('Ohne Atlas: Rückfall auf das Icon, das Spiel läuft weiter', async ({ page }) => {
    await page.route('**/weapon-sprites/atlas_*.png*', route => route.abort());
    const fehler = await matchStarten(page);
    const spieler = await waffeWaehlen(page, 'pa_055');
    await page.waitForFunction(() => window.__PA__.waffenAnimation().lader.fehlt > 0, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const z = await waffenZustand(page);
    expect(z.stat.sprite).toBe(0);
    expect(z.stat.ikone).toBeGreaterThan(0);
    expect(z.posen[spieler]).toBeUndefined();
    // Auch das Schießen funktioniert (altes Mündungsfeuer, Glutball).
    const ergebnis = await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 45));
    expect(ergebnis).toBeTruthy();
    expect(fehler.filter(f => !/Failed to load resource|net::/.test(f))).toEqual([]);
  });
});
