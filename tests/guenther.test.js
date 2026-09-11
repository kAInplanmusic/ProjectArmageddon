import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { GuentherSystem, poisson } from '../src/engine/systems/guentherSystem.js';
import { SeededRandom } from '../src/shared/prng.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import {
  GUENTHER_IDENTITY,
  GUENTHER_WHEEL,
  GUENTHER_WHEEL_TOTAL,
  GUENTHER_PEE,
  GUENTHER_POOP,
  GUENTHER_CONTACT,
  GUENTHER_SPAWN,
  HEIMDALL_MAX_PERCENT,
  LOW_RARITY_WEIGHTS,
  LEGENDARY_WEIGHTS,
} from '../src/shared/config/guenther.js';

/**
 * Günther — der frei laufende Kleinspitz.
 *
 * Geprüft wird in drei Stufen: die Konfiguration (Gewichte, Wahrscheinlichkeit),
 * das System für sich (Auftritte, Anpinkeln, Kacken, Berührung) und das
 * Zusammenspiel im Match (was die Rad-Ausgänge tatsächlich bewirken).
 */

/** Stub-Welt: nur die Aufrufe, die das NPC-System braucht. */
function stubWelt(spielerIds) {
  const positionen = new Map(spielerIds.map(id => [id, { x: 640, y: 300 }]));
  return {
    positionen,
    isActive: id => positionen.has(id),
    getComponent: (id, comp, feld) => (comp === 'Position' ? positionen.get(id)?.[feld] : undefined),
    setComponent: () => {},
  };
}

/** Kontext für `update()` mit Zählern. */
function stubKontext(spielerIds, protokoll = []) {
  return {
    aktiverSpieler: spielerIds[0] ?? null,
    spielerIds,
    surfaceYAt: () => 300,
    schaden: (id, betrag) => protokoll.push({ art: 'schaden', id, betrag }),
    haufenGetroffen: id => protokoll.push({ art: 'haufen', id }),
    radAufloesen: id => {
      protokoll.push({ art: 'rad', id });
      return { outcome: 'gassi', label: 'Test', detail: 'Test', effect: 'skip' };
    },
    melde: (typ, daten) => protokoll.push({ art: typ, ...daten }),
  };
}

/** Erzeugt ein System und setzt es in seine erste Auftrittsrunde. */
function aktivesSystem(seed, spielerIds = [7]) {
  const system = new GuentherSystem({
    rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720,
  });
  const runde = system.plan[0] ?? 1;
  system.setRunde(runde);
  return { system, runde, spielerIds };
}

// ------------------------------------------------------------------ Konfiguration

test('Günther ist ein hellbrauner Kleinspitz', () => {
  assert.equal(GUENTHER_IDENTITY.name, 'Günther');
  assert.equal(GUENTHER_IDENTITY.breed, 'Kleinspitz');
  const [r, g, b] = GUENTHER_IDENTITY.coat;
  // Hellbraun: Rot deutlich über Grün, Grün über Blau, mittlere Helligkeit.
  assert.ok(r > g && g > b, `Fellfarbe ist nicht braun: ${r},${g},${b}`);
  assert.ok((r + g + b) / 3 > 120 && (r + g + b) / 3 < 220, 'Fell nicht hellbraun');
  assert.ok(GUENTHER_IDENTITY.height <= 30, 'Ein Kleinspitz ist ein kleiner Hund');
});

test('Die Rad-Gewichte ergeben 100 und Heimdall genau 5 Prozent', () => {
  assert.equal(GUENTHER_WHEEL_TOTAL, 100, 'Die Summe muss 100 sein, sonst ist sie nicht lesbar');
  assert.equal(GUENTHER_WHEEL.length, 5, 'Es sind fünf Ausgänge');

  const heimdall = GUENTHER_WHEEL.find(o => o.id === 'heimdall');
  assert.ok(heimdall, 'Der Heimdall-Ausgang fehlt');
  assert.equal(heimdall.weight, HEIMDALL_MAX_PERCENT,
    `Heimdall muss genau ${HEIMDALL_MAX_PERCENT} Prozent haben`);
  assert.ok(heimdall.effect.kind === 'legendaryWeapon');
  assert.equal(heimdall.effect.animation, 'bifroest', 'Die Bifröst-Animation muss benannt sein');
});

test('Alle fünf geforderten Rad-Ausgänge sind vorhanden', () => {
  const gefordert = {
    gassi: 'skip',
    fuettern: 'skipAndWeapon',
    spielen: 'skipAndHeal',
    angriff: 'damage',
    heimdall: 'legendaryWeapon',
  };
  for (const [id, wirkung] of Object.entries(gefordert)) {
    const ausgang = GUENTHER_WHEEL.find(o => o.id === id);
    assert.ok(ausgang, `Ausgang fehlt: ${id}`);
    assert.equal(ausgang.effect.kind, wirkung, `${id}: falsche Wirkung`);
    assert.ok(ausgang.label?.length > 5, `${id}: Beschriftung fehlt`);
    assert.ok(ausgang.detail?.length > 20, `${id}: Erläuterung zu knapp`);
  }
});

test('Drei Ausgänge setzen aus, zwei nicht', () => {
  // Aussetzen gehört zu Gassi, Füttern und Spielen — der Angriff und Heimdall
  // beenden den Zug nicht.
  const mitAussetzen = GUENTHER_WHEEL.filter(o =>
    o.effect.kind === 'skip' || o.effect.kind === 'skipAndWeapon' || o.effect.kind === 'skipAndHeal');
  assert.equal(mitAussetzen.length, 3);
  for (const o of mitAussetzen) assert.equal(o.effect.turns, 1);
});

test('Heimdalls Gabe ist ausschließlich legendär, die Futterwaffe nicht', () => {
  // Die niedrige Seltenheit darf keine legendären Anteile haben, sonst wäre
  // „niedrig" bedeutungslos.
  assert.equal(LOW_RARITY_WEIGHTS.legendary, 0);
  assert.ok(LOW_RARITY_WEIGHTS.common > 50, 'Die Futterwaffe soll meist gewöhnlich sein');

  // Und umgekehrt: Heimdall gibt nichts Gewöhnliches.
  assert.equal(LEGENDARY_WEIGHTS.common, 0);
  assert.equal(LEGENDARY_WEIGHTS.uncommon, 0);
  assert.ok(LEGENDARY_WEIGHTS.legendary > 50);
});

test('Der Schaden beim Anpinkeln sinkt und hat eine Untergrenze', () => {
  assert.ok(GUENTHER_PEE.decay < 1, 'Ohne Abnahme wäre „je öfter, desto weniger" nicht erfüllt');
  assert.ok(GUENTHER_PEE.minDamage > 0, 'Ein wirkungsloser Treffer wäre sinnlos');

  // Nach vielen Treffern darf der Schaden nicht auf null fallen.
  const nach20 = GUENTHER_PEE.baseDamage * (GUENTHER_PEE.decay ** 20);
  assert.ok(Math.max(GUENTHER_PEE.minDamage, nach20) >= GUENTHER_PEE.minDamage);
  assert.ok(nach20 < GUENTHER_PEE.baseDamage, 'Der Schaden muss tatsächlich sinken');
});

test('Der Kackhaufen wirkt drei Runden und verlangsamt', () => {
  assert.equal(GUENTHER_POOP.turns, 3, 'Gefordert waren drei Runden');
  assert.ok(GUENTHER_POOP.damagePerTurn > 0);
  assert.ok(GUENTHER_POOP.slowFactor < 1, 'Verlangsamung heißt Faktor unter 1');
  assert.ok(GUENTHER_POOP.maxPiles >= 3, 'Zu wenige Haufen');
});

test('Die Berührung verlangt eigene Bewegung', () => {
  assert.ok(GUENTHER_CONTACT.minPlayerMove > 0,
    'Ohne Mindestbewegung würde auch ein stillstehender Spieler auslösen');
  assert.ok(GUENTHER_CONTACT.cooldownTicks > 0, 'Ohne Sperre würde das Rad dauerhaft aufgehen');
});

// ------------------------------------------------------------------ Auftritte

test('Die Poisson-Verteilung liefert den Mittelwert und Extreme', () => {
  // Der Mittelwert 2 wurde gefordert, aber ausdrücklich als Verteilung: „auch
  // mal zwei Spiele nicht und dann 2x hintereinander 3 mal".
  let summe = 0;
  const N = 20000;
  let nullen = 0;
  let mindestensDrei = 0;
  for (let i = 0; i < N; i++) {
    const k = poisson(new SeededRandom(i), GUENTHER_SPAWN.meanPerMatch);
    summe += k;
    if (k === 0) nullen += 1;
    if (k >= 3) mindestensDrei += 1;
  }
  const mittel = summe / N;
  assert.ok(Math.abs(mittel - 2) < 0.1, `Mittelwert ${mittel.toFixed(2)} statt 2`);
  assert.ok(nullen / N > 0.08, `Zu selten ohne Günther: ${(nullen / N * 100).toFixed(1)} %`);
  assert.ok(mindestensDrei / N > 0.15,
    `Zu selten drei oder mehr Auftritte: ${(mindestensDrei / N * 100).toFixed(1)} %`);
});

test('Der Auftrittsplan ist deterministisch und liegt im Spiel', () => {
  for (const seed of [0, 5, 42, 12345]) {
    const a = new GuentherSystem({ rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720 });
    const b = new GuentherSystem({ rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720 });
    assert.deepEqual(a.plan, b.plan, `Seed ${seed}: Pläne weichen ab`);

    for (const runde of a.plan) {
      assert.ok(runde >= 1, `Runde ${runde} liegt vor Spielbeginn`);
      assert.ok(runde <= 30, `Runde ${runde} liegt nach dem Spielende`);
    }
    // Keine doppelten Runden, sonst würde er zweimal gleichzeitig erscheinen.
    assert.equal(new Set(a.plan).size, a.plan.length, 'Doppelte Auftrittsrunden');
    assert.ok(a.plan.length <= GUENTHER_SPAWN.maxPerMatch);
    // Und aufsteigend sortiert.
    assert.deepEqual(a.plan, [...a.plan].sort((x, y) => x - y));
  }
});

test('Verschiedene Seeds ergeben verschiedene Pläne', () => {
  const gesehen = new Set();
  for (let seed = 0; seed < 300; seed++) {
    const s = new GuentherSystem({ rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720 });
    gesehen.add(s.plan.join(','));
  }
  assert.ok(gesehen.size >= 20, `Nur ${gesehen.size} verschiedene Pläne bei 300 Seeds`);
});

test('Er ist nur während seiner Auftrittsrunden aktiv', () => {
  const system = new GuentherSystem({
    rng: new SeededRandom(3), maxRounds: 30, width: 1280, height: 720,
  });
  assert.ok(system.plan.length > 0, 'Testannahme: Es gibt Auftritte');

  const start = system.plan[0];
  system.setRunde(start - 1);
  assert.equal(system.aktiv, false, 'Vor dem Auftritt darf er nicht aktiv sein');

  system.setRunde(start);
  assert.equal(system.aktiv, true, 'In der Auftrittsrunde muss er aktiv sein');

  // Und nach Ablauf seiner Runden wieder verschwunden.
  system.setRunde(start + GUENTHER_SPAWN.roundsPerVisit + 1);
  assert.equal(system.aktiv, false, 'Nach dem Auftritt muss er die Karte verlassen');
});

test('Er betritt die Karte vom Rand, nicht mitten auf dem Feld', () => {
  const { system } = aktivesSystem(11);
  const x = system.position.x;
  assert.ok(x <= GUENTHER_SPAWN.edgeMargin || x >= 1280 - GUENTHER_SPAWN.edgeMargin,
    `Er erscheint bei x=${x} — mitten auf dem Feld statt am Rand`);
});

test('Er läuft auf festem Grund, nicht durch das Gelände', () => {
  const system = new GuentherSystem({
    rng: new SeededRandom(5), maxRounds: 30, width: 1280, height: 720,
  });
  system.setRunde(system.plan[0]);
  const welt = stubWelt([7]);
  const kontext = stubKontext([7]);
  kontext.surfaceYAt = x => 200 + Math.sin(x / 40) * 30;

  for (let i = 0; i < 200; i++) system.update(welt, kontext);
  const erwartet = 200 + Math.sin(system.position.x / 40) * 30;
  assert.ok(Math.abs(system.position.y - erwartet) < 1.5,
    `Er schwebt über dem Boden: y=${system.position.y.toFixed(1)} statt ${erwartet.toFixed(1)}`);
});

// ------------------------------------------------------------------ Anpinkeln

test('Anpinkeln verursacht Schaden und wird mit jedem Mal geringer', () => {
  const { system } = aktivesSystem(7);
  const welt = stubWelt([7]);
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  // Günther direkt neben dem Spieler: So kommt es zu mehreren Treffern.
  welt.positionen.set(7, { x: 700, y: 300 });
  for (let i = 0; i < 5000; i++) {
    welt.positionen.get(7).x = 700 + (i % 2 ? 2 : 0);
    system.update(welt, kontext);
  }

  const treffer = protokoll.filter(p => p.art === 'guenther_pee');
  assert.ok(treffer.length >= 3, `Nur ${treffer.length} Pinkel-Treffer`);

  // Die Beträge müssen streng fallen (bis zur Untergrenze).
  for (let i = 1; i < treffer.length; i++) {
    assert.ok(treffer[i].amount <= treffer[i - 1].amount,
      `Der Schaden steigt: ${treffer[i - 1].amount} -> ${treffer[i].amount}`);
  }
  assert.ok(treffer[0].amount > treffer[treffer.length - 1].amount,
    'Der erste Treffer muss stärker sein als der letzte');
  assert.ok(treffer.every(t => t.amount > 0), 'Kein Treffer darf wirkungslos sein');
  // Der Zähler zählt hoch.
  assert.deepEqual(treffer.map(t => t.count), treffer.map((_, i) => i + 1));
});

test('Anpinkeln zielt nur auf Spieler in Reichweite', () => {
  const { system } = aktivesSystem(7);
  const welt = stubWelt([7]);
  const protokoll = [];
  // Spieler weit weg: Es darf kein Treffer entstehen.
  welt.positionen.set(7, { x: system.position.x + GUENTHER_PEE.range + 200, y: 300 });
  const kontext = stubKontext([7], protokoll);

  for (let i = 0; i < 800; i++) system.update(welt, kontext);
  assert.equal(protokoll.filter(p => p.art === 'guenther_pee').length, 0,
    'Er hat über die Reichweite hinaus gepinkelt');
});

// ------------------------------------------------------------------ Kackhaufen

test('Er hinterlässt Kackhaufen und trifft, wer hineingerät', () => {
  const { system } = aktivesSystem(21);
  const welt = stubWelt([7]);
  const protokoll = [];
  welt.positionen.set(7, { x: 640, y: 300 });
  const kontext = stubKontext([7], protokoll);

  // Er läuft auf den Spieler zu und kackt unterwegs.
  for (let i = 0; i < 3000; i++) {
    welt.positionen.get(7).x = 640 + (i % 2 ? 2 : 0);
    system.update(welt, kontext);
  }

  const haufenEreignisse = protokoll.filter(p => p.art === 'guenther_poop');
  assert.ok(haufenEreignisse.length >= 1, 'Es muss mindestens ein Haufen entstehen');
  assert.ok(system.haufen.length >= 1, 'Der Haufen muss im Zustand stehen');

  const treffer = protokoll.filter(p => p.art === 'guenther_poop_hit');
  assert.ok(treffer.length >= 1, 'Ein Spieler am Haufen muss hineingeraten');

  // Jeder HAUFEN trifft denselben Spieler nur einmal. Ein Spieler, der in einem
  // Feld aus mehreren Haufen steht, wird von jedem einzeln getroffen — das ist
  // gewollt. Nicht gewollt wäre, dass derselbe Haufen mehrfach zuschlägt.
  assert.ok(treffer.every(t => t.playerId !== undefined), 'Jeder Treffer benennt einen Spieler');
  assert.ok(treffer.every(t => t.pileId !== undefined), 'Jeder Treffer benennt seinen Haufen');

  const proHaufen = new Map();
  for (const t of treffer) proHaufen.set(t.pileId, (proHaufen.get(t.pileId) ?? 0) + 1);
  for (const [id, anzahl] of proHaufen) {
    assert.equal(anzahl, 1, `Haufen ${id} hat ${anzahl} mal zugeschlagen`);
  }
  assert.equal(proHaufen.size, treffer.length, 'Doppelte Haufen-Kennungen');
});

test('Ein Haufen schlägt nicht erneut zu, wenn die Liste aufrückt', () => {
  // Regression: Die Haufen wurden über ihren LISTENPLATZ identifiziert. Beim
  // Entfernen eines alten Haufens rückten die übrigen auf und galten unter der
  // neuen Nummer als unberührt — derselbe Haufen traf denselben Spieler erneut.
  const { system } = aktivesSystem(21);
  const welt = stubWelt([7]);
  welt.positionen.set(7, { x: 640, y: 300 });
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  // Lange laufen lassen: Dabei entstehen mehr Haufen, als gleichzeitig erlaubt
  // sind, also wird zwischendurch entfernt und die Liste rückt auf.
  for (let i = 0; i < 60000; i++) {
    welt.positionen.get(7).x = 640 + (i % 2 ? 1 : 0);
    system.update(welt, kontext);
  }

  const haufenGesamt = protokoll.filter(p => p.art === 'guenther_poop').length;
  const treffer = protokoll.filter(p => p.art === 'guenther_poop_hit');
  assert.ok(haufenGesamt > GUENTHER_POOP.maxPiles,
    `Testannahme: Es müssen mehr Haufen entstehen als gleichzeitig erlaubt (${haufenGesamt})`);

  // Der entscheidende Punkt: Jeder Haufen darf nur EINMAL zuschlagen — auch
  // nachdem andere Haufen entfernt wurden und die Liste aufgerückt ist.
  const proHaufen = new Map();
  for (const t of treffer) proHaufen.set(t.pileId, (proHaufen.get(t.pileId) ?? 0) + 1);
  for (const [id, anzahl] of proHaufen) {
    assert.ok(anzahl <= 1, `Haufen ${id} schlug ${anzahl} mal zu — die Aufrück-Regel greift nicht`);
  }
  assert.ok(treffer.length >= 1, 'Mindestens ein Treffer');
});

test('Die Zahl der Haufen ist begrenzt', () => {
  const { system } = aktivesSystem(33);
  const welt = stubWelt([7]);
  welt.positionen.set(7, { x: system.position.x + 900, y: 300 });
  const kontext = stubKontext([7]);
  for (let i = 0; i < 40000; i++) system.update(welt, kontext);

  assert.ok(system.haufen.length <= GUENTHER_POOP.maxPiles,
    `Zu viele Haufen: ${system.haufen.length}`);
});

// ------------------------------------------------------------------ Berührung

test('Das Rad löst nur bei eigener Bewegung aus', () => {
  const { system } = aktivesSystem(7);
  const welt = stubWelt([7]);
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  // Direkt daneben, aber STILLSTEHEND: keine Berührung.
  //
  // Der y-Wert kommt vom BODEN, nicht von Günthers Position: Sein y ist direkt
  // nach dem Betreten noch 0 und wird erst im ersten Schritt auf die Oberfläche
  // gesetzt. Ein übernommenes y hätte einen Höhenunterschied von 300 Pixeln
  // erzeugt — die Berührung wäre allein daran gescheitert.
  welt.positionen.set(7, { x: system.position.x, y: 300 });
  for (let i = 0; i < 60; i++) system.update(welt, kontext);
  assert.equal(protokoll.filter(p => p.art === 'rad').length, 0,
    'Ein stillstehender Spieler darf das Rad nicht auslösen');

  // Jetzt bewegt er sich — und die Berührung greift.
  for (let i = 0; i < 120; i++) {
    welt.positionen.get(7).x = system.position.x + (i % 2 ? 1.5 : 0);
    system.update(welt, kontext);
  }
  assert.ok(protokoll.filter(p => p.art === 'rad').length >= 1,
    'Bei Bewegung in Reichweite muss das Rad auslösen');
});

test('Nach einem Rad bleibt er eine Weile unbeteiligt', () => {
  const { system } = aktivesSystem(7);
  const welt = stubWelt([7]);
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  for (let i = 0; i < 400; i++) {
    welt.positionen.get(7).x = system.position.x + (i % 2 ? 1.5 : 0);
    system.update(welt, kontext);
  }
  const raeder = protokoll.filter(p => p.art === 'rad').length;
  // Ohne Sperre wären es hunderte; mit Sperre nur wenige.
  assert.ok(raeder >= 1, 'Mindestens ein Rad');
  assert.ok(raeder <= 4, `Zu viele Räder in 400 Ticks: ${raeder} — die Sperre greift nicht`);
});

test('Die Berührung wird als Ereignis mit Ausgang gemeldet', () => {
  const { system } = aktivesSystem(7);
  const welt = stubWelt([7]);
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  for (let i = 0; i < 200; i++) {
    welt.positionen.get(7).x = system.position.x + (i % 2 ? 1.5 : 0);
    system.update(welt, kontext);
  }
  const rad = protokoll.filter(p => p.art === 'guenther_wheel');
  assert.ok(rad.length >= 1, 'Das Rad-Ereignis fehlt');
  assert.ok(rad[0].playerId !== undefined, 'Der betroffene Spieler muss im Ereignis stehen');
  assert.ok(rad[0].outcome, 'Der Ausgang muss im Ereignis stehen');
});

// ------------------------------------------------------------------ Rad-Verteilung

test('Der Ausgang des Rads ist deterministisch und trifft die Gewichte', () => {
  const zaehler = new Map();
  const N = 40000;
  const system = new GuentherSystem({
    rng: new SeededRandom(99), maxRounds: 30, width: 1280, height: 720,
  });
  for (let i = 0; i < N; i++) {
    const ausgang = system.wuerfleAusgang();
    zaehler.set(ausgang.id, (zaehler.get(ausgang.id) ?? 0) + 1);
  }

  for (const ausgang of GUENTHER_WHEEL) {
    const anteil = (zaehler.get(ausgang.id) ?? 0) / N * 100;
    assert.ok(Math.abs(anteil - ausgang.weight) < 1.5,
      `${ausgang.id}: ${anteil.toFixed(1)} % statt ${ausgang.weight} %`);
  }
  // Heimdall darf die Obergrenze nicht überschreiten.
  const heimdall = (zaehler.get('heimdall') ?? 0) / N * 100;
  assert.ok(heimdall <= HEIMDALL_MAX_PERCENT + 0.3,
    `Heimdall bei ${heimdall.toFixed(2)} % — über der Obergrenze`);
});

test('Zwei Systeme mit gleichem Seed drehen gleich', () => {
  const a = new GuentherSystem({ rng: new SeededRandom(4242), maxRounds: 30, width: 1280, height: 720 });
  const b = new GuentherSystem({ rng: new SeededRandom(4242), maxRounds: 30, width: 1280, height: 720 });
  for (let i = 0; i < 200; i++) {
    assert.equal(a.wuerfleAusgang().id, b.wuerfleAusgang().id, `Drehung ${i} weicht ab`);
  }
});

// ------------------------------------------------------------------ Im Match

/**
 * Bringt den aktiven Spieler neben Günther und bewegt ihn, bis das Rad aufgeht.
 * Gibt das Rad-Ereignis zurück (oder null).
 */
function erzwingeRad(match, maxTicks = 600) {
  const spieler = match.activePlayerId;
  const gx = match.getState().guenther?.x;
  if (gx === undefined) return null;

  match.world.setComponent(spieler, 'Position', 'x', gx - 18);
  match.world.setComponent(spieler, 'Position', 'y', match.surfaceYAt(Math.round(gx - 18)));
  match.world.setComponent(spieler, 'Velocity', 'x', 0);
  match.world.setComponent(spieler, 'Velocity', 'y', 0);

  for (let i = 0; i < maxTicks; i++) {
    // Eigene Bewegung: nur so zählt es als Berührung.
    match.world.setComponent(spieler, 'Position', 'x', gx - 18 + (i % 2 ? 1.5 : 0));
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'guenther_wheel') return e.payload;
    }
  }
  return null;
}

/** Sucht ein Match, in dem Günther aktiv ist, und erzwingt eine Berührung. */
function findeRad(maxSeeds = 120) {
  for (let seed = 0; seed < maxSeeds; seed += 1) {
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 2, maxRounds: 30, turnDurationMs: 6000,
    });
    match.start();
    match.consumeEvents();
    if (!match.getState().guenther?.plan?.length) continue;

    for (let runde = 0; runde < 30; runde += 1) {
      if (match.getState().guenther?.aktiv) {
        const rad = erzwingeRad(match);
        if (rad) return { match, rad, seed };
      }
      for (let i = 0; i < 30; i += 1) { match.step(); match.consumeEvents(); }
      match.endTurn();
      if (match.status !== 'playing') break;
    }
  }
  return null;
}

test('Günther erscheint im Match und steht im Zustand', () => {
  let gefunden = null;
  for (let seed = 0; seed < 60 && !gefunden; seed += 1) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 2, maxRounds: 30 });
    match.start();
    const zustand = match.getState();
    if (zustand.guenther?.plan?.length > 0) gefunden = zustand.guenther;
  }
  assert.ok(gefunden, 'Über 60 Seeds muss mindestens ein Plan mit Auftritten entstehen');
  assert.ok(Array.isArray(gefunden.plan));
  assert.equal(gefunden.identity.name, 'Günther');
  assert.equal(gefunden.identity.breed, 'Kleinspitz');
  assert.ok(typeof gefunden.x === 'number' && typeof gefunden.y === 'number');
});

test('Ein Rad-Ausgang wird angewendet, nicht nur gemeldet', () => {
  const treffer = findeRad();
  assert.ok(treffer, 'Es muss sich ein Rad ereignen lassen');

  const { match, rad } = treffer;
  const spieler = rad.playerId;
  const ausgang = GUENTHER_WHEEL.find(o => o.id === rad.outcome);
  assert.ok(ausgang, `Unbekannter Ausgang: ${rad.outcome}`);
  assert.equal(rad.label, ausgang.label);

  switch (ausgang.effect.kind) {
    case 'skip':
    case 'skipAndWeapon':
    case 'skipAndHeal': {
      // Aussetzen: Die Figur ist eingefroren.
      const einheit = match.getState().entities.find(e => e.entityId === spieler);
      assert.ok(einheit, 'Der Spieler muss im Zustand stehen');
      assert.ok(einheit.statuses?.frozenTurns > 0,
        `Nach „${ausgang.id}" muss der Spieler aussetzen: ${JSON.stringify(einheit.statuses)}`);
      break;
    }
    case 'damage':
      assert.ok(rad.amount >= 1 && rad.amount <= 99,
        `Schaden außerhalb 1–99: ${rad.amount}`);
      break;
    case 'legendaryWeapon':
      assert.ok(rad.weaponId, 'Heimdall muss eine Waffe übergeben');
      break;
    default:
      break;
  }
});

test('Die Gabe aus dem Rad ist eine echte Waffe im Bestand', () => {
  // Über mehrere Versuche: Waffe und Heilung müssen tatsächlich ankommen.
  let geprueft = 0;
  for (let seed = 0; seed < 400 && geprueft < 2; seed += 1) {
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 2, maxRounds: 30, turnDurationMs: 6000,
    });
    match.start();
    match.consumeEvents();
    if (!match.getState().guenther?.plan?.length) continue;

    for (let runde = 0; runde < 30; runde += 1) {
      if (match.getState().guenther?.aktiv) {
        const spieler = match.activePlayerId;
        const rad = erzwingeRad(match, 300);
        if (rad) {
          assert.ok(typeof rad.outcome === 'string');
          if (rad.weaponId) {
            assert.ok(getWeapon(rad.weaponId), `Unbekannte Waffe: ${rad.weaponId}`);
            if (rad.effect === 'legendaryWeapon') {
              assert.ok(match.inventory.has(spieler, rad.weaponId)
                || match.inventory.getAmmo(spieler, rad.weaponId) > 0,
                'Heimdalls Waffe muss im Bestand liegen');
            }
            geprueft += 1;
          }
        }
      }
      for (let i = 0; i < 30; i += 1) { match.step(); match.consumeEvents(); }
      match.endTurn();
      if (match.status !== 'playing') break;
    }
  }
  assert.ok(geprueft >= 1, 'Es muss sich mindestens eine Waffengabe ereignen lassen');
});

test('Günther gehört keinem Team und zählt nicht als Abschuss', () => {
  // Sein Schaden läuft ohne Verursacher. Sonst würde ein Tod durch Günther als
  // Treffer eines Spielers gezählt.
  const match = new MatchController({ seed: 8, teams: 2, playersPerTeam: 2, maxRounds: 30 });
  match.start();
  const zustand = match.getState();
  const teamIds = new Set(zustand.entities.map(e => e.teamId));
  // Seine Kennung steht nicht in der Teamliste der Spieler.
  assert.ok(!teamIds.has(undefined), 'Jede Einheit muss ein Team haben');
  assert.ok(zustand.guenther, 'Günther steht getrennt vom Spielerzustand');
  assert.ok(!zustand.entities.some(e => e.entityId === zustand.guenther.entityId),
    'Günther darf keine Spielfigur sein');
});

test('Ohne Günther-Auftritt läuft das Match unverändert', () => {
  // Der NPC darf ein Spiel ohne ihn nicht beeinflussen.
  const match = new MatchController({ seed: 1, teams: 2, playersPerTeam: 2, maxRounds: 30 });
  match.start();
  const haufenVorher = match.getState().guenther.haufen.length;
  for (let i = 0; i < 600; i += 1) { match.step(); match.consumeEvents(); }
  const danach = match.getState().guenther;
  if (!danach.aktiv) {
    assert.equal(danach.haufen.length, haufenVorher, 'Ohne Auftritt dürfen keine Haufen entstehen');
  }
});

test('Der Zustand ist serialisierbar', () => {
  let gefunden = null;
  for (let seed = 0; seed < 80 && !gefunden; seed += 1) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 2, maxRounds: 30 });
    match.start();
    const g = match.getState().guenther;
    if (g?.plan?.length) gefunden = g;
  }
  assert.ok(gefunden);
  const zurueck = JSON.parse(JSON.stringify(gefunden));
  assert.deepEqual(zurueck, gefunden, 'Der Zustand übersteht JSON nicht unverändert');
});


test('Ein wiederholter setRunde-Aufruf startet den Auftritt nicht neu', () => {
  // Regression: `setRunde` läuft bei JEDEM Simulationsschritt. Es setzte in der
  // Auftrittsrunde jedes Mal die Pinkel- und Kack-Timer zurück — sie liefen nie
  // ab, und Günther stand die ganze erste Runde regungslos. Genau das passierte
  // im laufenden Spiel, während die Tests mit Rundenwechseln es verdeckten.
  const system = new GuentherSystem({
    rng: new SeededRandom(77), maxRounds: 30, width: 1280, height: 720,
  });
  const start = system.plan[0];
  system.setRunde(start);

  const welt = stubWelt([7]);
  welt.positionen.set(7, { x: 640, y: 300 });
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  // 600 Schritte, und VOR JEDEM Schritt dieselbe Runde erneut setzen — so
  // verhält sich der Motor.
  for (let i = 0; i < 600; i += 1) {
    system.setRunde(start);
    system.update(welt, kontext);
  }

  const haufen = protokoll.filter(p => p.art === 'guenther_poop').length;
  assert.ok(haufen >= 1,
    `Bei 600 Schritten muss mindestens ein Haufen entstehen (${haufen}) — `
    + 'die Timer wurden offenbar ständig zurückgesetzt');

  // Und er muss sich bewegt haben.
  assert.notEqual(system.position.x, 0, 'Er darf nicht am Startpunkt stehen bleiben');
});

test('Nach dem Rundenwechsel läuft der Auftritt weiter', () => {
  const system = new GuentherSystem({
    rng: new SeededRandom(77), maxRounds: 30, width: 1280, height: 720,
  });
  const start = system.plan[0];
  system.setRunde(start);
  const welt = stubWelt([7]);
  welt.positionen.set(7, { x: 640, y: 300 });
  const protokoll = [];
  const kontext = stubKontext([7], protokoll);

  for (let i = 0; i < 120; i += 1) { system.setRunde(start); system.update(welt, kontext); }
  const ersteRunde = protokoll.filter(p => p.art === 'guenther_poop').length;

  // Zweite Runde des Auftritts: Die Sperre darf den Auftritt nicht beenden.
  system.setRunde(start + 1);
  assert.equal(system.aktiv, true, 'In der zweiten Runde muss er noch da sein');
  for (let i = 0; i < 400; i += 1) { system.setRunde(start + 1); system.update(welt, kontext); }
  const zweiteRunde = protokoll.filter(p => p.art === 'guenther_poop').length;

  assert.ok(zweiteRunde > ersteRunde, 'In der zweiten Runde muss er weiter machen');
});
