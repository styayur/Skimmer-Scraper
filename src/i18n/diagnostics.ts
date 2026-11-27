import { diagnosticMessages } from './diagnosticMessages';
import { selectedLocale, type Locale } from './locale';

// Native commands and legacy adapters report diagnostics as text. Translate only
// recognized messages at presentation boundaries, preserving the original detail
// for OS, browser and third-party errors.
const literal = new Map<string, readonly [string, string]>();
const templates: { pattern: RegExp; fields: string[]; messages: readonly [string, string] }[] = [];
for (const messages of diagnosticMessages) {
  for (const source of messages) {
    if (!source.includes('{')) {
      literal.set(source, messages);
      continue;
    }
    const fields: string[] = [];
    const parts = source.split(/(\{\w+\})/).map(part => {
      if (part.startsWith('{')) {
        fields.push(part.slice(1, -1));
        return '(.+?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    templates.push({ pattern: new RegExp('^' + parts.join('') + '$', 's'), fields, messages });
  }
}

export function localizeDiagnostic(text: string, locale: Locale = selectedLocale): string {
  const detail = text.startsWith('Error: ') ? text.slice(7) : text;
  const index = locale === 'zh-CN' ? 0 : 1;
  const translated = literal.get(detail);
  if (translated) return translated[index];
  for (const { pattern, fields, messages } of templates) {
    const match = pattern.exec(detail);
    if (match) return messages[index].replace(/\{(\w+)\}/g, (_, key: string) => match[fields.indexOf(key) + 1]!);
  }
  return text;
}
