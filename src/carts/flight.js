/* Déplacements physiques d’une cartouche : vol en arc depuis l’étagère,
   insertion avec rebond dans la fente, éjection et retour, glisser-déposer. */

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function frames(dur, fn) {
  return new Promise((resolve) => {
    if (dur <= 0) {
      fn(1, 0);
      resolve();
      return;
    }
    const t0 = performance.now();
    let last = t0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      fn(k, (now - last) / 1000);
      last = now;
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export class CartMover {
  constructor({ flyLayer, seat, slot, reduceMotion }) {
    this.layer = flyLayer;
    this.seat = seat;
    this.slot = slot;
    this.reduce = reduceMotion;
    this.seated = null;
  }

  /* Copie visuelle d’une cartouche de l’étagère (le canvas de l’étiquette compris). */
  makeGhost(cartBtn) {
    const r = cartBtn.getBoundingClientRect();
    const g = document.createElement("div");
    g.className = "cart cart-ghost";
    g.setAttribute("aria-hidden", "true");
    g.style.cssText = cartBtn.style.cssText;
    g.innerHTML = cartBtn.innerHTML;
    const src = cartBtn.querySelector("canvas"), dst = g.querySelector("canvas");
    if (src && dst) {
      dst.width = src.width;
      dst.height = src.height;
      dst.getContext("2d").drawImage(src, 0, 0);
    }
    g.style.width = r.width + "px";
    g.style.height = r.height + "px";
    g._w = r.width;
    g._h = r.height;
    this.layer.appendChild(g);
    this.put(g, r.left + r.width / 2, r.top + r.height / 2, 0, 1);
    return g;
  }

  put(g, cx, cy, rot = 0, scale = 1, lift = 0) {
    g._x = cx;
    g._y = cy;
    g._rot = rot;
    g.style.transform = `translate3d(${cx - g._w / 2}px, ${cy - g._h / 2}px, 0) rotate(${rot}deg) scale(${scale})`;
    g.style.setProperty("--lift", lift.toFixed(3));
  }

  /* Centre de la cartouche quand elle attend juste au-dessus de la fente. */
  aboveSlot(g) {
    const s = this.slot.getBoundingClientRect();
    return { x: s.left + s.width / 2, y: s.top + s.height / 2 - g._h * 0.45 - 26 };
  }

  async flyToSlot(g) {
    const x0 = g._x, y0 = g._y, r0 = g._rot || 0;
    const dist = Math.hypot(this.aboveSlot(g).x - x0, this.aboveSlot(g).y - y0);
    const dur = this.reduce ? 0 : Math.min(820, 420 + dist * 0.5);
    const spin = x0 > this.aboveSlot(g).x ? -1 : 1;
    await frames(dur, (k) => {
      const tgt = this.aboveSlot(g); // recalculé à chaque image (parallaxe)
      const e = easeInOut(k);
      const peak = Math.min(y0, tgt.y) - Math.min(220, 90 + dist * 0.25);
      const cx = (x0 + tgt.x) / 2;
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * tgt.x;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * peak + e * e * tgt.y;
      const rot = r0 * (1 - e) + Math.sin(e * Math.PI) * 22 * spin;
      const scale = 1 + Math.sin(e * Math.PI) * 0.22;
      this.put(g, x, y, rot, scale, Math.sin(e * Math.PI));
    });
    const t = this.aboveSlot(g);
    this.put(g, t.x, t.y, 0, 1, 0);
  }

  /* Bascule la cartouche dans le « puits » de la console, puis chute avec rebonds.
     onImpact est appelé au premier contact (son, secousse). */
  async drop(g, onImpact) {
    const seat = this.seat;
    const sr = seat.getBoundingClientRect();
    seat.style.setProperty("--cw", g._w + "px");
    seat.style.setProperty("--ch", g._h + "px");
    g.style.transform = "";
    g.classList.add("seated");
    seat.appendChild(g);
    this.seated = g;
    const bottom = sr.bottom; // ligne de la fente
    const seatedY = g._h * 0.52;
    let y = g._y + g._h / 2 - bottom; // position actuelle du bas de la cartouche par rapport à la fente
    const setY = (v) => (g.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`);
    setY(y);
    if (this.reduce) {
      setY(seatedY);
      onImpact && onImpact(1);
      return;
    }
    let v = 0, hit = false, bounces = 0;
    await new Promise((resolve) => {
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.03, (now - last) / 1000);
        last = now;
        v += 4200 * dt;
        y += v * dt;
        if (y >= seatedY) {
          y = seatedY;
          if (!hit) {
            hit = true;
            onImpact && onImpact(Math.min(1, v / 900));
          }
          v = -v * 0.28;
          bounces++;
          if (Math.abs(v) < 70 || bounces > 3) {
            setY(seatedY);
            resolve();
            return;
          }
        }
        setY(y);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* Sort la cartouche de la fente et la renvoie à sa place sur l’étagère. */
  async ejectTo(cartBtn) {
    const g = this.seated;
    if (!g) return;
    this.seated = null;
    const seatedY = g._h * 0.52;
    const up = -30;
    await frames(this.reduce ? 0 : 230, (k) => {
      const e = 1 - (1 - k) ** 3;
      g.style.transform = `translate3d(0, ${(seatedY + (up - seatedY) * e).toFixed(2)}px, 0)`;
    });
    // retour dans le calque de vol, à la même position à l’écran
    const r = g.getBoundingClientRect();
    g.classList.remove("seated");
    g.style.transform = "";
    this.layer.appendChild(g);
    this.put(g, r.left + r.width / 2, r.top + r.height / 2, 0, 1);
    await this.flyBack(g, cartBtn);
  }

  async flyBack(g, cartBtn) {
    const x0 = g._x, y0 = g._y, r0 = g._rot || 0;
    const target = () => {
      const r = cartBtn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const t0 = target();
    const dist = Math.hypot(t0.x - x0, t0.y - y0);
    const dur = this.reduce ? 0 : Math.min(760, 380 + dist * 0.45);
    const spin = t0.x > x0 ? 1 : -1;
    await frames(dur, (k) => {
      const t = target();
      const e = easeInOut(k);
      const peak = Math.min(y0, t.y) - Math.min(180, 70 + dist * 0.2);
      const cx = (x0 + t.x) / 2;
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * t.x;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * peak + e * e * t.y;
      this.put(g, x, y, r0 * (1 - e) + Math.sin(e * Math.PI) * 16 * spin, 1 + Math.sin(e * Math.PI) * 0.15, Math.sin(e * Math.PI));
    });
    // petit atterrissage écrasé
    const t = target();
    await frames(this.reduce ? 0 : 220, (k) => {
      const sq = Math.sin(k * Math.PI) * (1 - k) * 0.18;
      g.style.transform = `translate3d(${t.x - g._w / 2}px, ${t.y - g._h / 2 + sq * g._h * 0.5}px, 0) scale(${1 + sq}, ${1 - sq})`;
    });
    g.remove();
  }

  removeSeated() {
    if (this.seated) this.seated.remove();
    this.seated = null;
  }
}
