import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { computePowerScore, tierForScore, POWER_TIERS } from '../scripts/build-weapon-catalog.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_ICONS = join(ROOT, 'assets/weapons/icons');
const CLIENT_ICONS = join(ROOT, 'src/client/assets/icons');

/** Dateiname ohne Endung, z. B. "IMG_9033.PNG" → "IMG_9033". */
function stem(name) {
  return name.replace(/\.[^.]+$/, '');
}

test('Jede Waffe hat ein Icon-Feld aus den Quelldaten', () => {
  const withoutIcon = WEAPONS.filter(weapon => !weapon.icon);
  assert.deepEqual(withoutIcon.map(weapon => weapon.id), [], 'Alle Waffen brauchen ein Icon');
  assert.equal(WEAPONS.length, 150);

  // Dateiname muss dem Muster der Logo-Dateien folgen.
  for (const weapon of WEAPONS) {
    assert.match(weapon.icon, /^IMG_\d+\.PNG$/i, `Unerwarteter Icon-Name: ${weapon.icon}`);
  }
});

test('Alle referenzierten Original-Icons existieren im Asset-Verzeichnis', () => {
  assert.ok(existsSync(SOURCE_ICONS), `Verzeichnis fehlt: ${SOURCE_ICONS}`);
  const available = new Set(readdirSync(SOURCE_ICONS).map(stem));

  const missing = WEAPONS
    .filter(weapon => !available.has(stem(weapon.icon)))
    .map(weapon => `${weapon.id} → ${weapon.icon}`);

  assert.deepEqual(missing, [], `Fehlende Original-Icons: ${missing.join(', ')}`);
});

test('Für jede Waffe existiert ein verarbeitetes Client-Icon', () => {
  // Der Generator hinterlegt iconPath; daraus den Dateinamen ableiten und gegen
  // das echte Verzeichnis prüfen. So fällt ein nicht ausgeliefertes Icon auf.
  const present = new Set(readdirSync(CLIENT_ICONS));

  const missing = [];
  for (const weapon of WEAPONS) {
    assert.ok(weapon.iconPath, `${weapon.id} hat keinen iconPath`);
    const file = weapon.iconPath.split('/').pop();
    if (!present.has(file)) missing.push(`${weapon.id} → ${file}`);
  }

  assert.deepEqual(missing, [], `Fehlende Client-Icons: ${missing.join(', ')}`);
});

test('Verarbeitete Icons sind quadratisch und nicht leer', () => {
  const files = readdirSync(CLIENT_ICONS).filter(name => name.endsWith('_icon.png'));
  assert.ok(files.length >= WEAPONS.length, `Zu wenige Icons: ${files.length}`);

  let checked = 0;
  for (const name of files) {
    const full = join(CLIENT_ICONS, name);
    const size = statSync(full).size;
    // Eine leere oder abgeschnittene Datei wäre ein stiller Ausfall.
    assert.ok(size > 100, `Icon ${name} ist verdächtig klein (${size} Byte)`);

    // PNG-Maße stecken in den Bytes 16..24 des IHDR-Chunks.
    const header = readFileSync(full, { encoding: null }).subarray(0, 24);
    assert.equal(header.readUInt32BE(0), 0x89504e47, `${name} ist kein PNG`);
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    assert.equal(width, height, `${name} ist nicht quadratisch (${width}x${height})`);
    assert.equal(width, 64, `${name} hat ${width} px statt 64`);
    checked += 1;
  }
  assert.ok(checked >= 150, `Es wurden nur ${checked} Icons geprüft`);
});

test('Icon-Zuordnung ist eindeutig je Waffe', () => {
  const byFile = new Map();
  for (const weapon of WEAPONS) {
    const key = stem(weapon.icon);
    assert.equal(
      byFile.has(key), false,
      `Icon ${weapon.icon} ist doppelt zugeordnet: ${byFile.get(key)} und ${weapon.id}`,
    );
    byFile.set(key, weapon.id);
  }
  assert.equal(byFile.size, WEAPONS.length);
});

test('iconPath zeigt auf das Client-Icon derselben Quelldatei', () => {
  for (const weapon of WEAPONS) {
    const expected = `${stem(weapon.icon)}_icon.png`;
    assert.ok(
      weapon.iconPath.endsWith(expected),
      `${weapon.id}: iconPath "${weapon.iconPath}" passt nicht zu icon "${weapon.icon}"`,
    );
  }
});

test('Abgeleitete Einstufung ist konsistent und deterministisch', () => {
  for (const weapon of WEAPONS) {
    assert.equal(typeof weapon.powerScore, 'number');
    assert.ok(weapon.powerScore >= 0);
    // Dieselbe Rechnung muss denselben Wert liefern (reine Funktion).
    assert.equal(
      computePowerScore(weapon), weapon.powerScore,
      `${weapon.id}: powerScore ist nicht reproduzierbar`,
    );
    assert.equal(tierForScore(weapon.powerScore), weapon.powerTier);
    assert.ok(
      ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(weapon.powerTier),
      `${weapon.id}: unbekannte Stufe ${weapon.powerTier}`,
    );
  }
});

test('Schwellen der Einstufung sind lückenlos und absteigend', () => {
  const tiers = POWER_TIERS.map(entry => entry.tier);
  assert.deepEqual(tiers, ['legendary', 'epic', 'rare', 'uncommon', 'common']);

  for (let i = 1; i < POWER_TIERS.length; i++) {
    assert.ok(
      POWER_TIERS[i].min < POWER_TIERS[i - 1].min,
      `Schwellen müssen absteigen: ${JSON.stringify(POWER_TIERS)}`,
    );
  }

  // Randfälle: genau auf der Schwelle, darüber und darunter.
  assert.equal(tierForScore(190), 'legendary');
  assert.equal(tierForScore(189.99), 'epic');
  assert.equal(tierForScore(130), 'epic');
  assert.equal(tierForScore(129.99), 'rare');
  assert.equal(tierForScore(80), 'rare');
  assert.equal(tierForScore(0), 'common');
  // Negative Werte dürfen nicht abstürzen.
  assert.equal(tierForScore(-5), 'common');
});

test('Epic und Legendary werden tatsächlich vergeben', () => {
  // Die Quelldaten kennen nur common/uncommon/rare. Der Zweck der abgeleiteten
  // Einstufung ist, die oberen Stufen zu belegen — das muss messbar sein.
  const counts = {};
  for (const weapon of WEAPONS) counts[weapon.powerTier] = (counts[weapon.powerTier] ?? 0) + 1;

  for (const tier of ['epic', 'legendary']) {
    assert.ok(counts[tier] > 0, `Stufe ${tier} wird nie vergeben`);
  }
  // Und die Einstufung darf die Masse nicht nach oben verschieben.
  assert.ok(counts.common > counts.legendary, 'Die meisten Waffen müssen gewöhnlich bleiben');

  const suma = Object.values(counts).reduce((sum, value) => sum + value, 0);
  assert.equal(suma, WEAPONS.length);
});

test('Stärkste Waffen sind auch einstufig stärker als schwache', () => {
  const sorted = [...WEAPONS].sort((a, b) => a.powerScore - b.powerScore);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  assert.ok(strongest.powerScore > weakest.powerScore);
  // Die höchste Stufe darf nicht an einer Waffe ohne jeden Schaden hängen.
  const legendary = WEAPONS.filter(weapon => weapon.powerTier === 'legendary');
  assert.ok(legendary.every(weapon => weapon.damage > 0), 'Legendäre Waffen müssen Schaden machen');
});

test('Quelldaten-Felder sind korrekt priorisiert (snake_case vor camelCase)', () => {
  // Die camelCase-Felder der Quelldatei sind überwiegend Platzhalter: Schaden
  // konstant 25, Radius/Terrain/Elementar konstant 0. Wird die Priorität
  // vertauscht, kollabiert der Katalog auf lauter identische Werte.
  const damages = new Set(WEAPONS.map(weapon => weapon.damage));
  assert.ok(
    damages.size > 5,
    `Schadenswerte sind zu uniform (${damages.size} verschiedene) — Feldpriorität prüfen`,
  );

  const radii = WEAPONS.filter(weapon => weapon.blastRadius > 0);
  assert.ok(radii.length > 20, `Zu wenige Waffen mit Flächenwirkung: ${radii.length}`);

  // Der konstante Platzhalterwert 25 darf nicht mehr dominieren.
  const atPlaceholder = WEAPONS.filter(weapon => weapon.damage === 25).length;
  assert.ok(
    atPlaceholder < WEAPONS.length,
    'Alle Waffen haben Schaden 25 — der Platzhalter wurde übernommen',
  );

  // Ein Stichprobenvergleich gegen die Rohdatei.
  const raw = JSON.parse(readFileSync(join(ROOT, 'project_armageddon_weapons_v1.json'), 'utf8'));
  const sample = raw.weapons.find(entry => entry.stats?.base_damage > 0);
  const catalogWeapon = WEAPONS_BY_ID[sample.id];
  assert.equal(
    catalogWeapon.damage, sample.stats.base_damage,
    `${sample.id}: Katalogschaden weicht vom Quelldatenwert ab`,
  );
});
