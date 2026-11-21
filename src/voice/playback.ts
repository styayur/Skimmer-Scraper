import { SPEECH_RATE } from './deepSeekVoice';

const framesPerBuffer = 2_400;

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const abort = () => { window.clearTimeout(timer); reject(signal.reason); };
  const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
  signal.addEventListener('abort', abort, { once: true });
});

/** Queue small raw PCM buffers ahead of playback, with backpressure on the network reader. */
export class StreamedRadioPlayback {
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly pan: StereoPannerNode;
  private readonly bytes = new Uint8Array(2 * framesPerBuffer);
  private used = 0;
  private nextAt = 0;

  public constructor(private readonly context: AudioContext, agent: number, private readonly signal: AbortSignal) {
    this.pan = context.createStereoPanner();
    this.pan.pan.value = agent === 1 ? -0.2 : agent === 3 ? 0.2 : 0;
    this.pan.connect(context.destination);
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
    node.connect(this.pan);
    this.sources.add(node);
    node.onended = () => { this.sources.delete(node); node.disconnect(); };
    this.nextAt = Math.max(this.nextAt, this.context.currentTime + 0.035);
    node.start(this.nextAt);
    this.nextAt += buffer.duration;
    this.used = 0;
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
    this.pan.disconnect();
  };
}
