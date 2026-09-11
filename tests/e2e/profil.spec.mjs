import { test, expect } from '@playwright/test';

/**
 * Spielerprofil im Browser.
 *
 * Die Kennzahlen entstehen aus den Ereignissen des Matches (Unit-Tests in
 * `tests/stats.test.js`). Hier geht es um den Weg, auf dem ein Spieler sie
 * sieht und behält: Erfassung während des Matches, Anzeige im Endbildschirm,
 * Speicherung über einen Neustart, Zurücksetzen.
 *
 * Wichtig: Die Zahlen liegen im lokalen Speicher des Browsers, nicht auf einem
 * Server — es gibt keine Konten. Das ist eine bewusste Zwischenlösung und der
 * Grund, warum ein Zurücksetzen-Knopf dazugehört: Sonst wäre die Angabe
 * unerreichbar.
 */

/**
 * Spielt ein Match bis zum Ende.
 *
 * Wichtig: Es muss GESCHOSSEN werden. Im lokalen Match gibt es keine Bots (den
 * `BotController` gibt es nur im Server), also würden ohne Schüsse weder Treffer
 * noch Schaden entstehen — und das Profil bliebe leer. Genau das hat der erste
 * Testlauf gezeigt: `schadenGesamt` war 0, das Match endete allein durch das
 * Rundenlimit.
 *
 * ## Zwei Messungen, die den Aufbau bestimmen
 *
 * **1. Bei 45° trifft nichts.** Der erste Anlauf schoss mit `Math.PI / 4` — bei
 * zwei Figuren im Abstand von 426 px ging jeder Schuss daneben. Gemessen waren
 * von 14 Schadensereignissen ALLE mit `attackerId: null` (Beträge 10 und 15 =
 * Ertrinken und Sturz) und nur eines mit Angreifer (Flächenschaden am eigenen
 * Team). Die Statistik meldete deshalb zu Recht 0 Schaden.
 *
 * Geschossen wird deshalb mit FLACHEN Winkeln (`[0.12, 0.2, 0.3, 0.45]`, wie im
 * Balance-Bericht), und die Richtung hängt an der Teamseite: Team 0 links (0),
 * Team 1 rechts (π).
 *
 * **2. Ein Match endet damit trotzdem nicht.** Es gibt keine Bots, und ein
 * Treffer macht rund 9 Schaden bei 100 Leben — bei einem Schuss je Runde und
 * 30 Runden ist die Ausschaltung rechnerisch unerreichbar; der 45°-Spielaufbau
 * endete früher nur, weil ein Landungsfehler die Figuren im Stehen tötete.
 *
 * Der Schaden für die Kennzahlen wird deshalb AUSDRÜCKLICH zugefügt, über den
 * Schadensweg des Motors — mit dem eigenen Spieler als Verursacher, damit er
 * auch als Schaden zählt (Schaden ohne Verursacher wird bewusst nicht gezählt).
 * Damit ist der Test unabhängig von der Karte und prüft das, worum es geht: die
 * Erfassung und Anzeige der Kennzahlen.
 */
async function matchZuEndeSpielen(page, { seed = 4242 } = {}) {
  await page.evaluate(async ({ seed }) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed, teams: 2, playersPerTeam: 1, preset: 'hills' });
    api.setAutoLoop(false);

    const match = api.game.match;
    const WINKEL = [0.12, 0.2, 0.3, 0.45];

    // 1) Schüsse abgeben — sie erzeugen Schuss- und Waffenkennzahlen.
    for (const w of WINKEL) {
      const zustand = api.getState();
      if (!zustand || zustand.status !== 'playing') break;
      const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
      if (!aktiv) break;
      const basis = aktiv.teamId === 0 ? 0 : Math.PI;
      const richtung = basis === 0 ? 1 : -1;
      api.fire(basis + richtung * w, 70);
      // Fliegen lassen, bis der Schuss und der Zug durch sind.
      for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
    }

    // 2) Schaden und Ende: Der eigene Spieler schaltet den Gegner aus.
    //
    //    Wichtig: der EIGENE Spieler (Team 0), nicht der gerade aktive. Nach den
    //    Schüssen ist der Zug weitergelaufen, und `activePlayerId` kann der Gegner
    //    sein — dann trüge der Schaden den falschen Verursacher, und Schaden am
    //    eigenen Team wird bewusst nicht gezählt.
    const eigener = match.players.find(p => p.teamId === 0).entityId;
    const schaden = match.world.getSystem('damage');
    for (const gegner of match.players.filter(p => p.teamId === 1)) {
      schaden.applyDamage(match.world, gegner.entityId, 10_000, eigener);
    }
    for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
  }, { seed });
  return page.evaluate(() => window.__PA__.getState()?.status);
}

test('Das Profil ist zu Beginn leer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const profil = await page.evaluate(() => window.__PA__.profil());
  expect(profil.partien).toBe(0);
  expect(profil.schuesse).toBe(0);
  expect(profil.siege).toBe(0);
  expect(profil.serie).toBe(0);

  // Und die Anzeige steht schon da — mit Strichen statt leerer Zeilen.
  await page.locator('#profil-browser summary').click();
  const werte = await page.locator('#profil-werte').textContent();
  expect(werte).toContain('Partien');
  expect(werte).toContain('Lieblingswaffe');
  expect(werte).toContain('—');

  // Der Hinweis erklärt, warum die Nation fehlt.
  await expect(page.locator('#profil-hinweis')).toContainText('Charakterwahl');
});

test('Ein gespieltes Match landet im Profil', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  expect(await matchZuEndeSpielen(page)).toBe('gameover');

  const nachher = await page.evaluate(() => ({
    profil: window.__PA__.profil(),
    partie: window.__PA__.matchKennzahlen(),
  }));

  // Die Partie ist entschieden und hat Zahlen.
  expect(nachher.partie.entschieden).toBe(true);
  expect(nachher.partie.figuren.length).toBeGreaterThan(0);
  expect(nachher.partie.ticks).toBeGreaterThan(0);
  expect(nachher.partie.schadenGesamt).toBeGreaterThan(0);

  // Und sie wurde verbucht.
  expect(nachher.profil.partien).toBe(1);
  expect(nachher.profil.schuesse).toBeGreaterThan(0);
  // Das Profil führt den EIGENEN Schaden — hier ist er der einzige, weil nur der
  // eigene Spieler Schaden verursacht hat.
  expect(nachher.partie.eigener.schaden).toBeGreaterThan(0);
  expect(nachher.profil.schaden).toBe(nachher.partie.eigener.schaden);
  // Der eigene Spieler hat den Gegner ausgeschaltet — also gewonnen.
  expect(nachher.partie.eigener.sieg).toBe(true);
  expect(nachher.profil.siege).toBe(1);
  // Entweder Sieg oder Niederlage — nicht unentschieden.
  expect(nachher.profil.siege + nachher.profil.niederlagen).toBe(1);
});

test('Die Kennzahlen der Partie erscheinen im Endbildschirm', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  await expect(page.locator('#end-overlay')).toBeVisible();

  const kennzahlen = await page.locator('#match-kennzahlen').textContent();
  expect(kennzahlen).toContain('Schaden gesamt');
  expect(kennzahlen).toContain('Spielzeit');
  expect(kennzahlen).toContain('Runden');

  // Und die Tabelle zeigt den Beitrag aller Spieler.
  const tabelle = await page.locator('#match-tabelle').textContent();
  expect(tabelle).toContain('Spieler');
  expect(tabelle).toContain('Schaden');
  expect(tabelle).toContain('(du)');
});

test('Das Profil überlebt einen Neustart der Seite', async ({ page }) => {
  /*
   * Der Kern der Speicherung: Die Zahlen liegen im lokalen Speicher des Browsers.
   * Ohne diesen Test wäre ein Profil denkbar, das nur im Speicher lebt — und
   * beim Neuladen verschwindet.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  const vorher = await page.evaluate(() => window.__PA__.profil());
  expect(vorher.partien).toBe(1);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));

  const nachher = await page.evaluate(() => window.__PA__.profil());
  expect(nachher.partien).toBe(1);
  expect(nachher.schuesse).toBe(vorher.schuesse);
  expect(nachher.schaden).toBe(vorher.schaden);
  expect(nachher.serie).toBe(vorher.serie);
  // Die Waffenkennzahlen überleben ebenfalls (Maps brauchen eigene Umwandlung).
  expect(nachher.waffen).toEqual(vorher.waffen);
});

test('Ein zweites Match wird hinzugezählt, nicht ersetzt', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  await matchZuEndeSpielen(page);
  const erste = await page.evaluate(() => window.__PA__.profil());

  // Zweites Match mit anderem Seed — derselbe Weg, andere Partie.
  await matchZuEndeSpielen(page, { seed: 999 });

  const zweite = await page.evaluate(() => window.__PA__.profil());
  expect(zweite.partien).toBe(2);
  expect(zweite.schuesse).toBeGreaterThan(erste.schuesse);
  expect(zweite.schaden).toBeGreaterThan(erste.schaden);
  expect(zweite.spielzeitSekunden).toBeGreaterThan(erste.spielzeitSekunden);
});

test('Ein Match wird nur EINMAL verbucht', async ({ page }) => {
  /*
   * Absicherung gegen doppelte Buchung: Der Endbildschirm kann mehrfach
   * ausgelöst werden (Revanche, Neustart, doppeltes Ereignis). Die Partie darf
   * dann nicht mehrfach zählen — sonst wären Partien und Spielzeit aufgebläht.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);

  const vorher = await page.evaluate(() => window.__PA__.profil());
  expect(vorher.partien).toBe(1);

  /*
   * Den Zustand nach dem Ende weiterspulen. Der Endbildschirm wird dabei
   * wiederholt ausgelöst (`#showEndScreen` läuft bei jedem weiteren Schritt über
   * den `gameover`-Zweig) — genau der Fall, in dem eine doppelte Buchung
   * auftreten würde. Der Merker `verbucht` muss das verhindern.
   */
  await page.evaluate(() => {
    const api = window.__PA__;
    for (let i = 0; i < 300; i += 1) api.advance(1);
  });
  await page.waitForTimeout(150);

  const nachher = await page.evaluate(() => window.__PA__.profil());
  expect(nachher.partien, 'Die Partie wurde mehrfach verbucht').toBe(1);
  expect(nachher.schaden).toBe(vorher.schaden);
});

test('Zurücksetzen leert die Zahlen — und sie bleiben leer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await matchZuEndeSpielen(page);
  expect((await page.evaluate(() => window.__PA__.profil())).partien).toBe(1);

  // Zurück ins Menü: Nach dem Match liegt der Endbildschirm über dem Menü, und
  // die Profilangabe wäre nicht anklickbar.
  await page.getByRole('button', { name: 'Revanche' }).click();
  await expect(page.locator('#menu-overlay')).toBeVisible();

  await page.locator('#profil-browser summary').click();
  await page.getByRole('button', { name: 'Zahlen zurücksetzen' }).click();

  const nachReset = await page.evaluate(() => window.__PA__.profil());
  expect(nachReset.partien).toBe(0);
  expect(nachReset.schuesse).toBe(0);

  // Und nach dem Neuladen ist es immer noch leer — der Speicher ist geräumt.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));
  expect((await page.evaluate(() => window.__PA__.profil())).partien).toBe(0);
});

test('Ein beschädigtes Profil blockiert das Spiel nicht', async ({ page }) => {
  /*
   * Fehlertoleranz: Der Eintrag im lokalen Speicher kann von einer älteren
   * Version stammen oder fremd geschrieben sein. Ein Profil ist Beiwerk — es darf
   * das Spiel nicht unbrauchbar machen.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  await page.evaluate(() => localStorage.setItem('pa-profil-v1', '{kaputt'));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));

  // Das Spiel läuft, das Profil beginnt neu.
  const profil = await page.evaluate(() => window.__PA__.profil());
  expect(profil.partien).toBe(0);
  await expect(page.locator('#game-canvas')).toBeVisible();
});
