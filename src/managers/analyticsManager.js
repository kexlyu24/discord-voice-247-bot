const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/**
 * Density blocks untuk visualisasi heatmap monospaced:
 * Level 0: · (kosong / 0 detik)
 * Level 1: ▪ (rendah / 1% - 33% dari max)
 * Level 2: ■ (ramai / 34% - 66% dari max)
 * Level 3: █ (puncak / 67% - 100% dari max)
 */
const HEATMAP_BLOCKS = ['·', '▪', '■', '█'];

/**
 * Format detik ke format waktu ringkas (contoh: "2j 15m 30s" atau "45m 12s")
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor((totalSeconds / 3600) % 24);
  const days = Math.floor(totalSeconds / 86400);

  const parts = [];
  if (days > 0) parts.push(`${days}h`);
  if (hours > 0) parts.push(`${hours}j`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

class AnalyticsManager {
  /**
   * @param {import('discord.js').Client} client
   * @param {object} [options]
   * @param {string} [options.dbPath] - Path file sqlite (default: data/analytics.db atau :memory:)
   */
  constructor(client, options = {}) {
    this.client = client;
    this.activeMembers = new Map(); // user_id -> { joinedAt, username }
    this.activeHangout = null; // { startedAt, maxUsers }

    const defaultDbPath = path.join(__dirname, '..', '..', 'data', 'analytics.db');
    this.dbPath = options.dbPath || defaultDbPath;

    // Pastikan folder direktori database sudah ada jika bukan in-memory
    if (this.dbPath !== ':memory:') {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initDatabase();
  }

  /**
   * Inisialisasi skema tabel SQLite
   */
  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS member_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        left_at INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        hour_wib INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_member_sessions_user ON member_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_member_sessions_joined ON member_sessions(joined_at);
      CREATE INDEX IF NOT EXISTS idx_member_sessions_heatmap ON member_sessions(day_of_week, hour_wib);

      CREATE TABLE IF NOT EXISTS hangout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_count INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hangout_sessions_duration ON hangout_sessions(duration_seconds);
      CREATE INDEX IF NOT EXISTS idx_hangout_sessions_started ON hangout_sessions(started_at);

      CREATE TABLE IF NOT EXISTS daily_streaks (
        date_str TEXT PRIMARY KEY,
        max_users INTEGER NOT NULL,
        total_seconds INTEGER NOT NULL
      );
    `);
  }

  /**
   * Menghitung tanggal, jam, dan hari dalam WIB (UTC+7)
   * Hari: 0=Minggu, 1=Senin, ..., 6=Sabtu. Jam: 0-23.
   * @param {number} timestampSec - Unix epoch dalam detik
   */
  getWibTimeInfo(timestampSec) {
    const wibDate = new Date(timestampSec * 1000 + 7 * 3600 * 1000);
    return {
      hourWib: wibDate.getUTCHours(),
      dayOfWeek: wibDate.getUTCDay(),
      dateStr: wibDate.toISOString().slice(0, 10),
    };
  }

  /**
   * Mendeteksi member yang sudah ada di voice channel saat bot startup
   */
  initializeActiveMembers() {
    if (!this.client?.guilds?.cache) return;
    const nowSec = Math.floor(Date.now() / 1000);

    for (const guild of this.client.guilds.cache.values()) {
      if (!guild.channels?.cache) continue;
      for (const channel of guild.channels.cache.values()) {
        const isVoice = channel.isVoiceBased?.() || channel.type === 2;
        if (!isVoice || !channel.members) continue;

        for (const member of channel.members.values()) {
          if (member.user?.bot) continue;
          if (!this.activeMembers.has(member.id)) {
            const username = member.user?.username || member.displayName || 'Member';
            this.activeMembers.set(member.id, {
              joinedAt: nowSec,
              username,
            });
          }
        }
      }

      // Evaluasi hangout bot di guild tersebut
      this.evaluateHangoutSession(guild, nowSec);
    }
  }

  /**
   * Mendapatkan jumlah manusia (non-bot) di VC bot atau VC server
   * @param {import('discord.js').Guild} guild
   * @param {import('discord.js').VoiceChannel} [targetChannel]
   * @returns {number}
   */
  getHumanCount(guild, targetChannel = null) {
    if (!guild) return 0;

    const countMembers = (channel) => {
      if (!channel || !channel.members) return 0;
      const memberList = Array.isArray(channel.members)
        ? channel.members
        : channel.members.values
        ? Array.from(channel.members.values())
        : [];
      return memberList.filter((m) => !m.user?.bot).length;
    };

    // Prioritas 1: VC yang sedang ditempati bot
    const botMember = guild.members?.me;
    const botChannel = botMember?.voice?.channel;
    if (botChannel) {
      return countMembers(botChannel);
    }

    // Prioritas 2: targetChannel yang diberikan (misal dari state)
    if (targetChannel) {
      return countMembers(targetChannel);
    }

    // Prioritas 3: Channel voice dengan manusia terbanyak di server
    let maxCount = 0;
    if (guild.channels?.cache) {
      for (const ch of guild.channels.cache.values()) {
        const isVoice = ch.isVoiceBased?.() || ch.type === 2;
        if (isVoice) {
          const count = countMembers(ch);
          if (count > maxCount) maxCount = count;
        }
      }
    }

    return maxCount;
  }

  /**
   * Kelola activeHangout dan simpan ke hangout_sessions serta daily_streaks saat berakhir
   * @param {import('discord.js').Guild} guild
   * @param {number} nowSec
   * @param {import('discord.js').VoiceChannel} [channel]
   */
  evaluateHangoutSession(guild, nowSec, channel = null) {
    const humanCount = this.getHumanCount(guild, channel);

    if (humanCount >= 2) {
      if (!this.activeHangout) {
        // Mulai sesi kumpul baru
        this.activeHangout = {
          startedAt: nowSec,
          maxUsers: humanCount,
        };
      } else {
        // Perbarui jumlah pengguna maksimal jika bertambah
        this.activeHangout.maxUsers = Math.max(this.activeHangout.maxUsers, humanCount);
      }
    } else {
      // Jika jumlah manusia kurang dari 2 dan sedang ada sesi aktif, akhiri sesi
      if (this.activeHangout) {
        const startedAt = this.activeHangout.startedAt;
        const endedAt = nowSec;
        const durationSeconds = Math.max(0, endedAt - startedAt);
        const maxUsers = this.activeHangout.maxUsers;
        this.activeHangout = null;

        if (durationSeconds > 0) {
          // Simpan ke hangout_sessions
          const insertHangout = this.db.prepare(`
            INSERT INTO hangout_sessions (user_count, started_at, ended_at, duration_seconds)
            VALUES (?, ?, ?, ?)
          `);
          insertHangout.run(maxUsers, startedAt, endedAt, durationSeconds);

          // Update daily_streaks
          const { dateStr } = this.getWibTimeInfo(startedAt);
          const updateStreak = this.db.prepare(`
            INSERT INTO daily_streaks (date_str, max_users, total_seconds)
            VALUES (?, ?, ?)
            ON CONFLICT(date_str) DO UPDATE SET
              max_users = MAX(daily_streaks.max_users, excluded.max_users),
              total_seconds = daily_streaks.total_seconds + excluded.total_seconds
          `);
          updateStreak.run(dateStr, maxUsers, durationSeconds);
        }
      }
    }
  }

  /**
   * Handler untuk event VoiceStateUpdate Discord
   * @param {import('discord.js').VoiceState} oldState
   * @param {import('discord.js').VoiceState} newState
   */
  handleVoiceStateUpdate(oldState, newState) {
    const member = newState?.member || oldState?.member;
    // Abaikan jika bukan member atau akun bot
    if (!member || member.user?.bot) return;

    const userId = member.id || member.user?.id;
    const username = member.user?.username || member.displayName || 'Member';
    const oldChannelId = oldState?.channelId || null;
    const newChannelId = newState?.channelId || null;

    // Tidak ada perubahan channel voice (contoh: hanya mute/deafen)
    if (oldChannelId === newChannelId) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const guild = newState?.guild || oldState?.guild;
    const relevantChannel = newState?.channel || oldState?.channel;

    if (!oldChannelId && newChannelId) {
      // 1. Member JOIN ke Voice Channel
      this.activeMembers.set(userId, {
        joinedAt: nowSec,
        username,
      });
    } else if (oldChannelId && !newChannelId) {
      // 2. Member LEAVE / Disconnect dari Voice Channel
      const session = this.activeMembers.get(userId);
      const joinedAt = session ? session.joinedAt : nowSec;
      const leftAt = nowSec;
      const durationSeconds = Math.max(0, leftAt - joinedAt);

      if (durationSeconds > 0) {
        const { hourWib, dayOfWeek } = this.getWibTimeInfo(joinedAt);
        const insertMemberSession = this.db.prepare(`
          INSERT INTO member_sessions (
            user_id, username, joined_at, left_at, duration_seconds, hour_wib, day_of_week
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertMemberSession.run(
          userId,
          session?.username || username,
          joinedAt,
          leftAt,
          durationSeconds,
          hourWib,
          dayOfWeek
        );
      }

      this.activeMembers.delete(userId);
    } else if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      // 3. Member PINDAH (Move) VC
      // Pastikan member sudah tercatat di activeMembers jika sebelumnya terlewat
      if (!this.activeMembers.has(userId)) {
        this.activeMembers.set(userId, {
          joinedAt: nowSec,
          username,
        });
      }
    }

    // Evaluasi status sesi kumpul (>= 2 orang)
    this.evaluateHangoutSession(guild, nowSec, relevantChannel);
  }

  /**
   * Menghasilkan data heatmap 7x24 durasi voice (hari Minggu-Sabtu x jam 0-23 WIB)
   * @param {number} [days=30] - Rentang hari analisis
   */
  getHeatmapData(days = 30) {
    const durations = Array.from({ length: 7 }, () => Array(24).fill(0));
    const levels = Array.from({ length: 7 }, () => Array(24).fill(0));

    let query = `
      SELECT day_of_week, hour_wib, SUM(duration_seconds) AS total_duration
      FROM member_sessions
    `;
    const params = [];

    if (days && days > 0) {
      const cutoffSec = Math.floor(Date.now() / 1000) - days * 86400;
      query += ` WHERE joined_at >= ?`;
      params.push(cutoffSec);
    }

    query += ` GROUP BY day_of_week, hour_wib`;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    let maxDuration = 0;
    let grandTotal = 0;

    for (const row of rows) {
      const day = Number(row.day_of_week);
      const hour = Number(row.hour_wib);
      const dur = Number(row.total_duration) || 0;

      if (day >= 0 && day <= 6 && hour >= 0 && hour <= 23) {
        durations[day][hour] = dur;
        grandTotal += dur;
        if (dur > maxDuration) {
          maxDuration = dur;
        }
      }
    }

    // Normalisasi kepadatan ke 4 level:
    // Level 0: · (kosong / 0 detik)
    // Level 1: ▪ (rendah / 1% - 33% dari max)
    // Level 2: ■ (ramai / 34% - 66% dari max)
    // Level 3: █ (puncak / 67% - 100% dari max)
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const dur = durations[d][h];
        if (dur === 0 || maxDuration === 0) {
          levels[d][h] = 0;
        } else {
          const ratio = dur / maxDuration;
          if (ratio <= 0.33) {
            levels[d][h] = 1;
          } else if (ratio <= 0.66) {
            levels[d][h] = 2;
          } else {
            levels[d][h] = 3;
          }
        }
      }
    }

    return {
      days,
      durations,
      levels,
      maxDuration,
      grandTotal,
      blocks: HEATMAP_BLOCKS,
    };
  }

  /**
   * Format data heatmap ke tabel monospaced yang sleek dan mobile-friendly (< 35 karakter).
   * Menampilkan 24 jam penuh (1 karakter per jam) yang dikelompokkan ke dalam 6 kuadran 4 jam
   * dengan penanda jam genap (00, 04, 08, 12, 16, 20).
   *
   * @param {object} heatmapData - Hasil dari getHeatmapData()
   * @returns {string}
   */
  formatAsciiHeatmap(heatmapData) {
    const { durations, levels, maxDuration } = heatmapData;

    // Header penanda waktu genap (interval 4 jam, kelipatan 2)
    // Total lebar pas di layar mobile Discord: 34 karakter
    const lines = ['     00   04   08   12   16   20  '];

    // Urutan hari: Senin (1) s/d Minggu (0)
    const dayConfigs = [
      { dayIndex: 1, label: 'Sen' },
      { dayIndex: 2, label: 'Sel' },
      { dayIndex: 3, label: 'Rab' },
      { dayIndex: 4, label: 'Kam' },
      { dayIndex: 5, label: 'Jum' },
      { dayIndex: 6, label: 'Sab' },
      { dayIndex: 0, label: 'Min' },
    ];

    const getBlockChar = (dayIdx, hour) => {
      if (levels && levels[dayIdx] && levels[dayIdx][hour] !== undefined) {
        return HEATMAP_BLOCKS[levels[dayIdx][hour]] || HEATMAP_BLOCKS[0];
      }
      const dur = (durations && durations[dayIdx] && durations[dayIdx][hour]) || 0;
      if (!dur || !maxDuration || maxDuration <= 0) return HEATMAP_BLOCKS[0];
      const ratio = dur / maxDuration;
      if (ratio <= 0.33) return HEATMAP_BLOCKS[1];
      if (ratio <= 0.66) return HEATMAP_BLOCKS[2];
      return HEATMAP_BLOCKS[3];
    };

    for (const { dayIndex, label } of dayConfigs) {
      const chunks = [];
      for (let startHour = 0; startHour < 24; startHour += 4) {
        let chunk = '';
        for (let h = startHour; h < startHour + 4; h++) {
          chunk += getBlockChar(dayIndex, h);
        }
        chunks.push(chunk);
      }
      lines.push(`${label}  ${chunks.join(' ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Menghitung current streak (berapa hari berturut-turut ada sesi kumpul >= 2 orang)
   * @returns {number}
   */
  getCurrentStreak() {
    const rows = this.db
      .prepare(
        `SELECT date_str FROM daily_streaks WHERE max_users >= 2 AND total_seconds > 0 ORDER BY date_str DESC`
      )
      .all();

    if (rows.length === 0) return 0;
    const dateSet = new Set(rows.map((r) => r.date_str));

    const nowSec = Math.floor(Date.now() / 1000);
    const { dateStr: todayStr } = this.getWibTimeInfo(nowSec);
    const { dateStr: yesterdayStr } = this.getWibTimeInfo(nowSec - 86400);

    let startSec;
    if (dateSet.has(todayStr)) {
      startSec = nowSec;
    } else if (dateSet.has(yesterdayStr)) {
      startSec = nowSec - 86400;
    } else {
      return 0; // Kemarin dan hari ini tidak ada sesi kumpul
    }

    let streak = 0;
    let cursorSec = startSec;

    while (true) {
      const { dateStr } = this.getWibTimeInfo(cursorSec);
      if (dateSet.has(dateStr)) {
        streak++;
        cursorSec -= 86400; // Mundur 1 hari
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Mengambil statistik rekor tongkrongan server
   * @returns {object}
   */
  getRecords() {
    // 1. Rekor kumpul terlama (hangout_sessions dengan durasi terbesar)
    const longestHangout =
      this.db
        .prepare(
          `SELECT id, user_count, started_at, ended_at, duration_seconds
           FROM hangout_sessions
           ORDER BY duration_seconds DESC
           LIMIT 1`
        )
        .get() || null;

    // 2. Rekor individu terlama (member_sessions dengan durasi terbesar)
    const longestIndividual =
      this.db
        .prepare(
          `SELECT user_id, username, joined_at, left_at, duration_seconds
           FROM member_sessions
           ORDER BY duration_seconds DESC
           LIMIT 1`
        )
        .get() || null;

    // 3. Current streak sesi kumpul (hari berturut-turut)
    const currentStreak = this.getCurrentStreak();

    // 4. Top 3 member paling aktif (30 hari terakhir)
    const cutoff30d = Math.floor(Date.now() / 1000) - 30 * 86400;
    const topActiveMembers = this.db
      .prepare(
        `SELECT user_id, username, SUM(duration_seconds) AS total_duration, COUNT(id) AS session_count
         FROM member_sessions
         WHERE joined_at >= ?
         GROUP BY user_id
         ORDER BY total_duration DESC
         LIMIT 3`
      )
      .all(cutoff30d);

    return {
      longestHangout,
      longestIndividual,
      currentStreak,
      topActiveMembers,
    };
  }

  /**
   * Menutup koneksi database dan flush sesi yang masih aktif saat shutdown
   */
  close() {
    const nowSec = Math.floor(Date.now() / 1000);

    // Flush active member sessions
    for (const [userId, session] of this.activeMembers.entries()) {
      const durationSeconds = Math.max(0, nowSec - session.joinedAt);
      if (durationSeconds > 0) {
        const { hourWib, dayOfWeek } = this.getWibTimeInfo(session.joinedAt);
        const insertMember = this.db.prepare(`
          INSERT INTO member_sessions (
            user_id, username, joined_at, left_at, duration_seconds, hour_wib, day_of_week
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertMember.run(
          userId,
          session.username,
          session.joinedAt,
          nowSec,
          durationSeconds,
          hourWib,
          dayOfWeek
        );
      }
    }
    this.activeMembers.clear();

    // Flush active hangout
    if (this.activeHangout) {
      const durationSeconds = Math.max(0, nowSec - this.activeHangout.startedAt);
      if (durationSeconds > 0) {
        const insertHangout = this.db.prepare(`
          INSERT INTO hangout_sessions (user_count, started_at, ended_at, duration_seconds)
          VALUES (?, ?, ?, ?)
        `);
        insertHangout.run(
          this.activeHangout.maxUsers,
          this.activeHangout.startedAt,
          nowSec,
          durationSeconds
        );

        const { dateStr } = this.getWibTimeInfo(this.activeHangout.startedAt);
        const updateStreak = this.db.prepare(`
          INSERT INTO daily_streaks (date_str, max_users, total_seconds)
          VALUES (?, ?, ?)
          ON CONFLICT(date_str) DO UPDATE SET
            max_users = MAX(daily_streaks.max_users, excluded.max_users),
            total_seconds = daily_streaks.total_seconds + excluded.total_seconds
        `);
        updateStreak.run(dateStr, this.activeHangout.maxUsers, durationSeconds);
      }
      this.activeHangout = null;
    }

    try {
      this.db.close();
    } catch {
      // Abaikan jika sudah tertutup
    }
  }
}

module.exports = {
  AnalyticsManager,
  HEATMAP_BLOCKS,
  formatDuration,
};
