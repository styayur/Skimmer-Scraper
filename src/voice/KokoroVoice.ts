import type { RadioLanguage, RadioLine } from '../ai/radioDialogue';
import { RadioAudio } from './playback';
import { KOKORO_VOICES, mandarinSpeechText, type KokoroBackend, type KokoroReply, type KokoroRequest } from './kokoroProtocol';
import type { VoiceIdentity, VoiceLifecycle, VoiceProvider } from './voiceContracts';

const idleMs = 45_000;
const loadTimeoutMs = 25 * 60_000;
const downloadStallMs = 210_000;
interface Call {
  id: number;
  timer: number;
  stallTimer: number;
  onTimeout(): void;
  resolve(result: KokoroReply): void;
  reject(error: Error): void;
}
class KokoroError extends Error {
  public constructor(code: string, public readonly detail: string) { super(code); }
}

/** Created through a dynamic import. Workers and model weights are opened only for opted-in requests. */
export class KokoroVoice implements VoiceProvider {
  private worker: Worker | null = null;
  private pending: Call | null = null;
  private activeSpeech: symbol | null = null;
  private loading: Promise<void> | null = null;
  private idleTimer = 0;
  private serial = 0;
  private generation = 0;
  private generatedThisSession = false;
  private readonly clips = new Map<string, Extract<KokoroReply, {type:'audio'}>>();
  private clipBytes = 0;
  private retryAt = 0;
  private stats = {
    phase: 'idle' as 'idle' | 'loading' | 'ready' | 'generating' | 'playing' | 'error',
    backend: null as KokoroBackend | null,
    device: '',
    percent: null as number | null,
    loads: 0,
    releases: 0,
    generated: 0,
    cacheHits: 0,
    completed: 0,
    loadMs: null as number | null,
    inferenceMs: null as number | null,
    audioSeconds: null as number | null,
    lastVoice: null as string | null,
    error: null as string | null,
    detail: '',
  };

  public constructor(private readonly getContext: () => AudioContext | null) {}
  public snapshot() { return { ...this.stats, resident: this.worker !== null, cachedClipBytes: this.clipBytes, idleMs }; }

  public prepare(explicit = false): Promise<void> {
    if (this.worker && (this.stats.phase === 'ready' || this.stats.phase === 'generating' || this.stats.phase === 'playing')) return Promise.resolve();
    if (this.loading) return this.loading;
    if (!explicit && performance.now() < this.retryAt) return Promise.reject(new Error(this.stats.error ?? 'kokoro-backend'));
    const generation = this.generation;
    this.stats.phase = 'loading';
    this.stats.percent = null;
    this.stats.error = null;
    this.stats.detail = '';
    const task = this.load(generation).catch(error => {
      if (generation === this.generation) {
        this.stopWorker();
        this.stats.phase = 'error';
        this.stats.error = error instanceof Error ? error.message : 'kokoro-backend';
        this.stats.detail = error instanceof KokoroError ? error.detail : '';
        this.retryAt = this.stats.error === 'kokoro-device' ? Infinity : performance.now() + 30_000;
      }
      throw error;
    }).finally(() => { if (this.loading === task) this.loading = null; });
    this.loading = task;
    return task;
  }

  public async speak(line: RadioLine, language: RadioLanguage, identity: VoiceIdentity, lifecycle: VoiceLifecycle): Promise<void> {
    const text = mandarinSpeechText(line.text, language);
    const { signal, start, preview } = lifecycle;
    signal.throwIfAborted();
    if (this.stats.phase !== 'ready') {
      const preparing = this.prepare(preview);
      if (!preview) {
        void preparing.catch(() => {});
        throw new Error(this.stats.error ?? 'kokoro-loading');
      }
      const cancel = () => this.dispose();
      signal.addEventListener('abort', cancel, { once: true });
      try { await preparing; } finally { signal.removeEventListener('abort', cancel); }
      signal.throwIfAborted();
    }
    const context = this.getContext();
    if (context?.state !== 'running') throw new Error('playback-blocked');
    const voice = KOKORO_VOICES[identity.agent];
    const speech = Symbol();
    this.activeSpeech = speech;
    window.clearTimeout(this.idleTimer);
    this.stats.phase = 'generating';
    this.stats.error = null;
    this.stats.detail = '';
    const interrupted = () => {
      if (this.activeSpeech !== speech) return;
      if (this.stats.phase === 'generating') this.dispose();
      else this.finishSpeech(speech);
    };
    signal.addEventListener('abort', interrupted, { once: true });
    let playback: RadioAudio | undefined;
    try {
      const key = JSON.stringify([voice, identity.rate, text]);
      let result = this.clips.get(key);
      if (result) {
        this.clips.delete(key);
        this.clips.set(key, result);
        this.stats.cacheHits++;
        this.stats.inferenceMs = 0;
      } else {
        const reply = await this.call(id => ({ type: 'generate', id, text, voice, speed: identity.rate }),
          preview ? 25_000 : this.generatedThisSession ? 9000 : 15_000);
        signal.throwIfAborted();
        if (reply.type !== 'audio') throw new Error('kokoro-inference');
        result = reply;
        this.generatedThisSession = true;
        this.stats.generated++;
        this.stats.inferenceMs = result.inferenceMs;
        const bytes = result.samples.byteLength;
        const budget = 4 * 1024 * 1024;
        if (bytes <= budget) {
          for (const [oldKey, clip] of this.clips) {
            if (this.clipBytes + bytes <= budget && this.clips.size < 8) break;
            this.clipBytes -= clip.samples.byteLength;
            this.clips.delete(oldKey);
          }
          this.clips.set(key, result);
          this.clipBytes += bytes;
        }
      }
      this.stats.audioSeconds = result.samples.length / result.sampleRate;
      this.stats.lastVoice = voice;
      this.stats.phase = 'playing';
      playback = new RadioAudio(context, { ...identity, rate: 1 }, signal,
        () => start({ provider: 'high-quality', voiceId: voice, rate: identity.rate }));
      await playback.playSamples(result.samples, result.sampleRate);
      signal.throwIfAborted();
      this.stats.completed++;
    } catch (error) {
      if (!signal.aborted) {
        const code = error instanceof Error ? error.message : 'kokoro-inference';
        this.stats.error = code;
        this.stats.detail = error instanceof KokoroError ? error.detail : '';
        if (code === 'kokoro-inference' || code === 'kokoro-slow' || code === 'kokoro-backend') {
          this.stopWorker();
          this.retryAt = performance.now() + 45_000;
          this.stats.phase = 'error';
        }
      }
      throw error;
    } finally {
      playback?.close();
      signal.removeEventListener('abort', interrupted);
      this.finishSpeech(speech);
    }
  }

  public dispose(): void {
    this.generation++;
    this.activeSpeech = null;
    this.loading = null;
    this.stopWorker();
    this.stats.phase = 'idle';
    this.stats.percent = null;
  }

  private async load(generation: number): Promise<void> {
    const result = await this.call(id => ({ type: 'prepare', id }), loadTimeoutMs);
    if (generation !== this.generation || result.type !== 'ready') throw new Error('kokoro-backend');
    this.stats = { ...this.stats, phase: 'ready', backend: result.backend, device: result.device,
      percent: 100, loads: this.stats.loads + 1, loadMs: result.loadMs, error: null };
    this.armIdle();
  }

  private call(make: (id: number) => KokoroRequest, timeout: number): Promise<KokoroReply> {
    if (this.pending) return Promise.reject(new Error('kokoro-busy'));
    return new Promise((resolve, reject) => {
      const request = make(++this.serial);
      const worker = this.worker ??= this.openWorker();
      const onTimeout = () => this.stopWorker(new Error(request.type === 'generate' ? 'kokoro-slow' : 'kokoro-download'));
      const timer = window.setTimeout(onTimeout, timeout);
      const stallTimer = request.type === 'prepare' ? window.setTimeout(onTimeout, downloadStallMs) : 0;
      this.pending = { id: request.id, timer, stallTimer, onTimeout, resolve, reject };
      try { worker.postMessage(request); } catch (error) {
        this.stopWorker();
        reject(error);
      }
    });
  }

  private openWorker(): Worker {
    const worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module', name: 'Skimmer Kokoro' });
    worker.addEventListener('message', ({ data }: MessageEvent<KokoroReply>) => {
      if (worker !== this.worker || !this.pending || this.pending.id !== data.id) return;
      if (data.type === 'progress') {
        this.stats.backend = data.backend;
        this.stats.percent = data.percent;
        window.clearTimeout(this.pending.stallTimer);
        this.pending.stallTimer = window.setTimeout(this.pending.onTimeout, downloadStallMs);
        return;
      }
      const call = this.pending;
      this.pending = null;
      window.clearTimeout(call.timer);
      window.clearTimeout(call.stallTimer);
      if (data.type === 'error') call.reject(new KokoroError(data.code, data.detail));
      else call.resolve(data);
    });
    worker.addEventListener('error', event => {
      if (worker !== this.worker) return;
      const error = new KokoroError('kokoro-backend', event.message.slice(0, 230));
      this.stopWorker(error);
    });
    return worker;
  }

  private stopWorker(error: Error = new Error('kokoro-cancelled')): void {
    this.clips.clear();
    this.clipBytes = 0;
    window.clearTimeout(this.idleTimer);
    this.generatedThisSession = false;
    if (this.pending) {
      window.clearTimeout(this.pending.timer);
      window.clearTimeout(this.pending.stallTimer);
      this.pending.reject(error);
      this.pending = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.stats.releases++;
    }
    this.worker = null;
  }

  private armIdle(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.dispose(), idleMs);
  }

  private finishSpeech(speech: symbol): void {
    if (this.activeSpeech !== speech) return;
    this.activeSpeech = null;
    if (this.worker) {
      this.stats.phase = 'ready';
      this.armIdle();
    }
  }
}
