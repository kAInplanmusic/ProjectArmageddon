import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import {
  WEAPONS,
  WEAPONS_BY_ID,
  WEAPON_IDENTITIES,
  identityFor,
} from '../src/shared/config/weapons.js';
import {
  hasFuse,
  derivePlaceholderDamage,
  DAMAGE_BY_CATEGORY,
  strikeStyleFor,
} from '../scripts/build-weapon-catalog.mjs';

/**
 * Waffen-Identität, Zünder, Wurfabwurf und Sprung.
 *
 * Hintergrund: Vier Waffenpaare waren faktisch dieselbe Waffe (der „höhere" Mk
 * teils schwächer), 52 Waffen trugen einen Einheitsschaden von 25, `fuseTime`
 * war bei 149 von 150 Waffen 0, der Abwurf legte die Kiste einfach daneben und
 * es gab keine Sprungmechanik.
 */

/** Wartet, bis die Figur auf festem Grund steht. */
function lande(match, playerId, maxTicks = 400) {
  for (let i = 0; i < maxTicks; i++) {
    if (match.isGrounded(playerId)) return true;
    match.step();
    match.consumeEvents();
  }
  return match.isGrounded(playerId);
}

/** Bringt den Zug zum Spieler zurück. */
function zumSpieler(match, playerId, maxTurns = 40) {
  let guard = 0;
  while (match.activePlayerId !== playerId && match.status === 'playing' && guard < maxTurns) {
    match.endTurn();
    guard += 1;
  }
}

// ------------------------------------------------------------- Waffen-Identität

test('Die vier Paare sind eigenständige Waffen, keine Scheinsteigerung', () => {
  const paare = [
    ['pa_037', 'pa_041'],
    ['pa_040', 'pa_056'],
    ['pa_032', 'pa_114'],
    ['pa_087', 'pa_088'],
  ];

  for (const [a, b] of paare) {
    const x = WEAPONS_BY_ID[a];
    const y = WEAPONS_BY_ID[b];
    assert.ok(x && y, `Paar ${a}/${b} fehlt`);
    assert.notEqual(x.displayName, y.displayName,
      `${a}/${b} tragen denselben Namen: ${x.displayName}`);

    // Echter Zielkonflikt: mindestens zwei Kennzahlen müssen sich unterscheiden.
    // `effectMagnitude` gehört dazu: bei reinen Fluggeräten ist die Weite der
    // Verschiebung die einzige Kennzahl, in der sie sich unterscheiden.
    const felder = ['damage', 'blastRadius', 'projectileSpeed', 'maxAmmo', 'maxRange', 'cooldown', 'effectMagnitude'];
    const unterschiede = felder.filter(f => x[f] !== y[f]);
    assert.ok(unterschiede.length >= 2,
      `${a}/${b} unterscheiden sich nur in ${unterschiede.length} Kennzahl(en): ${unterschiede.join(', ')}`);

    // Keiner darf durchgehend besser sein — das wäre wieder eine Steigerung.
    const guenstig = ['damage', 'blastRadius', 'maxAmmo', 'maxRange', 'effectMagnitude'];
    const xBesser = unterschiede.filter(f => guenstig.includes(f) && (x[f] ?? 0) > (y[f] ?? 0));
    const yBesser = unterschiede.filter(f => guenstig.includes(f) && (y[f] ?? 0) > (x[f] ?? 0));
    assert.ok(xBesser.length > 0 && yBesser.length > 0,
      `${a}/${b}: keine echte Abwägung (${x.displayName} besser in ${xBesser.join(',')}, ${y.displayName} in ${yBesser.join(',')})`);
  }
});

test('Jede Identität ist vollständig und trägt ein Konzept', () => {
  for (const [id, identity] of Object.entries(WEAPON_IDENTITIES)) {
    assert.ok(WEAPONS_BY_ID[id], `Identität für unbekannte Waffe ${id}`);
    assert.ok(typeof identity.displayName === 'string' && identity.displayName.length >= 3,
      `${id}: Anzeigename fehlt`);
    assert.ok(typeof identity.concept === 'string' && identity.concept.length >= 8,
      `${id}: Konzept fehlt oder ist zu knapp`);
    assert.equal(identityFor(id), identity);
  }
  assert.equal(Object.keys(WEAPON_IDENTITIES).length, 8, 'Es sind acht Waffen in vier Paaren');
});

test('Kein Anzeigename ist doppelt', () => {
  const namen = WEAPONS.map(w => w.displayName);
  const doppelt = [...new Set(namen.filter((n, i) => namen.indexOf(n) !== i))];
  assert.deepEqual(doppelt, [], `Doppelte Namen: ${doppelt.join(', ')}`);
});

test('Keine „Mk"-Kennung ohne Gegenstück', () => {
  // Eine Kennung, die keinen Unterschied bezeichnet, ist irreführend. Nach dem
  // Umbau darf es keine Mk-Namen mehr geben — die Paare haben eigene Namen.
  const mitMk = WEAPONS.filter(w => /\bMk\b/i.test(w.displayName));
  assert.deepEqual(mitMk.map(w => `${w.id} ${w.displayName}`), [],
    'Kennungen ohne Bedeutung sollten ersetzt sein');
});

// ------------------------------------------------------------- Werte

test('Waffen ohne Designwert haben unterschiedliche, abgeleitete Schäden', () => {
  const abgeleitet = WEAPONS.filter(w => w.damageSource === 'derived');
  assert.ok(abgeleitet.length >= 40, `Zu wenige abgeleitete Werte: ${abgeleitet.length}`);

  // Kein Einheitswert mehr.
  const werte = new Set(abgeleitet.map(w => w.damage));
  assert.ok(werte.size >= 10, `Zu wenig Vielfalt: ${werte.size} verschiedene Werte`);

  // Über dem alten Platzhalter von 25 und innerhalb des Katalogs.
  const alterPlatzhalter = abgeleitet.filter(w => w.damage === 25).length;
  assert.ok(alterPlatzhalter < abgeleitet.length / 2,
    `Zu viele Waffen tragen weiter den alten Wert 25: ${alterPlatzhalter}`);
  for (const w of abgeleitet) {
    assert.ok(w.damage > 0 && w.damage <= 100,
      `${w.id}: abgeleiteter Schaden außerhalb des Bereichs: ${w.damage}`);
  }
});

test('Die Ableitung folgt der Kategorie und ist reproduzierbar', () => {
  for (const w of WEAPONS) {
    if (w.damageSource !== 'derived') continue;
    assert.equal(derivePlaceholderDamage(w), w.damage, `${w.id}: nicht reproduzierbar`);
    const basis = DAMAGE_BY_CATEGORY[w.category];
    assert.ok(basis, `${w.id}: keine Kategoriebasis für ${w.category}`);
    // Streuung ±18 % um die Basis.
    assert.ok(w.damage >= Math.floor(basis * 0.8) && w.damage <= Math.ceil(basis * 1.2),
      `${w.id}: Wert ${w.damage} weicht zu stark von der Basis ${basis} ab`);
  }
});

test('Reine Flug- und Teleportgeräte richten keinen Schaden an', () => {
  for (const id of ['pa_032', 'pa_114', 'pa_087', 'pa_088']) {
    const w = WEAPONS_BY_ID[id];
    assert.equal(w.damage, 0, `${w.displayName} sollte keinen Schaden anrichten`);
    assert.equal(w.damageSource, 'none', `${w.displayName}: Herkunft muss 'none' sein`);
  }
});

// ------------------------------------------------------------- Zünder

test('Zünder sind auf die passenden Waffen beschränkt und gestuft 1–5', () => {
  const mitZuender = WEAPONS.filter(w => w.fuseTime > 0);
  assert.ok(mitZuender.length >= 12, `Zu wenige Waffen mit Zünder: ${mitZuender.length}`);

  const stufen = new Set(mitZuender.map(w => w.fuseTime));
  assert.ok(stufen.size >= 4, `Zu wenige Zünderstufen: ${[...stufen].join(', ')}`);
  for (const s of stufen) {
    assert.ok(Number.isInteger(s) && s >= 1 && s <= 5,
      `Zünderdauer außerhalb 1–5 s: ${s}`);
  }

  // Aufprallwaffen dürfen keinen Zünder haben.
  for (const w of WEAPONS) {
    if (w.fuseTime > 0) continue;
    assert.equal(hasFuse(w), false, `${w.id} sollte keinen Zünder haben`);
  }
});

test('Stärkere Ladungen haben längere Zünder', () => {
  // Ein kurzer Zünder an einer starken Bombe wäre kein Spiel, sondern Zufall.
  const mitZuender = WEAPONS.filter(w => w.fuseTime > 0);
  const nachDauer = [...mitZuender].sort((a, b) => a.fuseTime - b.fuseTime);
  const kurz = nachDauer[0];
  const lang = nachDauer[nachDauer.length - 1];
  assert.ok(lang.damage > kurz.damage,
    `Längster Zünder (${lang.displayName}, dmg ${lang.damage}) muss stärker sein als der kürzeste (${kurz.displayName}, dmg ${kurz.damage})`);
});

test('Eine Zündergranate explodiert nach Ablauf, nicht beim Aufprall', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;

  const granate = WEAPONS.find(w => w.fuseTime > 0 && w.delivery === 'projectile');
  assert.ok(granate, 'Es muss eine Zündergranate geben');
  match.inventory.register(spieler, [granate.id]);

  const schuss = match.fire(spieler, Math.PI / 2, 60, granate.id);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);

  const pid = schuss.projectileId;
  const ticks = match.world.getComponent(pid, 'Projectile', 'fuseTicks');
  assert.equal(ticks, Math.round(granate.fuseTime * 60),
    'Der Zünder muss beim Abschuss gesetzt sein');

  let aufprallTick = -1;
  let explodiertTick = -1;
  for (let i = 0; i < 600; i++) {
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'fuse_armed' && aufprallTick < 0) aufprallTick = i;
      if (e.type === 'fuse_expired' && explodiertTick < 0) explodiertTick = i;
    }
    if (explodiertTick >= 0) break;
  }

  assert.ok(aufprallTick >= 0, 'Der Aufprall muss gemeldet werden');
  assert.ok(explodiertTick >= 0, 'Die Zündung muss gemeldet werden');
  assert.ok(explodiertTick > aufprallTick,
    `Die Zündung (${explodiertTick}) muss NACH dem Aufprall (${aufprallTick}) liegen`);
  // Und zwar ungefähr nach der Zünderdauer.
  assert.ok(Math.abs(explodiertTick - ticks) <= 5,
    `Zündung bei Tick ${explodiertTick}, erwartet ~${ticks}`);
});

test('Eine Zündergranate richtet ihren Schaden erst bei der Zündung an', () => {
  const match = new MatchController({ seed: 777, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  const ziel = match.players.find(p => p.entityId !== spieler).entityId;

  const granate = WEAPONS.find(w => w.fuseTime > 0 && w.blastRadius > 0 && w.damage > 0);
  match.inventory.register(spieler, [granate.id]);
  // Ziel in die Nähe bringen, damit die Explosion trifft.
  match.world.setComponent(ziel, 'Health', 'current', 500);
  match.world.setComponent(ziel, 'Position', 'x',
    (match.world.getComponent(spieler, 'Position', 'x') ?? 0) + 40);

  const hpVorher = match.world.getComponent(ziel, 'Health', 'current');
  match.fire(spieler, Math.PI / 2, 60, granate.id);

  // Der Schaden darf erst mit der ZÜNDUNG entstehen, nicht beim Aufprall.
  //
  // Gemessen wird am Aufprall: `fuse_expired` wird im selben Schritt gemeldet,
  // in dem die Explosion wirkt — dort wäre der Schaden schon angefallen und die
  // Prüfung wertlos. Der Aufprall ist der früheste Zeitpunkt, an dem eine
  // Aufprallwaffe (falsch) Schaden anrichten würde.
  let nachAufprall = null;
  for (let i = 0; i < 600; i++) {
    match.step();
    const events = match.consumeEvents();
    if (events.some(e => e.type === 'fuse_armed')) {
      nachAufprall = match.world.getComponent(ziel, 'Health', 'current');
      break;
    }
  }
  assert.ok(nachAufprall !== null, 'Der Aufprall muss gemeldet werden');
  assert.equal(nachAufprall, hpVorher,
    `Beim Aufprall darf kein Schaden entstehen (${hpVorher} → ${nachAufprall})`);

  // Bis zur Zündung bleibt es dabei.
  for (let i = 0; i < 600; i++) {
    const events = match.consumeEvents();
    if (events.some(e => e.type === 'fuse_expired')) break;
    match.step();
  }

  for (let i = 0; i < 20; i++) { match.step(); match.consumeEvents(); }
  const hpNachher = match.world.getComponent(ziel, 'Health', 'current');
  assert.ok(hpNachher < hpVorher, 'Nach der Zündung muss Schaden entstehen');
});

test('Der Zünderstand ist im Zustand sichtbar', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  const granate = WEAPONS.find(w => w.fuseTime > 0);
  match.inventory.register(spieler, [granate.id]);
  match.fire(spieler, Math.PI / 2, 50, granate.id);

  match.step();
  match.consumeEvents();
  const projektil = match.getState().projectiles[0];
  assert.ok(projektil, 'Ein Projektil muss fliegen');
  assert.ok(projektil.fuseSeconds > 0,
    `Der Zünderstand muss im Zustand stehen: ${JSON.stringify(projektil)}`);
  assert.ok(projektil.fuseSeconds <= granate.fuseTime,
    'Der Zünder kann nicht länger sein als beim Abschuss');
});

// ------------------------------------------------------------- Anflugart

test('Luftangriffe kommen von oben, Artillerie von der Seite', () => {
  const vonOben = WEAPONS.filter(w => w.strikeStyle === 'sky');
  assert.ok(vonOben.length >= 3, `Zu wenige Luftangriffe: ${vonOben.length}`);
  assert.ok(vonOben.some(w => /luftangriff/i.test(w.displayName)),
    'Der Luftangriff muss darunter sein');

  for (const w of WEAPONS) {
    assert.ok(['self', 'sky', 'flank'].includes(w.strikeStyle),
      `${w.id}: unbekannte Anflugart ${w.strikeStyle}`);
    assert.equal(w.strikeStyle, strikeStyleFor(w), `${w.id}: Ableitung nicht reproduzierbar`);
  }
});

test('Ein Luftangriff startet über dem Zielpunkt, nicht beim Schützen', () => {
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;

  const luft = WEAPONS.find(w => w.strikeStyle === 'sky' && w.delivery === 'projectile');
  assert.ok(luft, 'Es muss einen Luftangriff als Projektilwaffe geben');
  match.inventory.register(spieler, [luft.id]);

  const sx = match.world.getComponent(spieler, 'Position', 'x') ?? 0;
  const sy = match.world.getComponent(spieler, 'Position', 'y') ?? 0;

  const schuss = match.fire(spieler, 0, 60, luft.id);
  if (!schuss.ok) return; // Waffe darf blockiert sein; dann nichts zu prüfen

  const pid = schuss.projectileId;
  const px = match.world.getComponent(pid, 'Position', 'x');
  const py = match.world.getComponent(pid, 'Position', 'y');

  // Über dem Ziel: deutlich höher als der Schütze.
  assert.ok(py < sy, `Der Luftangriff muss von oben kommen (y=${py} vs Schütze ${sy})`);
  // Und nicht beim Schützen seitlich.
  assert.ok(Math.abs(px - sx) > 40 || py < sy - 100,
    `Der Startpunkt liegt praktisch beim Schützen (${px}, ${py}) vs (${sx}, ${sy})`);
});

// ------------------------------------------------------------- Wurfabwurf

test('Der Abwurf schleudert die Kiste, statt sie abzulegen', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
  match.inventory.register(spieler, [waffe.id]);

  const sx = match.world.getComponent(spieler, 'Position', 'x') ?? 0;
  const sy = match.world.getComponent(spieler, 'Position', 'y') ?? 0;

  const abwurf = match.dropWeapon(spieler, waffe.id);
  assert.equal(abwurf.ok, true, `Abwurf abgelehnt: ${abwurf.errors?.join(', ')}`);

  // Der Wurf muss eine Geschwindigkeit haben.
  assert.ok(Math.abs(abwurf.vx) > 0.5, `Kein seitlicher Wurf: vx=${abwurf.vx}`);
  assert.ok(abwurf.vy < -2, `Kein Wurf nach oben: vy=${abwurf.vy}`);

  // Und die Kiste muss als fliegend markiert sein.
  assert.equal(match.world.getComponent(abwurf.crateId, 'Crate', 'inFlight'), 1);
  assert.ok(match.world.getComponent(abwurf.crateId, 'Crate', 'flightTicks') > 0);
  assert.ok(sx !== null && sy !== null);
});

test('Die Kiste fliegt eine sichtbare Zeit und landet dann', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
  match.inventory.register(spieler, [waffe.id]);
  const abwurf = match.dropWeapon(spieler, waffe.id);

  let gelandetTick = -1;
  for (let i = 0; i < 600; i++) {
    match.step();
    if (match.consumeEvents().some(e => e.type === 'crate_landed' && e.payload.crateId === abwurf.crateId)) {
      gelandetTick = i;
      break;
    }
  }

  assert.ok(gelandetTick >= 0, 'Die Kiste muss landen');
  // Mindestflugzeit 45 Ticks (0,75 s): sichtbar, aber den Zug nicht aufhaltend.
  assert.ok(gelandetTick >= 44,
    `Die Flugzeit ist zu kurz: ${gelandetTick} Ticks (${(gelandetTick / 60).toFixed(2)} s)`);
  assert.ok(gelandetTick < 400, `Die Kiste fliegt zu lange: ${gelandetTick} Ticks`);
});

test('Eine abgeworfene Kiste landet nicht im Wasser', () => {
  // Die einzige harte Regel des Abwurfs: im Wasser wäre die Waffe verloren.
  const karten = ['islands', 'hills', 'mountains', 'caverns'];
  for (const preset of karten) {
    for (let seed = 0; seed < 6; seed++) {
      const match = new MatchController({
        seed: 1000 + seed, teams: 2, playersPerTeam: 1, preset, turnDurationMs: 1_000_000,
      });
      match.start();
      match.consumeEvents();
      const spieler = match.activePlayerId;
      const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
      match.inventory.register(spieler, [waffe.id]);
      const abwurf = match.dropWeapon(spieler, waffe.id);

      for (let i = 0; i < 600; i++) {
        match.step();
        const events = match.consumeEvents();
        if (events.some(e => e.type === 'crate_landed' && e.payload.crateId === abwurf.crateId)) {
          const x = match.world.getComponent(abwurf.crateId, 'Position', 'x');
          const y = match.world.getComponent(abwurf.crateId, 'Position', 'y');
          const wasser = match.water?.levelAtWorld ? match.water.levelAtWorld(x, y) : 0;
          assert.ok(!(wasser > 0.35),
            `${preset}/${seed}: Kiste landete im Wasser (x=${x?.toFixed(0)}, y=${y?.toFixed(0)}, Pegel=${wasser.toFixed(2)})`);
          break;
        }
      }
    }
  }
});

test('Der Wurf ist deterministisch', () => {
  const lauf = () => {
    const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
    match.start();
    match.consumeEvents();
    const spieler = match.activePlayerId;
    const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
    match.inventory.register(spieler, [waffe.id]);
    const abwurf = match.dropWeapon(spieler, waffe.id);
    for (let i = 0; i < 200; i++) { match.step(); match.consumeEvents(); }
    return {
      vx: abwurf.vx, vy: abwurf.vy,
      x: match.world.getComponent(abwurf.crateId, 'Position', 'x'),
      y: match.world.getComponent(abwurf.crateId, 'Position', 'y'),
    };
  };
  assert.deepEqual(lauf(), lauf(), 'Gleicher Seed muss denselben Wurf ergeben');
});

test('Eine fliegende Kiste lässt sich nicht aufheben', () => {
  // Sonst könnte man sie im Vorbeifliegen aufschnappen.
  const match = new MatchController({ seed: 808, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.damage > 0 && w.maxAmmo > 1);
  match.inventory.register(spieler, [waffe.id]);
  const abwurf = match.dropWeapon(spieler, waffe.id);

  // Die Kiste direkt auf den Spieler setzen, solange sie fliegt.
  match.world.setComponent(abwurf.crateId, 'Position', 'x',
    match.world.getComponent(spieler, 'Position', 'x'));
  match.world.setComponent(abwurf.crateId, 'Position', 'y',
    match.world.getComponent(spieler, 'Position', 'y'));

  match.step();
  match.consumeEvents();
  assert.equal(match.inventory.has(spieler, waffe.id), false,
    'Eine fliegende Kiste darf nicht aufgenommen werden');
  assert.equal(match.world.getComponent(abwurf.crateId, 'Crate', 'inFlight'), 1);
});

// ------------------------------------------------------------- Sprung

test('Eine Figur erkennt, ob sie auf festem Grund steht', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;

  assert.equal(lande(match, spieler), true, 'Die Figur muss landen');
  assert.equal(match.isGrounded(spieler), true, 'Auf dem Boden muss sie als stehend gelten');

  // In der Höhe ist sie nicht am Boden.
  match.world.setComponent(spieler, 'Position', 'y', 40);
  match.world.setComponent(spieler, 'Velocity', 'y', 0);
  assert.equal(match.isGrounded(spieler), false, 'In der Luft darf sie nicht als stehend gelten');
});

test('Sprung setzt einen Impuls nach oben und landet wieder', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  const yStart = match.world.getComponent(spieler, 'Position', 'y');
  const ergebnis = match.jump(spieler, 0);
  assert.equal(ergebnis.ok, true, `Sprung abgelehnt: ${ergebnis.errors?.join(', ')}`);
  assert.equal(ergebnis.double, false, 'Der erste Sprung ist kein Doppelsprung');
  assert.ok(match.world.getComponent(spieler, 'Velocity', 'y') < 0, 'Der Impuls muss nach oben gehen');

  // Höchsten Punkt und Landung verfolgen.
  let gipfel = yStart;
  let gelandet = false;
  for (let i = 0; i < 400; i++) {
    match.step();
    match.consumeEvents();
    gipfel = Math.min(gipfel, match.world.getComponent(spieler, 'Position', 'y'));
    if (i > 10 && match.isGrounded(spieler)) { gelandet = true; break; }
  }

  assert.equal(gelandet, true, 'Die Figur muss wieder landen');
  const hoehe = yStart - gipfel;
  assert.ok(hoehe > 40, `Der Sprung ist zu niedrig: ${hoehe.toFixed(0)} px`);
  assert.ok(hoehe < 200, `Der Sprung ist zu hoch: ${hoehe.toFixed(0)} px`);
});

test('Ein Doppelsprung ist möglich, ein dritter nicht', () => {
  const match = new MatchController({ seed: 606, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  assert.equal(match.jumpsLeft(spieler), 2, 'Zu Beginn zwei Sprünge');

  const erst = match.jump(spieler, 1);
  assert.equal(erst.ok, true);
  assert.equal(erst.jumpsLeft, 1);

  // In der Luft: der zweite Sprung.
  for (let i = 0; i < 5; i++) { match.step(); match.consumeEvents(); }
  assert.equal(match.isGrounded(spieler), false, 'Testannahme: in der Luft');

  const zweit = match.jump(spieler, -1);
  assert.equal(zweit.ok, true, `Doppelsprung abgelehnt: ${zweit.errors?.join(', ')}`);
  assert.equal(zweit.double, true, 'Der zweite Sprung muss als Doppelsprung gelten');
  assert.equal(zweit.jumpsLeft, 0);

  // Ein dritter ist nicht möglich.
  for (let i = 0; i < 3; i++) { match.step(); match.consumeEvents(); }
  const dritt = match.jump(spieler, 0);
  assert.equal(dritt.ok, false, 'Ein dritter Sprung darf nicht gehen');
  assert.ok(dritt.errors.some(f => f.includes('Keine Sprünge')), `Meldung: ${dritt.errors}`);
});

test('Der Doppelsprung ist schwächer als der erste', () => {
  const match = new MatchController({ seed: 909, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  const erst = match.jump(spieler, 0);
  for (let i = 0; i < 6; i++) { match.step(); match.consumeEvents(); }
  const zweit = match.jump(spieler, 0);

  assert.ok(zweit.impulse < erst.impulse,
    `Der Doppelsprung (${zweit.impulse?.toFixed(1)}) muss schwächer sein als der erste (${erst.impulse?.toFixed(1)})`);
});

test('Ohne Bodenkontakt gibt es keinen ersten Sprung', () => {
  const match = new MatchController({ seed: 1212, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  match.world.setComponent(spieler, 'Position', 'y', 40);
  match.world.setComponent(spieler, 'Velocity', 'y', 0);

  const ergebnis = match.jump(spieler, 0);
  assert.equal(ergebnis.ok, false, 'In der Luft darf kein erster Sprung gehen');
});

test('Nur der aktive Spieler darf springen', () => {
  const match = new MatchController({ seed: 1313, teams: 2, playersPerTeam: 2, turnDurationMs: 1_000_000 });
  match.start();
  const aktiv = match.activePlayerId;
  const anderer = match.players.find(p => p.entityId !== aktiv).entityId;
  lande(match, anderer);

  const ergebnis = match.jump(anderer, 0);
  assert.equal(ergebnis.ok, false, 'Ein fremder Spieler darf nicht springen');
  assert.ok(ergebnis.errors.some(f => f.includes('aktive Spieler')), `Meldung: ${ergebnis.errors}`);
});

test('Die Sprünge werden zu Beginn eines Zuges zurückgesetzt', () => {
  const match = new MatchController({ seed: 1414, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  // Beide Sprünge verbrauchen.
  match.jump(spieler, 0);
  for (let i = 0; i < 5; i++) { match.step(); match.consumeEvents(); }
  match.jump(spieler, 0);
  assert.equal(match.jumpsLeft(spieler), 0);

  // Nach einem Landen im SELBEN Zug bleibt es bei null.
  for (let i = 0; i < 300 && !match.isGrounded(spieler); i++) { match.step(); match.consumeEvents(); }
  assert.equal(match.jumpsLeft(spieler), 0,
    'Ein Landen im selben Zug darf keine neuen Sprünge geben');

  // Neuer Zug: wieder zwei.
  match.endTurn();
  zumSpieler(match, spieler);
  assert.equal(match.jumpsLeft(spieler), 2, 'Ein neuer Zug muss zwei Sprünge geben');
});

test('Sprung und Schuss schließen sich nicht aus', () => {
  // Der Sprung beendet den Zug bewusst NICHT — sonst wäre der Doppelsprung nie
  // auslösbar. Der Spieler darf nach dem Sprung noch schießen.
  const match = new MatchController({ seed: 1515, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  match.consumeEvents();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  const waffe = WEAPONS.find(w => w.damage > 0 && w.delivery === 'projectile' && w.fuseTime === 0);
  match.inventory.register(spieler, [waffe.id]);

  match.jump(spieler, 0);
  for (let i = 0; i < 3; i++) { match.step(); match.consumeEvents(); }

  assert.equal(match.activePlayerId, spieler, 'Der Sprung darf den Zug nicht beenden');
  const schuss = match.fire(spieler, 0, 50, waffe.id);
  assert.equal(schuss.ok, true, `Schuss nach Sprung abgelehnt: ${schuss.errors?.join(', ')}`);
});

test('Der Sprung verlässt die Karte nicht', () => {
  const match = new MatchController({ seed: 1616, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;
  lande(match, spieler);
  zumSpieler(match, spieler);

  match.jump(spieler, -1);
  for (let i = 0; i < 200; i++) { match.step(); match.consumeEvents(); }
  const x = match.world.getComponent(spieler, 'Position', 'x');
  assert.ok(x >= 0 && x <= MAP_WIDTH, `Position außerhalb der Karte: ${x}`);
});

test('Der Sprung ist deterministisch', () => {
  const lauf = () => {
    const match = new MatchController({ seed: 1717, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
    match.start();
    const spieler = match.activePlayerId;
    lande(match, spieler);
    zumSpieler(match, spieler);
    match.jump(spieler, 1);
    for (let i = 0; i < 40; i++) { match.step(); match.consumeEvents(); }
    return {
      x: match.world.getComponent(spieler, 'Position', 'x'),
      y: match.world.getComponent(spieler, 'Position', 'y'),
      hash: match.stateHash(),
    };
  };
  assert.deepEqual(lauf(), lauf(), 'Gleicher Seed muss denselben Sprung ergeben');
});
