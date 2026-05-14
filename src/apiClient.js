class ApiClient {
  constructor({ endpoint, apiKey, logger }) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.logger = logger;
    this.sessionToken = null;
  }

  async authenticate() {
    this.logger("Authenticating API session");
    const response = await fetch(`${this.endpoint}/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({ apiKey: this.apiKey }),
    });

    if (!response.ok) {
      throw new Error(`Failed API auth: ${response.status}`);
    }

    const payload = await response.json();
    this.sessionToken =
      payload.sessionToken ??
      payload.session_token ??
      payload.token ??
      payload.session ??
      null;

    this.logger("API session authenticated");
    return this.sessionToken;
  }

  async synthesize(text) {
    if (!this.sessionToken) {
      await this.authenticate();
    }

    let response = await this.#requestSynthesis(text);

    if (response.status === 401 || response.status === 403) {
      this.logger("API session expired, requesting new session");
      await this.authenticate();
      response = await this.#requestSynthesis(text);
    }

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.status}`);
    }

    const payload = await response.json();
    const audioBase64 =
      payload.audioBase64 ??
      payload.audio_base64 ??
      payload.audio ??
      payload.data ??
      null;

    if (!audioBase64) {
      throw new Error("TTS response missing base64 audio payload");
    }

    return Buffer.from(audioBase64, "base64");
  }

  #requestSynthesis(text) {
    const headers = {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };

    if (this.sessionToken) {
      headers.authorization = `Bearer ${this.sessionToken}`;
      headers["x-session-token"] = this.sessionToken;
    }

    return fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });
  }
}

module.exports = {
  ApiClient,
};
