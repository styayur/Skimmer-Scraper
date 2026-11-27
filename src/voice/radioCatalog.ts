import authored from '../../art/radio/lines.json';
import type { Locale } from '../i18n/locale';

export interface CatalogLine {
  readonly catalogId: string;
  readonly agent: number;
  readonly event: string;
  readonly locale: Locale;
  readonly text: string;
  readonly clip?: string;
}

/** The render scripts and the flight client read the same authoring manifest. */
export class RadioLineCatalog {
  private readonly entries = new Map<string, CatalogLine>();

  public constructor() {
    for (const { agent, event, text, spokenLanguages } of authored) {
      const catalogId = `${agent}-${event}`;
      for (const locale of ['en-US', 'zh-CN'] as const) {
        const key = `${locale}/${catalogId}`;
        if (this.entries.has(key)) throw new Error(`Duplicate radio line ${key}`);
        const clip = spokenLanguages.includes(locale) ? `radio/${key}.opus` : undefined;
        this.entries.set(key, Object.freeze({ catalogId, agent, event, locale, text: text[locale], clip }));
      }
    }
  }

  public resolve(agent: number, event: string, locale: Locale): CatalogLine | undefined {
    return this.entries.get(`${locale}/${agent}-${event}`);
  }
}

export const radioCatalog = new RadioLineCatalog();
