// ═══════════════════════════════════════════════════════════════════════
// REACTION ROLES - Button/Select-basiert (keine echten Emoji-Reaktionen)
// ═══════════════════════════════════════════════════════════════════════
// PORTABEL: braucht nur eine db-Instanz.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

let db = null;
function initDb(dbInstance) { db = dbInstance; }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function getRules(gid) { return (db.get('reactionroles') || {})[gid] || []; }
function saveRules(gid, list) {
  const store = db.get('reactionroles') || {};
  store[gid] = list;
  db.set('reactionroles', store);
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

async function postRule(client, guild, rule) {
  const channel = await guild.channels.fetch(rule.channelId).catch(() => null);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(parseInt((rule.color || '#5865F2').replace('#', ''), 16) || 0x5865f2)
    .setTitle(rule.title || 'Rollen auswählen')
    .setDescription(rule.description || '');

  let components = [];
  if (rule.mode === 'select') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rr|${rule.id}|sel`)
      .setPlaceholder('Rolle(n) wählen...')
      .setMinValues(0)
      .setMaxValues(Math.max(1, rule.options.length))
      .addOptions(rule.options.slice(0, 25).map((o, i) => ({
        label: (o.label || `Option ${i + 1}`).slice(0, 100),
        value: String(i),
        emoji: o.emoji || undefined,
      })));
    components = [new ActionRowBuilder().addComponents(menu)];
  } else {
    const rows = [];
    rule.options.slice(0, 25).forEach((o, i) => {
      const rowIdx = Math.floor(i / 5);
      rows[rowIdx] = rows[rowIdx] || new ActionRowBuilder();
      const btn = new ButtonBuilder()
        .setCustomId(`rr|${rule.id}|${i}`)
        .setLabel((o.label || `Rolle ${i + 1}`).slice(0, 80))
        .setStyle(ButtonStyle[cap(o.style)] || ButtonStyle.Secondary);
      if (o.emoji) btn.setEmoji(o.emoji);
      rows[rowIdx].addComponents(btn);
    });
    components = rows;
  }

  return channel.send({ embeds: [embed], components }).catch(() => null);
}

async function handleInteraction(interaction) {
  const [, ruleId, optRaw] = interaction.customId.split('|');
  const rules = getRules(interaction.guild.id);
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return interaction.reply({ content: '❌ Diese Rollen-Auswahl existiert nicht mehr.', ephemeral: true }).catch(() => {});

  if (interaction.isStringSelectMenu()) {
    await interaction.deferUpdate().catch(() => {});
    const selectedIdx = interaction.values.map(Number);
    for (let i = 0; i < rule.options.length; i++) {
      const roleId = rule.options[i].roleId;
      if (!roleId) continue;
      const has = interaction.member.roles.cache.has(roleId);
      const shouldHave = selectedIdx.includes(i);
      try {
        if (shouldHave && !has) await interaction.member.roles.add(roleId);
        else if (!shouldHave && has) await interaction.member.roles.remove(roleId);
      } catch { /* fehlende Berechtigung o.ae. - ignorieren */ }
    }
    return;
  }

  const idx = Number(optRaw);
  const opt = rule.options[idx];
  if (!opt?.roleId) return interaction.reply({ content: '❌ Für diesen Button ist keine Rolle hinterlegt.', ephemeral: true }).catch(() => {});
  const has = interaction.member.roles.cache.has(opt.roleId);
  try {
    if (has) {
      await interaction.member.roles.remove(opt.roleId);
      await interaction.reply({ content: `➖ Rolle **${opt.label}** entfernt.`, ephemeral: true });
    } else {
      await interaction.member.roles.add(opt.roleId);
      await interaction.reply({ content: `➕ Rolle **${opt.label}** hinzugefügt.`, ephemeral: true });
    }
  } catch (err) {
    interaction.reply({ content: '❌ Konnte die Rolle nicht ändern - hat der Bot eine höhere Rolle als diese?', ephemeral: true }).catch(() => {});
  }
}

module.exports = { initDb, getRules, saveRules, uid, postRule, handleInteraction };
