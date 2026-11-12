/**
 * Waffenfassung 22 (Auftrag des Auftraggebers vom 2026-11-12): Wurfmine und Wurffass fliegen im Bogen wie ein Stein.
 *
 * Bis Fassung 21 wurde die Mine (`pa_127`) nur auf den Boden gelegt (Selbstwirkung, keine Flugbahn, `bodenobjektSystem.wirf`).
 * Ab Fassung 22 ist sie ein gewöhnliches Wurfgeschoss mit Schwerkraft und Wind (Werte wie die Handgranate `pa_047`:
 * Tempo 56, Schwerkraftfaktor 1,2, Windfaktor 0,6). Beim ersten Aufprall (Gelände oder Figur) explodiert sie NICHT: das
 * Geschoss verschwindet, an der Aufprallstelle liegt eine scharfe Mine (`BodenobjektSystem#setzeAn`, Art „abgeworfen“, freier
 * trockener Platz in der Nähe). Fällt sie ins Wasser oder ist die Karte voll, entsteht nichts.
 *
 * Das Feld `landetAls` ('mine' | 'fass') ist die allgemeine Fähigkeit: Eine Waffe mit `landetAls: 'fass'` würde ein Fass werfen
 * (Datenänderung, keine Regel). Es gibt dafür noch keine Waffe: der Katalog hat genau 150 Plätze und es wurde keine
 * bestehende Waffe zugunsten eines Fasses entfernt (offene Frage an den Auftraggeber, `docs/waffen-entscheidungen-2026-11-11.md`).
 *
 * Fassungen 1 bis 21 bleiben bitgleich (`tests/waffen-fassung22.test.js`).
 *
 * @module shared/config/waffen-f22
 */

export const WURFMINE_ID = 'pa_127';

export const WAFFEN_F22_WERTE = Object.freeze({
  pa_127: Object.freeze({
    description: 'Wird im Bogen geworfen wie ein Stein (Schwerkraft und Wind), bleibt beim Aufprall liegen und ist sofort scharf. Wer sie berührt, löst sie aus, auch du. Selten ein Blindgänger, selten doppelt stark.',
    delivery: 'projectile',
    special: 'direct_hit',
    targeting: 'directional',
    projectileSpeed: 56,
    gravityScale: 1.2,
    windFactor: 0.6,
    speedFactor: 0.8,
    maxRange: 313,
    landetAls: 'mine',
  }),
});
