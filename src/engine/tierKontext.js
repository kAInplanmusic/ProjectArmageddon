/**
 * Die Wirkungen der Tier-NPCs (Günther Fassung 2, Cookie) auf die Welt.
 *
 * `GuentherSystem` und `CookieSystem` entscheiden NUR, was geschieht; sie fassen
 * die Welt nicht an. Dieses Modul stellt ihnen die Handgriffe bereit: heilen,
 * stoßen, Schaden zufügen, Gelände aufwühlen, Kisten finden und fressen. So
 * bleibt `match.js` (Zeilenbudget) schmal, und beide NPCs benutzen dieselben
 * Handgriffe — keine zweite Fassung derselben Wirkung.
 *
 * @module tierKontext
 */
import { COMPONENT_SIGNATURES } from './ecs/world.js';
import { legeKiste } from './systems/lootSystem.js';

/** Liegende, unaufgehobene Kisten in fester Reihenfolge (Entity-ID aufsteigend). */
function liegendeKisten(world) {
  const liste = [];
  for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION)) {
    if (!world.isActive(id)) continue;
    if (world.getComponent(id, 'Crate', 'picked') === 1) continue;
    if (world.getComponent(id, 'Crate', 'inFlight') === 1) continue;
    liste.push({ id, x: world.getComponent(id, 'Position', 'x') ?? 0, y: world.getComponent(id, 'Position', 'y') ?? 0 });
  }
  return liste.sort((a, b) => a.id - b.id);
}

/**
 * @param {object} q
 * @param {object} q.world
 * @param {object} q.terrain - `CollisionMask`
 * @param {object} q.events - Ereignisse des Matches
 * @param {() => object|null} q.zerstoerung - Zerstörungsfassung (oder null)
 * @param {number} q.height - Kartenhöhe
 * @param {number} [q.kisten] - Kistenfassung des Matches (`config/kisten.js`)
 * @param {(x:number)=>number} q.surfaceYAt
 */
export function baueTierKontext(q) {
  const { world } = q;
  const schaden = () => world.getSystem('damage');
  return {
    /**
     * Boden nahe der bisherigen Hoehe (LOOK-4 Stufe 1, 2026-10-25).
     *
     * Kennt Hohlraeume und Kratersohlen; ohne durchgereichte Abfrage bleibt es
     * beim alten Verhalten (Oberflaeche), damit aeltere Aufrufer unveraendert
     * laufen.
     */
    bodenNahe: (x, y) => q.bodenNahe?.(x, y) ?? q.surfaceYAt?.(x) ?? 0,
    kisten: () => liegendeKisten(world),
    kisteVerzehren: id => { if (world.isActive(id)) world.removeEntity(id); },
    legeKiste: (rng, x, y) => legeKiste(world, rng, x, y, q.kisten),
    heile: (id, betrag) => schaden()?.heal?.(world, id, betrag) ?? 0,
    schaden: (id, betrag) => { schaden()?.applyDamage(world, id, betrag, null); },
    /** Schaden, der nie tötet (Schockwelle): lässt mindestens 1 Leben übrig. */
    schadenNichtToedlich: (id, betrag) => {
      const leben = world.getComponent(id, 'Health', 'current') ?? 0;
      const echt = Math.min(betrag, Math.max(0, leben - 1));
      if (echt > 0) schaden()?.applyDamage(world, id, echt, null);
      return echt;
    },
    leben: id => world.getComponent(id, 'Health', 'current') ?? 0,
    stosse: (id, vx, vy) => {
      if (!world.isActive(id)) return;
      world.setComponent(id, 'Velocity', 'x', (world.getComponent(id, 'Velocity', 'x') || 0) + vx);
      world.setComponent(id, 'Velocity', 'y', (world.getComponent(id, 'Velocity', 'y') || 0) + vy);
    },
    /** Loch ins Gelände — über dieselbe Zerstörung wie jeder Einschlag. */
    krater: (x, y, radius, tiefe) => {
      const zerstoerung = q.zerstoerung?.() ?? null;
      const px = Math.round(x);
      const py = Math.round(y);
      if (zerstoerung) zerstoerung.krater(px, py, radius, tiefe, 'sprengung');
      else {
        q.terrain.punchCrater(px, py, radius);
        q.events.emit('terrain_destroyed', { x: px, y: py, radius });
      }
    },
    /** Zerstört alle liegenden Kisten im Radius; Anzahl zurück. */
    zerstoereObjekte: (x, y, radius) => {
      let n = 0;
      for (const kiste of liegendeKisten(world)) {
        if (Math.hypot(kiste.x - x, kiste.y - y) > radius) continue;
        world.removeEntity(kiste.id);
        n += 1;
      }
      return n;
    },
    surfaceYAt: q.surfaceYAt,
  };
}
