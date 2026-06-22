const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Postet das Ticket-Panel mit Öffnen-Button in diesen Channel')
    .addStringOption(opt => opt.setName('titel').setDescription('Titel des Panels').setRequired(false))
    .addStringOption(opt => opt.setName('beschreibung').setDescription('Beschreibungstext').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('kategorie').setDescription('Kategorie, in der neue Ticket-Channels erstellt werden')
        .addChannelTypes(ChannelType.GuildCategory).setRequired(true)
    )
    .addRoleOption(opt => opt.setName('support_rolle').setDescription('Rolle die Zugriff auf Tickets bekommt').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const titel = interaction.options.getString('titel') || '🎫 Support-Tickets';
    const beschreibung = interaction.options.getString('beschreibung') || 'Klicke auf den Button unten, um ein Ticket zu öffnen.';
    const kategorie = interaction.options.getChannel('kategorie');
    const supportRolle = interaction.options.getRole('support_rolle');

    const guildConfig = db.get('tickets');
    guildConfig[interaction.guild.id] = guildConfig[interaction.guild.id] || { tickets: {} };
    guildConfig[interaction.guild.id].categoryId = kategorie.id;
    guildConfig[interaction.guild.id].supportRoleId = supportRolle.id;
    db.set('tickets', guildConfig);

    const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle(titel).setDescription(beschreibung);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('Ticket öffnen').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Ticket-Panel wurde gepostet.', ephemeral: true });
  },
};
