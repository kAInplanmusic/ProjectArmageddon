import { punchCrater } from './rendering/terrainRenderer.js';
import { WaterSimulation } from './rendering/waterSimulation.js';

export function createClientRuntime() {
  return {
    renderingMode: 'canvas',
    punchCrater,
    waterSimulation: new WaterSimulation(64, 64)
  };
}
