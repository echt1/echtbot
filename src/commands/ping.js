const { SlashCommandBuilder } = require('discord.js');

const VERSION = '1.2.0';
const STARTED = Date.now();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Bot-Status, Uptime und Latenz'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const roundtrip = Date.now() - interaction.createdTimestamp;
    const wsping    = interaction.client.ws.ping;
    const uptime    = Math.floor(process.uptime());

    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    const uptimeStr = [d&&`${d}d`, h&&`${h}h`, m&&`${m}m`, `${s}s`].filter(Boolean).join(' ');

    await interaction.editReply({
      content: [
        '```',
        `🤖  echt-bot  v${VERSION}`,
        '─────────────────────────',
        `📶  API Latenz:  ${roundtrip}ms`,
        `💓  WebSocket:   ${wsping}ms`,
        `⏱️   Uptime:      ${uptimeStr}`,
        `🌐  Server:      ${interaction.client.guilds.cache.size}`,
        '```',
      ].join('\n'),
    });
  },
};
