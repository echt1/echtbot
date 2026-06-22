const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

function defaultConfig() {
  return {
    enabled: false,
    blockInvites: true,
    blockSpam: true,
    spamThreshold: 5, // Nachrichten
    spamIntervalMs: 7000, // innerhalb dieser Zeit
    bannedWords: [],
    action: 'mute', // 'warn' | 'mute' | 'kick'
    muteDurationMs: 600000, // 10 Minuten bei action=mute
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Konfiguriert das Automod-System')
    .addSubcommand(sub => sub.setName('status').setDescription('Zeigt die aktuelle Automod-Konfiguration'))
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Automod komplett an-/ausschalten')
        .addBooleanOption(opt => opt.setName('aktiv').setDescription('An oder aus').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('wort-hinzufuegen')
        .setDescription('Fügt ein verbotenes Wort hinzu')
        .addStringOption(opt => opt.setName('wort').setDescription('Das verbotene Wort').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('wort-entfernen')
        .setDescription('Entfernt ein verbotenes Wort')
        .addStringOption(opt => opt.setName('wort').setDescription('Das zu entfernende Wort').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('invites')
        .setDescription('Discord-Invite-Links blocken an/aus')
        .addBooleanOption(opt => opt.setName('aktiv').setDescription('An oder aus').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('aktion')
        .setDescription('Was passiert bei einem Verstoß')
        .addStringOption(opt =>
          opt.setName('typ').setDescription('Aktion bei Verstoß').setRequired(true)
            .addChoices(
              { name: 'Nur Warnung', value: 'warn' },
              { name: 'Mute (Timeout)', value: 'mute' },
              { name: 'Kick', value: 'kick' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const automod = db.get('automod');
    const guildId = interaction.guild.id;
    automod[guildId] = automod[guildId] || defaultConfig();
    const config = automod[guildId];

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🛡️ Automod-Konfiguration')
        .addFields(
          { name: 'Aktiv', value: config.enabled ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Invite-Links blocken', value: config.blockInvites ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Spam-Schutz', value: config.blockSpam ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Aktion bei Verstoß', value: config.action, inline: true },
          { name: 'Verbotene Wörter', value: config.bannedWords.length ? config.bannedWords.join(', ') : 'Keine' }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'toggle') {
      config.enabled = interaction.options.getBoolean('aktiv');
    } else if (sub === 'wort-hinzufuegen') {
      const wort = interaction.options.getString('wort').toLowerCase();
      if (!config.bannedWords.includes(wort)) config.bannedWords.push(wort);
    } else if (sub === 'wort-entfernen') {
      const wort = interaction.options.getString('wort').toLowerCase();
      config.bannedWords = config.bannedWords.filter(w => w !== wort);
    } else if (sub === 'invites') {
      config.blockInvites = interaction.options.getBoolean('aktiv');
    } else if (sub === 'aktion') {
      config.action = interaction.options.getString('typ');
    }

    db.set('automod', automod);
    await interaction.reply({ content: '✅ Automod-Einstellung gespeichert.', ephemeral: true });
  },
};
