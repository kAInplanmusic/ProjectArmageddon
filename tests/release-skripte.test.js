/**
 * Release-Skripte (REL-1, DEP-1): deploy.sh, rollback.sh, sichern.sh, wiederherstellen.sh.
 *
 * Kein systemd, kein Netz, kein Knoten: `systemctl`, `npm` und der Smoke-Test sind über die
 * Umgebung durch kleine Stellvertreter ersetzt (PA_SYSTEMCTL, PA_NPM, PA_SMOKE_BEFEHL), alles
 * läuft in einem temporären Verzeichnis. Geprüft wird die LOGIK: Prüfsumme, Entpacken,
 * Symlink-Umschaltung, automatischer Rückfall, Rollback auf den Vorgänger, Aufräumen,
 * atomare Sicherung mit Aufbewahrung und der Rundlauf Sichern → Wiederherstellen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, readlinkSync, existsSync, rmSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEPLOY = join(ROOT, 'scripts/release/deploy.sh');
const ROLLBACK = join(ROOT, 'scripts/release/rollback.sh');
const SICHERN = join(ROOT, 'scripts/betrieb/sichern.sh');
const WIEDER = join(ROOT, 'scripts/betrieb/wiederherstellen.sh');

const SKRIPTE = [
  'scripts/release/deploy.sh', 'scripts/release/rollback.sh', 'scripts/release/gemeinsam.sh',
  'scripts/betrieb/sichern.sh', 'scripts/betrieb/wiederherstellen.sh',
];

function stellvertreter(ordner) {
  const bin = join(ordner, 'bin');
  mkdirSync(bin, { recursive: true });
  const skript = (name, inhalt) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${inhalt}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // systemctl: protokolliert; `is-active` antwortet nach STUB_AKTIV (yes = läuft).
  skript('systemctl', `echo "systemctl $*" >> "${ordner}/aufrufe.log"
if [ "$1" = "is-active" ]; then [ "\${STUB_AKTIV:-no}" = "yes" ] && exit 0 || exit 3; fi
exit 0`);
  skript('npm', `echo "npm $* (in $PWD)" >> "${ordner}/aufrufe.log"; mkdir -p node_modules`);
  // Smoke-Test: rot für jedes Release mit „ccccccc“ in der Kennung.
  skript('smoke', `echo "smoke $1" >> "${ordner}/aufrufe.log"; case "$1" in *ccccccc*) exit 1 ;; esac; exit 0`);
  return bin;
}

function baueArchiv(ordner, kennung, { falscheSumme = false } = {}) {
  const name = `projectarmageddon-${kennung}`;
  const buehne = join(ordner, 'buehne', name);
  const datei = (rel, inhalt) => { mkdirSync(join(buehne, rel, '..'), { recursive: true }); writeFileSync(join(buehne, rel), inhalt); };
  const [version, sha] = kennung.split('-');
  datei('RELEASE.json', JSON.stringify({ kennung, version, gitSha: sha }));
  datei('dist/index.html', '<!doctype html>');
  datei('dist/version.json', JSON.stringify({ version, gitSha: sha }));
  datei('scripts/server.mjs', '');
  datei('scripts/betrieb/server-start.sh', '#!/bin/sh\n');
  datei('scripts/release/smoke.mjs', '');
  datei('package-lock.json', '{}');
  mkdirSync(join(ordner, 'pakete'), { recursive: true });
  const archiv = join(ordner, 'pakete', `${name}.tar.gz`);
  const r = spawnSync('tar', ['-czf', archiv, '-C', join(ordner, 'buehne'), name]);
  assert.equal(r.status, 0, String(r.stderr));
  const summe = createHash('sha256').update(readFileSync(archiv)).digest('hex');
  writeFileSync(`${archiv}.sha256`, `${falscheSumme ? '0'.repeat(64) : summe}  ${name}.tar.gz\n`);
  return archiv;
}

function umgebung(ordner, extra = {}) {
  const bin = join(ordner, 'bin');
  return {
    ...process.env,
    PA_BASIS: join(ordner, 'opt'),
    PA_SYSTEMCTL: join(bin, 'systemctl'),
    PA_NPM: join(bin, 'npm'),
    PA_SMOKE_BEFEHL: join(bin, 'smoke'),
    PA_STATE_PATH: join(ordner, 'state', 'lobbies.json'),
    PA_SICHERUNG_DIR: join(ordner, 'state', 'sicherungen'),
    PA_BETRIEB_ENV: join(ordner, 'gibt-es-nicht.env'),
    DRY_RUN: '0',
    ...extra,
  };
}

const laufe = (skript, argumente, env) => spawnSync('bash', [skript, ...argumente], { env, encoding: 'utf8' });
const aktuell = ordner => readlinkSync(join(ordner, 'opt', 'current'));
const protokollZeilen = ordner => readFileSync(join(ordner, 'opt', 'releases.log'), 'utf8').trim().split('\n').map(z => z.split('\t'));

test('Syntax aller Release- und Sicherungsskripte (bash -n)', () => {
  for (const rel of SKRIPTE) {
    const r = spawnSync('bash', ['-n', join(ROOT, rel)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${rel}: ${r.stderr}`);
  }
});

test('deploy.sh --trocken ändert nichts', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-deploy-trocken-'));
  try {
    stellvertreter(ordner);
    const archiv = baueArchiv(ordner, '0.9.0-aaaaaaa');
    const r = laufe(DEPLOY, [archiv, '--trocken'], umgebung(ordner));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /\[trocken\] tar -xzf/);
    assert.match(r.stderr, /\[trocken\] .*systemctl restart projectarmageddon\.service/);
    assert.equal(existsSync(join(ordner, 'opt')), false, 'im Trockenlauf entsteht kein Verzeichnis');
    assert.equal(existsSync(join(ordner, 'aufrufe.log')), false, 'im Trockenlauf wird nichts aufgerufen');
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('deploy.sh: Einführung, automatischer Rückfall, Rollback, Aufräumen', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-deploy-'));
  try {
    stellvertreter(ordner);
    mkdirSync(join(ordner, 'state'));
    writeFileSync(join(ordner, 'state', 'lobbies.json'), JSON.stringify({ version: 1, lobbies: [] }));
    const env = umgebung(ordner, { PA_BEHALTEN: '2' });

    // Falsche Prüfsumme: Abbruch, nichts angelegt.
    const falsch = baueArchiv(ordner, '0.8.0-fffffff', { falscheSumme: true });
    let r = laufe(DEPLOY, [falsch], env);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Prüfsumme stimmt nicht/);
    assert.equal(existsSync(join(ordner, 'opt', 'releases')), false);

    // Erstes Release.
    r = laufe(DEPLOY, [baueArchiv(ordner, '0.9.0-aaaaaaa')], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(aktuell(ordner), 'releases/0.9.0-aaaaaaa');
    const aufrufe = readFileSync(join(ordner, 'aufrufe.log'), 'utf8');
    assert.match(aufrufe, /npm ci --omit=dev --ignore-scripts .*\(in .*\.neu-0\.9\.0-aaaaaaa\)/);
    assert.match(aufrufe, /systemctl restart projectarmageddon\.service/);
    assert.ok(existsSync(join(ordner, 'opt', 'releases', '0.9.0-aaaaaaa', 'node_modules')));
    assert.equal(readlinkSync(join(ordner, 'opt', 'scripts')), 'current/scripts', 'Betriebspfade der Doku bleiben gültig');
    assert.ok(existsSync(join(ordner, 'opt', 'scripts', 'betrieb', 'server-start.sh')));
    assert.equal(readdirSync(join(ordner, 'state', 'sicherungen')).filter(f => f.endsWith('.json')).length, 1,
      'vor dem Deploy wird der Spielstand gesichert');

    // Dasselbe Release noch einmal: verweigert.
    r = laufe(DEPLOY, [join(ordner, 'pakete', 'projectarmageddon-0.9.0-aaaaaaa.tar.gz')], env);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /läuft bereits/);

    // Zweites Release.
    r = laufe(DEPLOY, [baueArchiv(ordner, '0.9.1-bbbbbbb')], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(aktuell(ordner), 'releases/0.9.1-bbbbbbb');

    // Drittes Release mit rotem Smoke-Test: automatischer Rückfall auf 0.9.1.
    r = laufe(DEPLOY, [baueArchiv(ordner, '0.9.2-ccccccc')], env);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /automatischer Rückfall auf 0\.9\.1-bbbbbbb/);
    assert.equal(aktuell(ordner), 'releases/0.9.1-bbbbbbb');
    const zeilen = protokollZeilen(ordner);
    assert.deepEqual(zeilen.slice(-2).map(z => z.slice(1)), [
      ['deploy', '0.9.1-bbbbbbb', '0.9.2-ccccccc', 'smoke-rot'],
      ['rueckfall', '0.9.2-ccccccc', '0.9.1-bbbbbbb', 'ok'],
    ]);

    // Rollback ohne Ziel: Vorgänger von 0.9.1 laut Protokoll = 0.9.0.
    r = laufe(ROLLBACK, ['--trocken'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(aktuell(ordner), 'releases/0.9.1-bbbbbbb', 'Trockenlauf schaltet nicht um');
    r = laufe(ROLLBACK, [], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(aktuell(ordner), 'releases/0.9.0-aaaaaaa');
    assert.deepEqual(protokollZeilen(ordner).at(-1).slice(1), ['rollback', '0.9.1-bbbbbbb', '0.9.0-aaaaaaa', 'ok']);

    // Gezielt vorwärts.
    r = laufe(ROLLBACK, ['--auf', '0.9.1-bbbbbbb'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(aktuell(ordner), 'releases/0.9.1-bbbbbbb');
    r = laufe(ROLLBACK, ['--auf', '9.9.9-nichtda'], env);
    assert.equal(r.status, 2);

    // Aufräumen: PA_BEHALTEN=2, `current` und das vorige bleiben immer.
    r = laufe(DEPLOY, [baueArchiv(ordner, '0.9.3-ddddddd')], env);
    assert.equal(r.status, 0, r.stderr);
    const uebrig = readdirSync(join(ordner, 'opt', 'releases')).filter(d => !d.startsWith('.')).sort();
    assert.ok(uebrig.includes('0.9.3-ddddddd') && uebrig.includes('0.9.1-bbbbbbb'), uebrig.join(','));
    assert.ok(uebrig.length <= 3, `aufgeräumt: ${uebrig.join(',')}`);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('sichern.sh: atomar, mit Prüfsumme und Aufbewahrung; kaputter Stand wird nicht gesichert', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-sichern-'));
  try {
    stellvertreter(ordner);
    mkdirSync(join(ordner, 'state'));
    const env = umgebung(ordner, { PA_SICHERUNG_BEHALTEN: '3' });
    const ablage = join(ordner, 'state', 'sicherungen');

    let r = laufe(SICHERN, [], env);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /nichts zu sichern/);

    for (let i = 1; i <= 5; i++) {
      writeFileSync(env.PA_STATE_PATH, JSON.stringify({ version: 1, lobbies: [], n: i }));
      r = laufe(SICHERN, ['--grund', `Lauf ${i}`], env);
      assert.equal(r.status, 0, r.stderr);
    }
    const dateien = readdirSync(ablage).sort();
    const json = dateien.filter(f => f.endsWith('.json'));
    assert.equal(json.length, 3, `die neuesten 3 bleiben: ${dateien.join(',')}`);
    assert.equal(dateien.filter(f => f.endsWith('.sha256')).length, 3);
    assert.equal(dateien.filter(f => f.endsWith('.tmp')).length, 0, 'keine Zwischendateien');
    assert.deepEqual(json.map(f => JSON.parse(readFileSync(join(ablage, f), 'utf8')).n), [3, 4, 5]);
    const pruef = spawnSync('sha256sum', ['--check', '--status', `${json[0]}.sha256`], { cwd: ablage });
    assert.equal(pruef.status, 0);

    writeFileSync(env.PA_STATE_PATH, '{"version": 1, abgeschnitten');
    r = laufe(SICHERN, [], env);
    assert.equal(r.status, 2);
    assert.equal(readdirSync(ablage).filter(f => f.endsWith('.json')).length, 3, 'ältere Sicherungen bleiben');

    r = laufe(SICHERN, ['--trocken'], { ...env, PA_STATE_PATH: join(ablage, json[0]) });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /\[trocken\] sichere/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Rundlauf: sichern → Stand ändern → wiederherstellen', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-rundlauf-'));
  try {
    stellvertreter(ordner);
    mkdirSync(join(ordner, 'state'));
    const env = umgebung(ordner);
    const ablage = join(ordner, 'state', 'sicherungen');
    const standA = JSON.stringify({ version: 1, savedAt: 1, lobbies: [{ id: 'A' }] });
    const standB = JSON.stringify({ version: 1, savedAt: 2, lobbies: [{ id: 'B' }] });

    writeFileSync(env.PA_STATE_PATH, standA);
    assert.equal(laufe(SICHERN, [], env).status, 0);
    const sicherung = join(ablage, readdirSync(ablage).find(f => f.endsWith('.json')));
    writeFileSync(env.PA_STATE_PATH, standB);

    // Dienst läuft: verweigert.
    let r = laufe(WIEDER, [sicherung, '--ja'], { ...env, STUB_AKTIV: 'yes' });
    assert.equal(r.status, 3);
    assert.equal(readFileSync(env.PA_STATE_PATH, 'utf8'), standB);

    // Ohne Bestätigung: verweigert.
    r = laufe(WIEDER, [sicherung], env);
    assert.equal(r.status, 1);

    // Trocken: nichts geändert.
    r = laufe(WIEDER, ['--neueste', '--trocken'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(env.PA_STATE_PATH, 'utf8'), standB);

    // Wirklich.
    r = laufe(WIEDER, ['--neueste', '--ja'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(env.PA_STATE_PATH, 'utf8'), standA, 'Stand A ist zurück');
    const vorher = readdirSync(ablage).find(f => f.startsWith('vor-wiederherstellung-'));
    assert.ok(vorher, 'der überschriebene Stand wurde beiseitegelegt');
    assert.equal(readFileSync(join(ablage, vorher), 'utf8'), standB);
    assert.equal(readdirSync(join(ordner, 'state')).filter(f => f.endsWith('.tmp')).length, 0);

    // Manipulierte Sicherung: Prüfsumme stimmt nicht.
    writeFileSync(sicherung, standB);
    r = laufe(WIEDER, [sicherung, '--ja'], env);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Prüfsumme stimmt nicht/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});
