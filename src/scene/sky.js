/* Ciel nocturne pixel art derrière la fenêtre : étoiles qui scintillent,
   lune, nuages lents, étoiles filantes, ville au loin, et pour l’intro :
   pluie (rain 0 → 1) et éclairs (lightning()). */

const PX = 3; // un pixel du ciel = 3 pixels CSS

export class Sky {
  constructor(canvas, { reduceMotion = false, lite = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduce = reduceMotion;
    this.lite = lite;
    this.acc = 0;
    this.shoot = null;
    this.nextShoot = 4;
    this.t = 0;
    this.rain = 0;
    this.rainTarget = 0;
    this.flash = 0;
    this.bolt = null;
    this.drops = [];
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width / PX)), h = Math.max(10, Math.round(r.height / PX));
    if (w === this.w && h === this.h) return;
    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.stars = Array.from({ length: Math.round((w * h) / 55) }, () => ({
      x: Math.floor(rnd() * w), y: Math.floor(rnd() * h * 0.8),
      b: 0.3 + rnd() * 0.7, sp: 0.5 + rnd() * 2.5, ph: rnd() * 6.28,
      c: rnd() > 0.85 ? "#ffd9a8" : rnd() > 0.7 ? "#a8c8ff" : "#ffffff",
    }));
    // silhouette de la ville
    this.city = [];
    let x = 0;
    while (x < w) {
      const bw = 4 + Math.floor(rnd() * 9), bh = Math.floor(h * (0.08 + rnd() * 0.22));
      const wins = [];
      for (let yy = 2; yy < bh - 1; yy += 2) for (let xx = 1; xx < bw - 1; xx += 2) if (rnd() > 0.72) wins.push([xx, yy, rnd()]);
      this.city.push({ x, w: bw, h: bh, wins, antenna: rnd() > 0.8 });
      x += bw + (rnd() > 0.7 ? 1 : 0);
    }
    this.clouds = Array.from({ length: 3 }, (_, i) => ({ x: rnd() * w, y: h * (0.12 + i * 0.12), w: 14 + rnd() * 18, sp: 0.6 + rnd() * 0.8 }));
    this.draw();
  }

  /* Un éclair : flash du ciel et zigzag lumineux. */
  lightning() {
    this.flash = 1;
    let x = this.w * (0.25 + Math.random() * 0.5), y = 0;
    const pts = [[x, y]];
    while (y < this.h * 0.75) {
      y += 2 + Math.random() * 4;
      x += Math.round((Math.random() - 0.5) * 6);
      pts.push([x, y]);
    }
    this.bolt = pts;
    this.draw();
  }

  update(dt) {
    this.t += dt;
    this.acc += dt;
    // la pluie arrive vite et s’en va doucement (l’orage passe)
    const rate = this.rainTarget > this.rain ? 1.5 : 0.06;
    this.rain += Math.sign(this.rainTarget - this.rain) * Math.min(Math.abs(this.rainTarget - this.rain), rate * dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const step = this.lite ? 1 / 12 : 1 / 30;
    if (this.acc < step) return;
    this.acc = 0;
    if (!this.reduce) {
      this.nextShoot -= step;
      if (this.nextShoot <= 0 && !this.shoot) {
        this.shoot = { x: this.w * (0.3 + Math.random() * 0.7), y: Math.random() * this.h * 0.35, life: 0 };
        this.nextShoot = 5 + Math.random() * 9;
      }
      if (this.shoot) {
        this.shoot.life += step;
        if (this.shoot.life > 0.9) this.shoot = null;
      }
    }
    if (this.rain > 0.01 || this.drops.length) this.moveRain(step);
    this.draw();
  }

  draw() {
    const { ctx, w, h } = this;
    const t = this.reduce ? 0 : this.t;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#070a1f");
    g.addColorStop(0.6, "#151a45");
    g.addColorStop(1, "#2d2559");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      const tw = this.reduce ? s.b : s.b * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = Math.max(0, tw);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.b > 0.93 && tw > 0.8) {
        ctx.globalAlpha = tw * 0.4;
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
    // lune
    const mx = Math.round(w * 0.72), my = Math.round(h * 0.22), r = Math.max(4, Math.round(Math.min(w, h) * 0.09));
    ctx.fillStyle = "rgba(255,240,200,.08)";
    disc(ctx, mx, my, r * 2.2);
    ctx.fillStyle = "rgba(255,240,200,.12)";
    disc(ctx, mx, my, r * 1.5);
    ctx.fillStyle = "#fff4d6";
    disc(ctx, mx, my, r);
    ctx.fillStyle = "#e6d6b0";
    ctx.fillRect(mx - Math.round(r * 0.4), my - Math.round(r * 0.2), 2, 2);
    ctx.fillRect(mx + Math.round(r * 0.2), my + Math.round(r * 0.3), 2, 1);
    // nuages
    for (const c of this.clouds) {
      const x = ((c.x + t * c.sp) % (w + c.w * 2)) - c.w;
      ctx.fillStyle = "rgba(60,64,120,.55)";
      ctx.fillRect(Math.round(x), Math.round(c.y), Math.round(c.w), 2);
      ctx.fillRect(Math.round(x + c.w * 0.2), Math.round(c.y - 2), Math.round(c.w * 0.5), 2);
    }
    // étoile filante
    if (this.shoot) {
      const s = this.shoot, k = s.life / 0.9;
      for (let i = 0; i < 10; i++) {
        ctx.globalAlpha = (1 - i / 10) * (1 - k);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(s.x - k * w * 0.4 - i), Math.round(s.y + k * h * 0.2 + i * 0.5), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // voile d’orage, pluie et éclair
    if (this.rain > 0.01) {
      ctx.fillStyle = `rgba(14,16,34,${(0.6 * this.rain).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(205,215,255,${(this.flash * 0.75).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      if (this.bolt && this.flash > 0.45) {
        ctx.fillStyle = "#ffffff";
        for (let i = 1; i < this.bolt.length; i++) {
          const [x0, y0] = this.bolt[i - 1], [x1, y1] = this.bolt[i];
          for (let yy = y0; yy <= y1; yy++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * (yy - y0)) / Math.max(1, y1 - y0)), Math.round(yy), 1, 1);
        }
      }
    }
    // ville
    for (const b of this.city) {
      ctx.fillStyle = "#0b0d22";
      ctx.fillRect(b.x, h - b.h, b.w, b.h);
      if (b.antenna) ctx.fillRect(b.x + (b.w >> 1), h - b.h - 3, 1, 3);
      for (const [xx, yy, ph] of b.wins) {
        const on = this.reduce ? ph > 0.3 : Math.sin(t * 0.05 + ph * 40) > -0.6;
        if (!on) continue;
        ctx.fillStyle = ph > 0.8 ? "#9fd3ff" : "#ffcf6e";
        ctx.fillRect(b.x + xx, h - b.h + yy, 1, 1);
      }
    }
    if (this.drops.length) {
      ctx.fillStyle = "rgba(170,190,255,.55)";
      for (const d of this.drops) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
    }
  }

  moveRain(step) {
    const want = Math.round((this.w * this.h) / 40 * this.rain);
    while (this.drops.length < want) this.drops.push({ x: Math.random() * this.w, y: Math.random() * -this.h, len: 2 + ((Math.random() * 3) | 0), v: 90 + Math.random() * 60 });
    if (this.drops.length > want) this.drops.length = want;
    for (const d of this.drops) {
      d.y += d.v * step;
      d.x -= d.v * step * 0.15;
      if (d.y > this.h) {
        d.y = -d.len;
        d.x = Math.random() * (this.w + 10);
      }
    }
  }
}

function disc(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
    ctx.fillRect(cx - hw, cy + y, hw * 2, 1);
  }
}
