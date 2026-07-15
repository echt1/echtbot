// ═══════════════════════════════════════════════════════════════════════
// NOMINATIONS – Anpassbares Nominierungs-/Voting-System
// ═══════════════════════════════════════════════════════════════════════
// PORTABEL: Diese Datei braucht nur zwei Dinge vom Rest des Bots:
//   1. eine "db"-Instanz mit db.get(key) / db.set(key, value)  (siehe database.js)
//   2. Einbindung in interactionCreate.js (customId-Prefix "nom|", siehe unten)
//
// Zum Uebertragen in einen anderen Bot: diese Datei + database.js (falls
// nicht vorhanden) kopieren, in interactionCreate.js den Routing-Block
// einfuegen (siehe interactionCreate-nominations-patch.txt), fertig.
//
// DATENMODELL (in der DB gespeichert):
//   nominationTypes[guildId] = [{
//     id, name, enabled,
//     commandName, commandDescription,
//     args: [{ name, type, description, required }],   // type: text|number|user|channel|role|boolean
//     useModal, modalTitle, modalFields: [{ label, style, required, placeholder }],
//     embed: { title, description, color, footer },     // Platzhalter: {submitter} {arg:x} {modal:label} {yes} {no} {total}
//     yesLabel, yesStyle, yesEmoji, noLabel, noStyle, noEmoji,
//     reviewRequired, reviewChannelId, reviewRoleId,
//     voteChannelId,
//     thresholdMode: 'count' | 'percentVotes' | 'percentMembers' | 'percentRole',
//     thresholdCount, thresholdPercent, thresholdRoleId,
//     durationHours,   // leer/0 = laeuft nur im count-Modus per Schwelle sofort ab, kein Timer
//   }]
//   nominations[guildId] = [{
//     id, typeId, submitterId, args: {}, modalData: {},
//     status: 'pending_review' | 'voting' | 'approved' | 'rejected',
//     messageId, channelId,
//     votes: { userId: 'yes'|'no' },
//     createdAt, votingEndsAt, resolvedAt, resolvedBy, overridden,
//   }]
// ═══════════════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} = require('discord.js');

let db = null;
function initDb(dbInstance) { db = dbInstance; }

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function getTypes(guildId) { return (db.get('nominationTypes') || {})[guildId] || []; }
function saveTypes(guildId, list) {
  const store = db.get('nominationTypes') || {};
  store[guildId] = list;
  db.set('nominationTypes', store);
}
function getNoms(guildId) { return (db.get('nominations') || {})[guildId] || []; }
function saveNoms(guildId, list) {
  const store = db.get('nominations') || {};
  store[guildId] = list;
  db.set('nominations', store);
}

// ── Platzhalter im Embed ersetzen ───────────────────────────────────────
function fillTemplate(str, nom, type, extra = {}) {
  if (!str) return str;
  let out = String(str);
  out = out.replace(/\{submitter\}/g, `<@${nom.submitterId}>`);
  out = out.replace(/\{arg:([a-zA-Z0-9_]+)\}/g, (_, n) => {
    const v = nom.args?.[n];
    return v === undefined || v === null ? '' : String(v);
  });
  out = out.replace(/\{modal:([a-zA-Z0-9_]+)\}/g, (_, n) => {
    const v = nom.modalData?.[n];
    return v === undefined || v === null ? '' : String(v);
  });
  const yes = Object.values(nom.votes || {}).filter(v => v === 'yes').length;
  const no = Object.values(nom.votes || {}).filter(v => v === 'no').length;
  out = out.replace(/\{yes\}/g, yes).replace(/\{no\}/g, no).replace(/\{total\}/g, yes + no);
  for (const [k, v] of Object.entries(extra)) out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  return out;
}

function buildNomEmbed(nom, type, statusOverride) {
  const yes = Object.values(nom.votes || {}).filter(v => v === 'yes').length;
  const no = Object.values(nom.votes || {}).filter(v => v === 'no').length;
  const embed = new EmbedBuilder()
    .setColor(parseInt((type.embed?.color || '#5865F2').replace('#', ''), 16) || 0x5865f2)
    .setTitle(fillTemplate(type.embed?.title, nom, type) || type.name)
    .setDescription(fillTemplate(type.embed?.description, nom, type)?.replace(/\\n/g, '\n') || null);
  if (type.embed?.footer) embed.setFooter({ text: fillTemplate(type.embed.footer, nom, type) });
  embed.addFields({ name: 'Stimmen', value: `✅ ${yes}   ❌ ${no}`, inline: true });
  const status = statusOverride || nom.status;
  const statusText = { pending_review: '🕓 Wartet auf Review', voting: '🗳️ Abstimmung läuft',
    approved: '✅ Angenommen', rejected: '❌ Abgelehnt' }[status] || status;
  embed.addFields({ name: 'Status', value: statusText, inline: true });
  return embed;
}

function buildVoteRow(nom, type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nom|vote|yes|${nom.id}`)
      .setLabel(type.yesLabel || 'Ja').setStyle(ButtonStyle[cap(type.yesStyle) || 'Success'])
      .setEmoji(type.yesEmoji || '✅'),
    new ButtonBuilder().setCustomId(`nom|vote|no|${nom.id}`)
      .setLabel(type.noLabel || 'Nein').setStyle(ButtonStyle[cap(type.noStyle) || 'Danger'])
      .setEmoji(type.noEmoji || '❌'),
  );
}
function buildReviewRow(nom) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nom|review|approve|${nom.id}`).setLabel('Freigeben').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`nom|review|deny|${nom.id}`).setLabel('Ablehnen').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );
}
function buildOverrideRow(nom) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nom|override|${nom.id}`).setLabel('Entscheidung ändern').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
  );
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── Slash-Command Registrierung (pro Guild, ueberschreibt andere Commands NICHT) ──
async function registerNominationCommand(client, guildId, type) {
  if (!process.env.CLIENT_ID) return null;
  const { REST, Routes } = require('discord.js');
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const name = (type.commandName || 'nominieren').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32) || 'nominieren';
  const body = {
    name,
    description: (type.commandDescription || 'Jemanden nominieren').slice(0, 100),
    default_member_permissions: undefined, // Standard: jeder kann einreichen; Feineinstellung via Discord-Integrationen
    options: (type.args || []).map(a => ({
      name: a.name.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 32) || 'option',
      description: (a.description || a.name || 'option').slice(0, 100),
      type: { text: 3, number: 10, user: 6, channel: 7, role: 8, boolean: 5 }[a.type] || 3,
      required: !!a.required,
    })),
  };
  try {
    if (type.discordCmdId) {
      try {
        const r = await rest.patch(Routes.applicationGuildCommand(process.env.CLIENT_ID, guildId, type.discordCmdId), { body });
        return r.id;
      } catch (err) {
        if (err.code === 10063 || err.status === 404) {
          const r = await rest.post(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body });
          return r.id;
        }
        throw err;
      }
    }
    const r = await rest.post(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body });
    return r.id;
  } catch (err) {
    console.error('[Nominations] Discord API Fehler:', err.message);
    return null;
  }
}

// ── Nominierung erstellen & posten ──────────────────────────────────────
async function postNomination(client, guild, type, nom) {
  const status = type.reviewRequired ? 'pending_review' : 'voting';
  nom.status = status;
  const channelId = status === 'pending_review' ? type.reviewChannelId : type.voteChannelId;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel) return null;

  const embed = buildNomEmbed(nom, type);
  const row = status === 'pending_review' ? buildReviewRow(nom) : buildVoteRow(nom, type);
  const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return null;

  nom.messageId = msg.id;
  nom.channelId = channel.id;
  if (status === 'voting' && type.durationHours && type.thresholdMode !== 'count') {
    nom.votingEndsAt = Date.now() + Number(type.durationHours) * 3600_000;
  }
  return nom;
}

async function moveToVoting(client, guild, type, nom) {
  nom.status = 'voting';
  const channel = type.voteChannelId ? await guild.channels.fetch(type.voteChannelId).catch(() => null) : null;
  if (!channel) return;
  const embed = buildNomEmbed(nom, type);
  const row = buildVoteRow(nom, type);
  const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (msg) { nom.messageId = msg.id; nom.channelId = channel.id; }
  if (type.durationHours && type.thresholdMode !== 'count') {
    nom.votingEndsAt = Date.now() + Number(type.durationHours) * 3600_000;
  }
}

// ── Schwelle pruefen ─────────────────────────────────────────────────────
async function checkThreshold(guild, type, nom) {
  const yes = Object.values(nom.votes || {}).filter(v => v === 'yes').length;
  const no = Object.values(nom.votes || {}).filter(v => v === 'no').length;
  if (type.thresholdMode === 'count') {
    return yes >= (Number(type.thresholdCount) || 5) ? 'approved' : null;
  }
  // Prozent-Modi werden nur bei Ablauf der Frist final geprueft (siehe checkExpired),
  // hier nur fuer sofortige Vorab-Erkennung falls Basis klein genug schon erreicht ist.
  let base = 0;
  if (type.thresholdMode === 'percentVotes') base = yes + no;
  else if (type.thresholdMode === 'percentMembers') base = guild.memberCount;
  else if (type.thresholdMode === 'percentRole' && type.thresholdRoleId) {
    const role = await guild.roles.fetch(type.thresholdRoleId).catch(() => null);
    base = role?.members?.size || 0;
  }
  if (base > 0 && (yes / base) * 100 >= (Number(type.thresholdPercent) || 50)) return 'approved';
  return null;
}

async function resolveNomination(client, guild, type, nom, outcome, resolvedBy) {
  nom.status = outcome;
  nom.resolvedAt = Date.now();
  nom.resolvedBy = resolvedBy || null;
  const channel = await guild.channels.fetch(nom.channelId).catch(() => null);
  const msg = channel ? await channel.messages.fetch(nom.messageId).catch(() => null) : null;
  const embed = buildNomEmbed(nom, type, outcome);
  if (msg) await msg.edit({ embeds: [embed], components: [buildOverrideRow(nom)] }).catch(() => {});
}

// ── Periodischer Check fuer abgelaufene Abstimmungen ─────────────────────
function startExpiryChecker(client) {
  setInterval(async () => {
    const allNoms = db.get('nominations') || {};
    const allTypes = db.get('nominationTypes') || {};
    for (const guildId of Object.keys(allNoms)) {
      const list = allNoms[guildId];
      const types = allTypes[guildId] || [];
      let changed = false;
      for (const nom of list) {
        if (nom.status !== 'voting' || !nom.votingEndsAt || nom.votingEndsAt > Date.now()) continue;
        const type = types.find(t => t.id === nom.typeId);
        if (!type) continue;
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;
        const passed = await checkThreshold(guild, type, nom);
        await resolveNomination(client, guild, type, nom, passed || 'rejected');
        changed = true;
      }
      if (changed) saveNoms(guildId, list);
    }
  }, 60_000).unref?.();
}

// ═══════════════════════════════════════════════════════════════════════
// EINSTIEGSPUNKTE (aus interactionCreate.js aufgerufen)
// ═══════════════════════════════════════════════════════════════════════

async function handleSlashCommand(interaction) {
  if (!interaction.guild) return false;
  const types = getTypes(interaction.guild.id);
  const name = interaction.commandName;
  const type = types.find(t => t.enabled !== false &&
    (t.commandName || 'nominieren').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32) === name);
  if (!type) return false; // nicht unsere Zustaendigkeit

  const args = {};
  for (const a of type.args || []) {
    switch (a.type) {
      case 'text': args[a.name] = interaction.options.getString(a.name) ?? undefined; break;
      case 'number': args[a.name] = interaction.options.getNumber(a.name) ?? undefined; break;
      case 'user': { const u = interaction.options.getUser(a.name); args[a.name] = u ? `<@${u.id}>` : undefined; break; }
      case 'channel': { const c = interaction.options.getChannel(a.name); args[a.name] = c ? `<#${c.id}>` : undefined; break; }
      case 'role': { const r = interaction.options.getRole(a.name); args[a.name] = r ? `<@&${r.id}>` : undefined; break; }
      case 'boolean': args[a.name] = interaction.options.getBoolean(a.name) ?? undefined; break;
    }
  }

  if (type.useModal && type.modalFields?.length) {
    // Args zwischenspeichern, bis das Modal abgeschickt wird
    const pendingId = uid();
    global.__nomPending = global.__nomPending || new Map();
    global.__nomPending.set(pendingId, { typeId: type.id, submitterId: interaction.user.id, args });
    const modal = new ModalBuilder()
      .setCustomId(`nom|modal|${pendingId}`)
      .setTitle((type.modalTitle || type.name || 'Formular').slice(0, 45))
      .addComponents(...type.modalFields.slice(0, 5).map((f, i) => new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(`f${i}`)
          .setLabel((f.label || `Feld ${i + 1}`).slice(0, 45))
          .setStyle(f.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(f.required !== false)
          .setPlaceholder((f.placeholder || '').slice(0, 100) || undefined),
      )));
    await interaction.showModal(modal);
    return true;
  }

  const nom = { id: uid(), typeId: type.id, submitterId: interaction.user.id, args, modalData: {}, votes: {}, createdAt: Date.now() };
  await postNomination(interaction.client, interaction.guild, type, nom);
  const list = getNoms(interaction.guild.id); list.push(nom); saveNoms(interaction.guild.id, list);
  await interaction.reply({ content: '✅ Deine Einreichung wurde eingereicht!', ephemeral: true }).catch(() => {});
  return true;
}

async function handleModalSubmit(interaction) {
  const [, , pendingId] = interaction.customId.split('|');
  const pendingMap = global.__nomPending;
  const pend = pendingMap?.get(pendingId);
  if (!pend) return interaction.reply({ content: '⌛ Formular abgelaufen, bitte erneut versuchen.', ephemeral: true }).catch(() => {});
  pendingMap.delete(pendingId);

  const types = getTypes(interaction.guild.id);
  const type = types.find(t => t.id === pend.typeId);
  if (!type) return;

  const modalData = {};
  (type.modalFields || []).forEach((f, i) => {
    let val = '';
    try { val = interaction.fields.getTextInputValue(`f${i}`); } catch {}
    const key = (f.saveAs || f.label || `feld${i + 1}`).replace(/[^a-zA-Z0-9_]/g, '');
    modalData[key] = val;
  });

  const nom = { id: uid(), typeId: type.id, submitterId: pend.submitterId, args: pend.args, modalData, votes: {}, createdAt: Date.now() };
  await postNomination(interaction.client, interaction.guild, type, nom);
  const list = getNoms(interaction.guild.id); list.push(nom); saveNoms(interaction.guild.id, list);
  await interaction.reply({ content: '✅ Deine Einreichung wurde eingereicht!', ephemeral: true }).catch(() => {});
}

async function handleButton(interaction) {
  const parts = interaction.customId.split('|');
  const action = parts[1];

  if (action === 'vote') {
    const [, , choice, nomId] = parts;
    const list = getNoms(interaction.guild.id);
    const nom = list.find(n => n.id === nomId);
    if (!nom || nom.status !== 'voting') return interaction.reply({ content: '❌ Diese Abstimmung ist nicht mehr aktiv.', ephemeral: true }).catch(() => {});
    nom.votes = nom.votes || {};
    nom.votes[interaction.user.id] = choice;
    saveNoms(interaction.guild.id, list);

    const types = getTypes(interaction.guild.id);
    const type = types.find(t => t.id === nom.typeId);
    const embed = buildNomEmbed(nom, type);
    await interaction.update({ embeds: [embed] }).catch(() => {});

    if (type?.thresholdMode === 'count') {
      const outcome = await checkThreshold(interaction.guild, type, nom);
      if (outcome) { await resolveNomination(interaction.client, interaction.guild, type, nom, outcome); saveNoms(interaction.guild.id, list); }
    }
    return;
  }

  if (action === 'review') {
    const [, , decision, nomId] = parts;
    const list = getNoms(interaction.guild.id);
    const nom = list.find(n => n.id === nomId);
    if (!nom || nom.status !== 'pending_review') return interaction.reply({ content: '❌ Bereits bearbeitet.', ephemeral: true }).catch(() => {});
    const types = getTypes(interaction.guild.id);
    const type = types.find(t => t.id === nom.typeId);
    if (!type) return;
    if (type.reviewRoleId && !interaction.member.roles.cache.has(type.reviewRoleId)) {
      return interaction.reply({ content: '❌ Du darfst das nicht entscheiden.', ephemeral: true }).catch(() => {});
    }
    await interaction.deferUpdate().catch(() => {});
    if (decision === 'deny') {
      await resolveNomination(interaction.client, interaction.guild, type, nom, 'rejected', interaction.user.id);
    } else {
      await moveToVoting(interaction.client, interaction.guild, type, nom);
    }
    saveNoms(interaction.guild.id, list);
    return;
  }

  if (action === 'override') {
    const nomId = parts[2];
    const list = getNoms(interaction.guild.id);
    const nom = list.find(n => n.id === nomId);
    if (!nom) return;
    const types = getTypes(interaction.guild.id);
    const type = types.find(t => t.id === nom.typeId);
    if (!type) return;
    if (type.reviewRoleId && !interaction.member.roles.cache.has(type.reviewRoleId)) {
      return interaction.reply({ content: '❌ Du darfst das nicht ändern.', ephemeral: true }).catch(() => {});
    }
    const flipped = nom.status === 'approved' ? 'rejected' : 'approved';
    nom.overridden = true;
    await interaction.deferUpdate().catch(() => {});
    await resolveNomination(interaction.client, interaction.guild, type, nom, flipped, interaction.user.id);
    saveNoms(interaction.guild.id, list);
    return;
  }
}

module.exports = {
  initDb, startExpiryChecker, registerNominationCommand,
  handleSlashCommand, handleModalSubmit, handleButton,
  getTypes, saveTypes, getNoms, saveNoms, uid,
};
