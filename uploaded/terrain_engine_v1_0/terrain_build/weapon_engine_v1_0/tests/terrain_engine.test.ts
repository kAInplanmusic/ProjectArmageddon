import {TerrainEngine,createDefaultTerrain,validateTerrain} from '../terrain_engine_v1_0';

function assert(c:boolean,m:string){if(!c)throw new Error(m)}

const t=new TerrainEngine({width:20,height:12,cellSize:10,gravity:9.81,liquidStepsPerTick:2,collapseStepsPerTick:2,supportMinNeighbors:1,collapseDepth:3,chainReactionLimit:64});
for(let x=0;x<20;x++) for(let y=0;y<6;y++) t.setCell(x,y,y===5?'grass':'earth');
const before=t.cells.size;
t.deform({x:100,y:50},25,100,'rocket-1','explosive');
assert(t.cells.size<before,'explosion should remove terrain');
assert(t.consumeEvents().some(e=>e.type==='terrain_deformed'),'deformation event missing');

const water=t.get(5,5); t.setCell(5,6,'water');
t.step(1/60);
assert(t.get(5,5)?.material==='water' || !t.get(5,5),'liquid should flow downward');

const fire=new TerrainEngine({width:8,height:8,cellSize:10,gravity:9.81,liquidStepsPerTick:1,collapseStepsPerTick:1,supportMinNeighbors:1,collapseDepth:3,chainReactionLimit:64});
fire.setCell(3,0,'stone'); fire.setCell(3,1,'wood'); fire.damageCell(fire.get(3,1)!,90,'flame','fire');
assert(!fire.get(3,1),'flammable wood should be destroyable');

const d=createDefaultTerrain(32,16);
assert(validateTerrain(d).length===0,'default terrain invalid');
console.log('terrain_engine tests passed');
