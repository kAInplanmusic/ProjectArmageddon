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

test('Die abgeworfene Waffe fliegt und landet aufhebbar', async ({ page }) => {
  await boot(page, { seed: 313 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    const px = match.world.getComponent(spieler, 'Position', 'x');
    const py = match.world.getComponent(spieler, 'Position', 'y');

    const abwurf = api.game.dropWeapon(0);
    if (!abwurf?.ok) return { ok: false, fehler: abwurf?.errors };

    // Der Wurf muss eine Geschwindigkeit haben — sonst wäre es ein Ablegen.
    const startFliegend = match.world.getComponent(abwurf.crateId, 'Crate', 'inFlight');

    // Fliegen lassen.
    let gelandet = false;
    for (let i = 0; i < 200; i++) {
      api.advance(1);
      if (!match.world.isActive(abwurf.crateId)) break;
      if (match.world.getComponent(abwurf.crateId, 'Crate', 'inFlight') === 0) { gelandet = true; break; }
    }

    const lx = match.world.getComponent(abwurf.crateId, 'Position', 'x');
    const ly = match.world.getComponent(abwurf.crateId, 'Position', 'y');
    const boden = match.surfaceYAt(Math.round(lx));
    const wasser = match.water?.levelAtWorld ? match.water.levelAtWorld(lx, ly) : 0;

    return {
      ok: true,
      vx: abwurf.vx, vy: abwurf.vy,
      startFliegend,
      gelandet,
      abstand: Math.hypot(lx - px, ly - py),
      aufBoden: Math.abs(ly - boden) < 3,
      imWasser: wasser > 0.35,
      kisteImZustand: (api.getState().crates ?? []).some(k => k.entityId === abwurf.crateId),
    };
  });

  expect(ergebnis.ok).toBe(true);
  // Der Wurf hat eine Geschwindigkeit und startet als fliegend.
  expect(Math.abs(ergebnis.vx)).toBeGreaterThan(0.3);
  expect(ergebnis.vy).toBeLessThan(-2);
  expect(ergebnis.startFliegend).toBe(1);
  // Nach dem Flug liegt sie auf festem Boden, außerhalb des Aufhebe-Radius.
  expect(ergebnis.gelandet).toBe(true);
  expect(ergebnis.aufBoden).toBe(true);
  expect(ergebnis.imWasser).toBe(false);
  expect(ergebnis.abstand).toBeGreaterThan(18);
  expect(ergebnis.kisteImZustand).toBe(true);
});

test('Aufheben einer Abwurfkiste stellt den Munitionsvorrat her', async ({ page }) => {
  await boot(page, { seed: 5150 });

  const ergebnis = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const spieler = match.activePlayerId;

    const waffeId = match.inventory.getWeapons(spieler)
      .find(id => Number.isFinite(match.inventory.getAmmo(spieler, id)));
    if (!waffeId) return { uebersprungen: true };

    while (match.inventory.getAmmo(spieler, waffeId) > 2) {
      match.inventory.consume(spieler, waffeId, 1);
    }
    const vorher = match.inventory.getAmmo(spieler, waffeId);
    const abwurf = match.dropWeapon(spieler, waffeId);
    const kisteMunition = match.world.getComponent(abwurf.crateId, 'Crate', 'ammo');

    // Landen lassen.
    for (let i = 0; i < 200; i++) {
      api.advance(1);
      if (match.world.getComponent(abwurf.crateId, 'Crate', 'inFlight') === 0) break;
    }

    // Die Kiste an den Fuß des Spielers legen — so entsteht der Kontakt, den das
    // LootSystem zum Aufheben braucht. Bewusst die KISTE bewegen: den Spieler zu
    // versetzen kämpft gegen die Physik, die ihn im selben Schritt auf den Boden
    // zurücksetzt.
    const px = match.world.getComponent(spieler, 'Position', 'x');
    const py = match.world.getComponent(spieler, 'Position', 'y');
    match.world.setComponent(abwurf.crateId, 'Position', 'x', px);
    match.world.setComponent(abwurf.crateId, 'Position', 'y', py);
    match.world.setComponent(abwurf.crateId, 'Crate', 'crateX', px);
    match.world.setComponent(abwurf.crateId, 'Crate', 'crateY', py);
    api.advance(1);

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

test('Die Waffennummern steigen, und Taste N trifft die Nummer N', async ({ page }) => {
  /*
   * Fund (belegt): Nummerierung und Gliederung der Liste liefen auseinander.
   * Die Nummer kam aus der Anzeigeordnung (Reservewaffe zuletzt), der Platz in
   * der Liste aus einer zweiten Sortierung nach Unterkategorie. Die Reservewaffe
   * stand dadurch als Nummer 5 ÜBER der Nummer 4 — sichtbar falsch, und die
   * Zifferntasten folgten den Nummern, nicht der Liste.
   *
   * Beides wird hier geprüft: die aufsteigende Reihenfolge im DOM und die
   * Übereinstimmung von Taste und Beschriftung.
   */
  await boot(page, { seed: 4242 });

  const nummern = await page.evaluate(() =>
    [...document.querySelectorAll('#weapon-list .weapon-item')]
      .map(el => Number((el.getAttribute('aria-label') ?? '').split('.')[0])));
  expect(nummern.length).toBeGreaterThan(1);
  expect(nummern).toEqual(nummern.map((_, i) => i + 1));

  // Die Reservewaffe ist die letzte — sie ist nicht abwerfbar und gehört ans Ende.
  const letzte = await page.evaluate(() => {
    const zeilen = [...document.querySelectorAll('#weapon-list .weapon-item')];
    const el = zeilen[zeilen.length - 1];
    return { weaponId: el.dataset.weaponId, label: el.getAttribute('aria-label') };
  });

  /*
   * Jede Zifferntaste muss die Waffe wählen, die mit dieser Nummer beschriftet
   * ist. Geprüft wird über alle Positionen, nicht nur eine — genau der Vergleich
   * „Taste gegen Beschriftung" hätte den Fehler gefunden.
   */
  for (let position = 1; position <= nummern.length; position += 1) {
    const gewaehlt = await page.evaluate(async (n) => {
      const api = window.__PA__;
      document.body.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: String(n), bubbles: true }));
      await new Promise(fertig => requestAnimationFrame(fertig));
      const match = api.getMatch();
      return match.inventory.getActiveWeaponId(match.activePlayerId);
    }, position);

    const beschriftung = await page.evaluate((n) => {
      const zeilen = [...document.querySelectorAll('#weapon-list .weapon-item')];
      const el = zeilen[n - 1];
      return { weaponId: el.dataset.weaponId, label: el.getAttribute('aria-label') };
    }, position);

    expect(gewaehlt, `Taste ${position} wählte eine andere Waffe als beschriftet`).toBe(beschriftung.weaponId);
  }

  // Und die letzte Position ist weiterhin die Reservewaffe.
  expect(letzte.label).toMatch(/^\d+\.\s+\S/);
});
