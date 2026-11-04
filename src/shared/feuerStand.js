/**
 * Feuer- und Lavazellen im Online-Abgleich (EREIGNIS-1).
 *
 * ## Warum
 *
 * Online kannte der Client brennende Zellen und ruhende Lava nur aus den Ereignissen `feuer_schritt`,
 * `feuer_lava` und `lava_erstarrt`. Die Listen darin sind auf `FEUER.maxZellenJeEreignis` (48) gekappt,
 * und wer später beitritt oder die Verbindung kurz verliert, sah sie nie: Flammen fehlten, oder Lava blieb
 * auf seinem Bildschirm liegen, die auf dem Server längst erstarrt war. Der binäre Snapshot führt keine
 * Zellen.
 *
 * ## Wie
 *
 * Der Server hängt den sichtbaren Stand (`FeuerSystem#sichtStand`) an die Meldung `terrain_hash`, die ohnehin
 * mit jedem Vollsnapshot (alle ~2 s) geht — nicht an jeden 20-Hz-Snapshot und nicht ins Drahtformat. Die
 * Zellen sind aufsteigend sortiert und als ABSTÄNDE kodiert (erste Zahl absolut, dann Differenzen): Nachbarn
 * liegen meist 1 oder `spalten` auseinander, das hält die JSON-Zeile kurz. Je Liste höchstens
 * `MAX_FEUER_STAND_ZELLEN` Einträge; eine gekappte Liste trägt `voll: false`.
 *
 * Reine Daten, kein Zufall, keine Uhr (`src/shared` ist determinismusgeschützt).
 *
 * @module feuerStand
 */

/** Obergrenze je Liste (Flammen, Lava): ~2 KB JSON im schlimmsten Fall, alle ~2 s. */
export const MAX_FEUER_STAND_ZELLEN = 512;

/**
 * Aufsteigend sortierte Zellenliste als Abstände; gekappt auf `max`.
 * @param {number[]} zellen - aufsteigend sortiert
 * @param {number} [max]
 * @returns {number[]}
 */
export function packeZellen(zellen, max = MAX_FEUER_STAND_ZELLEN) {
  const aus = [];
  let vorher = 0;
  for (const idx of zellen) {
    if (aus.length >= max) break;
    aus.push(idx - vorher);
    vorher = idx;
  }
  return aus;
}

/**
 * Abstände zurück in Zellen. Der Client vertraut der Leitung nicht blind: nur nichtnegative ganze Zahlen,
 * höchstens `max` Einträge, jede Zelle kleiner als `zellenGesamt` (falls bekannt). Ungültiges → `null`.
 * @param {unknown} abstaende
 * @param {object} [o]
 * @param {number} [o.max]
 * @param {number} [o.zellenGesamt]
 * @returns {number[]|null}
 */
export function entpackeZellen(abstaende, { max = MAX_FEUER_STAND_ZELLEN, zellenGesamt = Infinity } = {}) {
  if (!Array.isArray(abstaende) || abstaende.length > max) return null;
  const zellen = [];
  let idx = 0;
  for (const d of abstaende) {
    if (!Number.isInteger(d) || d < 0) return null;
    idx += d;
    if (idx >= zellenGesamt) return null;
    zellen.push(idx);
  }
  return zellen;
}

/**
 * Nutzlast für `terrain_hash.feuer` aus `FeuerSystem#sichtStand()`.
 * @param {{brennt: number[], lava: number[]}} stand
 * @returns {{brennt: number[], lava: number[], voll: boolean}}
 */
export function feuerStandNutzlast(stand) {
  const brennt = stand?.brennt ?? [];
  const lava = stand?.lava ?? [];
  return {
    brennt: packeZellen(brennt),
    lava: packeZellen(lava),
    voll: brennt.length <= MAX_FEUER_STAND_ZELLEN && lava.length <= MAX_FEUER_STAND_ZELLEN,
  };
}

/**
 * Gegenstück im Client: Nutzlast prüfen und entpacken; `null`, wenn sie fehlt oder ungültig ist.
 * @param {unknown} nutzlast
 * @param {number} [zellenGesamt]
 * @returns {{brennt: number[], lava: number[], voll: boolean}|null}
 */
export function leseFeuerStand(nutzlast, zellenGesamt = Infinity) {
  if (!nutzlast || typeof nutzlast !== 'object') return null;
  const brennt = entpackeZellen(nutzlast.brennt, { zellenGesamt });
  const lava = entpackeZellen(nutzlast.lava, { zellenGesamt });
  if (!brennt || !lava) return null;
  return { brennt, lava, voll: nutzlast.voll !== false };
}
