const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Sperrt oder entsperrt einen Channel für @everyone')
    .addSubcommand(sub => sub.setName('on').setDescription('Channel sperren')
      .addStringOption(opt => opt.setName('grund').setDescription('Grund (optional)').setRequired(false)))
    .addSubcommand(sub => sub.setName('off').setDescription('Channel entsperren'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const everyone = interaction.guild.roles.everyone;

    if (sub === 'on') {
      const grund = interaction.options.getString('grund') || null;
      await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
      const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🔒 Channel gesperrt')
        .setDescription(grund ? `Grund: ${grund}` : 'Dieser Channel wurde temporär gesperrt.');
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
      const embed = new EmbedBuilder().setColor(0x3BA55C).setTitle('🔓 Channel entsperrt')
        .setDescription('Dieser Channel ist wieder offen.');
      await interaction.reply({ embeds: [embed] });
    }
  },
};
