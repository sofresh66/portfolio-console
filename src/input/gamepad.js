/* Manette : lue à chaque image, émet des actions sur front montant
   (haut/bas/gauche/droite, a, b, start, select). */
const MAP = { 12: "up", 13: "down", 14: "left", 15: "right", 0: "a", 1: "b", 9: "start", 8: "select" };

export class Gamepads {
  constructor(onAction) {
    this.onAction = onAction;
    this.prev = {};
    this.active = false;
    addEventListener("gamepadconnected", () => (this.active = true));
  }

  poll() {
    if (!this.active || !navigator.getGamepads) return;
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      const now = {};
      for (const [i, name] of Object.entries(MAP)) if (gp.buttons[i] && gp.buttons[i].pressed) now[name] = true;
      const [ax = 0, ay = 0] = gp.axes;
      if (ax < -0.6) now.left = true;
      if (ax > 0.6) now.right = true;
      if (ay < -0.6) now.up = true;
      if (ay > 0.6) now.down = true;
      const key = gp.index;
      const before = this.prev[key] || {};
      for (const name of Object.keys(now)) if (!before[name]) this.onAction(name);
      this.prev[key] = now;
    }
  }
}
