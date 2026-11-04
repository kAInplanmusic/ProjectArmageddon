/**
 * Release-Paket (DEP-1/REL-1): Inhalt, Geheimnis-Sperre, Import-Hülle, Reproduzierbarkeit,
 * und der Smoke-Test gegen einen echten Server im Prozess.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sammleDateien, pruefeGeheimnisse, importHuelle, baue, INHALT } from '../scripts/release/paket.mjs';
import { fuehreSmokeAus } from '../scripts/release/smoke.mjs';
import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { GameServer } from '../src/server/gameServer.js';

const PAKET = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));

function falschesDist(ordner, extra = {}) {
  const dist = join(ordner, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(dist, 'assets', 'index-abc.js'), 'console.log(1)');
  writeFileSync(join(dist, 'version.json'), JSON.stringify({
    name: PAKET.name, version: PAKET.version, gitSha: '2413c4f928bc', geaendert: false, bauzeit: '2026-11-04T00:00:00.000Z', ...extra,
  }));
  return dist;
}

test('Paketinhalt: Server, Betrieb, dist — ohne Tests, Abhängigkeiten, Zustand', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-paket-inhalt-'));
  try {
    const ziele = sammleDateien({ distDir: falschesDist(ordner) }).map(d => d.ziel);
    for (const pflicht of [
      'scripts/server.mjs', 'src/server/gameServer.js', 'src/server/bauinfo.js', 'package.json', 'package-lock.json',
      'scripts/betrieb/server-start.sh', 'scripts/betrieb/idle-watch.sh', 'scripts/betrieb/sichern.sh',
      'scripts/betrieb/wiederherstellen.sh', 'scripts/release/deploy.sh', 'scripts/release/rollback.sh',
      'scripts/release/smoke.mjs', 'deploy/systemd/projectarmageddon.service', 'deploy/Caddyfile.beispiel',
      'docs/deploy-plan.md', 'dist/index.html', 'dist/version.json',
    ]) assert.ok(ziele.includes(pflicht), `fehlt: ${pflicht}`);
    for (const z of ziele) {
      assert.doesNotMatch(z, /^(tests|node_modules|\.pa-state|src\/client|assets|uploaded)\//, z);
      assert.doesNotMatch(z, /(^|\/)betrieb\.env$/, z);
    }
    assert.deepEqual([...ziele].sort(), ziele, 'sortiert (reproduzierbar)');
    assert.ok(INHALT.dateien.includes('package-lock.json'));
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Import-Hülle des Servers liegt vollständig im Paket', () => {
  const huelle = importHuelle(WURZEL, 'scripts/server.mjs');
  assert.ok(huelle.size > 20, `Hülle zu klein (${huelle.size}) — Importerkennung kaputt?`);
  assert.ok(huelle.has('src/server/gameServer.js') && huelle.has('src/server/bauinfo.js'));
  const ordner = mkdtempSync(join(tmpdir(), 'pa-paket-huelle-'));
  try {
    const ziele = new Set(sammleDateien({ distDir: falschesDist(ordner) }).map(d => d.ziel));
    const fehlend = [...huelle].filter(p => !ziele.has(p));
    assert.deepEqual(fehlend, []);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Geheimnis-Sperre: Namen und Inhalte', () => {
  assert.deepEqual(pruefeGeheimnisse([
    { ziel: 'deploy/betrieb.env.example', inhalt: '# HCLOUD_TOKEN gehört NIE hierher\nPA_HCLOUD_SERVER=LÜCKE' },
    { ziel: 'scripts/betrieb/token-setzen.sh', inhalt: 'HCLOUD_TOKEN="$1"' },
    { ziel: 'src/server/x.js', inhalt: 'const a = 1;' },
    { ziel: 'dist/bild.png', inhalt: '-----BEGIN RSA PRIVATE KEY-----' },
  ]), []);
  const befunde = pruefeGeheimnisse([
    { ziel: '.env', inhalt: '' },
    { ziel: 'deploy/betrieb.env', inhalt: '' },
    { ziel: 'deploy/tls.key', inhalt: '' },
    { ziel: 'deploy/hcloud-token.txt', inhalt: '' },
    { ziel: 'scripts/x.sh', inhalt: 'export HCLOUD_TOKEN=abcdefghijklmnopqrstuvwxyz0123456789' },
    { ziel: 'src/y.js', inhalt: '-----BEGIN OPENSSH PRIVATE KEY-----' },
    { ziel: 'dist/assets/a.js', inhalt: 'x="ghp_abcdefghijklmnopqrstuvwxyz0123456789"' },
  ]);
  assert.equal(befunde.length, 7, befunde.join('\n'));
  // Das echte Repo ist sauber.
  const ordner = mkdtempSync(join(tmpdir(), 'pa-paket-geheim-'));
  try {
    assert.deepEqual(pruefeGeheimnisse(sammleDateien({ distDir: falschesDist(ordner) })), []);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('baue(): Archiv mit Prüfsumme, reproduzierbar, verweigert veralteten oder geänderten Build', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-paket-bau-'));
  try {
    const dist = falschesDist(ordner);
    const leise = () => {};
    const eins = baue({ ausgabe: join(ordner, 'a'), dist, log: leise });
    const zwei = baue({ ausgabe: join(ordner, 'b'), dist, log: leise });
    assert.equal(eins.name, `projectarmageddon-${PAKET.version}-2413c4f`);
    assert.equal(eins.pruefsumme, zwei.pruefsumme, 'zwei Läufe, dieselbe Prüfsumme');
    assert.equal(createHash('sha256').update(readFileSync(eins.archiv)).digest('hex'), eins.pruefsumme);
    assert.equal(readFileSync(`${eins.archiv}.sha256`, 'utf8'), `${eins.pruefsumme}  ${eins.name}.tar.gz\n`);
    const pruef = spawnSync('sha256sum', ['--check', '--status', `${eins.name}.tar.gz.sha256`], { cwd: join(ordner, 'a') });
    assert.equal(pruef.status, 0, 'Format von sha256sum -c');

    const liste = spawnSync('tar', ['-tzf', eins.archiv], { encoding: 'utf8' }).stdout.trim().split('\n');
    assert.ok(liste.every(z => z.startsWith(`${eins.name}/`)), 'alles unter einem Ordner');
    for (const z of ['RELEASE.json', 'dist/version.json', 'scripts/release/deploy.sh', 'src/server/gameServer.js']) {
      assert.ok(liste.includes(`${eins.name}/${z}`), z);
    }
    const release = JSON.parse(spawnSync('tar', ['-xzOf', eins.archiv, `${eins.name}/RELEASE.json`], { encoding: 'utf8' }).stdout);
    assert.equal(release.kennung, `${PAKET.version}-2413c4f`);
    assert.equal(release.version, PAKET.version);
    assert.match(release.dateien['scripts/server.mjs'], /^[0-9a-f]{64}$/);
    const modus = spawnSync('tar', ['-tvzf', eins.archiv, `${eins.name}/scripts/release/deploy.sh`], { encoding: 'utf8' }).stdout;
    assert.match(modus, /^-rwx/, 'Ausführbarkeit bleibt erhalten');

    const trocken = baue({ ausgabe: join(ordner, 'c'), dist, trocken: true, log: leise });
    assert.equal(trocken.archiv, null);

    writeFileSync(join(dist, 'version.json'), JSON.stringify({ version: '0.0.1', gitSha: 'x' }));
    assert.throws(() => baue({ ausgabe: join(ordner, 'd'), dist, log: leise }), /Build veraltet/);
    writeFileSync(join(dist, 'version.json'), JSON.stringify({ version: PAKET.version, gitSha: 'abcdef1234', geaendert: true }));
    assert.throws(() => baue({ ausgabe: join(ordner, 'd'), dist, log: leise }), /Änderungen/);
    assert.match(baue({ ausgabe: join(ordner, 'd'), dist, log: leise, erlaubeGeaendert: true }).name, /-abcdef1-geaendert$/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('CI: Release-Paket bei Tags v*, als Artefakt, ohne Deploy-Schritt', () => {
  const ci = readFileSync(join(WURZEL, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /tags: \['v\*'\]/);
  const job = ci.slice(ci.indexOf('  release-paket:'), ci.indexOf('\n  e2e:'));
  assert.match(job, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(job, /needs: test/);
  assert.match(job, /node scripts\/release\/paket\.mjs/);
  assert.match(job, /upload-artifact/);
  assert.match(job, /"v\$version"/, 'Tag muss zur Version passen');
  assert.doesNotMatch(job, /\b(ssh|scp|rsync|deploy\.sh|hcloud|docker push)\b/, 'kein Ausrollen aus der CI');
});

test('smoke.mjs gegen einen echten Server: grün, und rot bei falscher Version', async () => {
  const bauinfo = { version: '0.9.0', gitSha: '2413c4f928bc', bauzeit: null, quelle: 'dist/version.json' };
  const ordner = mkdtempSync(join(tmpdir(), 'pa-smoke-'));
  const dist = falschesDist(ordner);
  const serveStatic = (request, response, url) => {
    if (url.pathname !== '/') return false;
    const body = readFileSync(join(dist, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
    return true;
  };
  const server = new GameServer({ bauinfo, serveStatic });
  const info = await server.listen(0);
  try {
    const leise = () => {};
    const gruen = await fuehreSmokeAus({ url: info.url, version: '0.9.0', gitSha: '2413c4f', frist: 5, log: leise });
    assert.equal(gruen.ok, true, JSON.stringify(gruen.pruefungen));
    assert.deepEqual(gruen.pruefungen.map(p => p.name), ['healthz', 'version', 'gitSha', 'oberflaeche', 'websocket', 'lobby_anlegen', 'lobby_lesen']);

    const rot = await fuehreSmokeAus({ url: info.url, version: '0.9.1', frist: 5, ohneLobby: true, log: leise });
    assert.equal(rot.ok, false);
    assert.equal(rot.pruefungen.at(-1).name, 'version');

    const ohneLobby = await fuehreSmokeAus({ url: info.url, frist: 5, ohneLobby: true, log: leise });
    assert.equal(ohneLobby.ok, true);
    assert.ok(!ohneLobby.pruefungen.some(p => p.name.startsWith('lobby')));
  } finally {
    await server.close();
    rmSync(ordner, { recursive: true, force: true });
  }
  const tot = await fuehreSmokeAus({ url: info.url, frist: 1, log: () => {} });
  assert.equal(tot.ok, false, 'ohne Server rot');
});
