class DebugLog {
  constructor(limit = 200) {
    this.limit = limit;
    this.logs = [];
  }

  add(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    this.logs.push(line);

    if (this.logs.length > this.limit) {
      this.logs.shift();
    }
  }

  tail(maxLines = 50) {
    return this.logs.slice(-maxLines);
  }
}

module.exports = {
  DebugLog,
};
