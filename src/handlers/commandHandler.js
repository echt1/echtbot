const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    if (!command.data || !command.execute) {
      console.warn(`[Commands] Datei ${file} hat kein gültiges data/execute - übersprungen.`);
      continue;
    }
    client.commands.set(command.data.name, command);
  }
  console.log(`[Commands] ${client.commands.size} Commands geladen.`);
}

module.exports = { loadCommands };
