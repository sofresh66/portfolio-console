import "@fontsource/press-start-2p/400.css";
import "@fontsource/vt323/400.css";
import "./styles/main.css";

import { CARTS, OWNER } from "./data/carts.js";
import { GameScreen } from "./tv/screen.js";
import { CRT, screenToSource } from "./tv/crt.js";
import { Sound } from "./audio/sound.js";
import { Parallax } from "./scene/parallax.js";
import { Sky } from "./scene/sky.js";
import { Dust } from "./scene/dust.js";
import { initialQuality, storeQuality, fpsProbe, weakDevice } from "./scene/quality.js";
import { Gamepads } from "./input/gamepad.js";
import { buildShelf, enableDrag, tiltOnHover } from "./carts/shelf.js";
import { CartMover, frames } from "./carts/flight.js";

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
const reduce = reduceMQ.matches;
const touch = matchMedia("(pointer: coarse)").matches;

const el = {
  room: $("#room"),
  screen: $("#screen"),
  crt: $("#crt"),
  mirror: $("#screen-a11y"),
  tv: $("#tv"),
  console: $("#console"),
  seat: $("#seat"),
  slot: $("#slot"),
  eject: $("#eject"),
  shelf: $("#shelf"),
  caption: $("#shelf-caption"),
  fly: $("#fly-layer"),
  status: $("#sr-status"),
  intro: $("#intro"),
  introMsg: $("#intro-msg"),
  soundBtn: $("#btn-sound"),
  qualityBtn: $("#btn-quality"),
  zoomBtn: $("#btn-zoom"),
  lamp: $("#lamp"),
  clock: $("#clock"),
};

document.querySelectorAll("[data-owner]").forEach((n) => (n.textContent = OWNER));

/* ---------------- Qualité ---------------- */
let quality = initialQuality();
function applyQuality() {
  root.classList.toggle("lite", quality.lite);
  const label = quality.mode === "auto" ? `Qualité auto${quality.lite ? " (légère)" : ""}` : quality.mode === "haute" ? "Qualité haute" : "Qualité légère";
  el.qualityBtn.querySelector(".hud-txt").textContent = label;
  if (crt) crt.high = !quality.lite;
  if (dust) dust.setCount(quality.lite ? 0 : 70);
  if (sky) sky.lite = quality.lite;
  sizeAll();
}
el.qualityBtn.addEventListener("click", () => {
  const order = ["auto", "haute", "legere"];
  const mode = order[(order.indexOf(quality.mode) + 1) % order.length];
  quality = { mode, lite: mode === "legere" || (mode === "auto" && weakDevice()) };
  storeQuality(mode);
  applyQuality();
  say(`Qualité graphique : ${mode === "legere" ? "légère" : mode}.`);
});

/* ---------------- Son ---------------- */
const sound = new Sound();
function renderSoundBtn() {
  el.soundBtn.setAttribute("aria-pressed", String(sound.enabled));
  el.soundBtn.querySelector(".hud-txt").textContent = sound.enabled ? "Son activé" : "Son coupé";
}
el.soundBtn.addEventListener("click", () => {
  sound.setEnabled(!sound.enabled);
  renderSoundBtn();
  if (sound.enabled) sound.select();
});
renderSoundBtn();
// les navigateurs exigent un geste pour démarrer l’audio : on le débloque au premier
["pointerdown", "keydown"].forEach((ev) =>
  addEventListener(ev, () => {
    sound.unlock();
    if (sound.enabled && sound.wantMusic && !sound.music) sound.playMusic(sound.wantMusic);
  }, { capture: true })
);

/* Dernier mode d’interaction : on ne déplace le focus vers l’écran que pour
   le clavier ou la manette (pas d’anneau de focus après un clic souris). */
let lastInput = "pointer";
addEventListener("pointerdown", () => (lastInput = "pointer"), { capture: true });
addEventListener("keydown", () => (lastInput = "key"), { capture: true });

/* ---------------- Écran + CRT ---------------- */
let current = null;
let busy = false;

const screen = new GameScreen({
  sound,
  reduceMotion: reduce,
  touch,
  onLink: (s) => openLink(s.href),
  onState: (state) => {
    if (state === "title" && current) sound.playMusic(musicFor(current));
    el.screen.classList.toggle("scrollable", state === "content" && screen.maxScroll > 0);
  },
});
const crt = new CRT(el.crt, screen.canvas, { high: !quality.lite, reduceMotion: reduce });
if (!crt.ok) root.classList.add("no-webgl");

function musicFor(cart) {
  let seed = 0;
  for (const ch of cart.id) seed = (seed * 31 + ch.charCodeAt(0)) % 10007;
  return { root: cart.music?.root ?? 57, tempo: cart.music?.tempo ?? 120, seed: seed + 1 };
}

function openLink(href) {
  if (/^mailto:|^tel:/.test(href)) location.href = href;
  else window.open(href, "_blank", "noopener");
}

/* Miroir accessible : le contenu de l’écran en vrai HTML, lu par les lecteurs
   d’écran et parcouru au clavier (Tab) ; le focus se reflète sur l’écran. */
function buildMirror(cart) {
  const m = el.mirror;
  m.innerHTML = "";
  let selIndex = 0;
  const add = (tag, text) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    m.appendChild(n);
    return n;
  };
  const addLink = (parent, label, href) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (!/^mailto:|^tel:/.test(href)) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    const i = selIndex++;
    a.addEventListener("focus", () => screen.focusItem(i));
    a.addEventListener("click", () => sound.select());
    parent.appendChild(a);
  };
  for (const b of cart.blocks) {
    if (b.type === "title") add("h2", b.text);
    else if (b.type === "heading") add("h3", b.text);
    else if (b.type === "text" || b.type === "hero") add("p", b.text);
    else if (b.type === "stats") {
      const dl = add("dl");
      b.items.forEach(([k, v]) => {
        dl.appendChild(Object.assign(document.createElement("dt"), { textContent: k }));
        dl.appendChild(Object.assign(document.createElement("dd"), { textContent: v }));
      });
    } else if (b.type === "bars") {
      const ul = add("ul");
      b.items.forEach(([k, v]) => ul.appendChild(Object.assign(document.createElement("li"), { textContent: `${k} : ${Math.round(v * 100)} %` })));
    } else if (b.type === "tags") {
      const ul = add("ul");
      b.items.forEach((t) => ul.appendChild(Object.assign(document.createElement("li"), { textContent: t })));
    } else if (b.type === "image") add("p", b.alt ? `Image : ${b.alt}` : "Image");
    else if (b.type === "countdown") add("p", `Compte à rebours de ${b.from ?? 9} à 0.`);
    else if (b.type === "link") addLink(add("p"), b.label, b.href);
    else if (b.type === "links") {
      const ul = add("ul");
      b.items.forEach((l) => addLink(ul.appendChild(document.createElement("li")), l.label, l.href));
    }
  }
}

/* ---------------- Étagère & déplacements ---------------- */
const buttons = buildShelf(el.shelf, CARTS);
const mover = new CartMover({ flyLayer: el.fly, seat: el.seat, slot: el.slot, reduceMotion: reduce });

function overConsole(x, y) {
  const rects = [el.console.getBoundingClientRect(), el.tv.getBoundingClientRect()];
  return rects.some((r) => x >= r.left - 30 && x <= r.right + 30 && y >= r.top - 60 && y <= r.bottom + 20);
}

for (const [id, btn] of buttons) {
  tiltOnHover(btn);
  btn.addEventListener("click", () => {
    if (btn.dataset.dragged) return;
    insert(id);
  });
  const cart = CARTS.find((c) => c.id === id);
  const show = () => {
    if (el.caption) el.caption.textContent = `▶ ${cart.title}`;
  };
  btn.addEventListener("pointerenter", () => {
    show();
    if (!touch) sound.hover();
  });
  btn.addEventListener("focus", show);
  btn.addEventListener("pointerleave", () => el.caption && (el.caption.textContent = ""));
  btn.addEventListener("blur", () => el.caption && (el.caption.textContent = ""));
  enableDrag(btn, mover, {
    canStart: () => !busy && current !== id,
    onStart: (b) => {
      sound.whoosh();
      const g = mover.makeGhost(b);
      b.classList.add("is-out");
      return g;
    },
    isOverTarget: overConsole,
    onHover: (on) => el.console.classList.toggle("drop-ready", on),
    onDrop: async (b, ghost, inside) => {
      if (inside && !busy) {
        insert(id, ghost);
      } else {
        busy = true;
        await mover.flyBack(ghost, b);
        b.classList.remove("is-out");
        busy = false;
      }
    },
  });
}

el.eject.addEventListener("click", () => eject());

function say(msg) {
  el.status.textContent = "";
  requestAnimationFrame(() => (el.status.textContent = msg));
}

/* Allume l’écran sur la neige (télé sans cartouche). */
async function tvToSnow() {
  crt.snow = 1;
  crt.roll = 0;
  sound.hiss(1.6);
  await frames(reduce ? 0 : 700, (k) => (crt.power = k));
}

async function insert(id, ghost = null) {
  if (busy || current === id) return;
  const cart = CARTS.find((c) => c.id === id);
  const btn = buttons.get(id);
  if (!cart || !btn) return;
  busy = true;
  sound.unlock();
  if (current) await doEject(false);

  if (!ghost) {
    sound.whoosh();
    ghost = mover.makeGhost(btn);
    btn.classList.add("is-out");
  }
  await mover.flyToSlot(ghost);
  await mover.drop(ghost, (force) => {
    sound.clack();
    sound.thud();
    el.console.classList.remove("shake");
    el.tv.classList.remove("jolt");
    void el.console.offsetWidth;
    el.console.classList.add("shake", "powered");
    if (force > 0.4) el.tv.classList.add("jolt");
    if (navigator.vibrate && touch) navigator.vibrate(18);
  });

  current = cart;
  el.eject.disabled = false;
  buildMirror(cart);
  el.screen.setAttribute("aria-label", `Écran de la télé ONDINE : ${cart.title}`);
  setHash(cart.id);

  sound.powerOn();
  screen.setCart(cart);
  if (crt.power < 0.99) {
    // la télé était éteinte (changement de cartouche) : on la rallume
    crt.snow = 0;
    crt.roll = 0;
    await frames(reduce ? 0 : 600, (k) => (crt.power = k));
  } else {
    // changement de chaîne : la neige décroche puis l’image apparaît
    await frames(reduce ? 0 : 520, (k) => {
      crt.roll = Math.sin(k * Math.PI) * 0.8;
      crt.snow = 1 - k;
    });
  }
  crt.roll = 0;
  crt.snow = 0;
  say(`Cartouche « ${cart.title} » insérée. L’écran s’allume.`);
  busy = false;
  if (lastInput !== "pointer" && !el.screen.contains(document.activeElement)) el.screen.focus({ preventScroll: true });
  if (touch) el.screen.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
}

async function eject() {
  if (busy || !current) return;
  busy = true;
  const id = current.id;
  await doEject(true);
  setHash("");
  say("Cartouche éjectée.");
  busy = false;
  const btn = buttons.get(id);
  if (btn && lastInput !== "pointer") btn.focus({ preventScroll: true });
}

async function doEject(backToSnow) {
  const cart = current;
  current = null;
  el.eject.disabled = true;
  if (zoomed) setZoom(false);
  sound.stopMusic();
  sound.powerOff();
  await frames(reduce ? 0 : 380, (k) => (crt.power = 1 - k));
  screen.clear();
  el.mirror.innerHTML = "";
  el.screen.setAttribute("aria-label", "Écran de la télé ONDINE : aucune cartouche");
  el.console.classList.remove("powered");
  sound.eject();
  const btn = buttons.get(cart.id);
  await mover.ejectTo(btn);
  btn.classList.remove("is-out");
  if (backToSnow) tvToSnow();
}

/* ---------------- Liens profonds ---------------- */
function setHash(id) {
  try {
    history.replaceState(null, "", id ? `#${id}` : location.pathname + location.search);
  } catch {}
}
addEventListener("hashchange", () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id && current) eject();
  else if (buttons.has(id) && current?.id !== id) insert(id);
});

/* ---------------- Clavier, souris, tactile sur l’écran ---------------- */
const KEYMAP = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Enter: "a", " ": "a", Backspace: "b",
};
el.screen.addEventListener("keydown", (e) => {
  if (e.target !== el.screen) return; // les liens du miroir gardent leur comportement natif
  const action = KEYMAP[e.key];
  if (!action || !current) return;
  e.preventDefault();
  screen.input(action);
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (zoomed) setZoom(false);
    else eject();
    return;
  }
  if (e.target.closest && e.target.closest("input, textarea, select")) return;
  // flèches/Entrée sans focus particulier (ex. après un clic) : on pilote l’écran
  const a = document.activeElement;
  const idle = !a || a === document.body || (a.classList && a.classList.contains("is-out"));
  if (current && idle && KEYMAP[e.key]) {
    e.preventDefault();
    screen.input(KEYMAP[e.key]);
    return;
  }
  // touches 1 à 9 : raccourcis vers les cartouches
  if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const c = CARTS[Number(e.key) - 1];
    if (c) insert(c.id);
  }
});

function toSource(e) {
  const r = el.screen.getBoundingClientRect();
  const [u, v] = screenToSource((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  return [u * screen.W, v * screen.H];
}
let drag = null;
el.screen.addEventListener("pointermove", (e) => {
  if (drag && e.pointerId === drag.id) {
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      const r = el.screen.getBoundingClientRect();
      screen.scrollBy((-dy * screen.H) / r.height);
      drag.y = e.clientY;
    }
    return;
  }
  if (e.pointerType === "touch") return;
  const [x, y] = toSource(e);
  el.screen.classList.toggle("pointer", !!current && screen.hover(x, y));
});
el.screen.addEventListener("pointerdown", (e) => {
  drag = { id: e.pointerId, y: e.clientY, moved: false };
});
el.screen.addEventListener("pointerup", (e) => {
  const d = drag;
  drag = null;
  if (!current || (d && d.moved)) return;
  const [x, y] = toSource(e);
  screen.click(x, y);
});
el.screen.addEventListener("pointercancel", () => (drag = null));
el.screen.addEventListener("wheel", (e) => {
  if (!screen.canScroll) return;
  const atTop = screen.scrollTarget <= 0 && e.deltaY < 0;
  const atBottom = screen.scrollTarget >= screen.maxScroll && e.deltaY > 0;
  if (atTop || atBottom) return;
  e.preventDefault();
  screen.scrollBy(e.deltaY * 0.5);
}, { passive: false });

/* ---------------- Manette ---------------- */
const pads = new Gamepads((action) => {
  lastInput = "pad";
  sound.unlock();
  if (current) {
    if (action === "select") eject();
    else screen.input(action);
    return;
  }
  const list = [...buttons.values()];
  const i = list.indexOf(document.activeElement);
  if (action === "left" || action === "up") list[Math.max(0, i - 1)]?.focus();
  else if (action === "right" || action === "down") list[Math.min(list.length - 1, i + 1)]?.focus();
  else if ((action === "a" || action === "start") && i >= 0) insert(list[i].dataset.id);
  else if (i < 0) list[0]?.focus();
});

/* ---------------- Zoom de l’écran ---------------- */
let zoomed = false;
function setZoom(on) {
  zoomed = on;
  document.body.classList.toggle("zoomed", on);
  el.zoomBtn.setAttribute("aria-pressed", String(on));
  el.zoomBtn.setAttribute("aria-label", on ? "Fermer l’écran agrandi" : "Agrandir l’écran");
  requestAnimationFrame(sizeAll);
  if (on) el.screen.focus({ preventScroll: true });
}
el.zoomBtn.addEventListener("click", () => setZoom(!zoomed));
// clic en dehors de l’écran agrandi : on referme
addEventListener("click", (e) => {
  if (zoomed && !el.screen.contains(e.target) && !el.zoomBtn.contains(e.target)) setZoom(false);
});

/* ---------------- Lampe & réveil ---------------- */
el.lamp.addEventListener("click", () => {
  const on = el.lamp.getAttribute("aria-pressed") !== "true";
  el.lamp.setAttribute("aria-pressed", String(on));
  el.room.classList.toggle("lamp-off", !on);
  sound.tone({ type: "square", freq: on ? 1800 : 1200, dur: 0.03, vol: 0.08 });
  sound.noise({ dur: 0.03, vol: 0.2, freq: 3000 });
});
function tickClock() {
  const d = new Date();
  el.clock.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
tickClock();
setInterval(tickClock, 15000);

/* ---------------- Ambiance ---------------- */
const parallax = new Parallax(document.querySelectorAll(".layer"), { max: 20 });
parallax.enabled = !reduce;
const sky = new Sky($("#sky"), { reduceMotion: reduce, lite: quality.lite });
const dust = new Dust($("#dust"), { count: quality.lite ? 0 : 70, reduceMotion: reduce });

// Inclinaison du téléphone : activée au premier toucher (iOS demande la permission)
if (touch && !reduce) addEventListener("touchend", () => parallax.enableTilt(), { once: true });

function sizeAll() {
  const r = el.screen.getBoundingClientRect();
  if (!r.width) return;
  screen.setSize(r.width < 440 ? 320 : 400);
  const dpr = Math.min(window.devicePixelRatio || 1, quality.lite ? 1 : 2);
  crt.resize(r.width, r.height, dpr);
  sky.resize();
  dust.resize();
  measureLights();
}
let resizeT = 0;
addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(sizeAll, 80);
});

/* Lumières vues par la poussière : lampe + télé (positions mises à jour à intervalles). */
let lampPos = null, tvPos = null;
function measureLights() {
  const l = el.lamp.querySelector(".lamp-bulb").getBoundingClientRect();
  const s = el.screen.getBoundingClientRect();
  lampPos = { x: l.left + l.width / 2, y: l.top + l.height / 2 };
  tvPos = { x: s.left + s.width / 2, y: s.top + s.height / 2, w: s.width };
}

/* Couleur moyenne de l’écran → lumière projetée dans la pièce. */
const probe = document.createElement("canvas");
probe.width = 8;
probe.height = 6;
const probeCtx = probe.getContext("2d", { willReadFrequently: true });
let tvColor = [150, 170, 210], tvLevel = 0, sampleAcc = 0;
function sampleScreen() {
  if (crt.snow > 0.5 || !current) {
    tvColor = [150, 168, 210];
    tvLevel = 0.55 * crt.power;
    return;
  }
  probeCtx.drawImage(screen.canvas, 0, 0, 8, 6);
  const d = probeCtx.getImageData(0, 0, 8, 6).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  r /= n;
  g /= n;
  b /= n;
  const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  // on sature un peu pour que la couleur de la cartouche se lise sur les murs
  const max = Math.max(r, g, b, 1);
  tvColor = [r, g, b].map((v) => Math.round((v / max) * 235));
  tvLevel = Math.min(1, 0.45 + lum * 1.4) * crt.power;
}

/* ---------------- Boucle principale ---------------- */
let screenVisible = true;
new IntersectionObserver(([e]) => (screenVisible = e.isIntersecting)).observe(el.screen);

const slowProbe = fpsProbe(() => {
  if (quality.mode !== "auto" || quality.lite) return;
  quality.lite = true;
  applyQuality();
  say("Mode léger activé automatiquement pour garder l’animation fluide.");
});

let last = performance.now(), time = 0, lightAcc = 0, measureAcc = 0;
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  time += dt;
  slowProbe(raw);
  if (!zoomed) parallax.update(dt);
  pads.poll();
  sky.update(dt);

  if (screenVisible) {
    screen.update(dt);
    screen.draw();
    crt.render(time);
  }

  sampleAcc += dt;
  if (sampleAcc > 0.12) {
    sampleAcc = 0;
    sampleScreen();
  }
  lightAcc += dt;
  if (lightAcc > 1 / 30) {
    lightAcc = 0;
    const flicker = reduce ? 1 : 0.9 + Math.random() * 0.1;
    root.style.setProperty("--tv-rgb", tvColor.join(","));
    root.style.setProperty("--tv-k", (tvLevel * flicker).toFixed(3));
  }
  measureAcc += dt;
  if (measureAcc > 0.5) {
    measureAcc = 0;
    measureLights();
  }
  if (dust.count && lampPos) {
    const lampOn = !el.room.classList.contains("lamp-off");
    const L = [];
    if (lampOn) L.push({ x: lampPos.x, y: lampPos.y + 120, rx: 260, ry: 320, k: 0.9 });
    if (tvPos && tvLevel > 0.05) L.push({ x: tvPos.x, y: tvPos.y + tvPos.w * 0.2, rx: tvPos.w * 0.8, ry: tvPos.w * 0.7, k: tvLevel * 0.5 });
    dust.setLights(L);
    dust.update(dt, time);
  }
  requestAnimationFrame(frame);
}

/* ---------------- Démarrage ---------------- */
async function boot() {
  const bar = el.intro.querySelector(".intro-bar");
  let p = 0;
  const setP = (v) => {
    p = Math.max(p, v);
    bar.style.setProperty("--p", p.toFixed(2));
  };
  setP(0.1);
  const minTime = new Promise((r) => setTimeout(r, reduce ? 200 : 1500));
  const msgs = ["Allumage de la chambre…", "On souffle dans les cartouches…", "Réglage de l’antenne…", "Prêt !"];
  let mi = 0;
  const msgT = setInterval(() => {
    mi = Math.min(msgs.length - 2, mi + 1);
    el.introMsg.textContent = msgs[mi];
  }, 500);
  const fonts = Promise.all([
    document.fonts.load('16px "Press Start 2P"'),
    document.fonts.load('20px "VT323"'),
    document.fonts.load('8px "Press Start 2P"', "ÉÈÀ"),
  ]).catch(() => {});
  fonts.then(() => setP(0.7));
  let skip;
  const skipped = new Promise((r) => (skip = r));
  $("#intro-skip").addEventListener("click", () => skip());
  el.intro.classList.add("ready");
  await Promise.race([Promise.all([fonts, minTime]), skipped, new Promise((r) => setTimeout(r, 4000))]);
  clearInterval(msgT);
  setP(1);
  el.introMsg.textContent = msgs[msgs.length - 1];
  applyQuality();
  sizeAll();
  requestAnimationFrame(frame);
  await new Promise((r) => setTimeout(r, reduce ? 50 : 250));
  el.intro.classList.add("done");
  document.body.classList.remove("is-loading");
  setTimeout(() => el.intro.remove(), 1200);
  await new Promise((r) => setTimeout(r, reduce ? 0 : 500));
  await tvToSnow();
  const id = decodeURIComponent(location.hash.slice(1));
  if (buttons.has(id)) insert(id);
}
boot();

if (import.meta.env.DEV) window.__nova = { screen, crt, mover, sound, parallax };
