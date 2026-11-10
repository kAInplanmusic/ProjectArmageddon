#!/usr/bin/env node
/**
 * Starter — kleine, passwortgeschützte Startseite für den Spielserver auf Abruf.
 *
 * Läuft auf dem dauerhaft laufenden Rechner des Auftraggebers („brain“), NICHT auf dem
 * Hetzner-Server. Drei Knöpfe — Hochfahren, Status, Not-aus — rufen
 * `scripts/betrieb/server-hochfahren.sh` (hochfahren | status | not-aus).
 * Keine Abhängigkeiten, nur Node ≥ 22.
 *
 * Konfiguration NUR über Umgebungsvariablen (systemd `EnvironmentFile`, Rechte 0600, nie im Repo):
 *   HCLOUD_TOKEN                   Hetzner-Projekt-Token; wird nur an das Skript weitergereicht
 *   PA_STARTER_PASSWORT_HASH       `scrypt$<N>$<salz-hex>$<hash-hex>` (erzeugt `passwort-hash.mjs`)
 *   PA_STARTER_GEHEIMNIS           zufälliger Schlüssel für die Sitzungs-Cookies (mind. 32 Zeichen)
 *   PA_STARTER_PORT=8787  PA_STARTER_HOST=127.0.0.1
 *   PA_STARTER_PROXY=1             hinter Tailscale Serve/Funnel oder Caddy: X-Forwarded-For/-Proto auswerten
 *   PA_STARTER_SKRIPT              Pfad zu server-hochfahren.sh (Vorgabe: Nachbarordner)
 *   PA_DOMAIN, PA_IDLE_MINUTES …   werden an das Skript durchgereicht (siehe dessen Kopf)
 *
 * Schutz: Passwort (scrypt, zeitkonstanter Vergleich), Sperre nach 5 Fehlversuchen je Adresse
 * für 15 Minuten und ein globales Limit, Sitzung 12 h (HttpOnly, SameSite=Strict, Secure hinter
 * https), CSRF-Wert je Sitzung, ein Auftrag gleichzeitig, keine Shell (spawn mit Argumentliste).
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AKTIONEN = Object.freeze(['hochfahren', 'status', 'not-aus']);
const DURCHREICHEN = [
  'HCLOUD_TOKEN', 'PA_DOMAIN', 'PA_ACME_EMAIL', 'PA_NAME', 'PA_SERVER_TYP', 'PA_ORT', 'PA_IDLE_MINUTES', 'PA_GRACE_MINUTES',
  'PA_MAX_RUNTIME_MINUTES', 'PA_MAX_MACHINE_MINUTES', 'PA_ABBILD_BEHALTEN', 'PA_GIT_URL', 'PA_GIT_REF', 'PA_SSH_PUBKEY',
  'PA_EXTRA_ENV', 'PA_HCLOUD_API', 'PA_MAX_EUR_MONAT',
];

export function hashePasswort(passwort, salz = randomBytes(16)) {
  const N = 16384;
  return `scrypt$${N}$${salz.toString('hex')}$${scryptSync(passwort, salz, 32, { N }).toString('hex')}`;
}

export function pruefePasswort(passwort, gespeichert) {
  const [art, n, salz, hash] = String(gespeichert ?? '').split('$');
  if (art !== 'scrypt' || !n || !salz || !hash) return false;
  try {
    const soll = Buffer.from(hash, 'hex');
    const ist = scryptSync(passwort, Buffer.from(salz, 'hex'), soll.length, { N: Number(n) });
    return ist.length === soll.length && timingSafeEqual(ist, soll);
  } catch { return false; }
}

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SEITE = (inhalt) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProjectArmageddon Start</title><style>body{font:16px system-ui;max-width:34rem;margin:2rem auto;padding:0 1rem;background:#14161a;color:#e8e8e8}
button,input{font:inherit;padding:.8rem 1rem;margin:.3rem 0;border-radius:.4rem;border:1px solid #555;background:#232830;color:#fff;width:100%}
button.rot{background:#7a1f1f}pre{background:#0b0c0e;padding:.8rem;overflow:auto;white-space:pre-wrap;font-size:.8rem;max-height:22rem}a{color:#8cf}</style></head><body>
<h1>ProjectArmageddon</h1>${inhalt}</body></html>`;

export function erzeugeStarter(optionen = {}) {
  const env = optionen.env ?? process.env;
  const hash = env.PA_STARTER_PASSWORT_HASH ?? '';
  const geheimnis = env.PA_STARTER_GEHEIMNIS ?? '';
  if (!hash || geheimnis.length < 32) throw new Error('PA_STARTER_PASSWORT_HASH und PA_STARTER_GEHEIMNIS (>= 32 Zeichen) sind Pflicht');
  const skript = env.PA_STARTER_SKRIPT ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'server-hochfahren.sh');
  const hinterProxy = env.PA_STARTER_PROXY === '1';
  const jetzt = optionen.jetzt ?? Date.now;
  const sitzungen = new Map();      // id -> { csrf, bis }
  const fehlversuche = new Map();   // adresse -> { n, bis }
  let global = { n: 0, ab: jetzt() };
  const job = { laeuft: false, aktion: '', start: 0, ende: 0, code: null, zeilen: [] };

  const adresse = req => (hinterProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim() : '') || req.socket.remoteAddress || '?';
  const signiere = id => createHmac('sha256', geheimnis).update(id).digest('base64url');
  const cookieLesen = req => {
    const m = /(?:^|;\s*)pa_sitzung=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? '');
    if (!m) return null;
    const soll = Buffer.from(signiere(m[1])); const ist = Buffer.from(m[2]);
    if (soll.length !== ist.length || !timingSafeEqual(soll, ist)) return null;
    const s = sitzungen.get(m[1]);
    return s && s.bis > jetzt() ? { id: m[1], ...s } : null;
  };
  const kopf = (typ = 'text/html; charset=utf-8', extra = {}) => ({
    'content-type': typ, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; script-src 'unsafe-inline'", ...extra,
  });
  const antwort = (res, code, text, typ, extra) => { res.writeHead(code, kopf(typ, extra)); res.end(text); };
  const koerper = req => new Promise((ok, nein) => {
    let roh = '';
    req.on('data', c => { roh += c; if (roh.length > 4096) { nein(new Error('zu gross')); req.destroy(); } });
    req.on('end', () => ok(new URLSearchParams(roh)));
    req.on('error', nein);
  });

  const startJob = (aktion) => {
    job.laeuft = true; job.aktion = aktion; job.start = jetzt(); job.ende = 0; job.code = null; job.zeilen = [];
    const umgebung = { PATH: env.PATH ?? process.env.PATH, HOME: env.HOME ?? process.env.HOME, PA_POLL_SEKUNDEN: '10' };
    for (const k of DURCHREICHEN) if (env[k] !== undefined) umgebung[k] = env[k];
    const kind = spawn('bash', [skript, aktion], { env: umgebung, stdio: ['ignore', 'pipe', 'pipe'] });
    const lies = d => { for (const z of String(d).split('\n')) if (z) { job.zeilen.push(z.slice(0, 400)); if (job.zeilen.length > 300) job.zeilen.shift(); } };
    kind.stdout.on('data', lies); kind.stderr.on('data', lies);
    kind.on('error', e => { lies(`Start fehlgeschlagen: ${e.message}`); job.laeuft = false; job.code = 127; job.ende = jetzt(); });
    kind.on('close', code => { job.laeuft = false; job.code = code; job.ende = jetzt(); });
  };

  const jobText = () => esc(job.zeilen.slice(-80).join('\n')) || '(noch nichts ausgeführt)';
  const startseite = s => SEITE(`<p>Spielserver auf Abruf. Nach ${esc(env.PA_IDLE_MINUTES ?? '15')} Minuten ohne Verbindung sichert er sich selbst und verschwindet.</p>
<form method="post" action="/aktion"><input type="hidden" name="csrf" value="${s.csrf}">
<button name="aktion" value="hochfahren"${job.laeuft ? ' disabled' : ''}>Hochfahren</button>
<button name="aktion" value="status"${job.laeuft ? ' disabled' : ''}>Status</button>
<button class="rot" name="aktion" value="not-aus"${job.laeuft ? ' disabled' : ''} onclick="return confirm('Not-aus: Server herunterfahren, Abbild prüfen, löschen?')">Not-aus</button></form>
<h2>Letzter Auftrag: ${esc(job.aktion || '-')} ${job.laeuft ? '(läuft …)' : job.code === null ? '' : `(Ende, Code ${job.code})`}</h2>
<pre id="log">${jobText()}</pre><form method="post" action="/abmelden"><input type="hidden" name="csrf" value="${s.csrf}"><button>Abmelden</button></form>
<script>if(${job.laeuft})setTimeout(()=>location.reload(),8000)</script>`);
  const loginSeite = (meldung = '') => SEITE(`<form method="post" action="/login"><p>${esc(meldung)}</p>
<input type="password" name="passwort" placeholder="Passwort" autocomplete="current-password" autofocus><button>Anmelden</button></form>`);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const s = cookieLesen(req);
      const wer = adresse(req);
      if (req.method === 'GET' && url.pathname === '/') return antwort(res, 200, s ? startseite(s) : loginSeite());
      if (req.method === 'GET' && url.pathname === '/gesund') return antwort(res, 200, 'ok', 'text/plain');
      if (req.method === 'POST' && url.pathname === '/login') {
        const t = jetzt();
        const f = fehlversuche.get(wer);
        if (t - global.ab > 60_000) global = { n: 0, ab: t };
        if ((f && f.n >= 5 && f.bis > t) || global.n >= 30) return antwort(res, 429, loginSeite('Zu viele Versuche. Später erneut.'), undefined, { 'retry-after': '900' });
        const form = await koerper(req);
        if (pruefePasswort(form.get('passwort') ?? '', hash)) {
          fehlversuche.delete(wer);
          const id = randomBytes(24).toString('base64url');
          sitzungen.set(id, { csrf: randomBytes(16).toString('hex'), bis: t + 12 * 3600_000 });
          const secure = hinterProxy && req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
          return antwort(res, 303, '', 'text/plain', { location: '/', 'set-cookie': `pa_sitzung=${id}.${signiere(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}` });
        }
        global.n++;
        fehlversuche.set(wer, { n: (f && f.bis > t ? f.n : 0) + 1, bis: t + 15 * 60_000 });
        return antwort(res, 401, loginSeite('Falsches Passwort.'));
      }
      if (req.method === 'POST' && (url.pathname === '/aktion' || url.pathname === '/abmelden')) {
        if (!s) return antwort(res, 401, loginSeite('Bitte anmelden.'));
        const form = await koerper(req);
        const c = Buffer.from(form.get('csrf') ?? ''); const soll = Buffer.from(s.csrf);
        if (c.length !== soll.length || !timingSafeEqual(c, soll)) return antwort(res, 403, 'CSRF', 'text/plain');
        if (url.pathname === '/abmelden') { sitzungen.delete(s.id); return antwort(res, 303, '', 'text/plain', { location: '/', 'set-cookie': 'pa_sitzung=; Max-Age=0; Path=/' }); }
        const aktion = form.get('aktion');
        if (!AKTIONEN.includes(aktion)) return antwort(res, 400, 'unbekannte Aktion', 'text/plain');
        if (job.laeuft) return antwort(res, 409, 'Es läuft schon ein Auftrag.', 'text/plain');
        startJob(aktion);
        return antwort(res, 303, '', 'text/plain', { location: '/' });
      }
      return antwort(res, 404, 'nicht gefunden', 'text/plain');
    } catch (e) {
      return antwort(res, 400, 'Fehler', 'text/plain');
    }
  });
  server.job = job;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = erzeugeStarter();
  const port = Number(process.env.PA_STARTER_PORT ?? 8787);
  const host = process.env.PA_STARTER_HOST ?? '127.0.0.1';
  s.listen(port, host, () => console.log(`Starter lauscht auf http://${host}:${port}`));
}
