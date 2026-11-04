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
import { GELAENDE_KOMPOSITION, GELAENDE_KLAR, GELAENDE_OHNE_SCHACHT } from '../shared/config/gelaende.js';
import {
  pruefeErreichbarkeit, maxWurfweite, abstandZumNaechstenGegner, findeFlaechen,
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
   * im Umkreis von 600 px nach einem begehbaren Platz; gibt es keinen, bleibt es beim alten Verhalten. Dass die Spawnspalten einander erreichen, stellt der Kartengenerator sicher (`terrainGen3.spawnErreichbar`).
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
  /*
   * Auf einer großen Landmasse (ab Geländefassung 8, TODO UI-8).
   *
   * FUND (belegt, 2026-11-03, `check-erreichbarkeit`): `karte_unerreichbar` bei Seed 4 eiswueste 2×1, 69 kosmos 2×2/4×2,
   * 107 klassisch 4×2, 240 klassisch 2×1 (Fassung 7). Ursache im Kartengenerator: Die Bauteilkarten haben lose Brocken
   * (Vulkan: Seitenplatten 300×120 px; Höhle mit Insel: Felsinseln und Absätze im Raum), die von oben sichtbar sind. Die
   * Prüfung des Generators (`terrainGen3.spawnErreichbar`) misst nur die sechs Spalten eines 3×2-Matches (i·B/7); bei
   * anderen Teamgrößen liegt der Wunschplatz i·B/(n+1) auf einem Brocken, weiter als eine Wurfweite vom Gegner. Deshalb
   * gilt ab Fassung 8 als gut nur ein Platz, dessen Boden zu einer großen Landmasse gehört (`hauptflaeche`).
   */
  const haupt = mitBegehbar && (m.gelaende ?? 0) >= GELAENDE_KLAR ? hauptflaeche(m) : null;
  const aufHaupt = x => {
    if (!haupt) return true;
    const px = Math.round(x);
    if (px < 0 || px >= m.width) return false;
    for (let y = Math.max(0, Math.round(m.surfaceYAt(x))); y < m.height; y += 1) {
      const f = haupt.flaeche[y * m.width + px];
      if (f !== -1) return haupt.gross.has(f);
    }
    return false;
  };
  /*
   * Kein Schacht (ab Geländefassung 9).
   *
   * FUND (belegt, 2026-11-04, Pilzwald Seed 2092081, 8×4 und 8×5): `begehbar` prüft feste Spalten ±12 px neben der Figur.
   * In einem 24 px breiten Schacht (Ruinenfenster, das durch die Krone brach) sind das genau die Luftspalten an den Rändern,
   * und der Hang über ±16 px misst Krone gegen Krone — der Schacht galt als begehbar, die Figur startete 40 px tief ohne
   * Ausweg zu Fuß. Ab 9 braucht ein Startplatz zusätzlich einen zu Fuß begehbaren Abschnitt (Aufstieg höchstens
   * `START_STUFE` px je Spalte, wie `check:biome`) von mindestens `MIN_START_ABSCHNITT` px Breite.
   */
  const ohneSchacht = mitBegehbar && (m.gelaende ?? 0) >= GELAENDE_OHNE_SCHACHT;
  const gut = x => trocken(x) && (!mitBegehbar || begehbar(x)) && aufHaupt(x) && (!ohneSchacht || abschnittBreit(m, x));
  if (gut(idealX)) return idealX;
  if (mitBegehbar) {
    for (let abstand = 8; abstand <= 600; abstand += 8) {
      if (gut(idealX + abstand)) return idealX + abstand;
      if (gut(idealX - abstand)) return idealX - abstand;
    }
  }
  if (haupt) {
    // Kein begehbarer Platz im Umkreis: wenigstens trocken und auf einer großen Landmasse, über die ganze Breite.
    const ok = x => trocken(x) && aufHaupt(x);
    if (ok(idealX)) return idealX;
    for (let abstand = 8; abstand < m.width; abstand += 8) {
      if (ok(idealX + abstand)) return idealX + abstand;
      if (ok(idealX - abstand)) return idealX - abstand;
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

/** Größter Aufstieg je Spalte, den der begehbare Abschnitt eines Startplatzes zulässt (wie `STUFE` in `check:biome`). */
const START_STUFE = 10;
/** Mindestbreite des begehbaren Abschnitts um einen Startplatz (ab Geländefassung 9): gut sechs Körperbreiten. */
export const MIN_START_ABSCHNITT = 96;

/**
 * Reicht der zu Fuß begehbare Abschnitt um `x` (Oberfläche, Aufstieg ≤ `START_STUFE` je Spalte, Abstieg beliebig) mindestens
 * `MIN_START_ABSCHNITT` px weit? Gezählt wird nach beiden Seiten, bis die Breite erreicht ist.
 */
function abschnittBreit(m, x0) {
  const x = Math.round(x0);
  let breite = 1;
  for (const richtung of [-1, 1]) {
    let y = m.surfaceYAt(x);
    for (let nx = x + richtung; nx >= 0 && nx < m.width && breite < MIN_START_ABSCHNITT; nx += richtung) {
      const ny = m.surfaceYAt(nx);
      if (y - ny > START_STUFE) break;
      y = ny;
      breite += 1;
    }
  }
  return breite >= MIN_START_ABSCHNITT;
}

/** Eine Fläche, die nicht die größte ist, zählt nur, wenn sie über mindestens diesem Anteil der Spalten die Oberfläche bildet. */
const OBERFLAECHEN_ANTEIL = 0.3;

/**
 * Die großen Landmassen der Karte (einmal je Bitmap gerechnet; beim Start ändert sich die Bitmap nicht): die größte Fläche
 * und jede, die über `OBERFLAECHEN_ANTEIL` der Breite oben liegt. Gemessen 2026-11-03: Die Deckschicht einer Höhlenkarte
 * (15 % der Masse, über fast die ganze Breite oben) ist spielbar; schwebende Inseln (16 % der Masse, 300 bis 500 px breit),
 * Vulkanplatten und Felsinseln sind es nicht.
 */
const HAUPT_CACHE = new WeakMap();
function hauptflaeche(m) {
  const bitmap = m.bitmap;
  if (!bitmap) return null;
  let h = HAUPT_CACHE.get(bitmap);
  if (h) return h;
  const { width: B, height: H } = m;
  const f = findeFlaechen(bitmap, B, H);
  const groesse = new Map();
  for (const v of f.flaeche) if (v !== -1) groesse.set(v, (groesse.get(v) ?? 0) + 1);
  const oben = new Map();
  for (let x = 0; x < B; x += 1) {
    for (let y = 0; y < H; y += 1) {
      const v = f.flaeche[y * B + x];
      if (v !== -1) { oben.set(v, (oben.get(v) ?? 0) + 1); break; }
    }
  }
  let groesste = -1;
  let beste = 0;
  for (const [v, n] of groesse) if (n > beste) { beste = n; groesste = v; }
  const gross = new Set([groesste]);
  for (const [v, n] of oben) if (n >= B * OBERFLAECHEN_ANTEIL) gross.add(v);
  h = { flaeche: f.flaeche, gross };
  HAUPT_CACHE.set(bitmap, h);
  return h;
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
