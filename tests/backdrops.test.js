import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKDROP_BIOMES,
  ALL_BACKDROPS,
  COMPOSITION_SUFFIX,
  TERRAIN_COVERAGE,
  TERRAIN_PALETTES,
  DEFAULT_TERRAIN_PALETTE,
  PRIMARY_BIOME_BY_PRESET,
  getBackdrop,
  backdropsForPreset,
  pickBackdrop,
  paletteFor,
} from '../src/shared/config/backdrops.js';
import { TERRAIN_PRESETS } from '../src/shared/terrainGen.js';

/**
 * Kulissen (KI-erzeugte Hintergrundbilder).
 *
 * Sechzig Kulissen aus zwölf Biomen, je fünf Varianten. Geprüft wird dreierlei:
 * der Katalog ist vollständig und eindeutig, die Bilder liegen tatsächlich auf
 * der Platte, und der Lade-Pfad im Renderer trifft sie auch.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const BILD_DIR = path.join(ROOT, 'src', 'client', 'assets', 'backdrops');

// ------------------------------------------------------------------ Katalog

test('Jedes Biom hat fünf Varianten', () => {
  /*
   * Die Zusage ist „fünf Varianten je Biom", nicht eine Gesamtzahl. Die
   * Gesamtzahl wird deshalb ABGELEITET: Eine feste 60 brach, sobald ein Biom
   * hinzukam, ohne etwas über die Regel zu sagen — dieselbe Falle wie bei einer
   * fest verdrahteten Kopfgröße im Protokoll.
   *
   * Die UNTERGRENZE bleibt stehen (zwölf Biome), denn das war die Zusage.
   */
  assert.ok(BACKDROP_BIOMES.length >= 12,
    `Nur ${BACKDROP_BIOMES.length} Biome — die zwölf geforderten Themen sind die Untergrenze`);

  for (const biome of BACKDROP_BIOMES) {
    assert.equal(biome.variants.length, 5,
      `${biome.id}: ${biome.variants.length} Varianten statt fünf`);
    assert.ok(biome.label?.length > 2, `${biome.id}: Beschriftung fehlt`);
    assert.ok(biome.mapPreset, `${biome.id}: kein Gelände zugeordnet`);
  }

  assert.equal(ALL_BACKDROPS.length, BACKDROP_BIOMES.length * 5,
    'Die Gesamtzahl muss Biome × 5 sein');
});

test('Die Biome entsprechen den gewünschten Themen', () => {
  /*
   * Die zwölf Themen stammen aus der Anforderung; ein Umbenennen wäre ein
   * inhaltlicher Eingriff und soll auffallen.
   *
   * Weitere Biome sind zulässig und stehen DAHINTER: Sie kamen mit neuen
   * Geländeformen dazu (`deluge` für `flooded`), weil jede Geländeform ein
   * eigenes Leitbiom braucht. Die Reihenfolge der zwölf muss dabei stabil
   * bleiben, damit die Auswahlliste sich nicht umsortiert.
   */
  const gewuenscht = [
    'maritime', 'island', 'alpine', 'forest', 'urban', 'cosmos',
    'abstract', 'caverns', 'fantasy', 'hyperreal', 'western', 'noir',
  ];
  const vorhanden = BACKDROP_BIOMES.map(b => b.id);

  for (const id of gewuenscht) {
    assert.ok(vorhanden.includes(id), `Das geforderte Biom „${id}" fehlt`);
  }
  assert.deepEqual(vorhanden.slice(0, gewuenscht.length), gewuenscht,
    'Die Reihenfolge der zwölf geforderten Biome hat sich geändert');
});

test('Schlüssel und Dateinamen sind eindeutig', () => {
  const schluessel = ALL_BACKDROPS.map(b => b.key);
  assert.equal(new Set(schluessel).size, schluessel.length,
    `Doppelte Schlüssel: ${schluessel.filter((k, i) => schluessel.indexOf(k) !== i).join(', ')}`);

  const dateien = ALL_BACKDROPS.map(b => b.file);
  assert.equal(new Set(dateien).size, dateien.length,
    `Doppelte Dateinamen: ${dateien.filter((f, i) => dateien.indexOf(f) !== i).join(', ')}`);

  // Und der Dateiname muss dem Schlüssel entsprechen — sonst zeigt der Katalog
  // auf ein Bild, das unter anderem Namen liegt.
  for (const b of ALL_BACKDROPS) {
    assert.equal(b.file, `${b.key.replace('/', '_')}.jpg`,
      `${b.key}: Dateiname passt nicht zum Schlüssel (${b.file})`);
  }
});

test('Jede Variante beschreibt ihre eigene Szene', () => {
  for (const backdrop of ALL_BACKDROPS) {
    assert.ok(backdrop.prompt.length >= 120,
      `${backdrop.key}: Prompt zu knapp (${backdrop.prompt.length} Zeichen)`);
    assert.ok(backdrop.label.length >= 4, `${backdrop.key}: Beschriftung zu knapp`);
  }

  // Die Szenen müssen sich wirklich unterscheiden — fünfmal derselbe Prompt wäre
  // fünfmal dasselbe Bild.
  const proBiom = BACKDROP_BIOMES.map(b => b.variants.map(v => v.prompt));
  for (let i = 0; i < proBiom.length; i++) {
    const eindeutig = new Set(proBiom[i]);
    assert.equal(eindeutig.size, 5,
      `${BACKDROP_BIOMES[i].id}: nur ${eindeutig.size} verschiedene Szenen`);
  }
});

test('Die Biome decken unterschiedliche Stimmungen ab', () => {
  // Aus der Anforderung: je Biom mindestens fünf unterschiedliche Herangehens-
  // weisen (Tag/Nacht/Krieg/Winter/eigener Stil).
  //
  // Vier Biome sind ausgenommen, und zwar aus unterschiedlichen Gründen:
  //   - cosmos, abstract, caverns: Es gibt keine Jahreszeiten, kein Wetter und
  //     keinen Krieg. Die Achse existiert nicht. Diese Biome tragen ihre Varianz
  //     über das Motiv (Nebel, Ringplanet, Station, Schwarzes Loch; geometrisch,
  //     psychedelisch, Vaporwave, Fraktal, surreal; Tropfstein, Kristall, Lava,
  //     Eis, Unterwasser).
  //   - noir: Der Stil IST die Stimmung. Film Noir ist definiert durch Nacht,
  //     Regen, Schwarzweiß und harten Schattenkontrast — eine Sommer- oder
  //     Wintervariante würde die Stilidentität zerstören. Die Varianz liegt hier
  //     im Schauplatz (Straße, Hafen, Bar, Verfolgung, Dach).
  // Dass diese Biome trotzdem fünf klar verschiedene Szenen haben, sichert der
  // Test „Keine zwei Kulissen eines Bioms beschreiben dasselbe" ab.
  const ohneStimmungsachse = new Set(['cosmos', 'abstract', 'caverns', 'noir']);
  const stimmungen = [
    ['night', 'nacht'],
    ['winter', 'snow', 'ice', 'arctic', 'polar', 'frozen'],
    ['war', 'siege', 'battle', 'bombed', 'torn', 'ruins', 'storm'],
    ['sunset', 'dusk', 'golden', 'dawn'],
  ];

  for (const biome of BACKDROP_BIOMES) {
    if (ohneStimmungsachse.has(biome.id)) continue;
    const texte = biome.variants
      .map(v => `${v.id} ${v.label} ${v.prompt}`.toLowerCase())
      .join(' ');
    const getroffen = stimmungen.filter(gruppe => gruppe.some(w => texte.includes(w)));
    assert.ok(getroffen.length >= 2,
      `${biome.id}: zu wenig Varianz in den Stimmungen (${getroffen.length} von 4 Gruppen)`);
  }
});

test('Keine zwei Kulissen eines Bioms beschreiben dasselbe', () => {
  // Wirkungsprüfung statt Stichwortsuche: Die Beschreibungen zweier Kulissen
  // dürfen sich inhaltlich nicht stark überschneiden. Gemessen als Anteil
  // gemeinsamer Begriffe. Fängt den Fall ab, dass fünf Varianten angelegt, aber
  // drei davon derselbe Text sind — das gäbe fünfmal dasselbe Bild.
  const stopwoerter = new Set([
    'a', 'an', 'the', 'of', 'and', 'in', 'on', 'with', 'at', 'from', 'into',
    'over', 'under', 'through', 'its', 'their', 'as', 'is', 'are', 'by',
    'wide', 'panoramic', 'establishing', 'shot', 'highly', 'detailed',
    'dramatic', 'atmospheric', 'lighting', 'strong', 'sense', 'depth',
  ]);
  const begriffe = text => new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !stopwoerter.has(w)),
  );

  for (const biome of BACKDROP_BIOMES) {
    const saetze = biome.variants.map(v => begriffe(v.prompt));
    for (let i = 0; i < saetze.length; i++) {
      for (let j = i + 1; j < saetze.length; j++) {
        const a = saetze[i];
        const b = saetze[j];
        const gemeinsam = [...a].filter(w => b.has(w)).length;
        const vereinigung = new Set([...a, ...b]).size;
        const aehnlich = gemeinsam / vereinigung;
        assert.ok(aehnlich < 0.5,
          `${biome.id}: ${biome.variants[i].id} und ${biome.variants[j].id} `
          + `beschreiben fast dasselbe (${(aehnlich * 100).toFixed(0)} % gemeinsame Begriffe)`);
      }
    }
  }
});

// ------------------------------------------------------------------ Bilder

test('Zu jeder Kulisse liegt eine Bilddatei', () => {
  const fehlend = ALL_BACKDROPS
    .filter(b => !fs.existsSync(path.join(BILD_DIR, b.file)))
    .map(b => b.file);
  assert.deepEqual(fehlend, [], `Fehlende Bilder: ${fehlend.join(', ')}`);
});

test('Es liegt kein Bild ohne Katalogeintrag herum', () => {
  // Verwaiste Dateien blähen das Repository auf und werden nie ausgeliefert.
  const imKatalog = new Set(ALL_BACKDROPS.map(b => b.file));
  const aufPlatte = fs.readdirSync(BILD_DIR).filter(f => f.endsWith('.jpg'));
  const verwaist = aufPlatte.filter(f => !imKatalog.has(f));
  assert.deepEqual(verwaist, [], `Verwaiste Bilder: ${verwaist.join(', ')}`);
});

test('Alle Bilder haben das Spielformat und eine vertretbare Größe', () => {
  for (const backdrop of ALL_BACKDROPS) {
    const datei = path.join(BILD_DIR, backdrop.file);
    const groesse = fs.statSync(datei).size;
    assert.ok(groesse > 20_000,
      `${backdrop.file}: verdächtig klein (${groesse} B) — vermutlich kein Bild`);
    assert.ok(groesse < 500_000,
      `${backdrop.file}: zu groß für einen Hintergrund (${Math.round(groesse / 1024)} KB)`);
  }

  // Gesamtumfang: alle Kulissen zusammen dürfen das Laden nicht sprengen.
  const gesamt = ALL_BACKDROPS.reduce((s, b) => s + fs.statSync(path.join(BILD_DIR, b.file)).size, 0);
  assert.ok(gesamt < 16_000_000,
    `Alle Kulissen zusammen sind ${(gesamt / 1024 / 1024).toFixed(1)} MB`);
});

test('Jedes Bild ist ein JPEG mit 16:9 und der Spielbreite', () => {
  for (const backdrop of ALL_BACKDROPS.slice(0, 12)) {
    const puffer = fs.readFileSync(path.join(BILD_DIR, backdrop.file));
    // JPEG beginnt mit FF D8 und endet mit FF D9.
    assert.equal(puffer[0], 0xff, `${backdrop.file}: kein JPEG-Anfang`);
    assert.equal(puffer[1], 0xd8, `${backdrop.file}: kein JPEG-Anfang`);
    assert.equal(puffer[puffer.length - 2], 0xff, `${backdrop.file}: kein JPEG-Ende`);
    assert.equal(puffer[puffer.length - 1], 0xd9, `${backdrop.file}: kein JPEG-Ende`);

    // Abmessungen aus dem SOF0/SOF2-Segment lesen (ohne Bildbibliothek).
    const masse = jpegGroesse(puffer);
    assert.deepEqual(masse, { breite: 1280, hoehe: 720 },
      `${backdrop.file}: ${masse.breite}x${masse.hoehe} statt 1280x720`);
  }
});

/** Liest die Bildmaße aus einem JPEG-Puffer. */
function jpegGroesse(puffer) {
  let i = 2;
  while (i < puffer.length) {
    if (puffer[i] !== 0xff) { i += 1; continue; }
    const marker = puffer[i + 1];
    // SOF0..SOF15 außer DHT (c4), JPG (c8), DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        hoehe: puffer.readUInt16BE(i + 5),
        breite: puffer.readUInt16BE(i + 7),
      };
    }
    const laenge = puffer.readUInt16BE(i + 2);
    i += 2 + laenge;
  }
  return { breite: 0, hoehe: 0 };
}

// ------------------------------------------------------------------ Komposition

test('Jeder Erzeugungsauftrag enthält die Kompositionsvorgabe', () => {
  // Ohne „Horizont tief" liegt der Horizont in der Bildmitte und wird vom
  // prozeduralen Gelände verdeckt — die Kulisse wirkte abgeschnitten.
  assert.ok(COMPOSITION_SUFFIX.includes('Horizon low in frame'),
    'Die Kompositionsvorgabe muss den tiefen Horizont fordern');
  assert.ok(COMPOSITION_SUFFIX.includes('No text'),
    'Die Vorgabe muss Text im Bild ausschließen');

  assert.ok(TERRAIN_COVERAGE > 0.3 && TERRAIN_COVERAGE < 0.7,
    `Geländedeckung unplausibel: ${TERRAIN_COVERAGE}`);
});

// ------------------------------------------------------------------ Auswahl

test('Die Kulissenauswahl ist deterministisch', () => {
  for (const seed of [0, 1, 42, 4242, 99999]) {
    const a = pickBackdrop(seed, 'hills');
    const b = pickBackdrop(seed, 'hills');
    assert.equal(a.key, b.key,
      `Seed ${seed}: zwei verschiedene Kulissen (${a.key} / ${b.key})`);
  }
});

test('Verschiedene Seeds ergeben verschiedene Kulissen', () => {
  const gesehen = new Set();
  for (let seed = 0; seed < 40; seed++) gesehen.add(pickBackdrop(seed, 'hills').key);
  assert.ok(gesehen.size >= 5,
    `Nur ${gesehen.size} Kulissen bei 40 Seeds — zu wenig Abwechslung`);
});

test('Die Kulisse passt zum Gelände', () => {
  // Eine Höhlenkulisse über Hügeln wäre offensichtlich falsch; jede Kulisse nennt
  // deshalb die Karte, zu der sie gehört.
  for (const biome of BACKDROP_BIOMES) {
    assert.ok(TERRAIN_PRESETS[biome.mapPreset],
      `${biome.id}: unbekanntes Gelände „${biome.mapPreset}"`);
  }

  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    const passend = backdropsForPreset(preset);
    if (passend.length === 0) continue;
    for (const backdrop of passend) {
      assert.equal(backdrop.mapPreset, preset);
    }
    // Und die Auswahl für dieses Gelände liefert auch nur passende Kulissen.
    const gewaehlt = pickBackdrop(12345, preset);
    assert.equal(gewaehlt.mapPreset, preset,
      `Gelände ${preset} bekam Kulisse ${gewaehlt.key} (${gewaehlt.mapPreset})`);
  }
});

test('Bei unbekanntem Gelände wird trotzdem eine Kulisse geliefert', () => {
  // Sonst bliebe der Hintergrund leer.
  const kulisse = pickBackdrop(42, 'gibtsnicht');
  assert.ok(kulisse, 'Es muss immer eine Kulisse geben');
  assert.ok(kulisse.file);
});

test('getBackdrop findet jede Kulisse über ihren Schlüssel', () => {
  for (const backdrop of ALL_BACKDROPS) {
    const [biomeId, variantId] = backdrop.key.split('/');
    const gefunden = getBackdrop(biomeId, variantId);
    assert.ok(gefunden, `${backdrop.key} nicht gefunden`);
    assert.equal(gefunden.file, backdrop.file);
  }
  assert.equal(getBackdrop('gibtsnicht', 'auchnicht'), null);
});

// ------------------------------------------------------------------ Ladepfad

test('Das Lade-Muster im Renderer trifft die Bilder wirklich', () => {
  // Diese Prüfung existiert wegen eines echten Fehlers: Das Glob-Muster stand als
  // `../assets/backdrops/*.jpg` im Renderer. Von `src/client/` aus zeigt `../`
  // auf `src/` — das Muster fand nichts und lieferte stillschweigend eine leere
  // Liste. Kein Fehler, kein Bild, kein Hinweis.
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'renderer.js'), 'utf8');
  const treffer = /import\.meta\.glob\(\s*'([^']+)'/.exec(quelle);
  assert.ok(treffer, 'Kein Glob-Muster im Renderer gefunden');
  const muster = treffer[1];

  // Muster gegen das Verzeichnis des Renderers auflösen.
  const rendererDir = path.join(ROOT, 'src', 'client');
  const relativ = muster.replace(/^\.\//, '');
  const gesucht = path.join(rendererDir, path.dirname(relativ));
  assert.equal(path.resolve(gesucht), path.resolve(BILD_DIR),
    `Das Muster „${muster}" zeigt auf ${path.resolve(gesucht)} statt auf ${BILD_DIR}`);

  const endung = path.extname(muster);
  const gefunden = fs.readdirSync(gesucht).filter(f => f.endsWith(endung));
  assert.equal(gefunden.length, ALL_BACKDROPS.length,
    `Das Muster findet ${gefunden.length} Bilder, der Katalog kennt ${ALL_BACKDROPS.length}`);
});

test('Der Renderer bildet den Nachschlage-Schlüssel wie Vite ihn vergibt', () => {
  // Vite vergibt die Schlüssel MIT dem Präfix aus dem Muster (also
  // „./assets/backdrops/..."). Ein anderer Schlüssel beim Nachschlagen trifft
  // nichts und der Hintergrund bleibt leer.
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'client', 'renderer.js'), 'utf8');
  const globMuster = /import\.meta\.glob\(\s*'([^']+)'/.exec(quelle)[1];
  const praefix = globMuster.slice(0, globMuster.lastIndexOf('/') + 1);

  const nachschlagen = /BACKDROP_URLS\[`([^`]+)`\]/.exec(quelle);
  assert.ok(nachschlagen, 'Kein Nachschlagen der Kulissen-URL gefunden');
  const schluesselMuster = nachschlagen[1];
  assert.ok(schluesselMuster.startsWith(praefix),
    `Nachgeschlagen wird „${schluesselMuster}", Vite vergibt aber „${praefix}..."`);

  // Und der Schlüssel muss den Dateinamen enthalten.
  for (const backdrop of ALL_BACKDROPS.slice(0, 3)) {
    const schluessel = schluesselMuster.replace('${backdrop.file}', backdrop.file);
    assert.equal(schluessel, `${praefix}${backdrop.file}`);
  }
});


// ------------------------------------------------------------------ Bodenfarbe

test('Jede Kulisse hat eine eigene Bodenfarbe', () => {
  // Der Boden wird prozedural gezeichnet. Über einer Eiskulisse ergab ein
  // einziger grüner Wert grünes Gras auf Packeis.
  const fehlend = ALL_BACKDROPS.filter(b => !TERRAIN_PALETTES[b.key]).map(b => b.key);
  assert.deepEqual(fehlend, [], `Ohne Bodenfarbe: ${fehlend.join(', ')}`);

  const ueberzaehlig = Object.keys(TERRAIN_PALETTES)
    .filter(key => !ALL_BACKDROPS.some(b => b.key === key));
  assert.deepEqual(ueberzaehlig, [], `Bodenfarbe ohne Kulisse: ${ueberzaehlig.join(', ')}`);
});

test('Die Bodenfarben sind gültige, unterschiedliche Farbwerte', () => {
  const gesehen = new Set();
  for (const [key, palette] of Object.entries(TERRAIN_PALETTES)) {
    for (const [rolle, farbe] of [['surface', palette.surface], ['deep', palette.deep]]) {
      assert.ok(Array.isArray(farbe) && farbe.length === 3, `${key}.${rolle}: kein RGB-Tripel`);
      for (const wert of farbe) {
        assert.ok(Number.isInteger(wert) && wert >= 0 && wert <= 255,
          `${key}.${rolle}: ungültiger Wert ${wert}`);
      }
    }
    // Die Tiefe muss dunkler sein als die Oberfläche, sonst wirkt das Gelände
    // nach oben hin heller als nach unten.
    const helligkeit = f => f[0] + f[1] + f[2];
    assert.ok(helligkeit(palette.deep) < helligkeit(palette.surface),
      `${key}: die Tiefe ist nicht dunkler als die Oberfläche`);

    gesehen.add(palette.surface.join(','));
  }
  // Wären alle gleich, hätte die Zuordnung keinen Zweck.
  assert.ok(gesehen.size >= 40,
    `Nur ${gesehen.size} verschiedene Oberflächenfarben bei ${ALL_BACKDROPS.length} Kulissen`);
});

test('paletteFor liefert die Farbe der Kulisse oder die Vorgabe', () => {
  for (const backdrop of ALL_BACKDROPS) {
    assert.deepEqual(paletteFor(backdrop), TERRAIN_PALETTES[backdrop.key],
      `${backdrop.key}: falsche Bodenfarbe`);
  }
  assert.deepEqual(paletteFor(null), DEFAULT_TERRAIN_PALETTE);
  assert.deepEqual(paletteFor({ key: 'gibtsnicht/x' }), DEFAULT_TERRAIN_PALETTE);
});

test('Helle Kulissen bekommen hellen, dunkle dunklen Boden', () => {
  // Stichproben: die Zuordnung muss inhaltlich stimmen, nicht nur formal.
  const helleKulissen = [
    'maritime/arctic_ice', 'alpine/winter_snow', 'forest/winter_forest',
    'hyperreal/polar_station', 'western/winter_frontier', 'island/caribbean_day',
  ];
  const dunkleKulissen = [
    'cosmos/black_hole', 'caverns/lava_tube', 'noir/harbor_docks',
    'urban/neon_night', 'maritime/storm_night',
  ];

  const helligkeit = key => {
    const f = TERRAIN_PALETTES[key].surface;
    return (f[0] + f[1] + f[2]) / 3;
  };
  // Der bisherige grüne Boden lag bei rund 109.
  for (const key of helleKulissen) {
    assert.ok(helligkeit(key) > 150,
      `${key}: Boden zu dunkel für eine helle Szene (${helligkeit(key).toFixed(0)})`);
  }
  for (const key of dunkleKulissen) {
    assert.ok(helligkeit(key) < 110,
      `${key}: Boden zu hell für eine dunkle Szene (${helligkeit(key).toFixed(0)})`);
  }
});

// ------------------------------------------------------------------ Vorauswahl

/**
 * Geländeformen ohne eigene Kulissengruppe.
 *
 * Die Liste ist LEER — alle acht Formen haben ein eigenes Leitbiom mit eigenen
 * Bildern. Sie bleibt als Prüfstelle stehen: Eine neue Geländeform, die ohne
 * Kulissen hinzukommt, muss sich hier eintragen, und der Test darüber hält sie
 * dann namentlich fest, statt sie stillschweigend durchzulassen.
 *
 * Ohne Leitbiom fällt `pickScenery` auf `forest` zurück — eine „Flut" sähe aus
 * wie ein Wald. Genau dieser Zustand ist damit für alle Formen behoben.
 */
const OHNE_LEITBIOM = [];

test('Jede Geländeform hat ein eigenes Leitbiom', () => {
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    const leitbiom = PRIMARY_BIOME_BY_PRESET[preset];
    if (OHNE_LEITBIOM.includes(preset)) {
      assert.equal(leitbiom, undefined,
        `${preset} hat jetzt ein Leitbiom (${leitbiom}) — dann bitte aus OHNE_LEITBIOM entfernen`);
      continue;
    }
    assert.ok(leitbiom, `Gelände ${preset} hat kein Leitbiom`);

    const biome = BACKDROP_BIOMES.find(b => b.id === leitbiom);
    assert.ok(biome, `Leitbiom ${leitbiom} existiert nicht`);
    assert.equal(biome.mapPreset, preset,
      `Leitbiom ${leitbiom} gehört zu ${biome.mapPreset}, nicht zu ${preset}`);
  }
});

test('Verschiedene Geländeformen bekommen verschiedene Biome', () => {
  // Jede Geländeform mit Leitbiom hat ein EIGENES — sonst wäre die Auswahl eine
  // Illusion. (Formen ohne Kulissen stehen nicht in der Tabelle.)
  const werte = Object.values(PRIMARY_BIOME_BY_PRESET);
  assert.equal(new Set(werte).size, werte.length,
    `Ein Biom ist Leitbiom für mehrere Geländeformen: ${werte.join(', ')}`);
});

test('Die Vorauswahl bleibt beim Leitbiom', () => {
  // Über viele Seeds hinweg darf nur das Leitbiom herauskommen.
  for (const [preset, erwartet] of Object.entries(PRIMARY_BIOME_BY_PRESET)) {
    for (let seed = 0; seed < 30; seed++) {
      const kulisse = pickBackdrop(seed, preset);
      assert.equal(kulisse.biomeId, erwartet,
        `${preset} mit Seed ${seed} ergab ${kulisse.key} statt eines ${erwartet}-Motivs`);
      assert.equal(kulisse.mapPreset, preset);
    }
  }
});

test('Alle sechzig Kulissen sind auswählbar', () => {
  // Die Vorauswahl darf die übrigen Kulissen nicht unerreichbar machen: über die
  // ausdrückliche Wahl muss jede erreichbar sein.
  const erreichbar = new Set();
  for (const biome of BACKDROP_BIOMES) {
    for (const variante of biome.variants) {
      const gefunden = getBackdrop(biome.id, variante.id);
      assert.ok(gefunden, `${biome.id}/${variante.id} nicht wählbar`);
      erreichbar.add(gefunden.key);
    }
  }
  // Abgeleitet, nicht fest: Jede Kulisse im Katalog muss über die ausdrückliche
  // Wahl erreichbar sein. Eine feste 60 hätte beim nächsten Biom nichts gesagt.
  assert.equal(erreichbar.size, ALL_BACKDROPS.length);
  assert.ok(erreichbar.size >= 60, `Nur ${erreichbar.size} Kulissen erreichbar`);
});
