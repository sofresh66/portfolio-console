/* Tous les sons sont synthétisés en Web Audio : aucun fichier audio.
   Le son est coupé par défaut ; rien n’est créé avant que le visiteur
   l’active (les navigateurs l’exigent de toute façon). */

const STORE_KEY = "nova16-son";

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.music = null;
    this.wantMusic = null;
    this.lastType = 0;
    try {
      this.enabled = localStorage.getItem(STORE_KEY) === "1";
    } catch {}
    // page en arrière-plan (autre appli, onglet masqué, écran verrouillé) : silence total,
    // la musique reprend là où elle s’était arrêtée au retour
    const onVisibility = () => {
      if (document.visibilityState === "hidden") this.ctx?.suspend();
      else if (this.enabled) this.ctx?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", () => this.ctx?.suspend());
    addEventListener("pageshow", onVisibility);
  }

  /* Doit être appelé depuis un geste utilisateur (clic, touche). */
  unlock() {
    if (!this.enabled || document.visibilityState === "hidden") return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      this.noiseBuf = this.makeNoise();
      this.pulse = this.makePulse(0.125);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().then(() => this.rainWanted && this.setRain(true));
    else if (this.rainWanted) this.setRain(true);
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem(STORE_KEY, on ? "1" : "0");
    } catch {}
    if (on) {
      this.unlock();
      if (this.wantMusic) this.playMusic(this.wantMusic);
    } else {
      this.stopMusic(true);
      if (this.ctx) this.ctx.suspend();
    }
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === "running";
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makePulse(duty) {
    const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(real, imag);
  }

  /* ---------- briques de base ---------- */
  tone({ type = "square", freq = 440, to, dur = 0.1, vol = 0.2, at = 0, wave, bus }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.2, at = 0, freq = 2000, q = 1, type = "bandpass", bus }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  /* ---------- effets ---------- */
  clack() {
    this.noise({ dur: 0.05, vol: 0.5, freq: 3200, q: 2 });
    this.tone({ type: "triangle", freq: 140, to: 60, dur: 0.12, vol: 0.5 });
    this.noise({ dur: 0.08, vol: 0.35, freq: 900, q: 3, at: 0.06 });
  }
  whoosh() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.5);
  }
  eject() {
    this.tone({ type: "square", freq: 320, to: 900, dur: 0.12, vol: 0.08 });
    this.noise({ dur: 0.06, vol: 0.3, freq: 2500, q: 2, at: 0.02 });
  }
  powerOn() {
    this.tone({ type: "sine", freq: 15600, dur: 0.6, vol: 0.02 });
    this.noise({ dur: 0.25, vol: 0.15, freq: 5000, q: 0.5, type: "highpass" });
  }
  powerOff() {
    this.tone({ type: "sine", freq: 900, to: 60, dur: 0.3, vol: 0.12 });
  }
  boot() {
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => this.tone({ wave: this.pulse, freq: midi(n), dur: 0.18, vol: 0.12, at: i * 0.07 }));
    this.tone({ type: "triangle", freq: midi(48), dur: 0.6, vol: 0.25, at: 0.28 });
    this.tone({ type: "square", freq: midi(88), dur: 0.5, vol: 0.06, at: 0.28 });
  }
  start() {
    this.tone({ type: "square", freq: midi(84), dur: 0.08, vol: 0.1 });
    this.tone({ type: "square", freq: midi(91), dur: 0.2, vol: 0.1, at: 0.08 });
  }
  blip() {
    this.tone({ type: "square", freq: 880, dur: 0.04, vol: 0.06 });
  }
  select() {
    this.tone({ type: "square", freq: 660, dur: 0.05, vol: 0.08 });
    this.tone({ type: "square", freq: 1320, dur: 0.1, vol: 0.08, at: 0.05 });
  }
  back() {
    this.tone({ type: "square", freq: 660, to: 330, dur: 0.1, vol: 0.07 });
  }
  type() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastType < 0.045) return;
    this.lastType = now;
    this.tone({ wave: this.pulse, freq: 1200 + Math.random() * 300, dur: 0.025, vol: 0.025 });
  }
  tick() {
    this.tone({ type: "square", freq: 523, dur: 0.07, vol: 0.07 });
  }
  coin() {
    this.tone({ type: "square", freq: midi(83), dur: 0.08, vol: 0.09 });
    this.tone({ type: "square", freq: midi(88), dur: 0.35, vol: 0.09, at: 0.08 });
  }
  hover() {
    this.tone({ type: "triangle", freq: 1400, dur: 0.03, vol: 0.04 });
  }
  thud() {
    this.tone({ type: "sine", freq: 90, to: 50, dur: 0.15, vol: 0.3 });
  }
  hiss(dur = 1.4) {
    this.noise({ dur, vol: 0.05, freq: 6000, q: 0.3, type: "highpass" });
  }
  dive() {
    if (!this.ready) return;
    this.whoosh();
    this.tone({ type: "sine", freq: 180, to: 900, dur: 1.1, vol: 0.06 });
    this.tone({ type: "triangle", freq: 90, to: 360, dur: 1.2, vol: 0.08, at: 0.05 });
  }
  surface() {
    this.whoosh();
    this.tone({ type: "sine", freq: 900, to: 160, dur: 0.9, vol: 0.05 });
  }
  thunder() {
    this.noise({ dur: 2.6, vol: 0.5, freq: 140, q: 0.7, type: "lowpass" });
    this.noise({ dur: 0.5, vol: 0.25, freq: 900, q: 0.8, type: "lowpass", at: 0.05 });
    this.tone({ type: "sine", freq: 55, to: 38, dur: 2.2, vol: 0.25, at: 0.1 });
  }
  crackle() {
    this.noise({ dur: 0.03 + Math.random() * 0.04, vol: 0.25, freq: 2500 + Math.random() * 2000, q: 3 });
    this.tone({ type: "sawtooth", freq: 100, dur: 0.06, vol: 0.03 });
  }

  /* Pluie en boucle. Mémorisée comme souhait : elle démarre dès que l’audio
     est débloqué si la pluie tombe encore. */
  setRain(on) {
    this.rainWanted = on;
    if (on && !this.rainNode && this.ready) {
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      // arrivée progressive et volume discret : un fond d’ambiance, pas une averse
      g.gain.setTargetAtTime(0.03, t, 1.2);
      s.connect(lp).connect(hp).connect(g).connect(this.sfxBus);
      s.start();
      this.rainNode = { s, g };
    } else if (!on && this.rainNode) {
      const { s, g } = this.rainNode;
      this.rainNode = null;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      s.stop(t + 6.1);
    }
  }

  /* ---------- musique chiptune ---------- */
  playMusic(cfg) {
    this.wantMusic = cfg;
    if (!this.ready) return;
    this.stopMusic(true);
    const seq = compose(cfg);
    const spb = 60 / (cfg.tempo || 120) / 2; // croches
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    bus.connect(this.musicBus);
    const m = { seq, spb, step: 0, next: this.ctx.currentTime + 0.1, bus };
    m.timer = setInterval(() => this.schedule(m), 30);
    this.music = m;
  }

  schedule(m) {
    if (!this.ready) return;
    while (m.next < this.ctx.currentTime + 0.15) {
      const i = m.step % m.seq.length;
      const s = m.seq[i];
      const at = m.next - this.ctx.currentTime;
      if (s.lead) this.tone({ wave: this.pulse, freq: midi(s.lead), dur: m.spb * (s.len || 1) * 0.9, vol: 0.07, at, bus: m.bus });
      if (s.bass) this.tone({ type: "triangle", freq: midi(s.bass), dur: m.spb * 1.8, vol: 0.22, at, bus: m.bus });
      if (s.arp) this.tone({ type: "square", freq: midi(s.arp), dur: m.spb * 0.45, vol: 0.025, at, bus: m.bus });
      if (s.hat) this.noise({ dur: 0.03, vol: 0.05, freq: 8000, q: 1, type: "highpass", at, bus: m.bus });
      if (s.kick) this.tone({ type: "sine", freq: 120, to: 45, dur: 0.12, vol: 0.3, at, bus: m.bus });
      m.next += m.spb;
      m.step++;
    }
  }

  stopMusic(keepWish = false) {
    if (!keepWish) this.wantMusic = null;
    const m = this.music;
    if (!m) return;
    clearInterval(m.timer);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setValueAtTime(m.bus.gain.value, t);
      m.bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      setTimeout(() => m.bus.disconnect(), 400);
    }
    this.music = null;
  }
}

function midi(n) {
  return 440 * 2 ** ((n - 69) / 12);
}

/* Compose une boucle de 4 mesures à partir d’une note de base :
   progression i–VI–III–VII, basse, arpèges et mélodie pentatonique
   tirée au sort de façon déterministe (même cartouche = même musique). */
function compose({ root = 57, seed = 1 }) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const chords = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
  const penta = [0, 3, 5, 7, 10, 12, 15];
  const seq = [];
  let last = 3;
  for (let bar = 0; bar < 4; bar++) {
    const ch = chords[bar];
    for (let st = 0; st < 8; st++) {
      const step = {};
      if (st % 2 === 0) step.bass = root - 12 + ch[0] + (st === 4 ? 12 : 0);
      step.arp = root + 12 + ch[st % 3];
      if (st % 2 === 1) step.hat = true;
      if (st === 0 || st === 4) step.kick = true;
      if (rnd() > 0.35 || st === 0) {
        last = Math.max(0, Math.min(penta.length - 1, last + Math.round((rnd() - 0.5) * 3)));
        step.lead = root + 12 + penta[last];
        step.len = rnd() > 0.7 ? 2 : 1;
      }
      seq.push(step);
    }
  }
  return seq;
}
