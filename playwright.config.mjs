import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Die E2E-Tests schießen sofort nach dem Zugbeginn: Spiel und Server laufen hier ohne Zugpause.
// (Die Pause selbst ist in tests/zugpause.test.js und von Hand geprüft.)
process.env.VITE_ZUGPAUSE_SEKUNDEN = process.env.VITE_ZUGPAUSE_SEKUNDEN ?? '0';
process.env.PA_ZUGPAUSE_SEKUNDEN = process.env.PA_ZUGPAUSE_SEKUNDEN ?? '0';

/**
 * E2E-Konfiguration.
 *
 * Browserwahl ist portabel:
 *  - `PLAYWRIGHT_CHANNEL=chrome` erzwingt den System-Chrome (lokal üblich,
 *    spart einen zusätzlichen Download).
 *  - `PLAYWRIGHT_CHANNEL=bundled` erzwingt das von Playwright installierte
 *    Chromium (Standard auf CI-Runnern, dort ist kein Chrome installiert).
 *  - Ohne Vorgabe wird Chrome genutzt, wenn es installiert ist, sonst Chromium.
 *
 * Der Dev-Server wird von Playwright gestartet und nach dem Lauf beendet.
 */
function resolveChannel() {
  const requested = process.env.PLAYWRIGHT_CHANNEL;
  if (requested === 'chrome') return 'chrome';
  if (requested === 'bundled') return undefined;

  const chromeCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  if (chromeCandidates.some(path => existsSync(path))) return 'chrome';
  return undefined;
}

const channel = resolveChannel();

/**
 * Port des Dev-Servers: `PA_PORT` (Standard 5173).
 *
 * Belegt ein fremder Server Port 5173 (andere Agenten, andere Worktrees), weicht man mit
 * `PA_PORT=5199 npx playwright test` aus: Playwright startet dann Vite auf diesem Port
 * (`vite.config.mjs` liest dieselbe Variable). Alle Specs gehen über die `baseURL`; fest
 * verdrahtete Adressen gibt es in den Tests nicht mehr.
 */
function leseDevPort(roh) {
  if (roh === undefined || roh === '') return 5173;
  const port = Number(roh);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`PA_PORT="${roh}" ist kein gültiger Port (ganze Zahl 1024–65535).`);
  }
  return port;
}
const DEV_PORT = leseDevPort(process.env.PA_PORT);
process.env.PA_PORT = String(DEV_PORT); // der von Playwright gestartete Vite erbt sie
const BASE_URL = `http://127.0.0.1:${DEV_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Prüft aktiv, dass der Dev-Server das Spiel liefert (klare Meldung samt PA_PORT-Hinweis).
  globalSetup: './tests/e2e/helfer/global-setup.mjs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Ein Worker: die Multiplayer-Tests starten einen eigenen Serverprozess und
  // teilen sich feste Ports, parallele Läufe würden kollidieren.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    ...(channel ? { channel } : {}),
    headless: true,
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
