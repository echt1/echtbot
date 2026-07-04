const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActivityType } = require('discord.js');
const db = require('./database');

const cooldowns = new Map();

// ── Wert auflösen (Variablen + Inputs) ────────────────────────────────
function resolveValue(val, ctx) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'string') return String(val);
  return val
    .replace(/\{input:([^}]+)\}/g,  (_, k) => ctx.inputs?.[k] ?? '')
    .replace(/\{var:([^}]+)\}/g,    (_, k) => ctx.vars?.[k] ?? '')
    .replace(/\{user\}/g,           `<@${ctx.member.id}>`)
    .replace(/\{username\}/g,       ctx.member.displayName || ctx.member.user?.username || '')
    .replace(/\{server\}/g,         ctx.guild.name)
    .replace(/\{membercount\}/g,    String(ctx.guild.memberCount))
    .replace(/\{channel\}/g,        `<#${ctx.channel.id}>`)
    .replace(/\{date\}/g,           new Date().toLocaleDateString('de-DE'))
    .replace(/\{time\}/g,           new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\\n/g, '\n');
}

// ── Embed bauen ───────────────────────────────────────────────────────
function buildEmbed(cfg, ctx) {
  const embed = new EmbedBuilder();
  if (cfg.color)        embed.setColor(parseInt((cfg.color || '#5865F2').replace('#',''), 16));
  if (cfg.title)        embed.setTitle(resolveValue(cfg.title, ctx).slice(0, 256));
  if (cfg.description)  embed.setDescription(resolveValue(cfg.description, ctx).slice(0, 4096));
  if (cfg.imageUrl)     embed.setImage(cfg.imageUrl);
  if (cfg.thumbnailUrl) embed.setThumbnail(cfg.thumbnailUrl);
  if (cfg.footer)       embed.setFooter({ text: resolveValue(cfg.footer, ctx).slice(0, 2048) });
  if (cfg.timestamp)    embed.setTimestamp();
  return embed;
}

// ── Bedingung auswerten ───────────────────────────────────────────────
function evalCondition(cond, ctx) {
  switch (cond.type) {
    case 'role': {
      const has = ctx.member.roles.cache.has(cond.roleId);
      return cond.mode === 'hasnt' ? !has : has;
    }
    case 'channel':
      return (cond.channelIds || []).includes(ctx.channel.id);
    case 'permission':
      return ctx.member.permissions.has(cond.permission);
    case 'chance':
      return Math.random() * 100 < (Number(cond.percent) || 50);
    case 'compare': {
      const a = resolveValue(cond.valueA, ctx);
      const b = resolveValue(cond.valueB, ctx);
      switch (cond.operator) {
        case '==':       return String(a) === String(b);
        case '!=':       return String(a) !== String(b);
        case '>':        return Number(a) > Number(b);
        case '<':        return Number(a) < Number(b);
        case '>=':       return Number(a) >= Number(b);
        case '<=':       return Number(a) <= Number(b);
        case 'contains': return String(a).toLowerCase().includes(String(b).toLowerCase());
        default:         return false;
      }
    }
    case 'user':
      return ctx.member.id === cond.userId;
    default:
      return false;
  }
}

// ── Aktionen ausführen ────────────────────────────────────────────────
async function executeFlow(blocks, ctx) {
  if (!blocks?.length) return;
  for (const block of blocks) {
    if (ctx._stopped) break;
    await executeBlock(block, ctx);
  }
}

async function executeBlock(block, ctx) {
  if (block.kind === 'condition') {
    const pass = evalCondition(block.condition || {}, ctx);
    await executeFlow(pass ? (block.then || []) : (block.else || []), ctx);
    return;
  }

  const a = block.action || {};
  const sendPayload = (p) => {
    if (!ctx._replied) {
      ctx._replied = true;
      return ctx._reply({ ...p });
    }
    return ctx._followup({ ...p });
  };

  switch (a.type) {
    case 'reply_text': {
      const content = resolveValue(a.content, ctx);
      if (!content) break;
      const payload = { content, ephemeral: !!a.ephemeral };
      if (a.buttons?.length) payload.components = [buildButtonRow(a.buttons, ctx)];
      await sendPayload(payload);
      break;
    }
    case 'reply_embed': {
      const embed = buildEmbed(a.embed || {}, ctx);
      const payload = { embeds: [embed], ephemeral: !!a.ephemeral };
      if (a.content) payload.content = resolveValue(a.content, ctx);
      if (a.buttons?.length) payload.components = [buildButtonRow(a.buttons, ctx)];
      await sendPayload(payload);
      break;
    }
    case 'random_response': {
      const pool = (a.responses || []).filter(Boolean);
      if (!pool.length) break;
      const text = resolveValue(pool[Math.floor(Math.random() * pool.length)], ctx);
      await sendPayload({ content: text, ephemeral: !!a.ephemeral });
      break;
    }
    case 'send_message': {
      const ch = ctx.guild.channels.cache.get(a.channelId);
      if (!ch) break;
      const payload = {};
      if (a.content) payload.content = resolveValue(a.content, ctx);
      if (a.embed)   payload.embeds = [buildEmbed(a.embed, ctx)];
      if (a.buttons?.length) payload.components = [buildButtonRow(a.buttons, ctx)];
      const sent = await ch.send(payload).catch(() => null);
      if (sent) { ctx.sentMessages.push(sent); ctx.vars['_lastSentMessageId'] = sent.id; }
      break;
    }
    case 'dm': {
      const targetMember = a.targetInput
        ? ctx.guild.members.cache.get(ctx.inputs[a.targetInput]) || ctx.member
        : ctx.member;
      if (a.content) await targetMember.user.send(resolveValue(a.content, ctx)).catch(() => {});
      break;
    }
    case 'add_role': {
      const role = ctx.guild.roles.cache.get(a.roleId);
      if (role) await ctx.member.roles.add(role).catch(() => {});
      break;
    }
    case 'remove_role': {
      const role = ctx.guild.roles.cache.get(a.roleId);
      if (role) await ctx.member.roles.remove(role).catch(() => {});
      break;
    }
    case 'kick': {
      const m = a.targetInput ? ctx.guild.members.cache.get(ctx.inputs[a.targetInput]) : ctx.member;
      if (m?.kickable) await m.kick(resolveValue(a.reason, ctx) || 'Custom Command').catch(() => {});
      break;
    }
    case 'ban': {
      const m = a.targetInput ? ctx.guild.members.cache.get(ctx.inputs[a.targetInput]) : ctx.member;
      if (m?.bannable) await m.ban({ reason: resolveValue(a.reason, ctx) || 'Custom Command' }).catch(() => {});
      break;
    }
    case 'timeout': {
      const m = a.targetInput ? ctx.guild.members.cache.get(ctx.inputs[a.targetInput]) : ctx.member;
      const ms = Math.min(Number(a.durationMinutes) || 10, 40320) * 60_000;
      if (m?.moderatable) await m.timeout(ms, resolveValue(a.reason, ctx) || 'Custom Command').catch(() => {});
      break;
    }
    case 'set_nick': {
      const m = a.targetInput ? ctx.guild.members.cache.get(ctx.inputs[a.targetInput]) : ctx.member;
      if (m) await m.setNickname(resolveValue(a.nick, ctx) || null).catch(() => {});
      break;
    }
    case 'delete_message': {
      if (ctx._sourceMessage) await ctx._sourceMessage.delete().catch(() => {});
      break;
    }
    case 'wait': {
      const secs = Math.min(Math.max(Number(a.seconds) || 1, 0), 10);
      await new Promise(r => setTimeout(r, secs * 1000));
      break;
    }
    case 'set_var': {
      const name = a.name;
      const value = resolveValue(a.value, ctx);
      if (a.scope === 'global') {
        const cmds = db.get('customcommands');
        cmds.__globals = cmds.__globals || {};
        cmds.__globals[name] = value;
        db.set('customcommands', cmds);
        ctx.vars[`global:${name}`] = value;
      } else {
        ctx.vars[name] = value;
      }
      break;
    }
    case 'set_status': {
      const typeMap = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing };
      ctx.client.user.setPresence({
        activities: [{ name: resolveValue(a.text, ctx) || '…', type: typeMap[a.statusType] || ActivityType.Watching }],
        status: 'online',
      });
      break;
    }
    case 'react': {
      if (ctx._sourceMessage) await ctx._sourceMessage.react(a.emoji || '✅').catch(() => {});
      break;
    }
  }
}

// ── Button-Zeile bauen ────────────────────────────────────────────────
function buildButtonRow(buttons, ctx) {
  const row = new ActionRowBuilder();
  for (const btn of buttons.slice(0, 5)) {
    const b = new ButtonBuilder()
      .setLabel(resolveValue(btn.label, ctx) || 'Button')
      .setStyle({ primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[btn.style] || ButtonStyle.Secondary);
    if (btn.url) b.setURL(resolveValue(btn.url, ctx)).setStyle(ButtonStyle.Link);
    else         b.setCustomId(`ccbtn_${btn.cmdId || 'none'}_${btn.id || 'none'}`);
    if (btn.emoji) b.setEmoji(btn.emoji);
    row.addComponents(b);
  }
  return row;
}

// ── Cooldown ──────────────────────────────────────────────────────────
function checkCooldown(cmdId, userId, seconds) {
  if (!seconds) return 0;
  const key = `${cmdId}-${userId}`;
  const last = cooldowns.get(key) || 0;
  const remaining = last + seconds * 1000 - Date.now();
  if (remaining > 0) return remaining;
  cooldowns.set(key, Date.now());
  return 0;
}

// ── Context erzeugen ──────────────────────────────────────────────────
function makeCtx(interaction_or_null, message_or_null, inputs = {}) {
  const source = interaction_or_null || message_or_null;
  const cmds = db.get('customcommands');
  const globalVars = cmds.__globals || {};
  const varMap = {};
  for (const [k, v] of Object.entries(globalVars)) varMap[`global:${k}`] = v;

  const ctx = {
    member: source.member,
    guild: source.guild,
    channel: source.channel,
    client: source.client,
    inputs,
    vars: { ...varMap },
    sentMessages: [],
    _replied: false,
    _stopped: false,
    _sourceMessage: message_or_null,
  };

  if (interaction_or_null) {
    ctx._reply    = (p) => interaction_or_null.reply(p);
    ctx._followup = (p) => interaction_or_null.followUp(p);
  } else {
    ctx._reply    = (p) => message_or_null.channel.send(p);
    ctx._followup = (p) => message_or_null.channel.send(p);
  }
  return ctx;
}

// ── Slash Command ─────────────────────────────────────────────────────
async function handleSlashCommand(interaction) {
  const cmds = db.get('customcommands');
  const guildCmds = cmds[interaction.guild.id] || [];
  const cmd = guildCmds.find(c => c.type === 'slash' && c.name === interaction.commandName && c.enabled !== false);
  if (!cmd) return false;

  const remaining = checkCooldown(cmd.id, interaction.user.id, cmd.cooldown);
  if (remaining > 0) {
    await interaction.reply({ content: `⏳ Noch ${Math.ceil(remaining/1000)}s warten.`, ephemeral: true });
    return true;
  }

  const inputs = {};
  for (const opt of (cmd.options || [])) {
    const val = interaction.options.get(opt.name);
    if (val) inputs[opt.name] = val.user?.id || val.member?.id || val.channel?.id || val.role?.id || String(val.value);
  }

  const ctx = makeCtx(interaction, null, inputs);
  try {
    await executeFlow(cmd.flow || [], ctx);
    if (!ctx._replied) await interaction.reply({ content: '✅', ephemeral: true });
  } catch (err) {
    console.error('[CustomCmd] Error:', err.message);
    if (!ctx._replied) await interaction.reply({ content: '❌ Fehler.', ephemeral: true }).catch(() => {});
  }
  return true;
}

// ── Text Trigger ──────────────────────────────────────────────────────
async function handleTextTrigger(message) {
  if (message.author.bot || !message.guild) return;
  const cmds = db.get('customcommands');
  const guildCmds = (cmds[message.guild.id] || []).filter(c => c.enabled !== false);
  const textCmds = guildCmds.filter(c => c.type === 'text');
  if (!textCmds.length) return;

  const lower = message.content.toLowerCase().trim();
  for (const cmd of textCmds) {
    const trigger = cmd.name.toLowerCase().trim();
    let matched = false;
    if (cmd.textTriggerMode === 'exact')      matched = lower === trigger;
    else if (cmd.textTriggerMode === 'startswith') matched = lower.startsWith(trigger);
    else matched = lower.includes(trigger);
    if (!matched) continue;

    const remaining = checkCooldown(cmd.id, message.author.id, cmd.cooldown);
    if (remaining > 0) continue;

    const ctx = makeCtx(null, message, {});
    try { await executeFlow(cmd.flow || [], ctx); }
    catch (err) { console.error('[CustomCmd] Text error:', err.message); }
    break;
  }
}

module.exports = { handleSlashCommand, handleTextTrigger };
