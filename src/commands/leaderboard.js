const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../utils/leveling');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 nach Level/XP'),
  async execute(interaction) {
    const top = leveling.getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('Noch keine Aktivität erfasst.');
    const lines = await Promise.all(top.map(async (e, i) => {
      const user = await interaction.client.users.fetch(e.userId).catch(() => null);
      return `**${i + 1}.** ${user ? user.tag : e.userId} — Level ${e.level} (${e.xp} XP)`;
    }));
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🏆 Leaderboard').setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed] });
  },
};
