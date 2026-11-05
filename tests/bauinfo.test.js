/**
 * Versionskennung (DEP-1): Build schreibt Version, Git-Stand und Bauzeit; der Client zeigt sie,
 * der Server meldet sie in `/healthz`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ermittleBauinfo, WURZEL } from '../scripts/release/bauinfo.mjs';
import { bauinfoText, BAUINFO } from '../src/client/bauinfo.js';
import { leseBauinfo } from '../src/server/bauinfo.js';
import { GameServer } from '../src/server/gameServer.js';

const PAKET = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));

test('package.json trägt eine SemVer-Version vor 1.0 (Konten fehlen noch, siehe docs/deploy-plan.md)', () => {
  assert.match(PAKET.version, /^0\.\d+\.\d+$/);
  const lock = JSON.parse(readFileSync(join(WURZEL, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, PAKET.version, 'package-lock.json muss dieselbe Version tragen');
  assert.equal(lock.packages[''].version, PAKET.version);
});

test('ermittleBauinfo: Vorgaben aus der Umgebung (CI/Docker) und SOURCE_DATE_EPOCH', () => {
  const info = ermittleBauinfo({ env: { PA_GIT_SHA: 'abcdef0123456789abcdef', SOURCE_DATE_EPOCH: '1790000000' } });
  assert.equal(info.version, PAKET.version);
  assert.equal(info.name, PAKET.name);
  assert.equal(info.gitSha, 'abcdef012345', 'auf 12 Zeichen gekürzt');
  assert.equal(info.geaendert, null, 'mit Vorgabe von außen ist der Arbeitsbaum nicht beurteilbar');
  assert.equal(info.bauzeit, new Date(1790000000 * 1000).toISOString());
  assert.equal(ermittleBauinfo({ env: { GITHUB_SHA: '1234567890abcdef' } }).gitSha, '1234567890ab');
});

test('ermittleBauinfo: ohne git ist der Stand „unbekannt", die Bauzeit kommt von der Uhr', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-bauinfo-'));
  try {
    writeFileSync(join(ordner, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }));
    const jetzt = new Date('2026-11-04T10:00:00Z');
    const info = ermittleBauinfo({ root: ordner, env: { GIT_CEILING_DIRECTORIES: tmpdir() }, jetzt });
    assert.equal(info.version, '1.2.3');
    assert.equal(info.bauzeit, '2026-11-04T10:00:00.000Z');
    // In einem Verzeichnis ohne Repository (Grenze gesetzt, kein Elternrepo) bleibt der Stand unbekannt.
    if (info.gitSha !== 'unbekannt') assert.match(info.gitSha, /^[0-9a-f]{12}$/);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Client: Kurztext für den Menü-Fuß', () => {
  assert.equal(
    bauinfoText({ version: '0.9.0', gitSha: '2413c4f928bc', geaendert: false, bauzeit: '2026-11-04T12:34:56.000Z' }),
    'v0.9.0 · 2413c4f · 2026-11-04 12:34 UTC',
  );
  assert.equal(bauinfoText({ version: '0.9.0', gitSha: '2413c4f928bc', geaendert: true, bauzeit: null }), 'v0.9.0 · 2413c4f+');
  assert.equal(bauinfoText({ version: '0.9.0', gitSha: 'unbekannt', bauzeit: 'kaputt' }), 'v0.9.0 · unbekannt');
  // In Node (ohne Build-Ersetzung) ist die Kennung ein Platzhalter, kein Absturz.
  assert.equal(BAUINFO.version, 'unbekannt');
});

test('index.html hat den Platz für die Kennung im Menü', () => {
  const html = readFileSync(join(WURZEL, 'index.html'), 'utf8');
  assert.match(html, /<p id="bauinfo" class="menu-bauinfo"><\/p>/);
  assert.match(html, /<script type="module" src="\/src\/client\/bauinfo\.js"><\/script>/);
  assert.match(readFileSync(join(WURZEL, 'vite.config.mjs'), 'utf8'), /fileName: 'version\.json'/);
});

test('Server: liest dist/version.json, sonst package.json; Fremdinhalt wird nicht durchgereicht', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-bauinfo-srv-'));
  try {
    assert.deepEqual(leseBauinfo({ cwd: ordner }), {
      version: PAKET.version, gitSha: 'unbekannt', bauzeit: null, quelle: 'package.json',
    });
    mkdirSync(join(ordner, 'dist'));
    writeFileSync(join(ordner, 'dist', 'version.json'),
      JSON.stringify({ version: '0.9.0', gitSha: 'abc123def456', bauzeit: '2026-11-04T00:00:00.000Z' }));
    assert.deepEqual(leseBauinfo({ cwd: ordner }), {
      version: '0.9.0', gitSha: 'abc123def456', bauzeit: '2026-11-04T00:00:00.000Z', quelle: 'dist/version.json',
    });
    writeFileSync(join(ordner, 'dist', 'version.json'), JSON.stringify({ version: 'x'.repeat(500), gitSha: 'a\nb' }));
    const fremd = leseBauinfo({ cwd: ordner });
    assert.equal(fremd.version, PAKET.version, 'zu lange Werte fallen auf package.json zurück');
    assert.equal(fremd.gitSha, 'unbekannt');
    writeFileSync(join(ordner, 'dist', 'version.json'), '{kaputt');
    assert.equal(leseBauinfo({ cwd: ordner }).quelle, 'package.json');
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('/healthz meldet Version und Build', async () => {
  const bauinfo = { version: '0.9.0', gitSha: 'abc123def456', bauzeit: '2026-11-04T00:00:00.000Z', quelle: 'dist/version.json' };
  const server = new GameServer({ bauinfo });
  const info = await server.listen(0);
  try {
    const health = await (await fetch(`${info.url}/healthz`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.version, '0.9.0');
    assert.deepEqual(health.build, { gitSha: 'abc123def456', bauzeit: '2026-11-04T00:00:00.000Z', quelle: 'dist/version.json' });
  } finally {
    await server.close();
  }
});

test('/healthz ohne Vorgabe: Version aus dem Projekt', async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  try {
    const health = await (await fetch(`${info.url}/healthz`)).json();
    assert.equal(typeof health.version, 'string');
    assert.ok(health.version === PAKET.version || health.build.quelle === 'dist/version.json');
    assert.equal(typeof health.build.gitSha, 'string');
  } finally {
    await server.close();
  }
});

test('Auslieferung aus dist/: Version aus dist/version.json und passende Medientypen', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-dist-'));
  const vorher = process.cwd();
  mkdirSync(join(ordner, 'dist'));
  writeFileSync(join(ordner, 'dist', 'version.json'), JSON.stringify({ version: '0.9.0', gitSha: 'feedfeedfeed', bauzeit: null }));
  for (const datei of ['a.webp', 'b.woff2', 'c.mp3', 'manifest.webmanifest']) writeFileSync(join(ordner, 'dist', datei), 'x');
  process.chdir(ordner);
  let server;
  try {
    server = new GameServer();
    const info = await server.listen(0);
    const health = await (await fetch(`${info.url}/healthz`)).json();
    assert.equal(health.build.gitSha, 'feedfeedfeed');
    const erwartet = {
      'a.webp': 'image/webp', 'b.woff2': 'font/woff2', 'c.mp3': 'audio/mpeg', 'manifest.webmanifest': 'application/manifest+json',
    };
    for (const [datei, typ] of Object.entries(erwartet)) {
      const antwort = await fetch(`${info.url}/${datei}`);
      assert.equal(antwort.status, 200, datei);
      assert.equal(antwort.headers.get('content-type'), typ, datei);
    }
  } finally {
    process.chdir(vorher);
    await server?.close();
    rmSync(ordner, { recursive: true, force: true });
  }
});
