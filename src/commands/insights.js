const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatDuration } = require('../managers/analyticsManager');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Tampilan records memakai satuan lengkap; detik hanya untuk durasi di bawah semenit.
function formatRecordDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0 detik';
  if (totalSeconds < 60) return `${Math.floor(totalSeconds)} detik`;

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds / 3600) % 24);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  return parts.join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('insights')
    .setDescription('Statistik dan analitik aktivitas voice channel server')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('heatmap')
        .setDescription('Visualisasi heatmap jam aktif voice server')
        .addIntegerOption((option) =>
          option
            .setName('days')
            .setDescription('Rentang hari analisis (default: 30 hari)')
            .setMinValue(1)
            .setMaxValue(90)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('records')
        .setDescription('Rekor durasi sesi kumpul, streak harian, dan top active members')
    ),

  async execute(interaction, voiceManager) {
    await interaction.deferReply();

    try {
      const analyticsManager =
        voiceManager?.analyticsManager || interaction.client?.analyticsManager;

      if (!analyticsManager) {
        return interaction.editReply({
          content: '❌ Sistem Voice Analytics belum aktif atau belum terinisialisasi!',
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'heatmap') {
        const days = interaction.options.getInteger('days') || 30;
        const heatmapData = analyticsManager.getHeatmapData(days);
        const asciiHeatmap = analyticsManager.formatAsciiHeatmap(heatmapData);

        // Cari jam puncak (peak time)
        let peakDay = -1;
        let peakHour = -1;
        let peakDuration = 0;

        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            if (heatmapData.durations[d][h] > peakDuration) {
              peakDuration = heatmapData.durations[d][h];
              peakDay = d;
              peakHour = h;
            }
          }
        }

        const peakText =
          peakDuration > 0
            ? `**${DAY_NAMES[peakDay]}**, ${String(peakHour).padStart(2, '0')}:00 WIB\n${formatDuration(
                peakDuration
              )} total`
            : 'Belum ada aktivitas';

        const totalDurationText =
          heatmapData.grandTotal > 0
            ? `**${formatDuration(heatmapData.grandTotal)}**\nRentang ${days} hari`
            : '0s';

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(`Aktivitas Voice • ${days} Hari Terakhir`)
          .setDescription(
            `Distribusi jam aktif voice channel server (WIB).\n\n` +
              `\`\`\`text\n${asciiHeatmap}\n\`\`\`\n` +
              `\`·\` Kosong   \`▪\` Rendah   \`■\` Ramai   \`█\` Puncak`
          )
          .addFields(
            {
              name: 'Waktu Puncak',
              value: peakText,
              inline: true,
            },
            {
              name: 'Total Durasi',
              value: totalDurationText,
              inline: true,
            }
          )
          .setFooter({ text: 'NOIRÉL • Voice Insights' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'records') {
        const records = analyticsManager.getRecords() || {};

        let hangoutText = 'Belum ada sesi bersama.';
        if (records.longestHangout && records.longestHangout.duration_seconds > 0) {
          const h = records.longestHangout;
          hangoutText =
            `**${formatRecordDuration(h.duration_seconds)}**\n` +
            `Puncak ${h.user_count} peserta` +
            (h.started_at != null ? ` · <t:${h.started_at}:d>` : '');
        }

        let individualText = 'Belum ada sesi individu.';
        if (records.longestIndividual && records.longestIndividual.duration_seconds > 0) {
          const ind = records.longestIndividual;
          individualText =
            `<@${ind.user_id}> — ${formatRecordDuration(ind.duration_seconds)}` +
            (ind.joined_at != null ? ` · <t:${ind.joined_at}:d>` : '');
        }

        let topMembersText = 'Belum ada aktivitas dalam 30 hari terakhir.';
        if (records.topActiveMembers && records.topActiveMembers.length > 0) {
          topMembersText = records.topActiveMembers
            .map((m, index) => {
              const rank = String(index + 1).padStart(2, '0');
              return `\`${rank}\` <@${m.user_id}> — ${formatRecordDuration(m.total_duration)} · ${m.session_count} sesi`;
            })
            .join('\n');
        }

        const streakText = `**${records.currentStreak || 0} hari** berturut-turut\nBersama ≥ 2 orang (non-bot)`;

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('Rekor Voice')
          .addFields(
            {
              name: 'Streak',
              value: streakText,
              inline: true,
            },
            {
              name: 'Sesi bersama',
              value: hangoutText,
              inline: true,
            },
            {
              name: 'Sesi individu terlama',
              value: individualText,
              inline: false,
            },
            {
              name: 'Top 3 · 30 hari terakhir',
              value: topMembersText,
              inline: false,
            }
          )
          .setFooter({ text: 'NOIRÉL • Voice Insights' });

        return interaction.editReply({ embeds: [embed] });
      }

      return interaction.editReply({
        content: `❌ Subcommand \`${subcommand}\` tidak dikenali.`,
      });
    } catch (error) {
      console.error('[Command /insights Error]:', error);
      return interaction.editReply({
        content: `❌ Terjadi kesalahan saat memproses perintah insights: ${error.message}`,
      });
    }
  },
};
