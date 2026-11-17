/**
 * Einstieg auf Cloudflare (scripts/betrieb/web/cloudflare-einstieg.mjs, functions/api/web/[[path]].mjs):
 * Verdrahtung von Kern, D1-Speicher, Secrets aus `env`, Installer als Text und Hintergrundauftrag. Die Bindung `DB`
 * ist eine echte SQLite-Datenbank (tests/helfer/fake-d1.mjs); das Verhalten der Cloudflare-Plattform selbst ist
 * damit NICHT belegt (docs/zugang-www.md, „Ungeprüft“).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bearbeite, notAusStarter, NOT_AUS_PFAD } from '../scripts/betrieb/web/cloudflare-einstieg.mjs';
import { erzeugeText } from '../scripts/betrieb/web/installer-erzeugen.mjs';
import { auftragsKopf, leseKonfig } from '../scripts/betrieb/web/gateway-kern.mjs';
import { fakeD1 } from './helfer/fake-d1.mjs';

const WURZEL = fileURLToPath(new URL('../', import.meta.url));
const ENV = () => ({
  DB: fakeD1(),
  PA_WEB_GEHEIMNIS: 'w'.repeat(40), PA_SPIEL_GEHEIMNIS: 's'.repeat(40), HCLOUD_TOKEN: 'tok', PA_START_HASH: 'x',
});
const GET = pfad => new Request(`https://www.projectarmageddon.de${pfad}`, { headers: { 'cf-connecting-ip': '203.0.113.7' } });

test('Einstieg: ohne D1-Bindung klare Fehlermeldung statt Absturz', async () => {
  const r = await bearbeite(GET('/api/web/ich'), { PA_WEB_GEHEIMNIS: 'w'.repeat(40) }, null);
  assert.equal(r.status, 500);
  assert.match((await r.json()).fehler, /D1-Bindung DB fehlt/);
});

test('Einstieg: Aufruf läuft durch Kern und D1 (Secrets aus env, nicht aus process.env)', async () => {
  const env = ENV();
  const r = await bearbeite(GET('/api/web/ich'), env, null);
  assert.equal(r.status, 401, 'ohne Sitzung');
  // Die Tabelle wurde angelegt: eine zweite Anfrage mit demselben env läuft ebenfalls.
  assert.equal((await bearbeite(GET('/api/web/ich'), env, null)).status, 401);
  // Ohne Secrets meldet der Kern die unvollständige Einrichtung.
  const leer = await bearbeite(GET('/api/web/ich'), { DB: fakeD1() }, null);
  assert.equal(leer.status, 500);
  assert.match((await leer.json()).fehler, /PA_WEB_GEHEIMNIS/);
});

test('Einstieg: Hintergrundauftrag verlangt die Signatur und gibt sonst 403', async () => {
  const env = ENV();
  const ohne = await bearbeite(new Request(`https://x.example${NOT_AUS_PFAD}`, { method: 'POST' }), env, null);
  assert.equal(ohne.status, 403);
  const falsch = await bearbeite(new Request(`https://x.example${NOT_AUS_PFAD}`, { method: 'POST', headers: { 'x-pa-auftrag': '9999999999.gefaelscht' } }), env, null);
  assert.equal(falsch.status, 403);
  const gueltig = auftragsKopf(leseKonfig(env), Date.now());
  const ok = await bearbeite(new Request(`https://x.example${NOT_AUS_PFAD}`, { method: 'POST', headers: { 'x-pa-auftrag': gueltig } }), env, null,
    { holer: async () => new Response('{}', { status: 404 }), sleep: async () => {} });
  assert.notEqual(ok.status, 403, 'mit gültigem Auftrag wird er angenommen (hier scheitert erst Hetzner)');
});

test('Einstieg: Not-aus-Starter ruft den eigenen Pfad mit dem Auftrag auf und hält ihn per waitUntil am Leben', async () => {
  const aufrufe = []; const gehalten = [];
  const ctx = { waitUntil: p => gehalten.push(p) };
  const starter = notAusStarter(ctx, async (url, opt) => { aufrufe.push({ url: String(url), opt }); return new Response('ok'); });
  await starter(new Request('https://www.projectarmageddon.de/api/web/not-aus'), 'AUFTRAG');
  assert.equal(aufrufe.length, 1);
  assert.equal(aufrufe[0].url, `https://www.projectarmageddon.de${NOT_AUS_PFAD}`);
  assert.equal(aufrufe[0].opt.method, 'POST');
  assert.equal(aufrufe[0].opt.headers['x-pa-auftrag'], 'AUFTRAG');
  assert.equal(gehalten.length, 1, 'waitUntil bekommt den Auftrag');
  // Ein Fehler beim Anstoßen wirft nicht in die Antwort an den Nutzer.
  const s2 = notAusStarter({ waitUntil: p => gehalten.push(p) }, async () => { throw new Error('netz'); });
  await s2(new Request('https://x.example/api/web/not-aus'), 'A');
  assert.equal(await gehalten.at(-1), null);
});

test('Einstieg: installer-text.mjs passt zur Quelle, Funktion und Routen sind verdrahtet', () => {
  assert.equal(readFileSync(`${WURZEL}scripts/betrieb/web/installer-text.mjs`, 'utf8'), erzeugeText(), 'veraltet: npm run web:installer');
  assert.ok(erzeugeText().includes('#!/'), 'Installer beginnt mit Shebang');
  assert.match(readFileSync(`${WURZEL}functions/api/web/[[path]].mjs`, 'utf8'), /export const onRequest = ctx => bearbeite\(ctx\.request, ctx\.env, ctx\)/);
  const routen = JSON.parse(readFileSync(`${WURZEL}public/_routes.json`, 'utf8'));
  assert.deepEqual(routen.include, ['/api/web/*'], 'nur die API ruft die Function auf, Dateien nicht');
  const pkg = JSON.parse(readFileSync(`${WURZEL}package.json`, 'utf8'));
  assert.ok(pkg.scripts['web:installer']);
});
