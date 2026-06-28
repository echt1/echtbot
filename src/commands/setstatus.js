const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const db = require('../utils/database');

const TYPES = {
  playing:   ActivityType.Playing,
  watching:  ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setstatus')
    .setDescription('Setzt den Bot-Status (Text leer lassen für keinen Status)')
    .addStringOption(opt =>
      opt.setName('online_status').setDescription('Online-Status').setRequired(false)
        .addChoices(
          { name: '🟢 Online',          value: 'online' },
          { name: '🟡 Idle',            value: 'idle'   },
          { name: '🔴 Do Not Disturb',  value: 'dnd'    },
        )
    )
    .addStringOption(opt =>
      opt.setName('typ').setDescription('Aktivitätstyp (nur nötig wenn Text gesetzt)').setRequired(false)
        .addChoices(
          { name: '🎮 Playing',    value: 'playing'   },
          { name: '👀 Watching',   value: 'watching'  },
          { name: '🎧 Listening',  value: 'listening' },
          { name: '🏆 Competing',  value: 'competing' },
        )
    )
    .addStringOption(opt =>
      opt.setName('text').setDescription('Statustext – leer lassen für keinen Aktivitätsstatus').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const typ    = interaction.options.getString('typ')           || 'watching';
    const text   = interaction.options.getString('text')          || null;
    const status = interaction.options.getString('online_status') || 'online';

    if (text) {
      interaction.client.user.setPresence({
        activities: [{ name: text, type: TYPES[typ] }],
        status,
      });
    } else {
      interaction.client.user.setPresence({ activities: [], status });
    }

    // Persistieren
    const cfg = db.get('automod');
    cfg.__botstatus = { typ, text, status };
    db.set('automod', cfg);

    const statusText = text ? `**${typ}** ${text}` : 'kein Aktivitätsstatus';
    await interaction.reply({ content: `✅ Status gesetzt: ${statusText} (${status})`, ephemeral: true });
  },
};
