/**
 * Klassen-Konfiguration für ProjectArmageddon.
 *
 * ## Zwei Tabellen, eine Regel
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) gibt es nur noch
 * DREI Klassen ohne Unterklassen: `nahkampf`, `fernkampf`, `okkultist`. Sie
 * stehen in `CLASS_DEFINITIONS`; die Reihenfolge von `CLASS_IDS` ist Vertrag,
 * weil die Zahl im Snapshot ein Index in diese Liste ist.
 *
 * Die alten Klassen `scout`/`heavy`/`artillery` samt Archetypen bleiben für
 * Altreplays in `LEGACY_CLASS_DEFINITIONS` und `CLASS_ARCHETYPES` erhalten.
 * `combatProfile()` entscheidet anhand der Klassenfassung, welche Tabelle gilt:
 *
 *   - Fassung ≤ 2: Klasse × Archetyp × Sidegrade (bitgleich zu vorher),
 *   - Fassung ≥ 3: nur Klasse × Sidegrade, Archetyp-Faktor neutral 1,0.
 *
 * ## Eine Regel, eine Stelle
 *
 * Klasse (und in Altreplays der Archetyp) werden ausschließlich in
 * `combatProfile()` verrechnet. `src/engine/match.js` liest nur das Profil;
 * `tests/source-boundaries.test.js` hält fest, dass die Rohdaten dort nicht
 * direkt multipliziert werden.
 *
 * ## Balance der drei neuen Klassen
 *
 * Die Summe der vier wirksamen Achsen (Leben + Schaden + Tempo + Beweglichkeit,
 * ohne Sidegrade) ist für alle drei Klassen **exakt 4,00**:
 *
 *   nahkampf   Leben 1,30 · Schaden 0,75 · Tempo 0,75 · Bewegl. 1,20 = 4,00
 *   fernkampf  Leben 1,00 · Schaden 1,00 · Tempo 1,00 · Bewegl. 1,00 = 4,00
 *   okkultist  Leben 0,70 · Schaden 1,25 · Tempo 1,25 · Bewegl. 0,80 = 4,00
 *
 * Gemessen mit `npm run balance:classes`; die Begründung steht bei den Werten.
 * Weil der Archetyp in Fassung 3 neutral ist, ist Tempo = Schaden (`power`).
 *
 * @module config/classes
 */

import { sidegradeModifiers } from './sidegrades.js';
import {
  KLASSEN_ALT, KLASSEN_STANDARD, istKlassenfassungNeu, klassenWerte,
} from './klassen-fassung.js';

export { istKlassenfassungNeu };

/**
 * Klassen-Rohdaten der Fassung 3. `drag` und `mass` liest der Motor nicht.
 *
 * `erklaerung` beschreibt die Rolle in EINEM Satz und nennt KEINE Zahlen — die
 * wirksamen Faktoren stehen in der Tabelle daneben (`combatProfile()`), die
 * Anzeige leitet sie von dort ab.
 */
export const CLASS_DEFINITIONS = Object.freeze({
  nahkampf: Object.freeze({
    drag: 1.2, mass: 1.3, power: 0.75, speed: 1.2, health: 1.3,
    erklaerung: 'Hält am meisten aus, kommt aber nur auf kurze Distanz heran — der Anker eines Teams.',
  }),
  fernkampf: Object.freeze({
    drag: 1.0, mass: 1.0, power: 1.0, speed: 1.0, health: 1.0,
    erklaerung: 'Schießt mit Projektilen auf mittlere Distanz und hält im Mittelfeld allem stand.',
  }),
  okkultist: Object.freeze({
    drag: 0.8, mass: 0.7, power: 1.25, speed: 0.8, health: 0.7,
    erklaerung: 'Trifft am härtesten und wirkt über Flächen — zahlt es mit Leben.',
  }),
});

/**
 * Alte Klassen der Fassungen 1 und 2. Bleiben unverändert, damit alte Replays
 * bitgleich laufen (`tests/klassen-fassung.test.js`, Gold-Hash `GOLD_F1`).
 */
export const LEGACY_CLASS_DEFINITIONS = Object.freeze({
  scout: Object.freeze({
    drag: 0.9, mass: 0.8, power: 0.7, speed: 1.2, health: 0.8,
    erklaerung: 'Am beweglichsten, aber der schwächste Schütze — lebt von Stellung und Tempo.',
  }),
  heavy: Object.freeze({
    drag: 1.1, mass: 1.2, power: 1.0, speed: 0.8, health: 1.3,
    erklaerung: 'Hält am meisten aus und schießt im Mittelfeld — der Anker eines Teams.',
  }),
  artillery: Object.freeze({
    drag: 0.8, mass: 0.9, power: 1.3, speed: 0.7, health: 0.9,
    erklaerung: 'Trifft am härtesten und fliegt am weitesten — zahlt es mit Leben.',
  }),
});

/**
 * Archetyp-Rohdaten der Fassungen 1 und 2.
 *
 * `launch` ist die Abschussgeschwindigkeit (früher irreführend `damage`
 * genannt); sie geht über `ARCHETYPE_LAUNCH_BASE` in
 * `combatProfile().launchSpeedMultiplier` ein und nicht in den Schaden.
 * In Fassung 3 kommen Archetypen nicht mehr vor.
 */
export const CLASS_ARCHETYPES = Object.freeze({
  brawler: Object.freeze({
    health: 1.2, launch: 1.1, speed: 0.9,
    erklaerung: 'Robust und ausgeglichen — verzeiht Fehler.',
  }),
  artillerist: Object.freeze({
    health: 0.8, launch: 1.4, speed: 0.8,
    erklaerung: 'Schnellerer Abschuss, weniger Leben — für Treffer aus der Distanz.',
  }),
  occultist: Object.freeze({
    health: 0.7, launch: 1.6, speed: 1.0,
    erklaerung: 'Schießt am schnellsten, ist am zerbrechlichsten — ein Glasgeschütz.',
  }),
});

/**
 * Bezugswert, auf den `archetype.launch` in den Fassungen 1 und 2 normalisiert
 * wird. 1,2 ist der Wert KEINES Archetyps — festgehalten für Altreplays. In
 * Fassung 3 ohne Bedeutung (neutraler Faktor 1,0).
 */
export const ARCHETYPE_LAUNCH_BASE = 1.2;

const FALLBACK_CLASS_ID = 'nahkampf';
const LEGACY_FALLBACK_CLASS_ID = 'scout';
const FALLBACK_ARCHETYPE_ID = 'brawler';

/** Die drei neuen Klassen — Reihenfolge ist der Snapshot-Vertrag. */
export const CLASS_IDS = Object.freeze(Object.keys(CLASS_DEFINITIONS));
/** Die drei alten Klassen der Fassungen ≤ 2 (eigene Indexliste, eigener Snapshot). */
export const LEGACY_CLASS_IDS = Object.freeze(Object.keys(LEGACY_CLASS_DEFINITIONS));
export const ARCHETYPE_IDS = Object.freeze(Object.keys(CLASS_ARCHETYPES));

/**
 * Die Klassenkennungen einer Fassung — dieselbe Zahl im Snapshot bedeutet je
 * Fassung etwas anderes. Genau deshalb gibt es diese eine Abfrage.
 *
 * @param {number} fassung
 * @returns {readonly string[]}
 */
export function klassenIds(fassung = KLASSEN_STANDARD) {
  return istKlassenfassungNeu(fassung) ? CLASS_IDS : LEGACY_CLASS_IDS;
}

/**
 * Löst einen Snapshot-Index zu einer Klassenkennung auf.
 *
 * @param {number|string|null|undefined} index - Zahl = Index, Zeichenkette = Kennung
 * @param {number} fassung
 * @returns {string}
 */
export function klassenKennung(index, fassung = KLASSEN_STANDARD) {
  const ids = klassenIds(fassung);
  if (typeof index === 'number') return ids[index] ?? ids[0];
  return index ?? ids[0];
}

/** Klassenrohtabelle einer Fassung. */
function klassentabelle(fassung) {
  return istKlassenfassungNeu(fassung) ? CLASS_DEFINITIONS : LEGACY_CLASS_DEFINITIONS;
}

/**
 * Löst Klasse (und in Altreplays den Archetyp) für einen Spielerplatz auf.
 *
 * Fassung 3 kennt keinen Archetyp mehr: `archetypeId` ist dort `null`, die
 * Klasse kommt aus `CLASS_IDS[index % 3]`. Fassungen 1 und 2 behalten die alte
 * Regel `index % 3` für Klasse UND Archetyp.
 *
 * Eine unbekannte Kennung in der Wahl wird TOLERANT behandelt: Sie fällt auf den
 * Platzwert zurück, statt einen Fehler zu werfen — eine Konfiguration aus einer
 * älteren Fassung soll spielbar bleiben.
 *
 * @param {number} index - Spielerplatz (0-basiert)
 * @param {{classId?: string, archetypeId?: string}|null} [wahl]
 * @param {number} [klassen] - Klassenfassung; Standard ist Fassung 3
 * @returns {{classId: string, archetypeId: string|null, gewaehlt: boolean}}
 */
export function resolveLoadout(index, wahl = null, klassen = KLASSEN_STANDARD) {
  const neu = istKlassenfassungNeu(klassen);
  const ids = klassenIds(klassen);
  const tabelle = klassentabelle(klassen);
  const platzKlasse = ids[index % ids.length];
  const gewaehlteKlasse = tabelle[wahl?.classId] ? wahl.classId : null;

  if (neu) {
    return Object.freeze({
      classId: gewaehlteKlasse ?? platzKlasse,
      archetypeId: null,
      gewaehlt: gewaehlteKlasse !== null,
    });
  }

  const platzArchetyp = ARCHETYPE_IDS[index % ARCHETYPE_IDS.length];
  const gewaehlterArchetyp = CLASS_ARCHETYPES[wahl?.archetypeId] ? wahl.archetypeId : null;
  return Object.freeze({
    classId: gewaehlteKlasse ?? platzKlasse,
    archetypeId: gewaehlterArchetyp ?? platzArchetyp,
    gewaehlt: gewaehlteKlasse !== null || gewaehlterArchetyp !== null,
  });
}

/**
 * Wirksames Kampfprofil aus Klasse, Archetyp und optionalem Sidegrade — die
 * einzige Stelle, an der diese Tabellen verrechnet werden.
 *
 * Fassung ≥ 3: `Leben = Klasse.health`, `Schaden = Klasse.power`,
 * `Tempo = Klasse.power × 1,0` (neutraler Archetyp). Der übergebene
 * `archetypeId` wird ignoriert und im Ergebnis auf `null` gesetzt.
 *
 * Fassung ≤ 2: unverändert `Klasse × Archetyp`, danach das Sidegrade.
 *
 * @param {string} classId - z. B. `"nahkampf"` (Fassung 3) oder `"scout"` (≤ 2)
 * @param {string|null} archetypeId - nur Fassungen ≤ 2; in Fassung 3 ignoriert
 * @param {string|null} [sidegradeId]
 * @param {number} [klassen] - Klassenfassung; ohne Angabe `KLASSEN_ALT`
 * @returns {Readonly<object>}
 */
export function combatProfile(classId, archetypeId, sidegradeId = null, klassen = KLASSEN_ALT) {
  const fassung = klassen;
  const neu = istKlassenfassungNeu(fassung);
  const tabelle = klassentabelle(fassung);
  const fallbackKlasse = !tabelle[classId];
  const fallbackId = neu ? FALLBACK_CLASS_ID : LEGACY_FALLBACK_CLASS_ID;
  const classDef = klassenWerte(tabelle, fallbackKlasse ? fallbackId : classId, fassung);
  const gewaehltClassId = fallbackKlasse ? fallbackId : classId;

  const side = sidegradeModifiers(sidegradeId);
  const gewaehltSidegradeId = side ? sidegradeId : null;

  if (neu) {
    // Archetyp neutral: kein zweiter Faktor, keine zweite Tabelle.
    const basisTempo = classDef.power;
    return Object.freeze({
      classId: gewaehltClassId,
      archetypeId: null,
      sidegradeId: gewaehltSidegradeId,
      healthMultiplier: classDef.health * (side?.healthMultiplier ?? 1),
      damageMultiplier: classDef.power * (side?.damageMultiplier ?? 1),
      launchSpeedMultiplier: basisTempo * (side?.launchSpeedMultiplier ?? 1),
      mobilityMultiplier: classDef.speed,
      onFallback: fallbackKlasse,
      inert: Object.freeze({ drag: classDef.drag, mass: classDef.mass }),
    });
  }

  const fallbackArchetyp = !CLASS_ARCHETYPES[archetypeId];
  const archetype = CLASS_ARCHETYPES[archetypeId] ?? CLASS_ARCHETYPES[FALLBACK_ARCHETYPE_ID];
  const gewaehltArchetypeId = fallbackArchetyp ? FALLBACK_ARCHETYPE_ID : archetypeId;

  const basisLeben = classDef.health * archetype.health;
  const basisSchaden = classDef.power;
  const basisTempo = classDef.power * (archetype.launch / ARCHETYPE_LAUNCH_BASE);

  return Object.freeze({
    classId: gewaehltClassId,
    archetypeId: gewaehltArchetypeId,
    sidegradeId: gewaehltSidegradeId,
    healthMultiplier: basisLeben * (side?.healthMultiplier ?? 1),
    damageMultiplier: basisSchaden * (side?.damageMultiplier ?? 1),
    launchSpeedMultiplier: basisTempo * (side?.launchSpeedMultiplier ?? 1),
    mobilityMultiplier: classDef.speed,
    onFallback: fallbackKlasse || fallbackArchetyp,
    inert: Object.freeze({
      drag: classDef.drag,
      mass: classDef.mass,
      classSpeed: classDef.speed,
      archetypeSpeed: archetype.speed,
      archetypeLaunchAsDamage: archetype.launch,
    }),
  });
}

/**
 * Alle Profile einer Fassung — für Anzeige und Tests.
 *
 * Fassung 3: genau drei (Klasse ohne Archetyp). Fassungen ≤ 2: neun
 * Kombinationen aus Klasse und Archetyp.
 *
 * @param {number} [klassen]
 * @returns {object[]}
 */
export function allCombatProfiles(klassen = KLASSEN_STANDARD) {
  const ergebnis = [];
  if (istKlassenfassungNeu(klassen)) {
    for (const classId of CLASS_IDS) ergebnis.push(combatProfile(classId, null, null, klassen));
    return ergebnis;
  }
  for (const classId of LEGACY_CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      ergebnis.push(combatProfile(classId, archetypeId, null, klassen));
    }
  }
  return ergebnis;
}

/**
 * Übersicht für die Hilfe-Anzeige — die EINZIGE Stelle, die Klassenprosa und
 * Klassenwerte zusammenführt.
 *
 * Fassung 3 liefert drei Klassen und eine LEERE Archetyp-Liste: Es gibt keine
 * Unterklassen mehr, also bietet die Hilfe auch keine an. Fassungen ≤ 2 liefern
 * weiterhin beide Listen, damit Altreplays ihre Anzeige behalten.
 *
 * Die Zahlen kommen aus der Tabelle — also aus derselben Quelle, die
 * `combatProfile()` verrechnet.
 *
 * @param {number} [fassung]
 * @returns {{klassen: object[], archetypen: object[], inertHinweis: string, kopplungHinweis: string}}
 */
export function uebersichtFuerHilfe(fassung = KLASSEN_STANDARD) {
  const tabelle = klassentabelle(fassung);
  const ids = klassenIds(fassung);
  const neu = istKlassenfassungNeu(fassung);

  const klassen = ids.map(classId => {
    const def = klassenWerte(tabelle, classId, fassung);
    return {
      id: classId,
      label: classId,
      erklaerung: def.erklaerung,
      wirksam: Object.freeze({
        leben: def.health,
        schaden: def.power,
        tempo: neu ? def.power : def.power * (CLASS_ARCHETYPES.brawler.launch / ARCHETYPE_LAUNCH_BASE),
        beweglichkeit: def.speed,
      }),
      inert: Object.freeze({ drag: def.drag, mass: def.mass }),
    };
  });

  const archetypen = neu ? [] : ARCHETYPE_IDS.map(archetypeId => {
    const def = CLASS_ARCHETYPES[archetypeId];
    return {
      id: archetypeId,
      label: archetypeId,
      erklaerung: def.erklaerung,
      wirksam: Object.freeze({
        leben: def.health,
        tempo: def.launch / ARCHETYPE_LAUNCH_BASE,
      }),
      inert: Object.freeze({ speed: def.speed }),
    };
  });

  return {
    klassen,
    archetypen,
    inertHinweis: 'drag und mass sind deklariert, werden vom Motor aber nicht '
      + 'gelesen — sie stehen hier als Hinweis, nicht als Spielwert.',
    kopplungHinweis: neu
      ? 'Es gibt drei Klassen ohne Unterklassen: Nahkampf, Fernkampf und '
        + 'Okkultist. Jede Fraktion stellt je Klasse drei Einheiten; der Platz '
        + 'entscheidet, welche davon eine Figur zeigt.'
      : 'Standardmäßig sind im laufenden Match nur drei der neun Kombinationen '
        + 'erreichbar (Scout/Brawler, Heavy/Artillerist, Artillery/Okkultist): '
        + 'Klasse und Archetyp werden gemeinsam über den Listenindex vergeben.',
  };
}

/**
 * Die Gegenseite, gegen die eine Klasse ihre Stärke ausspielen kann — aus den
 * ZAHLEN abgeleitet, nicht aus einer erfundenen Erzählung.
 *
 * Verglichen werden die vier Achsen, die der Motor tatsächlich liest
 * (`combatProfile()`): Leben, Wucht (Schaden), Reichweite (Tempo),
 * Beweglichkeit. Eine Klasse ist gegen eine andere stark, wenn sie sie auf mehr
 * Achsen übertrifft als unterliegt; bei Gleichstand bleibt `starkGegen` `null`.
 * Eine erfundene Zuordnung wäre eine Anzeige, die eine Balance behauptet, die
 * es nicht gibt.
 *
 * @param {number} [klassen]
 * @returns {Readonly<object>}
 */
export function classCounterplay(klassen = KLASSEN_STANDARD) {
  const neu = istKlassenfassungNeu(klassen);
  const ids = klassenIds(klassen);
  const profile = {};
  for (const classId of ids) {
    // In Altreplays derselbe Archetyp für alle, damit nur der Klassenanteil zählt.
    profile[classId] = combatProfile(classId, neu ? null : 'brawler', null, klassen);
  }

  const achsen = [
    { id: 'leben', wert: p => p.healthMultiplier, vorteil: 'hält mehr aus' },
    { id: 'wucht', wert: p => p.damageMultiplier, vorteil: 'trifft härter' },
    { id: 'reichweite', wert: p => p.launchSpeedMultiplier, vorteil: 'schießt weiter' },
    { id: 'beweglichkeit', wert: p => p.mobilityMultiplier, vorteil: 'springt höher' },
  ];

  const ergebnis = {};
  for (const classId of ids) {
    const eigene = profile[classId];

    const bewertet = ids
      .filter(andere => andere !== classId)
      .map(andere => {
        const fremde = profile[andere];
        const vorteile = achsen.filter(a => a.wert(eigene) > a.wert(fremde));
        const nachteile = achsen.filter(a => a.wert(eigene) < a.wert(fremde));
        return { classId: andere, vorteile, nachteile, saldo: vorteile.length - nachteile.length };
      });

    const kandidatenStark = bewertet.filter(e => e.saldo > 0).sort((a, b) => b.saldo - a.saldo);
    const kandidatenSchwach = bewertet.filter(e => e.saldo < 0).sort((a, b) => a.saldo - b.saldo);
    const stark = kandidatenStark[0] ?? null;
    const schwach = kandidatenSchwach[0] ?? null;

    ergebnis[classId] = Object.freeze({
      classId,
      starkGegen: stark
        ? Object.freeze({
          classId: stark.classId,
          wegen: Object.freeze(stark.vorteile.map(a => a.vorteil)),
        })
        : null,
      schwachGegen: schwach
        ? Object.freeze({
          classId: schwach.classId,
          wegen: Object.freeze(schwach.nachteile.map(a => a.vorteil)),
        })
        : null,
      profil: Object.freeze({
        leben: eigene.healthMultiplier,
        wucht: eigene.damageMultiplier,
        reichweite: eigene.launchSpeedMultiplier,
        beweglichkeit: eigene.mobilityMultiplier,
      }),
    });
  }
  return Object.freeze(ergebnis);
}

export default { CLASS_DEFINITIONS, CLASS_ARCHETYPES, combatProfile };
