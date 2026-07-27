// ═══════════════════════════════════════════════════════════════════════
// RANK & LEADERBOARD CARDS
// ═══════════════════════════════════════════════════════════════════════
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
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

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function formatK(n) {
  n = Math.max(0, Math.round(n));
  if (n >= 1000) {
    const v = n / 1000;
    return (Number.isInteger(v) ? v : v.toFixed(1)) + 'k';
  }
  return String(n);
}

async function loadAvatar(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

function drawAvatarCircle(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} [opts.avatarUrl]
 * @param {number} opts.level
 * @param {number|string} opts.rank
 * @param {number} opts.currentXp   XP innerhalb des aktuellen Levels
 * @param {number} opts.neededXp    XP die fuer's naechste Level noetig sind
 * @param {number} opts.progress    0-1
 * @param {{from:string,to:string}} [opts.accentColor]  anpassbare Akzentfarbe
 */
async function renderRankCard({ username, avatarUrl, level, rank, currentXp, neededXp, progress, accentColor }) {
  ensureFonts();
  const W = 700, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  roundRect(ctx, 0, 0, W, H, 18);
  ctx.clip();

  // Basis-Verlauf - Akzentfarbe hier anpassbar (z.B. fuer andere Server/Themes)
  const base = accentColor || { from: '#3a0d0d', to: '#8b1a1a' };
  const bgGrad = ctx.createLinearGradient(0, 0, W, 0);
  bgGrad.addColorStop(0, base.from);
  bgGrad.addColorStop(1, base.to);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, W * 0.6);
  glow.addColorStop(0, 'rgba(255,90,90,0.35)');
  glow.addColorStop(1, 'rgba(255,90,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Fortschritts-Toenung: Hintergrund von links bis zum Fortschrittspunkt
  // dunkler ueberlagert statt eines separaten Balkens
  const progressX = Math.max(0, Math.min(1, progress)) * W;
  if (progressX > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, progressX, H);
  }

  const avatarImg = await loadAvatar(avatarUrl);
  const cx = 100, cy = H / 2, r = 62;
  drawAvatarCircle(ctx, avatarImg, cx, cy, r);

  const textX = 190;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '38px PJS-ExtraBold, sans-serif';
  ctx.fillText(truncateToWidth(ctx, username, W - textX - 130), textX, 78);

  ctx.font = '22px PJS-Bold, sans-serif';
  ctx.fillStyle = '#f2d6d6';
  ctx.fillText(`${formatK(currentXp)} / ${formatK(neededXp)} XP`, textX, 112);

  ctx.fillText(`Rank: ${rank}`, textX, 142);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = '92px PJS-ExtraBold, sans-serif';
  ctx.fillText(String(level), W - 40, H / 2 + 32);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 18);
  ctx.stroke();

  return canvas.encode('png');
}

/**
 * @param {Array<{rank:number, username:string, avatarUrl?:string, level:number}>} entries
 */
async function renderLeaderboardCard(entries) {
  ensureFonts();
  const W = 700, rowH = 92, gap = 10, padTop = 10, padBottom = 10;
  const H = padTop + padBottom + entries.length * rowH + Math.max(0, entries.length - 1) * gap;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H); // transparent zwischen den Zeilen

  const rankColors = {
    1: { text: '#f5c542', from: '#5a3a00', to: '#c76a1a' },
    2: { text: '#e2e2e2', from: '#3a3a3a', to: '#8f8f8f' },
    3: { text: '#d99a5c', from: '#4a2a10', to: '#a4622a' },
  };
  const rankColW = 110;

  let y = padTop;
  for (const e of entries) {
    const special = rankColors[e.rank];
    const fade = Math.min(0.55, Math.max(0, (e.rank - 3) * 0.06)); // ab Rang 4 langsam dunkler

    ctx.save();
    roundRect(ctx, 0, y, W, rowH, rowH / 2);
    ctx.clip();
    const rowGrad = ctx.createLinearGradient(0, 0, W, 0);
    if (special) {
      rowGrad.addColorStop(0, special.from);
      rowGrad.addColorStop(1, special.to);
    } else {
      rowGrad.addColorStop(0, `rgb(${90 - fade * 40},${15 - fade * 10},${15 - fade * 10})`);
      rowGrad.addColorStop(1, `rgb(${150 - fade * 60},${25 - fade * 15},${25 - fade * 15})`);
    }
    ctx.fillStyle = rowGrad;
    ctx.fillRect(0, y, W, rowH);
    ctx.restore();

    // Rang-Nummer: feste Spalte, rechtsbuendig -> kein Verrutschen bei 2-stelligen Raengen
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = special ? special.text : '#ffffff';
    ctx.font = '44px PJS-ExtraBold, sans-serif';
    ctx.fillText(`#${e.rank}`, rankColW - 15, y + rowH / 2 + 2);
    ctx.textAlign = 'left';

    const avatarImg = await loadAvatar(e.avatarUrl);
    const cx = rankColW + 42, cy = y + rowH / 2, r = 32;
    drawAvatarCircle(ctx, avatarImg, cx, cy, r);

    const textX = rankColW + 92;
    ctx.fillStyle = '#ffffff';
    ctx.font = '30px PJS-ExtraBold, sans-serif';
    const label = truncateToWidth(ctx, e.username, W - textX - 150);
    ctx.fillText(label, textX, cy + 1);
    const labelW = ctx.measureText(label).width;

    ctx.font = '26px PJS-Bold, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`LVL: ${e.level}`, textX + labelW + 18, cy + 1);

    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, y + 0.5, W - 1, rowH - 1, rowH / 2);
    ctx.stroke();

    y += rowH + gap;
  }

  return canvas.encode('png');
}

module.exports = { renderRankCard, renderLeaderboardCard };
