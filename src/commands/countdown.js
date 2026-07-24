const {
  SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../utils/database');
const { renderCountdownCard } = require('../utils/countdownCard');

function parseAsBerlinTime(dateStr, timeStr) {
  const approxUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'shortOffset' });
  const offsetPart = dtf.formatToParts(approxUtc).find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
  const match = offsetPart.match(/GMT([+-]\d+)/);
  const offsetMin = match ? parseInt(match[1], 10) * 60 : 60;
  return new Date(approxUtc.getTime() - offsetMin * 60000);
}

function computeDisplay(c) {
  const now = Date.now();
  const remaining = c.targetMs - now;
  const start = c.createdAt || (c.targetMs - 30 * 86400000);
  const span = c.targetMs - start;
  const percent = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : (remaining <= 0 ? 1 : 0);

  let value, unitLabel;
  if (remaining <= 0) {
    value = 'Fertig!'; unitLabel = '🎉';
  } else if (remaining < 3600000) {
    const totalSec = Math.floor(remaining / 1000);
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    unitLabel = 'Noch';
  } else if (remaining < 86400000) {
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    unitLabel = 'Noch';
  } else {
    value = Math.ceil(remaining / 86400000);
    unitLabel = 'Tage';
  }
  return { value, unitLabel, percent };
}

async function buildAttachment(c) {
  const { value, unitLabel, percent } = computeDisplay(c);
  const dateLabel = new Date(c.targetMs).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const png = await renderCountdownCard({
    title: c.title, emoji: c.emoji || '', dateLabel, value, unitLabel, percent,
    modeLabel: `${Math.round(percent * 100)}%`,
  });
  return new AttachmentBuilder(png, { name: 'countdown.png' });
}

function toBerlinDateInputValue(ms) {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
function toBerlinTimeInputValue(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
}

function buildListMenu(list) {
  const menu = new StringSelectMenuBuilder().setCustomId('cd|listsel').setPlaceholder('Countdown wählen...')
    .addOptions(list.slice(0, 25).map(c => ({
      label: c.title.slice(0, 100),
      value: c.id,
      description: new Date(c.targetMs).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }).slice(0, 100),
    })));
  return [new ActionRowBuilder().addComponents(menu)];
}

function buildActionRow(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cd|repost|${id}`).setLabel('Repost').setStyle(ButtonStyle.Secondary).setEmoji('🔁'),
    new ButtonBuilder().setCustomId(`cd|edit|${id}`).setLabel('Bearbeiten').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId(`cd|delete|${id}`).setLabel('Löschen').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId('cd|back').setLabel('Zurück').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
  )];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('Countdown erstellen/verwalten')
    .addSubcommand(sub => sub.setName('create').setDescription('Neuen Countdown erstellen')
      .addStringOption(o => o.setName('titel').setDescription('Titel').setRequired(true))
      .addStringOption(o => o.setName('datum').setDescription('Datum (JJJJ-MM-TT)').setRequired(true))
      .addChannelOption(o => o.setName('kanal').setDescription('Ziel-Kanal (optional, sonst aktueller Kanal)').setRequired(false))
      .addStringOption(o => o.setName('uhrzeit').setDescription('Uhrzeit, deutsche Zeit (HH:MM, optional, sonst 00:00)').setRequired(false))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (optional, leer lassen = kein Emoji, Titel wird größer)').setRequired(false)))
    .addSubcommand(sub => sub.setName('list').setDescription('Alle Countdowns dieses Servers verwalten'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const store = db.get('countdowns') || {};
    store[interaction.guild.id] = store[interaction.guild.id] || [];

    if (sub === 'create') {
      const title = interaction.options.getString('titel');
      const dateStr = interaction.options.getString('datum');
      const timeStr = interaction.options.getString('uhrzeit') || '00:00';
      const emoji = interaction.options.getString('emoji') || '';
      const channel = interaction.options.getChannel('kanal') || interaction.channel;
      const target = parseAsBerlinTime(dateStr, timeStr);
      if (isNaN(target.getTime())) {
        return interaction.reply({ content: '❌ Ungültiges Datum/Uhrzeit-Format. Nutze JJJJ-MM-TT und HH:MM.', ephemeral: true });
      }
      const c = { id: Math.random().toString(36).slice(2, 8), title, emoji, targetMs: target.getTime(), createdAt: Date.now() };
      const attachment = await buildAttachment(c);
      const msg = await channel.send({ files: [attachment] }).catch(() => null);
      if (!msg) return interaction.reply({ content: '❌ Konnte Countdown nicht posten (fehlende Berechtigung?).', ephemeral: true });
      c.channelId = msg.channel.id;
      c.messageId = msg.id;
      store[interaction.guild.id].push(c);
      db.set('countdowns', store);
      return interaction.reply({ content: `✅ Countdown "${title}" in ${channel} erstellt (ID: \`${c.id}\`).`, ephemeral: true });
    }

    if (sub === 'list') {
      const list = store[interaction.guild.id];
      if (!list.length) return interaction.reply({ content: 'Keine aktiven Countdowns.', ephemeral: true });
      return interaction.reply({ content: `📋 ${list.length} Countdown(s) - wähle einen aus:`, components: buildListMenu(list), ephemeral: true });
    }
  },

  // ── Aufgerufen aus interactionCreate.js (Buttons UND Select-Menu, "cd|") ──
  async handleInteraction(interaction) {
    const store = db.get('countdowns') || {};
    const list = store[interaction.guild.id] || [];

    if (interaction.isStringSelectMenu() && interaction.customId === 'cd|listsel') {
      const id = interaction.values[0];
      const c = list.find(x => x.id === id);
      if (!c) return interaction.update({ content: '❌ Countdown nicht mehr gefunden.', components: [] }).catch(() => {});
      return interaction.update({
        content: `\`${c.id}\` — **${c.title}** (${new Date(c.targetMs).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})`,
        components: buildActionRow(c.id),
      }).catch(() => {});
    }

    if (interaction.isButton() && interaction.customId === 'cd|back') {
      if (!list.length) return interaction.update({ content: 'Keine aktiven Countdowns.', components: [] }).catch(() => {});
      return interaction.update({ content: `📋 ${list.length} Countdown(s) - wähle einen aus:`, components: buildListMenu(list) }).catch(() => {});
    }

    if (!interaction.isButton()) return;
    const [, action, id] = interaction.customId.split('|');
    const c = list.find(x => x.id === id);
    if (!c) return interaction.reply({ content: '❌ Countdown nicht gefunden (evtl. schon gelöscht).', ephemeral: true }).catch(() => {});

    if (action === 'delete') {
      const ch = await interaction.guild.channels.fetch(c.channelId).catch(() => null);
      if (ch) {
        const m = await ch.messages.fetch(c.messageId).catch(() => null);
        if (m) await m.delete().catch(() => {});
      }
      store[interaction.guild.id] = list.filter(x => x.id !== id);
      db.set('countdowns', store);
      const remaining = store[interaction.guild.id];
      return (remaining.length
        ? interaction.update({ content: `🗑️ Gelöscht. ${remaining.length} Countdown(s) übrig:`, components: buildListMenu(remaining) })
        : interaction.update({ content: '🗑️ Gelöscht. Keine Countdowns mehr übrig.', components: [] })
      ).catch(() => {});
    }

    if (action === 'repost') {
      await interaction.deferUpdate().catch(() => {});
      const attachment = await buildAttachment(c);
      const ch = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      const msg = ch ? await ch.send({ files: [attachment] }).catch(() => null) : null;
      if (msg) { c.channelId = msg.channel.id; c.messageId = msg.id; db.set('countdowns', store); }
      return interaction.followUp({ content: msg ? `✅ Neu gepostet in ${ch}.` : '❌ Fehlgeschlagen.', ephemeral: true }).catch(() => {});
    }

    if (action === 'edit') {
      const modal = new ModalBuilder().setCustomId(`cd|editsubmit|${id}`).setTitle('Countdown bearbeiten')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titel').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(true).setValue(c.title)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('datum').setLabel('Datum (JJJJ-MM-TT)').setStyle(TextInputStyle.Short).setRequired(true).setValue(toBerlinDateInputValue(c.targetMs))),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uhrzeit').setLabel('Uhrzeit (HH:MM)').setStyle(TextInputStyle.Short).setRequired(true).setValue(toBerlinTimeInputValue(c.targetMs))),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (leer = keins)').setStyle(TextInputStyle.Short).setRequired(false).setValue(c.emoji || '')),
        );
      return interaction.showModal(modal);
    }
  },

  async handleModalSubmit(interaction) {
    const [, , id] = interaction.customId.split('|');
    const store = db.get('countdowns') || {};
    const list = store[interaction.guild.id] || [];
    const c = list.find(x => x.id === id);
    if (!c) return interaction.reply({ content: '❌ Countdown nicht gefunden.', ephemeral: true }).catch(() => {});

    const title = interaction.fields.getTextInputValue('titel');
    const dateStr = interaction.fields.getTextInputValue('datum');
    const timeStr = interaction.fields.getTextInputValue('uhrzeit');
    const emoji = interaction.fields.getTextInputValue('emoji') || '';
    const target = parseAsBerlinTime(dateStr, timeStr);
    if (isNaN(target.getTime())) {
      return interaction.reply({ content: '❌ Ungültiges Datum/Uhrzeit-Format.', ephemeral: true }).catch(() => {});
    }
    c.title = title; c.emoji = emoji; c.targetMs = target.getTime();
    db.set('countdowns', store);

    const ch = await interaction.guild.channels.fetch(c.channelId).catch(() => null);
    const msg = ch ? await ch.messages.fetch(c.messageId).catch(() => null) : null;
    if (msg) {
      const attachment = await buildAttachment(c);
      await msg.edit({ files: [attachment] }).catch(() => {});
    }
    return interaction.reply({ content: '✅ Aktualisiert.', ephemeral: true }).catch(() => {});
  },
};
