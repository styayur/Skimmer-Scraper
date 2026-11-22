import { COMPANION_PROFILES, type RadioDialogue, type RadioLine } from '../ai/radioDialogue';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`radio-${id}`) as T;

const lineItems = (line: RadioLine): [HTMLElement, HTMLElement] => {
  const speaker = document.createElement('span');
  speaker.className = 'radio-speaker';
  const member = COMPANION_PROFILES.find(profile => profile.id === line.agent);
  speaker.textContent = member ? `${member.callsign} · ${member.role}` : '你';
  const text = document.createElement('span');
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
      if (!accepted) get('form-status').textContent = '电台暂不可用，或消息包含当前连接的 Key。';
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

  public update(inFlight: boolean, voice: RadioLine | null = null): void {
    const { active, history } = this.radio.snapshot();
    const spoken = inFlight ? voice ?? active : null;
    if (spoken?.id !== this.subtitleId) {
      this.subtitleId = spoken?.id;
      this.subtitle.hidden = spoken === null;
      if (spoken) {
        this.subtitle.dataset.priority = spoken.priority;
        this.subtitle.replaceChildren(...lineItems(spoken));
      } else this.subtitle.replaceChildren();
    }
    if (this.panel.hidden && history.length) return;
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
