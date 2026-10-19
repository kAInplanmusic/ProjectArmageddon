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
import { MatchController } from '../src/engine/match.js';
import { hashState } from '../src/engine/stateSnapshot.js';

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

test('A-2: dropWeapon lehnt Spieler ab, die nicht am Zug sind, und verbraucht keinen Zufall', () => {
  /*
   * Audit-Befund: `dropWeapon` prüfte nur Match-Status und Lebenszeichen, nicht
   * den aktiven Spieler. Ein Spieler, der nicht am Zug ist, konnte Kisten werfen
   * und dabei den gemeinsamen Zufallsstrom konsumieren — ein Determinismus-Bruch,
   * kein Komfortproblem.
   *
   * Der Test fährt zwei identische Matches: Im ersten wird der verbotene Abwurf
   * versucht (und muss abgelehnt werden), im zweiten nicht. Danach schießt in
   * beiden der aktive Spieler mit denselben Werten. Stimmen die Zustandshashes
   * überein, wurde kein Zufall verbraucht.
   */
  const seed = 4242;
  const winkel = 1.1;
  const kraft = 60;

  const matchMitVersuch = new MatchController({ seed, teams: 2, playersPerTeam: 2 });
  matchMitVersuch.start();
  const aktiver = matchMitVersuch.activePlayerId;
  const anderer = matchMitVersuch.getState().entities
    .find(entity => entity.entityId !== aktiver && entity.alive);

  const abgelehnt = matchMitVersuch.dropWeapon(anderer.entityId, anderer.activeWeaponId);
  assert.equal(abgelehnt.ok, false, 'Ein Spieler, der nicht am Zug ist, darf nicht abwerfen');
  assert.ok(
    abgelehnt.errors.some(fehler => fehler.includes('aktive Spieler')),
    `Fehlermeldung muss den aktiven Spieler nennen: ${abgelehnt.errors.join(', ')}`
  );

  const schussMitVersuch = matchMitVersuch.fire(aktiver, winkel, kraft);
  assert.equal(schussMitVersuch.ok, true);

  const matchOhneVersuch = new MatchController({ seed, teams: 2, playersPerTeam: 2 });
  matchOhneVersuch.start();
  const schussOhneVersuch = matchOhneVersuch.fire(matchOhneVersuch.activePlayerId, winkel, kraft);
  assert.equal(schussOhneVersuch.ok, true);

  assert.equal(
    hashState(matchMitVersuch.getState()),
    hashState(matchOhneVersuch.getState()),
    'Der abgelehnte Abwurf hat den Zufallsstrom verbraucht — die Partien laufen auseinander'
  );
});
