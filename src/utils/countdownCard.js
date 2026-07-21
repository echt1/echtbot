// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN CARD - rendert die Countdown-Karte als PNG (500x200) - v2
// ═══════════════════════════════════════════════════════════════════════
// Braucht: npm install @napi-rs/canvas --save
// Optional: Plus Jakarta Sans .ttf-Dateien unter assets/fonts/ (siehe unten)

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
    .filter(cp => cp !== 0xFE0F) // Variation-Selector rausfiltern (Twemoji-Dateinamen haben den nicht)
    .map(cp => cp.toString(16))
    .join('-');
}

// Emoji als Bild laden (Twemoji-CDN) statt als Text-Glyph zu rendern -
// Server-Container haben idR keine Emoji-Schriftart installiert.
async function loadEmojiImage(emoji) {
  if (!emoji) return null;
  try {
    const cp = toCodepoints(emoji);
    const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${cp}.png`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

// Text abschneiden mit "…", falls zu breit fuer die verfuegbare Flaeche
function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.emoji]      leer/undefined = kein Emoji, Titel wird groesser dargestellt
 * @param {string} opts.dateLabel
 * @param {string|number} opts.value
 * @param {string} opts.unitLabel
 * @param {number} opts.percent      0-1
 * @param {string} opts.modeLabel
 */
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
  const hasEmoji = !!emoji;
  const emojiImg = hasEmoji ? await loadEmojiImage(emoji) : null;
  const leftX = 26;
  const leftMaxWidth = W - 220; // Platz bis zur Zahl rechts

  if (emojiImg) {
    ctx.drawImage(emojiImg, leftX, 20, 28, 28);
  }

  // Titel - groesser & hoeher, wenn kein Emoji vorhanden/geladen ist
  const titleY = emojiImg ? 62 : 30;
  const titleSize = emojiImg ? 21 : 30;
  ctx.fillStyle = '#f5ede8';
  ctx.font = `${titleSize}px PJS-ExtraBold, sans-serif`;
  ctx.fillText(truncateToWidth(ctx, title, leftMaxWidth), leftX, titleY);

  // Datum
  ctx.fillStyle = '#9a6a5e';
  ctx.font = '14px PJS-Medium, sans-serif';
  ctx.fillText(dateLabel, leftX, titleY + 32);

  // Grosse Zahl/Zeit rechts
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

  // Fortschrittsbalken
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
