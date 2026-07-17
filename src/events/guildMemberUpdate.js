const db = require('../utils/database');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const rules = (db.get('linkedroles') || {})[newMember.guild.id] || [];
    if (!rules.length) return;
    // Nur reagieren wenn sich Rollen wirklich geaendert haben
    if (oldMember.roles.cache.size === newMember.roles.cache.size &&
        [...oldMember.roles.cache.keys()].every(id => newMember.roles.cache.has(id))) return;

    for (const rule of rules) {
      if (!rule.sourceRoleIds?.length || !rule.targetRoleId) continue;
      const hasSource = rule.sourceRoleIds.some(id => newMember.roles.cache.has(id));
      const hasTarget = newMember.roles.cache.has(rule.targetRoleId);
      try {
        if (hasSource && !hasTarget) await newMember.roles.add(rule.targetRoleId).catch(() => {});
        else if (!hasSource && hasTarget) await newMember.roles.remove(rule.targetRoleId).catch(() => {});
      } catch (err) {
        console.error('[LinkedRoles] Fehler:', err.message);
      }
    }
  },
};
