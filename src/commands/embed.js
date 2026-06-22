const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Sendet eine custom Embed-Nachricht')
    .addStringOption(opt => opt.setName('titel').setDescription('Titel des Embeds').setRequired(true))
    .addStringOption(opt => opt.setName('beschreibung').setDescription('Beschreibungstext (nutze \\n für Zeilenumbrüche)').setRequired(true))
    .addStringOption(opt => opt.setName('farbe').setDescription('Hex-Farbe, z.B. #5865F2').setRequired(false))
    .addStringOption(opt => opt.setName('bild_url').setDescription('Bild-URL').setRequired(false))
    .addStringOption(opt => opt.setName('thumbnail_url').setDescription('Thumbnail-URL (kleines Bild oben rechts)').setRequired(false))
    .addStringOption(opt => opt.setName('footer').setDescription('Footer-Text').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel zum Senden (Standard: aktueller Channel)')
        .addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const titel = interaction.options.getString('titel');
    const beschreibung = interaction.options.getString('beschreibung').replace(/\\n/g, '\n');
    const farbeInput = interaction.options.getString('farbe');
    const bildUrl = interaction.options.getString('bild_url');
    const thumbnailUrl = interaction.options.getString('thumbnail_url');
    const footer = interaction.options.getString('footer');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    let farbe = 0x5865F2;
    if (farbeInput) {
      const parsed = parseInt(farbeInput.replace('#', ''), 16);
      if (!Number.isNaN(parsed)) farbe = parsed;
    }

    const embed = new EmbedBuilder().setTitle(titel).setDescription(beschreibung).setColor(farbe);
    if (bildUrl) embed.setImage(bildUrl);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (footer) embed.setFooter({ text: footer });

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ Embed in ${channel} gesendet.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Konnte Embed nicht senden (fehlende Rechte im Zielchannel?).', ephemeral: true });
    }
  },
};
