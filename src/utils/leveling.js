// ═══════════════════════════════════════════════════════════════════════
// LEVELING - XP pro Nachricht, Level-Up-Nachrichten, Rollen-Belohnungen
// ═══════════════════════════════════════════════════════════════════════
let db = null;
function initDb(d) { db = d; }

function getCfg(gid) {
  return (db.get('leveling') || {})[gid] || {
    enabled: false, xpMin: 15, xpMax: 25, cooldownSec: 60,
    levelUpChannelId: null, levelUpMessage: '🎉 {user} hat Level **{level}** erreicht!', roleRewards: [],
  };
}
function saveCfg(gid, cfg) { const s = db.get('leveling') || {}; s[gid] = cfg; db.set('leveling', s); }

function getUsers(gid) { return (db.get('levelingusers') || {})[gid] || {}; }
function saveUsers(gid, users) { const s = db.get('levelingusers') || {}; s[gid] = users; db.set('levelingusers', s); }

function levelFromXp(xp) { return Math.floor(0.1 * Math.sqrt(xp)); }

const cooldowns = new Map();

async function handleMessage(message) {
  const cfg = getCfg(message.guild.id);
  if (!cfg.enabled) return;
  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < (cfg.cooldownSec || 60) * 1000) return;
  cooldowns.set(key, now);

  const users = getUsers(message.guild.id);
  users[message.author.id] = users[message.author.id] || { xp: 0, level: 0 };
  const gained = Math.floor(Math.random() * ((cfg.xpMax || 25) - (cfg.xpMin || 15) + 1)) + (cfg.xpMin || 15);
  const oldLevel = levelFromXp(users[message.author.id].xp);
  users[message.author.id].xp += gained;
  const newLevel = levelFromXp(users[message.author.id].xp);
  users[message.author.id].level = newLevel;
  saveUsers(message.guild.id, users);

  if (newLevel > oldLevel) {
    const text = (cfg.levelUpMessage || '🎉 {user} hat Level **{level}** erreicht!')
      .replace('{user}', `${message.author}`).replace('{level}', newLevel);
    const channel = cfg.levelUpChannelId
      ? await message.guild.channels.fetch(cfg.levelUpChannelId).catch(() => null)
      : message.channel;
    if (channel) channel.send(text).catch(() => {});

    const reward = (cfg.roleRewards || []).find(r => r.level === newLevel);
    if (reward) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member?.manageable) member.roles.add(reward.roleId).catch(() => {});
    }
  }
}

function getLeaderboard(gid, limit = 10) {
  const users = getUsers(gid);
  return Object.entries(users).sort((a, b) => b[1].xp - a[1].xp).slice(0, limit).map(([userId, d]) => ({ userId, ...d }));
}
function getRank(gid, userId) {
  const users = getUsers(gid);
  const sorted = Object.entries(users).sort((a, b) => b[1].xp - a[1].xp);
  const idx = sorted.findIndex(([id]) => id === userId);
  return { rank: idx === -1 ? null : idx + 1, data: users[userId] || { xp: 0, level: 0 }, total: sorted.length };
}

module.exports = { initDb, getCfg, saveCfg, handleMessage, getLeaderboard, getRank, levelFromXp };
