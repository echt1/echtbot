const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Zeigt die Verwarnungen eines Users an')
    .addUserOption(opt => opt.setName('user').setDescription('User dessen Verwarnungen angezeigt werden sollen').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const warnings = db.get('warnings');
    const userWarnings = warnings[interaction.guild.id]?.[target.id] || [];

    if (userWarnings.length === 0) {
      return interaction.reply({ content: `${target.tag} hat keine Verwarnungen.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle(`Verwarnungen von ${target.tag}`)
      .setDescription(
        userWarnings
          .map((w, i) => `**#${i + 1}** - <t:${Math.floor(w.timestamp / 1000)}:R>\n> ${w.reason}\n> von <@${w.moderator}>`)
          .join('\n\n')
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
