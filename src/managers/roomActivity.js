// Store constant-occupancy intervals, not individual identities or audio.
class RoomActivity {
  constructor(db) {
    this.db = db;
    this.active = new Map();
    db.exec(`CREATE TABLE IF NOT EXISTS room_activity (
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
      humans INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_activity_window ON room_activity(guild_id, ended_at);`);
    this.insert = db.prepare('INSERT INTO room_activity VALUES (?, ?, ?, ?, ?)');
  }

  update(channel, now = Math.floor(Date.now() / 1000)) {
    if (!channel) return;
    const key = channel.guild.id + ':' + channel.id;
    const previous = this.active.get(key);
    if (previous && now > previous.start) {
      this.insert.run(previous.guildId, previous.channelId, previous.start, now, previous.count);
    }
    let count = 0;
    for (const member of channel.members.values()) {
      if (!member.user.bot) count++;
    }
    if (count) this.active.set(key, { guildId: channel.guild.id, channelId: channel.id, start: now, count });
    else this.active.delete(key);
  }

  getRanking(guildId, now = Math.floor(Date.now() / 1000)) {
    const cutoff = now - 7 * 86400;
    const totals = new Map();
    const add = (channelId, start, end, count) => {
      const seconds = Math.max(0, Math.min(end, now) - Math.max(start, cutoff));
      if (!seconds) return;
      const value = totals.get(channelId) || { channelId, personSeconds: 0, occupiedSeconds: 0 };
      value.personSeconds += seconds * count;
      value.occupiedSeconds += seconds;
      totals.set(channelId, value);
    };
    for (const row of this.db.prepare('SELECT * FROM room_activity WHERE guild_id = ? AND ended_at > ? AND started_at < ?').all(guildId, cutoff, now)) {
      add(row.channel_id, row.started_at, row.ended_at, row.humans);
    }
    for (const row of this.active.values()) {
      if (row.guildId === guildId) add(row.channelId, row.start, now, row.count);
    }
    return [...totals.values()].sort((a, b) => b.personSeconds - a.personSeconds || a.channelId.localeCompare(b.channelId))
      .map(row => ({ ...row, typicalPeople: Math.round(row.personSeconds / row.occupiedSeconds) }));
  }

  close(now = Math.floor(Date.now() / 1000)) {
    for (const row of this.active.values()) {
      if (now > row.start) this.insert.run(row.guildId, row.channelId, row.start, now, row.count);
    }
    this.active.clear();
  }
}

module.exports = { RoomActivity };
