/**
 * Canvas-Renderer für Project Armageddon.
 *
 * Terrain wird einmalig aus dem Bitmap in eine Offscreen-Ebene gezeichnet und
 * danach ausschliesslich über dieselben Ereignisse verändert, die auch die
 * CollisionMask verändern (Krater, Mahlstrom-Kontraktion). Dadurch können
 * sichtbares Terrain und Physik nicht auseinanderlaufen.
 *
 * @module renderer
 */
import { WATER_SCALE } from '../engine/match.js';
import { TEAM_COLORS } from '../engine/match.js';

const SKY_TOP = '#0d1b2a';
const SKY_BOTTOM = '#1b3a4b';
const TERRAIN_SURFACE = [96, 138, 92];
const TERRAIN_DEEP = [38, 54, 46];
const CRATE_COLORS = ['#dcdcdc', '#4cc9f0', '#a855f7', '#fbbf24'];
const RARITY_COLORS = ['#e8eef5', '#4cc9f0', '#a855f7', '#fbbf24'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.terrainLayer = null;
    this.waterLayer = document.createElement('canvas');
    this.waterLayer.width = Math.ceil(this.width / WATER_SCALE);
    this.waterLayer.height = Math.ceil(this.height / WATER_SCALE);
    this.waterCtx = this.waterLayer.getContext('2d');
    this.particles = [];
    this.waterFrame = 0;
    this.time = 0;
    /** Transiente Effekte (Strahlen, Blitze) mit Lebensdauer in Frames. */
    this.effects = [];
  }

  /**
   * Fügt einen Hitscan-Strahl hinzu (Lebensdauer ~10 Frames).
   * Rein visuell: hat keinen Einfluss auf die Simulation.
   */
  addBeam(fromX, fromY, toX, toY, { hit = false, color = '#ffe066' } = {}) {
    this.effects.push({
      kind: 'beam',
      fromX, fromY, toX, toY,
      hit,
      color,
      life: 1,
      decay: 0.11,
    });
  }

  /** Fügt einen Explosionsblitz an einer Stelle hinzu. */
  addFlash(x, y, radius, { color = '#f4a261' } = {}) {
    this.effects.push({ kind: 'flash', x, y, radius, color, life: 1, decay: 0.09 });
  }

  #updateEffects() {
    for (const effect of this.effects) effect.life -= effect.decay;
    this.effects = this.effects.filter(effect => effect.life > 0);
  }

  #drawEffects() {
    for (const effect of this.effects) {
      const alpha = Math.max(0, Math.min(1, effect.life));
      if (effect.kind === 'beam') {
        this.ctx.save();
        // Kernstrahl
        this.ctx.globalAlpha = alpha;
        this.ctx.strokeStyle = effect.color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(effect.fromX, effect.fromY);
        this.ctx.lineTo(effect.toX, effect.toY);
        this.ctx.stroke();
        // Weicher Glow darum
        this.ctx.globalAlpha = alpha * 0.35;
        this.ctx.lineWidth = 9;
        this.ctx.stroke();
        // Einschlagpunkt markieren
        if (effect.hit) {
          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = '#fff3c4';
          this.ctx.beginPath();
          this.ctx.arc(effect.toX, effect.toY, 4 + (1 - effect.life) * 6, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      } else if (effect.kind === 'flash') {
        const radius = effect.radius * (1 + (1 - effect.life) * 0.6);
        const gradient = this.ctx.createRadialGradient(
          effect.x, effect.y, 0,
          effect.x, effect.y, Math.max(1, radius),
        );
        gradient.addColorStop(0, 'rgba(255, 243, 196, ' + alpha + ')');
        gradient.addColorStop(0.45, 'rgba(244, 162, 97, ' + alpha * 0.7 + ')');
        gradient.addColorStop(1, 'rgba(231, 111, 81, 0)');
        this.ctx.save();
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(effect.x, effect.y, Math.max(1, radius), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  /**
   * Windanzeige als Pfeil im Spielfeld.
   * Länge und Farbe skalieren mit der Windstärke, die Richtung mit dem Vorzeichen.
   */
  #drawWindArrow(wind) {
    const magnitude = Math.abs(wind ?? 0);
    if (magnitude < 0.0005) return;

    const maxWind = 0.05;
    const strength = Math.min(1, magnitude / maxWind);
    const cx = this.width / 2;
    const cy = 46;
    const halfLength = 20 + strength * 46;
    const direction = wind > 0 ? 1 : -1;
    const color = strength > 0.6 ? '#ef476f' : strength > 0.3 ? '#f4a261' : '#8ba0b4';

    // Drei Pfeile, versetzt — liest sich als "Strömung".
    this.ctx.save();
    for (let i = -1; i <= 1; i++) {
      const y = cy + i * 11;
      const alpha = i === 0 ? 1 : 0.35;
      const length = i === 0 ? halfLength : halfLength * 0.65;
      const startX = cx - direction * length * 0.5;
      const endX = cx + direction * length * 0.5;

      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = i === 0 ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
      this.ctx.stroke();

      // Pfeilspitze
      this.ctx.beginPath();
      this.ctx.moveTo(endX - direction * 9, y - 6);
      this.ctx.lineTo(endX, y);
      this.ctx.lineTo(endX - direction * 9, y + 6);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /**
   * Explosionsradius-Vorschau am Zielpunkt der Flugbahn.
   * Zeigt, wie groß die Flächenwirkung der gewählten Waffe ist.
   */
  #drawBlastPreview(aimPreview, blastRadius) {
    if (!aimPreview || aimPreview.length === 0 || !blastRadius || blastRadius <= 0) return;
    const impact = aimPreview[aimPreview.length - 1];
    if (!impact) return;

    this.ctx.save();
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(impact.x, impact.y, blastRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.fillStyle = 'rgba(244, 162, 97, 0.10)';
    this.ctx.fill();
    this.ctx.restore();
  }

  /**
   * Baut die Terrain-Ebene aus dem Terrain-Bitmap auf.
   * @param {Uint8Array} bitmap
   * @param {number} width
   * @param {number} height
   */
  buildTerrainLayer(bitmap, width, height) {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const ctx = layer.getContext('2d');
    const image = ctx.createImageData(width, height);
    const data = image.data;

    for (let x = 0; x < width; x++) {
      let surface = -1;
      for (let y = 0; y < height; y++) {
        if (bitmap[y * width + x]) {
          surface = y;
          break;
        }
      }
      if (surface < 0) continue;

      for (let y = surface; y < height; y++) {
        const index = (y * width + x) * 4;
        const depth = Math.min(1, (y - surface) / 160);
        data[index] = Math.round(TERRAIN_SURFACE[0] + (TERRAIN_DEEP[0] - TERRAIN_SURFACE[0]) * depth);
        data[index + 1] = Math.round(TERRAIN_SURFACE[1] + (TERRAIN_DEEP[1] - TERRAIN_SURFACE[1]) * depth);
        data[index + 2] = Math.round(TERRAIN_SURFACE[2] + (TERRAIN_DEEP[2] - TERRAIN_SURFACE[2]) * depth);
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    // Oberflächenkante hervorheben.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(180, 220, 150, 0.22)';
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!bitmap[y * width + x]) continue;
        if (y > 0 && bitmap[(y - 1) * width + x]) continue;
        ctx.fillRect(x, y, 1, 2);
        break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    this.terrainLayer = layer;
    return layer;
  }

  /** Stanzt einen Krater in die sichtbare Terrain-Ebene. */
  applyCrater(x, y, radius) {
    if (!this.terrainLayer) return;
    const ctx = this.terrainLayer.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.spawnExplosionParticles(x, y, radius);
  }

  /** Entfernt die vom Mahlstrom abgetragenen Randspalten. */
  applyContraction(inset) {
    if (!this.terrainLayer) return;
    const ctx = this.terrainLayer.getContext('2d');
    ctx.clearRect(0, 0, inset, this.height);
    ctx.clearRect(this.width - inset, 0, inset, this.height);
  }

  spawnExplosionParticles(x, y, radius) {
    const count = Math.min(26, 8 + Math.round(radius / 2));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const speed = 1 + (i % 5) * 0.6;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.6,
        life: 1,
        radius: 2 + (i % 3),
        color: i % 3 === 0 ? '#f4a261' : i % 3 === 1 ? '#ffd166' : '#e76f51',
      });
    }
  }

  updateParticles() {
    for (const particle of this.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.18;
      particle.life -= 0.035;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  #drawSky() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(1, SKY_BOTTOM);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Deterministische Sternpunkte als statischer Hintergrund.
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % this.width;
      const y = (i * 71) % Math.round(this.height * 0.5);
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  #drawWater(water) {
    if (!water) return;
    this.waterCtx.clearRect(0, 0, this.waterLayer.width, this.waterLayer.height);
    const image = this.waterCtx.createImageData(this.waterLayer.width, this.waterLayer.height);
    const data = image.data;
    const levels = water.levels;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level <= 0.02) continue;
      const index = i * 4;
      data[index] = 42;
      data[index + 1] = 122;
      data[index + 2] = 176;
      data[index + 3] = Math.round(Math.min(0.72, level) * 210);
    }
    this.waterCtx.putImageData(image, 0, 0);

    this.ctx.save();
    this.ctx.globalAlpha = 0.88;
    this.ctx.drawImage(this.waterLayer, 0, 0, this.width, this.height);
    this.ctx.restore();
  }

  #drawCrates(crates) {
    for (const crate of crates) {
      const color = RARITY_COLORS[crate.rarity] ?? CRATE_COLORS[0];
      const size = 14;
      this.ctx.save();
      this.ctx.translate(crate.x, crate.y);
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.fillRect(-size / 2 + 1, -size / 2 + 2, size, size);
      this.ctx.fillStyle = '#2b3540';
      this.ctx.fillRect(-size / 2, -size / 2, size, size);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(-size / 2, -size / 2, size, size);
      this.ctx.beginPath();
      this.ctx.moveTo(-size / 2, -size / 2);
      this.ctx.lineTo(size / 2, size / 2);
      this.ctx.moveTo(size / 2, -size / 2);
      this.ctx.lineTo(-size / 2, size / 2);
      this.ctx.strokeStyle = color;
      this.ctx.globalAlpha = 0.5;
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  #drawEntities(entities, activePlayerId, aim) {
    for (const entity of entities) {
      if (!entity.alive) continue;
      const color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      this.ctx.save();
      this.ctx.translate(entity.x, entity.y);

      // Schatten
      this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      this.ctx.beginPath();
      this.ctx.ellipse(0, 11, 9, 3, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Körper
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(0, -2, 7, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#1b232c';
      this.ctx.fillRect(-6, 4, 12, 7);

      // Geschützrohr in Zielrichtung
      const isActive = entity.entityId === activePlayerId;
      const angle = isActive && aim ? aim.angle : entity.angle;
      this.ctx.rotate(-angle);
      this.ctx.fillStyle = isActive ? '#f4a261' : '#9aa7b4';
      this.ctx.fillRect(0, -2.5, 15, 5);
      this.ctx.restore();

      this.#drawHealthBar(entity);
    }
  }

  #drawHealthBar(entity) {
    const width = 30;
    const height = 4;
    const x = entity.x - width / 2;
    const y = entity.y - 22;
    const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
    const color = ratio > 0.6 ? '#90be6d' : ratio > 0.3 ? '#fbbf24' : '#ef476f';

    this.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
    this.ctx.fillStyle = '#2b3540';
    this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width * ratio, height);
  }

  #drawProjectiles(projectiles) {
    for (const projectile of projectiles) {
      const gradient = this.ctx.createRadialGradient(projectile.x, projectile.y, 0, projectile.x, projectile.y, 8);
      gradient.addColorStop(0, '#fff3c4');
      gradient.addColorStop(0.5, '#f4a261');
      gradient.addColorStop(1, 'rgba(244,162,97,0)');
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
      this.ctx.fill();

      // Zünder-Countdown: Ohne die Zahl wäre nicht erkennbar, wie lange eine
      // Granate noch liegt. Der Ring zeigt zusätzlich den Fortschritt, damit
      // die verbleibende Zeit auch ohne Lesen erfassbar ist.
      const rest = projectile.fuseSeconds ?? 0;
      if (rest > 0) {
        this.ctx.save();
        this.ctx.textAlign = 'center';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.fillStyle = rest <= 1 ? '#ef476f' : '#fbbf24';
        // Symbol vor der Zahl: eine nackte Zahl über einem Geschoss wäre nicht
        // als Zünder zu erkennen. Bei unter einer Sekunde wird sie zusätzlich
        // als „gleich" gekennzeichnet.
        this.ctx.fillText(rest <= 1 ? `! ${rest.toFixed(1)}s` : `◷ ${rest.toFixed(1)}s`,
          projectile.x, projectile.y - 13);

        // Fortschrittsring: schließt sich, je näher die Zündung kommt.
        const anteil = Math.min(1, rest / 5);
        this.ctx.strokeStyle = rest <= 1 ? 'rgba(239,71,111,0.9)' : 'rgba(251,191,36,0.75)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 11, -Math.PI / 2, -Math.PI / 2 + anteil * Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
  }

  #drawAimPreview(points) {
    if (!points || points.length < 2) return;
    this.ctx.save();
    this.ctx.setLineDash([4, 6]);
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.75)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (const point of points) this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();
    this.ctx.restore();

    const last = points[points.length - 1];
    this.ctx.strokeStyle = 'rgba(244, 162, 97, 0.9)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  #drawParticles() {
    for (const particle of this.particles) {
      this.ctx.globalAlpha = Math.max(0, particle.life);
      this.ctx.fillStyle = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.radius * particle.life + 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  #drawMaelstrom(maelstrom) {
    if (!maelstrom?.active || maelstrom.inset <= 0) return;
    const { inset } = maelstrom;
    const gradientLeft = this.ctx.createLinearGradient(0, 0, inset * 2, 0);
    gradientLeft.addColorStop(0, 'rgba(180, 20, 60, 0.55)');
    gradientLeft.addColorStop(1, 'rgba(180, 20, 60, 0)');
    this.ctx.fillStyle = gradientLeft;
    this.ctx.fillRect(0, 0, inset * 2, this.height);

    const gradientRight = this.ctx.createLinearGradient(this.width, 0, this.width - inset * 2, 0);
    gradientRight.addColorStop(0, 'rgba(180, 20, 60, 0.55)');
    gradientRight.addColorStop(1, 'rgba(180, 20, 60, 0)');
    this.ctx.fillStyle = gradientRight;
    this.ctx.fillRect(this.width - inset * 2, 0, inset * 2, this.height);

    this.ctx.strokeStyle = 'rgba(239, 71, 111, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 8]);
    this.ctx.beginPath();
    this.ctx.moveTo(inset, 0);
    this.ctx.lineTo(inset, this.height);
    this.ctx.moveTo(this.width - inset, 0);
    this.ctx.lineTo(this.width - inset, this.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Vollständiger Frame.
   * @param {object} state - MatchController.getState()
   * @param {object} options
   * @param {Array} [options.aimPreview]
   * @param {object} [options.aim]
   * @param {object} [options.water] - WaterField-Instanz des Matches
   * @param {number} [options.blastRadius] - Flächenwirkung der gewählten Waffe
   */
  render(state, { aimPreview = null, aim = null, water = null, blastRadius = 0 } = {}) {
    this.time += 1;
    this.#drawSky();

    if (this.terrainLayer) {
      this.ctx.drawImage(this.terrainLayer, 0, 0);
    }

    this.#drawWater(water);
    this.#drawWindArrow(state.wind);
    this.#drawBlastPreview(aimPreview, blastRadius);
    this.#drawCrates(state.crates ?? []);
    this.#drawMaelstrom(state.maelstrom);
    this.#drawAimPreview(aimPreview);
    this.#drawEntities(state.entities ?? [], state.activePlayerId, aim);
    this.#drawProjectiles(state.projectiles ?? []);
    this.#drawEffects();
    this.#updateEffects();
    this.updateParticles();
    this.#drawParticles();
  }
}

export default Renderer;
