const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        PermissionFlagsBits, ChannelType,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../utils/database');

async function createTicketChannel(interaction, prefix, categoryLabel, formData) {
  const guildConfig = db.get('tickets');
  const guildData   = guildConfig[interaction.guild.id];

  if (!guildData?.categoryId || !guildData?.supportRoleId) {
    return interaction.reply({ content: '❌ Ticket-System nicht konfiguriert.', ephemeral: true });
  }

  const existing = Object.entries(guildData.tickets || {}).find(([, t]) => t.userId === interaction.user.id);
  if (existing) return interaction.reply({ content: `❌ Du hast bereits ein offenes Ticket: <#${existing[0]}>`, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channelName = (prefix ? `${prefix}-ticket-${safeName}` : `ticket-${safeName}`).slice(0, 90);

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: guildData.categoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone,  deny:  [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id,               allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guildData.supportRoleId,           allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  guildData.tickets = guildData.tickets || {};
  guildData.tickets[ticketChannel.id] = {
    userId: interaction.user.id,
    openedAt: Date.now(),
    category: categoryLabel || null,
    claimedBy: null,
  };
  db.set('tickets', guildConfig);

  let desc = categoryLabel
    ? `Hallo ${interaction.user}, du hast ein **${categoryLabel}**-Ticket geöffnet.\nEin Teammitglied kümmert sich gleich um dich.`
    : `Hallo ${interaction.user}, ein Teammitglied kümmert sich gleich um dich.`;

  if (formData?.length) {
    desc += '\n\n' + formData.map(f => `**${f.label}:** ${f.value || '–'}`).join('\n');
  }

  const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle('🎫 Neues Ticket').setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('Ticket übernehmen').setStyle(ButtonStyle.Success).setEmoji('📋'),
    new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Ticket schließen').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await ticketChannel.send({ content: `<@&${guildData.supportRoleId}> <@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: ${ticketChannel}` });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // ── Giveaway: Mitmachen Button ────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'giveaway_enter') {
      const giveaways = db.get('giveaways');
      const gid = interaction.guild.id;
      const gw = giveaways[gid]?.find(g => g.messageId === interaction.message.id && !g.ended);
      if (!gw) return interaction.reply({ content: '❌ Dieses Giveaway ist bereits beendet.', ephemeral: true });

      // Rollencheck
      if (gw.requiredRoleId && !interaction.member.roles.cache.has(gw.requiredRoleId)) {
        return interaction.reply({ content: `❌ Du brauchst die Rolle <@&${gw.requiredRoleId}> um teilzunehmen.`, ephemeral: true });
      }

      if (gw.entries.includes(interaction.user.id)) {
        // Austragen
        gw.entries = gw.entries.filter(id => id !== interaction.user.id);
        db.set('giveaways', giveaways);
        return interaction.reply({ content: '✅ Du hast das Giveaway verlassen.', ephemeral: true });
      }

      gw.entries.push(interaction.user.id);
      db.set('giveaways', giveaways);
      return interaction.reply({ content: `🎉 Du nimmst jetzt teil! (${gw.entries.length} Teilnehmer)`, ephemeral: true });
    }

    // ── Slash + Context Menu Commands ──────────────────────────────
    if (interaction.isChatInputCommand() || interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Fehler bei Command ${interaction.commandName}:`, err);
        const msg = { content: '❌ Fehler beim Ausführen.', ephemeral: true };
        interaction.replied || interaction.deferred ? interaction.followUp(msg).catch(()=>{}) : interaction.reply(msg).catch(()=>{});
      }
      return;
    }

    // ── Ticket: Select-Menu ─────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
      const prefix    = interaction.values[0];
      const guildData = db.get('tickets')[interaction.guild.id];
      const category  = guildData?.categories?.find(c => c.prefix === prefix);

      if (category?.hasForm && category.formFields?.length) {
        const fields = category.formFields.slice(0, 5);
        const modal  = new ModalBuilder()
          .setCustomId(`ticket_modal_${prefix}`)
          .setTitle(category.label.slice(0, 45))
          .addComponents(
            ...fields.map((field, i) =>
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId(`field_${i}`)
                  .setLabel(field.label.slice(0, 45))
                  .setStyle(field.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                  .setRequired(field.required !== false)
                  .setPlaceholder((field.placeholder || '').slice(0, 100) || undefined)
                  .setMaxLength(field.style === 'long' ? 1000 : 200)
              )
            )
          );
        return interaction.showModal(modal);
      }

      return createTicketChannel(interaction, prefix, category?.label || prefix, null);
    }

    // ── Ticket: Modal-Submit ────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const prefix    = interaction.customId.replace('ticket_modal_', '');
      const guildData = db.get('tickets')[interaction.guild.id];
      const category  = guildData?.categories?.find(c => c.prefix === prefix);
      const fields    = category?.formFields || [];
      const formData  = fields.map((f, i) => {
        let value = '';
        try { value = interaction.fields.getTextInputValue(`field_${i}`); } catch { value = ''; }
        return { label: f.label, value };
      });
      return createTicketChannel(interaction, prefix, category?.label || prefix, formData);
    }

    // ── Ticket: Button (kein Kategorien-Setup) ──────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_open') {
      return createTicketChannel(interaction, null, null, null);
    }

    // ── Ticket: Claim ───────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_claim_btn') {
      const guildConfig = db.get('tickets');
      const guildData   = guildConfig[interaction.guild.id];
      const ticketInfo  = guildData?.tickets?.[interaction.channel.id];

      if (!ticketInfo) return interaction.reply({ content: '❌ Dies ist kein Ticket-Channel.', ephemeral: true });

      if (ticketInfo.claimedBy) {
        return interaction.reply({
          content: `❌ Dieses Ticket ist bereits von <@${ticketInfo.claimedBy}> übernommen.`,
          ephemeral: true,
        });
      }

      ticketInfo.claimedBy = interaction.user.id;
      db.set('tickets', guildConfig);

      // Button aktualisieren: Claim-Button deaktivieren und Label ändern
      const msg = interaction.message;
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim_btn')
          .setLabel(`Übernommen von ${interaction.user.username}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('📋')
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_close_btn')
          .setLabel('Ticket schließen')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
      );
      await msg.edit({ components: [updatedRow] }).catch(() => {});

      await interaction.reply({
        content: `📋 ${interaction.user} hat dieses Ticket übernommen.`,
      });
      return;
    }

    // ── Ticket schließen ────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close_btn') {
      const guildConfig = db.get('tickets');
      const guildData   = guildConfig[interaction.guild.id];
      if (!guildData?.tickets?.[interaction.channel.id]) {
        return interaction.reply({ content: '❌ Dies ist kein Ticket-Channel.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Ticket wird in 5 Sekunden geschlossen...' });

      // Transcript speichern
      try {
        const msgs = await interaction.channel.messages.fetch({ limit: 200 });
        const transcript = [...msgs.values()].reverse().map(m => ({
          author: m.author.tag, authorId: m.author.id,
          content: m.content || (m.embeds[0]?.title ? `[Embed: ${m.embeds[0].title}]` : '[Kein Text]'),
          timestamp: m.createdTimestamp,
        }));
        const ticketLogs = db.get('ticketlogs') || {};
        ticketLogs[interaction.guild.id] = ticketLogs[interaction.guild.id] || [];
        ticketLogs[interaction.guild.id].push({
          id: interaction.channel.id,
          userId: guildData.tickets[interaction.channel.id]?.userId,
          category: guildData.tickets[interaction.channel.id]?.category,
          claimedBy: guildData.tickets[interaction.channel.id]?.claimedBy,
          openedAt: guildData.tickets[interaction.channel.id]?.openedAt,
          closedAt: Date.now(),
          closedBy: interaction.user.id,
          transcript,
        });
        // Älter als 30 Tage entfernen
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        ticketLogs[interaction.guild.id] = ticketLogs[interaction.guild.id].filter(t => t.closedAt > cutoff);
        db.set('ticketlogs', ticketLogs);
      } catch (err) {
        console.error('[TicketLog] Fehler beim Speichern:', err.message);
      }

      delete guildData.tickets[interaction.channel.id];
      db.set('tickets', guildConfig);
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  },
};
