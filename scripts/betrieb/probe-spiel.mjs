#!/usr/bin/env node
/**
 * probe-spiel.mjs — spielt ein kurzes ECHTES Online-Match gegen einen laufenden Server
 * und prüft dabei die Dinge, die der Audit vom 2026-10-09 gefunden hat.
 *
 * Gedacht für die Abnahme auf einem gemieteten Knoten (`abnahme-knoten.sh`), läuft
 * aber überall: `node scripts/betrieb/probe-spiel.mjs --url http://127.0.0.1:3000`.
 *
 * Zwei Menschen (zwei WebSocket-Clients, keine Bot-KI), abwechselnd am Zug. Geprüft:
 *   1. Die Lobby startet, beide bekommen Snapshots (Rate gemessen, Soll 20 Hz).
 *   2. Schüsse werden angenommen, Gelände wird zerstört (terrain_destroyed).
 *   3. Der Server schickt mit jedem Vollsnapshot einen Terrain-Hash.
 *   4. WIEDEREINSTIEG: Client A trennt und verbindet sich mit seinem Token neu; der
 *      Server liefert die Krater nach (WELCOME.craters) — Anzahl wie beobachtet.
 *   5. Nach dem Spiel gibt `/healthz` weiter „ok".
 *
 * Ausgabe: EIN JSON-Objekt auf stdout, Exit 0 nur wenn alle Prüfungen bestehen.
 *
 * Optionen: --url, --seed (Vorgabe 777), --preset (Vorgabe mountains),
 *           --schuesse (Vorgabe 6), --frist (Sekunden je Zug, Vorgabe 40)
 */
import { WebSocket } from 'ws';
import {
  CONTROL, controlMessage, parseControlMessage, decodeSnapshot,
} from '../../src/shared/protocol.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((liste, wert, i, alle) => {
  if (wert.startsWith('--')) liste.push([wert.slice(2), alle[i + 1] ?? true]);
  return liste;
}, []));
const URL_ = String(args.url ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const SEED = Number(args.seed ?? 777);
const PRESET = String(args.preset ?? 'mountains');
const SCHUESSE = Number(args.schuesse ?? 6);
const FRIST_MS = Number(args.frist ?? 40) * 1000;
const WS_URL = URL_.replace(/^http/, 'ws') + '/ws';

const warte = ms => new Promise(r => setTimeout(r, ms));
const bis = async (bedingung, ms, was) => {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { const wert = bedingung(); if (wert) return wert; await warte(25); }
  throw new Error(`Zeitüberschreitung: ${was}`);
};

function verbinde(name) {
  const c = {
    name, ankuenfte: [], steuer: [], voll: null, letzter: null, welcome: null,
    socket: new WebSocket(WS_URL),
  };
  c.socket.on('message', (roh, binaer) => {
    if (binaer) {
      const s = decodeSnapshot(roh);
      if (!s) return;
      c.ankuenfte.push(performance.now());
      c.letzter = s;
      if (s.entities.length >= 2 && s.entities.every(e => e.x !== 0 || e.y !== 0)) c.voll = s;
      return;
    }
    const m = parseControlMessage(roh);
    if (!m) return;
    c.steuer.push(m);
    if (m.t === CONTROL.WELCOME && m.entityId) c.welcome = m;
  });
  c.offen = new Promise((ok, fehler) => { c.socket.once('open', ok); c.socket.once('error', fehler); });
  c.sende = (t, nutzlast) => c.socket.send(controlMessage(t, nutzlast));
  return c;
}

const pruefungen = [];
const pruefe = (name, ok, beleg) => { pruefungen.push({ name, ok: Boolean(ok), beleg }); };

async function haupt() {
  const erstellt = await (await fetch(`${URL_}/api/lobby/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: SEED, preset: PRESET }),
  })).json();
  const lobbyId = erstellt.lobby.id;

  let a = verbinde('A'); const b = verbinde('B');
  await Promise.all([a.offen, b.offen]);
  a.sende(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token: erstellt.player.token });
  b.sende(CONTROL.JOIN_LOBBY, { lobbyId, name: 'B' });
  await bis(() => a.welcome && b.welcome, 15_000, 'Beitritt beider Spieler');
  await bis(() => a.voll && b.voll, 15_000, 'erste vollständige Snapshots');
  const idA = a.welcome.entityId; const idB = b.welcome.entityId;

  // --- Schüsse abwechselnd
  let angenommen = 0; let abgelehnt = 0;
  const leistungen = [55, 70, 85, 62, 78, 90];
  for (let i = 0; i < SCHUESSE; i++) {
    const aktiv = a.letzter.entities.find(e => e.isActiveTurn)?.entityId;
    const spieler = aktiv === idA ? a : b;
    const gegner = (aktiv === idA ? b : a).welcome.entityId;
    const ich = a.voll.entities.find(e => e.entityId === aktiv);
    const du = a.voll.entities.find(e => e.entityId === gegner);
    const winkel = (du?.x ?? 0) >= (ich?.x ?? 0) ? 0.9 : Math.PI - 0.9;
    const fehlerVorher = spieler.steuer.filter(m => m.t === CONTROL.ERROR).length;
    spieler.sende(CONTROL.INPUT, { angle: winkel, power: leistungen[i % leistungen.length], tick: spieler.letzter.tick });
    await warte(300);
    const fehlerNachher = spieler.steuer.filter(m => m.t === CONTROL.ERROR).length;
    if (fehlerNachher > fehlerVorher) abgelehnt += 1; else angenommen += 1;
    // Auf den Zugwechsel warten.
    await bis(() => a.letzter.entities.find(e => e.isActiveTurn)?.entityId !== aktiv, FRIST_MS, `Zugwechsel nach Schuss ${i + 1}`)
      .catch(() => null);
  }
  const krater = a.steuer.filter(m => m.t === 'terrain_destroyed').length;
  pruefe('Schüsse angenommen', angenommen >= Math.ceil(SCHUESSE / 2), { angenommen, abgelehnt });
  pruefe('Gelände wurde zerstört', krater > 0, { krater });

  // --- Terrain-Hash vom Server
  await bis(() => a.steuer.some(m => m.t === 'terrain_hash'), 8_000, 'terrain_hash').catch(() => null);
  const hashes = a.steuer.filter(m => m.t === 'terrain_hash');
  pruefe('Server schickt Terrain-Hash', hashes.length > 0, { anzahl: hashes.length, letzter: hashes.at(-1) ?? null });

  // --- Snapshot-Rate (nur die Zeit seit dem Beitritt, ohne Wartezeiten zwischen Zügen)
  const dauer = a.ankuenfte.at(-1) - a.ankuenfte[0];
  const hz = ((a.ankuenfte.length - 1) / dauer) * 1000;
  pruefe('Snapshot-Rate nahe 20 Hz', hz > 17 && hz < 23, { hz: Number(hz.toFixed(1)), snapshots: a.ankuenfte.length });

  // --- Wiedereinstieg
  const kraterVorTrennung = krater;
  a.socket.close();
  await warte(500);
  a = verbinde('A2');
  await a.offen;
  a.sende(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token: erstellt.player.token });
  await bis(() => a.welcome, 15_000, 'Wiedereinstieg (WELCOME)');
  const geliefert = a.welcome.craters?.length ?? -1;
  pruefe('Wiedereinstieg: Platz wiederhergestellt', a.welcome.entityId === idA && a.welcome.resumed === true,
    { entityId: a.welcome.entityId, erwartet: idA, resumed: a.welcome.resumed });
  pruefe('Wiedereinstieg: Krater nachgeliefert', geliefert >= kraterVorTrennung && geliefert > 0,
    { geliefert, beobachtetVorTrennung: kraterVorTrennung });

  const gesund = await (await fetch(`${URL_}/healthz`)).json();
  pruefe('/healthz ok', gesund.status === 'ok', gesund);

  a.socket.close(); b.socket.close();
  const ok = pruefungen.every(p => p.ok);
  console.log(JSON.stringify({ ok, seed: SEED, preset: PRESET, lobbyId, idB, pruefungen }, null, 2));
  process.exit(ok ? 0 : 1);
}

haupt().catch(fehler => {
  console.log(JSON.stringify({ ok: false, fehler: String(fehler?.message ?? fehler), pruefungen }, null, 2));
  process.exit(1);
});
