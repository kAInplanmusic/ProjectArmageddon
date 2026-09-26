/**
 * Tests: Die Bodenmaterialien (Eis, Gummi) — deterministisch aus dem Seed.
 *
 * ## Der Auftrag (W7)
 *
 * Bodenformen sollen sich unterscheiden: **Eis rutscht, Gummi federt.** Welche
 * Fläche welches Material trägt, entscheidet allein der **Seed** — kein Regler,
 * keine Auswahl. Der Motor liest das Material an **EINER Stelle**, beim
 * Aufsetzen und beim Bewegen.
 *
 * ## Was hier geprüft wird
 *
 *   1. **Der Seed entscheidet** — derselbe Seed ergibt dasselbe Feld, andere
 *      Seeds andere. Ein übergebener Wunsch (`material: 'ice'`) wird ignoriert.
 *   2. **Das Feld ist kein Fremdkörper** — es verschiebt die Karte nicht, denn
 *      es hängt an einem eigenen Seed-Zweig (`rng.fork`).
 *   3. **Der Boden ist vielfältig, aber mehrheitlich Erde** — sonst wäre der
 *      Sonderboden kein Fundstück mehr.
 *   4. **EINE Lesestelle** — der Motor legt das Feld genau einmal aus.
 *   5. **Die Physik wirkt** — Eis nimmt die Reibung, Gummi gibt den Aufprall
 *      zurück. Gemessen am echten Motor, nicht am Papier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import {
  erzeugeAutonomeKarte, materialAmPunkt, zaehleMaterialien,
} from '../src/shared/terrainGen3.js';
import { TERRAIN_MATERIALS, RUECKPRALL_MINDESTTEMPO } from '../src/shared/config/terrain.js';
import { SeededRandom } from '../src/shared/prng.js';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');

function quelle(datei) { return readFileSync(resolve(WURZEL, datei), 'utf8'); }

function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function karte(seed, width = 640, height = 360, extra = {}) {
  return erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width, height, ...extra });
}

function autonomMatch(seed = 4242) {
  const m = new MatchController({
    seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom',
    turnDurationMs: 1_000_000, maxRounds: 30,
  });
  m.start();
  m.consumeEvents();
  return m;
}

/**
 * Sucht eine Spalte, deren BODEN Zeile das gesuchte Material trägt — und
 * deren Oberfläche einigermaßen flach ist (sonst rutscht die Figur den Hang
 * hinunter und die Messung wäre eine andere).
 *
 * Gelesen wird die Oberflächenzeile (`boden`), denn genau dort liest auch der
 * Motor: Er nimmt den tiefsten Punkt des Körpers, und der liegt auf dem Grund.
 */
function findeSpalte(match, key, { steigung = 6 } = {}) {
  for (let x = 80; x < match.width - 80; x += 3) {
    const boden = match.surfaceYAt(x);
    if (boden <= 0) continue;
    if (match.materialAt(x, boden).key !== key) continue;
    const links = match.surfaceYAt(x - 6);
    const rechts = match.surfaceYAt(x + 6);
    if (links <= 0 || rechts <= 0) continue;
    if (Math.abs(links - boden) > steigung || Math.abs(rechts - boden) > steigung) continue;
    return { x, boden };
  }
  return null;
}

/**
 * Lässt die Figur aufsetzen (bis `isGrounded` gilt) und liefert die Zahl der
 * Schritte. Der Motor setzt eine landende Figur auf die Oberfläche; die
 * Schwerkraft zieht sie danach wieder herunter — ein paar Schritte genügen.
 */
function lasseAufsetzen(match, spielerId, maxSchritte = 60) {
  for (let i = 0; i < maxSchritte; i += 1) {
    match.step();
    match.consumeEvents();
    if (match.isGrounded(spielerId)) return i + 1;
  }
  return 0;
}

/** Setzt eine Figur über eine Spalte und lässt sie aufsetzen. */
function setzeAb(match, spielerId, spalte, { hoehe = 60, vy = 0 } = {}) {
  match.world.setComponent(spielerId, 'Position', 'x', spalte.x);
  match.world.setComponent(spielerId, 'Position', 'y', spalte.boden - PLAYER_HALF_HEIGHT - hoehe);
  match.world.setComponent(spielerId, 'Velocity', 'x', 0);
  match.world.setComponent(spielerId, 'Velocity', 'y', vy);
}

// ---------------------------------------------------------------- Der Seed

test('Derselbe Seed ergibt dasselbe Materialfeld', () => {
  /*
   * Die Grundzusage des Projekts — für ein Feld, das in einem Generator mit
   * bis zu acht Versuchen entsteht, nicht selbstverständlich.
   */
  const a = karte(4242);
  const b = karte(4242);

  assert.deepEqual([...a.material.feld], [...b.material.feld]);
  assert.equal(a.material.spalten, b.material.spalten);
  assert.equal(a.material.zelle, b.material.zelle);
});

test('Verschiedene Seeds ergeben verschiedene Materialfelder', () => {
  const a = karte(1000);
  const b = karte(2000);
  assert.notDeepEqual([...a.material.feld], [...b.material.feld]);
});

test('Der Seed entscheidet — ein übergebener Wunsch wird ignoriert', () => {
  /*
   * DIE Prüfung der Vorgabe „der Seed entscheidet alles\". Wer ein Material
   * mitgibt, darf die Karte nicht formen können — sonst gäbe es doch eine
   * Einstellung.
   */
  const ohne = karte(777);
  const mitWunsch = karte(777, 640, 360, {
    material: 'ice', boden: 'gummi', typ: 'eis', preset: 'gletscher',
  });

  assert.deepEqual([...mitWunsch.material.feld], [...ohne.material.feld],
    'ein übergebenes Material hat das Feld verändert — der Generator ist nicht autonom');
  assert.deepEqual([...mitWunsch.bitmap], [...ohne.bitmap],
    'ein übergebenes Material hat die Karte verändert');
});

test('Das Materialfeld verschiebt den Kartenzufall nicht', () => {
  /*
   * Der Beleg für den eigenen Seed-Zweig: Ein `fork` liest den Elternstrom
   * nicht an. Wer stattdessen ein paar `rng.next()` einschiebt, verschiebt
   * alle folgenden Züge — und damit, welche Karte ein misslungener Versuch
   * beim nächsten Mal zieht.
   */
  const a = karte(999);

  const rng = new SeededRandom(999);
  rng.fork(0x4D4154);          // nur abzweigen — darf nichts verbrauchen
  const b = erzeugeAutonomeKarte({ rng, width: 640, height: 360 });

  assert.deepEqual([...b.bitmap], [...a.bitmap],
    'der Material-Zweig verbraucht den Kartenzufall');
  assert.deepEqual([...b.surface], [...a.surface]);
  assert.equal(b.wasserY, a.wasserY);
});

// -------------------------------------------------------------- Das Feld

test('Jede Karte trägt Erde, Eis und Gummi — mehrheitlich Erde', () => {
  /*
   * Ein Sonderboden ist ein FUNDSTÜCK: Er muss vorkommen (sonst wäre die
   * Eigenschaft wirkungslos), darf aber nicht die Regel sein (sonst wäre der
   * Boden kein Boden mehr).
   */
  let eis = 0;
  let gummi = 0;

  for (let i = 0; i < 12; i += 1) {
    const k = karte(70000 + i * 1237, 1280, 720);
    const z = zaehleMaterialien(k.material);
    const normal = z.get('normal') ?? 0;
    const gesamt = k.material.feld.length;

    if ((z.get('ice') ?? 0) > 0) eis += 1;
    if ((z.get('rubber') ?? 0) > 0) gummi += 1;

    assert.ok(normal / gesamt > 0.5,
      `Seed ${70000 + i * 1237}: nur ${(normal / gesamt * 100).toFixed(0)} % Erde — `
      + 'der Sonderboden ist zur Regel geworden');
  }

  assert.equal(eis, 12, 'nicht jede Karte hatte eine Eisfläche');
  assert.equal(gummi, 12, 'nicht jede Karte hatte eine Gummi-Fläche');
});

test('materialAmPunkt begrenzt auf die Karte und fällt ohne Feld auf Erde zurück', () => {
  const k = karte(4711);

  // Innerhalb der Zelle: dieselbe Antwort.
  assert.equal(materialAmPunkt(k.material, 5, 5).key, materialAmPunkt(k.material, 60, 60).key);

  // Außerhalb der Karte: die Randzelle, kein Absturz.
  assert.equal(materialAmPunkt(k.material, -999, -999).key, materialAmPunkt(k.material, 0, 0).key);
  assert.equal(
    materialAmPunkt(k.material, 999999, 999999).key,
    materialAmPunkt(k.material, 640 - 1, 360 - 1).key,
  );

  // Ohne Feld (1D-Gelände, alte Replays): Erde.
  assert.equal(materialAmPunkt(null, 10, 10).key, 'normal');
  assert.equal(materialAmPunkt(undefined, 10, 10).key, 'normal');
});

test('Der Katalog hat Erde als Vorgabe und unbekannte Kennungen fallen darauf zurück', () => {
  assert.equal(TERRAIN_MATERIALS[0].key, 'normal');
  assert.equal(TERRAIN_MATERIALS[0].rutschigkeit, 0);
  assert.equal(TERRAIN_MATERIALS[0].rueckprall, 0);

  const eis = TERRAIN_MATERIALS.find(m => m.key === 'ice');
  const gummi = TERRAIN_MATERIALS.find(m => m.key === 'rubber');
  assert.ok(eis.rutschigkeit > 0 && eis.rueckprall === 0, 'Eis muss rutschen, nicht federn');
  assert.ok(gummi.rueckprall > 0 && gummi.rutschigkeit === 0, 'Gummi muss federn, nicht rutschen');
});

// -------------------------------------------------------- Der Motor

test('Der Motor liest das Material an GENAU EINER Stelle', () => {
  /*
   * Der Auftrag lautet „an EINER Stelle beim Aufsetzen/Bewegen\". Eine zweite
   * Lesestelle wäre eine zweite Wahrheit über denselben Boden.
   */
  const code = ohneKommentare(quelle('src/engine/match.js'));
  const aufrufe = code.match(/this\.materialAt\(/g) ?? [];
  const auslegungen = code.match(/materialAmPunkt\(/g) ?? [];

  assert.equal(aufrufe.length, 1,
    `match.js liest das Material an ${aufrufe.length} Stellen — erwartet wird 1`);
  assert.equal(auslegungen.length, 1,
    `match.js legt das Feld an ${auslegungen.length} Stellen aus — erwartet wird 1`);
});

test('Nur die autonome Karte trägt Material — das 1D-Gelände nicht', () => {
  /*
   * Die 1D-Gelände (Presets) sind der Zustand von vorher. Ein Materialfeld
   * würde ihre Physik ändern — und alte Replays wären nicht mehr
   * reproduzierbar.
   */
  const autonom = autonomMatch(4242);
  assert.ok(autonom.terrainMaterial, 'die autonome Karte muss ein Materialfeld tragen');
  assert.equal(typeof autonom.materialAt(100, 100).key, 'string');

  const preset = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000,
  });
  preset.start();
  assert.equal(preset.terrainMaterial, null, 'das 1D-Gelände darf kein Feld tragen');
  assert.equal(preset.materialAt(100, 100).key, 'normal',
    'ohne Feld ist der Boden Erde');
});

test('Derselbe Seed ergibt denselben Lauf — auch mit Material', () => {
  /*
   * Das Material ist eine Physik-Eingabe. Ein Zufall darin — oder eine Uhr —
   * würde den Determinismus brechen.
   */
  const a = autonomMatch(5150);
  const b = autonomMatch(5150);

  for (let i = 0; i < 120; i += 1) {
    a.step(); a.consumeEvents();
    b.step(); b.consumeEvents();
  }

  assert.equal(a.stateHash(), b.stateHash(),
    'zwei Läufe mit demselben Seed ergeben verschiedene Zustände');
});

// -------------------------------------------------------- Die Physik

test('Eis nimmt die Bodenreibung: die Figur behält ihr Tempo', () => {
  /*
   * DIE Messung für „rutschig\". Der Motor rechnet die Bodenreibung im
   * Physikschritt; auf Eis wird sie zurückgenommen. Verglichen wird dieselbe
   * Figur mit demselben Anschub auf Eis und auf Erde.
   */
  const match = autonomMatch(4242);
  const spieler = match.activePlayerId;

  const eis = findeSpalte(match, 'ice');
  const erde = findeSpalte(match, 'normal');
  assert.ok(eis, 'diese Karte muss eine Eisfläche haben');
  assert.ok(erde, 'diese Karte muss Erde haben');

  const tempoNach = (spalte) => {
    setzeAb(match, spieler, spalte, { hoehe: 4 });
    assert.ok(lasseAufsetzen(match, spieler) > 0,
      'die Figur muss aufsetzen');

    match.world.setComponent(spieler, 'Velocity', 'x', 5);
    match.step();
    match.consumeEvents();
    return match.world.getComponent(spieler, 'Velocity', 'x') ?? 0;
  };

  const aufEis = Math.abs(tempoNach(eis));
  const aufErde = Math.abs(tempoNach(erde));

  assert.ok(aufEis > 4.8,
    `auf Eis muss das Tempo erhalten bleiben — gemessen ${aufEis.toFixed(3)} statt ~5`);
  assert.ok(aufEis > aufErde,
    `Eis (${aufEis.toFixed(3)}) muss schneller gleiten als Erde (${aufErde.toFixed(3)})`);
});

test('Gummi ist federnd: eine landende Figur prallt zurück', () => {
  /*
   * DIE Messung für „federnd\". Eine Figur fällt auf Gummi; nach dem Aufsetzen
   * muss ein NEGATIVES senkrechtes Tempo entstehen (Rückprall nach oben).
   */
  const match = autonomMatch(4242);
  const spieler = match.activePlayerId;

  const gummi = findeSpalte(match, 'rubber');
  assert.ok(gummi, 'diese Karte muss eine Gummi-Fläche haben');

  setzeAb(match, spieler, gummi, { hoehe: 60, vy: 4 });

  let rueckprall = null;
  for (let i = 0; i < 90; i += 1) {
    match.step();
    match.consumeEvents();
    const vy = match.world.getComponent(spieler, 'Velocity', 'y') ?? 0;
    if (vy < 0) { rueckprall = vy; break; }
  }

  assert.ok(rueckprall !== null && rueckprall < 0,
    'auf Gummi muss die Figur nach dem Aufsetzen nach OBEN federn (vy < 0)');
});

test('Der Rückprall klingt aus — eine Figur auf Gummi hüpft nicht ewig', () => {
  /*
   * Ohne die Mindestschwelle würde jeder Rückprall einen neuen Aufprall
   * erzeugen: Die Figur käme nie zur Ruhe, und ein Zug wäre nicht mehr zu
   * Ende zu bringen.
   */
  const match = autonomMatch(4242);
  const spieler = match.activePlayerId;
  const gummi = findeSpalte(match, 'rubber');
  assert.ok(gummi);

  setzeAb(match, spieler, gummi, { hoehe: 24, vy: RUECKPRALL_MINDESTTEMPO + 1 });

  for (let i = 0; i < 400; i += 1) { match.step(); match.consumeEvents(); }

  assert.ok(match.isGrounded(spieler),
    'nach 400 Schritten muss die Figur zur Ruhe gekommen sein');
  const vy = Math.abs(match.world.getComponent(spieler, 'Velocity', 'y') ?? 0);
  assert.ok(vy <= RUECKPRALL_MINDESTTEMPO,
    `das Federn klingt nicht aus (|vy| = ${vy.toFixed(3)})`);
});
