// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN UPDATER - selbst-korrigierender Takt (kein Drift ueber Zeit)
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
function scheduleNextTick(client) {
  const delay = INTERVAL_MS - (Date.now() % INTERVAL_MS);
  setTimeout(async () => {
    await updateAll(client).catch(err => console.error('[Countdown] updateAll Fehler:', err.message));
    scheduleNextTick(client);
  }, delay);
}

function startCountdownUpdater(client) {
  updateAll(client).catch(() => {});
  scheduleNextTick(client);
}

module.exports = { startCountdownUpdater, updateAll, computeDisplay };
