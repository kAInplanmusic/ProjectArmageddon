/**
 * Das Geschütz: Zielwahl, Zielsuche und Geschoss — als reine Funktionen.
 *
 * ## Warum dieses Modul existiert
 *
 * Das Geschütz lag vollständig in `MatchController`: seine Konstanten (69
 * Zeilen), die Zielwahl (`#nearestEnemyOf`), die Winkel/Kraft-Suche
 * (`#turretShot`) und die Werte seines Geschosses (`#spawnTurretProjectile`) —
 * zusammen rund 150 Zeilen zwischen Karten- und Terrainzugriffen der Klasse.
 * Prüfbar waren sie damit nur über einen vollständigen Match.
 *
 * Diese Datei lagert diese vier Teile aus. Das Muster ist dasselbe wie bei
 * `shooting.js` (W1-4b) und `stateSnapshot.js` (W1-4a): Der Match baut eine
 * **Quelle** — ein schlichtes Objekt mit genau den Werten, die die Funktionen
 * lesen — und gibt sie an **reine Funktionen**. Keine Objektbindung, kein
 * `this`, keine privaten Felder.
 *
 * ## Was hier liegt — und was NICHT
 *
 * Hier liegt:
 *
 *  1. `freierPlatz` — die Aufstellung (freier, trockener Platz in der Nähe).
 *  2. `naechsterGegner` — die Zielwahl (nächster lebender Gegner in Reichweite).
 *  3. `aimTurret` — die Zielsuche (feste Kraft- und Winkellisten; gewählt wird
 *     der Winkel, dessen Bahn dem Ziel am nächsten kommt).
 *  4. `turretProjectile` — die Werte des Geschosses (Komponenteninhalt).
 *  5. Die Konstanten, aus denen diese vier lesen.
 *
 * Im Match bleibt die PHYSIK der Bahn: `#simulateTurretPath` rechnet einen
 * Schritt nach und liest dabei Kartenbreite (`this.width`) und Terrain
 * (`this.surfaceYAt`). Sie bleibt dort, weil zwei Wächter genau diese Stellen in
 * `match.js` festhalten:
 *
 *  - `tests/turret-ballistics.test.js` (Zeile 232-281) sucht die Definition
 *    `#simulateTurretPath(turret, winkel, kraft, waffe) {` samt Wind-Quelle
 *    (`const wind = this.#wind`) und den Drag-Zeilen im Quelltext von
 *    `match.js` und schneidet ihren Rumpf per Klammerzählung heraus.
 *  - `tests/reichweite-konsistenz.test.js` (Zeile 295-299) zählt ZWEI Stellen
 *    mit `* geschwindigkeitsFaktor(this.width)` in `match.js` (Bahnersuchung und
 *    Geschoss).
 *
 * Die Suche ruft die Bahn deshalb über die Quelle (`bahn`), und die
 * Abschussgeschwindigkeit bleibt in `match.js`. Beides ist in
 * `docs/zerlegung-turret.md` belegt — inklusive der Frage, die dadurch offen
 * bleibt (`integrateStep` aus `src/shared/ballistics.js`).
 *
 * ## Die Schnittstelle
 *
 * Die Quelle (`#geschuetzQuelle()` in `match.js`) hat genau diese Felder:
 *
 *   players                          - die Spielereinträge (`alive`, `teamId`)
 *   positionOf(entityId) -> {x, y}   - Position einer Figur
 *   bahn(turret, winkel, kraft) -> Array<{x, y}>
 *
 * Wer ein Feld umbenennt, zieht `#geschuetzQuelle()` mit — beide gehören
 * zusammen. `turretProjectile` braucht die Quelle NICHT: Es rechnet aus Werten,
 * die der Match ihm übergibt, und rührt weder Welt noch Ereignisse an.
 *
 * ## Determinismus — die Reihenfolgen sind Teil der Regel
 *
 * Beide Listen der Suche sind FEST (kein Zufall), die Schleifen laufen Kraft
 * außen und Winkel innen, und die Zielwahl entscheidet Gleichstände über die
 * kleinere Kennung. Ein Replay hängt daran: Wird eine Reihenfolge getauscht,
 * wählt das Geschütz bei Gleichstand einen anderen Schuss oder ein anderes
 * Ziel, und der Zustandshash weicht ab
 * (`npm run replay -- play artifacts/replay-20260910.json --verify`).
 *
 * Das Modul ist frei von Node-Builtins und von Engine-Importen mit Nebenwirkung
 * — es läuft im Browser wie im Server (`tests/source-boundaries.test.js`).
 *
 * @module turret
 */
import { damageTypeId } from './damageTypes.js';
import { PROJECTILE_DRAG } from '../shared/ballistics.js';
import { PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { WET_LEVEL } from '../shared/config/water.js';

/** Kennung des Geschützgeschosses in `#shotsInFlight` und im Drahtformat. */
export const TURRET_WEAPON_ID = '__geschuetz';

/**
 * Platzhalter-Waffe des Geschützes.
 *
 * Das Geschütz ist keine eigene Waffe im Katalog, sondern ein Geschoss mit
 * eigenen Werten. Dieser Platzhalter liefert die Flugeigenschaften: Das Geschoss
 * fliegt wie ein kleines, schnelles Wurfgeschoss. Gelesen wird er von der Bahn
 * (`#simulateTurretPath`, `speedFactor` / `gravityScale`) und vom Geschoss
 * (`turretProjectile`, `index` / `damageType` / `blastRadius`).
 */
export const TURRET_WEAPON = Object.freeze({
  index: -1,
  displayName: 'Geschütz',
  damage: 0,          // Der Schaden kommt aus dem Geschütz-Eintrag.
  blastRadius: 18,
  knockback: 0,
  gravityScale: 1,
  speedFactor: 1,
  terrainDamage: 6,
  maxRange: 800,
  /**
   * Das Geschütz schießt über Deckung hinweg (Steilfeuer) — es braucht deshalb
   * KEINE Sichtlinie. Die Schadensart ist Sprengwirkung, wie bei jeder
   * Flächenwaffe (siehe `src/engine/damageTypes.js`).
   */
  requiresLineOfSight: false,
  damageType: 'explosive',
});

/**
 * Antriebskräfte, die die Suche durchprobiert.
 *
 * ## Warum die Liste so fein ist
 *
 * FUND (belegt): Hier standen fünf Werte — `[40, 55, 70, 85, 100]`. Ihre
 * erreichbaren Weiten (ohne Luftwiderstand) sind:
 *
 *     Kraft  40  →  143 px
 *     Kraft  55  →  270 px     Lücke 127 px
 *     Kraft  70  →  437 px     Lücke 167 px
 *     Kraft  85  →  644 px     Lücke 207 px
 *     Kraft 100  →  891 px     Lücke 247 px
 *
 * Zwischen zwei Stufen lag also bis zu **247 px** — fast ein Fünftel der alten
 * Karte. Solange die Karte 1280 px breit war, fiel das kaum auf: Die Gegner
 * standen rund 600 px entfernt, und Kraft 85 traf.
 *
 * Seit die Vorgabekarte 2560 px breit ist, stehen sie bei ~513 px — genau in
 * der Lücke zwischen 437 und 644. Gemessen feuerte das Geschütz deshalb nur
 * **einmal in vier Runden**, obwohl ein Ziel durchgehend in Reichweite war
 * (`tests/turret.test.js`).
 *
 * ## Die feinere Staffelung
 *
 * 15 Stufen statt 5. Die Lücke sinkt damit auf rund 60 px — kleiner als eine
 * Figur (14 px breit) mal dem Trefferfenster. Die Suche kostet mehr Rechnung
 * (15 × 6 = 90 Bahnen statt 30), aber sie läuft **je Runde einmal**, nicht je
 * Takt.
 */
const TURRET_POWERS = Object.freeze([
  40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100, 106, 112, 118, 124,
]);

/** Erhöhungswinkel (0 = flach, 1 = 45°), feste Reihenfolge. */
const TURRET_ELEVATIONS = Object.freeze([0.05, 0.15, 0.3, 0.5, 0.785, 1.0]);

/**
 * Schritte je Bahnberechnung. Reicht für die halbe Kartenbreite.
 *
 * Gelesen wird der Wert von der Bahn (`#simulateTurretPath` in `match.js`) —
 * er beschreibt aber die Reichweite der Suche und steht deshalb hier bei ihren
 * übrigen Konstanten.
 */
export const TURRET_PATH_STEPS = 900;

/** Größter Abstand, bei dem noch geschossen wird (halbe Figurenbreite). */
const TURRET_MAX_MISS = 22;

/**
 * Sucht einen freien Platz für ein Geschütz in der Nähe einer Figur.
 *
 * Die Aufstellung ist neben Ziel, Suche und Geschoss der vierte Teil des
 * Geschützes — und wie die Zielwahl reine Rechnung über Karte und Terrain. Der
 * Match reicht Kartenbreite und die beiden Terrainfragen hinein; damit ist die
 * Platzwahl ohne Match prüfbar (`tests/turret-zerlegung.test.js`).
 *
 * @param {{breite:number, surfaceYAt:(x:number)=>number,
 *   waterLevelAt:(x:number,y:number)=>number}} quelle
 * @param {number} startX - Standort der Figur
 * @returns {{x:number, y:number}|null} `null`, wenn kein Platz frei ist
 */
export function freierPlatz(quelle, startX) {
  // Abwechselnd rechts und links suchen — feste Reihenfolge, damit die
  // Platzwahl bei gleichem Seed dieselbe bleibt (Determinismus).
  const kandidaten = [startX];
  for (let abstand = 12; abstand <= 60; abstand += 12) {
    kandidaten.push(startX + abstand, startX - abstand);
  }

  for (const x of kandidaten) {
    const gerundet = Math.round(x);
    if (gerundet < PLAYER_HALF_WIDTH || gerundet > quelle.breite - PLAYER_HALF_WIDTH) continue;
    const boden = quelle.surfaceYAt(gerundet);
    // Festes Gelände über dem Wasser: Ein Geschütz im Hochwasser wäre weg.
    if (boden <= 0 || quelle.waterLevelAt(gerundet, boden) >= WET_LEVEL) continue;
    return { x: gerundet, y: boden - 6 };
  }
  return null;
}

/**
 * Nächster lebender Gegner eines Geschützes innerhalb seiner Reichweite.
 *
 * Die Zielwahl ist ein Teil des Zielpfads: Sie entscheidet, WOHIN die Suche
 * überhaupt zielt. Sie liest nur die Spielerliste und die Positionen — deshalb
 * ist sie hier eine reine Funktion und keine Methode.
 *
 * Bei gleichem Abstand entscheidet die kleinere Kennung. Das ist keine
 * Geschmacksfrage: Ohne diese Regel hinge das Ziel an der Reihenfolge der
 * Spielerliste, und ein Replay wäre nicht reproduzierbar.
 *
 * @param {{players:Array<object>, positionOf:(entityId:number)=>{x:number,y:number}}} quelle
 * @param {{x:number, y:number, teamId:number, range:number}} turret
 * @returns {{entityId:number, x:number, y:number, distanz:number}|null}
 */
export function naechsterGegner(quelle, turret) {
  let bestes = null;
  let besteDistanz = Infinity;
  for (const entry of quelle.players) {
    if (!entry.alive || entry.teamId === turret.teamId) continue;
    const { x, y } = quelle.positionOf(entry.entityId);
    const distanz = Math.hypot(x - turret.x, y - turret.y);
    if (distanz > turret.range) continue;
    // Bei Gleichstand entscheidet die kleinere Kennung — deterministisch.
    if (distanz < besteDistanz || (distanz === besteDistanz && entry.entityId < (bestes?.entityId ?? Infinity))) {
      besteDistanz = distanz;
      bestes = { entityId: entry.entityId, x, y, distanz };
    }
  }
  return bestes;
}

/**
 * Sucht Winkel und Kraft für ein Geschütz.
 *
 * ## Warum gesucht und nicht gerechnet
 *
 * Die Bahn hängt an Schwerkraft, Luftwiderstand, Wind und Eigengewicht der
 * Waffe (`gravityScale`). Eine geschlossene Lösung gäbe es nur für die reine
 * Wurfparabel — sie würde bei Wind und gezogenen Waffen danebenliegen.
 *
 * Deshalb wird die ECHTE Bahn verschossen: Für eine Reihe von Winkeln wird die
 * Flugbahn schrittweise nachgerechnet und der Winkel gewählt, dessen Bahn dem
 * Ziel am nächsten kommt. Das nutzt dieselbe Rechnung wie das Spiel — eine
 * zweite Formel könnte von ihr abweichen.
 *
 * Die Winkelliste ist fest (kein Zufall), damit das Ergebnis bei gleichem Seed
 * dasselbe bleibt.
 *
 * @param {{bahn:(turret:object, winkel:number, kraft:number)=>Array<{x:number,y:number}>}} quelle
 *   die Schnittstelle (siehe Modulkopf) — sie liefert die nachgerechneten Bahnen
 * @param {{x:number, y:number}} turret - Standort des Geschützes
 * @param {{x:number, y:number}} ziel - Position des Ziels
 * @returns {{angle:number, power:number, naehe:number}|null}
 *   `null` heißt „kein Schuss" (keine Bahn nahe genug am Ziel)
 */
export function aimTurret(quelle, turret, ziel) {
  // Nur die Waagerechte entscheidet die Richtung — die Höhe steckt in der
  // Winkelsuche (die Bahn wird für jeden Winkel wirklich durchgerechnet).
  const dx = ziel.x - turret.x;

  // Grundrichtung: nach links oder rechts. Der Winkel wird gegen die
  // Bildschirmachse gemessen (0 = rechts, π/2 = oben).
  const basis = dx >= 0 ? 0 : Math.PI;
  const richtung = dx >= 0 ? 1 : -1;

  let bestes = null;
  let bestesDelta = Infinity;

  for (const kraft of TURRET_POWERS) {
    for (const steigung of TURRET_ELEVATIONS) {
      const winkel = basis + richtung * steigung;
      const bahn = quelle.bahn(turret, winkel, kraft);
      if (bahn.length === 0) continue;

      // Kürzester Abstand der Bahn zum Ziel — nicht „letzter Punkt": Ein
      // Schuss, der das Ziel im Vorbeiflug streift, ist ein Treffer.
      let naehe = Infinity;
      for (const punkt of bahn) {
        const d = Math.hypot(punkt.x - ziel.x, punkt.y - ziel.y);
        if (d < naehe) naehe = d;
      }
      // Kraft bevorzugen, die nicht volle Leistung braucht: Bei gleicher
      // Näherung ist der flachere Schuss schneller am Ziel.
      const bewertet = naehe + kraft * 0.002;
      if (bewertet < bestesDelta) {
        bestesDelta = bewertet;
        bestes = { angle: winkel, power: kraft, naehe };
      }
    }
  }

  if (!bestes) return null;
  // Kein Blindfeuer: Liegt die beste Bahn weiter als die halbe Zielbreite
  // entfernt, wird nicht geschossen.
  if (bestes.naehe > TURRET_MAX_MISS) return null;
  return bestes;
}

/**
 * Die Werte des Geschützgeschosses.
 *
 * Reine Rechnung: Der Match erzeugt die Entität und setzt die Komponenten —
 * dieses Modul liefert nur, WAS hineingehört. Reihenfolge und Namen der Felder
 * sind die der Komponente (`Projectile`), damit die Momentaufnahme unverändert
 * bleibt.
 *
 * `speed` kommt von außen: Die Abschussgeschwindigkeit hängt an der
 * Kartenbreite (`geschwindigkeitsFaktor(this.width)`) und bleibt deshalb im
 * Match — siehe Modulkopf.
 *
 * @param {{turret:object, waffe:object, winkel:number, speed:number}} werte
 * @returns {{position:{x:number,y:number}, velocity:{x:number,y:number}, projectile:object}}
 */
export function turretProjectile({ turret, waffe, winkel, speed }) {
  const vx = Math.cos(winkel) * speed;
  const vy = -Math.sin(winkel) * speed;

  return {
    position: { x: turret.x, y: turret.y },
    velocity: { x: vx, y: vy },
    projectile: {
      // Verursacher ist der EIGENTÜMER des Geschützes: Ein Abschuss durch das
      // eigene Geschütz soll ihm zugerechnet werden (Kennzahlen, Sieg).
      owner: turret.ownerId,
      weaponId: waffe.index,
      damageType: damageTypeId(waffe.damageType),
      damage: turret.damage,
      blastRadius: waffe.blastRadius || 18,
      knockback: waffe.knockback ?? 0,
      drag: PROJECTILE_DRAG,
      gravityScale: waffe.gravityScale ?? 1,
      windFactor: 1,
      terrainDamage: waffe.terrainDamage ?? 0,
      bounces: 0,
      lifetime: Math.max(30, Math.round(turret.range / Math.max(1, speed)) * 2),
      fuseTicks: 0,
      alive: 1,
    },
  };
}
