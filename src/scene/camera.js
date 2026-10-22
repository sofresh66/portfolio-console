/* « Caméra » : on déplace et agrandit toute la chambre (#room) avec un
   transform CSS. Seul le compositeur travaille : fluide même sur mobile.
   Utilisée par la plongée dans l’écran et par l’intro cinématique. */

export const EASE_SOFT = "cubic-bezier(0.65, 0, 0.25, 1)";

export class Camera {
  constructor(room) {
    this.room = room;
    this.view = null; // null = vue normale
    room.style.transformOrigin = "0 0";
  }

  /* Cadrage qui centre `rect` (coordonnées fenêtre, chambre non transformée)
     et l’agrandit jusqu’à couvrir la fenêtre (cover) ou d’un facteur donné.
     Avec contain, la chambre agrandie couvre toujours toute la fenêtre. */
  frame(rect, { scale, cover = true, contain = false } = {}) {
    const R = this.room.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const k = scale ?? (cover ? Math.max(vw / rect.width, vh / rect.height) : Math.min(vw / rect.width, vh / rect.height));
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let x = vw / 2 - R.left - (cx - R.left) * k;
    let y = vh / 2 - R.top - (cy - R.top) * k;
    if (contain) {
      // pas de bord vide : la chambre agrandie doit déborder de la fenêtre
      x = Math.min(-R.left, Math.max(vw - R.left - R.width * k, x));
      y = Math.min(-R.top, Math.max(vh - R.top - R.height * k, y));
    }
    return { x, y, k };
  }

  /* Va vers `view` (ou la vue normale si null) en `ms` millisecondes. */
  move(view, ms = 0, ease = EASE_SOFT) {
    const st = this.room.style;
    this.view = view;
    st.transition = ms ? `transform ${ms}ms ${ease}` : "none";
    st.transform = view ? `translate3d(${view.x.toFixed(1)}px, ${view.y.toFixed(1)}px, 0) scale(${view.k.toFixed(4)})` : "";
    if (!ms) {
      void this.room.offsetWidth; // applique tout de suite
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        this.room.removeEventListener("transitionend", onEnd);
        resolve();
      };
      const onEnd = (e) => e.target === this.room && e.propertyName === "transform" && done();
      const t = setTimeout(done, ms + 120);
      this.room.addEventListener("transitionend", onEnd);
    });
  }
}
