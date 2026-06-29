const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joinrole')
    .setDescription('Verwaltet die Rolle die neue Member automatisch bekommen')
    .addSubcommand(sub =>
      sub.setName('set').setDescription('Join-Rolle setzen')
        .addRoleOption(opt => opt.setName('rolle').setDescription('Diese Rolle wird bei Join vergeben').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('remove').setDescription('Join-Rolle entfernen'))
    .addSubcommand(sub => sub.setName('status').setDescription('Aktuelle Join-Rolle anzeigen'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const cfg = db.get('automod');
    cfg[interaction.guild.id] = cfg[interaction.guild.id] || {};
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const rolle = interaction.options.getRole('rolle');
      cfg[interaction.guild.id].joinRoleId = rolle.id;
      db.set('automod', cfg);
      return interaction.reply({ content: `✅ Join-Rolle gesetzt: ${rolle}`, ephemeral: true });
    }
    if (sub === 'remove') {
      delete cfg[interaction.guild.id].joinRoleId;
      db.set('automod', cfg);
      return interaction.reply({ content: '✅ Join-Rolle entfernt.', ephemeral: true });
    }
    if (sub === 'status') {
      const roleId = cfg[interaction.guild.id].joinRoleId;
      return interaction.reply({ content: roleId ? `Join-Rolle: <@&${roleId}>` : 'Keine Join-Rolle gesetzt.', ephemeral: true });
    }
  },
};
