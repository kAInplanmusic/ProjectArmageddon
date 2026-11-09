/**
 * Menü-Icons aus dem 128er-Iconatlas statt aus den 64-px-Einzelbildern.
 *
 * FUND (W12, Audit 2026-11-08): Alle 150 Menübilder (`assets/weapons/icons`)
 * sind nur 64x64, das Menü zeigt sie mit 72 CSS-Pixeln Kantenlänge — auf
 * hochauflösenden Anzeigen wird daraus ein unscharfes Bild. Der vorhandene
 * 128er-Iconatlas (`assets/weapon-sprites/atlas_icons.png`, 16 Spalten) wurde
 * vom Waffenmenü gar nicht gelesen, obwohl er dieselben Bilder in doppelter
 * Auflösung enthält.
 *
 * Deshalb liefert dieses Modul die Atlaszelle einer Waffe als CSS-Ausschnitt.
 * Gerechnet wird in PROZENT, nicht in Pixeln: So bleibt der Ausschnitt richtig,
 * wenn das Menü seine Kachelgröße ändert (72 px, 58 px auf schmalen Anzeigen).
 *
 * Das Modul ist zweigeteilt, damit es ohne Browser prüfbar bleibt:
 *   - {@link atlasAusschnitt} ist reine Rechnung (Tests: `tests/waffen-semantik.test.js`)
 *   - {@link erzeugeWaffenIconAtlas} nimmt Laden und Bildabruf als Abhängigkeiten
 *
 * Fällt Manifest oder Atlas aus, liefert `hole` dauerhaft `null`; das Menü
 * behält dann das bisherige 64-px-Bild.
 *
 * @module waffenIcons
 */

/** Spalten des Icon-Atlasses (siehe `scripts/waffen-sprites.py`, `ICON_SPALTEN`). */
export const ICON_ATLAS_SPALTEN = 16;

/**
 * CSS-Ausschnitt einer Atlaszelle.
 *
 * `background-size` in Prozent der Elementgröße: 16 Spalten ⇒ 1600 %, damit
 * genau eine Zelle das Element füllt. `background-position` verteilt die
 * Zellen gleichmäßig: bei n Zellen liegen die Mittel bei 0 %, 100/(n−1) %, …,
 * 100 %.
 *
 * @param {{x:number,y:number,w:number,h:number}} zelle - Zelle im Atlas (Pixel)
 * @param {{w:number,h:number}} atlas - Atlasmaße (Pixel)
 * @returns {{backgroundSize:string, backgroundPosition:string, spalten:number, zeilen:number}|null}
 */
export function atlasAusschnitt(zelle, atlas) {
  if (!zelle || !atlas) return null;
  const { w: zw, h: zh, x, y } = zelle;
  const { w: aw, h: ah } = atlas;
  if (!(zw > 0 && zh > 0 && aw > 0 && ah > 0)) return null;
  const spalten = Math.max(1, Math.round(aw / zw));
  const zeilen = Math.max(1, Math.round(ah / zh));
  const spalte = Math.min(spalten - 1, Math.max(0, Math.round(x / zw)));
  const reihe = Math.min(zeilen - 1, Math.max(0, Math.round(y / zh)));
  const prozent = (index, anzahl) => (anzahl > 1 ? (index * 100) / (anzahl - 1) : 0);
  return {
    backgroundSize: `${spalten * 100}% ${zeilen * 100}%`,
    backgroundPosition: `${prozent(spalte, spalten).toFixed(4)}% ${prozent(reihe, zeilen).toFixed(4)}%`,
    spalten,
    zeilen,
  };
}

/**
 * Erzeugt den Icon-Atlas-Lader.
 *
 * @param {object} abh
 * @param {() => Promise<object>} abh.ladeManifest - liefert das Waffen-Manifest
 * @param {() => Promise<string>} abh.ladeAtlasUrl - URL von `atlas_icons.png`
 * @returns {{hole:function(object, function=):(object|null), zustand:function():object}}
 */
export function erzeugeWaffenIconAtlas(abh) {
  /** @type {object|null|'laedt'|'fehlt'} */
  let manifest = null;
  /** @type {string|null|'laedt'|'fehlt'} */
  let url = null;
  const warten = new Set();

  function melde() {
    for (const cb of warten) {
      try { cb(); } catch { /* Anzeige darf nie am Lader scheitern */ }
    }
    warten.clear();
  }

  function lade() {
    if (manifest !== null) return;
    manifest = 'laedt';
    url = 'laedt';
    Promise.resolve(abh.ladeManifest()).then(
      (m) => { manifest = m && typeof m === 'object' && m.waffen ? m : 'fehlt'; },
      () => { manifest = 'fehlt'; },
    ).then(() => Promise.resolve(abh.ladeAtlasUrl()).then(
      (u) => { url = typeof u === 'string' && u ? u : 'fehlt'; },
      () => { url = 'fehlt'; },
    )).then(() => {
      if (manifest === 'fehlt') url = 'fehlt';
      melde();
    });
  }

  return {
    /**
     * Atlaszelle einer Waffe oder `null`, solange sie lädt bzw. dauerhaft, wenn
     * Manifest oder Atlas fehlen. `onBereit` wird einmal nach dem Laden gerufen.
     *
     * @param {{id:string}|null|undefined} waffe
     * @param {function():void} [onBereit]
     * @returns {{url:string, zelle:object, atlas:object}|null}
     */
    hole(waffe, onBereit) {
      if (!waffe?.id) return null;
      if (manifest === null) lade();
      if (typeof manifest !== 'object' || typeof url !== 'string') {
        // Nur solange noch geladen wird vormerken; nach einem Fehlschlag gibt es
        // nichts mehr zu melden, sonst sammelten sich Rueckrufe je Neuaufbau.
        if (typeof onBereit === 'function' && manifest !== 'fehlt') warten.add(onBereit);
        return null;
      }
      const eintrag = manifest.waffen[waffe.id];
      const zelle = eintrag?.icon;
      const atlas = zelle ? manifest.atlanten?.[zelle.atlas] : null;
      if (!zelle || !atlas) return null;
      return { url, zelle, atlas: { w: atlas.w, h: atlas.h } };
    },

    /** Diagnose (Tests/Debug): Zustand des Laders. */
    zustand() {
      return {
        manifest: typeof manifest === 'object' && manifest !== null ? 'bereit' : manifest,
        url: typeof url === 'string' ? 'bereit' : url,
      };
    },
  };
}

/** Der Lader des Spiels. */
const lader = erzeugeWaffenIconAtlas({
  ladeManifest: () => import('./assets/weapon-sprites/manifest.json').then(m => m.default),
  ladeAtlasUrl: async () => {
    const dateien = import.meta.glob('./assets/weapon-sprites/atlas_icons.png', { query: '?url', import: 'default' });
    const f = dateien['./assets/weapon-sprites/atlas_icons.png'];
    if (!f) throw new Error('Iconatlas fehlt');
    return f();
  },
});

/**
 * Atlaszelle einer Waffe für das Menü oder `null` (dann bleibt das 64er-Bild).
 * @param {{id:string}|null|undefined} waffe
 * @param {function():void} [onBereit]
 */
export function holeWaffenIcon(waffe, onBereit) {
  return lader.hole(waffe, onBereit);
}

/** Zustand des Laders (Diagnose). */
export function waffenIconZustand() {
  return lader.zustand();
}
