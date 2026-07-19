const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');

function fmtRemaining(ms) {
  if (ms <= 0) return '🎉 Abgelaufen!';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('Countdown erstellen/verwalten')
    .addSubcommand(sub => sub.setName('create').setDescription('Neuen Countdown in diesem Kanal erstellen')
      .addStringOption(o => o.setName('titel').setDescription('Titel').setRequired(true))
      .addStringOption(o => o.setName('datum').setDescription('Datum (JJJJ-MM-TT)').setRequired(true))
      .addStringOption(o => o.setName('uhrzeit').setDescription('Uhrzeit (HH:MM, optional, sonst 00:00)').setRequired(false)))
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
      const target = new Date(`${dateStr}T${timeStr}:00`);
      if (isNaN(target.getTime())) {
        return interaction.reply({ content: '❌ Ungültiges Datum/Uhrzeit-Format. Nutze JJJJ-MM-TT und HH:MM.', ephemeral: true });
      }
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`⏳ ${title}`).setDescription(fmtRemaining(target.getTime() - Date.now()));
      const msg = await interaction.channel.send({ embeds: [embed] }).catch(() => null);
      if (!msg) return interaction.reply({ content: '❌ Konnte Countdown nicht posten (fehlende Berechtigung?).', ephemeral: true });
      const id = Math.random().toString(36).slice(2, 8);
      store[interaction.guild.id].push({ id, title, targetMs: target.getTime(), channelId: msg.channel.id, messageId: msg.id });
      db.set('countdowns', store);
      return interaction.reply({ content: `✅ Countdown "${title}" erstellt (ID: \`${id}\`).`, ephemeral: true });
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
