const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./database');
const cron = require('node-cron');

function buildEmbed(gw, timeLeft = null) {
  const endsAt = Math.floor(gw.endsAt / 1000);
  const embed = new EmbedBuilder()
    .setColor(gw.ended ? 0x72767d : 0xF1C40F)
    .setTitle(`🎉 ${gw.prize}`)
    .setDescription([
      `**Gewinner:** ${gw.winnerCount}`,
      `**Veranstalter:** <@${gw.hostId}>`,
      gw.requiredRoleId ? `**Rolle benötigt:** <@&${gw.requiredRoleId}>` : null,
      '',
      gw.ended
        ? (gw.winners?.length ? `🏆 Gewinner: ${gw.winners.map(id=>`<@${id}>`).join(', ')}` : '❌ Keine gültigen Teilnehmer')
        : `⏰ Endet <t:${endsAt}:R>`,
      '',
      gw.ended ? null : `👥 **${gw.entries.length}** Teilnehmer`,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: gw.ended ? 'Giveaway beendet' : `ID: ${gw.id}` })
    .setTimestamp(gw.endsAt);

  return embed;
}

function buildRow(ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel(ended ? 'Beendet' : '🎉 Mitmachen')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended)
  );
}

async function pickWinners(gw) {
  const eligible = [...gw.entries];
  const winners = [];
  while (winners.length < gw.winnerCount && eligible.length) {
    const idx = Math.floor(Math.random() * eligible.length);
    winners.push(eligible.splice(idx, 1)[0]);
  }
  return winners;
}

async function endGiveaway(client, gw, giveaways) {
  if (gw.ended) return;
  gw.ended = true;
  gw.winners = await pickWinners(gw);

  try {
    const ch = await client.channels.fetch(gw.channelId).catch(() => null);
    if (ch) {
      const msg = await ch.messages.fetch(gw.messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [buildEmbed(gw)], components: [buildRow(true)] });

      if (gw.winners.length) {
        await ch.send({
          content: `🎉 Glückwunsch ${gw.winners.map(id=>`<@${id}>`).join(', ')}! Du hast **${gw.prize}** gewonnen!`,
        });
      } else {
        await ch.send({ content: `❌ Kein Gewinner für **${gw.prize}** (keine Teilnehmer).` });
      }
    }
  } catch (err) {
    console.error('[Giveaway] Fehler beim Beenden:', err.message);
  }

  db.set('giveaways', giveaways);
}

async function checkGiveaways(client) {
  const giveaways = db.get('giveaways');
  const now = Date.now();
  for (const gid of Object.keys(giveaways)) {
    for (const gw of giveaways[gid]) {
      if (!gw.ended && gw.endsAt <= now) {
        await endGiveaway(client, gw, giveaways);
      }
    }
  }
}

function startGiveawayChecker(client) {
  cron.schedule('* * * * *', () => checkGiveaways(client));
  setTimeout(() => checkGiveaways(client), 5000);
  console.log('[Giveaway] Checker gestartet.');
}

module.exports = { buildEmbed, buildRow, pickWinners, endGiveaway, startGiveawayChecker };
