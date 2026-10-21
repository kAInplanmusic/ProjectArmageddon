/**
 * BewegungSystem: Gehen am Boden (Bewegungsfassung 2, `config/bewegung.js`).
 *
 * Läuft VOR dem Physikschritt (`match.js#step`) und verändert nur die Position der Figur am Zug. Danach
 * rechnet `CharacterSystem` wie immer: Schwerkraft, Aufsetzen, Fallschaden, Wasser. Das System erfindet also
 * keine zweite Physik — es setzt die Figur einen Schritt weiter und lässt die Kante (Abstieg über
 * `maxAbstieg`) den Rest tun: Die Figur steht danach in der Luft und fällt.
 *
 * ## Absicht statt Tastenereignis
 *
 * Der Spieler meldet nur eine Richtung (−1/0/1). Sie gilt, bis `0` kommt, der Zug wechselt, geschossen wird
 * oder die Haltedauer ohne Erneuerung verfällt (verlorene „Taste los"-Nachricht: ohne Frist liefe die Figur
 * ins Wasser). Alles ist an Takte gebunden, nicht an die Uhr — Aufzeichnung und Wiedergabe bleiben exakt.
 *
 * @module BewegungSystem
 */
import { PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT } from '../../shared/config/player.js';
import { BEWEGUNG } from '../../shared/config/bewegung.js';
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../../shared/config/classes.js';

/**
 * Ein Schritt am Boden — reine Funktion (auch für die Vorhersage im Client).
 *
 * `y` ist die Fußposition der Figur (Mitte − Halbhöhe = Oberfläche der Standzeile). Die Figur steht auf der
 * ersten festen Zeile `fuss = floor(y + Halbhöhe)`.
 *
 * @param {{isSolid:function(number,number):boolean, width:number}} terrain
 * @param {number} x
 * @param {number} y
 * @param {-1|1} richtung
 * @param {number} tempo - Pixel je Takt
 * @returns {{x:number, y:number, blockiert:boolean, abgrund:boolean}}
 */
export function gehSchritt(terrain, x, y, richtung, tempo, werte = BEWEGUNG) {
  const hoch = PLAYER_HALF_HEIGHT;
  const nx = Math.max(PLAYER_HALF_WIDTH, Math.min(terrain.width - PLAYER_HALF_WIDTH, x + richtung * tempo));
  const blockiert = { x, y, blockiert: true, abgrund: false };
  if (nx === x) return blockiert;

  const fuss = Math.floor(y + hoch);
  const spalte = Math.floor(nx);
  const vorn = Math.floor(nx + richtung * werte.vorlauf);
  const oben = fuss - werte.maxStufe;

  // Erste feste Zeile der Mittelspalte zwischen höchster Stufe und tiefstem Abstieg.
  let s = null;
  for (let r = oben; r <= fuss + werte.maxAbstieg; r += 1) {
    if (terrain.isSolid(spalte, r)) { s = r; break; }
  }
  const stand = s ?? fuss;

  // Kopffreiheit: die Mittelspalte über der Stufenobergrenze, die vordere Spalte über der Stufenhöhe.
  for (let r = stand - 2 * hoch; r < Math.min(stand, oben); r += 1) {
    if (terrain.isSolid(spalte, r)) return blockiert;
  }
  for (let r = stand - 2 * hoch; r < stand - werte.maxStufe; r += 1) {
    if (terrain.isSolid(vorn, r)) return blockiert;
  }
  return s === null
    ? { x: nx, y, blockiert: false, abgrund: true }
    : { x: nx, y: s - hoch, blockiert: false, abgrund: false };
}

/**
 * Klassenfaktor auf das Gehtempo — aus dem Kampfprofil (`mobilityMultiplier`), gedämpft und begrenzt.
 * Reine Funktion, damit der Client sein Tempo für die Vorhersage genauso rechnet.
 */
export function klassenTempo(classId, archetypeId, sidegradeId = null) {
  const profil = combatProfile(CLASS_IDS[classId ?? 0], ARCHETYPE_IDS[archetypeId ?? 0], sidegradeId ?? null);
  return BEWEGUNG.tempo * Math.max(BEWEGUNG.minFaktor, Math.min(BEWEGUNG.maxFaktor,
    1 + (profil.mobilityMultiplier - 1) * BEWEGUNG.klassenEinfluss));
}

export class BewegungSystem {
  #match;
  /** @type {{id:number, richtung:number, bis:number}|null} */
  #absicht = null;

  /** @param {object} match - der `MatchController` (nur öffentliche Schnittstelle) */
  constructor(match) {
    this.#match = match;
  }

  /** Aktuelle Gehabsicht (nur Anzeige/Tests). */
  get absicht() { return this.#absicht ? { ...this.#absicht } : null; }

  /**
   * Tempo einer Figur in Pixeln je Takt: Grundtempo × Klasse × Verlangsamung (Kackhaufen, Eis, Mali).
   *
   * Die Klassenbeweglichkeit kommt aus dem Kampfprofil (wie beim Sprung, „eine Stelle nur").
   */
  tempoFuer(playerId) {
    const match = this.#match;
    const spieler = match.players.find(eintrag => eintrag.entityId === playerId);
    const klasse = klassenTempo(spieler?.classId, spieler?.archetypeId, spieler?.sidegradeId);
    const langsam = Math.min(match.statuses.slowOf(playerId), match.mali?.langsamFaktor(playerId) ?? 1);
    return klasse * langsam;
  }

  /**
   * Setzt (oder erneuert, oder löscht) die Gehabsicht der Figur am Zug.
   *
   * @param {number} playerId
   * @param {number} richtung - −1, 0 oder 1 (streng: andere Werte lehnt die Methode ab, sie klemmt nicht)
   * @returns {{ok:boolean, errors?:string[]}}
   */
  setzeRichtung(playerId, richtung) {
    const match = this.#match;
    if (!Number.isInteger(richtung) || richtung < -1 || richtung > 1) return { ok: false, errors: ['richtung muss -1, 0 oder 1 sein'] };
    if (match.status !== 'playing') return { ok: false, errors: ['Match läuft nicht'] };
    if (playerId !== match.activePlayerId) return { ok: false, errors: ['Nur der aktive Spieler kann gehen'] };
    if (!match.isPlayerAlive(playerId)) return { ok: false, errors: ['Spieler ist nicht mehr aktiv'] };
    if (richtung === 0) { this.#absicht = null; return { ok: true }; }
    if (match.turnPauseMs > 0) return { ok: false, errors: ['Zugpause: der Zug beginnt gleich'] };
    this.#absicht = { id: playerId, richtung, bis: match.world.tickCount + BEWEGUNG.haltedauer };
    return { ok: true };
  }

  /** Ein Takt Gehen. Aufruf aus `MatchController#step` VOR dem Physikschritt. */
  schritt() {
    const absicht = this.#absicht;
    if (!absicht) return;
    const match = this.#match;
    const welt = match.world;
    if (absicht.id !== match.activePlayerId || match.status !== 'playing' || !match.isPlayerAlive(absicht.id)
      || welt.tickCount > absicht.bis) {
      this.#absicht = null;
      return;
    }
    // Nach dem Schuss wird nicht mehr gegangen (die Flugphase gehört dem Schuss); in der Luft auch nicht.
    if (match.turnPauseMs > 0 || match.activeProjectileCount > 0 || !match.isGrounded(absicht.id)) return;
    const x = welt.getComponent(absicht.id, 'Position', 'x') ?? 0;
    const y = welt.getComponent(absicht.id, 'Position', 'y') ?? 0;
    const ziel = gehSchritt(match.terrain, x, y, absicht.richtung, this.tempoFuer(absicht.id));
    if (ziel.blockiert) return;
    welt.setComponent(absicht.id, 'Position', 'x', ziel.x);
    welt.setComponent(absicht.id, 'Position', 'y', ziel.y);
  }
}

export default BewegungSystem;
