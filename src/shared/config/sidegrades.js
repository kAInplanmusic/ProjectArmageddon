/**
 * Sidegrades — Trade-offs auf dem wirksamen Kampfprofil.
 *
 * Was ein Sidegrade ist
 * ---------------------
 * KEIN Gegenstand, KEIN Upgrade, KEIN Kauf. Ein Sidegrade ist eine Modifikation
 * des Kampfprofils, die man mit einem NACHTeil bezahlt. Es hängt damit an der
 * Entscheidung, die das Spiel schon kennt: Waffe wählen und abwerfen
 * (`MAX_WEAPONS` in `inventory.js`). Eine siebte Ressource daneben wäre
 * Number-Bloat und ist ausdrücklich nicht der Entwurf.
 *
 * Verworfen (mit Beleg, siehe docs/entwurf-onboarding-sidegrades-counterplay.md
 * Abschnitt B.5): Sidegrades als Loot-Gegenstände IM Match. Nachgemessen
 * verschiebt eine zusätzliche Ziehung aus dem `LOOT`-Stream ALLE nachfolgenden
 * Kisten — bestehende Replays würden divergieren.
 *
 * Warum die Werte hier und nicht im Client
 * ---------------------------------------
 * Dieselbe Regel wie bei den Klassen: „Eine Regel, eine Stelle." Die Faktoren
 * stehen neben ihrer Erklärung, die Verrechnung passiert in EINEM Ausdruck in
 * `combatProfile()`. Der Client liest nur.
 *
 * Determinismus
 * -------------
 * Die Rechnung ist PUR: dieselben drei Eingaben ergeben dieselben drei Faktoren,
 * auf jedem Rechner, zu jedem Tick. Es gibt keinen Zufall und keinen eigenen
 * Seed-Strom — die Wahl ist Match-Konfiguration, dieselbe Kategorie wie `preset`.
 * Siehe B.4 des Entwurfs.
 *
 * @module sidegrades
 */

/**
 * Untergrenze je Achse.
 *
 * Schutz vor Entartung: Ohne Grenze könnte die multiplikative Verkettung eine
 * Figur mit 0 Leben oder 0 Tempo erzeugen — spielunfähig und im Replay nicht
 * mehr zu retten. Die Grenze steht HIER als Konstante und nicht als verstecktes
 * `Math.max` an einer Aufrufstelle: So ist sie prüfbar und ändert sich an genau
 * einer Stelle.
 */
export const SIDEGRADE_FLOOR = Object.freeze({
  healthMultiplier: 0.5,
  damageMultiplier: 0.5,
  launchSpeedMultiplier: 0.6,
});

/**
 * Die Achsen, die ein Sidegrade verändern darf.
 *
 * Bewusst NUR die drei wirksamen: `drag`, `mass` und die Tempo-Werte liest der
 * Motor nicht (`combatProfile().inert`). Ein Sidegrade darauf hätte keine
 * Wirkung und wäre eine stille Lüge in der Anzeige.
 */
export const SIDEGRADE_AXES = Object.freeze([
  'healthMultiplier',
  'damageMultiplier',
  'launchSpeedMultiplier',
]);

/**
 * Die Sidegrades selbst.
 *
 * Jeder Eintrag hat mindestens einen Faktor > 1 UND einen < 1 — das ist die
 * Trade-off-Bedingung. Ein Eintrag mit ausschließlich Faktoren >= 1 wäre ein
 * Upgrade und wird von einem Test abgelehnt.
 */
export const SIDEGRADES = Object.freeze({
  kompakt: Object.freeze({
    id: 'kompakt',
    label: 'Kompakter Verschluss',
    erklaerung: 'Schießt schneller, trifft aber schwächer — für Stellungswechsel.',
    modifiers: Object.freeze({
      healthMultiplier: 1.0,
      damageMultiplier: 0.85,
      launchSpeedMultiplier: 1.2,
    }),
  }),

  schwerlast: Object.freeze({
    id: 'schwerlast',
    label: 'Schwerlast-Rohr',
    erklaerung: 'Mehr Wucht und weniger Tempo — wer ohnehin steht, gewinnt.',
    modifiers: Object.freeze({
      healthMultiplier: 1.15,
      damageMultiplier: 1.2,
      launchSpeedMultiplier: 0.85,
    }),
  }),

  gepanzert: Object.freeze({
    id: 'gepanzert',
    label: 'Zusatzpanzerung',
    erklaerung: 'Hält mehr aus, schießt aber kürzer — für die vorderste Linie.',
    modifiers: Object.freeze({
      healthMultiplier: 1.25,
      damageMultiplier: 0.9,
      launchSpeedMultiplier: 0.9,
    }),
  }),

  praezision: Object.freeze({
    id: 'praezision',
    label: 'Präzisionssatz',
    erklaerung: 'Weitreichender und härter, aber zerbrechlicher — ein Duell auf Distanz.',
    modifiers: Object.freeze({
      healthMultiplier: 0.85,
      damageMultiplier: 1.15,
      launchSpeedMultiplier: 1.15,
    }),
  }),
});

/** Feste, endliche Liste der Kennungen — die Prüfgrundlage für die Validierung. */
export const SIDEGRADE_IDS = Object.freeze(Object.keys(SIDEGRADES));

/**
 * Welche Sidegrades einer Klasse offenstehen.
 *
 * Reine Listen von Kennungen, kein Zufall: Die Auswahl ist eine Entscheidung des
 * Spielers im Menü, nicht ein Wurf.
 *
 * Die Zuordnung ist absichtlich NICHT für jede Klasse gleich: Der Scout mit
 * seinem niedrigen Leben profitiert anders als die Artillery. Wichtig — die
 * Listen sind eine ANGEBOTSGrenze, keine Aussage über Stärke.
 */
export const SIDEGRADE_BY_CLASS = Object.freeze({
  scout: Object.freeze(['kompakt', 'praezision']),
  heavy: Object.freeze(['gepanzert', 'schwerlast']),
  artillery: Object.freeze(['schwerlast', 'praezision']),
});

/**
 * Prüft, ob eine Kennung ein bekanntes Sidegrade ist.
 *
 * @param {unknown} sidegradeId
 * @returns {boolean}
 */
export function isKnownSidegrade(sidegradeId) {
  return typeof sidegradeId === 'string'
    && Object.prototype.hasOwnProperty.call(SIDEGRADES, sidegradeId);
}

/**
 * Löst eine Kennung zu einem Sidegrade auf — oder zu `null`.
 *
 * Eine unbekannte Kennung ist TOLERIERBAR (Ergebnis `null`, kein Wurf): Sie
 * entspricht „kein Sidegrade". Das ist die richtige Reaktion für ein Replay aus
 * einer älteren Fassung oder für eine Konfiguration mit einem Tippfehler — das
 * Spiel bleibt spielbar. Der Unterschied zu einer unbekannten KLASSE, die
 * `combatProfile().onFallback` setzt und gemeldet wird, ist Absicht.
 *
 * @param {unknown} sidegradeId
 * @returns {object|null}
 */
export function resolveSidegrade(sidegradeId) {
  return isKnownSidegrade(sidegradeId) ? SIDEGRADES[sidegradeId] : null;
}

/**
 * Die Faktoren eines Sidegrades, mit Untergrenze — oder `null`.
 *
 * @param {unknown} sidegradeId
 * @returns {{healthMultiplier:number, damageMultiplier:number, launchSpeedMultiplier:number}|null}
 */
export function sidegradeModifiers(sidegradeId) {
  const eintrag = resolveSidegrade(sidegradeId);
  if (!eintrag) return null;
  const m = eintrag.modifiers;
  return Object.freeze({
    healthMultiplier: Math.max(SIDEGRADE_FLOOR.healthMultiplier, m.healthMultiplier ?? 1),
    damageMultiplier: Math.max(SIDEGRADE_FLOOR.damageMultiplier, m.damageMultiplier ?? 1),
    launchSpeedMultiplier: Math.max(
      SIDEGRADE_FLOOR.launchSpeedMultiplier,
      m.launchSpeedMultiplier ?? 1,
    ),
  });
}

/**
 * Die wählbaren Sidegrades einer Klasse — aufgelöst und mit Erklärung.
 *
 * Für die Anzeige: Sie bekommt fertige Einträge statt Kennungen, damit im Client
 * kein Nachschlagen und keine Liste steht (dieselbe Doktrin wie bei der
 * Hilfe-Übersicht).
 *
 * @param {string} classId
 * @returns {object[]}
 */
export function sidegradesForClass(classId) {
  const ids = SIDEGRADE_BY_CLASS[classId];
  if (!Array.isArray(ids)) return [];
  return ids
    .map(id => SIDEGRADES[id])
    .filter(Boolean)
    .map(eintrag => Object.freeze({
      id: eintrag.id,
      label: eintrag.label,
      erklaerung: eintrag.erklaerung,
      modifiers: sidegradeModifiers(eintrag.id),
    }));
}

export default {
  SIDEGRADES,
  SIDEGRADE_IDS,
  SIDEGRADE_BY_CLASS,
  SIDEGRADE_AXES,
  SIDEGRADE_FLOOR,
  isKnownSidegrade,
  resolveSidegrade,
  sidegradeModifiers,
  sidegradesForClass,
};
