const { ActivityType } = require('discord.js');

const DEFAULT_PRESENCE = Object.freeze({
  text: 'NOIRÉL',
  type: 'watching',
});

const ACTIVITY_TYPES = Object.freeze({
  watching: ActivityType.Watching,
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
});

function normalizePresence(presence) {
  const text = typeof presence?.text === 'string' ? presence.text.trim().slice(0, 128) : '';
  const type = typeof presence?.type === 'string' ? presence.type.toLowerCase() : '';

  return {
    text: text || DEFAULT_PRESENCE.text,
    type: ACTIVITY_TYPES[type] === undefined ? DEFAULT_PRESENCE.type : type,
  };
}

function applyPresence(user, presence) {
  const normalized = normalizePresence(presence);
  user.setPresence({
    activities: [{ name: normalized.text, type: ACTIVITY_TYPES[normalized.type] }],
    status: 'online',
  });
  return normalized;
}

module.exports = { ACTIVITY_TYPES, DEFAULT_PRESENCE, applyPresence, normalizePresence };
