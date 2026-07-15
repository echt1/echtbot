// ═══════════════════════════════════════════════════════════════════════
// CUSTOM COMMANDS – AUSFÜHRUNGS-ENGINE (Backend) – v4
// ═══════════════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const db = require('./database');

const cooldowns = new Map();
const pending = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of pending) if (p.expires < now) pending.delete(id);
}, 60_000).unref?.();

function newExecId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getGlobalVar(guildId, name) {
  const store = db.get('ccvars') || {};
  return store[guildId]?.[name];
}
function setGlobalVar(guildId, name, value) {
  const store = db.get('ccvars') || {};
  store[guildId] = store[guildId] || {};
  store[guildId][name] = value;
  db.set('ccvars', store);
}
function deleteGlobalVar(guildId, name) {
  const store = db.get('ccvars') || {};
  if (store[guildId]) delete store[guildId][name];
  db.set('ccvars', store);
}

function ph(str, ctx) {
  if (str === undefined || str === null) return str;
  return String(str)
    .replace(/\{user\}/g, ctx.member ? `${ctx.member}` : `<@${ctx.user.id}>`)
    .replace(/\{username\}/g, ctx.user.username)
    .replace(/\{server\}/g, ctx.guild?.name || '')
    .replace(/\{channel\}/g, ctx.channel ? `${ctx.channel}` : '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('de-DE'))
    .replace(/\{input:([a-zA-Z0-9_]+)\}/g, (_, name) => {
      const v = ctx.options[name];
      if (v === undefined || v === null) return '';
      return v.id ? v.id : String(v);
    })
    .replace(/\{var:([a-zA-Z0-9_]+)\}/g, (_, name) => {
      if (ctx.vars[name] !== undefined) return String(ctx.vars[name]);
      const g = getGlobalVar(ctx.guild.id, name);
      return g === undefined ? '' : String(g);
    });
}
function phText(str, ctx) {
  if (str === undefined || str === null) return str;
  return String(str)
    .replace(/\{user\}/g, ctx.member ? `${ctx.member}` : `<@${ctx.user.id}>`)
    .replace(/\{username\}/g, ctx.user.username)
    .replace(/\{server\}/g, ctx.guild?.name || '')
    .replace(/\{channel\}/g, ctx.channel ? `${ctx.channel}` : '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('de-DE'))
    .replace(/\{input:([a-zA-Z0-9_]+)\}/g, (_, name) => {
      const v = ctx.options[name];
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/\{var:([a-zA-Z0-9_]+)\}/g, (_, name) => {
      if (ctx.vars[name] !== undefined) return String(ctx.vars[name]);
      const g = getGlobalVar(ctx.guild.id, name);
      return g === undefined ? '' : String(g);
    });
}

function getDef(nodes, id) { return nodes.find(n => n.id === id); }
function findEdge(edges, fromNodeId, fromPort) { return edges.find(e => e.fromNodeId === fromNodeId && e.fromPort === fromPort); }

// Nur Zahlen/Operatoren zulassen (Platzhalter wurden vorher schon ersetzt) -
// verhindert, dass ueber {input:x}/{var:x} injizierter Text als Code laeuft.
function safeMath(expr) {
  const cleaned = String(expr).replace(/[^-+*/%().0-9\s]/g, '');
  if (!cleaned.trim()) return NaN;
  try {
    const fn = new Function(`return (${cleaned});`);
    const result = fn();
    return typeof result === 'number' && isFinite(result) ? result : NaN;
  } catch { return NaN; }
}

async function resolveTargetMember(config, ctx) {
  if (config.targetInput) {
    const val = ctx.options[config.targetInput];
    if (val) {
      const id = val.id || val;
      return await ctx.guild.members.fetch(id).catch(() => null);
    }
  }
  return ctx.member;
}

function buildComponents(node, execId) {
  const rows = [];
  if (node.buttons?.length) {
    const styleMap = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
    const row = new ActionRowBuilder();
    node.buttons.slice(0, 5).forEach((b, i) => {
      const btn = new ButtonBuilder()
        .setCustomId(`cc|${execId}|btn_${i}`)
        .setLabel((b.label || 'Button').slice(0, 80))
        .setStyle(styleMap[b.style] || ButtonStyle.Primary);
      if (b.emoji) btn.setEmoji(b.emoji);
      row.addComponents(btn);
    });
    rows.push(row);
  }
  if (node.selects?.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`cc|${execId}|sel`)
      .setPlaceholder('Auswählen...')
      .addOptions(node.selects.slice(0, 25).map((s, i) => ({
        label: (s.label || `Option ${i + 1}`).slice(0, 100),
        value: `sel_${i}`,
        emoji: s.emoji || undefined,
      })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

function needsPause(node) { return (node.buttons?.length || node.selects?.length) > 0; }

function registerPending(cmd, node, ctx) {
  const execId = newExecId();
  pending.set(execId, {
    cmdId: cmd.id, guildId: ctx.guild.id, nodeId: node.id,
    ctxData: { userId: ctx.user.id, channelId: ctx.channel.id, options: ctx.options, vars: ctx.vars },
    expires: Date.now() + 15 * 60_000,
  });
  return execId;
}

function buildEmbed(embedCfg, ctx) {
  if (!embedCfg) return null;
  const embed = new EmbedBuilder();
  if (embedCfg.title) embed.setTitle(phText(embedCfg.title, ctx).slice(0, 256));
  if (embedCfg.description) embed.setDescription(phText(embedCfg.description, ctx).replace(/\\n/g, '\n').slice(0, 4096));
  if (embedCfg.footer) embed.setFooter({ text: phText(embedCfg.footer, ctx).slice(0, 2048) });
  embed.setColor(parseInt((embedCfg.color || '#5865F2').replace('#', ''), 16) || 0x5865f2);
  if (embedCfg.timestamp) embed.setTimestamp();
  return embed;
}

// ═══════════════════════════════════════════════════════════════════════
// CONDITIONS
// ═══════════════════════════════════════════════════════════════════════
async function evalCondition(node, ctx) {
  const c = node.config || {};
  const t = node.type.replace('condition_', '');
  switch (t) {
    case 'role': {
      const roleId = ph(c.roleId, ctx);
      if (!roleId || !ctx.member) return false;
      const has = ctx.member.roles.cache.has(roleId);
      return c.mode === 'hasnt' ? !has : has;
    }
    case 'channel':
      return Array.isArray(c.channelIds) && c.channelIds.includes(ctx.channel.id);
    case 'permission':
      return !!ctx.member?.permissions.has(PermissionFlagsBits[c.permission] ?? 0n);
    case 'chance':
      return Math.random() * 100 < (Number(c.percent) || 50);
    case 'compare': {
      const a = phText(c.valueA, ctx) ?? '';
      const b = phText(c.valueB, ctx) ?? '';
      const na = Number(a), nb = Number(b);
      const numeric = !isNaN(na) && !isNaN(nb) && a.trim() !== '' && b.trim() !== '';
      switch (c.operator) {
        case '==': return numeric ? na === nb : a === b;
        case '!=': return numeric ? na !== nb : a !== b;
        case '>':  return numeric ? na > nb : a > b;
        case '<':  return numeric ? na < nb : a < b;
        case '>=': return numeric ? na >= nb : a >= b;
        case '<=': return numeric ? na <= nb : a <= b;
        case 'contains': return a.includes(b);
        default: return false;
      }
    }
    case 'user':
      return ctx.user.id === ph(c.userId, ctx);
    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════
async function runAction(node, ctx) {
  const c = node.config || {};
  try {
    switch (node.type) {

      case 'reply_text': {
        const content = phText(c.content, ctx) || '\u200b';
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        ctx.lastMessage = await sendReply(ctx, { content, ephemeral: !!c.ephemeral, components });
        if (ctx.lastMessage) ctx.messagesByNode[node.id] = ctx.lastMessage;
        break;
      }
      case 'reply_embed': {
        const embed = buildEmbed(c.embed, ctx);
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        ctx.lastMessage = await sendReply(ctx, { content: c.content ? phText(c.content, ctx) : undefined, embeds: [embed], ephemeral: !!c.ephemeral, components });
        if (ctx.lastMessage) ctx.messagesByNode[node.id] = ctx.lastMessage;
        break;
      }
      case 'random_response': {
        const list = c.responses?.length ? c.responses : ['...'];
        const content = phText(list[Math.floor(Math.random() * list.length)], ctx);
        ctx.lastMessage = await sendReply(ctx, { content, ephemeral: !!c.ephemeral });
        break;
      }
      case 'send_message': {
        const channelId = ph(c.channelId, ctx);
        const target = channelId ? await ctx.guild.channels.fetch(channelId).catch(() => null) : ctx.channel;
        if (!target) break;
        const embed = c.embed ? buildEmbed(c.embed, ctx) : null;
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        ctx.lastMessage = await target.send({ content: c.content ? phText(c.content, ctx) : undefined, embeds: embed ? [embed] : [], components });
        if (ctx.lastMessage) ctx.messagesByNode[node.id] = ctx.lastMessage;
        break;
      }
      case 'edit_message': {
        let targetMsg = null;
        const ref = c.messageRef || '';
        if (ref.startsWith('node:')) {
          targetMsg = ctx.messagesByNode[ref.slice(5)] || null;
        }
        if (!targetMsg) {
          const channelId = ph(c.channelId, ctx) || ctx.channel.id;
          const messageId = ph(ref, ctx) || ph(c.messageId, ctx);
          if (messageId) {
            const chx = await ctx.guild.channels.fetch(channelId).catch(() => null);
            targetMsg = chx ? await chx.messages.fetch(messageId).catch(() => null) : null;
          }
        }
        if (!targetMsg) break;
        const embed = c.embed ? buildEmbed(c.embed, ctx) : null;
        const payload = {};
        if (c.content) payload.content = phText(c.content, ctx);
        if (embed) payload.embeds = [embed];
        await targetMsg.edit(payload).catch(() => {});
        break;
      }
      case 'dm': {
        const member = await resolveTargetMember(c, ctx);
        if (!member) break;
        await member.send({ content: phText(c.content, ctx) || '\u200b' }).catch(() => {});
        break;
      }
      case 'add_role':
      case 'remove_role': {
        const roleId = ph(c.roleId, ctx);
        if (!roleId) break;
        const member = await resolveTargetMember(c, ctx);
        if (!member) break;
        if (node.type === 'add_role') await member.roles.add(roleId).catch(() => {});
        else await member.roles.remove(roleId).catch(() => {});
        break;
      }
      case 'create_role': {
        const role = await ctx.guild.roles.create({
          name: phText(c.name, ctx) || 'Neue Rolle',
          color: c.color ? parseInt(c.color.replace('#', ''), 16) : undefined,
          hoist: !!c.hoist,
          mentionable: !!c.mentionable,
        }).catch(() => null);
        if (role && c.saveAs) ctx.vars[c.saveAs] = role.id;
        break;
      }
      case 'kick': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.kickable) await member.kick(phText(c.reason, ctx) || 'Custom Command').catch(() => {});
        break;
      }
      case 'ban': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.bannable) await member.ban({ reason: phText(c.reason, ctx) || 'Custom Command' }).catch(() => {});
        break;
      }
      case 'unban': {
        const userId = ph(c.userId, ctx);
        if (!userId) break;
        await ctx.guild.bans.remove(userId, phText(c.reason, ctx) || 'Custom Command').catch(() => {});
        break;
      }
      case 'timeout': {
        const member = await resolveTargetMember(c, ctx);
        const ms = (Number(c.durationMinutes) || 10) * 60_000;
        if (member?.moderatable) await member.timeout(ms, phText(c.reason, ctx) || 'Custom Command').catch(() => {});
        break;
      }
      case 'set_nick': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.manageable) await member.setNickname(c.nick ? phText(c.nick, ctx).slice(0, 32) : null).catch(() => {});
        break;
      }
      case 'delete_message': {
        if (ctx.message) await ctx.message.delete().catch(() => {});
        break;
      }
      case 'wait': {
        const secs = Math.max(0, Math.min(10, Number(c.seconds) || 1));
        await new Promise(r => setTimeout(r, secs * 1000));
        break;
      }
      case 'set_var': {
        if (!c.name) break;
        const value = phText(c.value, ctx);
        if (c.scope === 'global') setGlobalVar(ctx.guild.id, c.name, value);
        else ctx.vars[c.name] = value;
        break;
      }
      case 'get_var': {
        if (!c.name) break;
        const value = getGlobalVar(ctx.guild.id, c.name);
        ctx.vars[c.saveAs || c.name] = value === undefined ? '' : value;
        break;
      }
      case 'calculate': {
        if (!c.saveAs) break;
        const expr = phText(c.expression, ctx);
        const result = safeMath(expr);
        const value = isNaN(result) ? '' : result;
        if (c.scope === 'global') setGlobalVar(ctx.guild.id, c.saveAs, value);
        else ctx.vars[c.saveAs] = value;
        break;
      }
      case 'delete_var': {
        if (!c.name) break;
        if (c.scope === 'global') deleteGlobalVar(ctx.guild.id, c.name);
        else delete ctx.vars[c.name];
        break;
      }
      case 'set_status': {
        const TYPES = { playing: 0, watching: 3, listening: 2, competing: 5 };
        const text = phText(c.text, ctx);
        text
          ? ctx.client.user.setPresence({ activities: [{ name: text, type: TYPES[c.statusType] ?? 3 }] })
          : ctx.client.user.setPresence({ activities: [] });
        break;
      }
      case 'react': {
        if (ctx.message && c.emoji) await ctx.message.react(c.emoji).catch(() => {});
        break;
      }
      case 'pin_message': {
        const target = ctx.message || ctx.lastMessage;
        if (target) await target.pin().catch(() => {});
        break;
      }
      case 'create_channel': {
        const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory };
        const categoryId = ph(c.categoryId, ctx);
        const created = await ctx.guild.channels.create({
          name: phText(c.name, ctx) || 'neuer-kanal',
          type: typeMap[c.channelType] ?? ChannelType.GuildText,
          parent: categoryId || undefined,
        }).catch(() => null);
        if (created && c.saveAs) ctx.vars[c.saveAs] = created.id;
        break;
      }
      case 'delete_channel': {
        const channelId = ph(c.channelId, ctx);
        const target = channelId ? await ctx.guild.channels.fetch(channelId).catch(() => null) : ctx.channel;
        if (target) await target.delete().catch(() => {});
        break;
      }
      case 'edit_channel': {
        const channelId = ph(c.channelId, ctx) || ctx.channel.id;
        const target = await ctx.guild.channels.fetch(channelId).catch(() => null);
        if (!target) break;
        const payload = {};
        if (c.name) payload.name = phText(c.name, ctx).slice(0, 100);
        if (c.topic) payload.topic = phText(c.topic, ctx).slice(0, 1024);
        if (c.slowmode !== undefined && c.slowmode !== '') payload.rateLimitPerUser = Math.max(0, Math.min(21600, Number(c.slowmode) || 0));
        if (c.nsfw !== undefined) payload.nsfw = !!c.nsfw;
        if (Object.keys(payload).length) await target.edit(payload).catch(() => {});
        break;
      }
      case 'create_thread': {
        const channelId = ph(c.channelId, ctx) || ctx.channel.id;
        const parent = await ctx.guild.channels.fetch(channelId).catch(() => null);
        if (!parent?.threads) break;
        const thread = await parent.threads.create({
          name: phText(c.name, ctx) || 'neuer-thread',
          autoArchiveDuration: Number(c.autoArchiveMinutes) || 1440,
        }).catch(() => null);
        if (thread && c.saveAs) ctx.vars[c.saveAs] = thread.id;
        break;
      }
      case 'delete_thread': {
        const threadId = ph(c.threadId, ctx);
        if (!threadId) break;
        const thread = await ctx.guild.channels.fetch(threadId).catch(() => null);
        if (thread?.isThread?.()) await thread.delete().catch(() => {});
        break;
      }
      case 'voice_move': {
        const member = await resolveTargetMember(c, ctx);
        const channelId = ph(c.channelId, ctx);
        if (member?.voice?.channel && channelId) await member.voice.setChannel(channelId).catch(() => {});
        break;
      }
      case 'voice_mute': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.voice?.channel) await member.voice.setMute(c.state !== false).catch(() => {});
        break;
      }
      case 'voice_deafen': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.voice?.channel) await member.voice.setDeaf(c.state !== false).catch(() => {});
        break;
      }
      case 'voice_disconnect': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.voice?.channel) await member.voice.disconnect().catch(() => {});
        break;
      }
      case 'create_invite': {
        const channelId = ph(c.channelId, ctx) || ctx.channel.id;
        const target = await ctx.guild.channels.fetch(channelId).catch(() => null);
        if (!target?.createInvite) break;
        const invite = await target.createInvite({
          maxUses: Number(c.maxUses) || 0,
          maxAge: (Number(c.maxAgeMinutes) || 0) * 60,
        }).catch(() => null);
        if (invite && c.saveAs) ctx.vars[c.saveAs] = invite.url;
        break;
      }
      case 'http_request': {
        try {
          const url = phText(c.url, ctx);
          if (!url) break;
          let headers = {};
          if (c.headers) { try { headers = JSON.parse(phText(c.headers, ctx)); } catch {} }
          const opts = { method: c.method || 'GET', headers };
          if (c.body && c.method !== 'GET') opts.body = phText(c.body, ctx);
          const res = await fetch(url, opts);
          const text = await res.text();
          let value = text;
          try { value = JSON.stringify(JSON.parse(text)); } catch {}
          if (c.saveAs) ctx.vars[c.saveAs] = value.slice(0, 3000);
        } catch (err) { console.error('[CustomCommands] HTTP-Request Fehler:', err.message); }
        break;
      }
      case 'open_form': {
        if (!ctx.interaction || ctx.interactionReplied) break;
        const fields = (c.fields || []).slice(0, 5);
        if (!fields.length) break;
        const execId = ctx.__execIdFor(node, true);
        const modal = new ModalBuilder()
          .setCustomId(`cc|${execId}|modal`)
          .setTitle((c.title || 'Formular').slice(0, 45))
          .addComponents(...fields.map((f, i) => new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`f${i}`)
              .setLabel((f.label || `Feld ${i + 1}`).slice(0, 45))
              .setStyle(f.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
              .setRequired(f.required !== false)
              .setPlaceholder((f.placeholder || '').slice(0, 100) || undefined),
          )));
        await ctx.interaction.showModal(modal);
        ctx.interactionReplied = true;
        ctx.__paused = true;
        break;
      }

      default:
        console.warn(`[CustomCommands] Unbekannter Node-Typ: ${node.type}`);
    }
  } catch (err) {
    console.error(`[CustomCommands] Fehler bei Node "${node.type}":`, err.message);
  }
}

async function sendReply(ctx, payload) {
  if (ctx.interaction) {
    if (ctx.interactionReplied) return ctx.interaction.followUp(payload).catch(() => null);
    ctx.interactionReplied = true;
    return ctx.interaction.reply(payload).catch(() => null);
  }
  if (ctx.message) {
    const { ephemeral, ...rest } = payload;
    return ctx.message.reply(rest).catch(() => null);
  }
  if (ctx.channel) {
    const { ephemeral, ...rest } = payload;
    return ctx.channel.send(rest).catch(() => null);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GRAPH-AUSFÜHRUNG
// ═══════════════════════════════════════════════════════════════════════
async function runNode(cmd, nodeId, ctx) {
  const node = getDef(cmd.nodes, nodeId);
  if (!node) return;
  if (node.kind === 'condition') {
    const result = await evalCondition(node, ctx);
    const edge = findEdge(cmd.edges, node.id, result ? 'then' : 'else');
    if (edge) await runNode(cmd, edge.toNodeId, ctx);
    return;
  }
  let execIdCache = null;
  ctx.__execIdFor = (n) => { if (!execIdCache) execIdCache = registerPending(cmd, n, ctx); return execIdCache; };
  await runAction(node, ctx);
  if (ctx.__paused) return;
  const edge = findEdge(cmd.edges, node.id, 'out');
  if (edge) await runNode(cmd, edge.toNodeId, ctx);
}

function makeCtx({ client, guild, member, user, channel, message, interaction, options }) {
  return { client, guild, member, user, channel, message, interaction, options: options || {}, vars: {}, interactionReplied: false, lastMessage: null, messagesByNode: {}, __paused: false };
}

async function executeCommand(cmd, ctx) {
  const trigger = cmd.nodes.find(n => n.kind === 'trigger');
  if (!trigger) return;
  const edge = findEdge(cmd.edges, trigger.id, 'out');
  if (!edge) return;
  await runNode(cmd, edge.toNodeId, ctx);
}

function checkCooldown(cmd, userId) {
  if (!cmd.cooldown) return true;
  const key = `${cmd.id}-${userId}`;
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < cmd.cooldown * 1000) return false;
  cooldowns.set(key, Date.now());
  return true;
}

async function handleSlashCommand(interaction) {
  if (!interaction.guild) return;
  const store = db.get('customcommands') || {};
  const all = store[interaction.guild.id] || [];
  const cmd = all.find(c => c.type === 'slash' && c.enabled !== false &&
    (c.name || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32) === interaction.commandName);
  if (!cmd) return;
  if (!checkCooldown(cmd, interaction.user.id)) {
    return interaction.reply({ content: '⏳ Bitte warte, bevor du diesen Command erneut benutzt.', ephemeral: true }).catch(() => {});
  }
  const options = {};
  for (const opt of cmd.options || []) {
    switch (opt.type) {
      case 'text': options[opt.name] = interaction.options.getString(opt.name) ?? undefined; break;
      case 'number': options[opt.name] = interaction.options.getNumber(opt.name) ?? undefined; break;
      case 'user': options[opt.name] = interaction.options.getMember(opt.name) || interaction.options.getUser(opt.name) || undefined; break;
      case 'channel': options[opt.name] = interaction.options.getChannel(opt.name) ?? undefined; break;
      case 'role': options[opt.name] = interaction.options.getRole(opt.name) ?? undefined; break;
      case 'boolean': options[opt.name] = interaction.options.getBoolean(opt.name) ?? undefined; break;
    }
  }
  const ctx = makeCtx({ client: interaction.client, guild: interaction.guild, member: interaction.member, user: interaction.user, channel: interaction.channel, message: null, interaction, options });
  try { await executeCommand(cmd, ctx); } catch (err) { console.error('[CustomCommands] Fehler bei Slash-Ausführung:', err); }
}

async function handleTextTrigger(message) {
  if (!message.guild) return;
  const store = db.get('customcommands') || {};
  const all = store[message.guild.id] || [];
  const content = message.content;
  const matches = all.filter(c => {
    if (c.type !== 'text' || c.enabled === false) return false;
    const trig = (c.name || '').trim();
    if (!trig) return false;
    if (c.textTriggerMode === 'exact') return content.toLowerCase() === trig.toLowerCase();
    if (c.textTriggerMode === 'startswith') return content.toLowerCase().startsWith(trig.toLowerCase());
    return content.toLowerCase().includes(trig.toLowerCase());
  });
  if (!matches.length) return;
  const cmd = matches[0];
  if (!checkCooldown(cmd, message.author.id)) return;
  const ctx = makeCtx({ client: message.client, guild: message.guild, member: message.member, user: message.author, channel: message.channel, message, interaction: null, options: {} });
  try { await executeCommand(cmd, ctx); } catch (err) { console.error('[CustomCommands] Fehler bei Text-Trigger:', err); }
}

async function handleComponentInteraction(interaction) {
  const [, execId, portRaw] = interaction.customId.split('|');
  const p = pending.get(execId);
  if (!p) return interaction.reply({ content: '⌛ Diese Interaktion ist abgelaufen.', ephemeral: true }).catch(() => {});
  pending.delete(execId);

  const store = db.get('customcommands') || {};
  const all = store[p.guildId] || [];
  const cmd = all.find(c => c.id === p.cmdId);
  if (!cmd) return;

  let port = portRaw;
  if (interaction.isStringSelectMenu()) port = interaction.values[0];

  const edge = findEdge(cmd.edges, p.nodeId, port);
  if (!edge) return interaction.reply({ content: '❌ Für diese Aktion ist kein weiterer Schritt verbunden.', ephemeral: true }).catch(() => {});

  // Sofort bestaetigen, BEVOR die Kette laeuft - sonst laeuft die 3s-Frist
  // ab, falls die Kette nur aus stillen Aktionen besteht.
  await interaction.deferUpdate().catch(() => {});

  const guild = interaction.guild;
  const member = await guild.members.fetch(p.ctxData.userId).catch(() => null);
  const channel = await guild.channels.fetch(p.ctxData.channelId).catch(() => interaction.channel);

  const ctx = makeCtx({
    client: interaction.client, guild, member, user: member?.user || interaction.user,
    channel, message: null, interaction, options: p.ctxData.options,
  });
  ctx.vars = p.ctxData.vars || {};
  ctx.interactionReplied = true; // bereits per deferUpdate bestaetigt -> weitere Antworten laufen ueber followUp

  try { await runNode(cmd, edge.toNodeId, ctx); }
  catch (err) { console.error('[CustomCommands] Fehler bei Component-Interaktion:', err); }
}

async function handleModalInteraction(interaction) {
  const [, execId] = interaction.customId.split('|');
  const p = pending.get(execId);
  if (!p) return interaction.reply({ content: '⌛ Diese Interaktion ist abgelaufen.', ephemeral: true }).catch(() => {});
  pending.delete(execId);

  const store = db.get('customcommands') || {};
  const all = store[p.guildId] || [];
  const cmd = all.find(c => c.id === p.cmdId);
  if (!cmd) return;
  const node = getDef(cmd.nodes, p.nodeId);

  const guild = interaction.guild;
  const member = await guild.members.fetch(p.ctxData.userId).catch(() => null);
  const channel = await guild.channels.fetch(p.ctxData.channelId).catch(() => interaction.channel);

  const ctx = makeCtx({
    client: interaction.client, guild, member, user: member?.user || interaction.user,
    channel, message: null, interaction, options: p.ctxData.options,
  });
  ctx.vars = p.ctxData.vars || {};

  (node?.config?.fields || []).forEach((f, i) => {
    let val = '';
    try { val = interaction.fields.getTextInputValue(`f${i}`); } catch {}
    const key = (f.saveAs || f.label || `feld${i + 1}`).replace(/[^a-zA-Z0-9_]/g, '');
    ctx.options[key] = val;
    ctx.vars[key] = val;
  });

  const edge = findEdge(cmd.edges, p.nodeId, 'out');
  try {
    if (edge) await runNode(cmd, edge.toNodeId, ctx);
    else if (!ctx.interactionReplied) await interaction.reply({ content: '✅ Formular gespeichert.', ephemeral: true }).catch(() => {});
  } catch (err) { console.error('[CustomCommands] Fehler bei Modal-Submit:', err); }
}

module.exports = { handleSlashCommand, handleTextTrigger, handleComponentInteraction, handleModalInteraction };
