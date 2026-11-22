import type { RadioLanguage } from '../ai/radioDialogue';

export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
export const KOKORO_REVISION = '6cc0f0d2ebe369a68b0df87c2b65c1af8c0ac3e3';
export const KOKORO_VOICES = { 1: 'zf_001', 2: 'zm_010', 3: 'zf_006' } as const;
export type KokoroVoiceId = typeof KOKORO_VOICES[keyof typeof KOKORO_VOICES];
export type KokoroBackend = 'webgpu' | 'wasm';

export type KokoroRequest =
  | { type: 'prepare'; id: number; forceWasm: boolean }
  | { type: 'generate'; id: number; text: string; voice: KokoroVoiceId; speed: number };

export type KokoroReply =
  | { type: 'progress'; id: number; backend: KokoroBackend; percent: number | null }
  | { type: 'ready'; id: number; backend: KokoroBackend; loadMs: number; device: string }
  | { type: 'audio'; id: number; backend: KokoroBackend; inferenceMs: number; sampleRate: number; samples: Float32Array<ArrayBuffer> }
  | { type: 'error'; id: number; backend: KokoroBackend | null; code: string; detail: string };

export const mandarinSpeechText = (text: string, language: RadioLanguage): string => {
  const chinese = text.normalize('NFKC').replace(/\bKITE[- ]?([123])\b/gi, (_, digit: string) => `凯特${digit}号`)
    .replace(/\bNavigator\b/gi, '领航员').replace(/\bGuardian\b/gi, '守护员').replace(/\bExplorer\b/gi, '侦察员');
  if (language !== 'zh-CN' || !/\p{Script=Han}/u.test(chinese) || /\p{Script=Latin}/u.test(chinese)) {
    throw new Error('kokoro-language');
  }
  if (Array.from(chinese).length > 92) throw new Error('kokoro-sentence-limit');
  return chinese;
};
