const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Verwarnt einen User (wird gespeichert)')
    .addUserOption(opt => opt.setName('user').setDescription('Der zu verwarnende User').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Begründung').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('grund');
    const guildId = interaction.guild.id;

    const warnings = db.get('warnings');
    warnings[guildId] = warnings[guildId] || {};
    warnings[guildId][target.id] = warnings[guildId][target.id] || [];
    warnings[guildId][target.id].push({
      reason,
      moderator: interaction.user.id,
      timestamp: Date.now(),
    });
    db.set('warnings', warnings);

    const count = warnings[guildId][target.id].length;

    const embed = new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle('⚠️ User verwarnt')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})` },
        { name: 'Moderator', value: interaction.user.tag },
        { name: 'Grund', value: reason },
        { name: 'Verwarnungen gesamt', value: String(count) }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    target.send({ content: `Du wurdest in **${interaction.guild.name}** verwarnt.\nGrund: ${reason}` }).catch(() => {});
  },
};
