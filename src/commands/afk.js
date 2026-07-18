const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('AFK-Status setzen')
    .addStringOption(o => o.setName('grund').setDescription('Grund (optional)').setRequired(false)),
  async execute(interaction) {
    const afk = db.get('afk') || {};
    afk[interaction.guild.id] = afk[interaction.guild.id] || {};
    const reason = interaction.options.getString('grund') || 'AFK';
    afk[interaction.guild.id][interaction.user.id] = { reason, since: Date.now() };
    db.set('afk', afk);
    await interaction.reply(`💤 Du bist jetzt AFK: ${reason}`);
    if (interaction.member?.manageable) {
      const currentNick = interaction.member.nickname || interaction.member.user.username;
      if (!currentNick.startsWith('[AFK] ')) {
        await interaction.member.setNickname(`[AFK] ${currentNick}`.slice(0, 32)).catch(() => {});
      }
    }
  },
};
