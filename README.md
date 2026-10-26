# Discord Voice 24/7

A self-hosted Discord bot for maintaining a voice connection, with silent keepalive, automatic reconnection, configurable activity presence, and local voice-activity statistics.

Built with discord.js v14 and `@discordjs/voice`. Licensed under the [MIT License](LICENSE).

## Features

- Joins a selected voice channel and attempts to reconnect when disconnected or moved.
- Sends Opus silence frames without FFmpeg and checks connection state every 30 seconds.
- Persists the target channel, reconnect mode, and activity presence across restarts.
- Reports voice connection state, Gateway latency, process uptime, and host CPU/RAM usage.
- Stores voice-session metadata in local SQLite for heatmaps and session records.

Repository documentation is in English. The bot-facing command descriptions, option names, and replies remain in Indonesian; this is not a runtime UI translation.

## Requirements

- **Node.js 24 LTS recommended**, or Node.js **22.13.0 or later within the 22.x release line**, with npm. Analytics uses built-in `node:sqlite`; the locked dependencies also include a Node 22.13+ requirement.
- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
- A continuously running host with writable local storage and outbound HTTPS, WebSocket, and UDP connectivity.

Invite the application with the `bot` and `applications.commands` scopes. Grant the bot **View Channels**, **Connect**, and **Speak** in its target voice channel, and **Send Messages** and **Embed Links** where commands are used. Check channel-level permission overrides as well. Administrator permission is not required for the bot.

Only the non-privileged `Guilds` and `GuildVoiceStates` Gateway intents are requested. No privileged intents or FFmpeg installation are needed.

## Quick start

### 1. Install

```bash
git clone https://github.com/kexlyu24/discord-voice-247-bot.git
cd discord-voice-247-bot
npm ci
```

### 2. Configure

Copy [`.env.example`](.env.example) to `.env`:

```bash
# Linux / macOS
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` locally; never publish your token.

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Required bot token for running the bot and registering commands. |
| `CLIENT_ID` | Application ID; required for command registration. |
| `GUILD_ID` | Optional guild ID for guild-scoped command registration. Also needed with `TARGET_CHANNEL_ID` for initial automatic joining. |
| `TARGET_CHANNEL_ID` | Optional initial voice channel ID. Otherwise, select a channel with `/join`. |
| `SELF_DEAF` | Defaults to `true` unless explicitly set to `false`. |
| `SELF_MUTE` | Defaults to `false` unless explicitly set to `true`; the example configuration sets it to `true`. |

Saved settings take precedence over environment defaults for the target guild and channel. Changing `.env` does not override an already saved target; use `/join` to change it.

### 3. Register commands and start

```bash
npm run deploy
npm start
```

`npm run deploy` registers the current command set with Discord; it does not start the bot. With `GUILD_ID`, registration targets that guild. Without it, commands are registered globally and may take time to propagate. Registration replaces the application's command set in the selected scope. Re-run it when command definitions change.

Run `/join` while in a voice channel, or specify its `channel` option. On startup, the bot attempts to restore its saved target when reconnect mode is enabled.

## Commands and permissions

Use commands inside a server. Discord's application-command permissions can further restrict access.

| Command | Application-level access check | Behavior |
| --- | --- | --- |
| `/join [channel]` | No member role check | Joins the selected voice or Stage channel, or the caller's current channel, and enables reconnect mode. Explicitly checks the bot's **Connect** permission. |
| `/leave` | No member role check | Disconnects and disables reconnect mode. |
| `/stay aktif:<true\|false>` | No member role check | Toggles reconnect mode without leaving. Enabling it requires the bot to be in voice already. |
| `/status` | No member role check | Shows target/actual channel, RTC state, time in voice, Gateway ping, uptime, and host CPU/RAM metrics. |
| `/insights heatmap [days]` | No member role check | Displays a voice-activity heatmap; `days` accepts 1–90 and defaults to 30. |
| `/insights records` | No member role check | Displays the current streak, longest stored group and individual sessions, and top three members over a 30-day window. |
| `/presence tipe:<choice> teks:<text>` | **Administrator** or **Manage Server** (`ManageGuild`) | Sets Watching, Playing, Listening, or Competing activity; text is limited to 128 characters. |

Example: `/presence tipe:Watching teks:Community voice`

Command replies, including statistics, are generally public; `/presence` replies are ephemeral (visible only to the caller). Restrict command access in Discord if members should not be able to change the voice target, disconnect the bot, or view activity records and host metrics.

## Analytics: what the numbers mean

Analytics records non-bot voice membership, not speech or audio content. It observes voice activity beyond the bot's target channel.

- **Member sessions:** begin when a member joins voice and end when they disconnect. Moving between voice channels does not split a session. Members already connected at startup are timed from that startup, not their original join time.
- **Heatmap:** sums completed member-session durations into the session's **starting** weekday/hour in **WIB (UTC+7)**. Durations are not split across hourly buckets. The selected window filters by session start time; totals are accumulated member-time, not elapsed channel occupancy or speaking time.
- **Group sessions:** require at least two non-bot members. Counting prioritizes the bot's current channel, otherwise the channel associated with the event, and finally the most populated voice channel. This is not a separate history for every channel.
- **Records:** longest sessions use all stored history. The top-three ranking uses sessions started in the last 30 days. A streak counts consecutive WIB dates with completed group activity, starting today or yesterday; a group session is credited to its starting date, even if it spans midnight.
- **Incomplete sessions:** ongoing sessions are not included in queries until completed or flushed during graceful shutdown. Abrupt termination can lose in-memory sessions; downtime is not backfilled.

**Use one guild per instance.** Voice settings and analytics state are shared across the process; the database has no guild partitioning. Inviting one instance to several guilds can mix statistics and voice controls.

## Persistence and privacy

The bot writes these files under `data/`:

| File | Contents |
| --- | --- |
| `settings.json` | Target guild/channel IDs, reconnect mode, and activity presence. |
| `analytics.db` | Member IDs, usernames, session timestamps/durations, group participant peaks, and daily streak aggregates. |

Keep `data/` on persistent storage and writable by the service account. Back it up with the bot stopped for a consistent copy. Do not commit runtime data or share databases publicly. There is no automatic retention policy or built-in per-member deletion command; operators are responsible for access control, retention, and informing members about collection. See [SECURITY.md](SECURITY.md).

## Deployment

Run one process per configuration and data directory. Do not run the Windows launcher and PM2 against the same instance.

### Linux / VPS with PM2

After completing setup, install PM2 using your host's Node.js installation and run from the repository directory:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Follow the host-specific command printed by `pm2 startup` to configure boot startup. Use a dedicated, non-root service account where possible.

```bash
pm2 status
pm2 logs discord-voice-247 --lines 100
```

The [PM2 configuration](ecosystem.config.cjs) runs `src/index.js`, uses a three-second restart delay, and requests a restart at the configured `300M` memory threshold. That threshold is not a hard memory cap or a resource-usage guarantee.

### Windows

After setup and command registration, run:

```powershell
.\start.bat
```

The [launcher](start.bat) requires `.env`, runs `npm install` if `node_modules` is absent, and restarts the bot five seconds after it exits. It does not configure startup after reboot. Keep the computer awake and the launcher running.

### Operational limits and troubleshooting

“24/7” describes the reconnect mode, not an uptime guarantee. Discord outages, network/firewall rules, revoked permissions, host sleep, and process failures can interrupt service. CPU and memory requirements vary with activity and retained data.

- **Commands missing:** check application/guild IDs, invitation scopes, and command permissions. Re-register with `npm run deploy`; allow global registrations time to propagate.
- **Voice stuck connecting:** inspect logs, target-channel permissions, and outbound UDP access. Being listed in a channel does not mean the RTC connection is ready.
- **No automatic join:** check the saved reconnect setting and target. Use `/join` to select a target; `/leave` disables automatic restoration.
- **SQLite or engine errors:** check `node --version` in the actual service environment, not only your shell. Use the supported Node version and reinstall with `npm ci`.
- **Missing recent analytics:** active sessions are not yet queryable; historical sessions from before startup or during downtime cannot be recovered.

## Source layout

- [`src/index.js`](src/index.js): client initialization, command dispatch, and lifecycle events.
- [`src/commands/`](src/commands/): slash command definitions and handlers.
- [`src/managers/voiceManager.js`](src/managers/voiceManager.js): voice connection, keepalive, reconnects, and settings.
- [`src/managers/analyticsManager.js`](src/managers/analyticsManager.js): SQLite storage and analytics calculations.
- [`src/deploy-commands.js`](src/deploy-commands.js): command registration.

## License

[MIT](LICENSE). See [SECURITY.md](SECURITY.md) for reporting guidance and deployment precautions.
