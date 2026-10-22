/* Choix automatique entre le rendu complet et une version allégée
   (mobiles, petites machines, économie de données), avec une sonde de
   fluidité qui bascule en mode léger si les images par seconde chutent. */

const KEY = "nova16-qualite";

export function initialQuality() {
  const param = new URLSearchParams(location.search).get("qualite");
  if (param === "legere" || param === "haute") return { mode: param, lite: param === "legere" };
  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {}
  if (stored === "legere" || stored === "haute") return { mode: stored, lite: stored === "legere" };
  return { mode: "auto", lite: weakDevice() };
}

export function storeQuality(mode) {
  try {
    if (mode === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
}

export function weakDevice() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  const saveData = navigator.connection && navigator.connection.saveData;
  return coarse || small || cores < 4 || mem < 4 || !!saveData;
}

/* Mesure la durée moyenne des images ; appelle onSlow() une seule fois
   si la moyenne dépasse ~40 ms (moins de 25 i/s) pendant 3 secondes. */
export function fpsProbe(onSlow) {
  let acc = 0, n = 0, slowFor = 0, done = false, warm = 0;
  return (dt) => {
    if (done) return;
    // onglet masqué ou ralenti par le navigateur : ces images ne comptent pas
    if (document.visibilityState !== "visible" || dt > 0.2) {
      acc = 0;
      n = 0;
      return;
    }
    warm += dt;
    if (warm < 2) return; // on ignore le démarrage
    acc += dt;
    n++;
    if (acc >= 1) {
      const avg = acc / n;
      slowFor = avg > 0.04 ? slowFor + 1 : 0;
      acc = 0;
      n = 0;
      if (slowFor >= 3) {
        done = true;
        onSlow();
      }
    }
  };
}
