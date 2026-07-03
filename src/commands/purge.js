const { SlashCommandBuilder, PermissionFlagsBits, ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
const { logMod } = require('../utils/modlog');
const db = require('../utils/database');

async function doPurge(channel, limit, afterMessageId, requestedBy) {
  const messages = await channel.messages.fetch({ limit: 100 });
  let toDelete = [...messages.values()].filter(m => {
    const age = Date.now() - m.createdTimestamp;
    return age < 14 * 24 * 60 * 60 * 1000;
  });

  if (afterMessageId) {
    // Alle Nachrichten ab (und inkl.) der Zielnachricht
    const targetMsg = messages.get(afterMessageId);
    if (targetMsg) {
      toDelete = toDelete.filter(m => m.createdTimestamp >= targetMsg.createdTimestamp);
    }
  } else {
    toDelete = toDelete.slice(0, limit);
  }

  if (!toDelete.length) return 0;
  const deleted = await channel.bulkDelete(toDelete, true).catch(() => null);
  return deleted?.size ?? toDelete.length;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Löscht Nachrichten aus diesem Channel (Standard: 100)')
    .addIntegerOption(opt =>
      opt.setName('anzahl').setDescription('Anzahl (1–100, Standard: 100)').setRequired(false).setMinValue(1).setMaxValue(100)
    )
    .addUserOption(opt =>
      opt.setName('user').setDescription('Nur Nachrichten dieses Users löschen').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('anzahl') ?? 100;
    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = [...messages.values()].filter(m => {
      const age = Date.now() - m.createdTimestamp;
      return age < 14 * 24 * 60 * 60 * 1000;
    });
    if (targetUser) toDelete = toDelete.filter(m => m.author.id === targetUser.id);
    toDelete = toDelete.slice(0, amount);

    if (!toDelete.length) return interaction.editReply({ content: '❌ Keine löschbaren Nachrichten gefunden.' });

    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    const count = deleted?.size ?? toDelete.length;
    await interaction.editReply({ content: `🗑️ ${count} Nachricht${count !== 1 ? 'en' : ''} gelöscht.` });
    await logMod(interaction.client, interaction.guild.id, { action:'purge', moderator:interaction.user, extra:{ Channel: interaction.channel.name, Nachrichten: count } });
  },
};
