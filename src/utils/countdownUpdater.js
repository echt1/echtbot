// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN UPDATER - aktualisiert die Countdown-Bilder auf ausgerichtete
// 30-Sekunden-Takte (z.B. :00 und :30 jeder Minute), nicht relativ zum
// Erstellungszeitpunkt
// ═══════════════════════════════════════════════════════════════════════
const { AttachmentBuilder } = require('discord.js');
const db = require('./database');
const { renderCountdownCard } = require('./countdownCard');

function computeDisplay(c) {
  const now = Date.now();
  const remaining = c.targetMs - now;
  const start = c.createdAt || (c.targetMs - 30 * 86400000);
  const span = c.targetMs - start;
  const percent = span > 0 ? Math.min(1, Math.max(0, (now - start) / span)) : (remaining <= 0 ? 1 : 0);

  let value, unitLabel;
  if (remaining <= 0) {
    value = '00:00:00'; unitLabel = 'Abgelaufen';
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

async function updateAll(client) {
  const store = db.get('countdowns') || {};
  for (const gid of Object.keys(store)) {
    for (const c of store[gid]) {
      const ch = await client.channels.fetch(c.channelId).catch(() => null);
      if (!ch) continue;
      const msg = await ch.messages.fetch(c.messageId).catch(() => null);
      if (!msg) continue;

      const { value, unitLabel, percent } = computeDisplay(c);
      const dateLabel = new Date(c.targetMs).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
      try {
        const png = await renderCountdownCard({
          title: c.title, emoji: c.emoji || '', dateLabel, value, unitLabel, percent,
          modeLabel: `${Math.round(percent * 100)}%`,
        });
        const attachment = new AttachmentBuilder(png, { name: 'countdown.png' });
        await msg.edit({ files: [attachment] }).catch(() => {});
      } catch (err) {
        console.error('[Countdown] Render-Fehler:', err.message);
      }
    }
  }
}

const INTERVAL_MS = 30_000;
function msUntilNextAlignedTick() {
  const now = Date.now();
  return INTERVAL_MS - (now % INTERVAL_MS);
}

function startCountdownUpdater(client) {
  updateAll(client);
  setTimeout(function tick() {
    updateAll(client);
    setInterval(() => updateAll(client), INTERVAL_MS).unref?.();
  }, msUntilNextAlignedTick());
}

module.exports = { startCountdownUpdater, updateAll };
