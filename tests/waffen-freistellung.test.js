import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const TABELLE = `${WURZEL}tools/waffen-freistellung.json`;
const BERICHT = `${WURZEL}docs/waffenbalance-2026-11-09/freistellung/bericht.json`;
const MODI = new Set(['rahmen', 'platte', 'heldmaske', 'aus128', 'keine']);

const tabelle = JSON.parse(readFileSync(TABELLE, 'utf8'));
const bericht = JSON.parse(readFileSync(BERICHT, 'utf8'));

test('BAL-09: jede Entscheidung nennt Modus und Grund', () => {
  assert.equal(tabelle.version, 1);
  assert.ok(Object.keys(tabelle.waffen).length >= 20);
  for (const [id, eintrag] of Object.entries(tabelle.waffen)) {
    assert.match(id, /^pa_\d{3}$/);
    assert.ok(eintrag.name, `${id}: Name fehlt`);
    for (const [rolle, regel] of Object.entries(eintrag.rollen)) {
      assert.ok(['icon', 'held', 'silhouette', 'menue64'].includes(rolle), `${id}: Rolle ${rolle}`);
      assert.ok(MODI.has(regel.modus), `${id}/${rolle}: Modus ${regel.modus}`);
      assert.ok(regel.grund && regel.grund.length > 10, `${id}/${rolle}: Grund fehlt`);
    }
  }
});

test('BAL-09: Bericht belegt Vorher/Nachher ohneMassiven Verlust', () => {
  assert.equal(bericht.stand, 'BAL-09');
  const geaendert = Object.values(bericht.waffen).filter(w => w.geaendert);
  assert.equal(geaendert.length, 9, 'genau neun Waffen waren im Lauf betroffen');
  for (const [id, waffe] of Object.entries(bericht.waffen)) {
    for (const [rolle, r] of Object.entries(waffe.rollen)) {
      if (r.modus === 'keine') assert.equal(r.entferntePixel, 0, `${id}/${rolle}: keine darf nichts entfernen`);
      if (!r.geaendert) continue;
      assert.notEqual(r.hashVorher, r.hashNachher, `${id}/${rolle}: Hash unverändert`);
      assert.ok(r.bboxNachher[2] >= r.bboxNachher[0], `${id}/${rolle}: leere Bbox`);
      const flaeche = (r.bboxVorher[2] - r.bboxVorher[0] + 1)
        * (r.bboxVorher[3] - r.bboxVorher[1] + 1);
      // Menü-Icons tragen eine große Hintergrundplatte; bei Hand/Silhouette
      // darf höchstens ein Viertel der Bounding-Box verschwinden.
      const grenze = rolle === 'menue64' ? 0.8 : 0.3;
      assert.ok(r.entferntePixel / flaeche <= grenze,
        `${id}/${rolle}: ${r.entferntePixel}/${flaeche} entfernt`);
    }
  }
});

test('BAL-09: Kontaktbögen für alle geänderten IDs vorhanden', () => {
  for (const [id, waffe] of Object.entries(bericht.waffen)) {
    if (!waffe.geaendert) continue;
    const datei = `${WURZEL}docs/waffenbalance-2026-11-09/freistellung/${id}.png`;
    assert.ok(existsSync(datei), `${id}: Kontaktbogen fehlt`);
    assert.ok(statSync(datei).size > 10_000, `${id}: Kontaktbogen zu klein`);
  }
});

test('BAL-09: Werkzeug ist idempotent (nur mit scipy/Pillow prüfbar)', t => {
  const python = process.env.PA_PYTHON
    || `${process.env.HOME}/.venvs/rembg312/bin/python`;
  const probe = spawnSync(python, ['-c', 'import scipy, PIL'], {
    encoding: 'utf8', env: { ...process.env, PYTHONPATH: '' },
  });
  if (probe.status !== 0) {
    t.skip('scipy/Pillow im System-Python nicht verfügbar');
    return;
  }
  const lauf = spawnSync(python, ['tools/waffen-freistellung.py', '--pruefen'], {
    cwd: WURZEL, encoding: 'utf8', env: { ...process.env, PYTHONPATH: '' },
  });
  assert.equal(lauf.status, 0, lauf.stderr);
  assert.match(lauf.stderr, /0 geaendert/, lauf.stderr);
});
