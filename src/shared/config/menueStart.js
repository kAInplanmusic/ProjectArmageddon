/**
 * Wie das Menü eine lokale Partie startet (QV-1, 2026-11-17).
 *
 * Das Menü baut immer eine autonome Karte (`kartentyp: 'autonom'`): Erst sie trägt Stofffeld,
 * Biom-Materialien, Feuer und Lava. Ohne `kartentyp` entsteht die alte Einheitskarte, auf der das
 * Biom keine Spielwirkung hat (gemessen 2026-11-17: 21 Biome, 1 Verlauf).
 *
 * Messwerkzeuge (Bot-Partien, Balance) nehmen denselben Wert, damit sie das Spiel messen, das
 * Spieler sehen. `tests/messung-wie-menue.test.js` hält beide Seiten zusammen.
 *
 * ## Die Regelfassungen (QV-6-Fund, 2026-11-18)
 *
 * Das Menü übergibt dem Motor außer dem Kartentyp die STANDARD-Fassung jeder Regelfamilie (Wind je Zug, Hagel, Seil,
 * Günther, …). Der Motor selbst startet ohne Angabe mit dem ALTSTAND jeder Familie (damit alte Aufzeichnungen
 * bitgleich laufen). Messwerkzeuge, die nur `kartentyp` übergaben, maßen deshalb ein Spiel mit Altregeln, nicht das
 * Menüspiel. `MENUE_FASSUNGEN` ist die EINE Liste, die Menü (`main.js`) und Messwerkzeuge (`bot-partien.mjs`) lesen.
 */
import { GUENTHER_FASSUNG_STANDARD } from './guenther.js';
import { COOKIE_STANDARD } from './cookie.js';
import { FEUER_STANDARD } from './feuer.js';
import { BEWEGUNG_STANDARD } from './bewegung.js';
import { ZUGREGELN_STANDARD } from './zugregeln.js';
import { KLASSEN_STANDARD } from './klassen-fassung.js';
import { BODENOBJEKTE_STANDARD } from './bodenobjekte.js';
import { SEIL_STANDARD } from './seil.js';
import { WIND_STANDARD } from './wind.js';
import { HAGEL_STANDARD } from './hagel.js';
import { BIOMREGELN_STANDARD } from './biomregeln.js';
import { KIT_AUSRUESTUNG } from './loadouts.js';

export const MENUE_KARTENTYP = 'autonom';

/** Die Regelfassungen, mit denen das Menü eine neue lokale Partie startet. Beim Anlegen einer neuen Familie hier ergänzen. */
export const MENUE_FASSUNGEN = Object.freeze({
  guenther: GUENTHER_FASSUNG_STANDARD,
  cookie: COOKIE_STANDARD,
  feuer: FEUER_STANDARD,
  bewegung: BEWEGUNG_STANDARD,
  zugregeln: ZUGREGELN_STANDARD,
  klassen: KLASSEN_STANDARD,
  bodenobjekte: BODENOBJEKTE_STANDARD,
  seil: SEIL_STANDARD,
  wind: WIND_STANDARD,
  hagel: HAGEL_STANDARD,
  biomregeln: BIOMREGELN_STANDARD,
  kit: KIT_AUSRUESTUNG, // Startausrüstung je Figur (TODO 2.17)
});
