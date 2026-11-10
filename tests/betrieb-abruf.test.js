/**
 * Server auf Abruf (Freigabe 2026-11-10, docs/betrieb-INSTANZ.md Abschnitt 10):
 * selbst-abbild-loeschen.sh (auf dem Server), server-hochfahren.sh (beim Auftraggeber/CI),
 * die Anbindung an idle-watch.sh und der Workflow.
 *
 * Gegen einen lokalen Hetzner-Fake (tests/helfer/hetzner-mock.mjs, über PA_HCLOUD_API):
 * Erfolgsweg UND Fail-safe-Weg. Das beweist die Logik der Skripte, NICHT den Anschluss
 * an die echte Hetzner-API, systemd oder cloud-init — dafür gilt der echte Lauf in
 * docs/betrieb-INSTANZ.md Abschnitt 10 (Beleg A1 ff.).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { starteMock, TEST_TOKEN } from './helfer/hetzner-mock.mjs';

const S = name => join(WURZEL, 'scripts/betrieb', name);
const SKRIPTE = ['hcloud-api.sh', 'selbst-abbild-loeschen.sh', 'server-hochfahren.sh', 'server-erstinstallation.sh', 'idle-watch.sh'];

function lauf(skript, args, env, eingabe) {
  return new Promise(ok => {
    const kind = spawn('bash', [skript, ...args], { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    kind.stdout.on('data', d => { out += d; });
    kind.stderr.on('data', d => { err += d; });
    kind.on('close', code => ok({ code, out, err }));
    kind.stdin.end(eingabe ?? '');
  });
}

/** Umgebung für selbst-abbild-loeschen.sh: alles Gefährliche durch Stellvertreter ersetzt. */
function serverUmgebung(mock, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pa-abruf-'));
  const tokenDatei = join(dir, 'hcloud-token');
  writeFileSync(tokenDatei, `${TEST_TOKEN}\n`, { mode: 0o600 });
  chmodSync(tokenDatei, 0o600);
  const marker = join(dir, 'ist-gemietet'); writeFileSync(marker, '');
  const wurzel = join(dir, 'platte'); mkdirSync(wurzel); writeFileSync(join(wurzel, 'datei.txt'), 'harmlos');
  const state = join(dir, 'state'); mkdirSync(state);
  return {
    dir, wurzel, poweroff: join(dir, 'poweroff-marke'),
    env: {
      PA_HCLOUD_API: mock.api, PA_METADATA_URL: mock.metadata, PA_HCLOUD_TOKEN_DATEI: tokenDatei, PA_ARMED_FILE: marker,
      PA_ABBILD_LOCK: join(dir, 'lock'), PA_SYSTEMCTL: 'true', PA_SYNC_BEFEHL: 'true', PA_SAEUBERN_BEFEHL: 'true',
      PA_POWEROFF_BEFEHL: `touch ${join(dir, 'poweroff-marke')}`, PA_ABBILD_TOKENSUCHE_WURZEL: wurzel, PA_STATE_DIR: state,
      PA_ABBILD_POLL_SEKUNDEN: '0', PA_ABBILD_PAUSE_SEKUNDEN: '0', PA_ABBILD_NACH_DELETE_SEKUNDEN: '0', PA_HCLOUD_PAUSE: '0',
      PA_ABBILD_WARTE_SEKUNDEN: '3', PA_ABBILD_VERSUCHE: '2', ...extra,
    },
  };
}
const alsAbbild = (id, extra = {}) => ({ id, type: 'snapshot', status: 'available', created: `2026-11-0${id % 9 + 1}T00:00:00+00:00`, labels: { 'projectarmageddon-snapshot': 'auto' }, image_size: 1, disk_size: 80, created_from: { id: 1 }, ...extra });
const aufrufe = (mock, methode, re) => mock.zustand.log.filter(l => l.methode === methode && re.test(l.pfad));

/* ------------------------------------------------------------------ Syntax, Konfig */

test('Abruf: alle Skripte bestehen bash -n', () => {
  for (const name of SKRIPTE) {
    const r = spawnSync('bash', ['-n', S(name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  }
});

test('Abruf: --print-config der neuen Skripte (ohne Netz, ohne Token)', () => {
  const a = spawnSync('bash', [S('selbst-abbild-loeschen.sh'), '--print-config'], { encoding: 'utf8' });
  assert.equal(a.status, 0);
  assert.match(a.stdout, /projectarmageddon-snapshot=auto/);
  assert.match(a.stdout, /Abbilder behalten\s*: 1 /);
  assert.match(a.stdout, /Fail-safe/);
  const b = spawnSync('bash', [S('server-hochfahren.sh'), '--print-config'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(b.status, 0);
  assert.match(b.stdout, /sslip\.io/);
  assert.match(b.stdout, /15 min/);
  assert.match(b.stdout, /abbild-loeschen/);
  assert.match(b.stdout, /NICHT gesetzt/);
  const c = spawnSync('bash', [S('idle-watch.sh'), '--print-config'], { encoding: 'utf8', env: { PATH: process.env.PATH, PA_ACTION: 'abbild-loeschen' } });
  assert.match(c.stdout, /abbild-loeschen/);
  assert.match(c.stdout, /Server LÖSCHEN/);
});

test('Abruf: Trockenlauf von selbst-abbild-loeschen.sh ändert und fragt nichts', async () => {
  const mock = await starteMock();
  try {
    const u = serverUmgebung(mock, { PA_DRY_RUN: '1' });
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /TROCKENLAUF/);
    assert.equal(mock.zustand.log.length, 0, 'kein einziger API-Aufruf');
  } finally { await mock.schliessen(); }
});

/* ------------------------------------------------------------ selbst-abbild-loeschen */

test('Abruf Erfolgsweg: Abbild verfügbar+geprüft → alte Abbilder weg → ERST DANN Server gelöscht', async () => {
  const mock = await starteMock({ pollBisFertig: 2 });
  mock.zustand.images.push(alsAbbild(100), alsAbbild(101), alsAbbild(102, { labels: { fremd: 'ja' } }));
  try {
    const u = serverUmgebung(mock);
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 0, r.err);
    const log = mock.zustand.log;
    const erzeugt = log.findIndex(l => l.methode === 'POST' && /create_image$/.test(l.pfad));
    const delServer = log.findIndex(l => l.methode === 'DELETE' && l.pfad === '/servers/4242');
    assert.ok(erzeugt >= 0 && delServer > erzeugt, 'Server-DELETE kommt nach create_image');
    const body = log[erzeugt].body;
    assert.equal(body.type, 'snapshot');
    assert.deepEqual(body.labels, { 'projectarmageddon-snapshot': 'auto' });
    const letzteAbfrage = log.map((l, i) => (l.methode === 'GET' && /^\/images\/\d+$/.test(l.pfad) ? i : -1)).filter(i => i >= 0).pop();
    assert.ok(letzteAbfrage < delServer, 'erst Abbild abgefragt, dann gelöscht');
    const geloescht = aufrufe(mock, 'DELETE', /^\/images\//).map(l => l.pfad);
    assert.deepEqual(geloescht.sort(), ['/images/100', '/images/101'], 'nur alte Abbilder MIT Etikett, fremde bleiben');
    assert.ok(mock.zustand.images.some(i => i.id === 102), 'Abbild ohne unser Etikett bleibt');
    assert.ok(mock.zustand.images.some(i => i.status === 'available' && i.id >= 9000), 'das neue Abbild bleibt');
    assert.equal(mock.zustand.servers.length, 0, 'Server ist gelöscht');
    assert.ok(!existsSync(u.poweroff), 'kein poweroff im Erfolgsfall');
    assert.ok(log.every(l => l.pfad === '/instance-id' || l.auth === `Bearer ${TEST_TOKEN}`), 'jede Anfrage trägt das Token');
    assert.ok(!r.err.includes(TEST_TOKEN) && !r.out.includes(TEST_TOKEN), 'Token nie in der Ausgabe');
  } finally { await mock.schliessen(); }
});

test('Abruf Erfolgsweg: PA_ABBILD_BEHALTEN=2 behält das neue und das neueste alte', async () => {
  const mock = await starteMock();
  mock.zustand.images.push(alsAbbild(100), alsAbbild(101));
  try {
    const u = serverUmgebung(mock, { PA_ABBILD_BEHALTEN: '2' });
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(aufrufe(mock, 'DELETE', /^\/images\//).map(l => l.pfad), ['/images/100']);
  } finally { await mock.schliessen(); }
});

test('Abruf Fail-safe: Abbild bleibt „creating“ → Server NICHT gelöscht, alte Abbilder bleiben, poweroff, lautes Protokoll', async () => {
  const mock = await starteMock({ abbild: 'haengt' });
  mock.zustand.images.push(alsAbbild(100));
  try {
    const u = serverUmgebung(mock, { PA_ABBILD_WARTE_SEKUNDEN: '1' });
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 20, r.err);
    assert.equal(aufrufe(mock, 'DELETE', /^\/servers\//).length, 0, 'kein DELETE des Servers');
    assert.ok(mock.zustand.servers.length === 1);
    assert.ok(mock.zustand.images.some(i => i.id === 100), 'altes Abbild bleibt');
    assert.equal(aufrufe(mock, 'POST', /create_image$/).length, 2, 'zwei Versuche');
    assert.ok(existsSync(u.poweroff), 'poweroff wurde angefordert');
    assert.match(r.err, /FAIL-SAFE/);
    assert.match(r.err, /WEITER AB/);
  } finally { await mock.schliessen(); }
});

test('Abruf Fail-safe: Abbild verfügbar, aber Größe 0 → ungeprüft, Server bleibt', async () => {
  const mock = await starteMock({ abbild: 'leer' });
  try {
    const u = serverUmgebung(mock);
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 20, r.err);
    assert.match(r.err, /image_size nicht > 0/);
    assert.equal(aufrufe(mock, 'DELETE', /^\/servers\//).length, 0);
  } finally { await mock.schliessen(); }
});

test('Abruf Fail-safe: ohne PA_ABBILD_FAILSAFE_POWEROFF bleibt der Server an, aber wird nie gelöscht', async () => {
  const mock = await starteMock({ abbild: 'haengt' });
  try {
    const u = serverUmgebung(mock, { PA_ABBILD_WARTE_SEKUNDEN: '1', PA_ABBILD_FAILSAFE_POWEROFF: 'no', PA_ABBILD_VERSUCHE: '1' });
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 20);
    assert.ok(!existsSync(u.poweroff));
    assert.equal(aufrufe(mock, 'DELETE', /^\/servers\//).length, 0);
  } finally { await mock.schliessen(); }
});

test('Abruf: Token auf der Platte → kein Abbild (Snapshot würde es enthalten)', async () => {
  const mock = await starteMock();
  try {
    const u = serverUmgebung(mock);
    writeFileSync(join(u.wurzel, 'user-data.txt'), `token: ${TEST_TOKEN}\n`);
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 20, r.err);
    assert.match(r.err, /Token auf der Platte gefunden/);
    assert.equal(aufrufe(mock, 'POST', /create_image$/).length, 0, 'es wurde gar kein Abbild angefordert');
    assert.equal(aufrufe(mock, 'DELETE', /^\/servers\//).length, 0);
    assert.ok(!r.err.includes(TEST_TOKEN));
  } finally { await mock.schliessen(); }
});

test('Abruf: Server ohne Etikett löscht sich nicht selbst; fehlender Marker und fehlendes Token ändern nichts', async () => {
  const mock = await starteMock({ serverLabels: {} });
  try {
    const u = serverUmgebung(mock);
    let r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 1);
    assert.match(r.err, /trägt das Etikett/);
    assert.equal(aufrufe(mock, 'POST', /create_image$/).length, 0);
    r = await lauf(S('selbst-abbild-loeschen.sh'), [], { ...u.env, PA_ARMED_FILE: join(u.dir, 'gibt-es-nicht') });
    assert.equal(r.code, 11);
    r = await lauf(S('selbst-abbild-loeschen.sh'), [], { ...u.env, PA_HCLOUD_TOKEN_DATEI: join(u.dir, 'fehlt') });
    assert.equal(r.code, 1);
    chmodSync(u.env.PA_HCLOUD_TOKEN_DATEI, 0o644);
    r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 1, 'Token-Datei mit Rechten 644 wird nicht gelesen');
    assert.equal(mock.zustand.log.filter(l => l.methode !== 'GET' && l.pfad !== '/instance-id').length, 0);
  } finally { await mock.schliessen(); }
});

test('Abruf: PA_ABBILD_BEHALTEN=0 und Unsinn werden verweigert', async () => {
  const mock = await starteMock();
  try {
    const u = serverUmgebung(mock, { PA_ABBILD_BEHALTEN: '0' });
    const r = await lauf(S('selbst-abbild-loeschen.sh'), [], u.env);
    assert.equal(r.code, 1);
    assert.equal(mock.zustand.log.length, 0);
  } finally { await mock.schliessen(); }
});

/* --------------------------------------------------------------- idle-watch Anbindung */

test('Abruf: idle-watch mit PA_ACTION=abbild-loeschen ruft selbst-abbild-loeschen.sh (Marker scharf)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-idle-'));
  const stub = join(dir, 'stub.sh'); const spur = join(dir, 'aufgerufen');
  writeFileSync(stub, `#!/usr/bin/env bash\ntouch ${spur}\n`, { mode: 0o755 });
  const marker = join(dir, 'ist-gemietet'); writeFileSync(marker, '');
  const r = await lauf(S('idle-watch.sh'), ['--once'], {
    PA_ACTION: 'abbild-loeschen', PA_ABBILD_LOESCHEN_SKRIPT: stub, PA_ARMED_FILE: marker, PA_STATE_DIR: join(dir, 'st'),
    PA_MAX_MACHINE_MINUTES: '0', PA_BREMSE_DATEI: join(dir, 'bremse'), PA_HEALTH_URL: 'http://127.0.0.1:9/healthz',
  });
  assert.equal(r.code, 10, r.err);
  assert.ok(existsSync(spur), 'das Skript wurde aufgerufen');
  // Ohne Marker: keine Aktion
  rmSync(spur);
  const n = await lauf(S('idle-watch.sh'), ['--once'], {
    PA_ACTION: 'abbild-loeschen', PA_ABBILD_LOESCHEN_SKRIPT: stub, PA_ARMED_FILE: join(dir, 'fehlt'), PA_STATE_DIR: join(dir, 'st2'),
    PA_MAX_MACHINE_MINUTES: '0', PA_HEALTH_URL: 'http://127.0.0.1:9/healthz',
  });
  assert.equal(n.code, 11);
  assert.ok(!existsSync(spur), 'nicht scharf: kein Aufruf');
  // Trockenlauf: kein Aufruf
  const t = await lauf(S('idle-watch.sh'), ['--once'], {
    PA_ACTION: 'abbild-loeschen', PA_ABBILD_LOESCHEN_SKRIPT: stub, PA_ARMED_FILE: marker, PA_STATE_DIR: join(dir, 'st3'),
    PA_MAX_MACHINE_MINUTES: '0', PA_DRY_RUN: '1', PA_HEALTH_URL: 'http://127.0.0.1:9/healthz',
  });
  assert.equal(t.code, 10);
  assert.ok(!existsSync(spur));
});

/* ------------------------------------------------------------------ server-hochfahren */

const hochfahrenEnv = (mock, extra = {}) => ({ HCLOUD_TOKEN: TEST_TOKEN, PA_HCLOUD_API: mock.api, PA_HCLOUD_PAUSE: '0', PA_WARTE_SEKUNDEN: '1', PA_POLL_SEKUNDEN: '0', PA_FEHLER_POLL_SEKUNDEN: '0', ...extra });
const leererMock = async opt => { const m = await starteMock(opt); m.zustand.servers = []; return m; };

test('Hochfahren frisch: reserviert Primary IP (auto_delete=false), billigster verfügbarer Typ, Token nur nach /run', async () => {
  const mock = await leererMock();
  try {
    const r = await lauf(S('server-hochfahren.sh'), ['hochfahren'], hochfahrenEnv(mock));
    assert.equal(r.code, 1, 'der Fake setzt nie „bereit“ → Wartezeit läuft ab');
    const ip = aufrufe(mock, 'POST', /^\/primary_ips$/)[0].body;
    assert.equal(ip.auto_delete, false);
    assert.equal(ip.type, 'ipv4');
    assert.deepEqual(ip.labels, { 'projectarmageddon-ip': 'ja' });
    const s = aufrufe(mock, 'POST', /^\/servers$/);
    assert.equal(s.length, 1);
    const b = s[0].body;
    assert.equal(b.server_type, 'cpx22', 'cx23 ist laut API nicht verfügbar; ccx dediziert und cpx32 über Budget ausgeschlossen');
    assert.equal(b.location, 'fsn1');
    assert.equal(b.image, 'ubuntu-24.04');
    assert.deepEqual(b.labels, { 'projectarmageddon-server': 'ja' });
    assert.equal(b.public_net.ipv4, mock.zustand.primary_ips[0].id);
    assert.equal(b.ssh_keys, undefined, 'ohne PA_SSH_PUBKEY kein SSH-Schlüssel');
    const ud = b.user_data;
    assert.ok(ud.startsWith('#cloud-config\n'));
    assert.ok(ud.length < 32 * 1024);
    const cfg = JSON.parse(ud.slice('#cloud-config\n'.length));
    const datei = p => cfg.write_files.find(f => f.path === p);
    assert.equal(datei('/run/projectarmageddon/hcloud-token').permissions, '0600');
    assert.equal(datei('/run/projectarmageddon/hcloud-token').content.trim(), TEST_TOKEN);
    for (const f of cfg.write_files) {
      if (f.path !== '/run/projectarmageddon/hcloud-token') assert.ok(!f.content.includes(TEST_TOKEN), `Token nicht in ${f.path}`);
    }
    const env = datei('/etc/projectarmageddon/betrieb.env').content;
    for (const z of ['PA_IDLE_MINUTES=15', 'PA_ACTION=abbild-loeschen', 'PA_ABBILD_BEHALTEN=1', 'HOST=127.0.0.1', 'PA_BUILD=0']) assert.ok(env.includes(z), z);
    assert.match(env, /PA_ERLAUBTE_ORIGINS=https:\/\/198-51-100-23\.sslip\.io/);
    assert.deepEqual(cfg.runcmd, [['/usr/local/sbin/pa-erstinstallation.sh', '--frisch']]);
    assert.equal(cfg.ssh_pwauth, false);
    assert.match(r.err, /Primary IP reserviert: 198\.51\.100\.23/);
    assert.ok(!r.err.includes(TEST_TOKEN) && !r.out.includes(TEST_TOKEN));
  } finally { await mock.schliessen(); }
});

test('Hochfahren: PA_DOMAIN, Leerlauf und Zusatzzeilen kommen in betrieb.env; Unsinn wird verweigert', async () => {
  const mock = await leererMock();
  try {
    const r = await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock, { PA_DOMAIN: 'https://knoten.example.org/', PA_IDLE_MINUTES: '2', PA_GRACE_MINUTES: '1', PA_EXTRA_ENV: 'PA_LOBBY_LEER_MS=60000', PA_WEITERE_ORIGINS: 'https://www.projectarmageddon.de' }));
    assert.equal(r.code, 1);
    const cfg = JSON.parse(aufrufe(mock, 'POST', /^\/servers$/)[0].body.user_data.slice(14));
    const env = cfg.write_files.find(f => f.path === '/etc/projectarmageddon/betrieb.env').content;
    assert.match(env, /PA_EIGENER_ORIGIN=https:\/\/knoten\.example\.org\n/);
    assert.match(env, /PA_ERLAUBTE_ORIGINS=https:\/\/knoten\.example\.org,https:\/\/www\.projectarmageddon\.de\n/);
    assert.match(env, /PA_IDLE_MINUTES=2\n/);
    assert.match(env, /PA_LOBBY_LEER_MS=60000/);
    const falsch = await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock, { PA_EXTRA_ENV: 'PA_X=$(rm -rf)' }));
    assert.equal(falsch.code, 1);
  } finally { await mock.schliessen(); }
});

test('Hochfahren aus Abbild: neuestes Abbild, Primary IP wiederverwendet, --aus-abbild', async () => {
  const mock = await leererMock();
  mock.zustand.images.push(alsAbbild(100, { created: '2026-11-01T00:00:00+00:00' }), alsAbbild(101, { created: '2026-11-05T00:00:00+00:00' }), alsAbbild(102, { status: 'creating', created: '2026-11-09T00:00:00+00:00' }));
  mock.zustand.primary_ips.push({ id: 55, type: 'ipv4', ip: '203.0.113.9', location: { name: 'nbg1' }, assignee_id: null, labels: { 'projectarmageddon-ip': 'ja' } });
  try {
    const r = await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock));
    assert.equal(r.code, 1);
    assert.equal(aufrufe(mock, 'POST', /^\/primary_ips$/).length, 0, 'keine zweite Primary IP');
    const b = aufrufe(mock, 'POST', /^\/servers$/)[0].body;
    assert.equal(b.image, 101, 'neuestes VERFÜGBARES Abbild');
    assert.equal(b.location, 'nbg1', 'Standort der Primary IP');
    assert.equal(b.public_net.ipv4, 55);
    const cfg = JSON.parse(b.user_data.slice(14));
    assert.deepEqual(cfg.runcmd[0].slice(1), ['--aus-abbild']);
  } finally { await mock.schliessen(); }
});

test('Hochfahren: existiert schon ein Server, wird nichts erzeugt (nie zwei)', async () => {
  const mock = await starteMock();
  try {
    const r = await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock));
    assert.equal(r.code, 1);
    assert.match(r.err, /schon ein Server/);
    assert.equal(mock.zustand.log.filter(l => l.methode === 'POST').length, 0);
  } finally { await mock.schliessen(); }
});

test('Hochfahren: Platte des Abbilds größer als jeder bezahlbare Typ → klare Absage statt Teuer-Server', async () => {
  const mock = await leererMock();
  mock.zustand.images.push(alsAbbild(100, { disk_size: 160 }));
  try {
    const r = await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock));
    assert.equal(r.code, 1);
    assert.match(r.err, /Kein verfügbarer Servertyp/);
    assert.equal(aufrufe(mock, 'POST', /^\/servers$/).length, 0);
  } finally { await mock.schliessen(); }
});

test('Hochfahren --trocken: legt weder IP noch Server an; ohne Token Bedienfehler', async () => {
  const mock = await leererMock();
  try {
    const r = await lauf(S('server-hochfahren.sh'), ['--trocken'], hochfahrenEnv(mock));
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /TROCKENLAUF/);
    assert.equal(mock.zustand.log.filter(l => l.methode === 'POST').length, 0);
    const k = await lauf(S('server-hochfahren.sh'), [], { PA_HCLOUD_API: mock.api });
    assert.equal(k.code, 1);
  } finally { await mock.schliessen(); }
});

test('Hochfahren: SSH nur mit Schlüssel (nie Passwort)', async () => {
  const mock = await leererMock();
  try {
    await lauf(S('server-hochfahren.sh'), [], hochfahrenEnv(mock, { PA_SSH_PUBKEY: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest test@pa' }));
    const b = aufrufe(mock, 'POST', /^\/servers$/)[0].body;
    assert.equal(b.ssh_keys.length, 1);
    assert.match(readFileSync(S('server-erstinstallation.sh'), 'utf8'), /PasswordAuthentication no/);
  } finally { await mock.schliessen(); }
});

test('Status: listet Server, Abbilder, Primary IPs', async () => {
  const mock = await starteMock();
  mock.zustand.images.push(alsAbbild(100));
  try {
    const r = await lauf(S('server-hochfahren.sh'), ['status'], hochfahrenEnv(mock));
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Server: 1/);
    assert.match(r.out, /Abbilder \(Snapshots\): 1/);
    assert.match(r.out, /Primary IPs: 0/);
    assert.match(r.out, /Volumes: 0/);
  } finally { await mock.schliessen(); }
});

test('Not-aus: Abbild geprüft → Server gelöscht; Abbild hängt → Server BLEIBT (außer --erzwingen)', async () => {
  const ok = await starteMock();
  try {
    const r = await lauf(S('server-hochfahren.sh'), ['not-aus'], hochfahrenEnv(ok, { PA_ABBILD_WARTE_SEKUNDEN: '5' }));
    assert.equal(r.code, 0, r.err);
    assert.equal(ok.zustand.servers.length, 0);
    assert.equal(ok.zustand.images.filter(i => i.status === 'available').length, 1);
    assert.ok(aufrufe(ok, 'POST', /shutdown$/).length === 1, 'erst sauber herunterfahren');
  } finally { await ok.schliessen(); }
  const haengt = await starteMock({ abbild: 'haengt' });
  try {
    const r = await lauf(S('server-hochfahren.sh'), ['not-aus'], hochfahrenEnv(haengt, { PA_ABBILD_WARTE_SEKUNDEN: '1' }));
    assert.equal(r.code, 1);
    assert.equal(haengt.zustand.servers.length, 1, 'ohne geprüftes Abbild wird nicht gelöscht');
    const z = await lauf(S('server-hochfahren.sh'), ['not-aus', '--erzwingen'], hochfahrenEnv(haengt, { PA_ABBILD_WARTE_SEKUNDEN: '1' }));
    assert.equal(z.code, 0);
    assert.equal(haengt.zustand.servers.length, 0);
  } finally { await haengt.schliessen(); }
});

test('Not-aus mit Frist: nur Server, die älter sind (zweite Frist außerhalb des Servers)', async () => {
  const mock = await starteMock();
  try {
    const jung = await lauf(S('server-hochfahren.sh'), ['not-aus', '--aelter-als-stunden', '100000'], hochfahrenEnv(mock));
    assert.equal(jung.code, 0);
    assert.equal(mock.zustand.servers.length, 1, 'zu jung → bleibt');
    const alt = await lauf(S('server-hochfahren.sh'), ['not-aus', '--aelter-als-stunden', '1'], hochfahrenEnv(mock, { PA_ABBILD_WARTE_SEKUNDEN: '5' }));
    assert.equal(alt.code, 0, alt.err);
    assert.equal(mock.zustand.servers.length, 0);
  } finally { await mock.schliessen(); }
});

/* ------------------------------------------------------------ Token nie im Repo, Workflow */

function dateien(verz, aus = []) {
  const liste = [];
  for (const name of readdirSync(verz)) {
    if (['node_modules', '.git', 'dist', 'release', 'test-results'].includes(name)) continue;
    const p = join(verz, name);
    const st = statSync(p);
    if (st.isDirectory()) liste.push(...dateien(p, aus));
    else if (st.size < 2_000_000 && /\.(sh|mjs|js|md|yml|yaml|json|txt|env|example|service|timer|nft|beispiel)$/.test(name)) liste.push(p);
  }
  return liste;
}

test('Kein Hetzner-Token-Literal im Repo (Skripte, Doku, Workflows, Tests, Vorlagen)', () => {
  const treffer = [];
  for (const wurzel of ['scripts', 'deploy', 'docs', '.github', 'tests']) {
    const verz = join(WURZEL, wurzel);
    if (!existsSync(verz)) continue;
    for (const datei of dateien(verz)) {
      const text = readFileSync(datei, 'utf8');
      for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z0-9]{64}(?![A-Za-z0-9])/g)) {
        // SHA-256 sind reines Hex in Kleinbuchstaben; ein Token mischt Groß-/Kleinbuchstaben und Ziffern.
        if (/[A-Z]/.test(m[0]) && /[a-z]/.test(m[0]) && /\d/.test(m[0])) treffer.push(`${datei}: ${m[0].slice(0, 6)}…`);
      }
      assert.ok(!/HCLOUD_TOKEN\s*=\s*['"]?(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{40,}/.test(text), `${datei}: HCLOUD_TOKEN mit Wert`);
    }
  }
  assert.deepEqual(treffer, [], 'ein 64-Zeichen-Schlüssel steht im Repo');
});

test('Token-Weg: nur tmpfs (/run), kein Token in betrieb.env-Vorlage, Scharf-Marker und Etikett-Schutz', () => {
  const hoch = readFileSync(S('server-hochfahren.sh'), 'utf8');
  assert.match(hoch, /"path":"\/run\/projectarmageddon\/hcloud-token"/);
  assert.doesNotMatch(hoch, /HCLOUD_TOKEN=\$|echo .*HC_TOKEN|printf .*HC_TOKEN.*>>/);
  const lib = readFileSync(S('hcloud-api.sh'), 'utf8');
  assert.match(lib, /-K <\(printf 'header = "Authorization: Bearer %s/, 'Token nicht in der curl-Befehlszeile');
  assert.match(readFileSync(join(WURZEL, 'deploy/betrieb.env.example'), 'utf8'), /^#?PA_ABBILD_BEHALTEN=/m);
  const own = readFileSync(S('selbst-abbild-loeschen.sh'), 'utf8');
  assert.match(own, /\/run\/projectarmageddon\/hcloud-token/);
  assert.match(own, /PA_SERVER_LABEL/);
});

test('Workflow server-hochfahren.yml: Auslöser, Eingabe aktion, Secret HCLOUD_TOKEN, Zeitplan als zweite Frist', () => {
  const y = readFileSync(join(WURZEL, '.github/workflows/server-hochfahren.yml'), 'utf8');
  assert.match(y, /workflow_dispatch:/);
  assert.match(y, /aktion:/);
  for (const w of ['hochfahren', 'status', 'not-aus']) assert.ok(y.includes(w), w);
  assert.match(y, /\$\{\{ secrets\.HCLOUD_TOKEN \}\}/);
  assert.match(y, /schedule:/, 'zweite Frist außerhalb des Servers');
  assert.match(y, /GITHUB_STEP_SUMMARY|server-hochfahren\.sh/);
  assert.doesNotMatch(y, /(echo|printf)[^\n]*\$\{?HCLOUD_TOKEN/);
});
