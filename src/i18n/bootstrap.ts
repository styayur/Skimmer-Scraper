import { catalogs, selectedLocale, type MessageKey } from './index';

// Translate the static shell once, before panel bindings populate dynamic values.
document.documentElement.lang = selectedLocale;
const messages = catalogs[selectedLocale];
for (const attribute of ['text', 'aria-label', 'placeholder', 'data-radio-command', 'content']) {
  const marker = attribute === 'text' ? 'data-i18n' : `data-i18n-${attribute}`;
  for (const element of document.querySelectorAll(`[${marker}]`)) {
    const key = element.getAttribute(marker) as MessageKey;
    if (!Object.hasOwn(messages, key)) throw new Error(`Missing UI translation: ${key}`);
    if (attribute === 'text') element.textContent = messages[key];
    else element.setAttribute(attribute, messages[key]);
  }
}
