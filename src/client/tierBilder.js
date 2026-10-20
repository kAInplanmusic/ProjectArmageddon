/**
 * Pose-Sprites der Tier-NPCs (Günther und Cookie): lazy geladen, gecacht.
 *
 * EINE Tabelle für beide (`TIER_ANSICHT`) und EIN Lader — Cookie ist kein zweiter
 * Figurentyp, sondern derselbe Weg mit anderem Ordner. Jede Pose ist ein
 * freigestelltes PNG (256 × 256, Blick nach rechts, Anker auf den Füßen); der
 * Ordner trägt ein `manifest.json` mit Datei und Anker je Pose.
 *
 * Bis ein Bild geladen ist, liefert `holeTierPose` `null` — der Renderer fällt
 * dann auf seine einfache Zeichnung zurück.
 *
 * @module tierBilder
 */

const BILDER = {
  guenther: import.meta.glob('./assets/guenther/*.png', { query: '?url', import: 'default' }),
  cookie: import.meta.glob('./assets/cookie/*.png', { query: '?url', import: 'default' }),
};
const MANIFESTE = {
  guenther: import.meta.glob('./assets/guenther/manifest.json', { eager: true, import: 'default' }),
  cookie: import.meta.glob('./assets/cookie/manifest.json', { eager: true, import: 'default' }),
};

/** Darstellung je Tier: Ordner und Zeichenhöhe in Kartenpixeln (Sprite-Kante). */
export const TIER_ANSICHT = Object.freeze({
  guenther: Object.freeze({ ordner: 'guenther', kante: 76 }),
  cookie: Object.freeze({ ordner: 'cookie', kante: 104 }),
});

// art -> pose -> Eintrag | 'laedt' | 'fehlt'
const cache = new Map();

function ladeBild(url) {
  return new Promise((ok, fehler) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fehler(new Error('Bild nicht ladbar'));
    img.src = url;
  });
}

/** Anker (Pixel im 256er Bild) und Dateiname einer Pose aus dem Manifest. */
export function poseEintrag(art, pose) {
  const manifest = Object.values(MANIFESTE[art] ?? {})[0];
  const e = manifest?.posen?.[pose];
  return e ? { datei: e.datei, anker: { x: e.anker?.x ?? 128, y: e.anker?.y ?? 240 }, spiegeln: e.blick === 'links' } : null;
}

/**
 * Liefert `{bild, anker, kante, spiegeln}` oder `null` (noch nicht geladen / unbekannt).
 * Der erste Aufruf einer Pose stößt das Laden an.
 */
export function holeTierPose(art, pose) {
  let poses = cache.get(art);
  if (!poses) cache.set(art, poses = new Map());
  const stand = poses.get(pose);
  if (stand && typeof stand === 'object') return stand;
  if (stand) return null;
  const eintrag = poseEintrag(art, pose);
  const lader = eintrag ? BILDER[art]?.[`./assets/${TIER_ANSICHT[art].ordner}/${eintrag.datei}`] : null;
  if (!lader) { poses.set(pose, 'fehlt'); return null; }
  poses.set(pose, 'laedt');
  lader().then(ladeBild).then((bild) => {
    poses.set(pose, { bild, anker: eintrag.anker, kante: TIER_ANSICHT[art].kante, spiegeln: eintrag.spiegeln });
  }).catch(() => poses.set(pose, 'fehlt'));
  return null;
}

/** Lädt alle Posen eines Tiers vor (beim Spielstart). */
export function ladeTierPosenVor(art) {
  const manifest = Object.values(MANIFESTE[art] ?? {})[0];
  for (const pose of Object.keys(manifest?.posen ?? {})) holeTierPose(art, pose);
}
