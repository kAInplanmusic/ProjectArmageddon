/**
 * Tests: Anzeigenamen der 150 Waffen (Auftrag „Namen optimieren", 2026-10-28).
 *
 * Gesichert werden die Regeln, die bei der Namensdurchsicht gelten (Befund und Maßnahmen:
 * `docs/audit-waffen-2026-10-28.md`):
 *
 *  - Namen sind eindeutig und kollidieren nicht mit den Malus-Bezeichnungen (Brand, Gift, ...).
 *  - Deutsche Namen, keine Anglizismen aus der Designdatei (Blaster, Jetpack, Turret, ...).
 *  - Zusammensetzungen ohne Bindestrich (Ausnahme: Eigenname „Tesla-Turm").
 *  - Die Namen passen in die Kachel des Waffenmenüs (`.wm-opt`: 112 px Mindestbreite, Name 12,5 px,
 *    zwei Zeilen, kein Umbruch im Wort): kein Wort über 17 Zeichen, insgesamt höchstens 24.
 *  - `id` und `internalName` bleiben stabil (Loadouts, Tests und Assets hängen daran).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { MALUS } from '../src/shared/config/schaden.js';

const MAX_WORT = 17;
const MAX_GESAMT = 24;
const BINDESTRICH_ERLAUBT = new Set(['Tesla-Turm']);
const ANGLIZISMEN = /blaster|gauntlet|cyber|jetpack|grappling|\bhook\b|turret|infinity|\bloop\b|punch|\bpower\b|\bvoid\b|minigun|\bmk\b|portal-|plasma-/i;

test('Anzeigenamen sind eindeutig und kollidieren nicht mit Malus-Namen', () => {
  const gesehen = new Map();
  for (const w of WEAPONS) {
    const schluessel = w.displayName.toLocaleLowerCase('de');
    assert.ok(!gesehen.has(schluessel), `${w.id} und ${gesehen.get(schluessel)} heißen beide "${w.displayName}"`);
    gesehen.set(schluessel, w.id);
  }
  const malusNamen = new Set(Object.values(MALUS).map(m => m.label.toLocaleLowerCase('de')));
  for (const w of WEAPONS) {
    assert.ok(!malusNamen.has(w.displayName.toLocaleLowerCase('de')),
      `${w.id} "${w.displayName}" heißt wie ein Malus`);
  }
});

test('Anzeigenamen sind deutsch: keine Anglizismen, kein Mk, kein „Magisch…"-Muster', () => {
  for (const w of WEAPONS) {
    assert.doesNotMatch(w.displayName, ANGLIZISMEN, `${w.id} "${w.displayName}": Anglizismus`);
    assert.doesNotMatch(w.displayName, /^Magisch/, `${w.id} "${w.displayName}": „Magisch…" sagt nichts (Zauber…/Arkan…)`);
    assert.doesNotMatch(w.displayName, / \/ /, `${w.id} "${w.displayName}": ein Name, kein Schrägstrich`);
  }
});

test('Zusammensetzungen stehen in einem Wort (nur Eigennamen haben einen Bindestrich)', () => {
  for (const w of WEAPONS) {
    if (!w.displayName.includes('-')) continue;
    assert.ok(BINDESTRICH_ERLAUBT.has(w.displayName),
      `${w.id} "${w.displayName}": Bindestrich nur für Eigennamen (${[...BINDESTRICH_ERLAUBT].join(', ')})`);
  }
});

test('Anzeigenamen passen in die Kachel des Waffenmenüs', () => {
  for (const w of WEAPONS) {
    assert.ok(w.displayName.length <= MAX_GESAMT,
      `${w.id} "${w.displayName}": ${w.displayName.length} Zeichen, höchstens ${MAX_GESAMT}`);
    for (const wort of w.displayName.split(/[ -]/)) {
      assert.ok(wort.length <= MAX_WORT,
        `${w.id} "${w.displayName}": Wort "${wort}" hat ${wort.length} Zeichen, höchstens ${MAX_WORT} (kein Umbruch im Wort)`);
    }
    assert.equal(w.displayName, w.displayName.trim(), `${w.id}: Leerraum am Rand`);
  }
});

test('id, Index und internalName bleiben stabil (Stichproben der umbenannten Waffen)', () => {
  const erwartet = {
    pa_022: ['Plasmawerfer', 'plasma_blaster'],
    pa_111: ['Enterhaken', 'grappling_hook'],
    pa_124: ['Wachgeschütz', 'auto_turret'],
    pa_147: ['Weltendrache', 'welten_drache'],
  };
  for (const [id, [name, intern]] of Object.entries(erwartet)) {
    const w = WEAPONS.find(x => x.id === id);
    assert.ok(w, `${id} fehlt`);
    assert.equal(w.displayName, name);
    assert.equal(w.index, Number(id.slice(3)), `${id}: Index verschoben`);
    assert.equal(w.internalName, intern, `${id}: internalName darf sich nicht ändern`);
  }
});
