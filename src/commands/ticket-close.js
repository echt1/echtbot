const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-close')
    .setDescription('Schließt das aktuelle Ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const guildConfig = db.get('tickets');
    const guildData = guildConfig[interaction.guild.id];
    const ticketInfo = guildData?.tickets?.[interaction.channel.id];

    if (!ticketInfo) {
      return interaction.reply({ content: '❌ Dies ist kein Ticket-Channel.', ephemeral: true });
    }

    await interaction.reply({ content: '🔒 Dieses Ticket wird in 5 Sekunden geschlossen...' });

    delete guildData.tickets[interaction.channel.id];
    db.set('tickets', guildConfig);

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  },
};
