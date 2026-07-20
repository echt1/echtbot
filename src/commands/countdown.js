const { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { renderCountdownCard } = require('../utils/countdownCard');

function computeDisplay(c) {
  const now = Date.now();
  const remaining = c.targetMs - now;
  const start = c.createdAt || (c.targetMs - 30 * 86400000);
  const span = c.targetMs - start;
  const percent = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : (remaining <= 0 ? 1 : 0);

  let value, unitLabel;
  if (remaining <= 0) {
    value = '🎉'; unitLabel = 'Abgelaufen';
  } else if (remaining < 86400000) {
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    unitLabel = 'Noch';
  } else {
    value = Math.ceil(remaining / 86400000);
    unitLabel = 'Tage';
  }
  return { value, unitLabel, percent, remaining };
}

async function buildAttachment(c) {
  const { value, unitLabel, percent } = computeDisplay(c);
  const dateLabel = new Date(c.targetMs).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const png = await renderCountdownCard({
    title: c.title,
    emoji: c.emoji || '📌',
    dateLabel,
    value,
    unitLabel,
    percent,
    modeLabel: `${Math.round(percent * 100)}%`,
  });
  return new AttachmentBuilder(png, { name: 'countdown.png' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('Countdown erstellen/verwalten')
    .addSubcommand(sub => sub.setName('create').setDescription('Neuen Countdown in diesem Kanal erstellen')
      .addStringOption(o => o.setName('titel').setDescription('Titel').setRequired(true))
      .addStringOption(o => o.setName('datum').setDescription('Datum (JJJJ-MM-TT)').setRequired(true))
      .addStringOption(o => o.setName('uhrzeit').setDescription('Uhrzeit (HH:MM, optional, sonst 00:00)').setRequired(false))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (optional, Standard 📌)').setRequired(false)))
    .addSubcommand(sub => sub.setName('list').setDescription('Alle Countdowns dieses Servers anzeigen'))
    .addSubcommand(sub => sub.setName('delete').setDescription('Countdown löschen')
      .addStringOption(o => o.setName('id').setDescription('Countdown-ID (siehe /countdown list)').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const store = db.get('countdowns') || {};
    store[interaction.guild.id] = store[interaction.guild.id] || [];

    if (sub === 'create') {
      const title = interaction.options.getString('titel');
      const dateStr = interaction.options.getString('datum');
      const timeStr = interaction.options.getString('uhrzeit') || '00:00';
      const emoji = interaction.options.getString('emoji') || '📌';
      const target = new Date(`${dateStr}T${timeStr}:00`);
      if (isNaN(target.getTime())) {
        return interaction.reply({ content: '❌ Ungültiges Datum/Uhrzeit-Format. Nutze JJJJ-MM-TT und HH:MM.', ephemeral: true });
      }
      const c = { id: Math.random().toString(36).slice(2, 8), title, emoji, targetMs: target.getTime(), createdAt: Date.now() };
      const attachment = await buildAttachment(c);
      const msg = await interaction.channel.send({ files: [attachment] }).catch(() => null);
      if (!msg) return interaction.reply({ content: '❌ Konnte Countdown nicht posten (fehlende Berechtigung?).', ephemeral: true });
      c.channelId = msg.channel.id;
      c.messageId = msg.id;
      store[interaction.guild.id].push(c);
      db.set('countdowns', store);
      return interaction.reply({ content: `✅ Countdown "${title}" erstellt (ID: \`${c.id}\`).`, ephemeral: true });
    }

    if (sub === 'list') {
      const list = store[interaction.guild.id];
      if (!list.length) return interaction.reply({ content: 'Keine aktiven Countdowns.', ephemeral: true });
      const lines = list.map(c => `\`${c.id}\` — **${c.title}** (${new Date(c.targetMs).toLocaleString('de-DE')})`);
      return interaction.reply({ content: lines.join('\n'), ephemeral: true });
    }

    if (sub === 'delete') {
      const id = interaction.options.getString('id');
      const c = store[interaction.guild.id].find(x => x.id === id);
      if (!c) return interaction.reply({ content: '❌ Countdown nicht gefunden. Nutze /countdown list für die IDs.', ephemeral: true });
      const ch = await interaction.guild.channels.fetch(c.channelId).catch(() => null);
      if (ch) {
        const m = await ch.messages.fetch(c.messageId).catch(() => null);
        if (m) await m.delete().catch(() => {});
      }
      store[interaction.guild.id] = store[interaction.guild.id].filter(x => x.id !== id);
      db.set('countdowns', store);
      return interaction.reply({ content: '🗑️ Countdown gelöscht.', ephemeral: true });
    }
  },
};
