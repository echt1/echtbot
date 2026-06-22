const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    // --- Slash Commands ---
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Fehler bei Command ${interaction.commandName}:`, err);
        const errorReply = { content: '❌ Beim Ausführen des Commands ist ein Fehler aufgetreten.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply).catch(() => {});
        } else {
          await interaction.reply(errorReply).catch(() => {});
        }
      }
      return;
    }

    // --- Ticket öffnen Button ---
    if (interaction.isButton() && interaction.customId === 'ticket_open') {
      const guildConfig = db.get('tickets');
      const guildData = guildConfig[interaction.guild.id];

      if (!guildData?.categoryId || !guildData?.supportRoleId) {
        return interaction.reply({ content: '❌ Ticket-System ist nicht korrekt konfiguriert. Bitte Admin Bescheid geben.', ephemeral: true });
      }

      // Prüfen ob User schon ein offenes Ticket hat
      const existing = Object.entries(guildData.tickets || {}).find(([, t]) => t.userId === interaction.user.id);
      if (existing) {
        return interaction.reply({ content: `❌ Du hast bereits ein offenes Ticket: <#${existing[0]}>`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`.toLowerCase().slice(0, 90),
        type: ChannelType.GuildText,
        parent: guildData.categoryId,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: guildData.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      guildData.tickets = guildData.tickets || {};
      guildData.tickets[ticketChannel.id] = { userId: interaction.user.id, openedAt: Date.now() };
      db.set('tickets', guildConfig);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🎫 Neues Ticket')
        .setDescription(`Hallo ${interaction.user}, ein Teammitglied kümmert sich gleich um dich.\nSchreib einfach, worum es geht.`);

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Ticket schließen').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );

      await ticketChannel.send({ content: `<@&${guildData.supportRoleId}> <@${interaction.user.id}>`, embeds: [embed], components: [closeRow] });
      await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}` });
      return;
    }

    // --- Ticket schließen Button ---
    if (interaction.isButton() && interaction.customId === 'ticket_close_btn') {
      const guildConfig = db.get('tickets');
      const guildData = guildConfig[interaction.guild.id];
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
