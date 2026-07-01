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

    const unlockMsg = await interaction.reply({ embeds: [embed], fetchReply: true });

    // Lock-Nachricht suchen und löschen
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const lockMsg = messages.find(m =>
      m.author.id === interaction.client.user.id &&
      m.embeds[0]?.title === '🔒 Channel gesperrt' &&
      m.id !== unlockMsg.id
    );
    if (lockMsg) await lockMsg.delete().catch(() => {});

    // Unlock-Nachricht nach 5 Sekunden auch löschen
    setTimeout(() => unlockMsg.delete().catch(() => {}), 5000);
  },
};
