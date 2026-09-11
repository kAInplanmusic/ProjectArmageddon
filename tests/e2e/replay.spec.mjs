import { test, expect } from '@playwright/test';
import { MatchController } from '../../src/engine/match.js';
import { ReplayRecorder } from '../../src/engine/replay.js';

/**
 * Replay-Wiedergabe im Browser.
 *
 * Aufzeichnungen entstehen im Betrieb mit `npm run replay -- record`. Hier wird
 * eine im Test erzeugt (die Engine läuft auch in Node) und über die Debug-API in
 * die Seite gegeben — kein Datei-Upload nötig, und der Test bleibt unabhängig von
 * mitgelieferten Artefakten.
 *
 * Der wichtigste Test dieser Datei ist der Hash-Vergleich: Nach vollständiger
 * Wiedergabe muss der Zustandshash dem der Aufzeichnung entsprechen. Ohne ihn
 * könnte die Anzeige ein hübsches, aber falsches Match zeigen — und die Aussage
 * „Replay wiedergeben" wäre eine leere Behauptung.
 */

/** Zeichnet ein kurzes Match auf und gibt Dokument und Endhash zurück. */
function aufzeichnen() {
  const match = new MatchController({ seed: 8888, teams: 2, playersPerTeam: 1, turnDurationMs: 600, maxRounds: 3 });
  match.start();
  const recorder = new ReplayRecorder({
    seed: 8888, teams: 2, playersPerTeam: 1, preset: 'hills',
    maxRounds: match.maxRounds, turnDurationMs: match.turnDurationMs,
  });

  let schuesse = 0;
  let schutz = 0;
  while (match.status === 'playing' && schutz < 12_000) {
    const state = match.getState();
    if (state.activePlayerId !== null && state.turnElapsedMs < 20) {
      const angle = Math.PI / 4 + (schuesse % 6) * 0.06;
      const power = 58 + (schuesse % 5) * 8;
      if (match.fire(state.activePlayerId, angle, power).ok) {
        recorder.recordInput({ tick: match.world.tickCount, playerId: state.activePlayerId, angle, power });
        schuesse += 1;
      }
    }
    match.step();
    match.consumeEvents();
    schutz += 1;
  }
  recorder.finalize(match.world.tickCount);

  return {
    dokument: JSON.parse(JSON.stringify(recorder)),
    endHash: match.stateHash(),
    totalTicks: match.world.tickCount,
    schuesse,
  };
}

/** Lädt eine Aufzeichnung in die Seite. */
async function replayLaden(page, dokument) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  const geladen = await page.evaluate(dok => window.__PA__.loadReplay(dok), dokument);
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return geladen;
}

test('Eine Aufzeichnung lässt sich laden und Schritt für Schritt ansehen', async ({ page }) => {
  const { dokument, totalTicks } = aufzeichnen();
  expect(await replayLaden(page, dokument)).toBe(true);

  const zustand = await page.evaluate(() => window.__PA__.replay());
  expect(zustand).toBeTruthy();
  expect(zustand.totalTicks).toBe(totalTicks);
  expect(zustand.tick).toBe(0);
  expect(zustand.playing).toBe(false);
  expect(zustand.finished).toBe(false);

  // Ein einzelner Schritt bewegt die Wiedergabe um genau einen Takt.
  await page.evaluate(() => window.__PA__.replayAction('step', 1));
  expect((await page.evaluate(() => window.__PA__.replay())).tick).toBe(1);

  // Und mehrere Schritte entsprechend weiter.
  await page.evaluate(() => window.__PA__.replayAction('step', 30));
  expect((await page.evaluate(() => window.__PA__.replay())).tick).toBe(31);
});

test('Der Spielzustand im Browser entspricht der Aufzeichnung', async ({ page }) => {
  /*
   * Der entscheidende Test. Wird hier ein anderer Hash erreicht als beim
   * Aufzeichnen, zeigt die Anzeige ein anderes Match als `replay --verify`
   * prüft — die Wiedergabe wäre dann wertlos.
   */
  const { dokument, endHash, totalTicks } = aufzeichnen();
  await replayLaden(page, dokument);

  const ergebnis = await page.evaluate(async () => {
    const api = window.__PA__;
    // Bis ans Ende spulen (in einem Zug — die Wiedergabe rechnet neu).
    api.replaySeek(api.replay().totalTicks);
    return {
      tick: api.replay().tick,
      hash: api.getMatch().stateHash(),
      status: api.getState().status,
    };
  });

  expect(ergebnis.tick).toBe(totalTicks);
  expect(ergebnis.hash).toBe(endHash);
});

test('Springen ist deterministisch — auch rückwärts', async ({ page }) => {
  const { dokument } = aufzeichnen();
  await replayLaden(page, dokument);

  const ziel = 120;
  const vorwaerts = await page.evaluate(t => {
    const api = window.__PA__;
    api.replaySeek(0);
    api.replaySeek(t);
    return { tick: api.replay().tick, hash: api.getMatch().stateHash() };
  }, ziel);

  // Erst über das Ziel hinaus, dann zurück.
  const rueckwaerts = await page.evaluate(t => {
    const api = window.__PA__;
    api.replaySeek(api.replay().totalTicks);
    api.replaySeek(t);
    return { tick: api.replay().tick, hash: api.getMatch().stateHash() };
  }, ziel);

  expect(vorwaerts.tick).toBe(ziel);
  expect(rueckwaerts.tick).toBe(ziel);
  expect(rueckwaerts.hash).toBe(vorwaerts.hash);
});

test('Abspielen, Pause und Neustart steuern die Wiedergabe', async ({ page }) => {
  const { dokument } = aufzeichnen();
  await replayLaden(page, dokument);

  // Abspielen: Der Tick muss steigen, ohne dass wir Schritte auslösen.
  await page.evaluate(() => window.__PA__.replayAction('play'));
  await expect.poll(async () => page.evaluate(() => window.__PA__.replay().tick), {
    timeout: 5000,
  }).toBeGreaterThan(5);

  // Pause: Der Tick bleibt stehen.
  await page.evaluate(() => window.__PA__.replayAction('pause'));
  const beiPause = await page.evaluate(() => window.__PA__.replay().tick);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__PA__.replay().tick)).toBe(beiPause);

  // Neustart: zurück an den Anfang.
  await page.evaluate(() => window.__PA__.replayAction('restart'));
  expect(await page.evaluate(() => window.__PA__.replay().tick)).toBe(0);
});

test('Die Wiedergabe endet und dann passiert nichts mehr', async ({ page }) => {
  const { dokument, totalTicks } = aufzeichnen();
  await replayLaden(page, dokument);

  await page.evaluate(() => window.__PA__.replayAction('play'));
  await expect.poll(async () => page.evaluate(() => window.__PA__.replay().finished), {
    timeout: 30_000,
  }).toBe(true);

  const amEnde = await page.evaluate(() => window.__PA__.replay().tick);
  expect(amEnde).toBe(totalTicks);

  // Ein weiterer Schritt tut nichts und wirft nicht.
  await page.evaluate(() => window.__PA__.replayAction('step', 5));
  expect(await page.evaluate(() => window.__PA__.replay().tick)).toBe(amEnde);
});

test('Im Replay kann nicht gespielt werden', async ({ page }) => {
  /*
   * Fund-Absicherung: Ohne Sperre würde ein Tastendruck die nachgespielte
   * Rechnung verändern — der Zustand wäre danach weder das Replay noch ein
   * eigenes Match.
   */
  const { dokument } = aufzeichnen();
  await replayLaden(page, dokument);
  await page.evaluate(() => window.__PA__.replayAction('step', 60));

  const vorher = await page.evaluate(() => ({
    tick: window.__PA__.replay().tick,
    hash: window.__PA__.getMatch().stateHash(),
  }));

  // Feuern über die Tastatur versuchen.
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);

  const nachher = await page.evaluate(() => ({
    tick: window.__PA__.replay().tick,
    hash: window.__PA__.getMatch().stateHash(),
    modus: window.__PA__.getMode(),
  }));

  expect(nachher.modus).toBe('replay');
  expect(nachher.hash).toBe(vorher.hash);
  expect(nachher.tick).toBe(vorher.tick);
});

test('Die Aufzeichnung ist klein — sie enthält nur Eingaben', async ({ page }) => {
  /*
   * Der Grund, warum eine Aufzeichnung wenige Kilobyte groß ist und jede Stelle
   * angesprungen werden kann: Sie enthält Seed und Schüsse, nicht den Verlauf.
   */
  const { dokument, totalTicks } = aufzeichnen();
  const groesse = JSON.stringify(dokument).length;

  expect(dokument.entries.length).toBeLessThan(40);
  expect(groesse).toBeLessThan(20_000);
  // Trotzdem steckt eine vollständige Partie darin.
  expect(totalTicks).toBeGreaterThan(100);

  await replayLaden(page, dokument);
  expect((await page.evaluate(() => window.__PA__.replay())).totalTicks).toBe(totalTicks);
});
