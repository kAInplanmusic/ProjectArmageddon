/* Project Armageddon — Terrain Engine v1.0
 * Destructible voxel/cell terrain core. Renderer and rigid-body independent.
 * Designed to consume WeaponEngine terrain damage events and produce persistent
 * craters, material transitions, support collapse, liquid flow and chain reactions.
 */

export type TerrainMaterialId =
  | 'grass'|'earth'|'mud'|'snow'|'water'|'metal'|'stone'|'sand'|'wood'|'lava'|'rock'|'ice';
export type TerrainPhase = 'solid'|'liquid';
export type TerrainDamageKind = 'impact'|'explosive'|'fire'|'ice'|'water'|'acid'|'generic';

export interface Vec2 { x:number; y:number; }
export interface MaterialDef {
  id:TerrainMaterialId;
  hardness:number; terrainHP:number; flammability:number; waterAbsorption:number;
  iceResistance:number; blastResistance:number; liquid?:boolean;
  density:number; friction:number; flowRate:number; temperature:number;
  transitions?:Partial<Record<TerrainDamageKind,TerrainMaterialId|null>>;
}
export interface TerrainCell {
  x:number; y:number; material:TerrainMaterialId; hp:number; maxHp:number;
  destructible:boolean; liquid:boolean; phase:TerrainPhase;
  temperature:number; wetness:number; damageVersion:number;
}
export interface TerrainConfig {
  width:number; height:number; cellSize:number;
  gravity:number; liquidStepsPerTick:number; collapseStepsPerTick:number;
  supportMinNeighbors:number; collapseDepth:number; chainReactionLimit:number;
  airMaterial?:TerrainMaterialId;
}
export interface TerrainEventBase { tick:number; }
export type TerrainEvent =
  | (TerrainEventBase & {type:'terrain_damage'; x:number;y:number;amount:number;source:string;kind:TerrainDamageKind})
  | (TerrainEventBase & {type:'cell_destroyed'; x:number;y:number;material:TerrainMaterialId;source:string})
  | (TerrainEventBase & {type:'terrain_deformed'; center:Vec2;radius:number;source:string;cellsChanged:number})
  | (TerrainEventBase & {type:'collapse'; x:number;y:number;from:TerrainMaterialId;to:'air';cause:string})
  | (TerrainEventBase & {type:'material_transition';x:number;y:number;from:TerrainMaterialId;to:TerrainMaterialId;cause:string})
  | (TerrainEventBase & {type:'liquid_flow';x:number;y:number;toX:number;toY:number;material:'water'|'lava'})
  | (TerrainEventBase & {type:'chain_reaction';x:number;y:number;source:string;depth:number})
  | (TerrainEventBase & {type:'support_update';x:number;y:number;stable:boolean});

const MATERIALS:Record<TerrainMaterialId,MaterialDef> = {
  grass:{id:'grass',hardness:20,terrainHP:60,flammability:.85,waterAbsorption:.60,iceResistance:.20,blastResistance:.15,density:1.0,friction:.75,flowRate:0,temperature:20},
  earth:{id:'earth',hardness:35,terrainHP:90,flammability:.05,waterAbsorption:.80,iceResistance:.30,blastResistance:.35,density:1.7,friction:.80,flowRate:0,temperature:18},
  mud:{id:'mud',hardness:20,terrainHP:65,flammability:.05,waterAbsorption:.95,iceResistance:.15,blastResistance:.20,density:1.5,friction:.55,flowRate:0,temperature:15},
  snow:{id:'snow',hardness:12,terrainHP:45,flammability:0,waterAbsorption:.20,iceResistance:.90,blastResistance:.10,density:.35,friction:.45,flowRate:0,temperature:-5},
  water:{id:'water',hardness:0,terrainHP:1,flammability:0,waterAbsorption:1,iceResistance:0,blastResistance:0,liquid:true,density:1,friction:.05,flowRate:3,temperature:8},
  metal:{id:'metal',hardness:95,terrainHP:220,flammability:0,waterAbsorption:0,iceResistance:.95,blastResistance:.85,density:7.8,friction:.60,flowRate:0,temperature:20},
  stone:{id:'stone',hardness:75,terrainHP:180,flammability:0,waterAbsorption:.10,iceResistance:.90,blastResistance:.70,density:2.7,friction:.90,flowRate:0,temperature:15},
  sand:{id:'sand',hardness:18,terrainHP:55,flammability:0,waterAbsorption:.90,iceResistance:.20,blastResistance:.10,density:1.6,friction:.40,flowRate:0,temperature:25},
  wood:{id:'wood',hardness:30,terrainHP:80,flammability:.95,waterAbsorption:.70,iceResistance:.25,blastResistance:.25,density:.65,friction:.70,flowRate:0,temperature:20},
  lava:{id:'lava',hardness:10,terrainHP:40,flammability:1,waterAbsorption:0,iceResistance:0,blastResistance:.05,liquid:true,density:2.5,friction:.10,flowRate:2,temperature:1100},
  rock:{id:'rock',hardness:85,terrainHP:200,flammability:0,waterAbsorption:.05,iceResistance:.95,blastResistance:.80,density:3.0,friction:.92,flowRate:0,temperature:12},
  ice:{id:'ice',hardness:25,terrainHP:70,flammability:0,waterAbsorption:.20,iceResistance:1,blastResistance:.15,density:.92,friction:.20,flowRate:0,temperature:-10}
};

const AIR = '__air__';
const key=(x:number,y:number)=>`${x},${y}`;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const dist=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.y-b.y);

export class TerrainEngine {
  readonly config:Required<TerrainConfig>;
  readonly cells = new Map<string,TerrainCell>();
  readonly events:TerrainEvent[]=[];
  tick=0;
  private changed = new Set<string>();
  private reactionQueue:Array<{x:number;y:number;source:string;depth:number}> = [];

  constructor(config:TerrainConfig){
    this.config={
      width:config.width,height:config.height,cellSize:config.cellSize,
      gravity:config.gravity,liquidStepsPerTick:config.liquidStepsPerTick??2,
      collapseStepsPerTick:config.collapseStepsPerTick??4,
      supportMinNeighbors:config.supportMinNeighbors??1,
      collapseDepth:config.collapseDepth??3,
      chainReactionLimit:config.chainReactionLimit??256,
      airMaterial:config.airMaterial??'earth'
    };
    if(this.config.width<1||this.config.height<1||this.config.cellSize<=0) throw new Error('Invalid terrain dimensions');
  }

  static materials():Record<TerrainMaterialId,MaterialDef>{return structuredClone(MATERIALS);}
  material(id:TerrainMaterialId){return MATERIALS[id];}
  inBounds(x:number,y:number){return x>=0&&x<this.config.width&&y>=0&&y<this.config.height;}
  get(x:number,y:number){return this.cells.get(key(x,y));}
  isAir(x:number,y:number){return !this.inBounds(x,y)||!this.cells.has(key(x,y));}

  setCell(x:number,y:number,material:TerrainMaterialId,hp?:number,destructible=true){
    if(!this.inBounds(x,y)) return;
    const m=MATERIALS[material];
    const cell:TerrainCell={x,y,material,hp:hp??m.terrainHP,maxHp:m.terrainHP,destructible,liquid:!!m.liquid,phase:m.liquid?'liquid':'solid',temperature:m.temperature,wetness:0,damageVersion:0};
    this.cells.set(key(x,y),cell); this.changed.add(key(x,y));
  }

  fill(material:TerrainMaterialId, predicate?:(x:number,y:number)=>boolean){
    for(let y=0;y<this.config.height;y++) for(let x=0;x<this.config.width;x++) if(!predicate||predicate(x,y)) this.setCell(x,y,material);
  }

  generateFromHeightmap(heights:number[], layers:TerrainMaterialId[]=['grass','earth','stone']){
    if(heights.length!==this.config.width) throw new Error('heightmap width mismatch');
    for(let x=0;x<this.config.width;x++){
      const top=clamp(Math.floor(heights[x]),0,this.config.height);
      for(let y=0;y<top;y++){
        const depth=top-1-y;
        const material=layers[Math.min(depth,layers.length-1)];
        this.setCell(x,y,material);
      }
    }
  }

  worldToCell(p:Vec2){return {x:Math.floor(p.x/this.config.cellSize),y:Math.floor(p.y/this.config.cellSize)};}
  cellToWorld(x:number,y:number){return {x:(x+.5)*this.config.cellSize,y:(y+.5)*this.config.cellSize};}

  queryCircle(center:Vec2,radius:number):TerrainCell[]{
    const c=this.worldToCell(center), r=Math.ceil(radius/this.config.cellSize);
    const out:TerrainCell[]=[];
    for(let y=c.y-r;y<=c.y+r;y++) for(let x=c.x-r;x<=c.x+r;x++){
      const cell=this.get(x,y); if(!cell) continue;
      if(dist(this.cellToWorld(x,y),center)<=radius+this.config.cellSize*.71) out.push(cell);
    }
    return out;
  }

  applyDamage(center:Vec2,radius:number,amount:number,source:string,kind:TerrainDamageKind='generic',falloff='linear'){
    if(amount<=0||radius<=0)return 0;
    let changed=0;
    for(const cell of this.queryCircle(center,radius)){
      if(!cell.destructible) continue;
      const d=dist(this.cellToWorld(cell.x,cell.y),center);
      const t=clamp(d/radius,0,1);
      const fall=falloff==='quadratic'?(1-t)*(1-t):1-t;
      const m=MATERIALS[cell.material];
      const resistance = kind==='explosive'?m.blastResistance:(kind==='ice'?m.iceResistance:0);
      const effective=Math.max(0,amount*fall*(1-resistance));
      if(effective<=0) continue;
      this.damageCell(cell,effective,source,kind);
      changed++;
    }
    this.emit({type:'terrain_deformed',tick:this.tick,center,radius,source,cellsChanged:changed});
    this.processReactions();
    return changed;
  }

  damageCell(cell:TerrainCell,amount:number,source:string,kind:TerrainDamageKind='generic'){
    if(!cell.destructible)return;
    cell.hp-=amount; cell.damageVersion++; this.changed.add(key(cell.x,cell.y));
    this.emit({type:'terrain_damage',tick:this.tick,x:cell.x,y:cell.y,amount,source,kind});
    const m=MATERIALS[cell.material];
    if(kind==='fire'&&m.flammability>0){
      cell.temperature=Math.min(1200,cell.temperature+amount*3*m.flammability);
      if(cell.material==='wood'&&cell.temperature>260) this.reactionQueue.push({x:cell.x,y:cell.y,source:`fire:${source}`,depth:0});
    }
    if(kind==='water'&&m.waterAbsorption>.75&&cell.material==='earth'&&cell.hp<m.terrainHP*.45){
      this.transition(cell,'mud',`water:${source}`);
    }
    if(kind==='ice'&&cell.material==='water'&&amount>8) this.transition(cell,'ice',`freeze:${source}`);
    if(cell.hp<=0)this.destroyCell(cell,source);
  }

  destroyCell(cell:TerrainCell,source:string){
    if(!this.cells.has(key(cell.x,cell.y)))return;
    const material=cell.material;
    this.cells.delete(key(cell.x,cell.y)); this.changed.add(key(cell.x,cell.y));
    this.emit({type:'cell_destroyed',tick:this.tick,x:cell.x,y:cell.y,material,source});
    this.reactionQueue.push({x:cell.x,y:cell.y,source,depth:0});
  }

  transition(cell:TerrainCell,to:TerrainMaterialId,cause:string){
    if(cell.material===to)return;
    const from=cell.material, m=MATERIALS[to];
    cell.material=to; cell.maxHp=m.terrainHP; cell.hp=Math.min(cell.hp,m.terrainHP);
    cell.liquid=!!m.liquid; cell.phase=m.liquid?'liquid':'solid'; cell.temperature=m.temperature; cell.damageVersion++;
    this.changed.add(key(cell.x,cell.y));
    this.emit({type:'material_transition',tick:this.tick,x:cell.x,y:cell.y,from,to,cause});
  }

  /** Applies a weapon-style terrain hit. */
  deform(center:Vec2,radius:number,strength:number,source:string,kind:TerrainDamageKind='explosive'){
    return this.applyDamage(center,radius,strength,source,kind,'linear');
  }

  step(dt:number){
    if(dt<=0)return;
    this.tick++;
    for(let i=0;i<this.config.liquidStepsPerTick;i++) this.stepLiquids();
    for(let i=0;i<this.config.collapseStepsPerTick;i++) this.stepCollapse();
    this.processReactions();
  }

  private stepLiquids(){
    const liquids=[...this.cells.values()].filter(c=>c.liquid).sort((a,b)=>b.y-a.y);
    for(const c of liquids){
      const below=this.get(c.x,c.y-1);
      if(!below && this.inBounds(c.x,c.y-1)) {this.moveCell(c,c.x,c.y-1);continue;}
      if(below && below.material!=='water' && c.material==='water' && below.material==='lava'){
        this.transition(c,'ice','water-lava'); this.transition(below,'rock','water-lava'); continue;
      }
      const dirs=Math.random()<.5?[-1,1]:[1,-1];
      for(const dx of dirs){
        if(!this.inBounds(c.x+dx,c.y))continue;
        if(this.isAir(c.x+dx,c.y)){this.moveCell(c,c.x+dx,c.y);break;}
      }
    }
  }

  private moveCell(c:TerrainCell,nx:number,ny:number){
    if(!this.inBounds(nx,ny)||!this.isAir(nx,ny))return false;
    const oldX=c.x,oldY=c.y;
    this.cells.delete(key(oldX,oldY)); c.x=nx;c.y=ny;this.cells.set(key(nx,ny),c);
    this.changed.add(key(oldX,oldY));this.changed.add(key(nx,ny));
    if(c.material==='water'||c.material==='lava')this.emit({type:'liquid_flow',tick:this.tick,x:oldX,y:oldY,toX:nx,toY:ny,material:c.material});
    return true;
  }

  private stepCollapse(){
    const candidates=[...this.cells.values()].filter(c=>c.destructible&&!c.liquid).sort((a,b)=>a.y-b.y);
    for(const c of candidates){
      // y increases upward in this engine. A missing cell below means unsupported.
      if(c.y===0)continue;
      const support=this.get(c.x,c.y-1);
      if(support)continue;
      const neighbors=this.neighbors(c.x,c.y).filter(n=>!n.liquid).length;
      if(neighbors>=this.config.supportMinNeighbors && c.y>this.config.collapseDepth) continue;
      this.emit({type:'support_update',tick:this.tick,x:c.x,y:c.y,stable:false});
      if(c.material==='sand'||c.material==='mud'||c.material==='snow'||c.material==='earth'){
        this.destroyCell(c,'support-collapse');
        this.emit({type:'collapse',tick:this.tick,x:c.x,y:c.y,from:c.material,to:'air',cause:'unsupported'});
      }
    }
  }

  private neighbors(x:number,y:number){
    const out:TerrainCell[]=[];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const c=this.get(x+dx,y+dy);if(c)out.push(c);}
    return out;
  }

  private processReactions(){
    let processed=0;
    while(this.reactionQueue.length && processed<this.config.chainReactionLimit){
      const r=this.reactionQueue.shift()!; processed++;
      if(r.depth>=this.config.collapseDepth)continue;
      this.emit({type:'chain_reaction',tick:this.tick,x:r.x,y:r.y,source:r.source,depth:r.depth});
      for(const n of this.neighbors(r.x,r.y)){
        if(n.material==='wood'&&MATERIALS.wood.flammability>.5){
          n.temperature+=80;
          if(n.temperature>260)this.destroyCell(n,`chain:${r.source}`);
        }
        if(n.material==='sand'&&r.source.includes('explosive'))this.damageCell(n,8,`chain:${r.source}`,'explosive');
      }
    }
    if(processed>=this.config.chainReactionLimit)this.reactionQueue.length=0;
  }

  emit(e:TerrainEvent){this.events.push(e);}
  consumeEvents(){const e=this.events.splice(0);return e;}
  consumeChangedCells(){const out=[...this.changed].map(k=>this.cells.get(k)).filter(Boolean) as TerrainCell[];this.changed.clear();return out;}
  /** Dirty-state stream including deletions. A null entry means the cell became air. */
  consumeDirtyCells(){const out=[...this.changed].map(k=>({key:k,cell:this.cells.get(k)??null}));this.changed.clear();return out;}

  /** Adapter helper matching WeaponEngine's queryTerrainCircle concept. */
  queryTerrainCircle(center:Vec2,radius:number){return this.queryCircle(center,radius);}
  applyTerrainDamage(cell:TerrainCell,amount:number,source:string){
    const current=this.get(cell.x,cell.y); if(current)this.damageCell(current,amount,source,'generic');
  }
}

export function createDefaultTerrain(width:number,height:number,cellSize=16){
  const t=new TerrainEngine({width,height,cellSize,gravity:9.81,liquidStepsPerTick:2,collapseStepsPerTick:4,supportMinNeighbors:1,collapseDepth:3,chainReactionLimit:256});
  const surface=Math.floor(height*.48);
  for(let x=0;x<width;x++){
    for(let y=0;y<surface;y++){
      const depth=surface-y;
      const m:TerrainMaterialId=depth<=1?'grass':depth<=Math.max(3,surface*.18)?'earth':depth<=Math.max(5,surface*.45)?'stone':'rock';
      t.setCell(x,y,m);
    }
  }
  return t;
}

export function validateTerrain(t:TerrainEngine){
  const errors:string[]=[];
  if(t.config.width<1||t.config.height<1)errors.push('invalid dimensions');
  for(const c of t.cells.values()){
    if(c.hp<0)errors.push(`${c.x},${c.y}: hp<0`);
    if(c.maxHp<=0)errors.push(`${c.x},${c.y}: maxHp<=0`);
    if(!MATERIALS[c.material])errors.push(`${c.x},${c.y}: unknown material`);
  }
  return [...new Set(errors)];
}
