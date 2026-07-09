// ═══════════════════════════════════════════════════════════════════════
// CUSTOM COMMANDS – AUSFÜHRUNGS-ENGINE (Backend)
// ═══════════════════════════════════════════════════════════════════════
// Diese Datei führt die im Dashboard (Custom Commands -> Node-Editor)
// gebauten Command-Graphen (nodes/edges) tatsächlich aus.
//
// Wird aufgerufen aus:
//   - src/events/interactionCreate.js  -> handleSlashCommand(interaction)
//   - src/events/messageCreate.js      -> handleTextTrigger(message)
//   - src/events/interactionCreate.js  -> handleComponentInteraction(interaction)  [NEU einbinden]
//   - src/events/interactionCreate.js  -> handleModalInteraction(interaction)      [NEU einbinden]
//
// Datenformat (kommt 1:1 aus dem Dashboard-Editor, unverändert):
//   cmd = {
//     id, name, description, type: 'slash'|'text', textTriggerMode,
//     options: [{ id, name, type, description, required }],
//     cooldown, enabled,
//     nodes: [{ id, kind:'trigger'|'action'|'condition', type, config:{}, buttons:[], selects:[] }],
//     edges: [{ id, fromNodeId, fromPort, toNodeId }]   // fromPort: out|then|else|btn_N|sel_N
//   }
// ═══════════════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const db = require('./database');

// ── In-Memory State ───────────────────────────────────────────────────
// Cooldowns: "cmdId-userId" -> timestamp
const cooldowns = new Map();
// Laufende Ausführungen, die auf Button/Select/Modal warten: execId -> { cmd, node, ctxData, expires }
const pending = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of pending) if (p.expires < now) pending.delete(id);
}, 60_000).unref?.();

function newExecId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Globale Variablen (persistiert pro Guild) ─────────────────────────
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

// ── Platzhalter ersetzen ───────────────────────────────────────────────
function ph(str, ctx) {
  if (!str) return str;
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

// ── Ziel-Member auflösen (für DM/Kick/Ban/Rollen/Nick/Timeout) ─────────
async function resolveTargetMember(config, ctx) {
  if (config.targetInput) {
    const val = ctx.options[config.targetInput];
    if (val) {
      const id = val.id || val; // GuildMember/User haben .id
      return await ctx.guild.members.fetch(id).catch(() => null);
    }
  }
  return ctx.member;
}

// ── Buttons/Selects zu Components bauen ────────────────────────────────
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

function needsPause(node) {
  return (node.buttons?.length || node.selects?.length) > 0;
}

function registerPending(cmd, node, ctx) {
  const execId = newExecId();
  pending.set(execId, {
    cmdId: cmd.id, guildId: ctx.guild.id, nodeId: node.id,
    ctxData: {
      userId: ctx.user.id, channelId: ctx.channel.id,
      options: ctx.options, vars: ctx.vars,
    },
    expires: Date.now() + 15 * 60_000, // 15 Min gültig
  });
  return execId;
}

// ── Embed bauen ─────────────────────────────────────────────────────────
function buildEmbed(embedCfg, ctx) {
  if (!embedCfg) return null;
  const embed = new EmbedBuilder();
  let has = false;
  if (embedCfg.title) { embed.setTitle(ph(embedCfg.title, ctx).slice(0, 256)); has = true; }
  if (embedCfg.description) { embed.setDescription(ph(embedCfg.description, ctx).replace(/\\n/g, '\n').slice(0, 4096)); has = true; }
  if (embedCfg.footer) { embed.setFooter({ text: ph(embedCfg.footer, ctx).slice(0, 2048) }); has = true; }
  embed.setColor(parseInt((embedCfg.color || '#5865F2').replace('#', ''), 16) || 0x5865f2);
  if (embedCfg.timestamp) embed.setTimestamp();
  return has || embedCfg.timestamp ? embed : embed; // auch leeres Embed erlauben (Farbe reicht manchmal)
}

// ═══════════════════════════════════════════════════════════════════════
// CONDITIONS
// ═══════════════════════════════════════════════════════════════════════
async function evalCondition(node, ctx) {
  const c = node.config || {};
  const t = node.type.replace('condition_', '');
  switch (t) {
    case 'role': {
      if (!c.roleId || !ctx.member) return false;
      const has = ctx.member.roles.cache.has(c.roleId);
      return c.mode === 'hasnt' ? !has : has;
    }
    case 'channel':
      return Array.isArray(c.channelIds) && c.channelIds.includes(ctx.channel.id);
    case 'permission':
      return !!ctx.member?.permissions.has(PermissionFlagsBits[c.permission] ?? 0n);
    case 'chance':
      return Math.random() * 100 < (Number(c.percent) || 50);
    case 'compare': {
      const a = ph(c.valueA, ctx) ?? '';
      const b = ph(c.valueB, ctx) ?? '';
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
      return ctx.user.id === c.userId;
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
        const content = ph(c.content, ctx) || '\u200b';
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        const payload = { content, ephemeral: !!c.ephemeral, components };
        ctx.lastMessage = await sendReply(ctx, payload);
        break;
      }

      case 'reply_embed': {
        const embed = buildEmbed(c.embed, ctx);
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        const payload = { content: c.content ? ph(c.content, ctx) : undefined, embeds: [embed], ephemeral: !!c.ephemeral, components };
        ctx.lastMessage = await sendReply(ctx, payload);
        break;
      }

      case 'random_response': {
        const list = c.responses?.length ? c.responses : ['...'];
        const content = ph(list[Math.floor(Math.random() * list.length)], ctx);
        ctx.lastMessage = await sendReply(ctx, { content, ephemeral: !!c.ephemeral });
        break;
      }

      case 'send_message': {
        const target = c.channelId ? await ctx.guild.channels.fetch(c.channelId).catch(() => null) : ctx.channel;
        if (!target) break;
        const embed = c.embed ? buildEmbed(c.embed, ctx) : null;
        const components = needsPause(node) ? buildComponents(node, ctx.__execIdFor(node)) : [];
        ctx.lastMessage = await target.send({
          content: c.content ? ph(c.content, ctx) : undefined,
          embeds: embed ? [embed] : [],
          components,
        });
        break;
      }

      case 'dm': {
        const member = await resolveTargetMember(c, ctx);
        if (!member) break;
        await member.send({ content: ph(c.content, ctx) || '\u200b' }).catch(() => {});
        break;
      }

      case 'add_role':
      case 'remove_role': {
        if (!c.roleId) break;
        const member = await resolveTargetMember(c, ctx);
        if (!member) break;
        if (node.type === 'add_role') await member.roles.add(c.roleId).catch(() => {});
        else await member.roles.remove(c.roleId).catch(() => {});
        break;
      }

      case 'kick': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.kickable) await member.kick(ph(c.reason, ctx) || 'Custom Command').catch(() => {});
        break;
      }

      case 'ban': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.bannable) await member.ban({ reason: ph(c.reason, ctx) || 'Custom Command' }).catch(() => {});
        break;
      }

      case 'timeout': {
        const member = await resolveTargetMember(c, ctx);
        const ms = (Number(c.durationMinutes) || 10) * 60_000;
        if (member?.moderatable) await member.timeout(ms, ph(c.reason, ctx) || 'Custom Command').catch(() => {});
        break;
      }

      case 'set_nick': {
        const member = await resolveTargetMember(c, ctx);
        if (member?.manageable) await member.setNickname(c.nick ? ph(c.nick, ctx).slice(0, 32) : null).catch(() => {});
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
        const value = ph(c.value, ctx);
        if (c.scope === 'global') setGlobalVar(ctx.guild.id, c.name, value);
        else ctx.vars[c.name] = value;
        break;
      }

      case 'set_status': {
        const TYPES = { playing: 0, watching: 3, listening: 2, competing: 5 };
        const text = ph(c.text, ctx);
        text
          ? ctx.client.user.setPresence({ activities: [{ name: text, type: TYPES[c.statusType] ?? 3 }] })
          : ctx.client.user.setPresence({ activities: [] });
        break;
      }

      case 'react': {
        if (ctx.message && c.emoji) await ctx.message.react(c.emoji).catch(() => {});
        break;
      }

      // ── Neu ──────────────────────────────────────────────────────────
      case 'pin_message': {
        const target = ctx.message || ctx.lastMessage;
        if (target) await target.pin().catch(() => {});
        break;
      }

      case 'create_channel': {
        const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory };
        const created = await ctx.guild.channels.create({
          name: ph(c.name, ctx) || 'neuer-kanal',
          type: typeMap[c.channelType] ?? ChannelType.GuildText,
          parent: c.categoryId || undefined,
        }).catch(() => null);
        if (created && c.saveAs) ctx.vars[c.saveAs] = created.id;
        break;
      }

      case 'delete_channel': {
        const target = c.channelId ? await ctx.guild.channels.fetch(c.channelId).catch(() => null) : ctx.channel;
        if (target) await target.delete().catch(() => {});
        break;
      }

      case 'open_form': {
        // Muss die ERSTE Aktion nach dem Trigger sein (nur bei Slash-Commands).
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
        ctx.__paused = true; // Ausführung pausiert, geht bei Modal-Submit weiter
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
    if (ctx.interactionReplied) {
      return ctx.interaction.followUp(payload).catch(() => null);
    }
    ctx.interactionReplied = true;
    return ctx.interaction.reply(payload).catch(() => null);
  }
  if (ctx.message) {
    const { ephemeral, ...rest } = payload; // ephemeral geht bei normalen Nachrichten nicht
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

  // Für Nodes mit Buttons/Selects brauchen wir eine execId, BEVOR die Nachricht gebaut wird.
  let execIdCache = null;
  ctx.__execIdFor = (n) => {
    if (!execIdCache) execIdCache = registerPending(cmd, n, ctx);
    return execIdCache;
  };

  await runAction(node, ctx);

  if (ctx.__paused) return; // z.B. open_form wartet auf Modal-Submit

  const edge = findEdge(cmd.edges, node.id, 'out');
  if (edge) await runNode(cmd, edge.toNodeId, ctx);
}

function makeCtx({ client, guild, member, user, channel, message, interaction, options }) {
  return {
    client, guild, member, user, channel, message, interaction,
    options: options || {}, vars: {},
    interactionReplied: false, lastMessage: null, __paused: false,
  };
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

// ═══════════════════════════════════════════════════════════════════════
// EINSTIEGSPUNKTE
// ═══════════════════════════════════════════════════════════════════════

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

  // Optionen einsammeln
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

  const ctx = makeCtx({
    client: interaction.client, guild: interaction.guild, member: interaction.member,
    user: interaction.user, channel: interaction.channel, message: null, interaction, options,
  });

  try { await executeCommand(cmd, ctx); }
  catch (err) { console.error('[CustomCommands] Fehler bei Slash-Ausführung:', err); }
}

async function handleTextTrigger(message) {
  if (!message.guild) return;
  const all = db.get('customcommands')[message.guild.id] || [];
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

  const ctx = makeCtx({
    client: message.client, guild: message.guild, member: message.member,
    user: message.author, channel: message.channel, message, interaction: null, options: {},
  });

  try { await executeCommand(cmd, ctx); }
  catch (err) { console.error('[CustomCommands] Fehler bei Text-Trigger:', err); }
}

// Button-Klick / Select-Auswahl aus einer laufenden Custom-Command-Kette
async function handleComponentInteraction(interaction) {
  const [, execId, portRaw] = interaction.customId.split('|');
  const p = pending.get(execId);
  if (!p) return interaction.reply({ content: '⌛ Diese Interaktion ist abgelaufen.', ephemeral: true }).catch(() => {});
  pending.delete(execId);

  const all = db.get('customcommands')[p.guildId] || [];
  const cmd = all.find(c => c.id === p.cmdId);
  if (!cmd) return;

  let port = portRaw;
  if (interaction.isStringSelectMenu()) port = interaction.values[0]; // "sel_N"

  const guild = interaction.guild;
  const member = await guild.members.fetch(p.ctxData.userId).catch(() => null);
  const channel = await guild.channels.fetch(p.ctxData.channelId).catch(() => interaction.channel);

  const ctx = makeCtx({
    client: interaction.client, guild, member, user: member?.user || interaction.user,
    channel, message: null, interaction, options: p.ctxData.options,
  });
  ctx.vars = p.ctxData.vars || {};

  const edge = findEdge(cmd.edges, p.nodeId, port);
  if (!edge) {
    return interaction.reply({ content: '❌ Für diese Aktion ist kein weiterer Schritt verbunden.', ephemeral: true }).catch(() => {});
  }
  try { await runNode(cmd, edge.toNodeId, ctx); }
  catch (err) { console.error('[CustomCommands] Fehler bei Component-Interaktion:', err); }
}

// Modal-Submit (aus "Formular öffnen")
async function handleModalInteraction(interaction) {
  const [, execId] = interaction.customId.split('|');
  const p = pending.get(execId);
  if (!p) return interaction.reply({ content: '⌛ Diese Interaktion ist abgelaufen.', ephemeral: true }).catch(() => {});
  pending.delete(execId);

  const all = db.get('customcommands')[p.guildId] || [];
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

  // Formular-Werte als {input:formFeldName} bzw. {var:formFeldName} verfügbar machen
  (node?.config?.fields || []).forEach((f, i) => {
    let val = '';
    try { val = interaction.fields.getTextInputValue(`f${i}`); } catch { /* optional & leer */ }
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

module.exports = {
  handleSlashCommand,
  handleTextTrigger,
  handleComponentInteraction,
  handleModalInteraction,
};
