require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const db = require('../utils/database');

const commandsPath = path.join(__dirname, '..', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

const commands = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registriere ${commands.length} Slash Commands...`);

    if (process.env.GUILD_ID) {
      // Custom Commands aus dem Dashboard einsammeln, damit der Bulk-Overwrite
      // sie NICHT löscht (Discord ersetzt bei PUT die komplette Command-Liste!)
      const customStore  = db.get('customcommands') || {};
      const guildCustom  = (customStore[process.env.GUILD_ID] || []).filter(c => c.type === 'slash');
      const customBodies = guildCustom.map(c => ({
        name: (c.name || 'cmd').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32) || 'cmd',
        description: (c.description || 'Custom Command').slice(0, 100),
        options: (c.options || []).map(opt => ({
          name: opt.name.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32) || 'option',
          description: (opt.description || opt.name || 'option').slice(0, 100),
          type: { text: 3, number: 10, user: 6, channel: 7, role: 8, boolean: 5 }[opt.type] || 3,
          required: !!opt.required,
        })),
      }));

      // Sofort sichtbar, nur in diesem Server - empfohlen für Entwicklung
      const result = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [...commands, ...customBodies] }
      );

      // Bulk-Put vergibt neue Discord-IDs -> in der DB aktualisieren
      if (guildCustom.length) {
        const byName = Object.fromEntries(result.map(r => [r.name, r.id]));
        guildCustom.forEach(c => {
          const n = (c.name || 'cmd').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32) || 'cmd';
          if (byName[n]) c.discordCmdId = byName[n];
        });
        db.set('customcommands', customStore);
      }

      console.log(`Commands für Guild ${process.env.GUILD_ID} registriert (inkl. ${customBodies.length} Custom Command(s)).`);
    } else {
      // Global - dauert bis zu 1h bis Discord sie überall ausrollt
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('Commands global registriert (Ausrollung kann bis zu 1h dauern).');
    }
  } catch (err) {
    console.error('Fehler beim Registrieren der Commands:', err);
  }
})();
