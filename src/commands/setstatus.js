const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const db = require('../utils/database');

const TYPES = {
  playing:  ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setstatus')
    .setDescription('Setzt den Bot-Status')
    .addStringOption(opt =>
      opt.setName('typ').setDescription('Aktivitätstyp').setRequired(true)
        .addChoices(
          { name: '🎮 Playing',    value: 'playing'   },
          { name: '👀 Watching',   value: 'watching'  },
          { name: '🎧 Listening',  value: 'listening' },
          { name: '🏆 Competing',  value: 'competing' },
        )
    )
    .addStringOption(opt =>
      opt.setName('text').setDescription('Statustext, z.B. "mit Feuer"').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('online_status').setDescription('Online-Status').setRequired(false)
        .addChoices(
          { name: '🟢 Online',  value: 'online'    },
          { name: '🟡 Idle',    value: 'idle'      },
          { name: '🔴 Do Not Disturb', value: 'dnd' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const typ    = interaction.options.getString('typ');
    const text   = interaction.options.getString('text');
    const status = interaction.options.getString('online_status') || 'online';

    interaction.client.user.setPresence({
      activities: [{ name: text, type: TYPES[typ] }],
      status,
    });

    // Persistieren damit Dashboard den aktuellen Status kennt
    const cfg = db.get('automod'); // automod-Store zweckentfremden als allg. config
    cfg.__botstatus = { typ, text, status };
    db.set('automod', cfg);

    await interaction.reply({ content: `✅ Status gesetzt: **${typ} ${text}** (${status})`, ephemeral: true });
  },
};
