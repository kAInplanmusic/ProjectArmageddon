/**
 * Zielwirkungen und Bodenmaterial — als Funktionen über eine Quelle.
 *
 * ## Warum dieses Modul existiert
 *
 * `#applyTargetEffect` (Einfrieren, Ziehen, Schaden über Zeit, Wasserschub), die
 * Verschiebung (`#pullToward`, `#pushAway`, `#shiftToward`) und
 * `#wendeBodenmaterialAn` (Eis rutscht, Gummi federt) lagen in `MatchController`
 * (rund 270 Zeilen). Dasselbe Muster wie `turret.js`, `shooting.js` und
 * `kistenWurf.js`: Der Match baut eine **Quelle** (`#wirkungsQuelle()`), dieses
 * Modul liest nur daraus. Kein `this`, keine privaten Felder des Matches.
 *
 * ## Die Quelle
 *
 *   players                       - Spielereinträge (`entityId`, `teamId`, `alive`)
 *   isPlayerAlive(id) -> boolean
 *   mali                          - `MaliRegeln` oder `null` (Schadensfassung 1)
 *   statuses                      - `StatusStore` (`freeze`, `addDot`)
 *   events                        - Ereignisbus (`emit`)
 *   world                         - ECS-Welt (Position, Geschwindigkeit)
 *   width                         - Kartenbreite
 *   surfaceYAt(x) -> number       - Oberfläche
 *   isSolid(x, y) -> boolean      - Kollisionsmaske
 *   waterLevelAt(x, y) -> number
 *   floodArea(x, y, level) -> {zellen, hoechster}
 *   bewegung                      - Map: Bewegung der Figuren vor dem Schritt
 *   materialAt(x, y) -> object    - Bodenmaterial
 *   isGrounded(id) -> boolean
 *
 * Die Reihenfolgen (Prüfungen, Ereignisse, Schreibzugriffe) sind unverändert zur
 * früheren Fassung in `match.js`; die Goldwert- und Hash-Tests belegen das.
 *
 * @module zieleffekte
 */
import { EFFECT_KIND } from './specials.js';
import { TERRAIN_MATERIAL, RUECKPRALL_MINDESTTEMPO } from '../shared/config/terrain.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { clampWaterLevel } from '../shared/config/water.js';

/**
 * Größter Höhenunterschied, den eine Verschiebung (Ziehen oder Schub)
 * überwinden darf.
 *
 * Ohne Grenze setzte die Verankerung auf der Geländeoberfläche das Ziel auf den
 * nächsten Hügel — ein Ziehen oder Schub wurde dadurch zum Teleport auf eine
 * Klippe. 16 px entsprechen etwa eineinhalb Figurenhöhen: ein Absatz, den man
 * hinaufgestoßen werden kann, aber keine Wand.
 */
const MAX_SHIFT_SLOPE = 16;

/**
 * Wendet eine Wirkung auf ein getroffenes Ziel an (Einfrieren, Schaden über Zeit).
 * Wirkt nur auf Gegner — eigene Einheiten bleiben verschont.
 */
export function wendeZielwirkungAn(q, effect, targetId, attackerId, weapon = null) {
  const ziel = q.players.find(entry => entry.entityId === targetId);
  const schuetze = q.players.find(entry => entry.entityId === attackerId);
  if (!ziel || !q.isPlayerAlive(targetId)) return null;
  if (schuetze && ziel.teamId === schuetze.teamId) return null;
  if (q.mali) {
    // Fassung 2: Schaden über Zeit und Einfrieren laufen über die Mali der Schadensart.
    const mali = q.mali.treffer(effect, weapon, targetId, attackerId);
    if (!effect || effect.kind === EFFECT_KIND.DAMAGE_OVER_TIME || effect.kind === EFFECT_KIND.FREEZE) return mali;
  }

  switch (effect.kind) {
    case EFFECT_KIND.FREEZE: {
      const turns = q.statuses.freeze(targetId, effect.turns);
      q.events.emit('frozen', { playerId: targetId, turns, by: attackerId });
      return { kind: effect.kind, turns };
    }

    case EFFECT_KIND.PULL: {
      // Das Ziel wird in Richtung des Schützen versetzt, auf festem Gelände
      // verankert. Wirkt nur, wenn es sich tatsächlich bewegt hat — sonst
      // wäre die Wirkung bei einer Wand dazwischen eine stille Nullnummer.
      const versetzt = zieheZu(q, targetId, attackerId, effect.distance);
      if (versetzt.dx === 0 && versetzt.dy === 0) return null;
      q.events.emit('pulled', { playerId: targetId, by: attackerId, ...versetzt });
      return { kind: effect.kind, ...versetzt };
    }

    case EFFECT_KIND.DAMAGE_OVER_TIME: {
      q.statuses.addDot(targetId, effect);
      q.events.emit('dot_applied', {
        playerId: targetId,
        element: effect.element,
        damagePerTurn: effect.damagePerTurn,
        turns: effect.turns,
        by: attackerId,
      });
      return { kind: effect.kind, ...effect };
    }

    case EFFECT_KIND.WATER_PUSH: {
      /*
       * Wasserschub: erst wegstoßen, dann fluten.
       *
       * Die Reihenfolge ist wesentlich. Der Wasserstand wird an der NEUEN
       * Position angehoben — würde zuerst geflutet, läge das Wasser auf der
       * alten Zelle und das Ziel stünde daneben im Trockenen. Die Waffe würde
       * dann sichtbar nichts bewirken.
       *
       * Der Wasserstand wird auf den vorhandenen Wert AUFgesetzt, nicht
       * gesetzt: Ein Schuss in eine schon geflutete Mulde macht sie tiefer,
       * statt sie auf den Wert der Waffe zurückzusetzen.
       */
      const versetzt = stosseWeg(q, targetId, attackerId, effect.distance);

      const neueX = q.world.getComponent(targetId, 'Position', 'x') ?? 0;
      const neueY = q.world.getComponent(targetId, 'Position', 'y') ?? 0;
      const vorher = q.waterLevelAt(neueX, neueY);
      const nachher = clampWaterLevel(vorher + effect.raise);
      /*
       * Einen BEREICH fluten, nicht eine Zelle — sonst meldet der Zustand der
       * Figur weiter 0, weil sie mit ihrem Zentrum zehn Pixel über der
       * gefluteten Bodenzelle steht (siehe `floodArea`).
       */
      const geflutet = q.floodArea(neueX, neueY, nachher);

      /*
       * Wenn weder Bewegung noch Flutung stattfand, ist die Wirkung eine
       * stille Nullnummer (z. B. Wand hinter dem Ziel und bereits geflutete
       * Zelle). Dann `null` zurückgeben — der Aufrufer zählt die Wirkung sonst
       * als Erfolg, obwohl nichts geschehen ist.
       */
      const bewegt = versetzt.dx !== 0 || versetzt.dy !== 0;
      if (!bewegt && geflutet.zellen === 0) return null;

      q.events.emit('water_pushed', {
        playerId: targetId,
        by: attackerId,
        dx: versetzt.dx,
        dy: versetzt.dy,
        waterBefore: vorher,
        waterAfter: nachher,
        cellsFlooded: geflutet.zellen,
      });
      return {
        kind: effect.kind,
        ...versetzt,
        waterBefore: vorher,
        waterAfter: nachher,
      };
    }

    default:
      return null;
  }
}

/**
 * Versetzt ein Ziel in Richtung eines Angreifers.
 *
 * Die Bewegung ist auf ein Stück pro Anwendung begrenzt und wird auf der
 * Geländeoberfläche verankert: ein Ziehen durch massives Terrain wäre ein
 * Fehler, kein Effekt. Der Schütze selbst bewegt sich nicht.
 *
 * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
 */
export function zieheZu(q, targetId, attackerId, distance) {
  const zielX = q.world.getComponent(targetId, 'Position', 'x') ?? 0;
  const schuetzeX = q.world.getComponent(attackerId, 'Position', 'x') ?? 0;
  return verschiebe(q, targetId, Math.sign(schuetzeX - zielX), distance);
}

/**
 * Versetzt ein Ziel vom Angreifer WEG — der Gegenpol zu `#pullToward`.
 *
 * Beide benutzen dieselbe Schrittsuche: Die Verschiebung wird in Zehn-Pixel-
 * Schritten geprüft und darf nicht durch massives Gelände führen. Ein Ziel
 * durch eine Wand zu schieben wäre ein Fehler, kein Effekt.
 *
 * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
 */
export function stosseWeg(q, targetId, attackerId, distance) {
  const zielX = q.world.getComponent(targetId, 'Position', 'x') ?? 0;
  const schuetzeX = q.world.getComponent(attackerId, 'Position', 'x') ?? 0;
  return verschiebe(q, targetId, Math.sign(zielX - schuetzeX), distance);
}

/**
 * Verschiebt ein Ziel waagerecht um `distance`, verankert auf der
 * Geländeoberfläche.
 *
 * @param {number} richtung - -1 oder 1; 0 bedeutet keine Bewegung
 * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
 */
export function verschiebe(q, targetId, richtung, distance) {
  const zielX = q.world.getComponent(targetId, 'Position', 'x') ?? 0;
  const zielY = q.world.getComponent(targetId, 'Position', 'y') ?? 0;
  if (richtung === 0) return { dx: 0, dy: 0 };

  // In kleinen Schritten prüfen, damit das Ziel nicht durch eine Wand springt.
  const schritt = 10;
  let erreicht = 0;
  for (let d = schritt; d <= distance; d += schritt) {
    const kandidatX = zielX + richtung * d;
    if (kandidatX < PLAYER_HALF_WIDTH || kandidatX > q.width - PLAYER_HALF_WIDTH) break;
    const surface = q.surfaceYAt(Math.round(kandidatX));
    if (surface < 0) break;
    /*
     * Kein Sprung auf eine Klippe.
     *
     * Fund (belegt): Die Verschiebung verankert das Ziel auf der
     * Geländeoberfläche der neuen Stelle. Stand dort ein Hügel, wurde das Ziel
     * katapultiert statt geschoben — gemessen: 120 px seitwärts und **115 px
     * nach oben** in einem Schritt, mitten auf einen Berggipfel. Ein Erdstoß,
     * der jemanden auf eine Klippe setzt, ist kein Effekt, sondern ein Fehler.
     *
     * Der Höhenunterschied wird deshalb begrenzt: Die Verschiebung endet, wo
     * der Boden mehr als `MAX_SCHUB_STEIGUNG` über der Fußposition liegt.
     * Bezugspunkt ist die FUSSPOSITION (`zielY + PLAYER_HALF_HEIGHT`), weil
     * dort der Bodenkontakt stattfindet.
     */
    if (Math.abs(surface - (zielY + PLAYER_HALF_HEIGHT)) > MAX_SHIFT_SLOPE) break;
    if (q.isSolid(Math.floor(kandidatX), Math.floor(surface - PLAYER_HALF_HEIGHT))) break;
    erreicht = d;
  }

  if (erreicht === 0) return { dx: 0, dy: 0 };

  const neueX = zielX + richtung * erreicht;
  const neueY = q.surfaceYAt(Math.round(neueX));
  q.world.setComponent(targetId, 'Position', 'x', neueX);
  q.world.setComponent(targetId, 'Position', 'y', neueY);
  q.world.setComponent(targetId, 'Velocity', 'x', 0);
  q.world.setComponent(targetId, 'Velocity', 'y', 0);
  return { dx: neueX - zielX, dy: neueY - zielY };
}

/**
 * Wendet die Physik des Bodenmaterials an — beim Aufsetzen und beim Bewegen.
 *
 * EIS rutscht (die Bodenreibung des Schritts wird anteilig zurückgenommen,
 * nie über den gemerkten Wert hinaus — Eis beschleunigt nicht). GUMMI federt
 * (ein Teil des Aufpralltempos kommt als senkrechter Impuls zurück, ab
 * `RUECKPRALL_MINDESTTEMPO`, damit das Federn ausklingt). Beides ohne Zufall
 * und ohne Uhr.
 *
 * ## Warum es dazu KEIN Ereignis gibt
 *
 * Naheliegend wären `boden_rutschig`/`boden_rueckprall`. Sie unterbleiben
 * bewusst: `tests/event-coverage.test.js` verlangt, dass JEDES
 * Engine-Ereignis einen Behandlungszweig in der Anzeige hat — ein Ereignis
 * ohne Zweig wäre eine stumme Stelle, genau der Fehler, den jener Test
 * festhält. Die Anzeige zu erweitern stand hier nicht zur Verfügung, also
 * wird auch nichts gemeldet. Der Boden ist über Position und Geschwindigkeit
 * der Figur sichtbar; ein eigenes Ereignis braucht er nicht.
 */
export function wendeBodenmaterialAn(q) {
  for (const entry of q.players) {
    if (!entry.alive) continue;
    const vorher = q.bewegung.get(entry.entityId);
    if (!vorher) continue;

    const x = q.world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
    const y = q.world.getComponent(entry.entityId, 'Position', 'y') ?? 0;
    /*
     * Gelesen wird die BODENZEILE, nicht die Fußlinie.
     *
     * FUND (belegt, eigener Fehler): Zuerst stand hier `y`. Das ist die
     * Fußlinie — und die schwankt im Betrieb um einige Pixel (das
     * CharacterSystem setzt eine landende Figur auf `Oberfläche − halbe
     * Höhe`, die Schwerkraft zieht sie im nächsten Schritt wieder herunter).
     * Gemessen lag eine Figur dabei abwechselnd bei y=702 und y=711; bei
     * einer Materialzelle von 64 px fiel sie damit von einer Zelle in die
     * nächste, und derselbe Boden meldete einmal „Gummi" und einmal „Eis".
     *
     * `y + PLAYER_HALF_HEIGHT` ist der tiefste Punkt des Körpers — dort
     * berührt er den Grund. Diese Zeile ist über die ganze Schwankung
     * dieselbe.
     */
    const material = q.materialAt(x, y + PLAYER_HALF_HEIGHT);
    if (material.id === TERRAIN_MATERIAL.NORMAL) continue;

    const stehtJetzt = q.isGrounded(entry.entityId);

    if (material.rutschigkeit > 0 && stehtJetzt) {
      const vx = q.world.getComponent(entry.entityId, 'Velocity', 'x') ?? 0;
      const neu = vx + (vorher.vx - vx) * material.rutschigkeit;
      q.world.setComponent(entry.entityId, 'Velocity', 'x', neu);
    }

    if (material.rueckprall > 0 && !vorher.grounded && stehtJetzt
      && vorher.vy > RUECKPRALL_MINDESTTEMPO) {
      const impuls = vorher.vy * material.rueckprall;
      q.world.setComponent(entry.entityId, 'Velocity', 'y', -impuls);
    }
  }
}
