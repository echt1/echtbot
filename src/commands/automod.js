const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Zeigt den Automod-Status – alles weitere im Dashboard')
    .addBooleanOption(opt =>
      opt.setName('aktiv').setDescription('Schnell an- oder ausschalten (optional)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const automod = db.get('automod');
    const guildId = interaction.guild.id;
    if (!automod[guildId]) automod[guildId] = { enabled: false, blockInvites: true, blockSpam: true, action: 'mute', bannedWords: [] };
    const cfg = automod[guildId];

    const aktiv = interaction.options.getBoolean('aktiv');
    if (aktiv !== null) {
      cfg.enabled = aktiv;
      db.set('automod', automod);
    }

    const embed = new EmbedBuilder()
      .setColor(cfg.enabled ? 0x3BA55C : 0xED4245)
      .setTitle('🛡️ Automod-Status')
      .addFields(
        { name: 'Aktiv',               value: cfg.enabled      ? '✅ Ja' : '❌ Nein', inline: true },
        { name: 'Invite-Links',        value: cfg.blockInvites ? '✅ Geblockt' : '❌ Erlaubt', inline: true },
        { name: 'Spam-Schutz',         value: cfg.blockSpam    ? '✅ Aktiv' : '❌ Inaktiv', inline: true },
        { name: 'Aktion bei Verstoß',  value: cfg.action, inline: true },
        { name: 'Verbotene Wörter',    value: `${(cfg.bannedWords||[]).length} Einträge`, inline: true },
      )
      .setFooter({ text: 'Weitere Einstellungen & Wortliste → Dashboard' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
