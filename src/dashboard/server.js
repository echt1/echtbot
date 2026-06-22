const express = require('express');
const path    = require('path');
const db      = require('../utils/database');

function startDashboard(client) {
  const app  = express();
  const PORT = process.env.DASHBOARD_PORT || 3000;
  const TOKEN = process.env.DASHBOARD_TOKEN || 'changeme';

  app.use(express.json());

  // Auth-Middleware für alle /api Routen
  app.use('/api', (req, res, next) => {
    const auth = req.headers['authorization'] || req.query.token;
    if (auth !== TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });

  // Statische Dashboard-Seite
  app.use(express.static(path.join(__dirname, 'public')));

  // ── API: Bot-Übersicht ──────────────────────────────────────────────────────
  app.get('/api/stats', (req, res) => {
    const cfg = db.get('automod');
    const bs  = cfg.__botstatus || { typ: 'watching', text: '/embed | /ticket-setup', status: 'online' };
    res.json({
      tag:      client.user?.tag || '–',
      guilds:   client.guilds.cache.size,
      users:    client.guilds.cache.reduce((n, g) => n + g.memberCount, 0),
      uptime:   process.uptime(),
      botstatus: bs,
    });
  });

  // ── API: Bot-Status setzen ──────────────────────────────────────────────────
  const TYPES = { playing: 0, watching: 3, listening: 2, competing: 5 };
  app.post('/api/status', (req, res) => {
    const { typ, text, status } = req.body;
    if (!typ || !text) return res.status(400).json({ error: 'typ und text erforderlich' });
    client.user.setPresence({
      activities: [{ name: text, type: TYPES[typ] ?? 3 }],
      status: status || 'online',
    });
    const cfg = db.get('automod');
    cfg.__botstatus = { typ, text, status: status || 'online' };
    db.set('automod', cfg);
    res.json({ ok: true });
  });

  // ── API: Automod ────────────────────────────────────────────────────────────
  app.get('/api/automod', (req, res) => {
    const data = db.get('automod');
    // __botstatus rausfiltern
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (k !== '__botstatus') out[k] = v;
    }
    res.json(out);
  });

  app.post('/api/automod/:guildId', (req, res) => {
    const { guildId } = req.params;
    const data = db.get('automod');
    data[guildId] = { ...(data[guildId] || {}), ...req.body };
    db.set('automod', data);
    res.json({ ok: true });
  });

  // ── API: Warnings ───────────────────────────────────────────────────────────
  app.get('/api/warnings', (req, res) => res.json(db.get('warnings')));

  app.delete('/api/warnings/:guildId/:userId', (req, res) => {
    const { guildId, userId } = req.params;
    const w = db.get('warnings');
    if (w[guildId]) {
      delete w[guildId][userId];
      db.set('warnings', w);
    }
    res.json({ ok: true });
  });

  // ── API: Social ─────────────────────────────────────────────────────────────
  app.get('/api/social', (req, res) => res.json(db.get('social')));

  // ── API: Tickets ────────────────────────────────────────────────────────────
  app.get('/api/tickets', (req, res) => {
    const raw = db.get('tickets');
    const out = {};
    for (const [gId, gData] of Object.entries(raw)) {
      out[gId] = gData.tickets || {};
    }
    res.json(out);
  });

  // ── API: Guild-Namen ────────────────────────────────────────────────────────
  app.get('/api/guilds', (req, res) => {
    const guilds = {};
    for (const [id, g] of client.guilds.cache) {
      guilds[id] = { name: g.name, icon: g.iconURL({ size: 64 }) };
    }
    res.json(guilds);
  });

  app.listen(PORT, () => console.log(`[Dashboard] Läuft auf Port ${PORT}`));
}

module.exports = { startDashboard };
