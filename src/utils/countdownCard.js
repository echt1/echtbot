// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN CARD - rendert die Countdown-Karte als PNG (500x200) - v3
// ═══════════════════════════════════════════════════════════════════════
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const path = require('path');

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
  const tryReg = (file, name) => {
    try { GlobalFonts.registerFromPath(path.join(dir, file), name); }
    catch { /* Datei fehlt - Fallback-Font wird genutzt */ }
  };
  tryReg('PlusJakartaSans-ExtraBold.ttf', 'PJS-ExtraBold');
  tryReg('PlusJakartaSans-Bold.ttf', 'PJS-Bold');
  tryReg('PlusJakartaSans-SemiBold.ttf', 'PJS-SemiBold');
  tryReg('PlusJakartaSans-Medium.ttf', 'PJS-Medium');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function toCodepoints(emoji) {
  return [...emoji]
    .map(c => c.codePointAt(0))
    .filter(cp => cp !== 0xFE0F)
    .map(cp => cp.toString(16))
    .join('-');
}

// Cache: einmal geladene (oder fehlgeschlagene) Emojis nicht bei jedem
// Kartenrender neu vom CDN abrufen - macht's schneller UND zuverlaessiger.
const emojiCache = new Map();
async function loadEmojiImage(emoji) {
  if (!emoji) return null;
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  let img = null;
  try {
    const cp = toCodepoints(emoji);
    const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${cp}.png`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) img = await loadImage(Buffer.from(await res.arrayBuffer()));
    else console.warn(`[CountdownCard] Emoji-CDN antwortete mit ${res.status} für "${emoji}" (${url})`);
  } catch (err) {
    console.warn(`[CountdownCard] Emoji-Bild konnte nicht geladen werden ("${emoji}"):`, err.message);
  }
  emojiCache.set(emoji, img);
  return img;
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

async function renderCountdownCard({ title, emoji, dateLabel, value, unitLabel, percent, modeLabel }) {
  ensureFonts();
  const W = 500, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  roundRect(ctx, 0, 0, W, H, 20);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#120a08');
  bg.addColorStop(1, '#1f0e0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, W * 0.55);
  glow.addColorStop(0, 'rgba(196,74,42,0.16)');
  glow.addColorStop(1, 'rgba(196,74,42,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'top';
  const emojiImg = emoji ? await loadEmojiImage(emoji) : null;
  const leftX = 26;
  const leftMaxWidth = W - 220;

  if (emojiImg) ctx.drawImage(emojiImg, leftX, 20, 28, 28);

  // Titel bleibt IMMER auf derselben Y-Position (egal ob Emoji da ist),
  // nur die Schriftgroesse wird groesser, wenn kein Emoji vorhanden ist.
  const titleY = 62;
  const titleSize = emojiImg ? 21 : 30;
  ctx.fillStyle = '#f5ede8';
  ctx.font = `${titleSize}px PJS-ExtraBold, sans-serif`;
  ctx.fillText(truncateToWidth(ctx, title, leftMaxWidth), leftX, titleY);

  // Datum - ebenfalls fixe Position
  ctx.fillStyle = '#9a6a5e';
  ctx.font = '14px PJS-Medium, sans-serif';
  ctx.fillText(dateLabel, leftX, 94);

  ctx.textAlign = 'right';
  const numGrad = ctx.createLinearGradient(W - 220, 20, W - 26, 90);
  numGrad.addColorStop(0, '#f0a882');
  numGrad.addColorStop(1, '#c44a2a');
  ctx.fillStyle = numGrad;
  const numFontSize = String(value).length > 5 ? 40 : 62;
  ctx.font = `${numFontSize}px PJS-ExtraBold, sans-serif`;
  ctx.fillText(String(value), W - 26, numFontSize === 62 ? 22 : 32);

  ctx.fillStyle = '#5a3a32';
  ctx.font = '12px PJS-SemiBold, sans-serif';
  ctx.fillText(unitLabel.toUpperCase(), W - 26, 92);
  ctx.textAlign = 'left';

  const barX = 26, barY = 140, barW = W - 52, barH = 6;
  ctx.fillStyle = '#3a1a12';
  roundRect(ctx, barX, barY, barW, barH, 3);
  ctx.fill();
  const fillW = Math.max(0, Math.min(1, percent)) * barW;
  if (fillW > 1) {
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, '#c44a2a');
    barGrad.addColorStop(1, '#f0a882');
    ctx.fillStyle = barGrad;
    roundRect(ctx, barX, barY, fillW, barH, 3);
    ctx.fill();
  }

  ctx.fillStyle = '#5a3a32';
  ctx.font = '12px PJS-Medium, sans-serif';
  ctx.fillText(modeLabel, leftX, 162);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 20);
  ctx.stroke();

  return canvas.encode('png');
}

module.exports = { renderCountdownCard };
