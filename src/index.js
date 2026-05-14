require("dotenv").config();

const { spawnSync } = require("node:child_process");
const { Client, GatewayIntentBits } = require("discord.js");
const { ApiClient, DEFAULT_VOICE, DEFAULT_SPEED, DEFAULT_LANG } = require("./apiClient");
const { TtsBot } = require("./bot");

const { DISCORD_TOKEN, API_KEY, API_ENDPOINT, TTS_VOICE, TTS_SPEED, TTS_LANG } = process.env;

if (!DISCORD_TOKEN || !API_ENDPOINT) {
  throw new Error("Missing required env vars: DISCORD_TOKEN, API_ENDPOINT");
}

function logFfmpegDiagnostics() {
  const commands = ["ffmpeg", "ffprobe", "avconv"];

  for (const command of commands) {
    try {
      const result = spawnSync(command, ["-version"], {
        encoding: "utf8",
        timeout: 5000,
      });

      if (!result.error && result.status === 0) {
        const firstLine = (result.stdout || result.stderr || "").split("\n").find(Boolean) || "version output unavailable";
        // eslint-disable-next-line no-console
        console.debug(`[startup] ${command} available: ${firstLine}`);
        return;
      }

      const details = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `exit status ${result.status}`;
      // eslint-disable-next-line no-console
      console.debug(`[startup] ${command} check failed: ${details}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.debug(`[startup] ${command} check threw: ${error.message}`);
    }
  }

  // eslint-disable-next-line no-console
  console.debug("[startup] No ffmpeg-compatible binary found (checked: ffmpeg, ffprobe, avconv)");
}

logFfmpegDiagnostics();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const bot = new TtsBot({
  client,
  apiClient: new ApiClient({
    endpoint: API_ENDPOINT,
    apiKey: API_KEY,
    logger: (message) => bot.log(message),
  }),
  defaultVoice: TTS_VOICE || DEFAULT_VOICE,
  defaultSpeed: TTS_SPEED ? (parseFloat(TTS_SPEED) || DEFAULT_SPEED) : DEFAULT_SPEED,
  defaultLang: TTS_LANG || DEFAULT_LANG,
});

client.login(DISCORD_TOKEN);
