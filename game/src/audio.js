// Ashlight — synthesized sound. One job: every effect is an oscillator or a
// filtered noise burst made at run time, so the game ships no audio files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  // Call from a user gesture; browsers block audio before one.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  play(event) {
    switch (event.type) {
      case 'shoot':
        this.tone(720 + Math.random() * 120, 0.07, 'square', 0.12, 320);
        break;
      case 'hit':
        this.tone(220, 0.05, 'triangle', 0.14, 140);
        break;
      case 'kill':
        this.noise(0.18, 0.25, event.big ? 900 : 1400);
        this.tone(event.big ? 160 : 240, 0.16, 'sawtooth', 0.12, 60);
        break;
      case 'pickup':
        this.tone(880, 0.1, 'sine', 0.16, 1320);
        break;
      case 'hurt':
        this.tone(130, 0.22, 'sawtooth', 0.25, 55);
        this.noise(0.12, 0.2, 500);
        break;
      case 'dash':
        this.noise(0.14, 0.16, 2400);
        break;
      case 'lunge':
        this.tone(340, 0.12, 'square', 0.1, 180);
        break;
      case 'orb':
        this.tone(420, 0.08, 'sine', 0.1, 300);
        break;
      case 'wave':
        this.tone(392, 0.12, 'triangle', 0.16);
        setTimeout(() => this.tone(523, 0.12, 'triangle', 0.16), 110);
        break;
      case 'waveclear':
        [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.18), i * 110));
        break;
      case 'upgrade':
        [660, 880, 990].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'sine', 0.16), i * 80));
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, 'triangle', 0.18), i * 150));
        break;
      case 'defeat':
        [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.12), i * 180));
        break;
      default:
        break;
    }
  }
}
