/**
 * Kartenstart: Standplatz auf trockenem Grund und Erreichbarkeitsprüfung.
 *
 * Aus `match.js` herausgezogen (Zeilenbudget, AGENTS.md §3) — ohne Verhaltensänderung. Beide Funktionen lesen das
 * Match nur über öffentliche Zugriffe; Zufall kommt hier nicht vor.
 *
 * @module karteStart
 */

import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { WET_LEVEL } from '../shared/config/water.js';
import { GELAENDE_KOMPOSITION } from '../shared/config/gelaende.js';
import {
  pruefeErreichbarkeit, maxWurfweite, abstandZumNaechstenGegner,
} from '../shared/erreichbarkeit.js';
import { weitenFaktor } from '../shared/reichweite.js';
import { POWER_TO_SPEED } from '../shared/ballistics.js';
import { DEFAULT_PROJECTILE_GRAVITY } from './systems/projectileSystem.js';

/**
 * Sucht eine Startposition auf festem, nicht überflutetem Grund.
 *
 * Gesucht wird abwechselnd nach rechts und links vom Wunschpunkt, in festen
 * Schritten. Die Reihenfolge ist festgelegt (rechts vor links, kleine vor
 * großen Abständen), damit die Platzierung bei gleichem Seed dieselbe bleibt —
 * der Determinismus des Matches hängt daran.
 *
 * Maßstab ist `WET_LEVEL`: Eine Figur, die nur „nass" startet, ist spielbar;
 * eine untergetauchte ertrinkt, bevor der erste Zug beginnt.
 *
 * Wird nichts gefunden, bleibt es beim Wunschpunkt. Ein schlechter Platz ist
 * besser als gar keiner — und ein Fehlen wird im Test auffallen.
 *
 * @param {object} m Match (nur öffentliche Zugriffe: width, surfaceYAt, waterLevelAt)
 * @param {number} idealX
 * @returns {number} x-Position mit festem, trockenem Boden
 */
export function trockenerStartX(m, idealX, belegt = []) {
  const frei = x => belegt.every(b => Math.abs(b - x) >= 2 * PLAYER_HALF_WIDTH + 8); // keine Stapelung
  const trocken = x => {
    if (!frei(x)) return false;
    if (x < PLAYER_HALF_WIDTH + 2 || x > m.width - PLAYER_HALF_WIDTH - 2) return false;
    const boden = m.surfaceYAt(x);
    if (boden <= 0) return false;
    if (m.waterLevelAt(x, boden) >= WET_LEVEL) return false;
    /*
     * Der KÖRPER steht höher als die Füße.
     *
     * FUND (belegt, gemessen 2026-09-19): Geprüft wurde nur der Fußpunkt. Bei
     * flachem Wasser meldet er „trocken", während der Körper bis zur Schulter
     * unter Wasser steht — die Figur startete untergetaucht (gemessen über den
     * Menüweg: 19 von 60 Seeds mit `waterLevel = 1`; über den API-Weg ohne
     * `kartentyp` kein einziger Fall). Beispiel Seed 5, Figur 0: Wasser am
     * Fußpunkt 0, am Körper 1.
     */
    const kopf = boden - PLAYER_HALF_HEIGHT - 2;
    if (m.waterLevelAt(x, kopf) >= WET_LEVEL) return false;
    /*
     * FUND (belegt, 2026-10-13, Menüweg `kartentyp: 'autonom'`): Fuß- und Kopfpunkt
     * allein übersehen ein flaches Becken dazwischen. Seed 1, Figur P5: Wasser
     * von y = 959 bis 969 (11 px), Boden bei 970, Kopf bei 958 — beide Punkte
     * „trocken", die Körpermitte (die für Ertrinken zählt) bei Füllstand 1,0. Die
     * Figur fiel 4 px und stand untergetaucht. Deshalb auch die Mitte und die
     * Zeile über dem Boden prüfen.
     */
    return m.waterLevelAt(x, boden - 1) < WET_LEVEL
      && m.waterLevelAt(x, boden - PLAYER_HALF_HEIGHT) < WET_LEVEL;
  };

  /*
   * Begehbar: neben dem Körper keine Wand und kein zu steiler Hang.
   *
   * FUND (belegt, 2026-10-27, Bauteilkarten): Auf Vulkan, Pyramide und Schlucht lag der feste Wunschplatz am Hang,
   * 23 px vor einer Wand — die Figur stand trocken, konnte aber nicht laufen (E2E `gehen`: 4 px statt 15). Gesucht wird
   * zuerst im Umkreis von 600 px nach einem begehbaren Platz; gibt es keinen, bleibt es beim alten Verhalten.
   */
  const fest = (x, y) => m.terrain?.isSolid?.(x, y) === true;
  const begehbar = x => {
    const boden = m.surfaceYAt(x);
    const seite = PLAYER_HALF_WIDTH + 5;
    for (const dx of [-seite, seite]) {
      for (const dy of [6, PLAYER_HALF_HEIGHT, 2 * PLAYER_HALF_HEIGHT - 2]) if (fest(x + dx, boden - dy)) return false;
    }
    return Math.abs(m.surfaceYAt(x + 16) - m.surfaceYAt(x - 16)) <= 22;
  };
  // Nur auf autonomen Karten ab Geländefassung 6 (Bauteilkarten): alles Ältere setzt die Figuren wie bisher.
  const mitBegehbar = m.kartentyp === 'autonom' && (m.gelaende ?? 0) >= GELAENDE_KOMPOSITION;
  const gut = x => trocken(x) && (!mitBegehbar || begehbar(x));
  if (gut(idealX)) return idealX;
  if (mitBegehbar) {
    for (let abstand = 8; abstand <= 600; abstand += 8) {
      if (gut(idealX + abstand)) return idealX + abstand;
      if (gut(idealX - abstand)) return idealX - abstand;
    }
  }
  if (trocken(idealX)) return idealX;
  /*
   * Über die ganze Kartenbreite suchen, nicht nur bis zur Mitte.
   *
   * Auf einer Karte mit viel Wasser (Form `flooded`: rund 45 % Wasser) liegt
   * die nächste trockene Stelle unter Umständen weit entfernt. Mit einer
   * Begrenzung auf die halbe Breite blieb gemessen 1 von 480 Figuren
   * (40 Seeds × 12 Figuren) im Wasser — mit der vollen Breite keine.
   *
   * Die Suche läuft nur, wenn der Wunschplatz nass ist, und die Prüfung ist
   * ein Höhenprofil-Zugriff. Beim Matchstart fällt das nicht ins Gewicht.
   */
  const grenze = m.width - PLAYER_HALF_WIDTH - 2;
  for (let abstand = 8; abstand < grenze; abstand += 8) {
    if (trocken(idealX + abstand)) return idealX + abstand;
    if (trocken(idealX - abstand)) return idealX - abstand;
  }
  return idealX;
}

export function pruefeKartenErreichbarkeit({ m, players, world, bitmap, events, maxPower }) {
  if (m.kartentyp !== 'autonom') return;

  /*
   * Die Standpositionen holen.
   *
   * FUND (belegt, eigener Fehler): Ein erster Anlauf rief
   * `getComponent(id, 'Position')` ohne Feldnamen — das wirft
   * `Cannot read properties of undefined`. Die Komponente wird im ECS
   * **feldweise** abgefragt (`getComponent(id, 'Position', 'x')`), so wie es
   * an allen anderen Stellen im Modul geschieht.
   */
  const figuren = [];
  for (const eintrag of players) {
    if (!eintrag.alive) continue;
    const x = world.getComponent(eintrag.entityId, 'Position', 'x');
    const y = world.getComponent(eintrag.entityId, 'Position', 'y');
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    figuren.push({ x, y, teamId: eintrag.teamId });
  }
  if (figuren.length < 2) return;

  /*
   * Die größte Wurfweite — aus den Werten, die der Motor wirklich nutzt.
   *
   * Geholt statt gesetzt: `POWER_TO_SPEED` (die Umrechnung Kraft →
   * Geschwindigkeit) und `DEFAULT_PROJECTILE_GRAVITY` (die Schwerkraft des
   * Projektilsystems). Die Höchstkraft ist 100 — sie steht im Client
   * (`Math.min(100, ...)` in `main.js`) und im Turm. Ein fest eingetragener
   * Wert hier würde bei einer Änderung still falsch.
   */
  const wurfweite = maxWurfweite({
    powerToSpeed: POWER_TO_SPEED,
    maxPower: maxPower,
    gravity: DEFAULT_PROJECTILE_GRAVITY,
  }) * weitenFaktor(m.width);

  const urteil = pruefeErreichbarkeit({
    bitmap: bitmap, width: m.width, height: m.height, figuren, wurfweite,
  });

  /*
   * Die Abstände zum nächsten Gegner gehen mit in den Zustand.
   *
   * Sie sind die Zahl, die über Spielbarkeit entscheidet — nicht der Abstand
   * der äußersten Figuren. Wer am Zug ist, schlägt auf den NÄCHSTEN Gegner;
   * ob der in Reichweite liegt, ist die Frage.
   */
  const abstaende = abstandZumNaechstenGegner(figuren);
  const weiteste = abstaende.filter(d => Number.isFinite(d));

  m.erreichbarkeit = {
    ok: urteil.ok,
    grund: urteil.grund,
    wurfweite,
    naechsterGegner: weiteste.length > 0 ? Math.max(...weiteste) : null,
  };
  if (!urteil.ok) {
    events.emit('karte_unerreichbar', {
      grund: urteil.grund,
      figuren: figuren.length,
    });
  }
}
