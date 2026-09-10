/**
 * Spezialeffekte der Waffen.
 *
 * Die Quelldatei nennt je Waffe einen `special`. Viele davon sind reine
 * Beschreibungen desselben Mechanismus (Schaden, Flächenwirkung, Terrain-Abbau)
 * und brauchen keine eigene Logik. Ein Teil beschreibt jedoch Wirkungen, die
 * über Schaden hinausgehen: Heilung, Schild, Bewegung, Munition, Einfrieren und
 * Schaden über Zeit. Ohne sie sind diese Waffen im Spiel wirkungslos.
 *
 * Aufbau:
 *  - `SPECIAL_EFFECTS` ordnet jedem Namen aus dem Katalog einen normalisierten
 *    Effekt zu (Art + Parameter). Unbekannte Namen bleiben ohne Wirkung, statt
 *    einen Fehler zu werfen — der Katalog enthält über 140 Namen und wächst.
 *  - `StatusStore` hält die laufenden Zustände je Spieler.
 *
 * Bewusste Entscheidungen:
 *  - Wirkungsdauern zählen in ZÜGEN, nicht in Millisekunden. Das ist
 *    deterministisch, unabhängig von der Zugzeit und in Replays stabil.
 *  - Der Speicher liegt außerhalb des ECS, wie das Inventar: die Zustände sind
 *    spielerbezogen und benötigen keine Typed-Array-Dichte.
 *  - Alle Zufallswerte kommen aus einem übergebenen Zufallsgenerator, niemals
 *    aus `Math.random()`.
 *
 * @module specials
 */

/** Art einer Wirkung. */
export const EFFECT_KIND = Object.freeze({
  HEAL: 'heal',
  SHIELD: 'shield',
  DAMAGE_BOOST: 'damage_boost',
  ARMOR: 'armor',
  FREEZE: 'freeze',
  DAMAGE_OVER_TIME: 'damage_over_time',
  AMMO: 'ammo',
  MOVE: 'move',
  REVEAL: 'reveal',
  /**
   * Zieht das ZIEL zum Schützen. Anders als MOVE wirkt das nicht auf den
   * Schützen: ein Enterhaken an einer Nahkampfwaffe zieht den Gegner heran,
   * statt den Angreifer zu bewegen.
   */
  PULL: 'pull',
  /**
   * Wirkung, die eine der aufgeführten Wirkungen zufällig auswählt. Der Zufall
   * kommt aus dem Match-Zufallsgenerator, ist also reproduzierbar — „zufällig"
   * heißt hier: bei gleichem Seed dieselbe Wahl, nicht unvorhersehbar.
   */
  RANDOM: 'random',
});

/** Wirkungen, aus denen eine Zufallswaffe wählen kann. */
export const RANDOM_EFFECT_POOL = Object.freeze([
  EFFECT_KIND.HEAL,
  EFFECT_KIND.SHIELD,
  EFFECT_KIND.DAMAGE_BOOST,
  EFFECT_KIND.ARMOR,
  EFFECT_KIND.AMMO,
  EFFECT_KIND.MOVE,
]);

/**
 * Wirkungen, die auf den Schützen selbst gehen.
 * Alles andere wirkt auf das getroffene Ziel.
 */
export const SELF_TARGET_KINDS = Object.freeze(new Set([
  EFFECT_KIND.HEAL,
  EFFECT_KIND.SHIELD,
  EFFECT_KIND.DAMAGE_BOOST,
  EFFECT_KIND.ARMOR,
  EFFECT_KIND.AMMO,
  EFFECT_KIND.MOVE,
  EFFECT_KIND.REVEAL,
  EFFECT_KIND.RANDOM,
]));

/** Standardwerte, wenn eine Waffe keine eigenen Zahlen mitbringt. */
export const SPECIAL_DEFAULTS = Object.freeze({
  healAmount: 35,
  shieldAmount: 40,
  boostMultiplier: 1.5,
  armorReduction: 0.3,
  freezeTurns: 1,
  dotDamagePerTurn: 8,
  dotTurns: 3,
  ammoAmount: 3,
  moveDistance: 60,
  pullDistance: 90,
  revealTurns: 2,
  /** Obergrenze, damit Summen aus mehreren Quellen nicht entgleisen. */
  maxShield: 120,
  maxTurns: 5,
});

/**
 * Zuordnung der Katalognamen zu normalisierten Wirkungen.
 *
 * Mehrere Namen teilen sich denselben Effekt — das ist beabsichtigt: die Quelle
 * verwendet für denselben Mechanismus unterschiedliche Bezeichnungen (z. B.
 * `instant_heal`, `shield_heal`, `heal`). Die Zuordnung ist damit die
 * vollständige Liste der Wirkungen und zugleich die Dokumentation, welche Namen
 * bewusst OHNE Wirkung bleiben (reine Beschreibungen von Schaden/Fläche).
 */
export const SPECIAL_EFFECTS = Object.freeze({
  // ---------------------------------------------------------------- Heilung
  heal: { kind: EFFECT_KIND.HEAL },
  instant_heal: { kind: EFFECT_KIND.HEAL },
  guardian: { kind: EFFECT_KIND.HEAL },
  blood_ritual: { kind: EFFECT_KIND.HEAL },
  // Schild zuerst, dann Heilung: der Schild ist die stärkere Wirkung.
  shield_heal: { kind: EFFECT_KIND.SHIELD },
  shield_freeze: { kind: EFFECT_KIND.SHIELD },
  guardian_ultimate: { kind: EFFECT_KIND.SHIELD },
  bunker: { kind: EFFECT_KIND.ARMOR },

  // ------------------------------------------------------------------ Buffs
  buff: { kind: EFFECT_KIND.DAMAGE_BOOST },
  area_buff: { kind: EFFECT_KIND.DAMAGE_BOOST },
  relic_buff: { kind: EFFECT_KIND.DAMAGE_BOOST },
  random_buff: { kind: EFFECT_KIND.DAMAGE_BOOST },
  time_control: { kind: EFFECT_KIND.DAMAGE_BOOST },
  camouflage: { kind: EFFECT_KIND.ARMOR },

  // -------------------------------------------------------------- Bewegung
  flight: { kind: EFFECT_KIND.MOVE },
  mobility: { kind: EFFECT_KIND.MOVE },
  water_mobility: { kind: EFFECT_KIND.MOVE },
  grapple: { kind: EFFECT_KIND.MOVE },
  teleport: { kind: EFFECT_KIND.MOVE },
  portal: { kind: EFFECT_KIND.MOVE },
  portal_field: { kind: EFFECT_KIND.MOVE },
  hologram_portal: { kind: EFFECT_KIND.MOVE },
  teleport_platform: { kind: EFFECT_KIND.MOVE },
  dimension_orb: { kind: EFFECT_KIND.MOVE },
  dimensionssprung: { kind: EFFECT_KIND.MOVE },
  hook_pull: { kind: EFFECT_KIND.PULL },
  suction: { kind: EFFECT_KIND.PULL },
  mind_pull: { kind: EFFECT_KIND.PULL },
  magnetism: { kind: EFFECT_KIND.PULL },
  gravity_well: { kind: EFFECT_KIND.PULL },
  whirlwind: { kind: EFFECT_KIND.PULL },
  void_knight: { kind: EFFECT_KIND.PULL },

  // -------------------------------------------------------------- Munition
  ammo_drop: { kind: EFFECT_KIND.AMMO },
  supply_drop: { kind: EFFECT_KIND.AMMO },
  loop: { kind: EFFECT_KIND.AMMO },

  // -------------------------------------------------------- Aufklärung
  target_scan: { kind: EFFECT_KIND.REVEAL },
  random_effect: { kind: EFFECT_KIND.RANDOM },
  random_spell: { kind: EFFECT_KIND.RANDOM },
  scroll_spell: { kind: EFFECT_KIND.RANDOM },
  mutation: { kind: EFFECT_KIND.RANDOM },

  // ---------------------------------------------------- Zustand am Ziel
  freeze: { kind: EFFECT_KIND.FREEZE },
  shield_freeze_target: { kind: EFFECT_KIND.FREEZE },
  sleep: { kind: EFFECT_KIND.FREEZE },
  stun: { kind: EFFECT_KIND.FREEZE },
  // Schaden über Zeit
  burn: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'fire' },
  fire_pool: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'fire' },
  lava: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'fire' },
  flame_blade: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'fire' },
  acid_dot: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  poison_cloud: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  poison_zone: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  world_poison: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  corruption: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  curse: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  tentacle_zone: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
  void_spell: { kind: EFFECT_KIND.DAMAGE_OVER_TIME, element: 'poison' },
});

/**
 * Effekt zu einem Katalognamen.
 * @returns {object|null} null, wenn der Name keine eigene Wirkung hat.
 */
export function effectFor(specialName) {
  if (typeof specialName !== 'string') return null;
  return SPECIAL_EFFECTS[specialName] ?? null;
}

/** Hat diese Waffe eine Wirkung über Schaden und Fläche hinaus? */
export function hasSpecialEffect(weapon) {
  return effectFor(weapon?.special) !== null;
}

/**
 * Baut den konkreten Effekt einer Waffe inklusive Zahlenwerten.
 *
 * Die Zahlen stammen aus den Elementarschäden der Waffe, wo vorhanden; sonst
 * gelten die Standardwerte. So wirkt eine Feuerwaffe stärker als eine, die
 * keine Elementarwerte mitbringt — ohne dass Werte erfunden werden.
 *
 * @param {object} weapon - Eintrag aus dem Waffenkatalog
 * @returns {object|null} Effekt mit `kind` und Parametern
 */
export function buildEffect(weapon) {
  const base = effectFor(weapon?.special);
  if (!base) return null;

  const fire = weapon.elemental?.fire ?? 0;
  const ice = weapon.elemental?.ice ?? 0;
  const poison = weapon.elemental?.poison ?? 0;
  const elementalSum = fire + ice + poison;

  switch (base.kind) {
    case EFFECT_KIND.HEAL:
      // Heilung skaliert mit dem Grundschaden der Waffe: stärkere Waffen
      // heilen mehr, ohne dass ein Wert frei gewählt wird.
      return {
        kind: base.kind,
        amount: Math.max(SPECIAL_DEFAULTS.healAmount, Math.round((weapon.damage || 0) * 1.2)),
      };

    case EFFECT_KIND.SHIELD:
      return {
        kind: base.kind,
        amount: Math.max(SPECIAL_DEFAULTS.shieldAmount, Math.round((weapon.damage || 0) * 1.1)),
      };

    case EFFECT_KIND.DAMAGE_BOOST:
      return { kind: base.kind, multiplier: SPECIAL_DEFAULTS.boostMultiplier };

    case EFFECT_KIND.ARMOR:
      return { kind: base.kind, reduction: SPECIAL_DEFAULTS.armorReduction };

    case EFFECT_KIND.FREEZE:
      // Mehr Elementarschaden friert länger ein, maximal die Obergrenze.
      return {
        kind: base.kind,
        turns: Math.min(
          SPECIAL_DEFAULTS.maxTurns,
          SPECIAL_DEFAULTS.freezeTurns + Math.floor(elementalSum / 40),
        ),
      };

    case EFFECT_KIND.DAMAGE_OVER_TIME:
      return {
        kind: base.kind,
        element: base.element,
        damagePerTurn: Math.max(SPECIAL_DEFAULTS.dotDamagePerTurn, Math.round(elementalSum / 2)),
        turns: SPECIAL_DEFAULTS.dotTurns,
      };

    case EFFECT_KIND.AMMO:
      return { kind: base.kind, amount: SPECIAL_DEFAULTS.ammoAmount };

    case EFFECT_KIND.MOVE:
      return { kind: base.kind, distance: SPECIAL_DEFAULTS.moveDistance };

    case EFFECT_KIND.PULL:
      // Nahkampf-Enterhaken ziehen kürzer als ein Sprung weit ist.
      return { kind: base.kind, distance: SPECIAL_DEFAULTS.pullDistance };

    case EFFECT_KIND.REVEAL:
      return { kind: base.kind, turns: SPECIAL_DEFAULTS.revealTurns };

    case EFFECT_KIND.RANDOM:
      // Der Würfel trägt nur die Auswahlliste; die Wahl fällt erst beim
      // Auslösen, weil er den Zufallsgenerator des Matches braucht.
      return { kind: base.kind, pool: [...RANDOM_EFFECT_POOL] };

    default:
      return null;
  }
}

/**
 * Laufende Zustände je Spieler.
 *
 * Alle Dauern sind in Zügen angegeben. `advanceTurn(playerId)` zählt sie herunter
 * und liefert die Wirkungen, die in diesem Zug ausgelöst werden (Schaden über
 * Zeit). Der Aufrufer entscheidet, wann ein Zug vorbei ist — der Speicher kennt
 * keine Zeit.
 */
export class StatusStore {
  #entries = new Map();

  #entryFor(playerId) {
    let entry = this.#entries.get(playerId);
    if (!entry) {
      entry = {
        shield: 0,
        armor: 0,
        boostMultiplier: 1,
        boostTurns: 0,
        frozenTurns: 0,
        dots: [],
        revealedTurns: 0,
      };
      this.#entries.set(playerId, entry);
    }
    return entry;
  }

  /** Kann der Spieler in diesem Zug handeln? */
  isFrozen(playerId) {
    return (this.#entries.get(playerId)?.frozenTurns ?? 0) > 0;
  }

  /** Verbleibendes Schild. */
  shieldOf(playerId) {
    return this.#entries.get(playerId)?.shield ?? 0;
  }

  /** Prozentuale Schadensreduktion (0..1). */
  armorOf(playerId) {
    return this.#entries.get(playerId)?.armor ?? 0;
  }

  /** Schadensmultiplikator für eigene Angriffe. */
  damageMultiplier(playerId) {
    return this.#entries.get(playerId)?.boostMultiplier ?? 1;
  }

  /** Ist der Spieler aufgedeckt (Sichtbarkeit für die Anzeige)? */
  isRevealed(playerId) {
    return (this.#entries.get(playerId)?.revealedTurns ?? 0) > 0;
  }

  /** Fügt Schild hinzu, begrenzt auf die Obergrenze. */
  addShield(playerId, amount) {
    const entry = this.#entryFor(playerId);
    entry.shield = Math.min(SPECIAL_DEFAULTS.maxShield, entry.shield + Math.max(0, amount));
    return entry.shield;
  }

  /** Setzt Schadensreduktion (der stärkere Wert gewinnt). */
  addArmor(playerId, reduction) {
    const entry = this.#entryFor(playerId);
    entry.armor = Math.max(entry.armor, Math.min(0.8, Math.max(0, reduction)));
    return entry.armor;
  }

  /** Setzt einen Schadensbonus für eine Anzahl Züge. */
  addBoost(playerId, multiplier, turns = 2) {
    const entry = this.#entryFor(playerId);
    entry.boostMultiplier = Math.max(entry.boostMultiplier, Math.max(1, multiplier));
    entry.boostTurns = Math.max(entry.boostTurns, Math.min(SPECIAL_DEFAULTS.maxTurns, turns));
    return entry.boostMultiplier;
  }

  /** Friert einen Spieler für eine Anzahl Züge ein (der längere Wert gewinnt). */
  freeze(playerId, turns = SPECIAL_DEFAULTS.freezeTurns) {
    const entry = this.#entryFor(playerId);
    entry.frozenTurns = Math.max(entry.frozenTurns, Math.min(SPECIAL_DEFAULTS.maxTurns, Math.max(1, turns)));
    return entry.frozenTurns;
  }

  /** Hebt Einfrieren auf (für Gegenmaßnahmen und Tests). */
  clearFreeze(playerId) {
    const entry = this.#entryFor(playerId);
    entry.frozenTurns = 0;
  }

  /** Fügt einen Schaden-über-Zeit-Effekt hinzu. */
  addDot(playerId, { damagePerTurn, turns, element = 'neutral' }) {
    const entry = this.#entryFor(playerId);
    entry.dots.push({
      damagePerTurn: Math.max(0, damagePerTurn),
      turns: Math.min(SPECIAL_DEFAULTS.maxTurns, Math.max(1, turns)),
      element,
    });
    return entry.dots.length;
  }

  /** Deckt einen Spieler für eine Anzahl Züge auf. */
  reveal(playerId, turns = SPECIAL_DEFAULTS.revealTurns) {
    const entry = this.#entryFor(playerId);
    entry.revealedTurns = Math.max(entry.revealedTurns, Math.min(SPECIAL_DEFAULTS.maxTurns, turns));
    return entry.revealedTurns;
  }

  /** Anzahl laufender Schaden-über-Zeit-Effekte. */
  dotCount(playerId) {
    return this.#entries.get(playerId)?.dots.length ?? 0;
  }

  /**
   * Verbraucht so viel Schild wie möglich.
   * @returns {{absorbed:number, rest:number}} absorbierter und verbleibender Schaden
   */
  absorbWithShield(playerId, amount) {
    const entry = this.#entryFor(playerId);
    if (!entry || entry.shield <= 0 || amount <= 0) {
      return { absorbed: 0, rest: Math.max(0, amount) };
    }
    const absorbed = Math.min(entry.shield, amount);
    entry.shield -= absorbed;
    return { absorbed, rest: amount - absorbed };
  }

  /**
   * Zählt die Wirkungen eines Spielers um einen Zug herunter.
   *
   * @returns {{damage:number, elements:string[], frozeThisTurn:boolean}}
   *   `damage` ist der aufgelaufene Schaden über Zeit für diesen Zug.
   */
  advanceTurn(playerId) {
    const entry = this.#entries.get(playerId);
    if (!entry) return { damage: 0, elements: [], frozeThisTurn: false };

    const frozeThisTurn = entry.frozenTurns > 0;
    if (entry.frozenTurns > 0) entry.frozenTurns -= 1;

    if (entry.boostTurns > 0) {
      entry.boostTurns -= 1;
      if (entry.boostTurns === 0) entry.boostMultiplier = 1;
    }
    if (entry.revealedTurns > 0) entry.revealedTurns -= 1;

    let damage = 0;
    const elements = [];
    const remaining = [];
    for (const dot of entry.dots) {
      damage += dot.damagePerTurn;
      elements.push(dot.element);
      dot.turns -= 1;
      if (dot.turns > 0) remaining.push(dot);
    }
    entry.dots = remaining;

    return { damage, elements, frozeThisTurn };
  }

  /** Entfernt alle Zustände eines Spielers (z. B. bei dessen Ausscheiden). */
  remove(playerId) {
    this.#entries.delete(playerId);
  }

  /** Alle Spieler mit laufenden Zuständen. */
  get playerIds() {
    return [...this.#entries.keys()];
  }

  /** Serialisierbare Momentaufnahme (für Replays und die Anzeige). */
  snapshot() {
    const out = {};
    for (const [playerId, entry] of this.#entries.entries()) {
      out[playerId] = {
        shield: Number(entry.shield.toFixed(3)),
        armor: Number(entry.armor.toFixed(3)),
        boostMultiplier: Number(entry.boostMultiplier.toFixed(3)),
        boostTurns: entry.boostTurns,
        frozenTurns: entry.frozenTurns,
        revealedTurns: entry.revealedTurns,
        dots: entry.dots.map(dot => ({ ...dot })),
      };
    }
    return out;
  }
}

export default StatusStore;
