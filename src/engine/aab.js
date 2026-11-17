/**
 * AAB-Regeln: Arsenalwert-System für ProjectArmageddon.
 *
 * Dieses Modul implementiert die AAB-Regeln aus dem AAB-Ticket:
 * - AAB-01: Arsenalwert (Inventarwert)
 * - AAB-04: Kampfwert (situationelle Handlungsfähigkeit)
 * - AAB-05: Waffenhistorie (3-Züge)
 * - AAB-06: Hybrid-Formel (60% Arsenal, 25% Kampf, 15% Historie)
 * - AAB-07: Fairnessziel (±20% Toleranz)
 *
 * @module engine/aab
 */

import { getWeapon } from '../shared/config/weapons.js';
import { combatProfile } from '../shared/config/classes.js';

/** Schwellen für powerScore-Grade */
export const POWER_TIERS = Object.freeze([
  { tier: 'legendary', min: 190, color: '#8a2be2' },
  { tier: 'epic', min: 130, color: '#7228ff' },
  { tier: 'rare', min: 80, color: '#4a90d9' },
  { tier: 'uncommon', min: 45, color: '#7ed321' },
  { tier: 'common', min: 0, color: '#9b9b9b' },
]);

/** Stufen für Munitionsklassen (AAB-11) */
export const MUNITION_STUFEN = Object.freeze({
  infinity: 'infinity',
  3: 'limited_high',
  2: 'limited_medium',
  1: 'limited_low',
  0: 'empty',
});

/**
 * Berechnet den Arsenalwert (powerScore) einer Waffe.
 * Basiert auf dem Katalogwert, nicht auf einer dynamischen Formel.
 * Mit Cache für effiziente Mehrfachabfragen.
 *
 * @param {string} weaponId - ID der Waffe (z.B. 'pa_001')
 * @returns {number} powerScore der Waffe (>= 0)
 */
export function arsenalwert(weaponId) {
  const cached = arsenalCache.get(weaponId);
  if (cached !== undefined) return cached;
  const waffe = getWeapon(weaponId);
  const value = Number(waffe?.powerScore || 0);
  arsenalCache.set(weaponId, value);
  return value;
}

/** Cache für Arsenalwerte (Waffen-IDs sind stabil) */
const arsenalCache = new Map();

/**
 * Berechnet den Arsenalwert des gesamten Inventars.
 * Multipliziert mit dem Klassen-Multiplikator.
 * Verwendet Arsenalwert-Cache für effiziente Berechnung.
 *
 * @param {Array<string>} weaponIds - Liste der Waffen-IDs im Inventar
 * @param {string} [className] - Optionale Klasse für Multiplikation
 * @returns {number} Summen-Arsenalwert
 */
export function computeArsenalwert(weaponIds, className) {
  if (!weaponIds || !Array.isArray(weaponIds)) return 0;
  const basis = weaponIds.reduce((sum, id) => sum + arsenalwert(id), 0);
  if (!className) return basis;
  const cp = combatProfile(className);
  return basis * (cp.damageMultiplier || 1);
}

/**
 * Berechnet den Kampfwert (situationelle Handlungsfähigkeit) eines Spielers.
 * Optimiert: Wiederverwendet Arsenalwert, vermeidet Filter-Passagen.
 *
 * Der Kampfwert berücksichtigt:
 * - Arsenalwert (60%)
 * - Munitionsstatus (30% Gewichtung im Arsenal)
 * - Verfügbare Tools (Heilung, Schutz, Versetzen) (10%)
 *
 * @param {Object} inventar - Spieler-Inventar
 * @param {Array<string>} inventar.weaponIds - Aktive Waffen
 * @param {Map<string, number>} inventar.ammo - Munition pro Waffe
 * @param {Object} zustaende - Spieler-Zustand
 * @param {number} zustaende.health - Aktuelle Gesundheit
 * @param {number} zustaende.maxHealth - Maximale Gesundheit
 * @param {Object} zustaende.effekte - Aktive Buffs/Debuffs
 * @param {string} className - Spieler-Klasse
 * @returns {number} Kampfwert (>= 0)
 */
export function computeKampfwert(inventar, zustaende, className) {
  if (!inventar || !inventar.weaponIds || inventar.weaponIds.length === 0) return 0;

  const weaponIds = inventar.weaponIds;
  const ammoMap = inventar.ammo;

  // Basis: Arsenalwert aus aktiven Waffen (bereits gecached)
  const arsenalwertWerte = weaponIds.reduce((sum, id) => sum + arsenalwert(id), 0);

  // Munitionsstatus: Zähle kampffähige Waffen in einem Durchgang
  let kampfaehrigeAnzahl = 0;
  if (ammoMap && ammoMap.size > 0) {
    for (const id of weaponIds) {
      const ammo = ammoMap.get(id);
      if (ammo === undefined || ammo === null || ammo > 0) {
        kampfaehrigeAnzahl++;
      }
    }
  } else {
    kampfaehrigeAnzahl = weaponIds.length;
  }
  const munitionsgewicht = kampfaehrigeAnzahl / weaponIds.length;

  // Effekt-Bonus (Heilung, Schutz, Versetzen)
  const effekte = zustaende?.effekte;
  const effektBonus = effekte
    ? (effekte.get?.('armor') || 0) * 0.1
      + (effekte.has?.('heal') ? 5 : 0)
      + (effekte.has?.('teleport') ? 10 : 0)
    : 0;

  // Klassen-Multiplikator
  const klassenMult = className ? (combatProfile(className)?.damageMultiplier || 1) : 1;

  // Gesamtkampfwert
  const basis = arsenalwertWerte * munitionsgewicht + effektBonus;
  return Math.max(0, Math.round(basis * klassenMult));
}

/**
 * Waffenhistorie-Eintrag für einen Spieler.
 * @typedef {Object} WaffenEreignis
 * @property {string} waffeId - Waffe
 * @property {'erhalten'|'verloren'|'verbraucht'|'geschossen'} typ - Ereignisart
 * @property {number} zug - Match-Zug
 * @property {number} [wartWert] - Wert am Zeitpunkt des Ereignisses
 */

/**
 * 3-Züge-Waffenhistorie pro Spieler.
 * Läuft als Ringpuffer für deterministische Historie.
 */
export class WaffenHistorie {
  /** @type {Map<string, WaffenEreignis[]>} */
  #historie = new Map();
  static #maxEintraege = 3; // 3 Züge wie im Ticket

  /**
   * Fügt ein Ereignis zur Historie hinzu.
   * @param {string} playerId - Spieler-ID
   * @param {string} waffeId - Waffe-ID
   * @param {'erhalten'|'verloren'|'verbraucht'|'geschossen'} typ - Ereignis
   * @param {number} zug - Aktueller Zug
   */
  addEreignis(playerId, waffeId, typ, zug) {
    if (!playerId || !waffeId) return;
    let eintraege = this.#historie.get(playerId);
    if (!eintraege) {
      eintraege = [];
      this.#historie.set(playerId, eintraege);
    }
    eintraege.push({
      waffeId,
      typ,
      zug,
      wartWert: arsenalwert(waffeId),
    });
    // Ringpuffer
    if (eintraege.length > WaffenHistorie.#maxEintraege) {
      eintraege.shift();
    }
  }

  /**
   * Gibt die Historie eines Spielers zurück.
   * @param {string} playerId - Spieler-ID
   * @returns {WaffenEreignis[]}
   */
  getHistorie(playerId) {
    return [...(this.#historie.get(playerId) || [])];
  }

  /**
   * Berechnet den Historienwert (60% des Hybrid-Werts).
   */
  wertVonHistorie(playerId) {
    const eintraege = this.getHistorie(playerId);
    return eintraege
      .filter(e => e.typ === 'erhalten' || e.typ === 'verbraucht')
      .reduce((sum, e) => sum + e.wartWert * (e.typ === 'erhalten' ? 1 : 0.8), 0);
  }

  /**
   * Löscht die Historie (z.B. bei Neustart).
   */
  clear(playerId) {
    this.#historie.delete(playerId);
  }
}

/** Singleton für die globale Historie */
export const WAFFEN_HISTORIE = new WaffenHistorie();

/**
 * Berechnet den Hybrid-Wert (60% Arsenal, 25% Kampf, 15% Historie).
 * Optimiert: Nutzt bereits berechnete Werte, vermeidet Redundant-Berechnungen.
 * Stabil, deterministisch, erklärbar (AAB-06).
 *
 * @param {Object} inventar - Spieler-Inventar
 * @param {Object} zustaende - Spieler-Zustand
 * @param {string} className - Spieler-Klasse
 * @param {string} playerId - Spieler-ID (für Historie)
 * @param {Object} [opts] - Optional: vorab berechnete Werte für Performance
 * @param {number} [opts.arsenalwert] - Falls bereits bekannt
 * @param {number} [opts.kampfwert] - Falls bereits bekannt
 * @returns {number} Hybrid-Wert
 */
export function computeHybridWert(inventar, zustaende, className, playerId, opts = {}) {
  const arsenalAnteil = (opts.arsenalwert ?? computeArsenalwert(inventar.weaponIds, className)) * 0.60;
  const kampfAnteil = (opts.kampfwert ?? computeKampfwert(inventar, zustaende, className)) * 0.25;
  const historieAnteil = (playerId ? WAFFEN_HISTORIE.wertVonHistorie(playerId) : 0) * 0.15;
  return Math.round(arsenalAnteil + kampfAnteil + historieAnteil);
}

/**
 * Fairness-Regeln (AAB-07).
 * Toleranzzone ±20% um den Mittelwert.
 * Optimiert: Einzelner reduce-Durchgang für Summe/Min/Max, keine spread-Operationen.
 *
 * @param {Array<number>} kampfwerte - Kampfwerte aller Spieler
 * @returns {Object} Fairness-Info { istFair, abweichung, empfoehlenerAusgleich }
 */
export function bewerteFairness(kampfwerte) {
  if (!kampfwerte || kampfwerte.length < 2) {
    return { istFair: true, abweichung: 0, empfoehlenerAusgleich: 0 };
  }

  // Einzelner reduce-Durchgang: Summe, Min, Max in einem
  const { sum, max, min } = kampfwerte.reduce(
    (acc, w) => ({
      sum: acc.sum + w,
      max: Math.max(acc.max, w),
      min: Math.min(acc.min, w),
    }),
    { sum: 0, max: -Infinity, min: Infinity }
  );
  const mittelwert = sum / kampfwerte.length;
  // Maximale Abweichung vom Mittelwert ist max(|max - m|, |min - m|)
  const maxAbweichung = Math.max(Math.abs(max - mittelwert), Math.abs(min - mittelwert));
  const abweichung = maxAbweichung / mittelwert;
  const istFair = abweichung <= 0.20; // ±20% Toleranz

  // Empfohlener Ausgleich für schwächsten Spieler
  const empfoehlenerAusgleich = Math.max(0, mittelwert * 0.25 - min);

  return { istFair, abweichung: Number(abweichung.toFixed(3)), empfoehlenerAusgleich };
}

/**
 * Simuliert die 3-Züge-Garantie für Mindestausstattung (AAB-09).
 * Liefert die Wahrscheinlichkeit, eine bestimmte Waffe zu erhalten.
 *
 * @param {number} aktuellerZug - Aktueller Zug im Match
 * @param {number} gespielteSpiele - Anzahl gespielte Spiele
 * @returns {number} Wahrscheinlichkeit (0-1)
 */
export function wahrscheinlichkeitMindestausstattung(aktuellerZug, gespielteSpiele = 0) {
  // Die 3-Züge-Garantie: Spätestens Zug 3 gibt es nutzbare Versorgung
  if (aktuellerZug >= 3) return 1.0;
  // Sanfte Regelung: erhöhte Chance in frühen Zügen
  const basis = 0.3 + 0.2 * aktuellerZug;
  // Zufall: Identische Seeds erzeugen identische Ergebnisse
  return Math.min(1, basis);
}

/**
 * Prüft, ob ein Spieler "unterversorgt" ist (AAB-05).
 *
 * @param {number} kampfwert - Spieler-Kampfwert
 * @param {number[]} alleKampfwerte - Alle Spieler-Kampfwerte
 * @returns {boolean} true wenn unterversorgt
 */
export function istUnterversorgt(kampfwert, alleKampfwerte) {
  if (!alleKampfwerte || alleKampfwerte.length < 2) return false;
  const mittelwert = alleKampfwerte.reduce((a, b) => a + b, 0) / alleKampfwerte.length;
  return kampfwert < mittelwert * 0.75; // Unterscheidet zwischen Pech und absichtlichem Verbrauch
}

/**
 * Exportiert den aktuellen AAB-Status für Debugging (AAB-26).
 * Optimiert: Nutzt bereits berechnete Werte, vermeidet Triple-Berechnung.
 */
export function aabStatus(inventar, zustaende, className, playerId, alleSpieler) {
  const arsenal = computeArsenalwert(inventar.weaponIds, className);
  const kampf = computeKampfwert(inventar, zustaende, className);
  const hybrid = computeHybridWert(inventar, zustaende, className, playerId, { arsenalwert: arsenal, kampfwert: kampf });
  const historie = WAFFEN_HISTORIE.wertVonHistorie(playerId);
  const fairness = alleSpieler
    ? bewerteFairness(alleSpieler.map(p => computeHybridWert(
        p.inventar, p.zustaende, p.className, p.playerId)))
    : { istFair: true, abweichung: 0, empfoehlenerAusgleich: 0 };

  // Munition zählen effizient
  let munitionVorhanden = 0;
  if (inventar.weaponIds && inventar.ammo) {
    for (const id of inventar.weaponIds) {
      if (inventar.ammo.get(id) > 0) munitionVorhanden++;
    }
  }

  return {
    arsenalwert: arsenal,
    kampfwert: kampf,
    historienwert: historie,
    hybridwert: hybrid,
    fairness,
    waffenAnzahl: inventar.weaponIds?.length || 0,
    munitionVorhanden,
  };
}

export default {
  arsenalwert,
  computeArsenalwert,
  computeKampfwert,
  computeHybridWert,
  bewerteFairness,
  istUnterversorgt,
  wahrscheinlichkeitMindestausstattung,
  aabStatus,
  WAFFEN_HISTORIE,
};