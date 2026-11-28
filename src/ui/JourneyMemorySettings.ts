import { JOURNEY_KEY, type JourneyMemory } from '../ai/journeyMemory';
import { describeObservation, journeyText } from '../i18n/journeyMemory';
import { selectedLocale } from '../i18n/locale';

export function bindJourneyMemory(journal: JourneyMemory) {
  const labels = journeyText(selectedLocale);
  const panel = document.createElement('details');
  panel.id = 'journey-memory-settings';
  panel.className = 'model-settings';
  panel.innerHTML = `<summary>${labels.title}</summary>
    <label><input id="journey-memory-enabled" type="checkbox">${labels.enabled}</label>
    <label><input id="journey-memory-share" type="checkbox">${labels.share}</label>
    <p class="setting-status">${labels.description}</p>
    <label>${labels.days}<input id="journey-memory-days" type="number" min="1" max="365" step="1"></label>
    <label>${labels.capacity}<input id="journey-memory-capacity" type="number" min="1" max="128" step="1"></label>
    <ol id="journey-memory-entries"></ol><p class="setting-status" role="status"></p>
    <button id="journey-memory-clear" class="utility-button" type="button">${labels.erase}</button>`;
  document.querySelector('#advanced-flight-settings')!.append(panel);
  const input = (id: string) => panel.querySelector<HTMLInputElement>(`#journey-memory-${id}`)!;
  const enabled = input('enabled'), share = input('share'), days = input('days'), capacity = input('capacity');
  const list = panel.querySelector('ol')!, status = panel.querySelector<HTMLElement>('[role=status]')!;
  const clear = panel.querySelector<HTMLButtonElement>('#journey-memory-clear')!;
  const dates = new Intl.DateTimeFormat(selectedLocale, { dateStyle: 'medium', timeStyle: 'short' });

  function render(saved = true) {
    const journalState = journal.snapshot();
    enabled.checked = journalState.enabled;
    share.checked = journalState.shareWithModel;
    share.disabled = !enabled.checked;
    days.value = String(journalState.retentionDays);
    capacity.value = String(journalState.capacity);
    days.disabled = capacity.disabled = !enabled.checked && !journalState.entries.length;
    list.replaceChildren();
    for (const entry of journalState.entries.reverse()) {
      const item = document.createElement('li');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'utility-button';
      const description = describeObservation(entry, selectedLocale);
      remove.textContent = labels.remove;
      remove.setAttribute('aria-label', `${labels.remove} · ${description} · ${dates.format(entry.at)}`);
      remove.onclick = async () => render(await journal.forget(entry.id));
      item.append(`${dates.format(entry.at)} · ${description} · #${entry.world.seed}/${entry.world.fingerprint.toString(16)} `, remove);
      list.append(item);
    }
    status.textContent = !saved || journal.unavailable ? labels.unavailable : list.children.length ? '' : labels.empty;
    clear.disabled = !journal.unavailable && !list.children.length;
  }
  enabled.onchange = async () => render(await journal.configure({ enabled: enabled.checked }));
  share.onchange = async () => render(await journal.configure({ shareWithModel: share.checked }));
  days.onchange = async () => render(await journal.configure({ retentionDays: days.valueAsNumber }));
  capacity.onchange = async () => render(await journal.configure({ capacity: capacity.valueAsNumber }));
  clear.onclick = async () => render(await journal.clear());
  panel.ontoggle = async () => { if (panel.open) render(await journal.prune()); };
  window.addEventListener('storage', event => { if (panel.open && (event.key === JOURNEY_KEY || event.key === null)) render(); });
  void journal.prune();
  render();
}
