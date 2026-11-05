/**
 * Waffenfassung 15 (GP-4 Tempo): Schaden je Waffenkategorie.
 *
 * Ziel des Pakets GP-4 (`docs/plan-produktion.md`): Eine Figur soll nach **3 bis 4
 * guten Treffern** fallen. Die Lebenspunkte bleiben, wo sie sind (Klassenfassung 3:
 * Nahkampf 130, Fernkampf 100, Okkultist 70) — angehoben wird der Schaden, und zwar
 * als **eigene Datenschicht über dem Katalog**. `config/weapons.js` bleibt
 * unverändert, damit die Fassungen 1 bis 14 Bit für Bit dieselben Werte lesen
 * (Prüfsummen in `tests/waffen-fassung.test.js`).
 *
 * ## Was die Messung zeigte (vorher)
 *
 * `scripts/waffen-balance.mjs` misst je Waffe den besten Treffer auf der besten
 * Entfernung gegen ein stehendes Ziel (Gesundheit je Klasse) und daraus die
 * Schüsse bis Sieg (STK). Vorher, Median über die 112 Waffen mit Schaden am Ziel:
 *
 *   Klasse        Nahkampf 5 · Fernkampf 4 · Okkultist 3
 *   Kategorie     melee 5 · ranged 6,5 · heavy_ranged 4 · elemental 3 ·
 *                 magic 3 · utility 3 · tech 2 · ultimate 2
 *
 * Der Median lag also schon im Band — aber die **langsame Hälfte** lag darüber:
 * Fernkampf brauchte 6,5 Treffer, Nahkampf 5, und die schwächsten Vertreter bis
 * zu 12. Die Zahl „37" aus `docs/plan-produktion.md` stammt aus einer anderen
 * Messung (200 LP, feste 854 px, `scripts/balance-report.mjs`): Dort erreichen
 * **98 von 112** Waffen die Messdistanz gar nicht und zählen als „ohne Schaden" —
 * die 37 misst also „Schüsse auf eine Entfernung, für die die halbe Waffe nicht
 * gebaut ist", nicht „gute Treffer" (Herleitung:
 * `docs/balance-tempo-2026-11-05.md` §2).
 *
 * ## Warum Faktoren je Kategorie und nicht je Waffe
 *
 * Der Katalog ist in acht Kategorien sortiert, die im Spiel dieselbe Rolle tragen
 * (Nahkampf, Fernkampf, Lenkwaffen, Elementar, Magie, Werkzeug, Technik, Ultimativ).
 * Ein Faktor je Kategorie verschiebt die ganze Gruppe gleichmäßig: Die Abstände
 * INNERHALB einer Kategorie bleiben erhalten (die Balance-Auslesen der Fassungen
 * 5 bis 10 gelten weiter), und nur das Verhältnis zwischen den Rollen wird neu
 * justiert. Ein Faktor je Waffe hätte 150 Einzelentscheidungen gebraucht und die
 * mühsam ausgemessene Staffelung wieder eingeebnet.
 *
 * Angehoben werden nur die Kategorien, die ÜBER dem Zielband lagen. Die schnellen
 * Kategorien (`elemental`, `magic`, `utility`, `tech`, `ultimate`) bleiben
 * unverändert: Sie lagen mit 2 bis 3 Treffern schon im oder unter dem Band, und
 * eine Anhebung hätte sie in den Ein- bis Zwei-Treffer-Bereich geschoben — also
 * genau das Gegenteil von „3 bis 4 gute Treffer".
 *
 * ## Die zwei Grenzen
 *
 * 1. **Kein Ein-Treffer-Kill.** `EIN_TREFFER_GRENZE` = 79 Schaden: Die
 *    100-LP-Figur (Fernkampf) überlebt einen Treffer auch dann, wenn der Schütze
 *    der stärkste Schütze ist (Okkultist, Schadensfaktor 1,25 → 98,75). Die
 *    Grenze greift bei den stärksten Waffen der angehobenen Kategorien (z. B.
 *    Raketenwerfer 62 → 124, gedeckelt auf 79).
 * 2. **Ultimative Waffen bleiben unverändert** (Faktor 1,0). Sie treffen schon in
 *    Fassung 14 mit einem bis zwei Schüssen und sind die Ausnahme, die das Spiel
 *    benennt; Fassung 15 erzeugt dadurch keine NEUEN Ein-Treffer-Kills.
 *
 * Flächenwaffen (`blastRadius > 0`) bekommen denselben Faktor wie ihre Kategorie.
 * Der Selbstschaden eigener Flächenwirkung ist seit Fassung 5 auf
 * `SELBSTSCHADEN_GRENZE` (40 % der Höchstgesundheit) gedeckelt — ein stärkerer
 * Flächenschuss trifft den Schützen also nicht härter als vorher, solange die
 * Grenze greift. Der Anteil Flächenschaden am Gesamtschaden wird in
 * `docs/balance-tempo-2026-11-05.md` vorher/nachher ausgewiesen.
 *
 * @module config/waffen-f15
 */
import { WEAPONS } from './weapons.js';

/**
 * Schadensfaktor je Katalogkategorie. Hergeleitet aus der Messung
 * `docs/balance-auslese/waffen-vorher.json` (Median Schüsse bis Sieg je Kategorie,
 * 100-LP-Ziel) — die Herleitung steht in `docs/balance-tempo-2026-11-05.md`.
 */
export const TEMPO_FAKTOREN = Object.freeze({
  melee: 1.5,
  ranged: 2.0,
  heavy_ranged: 1.3,
  elemental: 1,
  magic: 1,
  utility: 1,
  tech: 1,
  ultimate: 1,
});

/** Obergrenze des Schadens je Treffer (siehe Kopfkommentar, Punkt 1). */
export const EIN_TREFFER_GRENZE = 79;

/**
 * Der Schadenswert einer Waffe in Fassung 15.
 *
 * Gerundet wird kaufmännisch auf ganze Punkte — dieselbe Auflösung wie der
 * Katalog. Eine Waffe mit Schaden > 0 verliert durch die Fassung nie Schaden:
 * Der Faktor ist je Kategorie ≥ 1, und `Math.round` kann höchstens einen Punkt
 * unter dem Ausgangswert landen (bei Faktor 1,0 und krummen Werten) — deshalb
 * die Untergrenze `waffe.damage`.
 *
 * @param {{category: string, damage: number}} waffe - Katalogeintrag
 * @returns {number} Schaden in Fassung 15
 */
export function tempoSchaden(waffe) {
  const basis = waffe.damage ?? 0;
  if (!(basis > 0)) return basis;
  const faktor = TEMPO_FAKTOREN[waffe.category] ?? 1;
  if (faktor <= 1) return basis;
  const angehoben = Math.max(basis, Math.round(basis * faktor));
  return Math.min(angehoben, Math.max(basis, EIN_TREFFER_GRENZE));
}

/**
 * Die Fassungsschicht: je Waffe nur das Feld, das sich ändert (`damage`).
 * Der Motor liest sie ausschließlich ab Fassung 15 (`getWaffe` in
 * `config/waffen-fassung.js`); ältere Fassungen sehen sie nicht.
 */
export const WAFFEN_F15_WERTE = Object.freeze(Object.fromEntries(
  WEAPONS
    .filter(waffe => tempoSchaden(waffe) !== (waffe.damage ?? 0))
    .map(waffe => [waffe.id, Object.freeze({ damage: tempoSchaden(waffe) })]),
));
