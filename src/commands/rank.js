const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const leveling = require('../utils/leveling');
const { renderRankCard } = require('../utils/rankCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Zeigt deinen Level-Rang')
    .addUserOption(o => o.setName('user').setDescription('Anderer User (optional)').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    await interaction.deferReply();
    const { rank, data } = leveling.getRank(interaction.guild.id, target.id);
    const level = data.level || 0;
    const xpNow = data.xp || 0;
    const levelStartXp = leveling.xpForLevel(level);
    const levelEndXp = leveling.xpForLevel(level + 1);
    const currentXp = Math.max(0, xpNow - levelStartXp);
    const neededXp = Math.max(1, levelEndXp - levelStartXp);
    const progress = currentXp / neededXp;

    const png = await renderRankCard({
      username: target.username,
      avatarUrl: target.displayAvatarURL({ extension: 'png', size: 128 }),
      level,
      rank: rank || '–',
      currentXp,
      neededXp,
      progress,
    });
    const attachment = new AttachmentBuilder(png, { name: 'rank.png' });
    await interaction.editReply({ files: [attachment] });
  },
};
