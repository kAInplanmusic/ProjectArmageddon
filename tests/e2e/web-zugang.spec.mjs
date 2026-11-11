/**
 * E2E: Web-Zugang (docs/zugang-www.md) im Browser. Die Funktionen unter /api/web/* sind durch Mocks ersetzt
 * (kein Netlify, kein Hetzner); das Modul `webStart.js` wird in die Dev-Seite geladen, wie es der Web-Build tut.
 */
import { test, expect } from '@playwright/test';

async function vorbereiten(page, { eingeloggt = false } = {}) {
  const log = { aufrufe: [], startBody: null };
  let angemeldet = eingeloggt; let zustand = 'aus';
  await page.route('**/pa-web.json', r => r.fulfill({ json: { gateway: true } }));
  await page.route('**/api/web/**', async route => {
    const req = route.request(); const pfad = new URL(req.url()).pathname.split('/').pop();
    const body = req.method() === 'POST' ? (req.postDataJSON() ?? {}) : {};
    log.aufrufe.push(`${req.method()} ${pfad}`);
    const nutzer = { id: 'u1', name: 'Tester', email: 't@example.org' };
    if (pfad === 'ich') return route.fulfill(angemeldet ? { json: { nutzer } } : { status: 401, json: { fehler: 'Bitte anmelden.' } });
    if (pfad === 'registrieren') {
      if (body.anmeldepasswort !== 'richtig') return route.fulfill({ status: 403, json: { fehler: 'Das Anmeldepasswort ist falsch' } });
      angemeldet = true; return route.fulfill({ json: { ok: true, nutzer } });
    }
    if (pfad === 'login') { angemeldet = true; return route.fulfill({ json: { ok: true, nutzer } }); }
    if (pfad === 'logout') { angemeldet = false; return route.fulfill({ json: { ok: true } }); }
    if (!angemeldet) return route.fulfill({ status: 401, json: { fehler: 'Bitte anmelden.' } });
    if (pfad === 'spieltoken') return route.fulfill({ json: { token: `pa1.${'t'.repeat(40)}`, laeuftAb: Date.now() + 7_200_000, name: 'Tester' } });
    if (pfad === 'status') return route.fulfill({ json: zustand === 'bereit' ? { zustand, spielUrl: 'https://1-2-3-4.sslip.io', version: null } : { zustand, abbild: true } });
    if (pfad === 'start') {
      log.startBody = body;
      if (body.startcode !== 'code') return route.fulfill({ status: 403, json: { fehler: 'Startcode falsch.' } });
      zustand = 'bereit'; return route.fulfill({ status: 202, json: { zustand: 'startet' } });
    }
    if (pfad === 'passwort-aendern') return route.fulfill(body.altes === 'altespw' ? { json: { ok: true } } : { status: 403, json: { fehler: 'Das alte Passwort ist falsch' } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/');
  await page.addScriptTag({ type: 'module', url: '/src/client/webStart.js' });
  return log;
}

test('Web-Zugang: Login zuerst, Wechsel zu Registrieren, danach Startscreen mit unbeschriftetem Startcode-Feld', async ({ page }) => {
  const log = await vorbereiten(page);
  const dialog = page.getByRole('dialog', { name: 'Anmelden' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Benutzername oder E-Mail')).toBeFocused();
  expect(await page.locator('#menu-overlay').evaluate(e => Boolean(e.closest('[inert]')))).toBe(true);

  await dialog.getByRole('button', { name: 'Noch kein Konto? Registrieren' }).click();
  const reg = page.getByRole('dialog', { name: 'Registrieren' });
  await reg.getByLabel('E-Mail').fill('t@example.org');
  await reg.getByLabel('Benutzername (frei wählbar)').fill('Tester');
  await reg.getByLabel('Passwort (mindestens 8 Zeichen)').fill('geheim-1234');
  await reg.getByLabel('Anmeldepasswort für die Registrierung').fill('falsch');
  await reg.getByRole('button', { name: 'Registrieren', exact: true }).click();
  await expect(reg.getByRole('alert')).toHaveText('Das Anmeldepasswort ist falsch');
  await reg.getByLabel('Anmeldepasswort für die Registrierung').fill('richtig');
  await reg.getByRole('button', { name: 'Registrieren', exact: true }).click();

  await expect(page.locator('.pa-web-deck')).toHaveCount(0);
  expect(await page.locator('#menu-overlay').evaluate(e => Boolean(e.closest('[inert]')))).toBe(false);
  await expect(page.locator('#menu-overlay .menu-logo')).toBeVisible();
  const leiste = page.locator('#pa-web-leiste');
  await expect(leiste).toContainText('Angemeldet als Tester');
  const feld = leiste.getByRole('textbox', { name: 'Startcode' });
  await expect(feld).toBeVisible();
  await expect(leiste.locator('label')).toHaveCount(0); // unbeschriftet
  await expect(feld).toHaveAttribute('aria-label', 'Startcode');
  await expect(page.locator('#pa-web-status')).toHaveText('Spielserver: aus.');

  await feld.fill('falsch'); await feld.press('Enter');
  await expect(page.locator('#pa-web-status')).toHaveText('Startcode falsch.');
  await expect(feld).toHaveValue('');
  await feld.fill('code'); await feld.press('Enter');
  await expect.poll(() => log.startBody).toEqual({ startcode: 'code' });
  await expect(page.locator('#pa-web-status')).toHaveText('Spielserver: bereit.');
  await expect(page.locator('#cfg-server')).toHaveValue('https://1-2-3-4.sslip.io');
  const sitzung = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pa.konto.v1')));
  expect(sitzung.name).toBe('Tester'); expect(sitzung.token.startsWith('pa1.')).toBe(true);
  await expect(page.getByRole('button', { name: 'Not-aus' })).toBeVisible();
});

test('Web-Zugang: bestehende Sitzung überspringt den Login; Läuft der Server, braucht niemand einen Startcode; Passwort ändern', async ({ page }) => {
  await vorbereiten(page, { eingeloggt: true });
  await expect(page.locator('#pa-web-leiste')).toContainText('Angemeldet als Tester');
  await expect(page.locator('.pa-web-deck')).toHaveCount(0);
  await page.getByRole('button', { name: 'Passwort ändern' }).click();
  const dlg = page.getByRole('dialog', { name: 'Passwort ändern' });
  await dlg.getByLabel('Altes Passwort').fill('falschpw');
  await dlg.getByLabel('Neues Passwort (mindestens 8 Zeichen)').fill('neues-passwort-1');
  await dlg.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('Das alte Passwort ist falsch');
  await dlg.getByLabel('Altes Passwort').fill('altespw');
  await dlg.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(page.locator('.pa-web-deck')).toHaveCount(0);
  await expect(page.locator('#pa-web-status')).toHaveText('Passwort geändert.');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('dialog', { name: 'Anmelden' })).toBeVisible();
});
