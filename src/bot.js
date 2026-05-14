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
} = require("@discordjs/voice");
const { parseMentionCommand } = require("./commandParser");
const { AudioCache } = require("./audioCache");
const { DebugLog } = require("./debugLog");

class TtsBot {
  constructor({ client, apiClient }) {
    this.client = client;
    this.apiClient = apiClient;
    this.guildStates = new Map();
    this.cache = new AudioCache(32);
    this.debugLog = new DebugLog(300);

    this.client.on("ready", () => this.#onReady());
    this.client.on("messageCreate", (message) => this.#onMessage(message));
    this.client.on("voiceStateUpdate", (oldState, newState) => this.#onVoiceStateUpdate(oldState, newState));
  }

  async #onReady() {
    this.log(`Logged in as ${this.client.user.tag}`);

    try {
      await this.apiClient.authenticate();
    } catch (error) {
      this.log(`API authentication failed on startup: ${error.message}`);
    }
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
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });

      const state = {
        player,
        queue: [],
        disconnectTimer: null,
      };

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
      case "queue":
        await this.#handleQueue(message);
        break;
      case "clear":
        await this.#handleClear(message);
        break;
      case "history":
        await this.#handleHistory(message);
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

    const state = this.#getGuildState(message.guildId);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guildId,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.subscribe(state.player);
    this.log(`Joined voice channel ${voiceChannel.id} in guild ${message.guildId}`);

    this.#evaluateAutoDisconnect(message.guildId);
    await message.reply(`Joined **${voiceChannel.name}**.`);
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

    const connection = getVoiceConnection(message.guildId);
    if (!connection) {
      await this.#handleJoin(message);
    }

    const state = this.#getGuildState(message.guildId);

    try {
      let audioBuffer = this.cache.get(text);

      if (audioBuffer) {
        this.log(`Cache hit for text in guild ${message.guildId}`);
      } else {
        this.log(`Cache miss for text in guild ${message.guildId}`);
        audioBuffer = await this.apiClient.synthesize(text);
        this.cache.set(text, audioBuffer);
      }

      state.queue.push({ text, audioBuffer });
      this.log(`Queued audio in guild ${message.guildId}. Queue length: ${state.queue.length}`);

      if (state.player.state.status === AudioPlayerStatus.Idle) {
        await this.#playNext(message.guildId);
      }

      await message.reply(`Queued. Position: ${state.queue.length}`);
    } catch (error) {
      this.log(`Failed to synthesize text: ${error.message}`);
      await message.reply(`Failed to synthesize speech: ${error.message}`);
    }
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
      const resource = createAudioResource(probed.stream, { inputType: probed.type });
      state.player.play(resource);
    } catch {
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
    }, 5 * 60 * 1000);
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
