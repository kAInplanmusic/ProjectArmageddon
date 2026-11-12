/**
 * Werte der Waffenfassung 21 über der Fassung 20 (Entscheidungen des Auftraggebers vom 2026-11-11, `docs/TODO.md`
 * Zeile ENTSCHEIDUNGEN-2026-11-11, Nummern (8) bis (25)).
 *
 * Alles, was den Spielablauf verändert, steht hinter dieser Versionsmarke (AGENTS.md §2): Aufzeichnungen der
 * Fassungen 1 bis 20 sehen diese Schicht nicht und laufen bitgleich (Goldwerte in `tests/waffen-fassung21.test.js`).
 *
 * Was die Schicht trägt (je Entscheidung):
 *
 *  - (12) Kaktusbombe: Schadensart `poison` (Gift-Malus und halbe Rüstung beim Treffer).
 *  - (13) Handgranate: echter Explosionsradius (vorher 0 = reiner Direkttreffer nach der Landung, die Art war aber
 *    `explosive`). Die zwei Abpraller bleiben (20).
 *  - (16) Luftangriff, Meteorregen, Höllenkanone: Projektil statt Strahl. Sie nutzen den vorhandenen Anflug
 *    (`strikeStyle` sky/flank, `engine/shooting.js#resolveStrike`) wie Feldmörser, Meteorbrocken und Haubitze:
 *    sichtbares Geschoss, trifft Gelände und Deckung auf dem Weg. Radius und Fläche kommen aus den Katalogwerten
 *    vor der Auslese 2026-10-28 (`WAFFEN_F4_WERTE`: 65, 55, 58), die der Strahl nicht lesen konnte.
 *  - (17) Astralkugel und Gedankensturm: Abklingzeit 3 auf 2.
 *  - (19) Giftwolke und Tentakelgift: Gift auf den Deckel 36 (Summe/2 = 18 je Zug = `DOT_DECKEL.poison`); 45 und 55
 *    lagen darüber, der Rest war wirkungslos. Der Flammenwerfer steht seit Fassung 8 bei Feuer 30 (Brand 12 je Zug,
 *    unter dem Deckel 16) und bleibt dort; ihn auf 39 anzuheben wäre eine Stärkung, keine Deckelung.
 *  - (21) Zünder +15 %: Schaden aller elf Zünderwaffen mal 1,15, begrenzt auf `EIN_TREFFER_GRENZE` (79, Fassung 15:
 *    kein Ein-Treffer-Kill auf eine 100-LP-Figur). Wo die Grenze schon erreicht ist (Kaktusbombe, Impulsbombe,
 *    Handgranate), wächst stattdessen der Radius um 15 %. Ultimative Waffen (Wassermelone) sind von der Grenze
 *    ausgenommen (wie in Fassung 15).
 *  - (11) Kategorien nach Wirkung (`KATEGORIE_NACH_WIRKUNG`): reine Anzeigegruppe, Klangprofil und Animationsfamilie;
 *    kein Motor, kein Kit und keine Beute liest die Kategorie einer Fassungsschicht.
 *
 * Nutzwert, Portale und die neue Waffe stehen in `waffen-f21-nutzen.js` beziehungsweise unten; Zündzeit
 * (`ZUENDZEITEN`) und Zielvorgabe sind Regeln des Motors, keine Katalogwerte.
 *
 * @module config/waffen-f21
 */

/** Wählbare Zündzeiten in Sekunden (wie Worms: 1, 3 oder 5). */
export const ZUENDZEITEN = Object.freeze([1, 3, 5]);
/** Voreinstellung, wenn der Spieler nichts wählt: die mittlere Zeit. */
export const ZUENDZEIT_STANDARD = 3;

/** Zünderwaffen (`fuseTime` > 0 im Katalog): Entscheidung (21), +15 %. */
export const ZUENDER_FAKTOR = 1.15;

/** Wahr, wenn die Sekundenzahl eine erlaubte Zündzeit ist. */
export function istZuendzeit(sekunden) {
  return ZUENDZEITEN.includes(sekunden);
}

/**
 * Kategorie nach Wirkung (Entscheidung 11). Gruppen: `tech` Geräte mit Angriff oder Bauteil, `utility` Bewegung,
 * Versorgung und Schutz ohne eigenen Schaden, `elemental` Feuer, Gift, Eis, Blitz, `heavy_ranged` Geschütze,
 * Granaten und Artillerie, `magic` Zauber.
 */
export const KATEGORIE_NACH_WIRKUNG = Object.freeze({
  // Werkzeug mit Angriff
  pa_113: 'tech', // Bohrkanone (utility)
  pa_120: 'tech', // Energiefaust (utility)
  // Angriffsbomben und Geschütze gehören zu den schweren Fernwaffen
  pa_117: 'heavy_ranged', // Ananasbombe (utility)
  pa_064: 'heavy_ranged', // Katapult (elemental)
  pa_065: 'heavy_ranged', // Meteorbrocken (elemental)
  pa_066: 'heavy_ranged', // Haubitze (elemental)
  pa_068: 'heavy_ranged', // Plasmagewehr (elemental)
  pa_069: 'heavy_ranged', // Raketenkanone (elemental)
  pa_134: 'heavy_ranged', // Luftangriff (tech)
  pa_135: 'heavy_ranged', // Meteorregen (tech)
  pa_136: 'heavy_ranged', // Bohrkopfrakete (tech)
  pa_139: 'heavy_ranged', // Höllenkanone (tech)
  // Elementar
  pa_118: 'elemental', // Feuerwesen (utility)
  // Zauber
  pa_116: 'magic', // Blutritual (utility)
  // Selbstwirkungen ohne Angriff: Versorgung, Schutz, Bewegung
  pa_122: 'utility', // Endlosschleife (tech)
  pa_125: 'utility', // Nachschubkiste (tech)
  pa_126: 'utility', // Bunker (tech)
  pa_128: 'utility', // Hologrammportal (tech)
  pa_130: 'utility', // Tarnnetz (tech)
  pa_131: 'utility', // Schlauchboot (tech)
});

/** Schaden der elf Zünderwaffen in Fassung 21 und die Radiusanhebung dort, wo der Schaden an der Grenze steht. */
const ZUENDER_WERTE = Object.freeze({
  pa_028: Object.freeze({ blastRadius: 55 }), // Kaktusbombe: 79 (Grenze), Radius 48 +15 %
  pa_029: Object.freeze({ damage: 74 }), // Pömpel 64
  pa_030: Object.freeze({ blastRadius: 60 }), // Impulsbombe: 79 (Grenze), Radius 52 +15 %
  pa_046: Object.freeze({ damage: 63 }), // Splittergranate 55
  pa_048: Object.freeze({ damage: 69 }), // Bananengranate 60
  pa_052: Object.freeze({ damage: 54 }), // Molotowcocktail 47
  pa_053: Object.freeze({ damage: 78 }), // Roboterbombe 68
  pa_070: Object.freeze({ damage: 21 }), // Giftwolke 18
  pa_073: Object.freeze({ damage: 37 }), // Tentakelgift 32
  pa_144: Object.freeze({ damage: 98 }), // Kosmische Wassermelone 85 (ultimate: ohne Grenze)
});

/** Strahl wird Projektil (16): Werte der Katalogfassung vor der Auslese (`WAFFEN_F4_WERTE`), dazu Geschossdaten. */
const ANFLUG_ALS_PROJEKTIL = Object.freeze({
  pa_134: Object.freeze({ delivery: 'projectile', blastRadius: 65, aoe: true, projectileSpeed: 70 }), // Luftangriff
  pa_135: Object.freeze({ delivery: 'projectile', blastRadius: 55, aoe: true, projectileSpeed: 70 }), // Meteorregen
  pa_139: Object.freeze({ delivery: 'projectile', blastRadius: 58, aoe: true, projectileSpeed: 70 }), // Höllenkanone
});

/**
 * (9) Nutzwert der Waffen ohne Schaden. Bis Fassung 20 zählte der Leistungswert nur Schaden, Fläche, Gelände, Rückstoß ...
 * (`computePowerScore`): Versetzer, Munitionsgeber, Rüstung und Minen kamen auf 0 und damit auf `common`, obwohl ihr
 * Nutzen hoch ist. In Fassung 21 tragen sie einen Nutzwert in derselben Skala (Schaden-Punkte ~ Spielwert):
 *   - Versetzen (`distance` px):       0,5 je Pixel          (Dimensionsriss 165 px = 82,5)
 *   - Munition (`amount` Ladungen):   12 je Ladung          (Nachschubkiste 4 = 48)
 *   - Rüstung (`reduction`):         100 je 100 % Minderung (Bunker 0,35 = 35)
 *   - Heilung (`amount` LP):           1 je LP              (Wächterstatue 35)
 *   - Mine:                            fest 50 (ein Schuss Fläche; Entscheidung des Auftraggebers: sofort scharf)
 * mal Abklingzeitfaktor 0,9 (wie im Leistungswert) bei Abklingzeit > 0. Die Stufe folgt `STUFEN_SCHWELLEN` (dieselben
 * Schwellen wie `POWER_TIERS` im Generator; ein Test prüft die Gleichheit). Das Feld `nutzwert` zeigt den Grund an;
 * `powerScore` und `powerTier` der Fassungsschicht lesen Menü und Anzeige. Die Beute (`lootSystem`) liest weiter den
 * Katalog und bleibt damit unverändert (offen, siehe TODO GP-1 (9)).
 */
export const NUTZEN_JE_WAFFE = Object.freeze({
  pa_032: Object.freeze({ art: 'versetzen', wert: 100, cooldown: 1 }), // Raketenrucksack
  pa_087: Object.freeze({ art: 'versetzen', wert: 80, cooldown: 0 }), // Dimensionssprung
  pa_088: Object.freeze({ art: 'versetzen', wert: 165, cooldown: 2 }), // Dimensionsriss
  pa_111: Object.freeze({ art: 'versetzen', wert: 45, cooldown: 0 }), // Enterhaken
  pa_112: Object.freeze({ art: 'versetzen', wert: 70, cooldown: 0 }), // Düsenrucksack
  pa_114: Object.freeze({ art: 'versetzen', wert: 160, cooldown: 2 }), // Gleitschirm
  pa_128: Object.freeze({ art: 'versetzen', wert: 90, cooldown: 0 }), // Hologrammportal
  pa_131: Object.freeze({ art: 'versetzen', wert: 50, cooldown: 0 }), // Schlauchboot
  pa_076: Object.freeze({ art: 'versetzen', wert: 90, cooldown: 1 }), // Portal (zusammengeführt)
  pa_115: Object.freeze({ art: 'heilen', wert: 35, cooldown: 0 }), // Wächterstatue
  pa_119: Object.freeze({ art: 'munition', wert: 2, cooldown: 0 }), // Munitionskiste
  pa_122: Object.freeze({ art: 'munition', wert: 3, cooldown: 0 }), // Endlosschleife
  pa_125: Object.freeze({ art: 'munition', wert: 4, cooldown: 1 }), // Nachschubkiste
  pa_126: Object.freeze({ art: 'ruestung', wert: 0.35, cooldown: 0 }), // Bunker
  pa_130: Object.freeze({ art: 'ruestung', wert: 0.2, cooldown: 0 }), // Tarnnetz
  pa_127: Object.freeze({ art: 'mine', wert: 50, cooldown: 1 }), // Mine
});

const NUTZEN_FAKTOR = Object.freeze({ versetzen: 0.5, heilen: 1, munition: 12, ruestung: 100, mine: 1 });

/** Dieselben Schwellen wie `POWER_TIERS` (scripts/build-weapon-catalog.mjs), absteigend. */
export const STUFEN_SCHWELLEN = Object.freeze([
  Object.freeze({ tier: 'legendary', min: 190 }),
  Object.freeze({ tier: 'epic', min: 130 }),
  Object.freeze({ tier: 'rare', min: 80 }),
  Object.freeze({ tier: 'uncommon', min: 45 }),
  Object.freeze({ tier: 'common', min: 0 }),
]);

/** Nutzwert einer Waffe ohne Schaden (0, wenn sie keinen Nutzen-Eintrag hat). */
export function nutzwertVon(id) {
  const n = NUTZEN_JE_WAFFE[id];
  if (!n) return 0;
  const roh = n.wert * NUTZEN_FAKTOR[n.art] * (n.cooldown > 0 ? 0.9 : 1);
  return Number(roh.toFixed(2));
}

const stufeFuer = punkte => STUFEN_SCHWELLEN.find(e => punkte >= e.min).tier;

const NUTZEN_WERTE = Object.freeze(Object.fromEntries(Object.keys(NUTZEN_JE_WAFFE).map((id) => {
  const nutzwert = nutzwertVon(id);
  return [id, Object.freeze({ nutzwert, powerScore: nutzwert, powerTier: stufeFuer(nutzwert) })];
})));

/**
 * (18) Portale: Portalring (`pa_076`) und Kosmisches Portal (`pa_079`) waren Dubletten (Versatz 60 px, Rest gleich).
 * Fassung 21 führt sie in EINER Waffe zusammen, dem Portal (`pa_076`, Versatz 90 px, Pause 1). Der Platz `pa_079`
 * bekommt eine neue Waffe, damit der Katalog bei 150 bleibt: die Funkenkugel (Geschoss mit Direkttreffer und der Schadensart
 * Blitz: Malus Schock mit Leitung auf Nachbarn, vorhandener Motorpfad `config/schaden.js`; `special` bleibt `stun`). Icon, Animation und
 * Klang bleiben die des Platzes bzw. der Kategorie; ein eigenes Bild gibt es nicht.
 */
const PORTALE = Object.freeze({
  pa_076: Object.freeze({
    displayName: 'Portal',
    description: 'Öffnet ein Portal und versetzt den Schützen um bis zu 90 Pixel.',
    wirkung: Object.freeze({ distance: 90 }),
  }),
  pa_079: Object.freeze({
    displayName: 'Funkenkugel',
    description: 'Geschoss unter Spannung: schockt das Ziel und leitet einen Teil des Schadens an Nachbarn weiter.',
    special: 'stun', damage: 30, damageSource: 'source', damageType: 'electric', cooldown: 1,
    elemental: Object.freeze({ fire: 0, ice: 0, poison: 0 }), targeting: 'directional',
    powerScore: 27, powerTier: 'common',
  }),
});

/** Gruppe im Waffenmenü folgt der Kategorie (`WEAPON_SUBCATEGORIES` im Katalog). */
const GRUPPE_JE_KATEGORIE = Object.freeze({
  melee: 'melee', ranged: 'guns', heavy_ranged: 'guns', elemental: 'elemental', magic: 'elemental',
  tech: 'special', utility: 'special', ultimate: 'special',
});
const KATEGORIE_WERTE = Object.freeze(Object.fromEntries(
  Object.entries(KATEGORIE_NACH_WIRKUNG).map(([id, category]) => [id, Object.freeze({ category, subcategory: GRUPPE_JE_KATEGORIE[category] })]),
));

const EINZELWERTE = Object.freeze({
  pa_028: Object.freeze({ damageType: 'poison' }), // (12) Kaktusbombe: Gift als Schadensart
  pa_047: Object.freeze({ blastRadius: 46, aoe: true }), // (13) Handgranate: echter Radius (40, dazu +15 % statt Schaden an der Grenze)
  pa_091: Object.freeze({ cooldown: 2 }), // (17) Astralkugel
  pa_102: Object.freeze({ cooldown: 2 }), // (17) Gedankensturm
  pa_070: Object.freeze({ elemental: Object.freeze({ fire: 0, ice: 0, poison: 36 }) }), // (19) Giftwolke
  pa_073: Object.freeze({ elemental: Object.freeze({ fire: 0, ice: 0, poison: 36 }) }), // (19) Tentakelgift
});

function mische(...quellen) {
  const aus = {};
  for (const quelle of quellen) {
    for (const [id, werte] of Object.entries(quelle)) aus[id] = { ...aus[id], ...werte };
  }
  return Object.freeze(Object.fromEntries(Object.entries(aus).map(([id, werte]) => [id, Object.freeze(werte)])));
}

export const WAFFEN_F21_WERTE = mische(NUTZEN_WERTE, KATEGORIE_WERTE, ZUENDER_WERTE, ANFLUG_ALS_PROJEKTIL, EINZELWERTE, PORTALE);
