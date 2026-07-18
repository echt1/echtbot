// ═══════════════════════════════════════════════════════════════════════
// WELCOMER - Begruessungsnachricht (Kanal + optional DM)
// ═══════════════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

function fillWelcome(str, member) {
  if (!str) return str;
  return String(str)
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{membercount\}/g, member.guild.memberCount);
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const cfg = (db.get('welcomer') || {})[member.guild.id];
    if (!cfg || cfg.enabled === false) return;

    if (cfg.channelId) {
      const channel = await member.guild.channels.fetch(cfg.channelId).catch(() => null);
      if (channel) {
        const payload = {};
        if (cfg.message) payload.content = fillWelcome(cfg.message, member);
        if (cfg.embedTitle || cfg.embedDescription) {
          const embed = new EmbedBuilder().setColor(parseInt((cfg.embedColor || '#3ba55c').replace('#', ''), 16) || 0x3ba55c);
          if (cfg.embedTitle) embed.setTitle(fillWelcome(cfg.embedTitle, member));
          if (cfg.embedDescription) embed.setDescription(fillWelcome(cfg.embedDescription, member));
          embed.setThumbnail(member.user.displayAvatarURL());
          payload.embeds = [embed];
        }
        if (payload.content || payload.embeds) channel.send(payload).catch(() => {});
      }
    }
    if (cfg.dmEnabled && cfg.dmMessage) {
      member.send(fillWelcome(cfg.dmMessage, member)).catch(() => {});
    }
  },
};
