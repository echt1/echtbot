const nominations = require('../utils/nominations');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild) return;
    await nominations.handleMessageDeleted(message.guild.id, message.id).catch(() => {});
  },
};
