#!/usr/bin/env node
/**
 * Smoke-Test nach einem Deploy (REL-1): Lebt der Server, und ist es der richtige Build?
 *
 *     node scripts/release/smoke.mjs --url http://127.0.0.1:3000 --version 0.9.0 [--gitsha 2413c4f] [--ohne-lobby] [--frist 60]
 *
 * Prüft in dieser Reihenfolge (Abbruch beim ersten Fehler):
 *   1. `/healthz` antwortet `status: ok` und `healthy: true` — wartet dafür bis `--frist` Sekunden
 *      (der Server stellt nach dem Start erst den Zustand wieder her);
 *   2. `/healthz` meldet die erwartete Version (und, wenn angegeben, den Git-Stand);
 *   3. `/` liefert die Oberfläche (HTTP 200, HTML);
 *   4. WebSocket-Handshake auf `/ws` (HTTP 101) — ohne Bibliothek, nur `node:http`;
 *   5. eine Lobby anlegen und abfragen (`POST /api/lobby/create`, `GET /api/lobby/<id>`).
 *      Die Lobby bleibt leer und wird nach `PA_LOBBY_LEER_MS` (Vorgabe 15 min) entfernt.
 *      `--ohne-lobby` lässt den Schritt aus (z. B. wenn `PA_MAX_LOBBYS` erreicht ist).
 *
 * Ausgabe: eine Zeile je Prüfung, Exit 0 nur wenn alle bestehen. Eine tiefe Probe mit echtem
 * Match ist `scripts/betrieb/probe-spiel.mjs`.
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const warte = ms => new Promise(r => setTimeout(r, ms));

async function holeJson(url, init) {
  const antwort = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  const text = await antwort.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* kein JSON */ }
  return { status: antwort.status, json, text, typ: antwort.headers.get('content-type') ?? '' };
}

/** WebSocket-Handshake ohne Bibliothek: erwartet HTTP 101 auf `/ws`. */
export function wsHandshake(basis, { frist = 5000 } = {}) {
  const ziel = new URL('/ws', basis);
  const anfrage = ziel.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((ok, fehler) => {
    const req = anfrage(ziel, {
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
      timeout: frist,
    });
    req.on('upgrade', (antwort, socket) => { socket.destroy(); ok(antwort.statusCode); });
    req.on('response', antwort => { antwort.resume(); fehler(new Error(`kein Upgrade, HTTP ${antwort.statusCode}`)); });
    req.on('timeout', () => { req.destroy(new Error('Zeitüberschreitung')); });
    req.on('error', fehler);
    req.end();
  });
}

/**
 * @param {{url: string, version?: string, gitSha?: string, ohneLobby?: boolean, frist?: number, log?: (s: string) => void}} opt
 * @returns {Promise<{ok: boolean, pruefungen: {name: string, ok: boolean, beleg: string}[]}>}
 */
export async function fuehreSmokeAus(opt) {
  const basis = String(opt.url).replace(/\/+$/, '');
  const log = opt.log ?? (s => console.log(s));
  const pruefungen = [];
  const pruefe = (name, ok, beleg) => {
    pruefungen.push({ name, ok, beleg });
    log(`${ok ? 'OK    ' : 'FEHLER'} ${name}: ${beleg}`);
    return ok;
  };
  const ende = () => ({ ok: pruefungen.every(p => p.ok), pruefungen });

  // 1. Gesundheit (mit Wartezeit)
  const bis = Date.now() + (opt.frist ?? 60) * 1000;
  let health = null;
  let letzter = '';
  while (Date.now() < bis) {
    try {
      const r = await holeJson(`${basis}/healthz`);
      if (r.status === 200 && r.json?.status === 'ok' && r.json?.healthy === true) { health = r.json; break; }
      letzter = `HTTP ${r.status} ${r.text.slice(0, 120)}`;
    } catch (fehler) {
      letzter = fehler.message;
    }
    await warte(500);
  }
  if (!pruefe('healthz', Boolean(health), health ? `ok, ${health.lobbies} Lobbys, Laufzeit ${health.uptimeMs} ms` : letzter)) return ende();

  // 2. Version
  if (opt.version) {
    if (!pruefe('version', health.version === opt.version, `erwartet ${opt.version}, gemeldet ${health.version}`)) return ende();
  }
  if (opt.gitSha) {
    const gemeldet = String(health.build?.gitSha ?? '');
    if (!pruefe('gitSha', gemeldet.startsWith(opt.gitSha) || opt.gitSha.startsWith(gemeldet) && gemeldet.length >= 7,
      `erwartet ${opt.gitSha}, gemeldet ${gemeldet}`)) return ende();
  }

  // 3. Oberfläche
  try {
    const r = await holeJson(`${basis}/`);
    if (!pruefe('oberflaeche', r.status === 200 && r.typ.startsWith('text/html') && /<!doctype html>/i.test(r.text),
      `HTTP ${r.status}, ${r.typ}, ${r.text.length} Byte`)) return ende();
  } catch (fehler) {
    pruefe('oberflaeche', false, fehler.message);
    return ende();
  }

  // 4. WebSocket
  try {
    const code = await wsHandshake(basis);
    if (!pruefe('websocket', code === 101, `Handshake /ws HTTP ${code}`)) return ende();
  } catch (fehler) {
    pruefe('websocket', false, fehler.message);
    return ende();
  }

  // 5. Lobby
  if (!opt.ohneLobby) {
    try {
      const angelegt = await holeJson(`${basis}/api/lobby/create`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teams: 2, playersPerTeam: 1 }),
      });
      const id = angelegt.json?.lobby?.id;
      if (!pruefe('lobby_anlegen', angelegt.status === 201 && Boolean(id), `HTTP ${angelegt.status}, id ${id ?? '-'}`)) return ende();
      const gelesen = await holeJson(`${basis}/api/lobby/${encodeURIComponent(id)}`);
      pruefe('lobby_lesen', gelesen.status === 200 && gelesen.json?.lobby?.id === id, `HTTP ${gelesen.status}`);
    } catch (fehler) {
      pruefe('lobby', false, fehler.message);
    }
  }
  return ende();
}

function argumente(argv) {
  const opt = { url: 'http://127.0.0.1:3000', frist: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') opt.url = argv[++i];
    else if (a === '--version') opt.version = argv[++i];
    else if (a === '--gitsha') opt.gitSha = argv[++i];
    else if (a === '--frist') opt.frist = Number(argv[++i]);
    else if (a === '--ohne-lobby') opt.ohneLobby = true;
    else throw new Error(`Unbekannte Option: ${a}`);
  }
  return opt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const ergebnis = await fuehreSmokeAus(argumente(process.argv.slice(2)));
    console.log(ergebnis.ok ? 'Smoke-Test bestanden.' : 'Smoke-Test FEHLGESCHLAGEN.');
    process.exit(ergebnis.ok ? 0 : 1);
  } catch (fehler) {
    console.error(`smoke.mjs: ${fehler.message}`);
    process.exit(2);
  }
}
