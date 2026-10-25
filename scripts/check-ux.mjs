#!/usr/bin/env node
/**
 * UX-Prüfung: baut das Spiel, startet `vite preview` und misst die Startseite
 * mit Lighthouse (performance, accessibility, best-practices).
 *
 * Der Browser kommt aus der Playwright-Installation; Lighthouse bekommt seinen
 * Pfad über `CHROME_PATH`. So braucht der Lauf keinen zweiten Chrome-Download.
 *
 * Am Ende stehen die drei Scores und die zehn schwächsten Audits (< 0,9).
 * Der vollständige Bericht landet unter `test-results/ux-look/lighthouse.json`
 * (nicht versioniert).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const BERICHT = resolve(REPO, 'test-results/ux-look/lighthouse.json');
const VITE_BIN = resolve(REPO, 'node_modules/vite/bin/vite.js');
const CHROME_KANDIDATEN = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',
];

/** Fragt beim Betriebssystem einen freien Port ab. */
function freierPort() {
  return new Promise((aufloesen, ablehnen) => {
    const server = createServer();
    server.unref();
    server.once('error', ablehnen);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => aufloesen(port));
    });
  });
}

/** Pfad zum headless Chrome/Chromium (Playwright zuerst, dann Systeminstallationen). */
function findeChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  try {
    const pfad = chromium.executablePath();
    if (pfad && existsSync(pfad)) return pfad;
  } catch {
    // Playwright-Browser nicht installiert: System-Chrome probieren.
  }
  return CHROME_KANDIDATEN.find(pfad => existsSync(pfad)) ?? null;
}

/** Wartet, bis der Preview-Server antwortet. */
async function warteAufServer(url, fristMs = 30_000) {
  const ende = Date.now() + fristMs;
  let grund = 'keine Antwort';
  while (Date.now() < ende) {
    try {
      const antwort = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (antwort.ok) return;
      grund = `HTTP ${antwort.status}`;
    } catch (fehler) {
      grund = fehler?.cause?.code ?? fehler?.message ?? String(fehler);
    }
    await new Promise(aufloesen => setTimeout(aufloesen, 250));
  }
  throw new Error(`Preview-Server nicht erreichbar (${url}): ${grund}`);
}

/** Startet den Preview-Server und liefert Prozess samt Aufräumfunktion. */
async function startePreview(port) {
  if (!existsSync(VITE_BIN)) throw new Error(`Vite nicht gefunden: ${VITE_BIN}`);
  const prozess = spawn(process.execPath, [
    VITE_BIN, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  prozess.stdout.on('data', stueck => { log += stueck.toString(); });
  prozess.stderr.on('data', stueck => { log += stueck.toString(); });

  const beenden = async () => {
    if (prozess.exitCode !== null) return;
    prozess.kill('SIGTERM');
    await new Promise(aufloesen => setTimeout(aufloesen, 400));
    if (prozess.exitCode === null) prozess.kill('SIGKILL');
  };

  try {
    await warteAufServer(`http://127.0.0.1:${port}/`);
  } catch (fehler) {
    await beenden();
    throw new Error(`${fehler.message}\nPreview-Log:\n${log}`);
  }
  return { prozess, beenden, log: () => log };
}

/** Führt Lighthouse aus und liefert den geparsten JSON-Bericht. */
function lighthouse(url, chromePfad) {
  const flaggen = '--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage';
  const argumente = [
    '-y', 'lighthouse', url,
    '--output=json',
    `--output-path=${BERICHT}`,
    '--only-categories=performance,accessibility,best-practices',
    '--form-factor=desktop',
    '--screenEmulation.mobile=false',
    '--screenEmulation.width=1280',
    '--screenEmulation.height=720',
    '--screenEmulation.deviceScaleFactor=1',
    `--chrome-flags=${flaggen}`,
    '--quiet',
  ];
  const lauf = spawnSync('npx', argumente, {
    cwd: REPO,
    env: { ...process.env, CHROME_PATH: chromePfad },
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 240_000,
    encoding: 'utf8',
  });
  if (lauf.error) throw lauf.error;
  if (lauf.status !== 0) {
    throw new Error(`Lighthouse endete mit Code ${lauf.status ?? 'unbekannt'}.`);
  }
  return JSON.parse(readFileSync(BERICHT, 'utf8'));
}

function prozent(wert) {
  return typeof wert === 'number' ? `${Math.round(wert * 100)}` : '—';
}

async function main() {
  console.log('== check:ux — Build ==');
  const bauen = spawnSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'inherit' });
  if (bauen.status !== 0) throw new Error(`Build fehlgeschlagen (Code ${bauen.status}).`);

  const chrome = findeChrome();
  if (!chrome) {
    throw new Error('Kein Chrome/Chromium gefunden. Playwright-Browser installieren oder CHROME_PATH setzen.');
  }

  mkdirSync(resolve(REPO, 'test-results/ux-look'), { recursive: true });

  const port = await freierPort();
  const url = `http://127.0.0.1:${port}/`;
  const preview = await startePreview(port);
  try {
    console.log(`== check:ux — Lighthouse gegen ${url} ==`);
    console.log(`Chrome: ${chrome}`);
    const bericht = lighthouse(url, chrome);
    const kategorien = bericht.categories ?? {};
    console.log('\nScores');
    for (const name of ['performance', 'accessibility', 'best-practices']) {
      console.log(`  ${name.padEnd(15)} ${prozent(kategorien[name]?.score)} / 100`);
    }

    const schwach = Object.entries(bericht.audits ?? {})
      .filter(([, audit]) => typeof audit.score === 'number' && audit.score < 0.9)
      .sort((a, b) => a[1].score - b[1].score || a[0].localeCompare(b[0]))
      .slice(0, 10);

    console.log('\nTop-10 Audits mit Punktzahl < 0.9');
    if (schwach.length === 0) {
      console.log('  keine');
    } else {
      schwach.forEach(([id, audit], index) => {
        const zusatz = audit.displayValue ? ` — ${audit.displayValue}` : '';
        console.log(`  ${String(index + 1).padStart(2)}. [${audit.score.toFixed(2)}] ${id}: ${audit.title}${zusatz}`);
      });
    }
    console.log(`\nVollständiger Bericht: ${BERICHT}`);
  } finally {
    await preview.beenden();
  }
}

main().catch((fehler) => {
  console.error(`\ncheck:ux fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
});
