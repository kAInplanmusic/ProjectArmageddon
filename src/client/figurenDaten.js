/**
 * Bildadressen und Manifeste der Spielfiguren — als EIN nachgeladener Baustein.
 *
 * Diese Datei wird nie statisch importiert, sondern nur über `import()` aus
 * `figurenBilder.js` (erste Figur eines Matches). Zwei Gründe (Messung 2026-11-09,
 * `vite build`):
 *
 *  1. Die drei Manifeste (Seitenbilder, Sheets, Emotionen) standen EAGER im
 *     Startbündel: rund 60 KiB, die das Menü nie braucht.
 *  2. Die Bildtabellen waren LAZY je Datei. Vite baute dafür je Bild ein eigenes
 *     JS-Modul von rund 90 Byte, das nur die Adresse enthielt — über 400
 *     Zwergdateien in `dist`, und je Figurenbild eine zusätzliche Anfrage vor dem
 *     eigentlichen Bild. Dazu kam die Tabelle selbst (rund 70 KiB) im Startbündel.
 *
 * Hier stehen die Adressen EAGER als Zeichenketten: ein Baustein, eine Anfrage,
 * danach lädt jedes Bild direkt. Die Bilder selbst werden weiterhin nur für die
 * Figuren geholt, die im Match vorkommen.
 *
 * `node --test` kennt `import.meta.glob` nicht; der Import dieser Datei schlägt
 * dort fehl und `figurenBilder.js` fällt auf leere Tabellen zurück (A5/ENG-12).
 *
 * @module figurenDaten
 */

/** Seitenansichten: Pfad -> Adresse. */
export const seiten = import.meta.glob('./assets/characters-side/*/*.png', { query: '?url', import: 'default', eager: true });

/** Anker der Seitenansichten (`figures`). */
export const manifest = import.meta.glob('./assets/characters-side/manifest.json', { import: 'default', eager: true });

/** Sheet-Manifest (`figuren`). */
export const blattManifest = import.meta.glob('./assets/sprite-sheets/manifest.json', { import: 'default', eager: true });

/** Geh- und Aktionsblätter: Pfad -> Adresse. */
export const blattBilder = import.meta.glob('./assets/sprite-sheets/*/*__{walk,aktion}.webp', { query: '?url', import: 'default', eager: true });

/** Emotionsblätter: Pfad -> Adresse. */
export const emotionBilder = import.meta.glob('./assets/sprite-sheets-emotion/*/*.webp', { query: '?url', import: 'default', eager: true });

/** Sichtprüfung der Emotionsblätter (`figuren`). */
export const emotionManifest = import.meta.glob('./assets/sprite-sheets-emotion/manifest.json', { import: 'default', eager: true });
