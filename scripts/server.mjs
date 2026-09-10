#!/usr/bin/env node
/**
 * Startet den autoritativen Spielserver.
 * Aufruf: npm run server  [PORT=3000]
 */
import { startServer } from '../src/server/gameServer.js';

const port = Number(process.env.PORT ?? 3000);
const { url, server } = await startServer({ port });

console.log(`Project Armageddon Server läuft auf ${url}`);
console.log(`  WebSocket : ${url.replace('http', 'ws')}/ws`);
console.log(`  Health    : ${url}/healthz`);
console.log(`  Lobby-API : POST ${url}/api/lobby/create`);

const shutdown = async signal => {
  console.log(`\n${signal} empfangen — fahre herunter`);
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
