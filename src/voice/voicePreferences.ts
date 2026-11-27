import type { VoiceOutput, VoicePreferences } from './voiceContracts';
import { selectedLocale } from '../i18n/locale';

const key = 'skimmer-scraper.voice.v1';
const defaults: VoicePreferences = { input: 'off', output: 'off', language: selectedLocale, localFallback: true, volume: 0.84 };

export const loadVoicePreferences = (storage: Pick<Storage, 'getItem'>): VoicePreferences => {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? '{}') as Partial<VoicePreferences> | null;
    const output: VoiceOutput = saved?.output === 'local' || String(saved?.output) === 'high-quality' ? 'local' : defaults.output;
    const volume = typeof saved?.volume === 'number' && Number.isFinite(saved.volume)
      ? Math.max(0, Math.min(1, saved.volume)) : defaults.volume;
    return { ...defaults, output, language: saved?.language === 'en-US' || saved?.language === 'zh-CN' ? saved.language : defaults.language,
      localFallback: saved?.localFallback !== false, volume };
  } catch { return { ...defaults }; }
};

export const saveVoicePreferences = (storage: Pick<Storage, 'setItem'>, preferences: VoicePreferences): void => {
  const { output, language, volume, localFallback } = preferences;
  try { storage.setItem(key, JSON.stringify({ output: output === 'deepseek' ? 'off' : output, language, volume, localFallback })); }
  catch { /* The current page can still use the selected voices. */ }
};
