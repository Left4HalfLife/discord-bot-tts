const { ApiClient } = require("../src/apiClient");

const logger = () => {};

function mockFetch(status, body, { isJson = true } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? (isJson ? "application/json" : "text/plain") : null),
    },
    json: isJson ? () => Promise.resolve(body) : undefined,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    arrayBuffer: !isJson ? () => Promise.resolve(body) : undefined,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ApiClient.listVoices", () => {
  it("returns voice array from API", async () => {
    mockFetch(200, { voices: ["af_heart", "af_bella"] });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "test", logger });
    const voices = await client.listVoices();

    expect(voices).toEqual(["af_heart", "af_bella"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8880/v1/audio/voices",
      expect.objectContaining({ headers: { authorization: "Bearer test" } })
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch(500, { detail: "server unavailable" });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "test", logger });
    await expect(client.listVoices()).rejects.toThrow(
      "Voice list request failed at http://localhost:8880/v1/audio/voices: HTTP 500 - server unavailable"
    );
  });

  it("returns empty array when voices key is missing", async () => {
    mockFetch(200, {});

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "test", logger });
    const voices = await client.listVoices();
    expect(voices).toEqual([]);
  });
});

describe("ApiClient.synthesize", () => {
  it("sends correct body and returns audio buffer", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    const buffer = await client.synthesize("hello", { voice: "af_bella", speed: 1.5, lang: "auto" });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8880/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
      })
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.input).toBe("hello");
    expect(body.voice).toBe("af_bella");
    expect(body.speed).toBe(1.5);
    expect(body.model).toBe("kokoro");
    expect(body.response_format).toBe("mp3");
    expect(body.lang_code).toBeUndefined();
  });

  it("includes lang_code when lang is not auto", async () => {
    const audioBytes = new Uint8Array([]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    await client.synthesize("hello", { voice: "jf_alpha", speed: 1.0, lang: "j" });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.lang_code).toBe("j");
  });

  it("uses defaults when no options provided", async () => {
    const audioBytes = new Uint8Array([]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    await client.synthesize("hi");

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.voice).toBe("af_heart");
    expect(body.speed).toBe(1.0);
    expect(body.lang_code).toBeUndefined();
  });

  it("uses not-needed as api key fallback", async () => {
    const audioBytes = new Uint8Array([]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880", logger });
    await client.synthesize("hi");

    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.authorization).toBe("Bearer not-needed");
  });

  it("throws on non-ok response", async () => {
    mockFetch(422, { detail: "voice not found" });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    await expect(client.synthesize("hi")).rejects.toThrow(
      "Speech synthesis request failed at http://localhost:8880/v1/audio/speech: HTTP 422 - voice not found"
    );
  });

  it("strips trailing slash from endpoint", async () => {
    const audioBytes = new Uint8Array([]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(audioBytes),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880/", apiKey: "key", logger });
    await client.synthesize("hi");

    expect(global.fetch.mock.calls[0][0]).toBe("http://localhost:8880/v1/audio/speech");
  });

  it("includes network failure details in synthesis errors", async () => {
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error("fetch failed"), {
        cause: {
          code: "ECONNREFUSED",
          message: "connect ECONNREFUSED 127.0.0.1:8880",
        },
      })
    );

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    await expect(client.synthesize("hi")).rejects.toThrow(
      "Speech synthesis request failed at http://localhost:8880/v1/audio/speech: ECONNREFUSED - connect ECONNREFUSED 127.0.0.1:8880 - fetch failed"
    );
  });

  it("returns connection test details", async () => {
    mockFetch(200, { voices: ["af_heart"] });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "test", logger });
    await expect(client.testConnection()).resolves.toEqual({
      endpoint: "http://localhost:8880",
      voicesCount: 1,
    });
  });
});
