const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Sperrt diesen Channel für @everyone')
    .addStringOption(opt => opt.setName('grund').setDescription('Grund (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const everyone = interaction.guild.roles.everyone;
    const overwrite = interaction.channel.permissionOverwrites.cache.get(everyone.id);

    // Prüfen ob bereits gesperrt
    if (overwrite?.deny.has('SendMessages')) {
      return interaction.reply({ content: '❌ Dieser Channel ist bereits gesperrt.', ephemeral: true });
    }

    const grund = interaction.options.getString('grund') || null;
    await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: false });

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔒 Channel gesperrt')
      .setDescription(grund ? `Grund: ${grund}` : 'Dieser Channel wurde gesperrt.');

    await interaction.reply({ embeds: [embed] });
    // Lock-Nachricht bleibt stehen (wird erst bei /unlock gelöscht)
  },
};
