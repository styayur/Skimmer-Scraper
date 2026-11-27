import { chapters as english } from '../i18n/guide.en-US';
import { chapters as chinese } from '../i18n/guide.zh-CN';
import { selectedLocale } from '../i18n/locale';
import { t } from '../i18n';

const chapters: Record<keyof typeof english, readonly [string, ...string[]]> = { 'zh-CN': chinese, 'en-US': english }[selectedLocale];

export function bindGameTutorial(panel: HTMLElement): void {
  const search = panel.querySelector<HTMLInputElement>('#guide-search')!;
  const index = panel.querySelector<HTMLElement>('#guide-index')!;
  const content = panel.querySelector<HTMLElement>('#guide-content')!;
  const empty = panel.querySelector<HTMLElement>('#guide-empty')!;
  const rows = Object.entries(chapters).map(([id, [title, ...paragraphs]]) => {
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.dataset.helpSection = id;
    link.textContent = title;
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.id = id;
    heading.tabIndex = -1;
    heading.textContent = title;
    section.append(heading, ...paragraphs.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
    index.append(link);
    content.append(section);
    return { id, link, section, searchText: [title, ...paragraphs].join(' ').normalize('NFKC').toLowerCase() };
  });
  rows.find(row => row.id === 'guide-graphics')!.section.append(panel.querySelector('#record-hint')!);
  rows.find(row => row.id === 'guide-privacy')!.section.append(panel.querySelector('#guide-source-links')!);
  rows.find(row => row.id === 'guide-world')!.section.append(panel.querySelector('#guide-legacy-link')!);

  const skyRecord = document.createElement('p');
  rows.find(row => row.id === 'guide-sky')!.section.append(skyRecord);
  panel.addEventListener('skimmer:open', () => {
    let unlocked = false;
    try { unlocked = JSON.parse(localStorage.getItem('skimmer-scraper.journey.v3') ?? '{}').fifthUnlocked === true; } catch { /* optional record */ }
    skyRecord.hidden = !unlocked;
    skyRecord.textContent = unlocked ? t('guide.fifthCrossing') : '';
  });

  const filter = (): void => {
    const terms = search.value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    let any = false;
    for (const row of rows) {
      const visible = terms.every(term => row.searchText.includes(term));
      row.link.hidden = !visible;
      row.section.hidden = !visible;
      any ||= visible;
    }
    empty.hidden = any;
    index.hidden = !any;
  };
  search.addEventListener('input', filter);
  panel.addEventListener('skimmer:close', () => {
    search.value = '';
    filter();
    panel.scrollTop = 0;
  });
}
