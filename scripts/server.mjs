#!/usr/bin/env node
/**
 * Startet den autoritativen Spielserver.
 *
 * Aufruf: npm run server  [PORT=3000]
 *
 * Ausgabe ist strukturiert (eine JSON-Zeile je Ereignis, siehe
 * `src/server/logger.js`). Wer es im Terminal lesbarer mag:
 *
 *   LOG_FORMAT=pretty npm run server
 *   LOG_LEVEL=debug   npm run server     # auch Verbindungen und Trennungen
 *
 * Der Server selbst protokolliert über denselben Logger — die Startmeldungen
 * hier gehen bewusst durch `server.logger`, damit Format und Felder einheitlich
 * bleiben und LOG_FORMAT auch für sie gilt.
 */
import { startServer } from '../src/server/gameServer.js';

const port = Number(process.env.PORT ?? 3000);
const { url, server, restored } = await startServer({ port });

const logger = server.logger;

// Ein Datensatz statt fünf Zeilen: Der Startzustand gehört zusammen.
logger.info('server_ready', 'Server bereit', {
  url,
  websocket: `${url.replace('http', 'ws')}/ws`,
  health: `${url}/healthz`,
  lobbyApi: `POST ${url}/api/lobby/create`,
  persistence: server.persistence ? server.persistence.path : null,
  restored: restored ? restored.restored : 0,
  restoreSkipped: restored ? restored.skipped : 0,
  // Entschiedene Lobbys aus einer alten Sicherung (werden beim nächsten
  // Speichern entfernt) — sichtbar machen, sonst wirkt eine leere
  // Wiederherstellung wie ein Fehler.
  restoreSkippedFinished: restored?.skippedFinished ?? 0,
});

const shutdown = async signal => {
  logger.info('server_shutdown', 'Signal empfangen — fahre herunter', { signal });
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
