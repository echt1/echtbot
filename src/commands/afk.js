const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/database');
 
module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('AFK-Status setzen oder entfernen')
    .addStringOption(o => o.setName('grund').setDescription('Grund (optional)').setRequired(false)),
  async execute(interaction) {
    const automod = db.get('automod');
    if (automod[interaction.guild.id]?.afkEnabled === false) {
      return interaction.reply({ content: '❌ Das AFK-System ist auf diesem Server deaktiviert.', ephemeral: true });
    }
    const afk = db.get('afk') || {};
    afk[interaction.guild.id] = afk[interaction.guild.id] || {};
 
    if (afk[interaction.guild.id][interaction.user.id]) {
      delete afk[interaction.guild.id][interaction.user.id];
      db.set('afk', afk);
      if (interaction.member?.manageable && interaction.member.nickname?.startsWith('[AFK] ')) {
        await interaction.member.setNickname(interaction.member.nickname.replace('[AFK] ', '')).catch(() => {});
      }
      return interaction.reply('👋 Dein AFK-Status wurde entfernt.');
    }
 
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
