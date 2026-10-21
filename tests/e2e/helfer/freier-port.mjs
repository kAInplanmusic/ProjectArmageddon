import { createServer } from 'node:net';

/**
 * Fragt das Betriebssystem nach einem freien TCP-Port (Server auf Port 0, sofort wieder geschlossen).
 *
 * Die Online-Spezifikationen starten je einen eigenen Spielserver. Feste Ports (3210, 3211, 3217, 3231 …) kollidierten,
 * sobald zwei Läufe parallel liefen (mehrere Agenten, mehrere Worktrees) oder zwei Specs dieselbe Nummer trugen
 * (3231, 3211 standen doppelt). Mit einem freien Port je Spec-Datei bleiben die Prüfungen unverändert.
 *
 * @returns {Promise<number>}
 */
export function freierPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
