/**
 * Der ZWEITE MENSCH in einem Online-Match — als roher Socket.
 *
 * ## Warum es diese Datei gibt
 *
 * **Es gibt keine Bot-KI.** Ein Teams ohne verbundenen Menschen lässt das Match
 * nicht starten (`LobbyManager.alleTeamsBesetzt`), und unbesetzte Teams werden
 * von NIEMANDEM übernommen. Bis zum 2026-09-20 sprang hier ein Server-Bot ein —
 * die E2E-Tests der Online-Spezifikationen verließen sich darauf und liefen mit
 * EINEM Browser. Mit dem Modell „Team = Mensch" brauchen sie einen zweiten
 * Spieler, sonst kommt kein einziger Snapshot.
 *
 * Ein ganzer zweiter Browserkontext wäre dafür nur teurer: Es genügt ein Socket,
 * der beitritt und den Zug der Gegenseite aussitzt.
 *
 * ## Beispiel
 *
 *     const zweiter = await zweiterMensch({
 *       port: SERVER_PORT,
 *       lobbyId: await page.evaluate(() => window.__PA__.game.lobbyId),
 *     });
 *     …
 *     zweiter.close();
 */
import { WebSocket } from 'ws';
import { CONTROL, controlMessage, parseControlMessage } from '../../../src/shared/protocol.js';

/**
 * Tritt der Lobby bei und kehrt zurück, sobald der Server den Beitritt bestätigt.
 *
 * @param {object} optionen
 * @param {number} optionen.port - Port des Testservers
 * @param {string} optionen.lobbyId
 * @param {string} [optionen.name]
 * @param {number} [optionen.fristMs] - Zeitlimit für den Beitritt
 * @returns {Promise<WebSocket>} der offene Socket (vom Test zu schließen)
 */
export async function zweiterMensch({
  port, lobbyId, name = 'Zweiter', fristMs = 15_000,
} = {}) {
  if (!port) throw new Error('zweiterMensch braucht einen Port');
  if (!lobbyId) throw new Error('zweiterMensch braucht eine Lobby-ID');

  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((aufloesen, ablehnen) => {
    socket.once('open', aufloesen);
    socket.once('error', ablehnen);
  });

  const willkommen = new Promise((aufloesen, ablehnen) => {
    const frist = setTimeout(
      () => ablehnen(new Error(`Timeout beim Warten auf ${CONTROL.WELCOME}`)),
      fristMs,
    );
    const beiNachricht = roh => {
      const nachricht = parseControlMessage(roh);
      if (nachricht?.t !== CONTROL.WELCOME) return;
      clearTimeout(frist);
      socket.off('message', beiNachricht);
      aufloesen(nachricht);
    };
    socket.on('message', beiNachricht);
  });

  socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId, name }));
  const antwort = await willkommen;
  if (!antwort.token) {
    socket.close();
    throw new Error('Der zweite Mensch hat kein Token erhalten');
  }
  return socket;
}
