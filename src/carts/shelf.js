/* Construction de l’étagère à partir de CARTS + interactions :
   clic/Entrée pour insérer, glisser-déposer jusqu’à la console,
   inclinaison 3D au survol. */
import { drawMotif } from "../tv/pixel.js";

export function buildShelf(list, carts) {
  const buttons = new Map();
  carts.forEach((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cart";
    b.dataset.id = c.id;
    b.style.setProperty("--c", c.color);
    b.style.setProperty("--accent", c.palette.accent);
    b.style.setProperty("--i", i);
    b.setAttribute("aria-label", `Insérer la cartouche « ${c.title} »`);
    b.setAttribute("aria-describedby", "cart-help");
    b.innerHTML = `
      <span class="cart-grip" aria-hidden="true"></span>
      <span class="cart-label" aria-hidden="true">
        <canvas width="48" height="36"></canvas>
        <span class="cart-title"></span>
      </span>
      <span class="cart-stamp" aria-hidden="true">NOVA 16</span>
      <span class="cart-shine" aria-hidden="true"></span>`;
    b.querySelector(".cart-title").textContent = c.title;
    const cv = b.querySelector("canvas");
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    drawMotif(ctx, c.motif, 0, 0, cv.width, cv.height, c.palette.art, 0.6);
    li.appendChild(b);
    list.appendChild(li);
    buttons.set(c.id, b);
  });
  return buttons;
}

/* Inclinaison 3D qui suit le pointeur au survol d’une cartouche. */
export function tiltOnHover(btn) {
  btn.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = btn.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    btn.style.setProperty("--rx", (-y * 18).toFixed(1) + "deg");
    btn.style.setProperty("--ry", (x * 22).toFixed(1) + "deg");
    btn.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(0) + "%");
  });
  btn.addEventListener("pointerleave", () => {
    btn.style.removeProperty("--rx");
    btn.style.removeProperty("--ry");
  });
}

/* Glisser-déposer. hooks :
   canStart()          → false si une animation est en cours
   onStart(btn)        → crée et renvoie le fantôme (mover.makeGhost)
   isOverTarget(x, y)  → vrai si le pointeur est au-dessus de la console/télé
   onHover(bool)       → mise en évidence de la zone de dépôt
   onDrop(btn, ghost, inside) */
export function enableDrag(btn, mover, hooks) {
  let start = null, ghost = null, grab = null, raf = 0, pos = null, vel = 0, over = false;
  const THRESH = 7;

  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !hooks.canStart()) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    // capture immédiate : le premier mouvement peut déjà sortir de la cartouche
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {}
  });

  btn.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!ghost) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESH) return;
      if (!hooks.canStart()) {
        start = null;
        return;
      }
      ghost = hooks.onStart(btn);
      ghost.classList.add("dragging");
      grab = { x: ghost._x - start.x, y: ghost._y - start.y };
      pos = { x: e.clientX + grab.x, y: e.clientY + grab.y };
      vel = 0;
      const follow = () => {
        // le fantôme suit le pointeur avec un léger retard et s’incline selon la vitesse
        const nx = ghost._x + (pos.x - ghost._x) * 0.35;
        const ny = ghost._y + (pos.y - ghost._y) * 0.35;
        vel = vel * 0.8 + (nx - ghost._x) * 0.2;
        mover.put(ghost, nx, ny, Math.max(-28, Math.min(28, vel * 2.2)), 1.12, 0.8);
        raf = requestAnimationFrame(follow);
      };
      raf = requestAnimationFrame(follow);
    }
    pos = { x: e.clientX + grab.x, y: e.clientY + grab.y };
    const o = hooks.isOverTarget(e.clientX, e.clientY);
    if (o !== over) {
      over = o;
      hooks.onHover(o);
    }
  });

  const end = (e, cancelled) => {
    if (!start || (e && e.pointerId !== start.id)) return;
    start = null;
    if (!ghost) return;
    cancelAnimationFrame(raf);
    const g = ghost;
    ghost = null;
    g.classList.remove("dragging");
    hooks.onHover(false);
    const inside = !cancelled && over;
    over = false;
    // le clic qui suit un glisser ne doit pas réinsérer la cartouche
    btn.dataset.dragged = "1";
    setTimeout(() => delete btn.dataset.dragged, 50);
    hooks.onDrop(btn, g, inside);
  };
  btn.addEventListener("pointerup", (e) => end(e, false));
  btn.addEventListener("pointercancel", (e) => end(e, true));
  btn.addEventListener("lostpointercapture", (e) => end(e, false));
}
