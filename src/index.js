require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { ApiClient, DEFAULT_VOICE, DEFAULT_SPEED, DEFAULT_LANG } = require("./apiClient");
const { TtsBot } = require("./bot");

const { DISCORD_TOKEN, API_KEY, API_ENDPOINT, TTS_VOICE, TTS_SPEED, TTS_LANG } = process.env;

if (!DISCORD_TOKEN || !API_ENDPOINT) {
  throw new Error("Missing required env vars: DISCORD_TOKEN, API_ENDPOINT");
}

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
