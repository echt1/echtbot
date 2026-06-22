const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('socialnotify')
    .setDescription('Verwaltet Social-Media-Benachrichtigungen')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Fügt einen Social-Media-Kanal zum Beobachten hinzu')
        .addStringOption(opt =>
          opt.setName('plattform').setDescription('Plattform').setRequired(true)
            .addChoices(
              { name: 'YouTube', value: 'youtube' },
              { name: 'Twitch', value: 'twitch' },
              { name: 'TikTok', value: 'tiktok' }
            )
        )
        .addStringOption(opt =>
          opt.setName('kennung').setDescription('YouTube: Channel-ID (UCxxxx) | Twitch/TikTok: Username').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Discord-Channel für die Benachrichtigung').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(opt => opt.setName('nachricht').setDescription('Custom Nachricht, z.B. "@everyone {name} ist live!" - {name} wird ersetzt').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Entfernt eine Social-Media-Beobachtung')
        .addStringOption(opt => opt.setName('plattform').setDescription('Plattform').setRequired(true)
          .addChoices(
            { name: 'YouTube', value: 'youtube' },
            { name: 'Twitch', value: 'twitch' },
            { name: 'TikTok', value: 'tiktok' }
          ))
        .addStringOption(opt => opt.setName('kennung').setDescription('Die Kennung wie beim Hinzufügen').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Listet alle aktiven Beobachtungen auf'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const social = db.get('social');
    const guildId = interaction.guild.id;
    social[guildId] = social[guildId] || [];

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const platform = interaction.options.getString('plattform');
      const handle = interaction.options.getString('kennung');
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('nachricht') || null;

      if (platform === 'youtube' && !handle.startsWith('UC')) {
        return interaction.reply({
          content: '⚠️ Für YouTube brauche ich die **Channel-ID** (beginnt mit "UC..."), nicht den Handle. Du findest sie über die Kanal-URL oder Tools wie commentpicker.com/youtube-channel-id.html.',
          ephemeral: true,
        });
      }

      const entry = { platform, handle, channelId: channel.id, message, lastSeenId: null };
      social[guildId] = social[guildId].filter(e => !(e.platform === platform && e.handle === handle));
      social[guildId].push(entry);
      db.set('social', social);

      return interaction.reply({ content: `✅ Beobachte jetzt **${handle}** (${platform}) → Benachrichtigung in ${channel}.`, ephemeral: true });
    }

    if (sub === 'remove') {
      const platform = interaction.options.getString('plattform');
      const handle = interaction.options.getString('kennung');
      const before = social[guildId].length;
      social[guildId] = social[guildId].filter(e => !(e.platform === platform && e.handle === handle));
      db.set('social', social);

      const removed = before !== social[guildId].length;
      return interaction.reply({ content: removed ? '✅ Entfernt.' : '❌ Kein Eintrag gefunden.', ephemeral: true });
    }

    if (sub === 'list') {
      if (social[guildId].length === 0) {
        return interaction.reply({ content: 'Keine Social-Media-Beobachtungen aktiv.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📡 Aktive Social-Media-Benachrichtigungen')
        .setDescription(
          social[guildId].map(e => `**${e.platform}**: ${e.handle} → <#${e.channelId}>`).join('\n')
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
