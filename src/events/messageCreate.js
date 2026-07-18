const { handleTextTrigger } = require('../utils/customCommands');
const { logMod } = require('../utils/modlog');
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
  logMod(message.client, message.guild.id, { action:'automod', target:message.author, reason });

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

async function applyTrapAction(message, config) {
  const action = config.trapAction || 'ban';
  const actionText = { mute: 'stummgeschaltet', kick: 'gekickt', ban: 'gebannt' }[action] || 'moderiert';
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C).setTitle('🪤 Spam-Falle ausgelöst')
    .setDescription(`${message.author.tag} (\`${message.author.id}\`) hat in einem Falle-Kanal geschrieben und wurde **${actionText}**.`)
    .setTimestamp();
  const logChId = config.modlogChannelId;
  if (logChId) {
    const logCh = await message.guild.channels.fetch(logChId).catch(() => null);
    if (logCh) logCh.send({ embeds: [embed] }).catch(() => {});
  }
  logMod(message.client, message.guild.id, { action: 'trap-' + action, target: message.author, reason: 'Spam-Falle-Kanal' });
  try {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;
    if (action === 'mute' && member.moderatable) {
      await member.timeout(config.trapMuteDurationMs || 10 * 60_000, 'Automod: Spam-Falle-Kanal');
    } else if (action === 'kick' && member.kickable) {
      await member.kick('Automod: Spam-Falle-Kanal');
    } else if (action === 'ban' && member.bannable) {
      await member.ban({ reason: 'Automod: Spam-Falle-Kanal' });
    }
  } catch (err) {
    console.error('[Automod-Trap] Konnte Aktion nicht ausführen:', err.message);
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // ── AFK: eigene Rückkehr erkennen ───────────────────────────────────
    const afkAutomodCfg = db.get('automod')[message.guild.id];
    const afkStore = db.get('afk') || {};
    const guildAfk = afkAutomodCfg?.afkEnabled === false ? {} : (afkStore[message.guild.id] || {});
    if (guildAfk[message.author.id]) {
      delete guildAfk[message.author.id];
      db.set('afk', afkStore);
      message.reply('👋 Willkommen zurück, dein AFK-Status wurde entfernt.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      if (message.member?.manageable && message.member.nickname?.startsWith('[AFK] ')) {
        message.member.setNickname(message.member.nickname.replace('[AFK] ', '')).catch(() => {});
      }
    }
    // ── AFK: erwähnte User informieren ──────────────────────────────────
    if (message.mentions.users.size) {
      const afkMentions = [...message.mentions.users.values()].filter(u => guildAfk[u.id]);
      if (afkMentions.length) {
        const list = afkMentions.map(u => `${u} ist AFK: ${guildAfk[u.id].reason}`).join('\n');
        message.reply(list).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      }
    }

    // ── Sticky Messages ──────────────────────────────────────────────────
    const stickyStore = db.get('sticky') || {};
    const stickyCfg = stickyStore[message.guild.id]?.[message.channel.id];
    if (stickyCfg && message.id !== stickyCfg.lastMessageId) {
      const now = Date.now();
      if (!stickyCfg.lastPostedAt || now - stickyCfg.lastPostedAt > 8000) {
        if (stickyCfg.lastMessageId) {
          const old = await message.channel.messages.fetch(stickyCfg.lastMessageId).catch(() => null);
          if (old) await old.delete().catch(() => {});
        }
        const sent = await message.channel.send(stickyCfg.content).catch(() => null);
        if (sent) {
          stickyCfg.lastMessageId = sent.id;
          stickyCfg.lastPostedAt = now;
          db.set('sticky', stickyStore);
        }
      }
    }

    if (message.member?.permissions.has('ManageGuild')) return;

    const automod = db.get('automod');
    const config = automod[message.guild.id];
    if (!config || !config.enabled) return;

    const excludedRoles = config.excludedRoles || [];
    if (excludedRoles.length && message.member?.roles.cache.some(r => excludedRoles.includes(r.id))) return;

    // Spam-Falle: JEDE Nachricht in diesen Kanälen führt sofort zur Aktion
    if (config.trapChannels?.length && config.trapChannels.includes(message.channel.id)) {
      await message.delete().catch(() => {});
      return applyTrapAction(message, config);
    }
    if (!config.enabled) return;

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

    // Custom Text Triggers
    await handleTextTrigger(message);
  },
};
