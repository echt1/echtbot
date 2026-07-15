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
  ],
  partials: [Partials.Channel],
});

loadCommands(client);
loadEvents(client);

// Dashboard startet sobald Bot eingeloggt ist
client.once('ready', () => {
  startDashboard(client);

  const nominations = require('./utils/nominations');
  nominations.initDb(require('./utils/database'));
  nominations.startExpiryChecker(client);
});

process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

client.login(process.env.DISCORD_TOKEN);
