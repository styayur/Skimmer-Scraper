import type { RadioLanguage } from '../ai/radioDialogue';
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
