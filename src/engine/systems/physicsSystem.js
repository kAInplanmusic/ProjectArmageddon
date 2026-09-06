import { computeLinearDragPosition } from '../physics/ballistics.js';
import { COMPONENT_FLAGS } from '../ecs/componentStore.js';

const REQUIRED_FLAGS =
  COMPONENT_FLAGS.ACTIVE |
  COMPONENT_FLAGS.POSITION |
  COMPONENT_FLAGS.VELOCITY |
  COMPONENT_FLAGS.BALLISTICS;

export class PhysicsSystem {
  update(world, deltaSeconds) {
    const { components, lastEntityId } = world;

    for (let entityId = 1; entityId <= lastEntityId; entityId += 1) {
      if (!components.matches(entityId, REQUIRED_FLAGS)) {
        continue;
      }

      const result = computeLinearDragPosition({
        x0: components.positionX[entityId],
        y0: components.positionY[entityId],
        vx0: components.velocityX[entityId],
        vy0: components.velocityY[entityId],
        dragCoefficient: components.dragCoefficient[entityId],
        mass: components.mass[entityId],
        timeSeconds: deltaSeconds
      });

      components.positionX[entityId] = result.x;
      components.positionY[entityId] = result.y;
    }
  }
}
