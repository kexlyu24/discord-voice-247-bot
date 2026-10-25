const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatDuration } = require('../managers/analyticsManager');

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

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
        const records = analyticsManager.getRecords();

        // 1. Rekor kumpul (hangout)
        let hangoutText = 'Belum ada sesi bersama yang tercatat.';
        if (records.longestHangout && records.longestHangout.duration_seconds > 0) {
          const h = records.longestHangout;
          hangoutText =
            `**${formatDuration(h.duration_seconds)}** • ${h.user_count} member\n` +
            `<t:${h.started_at}:f> (<t:${h.started_at}:R>)`;
        }

        // 2. Rekor individu
        let individualText = 'Belum ada sesi individu yang tercatat.';
        if (records.longestIndividual && records.longestIndividual.duration_seconds > 0) {
          const ind = records.longestIndividual;
          individualText =
            `<@${ind.user_id}> — **${formatDuration(ind.duration_seconds)}**\n` +
            `<t:${ind.joined_at}:f> (<t:${ind.joined_at}:R>)`;
        }

        // 3. Top active members
        let topMembersText = 'Belum ada aktivitas member dalam 30 hari terakhir.';
        if (records.topActiveMembers && records.topActiveMembers.length > 0) {
          topMembersText = records.topActiveMembers
            .map((m, index) => {
              const rank = String(index + 1).padStart(2, '0');
              return `\`${rank}\` <@${m.user_id}> — **${formatDuration(
                m.total_duration
              )}** • ${m.session_count} sesi`;
            })
            .join('\n');
        }

        const streakText =
          records.currentStreak > 0
            ? `**${records.currentStreak} hari** berturut-turut\n*Aktivitas bersama ≥ 2 member*`
            : '0 hari\n*Aktivitas bersama ≥ 2 member*';

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle('Rekor & Pencapaian Voice')
          .setDescription('Catatan rekor durasi sesi dan keaktifan member di voice channel.')
          .addFields(
            {
              name: 'Streak Kumpul Harian',
              value: streakText,
              inline: false,
            },
            {
              name: 'Sesi Berkelompok Terlama',
              value: hangoutText,
              inline: false,
            },
            {
              name: 'Sesi Individu Terlama',
              value: individualText,
              inline: false,
            },
            {
              name: 'Top 3 Member Teraktif (30 Hari)',
              value: topMembersText,
              inline: false,
            }
          )
          .setFooter({ text: 'NOIRÉL • Voice Insights' })
          .setTimestamp();

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
