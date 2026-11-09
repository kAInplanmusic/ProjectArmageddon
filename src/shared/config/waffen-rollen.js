/**
 * Rollen und Wirkpfade aller 150 Waffen (BAL-11, Audit 2026-11-08 W07/W09).
 *
 * ## Zwei Achsen, nicht eine
 *
 * Das Audit hat zwei Fragen getrennt, die vorher in einem Feld `delivery`
 * zusammenfielen:
 *
 *   1. **Rolle** — wie hängt die Waffe an der Figur? `hand`, `ruecken`,
 *      `aufstell`, `beschwoerung`, `symbol`.
 *   2. **Wirkpfad** — was verlässt die Figur, wenn sie die Waffe einsetzt?
 *      `projektil` (echte Flugbahn), `strahl` (Hitscan) oder `selbst`
 *      (Wirkung am Anwender bzw. in der Welt, ohne Flugbahn).
 *
 * Nur zusammen sind sie ehrlich: Ein Raketenrucksack ist `ruecken` + `selbst`;
 * die Mine ist `aufstell` + `selbst`; der Wachgeschütz-Turm ist `aufstell`,
 * sein Bild aber kein Geschoss der Hand. Umgekehrt fliegt der Feuerdämon
 * (`beschwoerung`) wirklich als Projektil.
 *
 * ## Warum das die 96 Geschossbilder richtig stellt
 *
 * Das Manifest trägt für 96 Waffen eine Geschosszelle, weil der Sprite-Generator
 * `delivery === 'projectile'` als Kriterium benutzt. Echte Projektilpfade sind
 * es aber nur 87: Bei neun Waffen mit Geschossbild wirkt die Waffe zuerst auf
 * den Anwender oder stellt etwas auf (`selbst`), das Bild ist Begleitmaterial
 * (Abgas, Portalglanz, Turmschuss, Beschwörungsglühen) und keine Flugbahn.
 * `WIRKPFAAD_JE_WAFFE` trennt beides; das Manifest übernimmt die Trennung in
 * `waffe.wirkpfad` und `waffe.projectile.eigenerPfad`.
 *
 * ## Rollen in Worten
 *
 * - `hand`          wird in der Hand geführt oder geworfen (Schwert, Gewehr,
 *                   Wurfaxt). Bei Wurfwaffen ist das Handbild zugleich das
 *                   Flugbild.
 * - `ruecken`       wird am Körper getragen (Raketenrucksack, Düsenrucksack,
 *                   Gleitschirm); kein Griff, keine Faust.
 * - `aufstell`      wird als Objekt in die Welt gesetzt und wirkt dort weiter
 *                   (Mine, Wachgeschütz, Bunker, Kisten, Statue, Boot, Portale,
 *                   Giftbaum, Tarnnetz).
 * - `beschwoerung`  ruft ein Wesen herbei, das selbst handelt (Astralkrieger,
 *                   Astralross, Feuerdämon, Feuerwesen, Windkrieger).
 * - `symbol`        steht für eine Anwendung am eigenen Träger oder ein Zeichen
 *                   (Elixier, Schriftrolle, Schild-Aura, Sanduhr, Werkzeug wie
 *                   Enterhaken); kein gerichtetes Handgerät.
 *
 * Die Rollen sind Darstellungs- und Anzeigedaten. Der Renderer liest sie über
 * `waffenSicht.js`; die Werte selbst stehen hier EINMAL und werden von
 * `scripts/waffen-rollen-eintragen.mjs` ins Manifest geschrieben.
 *
 * @module config/waffen-rollen
 */

/** Die fünf Rollen mit Anzeigenamen und kurzer Bedeutung. */
export const ROLLEN = Object.freeze({
  hand: Object.freeze({
    label: 'Hand',
    kurz: 'gehalten',
    beschreibung: 'Wird in der Hand geführt oder geworfen; das Handbild ist bei Wurfwaffen zugleich das Flugbild.',
  }),
  ruecken: Object.freeze({
    label: 'Rücken',
    kurz: 'getragen',
    beschreibung: 'Wird am Körper getragen (Rucksack, Düsenantrieb, Gleitschirm), nicht in der Faust.',
  }),
  aufstell: Object.freeze({
    label: 'Aufstellobjekt',
    kurz: 'aufgestellt',
    beschreibung: 'Wird als Objekt in die Welt gesetzt und wirkt dort weiter (Mine, Geschütz, Bunker, Kiste, Statue, Boot, Portal, Baum, Netz).',
  }),
  beschwoerung: Object.freeze({
    label: 'Beschwörung',
    kurz: 'beschworen',
    beschreibung: 'Ruft ein Wesen herbei, das selbst handelt (Astralkrieger, Astralross, Feuerdämon, Feuerwesen, Windkrieger).',
  }),
  symbol: Object.freeze({
    label: 'Symbol',
    kurz: 'Anwendung',
    beschreibung: 'Zeichen oder Anwendungsobjekt am eigenen Träger (Elixier, Schriftrolle, Schild-Aura, Sanduhr, Werkzeug); kein gerichtetes Handgerät.',
  }),
});

/** Die drei Wirkpfade mit Anzeigenamen. */
export const WIRKPFAADE = Object.freeze({
  projektil: Object.freeze({ label: 'Projektil', beschreibung: 'Startet ein Geschoss mit eigener Flugbahn.' }),
  strahl: Object.freeze({ label: 'Strahl', beschreibung: 'Trifft sofort entlang einer Sichtlinie (Hitscan).' }),
  selbst: Object.freeze({ label: 'Selbst/Welt', beschreibung: 'Wirkt am Anwender oder setzt ein Objekt in die Welt; keine Flugbahn.' }),
});

/**
 * Die Tabelle: `id: [Rolle, Wirkpfad]`.
 *
 * Beide Werte gehören zum selben Eintrag, damit sie nicht auseinanderlaufen.
 * Die Reihenfolge folgt dem Katalog und den Kategorien.
 */
const TABELLE = Object.freeze({
  // melee — geführt oder geworfen
  pa_001: ['hand', 'projektil'],
  pa_002: ['hand', 'projektil'],
  pa_003: ['hand', 'projektil'],
  pa_004: ['hand', 'projektil'],
  pa_005: ['hand', 'projektil'],
  pa_006: ['hand', 'projektil'],
  pa_007: ['hand', 'projektil'],
  pa_008: ['hand', 'projektil'],
  pa_009: ['hand', 'projektil'],
  pa_010: ['hand', 'projektil'],
  pa_011: ['hand', 'projektil'],
  pa_012: ['hand', 'projektil'],
  pa_013: ['hand', 'projektil'],
  pa_014: ['hand', 'projektil'],
  pa_015: ['hand', 'projektil'],
  pa_016: ['hand', 'projektil'],
  pa_017: ['hand', 'projektil'],
  pa_018: ['hand', 'projektil'],
  pa_019: ['hand', 'projektil'],
  pa_020: ['hand', 'projektil'],
  pa_021: ['hand', 'projektil'],

  // ranged — Schusswaffen und Würfe; nur der Raketenrucksack liegt am Rücken
  pa_022: ['hand', 'projektil'],
  pa_023: ['hand', 'projektil'],
  pa_024: ['hand', 'projektil'],
  pa_025: ['hand', 'projektil'],
  pa_026: ['hand', 'projektil'],
  pa_027: ['hand', 'projektil'],
  pa_028: ['hand', 'projektil'],
  pa_029: ['hand', 'projektil'],
  pa_030: ['hand', 'projektil'],
  pa_031: ['hand', 'projektil'],
  pa_032: ['ruecken', 'selbst'],
  pa_033: ['hand', 'projektil'],
  pa_034: ['hand', 'projektil'],
  pa_035: ['hand', 'projektil'],
  pa_036: ['hand', 'projektil'],
  pa_037: ['hand', 'projektil'],
  pa_038: ['hand', 'projektil'],
  pa_039: ['hand', 'projektil'],
  pa_040: ['hand', 'projektil'],

  // heavy_ranged — Gewehre, Granaten, Wurfklingen
  pa_041: ['hand', 'projektil'],
  pa_042: ['hand', 'projektil'],
  pa_043: ['hand', 'projektil'],
  pa_044: ['hand', 'projektil'],
  pa_045: ['hand', 'projektil'],
  pa_046: ['hand', 'projektil'],
  pa_047: ['hand', 'projektil'],
  pa_048: ['hand', 'projektil'],
  pa_049: ['hand', 'projektil'],
  pa_050: ['hand', 'projektil'],
  pa_051: ['hand', 'projektil'],
  pa_052: ['hand', 'projektil'],
  pa_053: ['hand', 'projektil'],
  pa_054: ['hand', 'projektil'],
  pa_055: ['hand', 'projektil'],
  pa_056: ['hand', 'projektil'],
  pa_057: ['hand', 'projektil'],
  pa_058: ['hand', 'projektil'],
  pa_059: ['hand', 'projektil'],
  pa_060: ['hand', 'projektil'],

  // elemental — gerichtete Elemente; Portale werden aufgestellt, der Dämon beschworen
  pa_061: ['beschwoerung', 'projektil'],
  pa_062: ['hand', 'projektil'],
  pa_063: ['hand', 'projektil'],
  pa_064: ['hand', 'projektil'],
  pa_065: ['hand', 'projektil'],
  pa_066: ['hand', 'projektil'],
  pa_067: ['hand', 'projektil'],
  pa_068: ['hand', 'projektil'],
  pa_069: ['hand', 'projektil'],
  pa_070: ['hand', 'projektil'],
  pa_071: ['hand', 'projektil'],
  pa_072: ['hand', 'projektil'],
  pa_073: ['hand', 'projektil'],
  pa_074: ['hand', 'projektil'],
  pa_075: ['hand', 'projektil'],
  pa_076: ['aufstell', 'selbst'],
  pa_077: ['hand', 'projektil'],
  pa_078: ['hand', 'projektil'],
  pa_079: ['aufstell', 'selbst'],
  pa_080: ['hand', 'projektil'],

  // magic — Stäbe und Kugeln in der Hand; Elixiere, Rollen, Auren und Sprünge als Symbol
  pa_081: ['hand', 'strahl'],
  pa_082: ['hand', 'projektil'],
  pa_083: ['hand', 'strahl'],
  pa_084: ['symbol', 'selbst'],
  pa_085: ['symbol', 'selbst'],
  pa_086: ['beschwoerung', 'strahl'],
  pa_087: ['symbol', 'selbst'],
  pa_088: ['symbol', 'selbst'],
  pa_089: ['symbol', 'selbst'],
  pa_090: ['hand', 'strahl'],
  pa_091: ['hand', 'strahl'],
  pa_092: ['symbol', 'selbst'],
  pa_093: ['symbol', 'selbst'],
  pa_094: ['symbol', 'selbst'],
  pa_095: ['symbol', 'selbst'],
  pa_096: ['symbol', 'selbst'],
  pa_097: ['hand', 'strahl'],
  pa_098: ['hand', 'strahl'],
  pa_099: ['symbol', 'selbst'],
  pa_100: ['symbol', 'selbst'],
  pa_101: ['symbol', 'selbst'],
  pa_102: ['hand', 'strahl'],
  pa_103: ['hand', 'strahl'],
  pa_104: ['hand', 'projektil'],
  pa_105: ['symbol', 'selbst'],
  pa_106: ['hand', 'strahl'],
  pa_107: ['symbol', 'selbst'],
  pa_108: ['hand', 'strahl'],
  pa_109: ['aufstell', 'selbst'],
  pa_110: ['symbol', 'selbst'],

  // utility — Werkzeuge und Aufstellobjekte
  pa_111: ['symbol', 'selbst'],
  pa_112: ['ruecken', 'selbst'],
  pa_113: ['hand', 'strahl'],
  pa_114: ['ruecken', 'selbst'],
  pa_115: ['aufstell', 'selbst'],
  pa_116: ['symbol', 'selbst'],
  pa_117: ['hand', 'strahl'],
  pa_118: ['beschwoerung', 'strahl'],
  pa_119: ['aufstell', 'selbst'],
  pa_120: ['hand', 'strahl'],

  // tech — Geräte in der Hand; Aufstellobjekte und Werkzeuge getrennt
  pa_121: ['hand', 'strahl'],
  pa_122: ['symbol', 'selbst'],
  pa_123: ['hand', 'strahl'],
  pa_124: ['aufstell', 'selbst'],
  pa_125: ['aufstell', 'selbst'],
  pa_126: ['aufstell', 'selbst'],
  pa_127: ['aufstell', 'selbst'],
  pa_128: ['aufstell', 'selbst'],
  pa_129: ['hand', 'strahl'],
  pa_130: ['aufstell', 'selbst'],
  pa_131: ['aufstell', 'selbst'],
  pa_132: ['hand', 'strahl'],
  pa_133: ['hand', 'projektil'],
  pa_134: ['hand', 'strahl'],
  pa_135: ['hand', 'strahl'],
  pa_136: ['hand', 'strahl'],
  pa_137: ['hand', 'strahl'],
  pa_138: ['hand', 'strahl'],
  pa_139: ['hand', 'strahl'],
  pa_140: ['hand', 'projektil'],

  // ultimate — Signaturen; Krieger und Ross werden beschworen
  pa_141: ['beschwoerung', 'selbst'],
  pa_142: ['hand', 'projektil'],
  pa_143: ['beschwoerung', 'selbst'],
  pa_144: ['hand', 'projektil'],
  pa_145: ['hand', 'projektil'],
  pa_146: ['hand', 'projektil'],
  pa_147: ['hand', 'projektil'],
  pa_148: ['symbol', 'selbst'],
  pa_149: ['symbol', 'selbst'],
  pa_150: ['hand', 'projektil'],
});

/** Waffen-ID → Rolle (`hand`, `ruecken`, `aufstell`, `beschwoerung`, `symbol`). */
export const ROLLE_JE_WAFFE = Object.freeze(
  Object.fromEntries(Object.entries(TABELLE).map(([id, [rolle]]) => [id, rolle])),
);

/** Waffen-ID → Wirkpfad (`projektil`, `strahl`, `selbst`). */
export const WIRKPFAAD_JE_WAFFE = Object.freeze(
  Object.fromEntries(Object.entries(TABELLE).map(([id, [, wirkpfad]]) => [id, wirkpfad])),
);

/**
 * Begründungen für die Fälle, bei denen Rolle und Bild auseinanderfallen.
 *
 * Diese Einträge sind die Abnahme aus BAL-11: Rucksack, Gleitschirm, Statue,
 * Boot, Mine und Beschwörung müssen ohne Rückfrage verständlich sein.
 */
export const SPEZIALFAELLE = Object.freeze({
  pa_032: 'Raketenrucksack: am Rücken getragen; der Raketenstoß versetzt den Träger. Das Bild ist kein abgefeuertes Geschoss.',
  pa_112: 'Düsenrucksack: Rückenantrieb, kein Handgerät.',
  pa_114: 'Gleitschirm: liegt über dem Rücken; wird nicht in der Faust geführt.',
  pa_115: 'Wächterstatue: wird aufgestellt und heilt den Anwender; kein Handgerät.',
  pa_131: 'Schlauchboot: wird als Wasserfahrzeug eingesetzt, nicht gehalten.',
  pa_127: 'Mine: wird abgelegt oder geworfen, bleibt liegen und ist sofort scharf; kein Projektilpfad.',
  pa_141: 'Astralkrieger: beschworener Wächter, feuert in den Folgerunden selbst.',
  pa_143: 'Astralross: beschworenes Reittier, trägt den Anwender.',
  pa_118: 'Feuerwesen: erscheint als Kämpfer und entzündet das Ziel; kein Handbild.',
  pa_061: 'Feuerdämon: beschworenes Wesen; es fliegt selbst als Projektil (Rolle Beschwörung, Wirkpfad Projektil).',
  pa_086: 'Windkrieger: Krieger im Wirbelwind, zieht Gegner heran; kein Handbild.',
  pa_109: 'Giftbaum: wird als Baum in der Welt aufgestellt (Verstärkung), kein Handbild.',
  pa_076: 'Portalring: wird als Tor in der Welt aufgestellt; der Anwender springt hindurch.',
  pa_079: 'Kosmisches Portal: aufgestelltes Tor, kein Handgerät.',
  pa_148: 'Feuerschild: Aura um den Anwender, kein aufgestelltes Objekt und kein Geschoss.',
  pa_105: 'Frostrolle: Schriftrolle (Symbol) für einen zufälligen Schutzzauberspruch; das Zauberbild ist kein abgefeuertes Geschoss.',
  pa_124: 'Wachgeschütz: wird aufgestellt und feuert selbst; das Geschossbild gehört zum Turm, nicht zur Hand.',
  pa_149: 'Goldene Reliktkugel: Relikt wirkt auf den Anwender; kein abgefeuertes Geschoss.',
  pa_119: 'Munitionskiste: wird abgestellt und füllt Munition auf.',
  pa_125: 'Nachschubkiste: Abwurf, wird in der Welt abgesetzt.',
  pa_126: 'Bunker: wird aufgestellt und mindert Schaden.',
  pa_128: 'Hologrammportal: aufgestelltes Tor; der Anwender springt hindurch.',
  pa_130: 'Tarnnetz: wird über die Stellung gelegt und mindert Schaden.',
});

/** @param {string|{id?:string}|null|undefined} waffe */
function idVon(waffe) {
  return typeof waffe === 'string' ? waffe : waffe?.id ?? null;
}

/**
 * Rolle einer Waffe. Unbekannte IDs liefern `null`; der Aufrufer entscheidet
 * über den Rückfall (die Anzeige benutzt dann die bisherige Motorheuristik).
 *
 * @param {string|{id?:string}|null|undefined} waffe
 * @returns {'hand'|'ruecken'|'aufstell'|'beschwoerung'|'symbol'|null}
 */
export function rolleFuer(waffe) {
  return ROLLE_JE_WAFFE[idVon(waffe)] ?? null;
}

/**
 * Wirkpfad einer Waffe.
 *
 * @param {string|{id?:string}|null|undefined} waffe
 * @returns {'projektil'|'strahl'|'selbst'|null}
 */
export function wirkpfadFuer(waffe) {
  return WIRKPFAAD_JE_WAFFE[idVon(waffe)] ?? null;
}

/**
 * Startet die Waffe ein echtes Geschoss mit Flugbahn? Nur dann darf ein
 * Geschossbild als Projektil benutzt werden.
 *
 * @param {string|{id?:string}|null|undefined} waffe
 */
export function hatProjektilpfad(waffe) {
  return wirkpfadFuer(waffe) === 'projektil';
}

/**
 * Anzeigename einer Rolle (deutsch).
 *
 * @param {string|null|undefined} rolle
 */
export function rollenLabel(rolle) {
  return ROLLEN[rolle]?.label ?? '';
}

/**
 * Zählung für Doku, Manifest und Tests. Die Geschossbilder stehen bewusst
 * NICHT hier: Sie gehören zum Manifest, nicht zur Rollentabelle.
 */
export function rollenUebersicht() {
  const rollen = { hand: 0, ruecken: 0, aufstell: 0, beschwoerung: 0, symbol: 0 };
  const wirkpfade = { projektil: 0, strahl: 0, selbst: 0 };
  for (const [id, [rolle, wirkpfad]] of Object.entries(TABELLE)) {
    rollen[rolle] += 1;
    wirkpfade[wirkpfad] += 1;
    void id;
  }
  return { gesamt: Object.keys(TABELLE).length, rollen, wirkpfade };
}
