/* Poussière qui flotte : des particules visibles seulement là où la
   lumière de la lampe (et celle de la télé) les éclaire. */

export class Dust {
  constructor(canvas, { count = 70, reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduce = reduceMotion;
    this.count = count;
    this.lights = [];
    this.sprite = makeSprite();
    this.resize();
  }

  setCount(n) {
    this.count = n;
    this.spawn();
  }

  resize() {
    this.w = this.canvas.width = Math.round(innerWidth);
    this.h = this.canvas.height = Math.round(innerHeight);
    this.spawn();
  }

  spawn() {
    this.p = Array.from({ length: this.count }, () => ({
      x: Math.random() * this.w, y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 5,
      s: 0.4 + Math.random() * 1.1, ph: Math.random() * 6.28,
    }));
  }

  /* lights : [{x, y, rx, ry, rgb:[r,g,b], k}] en pixels de la fenêtre */
  setLights(lights) {
    this.lights = lights;
  }

  update(dt, t) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!this.lights.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.p) {
      if (!this.reduce) {
        p.vx += Math.sin(t * 0.7 + p.ph) * 2 * dt;
        p.x += p.vx * dt + Math.sin(t * 0.5 + p.ph) * 0.15;
        p.y += p.vy * dt * 0.6;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
      }
      let a = 0;
      for (const L of this.lights) {
        const dx = (p.x - L.x) / L.rx, dy = (p.y - L.y) / L.ry;
        const d = dx * dx + dy * dy;
        if (d < 1) a += (1 - d) * L.k;
      }
      if (a < 0.02) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 2 + p.ph);
      ctx.globalAlpha = Math.min(1, a * tw);
      const sz = 6 * p.s;
      ctx.drawImage(this.sprite, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

function makeSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, "rgba(255,236,200,1)");
  grad.addColorStop(0.35, "rgba(255,220,170,.5)");
  grad.addColorStop(1, "rgba(255,210,150,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return c;
}
