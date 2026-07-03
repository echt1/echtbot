const { EmbedBuilder } = require('discord.js');
const db = require('./database');

const COLORS = {
  ban: 0xED4245, kick: 0xE67E22, mute: 0xF1C40F, warn: 0xF39C12,
  unban: 0x3BA55C, lock: 0xED4245, unlock: 0x3BA55C,
  purge: 0x5865F2, automod: 0x9B59B6,
};
const ICONS = {
  ban: '🔨', kick: '👢', mute: '🔇', warn: '⚠️',
  unban: '🔓', lock: '🔒', unlock: '🔓', purge: '🗑️', automod: '🛡️',
};

async function logMod(client, guildId, { action, target, moderator, reason, extra = {} }) {
  const cfg = db.get('automod');
  const channelId = cfg[guildId]?.modlogChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS[action] || 0x5865F2)
    .setTitle(`${ICONS[action] || '📋'} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
    .setTimestamp();

  if (target) embed.addFields({ name: 'User', value: `${target.tag || target.username} (${target.id})` });
  if (moderator) embed.addFields({ name: 'Moderator', value: `${moderator.tag || moderator.username}` });
  if (reason) embed.addFields({ name: 'Grund', value: reason });
  for (const [k, v] of Object.entries(extra)) embed.addFields({ name: k, value: String(v), inline: true });

  await channel.send({ embeds: [embed] }).catch(err => console.error('[ModLog] Fehler:', err.message));
}

module.exports = { logMod };
