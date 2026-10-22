/* Parallaxe : chaque calque [data-depth] glisse selon la souris
   (ou l’inclinaison du téléphone). Seuls des transform sont modifiés. */

export class Parallax {
  constructor(layers, { max = 22 } = {}) {
    this.layers = [...layers].map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0 }));
    this.max = max;
    this.tx = 0;
    this.ty = 0;
    this.x = 0;
    this.y = 0;
    this.enabled = true;
    this.baseBeta = null;
    addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      this.tx = (e.clientX / innerWidth) * 2 - 1;
      this.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => {
      this.tx = 0;
      this.ty = 0;
    });
  }

  /* iOS demande une permission, à appeler sur un geste utilisateur. */
  async enableTilt() {
    if (this.tiltOn) return;
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return;
    try {
      if (typeof DOE.requestPermission === "function") {
        const r = await DOE.requestPermission();
        if (r !== "granted") return;
      }
    } catch {
      return;
    }
    this.tiltOn = true;
    addEventListener("deviceorientation", (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (this.baseBeta == null) this.baseBeta = e.beta;
      this.baseBeta += (e.beta - this.baseBeta) * 0.005; // recentre doucement
      this.tx = Math.max(-1, Math.min(1, e.gamma / 25));
      this.ty = Math.max(-1, Math.min(1, (e.beta - this.baseBeta) / 25));
    }, { passive: true });
  }

  update(dt) {
    const k = Math.min(1, dt * 4);
    const tx = this.enabled ? this.tx : 0, ty = this.enabled ? this.ty : 0;
    const nx = this.x + (tx - this.x) * k, ny = this.y + (ty - this.y) * k;
    if (Math.abs(nx - this.x) < 0.0005 && Math.abs(ny - this.y) < 0.0005) return false;
    this.x = nx;
    this.y = ny;
    for (const l of this.layers) {
      const dx = (-this.x * l.depth * this.max).toFixed(2);
      const dy = (-this.y * l.depth * this.max * 0.6).toFixed(2);
      l.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
    return true;
  }
}
