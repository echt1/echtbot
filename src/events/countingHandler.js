const db = require('../utils/database');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const counting = db.get('counting') || {};
    const cfg = counting[message.guild.id];
    if (!cfg?.channelId || message.channel.id !== cfg.channelId) return;

    const input = message.content.trim();
    const num = parseInt(input, 10);
    const expected = (cfg.count || 0) + 1;

    // Kein gültiger Integer oder Satzanfang?
    if (isNaN(num) || String(num) !== input) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send({ content: `❌ ${message.author} – Hier nur Zahlen bitte! (Nächste Zahl: **${expected}**)` });
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }

    // Doppelt gezählt?
    if (message.author.id === cfg.lastUserId) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send({ content: `❌ ${message.author} – Du kannst nicht zweimal hintereinander zählen!` });
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }

    // Falsche Zahl?
    if (num !== expected) {
      await message.delete().catch(() => {});
      const oldCount = cfg.count || 0;
      if (cfg.resetOnFail) {
        cfg.count = 0;
        cfg.lastUserId = null;
        db.set('counting', counting);
        const warn = await message.channel.send({
          content: `❌ ${message.author} hat **${num}** geschrieben, richtig wäre **${expected}** gewesen. Counting wurde auf 0 zurückgesetzt.`,
        });
        setTimeout(() => warn.delete().catch(() => {}), 8000);
      } else {
        const warn = await message.channel.send({ content: `❌ ${message.author} – Falsche Zahl! Erwartet: **${expected}**` });
        setTimeout(() => warn.delete().catch(() => {}), 5000);
      }
      return;
    }

    // Richtig!
    cfg.count = num;
    cfg.lastUserId = message.author.id;
    db.set('counting', counting);

    // Meilensteine
    if (num % 100 === 0) {
      await message.react('🎉').catch(() => {});
    } else {
      await message.react('✅').catch(() => {});
    }
  },
};
