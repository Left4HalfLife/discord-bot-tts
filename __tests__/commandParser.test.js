const { parseMentionCommand } = require("../src/commandParser");

describe("parseMentionCommand", () => {
  it("parses commands prefixed with mention and !", () => {
    expect(parseMentionCommand("<@123> !say hello there", "123")).toEqual({
      command: "say",
      args: "hello there",
    });
  });

  it("parses mention command without ! for leave", () => {
    expect(parseMentionCommand("<@!123> leave", "123")).toEqual({
      command: "leave",
      args: "",
    });
  });

  it("returns null when mention does not target bot", () => {
    expect(parseMentionCommand("<@999> !join", "123")).toBeNull();
  });
});
