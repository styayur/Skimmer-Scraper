import type { ModelClient } from '../ai/modelClient';
import { radioText, type RadioLine } from '../ai/radioDialogue';
import { openLocalSpeech, speakLocally, type RadioLanguage } from './browserSpeech';
import { DeepSeekVoice, VOICE_LIMITS, type SpeechStreamStats } from './deepSeekVoice';
import { openMicrophone } from './microphone';
import { StreamedRadioPlayback } from './playback';
import { MAX_CLIP_SECONDS } from './wave';

export type VoiceMode = 'off' | 'local' | 'deepseek';
type VoicePhase = 'idle' | 'opening' | 'recording' | 'transcribing';
export type PushToTalkSource = 'keyboard' | 'gamepad' | 'touch';
export interface VoiceSettings { input: VoiceMode; output: VoiceMode; language: RadioLanguage; localFallback: boolean }
interface Capture {
  source: PushToTalkSource;
  controller: AbortController;
  phase: Exclude<VoicePhase, 'idle'>;
  finish?: () => void;
  timer: number;
}
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
  private settings: VoiceSettings = { input: 'off', output: 'off', language: 'zh-CN', localFallback: true };
  private readonly deepSeek: DeepSeekVoice;
  private capture: Capture | null = null;
  private playback: { controller: AbortController; line: RadioLine } | null = null;
  private pendingLine: RadioLine | null = null;
  private seenLine: number | null = null;
  private context: AudioContext | null = null;
  private captures = 0;
  private commands = 0;
  private played = 0;
  private completed = 0;
  private lastCompleted: { id: number; agent: number; provider: 'local' | 'deepseek'; stream?: SpeechStreamStats } | null = null;
  private lastError: string | null = null;

  public constructor(model: ModelClient, private readonly hooks: Hooks) { this.deepSeek = new DeepSeekVoice(model); }
  public get inputMode(): VoiceMode { return this.settings.input; }
  public get ducking(): boolean { return !!this.playback || this.capture?.phase === 'opening' || this.capture?.phase === 'recording'; }
  public snapshot() {
    return { ...this.settings, phase: this.capture?.phase ?? 'idle', played: this.played, completed: this.completed,
      speaking: this.playback?.line.agent ?? null, captures: this.captures, commands: this.commands, lastError: this.lastError,
      lastCompleted: this.lastCompleted, cloud: this.deepSeek.snapshot(), limits: VOICE_LIMITS };
  }

  public configure(settings: VoiceSettings): void {
    this.cancel(false);
    this.silence();
    this.settings = { ...settings };
    this.unlock();
  }

  public unlock(): void {
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

  private async record(capture: Capture, input: VoiceMode, language: RadioLanguage): Promise<void> {
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

  public update(inFlight: boolean, line: RadioLine | null): void {
    if (!inFlight) { this.cancel(false); this.silence(); return; }
    if (!line || line.id === this.seenLine) return;
    this.seenLine = line.id;
    if (this.capture || this.settings.output === 'off' || line.agent === null) return;
    if (line.priority === 'risk') this.silence();
    if (this.playback) {
      if (this.pendingLine?.priority !== 'reply' || line.priority === 'reply') this.pendingLine = line;
      return;
    }
    this.play(line);
  }

  private play(line: RadioLine): void {
    const controller = new AbortController();
    this.playback = { controller, line };
    void this.announce(line, controller.signal).finally(() => {
      if (this.playback?.controller !== controller) return;
      this.playback = null;
      const next = this.pendingLine;
      this.pendingLine = null;
      if (next && this.hooks.available() && !this.capture) this.play(next);
    });
  }

  private async announce(line: RadioLine, signal: AbortSignal): Promise<void> {
    const agent = line.agent ?? 1;
    const language = /[\u3400-\u9fff]/.test(line.text) ? 'zh-CN' : 'en-US';
    let began = false;
    try {
      if (this.settings.output === 'deepseek' && this.deepSeek.connected && this.context?.state === 'running') {
        const stream = new StreamedRadioPlayback(this.context, agent, signal);
        try {
          const stats = await this.deepSeek.speak(line.text, agent === 2 ? 'tide' : 'stella', signal, async chunk => {
            if (!began) { began = true; this.played++; }
            await stream.append(chunk);
          });
          await stream.finish();
          this.completed++;
          this.lastCompleted = { id: line.id, agent, provider: 'deepseek', stream: stats };
          return;
        } catch (error) {
          if (signal.aborted || began || !this.settings.localFallback) throw error;
          this.lastError = failure(error);
        } finally { stream.close(); }
      } else if (this.settings.output === 'deepseek' && !this.settings.localFallback) return;
      if (signal.aborted || this.settings.output === 'off') return;
      await speakLocally(line.text, language, agent, signal);
      this.played++;
      this.completed++;
      this.lastCompleted = { id: line.id, agent, provider: 'local' };
    } catch (error) {
      if (!signal.aborted) this.lastError = failure(error);
    }
  }

  public silence(): boolean {
    const active = this.playback;
    this.pendingLine = null;
    if (!active) return false;
    this.playback = null;
    active.controller.abort();
    return true;
  }

  public dispose(): void {
    this.cancel(false);
    this.silence();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
