/**
 * Client-Rendering: TerrainRenderer (Canvas-2D)
 *
 * @module terrainRenderer
 */

export class TerrainRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d');
    this.width = canvas?.width || 0;
    this.height = canvas?.height || 0;
  }

  /**
   * Rendert Terrain mit einem Grid-Pattern.
   */
  renderTerrain() {
    if (!this.ctx) return;

    this.ctx.fillStyle = '#2a5a2a';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Grid-Pattern für Terrain-Struktur
    this.ctx.strokeStyle = '#1a3a1a';
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += 32) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += 32) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  /**
   * Rendert einen Krater.
   */
  punchCrater(x, y, radius, color = '#000') {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Rand-Highlight
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = '#444';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.restore();
  }
}

export default TerrainRenderer;
