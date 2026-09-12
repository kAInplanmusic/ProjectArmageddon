import { test, expect } from '@playwright/test';

/**
 * Auto-Turret im Browser.
 *
 * Der Motor ist in `tests/turret.test.js` geprüft, das Drahtformat in
 * `tests/netcode.test.js`. Hier geht es um das, was nur im Browser zu sehen ist:
 * dass die Waffe über den Spielweg auslösbar ist, dass das Geschütz GEZEICHNET
 * wird (mit und ohne Team-Zugehörigkeit), und dass es beim Aufräumen verschwindet.
 *
 * Der Anlass: `pa_124` trug `special: 'auto_target'`, aber `SPECIAL_EFFECTS`
 * kannte den Namen nicht — `buildEffect` lieferte `null`. Die Waffe war damit ein
 * gewöhnliches Geschoss, und das Geschütz existierte nur im Katalog.
 */

/** Startet ein Match mit dem Auto-Turret im Inventar. */
async function starteMitGeschuetz(page, { preset = 'open', seed = 4242, spielerProTeam = 1 } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  return page.evaluate(({ preset, seed, spielerProTeam }) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed, teams: 2, playersPerTeam: spielerProTeam, preset });
    api.setAutoLoop(false);

    const match = api.game.match;
    const spieler = match.activePlayerId;
    match.inventory.register(spieler, ['pa_124']);
    match.inventory.selectWeapon(spieler, 'pa_124');

    const waffe = window.__PA__.getWeapon('pa_124');
    const wirkung = window.__PA__.buildEffect('pa_124');
    const ergebnis = api.fire(0.5, 60);

    /*
     * EINEN Takt weiter: Die Ereignisse eines Schusses liegen in der Warteschlange,
     * und die Anzeige verteilt sie erst im nächsten `step()`. Ohne diesen Takt
     * steht die Meldung noch nicht im Protokoll — gemessen fehlte „Geschütz
     * aufgestellt", obwohl der Motor das Ereignis abgesetzt hatte.
     */
    api.advance(1);
    const eigeneEreignisse = (api.game.lastEvents ?? []).map(e => e.type);

    return {
      spieler,
      eigeneEreignisse,
      wirkung,
      waffeName: waffe?.displayName ?? null,
      ok: ergebnis.ok,
      special: ergebnis.special ?? null,
      fehler: ergebnis.errors ?? [],
    };
  }, { preset, seed, spielerProTeam });
}

/**
 * Spult bis zu einer Rundenzahl.
 *
 * Wichtig: `startMatch` kennt KEINE Zugzeit, im Browser gilt also die Vorgabe von
 * 30 s je Zug. Ein Rundendurchlauf dauert damit bei zwei Spielern 3600 Takte —
 * mit vier Spielern doppelt so lange. Der Test setzt deshalb auf zwei Spieler und
 * gibt ein großzügiges Taktbudget; ein früherer Ausstieg bei Spielende spart den
 * Rest.
 */
async function bisRunde(page, zielRunde, maxTakte = 40_000) {
  return page.evaluate(({ zielRunde, maxTakte }) => {
    const api = window.__PA__;
    const gezaehlt = new Map();
    let takte = 0;
    while (takte < maxTakte) {
      const zustand = api.getState();
      if (zustand.status !== 'playing' || zustand.round >= zielRunde) break;
      api.advance(1);
      for (const e of api.game.lastEvents ?? []) {
        gezaehlt.set(e.type, (gezaehlt.get(e.type) ?? 0) + 1);
      }
      takte += 1;
    }
    return {
      runde: api.getState().round,
      status: api.getState().status,
      takte,
      turrets: api.getState().turrets ?? [],
      // Ereignisse MITZÄHLEN statt im Protokoll zu suchen: Die Anzeige führt nur
      // eine begrenzte Zahl Zeilen, ältere fallen heraus. Ein Test auf den
      // sichtbaren Text wäre deshalb davon abhängig, wann er hinsieht.
      ereignisse: [...gezaehlt.entries()].map(([typ, anzahl]) => `${typ}:${anzahl}`),
    };
  }, { zielRunde, maxTakte });
}

test('Die Waffe hat im Browser eine Wirkung', async ({ page }) => {
  // Der Kern: Vorher war `buildEffect('pa_124')` gleich null.
  const stand = await starteMitGeschuetz(page);
  expect(stand.wirkung, 'buildEffect liefert immer noch null').toBeTruthy();
  expect(stand.wirkung.kind).toBe('turret');
  expect(stand.wirkung.damage).toBeGreaterThan(0);
  expect(stand.ok, `Schuss abgelehnt: ${stand.fehler.join(', ')}`).toBe(true);
  expect(stand.special?.kind).toBe('turret');
});

test('Das Geschütz steht im Spielzustand und wird gezeichnet', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));

  await starteMitGeschuetz(page);

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    const turrets = api.getState().turrets ?? [];
    // Ein paar Bilder zeichnen — dabei läuft #drawTurrets wirklich durch.
    for (let i = 0; i < 20; i += 1) api.advance(1);
    return {
      turrets,
      // Kein Projektil beim Aufstellen (Selbstwirkung).
      projektile: api.getState().projectiles.length,
    };
  });

  expect(stand.turrets.length, 'Kein Geschütz im Zustand').toBe(1);
  expect(stand.turrets[0].x).toBeGreaterThan(0);
  expect(stand.turrets[0].roundsLeft).toBeGreaterThan(0);
  expect(stand.projektile, 'Beim Aufstellen entstand ein Projektil').toBe(0);

  // Das Zeichnen darf keinen Fehler werfen — auch nicht mit mehreren Geschützen.
  await page.evaluate(() => {
    const api = window.__PA__;
    // Vier Geschütze in verschiedenen Team-Farben, ohne echte Aufstellung.
    api.game.match.getState();
    const r = api.game.renderer;
    r.render({ ...api.getState(), turrets: [
      { entityId: 1, x: 200, y: 340, teamId: 0, roundsLeft: 3 },
      { entityId: 2, x: 400, y: 300, teamId: 1, roundsLeft: 1 },
      { entityId: 3, x: 600, y: 350, teamId: 2, roundsLeft: 5 },
      { entityId: 4, x: 800, y: 320, teamId: 0, roundsLeft: 0 },
    ] }, { aim: { angle: 1, power: 50 }, trajectory: [] });
  });
  expect(fehler, `Seitenfehler beim Zeichnen: ${fehler.join(' | ')}`).toEqual([]);
});

test('Die Anzeige meldet Aufstellen, Feuern und Ablaufen', async ({ page }) => {
  /*
   * Ein Geschütz, das niemand bemerkt, ist keines. Die Meldungen laufen über
   * dasselbe Protokoll wie alle anderen Ereignisse.
   */
  /*
   * Zwei Dinge werden getrennt geprüft, weil sie getrennt kaputtgehen können:
   *
   *  1. Die EREIGNISSE des Motors (gezählt, nicht im Protokoll gesucht).
   *  2. Dass die ANZEIGE auf sie reagiert.
   *
   * (2) wird direkt nach dem Aufstellen geprüft und nicht nach sechs Runden: Das
   * Protokoll führt nur eine begrenzte Zahl Zeilen, und die werden von
   * „Px ist gelandet" überschwemmt — gemessen stand nach sechs Runden keine
   * einzige Geschützmeldung mehr darin. Die Meldung ist aber da, wenn sie
   * erscheint; deshalb wird sie sofort gelesen.
   */
  const start = await starteMitGeschuetz(page);
  const direktNachAufstellen = await page.locator('#log-list').textContent();
  expect(direktNachAufstellen, 'Die Anzeige meldet das Aufstellen nicht').toMatch(/Geschütz aufgestellt/);

  const stand = await bisRunde(page, 6);
  expect(stand.runde, 'Der Test erreichte die nötigen Runden nicht').toBeGreaterThan(3);

  /*
   * Zwei Quellen für die Zählung: Das Aufstellen geschah im Helfer (vor der
   * Rundenschleife), das Feuern und Ablaufen währenddessen. `lastEvents` hält nur
   * die Ereignisse des ZULETZT gegangenen Takts — wer nur die Schleife zählt,
   * verpasst das Aufstellen.
   */
  const zahl = typ => Number((stand.ereignisse.find(e => e.startsWith(`${typ}:`)) ?? 'x:0').split(':')[1] ?? 0);
  const aufstellen = start.eigeneEreignisse.filter(t => t === 'turret_deployed').length;
  expect(aufstellen, 'Kein turret_deployed-Ereignis').toBe(1);
  expect(zahl('turret_fired'), 'Das Geschütz hat nie gefeuert').toBeGreaterThan(0);
  expect(zahl('turret_expired'), 'Kein turret_expired-Ereignis').toBe(1);
});

test('Nach dem Ablaufen ist kein Geschütz mehr im Zustand', async ({ page }) => {
  await starteMitGeschuetz(page);
  const stand = await bisRunde(page, 8);

  expect(stand.runde, 'Testaufbau erreichte die nötigen Runden nicht').toBeGreaterThan(3);
  expect(stand.turrets.length, 'Ein Geschütz blieb über seine Laufzeit hinaus stehen').toBe(0);
});

test('Zwei Schüsse in einem Zug sind auch über die Anzeige nicht möglich', async ({ page }) => {
  /*
   * Der Exploit aus dem Motortest, hier über den Weg, den ein Client nimmt.
   * `fire()` ist die einzige Tür zum Schießen.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open' });
    api.setAutoLoop(false);
  });

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    const erster = api.fire(0.5, 60);
    const zweiter = api.fire(0.6, 60);
    return { erster: erster.ok, zweiter: zweiter.ok, fehler: zweiter.errors ?? [] };
  });

  expect(stand.erster).toBe(true);
  expect(stand.zweiter, 'Ein zweiter Schuss im selben Zug wurde angenommen').toBe(false);
  expect(stand.fehler.join(' ')).toMatch(/bereits geschossen/i);
});
