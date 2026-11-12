/**
 * Kartenwahl: Stufe `kolossal` und die drei runden Kartenarten (Geländefassung 14, TODO N-40) für Menü, Lobby und Client-Protokoll.
 *
 * Reine Funktionen ohne DOM und ohne Zufall; sie ändern keine Engine-Regel. Die Engine kennt `kolossal` (`engine/karte.js`:
 * nur 1:1 = 5760 × 5760 = 33,18 Mio. Pixel, jedes andere Format behält die Maße von `riesig`) und die runden Arten
 * (`config/gelaende.js`: `KARTENARTEN_RUND`, erst ab Fassung 14). Dieses Modul legt fest, was Menü und Server daraus machen:
 *
 *  - `wirksameGroesse`: `kolossal` auf einem anderen Format als 1:1 wird zu `riesig` (gleiche Maße und Zugzeit wie in der Engine,
 *    aber die Lobby nennt dann nichts, was es nicht gibt).
 *  - `pruefeKolossal`: darf dieses Gerät die Stufe anbieten? Die Terrain-Ebene ist EIN Canvas in Kartengröße
 *    (`renderer.buildTerrainLayer`), dazu Pflanzen-Ebene und Bühne. iOS-Safari begrenzt ein Canvas auf 16 777 216 px (4096²);
 *    5760² = 33 177 600 px liegt doppelt darüber (der Canvas bliebe leer). Dort ist die Stufe gesperrt. Ebenso bei Lite
 *    (`flaechenBudgetMio` 3,7: die Karte wäre neunmal so groß wie das Budget). Bei Ultra (Budget 14) bleibt sie wählbar, aber
 *    mit Warnung (Speicher, Aufbauzeit). Die Zahlen sind Grenzen aus `grafikStufe.js`/Herstellerangabe, am Gerät NICHT gemessen.
 *
 * @module kartenWahl (liegt in engine/, weil shared nichts aus engine importieren darf)
 */
import { MAP_GROESSE_KOLOSSAL, MAP_SIZES_KOLOSSAL, normalisiereGroesse } from './karte.js';
import { KARTENARTEN_RUND } from '../shared/config/gelaende.js';

/** Das einzige Format, auf dem `kolossal` und die runden Arten gedacht sind. */
export const FORMAT_QUADRAT = '1:1';

/** Fläche der Stufe `kolossal` in Pixeln (33 177 600). */
export const KOLOSSAL_PIXEL = MAP_SIZES_KOLOSSAL[FORMAT_QUADRAT].width * MAP_SIZES_KOLOSSAL[FORMAT_QUADRAT].height;
/** Größte Canvasfläche von iOS-Safari (4096 × 4096). */
export const IOS_CANVAS_MAX_PIXEL = 16_777_216;
/** Kleinstes Flächenbudget (Mio. Pixel), bei dem `kolossal` noch angeboten wird (Ultra = 14; Lite = 3,7 sperrt). */
export const KOLOSSAL_MIN_BUDGET_MIO = 14;

/** Die runden Kartenarten mit deutscher Beschriftung für das Menü (Reihenfolge wie `KARTENARTEN_RUND`). */
export const RUNDE_ARTEN_MENUE = Object.freeze([
  Object.freeze({ wert: 'rundPlanet', name: 'Runder Planet' }),
  Object.freeze({ wert: 'rundeHoehle', name: 'Runde Höhle' }),
  Object.freeze({ wert: 'schwebendeInsel', name: 'Schwebende Insel' }),
]);

/** Ist das eine der drei runden Kartenarten? (Nur der Name; ob die Fassung sie kennt, prüft `normalisiereKartenart`.) */
export function istRundeKartenart(art) {
  return typeof art === 'string' && KARTENARTEN_RUND.includes(art);
}

/**
 * Die Stufe, die wirklich gespielt wird. `kolossal` gilt nur auf 1:1; auf jedem anderen Format entspricht sie `riesig`.
 * Unbekanntes wird wie in der Engine zur Vorgabe `mittel`.
 */
export function wirksameGroesse(groesse, format) {
  const stufe = normalisiereGroesse(groesse);
  return stufe === MAP_GROESSE_KOLOSSAL && format !== FORMAT_QUADRAT ? 'riesig' : stufe;
}

/**
 * Darf `kolossal` auf diesem Gerät gewählt werden?
 *
 * @param {{ios?: boolean, flaechenBudgetMio?: number|null}} geraet - `flaechenBudgetMio` aus den geltenden Grafik-Grenzen
 * @returns {{status: 'frei'|'warnung'|'gesperrt', grund: string}} `grund` ist ein deutscher Satz für die Anzeige (leer bei `frei`)
 */
export function pruefeKolossal({ ios = false, flaechenBudgetMio = null } = {}) {
  if (ios) {
    return {
      status: 'gesperrt',
      grund: 'Auf iPhone und iPad gesperrt: Die Karte hat 33,2 Mio. Pixel, Safari erlaubt höchstens 16,7 Mio. je Fläche. Die Anzeige bliebe leer.',
    };
  }
  // Ohne Angabe (Messung fehlt) wird nichts gesperrt; `Number(null)` wäre 0 und würde fälschlich sperren.
  const budget = flaechenBudgetMio === null || flaechenBudgetMio === undefined ? NaN : Number(flaechenBudgetMio);
  if (Number.isFinite(budget) && budget < KOLOSSAL_MIN_BUDGET_MIO) {
    return {
      status: 'gesperrt',
      grund: `Mit Grafik „Lite“ gesperrt: Die Karte hat 33,2 Mio. Pixel, Lite rechnet mit höchstens ${String(budget).replace('.', ',')} Mio. Wähle „Ultra“ oder „Automatisch“, wenn dein Gerät es schafft.`,
    };
  }
  if (Number.isFinite(budget) && budget * 1_000_000 < KOLOSSAL_PIXEL) {
    return {
      status: 'warnung',
      grund: 'Kolossal ist sehr groß (33,2 Mio. Pixel): braucht viel Arbeitsspeicher, baut langsam auf und kann auf schwächeren Geräten ruckeln oder abstürzen.',
    };
  }
  return { status: 'frei', grund: '' };
}

/** Erkennt iPhone, iPad und iPadOS (meldet sich als Mac mit Touch). `nav` ist `navigator` oder ein Ersatz im Test. */
export function istIos(nav = globalThis.navigator) {
  if (!nav) return false;
  const ua = String(nav.userAgent ?? '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1;
}
