const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stay')
    .setDescription('Mengaktifkan atau menonaktifkan fitur 24/7 auto-stay & auto-reconnect')
    .addBooleanOption((option) =>
      option
        .setName('aktif')
        .setDescription('Pilih True untuk mengaktifkan 24/7, atau False untuk mematikan')
        .setRequired(true)
    ),

  async execute(interaction, voiceManager) {
    await interaction.deferReply();

    const aktif = interaction.options.getBoolean('aktif');
    const botMember = interaction.guild.members.me;
    const currentChannel = botMember?.voice?.channel;

    if (aktif && !currentChannel) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('⚠️ Belum Terhubung')
            .setDescription('Bot belum berada di voice channel mana pun. Silakan gunakan perintah `/join` terlebih dahulu agar bot dapat mengingat channel tujuan.'),
        ],
      });
    }

    try {
      voiceManager.saveSettings({
        guildId: interaction.guild.id,
        channelId: currentChannel ? currentChannel.id : voiceManager.settings.channelId,
        stay247: aktif,
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(aktif ? 0x57f287 : 0xed4245)
            .setTitle(aktif ? '🟢 Mode 24/7 Diaktifkan' : '🔴 Mode 24/7 Dinonaktifkan')
            .setDescription(
              aktif
                ? `Bot akan otomatis standby 24 jam nonstop di voice channel <#${currentChannel.id}> dan otomatis menyambung kembali jika koneksi terputus atau bot di-restart.`
                : 'Mode 24/7 dimatikan. Bot tidak akan otomatis menyambung kembali jika koneksi terputus.'
            )
            .addFields(
              { name: 'Status 24/7', value: aktif ? '✅ Aktif' : '❌ Nonaktif', inline: true },
              { name: 'Channel', value: currentChannel ? `<#${currentChannel.id}>` : 'Tidak ada', inline: true }
            )
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error('[Command /stay] Error:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Terjadi Kesalahan')
            .setDescription(`Gagal mengubah status 24/7: ${err.message}`),
        ],
      });
    }
  },
};
