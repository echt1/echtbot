// ═══════════════════════════════════════════════════════════════════════
// COUNTDOWN CARD - rendert die Countdown-Karte als PNG (500x200)
// ═══════════════════════════════════════════════════════════════════════
// Braucht: npm install @napi-rs/canvas --save
//
// Optional fuer die exakte Schriftart: Plus Jakarta Sans (Bold/ExtraBold/
// SemiBold/Medium) von https://fonts.google.com/specimen/Plus+Jakarta+Sans
// herunterladen und die .ttf-Dateien unter assets/fonts/ ablegen (siehe
// Dateinamen unten). Ohne die Dateien wird einfach eine Standard-Schrift
// verwendet - crasht nicht, sieht nur nicht 1:1 wie dein Design aus.

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
  const tryReg = (file, name) => {
    try { GlobalFonts.registerFromPath(path.join(dir, file), name); }
    catch { /* Datei fehlt - egal, Fallback-Font wird genutzt */ }
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

/**
 * @param {object} opts
 * @param {string} opts.title       z.B. "GTA6"
 * @param {string} opts.emoji       z.B. "📌"
 * @param {string} opts.dateLabel   z.B. "19. November 2026"
 * @param {string|number} opts.value  grosse Zahl/Zeit, z.B. 123 oder "05:12:33"
 * @param {string} opts.unitLabel   z.B. "TAGE" oder "NOCH"
 * @param {number} opts.percent     0-1
 * @param {string} opts.modeLabel   Untere Zeile, z.B. "Alle Tage · 50%"
 */
async function renderCountdownCard({ title, emoji = '📌', dateLabel, value, unitLabel, percent, modeLabel }) {
  ensureFonts();
  const W = 500, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Karten-Form (abgerundet) + alles danach wird daran geclippt
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.clip();

  // Hintergrund-Verlauf (135deg, #120a08 -> #1f0e0a)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#120a08');
  bg.addColorStop(1, '#1f0e0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Radialer Glow oben rechts
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, W * 0.55);
  glow.addColorStop(0, 'rgba(196,74,42,0.16)');
  glow.addColorStop(1, 'rgba(196,74,42,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Emoji (oben links)
  ctx.font = '30px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(emoji, 26, 22);

  // Titel
  ctx.fillStyle = '#f5ede8';
  ctx.font = '21px PJS-ExtraBold, sans-serif';
  ctx.fillText(title, 26, 66);

  // Datum
  ctx.fillStyle = '#9a6a5e';
  ctx.font = '14px PJS-Medium, sans-serif';
  ctx.fillText(dateLabel, 26, 96);

  // Grosse Zahl/Zeit (rechts, Verlaufsfarbe)
  ctx.textAlign = 'right';
  const numGrad = ctx.createLinearGradient(W - 220, 20, W - 26, 90);
  numGrad.addColorStop(0, '#f0a882');
  numGrad.addColorStop(1, '#c44a2a');
  ctx.fillStyle = numGrad;
  const numFontSize = String(value).length > 5 ? 40 : 62;
  ctx.font = `${numFontSize}px PJS-ExtraBold, sans-serif`;
  ctx.fillText(String(value), W - 26, numFontSize === 62 ? 22 : 32);

  // Unit-Label
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

  // Untere Zeile (Modus/Prozent)
  ctx.fillStyle = '#5a3a32';
  ctx.font = '12px PJS-Medium, sans-serif';
  ctx.fillText(modeLabel, 26, 162);

  // Aussenrand
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 20);
  ctx.stroke();

  return canvas.encode('png');
}

module.exports = { renderCountdownCard };
