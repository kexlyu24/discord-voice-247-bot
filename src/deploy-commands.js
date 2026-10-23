require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('\n❌ [ERROR] DISCORD_TOKEN atau CLIENT_ID belum diisi di file .env!');
  console.error('Silakan salin .env.example menjadi .env lalu isi data bot Anda.\n');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

console.log('📦 Membaca file slash commands...');
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`   ✓ Loaded command: /${command.data.name}`);
  } else {
    console.warn(`   ⚠️ File ${file} tidak memiliki properti "data" atau "execute" yang valid.`);
  }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`\n🚀 Memulai pendaftaran ${commands.length} slash commands ke Discord API...`);

    if (guildId) {
      console.log(`📌 Mendaftarkan command ke server khusus (Guild ID: ${guildId}) untuk update instan...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('✅ Berhasil mendaftarkan slash commands ke Guild!');
    } else {
      console.log('🌐 GUILD_ID tidak diisi. Mendaftarkan command secara Global...');
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Berhasil mendaftarkan slash commands secara Global!');
      console.log('ℹ️ Catatan: Pendaftaran global membutuhkan waktu 1-5 menit untuk terpropagasi di semua server Discord.');
    }
  } catch (error) {
    console.error('\n❌ Terjadi kesalahan saat mendaftarkan slash commands:');
    console.error(error);
    process.exit(1);
  }
})();
