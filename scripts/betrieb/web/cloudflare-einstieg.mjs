/**
 * Einstieg des Web-Zugangs auf Cloudflare (Pages Function, `functions/api/web/[[path]].mjs`).
 *
 * Verdrahtet den hosterunabhängigen Kern (`gateway-kern.mjs`) mit dem, was Cloudflare liefert: Secrets und die
 * D1-Bindung `DB` kommen aus `env`, nicht aus `process.env`; es gibt kein Dateisystem (Installer als Text);
 * `fetch` wird in eine Hülle gesteckt (ein gespeichertes `globalThis.fetch` wirft in Workers beim Aufruf als
 * `deps.fetch(...)` „Illegal invocation“). Beschreibung und Grenzen: docs/zugang-www.md.
 */
import { behandle, notAusAuftrag } from './gateway-kern.mjs';
import { erzeugeD1Speicher } from './speicher.mjs';
import installerText from './installer-text.mjs';

/** Pfad des Hintergrundauftrags (zählt wie jeder Aufruf an `/api/web/*`; der Auftrag trägt eine Signatur). */
export const NOT_AUS_PFAD = '/api/web/not-aus-auftrag';

const speicherJeBindung = new WeakMap();
async function speicherFuer(db) {
  if (!speicherJeBindung.has(db)) speicherJeBindung.set(db, erzeugeD1Speicher(db));
  try { return await speicherJeBindung.get(db); } catch (e) { speicherJeBindung.delete(db); throw e; }
}

const antwortJson = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** `fetch` ohne `this`-Bindung an das deps-Objekt. */
export const holen = (...args) => globalThis.fetch(...args);

/**
 * Not-aus dauert Minuten (Abbild, Prüfung, Löschen). Der Aufruf stößt den Hintergrundauftrag als eigenen Aufruf an
 * und hält ihn mit `ctx.waitUntil` am Leben; die Antwort an den Nutzer kommt sofort (202).
 */
export function notAusStarter(ctx, holer = holen) {
  return async (anfrage, auftrag) => {
    const ziel = new URL(NOT_AUS_PFAD, anfrage.url);
    const lauf = holer(ziel, { method: 'POST', headers: { 'x-pa-auftrag': auftrag } }).catch(() => null);
    ctx?.waitUntil?.(lauf);
  };
}

/** Ein Aufruf der Pages Function. `extra` ersetzt Teile für Tests (`holer`, `installer`, `jetzt`, `sleep`). */
export async function bearbeite(anfrage, env, ctx, extra = {}) {
  if (!env?.DB) return antwortJson(500, { fehler: 'Einrichtung unvollständig: D1-Bindung DB fehlt' });
  const holer = extra.holer ?? holen;
  const gemeinsam = { env, fetch: holer, ...(extra.jetzt ? { jetzt: extra.jetzt } : {}), ...(extra.sleep ? { sleep: extra.sleep } : {}) };
  const pfad = new URL(anfrage.url).pathname.replace(/\/+$/, '');
  if (pfad === NOT_AUS_PFAD) return notAusAuftrag(anfrage, gemeinsam);
  const speicher = await speicherFuer(env.DB);
  return behandle(anfrage, { ...gemeinsam, speicher, installer: () => extra.installer ?? installerText, notAusStarten: notAusStarter(ctx, holer) });
}
