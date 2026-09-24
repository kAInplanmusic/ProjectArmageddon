/**
 * Repo-Helfer für das Audit-MCP.
 *
 * Alles ist auf das Projektverzeichnis bezogen (Wurzel = zwei Ebenen über
 * dieser Datei). Es gibt keine Abhängigkeit außer `node:fs`/`node:path`/
 * `node:child_process` — das MCP muss auf einem nackten Node laufen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Verzeichnisse, die NIE durchsucht werden. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'artifacts', 'test-results',
  'playwright-report', '.pa-state', 'coverage', '.vite', 'uploaded',
]);

const QUELL_ENDUNGEN = ['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.html', '.yml', '.yaml'];

/** Läuft rekursiv durch ein Verzeichnis und liefert Dateien mit Endung. */
export function walk(dir, { endungen = QUELL_ENDUNGEN, maxDateien = 20000 } = {}) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const aktuell = stack.pop();
    let eintraege;
    try {
      eintraege = fs.readdirSync(aktuell, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of eintraege) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const voll = path.join(aktuell, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(voll);
      } else if (endungen.includes(path.extname(e.name))) {
        out.push(voll);
        if (out.length >= maxDateien) return out;
      }
    }
  }
  return out;
}

/** Relativer Projektpfad — für Ausgaben. */
export function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/** Liest eine Datei, ohne zu werfen. */
export function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/** Führt ein Kommando aus und liefert {code, out, ms, abgebrochen}. */
export function run(befehl, args, { timeoutMs = 300000, cwd = ROOT, env = {} } = {}) {
  const start = Date.now();
  const r = spawnSync(befehl, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const abgebrochen = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
  return {
    code: r.status ?? (r.error ? -1 : 0),
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    ms: Date.now() - start,
    abgebrochen,
    fehler: r.error ? String(r.error.message) : null,
  };
}

/** Startet ein Kommando ohne zu warten; liefert das Kind zurück. */
export function spawnDetached(befehl, args, optionen = {}) {
  return spawn(befehl, args, { cwd: ROOT, stdio: 'ignore', ...optionen });
}

/** Führt ein npm-Skript aus. */
export function npmRun(skript, optionen = {}) {
  return run('npm', ['run', '--silent', skript], optionen);
}

/** Liest die package.json des Projekts. */
export function packageJson() {
  const raw = read(path.join(ROOT, 'package.json'));
  return raw ? JSON.parse(raw) : { scripts: {} };
}

/** Git-Status in einem Aufruf. */
export function gitStatus() {
  const head = run('git', ['rev-parse', '--short', 'HEAD'], { timeoutMs: 20000 });
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 20000 });
  const dirty = run('git', ['status', '--porcelain'], { timeoutMs: 20000 });
  const log = run('git', ['log', '--oneline', '-5'], { timeoutMs: 20000 });
  return {
    head: head.out.trim(),
    branch: branch.out.trim(),
    dirty: dirty.out.trim() ? dirty.out.trim().split('\n') : [],
    letzteCommits: log.out.trim().split('\n'),
  };
}

/** Absoluter Pfad unterhalb des Projekts. */
export function projectPath(...teile) {
  return path.join(ROOT, ...teile);
}
