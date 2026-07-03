const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../utils/database');
const { buildEmbed, buildRow, pickWinners, endGiveaway } = require('../utils/giveawayManager');
const { randomUUID } = require('crypto');

function parseDuration(str) {
  const m = /^(\d+)(m|h|d)$/i.exec(str.trim());
  if (!m) return null;
  const units = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(m[1]) * units[m[2].toLowerCase()];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway-System')
    .addSubcommand(sub => sub.setName('start').setDescription('Startet ein Giveaway')
      .addStringOption(o => o.setName('preis').setDescription('Was wird verlost?').setRequired(true))
      .addStringOption(o => o.setName('dauer').setDescription('Laufzeit: 10m, 2h, 1d, 7d').setRequired(true))
      .addIntegerOption(o => o.setName('gewinner').setDescription('Anzahl Gewinner (Standard: 1)').setMinValue(1).setMaxValue(20).setRequired(false))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (Standard: aktueller)').addChannelTypes(ChannelType.GuildText).setRequired(false))
      .addRoleOption(o => o.setName('rolle').setDescription('Nur User mit dieser Rolle können mitmachen').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('end').setDescription('Beendet ein laufendes Giveaway sofort')
      .addStringOption(o => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('reroll').setDescription('Zieht einen neuen Gewinner')
      .addStringOption(o => o.setName('id').setDescription('Giveaway-ID').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Zeigt laufende Giveaways'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const giveaways = db.get('giveaways');
    const gid = interaction.guild.id;
    giveaways[gid] = giveaways[gid] || [];

    if (sub === 'start') {
      const prize       = interaction.options.getString('preis');
      const durationStr = interaction.options.getString('dauer');
      const winnerCount = interaction.options.getInteger('gewinner') ?? 1;
      const channel     = interaction.options.getChannel('channel') || interaction.channel;
      const role        = interaction.options.getRole('rolle');

      const duration = parseDuration(durationStr);
      if (!duration) return interaction.reply({ content: '❌ Ungültige Dauer. Beispiele: `10m`, `2h`, `1d`, `7d`', ephemeral: true });

      const gw = {
        id: randomUUID().slice(0, 8),
        guildId: gid, channelId: channel.id, messageId: null,
        prize, winnerCount, hostId: interaction.user.id,
        requiredRoleId: role?.id || null,
        endsAt: Date.now() + duration,
        entries: [], ended: false, winners: [],
      };

      const msg = await channel.send({ embeds: [buildEmbed(gw)], components: [buildRow()] });
      gw.messageId = msg.id;
      giveaways[gid].push(gw);
      db.set('giveaways', giveaways);

      return interaction.reply({ content: `✅ Giveaway gestartet! ID: \`${gw.id}\``, ephemeral: true });
    }

    if (sub === 'end') {
      const gwId = interaction.options.getString('id');
      const gw = giveaways[gid]?.find(g => g.id === gwId && !g.ended);
      if (!gw) return interaction.reply({ content: '❌ Giveaway nicht gefunden oder bereits beendet.', ephemeral: true });
      gw.endsAt = Date.now();
      await endGiveaway(interaction.client, gw, giveaways);
      return interaction.reply({ content: '✅ Giveaway beendet.', ephemeral: true });
    }

    if (sub === 'reroll') {
      const gwId = interaction.options.getString('id');
      const gw = giveaways[gid]?.find(g => g.id === gwId && g.ended);
      if (!gw) return interaction.reply({ content: '❌ Giveaway nicht gefunden oder noch nicht beendet.', ephemeral: true });
      gw.winners = await pickWinners(gw);
      db.set('giveaways', giveaways);
      const msg = gw.winners.length
        ? `🎉 Neuer Gewinner: ${gw.winners.map(id=>`<@${id}>`).join(', ')} – Glückwunsch!`
        : '❌ Keine Teilnehmer für Reroll.';
      await interaction.channel.send({ content: msg });
      return interaction.reply({ content: '✅ Reroll durchgeführt.', ephemeral: true });
    }

    if (sub === 'list') {
      const active = giveaways[gid]?.filter(g => !g.ended) || [];
      if (!active.length) return interaction.reply({ content: 'Keine laufenden Giveaways.', ephemeral: true });
      const list = active.map(g => `\`${g.id}\` – **${g.prize}** – endet <t:${Math.floor(g.endsAt/1000)}:R> – ${g.entries.length} Teilnehmer`).join('\n');
      return interaction.reply({ content: `**Laufende Giveaways:**\n${list}`, ephemeral: true });
    }
  },
};
