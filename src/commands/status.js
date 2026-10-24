const os = require('os');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function readCpuTimes() {
  return os.cpus().reduce(
    (totals, cpu) => {
      totals.idle += cpu.times.idle;
      totals.total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
      return totals;
    },
    { idle: 0, total: 0 }
  );
}

async function getVpsMetrics() {
  const start = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const end = readCpuTimes();
  const totalDelta = end.total - start.total;
  const idleDelta = end.idle - start.idle;
  const cpuUsage = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;

  const totalRam = os.totalmem();
  const usedRam = totalRam - os.freemem();
  const toGiB = (bytes) => (bytes / 1024 ** 3).toFixed(2);

  return {
    cpuUsage: cpuUsage.toFixed(1),
    usedRam: toGiB(usedRam),
    totalRam: toGiB(totalRam),
    ramUsage: ((usedRam / totalRam) * 100).toFixed(1),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Melihat status koneksi voice, uptime, ping, dan mode 24/7 bot'),

  async execute(interaction, voiceManager) {
    await interaction.deferReply();

    try {
      const status = voiceManager.getStatus();
      const vps = await getVpsMetrics();
      const botMember = interaction.guild.members.me;
      const actualChannel = botMember?.voice?.channel;

      const statusIcon =
        status.connectionStatus === 'ready'
          ? '🟢 Ready (Terhubung)'
          : status.connectionStatus === 'signalling' || status.connectionStatus === 'connecting'
          ? '🟡 Menghubungkan...'
          : '🔴 Disconnected';

      const embed = new EmbedBuilder()
        .setColor(status.connectionStatus === 'ready' ? 0x57f287 : 0xfee75c)
        .setTitle('📊 Status Bot Voice 24/7')
        .setDescription('Informasi status real-time koneksi voice channel dan sistem auto-reconnect bot.')
        .addFields(
          {
            name: '🔊 Voice Channel Target',
            value: status.channelId ? `<#${status.channelId}> (\`${status.channelId}\`)` : '`Belum diatur`',
            inline: true,
          },
          {
            name: '📍 Lokasi Aktual',
            value: actualChannel ? `<#${actualChannel.id}>` : '`Tidak di dalam voice`',
            inline: true,
          },
          {
            name: '🛡️ Mode 24/7',
            value: status.stay247 ? '🟢 Aktif (Auto-Reconnect)' : '🔴 Nonaktif',
            inline: true,
          },
          {
            name: '📡 Status RTC Voice',
            value: statusIcon,
            inline: true,
          },
          {
            name: '⏳ Lama di Voice',
            value:
              status.connectionStatus === 'ready' && status.connectedAt
                ? `\`${status.voiceDuration}\` (<t:${Math.floor(status.connectedAt / 1000)}:R>)`
                : `\`${status.voiceDuration}\``,
            inline: true,
          },
          {
            name: '📶 Ping Gateway',
            value: `\`${interaction.client.ws.ping >= 0 ? interaction.client.ws.ping : 0} ms\``,
            inline: true,
          },
          {
            name: '⏱️ Uptime Bot',
            value: `\`${status.uptime}\``,
            inline: true,
          },
          {
            name: '🖥️ CPU VPS',
            value: `\`${vps.cpuUsage}%\``,
            inline: true,
          },
          {
            name: '💾 RAM VPS',
            value: `\`${vps.usedRam} / ${vps.totalRam} GiB (${vps.ramUsage}%)\``,
            inline: true,
          },
          {
            name: '🔄 Proteksi Otomatis',
            value:
              '• **NAT UDP Keepalive**: Aktif (Opus Silence Stream)\n• **Watchdog Loop**: Aktif (Interval 30 detik)\n• **Reconnection Engine**: Siap siaga',
            inline: false,
          }
        )
        .setFooter({ text: 'Discord Voice 24/7 Bot' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[Command /status] Error:', err);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Terjadi Kesalahan')
            .setDescription(`Gagal mengambil status bot: ${err.message}`),
        ],
      });
    }
  },
};
