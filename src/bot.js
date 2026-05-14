const { createReadStream } = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
  demuxProbe,
  entersState,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
} = require("@discordjs/voice");
const { parseMentionCommand } = require("./commandParser");
const { AudioCache } = require("./audioCache");
const { DebugLog } = require("./debugLog");
const { DEFAULT_VOICE, DEFAULT_SPEED, DEFAULT_LANG } = require("./apiClient");

const DEBUG_LOG_LIMIT = 300;
const AUTO_DISCONNECT_MS = 5 * 60 * 1000;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4.0;
const TEST_AUDIO_PATH = path.join(__dirname, "test.wav");
const VOICE_CONNECTION_TIMEOUT_MS = 20_000;
const VOICE_RECONNECT_TIMEOUT_MS = 5_000;

class TtsBot {
  constructor({ client, apiClient, defaultVoice = DEFAULT_VOICE, defaultSpeed = DEFAULT_SPEED, defaultLang = DEFAULT_LANG }) {
    this.client = client;
    this.apiClient = apiClient;
    this.defaultVoice = defaultVoice;
    this.defaultSpeed = defaultSpeed;
    this.defaultLang = defaultLang;
    this.guildStates = new Map();
    this.cache = new AudioCache(32);
    this.debugLog = new DebugLog(DEBUG_LOG_LIMIT);

    this.client.on("ready", () => this.#onReady());
    this.client.on("messageCreate", (message) => this.#onMessage(message));
    this.client.on("voiceStateUpdate", (oldState, newState) => this.#onVoiceStateUpdate(oldState, newState));
  }

  async #onReady() {
    this.log(`Logged in as ${this.client.user.tag}`);
  }

  log(message) {
    this.debugLog.add(message);
    // eslint-disable-next-line no-console
    console.debug(message);
  }

  #getGuildState(guildId) {
    if (!this.guildStates.has(guildId)) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
        },
      });

      const state = {
        player,
        queue: [],
        disconnectTimer: null,
        voice: this.defaultVoice,
        speed: this.defaultSpeed,
        lang: this.defaultLang,
      };

      player.on("stateChange", (oldState, newState) => {
        this.log(`Audio player state change for guild ${guildId}: ${oldState.status} -> ${newState.status}`);
      });

      player.on(AudioPlayerStatus.Idle, () => {
        this.#playNext(guildId).catch((error) => {
          this.log(`Playback error for guild ${guildId}: ${error.message}`);
        });
      });

      player.on("error", (error) => {
        this.log(`Audio player error for guild ${guildId}: ${error.message}`);
      });

      this.guildStates.set(guildId, state);
    }

    return this.guildStates.get(guildId);
  }

  async #onMessage(message) {
    if (!this.client.user || message.author.bot || !message.guildId) {
      return;
    }

    const parsed = parseMentionCommand(message.content, this.client.user.id);
    if (!parsed) {
      return;
    }

    const { command, args } = parsed;

    switch (command) {
      case "join":
        await this.#handleJoin(message);
        break;
      case "leave":
        await this.#handleLeave(message);
        break;
      case "say":
        await this.#handleSay(message, args);
        break;
      case "testaudio":
        await this.#handleTestAudio(message);
        break;
      case "queue":
        await this.#handleQueue(message);
        break;
      case "clear":
        await this.#handleClear(message);
        break;
      case "history":
        await this.#handleHistory(message);
        break;
      case "voice":
        await this.#handleVoice(message, args);
        break;
      case "speed":
        await this.#handleSpeed(message, args);
        break;
      case "lang":
        await this.#handleLang(message, args);
        break;
      case "voices":
        await this.#handleVoices(message);
        break;
      case "endpoint":
        await this.#handleEndpoint(message, args);
        break;
      case "settings":
        await this.#handleSettings(message);
        break;
      case "debug":
        await this.#handleDebug(message);
        break;
      default:
        await message.reply("Unknown command.");
        break;
    }
  }

  #onVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!guildId) {
      return;
    }

    this.#evaluateAutoDisconnect(guildId);
  }

  async #handleJoin(message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply("Join a voice channel first.");
      return;
    }

    const permissions = voiceChannel.permissionsFor(this.client.user);
    this.log(
      `Voice channel permissions for guild ${message.guildId}: connect=${permissions?.has("Connect") ?? false} speak=${permissions?.has("Speak") ?? false} useVAD=${permissions?.has("UseVAD") ?? false}`
    );

    const state = this.#getGuildState(message.guildId);
    const existingConnection = getVoiceConnection(message.guildId);
    if (existingConnection) {
      this.log(`Destroying existing voice connection in guild ${message.guildId} before rejoin. Current status: ${existingConnection.state.status}`);
      existingConnection.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guildId,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on("stateChange", async (oldState, newState) => {
      this.log(`Voice connection state change in guild ${message.guildId}: ${oldState.status} -> ${newState.status}`);

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        try {
          if (connection.state.reason === VoiceConnectionDisconnectReason.WebSocketClose && connection.state.closeCode === 4014) {
            this.log(`Voice connection disconnected with close code 4014 in guild ${message.guildId}; waiting for reconnect.`);
            await entersState(connection, VoiceConnectionStatus.Connecting, VOICE_RECONNECT_TIMEOUT_MS);
          } else if (connection.rejoinAttempts < 5) {
            this.log(`Attempting voice reconnection in guild ${message.guildId}; attempt ${connection.rejoinAttempts + 1}`);
            await entersState(connection, VoiceConnectionStatus.Connecting, VOICE_RECONNECT_TIMEOUT_MS);
          } else {
            this.log(`Destroying voice connection in guild ${message.guildId} after repeated disconnects.`);
            connection.destroy();
          }
        } catch (error) {
          this.log(`Voice reconnection failed in guild ${message.guildId}: ${error.message}`);
          connection.destroy();
        }
      }
    });

    connection.subscribe(state.player);
    this.log(`Subscribed audio player to voice connection in guild ${message.guildId}`);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, VOICE_CONNECTION_TIMEOUT_MS);
      this.log(`Voice connection ready for guild ${message.guildId}`);
      this.#evaluateAutoDisconnect(message.guildId);
      await message.reply(`Joined **${voiceChannel.name}**.`);
    } catch (error) {
      this.log(`Voice connection failed to become ready for guild ${message.guildId}: ${error.message}`);
      connection.destroy();
      await message.reply(`Joined **${voiceChannel.name}**, but the voice connection did not become ready.`);
    }
  }

  async #handleLeave(message) {
    this.#disconnectFromGuild(message.guildId, "manual leave command");
    await message.reply("Disconnected.");
  }

  async #handleSay(message, text) {
    if (!text) {
      await message.reply("Usage: @bot !say <text>");
      return;
    }

    if (text.length > 2000) {
      await message.reply("Text exceeds 2000 character limit.");
      return;
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply("Join a voice channel first.");
      return;
    }

    let connection = getVoiceConnection(message.guildId);
    if (!connection) {
      await this.#handleJoin(message);
      connection = getVoiceConnection(message.guildId);
    }

    if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) {
      await message.reply("Voice connection is not ready yet. Try again in a moment.");
      return;
    }

    const state = this.#getGuildState(message.guildId);
    const { voice, speed, lang } = state;
    const cacheKey = `${text}\x00${voice}\x00${speed}\x00${lang}`;

    try {
      let audioBuffer = this.cache.get(cacheKey);

      if (audioBuffer) {
        this.log(`Cache hit for text in guild ${message.guildId}`);
      } else {
        this.log(`Cache miss for text in guild ${message.guildId}`);
        audioBuffer = await this.apiClient.synthesize(text, { voice, speed, lang });
        this.cache.set(cacheKey, audioBuffer);
      }

      state.queue.push({ text, audioBuffer });
      this.log(`Queued audio in guild ${message.guildId}. Queue length: ${state.queue.length}`);

      if (state.player.state.status === AudioPlayerStatus.Idle) {
        await this.#playNext(message.guildId);
      }

      await message.reply(`Queued. Position: ${state.queue.length}`);
    } catch (error) {
      const endpoint = this.apiClient.getEndpoint();
      this.log(`Failed to synthesize text in guild ${message.guildId} via ${endpoint}: ${error.message}`);
      await message.reply(`Failed to synthesize speech via **${endpoint}**: ${error.message}`);
    }
  }

  async #handleTestAudio(message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply("Join a voice channel first.");
      return;
    }

    let connection = getVoiceConnection(message.guildId);
    if (!connection) {
      await this.#handleJoin(message);
      connection = getVoiceConnection(message.guildId);
    }

    if (!connection) {
      await message.reply("Failed to connect to the voice channel.");
      return;
    }

    this.log(`Current voice connection status in guild ${message.guildId}: ${connection.state.status}`);

    if (connection.state.status !== VoiceConnectionStatus.Ready) {
      await message.reply("Voice connection is not ready yet. Test audio was not played.");
      return;
    }

    const state = this.#getGuildState(message.guildId);
    const resource = createAudioResource(createReadStream(TEST_AUDIO_PATH), {
      inputType: StreamType.Arbitrary,
    });

    state.player.play(resource);
    this.log(`Playing test audio in guild ${message.guildId} from ${TEST_AUDIO_PATH}`);
    await message.reply("Playing test audio.");
  }

  async #handleQueue(message) {
    const state = this.#getGuildState(message.guildId);

    if (state.queue.length === 0) {
      await message.reply("Queue is empty.");
      return;
    }

    const lines = state.queue.map((item, index) => {
      const snippet = item.text.length > 20 ? `${item.text.slice(0, 20)}...` : item.text;
      return `${index + 1}. ${snippet}`;
    });

    await message.reply(`Queue:\n${lines.join("\n")}`);
  }

  async #handleClear(message) {
    const state = this.#getGuildState(message.guildId);
    state.queue = [];
    state.player.stop(true);
    this.log(`Cleared queue in guild ${message.guildId}`);
    await message.reply("Queue cleared.");
  }

  async #handleVoice(message, args) {
    const voiceName = args.trim();
    if (!voiceName) {
      const state = this.#getGuildState(message.guildId);
      await message.reply(`Current voice: **${state.voice}**. Usage: @bot !voice <name>`);
      return;
    }

    const state = this.#getGuildState(message.guildId);
    state.voice = voiceName;
    this.log(`Set voice to ${voiceName} in guild ${message.guildId}`);
    await message.reply(`Voice set to **${voiceName}**.`);
  }

  async #handleSpeed(message, args) {
    const raw = args.trim();
    if (!raw) {
      const state = this.#getGuildState(message.guildId);
      await message.reply(`Current speed: **${state.speed}**. Usage: @bot !speed <${MIN_SPEED}-${MAX_SPEED}>`);
      return;
    }

    const speed = parseFloat(raw);
    if (isNaN(speed) || speed < MIN_SPEED || speed > MAX_SPEED) {
      await message.reply(`Speed must be a number between ${MIN_SPEED} and ${MAX_SPEED}.`);
      return;
    }

    const state = this.#getGuildState(message.guildId);
    state.speed = speed;
    this.log(`Set speed to ${speed} in guild ${message.guildId}`);
    await message.reply(`Speed set to **${speed}**.`);
  }

  async #handleLang(message, args) {
    const lang = args.trim();
    if (!lang) {
      const state = this.#getGuildState(message.guildId);
      await message.reply(`Current language: **${state.lang}**. Usage: @bot !lang <auto|a|b|j|z|...>`);
      return;
    }

    const state = this.#getGuildState(message.guildId);
    state.lang = lang;
    this.log(`Set lang to ${lang} in guild ${message.guildId}`);
    await message.reply(`Language set to **${lang}**.`);
  }

  async #handleVoices(message) {
    try {
      const voices = await this.apiClient.listVoices();
      if (voices.length === 0) {
        await message.reply("No voices available.");
        return;
      }

      const text = voices.join(", ");
      const maxLength = 1900;
      if (text.length <= maxLength) {
        await message.reply(`Available voices:\n${text}`);
      } else {
        const truncated = text.slice(0, maxLength);
        const lastComma = truncated.lastIndexOf(",");
        const safe = lastComma > 0 ? truncated.slice(0, lastComma) : truncated;
        await message.reply(`Available voices (truncated):\n${safe}…`);
      }
    } catch (error) {
      const endpoint = this.apiClient.getEndpoint();
      this.log(`Failed to list voices via ${endpoint}: ${error.message}`);
      await message.reply(`Failed to retrieve voices from **${endpoint}**: ${error.message}`);
    }
  }

  async #handleEndpoint(message, args) {
    const raw = args.trim();
    if (!raw) {
      await message.reply(`Current API endpoint: **${this.apiClient.getEndpoint()}**. Usage: @bot !endpoint <url>|test`);
      return;
    }

    if (raw.toLowerCase() === "test") {
      await this.#replyEndpointCheck(message, false);
      return;
    }

    let endpoint;
    try {
      endpoint = this.apiClient.setEndpoint(raw);
    } catch (error) {
      await message.reply(`Invalid API endpoint: ${error.message}`);
      return;
    }

    this.log(`Set API endpoint to ${endpoint} in guild ${message.guildId}`);
    await this.#replyEndpointCheck(message, true);
  }

  async #replyEndpointCheck(message, changed) {
    try {
      const result = await this.apiClient.testConnection();
      this.log(`API connection successful in guild ${message.guildId}: ${result.endpoint}`);
      const prefix = changed ? "API endpoint updated to" : "API endpoint";
      await message.reply(`${prefix} **${result.endpoint}**. Connection successful (${result.voicesCount} voices available).`);
    } catch (error) {
      const endpoint = this.apiClient.getEndpoint();
      this.log(`API connection check failed in guild ${message.guildId} via ${endpoint}: ${error.message}`);
      const prefix = changed ? "API endpoint updated to" : "API endpoint";
      await message.reply(`${prefix} **${endpoint}**, but the connection test failed: ${error.message}`);
    }
  }

  async #handleSettings(message) {
    const state = this.#getGuildState(message.guildId);
    await message.reply(
      `Current settings:\n` +
      `• API endpoint: **${this.apiClient.getEndpoint()}**\n` +
      `• Voice: **${state.voice}**\n` +
      `• Speed: **${state.speed}**\n` +
      `• Language: **${state.lang}**`
    );
  }

  async #handleHistory(message) {
    const entries = this.cache.entriesNewestFirst();

    if (entries.length === 0) {
      await message.reply("History is empty.");
      return;
    }

    const lines = entries.map(([text], index) => {
      const snippet = text.length > 20 ? `${text.slice(0, 20)}...` : text;
      return `${index + 1}. ${snippet}`;
    });

    await message.reply(`History (latest first):\n${lines.join("\n")}`);
  }

  async #handleDebug(message) {
    const logs = this.debugLog.tail(25);
    if (logs.length === 0) {
      await message.reply("No debug logs yet.");
      return;
    }

    const text = logs.join("\n");
    const maxLength = 1900;

    if (text.length <= maxLength) {
      await message.reply(`\`\`\`\n${text}\n\`\`\``);
      return;
    }

    await message.reply(`\`\`\`\n${text.slice(-maxLength)}\n\`\`\``);
  }

  async #playNext(guildId) {
    const state = this.#getGuildState(guildId);
    const nextItem = state.queue.shift();
    if (!nextItem) {
      return;
    }

    const stream = Readable.from(nextItem.audioBuffer);

    try {
      const probed = await demuxProbe(stream);
      this.log(`Demux probe succeeded for guild ${guildId}: inputType=${probed.type}`);
      const resource = createAudioResource(probed.stream, { inputType: probed.type });
      state.player.play(resource);
    } catch (error) {
      this.log(`Demux probe failed for guild ${guildId}: ${error.message}`);
      const resource = createAudioResource(Readable.from(nextItem.audioBuffer), {
        inputType: StreamType.Arbitrary,
      });
      state.player.play(resource);
    }

    this.log(`Playing queued item in guild ${guildId}`);
  }

  #evaluateAutoDisconnect(guildId) {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      return;
    }

    const state = this.#getGuildState(guildId);
    const guild = this.client.guilds.cache.get(guildId);
    const channelId = connection.joinConfig.channelId;
    const channel = guild?.channels?.cache?.get(channelId);

    if (!channel?.members) {
      return;
    }

    const nonBotMembers = channel.members.filter((member) => !member.user.bot).size;

    if (nonBotMembers > 0) {
      if (state.disconnectTimer) {
        clearTimeout(state.disconnectTimer);
        state.disconnectTimer = null;
        this.log(`Cancelled auto-disconnect for guild ${guildId}`);
      }

      return;
    }

    if (state.disconnectTimer) {
      return;
    }

    this.log(`Scheduling auto-disconnect for guild ${guildId}`);
    state.disconnectTimer = setTimeout(() => {
      state.disconnectTimer = null;
      this.#evaluateAutoDisconnect(guildId);

      const verifyConnection = getVoiceConnection(guildId);
      if (!verifyConnection) {
        return;
      }

      const verifyGuild = this.client.guilds.cache.get(guildId);
      const verifyChannel = verifyGuild?.channels?.cache?.get(verifyConnection.joinConfig.channelId);
      const remainingMembers = verifyChannel?.members?.filter((member) => !member.user.bot).size ?? 0;

      if (remainingMembers === 0) {
        this.#disconnectFromGuild(guildId, "auto-disconnect after empty channel");
      }
    }, AUTO_DISCONNECT_MS);
  }

  #disconnectFromGuild(guildId, reason) {
    const state = this.#getGuildState(guildId);

    if (state.disconnectTimer) {
      clearTimeout(state.disconnectTimer);
      state.disconnectTimer = null;
    }

    state.queue = [];
    state.player.stop(true);

    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
      this.log(`Disconnected from guild ${guildId}: ${reason}`);
    }
  }
}

module.exports = {
  TtsBot,
};
