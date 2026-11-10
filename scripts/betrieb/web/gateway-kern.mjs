/**
 * Web-Zugang (Option D, docs/zugang-www.md): Login, Sitzung und Server-Start auf Abruf als reine
 * Web-Standard-Funktionen (Request -> Response), unabhängig vom Hoster. Die Netlify-Funktionen
 * unter `netlify/functions/` rufen nur `behandle()` bzw. `notAus()` auf.
 *
 * Keine Abhängigkeiten, nur Node >= 22 (fetch, node:crypto). Alle Geheimnisse kommen aus
 * Umgebungsvariablen des Hosters (nie aus Dateien, nie in Antworten oder Logs):
 *   HCLOUD_TOKEN            Hetzner-Projekt-Token
 *   PA_WEB_PASSWORT_HASH    `pbkdf2$<Runden>$<salz-hex>$<hash-hex>` (Seite /passwort-hash.html oder passwort-hash.mjs)
 *   PA_WEB_GEHEIMNIS        zufälliger Schlüssel für das Sitzungs-Cookie (mind. 32 Zeichen)
 *   PA_WEB_ORIGIN           erlaubte Herkunft(en) der Seite, kommagetrennt (Vorgabe https://www.projectarmageddon.de)
 * Optional: PA_NAME, PA_SERVER_TYP (cpx22), PA_ORT (fsn1), PA_DOMAIN, PA_ACME_EMAIL, PA_IDLE_MINUTES,
 *   PA_GRACE_MINUTES, PA_MAX_RUNTIME_MINUTES, PA_MAX_MACHINE_MINUTES, PA_GIT_URL, PA_GIT_REF, PA_NODE_MAJOR,
 *   PA_HCLOUD_API, PA_WEB_FRISCH (nein = ohne Abbild nicht starten), PA_WEB_IP_HEADER.
 *
 * Grenze, ehrlich: Das Login schützt das STARTEN (und damit die Kosten). Der Spielserver unter der
 * sslip.io-Adresse ist öffentlich erreichbar; Konten/Passwörter des Spiels schützen dort die Spieler.
 */
import { createHmac, pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pbkdf2 = promisify(pbkdf2Cb);
export const RUNDEN = 600_000;
export const SITZUNG_SEKUNDEN = 12 * 3600;
const L_SERVER = 'projectarmageddon-server';
const L_IP = 'projectarmageddon-ip';
const L_ABBILD = 'projectarmageddon-snapshot';

// ---------------------------------------------------------------- Passwort -----
export async function hashePasswort(passwort, salz = randomBytes(16), runden = RUNDEN) {
  const h = await pbkdf2(String(passwort), salz, runden, 32, 'sha256');
  return `pbkdf2$${runden}$${salz.toString('hex')}$${h.toString('hex')}`;
}

export async function pruefePasswort(passwort, gespeichert) {
  const [art, n, salz, hash] = String(gespeichert ?? '').split('$');
  const runden = Number(n);
  if (art !== 'pbkdf2' || !(runden >= 1000 && runden <= 5_000_000) || !/^[0-9a-f]+$/.test(salz ?? '') || !/^[0-9a-f]+$/.test(hash ?? '')) return false;
  const soll = Buffer.from(hash, 'hex');
  const ist = await pbkdf2(String(passwort), Buffer.from(salz, 'hex'), runden, soll.length, 'sha256');
  return ist.length === soll.length && timingSafeEqual(ist, soll);
}

// ---------------------------------------------------------------- Sitzung -------
const mac = (geheimnis, text) => createHmac('sha256', geheimnis).update(text).digest('base64url');
export function neueSitzung(geheimnis, jetztMs) {
  const bis = Math.floor(jetztMs / 1000) + SITZUNG_SEKUNDEN;
  const nutz = `v1.${bis}.${randomBytes(9).toString('base64url')}`;
  return `${nutz}.${mac(geheimnis, nutz)}`;
}
export function sitzungGueltig(wert, geheimnis, jetztMs) {
  const teile = String(wert ?? '').split('.');
  if (teile.length !== 4 || teile[0] !== 'v1') return false;
  const soll = Buffer.from(mac(geheimnis, teile.slice(0, 3).join('.')));
  const ist = Buffer.from(teile[3]);
  return soll.length === ist.length && timingSafeEqual(soll, ist) && Number(teile[1]) > jetztMs / 1000;
}
const cookieWert = req => /(?:^|;\s*)pa_web=([A-Za-z0-9_.-]+)/.exec(req.headers.get('cookie') ?? '')?.[1] ?? '';

// ---------------------------------------------------------------- Konfiguration -
export function leseKonfig(env) {
  const origins = String(env.PA_WEB_ORIGIN || 'https://www.projectarmageddon.de').split(',').map(s => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
  return {
    token: env.HCLOUD_TOKEN ?? '', hash: env.PA_WEB_PASSWORT_HASH ?? '', geheimnis: env.PA_WEB_GEHEIMNIS ?? '',
    origins, api: (env.PA_HCLOUD_API || 'https://api.hetzner.cloud/v1').replace(/\/+$/, ''),
    name: env.PA_NAME || 'pa-spiel', typ: env.PA_SERVER_TYP || 'cpx22', ort: env.PA_ORT || 'fsn1',
    domain: env.PA_DOMAIN || '', acme: env.PA_ACME_EMAIL || '',
    idle: env.PA_IDLE_MINUTES || '15', grace: env.PA_GRACE_MINUTES || '5',
    maxRt: env.PA_MAX_RUNTIME_MINUTES || '480', maxM: env.PA_MAX_MACHINE_MINUTES || '540',
    gitUrl: env.PA_GIT_URL || 'https://github.com/kAInplanmusic/projectarmageddon', gitRef: env.PA_GIT_REF || 'main',
    nodeMajor: env.PA_NODE_MAJOR || '22', frisch: env.PA_WEB_FRISCH !== 'nein', ipKopf: (env.PA_WEB_IP_HEADER || 'x-nf-client-connection-ip').toLowerCase(),
  };
}
export const konfigFehler = k => (!k.token ? 'HCLOUD_TOKEN fehlt' : !k.hash ? 'PA_WEB_PASSWORT_HASH fehlt' : k.geheimnis.length < 32 ? 'PA_WEB_GEHEIMNIS fehlt oder ist kürzer als 32 Zeichen' : '');
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
const versuche = new Map(); // ip -> { n, bis }  (je Funktionsinstanz; bestmöglich, siehe docs/zugang-www.md)
export function leereLimit() { versuche.clear(); }

const kopf = (extra = {}) => ({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
const antwort = (code, obj, extra) => new Response(JSON.stringify(obj), { status: code, headers: kopf(extra) });

/** Ein Aufruf. `deps`: { env, fetch, sleep, jetzt, installer } — für Tests ersetzbar. */
export async function behandle(req, depsIn = {}) {
  const deps = { env: process.env, fetch: globalThis.fetch, sleep: ms => new Promise(r => setTimeout(r, ms)), jetzt: Date.now, installer: ladeInstaller, ...depsIn };
  const k = leseKonfig(deps.env);
  const fehl = konfigFehler(k);
  if (fehl) return antwort(500, { fehler: `Einrichtung unvollständig: ${fehl}` });
  const url = new URL(req.url);
  const aktion = url.pathname.replace(/\/+$/, '').split('/').pop();
  const origin = (req.headers.get('origin') ?? '').toLowerCase();
  const gleicheSeite = origin === '' ? req.method === 'GET' : k.origins.includes(origin);
  if (req.method !== 'GET' && (!gleicheSeite || req.headers.get('x-pa-web') !== '1')) return antwort(403, { fehler: 'Herkunft nicht erlaubt' });
  const ip = (req.headers.get(k.ipKopf) ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '?').trim();
  const angemeldet = sitzungGueltig(cookieWert(req), k.geheimnis, deps.jetzt());

  if (aktion === 'login' && req.method === 'POST') {
    const t = deps.jetzt();
    const f = versuche.get(ip);
    if (f && f.n >= 5 && f.bis > t) return antwort(429, { fehler: 'Zu viele Versuche. Später erneut.' }, { 'retry-after': '900' });
    let eingabe = ''; try { eingabe = String((await req.json()).passwort ?? '').slice(0, 200); } catch { /* leer */ }
    if (await pruefePasswort(eingabe, k.hash)) {
      versuche.delete(ip);
      const c = `pa_web=${neueSitzung(k.geheimnis, t)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SITZUNG_SEKUNDEN}`;
      return antwort(200, { ok: true }, { 'set-cookie': c });
    }
    versuche.set(ip, { n: (f && f.bis > t ? f.n : 0) + 1, bis: t + 15 * 60_000 });
    await deps.sleep(600);
    return antwort(401, { fehler: 'Falsches Passwort.' });
  }
  if (aktion === 'logout' && req.method === 'POST') return antwort(200, { ok: true }, { 'set-cookie': 'pa_web=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  if (!angemeldet) return antwort(401, { fehler: 'Bitte anmelden.' });
  try {
    if (aktion === 'status' && req.method === 'GET') return antwort(200, await ermittleStatus(k, deps));
    if (aktion === 'start' && req.method === 'POST') {
      const r = await starten(k, deps);
      return antwort(r.code, r.code < 300 ? { zustand: 'startet', hinweis: r.text } : { fehler: r.text });
    }
    if (aktion === 'not-aus' && req.method === 'POST') {
      if (deps.notAusStarten) { await deps.notAusStarten(req); return antwort(202, { zustand: 'sichert', hinweis: 'Not-aus läuft im Hintergrund (Abbild, Prüfung, Löschen).' }); }
      return antwort(501, { fehler: 'Kein Hintergrundauftrag verdrahtet' });
    }
  } catch (e) {
    return antwort(502, { fehler: String(e?.message ?? e).replaceAll(k.token, '***') });
  }
  return antwort(404, { fehler: 'unbekannt' });
}

/** Hintergrundauftrag (Netlify `*-background`): prüft Sitzung und Herkunft selbst, dann notAus(). */
export async function notAusAuftrag(req, depsIn = {}) {
  const deps = { env: process.env, fetch: globalThis.fetch, sleep: ms => new Promise(r => setTimeout(r, ms)), jetzt: Date.now, ...depsIn };
  const k = leseKonfig(deps.env);
  if (konfigFehler(k) || req.method !== 'POST' || !k.origins.includes((req.headers.get('origin') ?? '').toLowerCase()) || req.headers.get('x-pa-web') !== '1' || !sitzungGueltig(cookieWert(req), k.geheimnis, deps.jetzt())) return antwort(403, { fehler: 'abgelehnt' });
  try { return antwort(200, { ergebnis: await notAus(k, deps) }); } catch (e) { return antwort(502, { fehler: String(e?.message ?? e).replaceAll(k.token, '***') }); }
}
