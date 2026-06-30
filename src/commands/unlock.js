const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Entsperrt diesen Channel wieder für @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    const embed = new EmbedBuilder()
      .setColor(0x3BA55C)
      .setTitle('🔓 Channel entsperrt')
      .setDescription('Dieser Channel ist wieder offen.');
    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    setTimeout(() => msg.delete().catch(() => {}), 8000);
  },
};
