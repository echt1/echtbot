const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

// Standard-Wordlist – wird beim ersten /automod status geladen wenn noch keine existiert
const DEFAULT_BANNED_WORDS = [
  // Nationalsozialismus / Rechtsextremismus
  'heil hitler', 'sieg heil', '88', 'hh', 'nsdap', 'nazis raus', 'white power',
  'white supremacy', 'aryans', 'kkk', 'ku klux', 'rechtsextrem',
  // Rassistische Slurs (Deutsch & Englisch)
  'nigger', 'nigga', 'neger', 'kanake', 'schlitzauge', 'chink', 'spic', 'wetback',
  'kike', 'jude raus', 'judensau', 'zipfelkopf', 'kameltreiber',
  // Homophobe / transphobe Slurs
  'schwuchtel', 'faggot', 'fag', 'dyke', 'tranny', 'transe',
  // Allgemeine schwere Beleidigungen
  'hurensohn', 'wichser', 'fotze', 'scheiß türke', 'scheiß ausländer',
  // Terror / Gewaltverherrlichung
  'allahu akbar', 'jihad', 'terroranschlag', 'bombenanschlag', 'amok',
];

function defaultConfig() {
  return {
    enabled: false,
    blockInvites: true,
    blockSpam: true,
    spamThreshold: 5,
    spamIntervalMs: 7000,
    bannedWords: [...DEFAULT_BANNED_WORDS],
    action: 'mute',
    muteDurationMs: 600000,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Zeigt und verwaltet die Automod-Einstellungen')
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Zeigt die aktuelle Konfiguration + alle verbotenen Wörter')
    )
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('Automod an- oder ausschalten')
        .addBooleanOption(opt => opt.setName('aktiv').setDescription('An oder aus').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('invites')
        .setDescription('Discord-Invite-Links blocken an/aus')
        .addBooleanOption(opt => opt.setName('aktiv').setDescription('An oder aus').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('spam')
        .setDescription('Spam-Schutz an/aus')
        .addBooleanOption(opt => opt.setName('aktiv').setDescription('An oder aus').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('aktion')
        .setDescription('Was passiert bei einem Verstoß')
        .addStringOption(opt =>
          opt.setName('typ').setDescription('Aktion').setRequired(true)
            .addChoices(
              { name: 'Nur Warnung',  value: 'warn' },
              { name: 'Mute (Timeout)', value: 'mute' },
              { name: 'Kick',         value: 'kick' },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('wort-hinzufuegen')
        .setDescription('Fügt ein verbotenes Wort/Phrase hinzu')
        .addStringOption(opt => opt.setName('wort').setDescription('Das verbotene Wort oder die Phrase').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('wort-entfernen')
        .setDescription('Entfernt ein verbotenes Wort')
        .addStringOption(opt => opt.setName('wort').setDescription('Das zu entfernende Wort').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('woerter-reset')
        .setDescription('Setzt die Wortliste auf die Standard-Liste zurück')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const automod = db.get('automod');
    const guildId = interaction.guild.id;

    if (!automod[guildId]) automod[guildId] = defaultConfig();
    const config = automod[guildId];

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const words = config.bannedWords.length
        ? config.bannedWords.map(w => `\`${w}\``).join(', ')
        : 'Keine';

      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🛡️ Automod-Status')
        .addFields(
          { name: 'Aktiv',               value: config.enabled      ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Invite-Links blocken', value: config.blockInvites ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Spam-Schutz',         value: config.blockSpam    ? '✅ Ja' : '❌ Nein', inline: true },
          { name: 'Aktion bei Verstoß',  value: config.action,                              inline: true },
          { name: `Verbotene Wörter (${config.bannedWords.length})`, value: words.length > 1024 ? words.slice(0, 1020) + '...' : words },
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'toggle')           config.enabled      = interaction.options.getBoolean('aktiv');
    if (sub === 'invites')          config.blockInvites = interaction.options.getBoolean('aktiv');
    if (sub === 'spam')             config.blockSpam    = interaction.options.getBoolean('aktiv');
    if (sub === 'aktion')           config.action       = interaction.options.getString('typ');

    if (sub === 'wort-hinzufuegen') {
      const wort = interaction.options.getString('wort').toLowerCase();
      if (!config.bannedWords.includes(wort)) config.bannedWords.push(wort);
    }

    if (sub === 'wort-entfernen') {
      const wort = interaction.options.getString('wort').toLowerCase();
      config.bannedWords = config.bannedWords.filter(w => w !== wort);
    }

    if (sub === 'woerter-reset') {
      config.bannedWords = [...DEFAULT_BANNED_WORDS];
      db.set('automod', automod);
      return interaction.reply({ content: `✅ Wortliste auf ${DEFAULT_BANNED_WORDS.length} Standard-Begriffe zurückgesetzt.`, ephemeral: true });
    }

    db.set('automod', automod);
    await interaction.reply({ content: '✅ Gespeichert.', ephemeral: true });
  },
};
