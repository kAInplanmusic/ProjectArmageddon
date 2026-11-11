/**
 * Web-Zugang (Option D, docs/zugang-www.md): Konten (Registrieren, Anmelden, Passwort ändern), Spieltoken,
 * Statistik-Meldung und Server-Start auf Abruf als reine Web-Standard-Funktionen (Request -> Response),
 * unabhängig vom Hoster. Die Netlify-Funktionen unter `netlify/functions/` rufen nur `behandle()` bzw.
 * `notAusAuftrag()` auf. Die Nutzerlogik steht in `nutzer.mjs`, der Speicher in `speicher.mjs`.
 *
 * Keine Abhängigkeiten außer `@netlify/blobs` (nur in der Funktion, nur über `speicher.mjs`), Node >= 22.
 * Alle Geheimnisse kommen aus Umgebungsvariablen des Hosters (nie aus Dateien, nie in Antworten oder Logs):
 *   HCLOUD_TOKEN         Hetzner-Projekt-Token
 *   PA_WEB_GEHEIMNIS     zufälliger Schlüssel für Sitzungs-Cookie und Hintergrundauftrag (mind. 32 Zeichen)
 *   PA_SPIEL_GEHEIMNIS   gemeinsames Geheimnis mit dem Spielserver: Spieltoken, Statistik-Signatur (mind. 32 Zeichen)
 *   PA_REGISTRIER_HASH   Hash des Anmeldepassworts für die Registrierung
 *   PA_START_HASH        Hash des Startpassworts (Server starten, Not-aus)
 *   PA_KONTEN_SAAT       optional: JSON `[{"name","email","hash"}]` fester Konten (nur Hashes), beim ersten Aufruf angelegt
 *   PA_WEB_ORIGIN        erlaubte Herkunft(en) der Seite, kommagetrennt (Vorgabe https://www.projectarmageddon.de)
 * Optional: PA_NAME, PA_SERVER_TYP (cpx22), PA_ORT (fsn1), PA_DOMAIN, PA_ACME_EMAIL, PA_IDLE_MINUTES,
 *   PA_GRACE_MINUTES, PA_MAX_RUNTIME_MINUTES, PA_MAX_MACHINE_MINUTES, PA_GIT_URL, PA_GIT_REF, PA_NODE_MAJOR,
 *   PA_HCLOUD_API, PA_WEB_FRISCH (nein = ohne Abbild nicht starten), PA_WEB_IP_HEADER.
 *
 * Grenze, ehrlich: Das Startpasswort schützt das STARTEN (und damit die Kosten). Der Spielserver unter der
 * sslip.io-Adresse ist öffentlich erreichbar; ohne gültiges Spieltoken spielt man dort als Gast.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEHEIMNIS_MIN, pruefeMeldung, stelleSpieltokenAus } from '../../../src/server/webAnbindung.js';
import { hashePasswort, pruefeGeheimnis, pruefePbkdf2 as pruefePasswort, RUNDEN } from './hash.mjs';
import { NutzerDienst, cookieAusKopf, cookieLoeschen, cookieSetzen, neueSitzung, nutzerOeffentlich } from './nutzer.mjs';
import { erzeugeBlobSpeicher } from './speicher.mjs';

export { hashePasswort, pruefePasswort, RUNDEN };
const L_SERVER = 'projectarmageddon-server';
const L_IP = 'projectarmageddon-ip';
const L_ABBILD = 'projectarmageddon-snapshot';

// ---------------------------------------------------------------- Konfiguration -
export function leseKonfig(env) {
  const origins = String(env.PA_WEB_ORIGIN || 'https://www.projectarmageddon.de').split(',').map(s => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
  return {
    token: env.HCLOUD_TOKEN ?? '', geheimnis: env.PA_WEB_GEHEIMNIS ?? '', spielGeheimnis: env.PA_SPIEL_GEHEIMNIS ?? '',
    registrierHash: env.PA_REGISTRIER_HASH ?? '', startHash: env.PA_START_HASH ?? '', saat: env.PA_KONTEN_SAAT ?? '',
    origins, api: (env.PA_HCLOUD_API || 'https://api.hetzner.cloud/v1').replace(/\/+$/, ''),
    name: env.PA_NAME || 'pa-spiel', typ: env.PA_SERVER_TYP || 'cpx22', ort: env.PA_ORT || 'fsn1',
    domain: env.PA_DOMAIN || '', acme: env.PA_ACME_EMAIL || '',
    idle: env.PA_IDLE_MINUTES || '15', grace: env.PA_GRACE_MINUTES || '5',
    maxRt: env.PA_MAX_RUNTIME_MINUTES || '480', maxM: env.PA_MAX_MACHINE_MINUTES || '540',
    gitUrl: env.PA_GIT_URL || 'https://github.com/kAInplanmusic/projectarmageddon', gitRef: env.PA_GIT_REF || 'main',
    nodeMajor: env.PA_NODE_MAJOR || '22', frisch: env.PA_WEB_FRISCH !== 'nein', ipKopf: (env.PA_WEB_IP_HEADER || 'x-nf-client-connection-ip').toLowerCase(),
  };
}
/** Grundlage für alles (Konten, Spieltoken). Server-Start braucht zusätzlich `startFehler`. */
export const konfigFehler = k => (k.geheimnis.length < 32 ? 'PA_WEB_GEHEIMNIS fehlt oder ist kürzer als 32 Zeichen'
  : k.spielGeheimnis.length < GEHEIMNIS_MIN ? 'PA_SPIEL_GEHEIMNIS fehlt oder ist kürzer als 32 Zeichen' : '');
export const startFehler = k => (!k.token ? 'HCLOUD_TOKEN fehlt' : !k.startHash ? 'PA_START_HASH fehlt' : '');
export const sslipHost = ip => `${String(ip).replace(/\./g, '-')}.sslip.io`;

// ---------------------------------------------------------------- Hetzner -------
function hcClient(k, deps) {
  return async (methode, pfad, body) => {
    const r = await deps.fetch(`${k.api}${pfad}`, {
      method: methode, signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${k.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await r.json(); } catch { /* leer */ }
    return { status: r.status, json };
  };
}
const etikett = (key, wert) => `?label_selector=${encodeURIComponent(`${key}=${wert}`)}`;
const fehlerText = r => `Hetzner HTTP ${r.status}: ${r.json?.error?.message ?? r.json?.error?.code ?? 'ohne Meldung'}`;

/** cloud-config für den neuen Server — dieselbe Form wie `server-hochfahren.sh`. Das Token landet nur in /run (tmpfs). */
export function baueUserData(k, domain, installer, modus) {
  const env = [
    'HOST=127.0.0.1', 'PORT=3000', 'LOG_LEVEL=info', 'LOG_FORMAT=json',
    'PA_STATE_PATH=/var/lib/projectarmageddon/lobbies.json', 'PA_KONTEN_PFAD=/var/lib/projectarmageddon/konten.db',
    'PA_ERLAUBE_OEFFENTLICH=no', 'PA_BUILD=0',
    'PA_SPIEL_GEHEIMNIS_DATEI=/run/projectarmageddon/spiel-geheimnis', `PA_STATISTIK_URL=${k.origins[0]}/api/web/statistik`,
    `PA_ERLAUBTE_ORIGINS=${['https://' + domain, ...k.origins].join(',')}`, `PA_EIGENER_ORIGIN=https://${domain}`, 'PA_VERTRAUTE_PROXYS=127.0.0.1,::1',
    'PA_SICHERUNG_DIR=/var/lib/projectarmageddon/sicherungen', 'PA_SICHERUNG_BEHALTEN=10',
    `PA_IDLE_MINUTES=${k.idle}`, `PA_GRACE_MINUTES=${k.grace}`, `PA_MAX_RUNTIME_MINUTES=${k.maxRt}`, `PA_MAX_MACHINE_MINUTES=${k.maxM}`,
    'PA_ACTION=abbild-loeschen', 'PA_ABBILD_BEHALTEN=1', 'PA_SYSTEMD_UNIT=projectarmageddon.service', 'PA_STATE_DIR=/var/lib/projectarmageddon',
    'PA_ARMED_FILE=/etc/projectarmageddon/ist-gemietet', 'PA_HEALTH_URL=http://127.0.0.1:3000/healthz',
    'PA_SNAPSHOT_DIR=/var/lib/projectarmageddon/snapshots', 'PA_SNAPSHOT_KEEP=3', 'PA_SNAPSHOT_CLOUD=no', 'PA_INTERVAL_SECONDS=30',
  ];
  if (k.api !== 'https://api.hetzner.cloud/v1') env.push(`PA_HCLOUD_API=${k.api}`);
  const boot = ['PA_BELEG=nein', `PA_GIT_URL=${k.gitUrl}`, `PA_GIT_REF=${k.gitRef}`, `PA_NODE_MAJOR=${k.nodeMajor}`, `PA_DOMAIN=${domain}`, `PA_ACME_EMAIL=${k.acme}`, 'PA_SSH=nein'];
  const caddy = `[Service]\nEnvironment=PA_DOMAIN=${domain}\nEnvironment=PA_ACME_EMAIL=${k.acme}\n`;
  const w = (path, permissions, content) => ({ path, owner: 'root:root', permissions, content });
  const cfg = {
    ssh_pwauth: false, disable_root: true,
    write_files: [
      w('/run/projectarmageddon/hcloud-token', '0600', `${k.token}\n`),
      w('/run/projectarmageddon/spiel-geheimnis', '0600', `${k.spielGeheimnis}\n`),
      w('/etc/projectarmageddon/betrieb.env', '0600', `${env.join('\n')}\n`),
      w('/etc/projectarmageddon/boot.env', '0600', `${boot.join('\n')}\n`),
      w('/etc/systemd/system/caddy.service.d/pa.conf', '0644', caddy),
      w('/usr/local/sbin/pa-erstinstallation.sh', '0700', installer),
    ],
    runcmd: [['/usr/local/sbin/pa-erstinstallation.sh', modus]],
  };
  const text = `#cloud-config\n${JSON.stringify(cfg)}`;
  if (text.length >= 32000) throw new Error('user_data zu groß (32 KiB)');
  return text;
}

export function ladeInstaller() {
  for (const wurzel of [process.env.LAMBDA_TASK_ROOT, process.cwd(), join(import.meta.dirname ?? '.', '..', '..', '..')]) {
    if (!wurzel) continue;
    try { return readFileSync(join(wurzel, 'scripts/betrieb/server-erstinstallation.sh'), 'utf8'); } catch { /* nächster */ }
  }
  throw new Error('server-erstinstallation.sh nicht gefunden (netlify.toml: included_files)');
}

const neuesterAbbild = liste => (liste ?? []).filter(x => x.status === 'available').sort((a, b) => String(b.created).localeCompare(String(a.created)) || b.id - a.id)[0] ?? null;

/** Zustand: aus | startet | bereit | sichert. Hetzner ist die Wahrheit, die Funktion hat kein Gedächtnis. */
export async function ermittleStatus(k, deps) {
  const hc = hcClient(k, deps);
  const s = await hc('GET', `/servers${etikett(L_SERVER, 'ja')}`);
  if (s.status !== 200) throw new Error(fehlerText(s));
  const server = s.json.servers?.[0];
  if (!server) {
    const a = await hc('GET', `/images${etikett(L_ABBILD, 'auto')}&type=snapshot`);
    if (a.status !== 200) throw new Error(fehlerText(a));
    const abb = neuesterAbbild(a.json.images);
    return { zustand: 'aus', abbild: Boolean(abb), abbildGb: abb ? Number(abb.image_size ?? 0) : 0 };
  }
  const ip = server.public_net?.ipv4?.ip ?? null;
  const phase = server.labels?.['projectarmageddon-phase'] ?? null;
  const basis = { server: server.status, phase, ip };
  if (server.status === 'off' || server.status === 'stopping' || server.labels?.['projectarmageddon-phase'] === 'web-not-aus') return { zustand: 'sichert', ...basis };
  if (server.status !== 'running' || !ip) return { zustand: 'startet', ...basis };
  const host = k.domain || sslipHost(ip);
  try {
    const r = await deps.fetch(`https://${host}/healthz`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const h = await r.json().catch(() => ({}));
      return { zustand: 'bereit', ...basis, spielUrl: `https://${host}`, version: h.version ?? null, gitSha: h.gitSha ?? h.build?.gitSha ?? null };
    }
  } catch { /* noch nicht erreichbar */ }
  return { zustand: 'startet', ...basis };
}

export async function starten(k, deps) {
  const hc = hcClient(k, deps);
  const s = await hc('GET', `/servers${etikett(L_SERVER, 'ja')}`);
  if (s.status !== 200) throw new Error(fehlerText(s));
  if (s.json.servers?.length) return { code: 409, text: 'Es läuft oder startet schon ein Server (es gibt nie mehr als einen).' };
  const a = await hc('GET', `/images${etikett(L_ABBILD, 'auto')}&type=snapshot`);
  if (a.status !== 200) throw new Error(fehlerText(a));
  const abb = neuesterAbbild(a.json.images);
  if (!abb && !k.frisch) return { code: 409, text: 'Kein Abbild vorhanden und frische Einrichtung abgeschaltet (PA_WEB_FRISCH=nein).' };
  const ips = await hc('GET', `/primary_ips${etikett(L_IP, 'ja')}`);
  if (ips.status !== 200) throw new Error(fehlerText(ips));
  let ip = ips.json.primary_ips?.[0];
  if (ip?.assignee_id) return { code: 409, text: 'Die reservierte IP ist schon einem Server zugewiesen.' };
  const ort = ip?.location?.name ?? k.ort;
  if (!ip) {
    const n = await hc('POST', '/primary_ips', { name: `${k.name}-ipv4`, type: 'ipv4', location: ort, auto_delete: false, labels: { [L_IP]: 'ja' } });
    if (n.status >= 300) throw new Error(fehlerText(n));
    ip = n.json.primary_ip;
  }
  const domain = k.domain || sslipHost(ip.ip);
  const userData = baueUserData(k, domain, deps.installer(), abb ? '--aus-abbild' : '--frisch');
  const r = await hc('POST', '/servers', {
    name: k.name, server_type: k.typ, location: ort, image: abb ? abb.id : 'ubuntu-24.04', user_data: userData,
    labels: { [L_SERVER]: 'ja' }, public_net: { enable_ipv4: true, enable_ipv6: true, ipv4: ip.id }, start_after_create: true,
  });
  if (r.status >= 300) return { code: 502, text: fehlerText(r) };
  return { code: 202, text: abb ? 'Server wird aus dem Abbild erzeugt.' : 'Server wird frisch eingerichtet (dauert länger).', ip: ip.ip };
}

/** Not-aus: herunterfahren, Abbild anlegen und PRÜFEN, erst dann löschen. Ohne geprüftes Abbild bleibt der Server stehen. */
export async function notAus(k, deps, log = () => {}) {
  const hc = hcClient(k, deps);
  const s = await hc('GET', `/servers${etikett(L_SERVER, 'ja')}`);
  if (s.status !== 200) throw new Error(fehlerText(s));
  const ergebnis = [];
  for (const server of s.json.servers ?? []) {
    const id = server.id;
    await hc('PUT', `/servers/${id}`, { labels: { ...(server.labels ?? {}), 'projectarmageddon-phase': 'web-not-aus' } });
    if (server.status !== 'off') {
      await hc('POST', `/servers/${id}/actions/shutdown`, {});
      let aus = false;
      for (let i = 0; i < 36 && !aus; i++) { await deps.sleep(5000); aus = (await hc('GET', `/servers/${id}`)).json?.server?.status === 'off'; }
      if (!aus) { await hc('POST', `/servers/${id}/actions/poweroff`, {}); await deps.sleep(10_000); }
    }
    const neu = await hc('POST', `/servers/${id}/actions/create_image`, { type: 'snapshot', description: `projectarmageddon web-not-aus`, labels: { [L_ABBILD]: 'auto' } });
    const bildId = neu.json?.image?.id;
    let geprueft = false;
    if (bildId) {
      for (let i = 0; i < 150 && !geprueft; i++) {
        await deps.sleep(i === 0 ? 1000 : 6000);
        const b = (await hc('GET', `/images/${bildId}`)).json?.image;
        if (b?.status === 'creating') continue;
        geprueft = b?.status === 'available' && b.type === 'snapshot' && b.created_from?.id === id;
        if (!geprueft) break;
      }
    }
    if (!geprueft) { log(`Kein geprüftes Abbild für ${id}: Server bleibt stehen (kostet weiter)`); ergebnis.push({ id, geloescht: false }); continue; }
    const alle = await hc('GET', `/images${etikett(L_ABBILD, 'auto')}&type=snapshot`);
    for (const x of alle.json?.images ?? []) if (x.id !== bildId) await hc('DELETE', `/images/${x.id}`);
    await hc('DELETE', `/servers/${id}`);
    ergebnis.push({ id, geloescht: (await hc('GET', `/servers/${id}`)).status === 404, abbild: bildId });
  }
  return ergebnis;
}

// ---------------------------------------------------------------- HTTP-Schicht --
const kopf = (extra = {}) => ({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
const antwort = (code, obj, extra) => new Response(JSON.stringify(obj), { status: code, headers: kopf(extra) });
const ablehnung = r => antwort(r.status, { fehler: r.fehler, code: r.code }, r.status === 429 ? { 'retry-after': '900' } : undefined);
const gleich = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** Auftrag an die Hintergrundfunktion: kurzlebig (60 s) und mit dem Cookie-Geheimnis signiert (statt Cookie + Startpasswort weiterzureichen). */
export const auftragsKopf = (k, jetztMs) => { const e = Math.floor(jetztMs / 1000) + 60; return `${e}.${createHmac('sha256', k.geheimnis).update(`not-aus.${e}`).digest('base64url')}`; };
const auftragGueltig = (k, wert, jetztMs) => { const [e, m] = String(wert ?? '').split('.'); return Number(e) * 1000 > jetztMs && m !== undefined && gleich(createHmac('sha256', k.geheimnis).update(`not-aus.${e}`).digest('base64url'), m); };

const saatErledigt = new WeakSet(); // je Speicher-Objekt (= je Funktionsinstanz) einmal; die Saat selbst ist idempotent
const standardSpeicher = { wert: null };
async function dienstFuer(k, deps) {
  const speicher = deps.speicher ?? (standardSpeicher.wert ??= await erzeugeBlobSpeicher());
  const dienst = new NutzerDienst({ speicher, jetzt: deps.jetzt, sleep: deps.sleep });
  if (k.saat && !saatErledigt.has(speicher)) { await dienst.saat(k.saat); saatErledigt.add(speicher); }
  return dienst;
}

/** Ein Aufruf. `deps`: { env, fetch, sleep, jetzt, installer, speicher } — für Tests ersetzbar. */
export async function behandle(req, depsIn = {}) {
  const deps = { env: process.env, fetch: globalThis.fetch, sleep: ms => new Promise(r => setTimeout(r, ms)), jetzt: Date.now, installer: ladeInstaller, ...depsIn };
  const k = leseKonfig(deps.env);
  const fehl = konfigFehler(k);
  if (fehl) return antwort(500, { fehler: `Einrichtung unvollständig: ${fehl}` });
  const url = new URL(req.url);
  const aktion = url.pathname.replace(/\/+$/, '').split('/').pop();
  const ip = (req.headers.get(k.ipKopf) ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '?').trim();

  try {
    // Meldung des Spielservers: keine Sitzung, keine Herkunft — nur die Signatur zählt.
    if (aktion === 'statistik' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 64_000 || !pruefeMeldung(k.spielGeheimnis, req.headers.get('x-pa-zeit'), req.headers.get('x-pa-signatur'), body, deps.jetzt())) return antwort(401, { fehler: 'Signatur ungültig' });
      let m = null; try { m = JSON.parse(body); } catch { /* ungültig */ }
      const r = await (await dienstFuer(k, deps)).statistikVerbuchen(m);
      return r.ok ? antwort(200, { ok: true, ergebnisse: r.ergebnisse }) : ablehnung(r);
    }

    const origin = (req.headers.get('origin') ?? '').toLowerCase();
    const gleicheSeite = origin === '' ? req.method === 'GET' : k.origins.includes(origin);
    if (req.method !== 'GET' && (!gleicheSeite || req.headers.get('x-pa-web') !== '1')) return antwort(403, { fehler: 'Herkunft nicht erlaubt' });
    const dienst = await dienstFuer(k, deps);
    const koerper = async () => { try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
    const t = deps.jetzt();
    const setzeCookie = n => ({ 'set-cookie': cookieSetzen(neueSitzung(k.geheimnis, n.id, n.sv, t)) });

    if (aktion === 'registrieren' && req.method === 'POST') {
      const b = await koerper();
      const r = await dienst.registrieren({ email: b.email, name: b.name, passwort: b.passwort, anmeldepasswort: b.anmeldepasswort, ip, anmeldepasswortHash: k.registrierHash });
      return r.ok ? antwort(200, { ok: true, nutzer: nutzerOeffentlich(r.nutzer) }, setzeCookie(r.nutzer)) : ablehnung(r);
    }
    if (aktion === 'login' && req.method === 'POST') {
      const b = await koerper();
      const r = await dienst.anmelden({ kennung: b.kennung, passwort: b.passwort, ip });
      return r.ok ? antwort(200, { ok: true, nutzer: nutzerOeffentlich(r.nutzer) }, setzeCookie(r.nutzer)) : ablehnung(r);
    }
    if (aktion === 'logout' && req.method === 'POST') return antwort(200, { ok: true }, { 'set-cookie': cookieLoeschen });

    const nutzer = await dienst.nutzerAusSitzung(cookieAusKopf(req.headers.get('cookie')), k.geheimnis);
    if (!nutzer) return antwort(401, { fehler: 'Bitte anmelden.' });

    if (aktion === 'ich' && req.method === 'GET') return antwort(200, { nutzer: nutzerOeffentlich(nutzer) });
    if (aktion === 'passwort-aendern' && req.method === 'POST') {
      const b = await koerper();
      const r = await dienst.passwortAendern({ nutzer, altes: b.altes, neues: b.neues });
      return r.ok ? antwort(200, { ok: true }, setzeCookie(r.nutzer)) : ablehnung(r);
    }
    if (aktion === 'spieltoken' && req.method === 'POST') {
      const x = stelleSpieltokenAus(k.spielGeheimnis, { nutzerId: nutzer.id, name: nutzer.name }, t);
      return antwort(200, { token: x.token, laeuftAb: x.laeuftAb, name: nutzer.name });
    }

    if (aktion === 'status' && req.method === 'GET') {
      if (!k.token) return antwort(500, { fehler: 'Einrichtung unvollständig: HCLOUD_TOKEN fehlt' });
      return antwort(200, await ermittleStatus(k, deps));
    }
    if ((aktion === 'start' || aktion === 'not-aus') && req.method === 'POST') {
      const sf = startFehler(k);
      if (sf) return antwort(500, { fehler: `Einrichtung unvollständig: ${sf}` });
      const b = await koerper();
      if ((await dienst.gesperrt(`s:${nutzer.id}`, 5)) || (await dienst.gesperrt(`s:${ip}`, 10))) return antwort(429, { fehler: 'Zu viele Versuche. Bitte in 15 Minuten erneut.' }, { 'retry-after': '900' });
      if (typeof b.startcode !== 'string' || !(await pruefeGeheimnis(b.startcode.slice(0, 200), k.startHash))) {
        await dienst.fehlversuch(`s:${nutzer.id}`); await dienst.fehlversuch(`s:${ip}`); await deps.sleep(600);
        return antwort(403, { fehler: 'Startcode falsch.' });
      }
      await dienst.entlaste(`s:${nutzer.id}`); await dienst.entlaste(`s:${ip}`);
      if (aktion === 'start') {
        const r = await starten(k, deps);
        return antwort(r.code, r.code < 300 ? { zustand: 'startet', hinweis: r.text } : { fehler: r.text });
      }
      // Not-aus dauert Minuten: eine Hintergrundfunktion (bis 15 min) übernimmt; sie prüft den signierten Auftrag selbst.
      if (deps.notAusStarten) { await deps.notAusStarten(req, auftragsKopf(k, t)); return antwort(202, { zustand: 'sichert', hinweis: 'Not-aus läuft im Hintergrund (Abbild, Prüfung, Löschen).' }); }
      return antwort(501, { fehler: 'Kein Hintergrundauftrag verdrahtet' });
    }
  } catch (e) {
    return antwort(502, { fehler: String(e?.message ?? e).replaceAll(k.token || '\u0000', '***').replaceAll(k.spielGeheimnis, '***').replaceAll(k.geheimnis, '***') });
  }
  return antwort(404, { fehler: 'unbekannt' });
}

/** Hintergrundauftrag (Netlify `*-background`): prüft den signierten Auftrag (kein Cookie, kein Startpasswort), dann notAus(). */
export async function notAusAuftrag(req, depsIn = {}) {
  const deps = { env: process.env, fetch: globalThis.fetch, sleep: ms => new Promise(r => setTimeout(r, ms)), jetzt: Date.now, ...depsIn };
  const k = leseKonfig(deps.env);
  if (konfigFehler(k) || startFehler(k) || req.method !== 'POST' || !auftragGueltig(k, req.headers.get('x-pa-auftrag'), deps.jetzt())) return antwort(403, { fehler: 'abgelehnt' });
  try { return antwort(200, { ergebnis: await notAus(k, deps) }); } catch (e) { return antwort(502, { fehler: String(e?.message ?? e).replaceAll(k.token, '***') }); }
}
