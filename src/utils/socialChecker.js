const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { XMLParser } = require('fast-xml-parser');
const db = require('../utils/database');

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------- Twitch: OAuth Token Cache ----------
let twitchToken = null;
let twitchTokenExpiry = 0;

async function getTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExpiry) return twitchToken;
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    console.error('[Twitch] Konnte kein Token holen:', data);
    return null;
  }
  twitchToken = data.access_token;
  twitchTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return twitchToken;
}

// ---------- YouTube: neuestes Video via offiziellem RSS-Feed ----------
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

  return {
    id: videoId,
    name: latest.author?.name || entry.handle,
    title: latest.title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    color: 0xFF0000,
    kind: 'Neues YouTube-Video',
  };
}

// ---------- Twitch: ist der Kanal gerade live? ----------
async function checkTwitch(entry) {
  const token = await getTwitchToken();
  if (!token) return null;

  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${entry.handle}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const stream = data.data?.[0];
  if (!stream) return null; // nicht live
  if (stream.id === entry.lastSeenId) return null; // schon gemeldet

  return {
    id: stream.id,
    name: stream.user_name,
    title: stream.title,
    url: `https://twitch.tv/${entry.handle}`,
    thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
    color: 0x9146FF,
    kind: '🔴 Ist jetzt live auf Twitch',
  };
}

// ---------- TikTok: über RSSHub-Bridge (inoffiziell, kann instabil sein) ----------
async function checkTikTok(entry) {
  const url = `https://rsshub.app/tiktok/user/${entry.handle}`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  const latest = parsed?.rss?.channel?.item?.[0] ?? parsed?.rss?.channel?.item;
  if (!latest) return null;

  const videoId = latest.guid?.['#text'] || latest.guid || latest.link;
  if (!videoId || videoId === entry.lastSeenId) return null;

  return {
    id: videoId,
    name: entry.handle,
    title: latest.title,
    url: latest.link,
    thumbnail: null,
    color: 0x000000,
    kind: 'Neues TikTok-Video',
  };
}

const CHECKERS = { youtube: checkYouTube, twitch: checkTwitch, tiktok: checkTikTok };

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

        const embed = new EmbedBuilder()
          .setColor(result.color)
          .setAuthor({ name: result.kind })
          .setTitle(result.title || result.name)
          .setURL(result.url)
          .setTimestamp();
        if (result.thumbnail) embed.setImage(result.thumbnail);

        const content = entry.message ? entry.message.replace('{name}', result.name) : null;
        await channel.send({ content, embeds: [embed] });
      } catch (err) {
        console.error(`[Social] Fehler bei ${entry.platform}/${entry.handle}:`, err.message);
      }
    }
  }

  if (changed) db.set('social', social);
}

function startSocialChecker(client) {
  // Alle 5 Minuten prüfen - reicht für YouTube/TikTok locker, Twitch live-status ist auch ok damit
  cron.schedule('*/5 * * * *', () => runCheck(client));
  // Einmal kurz nach Start auch direkt prüfen
  setTimeout(() => runCheck(client), 10_000);
  console.log('[Social] Checker gestartet (alle 5 Minuten).');
}

module.exports = { startSocialChecker };
