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
import { CollisionMask, eachCraterCell, eachInsetCell } from '../engine/terrain/collisionMask.js';
import { generateTerrain } from '../shared/terrainGen.js';
import { erzeugeAutonomeKarte } from '../shared/terrainGen3.js';
import { MatchSeedManager } from '../shared/seed.js';
import { MAP_SIZES, mapSizeFor } from '../engine/match.js';
import { GELAENDE_ALT, GELAENDE_BIOME, loeseGelaende } from '../shared/config/gelaende.js';
import { ZERSTOERUNG_STOFF } from '../shared/config/zerstoerung.js';
import { geschuetztAm, stoffHash } from '../shared/stoffkarte.js';

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
 * @returns {{seed: *, preset: string, orientation: string, kartentyp: string|null, gelaende: number, biom: string|null, zerstoerung: number|null}}
 *   `gelaende`, `biom` (aufgelöstes Sonderbiom oder Wahl) und `zerstoerung` fehlen bei älteren Servern: dann gilt Fassung 1.
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
    gelaende: payload.gelaende ?? GELAENDE_ALT,
    biom: payload.biom ?? null,
    zerstoerung: payload.zerstoerung ?? null,
  };
}

/**
 * @param {number} seed
 * @param {string} [preset='hills']
 * @param {string} [orientation='landscape'] - 'landscape' oder 'portrait'
 * @param {string|null} [kartentyp=null] - 'autonom' waehlt den Server-Generator
 * @param {{gelaende?:number, biom?:string|null, zerstoerung?:number|null}} [fassung] - Geländefassung, Biomwahl und Zerstörungsfassung des Servers
 */
export function buildTerrainForSeed(seed, preset = 'hills', orientation = 'landscape', kartentyp = null, fassung = {}) {
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
      const g = loeseGelaende(fassung.gelaende ?? GELAENDE_ALT, fassung.biom ?? null, seed);
      const k = erzeugeAutonomeKarte({ rng, width: masse.width, height: masse.height, biom: g.sonderbiom, stoffe: g.gelaende >= GELAENDE_BIOME, fassung: g.gelaende });
      return { bitmap: k.bitmap, waterLevel: k.wasserY, stoffkarte: k.stoffkarte ?? null, sonderbiom: g.sonderbiom };
    })()
    : generateTerrain({ rng, width: masse.width, height: masse.height, preset });
  const { bitmap, waterLevel } = gebaut;
  const mask = CollisionMask.fromBitmap(bitmap, masse.width, masse.height);
  const stoffkarte = gebaut.stoffkarte ?? null;
  // Wie der Server: unzerstörbare Zellen schützt erst Zerstörungsfassung 5.
  const schutz = (fassung.zerstoerung ?? 0) >= ZERSTOERUNG_STOFF ? stoffkarte : null;
  mask.setzeSchutz(schutz);
  return {
    bitmap,
    mask,
    stoffkarte,
    schutz,
    sonderbiom: gebaut.sonderbiom ?? null,
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
export function applyCraterToTerrain(terrain, x, y, radius, tiefe = null) {
  if (!terrain?.bitmap) return;
  eachCraterCell(terrain.width, terrain.height, x, y, radius, (px, py) => {
    if (terrain.schutz && geschuetztAm(terrain.schutz, px, py)) return;
    terrain.bitmap[py * terrain.width + px] = 0;
  }, tiefe);
  terrain.mask?.punchCrater(x, y, radius, tiefe);
}

/**
 * Trägt EINEN Logeintrag der Server-Maske (`CollisionMask.craterLog`) in die
 * Client-Karte ein: einen Krater (`[x, y, radius]` / `[x, y, radius, tiefe]`) oder
 * eine gelandete Insel (`['s', dy, ...Spaltenläufe]`).
 */
export function applyLogEntryToTerrain(terrain, eintrag) {
  if (eintrag[0] === 's') {
    const [, dy, ...runs] = eintrag;
    applySettleToTerrain(terrain, dy, runs);
  } else if (eintrag[0] === 'x') {
    applyRemoveToTerrain(terrain, eintrag.slice(1));
  } else if (eintrag[0] === 'p') {
    applyAddToTerrain(terrain, eintrag.slice(1));
  } else if (eintrag[0] === 'r') {
    applySlumpToTerrain(terrain, eintrag.slice(1));
  } else {
    const [x, y, radius, tiefe = null] = eintrag;
    applyCraterToTerrain(terrain, x, y, radius, tiefe);
  }
}

/**
 * Trägt eine gelandete Geländeinsel in die Client-Karte ein (Bitmap UND Maske):
 * die Zellen der Spaltenläufe `runs = [x, y0, y1, ...]` wandern `dy` Zeilen nach
 * unten. Erst alles löschen, dann alles setzen — sonst löschte ein Lauf die
 * frisch gesetzten Zellen des Nachbarn. Der Eintrag geht wie auf dem Server ins
 * Log der Maske, damit die Zählung beider Seiten übereinstimmt.
 */
export function applySettleToTerrain(terrain, dy, runs) {
  if (!terrain?.bitmap || !(dy > 0)) return;
  const { width, height } = terrain;
  const setze = (x, y, fest) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    terrain.bitmap[y * width + x] = fest ? 1 : 0;
    terrain.mask?.setPixel(x, y, fest);
  };
  for (let i = 0; i + 2 < runs.length; i += 3) for (let y = runs[i + 1]; y <= runs[i + 2]; y++) setze(runs[i], y, false);
  for (let i = 0; i + 2 < runs.length; i += 3) for (let y = runs[i + 1]; y <= runs[i + 2]; y++) setze(runs[i], y + dy, true);
  terrain.mask?.logEintrag(['s', dy, ...runs]);
}

/** Setzt eine Zelle in Bitmap und Maske (außerhalb der Karte: nichts). */
function setzeZelle(terrain, x, y, fest) {
  if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return;
  terrain.bitmap[y * terrain.width + x] = fest ? 1 : 0;
  terrain.mask?.setPixel(x, y, fest);
}

/**
 * Fassung 4, Logeintrag `['x', ...Spaltenläufe]`: Zellen sind ersatzlos weg (Riss einer
 * gebrochenen Insel, abgeplatzte Brocken). Wie die Insel-Landung geht der Eintrag ins Log.
 */
export function applyRemoveToTerrain(terrain, runs) {
  if (!terrain?.bitmap) return;
  for (let i = 0; i + 2 < runs.length; i += 3) for (let y = runs[i + 1]; y <= runs[i + 2]; y++) setzeZelle(terrain, runs[i], y, false);
  terrain.mask?.logEintrag(['x', ...runs]);
}

/** Fassung 4, Logeintrag `['p', x, y, ...]`: Schutt hat sich abgesetzt (Zellen werden fest). */
export function applyAddToTerrain(terrain, zellen) {
  if (!terrain?.bitmap) return;
  for (let i = 0; i + 1 < zellen.length; i += 2) setzeZelle(terrain, zellen[i], zellen[i + 1], true);
  terrain.mask?.logEintrag(['p', ...zellen]);
}

/** Fassung 4, Logeintrag `['r', x1, y1, x2, y2, ...]`: Setzrutsch, die Zelle (x1, y1) wandert nach (x2, y2), der Reihe nach. */
export function applySlumpToTerrain(terrain, zuege) {
  if (!terrain?.bitmap) return;
  for (let i = 0; i + 3 < zuege.length; i += 4) {
    setzeZelle(terrain, zuege[i], zuege[i + 1], false);
    setzeZelle(terrain, zuege[i + 2], zuege[i + 3], true);
  }
  terrain.mask?.logEintrag(['r', ...zuege]);
}

/**
 * Trägt den Mahlstrom-Einschnitt (die ersten `inset` Spalten links und rechts)
 * in die Client-Karte ein: Bitmap UND Maske, über dieselbe Rechenvorschrift wie
 * der Server (`eachInsetCell`).
 *
 * Fund (belegt, Audit 2026-10-09): Online zog `maelstrom_contract` nur die
 * Zeichenfläche zusammen. Bitmap und Maske der Client-Karte behielten das
 * Gelände im Randstreifen, und wer danach beitrat, baute die Karte ohnehin aus
 * dem Seed. Idempotent: ein größerer Einschnitt umfasst den kleineren.
 */
export function applyInsetToTerrain(terrain, inset) {
  if (!terrain?.bitmap) return;
  terrain.einschnitt = Math.max(terrain.einschnitt ?? 0, inset);
  eachInsetCell(terrain.width, terrain.height, inset, (px, py) => {
    terrain.bitmap[py * terrain.width + px] = 0;
    terrain.mask?.setPixel(px, py, false);
  });
}

/** Hash der Client-Maske — dieselbe Funktion wie auf dem Server (`CollisionMask.hash`). */
export function terrainHash(terrain) {
  return terrain?.mask ? terrain.mask.hash() : null;
}

/**
 * Vergleicht die Client-Karte mit der `terrain_hash`-Meldung des Servers.
 *
 * Urteile: 'gleich', 'abweichung' (Karte neu bauen) oder 'abwarten'.
 * 'abwarten' gilt, wenn Hash UND Stand (Kraterzahl, Einschnitt) abweichen: dann
 * kann ein Ereignis noch unterwegs sein, und erst die zweite Meldung in Folge
 * (`wartet`) zählt als Abweichung. Stimmt der Stand überein und der Hash nicht,
 * ist die Karte sicher verfälscht — sofort 'abweichung'.
 *
 * @param {object} terrain - Client-Karte (`bitmap`, `mask`)
 * @param {{hash:number, craters:number, inset:number}} meldung
 * @param {boolean} [wartet=false] - schon die vorige Meldung wich ab
 */
export function bewerteTerrainHash(terrain, meldung, wartet = false) {
  const lokal = terrainHash(terrain);
  // Die Stoffkarte ändert sich im Spiel nie: ein Unterschied ist immer eine Abweichung des Nachbaus.
  if (terrain?.stoffkarte && meldung.stoffe !== undefined && stoffHash(terrain.stoffkarte) !== meldung.stoffe) {
    return { urteil: 'stoffe', lokal };
  }
  // Inseln im Fall stehen in der Server-Maske nicht: Der Vergleich wäre bis zur Landung falsch.
  if (lokal === null || lokal === meldung.hash || meldung.faellt > 0) return { urteil: 'gleich', lokal };
  const standGleich = terrain.mask.craterCount === meldung.craters
    && (terrain.einschnitt ?? 0) === (meldung.inset ?? 0);
  return { urteil: standGleich || wartet ? 'abweichung' : 'abwarten', lokal };
}

export { MAP_SIZES };
export default buildTerrainForSeed;
