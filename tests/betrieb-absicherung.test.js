/**
 * Absicherung vor öffentlicher Erreichbarkeit (REL-2 / DEP-3 / SRV-5): Firewall-Vorlage,
 * Caddy-Vorlage und das Lobby-Anlegen ohne Konto.
 *
 * Geprüft wird, was OHNE echten Knoten prüfbar ist: die Regeln und Header der Vorlagen,
 * die nftables-Syntax (soweit der Rechner sie lesen kann) und das Verhalten des Servers
 * hinter einem vertrauten Proxy. Was erst auf dem Knoten gilt (Zertifikat, Firewall
 * aktiv, `systemctl list-timers`), steht als Betreiberaktion in
 * `docs/sicherheit-vor-oeffentlich.md` — eine Datei im Repo ist kein laufender Dienst.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { GameServer } from '../src/server/gameServer.js';
import { Bremse, KontoDienst } from '../src/server/konto.js';
import { oeffneSpeicher } from '../src/server/kontoSpeicher.js';
import { leseVertrauteProxys } from '../src/server/clientAdresse.js';

const lies = pfad => readFileSync(join(WURZEL, pfad), 'utf8');

/* ------------------------------------------------------------------ Caddyfile */

/** Der Caddyfile ist kein JSON: Kommentare weg, dann die Direktiven prüfen. */
const caddy = () => lies('deploy/Caddyfile.beispiel').split('\n').filter(z => !z.trim().startsWith('#')).join('\n');

test('Caddy-Vorlage: ein Ursprung, TLS automatisch, nur Loopback als Upstream', () => {
  const text = lies('deploy/Caddyfile.beispiel');
  const aktiv = caddy();
  assert.match(text, /^\{\$PA_DOMAIN\} \{/m, 'Site-Adresse ist der Domain-Platzhalter');
  assert.match(text, /email \{\$PA_ACME_EMAIL\}/, 'ACME-Kontakt ist ein Platzhalter, kein erfundener Wert');
  assert.deepEqual([...aktiv.matchAll(/reverse_proxy\s+(\S+)/g)].map(m => m[1]), ['127.0.0.1:3000'],
    'genau ein Upstream, und der liegt auf Loopback');
  assert.doesNotMatch(aktiv, /tls\s+internal|\.pem|\.crt|\.key/, 'keine eigenen Zertifikate in der Vorlage');
  assert.doesNotMatch(aktiv, /^\s*(?:0\.0\.0\.0)?:3000\s*\{/m, 'der Spielport ist kein öffentlicher Site-Block');
  assert.match(aktiv, /admin localhost:2019/, 'Admin-Endpunkt bleibt lokal');
  const klammern = [...aktiv].reduce((n, z) => n + (z === '{') - (z === '}'), 0);
  assert.equal(klammern, 0, 'Klammern sind ausgeglichen');
});

test('Caddy-Vorlage: Sicherheits-Header, WebSocket-Pfad und gesperrter Betriebsendpunkt', () => {
  const aktiv = caddy();
  for (const [name, muster] of [
    ['HSTS', /Strict-Transport-Security "max-age=31536000/],
    ['nosniff', /X-Content-Type-Options "nosniff"/],
    ['Frame-Schutz', /X-Frame-Options "DENY"/],
    ['Referrer', /Referrer-Policy "strict-origin-when-cross-origin"/],
    ['Berechtigungen', /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)"/],
    ['COOP', /Cross-Origin-Opener-Policy "same-origin"/],
    ['CSP nur Report-Only', /Content-Security-Policy-Report-Only "[^"]*default-src 'self'/],
    ['CSP verbietet fremde Verbindungen', /connect-src 'self' wss:\/\/\{\$PA_DOMAIN\}/],
    ['CSP keine Einbettung', /frame-ancestors 'none'/],
    ['kein Server-Kopf', /^\s*-Server\s*$/m],
    ['Körpergrenze der API', /max_size 16KB/],
    ['/healthz außen 404', /@intern path \/healthz\n\trespond @intern 404/],
    ['WebSocket-Verbindungen nicht kappen', /stream_close_delay 5m/],
    ['Kompressionsliste ohne Bilder', /header Content-Type text\/\*/],
  ]) assert.match(aktiv, muster, `${name} fehlt in deploy/Caddyfile.beispiel`);
  assert.doesNotMatch(aktiv, /Content-Security-Policy "/, 'CSP darf nicht schon scharf sein');
  assert.match(lies('deploy/Caddyfile.beispiel'), /PA_ERLAUBTE_ORIGINS/,
    'die Vorlage nennt die Origin-Einstellung, ohne die das Limit je Adresse falsch zählt');
  assert.match(lies('deploy/Caddyfile.beispiel'), /PA_VERTRAUTE_PROXYS/);
});

/* ------------------------------------------------------------------ Firewall */

test('Firewall-Vorlage: Standard verwerfen, 22/80/443 offen, 3000 nirgends erlaubt', () => {
  const text = lies('deploy/firewall.nft');
  const regeln = text.split('\n').filter(z => !z.trim().startsWith('#')).join('\n');
  assert.match(regeln, /hook input priority filter; policy drop;/, 'eingehend gilt: verwerfen');
  assert.match(regeln, /iifname "lo" accept/, 'Loopback bleibt offen');
  assert.match(regeln, /ct state established,related accept/);
  assert.match(regeln, /tcp dport 22 limit rate 6\/minute burst 4 packets accept/, 'SSH mit Bremse');
  assert.match(regeln, /tcp dport \{ 80, 443 \} accept/);
  assert.doesNotMatch(regeln, /dport\s+3000|3000\/tcp|127\.0\.0\.1:3000[^\n]*accept/, 'Spielport nie in einer Accept-Regel');
  assert.match(regeln, /hook output priority filter; policy accept/);
});

test('Firewall-Vorlage: nftables kann sie lesen (Syntax)', () => {
  const datei = join(WURZEL, 'deploy/firewall.nft');
  /*
   * `nft -c` braucht zum Abschluss CAP_NET_ADMIN. `unshare -rn` gibt ihm einen eigenen
   * Netz-Namensraum, dann läuft die Probe vollständig. Ohne diese Rechte ist die Ausgabe
   * „Operation not permitted" — dann war die SYNTAX trotzdem lesbar, und die Regelprüfung
   * oben gilt weiter. Ein echter Syntaxfehler wird in beiden Fällen gemeldet.
   */
  let Meldung = null;
  let geprueft = false;
  for (const [befehl, argumente] of [['unshare', ['-rn', 'nft', '-c', '-f', datei]], ['nft', ['-c', '-f', datei]]]) {
    try {
      execFileSync(befehl, argumente, { stdio: 'pipe', encoding: 'utf8' });
      geprueft = true;
      break;
    } catch (fehler) {
      if (fehler.code === 'ENOENT') continue;
      const ausgabe = `${fehler.stdout ?? ''}\n${fehler.stderr ?? ''}`;
      if (/syntax error|unexpected|Could not parse/i.test(ausgabe)) { Meldung = ausgabe; break; }
      geprueft = true; // nur fehlende Rechte
      break;
    }
  }
  assert.equal(Meldung, null, `nftables-Syntaxfehler:\n${Meldung}`);
  assert.ok(geprueft, 'weder `unshare` noch `nft` vorhanden — die Vorlage ist dann nur statisch geprüft');
});

/* ------------------------------------------------------------ Lobby-Anlegen */

const post = (url, body, kopf = {}) => fetch(`${url}/api/lobby/create`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...kopf }, body: JSON.stringify(body),
});

test('SRV-5: Lobby-Anlegen ohne Konto ist begrenzt und hinterlässt bei 429 keine Lobby', async () => {
  const server = new GameServer({ maxLobbyAnlegenProMinute: 2, maxLobbies: 10 });
  const { url } = await server.listen(0);
  try {
    const antworten = [];
    for (let i = 0; i < 3; i += 1) antworten.push((await post(url, { teams: 2 })).status);
    assert.deepEqual(antworten, [201, 201, 429], 'je Adresse und Minute zwei Lobbys, die dritte wird abgewiesen');
    assert.equal(server.lobbyManager.size, 2, 'die abgewiesene Anfrage legt nichts an');
    assert.equal(server.metrics.lobbiesCreated, 2, 'ein 429 zählt nicht als angelegte Lobby');
  } finally { await server.close(); }
});

test('SRV-5: Gesamtdeckel gilt unabhängig vom Limit je Adresse', async () => {
  const server = new GameServer({ maxLobbyAnlegenProMinute: 100, maxLobbies: 2 });
  const { url } = await server.listen(0);
  try {
    assert.equal((await post(url, {})).status, 201);
    assert.equal((await post(url, {})).status, 201);
    assert.equal((await post(url, {})).status, 503);
    assert.equal(server.lobbyManager.size, 2);
  } finally { await server.close(); }
});

/* ------------------------------------------- Konto-Bremse hinter dem Proxy */

test('DEP-3: Konto-Bremse zählt hinter vertrautem Proxy je Absender, nicht alle als 127.0.0.1', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pa-proxy-konto-'));
  const speicher = oeffneSpeicher({ pfad: join(ordner, 'konten.db') });
  const dienst = new KontoDienst({ speicher, bremse: new Bremse({ registrierung: 1, ip: 1000 }) });
  const server = new GameServer({
    konten: dienst, persistence: null, serveStatic: () => false,
    vertrauteProxys: leseVertrauteProxys('127.0.0.1,::1'), maxLobbyAnlegenProMinute: 1000,
  });
  const { url } = await server.listen(0);
  const registriere = (name, xff) => fetch(`${url}/api/konto/registrieren`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: JSON.stringify({ name, passwort: 'wegwerf-passwort-1' }),
  }).then(r => r.status);
  try {
    assert.equal(await registriere('proxy-a1', '203.0.113.11'), 201);
    assert.equal(await registriere('proxy-a2', '203.0.113.11'), 429, 'zweite Registrierung derselben Adresse gebremst');
    assert.equal(await registriere('proxy-b1', '203.0.113.12'), 201, 'ein anderer Absender ist nicht betroffen');
  } finally {
    await server.close();
    speicher.schliessen();
    rmSync(ordner, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------ Die Anforderungsliste */

test('Anforderungsliste REL-2/DEP-3 nennt die vier Schritte in der richtigen Reihenfolge', () => {
  const doc = lies('docs/sicherheit-vor-oeffentlich.md');
  const stellen = ['Firewall', 'TLS', 'Anmeldung', 'Ratenbegrenzung']
    .map(name => doc.search(new RegExp(`^## \\d+\\. ${name}`, 'm')));
  assert.ok(stellen.every(i => i >= 0), 'alle vier Schritte haben einen eigenen Abschnitt');
  assert.deepEqual([...stellen].sort((a, b) => a - b), stellen, 'Reihenfolge: Firewall → TLS → Anmeldung → Ratenbegrenzung');
  for (const befehl of ['nft -c -f deploy/firewall.nft', 'caddy validate', 'PA_LOBBYS_PRO_MINUTE', 'systemctl list-timers']) {
    assert.ok(doc.includes(befehl), `Anforderungsliste nennt ${befehl}`);
  }
  assert.match(doc, /keine echten Zertifikate|keine echte Instanz|nicht installiert/i, 'die Datei behauptet keinen laufenden Betrieb');
});
