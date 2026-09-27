/**
 * Bausteine für die ONLINE-Browserprüfungen.
 *
 * ## Warum es diese Datei gibt
 *
 * Mehrere Online-Spezifikationen brauchen dieselben vier Schritte: einen
 * Serverprozess starten, ein Match im Browser hochfahren, den ZWEITEN MENSCHEN
 * dazusetzen und auf den eigenen Zug warten. Diese Schritte standen bisher in
 * jeder Spec neu (`multiplayer.spec.mjs`, `prediction-online.spec.mjs`); hier
 * stehen sie einmal, damit die Spezifikationen selbst nur noch ihr Prüfthema
 * enthalten.
 *
 * **Es gibt keine Bot-KI:** Die Lobby startet erst, wenn JEDES Team einen
 * verbundenen Menschen hat (`LobbyManager.alleTeamsBesetzt`). Der zweite Mensch
 * ist deshalb keine Bequemlichkeit, sondern die Startbedingung des Matches.
 */
import { spawn } from 'node:child_process';
import { zweiterMensch } from './zweiter-mensch.mjs';

/**
 * Startet den echten Serverprozess und wartet auf `/healthz`.
 *
 * @param {object} optionen
 * @param {number} optionen.port
 * @param {string} optionen.repoRoot - Wurzel des Repos (cwd des Servers)
 * @returns {Promise<{process: import('node:child_process').ChildProcess, log: () => string}>}
 */
export async function starteTestserver({ port, repoRoot }) {
  if (!Number.isInteger(port) || port <= 0) throw new Error('starteTestserver braucht einen Port');
  if (!repoRoot) throw new Error('starteTestserver braucht repoRoot');

  let log = '';
  const process_ = spawn(process.execPath, ['scripts/server.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process_.stdout.on('data', chunk => { log += chunk.toString(); });
  process_.stderr.on('data', chunk => { log += chunk.toString(); });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const antwort = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (antwort.ok) return { process: process_, log: () => log };
    } catch { /* Server startet noch */ }
    await new Promise(r => setTimeout(r, 200));
  }
  process_.kill('SIGTERM');
  throw new Error(`Server wurde nicht rechtzeitig bereit.\nLog:\n${log}`);
}

/** Beendet einen Serverprozess aus `starteTestserver`. */
export async function stoppeTestserver(process_) {
  if (!process_) return;
  process_.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
}

/**
 * Hängt sich an `HUD#log` und schreibt jede Meldung mit.
 *
 * Warum das nötig ist: Der Live-Bereich führt nur eine begrenzte Zahl Zeilen
 * (`LOG_LIMIT`), ältere fallen heraus. Ein Test, der eine Meldung erst nach dem
 * Zeichnen liest, hängt davon ab, WANN er hinsieht — genau die Flakiness, die den
 * Geschütz-Test einmal getroffen hat. Der Haken ist derselbe Weg, den das Spiel
 * nimmt (`#ereignisKontext()` reicht `hud` an `client/ereignisse.js`), nur
 * mitgeschrieben.
 *
 * Zusätzlich wird je Meldung festgehalten, ob sie in DIESEM Augenblick in der
 * Liste stand (`imDom`). Das ist kein Beiwerk: `HUD#log` fügt die Zeile synchron
 * ein (`hud.js`: `list.prepend(...)`), aber im Online-Match überschwemmen die
 * `landed`-Ereignisse das Protokoll — gemessen 172 `landed` in 600 Takten
 * (~17 je Sekunde) OHNE jede Eingabe. Die Liste führt 40 Zeilen, eine wichtige
 * Meldung fällt damit nach rund zwei Sekunden heraus. Eine spätere Abfrage des
 * DOM von außen fand die Zeile deshalb nicht mehr, obwohl sie angezeigt wurde
 * (im ersten Lauf dieser Spezifikationen genau so passiert). Die synchrone
 * Prüfung ist der ehrliche Ersatz.
 *
 * @returns {Promise<void>}
 */
export async function hakeHudLog(page) {
  await page.evaluate(() => {
    const hud = window.__PA__.game.hud;
    window.__HUD_LOG__ = [];
    // Nur EINMAL haken: ein zweiter Aufruf würde den ersten Haken umwickeln.
    if (hud.__protokolliert) return;
    const original = hud.log.bind(hud);
    hud.log = (text, art) => {
      // ERST einfügen — sonst prüfte man das DOM vor der Anzeige.
      const ergebnis = original(text, art);
      const liste = document.getElementById('log-list');
      window.__HUD_LOG__.push({
        text: String(text),
        art: art ?? null,
        t: Date.now(),
        imDom: liste ? liste.textContent.includes(String(text)) : null,
      });
      return ergebnis;
    };
    hud.__protokolliert = true;
  });
}

/**
 * Schneidet die WebSocket-Verbindung des Browsers mit und schreibt JEDE
 * Steuernachricht des Servers mit — roh, in der Reihenfolge des Eingangs.
 *
 * Warum das der schärfste Beleg ist: Der Browser sieht damit genau das, was der
 * Server über die Leitung schickt (Textrahmen = JSON-Steuernachrichten,
 * Binärrahmen = Snapshots). „Der Server hat reagiert" ist damit keine Folgerung
 * aus der Anzeige mehr, sondern ein mitgeschriebener Rahmen. Die Nachrichten
 * werden UNVERÄNDERT durchgereicht — der Mitschnitt ändert das Spiel nicht.
 *
 * Muss VOR der Verbindung installiert werden (`page.goto`).
 *
 * @returns {Promise<Array<object>>} Liste der empfangenen Steuernachrichten
 */
export async function schneideServernachrichtenMit(page) {
  const nachrichten = [];
  await page.routeWebSocket(/\/ws/, ws => {
    const server = ws.connectToServer();
    // Client -> Server: unverändert durchreichen.
    ws.onMessage(message => server.send(message));
    server.onMessage(message => {
      if (typeof message === 'string') {
        try { nachrichten.push(JSON.parse(message)); } catch { /* kein JSON: kein Steuerrahmen */ }
      }
      ws.send(message);
    });
  });
  return nachrichten;
}

/**
 * Fährt ein Online-Match im Browser hoch und setzt den zweiten Menschen dazu.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} optionen
 * @param {string} optionen.serverUrl
 * @param {number} optionen.port
 * @param {number} optionen.seed
 * @param {string} optionen.name - Name der eigenen Figur (steht in den Meldungen)
 * @param {number} [optionen.preset]
 * @returns {Promise<import('ws').WebSocket>} Socket des zweiten Menschen
 */
export async function starteOnlineMatch(page, {
  serverUrl, port, seed, name = 'Tester', preset = 'hills', teams = 2, playersPerTeam = 1,
} = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await hakeHudLog(page);

  await page.evaluate(
    optionen => window.__PA__.startOnline(optionen),
    { serverUrl, teams, playersPerTeam, preset, seed, name },
  );

  await page.waitForFunction(
    () => window.__PA__.getNetwork()?.state === 'connected',
    null,
    { timeout: 20_000 },
  );

  const zweiter = await zweiterMensch({
    port,
    lobbyId: await page.evaluate(() => window.__PA__.game.lobbyId),
    name: 'Gegenseite',
  });
  page.once('close', () => zweiter.close());

  // Ohne Snapshots gibt es kein Terrain, keine Bestände und keine Anzeige.
  await page.waitForFunction(
    () => (window.__PA__.getNetwork()?.stats?.snapshotsReceived ?? 0) > 3,
    null,
    { timeout: 20_000 },
  );

  return zweiter;
}

/**
 * Wartet, bis der eigene Client am Zug ist.
 *
 * Die Zugzeit beträgt online 30 s (Vorgabe des Motors). Ist die Gegenseite
 * zuerst am Zug und feuert nie, läuft ihr Zug ab — danach ist der eigene Zug
 * da. Die Frist ist deshalb größer als eine Zugzeit, plus Reserve für den
 * langsamen Rechner.
 */
export async function warteAufEigenenZug(page, timeoutMs = 90_000) {
  await page.waitForFunction(
    () => window.__PA__.getNetwork()?.isMyTurn === true,
    null,
    { timeout: timeoutMs },
  );
}

/** Alle mitgeschriebenen HUD-Meldungen (siehe `hakeHudLog`). */
export async function hudMeldungen(page) {
  return page.evaluate(() => window.__HUD_LOG__ ?? []);
}
