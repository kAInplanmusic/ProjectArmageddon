/**
 * Playlist-Logik der Hintergrundmusik — reine Funktionen, ohne DOM und Audio.
 *
 * Getrennt von `musik.js`, damit sie unter `node --test` prüfbar ist (kein
 * `import.meta.glob`, kein Browser). Reine Darstellung: `Math.random` ist im
 * Client erlaubt (AGENTS.md §2 gilt nur für `src/engine` und `src/shared`) und
 * wird trotzdem als Parameter geführt, damit die Tests deterministisch sind.
 *
 * @module musikListe
 */

/** Die bekannten Einsatzorte eines Stücks. */
export const STIMMUNGEN = Object.freeze(['menu', 'match', 'intensiv']);

/**
 * Prüft ein Manifest und gibt die Fehler als Texte zurück (leer = in Ordnung).
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function pruefeManifest(manifest) {
  const fehler = [];
  const liste = manifest?.stuecke;
  if (!Array.isArray(liste) || liste.length === 0) return ['stuecke fehlt oder ist leer'];
  const ids = new Set();
  for (const [i, s] of liste.entries()) {
    const name = s?.id ?? `#${i}`;
    if (typeof s?.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) fehler.push(`${name}: id ungültig`);
    if (ids.has(s?.id)) fehler.push(`${name}: id doppelt`);
    ids.add(s?.id);
    if (typeof s?.titel !== 'string' || s.titel.trim() === '') fehler.push(`${name}: titel fehlt`);
    if (typeof s?.datei !== 'string' || !/^[\w-]+\.(mp3|ogg|opus)$/.test(s.datei)) fehler.push(`${name}: datei ungültig`);
    if (!(Number(s?.dauer) > 0)) fehler.push(`${name}: dauer fehlt`);
    if (!Array.isArray(s?.stimmung) || s.stimmung.length === 0
      || s.stimmung.some(m => !STIMMUNGEN.includes(m))) fehler.push(`${name}: stimmung ungültig`);
  }
  return fehler;
}

/**
 * Die Stücke für eine Stimmung. Gibt es für die Stimmung keines, gilt der
 * Rückfall: `intensiv` → `match`, alles andere → alle Stücke. Es gibt also
 * immer etwas zu spielen, solange das Manifest nicht leer ist.
 * @param {{stuecke: object[]}} manifest
 * @param {string} stimmung
 * @returns {object[]}
 */
export function stueckeFuer(manifest, stimmung) {
  const alle = manifest?.stuecke ?? [];
  const treffer = alle.filter(s => s.stimmung?.includes(stimmung));
  if (treffer.length > 0) return treffer;
  if (stimmung === 'intensiv') return stueckeFuer(manifest, 'match');
  return alle;
}

/**
 * Wählt das nächste Stück: zufällig, nie dasselbe wie das letzte (außer es gibt
 * nur eines) und – solange es noch ungespielte gibt – keines aus der laufenden
 * Runde („Mischen ohne Zurücklegen"). Ist die Runde voll, beginnt sie neu; das
 * Verbot der direkten Wiederholung gilt auch über die Rundengrenze.
 *
 * @param {object[]} kandidaten - Stücke der Stimmung
 * @param {string|null} letzteId - zuletzt gespielt (oder null)
 * @param {string[]} [runde] - in dieser Runde schon gespielte ids
 * @param {() => number} [zufall] - liefert [0,1)
 * @returns {object|null}
 */
export function waehleNaechstes(kandidaten, letzteId, runde = [], zufall = Math.random) {
  if (!Array.isArray(kandidaten) || kandidaten.length === 0) return null;
  if (kandidaten.length === 1) return kandidaten[0];
  let pool = kandidaten.filter(s => s.id !== letzteId);
  const frisch = pool.filter(s => !runde.includes(s.id));
  if (frisch.length > 0) pool = frisch;
  const index = Math.min(pool.length - 1, Math.floor(zufall() * pool.length));
  return pool[index];
}
