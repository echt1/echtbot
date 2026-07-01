const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Bis hier purgen')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetMsg = interaction.targetMessage;
    const messages  = await interaction.channel.messages.fetch({ limit: 100 });

    const toDelete = [...messages.values()].filter(m => {
      const age = Date.now() - m.createdTimestamp;
      const notTooOld = age < 14 * 24 * 60 * 60 * 1000;
      const afterOrAt = m.createdTimestamp >= targetMsg.createdTimestamp;
      return notTooOld && afterOrAt;
    });

    if (!toDelete.length) {
      return interaction.editReply({ content: '❌ Keine löschbaren Nachrichten gefunden (max. 14 Tage alt).' });
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    const count = deleted?.size ?? toDelete.length;
    await interaction.editReply({ content: `🗑️ ${count} Nachricht${count !== 1 ? 'en' : ''} gelöscht.` });
  },
};
