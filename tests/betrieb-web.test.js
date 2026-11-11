/**
 * Web-Zugang (Option D, scripts/betrieb/web/gateway-kern.mjs, netlify/functions): Login, Sitzung,
 * Sperre, Herkunft, Start/Status/Not-aus gegen ein FALSCHES Hetzner (ersetztes fetch). Es wird nichts
 * bei Hetzner oder im Netz angefragt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import {
  auftragsKopf, behandle, baueUserData, leseKonfig, notAus, notAusAuftrag,
} from '../scripts/betrieb/web/gateway-kern.mjs';
import { hasheNutzerPasswort, pruefeGeheimnis } from '../scripts/betrieb/web/hash.mjs';
import { SpeicherImSpeicher } from '../scripts/betrieb/web/speicher.mjs';
import { liesSitzung, neueSitzung } from '../scripts/betrieb/web/nutzer.mjs';
import { baueExternPruefer, pruefeSpieltoken, signiereMeldung } from '../src/server/webAnbindung.js';

const TOKEN = 'TESTTOKEN-web-nicht-echt-135792468';
const ORIGIN = 'https://www.projectarmageddon.de';
const REG = 'Test-Anmeldepasswort-1';
const START = 'Test-Startcode-1';
const GEH = 'g'.repeat(40);
const SPIEL = 's'.repeat(40);
// Schwache Kosten nur für die Tests (Format wie in der Produktion, scrypt N=1024).
const schwach = async pw => {
  const salz = Buffer.alloc(16, 3);
  const k = await promisify(scrypt)(pw, salz, 64, { N: 1024, r: 8, p: 1 });
  return `scrypt$1024$8$1$${salz.toString('hex')}$${k.toString('hex')}`;
};
const ENV = {
  HCLOUD_TOKEN: TOKEN, PA_WEB_GEHEIMNIS: GEH, PA_SPIEL_GEHEIMNIS: SPIEL,
  PA_REGISTRIER_HASH: await schwach(REG), PA_START_HASH: await schwach(START),
};

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
const deps = (f, extra = {}) => ({ env: ENV, fetch: f.fn, sleep: async () => {}, jetzt: () => 1_800_000_000_000, installer: () => '#!/bin/bash\necho installer\n', speicher: new SpeicherImSpeicher(), ...extra });
const anfrage = (pfad, { methode = 'GET', body, cookie, origin = ORIGIN, ip = '1.2.3.4' } = {}) => new Request(`https://www.projectarmageddon.de/api/web/${pfad}`, {
  method: methode, body: body ? JSON.stringify(body) : undefined,
  headers: { ...(methode !== 'GET' ? { 'x-pa-web': '1', origin } : {}), ...(cookie ? { cookie } : {}), 'x-nf-client-connection-ip': ip },
});
const NUTZER = { email: 'test@example.org', name: 'Tester', passwort: 'geheim-1234', anmeldepasswort: REG };
/** Registriert (oder meldet an) und gibt das Cookie zurück. Dieselben deps = derselbe Speicher. */
async function anmelden(d, nutzer = NUTZER) {
  let r = await behandle(anfrage('registrieren', { methode: 'POST', body: nutzer }), d);
  if (r.status === 409) r = await behandle(anfrage('login', { methode: 'POST', body: { kennung: nutzer.name, passwort: nutzer.passwort } }), d);
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const mitCode = (cookie, code = START) => ({ methode: 'POST', body: { startcode: code }, cookie });

test('Web: Hashes (scrypt und PBKDF2 aus der Browserseite) werden erkannt; falsches Passwort und Müll nicht', async () => {
  assert.equal(await pruefeGeheimnis(REG, ENV.PA_REGISTRIER_HASH), true);
  assert.equal(await pruefeGeheimnis(REG + 'x', ENV.PA_REGISTRIER_HASH), false);
  assert.equal(await pruefeGeheimnis(REG, 'kaputt'), false);
  assert.equal(await pruefeGeheimnis(REG, ''), false);
  const { hashePasswort } = await import('../scripts/betrieb/web/gateway-kern.mjs');
  const pb = await hashePasswort(REG, Buffer.alloc(16, 7), 2000);
  assert.equal(await pruefeGeheimnis(REG, pb), true);
  assert.equal(await pruefeGeheimnis('x', pb), false);
  assert.match(await hasheNutzerPasswort('abcdefgh'), /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
});

test('Web: Sitzungscookie ist signiert, läuft ab, ist an die Sitzungsversion gebunden und lässt sich nicht fälschen', () => {
  const t = 1_800_000_000_000;
  const s = neueSitzung(GEH, 'abcd-1234-nutzer', 3, t);
  assert.deepEqual(liesSitzung(s, GEH, t + 1000), { nutzerId: 'abcd-1234-nutzer', sv: 3 });
  assert.equal(liesSitzung(s, GEH, t + 8 * 24 * 3600_000), null, 'abgelaufen');
  assert.equal(liesSitzung(s, 'h'.repeat(40), t), null, 'falscher Schlüssel');
  assert.equal(liesSitzung(s.replace('abcd-1234', 'zzzz-1234'), GEH, t), null, 'verändert');
  assert.equal(liesSitzung('', GEH, t), null);
});

test('Web: Registrieren setzt ein HttpOnly/Secure/SameSite-Cookie; ohne Sitzung ist alles gesperrt', async () => {
  const f = falschesHetzner(); const d = deps(f);
  const r = await behandle(anfrage('registrieren', { methode: 'POST', body: NUTZER }), d);
  assert.equal(r.status, 200);
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Strict/);
  const koerper = await r.json();
  assert.equal(koerper.nutzer.name, 'Tester'); assert.ok(!JSON.stringify(koerper).includes('passwortHash'));
  for (const [pfad, m] of [['status', 'GET'], ['ich', 'GET'], ['start', 'POST'], ['spieltoken', 'POST'], ['passwort-aendern', 'POST'], ['not-aus', 'POST']]) {
    assert.equal((await behandle(anfrage(pfad, { methode: m, body: m === 'POST' ? {} : undefined }), d)).status, 401, pfad);
  }
  assert.equal((await behandle(anfrage('status', { cookie: 'pa_web=v2.1.2.3.4' }), d)).status, 401);
  assert.deepEqual(f.z.aufrufe, [], 'ohne Sitzung kein Hetzner-Aufruf');
});

test('Web: fremde Herkunft und fehlender Schutzkopf werden bei POST abgewiesen', async () => {
  const d = deps(falschesHetzner());
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: {}, origin: 'https://boese.example' }), d)).status, 403);
  const ohne = new Request('https://www.projectarmageddon.de/api/web/login', { method: 'POST', body: '{}', headers: { origin: ORIGIN } });
  assert.equal((await behandle(ohne, d)).status, 403);
});

test('Web: unvollständige Einrichtung meldet sich, ohne etwas zu tun', async () => {
  const r = await behandle(anfrage('status'), deps(falschesHetzner(), { env: { HCLOUD_TOKEN: TOKEN } }));
  assert.equal(r.status, 500);
  assert.match((await r.json()).fehler, /PA_WEB_GEHEIMNIS/);
  const ohneSpiel = await behandle(anfrage('status'), deps(falschesHetzner(), { env: { ...ENV, PA_SPIEL_GEHEIMNIS: '' } }));
  assert.match((await ohneSpiel.json()).fehler, /PA_SPIEL_GEHEIMNIS/);
});

test('Web: Registrierung nur mit Anmeldepasswort; falsches zählt als Fehlversuch und sperrt je Adresse', async () => {
  const d = deps(falschesHetzner());
  const ohne = await behandle(anfrage('registrieren', { methode: 'POST', body: { ...NUTZER, anmeldepasswort: '' } }), d);
  assert.equal(ohne.status, 403); assert.equal((await ohne.json()).code, 'anmeldepasswort_falsch');
  for (let i = 0; i < 4; i++) assert.equal((await behandle(anfrage('registrieren', { methode: 'POST', body: { ...NUTZER, anmeldepasswort: 'falsch' } }), d)).status, 403);
  assert.equal((await behandle(anfrage('registrieren', { methode: 'POST', body: NUTZER }), d)).status, 429, 'auch das richtige wird danach abgewiesen');
  assert.equal((await behandle(anfrage('registrieren', { methode: 'POST', body: NUTZER, ip: '9.9.9.9' }), d)).status, 200, 'andere Adresse nicht betroffen');
  assert.equal((await behandle(anfrage('registrieren', { methode: 'POST', body: { ...NUTZER, name: 'Zwei', email: 'zwei@example.org', anmeldepasswort: undefined }, ip: '8.8.8.8' }), d)).status, 403);
});

test('Web: Registrierung prüft Name, E-Mail, Passwort; doppelter Name (auch Groß/Klein, Unicode) und doppelte E-Mail werden abgewiesen', async () => {
  const d = deps(falschesHetzner());
  const post = b => behandle(anfrage('registrieren', { methode: 'POST', body: { ...NUTZER, ...b } }), d);
  assert.equal((await post({ email: 'kaputt' })).status, 400);
  assert.equal((await post({ name: 'a' })).status, 400);
  assert.equal((await post({ passwort: 'kurz' })).status, 400);
  assert.equal((await post({ name: 'Bad<Name>' })).status, 400);
  assert.equal((await post({ name: 'Jürgen', email: 'j@example.org' })).status, 200);
  const nameDoppelt = await post({ name: 'jüRGEN', email: 'anders@example.org' });
  assert.equal(nameDoppelt.status, 409); assert.equal((await nameDoppelt.json()).code, 'name_vergeben');
  const nfd = await post({ name: 'Ju\u0308rgen', email: 'nfd@example.org' }); // u + kombinierendes Trema
  assert.equal(nfd.status, 409, 'Unicode-normalisiert');
  const mailDoppelt = await post({ name: 'Anderer', email: 'J@EXAMPLE.org' });
  assert.equal(mailDoppelt.status, 409); assert.equal((await mailDoppelt.json()).code, 'email_vergeben');
  assert.equal((await post({ name: 'Anderer', email: 'neu@example.org' })).status, 200, 'der Name blieb nach dem E-Mail-Konflikt frei');
});

test('Web: Login mit Benutzername ODER E-Mail; falsches Passwort 401; Sperre nach 5 Fehlversuchen je Name', async () => {
  const d = deps(falschesHetzner()); await anmelden(d);
  const login = (kennung, passwort, ip = '1.2.3.4') => behandle(anfrage('login', { methode: 'POST', body: { kennung, passwort }, ip }), d);
  assert.equal((await login('tester', NUTZER.passwort)).status, 200);
  assert.equal((await login('TEST@example.org', NUTZER.passwort)).status, 200);
  assert.equal((await login('Tester', 'falsch')).status, 401);
  assert.equal((await login('unbekannt', 'falsch')).status, 401, 'gleiche Antwort für unbekannte Namen');
  for (let i = 0; i < 4; i++) assert.equal((await login('Tester', 'falsch', `7.7.7.${i}`)).status, 401);
  assert.equal((await login('Tester', NUTZER.passwort, '6.6.6.6')).status, 429, 'Name gesperrt, auch von anderer Adresse und mit richtigem Passwort');
  assert.equal((await login('Zweiter', NUTZER.passwort, '6.6.6.6')).status, 401, 'andere Namen nicht gesperrt');
});

test('Web: Die Sperre liegt in der Nutzerdatenbank (überlebt eine neue Funktionsinstanz) und läuft nach 15 Minuten ab', async () => {
  const speicher = new SpeicherImSpeicher(); let jetzt = 1_800_000_000_000;
  const d = () => deps(falschesHetzner(), { speicher, jetzt: () => jetzt });
  await anmelden(d());
  for (let i = 0; i < 5; i++) await behandle(anfrage('login', { methode: 'POST', body: { kennung: 'Tester', passwort: 'x' }, ip: `5.5.5.${i}` }), d());
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { kennung: 'Tester', passwort: NUTZER.passwort } }), d())).status, 429);
  jetzt += 16 * 60_000;
  assert.equal((await behandle(anfrage('login', { methode: 'POST', body: { kennung: 'Tester', passwort: NUTZER.passwort } }), d())).status, 200);
});

test('Web: Passwort ändern braucht das alte, macht alte Cookies ungültig und gilt danach beim Login', async () => {
  const d = deps(falschesHetzner()); const alt = await anmelden(d);
  const aendern = (b, cookie) => behandle(anfrage('passwort-aendern', { methode: 'POST', body: b, cookie }), d);
  assert.equal((await aendern({ altes: 'falsch', neues: 'neues-passwort-1' }, alt)).status, 403);
  assert.equal((await aendern({ altes: NUTZER.passwort, neues: 'kurz' }, alt)).status, 400);
  assert.equal((await aendern({ altes: NUTZER.passwort, neues: NUTZER.passwort }, alt)).status, 400);
  const ok = await aendern({ altes: NUTZER.passwort, neues: 'neues-passwort-1' }, alt);
  assert.equal(ok.status, 200);
  const neu = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await behandle(anfrage('ich', { cookie: alt }), d)).status, 401, 'altes Cookie ungültig');
  assert.equal((await behandle(anfrage('ich', { cookie: neu }), d)).status, 200);
  const login = p => behandle(anfrage('login', { methode: 'POST', body: { kennung: 'Tester', passwort: p } }), d);
  assert.equal((await login(NUTZER.passwort)).status, 401);
  assert.equal((await login('neues-passwort-1')).status, 200);
});

test('Web: Klartext-Passwörter liegen nie in der Datenbank; Hashes sind scrypt', async () => {
  const speicher = new SpeicherImSpeicher(); const d = deps(falschesHetzner(), { speicher }); await anmelden(d);
  const roh = speicher.alsText();
  assert.ok(!roh.includes(NUTZER.passwort)); assert.ok(!roh.includes(REG)); assert.match(roh, /scrypt\$16384/);
  assert.ok(!roh.includes(NUTZER.name.toLowerCase() + '"') || roh.includes('nameKlein'), 'Schlüssel sind Hashes');
});

test('Web: Saat legt feste Konten idempotent an (nur Hashes), ohne ein später geändertes Passwort zu überschreiben', async () => {
  const saat = JSON.stringify([
    { name: 'Wodan', email: 'w@example.org', hash: await schwach('wodan-passwort') },
    { name: 'Frigg', email: 'f@example.org', hash: await schwach('frigg-passwort') },
    { name: 'x', email: 'kaputt', hash: 'klartext' },
  ]);
  const speicher = new SpeicherImSpeicher(); const env = { ...ENV, PA_KONTEN_SAAT: saat };
  const d = () => deps(falschesHetzner(), { speicher, env });
  const login = (n, p) => behandle(anfrage('login', { methode: 'POST', body: { kennung: n, passwort: p } }), d());
  const w = await login('wodan', 'wodan-passwort'); assert.equal(w.status, 200);
  assert.equal((await login('f@example.org', 'frigg-passwort')).status, 200, 'auch per E-Mail');
  assert.equal((await login('Wodan', 'falsch')).status, 401);
  const nachher = speicher.alsText();
  // Zweiter Aufruf mit frischer Instanz-Markierung: nichts doppelt, nichts überschrieben.
  const cookie = w.headers.get('set-cookie').split(';')[0];
  await behandle(anfrage('passwort-aendern', { methode: 'POST', body: { altes: 'wodan-passwort', neues: 'ganz-neues-pw-9' }, cookie }), d());
  const { NutzerDienst } = await import('../scripts/betrieb/web/nutzer.mjs');
  const erg = await new NutzerDienst({ speicher }).saat(saat);
  assert.deepEqual(erg, { angelegt: 0, vorhanden: 2, fehlerhaft: 1 });
  assert.equal((await login('Wodan', 'ganz-neues-pw-9')).status, 200, 'geändertes Passwort bleibt');
  assert.ok(!nachher.includes('wodan-passwort') && !nachher.includes('klartext'));
  assert.deepEqual(await new NutzerDienst({ speicher }).saat('kein json'), { angelegt: 0, vorhanden: 0, fehlerhaft: 1 });
});

test('Web: Spieltoken wird ausgestellt, vom Spielserver-Prüfer akzeptiert und läuft ab; fremde Signatur und Veränderung scheitern', async () => {
  const d = deps(falschesHetzner()); const cookie = await anmelden(d);
  const r = await behandle(anfrage('spieltoken', { methode: 'POST', body: {}, cookie }), d);
  assert.equal(r.status, 200);
  const { token, laeuftAb } = await r.json();
  const jetzt = 1_800_000_000_000;
  const wer = pruefeSpieltoken(token, SPIEL, jetzt + 1000);
  assert.equal(wer.name, 'Tester'); assert.match(wer.id, /^[0-9a-f-]{36}$/);
  assert.equal(laeuftAb, jetzt + 2 * 3600_000);
  assert.equal(pruefeSpieltoken(token, SPIEL, jetzt + 3 * 3600_000), null, 'abgelaufen');
  assert.equal(pruefeSpieltoken(token, 'x'.repeat(40), jetzt), null, 'falsches Geheimnis');
  const teile = token.split('.'); teile[1] = Buffer.from(JSON.stringify({ u: 'anderer-nutzer-1', n: 'Boss', e: 9999999999 })).toString('base64url');
  assert.equal(pruefeSpieltoken(teile.join('.'), SPIEL, jetzt), null, 'Nutzlast verändert');
  assert.equal(pruefeSpieltoken(`${token}x`, SPIEL, jetzt), null);
  assert.equal(pruefeSpieltoken('', SPIEL, jetzt), null);
  assert.equal(baueExternPruefer('kurz'), null);
  assert.equal(signiereMeldung(SPIEL, 1, 'x') === signiereMeldung(SPIEL, 1, 'y'), false);
});

test('Web: Statistik-Meldung nur signiert; Zeitfenster; je Partie und Spieler genau einmal; nur bekannte Felder, gedeckelt', async () => {
  const speicher = new SpeicherImSpeicher(); const d = deps(falschesHetzner(), { speicher }); const cookie = await anmelden(d);
  const id = (await (await behandle(anfrage('ich', { cookie }), d)).json()).nutzer.id;
  const jetzt = 1_800_000_000_000;
  const meldung = (extra = {}) => ({ v: 1, meldungsId: 'lobby1-100', beendetAm: jetzt, modus: '2x1', spieler: [{
    nutzerId: id, ergebnis: 'sieg', werte: { schuesse: 10, treffer: 6, fehlschuesse: 4, schaden: 300, kills: 2, spruenge: 5, boese: 99, tode: -5 },
    einheiten: { sniper: { schaden: 250, kills: 2, einsaetze: 1 }, 'ungültig!': { schaden: 5 } }, waffen: { bazooka: { schuesse: 3, treffer: 2, schaden: 200 } }, ...extra }] });
  const senden = (m, { zeit = jetzt, sig } = {}) => {
    const body = JSON.stringify(m);
    return behandle(new Request('https://www.projectarmageddon.de/api/web/statistik', { method: 'POST', body, headers: { 'x-pa-zeit': String(zeit), 'x-pa-signatur': sig ?? signiereMeldung(SPIEL, zeit, body) } }), d);
  };
  assert.equal((await senden(meldung(), { sig: 'ab'.repeat(32) })).status, 401, 'unsigniert');
  assert.equal((await senden(meldung(), { sig: '' })).status, 401);
  const body = JSON.stringify(meldung());
  assert.equal((await behandle(new Request('https://www.projectarmageddon.de/api/web/statistik', { method: 'POST', body }), d)).status, 401, 'ganz ohne Kopfzeilen');
  assert.equal((await senden(meldung(), { zeit: jetzt - 10 * 60_000 })).status, 401, 'zu alt');
  const falscheSig = signiereMeldung('y'.repeat(40), jetzt, body);
  assert.equal((await senden(meldung(), { sig: falscheSig })).status, 401, 'falsches Geheimnis');
  assert.equal((await senden(meldung())).status, 200);
  const doppelt = await (await senden(meldung())).json();
  assert.equal(doppelt.ergebnisse[0].status, 'doppelt');
  const n = (await (await behandle(anfrage('ich', { cookie }), d)).json()).nutzer.stat;
  assert.deepEqual([n.partien, n.siege, n.niederlagen, n.schuesse, n.treffer, n.fehlschuesse, n.schaden, n.kills, n.spruenge, n.tode], [1, 1, 0, 10, 6, 4, 300, 2, 5, 0]);
  assert.deepEqual(Object.keys(n.einheiten), ['sniper']); assert.equal(n.waffen.bazooka.schaden, 200);
  assert.equal(n.boese, undefined);
  const zwei = await senden({ ...meldung(), meldungsId: 'lobby2-200' });
  assert.equal((await zwei.json()).ergebnisse[0].status, 'verbucht');
  assert.equal((await (await behandle(anfrage('ich', { cookie }), d)).json()).nutzer.stat.partien, 2);
  assert.equal((await senden({ v: 2 })).status, 400);
  const { meisterSchadenEinheit } = await import('../scripts/betrieb/web/nutzer.mjs');
  assert.equal(meisterSchadenEinheit({ einheiten: { a: { schaden: 5 }, b: { schaden: 50 } } }), 'b');
  assert.equal(meisterSchadenEinheit({}), null);
});

test('Web: Start nur mit richtigem Startcode; aus -> Start (Abbild, IP, Spiel-Geheimnis) -> bereit; zweiter Start 409', async () => {
  const f = falschesHetzner(); const d = deps(f); const cookie = await anmelden(d);
  const aus = await (await behandle(anfrage('status', { cookie }), d)).json();
  assert.equal(aus.zustand, 'aus'); assert.equal(aus.abbild, true);

  for (const code of [undefined, '', 'falsch', REG]) {
    const r = await behandle(anfrage('start', { methode: 'POST', body: code === undefined ? {} : { startcode: code }, cookie }), d);
    assert.equal(r.status, 403, `Code ${code}`);
  }
  assert.ok(!f.z.aufrufe.includes('POST /servers'), 'falscher Code startet nichts');

  const st = await behandle(anfrage('start', mitCode(cookie)), d);
  assert.equal(st.status, 202);
  assert.equal(f.z.angelegt.image, 11); assert.equal(f.z.angelegt.server_type, 'cpx22'); assert.equal(f.z.angelegt.public_net.ipv4, 5);
  assert.equal(f.z.angelegt.labels['projectarmageddon-server'], 'ja');
  assert.match(f.z.angelegt.user_data, /--aus-abbild/);
  assert.match(f.z.angelegt.user_data, /49-13-138-200\.sslip\.io/);
  assert.match(f.z.angelegt.user_data, /PA_ERLAUBTE_ORIGINS=https:\/\/49-13-138-200\.sslip\.io,https:\/\/www\.projectarmageddon\.de/);
  assert.match(f.z.angelegt.user_data, /PA_STATISTIK_URL=https:\/\/www\.projectarmageddon\.de\/api\/web\/statistik/);

  f.z.healthz = false;
  assert.equal((await (await behandle(anfrage('status', { cookie }), d)).json()).zustand, 'startet');
  f.z.healthz = true;
  const bereit = await (await behandle(anfrage('status', { cookie }), d)).json();
  assert.deepEqual([bereit.zustand, bereit.spielUrl, bereit.version], ['bereit', 'https://49-13-138-200.sslip.io', '0.9.0']);
  assert.equal((await behandle(anfrage('start', mitCode(cookie)), d)).status, 409);
});

test('Web: Startcode-Fehlversuche sperren (je Nutzer), auch der richtige Code wird dann abgewiesen', async () => {
  const f = falschesHetzner(); const d = deps(f); const cookie = await anmelden(d);
  for (let i = 0; i < 5; i++) assert.equal((await behandle(anfrage('start', mitCode(cookie, 'falsch')), d)).status, 403);
  assert.equal((await behandle(anfrage('start', mitCode(cookie)), d)).status, 429);
  assert.ok(!f.z.aufrufe.includes('POST /servers'));
});

test('Web: Läuft der Server schon, braucht der angemeldete Spieler keinen Startcode (Status und Spieltoken)', async () => {
  const f = falschesHetzner({ server: { id: 77, status: 'running', labels: {}, public_net: { ipv4: { ip: '49.13.138.200' } } } });
  const d = deps(f); const cookie = await anmelden(d);
  assert.equal((await (await behandle(anfrage('status', { cookie }), d)).json()).zustand, 'bereit');
  assert.equal((await behandle(anfrage('spieltoken', { methode: 'POST', body: {}, cookie }), d)).status, 200);
});

test('Web: ohne Abbild frische Einrichtung (oder Ablehnung mit PA_WEB_FRISCH=nein)', async () => {
  const f = falschesHetzner({ bilder: [] }); const d = deps(f); const cookie = await anmelden(d);
  assert.equal((await behandle(anfrage('start', mitCode(cookie)), d)).status, 202);
  assert.equal(f.z.angelegt.image, 'ubuntu-24.04'); assert.match(f.z.angelegt.user_data, /--frisch/);
  const g = falschesHetzner({ bilder: [] }); const d2 = deps(g, { env: { ...ENV, PA_WEB_FRISCH: 'nein' } });
  const cookie2 = await anmelden(d2);
  assert.equal((await behandle(anfrage('start', mitCode(cookie2)), d2)).status, 409);
  assert.ok(!g.z.aufrufe.includes('POST /servers'));
});

test('Web: Token und Spiel-Geheimnis stehen nur im user_data unter /run, nie in Antworten oder Fehlermeldungen', async () => {
  const f = falschesHetzner(); const d = deps(f); const cookie = await anmelden(d);
  const ud = baueUserData(leseKonfig(ENV), 'x.example', 'INSTALLER', '--frisch');
  const cfg = JSON.parse(ud.replace('#cloud-config\n', ''));
  assert.deepEqual(cfg.write_files.filter(w => w.content.includes(TOKEN)).map(w => w.path), ['/run/projectarmageddon/hcloud-token']);
  assert.deepEqual(cfg.write_files.filter(w => w.content.includes(SPIEL)).map(w => w.path), ['/run/projectarmageddon/spiel-geheimnis']);
  assert.ok(!ud.includes(GEH), 'das Cookie-Geheimnis geht nie auf den Spielserver');
  const betrieb = cfg.write_files.find(w => w.path === '/etc/projectarmageddon/betrieb.env').content;
  assert.match(betrieb, /PA_SPIEL_GEHEIMNIS_DATEI=\/run\/projectarmageddon\/spiel-geheimnis/);
  const r = await behandle(anfrage('start', mitCode(cookie)), d);
  assert.ok(!(await r.text()).includes(TOKEN));
  const kaputt = deps(f, { speicher: d.speicher, fetch: async () => { throw new Error(`Netz kaputt ${TOKEN} ${SPIEL}`); } });
  const e = await behandle(anfrage('status', { cookie }), kaputt);
  const text = await e.text();
  assert.equal(e.status, 502); assert.ok(!text.includes(TOKEN) && !text.includes(SPIEL));
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

test('Web: Not-aus nur mit Sitzung UND Startcode; der Hintergrundauftrag prüft den signierten, kurzlebigen Auftrag', async () => {
  const f = falschesHetzner(); const auftraege = [];
  const d = deps(f, { notAusStarten: async (_r, a) => { auftraege.push(a); } }); const cookie = await anmelden(d);
  assert.equal((await behandle(anfrage('not-aus', { methode: 'POST', body: { startcode: START } }), d)).status, 401, 'ohne Sitzung');
  assert.equal((await behandle(anfrage('not-aus', mitCode(cookie, 'falsch')), d)).status, 403, 'ohne richtigen Startcode');
  assert.equal(auftraege.length, 0);
  assert.equal((await behandle(anfrage('not-aus', mitCode(cookie)), d)).status, 202);
  assert.equal(auftraege.length, 1);
  const k = leseKonfig(ENV); const t = 1_800_000_000_000;
  const hinten = (a, o = {}) => new Request('https://www.projectarmageddon.de/.netlify/functions/not-aus-background', { method: 'POST', headers: a ? { 'x-pa-auftrag': a } : {}, ...o });
  assert.equal((await notAusAuftrag(hinten(null), deps(f))).status, 403);
  assert.equal((await notAusAuftrag(hinten(`${Math.floor(t / 1000) + 60}.gefaelscht`), deps(f))).status, 403);
  assert.equal((await notAusAuftrag(hinten(auftragsKopf(k, t - 120_000)), deps(f))).status, 403, 'abgelaufen');
  assert.equal((await notAusAuftrag(hinten(auftraege[0]), deps(f))).status, 200);
});

test('Web: netlify.toml, Funktionen und Client-Build sind verdrahtet, ohne Geheimnisse; die alte Einzelpasswort-Anmeldung ist weg', () => {
  const toml = readFileSync(join(WURZEL, 'netlify.toml'), 'utf8');
  assert.match(toml, /publish = "dist"/); assert.match(toml, /PA_WEB_BUILD=1/); assert.match(toml, /server-erstinstallation\.sh/);
  assert.doesNotMatch(toml, /HCLOUD_TOKEN\s*=|pbkdf2\$|scrypt\$/);
  assert.match(readFileSync(join(WURZEL, 'netlify/functions/web.mjs'), 'utf8'), /path: '\/api\/web\/\*'/);
  assert.match(readFileSync(join(WURZEL, 'netlify/functions/not-aus-background.mjs'), 'utf8'), /notAusAuftrag/);
  assert.match(readFileSync(join(WURZEL, 'vite.config.mjs'), 'utf8'), /PA_WEB_BUILD/);
  assert.equal(readFileSync(join(WURZEL, 'scripts/betrieb/server-erstinstallation.sh'), 'utf8').startsWith('#!'), true);
  for (const datei of ['scripts/betrieb/web/gateway-kern.mjs', 'src/client/webStart.js', 'docs/zugang-www.md', 'public/passwort-hash.html', 'netlify/functions/web.mjs']) {
    assert.doesNotMatch(readFileSync(join(WURZEL, datei), 'utf8'), /PA_WEB_PASSWORT_HASH/, `${datei}: Rest der Einzelpasswort-Anmeldung`);
  }
});

test('Web: In Client, Funktionen, Doku und Konfiguration steht kein fertiger Passwort-Hash (Hashes gehören nur in die Hoster-Umgebung)', () => {
  for (const datei of ['src/client/webStart.js', 'src/client/webApi.js', 'src/client/webAnmeldung.js', 'scripts/betrieb/web/gateway-kern.mjs', 'scripts/betrieb/web/nutzer.mjs', 'docs/zugang-www.md', 'netlify.toml', 'vite.config.mjs']) {
    assert.doesNotMatch(readFileSync(join(WURZEL, datei), 'utf8'), /(scrypt|pbkdf2)\$\d+(\$\d+\$\d+)?\$[0-9a-f]{16,}\$[0-9a-f]{32,}/, `${datei} enthält einen Hash`);
  }
});
