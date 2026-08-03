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
const fs = require('fs');
const path = require('path');
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const HEALTH_LOG = path.join(LOG_DIR, 'health.log');

function logToFile(line) {
  try { fs.appendFileSync(HEALTH_LOG, `[${new Date().toISOString()}] ${line}\n`); } catch {}
}

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
  logToFile(`UNHANDLED REJECTION: ${err?.stack || err}`);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  logToFile(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
  // NICHT process.exit() aufrufen - Node haette den Prozess sonst eh schon
  // beendet, wir wollen nur sicherstellen, dass es geloggt wird bevor das passiert.
});
process.on('SIGTERM', () => logToFile('SIGTERM empfangen - Prozess wird beendet.'));
process.on('SIGINT', () => logToFile('SIGINT empfangen - Prozess wird beendet.'));
process.on('exit', (code) => logToFile(`Prozess beendet sich mit Exit-Code ${code}.`));

// Alle 60 Sekunden Speicherverbrauch mitschreiben, damit man im Nachhinein
// sehen kann, ob RAM vor einem Neustart konstant hochgelaufen ist
setInterval(() => {
  const mem = process.memoryUsage();
  logToFile(`Memory: rss=${(mem.rss/1024/1024).toFixed(1)}MB heapUsed=${(mem.heapUsed/1024/1024).toFixed(1)}MB heapTotal=${(mem.heapTotal/1024/1024).toFixed(1)}MB external=${(mem.external/1024/1024).toFixed(1)}MB`);
}, 60_000).unref?.();
logToFile('=== Bot-Prozess gestartet ===');

client.login(process.env.DISCORD_TOKEN);
