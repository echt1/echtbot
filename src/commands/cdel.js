const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

function parseTime(input) {
  // Format: "30m", "2h", "1d", "14:30", "24.12.2025 14:30"
  input = input.trim();

  // Relative: 30m / 2h / 1d
  const rel = /^(\d+)(m|h|d)$/i.exec(input);
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2].toLowerCase()];
    return Date.now() + n * unit;
  }

  // Uhrzeit heute: "14:30"
  const time = /^(\d{1,2}):(\d{2})$/.exec(input);
  if (time) {
    const d = new Date();
    d.setHours(parseInt(time[1]), parseInt(time[2]), 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // morgen
    return d.getTime();
  }

  // Datum + Uhrzeit: "24.12.2025 14:30" oder "24.12. 14:30"
  const dt = /^(\d{1,2})\.(\d{1,2})\.?(?:(\d{4}))?\s+(\d{1,2}):(\d{2})$/.exec(input);
  if (dt) {
    const year = dt[3] ? parseInt(dt[3]) : new Date().getFullYear();
    const d = new Date(year, parseInt(dt[2]) - 1, parseInt(dt[1]), parseInt(dt[4]), parseInt(dt[5]), 0, 0);
    return d.getTime();
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cdel')
    .setDescription('Löscht diesen Channel automatisch nach einer Zeit oder zu einem bestimmten Zeitpunkt')
    .addStringOption(opt =>
      opt.setName('zeit').setDescription('z.B. 30m, 2h, 1d, 14:30, oder "24.12.2025 14:30"').setRequired(true)
    )
    .addBooleanOption(opt =>
      opt.setName('anzeigen').setDescription('Countdown-Nachricht für alle posten? (Standard: ja)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const zeitInput = interaction.options.getString('zeit');
    const anzeigen  = interaction.options.getBoolean('anzeigen') ?? true;

    const targetTime = parseTime(zeitInput);
    if (!targetTime) {
      return interaction.reply({ content: '❌ Ungültiges Format. Beispiele: `30m`, `2h`, `1d`, `14:30`, `24.12.2025 14:30`', ephemeral: true });
    }

    const ms = targetTime - Date.now();
    if (ms < 10_000) return interaction.reply({ content: '❌ Zeitpunkt muss in der Zukunft liegen (mind. 10 Sekunden).', ephemeral: true });
    if (ms > 24 * 3_600_000) return interaction.reply({ content: '❌ Maximal 24 Stunden im Voraus möglich.', ephemeral: true });

    const ts = Math.floor(targetTime / 1000);
    await interaction.reply({ content: '✅ Geplant.', ephemeral: true });

    if (anzeigen) {
      await interaction.channel.send({
        content: `🗑️ Dieser Channel wird automatisch gelöscht <t:${ts}:R> (am <t:${ts}:f>).`,
      });
    }

    setTimeout(() => {
      interaction.channel.delete(`/cdel von ${interaction.user.tag}`).catch(() => {});
    }, ms);
  },
};
