/**
 * Lädt die Charakterbilder und ordnet sie dem Katalog zu.
 *
 * Die 81 Figuren wurden mit `scripts/extract_factions.py` aus den Fraktionsbögen
 * geschnitten und liegen als freigestellte PNG unter assets/characters/.
 *
 * ACHTUNG beim Pfad: Das Muster in `import.meta.glob` ist relativ zu DIESER
 * Datei. Dasselbe ist bei den Waffen-Icons und den Kulissen schon schiefgegangen
 * — ein um eine Ebene falscher Pfad liefert still eine leere Liste, ohne Fehler.
 * `tests/factions.test.js` prüft das Muster deshalb gegen die Dateien auf der
 * Platte.
 *
 * @module roster
 */
import { CHARACTERS, FACTIONS, getFaction, charactersOf } from '../shared/config/factions.js';

/** Alle Bilder, von Vite aufgelöst. Schlüssel: `./assets/characters/<fraktion>/<datei>`. */
const BILDER = import.meta.glob('./assets/characters/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Liefert die URL eines Charakterbildes.
 *
 * @param {object} character Eintrag aus CHARACTERS
 * @returns {string|null}
 */
export function spriteUrl(character) {
  if (!character) return null;
  return BILDER[`./assets/characters/${character.faction}/${character.sprite}`] ?? null;
}

/** Wie viele Bilder tatsächlich geladen wurden. */
export function spriteCount() {
  return Object.keys(BILDER).length;
}

/**
 * Katalog mit aufgelösten Bild-URLs.
 *
 * Wird von der Auswahl im Menü genutzt. Charaktere ohne Bild bleiben im Katalog,
 * aber mit `url: null` — sichtbar als fehlendes Bild statt als stiller Ausfall.
 */
export function rosterWithSprites() {
  return CHARACTERS.map(c => ({ ...c, url: spriteUrl(c) }));
}

/** Die Fraktionen mit ihren Charakteren und Bild-URLs. */
export function factionsWithSprites() {
  return FACTIONS.map(f => ({
    ...f,
    characters: charactersOf(f.id).map(c => ({ ...c, url: spriteUrl(c) })),
  }));
}

export { getFaction, charactersOf };
export default rosterWithSprites;
