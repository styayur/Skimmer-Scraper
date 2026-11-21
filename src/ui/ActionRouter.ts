import type { GameAction } from '../flight/input';
import { OverlayManager, type Overlay } from './OverlayManager';

type Mode = 'title' | 'running' | 'paused' | 'failed';

interface Actions {
  mode(): Mode;
  available(): boolean;
  pause(): void;
  resume(): void;
  start(): void;
  title(): void;
  camera(): void;
}

const focusable = 'button:not(:disabled), a[href], summary, select:not(:disabled), input:not([type=file]):not(:disabled), textarea:not(:disabled)';
const panels = { rules: 'rules', world: 'world', library: 'library', help: 'help', menu: 'menu' } as const;

export class ActionRouter {
  private resumeOnClose = false;
  private readonly resumeButton = document.getElementById('pause-resume')!;
  private readonly titleButton = document.getElementById('pause-menu')!;
  private readonly menuTitle = document.getElementById('quick-title')!;

  public constructor(private readonly overlays: OverlayManager, private readonly actions: Actions) {
    document.getElementById('app')!.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLElement>('[data-action], [data-help-section]');
      if (!target) return;
      event.preventDefault();
      const section = target.dataset.helpSection;
      if (section) this.open('help', true, document.getElementById(section) ?? undefined);
      else this.route(target.dataset.action as GameAction, true);
    });
  }

  public clear(): void {
    this.resumeOnClose = false;
    this.overlays.clear();
  }

  public route = (action: GameAction, fromPanel = false): boolean => {
    if (!this.actions.available()) return false;
    const mode = this.actions.mode();
    const current = this.overlays.current;
    if (action === 'close' || action === 'pause' || action === 'back') {
      if (current) {
        this.overlays.close();
        if (!this.overlays.current && this.resumeOnClose) {
          this.resumeOnClose = false;
          this.actions.resume();
        }
      } else if (action !== 'back') {
        if (mode === 'paused') this.actions.resume();
        else this.open('menu');
      }
      return true;
    }
    if (Object.hasOwn(panels, action)) {
      const name = panels[action as keyof typeof panels];
      if (current === name && !fromPanel) return this.route('close');
      this.open(name, name !== 'menu' && (fromPanel || current === 'menu'));
      return true;
    }
    if (action === 'title') {
      this.actions.title();
      return true;
    }
    if (action.startsWith('navigate-') || action === 'confirm') {
      this.navigate(action, current, mode);
      return true;
    }
    if (action === 'camera' && (!current || current === 'menu')) {
      this.actions.camera();
      return true;
    }
    if (!current && (action === 'start' || action === 'retry')) {
      if (mode === 'title' || mode === 'failed' || action === 'retry') this.actions.start();
      return true;
    }
    return false;
  };

  private open(name: Overlay, drillDown = false, focus?: HTMLElement): void {
    if (!this.actions.available()) return;
    const mode = this.actions.mode();
    if (mode === 'running') {
      this.resumeOnClose = true;
      this.actions.pause();
    }
    this.resumeButton.hidden = mode !== 'running' && mode !== 'paused';
    this.titleButton.hidden = mode === 'title';
    this.menuTitle.textContent = this.resumeButton.hidden ? '游戏菜单' : '飞行已暂停';
    this.overlays.open(name, drillDown, focus);
  }

  private navigate(action: GameAction, current: Overlay | undefined, mode: Mode): void {
    const root = this.overlays.panel ?? document.getElementById(mode === 'failed' ? 'fail-screen' : 'title-screen')!;
    if (!current && mode !== 'title' && mode !== 'failed') return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(focusable)).filter(item => {
      const closedGroup = item.closest('details:not([open])');
      return item.getClientRects().length > 0 && !item.closest('[inert]')
        && (!closedGroup || item === closedGroup.querySelector(':scope > summary'));
    });
    const focused = document.activeElement as HTMLElement | null;
    const index = focused ? items.indexOf(focused) : -1;
    if (action === 'confirm') {
      const target = index >= 0 ? items[index] : items[0];
      if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'number')) {
        this.adjust(target, 1);
      } else {
        target?.click();
      }
      return;
    }
    const delta = action === 'navigate-up' || action === 'navigate-left' ? -1 : 1;
    if (action === 'navigate-left' || action === 'navigate-right') {
      if (focused instanceof HTMLSelectElement || (focused instanceof HTMLInputElement && focused.type === 'number')) {
        this.adjust(focused, delta);
        return;
      }
    }
    const next = items[index < 0 ? 0 : (index + delta + items.length) % items.length];
    next?.focus({ preventScroll: true });
    next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private adjust(field: HTMLSelectElement | HTMLInputElement, delta: number): void {
    const before = field.value;
    if (field instanceof HTMLSelectElement) {
      for (let i = field.selectedIndex + delta; i >= 0 && i < field.length; i += delta) {
        if (field.options[i].disabled) continue;
        field.selectedIndex = i;
        break;
      }
    } else if (delta > 0) field.stepUp();
    else field.stepDown();
    if (field.value !== before) {
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}
