function safeShiftRight(value, shift) {
  return shift >= 32 ? 0 : value >>> shift;
}

export class CollisionMask {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.wordsPerRow = Math.ceil(width / 32);
    this.data = new Uint32Array(this.wordsPerRow * height);
  }

  getWordIndex(x, y) {
    const word = Math.floor(x / 32);
    return y * this.wordsPerRow + word;
  }

  setSolid(x, y) {
    const bit = x % 32;
    this.data[this.getWordIndex(x, y)] |= (1 << bit);
  }

  isSolid(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false;
    }

    const bit = x % 32;
    return (this.data[this.getWordIndex(x, y)] & (1 << bit)) !== 0;
  }

  clearCircle(centerX, centerY, radius) {
    const radiusSquared = radius * radius;
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(centerY + radius));

    for (let y = minY; y <= maxY; y += 1) {
      const deltaY = y - centerY;
      const horizontalSpan = Math.sqrt(Math.max(0, radiusSquared - deltaY * deltaY));
      const minX = Math.max(0, Math.floor(centerX - horizontalSpan));
      const maxX = Math.min(this.width - 1, Math.ceil(centerX + horizontalSpan));

      for (let x = minX; x <= maxX; x += 1) {
        const bit = x % 32;
        const index = this.getWordIndex(x, y);
        this.data[index] &= ~(1 << bit);
      }
    }
  }

  overlapsShiftedRow(wordA, wordB, shift) {
    return (wordA & safeShiftRight(wordB, shift)) !== 0;
  }
}
