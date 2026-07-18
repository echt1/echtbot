const starboard = require('../utils/starboard');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    await starboard.handleReaction(reaction, user).catch(err => console.error('[Starboard] Fehler:', err.message));
  },
};
