import { en } from './en-US';
import { zh } from './zh-CN';
import { selectedLocale, type Locale } from './locale';

export { selectedLocale };
export type MessageKey = keyof typeof en;
export const catalogs = { 'en-US': en, 'zh-CN': zh } as const;

type Fields<S extends string> = S extends `${string}{${infer K}}${infer Rest}` ? K | Fields<Rest> : never;
type Arguments<K extends MessageKey> = [Fields<typeof en[K]>] extends [never]
  ? [] : [values: Record<Fields<typeof en[K]>, number | string>];

export function translate<K extends MessageKey>(locale: Locale, key: K, ...args: Arguments<K>): string {
  const message = catalogs[locale][key];
  const values: Record<string, number | string> | undefined = args[0];
  return values ? message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name])) : message;
}

export function t<K extends MessageKey>(key: K, ...args: Arguments<K>): string {
  return translate(selectedLocale, key, ...args);
}

export function wingmateName(id: number): string {
  return t('wingmate.name', { id });
}
