import { test, expect } from '@playwright/test';

/**
 * E2E-Prüfung der Spezialeffekte im Browser.
 *
 * Die Unit-Tests belegen die Wirkung im Simulationskern. Hier wird geprüft, dass
 * sie auch im echten Spiel ankommen: Effekt sichtbar im Protokoll, Zustand als
 * Marke in der Spielerliste, und die Simulation bleibt danach lauffähig.
 */

/** Startet ein lokales Match ohne laufende Render-Schleife. */
async function boot(page, { seed = 20260910 } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(options => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch(options);
    window.__PA__.setAutoLoop(false);
  }, { seed, teams: 2, playersPerTeam: 1 });
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

/**
 * Findet im Katalog eine Waffe mit der gesuchten Wirkungsart.
 * Geht über die Debug-API: ein dynamischer Modulimport scheitert im Browser an
 * der Pfadauflösung.
 */
async function weaponWithEffect(page, kind) {
  return page.evaluate(effectKind => {
    const treffer = window.__PA__.findWeaponByEffect(effectKind);
    return treffer ? { id: treffer.id, name: treffer.displayName, special: treffer.special } : null;
  }, kind);
}

test('Heilung wirkt und erscheint im Protokoll', async ({ page }) => {
  await boot(page);

  const heilwaffe = await weaponWithEffect(page, 'heal');
  expect(heilwaffe, 'Es muss eine Heilwaffe im Katalog geben').not.toBeNull();

  const ergebnis = await page.evaluate(async ({ weaponId }) => {
    const match = window.__PA__.getMatch();
    const aktiver = match.activePlayerId;
    // Gesundheit senken, damit Heilung sichtbar wird.
    match.world.setComponent(aktiver, 'Health', 'current', 30);
    match.inventory.register(aktiver, [weaponId]);
    match.inventory.selectWeapon(aktiver, weaponId);

    const vorher = match.world.getComponent(aktiver, 'Health', 'current');
    const schuss = window.__PA__.fire(0, 50);
    const nachher = match.world.getComponent(aktiver, 'Health', 'current');
    // Ein Schritt, damit die Ereignisse das HUD erreichen: das Protokoll wird
    // im Simulationsschritt befüllt, nicht beim Feuern.
    window.__PA__.advance(1);
    return { ok: schuss.ok, vorher, nachher, special: schuss.special ?? null };
  }, { weaponId: heilwaffe.id });

  expect(ergebnis.ok).toBe(true);
  expect(ergebnis.nachher).toBeGreaterThan(ergebnis.vorher);

  // Die Meldung muss im sichtbaren Protokoll stehen.
  await expect(page.locator('#log-list')).toContainText('heilt');
});

test('Schild erscheint als Marke in der Spielerliste', async ({ page }) => {
  await boot(page, { seed: 4711 });

  const schildwaffe = await weaponWithEffect(page, 'shield');
  expect(schildwaffe, 'Es muss eine Schildwaffe geben').not.toBeNull();

  const zustand = await page.evaluate(async ({ weaponId }) => {
    const match = window.__PA__.getMatch();
    const aktiver = match.activePlayerId;
    match.inventory.register(aktiver, [weaponId]);
    window.__PA__.fire(0, 50);
    // Ein Simulationsschritt, damit die Anzeige den Zustand übernimmt.
    window.__PA__.advance(1);
    const status = window.__PA__.getState().statuses?.[aktiver];
    return { shield: status?.shield ?? 0, entityId: aktiver };
  }, { weaponId: schildwaffe.id });

  expect(zustand.shield).toBeGreaterThan(0);

  // Die Marke muss in der Spielerliste auftauchen, mit erklärendem Titel.
  const marke = page.locator(`.roster-item[data-entity-id="${zustand.entityId}"] .status-badge`);
  await expect(marke.first()).toBeVisible();
  await expect(marke.first()).toContainText('🛡');
  await expect(marke.first()).toHaveAttribute('title', /Schild/);
});

test('Einfrieren lässt einen Zug aussetzen und wird gemeldet', async ({ page }) => {
  await boot(page, { seed: 909 });

  const ergebnis = await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const aktiver = match.activePlayerId;
    match.statuses.freeze(aktiver, 1);

    // Zwei Züge weiter: der eingefrorene Spieler setzt aus.
    const gesehen = [];
    for (let i = 0; i < 3; i++) {
      match.endTurn();
      for (const event of match.consumeEvents()) {
        if (event.type === 'turn_skipped' || event.type === 'frozen') {
          gesehen.push(event.type);
        }
      }
    }
    return { gesehen, eingefroren: match.statuses.isFrozen(aktiver), tick: match.world.tickCount };
  });

  expect(ergebnis.gesehen).toContain('turn_skipped');
  expect(ergebnis.eingefroren).toBe(false);
});

test('Schaden über Zeit wirkt bei jedem Zugbeginn', async ({ page }) => {
  await boot(page, { seed: 31415 });

  const verlauf = await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const aktiver = match.activePlayerId;
    match.world.setComponent(aktiver, 'Health', 'current', 300);
    match.world.setComponent(aktiver, 'Health', 'max', 300);
    match.statuses.addDot(aktiver, { damagePerTurn: 15, turns: 3, element: 'fire' });

    const werte = [match.world.getComponent(aktiver, 'Health', 'current')];
    // Zwei volle Runden, damit der Spieler zweimal am Zug ist.
    for (let i = 0; i < 2; i++) {
      match.endTurn();
      match.endTurn();
      werte.push(match.world.getComponent(aktiver, 'Health', 'current'));
    }
    return werte;
  });

  expect(verlauf[1]).toBeLessThan(verlauf[0]);
  expect(verlauf[2]).toBeLessThan(verlauf[1]);
  expect(Math.round(verlauf[0] - verlauf[1])).toBe(15);
});

test('Selbstwirkende Waffe erzeugt kein Projektil und beendet den Zug', async ({ page }) => {
  await boot(page, { seed: 6060 });

  const nachschub = await weaponWithEffect(page, 'ammo');
  expect(nachschub).not.toBeNull();

  const ergebnis = await page.evaluate(({ weaponId }) => {
    const match = window.__PA__.getMatch();
    const aktiver = match.activePlayerId;

    // Eine Verbrauchswaffe suchen, die NICHT unbegrenzt ist — sonst liefe das
    // Leerlaufen unten nie zu Ende.
    const zielwaffe = window.__PA__.weapons().find(w =>
      w.id !== weaponId && w.maxAmmo > 1 && w.damage > 0 && w.id !== match.inventory.getActiveWeaponId(aktiver));
    match.inventory.register(aktiver, [zielwaffe.id, weaponId]);

    // Munition kontrolliert auf 0 setzen (begrenzte Schleife).
    let leerverbraucht = 0;
    while (leerverbraucht < 500 && match.inventory.getAmmo(aktiver, zielwaffe.id) > 0) {
      match.inventory.consume(aktiver, zielwaffe.id, 1);
      leerverbraucht += 1;
    }
    const munitionVorher = match.inventory.getAmmo(aktiver, zielwaffe.id);

    const zugVorher = match.activePlayerId;
    match.inventory.selectWeapon(aktiver, weaponId);
    const schuss = match.fire(aktiver, 0, 50, weaponId);
    window.__PA__.advance(1);

    return {
      ok: schuss.ok,
      fehler: schuss.errors ?? [],
      projektile: match.activeProjectileCount,
      zugVorher,
      zugNachher: match.activePlayerId,
      munitionVorher,
      munition: match.inventory.getAmmo(aktiver, zielwaffe.id),
    };
  }, { weaponId: nachschub.id });

  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.ok).toBe(true);
  expect(ergebnis.projektile).toBe(0);
  expect(ergebnis.munition).toBeGreaterThan(ergebnis.munitionVorher ?? 0);
  expect(ergebnis.zugNachher).not.toBe(ergebnis.zugVorher);
});

test('Das Match bleibt nach allen Effekten lauffähig', async ({ page }) => {
  await boot(page, { seed: 12321 });

  // Alle Wirkungsarten nacheinander auslösen und danach bis zum Spielende
  // simulieren: ein Effekt, der den Zustand beschädigt, fiele hier auf.
  //
  // Wichtig: Nach jedem Effekt ist ein ANDERER Spieler am Zug. Der Test liest
  // den aktiven Spieler deshalb in jeder Runde neu — sonst laufen alle Versuche
  // nach dem ersten ins "nicht am Zug" und der Befund wäre wertlos.
  const ergebnis = await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const arten = ['heal', 'shield', 'damage_boost', 'armor', 'ammo', 'move', 'freeze', 'damage_over_time'];
    const ausgeloest = [];

    for (const art of arten) {
      if (match.status !== 'playing') break;
      const waffe = window.__PA__.findWeaponByEffect(art);
      if (!waffe) continue;

      const aktiver = match.activePlayerId;
      if (aktiver === null) break;

      match.inventory.register(aktiver, [waffe.id]);
      match.inventory.selectWeapon(aktiver, waffe.id);
      const schuss = match.fire(aktiver, 0, 60, waffe.id);
      ausgeloest.push({ art, ok: schuss.ok, fehler: schuss.errors ?? [] });

      // Zug auslaufen lassen (begrenzt).
      let guard = 0;
      while (match.activePlayerId === aktiver && match.status === 'playing' && guard < 500) {
        match.step();
        match.consumeEvents();
        guard += 1;
      }
    }

    // Bis zum Spielende simulieren.
    let guard = 0;
    while (match.status === 'playing' && guard < 60_000) {
      match.step();
      match.consumeEvents();
      guard += 1;
    }

    return {
      ausgeloest,
      status: match.status,
      runde: match.round,
      hash: match.stateHash(),
      fehlerhaft: ausgeloest.filter(e => !e.ok),
    };
  });

  expect(ergebnis.ausgeloest.length).toBeGreaterThanOrEqual(6);
  expect(ergebnis.fehlerhaft).toEqual([]);
  expect(ergebnis.status).toBe('gameover', 'Das Match muss sauber enden');
  expect(ergebnis.hash).toMatch(/^[0-9a-f]+$/);
  expect(ergebnis.runde).toBeGreaterThan(1);
});

test('Determinismus bleibt mit Effekten erhalten', async ({ page }) => {
  // Zwei Läufe mit gleichem Seed müssen denselben Hash ergeben — auch wenn
  // Effekte im Spiel sind. Der Zufall der Zufallswaffe darf daran nichts ändern.
  await boot(page, { seed: 777 });

  const hashes = await page.evaluate(() => {
    const ergebnisse = [];

    for (let lauf = 0; lauf < 2; lauf++) {
      window.__PA__.setAutoLoop(false);
      window.__PA__.startMatch({ seed: 777, teams: 2, playersPerTeam: 1 });
      window.__PA__.setAutoLoop(false);

      const match = window.__PA__.getMatch();

      // Wirkungswaffen einsetzen, inklusive der Zufallswaffe. Nach jedem Effekt
      // ist ein anderer Spieler am Zug, deshalb wird der aktive Spieler neu
      // gelesen.
      const waffen = ['pa_100', 'pa_093', 'pa_094', 'pa_119']
        .filter(id => window.__PA__.getWeapon(id));

      for (const id of waffen) {
        if (match.status !== 'playing') break;
        const aktiver = match.activePlayerId;
        if (aktiver === null) break;
        match.inventory.register(aktiver, [id]);
        match.inventory.selectWeapon(aktiver, id);
        match.fire(aktiver, 0, 60, id);
        let guard = 0;
        while (match.activePlayerId === aktiver && match.status === 'playing' && guard < 500) {
          match.step();
          match.consumeEvents();
          guard += 1;
        }
      }

      let guard = 0;
      while (match.status === 'playing' && guard < 40_000) {
        match.step();
        match.consumeEvents();
        guard += 1;
      }
      ergebnisse.push({ hash: match.stateHash(), ticks: match.world.tickCount });
    }
    return ergebnisse;
  });

  expect(hashes[0].hash).toBe(hashes[1].hash);
  expect(hashes[0].ticks).toBe(hashes[1].ticks);
});
