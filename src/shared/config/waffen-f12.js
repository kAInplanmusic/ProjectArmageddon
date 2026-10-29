/**
 * Werte der Waffenfassung 12 über der Fassung 11 (Entscheidung des Auftraggebers vom 2026-10-29).
 *
 * MINE: Die Teleportplattform (`pa_127`) wird zur Mine. Der Auftraggeber wollte KEINE neue Waffe, sondern die Daten einer
 * vorhandenen tauschen und nannte ihr Bild (graue Gerätekiste mit blauer Linse auf einer Plattform) als Mine. Katalogzahl 150,
 * Beutetopf, Munitionsklasse (5), Seltenheit (rare) und Gadget-Gruppe bleiben; alte Partien (Fassung bis 11) behalten ihre
 * Teleportplattform unverändert.
 *
 * `special: 'mine'` ist eine SELBSTWIRKUNG wie das Wachgeschütz: Es wird kein Geschoss verschossen, die Mine entsteht auf dem Boden
 * vor der Figur, in Blickrichtung des Zielwinkels. Die Kraft bestimmt die Entfernung (`MINEN.wurfWeite` je Kraftpunkt, mindestens
 * `MINEN.ablegeAbstand`): kurz = abgelegt, weit = abgeworfen. Das ist ein Platzieren, kein Flug über eine Bahn.
 * Die Mine ist SOFORT scharf; Friendly Fire gilt; je Auslösung 80 % normal, 5 % doppelter Schaden, 15 % Blindgänger. Schaden und
 * Radius stehen in `MINEN` (`config/bodenobjekte.js`), nicht hier. Ohne Bodenobjektfassung 2 (`config.bodenobjekte`) gibt es kein
 * Minensystem: dann meldet die Waffe, dass sie nichts legen kann.
 *
 * @module config/waffen-f12
 */
export const MINEN_WAFFE_ID = 'pa_127';

export const WAFFEN_F12_WERTE = Object.freeze({
  [MINEN_WAFFE_ID]: Object.freeze({
    displayName: 'Mine',
    description: 'Wird vor die Füße gelegt oder weiter geworfen, bleibt liegen und ist sofort scharf. Wer sie berührt, löst sie aus, auch du. Selten ein Blindgänger, selten doppelt stark.',
    special: 'mine',
    // Keine Entfernung wie bei der Plattform: Die Wirkung kommt aus `MINEN`.
    wirkung: Object.freeze({}),
  }),
});
