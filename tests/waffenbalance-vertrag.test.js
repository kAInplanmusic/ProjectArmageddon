/**
 * BAL-06: Die Balancewerkzeuge messen den echten Spielvertrag, nicht den Grundkatalog.
 *
 * Diese Datei prüft die Abnahme des Tickets am Werkzeug `scripts/waffen-balance.mjs`:
 *
 *   - alle 150 aktuellen Namen/Werte (nicht die rohen `WEAPONS`-Objekte),
 *   - Klassenleben 130/100/70 aus Klassenfassung 3,
 *   - 9 unbegrenzte, 73 Drei-, 48 Zwei-, 20 Einschusswaffen aus dem Inventar,
 *   - eine alte Fassung separat reproduzierbar (`--waffen=1`),
 *   - jede angefragte Distanz bleibt mit ihrer gemessenen Distanz sichtbar.
 *
 * Die Zahlen werden NICHT neu erfunden: Sie stammen aus `getWaffe`, dem
 * Inventar und `combatProfile` — denselben Quellen, die das Spiel benutzt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { munitionsKlasse } from '../src/shared/config/munition.js';

const lauf = promisify(execFile);
const hier = dirname(fileURLToPath(import.meta.url));
const skript = resolve(hier, '../scripts/waffen-balance.mjs');

async function werkzeug(...argumente) {
  const { stdout } = await lauf(process.execPath, [skript, '--json', ...argumente], {
    cwd: resolve(hier, '..'),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 600_000,
  });
  return JSON.parse(stdout);
}

test('Der Vertrag nennt alle 150 aktuellen Namen und Werte', async () => {
  const v = await werkzeug('--vertrag');

  assert.equal(v.waffenfassung, WAFFEN_STANDARD, 'Der Vertrag misst nicht die Standardfassung');
  assert.equal(v.klassenfassung, KLASSEN_STANDARD);
  assert.equal(v.katalog, 150, `Nur ${v.katalog} Waffen im Vertrag`);
  assert.equal(v.eindeutigeIds, 150);
  assert.equal(v.waffen.length, 150);

  const aktuell = new Map(WEAPONS.map(w => [w.id, getWaffe(w.id, WAFFEN_STANDARD)]));
  for (const zeile of v.waffen) {
    const waffe = aktuell.get(zeile.id);
    assert.ok(waffe, `Unbekannte ID ${zeile.id}`);
    assert.equal(zeile.name, waffe.displayName, `${zeile.id} zeigt einen veralteten Namen`);
    assert.equal(zeile.schaden, waffe.damage, `${zeile.id} zeigt einen veralteten Schadenswert`);
    assert.deepEqual(zeile.werte, waffe, `${zeile.id} zeigt nicht alle aktuellen Werte`);
  }
  // Der sprechendste Einzelfall: Die Mine heißt erst ab Fassung 12 „Mine“.
  assert.equal(v.waffen.find(w => w.id === 'pa_127').name, 'Mine');
});

test('Klassenleben sind 130/100/70 aus Klassenfassung 3', async () => {
  const v = await werkzeug('--vertrag');
  assert.deepEqual(v.klassenLeben, { nahkampf: 130, fernkampf: 100, okkultist: 70 });
  for (const klasse of CLASS_IDS) {
    const erwartet = Math.round(100 * combatProfile(klasse, null, null, KLASSEN_STANDARD).healthMultiplier);
    assert.equal(v.klassenLeben[klasse], erwartet);
  }
});

test('Frische Munition: 9 unbegrenzt, 73x3, 48x2, 20x1 — aus dem Inventar', async () => {
  const v = await werkzeug('--vertrag');
  assert.deepEqual(v.munition, { unbegrenzt: 9, 1: 20, 2: 48, 3: 73 });
  assert.equal(Object.values(v.munition).reduce((a, b) => a + b, 0), 150);

  // Jeder Einzelwert stimmt mit der Munitionsklasse des aktuellen Katalogs überein.
  for (const zeile of v.waffen) {
    /* Das Inventar liest die Munitionsklasse aus dem Grundkatalog. Der Nutzwert aus Fassung 21 (Entscheidung 9)
     * hebt pa_088 und pa_114 im Rang, verschiebt die Frischmunition aber bewusst nicht (offen, siehe
     * docs/waffen-entscheidungen-2026-11-11.md); deshalb gilt hier die Katalogklasse. */
    const klasse = munitionsKlasse(WEAPONS.find(w => w.id === zeile.id));
    assert.equal(zeile.frischmunition, Number.isFinite(klasse) ? klasse : 'unbegrenzt',
      `${zeile.id}: Frischmunition ${zeile.frischmunition} statt ${klasse}`);
  }
  // 110 Waffen haben einen anderen maxAmmo-Katalogwert als ihre Frischmunition.
  const abweichend = v.waffen.filter(w => w.maxAmmoKatalog !== w.frischmunition);
  assert.equal(abweichend.length, 110, 'Der maxAmmo-Fehler ist nur teilweise behoben');
});

test('Eine alte Fassung ist separat reproduzierbar', async () => {
  const aktuell = await werkzeug('--vertrag');
  const alt = await werkzeug('--vertrag', '--waffen=1');

  assert.equal(alt.waffenfassung, 1);
  assert.equal(alt.katalog, 150);

  const mineAktuell = aktuell.waffen.find(w => w.id === 'pa_127');
  const mineAlt = alt.waffen.find(w => w.id === 'pa_127');
  assert.equal(mineAktuell.name, 'Mine');
  assert.equal(mineAlt.name, 'Teleportplattform', 'Fassung 1 muss die historische Plattform zeigen');

  const schlaegerAktuell = aktuell.waffen.find(w => w.id === 'pa_001');
  const schlaegerAlt = alt.waffen.find(w => w.id === 'pa_001');
  assert.equal(schlaegerAktuell.schaden, 53);
  assert.equal(schlaegerAlt.schaden, 28, 'Fassung 1 muss den unveränderten Alt-Wert zeigen');
});

test('Jede angefragte Distanz bleibt mit ihrer gemessenen Distanz sichtbar', async () => {
  const messung = await werkzeug('--nur=pa_001');
  assert.equal(messung.waffen.length, 1);
  const waffe = messung.waffen[0];

  const angefragt = [40, 90, 150, 300, 500, 800, 1200, 1700];
  assert.deepEqual(waffe.entfernungen.angefragt, angefragt,
    'Es fehlt eine angefragte Distanz — Vollabdeckung wäre behauptet');
  assert.equal(waffe.proEntfernung.length, angefragt.length,
    'Nicht jede angefragte Distanz hat eine Zeile');

  for (const zeile of waffe.proEntfernung) {
    assert.equal(typeof zeile.angefragt, 'number');
    assert.ok(zeile.gemessen === null || (zeile.gemessen > 0 && zeile.gemessen <= zeile.angefragt),
      `Gemessen ${zeile.gemessen} px bei angefragt ${zeile.angefragt} px`);
  }
  // Die Karte ist 2560 px breit: 1200/1700 px werden auf 850 px verkürzt. Beides
  // muss sichtbar bleiben, sonst wäre eine verkürzte Messung als lange ausgegeben.
  const verkuerzt = waffe.proEntfernung.filter(z => z.gemessen !== z.angefragt);
  assert.ok(verkuerzt.length > 0, 'Keine verkürzte Messung sichtbar — die Karte sollte kürzen');
  assert.ok(verkuerzt.every(z => z.angefragt > z.gemessen));
});
