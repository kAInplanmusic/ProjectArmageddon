/**
 * Starter (scripts/betrieb/starter/): Login, Sperre, CSRF, Aufträge. Mock-getestet:
 * das Hochfahr-Skript ist durch ein Stellvertreter-Skript ersetzt (PA_STARTER_SKRIPT),
 * es wird NICHTS bei Hetzner angefragt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { erzeugeStarter, hashePasswort, pruefePasswort } from '../scripts/betrieb/starter/starter.mjs';

const PASSWORT = 'ein-langes-test-passwort';
const TOKEN = 'TESTTOKEN-starter-nicht-echt-987654321';

async function starte(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pa-starter-'));
  const stub = join(dir, 'stub.sh');
  writeFileSync(stub, '#!/usr/bin/env bash\necho "aktion=$1"\necho "token=${HCLOUD_TOKEN:+gesetzt}"\necho "fremd=${GEHEIM_FREMD:-leer}"\nsleep 0.3\necho fertig\n', { mode: 0o755 });
  chmodSync(stub, 0o755);
  const env = { PATH: process.env.PATH, HOME: dir, GEHEIM_FREMD: 'x', HCLOUD_TOKEN: TOKEN, PA_STARTER_PASSWORT_HASH: hashePasswort(PASSWORT), PA_STARTER_GEHEIMNIS: 'g'.repeat(40), PA_STARTER_SKRIPT: stub, ...extra };
  const server = erzeugeStarter({ env });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const basis = `http://127.0.0.1:${server.address().port}`;
  return { server, basis, schliessen: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) };
}
const post = (url, daten, cookie) => fetch(url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(daten) });
async function anmelden(basis) {
  const r = await post(`${basis}/login`, { passwort: PASSWORT });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const seite = await (await fetch(`${basis}/`, { headers: { cookie } })).text();
  return { cookie, csrf: /name="csrf" value="([0-9a-f]+)"/.exec(seite)[1], seite };
}

test('Starter: Passwort-Hash (scrypt) stimmt nur für das richtige Passwort; Werkzeug schreibt den Hash, nicht das Passwort', () => {
  const h = hashePasswort(PASSWORT);
  assert.ok(pruefePasswort(PASSWORT, h));
  assert.ok(!pruefePasswort('falsch', h));
  assert.ok(!pruefePasswort(PASSWORT, 'kaputt'));
  const r = spawnSync('node', [join(WURZEL, 'scripts/betrieb/starter/passwort-hash.mjs'), '--geheimnis'], { input: PASSWORT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PA_STARTER_PASSWORT_HASH=scrypt\$16384\$[0-9a-f]+\$[0-9a-f]+$/m);
  assert.match(r.stdout, /^PA_STARTER_GEHEIMNIS=[0-9a-f]{64}$/m);
  assert.ok(!r.stdout.includes(PASSWORT));
});

test('Starter: ohne Passwort-Hash/Geheimnis startet er nicht', () => {
  assert.throws(() => erzeugeStarter({ env: {} }), /Pflicht/);
});

test('Starter: ohne Anmeldung nur Login-Seite; Aktionen verweigert', async () => {
  const s = await starte();
  try {
    const t = await (await fetch(`${s.basis}/`)).text();
    assert.match(t, /type="password"/);
    assert.doesNotMatch(t, /Hochfahren/);
    const r = await post(`${s.basis}/aktion`, { aktion: 'hochfahren', csrf: 'x' });
    assert.equal(r.status, 401);
    assert.equal(s.server.job.zeilen.length, 0, 'es lief nichts');
  } finally { await s.schliessen(); }
});

test('Starter: Login, CSRF-Pflicht, Auftrag läuft mit Token nur im Kindprozess, Ausgabe ohne Token', async () => {
  const s = await starte();
  try {
    const { cookie, csrf, seite } = await anmelden(s.basis);
    assert.match(seite, /Hochfahren/); assert.match(seite, /Not-aus/);
    assert.match(cookie, /^pa_sitzung=/);
    const raw = await post(`${s.basis}/login`, { passwort: PASSWORT });
    assert.match(raw.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await post(`${s.basis}/aktion`, { aktion: 'status', csrf: 'falsch' }, cookie)).status, 403);
    assert.equal((await post(`${s.basis}/aktion`, { aktion: 'rm -rf', csrf }, cookie)).status, 400);
    assert.equal((await post(`${s.basis}/aktion`, { aktion: 'status', csrf }, cookie)).status, 303);
    assert.equal((await post(`${s.basis}/aktion`, { aktion: 'status', csrf }, cookie)).status, 409, 'ein Auftrag gleichzeitig');
    for (let i = 0; i < 40 && s.server.job.laeuft; i++) await new Promise(r => setTimeout(r, 50));
    assert.deepEqual(s.server.job.zeilen, ['aktion=status', 'token=gesetzt', 'fremd=leer', 'fertig']);
    const nachher = await (await fetch(`${s.basis}/`, { headers: { cookie } })).text();
    assert.match(nachher, /aktion=status/);
    assert.ok(!nachher.includes(TOKEN) && !nachher.includes(PASSWORT));
    // gefälschtes Cookie
    const faelsch = await fetch(`${s.basis}/`, { headers: { cookie: cookie.replace(/\.[^.]+$/, '.AAAA') } });
    assert.match(await faelsch.text(), /type="password"/);
  } finally { await s.schliessen(); }
});

test('Starter: nach 5 Fehlversuchen Sperre (429), auch mit richtigem Passwort', async () => {
  const s = await starte();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await post(`${s.basis}/login`, { passwort: 'falsch' })).status, 401);
    assert.equal((await post(`${s.basis}/login`, { passwort: PASSWORT })).status, 429);
  } finally { await s.schliessen(); }
});

test('Starter: Abmelden beendet die Sitzung; Token/Hash stehen nicht in den Quelldateien', async () => {
  const s = await starte();
  try {
    const { cookie, csrf } = await anmelden(s.basis);
    assert.equal((await post(`${s.basis}/abmelden`, { csrf }, cookie)).status, 303);
    assert.match(await (await fetch(`${s.basis}/`, { headers: { cookie } })).text(), /type="password"/);
  } finally { await s.schliessen(); }
});
