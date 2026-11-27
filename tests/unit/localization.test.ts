import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogs, translate } from '../../src/i18n';
import { detectLocale } from '../../src/i18n/locale';
import { diagnosticMessages } from '../../src/i18n/diagnosticMessages';
import { localizeDiagnostic } from '../../src/i18n/diagnostics';
import { chapters as chinese } from '../../src/i18n/guide.zh-CN';
import { chapters as english } from '../../src/i18n/guide.en-US';

const fields = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const han = /\p{Script=Han}/u;

describe('bilingual flight UI', () => {
  it('uses Simplified Chinese for every zh browser and English otherwise', () => {
    for (const language of ['zh', 'ZH-CN', 'zh-TW', 'zh-Hant-HK']) expect(detectLocale(language)).toBe('zh-CN');
    for (const language of ['en-US', 'de-DE', '', undefined]) expect(detectLocale(language)).toBe('en-US');
  });

  it('covers the static shell and dynamic messages with matching interpolation fields', () => {
    const zh = catalogs['zh-CN'];
    const en = catalogs['en-US'];
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(en)) {
      const other = zh[key as keyof typeof zh];
      expect(other.trim(), key).not.toBe('');
      expect(han.test(value), key).toBe(false);
      expect(fields(other), key).toEqual(fields(value));
    }
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    for (const [, key] of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) {
      expect(Object.hasOwn(en, key!), key).toBe(true);
    }
    expect(translate('zh-CN', 'wingmate.name', { id: 3 })).toBe('风筝3');
    expect(translate('en-US', 'wingmate.name', { id: 3 })).toBe('KITE-3');
  });

  it('preserves chapter anchors and supplies both versions of every paragraph', () => {
    expect(Object.keys(english)).toEqual(Object.keys(chinese));
    for (const [id, chapter] of Object.entries(english)) {
      const zh = chinese[id as keyof typeof chinese];
      expect(chapter.length, id).toBe(zh.length);
      expect(chapter.every(p => p.trim() && !han.test(p)), id).toBe(true);
      expect(zh.every(p => han.test(p)), id).toBe(true);
    }
  });

  it('translates adapter diagnostics and keeps runtime details intact', () => {
    for (const [zh, en] of diagnosticMessages) {
      expect(fields(zh)).toEqual(fields(en));
      const sample = (s: string) => s.replace(/\{(\w+)\}/g, (_, name: string) => 'sample_' + name);
      expect(localizeDiagnostic(sample(zh), 'en-US')).toBe(sample(en));
      expect(localizeDiagnostic(sample(en), 'zh-CN')).toBe(sample(zh));
    }
    expect(localizeDiagnostic('Error: 世界分块记录无效。', 'en-US')).toBe('Error: 世界分块记录无效。');
    expect(localizeDiagnostic('Error: 无效的世界种子。', 'en-US')).toBe('Invalid world seed.');
  });
});
