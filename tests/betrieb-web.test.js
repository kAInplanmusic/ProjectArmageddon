/**
 * Web-Zugang (Option D, scripts/betrieb/web/gateway-kern.mjs, netlify/functions): Login, Sitzung,
 * Sperre, Herkunft, Start/Status/Not-aus gegen ein FALSCHES Hetzner (ersetztes fetch). Es wird nichts
 * bei Hetzner oder im Netz angefragt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import {
  behandle, baueUserData, hashePasswort, leereLimit, leseKonfig, neueSitzung, notAus, notAusAuftrag, pruefePasswort, sitzungGueltig,
} from '../scripts/betrieb/web/gateway-kern.mjs';

const PW = 'ein-langes-test-passwort';
const TOKEN = 'TESTTOKEN-web-nicht-echt-135792468';
const ORIGIN = 'https://www.projectarmageddon.de';
const HASH = await hashePasswort(PW, Buffer.alloc(16, 7), 2000);
const ENV = { HCLOUD_TOKEN: TOKEN, PA_WEB_PASSWORT_HASH: HASH, PA_WEB_GEHEIMNIS: 'g'.repeat(40) };

function falschesHetzner(zustand = {}) {
  const z = { server: null, bilder: [{ id: 11, status: 'available', type: 'snapshot', created: '2026-11-10T18:00:00Z', image_size: 2.1 }], ips: [{ id: 5, ip: '49.13.138.200', location: { name: 'fsn1' }, assignee_id: null }], aufrufe: [], healthz: true, bildFehler: false, ...zustand };
  const json = (code, obj) => new Response(code === 204 ? null : JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });
  const fn = async (url, opt = {}) => {
    const u = new URL(url); const m = opt.method ?? 'GET'; const pfad = u.pathname.replace('/v1', '');
    z.aufrufe.push(`${m} ${pfad}`);
    if (u.hostname.endsWith('sslip.io')) return z.healthz ? json(200, { ok: true, version: '0.9.0', gitSha: 'abc' }) : json(503, {});
    if (opt.headers?.authorization !== `Bearer ${TOKEN}`) return json(401, { error: { message: 'token' } });
    if (m === 'GET' && pfad === '/servers') return json(200, { servers: z.server ? [z.server] : [] });
    if (m === 'GET' && pfad === '/images') return json(200, { images: z.bilder });
    if (m === 'GET' && pfad === '/primary_ips') return json(200, { primary_ips: z.ips });
    if (m === 'POST' && pfad === '/servers') { z.angelegt = JSON.parse(opt.body); z.server = { id: 77, status: 'running', labels: {}, public_net: { ipv4: { ip: '49.13.138.200' } } }; return json(201, { server: z.server }); }
    if (m === 'GET' && pfad === '/servers/77') return z.server ? json(200, { server: z.server }) : json(404, {});
    if (m === 'PUT' && pfad === '/servers/77') { z.server.labels = JSON.parse(opt.body).labels; return json(200, {}); }
    if (pfad === '/servers/77/actions/shutdown' || pfad === '/servers/77/actions/poweroff') { z.server.status = 'off'; return json(201, {}); }
    if (pfad === '/servers/77/actions/create_image') { z.bilder.push({ id: 99, status: 'available', type: 'snapshot', created: '2026-11-10T19:00:00Z', created_from: { id: z.bildFehler ? 1 : 77 } }); return json(201, { image: { id: 99 } }); }
    if (m === 'GET' && pfad === '/images/99') return json(200, { image: z.bilder.find(b => b.id === 99) });
    if (m === 'DELETE' && pfad.startsWith('/images/')) { z.bilder = z.bilder.filter(b => `/images/${b.id}` !== pfad); return json(204, {}); }
    if (m === 'DELETE' && pfad === '/servers/77') { z.server = null; return json(200, {}); }
    return json(404, {});
  };
  return { z, fn };
}
const deps = (f, extra = {}) => ({ env: ENV, fetch: f.fn, sleep: async () => {}, jetzt: () => 1_800_000_000_000, installer: () => '#!/bin/bash\necho installer\n', ...extra });
const anfrage = (pfad, { methode = 'GET', body, cookie, origin = ORIGIN, ip = '1.2.3.4' } = {}) => new Request(`https://www.projectarmageddon.de/api/web/${pfad}`, {
  method: methode, body: body ? JSON.stringify(body) : undefined,
  headers: { ...(methode !== 'GET' ? { 'x-pa-web': '1', origin } : {}), ...(cookie ? { cookie } : {}), 'x-nf-client-connection-ip': ip },
});
async function anmelden(d) {
  const r = await behandle(anfrage('login', { methode: 'POST', body: { passwort: PW } }), d);
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('Web: Passwort-Hash (PBKDF2) stimmt nur für das richtige Passwort', async () => {
  assert.equal(await pruefePasswort(PW, HASH), true);
  assert.equal(await pruefePasswort(PW + 'x', HASH), false);
  assert.equal(await pruefePasswort(PW, 'kaputt'), false);
  assert.match(await hashePasswort(PW), /^pbkdf2\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
});

test('Web: Sitzung ist signiert, läuft ab und lässt sich nicht fälschen', () => {
  const g = 'g'.repeat(40); const t = 1_800_000_000_000;
  const s = neueSitzung(g, t);
  assert.equal(sitzungGueltig(s, g, t + 1000), true);
  assert.equal(sitzungGueltig(s, g, t + 13 * 3600_000), false, 'abgelaufen');
  assert.equal(sitzungGueltig(s, 'h'.repeat(40), t), false, 'falscher Schlüssel');
  assert.equal(sitzungGueltig(s.replace('v1.', 'v1.9'), g, t), false, 'verändert');
  assert.equal(sitzungGueltig('', g, t), false);
});

test('Web: Login setzt ein HttpOnly/Secure/SameSite-Cookie; ohne Sitzung ist alles gesperrt', async () => {
  leereLimit(); const f = falschesHetzner(); const d = deps(f);
  const r = await behandle(anfrage('login', { methode: 'POST', body: { passwort: PW } }), d);
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Strict/);
  assert.equal((await behandle(anfrage('status'), d)).status, 401);
  assert.equal((await behandle(anfrage('start', { methode: 'POST', body: {} }), d)).status, 401);
  assert.equal((await behandle(anfrage('status', { cookie: 'pa_web=v1.1.2.3' }), d)).status, 401);
  assert.deepEqual(f.z.aufrufe, [], 'ohne Sitzung kein Hetzner-Aufruf');
});

test('Web: Sperre nach 5 Fehlversuchen je Adresse (auch das richtige Passwort wird dann abgewiesen)', async () => {
  leereLimit(); const d = deps(falschesHetzner());
  for (let i = 0; i < 5; i++) assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { passwort: 'falsch' } }), d)).status, 401);
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { passwort: PW } }), d)).status, 429);
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { passwort: PW }, ip: '9.9.9.9' }), d)).status, 200, 'andere Adresse nicht betroffen');
});

test('Web: fremde Herkunft und fehlender Schutzkopf werden bei POST abgewiesen', async () => {
  leereLimit(); const d = deps(falschesHetzner());
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { passwort: PW }, origin: 'https://boese.example' }), d)).status, 403);
  const ohne = new Request('https://www.projectarmageddon.de/api/web/login', { method: 'POST', body: '{}', headers: { origin: ORIGIN } });
  assert.equal((await behandle(ohne, d)).status, 403);
});

test('Web: unvollständige Einrichtung meldet sich, ohne etwas zu tun', async () => {
  const r = await behandle(anfrage('status'), deps(falschesHetzner(), { env: { HCLOUD_TOKEN: TOKEN } }));
  assert.equal(r.status, 500);
  assert.match((await r.json()).fehler, /PA_WEB_PASSWORT_HASH/);
});

test('Web: Status aus -> Start erzeugt Server aus dem neuesten Abbild mit der reservierten IP -> bereit; zweiter Start 409', async () => {
  leereLimit(); const f = falschesHetzner(); const d = deps(f); const cookie = await anmelden(d);
  const aus = await (await behandle(anfrage('status', { cookie }), d)).json();
  assert.equal(aus.zustand, 'aus'); assert.equal(aus.abbild, true);

  const st = await behandle(anfrage('start', { methode: 'POST', body: {}, cookie }), d);
  assert.equal(st.status, 202);
  assert.equal(f.z.angelegt.image, 11); assert.equal(f.z.angelegt.server_type, 'cpx22'); assert.equal(f.z.angelegt.public_net.ipv4, 5);
  assert.equal(f.z.angelegt.labels['projectarmageddon-server'], 'ja');
  assert.match(f.z.angelegt.user_data, /--aus-abbild/);
  assert.match(f.z.angelegt.user_data, /49-13-138-200\.sslip\.io/);
  assert.match(f.z.angelegt.user_data, /PA_ERLAUBTE_ORIGINS=https:\/\/49-13-138-200\.sslip\.io,https:\/\/www\.projectarmageddon\.de/);

  f.z.healthz = false;
  assert.equal((await (await behandle(anfrage('status', { cookie }), d)).json()).zustand, 'startet');
  f.z.healthz = true;
  const bereit = await (await behandle(anfrage('status', { cookie }), d)).json();
  assert.deepEqual([bereit.zustand, bereit.spielUrl, bereit.version], ['bereit', 'https://49-13-138-200.sslip.io', '0.9.0']);
  assert.equal((await behandle(anfrage('start', { methode: 'POST', body: {}, cookie }), d)).status, 409);
});

test('Web: ohne Abbild frische Einrichtung (oder Ablehnung mit PA_WEB_FRISCH=nein)', async () => {
  leereLimit(); const f = falschesHetzner({ bilder: [] }); const d = deps(f); const cookie = await anmelden(d);
  assert.equal((await behandle(anfrage('start', { methode: 'POST', body: {}, cookie }), d)).status, 202);
  assert.equal(f.z.angelegt.image, 'ubuntu-24.04'); assert.match(f.z.angelegt.user_data, /--frisch/);
  const g = falschesHetzner({ bilder: [] }); const d2 = deps(g, { env: { ...ENV, PA_WEB_FRISCH: 'nein' } });
  assert.equal((await behandle(anfrage('start', { methode: 'POST', body: {}, cookie }), d2)).status, 409);
  assert.ok(!g.z.aufrufe.includes('POST /servers'));
});

test('Web: Token steht nur im user_data unter /run, nie in Antworten oder Fehlermeldungen', async () => {
  leereLimit(); const f = falschesHetzner(); const d = deps(f); const cookie = await anmelden(d);
  const ud = baueUserData(leseKonfig(ENV), 'x.example', 'INSTALLER', '--frisch');
  const cfg = JSON.parse(ud.replace('#cloud-config\n', ''));
  const mit = cfg.write_files.filter(w => w.content.includes(TOKEN));
  assert.deepEqual(mit.map(w => w.path), ['/run/projectarmageddon/hcloud-token']);
  const r = await behandle(anfrage('start', { methode: 'POST', body: {}, cookie }), d);
  assert.ok(!(await r.text()).includes(TOKEN));
  const kaputt = deps(f, { fetch: async () => { throw new Error(`Netz kaputt ${TOKEN}`); } });
  const e = await behandle(anfrage('status', { cookie }), kaputt);
  assert.equal(e.status, 502); assert.ok(!(await e.text()).includes(TOKEN));
});

test('Web: Not-aus sichert, prüft das Abbild, löscht Altes und den Server; ohne geprüftes Abbild bleibt der Server', async () => {
  const k = leseKonfig(ENV);
  const f = falschesHetzner({ server: { id: 77, status: 'running', labels: { 'projectarmageddon-server': 'ja' }, public_net: { ipv4: { ip: '49.13.138.200' } } } });
  const erg = await notAus(k, deps(f));
  assert.equal(erg[0].geloescht, true);
  assert.equal(f.z.server, null); assert.deepEqual(f.z.bilder.map(b => b.id), [99], 'nur das neue Abbild bleibt');
  assert.ok(f.z.aufrufe.indexOf('POST /servers/77/actions/create_image') < f.z.aufrufe.indexOf('DELETE /servers/77'));

  const g = falschesHetzner({ bildFehler: true, server: { id: 77, status: 'running', labels: {}, public_net: { ipv4: { ip: '49.13.138.200' } } } });
  const e2 = await notAus(k, deps(g), () => {});
  assert.equal(e2[0].geloescht, false);
  assert.ok(!g.z.aufrufe.includes('DELETE /servers/77'), 'Fail-Safe: nie ohne geprüftes Abbild löschen');
  assert.deepEqual(g.z.bilder.map(b => b.id), [11, 99], 'alte Abbilder bleiben');
});

test('Web: Not-aus über die API startet den Hintergrundauftrag nur mit Sitzung; der Auftrag prüft selbst', async () => {
  leereLimit(); const f = falschesHetzner(); let gestartet = 0;
  const d = deps(f, { notAusStarten: async () => { gestartet++; } }); const cookie = await anmelden(d);
  assert.equal((await behandle(anfrage('not-aus', { methode: 'POST', body: {} }), d)).status, 401);
  assert.equal((await behandle(anfrage('not-aus', { methode: 'POST', body: {}, cookie }), d)).status, 202);
  assert.equal(gestartet, 1);
  const hinten = (c, o = ORIGIN) => new Request('https://www.projectarmageddon.de/.netlify/functions/not-aus-background', { method: 'POST', headers: { cookie: c, origin: o, 'x-pa-web': '1' } });
  assert.equal((await notAusAuftrag(hinten(''), deps(f))).status, 403);
  assert.equal((await notAusAuftrag(hinten(cookie, 'https://boese.example'), deps(f))).status, 403);
  assert.equal((await notAusAuftrag(hinten(cookie), deps(f))).status, 200);
});

test('Web: netlify.toml, Funktionen und Client-Build sind verdrahtet, ohne Geheimnisse', () => {
  const toml = readFileSync(join(WURZEL, 'netlify.toml'), 'utf8');
  assert.match(toml, /publish = "dist"/); assert.match(toml, /PA_WEB_BUILD=1/); assert.match(toml, /server-erstinstallation\.sh/);
  assert.doesNotMatch(toml, /HCLOUD_TOKEN\s*=|pbkdf2\$/);
  assert.match(readFileSync(join(WURZEL, 'netlify/functions/web.mjs'), 'utf8'), /path: '\/api\/web\/\*'/);
  assert.match(readFileSync(join(WURZEL, 'netlify/functions/not-aus-background.mjs'), 'utf8'), /notAusAuftrag/);
  assert.match(readFileSync(join(WURZEL, 'vite.config.mjs'), 'utf8'), /PA_WEB_BUILD/);
  assert.equal(readFileSync(join(WURZEL, 'scripts/betrieb/server-erstinstallation.sh'), 'utf8').startsWith('#!'), true);
});
