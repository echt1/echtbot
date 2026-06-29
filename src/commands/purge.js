const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Löscht eine Anzahl von Nachrichten aus diesem Channel')
    .addIntegerOption(opt =>
      opt.setName('anzahl').setDescription('Anzahl zu löschender Nachrichten (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .addUserOption(opt =>
      opt.setName('user').setDescription('Nur Nachrichten dieses Users löschen (optional)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('anzahl');
    const targetUser = interaction.options.getUser('user');
    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = [...messages.values()].filter(m => {
      const age = Date.now() - m.createdTimestamp;
      return age < 14 * 24 * 60 * 60 * 1000; // Discord erlaubt nur <14 Tage alte Nachrichten
    });
    if (targetUser) toDelete = toDelete.filter(m => m.author.id === targetUser.id);
    toDelete = toDelete.slice(0, amount);

    if (!toDelete.length) return interaction.editReply({ content: '❌ Keine löschbaren Nachrichten gefunden (max. 14 Tage alt).' });

    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    const count = deleted?.size ?? toDelete.length;
    await interaction.editReply({ content: `🗑️ ${count} Nachricht${count !== 1 ? 'en' : ''} gelöscht.` });
  },
};
