import { COMPANION_PROFILES, type RadioLanguage, type RadioLine } from '../ai/radioDialogue';
import type { SpeechStreamStats } from './deepSeekVoice';

export type VoiceInput = 'off' | 'local' | 'deepseek';
export type VoiceOutput = VoiceInput | 'high-quality';
export type SpeakingProvider = Exclude<VoiceOutput, 'off'>;
export type VoiceOverrides = Partial<Record<1 | 2 | 3, string>>;

export interface VoicePreferences {
  input: VoiceInput;
  output: VoiceOutput;
  language: RadioLanguage;
  localFallback: boolean;
  volume: number;
  voices: VoiceOverrides;
}

export interface VoiceIdentity {
  agent: 1 | 2 | 3;
  callsign: string;
  rate: number;
  pitch: number;
  pan: number;
  volume: number;
  preferredSystemVoice?: string;
  cloudVoice: 'stella' | 'tide';
}

export interface SpeechStart {
  provider: SpeakingProvider;
  voiceId: string;
  startLatencyMs?: number;
  rate?: number;
  pitch?: number;
}

export interface VoiceLifecycle {
  signal: AbortSignal;
  preview?: boolean;
  start(info: SpeechStart): void;
}

export interface VoiceProvider {
  speak(line: RadioLine, language: RadioLanguage, identity: VoiceIdentity, lifecycle: VoiceLifecycle): Promise<SpeechStreamStats | void>;
  dispose?(): void;
}

const voices = [
  { rate: 0.99, pitch: 1.00, pan: -0.18, cloudVoice: 'stella' },
  { rate: 0.93, pitch: 0.88, pan: 0, cloudVoice: 'tide' },
  { rate: 1.10, pitch: 1.12, pan: 0.18, cloudVoice: 'stella' },
] as const;

export const resolveVoiceIdentity = (agent: number | null, overrides: VoiceOverrides, volume = 1): VoiceIdentity | null => {
  if (agent !== 1 && agent !== 2 && agent !== 3) return null;
  return { agent, callsign: COMPANION_PROFILES[agent - 1]!.callsign, ...voices[agent - 1]!, volume,
    preferredSystemVoice: overrides[agent] };
};
