/**
 * QV-1 (2026-11-17): Messwerkzeuge messen das Spiel, das das Menü startet.
 *
 * Befund: Bot-Partien und Balance-Läufe starteten ohne `kartentyp`, das Menü immer mit `autonom`.
 * Ohne autonome Karte gibt es kein Stofffeld, und das Biom hat keine Spielwirkung (21 Biome, ein
 * einziger Verlauf). Die Biom-Aussagen in `docs/balance-rollen-2026-11-12.md` beruhen auf diesem Modus.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MENUE_KARTENTYP, MENUE_FASSUNGEN } from '../src/shared/config/menueStart.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

test('Das Menü startet mit MENUE_KARTENTYP (keine eigene Konstante in main.js)', () => {
  const quelle = fs.readFileSync(new URL('../src/client/main.js', import.meta.url), 'utf8');
  assert.match(quelle, /const kartentyp = MENUE_KARTENTYP;/);
  assert.doesNotMatch(quelle, /const kartentyp = 'autonom'/);
  assert.equal(MENUE_KARTENTYP, 'autonom');
});

test('Menü und Bot-Partien lesen dieselbe Fassungsliste (MENUE_FASSUNGEN)', () => {
  const main = fs.readFileSync(new URL('../src/client/main.js', import.meta.url), 'utf8');
  assert.match(main, /\.\.\.MENUE_FASSUNGEN,/);
  const bot = fs.readFileSync(new URL('../scripts/bot-partien.mjs', import.meta.url), 'utf8');
  assert.match(bot, /\.\.\.MENUE_FASSUNGEN,/);
  const m = neuesMatch(1, 4, { teams: 2, proTeam: 1 });
  assert.equal(m.windFassung, MENUE_FASSUNGEN.wind, 'Wind wie im Menü, nicht ALT');
  assert.equal(m.hagel, MENUE_FASSUNGEN.hagel);
});

test('Bot-Partien starten wie das Menü: autonome Karte mit Stofffeld', () => {
  const m = neuesMatch(20261111, 4, { teams: 2, proTeam: 1, extra: { biom: 'vulkan' } });
  m.start();
  assert.equal(m.kartentyp, MENUE_KARTENTYP);
  assert.ok(m.stoffkarte?.feld, 'ohne autonome Karte fehlt das Stofffeld (Biom ohne Spielwirkung)');
});

test('Biom wirkt in der Bot-Partie: Vulkan und Eiswüste haben verschiedene Stofffelder', () => {
  const feld = biom => {
    const m = neuesMatch(20261111, 4, { teams: 2, proTeam: 1, extra: { biom } });
    m.start();
    return Buffer.from(m.stoffkarte.feld.buffer).toString('base64');
  };
  assert.notEqual(feld('vulkan'), feld('eiswueste'));
});

test('Alter Modus bleibt ausdrücklich wählbar (extra.kartentyp: null)', () => {
  const m = neuesMatch(20261111, 4, { teams: 2, proTeam: 1, extra: { kartentyp: null } });
  m.start();
  assert.equal(m.kartentyp, null);
});
