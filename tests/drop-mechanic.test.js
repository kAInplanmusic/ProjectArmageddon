import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_WIDTH, CLASS_IDS } from '../src/engine/match.js';
import { WEAPONS, FALLBACK_WEAPON_ID, orderInventoryBySubcategory } from '../src/shared/config/weapons.js';
import { PlayerInventory, MAX_WEAPONS } from '../src/engine/inventory.js';
import { CRATE_TYPES } from '../src/engine/systems/lootSystem.js';

/**
 * Abwurfmechanik.
 *
 * Zweck: Der Waffenvorrat ist begrenzt. Ist er voll, muss der Spieler eine Waffe
 * abwerfen, um eine neue aufzunehmen. Die abgeworfene Waffe bleibt mit ihrer
 * restlichen Munition als Kiste liegen und ist für alle aufhebbar.
 *
 * Geprüft wird die ganze Kette: Inventar → Abwurf → Kiste → Aufnahme.
 */

const neueWaffe = (ausschluss = new Set()) => {
  const w = WEAPONS.find(x => !ausschluss.has(x.id) && x.damage > 0 && x.maxAmmo > 1);
  assert.ok(w, 'Es muss eine geeignete Waffe geben');
  return w;
};

// ------------------------------------------------------------------- Inventar

test('Der Waffenvorrat ist begrenzt', () => {
  const inv = new PlayerInventory();
  const spieler = 1;
  const waffen = WEAPONS.filter(w => w.damage > 0).slice(0, MAX_WEAPONS + 2);
  inv.register(spieler, waffen.map(w => w.id));

  assert.equal(inv.isFull(spieler), true, `Vorrat muss bei ${MAX_WEAPONS} voll sein`);
  assert.ok(inv.droppableCount(spieler) >= MAX_WEAPONS);
});

test('Die Reservewaffe verbraucht keinen Platz', () => {
  // Sie lässt sich nicht abwerfen; würde sie mitzählen, könnte ein Spieler am
  // Limit festsitzen, ohne etwas ablegen zu können.
  const inv = new PlayerInventory();
  const spieler = 11;
  inv.register(spieler, []);

  assert.equal(inv.count(spieler), 1, 'Die Reserve ist vorhanden');
  assert.equal(inv.droppableCount(spieler), 0, 'Sie zählt aber nicht als abwerfbare Waffe');
  assert.equal(inv.isFull(spieler), false, 'Mit nur der Reserve ist der Vorrat leer');

  // Bis zum Limit auffüllen.
  const waffen = WEAPONS.filter(w => w.damage > 0).slice(0, MAX_WEAPONS);
  inv.register(spieler, waffen.map(w => w.id));
  assert.equal(inv.droppableCount(spieler), MAX_WEAPONS);
  assert.equal(inv.isFull(spieler), true);
  assert.equal(inv.count(spieler), MAX_WEAPONS + 1, 'Reserve plus gefüllter Vorrat');
});

test('removeWeapon entfernt die Waffe und meldet den Munitionsrest', () => {
  const inv = new PlayerInventory();
  const spieler = 7;
  const waffe = neueWaffe();
  inv.register(spieler, [waffe.id], { ammoPerWeapon: 4 });

  const ergebnis = inv.removeWeapon(spieler, waffe.id);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.ammo, 4, 'Der Munitionsrest muss mitkommen');
  assert.equal(inv.has(spieler, waffe.id), false, 'Die Waffe darf nicht mehr geführt werden');
});

test('Die Reservewaffe lässt sich nicht abwerfen', () => {
  // Ohne Reserve bliebe ein Match stehen, sobald alle Ladungen verbraucht sind.
  const inv = new PlayerInventory();
  const spieler = 3;
  inv.register(spieler, []);

  const ergebnis = inv.removeWeapon(spieler, FALLBACK_WEAPON_ID);
  assert.equal(ergebnis.ok, false, 'Die Reserve muss geschützt sein');
  assert.ok(ergebnis.reason.includes('Reserve'), `Grund fehlt: ${ergebnis.reason}`);
  assert.equal(inv.has(spieler, FALLBACK_WEAPON_ID), true, 'Die Reserve muss erhalten bleiben');
});

test('Eine nicht geführte Waffe lässt sich nicht abwerfen', () => {
  const inv = new PlayerInventory();
  inv.register(1, []);
  const fremd = WEAPONS.find(w => w.id !== FALLBACK_WEAPON_ID);
  const ergebnis = inv.removeWeapon(1, fremd.id);
  assert.equal(ergebnis.ok, false);
});

// ---------------------------------------------------------------------- Abwurf

test('Abwerfen legt eine aufhebbare Kiste in der Nähe ab', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = neueWaffe(new Set(match.inventory.getWeapons(spieler)));
  match.inventory.register(spieler, [waffe.id]);
  match.inventory.grantAmmo(spieler, waffe.id, 0);

  const xVorher = match.world.getComponent(spieler, 'Position', 'x');
  const yVorher = match.world.getComponent(spieler, 'Position', 'y');
  const ergebnis = match.dropWeapon(spieler, waffe.id);

  assert.equal(ergebnis.ok, true, `Abwurf abgelehnt: ${ergebnis.errors?.join(', ')}`);
  assert.ok(Number.isInteger(ergebnis.crateId), 'Eine Kiste muss entstehen');

  // Die Kiste muss existieren und den Waffentyp tragen.
  const kisten = match.getState().crates;
  const kiste = kisten.find(k => k.entityId === ergebnis.crateId);
  assert.ok(kiste, 'Die Kiste muss im Zustand auftauchen');

  // Und es muss eine Waffenkiste sein.
  assert.equal(match.world.getComponent(ergebnis.crateId, 'Crate', 'crateType'), CRATE_TYPES.weapon);

  // Die Waffe darf nicht mehr geführt werden.
  assert.equal(match.inventory.getWeapons(spieler).includes(waffe.id), false);

  // Die Kiste wird GESCHLEUDERT: sie startet beim Werfer, aber mit einer
  // Geschwindigkeit nach oben und zur Seite. Ohne diese Prüfung wäre ein
  // Ablegen an Ort und Stelle unbemerkt möglich.
  assert.ok(Math.abs(ergebnis.vx) > 0.3, `Kein seitlicher Wurf: vx=${ergebnis.vx}`);
  assert.ok(ergebnis.vy < -2, `Kein Wurf nach oben: vy=${ergebnis.vy}`);
  assert.equal(xVorher !== null && yVorher !== null, true);
  assert.equal(match.world.getComponent(ergebnis.crateId, 'Crate', 'inFlight'), 1,
    'Die Kiste muss als fliegend markiert sein');
});

test('Die abgeworfene Waffe LANDET außerhalb des Aufhebe-Radius', () => {
  // Geprüft wird die Landestelle, nicht der Abwurfpunkt: Die Kiste wird
  // geschleudert, liegt also erst nach dem Flug. Wäre sie zu nah am Werfer,
  // würde er seine eigene Waffe sofort wieder einsammeln — die Handlung wäre
  // wirkungslos.
  const match = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
  match.inventory.register(spieler, [waffe.id]);

  const px = match.world.getComponent(spieler, 'Position', 'x');
  const py = match.world.getComponent(spieler, 'Position', 'y');
  const ergebnis = match.dropWeapon(spieler, waffe.id);
  assert.equal(ergebnis.ok, true);

  // Landen lassen.
  let gelandet = false;
  for (let i = 0; i < 600; i++) {
    match.step();
    if (match.consumeEvents().some(e => e.type === 'crate_landed' && e.payload.crateId === ergebnis.crateId)) {
      gelandet = true;
      break;
    }
  }
  assert.equal(gelandet, true, 'Die Kiste muss landen');

  const lx = match.world.getComponent(ergebnis.crateId, 'Position', 'x');
  const ly = match.world.getComponent(ergebnis.crateId, 'Position', 'y');
  const abstand = Math.hypot(lx - px, ly - py);

  // Der Aufhebe-Radius im LootSystem beträgt 18 px.
  assert.ok(abstand > 18,
    `Die Kiste landet im Aufhebe-Radius (${abstand.toFixed(1)} px) — sofortiges Wiederaufheben`);
});

test('Die Kiste landet auf festem Boden innerhalb der Karte', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 2, turnDurationMs: 100_000 });
  match.start();

  for (const spieler of match.players.map(p => p.entityId)) {
    if (!match.world.isActive(spieler)) continue;
    const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1 && !match.inventory.has(spieler, w.id));
    if (!waffe) continue;
    match.inventory.register(spieler, [waffe.id]);

    const ergebnis = match.dropWeapon(spieler, waffe.id);
    assert.equal(ergebnis.ok, true, `Abwurf für ${spieler} abgelehnt`);

    // Fliegen lassen, bis sie liegt.
    for (let i = 0; i < 600; i++) {
      match.step();
      if (match.consumeEvents().some(e => e.type === 'crate_landed' && e.payload.crateId === ergebnis.crateId)) break;
    }

    const x = match.world.getComponent(ergebnis.crateId, 'Position', 'x');
    const y = match.world.getComponent(ergebnis.crateId, 'Position', 'y');
    assert.ok(x >= 0 && x <= MAP_WIDTH, `Kiste außerhalb der Karte: x=${x}`);

    // Liegt sie auf festem Grund?
    const boden = match.surfaceYAt(Math.round(x));
    assert.ok(boden > 0, `Kein Boden unter der Kiste bei x=${x}`);
    assert.ok(Math.abs(y - boden) < 3,
      `Kiste schwebt oder steckt: y=${y}, Boden=${boden}`);
  }
});

test('Die Munition reist mit der abgeworfenen Waffe', () => {
  // Abwerfen und Aufheben darf kein Munitionstrick sein.
  const match = new MatchController({ seed: 5150, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.maxAmmo > 2 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);
  // Auf einen klaren Restwert setzen.
  while (match.inventory.getAmmo(spieler, waffe.id) > 2) {
    match.inventory.consume(spieler, waffe.id, 1);
  }
  const rest = match.inventory.getAmmo(spieler, waffe.id);
  assert.equal(rest, 2, 'Testannahme: zwei Ladungen übrig');

  const ergebnis = match.dropWeapon(spieler, waffe.id);
  assert.equal(ergebnis.ammo, rest, 'Der Munitionsrest muss im Ergebnis stehen');
  assert.equal(match.world.getComponent(ergebnis.crateId, 'Crate', 'ammo'), rest,
    'Die Kiste muss den Munitionsrest tragen');
});

test('Aufheben einer abgeworfenen Waffe stellt genau den Vorrat wieder her', () => {
  const match = new MatchController({ seed: 777, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.maxAmmo > 3 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);
  while (match.inventory.getAmmo(spieler, waffe.id) > 1) match.inventory.consume(spieler, waffe.id, 1);
  const rest = match.inventory.getAmmo(spieler, waffe.id);

  const ergebnis = match.dropWeapon(spieler, waffe.id);
  assert.equal(ergebnis.ok, true);

  // Direkt aufnehmen, ohne den Umweg über den Simulationsschritt: genau das tut
  // das LootSystem, wenn ein Spieler in Reichweite kommt.
  match.inventory.grantWeapon(spieler, waffe.id, { ammo: ergebnis.ammo });
  assert.equal(match.inventory.getAmmo(spieler, waffe.id), rest,
    'Nach dem Aufheben muss der Vorrat dem beim Abwerfen entsprechen');
  assert.ok(rest < waffe.maxAmmo, 'Testannahme: der Vorrat war nicht voll');
});

test('Eine Abwurfkiste meldet sich als Ereignis', () => {
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  match.consumeEvents();

  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
  match.inventory.register(spieler, [waffe.id]);
  match.dropWeapon(spieler, waffe.id);

  const ereignisse = match.consumeEvents();
  const abwurf = ereignisse.find(e => e.type === 'weapon_dropped');
  assert.ok(abwurf, `Ereignis fehlt: ${ereignisse.map(e => e.type).join(', ')}`);
  assert.equal(abwurf.payload.weaponId, waffe.id);
  assert.ok(Number.isInteger(abwurf.payload.crateId));
});

test('Abwerfen setzt die Nachladezeit der Waffe zurück', () => {
  // Die Pause gehört zur Waffe in der Hand; liegt sie am Boden, ist sie weg.
  const match = new MatchController({ seed: 606, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.cooldown > 0 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);
  match.fire(spieler, 0, 50, waffe.id);
  assert.ok(match.cooldownFor(spieler, waffe.id) > 0, 'Testannahme: Nachladezeit läuft');

  match.dropWeapon(spieler, waffe.id);
  assert.equal(match.cooldownFor(spieler, waffe.id), 0,
    'Nach dem Abwerfen darf keine Nachladezeit mehr bestehen');
});

test('Abwerfen ist deterministisch', () => {
  // Zwei identische Matches müssen dieselbe Landestelle ergeben.
  const lauf = () => {
    const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
    match.start();
    const spieler = match.activePlayerId;
    const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
    match.inventory.register(spieler, [waffe.id]);
    const e = match.dropWeapon(spieler, waffe.id);
    return { x: e.x, y: e.y, crateId: e.crateId };
  };
  assert.deepEqual(lauf(), lauf(), 'Gleicher Seed muss dieselbe Landestelle ergeben');
});

// ------------------------------------------------------------------- Fehlerfälle

test('Abwerfen im falschen Zustand wird abgelehnt', () => {
  const match = new MatchController({ seed: 1, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);

  // Unbekannte Waffe.
  let e = match.dropWeapon(spieler, 'gibt_es_nicht');
  assert.equal(e.ok, false);
  assert.ok(e.errors.some(f => f.includes('Unbekannte')));

  // Nicht geführte Waffe.
  const fremd = WEAPONS.find(w => w.id !== waffe.id && w.damage > 0);
  e = match.dropWeapon(spieler, fremd.id);
  assert.equal(e.ok, false);

  // Nach Spielende.
  match.endMatch?.();
  match.forceEnd?.(0);
});

test('Die Reserve ist auch über den Match nicht abwerfbar', () => {
  const match = new MatchController({ seed: 88, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const ergebnis = match.dropWeapon(spieler, FALLBACK_WEAPON_ID);
  assert.equal(ergebnis.ok, false, 'Die Reserve darf nicht abwerfbar sein');
  assert.equal(match.inventory.has(spieler, FALLBACK_WEAPON_ID), true);
});

// --------------------------------------------------------- Voll und Aufnahme

test('Bei vollem Vorrat wird eine Waffenkiste nicht aufgenommen', () => {
  // Automatisches Überschreiben wäre Datenverlust ohne Rückfrage.
  const match = new MatchController({ seed: 1212, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  // Vorrat füllen.
  const fueller = WEAPONS.filter(w => w.damage > 0).map(w => w.id);
  match.inventory.register(spieler, fueller);
  assert.equal(match.inventory.isFull(spieler), true, 'Testannahme: Vorrat voll');

  const vorher = match.inventory.droppableCount(spieler);
  // Irgendeine noch nicht geführte Waffe genügt — sie muss nur in einer
  // Waffenkiste liegen können.
  const neue = WEAPONS.find(w => !match.inventory.has(spieler, w.id));
  assert.ok(neue, 'Es muss eine noch nicht geführte Waffe geben');

  // Kiste direkt neben den Spieler legen.
  const px = match.world.getComponent(spieler, 'Position', 'x');
  const py = match.world.getComponent(spieler, 'Position', 'y');
  const kiste = match.world.createEntity();
  match.world.addComponent(kiste, 'Position', { x: px, y: py });
  match.world.addComponent(kiste, 'Crate', {
    crateType: CRATE_TYPES.weapon,
    crateX: px,
    crateY: py,
    rarity: 0,
    weaponId: neue.index,
    picked: 0,
    ammo: 0,
  });

  match.step();
  const ereignisse = match.consumeEvents();

  assert.equal(match.inventory.droppableCount(spieler), vorher,
    'Der Vorrat darf sich nicht ändern');
  assert.ok(ereignisse.some(e => e.type === 'crate_pickup_blocked'),
    `Es muss ein blockiertes Aufheben gemeldet werden: ${ereignisse.map(e => e.type).join(', ')}`);

  // Die Kiste muss liegen bleiben.
  assert.ok(match.getState().crates.some(k => k.entityId === kiste),
    'Die Kiste darf nicht verschwinden');
});

test('Nach einem Abwurf ist wieder Platz für eine neue Waffe', () => {
  // Der vollständige Ablauf: voll → abwerfen → aufnehmen.
  const match = new MatchController({ seed: 31415, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  // Genau bis zur Obergrenze füllen: nur so ist der Abwurf der Schritt, der
  // wieder Platz schafft. Mit allen 150 Waffen bliebe der Vorrat auch nach dem
  // Abwurf einer einzelnen Waffe überfüllt.
  const genauVoll = WEAPONS.filter(w => w.damage > 0).slice(0, MAX_WEAPONS).map(w => w.id);
  match.inventory.register(spieler, genauVoll);
  assert.equal(match.inventory.droppableCount(spieler), MAX_WEAPONS, 'Genau voll erwartet');
  assert.equal(match.inventory.isFull(spieler), true);

  // Keine Reservewaffe wählen: die ist bewusst geschützt.
  const abgeworfen = match.inventory.getWeapons(spieler).find(id => id !== FALLBACK_WEAPON_ID);
  assert.ok(abgeworfen, 'Es muss eine abwerfbare Waffe geben');
  const abwurf = match.dropWeapon(spieler, abgeworfen);
  assert.equal(abwurf.ok, true, `Abwurf abgelehnt: ${abwurf.errors?.join(', ')}`);

  assert.equal(match.inventory.isFull(spieler), false, 'Nach dem Abwurf muss Platz sein');
});

// ------------------------------------------------- Reserve und Anzeigereihenfolge

test('Die Reservewaffe steht in der Anzeige zuletzt — bei jeder Klasse', () => {
  /*
   * Fund (belegt): Die Reservewaffe ist die einzige, die sich nicht abwerfen
   * lässt. Ihre Stellung in der Anzeige ergab sich allein aus ihrer Kategorie
   * (`guns`) und war damit ein Nebeneffekt: Bei der Klasse `heavy` stand sie auf
   * Anzeigeposition 1, bei scout auf 4, bei artillery auf 3.
   *
   * Folge in `heavy`: Der erste Listeneintrag war nicht abwerfbar, und die
   * Zifferntaste „1" wählte die Reserve — genau der Bedienfehler, den
   * `PlayerInventory` für die aktive Waffe bereits ausschließt.
   *
   * Deshalb jetzt die Regel: Reserve immer zuletzt, bei JEDER Klasse.
   */
  for (const teams of [2, 3]) {
    const match = new MatchController({ seed: 4242, teams, playersPerTeam: 3 });
    match.start();
    const gesehen = new Set();

    for (const spieler of match.players) {
      const klasse = CLASS_IDS[spieler.classId];
      const inventar = match.inventory.getWeapons(spieler.entityId);
      const reihenfolge = orderInventoryBySubcategory(inventar);

      assert.ok(inventar.includes(FALLBACK_WEAPON_ID),
        `${klasse}: Keine Reservewaffe im Inventar`);

      const position = reihenfolge.indexOf(inventar.indexOf(FALLBACK_WEAPON_ID));
      assert.equal(position, reihenfolge.length - 1,
        `${klasse}: Reserve steht auf Anzeigeposition ${position + 1} von ${reihenfolge.length}`);
      gesehen.add(klasse);

      // Und die wichtigere Aussage: Die erste Zeile IST abwerfbar.
      const ersteWahl = inventar[reihenfolge[0]];
      assert.notEqual(ersteWahl, FALLBACK_WEAPON_ID,
        `${klasse}: Die erste Waffe der Liste ist die un-abwerfbare Reserve`);
      assert.equal(match.inventory.isUnlimited(spieler.entityId, ersteWahl), false,
        `${klasse}: Die erste Waffe der Liste ist unbegrenzt — sie muss abwerfbar sein`);
    }

    assert.equal(gesehen.size, 3, 'Es müssen alle drei Klassen geprüft werden');
  }
});

test('Der Abwurf über die Anzeigeposition trifft eine abwerfbare Waffe', () => {
  // Der Weg, den die Zifferntasten und die Q-Taste nehmen: Anzeigeposition →
  // Inventarindex → Waffe. Er darf nie auf der Reserve landen.
  // `heavy` ist der kritische Fall (Reserve stand dort auf Position 1), geprüft
  // wird er für alle Klassen — je Klasse ein frisches Match, damit der Abwurf
  // sauber bleibt.
  for (const klasse of CLASS_IDS) {
    const frisch = new MatchController({ seed: 4242, teams: 3, playersPerTeam: 1 });
    frisch.start();
    const spieler = frisch.players.find(p => CLASS_IDS[p.classId] === klasse);
    const inventar = frisch.inventory.getWeapons(spieler.entityId);
    const reihenfolge = orderInventoryBySubcategory(inventar);
    const waffe = inventar[reihenfolge[0]];

    const ergebnis = frisch.dropWeapon(spieler.entityId, waffe);
    assert.equal(ergebnis.ok, true,
      `${klasse}: Die erste Anzeigeposition ließ sich nicht abwerfen: ${ergebnis.errors?.join(', ')}`);
    assert.ok(ergebnis.ammo !== undefined, `${klasse}: Kein Munitionsstand gemeldet`);
  }
});
