/**
 * Tests: Der Wanduhr-Zugriff `Date.now()` im Replay-Modul.
 *
 * ## Der Befund
 *
 * Ein Tiefen-Audit fand genau EINE Wanduhr-Fundstelle im Engine-Ordner:
 *
 * ```
 * src/engine/replay.js:66:    this.#startedAt = Date.now();
 * ```
 *
 * Die Projektregel lautet: Alles, was den Spielzustand bestimmt, muss aus dem
 * Seed kommen. Ein `Date.now()` im Simulationspfad wäre deshalb ein
 * Determinismus-Fehler.
 *
 * ## Die Einordnung (Fall b: Metadaten, keine Wirkung — aber eine Falle)
 *
 * Gemessen, nicht geschlossen:
 *
 * ```
 * Baseline  : shots=21 ticks=1162 hash=f2d232c3 createdAt=1790443774574
 * Hash der Wiedergabe (unverstellte Uhr): f2d232c3
 * Mit wilder Uhr: recorder.createdAt=1000003600000 hash(record)=f2d232c3 hash(play)=f2d232c3
 * createdAt=0            -> hash(play)=f2d232c3  identisch zur Baseline: true
 * createdAt=4102444800000 -> hash(play)=f2d232c3  identisch zur Baseline: true
 * createdAt=-1           -> hash(play)=f2d232c3  identisch zur Baseline: true
 * ```
 *
 * Das Feld hat genau EINEN Leser: `toJSON()` schreibt es als `createdAt` in die
 * Datei. `ReplayRecorder.fromJSON` — der Weg, den jede Wiedergabe geht — liest
 * `format`, `seed`, `config`, `totalTicks`, `entries` und `rounds`; `createdAt`
 * übernimmt es nicht einmal. Der Zustandshash kommt aus `getState()` und damit
 * aus `MatchController#zustandsQuelle()` — dort steht kein Zeitstempel.
 *
 * Es ist trotzdem eine FALLE: Die Datei ist nicht byte-gleich. Wer je zwei
 * Aufzeichnungen desselben Matches über die JSON-Bytes vergleicht, sieht eine
 * Abweichung, die keine ist. Der Determinismusbeleg gilt für den ZUSTANDSHASH,
 * nicht für die Datei.
 *
 * ## Was diese Datei festhält
 *
 * - dass die Wanduhr den Hash nicht bestimmt (mit verstellter Uhr gemessen),
 * - dass `createdAt` die Wiedergabe nicht verändert,
 * - dass `#startedAt` keinen zweiten Leser bekommt (Quelltext-Wächter),
 * - dass die Begründung an der Fundstelle nicht verschwindet.
 *
 * Der Quelltext-Wächter prüft sich selbst: Ein gekaperter Text mit einem Leser
 * im Simulationspfad MUSS anschlagen — sonst wäre der Wächter wertlos.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer, playReplay } from '../src/engine/replay.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const REPLAY_QUELLE = path.join(ROOT, 'src', 'engine', 'replay.js');

/** Die echte Uhr — wird von den Tests mit der verstellten Uhr getauscht. */
const echteUhr = Date.now;

/**
 * Zeichnet ein kurzes Match auf — bewusst klein, damit der Test schnell bleibt.
 *
 * Der Aufbau entspricht dem Helfer in `tests/replay.test.js`: Über `getState()`
 * den aktiven Spieler holen und mit `match.fire()` schießen. Ohne Schüsse wäre
 * der Zustand arm und der Test bewiese weniger.
 */
function zeichneAuf() {
  const seed = 20260926;
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 600, maxRounds: 3,
  });
  match.start();

  const recorder = new ReplayRecorder({
    seed, teams: 2, playersPerTeam: 1, preset: 'hills',
    maxRounds: match.maxRounds, turnDurationMs: match.turnDurationMs,
  });

  let schuesse = 0;
  let schutz = 0;
  while (match.status === 'playing' && schutz < 12_000) {
    const state = match.getState();
    const aktiv = state.activePlayerId;
    if (aktiv !== null && state.turnElapsedMs < 20) {
      const angle = Math.PI / 4 + (schuesse % 5) * 0.07;
      const power = 60 + (schuesse % 4) * 9;
      if (match.fire(aktiv, angle, power).ok) {
        recorder.recordInput({ tick: match.world.tickCount, playerId: aktiv, angle, power });
        schuesse += 1;
      }
    }
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  recorder.finalize(match.world.tickCount);
  return { match, recorder, schuesse };
}

/** Führt `fn` mit einer auf `wert` eingefrorenen Uhr aus und stellt sie danach wieder her. */
function mitUhr(wert, fn) {
  Date.now = () => wert;
  try {
    return fn();
  } finally {
    Date.now = echteUhr;
  }
}

// ------------------------------------------------------------------- Metadatum

test('Der Zeitstempel steht als `createdAt` im Kopf — sonst nirgends', () => {
  /*
   * Der Nachweis, dass das Feld ein Metadatum ist: Es taucht in der Datei auf
   * (Lesbarkeit: „wann wurde aufgenommen"), aber NICHT in `config` und nicht in
   * `seed` — also nicht in dem Teil, aus dem eine Wiedergabe das Match baut.
   */
  const SENTINEL = 1_234_567_890_123;

  const json = mitUhr(SENTINEL, () => {
    const recorder = new ReplayRecorder({ seed: 5, teams: 2, playersPerTeam: 1 });
    // Über die Serialisierung prüfen, nicht über den internen Zustand: Genau
    // die Datei ist das, was aufbewahrt wird.
    return JSON.parse(recorder.serialize());
  });

  assert.equal(json.createdAt, SENTINEL,
    '`createdAt` muss der Zeitstempel der Aufzeichnung sein');
  assert.equal(typeof json.seed, 'number', 'der Seed bleibt eine Zahl');
  assert.equal(json.seed, 5);
  assert.ok(!('startedAt' in json),
    '`createdAt` ist der Vertragsname — das interne Feld darf nicht mitgeschrieben werden');
  assert.ok(!('createdAt' in json.config),
    '`createdAt` gehört NICHT in `config`: `config` ist die Eingabe der Wiedergabe');
});

test('`createdAt` verändert den Zustandshash der Wiedergabe nicht', () => {
  /*
   * Die Kernmessung: Dasselbe Dokument mit beliebig verstelltem Zeitstempel muss
   * denselben Zustandshash ergeben. Genau das wäre nicht so, wenn der Zeitstempel
   * in den Simulationspfad (Seed, Timer, Zustand) flösse.
   */
  const { match, recorder } = zeichneAuf();
  assert.ok(match.world.tickCount > 0, 'Testaufbau: das Match muss Takte gelaufen sein');

  const erwarteterHash = match.stateHash();
  const original = JSON.parse(recorder.serialize()).createdAt;
  const weitInDerZukunft = original + 365 * 24 * 3600 * 1000;

  for (const wert of [0, 1, -1, weitInDerZukunft]) {
    const dokument = JSON.parse(recorder.serialize());
    dokument.createdAt = wert;

    const ergebnis = playReplay(dokument);
    assert.equal(ergebnis.match.stateHash(), erwarteterHash,
      `createdAt=${wert} verändert den Zustandshash`);
    assert.equal(ergebnis.match.world.tickCount, match.world.tickCount,
      `createdAt=${wert} verändert die Tickzahl`);
    assert.equal(ergebnis.appliedInputs, recorder.entryCount,
      `createdAt=${wert} verändert die angewendeten Eingaben`);
  }
});

test('Die Wiedergabe übernimmt `createdAt` nicht — sie stempelt selbst', () => {
  /*
   * Der zweite Teil des Belegs: `fromJSON` liest das Feld nicht einmal. Ein
   * Replay trägt damit keinen fremden Zeitstempel weiter — die Uhr der
   * Wiedergabe berührt den aufgezeichneten Zustand nicht.
   */
  const { recorder } = zeichneAuf();
  const dokument = JSON.parse(recorder.serialize());
  dokument.createdAt = 0;

  const spieler = new ReplayPlayer(dokument);
  const kopf = spieler.recorder.toJSON();

  assert.notEqual(kopf.createdAt, 0,
    '`fromJSON` darf `createdAt` nicht übernehmen — das Feld beschreibt den '
    + 'Aufzeichnungszeitpunkt, nicht den Abspielzeitpunkt');
  assert.ok(Number.isFinite(kopf.createdAt), 'die Wiedergabe stempelt einen gültigen Wert');
});

// ---------------------------------------------------------------- verstellte Uhr

test('Eine verstellte Wanduhr ändert Aufzeichnung und Wiedergabe nicht', () => {
  /*
   * Der direkte Gegentest zu einem `Date.now()` im Simulationspfad: Hier läuft
   * die Uhr bei jedem Aufruf um eine Stunde weiter — absurd, aber genau das
   * deckt einen versteckten Lesezugriff auf. Der aufgezeichnete Verlauf und der
   * Zustandshash müssen identisch zum Lauf mit echter Uhr sein.
   */
  const basis = zeichneAuf();
  assert.ok(basis.schuesse > 0, 'Testaufbau: es müssen Schüsse aufgezeichnet werden');
  const basisHash = basis.match.stateHash();

  let takte = 0;
  let gestoert;
  try {
    // Kein fester Wert: Die Uhr SPRINGT bei jedem Aufruf.
    Date.now = () => { takte += 1; return 1_000_000_000_000 + takte * 3_600_000; };
    gestoert = zeichneAuf();
  } finally {
    Date.now = echteUhr;
  }

  assert.notEqual(
    gestoert.recorder.toJSON().createdAt,
    basis.recorder.toJSON().createdAt,
    'Testaufbau: unter der verstellten Uhr muss ein anderer Zeitstempel entstehen',
  );
  assert.deepEqual(gestoert.recorder.entries, basis.recorder.entries,
    'Die verstellte Uhr verändert die aufgezeichneten Eingaben');
  assert.equal(gestoert.match.stateHash(), basisHash,
    'Die verstellte Uhr verändert den Zustandshash der Aufzeichnung');

  const wieder = playReplay(JSON.parse(basis.recorder.serialize()));
  assert.equal(wieder.match.stateHash(), basisHash,
    'Die verstellte Uhr verändert den Zustandshash der Wiedergabe');

  /*
   * Und die WIEDERGABE unter der springenden Uhr. Dieser Weg ist nicht
   * nebensächlich: `playReplay` baut über `ReplayRecorder.fromJSON` selbst einen
   * Recorder und liest dabei die Uhr — DERSELBE Code, der die Fundstelle trägt.
   * Käme der Wert von dort in den Zustand, müsste der Hash hier abweichen.
   */
  let abspieltakte = 0;
  let unterUhr;
  try {
    Date.now = () => { abspieltakte += 1; return 4_000_000_000_000 + abspieltakte * 86_400_000; };
    unterUhr = playReplay(JSON.parse(basis.recorder.serialize())).match.stateHash();
  } finally {
    Date.now = echteUhr;
  }
  assert.equal(unterUhr, basisHash,
    'Die verstellte Uhr verändert den Zustandshash der Wiedergabe (fromJSON-Pfad)');
});

// ------------------------------------------------------------ Quelltext-Wächter

/**
 * Zeilen, in denen `#startedAt` vorkommen DARF.
 *
 * Alles andere ist ein neuer Leser — und ein Leser ist der Schritt, der das
 * Metadatum in den Simulationspfad zieht.
 */
const ERLAUBTE_ZEILEN = [
  /^#startedAt;$/,
  /^this\.#startedAt = Date\.now\(\);$/,
  /^createdAt: this\.#startedAt,$/,
];

function istKommentar(zeile) {
  const ohneEinrueckung = zeile.trim();
  return ohneEinrueckung.startsWith('//')
    || ohneEinrueckung.startsWith('*')
    || ohneEinrueckung.startsWith('/*');
}

/**
 * Sucht unerlaubte Lesezugriffe auf `#startedAt` in einem Quelltext.
 * @param {string} quelle
 * @returns {string[]} Verstöße als „Zeile N: Text"
 */
function findeUnzulaessigeLeser(quelle) {
  const verstoesse = [];
  quelle.split('\n').forEach((zeile, index) => {
    if (!zeile.includes('#startedAt')) return;
    if (istKommentar(zeile)) return;
    const text = zeile.trim();
    if (ERLAUBTE_ZEILEN.some(muster => muster.test(text))) return;
    verstoesse.push(`Zeile ${index + 1}: ${text}`);
  });
  return verstoesse;
}

test('`#startedAt` hat genau EINEN Leser — `createdAt` im Kopf', () => {
  const quelle = fs.readFileSync(REPLAY_QUELLE, 'utf8');
  const verstoesse = findeUnzulaessigeLeser(quelle);

  assert.deepEqual(verstoesse, [],
    'Ein neuer Leser von `#startedAt` ist aufgetaucht. Wanduhr-Werte dürfen den '
    + 'Spielzustand nicht bestimmen: Entweder ist es Metadatum (dann `createdAt` '
    + 'im Kopf, wie bisher) oder ein Determinismus-Fehler (dann entfernen oder '
    + 'aus der Tick-Uhr ableiten).');
});

test('Der Wächter greift wirklich — ein Leser im Simulationspfad schlägt an', () => {
  /*
   * Die Selbstprüfung. Ein Wächter, der immer „keine Verstöße" meldet, pinnt
   * nichts. Dieser gekaperte Text enthält genau die Falle, die es zu verhindern
   * gilt: `#startedAt` im Simulationspfad.
   */
  const gekapert = [
    '  #startedAt;',
    '    this.#startedAt = Date.now();',
    '  step() {',
    '    const versatz = this.#startedAt;',
    '  }',
    '      createdAt: this.#startedAt,',
  ].join('\n');

  const verstoesse = findeUnzulaessigeLeser(gekapert);
  assert.equal(verstoesse.length, 1,
    `Der Wächter muss den fremden Leser erkennen, fand aber: ${JSON.stringify(verstoesse)}`);
  assert.match(verstoesse[0], /const versatz = this\.#startedAt;/);
});

test('Es gibt genau EINEN Wanduhr-Zugriff in replay.js', () => {
  /*
   * Die andere Hälfte der Absicherung: `#startedAt` könnte sauber bleiben, während
   * daneben ein zweites `Date.now()` (oder `performance.now()`) in den Ablauf
   * gerät. Der Wächter zählt die Zugriffe.
   */
  const treffer = fs.readFileSync(REPLAY_QUELLE, 'utf8')
    .split('\n')
    .map((zeile, index) => ({ text: zeile.trim(), zeile: index + 1 }))
    .filter(e => !istKommentar(e.text) && /Date\.now\s*\(|performance\.now\s*\(/.test(e.text));

  assert.equal(treffer.length, 1,
    `Erwartet wird genau EIN Wanduhr-Zugriff (der Metadaten-Stempel), gefunden: `
    + JSON.stringify(treffer));
  assert.match(treffer[0].text, /^this\.#startedAt = Date\.now\(\);$/,
    'Der einzige Wanduhr-Zugriff muss der Metadaten-Stempel sein');
});

test('Die Begründung an der Fundstelle nennt die Falle und diesen Test', () => {
  /*
   * Ein Wächter ohne Begründung wird beim nächsten Umbau weggeworfen. Der
   * Kommentar an der Fundstelle muss deshalb sagen, WARUM die Uhr hier stehen
   * darf und wer es beweist.
   */
  const text = fs.readFileSync(REPLAY_QUELLE, 'utf8');
  assert.match(text, /Wanduhr/, 'der Kommentar nennt den Wanduhr-Zugriff nicht');
  assert.match(text, /FALLE/, 'der Kommentar benennt die Falle nicht');
  assert.match(text, /replay-uhr\.test\.js/,
    'der Kommentar verweist nicht auf den Test, der das Feld pint');
});
