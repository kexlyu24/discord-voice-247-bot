const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Memutuskan koneksi bot dari voice channel dan menonaktifkan mode 24/7'),

  async execute(interaction, voiceManager) {
    await interaction.deferReply();

    const botMember = interaction.guild.members.me;
    const currentChannel = botMember?.voice?.channel;

    if (!currentChannel) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('⚠️ Tidak Sedang Terhubung')
            .setDescription('Bot saat ini tidak sedang berada di voice channel mana pun.'),
        ],
      });
    }

    try {
      voiceManager.leaveChannel(interaction.guild.id);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('👋 Berhasil Keluar')
            .setDescription(`Bot telah keluar dari voice channel <#${currentChannel.id}>.`)
            .addFields(
              { name: 'Channel Sebelumnya', value: `🔊 ${currentChannel.name}`, inline: true },
              { name: 'Mode 24/7', value: '🔴 Dinonaktifkan', inline: true }
            )
            .setFooter({ text: 'Gunakan perintah /join untuk menghubungkan kembali bot.' })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error('[Command /leave] Error:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Terjadi Kesalahan')
            .setDescription(`Gagal keluar dari voice channel: ${err.message}`),
        ],
      });
    }
  },
};
