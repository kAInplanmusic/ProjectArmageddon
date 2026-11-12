/**
 * Prozedurale Waffen-Animation (nur Darstellung, ohne Canvas).
 *
 * Die Waffen sind Standbilder (siehe `waffenSprites.js`). Alles, was sich
 * bewegt, entsteht hier aus Parametern: Eine Tabelle je Katalogkategorie, dazu
 * eine kleine Korrekturtabelle je Waffen-ID. `waffenPose` ist eine reine
 * Funktion von Zeiten in Sekunden (Idle, seit dem Ziehen, seit dem Schuss) und
 * damit von der Bildrate unabhängig und deterministisch. Sie schreibt in ein
 * vom Aufrufer gehaltenes Objekt: keine Allokation je Bild.
 *
 * Koordinaten der Pose (Waffenrahmen: +x = Zielrichtung, die Waffe ist nie
 * verkehrt, die Spiegelung bei Blick nach links steckt in der Zeichnung):
 *   - `vor`      Verschiebung entlang der Zielrichtung in Weltpixeln (negativ = zurück)
 *   - `hoch`     Verschiebung quer dazu, positiv zur Oberseite der Waffe
 *   - `drehung`  Zusatzdrehung um den Griff im Bogenmaß, positiv = Spitze hebt sich
 *   - `skala`    Streckung um den Griff (1 = unverändert)
 *   - `glanz`    Aufladeglanz 0..1 in `flashColor` (Magie, Tech, Selbstwirkung)
 *   - `blitz`    Mündungsblitz/Wirkungsglanz 0..1 (Form: `blitzForm`)
 *   - `weiss`    weiße Silhouette über der Waffe 0..1 (Aufnehmen, Treffer)
 *   - `dunkel`   Abdunkelung durch Nachladezeit 0..1
 *   - `ladung`   Nachladegrad 0..1 (1 = bereit, dann kein Füllband)
 *
 * `prefers-reduced-motion` entfernt die BEWEGUNG (vor/hoch/drehung/skala,
 * Pendeln, Einschwingen), nicht die Aussage: Blitz, Glanz, Abdunkelung und
 * Füllband bleiben, damit der Schuss lesbar bleibt.
 *
 * @module waffenAnimation
 */

import { TYP_JE_CHARAKTER, PARAMETER as TYP_PARAMETER } from './figurTypen.js';
import { glatt01 } from './mathe.js';
import { bereitPuls } from './waffenZustandsOptik.js';
import { buildEffect, SELF_TARGET_KINDS } from '../engine/specials.js';
import { charakterDerWaffe } from '../shared/config/zerstoerung.js';

/** Die acht Katalogkategorien (`src/shared/config/weapons.js`). */
export { KATEGORIEN } from '../shared/config/waffenKategorien.js';

/** Höhe der Hand über den Füßen als Anteil der Sprite-Höhe (Hand bei 17,25 px über den Füßen, Sprite 52 px). */
const HAND_ANTEIL = 17.25 / 52;

/** Kantenlänge einer Zelle im Atlas (Quellpixel), auf die sich Anker und `zelle` beziehen. */
export const ZELLE = 128;

/*
 * Standardwerte. Jede Kategorie überschreibt nur, was sich unterscheidet; der
 * Rest ist hier festgelegt. Einheiten: Weltpixel, Radiant, Sekunden.
 *
 *   zelle        Weltpixel, die eine 128er-Zelle breit gezeichnet wird (Waffengröße)
 *   handVor      Handposition vor der Körpermitte in Blickrichtung
 *   handHoch     Handposition über (negativ: unter) der Standardhöhe
 *   idleDreh     Pendeln der Waffe im Stand (Amplitude), idleAtem Heben/Senken in px, idleTempo in Hz
 *   ziehenDauer  Einschwingen von unten beim Ziehen/Wechseln; ziehenTief Startversatz, ziehenDreh Startdrehung
 *   art          Schussbewegung: kurz | schwer | hieb | zauber | tech | selbst; Nahkampf: stoss | schnitt | schlag | saege | zug (N-10)
 *   schussDauer  Gesamtdauer der Bewegung; kick Rückstoßweg; rueck Rückdrehung; wippen/wippHz Nachwippen
 *   heben        Heben der Spitze (Zauber, Selbstwirkung); aufladen Dauer des Aufladens vor dem Schuss
 *   blitzForm    kegel | stern | ring | funke | bogen | stoss | keiner; blitzGroesse in px, blitzDauer in s; treffAb Verzögerung des Blitzes in s
 *   koerper      Faktor auf den Rückstoß des Oberkörpers (`figurAnimation.js`), ausfall 0..1 Ausfallschritt
 *                (Figur geht beim Schuss in die Knie und verbreitert den Stand: schwere Waffen)
 *   start        Startglanz des Geschosses an der Mündung in px (Geschoss-Zeichnung)
 */
const BASIS = Object.freeze({
  zelle: 28,
  handVor: 3,
  handHoch: 0,
  idleDreh: 0.03,
  idleAtem: 0.4,
  idleTempo: 0.45,
  ziehenDauer: 0.25,
  ziehenTief: 11,
  ziehenDreh: 1.0,
  art: 'kurz',
  schussDauer: 0.34,
  kick: 3,
  rueck: 0.2,
  wippen: 0.04,
  wippHz: 11,
  heben: 0,
  aufladen: 0,
  blitzForm: 'kegel',
  blitzGroesse: 11,
  blitzDauer: 0.11,
  treffAb: 0,
  lage: 'vor',
  orb: false,
  koerper: 1,
  ausfall: 0,
  start: 10,
});

function kategorie(werte) {
  return Object.freeze({ ...BASIS, ...werte });
}

/**
 * Parametersatz je Kategorie.
 *
 * - melee: Schwungbogen mit kurzem Ausholen und Hieb, kein Blitz
 * - ranged: Gewehr, kurzer scharfer Rückstoß mit kleinem Nachwippen
 * - heavy_ranged: lange Waffe, tiefer Rückstoß, Nachschwingen, großer Kegel
 * - elemental: Wurf-/Elementarwaffen, mittlerer Stoß, Sternblitz
 * - magic: Heben der Spitze, Aufladeglanz, Ringblitz
 * - tech: kurzes Aufladen mit Zittern, dann Funkenblitz
 * - utility: Selbstwirkung (Heben und Puls) bzw. kleiner Funke
 * - ultimate: große Waffe, langes Aufladen, großer Stern
 */
export const PARAMETER = Object.freeze({
  melee: kategorie({
    zelle: 30, handVor: 2, handHoch: -1, art: 'hieb', schussDauer: 0.6, kick: 7,
    ziehenDreh: 1.2, blitzForm: 'keiner', blitzGroesse: 0, blitzDauer: 0, koerper: 1.6, ausfall: 0.3, start: 0,
  }),
  ranged: kategorie({
    zelle: 28, art: 'kurz', schussDauer: 0.26, kick: 4.6, rueck: 0.3, wippen: 0.05, wippHz: 13,
    blitzForm: 'kegel', blitzGroesse: 14, blitzDauer: 0.09, koerper: 1, ausfall: 0, start: 10,
  }),
  heavy_ranged: kategorie({
    zelle: 34, handVor: 1.5, handHoch: 1.5, idleDreh: 0.018, idleAtem: 0.3, ziehenDauer: 0.3,
    art: 'schwer', schussDauer: 0.8, kick: 10, rueck: 0.45, wippen: 0.09, wippHz: 5.5,
    blitzForm: 'kegel', blitzGroesse: 26, blitzDauer: 0.18, koerper: 2.4, ausfall: 1, start: 18,
  }),
  elemental: kategorie({
    zelle: 27, art: 'kurz', schussDauer: 0.5, kick: 3, rueck: 0.2, wippen: 0.05, wippHz: 9,
    blitzForm: 'stern', blitzGroesse: 15, blitzDauer: 0.13, koerper: 0.8, ausfall: 0.3, start: 13,
  }),
  magic: kategorie({
    zelle: 27, idleDreh: 0.045, idleAtem: 0.7, idleTempo: 0.35, art: 'zauber', schussDauer: 0.85,
    kick: 1.6, rueck: 0.1, heben: 0.55, aufladen: 0.26,
    blitzForm: 'ring', blitzGroesse: 17, blitzDauer: 0.28, koerper: 0.5, ausfall: 0, start: 14,
  }),
  tech: kategorie({
    zelle: 26, art: 'tech', schussDauer: 0.34, kick: 1.8, rueck: 0.12, wippen: 0.02, wippHz: 20,
    aufladen: 0.14, blitzForm: 'funke', blitzGroesse: 15, blitzDauer: 0.1, koerper: 0.6, ausfall: 0, start: 11,
  }),
  utility: kategorie({
    zelle: 24, idleDreh: 0.025, art: 'selbst', schussDauer: 0.5, kick: 0, heben: 0.45, aufladen: 0.2,
    blitzForm: 'funke', blitzGroesse: 8, blitzDauer: 0.1, koerper: 0.3, ausfall: 0, start: 9,
  }),
  ultimate: kategorie({
    zelle: 32, handVor: 2, handHoch: 1, idleDreh: 0.02, idleAtem: 0.6, idleTempo: 0.3,
    ziehenDauer: 0.32, art: 'zauber', schussDauer: 1.15, kick: 8, rueck: 0.22, heben: 0.6,
    aufladen: 0.4, blitzForm: 'stern', blitzGroesse: 30, blitzDauer: 0.34, koerper: 2, ausfall: 0.8, start: 24,
  }),
});

/**
 * Korrekturen je Waffen-ID: überschreiben einzelne Felder der Kategorie
 * (`zelle`, `handVor`, `handHoch`, `art`, `kick`, `blitzForm` ...). Ergänzt wird
 * nach der Sichtprüfung der Prüfbögen (`docs`: „Waffen-Animation").
 */
export const KORREKTUREN = Object.freeze({
  // Bumerang, Doppelkopfaxt, Wurfklingen: lange Wurfwaffen, kleiner als die Schwerwaffen-Zelle.
  pa_049: { zelle: 27 },
  pa_050: { zelle: 29, handVor: 2.5 },
  pa_051: { zelle: 28 },
  // Feldmörser: schwere Waffe, langer Rückstoß mit Nachschwingen.
  // Rucksack, Gleitschirm und Düsenrucksack werden auf dem Rücken getragen: hinter dem Körper, weiter hinten.
  pa_032: { lage: 'hinter', handVor: -5 },
  pa_112: { lage: 'hinter', handVor: -5, handHoch: 1, blitzForm: 'kegel', blitzGroesse: 14, blitzDauer: 0.2 },
  pa_114: { lage: 'hinter', handVor: -5, handHoch: 2, blitzForm: 'ring', blitzGroesse: 26, blitzDauer: 0.5 },
  // Waffenfassung 10: gestaffelte Dubletten bekommen unterscheidbare Posen (Aufladen, Glanzform, Größe, Takt).
  // Verstärkungen: Glut kräftig und kurz, Sturm unruhig, Frost langsam mit großem Ring, Gift ruhig atmend.
  pa_084: { heben: 0.7, aufladen: 0.35, blitzForm: 'stern', blitzGroesse: 20 },
  pa_095: { idleTempo: 0.6, blitzForm: 'funke', blitzGroesse: 17 },
  pa_099: { idleTempo: 0.2, aufladen: 0.3, blitzForm: 'ring', blitzGroesse: 20, blitzDauer: 0.4 },
  pa_109: { idleAtem: 1, blitzForm: 'ring', blitzGroesse: 13, blitzDauer: 0.36 },
  // Zufallswaffen: je Element eine eigene Glanzform.
  pa_085: { blitzForm: 'stern', blitzGroesse: 18 },
  pa_105: { blitzForm: 'ring', blitzGroesse: 16 },
  pa_100: { idleTempo: 0.7, blitzForm: 'funke', blitzGroesse: 18, blitzDauer: 0.08 },
  pa_096: { idleAtem: 1, blitzForm: 'ring', blitzGroesse: 14 },
  // Schilde: Eis mit langem Ring, Funken kurz und scharf.
  pa_101: { heben: 0.35, aufladen: 0.35, blitzForm: 'ring', blitzGroesse: 22, blitzDauer: 0.45 },
  pa_093: { blitzForm: 'funke', blitzGroesse: 20, blitzDauer: 0.12 },
  // Waffenfassung 11: der dritte Schild (Feuer) ist groß und warm, ein Flammenstern.
  pa_148: { heben: 0.55, aufladen: 0.45, blitzForm: 'stern', blitzGroesse: 28, blitzDauer: 0.4 },
  // Versetzer: je weiter der Sprung, desto größer und länger der Glanz.
  pa_089: { schussDauer: 0.4, heben: 0.3, blitzForm: 'stern', blitzGroesse: 14 },
  pa_087: { blitzForm: 'funke', blitzGroesse: 22, blitzDauer: 0.1 },
  pa_110: { blitzForm: 'ring', blitzGroesse: 16, blitzDauer: 0.22 },
  pa_088: { aufladen: 0.35, blitzForm: 'funke', blitzGroesse: 30, blitzDauer: 0.3 },
  // Waffenfassung 11: Elemente der Versetzer und Flieger (Feuer Kegel und Stern, Eis Ring, Blitz Funke); Enterhaken: kurzer Schock beim Einschlag.
  pa_111: { blitzForm: 'funke', blitzGroesse: 12, blitzDauer: 0.1 },
  // Heilung: Zauber mit Ring, Spritze kurz.
  pa_092: { heben: 0.5, blitzForm: 'ring', blitzGroesse: 15, blitzDauer: 0.3 },
  pa_094: { schussDauer: 0.3, kick: 1, blitzForm: 'funke', blitzGroesse: 10 },
  pa_039: { zelle: 32, art: 'schwer', schussDauer: 0.7, kick: 7, rueck: 0.32, wippen: 0.07, wippHz: 6, blitzForm: 'kegel', blitzGroesse: 18, blitzDauer: 0.15 },
});

/** Parametersatz für die Selbstwirkung: Heben und Puls, kein Blitz (Waffe ohne Schaden und ohne Geschoss). */
const SELBST = Object.freeze({
  art: 'selbst', schussDauer: 0.5, kick: 0, heben: 0.45, aufladen: 0.2, blitzForm: 'keiner',
});

/**
 * Kachel-Waffen (Zauber-/Gerätekarten, `form: 'kachel'` im Manifest). Je Waffe entscheidet
 * `kachel.modus` im Manifest: `motiv` (das Motiv ist aus dem Rahmen herausgelöst und wird wie ein
 * kompaktes Sprite gehalten) oder `orb` (Zauber-Darstellung, siehe `KACHEL_ORB`).
 */
const KACHEL_MOTIV = basis => ({ zelle: basis.zelle * 0.9, handVor: basis.handVor + 3, handHoch: basis.handHoch + 0.5 });
/** Kachel als Zauber-Darstellung: schwebender Orb (Glühen, Partikelring) mit dem Kachelbild als Mini-Icon über der Hand. */
const KACHEL_ORB = basis => ({ zelle: basis.zelle * 0.8, handVor: basis.handVor + 1, handHoch: basis.handHoch, orb: true });

/** Kompakte Sprites (Wesen, Geräte, Granaten) haben ihren Griff im Schwerpunkt und werden etwas vor dem Körper gehalten. */
const KOMPAKT = basis => ({ handVor: basis.handVor + 3 });

/** Geworfene Waffen (das Geschoss ist die Waffe selbst oder eine Granate): Wurfbewegung, kein Mündungsblitz. */
const WURF = Object.freeze({
  art: 'hieb', schussDauer: 0.45, kick: 4, blitzForm: 'keiner', blitzGroesse: 0, blitzDauer: 0,
});

/*
 * N-10: eigene Schussbewegung je Nahkampf-Familie. Die 21 Nahkampfwaffen werden GEWORFEN (Geschoss `ding`,
 * dreht sich, fliegt 110-250 px), das Geschoss startet also mit dem ersten Bild der Pose (`seitSchuss` = 0).
 * Deshalb gibt es kein langes Ausholen: Die Geste beginnt im Abwurf (Ausholen höchstens 40-50 ms) und besteht
 * aus Durchziehen, Halten und Zurückkommen; sonst würde die Hand ausholen, nachdem die Klinge schon fliegt.
 *   stoss   Stich: kurzes Zurückzucken, Vorstoß in Zielrichtung, Spitze bleibt gerade (Rapier, Messer, Tonfa, Faust)
 *   schnitt Schnitt: schneller Bogen von oben nach unten durch die Zielachse, Schnittbogen als Blitz (Katana, Säbel, Sense)
 *   schlag  Schlag: Spitze hoch, harter Abschlag mit Halten und Nachzittern, Aufprallstern (Hammer, Axt, Morgenstern)
 *   saege   Säge: Dauerzittern der Waffe, Funke am Anfang (Kettensäge)
 *   zug     Zug: Wurf nach vorn, dann Rückzug über die Ruhelage hinaus (Haken)
 * `treffAb` verschiebt den Blitz auf den Augenblick des Durchziehens.
 */
export const NAHKAMPF_ARTEN = Object.freeze({
  stoss: Object.freeze({ art: 'stoss', schussDauer: 0.42, kick: 8, treffAb: 0.07, blitzForm: 'stoss', blitzGroesse: 15, blitzDauer: 0.12, koerper: 1.2, ausfall: 0.6 }),
  schnitt: Object.freeze({ art: 'schnitt', schussDauer: 0.5, kick: 3, treffAb: 0.05, blitzForm: 'bogen', blitzGroesse: 20, blitzDauer: 0.16, koerper: 1.4, ausfall: 0.3 }),
  schlag: Object.freeze({ art: 'schlag', schussDauer: 0.75, kick: 6, treffAb: 0.13, blitzForm: 'stern', blitzGroesse: 13, blitzDauer: 0.14, koerper: 1.9, ausfall: 0.5 }),
  saege: Object.freeze({ art: 'saege', schussDauer: 0.6, kick: 5, treffAb: 0, blitzForm: 'funke', blitzGroesse: 12, blitzDauer: 0.1, koerper: 1.3, ausfall: 0.2 }),
  zug: Object.freeze({ art: 'zug', schussDauer: 0.55, kick: 7, treffAb: 0.12, blitzForm: 'keiner', blitzGroesse: 0, blitzDauer: 0, koerper: 1.3, ausfall: 0.4 }),
});

/** Familie je Nahkampfwaffe (Katalog `melee`, 21 Waffen). Nicht aufgeführte Nahkampfwaffen behalten `hieb`. */
export const NAHKAMPF_JE_WAFFE = Object.freeze({
  pa_001: 'schlag', pa_002: 'stoss', pa_003: 'zug', pa_004: 'zug', pa_005: 'schlag', pa_006: 'schlag', pa_007: 'stoss',
  pa_008: 'schlag', pa_009: 'schlag', pa_010: 'saege', pa_011: 'schnitt', pa_012: 'schnitt', pa_013: 'stoss', pa_014: 'stoss',
  pa_015: 'schnitt', pa_016: 'stoss', pa_017: 'stoss', pa_018: 'schnitt', pa_019: 'schlag', pa_020: 'schnitt', pa_021: 'schnitt',
});

/**
 * GP-8: Je Waffe eine eigene, aus dem Katalog abgeleitete Feinabstimmung statt eines Satzes je Kategorie
 * (vorher teilten sich 122 der 150 Waffen ihren Parametersatz mit mindestens einer anderen).
 *   - Rückstoß `kick` wächst mit dem Katalogwert `knockback` (bis +35 %; ohne Rückstoßwert unverändert),
 *   - Blitzgröße wächst mit dem Sprengradius `blastRadius` (bis +30 %, nur wo es einen Blitz gibt),
 *   - Takt des Pendelns im Stand und Dauer des Ziehens weichen je Waffe um höchstens ±8 % bzw. ±6 % ab
 *     (fester Hash der Waffen-ID, KEIN Zufall: gleiche ID, gleiche Zahl), damit zwei Waffen derselben
 *     Familie im Stand nicht im Gleichschritt atmen.
 * Ausdrückliche Einträge in `KORREKTUREN` gelten danach unverändert.
 */
export function waffenFeinabstimmung(waffeId, werte, par) {
  const knock = Number(werte?.knockback) || 0;
  const blast = Number(werte?.blastRadius) || 0;
  let h = 2166136261;
  for (let i = 0; i < waffeId.length; i += 1) h = Math.imul(h ^ waffeId.charCodeAt(i), 16777619);
  const u = (h >>> 0) / 4294967296;
  const v = ((Math.imul(h, 2654435761) >>> 0) / 4294967296);
  return {
    kick: par.kick * (1 + Math.min(0.35, Math.max(0, knock) / 250)),
    blitzGroesse: par.blitzGroesse * (1 + Math.min(0.3, Math.max(0, blast) / 300)),
    idleTempo: par.idleTempo * (1 + (u - 0.5) * 0.16),
    ziehenDauer: par.ziehenDauer * (1 + (v - 0.5) * 0.12),
  };
}

const parameterCache = new Map();

/**
 * Der Parametersatz einer Waffe: Kategorie, Korrektur, bei Selbstwirkung ohne Blitz.
 * Das Ergebnis ist eingefroren und wird je Waffe einmal gebaut.
 *
 * @param {string} kat - Katalogkategorie
 * @param {string} [waffeId]
 * @param {boolean} [selbst] - wirkt auf den Anwender (`SELF_TARGET_KINDS`, nicht `damage === 0`)
 * @param {string} [form] - Form des Sprites laut Manifest (`kachel`, `objekt`, `kompakt`)
 * @param {boolean} [wurf] - die Waffe wird geworfen (Geschoss `ding` oder mit Zünder/Abprallern)
 * @param {string} [kachelModus] - `motiv` oder `orb` bei Kachel-Waffen
 * @param {{knockback?:number, blastRadius?:number}|null} [werte] - Katalogwerte für die Feinabstimmung (GP-8)
 */
export function waffenParameter(kat, waffeId = '', selbst = false, form = '', wurf = false, kachelModus = '', werte = null) {
  const schluessel = `${kat}|${waffeId}|${selbst ? 1 : 0}|${form}|${wurf ? 1 : 0}|${kachelModus}|${werte ? `${werte.knockback ?? 0}/${werte.blastRadius ?? 0}` : ''}`;
  let p = parameterCache.get(schluessel);
  if (!p) {
    const basis = PARAMETER[kat] ?? PARAMETER.ranged;
    const korr = KORREKTUREN[waffeId] ?? null;
    const gebaut = {
      ...basis, ...(wurf && !selbst ? WURF : null), ...(selbst ? SELBST : null),
      ...(!selbst ? NAHKAMPF_ARTEN[NAHKAMPF_JE_WAFFE[waffeId]] : null),
      ...(form === 'kompakt' ? KOMPAKT(basis) : null),
      ...(form === 'kachel' ? (kachelModus === 'motiv' ? KACHEL_MOTIV(basis) : KACHEL_ORB(basis)) : null),
    };
    p = { ...gebaut, ...(waffeId ? waffenFeinabstimmung(waffeId, werte, gebaut) : null), ...korr };
    /*
     * Kein Kategorien-Versatz mehr: Die Hand sitzt auf dem Griffanker des Sprites.
     * Früher rückte `griffObjekt` den Griff je Kategorie um 8–16 Zellpixel nach
     * hinten; damit lag die Hand neben dem Heft, obwohl der Anker stimmte (BAL-08).
     * Eine bewusste Ausnahme je Waffe bleibt über `KORREKTUREN[id].griff` möglich.
     */
    p.griff = korr?.griff ?? 0;
    Object.freeze(p);
    parameterCache.set(schluessel, p);
  }
  return p;
}

/**
 * Wirkt die Waffe auf den Anwender? Dieselbe Quelle wie der Motor
 * (`buildEffect` + `SELF_TARGET_KINDS`), nicht `damage === 0`.
 *
 * 23 Selbstwirkungen tragen im Katalog einen positiven Schadenswert; mit der
 * alten Nullprüfung bekamen sie die Schusspose einer Angriffswaffe (W14).
 *
 * @param {object|null|undefined} waffe
 * @returns {boolean}
 */
export function istSelbstwirkung(waffe) {
  const effekt = buildEffect(waffe);
  return Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
}

/**
 * Der Parametersatz für eine Katalogwaffe samt ihrem Sprite-Eintrag: Selbstwirkung
 * (nach `buildEffect`, nicht nach `damage`), Form des Sprites und Wurfwaffe
 * (Geschoss `ding` oder Zünder) fließen ein. Bewusste Posenkorrekturen aus
 * `KORREKTUREN` bleiben die letzte Schicht und gelten unverändert.
 *
 * @param {{id:string, category:string, damage?:number, special?:string, fuseTime?:number}} waffe
 * @param {{form?:string, projektilInfo?:{art?:string}|null}|null} sp
 */
export function parameterFuerWaffe(waffe, sp) {
  return waffenParameter(
    waffe.category, waffe.id, istSelbstwirkung(waffe), sp?.form ?? '',
    sp?.projektilInfo?.art === 'ding' || (waffe.fuseTime ?? 0) > 0, sp?.kachel ?? '',
    { knockback: waffe.knockback ?? 0, blastRadius: waffe.blastRadius ?? 0 },
  );
}

/** Eine frische, wiederverwendbare Pose in Ruhe. */
export function neuePose() {
  return {
    vor: 0, hoch: 0, drehung: 0, skala: 1, glanz: 0, blitz: 0, weiss: 0, dunkel: 0, ladung: 1,
    blitzForm: 'keiner', blitzGroesse: 0,
  };
}

/** Die Zeiten, aus denen eine Pose entsteht (vom Aufrufer wiederverwendet). */
export function neueZeiten() {
  return { idle: 0, seitZiehen: Infinity, seitSchuss: Infinity, bereit: 1, treffer: 0, bereitSeit: Infinity };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Abklingfenster: 1 bei u=0, genau 0 ab u>=1. */
const fenster = u => (u >= 1 ? 0 : u <= 0 ? 1 : (1 - u) * (1 - u));

/** Auslaufen mit Überschwingen: 0 bei u=0, exakt 1 bei u>=1. */
function einschwingen(u) {
  if (u >= 1) return 1;
  if (u <= 0) return 0;
  const c1 = 1.2;
  const c3 = c1 + 1;
  const v = u - 1;
  return 1 + c3 * v * v * v + c1 * v * v;
}

// ----------------------------------------------------------------- Figurtypen und Handpunkt

// ----------------------------------------------------------------- Figurtypen und Handpunkt

/*
 * Wie eine Figur die Waffe trägt, steht in der Typ-Tabelle `figurTypen.js` (`PARAMETER[typ].hand*`,
 * Zuordnung je Charakter `TYP_JE_CHARAKTER`): Humanoide und Schweber greifen mit der Hand; Tiere,
 * Fahrzeuge, Wesen und Schwärme tragen die Waffe als Aufbau (Rücken, Turm, über dem Körper).
 */
export const FIGURTYP_STANDARD = 'humanoid';

/**
 * Feinkorrekturen je Charakter-ID über den Figurtyp hinaus (`handAnteil`, `vor`, `skala`).
 * Sichtprüfung: `node scripts/waffen-pruefbogen.mjs --fraktionen`.
 */
export const FIGUR_OFFSETS = Object.freeze({
  'storm-talon': { handAnteil: 0.5 },
  'hydra-titan-mech': { handAnteil: 0.42, vor: 3 },
  'heavy-battery-moerser-bot': { handAnteil: 0.4, vor: 0 },
  'rauch-meister-genzi': { handAnteil: 0.36 },
  'ordnance-rail-viper': { handAnteil: 0.32, vor: 2 },
  'cosmic-meditate': { handAnteil: 0.42 },
});

const figurCache = new Map();
const HUMANOID_HAND = Object.freeze({ typ: 'humanoid', handAnteil: HAND_ANTEIL, vor: 0, aufbau: false, skala: 1 });

/**
 * Handparameter einer Figur: Typ-Tabelle (mit Standard Humanoid) plus Feinkorrektur je Charakter-ID.
 *
 * @param {string} [charId] - Charakter-ID; `undefined` (klassische Figur) liefert den Humanoiden
 * @returns {{typ:string, handAnteil:number, vor:number, aufbau:boolean, skala:number}}
 */
export function figurHand(charId) {
  const schluessel = charId ?? '';
  let f = figurCache.get(schluessel);
  if (!f) {
    const typ = TYP_JE_CHARAKTER[schluessel] ?? FIGURTYP_STANDARD;
    const t = TYP_PARAMETER[typ];
    f = Object.freeze({
      typ, handAnteil: t.handAnteil, vor: t.handVor - t.handZurueck, aufbau: t.handAufbau === 1, skala: t.handSkala,
      ...FIGUR_OFFSETS[schluessel],
    });
    figurCache.set(schluessel, f);
  }
  return f;
}

/**
 * Griffpunkt (Hand) der Waffe im Figurrahmen (Ursprung = Figurmitte, Weltpixel).
 *
 * @param {object} par - Parametersatz der Waffe (`handVor`, `handHoch`)
 * @param {number} blick - Kosinus des Zielwinkels (Vorzeichen = Blickrichtung)
 * @param {number} spriteHoehe
 * @param {number} fussAbstand
 * @param {{x:number,y:number}} [aus]
 * @param {{handAnteil:number, vor:number}} [figur] - aus `figurHand`; ohne Angabe der Humanoide
 */
export function handPunkt(par, blick, spriteHoehe, fussAbstand, aus = { x: 0, y: 0 }, figur = HUMANOID_HAND) {
  aus.x = (blick >= 0 ? 1 : -1) * (par.handVor + figur.vor);
  aus.y = fussAbstand - figur.handAnteil * spriteHoehe - par.handHoch;
  return aus;
}

function schussBewegung(par, t, aus) {
  const u = t / par.schussDauer;
  switch (par.art) {
    case 'kurz': {
      const e = fenster(u) * fenster(u);
      aus.vor -= par.kick * e;
      aus.drehung += par.rueck * e;
      aus.drehung += Math.sin(t * par.wippHz * 2 * Math.PI) * par.wippen * fenster(u);
      break;
    }
    case 'schwer': {
      // Anlauf über 40 ms (die schwere Waffe braucht einen Moment), langes Ausklingen, Nachschwingen.
      const e = Math.pow(fenster(u), 1.5) * glatt01(t / 0.04);
      aus.vor -= par.kick * e;
      aus.drehung += par.rueck * e;
      aus.drehung += Math.sin(t * par.wippHz * 2 * Math.PI) * par.wippen * fenster(u);
      break;
    }
    case 'hieb': {
      // Ausholen (Spitze hoch), Hieb in einem Bogen nach unten, Rückschwung in die Ruhe.
      if (t < 0.06) {
        const w = glatt01(t / 0.06);
        aus.drehung += 0.45 * w;
        aus.vor -= 1.2 * w;
      } else if (t < 0.22) {
        const v = (t - 0.06) / 0.16;
        const g = glatt01(v);
        aus.drehung += 0.45 - 1.95 * g;
        aus.vor += -1.2 + (par.kick + 1.2) * Math.sin(Math.PI * Math.min(1, v * 1.15) * 0.5) * (1 - 0.3 * v);
        aus.hoch += Math.sin(Math.PI * v) * 1.2;
      } else {
        const v = (t - 0.22) / (par.schussDauer - 0.22);
        const g = 1 - glatt01(v);
        aus.drehung += -1.5 * g;
        aus.vor += (-1.2 + (par.kick + 1.2) * 0.7) * g * g;
      }
      break;
    }
    case 'stoss': {
      // Kurzes Zurückzucken (40 ms), Vorstoß (60 ms), Halten, Zurückkommen. Spitze bleibt in der Zielachse.
      if (t < 0.04) {
        aus.vor -= 1.5 * glatt01(t / 0.04);
      } else if (t < 0.1) {
        aus.vor += -1.5 + (1.5 + par.kick) * glatt01((t - 0.04) / 0.06);
      } else if (t < 0.2) {
        aus.vor += par.kick * (1 - 0.12 * ((t - 0.1) / 0.1));
      } else {
        const g = 1 - glatt01((t - 0.2) / (par.schussDauer - 0.2));
        aus.vor += par.kick * 0.88 * g * g;
      }
      aus.skala += 0.06 * Math.sin(Math.PI * clamp01(u));
      break;
    }
    case 'schnitt': {
      // Bogen von oben nach unten durch die Zielachse, dann zurück in die Ruhe.
      if (t < 0.04) {
        const w = glatt01(t / 0.04);
        aus.drehung += 0.5 * w;
        aus.hoch += 0.8 * w;
      } else if (t < 0.2) {
        const v = (t - 0.04) / 0.16;
        aus.drehung += 0.5 - 1.9 * glatt01(v);
        aus.hoch += 0.8 * (1 - glatt01(v));
        aus.vor += par.kick * Math.sin(Math.PI * v);
      } else {
        aus.drehung += -1.4 * (1 - glatt01((t - 0.2) / (par.schussDauer - 0.2)));
      }
      break;
    }
    case 'schlag': {
      // Spitze hoch, harter Abschlag in 90 ms, Halten mit Nachzittern, langsames Zurückkommen.
      if (t < 0.05) {
        const w = glatt01(t / 0.05);
        aus.drehung += 0.7 * w;
        aus.hoch += 1.8 * w;
      } else if (t < 0.14) {
        const g = glatt01((t - 0.05) / 0.09);
        aus.drehung += 0.7 - 2.0 * g;
        aus.hoch += 1.8 - 3.0 * g;
        aus.vor += par.kick * g;
      } else if (t < 0.3) {
        const rest = 1 - (t - 0.14) / 0.16;
        aus.drehung += -1.3 + Math.sin((t - 0.14) * 80) * 0.07 * rest;
        aus.hoch += -1.2;
        aus.vor += par.kick;
      } else {
        const g = 1 - glatt01((t - 0.3) / (par.schussDauer - 0.3));
        aus.drehung += -1.3 * g;
        aus.hoch += -1.2 * g;
        aus.vor += par.kick * g;
      }
      break;
    }
    case 'saege': {
      // Dauerzittern: Hüllkurve geht an und aus, die Waffe schüttelt sich quer und längs.
      const e = Math.pow(Math.sin(Math.PI * clamp01(u)), 0.6);
      aus.vor += par.kick * 0.5 * e + Math.sin(t * 120) * 0.9 * e;
      aus.hoch += Math.sin(t * 97 + 1) * 0.8 * e;
      aus.drehung += Math.sin(t * 83) * 0.05 * e;
      break;
    }
    case 'zug': {
      // Wurf nach vorn, dann Rückzug über die Ruhelage hinaus (der Haken zieht).
      if (t < 0.05) {
        const w = glatt01(t / 0.05);
        aus.vor -= 1.2 * w;
        aus.drehung += 0.3 * w;
      } else if (t < 0.14) {
        const g = glatt01((t - 0.05) / 0.09);
        aus.vor += -1.2 + (1.2 + par.kick) * g;
        aus.drehung += 0.3 - 0.8 * g;
      } else {
        const v = (t - 0.14) / (par.schussDauer - 0.14);
        const g = 1 - glatt01(v);
        aus.vor += par.kick * g - 2 * Math.sin(Math.PI * v);
        aus.drehung += -0.5 * g;
      }
      break;
    }
    case 'zauber': {
      // Heben und Aufladen, dann Freigabe mit Stoß nach vorn.
      if (t < par.aufladen) {
        const w = glatt01(t / par.aufladen);
        aus.drehung += par.heben * w;
        aus.hoch += 2.2 * w;
        aus.skala += 0.04 * w;
      } else {
        const v = (t - par.aufladen) / (par.schussDauer - par.aufladen);
        const e = fenster(v);
        aus.drehung += par.heben * e - par.rueck * Math.sin(Math.PI * Math.min(1, v * 3)) * (1 - v);
        aus.hoch += 2.2 * e;
        aus.vor += par.kick * Math.pow(1 - v, 3) * glatt01(v * 6);
        aus.skala += 0.04 * e;
      }
      break;
    }
    case 'tech': {
      // Aufladen mit feinem Zittern, dann kurzer scharfer Stoß.
      if (t < par.aufladen) {
        const w = glatt01(t / par.aufladen);
        aus.hoch += Math.sin(t * 150) * 0.35 * w;
        aus.skala += 0.03 * w;
      } else {
        const v = (t - par.aufladen) / (par.schussDauer - par.aufladen);
        const e = fenster(v) * fenster(v) * glatt01((t - par.aufladen) / 0.02);
        aus.vor -= par.kick * e;
        aus.drehung += par.rueck * e;
        aus.drehung += Math.sin((t - par.aufladen) * par.wippHz * 2 * Math.PI) * par.wippen * fenster(v);
      }
      break;
    }
    case 'selbst': {
      const e = Math.sin(Math.PI * clamp01(u));
      aus.drehung += par.heben * e;
      aus.hoch += 1.6 * e;
      aus.skala += 0.12 * e;
      break;
    }
    default:
      break;
  }
}

/** Aufladeglanz (0..1) aus der Zeit seit dem Schuss. */
function glanzVerlauf(par, t) {
  if (par.art !== 'zauber' && par.art !== 'tech' && par.art !== 'selbst') return 0;
  if (par.art === 'selbst') return Math.sin(Math.PI * clamp01(t / par.schussDauer));
  if (t < par.aufladen) return glatt01(t / par.aufladen);
  const v = (t - par.aufladen) / Math.max(1e-6, par.schussDauer - par.aufladen);
  return fenster(v);
}

/**
 * Berechnet die Pose der gehaltenen Waffe.
 *
 * Reine Funktion der Zeiten: gleiche Eingabe, gleiche Pose. Nach Ablauf aller
 * Bewegungen bleibt nur das Pendeln im Stand (bei reduzierter Bewegung gar nichts).
 *
 * @param {object} par - aus `waffenParameter`
 * @param {{idle:number, seitZiehen:number, seitSchuss:number, bereit:number, treffer:number, bereitSeit?:number}} zeit
 * @param {boolean} reduziert - `prefers-reduced-motion`
 * @param {ReturnType<typeof neuePose>} aus - wird überschrieben und zurückgegeben
 */
export function waffenPose(par, zeit, reduziert, aus) {
  aus.vor = 0; aus.hoch = 0; aus.drehung = 0; aus.skala = 1;
  aus.glanz = 0; aus.blitz = 0; aus.weiss = 0; aus.dunkel = 0;
  aus.blitzForm = 'keiner'; aus.blitzGroesse = 0;

  const bereit = clamp01(zeit.bereit);
  aus.ladung = bereit;
  aus.dunkel = bereit < 1 ? 0.3 + 0.25 * (1 - bereit) : 0;
  // Weiß: Treffer; kurzer Puls, sobald die Waffe nach dem Nachladen wieder bereit ist (N-15, `bereitSeit`).
  aus.weiss = Math.max(clamp01(zeit.treffer), 0.55 * bereitPuls(zeit.bereitSeit));

  const ziehen = zeit.seitZiehen;
  const gezogen = ziehen >= 0 && ziehen < par.ziehenDauer;
  if (gezogen) {
    const u = ziehen / par.ziehenDauer;
    // Aufnehm-Blitz: kurz weiß über der Silhouette.
    aus.weiss = Math.max(aus.weiss, 0.8 * fenster(u));
  }

  const schuss = zeit.seitSchuss;
  const schiesst = schuss >= 0 && schuss < par.schussDauer;

  if (!reduziert) {
    // Pendeln und Atmen im Stand, je Figur versetzt durch `idle`.
    const phase = zeit.idle * par.idleTempo * 2 * Math.PI;
    aus.drehung += Math.sin(phase) * par.idleDreh;
    aus.hoch += Math.sin(phase * 1.3 + 1) * par.idleAtem;
    if (gezogen) {
      const e = einschwingen(ziehen / par.ziehenDauer);
      aus.hoch -= par.ziehenTief * (1 - e);
      aus.drehung -= par.ziehenDreh * (1 - e);
      aus.skala *= 0.8 + 0.2 * Math.min(1, e);
    }
    if (schiesst) schussBewegung(par, schuss, aus);
  }

  if (schiesst) {
    aus.glanz = glanzVerlauf(par, schuss);
    if (par.blitzForm !== 'keiner') {
      const tb = schuss - par.aufladen - (par.treffAb ?? 0);
      if (tb >= 0 && tb < par.blitzDauer) {
        aus.blitz = fenster(tb / par.blitzDauer);
        aus.blitzForm = par.blitzForm;
        aus.blitzGroesse = par.blitzGroesse;
      }
    }
  }
  return aus;
}

// ----------------------------------------------------------------- Projektile

/*
 * Darstellung der Flugobjekte. `groesse` = Weltpixel Kantenlänge der 32er-Zelle,
 * `spin` = Eigenrotation in rad/s (0 = richtet sich nach der Flugrichtung).
 */
const GESCHOSS_ART = Object.freeze({
  granate: { groesse: 17, spin: 0 },
  stein: { groesse: 18, spin: 6 },
  rakete: { groesse: 22, spin: 0 },
  pfeil: { groesse: 20, spin: 0 },
  kugel: { groesse: 14, spin: 0 },
  feuer: { groesse: 18, spin: 0 },
  eis: { groesse: 17, spin: 0 },
  gift: { groesse: 17, spin: 0 },
  wasser: { groesse: 17, spin: 0 },
  plasma: { groesse: 16, spin: 0 },
  zauber: { groesse: 17, spin: 0 },
  ding: { groesse: 19, spin: 0 },
});

/** Werfbare Dinge drehen sich auch dann, wenn das Manifest es nicht verlangt (Name, nach Katalog). */
const WURF_NAME = /bumerang|shuriken|wurf|axt|messer|frisbee|diskus|schleuder|hammer|brocken|meteor/i;
const SPIN_MELEE = 11;
const SPIN_STANDARD = 9;
/** Granaten und Bomben (Zünder oder Abpraller) trudeln; Geschützgranaten fliegen gerade. */
const SPIN_GRANATE = 8;

/**
 * Waffengruppen mit eigener Flugmarke (Fassung 5): zerfallend, lenkend, teleportierend, abprallend — und seit
 * EREIGNIS-1 die liegenbleibenden Zünderwaffen („Rolling-Waffen": Roboterbombe, Kaktusbombe, Pömpel, Impulsbombe,
 * Molotowcocktail, Giftwolke, Tentakelgift). Sie prallen nicht ab, sondern bleiben am Aufprall liegen und zünden
 * nach Ablauf (`projectileSystem`, `fuse_armed`/`fuse_expired`); ohne Marke sahen sie im Flug aus wie ein
 * gewöhnliches Geschoss, das beim Aufprall wirkt. Reine Anzeige: Motor, Hash und Replays bleiben unberührt.
 */
export const GESCHOSS_GRUPPEN = Object.freeze({
  /**
   * W10: KEINE „Streu“-Marke mehr. `fragmentation` und `banana_split` erzeugen im
   * Motor kein zusätzliches Projektil (die Schrotflinte streut seit Waffenfassung 19
   * über `streuung`, nicht über `spread_shot` — BAL-16, `config/waffen-f19.js`); implementiert
   * ist die Splitterstreuung im GELÄNDE (`charakterDerWaffe` →
   * `splitter`, `config/zerstoerung.js`). Die Marke heißt deshalb nach dieser
   * Mechanik und wird nur aus ihr vergeben — nicht aus dem Spezialnamen.
   */
  splitter: Object.freeze({ farbe: '#fbbf24', name: 'Geländesplitter' }),
  lenk: Object.freeze({ farbe: '#f472b6', name: 'Lenk' }),
  teleport: Object.freeze({ farbe: '#a78bfa', name: 'Teleport' }),
  abpraller: Object.freeze({ farbe: '#34d399', name: 'Abpraller' }),
  zuender: Object.freeze({ farbe: '#fb923c', name: 'Zünder' }),
});

/** Gruppe eines Geschosses aus den Katalogwerten (keine zweite Tabelle); `null` für gewöhnliche. */
export function geschossGruppe(waffe) {
  if (!waffe || waffe.delivery === 'hitscan') return null;
  // Die Splitter-Marke folgt der tatsächlich implementierten Geländewirkung.
  if (charakterDerWaffe(waffe) === 'splitter') return 'splitter';
  if ((waffe.homing ?? 0) > 0) return 'lenk';
  if (/teleport|portal/.test(waffe.special ?? '')) return 'teleport';
  if ((waffe.bounces ?? 0) > 0) return 'abpraller';
  if ((waffe.fuseTime ?? 0) > 0) return 'zuender';
  return null;
}

/** Kleine Marke neben dem Geschoss: Punkte (Streu), Fadenkreuz (Lenk), Raute (Teleport), Bogen (Abpraller), Uhr (Zünder). */
export function zeichneGruppenmarke(ctx, gruppe, x, y, alter, reduziert = false) {
  const g = GESCHOSS_GRUPPEN[gruppe];
  if (!g) return;
  const r = 12 + (reduziert ? 0 : Math.sin(alter * 6) * 1.5);
  ctx.save();
  ctx.strokeStyle = g.farbe;
  ctx.fillStyle = g.farbe;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  if (gruppe === 'splitter') {
    for (let i = 0; i < 3; i += 1) { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; ctx.moveTo(x + Math.cos(a) * r + 2, y + Math.sin(a) * r); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 0, Math.PI * 2); }
    ctx.fill();
  } else if (gruppe === 'lenk') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r - 3, y); ctx.lineTo(x - r + 4, y); ctx.moveTo(x + r - 4, y); ctx.lineTo(x + r + 3, y);
    ctx.moveTo(x, y - r - 3); ctx.lineTo(x, y - r + 4); ctx.moveTo(x, y + r - 4); ctx.lineTo(x, y + r + 3);
    ctx.stroke();
  } else if (gruppe === 'teleport') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.stroke();
  } else if (gruppe === 'zuender') {
    // Stoppuhr: Ring, Krone oben, ein Zeiger, der läuft (bei reduzierter Bewegung steht er).
    const zeiger = reduziert ? -Math.PI / 2 : -Math.PI / 2 + alter * Math.PI * 2;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - 3, y - r - 3); ctx.lineTo(x + 3, y - r - 3);
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(zeiger) * (r - 3), y + Math.sin(zeiger) * (r - 3));
    ctx.stroke();
  } else {
    ctx.arc(x, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();
}

/** Korrekturen je Waffen-ID für die Flugdarstellung: `groesse`, `spin`. */
const GESCHOSS_KORREKTUREN = Object.freeze({});

/**
 * Wie ein Geschoss gezeichnet wird.
 *
 * @param {{id?:string, displayName?:string, category?:string, fuseTime?:number, bounces?:number}} waffe
 * @param {{art?:string, spin?:boolean, angle?:number}|null} proj - Eintrag `projectile` des Manifests
 * @returns {{groesse:number, spin:number, versatz:number, start:number}} `versatz`: Drehung der Zelle gegenüber der Flugrichtung (rad)
 */
export function geschossDarstellung(waffe, proj) {
  const art = GESCHOSS_ART[proj?.art] ?? GESCHOSS_ART.ding;
  let spin = art.spin;
  const wirft = proj?.spin === true || WURF_NAME.test(waffe?.displayName ?? '');
  const trudelt = (waffe?.fuseTime ?? 0) > 0 || (waffe?.bounces ?? 0) > 0;
  if (spin === 0 && wirft) spin = waffe?.category === 'melee' ? SPIN_MELEE : SPIN_STANDARD;
  else if (spin === 0 && trudelt && (proj?.art === 'ding' || proj?.art === 'granate')) spin = SPIN_GRANATE;
  const korr = GESCHOSS_KORREKTUREN[waffe?.id] ?? null;
  return {
    groesse: korr?.groesse ?? art.groesse,
    spin: korr?.spin ?? spin,
    versatz: ((proj?.angle ?? 0) * Math.PI) / 180,
    start: (PARAMETER[waffe?.category] ?? PARAMETER.ranged).start,
    gruppe: geschossGruppe(waffe),
  };
}

/** Winkel der Flugrichtung (0 = rechts, y nach unten wie auf dem Bildschirm); ohne Bewegung der Rückfallwert. */
export function flugWinkel(dx, dy, rueckfall = 0) {
  return dx * dx + dy * dy < 1e-6 ? rueckfall : Math.atan2(dy, dx);
}

/**
 * Zeichenwinkel eines Geschosses: Flugrichtung minus Zellenversatz plus
 * Eigenrotation (nicht bei reduzierter Bewegung).
 *
 * @param {number} flug - Flugwinkel
 * @param {{spin:number, versatz:number}} dar - aus `geschossDarstellung`
 * @param {number} alter - Sekunden seit dem ersten Bild
 */
export function geschossWinkel(flug, dar, alter, reduziert) {
  const dreh = reduziert || dar.spin === 0 ? 0 : dar.spin * alter;
  return flug - dar.versatz + dreh;
}

/** Länge des Schweifs aus den letzten Positionen. */
export const SCHWEIF_LAENGE = 8;

/** Mindestabstand (Weltpixel) zweier Schweifpunkte: macht den Schweif langsamer Geschosse sichtbar lang (N-15). */
export const SCHWEIF_MIN_ABSTAND = 3;

/**
 * Ringpuffer der letzten Positionen eines Geschosses (feste Größe, keine
 * Allokation nach dem Anlegen). `punkt(i)` zählt von der ältesten Position.
 */
export class SchweifRing {
  constructor(kapazitaet = SCHWEIF_LAENGE) {
    this.n = kapazitaet;
    this.x = new Float32Array(kapazitaet);
    this.y = new Float32Array(kapazitaet);
    this.kopf = 0;
    this.anzahl = 0;
  }

  /**
   * Hängt eine Position an; Sprünge (anderes Geschoss, Teleport) leeren den Schweif.
   * `minAbstand` (N-15): Ein Punkt kommt erst dazu, wenn das Geschoss sich seit dem letzten um so viele
   * Pixel bewegt hat. Schnelle Geschosse (mehr als `minAbstand` je Bild) merken sich weiter jedes Bild;
   * langsame (Mörsergranate am Scheitelpunkt, Wurfwaffe) bekommen dadurch einen Schweif von mindestens
   * `minAbstand` x Kapazität Pixeln statt eines Stummels aus acht fast gleichen Punkten.
   */
  schiebe(x, y, sprungMax = 120, minAbstand = 0) {
    if (this.anzahl > 0) {
      const l = (this.kopf + this.n - 1) % this.n;
      const dx = x - this.x[l];
      const dy = y - this.y[l];
      const d2 = dx * dx + dy * dy;
      if (d2 > sprungMax * sprungMax) this.anzahl = 0;
      else if (d2 === 0 || d2 < minAbstand * minAbstand) return;
    }
    this.x[this.kopf] = x;
    this.y[this.kopf] = y;
    this.kopf = (this.kopf + 1) % this.n;
    if (this.anzahl < this.n) this.anzahl += 1;
  }

  /** Index 0 = älteste, `anzahl - 1` = neueste Position. */
  xAn(i) { return this.x[(this.kopf - this.anzahl + i + this.n * 2) % this.n]; }

  yAn(i) { return this.y[(this.kopf - this.anzahl + i + this.n * 2) % this.n]; }
}

/**
 * Lage und Schweif der fliegenden Geschosse (je Geschoss einmal angelegt, danach
 * nur noch überschrieben). Das Spawn-Ereignis (`projectile_spawn`) liefert die
 * Waffe und die Anfangsrichtung; fehlt es, fragt der Renderer den Besitzer.
 */
export class GeschossLagen {
  constructor() {
    this.lagen = new Map();
    this.spawn = new Map();
    this.bild = 0;
  }

  /** Merkt Waffe und Anfangsrichtung eines neuen Geschosses (aus `projectile_spawn`). */
  merke(id, waffeId, vx = 0, vy = 0) {
    if (this.spawn.size > 256) this.spawn.clear();
    this.spawn.set(id, { waffeId: waffeId ?? '', flug: flugWinkel(vx, vy, 0) });
  }

  /**
   * Führt die Lagen für dieses Bild fort und vergisst verschwundene Geschosse.
   *
   * @param {Array<{entityId:number,x:number,y:number,owner?:number}>} projektile
   * @param {number} jetzt - Sekunden
   */
  fuehre(projektile, jetzt) {
    this.bild += 1;
    for (const p of projektile) {
      const id = p.entityId;
      let s = this.lagen.get(id);
      if (!s) {
        const sp = this.spawn.get(id);
        this.spawn.delete(id);
        s = {
          x: p.x, y: p.y, flug: sp?.flug ?? 0, t0: jetzt, waffeId: sp?.waffeId ?? '', owner: p.owner ?? -1,
          ring: new SchweifRing(), gesehen: this.bild, sp: null, dar: null, winkel: 0,
        };
        this.lagen.set(id, s);
      } else {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (dx * dx + dy * dy > 0.04) s.flug = Math.atan2(dy, dx);
        s.x = p.x; s.y = p.y;
        s.gesehen = this.bild;
      }
      s.ring.schiebe(p.x, p.y, 120, SCHWEIF_MIN_ABSTAND);
    }
    if (this.lagen.size > projektile.length) {
      for (const [id, s] of this.lagen) if (s.gesehen !== this.bild) this.lagen.delete(id);
    }
  }

  lage(id) {
    return this.lagen.get(id) ?? null;
  }

  leere() {
    this.lagen.clear();
    this.spawn.clear();
  }
}
