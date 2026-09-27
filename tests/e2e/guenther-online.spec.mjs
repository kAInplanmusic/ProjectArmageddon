import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  starteTestserver,
  stoppeTestserver,
  starteOnlineMatch,
  schneideServernachrichtenMit,
  hudMeldungen,
} from './helfer/online-match.mjs';

/*
 * Frist je Test: 120 s statt der Vorgabe von 60 s.
 *
 * Warum das nötig ist: Online läuft die Simulation in ECHTZEIT, und die Zugzeit
 * beträgt 30 s. Auf Günther wird bis zu 25 s gewartet (Auftritt), auf seine
 * Streiche bis zu 30 s. Auf diesem Rechner braucht der Browser für ein Bild
 * ~50 ms (gemessen, siehe `prediction-online.spec.mjs`), jede Wartebedingung
 * wird also später erfüllt als auf schneller Hardware. Die Frist ist Reserve für
 * die langsame Maschine — nicht dafür, dass etwas länger dauern DÜRFTE.
 */
test.setTimeout(120_000);

/**
 * GÜNTHER IM ONLINE-MATCH — im echten Browser, gegen den echten Server.
 *
 * ## Warum diese Datei nötig war (der Befund)
 *
 * `tests/e2e/guenther.spec.mjs` prüft Günther fünfmal — aber JEDES dieser fünf
 * Spiele ist ein LOKALES Match (`api.startMatch(...)`, `api.advance(...)`). Der
 * Drahtweg (Protokoll v7: `GUENTHER_STRIDE`, `GUENTHER_POOP_STRIDE`,
 * `guenther: snapshot.guenther`) und der Client-Anschluss
 * (`onlineViewState.guenther`) waren damit nur „durch Konstruktion" belegt:
 * gelesen ja, im Browser beobachtet nein. Genau die Lücke, die
 * `docs/analyse-guenther-online.md` in „Offen, nicht prüfbar" benennt.
 *
 * ## Was hier gemessen wird
 *
 * Drei Glieder der Kette, jedes einzeln:
 *   1. Der Server schickt Günther über die Leitung (mitgeschnittene
 *      Steuernachrichten + `aktiv`/Position im empfangenen Zustand).
 *   2. Der Renderer zeichnet ihn — gemessen am Bild, nicht an einem Feld.
 *   3. Seine Streiche kommen als Meldung an (Ereignisrahmen → HUD-Zeile).
 *
 * ## Warum Seed 2
 *
 * Online läuft die Simulation in Echtzeit (60 Hz des Servers), und die Zugzeit
 * beträgt 30 s. Ein Günther, der erst in Runde 12 auftritt, wäre im Test nicht
 * erreichbar. Offline ausgemessen (`node`, derselbe Motorbau wie der Server,
 * `teams: 2`, `playersPerTeam: 1`, `preset: 'hills'`, `maxRounds: 30`) liegt der
 * Auftrittsplan für Seed 2 bei `[1, 15, 17, 18]` — Günther ist ab dem ERSTEN
 * Simulationsschritt aktiv und macht seinen ersten Haufen bei Tick 187 (~3 s).
 * Der Plan hängt nur am Seed (`getSubRng('GUENTHER')`) und an `maxRounds`, nicht
 * am Gelände.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = 3228;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SEED = 2;

let server = null;

test.beforeAll(async () => {
  server = await starteTestserver({ port: SERVER_PORT, repoRoot });
});

test.afterAll(async () => {
  await stoppeTestserver(server?.process);
  server = null;
});

/** Startet den Server (falls nötig) und ein Online-Match mit Seed 2. */
async function matchMitGuenther(page) {
  const nachrichten = await schneideServernachrichtenMit(page);
  const zweiter = await starteOnlineMatch(page, {
    serverUrl: SERVER_URL, port: SERVER_PORT, seed: SEED, name: 'Beobachter',
  });
  return { nachrichten, zweiter };
}

test('Günther kommt online über die Leitung — nicht aus einem lokalen Motor', async ({ page }) => {
  test.setTimeout(120_000);
  await matchMitGuenther(page);

  /*
   * Auf Günther warten, nicht auf die Uhr: `guenther.aktiv` ist die Bedingung,
   * und der Fehlerfall soll den EMPFANGENEN Wert zeigen.
   */
  await page.waitForFunction(
    () => window.__PA__.getState()?.guenther?.aktiv === true,
    null,
    { timeout: 25_000 },
  );

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    const zustand = api.getState();
    return {
      modus: api.getMode(),
      // Der Gegenbeweis zur Verwechslung mit dem lokalen Match: online gibt es
      // IM BROWSER keinen lokalen Motor. Was hier steht, kam über die Leitung.
      lokalerMotor: Boolean(api.game.match),
      // Der lokale Diagnosezugang liest `game.match` — er MUSS leer bleiben.
      ueberLokalenZugang: api.guenther(),
      guenther: zustand.guenther,
      seedVomServer: api.getNetwork()?.worldSeed ?? null,
      snapshots: api.getNetwork()?.stats?.snapshotsReceived ?? 0,
    };
  });

  expect(stand.modus).toBe('online');
  expect(stand.lokalerMotor, 'Online darf kein lokaler Motor im Browser laufen').toBe(false);
  expect(stand.ueberLokalenZugang, 'Der lokale Diagnosezugang sieht online nichts — das ist der Beweis').toBeNull();
  expect(stand.seedVomServer).toBe(SEED);
  expect(stand.snapshots).toBeGreaterThan(3);

  expect(stand.guenther, 'Kein Günther im übertragenen Zustand').not.toBeNull();
  expect(stand.guenther.aktiv, 'Günther ist online nicht aktiv').toBe(true);
  // Position aus dem Drahtformat (Zentimeter-Auflösung des COORD_SCALE=4).
  expect(stand.guenther.x).toBeGreaterThan(0);
  expect(stand.guenther.y).toBeGreaterThan(0);
  expect([-1, 1]).toContain(stand.guenther.richtung);
});

test('Der Renderer zeichnet Günther auch online', async ({ page }) => {
  await matchMitGuenther(page);
  await page.waitForFunction(
    () => window.__PA__.getState()?.guenther?.aktiv === true,
    null,
    { timeout: 25_000 },
  );

  /*
   * Gemessen wird das BILD, nicht ein Feld: Ein Feld kann gefüllt sein, ohne
   * dass etwas zu sehen ist — genau die Lage aus der Analyse (der Renderer
   * steigt bei fehlendem `guenther` WEICH aus, ohne Fehler und ohne Log).
   *
   * Der Vergleich läuft über die GANZE Leinwand, nicht über ein Fenster um die
   * Figur: Die Kamera des Clients kann verschoben sein (online folgt sie dem
   * eigenen Zug), ein festes Rechteck wäre dann blind.
   *
   * ## Die Uhr wird angehalten — sonst misst man die Animation
   *
   * FUND (belegt, erster Lauf dieser Datei): Der Renderer führt eine eigene Uhr
   * (`renderer.js:80` `this.time = 0`, am Ende von `render` `this.time += 1`) und
   * zeichnet damit Wasser, Umgebung, Blitzpuls und sogar Günthers Beine
   * (`Math.sin(this.time * 0.22)`). Drei Aufrufe hintereinander ergaben deshalb
   * drei verschiedene Bilder: `mitHund` 2046 unterschiedliche Pixel gegen ein
   * GRUNDRAUSCHEN von 1562 — der Hund war in der Animation nicht mehr von ihr zu
   * trennen.
   *
   * Die Uhr ist ein einfaches Feld und wird vor jedem Aufruf auf denselben Wert
   * gesetzt. Damit ist der Vergleich exakt: derselbe Zustand, dieselbe Uhrzeit,
   * und die EINZIGE Änderung ist `guenther`. `renderer.js` liest `performance.now`
   * und `Math.random` nirgends (`grep -c`: je 0) — das Bild hängt wirklich nur an
   * Zustand und Uhr.
   */
  const bild = await page.evaluate(() => {
    const api = window.__PA__;
    const renderer = api.game.renderer;
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const zustand = api.getState();
    const kontext = { aim: null, water: api.game.water ?? null, blastRadius: 0 };

    const zeichne = (zustand_, zeit) => {
      renderer.time = zeit;
      renderer.render(zustand_, kontext);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };

    const uhr = 777;
    const mitHund = zeichne(zustand, uhr);
    const ohneHundEins = zeichne({ ...zustand, guenther: null }, uhr);
    const ohneHundZwei = zeichne({ ...zustand, guenther: null }, uhr);

    const unterschied = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > 12) n += 1;
      }
      return n;
    };

    return {
      pixel: mitHund.length / 4,
      mitHund: unterschied(mitHund, ohneHundEins),
      grundrauschen: unterschied(ohneHundEins, ohneHundZwei),
      haufen: (zustand.guenther?.haufen ?? []).length,
      x: zustand.guenther?.x ?? null,
      y: zustand.guenther?.y ?? null,
    };
  });

  expect(bild.pixel).toBeGreaterThan(100_000);
  // Die gemessenen Zahlen stehen im Lauf — sie sind der Beleg, nicht die Anzeige.
  console.log('[guenther-online] Bildmessung:', JSON.stringify(bild));
  // Bei angehaltener Uhr müssen zwei gleiche Aufrufe DASSELBE Bild ergeben.
  // Ist das nicht so, ist das Zeichnen nicht deterministisch — dann belegt der
  // Vergleich unten nichts, und das soll der Lauf sagen, statt still zu bestehen.
  expect(
    bild.grundrauschen,
    `Das Zeichnen ist nicht deterministisch (${bild.grundrauschen} Pixel ohne jede Zustandsänderung)`,
  ).toBe(0);

  // Günther bei (x, y) mit Körperlänge 30 und Schulterhöhe 22 — in seinem
  // Umfeld muss das Bild sichtbar anders sein.
  expect(
    bild.mitHund,
    `Günther hinterlässt keine Spur im Bild (Position ${bild.x}/${bild.y})`,
  ).toBeGreaterThan(300);
});

test('Günthers Streiche kommen online an und stehen im Protokoll', async ({ page }) => {
  const { nachrichten } = await matchMitGuenther(page);

  /*
   * Auf den ERSTEN Haufen warten. Gemessen (offline, Seed 2) liegt er bei Tick
   * 187 — gut drei Sekunden nach Matchbeginn. Der Drahtrahmen ist der Beleg:
   * Textrahmen sind Steuernachrichten, und `guenther_poop` steht wörtlich darin.
   */
  await expect.poll(
    () => nachrichten.filter(n => n.t === 'guenther_poop').length,
    { timeout: 30_000, message: 'Der Server hat kein guenther_poop geschickt' },
  ).toBeGreaterThan(0);

  const haufenRahmen = nachrichten.find(n => n.t === 'guenther_poop');
  // Das Ereignis trägt seinen Ort — sonst könnte der Client nichts einzeichnen.
  expect(typeof haufenRahmen.x).toBe('number');
  expect(typeof haufenRahmen.y).toBe('number');

  // Der Haufen ist im ÜBERTRAGENEN Zustand: Die Liste wächst über die Leitung.
  await expect.poll(
    () => page.evaluate(() => (window.__PA__.getState()?.guenther?.haufen ?? []).length),
    { timeout: 15_000, message: 'Kein Haufen im übertragenen Zustand' },
  ).toBeGreaterThan(0);

  // Und die Anzeige meldet ihn — genau EINE Zeile je Ereignis, und sie stand im
  // Anzeige-Augenblick in der Liste (`imDom`, Begründung im Helfer).
  const meldungen = (await hudMeldungen(page)).filter(m => /Häufchen/.test(m.text));
  expect(meldungen.length, 'Die HUD-Meldung zum Haufen fehlt').toBeGreaterThan(0);
  expect(meldungen[0].imDom, 'Die Haufen-Meldung stand nicht in der Anzeigeliste').toBe(true);
});

test('Auch die übrigen Günther-Ereignisse laufen über die Leitung', async ({ page }) => {
  const { nachrichten } = await matchMitGuenther(page);

  /*
   * Gegenprobe gegen „nur der Haufen kommt an": Der Server schickt JEDES
   * Engine-Ereignis ohne Whitelist. Offline gemessen erzeugt Seed 2 innerhalb
   * der ersten drei Runden alle vier Arten. Geprüft werden die zwei, die
   * zuverlässig früh fallen (das Rad braucht eine Berührung, der Tritt in einen
   * Haufen einen Schritt darauf).
   */
  await expect.poll(
    () => nachrichten.filter(n => n.t === 'guenther_poop' || n.t === 'guenther_pee').length,
    { timeout: 40_000, message: 'Keine Günther-Streiche über die Leitung' },
  ).toBeGreaterThan(1);

  const pinkel = (await hudMeldungen(page)).filter(m => /pinkelt/.test(m.text));
  expect(pinkel.length, 'Die Pinkel-Meldung fehlt im Live-Bereich').toBeGreaterThan(0);
});
