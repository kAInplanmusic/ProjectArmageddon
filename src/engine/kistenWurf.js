/**
 * Kisten und Abwerfen: Wurf, Flug und Landung — als Funktionen über eine Quelle.
 *
 * ## Warum dieses Modul existiert
 *
 * `dropWeapon`, `#rollDropThrow`, `#stepCrate` und `#stepFlyingCrates` lagen samt
 * den Kisten-Konstanten in `MatchController` (rund 250 Zeilen). Das Muster ist
 * dasselbe wie bei `turret.js` und `shooting.js`: Der Match baut eine **Quelle**
 * (`#kistenQuelle()`), dieses Modul liest nur daraus. Kein `this`, keine
 * privaten Felder des Matches.
 *
 * ## Die Quelle
 *
 *   status                        - Matchstatus (`'playing'` erlaubt das Abwerfen)
 *   activePlayerId                - der Spieler am Zug
 *   isPlayerAlive(id) -> boolean
 *   width                         - Kartenbreite
 *   world                         - die ECS-Welt (Komponenten, Entities, `services.match.wind`)
 *   inventory                     - `removeWeapon(playerId, weaponId)`
 *   getWeapon(id) -> object|null  - Waffe aus dem Katalog (`config/weapons.js`)
 *   rng                           - der Match-Zufallsstrom (`nextBoolean`, `nextFloat`)
 *   events                        - der Ereignisbus (`emit`)
 *   cooldownLoeschen(schluessel)  - entfernt die Nachladezeit `spieler:waffe`
 *   surfaceYAt(x) -> number       - Oberfläche (Terrain)
 *   waterLevelAt(x, y) -> number  - Wasserstand
 *
 * ## Determinismus — die Reihenfolgen sind Teil der Regel
 *
 * `rolleWurf` zieht GENAU: `nextBoolean()` (Richtung), dann `nextFloat(Zieldistanz)`,
 * dann `nextFloat(9, 14)` (Höhe). `wirfWaffe` zieht erst NACH allen Prüfungen und
 * nach dem Entfernen aus dem Inventar. Verhalten bitgleich zur früheren Fassung
 * in `match.js`; siehe `docs/zerlegung-match.md`.
 *
 * @module kistenWurf
 */
import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';
import { DEFAULT_PROJECTILE_DRAG } from './systems/projectileSystem.js';
import { CRATE_TYPES, RARITY_IDS, PICKUP_RADIUS } from './systems/lootSystem.js';
import { WET_LEVEL } from '../shared/config/water.js';

/** Fallbeschleunigung abgeworfener Kisten (px pro Tick²). */
const CRATE_GRAVITY = 0.30;
/**
 * Mindest-Flugzeit eines Wurfs in Ticks (0,75 s bei 60 Hz).
 * Die Kiste landet erst danach — auch wenn sie vorher aufsetzen würde.
 */
const CRATE_FLIGHT_TICKS = 45;

/**
 * Wirft eine Waffe ab und schleudert sie als aufhebbare Kiste fort.
 *
 * Die Mechanik unterstützt den Spielablauf an der Stelle, an der er sonst
 * stockt: Ist der Waffenvorrat voll, muss man sich von etwas trennen, um etwas
 * Neues zu nehmen.
 *
 * Entscheidungen:
 *  - Die Kiste wird GESCHLEUDERT (siehe `rolleWurf`, `schrittKiste`); die
 *    Landestelle liegt AUSSERHALB des Aufhebe-Radius, sonst würde der Werfer
 *    seine eigene Waffe im nächsten Schritt wieder einsammeln.
 *  - Der Zufall kommt aus dem Match-Generator, ist also reproduzierbar.
 *  - Die verbleibende Munition reist mit: Abwerfen und Aufheben darf kein
 *    Munitionstrick sein.
 *  - Die Reservewaffe ist geschützt (siehe Inventar).
 *
 * @param {object} q - die Kistenquelle (siehe Kopf)
 * @param {number} playerId
 * @param {string} weaponId
 * @returns {{ok:boolean, crateId?:number, x?:number, y?:number, ammo?:number, errors?:string[]}}
 */
export function wirfWaffe(q, playerId, weaponId) {
  const errors = [];
  if (q.status !== 'playing') errors.push('Match läuft nicht');
  if (!q.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
  /*
   * FUND (belegt, Audit 2026-10-09, A-2): Diese Prüfung fehlte. Ein Spieler,
   * der nicht am Zug ist, konnte Kisten werfen und dabei den gemeinsamen
   * Zufallsstrom konsumieren — ein Determinismus-Bruch. Dieselbe Prüfung steht
   * im Sprung (`jump`) und gehört an jede Eingabe, die den Zufallsgenerator
   * berührt.
   */
  if (playerId !== q.activePlayerId) errors.push('Nur der aktive Spieler kann eine Waffe abwerfen');
  if (errors.length > 0) return { ok: false, errors };

  const weapon = q.getWeapon(weaponId);
  if (!weapon) return { ok: false, errors: ['Unbekannte Waffe'] };

  const entfernt = q.inventory.removeWeapon(playerId, weaponId);
  if (!entfernt.ok) return { ok: false, errors: [entfernt.reason] };

  // Die Kiste wird GESCHLEUDERT, nicht abgelegt: sie fliegt mit zufälliger
  // Anfangsgeschwindigkeit heraus, unterliegt Schwerkraft und Wind und landet
  // nach einer Flugzeit. Landung im Wasser ist ausgeschlossen (siehe
  // schrittKiste) — das ist die einzige harte Regel.
  const world = q.world;
  const startX = world.getComponent(playerId, 'Position', 'x') ?? 0;
  const startY = world.getComponent(playerId, 'Position', 'y') ?? 0;
  const wurf = rolleWurf(q);

  const crateId = world.createEntity();
  world.addComponent(crateId, 'Position', { x: startX, y: startY - 14 });
  world.addComponent(crateId, 'Velocity', { x: wurf.vx, y: wurf.vy });
  world.addComponent(crateId, 'Crate', {
    crateType: CRATE_TYPES.weapon,
    crateX: startX,
    crateY: startY - 14,
    // BEWUSSTER ZUSTAND: Index liegt bei allen 150 Waffen auf 0 (Namensräume
    // powerTier/rarity) — Begründung an der Ziehung in `systems/lootSystem.js`.
    rarity: Math.max(0, RARITY_IDS.indexOf(weapon.rarity)),
    weaponId: weapon.index,
    picked: 0,
    ammo: entfernt.ammo,
    inFlight: 1,
    flightTicks: CRATE_FLIGHT_TICKS,
  });

  // Eine abgeworfene Waffe ist keine Nachladezeit mehr wert: die Pause gehört
  // zur Waffe, und die liegt jetzt am Boden.
  q.cooldownLoeschen(`${playerId}:${weaponId}`);

  q.events.emit('weapon_dropped', {
    playerId, weaponId, crateId,
    x: startX, y: startY - 14,
    vx: wurf.vx, vy: wurf.vy,
    ammo: entfernt.ammo,
  });

  // x/y sind hier der ABWURFPUNKT. Die Landestelle steht erst nach dem Flug
  // fest und ist danach über die Kiste im Zustand abfragbar.
  return {
    ok: true, crateId, x: startX, y: startY - 14,
    vx: wurf.vx, vy: wurf.vy, ammo: entfernt.ammo,
  };
}

/**
 * Schleudert eine abgeworfene Waffe fort.
 *
 * Bewusst physikalisch statt „geprüft danebenlegen": Die Waffe fliegt mit
 * einer zufälligen Anfangsgeschwindigkeit heraus, unterliegt der Schwerkraft,
 * wird vom Wind getrieben und landet erst nach einer Flugzeit. Das wirkt wie
 * ein Wurf und nicht wie ein Ablegen.
 *
 * Die EINZIGE harte Regel: Die Kiste darf nicht im Wasser landen. Wasser
 * würde sie unerreichbar machen bzw. die Waffe versinken lassen — das wäre
 * ein Verlust ohne Gegenwert. Trifft sie auf Wasser, fliegt sie weiter, bis
 * sie festen Boden erreicht.
 *
 * @returns {{vx:number, vy:number}} Anfangsgeschwindigkeit für die Kiste
 */
export function rolleWurf(q) {
  const rng = q.rng;
  const richtung = rng.nextBoolean() ? -1 : 1;
  /*
   * Die Weite wird aus der ZIELDISTANZ gerechnet, nicht geschätzt.
   *
   * FUND (belegt, gemessen 2026-09-19): Hier stand `vx: richtung * rng(1,2 … 2,8)`.
   * Über die Flugzeit (`CRATE_FLIGHT_TICKS`) und den Luftwiderstand ergibt das
   * 48–113 px — gemessen 74 px. Damit landete die Kiste INNERHALB des
   * Aufhebe-Radius (`PICKUP_RADIUS = 110` in `systems/lootSystem.js`), wurde im
   * SELBEN Takt wieder aufgenommen und verschwand: `crate_landed` und
   * `crate_pickup` fielen zusammen, der Abwurf war wirkungslos.
   *
   * Der Mechaniktext verlangt ausdrücklich das Gegenteil: die Landestelle muss
   * AUSSERHALB des Aufhebe-Radius liegen, sonst sammelt der Werfer seine eigene
   * Waffe im nächsten Schritt wieder ein.
   *
   * Gerechnet wird die nötige Anfangsgeschwindigkeit für die gezogene
   * Zieldistanz: Die zurückgelegte Strecke ist `vx0 × Σ drag^i` über die
   * Flugticks (der Wind kommt als kleine Zugabe hinzu und wird nicht
   * eingerechnet — er darf die Landestelle nur nach außen verschieben).
   */
  const zielWeite = rng.nextFloat(PICKUP_RADIUS * 1.4, PICKUP_RADIUS * 3);
  let abklingen = 0;
  let faktor = 1;
  for (let tick = 0; tick < CRATE_FLIGHT_TICKS; tick += 1) {
    faktor *= DEFAULT_PROJECTILE_DRAG;
    abklingen += faktor;
  }
  return {
    // Kräftig nach oben und zur Seite. Die Werte zielen auf eine Flugzeit von
    // etwa einer halben bis anderthalb Sekunden: kurz genug, um den Zug nicht
    // aufzuhalten, lang genug, um den Wurf als Wurf zu erkennen.
    vx: richtung * (zielWeite / Math.max(1, abklingen)),
    vy: -rng.nextFloat(9, 14),
  };
}

/**
 * Bewegt eine fliegende Kiste einen Schritt weiter.
 *
 * Läuft im Simulationsschritt (siehe `schrittFliegendeKisten`) und nutzt
 * dieselben Kräfte wie ein Geschoss: Schwerkraft, Luftwiderstand, Wind. Der
 * Unterschied ist der Aufprall: Eine Kiste bleibt liegen statt zu explodieren,
 * und sie darf nicht ins Wasser geraten.
 *
 * @returns {boolean} true, wenn die Kiste gelandet ist
 */
export function schrittKiste(q, crateId) {
  const world = q.world;
  if (!world.isActive(crateId)) return false;
  // Nur fliegende Kisten bewegen sich (fliegend = Flag gesetzt).
  if (world.getComponent(crateId, 'Crate', 'inFlight') !== 1) return false;

  const x = world.getComponent(crateId, 'Position', 'x') ?? 0;
  const y = world.getComponent(crateId, 'Position', 'y') ?? 0;
  let vx = world.getComponent(crateId, 'Velocity', 'x') ?? 0;
  let vy = world.getComponent(crateId, 'Velocity', 'y') ?? 0;

  const wind = world.services.match?.wind ?? 0;
  // Restliche Flugzeit. Die Kiste landet erst, wenn sie abgelaufen ist —
  // eine abgeworfene Waffe soll sichtbar fliegen und nicht im nächsten Hügel
  // hängen bleiben.
  let restFlug = world.getComponent(crateId, 'Crate', 'flightTicks') ?? 0;
  if (restFlug > 0) restFlug -= 1;
  world.setComponent(crateId, 'Crate', 'flightTicks', restFlug);
  const flugVorbei = restFlug <= 0;

  // Eigene Fallbeschleunigung für Kisten: schwächer als bei Geschossen, damit
  // der Wurf sichtbar dauert. Ein Geschoss soll schnell ans Ziel, eine
  // abgeworfene Waffe soll fliegen.
  vy += CRATE_GRAVITY;
  vx += wind * 0.8;
  vx *= DEFAULT_PROJECTILE_DRAG;
  vy *= DEFAULT_PROJECTILE_DRAG;

  const nextX = x + vx;
  const nextY = y + vy;

  // Aus der Karte geflogen: zurück an den Rand holen.
  const begrenztX = Math.min(q.width - 12, Math.max(12, nextX));

  const boden = q.surfaceYAt(Math.round(begrenztX));

  // Wasser an der Landestelle? Dann NICHT landen, sondern weiterfliegen.
  // Das ist die einzige harte Regel des Abwurfs.
  const wasser = q.waterLevelAt(begrenztX, Math.max(0, boden));
  const ueberWasser = wasser > WET_LEVEL;

  // Gelände getroffen und trockener Boden: landen — aber erst nach Ablauf der
  // Mindestflugzeit.
  if (flugVorbei && boden > 0 && nextY >= boden && !ueberWasser) {
    world.setComponent(crateId, 'Position', 'x', begrenztX);
    world.setComponent(crateId, 'Position', 'y', boden);
    world.setComponent(crateId, 'Velocity', 'x', 0);
    world.setComponent(crateId, 'Velocity', 'y', 0);
    world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
    world.setComponent(crateId, 'Crate', 'crateY', boden);
    world.setComponent(crateId, 'Crate', 'inFlight', 0);
    q.events.emit('crate_landed', {
      crateId, x: begrenztX, y: boden, flightTicks: CRATE_FLIGHT_TICKS,
    });
    return true;
  }

  // Sonst weiterfliegen. Über Wasser wird die Sinkgeschwindigkeit gedämpft,
  // damit die Kiste nicht untergeht, sondern weitergetragen wird.
  if (ueberWasser && nextY >= boden) vy = Math.min(vy, 0.4);

  world.setComponent(crateId, 'Position', 'x', begrenztX);
  world.setComponent(crateId, 'Position', 'y', Math.max(0, nextY));
  world.setComponent(crateId, 'Velocity', 'x', vx);
  world.setComponent(crateId, 'Velocity', 'y', vy);
  world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
  world.setComponent(crateId, 'Crate', 'crateY', Math.max(0, nextY));
  return false;
}

/** Bewegt alle fliegenden Kisten. Läuft vor dem Physikschritt. */
export function schrittFliegendeKisten(q) {
  for (const crateId of q.world.getEntitiesBySignature(
    COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.VELOCITY,
  )) {
    schrittKiste(q, crateId);
  }
}
