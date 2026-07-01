const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-claim')
    .setDescription('Übernimmt dieses Ticket – nur du siehst es noch im Team')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const guildConfig = db.get('tickets');
    const guildData   = guildConfig[interaction.guild.id];
    const ticketInfo  = guildData?.tickets?.[interaction.channel.id];

    if (!ticketInfo) {
      return interaction.reply({ content: '❌ Dies ist kein Ticket-Channel.', ephemeral: true });
    }
    if (ticketInfo.claimedBy) {
      return interaction.reply({
        content: `❌ Dieses Ticket ist bereits von <@${ticketInfo.claimedBy}> übernommen.`,
        ephemeral: true,
      });
    }

    // Claim: Support-Rolle sehen lassen, alle anderen Team-Mitglieder ausschließen
    // (Supporter sehen das Ticket nicht mehr, nur der Claimer + User)
    const supportRoleId = guildData.supportRoleId;
    if (supportRoleId) {
      await interaction.channel.permissionOverwrites.edit(supportRoleId, { ViewChannel: false });
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
    }

    ticketInfo.claimedBy = interaction.user.id;
    db.set('tickets', guildConfig);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Ticket übernommen')
      .setDescription(`${interaction.user} hat dieses Ticket übernommen und wird sich darum kümmern.`);

    await interaction.reply({ embeds: [embed] });
  },
};
