/**
 * Gemalte Kulissen der Biome 15 bis 20 (`assets/backdrops-neu`, WebP, je Biom vier Stimmungen quer und hoch).
 *
 * Eigener Katalog neben `backdrops.js`: Die sechzehn klassischen Biome dort bleiben unverändert (Zahl der Motive,
 * Auswahl `pickBackdrop`, Menü), die neuen Bilder gehören nur zu den Sonderbiomen ab Geländefassung 7. Die Einträge haben
 * dieselbe Form wie die von `ALL_BACKDROPS` (`key` = „biom/stimmung“, `file`, `fileHoch`, `stimmung`), damit Renderer und
 * Kulissenmaler sie gleich behandeln; die Dateien liegen aber in einem anderen Ordner (`client/kulissenUrls.js`,
 * `kulissenUrlNeu`).
 *
 * Reine Darstellung, nichts davon fließt in Karte, Hash oder Replay.
 *
 * @module config/backdrops-neu
 */

import { BIOME_FASSUNG_7 } from './biome-fassung-7.js';

/** Die Stimmungen der neuen Bilder (Teilmenge von `STIMMUNGEN` aus `backdrops.js`; es gibt kein „Ragnarök 2“). */
export const STIMMUNGEN_NEU = Object.freeze([
  { id: 'hell', label: 'Heller Himmel' },
  { id: 'dunkel', label: 'Sternennacht' },
  { id: 'hoehle', label: 'Höhlenblick' },
  { id: 'ragnarok', label: 'Ragnarök' },
]);

/** Sonderbiom-Kennung (`config/biome-fassung-7.js`) → Dateipräfix in `assets/backdrops-neu` und Bezeichnung. */
const MOTIVE = Object.freeze([
  { biom: 'schlackeschmiede', datei: 'schlackeschmiede', label: 'Vulkanische Schlackeschmiede' },
  { biom: 'kristallarchipel', datei: 'kristallarchipel', label: 'Kristallines Schwebearchipel' },
  { biom: 'tempelstadt', datei: 'tempelstadt', label: 'Bio-Alien-Tempelstadt' },
  { biom: 'tiefsee', datei: 'tiefsee', label: 'Abyssale Tiefsee' },
  { biom: 'dimensionsriss', datei: 'dimensionsriss', label: 'Dimensionsriss' },
  { biom: 'kristallwald', datei: 'kristallwald', label: 'Versteinerter Kristallwald' },
]);

/** Alle neuen Kulissen als flache Liste (24 Einträge). */
export const BACKDROPS_NEU = Object.freeze(
  MOTIVE.flatMap(m => STIMMUNGEN_NEU.map(st => Object.freeze({
    biomeId: m.biom,
    biomeLabel: m.label,
    id: st.id,
    label: st.label,
    file: `${m.datei}_${st.id}.webp`,
    fileHoch: `${m.datei}_${st.id}_h.webp`,
    stimmung: true,
    neu: true,
    key: `${m.biom}/${st.id}`,
  }))),
);

/** Findet eine neue Kulisse über Biom und Stimmung, sonst `null` (Gegenstück zu `getBackdrop`). */
export function getBackdropNeu(biomeId, variantId) {
  return BACKDROPS_NEU.find(b => b.biomeId === biomeId && b.id === variantId) ?? null;
}

/**
 * Bodenfarben der neuen Kulissen: der Boden des Bioms (`ground` in `config/biome-fassung-7.js`), damit die Geländefarbe
 * zum Biom passt, egal welche Stimmung das Bild hat. `paletteFor` (`backdrops.js`) liest sie.
 */
export const PALETTEN_NEU = Object.freeze(Object.fromEntries(
  BACKDROPS_NEU.map(b => [b.key, Object.freeze({ surface: BIOME_FASSUNG_7[b.biomeId].ground.surface, deep: BIOME_FASSUNG_7[b.biomeId].ground.deep })]),
));
