// ═══════════════════════════════════════════════════════════════════════
// BIRTHDAY - Tägliche Geburtstags-Ansage
// ═══════════════════════════════════════════════════════════════════════
const cron = require('node-cron');
let db = null;
function initDb(d) { db = d; }

function setBirthday(gid, userId, month, day) {
  const store = db.get('birthdays') || {};
  store[gid] = store[gid] || {};
  store[gid][userId] = { month, day };
  db.set('birthdays', store);
}
function removeBirthday(gid, userId) {
  const store = db.get('birthdays') || {};
  if (store[gid]) delete store[gid][userId];
  db.set('birthdays', store);
}
function getCfg(gid) { return (db.get('birthdayconfig') || {})[gid] || {}; }
function saveCfg(gid, cfg) { const s = db.get('birthdayconfig') || {}; s[gid] = cfg; db.set('birthdayconfig', s); }

async function checkToday(client) {
  const now = new Date();
  const month = now.getMonth() + 1, day = now.getDate();
  const all = db.get('birthdays') || {};
  const configs = db.get('birthdayconfig') || {};
  for (const gid of Object.keys(all)) {
    const cfg = configs[gid];
    if (!cfg?.channelId) continue;
    const guild = await client.guilds.fetch(gid).catch(() => null);
    if (!guild) continue;
    for (const [userId, bd] of Object.entries(all[gid])) {
      if (bd.month === month && bd.day === day) {
        const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
        if (channel) {
          const text = (cfg.message || '🎂 Alles Gute zum Geburtstag, {user}!').replace('{user}', `<@${userId}>`);
          channel.send(text).catch(() => {});
        }
      }
    }
  }
}

function startBirthdayChecker(client) {
  cron.schedule('0 9 * * *', () => checkToday(client)); // taeglich 9 Uhr Server-Zeit
  console.log('[Birthday] Checker gestartet (täglich 9 Uhr).');
}

module.exports = { initDb, setBirthday, removeBirthday, getCfg, saveCfg, startBirthdayChecker, checkToday };
