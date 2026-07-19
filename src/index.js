require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { startDashboard } = require('./dashboard/server');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN fehlt in der .env Datei!');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

loadCommands(client);
loadEvents(client);

// Dashboard startet sobald Bot eingeloggt ist
client.once('ready', () => {
  startDashboard(client);

  const nominations = require('./utils/nominations');
  nominations.initDb(require('./utils/database'));
  nominations.startExpiryChecker(client);
 
  const serverStats = require('./utils/serverStats');
  serverStats.initDb(require('./utils/database'));
  serverStats.startStatsUpdater(client);

  const reactionRoles = require('./utils/reactionRoles');
  reactionRoles.initDb(require('./utils/database'));

  const starboard = require('./utils/starboard');
  starboard.initDb(require('./utils/database'));

  const leveling = require('./utils/leveling');
  leveling.initDb(require('./utils/database'));

  const birthday = require('./utils/birthday');
  birthday.initDb(require('./utils/database'));
  birthday.startBirthdayChecker(client);

  const { startCountdownUpdater } = require('./utils/countdownUpdater');
  startCountdownUpdater(client);
});
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

client.login(process.env.DISCORD_TOKEN);
