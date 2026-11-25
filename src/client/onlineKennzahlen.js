/**
 * Online-Kennzahlen (TODO 2.16, UI-6).
 *
 * `MatchStats` wurde nur lokal gefüttert (`feedAll` im Schritt); online blieb `game.stats` leer: Endbildschirm ohne
 * Kennzahlen, Profil ohne Online-Partien. Die Servermeldungen tragen dieselben Felder flach (`{t, round, ...payload}`,
 * `lobbySession#broadcastControl`). Die Erfassung beginnt mit der ersten Meldung, sobald der Ansichtszustand die Teams
 * kennt; der Takt kommt aus dem Ansichtszustand (sonst bliebe das Trefferfenster offen, `stats-trefferfenster.test.js`).
 *
 * Reine Anzeige: Der Client berechnet nichts Autoritatives (AGENTS.md §6).
 *
 * @module onlineKennzahlen
 */
import { MatchStats } from '../shared/stats.js';

/**
 * Füttert eine Servermeldung in die Kennzahlen.
 * @param {MatchStats|null} stats - bisherige Kennzahlen der Partie (null: noch keine)
 * @param {{t?: unknown}} meldung - Ereignis vom Server
 * @param {{entities?: Array<{entityId:number, teamId:number}>, tick?: number}|null} zustand - Ansichtszustand
 * @returns {MatchStats|null} die (ggf. neu angelegten) Kennzahlen; null, solange die Teams unbekannt sind
 */
export function fuettereOnlineKennzahl(stats, meldung, zustand) {
  if (typeof meldung?.t !== 'string') return stats;
  let ziel = stats;
  if (!ziel) {
    if (!zustand?.entities?.length) return null;
    ziel = new MatchStats({ teams: new Map(zustand.entities.map(e => [e.entityId, e.teamId])) });
  }
  ziel.feed({ type: meldung.t, payload: meldung }, Number.isFinite(zustand?.tick) ? zustand.tick : null);
  return ziel;
}
