export type Overlay = 'menu' | 'rules' | 'world' | 'library' | 'help' | 'radio';

interface View {
  name: Overlay;
  focus?: HTMLElement;
  scrollTop: number;
  suspended: boolean;
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
    let returning: View | undefined;
    const currentPanel = this.panel;
    const suspend = ancestor < 0 && name === 'help' && this.active !== 'help' && !!currentPanel && drillDown;
    if (ancestor >= 0) {
      const [view, ...discarded] = this.history.splice(ancestor);
      returning = view;
      for (const item of discarded) this.closeSuspended(item);
      focus ??= returning.focus;
    } else if (this.active && currentPanel && this.active !== name && drillDown) {
      this.history.push({ name: this.active, focus: previouslyFocused ?? undefined,
        scrollTop: currentPanel.scrollTop, suspended: suspend });
    }
    if (this.active !== name) this.hideActive(suspend);
    this.active = name;
    this.backgrounds.forEach(background => { background.inert = true; });
    const panel = this.panels[name];
    panel.hidden = false;
    panel.dispatchEvent(new Event(returning?.suspended ? 'skimmer:restore' : 'skimmer:open'));
    this.focus(panel, focus, returning?.scrollTop);
  }

  public close(): void {
    const parent = this.history.at(-1);
    if (parent) this.open(parent.name);
    else this.clear(true);
  }

  public clear(restoreFocus = false): void {
    this.hideActive();
    this.active = undefined;
    for (const view of this.history) this.closeSuspended(view);
    this.history.length = 0;
    this.backgrounds.forEach(background => { background.inert = false; });
    if (restoreFocus && this.opener?.getClientRects().length) this.opener.focus({ preventScroll: true });
    this.opener = undefined;
  }

  private hideActive(suspend = false): void {
    const panel = this.panel;
    if (!panel) return;
    panel.hidden = true;
    panel.dispatchEvent(new Event(suspend ? 'skimmer:suspend' : 'skimmer:close'));
  }

  private closeSuspended(view: View): void {
    if (view.suspended) this.panels[view.name].dispatchEvent(new Event('skimmer:close'));
  }

  private focus(panel: HTMLElement, preferred?: HTMLElement, scrollTop?: number): void {
    const target = preferred?.getClientRects().length
      ? preferred
      : panel.querySelector<HTMLElement>('[data-panel-focus]:not([hidden])');
    target?.focus({ preventScroll: true });
    if (scrollTop === undefined) target?.scrollIntoView({ block: target.matches('h3') ? 'start' : 'nearest', inline: 'nearest' });
    else panel.scrollTop = scrollTop;
  }
}
