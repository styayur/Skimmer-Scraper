import type { VoiceOutput, VoiceOverrides, VoicePreferences } from './voiceContracts';

const key = 'skimmer-scraper.voice.v1';
const defaults: VoicePreferences = { input: 'off', output: 'off', language: 'zh-CN', localFallback: true, volume: 0.84, voices: {} };

export const loadVoicePreferences = (storage: Pick<Storage, 'getItem'>): VoicePreferences => {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? '{}') as Partial<VoicePreferences> | null;
    const output: VoiceOutput = saved?.output === 'local' || saved?.output === 'high-quality' ? saved.output : defaults.output;
    const voices: VoiceOverrides = {};
    for (const id of [1, 2, 3] as const) {
      const name = saved?.voices?.[id];
      if (typeof name === 'string' && name.length <= 240) voices[id] = name;
    }
    const volume = typeof saved?.volume === 'number' && Number.isFinite(saved.volume)
      ? Math.max(0, Math.min(1, saved.volume)) : defaults.volume;
    return { ...defaults, output, language: saved?.language === 'en-US' ? 'en-US' : 'zh-CN',
      localFallback: saved?.localFallback !== false, volume, voices };
  } catch { return { ...defaults, voices: {} }; }
};

export const saveVoicePreferences = (storage: Pick<Storage, 'setItem'>, preferences: VoicePreferences): void => {
  const { output, language, voices, volume, localFallback } = preferences;
  try { storage.setItem(key, JSON.stringify({ output: output === 'deepseek' ? 'off' : output, language, volume, localFallback, voices })); }
  catch { /* The current page can still use the selected voices. */ }
};
