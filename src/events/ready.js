const { ActivityType } = require('discord.js');
const { startSocialChecker } = require('../utils/socialChecker');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Eingeloggt als ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: '/embed | /ticket-setup | /automod', type: ActivityType.Watching }],
      status: 'online',
    });

    // Social Media Checker starten (pollt YouTube/Twitch/TikTok periodisch)
    startSocialChecker(client);
  },
};
