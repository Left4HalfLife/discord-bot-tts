const { AudioCache } = require("../src/audioCache");

describe("AudioCache", () => {
  it("keeps only last N entries", () => {
    const cache = new AudioCache(2);
    cache.set("a", Buffer.from("a"));
    cache.set("b", Buffer.from("b"));
    cache.set("c", Buffer.from("c"));

    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toEqual(Buffer.from("b"));
    expect(cache.get("c")).toEqual(Buffer.from("c"));
  });

  it("moves hit entries to latest history position", () => {
    const cache = new AudioCache(3);
    cache.set("one", Buffer.from("1"));
    cache.set("two", Buffer.from("2"));
    cache.set("three", Buffer.from("3"));

    cache.get("one");

    expect(cache.entriesNewestFirst().map(([text]) => text)).toEqual([
      "one",
      "three",
      "two",
    ]);
  });
});
