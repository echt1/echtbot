const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kickt einen User vom Server')
    .addUserOption(opt => opt.setName('user').setDescription('Der zu kickende User').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Begründung').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ User nicht auf diesem Server gefunden.', ephemeral: true });
    if (!member.kickable) {
      return interaction.reply({ content: '❌ Ich kann diesen User nicht kicken (höhere Rolle oder fehlende Rechte).', ephemeral: true });
    }

    try {
      await target.send({ content: `Du wurdest aus **${interaction.guild.name}** gekickt.\n**Grund:** ${reason}` }).catch(() => {});
      await member.kick(`${reason} | Gekickt von ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('👢 User gekickt')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})` },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Grund', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Beim Kicken ist ein Fehler aufgetreten.', ephemeral: true });
    }
  },
};
