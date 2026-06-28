const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

async function createTicketChannel(interaction, prefix, categoryLabel) {
  const guildConfig = db.get('tickets');
  const guildData   = guildConfig[interaction.guild.id];

  if (!guildData?.categoryId || !guildData?.supportRoleId) {
    return interaction.reply({ content: '❌ Ticket-System nicht konfiguriert. Bitte Admin Bescheid geben.', ephemeral: true });
  }

  // Prüfen ob User bereits ein offenes Ticket hat
  const existing = Object.entries(guildData.tickets || {}).find(([, t]) => t.userId === interaction.user.id);
  if (existing) return interaction.reply({ content: `❌ Du hast bereits ein offenes Ticket: <#${existing[0]}>`, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channelName = prefix ? `${prefix}-ticket-${safeName}` : `ticket-${safeName}`;

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName.slice(0, 90),
    type: ChannelType.GuildText,
    parent: guildData.categoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone,    deny:  [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id,                 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guildData.supportRoleId,             allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  guildData.tickets = guildData.tickets || {};
  guildData.tickets[ticketChannel.id] = { userId: interaction.user.id, openedAt: Date.now(), category: categoryLabel || null };
  db.set('tickets', guildConfig);

  const desc = categoryLabel
    ? `Hallo ${interaction.user}, du hast ein **${categoryLabel}**-Ticket geöffnet.\nEin Teammitglied kümmert sich gleich um dich.`
    : `Hallo ${interaction.user}, ein Teammitglied kümmert sich gleich um dich.`;

  const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle('🎫 Neues Ticket').setDescription(desc);
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Ticket schließen').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );

  await ticketChannel.send({ content: `<@&${guildData.supportRoleId}> <@${interaction.user.id}>`, embeds: [embed], components: [closeRow] });
  await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}` });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // ── Slash Commands ──────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Fehler bei Command ${interaction.commandName}:`, err);
        const msg = { content: '❌ Fehler beim Ausführen des Commands.', ephemeral: true };
        interaction.replied || interaction.deferred ? interaction.followUp(msg).catch(()=>{}) : interaction.reply(msg).catch(()=>{});
      }
      return;
    }

    // ── Ticket: Select-Menu mit Kategorien ──────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
      const prefix = interaction.values[0];
      const guildData = db.get('tickets')[interaction.guild.id];
      const category  = guildData?.categories?.find(c => c.prefix === prefix);
      return createTicketChannel(interaction, prefix, category?.label || prefix);
    }

    // ── Ticket: Button (kein Kategorien-Setup) ──────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_open') {
      return createTicketChannel(interaction, null, null);
    }

    // ── Ticket schließen ────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close_btn') {
      const guildConfig = db.get('tickets');
      const guildData   = guildConfig[interaction.guild.id];
      if (!guildData?.tickets?.[interaction.channel.id]) {
        return interaction.reply({ content: '❌ Dies ist kein Ticket-Channel.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Ticket wird in 5 Sekunden geschlossen...' });
      delete guildData.tickets[interaction.channel.id];
      db.set('tickets', guildConfig);
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  },
};
