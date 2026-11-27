import type { FlightInput } from './flightModel';
import { NEUTRAL_INPUT } from './flightModel';

export type GameAction =
  | 'start'
  | 'retry'
  | 'library'
  | 'close'
  | 'glide'
  | 'camera'
  | 'pause'
  | 'menu'
  | 'title'
  | 'rules'
  | 'world'
  | 'help'
  | 'radio'
  | 'voice-start'
  | 'voice-stop'
  | 'voice-cancel'
  | 'confirm'
  | 'back'
  | 'navigate-up'
  | 'navigate-down'
  | 'navigate-left'
  | 'navigate-right';

const shortcuts = new Map<string, GameAction>([
  ['Enter', 'start'], ['KeyR', 'retry'], ['KeyM', 'library'], ['KeyC', 'camera'],
  ['Escape', 'close'], ['KeyF', 'rules'], ['KeyG', 'world'], ['KeyH', 'help'], ['KeyT', 'radio'],
]);
const flightCodes = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);

export interface InputSource {
  sample(timeSeconds: number): FlightInput;
  reset(): void;
}

const keyAxis = (pressed: Set<string>, positive: string[], negative: string[]): number => {
  const p = positive.some((key) => pressed.has(key)) ? 1 : 0;
  const n = negative.some((key) => pressed.has(key)) ? 1 : 0;
  return p - n;
};

export class KeyboardInputSource implements InputSource {
  private readonly pressed = new Set<string>();
  private enabled = true;
  private voiceHeld = false;
  private actionListener?: (action: GameAction) => boolean;

  public constructor(target: Window = window) {
    target.addEventListener('keydown', this.handleKeyDown, { passive: false });
    target.addEventListener('keyup', this.handleKeyUp);
    target.addEventListener('blur', this.reset);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  public reset = (): void => {
    this.pressed.clear();
    if (this.voiceHeld) {
      this.voiceHeld = false;
      this.actionListener?.('voice-cancel');
    }
  };

  public sample(): FlightInput {
    if (!this.enabled) return { ...NEUTRAL_INPUT };

    return {
      pitch: keyAxis(this.pressed, ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      roll: keyAxis(this.pressed, ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
      yaw: keyAxis(this.pressed, ['KeyQ'], ['KeyE']),
      boost: this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'),
    };
  }

  public onAction(listener: (action: GameAction) => boolean): void {
    this.actionListener = listener;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (event.code !== 'Escape' && target?.closest('input, select, textarea, [contenteditable], [role="textbox"]')) return;
    if (event.code === 'Enter' && target?.closest('button, summary, a[href]')) return;
    if (event.code === 'KeyV' && this.enabled) {
      if (!event.repeat) this.voiceHeld = this.actionListener?.('voice-start') ?? false;
      if (this.voiceHeld) event.preventDefault();
      return;
    }
    if (event.code === 'Space' && this.enabled && !target?.closest('button, summary, a[href]')) {
      if (!event.repeat && this.actionListener?.('glide')) event.preventDefault();
      return;
    }
    const action = shortcuts.get(event.code);
    if (action && !event.repeat && this.actionListener?.(action)) {
      event.preventDefault();
    } else if (this.enabled && flightCodes.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
    if (event.code === 'KeyV' && this.voiceHeld) {
      this.voiceHeld = false;
      this.actionListener?.('voice-stop');
    }
  };
}

/**
 * Deterministic flight input for screenshots, demos and regression tests. It never reads
 * wall-clock time; the owning fixed-step loop supplies simulation time.
 */
export class ScriptedInputSource implements InputSource {
  public constructor(
    private readonly script: (timeSeconds: number) => FlightInput,
    private readonly loopSeconds = 14,
  ) {}

  public sample(timeSeconds: number): FlightInput {
    return this.script(timeSeconds % this.loopSeconds);
  }

  public reset(): void {}
}

export const demoInput = (time: number): FlightInput => {
  if (time < 2.2) return { ...NEUTRAL_INPUT };
  if (time < 2.8) return { pitch: 0, roll: 0.62, yaw: 0, boost: false };
  if (time < 3.6) return { pitch: 0.18, roll: 0.35, yaw: 0, boost: false };
  if (time < 5.2) return { pitch: -0.08, roll: -0.35, yaw: 0, boost: true };
  if (time < 6.0) return { pitch: 0, roll: 0.45, yaw: 0, boost: false };
  if (time < 7.0) return { pitch: 0.1, roll: 0, yaw: 0, boost: false };
  return { ...NEUTRAL_INPUT };
};
