class AudioCache {
  constructor(limit = 32) {
    this.limit = limit;
    this.store = new Map();
  }

  get(text) {
    if (!this.store.has(text)) {
      return null;
    }

    const value = this.store.get(text);
    this.store.delete(text);
    this.store.set(text, value);
    return value;
  }

  set(text, audioBuffer) {
    if (this.store.has(text)) {
      this.store.delete(text);
    }

    this.store.set(text, audioBuffer);

    if (this.store.size > this.limit) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
  }

  entriesNewestFirst() {
    return [...this.store.entries()].reverse();
  }
}

module.exports = {
  AudioCache,
};
