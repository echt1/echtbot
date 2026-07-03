const express = require('express');
const path = require('path');
const { EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../utils/database');

const DEFAULT_BANNED_WORDS = [
  'heil hitler','sieg heil','88','nsdap','white power','white supremacy','kkk','ku klux',
  'nigger','nigga','neger','kanake','schlitzauge','chink','spic','wetback','kike','judensau',
  'schwuchtel','faggot','fag','dyke','tranny','transe',
  'hurensohn','wichser','fotze','scheiß türke','scheiß ausländer',
  'allahu akbar','amok lauf',
];

function startDashboard(client) {
  const app  = express();
  const PORT  = process.env.DASHBOARD_PORT || 3000;
  const TOKEN = process.env.DASHBOARD_TOKEN || 'changeme';

  app.use(express.json());

  const auth = (req, res, next) => {
    const t = req.headers['authorization'] || req.query.token;
    if (t !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'),
  }));

  // ── Stats ──────────────────────────────────────────────────────────
  app.get('/api/stats', auth, (req, res) => {
    const bs = db.get('automod').__botstatus || { typ: 'watching', text: '', status: 'online' };
    res.json({
      tag:    client.user?.tag || '–',
      guilds: client.guilds.cache.size,
      users:  client.guilds.cache.reduce((n, g) => n + g.memberCount, 0),
      uptime: process.uptime(),
      botstatus: bs,
    });
  });

  // ── Bot-Status ─────────────────────────────────────────────────────
  const TYPES = { playing: 0, watching: 3, listening: 2, competing: 5 };
  app.post('/api/status', auth, (req, res) => {
    const { typ, text, status } = req.body;
    text
      ? client.user.setPresence({ activities: [{ name: text, type: TYPES[typ] ?? 3 }], status: status || 'online' })
      : client.user.setPresence({ activities: [], status: status || 'online' });
    const cfg = db.get('automod');
    cfg.__botstatus = { typ, text, status: status || 'online' };
    db.set('automod', cfg);
    res.json({ ok: true });
  });

  // ── Guild-Daten ────────────────────────────────────────────────────
  app.get('/api/guilds', auth, (req, res) => {
    const out = {};
    for (const [id, g] of client.guilds.cache) out[id] = { name: g.name, icon: g.iconURL({ size: 64 }) };
    res.json(out);
  });

  app.get('/api/guilds/:gid/channels', auth, (req, res) => {
    const g = client.guilds.cache.get(req.params.gid);
    if (!g) return res.status(404).json({ error: 'Guild not found' });
    res.json(g.channels.cache.filter(c => c.type === ChannelType.GuildText)
      .map(c => ({ id: c.id, name: c.name })).sort((a,b) => a.name.localeCompare(b.name)));
  });

  app.get('/api/guilds/:gid/roles', auth, (req, res) => {
    const g = client.guilds.cache.get(req.params.gid);
    if (!g) return res.status(404).json({ error: 'Guild not found' });
    res.json(g.roles.cache.filter(r => r.name !== '@everyone')
      .map(r => ({ id: r.id, name: r.name })).sort((a,b) => b.position - a.position));
  });

  // ── Automod ────────────────────────────────────────────────────────
  app.get('/api/automod', auth, (req, res) => {
    const data = db.get('automod');
    const out = {};
    for (const [k,v] of Object.entries(data)) if (k !== '__botstatus') out[k] = v;
    res.json(out);
  });

  app.post('/api/automod/:gid', auth, (req, res) => {
    const data = db.get('automod');
    const patch = req.body;
    if (patch.excludedRoles && !Array.isArray(patch.excludedRoles)) delete patch.excludedRoles;
    data[req.params.gid] = { ...(data[req.params.gid] || {}), ...patch };
    db.set('automod', data);
    res.json({ ok: true });
  });

  app.post('/api/automod/:gid/words', auth, (req, res) => {
    const { action, word } = req.body;
    const data = db.get('automod');
    const gid = req.params.gid;
    if (!data[gid]) data[gid] = { bannedWords: [] };
    data[gid].bannedWords = data[gid].bannedWords || [];
    if (action === 'add' && word) {
      const w = word.toLowerCase().trim();
      if (w && !data[gid].bannedWords.includes(w)) data[gid].bannedWords.push(w);
    } else if (action === 'remove' && word) {
      data[gid].bannedWords = data[gid].bannedWords.filter(w => w !== word);
    } else if (action === 'reset') {
      data[gid].bannedWords = [...DEFAULT_BANNED_WORDS];
    }
    db.set('automod', data);
    res.json({ ok: true, words: data[gid].bannedWords });
  });

  // ── Warnings ───────────────────────────────────────────────────────
  app.get('/api/warnings', auth, (req, res) => res.json(db.get('warnings')));
  app.delete('/api/warnings/:gid/:uid', auth, (req, res) => {
    const w = db.get('warnings');
    if (w[req.params.gid]) { delete w[req.params.gid][req.params.uid]; db.set('warnings', w); }
    res.json({ ok: true });
  });

  // ── Tickets ────────────────────────────────────────────────────────
  app.get('/api/tickets', auth, (req, res) => {
    const raw = db.get('tickets');
    const out = {};
    for (const [gId, d] of Object.entries(raw)) {
      out[gId] = { tickets: d.tickets || {}, categoryId: d.categoryId,
        supportRoleId: d.supportRoleId, categories: d.categories || [] };
    }
    res.json(out);
  });

  app.post('/api/tickets/:gid/config', auth, (req, res) => {
    const { categoryId, supportRoleId } = req.body;
    const tickets = db.get('tickets');
    const gid = req.params.gid;
    tickets[gid] = tickets[gid] || { tickets: {}, categories: [] };
    if (categoryId)    tickets[gid].categoryId    = categoryId;
    if (supportRoleId) tickets[gid].supportRoleId = supportRoleId;
    db.set('tickets', tickets);
    res.json({ ok: true });
  });

  app.post('/api/tickets/:gid/categories', auth, (req, res) => {
    const { action, label, prefix, description, emoji, hasForm, formFields } = req.body;
    const tickets = db.get('tickets');
    const gid = req.params.gid;
    tickets[gid] = tickets[gid] || { tickets: {}, categories: [] };
    tickets[gid].categories = tickets[gid].categories || [];
    if (action === 'add' && label && prefix) {
      const p = prefix.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,4);
      if (p) {
        const cleanFields = Array.isArray(formFields)
          ? formFields.filter(f => f && f.label).slice(0, 5).map(f => ({
              label: String(f.label).slice(0, 45),
              style: f.style === 'long' ? 'long' : 'short',
              required: !!f.required,
              placeholder: String(f.placeholder || '').slice(0, 100),
            }))
          : [];
        const newEntry = {
          label, prefix: p, description: description || '', emoji: emoji || '',
          hasForm: !!hasForm, formFields: cleanFields,
        };
        const idx = tickets[gid].categories.findIndex(c => c.prefix === p);
        if (idx !== -1) tickets[gid].categories[idx] = newEntry;
        else tickets[gid].categories.push(newEntry);
      }
    } else if (action === 'remove' && prefix) {
      tickets[gid].categories = tickets[gid].categories.filter(c => c.prefix !== prefix);
    }
    db.set('tickets', tickets);
    res.json({ ok: true, categories: tickets[gid].categories });
  });

  // ── Social ─────────────────────────────────────────────────────────
  app.get('/api/social', auth, (req, res) => res.json(db.get('social')));
  app.post('/api/social/:gid', auth, (req, res) => {
    const { action, platform, handle, channelId, message } = req.body;
    const social = db.get('social');
    const gid = req.params.gid;
    social[gid] = social[gid] || [];
    if (action === 'add' && platform && handle && channelId) {
      social[gid] = social[gid].filter(e => !(e.platform === platform && e.handle === handle));
      social[gid].push({ platform, handle, channelId, message: message || null, lastSeenId: null });
    } else if (action === 'remove' && platform && handle) {
      social[gid] = social[gid].filter(e => !(e.platform === platform && e.handle === handle));
    }
    db.set('social', social);
    res.json({ ok: true });
  });

  app.post('/api/settings/:gid/modlog', auth, (req, res) => {
    const { channelId } = req.body;
    const cfg = db.get('automod');
    const gid = req.params.gid;
    cfg[gid] = cfg[gid] || {};
    if (channelId) cfg[gid].modlogChannelId = channelId;
    else delete cfg[gid].modlogChannelId;
    db.set('automod', cfg);
    res.json({ ok: true });
  });

  // ── Ticket Logs ────────────────────────────────────────────────────────
  app.get('/api/ticketlogs/:gid', auth, async (req, res) => {
    const ticketLogs = db.get('ticketlogs') || {};
    const logs = ticketLogs[req.params.gid] || [];
    // User-Namen auflösen für Übersicht
    const userIds = [...new Set(logs.flatMap(l => [l.userId, l.closedBy, l.claimedBy].filter(Boolean)))];
    const names = {};
    await Promise.all(userIds.map(async id => {
      const u = await client.users.fetch(id).catch(() => null);
      names[id] = u ? (u.globalName || u.username) : id;
    }));
    res.json({ logs, names });
  });

  app.get('/api/ticketlogs/:gid/:ticketId', auth, (req, res) => {
    const ticketLogs = db.get('ticketlogs') || {};
    const logs = ticketLogs[req.params.gid] || [];
    const log = logs.find(l => l.id === req.params.ticketId);
    if (!log) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(log);
  });

  app.delete('/api/ticketlogs/:gid/:ticketId', auth, (req, res) => {
    const ticketLogs = db.get('ticketlogs') || {};
    ticketLogs[req.params.gid] = (ticketLogs[req.params.gid] || []).filter(l => l.id !== req.params.ticketId);
    db.set('ticketlogs', ticketLogs);
    res.json({ ok: true });
  });

  // ── Embed Presets ─────────────────────────────────────────────────────
  app.get('/api/presets', auth, (req, res) => {
    const data = db.get('automod');
    res.json(data.__embedPresets || {});
  });

  app.post('/api/presets', auth, (req, res) => {
    const { name, preset } = req.body;
    if (!name || !preset) return res.status(400).json({ error: 'name und preset erforderlich' });
    const data = db.get('automod');
    data.__embedPresets = data.__embedPresets || {};
    data.__embedPresets[name] = preset;
    db.set('automod', data);
    res.json({ ok: true });
  });

  app.delete('/api/presets/:name', auth, (req, res) => {
    const data = db.get('automod');
    if (data.__embedPresets) {
      delete data.__embedPresets[decodeURIComponent(req.params.name)];
      db.set('automod', data);
    }
    res.json({ ok: true });
  });

  // ── Embed ──────────────────────────────────────────────────────────
  app.post('/api/embed', auth, async (req, res) => {
    const { channelId, messageId, title, description, color, imageUrl, thumbnailUrl, footer, content, timestamp } = req.body;
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch) return res.status(404).json({ error: 'Channel nicht gefunden' });
      const embed = new EmbedBuilder().setColor(parseInt((color||'#5865F2').replace('#',''),16)).setTimestamp();
      if (title)        embed.setTitle(title);
      if (description)  embed.setDescription(description.replace(/\\n/g,'\n'));
      if (imageUrl)     embed.setImage(imageUrl);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      if (footer)       embed.setFooter({ text: footer });
      if (timestamp !== false) embed.setTimestamp();
      if (messageId) {
        // Bestehende Nachricht bearbeiten
        const targetMsg = await ch.messages.fetch(messageId).catch(() => null);
        if (!targetMsg) return res.status(404).json({ error: 'Nachricht nicht gefunden. Stimmt die Message-ID?' });
        await targetMsg.edit({ embeds: [embed] });
      } else {
        await ch.send({ content: content || undefined, embeds: [embed] });
      }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Einstellungen (JoinRole etc.) ─────────────────────────────────────
  app.get('/api/settings/:gid', auth, (req, res) => {
    const cfg = db.get('automod');
    const counting = db.get('counting') || {};
    const gid = req.params.gid;
    res.json({
      joinRoles: cfg[gid]?.joinRoles || (cfg[gid]?.joinRoleId ? [cfg[gid].joinRoleId] : []),
      counting: counting[gid] || { channelId: null, resetOnFail: true },
      modlogChannelId: cfg[gid]?.modlogChannelId || null,
    });
  });

  app.post('/api/settings/:gid/joinroles', auth, (req, res) => {
    const { roles } = req.body;
    const cfg = db.get('automod');
    const gid = req.params.gid;
    cfg[gid] = cfg[gid] || {};
    cfg[gid].joinRoles = Array.isArray(roles) ? roles : [];
    db.set('automod', cfg);
    res.json({ ok: true });
  });

  app.post('/api/settings/:gid/counting', auth, (req, res) => {
    const { channelId, resetOnFail } = req.body;
    const counting = db.get('counting') || {};
    const gid = req.params.gid;
    if (channelId) {
      counting[gid] = { channelId, resetOnFail: resetOnFail !== false, count: counting[gid]?.count || 0, lastUserId: null };
    } else {
      delete counting[gid];
    }
    db.set('counting', counting);
    res.json({ ok: true });
  });

  // ── User-Namen ────────────────────────────────────────────────────────
  app.post('/api/users/bulk', auth, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be array' });
    const result = {};
    await Promise.all(ids.map(async id => {
      const u = await client.users.fetch(id).catch(() => null);
      result[id] = u ? (u.globalName || u.username || id) : id;
    }));
    res.json(result);
  });

  app.listen(PORT, '0.0.0.0', () => console.log(`[Dashboard] Läuft auf Port ${PORT}`));
}

module.exports = { startDashboard };
