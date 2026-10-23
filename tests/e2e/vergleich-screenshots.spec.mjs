import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MatchController } from '../../src/engine/match.js';
import { ReplayRecorder } from '../../src/engine/replay.js';

/**
 * Screenshot-Sweep fuer den Vergleich mit Alternativspielen.
 *
 * ## Zweck
 *
 * Die Spezifikation erzeugt fuer JEDEN sichtbaren Bereich des Spiels einen
 * Screenshot (Menue, Kader, Hilfe, Klassen, Sidegrades, Erfolge, Profil,
 * Replay, Lobbys, Spielansicht in allen Gelaendeformen, Kulissenbild,
 * Hochformat, grosse Teams, Zielvorschau, Schuss/Krater, Wasser, Mahlstrom,
 * Guenther-Rad, Replay-Wiedergabe, Spielende).
 *
 * Die Bilder landen in `docs/vergleich-alternativspiele-2026-10-19/eigene/`
 * und sind die Grundlage des Vergleichsdokuments. Zusaetzlich sichert jeder
 * Test eine Mindestzusage ab (Seite laedt, Menue oeffnet/schliesst sich, HUD
 * steht, keine Seitenfehler) — ein Bereich, der sich nicht mehr zeichnen
 * laesst, bricht den Lauf.
 *
 * ## Warum nicht `artifacts/`
 *
 * `artifacts/` ist gitignored (generierte Verifikationsartefakte). Die
 * Vergleichsbilder gehoeren zum Dossier und muessen mit der Doku mitwandern.
 */

const OUT_DIR = fileURLToPath(
  new URL('../../docs/vergleich-alternativspiele-2026-10-19/eigene/', import.meta.url),
);
mkdirSync(OUT_DIR, { recursive: true });

/** Seite laden, Debug-API abwarten, Auto-Loop anhalten. */
async function oeffne(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
}

/** Lokales Match starten, kurz zeichnen lassen, dann anhalten. */
async function starteMatch(page, optionen, { warte = 450 } = {}) {
  await page.evaluate((o) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch(o);
  }, optionen);
  await expect(page.locator('#menu-overlay'), 'Menue blieb offen').toBeHidden();
  await page.evaluate(() => window.__PA__.setAutoLoop(true));
  await page.waitForTimeout(warte);
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
}

/** Screenshot nach `docs/vergleich-alternativspiele-2026-10-19/eigene/<name>.png`. */
async function aufnahme(page, name) {
  await page.screenshot({ path: `${OUT_DIR}${name}.png` });
}

/** Seitenfehler je Test einsammeln und am Ende pruefen. */
function fehlerSammeln(page) {
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));
  return fehler;
}

/** Zeichnet ein kurzes Match auf (fuer Replay-Screenshots). */
function aufzeichnen() {
  const match = new MatchController({
    seed: 8888, teams: 2, playersPerTeam: 1, turnDurationMs: 600, maxRounds: 3,
  });
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
        recorder.recordInput({
          tick: match.world.tickCount, playerId: state.activePlayerId, angle, power,
        });
        schuesse += 1;
      }
    }
    match.step();
    match.consumeEvents();
    schutz += 1;
  }
  recorder.finalize(match.world.tickCount);
  return JSON.parse(JSON.stringify(recorder));
}

test.describe('Menue-Bereiche', () => {
  test('Hauptmenue', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await expect(page.locator('#menu-overlay')).toBeVisible();
    await expect(page.locator('#menu-overlay h1')).toContainText('Armageddon');
    await aufnahme(page, '01-menue-hauptmenue');

    expect(fehler).toEqual([]);
  });

  test('Kader (Roster)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#roster-browser summary').click();
    await expect(page.locator('#roster-list li').first()).toBeVisible({ timeout: 10_000 });
    // Zweite Fraktion waehlen, damit nicht nur die Vorgabe im Bild steht.
    await page.locator('#roster-tabs button').nth(1).click();
    await aufnahme(page, '02-menue-kader');

    expect(fehler).toEqual([]);
  });

  test('Hilfe', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#hilfe-browser summary').click();
    await expect(page.locator('#hilfe-tabs button').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('#hilfe-tabs button').nth(1).click();
    await aufnahme(page, '03-menue-hilfe');

    expect(fehler).toEqual([]);
  });

  test('Klassen je Platz (Loadouts)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#loadout-auswahl summary').click();
    await expect(page.locator('#loadout-felder select').first()).toBeVisible({ timeout: 10_000 });
    await aufnahme(page, '04-menue-klassen');

    expect(fehler).toEqual([]);
  });

  test('Sidegrades', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#sidegrade-auswahl summary').click();
    await expect(page.locator('#sidegrade-felder select').first()).toBeVisible({ timeout: 10_000 });
    await aufnahme(page, '05-menue-sidegrades');

    expect(fehler).toEqual([]);
  });

  test('Erfolge', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#erfolge-browser summary').click();
    await expect(page.locator('#erfolge-liste').locator('div').first()).toBeVisible({ timeout: 10_000 });
    await aufnahme(page, '06-menue-erfolge');

    expect(fehler).toEqual([]);
  });

  test('Profil', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#profil-browser summary').click();
    await expect(page.locator('#profil-werte')).toContainText('Partien');
    await aufnahme(page, '07-menue-profil');

    expect(fehler).toEqual([]);
  });

  test('Replay-Auswahl', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#replay-browser summary').click();
    await expect(page.locator('#replay-status')).toContainText('Keine Aufzeichnung');
    await aufnahme(page, '08-menue-replay');

    expect(fehler).toEqual([]);
  });

  test('Offene Lobbys', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    await page.locator('#lobby-browser summary').click();
    await page.locator('#lobby-refresh').click();
    await expect(page.locator('#lobby-status')).not.toBeEmpty({ timeout: 10_000 });
    await aufnahme(page, '09-menue-lobbys');

    expect(fehler).toEqual([]);
  });
});

test.describe('Spielansicht', () => {
  test('Grundansicht Huegel', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 3, preset: 'hills' });

    await expect(page.locator('#hud')).toBeVisible();
    await aufnahme(page, '10-spiel-huegel');

    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Gebirge', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 111, teams: 2, playersPerTeam: 3, preset: 'mountains' });
    await aufnahme(page, '11-spiel-gebirge');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Inseln', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 777, teams: 2, playersPerTeam: 3, preset: 'islands' });
    await aufnahme(page, '12-spiel-inseln');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Hoehlen', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 313, teams: 2, playersPerTeam: 3, preset: 'caverns' });
    await aufnahme(page, '13-spiel-hoehlen');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Offene Ebene', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 500, teams: 2, playersPerTeam: 3, preset: 'open' });
    await aufnahme(page, '14-spiel-ebene');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Tuerme', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 900, teams: 2, playersPerTeam: 3, preset: 'spires' });
    await aufnahme(page, '15-spiel-tuerme');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Flut', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 3, preset: 'flooded' });
    await aufnahme(page, '16-spiel-flut');
    expect(fehler).toEqual([]);
  });

  test('Gelaendeform Warren', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 6000, teams: 2, playersPerTeam: 3, preset: 'warren' });
    await aufnahme(page, '17-spiel-warren');
    expect(fehler).toEqual([]);
  });

  test('Bildkulisse (gewaehlt)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await page.evaluate(() => {
      const api = window.__PA__;
      api.setAutoLoop(false);
      api.startMatch({
        seed: 5, teams: 2, playersPerTeam: 2, preset: 'mountains',
        backdropKey: 'cosmos/black_hole',
      });
    });
    await page.waitForFunction(
      () => window.__PA__.game.renderer.backdropReady === true,
      null,
      { timeout: 15_000 },
    );
    await page.evaluate(() => window.__PA__.setAutoLoop(true));
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await aufnahme(page, '18-spiel-bildkulisse');
    expect(fehler).toEqual([]);
  });

  test('Hochformat', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, {
      seed: 4242, teams: 2, playersPerTeam: 3, preset: 'hills', orientation: 'portrait',
    });
    await aufnahme(page, '19-spiel-hochformat');
    expect(fehler).toEqual([]);
  });

  test('Grosse Teams (8 Teams, 5 Figuren)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 1337, teams: 8, playersPerTeam: 5, preset: 'open' }, { warte: 800 });
    await aufnahme(page, '20-spiel-grosse-teams');
    expect(fehler).toEqual([]);
  });

  test('Zielen mit Bahnvorschau', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });

    await page.evaluate(() => {
      const api = window.__PA__;
      const state = api.getState();
      const aktiv = state.entities.find(e => e.entityId === state.activePlayerId);
      const basis = aktiv?.teamId === 0 ? 0 : Math.PI;
      const winkel = basis + (basis === 0 ? 1 : -1) * 0.45;
      api.game.aim = { angle: winkel, power: 75 };
      api.game.renderer.render(api.getState(), {
        aim: api.game.aim,
        aimPreview: api.aimPreview(winkel, 75),
        water: api.game.water,
        blastRadius: 0,
      });
    });
    await aufnahme(page, '21-spiel-zielen');
    expect(fehler).toEqual([]);
  });

  test('Schuss und Krater', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });

    await page.evaluate(() => {
      const api = window.__PA__;
      const state = api.getState();
      const aktiv = state.entities.find(e => e.entityId === state.activePlayerId);
      const basis = aktiv?.teamId === 0 ? 0 : Math.PI;
      const richtung = basis === 0 ? 1 : -1;
      const winkel = basis + richtung * 0.3;
      const kraft = 80;

      // Einschlag vorhersagen, schiessen, fliegen lassen.
      const bahn = api.aimPreview(winkel, kraft);
      const einschlag = bahn.at(-1) ?? null;
      api.fire(winkel, kraft);
      for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);

      // Kamera auf den Einschlag zoomen und ein Bild von Hand zeichnen.
      // Die Render-Schleife wird angehalten, damit das naechste Bild nicht
      // wieder auf den aktiven Spieler schwenkt und die Nahaufnahme ueberschreibt.
      cancelAnimationFrame(api.game.animationHandle);
      if (einschlag) {
        api.game.kamera.setzeZoom(1.8);
        api.game.kamera.zieleAuf(einschlag.x, einschlag.y, true);
      }
      api.game.renderer.render(api.getState(), {
        aim: null,
        water: api.game.water,
        blastRadius: 0,
      });
    });
    await aufnahme(page, '22-spiel-schuss-krater');
    expect(fehler).toEqual([]);
  });

  test('Wasser (Flut + angehobener Pegel)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'flooded' });

    await page.evaluate(() => {
      const api = window.__PA__;
      const state = api.getState();
      const aktiv = state.entities.find(e => e.entityId === state.activePlayerId);
      if (aktiv) {
        // Wasser sichtbar anheben, ohne die Figur zu ertraenken (DROWN_LEVEL 0.72).
        api.setWaterLevelAt(aktiv.x, aktiv.y, 0.6);
        for (let i = 0; i < 6; i += 1) api.advance(1);
      }
    });
    await aufnahme(page, '23-spiel-wasser');
    expect(fehler).toEqual([]);
  });

  test('Mahlstrom (Runde 8+)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });

    const runde = await page.evaluate(() => {
      const api = window.__PA__;
      const match = api.getMatch();
      let schutz = 0;
      while (match.round < 9 && match.status === 'playing' && schutz < 200) {
        match.endTurn();
        schutz += 1;
      }
      return match.round;
    });
    await page.evaluate(() => window.__PA__.setAutoLoop(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await aufnahme(page, '24-spiel-mahlstrom');
    expect(runde).toBeGreaterThanOrEqual(8);
    expect(fehler).toEqual([]);
  });

  test('Guenther-Rad', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);
    await starteMatch(page, { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });

    await page.evaluate(() => {
      window.__PA__.showGuentherWheel({
        outcome: 'gassi',
        label: 'Du gehst mit Guenther Gassi',
        detail: 'Guenther muss dringend raus. Du setzt eine Runde aus.',
      });
    });
    await expect(page.locator('#guenther-wheel')).toBeVisible();
    await aufnahme(page, '25-spiel-guenter-rad');
    expect(fehler).toEqual([]);
  });
});

test.describe('Replay und Ende', () => {
  test('Replay-Wiedergabe', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    const dokument = aufzeichnen();

    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    const geladen = await page.evaluate(dok => window.__PA__.loadReplay(dok), dokument);
    expect(geladen).toBe(true);

    // Zu einem Drittel springen, damit eine laufende Szene im Bild ist.
    await page.evaluate(() => {
      const api = window.__PA__;
      api.replaySeek(Math.round(api.replay().totalTicks * 0.33));
    });
    await aufnahme(page, '26-spiel-replay');
    expect(fehler).toEqual([]);
  });

  test('Spielende (Endbildschirm)', async ({ page }) => {
    const fehler = fehlerSammeln(page);
    await oeffne(page);

    const status = await page.evaluate(async () => {
      const api = window.__PA__;
      api.setAutoLoop(false);
      api.startMatch({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });
      api.setAutoLoop(false);

      const match = api.game.match;
      // Ein paar Schuesse abgeben, damit das Protokoll und die Kennzahlen fuellen.
      const WINKEL = [0.12, 0.2, 0.3];
      for (const w of WINKEL) {
        const zustand = api.getState();
        if (!zustand || zustand.status !== 'playing') break;
        const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
        if (!aktiv) break;
        const basis = aktiv.teamId === 0 ? 0 : Math.PI;
        const richtung = basis === 0 ? 1 : -1;
        api.fire(basis + richtung * w, 70);
        for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
      }

      // Gegner ausschalten, damit das Match entschieden endet.
      const eigener = match.players.find(p => p.teamId === 0).entityId;
      const schaden = match.world.getSystem('damage');
      for (const gegner of match.players.filter(p => p.teamId === 1)) {
        schaden.applyDamage(match.world, gegner.entityId, 10_000, eigener);
      }
      for (let i = 0; i < 400 && api.getState().status === 'playing'; i += 1) api.advance(1);
      return api.getState()?.status;
    });

    await expect(page.locator('#end-overlay')).toBeVisible();
    await aufnahme(page, '27-spiel-ende');
    expect(status).toBe('gameover');
    expect(fehler).toEqual([]);
  });
});
