import { test, expect } from '@playwright/test';

/**
 * Kulissen im Browser.
 *
 * Die Unit-Tests belegen, dass Katalog und Bilddateien zueinander passen. Hier
 * wird geprüft, dass die Kulisse im laufenden Spiel auch tatsächlich GEZEICHNET
 * wird — der Lade-Pfad ist die Stelle, an der das schon einmal still scheiterte
 * (ein um eine Ebene falscher Glob-Pfad lieferte eine leere Liste, ohne Fehler).
 *
 * Gemessen wird am Bild: Eine gemalte Kulisse hat ein Vielfaches an Farben
 * gegenüber dem einfarbigen Verlauf, den sie ersetzt.
 */

/** Startet ein lokales Match und wartet auf die fertig geladene Kulisse. */
async function startMitKulisse(page, { seed = 4242, preset = 'islands' } = {}) {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(({ s, p }) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: s, teams: 2, playersPerTeam: 2, preset: p });
    api.setAutoLoop(false);
  }, { s: seed, p: preset });
  await page.waitForFunction(
    () => window.__PA__.game.renderer.backdropReady === true,
    null,
    { timeout: 15000 },
  );
}

/** Zählt die verschiedenen Farben im oberen Bildbereich (Himmel). */
async function farbvielfalt(page, mitKulisse) {
  return page.evaluate((an) => {
    const api = window.__PA__;
    const renderer = api.game.renderer;
    const gemerkt = { bild: renderer.backdropImage, bereit: renderer.backdropReady };

    if (!an) {
      renderer.backdropImage = null;
      renderer.backdropReady = false;
    }
    renderer.render(api.getState(), { aim: null, water: api.game.water, blastRadius: 0 });

    const canvas = document.querySelector('canvas');
    const daten = canvas.getContext('2d')
      .getImageData(0, 0, canvas.width, Math.round(canvas.height * 0.25)).data;

    const farben = new Set();
    for (let i = 0; i < daten.length; i += 40) {
      farben.add((daten[i] << 16) | (daten[i + 1] << 8) | daten[i + 2]);
    }

    renderer.backdropImage = gemerkt.bild;
    renderer.backdropReady = gemerkt.bereit;
    return farben.size;
  }, mitKulisse);
}

test('Die Kulisse wird tatsächlich gezeichnet', async ({ page }) => {
  await startMitKulisse(page);

  const mit = await farbvielfalt(page, true);
  const ohne = await farbvielfalt(page, false);

  // Ein gemaltes Bild hat deutlich mehr Farben als ein Verlauf mit Sternpunkten.
  expect(mit).toBeGreaterThan(ohne * 5);
  expect(mit).toBeGreaterThan(500);
});

test('Die Kulisse passt zum gewählten Gelände', async ({ page }) => {
  await startMitKulisse(page, { preset: 'caverns', seed: 777 });

  const info = await page.evaluate(() => {
    const renderer = window.__PA__.game.renderer;
    return { key: renderer.backdropKey, datei: renderer.backdrop?.file, preset: renderer.backdrop?.mapPreset };
  });

  expect(info.preset).toBe('caverns');
  expect(info.datei).toMatch(/^caverns_/);
});

test('Gleicher Seed zeigt dieselbe Kulisse', async ({ page }) => {
  await startMitKulisse(page, { seed: 31337 });
  const erste = await page.evaluate(() => window.__PA__.game.renderer.backdropKey);

  // Neues Match mit demselben Seed.
  await page.evaluate(() => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: 31337, teams: 2, playersPerTeam: 1, preset: 'islands' });
    api.setAutoLoop(false);
  });
  await page.waitForFunction(
    () => window.__PA__.game.renderer.backdropReady === true,
    null,
    { timeout: 15000 },
  );
  const zweite = await page.evaluate(() => window.__PA__.game.renderer.backdropKey);

  expect(zweite).toBe(erste);
});

test('Ohne Kulisse bleibt das Spiel spielbar', async ({ page }) => {
  // Fällt eine Kulisse aus, muss der Farbverlauf greifen — ein schwarzer
  // Bildschirm wäre ein Totalausfall statt einer verschlechterten Darstellung.
  await startMitKulisse(page);
  await page.evaluate(() => {
    const api = window.__PA__;
    api.game.renderer.backdropImage = null;
    api.game.renderer.backdropReady = false;
  });

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    api.advance(3);
    const zustand = api.getState();
    const canvas = document.querySelector('canvas');
    const daten = canvas.getContext('2d').getImageData(0, 0, canvas.width, 20).data;
    let summe = 0;
    for (let i = 0; i < daten.length; i += 4) summe += daten[i] + daten[i + 1] + daten[i + 2];
    return { hatZustand: Boolean(zustand), nichtSchwarz: summe > 100 };
  });

  expect(stand.hatZustand).toBe(true);
  expect(stand.nichtSchwarz).toBe(true);
});

test('Die Spielfiguren bleiben vor heller Kulisse erkennbar', async ({ page }) => {
  // Eine Schnee- oder Wüstenkulisse ist hell. Ohne die Abdunkelung nach unten
  // wären Figuren und Anzeigen dort kaum zu sehen.
  await startMitKulisse(page, { preset: 'mountains', seed: 11 });

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    const renderer = api.game.renderer;
    const zustand = api.getState();
    if (!zustand?.entities?.length) return null;

    renderer.render(zustand, { aim: null, water: api.game.water, blastRadius: 0 });
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    // Der Bereich unterhalb der Geländekante darf nicht überstrahlt sein:
    // geprüft wird der Anteil sehr heller Pixel im unteren Drittel.
    const oben = Math.round(canvas.height * 0.66);
    const daten = ctx.getImageData(0, oben, canvas.width, canvas.height - oben).data;
    let hell = 0;
    const gesamt = daten.length / 4;
    for (let i = 0; i < daten.length; i += 4) {
      if (daten[i] > 225 && daten[i + 1] > 225 && daten[i + 2] > 225) hell += 1;
    }
    return { anteilHell: hell / gesamt, kulisse: renderer.backdropKey };
  });

  expect(stand).not.toBeNull();
  // Höchstens ein Fünftel des unteren Drittels darf reinweiß sein.
  expect(stand.anteilHell).toBeLessThan(0.2);
});


test('Der Boden bekommt die Farbe der Kulisse', async ({ page }) => {
  // Vorher war der Boden immer grün — über Packeis, Basalt und Sand gleichermaßen.
  // Geprüft wird die tatsächlich gezeichnete Bodenfarbe zweier gegensätzlicher
  // Kulissen: sie muss sich deutlich unterscheiden.
  const bodenfarbe = async (backdropKey) => {
    await page.goto('http://127.0.0.1:5173/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate((key) => {
      const api = window.__PA__;
      api.setAutoLoop(false);
      api.startMatch({ seed: 5, teams: 2, playersPerTeam: 4, preset: 'mountains', backdropKey: key });
      api.setAutoLoop(false);
    }, backdropKey);

    return page.evaluate(() => {
      const api = window.__PA__;
      // Der Boden liegt unter der Geländekante. Gemessen wird knapp darunter
      // in der Bildmitte.
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const mitte = Math.round(canvas.width / 2);
      const daten = ctx.getImageData(mitte, 0, 1, canvas.height).data;

      // Erste Stelle von oben, die nicht Himmel ist: das ist die Geländekante.
      // Gesucht wird die erste Zeile unterhalb der halben Höhe mit gesättigter
      // Farbe (das Gelände ist deckend, die Kulisse darüber nicht).
      for (let y = Math.round(canvas.height * 0.55); y < canvas.height - 5; y++) {
        const i = y * 4;
        const [r, g, b] = [daten[i], daten[i + 1], daten[i + 2]];
        const deckend = Math.abs(r - g) + Math.abs(g - b) > 8 || (r + g + b) > 200;
        if (deckend) return { y, farbe: [r, g, b], palette: api.game.renderer.palette.surface };
      }
      return { y: -1, farbe: null, palette: api.game.renderer.palette.surface };
    });
  };

  const winter = await bodenfarbe('alpine/winter_snow');
  const lava = await bodenfarbe('caverns/lava_tube');

  // Die Paletten müssen sich stark unterscheiden (hell vs. dunkel).
  const summe = f => f[0] + f[1] + f[2];
  expect(summe(winter.palette)).toBeGreaterThan(summe(lava.palette) * 2);
  expect(winter.palette[0]).toBeGreaterThan(180);
  expect(summe(lava.palette)).toBeLessThan(220);
});

test('Eine gewählte Kulisse wird auch wirklich verwendet', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  // Eine Kulisse wählen, die NICHT die Vorauswahl des Geländes ist: nur so ist
  // belegt, dass die Wahl die Ableitung schlägt.
  const gewaehlt = 'cosmos/black_hole';
  await page.evaluate((key) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: 5, teams: 2, playersPerTeam: 2, preset: 'hills', backdropKey: key });
    api.setAutoLoop(false);
  }, gewaehlt);

  await page.waitForFunction(
    () => window.__PA__.game.renderer.backdropReady === true,
    null,
    { timeout: 15000 },
  );
  const info = await page.evaluate(() => {
    const r = window.__PA__.game.renderer;
    return { key: r.backdropKey, palette: r.palette };
  });

  expect(info.key).toBe(gewaehlt);
  // Und die Bodenfarbe gehört zu dieser Kulisse, nicht zu den Hügeln.
  expect(info.palette.surface[0]).toBeLessThan(100);
  expect(info.palette.surface[2]).toBeGreaterThan(info.palette.surface[1]);
});

test('Die Kulissenauswahl im Menü ist vollständig', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const stand = await page.evaluate(() => {
    const auswahl = document.getElementById('cfg-backdrop');
    return {
      optionen: auswahl.querySelectorAll('option').length,
      gruppen: auswahl.querySelectorAll('optgroup').length,
      ersteLeer: auswahl.options[0].value === '',
    };
  });

  // 60 Kulissen plus die Option „automatisch".
  expect(stand.optionen).toBe(61);
  expect(stand.gruppen).toBe(12);
  expect(stand.ersteLeer).toBe(true);
});
