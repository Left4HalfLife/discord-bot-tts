const { EventEmitter } = require("node:events");
const { TtsBot } = require("../src/bot");

function createClient() {
  const client = new EventEmitter();
  client.user = { id: "123", tag: "tts-bot#0001" };
  client.guilds = { cache: new Map() };
  return client;
}

function createMessage(content) {
  return {
    content,
    author: { bot: false },
    guildId: "guild-1",
    reply: jest.fn().mockResolvedValue(),
  };
}

async function dispatchMessage(client, message) {
  client.emit("messageCreate", message);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("TtsBot endpoint commands", () => {
  beforeEach(() => {
    jest.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the current endpoint when no argument is provided", async () => {
    const client = createClient();
    const apiClient = {
      getEndpoint: jest.fn(() => "http://localhost:8880"),
    };

    new TtsBot({ client, apiClient });
    const message = createMessage("<@123> !endpoint");
    await dispatchMessage(client, message);

    expect(message.reply).toHaveBeenCalledWith(
      "Current API endpoint: **http://localhost:8880**. Usage: @bot !endpoint <url>|test"
    );
  });

  it("updates the endpoint and reports a successful connection test", async () => {
    const client = createClient();
    let endpoint = "http://localhost:8880";
    const apiClient = {
      getEndpoint: jest.fn(() => endpoint),
      setEndpoint: jest.fn((nextEndpoint) => {
        endpoint = nextEndpoint;
        return endpoint;
      }),
      testConnection: jest.fn(async () => ({
        endpoint,
        voicesCount: 2,
      })),
    };

    new TtsBot({ client, apiClient });
    const message = createMessage("<@123> !endpoint http://example.com:9999");
    await dispatchMessage(client, message);

    expect(apiClient.setEndpoint).toHaveBeenCalledWith("http://example.com:9999");
    expect(apiClient.testConnection).toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith(
      "API endpoint updated to **http://example.com:9999**. Connection successful (2 voices available)."
    );
  });

  it("includes the endpoint in the settings output", async () => {
    const client = createClient();
    const apiClient = {
      getEndpoint: jest.fn(() => "http://localhost:8880"),
    };

    new TtsBot({ client, apiClient });
    const message = createMessage("<@123> !settings");
    await dispatchMessage(client, message);

    expect(message.reply).toHaveBeenCalledWith(
      "Current settings:\n" +
        "• API endpoint: **http://localhost:8880**\n" +
        "• Voice: **af_heart**\n" +
        "• Speed: **1**\n" +
        "• Language: **auto**"
    );
  });
});
