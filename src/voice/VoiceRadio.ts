import type { ModelClient } from '../ai/modelClient';
import { radioLanguageOf, radioText, type RadioLanguage, type RadioLine } from '../ai/radioDialogue';
import { openLocalSpeech, SystemSpeech } from './browserSpeech';
import { DeepSeekVoice, VOICE_LIMITS, type SpeechStreamStats } from './deepSeekVoice';
import { openMicrophone } from './microphone';
import { RadioAudio } from './playback';
import { SpeechQueue } from './SpeechQueue';
import {
  resolveVoiceIdentity, type SpeakingProvider, type SpeechStart, type VoiceIdentity, type VoiceInput,
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
interface CompletedSpeech extends SpeechStart { id: number; agent: number; stream?: SpeechStreamStats }
interface Hooks {
  available(): boolean;
  send(text: string, useModel: boolean): boolean;
  status(phase: VoicePhase, message: string): void;
}

const failure = (error: unknown): string => {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) return 'mic-denied';
  if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'NotReadableError' || error.name === 'NotSupportedError')) return 'mic-unavailable';
  if (error instanceof Error && /^(?:http-\d{3}|mic-[a-z-]+|local-[a-z-]+|voice-[a-z-]+|asr-budget|tts-budget|playback-blocked|audio-format|empty-asr|dialogue-unavailable)$/.test(error.message)) return error.message;
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
  private readonly providers: Partial<Record<SpeakingProvider, VoiceProvider>>;
  private readonly speech = new SpeechQueue((line, signal) => this.announce(line, signal));
  private capture: Capture | null = null;
  private speechStart: (SpeechStart & { id: number }) | null = null;
  private seenLine: number | null = null;
  private activated = false;
  private context: AudioContext | null = null;
  private captures = 0;
  private commands = 0;
  private played = 0;
  private completed = 0;
  private readonly playbackHistory: CompletedSpeech[] = [];
  private lastError: string | null = null;
  private lastOutputError: string | null = null;
  private lastOutputFallback: SpeakingProvider | null = null;

  public constructor(model: ModelClient, private readonly hooks: Hooks, highQuality?: VoiceProvider) {
    this.deepSeek = new DeepSeekVoice(model);
    this.providers = { local: new SystemSpeech(), deepseek: { speak: this.speakCloud }, 'high-quality': highQuality };
    this.settings = loadVoicePreferences(window.localStorage);
    if (!highQuality && this.settings.output === 'high-quality') this.settings.output = 'local';
  }

  public get inputMode(): VoiceInput { return this.settings.input; }
  public get preferences(): VoicePreferences { return { ...this.settings, voices: { ...this.settings.voices } }; }
  public get hasHighQuality(): boolean { return !!this.providers['high-quality']; }
  public get preferredLanguage(): RadioLanguage | undefined {
    return this.settings.input === 'off' && this.settings.language === 'zh-CN' ? undefined : this.settings.language;
  }
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
      cloud: this.deepSeek.snapshot(), limits: VOICE_LIMITS };
  }

  public configure(settings: VoicePreferences): void {
    this.cancel(false);
    this.silence();
    this.settings = { ...settings, voices: { ...settings.voices } };
    this.lastOutputError = null;
    this.lastOutputFallback = null;
    saveVoicePreferences(window.localStorage, this.settings);
    if (this.activated) this.unlock();
  }

  public unlock(): void {
    this.activated = true;
    if (this.settings.output !== 'deepseek' || typeof AudioContext === 'undefined') return;
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
    if (!inFlight) { this.suspend(); return; }
    if (muted) { this.silence(); return; }
    if (unseen && !this.capture && this.activated && this.settings.output !== 'off' && line.agent !== null) this.speech.enqueue(line);
  }

  private async announce(line: RadioLine, signal: AbortSignal): Promise<void> {
    const identity = resolveVoiceIdentity(line.agent, this.settings.voices);
    const selected = this.settings.output;
    if (!identity || selected === 'off') return;
    const language = radioLanguageOf(line.text);
    const fallBack = selected !== 'local' && this.settings.localFallback;
    const order: SpeakingProvider[] = fallBack ? [selected, 'local'] : [selected];
    const lifecycle: VoiceLifecycle = { signal, start: info => {
      if (signal.aborted || this.speechStart?.id === line.id) return;
      this.speechStart = { ...info, id: line.id };
      if (info.provider !== selected) this.lastOutputFallback = info.provider;
      this.played++;
    } };
    this.lastOutputError = null;
    this.lastOutputFallback = null;
    for (const mode of order) {
      try {
        signal.throwIfAborted();
        const provider = this.providers[mode];
        if (!provider) throw new Error('voice-provider-unavailable');
        const stream = await provider.speak(line, language, identity, lifecycle);
        signal.throwIfAborted();
        const started = this.speechStart;
        if (!started || started.id !== line.id) throw new Error('playback-blocked');
        this.finishSpeech({ ...started, agent: identity.agent, ...(stream ? { stream } : {}) });
        return;
      } catch (error) {
        if (signal.aborted) return;
        this.lastOutputError = failure(error);
        if (this.speechStart?.id === line.id) return;
      }
    }
  }

  private speakCloud = async (line: RadioLine, _language: RadioLanguage, identity: VoiceIdentity,
    { signal, start }: VoiceLifecycle): Promise<SpeechStreamStats> => {
    if (!this.deepSeek.connected) throw new Error('voice-disconnected');
    if (this.context?.state !== 'running') throw new Error('playback-blocked');
    const playback = new RadioAudio(this.context, identity, signal,
      () => start({ provider: 'deepseek', voiceId: identity.cloudVoice, rate: identity.rate }));
    try {
      const stats = await this.deepSeek.speak(line.text, identity.cloudVoice, signal, chunk => playback.append(chunk));
      await playback.finish();
      return stats;
    } finally { playback.close(); }
  };

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
  }

  public reset(): void {
    this.suspend();
    this.speech.reset();
  }

  public dispose(): void {
    this.reset();
    this.providers['high-quality']?.dispose?.();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
