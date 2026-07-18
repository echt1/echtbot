// ═══════════════════════════════════════════════════════════════════════
// STARBOARD - Nachrichten mit genug ⭐-Reaktionen landen in einem Kanal
// ═══════════════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');

let db = null;
function initDb(dbInstance) { db = dbInstance; }

function getConfig(gid) { return (db.get('starboard') || {})[gid] || { enabled: false, threshold: 3, emoji: '⭐', channelId: null, posted: {} }; }
function saveConfig(gid, cfg) {
  const store = db.get('starboard') || {};
  store[gid] = cfg;
  db.set('starboard', store);
}

async function buildStarEmbed(message, count) {
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || '*[Kein Text - siehe Anhang]*')
    .addFields({ name: 'Original', value: `[Zur Nachricht springen](${message.url})` })
    .setTimestamp(message.createdAt);
  const img = message.attachments.find(a => a.contentType?.startsWith('image/'));
  if (img) embed.setImage(img.url);
  return embed;
}

async function handleReaction(reaction, user) {
  if (user.bot || !reaction.message.guild) return;
  const gid = reaction.message.guild.id;
  const cfg = getConfig(gid);
  if (!cfg.enabled || !cfg.channelId) return;
  if (reaction.emoji.name !== cfg.emoji && reaction.emoji.toString() !== cfg.emoji) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message) return;

  const count = reaction.count || 0;
  const channel = await reaction.message.guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return;

  cfg.posted = cfg.posted || {};
  const existingId = cfg.posted[message.id];

  if (count < cfg.threshold) {
    // Unter Schwelle - falls schon gepostet, Zaehler trotzdem aktualisieren, aber nicht entfernen
    if (existingId) {
      const starMsg = await channel.messages.fetch(existingId).catch(() => null);
      if (starMsg) starMsg.edit({ content: `${cfg.emoji} **${count}** | ${message.channel}` }).catch(() => {});
    }
    return;
  }

  const embed = await buildStarEmbed(message, count);
  if (existingId) {
    const starMsg = await channel.messages.fetch(existingId).catch(() => null);
    if (starMsg) { await starMsg.edit({ content: `${cfg.emoji} **${count}** | ${message.channel}`, embeds: [embed] }).catch(() => {}); return; }
  }
  const sent = await channel.send({ content: `${cfg.emoji} **${count}** | ${message.channel}`, embeds: [embed] }).catch(() => null);
  if (sent) { cfg.posted[message.id] = sent.id; saveConfig(gid, cfg); }
}

module.exports = { initDb, getConfig, saveConfig, handleReaction };
