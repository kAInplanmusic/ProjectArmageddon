/**
 * Bauinfo: Version, Git-Stand und Bauzeit EINES Builds (DEP-1, Versionskennung).
 *
 * Eine Quelle für drei Leser:
 *   - `vite.config.mjs` schreibt sie in den Client (`__PA_BAUINFO__`, sichtbar im Menü-Fuß)
 *     und als `dist/version.json` neben den Build;
 *   - der Server liest `dist/version.json` und meldet sie in `/healthz` (`src/server/bauinfo.js`);
 *   - `scripts/release/paket.mjs` benennt das Release-Archiv danach.
 *
 * Damit gehört zu jedem ausgelieferten `dist/` genau ein Git-Stand — die Voraussetzung,
 * um „zurück auf die vorige Version" überhaupt adressieren zu können.
 *
 * Reihenfolge der Quellen für den Git-Stand:
 *   1. `PA_GIT_SHA` (z. B. Docker-Build-Argument, dort gibt es kein `.git`)
 *   2. `GITHUB_SHA` (CI)
 *   3. `git rev-parse HEAD` im Projekt
 *   4. `unbekannt`
 *
 * Bauzeit: `SOURCE_DATE_EPOCH` (Sekunden, Standard für reproduzierbare Builds), sonst jetzt.
 *
 * Aufruf von der Kommandozeile: `node scripts/release/bauinfo.mjs` gibt die Bauinfo als JSON aus.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Länge des Git-Kürzels (12 Zeichen sind im Repo eindeutig; das Menü zeigt davon 7). */
const SHA_LAENGE = 12;

function git(root, argumente) {
  return execFileSync('git', ['-C', root, ...argumente], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function gitSha(root, env) {
  const vorgabe = env.PA_GIT_SHA || env.GITHUB_SHA;
  if (vorgabe) return String(vorgabe).trim().slice(0, SHA_LAENGE);
  try {
    return git(root, ['rev-parse', 'HEAD']).slice(0, SHA_LAENGE) || 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}

/** `true`, wenn getrackte Dateien geändert sind; `null`, wenn es nicht feststellbar ist (kein git, Vorgabe von außen). */
function hatAenderungen(root, env) {
  if (env.PA_GIT_SHA || env.GITHUB_SHA) return null;
  try {
    return git(root, ['status', '--porcelain', '--untracked-files=no']) !== '';
  } catch {
    return null;
  }
}

/**
 * @param {{root?: string, env?: Record<string, string|undefined>, jetzt?: Date}} [optionen]
 * @returns {{name: string, version: string, gitSha: string, geaendert: boolean|null, bauzeit: string}}
 */
export function ermittleBauinfo({ root = WURZEL, env = process.env, jetzt = new Date() } = {}) {
  const paket = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const epoche = Number(env.SOURCE_DATE_EPOCH);
  const zeit = env.SOURCE_DATE_EPOCH && Number.isFinite(epoche) ? new Date(epoche * 1000) : jetzt;
  return {
    name: paket.name,
    version: paket.version,
    gitSha: gitSha(root, env),
    geaendert: hatAenderungen(root, env),
    bauzeit: zeit.toISOString(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(ermittleBauinfo(), null, 2)}\n`);
}
