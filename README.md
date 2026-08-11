# IOE Discord Music Bot

A TypeScript Discord music bot that supports playback, downloading, and queue management. Built with `discord.js`.

## Features

- Play audio in voice channels (via `ytdlp`).
- Queue management and basic playback controls.
- Slash command registration helper (`deploy-commands`).
- Web server to share downloaded videos(Youtube, soundcloud etc).

## Requirements

- Node.js (24.x recommended)
- npm
- A Discord bot application and token

## Quickstart

1. Clone the repo:

```bash
git clone https://github.com/T-Rumibul/IOE-discord-music-bot.git
cd IOE-discord-music-bot
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root with the following values (example):

```env
# Development token and id (used when `prod` != 'true')
DEVTOKEN=your-dev-bot-token
DEV_CLIENT_ID=your-dev-bot-client-id
# Production token and id (used when `prod` === 'true')
DISCORD_TOKEN=your-production-bot-token
DISCORD_CLIENT_ID=your-bot-client-id
# IP or hostname the bot is hosted, used for download links generation
HOST=0.0.0.0
# Port the bot server listens on (default: 3000)
PORT=3000
# Optional
LOG_LEVEL=info
DOWNLOADS_COMMAND_DISABLED=false
# Optional urls to GIFs for the player
PLAYER_GIF_IDLE=
PLAYER_GIF_PLAYING=
prod=false
COOKIE_FILE=<path-to-your-cookies.txt> // Optional, default is `cookies.txt` in the root directory.
```
4. Export youtube cookies to a cookies.txt file and put it in the root directory of the project or specify the path in the `.env` file.

Note: `src/config.ts` expects `DISCORD_CLIENT_ID / DEV_CLIENT_ID` and either `DISCORD_TOKEN`/`DEVTOKEN` depending on `prod`.

## Scripts

```bash
npm run dev           # Run in watch mode (tsx)
npm run build         # Run TypeScript build (runs prebuild clean)
npm start             # Run compiled output from dist/
npm run deploy-commands # Deploy slash commands (after build), run one time after initial setup or after changing commands
```

Use `npm run dev` for local development and `npm run build && npm start` to run a production build.

## Binaries

The project downloads and uses `yt-dlp` and `ffmpeg` binaries. The bot will attempt to download them automatically. If it fails, you can manually download ytdlp and place it in the `binaries/` folder and `ffmpeg && ffprobe` in the root directory.

## Commands

- `/ping` — basic latency check.
- `/play` — play a URL or search query.
- `/download` — download a track and share the link to file in the chat.
- `/clear` — delete specified number of messages in the channel.
- `/invite` — generates a bot invite URL.

See the implementations in `src/client/commands/` for details.

## Deployment

1. Build the project:

```bash
npm run build
```

2. Deploy commands (required to run after build if this is the first time running the bot or after adding new commands/subcommands, otherwise you won't see the commands in discord):

```bash
npm run deploy-commands
```

3. Start the bot:

```bash
npm run start
```

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.