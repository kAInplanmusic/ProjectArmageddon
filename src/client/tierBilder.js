/**
 * Pose-Sprites der Tier-NPCs (Günther und Cookie) und des Feuerwesens (`pa_118`): lazy geladen, gecacht.
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

import { ladeBild } from './dom.js';

/*
 * A5/ENG-12: Globs erst beim ersten Zugriff. `node --test` kennt
 * `import.meta.glob` nicht; der try/catch liefert dort leere Tabellen, statt den
 * Import des Renderers zu verhindern. Im Vite-Build bleibt der Glob unverändert.
 */
let bilder = null;
let manifeste = null;

function bilderTabelle() {
  if (bilder === null) {
    try {
      bilder = {
        guenther: import.meta.glob('./assets/guenther/*.png', { query: '?url', import: 'default' }),
        cookie: import.meta.glob('./assets/cookie/*.png', { query: '?url', import: 'default' }),
        feuerwesen: import.meta.glob('./assets/feuerwesen/*.png', { query: '?url', import: 'default' }),
      };
    } catch {
      bilder = {};
    }
  }
  return bilder;
}

function manifestTabelle() {
  if (manifeste === null) {
    try {
      manifeste = {
        guenther: import.meta.glob('./assets/guenther/manifest.json', { eager: true, import: 'default' }),
        cookie: import.meta.glob('./assets/cookie/manifest.json', { eager: true, import: 'default' }),
        feuerwesen: import.meta.glob('./assets/feuerwesen/manifest.json', { eager: true, import: 'default' }),
      };
    } catch {
      manifeste = {};
    }
  }
  return manifeste;
}

/** Darstellung je Tier: Ordner und Zeichenhöhe in Kartenpixeln (Sprite-Kante). */
const TIER_ANSICHT = Object.freeze({
  guenther: Object.freeze({ ordner: 'guenther', kante: 76 }),
  cookie: Object.freeze({ ordner: 'cookie', kante: 104 }),
  // Feuerwesen (Waffenfassung 20): Posen lauf1, lauf2, sprung, zerbirst; deutlich kleiner als eine Figur.
  feuerwesen: Object.freeze({ ordner: 'feuerwesen', kante: 48 }),
});

// art -> pose -> Eintrag | 'laedt' | 'fehlt'
const tierCache = new Map();

/** Anker (Pixel im 256er Bild) und Dateiname einer Pose aus dem Manifest. */
function poseEintrag(art, pose) {
  const manifest = Object.values(manifestTabelle()[art] ?? {})[0];
  const e = manifest?.posen?.[pose];
  return e ? { datei: e.datei, anker: { x: e.anker?.x ?? 128, y: e.anker?.y ?? 240 }, spiegeln: e.blick === 'links' } : null;
}

/**
 * Liefert `{bild, anker, kante, spiegeln}` oder `null` (noch nicht geladen / unbekannt).
 * Der erste Aufruf einer Pose stößt das Laden an.
 */
export function holeTierPose(art, pose) {
  let poses = tierCache.get(art);
  if (!poses) tierCache.set(art, poses = new Map());
  const stand = poses.get(pose);
  if (stand && typeof stand === 'object') return stand;
  if (stand) return null;
  const eintrag = poseEintrag(art, pose);
  const lader = eintrag ? bilderTabelle()[art]?.[`./assets/${TIER_ANSICHT[art].ordner}/${eintrag.datei}`] : null;
  if (!lader) { poses.set(pose, 'fehlt'); return null; }
  poses.set(pose, 'laedt');
  lader().then(ladeBild).then((bild) => {
    poses.set(pose, { bild, anker: eintrag.anker, kante: TIER_ANSICHT[art].kante, spiegeln: eintrag.spiegeln });
  }).catch(() => poses.set(pose, 'fehlt'));
  return null;
}

/** Lädt alle Posen eines Tiers vor (beim Spielstart). */
export function ladeTierPosenVor(art) {
  const manifest = Object.values(manifestTabelle()[art] ?? {})[0];
  for (const pose of Object.keys(manifest?.posen ?? {})) holeTierPose(art, pose);
}
