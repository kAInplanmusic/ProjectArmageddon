/**
 * systemd-Vorlagen (DEP-4/REL-2) statisch geprüft: Release-Ablage über `current`, Härtung,
 * Bremse unabhängig vom Dienst. Ob sie auf einem echten Knoten anschließen, prüft das nicht
 * (dafür docs/deploy-plan.md Abschnitt 5 und der Nachweis in docs/betrieb-INSTANZ.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';

const lies = name => readFileSync(join(WURZEL, 'deploy/systemd', name), 'utf8');
const werte = (text, schluessel) => [...text.matchAll(new RegExp(`^${schluessel}=(.*)$`, 'gm'))].map(m => m[1].trim());

test('Spielserver läuft aus /opt/projectarmageddon/current, Skripte existieren im Repo', () => {
  const unit = lies('projectarmageddon.service');
  assert.deepEqual(werte(unit, 'WorkingDirectory'), ['/opt/projectarmageddon/current']);
  for (const befehl of [...werte(unit, 'ExecStart'), ...werte(unit, 'ExecStopPost')]) {
    const pfad = befehl.replace(/^-/, '').split(/\s+/)[0];
    assert.match(pfad, /^\/opt\/projectarmageddon\/current\//, pfad);
    assert.ok(existsSync(join(WURZEL, pfad.replace('/opt/projectarmageddon/current/', ''))), `${pfad} fehlt im Repo`);
  }
  const bremse = lies('projectarmageddon-idle.service');
  for (const befehl of werte(bremse, 'ExecStart')) {
    const pfad = befehl.split(/\s+/)[0];
    assert.ok(existsSync(join(WURZEL, pfad.replace('/opt/projectarmageddon/current/', ''))), `${pfad} fehlt im Repo`);
  }
});

test('Spielserver: gehärtet, nur Loopback, kein Dauer-Neustart gegen die Bremse', () => {
  const unit = lies('projectarmageddon.service');
  for (const [k, v] of [
    ['NoNewPrivileges', 'yes'], ['ProtectSystem', 'strict'], ['ProtectHome', 'yes'], ['PrivateTmp', 'yes'],
    ['PrivateDevices', 'yes'], ['ProtectProc', 'invisible'], ['RestrictSUIDSGID', 'yes'], ['CapabilityBoundingSet', ''],
    ['User', 'pa'], ['Restart', 'on-failure'], ['Environment', 'HOST=127.0.0.1'], ['Environment', 'PA_BUILD=0'],
  ]) assert.ok(werte(unit, k).includes(v), `${k}=${v} fehlt`);
  assert.ok(!werte(unit, 'Restart').includes('always'), 'Restart=always würde die Idle-Bremse aushebeln');
  assert.ok(Number(werte(unit, 'TimeoutStopSec')[0]) >= 60, 'Zeit zum Sichern beim Stopp');
});

test('Idle-Bremse: eigener Timer, nur scharf mit Marker', () => {
  const dienst = lies('projectarmageddon-idle.service');
  const timer = lies('projectarmageddon-idle.timer');
  assert.deepEqual(werte(dienst, 'ConditionPathExists'), ['/etc/projectarmageddon/ist-gemietet']);
  assert.deepEqual(werte(timer, 'Unit'), ['projectarmageddon-idle.service']);
  assert.ok(werte(timer, 'OnUnitActiveSec').length === 1);
  assert.deepEqual(werte(timer, 'WantedBy'), ['timers.target']);
});
