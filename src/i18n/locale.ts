export type Locale = 'zh-CN' | 'en-US';

export function detectLocale(language?: string): Locale {
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

/** Shared by presentation, companion dialogue and voice at application startup. */
export const selectedLocale = detectLocale(globalThis.navigator?.language);
