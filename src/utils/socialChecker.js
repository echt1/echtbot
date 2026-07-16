const cron = require('node-cron');
const { EmbedBuilder, ActivityType } = require('discord.js');
const { XMLParser } = require('fast-xml-parser');
const db = require('../utils/database');

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------- Twitch Token Cache ----------
let twitchToken = null, twitchTokenExpiry = 0;

async function getTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExpiry) return twitchToken;
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const data = await res.json();
  if (!data.access_token) { console.error('[Twitch] Token-Fehler:', data); return null; }
  twitchToken = data.access_token;
  twitchTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return twitchToken;
}

// ---------- YouTube ----------
async function checkYouTube(entry) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${entry.handle}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const latest = parsed?.feed?.entry?.[0] ?? parsed?.feed?.entry;
  if (!latest) return null;
  const videoId = latest['yt:videoId'];
  if (!videoId || videoId === entry.lastSeenId) return null;

  // Kanal-PFP holen
  const channelId = entry.handle;
  let channelIcon = null;
  try {
    const apiUrl = `https://www.youtube.com/channel/${channelId}`;
    const page = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await page.text();
    const match = html.match(/"avatar":\{"thumbnails":\[{"url":"([^"]+)"/);
    if (match) channelIcon = match[1];
  } catch {}

  const authorName = latest.author?.name || entry.handle;
  return {
    id: videoId,
    name: authorName,
    title: latest.title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    channelIcon,
    color: 0xFF0000,
    kind: 'youtube',
    publishedAt: latest.published || null,
  };
}

// ---------- Twitch ----------
async function checkTwitch(entry) {
  const token = await getTwitchToken();
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${entry.handle}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const stream = data.data?.[0];
  if (!stream || stream.id === entry.lastSeenId) return null;
  return {
    id: stream.id, name: stream.user_name, title: stream.title,
    url: `https://twitch.tv/${entry.handle}`,
    thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
    channelIcon: null, color: 0x9146FF, kind: 'twitch', publishedAt: null,
  };
}

// ---------- TikTok ----------
async function checkTikTok(entry) {
  const res = await fetch(`https://rsshub.app/tiktok/user/${entry.handle}`).catch(() => null);
  if (!res?.ok) return null;
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const latest = parsed?.rss?.channel?.item?.[0] ?? parsed?.rss?.channel?.item;
  if (!latest) return null;
  const videoId = latest.guid?.['#text'] || latest.guid || latest.link;
  if (!videoId || videoId === entry.lastSeenId) return null;
  return {
    id: videoId, name: entry.handle, title: latest.title, url: latest.link,
    thumbnail: null, channelIcon: null, color: 0x010101, kind: 'tiktok', publishedAt: null,
  };
}

const CHECKERS = { youtube: checkYouTube, twitch: checkTwitch, tiktok: checkTikTok };

// ---------- Dynamischer Status bei YouTube-Upload ----------
// Speichert: { videoId, until: timestamp }
let uploadStatusActive = null;

function updateUploadStatus(client, result) {
  if (result.kind !== 'youtube') return;

  const durationMs = 3 * 24 * 60 * 60 * 1000; // 3 Tage
  uploadStatusActive = { videoId: result.id, until: Date.now() + durationMs };

  // Status-Rotation starten
  let toggle = false;
  const interval = setInterval(() => {
    if (!uploadStatusActive || Date.now() > uploadStatusActive.until) {
      clearInterval(interval);
      uploadStatusActive = null;
      // Gespeicherten normalen Status wiederherstellen
      const bs = db.get('automod').__botstatus;
      if (bs?.text) {
        client.user.setPresence({ activities: [{ name: bs.text, type: ActivityType[bs.typ.charAt(0).toUpperCase() + bs.typ.slice(1)] ?? ActivityType.Watching }], status: bs.status || 'online' });
      } else {
        client.user.setPresence({ activities: [], status: 'online' });
      }
      return;
    }
    toggle = !toggle;
    const bs = db.get('automod').__botstatus;
    if (bs?.text) {
      // Zwischen Upload-Status und normalem Status rotieren
      if (toggle) {
        client.user.setPresence({ activities: [{ name: 'NEUER UPLOAD!', type: ActivityType.Watching }], status: 'online' });
      } else {
        const typeKey = bs.typ.charAt(0).toUpperCase() + bs.typ.slice(1);
        client.user.setPresence({ activities: [{ name: bs.text, type: ActivityType[typeKey] ?? ActivityType.Watching }], status: bs.status || 'online' });
      }
    } else {
      // Kein Standard-Status gesetzt → NEUER UPLOAD! durchgehend
      client.user.setPresence({ activities: [{ name: 'NEUER UPLOAD!', type: ActivityType.Watching }], status: 'online' });
    }
  }, 15_000); // alle 15 Sekunden wechseln

  // Sofort setzen
  client.user.setPresence({ activities: [{ name: 'NEUER UPLOAD!', type: ActivityType.Watching }], status: 'online' });
}

// ---------- Haupt-Check ----------
async function runCheck(client) {
  const social = db.get('social');
  let changed = false;

  for (const guildId of Object.keys(social)) {
    for (const entry of social[guildId]) {
      try {
        const result = await CHECKERS[entry.platform]?.(entry);
        if (!result) continue;

        entry.lastSeenId = result.id;
        changed = true;

        const channel = await client.channels.fetch(entry.channelId).catch(() => null);
        if (!channel) continue;

        // Embed bauen
        const embed = new EmbedBuilder()
          .setColor(result.color)
          .setTitle(result.title || result.name)
          .setURL(result.url);

        if (result.kind === 'youtube') {
          embed.setAuthor({
            name: `${result.name} hat hochgeladen!`,
            iconURL: result.channelIcon || undefined,
          });
          embed.setImage(result.thumbnail);
          const ts = result.publishedAt ? Math.floor(new Date(result.publishedAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
          embed.setFooter({ text: 'Upload', iconURL: 'https://look.jmgbb.com/images/NyiKLMt5Mw.png' });
          embed.setTimestamp(result.publishedAt ? new Date(result.publishedAt) : new Date());
        } else if (result.kind === 'twitch') {
          embed.setAuthor({ name: `${result.name} ist jetzt live!` });
          embed.setImage(result.thumbnail);
          embed.setTimestamp();
        } else {
          embed.setAuthor({ name: `Neues ${result.kind} Video` });
          embed.setTimestamp();
        }

        const content = entry.message ? entry.message.replace('{name}', result.name) : null;
        await channel.send({ content, embeds: [embed] });

        // Dynamischer Status bei YouTube
        if (result.kind === 'youtube') updateUploadStatus(client, result);

      } catch (err) {
        console.error(`[Social] Fehler bei ${entry.platform}/${entry.handle}:`, err.message);
      }
    }
  }

  if (changed) db.set('social', social);
}

function startSocialChecker(client) {
  cron.schedule('*/5 * * * *', () => runCheck(client));
  setTimeout(() => runCheck(client), 10_000);
  console.log('[Social] Checker gestartet (alle 5 Minuten).');
}

module.exports = { startSocialChecker };
