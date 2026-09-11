import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  computePowerScore,
  tierForScore,
  POWER_TIERS,
  gravityScaleFor,
  resolveDamage,
  GRAVITY_REFERENCE,
} from '../scripts/build-weapon-catalog.mjs';
import { DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';

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


// ---------------------------------------------------------------- Gravitation

test('Gravitation wird normalisiert, nicht als Multiplikator übernommen', () => {
  // Der teuerste Datenfehler dieses Projekts: Die Quelldatei nennt für 26 Waffen
  // einen `gravity`-Wert zwischen 62 und 92. Wird er direkt als Multiplikator
  // verwendet, steigt die Fallbeschleunigung auf das 65-fache (20,8 statt 0,32
  // px/Tick²) — das Geschoss schlägt im nächsten Tick auf dem Boden auf und die
  // Waffe ist wirkungslos. Genau das traf 19 der schweren Waffen.
  const grenze = DEFAULT_PROJECTILE_GRAVITY * 3;

  for (const weapon of WEAPONS) {
    const effektiv = DEFAULT_PROJECTILE_GRAVITY * weapon.gravityScale;
    assert.ok(
      effektiv <= grenze,
      `${weapon.id} (${weapon.displayName}): Fallbeschleunigung ${effektiv.toFixed(2)} `
      + `überschreitet das Dreifache der Engine-Gravitation`,
    );
    assert.ok(effektiv > 0, `${weapon.id}: Fallbeschleunigung muss positiv sein`);
  }

  // Die Werte müssen im plausiblen Bereich liegen, nicht bei 1 festgenagelt sein.
  // Hinweis zur Anzahl: Von den 26 Waffen mit `gravity`-Feld haben 19 exakt den
  // Bezugswert 65 und ergeben deshalb genau 1,0 — abweichend sind nur die
  // übrigen 7. Eine größere Zahl wäre hier eine falsche Erwartung.
  const abweichend = WEAPONS.filter(weapon => weapon.gravityScale !== 1);
  assert.ok(abweichend.length >= 5,
    `Es muss Waffen mit abweichender Gravitation geben: ${abweichend.length}`);
  const werte = abweichend.map(w => w.gravityScale).sort((a, b) => a - b);
  assert.ok(werte[0] >= 0.9, `Kleinster Wert zu klein: ${werte[0]}`);
  assert.ok(werte[werte.length - 1] <= 1.5, `Größter Wert zu groß: ${werte[werte.length - 1]}`);
  // Beide Richtungen müssen vorkommen, sonst wäre die Normalisierung verschoben.
  assert.ok(werte.some(w => w < 1), 'Es muss leichtere Waffen geben (< 1)');
  assert.ok(werte.some(w => w > 1), 'Es muss schwerere Waffen geben (> 1)');
});

test('gravityScaleFor rechnet korrekt und sichert gegen Ausreißer ab', () => {
  // Der Bezugswert ist der Modalwert der Quelldaten.
  assert.equal(GRAVITY_REFERENCE, 65);
  assert.equal(gravityScaleFor({ gravity: 65 }), 1, 'Der Bezugswert ergibt genau 1');
  assert.equal(gravityScaleFor({}), 1, 'Unbestimmt ergibt 1 (normale Gravitation)');
  assert.equal(gravityScaleFor({ gravity: 0 }), 1, 'Null gilt als unbestimmt');
  assert.equal(gravityScaleFor({ gravity: -5 }), 1, 'Negative Werte gelten als unbestimmt');

  // Abweichungen werden proportional abgebildet.
  assert.ok(Math.abs(gravityScaleFor({ gravity: 130 }) - 2) < 1e-6);
  assert.ok(gravityScaleFor({ gravity: 92 }) > 1, 'Schwerere Waffe fällt stärker');
  assert.ok(gravityScaleFor({ gravity: 62 }) < 1, 'Leichtere Waffe fällt schwächer');

  // Fehlerhafte Quelldaten dürfen die Simulation nicht unspielbar machen.
  assert.ok(gravityScaleFor({ gravity: 100000 }) <= 3, 'Obergrenze greift');
  assert.ok(gravityScaleFor({ gravity: 1 }) >= 0.2, 'Untergrenze greift');
});

// -------------------------------------------------------------- Schadenswerte

test('Die Herkunft des Schadenswerts ist nachvollziehbar', () => {
  // 52 Waffen haben in der Quelldatei keinen `base_damage` und tragen deshalb
  // den Platzhalter aus camelCase. Das ist ein Datenmangel — er darf nicht als
  // Designdaten erscheinen.
  // Die Herkunft hat drei Stufen: echter Designwert, aus der Kategorie
  // abgeleiteter Wert, und gar kein Schaden (reine Nutzwaffe).
  const nachHerkunft = { source: 0, derived: 0, none: 0 };
  for (const weapon of WEAPONS) {
    assert.ok(
      ['source', 'derived', 'none'].includes(weapon.damageSource),
      `${weapon.id}: unbekannte Herkunft ${weapon.damageSource}`,
    );
    nachHerkunft[weapon.damageSource] += 1;
  }

  assert.equal(nachHerkunft.source + nachHerkunft.derived + nachHerkunft.none, WEAPONS.length);
  assert.ok(nachHerkunft.source > 80, `Zu wenige Waffen mit echtem Designwert: ${nachHerkunft.source}`);
  // 48 Waffen hatten in der Quelldatei keinen Designwert und bekamen einen
  // abgeleiteten — vorher trugen sie alle den Einheitswert 25.
  assert.ok(nachHerkunft.derived >= 40, `Zu wenige abgeleitete Werte: ${nachHerkunft.derived}`);
  assert.ok(nachHerkunft.none > 0, 'Es gibt Nutzwaffen ganz ohne Schadenswert');
});

test('resolveDamage bevorzugt den Quelldatenwert vor dem Platzhalter', () => {
  // Echter Wert vorhanden: er gewinnt, auch wenn der Platzhalter abweicht.
  assert.deepEqual(resolveDamage({ baseDamage: 25, base_damage: 42 }), {
    damage: 42, damageSource: 'source',
  });
  // Nur der Platzhalter: wird übernommen, aber als solcher gekennzeichnet.
  assert.deepEqual(resolveDamage({ baseDamage: 25 }), {
    damage: 25, damageSource: 'placeholder',
  });
  // Kein Wert: keine Wirkung.
  assert.deepEqual(resolveDamage({}), { damage: 0, damageSource: 'none' });
  assert.deepEqual(resolveDamage({ baseDamage: 0 }), { damage: 0, damageSource: 'none' });
});

test('Der Katalog kennzeichnet abgeleitete Werte, statt sie zu verstecken', () => {
  // Waffen ohne Designwert tragen einen aus der Kategorie abgeleiteten Schaden.
  // Vorher war es ein Einheitswert von 25 für alle — der ließ sich nicht von
  // einem Designwert unterscheiden.
  const abgeleitet = WEAPONS.filter(weapon => weapon.damageSource === 'derived');
  assert.ok(abgeleitet.length >= 40, `Zu wenige abgeleitete Werte: ${abgeleitet.length}`);

  // Und keine Waffe darf einen Schaden ohne Herkunft tragen.
  const widerspruch = WEAPONS.filter(w => w.damage > 0 && w.damageSource === 'none');
  assert.deepEqual(widerspruch.map(w => w.id), [],
    'Schaden ohne Herkunft wäre ein Widerspruch');

  // Umgekehrt: „none" heißt auch wirklich kein Schaden.
  const ohneSchaden = WEAPONS.filter(w => w.damageSource === 'none' && w.damage > 0);
  assert.deepEqual(ohneSchaden.map(w => w.id), []);
});
