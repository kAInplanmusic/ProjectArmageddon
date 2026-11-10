/**
 * LADEZEIT (2026-11-09): Das Menü lädt keine Match-Bilder; Texturen und Figurendaten kommen nach Bedarf.
 *
 * ## Der Befund
 *
 * Gemessen im Produktionsbau (Chrome, 1280x720, `vite preview`): Vor dem ersten Klick holte die
 * Startseite 121 Dateien mit 7,80 MB — darunter 112 Stofftexturen und 12 Effekt-Sheets, die erst ein
 * Match braucht, und von denen eine Karte nur eine Handvoll zeigt. Dazu standen drei Figuren-Manifeste
 * und die Adresstabellen der Figurenbilder im Startbündel.
 *
 * ## Was hier geprüft wird
 *
 *  - Der Wunschweg: Ein Fehlgriff auf eine angemeldete Textur merkt sie vor, lädt sie in EINEM Lauf
 *    und meldet es den Hörern; ohne angemeldete Adressen passiert nichts.
 *  - Das Bild: Nur die Texturen der vorkommenden Stoffe zu haben, färbt das Gelände pixelgleich wie
 *    alle Texturen zu haben.
 *  - Der Aufbau: Die nachgeladenen Bausteine werden nirgends statisch importiert, und der Start
 *    stößt kein Laden im Leerlauf mehr an.
 *
 * Die Messung im Browser steht in `tests/e2e/ladezeit-nach-bedarf.spec.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { faerbeGelaende } from '../src/client/gelaendeStil.js';
import {
  STOFF_TEXTUR, TEXTUR_NAMEN, TEXTUR_GROESSE, registriereStoffTextur, leereStoffTexturen,
  setzeStoffTexturUrls, beiNeuenStoffTexturen, offeneStoffTexturen, stoffTexturenBereit,
  stoffTextur, anzahlStoffTexturen,
} from '../src/client/stoffTexturen.js';
import { STOFFE } from '../src/shared/config/stoffe.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const lies = (...teile) => fs.readFileSync(path.join(ROOT, ...teile), 'utf8');

function pixel(name) {
  const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
  let s = 0;
  for (const z of name) s = (s * 31 + z.charCodeAt(0)) >>> 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = 60 + (((i >> 2) * 7919 + s) % 130);
    px[i] = v; px[i + 1] = (v * 3 + s) % 200 + 30; px[i + 2] = (v + s) % 180 + 40; px[i + 3] = 255;
  }
  return px;
}

/** Ein Browser-Ersatz, gerade groß genug für `ladeStoffTexturen` (Bild → Leinwand → Pixel). */
function mitBrowserErsatz(fehlend, lauf) {
  const alt = { document: globalThis.document, Image: globalThis.Image };
  const geholt = [];
  let letztes = null;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        drawImage: (bild) => { letztes = bild; },
        getImageData: () => ({ data: pixel(letztes.src) }),
      }),
    }),
  };
  globalThis.Image = class {
    async decode() { geholt.push(this.src); if (fehlend.has(this.src)) throw new Error('404'); }
  };
  return lauf(geholt).finally(() => { globalThis.document = alt.document; globalThis.Image = alt.Image; });
}

test('Ohne angemeldete Adressen entsteht kein Wunsch (node --test, Werkzeuge)', async () => {
  leereStoffTexturen();
  setzeStoffTexturUrls({});
  assert.equal(stoffTextur('erde'), null);
  assert.equal(stoffTextur(undefined), null);
  assert.equal(offeneStoffTexturen(), 0, 'ein Nachschlag ohne Adresse darf nichts vormerken');
  await stoffTexturenBereit();
  assert.equal(anzahlStoffTexturen(), 0);
});

test('Ein Fehlgriff lädt genau die gewünschten Texturen in einem Lauf und meldet es', async () => {
  await mitBrowserErsatz(new Set(['u/kaputt']), async (geholt) => {
    leereStoffTexturen();
    setzeStoffTexturUrls({ erde: 'u/erde', fels: 'u/fels', sand: 'u/sand', kaputt: 'u/kaputt' });
    const meldungen = [];
    const ab = beiNeuenStoffTexturen(n => meldungen.push(n));
    try {
      // Drei Wünsche im selben Aufbau (einer doppelt, einer auf eine fehlende Datei); `sand` wünscht niemand.
      assert.equal(stoffTextur('erde'), null);
      assert.equal(stoffTextur('fels'), null);
      assert.equal(stoffTextur('erde'), null);
      assert.equal(stoffTextur('kaputt'), null);
      assert.equal(stoffTextur('gibt-es-nicht'), null);
      assert.equal(offeneStoffTexturen(), 3);
      assert.deepEqual(geholt, [], 'geladen wird erst nach dem Aufbau, nicht mittendrin');

      await stoffTexturenBereit();

      assert.deepEqual([...geholt].sort(), ['u/erde', 'u/fels', 'u/kaputt'], 'genau die Wünsche, jede Datei einmal');
      assert.deepEqual(meldungen, [2], 'ein Lauf, eine Meldung, zwei Texturen');
      assert.equal(offeneStoffTexturen(), 0);
      assert.ok(stoffTextur('erde') && stoffTextur('fels'), 'die Texturen sind da');
      assert.equal(anzahlStoffTexturen(), 2);

      // Eine fehlende Datei wird nicht bei jedem Geländeaufbau erneut geholt.
      assert.equal(stoffTextur('kaputt'), null);
      assert.equal(offeneStoffTexturen(), 0);
      await stoffTexturenBereit();
      assert.equal(geholt.length, 3);

      // Ein späterer Wunsch (neuer Stoff durch Zerstörung oder die nächste Karte) startet einen neuen Lauf.
      assert.equal(stoffTextur('sand'), null);
      await stoffTexturenBereit();
      assert.deepEqual(meldungen, [2, 1]);
      assert.ok(stoffTextur('sand'));
    } finally {
      ab();
      leereStoffTexturen();
      setzeStoffTexturUrls({});
    }
  });
});

test('Ein Hörer, der wirft, hält den Ladelauf nicht auf', async () => {
  await mitBrowserErsatz(new Set(), async () => {
    leereStoffTexturen();
    setzeStoffTexturUrls({ erde: 'u/erde' });
    let zweiter = 0;
    const ab1 = beiNeuenStoffTexturen(() => { throw new Error('Renderer noch nicht bereit'); });
    const ab2 = beiNeuenStoffTexturen(() => { zweiter += 1; });
    try {
      stoffTextur('erde');
      await stoffTexturenBereit();
      assert.equal(zweiter, 1);
      assert.ok(stoffTextur('erde'));
    } finally {
      ab1(); ab2(); leereStoffTexturen(); setzeStoffTexturUrls({});
    }
  });
});

function faerbe(karte, namen) {
  leereStoffTexturen();
  for (const n of namen) registriereStoffTextur(n, pixel(n));
  const d = new Uint8ClampedArray(karte.width * karte.height * 4);
  for (let i = 0; i < karte.bitmap.length; i += 1) if (karte.bitmap[i]) d[i * 4 + 3] = 255;
  faerbeGelaende(d, karte.bitmap, karte.width, karte.height, { surface: [96, 138, 92], deep: [38, 54, 46] }, 5, karte.stoffkarte);
  leereStoffTexturen();
  return d;
}

test('Nur die Texturen der vorkommenden Stoffe färben pixelgleich wie alle Texturen', () => {
  let geprueft = 0;
  for (const [seed, biom] of [[77, 'dschungel'], [4242, 'pilzwald'], [9, 'vulkan'], [20261109, 'arktis']]) {
    const karte = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { gelaende: 3, biom });
    if (!karte.stoffkarte) continue;
    const ids = new Set([0, ...karte.stoffkarte.feld]);
    const noetig = [...new Set([...ids].map(id => STOFF_TEXTUR[STOFFE[id]?.key]).filter(Boolean))];
    assert.ok(noetig.length < TEXTUR_NAMEN.length / 2,
      `${biom}: die Karte braucht ${noetig.length} von ${TEXTUR_NAMEN.length} Texturen — der Bedarfsweg lohnt sonst nicht`);
    const alle = faerbe(karte, TEXTUR_NAMEN);
    const nurNoetige = faerbe(karte, noetig);
    assert.deepEqual(nurNoetige, alle, `${biom} (Seed ${seed}): Bild weicht ab`);
    const ohne = faerbe(karte, []);
    assert.notDeepEqual(ohne, alle, `${biom}: Testaufbau — die Texturen wirken gar nicht`);
    geprueft += 1;
  }
  assert.ok(geprueft >= 2, 'mindestens zwei Karten mit Stoffkarte müssen geprüft sein');
});

test('Der Start lädt nichts im Leerlauf; Texturen kommen über den Wunschweg', () => {
  // Verbote gegen den Quelltext OHNE Kommentare (die alte Lösung steht dort als Erklärung),
  // Gebote gegen den vollen Text.
  const main = lies('src', 'client', 'main.js');
  const mainCode = ohneKommentare(main);
  assert.doesNotMatch(mainCode, /requestIdleCallback/, 'main.js stößt wieder ein Laden im Leerlauf an');
  assert.doesNotMatch(mainCode, /ladeStoffTexturen\(/, 'main.js lädt wieder alle Texturen auf einmal');
  assert.match(main, /setzeStoffTexturUrls\(STOFF_TEXTUR_URLEN\)/, 'die Adressen werden nicht angemeldet');
  assert.match(main, /beiNeuenStoffTexturen\(\(\) => this\.renderer\.faerbeNachTexturen\(\)\)/,
    'nach dem Nachladen färbt niemand das Gelände nach');
  assert.match(main, /stoffTexturenBereit\(\)/, 'das Ladebild wartet nicht auf die Texturen der Karte');
});

test('Die nachgeladenen Bausteine werden nirgends statisch importiert', () => {
  const ordner = path.join(ROOT, 'src');
  const dateien = fs.readdirSync(ordner, { recursive: true }).filter(d => String(d).endsWith('.js'));
  for (const baustein of ['figurenDaten.js', 'figurenHdDaten.js']) {
    assert.ok(fs.existsSync(path.join(ordner, 'client', baustein)), `${baustein} fehlt`);
    const statisch = new RegExp(`(?:^|\\n)\\s*(?:import|export)[^;\\n]*from\\s+['"][^'"]*${baustein.replace('.', '\\.')}['"]`);
    for (const d of dateien) {
      const quelle = ohneKommentare(fs.readFileSync(path.join(ordner, String(d)), 'utf8'));
      assert.doesNotMatch(quelle, statisch, `${d} importiert ${baustein} statisch — der Baustein landet wieder im Startbündel`);
    }
  }
  const bilder = ohneKommentare(lies('src', 'client', 'figurenBilder.js'));
  assert.match(bilder, /import\('\.\/figurenDaten\.js'\)/, 'figurenBilder.js lädt die Daten nicht nach');
  assert.doesNotMatch(bilder, /import\.meta\.glob/, 'figurenBilder.js führt wieder eigene Globs (Manifeste im Startbündel)');
  const roster = ohneKommentare(lies('src', 'client', 'roster.js'));
  assert.match(roster, /import\('\.\/figurenHdDaten\.js'\)/, 'roster.js lädt die HD-Adressen nicht nach');
  assert.doesNotMatch(roster, /import\.meta\.glob\([^)]*characters-hd/, 'roster.js führt wieder einen eigenen HD-Glob');
});

test('Die Grenzen des Bundle-Gates liegen unter dem Stand vor dem Umbau', () => {
  const grenzen = JSON.parse(lies('scripts', 'bundle-grenzen.json'));
  // Stand vor dem Umbau (2026-11-09, gemessen): haupt 1323113/369396, start 1433246/392733.
  // 2026-11-10: Waffenfassung 20 (Feuerwesen im Motor) +9,9 kB roh; Grenzen mit Messwert in scripts/bundle-grenzen.json
  // angehoben (haupt 1221000/361000, start 1331000/384500) — weiterhin rund 100 kB unter dem Stand vor dem Umbau.
  assert.ok(grenzen.haupt.roh <= 1221000, `haupt.roh ${grenzen.haupt.roh}: Grenze wieder gelockert`);
  assert.ok(grenzen.haupt.gzip <= 361000, `haupt.gzip ${grenzen.haupt.gzip}: Grenze wieder gelockert`);
  assert.ok(grenzen.start.roh <= 1331000, `start.roh ${grenzen.start.roh}: Grenze wieder gelockert`);
  assert.ok(grenzen.start.gzip <= 384500, `start.gzip ${grenzen.start.gzip}: Grenze wieder gelockert`);
});
