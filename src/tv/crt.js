/* Shader CRT de la télé ONDINE : courbure, aberration chromatique,
   scanlines, masque RGB, bruit, scintillement, halo, neige et
   animation d’allumage/extinction. Repli en canvas 2D sans WebGL. */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;      // taille de sortie en pixels
uniform vec2 uSrc;      // résolution du jeu
uniform float uTime;
uniform float uSnow;    // 0 = image du jeu, 1 = neige
uniform float uPower;   // 0 = éteint, 1 = allumé
uniform float uHigh;    // 1 = qualité haute, 0 = allégée
uniform float uMotion;  // 0 si prefers-reduced-motion
uniform float uRoll;    // décrochage d’image (changement de chaîne)
uniform float uCurve;   // 1 = télé bombée, plus faible en plongée plein écran

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec2 curve(vec2 uv){
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) / vec2(5.4, 4.4) * uCurve;
  uv = uv + uv * o * o;
  return uv * 0.5 + 0.5;
}

vec3 sampleTex(vec2 c, float ca){
  vec3 col;
  col.r = texture2D(uTex, c + vec2(ca, 0.0)).r;
  col.g = texture2D(uTex, c).g;
  col.b = texture2D(uTex, c - vec2(ca, 0.0)).b;
  return col;
}

void main(){
  vec2 uv = curve(vUv);
  // bord arrondi de l’écran
  vec2 edge = smoothstep(vec2(0.0), vec2(0.012), uv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - uv);
  float inside = edge.x * edge.y;

  // allumage : un point → une ligne → l’image
  float p = clamp(uPower, 0.0, 1.0);
  float sx = mix(0.002, 1.0, smoothstep(0.0, 0.3, p));
  float sy = mix(0.004, 1.0, smoothstep(0.3, 0.85, p));
  vec2 c = (uv - 0.5) / vec2(sx, sy) + 0.5;
  float inImg = step(0.0, c.x) * step(c.x, 1.0) * step(0.0, c.y) * step(c.y, 1.0);

  // décrochage horizontal et vertical léger
  float t = uTime * uMotion;
  float wob = sin(c.y * 40.0 + t * 6.0) * 0.0006 * uMotion;
  c.x += wob + uRoll * 0.02 * sin(c.y * 12.0 + t * 30.0);
  c.y = fract(c.y + uRoll * t * 0.6);

  vec2 d = c - 0.5;
  float ca = (0.0009 + dot(d, d) * 0.006) * (1.0 + uRoll * 3.0);
  vec3 col = sampleTex(c, ca);

  // halo lumineux (bloom bon marché)
  if (uHigh > 0.5) {
    vec2 px = 1.5 / uSrc;
    vec3 b = texture2D(uTex, c + vec2(px.x, 0.0)).rgb + texture2D(uTex, c - vec2(px.x, 0.0)).rgb
           + texture2D(uTex, c + vec2(0.0, px.y)).rgb + texture2D(uTex, c - vec2(0.0, px.y)).rgb
           + texture2D(uTex, c + px * 2.0).rgb + texture2D(uTex, c - px * 2.0).rgb;
    col += max(b / 6.0 - 0.35, 0.0) * 0.55;
  }

  // neige
  vec2 g = floor(c * uSrc * vec2(1.0, 0.5));
  float n = hash(g + floor(uTime * 30.0 * max(uMotion, 0.08)) * vec2(17.0, 31.0));
  float band = 0.75 + 0.25 * sin(c.y * 7.0 - uTime * 3.0 * uMotion);
  vec3 snow = vec3(n * band) * vec3(0.86, 0.92, 1.0);
  col = mix(col, snow, uSnow);

  // scanlines alignées sur les lignes du jeu
  float sl = 0.5 + 0.5 * cos(c.y * uSrc.y * 6.2831853);
  col *= mix(1.0, 0.68 + 0.32 * sl, 0.9);

  // masque RGB (grille d’ouverture)
  if (uHigh > 0.5) {
    float m = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(m < 1.0 ? 1.0 : 0.82, (m >= 1.0 && m < 2.0) ? 1.0 : 0.82, m >= 2.0 ? 1.0 : 0.82);
    col *= mask * 1.12;
  }

  // grain + scintillement + barre de balayage
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.045;
  col *= 0.975 + 0.025 * sin(uTime * 120.0) * uMotion;
  float bar = smoothstep(0.0, 0.06, 0.06 - abs(fract(c.y - uTime * 0.12 * uMotion) - 0.5));
  col *= 1.0 + bar * 0.05;

  // vignette
  vec2 vv = uv * (1.0 - uv.yx);
  col *= pow(clamp(vv.x * vv.y * 18.0, 0.0, 1.0), 0.28);

  // flash blanc à l’allumage
  float flash = (1.0 - smoothstep(0.3, 1.0, p)) * step(0.001, p);
  col = mix(col, vec3(1.0), flash * 0.85);

  col *= inImg * inside;
  gl_FragColor = vec4(col, 1.0);
}`;

export class CRT {
  constructor(canvas, source, { high = true, reduceMotion = false } = {}) {
    this.canvas = canvas;
    this.source = source;
    this.high = high;
    this.motion = reduceMotion ? 0 : 1;
    this.snow = 1;
    this.power = 0;
    this.roll = 0;
    this.curve = 1;
    const opts = { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" };
    this.gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (this.gl) {
      try {
        this.init();
      } catch (e) {
        console.warn("CRT : WebGL indisponible, repli 2D.", e);
        this.gl = null;
      }
    }
    if (!this.gl) this.ctx2d = canvas.getContext("2d");
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.init();
    });
  }

  get ok() {
    return !!this.gl;
  }

  init() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = {};
    for (const n of ["uTex", "uRes", "uSrc", "uTime", "uSnow", "uPower", "uHigh", "uMotion", "uRoll", "uCurve"]) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uTex, 0);
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(time) {
    const src = this.source;
    if (this.gl && !this.lost) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.u.uSrc, src.width, src.height);
      gl.uniform1f(this.u.uTime, time % 1000);
      gl.uniform1f(this.u.uSnow, this.snow);
      gl.uniform1f(this.u.uPower, this.power);
      gl.uniform1f(this.u.uHigh, this.high ? 1 : 0);
      gl.uniform1f(this.u.uMotion, this.motion);
      gl.uniform1f(this.u.uRoll, this.roll);
      gl.uniform1f(this.u.uCurve, this.curve);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }
    // Repli 2D : image + neige simple, les scanlines viennent du CSS
    const ctx = this.ctx2d, w = this.canvas.width, h = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const sy = Math.min(1, this.power * 1.6);
    ctx.globalAlpha = 1 - this.snow;
    ctx.drawImage(src, 0, (h * (1 - sy)) / 2, w, h * sy);
    ctx.globalAlpha = 1;
    if (this.snow > 0.01) {
      ctx.globalAlpha = this.snow;
      const s = 4;
      for (let y = 0; y < h; y += s)
        for (let x = 0; x < w; x += s * 2) {
          const v = (Math.random() * 255) | 0;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, y, s * 2, s);
        }
      ctx.globalAlpha = 1;
    }
  }
}

/* Même déformation que curve() du shader : pixel de l’écran → coordonnées du jeu. */
export function screenToSource(u, v, curve = 1) {
  let x = u * 2 - 1, y = v * 2 - 1;
  const ox = (Math.abs(y) / 5.4) * curve, oy = (Math.abs(x) / 4.4) * curve;
  x = x + x * ox * ox;
  y = y + y * oy * oy;
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}
