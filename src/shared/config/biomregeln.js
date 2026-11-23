/**
 * Biomregel-Fassung: `config.biomregeln` im Replay-Kopf (QV-6, Welle 1).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Eine Biomregel verändert den Spielverlauf (hier: den Wind) und damit den Zustandshash jeder Partie, in der sie
 * wirkt. Eine alte Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `BIOMREGELN_ALT` (1): keine Biomregeln. Das Feld FEHLT in jeder Datei aus der Zeit davor; `fromJSON` löst es auf
 *     diese Fassung auf, der Motor rechnet Bit für Bit wie vorher.
 *   - `BIOMREGELN_STROEMUNG` (2): Welle 1, Baustein A „Strömung / Windneigung" für Düne, Riff und Tiefsee.
 *   - `BIOMREGELN_SCHWERKRAFT` (3): Welle 1, Baustein B „Schwerkraftfaktor" für Kosmos, Planet, Schwebinseln
 *     und Surreal; enthält A.
 *   - `BIOMREGELN_TREIBSAND` (8, Standard): Treibsand (`quicksand`, TODO 2.2) wirkt: kein Ertrinken, seitlich stark
 *     gebremst, langsames Einsinken; heraus kommt man springend. Enthält alles aus 7.
 *   - `BIOMREGELN_STURZFLUT` (7): Wasserlauf-Ausbau 2 (TODO 2.1): Wasser fließt viermal so schnell
 *     (`WASSERLAUF_STURZFLUT.teilschritte`), die Strömung schiebt stärker; ein Dammbruch spült Figuren fort oder drückt sie an
 *     Hindernisse, tiefes Wasser ertränkt. Gemessen mit `scripts/messung-wasserlauf.mjs`; enthält A, B, E, Wasserlauf, Treiben.
 *   - `BIOMREGELN_TREIBEN` (6): Wasserlauf-Ausbau, auch Kisten und Bodenobjekte (Minen, Fässer) treiben mit der Strömung;
 *     enthält A, B, E und den Wasserlauf.
 *   - `BIOMREGELN_WASSERLAUF` (5): Welle 2, Wasserlauf: Wasser fließt nach Zerstörung nach (Grundwasser), die Strömung
 *     schiebt Figuren; enthält A, B und E.
 *   - `BIOMREGELN_WASSER` (4): Welle 2, Baustein E (Gefahrenwasser: Lava, Gift, Leere, Schlamm); enthält A und B.
 *
 * ## Strömung (Baustein A)
 *
 * Der Wind wird weiter je Zug aus seinem eigenen Seed-Zweig gewürfelt — die Anzahl der gezogenen Zufallswerte ändert
 * sich NICHT. Die Biomregel verschiebt nur den Wertebereich: Der gewürfelte Wert wird so gestaucht und um die
 * Strömung versetzt, dass das Ergebnis im Bereich ±`MAX_WIND` bleibt (jede Stelle, die den Wind liest, sieht weiter
 * denselben Bereich). Beispiel Düne (Anteil 0,5, Richtung rechts): Der Wind liegt zwischen 0 und `MAX_WIND` statt
 * zwischen −`MAX_WIND` und `MAX_WIND`, im Schnitt also halb so stark wie das Maximum nach rechts.
 *
 * Die Richtung ist je Partie fest und folgt dem Basis-Seed (gerade = rechts, ungerade = links). So begünstigt ein Biom
 * über viele Partien keine Seite, und die Richtung ist reproduzierbar, ohne einen Zufallswert zu ziehen.
 *
 * Die Anteile sind ERSTE ANSÄTZE, nicht balanciert (Messung: `npm run balance:biome`, Spieltest QV-4 steht aus).
 *
 * Reine Daten und Rechenvorschriften, kein Zufall, keine Uhr.
 *
 * @module config/biomregeln
 */

export const BIOMREGELN_ALT = 1;
export const BIOMREGELN_STROEMUNG = 2;
export const BIOMREGELN_SCHWERKRAFT = 3;
export const BIOMREGELN_WASSER = 4;
export const BIOMREGELN_WASSERLAUF = 5;
export const BIOMREGELN_TREIBEN = 6;
export const BIOMREGELN_STURZFLUT = 7;
export const BIOMREGELN_TREIBSAND = 8;
export const BIOMREGELN_STANDARD = BIOMREGELN_TREIBSAND;

/** Unbekannte Werte fallen auf den Standard; das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereBiomregeln(fassung) {
  return fassung === BIOMREGELN_ALT || fassung === BIOMREGELN_STROEMUNG || fassung === BIOMREGELN_SCHWERKRAFT
    || fassung === BIOMREGELN_WASSER || fassung === BIOMREGELN_WASSERLAUF || fassung === BIOMREGELN_TREIBEN
    || fassung === BIOMREGELN_STURZFLUT || fassung === BIOMREGELN_TREIBSAND
    ? fassung : BIOMREGELN_STANDARD;
}

/**
 * Biome mit Strömung. `anteil` = Betrag der Verschiebung als Anteil von `MAX_WIND` (0 bis 1, ausschließlich 1).
 */
export const BIOM_STROEMUNG = Object.freeze({
  duenen: Object.freeze({ anteil: 0.5, name: 'Sandsturm', text: 'Der Wind treibt in dieser Wüste fast immer in eine Richtung.' }),
  riff: Object.freeze({ anteil: 0.35, name: 'Riffströmung', text: 'Die Strömung am Riff schiebt Geschosse zur Seite.' }),
  tiefsee: Object.freeze({ anteil: 0.5, name: 'Tiefseestrom', text: 'Ein starker Strom treibt Geschosse in der Tiefsee seitwärts.' }),
});

/**
 * Die Strömung einer Partie oder `null`.
 *
 * @param {string|null} biom - aufgelöstes Sonderbiom (`match.sonderbiom`)
 * @param {number} fassung - Biomregel-Fassung
 * @param {number} basisSeed - Basis-Seed der Partie (bestimmt die Richtung)
 * @param {number} maxWind - größter Betrag des Windes (`MAX_WIND`)
 * @returns {{drift:number, richtung:1|-1, name:string, text:string}|null}
 */
export function stroemungFuer(biom, fassung, basisSeed, maxWind) {
  if (fassung < BIOMREGELN_STROEMUNG || !biom) return null;
  const regel = BIOM_STROEMUNG[biom];
  if (!regel) return null;
  const richtung = Math.abs(Math.trunc(Number(basisSeed) || 0)) % 2 === 0 ? 1 : -1;
  return { drift: richtung * regel.anteil * maxWind, richtung, name: regel.name, text: regel.text };
}

/**
 * Versetzt einen gewürfelten Windwert um die Strömung, ohne den Bereich ±`maxWind` zu verlassen.
 *
 * `roh * (maxWind − |drift|) / maxWind + drift`: bei roh = ±maxWind landet das Ergebnis bei drift ± (maxWind − |drift|),
 * also genau zwischen `−maxWind + 2·|drift|` und `maxWind` (für drift > 0).
 *
 * @param {number} roh - gewürfelter Wert (±`maxWind`)
 * @param {number} drift - Verschiebung (±)
 * @param {number} maxWind
 * @returns {number}
 */
export function verschiebeWind(roh, drift, maxWind) {
  return roh * (maxWind - Math.abs(drift)) / maxWind + drift;
}

/**
 * Schwerkraft (Baustein B, ab Fassung 3): ein Faktor auf die Schwerkraft ALLER Geschosse der Partie.
 *
 * Er wird beim Abschuss mit dem Waffenfaktor (`gravityScale`) multipliziert, also an der einen Stelle, an der ein
 * Projektil seine Fluggrößen bekommt; Vorschau, Geschütz und Client-Vorhersage rechnen mit demselben Faktor.
 *
 * `faktor` ist ein fester Wert; `spanne` ([min, max]) bedeutet „je Runde aus dem Seed" (Surreal). Die Ziehung benutzt
 * KEINEN Zufallsstrom (sonst änderte sie die Folge der übrigen Würfe), sondern eine reine Mischung aus Basis-Seed und
 * Rundennummer — Server und Client kommen so ohne Austausch auf denselben Wert.
 *
 * Die Faktoren sind ERSTE ANSÄTZE, nicht balanciert.
 */
export const BIOM_SCHWERKRAFT = Object.freeze({
  kosmos: Object.freeze({ faktor: 0.6, name: 'Geringe Schwerkraft', text: 'Im Kosmos fliegen Geschosse hoch und weit.' }),
  schwebinseln: Object.freeze({ faktor: 0.75, name: 'Dünne Luft', text: 'Auf den Schwebinseln ist die Schwerkraft schwächer, die Bögen werden höher.' }),
  planet: Object.freeze({ faktor: 0.85, name: 'Leichter Planet', text: 'Dieser Planet zieht etwas schwächer, Geschosse fliegen etwas weiter.' }),
  surreal: Object.freeze({ spanne: Object.freeze([0.7, 1.3]), name: 'Wechselnde Schwerkraft', text: 'Im Surrealen ändert sich die Schwerkraft mit jeder Runde.' }),
});

/** Schlüssel der Tabelle für ein aufgelöstes Biom (`planet_eis` … gehören zu `planet`). */
function schwerkraftSchluessel(biom) {
  return typeof biom === 'string' && biom.startsWith('planet_') ? 'planet' : biom;
}

/** Reine Mischung (Ganzzahl-Hash) → Zahl in [0, 1). */
function mische(seed, runde) {
  let h = (Math.trunc(Number(seed) || 0) ^ Math.imul(Math.trunc(Number(runde) || 0) + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Die Schwerkraftregel einer Partie in der gegebenen Runde oder `null` (dann gilt Faktor 1).
 *
 * @param {string|null} biom - aufgelöstes Sonderbiom
 * @param {number} fassung - Biomregel-Fassung
 * @param {number} basisSeed
 * @param {number} runde - Rundennummer (ab 1)
 * @returns {{faktor:number, jeRunde:boolean, name:string, text:string}|null}
 */
export function schwerkraftFuer(biom, fassung, basisSeed, runde = 1) {
  if (fassung < BIOMREGELN_SCHWERKRAFT || !biom) return null;
  const regel = BIOM_SCHWERKRAFT[schwerkraftSchluessel(biom)];
  if (!regel) return null;
  if (regel.spanne) {
    const [min, max] = regel.spanne;
    const faktor = Math.round((min + (max - min) * mische(basisSeed, runde)) * 100) / 100;
    return { faktor, jeRunde: true, name: regel.name, text: regel.text };
  }
  return { faktor: regel.faktor, jeRunde: false, name: regel.name, text: regel.text };
}

/**
 * Stärkster Schwerkraftfaktor, den die Regel in einer Partie erreichen kann (1 ohne Regel).
 *
 * Für Prüfungen, die für ALLE Runden gelten müssen (Erreichbarkeit beim Kartenstart, TODO 2.4): Bei einer Spanne
 * (Surreal 0,7 bis 1,3) zählt der Höchstwert, denn die stärkste Schwerkraft gibt die kürzeste Wurfweite.
 * Liest keinen Seed; ändert nichts am Spielverlauf.
 * @param {string|null} biom
 * @param {number} fassung
 * @returns {number}
 */
export function schwerkraftHoechstwert(biom, fassung) {
  if (fassung < BIOMREGELN_SCHWERKRAFT || !biom) return 1;
  const regel = BIOM_SCHWERKRAFT[schwerkraftSchluessel(biom)];
  if (!regel) return 1;
  return regel.spanne ? regel.spanne[1] : regel.faktor;
}

/**
 * Gefahrenwasser (Baustein E, ab Fassung 4): Schaden je Sekunde für eine tief untergetauchte Figur.
 *
 * Bis Fassung 3 galt für jedes Wasser dasselbe Ertrinken (9 LP/s); `hazard` in `config/scenery.js` war nur
 * beschriftet, kein Leser (FUND 2026-09-27). Jetzt ersetzt dieser Wert die 9 LP/s in genau diesen Wasserarten.
 * Treibsand (`snare`) bis Fassung 7 NICHT umgesetzt (er ertränkte wie Wasser); ab Fassung 8 siehe `TREIBSAND`.
 * Erste Ansätze, nicht balanciert.
 */
export const WASSER_SCHADEN = Object.freeze({
  lava: Object.freeze({ schaden: 16, name: 'Lava', text: 'Lava verbrennt: Wer hineinfällt, verliert schnell Leben.' }),
  poison: Object.freeze({ schaden: 13, name: 'Giftbrühe', text: 'Giftbrühe ätzt: Wer hineinfällt, verliert schnell Leben.' }),
  void: Object.freeze({ schaden: 11, name: 'Galaktisches Nichts', text: 'Das Nichts saugt Leben: Wer hineinfällt, verliert schnell Leben.' }),
  acid: Object.freeze({ schaden: 13, name: 'Säure', text: 'Säure ätzt: Wer hineinfällt, verliert schnell Leben.' }),
  swamp_sludge: Object.freeze({ schaden: 14, name: 'Sumpfschlamm', text: 'Im Schlamm erstickt man schneller als im Wasser.' }),
});

/**
 * @param {string|null|undefined} wasserId - Wasserart der Szene (`scenery.waterId`)
 * @param {number} fassung - Biomregel-Fassung
 * @returns {{schaden:number, name:string, text:string}|null} `null` = normales Ertrinken
 */
export function wasserWirkungFuer(wasserId, fassung) {
  if (fassung < BIOMREGELN_WASSER || !wasserId) return null;
  if (fassung >= BIOMREGELN_TREIBSAND && wasserId === 'quicksand') return TREIBSAND;
  return WASSER_SCHADEN[wasserId] ?? null;
}

/**
 * Treibsand (ab Fassung 8, TODO 2.2): `config/scenery.js` beschrieb `quicksand` seit jeher als „kein Schaden, aber die
 * Figur kommt kaum voran" (`hazard.kind = 'snare'`, `factor` 0,25); der Motor ließ die Figur darin ertrinken wie im
 * Wasser. Jetzt: `schaden` 0 (kein Ertrinken), `bremse` = Faktor auf das seitliche Tempo je Takt (aus `hazard.factor`),
 * `sinken` = Faktor auf das Fallen je Takt (langsames Einsinken). Aufwärts bleibt frei: Ein Sprung trägt heraus.
 * Erste Ansätze; gemessen in `tests/biomregeln-treibsand.test.js`.
 */
export const TREIBSAND = Object.freeze({
  schaden: 0, bremse: 0.25, sinken: 0.5,
  name: 'Treibsand', text: 'Treibsand hält fest: Man ertrinkt nicht, kommt aber kaum voran. Springen hilft heraus.',
});

/** Die Bremswirkung des Treibsands für die Szene, oder `null` (kein Treibsand oder ältere Fassung). */
export function treibsandFuer(wasserId, fassung) {
  return wasserWirkungFuer(wasserId, fassung) === TREIBSAND ? { bremse: TREIBSAND.bremse, sinken: TREIBSAND.sinken } : null;
}

/**
 * Wasserlauf (ab Fassung 5). Bis Fassung 4 wurde das Wasserfeld im Spiel nie weitergerechnet: Wasser stand still, außer
 * ein Einschlag verdrängte es. Jetzt fließt es nach jeder Zerstörung nach (`WaterField.stepAktiv`, nur an der bewegten
 * Stelle), bis es zur Ruhe kommt. Dünnes Wasser (unter der Ertrinkungsschwelle, `DROWN_LEVEL`) ist Grundwasser: es
 * schiebt Figuren in Fließrichtung, ertränkt aber nicht; erst tiefes Wasser ertränkt wie bisher.
 *
 * `schub`: Geschwindigkeitszuwachs je Takt je Einheit Strömung (Zellen je Schritt, etwa 0 bis 0,5). Erster Ansatz.
 */
export const WASSERLAUF = Object.freeze({
  schub: 0.6,
  name: 'Wasserlauf',
  text: 'Zerstörtes Land lässt Wasser fließen: Die Strömung schiebt Figuren mit, dünnes Wasser ertränkt nicht.',
});

/** Gilt der Wasserlauf in dieser Fassung? */
export function wasserlaufAktiv(fassung) {
  return fassung >= BIOMREGELN_WASSERLAUF;
}

/**
 * Sturzflut (ab Fassung 7, TODO 2.1). Messung `scripts/messung-wasserlauf.mjs` (Dammbruch in einer Rinne, 30 s):
 * Mit Fassung 5/6 (1 Teilschritt, Schub 0,6) kroch die Wasserfront etwa 20 px/s, die Figur wurde 5 bis 183 px
 * geschoben und stand nie tief: kein Schaden, nie an einem Hindernis. Mit 4 Teilschritten und Schub 1,5 kommt das
 * Wasser in 0,5 bis 7 s an; ein kleiner Stau (80 px) spült die Figur 150 bis 270 px weit ohne Schaden, ein großer
 * (160 px) drückt sie an den Fels und ertränkt sie. Kosten: der Wasserschritt läuft im wachen Fenster viermal je Takt.
 */
export const WASSERLAUF_STURZFLUT = Object.freeze({ schub: 1.5, teilschritte: 4 });

/** Wasserschritte je Takt im wachen Fenster: 0 ohne Wasserlauf, 1 in Fassung 5/6, 4 ab Fassung 7. */
export function wasserTeilschritte(fassung) {
  if (!wasserlaufAktiv(fassung)) return 0;
  return fassung >= BIOMREGELN_STURZFLUT ? WASSERLAUF_STURZFLUT.teilschritte : 1;
}

/** Schub der Strömung auf Figuren (0 = schiebt nicht). */
export function wasserSchubFuer(fassung) {
  if (!wasserlaufAktiv(fassung)) return 0;
  return fassung >= BIOMREGELN_STURZFLUT ? WASSERLAUF_STURZFLUT.schub : WASSERLAUF.schub;
}

/**
 * Treiben (ab Fassung 6): Kisten und Bodenobjekte (Minen, Fässer) im Wasser wandern mit der Strömung.
 *
 * `treibenKiste`/`treibenBoden`: Pixel je Takt je Einheit Strömung (Strömung etwa 0 bis 0,5, also bis ~1,5 px/Takt).
 * `schwelle`: Wasserstand (0 bis 1), ab dem ein Objekt „im Wasser" treibt (Grundwasser reicht, es muss nicht tief sein).
 * Erste Ansätze, nicht balanciert. Treiben ist rein seitlich; ein Objekt stoppt an Gelände (fester Boden).
 */
export const TREIBEN = Object.freeze({
  treibenKiste: 3,
  treibenBoden: 3,
  schwelle: 0.3,
  name: 'Treibgut',
  text: 'Kisten, Minen und Fässer im Wasser treiben mit der Strömung.',
});

/** Gilt das Treiben in dieser Fassung? */
export function treibenAktiv(fassung) {
  return fassung >= BIOMREGELN_TREIBEN;
}

/**
 * Wegstrecke (Pixel, seitlich) eines Objekts in diesem Takt: Strömung am Ort mal Faktor, 0 außerhalb von Wasser oder
 * wenn der Zielpunkt fest ist. Rein, keine Zufallszahl. `services` ist `world.services` (`water`, `terrain`).
 * @returns {number}
 */
export function treibweg(services, x, y, faktor) {
  const water = services?.water;
  if (!services?.match?.wasserTreiben || typeof water?.flussAn !== 'function') return 0;
  if ((water.levelAtWorld?.(x, y) ?? 0) < TREIBEN.schwelle) return 0;
  const dx = water.flussAn(x, y) * faktor;
  if (dx === 0) return 0;
  if (services.terrain?.isSolid?.(Math.round(x + dx), Math.round(y))) return 0;
  return dx;
}
