/**
 * Lädt die Charakterbilder und ordnet sie dem Katalog zu.
 *
 * Die 81 Figuren wurden mit `scripts/extract_factions.py` aus den Fraktionsbögen
 * geschnitten und liegen als freigestellte PNG (echter Alphakanal) unter
 * assets/characters/ (256 px, für kleine Anzeigen bis ~128 px) und
 * assets/characters-hd/ (in Quellgröße, für Anzeigen darüber).
 *
 * ACHTUNG beim Pfad: Das Muster in `import.meta.glob` ist relativ zu DIESER
 * Datei. Dasselbe ist bei den Waffen-Ikonen und den Kulissen schon schiefgegangen
 * — ein um eine Ebene falscher Pfad liefert still eine leere Liste, ohne Fehler.
 * `tests/factions.test.js` prüft das Muster deshalb gegen die Dateien auf der
 * Platte.
 *
 * @module roster
 */
import { FACTIONS, getFaction, charactersOf } from '../shared/config/factions.js';

/** Alle Bilder, von Vite aufgelöst. Schlüssel: `./assets/characters/<fraktion>/<datei>`. */
const BILDER = import.meta.glob('./assets/characters/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Die HD-Porträts, LAZY: Vite macht daraus Lade-Funktionen statt sofort aufgelöster
 * URLs, die Bilder landen als eigene Dateien im Bundle und werden erst geholt, wenn
 * eine große Anzeige sie verlangt.
 */
const HD_BILDER = import.meta.glob('./assets/characters-hd/*/*.png', {
  query: '?url',
  import: 'default',
});

/**
 * Liefert die URL eines Charakterbildes.
 *
 * Genutzt von `factionsWithSprites` und der Figurenkarte im HUD.
 *
 * @param {object} character Eintrag aus CHARACTERS
 * @returns {string|null}
 */
export function spriteUrl(character) {
  if (!character) return null;
  return BILDER[`./assets/characters/${character.faction}/${character.sprite}`] ?? null;
}

/**
 * URL des HD-Porträts (für Anzeigen größer als ~128 px). Fällt auf das 256er
 * zurück, falls es zu der Figur kein HD-Bild gibt.
 *
 * @param {object} character Eintrag aus CHARACTERS
 * @returns {Promise<string|null>}
 */
export async function hdUrl(character) {
  if (!character) return null;
  const lader = HD_BILDER[`./assets/characters-hd/${character.faction}/${character.sprite}`];
  return lader ? lader() : spriteUrl(character);
}

/** Wie viele Bilder tatsächlich geladen wurden. */
export function spriteCount() {
  return Object.keys(BILDER).length;
}

/** Die Fraktionen mit ihren Charakteren und Bild-URLs. */
export function factionsWithSprites() {
  return FACTIONS.map(f => ({
    ...f,
    characters: charactersOf(f.id).map(c => ({ ...c, url: spriteUrl(c) })),
  }));
}

/*
 * HIER STAND `rosterWithSprites()` — entfernt am 2026-09-26.
 *
 * Beruhte auf dem Audit-Befund „Export ohne Leser". Nachgemessen mit
 * `grep -rn 'rosterWithSprites' src/ tests/ scripts/ tools/`: nur die eigene
 * Datei. `src/client/main.js:40` holt sich `{ factionsWithSprites, spriteCount }`
 * — nicht diese Funktion. Es gibt keinen Default-Import und keinen
 * Namespace-Import, der sie mitzöge.
 *
 * `factionsWithSprites()` leistet dasselbe, nur nach Fraktion gruppiert; die
 * flache Liste hatte keinen Abnehmer. Entfernt wurden die Funktion UND der
 * Default-Export (`export default rosterWithSprites`), der auf sie zeigte.
 *
 * IRRTUM, der beim Entfernen passierte (notiert, nicht weggeschrieben):
 * Der erste Anlauf löschte zusätzlich `factionsWithSprites` und die
 * Re-Export-Zeile — beides WIRD gebraucht (`main.js:2622` bzw. `main.js:40`).
 * Aufgefallen ist es am Lint (`no-unused-vars` für die Importe) und an einem
 * `grep` nach den Importeuren, nicht am Testlauf.
 *
 * Merksatz: Vor dem Entfernen eines Exports die IMPORTEURE lesen, nicht nur die
 * Leser des Namens — `main.js` importiert aus dieser Datei, ohne den Namen im
 * Quelltext je zu erwähnen.
 */
export { getFaction, charactersOf };
