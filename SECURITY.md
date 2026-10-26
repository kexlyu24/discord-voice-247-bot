# Security Policy

## Reporting a vulnerability

Do not post bot tokens, passwords, private keys, host credentials, private activity data, or exploitable vulnerability details in public issues, discussions, or logs.

If this repository's GitHub **Security** tab offers **Report a vulnerability**, use that private reporting feature. Its availability is not guaranteed. Otherwise, consult the maintainer's public profile for an explicitly published security contact. A GitHub profile is not itself a private messaging channel.

If neither option is available, open a minimal public issue asking for a private reporting route, without including the vulnerability details or sensitive data. Wait for a private channel before sharing a reproduction.

A useful private report includes:

- The affected commit, Node.js version, and component.
- Reproduction steps and expected versus observed behavior.
- Potential impact and the permissions needed to reproduce it.
- Sanitized logs and a suggested fix, if available.

Use the latest `main` revision as the reference when reporting. This project does not promise a response deadline or maintenance of older versions.

## Exposed credentials

Treat any published Discord bot token as compromised, even after deleting the original message or file.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), select the application, and open **Bot**.
2. Choose **Reset Token** to invalidate the exposed token.
3. Replace `DISCORD_TOKEN` in the deployment environment and restart the bot through its process manager.
4. Review server audit logs and the bot's permissions for unexpected actions.
5. Remove exposed material from public locations and repository history as appropriate. History cleanup does not replace token rotation.

Rotate exposed host passwords or SSH keys separately and review authentication logs. Do not include replacement credentials in a report.

## Deployment and data protection

- Keep `.env`, runtime databases, backups, and logs out of version control and public attachments. Review files before publishing them; ignore rules do not remove previously tracked secrets.
- Run as a dedicated non-root account and grant only the Discord permissions needed. Restrict local access to configuration and `data/`; on Unix-like hosts, `chmod 600 .env` limits access to its owner.
- Restrict commands using Discord's application-command permissions. Only `/presence` checks for Administrator or Manage Server in application code; other commands have no member-role check. Members with command access can change voice behavior or view statistics and host metrics.
- Analytics stores member IDs, usernames, timestamps, and voice durations in `data/analytics.db`. It does not record audio. Analytics replies are public; `/presence` replies are ephemeral (visible only to the caller). No automatic data retention or per-member deletion feature is provided. Inform members and establish an appropriate retention policy.
- Use a separate process and data directory per guild. Current settings and analytics are not isolated between guilds in one instance.
- Keep Node.js and dependencies updated, review dependency changes, and back up runtime data securely before upgrades.

See [README.md](README.md) for setup, permissions, storage details, and operational limitations.
