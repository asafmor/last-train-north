// Web Audio: CC0/CC-BY samples from assets/audio (see CREDITS.md) with procedural fallbacks.
// Continuous layers follow the train: rolling rumble and rail-joint clacks scale with speed,
// steam chuffs are locked to wheel revolutions (Ironclad), diesel drone to throttle (Vanguard).
const SAMPLES = ['shot_mg', 'shot_cannon', 'enemy_shot', 'rocket', 'explosion1', 'explosion2', 'explosion_big', 'impact1', 'impact2',
  'clack', 'clack2', 'hammer', 'debris', 'rocks', 'chuff', 'whistle', 'boiler_loop', 'engine_loop', 'rumble_loop',
  'ding', 'chimes', 'alarm', 'click', 'negative'];
const JOINT = 12.5; // metres between rail joints
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

export class AudioManager {
  constructor() { this.ctx = null; this.buf = {}; this.loops = {}; this.jointDist = 0; this.chuffPhase = 0; this.pending = []; }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.7;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Samples load in the background; anything missing falls back to synthesis.
      for (const n of SAMPLES) fetch(`assets/audio/${n}.ogg`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((a) => ctx.decodeAudioData(a)).then((b) => { this.buf[n] = b; if (n.endsWith('_loop')) this.startLoop(n); })
        .catch((e) => console.warn('Sound unavailable, using synthesis:', n, e));
    } catch (e) {
      console.warn('Audio unavailable:', e);
      this.ctx = null;
    }
  }
  get ok() { return this.ctx && this.ctx.state === 'running'; }

  startLoop(n) {
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = this.buf[n]; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(this.master); src.start();
    this.loops[n] = { src, g };
  }

  // One-shot sample: rate/volume jitter so repeats don't sound identical.
  play(name, vol = 1, rate = 1, when = 0) {
    if (!this.ok) return false;
    const b = this.buf[name]; if (!b) return false;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = b; src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    g.gain.value = vol;
    src.connect(g).connect(this.master); src.start(c.currentTime + when);
    return true;
  }
  burst(dur, freq, q, vol, type = 'bandpass', when = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', when = 0, slideTo = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // Distance attenuation for world sounds (metres from the train).
  att(d) { return d === undefined ? 1 : Math.max(0.08, 1 - d / 140); }

  shot(model) {
    if (model === 'diesel') this.play('shot_mg', 0.55, 1.1) || this.burst(0.1, 1800, 0.7, 0.4);
    else this.play('shot_cannon', 0.7, 1.15) || (this.burst(0.16, 1500, 0.7, 0.5), this.tone(120, 0.12, 0.3, 'square', 0, 45));
  }
  enemyShot(d) { this.play('enemy_shot', 0.45 * this.att(d), 1.2) || this.burst(0.1, 2400, 1, 0.14 * this.att(d)); }
  rocket(d) { this.play('rocket', 0.6 * this.att(d), 0.8) || this.burst(0.6, 700, 0.5, 0.3); }
  hit() { this.play(pickOne(['impact1', 'impact2']), 0.35, 1.6) || this.burst(0.08, 3000, 1.5, 0.2); }
  impact() { this.play(pickOne(['impact1', 'impact2']), 0.8, 0.85) || (this.burst(0.35, 380, 0.7, 0.7, 'lowpass'), this.tone(70, 0.3, 0.3, 'sine', 0, 35)); }
  explosion(d) { this.play(pickOne(['explosion1', 'explosion2']), 0.85 * this.att(d), 0.8) || (this.burst(0.9, 280, 0.5, 0.9, 'lowpass'), this.tone(70, 0.7, 0.5, 'sine', 0, 25)); }
  bigExplosion() { this.play('explosion_big', 1, 0.7) || this.explosion(); this.play('explosion2', 0.6, 0.6, 0.08); }
  debris(kind) { this.play(kind === 'rock' ? 'rocks' : 'debris', 0.8) || this.burst(0.4, 600, 0.6, 0.5, 'lowpass'); }
  click() { this.play('click', 0.5) || this.tone(900, 0.05, 0.1, 'square'); }
  deny() { this.play('negative', 0.5) || this.click(); }
  chime() { this.play('ding', 0.6) || [660, 880, 1100].forEach((f, i) => this.tone(f, 0.3, 0.16, 'triangle', i * 0.09)); }
  reward() { this.play('chimes', 0.55) || this.chime(); }
  warn() { this.play('alarm', 0.35, 1.1) || (this.tone(440, 0.14, 0.15, 'square'), this.tone(440, 0.14, 0.15, 'square', 0.22)); }
  work() { this.play('hammer', 0.35, 1 + Math.random() * 0.1) || this.burst(0.08, 1800, 3, 0.15); }
  whistle(model) { if (model === 'diesel') { this.tone(311, 1.1, 0.12, 'sawtooth'); this.tone(392, 1.1, 0.1, 'sawtooth'); } else this.play('whistle', 0.45) || this.tone(520, 1, 0.15, 'triangle'); }
  victory() { this.reward(); this.whistle(); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, 0.12, 'triangle', 0.4 + i * 0.18)); }
  gameOver() { this.play('negative', 0.6, 0.8) || [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.7, 0.18, 'sawtooth', i * 0.25)); }

  // Continuous train soundscape. running=false fades everything out (menus, pause, end).
  update(dt, speed, throttle, running, model = 'steam', axles = [0]) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, a = Math.abs(speed), v = Math.min(1, a / 16), th = Math.abs(throttle);
    const set = (n, gain, rate) => { const L = this.loops[n]; if (!L) return; L.g.gain.setTargetAtTime(running ? gain : 0, t, 0.25); if (rate) L.src.playbackRate.setTargetAtTime(rate, t, 0.3); };
    set('rumble_loop', 0.05 + v * 0.55, 0.55 + v * 0.9);
    if (model === 'diesel') { set('engine_loop', 0.12 + th * 0.28 + v * 0.08, 0.7 + th * 0.35 + v * 0.3); set('boiler_loop', 0); }
    else { set('boiler_loop', 0.06 + th * 0.08, 0.9 + th * 0.2); set('engine_loop', 0); }
    if (!running) return;
    // Rail joints: every axle group of every vehicle clacks as it crosses the joint.
    this.jointDist += a * dt;
    if (this.jointDist > JOINT && a > 0.5) {
      this.jointDist -= JOINT;
      const vol = 0.12 + v * 0.35;
      for (let i = 0; i < axles.length && i < 10; i++) this.play(i % 2 ? 'clack2' : 'clack', vol * (1 - i * 0.05), 0.8 + v * 0.4, axles[i] / a) || this.burst(0.05, 1100, 3, vol * 0.5, 'bandpass', axles[i] / a);
    }
    // Steam chuffs: 4 per driving-wheel revolution; a slow idle breath when stopped.
    if (model !== 'diesel') {
      const rate = a > 0.3 ? (a / (2 * Math.PI * 0.75)) * 4 : 0.6;
      this.chuffPhase += rate * dt;
      if (this.chuffPhase >= 1) {
        this.chuffPhase %= 1;
        const vol = a > 0.3 ? 0.12 + th * 0.4 : 0.06;
        this.play('chuff', vol * (rate > 14 ? 0.6 : 1), 0.85 + v * 0.3) || this.burst(0.12, 500, 0.6, vol, 'lowpass');
      }
    }
  }
}
