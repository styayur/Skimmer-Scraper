type AudioContextClass = new () => AudioContext;

const audioContextClass = (): AudioContextClass | null => {
  const constructors = window as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return constructors.AudioContext ?? constructors.webkitAudioContext ?? null;
};

/**
 * Fully synthesized aircraft audio. No network or audio files are used.
 * The AudioContext is created only from a user gesture to respect autoplay rules.
 */
export class FlightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private engineOscillators: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private paused = false;
  private started = false;

  public get supported(): boolean {
    return audioContextClass() !== null;
  }

  public start(): void {
    if (!this.supported) return;
    if (!this.context) this.createGraph();
    if (!this.context || !this.master || !this.engineGain) return;
    this.started = true;
    this.paused = false;
    void this.context.resume();
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.context.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.13, this.context.currentTime, 0.1);
  }

  public pause(): void {
    if (!this.context || !this.master || !this.engineGain) return;
    this.paused = true;
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.035, this.context.currentTime, 0.14);
  }

  public resume(): void {
    if (!this.context || !this.master || !this.engineGain || !this.started) return;
    this.paused = false;
    void this.context.resume();
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.context.currentTime, 0.08);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.paused ? 0 : 0.24, this.context.currentTime, 0.05);
  }

  public update(speed: number, boosting: boolean, proximity = 0): void {
    if (!this.context || !this.engineFilter || !this.engineGain || !this.noiseGain || this.paused) return;
    const now = this.context.currentTime;
    const speedFactor = Math.max(0, Math.min(1.4, speed / 100));
    const frequency = 42 + speedFactor * 48 + (boosting ? 28 : 0);
    this.engineFilter.frequency.setTargetAtTime(420 + speedFactor * 860 + (boosting ? 380 : 0), now, 0.12);
    this.engineGain.gain.setTargetAtTime(0.09 + speedFactor * 0.075, now, 0.15);
    const proximityFactor = Math.max(0, Math.min(1, proximity));
    this.noiseGain.gain.setTargetAtTime(0.018 + speedFactor * 0.04 + (boosting ? 0.025 : 0) + proximityFactor * 0.055, now, 0.18);
    for (const [index, oscillator] of this.engineOscillators.entries()) {
      oscillator.frequency.setTargetAtTime(frequency * (index === 0 ? 1 : 1.505), now, 0.15);
    }
  }

  public fail(): void {
    if (!this.context || !this.master || !this.engineGain || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    this.engineGain.gain.setTargetAtTime(0.01, now, 0.08);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.3, now, 0.02);

    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.7);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.34, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.8);
  }

  public stop(): void {
    this.started = false;
    this.paused = true;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
  }

  public dispose(): void {
    for (const oscillator of this.engineOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Oscillator may already be stopped by the audio context.
      }
    }
    this.engineOscillators = [];
    void this.context?.close();
    this.context = null;
  }

  private createGraph(): void {
    const Context = audioContextClass();
    if (!Context) return;
    const context = new Context();
    this.context = context;

    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.master = master;

    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 650;
    engineFilter.Q.value = 1.8;
    const engineGain = context.createGain();
    engineGain.gain.value = 0.001;
    engineFilter.connect(engineGain).connect(master);
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;

    const descriptors: Array<{ type: OscillatorType; detune: number; level: number }> = [
      { type: 'sawtooth', detune: -7, level: 0.035 },
      { type: 'triangle', detune: 9, level: 0.025 },
    ];
    for (const descriptor of descriptors) {
      const oscillator = context.createOscillator();
      oscillator.type = descriptor.type;
      oscillator.frequency.value = 58;
      oscillator.detune.value = descriptor.detune;
      const gain = context.createGain();
      gain.gain.value = descriptor.level;
      oscillator.connect(gain).connect(engineFilter);
      oscillator.start();
      this.engineOscillators.push(oscillator);
    }

    const duration = 2;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[index] = last * 1.8;
    }
    this.noiseBuffer = buffer;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 920;
    noiseFilter.Q.value = 0.6;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.001;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();
    this.noiseGain = noiseGain;
  }
}
