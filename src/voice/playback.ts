import { SPEECH_RATE } from './deepSeekVoice';
import type { VoiceIdentity } from './voiceContracts';

const framesPerBuffer = 2_400;

export const delay = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const abort = () => { window.clearTimeout(timer); reject(signal.reason); };
  const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
  signal.addEventListener('abort', abort, { once: true });
});

/** Queue small raw PCM buffers ahead of playback, with backpressure on the network reader. */
export class RadioAudio {
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly bandHigh: BiquadFilterNode;
  private readonly effects: AudioNode[];
  private readonly bytes = new Uint8Array(2 * framesPerBuffer);
  private used = 0;
  private nextAt = 0;
  private announced = false;

  public constructor(private readonly context: AudioContext, private readonly identity: VoiceIdentity,
    private readonly signal: AbortSignal, private readonly onStart: () => void) {
    this.bandHigh = context.createBiquadFilter();
    this.bandHigh.type = 'highpass';
    this.bandHigh.frequency.value = 240;
    this.bandHigh.Q.value = 0.62;
    const bandLow = context.createBiquadFilter();
    bandLow.type = 'lowpass';
    bandLow.frequency.value = 4600;
    bandLow.Q.value = 0.66;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 16;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.18;
    const gain = context.createGain();
    gain.gain.value = identity.volume;
    const pan = context.createStereoPanner();
    pan.pan.value = identity.pan;
    this.bandHigh.connect(bandLow);
    bandLow.connect(compressor);
    compressor.connect(gain);
    gain.connect(pan);
    pan.connect(context.destination);
    this.effects = [this.bandHigh, bandLow, compressor, gain, pan];
    signal.addEventListener('abort', this.close, { once: true });
  }

  public async append(chunk: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < chunk.byteLength) {
      this.signal.throwIfAborted();
      const length = Math.min(this.bytes.length - this.used, chunk.byteLength - offset);
      this.bytes.set(chunk.subarray(offset, offset + length), this.used);
      this.used += length;
      offset += length;
      if (this.used === this.bytes.length) await this.schedule();
    }
  }

  private async schedule(): Promise<void> {
    const frames = this.used >> 1;
    if (!frames) return;
    const buffer = this.context.createBuffer(1, frames, SPEECH_RATE);
    const data = buffer.getChannelData(0);
    const view = new DataView(this.bytes.buffer);
    for (let index = 0; index < frames; index++) data[index] = view.getInt16(index * 2, true) / 32768;
    this.used = 0;
    await this.scheduleBuffer(buffer);
  }

  public async playSamples(samples: Float32Array<ArrayBuffer>, sampleRate: number): Promise<void> {
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const node = await this.scheduleBuffer(buffer);
    await this.waitForEnd(node);
  }

  private async waitForEnd(node: AudioBufferSourceNode): Promise<void> {
    this.signal.throwIfAborted();
    if (!this.sources.has(node)) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        node.removeEventListener('ended', ended);
        this.signal.removeEventListener('abort', abort);
      };
      const ended = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(this.signal.reason); };
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('playback-blocked')); },
        Math.max(0, this.nextAt - this.context.currentTime) * 1000 + 2000);
      node.addEventListener('ended', ended, { once: true });
      this.signal.addEventListener('abort', abort, { once: true });
    });
  }

  private async scheduleBuffer(buffer: AudioBuffer): Promise<AudioBufferSourceNode> {
    if (this.context.state !== 'running') throw new Error('playback-blocked');
    const ahead = this.nextAt - this.context.currentTime;
    if (ahead > 0.55) await delay((ahead - 0.45) * 1000, this.signal);
    this.signal.throwIfAborted();
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = this.identity.rate;
    node.connect(this.bandHigh);
    node.onended = () => { this.sources.delete(node); node.disconnect(); };
    this.nextAt = Math.max(this.nextAt, this.context.currentTime);
    node.start(this.nextAt);
    this.sources.add(node);
    this.nextAt += buffer.duration / this.identity.rate;
    if (!this.announced) { this.announced = true; this.onStart(); }
    return node;
  }

  public async finish(): Promise<void> {
    await this.schedule();
    this.signal.throwIfAborted();
    const last = Array.from(this.sources).at(-1);
    if (last) await this.waitForEnd(last);
  }

  public close = (): void => {
    this.signal.removeEventListener('abort', this.close);
    for (const node of this.sources) { node.onended = null; node.stop(); node.disconnect(); }
    this.sources.clear();
    for (const node of this.effects) node.disconnect();
  };
}
