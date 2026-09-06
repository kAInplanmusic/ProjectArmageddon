export class WaterSimulation {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.levels = new Float32Array(width * height);
  }

  index(x, y) {
    return y * this.width + x;
  }

  step() {
    const next = this.levels.slice();

    for (let y = this.height - 2; y >= 0; y -= 1) {
      for (let x = 0; x < this.width; x += 1) {
        const currentIndex = this.index(x, y);
        const belowIndex = this.index(x, y + 1);

        const current = next[currentIndex];
        const below = next[belowIndex];

        if (current > 0 && below < 1) {
          const transfer = Math.min(current, 1 - below);
          next[currentIndex] -= transfer;
          next[belowIndex] += transfer;
          continue;
        }

        if (current <= 0) {
          continue;
        }

        if (x > 0) {
          const leftIndex = this.index(x - 1, y);
          const diff = (next[currentIndex] - next[leftIndex]) / 2;
          if (diff > 0) {
            const transfer = diff * 0.25;
            next[currentIndex] -= transfer;
            next[leftIndex] += transfer;
          }
        }

        if (x < this.width - 1) {
          const rightIndex = this.index(x + 1, y);
          const diff = (next[currentIndex] - next[rightIndex]) / 2;
          if (diff > 0) {
            const transfer = diff * 0.25;
            next[currentIndex] -= transfer;
            next[rightIndex] += transfer;
          }
        }
      }
    }

    this.levels = next;
  }
}
