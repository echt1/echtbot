const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
        ActionRowBuilder, ButtonBuilder, ButtonStyle,
        StringSelectMenuBuilder, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Postet das Ticket-Panel in diesen Channel')
    .addChannelOption(opt =>
      opt.setName('kategorie').setDescription('Discord-Kategorie für neue Ticket-Channels')
        .addChannelTypes(ChannelType.GuildCategory).setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('support_rolle').setDescription('Rolle die Zugriff auf Tickets bekommt').setRequired(true)
    )
    .addStringOption(opt => opt.setName('titel').setDescription('Titel des Panels').setRequired(false))
    .addStringOption(opt => opt.setName('beschreibung').setDescription('Beschreibungstext').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const titel       = interaction.options.getString('titel')       || '🎫 Support-Tickets';
    const beschreibung= interaction.options.getString('beschreibung')|| 'Klicke unten, um ein Ticket zu öffnen.';
    const kategorie   = interaction.options.getChannel('kategorie');
    const supportRolle= interaction.options.getRole('support_rolle');

    const guildConfig = db.get('tickets');
    guildConfig[interaction.guild.id] = guildConfig[interaction.guild.id] || { tickets: {}, categories: [] };
    guildConfig[interaction.guild.id].categoryId    = kategorie.id;
    guildConfig[interaction.guild.id].supportRoleId = supportRolle.id;
    db.set('tickets', guildConfig);

    const categories = guildConfig[interaction.guild.id].categories || [];

    const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle(titel).setDescription(beschreibung);

    let row;
    if (categories.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Wähle eine Kategorie...')
        .addOptions(categories.map(c => ({
          label: c.label,
          value: c.prefix,
          description: c.description || undefined,
          emoji: c.emoji || undefined,
        })));
      row = new ActionRowBuilder().addComponents(menu);
    } else {
      row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open').setLabel('Ticket öffnen').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );
    }

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Ticket-Panel gepostet.', ephemeral: true });
  },
};
