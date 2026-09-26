/**
 * Der Ansichtszustand eines Matches und sein Hash — als REINE Funktionen.
 *
 * AUSGEZOGEN aus `src/engine/match.js` (Zerlegung 2026-09-20, Schritt 2).
 *
 * Der Hash ist die Determinismus-Zusage dieses Projekts: Er fasst den
 * vollständigen Spielzustand zu einer Zeichenkette zusammen, und zwei Läufe mit
 * demselben Seed und denselben Eingaben müssen DENSELBEN Hash ergeben
 * (`npm run replay -- record` + `--verify`).
 *
 * Den gültigen Hash nennt das WERKZEUG, nicht diese Zeile: `808ac5eb` stand hier
 * seit Schritt 2 und war beim Auszug richtig — mit dem gewachsenen Waffenkatalog
 * ist er veraltet. Beim Umbau von Schritt 4a gemessen: `9ec63e8c` (vor UND nach
 * dem Umbau derselbe). Eine von Hand gepflegte Zahl in einer Quelldatei kann
 * nicht „richtig bleiben", sie kann nur irgendwann falsch sein — dieselbe Lehre
 * wie bei `npm run check:docs`. Die Zahl ist trotzdem nützlich: Wer den Hash
 * ändert, sieht, dass er den Determinismus-Beleg berührt.
 *
 * Als Methode zog er seine Daten aus der halben Spielklasse; hier bekommt er den
 * Ansichtszustand als Argument und rechnet. Das macht ihn prüfbar: gleiche
 * Eingabe → gleicher Hash, ohne ein Match aufbauen zu müssen.
 *
 * Seit Schritt 4a (2026-09-26) liegt auch der AUFBAU des Zustands hier:
 * `baueAnsichtszustand(quelle)` ersetzt den 149-Zeilen-Rumpf von `getState()`,
 * der 39-mal in private Felder griff. Die Methode in `match.js` sammelt die
 * Eingaben (`#zustandsQuelle()`) und delegiert — die Kopplung an die Klasse
 * steht damit an EINER Stelle statt verstreut im Zustandsaufbau.
 */

import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';

/**
 * Baut den Ansichtszustand eines Matches.
 *
 * ## Reine Funktion, keine Klassenbindung
 *
 * Diese Funktion greift auf nichts außer ihrem Argument zu. Alles, was sie
 * braucht — Spielerliste, Welt, Ausrüstung, Matchzahlen, Geschütze — steht in
 * `quelle` (siehe `MatchController#zustandsQuelle()` in `engine/match.js`).
 * Damit ist der Zustandsaufbau gegen FESTE EINGABEN prüfbar; vorher ging das nur
 * mit einem laufenden Match. Die Bindung an die Spielklasse steht an EINER
 * Stelle — in `match.js`, nicht hier.
 *
 * ## FALLE: Feldnamen und Feldreihenfolge sind Vertrag
 *
 * Das Ergebnis geht an den Client, an den Server UND an `hashState()`. Der Hash
 * bildet die Reihenfolge der Felder mit: Ein Umsortieren, das den Spielzustand
 * nicht ändert, ändert den Hash — und damit die Determinismus-Zusage. Wer hier
 * ein Feld verschiebt, einfügt oder umbenennt, muss die Replay-Prüfung
 * (`npm run replay -- record` + `play --verify`) neu belegen. Ein Feld, das nur
 * innen sichtbar war, darf in `stateHash()` keine Spur hinterlassen — deshalb
 * steht die Feldliste von `hashState()` als Leser des Ergebnisses hier direkt
 * darunter.
 *
 * @param {object} quelle - die Werte, die der Zustand liest:
 *   `players`, `world`, `waterLevelAt(x, y)`, `inventory`,
 *   `cooldownFor(playerId, weaponId)`, `status`, `round`, `maxRounds`, `wind`,
 *   `turnElapsedMs`, `turnDurationMs`, `activePlayerId`, `winnerTeamId`,
 *   `statuses`, `maelstrom`, `turrets`, `terrainWidth`, `terrainHeight`,
 *   `orientation`, `guenther`, `scenery`
 * @returns {object} der Ansichtszustand in unveränderter Feldreihenfolge
 */
export function baueAnsichtszustand(quelle) {
  const entities = quelle.players.map(entry => {
    /*
     * `alive` ist der Lebensstatus des SPIELERS, nicht die Belegung des
     * ECS-Platzes.
     *
     * Fund (belegt): Beides fiel auseinander, weil das ECS die IDs
     * gefallener Entities neu vergibt. Die Anzeige meldete eine tote Figur
     * dann als lebendig mit 0 Leben — und zeichnete sie weiter, weil die
     * Position einer Kiste gelesen wurde, die inzwischen dieselbe ID trug.
     */
    const alive = entry.alive;
    return {
      entityId: entry.entityId,
      teamId: entry.teamId,
      classId: entry.classId,
      archetypeId: entry.archetypeId,
      /**
       * Der Sidegrade des Spielers (oder null).
       *
       * Er gehört in den Zustand, weil die Anzeige ihn braucht: Ohne ihn
       * müsste der Client raten, mit welchem Profil eine Figur rechnet — und
       * die Winkelvorschau zeigte eine Bahn, die der Server anders rechnet.
       * `classId`/`archetypeId` stehen aus demselben Grund hier.
       */
      sidegradeId: entry.sidegradeId ?? null,
      label: entry.label,
      alive,
      x: alive ? quelle.world.getComponent(entry.entityId, 'Position', 'x') : 0,
      y: alive ? quelle.world.getComponent(entry.entityId, 'Position', 'y') : 0,
      /**
       * Füllstand des Wassers an der Position der Figur (0..1).
       *
       * Ohne diesen Wert konnte die Anzeige weder „nass" noch „ertrinkt"
       * zeigen: Die Schwellen kannte nur das CharacterSystem, und übertragen
       * wurde nichts davon. Der Wert wird gerundet, damit Anzeige und
       * Drahtformat (ein Byte) dieselbe Zahl sehen.
       */
      waterLevel: alive
        ? Math.round(quelle.waterLevelAt(
          quelle.world.getComponent(entry.entityId, 'Position', 'x'),
          quelle.world.getComponent(entry.entityId, 'Position', 'y'),
        ) * 1000) / 1000
        : 0,
      health: alive ? quelle.world.getComponent(entry.entityId, 'Health', 'current') : 0,
      maxHealth: alive ? quelle.world.getComponent(entry.entityId, 'Health', 'max') : 0,
      angle: alive ? quelle.world.getComponent(entry.entityId, 'Weapon', 'angle') : 0,
      power: alive ? quelle.world.getComponent(entry.entityId, 'Weapon', 'power') : 0,
      activeWeaponId: quelle.inventory.getActiveWeaponId(entry.entityId),
      inventory: quelle.inventory.getWeapons(entry.entityId),
      /** Verbleibende Nachladezeit je Waffe in Zügen (nur belegte Waffen). */
      cooldowns: Object.fromEntries(
        quelle.inventory.getWeapons(entry.entityId)
          .map(weaponId => [weaponId, quelle.cooldownFor(entry.entityId, weaponId)])
          .filter(([, rest]) => rest > 0),
      ),
      ammo: Object.fromEntries(
        quelle.inventory.getWeapons(entry.entityId).map(weaponId => {
          const amount = quelle.inventory.getAmmo(entry.entityId, weaponId);
          return [weaponId, Number.isFinite(amount) ? amount : 'unbegrenzt'];
        })
      ),
    };
  });

  const projectiles = [];
  for (const id of quelle.world.getEntitiesBySignature(
    COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.PROJECTILE
  )) {
    if (!quelle.world.isActive(id)) continue;
    const fuseTicks = quelle.world.getComponent(id, 'Projectile', 'fuseTicks') || 0;
    projectiles.push({
      entityId: id,
      x: quelle.world.getComponent(id, 'Position', 'x'),
      y: quelle.world.getComponent(id, 'Position', 'y'),
      owner: quelle.world.getComponent(id, 'Projectile', 'owner'),
      // Zünder in Sekunden, damit die Anzeige den Countdown zeigen kann.
      // Bewusst in Sekunden und nicht in Ticks: die Anzeige soll die Zeit
      // zeigen, die der Spieler auch wahrnimmt.
      fuseSeconds: fuseTicks > 0 ? Math.round((fuseTicks / 60) * 10) / 10 : 0,
    });
  }

  const crates = [];
  for (const id of quelle.world.getEntitiesBySignature(
    COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION
  )) {
    if (!quelle.world.isActive(id)) continue;
    crates.push({
      entityId: id,
      x: quelle.world.getComponent(id, 'Position', 'x'),
      y: quelle.world.getComponent(id, 'Position', 'y'),
      crateType: quelle.world.getComponent(id, 'Crate', 'crateType'),
      rarity: quelle.world.getComponent(id, 'Crate', 'rarity'),
    });
  }

  return {
    status: quelle.status,
    round: quelle.round,
    maxRounds: quelle.maxRounds,
    wind: quelle.wind,
    tick: quelle.world.tickCount,
    turnElapsedMs: quelle.turnElapsedMs,
    turnDurationMs: quelle.turnDurationMs,
    activePlayerId: quelle.activePlayerId,
    winnerTeamId: quelle.winnerTeamId,
    /**
     * Laufende Zustände je Spieler-ID (Schild, Einfrieren, Schaden über Zeit,
     * Schadensbonus). Für die Anzeige und für Tests.
     */
    statuses: quelle.statuses,
    maelstrom: {
      active: quelle.maelstrom.active,
      inset: quelle.maelstrom.inset,
    },
    entities,
    projectiles,
    crates,
    /*
     * Aufgestellte Geschütze.
     *
     * Sie stehen im Zustand, damit die Anzeige sie zeigen kann — und damit
     * Tests sie prüfen können, ohne in private Felder zu greifen.
     */
    turrets: quelle.turrets.map(t => ({
      entityId: t.entityId,
      teamId: t.teamId,
      ownerId: t.ownerId,
      x: t.x,
      y: t.y,
      damage: t.damage,
      range: t.range,
      roundsLeft: t.roundsLeft,
    })),
    terrainWidth: quelle.terrainWidth,
    terrainHeight: quelle.terrainHeight,
    orientation: quelle.orientation,
    guenther: quelle.guenther,
    // Die Kulisse geht als Kennung mit, nicht als volles Objekt: der Client
    // baut sie ohnehin selbst aus dem Seed. Die Kennungen dienen der Anzeige
    // und den Tests.
    scenery: {
      biomeId: quelle.scenery.biomeId,
      skyId: quelle.scenery.skyId,
      waterId: quelle.scenery.waterId,
    },
  };
}

/**
 * Bildet den Ansichtszustand auf einen Hash ab.
 *
 * Verwendet FNV-1a über eine feste Feldliste, damit die REIHENFOLGE der Felder
 * Teil des Verfahrens ist: Eine Umsortierung, die den Zustand nicht ändert, darf
 * den Hash nicht ändern — eine fehlende Angabe dagegen muss auffallen.
 *
 * @param {object} state - der Rückgabewert von `getState()`
 * @returns {string} Hash als Hex-Zeichenkette
 */
export function hashState(state) {

    /*
     * Die Figuren möglichst vollständig: Ausrüstung und Munition gehören dazu,
     * weil sie das Ergebnis des Matches verändern (eine andere Waffe trifft
     * anders).
     */
    const entities = state.entities.map(e => [
      e.entityId,
      e.alive,
      Math.round(e.x),
      Math.round(e.y),
      Math.round(e.health),
      e.activeWeaponId ?? null,
      // Die Waffenliste als Zeichenkette, damit die Reihenfolge zählt.
      Array.isArray(e.inventory) ? e.inventory.join('|') : (e.inventory ?? null),
      // Munition je Waffe, ebenfalls reihenfolgestabil.
      e.ammo && typeof e.ammo === 'object'
        ? Object.keys(e.ammo).sort().map(k => `${k}:${e.ammo[k]}`).join('|')
        : (e.ammo ?? null),
      // Laufende Abklingzeiten beeinflussen, wann wieder gefeuert werden darf.
      e.cooldowns && typeof e.cooldowns === 'object'
        ? Object.keys(e.cooldowns).sort().map(k => `${k}:${e.cooldowns[k]}`).join('|')
        : (e.cooldowns ?? null),
    ]);

    /*
     * Zustände (Schild, eingefroren, brennend …). Die Schlüssel werden SORTIERT,
     * damit die Hash-Bildung nicht von der Einfügereihenfolge abhängt — eine
     * nicht-deterministische Iteration wäre hier ein Fehler in genau dem
     * Werkzeug, das Determinismus belegen soll.
     */
    const zustaende = state.statuses && typeof state.statuses === 'object'
      ? Object.keys(state.statuses).sort().map(k => [k, JSON.stringify(state.statuses[k])])
      : null;

    const payload = JSON.stringify({
      round: state.round,
      tick: state.tick,
      wind: state.wind,
      activePlayerId: state.activePlayerId,
      winnerTeamId: state.winnerTeamId ?? null,
      turnElapsedMs: Math.round(state.turnElapsedMs ?? 0),
      entities,
      projectiles: state.projectiles.map(p => [p.entityId, Math.round(p.x), Math.round(p.y)]),
      statuses: zustaende,
      turrets: (state.turrets ?? []).map(t => [t.entityId ?? null, Math.round(t.x), Math.round(t.y), t.rounds ?? null]),
      maelstrom: state.maelstrom
        ? [Boolean(state.maelstrom.active), Math.round((state.maelstrom.inset ?? 0) * 1000)]
        : null,
      /*
       * Kisten: ALLE Felder, die den Inhalt beschreiben.
       *
       * FUND (belegt, im Test): Hier stand `c.weaponId` — ein Feld, das es bei
       * Kisten nicht gibt (`{entityId, x, y, crateType, rarity}`). Der Wert war
       * damit immer `null`, und eine Kiste mit anderem Inhalt blieb im Hash
       * unsichtbar. Ein Test hat es aufgedeckt.
       */
      crates: (state.crates ?? []).map(c => [
        c.entityId ?? null,
        Math.round(c.x),
        Math.round(c.y),
        c.crateType ?? null,
        c.rarity ?? null,
        c.weaponId ?? null,
      ]),
    });

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}
