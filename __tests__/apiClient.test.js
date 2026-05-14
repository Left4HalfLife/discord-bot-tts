const { ApiClient } = require("../src/apiClient");

const logger = () => {};

function mockFetch(status, body, isJson = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: isJson ? () => Promise.resolve(body) : undefined,
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
    mockFetch(500, {});

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "test", logger });
    await expect(client.listVoices()).rejects.toThrow("Failed to list voices: 500");
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const client = new ApiClient({ endpoint: "http://localhost:8880", apiKey: "key", logger });
    await expect(client.synthesize("hi")).rejects.toThrow("TTS request failed: 422");
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
});
