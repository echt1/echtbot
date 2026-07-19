// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN UPDATER - aktualisiert die Countdown-Nachrichten periodisch
// ═══════════════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');
const db = require('./database');

function fmtRemaining(ms) {
  if (ms <= 0) return '🎉 Abgelaufen!';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

async function updateAll(client) {
  const store = db.get('countdowns') || {};
  const now = Date.now();
  for (const gid of Object.keys(store)) {
    for (const c of store[gid]) {
      const ch = await client.channels.fetch(c.channelId).catch(() => null);
      if (!ch) continue;
      const msg = await ch.messages.fetch(c.messageId).catch(() => null);
      if (!msg) continue;
      const remaining = c.targetMs - now;
      const embed = new EmbedBuilder()
        .setColor(remaining <= 0 ? 0x3ba55c : 0x5865f2)
        .setTitle(`⏳ ${c.title}`)
        .setDescription(fmtRemaining(remaining));
      await msg.edit({ embeds: [embed] }).catch(() => {});
    }
  }
}

function startCountdownUpdater(client) {
  updateAll(client);
  setInterval(() => updateAll(client), 30_000).unref?.(); // alle 30 Sekunden
}

module.exports = { startCountdownUpdater, updateAll };
