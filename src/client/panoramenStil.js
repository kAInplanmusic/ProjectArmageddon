/**
 * Panorama-Kulissen im Kulissenstil (`config/backdrops-panorama.js`): Objekt je Schluessel und deterministische Wahl.
 *
 * Boden- und Lichtfarben kommen von der Familie (`getBackdrop(familie, 'stimmung_<art>')`), Bild und Schluessel vom
 * Panorama. Die Wahl nutzt nur `hash2` aus dem Seed (Client-Optik), nie die Engine-RNG. Rein optisch.
 *
 * @module panoramenStil
 */
import { getBackdrop } from '../shared/config/backdrops.js';
import { PANORAMEN_STIL, getBackdropPanorama } from '../shared/config/backdrops-panorama.js';
import { hash2 } from './stil.js';

/** Kulisse zu „stil/<name>_<art>“ oder `null`. */
export function panoramaStil(variantId) {
  const eintrag = getBackdropPanorama(variantId);
  if (!eintrag) return null;
  const familie = PANORAMEN_STIL.find(m => m.name === eintrag.motiv).familie;
  const basis = getBackdrop(familie, `stimmung_${eintrag.art}`);
  return { ...basis, key: eintrag.key, label: eintrag.label, file: eintrag.file, fileHoch: null, stil: eintrag.file, stimmung: true, lichtKlasse: eintrag.lichtKlasse };
}

const POOL = ['hell', 'hell', 'dunkel'];

/**
 * Panorama fuer eine Karte ohne Spielerwahl, sonst `null`. Nur jede dritte Karte (Seed mod 3 = 0, wie bei den Fotos).
 * Sonderbiom: nur 'stark' zugeordnete Motive; klassisches Biom (`biomId`): alle Motive der Familie ausser 'mangel'.
 * Hoehlenkarten bekommen den Hoehlenblick, Ragnarok kommt nie automatisch. Mit `mitFoto` (PolyHaven-Foto vorhanden)
 * entscheidet der Seed je zur Haelfte.
 */
export function stilFuerKarte({ sonder = null, biomId = null, seed, kartenart = null, mitFoto = false }) {
  const s = seed | 0;
  if (((seed >>> 0) % 3) !== 0 || (mitFoto && hash2(s, 23, 9) < 0.5)) return null;
  const hoehle = kartenart === 'hoehle' || kartenart === 'hoehleInsel';
  const passend = PANORAMEN_STIL.filter(m => m.staerke !== 'mangel' && (sonder
    ? m.staerke === 'stark' && m.biome.includes(sonder)
    : biomId != null && m.familie === biomId) && (!hoehle || !m.autoArten));
  if (!passend.length) return null;
  const motiv = passend[Math.floor(hash2(s, 29, 7) * passend.length) % passend.length];
  const erlaubt = hoehle ? ['hoehle'] : POOL.filter(a => !motiv.autoArten || motiv.autoArten.includes(a));
  const art = erlaubt[Math.floor(hash2(s, 31, 7) * erlaubt.length) % erlaubt.length];
  return panoramaStil(`${motiv.name}_${art}`);
}
