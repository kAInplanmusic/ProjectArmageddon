/**
 * Wächter für B-5: Status-Marken online.
 *
 * ## Der Befund
 * `☠ `/`↑` bleiben online fest. Ursache: das Mapping in `onlineViewState`
 * gab nur Figuren mit `shield>0` oder `frozenTurns>0` einen Status-Eintrag.
 * Fehlt der Eintrag, bleibt die alte Marke aus dem letzten Takt bestehen
 * (oder ist leer, je nach Initialisierung) — die Marke „klebt".
 *
 * ## Die Regel
 * Jede Figur bekommt JEDEZ Takt einen Status-Eintrag, auch wenn alle Felder
 * leer sind. Das Protokoll überträgt seit v9 shield/frozenTurns UND die
 * Zustandsmarken (dotsCount, boostMultiplier).
 *
 * ## Nachtrag 2026-10-02 — die Lücke ist geschlossen
 * Dieser Test hielt bis hierher fest, dass DOTS/Boost online „bewusst leer"
 * bleiben. Das war kein Ruhezustand, sondern ein DEFEKT: Wer online vergiftet
 * wurde oder einen Bonus bekam, verlor bzw. gewann Leben ohne jede Marke
 * (`docs/verkabelung.md` §C). Protokoll v9 überträgt beide Werte; der Client
 * füllt sie nicht mehr mit Konstanten. Der Test prüft jetzt die Verdrahtung —
 * ein Rückfall auf `dots: []` fällt sofort auf.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Der EINE Kommentar-Helfer des Projekts — eine zweite Fassung wäre eine zweite
// Regel (tests/eine-regel-eine-stelle.test.js hält das fest).
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('onlineViewState erstellt für jede Figur einen Status-Eintrag', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

  const block = main.match(/const statuses = \{\};[\s\S]{0,700}const entities = \(this\.network/);
  assert.ok(block, 'das Status-Mapping im onlineViewState wurde nicht gefunden');

  // Jede Figur bekommt einen Eintrag — kein if (shield>0 || frozen>0)
  assert.ok(!/if\s*\(\s*\(entity\.shield\s*\?\?\s*0\)\s*>0/.test(block[0]),
    'das Mapping filtert noch nach shield/frozen — alte Marken können kleben bleiben');

  // Die vier Felder müssen gesetzt werden
  assert.ok(/shield/.test(block[0]), 'shield muss gesetzt werden');
  assert.ok(/frozenTurns/.test(block[0]), 'frozenTurns muss gesetzt werden');
  assert.ok(/dots/.test(block[0]), 'dots muss gesetzt werden');
  assert.ok(/boostMultiplier/.test(block[0]), 'boostMultiplier muss gesetzt werden');
});

test('Die Marken kommen aus dem Snapshot, nicht aus Konstanten (Protokoll v9)', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  const block = main.match(/const statuses = \{\};[\s\S]{0,700}const entities = \(this\.network/);
  assert.ok(block, 'das Status-Mapping im onlineViewState wurde nicht gefunden');
  const code = ohneKommentare(block[0]);

  // Kein Rückfall auf die Konstanten, die den Defekt ausgemacht haben.
  assert.ok(!/dots:\s*\[\s*\]/.test(code),
    'dots ist wieder eine Konstante — online gäbe es dann nie eine Giftmarke');
  assert.ok(!/boostMultiplier:\s*1\s*[,}]/.test(code),
    'boostMultiplier ist wieder eine Konstante — online gäbe es dann nie eine Bonusmarke');

  // Und die Quelle muss der übertragene Wert sein.
  assert.ok(/dotsCount/.test(code), 'dots muss aus entity.dotsCount gespeist werden');
  assert.ok(/entity\.boostMultiplier/.test(code),
    'boostMultiplier muss aus entity.boostMultiplier gespeist werden');
});

test('Draht: dotsCount und boostMultiplier stehen im Snapshot (Protokoll v9)', () => {
  const protocol = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'protocol.js'), 'utf8');
  const code = ohneKommentare(protocol);

  assert.match(code, /PROTOCOL_VERSION = 9/, 'die Protokollversion muss 9 sein');
  assert.match(code, /PLAYER_STRIDE = 17/, 'der Spielerblock muss um zwei Bytes gewachsen sein');
  assert.match(code, /MARKS: 1 << 5/, 'das dirty-Bit für die Marken fehlt');
  assert.ok(/view\.setUint8\(offset \+ 15, dotsRaw\)/.test(code),
    'dotsCount wird nicht geschrieben');
  assert.ok(/view\.setUint8\(offset \+ 16, boostRaw\)/.test(code),
    'boostMultiplier wird nicht geschrieben');
  assert.ok(/dotsCount/.test(code) && /boostMultiplier/.test(code),
    'decodeSnapshot gibt die Marken nicht zurück');

  // Delta-Basis: ohne die Rohwerte meldet der Encoder jede Figur als geändert.
  const basis = code.split('toDeltaBase')[1] ?? '';
  assert.ok(/dotsRaw/.test(basis),
    'die Delta-Basis führt dotsRaw nicht — das Delta spart dann nichts');

  // Der Zustand muss die Werte überhaupt liefern.
  const zustand = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'engine', 'stateSnapshot.js'), 'utf8'),
  );
  assert.ok(/dotsCount:/.test(zustand), 'der Zustand liefert dotsCount nicht');
  assert.ok(/boostMultiplier:/.test(zustand), 'der Zustand liefert boostMultiplier nicht');
});
