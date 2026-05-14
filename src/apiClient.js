const DEFAULT_VOICE = "af_heart";
const DEFAULT_SPEED = 1.0;
const DEFAULT_LANG = "auto";

class ApiClient {
  constructor({ endpoint, apiKey, logger }) {
    this.logger = logger;
    // "not-needed" is Kokoro-FastAPI's conventional placeholder for unauthenticated local setups
    this.apiKey = apiKey || "not-needed";
    this.setEndpoint(endpoint);
  }

  getEndpoint() {
    return this.baseUrl;
  }

  setEndpoint(endpoint) {
    const normalized = String(endpoint ?? "").trim().replace(/\/$/, "");
    if (!normalized) {
      throw new Error("API endpoint is required.");
    }

    this.baseUrl = normalized;
    return this.baseUrl;
  }

  async listVoices() {
    const url = `${this.baseUrl}/v1/audio/voices`;
    this.logger(`Attempting API connection for voice list: GET ${url}`);
    const response = await this.#fetchWithDiagnostics(url, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    }, "voice list request");

    const payload = await response.json();
    const voices = payload.voices ?? [];
    this.logger(`API connection successful for voice list: ${voices.length} voices available from ${this.baseUrl}`);
    return voices;
  }

  async testConnection() {
    const voices = await this.listVoices();
    return {
      endpoint: this.baseUrl,
      voicesCount: voices.length,
    };
  }

  async synthesize(text, { voice = DEFAULT_VOICE, speed = DEFAULT_SPEED, lang = DEFAULT_LANG } = {}) {
    this.logger(`Attempting speech synthesis via ${this.baseUrl} with voice=${voice} speed=${speed} lang=${lang} textLength=${text.length}`);

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

    const url = `${this.baseUrl}/v1/audio/speech`;
    const response = await this.#fetchWithDiagnostics(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    }, "speech synthesis request");

    const audioBuffer = await response.arrayBuffer();
    this.logger(`Speech synthesis successful via ${this.baseUrl}: received ${audioBuffer.byteLength} bytes`);
    return Buffer.from(audioBuffer);
  }

  async #fetchWithDiagnostics(url, options, action) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const detail = await this.#readErrorDetail(response);
        const message = `${this.#capitalize(action)} failed at ${url}: HTTP ${response.status}${detail ? ` - ${detail}` : ""}`;
        this.logger(message);
        const error = new Error(message);
        error.apiClientHandled = true;
        throw error;
      }

      return response;
    } catch (error) {
      if (error?.apiClientHandled) {
        throw error;
      }

      const message = `${this.#capitalize(action)} failed at ${url}: ${this.#formatNetworkError(error)}`;
      this.logger(message);
      throw new Error(message);
    }
  }

  async #readErrorDetail(response) {
    try {
      if (typeof response.text !== "function") {
        return "";
      }

      const raw = (await response.text()).trim();
      if (!raw) {
        return "";
      }

      const contentType = response.headers?.get?.("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const parsed = JSON.parse(raw);
        const detail = parsed.detail ?? parsed.error ?? parsed.message ?? parsed;
        return this.#stringifyDetail(detail);
      }

      return this.#truncate(raw);
    } catch (error) {
      return `Unable to read error response: ${error.message}`;
    }
  }

  #stringifyDetail(detail) {
    if (typeof detail === "string") {
      return this.#truncate(detail);
    }

    return this.#truncate(JSON.stringify(detail));
  }

  #truncate(text, maxLength = 300) {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  #formatNetworkError(error) {
    if (!error || typeof error !== "object") {
      return String(error);
    }

    const parts = [];
    const code = error.code ?? error.cause?.code;
    if (code) {
      parts.push(code);
    }

    const causeMessage = error.cause?.message;
    if (causeMessage) {
      parts.push(causeMessage);
    }

    if (error.message) {
      parts.push(error.message);
    }

    return [...new Set(parts)].join(" - ");
  }

  #capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}

module.exports = {
  ApiClient,
  DEFAULT_VOICE,
  DEFAULT_SPEED,
  DEFAULT_LANG,
};
