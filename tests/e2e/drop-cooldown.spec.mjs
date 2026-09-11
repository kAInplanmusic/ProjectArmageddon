import { test, expect } from '@playwright/test';

/**
 * E2E-Prüfung von Abwurfmechanik und Nachladezeit im Browser.
 *
 * Die Unit-Tests belegen die Logik im Simulationskern. Hier wird geprüft, dass
 * beides im echten Spiel sichtbar und bedienbar ist: Abwerfen per Taste, die
 * Kiste am Boden, die Nachladeanzeige in der Waffenliste und der Hinweis, wenn
 * der Vorrat voll ist.
 */

async function boot(page, { seed = 20260911 } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(options => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch(options);
    window.__PA__.setAutoLoop(false);
    window.__PA__.advance(1);
  }, { seed, teams: 2, playersPerTeam: 1 });
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => {
    const bilder = [...document.querySelectorAll('#weapon-list img.weapon-icon')];
    return bilder.length > 0 && bilder.every(b => b.complete && b.naturalWidth > 0);
  }, { timeout: 10_000 });
}

test('Abwerfen per Taste legt eine Kiste ab und entfernt die Waffe', async ({ page }) => {
  await boot(page, { seed: 4242 });

  const vorher = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;
    return {
      anzahl: match.inventory.getWeapons(spieler).length,
      kisten: api.getState().crates.length,
      aktiv: match.inventory.getActiveWeaponId(spieler),
    };
  });
  expect(vorher.anzahl).toBeGreaterThan(1);

  // Q wirft die gerade gewählte Waffe ab.
  await page.locator('#game-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('q');

  await expect(page.locator('#log-list')).toContainText('abgeworfen', { timeout: 10_000 });

  const nachher = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;
    return {
      anzahl: match.inventory.getWeapons(spieler).length,
      kisten: api.getState().crates.length,
      gefuehrt: match.inventory.getWeapons(spieler),
      aktiv: match.inventory.getActiveWeaponId(spieler),
    };
  });

  expect(nachher.anzahl).toBe(vorher.anzahl - 1);
  expect(nachher.gefuehrt).not.toContain(vorher.aktiv);
  expect(nachher.kisten).toBeGreaterThan(vorher.kisten);
  // Die aktive Waffe darf nicht ins Leere zeigen.
  expect(nachher.aktiv).not.toBeNull();
  expect(nachher.gefuehrt).toContain(nachher.aktiv);
});

test('Die abgeworfene Waffe liegt in der Nähe und ist aufhebbar', async ({ page }) => {
  await boot(page, { seed: 313 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    const waffeId = match.inventory.getActiveWeaponId(spieler);
    const px = match.world.getComponent(spieler, 'Position', 'x');
    const py = match.world.getComponent(spieler, 'Position', 'y');

    const abwurf = api.game.dropWeapon(0);
    const kiste = (api.getState().crates ?? []).find(k => k.entityId === abwurf?.crateId);
    return {
      ok: abwurf?.ok,
      waffeId,
      crateId: abwurf?.crateId ?? null,
      abstand: Math.hypot((abwurf?.x ?? 0) - px, (abwurf?.y ?? 0) - py),
      kisteImZustand: Boolean(kiste),
    };
  });

  expect(ergebnis.ok).toBe(true);
  expect(ergebnis.kisteImZustand).toBe(true);
  // Außerhalb des Aufhebe-Radius (18 px), sonst sofortiges Wiederaufheben.
  expect(ergebnis.abstand).toBeGreaterThan(18);
  expect(ergebnis.abstand).toBeLessThan(110);
});

test('Aufheben einer Abwurfkiste stellt den Munitionsvorrat her', async ({ page }) => {
  await boot(page, { seed: 5150 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    // Eine abwerfbare Waffe mit begrenzter Munition wählen.
    const waffeId = match.inventory.getWeapons(spieler)
      .find(id => Number.isFinite(match.inventory.getAmmo(spieler, id)));
    if (!waffeId) return { uebersprungen: true };

    while (match.inventory.getAmmo(spieler, waffeId) > 2) {
      match.inventory.consume(spieler, waffeId, 1);
    }
    const vorher = match.inventory.getAmmo(spieler, waffeId);
    const abwurf = match.dropWeapon(spieler, waffeId);
    const kisteMunition = match.world.getComponent(abwurf.crateId, 'Crate', 'ammo');

    // Die Kiste an den FUSS des Spielers legen und einen Schritt simulieren.
    // Bewusst so herum: den Spieler zur Kiste zu versetzen kämpft gegen die
    // Physik, die ihn im selben Schritt wieder auf den Boden setzt — die
    // Aufnahme käme dann nie zustande, obwohl sie im Spiel funktioniert.
    const px = match.world.getComponent(spieler, 'Position', 'x');
    const py = match.world.getComponent(spieler, 'Position', 'y');
    match.world.setComponent(abwurf.crateId, 'Position', 'x', px);
    match.world.setComponent(abwurf.crateId, 'Position', 'y', py);
    match.world.setComponent(abwurf.crateId, 'Crate', 'crateX', px);
    match.world.setComponent(abwurf.crateId, 'Crate', 'crateY', py);
    match.step();

    return {
      uebersprungen: false,
      vorher,
      kisteMunition,
      nachher: match.inventory.getAmmo(spieler, waffeId),
      wiederGefuehrt: match.inventory.has(spieler, waffeId),
      kisteWeg: !match.world.isActive(abwurf.crateId),
    };
  });

  if (ergebnis.uebersprungen) return;
  expect(ergebnis.kisteMunition).toBe(ergebnis.vorher);
  expect(ergebnis.wiederGefuehrt).toBe(true);
  expect(ergebnis.nachher).toBe(ergebnis.vorher);
  expect(ergebnis.kisteWeg).toBe(true);
});

test('Nachladezeit erscheint in der Waffenliste und blockiert den Schuss', async ({ page }) => {
  await boot(page, { seed: 4711 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    // Eine Waffe mit Nachladezeit suchen und feuern.
    const waffeId = match.inventory.getWeapons(spieler)
      .find(id => api.getWeapon(id)?.cooldown > 0);
    if (!waffeId) return { uebersprungen: true };

    match.fire(spieler, 0, 50, waffeId);
    api.advance(1);
    return {
      uebersprungen: false,
      restCooldown: match.cooldownFor(spieler, waffeId),
      cooldownAusKatalog: api.getWeapon(waffeId).cooldown,
      waffeId,
    };
  });

  if (ergebnis.uebersprungen) return;
  expect(ergebnis.restCooldown).toBe(ergebnis.cooldownAusKatalog);

  // Die Anzeige muss die Nachladezeit zeigen.
  const zeile = page.locator(`#weapon-list .weapon-item[data-weapon-id="${ergebnis.waffeId}"]`);
  await expect(zeile).toHaveClass(/is-cooling/);
  await expect(zeile.locator('.weapon-cooldown')).toContainText('⏳');
  await expect(zeile).toHaveAttribute('data-cooldown', String(ergebnis.restCooldown));

  // Ein zweiter Schuss muss abgelehnt werden.
  const zweiter = await page.evaluate(id => {
    const match = window.__PA__.getMatch();
    return match.fire(window.__PA__.getMatch().activePlayerId, 0, 50, id);
  }, ergebnis.waffeId);
  expect(zweiter.ok).toBe(false);
  expect(zweiter.errors.join(' ')).toContain('lädt nach');
});

test('Voller Vorrat meldet sich und verhindert stillen Verlust', async ({ page }) => {
  await boot(page, { seed: 1212 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    // Vorrat bis zur Grenze füllen.
    const grenze = 6;
    const waffen = api.weapons().filter(w => w.damage > 0).slice(0, grenze).map(w => w.id);
    match.inventory.register(spieler, waffen);

    const vorher = match.inventory.droppableCount(spieler);
    const istVoll = match.inventory.isFull(spieler);

    // Eine Kiste direkt auf den Spieler legen.
    const x = match.world.getComponent(spieler, 'Position', 'x');
    const y = match.world.getComponent(spieler, 'Position', 'y');
    const neue = api.weapons().find(w => !match.inventory.has(spieler, w.id));
    const kiste = match.world.createEntity();
    match.world.addComponent(kiste, 'Position', { x, y });
    match.world.addComponent(kiste, 'Crate', {
      crateType: 0, crateX: x, crateY: y, rarity: 0,
      weaponId: neue.index, picked: 0, ammo: 0,
    });

    match.step();
    const ereignisse = match.consumeEvents().map(e => e.type);
    // Der Client muss die Ereignisse verarbeiten, damit die Meldung im
    // Protokoll landet.
    api.advance(1);

    return {
      istVoll,
      vorher,
      nachher: match.inventory.droppableCount(spieler),
      blockiert: ereignisse.includes('crate_pickup_blocked'),
      kisteBleibt: (api.getState().crates ?? []).some(k => k.entityId === kiste),
    };
  });

  expect(ergebnis.istVoll).toBe(true);
  expect(ergebnis.nachher).toBe(ergebnis.vorher);
  expect(ergebnis.blockiert).toBe(true);
  expect(ergebnis.kisteBleibt).toBe(true);
  await expect(page.locator('#log-list')).toContainText('Vorrat voll');
});

test('Nach dem Abwerfen ist wieder Platz', async ({ page }) => {
  await boot(page, { seed: 808 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    const waffen = api.weapons().filter(w => w.damage > 0).slice(0, 6).map(w => w.id);
    match.inventory.register(spieler, waffen);
    const voll = match.inventory.isFull(spieler);

    // Über die Match-API abwerfen — das ist der Weg, den auch der Client geht.
    // Erste abwerfbare Waffe (die Reserve ist ausgenommen).
    const kandidat = match.inventory.getWeapons(spieler)[0];
    const abwurf = match.dropWeapon(spieler, kandidat);

    return {
      voll,
      abwurfOk: abwurf.ok,
      danachVoll: match.inventory.isFull(spieler),
      anzahl: match.inventory.droppableCount(spieler),
      fehler: abwurf.errors ?? [],
    };
  });

  expect(ergebnis.voll).toBe(true);
  expect(ergebnis.abwurfOk).toBe(true);
  expect(ergebnis.danachVoll).toBe(false);
  expect(ergebnis.anzahl).toBeLessThan(6);
});
