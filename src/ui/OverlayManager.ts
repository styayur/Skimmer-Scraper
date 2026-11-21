export type Overlay = 'menu' | 'rules' | 'world' | 'library' | 'help';

interface View {
  name: Overlay;
  focus?: HTMLElement;
}

/** Owns panel visibility and restores focus when returning from a panel. */
export class OverlayManager {
  private readonly backgrounds = ['title-screen', 'hud', 'fail-screen'].map(id => document.getElementById(id)!);
  private readonly history: View[] = [];
  private active: Overlay | undefined;
  private opener: HTMLElement | undefined;

  public constructor(private readonly panels: Record<Overlay, HTMLElement>) {}

  public get current(): Overlay | undefined {
    return this.active;
  }

  public get panel(): HTMLElement | undefined {
    return this.active && this.panels[this.active];
  }

  public open(name: Overlay, drillDown = false, focus?: HTMLElement): void {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!this.active) this.opener = previouslyFocused ?? undefined;
    const ancestor = this.history.findIndex(view => view.name === name);
    if (ancestor >= 0) {
      const [view] = this.history.splice(ancestor);
      focus ??= view.focus;
    } else if (this.active && this.active !== name && drillDown) {
      this.history.push({ name: this.active, focus: previouslyFocused ?? undefined });
    }
    if (this.active !== name) this.hideActive();
    this.active = name;
    this.backgrounds.forEach(background => { background.inert = true; });
    const panel = this.panels[name];
    panel.hidden = false;
    panel.dispatchEvent(new Event('skimmer:open'));
    this.focus(panel, focus);
  }

  public close(): void {
    const parent = this.history.pop();
    if (parent) this.open(parent.name, false, parent.focus);
    else this.clear(true);
  }

  public clear(restoreFocus = false): void {
    this.hideActive();
    this.active = undefined;
    this.history.length = 0;
    this.backgrounds.forEach(background => { background.inert = false; });
    if (restoreFocus && this.opener?.getClientRects().length) this.opener.focus({ preventScroll: true });
    this.opener = undefined;
  }

  private hideActive(): void {
    const panel = this.panel;
    if (!panel) return;
    panel.hidden = true;
    panel.dispatchEvent(new Event('skimmer:close'));
  }

  private focus(panel: HTMLElement, preferred?: HTMLElement): void {
    const target = preferred?.getClientRects().length
      ? preferred
      : panel.querySelector<HTMLElement>('[data-panel-focus]:not([hidden])');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: target.matches('h3') ? 'start' : 'nearest', inline: 'nearest' });
  }
}
