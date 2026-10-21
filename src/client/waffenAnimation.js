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

/** Die acht Katalogkategorien (`src/shared/config/weapons.js`). */
export const KATEGORIEN = Object.freeze([
  'melee', 'ranged', 'heavy_ranged', 'elemental', 'magic', 'tech', 'utility', 'ultimate',
]);

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
 *   griffObjekt  Zellpixel, um die der Griff bei langen Objekt-Waffen zum Schaft hin rückt (negativ = hinten);
 *                bei kompakten Sprites und Kacheln 0
 *   handHoch     Handposition über (negativ: unter) der Standardhöhe
 *   idleDreh     Pendeln der Waffe im Stand (Amplitude), idleAtem Heben/Senken in px, idleTempo in Hz
 *   ziehenDauer  Einschwingen von unten beim Ziehen/Wechseln; ziehenTief Startversatz, ziehenDreh Startdrehung
 *   art          Schussbewegung: kurz | schwer | hieb | zauber | tech | selbst
 *   schussDauer  Gesamtdauer der Bewegung; kick Rückstoßweg; rueck Rückdrehung; wippen/wippHz Nachwippen
 *   heben        Heben der Spitze (Zauber, Selbstwirkung); aufladen Dauer des Aufladens vor dem Schuss
 *   blitzForm    kegel | stern | ring | funke | keiner; blitzGroesse in px, blitzDauer in s
 *   koerper      Faktor auf den Rückstoß des Oberkörpers (`figurAnimation.js`), ausfall 0..1 Ausfallschritt
 *                (Figur geht beim Schuss in die Knie und verbreitert den Stand: schwere Waffen)
 *   start        Startglanz des Geschosses an der Mündung in px (Geschoss-Zeichnung)
 */
const BASIS = Object.freeze({
  zelle: 28,
  handVor: 3,
  handHoch: 0,
  griffObjekt: -8,
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
    zelle: 30, handVor: 2, handHoch: -1, griffObjekt: -16, art: 'hieb', schussDauer: 0.6, kick: 7,
    ziehenDreh: 1.2, blitzForm: 'keiner', blitzGroesse: 0, blitzDauer: 0, koerper: 1.6, ausfall: 0.3, start: 0,
  }),
  ranged: kategorie({
    zelle: 28, griffObjekt: -10, art: 'kurz', schussDauer: 0.26, kick: 4.6, rueck: 0.3, wippen: 0.05, wippHz: 13,
    blitzForm: 'kegel', blitzGroesse: 14, blitzDauer: 0.09, koerper: 1, ausfall: 0, start: 10,
  }),
  heavy_ranged: kategorie({
    zelle: 34, handVor: 1.5, handHoch: 1.5, griffObjekt: -12, idleDreh: 0.018, idleAtem: 0.3, ziehenDauer: 0.3,
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
  // Bumerang, Doppelkopf-Axt, Wurfklingen: lange Wurfwaffen, kleiner als die Schwerwaffen-Zelle.
  pa_049: { zelle: 27 },
  pa_050: { zelle: 29, handVor: 2.5 },
  pa_051: { zelle: 28 },
  // Feldkanone: schwere Waffe, langer Rückstoß mit Nachschwingen.
  // Rucksack, Gleitschirm und Jetpack werden auf dem Rücken getragen: hinter dem Körper, weiter hinten.
  pa_032: { lage: 'hinter', handVor: -5 },
  pa_112: { lage: 'hinter', handVor: -5, handHoch: 1 },
  pa_114: { lage: 'hinter', handVor: -5, handHoch: 2 },
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

const parameterCache = new Map();

/**
 * Der Parametersatz einer Waffe: Kategorie, Korrektur, bei Selbstwirkung ohne Blitz.
 * Das Ergebnis ist eingefroren und wird je Waffe einmal gebaut.
 *
 * @param {string} kat - Katalogkategorie
 * @param {string} [waffeId]
 * @param {boolean} [selbst] - wirkt auf den Anwender (Schaden 0)
 * @param {string} [form] - Form des Sprites laut Manifest (`kachel`, `objekt`, `kompakt`)
 * @param {boolean} [wurf] - die Waffe wird geworfen (Geschoss `ding` oder mit Zünder/Abprallern)
 * @param {string} [kachelModus] - `motiv` oder `orb` bei Kachel-Waffen
 */
export function waffenParameter(kat, waffeId = '', selbst = false, form = '', wurf = false, kachelModus = '') {
  const schluessel = `${kat}|${waffeId}|${selbst ? 1 : 0}|${form}|${wurf ? 1 : 0}|${kachelModus}`;
  let p = parameterCache.get(schluessel);
  if (!p) {
    const basis = PARAMETER[kat] ?? PARAMETER.ranged;
    const korr = KORREKTUREN[waffeId] ?? null;
    p = {
      ...basis, ...(wurf && !selbst ? WURF : null), ...(selbst ? SELBST : null),
      ...(form === 'kompakt' ? KOMPAKT(basis) : null),
      ...(form === 'kachel' ? (kachelModus === 'motiv' ? KACHEL_MOTIV(basis) : KACHEL_ORB(basis)) : null), ...korr,
    };
    p.griff = form === 'objekt' ? (korr?.griffObjekt ?? basis.griffObjekt) : (korr?.griff ?? 0);
    Object.freeze(p);
    parameterCache.set(schluessel, p);
  }
  return p;
}

/**
 * Der Parametersatz für eine Katalogwaffe samt ihrem Sprite-Eintrag: Selbstwirkung
 * (Schaden 0), Form des Sprites und Wurfwaffe (Geschoss `ding` oder Zünder) fließen ein.
 *
 * @param {{id:string, category:string, damage?:number, fuseTime?:number}} waffe
 * @param {{form?:string, projektilInfo?:{art?:string}|null}|null} sp
 */
export function parameterFuerWaffe(waffe, sp) {
  return waffenParameter(
    waffe.category, waffe.id, waffe.damage === 0, sp?.form ?? '',
    sp?.projektilInfo?.art === 'ding' || (waffe.fuseTime ?? 0) > 0, sp?.kachel ?? '',
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
  return { idle: 0, seitZiehen: Infinity, seitSchuss: Infinity, bereit: 1, treffer: 0 };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const glatt = u => { const c = clamp01(u); return c * c * (3 - 2 * c); };
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
      const e = Math.pow(fenster(u), 1.5) * glatt(t / 0.04);
      aus.vor -= par.kick * e;
      aus.drehung += par.rueck * e;
      aus.drehung += Math.sin(t * par.wippHz * 2 * Math.PI) * par.wippen * fenster(u);
      break;
    }
    case 'hieb': {
      // Ausholen (Spitze hoch), Hieb in einem Bogen nach unten, Rückschwung in die Ruhe.
      if (t < 0.06) {
        const w = glatt(t / 0.06);
        aus.drehung += 0.45 * w;
        aus.vor -= 1.2 * w;
      } else if (t < 0.22) {
        const v = (t - 0.06) / 0.16;
        const g = glatt(v);
        aus.drehung += 0.45 - 1.95 * g;
        aus.vor += -1.2 + (par.kick + 1.2) * Math.sin(Math.PI * Math.min(1, v * 1.15) * 0.5) * (1 - 0.3 * v);
        aus.hoch += Math.sin(Math.PI * v) * 1.2;
      } else {
        const v = (t - 0.22) / (par.schussDauer - 0.22);
        const g = 1 - glatt(v);
        aus.drehung += -1.5 * g;
        aus.vor += (-1.2 + (par.kick + 1.2) * 0.7) * g * g;
      }
      break;
    }
    case 'zauber': {
      // Heben und Aufladen, dann Freigabe mit Stoß nach vorn.
      if (t < par.aufladen) {
        const w = glatt(t / par.aufladen);
        aus.drehung += par.heben * w;
        aus.hoch += 2.2 * w;
        aus.skala += 0.04 * w;
      } else {
        const v = (t - par.aufladen) / (par.schussDauer - par.aufladen);
        const e = fenster(v);
        aus.drehung += par.heben * e - par.rueck * Math.sin(Math.PI * Math.min(1, v * 3)) * (1 - v);
        aus.hoch += 2.2 * e;
        aus.vor += par.kick * Math.pow(1 - v, 3) * glatt(v * 6);
        aus.skala += 0.04 * e;
      }
      break;
    }
    case 'tech': {
      // Aufladen mit feinem Zittern, dann kurzer scharfer Stoß.
      if (t < par.aufladen) {
        const w = glatt(t / par.aufladen);
        aus.hoch += Math.sin(t * 150) * 0.35 * w;
        aus.skala += 0.03 * w;
      } else {
        const v = (t - par.aufladen) / (par.schussDauer - par.aufladen);
        const e = fenster(v) * fenster(v) * glatt((t - par.aufladen) / 0.02);
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
  if (t < par.aufladen) return glatt(t / par.aufladen);
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
 * @param {{idle:number, seitZiehen:number, seitSchuss:number, bereit:number, treffer:number}} zeit
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
  aus.weiss = clamp01(zeit.treffer);

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
      const tb = schuss - par.aufladen;
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

/** Waffengruppen mit eigener Flugmarke (Fassung 5): zerfallend, lenkend, teleportierend, abprallend. */
export const GESCHOSS_GRUPPEN = Object.freeze({
  cluster: Object.freeze({ farbe: '#fbbf24', name: 'Streu' }),
  lenk: Object.freeze({ farbe: '#f472b6', name: 'Lenk' }),
  teleport: Object.freeze({ farbe: '#a78bfa', name: 'Teleport' }),
  abpraller: Object.freeze({ farbe: '#34d399', name: 'Abpraller' }),
});

/** Gruppe eines Geschosses aus den Katalogwerten (keine zweite Tabelle); `null` für gewöhnliche. */
export function geschossGruppe(waffe) {
  if (!waffe || waffe.delivery === 'hitscan') return null;
  if (waffe.special === 'fragmentation' || waffe.special === 'banana_split' || waffe.special === 'spread_shot') return 'cluster';
  if ((waffe.homing ?? 0) > 0) return 'lenk';
  if (/teleport|portal/.test(waffe.special ?? '')) return 'teleport';
  if ((waffe.bounces ?? 0) > 0) return 'abpraller';
  return null;
}

/** Kleine Marke neben dem Geschoss: Punkte (Streu), Fadenkreuz (Lenk), Raute (Teleport), Bogen (Abpraller). */
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
  if (gruppe === 'cluster') {
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
  } else {
    ctx.arc(x, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();
}

/** Korrekturen je Waffen-ID für die Flugdarstellung: `groesse`, `spin`. */
export const GESCHOSS_KORREKTUREN = Object.freeze({});

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

  /** Hängt eine Position an; Sprünge (anderes Geschoss, Teleport) leeren den Schweif. */
  schiebe(x, y, sprungMax = 120) {
    if (this.anzahl > 0) {
      const l = (this.kopf + this.n - 1) % this.n;
      const dx = x - this.x[l];
      const dy = y - this.y[l];
      if (dx * dx + dy * dy > sprungMax * sprungMax) this.anzahl = 0;
      else if (dx === 0 && dy === 0) return;
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
      s.ring.schiebe(p.x, p.y);
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
