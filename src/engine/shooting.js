/**
 * Der Schieß-Ablauf als eigenständige, reine Funktionen.
 *
 * ## Warum diese Datei
 *
 * `fire()` stand in `MatchController` und war 211 Zeilen lang — der heiße
 * Stein der Schießerei. Sie war gleichzeitig für Validierung, Sichtlinie,
 * Munitionsverbrauch, Selbstwirkung, Hitscan, Projektil-Spawn und Ereignisse
 * zuständig und griff dabei 20-mal in private Felder.
 *
 * Diese Datei lagert den **Ablauf** des Schießens aus. Das Muster ist dasselbe
 * wie bei `stateSnapshot.js` (W1-4a): Der Match baut eine **Quelle** — ein
 * schlichtes Objekt mit genau den Werten, die das Schießen liest — und gibt sie
 * an **reine Funktionen**. Keine Objektbindung, keine privaten Felder — nur die
 * Quelle.
 *
 * ## Was hier liegt — und was nicht
 *
 * Hier liegt der ABLAUF: `fire` (Validierung, Verzweigung, Selbstwirkung),
 * `applySelfEffect` (was ein Schuss mit dem SCHÜTZEN macht), `resolveStrike`
 * (Anflugart), `projectileLifetime`, `aimPreview`, `hasLineOfSight`,
 * `launchOrigin` und `fuseTicksFor`.
 *
 * Im Match bleiben die PRIMITIVE, die an Kartenmaß oder Terrainzugriff hängen:
 * `resolveHitscan` (Strahllänge = `maxRange × weitenFaktor(Kartenbreite)`),
 * `launchVector` (Abschussgeschwindigkeit mit `kartenbreite`), `findMuzzle` und
 * `playerAt`. `shooting.js` ruft sie über die Quelle. Eine zweite Fassung hier
 * wäre genau die Doppelregel, die `tests/reichweite-konsistenz.test.js`
 * festhält.
 *
 * ## Die Schnittstelle
 *
 * Die Quelle (`#schussQuelle()` in `match.js`) hat diese Felder:
 *
 *   world, terrain, events, inventory, statuses, players, turnOrder,
 *   shotsInFlight, width, height, status, activePlayerId, rng,
 *   isPlayerAlive(id), cooldownFor(id, weaponId), surfaceYAt(x),
 *   deployTurret(id, effect), applyTargetEffect(effect, target, attacker),
 *   applyCooldown(id, weapon),
 *   hasFired() -> boolean, markFired(id), endTurn(),
 *   resolveHitscan(ox, oy, angle, power, weapon, shooterId),
 *   findMuzzle(ox, oy, dirX, dirY, shooterId),
 *   playerAt(x, y, excludeId), launchVector(playerId, angle, power, weapon)
 *
 * Wer ein Feld umbenennt, zieht `#schussQuelle()` mit — beide gehören
 * zusammen.
 *
 * @module shooting
 */
import { validateCommand } from '../shared/validation.js';
import { getWeapon } from '../shared/config/weapons.js';
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../shared/config/classes.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { raycastSegment, simulateFlight } from '../shared/ballistics.js';
import { weitenFaktor } from '../shared/reichweite.js';
import { damageTypeId } from './damageTypes.js';
import {
  buildEffect, SELF_TARGET_KINDS, EFFECT_KIND, RANDOM_EFFECT_POOL,
} from './specials.js';

/*
 * Mindestwerte für Zufallswaffen, damit auch schwache Waffen spürbar wirken.
 * Sie standen früher in `match.js`; sie gehören zur Wirkung eines Schusses und
 * liegen deshalb hier — bei `applySelfEffect`, das sie benutzt.
 */
const SPECIAL_HEAL_MIN = 35;
const SPECIAL_SHIELD_MIN = 40;
const RANDOM_MOVE_DISTANCE = 60;

/**
 * Feuert mit der aktiven Waffe — die vollständige Schießlogik.
 *
 * Die Funktion ist ein reiner Ablauf über die `quelle`: Sie validiert, prüft
 * Sichtlinie und Munition, und verzweigt dann in Selbstwirkung, Hitscan oder
 * Projektil-Spawn. Der Match ruft sie aus `fire()` auf und meldet das
 * Ergebnis unverändert weiter.
 *
 * @param {object} quelle - die Schnittstelle (siehe Modulkopf)
 * @param {number} playerId
 * @param {number} angle
 * @param {number} power
 * @param {string|null} weaponId
 * @returns {{ok:boolean, errors?:string[], projectileId?:number|null, hit?:object|null, special?:object}}
 */
export function fire(quelle, playerId, angle, power, weaponId = null) {
  const errors = [];
  if (quelle.status !== 'playing') errors.push('Match läuft nicht');

  const command = validateCommand(
    { playerId, angle, power, weaponId, tick: quelle.world.tickCount, type: 'fire' },
    {
      currentTick: quelle.world.tickCount,
      activePlayerId: quelle.activePlayerId,
      knownPlayerIds: quelle.turnOrder,
    }
  );
  if (!command.valid) return { ok: false, errors: command.errors };
  if (errors.length > 0) return { ok: false, errors };

  if (!quelle.isPlayerAlive(playerId)) {
    return { ok: false, errors: ['Spieler ist nicht mehr aktiv'] };
  }

  const resolvedWeaponId = weaponId ?? quelle.inventory.getActiveWeaponId(playerId);
  const weapon = resolvedWeaponId ? getWeapon(resolvedWeaponId) : null;
  if (!weapon) return { ok: false, errors: ['Keine Waffe ausgewählt'] };

  // Nachladezeit prüfen, BEVOR Munition verbraucht wird — sonst kostet ein
  // abgelehnter Schuss eine Ladung.
  const restCooldown = quelle.cooldownFor(playerId, weapon.id);
  if (restCooldown > 0) {
    return {
      ok: false,
      errors: [`${weapon.displayName} lädt nach — noch ${restCooldown} ${restCooldown === 1 ? 'Zug' : 'Züge'}`],
      cooldown: restCooldown,
    };
  }

  /*
   * EIN Schuss je Zug.
   *
   * Fund (belegt): Diese Prüfung fehlte. Der Zug endet erst, wenn das Geschoss
   * verflogen ist (`#hasFired && !projectilesActive` in `step()`). Solange ein
   * Schuss noch flog, konnte derselbe Spieler ERNEUT feuern — und mit dem
   * nächsten Takt noch einmal.
   *
   * Gemessen im Aufzeichnungslauf (Seed 4242): Spieler 3 feuerte bei Takt 452
   * und 453, ohne dass dazwischen ein `turn_end` lag. Zwei Schüsse in einem
   * Zug, jeder mit voller Munition abgezogen.
   *
   * Im Mehrspieler wäre das ein Cheat: Ein Client muss nur schnell genug
   * nachlegen, bevor sein erster Schuss landet. Die bestehende Prüfung
   * ("Spieler ist nicht am Zug") greift erst NACH dem Zugwechsel und deckt
   * dieses Zeitfenster nicht ab.
   *
   * REIHENFOLGE: Diese Prüfung steht NACH Nachladezeit und Munition, nicht
   * davor. Fund (belegt): Zuerst stand sie ganz oben, und damit verdeckte sie
   * die genauere Begründung — der Test "Nachladezeit erscheint in der
   * Waffenliste und blockiert den Schuss" (Seed 4711) feuerte zweimal im selben
   * Zug und erwartete "lädt nach", bekam aber "In diesem Zug wurde bereits
   * geschossen". Beide Aussagen sind wahr; die Waffe ist die nützlichere
   * Auskunft, weil sie dem Spieler sagt, WAS ihn hindert.
   *
   * Blockiert wird in beiden Fällen — es geht nur um die Begründung.
   */
  if (quelle.hasFired()) {
    return { ok: false, errors: ['In diesem Zug wurde bereits geschossen'] };
  }

  /*
   * SICHTLINIE — steht VOR dem Munitionsverbrauch.
   *
   * Ein abgelehnter Schuss darf keine Ladung kosten (dieselbe Regel wie bei
   * der Nachladezeit oben). Selbstwirkungen (Heilung, Schild, Sprung, Buff)
   * sind ausgenommen: Sie gehen auf den Schützen und brauchen kein Ziel —
   * ein Verband benötigt keine Sichtlinie.
   *
   * FUND (belegt, gemessen 2026-09-25): `requiresLineOfSight` stand im
   * Katalog, der Motor las es nirgends. Jetzt entscheidet es über die
   * Abgabe: Ein Direktschütze (Präzision, Strahl, Plasma, Pfeil, Blitz)
   * kann nicht über Deckung schießen — dafür gibt es Steilfeuerwaffen.
   */
  if (weapon.requiresLineOfSight) {
    const sichtEffekt = buildEffect(weapon);
    const selbstwirkung = Boolean(sichtEffekt) && SELF_TARGET_KINDS.has(sichtEffekt.kind);
    if (!selbstwirkung && !hasLineOfSight(quelle, playerId, angle, power, weapon)) {
      return {
        ok: false,
        errors: [`${weapon.displayName} verlangt freie Sicht zum Ziel — die Sichtlinie ist versperrt`],
      };
    }
  }

  if (!quelle.inventory.consume(playerId, weapon.id, 1)) {
    return { ok: false, errors: ['Keine Munition'] };
  }

  const player = quelle.players.find(entry => entry.entityId === playerId);
  const profile = combatProfile(
    CLASS_IDS[player?.classId ?? 0], ARCHETYPE_IDS[player?.archetypeId ?? 0],
    player?.sidegradeId ?? null,
  );
  const { x, y, vx, vy } = quelle.launchVector(playerId, angle, power, weapon);

  quelle.world.setComponent(playerId, 'Weapon', 'angle', angle);
  quelle.world.setComponent(playerId, 'Weapon', 'power', power);
  quelle.markFired(playerId);

  /*
   * Jeder abgegebene Schuss wird gemeldet — an EINER Stelle, vor der
   * Verzweigung nach Anflugart.
   *
   * Fund (belegt): Für Projektile gab es `projectile_spawn`, für Treffer
   * `hitscan`/`projectile_impact` — aber nichts für einen Schuss, der weder
   * trifft noch ein Projektil erzeugt. Die Trefferquote (`Treffer / Schüsse`)
   * ließ sich damit nicht rechnen: Der Nenner fehlte, und für Hitscan-Waffen
   * wäre er grundsätzlich 0 gewesen.
   *
   * Die drei Wege (Selbstwirkung, Hitscan, Projektil) melden alle hier.
   */
  quelle.events.emit('shot', {
    playerId,
    weaponId: weapon.id,
    angle,
    power,
    /*
     * Die ZIELART reist im Ereignis mit.
     *
     * FUND (belegt, gemessen 2026-09-25): `weapon.targeting` stand im
     * Katalog, aber der Motor las das Feld nirgends — er entschied die
     * Frage „geht das auf den Schützen oder ins Ziel?" allein aus der
     * Wirkung (`buildEffect`/`SELF_TARGET_KINDS`). Die Designdatei
     * widersprach ihm dabei bei 11 Waffen (Heilzauber als "directional").
     * Beide Seiten sind jetzt in Übereinstimmung (`npm run check:targeting`),
     * und die Zielart steht den Verbrauchern — Anzeige, Aufzeichnung, Ton —
     * als eigenes Feld zur Verfügung.
     */
    targeting: weapon.targeting ?? null,
  });

  // Wirkungen, die auf den Schützen selbst gehen (Heilung, Schild, Sprung,
  // Munition, Aufklärung), werden sofort ausgelöst. Es wird bewusst KEIN
  // Geschoss erzeugt: ein Projektil, das nur dazu dient, den eigenen Effekt
  // auszulösen, wäre im Spiel irreführend.
  const special = buildEffect(weapon);
  if (special && SELF_TARGET_KINDS.has(special.kind)) {
    const outcome = applySelfEffect(quelle, special, playerId, weapon);
    quelle.events.emit('special_effect', {
      playerId, weaponId: weapon.id, kind: special.kind, ...outcome,
    });
    quelle.applyCooldown(playerId, weapon);
    quelle.endTurn();
    return { ok: true, projectileId: null, hit: null, special: { kind: special.kind, ...outcome } };
  }

  if (weapon.delivery === 'hitscan') {
    const hit = quelle.resolveHitscan(x, y, angle, power, weapon, playerId);
    quelle.events.emit('hitscan', { playerId, weaponId: weapon.id, ...hit });
    quelle.applyCooldown(playerId, weapon);
    return { ok: true, projectileId: null, hit };
  }

  // Anflugart: Ein Luftangriff kommt von oben auf den Zielpunkt, schwere
  // Artillerie von der Seite. Beides wird hier in Startpunkt und
  // Geschwindigkeit übersetzt — der Zielpunkt bleibt der der normalen Zielung.
  const strike = resolveStrike(quelle, weapon, x, y, angle, power);

  const projectileId = quelle.world.createEntity();

  // Abschusspunkt aus dem Körper des Schützen herausschieben.
  //
  // `x, y` ist die Fußposition auf dem Boden und liegt damit IM festen
  // Terrain. Ein Projektil, das dort entsteht, kollidiert im ersten
  // Simulationsschritt mit dem Boden und verschwindet, ohne das Ziel je zu
  // erreichen — Direktschaden war so unmöglich.
  const spawn = strike
    ? strike.spawn
    : (quelle.findMuzzle(x, y, Math.cos(angle), -Math.sin(angle), playerId) ?? { x, y });
  quelle.world.addComponent(projectileId, 'Position', { x: spawn.x, y: spawn.y });
  quelle.world.addComponent(projectileId, 'Velocity', {
    x: strike ? strike.vx : vx,
    y: strike ? strike.vy : vy,
  });
  quelle.world.addComponent(projectileId, 'Projectile', {
    owner: playerId,
    weaponId: weapon.index,
    /*
     * Die SCHADENSART reist als Zahl mit dem Geschoss.
     *
     * FUND (belegt, gemessen 2026-09-25): `weapon.damageType` stand im
     * Katalog (27 Arten), aber kein Stück Motor las ihn — jede Waffe wirkte
     * gleich. Über `damageType` im Projektil erreicht die Art jetzt das
     * Schadenereignis (`damageSystem.applyDamage` → `damage`-Event) und steht
     * damit Resistenzen, Anzeige und Aufzeichnung zur Verfügung.
     */
    damageType: damageTypeId(weapon.damageType),
    // Der Schadensbonus aus Buffs wirkt auf den tatsaechlichen Schaden.
    damage: weapon.damage * profile.damageMultiplier * quelle.statuses.damageMultiplier(playerId),
    /*
     * Der Mindestradius ist ein TREFFERFENSTER, keine Explosion.
     *
     * FUND (belegt): Hier stand `weapon.blastRadius || 24` — ein pauschaler
     * Fallback von 24 px für JEDE Waffe ohne Flächenwirkung (60 Projektile).
     * Für ein Geschoss, das aus der Mündung heraus beschleunigt, ist das ein
     * sinnvolles Trefferfenster.
     *
     * Für eine WURFWAFFE ist es falsch: Sie wird direkt am Körper abgeworfen
     * und bleibt durch ihre niedrige Geschwindigkeit (Faktor 0,3–0,6) mehrere
     * Ticks in diesem Radius. Gemessen: Der Baseballschläger verursachte am
     * SCHÜTZEN 104 Schaden bei jedem Winkel und am Ziel 0 — er traf sich
     * selbst, statt zu fliegen.
     *
     * Wurfwaffen bekommen deshalb KEIN Trefferfenster: Sie treffen direkt
     * (der Besitzer ist vom Treffer ausgeschlossen, siehe projectileSystem)
     * oder gar nicht. Ihr Krater entsteht über `terrainDamage`.
     */
    blastRadius: weapon.blastRadius
      || (weapon.category === 'melee' ? 0 : 24),
    knockback: weapon.knockback,
    drag: 0.995,
    gravityScale: weapon.gravityScale || 1,
    windFactor: 1,
    terrainDamage: weapon.terrainDamage,
    bounces: weapon.bounces,
    /*
     * Durchschlag und Zielsuche kommen aus der Waffe in das GESCHOSS.
     *
     * Das Projektil ist die einzige Stelle, an der beide wirken können: Der
     * Durchschlag entscheidet im Flug, die Zielsuche krümmt die Bahn je Tick.
     * Beide Werte sind Zahlen — der Komponentenspeicher führt nur Zahlen.
     */
    pierce: weapon.piercing > 0 ? Math.round(weapon.piercing) : 0,
    homing: weapon.homing > 0 ? weapon.homing : 0,
    letztesZiel: -1,
    pierceSchutz: 0,
    /*
     * Die Lebensdauer kommt aus EINER Quelle (`projectileLifetime`) — die KI
     * liest sie von dort und plant deshalb keine Schüsse mehr, deren Geschoss
     * mitten im Flug verfällt.
     */
    lifetime: projectileLifetime(quelle, playerId, angle, power, weapon),
    /**
     * Zünder in Ticks (0 = Aufprallwaffe). Eine Granate explodiert nicht beim
     * Aufprall, sondern nach Ablauf — sie bleibt liegen und zündet.
     *
     * ENTSCHIEDEN (2026-09-20): Die Absicht steht als `mechanic.fuseIntent` in
     * der Designdatei, der Generator leitet `fuseTime` daraus ab
     * (`npm run weapons:build`). `impact` → 0 (beim Aufprall), `timed` → die
     * gestufte Dauer. Vorher wurde die Absicht aus dem NAMEN erschlossen;
     * dadurch zündete jede Zünderwaffe erst nach der Landung, und der
     * „Explosive Energieball" war die einzige Waffe ohne Wirkung.
     *
     * Geprüft wird die Zusage von `npm run check:fuses`: `impact` verlangt
     * Zünder 0, `timed` verlangt Zünder > Flugzeit, ein Hitscan darf gar
     * keinen Zünder tragen (er erzeugt kein Geschoss, das liegen bleiben
     * könnte). Ein Verstoß endet dort mit Exit-Code 1.
     */
    fuseTicks: fuseTicksFor(weapon),
    alive: 1,
  });

  quelle.shotsInFlight.set(projectileId, weapon.id);

  quelle.events.emit('projectile_spawn', { playerId, projectileId, weaponId: weapon.id, x, y, vx, vy });
  quelle.applyCooldown(playerId, weapon);
  return { ok: true, projectileId, hit: null };
}

/**
 * Löst einen Anflugstil (sky, flank) in Startpunkt und Geschwindigkeit auf.
 *
 * Für `self` gibt die Funktion `null` zurück — dann gilt der normale Weg.
 * `sky`: Das Geschoss entsteht oberhalb des Zielpunkts und fällt herab. Der
 *   Zielpunkt wird aus der normalen Zielung bestimmt (Winkel und Kraft), nicht
 *   aus der Schützenposition: ein Luftangriff soll dort einschlagen, wohin der
 *   Schütze zielt.
 * `flank`: Das Geschoss kommt von der Seite, entgegen der Schussrichtung, und
 *   fliegt waagerecht auf den Zielpunkt zu.
 *
 * @returns {{spawn:{x:number,y:number}, vx:number, vy:number}|null}
 */
export function resolveStrike(quelle, weapon, x, y, angle, power) {
  const style = weapon?.strikeStyle ?? 'self';
  if (style === 'self') return null;

  // Zielpunkt über die normale Bahn bestimmen.
  const bahn = quelle.resolveHitscan(x, y, angle, power, weapon, null);
  const zielX = Number.isFinite(bahn.hitX) ? bahn.hitX : x;
  const zielY = Number.isFinite(bahn.hitY) ? bahn.hitY : y;

  if (style === 'sky') {
    const hoehe = 320;
    const fall = 14;
    return { spawn: { x: zielX, y: Math.max(0, zielY - hoehe) }, vx: 0, vy: fall };
  }

  // `flank`: von der Seite, aus der Richtung, aus der „geschossen" wird.
  const richtung = Math.cos(angle) >= 0 ? -1 : 1;
  const weite = 420;
  const tempo = 12;
  return {
    spawn: { x: zielX + richtung * weite, y: Math.max(0, zielY - 60) },
    vx: -richtung * tempo,
    vy: 2,
  };
}

/**
 * Zünderdauer einer Waffe in Simulationsschritten.
 * Die Waffe nennt Sekunden; die Simulation rechnet in Ticks zu 60 Hz.
 */
export function fuseTicksFor(weapon) {
  const sekunden = weapon?.fuseTime ?? 0;
  if (!(sekunden > 0)) return 0;
  return Math.max(1, Math.round(sekunden * 60));
}

/**
 * Wie viele Ticks ein Geschoss dieses Schusses lebt.
 *
 * ## Warum das eine eigene, öffentliche Methode ist
 *
 * FUND (belegt, gemessen): Die Lebensdauer des Geschosses begrenzt die
 * Flugzeit — und die Zielberechnung wusste davon nichts. Der Bot plante Bögen
 * mit 83 Ticks Flugzeit für ein Geschoss, das nach 72 Ticks verfällt
 * (`projectile_expired` mitten im Flug, gemessen an Seed 1000, Zug 3). Der
 * Schuss verschwand vor dem Ziel, und die Rechnung sah trotzdem „Treffer".
 *
 * @returns {number} Ticks
 */
export function projectileLifetime(quelle, playerId, angle, power, weapon = null) {
  const waffe = weapon ?? getWeapon(quelle.inventory.getActiveWeaponId(playerId));
  if (!waffe) return 30;
  const { vx, vy } = quelle.launchVector(playerId, angle, power, waffe);
  /*
   * Lebensdauer aus der eigenen Reichweite und der TATSÄCHLICHEN
   * Anfangsgeschwindigkeit: sonst verfällt ein schnelles Geschoss mitten im
   * Flug oder ein langsames bleibt unnötig lange bestehen.
   *
   * UND aus der KARTE (FUND belegt, gemessen 2026-09-19): Der Deckel lautet
   * `maxRange * 1,5` — mit einem kartenunabhängigen Katalogwert. Seit die
   * ballistische Weite mit der Kartenbreite wächst, schneidet er sie ab:
   * gemessen über 150 Waffen × 3 Klassen greift er bei **96 von 285**
   * Kombinationen, am stärksten bei Artillerie auf 2560 px (Weite 2367 px
   * gegen Deckel 1593 px — es fehlen 774 px). Deshalb skaliert `maxRange`
   * hier mit dem WEITENfaktor der Karte.
   */
  const reichweite = waffe.maxRange * weitenFaktor(quelle.width);
  return Math.max(30, Math.round(
    reichweite / Math.max(1, Math.hypot(vx, vy)),
  ) * 1.5, fuseTicksFor(waffe) + 30);
}

/**
 * Zielvorschau: simuliert die Flugbahn mit exakt derselben Physik wie das
 * ProjectileSystem (Gravitation, Wind, Drag) und bricht beim ersten
 * Terraintreffer ab.
 *
 * Die Schleife ist NICHT hier nachgebaut, sondern `simulateFlight` aus
 * `src/shared/ballistics.js` — dieselbe Funktion, die die clientseitige
 * Vorhersage und die Bot-KI benutzen. Eine eigene Kopie war der Ursprung des
 * Ballistik-Fehlers im Geschütz-Pfad (siehe `tests/turret-ballistics.test.js`).
 *
 * @returns {{x:number,y:number}[]}
 */
export function aimPreview(quelle, playerId, angle, power, steps = 180, weapon = null) {
  if (!quelle.isPlayerAlive(playerId)) return [];
  // Die Vorschau muss dieselbe Geschwindigkeit nutzen wie der echte Schuss,
  // sonst zeigt sie eine Bahn, die die Waffe nicht fliegt.
  const waffe = weapon ?? getWeapon(quelle.inventory.getActiveWeaponId(playerId));
  const launch = quelle.launchVector(playerId, angle, power, waffe);

  const bahn = simulateFlight({
    x: launch.x,
    y: launch.y,
    angle,
    power,
    speed: launch.speed,
    // Der Schwerkraftfaktor der Waffe gehört dazu: 28 der 150 Waffen fliegen
    // mit einem anderen Faktor, und ohne ihn zeigte die Vorschau dort eine
    // Bahn, die das Projektil nicht fliegt.
    gravityScale: waffe?.gravityScale ?? 1,
    wind: quelle.world.services.match.wind ?? 0,
    steps,
    sampleEvery: 3,
    /*
     * Ohne Startpunkt: `aimPreview` liefert seit jeher die Punkte NACH dem
     * ersten Schritt, und Aufrufer lesen `punkte[0]` als ersten Schritt
     * (`tests/sidegrades-match.test.js`, `tests/shot-prediction.test.js`
     * vergleicht den letzten Punkt mit dem Einschlag).
     */
    includeStart: false,
    isSolid: (x, y) => quelle.terrain.isSolid(x, y),
    bounds: { minX: 0, maxX: quelle.width, minY: 0, maxY: quelle.height },
  });
  return bahn.points;
}

/**
 * Freie Sichtlinie für einen Schuss?
 *
 * ## Was hier gemessen wird
 *
 * Geprüft wird die GERADE von der Mündung in Zielrichtung — bis zur
 * Reichweite der Waffe bzw. bis zum Kartenrand. Liegt Gestein auf dieser
 * Geraden, hat der Schütze in dieser Richtung keine Sicht und der Schuss
 * wird abgelehnt.
 *
 * ## Warum die Zielgerade und nicht die Flugbahn
 *
 * Der naheliegende Ansatz — die Bahn simulieren und die Sehne von der
 * Mündung zum Einschlag prüfen — wurde gebaut und VERWORFEN. Er ist an
 * einem Grenzfall gescheitert: Trifft das Geschoss 20 px vor der Mündung auf
 * eine Wand, dann IST der Einschlag die Wand, und die Sehne dorthin ist
 * trivial frei. Der Schütze hätte „Sicht" gemeldet bekommen, obwohl er in
 * eine Wand direkt vor sich schießt.
 *
 * Die Zielgerade kennt diesen Grenzfall nicht: Sie geht von der Mündung aus
 * und trifft die Wand nach 20 px — gesperrt. Sie ist außerdem unabhängig von
 * Kraft und Schwerkraft, also allein eine Aussage über die Richtung.
 *
 * ## Steilfeuer ist ausgenommen — über das Merkmal, nicht über diese Funktion
 *
 * Mörser, Granaten und das Geschütz schießen über Deckung hinweg. Bei ihnen
 * ist `requiresLineOfSight` false, deshalb wird diese Funktion für sie gar
 * nicht erst befragt.
 *
 * FUND (belegt, gemessen 2026-09-25): Das Merkmal stand im Katalog, der
 * Motor las es nirgends — eine Zusage ohne Wirkung.
 *
 * @returns {boolean} true, wenn die Zielgerade frei ist
 */
export function hasLineOfSight(quelle, playerId, angle, power, weapon = null) {
  const waffe = weapon ?? getWeapon(quelle.inventory.getActiveWeaponId(playerId));
  if (!waffe) return false;

  const launch = quelle.launchVector(playerId, angle, power, waffe);
  const dirX = Math.cos(angle);
  const dirY = -Math.sin(angle);
  const start = quelle.findMuzzle(launch.x, launch.y, dirX, dirY, playerId);
  // Kein freies Feld in Schussrichtung: Der Schütze steht mit der Mündung in
  // der Wand — eine Sichtlinie gibt es dann nicht.
  if (start === null) return false;

  /*
   * Länge der Zielgeraden: die Reichweite der Waffe, aber nie über den
   * Kartenrand hinaus. Sonst meldete der Rand („Rand ist fest", siehe
   * `CollisionMask.isSolid`) eine Sichtlinie als versperrt, die offen ist.
   * Deshalb wird gegen den tatsächlichen Rand gekürzt, nicht gegen eine
   * feste Zahl.
   */
  let laenge = Math.max(1, (waffe.maxRange || 0) * weitenFaktor(quelle.width));
  if (dirX > 1e-6) laenge = Math.min(laenge, (quelle.width - 1 - start.x) / dirX);
  else if (dirX < -1e-6) laenge = Math.min(laenge, (0 - start.x) / dirX);
  if (dirY < -1e-6) laenge = Math.min(laenge, (0 - start.y) / dirY);
  else if (dirY > 1e-6) laenge = Math.min(laenge, (quelle.height - 1 - start.y) / dirY);
  if (!Number.isFinite(laenge) || laenge <= 1) return false;

  const blocker = raycastSegment(start.x, start.y, start.x + dirX * laenge, start.y + dirY * laenge, {
    isSolid: (x, y) => quelle.terrain.isSolid(x, y),
  });
  return blocker === null;
}

/**
 * Der Punkt, an dem ein Schuss WIRKLICH beginnt — die Mündung.
 *
 * `fire()` schiebt den Abschusspunkt aus dem Körper des Schützen heraus
 * (`findMuzzle`): Ein Projektil, das in der Fußposition entsteht, kollidiert
 * im ersten Schritt mit dem Boden. Wer den Schuss vorausberechnen will
 * (Bot-KI, Vorhersage, Waffenprüfung), muss denselben Punkt nehmen — sonst
 * rechnet er ab einer anderen Stelle und trifft daneben, obwohl die Rechnung
 * stimmt.
 *
 * Die Mündung hängt vom WINKEL ab (sie wird entlang der Schussrichtung
 * gesucht), deshalb ist der Winkel Parameter und nicht die Richtung.
 *
 * @returns {{x:number,y:number}} Mündung; fällt auf die Schützenposition
 *   zurück, wenn in Schussrichtung kein freies Feld liegt (dann lehnt
 *   `fire()` den Schuss ohnehin ab)
 */
export function launchOrigin(quelle, playerId, angle) {
  const x = quelle.world.getComponent(playerId, 'Position', 'x') ?? 0;
  const y = quelle.world.getComponent(playerId, 'Position', 'y') ?? 0;
  return quelle.findMuzzle(x, y, Math.cos(angle), -Math.sin(angle), playerId) ?? { x, y };
}

/**
 * Wendet eine Wirkung auf den SCHÜTZEN an.
 *
 * Hier liegt, was ein Schuss mit dem Schützen macht: Heilung, Schild,
 * Schadensbonus, Rüstung, Munition, Verschiebung, Geschütz, Aufklärung und
 * die Zufallswirkung. Sie gehörte früher in `match.js`; sie ist Teil dessen,
 * was ein Schuss BEWIRKT, und liegt deshalb bei `fire`.
 *
 * @param {object} quelle - die Schnittstelle (siehe Modulkopf)
 * @param {object} effect - aus buildEffect()
 * @returns {object} Beschreibung des tatsächlichen Ergebnisses
 */
export function applySelfEffect(quelle, effect, playerId, weapon) {
  switch (effect.kind) {
    case EFFECT_KIND.HEAL: {
      const health = quelle.world.getComponent(playerId, 'Health', 'current') ?? 0;
      const max = quelle.world.getComponent(playerId, 'Health', 'max') ?? 0;
      // Heilung wird begrenzt: das Schild zählt mit, sonst wäre Heilung bei
      // vollem Schild wirkungslos verpufft.
      const headroom = Math.max(0, max - health);
      const healed = Math.min(effect.amount, headroom);
      if (healed > 0) quelle.world.setComponent(playerId, 'Health', 'current', health + healed);
      return { healed, amount: effect.amount };
    }

    case EFFECT_KIND.SHIELD: {
      const shield = quelle.statuses.addShield(playerId, effect.amount);
      return { shield, amount: effect.amount };
    }

    case EFFECT_KIND.DAMAGE_BOOST: {
      const multiplier = quelle.statuses.addBoost(playerId, effect.multiplier, 2);
      return { multiplier };
    }

    case EFFECT_KIND.ARMOR: {
      const reduction = quelle.statuses.addArmor(playerId, effect.reduction);
      return { reduction };
    }

    case EFFECT_KIND.AMMO: {
      const restored = restoreAmmo(quelle, playerId, effect.amount);
      return { restored };
    }

    case EFFECT_KIND.MOVE: {
      const moved = shiftPlayer(quelle, playerId, effect.distance);
      return { moved };
    }

    case EFFECT_KIND.TURRET: {
      const turret = quelle.deployTurret(playerId, effect);
      // Ohne freien Platz in der Nähe wird nicht aufgestellt — ein Geschütz im
      // Fels wäre unsichtbar und nutzlos. Der Aufrufer meldet das.
      return turret
        ? { turretId: turret.entityId, x: turret.x, y: turret.y, rounds: turret.roundsLeft }
        : { turretId: null, reason: 'kein Platz für ein Geschütz' };
    }

    case EFFECT_KIND.REVEAL: {
      const turns = quelle.statuses.reveal(playerId, effect.turns);
      return { revealedTurns: turns };
    }

    case EFFECT_KIND.RANDOM: {
      // Auswahl über den Match-Zufallsgenerator: bei gleichem Seed dieselbe
      // Wirkung. Bewusst NICHT Math.random — sonst wäre ein Replay nicht mehr
      // reproduzierbar.
      const pool = effect.pool?.length ? effect.pool : RANDOM_EFFECT_POOL;
      const gewaehlt = pool[quelle.rng.nextIntBelow(pool.length)];
      const unterEffekt = buildSubEffect(gewaehlt, weapon);
      const outcome = applySelfEffect(quelle, unterEffekt, playerId, weapon);
      return { randomKind: gewaehlt, ...outcome };
    }

    default:
      return { ignored: effect.kind, weaponId: weapon?.id ?? null };
  }
}

/**
 * Baut den konkreten Effekt für eine gewählte Wirkungsart.
 * Nötig für Zufallswaffen, deren Ziel erst beim Auslösen feststeht.
 */
function buildSubEffect(kind, weapon) {
  const schaden = weapon?.damage ?? 0;
  switch (kind) {
    case EFFECT_KIND.HEAL:
      return { kind, amount: Math.max(SPECIAL_HEAL_MIN, Math.round(schaden * 1.2)) };
    case EFFECT_KIND.SHIELD:
      return { kind, amount: Math.max(SPECIAL_SHIELD_MIN, Math.round(schaden * 1.1)) };
    case EFFECT_KIND.DAMAGE_BOOST:
      return { kind, multiplier: 1.5 };
    case EFFECT_KIND.ARMOR:
      return { kind, reduction: 0.3 };
    case EFFECT_KIND.AMMO:
      return { kind, amount: 3 };
    case EFFECT_KIND.MOVE:
      return { kind, distance: RANDOM_MOVE_DISTANCE };
    default:
      return { kind: EFFECT_KIND.HEAL, amount: SPECIAL_HEAL_MIN };
  }
}

/**
 * Füllt Munition der Waffen eines Spielers auf.
 *
 * Es wird von der ERSTEN Waffe an aufgefüllt, deren Vorrat nicht unbegrenzt
 * ist. Dadurch ist das Ergebnis deterministisch und unabhängig von der
 * Reihenfolge im Inventar.
 *
 * @returns {number} tatsächlich aufgefüllte Ladungen
 */
function restoreAmmo(quelle, playerId, amount) {
  const weapons = quelle.inventory.getWeapons(playerId);
  let remaining = Math.max(0, Math.floor(amount));
  let restored = 0;

  for (const weaponId of weapons) {
    if (remaining <= 0) break;
    const weapon = getWeapon(weaponId);
    if (!weapon) continue;
    const current = quelle.inventory.getAmmo(playerId, weaponId);
    if (!Number.isFinite(current)) continue; // unbegrenzt: nichts aufzufüllen

    const capacity = Math.max(1, weapon.maxAmmo || 1);
    const fehlt = Math.max(0, capacity - current);
    const give = Math.min(remaining, fehlt);
    if (give <= 0) continue;

    quelle.inventory.grantAmmo(playerId, weaponId, give);
    remaining -= give;
    restored += give;
  }
  return restored;
}

/**
 * Versetzt einen Spieler entlang der Geländeoberfläche.
 *
 * Für Sprung- und Teleportwaffen. Die Bewegung ist bewusst auf einen
 * Geländepunkt begrenzt: ein Teleport in festes Terrain oder aus der Karte
 * heraus wäre ein Fehler, kein Feature.
 *
 * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
 */
function shiftPlayer(quelle, playerId, distance) {
  const startX = quelle.world.getComponent(playerId, 'Position', 'x') ?? 0;
  const startY = quelle.world.getComponent(playerId, 'Position', 'y') ?? 0;

  // In der aktuellen Blickrichtung nach vorne, sofern das Ziel frei ist;
  // sonst ein Stück zurück. Beides wird auf dem Gelände verankert.
  const candidates = [startX + distance, startX - distance];
  for (const targetX of candidates) {
    if (targetX < PLAYER_HALF_WIDTH || targetX > quelle.width - PLAYER_HALF_WIDTH) continue;
    const surface = quelle.surfaceYAt(Math.round(targetX));
    if (surface < 0) continue;
    // Kein Platz für eine stehende Figur (z. B. Wand): nächster Kandidat.
    if (quelle.terrain.isSolid(Math.floor(targetX), Math.floor(surface - PLAYER_HALF_HEIGHT))) continue;

    quelle.world.setComponent(playerId, 'Position', 'x', targetX);
    quelle.world.setComponent(playerId, 'Position', 'y', surface);
    quelle.world.setComponent(playerId, 'Velocity', 'x', 0);
    quelle.world.setComponent(playerId, 'Velocity', 'y', 0);
    return { dx: targetX - startX, dy: surface - startY };
  }
  return { dx: 0, dy: 0 };
}

export default {
  fire,
  resolveStrike,
  fuseTicksFor,
  projectileLifetime,
  aimPreview,
  hasLineOfSight,
  launchOrigin,
  applySelfEffect,
};