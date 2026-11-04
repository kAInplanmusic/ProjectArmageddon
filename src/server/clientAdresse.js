/**
 * Adresse des Clients hinter einem Reverse-Proxy (DEP-3, Deploy-Plan 2026-11-04).
 *
 * Hinter Caddy/nginx ist `socket.remoteAddress` für JEDEN Spieler `127.0.0.1`. Das Limit
 * „neue Lobbys je Adresse und Minute" (`PA_LOBBYS_PRO_MINUTE`) wäre damit ein gemeinsames Limit
 * für alle — 30 Lobbys pro Minute für den ganzen Server.
 *
 * Deshalb: Kommt die Verbindung von einem ausdrücklich VERTRAUTEN Proxy (`PA_VERTRAUTE_PROXYS`,
 * z. B. `127.0.0.1,::1`), zählt der LETZTE Eintrag in `X-Forwarded-For` — das ist der, den unser
 * Proxy selbst angehängt hat. Frühere Einträge kann der Client fälschen, den letzten nicht.
 * Ohne Liste (Vorgabe) wird `X-Forwarded-For` nie gelesen: Ein direkt erreichbarer Server darf
 * dem Header nicht glauben (§6 AGENTS.md: der Server vertraut dem Client nie).
 */

/** `::ffff:127.0.0.1` und `127.0.0.1` sind dieselbe Adresse. */
function normalisiere(adresse) {
  const a = String(adresse ?? '').trim().toLowerCase();
  return a.startsWith('::ffff:') && a.includes('.') ? a.slice(7) : a;
}

/**
 * @param {string|undefined} roh kommagetrennte Liste
 * @returns {Set<string>|null}
 */
export function leseVertrauteProxys(roh) {
  const liste = String(roh ?? '').split(',').map(normalisiere).filter(Boolean);
  return liste.length ? new Set(liste) : null;
}

/**
 * @param {{socket?: {remoteAddress?: string}, headers?: Record<string, string|string[]|undefined>}} request
 * @param {Set<string>|null} vertraute
 * @returns {string}
 */
export function clientAdresse(request, vertraute) {
  const direkt = normalisiere(request?.socket?.remoteAddress) || '?';
  if (!vertraute || !vertraute.has(direkt)) return direkt;
  const kopf = request.headers?.['x-forwarded-for'];
  const text = Array.isArray(kopf) ? kopf.join(',') : kopf;
  if (typeof text !== 'string' || text.length > 2048) return direkt;
  const letzte = text.split(',').map(s => s.trim()).filter(Boolean).at(-1);
  if (!letzte || letzte.length > 45 || !/^[0-9a-fA-F:.]+$/.test(letzte)) return direkt;
  return normalisiere(letzte);
}
