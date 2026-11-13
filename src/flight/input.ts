import type { FlightInput } from './flightModel';
import { NEUTRAL_INPUT } from './flightModel';

export type GameAction =
  | 'start'
  | 'retry'
  | 'library'
  | 'close'
  | 'mute'
  | 'camera';

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
  private readonly actionListeners = new Set<(action: GameAction) => void>();
  private readonly handledCodes = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyR', 'KeyM', 'Escape', 'Enter',
  ]);

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

  public onAction(listener: (action: GameAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  private emit(action: GameAction): void {
    for (const listener of this.actionListeners) listener(action);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.handledCodes.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.pressed.add(event.code);

    if (event.code === 'Enter') this.emit('start');
    if (event.code === 'KeyR') this.emit('retry');
    if (event.code === 'KeyM') this.emit('library');
    if (event.code === 'KeyC') this.emit('camera');
    if (event.code === 'Escape') this.emit('close');
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
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
