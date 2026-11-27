import { t, wingmateName } from '../i18n';
import { COMPANION_PROFILES, type RadioDialogue, type RadioLine } from '../ai/radioDialogue';
import type { RadioSubtitle } from '../voice/voiceContracts';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`radio-${id}`) as T;

const roleLabels = { Navigator: 'wingmate.navigator', Guardian: 'wingmate.guardian', Explorer: 'wingmate.explorer' } as const;

const lineItems = (line: RadioLine): [HTMLElement, HTMLElement] => {
  const speaker = document.createElement('span');
  speaker.className = 'radio-speaker';
  const member = COMPANION_PROFILES.find(profile => profile.id === line.agent);
  speaker.textContent = member ? `${wingmateName(member.id)} · ${t(roleLabels[member.role])}` : t('radioPanel.you');
  const text = document.createElement('span');
  text.lang = line.locale;
  text.textContent = line.text;
  return [speaker, text];
};

export class RadioPanel {
  private readonly panel = get('panel');
  private readonly transcript = get('history');
  private readonly subtitle = get('subtitle');
  private readonly input = get<HTMLInputElement>('input');
  private readonly mute = get<HTMLInputElement>('mute');
  private subtitleId: number | undefined;
  private historyId: number | undefined;

  public constructor(private readonly radio: RadioDialogue, private readonly send: (message: string) => boolean, silence: () => void) {
    const form = get<HTMLFormElement>('form');
    this.panel.addEventListener('skimmer:open', () => {
      this.mute.checked = radio.muted;
      get('form-status').textContent = '';
      this.update(false);
    });
    this.panel.addEventListener('skimmer:close', () => { this.input.value = ''; silence(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const accepted = this.send(this.input.value);
      if (!accepted) get('form-status').textContent = t('radioPanel.radioUnavailableOrTheMessageContainsYour');
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-radio-command]').forEach(button => {
      button.addEventListener('click', () => {
        this.input.value = button.dataset.radioCommand ?? '';
        form.requestSubmit();
      });
    });
    this.mute.addEventListener('change', () => { radio.setMuted(this.mute.checked); if (this.mute.checked) silence(); this.update(false); });
    get('interrupt').addEventListener('click', () => { radio.interrupt(); silence(); this.update(false); });
  }

  public update(inFlight: boolean, caption: RadioSubtitle | null = null): void {
    const active = inFlight ? caption : null;
    if (active?.playbackId !== this.subtitleId) {
      this.subtitleId = active?.playbackId;
      this.subtitle.hidden = active === null;
      if (active) {
        this.subtitle.dataset.playbackId = String(active.playbackId);
        this.subtitle.dataset.priority = active.line.priority;
        this.subtitle.replaceChildren(...lineItems(active.line));
      } else {
        delete this.subtitle.dataset.playbackId;
        this.subtitle.replaceChildren();
      }
    }
    if (this.panel.hidden) return;
    const { history } = this.radio.snapshot();
    const mostRecent = history.at(-1)?.id;
    if (mostRecent === this.historyId) return;
    this.historyId = mostRecent;
    get('empty').hidden = history.length > 0;
    this.transcript.replaceChildren(...history.map(line => {
      const item = document.createElement('li');
      item.dataset.source = line.source;
      item.append(...lineItems(line));
      return item;
    }));
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
}
