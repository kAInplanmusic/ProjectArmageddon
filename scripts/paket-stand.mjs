#!/usr/bin/env node
/**
 * OPT-6: Pakete einzeln mergen. Vor dem Merge eines Pakets nach `main` prüft
 * dieses Werkzeug, ob der Branch auf dem aktuellen `main` aufsitzt.
 *
 *   npm run paket:stand                 # HEAD gegen origin/main
 *   node scripts/paket-stand.mjs <ref> [<basis>]
 *
 * Exit 0: `main` ist ein Vorfahre des Pakets (fast-forward bzw. sauberer Merge ohne
 * Basisdrift). Exit 1: `main` ist dem Paket vorausgelaufen, erst `git pull --rebase`.
 * Das Werkzeug ändert nichts.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function paketStand(ref = 'HEAD', basis = 'origin/main', cwd = process.cwd()) {
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  const merge = git('merge-base', ref, basis);
  const hinterher = Number(git('rev-list', '--count', `${ref}..${basis}`));
  const eigene = Number(git('rev-list', '--count', `${basis}..${ref}`));
  return { mergeBase: merge.slice(0, 7), hinterher, eigene, aktuell: hinterher === 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ref, basis] = process.argv.slice(2);
  const r = paketStand(ref, basis);
  const name = basis ?? 'origin/main';
  if (r.aktuell) {
    console.log(`Paket sitzt auf ${name} auf (${r.eigene} eigene Commits, Basis ${r.mergeBase}). Merge möglich.`);
  } else {
    console.error(`${name} ist dem Paket um ${r.hinterher} Commit(s) vorausgelaufen (Basis ${r.mergeBase}). `
      + 'Erst `git pull --rebase`, Tests und `npm run check:docs` erneut, dann dieses Paket allein mergen.');
    process.exitCode = 1;
  }
}
