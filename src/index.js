require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Collection,
  ActivityType,
  Events,
} = require('discord.js');
const { VoiceManager } = require('./managers/voiceManager');

const token = process.env.DISCORD_TOKEN;

if (!token || token === 'your_bot_token_here') {
  console.error('\n❌ [ERROR] Token bot belum diatur di file .env!');
  console.error('Silakan buat file .env (salin dari .env.example) dan masukkan DISCORD_TOKEN dari Discord Developer Portal.\n');
  process.exit(1);
}

// Inisialisasi client Discord dengan intents yang dibutuhkan
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Load slash commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Inisialisasi VoiceManager engine
const voiceManager = new VoiceManager(client);

// Event: Client Ready
client.once(Events.ClientReady, async (c) => {
  console.log(`\n=================================================`);
  console.log(`🤖 Logged in as: ${c.user.tag} (ID: ${c.user.id})`);
  console.log(`🌐 Terhubung ke ${c.guilds.cache.size} server Discord`);
  console.log(`🛡️ Sistem 24/7 Voice Anti-Disconnect aktif`);
  console.log(`=================================================\n`);

  // Terapkan ulang berkala agar sesi Discord lain tidak meninggalkan aktivitas lama.
  const setBotPresence = () => {
    c.user.setActivity('NOIRÉL', { type: ActivityType.Watching });
    c.user.setStatus('online');
  };
  setBotPresence();
  setInterval(setBotPresence, 5 * 60 * 1000);

  // Auto-join saat startup jika ada konfigurasi tersimpan atau di .env
  const settings = voiceManager.settings;
  const targetGuildId = settings.guildId || process.env.GUILD_ID;
  const targetChannelId = settings.channelId || process.env.TARGET_CHANNEL_ID;

  if (settings.stay247 && targetGuildId && targetChannelId) {
    console.log(`[Auto-Join] Menghubungkan otomatis ke guild ${targetGuildId}, channel ${targetChannelId}...`);
    try {
      await voiceManager.joinChannel(targetGuildId, targetChannelId);
      console.log(`[Auto-Join] Berhasil terhubung otomatis saat startup!`);
    } catch (err) {
      console.error(`[Auto-Join] Gagal terhubung saat startup: ${err.message}. Watchdog akan mencoba kembali.`);
    }
  } else {
    console.log(`[Auto-Join] Belum ada channel target tersimpan. Gunakan perintah slash /join di Discord untuk memilih channel.`);
  }
});

// Event: Voice State Update (deteksi kick, move, disconnect)
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  try {
    voiceManager.handleVoiceStateUpdate(oldState, newState);
  } catch (err) {
    console.error(`[Event VoiceStateUpdate] Error:`, err.message);
  }
});

// Event: Interaction Create (eksekusi Slash Commands)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`Perintah ${interaction.commandName} tidak ditemukan.`);
    return;
  }

  try {
    await command.execute(interaction, voiceManager);
  } catch (error) {
    console.error(`Error saat menjalankan perintah /${interaction.commandName}:`, error);
    const replyPayload = {
      content: '❌ Terjadi kesalahan internal saat memproses perintah ini!',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyPayload).catch(() => {});
    } else {
      await interaction.reply(replyPayload).catch(() => {});
    }
  }
});

// Event: Gateway Shard Resume (sinkronisasi ulang jika koneksi Discord terputus dan tersambung lagi)
client.on(Events.ShardResume, (id) => {
  console.log(`[Shard ${id}] Gateway tersambung kembali (Resumed). Memeriksa integritas voice channel...`);
  if (voiceManager.settings.stay247 && voiceManager.settings.guildId && voiceManager.settings.channelId) {
    voiceManager.scheduleReconnect(1000);
  }
});

client.on(Events.ShardDisconnect, (event, id) => {
  console.warn(`[Shard ${id}] Gateway terputus (Code: ${event.code}). Menunggu auto-reconnect Discord...`);
});

client.on(Events.Error, (err) => {
  console.error('[Discord Client Error]:', err.message);
});

// Global Exception Catchers - Mencegah bot crash saat terjadi network drop atau error tak terduga
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection at]:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error(`[Uncaught Exception]: ${err.message} (Origin: ${origin})`);
});

// Graceful Shutdown
const cleanup = () => {
  console.log('\n[Shutdown] Menutup koneksi dan mematikan bot...');
  voiceManager.cleanupConnection();
  client.destroy();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Login ke Discord
client.login(token).catch((err) => {
  console.error('\n❌ [Gagal Login ke Discord]:', err.message);
  console.error('Pastikan DISCORD_TOKEN di file .env sudah benar dan valid.\n');
  process.exit(1);
});
