import type { RadioLanguage, RadioLine } from '../ai/radioDialogue';
import type { VoiceIdentity, VoiceLifecycle, VoiceProvider } from './voiceContracts';
interface LocalResult extends Event { results: ArrayLike<ArrayLike<{ transcript: string }>> }
interface LocalError extends Event { error: string }
interface LocalRecognition {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: LocalError) => void) | null;
  onresult: ((event: LocalResult) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface LocalRecognitionType {
  new(): LocalRecognition;
  available(options: { langs: string[]; processLocally: true }): Promise<string>;
  install(options: { langs: string[]; processLocally: true }): Promise<boolean>;
}
const recognitionType = (): LocalRecognitionType | undefined => {
  const api = window as Window & { SpeechRecognition?: LocalRecognitionType; webkitSpeechRecognition?: LocalRecognitionType };
  return api.SpeechRecognition ?? api.webkitSpeechRecognition;
};

export const prepareLocalSpeech = async (language: RadioLanguage): Promise<boolean> => {
  const Recognition = recognitionType();
  if (!Recognition?.available || !Recognition.install || !('processLocally' in Recognition.prototype)) return false;
  const options = { langs: [language], processLocally: true as const };
  const state = await Recognition.available(options);
  if (state === 'available') return true;
  return state === 'downloadable' || state === 'downloading' ? Recognition.install(options) : false;
};

export const openLocalSpeech = async (language: RadioLanguage, signal: AbortSignal) => {
  const Recognition = recognitionType();
  if (!Recognition?.available || !('processLocally' in Recognition.prototype)) throw new Error('local-asr-unavailable');
  const recognition = new Recognition();
  recognition.processLocally = true;
  recognition.lang = language;
  recognition.continuous = true;
  if (!recognition.processLocally) throw new Error('local-asr-unavailable');
  let started = false;
  let lastTranscript = '';
  let opened!: () => void;
  let cannotOpen!: (error: Error) => void;
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => { opened = yes; cannotOpen = no; });
  const result = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  void result.catch(() => {});
  const clear = () => {
    signal.removeEventListener('abort', abort);
    recognition.onstart = recognition.onerror = recognition.onresult = recognition.onend = null;
  };
  const fail = (error: Error) => { clear(); cannotOpen(error); reject(error); };
  const abort = () => { recognition.abort(); fail(new DOMException('Recording cancelled', 'AbortError')); };
  recognition.onstart = () => { started = true; opened(); };
  recognition.onresult = ({ results }) => {
    lastTranscript = Array.from(results, candidates => candidates[0]?.transcript ?? '').join(' ').slice(0, 1000);
  };
  recognition.onerror = ({ error }) => {
    if (error === 'no-speech' && started) { clear(); resolve(''); }
    else fail(new Error(error === 'not-allowed' || error === 'service-not-allowed' ? 'mic-denied'
      : error === 'language-not-supported' ? 'local-asr-pack' : 'mic-capture'));
  };
  recognition.onend = () => {
    clear();
    if (!started) cannotOpen(new Error('mic-capture'));
    resolve(lastTranscript);
  };
  signal.throwIfAborted();
  signal.addEventListener('abort', abort, { once: true });
  try { recognition.start(); } catch (error) { clear(); throw error; }
  await ready;
  return { result, finish: () => recognition.stop() };
};

export const listSystemVoices = (language: RadioLanguage): SpeechSynthesisVoice[] => {
  const synth = window.speechSynthesis;
  const prefix = language.slice(0, 2);
  return synth?.getVoices().filter(voice => voice.localService && voice.lang.toLowerCase().slice(0, 2) === prefix)
    .sort((a, b) => Number(b.lang === language) - Number(a.lang === language) || a.voiceURI.localeCompare(b.voiceURI)) ?? [];
};

export class SystemSpeech implements VoiceProvider {
  public async speak(line: RadioLine, language: RadioLanguage, identity: VoiceIdentity, lifecycle: VoiceLifecycle): Promise<void> {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('local-tts-unavailable');
    const { signal, start } = lifecycle;
    signal.throwIfAborted();
    let voices = listSystemVoices(language);
    if (!voices.length && !synth.getVoices().length) voices = await this.awaitVoices(synth, language, signal);
    if (!voices.length) throw new Error('local-tts-unavailable');
    const voice = voices.find(item => item.voiceURI === identity.preferredSystemVoice) ?? voices[(identity.agent - 1) % voices.length]!;
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = identity.rate;
      utterance.pitch = identity.pitch;
      utterance.volume = 0.83;
      let started = false;
      const clear = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        utterance.onstart = utterance.onend = utterance.onerror = null;
      };
      const fail = (error: unknown) => { clear(); reject(error); };
      const abort = () => { fail(signal.reason); synth.cancel(); };
      const timer = window.setTimeout(() => { fail(new Error('voice-timeout')); synth.cancel(); }, 22_000);
      signal.addEventListener('abort', abort, { once: true });
      utterance.onstart = () => {
        if (signal.aborted) return;
        started = true;
        start({ provider: 'local', voiceId: voice.voiceURI, rate: utterance.rate, pitch: utterance.pitch });
      };
      utterance.onend = () => { clear(); if (started) resolve(); else reject(new Error('playback-blocked')); };
      utterance.onerror = () => fail(new Error('playback-blocked'));
      try { synth.speak(utterance); } catch (error) { fail(error); }
    });
  }

  private awaitVoices(synth: SpeechSynthesis, language: RadioLanguage, signal: AbortSignal): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve, reject) => {
      const clear = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        synth.removeEventListener('voiceschanged', available);
      };
      const abort = () => { clear(); reject(signal.reason); };
      const available = () => { clear(); resolve(listSystemVoices(language)); };
      const timer = window.setTimeout(available, 800);
      signal.addEventListener('abort', abort, { once: true });
      synth.addEventListener('voiceschanged', available, { once: true });
    });
  }
}
