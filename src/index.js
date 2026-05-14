require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { ApiClient } = require("./apiClient");
const { TtsBot } = require("./bot");

const { DISCORD_TOKEN, API_KEY, API_ENDPOINT } = process.env;

if (!DISCORD_TOKEN || !API_KEY || !API_ENDPOINT) {
  throw new Error("Missing required env vars: DISCORD_TOKEN, API_KEY, API_ENDPOINT");
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
});

client.login(DISCORD_TOKEN);
