import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('pruneDisconnected hat einen Produktionsaufrufer', () => {
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server', 'gameServer.js'), 'utf8');
  const lobby = fs.readFileSync(path.join(ROOT, 'src', 'server', 'lobby.js'), 'utf8');

  // pruneDisconnected ist definiert
  assert.ok(/pruneDisconnected\(/.test(lobby), 'pruneDisconnected muss definiert sein');

  // pruneLobbies ruft pruneDisconnected auf
  assert.ok(/pruneLobbies[\s\S]{0,200}pruneDisconnected/.test(server),
    'pruneLobbies muss pruneDisconnected aufrufen');

  // startPruning wird im Server-Start aufgerufen
  assert.ok(/startPruning\(\)/.test(server), 'startPruning muss existieren');
  assert.ok(/startPruning\(\)/.test(server) && server.includes('server.startPruning()'),
    'startPruning muss beim Start des Servers aufgerufen werden');
});
