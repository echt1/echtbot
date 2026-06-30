const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cdel')
    .setDescription('Löscht diesen Channel automatisch nach einer bestimmten Zeit (max. 24h)')
    .addIntegerOption(opt =>
      opt.setName('minuten').setDescription('In wie vielen Minuten (1–1440)').setRequired(true).setMinValue(1).setMaxValue(1440)
    )
    .addBooleanOption(opt =>
      opt.setName('anzeigen').setDescription('Countdown-Nachricht für alle sichtbar posten? (Standard: ja)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const minutes  = interaction.options.getInteger('minuten');
    const anzeigen = interaction.options.getBoolean('anzeigen') ?? true;
    const ms       = minutes * 60_000;
    const ts       = Math.floor((Date.now() + ms) / 1000);

    await interaction.reply({ content: '✅ Geplant.', ephemeral: true });

    if (anzeigen) {
      const label = minutes < 60
        ? `${minutes} Minute${minutes !== 1 ? 'n' : ''}`
        : `${Math.round(minutes / 60)} Stunde${Math.round(minutes / 60) !== 1 ? 'n' : ''}`;
      await interaction.channel.send({
        content: `🗑️ Dieser Channel wird in **${label}** automatisch gelöscht (<t:${ts}:R>).`,
      });
    }

    setTimeout(() => {
      interaction.channel.delete(`/cdel von ${interaction.user.tag}`).catch(() => {});
    }, ms);
  },
};
