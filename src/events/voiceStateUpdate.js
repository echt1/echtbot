const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const j2c = db.get('j2c');
    const gid = newState.guild?.id || oldState.guild?.id;
    const cfg = j2c[gid];
    if (!cfg?.triggerChannelId) return;

    // ── User betritt Trigger-Channel ──────────────────────────────────
    if (newState.channelId === cfg.triggerChannelId && oldState.channelId !== cfg.triggerChannelId) {
      const member = newState.member;
      const name = cfg.nameTemplate
        ? cfg.nameTemplate.replace('{user}', member.displayName).replace('{game}', member.presence?.activities?.[0]?.name || member.displayName)
        : `${member.displayName}s Channel`;

      try {
        const newCh = await newState.guild.channels.create({
          name: name.slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: cfg.categoryId || newState.channel?.parent || null,
          userLimit: cfg.userLimit || 0,
          permissionOverwrites: [
            { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
          ],
        });

        await member.voice.setChannel(newCh).catch(() => {});

        cfg.activeChannels = cfg.activeChannels || {};
        cfg.activeChannels[newCh.id] = { ownerId: member.id, guildId: gid };
        db.set('j2c', j2c);

        // Panel senden wenn aktiviert
        if (cfg.panelEnabled && cfg.panelChannelId) {
          const panelCh = await newState.guild.channels.fetch(cfg.panelChannelId).catch(() => null);
          if (panelCh) {
            const embed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('🎙️ Voice Channel Management')
              .setDescription(`${member} – Verwalte deinen Channel **${newCh.name}**`);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`j2c_lock_${newCh.id}`).setLabel('🔒 Sperren').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`j2c_limit_${newCh.id}`).setLabel('👥 Limit').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`j2c_rename_${newCh.id}`).setLabel('✏️ Umbenennen').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`j2c_delete_${newCh.id}`).setLabel('💣 Löschen').setStyle(ButtonStyle.Danger),
            );

            const panelMsg = await panelCh.send({ embeds: [embed], components: [row] });
            cfg.activeChannels[newCh.id].panelMessageId = panelMsg.id;
            cfg.activeChannels[newCh.id].panelChannelId = panelCh.id;
            db.set('j2c', j2c);
          }
        }
      } catch (err) {
        console.error('[J2C] Fehler beim Erstellen:', err.message);
      }
      return;
    }

    // ── User verlässt einen J2C Channel ──────────────────────────────
    const leftChannel = oldState.channel;
    if (!leftChannel || !cfg.activeChannels?.[leftChannel.id]) return;
    if (leftChannel.members.size === 0) {
      // Panel-Nachricht löschen
      const chData = cfg.activeChannels[leftChannel.id];
      if (chData.panelMessageId && chData.panelChannelId) {
        const panelCh = await oldState.guild.channels.fetch(chData.panelChannelId).catch(() => null);
        if (panelCh) {
          const panelMsg = await panelCh.messages.fetch(chData.panelMessageId).catch(() => null);
          if (panelMsg) await panelMsg.delete().catch(() => {});
        }
      }
      await leftChannel.delete().catch(() => {});
      delete cfg.activeChannels[leftChannel.id];
      db.set('j2c', j2c);
    }
  },
};
