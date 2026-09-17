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

import { sidegradeModifiers } from './sidegrades.js';

/**
 * Klassen-Rohdaten. `drag`, `mass` und `speed` liest der Motor derzeit nicht.
 *
 * `erklaerung` beschreibt die Rolle in EINEM Satz. Wichtig: Der Satz nennt
 * KEINE Zahlen. Die wirksamen Faktoren stehen in der Tabelle daneben (siehe
 * `combatProfile()`), und die Anzeige leitet sie von dort ab. Stünde hier
 * „schießt am schwächsten (0,7)“, müsste der Satz bei jeder Balance-Änderung
 * mitwandern — und genau diese zweite Quelle will diese Datei vermeiden.
 */
export const CLASS_DEFINITIONS = Object.freeze({
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
 * Archetyp-Rohdaten.
 *
 * `damage` ist derzeit doppelt belegt: Es geht als `launchSpeedMultiplier` in
 * die Abschussgeschwindigkeit ein (siehe `ARCHETYPE_DAMAGE_BASE`) und wird
 * **nicht** als Schadensfaktor angewandt. `speed` liest der Motor nicht.
 *
 * `erklaerung`: ein Satz, ohne Zahlen — wie bei den Klassen.
 */
export const CLASS_ARCHETYPES = Object.freeze({
  brawler: Object.freeze({
    health: 1.2, damage: 1.1, speed: 0.9,
    erklaerung: 'Robust und ausgeglichen — verzeiht Fehler.',
  }),
  artillerist: Object.freeze({
    health: 0.8, damage: 1.4, speed: 0.8,
    erklaerung: 'Schnellerer Abschuss, weniger Leben — für Treffer aus der Distanz.',
  }),
  occultist: Object.freeze({
    health: 0.7, damage: 1.6, speed: 1.0,
    erklaerung: 'Schießt am schnellsten, ist am zerbrechlichsten — ein Glasgeschütz.',
  }),
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
 * Wirksames Kampfprofil aus Klasse, Archetyp und optionalem Sidegrade — die
 * einzige Stelle, an der diese Tabellen verrechnet werden.
 *
 * Alle Faktoren sind multiplikativ und auf die Grundwerte des Motors bezogen
 * (`BASE_HEALTH` = 100, `POWER_TO_SPEED` = 0,14 in `src/engine/match.js`).
 *
 * Die Verkettung läuft in FESTER Reihenfolge: Klasse × Archetyp, danach das
 * Sidegrade. Ein einziger Ausdruck, kein Zwischenschritt an einer Aufrufstelle —
 * damit bleibt es bei „eine Regel, eine Stelle" und die Rechnung ist pur
 * (dieselben Eingaben ergeben auf jedem Rechner dieselben Faktoren). Das ist die
 * Voraussetzung dafür, dass ein Replay reproduzierbar bleibt.
 *
 * @param {string} classId - z. B. `"scout"` (unbekannt → `scout`)
 * @param {string} archetypeId - z. B. `"brawler"` (unbekannt → `brawler`)
 * @param {string|null} [sidegradeId] - Kennung aus `SIDEGRADE_IDS`. Eine
 *   UNBEKANNTE Kennung ist tolerierbar und wirkt wie „kein Sidegrade": Sie setzt
 *   `onFallback` NICHT — anders als eine unbekannte Klasse. Grund: Ein Replay aus
 *   einer älteren Fassung oder eine Konfiguration mit Tippfehler soll spielbar
 *   bleiben, und das Fehlen eines Sidegrades ist kein Fehler.
 * @returns {Readonly<{
 *   classId: string,
 *   archetypeId: string,
 *   sidegradeId: string|null,
 *   healthMultiplier: number,
 *   damageMultiplier: number,
 *   launchSpeedMultiplier: number,
 *   onFallback: boolean,
 *   inert: Readonly<object>
 * }>}
 */
export function combatProfile(classId, archetypeId, sidegradeId = null) {
  const fallbackKlasse = !CLASS_DEFINITIONS[classId];
  const fallbackArchetyp = !CLASS_ARCHETYPES[archetypeId];
  const classDef = CLASS_DEFINITIONS[classId] ?? CLASS_DEFINITIONS[FALLBACK_CLASS_ID];
  const archetype = CLASS_ARCHETYPES[archetypeId] ?? CLASS_ARCHETYPES[FALLBACK_ARCHETYPE_ID];
  const gewaehltClassId = fallbackKlasse ? FALLBACK_CLASS_ID : classId;
  const gewaehltArchetypeId = fallbackArchetyp ? FALLBACK_ARCHETYPE_ID : archetypeId;

  // Basis aus Klasse und Archetyp (wie bisher), danach das Sidegrade.
  const basisLeben = classDef.health * archetype.health;
  const basisSchaden = classDef.power;
  const basisTempo = classDef.power * (archetype.damage / ARCHETYPE_DAMAGE_BASE);

  /*
   * Sidegrade: unbekannte Kennung → `null` (kein Sidegrade), KEIN Rückfall auf
   * ein Standard-Sidegrade. Ein erfundener Ersatz wäre eine stille
   * Balance-Änderung; „kein Sidegrade" ist die neutrale und ehrliche Antwort.
   */
  const side = sidegradeModifiers(sidegradeId);
  const gewaehltSidegradeId = side ? sidegradeId : null;

  return Object.freeze({
    classId: gewaehltClassId,
    archetypeId: gewaehltArchetypeId,
    /** Das WIRKSAME Sidegrade — `null`, wenn keines gesetzt oder unbekannt. */
    sidegradeId: gewaehltSidegradeId,

    // --- wirksam: diese drei liest der Motor ---
    /** Leben: Klasse × Archetyp × Sidegrade. */
    healthMultiplier: basisLeben * (side?.healthMultiplier ?? 1),
    /** Schaden: Klasse × Sidegrade (der Archetyp skaliert ihn nicht). */
    damageMultiplier: basisSchaden * (side?.damageMultiplier ?? 1),
    /** Abschussgeschwindigkeit: Klasse × Archetyp-Tempo × Sidegrade. */
    launchSpeedMultiplier: basisTempo * (side?.launchSpeedMultiplier ?? 1),

    /**
     * Beweglichkeit: der Klassenwert, den der Motor auf den Absprung anwendet.
     *
     * Er steht hier und nicht in der Tabelle `inert`, weil er seit dem
     * Verdrahten tatsächlich wirkt: Der Scout springt höher als Heavy und
     * Artillery. Vorher existierte seine Beweglichkeit nur auf dem Papier — er
     * war damit auf jeder wirksamen Achse der schwächste (siehe MASTERDOTO,
     * „Bekannte Grenzen").
     *
     * Bewusst NICHT über den Archetyp skaliert: Die Beweglichkeit ist eine
     * Eigenschaft der KLASSE. Ein Archetyp-Einfluss wäre eine zweite
     * Balance-Achse, die niemand angefordert hat.
     */
    mobilityMultiplier: classDef.speed,

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

/**
 * Übersicht für die Hilfe-Anzeige — die EINZIGE Stelle, die Klassenprosa und
 * Klassenwerte zusammenführt.
 *
 * Bewusst hier und nicht im Client: Der Entwurf (docs/entwurf-onboarding-
 * sidegrades-counterplay.md, Abschnitt A.4) verlangt, dass alle erklärenden
 * Texte in `src/shared/config/` neben den Werten entstehen — sonst gäbe es eine
 * zweite Quelle, die bei jeder Balance-Änderung mitwandern müsste. Weil diese
 * Funktion die Sätze aus den Configs zieht, kann der Client nichts hartkodieren.
 *
 * Die Zahlen kommen aus `combatProfile()` — also aus derselben Verrechnung, die
 * der Motor liest. Die Anzeige kann damit nicht von der Wirkung abweichen.
 *
 * @returns {{klassen: object[], archetypen: object[], inertHinweis: string}}
 */
export function uebersichtFuerHilfe() {
  const klassen = CLASS_IDS.map(classId => {
    const def = CLASS_DEFINITIONS[classId];
    // Der wirksame Faktor entsteht erst mit einem Archetyp; für die Übersicht
    // wird der neutrale Fall gezeigt (Faktor 1 = kein Archetyp-Einfluss).
    // Aus der Tabelle, nicht gerechnet — sonst stünde die Rechnung zweimal da.
    return {
      id: classId,
      label: classId,
      erklaerung: def.erklaerung,
      /** Wirksam: genau die Achsen, die der Motor liest. */
      wirksam: Object.freeze({
        leben: def.health,
        schaden: def.power,
        tempo: def.power,
        /*
         * `speed` wirkt seit dem Verdrahten auf den Absprung (siehe
         * JUMP_SPEED_INFLUENCE_ABOVE in match.js): Der Scout springt höher als
         * die anderen. Er steht deshalb NICHT mehr unter `inert`.
         *
         * Die Anzeige nennt ihn „Beweglichkeit", nicht „Tempo": `power` heißt in
         * der Tabelle tempo, aber gemeint ist die Schussgeschwindigkeit — die
         * beiden zu verwechseln wäre irreführend.
         */
        beweglichkeit: def.speed,
      }),
      /** Deklariert, aber wirkungslos — wird als Hinweis gezeigt, nicht als Wert. */
      inert: Object.freeze({ drag: def.drag, mass: def.mass }),
    };
  });

  const archetypen = ARCHETYPE_IDS.map(archetypeId => {
    const def = CLASS_ARCHETYPES[archetypeId];
    return {
      id: archetypeId,
      label: archetypeId,
      erklaerung: def.erklaerung,
      wirksam: Object.freeze({
        leben: def.health,
        // Der Archetyp wirkt über seinen `damage`-Wert aufs TEMPO, nicht auf den
        // Schaden — siehe ARCHETYPE_DAMAGE_BASE. Die Anzeige nennt es deshalb
        // „Tempo"; „Schaden" hiesse hier das Falsche.
        tempo: def.damage / ARCHETYPE_DAMAGE_BASE,
      }),
      inert: Object.freeze({ speed: def.speed }),
    };
  });

  return {
    klassen,
    archetypen,
    /*
     * Die Kopplung muss genannt werden: Die Übersicht zeigt neun Kombinationen,
     * im Match sind nur drei erreichbar (`index % 3`). Sie zu verschweigen wäre
     * irreführend — gemessen sind es scout/brawler, heavy/artillerist und
     * artillery/occultist (siehe MASTERDOTO.md, „Bekannte Grenzen").
     */
    inertHinweis: 'drag und mass sind deklariert, werden vom Motor aber nicht '
      + 'gelesen — sie stehen hier als Hinweis, nicht als Spielwert.',
    kopplungHinweis: 'Im laufenden Match sind nur drei der neun Kombinationen '
      + 'erreichbar (Scout/Brawler, Heavy/Artillerist, Artillery/Okkultist): '
      + 'Klasse und Archetyp werden gemeinsam über den Listenindex vergeben.',
  };
}

/**
 * Die Gegenseite, gegen die eine Klasse ihre Stärke ausspielen kann — aus den
 * ZAHLEN abgeleitet, nicht aus einer erfundenen Erzählung.
 *
 * ## Was hier abgeleitet wird — und woraus
 *
 * Verglichen werden die drei Achsen, die der Motor TATSÄCHLICH liest
 * (`combatProfile()`): Leben, Wucht (Schaden), Reichweite (Tempo). Eine Klasse
 * ist gegen eine andere stark, wenn sie sie auf mehr Achsen übertrifft als
 * unterliegt.
 *
 * ## Fund (belegt): Es ist KEIN Kreis, sondern eine Rangfolge
 *
 * Der Entwurf ging von einer Schere-Stein-Papier-Beziehung aus. Nachgemessen
 * ist das nicht so — verglichen mit dem neutralen Archetyp (`brawler`):
 *
 *   scout      Leben 0,960 | Wucht 0,700 | Reichweite 0,642
 *   heavy      Leben 1,560 | Wucht 1,000 | Reichweite 0,917
 *   artillery  Leben 1,080 | Wucht 1,300 | Reichweite 1,192
 *
 * Daraus folgt: **scout ist auf JEDER der drei Achsen der schwächste** und hat
 * gegen niemanden einen Vorteil. artillery schlägt heavy auf zwei von drei
 * Achsen, heavy schlägt artillery nur beim Leben.
 *
 * Der Grund ist strukturell und wiegt schwerer als diese Anzeige: Der Scout ist
 * als beweglichster Charakter angelegt (`speed: 1.2`, der höchste Wert der
 * Tabelle) — aber `speed` steht unter `inert` und wird vom Motor NICHT gelesen.
 * Seine Stärke existiert nur auf dem Papier. Siehe MASTERDOTO.md,
 * „Klassen-Profil", wo `archetype.damage` als Tempo-Faktor denselben Punkt
 * berührt.
 *
 * ## Diese Funktion erfindet deshalb NICHTS dazu
 *
 * Sie liefert `starkGegen: null`, wenn keine Gegenseite übrig bleibt. Eine
 * erfundene Zuordnung wäre eine Anzeige, die eine Balance behauptet, die es
 * nicht gibt — genau die stille Lüge, die das Projekt vermeidet. Eine
 * Balance-Änderung (etwa das Verdrahten von `speed`) ist eine eigene
 * Entscheidung und wird hier bewusst nicht nebenbei vorgenommen.
 *
 * @returns {Readonly<object>} Je Klasse die stärkere und die schwächere
 *   Gegenseite — oder `null`, wenn es keine gibt
 */
export function classCounterplay() {
  /*
   * Referenzprofile mit demselben Archetyp für alle: So wird nur der
   * KLASSEN-Anteil verglichen und der Archetyp verfälscht das Ergebnis nicht.
   * `brawler` ist dafür der neutrale Fall (er verändert den Schaden nicht).
   */
  const profile = {};
  for (const classId of CLASS_IDS) {
    profile[classId] = combatProfile(classId, 'brawler');
  }

  /** Die Achsen, die der Motor liest — mit dem Text für die Anzeige. */
  const achsen = [
    { id: 'leben', wert: p => p.healthMultiplier, vorteil: 'hält mehr aus' },
    { id: 'wucht', wert: p => p.damageMultiplier, vorteil: 'trifft härter' },
    { id: 'reichweite', wert: p => p.launchSpeedMultiplier, vorteil: 'schießt weiter' },
    /*
     * Die Beweglichkeit zählt seit dem Verdrahten mit: Der Scout springt höher
     * als Heavy und Artillery (`mobilityMultiplier` wirkt im Absprung, siehe
     * JUMP_SPEED_INFLUENCE_ABOVE in match.js). Vorher stand der Wert unter
     * `inert` — ohne diese Achse hätte der Scout eine Stärke, die die Anzeige
     * verschweigt.
     *
     * Bewusst mit vollem Gewicht und nicht gedämpft: Die Dämpfung regelt, wie
     * STARK die Wirkung im Spiel ist, nicht ob sie existiert. Für die Frage
     * „wer ist worin überlegen" zählt die Richtung.
     */
    { id: 'beweglichkeit', wert: p => p.mobilityMultiplier, vorteil: 'springt höher' },
  ];

  const ergebnis = {};
  for (const classId of CLASS_IDS) {
    const eigene = profile[classId];

    const bewertet = CLASS_IDS
      .filter(andere => andere !== classId)
      .map(andere => {
        const fremde = profile[andere];
        const vorteile = achsen.filter(a => a.wert(eigene) > a.wert(fremde));
        const nachteile = achsen.filter(a => a.wert(eigene) < a.wert(fremde));
        return { classId: andere, vorteile, nachteile, saldo: vorteile.length - nachteile.length };
      });

    /*
     * Nur eine Gegenseite mit POSITIVEM Saldo ist „stark gegen". Bei Saldo 0
     * oder darunter gibt es keine — dann bleibt das Feld `null`, statt einen
     * Gegner zu nennen, den die Zahlen nicht stützen.
     *
     * `sort` ist stabil, deshalb ist bei gleichem Saldo die Reihenfolge aus
     * CLASS_IDS maßgeblich — das Ergebnis ist reproduzierbar.
     */
    const kandidatenStark = bewertet.filter(e => e.saldo > 0).sort((a, b) => b.saldo - a.saldo);
    const kandidatenSchwach = bewertet.filter(e => e.saldo < 0).sort((a, b) => a.saldo - b.saldo);

    const stark = kandidatenStark[0] ?? null;
    const schwach = kandidatenSchwach[0] ?? null;

    ergebnis[classId] = Object.freeze({
      classId,
      starkGegen: stark
        ? Object.freeze({
          classId: stark.classId,
          /** Die Achsen, die den Ausschlag geben — prüfbar, nicht nur ein Urteil. */
          wegen: Object.freeze(stark.vorteile.map(a => a.vorteil)),
        })
        : null,
      schwachGegen: schwach
        ? Object.freeze({
          classId: schwach.classId,
          wegen: Object.freeze(schwach.nachteile.map(a => a.vorteil)),
        })
        : null,
      /** Alle wirksamen Werte, damit die Anzeige nichts nachrechnen muss. */
      profil: Object.freeze({
        leben: eigene.healthMultiplier,
        wucht: eigene.damageMultiplier,
        reichweite: eigene.launchSpeedMultiplier,
        // Die Beweglichkeit gehört dazu: Sie ist seit dem Verdrahten wirksam
        // (der Scout springt höher) und muss in der Anzeige sichtbar sein —
        // sonst hätte er eine Stärke, die die Übersicht verschweigt.
        beweglichkeit: eigene.mobilityMultiplier,
      }),
    });
  }
  return Object.freeze(ergebnis);
}

export default { CLASS_DEFINITIONS, CLASS_ARCHETYPES, combatProfile };
