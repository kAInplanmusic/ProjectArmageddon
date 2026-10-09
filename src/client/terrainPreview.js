/**
 * Clientseitige Terrain-Vorschau für den Online-Modus.
 *
 * Das Terrain ist eine reine Funktion aus Match-Seed, Preset und Kartengröße. Der
 * Client erzeugt deshalb exakt dieselbe Landschaft wie der Server, ohne die
 * Simulation zu duplizieren. Zerstörung wird anschliessend über die Ereignisse des
 * Servers (terrain_destroyed, maelstrom_contract) auf dieselbe Weise nachgezogen
 * wie lokal.
 *
 * @module terrainPreview
 */
import { CollisionMask, eachCraterCell } from '../engine/terrain/collisionMask.js';
import { generateTerrain } from '../shared/terrainGen.js';
import { erzeugeAutonomeKarte } from '../shared/terrainGen3.js';
import { MatchSeedManager } from '../shared/seed.js';
import { MAP_SIZES, mapSizeFor } from '../engine/match.js';

/**
 * Die Naht, an der ein `lobby_snapshot` in Terrain-Eingaben uebersetzt wird.
 *
 * WARUM SIE EXISTIERT (Befund P1, 2026-10-02): Der Server schickt `kartentyp` im
 * Snapshot mit (`gameServer.js:488`), aber der Client las beim Terrain-Aufbau nur
 * `seed`, `preset` und `orientation` und warf `payload.kartentyp` weg. Folge: Der
 * Server baute die Karte aus `erzeugeAutonomeKarte`, der Client zeigte eine aus
 * `generateTerrain` — gemessen 34,23 % abweichende Zellen und 106 px anderer
 * Wasserstand. Man spielte auf einer Karte, die man nicht sah.
 *
 * Diese Funktion macht aus dem Snapshot EINE Quelle fuer alle Terrain-Eingaben.
 * Sie ist bewusst der einzige Ort, an dem die Felder ausgelesen werden — wer
 * spaeter ein Feld ergaenzt, ergaenzt es hier und nicht an jeder Aufrufstelle.
 *
 * Rueckfallwerte: Der Client setzt `preset='hills'` und `kartentyp='autonom'`
 * (main.js:444) fuer das EIGENE Spiel. Fehlt ein Feld im Snapshot (aelterer
 * Server), greift genau dieser Rueckfall — der alte Pfad bleibt damit erhalten.
 *
 * @param {object} payload - der `lobby_snapshot` (oder ein Teil davon)
 * @param {object} [rueckfall] - Werte, die fuer fehlende Felder gelten
 * @returns {{seed: *, preset: string, orientation: string, kartentyp: string|null}}
 */
export function terrainQuelleFuer(payload = {}, rueckfall = {}) {
  const {
    preset: presetRueckfall = 'hills',
    orientation: orientationRueckfall = 'landscape',
    kartentyp: kartentypRueckfall = null,
  } = rueckfall;
  return {
    seed: payload.seed ?? rueckfall.seed ?? null,
    preset: payload.preset ?? presetRueckfall,
    orientation: payload.orientation ?? orientationRueckfall,
    kartentyp: payload.kartentyp ?? kartentypRueckfall,
  };
}

/**
 * @param {number} seed
 * @param {string} [preset='hills']
 * @param {string} [orientation='landscape'] - 'landscape' oder 'portrait'
 * @param {string|null} [kartentyp=null] - 'autonom' waehlt den Server-Generator
 */
export function buildTerrainForSeed(seed, preset = 'hills', orientation = 'landscape', kartentyp = null) {
  const masse = mapSizeFor(orientation);
  const manager = new MatchSeedManager(seed);
  /*
   * DERSELBE GENERATOR WIE DER SERVER, wenn eine autonome Karte verlangt ist.
   *
   * Der Server baut sie ueber `terrainBuilder.js:87` mit `erzeugeAutonomeKarte`
   * und dem RNG-Zweig 'TERRAIN' — hier wird genau derselbe Aufruf gefahren, mit
   * denselben drei Feldern (`rng`, `width`, `height`). Der Generator liest nur
   * diese drei; `events`/`statuses`/`world` gibt der Serverpfad mit, sie werden
   * dort aber nicht vom Generator gelesen — deshalb ist die Karte hier
   * Bit fuer Bit dieselbe (belegt in tests/client-terrain-gleichheit.test.js,
   * Determinismus-Test).
   */
  const rng = manager.getSubRng('TERRAIN');
  const gebaut = kartentyp === 'autonom'
    ? (() => {
      const k = erzeugeAutonomeKarte({ rng, width: masse.width, height: masse.height });
      return { bitmap: k.bitmap, waterLevel: k.wasserY };
    })()
    : generateTerrain({ rng, width: masse.width, height: masse.height, preset });
  const { bitmap, waterLevel } = gebaut;
  return {
    bitmap,
    mask: CollisionMask.fromBitmap(bitmap, masse.width, masse.height),
    waterLevel,
    width: masse.width,
    height: masse.height,
  };
}

/**
 * Trägt einen Krater in die Client-Karte ein (Bitmap UND Maske).
 *
 * Fund (belegt, Audit 2026-10-09): Online wurde ein Krater nur auf die
 * Zeichenfläche gestanzt. Die Bitmap, gegen die die Zielvorschau rechnet
 * (`main.js`, `isSolid`), blieb unzerstört — die vorhergesagte Bahn prallte an
 * Boden ab, der längst weg war.
 */
export function applyCraterToTerrain(terrain, x, y, radius) {
  if (!terrain?.bitmap) return;
  eachCraterCell(terrain.width, terrain.height, x, y, radius, (px, py) => {
    terrain.bitmap[py * terrain.width + px] = 0;
  });
  terrain.mask?.punchCrater(x, y, radius);
}

export { MAP_SIZES };
export default buildTerrainForSeed;
