const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const leveling = require('../utils/leveling');
const { renderLeaderboardCard } = require('../utils/rankCard');

module.exports = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 nach Level/XP'),
  async execute(interaction) {
    const top = leveling.getLeaderboard(interaction.guild.id, 10);
    if (!top.length) return interaction.reply('Noch keine Aktivität erfasst.');
    await interaction.deferReply();

    const entries = [];
    for (let i = 0; i < top.length; i++) {
      const e = top[i];
      const user = await interaction.client.users.fetch(e.userId).catch(() => null);
      entries.push({
        rank: i + 1,
        username: user ? user.username : e.userId,
        avatarUrl: user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
        level: e.level,
      });
    }

    const png = await renderLeaderboardCard(entries);
    const attachment = new AttachmentBuilder(png, { name: 'leaderboard.png' });

    const cfg = leveling.getCfg(interaction.guild.id);
    const embCfg = cfg.leaderboardEmbed || {};
    const embed = new EmbedBuilder()
      .setColor(parseInt((embCfg.color || '#5865F2').replace('#', ''), 16) || 0x5865f2)
      .setImage('attachment://leaderboard.png');
    if (embCfg.title) embed.setTitle(embCfg.title);
    if (embCfg.description) embed.setDescription(embCfg.description);
    if (embCfg.footer) embed.setFooter({ text: embCfg.footer });

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};
