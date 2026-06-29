const db = require('../utils/database');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const cfg = db.get('automod');
    const roleId = cfg[member.guild.id]?.joinRoleId;
    if (!roleId) return;
    const role = member.guild.roles.cache.get(roleId);
    if (!role) return;
    await member.roles.add(role).catch(err => console.error('[JoinRole] Fehler:', err.message));
  },
};
