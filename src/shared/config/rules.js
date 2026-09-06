import { CLASS_ARCHETYPES } from './classes.js';
import { DAMAGE_ORDER, WEAPON_TYPES } from './combat.js';
import { LOOT_DROP_RULES } from './loot.js';
import { MATCH_RULES } from './match.js';
import { NETWORK_RULES } from './network.js';

export const GAME_RULES = Object.freeze({
  classes: CLASS_ARCHETYPES,
  combat: Object.freeze({
    damageOrder: DAMAGE_ORDER,
    weaponTypes: WEAPON_TYPES
  }),
  loot: LOOT_DROP_RULES,
  match: MATCH_RULES,
  network: NETWORK_RULES
});
