const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../utils/leveling');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Zeigt deinen Level-Rang')
    .addUserOption(o => o.setName('user').setDescription('Anderer User (optional)').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const { rank, data, total } = leveling.getRank(interaction.guild.id, target.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Level', value: String(data.level || 0), inline: true },
        { name: 'XP', value: String(data.xp || 0), inline: true },
        { name: 'Rang', value: rank ? `#${rank} / ${total}` : 'Noch nicht aktiv', inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
