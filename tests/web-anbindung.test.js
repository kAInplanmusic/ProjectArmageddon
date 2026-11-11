/**
 * Web-Anbindung (docs/zugang-www.md): Spieltoken im Spielserver (KontoDienst), Statistik-Meldung des Servers,
 * Client-Netzzugang (webApi.js) und das Titellied im Menü. Ohne Netz, ohne Browser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KontoDienst } from '../src/server/konto.js';
import { oeffneSpeicher } from '../src/server/kontoSpeicher.js';
import {
  baueExternPruefer, baueMeldung, leseSpielGeheimnis, pruefeMeldung, sendeMeldung, signiereMeldung, stelleSpieltokenAus,
} from '../src/server/webAnbindung.js';
import { fehlerText, pruefeRegistrierung, ruf, statusText, versionenPassen } from '../src/client/webApi.js';
import { pruefeManifest, stueckeFuer } from '../src/client/musikListe.js';
import { WURZEL } from '../scripts/release/bauinfo.mjs';

const GEH = 'x'.repeat(40);
const T = 1_800_000_000_000;

function dienst(extra = {}) {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-web-'));
  const speicher = oeffneSpeicher({ pfad: join(ordner, 'konten.json'), art: 'json' });
  const d = new KontoDienst({ speicher, jetzt: () => T, externPruefer: baueExternPruefer(GEH), ...extra });
  return { d, speicher, weg: () => { speicher.schliessen?.(); rmSync(ordner, { recursive: true, force: true }); } };
}

test('Spielserver: Spieltoken der Webseite wird einem lokalen Konto zugeordnet (einmal angelegt, danach dasselbe)', () => {
  const { d, speicher, weg } = dienst();
  try {
    const { token } = stelleSpieltokenAus(GEH, { nutzerId: 'aaaa1111-bbbb', name: 'Wodan' }, T);
    const k = d.kontoFuerToken(token);
    assert.equal(k.id, 'w-aaaa1111-bbbb'); assert.equal(k.name, 'Wodan');
    assert.equal(d.kontoFuerToken(token).id, k.id);
    assert.equal(speicher.kontenAlle().length, 1);
    assert.equal(k.passwortHash, 'extern');
    assert.equal(d.kontoFuerToken(`${token}x`), null);
    assert.equal(d.kontoFuerToken(stelleSpieltokenAus('y'.repeat(40), { nutzerId: 'aaaa1111-bbbb', name: 'Wodan' }, T).token), null, 'fremdes Geheimnis');
    assert.equal(d.kontoFuerToken(stelleSpieltokenAus(GEH, { nutzerId: 'aaaa1111-bbbb', name: 'Wodan' }, T - 3 * 3600_000).token), null, 'abgelaufen');
  } finally { weg(); }
});

test('Spielserver: Das gespiegelte Konto hat kein Passwort (keine Anmeldung per Passwort); Namenskonflikt mit lokalem Konto wird aufgelöst', async () => {
  const { d, weg } = dienst();
  try {
    const lokal = await d.registrieren({ name: 'Frigg', passwort: 'lokales-pw-1', ip: '1.1.1.1' });
    assert.equal(lokal.ok, true);
    const { token } = stelleSpieltokenAus(GEH, { nutzerId: 'cccc2222-dddd', name: 'Frigg' }, T);
    const k = d.kontoFuerToken(token);
    assert.match(k.name, /^Frigg~cccc$/); assert.equal(k.id, 'w-cccc2222-dddd');
    const versuch = await d.anmelden({ name: k.name, passwort: 'extern', ip: '2.2.2.2' });
    assert.equal(versuch.ok, false);
  } finally { weg(); }
});

test('Spielserver: Ohne Geheimnis werden Spieltoken nicht angenommen (Gast), normale Token laufen weiter', async () => {
  const { d, weg } = dienst({ externPruefer: null });
  try {
    const { token } = stelleSpieltokenAus(GEH, { nutzerId: 'aaaa1111-bbbb', name: 'Wodan' }, T);
    assert.equal(d.kontoFuerToken(token), null);
    const r = await d.registrieren({ name: 'Lokal', passwort: 'lokales-pw-1', ip: '1.1.1.1' });
    assert.equal(d.kontoFuerToken(r.token).name, 'Lokal');
  } finally { weg(); }
});

test('Spielserver: Geheimnis aus Datei (tmpfs) oder Umgebung; fehlt beides, ist es leer', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-geh-'));
  try {
    const datei = join(ordner, 'g'); writeFileSync(datei, `${GEH}\n`);
    assert.equal(leseSpielGeheimnis({ PA_SPIEL_GEHEIMNIS_DATEI: datei }), GEH);
  } finally { rmSync(ordner, { recursive: true, force: true }); }
  assert.equal(leseSpielGeheimnis({ PA_SPIEL_GEHEIMNIS: GEH }), GEH);
  assert.equal(leseSpielGeheimnis({ PA_SPIEL_GEHEIMNIS_DATEI: '/gibt/es/nicht' }), '');
  assert.equal(leseSpielGeheimnis({}), '');
});

test('Spielserver: Meldung enthält nur Spieler mit Web-Konto und nur echte Auswertungswerte', () => {
  const stats = {
    entschieden: true, gewinnerTeamId: 1,
    fuerMehrere: ids => (ids.includes(10) ? { schuesse: 8, treffer: 5, kills: 2, schaden: 140 } : { schuesse: 3, treffer: 1, kills: 0, schaden: 20 }),
  };
  const lobby = { id: 'L1', modus: '2x1', seats: [
    { kontoId: 'w-aaaa1111-bbbb', teamId: 1, entityId: 10 },
    { kontoId: 'w-cccc2222-dddd', teamId: 2, entityId: 20 },
    { kontoId: 'lokal-1', teamId: 2, entityId: 30 },
    { kontoId: null, teamId: 2, entityId: 40 },
  ] };
  const m = baueMeldung({ lobby, stats, jetztMs: T });
  assert.equal(m.v, 1); assert.equal(m.spieler.length, 2);
  assert.deepEqual(m.spieler.map(s => [s.nutzerId, s.ergebnis]), [['aaaa1111-bbbb', 'sieg'], ['cccc2222-dddd', 'niederlage']]);
  assert.deepEqual(m.spieler[0].werte, { schuesse: 8, treffer: 5, fehlschuesse: 3, kills: 2, schaden: 140 });
  assert.equal(m.spieler[0].werte.spruenge, undefined, 'nichts erfunden');
  assert.equal(baueMeldung({ lobby: { id: 'L2', seats: [{ kontoId: 'lokal-1', entityId: 1 }] }, stats, jetztMs: T }), null);
});

test('Spielserver: sendeMeldung signiert den Body; die Gegenseite prüft Zeit und Signatur', async () => {
  let gesehen;
  const fetchFn = async (url, opt) => { gesehen = { url, opt }; return { ok: true, status: 200 }; };
  const nutz = { v: 1, meldungsId: 'a', spieler: [] };
  const r = await sendeMeldung({ url: 'https://x.example/api/web/statistik', geheimnis: GEH, nutzlast: nutz, jetztMs: T, fetchFn });
  assert.deepEqual(r, { ok: true, status: 200 });
  const h = gesehen.opt.headers;
  assert.equal(pruefeMeldung(GEH, h['x-pa-zeit'], h['x-pa-signatur'], gesehen.opt.body, T + 1000), true);
  assert.equal(pruefeMeldung(GEH, h['x-pa-zeit'], h['x-pa-signatur'], `${gesehen.opt.body} `, T), false, 'Body verändert');
  assert.equal(pruefeMeldung('z'.repeat(40), h['x-pa-zeit'], h['x-pa-signatur'], gesehen.opt.body, T), false);
  assert.equal(pruefeMeldung(GEH, h['x-pa-zeit'], h['x-pa-signatur'], gesehen.opt.body, T + 10 * 60_000), false, 'Zeitfenster');
  assert.equal(signiereMeldung(GEH, T, 'x').length, 64);
  assert.deepEqual(await sendeMeldung({ url: 'u', geheimnis: GEH, nutzlast: nutz, jetztMs: T, fetchFn: async () => { throw new Error('netz'); } }), { ok: false, status: 0 }, 'wirft nie');
  assert.deepEqual(await sendeMeldung({ url: '', geheimnis: GEH, nutzlast: nutz, jetztMs: T, fetchFn }), { ok: false, status: 0 });
});

test('Client: Netzzugang, Statuszeilen, Versionsvergleich und Formularprüfung', async () => {
  let gesehen;
  const r = await ruf('login', 'POST', { kennung: 'a' }, async (url, opt) => { gesehen = { url, opt }; return { ok: false, status: 401, json: async () => ({ fehler: 'nein' }) }; });
  assert.equal(gesehen.url, '/api/web/login'); assert.equal(gesehen.opt.headers['x-pa-web'], '1'); assert.equal(gesehen.opt.credentials, 'same-origin');
  assert.deepEqual([r.ok, r.status, r.daten.fehler], [false, 401, 'nein']);
  const get = await ruf('status', 'GET', null, async (_u, opt) => { assert.deepEqual(opt.headers, {}); return { ok: true, status: 200, json: async () => { throw new Error('leer'); } }; });
  assert.deepEqual(get.daten, {});
  assert.equal(fehlerText({ status: 429, daten: {} }, 'x'), 'Zu viele Versuche. Bitte später erneut.');
  assert.equal(statusText({ zustand: 'startet', phase: 'npm-ci' }), 'Spielserver startet (ca. 2 bis 4 Minuten) … (Phase: npm-ci)');
  assert.equal(statusText({ zustand: 'aus' }), 'Spielserver: aus.');
  assert.equal(versionenPassen({ version: '1', gitSha: 'a' }, { version: '1', gitSha: 'b' }), false);
  assert.equal(versionenPassen(null, { version: '1' }), true);
  const gut = { email: 'a@b.de', name: 'Abc', passwort: '12345678', anmeldepasswort: 'x' };
  assert.equal(pruefeRegistrierung(gut), null);
  for (const [k, v] of [['email', 'kaputt'], ['name', 'ab'], ['passwort', 'kurz'], ['anmeldepasswort', '']]) assert.ok(pruefeRegistrierung({ ...gut, [k]: v }), k);
});

test('Titellied: im Menü läuft nur das Titellied (Schleife), im Match nicht; Datei, Dauer und Manifest stimmen', () => {
  const manifest = JSON.parse(readFileSync(join(WURZEL, 'src/client/assets/music/manifest.json'), 'utf8'));
  assert.deepEqual(pruefeManifest(manifest), []);
  const titel = manifest.stuecke.filter(s => s.titellied === true);
  assert.equal(titel.length, 1); assert.equal(titel[0].id, 'titellied');
  assert.deepEqual(stueckeFuer(manifest, 'menu').map(s => s.id), ['titellied']);
  assert.ok(!stueckeFuer(manifest, 'match').some(s => s.id === 'titellied'));
  assert.ok(!stueckeFuer(manifest, 'intensiv').some(s => s.id === 'titellied'));
  const datei = join(WURZEL, 'src/client/assets/music', titel[0].datei);
  assert.ok(statStueck(datei) > 1_000_000 && statStueck(datei) < 3_000_000, 'Größe der Webfassung');
  assert.ok(Math.abs(titel[0].dauer - 149.5) < 0.6, 'Dauer ~150 s');
  // Ohne Titellied bleibt das alte Verhalten.
  const ohne = { stuecke: manifest.stuecke.filter(s => !s.titellied) };
  assert.ok(stueckeFuer(ohne, 'menu').length >= 2);
});
function statStueck(p) { return statSync(p).size; }
