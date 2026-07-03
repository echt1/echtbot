const db = require('../utils/database');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const cfg = db.get('automod');
    const guildCfg = cfg[member.guild.id];
    if (!guildCfg) return;

    // Multi-JoinRoles (inklusive Backward-Compat für altes joinRoleId)
    const roleIds = guildCfg.joinRoles?.length
      ? guildCfg.joinRoles
      : (guildCfg.joinRoleId ? [guildCfg.joinRoleId] : []);

    for (const roleId of roleIds) {
      const role = member.guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(err => console.error('[JoinRole] Fehler:', err.message));
    }
  },
};
