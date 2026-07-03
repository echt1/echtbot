const { logMod } = require('../utils/modlog');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Erlaubte Zeiteinheiten -> Millisekunden
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(input) {
  const match = /^(\d+)([mhd])$/.exec(input.trim());
  if (!match) return null;
  const [, amount, unit] = match;
  const ms = Number(amount) * UNITS[unit];
  return ms > 0 && ms <= 28 * 86_400_000 ? ms : null; // Discord-Limit: max 28 Tage
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Versetzt einen User in einen Timeout (Mute)')
    .addUserOption(opt => opt.setName('user').setDescription('Der zu mutende User').setRequired(true))
    .addStringOption(opt => opt.setName('dauer').setDescription('z.B. 10m, 2h, 1d (max 28d)').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Begründung').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const durationInput = interaction.options.getString('dauer');
    const reason = interaction.options.getString('grund') || 'Kein Grund angegeben';

    const ms = parseDuration(durationInput);
    if (!ms) {
      return interaction.reply({ content: '❌ Ungültige Dauer. Format: Zahl + m/h/d, z.B. `30m`, `2h`, `1d` (max. 28d).', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ User nicht auf diesem Server gefunden.', ephemeral: true });
    if (!member.moderatable) {
      return interaction.reply({ content: '❌ Ich kann diesen User nicht muten (höhere Rolle oder fehlende Rechte).', ephemeral: true });
    }

    try {
      await member.timeout(ms, `${reason} | Gemutet von ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('🔇 User gemutet')
        .addFields(
          { name: 'User', value: `${target.tag} (${target.id})` },
          { name: 'Dauer', value: durationInput },
          { name: 'Moderator', value: interaction.user.tag },
          { name: 'Grund', value: reason }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      await logMod(interaction.client, interaction.guild.id, { action:'mute', target, moderator:interaction.user, reason, extra:{ Dauer: durationInput } });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Beim Muten ist ein Fehler aufgetreten.', ephemeral: true });
    }
  },
};
