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

/* ------------------------------------------------------------------------- *
 * Echte Einheitenprüfung mit systemd-analyze (statt nur Zeilenvergleich):
 * Die Vorlagen werden in ein temporäres Verzeichnis kopiert und die Pfade
 * /opt/projectarmageddon/current auf den Repo-Ort umgeschrieben. Damit prüft
 * systemd die Syntax und die Härtung, ohne dass ein Knoten nötig ist. Der
 * ANSCHLUSS (Benutzer `pa`, Rechte, ProtectSystem mit npm-Cache) bleibt offen
 * und steht als Betreiberaktion in docs/betrieb-INSTANZ.md.
 * ------------------------------------------------------------------------- */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const EINHEITEN = ['projectarmageddon.service', 'projectarmageddon-idle.service', 'projectarmageddon-idle.timer'];

function systemdWerkzeug() {
  try { execFileSync('systemd-analyze', ['--version'], { stdio: 'pipe' }); return true; } catch { return false; }
}

function kopiereEinheiten() {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-units-'));
  for (const name of EINHEITEN) {
    const text = lies(name).replaceAll('/opt/projectarmageddon/current', WURZEL);
    writeFileSync(join(ordner, name), text);
  }
  return ordner;
}

test('systemd-analyze verify: alle drei Vorlagen sind gültige Einheiten', () => {
  if (!systemdWerkzeug()) {
    /* Ohne systemd-Werkzeug bleibt die statische Prüfung oben; die Pflichtabschnitte
     * werden trotzdem geprüft, damit der Test nicht stillschweigend nichts tut. */
    for (const name of EINHEITEN) {
      const text = lies(name);
      assert.match(text, /^\[Unit\]$/m, `${name}: [Unit] fehlt`);
      assert.match(text, name.endsWith('.timer') ? /^\[Timer\]$/m : /^\[Service\]$/m, `${name}: Pflichtabschnitt fehlt`);
    }
    return;
  }
  const ordner = kopiereEinheiten();
  try {
    let ausgabe = '';
    try {
      execFileSync('systemd-analyze', ['verify', '--man=no', ...EINHEITEN], { cwd: ordner, stdio: 'pipe', encoding: 'utf8' });
    } catch (fehler) {
      ausgabe = `${fehler.stdout ?? ''}\n${fehler.stderr ?? ''}`;
    }
    const eigeneFehler = ausgabe.split('\n').filter(z => /projectarmageddon[^:]*\.(service|timer):/i.test(z) && /error|fatal|invalid|failed|not executable|missing/i.test(z));
    assert.deepEqual(eigeneFehler, [], `systemd-analyze verify meldet Fehler:\n${ausgabe}`);
  } finally { rmSync(ordner, { recursive: true, force: true }); }
});

test('systemd-analyze security: Exposure des Spielservers ≤ 2.0 (Vorlage, offline)', () => {
  if (!systemdWerkzeug()) {
    const unit = lies('projectarmageddon.service');
    for (const zeile of ['NoNewPrivileges=yes', 'ProtectSystem=strict', 'CapabilityBoundingSet=', 'SystemCallFilter=@system-service']) {
      assert.ok(unit.includes(zeile), `${zeile} fehlt`);
    }
    return;
  }
  const ordner = kopiereEinheiten();
  try {
    const ausgabe = execFileSync('systemd-analyze', ['security', '--offline=true', '--man=no', 'projectarmageddon.service'],
      { cwd: ordner, stdio: 'pipe', encoding: 'utf8' });
    const treffer = ausgabe.match(/Overall exposure level for projectarmageddon\.service:\s*([0-9.]+)/);
    assert.ok(treffer, `Exposure-Zeile fehlt:\n${ausgabe.slice(-800)}`);
    const wert = Number(treffer[1]);
    assert.ok(Number.isFinite(wert) && wert <= 2.0, `Exposure ${wert} über 2.0 — Härtung verschlechtert`);
  } finally { rmSync(ordner, { recursive: true, force: true }); }
});
