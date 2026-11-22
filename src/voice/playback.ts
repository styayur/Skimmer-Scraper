import { SPEECH_RATE } from './deepSeekVoice';
import type { VoiceIdentity } from './voiceContracts';

const framesPerBuffer = 2_400;

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
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
    gain.gain.value = 0.86;
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
    if (this.context.state !== 'running') throw new Error('playback-blocked');
    const ahead = this.nextAt - this.context.currentTime;
    if (ahead > 0.55) await delay((ahead - 0.45) * 1000, this.signal);
    this.signal.throwIfAborted();
    const buffer = this.context.createBuffer(1, frames, SPEECH_RATE);
    const data = buffer.getChannelData(0);
    const view = new DataView(this.bytes.buffer);
    for (let index = 0; index < frames; index++) data[index] = view.getInt16(index * 2, true) / 32768;
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = this.identity.rate;
    node.connect(this.bandHigh);
    node.onended = () => { this.sources.delete(node); node.disconnect(); };
    this.nextAt = Math.max(this.nextAt, this.context.currentTime + 0.035);
    node.start(this.nextAt);
    this.sources.add(node);
    this.nextAt += buffer.duration / this.identity.rate;
    this.used = 0;
    if (!this.announced) { this.announced = true; this.onStart(); }
  }

  public async finish(): Promise<void> {
    await this.schedule();
    const tail = this.nextAt - this.context.currentTime;
    if (tail > 0) await delay(tail * 1000 + 60, this.signal);
  }

  public close = (): void => {
    this.signal.removeEventListener('abort', this.close);
    for (const node of this.sources) { node.onended = null; node.stop(); node.disconnect(); }
    this.sources.clear();
    for (const node of this.effects) node.disconnect();
  };
}
