const DEFAULT_VOICE = "af_heart";
const DEFAULT_SPEED = 1.0;
const DEFAULT_LANG = "auto";

class ApiClient {
  constructor({ endpoint, apiKey, logger }) {
    this.baseUrl = endpoint.replace(/\/$/, "");
    this.apiKey = apiKey || "not-needed";
    this.logger = logger;
  }

  async listVoices() {
    this.logger("Fetching available voices");
    const response = await fetch(`${this.baseUrl}/v1/audio/voices`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list voices: ${response.status}`);
    }

    const payload = await response.json();
    return payload.voices ?? [];
  }

  async synthesize(text, { voice = DEFAULT_VOICE, speed = DEFAULT_SPEED, lang = DEFAULT_LANG } = {}) {
    this.logger(`Synthesizing with voice=${voice} speed=${speed} lang=${lang}`);

    const body = {
      model: "kokoro",
      input: text,
      voice,
      response_format: "mp3",
      speed,
    };

    if (lang !== "auto") {
      body.lang_code = lang;
    }

    const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

module.exports = {
  ApiClient,
  DEFAULT_VOICE,
  DEFAULT_SPEED,
  DEFAULT_LANG,
};
