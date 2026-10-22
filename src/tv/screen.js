/* Rendu des écrans de jeu de la NOVA 16 dans un canvas 2D basse résolution.
   Ce canvas sert ensuite de texture au shader CRT de la télé (crt.js). */
import {
  FONT_PIXEL, FONT_CRT, drawMotif, drawAvatar, AVATAR_SIZE, wrapText, shadowText, sanitize, mix, upper,
} from "./pixel.js";

const HUD_H = 16;
const HINT_H = 16;
const CHARS_PER_SEC = 60;
const BOOT_DUR = 2.3;
const TITLE_AUTOSTART = 6;

export class GameScreen {
  constructor({ sound, reduceMotion, touch, onLink, onState }) {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.aux = document.createElement("canvas");
    this.auxCtx = this.aux.getContext("2d");
    this.sound = sound;
    this.reduce = reduceMotion;
    this.touch = touch;
    this.onLink = onLink;
    this.onState = onState || (() => {});
    this.state = "idle";
    this.cart = null;
    this.t = 0;
    this.images = new Map();
    this.setSize(400);
  }

  setSize(W) {
    W = Math.round(W);
    if (this.W === W) return;
    this.W = W;
    this.H = Math.round((W * 3) / 4);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.aux.width = this.W;
    this.aux.height = this.H;
    this.body = W >= 400 ? 20 : 18;
    this.lh = this.body + 1;
    this.pad = W >= 400 ? 20 : 14;
    if (this.cart) this.layout();
  }

  /* ---------------- Cycle de vie ---------------- */
  setCart(cart) {
    this.cart = cart;
    this.state = "boot";
    this.stateT = 0;
    this.reveal = 0;
    this.sel = -1;
    this.scroll = 0;
    this.scrollTarget = 0;
    this.userScrolled = false;
    this.trans = null;
    this.bootChimed = false;
    this.countdown = null;
    this.flash = 0;
    this.layout();
    this.onState(this.state);
  }

  clear() {
    this.cart = null;
    this.state = "idle";
    this.trans = null;
    this.onState(this.state);
  }

  go(next, dur = 0.5) {
    if (this.reduce) {
      this.enter(next);
      return;
    }
    this.trans = { t: 0, dur, next, switched: false };
  }

  enter(next) {
    this.state = next;
    this.stateT = 0;
    if (next === "content") {
      this.scroll = this.scrollTarget = 0;
      this.userScrolled = false;
      if (this.reduce) this.reveal = this.totalChars;
    }
    this.onState(next);
  }

  start() {
    if (this.state !== "title" || this.trans) return;
    this.sound.start();
    this.flash = 1;
    this.go("content", 0.6);
  }

  revealAll() {
    this.reveal = this.totalChars;
  }

  get revealing() {
    return this.state === "content" && this.reveal < this.totalChars;
  }

  /* ---------------- Mise en page du contenu ---------------- */
  layout() {
    const ctx = this.ctx;
    const inner = this.W - this.pad * 2 - 6;
    const items = [];
    const sels = [];
    let y = 4;
    let chars = 0;
    const push = (it) => {
      it.y = y;
      it.start = chars;
      chars += it.chars ?? 6;
      y += it.h;
      items.push(it);
    };
    for (const b of this.cart.blocks) {
      switch (b.type) {
        case "title": {
          ctx.font = `16px ${FONT_PIXEL}`;
          const lines = wrapText(ctx, sanitize(b.text), inner);
          push({ type: "title", lines, h: lines.length * 22 + 10, chars: 4 });
          break;
        }
        case "heading": {
          y += 6;
          push({ type: "heading", text: sanitize(b.text), h: 18, chars: 4 });
          break;
        }
        case "text": {
          ctx.font = `${this.body}px ${FONT_CRT}`;
          const lines = wrapText(ctx, sanitize(b.text), inner);
          push({ type: "text", lines, h: lines.length * this.lh + 8, chars: b.text.length });
          break;
        }
        case "hero": {
          const sc = this.W >= 400 ? 4 : 3;
          const aw = AVATAR_SIZE[0] * sc, ah = AVATAR_SIZE[1] * sc;
          ctx.font = `${this.body}px ${FONT_CRT}`;
          const lines = wrapText(ctx, sanitize(b.text), inner - aw - 12);
          push({ type: "hero", lines, sc, aw, h: Math.max(ah, lines.length * this.lh) + 10, chars: b.text.length });
          break;
        }
        case "stats": {
          ctx.font = `${this.body}px ${FONT_CRT}`;
          const kw = Math.max(...b.items.map(([k]) => ctx.measureText(sanitize(k)).width)) + 12;
          const rows = b.items.map(([k, v]) => ({ k: sanitize(k), lines: wrapText(ctx, sanitize(v), inner - kw) }));
          const h = rows.reduce((s, r) => s + r.lines.length * this.lh, 0) + 6;
          push({ type: "stats", rows, kw, h, chars: rows.reduce((s, r) => s + r.k.length + r.lines.join(" ").length, 0) });
          break;
        }
        case "list": {
          // chaque élément : "texte" ou ["Intitulé", "texte"]
          ctx.font = `${this.body}px ${FONT_CRT}`;
          const ind = 14;
          const rows = b.items.map((entry) => {
            const [label, text] = Array.isArray(entry) ? entry : [null, entry];
            return { label: label ? sanitize(label) : null, lines: wrapText(ctx, sanitize(text), inner - ind) };
          });
          const h = rows.reduce((s, r) => s + (r.label ? this.lh : 0) + r.lines.length * this.lh + 6, 0) + 2;
          const chars = rows.reduce((s, r) => s + (r.label ? r.label.length : 0) + r.lines.join(" ").length, 0);
          push({ type: "list", rows, ind, h, chars });
          break;
        }
        case "bars": {
          ctx.font = `${this.body}px ${FONT_CRT}`;
          const lw = Math.max(...b.items.map(([k]) => ctx.measureText(sanitize(k)).width)) + 12;
          push({ type: "bars", rows: b.items.map(([k, v]) => [sanitize(k), v]), lw, h: b.items.length * (this.lh + 3) + 6, chars: 20 });
          break;
        }
        case "tags": {
          ctx.font = `${this.body}px ${FONT_CRT}`;
          let x = 0, row = 0;
          const boxes = b.items.map((tag) => {
            const w = ctx.measureText(sanitize(tag)).width + 12;
            if (x + w > inner && x > 0) { x = 0; row++; }
            const box = { text: sanitize(tag), x, row, w };
            x += w + 6;
            return box;
          });
          push({ type: "tags", boxes, h: (row + 1) * (this.lh + 6) + 4, chars: 12 });
          break;
        }
        case "image": {
          const h = Math.round(inner * 0.56);
          push({ type: "image", src: b.src, h: h + 10, ih: h, chars: 10 });
          this.loadImage(b.src);
          break;
        }
        case "link": {
          ctx.font = `8px ${FONT_PIXEL}`;
          const w = ctx.measureText(sanitize(b.label)).width + 24;
          y += 6;
          const it = { type: "link", label: sanitize(b.label), href: b.href, w, h: 34, chars: 8 };
          push(it);
          sels.push({ item: it, x: 0, y: it.y, w, h: 24, href: b.href, label: b.label });
          break;
        }
        case "links": {
          const it = { type: "links", rows: b.items.map((l) => ({ ...l, label: sanitize(l.label) })), h: b.items.length * (this.lh + 6) + 6, chars: 10 };
          push(it);
          ctx.font = `${this.body}px ${FONT_CRT}`;
          it.rows.forEach((r, i) => {
            sels.push({ item: it, sub: i, x: 0, y: it.y + i * (this.lh + 6), w: ctx.measureText(r.label).width + 26, h: this.lh + 4, href: r.href, label: r.label });
          });
          break;
        }
        case "countdown": {
          push({ type: "countdown", from: b.from ?? 9, end: sanitize(b.end ?? "Merci !"), h: 46, chars: 4 });
          break;
        }
      }
    }
    this.items = items;
    this.sels = sels;
    this.totalChars = chars;
    this.contentH = y + 10;
    if (this.state === "content" && this.reduce) this.reveal = chars;
  }

  loadImage(src) {
    if (this.images.has(src)) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    this.images.set(src, img);
  }

  get viewH() {
    return this.H - HUD_H - HINT_H;
  }
  get maxScroll() {
    return Math.max(0, this.contentH - this.viewH + 8);
  }

  /* ---------------- Entrées ---------------- */
  input(action) {
    if (this.trans) return;
    const s = this.state;
    if (s === "boot") {
      if (action === "a" || action === "start") this.go("title", 0.3);
      return;
    }
    if (s === "title") {
      if (action === "a" || action === "start") this.start();
      return;
    }
    if (s !== "content") return;
    if (this.revealing && (action === "a" || action === "start")) {
      this.revealAll();
      return;
    }
    if (action === "down" || action === "right") this.move(1);
    else if (action === "up" || action === "left") this.move(-1);
    else if (action === "a" || action === "start") {
      if (this.sel >= 0) this.activate(this.sel);
    } else if (action === "b") {
      this.sound.back();
      this.go("title", 0.45);
    }
  }

  move(dir) {
    const next = this.sels[this.sel + dir];
    const viewTop = this.scrollTarget, viewBot = viewTop + this.viewH;
    if (next && next.y < viewBot + 40 && next.y + next.h > viewTop - 40) {
      this.select(this.sel + dir);
      return;
    }
    if (this.sel === -1 && dir > 0 && this.sels[0] && this.maxScroll === 0) {
      this.select(0);
      return;
    }
    const before = this.scrollTarget;
    this.scrollBy(dir * 40);
    if (before === this.scrollTarget && next) this.select(this.sel + dir);
  }

  select(i, quiet = false) {
    if (i === this.sel) return;
    this.sel = i;
    if (!quiet) this.sound.blip();
    const s = this.sels[i];
    if (!s) return;
    if (s.y < this.scrollTarget + 4) this.scrollTo(s.y - 10);
    else if (s.y + s.h > this.scrollTarget + this.viewH - 4) this.scrollTo(s.y + s.h - this.viewH + 14);
  }

  activate(i) {
    const s = this.sels[i];
    if (!s) return;
    this.sound.select();
    s.pressed = 0.25;
    this.onLink(s);
  }

  focusItem(i) {
    if (!this.cart) return;
    if (this.state !== "content") {
      this.trans = null;
      this.enter("content");
    }
    this.revealAll();
    this.select(i, true);
  }

  scrollBy(d) {
    this.userScrolled = true;
    this.scrollTo(this.scrollTarget + d);
  }
  scrollTo(v) {
    this.scrollTarget = Math.max(0, Math.min(this.maxScroll, v));
  }
  get canScroll() {
    return this.state === "content" && this.maxScroll > 0;
  }

  /* Coordonnées en pixels du canvas → élément sélectionnable. */
  hit(x, y) {
    if (this.state !== "content") return -1;
    const cy = y - HUD_H - 6 + this.scroll;
    const cx = x - this.pad;
    return this.sels.findIndex((s) => cx >= s.x - 4 && cx <= s.x + s.w + 4 && cy >= s.y - 2 && cy <= s.y + s.h + 2);
  }

  hover(x, y) {
    const i = this.hit(x, y);
    if (i >= 0 && i !== this.sel) this.select(i);
    return i >= 0 || this.state === "title";
  }

  click(x, y) {
    if (this.state === "boot") return this.input("a");
    if (this.state === "title") return this.start();
    if (this.state !== "content") return;
    const i = this.hit(x, y);
    if (i >= 0) this.activate(i);
    else if (this.revealing) this.revealAll();
  }

  /* ---------------- Boucle ---------------- */
  update(dt) {
    this.t += dt;
    if (!this.cart) return;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    for (const s of this.sels) if (s.pressed) s.pressed = Math.max(0, s.pressed - dt);

    if (this.trans) {
      this.trans.t += dt;
      if (!this.trans.switched && this.trans.t >= this.trans.dur / 2) {
        this.trans.switched = true;
        this.enter(this.trans.next);
      }
      if (this.trans.t >= this.trans.dur) this.trans = null;
    }

    if (this.state === "boot") {
      const bootDur = this.reduce ? 0.8 : BOOT_DUR;
      if (!this.bootChimed && this.stateT > (this.reduce ? 0.1 : 0.95)) {
        this.bootChimed = true;
        this.sound.boot();
      }
      if (this.stateT > bootDur && !this.trans) this.go("title", 0.5);
    } else if (this.state === "title") {
      if (this.stateT > TITLE_AUTOSTART && !this.trans) this.start();
    } else if (this.state === "content") {
      if (this.reveal < this.totalChars && !this.trans) {
        const before = Math.floor(this.reveal);
        // les longs écrans s’écrivent plus vite (15 s au maximum)
        const speed = Math.max(CHARS_PER_SEC, this.totalChars / 15);
        this.reveal = Math.min(this.totalChars, this.reveal + dt * speed);
        if (Math.floor(this.reveal / 3) !== Math.floor(before / 3)) this.sound.type();
        if (!this.userScrolled) {
          const cur = this.items.find((it) => this.reveal >= it.start && this.reveal < it.start + it.chars);
          if (cur) this.scrollTo(cur.y + cur.h - this.viewH + 10);
        }
      }
      this.updateCountdown(dt);
    }
    this.scroll += (this.scrollTarget - this.scroll) * Math.min(1, dt * (this.reduce ? 60 : 14));
    if (Math.abs(this.scrollTarget - this.scroll) < 0.3) this.scroll = this.scrollTarget;
  }

  updateCountdown(dt) {
    const it = this.items.find((i) => i.type === "countdown");
    if (!it || this.reveal < it.start) return;
    if (!this.countdown) this.countdown = { n: it.from, acc: 0, done: false };
    const c = this.countdown;
    if (c.done) return;
    c.acc += dt;
    if (c.acc >= 1) {
      c.acc -= 1;
      c.n--;
      if (c.n < 0) {
        c.done = true;
        this.sound.coin();
      } else this.sound.tick();
    }
  }

  /* ---------------- Dessin ---------------- */
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = "top";
    if (!this.cart || this.state === "idle") {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (this.state === "boot") this.drawBoot();
    else if (this.state === "title") this.drawTitle();
    else this.drawContent();

    // Transition « mosaïque » façon 16 bits
    if (this.trans) {
      const k = this.trans.t / this.trans.dur;
      const m = 1 - Math.abs(k * 2 - 1); // 0 → 1 → 0
      const size = Math.max(1, Math.round(1 + m * 15));
      if (size > 1) {
        const a = this.auxCtx;
        a.imageSmoothingEnabled = false;
        const sw = Math.ceil(W / size), sh = Math.ceil(H / size);
        a.clearRect(0, 0, W, H);
        a.drawImage(this.canvas, 0, 0, W, H, 0, 0, sw, sh);
        ctx.drawImage(this.aux, 0, 0, sw, sh, 0, 0, sw * size, sh * size);
      }
      ctx.fillStyle = `rgba(0,0,0,${m * 0.75})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawBoot() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.stateT;
    ctx.fillStyle = "#05060c";
    ctx.fillRect(0, 0, W, H);
    const word = "NOVA 16";
    ctx.font = `24px ${FONT_PIXEL}`;
    const total = ctx.measureText(word).width;
    let x = (W - total) / 2;
    const baseY = H / 2 - 24;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const cw = ctx.measureText(ch).width;
      const lt = this.reduce ? 1 : Math.max(0, Math.min(1, (t - i * 0.08) / 0.45));
      // chute avec rebond
      const bounce = lt < 1 ? (1 - lt) * (1 - lt) * -H * 0.6 + Math.sin(lt * Math.PI) * -8 : 0;
      if (lt > 0) {
        const y = Math.round(baseY + bounce);
        ctx.fillStyle = "#e2463b";
        ctx.fillText(ch, x + 4, y + 4);
        ctx.fillStyle = "#2ec4b6";
        ctx.fillText(ch, x + 2, y + 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(ch, x, y);
      }
      x += cw;
    }
    // reflet qui balaie le logo
    if (t > 1.0 && t < 1.6 && !this.reduce) {
      const sx = ((t - 1.0) / 0.6) * (total + 60) + (W - total) / 2 - 30;
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 4);
      ctx.lineTo(sx + 12, baseY - 4);
      ctx.lineTo(sx + 2, baseY + 30);
      ctx.lineTo(sx - 10, baseY + 30);
      ctx.fill();
      ctx.restore();
    }
    if (t > 1.0 || this.reduce) {
      ctx.font = `8px ${FONT_PIXEL}`;
      const s = "SYSTEME 16 BITS";
      ctx.fillStyle = "#8a93b8";
      ctx.fillText(s, Math.round((W - ctx.measureText(s).width) / 2), baseY + 44);
      ctx.font = `${this.body}px ${FONT_CRT}`;
      const l = "Chargement de la cartouche" + ".".repeat(1 + (Math.floor(t * 4) % 3));
      ctx.fillStyle = "#c9cde0";
      ctx.fillText(l, Math.round((W - ctx.measureText("Chargement de la cartouche...").width) / 2), baseY + 64);
    }
  }

  drawTitle() {
    const ctx = this.ctx, W = this.W, H = this.H, c = this.cart, p = c.palette, t = this.t;
    drawMotif(ctx, c.motif, 0, 0, W, H, p.art, this.reduce ? 0 : t);
    // bandeau du titre
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, H * 0.18, W, 64);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, H * 0.18, W, 2);
    ctx.fillRect(0, H * 0.18 + 62, W, 2);
    ctx.font = `16px ${FONT_PIXEL}`;
    const title = upper(c.title);
    const lines = wrapText(ctx, title, W - 24);
    const wob = this.reduce ? 0 : Math.round(Math.sin(t * 2.2) * 2);
    lines.slice(0, 2).forEach((l, i) => {
      const lw = ctx.measureText(l).width;
      const yy = Math.round(H * 0.18 + (lines.length > 1 ? 10 : 22) + i * 22 + wob);
      ctx.fillStyle = "#000";
      ctx.fillText(l, Math.round((W - lw) / 2) + 3, yy + 3);
      shadowText(ctx, l, Math.round((W - lw) / 2), yy, p.fg, p.accent, 1);
    });
    if (c.subtitle) {
      ctx.font = `${this.body}px ${FONT_CRT}`;
      const s = sanitize(c.subtitle);
      const sw = ctx.measureText(s).width;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(Math.round((W - sw) / 2) - 6, Math.round(H * 0.18 + 70), sw + 12, this.body + 4);
      ctx.fillStyle = p.fg;
      ctx.fillText(s, Math.round((W - sw) / 2), Math.round(H * 0.18 + 72));
    }
    // « Appuie sur Start »
    const blinkOn = this.reduce || Math.floor(t * 2.2) % 2 === 0;
    ctx.font = `8px ${FONT_PIXEL}`;
    const ps = this.touch ? "TOUCHE L'ECRAN" : "APPUIE SUR START";
    const pw = ctx.measureText(ps).width;
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(Math.round((W - pw) / 2) - 10, Math.round(H * 0.74) - 7, pw + 20, 22);
    if (blinkOn) shadowText(ctx, ps, Math.round((W - pw) / 2), Math.round(H * 0.74), "#ffffff", "#000000", 1);
    if (!this.touch) {
      ctx.font = `${this.body - 4}px ${FONT_CRT}`;
      const k = "(Entrée ou clic)";
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.fillText(k, Math.round((W - ctx.measureText(k).width) / 2), Math.round(H * 0.74) + 20);
    }
    ctx.font = `8px ${FONT_PIXEL}`;
    const cr = "NOVA 16";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText(cr, Math.round((W - ctx.measureText(cr).width) / 2), H - 14);
  }

  drawContent() {
    const ctx = this.ctx, W = this.W, H = this.H, c = this.cart, p = c.palette, t = this.t;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);
    // trame de fond très légère qui défile avec le contenu
    ctx.fillStyle = mix(p.bg, p.fg, 0.05);
    const off = Math.round(this.scroll * 0.3) % 8;
    for (let y = -8; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 4; x < W; x += 8) ctx.fillRect(x, y - off, 2, 2);

    // contenu
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H, W, this.viewH);
    ctx.clip();
    ctx.translate(this.pad, HUD_H + 6 - Math.round(this.scroll));
    for (const it of this.items) {
      if (this.reveal <= it.start) break;
      if (it.y - this.scroll > this.viewH + 20 || it.y + it.h - this.scroll < -20) continue;
      this.drawItem(it, Math.max(0, this.reveal - it.start), p, t);
    }
    ctx.restore();

    // HUD du haut
    ctx.fillStyle = mix(p.bg, "#000000", 0.45);
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, HUD_H - 1, W, 1);
    ctx.font = `8px ${FONT_PIXEL}`;
    ctx.fillStyle = p.fg;
    ctx.fillText("1P", 6, 4);
    ctx.fillStyle = p.accent;
    const ttl = upper(c.title);
    ctx.fillText(ttl, 30, 4);
    for (let i = 0; i < 3; i++) heart(ctx, W - 14 - i * 12, 4, i === 2 && Math.floor(t * 1.5) % 2 ? "#7a2030" : "#ff4d6d");

    // barre de défilement
    if (this.maxScroll > 0) {
      const trackH = this.viewH - 8;
      const thumbH = Math.max(14, (this.viewH / this.contentH) * trackH);
      const ty = HUD_H + 4 + (this.scroll / this.maxScroll) * (trackH - thumbH);
      ctx.fillStyle = mix(p.bg, p.fg, 0.15);
      ctx.fillRect(W - 6, HUD_H + 4, 2, trackH);
      ctx.fillStyle = p.accent;
      ctx.fillRect(W - 7, Math.round(ty), 4, Math.round(thumbH));
    }

    // barre d’aide du bas
    const by = H - HINT_H;
    ctx.fillStyle = mix(p.bg, "#000000", 0.45);
    ctx.fillRect(0, by, W, HINT_H);
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, by, W, 1);
    ctx.font = `${this.body - 4}px ${FONT_CRT}`;
    ctx.fillStyle = mix(p.fg, p.bg, 0.15);
    const hint = this.touch
      ? "Glisse pour défiler · touche un lien"
      : this.revealing
        ? "[Entrée] tout afficher   [Échap] éjecter"
        : this.sels.length
          ? "[Flèches] choisir  [Entrée] ouvrir  [Échap] éjecter"
          : "[Flèches] défiler   [Échap] éjecter";
    // version courte si la barre est trop étroite
    const fit = ctx.measureText(hint).width <= W - 24 ? hint : this.touch ? "Glisse · touche" : "Flèches · Entrée · Échap";
    ctx.fillText(fit, 6, by + 1);
    if (this.maxScroll > 0 && this.scroll < this.maxScroll - 2 && Math.floor(t * 2) % 2) {
      tri(ctx, W - 14, by + 5, p.accent, 1);
    }
  }

  drawItem(it, shown, p, t) {
    const ctx = this.ctx, lh = this.lh, y = it.y, inner = this.W - this.pad * 2 - 6;
    const pop = Math.min(1, shown / 6);
    switch (it.type) {
      case "title": {
        ctx.font = `16px ${FONT_PIXEL}`;
        it.lines.forEach((l, i) => shadowText(ctx, l, 0, y + i * 22, p.accent, "rgba(0,0,0,.6)", 2));
        ctx.fillStyle = p.accent;
        ctx.fillRect(0, y + it.lines.length * 22 - 2, Math.round(inner * pop), 2);
        break;
      }
      case "heading": {
        ctx.font = `8px ${FONT_PIXEL}`;
        tri(ctx, 0, y + 1, p.accent, 0);
        ctx.fillStyle = mix(p.fg, p.accent, 0.4);
        ctx.fillText(upper(it.text), 12, y);
        break;
      }
      case "text":
        this.drawLines(it.lines, 0, y, shown, p.fg);
        break;
      case "hero": {
        const blink = !this.reduce && t % 3.6 < 0.14;
        const bob = this.reduce ? 0 : Math.round(Math.sin(t * 2.5) * 0.6);
        ctx.fillStyle = mix(p.bg, p.accent, 0.2);
        ctx.fillRect(-2, y - 2, it.aw + 4, AVATAR_SIZE[1] * it.sc + 4);
        drawAvatar(ctx, 0, y, it.sc, p.accent, blink, bob);
        this.drawLines(it.lines, it.aw + 12, y, shown, p.fg);
        break;
      }
      case "stats": {
        ctx.font = `${this.body}px ${FONT_CRT}`;
        let yy = y, left = shown;
        for (const r of it.rows) {
          ctx.fillStyle = mix(p.fg, p.bg, 0.4);
          ctx.fillText(r.k.slice(0, Math.max(0, left)), 0, yy);
          left -= r.k.length;
          this.drawLines(r.lines, it.kw, yy, Math.max(0, left), p.fg);
          left -= r.lines.join(" ").length;
          yy += r.lines.length * lh;
        }
        break;
      }
      case "list": {
        let yy = y, left = shown;
        for (const r of it.rows) {
          if (left <= 0) break;
          tri(ctx, 2, yy + lh / 2 - 4, p.accent, 0);
          if (r.label) {
            ctx.font = `${this.body}px ${FONT_CRT}`;
            ctx.fillStyle = p.accent;
            ctx.fillText(r.label.slice(0, Math.max(0, left)), it.ind, yy);
            left -= r.label.length;
            yy += lh;
          }
          this.drawLines(r.lines, it.ind, yy, Math.max(0, left), p.fg);
          left -= r.lines.join(" ").length;
          yy += r.lines.length * lh + 6;
        }
        break;
      }
      case "bars": {
        ctx.font = `${this.body}px ${FONT_CRT}`;
        const fill = Math.min(1, shown / 20);
        it.rows.forEach(([k, v], i) => {
          const yy = y + i * (lh + 3);
          ctx.fillStyle = p.fg;
          ctx.fillText(k, 0, yy);
          const bw = inner - it.lw - 4, seg = 6;
          const n = Math.floor(bw / seg);
          const on = Math.round(n * v * easeOut(fill));
          for (let s = 0; s < n; s++) {
            ctx.fillStyle = s < on ? p.accent : mix(p.bg, p.fg, 0.12);
            ctx.fillRect(it.lw + s * seg, yy + lh / 2 - 4, seg - 2, 8);
          }
        });
        break;
      }
      case "tags": {
        ctx.font = `${this.body}px ${FONT_CRT}`;
        it.boxes.forEach((b, i) => {
          if (i / it.boxes.length > pop + 0.01) return;
          const yy = y + b.row * (lh + 6);
          ctx.fillStyle = mix(p.bg, p.accent, 0.15);
          ctx.fillRect(b.x, yy, b.w, lh + 2);
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x + 1, yy + 1, b.w - 2, lh);
          ctx.fillStyle = p.fg;
          ctx.fillText(b.text, b.x + 6, yy + 1);
        });
        break;
      }
      case "image": {
        const img = this.images.get(it.src);
        if (img && img.complete && img.naturalWidth) {
          // rendu en gros pixels : on réduit puis on agrandit sans lissage
          const a = this.auxCtx, sw = Math.round(inner / 2), sh = Math.round(it.ih / 2);
          a.imageSmoothingEnabled = true;
          a.drawImage(img, 0, 0, sw, sh);
          ctx.drawImage(this.aux, 0, 0, sw, sh, 0, y, inner, it.ih);
        } else {
          ctx.fillStyle = mix(p.bg, p.fg, 0.1);
          ctx.fillRect(0, y, inner, it.ih);
        }
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, y + 1, inner - 2, it.ih - 2);
        break;
      }
      case "link": {
        const s = this.sels.find((x) => x.item === it);
        const on = this.sels.indexOf(s) === this.sel;
        const press = s.pressed ? 2 : 0;
        const bob = on && !this.reduce ? Math.round(Math.sin(t * 8)) : 0;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(4, y + 4, it.w, 24);
        ctx.fillStyle = on ? p.fg : p.accent;
        ctx.fillRect(press, y + press + bob, it.w, 24);
        ctx.font = `8px ${FONT_PIXEL}`;
        ctx.fillStyle = "#111";
        ctx.fillText(it.label, 12 + press, y + 8 + press + bob);
        if (on) cursor(ctx, it.w + 6, y + 6, p.accent, t, this.reduce);
        break;
      }
      case "links": {
        ctx.font = `${this.body}px ${FONT_CRT}`;
        it.rows.forEach((r, i) => {
          if (i / it.rows.length > pop + 0.01) return;
          const yy = y + i * (lh + 6);
          const idx = this.sels.findIndex((s) => s.item === it && s.sub === i);
          const on = idx === this.sel;
          if (on) {
            ctx.fillStyle = mix(p.bg, p.accent, 0.3);
            ctx.fillRect(-4, yy - 1, this.sels[idx].w + 8, lh + 4);
          }
          const nudge = on && !this.reduce ? Math.round(Math.sin(t * 8) + 1) : 0;
          tri(ctx, nudge, yy + lh / 2 - 4, p.accent, 0);
          ctx.fillStyle = on ? "#ffffff" : p.fg;
          ctx.fillText(r.label, 16, yy);
          ctx.fillStyle = on ? p.accent : mix(p.fg, p.bg, 0.5);
          ctx.fillRect(16, yy + lh - 1, ctx.measureText(r.label).width, 1);
        });
        break;
      }
      case "countdown": {
        const c = this.countdown;
        ctx.font = `32px ${FONT_PIXEL}`;
        const txt = !c ? String(it.from) : c.done ? it.end : String(Math.max(0, c.n));
        if (c && c.done) ctx.font = `16px ${FONT_PIXEL}`;
        const sc = c && !c.done && !this.reduce ? 1 + Math.max(0, 0.25 - c.acc) : 1;
        ctx.save();
        ctx.translate(0, y + (c && c.done ? 12 : 0));
        ctx.scale(sc, sc);
        shadowText(ctx, txt, 0, 0, p.accent, "rgba(0,0,0,.6)", 3);
        ctx.restore();
        break;
      }
    }
  }

  drawLines(lines, x, y, shown, color) {
    const ctx = this.ctx;
    ctx.font = `${this.body}px ${FONT_CRT}`;
    ctx.fillStyle = color;
    let left = Math.floor(shown);
    for (let i = 0; i < lines.length && left > 0; i++) {
      const l = lines[i];
      const part = l.slice(0, left);
      ctx.fillText(part, x, y + i * this.lh);
      if (left < l.length && Math.floor(this.t * 6) % 2 === 0) {
        ctx.fillRect(x + ctx.measureText(part).width + 1, y + i * this.lh + 3, 6, this.body - 6);
      }
      left -= l.length + 1;
    }
  }
}

function easeOut(k) {
  return 1 - (1 - k) ** 3;
}

function heart(ctx, x, y, color) {
  const rows = [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."];
  ctx.fillStyle = color;
  rows.forEach((r, ry) => {
    for (let rx = 0; rx < r.length; rx++) if (r[rx] === "x") ctx.fillRect(x + rx, y + ry, 1, 1);
  });
}

/* petit triangle : dir 0 = vers la droite, 1 = vers le bas */
function tri(ctx, x, y, color, dir) {
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    if (dir === 0) ctx.fillRect(x + i, y + i, 2, 8 - i * 2);
    else ctx.fillRect(x + i, y + i, 8 - i * 2, 2);
  }
}

function cursor(ctx, x, y, color, t, reduce) {
  const dx = reduce ? 0 : Math.round(Math.sin(t * 8) * 2);
  ctx.save();
  ctx.translate(x + dx, y);
  ctx.scale(-1, 1);
  tri(ctx, -8, 0, color, 0);
  ctx.restore();
}
