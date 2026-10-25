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
        .setDescription('Visualisasi ASCII heatmap jam nongkrong server')
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
        .setDescription('Rekor tongkrongan: sesi terlama, streak hari kumpul, dan top active members')
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
            ? `${DAY_NAMES[peakDay]} pukul ${String(peakHour).padStart(2, '0')}:00 WIB (${formatDuration(
                peakDuration
              )})`
            : 'Belum ada aktivitas tercatat';

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📅 Heatmap Jam Nongkrong Voice (${days} Hari Terakhir)`)
          .setDescription(
            `Visualisasi kepadatan jam nongkrong member server berdasarkan waktu **WIB (UTC+7)**:\n\n` +
              `\`\`\`text\n${asciiHeatmap}\n\`\`\`\n` +
              `**Keterangan Level Kepadatan:**\n` +
              `\`░\` Sepi / Kosong  •  \`▒\` Sedang  •  \`▓\` Ramai  •  \`█\` Sangat Ramai`
          )
          .addFields(
            {
              name: '⏱️ Total Durasi Terpantau',
              value: `\`${formatDuration(heatmapData.grandTotal)}\``,
              inline: true,
            },
            {
              name: '🔥 Jam Paling Ramai (Peak)',
              value: `\`${peakText}\``,
              inline: true,
            }
          )
          .setFooter({ text: 'Voice Analytics & Hangout Intelligence • Discord Voice 24/7' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'records') {
        const records = analyticsManager.getRecords();

        // 1. Rekor kumpul (hangout)
        let hangoutText = 'Belum ada sesi kumpul (>= 2 orang) yang tercatat.';
        if (records.longestHangout && records.longestHangout.duration_seconds > 0) {
          const h = records.longestHangout;
          hangoutText =
            `⏱️ **${formatDuration(h.duration_seconds)}**\n` +
            `👥 Partisipan Puncak: **${h.user_count} orang**\n` +
            `🗓️ Waktu: <t:${h.started_at}:f> (<t:${h.started_at}:R>)`;
        }

        // 2. Rekor individu
        let individualText = 'Belum ada sesi individu yang tercatat.';
        if (records.longestIndividual && records.longestIndividual.duration_seconds > 0) {
          const ind = records.longestIndividual;
          individualText =
            `👤 <@${ind.user_id}> (\`${ind.username}\`)\n` +
            `⏱️ Durasi: **${formatDuration(ind.duration_seconds)}**\n` +
            `🗓️ Sesi: <t:${ind.joined_at}:f> (<t:${ind.joined_at}:R>)`;
        }

        // 3. Top active members
        let topMembersText = 'Belum ada aktivitas member dalam 30 hari terakhir.';
        if (records.topActiveMembers && records.topActiveMembers.length > 0) {
          const medals = ['🥇', '🥈', '🥉'];
          topMembersText = records.topActiveMembers
            .map((m, index) => {
              const medal = medals[index] || `**#${index + 1}**`;
              return `${medal} <@${m.user_id}> (\`${m.username}\`)\n   ⏱️ **${formatDuration(
                m.total_duration
              )}** • ${m.session_count} sesi`;
            })
            .join('\n');
        }

        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('🏆 Rekor Tongkrongan & Hangout Intelligence')
          .setDescription('Pencapaian rekor nongkrong bareng dan member paling setia di voice channel:')
          .addFields(
            {
              name: '🔥 Current Hangout Streak',
              value: `\`${records.currentStreak} Hari Berturut-turut\` ${
                records.currentStreak > 0 ? '🎉' : '💤'
              }\n*(Kumpul >= 2 orang manusia di VC)*`,
              inline: false,
            },
            {
              name: '👥 Rekor Kumpul Terlama (>= 2 Orang)',
              value: hangoutText,
              inline: false,
            },
            {
              name: '👤 Rekor Individu Terlama',
              value: individualText,
              inline: false,
            },
            {
              name: '🥇 Top 3 Member Teraktif (30 Hari Terakhir)',
              value: topMembersText,
              inline: false,
            }
          )
          .setFooter({ text: 'Voice Analytics & Hangout Intelligence • Discord Voice 24/7' })
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
