const { logMod } = require('../utils/modlog');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Entsperrt diesen Channel wieder für @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const everyone = interaction.guild.roles.everyone;
    const overwrite = interaction.channel.permissionOverwrites.cache.get(everyone.id);

    if (!overwrite?.deny.has('SendMessages')) {
      return interaction.reply({ content: '❌ Dieser Channel ist nicht gesperrt.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(everyone, { SendMessages: null });

    const embed = new EmbedBuilder()
      .setColor(0x3BA55C)
      .setTitle('🔓 Channel entsperrt')
      .setDescription('Dieser Channel ist wieder offen.');

    const unlockMsg = await interaction.reply({ embeds: [embed], fetchReply: true });
    await logMod(interaction.client, interaction.guild.id, { action:'unlock', moderator:interaction.user, extra:{ Channel: interaction.channel.name } });

    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const lockMsg = messages.find(m =>
      m.author.id === interaction.client.user.id &&
      m.embeds[0]?.title === '🔒 Channel gesperrt' &&
      m.id !== unlockMsg.id
    );
    if (lockMsg) await lockMsg.delete().catch(() => {});
    setTimeout(() => unlockMsg.delete().catch(() => {}), 5000);
  },
};
