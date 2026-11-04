/**
 * Versionskennung im Client (DEP-1): zeigt Version, Git-Stand und Bauzeit im Menü-Fuß (`#bauinfo`).
 *
 * Die Werte setzt der Build (`vite.config.mjs` → `__PA_BAUINFO__`, Quelle
 * `scripts/release/bauinfo.mjs`). Wer einen Fehler meldet, kann so ablesen, welcher Build lief;
 * derselbe Stand steht in `/healthz` des Servers.
 */
/* global __PA_BAUINFO__ */

/** Bauinfo dieses Builds; ohne Build-Ersetzung (z. B. Node-Import in `npm run validate`) ein Platzhalter. */
export const BAUINFO = typeof __PA_BAUINFO__ !== 'undefined'
  ? __PA_BAUINFO__
  : { version: 'unbekannt', gitSha: 'unbekannt', geaendert: null, bauzeit: null };

/**
 * Kurztext für den Menü-Fuß, z. B. `v0.9.0 · 2413c4f · 2026-11-04 12:00 UTC`.
 *
 * @param {{version?: string, gitSha?: string, geaendert?: boolean|null, bauzeit?: string|null}} info
 * @returns {string}
 */
export function bauinfoText(info = BAUINFO) {
  const teile = [`v${info?.version ?? 'unbekannt'}`];
  const sha = String(info?.gitSha ?? 'unbekannt');
  teile.push(sha === 'unbekannt' ? sha : sha.slice(0, 7) + (info?.geaendert ? '+' : ''));
  const zeit = info?.bauzeit ? new Date(info.bauzeit) : null;
  if (zeit && !Number.isNaN(zeit.getTime())) {
    teile.push(`${zeit.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  }
  return teile.join(' · ');
}

/** Schreibt die Kennung in `#bauinfo` (fehlt das Element, passiert nichts). */
export function zeigeBauinfo(doc = globalThis.document) {
  const el = doc?.getElementById?.('bauinfo');
  if (!el) return;
  el.textContent = bauinfoText();
  el.title = `Build ${BAUINFO.version}, Git ${BAUINFO.gitSha}${BAUINFO.bauzeit ? `, gebaut ${BAUINFO.bauzeit}` : ''}`;
}
