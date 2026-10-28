const { SlashCommandBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Menghubungkan bot ke voice channel dan mengaktifkan mode 24/7')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Pilih voice channel target (kosongkan untuk menggunakan channel Anda saat ini)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction, voiceManager) {
    await interaction.deferReply();

    const memberVoice = interaction.member?.voice?.channel;
    const targetChannel = interaction.options.getChannel('channel') || memberVoice;

    if (!targetChannel) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Gagal Bergabung')
            .setDescription('Silakan bergabung ke salah satu voice channel terlebih dahulu, atau sebutkan channel target pada opsi perintah!'),
        ],
      });
    }

    // Periksa permission bot di channel target
    const botMember = interaction.guild.members.me;
    const permissions = targetChannel.permissionsFor(botMember);

    if (!permissions.has(PermissionFlagsBits.Connect)) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Izin Kurang')
            .setDescription(`Bot tidak memiliki izin **Connect** di channel <#${targetChannel.id}>.`),
        ],
      });
    }

    try {
      await voiceManager.joinChannel(interaction.guild.id, targetChannel.id, true);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🔊 Berhasil Terhubung!')
            .setDescription(`Bot telah bergabung ke voice channel <#${targetChannel.id}>.`)
            .addFields(
              { name: 'Channel', value: `🔊 ${targetChannel.name} (\`${targetChannel.id}\`)`, inline: true },
              { name: 'Mode 24/7', value: '🟢 Aktif (Auto-Reconnect)', inline: true },
              { name: 'Anti-Disconnect', value: '🛡️ Aktif (Auto-Reconnect + Watchdog 30s)', inline: false }
            )
            .setFooter({ text: 'Bot akan tetap standby meskipun tidak ada orang di channel.' })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error('[Command /join] Error:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Terjadi Kesalahan')
            .setDescription(`Gagal bergabung ke voice channel: ${err.message}`),
        ],
      });
    }
  },
};
