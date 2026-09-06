import { World } from '../engine/ecs/world.js';
import { PhysicsSystem } from '../engine/systems/physicsSystem.js';
import { NETWORK_RULES } from '../shared/config/network.js';

export function createServerRuntime() {
  const world = new World();
  world.registerSystem(new PhysicsSystem());

  return {
    authoritative: NETWORK_RULES.authoritativeServer,
    protocol: NETWORK_RULES.protocol,
    world
  };
}
