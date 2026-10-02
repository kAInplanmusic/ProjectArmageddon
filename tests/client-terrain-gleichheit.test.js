/**
 * Der Client baut das FREMDE Terrain mit demselben Generator wie der Server.
 *
 * WARUM DIESER TEST EXISTIERT (Befund P1, docs/verkabelung.md → Pipeline 3):
 * Der Server baut die Karte fuer die SIMULATION aus `erzeugeAutonomeKarte`
 * (`src/shared/terrainGen3.js`, ueber terrainBuilder.js:87). Der Client baute die
 * ANZEIGE aus `generateTerrain` (`src/shared/terrainGen.js`) — ein anderer
 * Generator. Gemessen (Seed 3367130477, 2560x1440): 1.262.018 von 3.686.400
 * Zellen abweichend = 34,23 %, Wasserstand 1103 gegen 1209 (106 px).
 *
 * Man spielte also auf einer Karte, die man nicht sah. Der Client bekam
 * `kartentyp` im `lobby_snapshot` (gameServer.js:488) und warf das Feld weg
 * (main.js:1084).
 *
 * Dieser Test haelt die Gleichheit als Vertrag fest. Er prueft NICHT, dass die
 * Bitmap mit dem Server-Bitmap zeichengleich ist, sondern dass der Client mit
 * `kartentyp='autonom'` denselben Generator und denselben RNG-Zweig benutzt —
 * die Bitmap selbst ist dann eine reine Funktion aus beidem.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerrainForSeed, terrainQuelleFuer } from '../src/client/terrainPreview.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { generateTerrain } from '../src/shared/terrainGen.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { mapSizeFor } from '../src/engine/match.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const SEED = 3367130477;
const ORIENT = 'landscape';

function bitmap(seed, kartentyp, orientation = ORIENT) {
  const masse = mapSizeFor(orientation);
  const manager = new MatchSeedManager(seed);
  const rng = manager.getSubRng('TERRAIN');
  if (kartentyp === 'autonom') {
    return erzeugeAutonomeKarte({ rng, width: masse.width, height: masse.height });
  }
  return generateTerrain({ rng, width: masse.width, height: masse.height, preset: 'hills' });
}

function abweichendeZellen(a, b) {
  assert.equal(a.length, b.length, 'Bitmaps muessen gleich gross sein');
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
  return n;
}

test('Der Befund ist reproduzierbar: die zwei Generatoren bauen wirklich verschiedene Karten', () => {
  // Ohne diesen Nachweis waere der Test unten wertlos: waeren beide Generatoren
  // ohnehin gleich, belegte der Fix nichts.
  const server = bitmap(SEED, 'autonom');
  const alt = bitmap(SEED, null);

  const diff = abweichendeZellen(server.bitmap, alt.bitmap);
  const prozent = (100 * diff) / server.bitmap.length;

  // Die gemessenen 34,23 % — hier als Bereich, damit ein Generator-Umbau den
  // Test nicht sofort rot macht, ein Rueckfall auf "gleich" ihn aber faengt.
  assert.ok(
    prozent > 30 && prozent < 38,
    `Abweichung soll bei ~34 % liegen, gemessen ${prozent.toFixed(2)} % (${diff} Zellen)`,
  );
  assert.notEqual(
    server.wasserY,
    alt.waterLevel,
    'Auch der Wasserstand muss abweichen, sonst pruefen wir den falschen Befund',
  );
});

test('kartentyp=\'autonom\' laesst den Client denselben Generator benutzen wie den Server', () => {
  const client = buildTerrainForSeed(SEED, 'hills', ORIENT, 'autonom');
  const server = bitmap(SEED, 'autonom');

  assert.equal(
    abweichendeZellen(server.bitmap, client.bitmap),
    0,
    'Client und Server muessen bei kartentyp=autonom Bit fuer Bit dieselbe Karte bauen',
  );
  assert.equal(
    client.waterLevel,
    server.wasserY,
    'Auch der Wasserstand muss identisch sein (106 px Abweichung waren der Befund)',
  );
  assert.ok(
    client.bitmap.length === server.bitmap.length &&
      client.width === mapSizeFor(ORIENT).width &&
      client.height === mapSizeFor(ORIENT).height,
    'Masse muessen der Kartengroesse entsprechen',
  );
});

test('Determinismus: derselbe Aufruf liefert zweimal dieselbe Karte', () => {
  // Die offene Frage aus dem Bericht: bleibt `erzeugeAutonomeKarte` im
  // CLIENT-Kontext deterministisch, obwohl der Serverpfad ihm zusaetzlich
  // events/statuses/world mitgibt? Der Generator liest nur `rng`, `width`,
  // `height` — hier wird belegt, dass das Fehlen der uebrigen Felder nichts
  // veraendert.
  const eins = buildTerrainForSeed(SEED, 'hills', ORIENT, 'autonom');
  const zwei = buildTerrainForSeed(SEED, 'hills', ORIENT, 'autonom');

  assert.equal(abweichendeZellen(eins.bitmap, zwei.bitmap), 0);
  assert.equal(eins.waterLevel, zwei.waterLevel);
});

test('Der Kollisionsumriss passt zur neuen Bitmap', () => {
  // Die Maske wurde frueher aus dem generateTerrain-Bitmap gebaut. Wird der
  // Generator getauscht, muss sie mitwandern — sonst kollidiert der Spieler mit
  // einer Landschaft, die nicht die gezeichnete ist (unsichtbare Waende).
  const client = buildTerrainForSeed(SEED, 'hills', ORIENT, 'autonom');
  const masse = mapSizeFor(ORIENT);
  let belegt = 0;
  for (let i = 0; i < client.bitmap.length; i += 1) if (client.bitmap[i]) belegt += 1;
  assert.ok(belegt > 0, 'Die Karte darf nicht leer sein');
  assert.equal(client.mask.width, masse.width);
  assert.equal(client.mask.height, masse.height);
});

test('Ohne kartentyp bleibt der alte Weg erhalten (Rueckfall auf das Preset)', () => {
  // terrainPreview wird auch von Werkzeugen und Tests ohne Match benutzt. Der
  // alte Pfad darf nicht verschwinden — sonst bricht jede Vorschau ohne Lobby.
  const ohne = buildTerrainForSeed(SEED, 'hills', ORIENT);
  const alt = bitmap(SEED, null);
  assert.equal(abweichendeZellen(ohne.bitmap, alt.bitmap), 0);
});

test('terrainQuelleFuer reicht den Kartentyp unveraendert durch', () => {
  // Diese Funktion ist die Naht, an der main.js den Snapshot auswertet. Sie muss
  // `kartentyp` weitergeben und darf es nicht stillschweigend fallenlassen —
  // genau das war die Ursache des Befunds.
  assert.equal(terrainQuelleFuer({ seed: SEED, preset: 'hills', orientation: ORIENT, kartentyp: 'autonom' }).kartentyp, 'autonom');
  assert.equal(terrainQuelleFuer({ seed: SEED, preset: 'hills', orientation: ORIENT }).kartentyp, null);
  assert.equal(terrainQuelleFuer({ seed: SEED, kartentyp: 'autonom' }).orientation, 'landscape');
  assert.equal(terrainQuelleFuer({ seed: SEED }).preset, 'hills');
});

/*
 * STRUKTURWACHE fuer die eigentliche Fehlerstelle.
 *
 * Warum ein Quelltext-Test und kein Verhaltenstest: `#buildRemoteTerrain` ist
 * eine private Methode mit Renderer, Kulisse und HUD — sie im Test hochzuziehen
 * hiesse, den halben Client zu bauen. Genau deshalb ist der Fehler unbemerkt
 * geblieben. Der Befund war eine WEGFALLENE Uebergabe; die kann man am Quelltext
 * so genau pruefen wie am Verhalten.
 *
 * Die Mutation, die das belegt: In main.js `kartentyp: payload.kartentyp` durch
 * `kartentyp: null` zu ersetzen laesst ALLE Verhaltenstests oben GRUEN — die
 * Fehlerstelle liegt naemlich nicht in terrainPreview.js. Erst dieser Test faengt
 * sie (selbst nachgemessen).
 */
test('main.js: der Snapshot wird ueber terrainQuelleFuer ausgewertet, nicht Feld fuer Feld', () => {
  const main = ohneKommentare(
    fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8'),
  );

  // (a) Der Aufruf muss die Naht benutzen — sonst faellt kartentyp wieder weg.
  assert.match(
    main,
    /this\.#buildRemoteTerrain\(terrainQuelleFuer\(payload,/,
    'Der Terrain-Aufbau muss terrainQuelleFuer(payload, …) benutzen',
  );

  // (b) Die alte, fehlerhafte Uebergabe darf nicht zurueckkehren. Sie ist an
  //     genau dieser Signatur erkennbar (seed/preset/orientation einzeln).
  assert.doesNotMatch(
    main,
    /#buildRemoteTerrain\(payload\.seed/,
    'payload.seed darf nicht mehr einzeln uebergeben werden — dabei ging kartentyp verloren',
  );

  // (c) Die private Methode muss den Kartentyp an den Generator weitergeben.
  assert.match(
    main,
    /buildTerrainForSeed\(seed, preset, orientation, kartentyp\)/,
    'kartentyp muss bis buildTerrainForSeed durchgereicht werden',
  );

  // (d) Auch der NetworkClient soll den Kartentyp kennen (main.js:1059 uebergibt
  //     ihn bereits) — sonst ist die Angabe dort wirkungslos.
  assert.match(
    main,
    /new NetworkClient\(\{[\s\S]*?kartentyp,/,
    'kartentyp wird an den NetworkClient uebergeben',
  );
});
