require('dotenv').config();
const { REST, Routes } = require('discord.js');

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN und CLIENT_ID müssen gesetzt sein.');
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Lösche alle globalen Slash Commands (inkl. alte Kite-Commands)...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log('✅ Alle globalen Commands gelöscht. Unsere Guild-Commands bleiben erhalten.');
  } catch (err) {
    console.error('Fehler:', err);
  }
})();
