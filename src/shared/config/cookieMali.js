/**
 * Cookies Mali — die 30 benannten Unglücke der Fassung 4 (`config.cookie` = 4).
 *
 * ## Warum eine eigene Datei
 *
 * `cookie.js` beschreibt Hunger, Wut, Pflege und Spielen — also das Verhalten
 * des Katers. Diese Datei beschreibt, was er einem Spieler antut, der ihn
 * anfasst. Getrennt, weil die Liste reine Inhaltsdaten ist und wachsen soll,
 * ohne dass die Hungeruhr daneben unlesbar wird. `cookie.js` reicht sie als
 * `COOKIE_MALI` weiter.
 *
 * ## Aufbau eines Eintrags
 *
 *   id          Kennung im Replay und in Ereignissen (stabil)
 *   name        deutscher Name für das HUD
 *   erklaerung  EIN Satz ohne Zahlen; die Zahlen stehen in `wirkung`
 *   weight      Auswahlgewicht (Summe 100)
 *   stufe       common | uncommon | rare | epic | legendary
 *   wirkung     `{art, …}` — eine Wirkungsart aus `engine/tierWirkung.js`
 *
 * ## Warum Fassung 4
 *
 * Cookie berührt Spieler schon in Fassung 2 (Füttern). Erst ab Fassung 4 hängt
 * an dieser Berührung ein Malus. Fassung 1–3 bleiben damit Bit für Bit, was sie
 * waren — die Marke im Replay-Kopf entscheidet (AGENTS.md §2).
 *
 * ## Die Zugzeit
 *
 * `zugzeit` mit `faktor` unter 1 verkürzt die Zugzeit der BETROFFENEN Figur,
 * nicht des ganzen Zuges (docs/anforderungen-2026-11-05.md §5). Der Malus hängt
 * an der Figur und trifft keine Mitspieler.
 *
 * @module config/cookieMali
 */

/** Erlaubte Seltenheitsstufen (dieselben wie `powerTier`). */
export const COOKIE_MALUS_STUFEN = Object.freeze([
  'common', 'uncommon', 'rare', 'epic', 'legendary',
]);

/**
 * Die 30 Mali.
 *
 * Alle Wirkungen sind unangenehm bis gemein — Cookie verteilt Schlechtes. Die
 * Wirkungsarten sind dieselben wie bei den Perks (`engine/tierWirkung.js`):
 * Schaden, Brand, Lähmung, Verlangsamung, Einfrieren, Aufdecken, Zielhilfe,
 * Zugzeit, Wind, Stoß, Kiste, Krater, Waffe und Munition.
 */
export const COOKIE_MALI = Object.freeze([
  {
    id: 'kurze_zugzeit', name: 'Kurze Zugzeit', weight: 9, stufe: 'common',
    erklaerung: 'Cookie sitzt auf der Uhr und lässt dich nicht ausdenken.',
    wirkung: { art: 'zugzeit', faktor: 0.8, zuege: 1 },
  },
  {
    id: 'pfote_auf_der_waffe', name: 'Pfote auf der Waffe', weight: 6, stufe: 'common',
    erklaerung: 'Er schlägt dir die Waffe aus der Hand, und sie ist weg.',
    wirkung: { art: 'waffeWeg' },
  },
  {
    id: 'verpufft', name: 'Verpuffte Ladung', weight: 6, stufe: 'common',
    erklaerung: 'Die Munition zischt davon, ohne dass du geschossen hast.',
    wirkung: { art: 'munitionWeg', menge: 1 },
  },
  {
    id: 'wind_gegen', name: 'Wind gegen dich', weight: 5, stufe: 'common',
    erklaerung: 'Er pustet in die falsche Richtung und dreht dir den Wind um.',
    wirkung: { art: 'wind' },
  },
  {
    id: 'kratzer', name: 'Kratzer', weight: 5, stufe: 'common',
    erklaerung: 'Ein Tatzenhieb aus dem Nichts trifft dich am Arm.',
    wirkung: { art: 'schaden', betrag: 8 },
  },
  {
    id: 'kratzspur', name: 'Kratzspur', weight: 4, stufe: 'common',
    erklaerung: 'Es brennt und will nicht aufhören.',
    wirkung: { art: 'brand', betrag: 3, zuege: 3, element: 'neutral' },
  },
  {
    id: 'schwere_pfoten', name: 'Schwere Pfoten', weight: 5, stufe: 'common',
    erklaerung: 'Du kommst kaum noch vom Fleck.',
    wirkung: { art: 'verlangsamung', faktor: 0.6, zuege: 2 },
  },
  {
    id: 'sternenschlaf', name: 'Sternenschlaf', weight: 3, stufe: 'uncommon',
    erklaerung: 'Für einen Zug bist du wie betäubt und setzt aus.',
    wirkung: { art: 'einfrieren', zuege: 1 },
  },
  {
    id: 'aufgedeckt', name: 'Aufgedeckt', weight: 4, stufe: 'common',
    erklaerung: 'Er verrät deine Position an alle, die gerade hinsehen.',
    wirkung: { art: 'aufdecken', zuege: 2 },
  },
  {
    id: 'blindflug', name: 'Blindflug', weight: 5, stufe: 'common',
    erklaerung: 'Deine Zielhilfe verschwimmt zu einem kurzen Stummel.',
    wirkung: { art: 'zielhilfe', faktor: 0.5, zuege: 2 },
  },
  {
    id: 'katzensprung', name: 'Katzensprung', weight: 4, stufe: 'common',
    erklaerung: 'Er rempelt dich an, und du stehst plötzlich woanders.',
    wirkung: { art: 'stoss', vx: 5, vy: -4 },
  },
  {
    id: 'kiste_im_wasser', name: 'Kiste im Wasser', weight: 3, stufe: 'uncommon',
    erklaerung: 'Deine nächste Beute versinkt, ehe du sie erreichen kannst.',
    wirkung: { art: 'kisteWeg' },
  },
  {
    id: 'boden_bricht', name: 'Boden bricht weg', weight: 3, stufe: 'uncommon',
    erklaerung: 'Unter dir tut sich ein Loch auf.',
    wirkung: { art: 'krater', radius: 18, tiefe: 40 },
  },
  {
    id: 'katerkralle', name: 'Katerkralle', weight: 3, stufe: 'uncommon',
    erklaerung: 'Ein tiefer Kratzer, der lange zu spüren ist.',
    wirkung: { art: 'schaden', betrag: 12 },
  },
  {
    id: 'haarballen', name: 'Haarballen', weight: 3, stufe: 'common',
    erklaerung: 'Er würgt einen Haarballen aus und du stehst im Weg.',
    wirkung: { art: 'brand', betrag: 2, zuege: 4, element: 'neutral' },
  },
  {
    id: 'seil_reisst', name: 'Seil gerissen', weight: 2, stufe: 'uncommon',
    erklaerung: 'Dein Seil hängt schlaff herunter und lässt dich fallen.',
    wirkung: { art: 'stoss', vx: -4, vy: 2 },
  },
  {
    id: 'hungriger_schatten', name: 'Hungriger Schatten', weight: 3, stufe: 'common',
    erklaerung: 'Er läuft dir nach und zehrt an deiner Kraft.',
    wirkung: { art: 'brand', betrag: 2, zuege: 2, element: 'neutral' },
  },
  {
    id: 'giftkralle', name: 'Giftkralle', weight: 2, stufe: 'uncommon',
    erklaerung: 'Die Kralle brennt noch lange nach.',
    wirkung: { art: 'brand', betrag: 4, zuege: 2, element: 'neutral' },
  },
  {
    id: 'taube_ohren', name: 'Taube Ohren', weight: 3, stufe: 'common',
    erklaerung: 'Sein Miauen übertönt alles, und jeder weiß, wo du stehst.',
    wirkung: { art: 'aufdecken', zuege: 1 },
  },
  {
    id: 'frostpfote', name: 'Frostpfote', weight: 2, stufe: 'uncommon',
    erklaerung: 'Eisige Pfoten bremsen dich fast bis zum Stillstand.',
    wirkung: { art: 'verlangsamung', faktor: 0.4, zuege: 2 },
  },
  {
    id: 'lange_nacht', name: 'Lange Nacht', weight: 3, stufe: 'uncommon',
    erklaerung: 'Du brauchst für alles länger, weil er dir auf dem Schoß sitzt.',
    wirkung: { art: 'zugzeit', faktor: 0.7, zuege: 2 },
  },
  {
    id: 'zerbrochene_linse', name: 'Zerbrochene Linse', weight: 2, stufe: 'rare',
    erklaerung: 'Deine Zielhilfe ist nur noch ein Schatten ihrer selbst.',
    wirkung: { art: 'zielhilfe', faktor: 0.3, zuege: 3 },
  },
  {
    id: 'kistenraub', name: 'Kistenraub', weight: 2, stufe: 'uncommon',
    erklaerung: 'Er schleppt deine Kiste fort, während du zielst.',
    wirkung: { art: 'kisteWeg' },
  },
  {
    id: 'schwarze_tatze', name: 'Schwarze Tatze', weight: 2, stufe: 'uncommon',
    erklaerung: 'Ein Schlag, den du nicht kommen sahst.',
    wirkung: { art: 'schaden', betrag: 15 },
  },
  {
    id: 'wutkratzer', name: 'Wutkratzer', weight: 2, stufe: 'uncommon',
    erklaerung: 'Er tobt an dir aus, obwohl du ihm nichts getan hast.',
    wirkung: { art: 'schaden', betrag: 10 },
  },
  {
    id: 'lahme_pfote', name: 'Lahme Pfote', weight: 2, stufe: 'rare',
    erklaerung: 'Du humpelst dem ganzen Zug hinterher.',
    wirkung: { art: 'verlangsamung', faktor: 0.5, zuege: 3 },
  },
  {
    id: 'sternenstaub', name: 'Sternenstaub', weight: 2, stufe: 'rare',
    erklaerung: 'Alles dreht sich, und du stehst für einen Zug nur da.',
    wirkung: { art: 'einfrieren', zuege: 1 },
  },
  {
    id: 'leere_tasche', name: 'Leere Tasche', weight: 2, stufe: 'rare',
    erklaerung: 'Dein Vorrat ist weg, als hätte ihn jemand ausgeleckt.',
    wirkung: { art: 'munitionWeg', menge: 3 },
  },
  {
    id: 'erdloch', name: 'Erdloch', weight: 2, stufe: 'rare',
    erklaerung: 'Unter deinen Füßen bricht der Boden großflächig weg.',
    wirkung: { art: 'krater', radius: 26, tiefe: 60 },
  },
  {
    id: 'katzenfluch', name: 'Katzenfluch', weight: 1, stufe: 'rare',
    erklaerung: 'Für eine Weile läuft alles gegen dich, auch die eigene Uhr.',
    wirkung: { art: 'zugzeit', faktor: 0.6, zuege: 2 },
  },
]);

/** Gewichtssumme (muss 100 sein). */
export const COOKIE_MALUS_TOTAL = COOKIE_MALI.reduce((summe, m) => summe + m.weight, 0);

/** Kennungen in Listenreihenfolge (Draht- und Testreihenfolge). */
export const COOKIE_MALUS_IDS = Object.freeze(COOKIE_MALI.map(m => m.id));

/**
 * Zieht einen Malus nach Gewicht.
 *
 * @param {{next:()=>number}} rng - Teilgenerator `COOKIE`
 * @returns {object} Malus-Eintrag
 */
export function waehleCookieMalus(rng) {
  const wurf = rng.next() * COOKIE_MALUS_TOTAL;
  let summe = 0;
  for (const malus of COOKIE_MALI) {
    summe += malus.weight;
    if (wurf < summe) return malus;
  }
  return COOKIE_MALI[0];
}

export default COOKIE_MALI;
