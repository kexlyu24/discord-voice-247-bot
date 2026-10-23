# Security Policy

## Reporting a vulnerability

Do not disclose tokens, passwords, private keys, VPS credentials, or exploitable details in a public GitHub issue.

Report security concerns privately through the repository owner's GitHub profile. Include the affected file or component, reproduction steps, impact, and a suggested fix when available.

## Secret exposure

If a Discord token is exposed:

1. Open Discord Developer Portal.
2. Select the application and open **Bot**.
3. Choose **Reset Token**.
4. Replace `DISCORD_TOKEN` in the deployment environment.
5. Restart the bot process.

If VPS credentials are exposed, rotate the password or SSH key immediately and review authentication logs.

Supported security fixes target the latest commit on the `main` branch.
