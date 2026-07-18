const { SlashCommandBuilder } = require('discord.js');
const birthday = require('../utils/birthday');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Geburtstag setzen oder entfernen')
    .addSubcommand(sub => sub.setName('set').setDescription('Geburtstag setzen')
      .addIntegerOption(o => o.setName('monat').setDescription('1-12').setRequired(true).setMinValue(1).setMaxValue(12))
      .addIntegerOption(o => o.setName('tag').setDescription('1-31').setRequired(true).setMinValue(1).setMaxValue(31)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Geburtstag entfernen')),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'set') {
      const month = interaction.options.getInteger('monat');
      const day = interaction.options.getInteger('tag');
      birthday.setBirthday(interaction.guild.id, interaction.user.id, month, day);
      await interaction.reply({ content: `🎂 Geburtstag gespeichert: ${day}.${month}.`, ephemeral: true });
    } else {
      birthday.removeBirthday(interaction.guild.id, interaction.user.id);
      await interaction.reply({ content: '🗑️ Geburtstag entfernt.', ephemeral: true });
    }
  },
};
