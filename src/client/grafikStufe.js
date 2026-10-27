/**
 * Grafikstufen: Lite für schwache Geräte, Ultra für die volle Optik, Auto wählt nach Messung.
 *
 * Reine Client-Sache — ohne Einfluss auf Maske, Hash, Netz oder Replay. Die Stufe legt nur Grenzen fest,
 * die der Renderer beachtet (siehe `GRENZEN`). Ein Gerät, das Ultra nicht schafft, bleibt auf Lite:
 * auch wenn der Spieler Ultra wählt, gilt die Grenze (WebGL2 fehlt, Software-Rasterung) und die Anzeige
 * nennt den Grund.
 *
 * @module grafikStufe
 */

export const GRAFIK_WAHLEN = Object.freeze(['auto', 'lite', 'ultra']);
export const GRAFIK_SCHLUESSEL = 'pa.grafik';

/**
 * Was eine Stufe erlaubt.
 *  gelaendeGpu     Materialmalerei auf der GPU (WebGL2); sonst CPU-Weg
 *  gpuStoffe       Größe der Farbpalette im Shader (Uniform-Array; Ultra später als Textur)
 *  partikelDichte  Faktor auf Partikelmengen (1 = voll)
 *  flaechenBudgetMio  Kartenfläche in Mio. Pixeln, die gebacken werden darf (iOS-Canvas-Grenze ≈ 16,7)
 */
export const GRENZEN = Object.freeze({
  lite: Object.freeze({ stufe: 'lite', gelaendeGpu: false, gpuStoffe: 32, partikelDichte: 0.5, flaechenBudgetMio: 3.7 }),
  ultra: Object.freeze({ stufe: 'ultra', gelaendeGpu: true, gpuStoffe: 126, partikelDichte: 1, flaechenBudgetMio: 14 }),
});

/** Mindestens so viele Fragment-Uniform-Vektoren braucht Ultra (Palette plus übrige Werte). */
const MIN_UNIFORM_VEKTOREN = 221;
const SOFTWARE_RASTER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

function sicher(f, rueckfall) {
  try { return f(); } catch { return rueckfall; }
}

/**
 * Misst, was das Gerät kann. Fehler einzelner Messungen führen zu „unbekannt“, nie zu einer Ausnahme.
 * @param {object} [win]
 * @returns {{webgl2:boolean, uniformVektoren:number|null, software:boolean, kerne:number|null, speicherGB:number|null}}
 */
export function messeGeraet(win = globalThis) {
  const doc = win.document;
  const gl = sicher(() => doc?.createElement?.('canvas')?.getContext?.('webgl2'), null);
  const info = gl ? sicher(() => gl.getExtension('WEBGL_debug_renderer_info'), null) : null;
  const renderer = info ? sicher(() => String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)), '') : '';
  const nav = win.navigator ?? {};
  return {
    webgl2: Boolean(gl),
    uniformVektoren: gl ? sicher(() => Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || null, null) : null,
    software: SOFTWARE_RASTER.test(renderer),
    kerne: Number.isFinite(nav.hardwareConcurrency) ? nav.hardwareConcurrency : null,
    speicherGB: Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
  };
}

/**
 * Welche Stufe gilt? `wahl` ist die Wahl des Spielers, `messung` das Ergebnis von `messeGeraet`.
 * @returns {{stufe:'lite'|'ultra', grund:string}}
 */
export function waehleStufe(wahl, messung) {
  const m = messung ?? {};
  const mangel = !m.webgl2 ? 'kein WebGL2'
    : m.software ? 'Software-Rasterung statt Grafikkarte'
      : (m.uniformVektoren != null && m.uniformVektoren < MIN_UNIFORM_VEKTOREN) ? `zu wenig Shader-Speicher (${m.uniformVektoren})`
        : null;
  if (wahl === 'lite') return { stufe: 'lite', grund: 'von dir gewählt' };
  if (wahl === 'ultra') {
    return mangel ? { stufe: 'lite', grund: `Ultra nicht möglich: ${mangel}` } : { stufe: 'ultra', grund: 'von dir gewählt' };
  }
  if (mangel) return { stufe: 'lite', grund: mangel };
  if (m.kerne != null && m.kerne <= 2) return { stufe: 'lite', grund: `wenig Rechenkerne (${m.kerne})` };
  if (m.speicherGB != null && m.speicherGB <= 2) return { stufe: 'lite', grund: `wenig Arbeitsspeicher (${m.speicherGB} GB)` };
  return { stufe: 'ultra', grund: 'Gerät schafft die volle Optik' };
}

/** Gespeicherte Wahl; ohne Speicher oder bei Unsinn gilt `auto`. */
export function liesWahl(win = globalThis) {
  const roh = sicher(() => win.localStorage?.getItem(GRAFIK_SCHLUESSEL), null);
  return GRAFIK_WAHLEN.includes(roh) ? roh : 'auto';
}

export function schreibeWahl(wahl, win = globalThis) {
  if (!GRAFIK_WAHLEN.includes(wahl)) return false;
  return sicher(() => { win.localStorage?.setItem(GRAFIK_SCHLUESSEL, wahl); return true; }, false);
}

/**
 * Löst Wahl und Messung zu den geltenden Grenzen auf.
 * @returns {{wahl:string, stufe:'lite'|'ultra', grund:string, grenzen:object, messung:object}}
 */
export function loeseGrafik({ win = globalThis, wahl = liesWahl(win), messung = messeGeraet(win) } = {}) {
  const { stufe, grund } = waehleStufe(wahl, messung);
  return { wahl, stufe, grund, grenzen: GRENZEN[stufe], messung };
}
