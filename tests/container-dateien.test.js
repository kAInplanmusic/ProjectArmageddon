/**
 * Container-Option (DEP-2) ohne Docker geprüft: Dockerfile, .dockerignore und deploy/compose.yaml
 * werden GELESEN, nicht gebaut. Gesichert wird, was ohne Docker-Daemon nachweisbar ist:
 * mehrstufig, nicht-root, nur Produktionsabhängigkeiten, HEALTHCHECK auf /healthz, jeder kopierte
 * Pfad existiert, die Laufzeitstufe enthält die ganze Import-Hülle des Servers, der Port ist nach
 * außen nur auf Loopback veröffentlicht.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WURZEL } from '../scripts/release/bauinfo.mjs';
import { importHuelle } from '../scripts/release/paket.mjs';

const DOCKERFILE = readFileSync(join(WURZEL, 'Dockerfile'), 'utf8');
const IGNORE = readFileSync(join(WURZEL, '.dockerignore'), 'utf8').split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#'));
const COMPOSE = readFileSync(join(WURZEL, 'deploy/compose.yaml'), 'utf8');

/** Anweisungen ohne Kommentare, Fortsetzungszeilen zusammengezogen. */
function anweisungen(text) {
  return text.replace(/\\\n/g, ' ').split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#'));
}

/** Stufen: { name, zeilen } je FROM. */
function stufen(text) {
  const liste = [];
  for (const zeile of anweisungen(text)) {
    if (/^FROM\s/i.test(zeile)) liste.push({ name: zeile.split(/\s+AS\s+/i)[1] ?? null, zeilen: [] });
    else if (liste.length) liste.at(-1).zeilen.push(zeile);
  }
  return liste;
}

/** Quellpfade einer COPY-Zeile aus dem Bau-Kontext (ohne --from). */
function kopierQuellen(zeile) {
  if (/--from=/.test(zeile)) return [];
  const teile = zeile.replace(/^COPY\s+/i, '').split(/\s+/).filter(t => !t.startsWith('--'));
  return teile.slice(0, -1);
}

test('Dockerfile: mehrstufig, Laufzeit als nicht-root mit HEALTHCHECK auf /healthz', () => {
  const s = stufen(DOCKERFILE);
  assert.ok(s.length >= 2, 'mindestens zwei Stufen');
  const laufzeit = s.at(-1);
  const user = laufzeit.zeilen.filter(z => /^USER\s/i.test(z)).at(-1);
  assert.ok(user, 'Laufzeitstufe setzt USER');
  assert.doesNotMatch(user, /^USER\s+(root|0)(\s|:|$)/i, 'nicht root');
  assert.ok(laufzeit.zeilen.some(z => /^HEALTHCHECK\s.*\/healthz/i.test(z)), 'HEALTHCHECK auf /healthz');
  assert.ok(laufzeit.zeilen.some(z => /^CMD\s.*scripts\/server\.mjs/.test(z)), 'startet scripts/server.mjs direkt');
  assert.ok(existsSync(join(WURZEL, 'scripts/server.mjs')));
  // Produktionsabhängigkeiten: die Stufe, aus der node_modules kommt, installiert mit --omit=dev.
  const quelle = laufzeit.zeilen.find(z => /^COPY\s+--from=(\S+).*node_modules/.test(z))?.match(/--from=(\S+)/)?.[1];
  assert.ok(quelle, 'node_modules kommt aus einer eigenen Stufe');
  const abh = s.find(st => st.name === quelle);
  assert.ok(abh?.zeilen.some(z => /npm ci\b.*--omit=dev/.test(z)), `Stufe ${quelle} installiert nur Produktionsabhängigkeiten`);
  assert.ok(!laufzeit.zeilen.some(z => /^COPY\s+(--\S+\s+)*\.\s/.test(z)), 'Laufzeit kopiert nicht den ganzen Kontext');
  assert.ok(laufzeit.zeilen.some(z => /^COPY\s+--from=\S+.*\/dist\s/.test(z)), 'dist kommt aus der Bau-Stufe');
});

test('Dockerfile: jeder kopierte Pfad existiert und ist nicht durch .dockerignore ausgeschlossen', () => {
  const quellen = anweisungen(DOCKERFILE).filter(z => /^COPY\s/i.test(z)).flatMap(kopierQuellen);
  assert.ok(quellen.length >= 8, `COPY-Quellen erkannt: ${quellen.join(', ')}`);
  for (const q of quellen) {
    assert.ok(existsSync(join(WURZEL, q)), `${q} fehlt im Repo`);
    const erster = q.split('/')[0];
    assert.ok(!IGNORE.includes(q) && !IGNORE.includes(erster), `${q} ist in .dockerignore ausgeschlossen`);
  }
  // vite.config.mjs importiert die Bauinfo — sie muss in der Bau-Stufe liegen.
  assert.match(readFileSync(join(WURZEL, 'vite.config.mjs'), 'utf8'), /from '\.\/scripts\/release\/bauinfo\.mjs'/);
  assert.ok(quellen.includes('scripts/release/bauinfo.mjs'));
});

test('Dockerfile: Laufzeitstufe enthält die ganze Import-Hülle des Servers', () => {
  const laufzeit = stufen(DOCKERFILE).at(-1);
  const kopiert = laufzeit.zeilen.filter(z => /^COPY\s/i.test(z)).flatMap(kopierQuellen);
  for (const datei of importHuelle(WURZEL, 'scripts/server.mjs')) {
    assert.ok(kopiert.some(k => datei === k || datei.startsWith(`${k}/`)), `${datei} fehlt im Abbild`);
  }
});

test('.dockerignore hält Geheimnisse und Ballast heraus', () => {
  for (const muster of ['.git', 'node_modules', 'dist', '.pa-state', '**/.env', 'deploy/betrieb.env']) {
    assert.ok(IGNORE.includes(muster), `${muster} fehlt in .dockerignore`);
  }
});

test('compose.yaml: baut das Dockerfile, Port nur auf Loopback, Zustand im Volume, Healthcheck', () => {
  assert.match(COMPOSE, /context:\s*\.\.\s*\n\s*dockerfile:\s*Dockerfile/);
  assert.ok(existsSync(join(WURZEL, 'deploy', '..', 'Dockerfile')));
  const ports = [...COMPOSE.matchAll(/^\s*-\s*"([^"]+:\d+:\d+)"/gm)].map(m => m[1]);
  assert.ok(ports.length >= 1, 'Port veröffentlicht');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} nicht auf Loopback`);
  assert.match(COMPOSE, /PA_STATE_PATH:\s*\/data\/lobbies\.json/);
  assert.match(DOCKERFILE, /PA_STATE_PATH=\/data\/lobbies\.json/);
  assert.match(COMPOSE, /-\s*spielstand:\/data/);
  assert.match(COMPOSE, /healthcheck:[\s\S]*\/healthz/);
  assert.match(COMPOSE, /no-new-privileges:true/);
  assert.match(COMPOSE, /stop_grace_period:\s*120s/, 'Zeit zum Sichern beim Stopp wie TimeoutStopSec der systemd-Einheit');
});
