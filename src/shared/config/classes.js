/**
 * Klassen-Konfiguration für ProjectArmageddon.
 *
 * Definiert die Rohdaten der Klassen (Drag/Masse/Power/Tempo/Leben) und der
 * Kampfarchetypen (Leben/Schaden/Tempo) sowie das daraus abgeleitete
 * **wirksame Kampfprofil**.
 *
 * ## Eine Regel, eine Stelle
 *
 * Klasse und Archetyp werden ausschließlich in `combatProfile()` verrechnet.
 * Vorher gab es zwei Fassungen derselben Regel:
 *
 *  1. die Helfer `applyClassModifiers` / `applyArchetypeModifiers` in dieser
 *     Datei — sie wurden **nirgends aufgerufen**, waren toter Code und
 *     beschrieben eine *andere* Rechnung als die, die tatsächlich lief
 *     (sie überschrieben z. B. `power` mit `angle` und kannten den
 *     Archetyp-Schadensfaktor überhaupt nicht),
 *  2. die Inline-Multiplikation in `src/engine/match.js`, die das Spiel
 *     wirklich rechnete.
 *
 * Wer die Balance ändern wollte, musste beide Stellen finden — und hätte sich
 * beim ersten Anlauf an der falschen bedient. Die Helfer sind deshalb entfallen.
 * `src/engine/match.js` liest nur noch das Profil; `tests/source-boundaries.test.js`
 * hält fest, dass die Rohdaten dort nicht mehr direkt multipliziert werden.
 *
 * ## Wirksam vs. deklariert
 *
 * Die Tabellen führen mehr Dimensionen, als der Motor heute liest. Was
 * tatsächlich wirkt, steht im Profil unter `healthMultiplier`,
 * `damageMultiplier` und `launchSpeedMultiplier`; was **nur deklariert** ist,
 * steht ausdrücklich unter `inert`. Diese Trennung ist Absicht: Ein Wert, der
 * wie eine Spielregel aussieht, aber nichts tut, ist eine stille Lüge — hier
 * ist er als unwirksam gekennzeichnet und getestet, statt versteckt zu sein.
 *
 * Das Verdrahten der unwirksamen Dimensionen ist eine **Balance-Entscheidung**
 * und wird bewusst nicht nebenbei erledigt: `archetype.damage` wirkt heute als
 * Tempo-Faktor (occultist schießt am schnellsten), obwohl der Name Schaden
 * verspricht. Beides zugleich zu ändern hieße, das Klassen-Balancing in einem
 * Zug umzuwerfen. Siehe MASTERDOTO.md, Abschnitt „Klassen-Profil".
 */

/** Klassen-Rohdaten. `drag`, `mass` und `speed` liest der Motor derzeit nicht. */
export const CLASS_DEFINITIONS = Object.freeze({
  scout: Object.freeze({ drag: 0.9, mass: 0.8, power: 0.7, speed: 1.2, health: 0.8 }),
  heavy: Object.freeze({ drag: 1.1, mass: 1.2, power: 1.0, speed: 0.8, health: 1.3 }),
  artillery: Object.freeze({ drag: 0.8, mass: 0.9, power: 1.3, speed: 0.7, health: 0.9 }),
});

/**
 * Archetyp-Rohdaten.
 *
 * `damage` ist derzeit doppelt belegt: Es geht als `launchSpeedMultiplier` in
 * die Abschussgeschwindigkeit ein (siehe `ARCHETYPE_DAMAGE_BASE`) und wird
 * **nicht** als Schadensfaktor angewandt. `speed` liest der Motor nicht.
 */
export const CLASS_ARCHETYPES = Object.freeze({
  brawler: Object.freeze({ health: 1.2, damage: 1.1, speed: 0.9 }),
  artillerist: Object.freeze({ health: 0.8, damage: 1.4, speed: 0.8 }),
  occultist: Object.freeze({ health: 0.7, damage: 1.6, speed: 1.0 }),
});

/**
 * Bezugswert, auf den `archetype.damage` für die Abschussgeschwindigkeit
 * normalisiert wird.
 *
 * **Fund:** 1,2 ist der Wert KEINES Archetyps — brawler 1,1, artillerist 1,4,
 * occultist 1,6. Kein Archetyp schießt also mit unverändertem Tempo, und der
 * „Normalfall" ist nirgends erreichbar. Der Wert stammt aus der Zeit, als die
 * Zahl direkt in `match.js` stand (`archetype.damage / 1.2`), und wurde beim
 * Zusammenführen bewusst unverändert übernommen: Ihn zu korrigieren ist eine
 * Balance-Änderung, keine Aufräumarbeit. Siehe MASTERDOTO.md, „Klassen-Profil".
 */
export const ARCHETYPE_DAMAGE_BASE = 1.2;

/** Rückfallwerte, falls eine unbekannte Kennung übergeben wird. */
export const FALLBACK_CLASS_ID = 'scout';
export const FALLBACK_ARCHETYPE_ID = 'brawler';

export const CLASS_IDS = Object.freeze(Object.keys(CLASS_DEFINITIONS));
export const ARCHETYPE_IDS = Object.freeze(Object.keys(CLASS_ARCHETYPES));

/**
 * Wirksames Kampfprofil aus Klasse und Archetyp — die einzige Stelle, an der
 * beide Tabellen verrechnet werden.
 *
 * Alle Faktoren sind multiplikativ und auf die Grundwerte des Motors bezogen
 * (`BASE_HEALTH` = 100, `POWER_TO_SPEED` = 0,14 in `src/engine/match.js`).
 *
 * @param {string} classId - z. B. `"scout"` (unbekannt → `scout`)
 * @param {string} archetypeId - z. B. `"brawler"` (unbekannt → `brawler`)
 * @returns {Readonly<{
 *   classId: string,
 *   archetypeId: string,
 *   healthMultiplier: number,
 *   damageMultiplier: number,
 *   launchSpeedMultiplier: number,
 *   onFallback: boolean,
 *   inert: Readonly<object>
 * }>}
 */
export function combatProfile(classId, archetypeId) {
  const fallbackKlasse = !CLASS_DEFINITIONS[classId];
  const fallbackArchetyp = !CLASS_ARCHETYPES[archetypeId];
  const classDef = CLASS_DEFINITIONS[classId] ?? CLASS_DEFINITIONS[FALLBACK_CLASS_ID];
  const archetype = CLASS_ARCHETYPES[archetypeId] ?? CLASS_ARCHETYPES[FALLBACK_ARCHETYPE_ID];
  const gewaehltClassId = fallbackKlasse ? FALLBACK_CLASS_ID : classId;
  const gewaehltArchetypeId = fallbackArchetyp ? FALLBACK_ARCHETYPE_ID : archetypeId;

  return Object.freeze({
    classId: gewaehltClassId,
    archetypeId: gewaehltArchetypeId,

    // --- wirksam: diese drei liest der Motor ---
    /** Leben: Klasse × Archetyp. */
    healthMultiplier: classDef.health * archetype.health,
    /** Schaden: nur die Klasse skaliert ihn. */
    damageMultiplier: classDef.power,
    /** Abschussgeschwindigkeit: Klasse × normalisierter Archetyp-Schadenswert. */
    launchSpeedMultiplier: classDef.power * (archetype.damage / ARCHETYPE_DAMAGE_BASE),

    /** Wurde eine unbekannte Kennung ersetzt? Nützlich für Diagnosen. */
    onFallback: fallbackKlasse || fallbackArchetyp,

    /**
     * Deklariert, aber vom Motor nicht gelesen. Absichtlich aufgeführt, damit
     * die Lücke sichtbar und getestet ist statt still zu bestehen.
     */
    inert: Object.freeze({
      drag: classDef.drag,
      mass: classDef.mass,
      classSpeed: classDef.speed,
      archetypeSpeed: archetype.speed,
      archetypeDamageAsDamage: archetype.damage,
    }),
  });
}

/** Alle neun Kombinationen aus Klasse und Archetyp — für Anzeige und Tests. */
export function allCombatProfiles() {
  const ergebnis = [];
  for (const classId of CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      ergebnis.push(combatProfile(classId, archetypeId));
    }
  }
  return ergebnis;
}

export default { CLASS_DEFINITIONS, CLASS_ARCHETYPES, combatProfile };
