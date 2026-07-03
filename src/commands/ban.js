const { logMod } = require('../utils/modlog');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannt einen User vom Server')
    .addUserOption(opt => opt.setName('user').setDescription('Der zu bannende User').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Begründung').setRequired(false))
    .addIntegerOption(opt => opt.setName('nachrichten_loeschen_tage').setDescription('Nachrichten der letzten X Tage löschen (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';
    const deleteDays = interaction.options.getInteger('nachrichten_loeschen_tage') || 0;

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member && !member.bannable) {
      return interaction.reply({ content: '❌ Ich kann diesen User nicht bannen (höhere Rolle oder fehlende Rechte).', ephemeral: true });
    }

    try {
      // DM vor dem Ban senden
      await target.send({ content: `Du wurdest aus **${interaction.guild.name}** gebannt.
**Grund:** ${reason}` }).catch(() => {});

      await interaction.guild.members.ban(target.id, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `${reason} | Gebannt von ${interaction.user.tag}`,
      });

      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🔨 User gebannt')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})` },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Grund', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      await logMod(interaction.client, interaction.guild.id, { action:'ban', target, moderator:interaction.user, reason });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Beim Bannen ist ein Fehler aufgetreten.', ephemeral: true });
    }
  },
};
