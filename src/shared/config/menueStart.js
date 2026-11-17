/**
 * Wie das Menü eine lokale Partie startet (QV-1, 2026-11-17).
 *
 * Das Menü baut immer eine autonome Karte (`kartentyp: 'autonom'`): Erst sie trägt Stofffeld,
 * Biom-Materialien, Feuer und Lava. Ohne `kartentyp` entsteht die alte Einheitskarte, auf der das
 * Biom keine Spielwirkung hat (gemessen 2026-11-17: 21 Biome, 1 Verlauf).
 *
 * Messwerkzeuge (Bot-Partien, Balance) nehmen denselben Wert, damit sie das Spiel messen, das
 * Spieler sehen. `tests/messung-wie-menue.test.js` hält beide Seiten zusammen.
 */
export const MENUE_KARTENTYP = 'autonom';
