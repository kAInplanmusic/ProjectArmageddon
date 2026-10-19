/**
 * Tests zu den verifizierten Befunden aus docs/audit-2026-10-09/01-verifizierte-befunde.md.
 *
 * Jeder Test ist der Wächter für genau einen Befund. Die Datei wächst mit jedem
 * Fix; die Reihenfolge folgt der Schwere im Audit (A vor B vor C).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInput } from '../src/shared/validation.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const validationQuelle = ohneKommentare(
  fs.readFileSync(path.join(ROOT, 'src', 'shared', 'validation.js'), 'utf8')
);

test('B-1: Die Winkelprüfung hängt nicht an der clientValidatedInputs-Liste', () => {
  // Verhalten: Ein ungültiger Winkel wird abgelehnt, ein gültiger angenommen.
  assert.equal(normalizeInput({ angle: 9, power: 50 }).valid, false);
  assert.equal(normalizeInput({ angle: 1, power: 50 }).valid, true);

  // Quelltext-Wächter: Die Prüfung muss bedingungslos laufen. Die doppelte
  // Verneinung (`!includes('angle') === false`) schaltete die Validierung genau
  // dann ab, wenn der Client die Prüfung NICHT übernahm — eine stille
  // Sicherheitslücke, die auf einer Zeichensetzung beruhte.
  assert.ok(
    validationQuelle.includes('if (!isValidAngle(angle))'),
    'Die Winkelprüfung muss bedingungslos laufen (if (!isValidAngle(angle)))'
  );
  assert.ok(
    !validationQuelle.includes("clientValidatedInputs.includes('angle')"),
    'Die Winkelprüfung darf nicht an der clientValidatedInputs-Liste hängen'
  );
});
