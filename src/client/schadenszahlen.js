/**
 * Schwebende Schadenszahlen aus Zustandsänderungen.
 *
 * Wie die Trefferkennung (`gefuehl.js#findeTreffer`) liest dieses Modul nur den
 * Zustand: Sinkt die Gesundheit einer Figur, entsteht „-75" (rot); ein sehr
 * hoher Treffer „-150!" (orange, größer); steigt sie, „+50" (grün); steigt ein
 * Schildwert (falls der Zustand ihn führt), „+25" (cyan). Es wird nichts
 * erfunden: ohne Zustandsänderung keine Zahl.
 *
 * Gefallene Figuren stehen im Zustand bei (0, 0); deshalb merkt sich das Modul
 * die letzte Position der lebenden Figur.
 *
 * @module schadenszahlen
 */

import { familieVonArt, ZAHL_FAMILIE } from '../shared/config/schaden.js';

/** Ab diesem Schaden (absolut) oder Anteil an der Maximalgesundheit gilt ein Treffer als schwer. */
const KRITISCH_ABSOLUT = 80;
const KRITISCH_ANTEIL = 0.5;

const LEBEN_ABNAHME = 0.016;
const MAX_ZAHLEN = 24;

/**
 * @param {Map<number, object>} bisher - Werte des letzten Bildes
 * @param {Array<object>} entities - Figuren aus dem Zustand
 * @returns {{zustand: Map<number, object>, neu: Array<{x:number,y:number,text:string,art:string}>}}
 */
export function findeZahlen(bisher, entities, arten = null) {
  const zustand = new Map();
  const neu = [];
  for (const e of entities ?? []) {
    if (!e || e.entityId === undefined || e.entityId === null) continue;
    const alt = bisher?.get(e.entityId);
    const health = Number(e.health);
    const schild = Number(e.shield ?? e.armor ?? 0);
    const lebt = e.alive !== false;
    const x = lebt ? Number(e.x) || 0 : (alt?.x ?? 0);
    const y = lebt ? Number(e.y) || 0 : (alt?.y ?? 0);
    zustand.set(e.entityId, { health, schild, x, y, maxHealth: Number(e.maxHealth) });
    if (!alt || !Number.isFinite(alt.health) || !Number.isFinite(health)) continue;

    const diff = Math.round(health - alt.health);
    const max = Number.isFinite(alt.maxHealth) && alt.maxHealth > 0 ? alt.maxHealth : 100;
    if (diff < 0) {
      const kritisch = -diff >= Math.max(KRITISCH_ABSOLUT, KRITISCH_ANTEIL * max);
      // Schadensart (Fassung 2): Farbe und Zeichen der Familie, sofern der Treffer nicht „schwer" ist.
      const meldung = arten?.get(e.entityId);
      const familie = meldung?.name ? familieVonArt(meldung.name) : 'koerper';
      const zeichen = ZAHL_FAMILIE[familie]?.symbol ?? '';
      if (kritisch || meldung?.krit) neu.push({ x, y: y - 26, text: `${diff}!`, art: 'kritisch', id: e.entityId });
      else neu.push({ x, y: y - 26, text: `${diff}${zeichen}`, art: familie === 'koerper' ? 'schaden' : `schaden-${familie}`, id: e.entityId });
    } else if (diff > 0 && lebt) {
      neu.push({ x, y: y - 26, text: `+${diff}`, art: 'heilung' });
    }
    const dSchild = Math.round(schild - (alt.schild ?? 0));
    if (dSchild > 0 && lebt) neu.push({ x, y: y - 38, text: `+${dSchild}`, art: 'schild' });
  }
  return { zustand, neu };
}

/** Fügt neue Zahlen an (versetzt, damit gleichzeitige nicht übereinanderstehen). */
export function ergaenzeZahlen(zahlen, neu) {
  const liste = zahlen.slice();
  neu.forEach((z, i) => {
    liste.push({ ...z, x: z.x + (i % 3 - 1) * 9, life: 1 });
  });
  return liste.slice(-MAX_ZAHLEN);
}

/** Ein Bild weiter: Zahlen steigen auf (ohne Bewegung bei `reduziert`) und verblassen. */
export function schreiteZahlenFort(zahlen, reduziert = false) {
  const ueberlebende = [];
  for (const z of zahlen) {
    const life = z.life - LEBEN_ABNAHME;
    if (life <= 0) continue;
    ueberlebende.push({ ...z, life, y: reduziert ? z.y : z.y - 0.55 });
  }
  return ueberlebende;
}
