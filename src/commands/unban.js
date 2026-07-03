const { logMod } = require('../utils/modlog');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Entbannt einen User anhand seiner User-ID')
    .addStringOption(opt =>
      opt.setName('user_id').setDescription('Discord User-ID des gebannten Users').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('grund').setDescription('Begründung').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id').trim();
    const grund  = interaction.options.getString('grund') || 'Kein Grund angegeben';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({ content: '❌ Ungültige User-ID. Bitte eine gültige Discord-ID eingeben.', ephemeral: true });
    }

    try {
      const banned = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!banned) return interaction.reply({ content: '❌ Dieser User ist nicht gebannt.', ephemeral: true });

      await interaction.guild.members.unban(userId, `${grund} | Entbannt von ${interaction.user.tag}`);

      const embed = new EmbedBuilder().setColor(0x3BA55C).setTitle('🔓 User entbannt')
        .addFields(
          { name: 'User', value: `${banned.user.tag} (${userId})` },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Grund', value: grund }
        ).setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      await logMod(interaction.client, interaction.guild.id, { action:'unban', target:banned.user, moderator:interaction.user, reason:grund });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Fehler beim Entbannen.', ephemeral: true });
    }
  },
};
