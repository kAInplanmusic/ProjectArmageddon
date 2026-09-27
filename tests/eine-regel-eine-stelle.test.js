/**
 * Wächter: EINE Regel, EINE Stelle — für die Zahlen, die doppelt im Baum lagen.
 *
 * ## Warum dieser Test
 *
 * Der Audit hat vier Doppelregeln gefunden. Zwei davon sind hier festgenagelt,
 * weil ihr Auseinanderlaufen KEINEN Fehler wirft, sondern still falsches
 * Verhalten erzeugt:
 *
 *  - Der SIMULATIONSTAKT stand zweimal (`SIMULATION_HZ = 60` im Server,
 *    `TICKS_PER_SECOND = 60` im Client). Läuft er auseinander, zählt der Client
 *    Ticks anders als der Server sie erzeugt — die Eingabe bezieht sich auf den
 *    falschen Tick, und niemand sieht eine Meldung.
 *  - Das TREFFERFELD des Spielers stand zweimal (Motor und Projektil-System).
 *    Läuft es auseinander, geht ein Schuss durch die Figur hindurch, ohne dass
 *    eine Prüfung anschlägt.
 *
 * Deshalb wird nicht nur der WERT geprüft, sondern die ANZAHL DER STELLEN: Eine
 * zweite Definition lässt diesen Test fallen, egal welchen Wert sie hat.
 *
 * Der Fall `PRIMARY_BIOME_BY_PRESET` zeigt, warum das eine TABELLE braucht und
 * nicht bloß die Maschinerie: Der Bezeichner stand in ZWEI Dateien definiert
 * (`src/shared/config/backdrops.js` und `src/shared/config/scenery.js`), und
 * weil er hier nicht eingetragen war, hat der Wächter die Doppelung nie
 * gesehen. Die Definitionsstelle ist jetzt allein `backdrops.js`; `scenery.js`
 * reicht den Wert über eine Re-Export-Naht (`export { … };`) weiter. Genau
 * diese Naht erkennt `definitionsstellen` NICHT als Definition (siehe dort),
 * deshalb ist die Naht erlaubt und der Eintrag unten die einzige Zusage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SIMULATION_HZ, TICK_MS } from '../src/shared/config/network.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../src/shared/config/player.js';
import { TICK_MS as TICK_MS_CLIENT } from '../src/client/networkClient.js';
import { SIMULATION_HZ as SIMULATION_HZ_SERVER } from '../src/server/gameServer.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function quelldateien(ordner) {
  const ergebnis = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...quelldateien(voll));
    else if (eintrag.name.endsWith('.js')) ergebnis.push(voll);
  }
  return ergebnis;
}

const DATEIEN = quelldateien(path.join(ROOT, 'src'));

/**
 * Sammelt alle Stellen, an denen `NAME` DEFINIERT wird.
 *
 * Absichtlich eng: `const NAME = …` (mit optionalem `export`). Eine
 * Weiterleitung wie `export { NAME };` ist KEINE Definition und darf deshalb
 * mehrfach vorkommen — genau das ist der Sinn einer Re-Export-Naht.
 *
 * `NAME` wird als Wortgrenze gesucht, damit `PLAYER_HALF_WIDTH` nicht schon
 * durch `PLAYER_HALF_WIDTH_EXTRA` trifft.
 */
function definitionsstellen(name, dateien = DATEIEN) {
  /*
   * Auch `function NAME(` zaehlt als Definition. Vorher wurde nur die
   * const-Form erkannt — und `ohneKommentare` stand in vier der sechs Kopien
   * als `function`, waere also durch die Wache geschluepft. Eine Wache, die
   * die haeufigere Schreibweise nicht sieht, ist keine.
   */
  const muster = new RegExp(
    `^\\s*(?:export\\s+)?(?:const\\s+${name}\\s*=|function\\s+${name}\\s*\\()`,
  );
  return dateien
    .filter(datei => fs.readFileSync(datei, 'utf8').split('\n').some(zeile => muster.test(zeile)))
    .map(datei => path.relative(ROOT, datei).split(path.sep).join('/'));
}

const EINE_STELLE = [
  ['SIMULATION_HZ', 'src/shared/config/network.js'],
  ['TICK_MS', 'src/shared/config/network.js'],
  ['PLAYER_HALF_WIDTH', 'src/shared/config/player.js'],
  ['PLAYER_HALF_HEIGHT', 'src/shared/config/player.js'],
  // Stand als Doppelregel in backdrops.js UND scenery.js. Letzteres ist jetzt
  // reine Re-Export-Naht — siehe Kopfkommentar und `definitionsstellen`.
  ['PRIMARY_BIOME_BY_PRESET', 'src/shared/config/backdrops.js'],
];

for (const [name, erwartet] of EINE_STELLE) {
  test(`${name} wird an genau EINER Stelle definiert`, () => {
    const stellen = definitionsstellen(name);
    assert.deepEqual(stellen, [erwartet],
      `${name} muss allein in ${erwartet} definiert sein, gefunden in: ${stellen.join(', ') || '—'}`);
  });
}

/*
 * DIESELBE FRAGE FUER DIE TESTSEITE.
 *
 * `DATEIEN` deckt nur `src/` ab. Genau dort lag der blinde Fleck: `ohneKommentare`
 * stand in SECHS Testdateien, in VIER Fassungen (siehe
 * `tests/helfer/ohne-kommentare.js` fuer die Belege und die Entscheidung).
 * Eine Regel an sechs Stellen ist sechs Regeln — und zwei davon urteilten
 * ueber dieselbe Datei verschieden.
 *
 * Diese Wache meldet die naechste Kopie. Sie ist der Grund, warum die
 * Zusammenfuehrung nicht in einem halben Jahr wieder auseinanderlaeuft.
 */
const TESTDATEIEN = quelldateien(path.join(ROOT, 'tests'));

const EINE_STELLE_TESTS = [
  ['ohneKommentare', 'tests/helfer/ohne-kommentare.js'],
];

for (const [name, erwartet] of EINE_STELLE_TESTS) {
  test(`${name} wird an genau EINER Stelle definiert (Testseite)`, () => {
    const stellen = definitionsstellen(name, TESTDATEIEN);
    assert.deepEqual(stellen, [erwartet],
      `${name} muss allein in ${erwartet} definiert sein, gefunden in: ${stellen.join(', ') || '—'}`);
  });
}

test('Der Takt ist in Server und Client derselbe', () => {
  /*
   * Die Gegenprobe zum Test oben: Auch mit nur einer Definition könnte eine
   * Seite eine EIGENE Zahl weiterreichen. Hier wird gemessen, was beide Seiten
   * tatsächlich benutzen.
   */
  assert.equal(SIMULATION_HZ_SERVER, SIMULATION_HZ,
    'Der Server darf einen anderen Takt lesen als der gemeinsame Wert');
  assert.equal(TICK_MS_CLIENT, TICK_MS,
    'Der Client darf eine andere Tickdauer lesen als der gemeinsame Wert');
  assert.equal(TICK_MS, 1000 / 60, 'Die Tickdauer muss aus dem Takt folgen');
});

test('Das Trefferfeld ist auf beiden Seiten dasselbe', () => {
  /*
   * Motor und Projektil-System lesen jetzt dieselbe Zahl. Geprüft wird die
   * Zusage, nicht der Wert: Es sind die Maße eines Körpers von 14 × 20 px.
   */
  assert.equal(PLAYER_HALF_WIDTH, 7);
  assert.equal(PLAYER_HALF_HEIGHT, 10);
  assert.equal(PLAYER_HALF_WIDTH * 2, 14, 'Voller Körper: 14 px breit');
  assert.equal(PLAYER_HALF_HEIGHT * 2, 20, 'Voller Körper: 20 px hoch');
});

test('Die abgeschafften Zweitnamen sind nirgends mehr im CODE zu finden', () => {
  /*
   * `TICKS_PER_SECOND` war ein Export OHNE Leser (Audit-Befund) und der zweite
   * Name für denselben Takt. Er ist entfernt — und darf als CODE nicht
   * zurückkommen.
   *
   * KOMMENTARE WERDEN VORHER ENTFERNT, und das ist Absicht: Die Fundstelle
   * selbst zu benennen ist in diesem Projekt üblich („Hier stand früher …")
   * und hilft dem nächsten Leser. Geprueft wird, was der Motor LIEST, nicht was
   * in einer Erklärung steht — sonst bestraft der Wächter die Dokumentation.
   * Dasselbe Vorgehen nutzt `tests/source-boundaries.test.js`.
   */
  const treffer = DATEIEN
    .filter(datei => ohneKommentare(fs.readFileSync(datei, 'utf8')).includes('TICKS_PER_SECOND'))
    .map(datei => path.relative(ROOT, datei).split(path.sep).join('/'));
  assert.deepEqual(treffer, [],
    `TICKS_PER_SECOND ist abgeschafft, steht aber noch im Code von: ${treffer.join(', ')}`);
});
