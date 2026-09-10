import { test, expect } from '@playwright/test';

/**
 * E2E-Smoke-Suite für Project Armageddon.
 *
 * Die Tests prüfen echtes Produktverhalten im Browser: Menü, Matchstart,
 * Rendering, HUD-Aktualisierung, Schussabgabe, Zugwechsel und Spielende.
 * Für deterministische Prüfungen wird die automatische Schleife pausiert und
 * gezielt vorgespult.
 */

async function bootMatch(page, { seed = 20260910, teams = 2, players = 2, preset = 'hills' } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  // WICHTIG: Die automatische Schleife VOR dem Start abschalten. Sonst läuft
  // zwischen startMatch() und einem nachgelagerten setAutoLoop(false) eine
  // unbekannte Anzahl Ticks und Determinismus-Tests werden flaky.
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.evaluate(
    options => window.__PA__.startMatch(options),
    { seed, teams, playersPerTeam: players, preset },
  );
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return errors;
}

test('Startseite lädt Canvas, HUD und Menü', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));

  await page.goto('/');

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#menu-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Match starten' })).toBeVisible();
  await expect(page.locator('#hud-round')).toHaveText('1');

  const canvasSize = await page.locator('#game-canvas').evaluate(canvas => ({
    width: canvas.width,
    height: canvas.height,
  }));
  expect(canvasSize).toEqual({ width: 1280, height: 720 });
  expect(errors).toEqual([]);
});

test('Matchstart erzeugt Spieler, Terrain und Kisten', async ({ page }) => {
  const errors = await bootMatch(page, { seed: 4242, teams: 2, players: 2 });

  const state = await page.evaluate(() => window.__PA__.getState());

  expect(state.status).toBe('playing');
  expect(state.round).toBe(1);
  expect(state.entities).toHaveLength(4);
  expect(state.entities.every(entity => entity.alive)).toBe(true);
  expect(state.entities.every(entity => entity.health > 0)).toBe(true);
  // Teams wechseln sich ab: Team 0 und Team 1 müssen beide vertreten sein.
  expect(new Set(state.entities.map(e => e.teamId)).size).toBe(2);
  expect(state.terrainWidth).toBe(1280);
  expect(state.terrainHeight).toBe(720);
  expect(errors).toEqual([]);
});

test('HUD zeigt Runde, Spielerliste und Waffen des aktiven Spielers', async ({ page }) => {
  await bootMatch(page, { seed: 99 });

  await expect(page.locator('#hud-round')).toHaveText('1');
  await expect(page.locator('#hud-status')).toHaveText('Läuft');
  await expect(page.locator('#roster .roster-item')).toHaveCount(4);

  const activeItems = page.locator('#roster .roster-item.is-active');
  await expect(activeItems).toHaveCount(1);

  await expect(page.locator('#weapon-list .weapon-item').first()).toBeVisible();
  const weaponCount = await page.locator('#weapon-list .weapon-item').count();
  expect(weaponCount).toBeGreaterThan(0);

  await expect(page.locator('#hud-active')).toContainText('am Zug');
});

test('Zielvorschau liefert eine ballistische Flugbahn', async ({ page }) => {
  await bootMatch(page, { seed: 7 });

  const preview = await page.evaluate(() => window.__PA__.aimPreview(Math.PI / 4, 70));

  expect(Array.isArray(preview)).toBe(true);
  expect(preview.length).toBeGreaterThan(4);
  // Die Bahn muss sich tatsächlich bewegen und in y steigen (Schuss nach oben).
  expect(preview[1].x).not.toBeCloseTo(preview[0].x, 3);
  const minY = Math.min(...preview.map(point => point.y));
  expect(minY).toBeLessThan(preview[0].y);
});

test('Schuss erzeugt ein Projektil und beendet den Zug', async ({ page }) => {
  await bootMatch(page, { seed: 31337 });

  const before = await page.evaluate(() => window.__PA__.getState());
  const result = await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 80));
  expect(result.ok).toBe(true);
  expect(result.projectileId).not.toBeNull();

  const withProjectile = await page.evaluate(() => window.__PA__.getState());
  expect(withProjectile.projectiles.length).toBeGreaterThan(0);

  await page.evaluate(() => window.__PA__.advance(240));

  const after = await page.evaluate(() => window.__PA__.getState());
  expect(after.activePlayerId).not.toBe(before.activePlayerId);
});

test('Match läuft deterministisch bis zum Spielende', async ({ page }) => {
  await bootMatch(page, { seed: 5150 });

  const finalState = await page.evaluate(() => {
    const api = window.__PA__;
    let guard = 0;
    while (api.getState().status === 'playing' && guard < 4000) {
      const state = api.getState();
      if (state.turnElapsedMs < 20) {
        api.fire(Math.PI / 4, 60 + (guard % 30));
      }
      api.advance(1);
      guard++;
    }
    return api.getState();
  });

  expect(finalState.status).toBe('gameover');
  expect(finalState.winnerTeamId).not.toBeNull();
  await expect(page.locator('#end-overlay')).toBeVisible();
  await expect(page.locator('#winner-text')).toContainText('gewinnt');
});

test('Gleicher Seed erzeugt identischen Matchzustand', async ({ page }) => {
  const first = await (async () => {
    await bootMatch(page, { seed: 8675309 });
    return page.evaluate(() => {
      window.__PA__.advance(180);
      return window.__PA__.stateHash();
    });
  })();

  const second = await (async () => {
    await bootMatch(page, { seed: 8675309 });
    return page.evaluate(() => {
      window.__PA__.advance(180);
      return window.__PA__.stateHash();
    });
  })();

  expect(second).toBe(first);
});

test('Unterschiedliche Seeds erzeugen unterschiedliche Matches', async ({ page }) => {
  await bootMatch(page, { seed: 111 });
  const first = await page.evaluate(() => {
    window.__PA__.advance(60);
    return window.__PA__.stateHash();
  });

  await bootMatch(page, { seed: 222 });
  const second = await page.evaluate(() => {
    window.__PA__.advance(60);
    return window.__PA__.stateHash();
  });

  expect(second).not.toBe(first);
});

test('Terrain wird durch Einschläge zerstört', async ({ page }) => {
  await bootMatch(page, { seed: 2024 });

  const cratered = await page.evaluate(async () => {
    const api = window.__PA__;
    const match = api.getMatch();
    const before = match.terrain.isDirty;
    // Direkter Treffer unter dem aktiven Spieler erzwingt einen Krater.
    const state = api.getState();
    const active = state.entities.find(e => e.entityId === state.activePlayerId);
    api.fire(Math.PI / 2, 100);
    api.advance(120);
    return {
      before,
      after: match.terrain.isDirty,
      solidBefore: match.terrain.isSolid(Math.floor(active.x), Math.floor(active.y) + 30),
    };
  });

  expect(cratered.after).toBe(true);
});
