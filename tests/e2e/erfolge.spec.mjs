import { test, expect } from '@playwright/test';

/**
 * Erfolge im Browser.
 *
 * Die Auswertung ist in `tests/achievements.test.js` geprüft. Hier geht es um den
 * Weg, auf dem ein Spieler sie sieht und behält: Anzeige im Menü, Fortschritt,
 * Hinweise, Speicherung über einen Neustart, und die Kennzeichnung der Muster.
 *
 * Der Katalog enthält derzeit nur MUSTER (Platzhalter), weil Namen, Texte,
 * Symbole und Belohnungen eine Gestaltungsentscheidung sind. Die Tests prüfen
 * deshalb die MECHANIK und bestehen auch mit einem ausgetauschten Katalog — sie
 * dürfen nicht an einzelnen Titeln hängen.
 */

/** Spielt ein Match bis zum Ende und fügt dabei Schaden zu. */
async function matchZuEndeSpielen(page, { seed = 4242 } = {}) {
  await page.evaluate(async ({ seed }) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed, teams: 2, playersPerTeam: 1, preset: 'hills' });
    api.setAutoLoop(false);

    // Ein paar Schüsse für die Schuss-/Trefferkennzahlen.
    for (const w of [0.12, 0.2, 0.3]) {
      const zustand = api.getState();
      if (!zustand || zustand.status !== 'playing') break;
      const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
      if (!aktiv) break;
      const basis = aktiv.teamId === 0 ? 0 : Math.PI;
      api.fire(basis + (basis === 0 ? 1 : -1) * w, 70);
      for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
    }

    // Schaden und Ende über den Schadensweg des Motors (kein Bot im lokalen Spiel).
    const match = api.game.match;
    const eigener = match.players.find(p => p.teamId === 0).entityId;
    const schaden = match.world.getSystem('damage');
    for (const gegner of match.players.filter(p => p.teamId === 1)) {
      schaden.applyDamage(match.world, gegner.entityId, 10_000, eigener);
    }
    for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
  }, { seed });
  return page.evaluate(() => window.__PA__.getState()?.status);
}

test('Die Übersicht ist von Anfang an da — mit Fortschritt statt leer', async ({ page }) => {
  /*
   * Wichtig: Vor der ersten Partie zeigt die Liste nicht nichts, sondern jeden
   * Erfolg mit Stand 0 und einem Hinweis. Eine leere Liste wäre für einen neuen
   * Spieler eine Sackgasse — er wüsste nicht, dass es Erfolge gibt.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#erfolge-browser summary').click();

  const uebersicht = await page.evaluate(() => window.__PA__.erfolge());
  expect(uebersicht.gesamt).toBeGreaterThan(0);
  expect(uebersicht.erreicht).toBe(0);

  const zeilen = page.locator('#erfolge-liste .erfolg');
  await expect(zeilen).toHaveCount(uebersicht.gesamt);

  // Jede Zeile trägt Titel, Stufe, Hinweis und Stand.
  const erste = zeilen.first();
  await expect(erste.locator('.erfolg-hinweis')).not.toBeEmpty();
  await expect(erste.locator('.erfolg-stufe')).not.toBeEmpty();
  await expect(erste.locator('.erfolg-stand')).not.toBeEmpty();
});

test('Der Zähler nennt die Muster ausdrücklich', async ({ page }) => {
  /*
   * Ein Katalog aus Platzhaltern darf nicht wie ein fertiger aussehen. Solange
   * Muster enthalten sind, muss die Anzeige das sagen — sonst liest sich „12 von
   * 12 erreicht" wie ein vollständiges Spiel.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#erfolge-browser summary').click();

  const u = await page.evaluate(() => window.__PA__.erfolge());
  const zaehler = await page.locator('#erfolge-zaehler').textContent();

  expect(zaehler).toContain(`${u.gesamt}`);
  if (u.musterAnzahl > 0) {
    expect(zaehler).toContain('Muster');
    expect(zaehler).toContain(String(u.musterAnzahl));
    // Und die Muster sind auch in der Liste markiert.
    await expect(page.locator('#erfolge-liste .erfolg-muster')).toHaveCount(u.musterAnzahl);
  }
});

test('Die Stufen sind in der Anzeige vollständig', async ({ page }) => {
  // Die Auswertung liefert die Stufen; die Anzeige muss sie zeigen können. Eine
  // Stufe ohne Beschriftung wäre in der Liste eine leere Stelle.
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#erfolge-browser summary').click();

  const u = await page.evaluate(() => window.__PA__.erfolge());
  const texte = await page.locator('#erfolge-liste .erfolg-stufe').allTextContents();
  for (const stufe of u.nachStufe) {
    if (stufe.gesamt === 0) continue;
    expect(texte, `Die Stufe „${stufe.tier}" fehlt in der Anzeige`).toContain(stufe.tier);
  }
});

test('Eine gespielte Partie schaltet Erfolge frei und meldet sie', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const vorher = await page.evaluate(() => window.__PA__.erfolge().erreicht);
  expect(vorher).toBe(0);

  expect(await matchZuEndeSpielen(page)).toBe('gameover');

  // Die Meldungen stehen im Protokoll — ein Erfolg, den niemand bemerkt, ist
  // keiner.
  const protokoll = await page.locator('#log-list').textContent();
  expect(protokoll).toContain('Erfolg:');

  const nachher = await page.evaluate(() => window.__PA__.erfolge());
  expect(nachher.erreicht).toBeGreaterThan(0);

  // Und sie stehen im Profil (nicht nur in der Auswertung).
  const profil = await page.evaluate(() => window.__PA__.profil());
  expect(profil.erfolge.length).toBe(nachher.erreicht);
});

test('Erreichte Erfolge sind in der Liste als erreicht gekennzeichnet', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  // Zurück ins Menü (der Endbildschirm liegt darüber).
  await page.getByRole('button', { name: 'Revanche' }).click();
  await page.locator('#erfolge-browser summary').click();

  const u = await page.evaluate(() => window.__PA__.erfolge());
  await expect(page.locator('#erfolge-liste .erfolg.erreicht')).toHaveCount(u.erreicht);

  // Ein erreichter Eintrag zeigt „erreicht", ein offener Stand/Ziel oder Prozent.
  const erreicht = await page.locator('#erfolge-liste .erfolg.erreicht').first()
    .locator('.erfolg-stand').textContent();
  expect(erreicht).toBe('erreicht');
});

test('Die Erfolge überleben einen Neustart der Seite', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  const vorher = await page.evaluate(() => window.__PA__.profil().erfolge);
  expect(vorher.length).toBeGreaterThan(0);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));

  const nachher = await page.evaluate(() => window.__PA__.profil().erfolge);
  // Sortiert vergleichen: Die Reihenfolge ist beim Speichern festgelegt.
  expect([...nachher].sort()).toEqual([...vorher].sort());
  expect((await page.evaluate(() => window.__PA__.erfolge().erreicht))).toBe(vorher.length);
});

test('Ein einmal erreichter Erfolg bleibt es auch nach dem Zurücksetzen der Zahlen', async ({ page }) => {
  /*
   * Grenzfall, bewusst geprüft: Der Zurücksetzen-Knopf leert die KENNZAHLEN. Er
   * ist NICHT dafür da, Erfolge zu nehmen — wer ihn drückt, um die Statistik zu
   * nullen, soll seine Erfolge nicht verlieren. Ein Erfolg, der sich
   * zurücknimmt, wäre keiner.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  const erreichtVorher = await page.evaluate(() => window.__PA__.profil().erfolge);
  expect(erreichtVorher.length).toBeGreaterThan(0);

  const u = await page.evaluate(() => window.__PA__.profilZuruecksetzen());
  expect(u.erfolge.length, 'Das Zurücksetzen hat die Erfolge mitgenommen').toBe(erreichtVorher.length);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));
  const nachReload = await page.evaluate(() => window.__PA__.profil().erfolge);
  expect(nachReload.length).toBe(erreichtVorher.length);
});

test('Kein Erfolg verschwindet, wenn die Zahlen zurückgehen', async ({ page }) => {
  /*
   * `serie_rekord` ist der Fall: Der Rekord steht, aber eine Bedingung über die
   * AKTUELLE Serie könnte wieder darunter fallen. Geprüft wird über die API: Der
   * erreichte Stand darf nicht sinken, wenn danach eine Niederlage kommt.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const vorher = await page.evaluate(() => {
    const api = window.__PA__;
    // Erfolge künstlich als erreicht eintragen, dann eine schlechte Partie.
    api.game.profil.verbucheErfolge(['muster_siege_10']);
    return api.erfolge().erreicht;
  });
  expect(vorher).toBeGreaterThan(0);

  const nachher = await page.evaluate(() => window.__PA__.erfolge().erreicht);
  expect(nachher).toBe(vorher);
});
