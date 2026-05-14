# discord-bot-tts

Discord bot text to speech powered by [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).

## Commands

Mention the bot and run:

- `@bot !join` — join your current voice channel.
- `@bot leave` — disconnect from voice.
- `@bot !say <text>` — queue TTS (`text` max 2000 chars).
- `@bot !voice [name]` — set (or show) the voice for this server (e.g. `af_bella`, `bm_lewis`).
- `@bot !speed [value]` — set (or show) the speech speed for this server (0.25–4.0, default 1.0).
- `@bot !lang [code]` — set (or show) the language for this server (`auto`, `a`=American English, `b`=British English, `j`=Japanese, `z`=Chinese).
- `@bot !voices` — list all voices available from the Kokoro-FastAPI server.
- `@bot !settings` — show current voice, speed, and language for this server.
- `@bot !queue` — show queued items (first 20 chars each).
- `@bot !clear` — clear queue and stop playback.
- `@bot !history` — show last 32 cached items.
- `@bot !debug` — show recent debug logs.

Voice, speed, and language settings are per-server and reset to defaults when the bot restarts.

If a voice channel becomes empty (no non-bot users), the bot auto-disconnects after 5 minutes.

## Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Discord bot token |
| `API_ENDPOINT` | ✅ | Kokoro-FastAPI base URL (e.g. `http://localhost:8880`) |
| `API_KEY` | optional | API key (omit for unauthenticated local setups) |
| `TTS_VOICE` | optional | Default voice (default: `af_heart`) |
| `TTS_SPEED` | optional | Default speed between 0.25–4.0 (default: `1.0`) |
| `TTS_LANG` | optional | Default language code (default: `auto`) |

## Kokoro-FastAPI setup

Start Kokoro-FastAPI (CPU):

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Or GPU:

```bash
docker run --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

Then set `API_ENDPOINT=http://localhost:8880` (or the host/IP where Kokoro-FastAPI is running).

## Run locally

```bash
npm install
npm test
npm start
```

## Docker

```bash
docker build -t discord-bot-tts .
docker run --env-file .env discord-bot-tts
```

