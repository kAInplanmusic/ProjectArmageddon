// OPT-6: Werkzeug `scripts/paket-stand.mjs` erkennt, ob main dem Paket vorausgelaufen ist.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { paketStand } from '../scripts/paket-stand.mjs';

test('OPT-6: paketStand meldet Basisdrift und aktuellen Stand', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-paket-'));
  try {
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
    const commit = name => { fs.writeFileSync(path.join(dir, name), name); git('add', name); git('commit', '-q', '-m', name); };
    git('init', '-q', '-b', 'main');
    commit('basis');
    git('checkout', '-q', '-b', 'paket');
    commit('paket-a');
    assert.deepEqual(paketStand('paket', 'main', dir), { mergeBase: paketStand('main', 'main', dir).mergeBase, hinterher: 0, eigene: 1, aktuell: true });
    git('checkout', '-q', 'main');
    commit('main-weiter');
    const drift = paketStand('paket', 'main', dir);
    assert.equal(drift.aktuell, false);
    assert.equal(drift.hinterher, 1);
    assert.equal(drift.eigene, 1);
    git('checkout', '-q', 'paket');
    git('rebase', '-q', 'main');
    assert.equal(paketStand('paket', 'main', dir).aktuell, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
