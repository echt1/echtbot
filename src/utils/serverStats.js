// ═══════════════════════════════════════════════════════════════════════
// SERVER STATS - Voice-Channel-Namen zeigen Live-Statistiken an
// ═══════════════════════════════════════════════════════════════════════
// PORTABEL: braucht nur eine db-Instanz (db.get/db.set).
// Platzhalter im Template: {members} {online} {boosts} {channels} {roles}
// Hinweis: {online} braucht den "Presence Intent" (siehe unten).

let db = null;
function initDb(dbInstance) { db = dbInstance; }

function fillStatsTemplate(str, guild) {
  if (!str) return str;
  const online = guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
  return String(str)
    .replace(/\{members\}/g, guild.memberCount)
    .replace(/\{online\}/g, online)
    .replace(/\{boosts\}/g, guild.premiumSubscriptionCount || 0)
    .replace(/\{channels\}/g, guild.channels.cache.size)
    .replace(/\{roles\}/g, guild.roles.cache.size);
}

async function updateAll(client) {
  const store = db.get('serverstats') || {};
  for (const guildId of Object.keys(store)) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;
    for (const entry of store[guildId] || []) {
      const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
      if (!channel) continue;
      const newName = fillStatsTemplate(entry.template, guild).slice(0, 100);
      if (channel.name !== newName) await channel.setName(newName).catch(err => console.error('[ServerStats] Fehler:', err.message));
    }
  }
}

function startStatsUpdater(client) {
  updateAll(client);
  // Alle 10 Minuten - Discord erlaubt max. 2 Umbenennungen pro Kanal pro 10 Min,
  // haeufiger aktualisieren fuehrt zu Rate-Limits/Fehlern.
  setInterval(() => updateAll(client), 10 * 60_000).unref?.();
}

module.exports = { initDb, startStatsUpdater, updateAll };
