/**
 * Waffenanimationen als RECHENKERN — ohne Canvas.
 *
 * ## Warum ein eigenes Modul
 *
 * `renderer.js` ist in `node --test` nicht ladbar (Vite-spezifische Importe).
 * Alles, was dort an Animation steckt, ist damit unprüfbar. Das Muster des
 * Projekts ist deshalb: Die ZUSTANDS- und GEOMETRIELOGIK liegt in einem reinen
 * Modul, der Renderer führt nur noch das Ergebnis aus. Genau so entstand
 * `effects.js` (Partikel, Strahlen, Blitze) — dieses Modul setzt es für die
 * Waffendarstellung fort.
 *
 * ## Die vier Teile
 *
 *  1. **Mündungsfeuer und Rückstoß** (`muendungsfeuer`, `rueckstossVersatz`) —
 *     beim Schuss blitzt es an der Mündung, und das Rohr fährt kurz zurück.
 *  2. **Zielhilfe** (`fadenkreuzSegmente`, `pulsFaktor`) — der Einschlagpunkt
 *     der Zielvorschau bekommt ein pulsierendes Fadenkreuz statt einer
 *     nackten Linie.
 *  3. **Flächenwirkung** (`blitzPuls`) — der Radius der Explosionsvorschau
 *     atmet, statt still zu stehen.
 *  4. **Nachladeanzeige** (`ladungAnteil`) — die Waffenliste zeigt den
 *     Nachladegrad als Zahl zwischen 0 und 1.
 *
 * ## Barrierefreiheit ist eine Bedingung, keine Zugabe
 *
 * `reducedMotion` (aus `prefers-reduced-motion`) schaltet jede BEWEGUNG ab,
 * aber nicht die Aussage: Das Mündungsfeuer erscheint weiterhin (nur ohne
 * Rückstoßfahrt), das Fadenkreuz steht still, der Radius bleibt konstant. Ein
 * Effekt, der bei reduzierter Bewegung ganz verschwindet, nimmt dem Spieler
 * eine Information — deshalb wird hier die Bewegung entfernt, nicht das Bild.
 */

/**
 * Lebensdauer des Mündungsfeuers in Bildern (~133 ms bei 60 Hz).
 *
 * ACHTUNG — ZWEIERPotenz, nicht Zufall: Der Effekt altert über
 * `life - decay` mit `decay = 1/BILDER`. Bei 6 wäre `1/6` im Binärsystem
 * periodisch, sechs Schritte ergäben `1 - 0,9999999999999999` — der Effekt
 * lebte dann ein Bild LÄNGER als angekündigt, und `restlicheBilder()` sagte
 * 7 statt 6. Bei 8 ist `1/8 = 0,125` exakt darstellbar: Die Lebensdauer ist
 * damit genau das, was hier steht, und Tests können sie festnageln.
 */
export const MUENDUNGSFEUER_BILDER = 8;

/** Dauer des Rückstoßes in Bildern. */
export const RUECKSTOSS_BILDER = 8;

/** Größter Rückstoß in Pixeln (das Rohr ist 15 px lang). */
export const RUECKSTOSS_MAX = 4;

/** Länge des Rohres ab der Figurenmitte — muss zu `#drawEntities` passen. */
export const ROHR_LAENGE = 15;

/** Atemfrequenz für pulsierende Anzeigen (Bogenmaß je Bild). */
const PULS_TEMPO = 0.14;

/**
 * Einheitenlose Pulsation um 1 herum.
 *
 * Bei `reducedMotion` immer genau 1 — die Anzeige ist dann statisch, aber
 * vollständig sichtbar.
 */
export function pulsFaktor(bild, { reducedMotion = false, amplitude = 0.15 } = {}) {
  if (reducedMotion) return 1;
  return 1 + amplitude * Math.sin(bild * PULS_TEMPO);
}

/**
 * Rückstoß-Versatz des Rohres in Pixeln, entlang der Schussrichtung
 * (positiv = nach VORN, negativ = zurück).
 *
 * Der Wert klingt über die Lebensdauer des Effekts ab: im ersten Bild am
 * größten, danach linear auf 0.
 */
export function rueckstossVersatz(life, { reducedMotion = false } = {}) {
  if (reducedMotion) return 0;
  const anteil = Math.max(0, Math.min(1, life));
  const versatz = -RUECKSTOSS_MAX * anteil;
  // `-0` vermeiden: Es ist rechnerisch dasselbe wie 0, aber `Object.is(-0, 0)`
  // ist false — und ein `-0` in einer Anzeige oder einem Vergleich ist eine
  // Falle, die niemand sucht.
  return versatz === 0 ? 0 : versatz;
}

/**
 * Geometrie des Mündungsfeuers, RELATIV zur Figurenmitte (Weltachsen).
 *
 * Der Renderer addiert nur noch `entity.x` / `entity.y` und zeichnet. Dadurch
 * ist die Form ohne Canvas prüfbar — und der Test kann belegen, dass der
 * Kegel in SCHUSSRICHTUNG zeigt und nicht in eine feste Richtung.
 *
 * @param {number} angle Schusswinkel im Bogenmaß (0 = rechts, π/2 = oben)
 * @param {number} life 1 = frisch, 0 = verklungen
 * @returns {{offsetX:number, offsetY:number, length:number, halfWidth:number,
 *   coreRadius:number, alpha:number}}
 */
export function muendungsfeuer(angle, life, { reducedMotion = false } = {}) {
  const anteil = Math.max(0, Math.min(1, life));
  // Der Kegel wächst nach vorn, während er verblasst.
  const wachstum = 1 + (1 - anteil) * 0.8;
  const length = 11 * wachstum;
  const halfWidth = 4.2 * wachstum;

  // Die Mündung liegt am Ende des Rohres. Der Rückstoß zieht sie nach hinten.
  const versatz = ROHR_LAENGE + rueckstossVersatz(life, { reducedMotion });

  /* Kein Pulsieren bei reduzierter Bewegung: Der Kern ist dann konstant groß. */
  const coreRadius = reducedMotion ? 3 : 3 + (1 - anteil) * 2;

  return {
    offsetX: Math.cos(angle) * versatz,
    offsetY: -Math.sin(angle) * versatz,
    length,
    halfWidth,
    coreRadius,
    // Die Helligkeit klingt ab; der erste Wert ist fast deckend.
    alpha: 0.35 + 0.65 * anteil,
  };
}

/**
 * Linien des Fadenkreuzes um einen Punkt — vier Striche plus Innenring-Radius.
 *
 * Ein Fadenkreuz statt eines gefüllten Punktes, weil der Punkt eine Zusage
 * („hier schlägt es ein") bereits über `#drawPrediction` trägt: Die Zielhilfe
 * zeigt eine MÖGLICHKEIT, kein Ereignis.
 *
 * @returns {{segmente:[number,number,number,number][], innen:number}}
 */
export function fadenkreuzSegmente(x, y, groesse) {
  const g = Math.max(2, groesse);
  const luecke = g * 0.45;
  const arm = g;
  return {
    segmente: [
      // links, rechts, oben, unten — je vom Rand der Lücke nach außen.
      [x - luecke - arm, y, x - luecke, y],
      [x + luecke, y, x + luecke + arm, y],
      [x, y - luecke - arm, x, y - luecke],
      [x, y + luecke, x, y + luecke + arm],
    ],
    innen: Math.max(1, g * 0.32),
  };
}

/**
 * Pulsierender Radius und Strichversatz der Flächenwirkungs-Vorschau.
 *
 * `strichVersatz` wandert, damit der gestrichelte Ring sich dreht — das macht
 * aus einem Standbild eine Anzeige, ohne die Größe zu verfälschen.
 */
export function blitzPuls(radius, bild, { reducedMotion = false } = {}) {
  // Bei reduzierter Bewegung: fester Radius, fester Wert, kein Drehen.
  if (reducedMotion) return { radius, alpha: 0.1, strichVersatz: 0 };

  const atem = Math.sin(bild * PULS_TEMPO);
  return {
    radius: radius * (1 + 0.15 * atem),
    alpha: 0.1 + 0.05 * atem,
    // Der Strichversatz wandert, damit sich der gestrichelte Ring dreht.
    strichVersatz: (bild * 0.8) % 10,
  };
}

/**
 * Fortschritt des Nachladens als Zahl zwischen 0 und 1.
 *
 * 0 = gerade erst abgefeuert (Balken leer), 1 = bereit (Balken voll).
 * Eine Waffe ohne Nachladezeit (`gesamt <= 0`) ist immer bereit.
 */
export function ladungAnteil(rest, gesamt) {
  const gesamtZahl = Number(gesamt);
  const restZahl = Number(rest);
  if (!Number.isFinite(gesamtZahl) || gesamtZahl <= 0) return 1;
  if (!Number.isFinite(restZahl) || restZahl <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - restZahl / gesamtZahl));
}

/**
 * Erzeugt einen Mündungsfeuer-Effekt für die Effektliste des Renderers.
 *
 * Die Figur wird über `entityId` geführt, NICHT über eine Position: Der
 * Renderer zeichnet das Feuer an der AKTUELLEN Position der Figur, deshalb
 * bleibt es auch dann richtig, wenn sich die Figur zwischen Ereignis und Bild
 * bewegt hat.
 */
export function erzeugeMuendungsfeuer(entityId, angle, { farbe = '#ffe066' } = {}) {
  return {
    kind: 'muzzle',
    entityId,
    angle,
    farbe,
    life: 1,
    // Die Alterung übernimmt `schreiteEffekteFort` (effects.js) — sie rechnet
    // nur `life - decay`, es braucht also keine weiteren Felder.
    decay: 1 / MUENDUNGSFEUER_BILDER,
  };
}
