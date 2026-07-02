const { EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;

// In-Memory Spam-Tracking: { "guildId-userId": [timestamps] }
const messageLog = new Map();

async function applyAction(message, config, reason) {
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('🛡️ Automod')
    .setDescription(`${message.author} wurde wegen **${reason}** moderiert.`)
    .setTimestamp();

  message.channel.send({ embeds: [embed] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 8000)).catch(() => {});

  try {
    if (config.action === 'warn') {
      const warnings = db.get('warnings');
      warnings[message.guild.id] = warnings[message.guild.id] || {};
      warnings[message.guild.id][message.author.id] = warnings[message.guild.id][message.author.id] || [];
      warnings[message.guild.id][message.author.id].push({ reason: `[Automod] ${reason}`, moderator: 'Automod', timestamp: Date.now() });
      db.set('warnings', warnings);
    } else if (config.action === 'mute') {
      const member = await message.guild.members.fetch(message.author.id);
      if (member.moderatable) await member.timeout(config.muteDurationMs, `Automod: ${reason}`);
    } else if (config.action === 'kick') {
      const member = await message.guild.members.fetch(message.author.id);
      if (member.kickable) await member.kick(`Automod: ${reason}`);
    }
  } catch (err) {
    console.error('[Automod] Konnte Aktion nicht ausführen:', err.message);
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;
    // Moderatoren und ausgeschlossene Rollen von Automod ausnehmen
    if (message.member?.permissions.has('ManageGuild')) return;
    const excludedRoles = config.excludedRoles || [];
    if (excludedRoles.length && message.member?.roles.cache.some(r => excludedRoles.includes(r.id))) return;

    const automod = db.get('automod');
    const config = automod[message.guild.id];
    if (!config || !config.enabled) return;

    // Bad Words
    if (config.bannedWords?.length) {
      const lower = message.content.toLowerCase();
      const hit = config.bannedWords.find(w => lower.includes(w));
      if (hit) {
        await message.delete().catch(() => {});
        return applyAction(message, config, `verbotenes Wort ("${hit}")`);
      }
    }

    // Invite Links
    if (config.blockInvites && INVITE_REGEX.test(message.content)) {
      await message.delete().catch(() => {});
      return applyAction(message, config, 'Discord-Invite-Link');
    }

    // Spam
    if (config.blockSpam) {
      const key = `${message.guild.id}-${message.author.id}`;
      const now = Date.now();
      const timestamps = (messageLog.get(key) || []).filter(t => now - t < config.spamIntervalMs);
      timestamps.push(now);
      messageLog.set(key, timestamps);

      if (timestamps.length > config.spamThreshold) {
        messageLog.set(key, []); // Reset nach Eingreifen
        return applyAction(message, config, 'Spam (zu viele Nachrichten in kurzer Zeit)');
      }
    }
  },
};
