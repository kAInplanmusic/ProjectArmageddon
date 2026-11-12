/**
 * Katalogfassung der Waffenwerte (`config.waffen` im Replay-Kopf).
 *
 * Die Balance-Korrektur vom 2026-10-14 ändert Schadenswerte einzelner Waffen
 * (`BALANCE_KORREKTUREN` in `scripts/build-weapon-catalog.mjs`). Eine Aufzeichnung
 * davor müsste mit den neuen Werten ein anderes Match spielen. Deshalb gilt wie bei
 * `kit` und `zerstoerung`:
 *
 *   - `WAFFEN_ALT` (1): Werte vor der Korrektur. Eine Aufzeichnung OHNE `waffen`
 *     im Kopf ist `WAFFEN_ALT`.
 *   - `WAFFEN_BALANCE` (2): Werte nach der Korrektur.
 *   - `WAFFEN_KORREKTUR` (3): Maschinenpistole angehoben, Energiefaust und Flammenklinge
 *     auf unter 2x Stufenmedian gesenkt (`BALANCE_KORREKTUREN_3`). Fassung 3 legt
 *     `WAFFEN_F3_WERTE` auf den Katalog, Fassung 2 zusätzlich `WAFFEN_F2_WERTE`.
 *   - `WAFFEN_FEIN` (4): neun Ausreißer des Stufenvergleichs nachgezogen
 *     (`BALANCE_KORREKTUREN_4`) und 20 gleich fliegende Wurf-/Schusswaffen differenziert
 *     (`FLUGPROFILE_4`). Der Katalog selbst trägt diese Fassung.
 *   - `WAFFEN_FAIR` (5, Standard): Selbstschaden eigener Flächenwirkung gedeckelt
 *     (`SELBSTSCHADEN_GRENZE`), dazu `WAFFEN_F5_WERTE` auf dem Katalog (Messung nachgezogen).
 *     Seit 2026-10-28 tragen vier Waffen im Katalog eine zutreffendere Schadensart
 *     (`ARTEN_BIS_F4`); die Fassungen 1 bis 4 behalten ihre alte Art.
 *   - `WAFFEN_SICHT` (13, Standard): wie 12; die Sichtlinie (`requiresLineOfSight`) endet an der ersten Figur auf der
 *     Zielgeraden. Bis Fassung 12 prüfte sie die ganze Reichweite: Stand hinter dem Ziel ein Hang, wurde der Schuss als
 *     „Sichtlinie versperrt" abgelehnt, obwohl der Strahl das Ziel davor getroffen hätte (EREIGNIS-1: Zauberpeitsche und
 *     Tesla-Turm maßen deshalb 0 Schaden). Regel im Motor (`hasLineOfSight` in `engine/shooting.js`), keine Katalogwerte.
 *   - `WAFFEN_WIND` (14, AERO): wie 13, dazu `windFactor` je Waffe (0 bis 2,5; ausdrückliche 0 = windfrei) aus
 *     der Fassungsschicht `WINDFAKTOR_JE_WAFFE` (`config/weapons.js`, erzeugt von
 *     `scripts/build-weapon-catalog.mjs`). Der Motor liest ihn nur mit `config.wind` 2 (`shooting.js`,
 *     `windFaktorFuerWaffe`); Fassungen 1 bis 13 sehen das Feld nicht und bleiben bitgleich.
 *   - `WAFFEN_TREFFER` (16): wie 15; das 24-px-Trefferfenster der
 *     Projektilwaffen ist vom Schadensradius getrennt (`W01`, docs/waffen-audit-2026-11-08).
 *     Bis Fassung 15 setzte `shooting.js` für jede Nicht-Nahkampfwaffe ohne Katalogsradius
 *     `blastRadius = 24`; dieser Wert wirkte über `explosion.js` als echter Flächenschaden
 *     (33 Projektile, u. a. Maschinenpistole `pa_040`, trafen damit im Umkreis). Ab Fassung 16
 *     bleibt `blastRadius` der Katalogwert (0 = keine Fläche), und die Kollision liest das
 *     eigene Feld `trefferRadius` (24 px nur um die Figur, kein Schaden an Dritten). Nahkampf-
 *     und Wurfwaffen behalten kein Trefferfenster, echte Flächenwaffen bleiben unverändert.
 *     Fassungen 1 bis 15 spawnen bitgleich wie zuvor (Goldwerte in `tests/w01-trefferfenster.test.js`).
 *   - `WAFFEN_KLASSE` (17): wie 16; der Klassenfaktor gilt auch im Strahlpfad.
 *     Bis Fassung 16 multiplizierte `shooting.js` den Projektilschaden mit
 *     `combatProfile().damageMultiplier`, `match.js#resolveHitscan` ließ ihn aus — derselbe
 *     Klassenvertrag ergab für Strahlwaffen dreimal denselben Rohschaden (BAL-02). Ab Fassung 17
 *     gilt EIN Vertrag für beide Pfade: `weapon.damage × Klassenfaktor × Buff`, jeder Faktor genau
 *     einmal; der Kettenblitz rechnet den Klassenfaktor einmal vor dem Sprungabfall. Fassungen 1 bis
 *     16 bleiben bitgleich (`tests/waffen-fassung.test.js`, `tests/klassenfaktor-pfade.test.js`).
 *   - `WAFFEN_FEUERWESEN` (20, Standard): wie 19; das Feuerwesen (`pa_118`) ist ein Läufer, der bei Berührung in fünf
 *     Feuerkugeln zerbirst (`config/waffen-f20.js`, `engine/feuerwesen.js`).
 *   - `WAFFEN_STREU` (19): wie 18; die Schrotflinte streut fünf Kugeln (BAL-16).
 *   - `WAFFEN_NACHSCHUB` (18): wie 17; eine Nachschubwaffe füllt nur andere Waffen
 *     auf, nie sich selbst (BAL-05).
 *   - `WAFFEN_TEMPO` (15): wie 14, dazu `WAFFEN_F15_WERTE` (`config/waffen-f15.js`): Schaden je
 *     Katalogkategorie angehoben, damit eine Figur nach 3 bis 4 Treffern fällt (Median gemessen, siehe
 *     `docs/balance-tempo-2026-11-05.md`). Der Katalog bleibt unverändert; Fassungen 1 bis 14 lesen die Schicht
 *     nicht und bleiben bitgleich (Prüfsummen in `tests/waffen-fassung.test.js`).
 *   - `WAFFEN_MINE` (12): wie 11, dazu `WAFFEN_F12_WERTE`: die Impulsbombe (`pa_030`) ist die Mine (Wurf oder Ablegen, bleibt liegen,
 *     sofort scharf; Wirkung in `systems/bodenobjektSystem.js`, nur mit Bodenobjektfassung 2). Katalogzahl und Beutetopf bleiben.
 *   - `WAFFEN_MUNITION` (11): wie 10, dazu vier Munitionsklassen (unendlich, 1, 2, 3 Schuss; `config/munition.js`),
 *     Obergrenze 5 und Munitionskisten (Kistenfassung 4); weitere Teile (Rückstoß, Elemente, Schilde) stehen unten in `WAFFEN_F11_WERTE`.
 *   - `WAFFEN_SPREIZUNG` (10): wie 9, dazu `WAFFEN_F10_WERTE`: die Dubletten der Selbstwirkungen (Verstärkung, Zufall,
 *     Versetzen, Schild, Heilung, Fliegen, Haken, Munition, Rüstung) sind in Stärke, Dauer und Abklingzeit gestaffelt, und jede
 *     Verstärkung, jeder Zufallspool und jedes Schild trägt ein Element (Feuer, Eis, Blitz, Gift) mit echter Wirkung (Feld `wirkung`,
 *     gelesen in `buildEffect`, `StatusStore` und `MaliRegeln`). Alte Fassungen sehen das Feld nicht und verlaufen bitgleich.
 *   - `WAFFEN_VORSTRAHL` (9): wie 8; der Vorstrahl der Anflugschläge (sky/flank) macht keinen Schaden mehr (Regel im Motor).
 *   - `WAFFEN_FEINTUNING` (8): wie 7, dazu `WAFFEN_F8_WERTE` (sechs Waffen laut Balance-Auslesen).
 *   - `WAFFEN_ZUENDERPLUS` (7): wie 6, dazu `WAFFEN_F7_WERTE` (vier Zündergranaten mit etwa 15 % mehr Schaden).
 *   - `WAFFEN_ZUENDER` (6): Die Armierung einer Zündergranate ist korrigiert. Bis
 *     Fassung 5 stellte der Motor die bereits armierte Granate JEDEN Takt neu auf den Treffpunkt
 *     (der liegt im Festen) und ließ sie so je Takt rund 0,3 px sinken; sie zündete 11 bis 82 px
 *     unter dem Aufprall, teils außerhalb des eigenen Sprengradius. Ab Fassung 6 bleibt sie am
 *     Aufprallpunkt liegen und zündet dort (`services.match.zuenderBleibtLiegen`, gelesen in
 *     `projectileSystem.js`). Die Werte entsprechen Fassung 5; gewirkt hat die Regel nur auf die
 *     Waffen mit `fuseTime` > 0. Fassung 5 verhält sich bitgleich wie zuvor (sinkt weiter).
 *
 * `WAFFEN_ALT_WERTE` hält je geänderter Waffe die Altwerte jener Felder, die sich
 * durch die Korrektur geändert haben (`damage` und der daraus abgeleitete
 * `powerScore`; Stufe, Abklingzeit, Reichweite, Zünder bleiben unverändert).
 * `tests/waffen-fassung.test.js` belegt: Katalog + Altwerte = der Katalog vor der
 * Korrektur (Prüfsumme), und ein Spiel mit `waffen: 1` verläuft wie vorher.
 *
 * @module config/waffen-fassung
 */
import { getWeapon, WINDFAKTOR_JE_WAFFE } from './weapons.js';
import { WAFFEN_F11_WERTE } from './waffen-f11.js';
import { WAFFEN_F12_WERTE } from './waffen-f12.js';
import { WAFFEN_F15_WERTE } from './waffen-f15.js';
import { WAFFEN_F19_WERTE } from './waffen-f19.js';
import { WAFFEN_F20_WERTE } from './waffen-f20.js';
import { WAFFEN_F21_WERTE } from './waffen-f21.js';
import { WAFFEN_F22_WERTE } from './waffen-f22.js';

export const WAFFEN_ALT = 1;
export const WAFFEN_BALANCE = 2;
export const WAFFEN_KORREKTUR = 3;
export const WAFFEN_FEIN = 4;
export const WAFFEN_FAIR = 5;
export const WAFFEN_ZUENDER = 6;
export const WAFFEN_ZUENDERPLUS = 7;
export const WAFFEN_FEINTUNING = 8;
export const WAFFEN_VORSTRAHL = 9;
export const WAFFEN_SPREIZUNG = 10;
export const WAFFEN_MUNITION = 11;
export const WAFFEN_MINE = 12;
export const WAFFEN_SICHT = 13;
/**
 * Fassung 14 (AERO, `config.wind` 2): jede Waffe trägt `windFactor` (0 bis 2,5;
 * ausdrückliche 0 = windfrei). Der Katalog führt das Feld; die Fassungen 1 bis 13
 * sehen es NICHT (sie fliegen mit Faktor 1, Bit für Bit wie vorher). Gelesen wird
 * es im Motor nur, wenn `config.wind` mindestens 2 ist (`shooting.js`).
 */
export const WAFFEN_WIND = 14;
/**
 * Fassung 15 (GP-4 Tempo): Der Schaden je Waffenkategorie ist angehoben, damit
 * eine Figur nach 3 bis 4 guten Treffern fällt. Die Werte stehen als eigene
 * Datenschicht `WAFFEN_F15_WERTE` in `config/waffen-f15.js`; der Katalog bleibt
 * unverändert, die Fassungen 1 bis 14 sehen die Schicht nicht.
 */
export const WAFFEN_TEMPO = 15;
/**
 * Fassung 16 (W01, Trefferfenster): Das 24-px-Trefferfenster der Projektilwaffen
 * ist vom Schadensradius getrennt. `blastRadius` trägt nur noch die echte
 * Flächenwirkung des Katalogs; die Kollision liest `trefferRadius` (nur Treffer,
 * kein Schaden an Dritten). Bis Fassung 15 wirkte dasselbe Fenster als
 * Flächenschaden (`shooting.js`, `explosion.js`); diese Fassungen bleiben bitgleich.
 */
export const WAFFEN_TREFFER = 16;
/**
 * Fassung 17 (BAL-02, Klassenfaktor im Strahlpfad): Der Klassenfaktor wirkt ab
 * hier auch bei Hitscan-Waffen — EIN Schadensvertrag für Strahl und Projektil
 * (`weapon.damage × combatProfile().damageMultiplier × statuses.damageMultiplier`,
 * jeder Faktor genau einmal). Bis Fassung 16 ließ `match.js#resolveHitscan` den
 * Klassenfaktor aus; diese Fassungen bleiben bitgleich.
 */
export const WAFFEN_KLASSE = 17;
/**
 * Fassung 18 (BAL-05, Nachschub füllt sich nie selbst): Eine Nachschubwaffe (`EFFECT_KIND.AMMO`,
 * pa_119/pa_122/pa_125) füllt ab hier nur noch ANDERE endliche Waffen auf, nie sich selbst.
 * Bis Fassung 17 stellte `restoreAmmo` bei sonst vollem Inventar die gerade verbrauchte eigene
 * Ladung wieder her — die Waffe war damit unerschöpflich. Entscheidung des Auftraggebers vom
 * 2026-11-09. Fassungen 1 bis 17 bleiben bitgleich (`tests/nachschub-fassung18.test.js`).
 */
export const WAFFEN_NACHSCHUB = 18;
/**
 * Fassung 19 (BAL-16, Streuung): Die Schrotflinte (`pa_054`) verschießt fünf Kugeln in einem festen
 * Fächer statt eines Geschosses (`config/waffen-f19.js`, `engine/shooting.js`). Entscheidung des
 * Auftraggebers vom 2026-11-10. Fassungen 1 bis 18 bleiben bitgleich (`tests/streuung-fassung19.test.js`).
 */
export const WAFFEN_STREU = 19;
/**
 * Fassung 20 (Feuerwesen): `pa_118` setzt einen kleinen Feuergnom ab, der geradeaus läuft, springt und bei Berührung
 * mit einer Figur (auch der eigenen) in fünf Feuerkugeln zerbirst (`config/waffen-f20.js`, `engine/feuerwesen.js`).
 * Bis Fassung 19 war er ein Strahl. Entscheidung des Auftraggebers vom 2026-11-10. Fassungen 1 bis 19 bleiben
 * bitgleich (`tests/feuerwesen-fassung20.test.js`).
 */
export const WAFFEN_FEUERWESEN = 20;
/**
 * Fassung 21 (Entscheidungen des Auftraggebers vom 2026-11-11, GP-1/GP-2): Kaktusbombe Gift, Handgranate mit Radius,
 * Luftangriff/Meteorregen/Höllenkanone als Projektil, Abklingzeit Astralkugel/Gedankensturm 2, Gift-Deckel, Zünder +15 %,
 * Kategorien nach Wirkung, dazu Regeln im Motor (Zündzeit 1/3/5 s, Lebensdauerdeckel, Doppeltreffer). Werte in
 * `config/waffen-f21.js`. Fassungen 1 bis 20 bleiben bitgleich (`tests/waffen-fassung21.test.js`).
 */
export const WAFFEN_ENTSCHEIDUNG = 21;
/**
 * Fassung 22 (Auftrag 2026-11-12): die Mine fliegt im Bogen wie ein Stein und bleibt beim Aufprall liegen
 * (`config/waffen-f22.js`, `ProjectileSystem` → `landeAlsObjekt`). Fassungen 1 bis 21 bleiben bitgleich.
 */
export const WAFFEN_WURF = 22;
export const WAFFEN_STANDARD = WAFFEN_WURF;

/**
 * Obergrenze des Selbstschadens durch eigene Flächenwirkung ab Fassung 5, als Anteil der
 * Höchstgesundheit des Schützen: Ein einzelner eigener Schuss nimmt nie mehr als dieses Maß
 * (Messung: `scripts/waffen-selbstschaden.mjs`). Wer sich selbst trifft, verliert viel, stirbt
 * aber nicht aus voller Gesundheit durch einen Zufallstreffer. Fassung 4 und älter: keine Grenze.
 */
export const SELBSTSCHADEN_GRENZE = 0.4;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereWaffen(fassung) {
  return fassung === WAFFEN_ALT || fassung === WAFFEN_BALANCE || fassung === WAFFEN_KORREKTUR || fassung === WAFFEN_FEIN
    || fassung === WAFFEN_FAIR || fassung === WAFFEN_ZUENDER || fassung === WAFFEN_ZUENDERPLUS || fassung === WAFFEN_FEINTUNING || fassung === WAFFEN_VORSTRAHL || fassung === WAFFEN_SPREIZUNG || fassung === WAFFEN_MUNITION || fassung === WAFFEN_MINE || fassung === WAFFEN_SICHT || fassung === WAFFEN_WIND || fassung === WAFFEN_TEMPO || fassung === WAFFEN_TREFFER || fassung === WAFFEN_KLASSE || fassung === WAFFEN_NACHSCHUB || fassung === WAFFEN_STREU || fassung === WAFFEN_FEUERWESEN || fassung === WAFFEN_ENTSCHEIDUNG || fassung === WAFFEN_WURF ? fassung : WAFFEN_STANDARD;
}

/**
 * Werte der Fassung 3 für die Waffen, die Fassung 4 verändert (`damage` und die
 * abgeleiteten `powerScore` und `maxRange`; Stufe und Abklingzeit bleiben gleich).
 */
export const WAFFEN_F3_WERTE = Object.freeze({
  pa_011: Object.freeze({ gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 34.76, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_012: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 42.46, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_014: Object.freeze({ gravityScale: 1.15, maxRange: 180, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_015: Object.freeze({ gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 41.36 }),
  pa_016: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 36.96, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_019: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 35.86, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_020: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 43.56, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_021: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 39.16, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_024: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 30.36, projectileSpeed: 70, speedFactor: 1 }),
  pa_025: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 38.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_027: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 29.26, projectileSpeed: 70, speedFactor: 1 }),
  pa_033: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 27.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_034: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 34.76, projectileSpeed: 70, speedFactor: 1 }),
  pa_036: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 38.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_038: Object.freeze({ damage: 50, powerScore: 96.92 }),
  pa_042: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 55.44, projectileSpeed: 70, speedFactor: 1 }),
  pa_043: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 48.24, projectileSpeed: 70, speedFactor: 1 }),
  pa_045: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 53.64, projectileSpeed: 70, speedFactor: 1 }),
  pa_047: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 58.14, projectileSpeed: 70, speedFactor: 1 }),
  pa_050: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 56.34, projectileSpeed: 70, speedFactor: 1 }),
  pa_051: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 50.04, projectileSpeed: 70, speedFactor: 1 }),
  pa_059: Object.freeze({ damage: 55, powerScore: 55.23 }),
  pa_060: Object.freeze({ damage: 28, powerScore: 28.44 }),
  pa_068: Object.freeze({ damage: 50, powerScore: 47.88 }),
  pa_069: Object.freeze({ damage: 46, powerScore: 82.8 }),
  pa_083: Object.freeze({ damage: 50, maxRange: 578, powerScore: 52.56 }),
  pa_104: Object.freeze({ damage: 62, powerScore: 58.14 }),
  pa_118: Object.freeze({ damage: 52, maxRange: 485, powerScore: 118.5 }),
  pa_139: Object.freeze({ damage: 78, maxRange: 1040, powerScore: 161.67 }),
});

/**
 * Werte der Fassung 2 für die Waffen, die Fassung 3 verändert (`damage` und die
 * abgeleiteten `powerScore` und `maxRange`; Abklingzeit und Stufe bleiben gleich).
 */
export const WAFFEN_F2_WERTE = Object.freeze({
  pa_040: Object.freeze({ damage: 18, powerScore: 25.5 }),
  pa_120: Object.freeze({ damage: 55, powerScore: 60.53, maxRange: 513 }),
  pa_137: Object.freeze({ damage: 55, powerScore: 75.83, maxRange: 733 }),
});

/** Altwerte der durch die Balance-Korrektur geänderten Felder, je Waffe. */
export const WAFFEN_ALT_WERTE = Object.freeze({
  pa_001: Object.freeze({ damage: 28, powerScore: 50.2 }),
  pa_005: Object.freeze({ damage: 42, powerScore: 63.56 }),
  pa_006: Object.freeze({ damage: 20, powerScore: 52.36 }),
  pa_007: Object.freeze({ damage: 22, powerScore: 32.12 }),
  pa_009: Object.freeze({ damage: 30, powerScore: 60.61 }),
  pa_039: Object.freeze({ damage: 58, powerScore: 110.73 }),
  pa_040: Object.freeze({ damage: 14, powerScore: 20.5 }),
  pa_066: Object.freeze({ damage: 64, powerScore: 105.12 }),
  pa_140: Object.freeze({ damage: 72, powerScore: 73.36 }),
});

/**
 * Werte der Fassung 5 über dem Katalog (der Katalog bleibt Fassung 4): je Waffe die Felder, die
 * die Messung `scripts/waffen-balance.mjs` nachgezogen hat. Ältere Fassungen sehen sie nicht.
 */
/**
 * Fassung 7: vier Zündergranaten lagen nach der Korrektur der Armierung (Fassung 6) noch an der Schwäche-Grenze von 0,5 des
 * Stufenmedians (Messung `docs/balance-auslese/zuender-test.md`); sie bekommen etwa 15 % Schaden. Alles andere wie Fassung 6.
 */
export const WAFFEN_F7_WERTE = Object.freeze({
  pa_029: Object.freeze({ damage: 37 }), // Pömpel 32
  pa_030: Object.freeze({ damage: 48 }), // Impulsbombe 42
  pa_046: Object.freeze({ damage: 48 }), // Splittergranate 42
  pa_048: Object.freeze({ damage: 53 }), // Bananengranate 46
});

/**
 * Fassung 8 (Entscheidung nach den Balance-Auslesen, `docs/balance-auslese/`): Werte, die Auslesen als eindeutig auffällig fanden.
 * Brand deckelt bei 16 je Zug (ab Feuer 39), Eis friert in Fassung 2 nicht ein, Zahlen aus `elemental.md` Abschnitt 5.
 * Alles andere wie Fassung 7.
 */
export const WAFFEN_F8_WERTE = Object.freeze({
  pa_062: Object.freeze({ elemental: Object.freeze({ fire: 30, ice: 0, poison: 0 }) }), // Flammenwerfer: Feuer 45 lag über dem Brand-Deckel
  pa_068: Object.freeze({ damage: 46 }), // Plasmagewehr 54
  pa_074: Object.freeze({ damage: 34 }), // Verderbnissiegel 28
  pa_080: Object.freeze({ cooldown: 1 }), // Psionischer Tentakel: Abklingzeit 2
  pa_063: Object.freeze({ terrainDamage: 20 }), // Wasserwerfer: Gelände 42
  pa_071: Object.freeze({ elemental: Object.freeze({ fire: 0, ice: 30, poison: 0 }) }), // Eisschlag: Eis 50 (friert nicht ein)
});

/**
 * Fassung 10 (Entscheidung des Auftraggebers vom 2026-10-29: "Werte auseinanderziehen" und "ein Element hinein"):
 * Die Dubletten der Selbstwirkungen bekommen je einen eigenen Zweck. Das Feld `wirkung` (nur in dieser Schicht, nie im Katalog)
 * trägt, was `buildEffect` sonst aus festen Standardwerten nimmt:
 *   - `multiplier`, `turns`: Verstärkung (Dauer in Zügen; die Wirkung hält `turns - 1` eigene Züge, der Wurf selbst kostet den Zug)
 *   - `amount`: Heilung, Schild, Munition; `reduction`: Rüstung; `distance`: Versetzen und Haken; `pool`: Zufallswirkungen
 *   - `element`: `fire`, `ice`, `electric` oder `poison`. Verstärkung: jeder Treffer setzt zusätzlich Brand, Frost, Schock oder Gift.
 *     Schild: wer das Schild trifft, bekommt den Nachteil des Elements ab (`gegen`). Zufall: Verstärkungen und Schilde des Pools tragen es.
 * `cooldown` ist das Katalogfeld, das der Motor aus der Fassung liest (wie in Fassung 8). `damageType` folgt dem Element.
 * Munition (`maxAmmo`) bleibt im Katalog: Inventar und Start-Kits lesen sie fassungsunabhängig.
 * Werte in Zügen, Pixeln und Anteilen; die Staffelung steht in `docs/audit-waffen-2026-10-28.md` (Abschnitt "Fassung 10").
 */
const wirk = (wirkung, rest = {}) => Object.freeze({ ...rest, wirkung: Object.freeze(wirkung) });
export const WAFFEN_F10_WERTE = Object.freeze({
  // Verstärkung: kurz und stark gegen lang und schwach; jede mit einem Element
  pa_084: wirk({ multiplier: 1.7, turns: 2, element: 'fire' }, { cooldown: 2, damageType: 'fire' }), // Glutelixier: ein Schuss, Brand
  pa_095: wirk({ multiplier: 1.3, turns: 3, element: 'electric' }, { cooldown: 1, damageType: 'electric' }), // Sturmelixier: zwei Züge, Schock
  pa_099: wirk({ multiplier: 1.2, turns: 4, element: 'ice' }, { cooldown: 1, damageType: 'ice' }), // Frostsanduhr: drei Züge, Frost
  pa_109: wirk({ multiplier: 1.15, turns: 5, element: 'poison' }, { cooldown: 1, damageType: 'poison' }), // Giftbaum: vier Züge, Gift
  // Zufall: vier getrennte Pools
  pa_085: wirk({ element: 'fire', pool: ['damage_boost', 'armor', 'ammo'] }, { cooldown: 2, damageType: 'fire' }), // Feuermagier: Angriff
  pa_105: wirk({ element: 'ice', pool: ['shield', 'heal', 'armor'] }, { cooldown: 1, damageType: 'ice' }), // Frostrolle: Verteidigung
  pa_100: wirk({ element: 'electric', pool: ['damage_boost', 'move', 'ammo'] }, { cooldown: 1, damageType: 'electric' }), // Blitzwürfel: Tempo
  pa_096: wirk({ element: 'poison', pool: ['heal', 'move', 'damage_boost'] }, { cooldown: 1, damageType: 'poison' }), // Mutationselixier: Wandlung
  // Versetzen: klein und oft gegen weit und selten
  pa_089: wirk({ distance: 40 }, { cooldown: 0 }), // Zauberstiefel
  pa_087: wirk({ distance: 80 }), // Dimensionssprung (Pause 0, Munition 5)
  pa_110: wirk({ distance: 110 }), // Dimensionskugel (Pause 1)
  pa_088: wirk({ distance: 165 }), // Dimensionsriss (Pause 2, Munition 2)
  // Schild: Gegenwirkung auf den Angreifer
  pa_101: wirk({ amount: 55, element: 'ice', gegen: 'ice' }, { cooldown: 2, damageType: 'ice' }), // Eisschild: viel, Frost auf den Angreifer
  pa_093: wirk({ amount: 40, element: 'electric', gegen: 'electric' }, { cooldown: 1, damageType: 'electric' }), // Funkenschild: weniger, Schock
  // Heilung
  pa_092: wirk({ amount: 40 }, { cooldown: 0 }), // Heilzauber: wenig, jeden Zug
  pa_094: wirk({ amount: 70 }, { cooldown: 2 }), // Heilspritze: viel, selten
  // Fliegen und Haken
  pa_111: wirk({ distance: 45 }), // Enterhaken: kurzer Zug
  pa_112: wirk({ distance: 70 }), // Düsenrucksack: mittlerer Sprung
  pa_032: wirk({ distance: 100 }, { cooldown: 1 }), // Raketenrucksack: weit, mit Pause
  pa_114: wirk({ distance: 160 }), // Gleitschirm: am weitesten (Pause 2, Munition 3)
  pa_003: wirk({ distance: 60 }), // Hakenklinge: kurzer Zug, mehr Schaden
  pa_004: wirk({ distance: 150 }, { cooldown: 1 }), // Piratenhaken: weiter Zug, weniger Schaden
  // Weitere Versetzer unter den Gadgets
  pa_131: wirk({ distance: 50 }), // Schlauchboot
  pa_128: wirk({ distance: 90 }), // Hologrammportal
  pa_127: wirk({ distance: 120 }, { cooldown: 1 }), // Teleportplattform
  // Munition und Rüstung
  pa_119: wirk({ amount: 2 }), // Munitionskiste: klein
  pa_122: wirk({ amount: 3 }), // Endlosschleife
  pa_125: wirk({ amount: 4 }, { cooldown: 1 }), // Nachschubkiste: groß, mit Pause
  pa_130: wirk({ reduction: 0.2 }), // Tarnnetz: leichter Schutz
  pa_126: wirk({ reduction: 0.35 }), // Bunker: starker Schutz
});

export const WAFFEN_F5_WERTE = Object.freeze({
  pa_026: Object.freeze({ damage: 36 }),
  pa_041: Object.freeze({ damage: 48 }),
  pa_055: Object.freeze({ damage: 42 }),
  pa_059: Object.freeze({ damage: 41 }),
  pa_063: Object.freeze({ damage: 32 }),
  pa_071: Object.freeze({ damage: 55 }),
  pa_075: Object.freeze({ damage: 45 }),
  pa_097: Object.freeze({ damage: 30 }),
  pa_104: Object.freeze({ damage: 45 }),
  pa_140: Object.freeze({ damage: 47 }),
});

/**
 * Katalogwerte der Fassungen 1 bis 4 für die Felder, die die Auslese vom 2026-10-28 im Katalog verändert hat
 * (`AUSLESE_KORREKTUREN`, `KATALOG_F5_SCHADEN` und das `homing`-Gewicht in `scripts/build-weapon-catalog.mjs`;
 * Liste je Waffe alt -> neu in `docs/audit-waffen-2026-10-28.md`, Abschnitt "Umgesetzt (Auslese)").
 *
 * Die Auslese gleicht den KATALOG an das an, was der Motor in Fassung 5 liest (Spielwert, Strahlfelder,
 * Selbstwirkungen); sie ändert kein Gefecht. Die Fassungen 1 bis 4 lesen aber den Katalog selbst (Schaden der
 * Fernbüchse 65 statt 42, Radius der Alten Dame 30 statt 0): Sie bekommen diese Altwerte als unterste Schicht
 * zurück, damit ihre Aufzeichnungen und die Prüfsummen in `tests/waffen-fassung.test.js` Bit für Bit gelten.
 * Dazu gehören `powerScore` und `powerTier` (Anzeige und Beute lesen den Katalog, nicht diese Schicht).
 */
export const WAFFEN_F4_WERTE = Object.freeze({
  pa_026: Object.freeze({ damage: 18, powerScore: 76.56, powerTier: 'uncommon' }), // Pressluftbohrer
  pa_041: Object.freeze({ damage: 22, powerScore: 68.26, powerTier: 'uncommon' }), // Salvengeber
  pa_044: Object.freeze({ powerScore: 287.87, powerTier: 'legendary' }), // Phönixschlag
  pa_055: Object.freeze({ damage: 65, powerScore: 63.78, powerTier: 'uncommon' }), // Fernbüchse
  pa_059: Object.freeze({ damage: 66, powerScore: 64.64, powerTier: 'uncommon' }), // Armbrust
  pa_063: Object.freeze({ damage: 18, powerScore: 43.2, powerTier: 'common' }), // Wasserwerfer
  pa_071: Object.freeze({ damage: 42, powerScore: 97.88 }), // Eisschlag
  pa_075: Object.freeze({ damage: 18, powerScore: 82.4 }), // Tornado
  pa_081: Object.freeze({ blastRadius: 48, aoe: true, powerScore: 97.02, powerTier: 'rare' }), // Zauberbuch der Leere
  pa_083: Object.freeze({ knockback: 70, powerScore: 48.96, powerTier: 'uncommon' }), // Goldene Hand
  pa_085: Object.freeze({ blastRadius: 45, aoe: true, powerScore: 85.73, powerTier: 'rare' }), // Chaosmagier
  pa_086: Object.freeze({ blastRadius: 46, knockback: 78, aoe: true, powerScore: 92.21, powerTier: 'rare' }), // Windkrieger
  pa_090: Object.freeze({ blastRadius: 38, aoe: true, powerScore: 78.57, powerTier: 'uncommon' }), // Giftpilz
  pa_091: Object.freeze({ blastRadius: 55, aoe: true, powerScore: 105.08, powerTier: 'rare' }), // Astralkugel
  pa_097: Object.freeze({ damage: 38, powerScore: 34.2 }), // Traumfänger
  pa_098: Object.freeze({ blastRadius: 50, aoe: true, powerScore: 114.3, powerTier: 'rare' }), // Lavaelixier
  pa_102: Object.freeze({ blastRadius: 60, aoe: true, powerScore: 103.5, powerTier: 'rare' }), // Gedankensturm
  pa_103: Object.freeze({ blastRadius: 48, aoe: true, powerScore: 88.02, powerTier: 'rare' }), // Verderbniskelch
  pa_104: Object.freeze({ damage: 56, powerScore: 53.01, powerTier: 'uncommon' }), // Quantengewehr
  pa_106: Object.freeze({ blastRadius: 40, aoe: true, powerScore: 86.85, powerTier: 'rare' }), // Sonnenamulett
  pa_108: Object.freeze({ knockback: 55, powerScore: 33 }), // Zauberpeitsche
  pa_113: Object.freeze({ terrainDamage: 85, powerScore: 89.1, powerTier: 'rare' }), // Bohrkanone
  pa_115: Object.freeze({ damage: 28, damageSource: 'source', powerScore: 30.8 }), // Wächterstatue
  pa_116: Object.freeze({ blastRadius: 55, aoe: true, elemental: Object.freeze({ fire: 0, ice: 0, poison: 35 }), powerScore: 124.99, powerTier: 'rare' }), // Blutritual
  pa_121: Object.freeze({ blastRadius: 35, knockback: 88, aoe: true, powerScore: 109.21, powerTier: 'rare' }), // Raketenfaust
  pa_122: Object.freeze({ damage: 32, damageSource: 'derived', powerScore: 35.2 }), // Endlosschleife
  pa_123: Object.freeze({ blastRadius: 45, knockback: 95, aoe: true, powerScore: 100.63, powerTier: 'rare' }), // Magnetkanone
  pa_125: Object.freeze({ damage: 31, damageSource: 'derived', powerScore: 34.1 }), // Nachschubkiste
  pa_126: Object.freeze({ damage: 27, damageSource: 'derived', terrainDamage: 20, powerScore: 42.9 }), // Bunker
  pa_127: Object.freeze({ damage: 34, damageSource: 'derived', powerScore: 37.4 }), // Teleportplattform
  pa_128: Object.freeze({ damage: 30, damageSource: 'derived', powerScore: 33 }), // Hologrammportal
  pa_129: Object.freeze({ blastRadius: 52, aoe: true, powerScore: 98, powerTier: 'rare' }), // Tesla-Turm
  pa_130: Object.freeze({ damage: 33, damageSource: 'derived', powerScore: 36.3 }), // Tarnnetz
  pa_131: Object.freeze({ damage: 29, damageSource: 'derived', powerScore: 31.9 }), // Schlauchboot
  pa_132: Object.freeze({ blastRadius: 30, knockback: 82, aoe: true, powerScore: 101.32, powerTier: 'rare' }), // Alte Dame
  pa_133: Object.freeze({ powerScore: 463.82, powerTier: 'legendary' }), // Fliegendes Superschaf
  pa_134: Object.freeze({ blastRadius: 65, aoe: true, powerScore: 127.96, powerTier: 'rare' }), // Luftangriff
  pa_135: Object.freeze({ blastRadius: 55, aoe: true, powerScore: 125.48, powerTier: 'rare' }), // Meteorregen
  pa_136: Object.freeze({ blastRadius: 48, terrainDamage: 65, aoe: true, powerScore: 154.24, powerTier: 'epic' }), // Bohrkopfrakete
  pa_138: Object.freeze({ blastRadius: 45, knockback: 78, aoe: true, powerScore: 120.02, powerTier: 'rare' }), // Arkanhammer
  pa_139: Object.freeze({ blastRadius: 58, aoe: true, powerScore: 151.77, powerTier: 'epic' }), // Höllenkanone
  pa_140: Object.freeze({ damage: 60, powerScore: 62.07 }), // Quantenkanone
});

/**
 * Die Waffe mit den Katalogwerten VOR der Auslese (Stand der Fassung 4, ohne die Schadensarten von
 * `ARTEN_BIS_F4`). Die Start-Kits lesen Stufe, Schaden und Radius direkt aus dem Katalog, um ihre Pools zu
 * bilden (`loadouts.js`); damit eine Aufzeichnung mit `kit` 1 bis 4 dieselben Startwaffen bekommt wie vorher,
 * lesen sie diese eingefrorene Sicht und nicht den angeglichenen Katalog.
 *
 * @param {object} waffe - Katalogeintrag
 * @returns {object}
 */
export function waffeVorAuslese(waffe) {
  const alt = WAFFEN_F4_WERTE[waffe.id];
  return alt ? { ...waffe, ...alt } : waffe;
}

/**
 * Schadensarten der Fassungen 1 bis 4 (Namens- und Artendurchsicht 2026-10-28).
 *
 * Im Katalog stehen seitdem die zutreffenderen Arten: Raketenrucksack `utility` (Fluggerät, wie
 * Jetpack und Gleitschirm), Salvengeber `explosive` (kleine Rakete mit Sprengradius), Astraltrank
 * `astral` (heißt Astral, gleiche Familie `magie`) und Endlosschleife `time` (das alte `temporal`
 * war dieselbe Art wie `time`). Aufzeichnungen der Fassungen 1 bis 4 laufen mit der alten Art
 * weiter (AGENTS.md §2); erst die Fassung 5 liest die neue.
 */
export const ARTEN_BIS_F4 = Object.freeze({
  pa_032: Object.freeze({ damageType: 'physical' }),
  pa_041: Object.freeze({ damageType: 'physical' }),
  pa_084: Object.freeze({ damageType: 'arcane' }),
  pa_122: Object.freeze({ damageType: 'temporal' }),
});

const zwischenspeicher = new Map();

/**
 * Die Waffe in der Fassung eines Matches. Fassung 4 ist der Katalog selbst; ab Fassung 5 liegen die Werte aus `WAFFEN_F5_WERTE` darüber (Fassung 6 teilt sie, ihr Unterschied ist die Zünderregel des Motors); Fassung 3
 * legt `WAFFEN_F3_WERTE` darüber, Fassung 2 zusätzlich `WAFFEN_F2_WERTE`, Fassung 1 zusätzlich die Altwerte (je einmal
 * berechnet, eingefroren).
 *
 * @param {string} id
 * @param {number} [fassung]
 * @returns {object|null}
 */
export function getWaffe(id, fassung = WAFFEN_STANDARD) {
  const waffe = waffeDerFassung(id, fassung);
  if (!waffe || fassung < WAFFEN_WIND) return waffe;
  /*
   * Fassung 14 (AERO): Der Windfaktor kommt aus der Fassungsschicht
   * `WINDFAKTOR_JE_WAFFE` — die Katalogeinträge selbst bleiben unverändert, damit
   * die Prüfsummen und die Objekt-Identität der alten Fassungen gelten
   * (tests/waffen-fassung.test.js). Der Motor liest das Feld erst, wenn
   * `config.wind` mindestens 2 ist (`shooting.js`, `windFaktorFuerWaffe`).
   */
  const faktor = WINDFAKTOR_JE_WAFFE[id];
  if (faktor === undefined || waffe.landetAls) return waffe; // Fassung 22: die Wurfmine trägt ihren Windfaktor selbst
  const schluessel = `${fassung}:${id}`;
  let mitWind = windZwischenspeicher.get(schluessel);
  if (!mitWind) {
    mitWind = Object.freeze({ ...waffe, windFactor: faktor });
    windZwischenspeicher.set(schluessel, mitWind);
  }
  return mitWind;
}

const windZwischenspeicher = new Map();

/** Die Waffe in einer bereits geprüften Fassung (ohne die Windfaktor-Schicht). */
function waffeDerFassung(id, fassung) {
  const waffe = getWeapon(id);
  if (!waffe) return waffe;
  if (fassung >= WAFFEN_FAIR) {
    const f5 = WAFFEN_F5_WERTE[id];
    const f7 = fassung >= WAFFEN_ZUENDERPLUS ? WAFFEN_F7_WERTE[id] : null;
    const f8 = fassung >= WAFFEN_FEINTUNING ? WAFFEN_F8_WERTE[id] : null;
    const f10 = fassung >= WAFFEN_SPREIZUNG ? WAFFEN_F10_WERTE[id] : null;
    const f11 = fassung >= WAFFEN_MUNITION ? WAFFEN_F11_WERTE[id] : null;
    const f12 = fassung >= WAFFEN_MINE ? WAFFEN_F12_WERTE[id] : null;
    const f15 = fassung >= WAFFEN_TEMPO ? WAFFEN_F15_WERTE[id] : null;
    const f19 = fassung >= WAFFEN_STREU ? WAFFEN_F19_WERTE[id] : null;
    const f20 = fassung >= WAFFEN_FEUERWESEN ? WAFFEN_F20_WERTE[id] : null;
    const f21 = fassung >= WAFFEN_ENTSCHEIDUNG ? WAFFEN_F21_WERTE[id] : null;
    const f22 = fassung >= WAFFEN_WURF ? WAFFEN_F22_WERTE[id] : null;
    if (!f5 && !f7 && !f8 && !f10 && !f11 && !f12 && !f15 && !f19 && !f20 && !f21 && !f22) return waffe;
    const schluessel5 = `${fassung}:${id}`;
    let kopie5 = zwischenspeicher.get(schluessel5);
    if (!kopie5) {
      // `wirkung` der Fassung 11 ergänzt die der Fassung 10 (Weite, Menge, Pause bleiben), ersetzt sie nicht.
      const wirkung = f10?.wirkung && f11?.wirkung ? { wirkung: Object.freeze({ ...f10.wirkung, ...f11.wirkung }) } : {};
      kopie5 = Object.freeze({ ...waffe, ...f5, ...f7, ...f8, ...f10, ...f11, ...f12, ...wirkung, ...f15, ...f19, ...f20, ...f21, ...f22 });
      zwischenspeicher.set(schluessel5, kopie5);
    }
    return kopie5;
  }
  const art = ARTEN_BIS_F4[id];
  const f4 = WAFFEN_F4_WERTE[id];
  if (fassung === WAFFEN_FEIN && !art && !f4) return waffe;
  const f3 = fassung === WAFFEN_FEIN ? null : WAFFEN_F3_WERTE[id];
  const f2 = fassung <= WAFFEN_BALANCE ? WAFFEN_F2_WERTE[id] : null;
  const alt = fassung === WAFFEN_ALT ? WAFFEN_ALT_WERTE[id] : null;
  if (!f4 && !f3 && !f2 && !alt && !art) return waffe;
  const schluessel = `${fassung}:${id}`;
  let kopie = zwischenspeicher.get(schluessel);
  if (!kopie) {
    kopie = Object.freeze({ ...waffe, ...f4, ...f3, ...f2, ...alt, ...art });
    zwischenspeicher.set(schluessel, kopie);
  }
  return kopie;
}
