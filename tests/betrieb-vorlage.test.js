/**
 * A2 „Betriebslücken" — die prüfbare Seite von docs/betrieb-INSTANZ.md.
 *
 * Geprüft wird:
 *   - die Pflichtfeld-Vorlage (15 Felder, IDs, Bedeutung, Checkliste, Umgebungsvorlage)
 *   - das Verhalten der Kostenbremse (Marker, Maschinenlaufzeit, Rückgabewerte,
 *     last-brake, --print-config) — ohne echten Knoten, ohne systemd, ohne Netz
 *   - die Betreiber-Schritte Z246 (c)/(d)/(e) und die PERSIST-1-Grenze
 *
 * Nicht geprüft: ob ein eingetragener Preis/Besitzer stimmt, und ob die
 * systemd-Einheiten auf einem echten Knoten anschließen. Das steht als
 * `TODO(verify)` in docs/betrieb-INSTANZ.md, Abschnitt 5.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { FELDER } from '../scripts/betrieb/pflichtfelder.mjs';
import { PersistenceStore, PERSISTENCE_VERSION } from '../src/server/persistence.js';

const DOKUMENT = join(WURZEL, 'docs/betrieb-INSTANZ.md');
const PRUEFER = join(WURZEL, 'scripts/betrieb/pflichtfelder.mjs');
const BREMSE = join(WURZEL, 'scripts/betrieb/idle-watch.sh');
const UMGEBUNG = join(WURZEL, 'deploy/betrieb.env.example');
const dok = readFileSync(DOKUMENT, 'utf8');

function pruefer(...argumente) {
  return spawnSync(process.execPath, [PRUEFER, ...argumente], { encoding: 'utf8' });
}

function bremseUmgebung(extra = {}) {
  const wurzel = mkdtempSync(join(tmpdir(), 'pa-bremse-'));
  return {
    wurzel,
    env: {
      PATH: process.env.PATH,
      PA_STATE_DIR: join(wurzel, 'zustand'),
      PA_HEALTH_URL: 'http://127.0.0.1:9/healthz',
      PA_PORT: '9',
      PA_SYSTEMD_UNIT: 'gibt-es-nicht.service',
      PA_IDLE_MINUTES: '15',
      PA_MAX_RUNTIME_MINUTES: '180',
      ...extra,
    },
  };
}

function bremse(env, argumente = ['--once']) {
  return spawnSync('bash', [BREMSE, ...argumente], { env, encoding: 'utf8' });
}

test('Pflichtfeld-Vorlage: genau 15 Felder mit fester Bedeutung; leere Vorlage alle offen, die Instanz vollständig', () => {
  assert.equal(FELDER.length, 15);
  assert.deepEqual(FELDER.map(f => f.id), Array.from({ length: 15 }, (_, i) => `PFLICHT-${String(i + 1).padStart(2, '0')}`));

  // Die Instanz (docs/betrieb-INSTANZ.md) ist ausgefüllt: nichts offen.
  const instanz = pruefer('--json');
  assert.equal(instanz.status, 0, instanz.stdout + instanz.stderr);
  assert.deepEqual(JSON.parse(instanz.stdout).offen, []);

  // Die Vorlage selbst: gleiche Zeilen, jeder Wert LÜCKE -> alle 15 offen.
  const wurzel = mkdtempSync(join(tmpdir(), 'pa-leer-'));
  try {
    const leer = join(wurzel, 'leer.md');
    writeFileSync(leer, dok.split('\n').map(z => {
      const m = /^(\| PFLICHT-\d\d \| [^|]+\|).*$/.exec(z);
      return m ? `${m[1]} LÜCKE | LÜCKE |` : z;
    }).join('\n'), 'utf8');
    const lauf = pruefer('--json', '--datei', leer);
    assert.equal(lauf.status, 3, lauf.stderr);
    const bericht = JSON.parse(lauf.stdout);
    assert.equal(bericht.felder.length, 15);
    assert.deepEqual(bericht.offen, FELDER.map(f => f.id), 'die Vorlage ist unausgefüllt — LÜCKE in jedem Wert');
    assert.deepEqual(bericht.fehler, []);
    for (const [position, feld] of bericht.felder.entries()) {
      assert.match(feld.name, FELDER[position].begriff, `${feld.id} hat nicht die erwartete Bedeutung`);
    }
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('Pflichtfeld-Prüfer: ausgefüllte Vorlage wird freigegeben, fehlende Zeile nicht', () => {
  const wurzel = mkdtempSync(join(tmpdir(), 'pa-pflicht-'));
  try {
    const voll = join(wurzel, 'voll.md');
    writeFileSync(voll, dok.replaceAll('LÜCKE', 'eingetragen'), 'utf8');
    const fertig = pruefer('--json', '--datei', voll);
    assert.equal(fertig.status, 0, fertig.stdout);
    const bericht = JSON.parse(fertig.stdout);
    assert.deepEqual(bericht.offen, []);
    assert.equal(bericht.vollstaendig, true);

    const luecke = join(wurzel, 'luecke.md');
    writeFileSync(luecke, dok.split('\n').filter(zeile => !zeile.startsWith('| PFLICHT-07 ')).join('\n'), 'utf8');
    const kaputt = pruefer('--json', '--datei', luecke);
    assert.equal(kaputt.status, 1, 'eine fehlende Pflichtzeile ist ein Strukturfehler, kein „offen"');
    assert.ok(JSON.parse(kaputt.stdout).fehler.some(text => text.includes('14')), 'der Bericht nennt die falsche Anzahl');
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('Pflichtfeld-Prüfer: die technische Vorlage kennt jeden genannten PA_*-Schalter', () => {
  const umgebung = readFileSync(UMGEBUNG, 'utf8');
  for (const [schalter, wert] of [
    ['PA_IDLE_MINUTES', '15'],
    ['PA_MAX_RUNTIME_MINUTES', '180'],
    ['PA_MAX_MACHINE_MINUTES', ''],
    ['PA_SNAPSHOT_KEEP', '3'],
    ['PA_ARMED_FILE', '/etc/projectarmageddon/ist-gemietet'],
    ['PA_ACTION', 'stop'],
  ]) {
    const zeile = umgebung.match(new RegExp(`^#?\\s*${schalter}=(.*)$`, 'm'));
    assert.ok(zeile, `${schalter} fehlt in deploy/betrieb.env.example`);
    assert.equal(zeile[1].trim(), wert, `${schalter} hat eine andere Vorgabe als dokumentiert`);
  }
  assert.match(umgebung, /^#PA_MAX_MACHINE_MINUTES=$/m, 'die Maschinenfrist ist bewusst AUS, bis der Auftraggeber sie setzt');
});

test('Kostenbremse: ohne Marker passiert nichts (Rückgabewert 11)', () => {
  const { wurzel, env } = bremseUmgebung({ PA_ARMED_FILE: '/gibt/es/nicht/ist-gemietet', PA_MAX_MACHINE_MINUTES: '0' });
  try {
    const lauf = bremse(env);
    assert.equal(lauf.status, 11, lauf.stderr);
    assert.match(lauf.stderr, /NICHT SCHARF/);
    assert.ok(!readdirSync(join(wurzel, 'zustand')).includes('last-brake'), 'ohne Marker darf kein Auslöser protokolliert werden');
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('Kostenbremse: Maschinenlaufzeit löst aus, Trockenlauf stoppt nichts', () => {
  const marker = join(tmpdir(), `pa-marker-${process.pid}-${Date.now()}`);
  writeFileSync(marker, '');
  const { wurzel, env } = bremseUmgebung({ PA_ARMED_FILE: marker, PA_MAX_MACHINE_MINUTES: '0', PA_DRY_RUN: '1' });
  try {
    const lauf = bremse(env);
    assert.equal(lauf.status, 10, lauf.stderr);
    assert.match(lauf.stderr, /BREMSE: Maschinenlaufzeit/);
    assert.match(lauf.stderr, /TROCKENLAUF/);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});

test('Kostenbremse: echter Lauf protokolliert Grund und Beleg in last-brake', () => {
  const marker = join(tmpdir(), `pa-marker-${process.pid}-${Date.now()}`);
  writeFileSync(marker, '');
  const { wurzel, env } = bremseUmgebung({ PA_ARMED_FILE: marker, PA_MAX_MACHINE_MINUTES: '0', PA_ACTION: 'stop' });
  try {
    const lauf = bremse(env);
    assert.equal(lauf.status, 10, lauf.stderr);
    const protokoll = readFileSync(join(wurzel, 'zustand', 'last-brake'), 'utf8');
    assert.match(protokoll, /Maschinenlaufzeit/);
    assert.match(protokoll, /PA_MAX_MACHINE_MINUTES/);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});

test('Kostenbremse: ohne erreichte Schwelle kein Eingriff (Rückgabewert 0)', () => {
  const marker = join(tmpdir(), `pa-marker-${process.pid}-${Date.now()}`);
  writeFileSync(marker, '');
  const { wurzel, env } = bremseUmgebung({ PA_ARMED_FILE: marker, PA_MAX_MACHINE_MINUTES: '999999' });
  try {
    const lauf = bremse(env);
    assert.equal(lauf.status, 0, lauf.stdout + lauf.stderr);
    assert.match(lauf.stderr, /ok: kein Handlungsbedarf/);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});

test('Kostenbremse: --print-config nennt Marker, Fristen und die fehlende Maschinenfrist', () => {
  const ohne = bremse({ PATH: process.env.PATH, PA_ARMED_FILE: '/gibt/es/nicht/ist-gemietet' }, ['--print-config']);
  assert.equal(ohne.status, 0, ohne.stderr);
  assert.match(ohne.stdout, /NICHT SCHARF/);
  assert.match(ohne.stdout, /AUS \(PA_MAX_MACHINE_MINUTES ist leer\)/);
  assert.match(ohne.stdout, /Serverlaufzeit\s+: 180 min/);
  assert.match(ohne.stdout, /Leerlauf\s+: 15 min/);

  const marker = join(tmpdir(), `pa-marker-${process.pid}-${Date.now()}`);
  writeFileSync(marker, '');
  try {
    const mit = bremse({ PATH: process.env.PATH, PA_ARMED_FILE: marker, PA_MAX_MACHINE_MINUTES: '240' }, ['--print-config']);
    assert.equal(mit.status, 0, mit.stderr);
    assert.match(mit.stdout, /vorhanden — die Bremse ist scharf/);
    assert.match(mit.stdout, /240 min/);
  } finally {
    rmSync(marker, { force: true });
  }
});

test('Doku: Z246 (c)/(d)/(e) und PERSIST-1 sind als Betreiber-Schritte beschrieben', () => {
  assert.match(dok, /^## 6\. Z246 \(c\) — Löschen und Neuerstellen/m);
  assert.match(dok, /^## 7\. Z246 \(d\) — Archiv-Kopie außerhalb/m);
  assert.match(dok, /^## 8\. Z246 \(e\) — Preis des Abbilds je GB und Monat/m);
  assert.match(dok, /^## 9\. PERSIST-1/m);

  // (c) ausdrücklich nicht automatisiert, mit Abbild-vor-Löschung und Kostenhinweis
  assert.match(dok, /Bewusst nicht automatisiert/);
  assert.match(dok, /`poweroff` beendet die Abrechnung nicht/);
  assert.match(dok, /abbild-lokal\.sh --server <Name> --ausschalten/);

  // (d) Kopie nach außen: Werkzeug, Prüfsumme, Ablage-Regeln, kein Automat
  assert.match(dok, /rsync -av --partial/);
  assert.match(dok, /sha256sum -c pa-snapshot-/);
  assert.match(dok, /Eine automatische Kopie nach außen ist \*\*nicht gebaut\*\*/);

  // (e) Bildpreis als Pflichtfeld und in der Kostenrechnung
  assert.match(dok, /\| PFLICHT-15 \| \*\*Bildpreis je GB und Monat\*\*/);
  assert.match(dok, /Bildkosten je Monat = Abbildgröße in GB × Preis je GB und Monat/);

  // PERSIST-1: Grenze und Betreiberregel
  assert.match(dok, /Es gibt \*\*keine\s+Sperre\*\*/);
  assert.match(dok, /Genau \*\*ein\*\* Serverprozess darf auf ein `PA_STATE_PATH` zeigen/);
});

test('PERSIST-1: zwei Instanzen auf derselben Datei überschreiben sich still, ohne Sperre', () => {
  const wurzel = mkdtempSync(join(tmpdir(), 'pa-persist1-'));
  try {
    const pfad = join(wurzel, 'lobbies.json');
    const erste = new PersistenceStore({ path: pfad });
    const zweite = new PersistenceStore({ path: pfad });

    assert.equal(erste.save({ lobbies: [{ id: 'von-erster-instanz' }] }), true);
    assert.equal(zweite.save({ lobbies: [{ id: 'von-zweiter-instanz' }] }), true, 'kein Fehler, keine Warnung — das ist die Grenze');

    const geladen = erste.load();
    assert.equal(geladen.version, PERSISTENCE_VERSION);
    assert.deepEqual(geladen.lobbies, [{ id: 'von-zweiter-instanz' }], 'der letzte Schreiber gewinnt');
    assert.deepEqual(readdirSync(wurzel), ['lobbies.json'], 'es entsteht keine Sperrdatei');
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});
