const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const nominations = require('../utils/nominations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nomc')
    .setDescription('Entscheidung einer bereits abgeschlossenen Nominierung nachträglich ändern')
    .addStringOption(opt => opt.setName('message_id').setDescription('Message-ID der Nominierungs-Nachricht').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    await nominations.overrideByMessageId(interaction, interaction.options.getString('message_id'));
  },
};
