const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { applyPresence } = require('../utils/presence');

const TYPE_LABELS = Object.freeze({
  watching: 'Watching',
  playing: 'Playing',
  listening: 'Listening to',
  competing: 'Competing in',
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('presence')
    .setDescription('Mengatur Rich Presence bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('tipe')
        .setDescription('Jenis aktivitas bot')
        .setRequired(true)
        .addChoices(
          { name: 'Watching', value: 'watching' },
          { name: 'Playing', value: 'playing' },
          { name: 'Listening', value: 'listening' },
          { name: 'Competing', value: 'competing' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('teks')
        .setDescription('Teks aktivitas (maksimal 128 karakter)')
        .setMaxLength(128)
        .setRequired(true)
    ),

  async execute(interaction, voiceManager) {
    await interaction.deferReply({ ephemeral: true });

    const requested = {
      type: interaction.options.getString('tipe', true),
      text: interaction.options.getString('teks', true),
    };

    try {
      const presence = applyPresence(interaction.client.user, requested);
      voiceManager.saveSettings({ presence });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('✅ Rich Presence Diperbarui')
            .setDescription(`Bot sekarang menampilkan **${TYPE_LABELS[presence.type]} ${presence.text}**.`)
            .setFooter({ text: 'Pengaturan tersimpan dan akan dipulihkan setelah bot restart.' })
            .setTimestamp(),
        ],
      });
    } catch (err) {
      console.error('[Command /presence] Error:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Gagal Mengubah Presence')
            .setDescription(`Discord menolak pembaruan presence: ${err.message}`),
        ],
      });
    }
  },
};
