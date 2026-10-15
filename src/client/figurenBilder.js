/**
 * Spielsprites der Fraktionsfiguren: lazy geladen, vorab verkleinert, gecacht.
 *
 * Reihenfolge der Quellen je Figur:
 *   1. Seitenansicht `assets/characters-side/<fraktion>/<datei>` (falls vorhanden,
 *      dazu optional `manifest.json` mit Ankerpunkten) — nach rechts blickend.
 *   2. Porträt `assets/characters/<fraktion>/<datei>` (256 px), im Spiel je
 *      Blickrichtung gespiegelt.
 *
 * Performance: Das Bild wird EINMAL auf Spielgröße (2x für Zoom) in eine eigene
 * Leinwand verkleinert; pro Bild kostet das Zeichnen dann ein `drawImage` ohne
 * Allokation. Bis ein Bild geladen ist, liefert `holeFigur` `null` — die
 * Zeichnung fällt dann auf die prozedurale Figur zurück.
 *
 * @module figurenBilder
 */

const PORTRAETS = import.meta.glob('./assets/characters/*/*.png', { query: '?url', import: 'default' });
const SEITEN = import.meta.glob('./assets/characters-side/*/*.png', { query: '?url', import: 'default' });
const MANIFEST = import.meta.glob('./assets/characters-side/manifest.json', { eager: true, import: 'default' });

/** Kantenlänge der gecachten Leinwand in Pixeln (Quelle: 256 px). */
const CACHE_KANTE = 128;

const standard = { fussY: 0.96, muendungX: 0.9, muendungY: 0.45 };

/** Ankerpunkte je Figur aus dem Manifest der Seitenansichten (Anteile 0..1). */
function ankerAusManifest(fraktion, datei) {
  const m = Object.values(MANIFEST)[0];
  const e = m?.figuren?.[`${fraktion}/${datei}`];
  return e ? { ...standard, ...e.anker } : standard;
}

const cache = new Map();   // Schlüssel -> Eintrag | 'laedt' | 'fehlt'

function neueLeinwand(b, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(b, h);
  const c = document.createElement('canvas');
  c.width = b; c.height = h;
  return c;
}

/** Verkleinert ein geladenes Bild auf die Cache-Größe (mehrstufig für saubere Kanten). */
function verkleinere(img) {
  let quelle = img;
  let kante = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  while (kante / 2 >= CACHE_KANTE) {
    kante = Math.round(kante / 2);
    const z = neueLeinwand(kante, kante);
    const zc = z.getContext('2d');
    zc.imageSmoothingQuality = 'high';
    zc.drawImage(quelle, 0, 0, kante, kante);
    quelle = z;
  }
  const ziel = neueLeinwand(CACHE_KANTE, CACHE_KANTE);
  const c = ziel.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(quelle, 0, 0, CACHE_KANTE, CACHE_KANTE);
  return ziel;
}

function ladeBild(url) {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('Bild nicht ladbar'));
    img.src = url;
  });
}

async function lade(schluessel, charakter) {
  try {
    const seitenLader = SEITEN[`./assets/characters-side/${charakter.faction}/${charakter.sprite}`];
    const lader = seitenLader ?? PORTRAETS[`./assets/characters/${charakter.faction}/${charakter.sprite}`];
    if (!lader) { cache.set(schluessel, 'fehlt'); return; }
    const img = await ladeBild(await lader());
    cache.set(schluessel, {
      bild: verkleinere(img),
      seite: Boolean(seitenLader),
      anker: seitenLader ? ankerAusManifest(charakter.faction, charakter.sprite) : standard,
    });
  } catch {
    cache.set(schluessel, 'fehlt');
  }
}

/**
 * Das Sprite einer Figur oder `null`, solange es nicht bereit ist (der erste
 * Aufruf stößt das Laden an).
 *
 * @param {object|null} charakter - Eintrag aus CHARACTERS
 * @returns {{bild: CanvasImageSource, seite: boolean, anker: object}|null}
 */
export function holeFigur(charakter) {
  if (!charakter) return null;
  const schluessel = `${charakter.faction}/${charakter.sprite}`;
  const e = cache.get(schluessel);
  if (e === undefined) {
    cache.set(schluessel, 'laedt');
    lade(schluessel, charakter);
    return null;
  }
  return typeof e === 'object' ? e : null;
}

/** Lädt die Sprites vor (z. B. beim Start eines Matches), ohne zu blockieren. */
export function ladeVor(charaktere) {
  for (const c of charaktere) holeFigur(c);
}
