/* Petits outils de pixel art partagés par les étiquettes de cartouches
   et les écrans de jeu de la NOVA 16. */

export const FONT_PIXEL = '"Press Start 2P", "Courier New", monospace';
export const FONT_CRT = '"VT323", "Courier New", monospace';

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* Matrice de Bayer 4×4 : le tramage typique des consoles 16 bits. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/* Dégradé « en marches » avec tramage entre chaque marche. */
export function ditherGradient(ctx, x, y, w, h, c1, c2, steps = 6, cell = 1) {
  const bandH = h / steps;
  for (let i = 0; i < steps; i++) {
    const top = Math.floor(y + i * bandH);
    const bot = Math.floor(y + (i + 1) * bandH);
    ctx.fillStyle = mix(c1, c2, i / (steps - 1));
    ctx.fillRect(x, top, w, bot - top);
    if (i < steps - 1) {
      // bande de transition tramée en bas de la marche
      ctx.fillStyle = mix(c1, c2, (i + 1) / (steps - 1));
      const tb = Math.max(2, Math.floor((bot - top) / 2));
      for (let py = bot - tb; py < bot; py += cell) {
        const ty = (py - (bot - tb)) / tb;
        for (let px = x; px < x + w; px += cell) {
          const b = BAYER[((py / cell) & 3) * 4 + ((px / cell) & 3)];
          if (b < ty * 0.9) ctx.fillRect(px, py, cell, cell);
        }
      }
    }
  }
}

/* ---------------------------------------------------------------
   Décors (« motifs ») : utilisés en petit sur l’étiquette et en grand,
   animés, sur l’écran titre. t = temps en secondes.
   --------------------------------------------------------------- */
export function drawMotif(ctx, motif, x, y, w, h, art, t = 0) {
  const [a, b, c] = art;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const u = Math.max(1, Math.round(w / 64)); // taille d’un « pixel » du décor
  switch (motif) {
    case "coucher": {
      ditherGradient(ctx, x, y, w, h * 0.62, a, b, 6, u);
      // soleil à bandes
      const r = h * 0.26, cx = x + w / 2, cy = y + h * 0.6 - Math.sin(t * 0.4) * h * 0.02;
      ctx.fillStyle = c;
      for (let py = -r; py < 0; py += u) {
        const band = Math.floor((-py / r) * 8);
        if (py > -r * 0.45 && band % 2 === 0 && ((py / u) | 0) % 3 === 0) continue;
        const hw = Math.sqrt(r * r - py * py);
        ctx.fillRect(Math.round(cx - hw), Math.round(cy + py), Math.round(hw * 2), u);
      }
      // sol quadrillé qui défile
      const gy = y + h * 0.6;
      ctx.fillStyle = mix(a, "#000000", 0.55);
      ctx.fillRect(x, gy, w, h - (gy - y));
      ctx.fillStyle = b;
      for (let i = 0; i < 7; i++) {
        const k = ((i + ((t * 0.8) % 1)) / 7) ** 2;
        ctx.fillRect(x, Math.round(gy + k * (h - (gy - y))), w, u);
      }
      for (let i = -8; i <= 8; i++) {
        const x0 = cx + i * w * 0.03, x1 = cx + i * w * 0.22;
        line(ctx, x0, gy, x1, y + h, u, b);
      }
      break;
    }
    case "montagnes": {
      ditherGradient(ctx, x, y, w, h, a, mix(a, b, 0.5), 5, u);
      // nuages qui glissent
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (let i = 0; i < 3; i++) {
        const cx = x + (((i * 0.37 + t * 0.02) % 1.2) - 0.1) * w, cy = y + h * (0.15 + i * 0.09);
        ctx.fillRect(Math.round(cx), Math.round(cy), Math.round(w * 0.12), u * 2);
        ctx.fillRect(Math.round(cx + w * 0.02), Math.round(cy - u * 2), Math.round(w * 0.06), u * 2);
      }
      ridge(ctx, x, y, w, h, b, 0.48, 0.22, 3.1, t * 0.01, u);
      ridge(ctx, x, y, w, h, c, 0.66, 0.18, 5.3, t * 0.03, u);
      break;
    }
    case "damier": {
      const s = Math.max(4, Math.round(w / 9));
      const off = (t * s * 0.6) % (s * 2);
      for (let py = -s * 2; py < h + s * 2; py += s)
        for (let px = -s * 2; px < w + s * 2; px += s) {
          const on = (((px / s) | 0) + ((py / s) | 0)) & 1;
          ctx.fillStyle = on ? a : b;
          ctx.fillRect(Math.round(x + px + off), Math.round(y + py + off * 0.5), s, s);
        }
      ctx.fillStyle = c + "99";
      ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
      break;
    }
    case "rayures": {
      ctx.fillStyle = b;
      ctx.fillRect(x, y, w, h);
      const s = Math.max(3, Math.round(w / 12));
      const off = (t * s * 1.5) % (s * 2);
      ctx.fillStyle = a;
      for (let k = -h - s * 2; k < w + h; k += s * 2) {
        for (let py = 0; py < h; py += u) {
          ctx.fillRect(Math.round(x + k + off + py), y + py, s, u);
        }
      }
      ctx.fillStyle = c;
      const pulse = 0.18 + 0.02 * Math.sin(t * 3);
      pixelCircle(ctx, x + w / 2, y + h / 2, h * pulse, u, c);
      break;
    }
    case "galaxie": {
      ctx.fillStyle = a;
      ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 40; i++) {
        const sx = x + ((Math.sin(i * 91.7) * 0.5 + 0.5) * w + t * (2 + (i % 3) * 4)) % w;
        const sy = y + (Math.sin(i * 47.3) * 0.5 + 0.5) * h;
        ctx.fillStyle = i % 5 ? "#ffffff" : c;
        ctx.fillRect(Math.round(sx), Math.round(sy), u, u);
      }
      pixelCircle(ctx, x + w * 0.62, y + h * 0.55, h * 0.24, u, b);
      ctx.fillStyle = c;
      ctx.fillRect(x + w * 0.3, y + h * 0.55, w * 0.64, u * 2);
      break;
    }
    case "vagues":
    default: {
      ditherGradient(ctx, x, y, w, h * 0.55, a, b, 4, u);
      for (let row = 0; row < 6; row++) {
        ctx.fillStyle = row % 2 ? b : c;
        const base = y + h * 0.5 + row * h * 0.09;
        for (let px = 0; px < w; px += u) {
          const yy = base + Math.sin(px * 0.08 + t * 2 + row) * h * 0.02;
          ctx.fillRect(x + px, Math.round(yy), u, h);
        }
      }
    }
  }
  ctx.restore();
}

function line(ctx, x0, y0, x1, y1, u, color) {
  ctx.fillStyle = color;
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / u);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k), u, u);
  }
}

function ridge(ctx, x, y, w, h, color, base, amp, freq, scroll, u) {
  ctx.fillStyle = color;
  for (let px = 0; px < w; px += u) {
    const k = px / w + scroll;
    const v =
      Math.abs(Math.sin(k * freq)) * 0.6 + Math.abs(Math.sin(k * freq * 2.3 + 1.3)) * 0.4;
    const top = y + h * (base + amp * (1 - v) - amp * 0.4);
    ctx.fillRect(x + px, Math.round(top / u) * u, u, y + h - top + u);
  }
}

export function pixelCircle(ctx, cx, cy, r, u, color) {
  ctx.fillStyle = color;
  for (let py = -r; py <= r; py += u) {
    const hw = Math.sqrt(Math.max(0, r * r - py * py));
    ctx.fillRect(Math.round((cx - hw) / u) * u, Math.round((cy + py) / u) * u, Math.round((hw * 2) / u) * u, u);
  }
}

/* ---------------- Avatar (12 × 14 pixels) ---------------- */
const AVATAR = [
  "...hhhhhh...",
  "..hhhhhhhh..",
  ".hhhhhhhhhh.",
  ".hhsshhsshh.",
  ".hssssssssh.",
  ".ssewssewss.",
  ".ssssssssss.",
  ".sccsmmsccs.",
  "..ssssssss..",
  "...ssssss...",
  "..tttttttt..",
  ".ttaattaatt.",
  "tttttttttttt",
  "tttttttttttt",
];
export function drawAvatar(ctx, x, y, scale, accent, blink = false, bob = 0) {
  const col = {
    h: "#5a3a22", s: "#f2c39b", e: "#1b1b2b", w: "#ffffff", c: "#f29b8b",
    m: "#c0392b", t: accent, a: mix(accent, "#000000", 0.35), k: "#d9a27e",
  };
  AVATAR.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      let k = row[rx];
      if (k === ".") continue;
      if (blink && (k === "e" || k === "w")) k = "k";
      ctx.fillStyle = col[k];
      const dy = ry < 10 ? bob : 0; // la tête bouge, pas le t-shirt
      ctx.fillRect(x + rx * scale, y + (ry + dy) * scale, scale, scale);
    }
  });
}
export const AVATAR_SIZE = [12, 14];

/* ---------------- Texte ---------------- */
export function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* Texte avec ombre portée dure (style titre de jeu). */
export function shadowText(ctx, text, x, y, color, shadow, d = 2) {
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + d, y + d);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/* Les polices pixel n’ont pas toujours les apostrophes typographiques. */
export function sanitize(text) {
  return String(text).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
}
