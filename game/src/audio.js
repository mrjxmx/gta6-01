// Solano Heat — every sound is synthesized with WebAudio: no audio files, nothing to load.
// Short one-shots (gunshot, crash, blips, jingles) are built from oscillators and filtered
// noise; the engine and the police siren are continuous nodes whose pitch follows the game.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  /** Create the context on the first user gesture (browsers refuse it before then). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A short tone with an envelope. */
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise: gunshots, crashes, skids, surf on the shore. */
  noise(dur, vol = 0.3, freq = 1200, q = 0.8, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t0);
  }

  click() { this.tone(660, 0.06, 'square', 0.08); }
  pickup() { this.tone(880, 0.09, 'sine', 0.18); this.tone(1318, 0.14, 'sine', 0.16, null, 0.07); }
  cash() { [990, 1180, 1480].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.16, null, i * 0.06)); }
  checkpoint() { this.tone(740, 0.08, 'triangle', 0.18); this.tone(1108, 0.12, 'triangle', 0.18, null, 0.06); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.18, null, i * 0.09)); }
  missionFail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.16, null, i * 0.11)); }
  gunshot() { this.noise(0.14, 0.5, 900, 0.4); this.tone(160, 0.1, 'square', 0.22, 60); }
  crash(hard) { this.noise(hard ? 0.3 : 0.16, hard ? 0.5 : 0.28, 300, 0.5); this.tone(90, 0.18, 'sine', 0.3, 45); }
  skid() { this.noise(0.12, 0.06, 2600, 2.5); }
  door() { this.tone(220, 0.07, 'square', 0.1, 140); }
  busted() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.24, 'sawtooth', 0.1, null, i * 0.13)); }
  wasted() { this.tone(196, 0.7, 'sawtooth', 0.14, 49); }

  /** Start/stop the continuous engine hum; pitch and volume follow speed each frame. */
  setEngine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on ? 0.05 + speedRatio * 0.05 : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, this.ctx.currentTime, 0.06);
      if (!on) { const osc = this.engineOsc; this.engineOsc = null; setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 300); }
    }
  }

  /** The two-tone siren, audible when a police car is near; call every frame. */
  setSiren(on, dt) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    }
    if (this.sirenOsc) {
      if (!on) {
        const osc = this.sirenOsc; this.sirenOsc = null;
        setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 120);
        return;
      }
      this.sirenTimer += dt;
      this.sirenOsc.frequency.value = (this.sirenTimer % 0.72) < 0.36 ? 702 : 936;
    }
  }
}
