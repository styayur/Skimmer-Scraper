import type { VoiceOutput, VoiceOverrides, VoicePreferences } from './voiceContracts';

const key = 'skimmer-scraper.voice.v1';
const defaults: VoicePreferences = { input: 'off', output: 'local', language: 'zh-CN', localFallback: true, voices: {} };

export const loadVoicePreferences = (storage: Pick<Storage, 'getItem'>): VoicePreferences => {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? '{}') as Partial<VoicePreferences> | null;
    const output: VoiceOutput = saved?.output === 'off' || saved?.output === 'high-quality' ? saved.output : defaults.output;
    const voices: VoiceOverrides = {};
    for (const id of [1, 2, 3] as const) {
      const name = saved?.voices?.[id];
      if (typeof name === 'string' && name.length <= 240) voices[id] = name;
    }
    return { ...defaults, output, language: saved?.language === 'en-US' ? 'en-US' : 'zh-CN', voices };
  } catch { return { ...defaults, voices: {} }; }
};

export const saveVoicePreferences = (storage: Pick<Storage, 'setItem'>, preferences: VoicePreferences): void => {
  const { output, language, voices } = preferences;
  try { storage.setItem(key, JSON.stringify({ output: output === 'deepseek' ? 'local' : output, language, voices })); }
  catch { /* The current page can still use the selected voices. */ }
};
