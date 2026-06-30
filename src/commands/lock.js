const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Sperrt diesen Channel für @everyone')
    .addStringOption(opt => opt.setName('grund').setDescription('Grund (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const grund = interaction.options.getString('grund') || null;
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔒 Channel gesperrt')
      .setDescription(grund ? `Grund: ${grund}` : 'Dieser Channel wurde temporär gesperrt.');
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    setTimeout(() => msg.delete().catch(() => {}), 8000);
  },
};
