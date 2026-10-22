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
import { Camera } from "./scene/camera.js";
import { hexToRgb } from "./tv/pixel.js";

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
  diveExit: $("#dive-exit"),
  flash: $("#flash"),
  cineSkip: $("#cine-skip"),
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
    // la télé a démarré : la caméra plonge dans l’écran
    if (state === "title" && current && autoDive) {
      autoDive = false;
      enterDive();
    }
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
    } else if (b.type === "list") {
      const ul = add("ul");
      b.items.forEach((entry) => {
        const li = ul.appendChild(document.createElement("li"));
        const [label, text] = Array.isArray(entry) ? entry : [null, entry];
        if (label) li.appendChild(Object.assign(document.createElement("strong"), { textContent: label + " : " }));
        li.appendChild(document.createTextNode(text));
      });
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
    // vibration seulement après un vrai geste (sinon le navigateur la bloque)
    if (navigator.vibrate && touch && navigator.userActivation?.hasBeenActive) navigator.vibrate(18);
  });

  current = cart;
  autoDive = true;
  el.eject.disabled = false;
  el.zoomBtn.disabled = false;
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
  autoDive = false;
  if (dive !== "room") {
    await diveJob;
    await exitDive();
  }
  const cart = current;
  current = null;
  el.eject.disabled = true;
  el.zoomBtn.disabled = true;
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
    // 1er appui : on ressort de l’écran ; 2e appui : on éjecte
    if (cinematic) skipCinematic();
    else if (dive === "dived") exitDive();
    else if (dive === "room") eject();
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
  const [u, v] = screenToSource((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, crt.curve);
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

/* ---------------- Plongée dans l’écran ----------------
   La caméra avance vers la télé jusqu’à ce que l’écran couvre la fenêtre,
   puis l’écran passe en vrai plein écran (net, à la résolution de la fenêtre).
   Échap ou « Revenir dans la chambre » font le trajet inverse. */
const camera = new Camera(el.room);
let dive = "room"; // room → in → dived → out → room
let diveJob = Promise.resolve();
let autoDive = false;

function setDived(on) {
  document.body.classList.toggle("dived", on);
  el.diveExit.hidden = !on;
  crt.curve = on ? 0.55 : 1;
  sizeAll();
}

function enterDive() {
  if (dive !== "room" || !current || cinematic) return diveJob;
  dive = "in";
  diveJob = (async () => {
    sound.dive();
    if (!reduce) {
      document.body.classList.add("camera-moving");
      await camera.move(camera.frame(el.screen.getBoundingClientRect()), 1200);
      // même image : la chambre agrandie est remplacée par l’écran plein écran
      camera.move(null, 0);
      document.body.classList.remove("camera-moving");
    }
    setDived(true);
    if (!reduce) frames(420, (k) => (crt.roll = Math.sin(k * Math.PI) * 0.3)).then(() => (crt.roll = 0));
    if (lastInput !== "pointer") el.screen.focus({ preventScroll: true });
    say("Plongée dans l’écran. Échap pour revenir dans la chambre.");
    dive = "dived";
  })();
  return diveJob;
}

function exitDive() {
  if (dive !== "dived") return diveJob;
  dive = "out";
  diveJob = (async () => {
    sound.surface();
    setDived(false);
    if (!reduce) {
      document.body.classList.add("camera-moving");
      await camera.move(camera.frame(el.screen.getBoundingClientRect()), 0);
      await camera.move(null, 1000);
      document.body.classList.remove("camera-moving");
    }
    if (lastInput !== "pointer") el.zoomBtn.focus({ preventScroll: true });
    dive = "room";
  })();
  return diveJob;
}

el.zoomBtn.addEventListener("click", () => enterDive());
el.diveExit.addEventListener("click", () => exitDive());

/* ---------------- Lampe & réveil ---------------- */
el.lamp.addEventListener("click", () => {
  if (cinematic) return;
  const on = el.lamp.getAttribute("aria-pressed") !== "true";
  setLamp(on);
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
  // tailles de mise en page (insensibles au zoom de la caméra)
  const w = el.screen.offsetWidth, h = el.screen.offsetHeight;
  if (!w) return;
  const dived = document.body.classList.contains("dived");
  if (dived) {
    // plein écran : 1 pixel du jeu ≈ 1,2 à 2,4 pixels CSS, texte bien lisible
    const s = Math.max(1, Math.min(Math.max(1.2, innerHeight / 560), innerWidth / 320));
    screen.setSize(innerWidth / s, innerHeight / s);
  } else screen.setSize(w < 440 ? 320 : 400);
  const dpr = Math.min(window.devicePixelRatio || 1, quality.lite ? 1 : dived ? 1.5 : 2);
  crt.resize(w, h, dpr);
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

/* Lumière de la télé : la couleur d’accent de la cartouche, une intensité qui
   suit la luminosité de l’image, et un léger scintillement. Télé éteinte : la
   chambre s’assombrit et seule la lampe éclaire (--dark). */
const SNOW_RGB = [150, 168, 210];
const probe = document.createElement("canvas");
probe.width = 8;
probe.height = 6;
const probeCtx = probe.getContext("2d", { willReadFrequently: true });
let tvColor = SNOW_RGB, tvLevel = 0, screenLum = 0.5, sampleAcc = 0;
let darkOverride = null, lastDark = "", lastRgb = "";
function sampleScreen() {
  if (!current || crt.snow > 0.5) {
    tvColor = SNOW_RGB;
    screenLum = 0.5;
    return;
  }
  tvColor = hexToRgb(current.palette.accent);
  probeCtx.drawImage(screen.canvas, 0, 0, 8, 6);
  const d = probeCtx.getImageData(0, 0, 8, 6).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  screenLum = sum / (d.length / 4) / 255;
}

function updateLight(t) {
  const snow = !current || crt.snow > 0.5;
  const base = snow ? 0.4 : 0.6 + screenLum * 0.7;
  // scintillement : ondulation lente + petites chutes brèves comme un vrai tube
  const flicker = reduce ? 1 : 0.94 + 0.06 * Math.sin(t * 13.7) * Math.sin(t * 7.3) - (Math.random() < 0.04 ? 0.1 : 0);
  tvLevel = Math.min(1, base * crt.power * flicker);
  root.style.setProperty("--tv-k", tvLevel.toFixed(3));
  const rgb = tvColor.join(",");
  if (rgb !== lastRgb) root.style.setProperty("--tv-rgb", (lastRgb = rgb));
  const lampOff = el.room.classList.contains("lamp-off");
  let dark = crt.power < 0.05 ? 0.72 : snow ? 0.5 : 0.28;
  if (lampOff) dark += 0.12;
  if (darkOverride != null) dark = darkOverride;
  const v = dark.toFixed(2);
  if (v !== lastDark) root.style.setProperty("--dark", (lastDark = v));
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
  if (dive === "room" && !document.body.classList.contains("camera-moving")) parallax.update(dt);
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
    updateLight(time);
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

/* ---------------- Intro cinématique ----------------
   Première visite : noir, pluie, un éclair, la lampe s’allume en grésillant,
   puis la caméra glisse de la fenêtre vers le meuble. Ne se rejoue pas ensuite. */
const INTRO_KEY = "nova16-intro-vue";
let cinematic = false;
let skipCinematic = () => {};
function introSeen() {
  if (new URLSearchParams(location.search).has("intro")) return false; // ?intro : la rejouer
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

function setLamp(on) {
  el.lamp.setAttribute("aria-pressed", String(on));
  el.room.classList.toggle("lamp-off", !on);
}

function lightningFlash() {
  sky.lightning();
  el.flash.animate(
    [{ opacity: 0 }, { opacity: 0.7, offset: 0.06 }, { opacity: 0.08, offset: 0.22 }, { opacity: 0.45, offset: 0.32 }, { opacity: 0 }],
    { duration: 750, easing: "ease-out" }
  );
  setTimeout(() => sound.thunder(), 380);
}

async function playCinematic(revealRoom) {
  cinematic = true;
  busy = true;
  let skipped = false, onSkip;
  const skip = new Promise((r) => (onSkip = r));
  skipCinematic = () => {
    skipped = true;
    onSkip();
  };
  // attend `ms`, ou moins si on passe l’intro
  const beat = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), skip]);

  setLamp(false);
  darkOverride = 0.9;
  sky.rain = sky.rainTarget = 1;
  sound.setRain(true);
  document.body.classList.add("camera-moving");
  const win = document.querySelector(".window").getBoundingClientRect();
  const k = Math.max(1.3, Math.min(2.4, Math.min(innerWidth / win.width, innerHeight / win.height) * 0.7));
  await camera.move(camera.frame(win, { scale: k, contain: true }), 0);
  el.cineSkip.hidden = false;
  el.cineSkip.onclick = () => skipCinematic();
  revealRoom();

  await beat(1500);
  if (!skipped) {
    lightningFlash();
    darkOverride = 0.82;
  }
  await beat(1500);
  // la lampe grésille avant de tenir
  for (const [ms, on] of [[90, 1], [70, 0], [150, 1], [240, 0], [60, 1], [110, 0], [0, 1]]) {
    if (skipped) break;
    setLamp(!!on);
    if (on) sound.crackle();
    await beat(ms);
  }
  setLamp(true);
  if (!skipped) {
    darkOverride = null;
    await beat(350);
  }
  // la caméra glisse jusqu’au meuble
  if (!skipped) await Promise.race([camera.move(null, 2400, "cubic-bezier(0.45, 0, 0.2, 1)"), skip]);
  camera.move(null, 0);
  document.body.classList.remove("camera-moving");
  darkOverride = null;
  el.cineSkip.hidden = true;
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {}
  // l’orage s’éloigne doucement
  setTimeout(() => {
    sky.rainTarget = 0;
    sound.setRain(false);
  }, skipped ? 1500 : 7000);
  cinematic = false;
  busy = false;
  skipCinematic = () => {};
  await tvToSnow();
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
  const id = decodeURIComponent(location.hash.slice(1));
  const finishLoading = () => {
    document.body.classList.remove("is-loading");
    setTimeout(() => el.intro.remove(), 1600);
  };

  // un lien profond ouvre directement sa cartouche : pas d’intro dans ce cas
  if (!reduce && !buttons.has(id) && !introSeen()) {
    await playCinematic(() => {
      // le chargement s’efface vers le noir, puis le noir laisse voir la chambre
      el.intro.classList.add("to-black");
      setTimeout(() => el.intro.classList.add("fade-out"), 420);
      finishLoading();
    });
    return;
  }
  await new Promise((r) => setTimeout(r, reduce ? 50 : 250));
  el.intro.classList.add("done");
  finishLoading();
  await new Promise((r) => setTimeout(r, reduce ? 0 : 500));
  await tvToSnow();
  if (buttons.has(id)) insert(id);
}
boot();

if (import.meta.env.DEV) window.__nova = { screen, crt, mover, sound, parallax, camera, sky, get dive() { return dive; }, get cinematic() { return cinematic; } };
