/**
 * Messseite (`messung.html`, Z579): reine Teile in Node — Statistik, Plan, Ergebnisformat, Build-Einbindung.
 *
 * Der Lauf im Browser steht in `tests/e2e/messung.spec.mjs`; hier steht, was ohne Browser prüfbar ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bildStatistik, perzentil, runde } from '../src/client/messung/statistik.js';
import { PHASEN, PLAENE, SZENEN, GESAMTGRENZE_MS, laeufeFuer, maxBildmessungMs, waehlePlan } from '../src/client/messung/plan.js';
import { SCHEMA_KENNUNG, dateiname, fazit, pruefeErgebnis, rundePhase, tabellenZeilen } from '../src/client/messung/ergebnis.js';
import { MAP_SIZES } from '../src/engine/karte.js';
import { NEUE_BIOME } from '../src/shared/config/biome-neu.js';

const WURZEL = path.resolve(import.meta.dirname, '..');

test('Statistik: Perzentile, Mittel und fps wie im Profiling-Test', () => {
  const zeiten = Array.from({ length: 100 }, (_, i) => 10 + i); // 10..109 ms
  const s = bildStatistik(zeiten);
  assert.equal(s.bilder, 100);
  assert.equal(s.mittel, 59.5);
  assert.equal(s.p50, 60); // Index floor(100 · 0,5) = 50
  assert.equal(s.p95, 105);
  assert.equal(s.p99, 109);
  assert.equal(s.max, 109);
  assert.equal(s.ueber16, 93); // 17..109
  assert.equal(s.ueber33, 76); // 34..109
  assert.ok(Math.abs(s.fps - 1000 / 59.5) < 1e-9);
  assert.equal(perzentil([], 0.5), 0);
  assert.deepEqual(bildStatistik([]), { bilder: 0, mittel: 0, p50: 0, p95: 0, p99: 0, max: 0, ueber16: 0, ueber33: 0, fps: 0 });
  assert.equal(runde(1.23456), 1.23);
  assert.equal(runde(NaN), null);
});

test('Plan: Szenen, Biome und Kartenmaße sind die geforderten', () => {
  const nach = id => SZENEN.find(s => s.id === id);
  assert.deepEqual(MAP_SIZES['24:9'].gross, { width: 4704, height: 1764 });
  assert.deepEqual(MAP_SIZES['24:9'].riesig, { width: 6272, height: 2352 });
  assert.ok(nach('riesig-tiefsee') && nach('gross-tiefsee') && nach('gross-fantasywald'));
  assert.equal(nach('riesig-tiefsee').groesse, 'riesig');
  assert.equal(nach('gross-tiefsee').groesse, 'gross');
  assert.ok(SZENEN.some(s => s.format === '16:9' && s.groesse === 'mittel'));
  // Jedes gewählte Biom existiert, „Fantasywald“ ist die Kennung `kristallwald`.
  for (const s of SZENEN.filter(x => x.biom)) assert.ok(NEUE_BIOME[s.biom], `Biom ${s.biom} unbekannt`);
  assert.equal(NEUE_BIOME[nach('gross-fantasywald').biom].label, 'Fantasywald');
  assert.equal(NEUE_BIOME[nach('gross-tiefsee').biom].label, 'Abyssale Tiefsee');
  // Eindeutige Kennungen, die schwerste Szene steht zuletzt (Absturzspur: alles davor ist schon gesichert).
  assert.equal(new Set(SZENEN.map(s => s.id)).size, SZENEN.length);
  assert.equal(SZENEN.at(-1).id, 'riesig-tiefsee');
  // Phasen: Schüsse/Explosionen, Wasser, mindestens drei Zoomstufen.
  assert.ok(PHASEN.some(p => p.aktion === 'schuesse') && PHASEN.some(p => p.aktion === 'wasser'));
  assert.ok(PHASEN.filter(p => p.aktion === 'fahrt').length >= 3);
});

test('Plan: Bildmessung des Standardplans passt in die Gesamtgrenze von 3 Minuten', () => {
  assert.ok(GESAMTGRENZE_MS <= 180_000);
  assert.equal(PLAENE.standard.gesamtgrenzeMs, GESAMTGRENZE_MS);
  // Die Obergrenze der reinen Bildmessung lässt Raum für Aufbau und Laden (Rest wird übersprungen).
  assert.ok(maxBildmessungMs(PLAENE.standard) < GESAMTGRENZE_MS, `${maxBildmessungMs(PLAENE.standard)} ms`);
  assert.equal(waehlePlan('gibt-es-nicht').id, 'standard');
  assert.equal(waehlePlan('test').id, 'test');
  assert.equal(laeufeFuer({ laeufe: 2 }, PLAENE.test), 1);
  assert.equal(laeufeFuer({ laeufe: 2 }, PLAENE.standard), 2);
});

/** Ein gültiges Beispielergebnis. */
function beispiel() {
  const phase = id => rundePhase(bildStatistik([16.7, 17, 20, 33, 40]), { id, titel: id, zoom: 1, dauerMs: 100, abgebrochen: false, schuesse: 0, explosionen: 0, wasserZellen: 0 });
  return {
    schema: SCHEMA_KENNUNG, plan: 'standard', gestartet: '2026-11-11T12:00:00.000Z', beendet: '2026-11-11T12:02:00.000Z', status: 'fertig', hinweis: null,
    bauinfo: null, seite: { adresse: 'https://x/messung.html', host: 'x' },
    geraet: { ua: 'UA', devicePixelRatio: 3, bildschirm: { breite: 390, hoehe: 844 }, fenster: { breite: 844, hoehe: 390 }, ausrichtung: 'landscape', webgl: null, softwareRasterung: null, wachhalten: true },
    leertakt: { bilder: 60, mittel: 16.7, p95: 17, max: 20, hz: 60 },
    szenen: [
      { id: 'a', titel: 'A', status: 'ok', fehler: null, karte: { breite: 2560, hoehe: 1440, pixelMio: 3.69 }, ladezeitMs: 900, matchAufbauMs: 800, terrainNeuaufbau: { laeufe: 2, mittel: 700, max: 710, pixel: 3686400, msProMioPixel: 190 }, gradingAufbauMs: null, speicher: null, phasen: [phase('ruhig')] },
      { id: 'b', titel: 'B', status: 'uebersprungen', fehler: null },
      { id: 'c', titel: 'C', status: 'fehler', fehler: 'kaputt' },
    ],
    gesamt: { dauerMs: 120000, szenenOk: 1, szenenFehler: 1, szenenUebersprungen: 1 },
  };
}

test('Ergebnisformat: gültiges Beispiel besteht, Verstöße werden benannt', () => {
  const e = beispiel();
  assert.deepEqual(pruefeErgebnis(e), []);
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e); // JSON-fest (Kopieren/Teilen)

  const kaputt = structuredClone(e);
  delete kaputt.geraet.devicePixelRatio;
  kaputt.szenen[0].phasen[0].p95 = 'viel';
  kaputt.szenen[0].terrainNeuaufbau = null;
  kaputt.status = 'weiss-nicht';
  const f = pruefeErgebnis(kaputt).join(' | ');
  assert.match(f, /devicePixelRatio/);
  assert.match(f, /phasen\[0\]: p95/);
  assert.match(f, /terrainNeuaufbau/);
  assert.match(f, /status unbekannt/);
  assert.ok(pruefeErgebnis(null).length > 0);
  assert.ok(pruefeErgebnis({ ...e, szenen: [] }).some(x => /szenen/.test(x)));
  assert.ok(pruefeErgebnis({ ...e, schema: 'x' }).some(x => /schema/.test(x)));
});

test('Ergebnisformat: Tabellenzeilen, Fazit, Dateiname', () => {
  const e = beispiel();
  const t = tabellenZeilen(e);
  assert.equal(t.aufbau.length, 3);
  assert.equal(t.bilder.length, 1);
  assert.match(t.aufbau[2].at(-1), /Fehler: kaputt/);
  assert.match(t.aufbau[1].at(-1), /übersprungen/);
  assert.match(fazit(e), /Langsamste Phase: A/);
  assert.equal(fazit({ szenen: [{ status: 'fehler' }] }), 'Keine Szene ist durchgelaufen.');
  assert.equal(dateiname(e), 'pa-messung-202611111200.json');
});

test('Build: Messseite ist eigener Einstieg, nicht im Spiel-Bündel, ohne Zugangsschicht', () => {
  const vite = fs.readFileSync(path.join(WURZEL, 'vite.config.mjs'), 'utf8');
  assert.match(vite, /input:\s*\{\s*index:\s*'index\.html',\s*messung:\s*'messung\.html'/);
  // Die Zugangsschicht (webStart) wird nur der Spielseite eingehängt.
  assert.match(vite, /messung\.html'\) \? \[\]/);
  const html = fs.readFileSync(path.join(WURZEL, 'messung.html'), 'utf8');
  assert.match(html, /src="\/src\/client\/messung\/messseite\.js"/);
  // Kein Spielmodul importiert die Messseite (sonst käme sie ins Haupt-Bündel).
  const main = fs.readFileSync(path.join(WURZEL, 'src/client/main.js'), 'utf8');
  assert.doesNotMatch(main, /messung\//);
  // Die Messmodule ziehen nichts aus dem Spiel nach (eigener, kleiner Einstieg).
  for (const datei of fs.readdirSync(path.join(WURZEL, 'src/client/messung'))) {
    const code = fs.readFileSync(path.join(WURZEL, 'src/client/messung', datei), 'utf8');
    for (const m of code.matchAll(/from '(\.[^']+)'/g)) assert.match(m[1], /^\.\/[a-z]+\.js$/, `${datei} importiert ${m[1]}`);
  }
});

test('Frame-Schutz bleibt: Die Messseite bettet das Spiel per srcdoc ein, die Header-Regel DENY bleibt', () => {
  const toml = fs.readFileSync(path.join(WURZEL, 'netlify.toml'), 'utf8');
  assert.match(toml, /X-Frame-Options = "DENY"/);
  const lauf = fs.readFileSync(path.join(WURZEL, 'src/client/messung/messlauf.js'), 'utf8');
  assert.match(lauf, /\.srcdoc = /);
  assert.doesNotMatch(lauf, /\.src = (?!'about:blank')/);
});
