import type { ModelClient } from '../ai/modelClient';
import { radioText } from '../ai/radioDialogue';
import { MAX_CLIP_SECONDS, type WaveClip } from './wave';

export const SPEECH_RATE = 24_000;
const MAX_AUDIO_BYTES = SPEECH_RATE * 2 * 25;
export const VOICE_LIMITS = Object.freeze({ asrRequests: 10, asrSeconds: 60, ttsRequests: 18, ttsCharacters: 1_200 });
export type DeepSeekVoiceId = 'stella' | 'tide';

export class DeepSeekVoice {
  private readonly stats = {
    asrRequests: 0, asrSeconds: 0, lastAsrMs: null as number | null, lastAudioMs: null as number | null,
    ttsRequests: 0, ttsCharacters: 0, lastTtsFirstByteMs: null as number | null, lastTtsMs: null as number | null,
    lastTtsBytes: 0,
  };

  public constructor(private readonly model: ModelClient) {}
  public get connected(): boolean { return this.model.voiceConnected; }
  public snapshot() { return { ...this.stats }; }

  public async transcribe(clip: WaveClip, signal: AbortSignal): Promise<string> {
    const billableSeconds = Math.ceil(clip.durationMs / 1000);
    if (!this.connected) throw new Error('voice-disconnected');
    if (this.stats.asrRequests >= VOICE_LIMITS.asrRequests || this.stats.asrSeconds + billableSeconds > VOICE_LIMITS.asrSeconds) {
      throw new Error('asr-budget');
    }
    if (billableSeconds < 1 || billableSeconds > MAX_CLIP_SECONDS || clip.wave.size > 400_000 || clip.wave.type !== 'audio/wav') {
      throw new Error('audio-format');
    }
    signal.throwIfAborted();
    const form = new FormData();
    form.set('file', clip.wave, 'radio.wav');
    this.stats.asrRequests++;
    this.stats.asrSeconds += billableSeconds;
    const start = performance.now();
    const timeout = AbortSignal.timeout(15_000);
    const request = AbortSignal.any([signal, timeout]);
    try {
      const response = await this.model.requestVoice('asr', form, request);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`http-${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('audio-format');
      const decoder = new TextDecoder();
      let body = '';
      let bytes = 0;
      try {
        while (true) {
          request.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 16_384) throw new Error('audio-format');
          body += decoder.decode(chunk.value, { stream: true });
        }
      } finally { await reader.cancel().catch(() => {}); }
      request.throwIfAborted();
      const transcript = JSON.parse(body + decoder.decode()) as { text?: unknown; duration_ms?: unknown };
      if (typeof transcript.text !== 'string' || this.model.containsCredential(transcript.text)) throw new Error('invalid-asr');
      this.stats.lastAsrMs = performance.now() - start;
      this.stats.lastAudioMs = typeof transcript.duration_ms === 'number' && Number.isFinite(transcript.duration_ms)
        ? Math.max(0, Math.min(120_000, transcript.duration_ms)) : clip.durationMs;
      return radioText(transcript.text);
    } catch (error) {
      if (timeout.aborted && !signal.aborted) throw new Error('voice-timeout');
      throw error;
    }
  }

  public async speak(text: string, voice: DeepSeekVoiceId, signal: AbortSignal, consume: (chunk: Uint8Array) => Promise<void>): Promise<void> {
    if (!this.connected) throw new Error('voice-disconnected');
    if (this.model.containsCredential(text)) throw new Error('sensitive-response');
    const characters = Array.from(text).reduce((sum, character) => sum + (/\p{Script=Han}/u.test(character) ? 2 : 1), 0);
    if (this.stats.ttsRequests >= VOICE_LIMITS.ttsRequests || this.stats.ttsCharacters + characters > VOICE_LIMITS.ttsCharacters) {
      throw new Error('tts-budget');
    }
    if (characters < 1 || characters > 300) throw new Error('audio-format');
    signal.throwIfAborted();
    this.stats.ttsRequests++;
    this.stats.ttsCharacters += characters;
    this.stats.lastTtsFirstByteMs = null;
    this.stats.lastTtsMs = null;
    this.stats.lastTtsBytes = 0;
    const started = performance.now();
    const timeout = AbortSignal.timeout(25_000);
    const request = AbortSignal.any([signal, timeout]);
    try {
      const response = await this.model.requestVoice('tts', JSON.stringify({ text, voice_id: voice, format: 'pcm', filter_markdown: true }), request);
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`http-${response.status}`);
      }
      if (response.headers.get('content-type')?.split(';')[0].trim() !== 'audio/pcm' || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw new Error('audio-format');
      }
      const reader = response.body.getReader();
      try {
        while (true) {
          request.throwIfAborted();
          const next = await reader.read();
          if (next.done) break;
          this.stats.lastTtsFirstByteMs ??= performance.now() - started;
          this.stats.lastTtsBytes += next.value.byteLength;
          if (this.stats.lastTtsBytes > MAX_AUDIO_BYTES) throw new Error('audio-format');
          await consume(next.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      request.throwIfAborted();
      if (this.stats.lastTtsBytes < 480 || this.stats.lastTtsBytes % 2 !== 0) throw new Error('audio-format');
      this.stats.lastTtsMs = performance.now() - started;
    } catch (error) {
      if (timeout.aborted && !signal.aborted) throw new Error('voice-timeout');
      throw error;
    }
  }
}
