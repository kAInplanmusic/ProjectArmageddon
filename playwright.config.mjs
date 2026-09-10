import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

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

export default defineConfig({
  testDir: './tests/e2e',
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
    baseURL: 'http://127.0.0.1:5173',
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
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
