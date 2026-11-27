import type { ModelClient } from '../ai/modelClient';
import { radioText, type RadioLanguage, type RadioLine } from '../ai/radioDialogue';
import { openLocalSpeech } from './browserSpeech';
import { DeepSeekVoice, VOICE_LIMITS, type SpeechStreamStats } from './deepSeekVoice';
import { clipRadio } from './clipRadio';
import { radioCatalog } from './radioCatalog';
import { openMicrophone } from './microphone';
import { delay, RadioAudio } from './playback';
import { SpeechQueue } from './SpeechQueue';
import {
  resolveVoiceIdentity, type RadioSubtitle, type SpeakingProvider, type SpeechStart, type VoiceIdentity, type VoiceInput,
  type VoiceLifecycle, type VoicePreferences, type VoiceProvider,
} from './voiceContracts';
import { loadVoicePreferences, saveVoicePreferences } from './voicePreferences';
import { MAX_CLIP_SECONDS } from './wave';

type VoicePhase = 'idle' | 'opening' | 'recording' | 'transcribing';
export type PushToTalkSource = 'keyboard' | 'gamepad' | 'touch';
interface Capture {
  source: PushToTalkSource;
  controller: AbortController;
  phase: Exclude<VoicePhase, 'idle'>;
  finish?: () => void;
  timer: number;
}
interface CompletedSpeech extends SpeechStart { id: number; playbackId: number; agent: number; stream?: SpeechStreamStats }
type PlaybackPhase = 'queued' | 'preparing' | 'playing' | 'completed' | 'cancelled' | 'failed' | 'text-only';
interface PlaybackEvent {
  eventId: number;
  playbackId: number;
  catalogId?: string;
  locale: RadioLanguage;
  phase: PlaybackPhase;
}
interface Hooks {
  available(): boolean;
  send(text: string, useModel: boolean): boolean;
  status(phase: VoicePhase, message: string): void;
}

const failure = (error: unknown): string => {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) return 'mic-denied';
  if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'NotReadableError' || error.name === 'NotSupportedError')) return 'mic-unavailable';
  if (error instanceof Error && /^(?:http-\d{3}|mic-[a-z-]+|local-[a-z-]+|voice-[a-z-]+|kokoro-[a-z-]+|asr-budget|tts-budget|playback-blocked|audio-format|empty-asr|dialogue-unavailable)$/.test(error.message)) return error.message;
  return 'voice-request';
};
const messages: Record<string, string> = {
  'mic-denied': '麦克风权限未授予。可以检查浏览器权限，或按 T 输入文字。',
  'mic-unavailable': '找不到可用的麦克风。按 T 可以输入文字。',
  'mic-revoked': '麦克风已断开或权限已撤销。',
  'mic-capture': '录音中断。请再试一次，或按 T 输入文字。',
  'local-asr-unavailable': '此浏览器没有本机语音识别。按 T 输入文字。',
  'local-asr-pack': '请先在语音设置中准备本机语言包，或按 T 输入文字。',
  'voice-disconnected': '请连接 DeepSeek，或切换到本机语音与文字。',
  'voice-timeout': '语音处理超时。按 T 可以输入文字。',
  'asr-budget': '本页语音转写预算已用完。请按 T 输入文字。',
  'empty-asr': '没有识别到指令。请继续按住说话，或按 T 输入文字。',
  'dialogue-unavailable': '伴机电台正忙。请稍后重试。',
};

export class VoiceRadio {
  private settings: VoicePreferences;
  private readonly deepSeek: DeepSeekVoice;
  private readonly providers: Record<SpeakingProvider, VoiceProvider>;
  private readonly speech = new SpeechQueue((line, signal, id) => this.announce(line, signal, id),
    undefined, (line, id, phase) => this.transition(line, id, phase));
  private capture: Capture | null = null;
  private speechStart: (SpeechStart & { id: number; playbackId: number }) | null = null;
  private readonly playbackEvents: PlaybackEvent[] = [];
  private caption: RadioSubtitle | null = null;
  private audioAttempt: AbortController | null = null;
  private muted = false;
  private seenLine: number | null = null;
  private activated = false;
  private context: AudioContext | null = null;
  private preview: AbortController | null = null;
  private previewStatus = 'idle' as 'idle' | 'preparing' | 'playing' | 'completed' | 'cancelled' | 'error';
  private previewError: string | null = null;
  private previewSpeech: SpeechStart | null = null;
  private previewText: string | null = null;
  private previewId: number | null = null;
  private captures = 0;
  private commands = 0;
  private played = 0;
  private completed = 0;
  private readonly playbackHistory: CompletedSpeech[] = [];
  private lastError: string | null = null;
  private lastOutputError: string | null = null;
  private lastOutputFallback: SpeakingProvider | null = null;

  public constructor(model: ModelClient, private readonly hooks: Hooks) {
    this.deepSeek = new DeepSeekVoice(model);
    this.providers = { local: clipRadio(() => this.context), deepseek: { speak: this.speakCloud } };
    this.settings = loadVoicePreferences(window.localStorage);
  }

  public get inputMode(): VoiceInput { return this.settings.input; }
  public get preferences(): VoicePreferences { return { ...this.settings }; }
  public get preferredLanguage(): RadioLanguage { return this.settings.language; }
  public get subtitle(): RadioSubtitle | null { return this.caption; }
  public get spokenLine(): RadioLine | null {
    const line = this.speech.current;
    return line && line.id === this.speechStart?.id ? line : null;
  }
  public get ducking(): boolean { return !!this.spokenLine || this.capture?.phase === 'opening' || this.capture?.phase === 'recording'; }
  public snapshot() {
    return { ...this.preferences, phase: this.capture?.phase ?? 'idle', played: this.played, completed: this.completed,
      speaking: this.spokenLine?.agent ?? null, activeSpeech: this.spokenLine ? this.speechStart : null, queuedSpeech: this.speech.count,
      captures: this.captures, commands: this.commands, lastError: this.lastError, lastOutputError: this.lastOutputError,
      lastOutputFallback: this.lastOutputFallback,
      lastCompleted: this.playbackHistory.at(-1) ?? null, playbackHistory: this.playbackHistory.slice(),
      playbackEvents: this.playbackEvents.slice(),
      preview: { playbackId: this.previewId, phase: this.previewStatus, error: this.previewError, speech: this.previewSpeech, text: this.previewText },
      cloud: this.deepSeek.snapshot(), limits: VOICE_LIMITS };
  }

  public configure(settings: VoicePreferences): void {
    const outputChanged = this.settings.output !== settings.output;
    if (settings.language === this.settings.language && (settings.output === 'off' || settings.volume === 0)) {
      this.cancel(false);
      this.cancelPreview();
      this.audioAttempt?.abort();
    } else this.suspend();
    if (outputChanged) {
      this.previewStatus = 'idle';
      this.previewText = null;
      this.previewId = null;
      this.previewSpeech = null;
      this.previewError = null;
    }
    this.settings = { ...settings };
    this.lastOutputError = null;
    this.lastOutputFallback = null;
    saveVoicePreferences(window.localStorage, this.settings);
    if (this.activated) this.unlock();
  }

  public unlock(): void {
    this.activated = true;
    if (this.settings.output === 'off' || typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Captions are still available. */ }
  }

  public begin(source: PushToTalkSource): boolean {
    if (!this.hooks.available() || this.settings.input === 'off') return false;
    if (this.capture) return true;
    if (this.settings.input === 'deepseek' && !this.deepSeek.connected) {
      this.reportError('voice-disconnected');
      return true;
    }
    if (this.settings.input === 'deepseek') {
      const usage = this.deepSeek.snapshot();
      if (usage.asrRequests >= VOICE_LIMITS.asrRequests || usage.asrSeconds >= VOICE_LIMITS.asrSeconds) {
        this.reportError('asr-budget');
        return true;
      }
    }
    this.lastError = null;
    this.unlock();
    this.cancelPreview();
    this.silence();
    const controller = new AbortController();
    const capture: Capture = { source, controller, phase: 'opening', timer: window.setTimeout(() => {
      if (this.capture !== capture) return;
      this.cancel(false);
      this.reportError('voice-timeout');
    }, 20_000) };
    this.capture = capture;
    this.hooks.status('opening', '正在申请麦克风权限…');
    void this.record(capture, this.settings.input, this.settings.language);
    return true;
  }

  private async record(capture: Capture, input: VoiceInput, language: RadioLanguage): Promise<void> {
    const { signal } = capture.controller;
    try {
      const session = input === 'deepseek' ? await openMicrophone(signal) : await openLocalSpeech(language, signal);
      void session.result.catch(() => {});
      signal.throwIfAborted();
      this.captures++;
      capture.finish = session.finish;
      capture.phase = 'recording';
      window.clearTimeout(capture.timer);
      capture.timer = window.setTimeout(() => this.release(capture.source), MAX_CLIP_SECONDS * 1000);
      this.hooks.status('recording', '正在录音 · 松开发送 · Esc 取消');
      const result = await session.result;
      signal.throwIfAborted();
      if (!this.hooks.available()) return;
      window.clearTimeout(capture.timer);
      capture.phase = 'transcribing';
      this.hooks.status('transcribing', '正在转写…');
      const text = typeof result === 'string' ? radioText(result) : result ? await this.deepSeek.transcribe(result, signal) : '';
      signal.throwIfAborted();
      if (!text) throw new Error('empty-asr');
      if (!this.hooks.available() || !this.hooks.send(text, input === 'deepseek')) throw new Error('dialogue-unavailable');
      this.commands++;
      this.hooks.status('idle', '语音指令已发送。');
    } catch (error) {
      if (!signal.aborted) this.reportError(failure(error));
    } finally {
      window.clearTimeout(capture.timer);
      if (this.capture === capture) this.capture = null;
    }
  }

  public release(source: PushToTalkSource): boolean {
    const capture = this.capture;
    if (!capture || capture.source !== source) return false;
    if (capture.phase === 'opening') {
      this.cancel(false);
      this.hooks.status('idle', '授权后请重新按住讲话。');
    } else if (capture.phase === 'recording') {
      window.clearTimeout(capture.timer);
      capture.phase = 'transcribing';
      this.hooks.status('transcribing', '正在转写…');
      capture.timer = window.setTimeout(() => {
        if (this.capture !== capture) return;
        this.cancel(false);
        this.reportError('voice-timeout');
      }, 20_000);
      try { capture.finish?.(); } catch { this.cancel(false); this.reportError('mic-capture'); }
    }
    return true;
  }

  public cancel(report = true, source?: PushToTalkSource): boolean {
    const capture = this.capture;
    if (!capture || source && capture.source !== source) return false;
    this.capture = null;
    window.clearTimeout(capture.timer);
    capture.controller.abort();
    this.hooks.status('idle', report ? '语音已取消。' : '');
    return true;
  }

  private reportError(code: string): void {
    this.lastError = code;
    this.hooks.status('idle', messages[code] ?? '语音暂不可用。按 T 可以输入文字。');
  }

  public update(inFlight: boolean, line: RadioLine | null, muted = false): void {
    const unseen = line && line.id !== this.seenLine;
    if (line) this.seenLine = line.id;
    if (!inFlight) { this.cancel(false); this.silence(); return; }
    this.muted = muted;
    if (muted) this.audioAttempt?.abort();
    if (unseen && !this.capture && !this.preview && line.agent !== null) this.speech.enqueue(line);
  }

  private transition(line: RadioLine, playbackId: number, phase: PlaybackPhase): void {
    this.playbackEvents.push({ eventId: line.id, playbackId, locale: line.locale, catalogId: line.catalog?.catalogId, phase });
    if (this.playbackEvents.length > 32) this.playbackEvents.shift();
  }

  private async announce(line: RadioLine, signal: AbortSignal, playbackId: number): Promise<void> {
    const identity = resolveVoiceIdentity(line.agent, this.settings.volume);
    const selected = this.settings.output;
    const audio = new AbortController();
    this.audioAttempt = audio;
    const cancel = () => {
      this.transition(line, playbackId, 'cancelled');
      this.caption = null;
      this.speechStart = null;
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (identity && this.activated && !this.muted && this.settings.volume > 0 && selected !== 'off'
          && (line.catalog || selected === 'deepseek' && line.priority !== 'notice')) {
        const done = await this.playAudio(line, playbackId, identity, selected, AbortSignal.any([signal, audio.signal]));
        signal.throwIfAborted();
        if (done) return;
        if (audio.signal.aborted) this.transition(line, playbackId, 'cancelled');
      }
      signal.throwIfAborted();
      this.speechStart = null;
      this.caption = { line, playbackId };
      this.transition(line, playbackId, 'text-only');
      await delay(Math.min(6000, Math.max(2500, Array.from(line.text).length * 100)), signal);
      signal.throwIfAborted();
      this.transition(line, playbackId, 'completed');
    } finally {
      signal.removeEventListener('abort', cancel);
      if (this.audioAttempt === audio) {
        this.caption = null;
        this.speechStart = null;
        this.audioAttempt = null;
      }
    }
  }

  private async playAudio(line: RadioLine, playbackId: number, identity: VoiceIdentity, selected: SpeakingProvider,
    signal: AbortSignal): Promise<boolean> {
    const dispatchedAt = performance.now();
    this.transition(line, playbackId, 'preparing');
    // Defer all network and audio work until after the flight callback.
    await delay(0, signal).catch(() => {});
    const modes: SpeakingProvider[] = [selected];
    if (selected === 'deepseek' && this.settings.localFallback && line.catalog?.clip) modes.push('local');
    for (const mode of modes) {
      if (signal.aborted) return false;
      if (mode === selected) this.lastOutputError = this.lastOutputFallback = null;
      const attempt = AbortSignal.any([signal, AbortSignal.timeout(mode === 'local' ? 15_000 : 30_000)]);
      let started: CompletedSpeech | undefined;
      let acceptingStart = true;
      try {
        const stream = await this.providers[mode].speak(line, identity, { signal: attempt, start: info => {
          if (attempt.aborted || !acceptingStart) return;
          if (!started) {
            started = { ...info, id: line.id, agent: identity.agent, playbackId, startLatencyMs: performance.now() - dispatchedAt };
            this.transition(line, playbackId, 'playing');
            if (mode !== selected) this.lastOutputFallback = mode;
            this.played++;
          }
          this.speechStart = started;
          this.caption = { line, playbackId };
        }, drained: () => {
          if (attempt.aborted || !acceptingStart || this.caption?.playbackId !== playbackId) return;
          this.speechStart = null;
          this.caption = null;
        } });
        attempt.throwIfAborted();
        if (!started) throw new Error('playback-blocked');
        this.finishSpeech({ ...started, ...(stream ? { stream } : {}) });
        this.transition(line, playbackId, 'completed');
        return true;
      } catch (error) {
        if (signal.aborted) return false;
        this.lastOutputError = attempt.aborted ? 'voice-timeout' : failure(error);
        this.transition(line, playbackId, 'failed');
        if (started) return false;
      } finally { acceptingStart = false; }
    }
    return false;
  }

  private speakCloud = async (line: RadioLine, identity: VoiceIdentity,
    { signal, start, drained }: VoiceLifecycle): Promise<SpeechStreamStats> => {
    if (!this.deepSeek.connected) throw new Error('voice-disconnected');
    if (this.context?.state !== 'running') throw new Error('playback-blocked');
    const playback = new RadioAudio(this.context, identity, signal,
      () => start({ provider: 'deepseek', voiceId: identity.cloudVoice, rate: identity.rate }), drained);
    try {
      const stats = await this.deepSeek.speak(line.text, identity.cloudVoice, signal, chunk => playback.append(chunk));
      await playback.finish();
      return stats;
    } finally { playback.close(); }
  };

  public async previewVoice(agent: number): Promise<void> {
    if (this.preview) { this.cancelPreview(); return; }
    const { language, output, volume } = this.settings;
    const identity = resolveVoiceIdentity(agent, volume);
    if (!identity || output !== 'local' || volume === 0) return;
    this.unlock();
    this.silence();
    const controller = new AbortController();
    this.preview = controller;
    this.previewStatus = 'preparing';
    this.previewError = null;
    this.previewSpeech = null;
    const { signal } = controller;
    const catalog = radioCatalog.resolve(agent, 'preview', language)!;
    this.previewId = this.speech.nextPlaybackId();
    const line: RadioLine = Object.freeze({ id: this.previewId, agent, event: 'preview', locale: language, catalog,
      text: catalog.text, source: 'local', priority: 'notice' });
    this.previewText = line.text;
    try {
      await this.providers[output].speak(line, identity, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), preview: true, start: speech => {
        if (signal.aborted) return;
        this.previewSpeech = speech;
        this.previewStatus = 'playing';
      } });
      if (!signal.aborted) this.previewStatus = 'completed';
    } catch (error) {
      if (!signal.aborted) {
        this.previewError = failure(error);
        this.previewStatus = 'error';
      }
    } finally {
      if (this.preview === controller) this.preview = null;
    }
  }

  public cancelPreview(): void {
    if (!this.preview) return;
    this.preview.abort();
    this.preview = null;
    this.previewStatus = 'cancelled';
  }

  private finishSpeech(speech: CompletedSpeech): void {
    this.completed++;
    this.playbackHistory.push(speech);
    if (this.playbackHistory.length > 8) this.playbackHistory.shift();
  }

  public silence(): boolean {
    this.speechStart = null;
    return this.speech.clear();
  }

  public suspend(): void {
    this.cancel(false);
    this.silence();
    this.cancelPreview();
  }

  public reset(): void {
    this.suspend();
    this.seenLine = null;
    this.speech.reset();
  }

  public dispose(): void {
    this.reset();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
