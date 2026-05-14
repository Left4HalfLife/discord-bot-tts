# discord-bot-tts

Discord bot text to speech.

## Commands

Mention the bot and run:

- `@bot !join` - join your current voice channel.
- `@bot leave` - disconnect from voice.
- `@bot !say <text>` - queue TTS from API (`text` max 2000 chars).
- `@bot !queue` - show queued items (first 20 chars each).
- `@bot !clear` - clear queue and stop playback.
- `@bot !history` - show last 32 cached texts.
- `@bot !debug` - show recent debug logs.

If a voice channel becomes empty (no non-bot users), the bot auto-disconnects after 5 minutes.

## Environment

Copy `.env.example` to `.env` and fill in:

- `DISCORD_TOKEN`
- `API_KEY`
- `API_ENDPOINT`

On startup, the bot logs in to Discord and authenticates with `API_ENDPOINT` using `API_KEY` for a session.
If a TTS request gets `401/403`, it automatically re-authenticates and retries once.

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
