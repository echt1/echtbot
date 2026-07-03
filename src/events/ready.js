const { ActivityType } = require('discord.js');
const { startSocialChecker } = require('../utils/socialChecker');
const { startGiveawayChecker } = require('../utils/giveawayManager');
const db = require('../utils/database');

const TYPES = {
  playing:   ActivityType.Playing,
  watching:  ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
};

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Eingeloggt als ${client.user.tag}`);

    // Gespeicherten Status laden, sonst Default
    const cfg = db.get('automod');
    const bs  = cfg.__botstatus;

    if (bs && bs.text) {
      client.user.setPresence({
        activities: [{ name: bs.text, type: TYPES[bs.typ] ?? ActivityType.Watching }],
        status: bs.status || 'online',
      });
    } else if (bs && !bs.text) {
      // Leerer Status explizit gesetzt
      client.user.setPresence({ activities: [], status: bs.status || 'online' });
    } else {
      // Kein Status gespeichert → kein Default mehr
      client.user.setPresence({ activities: [], status: 'online' });
    }

    startSocialChecker(client);
    startGiveawayChecker(client);
  },
};
