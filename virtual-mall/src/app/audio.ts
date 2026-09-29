/**
 * Ambient soundscape synthesised with Web Audio (no audio files):
 * a soft crowd murmur whose loudness follows the crowd level, plus the
 * occasional two-note PA chime. Off by default; starts only after the
 * shopper turns it on (browsers require a user gesture).
 */
export class Ambience {
  private ctx: AudioContext | null = null;
  private murmur: GainNode | null = null;
  private master: GainNode | null = null;
  private on = false;
  private crowd = 0.5;
  private chimeTimer = 0;

  setAudio(on: boolean) {
    this.on = on;
    if (on) this.start();
    else this.master?.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.3);
  }

  setCrowd(level: number) {
    this.crowd = level;
    if (this.murmur && this.ctx) this.murmur.gain.setTargetAtTime(0.05 + level * 0.22, this.ctx.currentTime, 1.5);
  }

  private start() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(ctx.destination);
        // Brown noise → band-pass ≈ distant voices.
        const len = ctx.sampleRate * 4;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.2;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 420;
        band.Q.value = 0.7;
        const wobble = ctx.createOscillator();
        wobble.frequency.value = 0.15;
        const wobbleGain = ctx.createGain();
        wobbleGain.gain.value = 120;
        wobble.connect(wobbleGain).connect(band.frequency);
        this.murmur = ctx.createGain();
        this.murmur.gain.value = 0.05 + this.crowd * 0.22;
        src.connect(band).connect(this.murmur).connect(this.master);
        src.start();
        wobble.start();
      }
      void this.ctx.resume();
      this.master!.gain.setTargetAtTime(this.on ? 0.6 : 0, this.ctx.currentTime, 0.5);
    } catch {
      /* audio unavailable */
    }
  }

  /** Call every frame; plays a gentle PA chime every minute or two. */
  update(dt: number) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    this.chimeTimer -= dt;
    if (this.chimeTimer > 0) return;
    this.chimeTimer = 60 + Math.random() * 60;
    const t = this.ctx.currentTime;
    [659.25, 523.25].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.45);
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.45 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.45 + 1.4);
      o.connect(g).connect(this.master!);
      o.start(t + i * 0.45);
      o.stop(t + i * 0.45 + 1.5);
    });
  }
}
